const TEACHING_ROLES = new Set([
  'manager',
  'coursecreator',
  'educator',
  'trainer',
  'creator',
  'teacher',
  'assistant'
]);

function isTeachingUser(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return TEACHING_ROLES.has(String(user.role || '').toLowerCase());
}

function getCourseOwnerIds(course = {}) {
  return new Set([
    course.instructorId,
    course.teacherId,
    course.creatorId,
    course.createdBy
  ].filter(Boolean));
}

function canManageCourse(course, user) {
  if (!course || !user) return false;
  if (user.isAdmin) return true;
  const ownerIds = getCourseOwnerIds(course);
  const inInstructors = Array.isArray(course.instructors) && course.instructors.includes(user.userId);
  return ownerIds.has(user.userId) || inInstructors;
}

function normalizeCourseVisibility(value, fallback = 'show') {
  if (typeof value === 'boolean') {
    return value ? 'show' : 'hide';
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;

  if (['show', 'visible', 'published', 'true', '1'].includes(normalized)) {
    return 'show';
  }

  if (['hide', 'hidden', 'draft', 'false', '0'].includes(normalized)) {
    return 'hide';
  }

  return fallback;
}

function normalizeCourseFormat(value, fallback = 'topics') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'weekly') return 'weeks';
  return normalized;
}

module.exports = {
  isTeachingUser,
  canManageCourse,
  normalizeCourseVisibility,
  normalizeCourseFormat
};
