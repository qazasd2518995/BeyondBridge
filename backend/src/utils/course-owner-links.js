const db = require('./db');
const { getCourseOwnerIds } = require('./course-access');

function getNormalizedCourseOwnerIds(course = {}) {
  return [
    ...new Set([
      ...getCourseOwnerIds(course),
      ...(Array.isArray(course.instructors) ? course.instructors : [])
    ].filter(Boolean))
  ];
}

function buildCourseOwnerLink(course, ownerId) {
  const courseId = course?.courseId;
  if (!courseId || !ownerId) return null;

  return {
    PK: `USER#${ownerId}`,
    SK: `COURSE_OWNER#${courseId}`,
    GSI1PK: `COURSE#${courseId}`,
    GSI1SK: `OWNER#${ownerId}`,
    entityType: 'COURSE_OWNER_LINK',
    userId: ownerId,
    courseId,
    title: course.title || course.name || '未命名課程',
    category: course.category || 'general',
    visibility: course.visibility || 'show',
    status: course.status || 'draft',
    updatedAt: course.updatedAt || course.createdAt || new Date().toISOString()
  };
}

async function syncCourseOwnerLinks(course, previousCourse = null) {
  const nextOwnerIds = getNormalizedCourseOwnerIds(course);
  const previousOwnerIds = getNormalizedCourseOwnerIds(previousCourse || {});

  const deleteKeys = previousOwnerIds
    .filter(ownerId => !nextOwnerIds.includes(ownerId))
    .map(ownerId => ({
      PK: `USER#${ownerId}`,
      SK: `COURSE_OWNER#${previousCourse.courseId}`
    }));

  if (deleteKeys.length > 0) {
    await db.batchDelete(deleteKeys);
  }

  const links = nextOwnerIds
    .map(ownerId => buildCourseOwnerLink(course, ownerId))
    .filter(Boolean);

  if (links.length > 0) {
    await db.batchWrite(links);
  }

  return links.length;
}

async function deleteCourseOwnerLinks(course) {
  const courseId = course?.courseId;
  if (!courseId) return 0;

  const deleteKeys = getNormalizedCourseOwnerIds(course).map(ownerId => ({
    PK: `USER#${ownerId}`,
    SK: `COURSE_OWNER#${courseId}`
  }));

  if (deleteKeys.length === 0) return 0;
  await db.batchDelete(deleteKeys);
  return deleteKeys.length;
}

async function listManagedCourseIds(userId) {
  if (!userId) return [];
  const rows = await db.query(`USER#${userId}`, {
    skPrefix: 'COURSE_OWNER#',
    projection: ['courseId']
  });
  return [
    ...new Set(
      rows
        .map(row => row?.courseId || String(row?.SK || '').replace('COURSE_OWNER#', ''))
        .filter(Boolean)
    )
  ];
}

async function backfillCourseOwnerLinks(courses = []) {
  const links = courses
    .flatMap(course => getNormalizedCourseOwnerIds(course).map(ownerId => buildCourseOwnerLink(course, ownerId)))
    .filter(Boolean);

  if (links.length === 0) return 0;
  await db.batchWrite(links);
  return links.length;
}

module.exports = {
  syncCourseOwnerLinks,
  deleteCourseOwnerLinks,
  listManagedCourseIds,
  backfillCourseOwnerLinks
};
