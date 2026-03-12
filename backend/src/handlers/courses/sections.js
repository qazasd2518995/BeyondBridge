/**
 * 章節與活動管理 (Moodle Activities)
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse } = require('../../utils/course-access');
const { createLinkedEntityIndexes, enrichCourseActivity } = require('../../utils/legacy-course-activity-links');

function matchesCourseActivityIdentifier(activity, targetId) {
  return [
    activity?.activityId,
    activity?.assignmentId,
    activity?.quizId,
    activity?.forumId
  ].filter(Boolean).includes(targetId);
}

// ==================== 章節管理 ====================

/**
 * POST /api/courses/:id/sections
 * 新增章節
 */
router.post('/:id/sections', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, name, summary, visible = true } = req.body;

    // 取得課程並驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 取得現有章節數量
    const existingSections = await db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' });
    const sectionNumber = String(existingSections.length + 1).padStart(2, '0');

    const now = new Date().toISOString();
    const sectionItem = {
      PK: `COURSE#${id}`,
      SK: `SECTION#${sectionNumber}`,
      entityType: 'COURSE_SECTION',

      sectionId: sectionNumber,
      courseId: id,
      title: title || name || `第 ${existingSections.length + 1} 週`,
      summary: summary || '',
      order: existingSections.length + 1,
      visible,

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(sectionItem);

    // 更新課程統計
    await db.updateItem(`COURSE#${id}`, 'META', {
      'stats.totalSections': existingSections.length + 1,
      updatedAt: now
    });

    delete sectionItem.PK;
    delete sectionItem.SK;

    res.status(201).json({
      success: true,
      message: '章節新增成功',
      data: sectionItem
    });

  } catch (error) {
    console.error('Add section error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '新增章節失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/sections/:sectionId
 * 更新章節
 */
router.put('/:id/sections/:sectionId', authMiddleware, async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const updates = req.body;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || !canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    if (updates.name && !updates.title) {
      updates.title = updates.name;
    }

    // 不允許更新的欄位
    delete updates.sectionId;
    delete updates.courseId;
    delete updates.createdAt;
    delete updates.name;

    updates.updatedAt = new Date().toISOString();

    const updatedSection = await db.updateItem(
      `COURSE#${id}`,
      `SECTION#${sectionId}`,
      updates
    );

    delete updatedSection.PK;
    delete updatedSection.SK;

    res.json({
      success: true,
      message: '章節已更新',
      data: updatedSection
    });

  } catch (error) {
    console.error('Update section error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新章節失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/sections/:sectionId
 * 刪除章節
 */
router.delete('/:id/sections/:sectionId', authMiddleware, async (req, res) => {
  try {
    const { id, sectionId } = req.params;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || !canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 刪除章節內的所有活動
    const activities = await db.query(`COURSE#${id}`, {
      skPrefix: `ACTIVITY#${sectionId}#`
    });
    for (const activity of activities) {
      await db.deleteItem(`COURSE#${id}`, activity.SK);
    }

    // 刪除章節
    await db.deleteItem(`COURSE#${id}`, `SECTION#${sectionId}`);

    res.json({
      success: true,
      message: '章節已刪除'
    });

  } catch (error) {
    console.error('Delete section error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除章節失敗'
    });
  }
});

// ==================== 活動管理（Moodle Activities） ====================

/**
 * POST /api/courses/:id/sections/:sectionId/activities
 * 新增活動到章節
 * 活動類型：page, url, file, assignment, quiz, forum, label, choice, feedback
 */
router.post('/:id/sections/:sectionId/activities', authMiddleware, async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const {
      type, // page, url, file, assignment, quiz, forum, label, choice, feedback
      title,
      name,
      description,
      content, // 頁面內容
      url, // 外部連結
      fileId, // 檔案ID
      visible = true,
      availability, // { from, until, conditions }
      completion // { type: 'manual' | 'view' | 'grade', gradeToPass }
    } = req.body;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || !canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    const activityTitle = title || name;
    if (!type || !activityTitle) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供活動類型和標題'
      });
    }

    // 取得現有活動數量
    const existingActivities = await db.query(`COURSE#${id}`, {
      skPrefix: `ACTIVITY#${sectionId}#`
    });
    const activityNumber = String(existingActivities.length + 1).padStart(3, '0');
    const activityId = db.generateId('act');

    const now = new Date().toISOString();
    const activityItem = {
      PK: `COURSE#${id}`,
      SK: `ACTIVITY#${sectionId}#${activityNumber}`,
      entityType: 'COURSE_ACTIVITY',

      activityId,
      courseId: id,
      sectionId,
      type,
      title: activityTitle,
      description,

      // 類型特定內容
      content: type === 'page' || type === 'label' ? content : undefined,
      url: type === 'url' ? url : undefined,
      fileId: type === 'file' ? fileId : undefined,

      order: existingActivities.length + 1,
      visible,

      availability: availability || {},
      completion: completion || { type: 'manual' },

      // 統計
      stats: {
        views: 0,
        completions: 0
      },

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(activityItem);

    // 更新課程統計
    const totalActivities = (course.stats?.totalActivities || 0) + 1;
    await db.updateItem(`COURSE#${id}`, 'META', {
      'stats.totalActivities': totalActivities,
      updatedAt: now
    });

    delete activityItem.PK;
    delete activityItem.SK;

    res.status(201).json({
      success: true,
      message: '活動新增成功',
      data: activityItem
    });

  } catch (error) {
    console.error('Add activity error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '新增活動失敗'
    });
  }
});

/**
 * GET /api/courses/:id/activities/:activityId
 * 取得單一活動
 */
router.get('/:id/activities/:activityId', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const userId = req.user.userId;

    // 驗證課程存在
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!req.user.isAdmin && !canManageCourse(course, req.user) && !progress) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此活動'
      });
    }

    // 找到活動
    const [activities, linkedEntities] = await Promise.all([
      db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' }),
      db.queryByIndex('GSI1', `COURSE#${id}`, 'GSI1PK')
    ]);
    const activity = activities.find(a => matchesCourseActivityIdentifier(a, activityId));

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'ACTIVITY_NOT_FOUND',
        message: '找不到此活動'
      });
    }

    // 如果是檔案類型活動，附加檔案資訊
    const linkedIndexes = createLinkedEntityIndexes(linkedEntities);
    const enrichedActivity = enrichCourseActivity(activity, linkedIndexes);

    if (enrichedActivity.type === 'file' && enrichedActivity.fileId) {
      const file = await db.getItem(`FILE#${enrichedActivity.fileId}`, 'META');
      if (file) {
        enrichedActivity.contentType = file.contentType;
        enrichedActivity.fileName = file.filename;
        enrichedActivity.fileSize = file.size;
      }
    }

    res.json({
      success: true,
      data: enrichedActivity
    });

  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({
      success: false,
      error: 'GET_FAILED',
      message: '取得活動失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/activities/:activityId
 * 更新活動
 */
router.put('/:id/activities/:activityId', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || !canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 找到活動
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
    const activity = activities.find(a => matchesCourseActivityIdentifier(a, activityId));

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'ACTIVITY_NOT_FOUND',
        message: '找不到此活動'
      });
    }

    if (updates.name && !updates.title) {
      updates.title = updates.name;
    }

    // 不允許更新的欄位
    delete updates.activityId;
    delete updates.courseId;
    delete updates.sectionId;
    delete updates.createdAt;
    delete updates.name;

    updates.updatedAt = new Date().toISOString();

    const updatedActivity = await db.updateItem(`COURSE#${id}`, activity.SK, updates);

    delete updatedActivity.PK;
    delete updatedActivity.SK;

    res.json({
      success: true,
      message: '活動已更新',
      data: updatedActivity
    });

  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新活動失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/activities/:activityId
 * 刪除活動
 */
router.delete('/:id/activities/:activityId', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || !canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 找到活動
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
    const activity = activities.find(a => matchesCourseActivityIdentifier(a, activityId));

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'ACTIVITY_NOT_FOUND',
        message: '找不到此活動'
      });
    }

    await db.deleteItem(`COURSE#${id}`, activity.SK);

    res.json({
      success: true,
      message: '活動已刪除'
    });

  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除活動失敗'
    });
  }
});

module.exports = router;
