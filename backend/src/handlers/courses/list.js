/**
 * 課程列表與詳情
 * BeyondBridge Education Platform - Moodle-style LMS
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware, optionalAuthMiddleware } = require('../../utils/auth');

// ==================== 課程列表與詳情 ====================

/**
 * GET /api/courses
 * 取得課程列表
 */
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const {
      status = 'published',
      category,
      instructor,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let courses = await db.scan({
      filter: {
        expression: 'entityType = :type AND #status = :status',
        values: { ':type': 'COURSE', ':status': status },
        names: { '#status': 'status' }
      }
    });

    // 分類篩選
    if (category) {
      courses = courses.filter(c => c.category === category);
    }

    // 講師篩選
    if (instructor) {
      courses = courses.filter(c => c.instructorId === instructor);
    }

    // 搜尋篩選
    if (search) {
      const searchLower = search.toLowerCase();
      courses = courses.filter(c =>
        c.title?.toLowerCase().includes(searchLower) ||
        c.description?.toLowerCase().includes(searchLower) ||
        c.tags?.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    // 排序
    courses.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    // 分頁
    const total = courses.length;
    courses = courses.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // 清理資料
    courses = courses.map(c => {
      delete c.PK;
      delete c.SK;
      return c;
    });

    res.json({
      success: true,
      data: courses,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + courses.length < total
      }
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
 * GET /api/courses/my
 * 取得我的課程（教師創建的或學生報名的）
 */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { role = 'student' } = req.query;

    if (role === 'instructor') {
      // 教師：取得自己創建的課程
      let courses = await db.scan({
        filter: {
          expression: 'entityType = :type AND instructorId = :instructorId',
          values: { ':type': 'COURSE', ':instructorId': userId }
        }
      });

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
    } else {
      // 學生：取得已報名的課程進度
      const progressList = await db.getUserCourseProgress(userId);

      // 取得課程詳情
      const courses = await Promise.all(
        progressList.map(async (p) => {
          const course = await db.getItem(`COURSE#${p.courseId}`, 'META');
          if (course) {
            delete course.PK;
            delete course.SK;
            return {
              ...course,
              progress: {
                status: p.status,
                progressPercentage: p.progressPercentage,
                completedUnits: p.completedUnits,
                currentUnit: p.currentUnit,
                totalTimeSpent: p.totalTimeSpent,
                lastAccessedAt: p.lastAccessedAt,
                enrolledAt: p.enrolledAt
              }
            };
          }
          return null;
        })
      );

      res.json({
        success: true,
        data: courses.filter(Boolean),
        count: courses.filter(Boolean).length
      });
    }

  } catch (error) {
    console.error('Get my courses error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程失敗'
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

    // 取得課程章節
    const sections = await db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' });

    // 取得每個章節的活動
    const sectionsWithActivities = await Promise.all(
      sections.map(async (section) => {
        const activities = await db.query(`COURSE#${id}`, {
          skPrefix: `ACTIVITY#${section.sectionId}#`
        });
        delete section.PK;
        delete section.SK;
        return {
          ...section,
          activities: activities.map(a => {
            delete a.PK;
            delete a.SK;
            return a;
          }).sort((a, b) => a.order - b.order)
        };
      })
    );

    // 如果用戶已登入，取得進度
    let userProgress = null;
    if (req.user) {
      const progress = await db.getItem(`USER#${req.user.userId}`, `PROG#COURSE#${id}`);
      if (progress) {
        delete progress.PK;
        delete progress.SK;
        userProgress = progress;
      }
    }

    // 清理資料
    delete course.PK;
    delete course.SK;

    res.json({
      success: true,
      data: {
        ...course,
        sections: sectionsWithActivities.sort((a, b) => a.order - b.order),
        userProgress
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

module.exports = router;
