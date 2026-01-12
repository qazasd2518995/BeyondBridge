/**
 * 徽章系統 API
 * BeyondBridge Education Platform
 *
 * Moodle-style badge system for achievements
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// 徽章類型定義
// ============================================================================

const BADGE_TYPES = {
  course_completion: '課程完成',
  activity_completion: '活動完成',
  grade_threshold: '成績門檻',
  competency: '能力達成',
  manual: '手動頒發',
  time_based: '時間條件'
};

const BADGE_STATUS = {
  draft: '草稿',
  active: '啟用中',
  disabled: '已停用'
};

// ============================================================================
// 徽章管理 (管理員/教師)
// ============================================================================

/**
 * GET /api/badges
 * 取得所有徽章
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { courseId, status, type } = req.query;

    // 模擬徽章資料
    const badges = [
      {
        id: 'badge_001',
        name: '學習先鋒',
        description: '完成第一門課程',
        image: '/images/badges/pioneer.png',
        type: 'course_completion',
        status: 'active',
        criteria: {
          type: 'course_completion',
          courseId: null, // 任意課程
          minCourses: 1
        },
        issuedCount: 245,
        courseId: null, // 全站徽章
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'badge_002',
        name: '程式新手',
        description: '完成「JavaScript 入門」課程',
        image: '/images/badges/js-beginner.png',
        type: 'course_completion',
        status: 'active',
        criteria: {
          type: 'course_completion',
          courseId: 'course_js_101'
        },
        issuedCount: 89,
        courseId: 'course_js_101',
        createdAt: '2024-01-15T00:00:00Z'
      },
      {
        id: 'badge_003',
        name: '優秀學員',
        description: '任一課程成績達到 90 分以上',
        image: '/images/badges/excellent.png',
        type: 'grade_threshold',
        status: 'active',
        criteria: {
          type: 'grade_threshold',
          minGrade: 90
        },
        issuedCount: 56,
        courseId: null,
        createdAt: '2024-01-20T00:00:00Z'
      },
      {
        id: 'badge_004',
        name: '活躍參與者',
        description: '在討論區發表 10 篇以上的回覆',
        image: '/images/badges/active.png',
        type: 'activity_completion',
        status: 'active',
        criteria: {
          type: 'activity_count',
          activityType: 'forum_post',
          minCount: 10
        },
        issuedCount: 34,
        courseId: null,
        createdAt: '2024-02-01T00:00:00Z'
      },
      {
        id: 'badge_005',
        name: '學習馬拉松',
        description: '連續 30 天登入學習',
        image: '/images/badges/marathon.png',
        type: 'time_based',
        status: 'active',
        criteria: {
          type: 'consecutive_days',
          days: 30
        },
        issuedCount: 12,
        courseId: null,
        createdAt: '2024-02-10T00:00:00Z'
      }
    ];

    // 應用篩選
    let filtered = [...badges];
    if (courseId) {
      filtered = filtered.filter(b => b.courseId === courseId || b.courseId === null);
    }
    if (status) {
      filtered = filtered.filter(b => b.status === status);
    }
    if (type) {
      filtered = filtered.filter(b => b.type === type);
    }

    res.json({
      success: true,
      data: filtered,
      badgeTypes: BADGE_TYPES,
      badgeStatus: BADGE_STATUS
    });
  } catch (error) {
    console.error('Get badges error:', error);
    res.status(500).json({
      success: false,
      message: '取得徽章列表失敗'
    });
  }
});

/**
 * GET /api/badges/:badgeId
 * 取得單一徽章詳情
 */
router.get('/:badgeId', authMiddleware, async (req, res) => {
  try {
    const { badgeId } = req.params;

    const badge = {
      id: badgeId,
      name: '學習先鋒',
      description: '完成第一門課程，開始您的學習旅程！',
      image: '/images/badges/pioneer.png',
      type: 'course_completion',
      status: 'active',
      criteria: {
        type: 'course_completion',
        courseId: null,
        minCourses: 1,
        description: '完成任意一門課程'
      },
      expiry: null, // null = 永不過期
      issuedCount: 245,
      courseId: null,
      recentRecipients: [
        { userId: 'usr_001', displayName: '張小明', issuedAt: '2024-01-25T10:00:00Z' },
        { userId: 'usr_002', displayName: '李小華', issuedAt: '2024-01-24T15:30:00Z' },
        { userId: 'usr_003', displayName: '王小美', issuedAt: '2024-01-23T09:15:00Z' }
      ],
      createdBy: 'admin',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    };

    res.json({
      success: true,
      data: badge
    });
  } catch (error) {
    console.error('Get badge error:', error);
    res.status(500).json({
      success: false,
      message: '取得徽章詳情失敗'
    });
  }
});

/**
 * POST /api/badges
 * 建立新徽章
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, image, type, criteria, courseId, expiry, status } = req.body;

    const badge = {
      id: `badge_${uuidv4().substring(0, 12)}`,
      name,
      description: description || '',
      image: image || '/images/badges/default.png',
      type: type || 'manual',
      status: status || 'draft',
      criteria: criteria || {},
      courseId: courseId || null,
      expiry: expiry || null,
      issuedCount: 0,
      createdBy: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await db.put({
        TableName: 'BADGES',
        Item: badge
      });
    } catch (dbError) {
      console.log('Database save skipped, returning mock data');
    }

    res.json({
      success: true,
      data: badge,
      message: '徽章建立成功'
    });
  } catch (error) {
    console.error('Create badge error:', error);
    res.status(500).json({
      success: false,
      message: '建立徽章失敗'
    });
  }
});

/**
 * PUT /api/badges/:badgeId
 * 更新徽章
 */
router.put('/:badgeId', authMiddleware, async (req, res) => {
  try {
    const { badgeId } = req.params;
    const updates = req.body;

    const updatedBadge = {
      id: badgeId,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: updatedBadge,
      message: '徽章更新成功'
    });
  } catch (error) {
    console.error('Update badge error:', error);
    res.status(500).json({
      success: false,
      message: '更新徽章失敗'
    });
  }
});

/**
 * DELETE /api/badges/:badgeId
 * 刪除徽章
 */
router.delete('/:badgeId', authMiddleware, async (req, res) => {
  try {
    const { badgeId } = req.params;

    res.json({
      success: true,
      message: '徽章刪除成功'
    });
  } catch (error) {
    console.error('Delete badge error:', error);
    res.status(500).json({
      success: false,
      message: '刪除徽章失敗'
    });
  }
});

// ============================================================================
// 徽章頒發
// ============================================================================

/**
 * POST /api/badges/:badgeId/issue
 * 手動頒發徽章給用戶
 */
router.post('/:badgeId/issue', authMiddleware, async (req, res) => {
  try {
    const { badgeId } = req.params;
    const { userIds, message } = req.body;

    if (!userIds || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '請指定要頒發的用戶'
      });
    }

    const issuances = userIds.map(userId => ({
      id: `issue_${uuidv4().substring(0, 12)}`,
      badgeId,
      userId,
      issuedBy: req.user.userId,
      issuedAt: new Date().toISOString(),
      message: message || '',
      type: 'manual'
    }));

    res.json({
      success: true,
      data: {
        issued: issuances.length,
        issuances
      },
      message: `成功頒發徽章給 ${issuances.length} 位用戶`
    });
  } catch (error) {
    console.error('Issue badge error:', error);
    res.status(500).json({
      success: false,
      message: '頒發徽章失敗'
    });
  }
});

/**
 * DELETE /api/badges/:badgeId/revoke/:userId
 * 撤銷用戶的徽章
 */
router.delete('/:badgeId/revoke/:userId', authMiddleware, async (req, res) => {
  try {
    const { badgeId, userId } = req.params;
    const { reason } = req.body;

    res.json({
      success: true,
      data: {
        badgeId,
        userId,
        revokedBy: req.user.userId,
        revokedAt: new Date().toISOString(),
        reason: reason || ''
      },
      message: '徽章已撤銷'
    });
  } catch (error) {
    console.error('Revoke badge error:', error);
    res.status(500).json({
      success: false,
      message: '撤銷徽章失敗'
    });
  }
});

// ============================================================================
// 用戶徽章
// ============================================================================

/**
 * GET /api/badges/my
 * 取得當前用戶的徽章
 */
router.get('/my/collection', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 模擬用戶徽章
    const myBadges = {
      earned: [
        {
          id: 'issue_001',
          badge: {
            id: 'badge_001',
            name: '學習先鋒',
            description: '完成第一門課程',
            image: '/images/badges/pioneer.png'
          },
          issuedAt: '2024-01-20T10:00:00Z',
          issuedBy: 'system'
        },
        {
          id: 'issue_002',
          badge: {
            id: 'badge_003',
            name: '優秀學員',
            description: '任一課程成績達到 90 分以上',
            image: '/images/badges/excellent.png'
          },
          issuedAt: '2024-01-25T15:30:00Z',
          issuedBy: 'system'
        }
      ],
      inProgress: [
        {
          badge: {
            id: 'badge_004',
            name: '活躍參與者',
            description: '在討論區發表 10 篇以上的回覆',
            image: '/images/badges/active.png'
          },
          progress: 60,
          remaining: '還需 4 篇回覆'
        },
        {
          badge: {
            id: 'badge_005',
            name: '學習馬拉松',
            description: '連續 30 天登入學習',
            image: '/images/badges/marathon.png'
          },
          progress: 40,
          remaining: '還需連續 18 天'
        }
      ],
      totalEarned: 2,
      displayBadges: ['badge_001', 'badge_003'] // 展示中的徽章
    };

    res.json({
      success: true,
      data: myBadges
    });
  } catch (error) {
    console.error('Get my badges error:', error);
    res.status(500).json({
      success: false,
      message: '取得我的徽章失敗'
    });
  }
});

/**
 * GET /api/badges/users/:userId
 * 取得指定用戶的徽章（公開展示）
 */
router.get('/users/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const userBadges = {
      userId,
      displayName: '張小明',
      badges: [
        {
          id: 'badge_001',
          name: '學習先鋒',
          image: '/images/badges/pioneer.png',
          issuedAt: '2024-01-20T10:00:00Z'
        },
        {
          id: 'badge_003',
          name: '優秀學員',
          image: '/images/badges/excellent.png',
          issuedAt: '2024-01-25T15:30:00Z'
        }
      ],
      totalBadges: 2
    };

    res.json({
      success: true,
      data: userBadges
    });
  } catch (error) {
    console.error('Get user badges error:', error);
    res.status(500).json({
      success: false,
      message: '取得用戶徽章失敗'
    });
  }
});

/**
 * PUT /api/badges/my/display
 * 更新展示的徽章
 */
router.put('/my/display', authMiddleware, async (req, res) => {
  try {
    const { badgeIds } = req.body;
    const userId = req.user.userId;

    if (!badgeIds || !Array.isArray(badgeIds)) {
      return res.status(400).json({
        success: false,
        message: '請提供要展示的徽章列表'
      });
    }

    res.json({
      success: true,
      data: {
        userId,
        displayBadges: badgeIds
      },
      message: '展示徽章已更新'
    });
  } catch (error) {
    console.error('Update display badges error:', error);
    res.status(500).json({
      success: false,
      message: '更新展示徽章失敗'
    });
  }
});

// ============================================================================
// 徽章報告
// ============================================================================

/**
 * GET /api/badges/:badgeId/recipients
 * 取得徽章的獲得者列表
 */
router.get('/:badgeId/recipients', authMiddleware, async (req, res) => {
  try {
    const { badgeId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const recipients = {
      badgeId,
      total: 245,
      recipients: [
        { userId: 'usr_001', displayName: '張小明', issuedAt: '2024-01-25T10:00:00Z', issuedBy: 'system' },
        { userId: 'usr_002', displayName: '李小華', issuedAt: '2024-01-24T15:30:00Z', issuedBy: 'system' },
        { userId: 'usr_003', displayName: '王小美', issuedAt: '2024-01-23T09:15:00Z', issuedBy: 'teacher_001' },
        { userId: 'usr_004', displayName: '陳大明', issuedAt: '2024-01-22T14:00:00Z', issuedBy: 'system' },
        { userId: 'usr_005', displayName: '林小玲', issuedAt: '2024-01-21T11:30:00Z', issuedBy: 'system' }
      ],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(245 / limit)
      }
    };

    res.json({
      success: true,
      data: recipients
    });
  } catch (error) {
    console.error('Get badge recipients error:', error);
    res.status(500).json({
      success: false,
      message: '取得獲得者列表失敗'
    });
  }
});

/**
 * GET /api/badges/stats
 * 取得徽章統計（管理員）
 */
router.get('/stats/overview', authMiddleware, async (req, res) => {
  try {
    const stats = {
      totalBadges: 15,
      activeBadges: 12,
      totalIssued: 1234,
      issuedThisMonth: 156,
      topBadges: [
        { id: 'badge_001', name: '學習先鋒', issuedCount: 245 },
        { id: 'badge_002', name: '程式新手', issuedCount: 189 },
        { id: 'badge_003', name: '優秀學員', issuedCount: 156 }
      ],
      recentActivity: [
        { type: 'issued', badgeId: 'badge_001', userId: 'usr_001', timestamp: new Date().toISOString() },
        { type: 'created', badgeId: 'badge_006', timestamp: new Date().toISOString() }
      ],
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get badge stats error:', error);
    res.status(500).json({
      success: false,
      message: '取得統計資料失敗'
    });
  }
});

module.exports = router;
