/**
 * S3 檔案操作工具模組
 * BeyondBridge Education Platform
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const crypto = require('crypto');

// 初始化 S3 客戶端
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET_NAME = process.env.S3_BUCKET || 'beyondbridge-content';

// 允許的檔案類型
const ALLOWED_MIME_TYPES = {
  // 圖片
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  // 文件
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  // 影片
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  // 音訊
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  // 壓縮檔
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  // 其他
  'text/plain': '.txt',
  'text/html': '.html',
  'application/json': '.json'
};

// 檔案大小限制（位元組）
const MAX_FILE_SIZE = {
  image: 10 * 1024 * 1024,      // 10MB
  video: 500 * 1024 * 1024,     // 500MB
  document: 50 * 1024 * 1024,   // 50MB
  default: 100 * 1024 * 1024    // 100MB
};

/**
 * 產生唯一檔案名稱
 */
function generateFileName(originalName, folder = '') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 50);

  const fileName = `${baseName}_${timestamp}_${random}${ext}`;
  return folder ? `${folder}/${fileName}` : fileName;
}

/**
 * 驗證檔案類型
 */
function validateMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.hasOwnProperty(mimeType);
}

/**
 * 取得檔案類型分類
 */
function getFileCategory(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * 驗證檔案大小
 */
function validateFileSize(size, mimeType) {
  const category = getFileCategory(mimeType);
  const maxSize = MAX_FILE_SIZE[category] || MAX_FILE_SIZE.default;
  return size <= maxSize;
}

/**
 * 上傳檔案到 S3
 * @param {Buffer} fileBuffer - 檔案內容
 * @param {string} originalName - 原始檔案名稱
 * @param {string} mimeType - MIME 類型
 * @param {string} folder - 目標資料夾 (e.g., 'resources', 'avatars', 'attachments')
 * @returns {Object} - { key, url, size }
 */
async function uploadFile(fileBuffer, originalName, mimeType, folder = 'uploads') {
  // 驗證檔案類型
  if (!validateMimeType(mimeType)) {
    throw new Error(`不支援的檔案類型: ${mimeType}`);
  }

  // 驗證檔案大小
  if (!validateFileSize(fileBuffer.length, mimeType)) {
    const category = getFileCategory(mimeType);
    const maxSize = MAX_FILE_SIZE[category] || MAX_FILE_SIZE.default;
    throw new Error(`檔案大小超過限制 (最大 ${Math.round(maxSize / 1024 / 1024)}MB)`);
  }

  const key = generateFileName(originalName, folder);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    // 設定公開讀取（若需要私有，可移除此設定並使用 presigned URL）
    // ACL: 'public-read'
  });

  await s3Client.send(command);

  return {
    key,
    url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${key}`,
    size: fileBuffer.length,
    mimeType,
    originalName
  };
}

/**
 * 從 Base64 上傳檔案
 * @param {string} base64Data - Base64 編碼的檔案內容（可包含 data URI 前綴）
 * @param {string} originalName - 原始檔案名稱
 * @param {string} folder - 目標資料夾
 * @returns {Object} - { key, url, size }
 */
async function uploadFromBase64(base64Data, originalName, folder = 'uploads') {
  // 解析 data URI
  let mimeType = 'application/octet-stream';
  let base64Content = base64Data;

  if (base64Data.includes(',')) {
    const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      base64Content = matches[2];
    }
  }

  const fileBuffer = Buffer.from(base64Content, 'base64');
  return uploadFile(fileBuffer, originalName, mimeType, folder);
}

/**
 * 刪除 S3 檔案
 * @param {string} key - S3 物件的 key
 */
async function deleteFile(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });

  await s3Client.send(command);
  return true;
}

/**
 * 取得檔案下載用的預簽名 URL
 * @param {string} key - S3 物件的 key
 * @param {number} expiresIn - URL 有效時間（秒），預設 1 小時
 * @returns {string} - 預簽名 URL
 */
async function getDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * 取得檔案上傳用的預簽名 URL（用於前端直接上傳）
 * @param {string} key - S3 物件的 key
 * @param {string} contentType - MIME 類型
 * @param {number} expiresIn - URL 有效時間（秒），預設 10 分鐘
 * @returns {Object} - { uploadUrl, key }
 */
async function getUploadPresignedUrl(key, contentType, expiresIn = 600) {
  if (!validateMimeType(contentType)) {
    throw new Error(`不支援的檔案類型: ${contentType}`);
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  return {
    uploadUrl,
    key,
    contentType,
    expiresIn,
    fileUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${key}`
  };
}

/**
 * 為前端直接上傳準備預簽名 URL
 * @param {string} originalName - 原始檔案名稱
 * @param {string} contentType - MIME 類型
 * @param {string} folder - 目標資料夾
 * @returns {Object} - { uploadUrl, key, fileUrl }
 */
async function prepareUpload(originalName, contentType, folder = 'uploads') {
  const key = generateFileName(originalName, folder);
  return getUploadPresignedUrl(key, contentType);
}

/**
 * 複製 S3 物件
 * @param {string} sourceKey - 來源 key
 * @param {string} destinationKey - 目標 key
 */
async function copyFile(sourceKey, destinationKey) {
  const { CopyObjectCommand } = require('@aws-sdk/client-s3');

  const command = new CopyObjectCommand({
    Bucket: BUCKET_NAME,
    CopySource: `${BUCKET_NAME}/${sourceKey}`,
    Key: destinationKey
  });

  await s3Client.send(command);

  return {
    key: destinationKey,
    url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${destinationKey}`
  };
}

/**
 * 列出資料夾中的檔案
 * @param {string} prefix - 資料夾前綴
 * @param {number} maxKeys - 最大數量
 */
async function listFiles(prefix, maxKeys = 100) {
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: maxKeys
  });

  const response = await s3Client.send(command);

  return (response.Contents || []).map(item => ({
    key: item.Key,
    size: item.Size,
    lastModified: item.LastModified,
    url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${item.Key}`
  }));
}

module.exports = {
  s3Client,
  BUCKET_NAME,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  generateFileName,
  validateMimeType,
  validateFileSize,
  getFileCategory,
  uploadFile,
  uploadFromBase64,
  deleteFile,
  getDownloadUrl,
  getUploadPresignedUrl,
  prepareUpload,
  copyFile,
  listFiles
};
