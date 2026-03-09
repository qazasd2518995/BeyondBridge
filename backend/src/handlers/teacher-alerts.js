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
      const courseId = course.courseId;
      if (!courseId) continue;

      const [enrollments, assignments, quizzes] = await Promise.all([
        getCourseEnrollments(courseId),
        getAssignmentsByCourse(courseId),
        getQuizzesByCourse(courseId)
      ]);

      if (!enrollments || enrollments.length === 0) continue;

      const studentIds = [...new Set(enrollments.map(e => e.userId).filter(Boolean))];
      const studentProfiles = await Promise.all(studentIds.map(studentId => db.getUser(studentId)));
      const studentMap = new Map();
      studentProfiles.forEach(student => {
        if (student?.userId) studentMap.set(student.userId, student);
      });

      const progressValues = enrollments
        .map(e => Number(e.progressPercentage) || 0);
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

      enrollments.forEach(enrollment => {
        const studentId = enrollment.userId;
        if (!studentId) return;

        const student = studentMap.get(studentId);
        const studentName = student?.displayName || student?.email || studentId;
        const studentEmail = student?.email || '';
        const currentProgress = Number(enrollment.progressPercentage) || 0;

        const progressGap = avgProgress - currentProgress;
        if (avgProgress >= 20 && progressGap >= 20) {
          alerts.push({
            type: 'behind',
            alertId: `behind_${courseId}_${studentId}`,
            studentId,
            studentName,
            studentEmail,
            courseId,
            courseTitle: course.title,
            message: `進度落後平均 ${Math.round(progressGap)}%`,
            currentProgress,
            avgProgress,
            severity: progressGap >= 35 ? 'high' : 'medium',
            createdAt: nowIso
          });
        }

        const lastAccessedAt = enrollment.lastAccessedAt || enrollment.updatedAt || enrollment.enrolledAt || null;
        const lastAccessTs = parseTimestamp(lastAccessedAt);
        const inactiveDays = lastAccessTs ? Math.floor((nowTs - lastAccessTs) / MS_PER_DAY) : 999;
        if (inactiveDays >= 7) {
          alerts.push({
            type: 'inactive',
            alertId: `inactive_${courseId}_${studentId}`,
            studentId,
            studentName,
            studentEmail,
            courseId,
            courseTitle: course.title,
            message: `${inactiveDays} 天未進入課程`,
            lastLogin: lastAccessedAt,
            severity: inactiveDays >= 14 ? 'high' : 'medium',
            createdAt: lastAccessedAt || nowIso
          });
        }

        let missingCount = 0;
        overdueAssignments.forEach(assignment => {
          const submittedSet = submittedByAssignment.get(assignment.assignmentId) || new Set();
          if (!submittedSet.has(studentId)) missingCount++;
        });
        if (missingCount > 0) {
          alerts.push({
            type: 'missing',
            alertId: `missing_${courseId}_${studentId}`,
            studentId,
            studentName,
            studentEmail,
            courseId,
            courseTitle: course.title,
            message: `有 ${missingCount} 份逾期作業未提交`,
            missingAssignments: missingCount,
            severity: missingCount >= 2 ? 'high' : 'medium',
            createdAt: nowIso
          });
        }

        const attempts = attemptsByUser.get(studentId) || [];
        if (attempts.length >= 3) {
          attempts.sort((a, b) => b.timestamp - a.timestamp);
          const recent = attempts.slice(0, 2);
          const previous = attempts.slice(2, 4);
          const recentAvg = average(recent.map(a => a.percentage));
          const previousAvg = average(previous.map(a => a.percentage));
          const decline = previousAvg - recentAvg;
          if (previous.length > 0 && decline >= 15) {
            alerts.push({
              type: 'declining',
              alertId: `declining_${courseId}_${studentId}`,
              studentId,
              studentName,
              studentEmail,
              courseId,
              courseTitle: course.title,
              message: `最近測驗平均下降 ${Math.round(decline)} 分`,
              previousAverage: Math.round(previousAvg),
              currentAverage: Math.round(recentAvg),
              severity: decline >= 25 ? 'high' : 'medium',
              createdAt: new Date(recent[0].timestamp).toISOString()
            });
          }
        }
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

    const totalCourses = courses.length;
    const studentIdSet = new Set();
    let progressSum = 0;
    let progressCount = 0;
    let pendingAssignments = 0;
    let pendingQuizzes = 0;
    let unrepliedPosts = 0;
    let weeklySubmissions = 0;

    for (const course of courses) {
      const courseId = course.courseId;
      if (!courseId) continue;

      const [enrollments, assignments, quizzes, forums] = await Promise.all([
        getCourseEnrollments(courseId),
        getAssignmentsByCourse(courseId),
        getQuizzesByCourse(courseId),
        getForumsByCourse(courseId)
      ]);

      enrollments.forEach(enrollment => {
        if (enrollment.userId) studentIdSet.add(enrollment.userId);
        progressSum += Number(enrollment.progressPercentage) || 0;
        progressCount++;
      });

      for (const assignment of assignments) {
        if (!assignment?.assignmentId) continue;
        const submissions = await db.query(`ASSIGNMENT#${assignment.assignmentId}`, { skPrefix: 'SUBMISSION#' });

        submissions.forEach(sub => {
          if (sub.submittedAt && !sub.gradedAt) {
            pendingAssignments++;
          }

          const submittedAtTs = parseTimestamp(sub.submittedAt || sub.createdAt);
          if (submittedAtTs && submittedAtTs >= weekAgoTs) {
            weeklySubmissions++;
          }
        });
      }

      for (const quiz of quizzes) {
        if (!quiz?.quizId) continue;
        const attempts = await db.query(`QUIZ#${quiz.quizId}`, { skPrefix: 'ATTEMPT#' });
        pendingQuizzes += attempts.filter(a => a.status && a.status !== 'completed').length;
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
          }
        }
      }
    }

    const totalStudents = studentIdSet.size;
    const avgProgress = progressCount > 0
      ? Math.round(progressSum / progressCount)
      : 0;

    res.json({
      success: true,
      data: {
        totalCourses,
        totalStudents,
        avgProgress,
        pendingAssignments,
        pendingQuizzes,
        unrepliedPosts,
        weeklySubmissions
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

module.exports = router;
