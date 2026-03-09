/**
 * 課程完成條件系統 (Moodle-style Completion)
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');

/**
 * 完成條件類型
 */
const COMPLETION_CRITERIA_TYPES = {
  ACTIVITY_COMPLETION: 'activity_completion',      // 完成特定活動
  GRADE: 'grade',                                   // 達到特定成績
  DATE: 'date',                                     // 特定日期後
  SELF_COMPLETION: 'self_completion',              // 學生自行標記
  MANUAL: 'manual',                                 // 教師手動標記
  DURATION: 'duration',                            // 學習時間達標
  ROLE: 'role'                                      // 特定角色完成
};

/**
 * 聚合類型
 */
const AGGREGATION_METHODS = {
  ALL: 'all',           // 所有條件都需達成
  ANY: 'any'            // 任一條件達成即可
};

async function getBadgeById(badgeId) {
  if (!badgeId) return null;

  const direct = await db.getItem(`BADGE#${badgeId}`, 'META');
  if (direct && direct.entityType === 'BADGE' && direct.status !== 'deleted') {
    return direct;
  }

  const fallback = await db.scan({
    filter: {
      expression: 'entityType = :type AND badgeId = :bid AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'BADGE', ':bid': badgeId, ':deleted': 'deleted' },
      names: { '#status': 'status' }
    },
    limit: 1
  });

  return fallback[0] || null;
}

function generateCertificateVerifyCode(courseId, userId, issuedAt) {
  const seed = `${courseId}:${userId}:${issuedAt}:${Math.random()}`;
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12).toUpperCase();
}

async function issueCourseCompletionBadge({
  badgeId,
  courseId,
  courseTitle,
  userId,
  issuedBy = 'system',
  source = 'course_completion'
}) {
  if (!badgeId) {
    return { status: 'skipped', reason: 'badge_not_configured' };
  }

  const existingUserBadge = await db.getItem(`USER#${userId}`, `BADGE#${badgeId}`);
  if (existingUserBadge && existingUserBadge.entityType === 'USER_BADGE') {
    return {
      status: 'already_issued',
      badgeId,
      issueId: existingUserBadge.issueId || null,
      issuedAt: existingUserBadge.issuedAt || existingUserBadge.updatedAt || null
    };
  }

  const badge = await getBadgeById(badgeId);
  if (!badge) {
    return { status: 'skipped', reason: 'badge_not_found', badgeId };
  }

  const issuedAt = new Date().toISOString();
  const issueId = db.generateId('issue');

  await db.putItem({
    PK: `BADGE#${badgeId}`,
    SK: `ISSUE#${issuedAt}#${userId}`,
    entityType: 'BADGE_ISSUANCE',
    issueId,
    badgeId,
    userId,
    courseId,
    courseTitle: courseTitle || '',
    issuedBy,
    issuedAt,
    message: '課程完成自動發放',
    type: 'automatic',
    source
  });

  await db.putItem({
    PK: `USER#${userId}`,
    SK: `BADGE#${badgeId}`,
    entityType: 'USER_BADGE',
    issueId,
    badgeId,
    userId,
    courseId,
    courseTitle: courseTitle || '',
    badgeName: badge.name,
    badgeIcon: badge.icon || '🏆',
    issuedBy,
    issuedAt,
    message: '課程完成自動發放',
    updatedAt: issuedAt,
    createdAt: issuedAt,
    source
  });

  if (badge.PK && badge.SK) {
    await db.updateItem(badge.PK, badge.SK, {
      issuedCount: (badge.issuedCount || 0) + 1,
      updatedAt: issuedAt
    });
  }

  return {
    status: 'issued',
    badgeId,
    issueId,
    issuedAt
  };
}

async function issueCourseCompletionCertificate({
  courseId,
  courseTitle,
  userId,
  issuedBy = 'system',
  source = 'course_completion'
}) {
  const certSk = `CERT#COURSE#${courseId}`;
  const existingCertificate = await db.getItem(`USER#${userId}`, certSk);

  if (existingCertificate && existingCertificate.entityType === 'USER_CERTIFICATE') {
    return {
      status: 'already_issued',
      certificateId: existingCertificate.certificateId || null,
      verifyCode: existingCertificate.verifyCode || null,
      issuedAt: existingCertificate.issuedAt || existingCertificate.updatedAt || null
    };
  }

  const issuedAt = new Date().toISOString();
  const certificateId = db.generateId('cert');
  const verifyCode = generateCertificateVerifyCode(courseId, userId, issuedAt);
  const certificateNo = `BB-${issuedAt.slice(0, 10).replace(/-/g, '')}-${verifyCode.slice(0, 6)}`;

  await db.putItem({
    PK: `USER#${userId}`,
    SK: certSk,
    entityType: 'USER_CERTIFICATE',
    certificateId,
    certificateNo,
    userId,
    courseId,
    courseTitle: courseTitle || '',
    issuedBy,
    issuedAt,
    verifyCode,
    status: 'active',
    source,
    updatedAt: issuedAt,
    createdAt: issuedAt
  });

  await db.putItem({
    PK: `COURSE#${courseId}`,
    SK: `CERTIFICATE#${userId}`,
    entityType: 'COURSE_CERTIFICATE',
    certificateId,
    certificateNo,
    userId,
    courseId,
    courseTitle: courseTitle || '',
    issuedBy,
    issuedAt,
    verifyCode,
    status: 'active',
    source,
    updatedAt: issuedAt,
    createdAt: issuedAt
  });

  return {
    status: 'issued',
    certificateId,
    certificateNo,
    verifyCode,
    issuedAt
  };
}

async function issueCourseCompletionRewards({
  completionSettings,
  courseId,
  courseTitle,
  userId,
  issuedBy = 'system',
  source = 'course_completion'
}) {
  const rewards = {
    badge: null,
    certificate: null
  };

  if (completionSettings?.awardBadgeId) {
    try {
      rewards.badge = await issueCourseCompletionBadge({
        badgeId: completionSettings.awardBadgeId,
        courseId,
        courseTitle,
        userId,
        issuedBy,
        source
      });
    } catch (error) {
      console.error('Issue completion badge error:', error);
      rewards.badge = {
        status: 'failed',
        reason: 'badge_issue_failed',
        badgeId: completionSettings.awardBadgeId
      };
    }
  }

  if (completionSettings?.issueCertificate) {
    try {
      rewards.certificate = await issueCourseCompletionCertificate({
        courseId,
        courseTitle,
        userId,
        issuedBy,
        source
      });
    } catch (error) {
      console.error('Issue completion certificate error:', error);
      rewards.certificate = {
        status: 'failed',
        reason: 'certificate_issue_failed'
      };
    }
  }

  return rewards;
}

/**
 * GET /api/courses/:id/completion/settings
 * 取得課程完成設定
 */
router.get('/:id/completion/settings', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 取得完成設定
    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');

    // 取得活動完成條件
    const activityCompletions = await db.query(`COURSE#${id}`, {
      skPrefix: 'ACTIVITY_COMPLETION#'
    });

    res.json({
      success: true,
      data: {
        courseId: id,
        enableCompletion: course.settings?.enableCompletion || false,
        completionSettings: completionSettings || {
          aggregationMethod: 'all',
          criteria: [],
          showCompletionOnFrontPage: true,
          completionMessage: '恭喜您完成此課程！'
        },
        activityCompletions: activityCompletions.map(c => {
          delete c.PK;
          delete c.SK;
          return c;
        })
      }
    });

  } catch (error) {
    console.error('Get completion settings error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得完成設定失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/completion/settings
 * 更新課程完成設定
 */
router.put('/:id/completion/settings', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      enableCompletion,
      aggregationMethod = 'all',
      criteria = [],
      showCompletionOnFrontPage = true,
      completionMessage,
      issueCertificate = false,
      awardBadgeId = null
    } = req.body;

    // 權限檢查
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    const now = new Date().toISOString();

    // 更新課程設定
    await db.updateItem(`COURSE#${id}`, 'META', {
      'settings.enableCompletion': enableCompletion !== false,
      updatedAt: now
    });

    // 儲存或更新完成設定
    const completionSettingsItem = {
      PK: `COURSE#${id}`,
      SK: 'COMPLETION_SETTINGS',
      entityType: 'COURSE_COMPLETION_SETTINGS',

      courseId: id,
      aggregationMethod,
      criteria: criteria.map((c, index) => ({
        ...c,
        criteriaId: c.criteriaId || db.generateId('crit'),
        order: index + 1
      })),
      showCompletionOnFrontPage,
      completionMessage: completionMessage || '恭喜您完成此課程！',
      issueCertificate,
      awardBadgeId,

      updatedBy: userId,
      updatedAt: now
    };

    await db.putItem(completionSettingsItem);

    delete completionSettingsItem.PK;
    delete completionSettingsItem.SK;

    res.json({
      success: true,
      message: '完成設定已更新',
      data: completionSettingsItem
    });

  } catch (error) {
    console.error('Update completion settings error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新完成設定失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/activities/:activityId/completion
 * 設定活動完成條件
 */
router.put('/:id/activities/:activityId/completion', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const userId = req.user.userId;
    const {
      completionType = 'manual',  // manual, view, grade, submit
      gradeToPass = null,
      requiredViews = null,
      expectCompleteBy = null
    } = req.body;

    // 權限檢查
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    const now = new Date().toISOString();

    // 儲存活動完成設定
    const activityCompletionItem = {
      PK: `COURSE#${id}`,
      SK: `ACTIVITY_COMPLETION#${activityId}`,
      entityType: 'ACTIVITY_COMPLETION_SETTINGS',

      courseId: id,
      activityId,
      completionType,
      gradeToPass: gradeToPass ? parseFloat(gradeToPass) : null,
      requiredViews: requiredViews ? parseInt(requiredViews) : null,
      expectCompleteBy,

      updatedBy: userId,
      updatedAt: now
    };

    await db.putItem(activityCompletionItem);

    // 同時更新活動本身的 completion 欄位
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
    const activity = activities.find(a => a.activityId === activityId);
    if (activity) {
      await db.updateItem(`COURSE#${id}`, activity.SK, {
        completion: {
          type: completionType,
          gradeToPass,
          requiredViews,
          expectCompleteBy
        },
        updatedAt: now
      });
    }

    delete activityCompletionItem.PK;
    delete activityCompletionItem.SK;

    res.json({
      success: true,
      message: '活動完成設定已更新',
      data: activityCompletionItem
    });

  } catch (error) {
    console.error('Update activity completion error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新活動完成設定失敗'
    });
  }
});

/**
 * GET /api/courses/:id/completion/status
 * 取得用戶的課程完成狀態
 */
router.get('/:id/completion/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程和完成設定
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 取得活動完成設定
    const activityCompletions = await db.query(`COURSE#${id}`, {
      skPrefix: 'ACTIVITY_COMPLETION#'
    });

    // 取得所有活動
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });

    // 計算每個活動的完成狀態
    const activityStatuses = activities.map(activity => {
      const completionSetting = activityCompletions.find(c => c.activityId === activity.activityId);
      const isCompleted = (progress.completedActivities || []).includes(activity.activityId);

      return {
        activityId: activity.activityId,
        title: activity.title,
        type: activity.type,
        completionType: completionSetting?.completionType || activity.completion?.type || 'manual',
        gradeToPass: completionSetting?.gradeToPass || activity.completion?.gradeToPass,
        isCompleted,
        completedAt: isCompleted ? progress.lastAccessedAt : null
      };
    });

    // 檢查課程完成條件
    const criteria = completionSettings?.criteria || [];
    const criteriaStatuses = await Promise.all(criteria.map(async (criterion) => {
      let isMet = false;

      switch (criterion.type) {
        case COMPLETION_CRITERIA_TYPES.ACTIVITY_COMPLETION:
          // 檢查特定活動是否完成
          if (criterion.activityIds && criterion.activityIds.length > 0) {
            isMet = criterion.activityIds.every(actId =>
              (progress.completedActivities || []).includes(actId)
            );
          } else {
            // 所有活動都需完成
            isMet = activityStatuses.every(a => a.isCompleted);
          }
          break;

        case COMPLETION_CRITERIA_TYPES.GRADE:
          // 檢查成績
          const gradeRequired = criterion.gradeToPass || 60;
          isMet = (progress.overallGrade || 0) >= gradeRequired;
          break;

        case COMPLETION_CRITERIA_TYPES.DATE:
          // 檢查日期
          if (criterion.dateAfter) {
            isMet = new Date() >= new Date(criterion.dateAfter);
          }
          break;

        case COMPLETION_CRITERIA_TYPES.DURATION:
          // 檢查學習時間
          if (criterion.requiredDuration) {
            isMet = (progress.totalTimeSpent || 0) >= criterion.requiredDuration;
          }
          break;

        case COMPLETION_CRITERIA_TYPES.SELF_COMPLETION:
          // 學生自行標記
          isMet = progress.selfMarkedComplete === true;
          break;

        case COMPLETION_CRITERIA_TYPES.MANUAL:
          // 教師手動標記
          isMet = progress.manuallyCompleted === true;
          break;

        default:
          isMet = false;
      }

      return {
        ...criterion,
        isMet
      };
    }));

    // 計算整體完成狀態
    let isCourseComplete = false;
    const aggregationMethod = completionSettings?.aggregationMethod || 'all';

    if (criteriaStatuses.length > 0) {
      if (aggregationMethod === 'all') {
        isCourseComplete = criteriaStatuses.every(c => c.isMet);
      } else {
        isCourseComplete = criteriaStatuses.some(c => c.isMet);
      }
    } else {
      // 沒有設定條件時，依據活動完成率
      isCourseComplete = progress.status === 'completed';
    }

    res.json({
      success: true,
      data: {
        courseId: id,
        userId,
        isComplete: isCourseComplete,
        completedAt: progress.completedAt,
        progressPercentage: progress.progressPercentage || 0,
        overallGrade: progress.overallGrade,
        totalTimeSpent: progress.totalTimeSpent || 0,
        aggregationMethod,
        criteria: criteriaStatuses,
        activities: activityStatuses,
        completionMessage: isCourseComplete ? (completionSettings?.completionMessage || '恭喜您完成此課程！') : null
      }
    });

  } catch (error) {
    console.error('Get completion status error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得完成狀態失敗'
    });
  }
});

/**
 * POST /api/courses/:id/completion/self-mark
 * 學生自行標記課程完成
 */
router.post('/:id/completion/self-mark', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 檢查是否允許自行標記
    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');
    const allowsSelfMark = completionSettings?.criteria?.some(c =>
      c.type === COMPLETION_CRITERIA_TYPES.SELF_COMPLETION
    );

    if (!allowsSelfMark) {
      return res.status(403).json({
        success: false,
        error: 'SELF_MARK_NOT_ALLOWED',
        message: '此課程不允許自行標記完成'
      });
    }

    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 更新進度
    const now = new Date().toISOString();
    await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, {
      selfMarkedComplete: true,
      selfMarkedAt: now,
      status: 'completed',
      completedAt: now,
      updatedAt: now
    });

    const rewards = await issueCourseCompletionRewards({
      completionSettings,
      courseId: id,
      courseTitle: course.title,
      userId,
      issuedBy: userId,
      source: 'self_mark_completion'
    });

    res.json({
      success: true,
      message: '已標記課程完成',
      data: {
        courseId: id,
        completedAt: now,
        rewards
      }
    });

  } catch (error) {
    console.error('Self mark complete error:', error);
    res.status(500).json({
      success: false,
      error: 'MARK_FAILED',
      message: '標記完成失敗'
    });
  }
});

/**
 * POST /api/courses/:id/completion/manual/:targetUserId
 * 教師手動標記學生完成（或撤銷）
 */
router.post('/:id/completion/manual/:targetUserId', authMiddleware, async (req, res) => {
  try {
    const { id, targetUserId } = req.params;
    const userId = req.user.userId;
    const { complete = true, reason } = req.body;

    // 權限檢查
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限執行此操作'
      });
    }

    // 檢查學生是否已報名
    const progress = await db.getItem(`USER#${targetUserId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '此學生尚未報名此課程'
      });
    }

    const now = new Date().toISOString();
    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');

    if (complete) {
      await db.updateItem(`USER#${targetUserId}`, `PROG#COURSE#${id}`, {
        manuallyCompleted: true,
        manuallyCompletedBy: userId,
        manuallyCompletedAt: now,
        manualCompletionReason: reason || '教師手動標記',
        status: 'completed',
        completedAt: now,
        updatedAt: now
      });

      const rewards = await issueCourseCompletionRewards({
        completionSettings,
        courseId: id,
        courseTitle: course.title,
        userId: targetUserId,
        issuedBy: userId,
        source: 'manual_completion_mark'
      });

      res.json({
        success: true,
        message: '已手動標記學生完成課程',
        data: {
          courseId: id,
          userId: targetUserId,
          completedAt: now,
          rewards
        }
      });
    } else {
      // 撤銷完成狀態
      await db.updateItem(`USER#${targetUserId}`, `PROG#COURSE#${id}`, {
        manuallyCompleted: false,
        manuallyCompletedBy: null,
        manuallyCompletedAt: null,
        manualCompletionReason: null,
        status: 'in_progress',
        completedAt: null,
        updatedAt: now
      });

      res.json({
        success: true,
        message: '已撤銷學生完成狀態',
        data: {
          courseId: id,
          userId: targetUserId
        }
      });
    }

  } catch (error) {
    console.error('Manual mark complete error:', error);
    res.status(500).json({
      success: false,
      error: 'MARK_FAILED',
      message: '標記完成失敗'
    });
  }
});

/**
 * GET /api/courses/:id/completion/report
 * 取得課程完成報告（教師用）
 */
router.get('/:id/completion/report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 權限檢查
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此報告'
      });
    }

    // 取得所有報名學生
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${id}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    // 取得活動列表
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });

    // 取得每個學生的完成狀態
    const studentReports = await Promise.all(enrollments.map(async (enrollment) => {
      const user = await db.getUser(enrollment.userId);

      // 計算活動完成數
      const completedCount = (enrollment.completedActivities || []).length;
      const totalCount = activities.length;

      return {
        userId: enrollment.userId,
        userName: user?.displayName || '未知用戶',
        userEmail: user?.email,
        enrolledAt: enrollment.enrolledAt,
        lastAccessedAt: enrollment.lastAccessedAt,
        status: enrollment.status,
        progressPercentage: enrollment.progressPercentage || 0,
        completedActivities: completedCount,
        totalActivities: totalCount,
        overallGrade: enrollment.overallGrade,
        totalTimeSpent: enrollment.totalTimeSpent || 0,
        completedAt: enrollment.completedAt,
        manuallyCompleted: enrollment.manuallyCompleted || false,
        selfMarkedComplete: enrollment.selfMarkedComplete || false
      };
    }));

    // 統計
    const totalStudents = studentReports.length;
    const completedStudents = studentReports.filter(s => s.status === 'completed').length;
    const inProgressStudents = studentReports.filter(s => s.status === 'in_progress').length;
    const averageProgress = totalStudents > 0
      ? Math.round(studentReports.reduce((sum, s) => sum + s.progressPercentage, 0) / totalStudents)
      : 0;
    const averageGrade = totalStudents > 0
      ? Math.round(studentReports.filter(s => s.overallGrade != null)
          .reduce((sum, s) => sum + (s.overallGrade || 0), 0) /
        studentReports.filter(s => s.overallGrade != null).length || 0)
      : 0;

    // 活動完成統計
    const activityStats = activities.map(activity => {
      const completedBy = studentReports.filter(s =>
        (s.completedActivities || []).includes(activity.activityId)
      ).length;

      return {
        activityId: activity.activityId,
        title: activity.title,
        type: activity.type,
        completedBy,
        completionRate: totalStudents > 0
          ? Math.round((completedBy / totalStudents) * 100)
          : 0
      };
    });

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        summary: {
          totalStudents,
          completedStudents,
          inProgressStudents,
          completionRate: totalStudents > 0
            ? Math.round((completedStudents / totalStudents) * 100)
            : 0,
          averageProgress,
          averageGrade
        },
        activityStats,
        students: studentReports.sort((a, b) =>
          b.progressPercentage - a.progressPercentage
        )
      }
    });

  } catch (error) {
    console.error('Get completion report error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得完成報告失敗'
    });
  }
});

/**
 * POST /api/courses/:id/check-completion
 * 檢查並更新用戶的課程完成狀態
 */
router.post('/:id/check-completion', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程設定
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    if (!course.settings?.enableCompletion) {
      return res.json({
        success: true,
        data: {
          completionEnabled: false,
          message: '此課程未啟用完成追蹤'
        }
      });
    }

    // 取得進度
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 取得完成設定
    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');
    const criteria = completionSettings?.criteria || [];

    // 取得所有活動
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });

    // 檢查所有條件
    let allCriteriaMet = true;
    let anyCriteriaMet = false;

    for (const criterion of criteria) {
      let isMet = false;

      switch (criterion.type) {
        case COMPLETION_CRITERIA_TYPES.ACTIVITY_COMPLETION:
          if (criterion.activityIds && criterion.activityIds.length > 0) {
            isMet = criterion.activityIds.every(actId =>
              (progress.completedActivities || []).includes(actId)
            );
          } else {
            isMet = (progress.completedActivities || []).length >= activities.length;
          }
          break;

        case COMPLETION_CRITERIA_TYPES.GRADE:
          isMet = (progress.overallGrade || 0) >= (criterion.gradeToPass || 60);
          break;

        case COMPLETION_CRITERIA_TYPES.DURATION:
          isMet = (progress.totalTimeSpent || 0) >= (criterion.requiredDuration || 0);
          break;

        case COMPLETION_CRITERIA_TYPES.SELF_COMPLETION:
          isMet = progress.selfMarkedComplete === true;
          break;

        case COMPLETION_CRITERIA_TYPES.MANUAL:
          isMet = progress.manuallyCompleted === true;
          break;
      }

      if (isMet) {
        anyCriteriaMet = true;
      } else {
        allCriteriaMet = false;
      }
    }

    // 決定是否完成
    const aggregationMethod = completionSettings?.aggregationMethod || 'all';
    let isCourseComplete = false;

    if (criteria.length === 0) {
      // 沒有條件時，所有活動完成即可
      isCourseComplete = (progress.completedActivities || []).length >= activities.length;
    } else if (aggregationMethod === 'all') {
      isCourseComplete = allCriteriaMet;
    } else {
      isCourseComplete = anyCriteriaMet;
    }

    // 更新狀態
    const now = new Date().toISOString();
    let rewards = {
      badge: null,
      certificate: null
    };

    if (isCourseComplete && progress.status !== 'completed') {
      await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, {
        status: 'completed',
        completedAt: now,
        updatedAt: now
      });
    }

    if (isCourseComplete) {
      rewards = await issueCourseCompletionRewards({
        completionSettings,
        courseId: id,
        courseTitle: course.title,
        userId,
        issuedBy: 'system',
        source: 'auto_completion_check'
      });
    }

    res.json({
      success: true,
      data: {
        courseId: id,
        isComplete: isCourseComplete,
        previousStatus: progress.status,
        newStatus: isCourseComplete ? 'completed' : 'in_progress',
        completedAt: isCourseComplete ? (progress.completedAt || now) : null,
        rewards,
        message: isCourseComplete
          ? (completionSettings?.completionMessage || '恭喜您完成此課程！')
          : '課程尚未完成'
      }
    });

  } catch (error) {
    console.error('Check completion error:', error);
    res.status(500).json({
      success: false,
      error: 'CHECK_FAILED',
      message: '檢查完成狀態失敗'
    });
  }
});

module.exports = router;
