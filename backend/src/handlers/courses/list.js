/**
 * 課程列表與詳情
 * BeyondBridge Education Platform - Moodle-style LMS
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware, optionalAuthMiddleware } = require('../../utils/auth');
const { canManageCourse } = require('../../utils/course-access');
const { createLinkedEntityIndexes, enrichCourseActivity } = require('../../utils/legacy-course-activity-links');
const {
  listManagedCourseIds,
  backfillCourseOwnerLinks
} = require('../../utils/course-owner-links');

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sortCourses(courses = [], sortBy = 'createdAt', sortOrder = 'desc') {
  const direction = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
  return courses.sort((a, b) => {
    const aVal = a?.[sortBy] ?? '';
    const bVal = b?.[sortBy] ?? '';
    if (aVal === bVal) return 0;
    return aVal > bVal ? direction : -direction;
  });
}

function groupActivitiesBySection(activities = [], linkedIndexes = {}) {
  const grouped = new Map();

  activities.forEach((activity) => {
    const sectionId = activity?.sectionId || String(activity?.SK || '').split('#')[1] || null;
    if (!sectionId) return;
    const bucket = grouped.get(sectionId) || [];
    bucket.push(enrichCourseActivity(activity, linkedIndexes));
    grouped.set(sectionId, bucket);
  });

  grouped.forEach((items, sectionId) => {
    grouped.set(sectionId, items.sort((a, b) => (a.order || 0) - (b.order || 0)));
  });

  return grouped;
}

function stripCourseDbKeys(course) {
  if (!course) return course;
  const { PK, SK, ...cleanCourse } = course;
  return cleanCourse;
}

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
    const normalizedLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const normalizedOffset = Math.max(0, parseInt(offset) || 0);

    let courses;

    if (category) {
      courses = await db.queryByIndex('GSI1', `CAT#${category}`, 'GSI1PK', {
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'COURSE' }
        }
      });
    } else if (status && status !== 'all') {
      courses = await db.queryByIndex('GSI2', `STATUS#${status}`, 'GSI2PK', {
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'COURSE' }
        }
      });
    } else {
      courses = await db.getItemsByEntityType('COURSE');
    }

    if (category && status && status !== 'all') {
      courses = courses.filter(course => course.status === status);
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
    sortCourses(courses, sortBy, sortOrder);

    // 分頁
    const total = courses.length;
    courses = courses.slice(normalizedOffset, normalizedOffset + normalizedLimit);

    // 清理資料
    courses = courses.map(stripCourseDbKeys);

    res.json({
      success: true,
      data: courses,
      pagination: {
        total,
        limit: normalizedLimit,
        offset: normalizedOffset,
        hasMore: normalizedOffset + courses.length < total
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
      let courses = [];
      const managedCourseIds = await listManagedCourseIds(userId);

      if (managedCourseIds.length > 0) {
        courses = await db.getCoursesByIds(managedCourseIds);
      } else {
        const allCourses = await db.getItemsByEntityType('COURSE');
        courses = allCourses.filter(course => canManageCourse(course, req.user));
        if (courses.length > 0) {
          await backfillCourseOwnerLinks(courses);
        }
      }

      courses = courses.filter(course => course && canManageCourse(course, req.user));
      sortCourses(courses, 'updatedAt', 'desc');

      courses = courses.map(stripCourseDbKeys);

      res.json({
        success: true,
        data: courses,
        count: courses.length
      });
    } else {
      // 學生：取得已報名的課程進度
      const progressList = await db.getUserCourseProgress(userId);
      const courseIds = [
        ...new Set(
          progressList
            .map(progress => progress?.courseId)
            .filter(Boolean)
        )
      ];
      const courseMap = new Map(
        (await db.getCoursesByIds(courseIds))
          .filter(Boolean)
          .map(course => [course.courseId, course])
      );

      // 取得課程詳情
      const courses = progressList.map((progress) => {
        const course = courseMap.get(progress.courseId);
        if (!course) return null;
        return {
          ...stripCourseDbKeys(course),
          progress: {
            status: progress.status,
            progressPercentage: progress.progressPercentage,
            completedUnits: progress.completedUnits,
            currentUnit: progress.currentUnit,
            totalTimeSpent: progress.totalTimeSpent,
            lastAccessedAt: progress.lastAccessedAt,
            enrolledAt: progress.enrolledAt,
            completedActivities: Array.isArray(progress.completedActivities) ? progress.completedActivities : [],
            activityAccessMap: progress.activityAccessMap || {},
            activityTimeMap: progress.activityTimeMap || {},
            activityProgressMap: progress.activityProgressMap || {}
          }
        };
      });

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

    // 取得課程章節與活動
    const [sections, activities, linkedEntities, progress] = await Promise.all([
      db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' }),
      db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' }),
      db.queryByIndex('GSI1', `COURSE#${id}`, 'GSI1PK'),
      req.user ? db.getItem(`USER#${req.user.userId}`, `PROG#COURSE#${id}`) : Promise.resolve(null)
    ]);
    const linkedIndexes = createLinkedEntityIndexes(linkedEntities);
    const activitiesBySection = groupActivitiesBySection(activities, linkedIndexes);

    const sectionsWithActivities = sections.map((section) => {
      delete section.PK;
      delete section.SK;
      return {
        ...section,
        activities: activitiesBySection.get(section.sectionId) || []
      };
    });

    let userProgress = null;
    if (progress) {
      delete progress.PK;
      delete progress.SK;
      userProgress = progress;
    }

    // 清理資料
    res.json({
      success: true,
      data: {
        ...stripCourseDbKeys(course),
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
