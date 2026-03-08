/**
 * 為每門課程建立橋隊（班級）並加入學生
 * 執行方式：node backend/scripts/create-classes.js
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

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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

const TEACHER_EMAIL = 'demo@beyondbridge.com';
const STUDENT_EMAIL = 'student@beyondbridge.com';

const COURSES = [
  { courseId: 'course_mmi1vuwctym33b', title: '泰山高中德語課', subject: '德語' },
  { courseId: 'course_mmi2bccrxncmlp', title: '心靈成長 Mindful Minds', subject: '心靈成長' },
  { courseId: 'course_mmi2vk8rfjnu0g', title: '金門語', subject: '語言' },
  { courseId: 'course_mmi2z49pq4crd3', title: '泰雅族語教學', subject: '語言' },
];

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  建立課程橋隊 + 加入學生                   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 找老師
  const teacher = await getUserByEmail(TEACHER_EMAIL);
  if (!teacher) { console.error('找不到老師'); process.exit(1); }
  const teacherId = teacher.userId || teacher.PK?.replace('USER#', '');
  const teacherName = teacher.displayName || 'Demo Teacher';
  console.log(`  ✓ 老師: ${teacherName} (${teacherId})`);

  // 找學生
  const student = await getUserByEmail(STUDENT_EMAIL);
  if (!student) { console.error('找不到學生'); process.exit(1); }
  const studentId = student.userId || student.PK?.replace('USER#', '');
  const studentName = student.displayName || '王小明';
  const studentEmail = student.email || STUDENT_EMAIL;
  console.log(`  ✓ 學生: ${studentName} (${studentId})\n`);

  const now = new Date().toISOString();

  for (const course of COURSES) {
    const classId = generateId('cls');
    const inviteCode = generateInviteCode();

    // 1. 建立 CLASS 記錄
    await putItem({
      PK: `CLASS#${classId}`,
      SK: 'META',
      GSI1PK: `TEACHER#${teacherId}`,
      GSI1SK: `CLASS#${classId}`,
      entityType: 'CLASS',
      classId,
      name: course.title,
      description: `${course.title} 課程橋隊`,
      subject: course.subject,
      gradeLevel: 'general',
      teacherId,
      teacherName,
      inviteCode,
      memberCount: 1,
      assignmentCount: 0,
      status: 'active',
      courseId: course.courseId,
      createdAt: now,
      updatedAt: now
    });

    // 2. 加入學生為成員
    await putItem({
      PK: `CLASS#${classId}`,
      SK: `MEMBER#${studentId}`,
      entityType: 'CLASS_MEMBER',
      classId,
      userId: studentId,
      userName: studentName,
      userEmail: studentEmail,
      role: 'student',
      joinedAt: now,
      status: 'active',
      createdAt: now
    });

    // 3. 建立學生的反向關係
    await putItem({
      PK: `USER#${studentId}`,
      SK: `ENROLLMENT#${classId}`,
      entityType: 'ENROLLMENT',
      userId: studentId,
      classId,
      className: course.title,
      teacherName,
      enrolledAt: now,
      createdAt: now
    });

    console.log(`  ✓ ${course.title}`);
    console.log(`    橋隊 ID: ${classId}`);
    console.log(`    通行碼: ${inviteCode}\n`);
  }

  console.log('════════════════════════════════════════════');
  console.log(`✅ 完成！已為 ${COURSES.length} 門課程建立橋隊`);
  console.log(`   學生 ${studentName} 已加入所有橋隊`);
  console.log('════════════════════════════════════════════\n');
}

main().catch(err => { console.error('❌ 失敗:', err); process.exit(1); });
