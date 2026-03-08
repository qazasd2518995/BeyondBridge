/**
 * Seed Script: 泰雅族語教學
 * 執行方式：node backend/scripts/seed-atayal-course.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

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

function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}${rnd}`;
}

async function putItem(item) {
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

async function getUserByEmail(email) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI4',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email }
  }));
  return result.Items?.find(i => i.entityType === 'USER') || null;
}

const COURSE_TITLE = '泰雅族語教學';
const DEMO_EMAIL = 'demo@beyondbridge.com';

async function main() {
  const demoUser = await getUserByEmail(DEMO_EMAIL);
  if (!demoUser) { console.error('找不到 demo 用戶'); process.exit(1); }
  const userId = demoUser.userId || demoUser.PK?.replace('USER#', '');
  console.log(`✓ 找到老師: ${demoUser.displayName}`);

  const now = new Date().toISOString();
  const courseId = generateId('course');
  const activityId = generateId('act');
  const licenseId = generateId('lic');
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);

  const items = [
    // 課程
    { PK: `COURSE#${courseId}`, SK: 'META', entityType: 'COURSE',
      GSI1PK: 'CAT#language', GSI1SK: `COURSE#${courseId}`,
      GSI2PK: 'STATUS#published', GSI2SK: now,
      courseId, title: COURSE_TITLE, shortName: 'Atayal',
      description: '泰雅族語教學課程，透過互動式學習平台認識泰雅族語言與文化。課程涵蓋基礎詞彙、日常對話、文化故事等內容，適合對原住民族語言有興趣的學習者。',
      summary: '認識泰雅族語言與文化的互動課程。',
      category: 'language', format: 'topics',
      instructorId: userId, instructorName: demoUser.displayName || 'Demo Teacher',
      startDate: '2026-03-10', endDate: '2026-06-30',
      visibility: 'show', status: 'published',
      selfEnrollment: true, enrollmentCount: 0,
      tags: ['泰雅族語', '原住民語', '本土語言', '族語教學'],
      language: 'zh-TW',
      settings: { showActivityDates: true, showActivityReports: true, enableCompletion: true, enableGrades: false },
      stats: { totalActivities: 1, totalSections: 2 },
      createdAt: now, updatedAt: now },
    // 課程簡介
    { PK: `COURSE#${courseId}`, SK: 'SECTION#01', entityType: 'COURSE_SECTION',
      sectionId: '01', courseId, title: '課程簡介',
      summary: '歡迎來到泰雅族語教學課程！透過互動式學習平台，一起學習泰雅族的語言與文化。',
      order: 1, visible: true, createdAt: now, updatedAt: now },
    // 學習平台章節
    { PK: `COURSE#${courseId}`, SK: 'SECTION#02', entityType: 'COURSE_SECTION',
      sectionId: '02', courseId, title: '學習平台',
      summary: '泰雅族語互動學習平台',
      order: 2, visible: true, createdAt: now, updatedAt: now },
    // 活動
    { PK: `COURSE#${courseId}`, SK: 'ACTIVITY#02#001', entityType: 'COURSE_ACTIVITY',
      activityId, courseId, sectionId: '02', type: 'url',
      title: '泰雅族語學習平台',
      description: '互動式泰雅族語學習平台，包含詞彙練習、對話模擬及文化故事。',
      url: 'https://atayal.vercel.app',
      order: 1, visible: true, availability: {}, completion: { type: 'view' },
      stats: { views: 0, completions: 0 }, createdAt: now, updatedAt: now },
    // 講師 enrollment
    { PK: `USER#${userId}`, SK: `PROG#COURSE#${courseId}`, entityType: 'COURSE_PROGRESS',
      GSI1PK: `COURSE#${courseId}`, GSI1SK: `ENROLLED#${userId}`,
      userId, courseId, courseTitle: COURSE_TITLE, role: 'instructor', status: 'active',
      progressPercentage: 0, completedActivities: [],
      enrolledAt: now, lastAccess: now, createdAt: now, updatedAt: now },
    // 授權
    { PK: `LIC#${licenseId}`, SK: 'META', entityType: 'LICENSE',
      GSI1PK: `USER#${userId}`, GSI1SK: `LIC#${licenseId}`,
      GSI2PK: 'STATUS#active', GSI2SK: expiryDate.toISOString(),
      licenseId, resourceId: courseId, resourceTitle: COURSE_TITLE,
      userId, userName: demoUser.displayName, userEmail: DEMO_EMAIL,
      licenseType: 'personal', status: 'active', expiryDate: expiryDate.toISOString(),
      notes: '泰雅族語教學授權', createdAt: now, updatedAt: now },
    { PK: `USER#${userId}`, SK: `LIC#${licenseId}`, entityType: 'USER_LICENSE',
      GSI1PK: `LIC#${licenseId}`, GSI1SK: `USER#${userId}`,
      licenseId, resourceId: courseId, resourceTitle: COURSE_TITLE,
      status: 'active', expiryDate: expiryDate.toISOString(),
      createdAt: now, updatedAt: now },
  ];

  for (const item of items) await putItem(item);

  console.log(`✓ 課程已建立: ${courseId}`);
  console.log(`✓ 學習平台: https://atayal.vercel.app`);
  console.log(`✓ 授權老師: ${demoUser.displayName}`);
  console.log('✅ 泰雅族語教學課程建立完成！');
}

main().catch(err => { console.error('❌ 失敗:', err); process.exit(1); });
