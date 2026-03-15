/**
 * 管理員 API 處理器
 * 後台管理功能
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs/promises');
const db = require('../utils/db');
const auth = require('../utils/auth');
const cache = require('../utils/cache');
const {
  ADMIN_METRICS_SNAPSHOT_KEYS,
  scanUsersForAnalytics,
  buildAdminDashboardSnapshot,
  buildAdminAnalyticsOverviewSnapshot,
  getAdminMetricsSnapshot,
  putAdminMetricsSnapshot
} = require('../utils/admin-metrics');
const ADMIN_ANALYTICS_CACHE_TTL_MS = 2 * 60 * 1000;
const ADMIN_ANALYTICS_ENTITY_CACHE_TTL_MS = 60 * 1000;
const analyticsInflight = new Map();
const ADMIN_ACTIVITY_ACTIONS = [
  'login',
  'resource_viewed',
  'consultation_created',
  'discussion_created',
  'discussion_replied',
  'course_enrolled',
  'course_progress'
];

async function withAnalyticsCache(cacheKey, computeFn, ttlMs = ADMIN_ANALYTICS_CACHE_TTL_MS) {
  const cached = cache.get(cacheKey);
  if (cached) {
    return { data: cached, fromCache: true };
  }

  if (analyticsInflight.has(cacheKey)) {
    return {
      data: await analyticsInflight.get(cacheKey),
      fromCache: true
    };
  }

  const pending = (async () => {
    const data = await computeFn();
    cache.set(cacheKey, data, ttlMs);
    return data;
  })();

  analyticsInflight.set(cacheKey, pending);

  try {
    return { data: await pending, fromCache: false };
  } finally {
    analyticsInflight.delete(cacheKey);
  }
}

async function getProjectedUsersForAnalytics() {
  const { data } = await withAnalyticsCache('admin:analytics:users', () => (
    scanUsersForAnalytics()
  ), ADMIN_ANALYTICS_ENTITY_CACHE_TTL_MS);
  return data;
}

function shouldForceLiveAnalytics(req) {
  const raw = String(req.query.fresh ?? req.query.forceLive ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'live'].includes(raw);
}

async function getAdminSnapshotOrLive({ req, snapshotKey, cacheKey, buildSnapshot, cacheTtlMs = 60000 }) {
  const forceLive = shouldForceLiveAnalytics(req);

  if (!forceLive) {
    const snapshot = await getAdminMetricsSnapshot(snapshotKey);
    if (snapshot?.data) {
      return {
        data: snapshot.data,
        fromCache: false,
        fromSnapshot: true,
        snapshotTimestamp: snapshot.rebuiltAt || snapshot.updatedAt || null
      };
    }
  }

  const { data, fromCache } = await withAnalyticsCache(cacheKey, buildSnapshot, cacheTtlMs);

  try {
    await putAdminMetricsSnapshot(snapshotKey, data, {
      source: forceLive ? 'live-refresh' : 'live-fallback'
    });
  } catch (error) {
    console.error(`Persist admin metrics snapshot failed (${snapshotKey}):`, error);
  }

  return {
    data,
    fromCache,
    fromSnapshot: false,
    snapshotTimestamp: null
  };
}

async function getActivityRowsForRange(startIso, endIso) {
  const actionRows = await Promise.all(
    ADMIN_ACTIVITY_ACTIONS.map(action => (
      db.queryByIndex('GSI1', `ACTION#${action}`, 'GSI1PK', {
        skName: 'GSI1SK',
        skBetween: [startIso, endIso],
        projection: ['activityId', 'userId', 'action', 'createdAt']
      })
    ))
  );

  const deduped = new Map();
  actionRows.flat().forEach(item => {
    if (!item?.userId) return;
    const key = item.activityId || `${item.userId}:${item.action || 'activity'}:${item.createdAt || ''}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  });
  return Array.from(deduped.values());
}

// 所有管理員路由都需要管理員權限
router.use(auth.adminMiddleware);

/**
 * GET /api/admin/dashboard
 * 管理員儀表板數據
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { data: dashboardData, fromCache, fromSnapshot, snapshotTimestamp } = await getAdminSnapshotOrLive({
      req,
      snapshotKey: ADMIN_METRICS_SNAPSHOT_KEYS.DASHBOARD,
      cacheKey: 'admin:dashboard',
      buildSnapshot: buildAdminDashboardSnapshot,
      cacheTtlMs: 60000
    });

    res.json({
      success: true,
      data: {
        ...dashboardData,
        fromCache,
        fromSnapshot,
        snapshotTimestamp
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得儀表板數據失敗'
    });
  }
});

/**
 * GET /api/admin/users
 * 取得所有用戶列表
 */
router.get('/users', async (req, res) => {
  try {
    const { status, role, limit = 100 } = req.query;

    let users = await db.getAllUsers({ limit: parseInt(limit) });

    // 篩選
    if (status) {
      users = users.filter(u => u.status === status);
    }
    if (role) {
      users = users.filter(u => u.role === role);
    }

    // 清理敏感資料
    users = users.map(u => {
      delete u.passwordHash;
      delete u.PK;
      delete u.SK;
      return u;
    });

    res.json({
      success: true,
      data: users,
      count: users.length
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得用戶列表失敗'
    });
  }
});

/**
 * GET /api/admin/users/:id
 * 取得用戶詳情
 */
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.getUser(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '找不到用戶'
      });
    }

    // 取得用戶的授權和進度
    const [licenses, progress] = await Promise.all([
      db.getUserLicenses(id),
      db.getUserCourseProgress(id)
    ]);

    delete user.passwordHash;
    delete user.PK;
    delete user.SK;

    res.json({
      success: true,
      data: {
        ...user,
        licenses: licenses.length,
        coursesEnrolled: progress.length
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得用戶資料失敗'
    });
  }
});

/**
 * POST /api/admin/users
 * 管理員新增用戶帳號
 */
router.post('/users', async (req, res) => {
  try {
    const {
      email, password, displayName, displayNameZh, role = 'educator',
      organization, organizationType, subscriptionTier = 'basic'
    } = req.body;

    // 驗證必填欄位
    if (!email || !password || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請填寫電子郵件、密碼和姓名'
      });
    }

    // 驗證 Email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: '請輸入有效的電子郵件格式'
      });
    }

    // 驗證密碼長度
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: '密碼至少需要 6 個字元'
      });
    }

    // 檢查 Email 是否已存在
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: '此電子郵件已被使用'
      });
    }

    const userId = db.generateId('usr');
    const now = new Date().toISOString();
    const passwordHash = await auth.hashPassword(password);

    const user = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      GSI1PK: `ROLE#${role}`,
      GSI1SK: `USER#${userId}`,
      email: email,
      entityType: 'USER',
      createdAt: now,

      userId,
      displayName,
      displayNameZh: displayNameZh || displayName,
      avatarUrl: null,
      passwordHash,
      role,
      organization: organization || null,
      organizationType: organizationType || null,

      subscriptionTier,
      subscriptionExpiry: null,
      licenseQuota: subscriptionTier === 'professional' ? 100 : (subscriptionTier === 'enterprise' ? 500 : 10),
      licenseUsed: 0,

      preferences: {
        language: 'zh-TW',
        darkMode: false,
        notifications: {
          newMaterial: true,
          progress: true,
          expiry: true,
          email: false
        }
      },

      stats: {
        totalHours: 0,
        coursesCompleted: 0,
        coursesInProgress: 0
      },

      status: 'active',
      createdBy: req.user.userId,
      lastLoginAt: null,
      updatedAt: now
    };

    await db.putItem(user);

    // 記錄活動日誌
    await db.putItem({
      PK: `USER#${userId}`,
      SK: `ACT#${now}#${db.generateId('act')}`,
      entityType: 'ACTIVITY',
      createdAt: now,
      action: 'account_created',
      details: {
        createdBy: req.user.userId,
        method: 'admin_create'
      }
    });

    res.status(201).json({
      success: true,
      message: '用戶帳號已建立',
      data: {
        userId,
        email,
        displayName,
        role,
        status: 'active'
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立用戶失敗'
    });
  }
});

/**
 * PUT /api/admin/users/:id
 * 管理員更新用戶資料
 */
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'displayName', 'displayNameZh', 'role', 'organization', 'organizationType',
      'subscriptionTier', 'subscriptionExpiry', 'licenseQuota'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_UPDATES',
        message: '沒有要更新的欄位'
      });
    }

    updates.updatedAt = new Date().toISOString();

    await db.updateItem(`USER#${id}`, 'PROFILE', updates);

    res.json({
      success: true,
      message: '用戶資料已更新'
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新用戶失敗'
    });
  }
});

/**
 * PUT /api/admin/users/:id/password
 * 管理員重設用戶密碼
 */
router.put('/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: '密碼至少需要 6 個字元'
      });
    }

    const passwordHash = await auth.hashPassword(newPassword);

    await db.updateItem(`USER#${id}`, 'PROFILE', {
      passwordHash,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '用戶密碼已重設'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'RESET_FAILED',
      message: '重設密碼失敗'
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * 刪除用戶帳號（軟刪除）
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.updateItem(`USER#${id}`, 'PROFILE', {
      status: 'deleted',
      deletedAt: new Date().toISOString(),
      deletedBy: req.user.userId,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '用戶帳號已刪除'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除用戶失敗'
    });
  }
});

/**
 * PUT /api/admin/users/:id/status
 * 變更用戶狀態
 */
router.put('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: '無效的狀態值'
      });
    }

    await db.updateItem(`USER#${id}`, 'PROFILE', {
      status,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '用戶狀態已更新'
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新狀態失敗'
    });
  }
});

/**
 * POST /api/admin/resources
 * 上架新教材
 */
router.post('/resources', async (req, res) => {
  try {
    const {
      title, titleEn, description, type, category, subcategory,
      gradeLevel, tags, duration, unitCount, price = 0,
      contentType, contentUrl, contentEmbed, contentFileName
    } = req.body;

    if (!title || !type || !category || !gradeLevel) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請填寫必要欄位'
      });
    }

    // 驗證內容類型
    const validContentTypes = ['video', 'file', 'webpage', 'embed', 'upload'];
    if (contentType && !validContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONTENT_TYPE',
        message: '無效的內容來源類型'
      });
    }

    // 驗證 URL 協議安全性
    if (contentUrl && !/^https?:\/\//.test(contentUrl) && !contentUrl.startsWith('/uploads/')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_URL',
        message: '內容 URL 必須以 http:// 或 https:// 開頭'
      });
    }

    const resourceId = db.generateId('res');
    const now = new Date().toISOString();

    const resource = {
      PK: `RES#${resourceId}`,
      SK: 'META',
      GSI1PK: `CAT#${category}`,
      GSI1SK: `RES#${resourceId}`,
      GSI2PK: 'STATUS#draft',
      GSI2SK: now,
      entityType: 'RESOURCE',
      createdAt: now,

      resourceId,
      title,
      titleEn: titleEn || title,
      description,
      type,
      category,
      subcategory,
      gradeLevel,
      tags: tags || [],
      targetAudience: ['educator'],

      creatorId: req.user.userId,
      creatorName: 'Admin',

      duration: duration || 0,
      unitCount: unitCount || 1,
      contentType: contentType || null,
      contentUrl: contentUrl || null,
      contentEmbed: contentEmbed || null,
      contentFileName: contentFileName || null,
      s3Location: null,
      thumbnailUrl: null,

      pricingModel: price > 0 ? 'license' : 'free',
      price,
      revenueShare: 0.7,

      viewCount: 0,
      downloadCount: 0,
      averageRating: 0,
      ratingCount: 0,
      licensedCount: 0,

      status: 'draft',
      version: '1.0.0',
      publishedAt: null,
      updatedAt: now
    };

    await db.putItem(resource);

    res.status(201).json({
      success: true,
      message: '教材已建立',
      data: {
        resourceId,
        title,
        status: 'draft'
      }
    });

  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立教材失敗'
    });
  }
});

/**
 * PUT /api/admin/resources/:id
 * 更新教材
 */
router.put('/resources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'title', 'titleEn', 'description', 'type', 'category', 'subcategory',
      'gradeLevel', 'tags', 'duration', 'unitCount', 'price', 'thumbnailUrl',
      'contentType', 'contentUrl', 'contentEmbed', 'contentFileName'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_UPDATES',
        message: '沒有要更新的欄位'
      });
    }

    // 驗證內容類型
    const validContentTypes = ['video', 'file', 'webpage', 'embed', 'upload'];
    if (updates.contentType && !validContentTypes.includes(updates.contentType)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONTENT_TYPE',
        message: '無效的內容來源類型'
      });
    }

    // 驗證 URL 協議安全性
    if (updates.contentUrl && !/^https?:\/\//.test(updates.contentUrl) && !updates.contentUrl.startsWith('/uploads/')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_URL',
        message: '內容 URL 必須以 http:// 或 https:// 開頭'
      });
    }

    updates.updatedAt = new Date().toISOString();

    await db.updateItem(`RES#${id}`, 'META', updates);

    res.json({
      success: true,
      message: '教材已更新'
    });

  } catch (error) {
    console.error('Update resource error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新教材失敗'
    });
  }
});

/**
 * PUT /api/admin/resources/:id/publish
 * 發布教材
 */
router.put('/resources/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date().toISOString();

    await db.updateItem(`RES#${id}`, 'META', {
      status: 'published',
      GSI2PK: 'STATUS#published',
      GSI2SK: now,
      publishedAt: now,
      updatedAt: now
    });

    res.json({
      success: true,
      message: '教材已發布'
    });

  } catch (error) {
    console.error('Publish resource error:', error);
    res.status(500).json({
      success: false,
      error: 'PUBLISH_FAILED',
      message: '發布失敗'
    });
  }
});

/**
 * DELETE /api/admin/resources/:id
 * 刪除教材（軟刪除）
 */
router.delete('/resources/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.updateItem(`RES#${id}`, 'META', {
      status: 'archived',
      GSI2PK: 'STATUS#archived',
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '教材已下架'
    });

  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '下架失敗'
    });
  }
});

/**
 * GET /api/admin/licenses
 * 取得所有授權
 */
router.get('/licenses', async (req, res) => {
  try {
    const { status } = req.query;

    let licenses = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'LICENSE' }
      }
    });

    if (status) {
      licenses = licenses.filter(l => l.status === status);
    }

    licenses = licenses.map(l => {
      delete l.PK;
      delete l.SK;
      return l;
    });

    res.json({
      success: true,
      data: licenses,
      count: licenses.length
    });

  } catch (error) {
    console.error('Get licenses error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得授權列表失敗'
    });
  }
});

/**
 * PUT /api/admin/licenses/:id/approve
 * 審核授權
 */
router.put('/licenses/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved = true } = req.body;

    const license = await db.getItem(`LIC#${id}`, 'META');
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'LICENSE_NOT_FOUND',
        message: '找不到此授權'
      });
    }

    const now = new Date().toISOString();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    if (approved) {
      // 核准授權
      await db.updateItem(`LIC#${id}`, 'META', {
        status: 'active',
        GSI2PK: 'STATUS#active',
        GSI2SK: expiryDate.toISOString(),
        startDate: now,
        expiryDate: expiryDate.toISOString(),
        approvedAt: now,
        approvedBy: req.user.userId,
        updatedAt: now
      });

      // 更新用戶-授權關聯
      await db.updateItem(`USER#${license.userId}`, `LIC#${id}`, {
        status: 'active',
        expiryDate: expiryDate.toISOString()
      });

      // 更新用戶配額
      const user = await db.getUser(license.userId);
      await db.updateItem(`USER#${license.userId}`, 'PROFILE', {
        licenseUsed: (user.licenseUsed || 0) + 1
      });

      res.json({
        success: true,
        message: '授權已核准'
      });
    } else {
      // 拒絕授權
      await db.updateItem(`LIC#${id}`, 'META', {
        status: 'rejected',
        GSI2PK: 'STATUS#rejected',
        rejectedAt: now,
        rejectedBy: req.user.userId,
        updatedAt: now
      });

      await db.updateItem(`USER#${license.userId}`, `LIC#${id}`, {
        status: 'rejected'
      });

      res.json({
        success: true,
        message: '授權已拒絕'
      });
    }

  } catch (error) {
    console.error('Approve license error:', error);
    res.status(500).json({
      success: false,
      error: 'APPROVE_FAILED',
      message: '審核失敗'
    });
  }
});

/**
 * POST /api/admin/licenses/grant
 * 管理員主動授權教材給老師
 */
router.post('/licenses/grant', async (req, res) => {
  try {
    const { userId, resourceId, licenseType = 'personal', expiryMonths, notes } = req.body;

    if (!userId || !resourceId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請指定用戶和資源'
      });
    }

    // 驗證資源存在
    const resource = await db.getItem(`RES#${resourceId}`, 'META');
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'RESOURCE_NOT_FOUND',
        message: '找不到此資源'
      });
    }

    // 驗證用戶存在
    const user = await db.getUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '找不到此用戶'
      });
    }

    // 檢查是否已有此資源的 active 授權
    const existingLicenses = await db.getUserLicenses(userId);
    const hasActive = existingLicenses.some(
      lic => lic.resourceId === resourceId && lic.status === 'active'
    );
    if (hasActive) {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_LICENSED',
        message: '此用戶已擁有該資源的有效授權'
      });
    }

    // 建立授權
    const licenseId = db.generateId('lic');
    const now = new Date().toISOString();
    const expiryDate = new Date();
    if (expiryMonths && expiryMonths > 0) {
      expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);
    } else {
      // 永久：設定 100 年
      expiryDate.setFullYear(expiryDate.getFullYear() + 100);
    }

    const licenseItem = {
      PK: `LIC#${licenseId}`,
      SK: 'META',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `LIC#${licenseId}`,
      GSI2PK: 'STATUS#active',
      GSI2SK: expiryDate.toISOString(),
      entityType: 'LICENSE',
      createdAt: now,

      licenseId,
      resourceId,
      resourceTitle: resource.title,
      resourceType: resource.type,

      userId,
      licenseType,
      seatCount: licenseType === 'institutional' ? 50 : 1,

      startDate: now,
      expiryDate: expiryDate.toISOString(),
      status: 'active',

      notes: notes || '',
      accessCount: 0,
      lastAccessedAt: null,
      orderId: null,

      grantedBy: req.user.userId,
      grantedAt: now,
      approvedAt: now,
      approvedBy: req.user.userId,
      updatedAt: now
    };

    await db.putItem(licenseItem);

    // 建立用戶-授權關聯
    const userLicenseItem = {
      PK: `USER#${userId}`,
      SK: `LIC#${licenseId}`,
      GSI1PK: `RES#${resourceId}`,
      GSI1SK: `USER#${userId}`,
      entityType: 'USER_LICENSE',
      createdAt: now,

      licenseId,
      resourceId,
      resourceTitle: resource.title,
      expiryDate: expiryDate.toISOString(),
      status: 'active'
    };

    await db.putItem(userLicenseItem);

    // 更新用戶配額
    await db.updateItem(`USER#${userId}`, 'PROFILE', {
      licenseUsed: (user.licenseUsed || 0) + 1
    });

    res.status(201).json({
      success: true,
      message: '授權已成功建立',
      data: {
        licenseId,
        resourceId,
        resourceTitle: resource.title,
        userId,
        status: 'active',
        expiryDate: expiryDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Grant license error:', error);
    res.status(500).json({
      success: false,
      error: 'GRANT_FAILED',
      message: '授權建立失敗'
    });
  }
});

/**
 * GET /api/admin/analytics/overview
 * 平台分析概覽
 */
router.get('/analytics/overview', async (req, res) => {
  try {
    const { data: responseData, fromCache, fromSnapshot, snapshotTimestamp } = await getAdminSnapshotOrLive({
      req,
      snapshotKey: ADMIN_METRICS_SNAPSHOT_KEYS.ANALYTICS_OVERVIEW,
      cacheKey: 'admin:analytics:overview',
      buildSnapshot: buildAdminAnalyticsOverviewSnapshot
    });

    res.json({
      success: true,
      data: {
        ...responseData,
        fromCache,
        fromSnapshot,
        snapshotTimestamp
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得分析數據失敗'
    });
  }
});

/**
 * GET /api/admin/system/health
 * 系統健康狀態
 */
router.get('/system/health', async (req, res) => {
  try {
    const startTime = Date.now();

    // 檢查資料庫連線
    let dbStatus = 'healthy';
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'USER' } }, limit: 1 });
      dbLatency = Date.now() - dbStart;
      if (dbLatency > 1000) dbStatus = 'degraded';
    } catch (e) {
      dbStatus = 'unhealthy';
    }

    // 記憶體使用
    const memUsage = process.memoryUsage();
    const memoryUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memoryTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memoryPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    // 運行時間
    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);

    // API 狀態
    const apiLatency = Date.now() - startTime;
    const apiStatus = apiLatency < 500 ? 'healthy' : apiLatency < 2000 ? 'degraded' : 'unhealthy';

    // 儲存空間狀態（以 uploads 目錄所在檔案系統估算）
    let storageStatus = 'healthy';
    let storageUsage = null;
    try {
      const uploadsPath = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
      const stat = await fs.statfs(uploadsPath);
      const totalBytes = Number(stat.blocks) * Number(stat.bsize);
      const freeBytes = Number(stat.bavail) * Number(stat.bsize);
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

      if (usedPercent >= 95) {
        storageStatus = 'unhealthy';
      } else if (usedPercent >= 85) {
        storageStatus = 'degraded';
      }

      storageUsage = {
        usedBytes,
        freeBytes,
        totalBytes,
        percent: usedPercent,
        storagePath: uploadsPath
      };
    } catch (e) {
      storageStatus = 'degraded';
      storageUsage = {
        error: 'STORAGE_METRIC_UNAVAILABLE'
      };
    }

    // 總體健康狀態
    const overallStatus = dbStatus === 'unhealthy' || apiStatus === 'unhealthy' || storageStatus === 'unhealthy'
      ? 'unhealthy'
      : dbStatus === 'degraded' || apiStatus === 'degraded' || storageStatus === 'degraded'
        ? 'degraded'
        : 'healthy';

    res.json({
      success: true,
      data: {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services: {
          api: {
            status: apiStatus,
            latency: apiLatency
          },
          database: {
            status: dbStatus,
            latency: dbLatency
          },
          storage: {
            status: storageStatus,
            usage: storageUsage
          }
        },
        system: {
          memory: {
            used: memoryUsedMB,
            total: memoryTotalMB,
            percent: memoryPercent
          },
          uptime: {
            hours: uptimeHours,
            minutes: uptimeMinutes,
            seconds: Math.floor(uptimeSeconds)
          },
          nodeVersion: process.version,
          platform: process.platform
        }
      }
    });
  } catch (error) {
    console.error('System health check error:', error);
    res.status(500).json({
      success: false,
      error: 'HEALTH_CHECK_FAILED',
      message: '系統健康檢查失敗'
    });
  }
});

/**
 * GET /api/admin/system/errors
 * 取得最近錯誤日誌（簡化版）
 */
router.get('/system/errors', async (req, res) => {
  try {
    const { limit = 50, severity } = req.query;

    // 從審計日誌中取得錯誤記錄
    let errors = await db.scan({
      filter: {
        expression: 'entityType = :type AND begins_with(category, :category)',
        values: { ':type': 'AUDIT_LOG', ':category': 'ERROR' }
      }
    });

    // 按時間排序
    errors = errors
      .sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt))
      .slice(0, parseInt(limit))
      .map(e => ({
        id: e.logId || e.PK,
        timestamp: e.timestamp || e.createdAt,
        severity: e.severity || 'error',
        category: e.category || 'ERROR',
        message: e.message || e.details || '未知錯誤',
        source: e.source || 'system',
        userId: e.userId,
        metadata: e.metadata
      }));

    res.json({
      success: true,
      data: {
        errors,
        total: errors.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get errors error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得錯誤日誌失敗'
    });
  }
});

/**
 * POST /api/admin/export/users
 * 匯出用戶資料
 */
router.post('/export/users', async (req, res) => {
  try {
    const { format = 'json', fields, filters } = req.body;
    const defaultFields = ['userId', 'displayName', 'email', 'role', 'status', 'createdAt'];
    const selectedFields = fields || defaultFields;
    const projection = [
      ...new Set([
        ...selectedFields,
        'role',
        'status',
        'createdAt'
      ])
    ];

    let users = await db.getAllUsers({ projection });

    // 套用篩選
    if (filters) {
      if (filters.role) users = users.filter(u => u.role === filters.role);
      if (filters.status) users = users.filter(u => u.status === filters.status);
      if (filters.dateFrom) users = users.filter(u => new Date(u.createdAt) >= new Date(filters.dateFrom));
      if (filters.dateTo) users = users.filter(u => new Date(u.createdAt) <= new Date(filters.dateTo));
    }

    const exportData = users.map(u => {
      const row = {};
      selectedFields.forEach(f => {
        row[f] = u[f];
      });
      return row;
    });

    res.json({
      success: true,
      data: {
        format,
        fields: selectedFields,
        count: exportData.length,
        records: exportData,
        exportedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出用戶資料失敗'
    });
  }
});

/**
 * POST /api/admin/export/courses
 * 匯出課程資料
 */
router.post('/export/courses', async (req, res) => {
  try {
    const { format = 'csv', fields, filters } = req.body;

    // 取得課程資料（從 courses handler 或直接查詢）
    const courses = await db.scan({
      TableName: process.env.COURSES_TABLE || 'beyondbridge-courses'
    }).catch(() => []);

    // 格式化匯出資料
    const records = (courses || []).map(course => ({
      courseId: course.courseId || course.id,
      name: course.name || course.title,
      instructor: course.instructor || course.teacherName,
      status: course.status || 'active',
      studentCount: course.studentCount || 0,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt
    }));

    res.json({
      success: true,
      data: {
        records,
        total: records.length,
        format,
        exportedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Export courses error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出課程資料失敗'
    });
  }
});

/**
 * POST /api/admin/export/licenses
 * 匯出授權資料
 */
router.post('/export/licenses', async (req, res) => {
  try {
    const { format = 'csv', fields, filters } = req.body;

    // 取得授權資料
    const licenses = await db.scan({
      TableName: process.env.LICENSES_TABLE || 'beyondbridge-licenses'
    }).catch(() => []);

    // 格式化匯出資料
    const records = (licenses || []).map(license => ({
      licenseId: license.licenseId || license.id,
      userId: license.userId,
      userName: license.userName,
      resourceId: license.resourceId,
      resourceTitle: license.resourceTitle,
      status: license.status,
      requestedAt: license.requestedAt || license.createdAt,
      approvedAt: license.approvedAt,
      expiresAt: license.expiresAt
    }));

    res.json({
      success: true,
      data: {
        records,
        total: records.length,
        format,
        exportedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Export licenses error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出授權資料失敗'
    });
  }
});

/**
 * PUT /api/admin/users/batch/update
 * 批量更新用戶
 */
router.put('/users/batch/update', async (req, res) => {
  try {
    const { userIds, updates } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供要更新的用戶 ID 列表'
      });
    }

    const results = [];
    for (const userId of userIds) {
      try {
        await db.updateUser(userId, updates);
        results.push({ userId, success: true });
      } catch (err) {
        results.push({ userId, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      data: {
        total: userIds.length,
        success: successCount,
        failed: userIds.length - successCount,
        results
      }
    });
  } catch (error) {
    console.error('Batch update users error:', error);
    res.status(500).json({
      success: false,
      error: 'BATCH_UPDATE_FAILED',
      message: '批量更新用戶失敗'
    });
  }
});

/**
 * DELETE /api/admin/users/batch/delete
 * 批量刪除用戶
 */
router.delete('/users/batch/delete', async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供要刪除的用戶 ID 列表'
      });
    }

    const results = [];
    for (const userId of userIds) {
      try {
        await db.deleteUser(userId);
        results.push({ userId, success: true });
      } catch (err) {
        results.push({ userId, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      data: {
        total: userIds.length,
        success: successCount,
        failed: userIds.length - successCount,
        results
      }
    });
  } catch (error) {
    console.error('Batch delete users error:', error);
    res.status(500).json({
      success: false,
      error: 'BATCH_DELETE_FAILED',
      message: '批量刪除用戶失敗'
    });
  }
});

/**
 * GET /api/admin/analytics/user-activity
 * 用戶活動分析
 */
const USER_ACTIVITY_RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90
};

function startOfUtcDay(value) {
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfUtcDay(value) {
  const d = new Date(value);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function toDateKey(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function getWeekStartKey(dateKey) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return d.toISOString().slice(0, 10);
}

function calcPercentTrend(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

router.get('/analytics/user-activity', async (req, res) => {
  try {
    const { range = '30d', groupBy = 'day' } = req.query;
    const cacheKey = `admin:analytics:user-activity:${range}:${groupBy}`;
    const { data: responseData, fromCache } = await withAnalyticsCache(cacheKey, async () => {
      const days = USER_ACTIVITY_RANGE_DAYS[range] || 30;
      const now = new Date();
      const todayStart = startOfUtcDay(now);
      const periodStart = startOfUtcDay(now);
      periodStart.setUTCDate(periodStart.getUTCDate() - (days - 1));

      const lookbackDays = Math.max(days, 30) * 2;
      const lookbackStart = startOfUtcDay(now);
      lookbackStart.setUTCDate(lookbackStart.getUTCDate() - (lookbackDays - 1));
      const lookbackStartIso = lookbackStart.toISOString();
      const nowIso = now.toISOString();

      const [users, activities] = await Promise.all([
        getProjectedUsersForAnalytics(),
        getActivityRowsForRange(lookbackStartIso, nowIso)
      ]);

      const knownUserIds = new Set(
        users.map(u => u.userId).filter(Boolean)
      );
      const userMap = new Map(
        users
          .filter(user => user?.userId)
          .map(user => [user.userId, user])
      );

      const eventRows = [];
      const pushEvent = (userId, at, action = 'activity') => {
        if (!userId || !knownUserIds.has(userId) || !at) return;
        const timestamp = new Date(at).getTime();
        if (Number.isNaN(timestamp)) return;
        if (timestamp < lookbackStart.getTime() || timestamp > now.getTime()) return;
        eventRows.push({ userId, timestamp, action });
      };

      activities.forEach(a => {
        pushEvent(a.userId, a.createdAt, a.action || 'activity');
      });

      users.forEach(u => {
        pushEvent(u.userId, u.lastLoginAt, 'login');
      });

      eventRows.sort((a, b) => a.timestamp - b.timestamp);

      const getActiveUsersInWindow = (windowDays, offsetDays = 0) => {
        const windowEnd = endOfUtcDay(new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000));
        const windowStart = startOfUtcDay(windowEnd);
        windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1));
        const activeSet = new Set();
        for (const row of eventRows) {
          if (row.timestamp >= windowStart.getTime() && row.timestamp <= windowEnd.getTime()) {
            activeSet.add(row.userId);
          }
        }
        return activeSet;
      };

      const roleDistribution = {};
      users.forEach(u => {
        const role = u.role || 'unknown';
        roleDistribution[role] = (roleDistribution[role] || 0) + 1;
      });

      const registrationsByDate = new Map();
      users.forEach(u => {
        const key = toDateKey(u.createdAt);
        if (key) {
          registrationsByDate.set(key, (registrationsByDate.get(key) || 0) + 1);
        }
      });

      const periodEvents = eventRows.filter(
        e => e.timestamp >= periodStart.getTime() && e.timestamp <= now.getTime()
      );

      const dailyActiveSets = new Map();
      const actionDistribution = {};
      const userActivityCount = new Map();
      const lastActiveByUser = new Map();
      const activityHeatmap = Array.from({ length: 7 }, () => Array(24).fill(0));

      periodEvents.forEach(e => {
        const key = toDateKey(e.timestamp);
        if (!key) return;

        if (!dailyActiveSets.has(key)) dailyActiveSets.set(key, new Set());
        dailyActiveSets.get(key).add(e.userId);

        actionDistribution[e.action] = (actionDistribution[e.action] || 0) + 1;
        userActivityCount.set(e.userId, (userActivityCount.get(e.userId) || 0) + 1);
        lastActiveByUser.set(e.userId, Math.max(lastActiveByUser.get(e.userId) || 0, e.timestamp));

        const eventDate = new Date(e.timestamp);
        const day = eventDate.getUTCDay();
        const hour = eventDate.getUTCHours();
        activityHeatmap[day][hour] = (activityHeatmap[day][hour] || 0) + 1;
      });

      const dateKeys = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(periodStart);
        d.setUTCDate(periodStart.getUTCDate() + i);
        dateKeys.push(d.toISOString().slice(0, 10));
      }

      const dailyActiveUsersRaw = dateKeys.map(date => ({
        date,
        count: dailyActiveSets.get(date)?.size || 0
      }));

      const registrationTrendRaw = dateKeys.map(date => ({
        date,
        count: registrationsByDate.get(date) || 0
      }));

      const groupByWeek = groupBy === 'week';
      const aggregateWeekly = (items) => {
        const weeklyMap = new Map();
        items.forEach(item => {
          const weekKey = getWeekStartKey(item.date);
          if (!weekKey) return;
          weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + item.count);
        });
        return Array.from(weeklyMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }));
      };

      const dailyActiveUsers = groupByWeek
        ? (() => {
          const weeklySets = new Map();
          dateKeys.forEach(date => {
            const weekKey = getWeekStartKey(date);
            if (!weekKey) return;
            if (!weeklySets.has(weekKey)) weeklySets.set(weekKey, new Set());
            const daySet = dailyActiveSets.get(date);
            if (!daySet) return;
            daySet.forEach(userId => weeklySets.get(weekKey).add(userId));
          });

          return Array.from(weeklySets.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, set]) => ({ date, count: set.size }));
        })()
        : dailyActiveUsersRaw;

      const registrationTrend = groupByWeek
        ? aggregateWeekly(registrationTrendRaw)
        : registrationTrendRaw;

      const dau = getActiveUsersInWindow(1, 0).size;
      const wau = getActiveUsersInWindow(7, 0).size;
      const mau = getActiveUsersInWindow(30, 0).size;

      const dauPrev = getActiveUsersInWindow(1, 1).size;
      const wauPrev = getActiveUsersInWindow(7, 7).size;
      const mauPrev = getActiveUsersInWindow(30, 30).size;

      const retentionWindow = Math.min(7, days);
      const currentWindowUsers = getActiveUsersInWindow(retentionWindow, 0);
      const previousWindowUsers = getActiveUsersInWindow(retentionWindow, retentionWindow);
      let retainedCount = 0;
      previousWindowUsers.forEach(userId => {
        if (currentWindowUsers.has(userId)) retainedCount++;
      });
      const retention = previousWindowUsers.size > 0
        ? Math.round((retainedCount / previousWindowUsers.size) * 100)
        : 0;

      const topActiveUsers = Array.from(userActivityCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, count], index) => {
          const user = userMap.get(userId);
          const lastActiveTs = lastActiveByUser.get(userId);
          return {
            rank: index + 1,
            userId,
            name: user?.displayName || user?.email || userId,
            role: user?.role || 'unknown',
            count,
            lastActive: lastActiveTs ? new Date(lastActiveTs).toISOString() : null
          };
        });

      return {
        summary: {
          totalUsers: users.length,
          activeUsers: users.filter(u => u.status === 'active').length,
          periodActiveUsers: getActiveUsersInWindow(days, 0).size,
          dau,
          wau,
          mau,
          retention,
          dauTrend: calcPercentTrend(dau, dauPrev),
          wauTrend: calcPercentTrend(wau, wauPrev),
          mauTrend: calcPercentTrend(mau, mauPrev),
          newUsersToday: registrationsByDate.get(todayStart.toISOString().slice(0, 10)) || 0
        },
        dailyActiveUsers,
        roleDistribution,
        registrationTrend,
        behaviorDistribution: actionDistribution,
        topActiveUsers,
        activityHeatmap: {
          timezone: 'UTC',
          matrix: activityHeatmap
        },
        period: {
          days,
          from: periodStart.toISOString(),
          to: now.toISOString(),
          groupBy: groupByWeek ? 'week' : 'day'
        }
      };
    });

    res.json({
      success: true,
      data: {
        ...responseData,
        fromCache
      }
    });
  } catch (error) {
    console.error('User activity analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得用戶活動分析失敗'
    });
  }
});

// ========================================
// 自動化規則 API
// ========================================

const AUTOMATION_RULES_PK = 'AUTOMATION_RULES';
const AUTOMATION_RULES_SK_PREFIX = 'RULE#';

function getAutomationRuleSk(ruleId) {
  return `${AUTOMATION_RULES_SK_PREFIX}${ruleId}`;
}

function sanitizeAutomationRule(rule) {
  if (!rule) return null;
  const normalized = { ...rule };
  delete normalized.PK;
  delete normalized.SK;
  normalized.id = normalized.id || normalized.ruleId;
  normalized.ruleId = normalized.ruleId || normalized.id;
  return normalized;
}

async function listAutomationRules() {
  const items = await db.query(AUTOMATION_RULES_PK, {
    skPrefix: AUTOMATION_RULES_SK_PREFIX
  });
  return items
    .map(sanitizeAutomationRule)
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getAutomationRuleById(ruleId) {
  const item = await db.getItem(AUTOMATION_RULES_PK, getAutomationRuleSk(ruleId));
  return sanitizeAutomationRule(item);
}

/**
 * GET /api/admin/automation/rules
 * 獲取所有自動化規則
 */
router.get('/automation/rules', async (req, res) => {
  try {
    const rules = await listAutomationRules();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTriggers = rules.reduce((sum, rule) => {
      return sum + (rule.triggers?.filter(t => new Date(t) >= todayStart).length || 0);
    }, 0);

    const totalTriggers = rules.reduce((sum, rule) => sum + (rule.triggerCount || 0), 0);

    res.json({
      success: true,
      data: {
        rules,
        todayTriggers,
        totalTriggers
      }
    });
  } catch (error) {
    console.error('Get automation rules error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得自動化規則失敗'
    });
  }
});

/**
 * POST /api/admin/automation/rules
 * 創建新的自動化規則
 */
router.post('/automation/rules', async (req, res) => {
  try {
    const { name, type, conditions, actions } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '規則名稱和類型為必填'
      });
    }

    const now = new Date().toISOString();
    const ruleId = db.generateId('rule');
    const newRule = {
      PK: AUTOMATION_RULES_PK,
      SK: getAutomationRuleSk(ruleId),
      entityType: 'AUTOMATION_RULE',
      id: ruleId,
      ruleId,
      name,
      type,
      conditions: conditions || {},
      actions: actions || {},
      isActive: true,
      triggerCount: 0,
      triggers: [],
      lastTriggered: null,
      conditionSummary: summarizeConditions(conditions),
      actionSummary: summarizeActions(actions, type),
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(newRule);

    res.json({
      success: true,
      data: { rule: sanitizeAutomationRule(newRule) }
    });
  } catch (error) {
    console.error('Create automation rule error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '創建自動化規則失敗'
    });
  }
});

/**
 * PUT /api/admin/automation/rules/:ruleId
 * 更新自動化規則
 */
router.put('/automation/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    const updates = { ...(req.body || {}) };

    const existingRule = await getAutomationRuleById(ruleId);
    if (!existingRule) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到該規則'
      });
    }

    delete updates.PK;
    delete updates.SK;
    delete updates.id;
    delete updates.ruleId;
    delete updates.entityType;
    delete updates.createdAt;

    if (updates.conditions && !updates.conditionSummary) {
      updates.conditionSummary = summarizeConditions(updates.conditions);
    }
    if ((updates.actions || updates.type) && !updates.actionSummary) {
      updates.actionSummary = summarizeActions(updates.actions || existingRule.actions, updates.type || existingRule.type);
    }

    updates.updatedAt = new Date().toISOString();

    const updatedRule = await db.updateItem(
      AUTOMATION_RULES_PK,
      getAutomationRuleSk(ruleId),
      updates
    );

    res.json({
      success: true,
      data: { rule: sanitizeAutomationRule(updatedRule) }
    });
  } catch (error) {
    console.error('Update automation rule error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新自動化規則失敗'
    });
  }
});

/**
 * DELETE /api/admin/automation/rules/:ruleId
 * 刪除自動化規則
 */
router.delete('/automation/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;

    const existingRule = await getAutomationRuleById(ruleId);
    if (!existingRule) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到該規則'
      });
    }

    await db.deleteItem(AUTOMATION_RULES_PK, getAutomationRuleSk(ruleId));

    res.json({
      success: true,
      message: '規則已刪除'
    });
  } catch (error) {
    console.error('Delete automation rule error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除自動化規則失敗'
    });
  }
});

/**
 * PUT /api/admin/automation/rules/:ruleId/toggle
 * 啟用/停用自動化規則
 */
router.put('/automation/rules/:ruleId/toggle', async (req, res) => {
  try {
    const { ruleId } = req.params;

    const existingRule = await getAutomationRuleById(ruleId);
    if (!existingRule) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到該規則'
      });
    }

    const toggledRule = await db.updateItem(
      AUTOMATION_RULES_PK,
      getAutomationRuleSk(ruleId),
      {
        isActive: !existingRule.isActive,
        updatedAt: new Date().toISOString()
      }
    );

    res.json({
      success: true,
      data: { rule: sanitizeAutomationRule(toggledRule) }
    });
  } catch (error) {
    console.error('Toggle automation rule error:', error);
    res.status(500).json({
      success: false,
      error: 'TOGGLE_FAILED',
      message: '切換規則狀態失敗'
    });
  }
});

// 輔助函數：摘要條件
function summarizeConditions(conditions) {
  if (!conditions) return '無條件';
  const parts = [];
  if (conditions.role) parts.push(`角色: ${conditions.role}`);
  if (conditions.daysInactive) parts.push(`${conditions.daysInactive}天未活動`);
  if (conditions.courseStatus) parts.push(`課程狀態: ${conditions.courseStatus}`);
  return parts.length > 0 ? parts.join(', ') : '無條件';
}

// 輔助函數：摘要動作
function summarizeActions(actions, type) {
  const typeActions = {
    'AUTO_APPROVE_LICENSE': '自動核准授權申請',
    'AUTO_SEND_NOTIFICATION': '發送通知',
    'AUTO_SUSPEND_USER': '停用用戶帳號',
    'AUTO_ARCHIVE_COURSE': '封存課程',
    'SCHEDULED_REPORT': '生成定期報表'
  };
  return typeActions[type] || '執行動作';
}

module.exports = router;
