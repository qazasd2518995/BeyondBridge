/**
 * LTI 1.3 金鑰管理模組
 * BeyondBridge Education Platform
 *
 * 處理 RSA 金鑰對的生成、儲存、輪替和 JWKS 格式轉換
 */

const crypto = require('crypto');
const { exportJWK, importSPKI, importPKCS8 } = require('jose');
const { putItem, query, getItem, updateItem } = require('../db');

// 金鑰配置
const KEY_CONFIG = {
  algorithm: 'RS256',
  modulusLength: 2048,
  rotationDays: 90,
  overlapDays: 7
};

// 開發模式：記憶體內金鑰快取（避免每次都需要資料庫）
let inMemoryKeyCache = null;

// 平台識別
const PLATFORM_ISSUER = process.env.LTI_PLATFORM_ISSUER || 'https://beyondbridge.edu';

/**
 * 生成新的 RSA 金鑰對
 * @returns {Promise<{keyId: string, publicKey: string, privateKey: string}>}
 */
async function generateKeyPair() {
  const keyId = `key_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: KEY_CONFIG.modulusLength,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return { keyId, publicKey, privateKey };
}

/**
 * 儲存金鑰到 DynamoDB
 * @param {object} keyData - 金鑰資料
 */
async function saveKey(keyData) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + KEY_CONFIG.rotationDays * 24 * 60 * 60 * 1000);

  const item = {
    PK: 'LTI_KEYS',
    SK: `KEY#${keyData.keyId}`,
    entityType: 'LTI_PLATFORM_KEY',
    keyId: keyData.keyId,
    publicKey: keyData.publicKey,
    privateKey: keyData.privateKey, // 注意：生產環境應加密
    algorithm: KEY_CONFIG.algorithm,
    status: 'active',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    // DynamoDB TTL (保留額外 30 天後自動刪除)
    ttl: Math.floor(expiresAt.getTime() / 1000) + (30 * 24 * 60 * 60)
  };

  await putItem(item);
  return item;
}

/**
 * 取得所有有效的金鑰
 * @returns {Promise<Array>}
 */
async function getActiveKeys() {
  try {
    const keys = await query('LTI_KEYS', { skPrefix: 'KEY#' });
    const now = new Date().toISOString();

    return keys.filter(key =>
      key.status === 'active' &&
      key.expiresAt > now
    );
  } catch (error) {
    // 開發模式：如果資料庫不可用，使用記憶體快取
    console.warn('[LTI Keys] Database unavailable, using in-memory cache');
    if (inMemoryKeyCache) {
      return [inMemoryKeyCache];
    }
    return [];
  }
}

/**
 * 取得當前用於簽名的金鑰（最新的有效金鑰）
 * @returns {Promise<object|null>}
 */
async function getCurrentSigningKey() {
  const activeKeys = await getActiveKeys();

  if (activeKeys.length === 0) {
    // 如果沒有有效金鑰，自動生成一組
    const newKey = await generateKeyPair();

    try {
      return await saveKey(newKey);
    } catch (error) {
      // 開發模式：資料庫不可用時，使用記憶體快取
      console.warn('[LTI Keys] Cannot save to database, using in-memory key');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + KEY_CONFIG.rotationDays * 24 * 60 * 60 * 1000);

      inMemoryKeyCache = {
        keyId: newKey.keyId,
        publicKey: newKey.publicKey,
        privateKey: newKey.privateKey,
        algorithm: KEY_CONFIG.algorithm,
        status: 'active',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      };
      return inMemoryKeyCache;
    }
  }

  // 回傳最新建立的金鑰
  return activeKeys.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  )[0];
}

/**
 * 取得特定金鑰
 * @param {string} keyId - 金鑰 ID
 */
async function getKeyById(keyId) {
  return getItem('LTI_KEYS', `KEY#${keyId}`);
}

/**
 * 將 PEM 格式的公鑰轉換為 JWK 格式
 * @param {string} pemPublicKey - PEM 格式公鑰
 * @param {string} keyId - 金鑰 ID
 * @returns {Promise<object>}
 */
async function pemToJwk(pemPublicKey, keyId) {
  const publicKey = await importSPKI(pemPublicKey, KEY_CONFIG.algorithm);
  const jwk = await exportJWK(publicKey);

  return {
    ...jwk,
    kid: keyId,
    alg: KEY_CONFIG.algorithm,
    use: 'sig'
  };
}

/**
 * 生成 JWKS (JSON Web Key Set)
 * @returns {Promise<{keys: Array}>}
 */
async function generateJWKS() {
  const activeKeys = await getActiveKeys();

  if (activeKeys.length === 0) {
    // 確保至少有一組金鑰
    const newKey = await generateKeyPair();
    await saveKey(newKey);
    const jwk = await pemToJwk(newKey.publicKey, newKey.keyId);
    return { keys: [jwk] };
  }

  const jwks = await Promise.all(
    activeKeys.map(key => pemToJwk(key.publicKey, key.keyId))
  );

  return { keys: jwks };
}

/**
 * 檢查並執行金鑰輪替
 * 如果最新金鑰即將過期，生成新金鑰
 */
async function rotateKeysIfNeeded() {
  const currentKey = await getCurrentSigningKey();

  if (!currentKey) {
    // 生成第一組金鑰
    const newKey = await generateKeyPair();
    return await saveKey(newKey);
  }

  const expiresAt = new Date(currentKey.expiresAt);
  const now = new Date();
  const daysUntilExpiry = (expiresAt - now) / (24 * 60 * 60 * 1000);

  if (daysUntilExpiry <= KEY_CONFIG.overlapDays) {
    console.log(`[LTI Keys] Rotating keys - current key expires in ${daysUntilExpiry.toFixed(1)} days`);
    const newKey = await generateKeyPair();
    return await saveKey(newKey);
  }

  return currentKey;
}

/**
 * 停用金鑰
 * @param {string} keyId - 金鑰 ID
 */
async function deactivateKey(keyId) {
  return updateItem('LTI_KEYS', `KEY#${keyId}`, {
    status: 'deactivated',
    deactivatedAt: new Date().toISOString()
  });
}

/**
 * 取得平台配置（供 Tool 註冊使用）
 */
function getPlatformConfig() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  return {
    issuer: PLATFORM_ISSUER,
    authorization_endpoint: `${baseUrl}/api/lti/13/authorize`,
    token_endpoint: `${baseUrl}/api/lti/13/token`,
    jwks_uri: `${baseUrl}/api/lti/13/jwks`,
    registration_endpoint: `${baseUrl}/api/lti/13/register`,
    scopes_supported: [
      'openid',
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
      'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'
    ],
    response_types_supported: ['id_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    claims_supported: [
      'iss', 'sub', 'aud', 'exp', 'iat', 'nonce',
      'name', 'given_name', 'family_name', 'email'
    ]
  };
}

module.exports = {
  generateKeyPair,
  saveKey,
  getActiveKeys,
  getCurrentSigningKey,
  getKeyById,
  pemToJwk,
  generateJWKS,
  rotateKeysIfNeeded,
  deactivateKey,
  getPlatformConfig,
  KEY_CONFIG,
  PLATFORM_ISSUER
};
