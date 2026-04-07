/**
 * 認證 API 處理器
 * 處理登入、註冊、Token 更新等
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../utils/db');
const auth = require('../utils/auth');
const { sendPasswordResetEmail } = require('../utils/email');
const { logAuditEvent } = require('./audit-logs');
const { enrollUserIntoClassLinkedCourse } = require('../utils/class-course-links');

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

function isValidEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function hashPasswordResetToken(token = '') {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildPasswordResetTokenPk(token) {
  return `PASSWORD_RESET#${hashPasswordResetToken(token)}`;
}

function buildPasswordResetOwnerKey(accountType, userId) {
  return `PASSWORD_RESET_OWNER#${accountType}#${userId}`;
}

function generatePasswordResetToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function maskEmail(email = '') {
  const [localPart, domain = ''] = String(email).split('@');
  if (!localPart || !domain) return email;
  if (localPart.length <= 2) return `${localPart.charAt(0)}***@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

async function revokePasswordResetTokens(accountType, userId, exceptPk = null) {
  const ownerKey = buildPasswordResetOwnerKey(accountType, userId);
  const existingTokens = await db.queryByIndex('GSI1', ownerKey, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'TOKEN#',
    projection: ['PK', 'SK']
  });
  const keysToDelete = existingTokens
    .filter(item => item?.PK && item?.SK && item.PK !== exceptPk)
    .map(item => ({ PK: item.PK, SK: item.SK }));

  if (keysToDelete.length > 0) {
    await db.batchDelete(keysToDelete);
  }
}

async function getPasswordResetAccountByEmail(email) {
  let user = await db.getAdminByEmail(email);
  if (user) {
    return { user, isAdmin: true };
  }

  user = await db.getUserByEmail(email);
  if (user) {
    return { user, isAdmin: false };
  }

  return null;
}

async function getValidPasswordResetRecord(token) {
  if (!token) return null;

  const resetRecord = await db.getItem(buildPasswordResetTokenPk(token), 'META');
  if (!resetRecord || resetRecord.entityType !== 'PASSWORD_RESET_TOKEN') {
    return null;
  }

  if (resetRecord.consumedAt) {
    return null;
  }

  if (!resetRecord.expiresAt || new Date(resetRecord.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return resetRecord;
}

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
    const userId = user.userId || user.adminId;
    const pk = isAdmin ? `ADMIN#${userId}` : `USER#${userId}`;
    await db.updateItem(pk, 'PROFILE', { lastLoginAt: now });

    // 記錄登入活動
    await db.logActivity(userId, 'login', 'auth', userId, {
      isAdmin,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    });

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
 * 用戶註冊（教師/學生）
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName, organization, role = 'educator', inviteCode } = req.body;

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

    // 驗證密碼強度（學生可以較短，教師需8字元）
    const minLength = role === 'student' ? 6 : 8;
    if (password.length < minLength) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: `密碼長度至少需要 ${minLength} 個字元`
      });
    }

    // 學生必須提供有效的邀請碼
    let classData = null;
    if (role === 'student') {
      if (!inviteCode || inviteCode.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_INVITE_CODE',
          message: '學生註冊需要提供班級邀請碼'
        });
      }

      // 驗證邀請碼
      const classes = await db.scan({
        filter: {
          expression: 'entityType = :type AND inviteCode = :code AND #status = :status',
          values: { ':type': 'CLASS', ':code': inviteCode.toUpperCase(), ':status': 'active' },
          names: { '#status': 'status' }
        }
      });

      if (classes.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_INVITE_CODE',
          message: '無效的班級邀請碼'
        });
      }

      classData = classes[0];
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

      subscriptionTier: role === 'student' ? 'student' : 'free',
      subscriptionExpiry: null,
      licenseQuota: role === 'student' ? 0 : 10,
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

    let enrolledCourse = null;

    // 學生自動加入班級
    if (role === 'student' && classData) {
      // 建立班級成員關係
      const memberItem = {
        PK: `CLASS#${classData.classId}`,
        SK: `MEMBER#${userId}`,
        entityType: 'CLASS_MEMBER',
        createdAt: now,

        classId: classData.classId,
        userId,
        userName: displayName,
        userEmail: email,
        role: 'student',
        joinedAt: now,
        status: 'active'
      };

      await db.putItem(memberItem);

      // 建立用戶的 enrollment 記錄
      const enrollmentItem = {
        PK: `USER#${userId}`,
        SK: `ENROLLMENT#${classData.classId}`,
        entityType: 'ENROLLMENT',
        createdAt: now,

        userId,
        classId: classData.classId,
        className: classData.name,
        teacherName: classData.teacherName,
        enrolledAt: now
      };

      await db.putItem(enrollmentItem);

      // 更新班級成員數
      await db.updateItem(`CLASS#${classData.classId}`, 'META', {
        memberCount: (classData.memberCount || 0) + 1,
        updatedAt: now
      });

      enrolledCourse = await enrollUserIntoClassLinkedCourse(classData, {
        userId,
        displayName,
        email
      }, { now });
    }

    // 產生 Token
    const tokens = auth.generateTokens(newUser);

    res.status(201).json({
      success: true,
      message: role === 'student'
        ? (enrolledCourse?.courseId ? '註冊成功，已加入班級與課程' : '註冊成功，已加入班級')
        : '註冊成功',
      data: {
        user: {
          userId,
          email,
          displayName,
          role,
          isAdmin: false,
          organization,
          subscriptionTier: role === 'student' ? 'student' : 'free',
          enrolledClass: classData ? { classId: classData.classId, className: classData.name } : null,
          enrolledCourse: enrolledCourse?.courseId ? {
            courseId: enrolledCourse.courseId,
            courseTitle: enrolledCourse.courseTitle
          } : null
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

    // 產生新的 Refresh Token（Token 輪換）
    const newRefreshToken = auth.generateRefreshToken({
      userId: decoded.userId,
      email: user.email,
      role: user.role || 'user',
      isAdmin: decoded.isAdmin
    });

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
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
 * POST /api/auth/password/reset/request
 * 請求寄送密碼重設信
 */
router.post('/password/reset/request', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_EMAIL',
        message: '請提供 Email'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Email 格式不正確'
      });
    }

    const account = await getPasswordResetAccountByEmail(email);
    if (account?.user && account.user.status === 'active') {
      const { user, isAdmin } = account;
      const userId = user.userId || user.adminId;
      const accountType = isAdmin ? 'ADMIN' : 'USER';
      const rawToken = generatePasswordResetToken();
      const now = new Date().toISOString();
      const resetItem = {
        PK: buildPasswordResetTokenPk(rawToken),
        SK: 'META',
        GSI1PK: buildPasswordResetOwnerKey(accountType, userId),
        GSI1SK: `TOKEN#${now}`,
        entityType: 'PASSWORD_RESET_TOKEN',
        userId,
        accountType,
        email,
        createdAt: now,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS).toISOString(),
        requestedIp: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || ''
      };

      await revokePasswordResetTokens(accountType, userId);
      await db.putItem(resetItem);
      await sendPasswordResetEmail(user, rawToken);
    }

    res.json({
      success: true,
      message: '如果該 Email 存在，重設密碼連結已寄出'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      error: 'RESET_REQUEST_FAILED',
      message: '重設密碼請求失敗，請稍後再試'
    });
  }
});

/**
 * GET /api/auth/password/reset/validate
 * 驗證密碼重設 token 是否有效
 */
router.get('/password/reset/validate', async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: '請提供重設密碼 token'
      });
    }

    const resetRecord = await getValidPasswordResetRecord(token);
    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RESET_TOKEN',
        message: '重設密碼連結無效或已過期'
      });
    }

    res.json({
      success: true,
      data: {
        email: maskEmail(resetRecord.email),
        expiresAt: resetRecord.expiresAt
      }
    });
  } catch (error) {
    console.error('Password reset validate error:', error);
    res.status(500).json({
      success: false,
      error: 'RESET_VALIDATE_FAILED',
      message: '驗證重設密碼連結失敗'
    });
  }
});

/**
 * POST /api/auth/password/reset/confirm
 * 使用 token 完成密碼重設
 */
router.post('/password/reset/confirm', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供 token 與新密碼'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: '新密碼長度至少需要 8 個字元'
      });
    }

    const resetRecord = await getValidPasswordResetRecord(token);
    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RESET_TOKEN',
        message: '重設密碼連結無效或已過期'
      });
    }

    const isAdmin = resetRecord.accountType === 'ADMIN';
    const userId = resetRecord.userId;
    const user = isAdmin ? await db.getAdmin(userId) : await db.getUser(userId);

    if (!user || user.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNT_UNAVAILABLE',
        message: '帳號不存在或已停用'
      });
    }

    const now = new Date().toISOString();
    const passwordHash = await auth.hashPassword(newPassword);
    const userPk = isAdmin ? `ADMIN#${userId}` : `USER#${userId}`;

    await db.updateItem(userPk, 'PROFILE', {
      passwordHash,
      updatedAt: now,
      lastPasswordResetAt: now
    });

    await db.updateItem(resetRecord.PK, 'META', {
      consumedAt: now,
      consumedIp: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      updatedAt: now
    });

    await revokePasswordResetTokens(resetRecord.accountType, userId, resetRecord.PK);
    await db.logActivity(userId, 'password_reset', 'auth', userId, {
      isAdmin,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    });

    if (typeof logAuditEvent === 'function') {
      await logAuditEvent({
        userId,
        userEmail: user.email,
        userName: user.displayName || user.displayNameZh || user.email,
        eventType: 'user_password_reset',
        targetType: 'auth',
        targetId: userId,
        targetName: user.email,
        description: '使用密碼重設連結更新密碼',
        metadata: {
          accountType: resetRecord.accountType
        },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || ''
      });
    }

    res.json({
      success: true,
      message: '密碼已重設，請使用新密碼登入'
    });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    res.status(500).json({
      success: false,
      error: 'RESET_CONFIRM_FAILED',
      message: '重設密碼失敗，請稍後再試'
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
