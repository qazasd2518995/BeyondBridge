/**
 * 檔案管理系統 API 處理器
 * BeyondBridge Education Platform - File Management System
 *
 * 注意：此實作使用本地存儲作為範例
 * 生產環境建議使用 AWS S3 或其他雲端存儲服務
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// 檔案存儲目錄
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

// 確保上傳目錄存在
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating upload directory:', err);
  }
}
ensureUploadDir();

// ==================== 檔案上傳 ====================

/**
 * POST /api/files/upload
 * 上傳檔案
 * 注意：實際實作需要使用 multer 或類似的中間件處理 multipart 上傳
 */
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      filename,
      contentType,
      size,
      content, // Base64 編碼的檔案內容
      folder,   // 可選的資料夾路徑
      courseId, // 如果是課程檔案
      visibility = 'private' // private, course, public
    } = req.body;

    if (!filename || !content) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供檔案名稱和內容'
      });
    }

    // 檢查檔案大小（限制 50MB）
    const maxSize = 50 * 1024 * 1024;
    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: '檔案大小不能超過 50MB'
      });
    }

    // 生成唯一檔案 ID 和存儲路徑
    const fileId = db.generateId('file');
    const ext = path.extname(filename);
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    const storageName = `${fileId}${ext}`;
    const storagePath = path.join(UPLOAD_DIR, storageName);

    // 儲存檔案
    await fs.writeFile(storagePath, buffer);

    const now = new Date().toISOString();

    // 建立檔案記錄
    const fileItem = {
      PK: `FILE#${fileId}`,
      SK: 'META',
      entityType: 'FILE',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `FILE#${now}`,

      fileId,
      filename,
      storageName,
      storagePath,
      contentType: contentType || 'application/octet-stream',
      size: buffer.length,
      hash,

      folder: folder || '/',
      courseId: courseId || null,
      visibility,

      uploadedBy: userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(fileItem);

    delete fileItem.PK;
    delete fileItem.SK;
    delete fileItem.storagePath; // 不暴露存儲路徑

    res.status(201).json({
      success: true,
      message: '檔案上傳成功',
      data: fileItem
    });

  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      error: 'UPLOAD_FAILED',
      message: '上傳檔案失敗'
    });
  }
});

/**
 * POST /api/files/request-upload-url
 * 請求預簽名上傳 URL（用於大檔案直接上傳到 S3）
 * 注意：這是用於 S3 整合的範例，目前返回模擬資料
 */
router.post('/request-upload-url', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { filename, contentType, size } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供檔案名稱和類型'
      });
    }

    // 檢查檔案大小（限制 100MB）
    const maxSize = 100 * 1024 * 1024;
    if (size > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: '檔案大小不能超過 100MB'
      });
    }

    const fileId = db.generateId('file');
    const ext = path.extname(filename);

    // 在實際實作中，這裡會生成 S3 預簽名 URL
    // 目前返回模擬資料
    res.json({
      success: true,
      data: {
        fileId,
        uploadUrl: `/api/files/upload/${fileId}`,
        method: 'PUT',
        headers: {
          'Content-Type': contentType
        },
        expiresIn: 3600 // 1 小時
      }
    });

  } catch (error) {
    console.error('Request upload URL error:', error);
    res.status(500).json({
      success: false,
      error: 'REQUEST_FAILED',
      message: '請求上傳 URL 失敗'
    });
  }
});

// ==================== 檔案列表 ====================

/**
 * GET /api/files
 * 取得我的檔案列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { folder = '/', courseId, type, limit = 50, offset = 0 } = req.query;

    let files = await db.queryByIndex('GSI1', `USER#${userId}`, 'GSI1PK', {
      skPrefix: 'FILE#',
      skName: 'GSI1SK'
    });

    // 資料夾篩選
    if (folder !== '/') {
      files = files.filter(f => f.folder === folder || f.folder.startsWith(folder + '/'));
    }

    // 課程篩選
    if (courseId) {
      files = files.filter(f => f.courseId === courseId);
    }

    // 類型篩選
    if (type) {
      const typeMap = {
        'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        'spreadsheet': ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        'video': ['video/mp4', 'video/webm', 'video/ogg'],
        'audio': ['audio/mpeg', 'audio/wav', 'audio/ogg']
      };

      const allowedTypes = typeMap[type] || [];
      if (allowedTypes.length > 0) {
        files = files.filter(f => allowedTypes.includes(f.contentType));
      }
    }

    // 排序（最新的在前）
    files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 分頁
    const total = files.length;
    files = files.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // 清理資料
    files = files.map(f => {
      delete f.PK;
      delete f.SK;
      delete f.storagePath;
      return f;
    });

    // 計算資料夾結構
    const folders = [...new Set(files.map(f => f.folder))].filter(f => f !== '/');

    res.json({
      success: true,
      data: files,
      folders,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得檔案列表失敗'
    });
  }
});

/**
 * GET /api/files/courses/:courseId
 * 取得課程檔案列表
 */
router.get('/courses/:courseId', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    // 檢查課程存取權限
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    const isInstructor = course.instructorId === userId;
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`);

    if (!isInstructor && !progress && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此課程檔案'
      });
    }

    // 取得課程檔案
    let files = await db.scan({
      filter: {
        expression: 'entityType = :type AND courseId = :courseId',
        values: { ':type': 'FILE', ':courseId': courseId }
      }
    });

    files = files.map(f => {
      delete f.PK;
      delete f.SK;
      delete f.storagePath;
      return f;
    });

    files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: files,
      count: files.length
    });

  } catch (error) {
    console.error('Get course files error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程檔案失敗'
    });
  }
});

// ==================== 檔案操作 ====================

/**
 * GET /api/files/:id
 * 取得檔案資訊
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const file = await db.getItem(`FILE#${id}`, 'META');
    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: '找不到此檔案'
      });
    }

    // 權限檢查
    const canAccess = await checkFileAccess(file, userId, req.user.isAdmin);
    if (!canAccess) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限存取此檔案'
      });
    }

    delete file.PK;
    delete file.SK;
    delete file.storagePath;

    res.json({
      success: true,
      data: file
    });

  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得檔案失敗'
    });
  }
});

/**
 * GET /api/files/:id/download
 * 下載檔案
 */
router.get('/:id/download', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const file = await db.getItem(`FILE#${id}`, 'META');
    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: '找不到此檔案'
      });
    }

    // 權限檢查
    const canAccess = await checkFileAccess(file, userId, req.user.isAdmin);
    if (!canAccess) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限下載此檔案'
      });
    }

    // 檢查檔案是否存在
    try {
      await fs.access(file.storagePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: '檔案不存在'
      });
    }

    // 發送檔案
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader('Content-Length', file.size);

    const fileContent = await fs.readFile(file.storagePath);
    res.send(fileContent);

  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({
      success: false,
      error: 'DOWNLOAD_FAILED',
      message: '下載檔案失敗'
    });
  }
});

/**
 * PUT /api/files/:id
 * 更新檔案資訊（重命名、移動資料夾等）
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { filename, folder, visibility } = req.body;

    const file = await db.getItem(`FILE#${id}`, 'META');
    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: '找不到此檔案'
      });
    }

    // 只有上傳者可以修改
    if (file.uploadedBy !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此檔案'
      });
    }

    const updates = {
      updatedAt: new Date().toISOString()
    };

    if (filename) updates.filename = filename;
    if (folder) updates.folder = folder;
    if (visibility) updates.visibility = visibility;

    const updatedFile = await db.updateItem(`FILE#${id}`, 'META', updates);

    delete updatedFile.PK;
    delete updatedFile.SK;
    delete updatedFile.storagePath;

    res.json({
      success: true,
      message: '檔案已更新',
      data: updatedFile
    });

  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新檔案失敗'
    });
  }
});

/**
 * DELETE /api/files/:id
 * 刪除檔案
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const file = await db.getItem(`FILE#${id}`, 'META');
    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: '找不到此檔案'
      });
    }

    // 只有上傳者可以刪除
    if (file.uploadedBy !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此檔案'
      });
    }

    // 刪除實體檔案
    try {
      await fs.unlink(file.storagePath);
    } catch (err) {
      console.error('Error deleting physical file:', err);
    }

    // 刪除資料庫記錄
    await db.deleteItem(`FILE#${id}`, 'META');

    res.json({
      success: true,
      message: '檔案已刪除'
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除檔案失敗'
    });
  }
});

// ==================== 資料夾操作 ====================

/**
 * POST /api/files/folders
 * 建立資料夾
 */
router.post('/folders', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, parentFolder = '/' } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供資料夾名稱'
      });
    }

    const folderPath = parentFolder === '/' ?
      `/${name}` : `${parentFolder}/${name}`;

    const folderId = db.generateId('folder');
    const now = new Date().toISOString();

    const folderItem = {
      PK: `USER#${userId}`,
      SK: `FOLDER#${folderId}`,
      entityType: 'FOLDER',

      folderId,
      name,
      path: folderPath,
      parentFolder,

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(folderItem);

    delete folderItem.PK;
    delete folderItem.SK;

    res.status(201).json({
      success: true,
      message: '資料夾建立成功',
      data: folderItem
    });

  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立資料夾失敗'
    });
  }
});

/**
 * DELETE /api/files/folders/:id
 * 刪除資料夾
 */
router.delete('/folders/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const folders = await db.query(`USER#${userId}`, { skPrefix: 'FOLDER#' });
    const folder = folders.find(f => f.folderId === id);

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: 'FOLDER_NOT_FOUND',
        message: '找不到此資料夾'
      });
    }

    // 檢查資料夾是否為空
    const files = await db.queryByIndex('GSI1', `USER#${userId}`, 'GSI1PK', {
      skPrefix: 'FILE#',
      skName: 'GSI1SK'
    });

    const filesInFolder = files.filter(f =>
      f.folder === folder.path || f.folder.startsWith(folder.path + '/')
    );

    if (filesInFolder.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'FOLDER_NOT_EMPTY',
        message: '資料夾不為空，請先刪除其中的檔案'
      });
    }

    await db.deleteItem(`USER#${userId}`, folder.SK);

    res.json({
      success: true,
      message: '資料夾已刪除'
    });

  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除資料夾失敗'
    });
  }
});

// ==================== 輔助函數 ====================

/**
 * 檢查檔案存取權限
 */
async function checkFileAccess(file, userId, isAdmin) {
  // 管理員可以存取所有檔案
  if (isAdmin) return true;

  // 上傳者可以存取
  if (file.uploadedBy === userId) return true;

  // 公開檔案
  if (file.visibility === 'public') return true;

  // 課程檔案：檢查是否已報名
  if (file.visibility === 'course' && file.courseId) {
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${file.courseId}`);
    if (progress) return true;

    const course = await db.getItem(`COURSE#${file.courseId}`, 'META');
    if (course && course.instructorId === userId) return true;
  }

  return false;
}

module.exports = router;
