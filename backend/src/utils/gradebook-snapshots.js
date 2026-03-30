const db = require('./db');

const GRADEBOOK_SNAPSHOT_PK = 'GRADEBOOK_SNAPSHOT';
const GRADEBOOK_SNAPSHOT_VERSION = 2;
const GRADEBOOK_SNAPSHOT_KEYS = {
  TEACHER_COURSE: 'teacher_course'
};

function buildGradebookSnapshotSk(courseId, snapshotKey = GRADEBOOK_SNAPSHOT_KEYS.TEACHER_COURSE) {
  return `COURSE#${courseId}#${snapshotKey}`;
}

async function getGradebookSnapshot(courseId, snapshotKey = GRADEBOOK_SNAPSHOT_KEYS.TEACHER_COURSE) {
  if (!courseId) return null;
  const item = await db.getItem(GRADEBOOK_SNAPSHOT_PK, buildGradebookSnapshotSk(courseId, snapshotKey));
  if (!item || item.entityType !== 'GRADEBOOK_SNAPSHOT') return null;
  if (item.version !== GRADEBOOK_SNAPSHOT_VERSION) return null;
  return item;
}

async function putGradebookSnapshot(courseId, data, {
  snapshotKey = GRADEBOOK_SNAPSHOT_KEYS.TEACHER_COURSE,
  source = 'live-refresh'
} = {}) {
  const now = new Date().toISOString();
  const item = {
    PK: GRADEBOOK_SNAPSHOT_PK,
    SK: buildGradebookSnapshotSk(courseId, snapshotKey),
    entityType: 'GRADEBOOK_SNAPSHOT',
    version: GRADEBOOK_SNAPSHOT_VERSION,
    courseId,
    snapshotKey,
    rebuiltAt: now,
    source,
    data
  };
  await db.putItem(item);
  return item;
}

async function deleteGradebookSnapshot(courseId, snapshotKey = GRADEBOOK_SNAPSHOT_KEYS.TEACHER_COURSE) {
  if (!courseId) return;
  try {
    await db.deleteItem(GRADEBOOK_SNAPSHOT_PK, buildGradebookSnapshotSk(courseId, snapshotKey));
  } catch (error) {
    if (!String(error?.message || '').includes('ConditionalCheckFailed')) {
      throw error;
    }
  }
}

async function invalidateGradebookSnapshots(courseId) {
  await Promise.all(
    Object.values(GRADEBOOK_SNAPSHOT_KEYS).map(snapshotKey => (
      deleteGradebookSnapshot(courseId, snapshotKey)
    ))
  );
}

module.exports = {
  GRADEBOOK_SNAPSHOT_PK,
  GRADEBOOK_SNAPSHOT_KEYS,
  GRADEBOOK_SNAPSHOT_VERSION,
  getGradebookSnapshot,
  putGradebookSnapshot,
  deleteGradebookSnapshot,
  invalidateGradebookSnapshots
};
