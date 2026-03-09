/**
 * 金門語教材獨立 Seed 腳本
 * 單獨將金門語教材寫入 DynamoDB 的 RESOURCE 表
 *
 * 執行方式：node backend/scripts/seed-kinmen-resource.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

const kinmenResource = {
  resourceId: 'res_kinmen001',
  title: '金門語學習平台',
  titleEn: 'Kinmen Language Learning Platform',
  description: '金門語（閩南語金門腔）互動式學習平台，包含發音練習、日常對話、文化故事等豐富內容。透過 LTI 整合，提供沉浸式語言學習體驗。',
  type: 'interactive',
  category: 'language',
  subcategory: 'kinmen-dialect',
  gradeLevel: 'university',
  tags: ['金門語', '閩南語', '語言學習', '文化傳承'],
  creatorId: 'usr_justin',
  creatorName: 'Justin',
  duration: 0,
  unitCount: 6,
  viewCount: 320,
  averageRating: 4.9,
  ratingCount: 42,
  status: 'published',
  ltiToolId: 'kinmen-language-tool',
  requiresEnrollment: true
};

async function seedKinmenResource() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   金門語教材 Seed 工具                   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n目標表格: ${TABLE_NAME}`);

  const now = new Date().toISOString();

  const item = {
    PK: `RES#${kinmenResource.resourceId}`,
    SK: 'META',
    GSI1PK: `CAT#${kinmenResource.category}`,
    GSI1SK: `RES#${kinmenResource.resourceId}`,
    GSI2PK: `STATUS#${kinmenResource.status}`,
    GSI2SK: now,
    entityType: 'RESOURCE',
    createdAt: now,

    ...kinmenResource,

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
    console.log(`\n  ✓ 已建立金門語教材: ${kinmenResource.title}`);
    console.log(`    resourceId: ${kinmenResource.resourceId}`);
    console.log(`    type: ${kinmenResource.type}`);
    console.log(`    category: ${kinmenResource.category}`);
    console.log(`    ltiToolId: ${kinmenResource.ltiToolId}`);
    console.log(`    requiresEnrollment: ${kinmenResource.requiresEnrollment}`);
    console.log('\n========================================');
    console.log('金門語教材 Seed 完成！');
    console.log('========================================');
  } catch (error) {
    console.error(`\n  ✗ 建立金門語教材失敗:`, error.message);
    process.exit(1);
  }
}

seedKinmenResource().catch(console.error);
