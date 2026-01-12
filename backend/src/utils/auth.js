/**
 * 認證工具模組
 * BeyondBridge Education Platform
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'beyondbridge_jwt_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * 密碼加密
 */
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * 密碼驗證
 */
async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * 產生 Access Token
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 產生 Refresh Token
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

/**
 * 產生 Token 組合
 */
function generateTokens(user) {
  const payload = {
    userId: user.userId || user.adminId,
    email: user.email,
    role: user.role || 'user',
    isAdmin: user.entityType === 'ADMIN'
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: JWT_EXPIRES_IN
  };
}

/**
 * 驗證 Token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error('INVALID_TOKEN');
  }
}

/**
 * 從 Authorization Header 提取 Token
 */
function extractToken(authHeader) {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Express 中間件：驗證用戶身份
 */
function authMiddleware(req, res, next) {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: '未提供認證令牌'
    });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.message === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: '認證令牌已過期'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: '無效的認證令牌'
    });
  }
}

/**
 * Express 中間件：驗證管理員身份
 */
function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '需要管理員權限'
      });
    }
    next();
  });
}

/**
 * Express 中間件：可選認證（有 Token 則驗證，沒有則繼續）
 */
function optionalAuthMiddleware(req, res, next) {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
  } catch (error) {
    req.user = null;
  }
  next();
}

/**
 * Express 中間件：角色授權檢查
 * @param {string[]} allowedRoles - 允許的角色列表
 */
function authorize(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '需要先進行身份認證'
      });
    }

    const userRole = req.user.role;

    // 管理員擁有所有權限
    if (req.user.isAdmin) {
      return next();
    }

    // 檢查用戶角色是否在允許列表中
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: '權限不足，無法執行此操作'
    });
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyToken,
  extractToken,
  authMiddleware,
  adminMiddleware,
  optionalAuthMiddleware,
  authorize,
  // 別名，讓其他模組可以用 authenticate 導入
  authenticate: authMiddleware
};
