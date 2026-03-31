/**
 * 課程報告與分析
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse } = require('../../utils/course-access');
const {
  getGradebookSnapshot,
  putGradebookSnapshot
} = require('../../utils/gradebook-snapshots');
const {
  getCourseAssignments,
  getCourseQuizzes,
  buildTeacherCourseGradebookSnapshot
} = require('../../utils/course-gradebook-data');
const {
  getCourseInteractiveVideoActivities,
  getInteractiveVideoAttemptsByActivity,
  normalizeInteractiveVideoGradeItem,
  hasInteractiveVideoAttemptStarted,
  calculateInteractiveVideoScorePercent
} = require('../../utils/interactive-video-data');

const COURSE_PROGRESS_PROJECTION = [
  'PK',
  'lastAccessedAt',
  'progressPercentage',
  'status'
];

const FORUM_PROJECTION = [
  'forumId',
  'title'
];

const DISCUSSION_PROJECTION = [
  'discussionId',
  'authorId'
];

const POST_PROJECTION = [
  'authorId'
];

async function getCourseForums(courseId) {
  return db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'FORUM#',
    projection: FORUM_PROJECTION
  });
}

async function getForumDiscussions(forumId) {
  return db.query(`FORUM#${forumId}`, {
    skPrefix: 'DISCUSSION#',
    projection: DISCUSSION_PROJECTION
  });
}

async function getDiscussionPosts(discussionId) {
  return db.query(`DISCUSSION#${discussionId}`, {
    skPrefix: 'POST#',
    projection: POST_PROJECTION
  });
}

function filterSnapshotColumns(columns = [], types = []) {
  const allowedTypes = new Set(types);
  return columns.filter(column => allowedTypes.has(column.type));
}

function getStudentGrade(student, itemId) {
  return student?.grades?.[itemId] || null;
}

function extractUserIdFromPk(pk = '') {
  if (typeof pk !== 'string' || !pk.startsWith('USER#')) return null;
  return pk.slice('USER#'.length);
}

function roundNumber(value, digits = 0) {
  if (!Number.isFinite(Number(value))) return null;
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function gradeToPercentage(grade, maxGrade) {
  const numericGrade = Number(grade);
  const numericMax = Number(maxGrade);
  if (!Number.isFinite(numericGrade) || !Number.isFinite(numericMax) || numericMax <= 0) {
    return null;
  }
  return roundNumber((numericGrade / numericMax) * 100, 2);
}

function buildLetterGrade(percentage) {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

function formatDateForReport(value, fallback = 'N/A') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('zh-TW');
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function getTeacherCourseReportSnapshot(courseId, course) {
  const snapshot = await getGradebookSnapshot(courseId);
  if (snapshot?.data) {
    return snapshot.data;
  }

  const snapshotData = await buildTeacherCourseGradebookSnapshot(courseId, course);
  await putGradebookSnapshot(courseId, snapshotData, {
    source: 'course-reports'
  });
  return snapshotData;
}

async function getCourseProgressMap(courseId, studentIds = []) {
  const uniqueStudentIds = [...new Set(studentIds.filter(Boolean))];
  if (uniqueStudentIds.length === 0) {
    return new Map();
  }

  const progressRows = await db.batchGetItems(
    uniqueStudentIds.map(studentId => ({
      PK: `USER#${studentId}`,
      SK: `PROG#COURSE#${courseId}`
    })),
    { projection: COURSE_PROGRESS_PROJECTION }
  );

  return new Map(
    progressRows
      .map(row => [extractUserIdFromPk(row.PK), row])
      .filter(([studentId]) => !!studentId)
  );
}

function incrementForumActivity(studentActivity, userId, field) {
  if (!userId) return;
  const current = studentActivity.get(userId) || {
    forumPosts: 0,
    forumReplies: 0
  };
  current[field] += 1;
  studentActivity.set(userId, current);
}

async function buildForumReportData(courseId) {
  const forums = await getCourseForums(courseId);
  if (forums.length === 0) {
    return {
      forums: [],
      forumStats: new Map(),
      studentActivity: new Map()
    };
  }

  const discussionEntries = await Promise.all(
    forums
      .filter(forum => forum?.forumId)
      .map(async forum => [forum.forumId, await getForumDiscussions(forum.forumId)])
  );
  const discussionsByForum = new Map(discussionEntries);
  const allDiscussions = discussionEntries.flatMap(([forumId, discussions]) => (
    discussions.map(discussion => ({ forumId, discussion }))
  ));

  const postEntries = await Promise.all(
    allDiscussions.map(async ({ discussion }) => (
      [discussion.discussionId, await getDiscussionPosts(discussion.discussionId)]
    ))
  );
  const postsByDiscussion = new Map(postEntries);

  const forumStats = new Map();
  const studentActivity = new Map();

  forums.forEach(forum => {
    const discussions = discussionsByForum.get(forum.forumId) || [];
    const participatingStudents = new Set();
    let totalReplies = 0;

    discussions.forEach(discussion => {
      if (discussion.authorId) {
        participatingStudents.add(discussion.authorId);
        incrementForumActivity(studentActivity, discussion.authorId, 'forumPosts');
      }

      const posts = postsByDiscussion.get(discussion.discussionId) || [];
      totalReplies += posts.length;

      posts.forEach(post => {
        if (!post.authorId) return;
        participatingStudents.add(post.authorId);
        incrementForumActivity(studentActivity, post.authorId, 'forumReplies');
      });
    });

    forumStats.set(forum.forumId, {
      participatingStudents: participatingStudents.size,
      totalDiscussions: discussions.length,
      totalReplies
    });
  });

  return {
    forums,
    forumStats,
    studentActivity
  };
}

function buildAssignmentActivityStats(snapshotStudents = [], assignments = []) {
  return assignments.map(assignment => {
    let submitted = 0;
    let graded = 0;
    const grades = [];

    snapshotStudents.forEach(student => {
      const gradeEntry = getStudentGrade(student, assignment.assignmentId);
      if (!gradeEntry) return;

      if (gradeEntry.submitted) {
        submitted++;
      }

      if (gradeEntry.grade !== null && gradeEntry.grade !== undefined) {
        graded++;
        grades.push(Number(gradeEntry.grade));
      }
    });

    return {
      type: 'assignment',
      id: assignment.assignmentId,
      title: assignment.title,
      dueDate: assignment.dueDate,
      maxGrade: assignment.maxGrade || 100,
      stats: {
        submitted,
        graded,
        avgGrade: grades.length > 0
          ? roundNumber(grades.reduce((sum, grade) => sum + grade, 0) / grades.length, 0)
          : null
      }
    };
  });
}

function buildQuizActivityStats(snapshotStudents = [], quizzes = []) {
  return quizzes.map(quiz => {
    let attempted = 0;
    let passed = 0;
    const scores = [];
    const maxGrade = quiz.totalPoints || 100;
    const passingGrade = quiz.passingGrade || 60;

    snapshotStudents.forEach(student => {
      const gradeEntry = getStudentGrade(student, quiz.quizId);
      if (!gradeEntry?.submitted) return;

      attempted++;
      const percentage = gradeToPercentage(gradeEntry.grade, maxGrade);
      if (percentage === null) return;

      scores.push(percentage);
      if (percentage >= passingGrade) {
        passed++;
      }
    });

    return {
      type: 'quiz',
      id: quiz.quizId,
      title: quiz.title,
      openDate: quiz.openDate,
      closeDate: quiz.closeDate,
      timeLimit: quiz.timeLimit,
      maxAttempts: quiz.maxAttempts,
      passingGrade,
      stats: {
        attempted,
        passed,
        avgScore: scores.length > 0
          ? roundNumber(scores.reduce((sum, score) => sum + score, 0) / scores.length, 0)
          : null
      }
    };
  });
}

function buildInteractiveVideoActivityStats(interactiveVideos = [], attemptsByActivity = new Map()) {
  return interactiveVideos
    .map((activity) => {
      const item = normalizeInteractiveVideoGradeItem(activity);
      if (!item) return null;

      const attemptMap = attemptsByActivity.get(item.itemId) || new Map();
      let attempted = 0;
      let completed = 0;
      const watchRates = [];
      const scores = [];

      [...attemptMap.values()].forEach((attempt) => {
        if (!hasInteractiveVideoAttemptStarted(attempt)) return;
        attempted++;
        if (attempt.status === 'completed') {
          completed++;
        }
        const progressPercentage = Number(attempt.progressPercentage || 0);
        if (Number.isFinite(progressPercentage) && progressPercentage > 0) {
          watchRates.push(progressPercentage);
        }
        const scorePercent = calculateInteractiveVideoScorePercent(attempt, item);
        if (Number.isFinite(scorePercent)) {
          scores.push(scorePercent);
        }
      });

      return {
        type: 'interactive_video',
        id: item.itemId,
        title: item.title,
        passingScore: item.passingScore,
        maxGrade: item.maxGrade || 0,
        promptCount: item.promptCount || 0,
        stats: {
          attempted,
          completed,
          avgWatchPercent: watchRates.length > 0
            ? roundNumber(watchRates.reduce((sum, value) => sum + value, 0) / watchRates.length, 0)
            : null,
          avgScore: scores.length > 0
            ? roundNumber(scores.reduce((sum, value) => sum + value, 0) / scores.length, 0)
            : null
        }
      };
    })
    .filter(Boolean);
}

function buildGradeAnalysisStudents(snapshotStudents = [], columns = []) {
  return snapshotStudents.map(student => {
    const result = {
      studentId: student.userId,
      studentName: student.name || 'Unknown',
      studentEmail: student.email || '',
      items: {},
      totalPoints: 0,
      maxPoints: 0,
      percentage: 0
    };

    columns.forEach(column => {
      const gradeEntry = getStudentGrade(student, column.itemId);
      if (!gradeEntry || gradeEntry.grade === null || gradeEntry.grade === undefined) {
        return;
      }

      if (column.type === 'quiz') {
        const percentage = gradeToPercentage(gradeEntry.grade, column.maxGrade || 100);
        if (percentage === null) return;

        result.items[column.itemId] = {
          grade: roundNumber(percentage, 0),
          maxGrade: 100,
          percentage: roundNumber(percentage, 0)
        };
        result.totalPoints += percentage;
        result.maxPoints += 100;
        return;
      }

      const grade = Number(gradeEntry.grade);
      const maxGrade = Number(column.maxGrade || 100);
      if (!Number.isFinite(grade) || !Number.isFinite(maxGrade) || maxGrade <= 0) {
        return;
      }

      result.items[column.itemId] = {
        grade,
        maxGrade,
        percentage: roundNumber((grade / maxGrade) * 100, 0)
      };
      result.totalPoints += grade;
      result.maxPoints += maxGrade;
    });

    result.percentage = result.maxPoints > 0
      ? roundNumber((result.totalPoints / result.maxPoints) * 100, 0)
      : 0;

    return result;
  });
}

function buildDistribution(percentages = []) {
  return {
    'A (90-100)': percentages.filter(percentage => percentage >= 90).length,
    'B (80-89)': percentages.filter(percentage => percentage >= 80 && percentage < 90).length,
    'C (70-79)': percentages.filter(percentage => percentage >= 70 && percentage < 80).length,
    'D (60-69)': percentages.filter(percentage => percentage >= 60 && percentage < 70).length,
    'F (<60)': percentages.filter(percentage => percentage < 60).length
  };
}

function safeReportFilename(title, suffix) {
  const safeTitle = String(title || 'course').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  const dateLabel = new Date().toISOString().split('T')[0];
  return `${safeTitle}_${suffix}_${dateLabel}.csv`;
}

// ==================== 課程報告與分析 ====================

/**
 * GET /api/courses/:id/participation-report
 * 課程參與報告
 * 教師功能
 */
router.get('/:id/participation-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看報告'
      });
    }

    const snapshotData = await getTeacherCourseReportSnapshot(id, course);
    const studentIds = snapshotData.students.map(student => student.userId);
    const [progressMap, forumReport] = await Promise.all([
      getCourseProgressMap(id, studentIds),
      buildForumReportData(id)
    ]);

    const assignmentColumns = filterSnapshotColumns(snapshotData.columns, ['assignment']);
    const quizColumns = filterSnapshotColumns(snapshotData.columns, ['quiz']);
    const interactiveVideoColumns = filterSnapshotColumns(snapshotData.columns, ['interactive_video']);

    const studentParticipation = snapshotData.students.map(student => {
      const progress = progressMap.get(student.userId) || null;
      const forumActivity = forumReport.studentActivity.get(student.userId) || {
        forumPosts: 0,
        forumReplies: 0
      };

      const assignmentSubmissions = assignmentColumns.reduce((count, column) => (
        count + (getStudentGrade(student, column.itemId)?.submitted ? 1 : 0)
      ), 0);

      const quizAttempts = quizColumns.reduce((count, column) => (
        count + (getStudentGrade(student, column.itemId)?.submitted ? 1 : 0)
      ), 0);
      const interactiveVideoAttempts = interactiveVideoColumns.reduce((count, column) => (
        count + (getStudentGrade(student, column.itemId)?.submitted ? 1 : 0)
      ), 0);
      const interactiveVideoCompleted = interactiveVideoColumns.reduce((count, column) => (
        count + (getStudentGrade(student, column.itemId)?.progressPercentage >= 100 ? 1 : 0)
      ), 0);

      return {
        studentId: student.userId,
        studentName: student.name || student.email || 'Unknown',
        studentEmail: student.email || '',
        enrolledAt: student.enrolledAt,
        lastAccessed: progress?.lastAccessedAt || student.lastAccess || null,
        progressPercentage: progress?.progressPercentage || 0,
        status: progress?.status || 'not_started',
        activities: {
          assignmentSubmissions,
          totalAssignments: assignmentColumns.length,
          quizAttempts,
          totalQuizzes: quizColumns.length,
          interactiveVideoAttempts,
          interactiveVideoCompleted,
          totalInteractiveVideos: interactiveVideoColumns.length,
          forumPosts: forumActivity.forumPosts,
          forumReplies: forumActivity.forumReplies
        }
      };
    });

    const totalStudents = studentParticipation.length;
    const activeStudents = studentParticipation.filter(student => student.lastAccessed).length;
    const completedStudents = studentParticipation.filter(student => student.status === 'completed').length;
    const averageProgress = totalStudents > 0
      ? roundNumber(
        studentParticipation.reduce((sum, student) => sum + Number(student.progressPercentage || 0), 0) / totalStudents,
        0
      )
      : 0;

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),
        summary: {
          totalStudents,
          activeStudents,
          completedStudents,
          completionRate: totalStudents > 0
            ? roundNumber((completedStudents / totalStudents) * 100, 0)
            : 0,
          averageProgress,
          totalAssignments: assignmentColumns.length,
          totalQuizzes: quizColumns.length,
          totalInteractiveVideos: interactiveVideoColumns.length,
          totalForums: forumReport.forums.length
        },
        students: studentParticipation.sort((a, b) => b.progressPercentage - a.progressPercentage)
      }
    });
  } catch (error) {
    console.error('Get participation report error:', error);
    res.status(500).json({
      success: false,
      error: 'REPORT_FAILED',
      message: '生成報告失敗'
    });
  }
});

/**
 * GET /api/courses/:id/activity-report
 * 活動完成報告
 * 教師功能
 */
router.get('/:id/activity-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看報告'
      });
    }

    const [snapshotData, assignments, quizzes, interactiveVideos, forumReport] = await Promise.all([
      getTeacherCourseReportSnapshot(id, course),
      getCourseAssignments(id),
      getCourseQuizzes(id),
      getCourseInteractiveVideoActivities(id),
      buildForumReportData(id)
    ]);

    const totalStudents = snapshotData.students.length;
    const interactiveVideoAttemptsByActivity = await getInteractiveVideoAttemptsByActivity(
      id,
      interactiveVideos,
      snapshotData.students.map((student) => student.userId)
    );
    const assignmentActivities = buildAssignmentActivityStats(snapshotData.students, assignments)
      .map(activity => ({
        ...activity,
        stats: {
          ...activity.stats,
          totalStudents,
          notSubmitted: totalStudents - activity.stats.submitted,
          submissionRate: totalStudents > 0
            ? roundNumber((activity.stats.submitted / totalStudents) * 100, 0)
            : 0
        }
      }));

    const quizActivities = buildQuizActivityStats(snapshotData.students, quizzes)
      .map(activity => ({
        ...activity,
        stats: {
          ...activity.stats,
          totalStudents,
          notAttempted: totalStudents - activity.stats.attempted,
          attemptRate: totalStudents > 0
            ? roundNumber((activity.stats.attempted / totalStudents) * 100, 0)
            : 0,
          passRate: activity.stats.attempted > 0
            ? roundNumber((activity.stats.passed / activity.stats.attempted) * 100, 0)
            : 0
        }
      }));
    const interactiveVideoActivities = buildInteractiveVideoActivityStats(interactiveVideos, interactiveVideoAttemptsByActivity)
      .map((activity) => ({
        ...activity,
        stats: {
          ...activity.stats,
          totalStudents,
          notStarted: totalStudents - activity.stats.attempted,
          attemptRate: totalStudents > 0
            ? roundNumber((activity.stats.attempted / totalStudents) * 100, 0)
            : 0,
          completionRate: activity.stats.attempted > 0
            ? roundNumber((activity.stats.completed / activity.stats.attempted) * 100, 0)
            : 0
        }
      }));

    const forumActivities = forumReport.forums.map(forum => {
      const stats = forumReport.forumStats.get(forum.forumId) || {
        participatingStudents: 0,
        totalDiscussions: 0,
        totalReplies: 0
      };

      return {
        type: 'forum',
        id: forum.forumId,
        title: forum.title,
        stats: {
          totalStudents,
          participatingStudents: stats.participatingStudents,
          totalDiscussions: stats.totalDiscussions,
          totalReplies: stats.totalReplies,
          participationRate: totalStudents > 0
            ? roundNumber((stats.participatingStudents / totalStudents) * 100, 0)
            : 0
        }
      };
    });

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),
        totalStudents,
        activities: [
          ...assignmentActivities,
          ...quizActivities,
          ...interactiveVideoActivities,
          ...forumActivities
        ]
      }
    });
  } catch (error) {
    console.error('Get activity report error:', error);
    res.status(500).json({
      success: false,
      error: 'REPORT_FAILED',
      message: '生成報告失敗'
    });
  }
});

/**
 * GET /api/courses/:id/grade-analysis
 * 成績分析
 * 教師功能
 */
router.get('/:id/grade-analysis', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看分析'
      });
    }

    const snapshotData = await getTeacherCourseReportSnapshot(id, course);
    const gradeColumns = filterSnapshotColumns(snapshotData.columns, ['assignment', 'quiz', 'interactive_video']);
    const students = buildGradeAnalysisStudents(snapshotData.students, gradeColumns)
      .sort((a, b) => b.percentage - a.percentage);

    const percentages = students.map(student => student.percentage);
    const summary = {
      totalStudents: students.length,
      averagePercentage: percentages.length > 0
        ? roundNumber(percentages.reduce((sum, percentage) => sum + percentage, 0) / percentages.length, 0)
        : 0,
      highestPercentage: percentages.length > 0 ? Math.max(...percentages) : 0,
      lowestPercentage: percentages.length > 0 ? Math.min(...percentages) : 0,
      passRate: percentages.length > 0
        ? roundNumber((percentages.filter(percentage => percentage >= 60).length / percentages.length) * 100, 0)
        : 0,
      totalGradeItems: gradeColumns.length
    };

    const gradeItems = gradeColumns.map(column => ({
      type: column.type,
      id: column.itemId,
      title: column.title,
      maxGrade: column.type === 'quiz' ? 100 : (column.maxGrade || 100),
      weight: column.weight || 1
    }));

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),
        summary,
        distribution: buildDistribution(percentages),
        gradeItems,
        students
      }
    });
  } catch (error) {
    console.error('Get grade analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'ANALYSIS_FAILED',
      message: '生成分析失敗'
    });
  }
});

/**
 * GET /api/courses/:id/export-report
 * 匯出課程報告 (CSV)
 * 教師功能
 */
router.get('/:id/export-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'grades' } = req.query;

    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限匯出報告'
      });
    }

    const snapshotData = await getTeacherCourseReportSnapshot(id, course);
    let csvContent = '';
    let filename = '';

    if (type === 'participation') {
      const progressMap = await getCourseProgressMap(
        id,
        snapshotData.students.map(student => student.userId)
      );

      const headers = ['學生姓名', '學生 Email', '報名日期', '最後存取', '進度 %', '狀態'];
      const rows = snapshotData.students.map(student => {
        const progress = progressMap.get(student.userId) || null;
        return [
          student.name || 'Unknown',
          student.email || 'N/A',
          formatDateForReport(student.enrolledAt),
          formatDateForReport(progress?.lastAccessedAt || student.lastAccess, '從未存取'),
          progress?.progressPercentage || 0,
          progress?.status === 'completed'
            ? '已完成'
            : (progress?.status === 'in_progress' ? '進行中' : '未開始')
        ];
      });

      csvContent = [headers.join(','), ...rows.map(row => row.map(escapeCsvCell).join(','))].join('\n');
      filename = safeReportFilename(course.title, '參與報告');
    } else {
      const gradeColumns = filterSnapshotColumns(snapshotData.columns, ['assignment', 'quiz', 'interactive_video']);
      const headers = ['學生姓名', '學生 Email'];

      gradeColumns.forEach(column => {
        headers.push(`${column.type === 'assignment' ? '作業' : column.type === 'interactive_video' ? '互動影片' : '測驗'}: ${column.title}`);
      });
      headers.push('總分', '百分比', '等級');

      const rows = snapshotData.students.map(student => {
        const row = [student.name || 'Unknown', student.email || 'N/A'];
        let totalPoints = 0;
        let maxPoints = 0;

        gradeColumns.forEach(column => {
          const gradeEntry = getStudentGrade(student, column.itemId);
          if (!gradeEntry || gradeEntry.grade === null || gradeEntry.grade === undefined) {
            row.push('-');
            return;
          }

          if (column.type === 'quiz') {
            const percentage = gradeToPercentage(gradeEntry.grade, column.maxGrade || 100);
            row.push(percentage === null ? '-' : roundNumber(percentage, 0));
            if (percentage !== null) {
              totalPoints += percentage;
              maxPoints += 100;
            }
            return;
          }

          const grade = Number(gradeEntry.grade);
          row.push(grade);
          totalPoints += grade;
          maxPoints += Number(column.maxGrade || 100);
        });

        const percentage = maxPoints > 0
          ? roundNumber((totalPoints / maxPoints) * 100, 0)
          : 0;
        row.push(
          roundNumber(totalPoints, 2),
          `${percentage}%`,
          buildLetterGrade(percentage)
        );
        return row;
      });

      csvContent = [headers.join(','), ...rows.map(row => row.map(escapeCsvCell).join(','))].join('\n');
      filename = safeReportFilename(course.title, '成績報告');
    }

    const csvWithBom = '\uFEFF' + csvContent;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csvWithBom);
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出報告失敗'
    });
  }
});

module.exports = router;
