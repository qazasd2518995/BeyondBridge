/**
 * 課程完成條件 API
 * BeyondBridge Education Platform
 *
 * Moodle-style course completion tracking
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// 課程完成設定
// ============================================================================

/**
 * GET /api/course-completion/:courseId/settings
 * 取得課程完成條件設定
 */
router.get('/:courseId/settings', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;

    // 模擬完成條件設定
    const settings = {
      courseId,
      enabled: true,
      aggregation: 'all', // 'all' = 全部達成, 'any' = 任一達成
      criteria: [
        {
          id: 'crit_1',
          type: 'activity_completion',
          description: '完成所有指定活動',
          required: true,
          activities: [
            { id: 'act_1', name: '第一章測驗', type: 'quiz', completed: false },
            { id: 'act_2', name: '作業一', type: 'assignment', completed: false },
            { id: 'act_3', name: '期中考', type: 'quiz', completed: false }
          ]
        },
        {
          id: 'crit_2',
          type: 'grade_threshold',
          description: '總成績達到及格標準',
          required: true,
          threshold: 60
        },
        {
          id: 'crit_3',
          type: 'duration',
          description: '課程學習時間',
          required: false,
          minDuration: 600 // 分鐘
        },
        {
          id: 'crit_4',
          type: 'self_completion',
          description: '學生自我標記完成',
          required: false
        }
      ],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    };

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get completion settings error:', error);
    res.status(500).json({
      success: false,
      message: '取得完成條件設定失敗'
    });
  }
});

/**
 * PUT /api/course-completion/:courseId/settings
 * 更新課程完成條件設定
 */
router.put('/:courseId/settings', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { enabled, aggregation, criteria } = req.body;

    const settings = {
      courseId,
      enabled: enabled !== false,
      aggregation: aggregation || 'all',
      criteria: criteria || [],
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: settings,
      message: '完成條件設定已更新'
    });
  } catch (error) {
    console.error('Update completion settings error:', error);
    res.status(500).json({
      success: false,
      message: '更新完成條件設定失敗'
    });
  }
});

// ============================================================================
// 學生完成狀態
// ============================================================================

/**
 * GET /api/course-completion/:courseId/status
 * 取得當前用戶的課程完成狀態
 */
router.get('/:courseId/status', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    // 模擬完成狀態
    const status = {
      courseId,
      userId,
      isCompleted: false,
      completedAt: null,
      progress: 65, // 百分比
      criteriaStatus: [
        {
          id: 'crit_1',
          type: 'activity_completion',
          description: '完成所有指定活動',
          met: false,
          progress: 66,
          details: '2/3 活動已完成'
        },
        {
          id: 'crit_2',
          type: 'grade_threshold',
          description: '總成績達到及格標準',
          met: true,
          progress: 100,
          details: '目前成績: 75 分'
        },
        {
          id: 'crit_3',
          type: 'duration',
          description: '課程學習時間',
          met: false,
          progress: 45,
          details: '270/600 分鐘'
        }
      ],
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Get completion status error:', error);
    res.status(500).json({
      success: false,
      message: '取得完成狀態失敗'
    });
  }
});

/**
 * POST /api/course-completion/:courseId/self-mark
 * 學生自我標記課程完成
 */
router.post('/:courseId/self-mark', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    // 實際實現時需要檢查是否啟用自我標記功能

    res.json({
      success: true,
      data: {
        courseId,
        userId,
        selfMarked: true,
        markedAt: new Date().toISOString()
      },
      message: '已標記課程為完成'
    });
  } catch (error) {
    console.error('Self mark completion error:', error);
    res.status(500).json({
      success: false,
      message: '標記完成失敗'
    });
  }
});

/**
 * POST /api/course-completion/:courseId/manual-mark
 * 教師手動標記學生完成
 */
router.post('/:courseId/manual-mark', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userId, completed } = req.body;

    res.json({
      success: true,
      data: {
        courseId,
        userId,
        completed,
        markedBy: req.user.userId,
        markedAt: new Date().toISOString()
      },
      message: completed ? '已標記為完成' : '已取消完成標記'
    });
  } catch (error) {
    console.error('Manual mark completion error:', error);
    res.status(500).json({
      success: false,
      message: '手動標記失敗'
    });
  }
});

/**
 * GET /api/course-completion/:courseId/report
 * 取得課程完成報告（教師用）
 */
router.get('/:courseId/report', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;

    // 模擬完成報告
    const report = {
      courseId,
      totalStudents: 25,
      completedCount: 8,
      inProgressCount: 15,
      notStartedCount: 2,
      completionRate: 32,
      averageProgress: 58,
      students: [
        {
          userId: 'usr_001',
          displayName: '張小明',
          progress: 100,
          isCompleted: true,
          completedAt: '2024-01-20T10:00:00Z'
        },
        {
          userId: 'usr_002',
          displayName: '李小華',
          progress: 85,
          isCompleted: false,
          completedAt: null
        },
        {
          userId: 'usr_003',
          displayName: '王小美',
          progress: 60,
          isCompleted: false,
          completedAt: null
        }
      ],
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get completion report error:', error);
    res.status(500).json({
      success: false,
      message: '取得完成報告失敗'
    });
  }
});

module.exports = router;
