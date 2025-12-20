/**
 * 用戶 API 處理器
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

/**
 * GET /api/users/:id
 * 取得用戶資料
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 只能查看自己的資料（除非是管理員）
    if (!req.user.isAdmin && req.user.userId !== id) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看此用戶資料'
      });
    }

    const user = await db.getUser(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '找不到用戶'
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
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得用戶資料失敗'
    });
  }
});

/**
 * PUT /api/users/:id
 * 更新用戶資料
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 只能更新自己的資料（除非是管理員）
    if (!req.user.isAdmin && req.user.userId !== id) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限更新此用戶資料'
      });
    }

    const allowedFields = ['displayName', 'organization', 'organizationType', 'avatarUrl', 'preferences'];
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

    const updatedUser = await db.updateItem(`USER#${id}`, 'PROFILE', updates);

    // 移除敏感資訊
    delete updatedUser.passwordHash;
    delete updatedUser.PK;
    delete updatedUser.SK;

    res.json({
      success: true,
      message: '用戶資料已更新',
      data: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新用戶資料失敗'
    });
  }
});

/**
 * GET /api/users/:id/courses
 * 取得用戶的課程與進度
 */
router.get('/:id/courses', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user.isAdmin && req.user.userId !== id) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看'
      });
    }

    const progress = await db.getUserCourseProgress(id);

    res.json({
      success: true,
      data: progress
    });

  } catch (error) {
    console.error('Get user courses error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程資料失敗'
    });
  }
});

/**
 * GET /api/users/:id/licenses
 * 取得用戶的授權
 */
router.get('/:id/licenses', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user.isAdmin && req.user.userId !== id) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看'
      });
    }

    const licenses = await db.getUserLicenses(id);

    res.json({
      success: true,
      data: licenses
    });

  } catch (error) {
    console.error('Get user licenses error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得授權資料失敗'
    });
  }
});

/**
 * GET /api/users/:id/activities
 * 取得用戶活動日誌
 */
router.get('/:id/activities', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    if (!req.user.isAdmin && req.user.userId !== id) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看'
      });
    }

    const activities = await db.getUserActivities(id, parseInt(limit));

    res.json({
      success: true,
      data: activities
    });

  } catch (error) {
    console.error('Get user activities error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得活動日誌失敗'
    });
  }
});

/**
 * GET /api/users/:id/stats
 * 取得用戶統計數據
 */
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user.isAdmin && req.user.userId !== id) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看'
      });
    }

    const user = await db.getUser(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '找不到用戶'
      });
    }

    const licenses = await db.getUserLicenses(id);
    const progress = await db.getUserCourseProgress(id);

    res.json({
      success: true,
      data: {
        ...user.stats,
        licensedMaterials: licenses.length,
        licenseQuota: user.licenseQuota,
        licenseUsed: user.licenseUsed,
        subscriptionTier: user.subscriptionTier,
        coursesEnrolled: progress.length
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得統計數據失敗'
    });
  }
});

module.exports = router;
