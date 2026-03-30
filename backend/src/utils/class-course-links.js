const db = require('./db');
const { canManageCourse } = require('./course-access');
const { invalidateGradebookSnapshots } = require('./gradebook-snapshots');

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getExplicitCourseId(classData = {}) {
  return (
    classData.courseId ||
    classData.linkedCourseId ||
    classData.course?.courseId ||
    classData.linkedCourse?.courseId ||
    (Array.isArray(classData.courseIds) ? classData.courseIds.find(Boolean) : null)
  ) || null;
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function buildUserProfileForEnrollment(user = {}, fallback = {}) {
  return {
    userId: user.userId || fallback.userId || null,
    displayName: user.displayName || fallback.displayName || '學生',
    email: user.email || fallback.email || null
  };
}

async function resolveLinkedCourseForClass(classData, { persist = true } = {}) {
  if (!classData) return null;

  const explicitCourseId = getExplicitCourseId(classData);
  if (explicitCourseId) {
    const explicitCourse = await db.getItem(`COURSE#${explicitCourseId}`, 'META');
    if (explicitCourse) return explicitCourse;
  }

  const className = normalizeText(classData.name || classData.className || classData.courseTitle);
  if (!className) return null;

  const allCourses = await db.getItemsByEntityType('COURSE');
  let matches = allCourses.filter(course => normalizeText(course.title || course.name) === className);

  const teacherId = classData.teacherId || classData.instructorId || null;
  if (teacherId && matches.length > 1) {
    const managedMatches = matches.filter(course => canManageCourse(course, {
      userId: teacherId,
      isAdmin: false
    }));
    if (managedMatches.length > 0) {
      matches = managedMatches;
    }
  }

  if (matches.length !== 1) return null;

  const course = matches[0];
  if (persist && classData.classId && course?.courseId && classData.courseId !== course.courseId) {
    await db.updateItem(`CLASS#${classData.classId}`, 'META', {
      courseId: course.courseId,
      courseTitle: course.title || course.name || classData.name || '',
      updatedAt: new Date().toISOString()
    });
    classData.courseId = course.courseId;
    classData.courseTitle = course.title || course.name || classData.name || '';
  }

  return course;
}

async function createCourseProgressEnrollment(course, userProfile, now = new Date().toISOString()) {
  if (!course?.courseId || !userProfile?.userId) return null;

  const existingProgress = await db.getItem(`USER#${userProfile.userId}`, `PROG#COURSE#${course.courseId}`);
  if (existingProgress) {
    return {
      enrolled: false,
      alreadyEnrolled: true,
      courseId: course.courseId,
      courseTitle: course.title || course.name || ''
    };
  }

  const sections = await db.query(`COURSE#${course.courseId}`, { skPrefix: 'SECTION#' });
  const progressItem = {
    PK: `USER#${userProfile.userId}`,
    SK: `PROG#COURSE#${course.courseId}`,
    entityType: 'COURSE_PROGRESS',
    GSI1PK: `COURSE#${course.courseId}`,
    GSI1SK: `ENROLLED#${userProfile.userId}`,
    createdAt: now,

    userId: userProfile.userId,
    courseId: course.courseId,
    courseTitle: course.title || course.name || '',
    status: 'in_progress',
    progressPercentage: 0,
    completedActivities: [],
    currentSectionId: sections[0]?.sectionId || '01',
    totalTimeSpent: 0,
    lastAccessedAt: now,
    enrolledAt: now,
    completedAt: null,

    grades: [],
    overallGrade: null
  };

  await db.putItem(progressItem);
  await db.updateItem(`COURSE#${course.courseId}`, 'META', {
    enrollmentCount: (course.enrollmentCount || 0) + 1
  });
  await invalidateGradebookSnapshots(course.courseId);
  await db.logActivity(userProfile.userId, 'course_enrolled', 'course', course.courseId, {
    courseTitle: course.title || course.name || ''
  });

  return {
    enrolled: true,
    alreadyEnrolled: false,
    courseId: course.courseId,
    courseTitle: course.title || course.name || '',
    enrolledAt: now
  };
}

async function enrollUserIntoClassLinkedCourse(classData, userProfile, options = {}) {
  const course = await resolveLinkedCourseForClass(classData, options);
  if (!course) return null;
  return createCourseProgressEnrollment(course, buildUserProfileForEnrollment(userProfile), options.now || new Date().toISOString());
}

async function findInviteClassForCourse(courseId) {
  if (!courseId) return null;

  const matches = await db.scan({
    filter: {
      expression: 'entityType = :type AND courseId = :courseId',
      values: {
        ':type': 'CLASS',
        ':courseId': courseId
      }
    }
  });

  const activeMatch = matches.find(item => item?.status !== 'archived');
  return activeMatch || null;
}

async function findLegacyInviteClassForCourse(course) {
  if (!course?.courseId) return null;

  const candidates = await db.scan({
    filter: {
      expression: 'entityType = :type AND teacherId = :teacherId',
      values: {
        ':type': 'CLASS',
        ':teacherId': course.instructorId || course.teacherId || course.creatorId || course.createdBy || ''
      }
    }
  });

  const normalizedTitle = normalizeText(course.title || course.name || '');
  return candidates.find(item => (
    item?.status !== 'archived' &&
    !getExplicitCourseId(item) &&
    normalizeText(item.name || item.className || '') === normalizedTitle
  )) || null;
}

async function ensureInviteClassForCourse(course, teacherUser) {
  if (!course?.courseId) return null;

  const existing = await findInviteClassForCourse(course.courseId);
  if (existing) return existing;

  const legacyClass = await findLegacyInviteClassForCourse(course);
  if (legacyClass?.classId) {
    const updatedClass = await db.updateItem(`CLASS#${legacyClass.classId}`, 'META', {
      courseId: course.courseId,
      courseTitle: course.title || course.name || '',
      updatedAt: new Date().toISOString()
    });
    return updatedClass;
  }

  const teacherId = teacherUser?.userId || course.instructorId || course.teacherId || course.creatorId || course.createdBy || 'system';
  const teacherName = teacherUser?.displayName || course.instructorName || course.teacherName || '教師';
  const now = new Date().toISOString();
  const classId = db.generateId('cls');

  const inviteClass = {
    PK: `CLASS#${classId}`,
    SK: 'META',
    GSI1PK: `TEACHER#${teacherId}`,
    GSI1SK: `CLASS#${classId}`,
    entityType: 'CLASS',
    createdAt: now,

    classId,
    name: course.title || course.name || '課程班級',
    description: course.summary || course.description || '',
    subject: course.category || '一般課程',
    gradeLevel: course.level || 'general',

    teacherId,
    teacherName,
    courseId: course.courseId,
    courseTitle: course.title || course.name || '',

    inviteCode: generateInviteCode(),
    memberCount: 0,
    assignmentCount: 0,

    status: 'active',
    updatedAt: now
  };

  await db.putItem(inviteClass);
  return inviteClass;
}

module.exports = {
  buildUserProfileForEnrollment,
  createCourseProgressEnrollment,
  enrollUserIntoClassLinkedCourse,
  ensureInviteClassForCourse,
  findInviteClassForCourse,
  generateInviteCode,
  resolveLinkedCourseForClass
};
