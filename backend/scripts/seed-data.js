/**
 * 初始資料種子腳本
 * 建立管理員帳號、範例資源和課程
 *
 * 執行方式：npm run seed
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

// 管理員帳號定義
const admins = [
  {
    adminId: 'admin_001',
    email: 'justin@beyondbridge.com',
    displayName: 'Justin Cheng',
    displayNameZh: '鄭惟仁'
  },
  {
    adminId: 'admin_002',
    email: 'benjamin@beyondbridge.com',
    displayName: 'Benjamin Chen',
    displayNameZh: '陳柏任'
  },
  {
    adminId: 'admin_003',
    email: 'mina@beyondbridge.com',
    displayName: 'Mina Yang',
    displayNameZh: '楊敏雅'
  }
];

// 範例資源
const sampleResources = [
  {
    resourceId: 'res_math001',
    title: '國中數學 - 一元二次方程式完整教學',
    titleEn: 'Junior High Math - Quadratic Equations',
    description: '從基礎概念到進階應用，包含豐富例題與解題技巧。適合國中七至九年級學生使用。',
    type: 'video',
    category: 'math',
    subcategory: 'algebra',
    gradeLevel: 'junior',
    tags: ['國中', '數學', '代數', '一元二次方程式'],
    creatorId: 'usr_benjamin',
    creatorName: 'Benjamin',
    duration: 480,
    unitCount: 12,
    viewCount: 1200,
    averageRating: 4.8,
    ratingCount: 156,
    status: 'published'
  },
  {
    resourceId: 'res_eng001',
    title: '英文文法互動練習 - 時態大全',
    titleEn: 'English Grammar Interactive - Complete Tenses',
    description: '涵蓋所有英文時態的互動式教材，包含即時測驗與詳細解說。',
    type: 'interactive',
    category: 'english',
    subcategory: 'grammar',
    gradeLevel: 'junior',
    tags: ['英文', '文法', '時態', '互動教材'],
    creatorId: 'usr_mina',
    creatorName: 'Mina',
    duration: 360,
    unitCount: 16,
    viewCount: 856,
    averageRating: 4.9,
    ratingCount: 98,
    status: 'published'
  },
  {
    resourceId: 'res_corp001',
    title: '企業簡報設計實戰手冊',
    titleEn: 'Corporate Presentation Design Handbook',
    description: '專為企業培訓設計的簡報製作教材，包含模板與實戰案例分析。',
    type: 'document',
    category: 'business',
    subcategory: 'presentation',
    gradeLevel: 'corporate',
    tags: ['企業培訓', '簡報設計', 'PowerPoint', '商業溝通'],
    creatorId: 'usr_justin',
    creatorName: 'Justin',
    duration: 240,
    unitCount: 8,
    viewCount: 2300,
    averageRating: 4.7,
    ratingCount: 234,
    status: 'published'
  },
  {
    resourceId: 'res_sci001',
    title: '自然科學實驗影片集',
    titleEn: 'Science Experiment Video Collection',
    description: '精選物理、化學、生物實驗影片，適合國中自然科教學使用。',
    type: 'video',
    category: 'science',
    subcategory: 'experiments',
    gradeLevel: 'junior',
    tags: ['自然科學', '實驗', '物理', '化學', '生物'],
    creatorId: 'usr_benjamin',
    creatorName: 'Benjamin',
    duration: 600,
    unitCount: 20,
    viewCount: 1580,
    averageRating: 4.6,
    ratingCount: 189,
    status: 'published'
  }
];

// 範例課程
const sampleCourses = [
  {
    courseId: 'crs_design001',
    title: '數位教材設計基礎',
    titleEn: 'Digital Material Design Fundamentals',
    description: '系統性學習數位教材設計的核心概念與實作技巧，適合教育工作者入門。',
    unitCount: 12,
    totalDuration: 480,
    difficulty: 'beginner',
    creatorId: 'usr_benjamin',
    creatorName: 'Benjamin Chen',
    enrollmentCount: 234,
    completionRate: 0.72,
    averageRating: 4.7,
    status: 'published'
  },
  {
    courseId: 'crs_video001',
    title: '教學影片製作實務',
    titleEn: 'Educational Video Production',
    description: '從腳本撰寫到後製剪輯，完整教授教學影片製作流程。',
    unitCount: 10,
    totalDuration: 400,
    difficulty: 'intermediate',
    creatorId: 'usr_justin',
    creatorName: 'Justin Cheng',
    enrollmentCount: 156,
    completionRate: 0.68,
    averageRating: 4.8,
    status: 'published'
  }
];

// 範例公告
const sampleAnnouncements = [
  {
    announcementId: 'ann_001',
    title: '歡迎使用 BeyondBridge 教育平台！',
    content: '感謝您加入 BeyondBridge 教育資源平台。我們致力於為教育工作者和企業培訓主管提供高品質的數位教材解決方案。',
    contentHtml: '<p>感謝您加入 <strong>BeyondBridge</strong> 教育資源平台。</p><p>我們致力於為教育工作者和企業培訓主管提供高品質的數位教材解決方案。</p>',
    targetRoles: ['educator', 'trainer', 'creator'],
    priority: 'high',
    displayType: 'banner',
    publishAt: '2025-01-01T00:00:00Z',
    expiresAt: '2026-12-31T23:59:59Z',
    status: 'active',
    viewCount: 0,
    createdBy: 'admin_001'
  }
];

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

async function createAdmins() {
  console.log('\n建立管理員帳號...');

  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'BeyondBridge@2025';
  const hashedPassword = await hashPassword(defaultPassword);
  const now = new Date().toISOString();

  for (const admin of admins) {
    const item = {
      PK: `ADMIN#${admin.adminId}`,
      SK: 'PROFILE',
      GSI1PK: 'ROLE#admin',
      GSI1SK: `ADMIN#${admin.adminId}`,
      entityType: 'ADMIN',
      email: admin.email,
      createdAt: now,

      adminId: admin.adminId,
      displayName: admin.displayName,
      displayNameZh: admin.displayNameZh,
      passwordHash: hashedPassword,

      permissions: [
        'users:*',
        'content:*',
        'licenses:*',
        'orders:*',
        'announcements:*',
        'analytics:*',
        'consultations:*',
        'system:*'
      ],

      status: 'active',
      mfaEnabled: false,
      lastLoginAt: null,
      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));
      console.log(`  ✓ 已建立管理員: ${admin.email}`);
    } catch (error) {
      console.error(`  ✗ 建立管理員失敗: ${admin.email}`, error.message);
    }
  }

  console.log(`\n管理員預設密碼: ${defaultPassword}`);
  console.log('請在首次登入後立即變更密碼！');
}

async function createResources() {
  console.log('\n建立範例教材資源...');

  const now = new Date().toISOString();

  for (const resource of sampleResources) {
    const item = {
      PK: `RES#${resource.resourceId}`,
      SK: 'META',
      GSI1PK: `CAT#${resource.category}`,
      GSI1SK: `RES#${resource.resourceId}`,
      GSI2PK: `STATUS#${resource.status}`,
      GSI2SK: now,
      entityType: 'RESOURCE',
      createdAt: now,

      ...resource,

      pricingModel: 'license',
      price: 0,
      revenueShare: 0.7,
      s3Location: null,
      thumbnailUrl: null,
      publishedAt: now,
      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));
      console.log(`  ✓ 已建立資源: ${resource.title}`);
    } catch (error) {
      console.error(`  ✗ 建立資源失敗: ${resource.title}`, error.message);
    }
  }
}

async function createCourses() {
  console.log('\n建立範例課程...');

  const now = new Date().toISOString();

  for (const course of sampleCourses) {
    // 建立課程主項目
    const courseItem = {
      PK: `COURSE#${course.courseId}`,
      SK: 'META',
      GSI1PK: `CREATOR#${course.creatorId}`,
      GSI1SK: `COURSE#${course.courseId}`,
      GSI2PK: `STATUS#${course.status}`,
      GSI2SK: now,
      entityType: 'COURSE',
      createdAt: now,

      ...course,

      resourceIds: [],
      publishedAt: now,
      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: courseItem
      }));
      console.log(`  ✓ 已建立課程: ${course.title}`);

      // 建立課程單元
      for (let i = 1; i <= Math.min(course.unitCount, 6); i++) {
        const unitItem = {
          PK: `COURSE#${course.courseId}`,
          SK: `UNIT#${String(i).padStart(2, '0')}`,
          entityType: 'COURSE_UNIT',
          createdAt: now,

          unitId: String(i).padStart(2, '0'),
          title: `第 ${i} 單元`,
          description: `課程第 ${i} 單元內容`,
          duration: Math.floor(course.totalDuration / course.unitCount),
          order: i,
          resourceId: null,
          quizId: null,
          isRequired: true
        };

        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: unitItem
        }));
      }
      console.log(`    - 已建立 ${Math.min(course.unitCount, 6)} 個單元`);

    } catch (error) {
      console.error(`  ✗ 建立課程失敗: ${course.title}`, error.message);
    }
  }
}

async function createAnnouncements() {
  console.log('\n建立系統公告...');

  const now = new Date().toISOString();

  for (const ann of sampleAnnouncements) {
    const item = {
      PK: `ANN#${ann.announcementId}`,
      SK: 'META',
      GSI2PK: `STATUS#${ann.status}`,
      GSI2SK: ann.publishAt,
      entityType: 'ANNOUNCEMENT',
      createdAt: now,

      ...ann,

      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));
      console.log(`  ✓ 已建立公告: ${ann.title}`);
    } catch (error) {
      console.error(`  ✗ 建立公告失敗: ${ann.title}`, error.message);
    }
  }
}

async function createSampleUser() {
  console.log('\n建立範例用戶...');

  const now = new Date().toISOString();
  const hashedPassword = await hashPassword('Demo@2025');

  const user = {
    PK: 'USER#usr_demo001',
    SK: 'PROFILE',
    GSI1PK: 'ROLE#educator',
    GSI1SK: 'USER#usr_demo001',
    GSI4PK: 'demo@beyondbridge.com',
    email: 'demo@beyondbridge.com',
    entityType: 'USER',
    createdAt: now,

    userId: 'usr_demo001',
    displayName: '林老師',
    displayNameEn: 'Teacher Lin',
    avatarUrl: null,
    passwordHash: hashedPassword,
    role: 'educator',
    organization: '台北市立第一中學',
    organizationType: 'school',

    subscriptionTier: 'professional',
    subscriptionExpiry: '2025-12-31T23:59:59Z',
    licenseQuota: 100,
    licenseUsed: 24,

    preferences: {
      language: 'zh-TW',
      darkMode: false,
      notifications: {
        newMaterial: true,
        progress: true,
        expiry: true,
        email: false
      }
    },

    stats: {
      totalHours: 42,
      coursesCompleted: 8,
      coursesInProgress: 3
    },

    status: 'active',
    lastLoginAt: now,
    updatedAt: now
  };

  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: user
    }));
    console.log(`  ✓ 已建立範例用戶: ${user.email}`);
    console.log(`  密碼: Demo@2025`);
  } catch (error) {
    console.error(`  ✗ 建立用戶失敗:`, error.message);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   BeyondBridge 初始資料種子工具         ║');
  console.log('╚════════════════════════════════════════╝');

  console.log(`\n目標表格: ${TABLE_NAME}`);

  try {
    await createAdmins();
    await createResources();
    await createCourses();
    await createAnnouncements();
    await createSampleUser();

    console.log('\n========================================');
    console.log('初始資料建立完成！');
    console.log('========================================');
    console.log('\n帳號摘要：');
    console.log('┌─────────────────────────────────────────┐');
    console.log('│ 管理員帳號（3組）：                      │');
    admins.forEach(a => {
      console.log(`│   ${a.email.padEnd(32)} │`);
    });
    console.log('│   密碼: BeyondBridge@2025               │');
    console.log('├─────────────────────────────────────────┤');
    console.log('│ 範例用戶：                               │');
    console.log('│   demo@beyondbridge.com                 │');
    console.log('│   密碼: Demo@2025                       │');
    console.log('└─────────────────────────────────────────┘');

  } catch (error) {
    console.error('\n初始化失敗:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
