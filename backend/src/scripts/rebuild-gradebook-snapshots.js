/**
 * 重建課程成績簿快照。
 *
 * 用法：
 *   node src/scripts/rebuild-gradebook-snapshots.js
 *   node src/scripts/rebuild-gradebook-snapshots.js --course=course_123
 *   node src/scripts/rebuild-gradebook-snapshots.js --course=course_123,course_456
 *   node src/scripts/rebuild-gradebook-snapshots.js --dry-run
 */

require('dotenv').config();

const db = require('../utils/db');
const gradebookRouter = require('../handlers/gradebook');
const { putGradebookSnapshot } = require('../utils/gradebook-snapshots');

const buildTeacherCourseGradebookSnapshot = gradebookRouter.buildTeacherCourseGradebookSnapshot;

if (typeof buildTeacherCourseGradebookSnapshot !== 'function') {
  throw new Error('buildTeacherCourseGradebookSnapshot export not available');
}

const courseArg = process.argv.find(arg => arg.startsWith('--course='));
const dryRun = process.argv.includes('--dry-run');
const requestedCourseIds = courseArg
  ? courseArg
      .split('=')[1]
      .split(',')
      .map(courseId => courseId.trim())
      .filter(Boolean)
  : [];

async function getTargetCourses() {
  if (requestedCourseIds.length > 0) {
    const items = await Promise.all(
      requestedCourseIds.map(async (courseId) => db.getItem(`COURSE#${courseId}`, 'META'))
    );
    return items.filter(Boolean);
  }

  return db.scan({
    filter: {
      expression: 'entityType = :entityType',
      values: { ':entityType': 'COURSE' }
    },
    projection: ['courseId', 'title', 'settings', 'instructorId', 'teacherId', 'creatorId', 'createdBy', 'instructors']
  });
}

async function main() {
  const courses = await getTargetCourses();
  console.log(`[rebuild-gradebook-snapshots] starting${dryRun ? ' (dry-run)' : ''} courses=${courses.length}`);

  for (const course of courses) {
    if (!course?.courseId) continue;
    const snapshot = await buildTeacherCourseGradebookSnapshot(course.courseId, course);
    const meta = {
      students: snapshot.students?.length || 0,
      columns: snapshot.columns?.length || 0,
      averageGrade: snapshot.stats?.averageGrade ?? null,
      passingRate: snapshot.stats?.passingRate ?? null
    };

    if (!dryRun) {
      const item = await putGradebookSnapshot(course.courseId, snapshot, { source: 'rebuild-script' });
      console.log(`[course ${course.courseId}] rebuiltAt=${item.rebuiltAt} title=${course.title || 'Untitled'} meta=${JSON.stringify(meta)}`);
    } else {
      console.log(`[course ${course.courseId}] dry-run title=${course.title || 'Untitled'} meta=${JSON.stringify(meta)}`);
    }
  }

  console.log('[rebuild-gradebook-snapshots] done');
}

main().catch((error) => {
  console.error('[rebuild-gradebook-snapshots] failed:', error);
  process.exitCode = 1;
});
