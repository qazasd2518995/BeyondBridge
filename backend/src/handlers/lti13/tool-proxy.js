/**
 * LTI 1.3 Tool Proxy - 進度同步端點
 * BeyondBridge Education Platform
 *
 * 代理外部 LTI Tool 的進度更新
 * 將進度轉換為 AGS 格式的成績
 */

const express = require('express');
const router = express.Router();
const { getItem, putItem, updateItem, query } = require('../../utils/db');
const { generateId } = require('../../utils/db');
const { invalidateGradebookSnapshots } = require('../../utils/gradebook-snapshots');
const { syncLearningPathCourseStatus } = require('../../utils/learning-path-progress');

function clampProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

async function syncCourseProgress(data) {
  const {
    courseId,
    userId,
    activityId,
    progress,
    completed,
    timestamp
  } = data;

  if (!courseId || !userId) return null;

  const [course, courseProgress] = await Promise.all([
    getItem(`COURSE#${courseId}`, 'META'),
    getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`)
  ]);

  if (!course || !courseProgress) {
    return null;
  }

  const totalActivities = Math.max(1, Number(course?.stats?.totalActivities) || 1);
  const now = timestamp || new Date().toISOString();
  const progressMap = { ...(courseProgress.activityProgressMap || {}) };
  const completedActivities = new Set(courseProgress.completedActivities || []);
  const accessMap = { ...(courseProgress.activityAccessMap || {}) };

  if (activityId) {
    progressMap[activityId] = Math.max(progressMap[activityId] || 0, clampProgress(progress));
    if (!accessMap[activityId]) {
      accessMap[activityId] = now;
    }
    if (completed) {
      progressMap[activityId] = 100;
      completedActivities.add(activityId);
    }
  }

  const trackedActivityIds = new Set(Object.keys(progressMap));
  const fullyCompletedCount = [...completedActivities].filter(id => !trackedActivityIds.has(id)).length;
  const weightedProgress = Object.values(progressMap)
    .reduce((sum, value) => sum + (clampProgress(value) / 100), 0);
  const progressPercentage = Math.min(100, Math.round(((fullyCompletedCount + weightedProgress) / totalActivities) * 100));

  const updates = {
    activityProgressMap: progressMap,
    activityAccessMap: accessMap,
    progressPercentage,
    lastAccessedAt: now,
    updatedAt: now
  };

  if (activityId && completed) {
    updates.completedActivities = [...completedActivities];
  }

  if ((updates.completedActivities || courseProgress.completedActivities || []).length >= totalActivities) {
    updates.status = 'completed';
    updates.completedAt = courseProgress.completedAt || now;
  } else if (courseProgress.status === 'completed' && progressPercentage < 100) {
    updates.status = 'in_progress';
    updates.completedAt = null;
  }

  const updatedProgress = await updateItem(`USER#${userId}`, `PROG#COURSE#${courseId}`, updates);

  await syncLearningPathCourseStatus({
    userId,
    courseId,
    completed: updatedProgress?.status === 'completed',
    completedAt: updatedProgress?.completedAt || null,
    timestamp: now
  });

  if (activityId) {
    const activities = await query(`COURSE#${courseId}`, { skPrefix: 'ACTIVITY#' });
    const activity = activities.find(item => item.activityId === activityId);
    if (activity) {
      const nextStats = {
        ...(activity.stats || {}),
        views: activity['stats.views'] ?? activity.stats?.views ?? 0,
        completions: activity['stats.completions'] ?? activity.stats?.completions ?? 0
      };
      let shouldPersistActivity = false;

      if (!courseProgress.activityAccessMap?.[activityId]) {
        nextStats.views += 1;
        shouldPersistActivity = true;
      }
      if (courseProgress.activityAccessMap?.[activityId] && nextStats.views === 0) {
        nextStats.views = 1;
        shouldPersistActivity = true;
      }
      if (completed && !(courseProgress.completedActivities || []).includes(activityId)) {
        nextStats.completions += 1;
        shouldPersistActivity = true;
      }
      if (activity['stats.views'] !== undefined || activity['stats.completions'] !== undefined) {
        shouldPersistActivity = true;
      }

      if (shouldPersistActivity) {
        const cleanedActivity = {
          ...activity,
          stats: nextStats,
          updatedAt: now
        };
        delete cleanedActivity['stats.views'];
        delete cleanedActivity['stats.completions'];
        await putItem(cleanedActivity);
      }
    }
  }

  return updatedProgress;
}

/**
 * POST /api/lti/tools/:toolId/progress
 * 接收 Tool 的進度更新
 *
 * 混合模式：Tool 只需回報簡單進度，Platform 負責 AGS 格式轉換
 */
router.post('/tools/:toolId/progress', async (req, res) => {
  try {
    const { toolId } = req.params;
    const {
      sessionId,
      userId,
      type = 'progress',  // progress, completion
      courseId,
      resourceLinkId,
      unit,
      progress,           // 0-100
      score,
      maxScore = 100,
      activityProgress,   // Initialized, Started, InProgress, Submitted, Completed
      gradingProgress,    // FullyGraded, Pending, PendingManual, Failed, NotReady
      details = {},
      timestamp
    } = req.body;

    // 驗證必要參數
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USER_ID',
        message: 'User ID is required'
      });
    }

    // 取得 Tool 資訊
    const tool = await getItem('LTI_TOOL', `TOOL#${toolId}`);

    if (!tool || tool.status === 'deleted') {
      return res.status(404).json({
        success: false,
        error: 'TOOL_NOT_FOUND',
        message: 'Tool not found'
      });
    }

    // 決定分數
    let finalScore = score;
    if (finalScore === undefined && progress !== undefined) {
      // 將進度百分比轉換為分數
      finalScore = Math.round((progress / 100) * maxScore);
    }
    const clampedProgress = clampProgress(progress);
    const effectiveCourseId = courseId || tool.courseId || null;
    const activityId = resourceLinkId || null;
    const isCompleted = type === 'completion' || activityProgress === 'Completed' || clampedProgress >= 100;

    const now = timestamp || new Date().toISOString();

    // 儲存進度記錄
    const progressRecord = {
      PK: `LTI_PROGRESS#${toolId}`,
      SK: `USER#${userId}#${unit || 'default'}#${Date.now()}`,
      entityType: 'LTI_PROGRESS',
      toolId,
      userId,
      sessionId,
      courseId: effectiveCourseId,
      resourceLinkId: activityId,
      type,
      unit,
      progress: clampedProgress,
      score: finalScore,
      maxScore,
      activityProgress: activityProgress || (isCompleted ? 'Completed' : 'InProgress'),
      gradingProgress: gradingProgress || (type === 'completion' ? 'FullyGraded' : 'Pending'),
      details,
      createdAt: now
    };

    await putItem(progressRecord);
    await syncCourseProgress({
      courseId: effectiveCourseId,
      userId,
      activityId,
      progress: clampedProgress,
      completed: isCompleted,
      timestamp: now
    });

    // 如果是完成狀態，更新/建立 AGS 成績記錄
    if (isCompleted) {
      await updateAgsScore({
        toolId,
        userId,
        unit,
        score: finalScore,
        maxScore,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: now
      });
    }

    // 同步到 gradebook（如果有課程關聯）
    if (effectiveCourseId && isCompleted) {
      await syncToGradebook({
        courseId: effectiveCourseId,
        userId,
        toolId,
        toolName: tool.name,
        unit,
        score: finalScore,
        maxScore,
        timestamp: now
      });
      await invalidateGradebookSnapshots(effectiveCourseId);
    }

    res.json({
      success: true,
      message: 'Progress recorded',
      data: {
        recordId: progressRecord.SK,
        score: finalScore,
        maxScore,
        activityProgress: progressRecord.activityProgress,
        gradingProgress: progressRecord.gradingProgress
      }
    });

  } catch (error) {
    console.error('[LTI Proxy] Progress error:', error);
    res.status(500).json({
      success: false,
      error: 'PROGRESS_ERROR',
      message: 'Failed to record progress'
    });
  }
});

/**
 * GET /api/lti/tools/:toolId/progress/:userId
 * 取得用戶的進度記錄
 * 支援 aggregated=true 參數來取得聚合進度
 */
router.get('/tools/:toolId/progress/:userId', async (req, res) => {
  try {
    const { toolId, userId } = req.params;
    const { unit, limit = 50, courseId, aggregated } = req.query;

    let queryOptions = {
      skPrefix: `USER#${userId}#`
    };

    if (unit) {
      queryOptions.skPrefix = `USER#${userId}#${unit}#`;
    }

    const records = await query(`LTI_PROGRESS#${toolId}`, {
      ...queryOptions,
      limit: parseInt(limit),
      scanIndexForward: false // 最新的在前
    });

    // 如果要求聚合進度
    if (aggregated === 'true' || aggregated === '1') {
      // 找出每個 unit 最新的進度記錄
      const latestByUnit = {};
      for (const record of records) {
        const recordUnit = record.unit || 'default';
        if (!latestByUnit[recordUnit] || new Date(record.createdAt) > new Date(latestByUnit[recordUnit].createdAt)) {
          latestByUnit[recordUnit] = record;
        }
      }

      // 聚合所有 details
      const aggregatedProgress = {
        vocabulary: {},
        dialogue: {},
        practice: {},
        statistics: null,
        achievements: null
      };

      for (const record of Object.values(latestByUnit)) {
        if (record.details) {
          if (record.details.vocabulary) {
            aggregatedProgress.vocabulary = { ...aggregatedProgress.vocabulary, ...record.details.vocabulary };
          }
          if (record.details.dialogue) {
            aggregatedProgress.dialogue = { ...aggregatedProgress.dialogue, ...record.details.dialogue };
          }
          if (record.details.practice) {
            aggregatedProgress.practice = { ...aggregatedProgress.practice, ...record.details.practice };
          }
          if (record.details.statistics) {
            aggregatedProgress.statistics = record.details.statistics;
          }
          if (record.details.achievements) {
            aggregatedProgress.achievements = record.details.achievements;
          }
        }
      }

      return res.json({
        success: true,
        progress: aggregatedProgress,
        records: Object.values(latestByUnit)
      });
    }

    // 原始記錄列表
    res.json({
      success: true,
      data: records
    });

  } catch (error) {
    console.error('[LTI Proxy] Get progress error:', error);
    res.status(500).json({
      success: false,
      error: 'GET_PROGRESS_ERROR',
      message: 'Failed to get progress'
    });
  }
});

/**
 * 更新 AGS 成績記錄
 */
async function updateAgsScore(data) {
  const { toolId, userId, unit, score, maxScore, activityProgress, gradingProgress, timestamp } = data;

  // 查找或建立 line item
  const lineitemId = `${toolId}_${unit || 'default'}`;

  const scoreRecord = {
    PK: `LINEITEM#${lineitemId}`,
    SK: `SCORE#${userId}`,
    entityType: 'LTI_SCORE',
    lineitemId,
    toolId,
    userId,
    unit,
    scoreGiven: score,
    scoreMaximum: maxScore,
    activityProgress,
    gradingProgress,
    timestamp,
    updatedAt: new Date().toISOString()
  };

  await putItem(scoreRecord);

  console.log(`[AGS] Score updated: ${userId} - ${score}/${maxScore}`);
  return scoreRecord;
}

/**
 * 同步到 gradebook
 */
async function syncToGradebook(data) {
  const { courseId, userId, toolId, toolName, unit, score, maxScore, timestamp } = data;

  try {
    // 建立 gradebook 記錄
    const gradeId = generateId('grade');
    const gradeRecord = {
      PK: `COURSE#${courseId}`,
      SK: `GRADE#${userId}#${toolId}#${unit || 'default'}`,
      entityType: 'GRADE',
      gradeId,
      courseId,
      userId,
      toolId,
      itemName: `${toolName}${unit ? ' - ' + unit : ''}`,
      itemType: 'lti_external',
      score,
      maxScore,
      percentage: Math.round((score / maxScore) * 100),
      status: 'graded',
      gradedAt: timestamp,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await putItem(gradeRecord);

    console.log(`[Gradebook] Grade synced: ${userId} - ${score}/${maxScore}`);
    return gradeRecord;
  } catch (error) {
    console.error('[Gradebook] Sync error:', error);
    // 不要因為 gradebook 同步失敗而影響主流程
    return null;
  }
}

module.exports = router;
