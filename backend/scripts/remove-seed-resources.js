/**
 * 移除預設種子教材資源
 * 執行方式：node scripts/remove-seed-resources.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

const seedResourceIds = [
  'res_math001',
  'res_eng001',
  'res_corp001',
  'res_kinmen001',
  'res_sci001'
];

async function main() {
  console.log('移除預設種子教材資源...\n');
  console.log(`目標表格: ${TABLE_NAME}\n`);

  for (const id of seedResourceIds) {
    try {
      // 先確認存在
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `RES#${id}`, SK: 'META' }
      }));

      if (result.Item) {
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: `RES#${id}`, SK: 'META' }
        }));
        console.log(`  ✓ 已刪除: ${result.Item.title} (${id})`);
      } else {
        console.log(`  - 不存在: ${id}`);
      }
    } catch (error) {
      console.error(`  ✗ 刪除失敗: ${id}`, error.message);
    }
  }

  console.log('\n完成！');
}

main().catch(console.error);
