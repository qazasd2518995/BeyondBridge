/**
 * DynamoDB 表格設定腳本
 * 建立適合 Single-Table Design 的表格結構
 *
 * 執行方式：npm run setup
 */

require('dotenv').config();

const {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  ListTablesCommand
} = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

// 表格定義
const tableDefinition = {
  TableName: TABLE_NAME,
  KeySchema: [
    { AttributeName: 'PK', KeyType: 'HASH' },  // Partition Key
    { AttributeName: 'SK', KeyType: 'RANGE' }  // Sort Key
  ],
  AttributeDefinitions: [
    { AttributeName: 'PK', AttributeType: 'S' },
    { AttributeName: 'SK', AttributeType: 'S' },
    { AttributeName: 'GSI1PK', AttributeType: 'S' },
    { AttributeName: 'GSI1SK', AttributeType: 'S' },
    { AttributeName: 'GSI2PK', AttributeType: 'S' },
    { AttributeName: 'GSI2SK', AttributeType: 'S' },
    { AttributeName: 'entityType', AttributeType: 'S' },
    { AttributeName: 'createdAt', AttributeType: 'S' },
    { AttributeName: 'email', AttributeType: 'S' }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'GSI1',
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'GSI2',
      KeySchema: [
        { AttributeName: 'GSI2PK', KeyType: 'HASH' },
        { AttributeName: 'GSI2SK', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'GSI3',
      KeySchema: [
        { AttributeName: 'entityType', KeyType: 'HASH' },
        { AttributeName: 'createdAt', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'GSI4',
      KeySchema: [
        { AttributeName: 'email', KeyType: 'HASH' },
        { AttributeName: 'PK', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }
  ],
  BillingMode: 'PAY_PER_REQUEST'  // 按需付費模式
};

async function checkTableExists() {
  try {
    const command = new ListTablesCommand({});
    const response = await client.send(command);
    return response.TableNames.includes(TABLE_NAME);
  } catch (error) {
    console.error('檢查表格時發生錯誤:', error.message);
    return false;
  }
}

async function describeTable() {
  try {
    const command = new DescribeTableCommand({ TableName: TABLE_NAME });
    const response = await client.send(command);
    return response.Table;
  } catch (error) {
    return null;
  }
}

async function createTable() {
  console.log(`\n正在建立表格: ${TABLE_NAME}...`);

  try {
    const command = new CreateTableCommand(tableDefinition);
    await client.send(command);

    console.log('表格建立指令已送出，等待表格就緒...');

    // 等待表格就緒
    let tableReady = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!tableReady && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const table = await describeTable();

      if (table && table.TableStatus === 'ACTIVE') {
        tableReady = true;
        console.log('\n表格已就緒！');
      } else {
        process.stdout.write('.');
        attempts++;
      }
    }

    if (!tableReady) {
      console.log('\n警告：表格建立逾時，請稍後手動確認');
    }

    return true;
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log('表格已存在');
      return true;
    }
    console.error('建立表格失敗:', error.message);
    return false;
  }
}

async function displayTableInfo() {
  const table = await describeTable();

  if (!table) {
    console.log('無法取得表格資訊');
    return;
  }

  console.log('\n========== 表格資訊 ==========');
  console.log(`表格名稱: ${table.TableName}`);
  console.log(`表格狀態: ${table.TableStatus}`);
  console.log(`項目數量: ${table.ItemCount}`);
  console.log(`表格大小: ${table.TableSizeBytes} bytes`);
  console.log(`計費模式: ${table.BillingModeSummary?.BillingMode || 'N/A'}`);

  console.log('\n主鍵結構:');
  table.KeySchema.forEach(key => {
    console.log(`  - ${key.AttributeName} (${key.KeyType})`);
  });

  if (table.GlobalSecondaryIndexes) {
    console.log(`\nGSI 索引 (共 ${table.GlobalSecondaryIndexes.length} 個):`);
    table.GlobalSecondaryIndexes.forEach(gsi => {
      const keys = gsi.KeySchema.map(k => k.AttributeName).join(', ');
      console.log(`  - ${gsi.IndexName}: ${keys} (${gsi.IndexStatus})`);
    });
  }

  console.log('\n================================\n');
}

async function deleteTable() {
  console.log(`\n正在刪除表格: ${TABLE_NAME}...`);

  try {
    const command = new DeleteTableCommand({ TableName: TABLE_NAME });
    await client.send(command);

    console.log('表格刪除指令已送出，等待刪除完成...');

    // 等待表格刪除完成
    let tableDeleted = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!tableDeleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const exists = await checkTableExists();

      if (!exists) {
        tableDeleted = true;
        console.log('\n表格已刪除！');
      } else {
        process.stdout.write('.');
        attempts++;
      }
    }

    return tableDeleted;
  } catch (error) {
    console.error('刪除表格失敗:', error.message);
    return false;
  }
}

async function checkTableSchema() {
  const table = await describeTable();
  if (!table) return false;

  // 檢查是否有正確的 PK 和 SK
  const hasPK = table.KeySchema.some(k => k.AttributeName === 'PK' && k.KeyType === 'HASH');
  const hasSK = table.KeySchema.some(k => k.AttributeName === 'SK' && k.KeyType === 'RANGE');

  return hasPK && hasSK;
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   BeyondBridge DynamoDB 設定工具       ║');
  console.log('╚════════════════════════════════════════╝');

  console.log(`\nAWS Region: ${process.env.AWS_REGION}`);
  console.log(`Target Table: ${TABLE_NAME}`);

  const exists = await checkTableExists();

  if (exists) {
    console.log('\n表格已存在，檢查結構...');
    const schemaCorrect = await checkTableSchema();

    if (schemaCorrect) {
      console.log('表格結構正確！');
      await displayTableInfo();
    } else {
      console.log('表格結構不正確（缺少 PK/SK），需要重建...');
      const deleted = await deleteTable();

      if (deleted) {
        console.log('\n開始建立新表格...');
        const success = await createTable();
        if (success) {
          await displayTableInfo();
        }
      }
    }
  } else {
    console.log('\n表格不存在，開始建立...');
    const success = await createTable();

    if (success) {
      await displayTableInfo();
    }
  }

  console.log('設定完成！');
  console.log('\n下一步：執行 npm run seed 來建立初始資料');
}

main().catch(console.error);
