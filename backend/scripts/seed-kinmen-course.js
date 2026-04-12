/**
 * Seed Script: 金門語課程
 * 執行方式：node backend/scripts/seed-kinmen-course.js
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

const COURSE_TITLE = '金門語';
const DEMO_EMAIL = 'demo@beyondbridge.com';

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  金門語課程 Seed Script                   ║');
  console.log('╚══════════════════════════════════════════╝');

  const demoUser = await getUserByEmail(DEMO_EMAIL);
  if (!demoUser) {
    console.error(`  ✗ 找不到 ${DEMO_EMAIL}`);
    process.exit(1);
  }
  const userId = demoUser.userId || demoUser.PK?.replace('USER#', '');
  console.log(`  ✓ 找到老師: ${demoUser.displayName} (${userId})`);

  const now = new Date().toISOString();
  const courseId = generateId('course');

  // 建立課程
  const courseItem = {
    PK: `COURSE#${courseId}`,
    SK: 'META',
    entityType: 'COURSE',
    GSI1PK: 'CAT#language',
    GSI1SK: `COURSE#${courseId}`,
    GSI2PK: 'STATUS#published',
    GSI2SK: now,

    courseId,
    title: COURSE_TITLE,
    shortName: 'KinmenLang',
    description: '金門語課程，透過互動式學習平台認識金門在地語言與文化。課程涵蓋日常用語、發音練習及文化背景介紹，適合對閩南語方言及金門文化有興趣的學習者。',
    summary: '認識金門在地語言與文化的互動課程。',
    category: 'language',
    format: 'topics',

    instructorId: userId,
    instructorName: demoUser.displayName || 'Demo Teacher',

    startDate: '2026-04-12',
    endDate: '2026-06-30',
    visibility: 'show',
    status: 'published',

    selfEnrollment: true,
    enrollmentCount: 0,

    tags: ['金門語', '閩南語', '方言', '本土語言', '金門'],
    language: 'zh-TW',

    settings: {
      showActivityDates: true,
      showActivityReports: true,
      enableCompletion: true,
      enableGrades: true
    },
    stats: { totalActivities: 0, totalSections: 0 },

    createdAt: now,
    updatedAt: now
  };
  await putItem(courseItem);
  console.log(`  ✓ 課程已建立: ${courseId}`);

  // 課程簡介章節
  await putItem({
    PK: `COURSE#${courseId}`, SK: 'SECTION#01', entityType: 'COURSE_SECTION',
    sectionId: '01', courseId, title: '課程簡介',
    summary: '歡迎來到金門語課程！透過互動式學習平台，一起認識金門獨特的語言與文化。',
    order: 1, visible: true, createdAt: now, updatedAt: now
  });

  // 第一章活動：課程說明頁
  const introActivityId = generateId('act');
  await putItem({
    PK: `COURSE#${courseId}`, SK: 'ACTIVITY#01#001', entityType: 'COURSE_ACTIVITY',
    activityId: introActivityId, courseId, sectionId: '01', type: 'page',
    title: '課程說明與學習目標',
    description: '了解本課程的學習目標、評量方式與課程大綱。',
    content: `<h2>歡迎來到金門語課程</h2>
<p>金門語屬於閩南語系的金門腔，是金門在地獨特的語言文化。本課程透過互動式學習平台，帶領學習者認識金門語的發音、日常用語與文化背景。</p>

<h3>學習目標</h3>
<ul>
  <li>認識金門語的語音系統與基礎發音</li>
  <li>學會 50 句以上的金門日常用語</li>
  <li>了解金門在地文化故事與傳統</li>
  <li>能以金門語進行簡單的日常對話</li>
</ul>

<h3>評量方式</h3>
<ul>
  <li>金門日常用語錄音（60 分）— 錄製 10 句日常用語的發音練習</li>
  <li>金門文化故事蒐集（100 分）— 蒐集一則在地文化故事並附上金門語詞彙</li>
</ul>

<h3>課程進度建議</h3>
<ol>
  <li>第 1-2 週：進入學習平台，完成基礎發音單元</li>
  <li>第 3-4 週：練習日常對話，準備錄音作業</li>
  <li>第 5-8 週：深入文化內容，完成文化故事蒐集</li>
</ol>`,
    order: 1, visible: true, availability: {}, completion: { type: 'view' },
    stats: { views: 0, completions: 0 }, createdAt: now, updatedAt: now
  });
  console.log(`  ✓ 課程說明頁已建立: ${introActivityId}`);

  // 第一章活動：金門語簡介影片（示範用）
  const videoActivityId = generateId('act');
  await putItem({
    PK: `COURSE#${courseId}`, SK: 'ACTIVITY#01#002', entityType: 'COURSE_ACTIVITY',
    activityId: videoActivityId, courseId, sectionId: '01', type: 'page',
    title: '金門語是什麼？',
    description: '認識金門語的語言背景與特色。',
    content: `<h2>金門語簡介</h2>
<p>金門語是閩南語的一個分支，主要使用於金門列島。與台灣本島的閩南語（台語）相比，金門語保留了更多古閩南語的特徵，在聲調、詞彙和語法上都有其獨特之處。</p>

<h3>金門語的特色</h3>
<ul>
  <li><strong>聲調系統</strong>：金門語保留了較完整的入聲系統</li>
  <li><strong>詞彙差異</strong>：許多日常用詞與台灣閩南語不同</li>
  <li><strong>文化連結</strong>：語言中保留了豐富的金門在地文化元素</li>
</ul>

<h3>為什麼要學金門語？</h3>
<p>金門語是珍貴的本土語言文化資產。隨著年輕一代使用減少，保存與傳承金門語成為重要的文化課題。透過學習金門語，我們能更深入了解金門的歷史、文化與在地生活。</p>`,
    order: 2, visible: true, availability: {}, completion: { type: 'view' },
    stats: { views: 0, completions: 0 }, createdAt: now, updatedAt: now
  });
  console.log(`  ✓ 金門語簡介頁已建立: ${videoActivityId}`);

  // 學習平台章節
  const activityId = generateId('act');
  await putItem({
    PK: `COURSE#${courseId}`, SK: 'SECTION#02', entityType: 'COURSE_SECTION',
    sectionId: '02', courseId, title: '學習平台',
    summary: '金門語互動學習平台',
    order: 2, visible: true, createdAt: now, updatedAt: now
  });

  await putItem({
    PK: `COURSE#${courseId}`, SK: 'ACTIVITY#02#001', entityType: 'COURSE_ACTIVITY',
    activityId, courseId, sectionId: '02', type: 'url',
    title: '金門語學習平台',
    description: '互動式金門語學習平台，包含發音練習、日常對話及文化介紹。',
    url: 'https://kinmen-learning-platfrom.vercel.app',
    order: 1, visible: true, availability: {}, completion: { type: 'view' },
    stats: { views: 0, completions: 0 }, createdAt: now, updatedAt: now
  });
  console.log(`  ✓ 學習平台活動已建立: ${activityId}`);

  // 更新課程統計
  await putItem({ ...courseItem, stats: { totalActivities: 3, totalSections: 2 }, updatedAt: new Date().toISOString() });

  // 加入講師
  await putItem({
    PK: `USER#${userId}`, SK: `PROG#COURSE#${courseId}`, entityType: 'COURSE_PROGRESS',
    GSI1PK: `COURSE#${courseId}`, GSI1SK: `ENROLLED#${userId}`,
    userId, courseId, courseTitle: COURSE_TITLE, role: 'instructor', status: 'active',
    progressPercentage: 0, completedActivities: [],
    enrolledAt: now, lastAccess: now, createdAt: now, updatedAt: now
  });
  console.log(`  ✓ ${demoUser.displayName} 已加入為課程講師`);

  // 授權
  const licenseId = generateId('lic');
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);

  await putItem({
    PK: `LIC#${licenseId}`, SK: 'META', entityType: 'LICENSE',
    GSI1PK: `USER#${userId}`, GSI1SK: `LIC#${licenseId}`,
    GSI2PK: 'STATUS#active', GSI2SK: expiryDate.toISOString(),
    licenseId, resourceId: courseId, resourceTitle: COURSE_TITLE,
    userId, userName: demoUser.displayName, userEmail: DEMO_EMAIL,
    licenseType: 'personal', status: 'active', expiryDate: expiryDate.toISOString(),
    notes: '金門語課程授權', createdAt: now, updatedAt: now
  });
  await putItem({
    PK: `USER#${userId}`, SK: `LIC#${licenseId}`, entityType: 'USER_LICENSE',
    GSI1PK: `LIC#${licenseId}`, GSI1SK: `USER#${userId}`,
    licenseId, resourceId: courseId, resourceTitle: COURSE_TITLE,
    status: 'active', expiryDate: expiryDate.toISOString(),
    createdAt: now, updatedAt: now
  });
  console.log(`  ✓ 授權已建立: ${licenseId}`);

  console.log('\n════════════════════════════════════════════');
  console.log('✅ 金門語課程建立完成！');
  console.log('════════════════════════════════════════════');
  console.log(`  課程 ID:    ${courseId}`);
  console.log(`  課程名稱:   ${COURSE_TITLE}`);
  console.log(`  學習平台:   https://kinmen-learning-platfrom.vercel.app`);
  console.log(`  授權老師:   ${demoUser.displayName} (${DEMO_EMAIL})`);
  console.log('════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ 執行失敗:', err);
  process.exit(1);
});
