/**
 * 將學生加入四門課程並授權
 * 執行方式：node backend/scripts/enroll-student.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: 'ap-southeast-2',
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
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

const STUDENT_ID = 'usr_mjnzcwlro4wa2h';
const STUDENT_NAME = '王小明';
const STUDENT_EMAIL = 'student@beyondbridge.com';

const COURSES = [
  { courseId: 'course_mmi1vuwctym33b', title: '泰山高中德語課' },
  { courseId: 'course_mmi2bccrxncmlp', title: '心靈成長 Mindful Minds' },
  { courseId: 'course_mmi2vk8rfjnu0g', title: '金門語' },
  { courseId: 'course_mmi2z49pq4crd3', title: '泰雅族語教學' },
];

async function main() {
  const now = new Date().toISOString();
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);

  console.log(`將 ${STUDENT_NAME} (${STUDENT_EMAIL}) 加入課程...\n`);

  for (const course of COURSES) {
    // 1. Enrollment (COURSE_PROGRESS)
    await putItem({
      PK: `USER#${STUDENT_ID}`,
      SK: `PROG#COURSE#${course.courseId}`,
      entityType: 'COURSE_PROGRESS',
      GSI1PK: `COURSE#${course.courseId}`,
      GSI1SK: `ENROLLED#${STUDENT_ID}`,
      userId: STUDENT_ID,
      courseId: course.courseId,
      courseTitle: course.title,
      role: 'student',
      status: 'active',
      progressPercentage: 0,
      completedActivities: [],
      enrolledAt: now,
      lastAccess: now,
      createdAt: now,
      updatedAt: now
    });

    // 2. License
    const licenseId = generateId('lic');
    await putItem({
      PK: `LIC#${licenseId}`,
      SK: 'META',
      entityType: 'LICENSE',
      GSI1PK: `USER#${STUDENT_ID}`,
      GSI1SK: `LIC#${licenseId}`,
      GSI2PK: 'STATUS#active',
      GSI2SK: expiryDate.toISOString(),
      licenseId,
      resourceId: course.courseId,
      resourceTitle: course.title,
      userId: STUDENT_ID,
      userName: STUDENT_NAME,
      userEmail: STUDENT_EMAIL,
      licenseType: 'personal',
      status: 'active',
      expiryDate: expiryDate.toISOString(),
      notes: `${course.title} 學生授權`,
      createdAt: now,
      updatedAt: now
    });

    await putItem({
      PK: `USER#${STUDENT_ID}`,
      SK: `LIC#${licenseId}`,
      entityType: 'USER_LICENSE',
      GSI1PK: `LIC#${licenseId}`,
      GSI1SK: `USER#${STUDENT_ID}`,
      licenseId,
      resourceId: course.courseId,
      resourceTitle: course.title,
      status: 'active',
      expiryDate: expiryDate.toISOString(),
      createdAt: now,
      updatedAt: now
    });

    console.log(`  ✓ ${course.title}`);
  }

  console.log(`\n✅ 完成！${STUDENT_NAME} 已加入 ${COURSES.length} 門課程並取得授權`);
}

main().catch(err => { console.error('❌ 失敗:', err); process.exit(1); });
