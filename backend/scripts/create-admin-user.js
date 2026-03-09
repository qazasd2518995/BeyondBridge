/**
 * 創建管理員用戶
 * 使用與應用程式相同的資料結構
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
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

// 使用 bcrypt 加密密碼
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

// 生成 ID
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

async function createAdminUser() {
  const email = 'admin@example.com';
  const password = 'admin123';
  const now = new Date().toISOString();

  // 先刪除舊的用戶記錄（如果存在）
  const scanResult = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': email
    }
  }));

  if (scanResult.Items && scanResult.Items.length > 0) {
    for (const item of scanResult.Items) {
      console.log('刪除舊記錄:', item.PK, item.SK);
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: item.PK,
          SK: item.SK
        }
      }));
    }
  }

  const userId = generateId('usr');
  const passwordHash = await hashPassword(password);

  // 使用與應用程式相同的資料結構
  const user = {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    // GSI4 用於透過 email 查詢
    email,
    entityType: 'USER',
    userId,
    passwordHash,
    displayName: 'System Admin',
    role: 'admin',
    isAdmin: true,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: user
  }));

  console.log('✅ 管理員帳戶創建成功！');
  console.log('');
  console.log('登入資訊:');
  console.log(`  - Email: ${email}`);
  console.log(`  - Password: ${password}`);
  console.log(`  - User ID: ${userId}`);
}

createAdminUser().catch(console.error);
