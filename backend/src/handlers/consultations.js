/**
 * 諮詢服務 API 處理器
 * 用戶可以申請客製化教材、顧問諮詢等服務
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, adminMiddleware } = require('../utils/auth');

// 生成唯一 ID
const generateId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `con_${timestamp}${random}`;
};

// 諮詢類型定義
const CONSULTATION_TYPES = {
  custom_material: '客製化教材',
  training: '企業培訓規劃',
  technical: '技術諮詢',
  licensing: '授權方案諮詢',
  other: '其他諮詢'
};

// 諮詢狀態定義
const CONSULTATION_STATUS = {
  pending: '待處理',
  reviewing: '審核中',
  quoted: '已報價',
  accepted: '已接受',
  in_progress: '進行中',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒絕'
};

/**
 * GET /api/consultations
 * 取得當前用戶的諮詢列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query;

    // 使用 scan 查詢用戶的諮詢記錄（諮詢量通常不大）
    const params = {
      TableName: process.env.DYNAMODB_TABLE || 'beyondbridge',
      FilterExpression: 'entityType = :type AND userId = :userId',
      ExpressionAttributeValues: {
        ':type': 'CONSULTATION',
        ':userId': userId
      }
    };

    // 如果指定狀態篩選
    if (status) {
      params.FilterExpression += ' AND #status = :status';
      params.ExpressionAttributeNames = { '#status': 'status' };
      params.ExpressionAttributeValues[':status'] = status;
    }

    const result = await db.scan(params);

    // 處理諮詢記錄
    const consultations = (result.Items || [])
      .map(item => {
        delete item.PK;
        delete item.SK;
        delete item.GSI1PK;
        delete item.GSI1SK;
        delete item.GSI2PK;
        delete item.GSI2SK;

        // 添加類型和狀態的中文名稱
        item.typeLabel = CONSULTATION_TYPES[item.requestType] || item.requestType;
        item.statusLabel = CONSULTATION_STATUS[item.status] || item.status;

        return item;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: consultations,
      count: consultations.length
    });

  } catch (error) {
    console.error('Get consultations error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得諮詢列表失敗'
    });
  }
});

/**
 * GET /api/consultations/:id
 * 取得諮詢詳情
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const consultation = await db.getItem(`CONSULT#${id}`, 'META');

    if (!consultation) {
      return res.status(404).json({
        success: false,
        error: 'CONSULTATION_NOT_FOUND',
        message: '找不到此諮詢記錄'
      });
    }

    // 檢查權限（只有本人或管理員可以查看）
    if (!req.user.isAdmin && consultation.userId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看此諮詢'
      });
    }

    // 清理內部欄位
    delete consultation.PK;
    delete consultation.SK;
    delete consultation.GSI1PK;
    delete consultation.GSI1SK;
    delete consultation.GSI2PK;
    delete consultation.GSI2SK;

    // 添加標籤
    consultation.typeLabel = CONSULTATION_TYPES[consultation.requestType] || consultation.requestType;
    consultation.statusLabel = CONSULTATION_STATUS[consultation.status] || consultation.status;

    res.json({
      success: true,
      data: consultation
    });

  } catch (error) {
    console.error('Get consultation error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得諮詢詳情失敗'
    });
  }
});

/**
 * POST /api/consultations
 * 建立新諮詢請求
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      requestType,
      title,
      description,
      gradeLevel,
      subject,
      estimatedBudget,
      contactPhone,
      preferredContactTime,
      attachments
    } = req.body;

    // 驗證必填欄位
    if (!requestType || !title || !description) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請填寫諮詢類型、標題和描述'
      });
    }

    // 驗證諮詢類型
    if (!CONSULTATION_TYPES[requestType]) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TYPE',
        message: '無效的諮詢類型'
      });
    }

    const consultationId = generateId();
    const now = new Date().toISOString();

    // 取得用戶資訊
    const user = await db.getItem(`USER#${userId}`, 'PROFILE');

    const consultation = {
      PK: `CONSULT#${consultationId}`,
      SK: 'META',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `CONSULT#${consultationId}`,
      GSI2PK: 'STATUS#pending',
      GSI2SK: now,
      entityType: 'CONSULTATION',

      consultationId,
      userId,
      userDisplayName: user?.displayName || '未知用戶',
      userEmail: user?.email || req.user.email,
      userOrganization: user?.organization,

      requestType,
      title,
      description,
      gradeLevel: gradeLevel || null,
      subject: subject || null,
      estimatedBudget: estimatedBudget || null,
      contactPhone: contactPhone || null,
      preferredContactTime: preferredContactTime || null,
      attachments: attachments || [],

      assignedTo: null,
      status: 'pending',

      quote: null,
      adminNotes: [],
      userNotes: [],

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(consultation);

    // 記錄活動
    await db.logActivity(userId, 'consultation_created', 'consultation', consultationId, {
      title,
      requestType
    });

    // 清理回傳資料
    delete consultation.PK;
    delete consultation.SK;
    delete consultation.GSI1PK;
    delete consultation.GSI1SK;
    delete consultation.GSI2PK;
    delete consultation.GSI2SK;

    consultation.typeLabel = CONSULTATION_TYPES[requestType];
    consultation.statusLabel = CONSULTATION_STATUS['pending'];

    res.status(201).json({
      success: true,
      message: '諮詢請求已建立，我們會盡快與您聯繫',
      data: consultation
    });

  } catch (error) {
    console.error('Create consultation error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立諮詢請求失敗'
    });
  }
});

/**
 * PUT /api/consultations/:id
 * 更新諮詢（用戶只能新增備註或取消）
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { note, action } = req.body;

    const consultation = await db.getItem(`CONSULT#${id}`, 'META');

    if (!consultation) {
      return res.status(404).json({
        success: false,
        error: 'CONSULTATION_NOT_FOUND',
        message: '找不到此諮詢記錄'
      });
    }

    // 檢查權限
    if (consultation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限修改此諮詢'
      });
    }

    const now = new Date().toISOString();
    const updates = { updatedAt: now };

    // 用戶可以新增備註
    if (note) {
      const userNotes = consultation.userNotes || [];
      userNotes.push({
        content: note,
        createdAt: now
      });
      updates.userNotes = userNotes;
    }

    // 用戶可以取消諮詢（只有待處理或審核中狀態可以取消）
    if (action === 'cancel') {
      if (!['pending', 'reviewing', 'quoted'].includes(consultation.status)) {
        return res.status(400).json({
          success: false,
          error: 'CANNOT_CANCEL',
          message: '此狀態的諮詢無法取消'
        });
      }
      updates.status = 'cancelled';
      updates.GSI2PK = 'STATUS#cancelled';
      updates.GSI2SK = now;
    }

    // 用戶可以接受報價
    if (action === 'accept_quote') {
      if (consultation.status !== 'quoted') {
        return res.status(400).json({
          success: false,
          error: 'NO_QUOTE',
          message: '尚未收到報價'
        });
      }
      updates.status = 'accepted';
      updates.GSI2PK = 'STATUS#accepted';
      updates.GSI2SK = now;
    }

    // 用戶可以拒絕報價
    if (action === 'reject_quote') {
      if (consultation.status !== 'quoted') {
        return res.status(400).json({
          success: false,
          error: 'NO_QUOTE',
          message: '尚未收到報價'
        });
      }
      updates.status = 'rejected';
      updates.GSI2PK = 'STATUS#rejected';
      updates.GSI2SK = now;
    }

    await db.updateItem(`CONSULT#${id}`, 'META', updates);

    res.json({
      success: true,
      message: '諮詢已更新',
      data: { consultationId: id, ...updates }
    });

  } catch (error) {
    console.error('Update consultation error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新諮詢失敗'
    });
  }
});

/**
 * DELETE /api/consultations/:id
 * 刪除諮詢（只有待處理狀態可以刪除）
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const consultation = await db.getItem(`CONSULT#${id}`, 'META');

    if (!consultation) {
      return res.status(404).json({
        success: false,
        error: 'CONSULTATION_NOT_FOUND',
        message: '找不到此諮詢記錄'
      });
    }

    // 檢查權限
    if (!req.user.isAdmin && consultation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限刪除此諮詢'
      });
    }

    // 只有待處理狀態可以刪除
    if (consultation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'CANNOT_DELETE',
        message: '只有待處理狀態的諮詢可以刪除'
      });
    }

    await db.deleteItem(`CONSULT#${id}`, 'META');

    res.json({
      success: true,
      message: '諮詢已刪除'
    });

  } catch (error) {
    console.error('Delete consultation error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除諮詢失敗'
    });
  }
});

// ==================== 管理員端點 ====================

/**
 * GET /api/consultations/admin/all
 * 取得所有諮詢列表（管理員）
 */
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, assignedTo } = req.query;

    // 使用 scan 查詢所有諮詢（諮詢量通常不大）
    const params = {
      TableName: process.env.DYNAMODB_TABLE || 'beyondbridge',
      FilterExpression: 'entityType = :type',
      ExpressionAttributeValues: {
        ':type': 'CONSULTATION'
      }
    };

    // 如果指定狀態篩選
    if (status) {
      params.FilterExpression += ' AND #status = :status';
      params.ExpressionAttributeNames = { '#status': 'status' };
      params.ExpressionAttributeValues[':status'] = status;
    }

    const result = await db.scan(params);

    let consultations = (result.Items || [])
      .map(item => {
        delete item.PK;
        delete item.SK;
        delete item.GSI1PK;
        delete item.GSI1SK;
        delete item.GSI2PK;
        delete item.GSI2SK;

        item.typeLabel = CONSULTATION_TYPES[item.requestType] || item.requestType;
        item.statusLabel = CONSULTATION_STATUS[item.status] || item.status;

        return item;
      });

    // 如果指定負責人篩選
    if (assignedTo) {
      consultations = consultations.filter(c => c.assignedTo === assignedTo);
    }

    // 按建立時間排序
    consultations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: consultations,
      count: consultations.length
    });

  } catch (error) {
    console.error('Admin get consultations error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得諮詢列表失敗'
    });
  }
});

/**
 * PUT /api/consultations/admin/:id
 * 管理員更新諮詢（指派、報價、狀態變更）
 */
router.put('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.userId;
    const {
      assignedTo,
      status,
      quote,
      adminNote,
      priority
    } = req.body;

    const consultation = await db.getItem(`CONSULT#${id}`, 'META');

    if (!consultation) {
      return res.status(404).json({
        success: false,
        error: 'CONSULTATION_NOT_FOUND',
        message: '找不到此諮詢記錄'
      });
    }

    const now = new Date().toISOString();
    const updates = { updatedAt: now };

    // 指派負責人
    if (assignedTo !== undefined) {
      updates.assignedTo = assignedTo;
    }

    // 更新狀態
    if (status && CONSULTATION_STATUS[status]) {
      updates.status = status;
      updates.GSI2PK = `STATUS#${status}`;
      updates.GSI2SK = now;
    }

    // 報價
    if (quote) {
      updates.quote = {
        amount: quote.amount,
        currency: quote.currency || 'TWD',
        description: quote.description || '',
        validUntil: quote.validUntil,
        createdAt: now,
        createdBy: adminId
      };
      // 有報價自動更新狀態為已報價
      if (!status) {
        updates.status = 'quoted';
        updates.GSI2PK = 'STATUS#quoted';
        updates.GSI2SK = now;
      }
    }

    // 管理員備註
    if (adminNote) {
      const adminNotes = consultation.adminNotes || [];
      adminNotes.push({
        content: adminNote,
        createdBy: adminId,
        createdAt: now
      });
      updates.adminNotes = adminNotes;
    }

    // 優先級
    if (priority) {
      updates.priority = priority;
    }

    await db.updateItem(`CONSULT#${id}`, 'META', updates);

    // TODO: 發送 Email 通知用戶狀態變更

    res.json({
      success: true,
      message: '諮詢已更新',
      data: { consultationId: id, ...updates }
    });

  } catch (error) {
    console.error('Admin update consultation error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新諮詢失敗'
    });
  }
});

/**
 * GET /api/consultations/types
 * 取得諮詢類型列表
 */
router.get('/meta/types', async (req, res) => {
  res.json({
    success: true,
    data: Object.entries(CONSULTATION_TYPES).map(([value, label]) => ({
      value,
      label
    }))
  });
});

/**
 * GET /api/consultations/statuses
 * 取得諮詢狀態列表
 */
router.get('/meta/statuses', async (req, res) => {
  res.json({
    success: true,
    data: Object.entries(CONSULTATION_STATUS).map(([value, label]) => ({
      value,
      label
    }))
  });
});

module.exports = router;
