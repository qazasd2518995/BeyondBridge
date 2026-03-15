/**
 * 重建 admin dashboard / analytics overview 聚合快照。
 *
 * 用法：
 *   node src/scripts/rebuild-admin-metrics.js
 *   node src/scripts/rebuild-admin-metrics.js --key=dashboard
 *   node src/scripts/rebuild-admin-metrics.js --key=analytics_overview
 *   node src/scripts/rebuild-admin-metrics.js --key=dashboard,analytics_overview
 */

require('dotenv').config();

const {
  ADMIN_METRICS_SNAPSHOT_KEYS,
  rebuildAdminMetricsSnapshots
} = require('../utils/admin-metrics');

const keyArg = process.argv.find(arg => arg.startsWith('--key='));
const requestedKeys = keyArg
  ? keyArg
      .split('=')[1]
      .split(',')
      .map(key => key.trim())
      .filter(Boolean)
  : Object.values(ADMIN_METRICS_SNAPSHOT_KEYS);

async function main() {
  console.log(`[rebuild-admin-metrics] starting keys=${requestedKeys.join(',')}`);
  const results = await rebuildAdminMetricsSnapshots(requestedKeys);
  results.forEach(result => {
    console.log(
      `[snapshot ${result.key}] rebuiltAt=${result.rebuiltAt} sourceCounts=${JSON.stringify(result.sourceCounts || {})}`
    );
  });
  console.log('[rebuild-admin-metrics] done');
}

main().catch((error) => {
  console.error('[rebuild-admin-metrics] failed:', error);
  process.exitCode = 1;
});
