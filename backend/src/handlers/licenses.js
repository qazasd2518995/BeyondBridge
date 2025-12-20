/**
 * 授權管理 API 處理器
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

/**
 * GET /api/licenses
 * 取得當前用戶的授權列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const licenses = await db.getUserLicenses(userId);

    // 清理並補充資訊
    const enrichedLicenses = licenses.map(lic => {
      delete lic.PK;
      delete lic.SK;

      // 計算剩餘天數
      if (lic.expiryDate) {
        const expiry = new Date(lic.expiryDate);
        const today = new Date();
        const diffTime = expiry - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        lic.daysRemaining = diffDays;
        lic.isExpiringSoon = diffDays <= 30 && diffDays > 0;
        lic.isExpired = diffDays <= 0;
      }

      return lic;
    });

    res.json({
      success: true,
      data: enrichedLicenses,
      count: enrichedLicenses.length
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
 * GET /api/licenses/:id
 * 取得授權詳情
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const license = await db.getItem(`LIC#${id}`, 'META');
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'LICENSE_NOT_FOUND',
        message: '找不到此授權'
      });
    }

    // 檢查權限
    if (!req.user.isAdmin && license.userId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看此授權'
      });
    }

    delete license.PK;
    delete license.SK;

    res.json({
      success: true,
      data: license
    });

  } catch (error) {
    console.error('Get license error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得授權失敗'
    });
  }
});

/**
 * POST /api/licenses/request
 * 申請新授權
 */
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { resourceId, licenseType = 'personal', notes } = req.body;

    if (!resourceId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_RESOURCE',
        message: '請指定要申請授權的資源'
      });
    }

    // 檢查資源是否存在
    const resource = await db.getItem(`RES#${resourceId}`, 'META');
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'RESOURCE_NOT_FOUND',
        message: '找不到此資源'
      });
    }

    // 檢查用戶配額
    const user = await db.getUser(userId);
    if (user.licenseUsed >= user.licenseQuota) {
      return res.status(403).json({
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: '授權配額已用完'
      });
    }

    // 檢查是否已有此資源的授權
    const existingLicenses = await db.getUserLicenses(userId);
    const hasLicense = existingLicenses.some(
      lic => lic.resourceId === resourceId && lic.status === 'active'
    );
    if (hasLicense) {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_LICENSED',
        message: '您已擁有此資源的授權'
      });
    }

    // 建立授權申請
    const licenseId = db.generateId('lic');
    const now = new Date().toISOString();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const licenseItem = {
      PK: `LIC#${licenseId}`,
      SK: 'META',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `LIC#${licenseId}`,
      GSI2PK: 'STATUS#pending',
      GSI2SK: now,
      entityType: 'LICENSE',
      createdAt: now,

      licenseId,
      resourceId,
      resourceTitle: resource.title,
      resourceType: resource.type,

      userId,
      licenseType,
      seatCount: licenseType === 'institutional' ? 50 : 1,

      startDate: null,
      expiryDate: null,
      status: 'pending',

      notes,
      accessCount: 0,
      lastAccessedAt: null,
      orderId: null,

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
      expiryDate: null,
      status: 'pending'
    };

    await db.putItem(userLicenseItem);

    res.status(201).json({
      success: true,
      message: '授權申請已送出，等待審核',
      data: {
        licenseId,
        resourceId,
        resourceTitle: resource.title,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Request license error:', error);
    res.status(500).json({
      success: false,
      error: 'REQUEST_FAILED',
      message: '授權申請失敗'
    });
  }
});

/**
 * POST /api/licenses/:id/renew
 * 申請續約
 */
router.post('/:id/renew', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const license = await db.getItem(`LIC#${id}`, 'META');
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'LICENSE_NOT_FOUND',
        message: '找不到此授權'
      });
    }

    if (license.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限操作此授權'
      });
    }

    // 更新為待續約狀態
    await db.updateItem(`LIC#${id}`, 'META', {
      renewalRequested: true,
      renewalRequestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '續約申請已送出'
    });

  } catch (error) {
    console.error('Renew license error:', error);
    res.status(500).json({
      success: false,
      error: 'RENEW_FAILED',
      message: '續約申請失敗'
    });
  }
});

/**
 * GET /api/licenses/expiring
 * 取得即將到期的授權
 */
router.get('/status/expiring', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const licenses = await db.getUserLicenses(userId);

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringLicenses = licenses.filter(lic => {
      if (!lic.expiryDate) return false;
      const expiry = new Date(lic.expiryDate);
      const today = new Date();
      return expiry > today && expiry <= thirtyDaysFromNow;
    });

    res.json({
      success: true,
      data: expiringLicenses.map(lic => {
        delete lic.PK;
        delete lic.SK;
        return lic;
      }),
      count: expiringLicenses.length
    });

  } catch (error) {
    console.error('Get expiring licenses error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得即將到期授權失敗'
    });
  }
});

module.exports = router;
