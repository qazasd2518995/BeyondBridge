/**
 * 稽核並修復 COURSE#<id> / OWNER#* 索引命名空間衝突。
 *
 * 這支工具不處理 COURSE_OWNER_LINK 本身，而是找出意外落在：
 *   GSI1PK = COURSE#<courseId>
 *   GSI1SK begins_with OWNER#
 * 的其他 entity。
 *
 * 可安全修復的 entity：
 * - COURSE       -> GSI1SK = COURSE#<courseId>
 * - ASSIGNMENT   -> GSI1SK = ASSIGNMENT#<assignmentId>
 * - QUIZ         -> GSI1SK = QUIZ#<quizId>
 * - FORUM        -> GSI1SK = FORUM#<forumId>
 *
 * 用法：
 *   node src/scripts/repair-course-owner-index-collisions.js --dry-run
 *   node src/scripts/repair-course-owner-index-collisions.js --repair-known
 *   node src/scripts/repair-course-owner-index-collisions.js --dry-run --course=course_abc
 */

require('dotenv').config();

const db = require('../utils/db');

const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--repair-known');
const shouldRepairKnown = process.argv.includes('--repair-known');
const courseArg = process.argv.find(arg => arg.startsWith('--course='));
const scopedCourseId = courseArg ? courseArg.split('=')[1] : null;

function getCanonicalCourseIndex(row = {}) {
  const courseId = row.courseId;
  if (!courseId) return null;

  switch (row.entityType) {
    case 'COURSE':
      return {
        GSI1PK: `CAT#${row.category || 'general'}`,
        GSI1SK: `COURSE#${courseId}`
      };
    case 'ASSIGNMENT':
      return row.assignmentId ? {
        GSI1PK: `COURSE#${courseId}`,
        GSI1SK: `ASSIGNMENT#${row.assignmentId}`
      } : null;
    case 'QUIZ':
      return row.quizId ? {
        GSI1PK: `COURSE#${courseId}`,
        GSI1SK: `QUIZ#${row.quizId}`
      } : null;
    case 'FORUM':
      return row.forumId ? {
        GSI1PK: `COURSE#${courseId}`,
        GSI1SK: `FORUM#${row.forumId}`
      } : null;
    default:
      return null;
  }
}

async function loadCourses() {
  if (!scopedCourseId) {
    return db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'COURSE' }
      },
      projection: ['courseId', 'title', 'name']
    });
  }

  const course = await db.getCourse(scopedCourseId);
  return course ? [course] : [];
}

async function loadUnexpectedRows(courseId) {
  const rows = await db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'OWNER#'
  });
  return rows.filter(row => row.entityType !== 'COURSE_OWNER_LINK');
}

async function inspectCourse(course) {
  const courseId = course.courseId;
  const unexpectedRows = await loadUnexpectedRows(courseId);

  const repairable = [];
  const unsupported = [];

  unexpectedRows.forEach(row => {
    const canonical = getCanonicalCourseIndex(row);
    const summary = {
      PK: row.PK,
      SK: row.SK,
      entityType: row.entityType || 'UNKNOWN',
      currentGSI1PK: row.GSI1PK,
      currentGSI1SK: row.GSI1SK,
      canonical
    };

    if (canonical && (canonical.GSI1PK !== row.GSI1PK || canonical.GSI1SK !== row.GSI1SK)) {
      repairable.push(summary);
      return;
    }

    unsupported.push(summary);
  });

  if (shouldRepairKnown && !isDryRun) {
    for (const row of repairable) {
      await db.updateItem(row.PK, row.SK, row.canonical);
    }
  }

  return {
    courseId,
    title: course.title || course.name || '未命名課程',
    unexpectedRows,
    repairable,
    unsupported
  };
}

async function main() {
  const courses = await loadCourses();

  if (scopedCourseId && courses.length === 0) {
    throw new Error(`Course not found: ${scopedCourseId}`);
  }

  let inspectedCourses = 0;
  let totalUnexpected = 0;
  let totalRepairable = 0;
  let totalUnsupported = 0;

  console.log(`[repair-course-owner-index-collisions] starting${isDryRun ? ' (dry-run)' : ''}${scopedCourseId ? ` course=${scopedCourseId}` : ''}`);

  for (const course of courses) {
    inspectedCourses += 1;
    const result = await inspectCourse(course);
    totalUnexpected += result.unexpectedRows.length;
    totalRepairable += result.repairable.length;
    totalUnsupported += result.unsupported.length;

    if (result.unexpectedRows.length === 0) continue;

    console.log(
      `[course ${result.courseId}] unexpected=${result.unexpectedRows.length} repairable=${result.repairable.length} unsupported=${result.unsupported.length} title=${result.title}`
    );

    result.repairable.forEach(row => {
      console.log(
        `  repair ${row.entityType} ${row.PK}/${row.SK} ${row.currentGSI1PK}|${row.currentGSI1SK} -> ${row.canonical.GSI1PK}|${row.canonical.GSI1SK}`
      );
    });

    result.unsupported.forEach(row => {
      console.log(
        `  unsupported ${row.entityType} ${row.PK}/${row.SK} ${row.currentGSI1PK}|${row.currentGSI1SK}`
      );
    });
  }

  console.log('[repair-course-owner-index-collisions] done');
  console.log(
    `courses=${inspectedCourses} unexpectedRows=${totalUnexpected} repairable=${totalRepairable} unsupported=${totalUnsupported}`
  );
}

main().catch((error) => {
  console.error('[repair-course-owner-index-collisions] failed:', error);
  process.exitCode = 1;
});
