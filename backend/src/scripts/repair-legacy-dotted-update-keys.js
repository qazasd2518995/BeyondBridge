/**
 * 修復歷史上錯誤寫入 DynamoDB 的 dotted update keys。
 *
 * 目前聚焦修復 stats.* / settings.* 這類本來應該寫入巢狀 map，
 * 卻被舊版 db.updateItem() 寫成 literal key 的欄位。
 *
 * 用法：
 *   node src/scripts/repair-legacy-dotted-update-keys.js --dry-run
 *   node src/scripts/repair-legacy-dotted-update-keys.js
 */

require('dotenv').config();

const db = require('../utils/db');
const {
  LEGACY_NESTED_ATTRIBUTE_ROOTS,
  normalizeLegacyDottedAttributes
} = require('../utils/dotted-keys');

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`[repair-legacy-dotted-update-keys] starting ${isDryRun ? '(dry-run)' : ''}`);
  console.log(`[repair-legacy-dotted-update-keys] allowedRoots=${LEGACY_NESTED_ATTRIBUTE_ROOTS.join(',')}`);

  const items = await db.scan();
  let scanned = 0;
  let repairedItems = 0;
  let repairedKeys = 0;

  for (const item of items) {
    scanned += 1;
    const result = normalizeLegacyDottedAttributes(item, {
      allowedRoots: LEGACY_NESTED_ATTRIBUTE_ROOTS
    });

    if (!result.changed) {
      continue;
    }

    repairedItems += 1;
    repairedKeys += result.legacyKeys.length;

    console.log(
      `[item ${item.PK} ${item.SK}] keys=${result.legacyKeys.join(', ')}`
    );

    if (!isDryRun) {
      await db.putItem(result.item);
    }
  }

  console.log('[repair-legacy-dotted-update-keys] done');
  console.log(`scanned=${scanned} repairedItems=${repairedItems} repairedKeys=${repairedKeys}`);
}

main().catch((error) => {
  console.error('[repair-legacy-dotted-update-keys] failed:', error);
  process.exitCode = 1;
});
