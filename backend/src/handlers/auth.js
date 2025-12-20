/**
 * 認證 API 處理器
 * 處理登入、註冊、Token 更新等
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const auth = require('../utils/auth');

/**
 * POST /api/auth/login
 * 用戶/管理員登入
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供 Email 和密碼'
      });
    }

    // 先檢查是否為管理員
    let user = await db.getAdminByEmail(email);
    let isAdmin = true;

    // 如果不是管理員，檢查一般用戶
    if (!user) {
      user = await db.getUserByEmail(email);
      isAdmin = false;
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Email 或密碼錯誤'
      });
    }

    // 驗證密碼
    const passwordValid = await auth.verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Email 或密碼錯誤'
      });
    }

    // 檢查帳號狀態
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_INACTIVE',
        message: '帳號已被停用'
      });
    }

    // 更新最後登入時間
    const now = new Date().toISOString();
    const pk = isAdmin ? `ADMIN#${user.adminId}` : `USER#${user.userId}`;
    await db.updateItem(pk, 'PROFILE', { lastLoginAt: now });

    // 產生 Token
    const tokens = auth.generateTokens(user);

    // 回傳用戶資料（移除敏感資訊）
    const userResponse = {
      userId: user.userId || user.adminId,
      email: user.email,
      displayName: user.displayName || user.displayNameZh,
      role: isAdmin ? 'admin' : user.role,
      isAdmin,
      organization: user.organization,
      subscriptionTier: user.subscriptionTier,
      avatarUrl: user.avatarUrl
    };

    res.json({
      success: true,
      message: '登入成功',
      data: {
        user: userResponse,
        ...tokens
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'LOGIN_FAILED',
      message: '登入失敗，請稍後再試'
    });
  }
});

/**
 * POST /api/auth/register
 * 用戶註冊
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName, organization, role = 'educator' } = req.body;

    // 驗證必填欄位
    if (!email || !password || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請填寫所有必要欄位'
      });
    }

    // 驗證 Email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Email 格式不正確'
      });
    }

    // 驗證密碼強度
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: '密碼長度至少需要 8 個字元'
      });
    }

    // 檢查 Email 是否已存在
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: '此 Email 已被註冊'
      });
    }

    // 產生用戶 ID 並加密密碼
    const userId = db.generateId('usr');
    const passwordHash = await auth.hashPassword(password);
    const now = new Date().toISOString();

    // 建立用戶資料
    const newUser = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      GSI1PK: `ROLE#${role}`,
      GSI1SK: `USER#${userId}`,
      GSI4PK: email,
      email: email,
      entityType: 'USER',
      createdAt: now,

      userId,
      displayName,
      passwordHash,
      role,
      organization: organization || null,
      organizationType: null,
      avatarUrl: null,

      subscriptionTier: 'free',
      subscriptionExpiry: null,
      licenseQuota: 10,
      licenseUsed: 0,

      preferences: {
        language: 'zh-TW',
        darkMode: false,
        notifications: {
          newMaterial: true,
          progress: true,
          expiry: true,
          email: true
        }
      },

      stats: {
        totalHours: 0,
        coursesCompleted: 0,
        coursesInProgress: 0
      },

      status: 'active',
      lastLoginAt: now,
      updatedAt: now
    };

    await db.putItem(newUser);

    // 產生 Token
    const tokens = auth.generateTokens(newUser);

    res.status(201).json({
      success: true,
      message: '註冊成功',
      data: {
        user: {
          userId,
          email,
          displayName,
          role,
          isAdmin: false,
          organization,
          subscriptionTier: 'free'
        },
        ...tokens
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: 'REGISTER_FAILED',
      message: '註冊失敗，請稍後再試'
    });
  }
});

/**
 * POST /api/auth/refresh
 * 更新 Token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: '請提供 Refresh Token'
      });
    }

    // 驗證 Refresh Token
    const decoded = auth.verifyToken(refreshToken);

    // 取得用戶資料
    let user;
    if (decoded.isAdmin) {
      user = await db.getAdmin(decoded.userId);
    } else {
      user = await db.getUser(decoded.userId);
    }

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: '無效的 Token'
      });
    }

    // 產生新的 Access Token
    const newAccessToken = auth.generateAccessToken({
      userId: decoded.userId,
      email: user.email,
      role: user.role || 'user',
      isAdmin: decoded.isAdmin
    });

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
      }
    });

  } catch (error) {
    if (error.message === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Refresh Token 已過期，請重新登入'
      });
    }
    res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: '無效的 Token'
    });
  }
});

/**
 * GET /api/auth/me
 * 取得當前登入用戶資料
 */
router.get('/me', auth.authMiddleware, async (req, res) => {
  try {
    let user;
    if (req.user.isAdmin) {
      user = await db.getAdmin(req.user.userId);
    } else {
      user = await db.getUser(req.user.userId);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '找不到用戶資料'
      });
    }

    // 移除敏感資訊
    delete user.passwordHash;
    delete user.PK;
    delete user.SK;

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得用戶資料失敗'
    });
  }
});

/**
 * POST /api/auth/logout
 * 登出（前端處理 Token 清除即可）
 */
router.post('/logout', auth.authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: '已登出'
  });
});

/**
 * PUT /api/auth/password
 * 變更密碼
 */
router.put('/password', auth.authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供現有密碼和新密碼'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: '新密碼長度至少需要 8 個字元'
      });
    }

    // 取得用戶資料
    let user;
    let pk;
    if (req.user.isAdmin) {
      user = await db.getAdmin(req.user.userId);
      pk = `ADMIN#${req.user.userId}`;
    } else {
      user = await db.getUser(req.user.userId);
      pk = `USER#${req.user.userId}`;
    }

    // 驗證現有密碼
    const passwordValid = await auth.verifyPassword(currentPassword, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_PASSWORD',
        message: '現有密碼錯誤'
      });
    }

    // 更新密碼
    const newPasswordHash = await auth.hashPassword(newPassword);
    await db.updateItem(pk, 'PROFILE', {
      passwordHash: newPasswordHash,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '密碼已更新'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '密碼更新失敗'
    });
  }
});

module.exports = router;
