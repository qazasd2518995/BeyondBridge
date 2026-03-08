require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'ap-southeast-2', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
const docClient = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true }});

const courseId = 'course_mmi2bccrxncmlp';
const now = new Date().toISOString();
const ts = Date.now().toString(36);
const rnd = Math.random().toString(36).substring(2, 8);
const activityId = 'act_' + ts + rnd;

(async () => {
  await docClient.send(new PutCommand({ TableName: 'beyondbridge', Item: {
    PK: 'COURSE#' + courseId, SK: 'SECTION#03', entityType: 'COURSE_SECTION',
    sectionId: '03', courseId, title: '學習平台', summary: '線上互動學習平台',
    order: 3, visible: true, createdAt: now, updatedAt: now
  }}));
  console.log('✓ 章節已建立: 學習平台');

  await docClient.send(new PutCommand({ TableName: 'beyondbridge', Item: {
    PK: 'COURSE#' + courseId, SK: 'ACTIVITY#03#001', entityType: 'COURSE_ACTIVITY',
    activityId, courseId, sectionId: '03', type: 'url',
    title: 'Mindful Minds 學習平台',
    description: '互動式心靈成長學習平台，包含各種正念練習與自我覺察工具。',
    url: 'https://mindful-minds-three.vercel.app',
    order: 1, visible: true, availability: {}, completion: { type: 'view' },
    stats: { views: 0, completions: 0 }, createdAt: now, updatedAt: now
  }}));
  console.log('✓ 活動已建立:', activityId);
})().catch(e => console.error('Error:', e));
