/**
 * 管理員 API 處理器
 * 後台管理功能
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const auth = require('../utils/auth');

// 所有管理員路由都需要管理員權限
router.use(auth.adminMiddleware);

/**
 * GET /api/admin/dashboard
 * 管理員儀表板數據
 */
router.get('/dashboard', async (req, res) => {
  try {
    // 取得各類統計數據
    const [users, resources, courses, licenses, announcements] = await Promise.all([
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'USER' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'RESOURCE' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'COURSE' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'LICENSE' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'ANNOUNCEMENT' } } })
    ]);

    // 計算統計
    const activeUsers = users.filter(u => u.status === 'active').length;
    const activeLicenses = licenses.filter(l => l.status === 'active').length;
    const pendingLicenses = licenses.filter(l => l.status === 'pending').length;
    const publishedResources = resources.filter(r => r.status === 'published').length;

    // 計算 30 天內新註冊用戶
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = users.filter(u => new Date(u.createdAt) >= thirtyDaysAgo).length;

    // 計算即將到期的授權
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringLicenses = licenses.filter(l => {
      if (!l.expiryDate) return false;
      const expiry = new Date(l.expiryDate);
      const today = new Date();
      return l.status === 'active' && expiry > today && expiry <= thirtyDaysFromNow;
    }).length;

    // 最近活動（簡化版）
    const recentUsers = users
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(u => ({
        userId: u.userId,
        displayName: u.displayName,
        email: u.email,
        createdAt: u.createdAt
      }));

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers: users.length,
          activeUsers,
          newUsersThisMonth: newUsers,
          totalResources: resources.length,
          publishedResources,
          totalCourses: courses.length,
          activeLicenses,
          pendingLicenses,
          expiringLicenses,
          activeAnnouncements: announcements.filter(a => a.status === 'active').length
        },
        recentUsers,
        timestamp: new Date().toISOString()
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
      gradeLevel, tags, duration, unitCount, price = 0
    } = req.body;

    if (!title || !type || !category || !gradeLevel) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請填寫必要欄位'
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
      'gradeLevel', 'tags', 'duration', 'unitCount', 'price', 'thumbnailUrl'
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
 * GET /api/admin/analytics/overview
 * 平台分析概覽
 */
router.get('/analytics/overview', async (req, res) => {
  try {
    const [users, resources, licenses] = await Promise.all([
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'USER' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'RESOURCE' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'LICENSE' } } })
    ]);

    const now = new Date();
    const thisMonth = now.toISOString().substring(0, 7);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 7);

    // 按月統計用戶增長
    const usersByMonth = {};
    let newUsersThisMonth = 0;
    let newUsersLastMonth = 0;
    users.forEach(u => {
      const month = u.createdAt?.substring(0, 7) || 'unknown';
      usersByMonth[month] = (usersByMonth[month] || 0) + 1;
      if (month === thisMonth) newUsersThisMonth++;
      if (month === lastMonth) newUsersLastMonth++;
    });

    // 生成用戶增長趨勢（最近6個月）
    const userGrowthTrend = [];
    let cumulativeTotal = 0;
    const sortedMonths = Object.keys(usersByMonth).sort();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const monthKey = d.toISOString().substring(0, 7);
      const monthLabel = `${d.getMonth() + 1}月`;
      const newUsers = usersByMonth[monthKey] || 0;
      cumulativeTotal += newUsers;
      userGrowthTrend.push({
        label: monthLabel,
        total: users.filter(u => u.createdAt && u.createdAt.substring(0, 7) <= monthKey).length,
        newUsers: newUsers
      });
    }

    // 資源分類統計
    const resourcesByCategory = {};
    resources.forEach(r => {
      const cat = r.category || 'other';
      resourcesByCategory[cat] = (resourcesByCategory[cat] || 0) + 1;
    });
    const resourceCategories = Object.entries(resourcesByCategory).map(([name, count]) => ({
      name,
      count
    }));

    // 用戶角色分布
    const userRoleCount = {};
    users.forEach(u => {
      const role = u.role || 'student';
      userRoleCount[role] = (userRoleCount[role] || 0) + 1;
    });
    const userRoles = Object.entries(userRoleCount).map(([role, count]) => ({
      role,
      count
    }));

    // 授權狀態統計
    const licenseStatusCount = { active: 0, pending: 0, expired: 0 };
    licenses.forEach(l => {
      const status = l.status || 'pending';
      if (licenseStatusCount[status] !== undefined) {
        licenseStatusCount[status]++;
      }
    });
    const licenseStatus = Object.entries(licenseStatusCount).map(([status, count]) => ({
      status,
      count
    }));

    // 熱門資源
    const topResources = resources
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
      .slice(0, 5)
      .map(r => ({
        title: r.title,
        views: r.viewCount || 0,
        rating: r.averageRating || 0
      }));

    // 計算資源數量變化
    const resourcesThisMonth = resources.filter(r => r.createdAt?.substring(0, 7) === thisMonth).length;
    const resourcesLastMonth = resources.filter(r => r.createdAt?.substring(0, 7) === lastMonth).length;

    // 計算授權數量變化
    const activeLicenses = licenses.filter(l => l.status === 'active').length;
    const licensesLastMonth = licenses.filter(l => l.createdAt?.substring(0, 7) === lastMonth && l.status === 'active').length;

    // 平均評分
    const avgRating = resources.length > 0
      ? resources.reduce((sum, r) => sum + (r.averageRating || 0), 0) / resources.length
      : 0;

    res.json({
      success: true,
      data: {
        metrics: {
          totalUsers: users.length,
          newUsersThisMonth,
          newUsersLastMonth,
          totalResources: resources.length,
          resourcesLastMonth,
          activeLicenses,
          licensesLastMonth,
          avgCustomerRating: Math.round(avgRating * 10) / 10
        },
        userGrowthTrend,
        userRoles,
        resourceCategories,
        licenseStatus,
        topResources,
        supportStats: {
          totalChats: 0,
          closedChats: 0,
          avgRating: 0,
          satisfactionRate: 0
        }
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

    // 總體健康狀態
    const overallStatus = dbStatus === 'unhealthy' || apiStatus === 'unhealthy' ? 'unhealthy'
      : dbStatus === 'degraded' || apiStatus === 'degraded' ? 'degraded' : 'healthy';

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
            status: 'healthy',
            usage: '未實作'
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

    let users = await db.getAllUsers({ limit: 10000 });

    // 套用篩選
    if (filters) {
      if (filters.role) users = users.filter(u => u.role === filters.role);
      if (filters.status) users = users.filter(u => u.status === filters.status);
      if (filters.dateFrom) users = users.filter(u => new Date(u.createdAt) >= new Date(filters.dateFrom));
      if (filters.dateTo) users = users.filter(u => new Date(u.createdAt) <= new Date(filters.dateTo));
    }

    // 選擇欄位
    const defaultFields = ['userId', 'displayName', 'email', 'role', 'status', 'createdAt'];
    const selectedFields = fields || defaultFields;

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
router.get('/analytics/user-activity', async (req, res) => {
  try {
    const { range = '30d', groupBy = 'day' } = req.query;

    // 解析日期範圍
    let days = 30;
    if (range === '7d') days = 7;
    else if (range === '90d') days = 90;
    else if (range === '30d') days = 30;

    // 取得所有用戶
    const users = await db.getAllUsers({ limit: 10000 });

    // 計算活躍用戶
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // 計算活躍用戶數（模擬數據，實際應從登入日誌計算）
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'active').length;

    // 模擬 DAU/WAU/MAU（實際應從登入日誌計算）
    const dau = Math.floor(totalUsers * 0.15) + Math.floor(Math.random() * 10);
    const wau = Math.floor(totalUsers * 0.35) + Math.floor(Math.random() * 20);
    const mau = Math.floor(totalUsers * 0.65) + Math.floor(Math.random() * 30);
    const retention = Math.floor(50 + Math.random() * 30); // 50-80%

    // 模擬趨勢變化
    const dauTrend = Math.floor(Math.random() * 20) - 5; // -5 to +15
    const wauTrend = Math.floor(Math.random() * 15) - 3; // -3 to +12
    const mauTrend = Math.floor(Math.random() * 10); // 0 to +10

    // 模擬活躍用戶統計
    const dailyActiveUsers = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      dailyActiveUsers.push({
        date: date.toISOString().split('T')[0],
        count: Math.floor(Math.random() * totalUsers * 0.2) + Math.floor(totalUsers * 0.05)
      });
    }

    // 角色分布
    const roleDistribution = {};
    users.forEach(u => {
      const role = u.role || 'unknown';
      roleDistribution[role] = (roleDistribution[role] || 0) + 1;
    });

    // 註冊趨勢
    const registrationTrend = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const count = users.filter(u => u.createdAt?.startsWith(dateStr)).length;
      registrationTrend.push({ date: dateStr, count });
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          activeUsers,
          dau,
          wau,
          mau,
          retention,
          dauTrend,
          wauTrend,
          mauTrend,
          newUsersToday: registrationTrend[registrationTrend.length - 1]?.count || 0
        },
        dailyActiveUsers,
        roleDistribution,
        registrationTrend,
        period: {
          days,
          from: cutoffDate.toISOString(),
          to: now.toISOString()
        }
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

// 模擬自動化規則資料存儲（實際應使用資料庫）
let automationRules = [];

/**
 * GET /api/admin/automation/rules
 * 獲取所有自動化規則
 */
router.get('/automation/rules', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTriggers = automationRules.reduce((sum, rule) => {
      return sum + (rule.triggers?.filter(t => new Date(t) >= todayStart).length || 0);
    }, 0);

    const totalTriggers = automationRules.reduce((sum, rule) => sum + (rule.triggerCount || 0), 0);

    res.json({
      success: true,
      data: {
        rules: automationRules,
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

    const newRule = {
      id: `rule_${Date.now()}`,
      name,
      type,
      conditions: conditions || {},
      actions: actions || {},
      isActive: true,
      triggerCount: 0,
      lastTriggered: null,
      conditionSummary: summarizeConditions(conditions),
      actionSummary: summarizeActions(actions, type),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    automationRules.push(newRule);

    res.json({
      success: true,
      data: { rule: newRule }
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
    const updates = req.body;

    const ruleIndex = automationRules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到該規則'
      });
    }

    automationRules[ruleIndex] = {
      ...automationRules[ruleIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: { rule: automationRules[ruleIndex] }
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

    const ruleIndex = automationRules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到該規則'
      });
    }

    automationRules.splice(ruleIndex, 1);

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

    const ruleIndex = automationRules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到該規則'
      });
    }

    automationRules[ruleIndex].isActive = !automationRules[ruleIndex].isActive;
    automationRules[ruleIndex].updatedAt = new Date().toISOString();

    res.json({
      success: true,
      data: { rule: automationRules[ruleIndex] }
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
