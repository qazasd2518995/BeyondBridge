/**
 * 行事曆系統 API 處理器
 * BeyondBridge Education Platform - Calendar System
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { canManageCourse, isTeachingUser } = require('../utils/course-access');
const {
  listManagedCourseIds,
  backfillCourseOwnerLinks
} = require('../utils/course-owner-links');

const COURSE_CALENDAR_PROJECTION = ['courseId', 'title', 'name', 'startDate', 'endDate'];
const ASSIGNMENT_CALENDAR_PROJECTION = ['assignmentId', 'courseId', 'title', 'description', 'dueDate'];
const QUIZ_CALENDAR_PROJECTION = ['quizId', 'courseId', 'title', 'openDate', 'closeDate'];

function uniqueIds(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isDateWithinRange(dateValue, startDate, endDate) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date >= startDate && date <= endDate;
}

function buildCourseMap(courses = []) {
  return new Map(
    (Array.isArray(courses) ? courses : [])
      .filter(course => course?.courseId)
      .map(course => [course.courseId, course])
  );
}

async function getManagedCalendarCourseIds(user) {
  if (!user?.userId || !isTeachingUser(user) || user.isAdmin) {
    return [];
  }

  const linkedCourseIds = await listManagedCourseIds(user.userId);
  if (linkedCourseIds.length > 0) {
    return linkedCourseIds;
  }

  const courses = await db.getItemsByEntityType('COURSE', {
    projection: [
      'courseId',
      'title',
      'name',
      'category',
      'visibility',
      'status',
      'updatedAt',
      'createdAt',
      'instructorId',
      'teacherId',
      'creatorId',
      'createdBy',
      'instructors'
    ]
  });
  const managedCourses = courses.filter(course => canManageCourse(course, user));

  if (managedCourses.length > 0) {
    await backfillCourseOwnerLinks(managedCourses);
  }

  return uniqueIds(managedCourses.map(course => course.courseId));
}

async function getAccessibleCalendarCourseIds(user, requestedCourseId) {
  const progressList = await db.getUserCourseProgress(user.userId);
  const enrolledCourseIds = uniqueIds(progressList.map(item => item.courseId));
  const accessibleCourseIds = new Set(enrolledCourseIds);

  if (isTeachingUser(user) && !user.isAdmin) {
    const managedCourseIds = await getManagedCalendarCourseIds(user);
    managedCourseIds.forEach(courseId => accessibleCourseIds.add(courseId));
  }

  if (!requestedCourseId) {
    return [...accessibleCourseIds];
  }

  if (accessibleCourseIds.has(requestedCourseId) || user.isAdmin) {
    return [requestedCourseId];
  }

  return null;
}

async function listCourseScopedItems(courseIds, skPrefix, projection) {
  const ids = uniqueIds(courseIds);
  if (ids.length === 0) return [];

  const results = await Promise.all(ids.map(courseId =>
    db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
      skName: 'GSI1SK',
      skPrefix,
      projection
    })
  ));

  return results.flat().filter(Boolean);
}

async function getCalendarCourseMap(courseIds) {
  const courses = await db.getCoursesByIds(uniqueIds(courseIds), {
    projection: COURSE_CALENDAR_PROJECTION
  });
  return buildCourseMap(courses);
}

function buildAssignmentCalendarEvents(assignments, courseMap, startDate, endDate) {
  return (Array.isArray(assignments) ? assignments : [])
    .filter(assignment => assignment?.courseId && isDateWithinRange(assignment.dueDate, startDate, endDate))
    .map((assignment) => {
      const course = courseMap.get(assignment.courseId);
      return {
        eventId: assignment.assignmentId,
        type: 'assignment',
        title: assignment.title,
        description: assignment.description,
        start: assignment.dueDate,
        end: assignment.dueDate,
        allDay: true,
        courseId: assignment.courseId,
        courseName: course?.title || course?.name,
        color: '#E74C3C',
        link: `/platform/assignment/${assignment.assignmentId}`
      };
    });
}

function buildQuizCalendarEvents(quizzes, courseMap, startDate, endDate) {
  return (Array.isArray(quizzes) ? quizzes : []).flatMap((quiz) => {
    const course = courseMap.get(quiz.courseId);
    const baseEvent = {
      type: 'quiz',
      courseId: quiz.courseId,
      courseName: course?.title || course?.name,
      link: `/platform/quiz/${quiz.quizId}`
    };
    const events = [];

    if (isDateWithinRange(quiz.openDate, startDate, endDate)) {
      events.push({
        eventId: `${quiz.quizId}_open`,
        subType: 'open',
        title: `${quiz.title} 開放`,
        start: quiz.openDate,
        end: quiz.openDate,
        allDay: true,
        color: '#3498DB',
        ...baseEvent
      });
    }

    if (isDateWithinRange(quiz.closeDate, startDate, endDate)) {
      events.push({
        eventId: `${quiz.quizId}_close`,
        subType: 'close',
        title: `${quiz.title} 截止`,
        start: quiz.closeDate,
        end: quiz.closeDate,
        allDay: true,
        color: '#E67E22',
        ...baseEvent
      });
    }

    return events;
  });
}

// ==================== 行事曆事件列表 ====================

/**
 * GET /api/calendar
 * 取得行事曆事件
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const {
      start, // ISO 日期字串
      end,   // ISO 日期字串
      courseId,
      type   // assignment, quiz, course, personal, all
    } = req.query;

    // 設定預設日期範圍（當月）
    const now = new Date();
    const startDate = start ? new Date(start) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = end ? new Date(end) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const targetCourseIds = await getAccessibleCalendarCourseIds(req.user, courseId);
    if (courseId && !targetCourseIds) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此課程行事曆'
      });
    }

    const events = [];
    const shouldLoadAssignments = !type || type === 'all' || type === 'assignment';
    const shouldLoadQuizzes = !type || type === 'all' || type === 'quiz';
    const shouldLoadCourses = !type || type === 'all' || type === 'course';
    const shouldLoadPersonal = !type || type === 'all' || type === 'personal';

    const courseMap = (shouldLoadAssignments || shouldLoadQuizzes || shouldLoadCourses)
      ? await getCalendarCourseMap(targetCourseIds)
      : new Map();

    // 取得作業截止日期
    if (shouldLoadAssignments && targetCourseIds.length > 0) {
      const assignments = await listCourseScopedItems(
        targetCourseIds,
        'ASSIGNMENT#',
        ASSIGNMENT_CALENDAR_PROJECTION
      );
      events.push(...buildAssignmentCalendarEvents(assignments, courseMap, startDate, endDate));
    }

    // 取得測驗日期
    if (shouldLoadQuizzes && targetCourseIds.length > 0) {
      const quizzes = await listCourseScopedItems(
        targetCourseIds,
        'QUIZ#',
        QUIZ_CALENDAR_PROJECTION
      );
      events.push(...buildQuizCalendarEvents(quizzes, courseMap, startDate, endDate));
    }

    // 取得課程事件（開始/結束日期）
    if (shouldLoadCourses) {
      for (const cId of targetCourseIds) {
        const course = courseMap.get(cId);
        if (!course) continue;
        const courseTitle = course.title || course.name || '未命名課程';

        if (course.startDate) {
          const courseStart = new Date(course.startDate);
          if (courseStart >= startDate && courseStart <= endDate) {
            events.push({
              eventId: `${cId}_start`,
              type: 'course',
              subType: 'start',
              title: `${courseTitle} 開課`,
              start: course.startDate,
              end: course.startDate,
              allDay: true,
              courseId: cId,
              courseName: courseTitle,
              color: '#2ECC71', // 綠色
              link: `/platform/course/${cId}`
            });
          }
        }

        if (course.endDate) {
          const courseEnd = new Date(course.endDate);
          if (courseEnd >= startDate && courseEnd <= endDate) {
            events.push({
              eventId: `${cId}_end`,
              type: 'course',
              subType: 'end',
              title: `${courseTitle} 結課`,
              start: course.endDate,
              end: course.endDate,
              allDay: true,
              courseId: cId,
              courseName: courseTitle,
              color: '#9B59B6', // 紫色
              link: `/platform/course/${cId}`
            });
          }
        }
      }
    }

    // 取得個人事件
    if (shouldLoadPersonal) {
      const personalEvents = await db.query(`USER#${req.user.userId}`, {
        skPrefix: 'EVENT#'
      });

      for (const e of personalEvents) {
        const eventStart = new Date(e.start);
        const eventEnd = e.end ? new Date(e.end) : eventStart;

        if (eventEnd >= startDate && eventStart <= endDate) {
          events.push({
            eventId: e.eventId,
            type: 'personal',
            title: e.title,
            description: e.description,
            start: e.start,
            end: e.end || e.start,
            allDay: e.allDay,
            color: e.color || '#1ABC9C', // 預設青綠色
            reminder: e.reminder
          });
        }
      }
    }

    // 排序
    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({
      success: true,
      data: events,
      count: events.length,
      range: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得行事曆失敗'
    });
  }
});

/**
 * GET /api/calendar/upcoming
 * 取得即將到來的事件
 */
router.get('/upcoming', authMiddleware, async (req, res) => {
  try {
    const { days = 7, limit = 10 } = req.query;

    const now = new Date();
    const dayRange = parsePositiveInteger(days, 7);
    const maxResults = parsePositiveInteger(limit, 10);
    const endDate = new Date(now.getTime() + dayRange * 24 * 60 * 60 * 1000);
    const courseIds = await getAccessibleCalendarCourseIds(req.user);

    const [assignments, quizzes] = await Promise.all([
      listCourseScopedItems(courseIds, 'ASSIGNMENT#', ASSIGNMENT_CALENDAR_PROJECTION),
      listCourseScopedItems(courseIds, 'QUIZ#', QUIZ_CALENDAR_PROJECTION)
    ]);

    const events = [
      ...assignments
        .filter(assignment => isDateWithinRange(assignment.dueDate, now, endDate))
        .map((assignment) => {
          const dueDate = new Date(assignment.dueDate);
          return {
            eventId: assignment.assignmentId,
            type: 'assignment',
            title: assignment.title,
            dueDate: assignment.dueDate,
            courseId: assignment.courseId,
            daysUntil: Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24))
          };
        }),
      ...quizzes
        .filter(quiz => isDateWithinRange(quiz.closeDate, now, endDate))
        .map((quiz) => {
          const closeDate = new Date(quiz.closeDate);
          return {
            eventId: quiz.quizId,
            type: 'quiz',
            title: quiz.title,
            dueDate: quiz.closeDate,
            courseId: quiz.courseId,
            daysUntil: Math.ceil((closeDate - now) / (1000 * 60 * 60 * 24))
          };
        })
    ];

    // 排序並限制數量
    events.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const limitedEvents = events.slice(0, maxResults);

    res.json({
      success: true,
      data: limitedEvents,
      count: limitedEvents.length
    });

  } catch (error) {
    console.error('Get upcoming events error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得即將到來的事件失敗'
    });
  }
});

// ==================== 個人事件管理 ====================

/**
 * POST /api/calendar/events
 * 新增個人事件
 */
router.post('/events', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      title,
      description,
      start,
      end,
      allDay = false,
      color,
      reminder, // { type: 'email' | 'notification', before: minutes }
      recurring // { frequency: 'daily' | 'weekly' | 'monthly', until: date }
    } = req.body;

    if (!title || !start) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供事件標題和開始時間'
      });
    }

    const eventId = db.generateId('evt');
    const now = new Date().toISOString();

    const eventItem = {
      PK: `USER#${userId}`,
      SK: `EVENT#${start.substring(0, 10)}#${eventId}`,
      entityType: 'CALENDAR_EVENT',

      eventId,
      userId,
      title,
      description,
      start,
      end: end || start,
      allDay,
      color: color || '#1ABC9C',
      reminder,
      recurring,

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(eventItem);

    delete eventItem.PK;
    delete eventItem.SK;

    res.status(201).json({
      success: true,
      message: '事件建立成功',
      data: eventItem
    });

  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立事件失敗'
    });
  }
});

/**
 * PUT /api/calendar/events/:id
 * 更新個人事件
 */
router.put('/events/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    // 找到事件
    const events = await db.query(`USER#${userId}`, { skPrefix: 'EVENT#' });
    const event = events.find(e => e.eventId === id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: '找不到此事件'
      });
    }

    // 不允許更新的欄位
    delete updates.eventId;
    delete updates.userId;
    delete updates.createdAt;

    updates.updatedAt = new Date().toISOString();

    // 如果開始日期改變，需要更新 SK
    if (updates.start && updates.start.substring(0, 10) !== event.start.substring(0, 10)) {
      // 刪除舊的，建立新的
      await db.deleteItem(`USER#${userId}`, event.SK);

      const newEvent = {
        ...event,
        ...updates,
        SK: `EVENT#${updates.start.substring(0, 10)}#${id}`
      };

      await db.putItem({
        PK: `USER#${userId}`,
        ...newEvent
      });

      delete newEvent.PK;
      delete newEvent.SK;

      res.json({
        success: true,
        message: '事件已更新',
        data: newEvent
      });
    } else {
      const updatedEvent = await db.updateItem(`USER#${userId}`, event.SK, updates);

      delete updatedEvent.PK;
      delete updatedEvent.SK;

      res.json({
        success: true,
        message: '事件已更新',
        data: updatedEvent
      });
    }

  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新事件失敗'
    });
  }
});

/**
 * DELETE /api/calendar/events/:id
 * 刪除個人事件
 */
router.delete('/events/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const events = await db.query(`USER#${userId}`, { skPrefix: 'EVENT#' });
    const event = events.find(e => e.eventId === id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: '找不到此事件'
      });
    }

    await db.deleteItem(`USER#${userId}`, event.SK);

    res.json({
      success: true,
      message: '事件已刪除'
    });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除事件失敗'
    });
  }
});

// ==================== 課程行事曆（教師） ====================

/**
 * POST /api/calendar/courses/:courseId/events
 * 新增課程事件（教師用）
 */
router.post('/courses/:courseId/events', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const {
      title,
      description,
      start,
      end,
      allDay = false,
      eventType = 'event' // event, deadline, meeting, holiday
    } = req.body;

    // 權限檢查
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || !canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限在此課程新增事件'
      });
    }

    if (!title || !start) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供事件標題和開始時間'
      });
    }

    const eventId = db.generateId('cevt');
    const now = new Date().toISOString();

    const eventItem = {
      PK: `COURSE#${courseId}`,
      SK: `EVENT#${start.substring(0, 10)}#${eventId}`,
      entityType: 'COURSE_EVENT',
      GSI1PK: `COURSE_EVENTS`,
      GSI1SK: start,

      eventId,
      courseId,
      title,
      description,
      start,
      end: end || start,
      allDay,
      eventType,

      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(eventItem);

    delete eventItem.PK;
    delete eventItem.SK;

    res.status(201).json({
      success: true,
      message: '課程事件建立成功',
      data: eventItem
    });

  } catch (error) {
    console.error('Create course event error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立事件失敗'
    });
  }
});

/**
 * GET /api/calendar/courses/:courseId/events
 * 取得課程事件
 */
router.get('/courses/:courseId/events', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const { start, end } = req.query;
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`);
    if (!req.user.isAdmin && !canManageCourse(course, req.user) && !progress) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此課程事件'
      });
    }

    let events = await db.query(`COURSE#${courseId}`, { skPrefix: 'EVENT#' });

    // 日期範圍篩選
    if (start || end) {
      events = events.filter(e => {
        const eventDate = new Date(e.start);
        if (start && eventDate < new Date(start)) return false;
        if (end && eventDate > new Date(end)) return false;
        return true;
      });
    }

    events = events.map(e => {
      delete e.PK;
      delete e.SK;
      return e;
    });

    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({
      success: true,
      data: events,
      count: events.length
    });

  } catch (error) {
    console.error('Get course events error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程事件失敗'
    });
  }
});

/**
 * DELETE /api/calendar/courses/:courseId/events/:eventId
 * 刪除課程事件
 */
router.delete('/courses/:courseId/events/:eventId', authMiddleware, async (req, res) => {
  try {
    const { courseId, eventId } = req.params;
    const userId = req.user.userId;

    // 權限檢查
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || !canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此事件'
      });
    }

    const events = await db.query(`COURSE#${courseId}`, { skPrefix: 'EVENT#' });
    const event = events.find(e => e.eventId === eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: '找不到此事件'
      });
    }

    await db.deleteItem(`COURSE#${courseId}`, event.SK);

    res.json({
      success: true,
      message: '事件已刪除'
    });

  } catch (error) {
    console.error('Delete course event error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除事件失敗'
    });
  }
});

module.exports = router;
