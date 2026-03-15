/**
 * 課程管理（教師/管理員）- CRUD
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const {
  isTeachingUser,
  canManageCourse,
  normalizeCourseVisibility,
  normalizeCourseFormat
} = require('../../utils/course-access');
const {
  syncCourseOwnerLinks,
  deleteCourseOwnerLinks
} = require('../../utils/course-owner-links');

// ==================== 課程管理（教師/管理員） ====================

/**
 * POST /api/courses
 * 建立新課程
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有教師或管理員可以建立課程'
      });
    }

    const {
      title,
      shortName,
      description,
      summary,
      category,
      categoryId,
      format = 'topics', // topics, weeks, social, singleactivity
      startDate,
      endDate,
      visibility = 'show', // show, hide
      visible,
      enrollmentKey,
      selfEnrollment = true,
      maxEnrollment,
      tags = [],
      thumbnail,
      language = 'zh-TW'
    } = req.body;

    // 驗證必填欄位
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供課程名稱'
      });
    }

    const normalizedCategory = category || categoryId || 'general';
    const normalizedFormat = normalizeCourseFormat(format);
    const normalizedVisibility = normalizeCourseVisibility(
      visible !== undefined ? visible : visibility
    );
    const courseId = db.generateId('course');
    const now = new Date().toISOString();

    // 取得講師資料
    const instructor = await db.getUser(userId) || await db.getAdmin(userId);

    const courseItem = {
      PK: `COURSE#${courseId}`,
      SK: 'META',
      entityType: 'COURSE',
      GSI1PK: `CAT#${normalizedCategory}`,
      GSI1SK: `COURSE#${courseId}`,
      GSI2PK: `STATUS#${normalizedVisibility === 'show' ? 'published' : 'draft'}`,
      GSI2SK: now,

      courseId,
      title,
      shortName: shortName || title.substring(0, 20),
      description,
      summary,
      category: normalizedCategory,
      format: normalizedFormat,

      instructorId: userId,
      instructorName: instructor?.displayName || '未知講師',

      startDate,
      endDate,
      visibility: normalizedVisibility,
      status: normalizedVisibility === 'show' ? 'published' : 'draft',

      enrollmentKey,
      selfEnrollment,
      maxEnrollment: maxEnrollment ? parseInt(maxEnrollment) : null,
      enrollmentCount: 0,

      tags,
      thumbnail,
      language,

      // 課程設定
      settings: {
        showActivityDates: true,
        showActivityReports: true,
        enableCompletion: true,
        enableGrades: true,
        gradeToPass: 60
      },

      // 統計資料
      stats: {
        totalActivities: 0,
        totalSections: 0,
        averageRating: 0,
        totalRatings: 0,
        completionRate: 0
      },

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(courseItem);
    await syncCourseOwnerLinks(courseItem);

    // 建立預設章節
    const defaultSection = {
      PK: `COURSE#${courseId}`,
      SK: 'SECTION#01',
      entityType: 'COURSE_SECTION',

      sectionId: '01',
      courseId,
      title: '課程簡介',
      summary: '',
      order: 1,
      visible: true,

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(defaultSection);

    delete courseItem.PK;
    delete courseItem.SK;

    res.status(201).json({
      success: true,
      message: '課程建立成功',
      data: courseItem
    });

  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立課程失敗'
    });
  }
});

/**
 * PUT /api/courses/:id
 * 更新課程
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 取得課程
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 權限檢查
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 不允許更新的欄位
    delete updates.courseId;
    delete updates.instructorId;
    delete updates.createdAt;
    delete updates.enrollmentCount;

    // 更新 GSI 索引（如果需要）
    if (updates.categoryId && !updates.category) {
      updates.category = updates.categoryId;
    }
    if (updates.visible !== undefined && updates.visibility === undefined) {
      updates.visibility = normalizeCourseVisibility(updates.visible, course.visibility);
    }
    if (updates.category) {
      updates.GSI1PK = `CAT#${updates.category}`;
    }
    if (updates.visibility !== undefined) {
      updates.visibility = normalizeCourseVisibility(updates.visibility, course.visibility);
      updates.status = updates.visibility === 'show' ? 'published' : 'draft';
      updates.GSI2PK = `STATUS#${updates.status}`;
    }
    if (updates.format) {
      updates.format = normalizeCourseFormat(updates.format, course.format || 'topics');
    }
    delete updates.categoryId;
    delete updates.visible;

    updates.updatedAt = new Date().toISOString();

    const updatedCourse = await db.updateItem(`COURSE#${id}`, 'META', updates);
    await syncCourseOwnerLinks(updatedCourse, course);

    delete updatedCourse.PK;
    delete updatedCourse.SK;

    res.json({
      success: true,
      message: '課程已更新',
      data: updatedCourse
    });

  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新課程失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id
 * 刪除課程
 */
router.delete('/:id', authMiddleware, async (req, res) => {
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

    // 權限檢查
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此課程'
      });
    }

    // 刪除所有相關資料
    // 1. 刪除章節和活動
    const sections = await db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' });
    for (const section of sections) {
      await db.deleteItem(`COURSE#${id}`, section.SK);
    }

    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
    for (const activity of activities) {
      await db.deleteItem(`COURSE#${id}`, activity.SK);
    }

    // 2. 刪除課程本身
    await deleteCourseOwnerLinks(course);
    await db.deleteItem(`COURSE#${id}`, 'META');

    res.json({
      success: true,
      message: '課程已刪除'
    });

  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除課程失敗'
    });
  }
});

module.exports = router;
