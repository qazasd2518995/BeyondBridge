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
    const { activityId, completed, timeSpent, currentSectionId } = req.body;

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

    const updates = {
      lastAccessedAt: new Date().toISOString()
    };

    // 更新已完成活動
    if (activityId && completed) {
      const completedActivities = [...(progress.completedActivities || [])];
      if (!completedActivities.includes(activityId)) {
        completedActivities.push(activityId);
      }
      updates.completedActivities = completedActivities;
      updates.progressPercentage = Math.round((completedActivities.length / totalActivities) * 100);

      // 檢查是否完成全部
      if (completedActivities.length >= totalActivities) {
        updates.status = 'completed';
        updates.completedAt = new Date().toISOString();
      }

      // 更新活動完成統計
      const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
      const activity = activities.find(a => a.activityId === activityId);
      if (activity) {
        await db.updateItem(`COURSE#${id}`, activity.SK, {
          'stats.completions': (activity.stats?.completions || 0) + 1
        });
      }
    }

    // 更新當前章節
    if (currentSectionId) {
      updates.currentSectionId = currentSectionId;
    }

    // 更新學習時間
    if (timeSpent) {
      updates.totalTimeSpent = (progress.totalTimeSpent || 0) + timeSpent;
    }

    const updatedProgress = await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, updates);

    await syncLearningPathCourseStatus({
      userId,
      courseId: id,
      completed: updatedProgress?.status === 'completed',
      completedAt: updatedProgress?.completedAt || null,
      timestamp: updates.lastAccessedAt
    });

    // 記錄活動日誌
    await db.logActivity(userId, 'course_progress', 'course', id, {
      unitId: updates.currentUnit,
      progressPercentage: updates.progressPercentage,
      timeSpent: timeSpent || 0
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

    const completedActivities = [...(progress.completedActivities || [])];
    if (!completedActivities.includes(activityId)) {
      completedActivities.push(activityId);
    }

    // 取得課程資訊計算進度
    const course = await db.getItem(`COURSE#${id}`, 'META');
    const totalActivities = course?.stats?.totalActivities || 1;
    const progressPercentage = Math.round((completedActivities.length / totalActivities) * 100);

    const now = new Date().toISOString();
    const updates = {
      completedActivities,
      progressPercentage,
      lastAccessedAt: now
    };

    if (completedActivities.length >= totalActivities) {
      updates.status = 'completed';
      updates.completedAt = now;
    }

    const updatedProgress = await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, updates);

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
        progressPercentage,
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
