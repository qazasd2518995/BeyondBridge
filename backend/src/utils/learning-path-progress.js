const db = require('./db');

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getPathId(record) {
  if (!record) return '';
  if (record.pathId) return record.pathId;
  if (record.id) return record.id;
  if (typeof record.SK === 'string' && record.SK.startsWith('LEARNING_PATH#')) {
    return record.SK.slice('LEARNING_PATH#'.length);
  }
  if (typeof record.PK === 'string' && record.PK.startsWith('LEARNING_PATH#')) {
    return record.PK.slice('LEARNING_PATH#'.length);
  }
  return '';
}

function getOrderedCourses(path) {
  const courses = Array.isArray(path?.courses) ? [...path.courses] : [];
  return courses
    .map((course, index) => ({
      ...course,
      courseId: course.courseId || course.id || '',
      order: parseInteger(course.order, index + 1, { min: 1 })
    }))
    .filter(course => course.courseId)
    .sort((a, b) => a.order - b.order);
}

function calculateEnrollmentProgress(courses, completedSet) {
  const requiredCourses = courses.filter(course => course.required !== false);
  const targetCourses = requiredCourses.length > 0 ? requiredCourses : courses;
  const total = targetCourses.length;
  if (total === 0) return 0;

  const completed = targetCourses.filter(course => completedSet.has(course.courseId)).length;
  return Math.round((completed / total) * 100);
}

function isEnrollmentComplete(courses, completedSet) {
  const requiredCourses = courses.filter(course => course.required !== false);
  const targetCourses = requiredCourses.length > 0 ? requiredCourses : courses;
  return targetCourses.length > 0 && targetCourses.every(course => completedSet.has(course.courseId));
}

async function getLearningPathById(pathId) {
  if (!pathId) return null;

  const direct = await db.getItem(`LEARNING_PATH#${pathId}`, 'META');
  if (direct && direct.entityType === 'LEARNING_PATH' && direct.status !== 'deleted') {
    return direct;
  }

  const fallback = await db.scan({
    filter: {
      expression: 'entityType = :type AND pathId = :pathId AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: {
        ':type': 'LEARNING_PATH',
        ':pathId': pathId,
        ':deleted': 'deleted'
      },
      names: {
        '#status': 'status'
      }
    },
    limit: 1
  });

  return fallback[0] || null;
}

async function refreshLearningPathStats(pathId, timestamp = new Date().toISOString()) {
  const path = await getLearningPathById(pathId);
  if (!path) return null;

  const courses = getOrderedCourses(path);
  const enrollments = await db.query(`LEARNING_PATH#${pathId}`, { skPrefix: 'ENROLL#' });
  const activeEnrollments = enrollments.filter(enrollment =>
    enrollment.entityType === 'LEARNING_PATH_ENROLLMENT' && enrollment.status !== 'withdrawn'
  );

  const completedCount = activeEnrollments.filter(enrollment => {
    const completedSet = new Set(enrollment.completedCourses || []);
    return enrollment.status === 'completed' || calculateEnrollmentProgress(courses, completedSet) >= 100;
  }).length;

  return db.updateItem(path.PK, path.SK, {
    enrolledCount: activeEnrollments.length,
    completedCount,
    updatedAt: timestamp
  });
}

async function syncLearningPathCourseStatus({
  userId,
  courseId,
  completed,
  completedAt = null,
  timestamp = new Date().toISOString()
}) {
  if (!userId || !courseId) return [];

  const userPathLinks = await db.query(`USER#${userId}`, { skPrefix: 'LEARNING_PATH#' });
  const activeLinks = userPathLinks.filter(link =>
    link.entityType === 'USER_LEARNING_PATH' && link.status !== 'withdrawn'
  );

  if (activeLinks.length === 0) return [];

  const updates = [];
  const touchedPathIds = new Set();

  for (const link of activeLinks) {
    const pathId = getPathId(link);
    if (!pathId || touchedPathIds.has(pathId)) continue;

    const [path, enrollment] = await Promise.all([
      getLearningPathById(pathId),
      db.getItem(`LEARNING_PATH#${pathId}`, `ENROLL#${userId}`)
    ]);

    if (!path || !enrollment || enrollment.status === 'withdrawn') {
      continue;
    }

    const courses = getOrderedCourses(path);
    if (!courses.some(course => course.courseId === courseId)) {
      continue;
    }

    const completedSet = new Set(
      (enrollment.completedCourses || []).filter(completedCourseId =>
        courses.some(course => course.courseId === completedCourseId)
      )
    );

    if (completed) {
      completedSet.add(courseId);
    } else {
      completedSet.delete(courseId);
    }

    const orderedCompletedCourses = courses
      .filter(course => completedSet.has(course.courseId))
      .map(course => course.courseId);
    const progress = calculateEnrollmentProgress(courses, completedSet);
    const fullyCompleted = isEnrollmentComplete(courses, completedSet);
    const nextCourse = courses.find(course => !completedSet.has(course.courseId)) || null;
    const nextStatus = fullyCompleted ? 'completed' : 'active';
    const nextCompletedAt = fullyCompleted ? (enrollment.completedAt || completedAt || timestamp) : null;

    await db.updateItem(enrollment.PK, enrollment.SK, {
      completedCourses: orderedCompletedCourses,
      progress,
      currentCourseOrder: nextCourse ? nextCourse.order : null,
      status: nextStatus,
      completedAt: nextCompletedAt,
      lastActivity: timestamp,
      updatedAt: timestamp
    });

    await db.updateItem(`USER#${userId}`, `LEARNING_PATH#${pathId}`, {
      status: nextStatus,
      completedAt: nextCompletedAt,
      updatedAt: timestamp
    });

    updates.push({
      pathId,
      progress,
      status: nextStatus,
      completedCourses: orderedCompletedCourses
    });
    touchedPathIds.add(pathId);
  }

  for (const pathId of touchedPathIds) {
    await refreshLearningPathStats(pathId, timestamp);
  }

  return updates;
}

module.exports = {
  syncLearningPathCourseStatus,
  refreshLearningPathStats
};
