/**
 * 聊天 REST API 處理器
 * 處理聊天室 CRUD、訊息歷史等 HTTP 端點
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, adminMiddleware } = require('../utils/auth');
const { hasOnlineAdmin, getOnlineAdminCount } = require('../realtime/socketServer');

// 生成唯一 ID
const generateId = (prefix = 'chat') => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
};

// ==================== 用戶端點 ====================

/**
 * GET /api/chat/rooms
 * 取得用戶的聊天室列表
 */
router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query;

    // 查詢用戶的聊天室 - 使用正確的 db.scan API
    let filterExpression = 'entityType = :type AND userId = :userId';
    const filterValues = {
      ':type': 'CHAT_ROOM',
      ':userId': userId
    };
    const filterNames = {};

    if (status) {
      filterExpression += ' AND #status = :status';
      filterNames['#status'] = 'status';
      filterValues[':status'] = status;
    }

    const result = await db.scan({
      filter: {
        expression: filterExpression,
        values: filterValues,
        names: Object.keys(filterNames).length > 0 ? filterNames : undefined
      }
    });

    const rooms = (result || [])
      .map(item => {
        delete item.PK;
        delete item.SK;
        return item;
      })
      .sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));

    res.json({
      success: true,
      data: rooms,
      onlineAdminCount: getOnlineAdminCount()
    });

  } catch (error) {
    console.error('Get chat rooms error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得聊天室列表失敗'
    });
  }
});

/**
 * POST /api/chat/rooms
 * 建立新聊天室（發起客服對話）
 */
router.post('/rooms', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { topic, message, priority = 'normal' } = req.body;

    // 檢查是否有進行中的對話
    const existingRooms = await db.scan({
      filter: {
        expression: 'entityType = :type AND userId = :userId AND (#status = :s1 OR #status = :s2)',
        names: { '#status': 'status' },
        values: {
          ':type': 'CHAT_ROOM',
          ':userId': userId,
          ':s1': 'waiting',
          ':s2': 'active'
        }
      }
    });

    if (existingRooms && existingRooms.length > 0) {
      // 返回現有的聊天室
      const existingRoom = existingRooms[0];
      delete existingRoom.PK;
      delete existingRoom.SK;

      return res.json({
        success: true,
        message: '已有進行中的對話',
        data: existingRoom,
        isExisting: true
      });
    }

    // 取得用戶資訊
    const user = await db.getItem(`USER#${userId}`, 'PROFILE');

    const chatId = generateId('chat');
    const now = new Date().toISOString();

    // 建立聊天室
    const chatRoom = {
      PK: `CHAT#${chatId}`,
      SK: 'META',
      entityType: 'CHAT_ROOM',

      chatId,
      userId,
      userName: user?.displayName || req.user.displayName || '用戶',
      userEmail: user?.email || req.user.email,

      topic: topic || '一般諮詢',
      admins: [],
      status: 'waiting',
      priority,

      lastMessage: message || '',
      lastMessageAt: now,
      messageCount: message ? 1 : 0,
      unreadCount: message ? 1 : 0,

      rating: null,
      createdAt: now,
      updatedAt: now,
      closedAt: null
    };

    await db.putItem(chatRoom);

    // 如果有初始訊息，建立訊息記錄
    if (message) {
      const messageItem = {
        PK: `CHAT#${chatId}`,
        SK: `MSG#${now}#${generateId('msg')}`,
        entityType: 'CHAT_MESSAGE',
        chatId,
        messageId: generateId('msg'),
        senderId: userId,
        senderName: chatRoom.userName,
        senderRole: 'user',
        content: message,
        messageType: 'text',
        imageUrl: null,
        status: 'sent',
        createdAt: now
      };

      await db.putItem(messageItem);
    }

    // 清理回傳資料
    delete chatRoom.PK;
    delete chatRoom.SK;

    res.status(201).json({
      success: true,
      message: hasOnlineAdmin() ? '已建立對話，客服將盡快回覆' : '已建立對話，客服目前離線，上線後會回覆您',
      data: chatRoom,
      onlineAdminCount: getOnlineAdminCount()
    });

  } catch (error) {
    console.error('Create chat room error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立聊天室失敗'
    });
  }
});

/**
 * GET /api/chat/rooms/:id
 * 取得聊天室詳情
 */
router.get('/rooms/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const isAdmin = req.user.isAdmin;

    const chatRoom = await db.getItem(`CHAT#${id}`, 'META');

    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '聊天室不存在'
      });
    }

    // 檢查權限
    if (!isAdmin && chatRoom.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看此聊天室'
      });
    }

    delete chatRoom.PK;
    delete chatRoom.SK;

    res.json({
      success: true,
      data: chatRoom
    });

  } catch (error) {
    console.error('Get chat room error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得聊天室失敗'
    });
  }
});

/**
 * GET /api/chat/rooms/:id/messages
 * 取得聊天訊息歷史（分頁）
 */
router.get('/rooms/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user.userId;
    const isAdmin = req.user.isAdmin;

    // 檢查權限
    const chatRoom = await db.getItem(`CHAT#${id}`, 'META');

    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '聊天室不存在'
      });
    }

    if (!isAdmin && chatRoom.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看此聊天室'
      });
    }

    // 查詢訊息 - 使用正確的 db.query API
    const queryOptions = {
      skPrefix: 'MSG#',
      limit: parseInt(limit),
      scanIndexForward: false
    };

    // TODO: 分頁功能需要用不同的查詢方式實現
    // if (before) { ... }

    const result = await db.query(`CHAT#${id}`, queryOptions);

    const messages = (result || [])
      .map(item => {
        delete item.PK;
        delete item.SK;
        return item;
      })
      .reverse();

    res.json({
      success: true,
      data: messages,
      hasMore: !!result.LastEvaluatedKey
    });

  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得訊息失敗'
    });
  }
});

/**
 * PUT /api/chat/rooms/:id/close
 * 關閉聊天室
 */
router.put('/rooms/:id/close', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    const userId = req.user.userId;
    const isAdmin = req.user.isAdmin;

    const chatRoom = await db.getItem(`CHAT#${id}`, 'META');

    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '聊天室不存在'
      });
    }

    if (!isAdmin && chatRoom.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限關閉此聊天室'
      });
    }

    const now = new Date().toISOString();
    const updateData = {
      status: 'closed',
      closedAt: now,
      updatedAt: now
    };

    // 用戶評分
    if (rating && !isAdmin) {
      updateData.rating = {
        score: Math.min(5, Math.max(1, rating.score)),
        comment: rating.comment || '',
        ratedAt: now,
        ratedBy: userId
      };
    }

    await db.updateItem(`CHAT#${id}`, 'META', updateData);

    res.json({
      success: true,
      message: '對話已結束'
    });

  } catch (error) {
    console.error('Close chat room error:', error);
    res.status(500).json({
      success: false,
      error: 'CLOSE_FAILED',
      message: '關閉聊天室失敗'
    });
  }
});

/**
 * GET /api/chat/status
 * 取得客服狀態
 */
router.get('/status', async (req, res) => {
  res.json({
    success: true,
    data: {
      online: hasOnlineAdmin(),
      adminCount: getOnlineAdminCount()
    }
  });
});

// ==================== 管理員端點 ====================

/**
 * GET /api/chat/admin/rooms
 * 取得所有聊天室（管理員）
 */
router.get('/admin/rooms', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, assignedTo } = req.query;

    // 查詢所有聊天室 - 使用正確的 db.scan API
    let filterExpression = 'entityType = :type';
    const filterValues = { ':type': 'CHAT_ROOM' };
    const filterNames = {};

    if (status) {
      filterExpression += ' AND #status = :status';
      filterNames['#status'] = 'status';
      filterValues[':status'] = status;
    }

    const result = await db.scan({
      filter: {
        expression: filterExpression,
        values: filterValues,
        names: Object.keys(filterNames).length > 0 ? filterNames : undefined
      }
    });

    let rooms = (result || [])
      .map(item => {
        delete item.PK;
        delete item.SK;
        return item;
      });

    // 篩選指派給特定管理員的
    if (assignedTo) {
      rooms = rooms.filter(r =>
        r.admins && r.admins.some(a => a.adminId === assignedTo && a.isActive)
      );
    }

    // 按優先級和時間排序
    rooms.sort((a, b) => {
      // 等候中的優先
      if (a.status === 'waiting' && b.status !== 'waiting') return -1;
      if (a.status !== 'waiting' && b.status === 'waiting') return 1;

      // 高優先級優先
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (a.priority !== 'high' && b.priority === 'high') return 1;

      // 按最後訊息時間排序
      return new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt);
    });

    // 計算各分類數量（每個聊天室只會出現在一個分類）
    const needsAttention = rooms.filter(r =>
      r.status === 'waiting' || (r.status === 'active' && (r.unreadCount || 0) > 0)
    ).length;
    const activeNoUnread = rooms.filter(r =>
      r.status === 'active' && (r.unreadCount || 0) === 0
    ).length;
    const closedCount = rooms.filter(r => r.status === 'closed').length;

    // 計算平均評分
    const ratedRooms = rooms.filter(r => r.rating && r.rating.score);
    const avgRating = ratedRooms.length > 0
      ? (ratedRooms.reduce((sum, r) => sum + r.rating.score, 0) / ratedRooms.length).toFixed(1)
      : null;

    res.json({
      success: true,
      data: rooms,
      counts: {
        waiting: rooms.filter(r => r.status === 'waiting').length,
        active: activeNoUnread,  // 只計算已讀的進行中對話
        closed: closedCount,
        needsAttention,  // 需要關注的對話數（用於徽章）
        avgRating,       // 平均評分
        totalRatings: ratedRooms.length
      }
    });

  } catch (error) {
    console.error('Admin get chat rooms error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得聊天室列表失敗'
    });
  }
});

/**
 * PUT /api/chat/admin/rooms/:id/claim
 * 管理員接手聊天
 */
router.put('/admin/rooms/:id/claim', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.userId;
    const adminName = req.user.displayName;

    const chatRoom = await db.getItem(`CHAT#${id}`, 'META');

    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '聊天室不存在'
      });
    }

    const now = new Date().toISOString();
    const admins = chatRoom.admins || [];

    // 檢查是否已接手
    const existingAdmin = admins.find(a => a.adminId === adminId);
    if (!existingAdmin) {
      admins.push({
        adminId,
        adminName,
        joinedAt: now,
        isActive: true
      });
    } else {
      existingAdmin.isActive = true;
    }

    await db.updateItem(`CHAT#${id}`, 'META', {
      admins,
      status: 'active',
      updatedAt: now
    });

    res.json({
      success: true,
      message: '已接手對話'
    });

  } catch (error) {
    console.error('Claim chat room error:', error);
    res.status(500).json({
      success: false,
      error: 'CLAIM_FAILED',
      message: '接手對話失敗'
    });
  }
});

/**
 * GET /api/chat/admin/stats
 * 取得客服統計
 */
router.get('/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // 查詢所有聊天室 - 使用正確的 db.scan API
    const result = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'CHAT_ROOM' }
      }
    });

    const rooms = result || [];

    // 計算統計
    const stats = {
      total: rooms.length,
      waiting: rooms.filter(r => r.status === 'waiting').length,
      active: rooms.filter(r => r.status === 'active').length,
      closed: rooms.filter(r => r.status === 'closed').length,
      avgRating: 0,
      totalRatings: 0
    };

    // 計算平均評分
    const ratedRooms = rooms.filter(r => r.rating && r.rating.score);
    if (ratedRooms.length > 0) {
      stats.avgRating = ratedRooms.reduce((sum, r) => sum + r.rating.score, 0) / ratedRooms.length;
      stats.totalRatings = ratedRooms.length;
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get chat stats error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得統計失敗'
    });
  }
});

module.exports = router;
