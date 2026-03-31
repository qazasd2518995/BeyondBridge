const db = require('./db');
const {
  normalizeInteractiveVideoGradeItem,
  getCourseInteractiveVideoActivities,
  getInteractiveVideoAttemptsByActivity,
  hasInteractiveVideoAttemptStarted
} = require('./interactive-video-data');

const GRADEBOOK_ASSIGNMENT_PROJECTION = [
  'assignmentId',
  'title',
  'maxGrade',
  'weight',
  'dueDate'
];

const GRADEBOOK_QUIZ_PROJECTION = [
  'quizId',
  'title',
  'totalPoints',
  'weight',
  'openDate',
  'closeDate',
  'gradeMethod',
  'passingGrade',
  'maxAttempts',
  'timeLimit'
];

const GRADEBOOK_MANUAL_ITEM_PROJECTION = [
  'itemId',
  'title',
  'maxGrade',
  'weight',
  'categoryId',
  'dueDate',
  'description',
  'hidden',
  'locked',
  'createdBy',
  'createdAt',
  'updatedAt'
];

const GRADEBOOK_SUBMISSION_PROJECTION = [
  'userId',
  'grade',
  'submittedAt',
  'createdAt',
  'gradedAt',
  'feedback',
  'isLate',
  'status',
  'SK'
];

const GRADEBOOK_ATTEMPT_PROJECTION = [
  'userId',
  'status',
  'percentage',
  'score',
  'submittedAt',
  'updatedAt',
  'createdAt',
  'SK'
];

const GRADEBOOK_MANUAL_RECORD_PROJECTION = [
  'studentId',
  'grade',
  'gradedAt',
  'feedback',
  'updatedAt',
  'SK'
];

function normalizeManualItem(item = {}) {
  return {
    id: item.itemId,
    itemId: item.itemId,
    type: 'manual',
    title: item.title,
    maxGrade: item.maxGrade,
    maxScore: item.maxGrade,
    weight: item.weight,
    categoryId: item.categoryId || 'default_participation',
    dueDate: item.dueDate,
    description: item.description || '',
    hidden: item.hidden || false,
    locked: item.locked || false,
    createdBy: item.createdBy || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

async function getCourseAssignments(courseId) {
  return db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'ASSIGNMENT#',
    projection: GRADEBOOK_ASSIGNMENT_PROJECTION
  });
}

async function getCourseQuizzes(courseId) {
  return db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'QUIZ#',
    projection: GRADEBOOK_QUIZ_PROJECTION
  });
}

async function getCourseGradeItems(courseId) {
  const [assignments, quizzes, interactiveVideos, manualItems] = await Promise.all([
    getCourseAssignments(courseId),
    getCourseQuizzes(courseId),
    getCourseInteractiveVideoActivities(courseId, { gradedOnly: true }),
    db.query(`COURSE#${courseId}`, {
      skPrefix: 'GRADEITEM#',
      projection: GRADEBOOK_MANUAL_ITEM_PROJECTION
    })
  ]);

  return { assignments, quizzes, interactiveVideos, manualItems };
}

function mapRowsByStudent(rows = [], studentKey = 'userId') {
  const mapped = new Map();
  rows.forEach(row => {
    const studentId = row?.[studentKey] || row?.studentId || (
      typeof row?.SK === 'string' && row.SK.startsWith('STUDENT#')
        ? row.SK.replace('STUDENT#', '')
        : null
    );
    if (!studentId) return;
    mapped.set(studentId, row);
  });
  return mapped;
}

function groupAttemptsByStudent(rows = []) {
  const grouped = new Map();
  rows.forEach(row => {
    if (!row?.userId) return;
    const bucket = grouped.get(row.userId);
    if (bucket) {
      bucket.push(row);
      return;
    }
    grouped.set(row.userId, [row]);
  });
  return grouped;
}

function getQuizGradeSummary(quiz, attempts = []) {
  const completedAttempts = attempts.filter(a => a.status === 'completed');
  if (completedAttempts.length === 0) {
    return {
      completedAttempts: [],
      bestScore: null,
      bestPercentage: null,
      bestAttempt: null,
      attemptCount: 0
    };
  }

  let selectedAttempt = completedAttempts[0];
  if (quiz.gradeMethod === 'highest') {
    selectedAttempt = completedAttempts.reduce((max, attempt) => (
      (attempt.percentage || 0) > (max?.percentage || 0) ? attempt : max
    ), completedAttempts[0]);
  } else if (quiz.gradeMethod === 'average') {
    const bestScore = completedAttempts.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / completedAttempts.length;
    const bestPercentage = completedAttempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0) / completedAttempts.length;
    return {
      completedAttempts,
      bestScore,
      bestPercentage,
      bestAttempt: null,
      attemptCount: completedAttempts.length
    };
  } else if (quiz.gradeMethod === 'last') {
    selectedAttempt = completedAttempts[completedAttempts.length - 1];
  }

  return {
    completedAttempts,
    bestScore: selectedAttempt?.score ?? null,
    bestPercentage: selectedAttempt?.percentage ?? null,
    bestAttempt: selectedAttempt || null,
    attemptCount: completedAttempts.length
  };
}

async function buildCourseGradebookDataset(courseId) {
  const { assignments, quizzes, interactiveVideos, manualItems } = await getCourseGradeItems(courseId);
  const enrollments = await db.queryByIndex(
    'GSI1',
    `COURSE#${courseId}`,
    'GSI1PK',
    { skPrefix: 'ENROLLED#', skName: 'GSI1SK', projection: ['userId'] }
  );
  const studentIds = enrollments.map((item) => item.userId).filter(Boolean);

  const [submissionEntries, attemptEntries, interactiveVideoAttemptsByActivity, manualRecordEntries] = await Promise.all([
    Promise.all(
      assignments
        .filter(item => item?.assignmentId)
        .map(async assignment => [
          assignment.assignmentId,
          mapRowsByStudent(await db.query(`ASSIGNMENT#${assignment.assignmentId}`, {
            skPrefix: 'SUBMISSION#',
            projection: GRADEBOOK_SUBMISSION_PROJECTION
          }))
        ])
    ),
    Promise.all(
      quizzes
        .filter(item => item?.quizId)
        .map(async quiz => [
          quiz.quizId,
          groupAttemptsByStudent(await db.query(`QUIZ#${quiz.quizId}`, {
            skPrefix: 'ATTEMPT#',
            projection: GRADEBOOK_ATTEMPT_PROJECTION
          }))
        ])
    ),
    getInteractiveVideoAttemptsByActivity(courseId, interactiveVideos, studentIds),
    Promise.all(
      manualItems
        .filter(item => item?.itemId)
        .map(async item => [
          item.itemId,
          mapRowsByStudent(await db.query(`GRADEITEM#${item.itemId}`, {
            skPrefix: 'STUDENT#',
            projection: GRADEBOOK_MANUAL_RECORD_PROJECTION
          }), 'studentId')
        ])
    )
  ]);

  return {
    assignments,
    quizzes,
    interactiveVideos,
    manualItems,
    submissionsByAssignment: new Map(submissionEntries),
    attemptsByQuiz: new Map(attemptEntries),
    interactiveVideoAttemptsByActivity,
    manualRecordsByItem: new Map(manualRecordEntries)
  };
}

async function getEnrollmentUserMap(enrollments = []) {
  const users = await db.getUsersByIds(enrollments.map(enrollment => enrollment.userId));
  return new Map(users.filter(user => user?.userId).map(user => [user.userId, user]));
}

function buildGradeColumns(assignments = [], quizzes = [], interactiveVideos = [], manualItems = []) {
  return [
    ...assignments.map(a => ({
      id: a.assignmentId,
      itemId: a.assignmentId,
      type: 'assignment',
      title: a.title,
      maxGrade: a.maxGrade,
      maxScore: a.maxGrade,
      weight: a.weight,
      dueDate: a.dueDate
    })),
    ...quizzes.map(q => ({
      id: q.quizId,
      itemId: q.quizId,
      type: 'quiz',
      title: q.title,
      maxGrade: q.totalPoints,
      maxScore: q.totalPoints,
      weight: q.weight,
      dueDate: q.closeDate
    })),
    ...interactiveVideos.map((video) => {
      const item = normalizeInteractiveVideoGradeItem(video);
      return item ? {
        id: item.itemId,
        itemId: item.itemId,
        type: item.type,
        title: item.title,
        maxGrade: item.maxGrade,
        maxScore: item.maxScore,
        weight: item.weight,
        dueDate: item.dueDate
      } : null;
    }).filter(Boolean),
    ...manualItems.map(normalizeManualItem)
  ];
}

function buildCourseStats(students = []) {
  const studentsWithGrades = students.filter(s => s.summary?.overallPercentage !== null && s.summary?.overallPercentage !== undefined);
  return {
    totalStudents: students.length,
    studentsWithGrades: studentsWithGrades.length,
    averageGrade: studentsWithGrades.length > 0
      ? Math.round((studentsWithGrades.reduce((sum, s) => sum + s.summary.overallPercentage, 0) / studentsWithGrades.length) * 100) / 100
      : null,
    passingCount: studentsWithGrades.filter(s => s.summary?.passing).length,
    passingRate: studentsWithGrades.length > 0
      ? Math.round((studentsWithGrades.filter(s => s.summary?.passing).length / studentsWithGrades.length) * 100)
      : null
  };
}

async function buildTeacherCourseGradebookSnapshot(courseId, course) {
  const enrollments = await db.queryByIndex(
    'GSI1',
    `COURSE#${courseId}`,
    'GSI1PK',
    { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
  );

  const {
    assignments,
    quizzes,
    interactiveVideos,
    manualItems,
    submissionsByAssignment,
    attemptsByQuiz,
    interactiveVideoAttemptsByActivity,
    manualRecordsByItem
  } = await buildCourseGradebookDataset(courseId);

  const gradeColumns = buildGradeColumns(assignments, quizzes, interactiveVideos, manualItems);
  const enrollmentUserMap = await getEnrollmentUserMap(enrollments);

  const students = await Promise.all(
    enrollments.map(async (enrollment) => {
      const user = enrollmentUserMap.get(enrollment.userId);
      const grades = {};
      let totalEarned = 0;
      let totalPossible = 0;
      let gradedCount = 0;

      for (const assignment of assignments) {
        const submission = submissionsByAssignment.get(assignment.assignmentId)?.get(enrollment.userId) || null;
        grades[assignment.assignmentId] = {
          grade: submission?.grade ?? null,
          submitted: !!submission,
          gradedAt: submission?.gradedAt
        };

        if (submission?.grade !== undefined && submission?.grade !== null) {
          totalEarned += submission.grade;
          totalPossible += assignment.maxGrade;
          gradedCount++;
        }
      }

      for (const quiz of quizzes) {
        const attempts = attemptsByQuiz.get(quiz.quizId)?.get(enrollment.userId) || [];
        const quizSummary = getQuizGradeSummary(quiz, attempts);
        const bestScore = quizSummary.bestScore;

        grades[quiz.quizId] = {
          grade: bestScore,
          submitted: quizSummary.attemptCount > 0,
          attemptCount: quizSummary.attemptCount
        };

        if (bestScore !== null) {
          totalEarned += bestScore;
          totalPossible += quiz.totalPoints;
          gradedCount++;
        }
      }

      for (const interactiveVideo of interactiveVideos) {
        const item = normalizeInteractiveVideoGradeItem(interactiveVideo);
        if (!item) continue;
        const attempt = interactiveVideoAttemptsByActivity.get(item.itemId)?.get(enrollment.userId) || null;
        const hasStarted = hasInteractiveVideoAttemptStarted(attempt);
        const score = attempt?.score ?? null;

        grades[item.itemId] = {
          grade: score,
          submitted: hasStarted,
          gradedAt: attempt?.completedAt || attempt?.updatedAt || null,
          progressPercentage: Number(attempt?.progressPercentage || 0) || 0,
          watchedSeconds: Number(attempt?.watchedSeconds || 0) || 0
        };

        if (score !== null && score !== undefined) {
          totalEarned += Number(score);
          totalPossible += Number(item.maxGrade || 0);
          gradedCount++;
        }
      }

      for (const item of manualItems) {
        const record = manualRecordsByItem.get(item.itemId)?.get(enrollment.userId) || null;
        grades[item.itemId] = {
          grade: record?.grade ?? null,
          submitted: record?.grade !== undefined && record?.grade !== null,
          gradedAt: record?.gradedAt || null,
          feedback: record?.feedback || ''
        };

        if (record?.grade !== undefined && record?.grade !== null) {
          totalEarned += record.grade;
          totalPossible += item.maxGrade;
          gradedCount++;
        }
      }

      const overallPercentage = totalPossible > 0
        ? Math.round((totalEarned / totalPossible) * 10000) / 100
        : null;

      return {
        userId: enrollment.userId,
        name: user?.displayName || '未知用戶',
        email: user?.email,
        enrolledAt: enrollment.enrolledAt,
        lastAccess: enrollment.lastAccessedAt,
        grades,
        summary: {
          totalEarned,
          totalPossible,
          gradedCount,
          totalItems: gradeColumns.length,
          overallPercentage,
          passing: overallPercentage >= (course.settings?.gradeToPass || 60)
        }
      };
    })
  );

  return {
    course: {
      courseId,
      title: course.title,
      passingGrade: course.settings?.gradeToPass || 60
    },
    columns: gradeColumns,
    students,
    stats: buildCourseStats(students),
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  normalizeManualItem,
  getCourseAssignments,
  getCourseQuizzes,
  getCourseGradeItems,
  getQuizGradeSummary,
  buildCourseGradebookDataset,
  buildGradeColumns,
  buildCourseStats,
  buildTeacherCourseGradebookSnapshot
};
