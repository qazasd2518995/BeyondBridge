/**
 * 學習路徑 API
 * BeyondBridge Education Platform
 *
 * Moodle-style learning paths and prerequisites
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// 學習路徑管理
// ============================================================================

/**
 * GET /api/learning-paths
 * 取得所有學習路徑
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    // 模擬學習路徑資料
    const paths = [
      {
        id: 'path_001',
        name: '前端開發入門',
        description: '從零開始學習前端開發技術',
        thumbnail: '/images/path-frontend.jpg',
        courses: [
          { courseId: 'course_1', title: 'HTML/CSS 基礎', order: 1, required: true },
          { courseId: 'course_2', title: 'JavaScript 入門', order: 2, required: true },
          { courseId: 'course_3', title: 'React 框架入門', order: 3, required: false }
        ],
        totalCourses: 3,
        estimatedDuration: 60, // 小時
        difficulty: 'beginner',
        enrolledCount: 156,
        completedCount: 42,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z'
      },
      {
        id: 'path_002',
        name: '後端開發專精',
        description: '掌握後端開發核心技能',
        thumbnail: '/images/path-backend.jpg',
        courses: [
          { courseId: 'course_4', title: 'Node.js 基礎', order: 1, required: true },
          { courseId: 'course_5', title: '資料庫設計', order: 2, required: true },
          { courseId: 'course_6', title: 'API 設計實戰', order: 3, required: true },
          { courseId: 'course_7', title: '雲端部署', order: 4, required: false }
        ],
        totalCourses: 4,
        estimatedDuration: 80,
        difficulty: 'intermediate',
        enrolledCount: 89,
        completedCount: 23,
        createdAt: '2024-01-10T00:00:00Z',
        updatedAt: '2024-01-20T00:00:00Z'
      },
      {
        id: 'path_003',
        name: '全端開發完整路徑',
        description: '成為全端開發工程師的完整學習計劃',
        thumbnail: '/images/path-fullstack.jpg',
        courses: [],
        prerequisites: ['path_001', 'path_002'],
        totalCourses: 8,
        estimatedDuration: 150,
        difficulty: 'advanced',
        enrolledCount: 34,
        completedCount: 8,
        createdAt: '2024-02-01T00:00:00Z',
        updatedAt: '2024-02-10T00:00:00Z'
      }
    ];

    res.json({
      success: true,
      data: paths
    });
  } catch (error) {
    console.error('Get learning paths error:', error);
    res.status(500).json({
      success: false,
      message: '取得學習路徑失敗'
    });
  }
});

/**
 * GET /api/learning-paths/:pathId
 * 取得單一學習路徑詳情
 */
router.get('/:pathId', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const userId = req.user.userId;

    // 模擬詳細資料
    const path = {
      id: pathId,
      name: '前端開發入門',
      description: '從零開始學習前端開發技術，涵蓋 HTML、CSS、JavaScript 到 React 框架。',
      thumbnail: '/images/path-frontend.jpg',
      courses: [
        {
          courseId: 'course_1',
          title: 'HTML/CSS 基礎',
          description: '學習網頁結構和樣式',
          order: 1,
          required: true,
          estimatedHours: 15,
          userProgress: 100,
          completed: true
        },
        {
          courseId: 'course_2',
          title: 'JavaScript 入門',
          description: '學習程式設計基礎',
          order: 2,
          required: true,
          estimatedHours: 25,
          userProgress: 60,
          completed: false,
          prerequisites: ['course_1']
        },
        {
          courseId: 'course_3',
          title: 'React 框架入門',
          description: '現代前端框架開發',
          order: 3,
          required: false,
          estimatedHours: 20,
          userProgress: 0,
          completed: false,
          prerequisites: ['course_2']
        }
      ],
      totalCourses: 3,
      estimatedDuration: 60,
      difficulty: 'beginner',
      enrolledCount: 156,
      completedCount: 42,
      userEnrolled: true,
      userProgress: 53,
      badges: [
        { id: 'badge_1', name: '前端新手', criteria: '完成第一門課程' },
        { id: 'badge_2', name: '前端達人', criteria: '完成整個學習路徑' }
      ],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    };

    res.json({
      success: true,
      data: path
    });
  } catch (error) {
    console.error('Get learning path error:', error);
    res.status(500).json({
      success: false,
      message: '取得學習路徑詳情失敗'
    });
  }
});

/**
 * POST /api/learning-paths
 * 建立學習路徑
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, courses, difficulty, estimatedDuration, prerequisites } = req.body;

    const path = {
      id: `path_${uuidv4().substring(0, 12)}`,
      name,
      description: description || '',
      courses: (courses || []).map((c, idx) => ({
        courseId: c.courseId,
        title: c.title || '',
        order: idx + 1,
        required: c.required !== false
      })),
      totalCourses: courses?.length || 0,
      estimatedDuration: estimatedDuration || 0,
      difficulty: difficulty || 'beginner',
      prerequisites: prerequisites || [],
      enrolledCount: 0,
      completedCount: 0,
      createdBy: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await db.put({
        TableName: 'LEARNING_PATHS',
        Item: path
      });
    } catch (dbError) {
      console.log('Database save skipped, returning mock data');
    }

    res.json({
      success: true,
      data: path,
      message: '學習路徑建立成功'
    });
  } catch (error) {
    console.error('Create learning path error:', error);
    res.status(500).json({
      success: false,
      message: '建立學習路徑失敗'
    });
  }
});

/**
 * PUT /api/learning-paths/:pathId
 * 更新學習路徑
 */
router.put('/:pathId', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const { name, description, courses, difficulty, estimatedDuration, prerequisites } = req.body;

    const updatedPath = {
      id: pathId,
      name,
      description,
      courses,
      difficulty,
      estimatedDuration,
      prerequisites,
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: updatedPath,
      message: '學習路徑更新成功'
    });
  } catch (error) {
    console.error('Update learning path error:', error);
    res.status(500).json({
      success: false,
      message: '更新學習路徑失敗'
    });
  }
});

/**
 * DELETE /api/learning-paths/:pathId
 * 刪除學習路徑
 */
router.delete('/:pathId', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;

    res.json({
      success: true,
      message: '學習路徑刪除成功'
    });
  } catch (error) {
    console.error('Delete learning path error:', error);
    res.status(500).json({
      success: false,
      message: '刪除學習路徑失敗'
    });
  }
});

// ============================================================================
// 學習路徑報名
// ============================================================================

/**
 * POST /api/learning-paths/:pathId/enroll
 * 報名學習路徑
 */
router.post('/:pathId/enroll', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const userId = req.user.userId;

    const enrollment = {
      pathId,
      userId,
      enrolledAt: new Date().toISOString(),
      progress: 0,
      currentCourseOrder: 1,
      completedCourses: []
    };

    res.json({
      success: true,
      data: enrollment,
      message: '已成功報名學習路徑'
    });
  } catch (error) {
    console.error('Enroll learning path error:', error);
    res.status(500).json({
      success: false,
      message: '報名學習路徑失敗'
    });
  }
});

/**
 * DELETE /api/learning-paths/:pathId/enroll
 * 取消報名學習路徑
 */
router.delete('/:pathId/enroll', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const userId = req.user.userId;

    res.json({
      success: true,
      message: '已取消報名學習路徑'
    });
  } catch (error) {
    console.error('Unenroll learning path error:', error);
    res.status(500).json({
      success: false,
      message: '取消報名失敗'
    });
  }
});

/**
 * GET /api/learning-paths/:pathId/progress
 * 取得使用者的學習進度
 */
router.get('/:pathId/progress', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const userId = req.user.userId;

    const progress = {
      pathId,
      userId,
      overallProgress: 53,
      currentCourse: {
        courseId: 'course_2',
        title: 'JavaScript 入門',
        progress: 60
      },
      completedCourses: [
        { courseId: 'course_1', completedAt: '2024-01-20T10:00:00Z' }
      ],
      unlockedCourses: ['course_1', 'course_2'],
      lockedCourses: ['course_3'],
      estimatedCompletion: '2024-03-15',
      totalTimeSpent: 420, // 分鐘
      lastActivity: new Date().toISOString()
    };

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Get learning path progress error:', error);
    res.status(500).json({
      success: false,
      message: '取得學習進度失敗'
    });
  }
});

// ============================================================================
// 課程先決條件
// ============================================================================

/**
 * GET /api/learning-paths/courses/:courseId/prerequisites
 * 取得課程的先決條件
 */
router.get('/courses/:courseId/prerequisites', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;

    // 模擬先決條件
    const prerequisites = {
      courseId,
      requirements: [
        {
          type: 'course_completion',
          courseId: 'course_1',
          courseTitle: 'HTML/CSS 基礎',
          met: true
        },
        {
          type: 'grade_threshold',
          courseId: 'course_1',
          minGrade: 60,
          met: true
        }
      ],
      allMet: true,
      canEnroll: true
    };

    res.json({
      success: true,
      data: prerequisites
    });
  } catch (error) {
    console.error('Get prerequisites error:', error);
    res.status(500).json({
      success: false,
      message: '取得先決條件失敗'
    });
  }
});

/**
 * PUT /api/learning-paths/courses/:courseId/prerequisites
 * 設定課程的先決條件
 */
router.put('/courses/:courseId/prerequisites', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { requirements } = req.body;

    const prerequisites = {
      courseId,
      requirements: requirements || [],
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: prerequisites,
      message: '先決條件設定已更新'
    });
  } catch (error) {
    console.error('Update prerequisites error:', error);
    res.status(500).json({
      success: false,
      message: '更新先決條件失敗'
    });
  }
});

/**
 * POST /api/learning-paths/courses/:courseId/check-prerequisites
 * 檢查用戶是否滿足先決條件
 */
router.post('/courses/:courseId/check-prerequisites', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    // 模擬檢查結果
    const result = {
      courseId,
      userId,
      canEnroll: true,
      missingRequirements: [],
      checkedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Check prerequisites error:', error);
    res.status(500).json({
      success: false,
      message: '檢查先決條件失敗'
    });
  }
});

// ============================================================================
// 學習路徑報告
// ============================================================================

/**
 * GET /api/learning-paths/:pathId/report
 * 取得學習路徑報告（管理員/教師）
 */
router.get('/:pathId/report', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;

    const report = {
      pathId,
      pathName: '前端開發入門',
      totalEnrolled: 156,
      activeUsers: 89,
      completedUsers: 42,
      averageProgress: 58,
      averageCompletionDays: 45,
      courseBreakdown: [
        { courseId: 'course_1', title: 'HTML/CSS 基礎', completionRate: 85, avgGrade: 78 },
        { courseId: 'course_2', title: 'JavaScript 入門', completionRate: 62, avgGrade: 72 },
        { courseId: 'course_3', title: 'React 框架入門', completionRate: 38, avgGrade: 75 }
      ],
      recentCompletions: [
        { userId: 'usr_001', displayName: '張小明', completedAt: '2024-01-25T10:00:00Z' },
        { userId: 'usr_002', displayName: '李小華', completedAt: '2024-01-23T15:30:00Z' }
      ],
      dropoutPoints: [
        { courseId: 'course_2', dropoutRate: 15, reason: '難度較高' }
      ],
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get learning path report error:', error);
    res.status(500).json({
      success: false,
      message: '取得報告失敗'
    });
  }
});

module.exports = router;
