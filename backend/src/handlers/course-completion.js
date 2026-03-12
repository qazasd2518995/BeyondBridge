/**
 * 課程完成條件 API
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { canManageCourse } = require('../utils/course-access');

const TEACHING_ROLES = new Set([
  'manager',
  'coursecreator',
  'educator',
  'trainer',
  'creator',
  'teacher',
  'assistant'
]);

const CRITERION_TYPES = {
  ACTIVITY_COMPLETION: 'ACTIVITY_COMPLETION',
  GRADE: 'GRADE',
  DURATION: 'DURATION',
  SELF_COMPLETION: 'SELF_COMPLETION',
  MANUAL: 'MANUAL'
};

function isTeachingUser(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return TEACHING_ROLES.has(user.role);
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCriterion(raw, index) {
  const type = String(raw.type || '').toUpperCase();
  const criterion = {
    id: raw.id || raw.criteriaId || db.generateId('crit'),
    type: CRITERION_TYPES[type] ? type : CRITERION_TYPES.ACTIVITY_COMPLETION,
    description: raw.description || '',
    required: raw.required !== false
  };

  if (criterion.type === CRITERION_TYPES.GRADE) {
    criterion.minGrade = parseInteger(raw.minGrade, 60, { min: 0, max: 100 });
  } else if (criterion.type === CRITERION_TYPES.DURATION) {
    criterion.minMinutes = parseInteger(raw.minMinutes, 30, { min: 1 });
  } else if (criterion.type === CRITERION_TYPES.ACTIVITY_COMPLETION) {
    criterion.activityIds = Array.isArray(raw.activityIds) ? raw.activityIds : [];
  }

  if (!criterion.description) {
    if (criterion.type === CRITERION_TYPES.GRADE) {
      criterion.description = `成績至少 ${criterion.minGrade} 分`;
    } else if (criterion.type === CRITERION_TYPES.DURATION) {
      criterion.description = `學習時數至少 ${criterion.minMinutes} 分鐘`;
    } else if (criterion.type === CRITERION_TYPES.SELF_COMPLETION) {
      criterion.description = '學生自行標記完成';
    } else if (criterion.type === CRITERION_TYPES.MANUAL) {
      criterion.description = '教師手動確認完成';
    } else {
      criterion.description = `完成指定活動（條件 ${index + 1}）`;
    }
  }

  return criterion;
}

function defaultCompletionSettings(courseId) {
  return {
    courseId,
    enabled: false,
    aggregation: 'all',
    criteria: [],
    createdAt: null,
    updatedAt: null
  };
}

async function getCourse(courseId) {
  return db.getItem(`COURSE#${courseId}`, 'META');
}

async function getCompletionSettings(courseId) {
  const item = await db.getItem(`COURSE#${courseId}`, 'COMPLETION_SETTINGS');
  if (!item) return defaultCompletionSettings(courseId);

  const criteria = Array.isArray(item.criteria)
    ? item.criteria.map((criterion, idx) => normalizeCriterion(criterion, idx))
    : [];

  return {
    courseId,
    enabled: item.enabled !== false,
    aggregation: item.aggregation === 'any' ? 'any' : 'all',
    criteria,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

async function getCompletionRecord(courseId, userId) {
  return db.getItem(`USER#${userId}`, `COURSE_COMPLETION#${courseId}`);
}

async function getCourseActivities(courseId) {
  const activities = await db.query(`COURSE#${courseId}`, { skPrefix: 'ACTIVITY#' });
  return activities.filter(activity => activity.entityType && activity.entityType.includes('ACTIVITY'));
}

function evaluateCompletionStatus({ settings, progress, activities, completionRecord }) {
  const criteria = settings.criteria || [];
  const completedActivities = new Set(progress?.completedActivities || []);
  const grade = parseInteger(progress?.overallGrade, 0, { min: 0, max: 100 });
  const minutes = parseInteger(progress?.totalTimeSpent, 0, { min: 0 });
  const criteriaStatus = [];

  for (const criterion of criteria) {
    if (criterion.type === CRITERION_TYPES.ACTIVITY_COMPLETION) {
      const targetActivityIds = Array.isArray(criterion.activityIds) && criterion.activityIds.length > 0
        ? criterion.activityIds
        : activities.map(activity => activity.activityId).filter(Boolean);

      const total = targetActivityIds.length;
      const done = total === 0
        ? 0
        : targetActivityIds.filter(activityId => completedActivities.has(activityId)).length;
      const completed = total === 0 ? true : done === total;
      const progressPercent = total === 0 ? 100 : Math.round((done / total) * 100);

      criteriaStatus.push({
        id: criterion.id,
        type: criterion.type,
        description: criterion.description,
        completed,
        progress: progressPercent,
        details: total === 0 ? '無活動需完成' : `${done}/${total} 活動完成`
      });
    } else if (criterion.type === CRITERION_TYPES.GRADE) {
      const minGrade = parseInteger(criterion.minGrade, 60, { min: 0, max: 100 });
      const completed = grade >= minGrade;
      const progressPercent = minGrade <= 0 ? 100 : Math.min(100, Math.round((grade / minGrade) * 100));
      criteriaStatus.push({
        id: criterion.id,
        type: criterion.type,
        description: criterion.description,
        completed,
        progress: progressPercent,
        details: `目前成績 ${grade} / 門檻 ${minGrade}`
      });
    } else if (criterion.type === CRITERION_TYPES.DURATION) {
      const minMinutes = parseInteger(criterion.minMinutes, 30, { min: 1 });
      const completed = minutes >= minMinutes;
      const progressPercent = Math.min(100, Math.round((minutes / minMinutes) * 100));
      criteriaStatus.push({
        id: criterion.id,
        type: criterion.type,
        description: criterion.description,
        completed,
        progress: progressPercent,
        details: `已學習 ${minutes} / ${minMinutes} 分鐘`
      });
    } else if (criterion.type === CRITERION_TYPES.SELF_COMPLETION) {
      const completed = !!completionRecord?.selfMarked || !!completionRecord?.completed;
      criteriaStatus.push({
        id: criterion.id,
        type: criterion.type,
        description: criterion.description,
        completed,
        progress: completed ? 100 : 0,
        details: completed ? '已由學生標記完成' : '尚未由學生標記'
      });
    } else if (criterion.type === CRITERION_TYPES.MANUAL) {
      const completed = !!completionRecord?.manualMarked || !!completionRecord?.completed;
      criteriaStatus.push({
        id: criterion.id,
        type: criterion.type,
        description: criterion.description,
        completed,
        progress: completed ? 100 : 0,
        details: completed ? '已由教師確認完成' : '尚未由教師確認'
      });
    }
  }

  const totalCriteria = criteriaStatus.length;
  const completedCriteria = criteriaStatus.filter(item => item.completed).length;
  const basedOnCriteria = totalCriteria === 0
    ? false
    : (settings.aggregation === 'any' ? completedCriteria > 0 : completedCriteria === totalCriteria);

  const allowSelfCompletion = criteria.some(c => c.type === CRITERION_TYPES.SELF_COMPLETION);
  const completedByRecord = !!completionRecord?.completed;
  const isCompleted = completedByRecord || basedOnCriteria;

  return {
    criteriaStatus,
    totalCriteria,
    completedCriteria,
    allowSelfCompletion,
    isCompleted
  };
}

async function upsertCompletionRecord(courseId, userId, patch) {
  const existing = await getCompletionRecord(courseId, userId);
  const now = new Date().toISOString();
  const merged = {
    PK: `USER#${userId}`,
    SK: `COURSE_COMPLETION#${courseId}`,
    entityType: 'COURSE_COMPLETION_RECORD',
    courseId,
    userId,
    selfMarked: !!existing?.selfMarked,
    manualMarked: !!existing?.manualMarked,
    completed: !!existing?.completed,
    completedAt: existing?.completedAt || null,
    updatedAt: now,
    createdAt: existing?.createdAt || now,
    ...existing,
    ...patch
  };

  if (merged.completed && !merged.completedAt) {
    merged.completedAt = now;
  }
  if (!merged.completed) {
    merged.completedAt = null;
  }

  await db.putItem(merged);
  return merged;
}

async function syncProgressCompletion(courseId, userId, completed) {
  const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`);
  if (!progress) return;

  const updates = {
    status: completed ? 'completed' : (progress.status === 'completed' ? 'in_progress' : progress.status),
    completedAt: completed ? (progress.completedAt || new Date().toISOString()) : null,
    progressPercentage: completed ? 100 : progress.progressPercentage,
    updatedAt: new Date().toISOString()
  };

  await db.updateItem(progress.PK, progress.SK, updates);
}

// ============================================================================
// 課程完成設定
// ============================================================================

router.get('/:courseId/settings', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await getCourse(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    const settings = await getCompletionSettings(courseId);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get completion settings error:', error);
    res.status(500).json({
      success: false,
      message: '取得完成條件設定失敗'
    });
  }
});

router.put('/:courseId/settings', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await getCourse(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: '沒有權限修改此課程完成設定'
      });
    }

    const enabled = req.body.enabled !== false;
    const aggregation = req.body.aggregation === 'any' ? 'any' : 'all';
    const criteriaInput = Array.isArray(req.body.criteria) ? req.body.criteria : [];
    const criteria = criteriaInput.map((criterion, idx) => normalizeCriterion(criterion, idx));
    const now = new Date().toISOString();

    await db.putItem({
      PK: `COURSE#${courseId}`,
      SK: 'COMPLETION_SETTINGS',
      entityType: 'COURSE_COMPLETION_SETTINGS',
      courseId,
      enabled,
      aggregation,
      criteria,
      updatedBy: req.user.userId,
      updatedAt: now,
      createdAt: now
    });

    res.json({
      success: true,
      data: {
        courseId,
        enabled,
        aggregation,
        criteria,
        updatedAt: now
      },
      message: '完成條件設定已更新'
    });
  } catch (error) {
    console.error('Update completion settings error:', error);
    res.status(500).json({
      success: false,
      message: '更新完成條件設定失敗'
    });
  }
});

// ============================================================================
// 學生完成狀態
// ============================================================================

router.get('/:courseId/status', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    const course = await getCourse(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    const [settings, progress, activities, completionRecord] = await Promise.all([
      getCompletionSettings(courseId),
      db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`),
      getCourseActivities(courseId),
      getCompletionRecord(courseId, userId)
    ]);

    const evaluated = evaluateCompletionStatus({
      settings,
      progress,
      activities,
      completionRecord
    });

    const data = {
      courseId,
      userId,
      enabled: settings.enabled,
      aggregation: settings.aggregation,
      isCompleted: settings.enabled ? evaluated.isCompleted : false,
      completedAt: completionRecord?.completedAt || null,
      completedCriteria: settings.enabled ? evaluated.completedCriteria : 0,
      totalCriteria: settings.enabled ? evaluated.totalCriteria : 0,
      criteriaStatus: settings.enabled ? evaluated.criteriaStatus : [],
      allowSelfCompletion: settings.enabled ? evaluated.allowSelfCompletion : false,
      progress: parseInteger(progress?.progressPercentage, 0, { min: 0, max: 100 }),
      lastUpdated: completionRecord?.updatedAt || progress?.updatedAt || new Date().toISOString()
    };

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get completion status error:', error);
    res.status(500).json({
      success: false,
      message: '取得完成狀態失敗'
    });
  }
});

router.post('/:courseId/self-mark', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const course = await getCourse(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    const settings = await getCompletionSettings(courseId);
    if (!settings.enabled) {
      return res.status(400).json({
        success: false,
        message: '課程未啟用完成追蹤'
      });
    }

    const hasSelfCriterion = settings.criteria.some(c => c.type === CRITERION_TYPES.SELF_COMPLETION);
    if (!hasSelfCriterion) {
      return res.status(400).json({
        success: false,
        message: '此課程未啟用學生自我完成標記'
      });
    }

    const completionRecord = await upsertCompletionRecord(courseId, userId, {
      selfMarked: true,
      selfMarkedAt: new Date().toISOString()
    });

    const [progress, activities] = await Promise.all([
      db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`),
      getCourseActivities(courseId)
    ]);

    const evaluated = evaluateCompletionStatus({
      settings,
      progress,
      activities,
      completionRecord
    });

    const finalRecord = await upsertCompletionRecord(courseId, userId, {
      completed: evaluated.isCompleted
    });

    await syncProgressCompletion(courseId, userId, evaluated.isCompleted);

    res.json({
      success: true,
      data: {
        courseId,
        userId,
        selfMarked: true,
        markedAt: finalRecord.selfMarkedAt || new Date().toISOString(),
        completed: finalRecord.completed,
        completedAt: finalRecord.completedAt
      },
      message: '已標記課程為完成'
    });
  } catch (error) {
    console.error('Self mark completion error:', error);
    res.status(500).json({
      success: false,
      message: '標記完成失敗'
    });
  }
});

router.post('/:courseId/manual-mark', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userId, completed } = req.body;
    const course = await getCourse(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: '沒有權限手動標記完成'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '請提供目標 userId'
      });
    }

    const manualCompleted = completed !== false;
    const record = await upsertCompletionRecord(courseId, userId, {
      manualMarked: manualCompleted,
      manualMarkedAt: new Date().toISOString(),
      completed: manualCompleted,
      markedBy: req.user.userId
    });

    await syncProgressCompletion(courseId, userId, manualCompleted);

    res.json({
      success: true,
      data: {
        courseId,
        userId,
        completed: manualCompleted,
        markedBy: req.user.userId,
        markedAt: record.manualMarkedAt,
        completedAt: record.completedAt
      },
      message: manualCompleted ? '已標記為完成' : '已取消完成標記'
    });
  } catch (error) {
    console.error('Manual mark completion error:', error);
    res.status(500).json({
      success: false,
      message: '手動標記失敗'
    });
  }
});

router.get('/:courseId/report', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await getCourse(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: '沒有權限查看完成報告'
      });
    }

    const [settings, progressList] = await Promise.all([
      getCompletionSettings(courseId),
      db.scan({
        filter: {
          expression: 'entityType = :type AND courseId = :cid',
          values: { ':type': 'COURSE_PROGRESS', ':cid': courseId }
        }
      })
    ]);

    const activities = await getCourseActivities(courseId);
    const students = [];

    for (const progress of progressList) {
      const completionRecord = await getCompletionRecord(courseId, progress.userId);
      const evaluated = evaluateCompletionStatus({
        settings,
        progress,
        activities,
        completionRecord
      });
      const user = await db.getUser(progress.userId) || await db.getAdmin(progress.userId);
      const isCompleted = settings.enabled ? evaluated.isCompleted : (progress.status === 'completed');

      students.push({
        userId: progress.userId,
        displayName: user?.displayName || user?.displayNameZh || progress.userId,
        progress: parseInteger(progress.progressPercentage, 0, { min: 0, max: 100 }),
        isCompleted,
        completedAt: completionRecord?.completedAt || progress.completedAt || null
      });
    }

    const totalStudents = students.length;
    const completedCount = students.filter(student => student.isCompleted).length;
    const inProgressCount = students.filter(student => !student.isCompleted && student.progress > 0).length;
    const notStartedCount = students.filter(student => student.progress === 0).length;
    const averageProgress = totalStudents > 0
      ? Math.round(students.reduce((sum, student) => sum + student.progress, 0) / totalStudents)
      : 0;
    const completionRate = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;

    res.json({
      success: true,
      data: {
        courseId,
        totalStudents,
        completedCount,
        inProgressCount,
        notStartedCount,
        completionRate,
        averageProgress,
        students,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get completion report error:', error);
    res.status(500).json({
      success: false,
      message: '取得完成報告失敗'
    });
  }
});

module.exports = router;
