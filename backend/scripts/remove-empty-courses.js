/**
 * 移除沒有內容的課程及其相關資料
 * 執行方式：node backend/scripts/remove-empty-courses.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true }
});
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

// 要刪除的課程 ID
const COURSES_TO_DELETE = [
  'crs_video001',
  'course_mlcn7ctknjzwnw',
  'course_mmi1sko347w6e6',
  'course_mlcnkul2zvnhxc',
  'course_mlcnc2mcb5awif',
  'crs_design001',
  'crs_demo003',
  'crs_demo002',
  'crs_demo001',
  'course_mmi0ih58l8zw41',
];

async function deleteItem(pk, sk) {
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }));
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  移除空白課程                              ║');
  console.log('╚══════════════════════════════════════════╝\n');

  let totalDeleted = 0;

  for (const courseId of COURSES_TO_DELETE) {
    const pk = `COURSE#${courseId}`;

    // 查找所有以 COURSE#courseId 為 PK 的項目（META, SECTION, ACTIVITY）
    const courseItems = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk }
    }));

    // 查找相關的 enrollment（PROG#COURSE#courseId）
    const enrollments = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'contains(SK, :courseRef)',
      ExpressionAttributeValues: { ':courseRef': `COURSE#${courseId}` }
    }));

    // 查找相關的 license
    const licenses = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'resourceId = :cid',
      ExpressionAttributeValues: { ':cid': courseId }
    }));

    // 查找 GSI1 enrolled 項目
    const enrolled = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'GSI1PK = :gpk',
      ExpressionAttributeValues: { ':gpk': pk }
    }));

    const allItems = [
      ...(courseItems.Items || []),
      ...(enrollments.Items || []),
      ...(licenses.Items || []),
      ...(enrolled.Items || [])
    ];

    // 去重（by PK+SK）
    const seen = new Set();
    const uniqueItems = allItems.filter(item => {
      const key = `${item.PK}||${item.SK}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueItems.length === 0) {
      console.log(`  ⚠ ${courseId} — 無項目可刪除`);
      continue;
    }

    // 找課程名稱
    const meta = uniqueItems.find(i => i.SK === 'META' && i.entityType === 'COURSE');
    const title = meta?.title || courseId;

    for (const item of uniqueItems) {
      await deleteItem(item.PK, item.SK);
    }

    totalDeleted += uniqueItems.length;
    console.log(`  ✗ ${title} — 刪除 ${uniqueItems.length} 筆資料`);
  }

  console.log(`\n════════════════════════════════════════════`);
  console.log(`✅ 完成！共刪除 ${totalDeleted} 筆資料，移除 ${COURSES_TO_DELETE.length} 門課程`);
  console.log(`════════════════════════════════════════════\n`);

  // 顯示剩餘課程
  const remaining = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'entityType = :t AND SK = :sk',
    ExpressionAttributeValues: { ':t': 'COURSE', ':sk': 'META' }
  }));
  console.log('剩餘課程：');
  for (const c of remaining.Items) {
    console.log(`  ✓ ${c.title} (${c.courseId})`);
  }
}

main().catch(err => {
  console.error('\n❌ 執行失敗:', err);
  process.exit(1);
});
