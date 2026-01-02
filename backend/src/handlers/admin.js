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
 * 平台分析概覽 - 完整儀表板數據
 */
router.get('/analytics/overview', async (req, res) => {
  try {
    // 並行查詢所有數據
    const [users, resources, licenses, chatRooms] = await Promise.all([
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'USER' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'RESOURCE' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'LICENSE' } } }),
      db.scan({ filter: { expression: 'entityType = :type', values: { ':type': 'CHAT_ROOM' } } })
    ]);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // ========== 關鍵指標 ==========
    const totalUsers = users.length;
    const newUsersThisMonth = users.filter(u =>
      u.createdAt && new Date(u.createdAt) >= thisMonthStart
    ).length;
    const newUsersLastMonth = users.filter(u =>
      u.createdAt && new Date(u.createdAt) >= lastMonthStart && new Date(u.createdAt) <= lastMonthEnd
    ).length;

    const publishedResources = resources.filter(r => r.status === 'published');
    const totalResources = publishedResources.length;
    const resourcesLastMonth = publishedResources.filter(r =>
      r.publishedAt && new Date(r.publishedAt) <= lastMonthEnd
    ).length;

    const activeLicenses = licenses.filter(l => l.status === 'active').length;
    const licensesLastMonth = licenses.filter(l =>
      l.status === 'active' && l.approvedAt && new Date(l.approvedAt) <= lastMonthEnd
    ).length;

    // 客服評分
    const ratedChats = chatRooms.filter(c => c.rating && c.rating.score);
    const avgCustomerRating = ratedChats.length > 0
      ? ratedChats.reduce((sum, c) => sum + c.rating.score, 0) / ratedChats.length
      : 0;

    // ========== 用戶成長趨勢（過去6個月）==========
    const userGrowthTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = monthDate.toISOString().substring(0, 7);
      const monthLabel = `${monthDate.getMonth() + 1}月`;

      const usersUpToMonth = users.filter(u =>
        u.createdAt && new Date(u.createdAt) <= new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
      ).length;

      const newUsersInMonth = users.filter(u => {
        if (!u.createdAt) return false;
        const created = new Date(u.createdAt);
        return created.getFullYear() === monthDate.getFullYear() &&
               created.getMonth() === monthDate.getMonth();
      }).length;

      userGrowthTrend.push({
        month: monthKey,
        label: monthLabel,
        total: usersUpToMonth,
        newUsers: newUsersInMonth
      });
    }

    // ========== 用戶角色分布 ==========
    const userRoles = { educator: 0, student: 0, trainer: 0, admin: 0 };
    users.forEach(u => {
      const role = u.role || 'student';
      if (userRoles.hasOwnProperty(role)) {
        userRoles[role]++;
      }
    });

    // ========== 教材分類分布 ==========
    const categoryLabels = {
      math: '數學',
      chinese: '國文',
      english: '英文',
      science: '自然科學',
      social: '社會科學',
      business: '商業管理',
      technology: '資訊科技',
      arts: '藝術人文',
      other: '其他'
    };
    const resourceCategories = {};
    publishedResources.forEach(r => {
      const cat = r.category || 'other';
      resourceCategories[cat] = (resourceCategories[cat] || 0) + 1;
    });

    // ========== 授權狀態分布 ==========
    const licenseStatus = { pending: 0, active: 0, expired: 0, rejected: 0 };
    licenses.forEach(l => {
      const status = l.status || 'pending';
      if (licenseStatus.hasOwnProperty(status)) {
        licenseStatus[status]++;
      }
    });

    // ========== 熱門教材 Top 5 ==========
    const topResources = publishedResources
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
      .slice(0, 5)
      .map(r => ({
        resourceId: r.resourceId,
        title: r.title,
        category: r.category,
        viewCount: r.viewCount || 0,
        rating: r.averageRating || 0,
        licensedCount: r.licensedCount || 0
      }));

    // ========== 客服統計 ==========
    const closedChats = chatRooms.filter(c => c.status === 'closed');
    const satisfiedChats = ratedChats.filter(c => c.rating.score >= 4);
    const supportStats = {
      totalChats: chatRooms.length,
      closedChats: closedChats.length,
      avgRating: avgCustomerRating.toFixed(1),
      totalRatings: ratedChats.length,
      satisfactionRate: ratedChats.length > 0
        ? Math.round((satisfiedChats.length / ratedChats.length) * 100)
        : 0
    };

    // ========== 總瀏覽次數 ==========
    const totalViews = resources.reduce((sum, r) => sum + (r.viewCount || 0), 0);

    res.json({
      success: true,
      data: {
        metrics: {
          totalUsers,
          newUsersThisMonth,
          newUsersLastMonth,
          totalResources,
          resourcesLastMonth: resourcesLastMonth || totalResources,
          activeLicenses,
          licensesLastMonth: licensesLastMonth || activeLicenses,
          avgCustomerRating: parseFloat(avgCustomerRating.toFixed(1)),
          totalViews
        },
        userGrowthTrend,
        userRoles,
        resourceCategories,
        licenseStatus,
        topResources,
        supportStats
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

module.exports = router;
