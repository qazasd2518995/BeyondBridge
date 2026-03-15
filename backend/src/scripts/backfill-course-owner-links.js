/**
 * 回填歷史課程的 COURSE_OWNER_LINK 關聯。
 *
 * 功能：
 * 1. 補齊缺失的 owner links
 * 2. 清理過時的 stale owner links
 *
 * 用法：
 *   node src/scripts/backfill-course-owner-links.js --dry-run
 *   node src/scripts/backfill-course-owner-links.js
 *   node src/scripts/backfill-course-owner-links.js --course=crs_demo001
 */

require('dotenv').config();

const db = require('../utils/db');
const { getCourseOwnerIds } = require('../utils/course-access');
const { syncCourseOwnerLinks } = require('../utils/course-owner-links');

const isDryRun = process.argv.includes('--dry-run');
const courseArg = process.argv.find(arg => arg.startsWith('--course='));
const scopedCourseId = courseArg ? courseArg.split('=')[1] : null;

function getExpectedOwnerIds(course = {}) {
  return [
    ...new Set([
      ...getCourseOwnerIds(course),
      ...(Array.isArray(course.instructors) ? course.instructors : [])
    ].filter(Boolean))
  ];
}

async function loadCourses() {
  if (!scopedCourseId) {
    return db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'COURSE' }
      },
      projection: [
        'courseId',
        'title',
        'name',
        'category',
        'status',
        'visibility',
        'createdAt',
        'updatedAt',
        'instructorId',
        'teacherId',
        'creatorId',
        'createdBy',
        'instructors'
      ]
    });
  }

  const course = await db.getCourse(scopedCourseId);
  return course ? [course] : [];
}

async function inspectCourse(course) {
  const courseId = course.courseId;
  const expectedOwnerIds = getExpectedOwnerIds(course);
  const indexedRows = await db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'OWNER#',
    projection: ['PK', 'SK', 'entityType', 'userId', 'GSI1SK']
  });
  const existingLinks = indexedRows.filter(row => row.entityType === 'COURSE_OWNER_LINK');
  const unexpectedOwnerRows = indexedRows.filter(row => row.entityType !== 'COURSE_OWNER_LINK');
  const existingOwnerIds = [
    ...new Set(
      existingLinks
        .map(link => link.userId || String(link.GSI1SK || '').replace('OWNER#', ''))
        .filter(Boolean)
    )
  ];

  const missingOwnerIds = expectedOwnerIds.filter(ownerId => !existingOwnerIds.includes(ownerId));
  const staleOwnerIds = existingOwnerIds.filter(ownerId => !expectedOwnerIds.includes(ownerId));
  const needsSync = missingOwnerIds.length > 0 || staleOwnerIds.length > 0;

  if (!isDryRun && needsSync) {
    await syncCourseOwnerLinks(course, {
      courseId,
      instructors: existingOwnerIds
    });
  }

  return {
    courseId,
    title: course.title || course.name || '未命名課程',
    expectedOwnerIds,
    existingOwnerIds,
    missingOwnerIds,
    staleOwnerIds,
    needsSync,
    unexpectedOwnerRows
  };
}

async function main() {
  const courses = await loadCourses();

  if (scopedCourseId && courses.length === 0) {
    throw new Error(`Course not found: ${scopedCourseId}`);
  }

  let inspectedCourses = 0;
  let changedCourses = 0;
  let totalMissing = 0;
  let totalStale = 0;
  let totalUnexpected = 0;

  console.log(`[backfill-course-owner-links] starting${isDryRun ? ' (dry-run)' : ''}${scopedCourseId ? ` course=${scopedCourseId}` : ''}`);

  for (const course of courses) {
    inspectedCourses += 1;
    const result = await inspectCourse(course);

    totalMissing += result.missingOwnerIds.length;
    totalStale += result.staleOwnerIds.length;
    totalUnexpected += result.unexpectedOwnerRows.length;

    if (result.needsSync) {
      changedCourses += 1;
      console.log(
        `[course ${result.courseId}] missing=${result.missingOwnerIds.length} stale=${result.staleOwnerIds.length} title=${result.title}`
      );
      if (result.missingOwnerIds.length > 0) {
        console.log(`  missing owners: ${result.missingOwnerIds.join(', ')}`);
      }
      if (result.staleOwnerIds.length > 0) {
        console.log(`  stale owners: ${result.staleOwnerIds.join(', ')}`);
      }
    }
    if (result.unexpectedOwnerRows.length > 0) {
      console.log(
        `[course ${result.courseId}] unexpectedOwnerRows=${result.unexpectedOwnerRows.length} (non-COURSE_OWNER_LINK rows on COURSE#${result.courseId} OWNER#* index path)`
      );
    }
  }

  console.log('[backfill-course-owner-links] done');
  console.log(
    `courses=${inspectedCourses} changedCourses=${changedCourses} missingLinks=${totalMissing} staleLinks=${totalStale} unexpectedOwnerRows=${totalUnexpected}`
  );
}

main().catch((error) => {
  console.error('[backfill-course-owner-links] failed:', error);
  process.exitCode = 1;
});
