/**
 * 進度追蹤
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { syncLearningPathCourseStatus } = require('../../utils/learning-path-progress');

// ==================== 進度追蹤 ====================

function clampProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function cloneObjectMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

function toPositiveSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function calculateProgressPercentage(totalActivities, completedActivities, progressMap) {
  const safeTotalActivities = Math.max(1, Number(totalActivities) || 1);
  const trackedActivityIds = new Set(Object.keys(progressMap || {}));
  const fullyCompletedCount = [...completedActivities].filter(id => !trackedActivityIds.has(id)).length;
  const weightedProgress = Object.values(progressMap || {})
    .reduce((sum, value) => sum + (clampProgress(value) / 100), 0);

  return Math.min(100, Math.round(((fullyCompletedCount + weightedProgress) / safeTotalActivities) * 100));
}

function buildCourseProgressUpdates(progress, {
  activityId,
  completed = false,
  timeSpent = 0,
  currentSectionId,
  activityProgress,
  totalActivities,
  timestamp
}) {
  const now = timestamp || new Date().toISOString();
  const completedActivities = new Set(Array.isArray(progress?.completedActivities) ? progress.completedActivities : []);
  const progressMap = cloneObjectMap(progress?.activityProgressMap);
  const accessMap = cloneObjectMap(progress?.activityAccessMap);
  const timeMap = cloneObjectMap(progress?.activityTimeMap);
  const safeTimeSpent = toPositiveSeconds(timeSpent);
  const safeActivityProgress = activityProgress === undefined ? null : clampProgress(activityProgress);

  const updates = {
    lastAccessedAt: now,
    updatedAt: now
  };

  if (activityId) {
    accessMap[activityId] = now;
    updates.activityAccessMap = accessMap;
  }

  if (activityId && safeActivityProgress !== null) {
    progressMap[activityId] = Math.max(clampProgress(progressMap[activityId]), safeActivityProgress);
  }

  if (activityId && safeTimeSpent > 0) {
    timeMap[activityId] = toPositiveSeconds(timeMap[activityId]) + safeTimeSpent;
    updates.activityTimeMap = timeMap;
  }

  if (safeTimeSpent > 0) {
    updates.totalTimeSpent = toPositiveSeconds(progress?.totalTimeSpent) + safeTimeSpent;
  }

  if (activityId && completed) {
    progressMap[activityId] = 100;
    completedActivities.add(activityId);
  }

  if (Object.keys(progressMap).length > 0) {
    updates.activityProgressMap = progressMap;
  }

  if (completedActivities.size > 0 || Array.isArray(progress?.completedActivities)) {
    updates.completedActivities = [...completedActivities];
  }

  if (currentSectionId) {
    updates.currentSectionId = currentSectionId;
  }

  const progressPercentage = calculateProgressPercentage(totalActivities, completedActivities, progressMap);
  updates.progressPercentage = progressPercentage;

  if (progressPercentage >= 100 || completedActivities.size >= Math.max(1, Number(totalActivities) || 1)) {
    updates.status = 'completed';
    updates.completedAt = progress?.completedAt || now;
  } else if (progress?.status === 'completed' && progressPercentage < 100) {
    updates.status = 'in_progress';
    updates.completedAt = null;
  } else if ((activityId || safeTimeSpent > 0 || currentSectionId) && !progress?.status) {
    updates.status = 'in_progress';
  }

  return {
    updates,
    now,
    safeTimeSpent
  };
}

/**
 * GET /api/courses/:id/progress
 * 取得用戶的課程進度
 */
router.get('/:id/progress', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    delete progress.PK;
    delete progress.SK;

    res.json({
      success: true,
      data: progress
    });

  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得進度失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/progress
 * 更新課程進度
 */
router.put('/:id/progress', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      activityId,
      completed,
      timeSpent,
      currentSectionId,
      activityProgress
    } = req.body;

    // 取得現有進度
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 取得課程資訊
    const course = await db.getItem(`COURSE#${id}`, 'META');
    const totalActivities = course?.stats?.totalActivities || 1;
    const alreadyCompleted = Array.isArray(progress.completedActivities) && progress.completedActivities.includes(activityId);
    const { updates, now, safeTimeSpent } = buildCourseProgressUpdates(progress, {
      activityId,
      completed,
      timeSpent,
      currentSectionId,
      activityProgress,
      totalActivities
    });

    if (activityId && completed && !alreadyCompleted) {
      const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
      const activity = activities.find(a => a.activityId === activityId);
      if (activity) {
        await db.updateItem(`COURSE#${id}`, activity.SK, {
          'stats.completions': (activity.stats?.completions || 0) + 1
        });
      }
    }

    const updatedProgress = await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, updates);

    await syncLearningPathCourseStatus({
      userId,
      courseId: id,
      completed: updatedProgress?.status === 'completed',
      completedAt: updatedProgress?.completedAt || null,
      timestamp: now
    });

    // 記錄活動日誌
    await db.logActivity(userId, 'course_progress', 'course', id, {
      unitId: updates.currentUnit,
      progressPercentage: updates.progressPercentage,
      timeSpent: safeTimeSpent,
      activityId: activityId || null
    });

    delete updatedProgress.PK;
    delete updatedProgress.SK;

    res.json({
      success: true,
      message: '進度已更新',
      data: updatedProgress
    });

  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新進度失敗'
    });
  }
});

/**
 * POST /api/courses/:id/activities/:activityId/complete
 * 標記活動完成
 */
router.post('/:id/activities/:activityId/complete', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const userId = req.user.userId;

    // 取得現有進度
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 取得課程資訊計算進度
    const course = await db.getItem(`COURSE#${id}`, 'META');
    const totalActivities = course?.stats?.totalActivities || 1;
    const alreadyCompleted = Array.isArray(progress.completedActivities) && progress.completedActivities.includes(activityId);
    const { updates, now } = buildCourseProgressUpdates(progress, {
      activityId,
      completed: true,
      totalActivities
    });

    const updatedProgress = await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, updates);

    if (!alreadyCompleted) {
      const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
      const activity = activities.find(item => item.activityId === activityId);
      if (activity) {
        await db.updateItem(`COURSE#${id}`, activity.SK, {
          'stats.completions': (activity.stats?.completions || 0) + 1
        });
      }
    }

    await syncLearningPathCourseStatus({
      userId,
      courseId: id,
      completed: updatedProgress?.status === 'completed',
      completedAt: updatedProgress?.completedAt || null,
      timestamp: now
    });

    res.json({
      success: true,
      message: '活動已標記完成',
      data: {
        activityId,
        progressPercentage: updates.progressPercentage,
        completed: true
      }
    });

  } catch (error) {
    console.error('Complete activity error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '標記完成失敗'
    });
  }
});

module.exports = router;
