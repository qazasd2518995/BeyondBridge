/**
 * 自動移除 DynamoDB 內部欄位的中間件
 * 攔截 res.json() 呼叫，遞迴清理 PK/SK/GSI 欄位
 */

const DB_KEYS = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK', 'GSI3PK', 'GSI3SK', 'GSI4PK', 'GSI4SK'];

function stripDbKeys(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(item => stripDbKeys(item));
  } else if (obj && typeof obj === 'object') {
    DB_KEYS.forEach(key => delete obj[key]);
    // Recurse into 'data' property if present
    if (obj.data) stripDbKeys(obj.data);
  }
  return obj;
}

function stripDbKeysMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (body && typeof body === 'object') {
      stripDbKeys(body);
    }
    return originalJson(body);
  };
  next();
}

module.exports = stripDbKeysMiddleware;
