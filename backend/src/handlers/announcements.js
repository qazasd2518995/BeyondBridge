/**
 * 公告 API 處理器
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, adminMiddleware, optionalAuthMiddleware } = require('../utils/auth');

/**
 * GET /api/announcements
 * 取得有效公告列表
 */
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const announcements = await db.getActiveAnnouncements();

    // 根據用戶角色篩選
    let filteredAnnouncements = announcements;
    if (req.user) {
      const userRole = req.user.isAdmin ? 'admin' : req.user.role;
      filteredAnnouncements = announcements.filter(ann => {
        if (!ann.targetRoles || ann.targetRoles.length === 0) return true;
        return ann.targetRoles.includes(userRole) || ann.targetRoles.includes('all');
      });
    }

    // 按優先級和發布時間排序
    filteredAnnouncements.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const priorityDiff = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.publishAt) - new Date(a.publishAt);
    });

    // 清理資料
    const cleanedAnnouncements = filteredAnnouncements.map(ann => {
      delete ann.PK;
      delete ann.SK;
      return ann;
    });

    res.json({
      success: true,
      data: cleanedAnnouncements,
      count: cleanedAnnouncements.length
    });

  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得公告失敗'
    });
  }
});

/**
 * GET /api/announcements/:id
 * 取得單一公告
 */
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await db.getItem(`ANN#${id}`, 'META');
    if (!announcement) {
      return res.status(404).json({
        success: false,
        error: 'ANNOUNCEMENT_NOT_FOUND',
        message: '找不到此公告'
      });
    }

    // 增加瀏覽次數
    await db.updateItem(`ANN#${id}`, 'META', {
      viewCount: (announcement.viewCount || 0) + 1
    });

    delete announcement.PK;
    delete announcement.SK;

    res.json({
      success: true,
      data: announcement
    });

  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得公告失敗'
    });
  }
});

/**
 * POST /api/announcements/:id/dismiss
 * 關閉/已讀公告
 */
router.post('/:id/dismiss', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 記錄用戶已關閉此公告
    const dismissItem = {
      PK: `USER#${userId}`,
      SK: `ANN_DISMISS#${id}`,
      entityType: 'ANNOUNCEMENT_DISMISS',
      createdAt: new Date().toISOString(),
      userId,
      announcementId: id
    };

    await db.putItem(dismissItem);

    res.json({
      success: true,
      message: '已關閉公告'
    });

  } catch (error) {
    console.error('Dismiss announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'DISMISS_FAILED',
      message: '關閉公告失敗'
    });
  }
});

// ===== 管理員專用路由 =====

/**
 * POST /api/announcements
 * 建立新公告（管理員）
 */
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const {
      title, content, contentHtml, targetRoles, priority = 'normal',
      displayType = 'banner', imageUrl, actionUrl, actionText,
      publishAt, expiresAt
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請填寫標題和內容'
      });
    }

    const announcementId = db.generateId('ann');
    const now = new Date().toISOString();

    const announcement = {
      PK: `ANN#${announcementId}`,
      SK: 'META',
      GSI2PK: 'STATUS#active',
      GSI2SK: publishAt || now,
      entityType: 'ANNOUNCEMENT',
      createdAt: now,

      announcementId,
      title,
      content,
      contentHtml: contentHtml || `<p>${content}</p>`,

      targetRoles: targetRoles || ['educator', 'trainer', 'creator'],
      targetTiers: null,

      priority,
      displayType,
      imageUrl: imageUrl || null,
      actionUrl: actionUrl || null,
      actionText: actionText || null,

      publishAt: publishAt || now,
      expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),

      status: 'active',
      createdBy: req.user.userId,

      viewCount: 0,
      clickCount: 0,

      updatedAt: now
    };

    await db.putItem(announcement);

    res.status(201).json({
      success: true,
      message: '公告已建立',
      data: {
        announcementId,
        title,
        status: 'active'
      }
    });

  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立公告失敗'
    });
  }
});

/**
 * PUT /api/announcements/:id
 * 更新公告（管理員）
 */
router.put('/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'title', 'content', 'contentHtml', 'targetRoles', 'priority',
      'displayType', 'imageUrl', 'actionUrl', 'actionText', 'publishAt', 'expiresAt', 'status'
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

    await db.updateItem(`ANN#${id}`, 'META', updates);

    res.json({
      success: true,
      message: '公告已更新'
    });

  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新公告失敗'
    });
  }
});

/**
 * DELETE /api/announcements/:id
 * 刪除公告（管理員）
 */
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await db.updateItem(`ANN#${id}`, 'META', {
      status: 'deleted',
      GSI2PK: 'STATUS#deleted',
      deletedAt: new Date().toISOString(),
      deletedBy: req.user.userId
    });

    res.json({
      success: true,
      message: '公告已刪除'
    });

  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除公告失敗'
    });
  }
});

/**
 * GET /api/announcements/admin/all
 * 取得所有公告（含已過期、草稿）（管理員）
 */
router.get('/admin/all', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;

    let announcements = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'ANNOUNCEMENT' }
      }
    });

    if (status) {
      announcements = announcements.filter(a => a.status === status);
    }

    // 排序
    announcements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 清理
    announcements = announcements.map(ann => {
      delete ann.PK;
      delete ann.SK;
      return ann;
    });

    res.json({
      success: true,
      data: announcements,
      count: announcements.length
    });

  } catch (error) {
    console.error('Get all announcements error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得公告列表失敗'
    });
  }
});

module.exports = router;
