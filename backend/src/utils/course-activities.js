const db = require('./db');

async function findCourseActivityLink(courseId, activityId) {
  if (!courseId || !activityId) return null;
  const activities = await db.query(`COURSE#${courseId}`, { skPrefix: 'ACTIVITY#' });
  return activities.find(activity => activity.activityId === activityId) || null;
}

async function syncCourseActivityLink(courseId, activityId, updates = {}) {
  const activity = await findCourseActivityLink(courseId, activityId);
  if (!activity) return null;
  return db.updateItem(`COURSE#${courseId}`, activity.SK, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

async function deleteCourseActivityLink(courseId, activityId) {
  const activity = await findCourseActivityLink(courseId, activityId);
  if (!activity) return false;
  await db.deleteItem(`COURSE#${courseId}`, activity.SK);
  return true;
}

module.exports = {
  findCourseActivityLink,
  syncCourseActivityLink,
  deleteCourseActivityLink
};
