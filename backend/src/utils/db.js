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
  BatchWriteCommand,
  BatchGetCommand
} = require('@aws-sdk/lib-dynamodb');
const {
  normalizeDottedUpdateMap,
  splitDottedPath
} = require('./dotted-keys');

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

const RETRYABLE_ERRORS = [
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'InternalServerError',
  'ServiceUnavailable',
  'RequestLimitExceeded'
];

async function withRetry(operation, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable = RETRYABLE_ERRORS.includes(error.name) ||
                          RETRYABLE_ERRORS.includes(error.__type);
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      const delay = Math.min(100 * Math.pow(2, attempt), 2000);
      console.warn(`[DB] Retryable error (${error.name}), attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function applyProjection(params, projection, existingNames = {}) {
  if (!Array.isArray(projection) || projection.length === 0) {
    return existingNames;
  }

  const expressionAttributeNames = { ...existingNames };
  params.ProjectionExpression = projection
    .map((field, index) => {
      const token = `#proj${index}`;
      expressionAttributeNames[token] = field;
      return token;
    })
    .join(', ');

  return expressionAttributeNames;
}

/**
 * 取得單一項目
 */
async function getItem(pk, sk) {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk }
  });

  const response = await withRetry(() => docClient.send(command));
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

  await withRetry(() => docClient.send(command));
  return item;
}

/**
 * 更新項目的特定欄位
 */
async function updateItem(pk, sk, updates, options = {}) {
  const validEntries = Object.entries(updates).filter(([, value]) => value !== undefined);

  if (validEntries.length === 0) {
    return getItem(pk, sk);
  }

  const updateExpressions = [];
  const removeExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  const dottedKeys = validEntries
    .map(([key]) => key)
    .filter(key => splitDottedPath(key));

  let currentItem = null;
  let normalizedUpdates = Object.fromEntries(validEntries);

  if (dottedKeys.length > 0) {
    currentItem = await getItem(pk, sk);
    const normalizedResult = normalizeDottedUpdateMap(normalizedUpdates, currentItem || {});
    normalizedUpdates = normalizedResult.updates;

    dottedKeys
      .filter(key => currentItem && Object.prototype.hasOwnProperty.call(currentItem, key))
      .forEach((key, index) => {
        const removeToken = `#remove${index}`;
        expressionAttributeNames[removeToken] = key;
        removeExpressions.push(removeToken);
      });
  }

  Object.entries(normalizedUpdates).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  });

  const updateClauses = [];
  if (updateExpressions.length > 0) {
    updateClauses.push(`SET ${updateExpressions.join(', ')}`);
  }
  if (removeExpressions.length > 0) {
    updateClauses.push(`REMOVE ${removeExpressions.join(', ')}`);
  }

  const commandInput = {
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk },
    UpdateExpression: updateClauses.join(' '),
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  if (options.conditionExpression) {
    commandInput.ConditionExpression = options.conditionExpression;
    if (options.conditionAttributeNames) {
      commandInput.ExpressionAttributeNames = {
        ...commandInput.ExpressionAttributeNames,
        ...options.conditionAttributeNames
      };
    }
    if (options.conditionAttributeValues) {
      commandInput.ExpressionAttributeValues = {
        ...commandInput.ExpressionAttributeValues,
        ...options.conditionAttributeValues
      };
    }
  }

  const command = new UpdateCommand(commandInput);

  const response = await withRetry(() => docClient.send(command));
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

  await withRetry(() => docClient.send(command));
  return true;
}

/**
 * 查詢項目（使用 Partition Key）
 */
async function query(pk, options = {}) {
  // 支援物件格式呼叫: db.query({ pk: 'X', sk: { begins_with: 'Y' } })
  if (typeof pk === 'object' && pk !== null && pk.pk) {
    const obj = pk;
    pk = obj.pk;
    options = {};
    if (obj.sk && obj.sk.begins_with) {
      options.skPrefix = obj.sk.begins_with;
    }
  }

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

  const projectionNames = applyProjection(params, options.projection, params.ExpressionAttributeNames);
  if (Object.keys(projectionNames).length > 0) {
    params.ExpressionAttributeNames = projectionNames;
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

  const items = [];
  let lastEvaluatedKey;

  do {
    const pageParams = { ...params };
    if (lastEvaluatedKey) {
      pageParams.ExclusiveStartKey = lastEvaluatedKey;
    }
    if (options.limit) {
      const remaining = options.limit - items.length;
      if (remaining <= 0) break;
      pageParams.Limit = remaining;
    }

    const command = new QueryCommand(pageParams);
    const response = await withRetry(() => docClient.send(command));
    items.push(...(response.Items || []));
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey && (!options.limit || items.length < options.limit));

  return items;
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

  if (options.skBetween && options.skName) {
    params.KeyConditionExpression += ` AND ${options.skName} BETWEEN :skStart AND :skEnd`;
    params.ExpressionAttributeValues[':skStart'] = options.skBetween[0];
    params.ExpressionAttributeValues[':skEnd'] = options.skBetween[1];
  }

  if (options.filter) {
    params.FilterExpression = options.filter.expression;
    Object.assign(params.ExpressionAttributeValues, options.filter.values);
    if (options.filter.names) {
      params.ExpressionAttributeNames = options.filter.names;
    }
  }

  const projectionNames = applyProjection(params, options.projection, params.ExpressionAttributeNames);
  if (Object.keys(projectionNames).length > 0) {
    params.ExpressionAttributeNames = projectionNames;
  }

  if (options.limit) {
    params.Limit = options.limit;
  }

  if (options.scanIndexForward !== undefined) {
    params.ScanIndexForward = options.scanIndexForward;
  }

  const items = [];
  let lastEvaluatedKey;

  do {
    const pageParams = { ...params };
    if (lastEvaluatedKey) {
      pageParams.ExclusiveStartKey = lastEvaluatedKey;
    }
    if (options.limit) {
      const remaining = options.limit - items.length;
      if (remaining <= 0) break;
      pageParams.Limit = remaining;
    }

    const command = new QueryCommand(pageParams);
    const response = await withRetry(() => docClient.send(command));
    items.push(...(response.Items || []));
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey && (!options.limit || items.length < options.limit));

  return items;
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

  const projectionNames = applyProjection(params, options.projection, params.ExpressionAttributeNames);
  if (Object.keys(projectionNames).length > 0) {
    params.ExpressionAttributeNames = projectionNames;
  }

  const items = [];
  let lastEvaluatedKey;

  do {
    const pageParams = { ...params };
    if (lastEvaluatedKey) {
      pageParams.ExclusiveStartKey = lastEvaluatedKey;
    }
    if (options.limit) {
      const remaining = options.limit - items.length;
      if (remaining <= 0) break;
      pageParams.Limit = remaining;
    }

    const command = new ScanCommand(pageParams);
    const response = await withRetry(() => docClient.send(command));
    items.push(...(response.Items || []));
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey && (!options.limit || items.length < options.limit));

  return items;
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

    await withRetry(() => docClient.send(command));
  }

  return items.length;
}

/**
 * 批量刪除項目
 */
async function batchDelete(keys) {
  const batches = [];

  for (let i = 0; i < keys.length; i += 25) {
    batches.push(keys.slice(i, i + 25));
  }

  for (const batch of batches) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map(key => ({
          DeleteRequest: {
            Key: {
              PK: key.PK,
              SK: key.SK
            }
          }
        }))
      }
    });

    await withRetry(() => docClient.send(command));
  }

  return keys.length;
}

/**
 * 批量取得項目
 */
async function batchGetItems(keys = [], options = {}) {
  const batches = [];
  const results = [];

  for (let i = 0; i < keys.length; i += 100) {
    batches.push(keys.slice(i, i + 100));
  }

  for (const batch of batches) {
    let requestKeys = batch.map(key => ({ PK: key.PK, SK: key.SK }));
    const baseRequest = {
      Keys: requestKeys
    };

    const projectionNames = applyProjection(baseRequest, options.projection);
    if (Object.keys(projectionNames).length > 0) {
      baseRequest.ExpressionAttributeNames = projectionNames;
    }

    while (requestKeys.length > 0) {
      const command = new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: {
            ...baseRequest,
            Keys: requestKeys
          }
        }
      });

      const response = await withRetry(() => docClient.send(command));
      results.push(...(response.Responses?.[TABLE_NAME] || []));
      requestKeys = response.UnprocessedKeys?.[TABLE_NAME]?.Keys || [];
    }
  }

  return results;
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

async function getUsersByIds(userIds = []) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return [];
  return batchGetItems(ids.map(userId => ({
    PK: `USER#${userId}`,
    SK: 'PROFILE'
  })));
}

async function getCoursesByIds(courseIds = [], options = {}) {
  const ids = [...new Set(courseIds.filter(Boolean))];
  if (ids.length === 0) return [];
  return batchGetItems(ids.map(courseId => ({
    PK: `COURSE#${courseId}`,
    SK: 'META'
  })), options);
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

async function getItemsByEntityType(entityType, options = {}) {
  if (!entityType) return [];
  return queryByIndex('GSI3', entityType, 'entityType', {
    ...options
  });
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
 * 記錄用戶活動日誌
 * @param {string} userId - 用戶 ID
 * @param {string} action - 動作類型 (login, course_progress, resource_view, etc.)
 * @param {string} targetType - 目標類型 (course, resource, discussion, etc.)
 * @param {string} targetId - 目標 ID
 * @param {object} details - 額外詳情
 */
async function logActivity(userId, action, targetType, targetId, details = {}) {
  const now = new Date().toISOString();
  const activityId = generateId('act');

  const activity = {
    PK: `USER#${userId}`,
    SK: `ACT#${now}#${activityId}`,
    GSI1PK: `ACTION#${action}`,
    GSI1SK: now,
    entityType: 'ACTIVITY',
    activityId,
    userId,
    action,
    targetType,
    targetId,
    details,
    createdAt: now
  };

  await putItem(activity);
  return activity;
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
  batchDelete,
  batchGetItems,
  getItemsByEntityType,
  getUserByEmail,
  getUser,
  getUsersByIds,
  getCoursesByIds,
  getAdmin,
  getAdminByEmail,
  getAllUsers,
  getAllResources,
  getResourcesByCategory,
  getResourcesByStatus,
  getUserCourseProgress,
  getUserLicenses,
  getUserActivities,
  logActivity,
  getActiveAnnouncements,
  getCourseUnits,
  generateId
};
