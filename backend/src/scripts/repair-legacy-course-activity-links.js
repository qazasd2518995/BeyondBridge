/**
 * 修復歷史上以錯誤流程建立的 course activity link。
 *
 * 會處理 assignment / quiz / forum 三種 linked activity：
 * 1. 若活動已能對到真實實體，補齊 assignmentId/quizId/forumId 與 activityId
 * 2. 若活動完全沒有對應實體，依現有課程活動資料建立最小可用實體，再回填 link
 *
 * 用法：
 *   node src/scripts/repair-legacy-course-activity-links.js --dry-run
 *   node src/scripts/repair-legacy-course-activity-links.js
 */

require('dotenv').config();

const db = require('../utils/db');
const {
  LINKED_ACTIVITY_CONFIG,
  createLinkedEntityIndexes,
  resolveLinkedEntity,
  buildActivityRepairPatch,
  buildLinkedEntityFromLegacyActivity
} = require('../utils/legacy-course-activity-links');

const isDryRun = process.argv.includes('--dry-run');

function isRepairNeeded(activity, patch) {
  const comparePatch = { ...patch };
  delete comparePatch.updatedAt;
  return Object.entries(comparePatch).some(([key, value]) => JSON.stringify(activity[key]) !== JSON.stringify(value));
}

async function repairCourse(course) {
  const courseId = course.courseId;
  const [activities, linkedEntities] = await Promise.all([
    db.query(`COURSE#${courseId}`, { skPrefix: 'ACTIVITY#' }),
    db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK')
  ]);

  let indexes = createLinkedEntityIndexes(linkedEntities);
  let repairedLinks = 0;
  let createdEntities = 0;
  let skipped = 0;

  for (const activity of activities) {
    if (!LINKED_ACTIVITY_CONFIG[activity.type]) continue;

    let linkedEntity = resolveLinkedEntity(activity, indexes);

    if (!linkedEntity) {
      linkedEntity = buildLinkedEntityFromLegacyActivity(activity, course, db.generateId);
      if (!linkedEntity) {
        skipped += 1;
        continue;
      }

      createdEntities += 1;
      if (!isDryRun) {
        await db.putItem(linkedEntity);
      }

      indexes = createLinkedEntityIndexes([...linkedEntities, linkedEntity]);
      linkedEntities.push(linkedEntity);
    }

    const patch = buildActivityRepairPatch(activity, linkedEntity);
    if (!patch || !isRepairNeeded(activity, patch)) {
      continue;
    }

    repairedLinks += 1;
    if (!isDryRun) {
      await db.updateItem(`COURSE#${courseId}`, activity.SK, patch);
    }
  }

  return { repairedLinks, createdEntities, skipped };
}

async function main() {
  const courses = await db.scan({
    filter: {
      expression: 'entityType = :type',
      values: { ':type': 'COURSE' }
    }
  });

  let totalCourses = 0;
  let totalRepairs = 0;
  let totalCreated = 0;
  let totalSkipped = 0;

  console.log(`[repair-legacy-course-activity-links] starting ${isDryRun ? '(dry-run)' : ''}`);

  for (const course of courses) {
    totalCourses += 1;
    const result = await repairCourse(course);
    totalRepairs += result.repairedLinks;
    totalCreated += result.createdEntities;
    totalSkipped += result.skipped;

    if (result.repairedLinks || result.createdEntities || result.skipped) {
      console.log(
        `[course ${course.courseId}] repaired=${result.repairedLinks} created=${result.createdEntities} skipped=${result.skipped}`
      );
    }
  }

  console.log('[repair-legacy-course-activity-links] done');
  console.log(`courses=${totalCourses} repairedLinks=${totalRepairs} createdEntities=${totalCreated} skipped=${totalSkipped}`);
}

main().catch((error) => {
  console.error('[repair-legacy-course-activity-links] failed:', error);
  process.exitCode = 1;
});
