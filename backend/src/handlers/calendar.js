/**
 * 行事曆系統 API 處理器
 * BeyondBridge Education Platform - Calendar System
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

// ==================== 行事曆事件列表 ====================

/**
 * GET /api/calendar
 * 取得行事曆事件
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
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

    const events = [];

    // 取得用戶報名的課程
    const progressList = await db.getUserCourseProgress(userId);
    const courseIds = progressList.map(p => p.courseId);

    // 如果指定了課程，只取該課程
    const targetCourseIds = courseId ? [courseId] : courseIds;

    // 取得作業截止日期
    if (!type || type === 'all' || type === 'assignment') {
      const assignments = await db.scan({
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'ASSIGNMENT' }
        }
      });

      const courseAssignments = assignments.filter(a =>
        targetCourseIds.includes(a.courseId)
      );

      for (const a of courseAssignments) {
        const dueDate = new Date(a.dueDate);
        if (dueDate >= startDate && dueDate <= endDate) {
          const course = await db.getItem(`COURSE#${a.courseId}`, 'META');

          events.push({
            eventId: a.assignmentId,
            type: 'assignment',
            title: a.title,
            description: a.description,
            start: a.dueDate,
            end: a.dueDate,
            allDay: true,
            courseId: a.courseId,
            courseName: course?.title,
            color: '#E74C3C', // 紅色
            link: `/courses/${a.courseId}/assignments/${a.assignmentId}`
          });
        }
      }
    }

    // 取得測驗日期
    if (!type || type === 'all' || type === 'quiz') {
      const quizzes = await db.scan({
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'QUIZ' }
        }
      });

      const courseQuizzes = quizzes.filter(q =>
        targetCourseIds.includes(q.courseId)
      );

      for (const q of courseQuizzes) {
        const course = await db.getItem(`COURSE#${q.courseId}`, 'META');

        // 開放日期
        if (q.openDate) {
          const openDate = new Date(q.openDate);
          if (openDate >= startDate && openDate <= endDate) {
            events.push({
              eventId: `${q.quizId}_open`,
              type: 'quiz',
              subType: 'open',
              title: `${q.title} 開放`,
              start: q.openDate,
              end: q.openDate,
              allDay: true,
              courseId: q.courseId,
              courseName: course?.title,
              color: '#3498DB', // 藍色
              link: `/courses/${q.courseId}/quizzes/${q.quizId}`
            });
          }
        }

        // 關閉日期
        if (q.closeDate) {
          const closeDate = new Date(q.closeDate);
          if (closeDate >= startDate && closeDate <= endDate) {
            events.push({
              eventId: `${q.quizId}_close`,
              type: 'quiz',
              subType: 'close',
              title: `${q.title} 截止`,
              start: q.closeDate,
              end: q.closeDate,
              allDay: true,
              courseId: q.courseId,
              courseName: course?.title,
              color: '#E67E22', // 橘色
              link: `/courses/${q.courseId}/quizzes/${q.quizId}`
            });
          }
        }
      }
    }

    // 取得課程事件（開始/結束日期）
    if (!type || type === 'all' || type === 'course') {
      for (const cId of targetCourseIds) {
        const course = await db.getItem(`COURSE#${cId}`, 'META');
        if (!course) continue;

        if (course.startDate) {
          const courseStart = new Date(course.startDate);
          if (courseStart >= startDate && courseStart <= endDate) {
            events.push({
              eventId: `${cId}_start`,
              type: 'course',
              subType: 'start',
              title: `${course.title} 開課`,
              start: course.startDate,
              end: course.startDate,
              allDay: true,
              courseId: cId,
              courseName: course.title,
              color: '#2ECC71', // 綠色
              link: `/courses/${cId}`
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
              title: `${course.title} 結課`,
              start: course.endDate,
              end: course.endDate,
              allDay: true,
              courseId: cId,
              courseName: course.title,
              color: '#9B59B6', // 紫色
              link: `/courses/${cId}`
            });
          }
        }
      }
    }

    // 取得個人事件
    if (!type || type === 'all' || type === 'personal') {
      const personalEvents = await db.query(`USER#${userId}`, {
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
    const userId = req.user.userId;
    const { days = 7, limit = 10 } = req.query;

    const now = new Date();
    const endDate = new Date(now.getTime() + parseInt(days) * 24 * 60 * 60 * 1000);

    // 使用主要的行事曆 API 邏輯
    const events = [];

    // 取得用戶報名的課程
    const progressList = await db.getUserCourseProgress(userId);
    const courseIds = progressList.map(p => p.courseId);

    // 作業
    const assignments = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'ASSIGNMENT' }
      }
    });

    for (const a of assignments.filter(a => courseIds.includes(a.courseId))) {
      const dueDate = new Date(a.dueDate);
      if (dueDate >= now && dueDate <= endDate) {
        events.push({
          eventId: a.assignmentId,
          type: 'assignment',
          title: a.title,
          dueDate: a.dueDate,
          courseId: a.courseId,
          daysUntil: Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24))
        });
      }
    }

    // 測驗
    const quizzes = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'QUIZ' }
      }
    });

    for (const q of quizzes.filter(q => courseIds.includes(q.courseId))) {
      if (q.closeDate) {
        const closeDate = new Date(q.closeDate);
        if (closeDate >= now && closeDate <= endDate) {
          events.push({
            eventId: q.quizId,
            type: 'quiz',
            title: q.title,
            dueDate: q.closeDate,
            courseId: q.courseId,
            daysUntil: Math.ceil((closeDate - now) / (1000 * 60 * 60 * 24))
          });
        }
      }
    }

    // 排序並限制數量
    events.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const limitedEvents = events.slice(0, parseInt(limit));

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
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
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
    const { start, end } = req.query;

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
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
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
