/**
 * Seed Script: 心靈成長 Mindful Minds
 * 建立課程、章節、影片活動，授權給 demo 老師
 *
 * 執行方式：node backend/scripts/seed-mindful-course.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

// DynamoDB
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

// ===== Course Definition =====
const COURSE_TITLE = '心靈成長 Mindful Minds';
const DEMO_EMAIL = 'demo@beyondbridge.com';

const SECTIONS = [
  {
    title: '影片',
    summary: '心靈成長相關影片資源',
    activities: [
      {
        type: 'url',
        title: '正念冥想入門',
        url: 'https://youtu.be/BFrW9ARq8B4?si=XutukMh_6BYKFLKj',
        description: '透過這段影片學習正念冥想的基礎概念與練習方法。'
      }
    ]
  }
];

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  心靈成長 Mindful Minds Seed Script      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n目標表格: ${TABLE_NAME}`);

  // 1. Find demo user
  console.log(`\n[1/5] 查找 demo 老師 (${DEMO_EMAIL})...`);
  const demoUser = await getUserByEmail(DEMO_EMAIL);
  if (!demoUser) {
    console.error(`  ✗ 找不到 ${DEMO_EMAIL}，請先建立此用戶`);
    process.exit(1);
  }
  const userId = demoUser.userId || demoUser.PK?.replace('USER#', '');
  console.log(`  ✓ 找到老師: ${demoUser.displayName} (${userId})`);

  const now = new Date().toISOString();
  const courseId = generateId('course');

  // 2. Create course
  console.log(`\n[2/5] 建立課程: ${COURSE_TITLE}...`);
  const courseItem = {
    PK: `COURSE#${courseId}`,
    SK: 'META',
    entityType: 'COURSE',
    GSI1PK: 'CAT#wellness',
    GSI1SK: `COURSE#${courseId}`,
    GSI2PK: 'STATUS#published',
    GSI2SK: now,

    courseId,
    title: COURSE_TITLE,
    shortName: 'MindfulMinds',
    description: '心靈成長課程，透過正念冥想、自我覺察等練習，幫助學生培養內在平靜與情緒管理能力。課程包含精選影片資源，讓學生在課堂內外都能練習。',
    summary: '培養正念與心靈成長的入門課程。',
    category: 'wellness',
    format: 'topics',

    instructorId: userId,
    instructorName: demoUser.displayName || 'Demo Teacher',

    startDate: '2026-03-10',
    endDate: '2026-06-30',
    visibility: 'show',
    status: 'published',

    selfEnrollment: true,
    enrollmentCount: 0,

    tags: ['心靈成長', '正念', '冥想', 'mindfulness'],
    language: 'zh-TW',

    settings: {
      showActivityDates: true,
      showActivityReports: true,
      enableCompletion: true,
      enableGrades: false
    },
    stats: {
      totalActivities: 0,
      totalSections: 0,
      averageRating: 0,
      totalRatings: 0,
      completionRate: 0
    },

    createdAt: now,
    updatedAt: now
  };
  await putItem(courseItem);
  console.log(`  ✓ 課程已建立: ${courseId}`);

  // 3. Create default section (課程簡介)
  console.log(`\n[3/5] 建立章節與活動...`);
  const defaultSection = {
    PK: `COURSE#${courseId}`,
    SK: 'SECTION#01',
    entityType: 'COURSE_SECTION',
    sectionId: '01',
    courseId,
    title: '課程簡介',
    summary: '歡迎來到心靈成長 Mindful Minds 課程！本課程透過影片、練習等多元方式，引導你探索內在世界，培養正念生活的能力。',
    order: 1,
    visible: true,
    createdAt: now,
    updatedAt: now
  };
  await putItem(defaultSection);

  let totalActivities = 0;

  // Create sections and activities
  for (let i = 0; i < SECTIONS.length; i++) {
    const section = SECTIONS[i];
    const sectionNum = String(i + 2).padStart(2, '0');

    const sectionItem = {
      PK: `COURSE#${courseId}`,
      SK: `SECTION#${sectionNum}`,
      entityType: 'COURSE_SECTION',
      sectionId: sectionNum,
      courseId,
      title: section.title,
      summary: section.summary,
      order: i + 2,
      visible: true,
      createdAt: now,
      updatedAt: now
    };
    await putItem(sectionItem);
    console.log(`\n  📂 章節 ${sectionNum}: ${section.title}`);

    for (let j = 0; j < section.activities.length; j++) {
      const act = section.activities[j];
      const activityNum = String(j + 1).padStart(3, '0');
      const activityId = generateId('act');

      const activityItem = {
        PK: `COURSE#${courseId}`,
        SK: `ACTIVITY#${sectionNum}#${activityNum}`,
        entityType: 'COURSE_ACTIVITY',

        activityId,
        courseId,
        sectionId: sectionNum,
        type: act.type,
        title: act.title,
        description: act.description || '',
        url: act.url || null,

        order: j + 1,
        visible: true,

        availability: {},
        completion: { type: 'view' },
        stats: { views: 0, completions: 0 },

        createdAt: now,
        updatedAt: now
      };
      await putItem(activityItem);
      totalActivities++;

      const icon = act.type === 'url' ? '🎬' : '📄';
      console.log(`    ${icon} ${act.title}`);
    }
  }

  // Update course stats
  const updateItem = {
    ...courseItem,
    stats: {
      ...courseItem.stats,
      totalActivities,
      totalSections: SECTIONS.length + 1
    },
    updatedAt: new Date().toISOString()
  };
  await putItem(updateItem);
  console.log(`\n  ✓ 共建立 ${totalActivities} 個活動`);

  // 4. Enroll instructor
  console.log(`\n[4/5] 將老師加入課程...`);
  const enrollItem = {
    PK: `USER#${userId}`,
    SK: `PROG#COURSE#${courseId}`,
    entityType: 'COURSE_PROGRESS',
    GSI1PK: `COURSE#${courseId}`,
    GSI1SK: `ENROLLED#${userId}`,

    userId,
    courseId,
    courseTitle: COURSE_TITLE,
    role: 'instructor',
    status: 'active',
    progressPercentage: 0,
    completedActivities: [],
    enrolledAt: now,
    lastAccess: now,
    createdAt: now,
    updatedAt: now
  };
  await putItem(enrollItem);
  console.log(`  ✓ ${demoUser.displayName} 已加入為課程講師`);

  // 5. Grant license
  console.log(`\n[5/5] 建立教材授權...`);
  const licenseId = generateId('lic');
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);

  const licenseItem = {
    PK: `LIC#${licenseId}`,
    SK: 'META',
    entityType: 'LICENSE',
    GSI1PK: `USER#${userId}`,
    GSI1SK: `LIC#${licenseId}`,
    GSI2PK: 'STATUS#active',
    GSI2SK: expiryDate.toISOString(),

    licenseId,
    resourceId: courseId,
    resourceTitle: COURSE_TITLE,
    userId,
    userName: demoUser.displayName,
    userEmail: DEMO_EMAIL,
    licenseType: 'personal',
    status: 'active',
    expiryDate: expiryDate.toISOString(),
    notes: '心靈成長課程授權',

    createdAt: now,
    updatedAt: now
  };
  await putItem(licenseItem);

  const userLicenseItem = {
    PK: `USER#${userId}`,
    SK: `LIC#${licenseId}`,
    entityType: 'USER_LICENSE',
    GSI1PK: `LIC#${licenseId}`,
    GSI1SK: `USER#${userId}`,

    licenseId,
    resourceId: courseId,
    resourceTitle: COURSE_TITLE,
    status: 'active',
    expiryDate: expiryDate.toISOString(),

    createdAt: now,
    updatedAt: now
  };
  await putItem(userLicenseItem);
  console.log(`  ✓ 授權已建立: ${licenseId}`);

  // Summary
  console.log('\n════════════════════════════════════════════');
  console.log('✅ 心靈成長 Mindful Minds 建立完成！');
  console.log('════════════════════════════════════════════');
  console.log(`  課程 ID:    ${courseId}`);
  console.log(`  課程名稱:   ${COURSE_TITLE}`);
  console.log(`  章節數:     ${SECTIONS.length + 1}（含課程簡介）`);
  console.log(`  活動數:     ${totalActivities}`);
  console.log(`  授權老師:   ${demoUser.displayName} (${DEMO_EMAIL})`);
  console.log(`  授權到期:   ${expiryDate.toISOString().split('T')[0]}`);
  console.log('════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ 執行失敗:', err);
  process.exit(1);
});
