/**
 * 課程 API 處理器
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, optionalAuthMiddleware } = require('../utils/auth');

/**
 * GET /api/courses
 * 取得課程列表
 */
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const { status = 'published', limit = 50 } = req.query;

    let courses = await db.scan({
      filter: {
        expression: 'entityType = :type AND #status = :status',
        values: { ':type': 'COURSE', ':status': status },
        names: { '#status': 'status' }
      },
      limit: parseInt(limit)
    });

    // 清理資料
    courses = courses.map(c => {
      delete c.PK;
      delete c.SK;
      return c;
    });

    res.json({
      success: true,
      data: courses,
      count: courses.length
    });

  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程列表失敗'
    });
  }
});

/**
 * GET /api/courses/:id
 * 取得課程詳情
 */
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
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

    // 取得課程單元
    const units = await db.getCourseUnits(id);

    // 清理資料
    delete course.PK;
    delete course.SK;

    res.json({
      success: true,
      data: {
        ...course,
        units: units.map(u => {
          delete u.PK;
          delete u.SK;
          return u;
        }).sort((a, b) => a.order - b.order)
      }
    });

  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程失敗'
    });
  }
});

/**
 * POST /api/courses/:id/enroll
 * 報名課程
 */
router.post('/:id/enroll', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 檢查課程是否存在
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 檢查是否已報名
    const existingProgress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (existingProgress) {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_ENROLLED',
        message: '您已報名此課程'
      });
    }

    // 建立進度記錄
    const now = new Date().toISOString();
    const progressItem = {
      PK: `USER#${userId}`,
      SK: `PROG#COURSE#${id}`,
      entityType: 'COURSE_PROGRESS',
      createdAt: now,

      userId,
      courseId: id,
      courseTitle: course.title,
      status: 'in_progress',
      progressPercentage: 0,
      completedUnits: [],
      currentUnit: '01',
      totalTimeSpent: 0,
      lastAccessedAt: now,
      enrolledAt: now,
      completedAt: null
    };

    await db.putItem(progressItem);

    // 更新課程報名數
    await db.updateItem(`COURSE#${id}`, 'META', {
      enrollmentCount: (course.enrollmentCount || 0) + 1
    });

    // 記錄活動日誌
    await db.logActivity(userId, 'course_enrolled', 'course', id, {
      courseTitle: course.title
    });

    res.status(201).json({
      success: true,
      message: '報名成功',
      data: {
        courseId: id,
        enrolledAt: now
      }
    });

  } catch (error) {
    console.error('Enroll course error:', error);
    res.status(500).json({
      success: false,
      error: 'ENROLL_FAILED',
      message: '報名失敗'
    });
  }
});

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
    const { unitId, completed, timeSpent } = req.body;

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
    const unitCount = course?.unitCount || 12;

    const updates = {
      lastAccessedAt: new Date().toISOString()
    };

    // 更新已完成單元
    if (unitId && completed) {
      const completedUnits = [...(progress.completedUnits || [])];
      if (!completedUnits.includes(unitId)) {
        completedUnits.push(unitId);
      }
      updates.completedUnits = completedUnits;
      updates.progressPercentage = Math.round((completedUnits.length / unitCount) * 100);

      // 檢查是否完成全部
      if (completedUnits.length >= unitCount) {
        updates.status = 'completed';
        updates.completedAt = new Date().toISOString();
      }
    }

    // 更新當前單元
    if (unitId) {
      updates.currentUnit = unitId;
    }

    // 更新學習時間
    if (timeSpent) {
      updates.totalTimeSpent = (progress.totalTimeSpent || 0) + timeSpent;
    }

    const updatedProgress = await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, updates);

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
 * POST /api/courses/:id/units/:unitId/complete
 * 標記單元完成
 */
router.post('/:id/units/:unitId/complete', authMiddleware, async (req, res) => {
  req.body.unitId = req.params.unitId;
  req.body.completed = true;
  req.params.id = req.params.id;

  // 轉發到更新進度
  return router.handle(req, res);
});

module.exports = router;
