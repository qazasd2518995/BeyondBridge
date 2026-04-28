/**
 * 認證 API 處理器
 * 處理登入、註冊、Token 更新等
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../utils/db');
const auth = require('../utils/auth');
const {
  sendPasswordResetEmail,
  sendStudentEmailVerificationEmail,
  classifyEmailError,
  isEmailServiceSetupError
} = require('../utils/email');
const { logAuditEvent } = require('./audit-logs');
const { enrollUserIntoClassLinkedCourse } = require('../utils/class-course-links');

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;
const EMAIL_VERIFICATION_EXPIRY_MS = 48 * 60 * 60 * 1000;
const TEACHER_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const ACCOUNT_TOKEN_KINDS = {
  EMAIL_VERIFICATION: 'email_verification',
  TEACHER_INVITE: 'teacher_invite'
};

function isStudentEmailVerificationRequired() {
  return String(process.env.STUDENT_EMAIL_VERIFICATION_REQUIRED || '').trim().toLowerCase() === 'true';
}

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

function generateAccountToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashAccountToken(token = '') {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildAccountTokenPk(token) {
  return `ACCOUNT_TOKEN#${hashAccountToken(token)}`;
}

function buildAccountTokenOwnerKey(kind, userId) {
  return `ACCOUNT_TOKEN_OWNER#${kind}#${userId}`;
}

function maskEmail(email = '') {
  const [localPart, domain = ''] = String(email).split('@');
  if (!localPart || !domain) return email;
  if (localPart.length <= 2) return `${localPart.charAt(0)}***@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
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

async function revokeAccountTokens(kind, userId, exceptPk = null) {
  const ownerKey = buildAccountTokenOwnerKey(kind, userId);
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

async function createAccountToken({ kind, userId, email, expiresInMs, req, metadata = {} }) {
  const rawToken = generateAccountToken();
  const now = new Date().toISOString();
  const tokenItem = {
    PK: buildAccountTokenPk(rawToken),
    SK: 'META',
    GSI1PK: buildAccountTokenOwnerKey(kind, userId),
    GSI1SK: `TOKEN#${now}`,
    entityType: 'ACCOUNT_TOKEN',
    kind,
    userId,
    email,
    createdAt: now,
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    requestedIp: req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown',
    userAgent: req?.headers?.['user-agent'] || '',
    ...metadata
  };

  await revokeAccountTokens(kind, userId);
  await db.putItem(tokenItem);
  return { rawToken, tokenItem };
}

async function getValidAccountToken(token, expectedKind = null) {
  if (!token) return null;

  const tokenRecord = await db.getItem(buildAccountTokenPk(token), 'META');
  if (!tokenRecord || tokenRecord.entityType !== 'ACCOUNT_TOKEN') {
    return null;
  }
  if (expectedKind && tokenRecord.kind !== expectedKind) {
    return null;
  }
  if (tokenRecord.consumedAt) {
    return null;
  }
  if (!tokenRecord.expiresAt || new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return tokenRecord;
}

async function activateStudentClassAndCourse(user, classData, now) {
  if (!user?.userId || !classData?.classId) {
    return null;
  }

  const existingMember = await db.getItem(`CLASS#${classData.classId}`, `MEMBER#${user.userId}`);
  if (!existingMember) {
    await db.putItem({
      PK: `CLASS#${classData.classId}`,
      SK: `MEMBER#${user.userId}`,
      entityType: 'CLASS_MEMBER',
      createdAt: now,
      classId: classData.classId,
      userId: user.userId,
      userName: user.displayName,
      userEmail: user.email,
      role: 'student',
      joinedAt: now,
      status: 'active'
    });

    await db.updateItem(`CLASS#${classData.classId}`, 'META', {
      memberCount: (classData.memberCount || 0) + 1,
      updatedAt: now
    });
  }

  const existingEnrollment = await db.getItem(`USER#${user.userId}`, `ENROLLMENT#${classData.classId}`);
  if (!existingEnrollment) {
    await db.putItem({
      PK: `USER#${user.userId}`,
      SK: `ENROLLMENT#${classData.classId}`,
      entityType: 'ENROLLMENT',
      createdAt: now,
      userId: user.userId,
      classId: classData.classId,
      className: classData.name,
      teacherName: classData.teacherName,
      enrolledAt: now
    });
  }

  return enrollUserIntoClassLinkedCourse(classData, {
    userId: user.userId,
    displayName: user.displayName,
    email: user.email
  }, { now });
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
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供電子郵件和密碼'
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
        message: '電子郵件或密碼錯誤'
      });
    }

    if (!isAdmin && user.status === 'pending_email_verification' && !isStudentEmailVerificationRequired()) {
      const now = new Date().toISOString();
      const classId = user.pendingEnrollment?.classId;
      const classData = classId ? await db.getItem(`CLASS#${classId}`, 'META') : null;
      let enrolledCourse = null;
      if (classData && classData.status === 'active') {
        enrolledCourse = await activateStudentClassAndCourse(user, classData, now);
      }
      user = await db.updateItem(`USER#${user.userId}`, 'PROFILE', {
        status: 'active',
        emailVerified: true,
        emailVerifiedAt: now,
        emailVerificationSkipped: true,
        emailVerificationSkippedAt: now,
        pendingEnrollment: null,
        updatedAt: now
      });
      await db.logActivity(user.userId, 'email_verification_skipped_auto_activate', 'auth', user.userId, {
        role: 'student',
        classId: classData?.classId || null,
        courseId: enrolledCourse?.courseId || null,
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
      });
    }

    // 檢查帳號狀態
    if (user.status !== 'active') {
      if (user.status === 'pending_email_verification') {
        return res.status(403).json({
          success: false,
          error: 'EMAIL_NOT_VERIFIED',
          message: '請先到信箱點擊驗證連結後再登入'
        });
      }

      if (user.status === 'pending_invite') {
        return res.status(403).json({
          success: false,
          error: 'INVITE_NOT_ACCEPTED',
          message: '請先到信箱接受邀請並設定密碼'
        });
      }

      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_INACTIVE',
        message: '帳號已被停用'
      });
    }

    // 驗證密碼
    const passwordValid = user.passwordHash
      ? await auth.verifyPassword(password, user.passwordHash)
      : false;
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: '電子郵件或密碼錯誤'
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
    const email = normalizeEmail(req.body?.email);
    const {
      password,
      displayName,
      organization,
      role = 'student',
      inviteCode
    } = req.body;

    // 驗證必填欄位
    if (!email || !password || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請填寫所有必要欄位'
      });
    }

    // 驗證電子郵件格式
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: '電子郵件格式不正確'
      });
    }

    if (role !== 'student') {
      return res.status(403).json({
        success: false,
        error: 'TEACHER_INVITE_REQUIRED',
        message: '教師帳號需由管理員建立並透過邀請信啟用'
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
    const [existingUser, existingAdmin] = await Promise.all([
      db.getUserByEmail(email),
      db.getAdminByEmail(email)
    ]);
    if (existingUser || existingAdmin) {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: '此電子郵件已被註冊'
      });
    }

    // 產生用戶 ID 並加密密碼
    const userId = db.generateId('usr');
    const passwordHash = await auth.hashPassword(password);
    const now = new Date().toISOString();
    const emailVerificationRequired = isStudentEmailVerificationRequired();

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

      status: emailVerificationRequired ? 'pending_email_verification' : 'active',
      emailVerified: !emailVerificationRequired,
      emailVerifiedAt: emailVerificationRequired ? null : now,
      emailVerificationSkipped: !emailVerificationRequired,
      emailVerificationSkippedAt: emailVerificationRequired ? null : now,
      pendingEnrollment: emailVerificationRequired && classData ? {
        type: 'class_invite',
        classId: classData.classId,
        className: classData.name,
        inviteCode: String(inviteCode || '').trim().toUpperCase()
      } : null,
      lastLoginAt: emailVerificationRequired ? null : now,
      updatedAt: now
    };

    await db.putItem(newUser);
    if (!emailVerificationRequired) {
      const enrolledCourse = await activateStudentClassAndCourse(newUser, classData, now);
      await db.logActivity(userId, 'register', 'auth', userId, {
        role: 'student',
        emailVerificationSkipped: true,
        classId: classData?.classId || null,
        courseId: enrolledCourse?.courseId || null,
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
      });

      const tokens = auth.generateTokens(newUser);
      return res.status(201).json({
        success: true,
        message: enrolledCourse?.courseId
          ? '註冊成功，帳號已啟用並加入班級與課程'
          : '註冊成功，帳號已啟用並加入班級',
        data: {
          user: {
            userId,
            email,
            displayName,
            role,
            isAdmin: false,
            organization,
            subscriptionTier: 'student',
            avatarUrl: null,
            enrolledClass: classData ? { classId: classData.classId, className: classData.name } : null,
            enrolledCourse: enrolledCourse?.courseId ? {
              courseId: enrolledCourse.courseId,
              courseName: enrolledCourse.courseName || enrolledCourse.title || null
            } : null,
            emailVerified: true
          },
          ...tokens
        }
      });
    }

    const { rawToken } = await createAccountToken({
      kind: ACCOUNT_TOKEN_KINDS.EMAIL_VERIFICATION,
      userId,
      email,
      expiresInMs: EMAIL_VERIFICATION_EXPIRY_MS,
      req,
      metadata: {
        classId: classData?.classId || null,
        inviteCode: String(inviteCode || '').trim().toUpperCase()
      }
    });
    let verificationEmailSent = false;
    let emailDeliveryError = null;
    try {
      await sendStudentEmailVerificationEmail(newUser, rawToken, classData);
      verificationEmailSent = true;
    } catch (emailError) {
      emailDeliveryError = classifyEmailError(emailError);
      console.error('Send student verification email failed:', emailError);
    }

    res.status(201).json({
      success: true,
      message: verificationEmailSent
        ? '註冊資料已建立，請到信箱點擊電子郵件驗證連結後再登入'
        : isEmailServiceSetupError(emailDeliveryError)
          ? '註冊資料已建立，但郵件服務尚未完成 SES 寄件設定，請聯絡管理員完成寄件網域驗證'
          : '註冊資料已建立，但驗證信寄送失敗，請稍後重新寄送驗證信',
      data: {
        pendingVerification: true,
        verificationEmailSent,
        emailDeliveryError: verificationEmailSent ? null : emailDeliveryError,
        user: {
          userId,
          email,
          displayName,
          role,
          isAdmin: false,
          organization,
          subscriptionTier: role === 'student' ? 'student' : 'free',
          enrolledClass: classData ? { classId: classData.classId, className: classData.name } : null,
          emailMasked: maskEmail(email)
        },
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
 * GET /api/auth/email/verification/validate
 * 驗證學生電子郵件驗證連結
 */
router.get('/email/verification/validate', async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: '請提供驗證 token'
      });
    }

    const tokenRecord = await getValidAccountToken(token, ACCOUNT_TOKEN_KINDS.EMAIL_VERIFICATION);
    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_VERIFICATION_TOKEN',
        message: '驗證連結無效或已過期'
      });
    }

    res.json({
      success: true,
      data: {
        email: maskEmail(tokenRecord.email),
        expiresAt: tokenRecord.expiresAt
      }
    });
  } catch (error) {
    console.error('Email verification validate error:', error);
    res.status(500).json({
      success: false,
      error: 'VERIFY_VALIDATE_FAILED',
      message: '驗證連結檢查失敗'
    });
  }
});

/**
 * POST /api/auth/email/verification/confirm
 * 完成學生電子郵件驗證，啟用帳號並加入班級/課程
 */
router.post('/email/verification/confirm', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: '請提供驗證 token'
      });
    }

    const tokenRecord = await getValidAccountToken(token, ACCOUNT_TOKEN_KINDS.EMAIL_VERIFICATION);
    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_VERIFICATION_TOKEN',
        message: '驗證連結無效或已過期'
      });
    }

    const user = await db.getUser(tokenRecord.userId);
    if (!user || user.role !== 'student') {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNT_UNAVAILABLE',
        message: '帳號不存在或驗證類型不正確'
      });
    }

    if (user.status === 'active' && user.emailVerified) {
      return res.json({
        success: true,
        message: '電子郵件已驗證，請直接登入'
      });
    }

    if (user.status !== 'pending_email_verification') {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNT_NOT_PENDING',
        message: '此帳號目前不需要電子郵件驗證'
      });
    }

    const classId = tokenRecord.classId || user.pendingEnrollment?.classId;
    const classData = classId ? await db.getItem(`CLASS#${classId}`, 'META') : null;
    if (!classData || classData.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'INVITE_CLASS_UNAVAILABLE',
        message: '原通行碼對應的班級已不可用，請聯繫老師重新取得通行碼'
      });
    }

    const now = new Date().toISOString();
    const enrolledCourse = await activateStudentClassAndCourse(user, classData, now);

    await db.updateItem(`USER#${user.userId}`, 'PROFILE', {
      status: 'active',
      emailVerified: true,
      emailVerifiedAt: now,
      pendingEnrollment: null,
      updatedAt: now
    });

    await db.updateItem(tokenRecord.PK, 'META', {
      consumedAt: now,
      consumedIp: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      updatedAt: now
    });
    await revokeAccountTokens(ACCOUNT_TOKEN_KINDS.EMAIL_VERIFICATION, user.userId, tokenRecord.PK);

    await db.logActivity(user.userId, 'email_verified', 'auth', user.userId, {
      role: 'student',
      classId: classData.classId,
      courseId: enrolledCourse?.courseId || null,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    });

    res.json({
      success: true,
      message: enrolledCourse?.courseId
        ? '電子郵件已驗證，帳號已啟用並加入班級與課程'
        : '電子郵件已驗證，帳號已啟用並加入班級',
      data: {
        enrolledClass: { classId: classData.classId, className: classData.name },
        enrolledCourse: enrolledCourse?.courseId ? {
          courseId: enrolledCourse.courseId,
          courseTitle: enrolledCourse.courseTitle
        } : null
      }
    });
  } catch (error) {
    console.error('Email verification confirm error:', error);
    res.status(500).json({
      success: false,
      error: 'VERIFY_CONFIRM_FAILED',
      message: '電子郵件驗證失敗，請稍後再試'
    });
  }
});

/**
 * POST /api/auth/email/verification/resend
 * 重新寄送學生電子郵件驗證信
 */
router.post('/email/verification/resend', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: '請提供有效電子郵件'
      });
    }

    const user = await db.getUserByEmail(email);
    if (user?.status === 'pending_email_verification') {
      const classId = user.pendingEnrollment?.classId;
      const classData = classId ? await db.getItem(`CLASS#${classId}`, 'META') : null;
      const { rawToken } = await createAccountToken({
        kind: ACCOUNT_TOKEN_KINDS.EMAIL_VERIFICATION,
        userId: user.userId,
        email: user.email,
        expiresInMs: EMAIL_VERIFICATION_EXPIRY_MS,
        req,
        metadata: {
          classId: classData?.classId || null,
          inviteCode: user.pendingEnrollment?.inviteCode || null
        }
      });
      try {
        await sendStudentEmailVerificationEmail(user, rawToken, classData);
      } catch (emailError) {
        const emailDeliveryError = classifyEmailError(emailError);
        if (isEmailServiceSetupError(emailDeliveryError)) {
          return res.status(503).json({
            success: false,
            error: emailDeliveryError.code,
            message: '郵件服務尚未完成 SES 寄件設定，請管理員完成寄件網域驗證與 production access 後再重寄',
            data: { emailDeliveryError }
          });
        }
        throw emailError;
      }
    }

    res.json({
      success: true,
      message: '如果該電子郵件仍待驗證，新的驗證信已寄出'
    });
  } catch (error) {
    console.error('Email verification resend error:', error);
    res.status(500).json({
      success: false,
      error: 'VERIFY_RESEND_FAILED',
      message: '重新寄送驗證信失敗'
    });
  }
});

/**
 * GET /api/auth/teacher/invite/validate
 * 驗證老師邀請連結
 */
router.get('/teacher/invite/validate', async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: '請提供邀請 token'
      });
    }

    const tokenRecord = await getValidAccountToken(token, ACCOUNT_TOKEN_KINDS.TEACHER_INVITE);
    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INVITE_TOKEN',
        message: '邀請連結無效或已過期'
      });
    }

    const user = await db.getUser(tokenRecord.userId);
    if (!user || user.status !== 'pending_invite') {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNT_NOT_PENDING',
        message: '此邀請已完成或帳號狀態不正確'
      });
    }

    res.json({
      success: true,
      data: {
        email: maskEmail(tokenRecord.email),
        displayName: user.displayName || user.displayNameZh || '',
        role: user.role,
        expiresAt: tokenRecord.expiresAt
      }
    });
  } catch (error) {
    console.error('Teacher invite validate error:', error);
    res.status(500).json({
      success: false,
      error: 'INVITE_VALIDATE_FAILED',
      message: '驗證邀請連結失敗'
    });
  }
});

/**
 * POST /api/auth/teacher/invite/accept
 * 老師接受邀請並設定密碼
 */
router.post('/teacher/invite/accept', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供邀請 token 與密碼'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: '密碼長度至少需要 8 個字元'
      });
    }

    const tokenRecord = await getValidAccountToken(token, ACCOUNT_TOKEN_KINDS.TEACHER_INVITE);
    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INVITE_TOKEN',
        message: '邀請連結無效或已過期'
      });
    }

    const user = await db.getUser(tokenRecord.userId);
    if (!user || user.status !== 'pending_invite') {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNT_NOT_PENDING',
        message: '此邀請已完成或帳號狀態不正確'
      });
    }

    const now = new Date().toISOString();
    const passwordHash = await auth.hashPassword(password);

    await db.updateItem(`USER#${user.userId}`, 'PROFILE', {
      passwordHash,
      status: 'active',
      emailVerified: true,
      emailVerifiedAt: now,
      invitationAcceptedAt: now,
      updatedAt: now
    });

    await db.updateItem(tokenRecord.PK, 'META', {
      consumedAt: now,
      consumedIp: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      updatedAt: now
    });
    await revokeAccountTokens(ACCOUNT_TOKEN_KINDS.TEACHER_INVITE, user.userId, tokenRecord.PK);

    await db.logActivity(user.userId, 'teacher_invite_accepted', 'auth', user.userId, {
      role: user.role,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    });

    res.json({
      success: true,
      message: '帳號已啟用，請使用剛設定的密碼登入'
    });
  } catch (error) {
    console.error('Teacher invite accept error:', error);
    res.status(500).json({
      success: false,
      error: 'INVITE_ACCEPT_FAILED',
      message: '接受邀請失敗，請稍後再試'
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
        message: '請提供電子郵件'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: '電子郵件格式不正確'
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
      message: '如果該電子郵件存在，重設密碼連結已寄出'
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
