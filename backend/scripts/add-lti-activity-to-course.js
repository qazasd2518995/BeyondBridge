/**
 * 在課程中新增章節和 LTI 活動
 * 將金門語教材添加為課程活動
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

// 生成 ID
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

async function addLtiActivityToCourse() {
  const courseId = 'crs_demo001';  // 網頁開發入門課程
  const sectionId = generateId('sec');
  const activityId = generateId('act');
  const now = new Date().toISOString();

  // 先刪除舊的活動（如果存在）
  const scanResult = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `COURSE#${courseId}`,
      ':skPrefix': 'ACTIVITY#'
    }
  }));

  if (scanResult.Items && scanResult.Items.length > 0) {
    for (const item of scanResult.Items) {
      if (item.name === '金門語學習平台') {
        console.log('刪除舊的 LTI 活動:', item.SK);
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: item.PK,
            SK: item.SK
          }
        }));
      }
    }
  }

  // 刪除舊的章節（如果存在）
  const sectionScan = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `COURSE#${courseId}`,
      ':skPrefix': 'SECTION#'
    }
  }));

  if (sectionScan.Items && sectionScan.Items.length > 0) {
    for (const item of sectionScan.Items) {
      if (item.name === '金門語學習專區') {
        console.log('刪除舊的章節:', item.SK);
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: item.PK,
            SK: item.SK
          }
        }));
      }
    }
  }

  // 1. 先創建章節
  const section = {
    PK: `COURSE#${courseId}`,
    SK: `SECTION#${sectionId}`,
    entityType: 'SECTION',
    sectionId,
    courseId,
    name: '金門語學習專區',
    summary: '透過 LTI 整合的金門語學習教材',
    order: 0,
    visible: true,
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: section
  }));

  console.log('✅ 章節已建立！');
  console.log(`  - Section ID: ${sectionId}`);

  // 2. 創建 LTI 活動
  const activity = {
    PK: `COURSE#${courseId}`,
    SK: `ACTIVITY#${sectionId}#${activityId}`,  // 正確的格式：ACTIVITY#sectionId#activityId
    entityType: 'ACTIVITY',
    activityId,
    courseId,
    sectionId,
    name: '金門語學習平台',
    description: '透過互動方式學習金門方言，包含發音練習、文化介紹和測驗。',
    type: 'lti',
    toolId: 'kinmen-language-tool',
    ltiToolId: 'kinmen-language-tool',
    order: 0,
    visible: true,
    completionType: 'external',  // 由外部工具回報完成狀態
    allowGradePassback: true,
    customParameters: {
      default_unit: '1'
    },
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: activity
  }));

  console.log('✅ LTI 活動已新增到課程！');
  console.log('');
  console.log('活動資訊:');
  console.log(`  - Activity ID: ${activity.activityId}`);
  console.log(`  - 課程 ID: ${courseId}`);
  console.log(`  - 章節: ${sectionId}`);
  console.log(`  - 名稱: ${activity.name}`);
  console.log(`  - 工具 ID: ${activity.toolId}`);
  console.log('');
  console.log('現在可以在 BeyondBridge 平台的課程頁面中看到這個活動了！');
  console.log('訪問: http://localhost:3002/platform/index.html');
}

addLtiActivityToCourse().catch(console.error);
