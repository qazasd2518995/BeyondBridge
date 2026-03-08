/**
 * Seed Script: 泰山高中德語課
 * 建立課程、章節、上傳 PDF 教材、授權給 demo 老師
 *
 * 執行方式：node backend/scripts/seed-german-course.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

// Upload dir
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');

// ===== Course Definition =====
const COURSE_TITLE = '泰山高中德語課';
const DEMO_EMAIL = 'demo@beyondbridge.com';

const WEEKS = [
  {
    title: '第一週：德語入門與基礎發音',
    summary: '認識德語字母、基本發音規則，以及簡單的自我介紹。',
    files: [
      { path: '/Users/justin/德文教材/German-Slide-version-1.pdf', title: '第一週 課程簡報' },
      { path: '/Users/justin/德文教材/lesson_plan.pdf', title: '第一週 教案' },
      { path: '/Users/justin/德文教材/worksheet.pdf', title: '第一週 學習單' },
    ]
  },
  {
    title: '第二週：日常用語與基本文法',
    summary: '學習日常問候語、數字，以及德語名詞的性別概念。',
    files: [
      { path: '/Users/justin/德文教材/German-Slide-version-2-updated.pdf', title: '第二週 課程簡報' },
      { path: '/Users/justin/德文教材/lesson_plan_w2.pdf', title: '第二週 教案' },
      { path: '/Users/justin/德文教材/worksheet_w2.pdf', title: '第二週 學習單' },
    ]
  },
  {
    title: '第三週：動詞變化與簡單句型',
    summary: '學習德語規則動詞變化，練習造簡單句子。',
    files: [
      { path: '/Users/justin/德文教材/German-Slide-version-3-updated.pdf', title: '第三週 課程簡報' },
      { path: '/Users/justin/德文教材/lesson_plan_w3.pdf', title: '第三週 教案' },
      { path: '/Users/justin/德文教材/worksheet_w3.pdf', title: '第三週 學習單' },
    ]
  },
];

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  泰山高中德語課 Seed Script               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n目標表格: ${TABLE_NAME}`);

  // Ensure upload dir exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

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
    GSI1PK: 'CAT#language',
    GSI1SK: `COURSE#${courseId}`,
    GSI2PK: 'STATUS#published',
    GSI2SK: now,

    courseId,
    title: COURSE_TITLE,
    shortName: 'TSHS-German',
    description: '泰山高中德語選修課程，涵蓋德語基礎發音、日常用語、基本文法等內容。透過每週系統化的教學，讓學生能夠掌握德語入門知識。',
    summary: '高中德語入門課程，適合零基礎學生。',
    category: 'language',
    format: 'weeks',

    instructorId: userId,
    instructorName: demoUser.displayName || 'Demo Teacher',

    startDate: '2026-03-10',
    endDate: '2026-06-30',
    visibility: 'show',
    status: 'published',

    selfEnrollment: true,
    enrollmentCount: 0,

    tags: ['德語', '高中', '外語', '泰山高中'],
    language: 'zh-TW',

    settings: {
      showActivityDates: true,
      showActivityReports: true,
      enableCompletion: true,
      enableGrades: true,
      gradeToPass: 60
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

  // 3. Create sections and upload files
  console.log(`\n[3/5] 建立章節與上傳教材...`);
  let totalActivities = 0;

  for (let i = 0; i < WEEKS.length; i++) {
    const week = WEEKS[i];
    const sectionNum = String(i + 2).padStart(2, '0'); // 01 is default "課程簡介", start from 02

    // Create section
    const sectionItem = {
      PK: `COURSE#${courseId}`,
      SK: `SECTION#${sectionNum}`,
      entityType: 'COURSE_SECTION',
      sectionId: sectionNum,
      courseId,
      title: week.title,
      summary: week.summary,
      order: i + 2,
      visible: true,
      createdAt: now,
      updatedAt: now
    };
    await putItem(sectionItem);
    console.log(`\n  📂 章節 ${sectionNum}: ${week.title}`);

    // Upload files and create activities
    for (let j = 0; j < week.files.length; j++) {
      const fileInfo = week.files[j];
      const activityNum = String(j + 1).padStart(3, '0');

      // Read and upload file
      if (!fs.existsSync(fileInfo.path)) {
        console.log(`    ⚠ 跳過（檔案不存在）: ${fileInfo.path}`);
        continue;
      }

      const buffer = fs.readFileSync(fileInfo.path);
      const fileId = generateId('file');
      const ext = path.extname(fileInfo.path);
      const originalName = path.basename(fileInfo.path);
      const storageName = `${fileId}${ext}`;
      const storagePath = path.join(UPLOAD_DIR, storageName);
      const hash = crypto.createHash('md5').update(buffer).digest('hex');

      // Save file to uploads dir
      fs.writeFileSync(storagePath, buffer);

      // Create file record in DB
      const fileItem = {
        PK: `FILE#${fileId}`,
        SK: 'META',
        entityType: 'FILE',
        GSI1PK: `USER#${userId}`,
        GSI1SK: `FILE#${now}`,

        fileId,
        filename: originalName,
        storageName,
        storagePath,
        contentType: 'application/pdf',
        size: buffer.length,
        hash,

        folder: `/courses/${courseId}/week${i + 1}`,
        courseId,
        visibility: 'course',

        uploadedBy: userId,
        createdAt: now,
        updatedAt: now
      };
      await putItem(fileItem);

      // Create activity linking file to section
      const activityId = generateId('act');
      const activityItem = {
        PK: `COURSE#${courseId}`,
        SK: `ACTIVITY#${sectionNum}#${activityNum}`,
        entityType: 'COURSE_ACTIVITY',

        activityId,
        courseId,
        sectionId: sectionNum,
        type: 'file',
        title: fileInfo.title,
        description: '',
        fileId,

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

      const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
      console.log(`    📄 ${fileInfo.title} (${sizeMB} MB) → ${fileId}`);
    }
  }

  // Also create default section 01
  const defaultSection = {
    PK: `COURSE#${courseId}`,
    SK: 'SECTION#01',
    entityType: 'COURSE_SECTION',
    sectionId: '01',
    courseId,
    title: '課程簡介',
    summary: '歡迎來到泰山高中德語課！本課程為零基礎德語入門，每週透過簡報、教案與學習單，循序漸進地學習德語。',
    order: 1,
    visible: true,
    createdAt: now,
    updatedAt: now
  };
  await putItem(defaultSection);

  // Update course stats
  const updateItem = {
    PK: `COURSE#${courseId}`,
    SK: 'META',
    ...courseItem,
    stats: {
      ...courseItem.stats,
      totalActivities,
      totalSections: WEEKS.length + 1 // including default section
    },
    updatedAt: new Date().toISOString()
  };
  await putItem(updateItem);

  console.log(`\n  ✓ 共上傳 ${totalActivities} 個教材活動`);

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
    notes: '泰山高中德語課授權',

    createdAt: now,
    updatedAt: now
  };
  await putItem(licenseItem);

  // Also create user-side license reference
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
  console.log('✅ 泰山高中德語課 建立完成！');
  console.log('════════════════════════════════════════════');
  console.log(`  課程 ID:    ${courseId}`);
  console.log(`  課程名稱:   ${COURSE_TITLE}`);
  console.log(`  章節數:     ${WEEKS.length + 1}（含課程簡介）`);
  console.log(`  教材檔案:   ${totalActivities} 個 PDF`);
  console.log(`  授權老師:   ${demoUser.displayName} (${DEMO_EMAIL})`);
  console.log(`  授權到期:   ${expiryDate.toISOString().split('T')[0]}`);
  console.log('════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ 執行失敗:', err);
  process.exit(1);
});
