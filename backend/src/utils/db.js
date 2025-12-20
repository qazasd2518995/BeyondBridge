/**
 * DynamoDB 操作工具模組
 * BeyondBridge Education Platform
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand
} = require('@aws-sdk/lib-dynamodb');

// 初始化 DynamoDB 客戶端
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: true
  }
});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

/**
 * 取得單一項目
 */
async function getItem(pk, sk) {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk }
  });

  const response = await docClient.send(command);
  return response.Item;
}

/**
 * 新增或更新項目
 */
async function putItem(item) {
  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  });

  await docClient.send(command);
  return item;
}

/**
 * 更新項目的特定欄位
 */
async function updateItem(pk, sk, updates) {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  Object.entries(updates).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  });

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  });

  const response = await docClient.send(command);
  return response.Attributes;
}

/**
 * 刪除項目
 */
async function deleteItem(pk, sk) {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk }
  });

  await docClient.send(command);
  return true;
}

/**
 * 查詢項目（使用 Partition Key）
 */
async function query(pk, options = {}) {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': pk }
  };

  // 添加 Sort Key 條件
  if (options.skPrefix) {
    params.KeyConditionExpression += ' AND begins_with(SK, :skPrefix)';
    params.ExpressionAttributeValues[':skPrefix'] = options.skPrefix;
  }

  if (options.skEquals) {
    params.KeyConditionExpression += ' AND SK = :sk';
    params.ExpressionAttributeValues[':sk'] = options.skEquals;
  }

  // 添加篩選條件
  if (options.filter) {
    params.FilterExpression = options.filter.expression;
    Object.assign(params.ExpressionAttributeValues, options.filter.values);
    if (options.filter.names) {
      params.ExpressionAttributeNames = options.filter.names;
    }
  }

  // 限制數量
  if (options.limit) {
    params.Limit = options.limit;
  }

  // 排序方向
  if (options.scanIndexForward !== undefined) {
    params.ScanIndexForward = options.scanIndexForward;
  }

  // 使用 GSI
  if (options.indexName) {
    params.IndexName = options.indexName;
  }

  const command = new QueryCommand(params);
  const response = await docClient.send(command);
  return response.Items || [];
}

/**
 * 使用 GSI 查詢
 */
async function queryByIndex(indexName, pkValue, pkName = 'GSI1PK', options = {}) {
  const params = {
    TableName: TABLE_NAME,
    IndexName: indexName,
    KeyConditionExpression: `${pkName} = :pk`,
    ExpressionAttributeValues: { ':pk': pkValue }
  };

  if (options.skName && options.skValue) {
    params.KeyConditionExpression += ` AND ${options.skName} = :sk`;
    params.ExpressionAttributeValues[':sk'] = options.skValue;
  }

  if (options.skPrefix && options.skName) {
    params.KeyConditionExpression += ` AND begins_with(${options.skName}, :skPrefix)`;
    params.ExpressionAttributeValues[':skPrefix'] = options.skPrefix;
  }

  if (options.filter) {
    params.FilterExpression = options.filter.expression;
    Object.assign(params.ExpressionAttributeValues, options.filter.values);
  }

  if (options.limit) {
    params.Limit = options.limit;
  }

  const command = new QueryCommand(params);
  const response = await docClient.send(command);
  return response.Items || [];
}

/**
 * 掃描表格（慎用，效能較差）
 */
async function scan(options = {}) {
  const params = {
    TableName: TABLE_NAME
  };

  if (options.filter) {
    params.FilterExpression = options.filter.expression;
    params.ExpressionAttributeValues = options.filter.values;
    if (options.filter.names) {
      params.ExpressionAttributeNames = options.filter.names;
    }
  }

  if (options.limit) {
    params.Limit = options.limit;
  }

  if (options.indexName) {
    params.IndexName = options.indexName;
  }

  const command = new ScanCommand(params);
  const response = await docClient.send(command);
  return response.Items || [];
}

/**
 * 批量寫入項目
 */
async function batchWrite(items) {
  const batches = [];

  // DynamoDB 每次最多處理 25 個項目
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  for (const batch of batches) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map(item => ({
          PutRequest: { Item: item }
        }))
      }
    });

    await docClient.send(command);
  }

  return items.length;
}

/**
 * 透過 Email 查詢用戶（使用 GSI4）
 */
async function getUserByEmail(email) {
  const items = await queryByIndex('GSI4', email, 'email');
  // 過濾只取 USER 類型
  const user = items.find(item => item.entityType === 'USER');
  return user || null;
}

/**
 * 取得用戶資料
 */
async function getUser(userId) {
  return getItem(`USER#${userId}`, 'PROFILE');
}

/**
 * 取得管理員資料
 */
async function getAdmin(adminId) {
  return getItem(`ADMIN#${adminId}`, 'PROFILE');
}

/**
 * 透過 Email 查詢管理員（使用 GSI4）
 */
async function getAdminByEmail(email) {
  const items = await queryByIndex('GSI4', email, 'email');
  // 過濾只取 ADMIN 類型
  const admin = items.find(item => item.entityType === 'ADMIN');
  return admin || null;
}

/**
 * 取得所有用戶
 */
async function getAllUsers(options = {}) {
  return scan({
    filter: {
      expression: 'entityType = :type',
      values: { ':type': 'USER' }
    },
    ...options
  });
}

/**
 * 取得所有資源
 */
async function getAllResources(options = {}) {
  return scan({
    filter: {
      expression: 'entityType = :type',
      values: { ':type': 'RESOURCE' }
    },
    ...options
  });
}

/**
 * 依分類取得資源
 */
async function getResourcesByCategory(category) {
  return queryByIndex('GSI1', `CAT#${category}`, 'GSI1PK');
}

/**
 * 依狀態取得資源
 */
async function getResourcesByStatus(status) {
  return queryByIndex('GSI2', `STATUS#${status}`, 'GSI2PK');
}

/**
 * 取得用戶的課程進度
 */
async function getUserCourseProgress(userId) {
  return query(`USER#${userId}`, { skPrefix: 'PROG#COURSE#' });
}

/**
 * 取得用戶的授權
 */
async function getUserLicenses(userId) {
  return query(`USER#${userId}`, { skPrefix: 'LIC#' });
}

/**
 * 取得用戶的活動日誌
 */
async function getUserActivities(userId, limit = 50) {
  return query(`USER#${userId}`, {
    skPrefix: 'ACT#',
    limit,
    scanIndexForward: false // 最新的在前
  });
}

/**
 * 取得所有公告
 */
async function getActiveAnnouncements() {
  const now = new Date().toISOString();
  return scan({
    filter: {
      expression: 'entityType = :type AND #status = :status AND publishAt <= :now AND expiresAt >= :now',
      values: { ':type': 'ANNOUNCEMENT', ':status': 'active', ':now': now },
      names: { '#status': 'status' }
    }
  });
}

/**
 * 取得課程單元
 */
async function getCourseUnits(courseId) {
  return query(`COURSE#${courseId}`, { skPrefix: 'UNIT#' });
}

/**
 * 產生唯一 ID
 */
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

module.exports = {
  client,
  docClient,
  TABLE_NAME,
  getItem,
  putItem,
  updateItem,
  deleteItem,
  query,
  queryByIndex,
  scan,
  batchWrite,
  getUserByEmail,
  getUser,
  getAdmin,
  getAdminByEmail,
  getAllUsers,
  getAllResources,
  getResourcesByCategory,
  getResourcesByStatus,
  getUserCourseProgress,
  getUserLicenses,
  getUserActivities,
  getActiveAnnouncements,
  getCourseUnits,
  generateId
};
