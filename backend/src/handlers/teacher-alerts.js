/**
 * 教師預警系統路由處理器
 * 提供學生狀態預警相關的 API
 *
 * 使用 DynamoDB 作為資料來源
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../utils/auth');
const db = require('../utils/db');

const TEACHING_ROLES = new Set([
  'manager',
  'coursecreator',
  'educator',
  'trainer',
  'creator',
  'teacher',
  'assistant'
]);

function requireTeachingRole(req, res, next) {
  if (req.user?.isAdmin || TEACHING_ROLES.has(req.user?.role)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: 'FORBIDDEN',
    message: '需要教學管理角色權限'
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function average(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function extractSubmissionUserId(submission) {
  if (submission?.userId) return submission.userId;
  if (typeof submission?.SK === 'string' && submission.SK.startsWith('SUBMISSION#')) {
    return submission.SK.slice('SUBMISSION#'.length);
  }
  return null;
}

function extractAttemptUserId(attempt) {
  if (attempt?.userId) return attempt.userId;
  if (typeof attempt?.SK === 'string' && attempt.SK.startsWith('ATTEMPT#')) {
    const chunks = attempt.SK.split('#');
    return chunks[1] || null;
  }
  return null;
}

function getAlertSummary(alerts) {
  return {
    total: alerts.length,
    behind: alerts.filter(a => a.type === 'behind').length,
    missing: alerts.filter(a => a.type === 'missing').length,
    inactive: alerts.filter(a => a.type === 'inactive').length,
    declining: alerts.filter(a => a.type === 'declining').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length
  };
}

function getSeverityOrder(severity) {
  if (severity === 'high') return 0;
  if (severity === 'medium') return 1;
  return 2;
}

async function getTeacherCourses(teacherId) {
  return db.scan({
    filter: {
      expression: 'entityType = :type AND (instructorId = :teacherId OR creatorId = :teacherId)',
      values: {
        ':type': 'COURSE',
        ':teacherId': teacherId
      }
    }
  });
}

async function getCourseEnrollments(courseId) {
  return db.queryByIndex(
    'GSI1',
    `COURSE#${courseId}`,
    'GSI1PK',
    { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
  );
}

async function getAssignmentsByCourse(courseId) {
  return db.scan({
    filter: {
      expression: 'entityType = :type AND courseId = :courseId',
      values: {
        ':type': 'ASSIGNMENT',
        ':courseId': courseId
      }
    }
  });
}

async function getQuizzesByCourse(courseId) {
  return db.scan({
    filter: {
      expression: 'entityType = :type AND courseId = :courseId',
      values: {
        ':type': 'QUIZ',
        ':courseId': courseId
      }
    }
  });
}

async function getForumsByCourse(courseId) {
  return db.scan({
    filter: {
      expression: 'entityType = :type AND courseId = :courseId',
      values: {
        ':type': 'FORUM',
        ':courseId': courseId
      }
    }
  });
}

function getCourseTitle(course) {
  return course?.title || course?.name || '未命名課程';
}

function isCourseOwner(course, teacherId, isAdmin = false) {
  if (!course || !teacherId) return false;
  if (isAdmin) return true;
  return course.instructorId === teacherId ||
    course.creatorId === teacherId ||
    (Array.isArray(course.instructors) && course.instructors.includes(teacherId));
}

async function getTeacherCourseContext(courseId, teacherId, isAdmin = false) {
  const course = await db.getItem(`COURSE#${courseId}`, 'META');
  if (!course) {
    return {
      ok: false,
      status: 404,
      error: 'COURSE_NOT_FOUND',
      message: '找不到課程'
    };
  }

  if (!isCourseOwner(course, teacherId, isAdmin)) {
    return {
      ok: false,
      status: 403,
      error: 'FORBIDDEN',
      message: '沒有權限查看此課程'
    };
  }

  return { ok: true, course };
}

async function getCachedUserProfile(cache, userId) {
  if (!userId) return null;
  if (cache.has(userId)) return cache.get(userId);
  const user = await db.getUser(userId);
  cache.set(userId, user || null);
  return user || null;
}

function buildTeacherAlert(course, student, tag, nowIso) {
  const courseId = course.courseId;
  const studentId = student.studentId;
  const base = {
    type: tag.type,
    alertId: `${tag.type}_${courseId}_${studentId}`,
    studentId,
    studentName: student.studentName,
    studentEmail: student.studentEmail,
    courseId,
    courseTitle: getCourseTitle(course),
    message: tag.message,
    severity: tag.severity || 'low'
  };

  if (tag.type === 'behind') {
    return {
      ...base,
      currentProgress: student.currentProgress,
      avgProgress: student.avgProgress,
      createdAt: nowIso
    };
  }

  if (tag.type === 'inactive') {
    return {
      ...base,
      lastLogin: student.lastAccessedAt || null,
      createdAt: student.lastAccessedAt || nowIso
    };
  }

  if (tag.type === 'missing') {
    return {
      ...base,
      missingAssignments: student.missingAssignments,
      createdAt: nowIso
    };
  }

  if (tag.type === 'declining') {
    return {
      ...base,
      previousAverage: student.previousQuizAverage,
      currentAverage: student.recentQuizAverage,
      createdAt: student.latestAttemptAt || nowIso
    };
  }

  return { ...base, createdAt: nowIso };
}

async function buildCourseInsights(course, nowTs = Date.now()) {
  const courseId = course?.courseId;
  if (!courseId) {
    return {
      enrollments: [],
      assignments: [],
      quizzes: [],
      avgProgress: 0,
      students: []
    };
  }

  const [enrollments, assignments, quizzes] = await Promise.all([
    getCourseEnrollments(courseId),
    getAssignmentsByCourse(courseId),
    getQuizzesByCourse(courseId)
  ]);

  if (!enrollments || enrollments.length === 0) {
    return {
      enrollments: [],
      assignments,
      quizzes,
      avgProgress: 0,
      students: []
    };
  }

  const studentIds = [...new Set(enrollments.map(e => e.userId).filter(Boolean))];
  const studentProfiles = await Promise.all(studentIds.map(studentId => db.getUser(studentId)));
  const studentMap = new Map();
  studentProfiles.forEach(student => {
    if (student?.userId) studentMap.set(student.userId, student);
  });

  const progressValues = enrollments.map(e => Number(e.progressPercentage) || 0);
  const avgProgress = Math.round(average(progressValues));

  const overdueAssignments = assignments.filter(a => {
    const dueTs = parseTimestamp(a.dueDate);
    return dueTs && dueTs <= nowTs;
  });

  const submittedByAssignment = new Map();
  await Promise.all(overdueAssignments.map(async (assignment) => {
    const submissions = await db.query(`ASSIGNMENT#${assignment.assignmentId}`, { skPrefix: 'SUBMISSION#' });
    const submittedUserSet = new Set(
      submissions
        .filter(s => !!s.submittedAt)
        .map(extractSubmissionUserId)
        .filter(Boolean)
    );
    submittedByAssignment.set(assignment.assignmentId, submittedUserSet);
  }));

  const attemptsByUser = new Map();
  for (const quiz of quizzes) {
    if (!quiz?.quizId) continue;
    const attempts = await db.query(`QUIZ#${quiz.quizId}`, { skPrefix: 'ATTEMPT#' });
    attempts
      .filter(a => a.status === 'completed' && typeof a.percentage === 'number')
      .forEach(a => {
        const userId = extractAttemptUserId(a);
        const timestamp = parseTimestamp(a.submittedAt || a.updatedAt || a.createdAt);
        if (!userId || !timestamp) return;
        const list = attemptsByUser.get(userId) || [];
        list.push({ percentage: Number(a.percentage) || 0, timestamp });
        attemptsByUser.set(userId, list);
      });
  }

  const students = enrollments
    .map(enrollment => {
      const studentId = enrollment.userId;
      if (!studentId) return null;

      const student = studentMap.get(studentId);
      const studentName = student?.displayName || student?.email || studentId;
      const studentEmail = student?.email || '';
      const currentProgress = Number(enrollment.progressPercentage) || 0;
      const progressGap = avgProgress - currentProgress;

      const lastAccessedAt = enrollment.lastAccessedAt || enrollment.updatedAt || enrollment.enrolledAt || null;
      const lastAccessTs = parseTimestamp(lastAccessedAt);
      const inactiveDays = lastAccessTs ? Math.floor((nowTs - lastAccessTs) / MS_PER_DAY) : 999;

      let missingAssignments = 0;
      overdueAssignments.forEach(assignment => {
        const submittedSet = submittedByAssignment.get(assignment.assignmentId) || new Set();
        if (!submittedSet.has(studentId)) missingAssignments++;
      });

      const attempts = (attemptsByUser.get(studentId) || []).slice().sort((a, b) => b.timestamp - a.timestamp);
      const recentAttempts = attempts.slice(0, 2);
      const previousAttempts = attempts.slice(2, 4);
      const recentQuizAverage = recentAttempts.length > 0
        ? Math.round(average(recentAttempts.map(a => a.percentage)))
        : null;
      const previousQuizAverage = previousAttempts.length > 0
        ? Math.round(average(previousAttempts.map(a => a.percentage)))
        : null;
      const quizDecline = previousQuizAverage !== null && recentQuizAverage !== null
        ? previousQuizAverage - recentQuizAverage
        : 0;

      const riskTags = [];
      if (avgProgress >= 20 && progressGap >= 20) {
        riskTags.push({
          type: 'behind',
          severity: progressGap >= 35 ? 'high' : 'medium',
          message: `進度落後平均 ${Math.round(progressGap)}%`
        });
      }
      if (inactiveDays >= 7) {
        riskTags.push({
          type: 'inactive',
          severity: inactiveDays >= 14 ? 'high' : 'medium',
          message: `${inactiveDays} 天未進入課程`
        });
      }
      if (missingAssignments > 0) {
        riskTags.push({
          type: 'missing',
          severity: missingAssignments >= 2 ? 'high' : 'medium',
          message: `有 ${missingAssignments} 份逾期作業未提交`
        });
      }
      if (previousAttempts.length > 0 && quizDecline >= 15) {
        riskTags.push({
          type: 'declining',
          severity: quizDecline >= 25 ? 'high' : 'medium',
          message: `最近測驗平均下降 ${Math.round(quizDecline)} 分`
        });
      }

      const riskLevel = riskTags.some(tag => tag.severity === 'high')
        ? 'high'
        : riskTags.some(tag => tag.severity === 'medium')
          ? 'medium'
          : riskTags.some(tag => tag.severity === 'low')
            ? 'low'
            : 'none';

      return {
        studentId,
        studentName,
        studentEmail,
        currentProgress,
        avgProgress,
        progressGap: Math.max(0, Math.round(progressGap)),
        inactiveDays,
        lastAccessedAt,
        missingAssignments,
        recentQuizAverage,
        previousQuizAverage,
        quizDecline: Math.max(0, Math.round(quizDecline)),
        latestAttemptAt: recentAttempts[0] ? new Date(recentAttempts[0].timestamp).toISOString() : null,
        riskTags,
        riskLevel
      };
    })
    .filter(Boolean);

  return {
    enrollments,
    assignments,
    quizzes,
    avgProgress,
    students
  };
}

/**
 * 獲取教師的學生預警列表
 * GET /api/teachers/alerts
 */
router.get('/alerts', authMiddleware, requireTeachingRole, async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const alerts = [];
    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();

    const courses = await getTeacherCourses(teacherId);

    if (!courses || courses.length === 0) {
      return res.json({
        success: true,
        data: [],
        summary: getAlertSummary([])
      });
    }

    for (const course of courses) {
      const insights = await buildCourseInsights(course, nowTs);
      if (!insights.students || insights.students.length === 0) continue;

      insights.students.forEach(student => {
        student.riskTags.forEach(tag => {
          alerts.push(buildTeacherAlert(course, student, tag, nowIso));
        });
      });
    }

    const dismissedAlerts = await db.query(`TEACHER#${teacherId}`, { skPrefix: 'DISMISSED_ALERT#' });
    const dismissedSet = new Set(dismissedAlerts.map(a => a.alertId));
    const visibleAlerts = alerts.filter(a => !dismissedSet.has(a.alertId));

    visibleAlerts.sort((a, b) => {
      const severityDiff = getSeverityOrder(a.severity) - getSeverityOrder(b.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      success: true,
      data: visibleAlerts,
      summary: getAlertSummary(visibleAlerts)
    });

  } catch (error) {
    console.error('Get teacher alerts error:', error);
    res.status(500).json({
      success: false,
      message: '獲取學生預警失敗',
      error: error.message
    });
  }
});

/**
 * 標記預警為已處理
 * POST /api/teachers/alerts/:alertId/dismiss
 */
router.post('/alerts/:alertId/dismiss', authMiddleware, requireTeachingRole, async (req, res) => {
  try {
    const { alertId } = req.params;
    const teacherId = req.user.userId;
    const { note } = req.body;
    const now = new Date().toISOString();

    // 記錄已處理的預警到 DynamoDB
    await db.putItem({
      PK: `TEACHER#${teacherId}`,
      SK: `DISMISSED_ALERT#${alertId}`,
      entityType: 'DISMISSED_ALERT',
      alertId,
      teacherId,
      note: note || '',
      dismissedAt: now
    });

    res.json({
      success: true,
      message: '已標記為已處理'
    });

  } catch (error) {
    console.error('Dismiss alert error:', error);
    res.status(500).json({
      success: false,
      message: '標記失敗',
      error: error.message
    });
  }
});

/**
 * 獲取教師儀表板統計
 * GET /api/teachers/dashboard
 */
router.get('/dashboard', authMiddleware, requireTeachingRole, async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const courses = await getTeacherCourses(teacherId);
    const nowTs = Date.now();
    const weekAgoTs = nowTs - (7 * MS_PER_DAY);
    const userProfileCache = new Map();

    const studentIdSet = new Set();
    let progressSum = 0;
    let progressCount = 0;
    let pendingAssignments = 0;
    let pendingQuizzes = 0;
    let unrepliedPosts = 0;
    let weeklySubmissions = 0;
    const courseStats = [];
    const gradingQueue = [];
    const recentSubmissions = [];

    for (const course of courses) {
      const courseId = course.courseId;
      if (!courseId) continue;

      const [insights, forums] = await Promise.all([
        buildCourseInsights(course, nowTs),
        getForumsByCourse(courseId)
      ]);

      const courseStudents = insights.students || [];
      courseStudents.forEach(student => {
        if (student.studentId) studentIdSet.add(student.studentId);
        progressSum += student.currentProgress;
        progressCount++;
      });

      let coursePendingAssignments = 0;
      let coursePendingQuizzes = 0;
      let courseUnrepliedPosts = 0;

      for (const assignment of insights.assignments || []) {
        if (!assignment?.assignmentId) continue;
        const submissions = await db.query(`ASSIGNMENT#${assignment.assignmentId}`, { skPrefix: 'SUBMISSION#' });

        for (const sub of submissions) {
          const studentId = extractSubmissionUserId(sub);
          if (studentId) studentIdSet.add(studentId);
          const studentProfile = await getCachedUserProfile(userProfileCache, studentId);
          const studentName = studentProfile?.displayName || studentProfile?.email || studentId || '學生';
          const submittedAt = sub.submittedAt || sub.createdAt || null;
          const queueItem = {
            assignmentId: assignment.assignmentId,
            assignmentTitle: assignment.title || '未命名作業',
            courseId,
            courseTitle: getCourseTitle(course),
            studentId: studentId || null,
            studentName,
            submittedAt,
            gradedAt: sub.gradedAt || null,
            status: sub.status || (sub.gradedAt ? 'graded' : 'submitted')
          };

          if (submittedAt) {
            recentSubmissions.push(queueItem);
          }

          if (sub.submittedAt && !sub.gradedAt) {
            pendingAssignments++;
            coursePendingAssignments++;
            gradingQueue.push(queueItem);
          }

          const submittedAtTs = parseTimestamp(sub.submittedAt || sub.createdAt);
          if (submittedAtTs && submittedAtTs >= weekAgoTs) {
            weeklySubmissions++;
          }
        }
      }

      for (const quiz of insights.quizzes || []) {
        if (!quiz?.quizId) continue;
        const attempts = await db.query(`QUIZ#${quiz.quizId}`, { skPrefix: 'ATTEMPT#' });
        const pendingCount = attempts.filter(a => a.status && a.status !== 'completed').length;
        pendingQuizzes += pendingCount;
        coursePendingQuizzes += pendingCount;
      }

      for (const forum of forums) {
        if (!forum?.forumId) continue;
        const discussions = await db.query(`FORUM#${forum.forumId}`, { skPrefix: 'DISCUSSION#' });

        for (const discussion of discussions) {
          const authoredByTeacher = discussion.authorId === teacherId ||
            discussion.authorId === course.instructorId ||
            discussion.authorRole === 'instructor';
          if (authoredByTeacher) continue;

          const posts = await db.query(`DISCUSSION#${discussion.discussionId}`, { skPrefix: 'POST#' });
          const hasTeacherReply = posts.some(post =>
            post.authorId === teacherId ||
            post.authorId === course.instructorId ||
            post.authorRole === 'instructor' ||
            post.authorRole === 'assistant' ||
            post.authorRole === 'teacher'
          );

          if (!hasTeacherReply) {
            unrepliedPosts++;
            courseUnrepliedPosts++;
          }
        }
      }

      courseStats.push({
        courseId,
        title: getCourseTitle(course),
        studentCount: courseStudents.length,
        avgProgress: insights.avgProgress || 0,
        pendingGrading: coursePendingAssignments,
        pendingAssignments: coursePendingAssignments,
        pendingQuizzes: coursePendingQuizzes,
        unrepliedPosts: courseUnrepliedPosts
      });
    }

    const totalStudents = studentIdSet.size;
    const totalCourses = courseStats.length;
    const avgProgress = progressCount > 0
      ? Math.round(progressSum / progressCount)
      : 0;
    const notifications = await db.query(`USER#${teacherId}`, { skPrefix: 'NOTIFICATION#' });
    const pendingNotifications = notifications.filter(n => !n.readAt).length;

    const sortBySubmittedAtDesc = (a, b) => {
      const aTs = parseTimestamp(a.submittedAt || a.createdAt) || 0;
      const bTs = parseTimestamp(b.submittedAt || b.createdAt) || 0;
      return bTs - aTs;
    };
    const recentSubmissionList = recentSubmissions.sort(sortBySubmittedAtDesc).slice(0, 8);
    const gradingQueueList = gradingQueue.sort(sortBySubmittedAtDesc).slice(0, 8);

    res.json({
      success: true,
      data: {
        totalCourses,
        totalStudents,
        avgProgress,
        pendingAssignments,
        pendingQuizzes,
        unrepliedPosts,
        weeklySubmissions,
        pendingNotifications,
        courses: courseStats,
        gradingQueue: gradingQueueList,
        recentSubmissions: recentSubmissionList
      }
    });

  } catch (error) {
    console.error('Get teacher dashboard error:', error);
    res.status(500).json({
      success: false,
      message: '獲取儀表板統計失敗',
      error: error.message
    });
  }
});

/**
 * 取得課程學生進度
 * GET /api/teachers/courses/:courseId/progress
 */
router.get('/courses/:courseId/progress', authMiddleware, requireTeachingRole, async (req, res) => {
  try {
    const { courseId } = req.params;
    const teacherId = req.user.userId;
    const context = await getTeacherCourseContext(courseId, teacherId, req.user?.isAdmin);

    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const insights = await buildCourseInsights(context.course, Date.now());
    const students = (insights.students || [])
      .map(student => ({
        studentId: student.studentId,
        studentName: student.studentName,
        studentEmail: student.studentEmail,
        progress: student.currentProgress,
        progressGap: student.progressGap,
        inactiveDays: student.inactiveDays,
        lastAccessedAt: student.lastAccessedAt,
        missingAssignments: student.missingAssignments,
        recentQuizAverage: student.recentQuizAverage,
        previousQuizAverage: student.previousQuizAverage,
        quizDecline: student.quizDecline,
        riskLevel: student.riskLevel,
        riskTags: student.riskTags
      }))
      .sort((a, b) => a.progress - b.progress);

    res.json({
      success: true,
      data: {
        courseId,
        courseTitle: getCourseTitle(context.course),
        totalStudents: students.length,
        avgProgress: insights.avgProgress || 0,
        students
      }
    });
  } catch (error) {
    console.error('Get teacher course progress error:', error);
    res.status(500).json({
      success: false,
      message: '取得課程進度失敗',
      error: error.message
    });
  }
});

/**
 * 取得課程高風險學生
 * GET /api/teachers/courses/:courseId/at-risk
 */
router.get('/courses/:courseId/at-risk', authMiddleware, requireTeachingRole, async (req, res) => {
  try {
    const { courseId } = req.params;
    const teacherId = req.user.userId;
    const context = await getTeacherCourseContext(courseId, teacherId, req.user?.isAdmin);

    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const insights = await buildCourseInsights(context.course, Date.now());
    const atRiskStudents = (insights.students || [])
      .filter(student => student.riskTags.length > 0)
      .map(student => ({
        studentId: student.studentId,
        studentName: student.studentName,
        studentEmail: student.studentEmail,
        progress: student.currentProgress,
        inactiveDays: student.inactiveDays,
        missingAssignments: student.missingAssignments,
        quizDecline: student.quizDecline,
        riskLevel: student.riskLevel,
        alerts: student.riskTags.map(tag => ({
          alertId: `${tag.type}_${courseId}_${student.studentId}`,
          type: tag.type,
          severity: tag.severity,
          message: tag.message
        }))
      }))
      .sort((a, b) => getSeverityOrder(a.riskLevel) - getSeverityOrder(b.riskLevel));

    const alertRows = atRiskStudents.flatMap(student =>
      student.alerts.map(alert => ({ type: alert.type, severity: alert.severity }))
    );

    res.json({
      success: true,
      data: {
        courseId,
        courseTitle: getCourseTitle(context.course),
        totalStudents: insights.students?.length || 0,
        totalAtRisk: atRiskStudents.length,
        summary: getAlertSummary(alertRows),
        students: atRiskStudents
      }
    });
  } catch (error) {
    console.error('Get at-risk students error:', error);
    res.status(500).json({
      success: false,
      message: '取得高風險學生失敗',
      error: error.message
    });
  }
});

module.exports = router;
