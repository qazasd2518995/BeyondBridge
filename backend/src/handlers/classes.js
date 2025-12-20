/**
 * 班級管理 API 處理器
 * 處理班級 CRUD、成員管理、作業指派等功能
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

/**
 * GET /api/classes
 * 取得班級列表（教師看自己的班級，學生看已加入的班級）
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isAdmin = req.user.isAdmin;

    let classes = [];

    if (isAdmin) {
      // 管理員可看所有班級
      classes = await db.scan({
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'CLASS' }
        }
      });
    } else {
      // 先查詢用戶創建的班級
      const ownedClasses = await db.scan({
        filter: {
          expression: 'entityType = :type AND teacherId = :teacherId',
          values: { ':type': 'CLASS', ':teacherId': userId }
        }
      });

      // 再查詢用戶加入的班級
      const enrollments = await db.query(`USER#${userId}`, { skPrefix: 'ENROLLMENT#' });
      const enrolledClassIds = enrollments.map(e => e.classId);

      // 取得已加入的班級資料
      const enrolledClasses = [];
      for (const classId of enrolledClassIds) {
        const classData = await db.getItem(`CLASS#${classId}`, 'META');
        if (classData) {
          classData.isEnrolled = true;
          enrolledClasses.push(classData);
        }
      }

      classes = [...ownedClasses, ...enrolledClasses];
    }

    res.json({
      success: true,
      data: classes
    });

  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得班級列表失敗'
    });
  }
});

/**
 * GET /api/classes/:id
 * 取得班級詳情
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const classData = await db.getItem(`CLASS#${id}`, 'META');

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'CLASS_NOT_FOUND',
        message: '找不到班級'
      });
    }

    // 取得班級成員
    const members = await db.query(`CLASS#${id}`, { skPrefix: 'MEMBER#' });

    // 取得班級作業
    const assignments = await db.query(`CLASS#${id}`, { skPrefix: 'ASSIGN#' });

    res.json({
      success: true,
      data: {
        ...classData,
        members,
        assignments
      }
    });

  } catch (error) {
    console.error('Get class error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得班級詳情失敗'
    });
  }
});

/**
 * POST /api/classes
 * 建立新班級
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, subject, gradeLevel } = req.body;
    const userId = req.user.userId;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供班級名稱'
      });
    }

    const classId = db.generateId('cls');
    const now = new Date().toISOString();
    const inviteCode = generateInviteCode();

    const newClass = {
      PK: `CLASS#${classId}`,
      SK: 'META',
      GSI1PK: `TEACHER#${userId}`,
      GSI1SK: `CLASS#${classId}`,
      entityType: 'CLASS',
      createdAt: now,

      classId,
      name,
      description: description || '',
      subject: subject || '一般課程',
      gradeLevel: gradeLevel || 'general',

      teacherId: userId,
      teacherName: req.user.displayName || '教師',

      inviteCode,
      memberCount: 0,
      assignmentCount: 0,

      status: 'active',
      updatedAt: now
    };

    await db.putItem(newClass);

    res.status(201).json({
      success: true,
      message: '班級已建立',
      data: newClass
    });

  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立班級失敗'
    });
  }
});

/**
 * PUT /api/classes/:id
 * 更新班級資訊
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, subject, gradeLevel, status } = req.body;

    const classData = await db.getItem(`CLASS#${id}`, 'META');
    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'CLASS_NOT_FOUND',
        message: '找不到班級'
      });
    }

    // 只有班級教師或管理員可以更新
    if (classData.teacherId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限修改此班級'
      });
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (subject) updates.subject = subject;
    if (gradeLevel) updates.gradeLevel = gradeLevel;
    if (status) updates.status = status;

    const updatedClass = await db.updateItem(`CLASS#${id}`, 'META', updates);

    res.json({
      success: true,
      message: '班級已更新',
      data: updatedClass
    });

  } catch (error) {
    console.error('Update class error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新班級失敗'
    });
  }
});

/**
 * DELETE /api/classes/:id
 * 刪除班級
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const classData = await db.getItem(`CLASS#${id}`, 'META');
    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'CLASS_NOT_FOUND',
        message: '找不到班級'
      });
    }

    if (classData.teacherId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限刪除此班級'
      });
    }

    // 軟刪除 - 標記為 archived
    await db.updateItem(`CLASS#${id}`, 'META', {
      status: 'archived',
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '班級已封存'
    });

  } catch (error) {
    console.error('Delete class error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除班級失敗'
    });
  }
});

/**
 * POST /api/classes/:id/join
 * 加入班級（使用邀請碼）
 */
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { inviteCode } = req.body;
    const userId = req.user.userId;

    const classData = await db.getItem(`CLASS#${id}`, 'META');
    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'CLASS_NOT_FOUND',
        message: '找不到班級'
      });
    }

    if (classData.inviteCode !== inviteCode) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CODE',
        message: '邀請碼錯誤'
      });
    }

    // 檢查是否已加入
    const existing = await db.getItem(`CLASS#${id}`, `MEMBER#${userId}`);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'ALREADY_JOINED',
        message: '您已加入此班級'
      });
    }

    const now = new Date().toISOString();

    // 建立班級成員關係
    const memberItem = {
      PK: `CLASS#${id}`,
      SK: `MEMBER#${userId}`,
      entityType: 'CLASS_MEMBER',
      createdAt: now,

      classId: id,
      userId,
      userName: req.user.displayName || '學生',
      userEmail: req.user.email,
      role: 'student',
      joinedAt: now,
      status: 'active'
    };

    await db.putItem(memberItem);

    // 同時在用戶下建立反向關係，方便查詢
    const enrollmentItem = {
      PK: `USER#${userId}`,
      SK: `ENROLLMENT#${id}`,
      entityType: 'ENROLLMENT',
      createdAt: now,

      userId,
      classId: id,
      className: classData.name,
      teacherName: classData.teacherName,
      enrolledAt: now
    };

    await db.putItem(enrollmentItem);

    // 更新班級成員數
    await db.updateItem(`CLASS#${id}`, 'META', {
      memberCount: (classData.memberCount || 0) + 1,
      updatedAt: now
    });

    res.json({
      success: true,
      message: '已成功加入班級',
      data: { classId: id, className: classData.name }
    });

  } catch (error) {
    console.error('Join class error:', error);
    res.status(500).json({
      success: false,
      error: 'JOIN_FAILED',
      message: '加入班級失敗'
    });
  }
});

/**
 * POST /api/classes/join-by-code
 * 使用邀請碼加入班級（不需要知道班級 ID）
 */
router.post('/join-by-code', authMiddleware, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user.userId;

    if (!inviteCode) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CODE',
        message: '請提供邀請碼'
      });
    }

    // 搜尋對應的班級
    const classes = await db.scan({
      filter: {
        expression: 'entityType = :type AND inviteCode = :code AND #status = :status',
        values: { ':type': 'CLASS', ':code': inviteCode.toUpperCase(), ':status': 'active' },
        names: { '#status': 'status' }
      }
    });

    if (classes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_CODE',
        message: '無效的邀請碼'
      });
    }

    const classData = classes[0];
    const classId = classData.classId;

    // 檢查是否已加入
    const existing = await db.getItem(`CLASS#${classId}`, `MEMBER#${userId}`);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'ALREADY_JOINED',
        message: '您已加入此班級'
      });
    }

    const now = new Date().toISOString();

    // 建立班級成員關係
    const memberItem = {
      PK: `CLASS#${classId}`,
      SK: `MEMBER#${userId}`,
      entityType: 'CLASS_MEMBER',
      createdAt: now,

      classId,
      userId,
      userName: req.user.displayName || '學生',
      userEmail: req.user.email,
      role: 'student',
      joinedAt: now,
      status: 'active'
    };

    await db.putItem(memberItem);

    // 建立反向關係
    const enrollmentItem = {
      PK: `USER#${userId}`,
      SK: `ENROLLMENT#${classId}`,
      entityType: 'ENROLLMENT',
      createdAt: now,

      userId,
      classId,
      className: classData.name,
      teacherName: classData.teacherName,
      enrolledAt: now
    };

    await db.putItem(enrollmentItem);

    // 更新班級成員數
    await db.updateItem(`CLASS#${classId}`, 'META', {
      memberCount: (classData.memberCount || 0) + 1,
      updatedAt: now
    });

    res.json({
      success: true,
      message: '已成功加入班級',
      data: { classId, className: classData.name }
    });

  } catch (error) {
    console.error('Join by code error:', error);
    res.status(500).json({
      success: false,
      error: 'JOIN_FAILED',
      message: '加入班級失敗'
    });
  }
});

/**
 * DELETE /api/classes/:id/members/:userId
 * 移除班級成員
 */
router.delete('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { id, userId } = req.params;

    const classData = await db.getItem(`CLASS#${id}`, 'META');
    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'CLASS_NOT_FOUND',
        message: '找不到班級'
      });
    }

    // 只有班級教師或管理員可以移除成員
    if (classData.teacherId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限執行此操作'
      });
    }

    // 刪除成員關係
    await db.deleteItem(`CLASS#${id}`, `MEMBER#${userId}`);
    await db.deleteItem(`USER#${userId}`, `ENROLLMENT#${id}`);

    // 更新成員數
    await db.updateItem(`CLASS#${id}`, 'META', {
      memberCount: Math.max(0, (classData.memberCount || 1) - 1),
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '成員已移除'
    });

  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      success: false,
      error: 'REMOVE_FAILED',
      message: '移除成員失敗'
    });
  }
});

/**
 * POST /api/classes/:id/assignments
 * 建立班級作業/指派
 */
router.post('/:id/assignments', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, resourceId, quizId, description, dueDate, points } = req.body;

    const classData = await db.getItem(`CLASS#${id}`, 'META');
    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'CLASS_NOT_FOUND',
        message: '找不到班級'
      });
    }

    if (classData.teacherId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限建立作業'
      });
    }

    if (!title || !type) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供作業標題和類型'
      });
    }

    const assignmentId = db.generateId('asg');
    const now = new Date().toISOString();

    const assignment = {
      PK: `CLASS#${id}`,
      SK: `ASSIGN#${assignmentId}`,
      GSI1PK: `ASSIGN#${type}`,
      GSI1SK: now,
      entityType: 'CLASS_ASSIGNMENT',
      createdAt: now,

      assignmentId,
      classId: id,
      title,
      description: description || '',
      type, // 'material', 'quiz', 'practice', 'exam'

      resourceId: resourceId || null,
      quizId: quizId || null,

      dueDate: dueDate || null,
      points: points || 0,

      submissionCount: 0,
      status: 'active',
      createdBy: req.user.userId,
      updatedAt: now
    };

    await db.putItem(assignment);

    // 更新作業數
    await db.updateItem(`CLASS#${id}`, 'META', {
      assignmentCount: (classData.assignmentCount || 0) + 1,
      updatedAt: now
    });

    res.status(201).json({
      success: true,
      message: '作業已建立',
      data: assignment
    });

  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立作業失敗'
    });
  }
});

/**
 * GET /api/classes/:id/assignments
 * 取得班級作業列表
 */
router.get('/:id/assignments', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    const assignments = await db.query(`CLASS#${id}`, { skPrefix: 'ASSIGN#' });

    // 如果有指定類型，進行篩選
    const filtered = type
      ? assignments.filter(a => a.type === type)
      : assignments;

    res.json({
      success: true,
      data: filtered
    });

  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得作業列表失敗'
    });
  }
});

/**
 * DELETE /api/classes/:classId/assignments/:assignmentId
 * 刪除作業
 */
router.delete('/:classId/assignments/:assignmentId', authMiddleware, async (req, res) => {
  try {
    const { classId, assignmentId } = req.params;

    const classData = await db.getItem(`CLASS#${classId}`, 'META');
    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'CLASS_NOT_FOUND',
        message: '找不到班級'
      });
    }

    if (classData.teacherId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限刪除作業'
      });
    }

    await db.deleteItem(`CLASS#${classId}`, `ASSIGN#${assignmentId}`);

    // 更新作業數
    await db.updateItem(`CLASS#${classId}`, 'META', {
      assignmentCount: Math.max(0, (classData.assignmentCount || 1) - 1),
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '作業已刪除'
    });

  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除作業失敗'
    });
  }
});

/**
 * 產生邀請碼
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = router;
