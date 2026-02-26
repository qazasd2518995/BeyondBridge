/**
 * 教師預警系統路由處理器
 * 提供學生狀態預警相關的 API
 *
 * 使用 DynamoDB 作為資料來源
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../utils/auth');
const db = require('../utils/db');

/**
 * 獲取教師的學生預警列表
 * GET /api/teachers/alerts
 */
router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const alerts = [];

    // 從 DynamoDB 獲取教師的所有課程
    const courses = await db.scan({
      filter: {
        expression: 'entityType = :type AND (instructorId = :teacherId OR creatorId = :teacherId)',
        values: {
          ':type': 'COURSE',
          ':teacherId': teacherId
        }
      }
    });

    if (!courses || courses.length === 0) {
      // 如果沒有課程，返回空的預警列表
      return res.json({
        success: true,
        data: [],
        summary: {
          total: 0,
          behind: 0,
          missing: 0,
          inactive: 0,
          declining: 0,
          high: 0,
          medium: 0
        }
      });
    }

    // 模擬一些預警資料（實際應從學生活動和成績計算）
    // 在實際生產環境中，這裡會查詢學生的進度、成績、活動記錄等
    const now = new Date();

    // 為每個課程生成一些示例預警
    courses.slice(0, 3).forEach((course, index) => {
      // 進度落後警示
      if (index === 0) {
        alerts.push({
          type: 'behind',
          alertId: `behind_student001_${course.courseId}`,
          studentId: 'student_001',
          studentName: '王小明',
          studentEmail: 'xiaoming@example.com',
          courseId: course.courseId,
          courseTitle: course.title,
          message: '進度落後平均 25%',
          currentProgress: 35,
          avgProgress: 60,
          severity: 'medium',
          createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
        });
      }

      // 長期未活動警示
      if (index <= 1) {
        alerts.push({
          type: 'inactive',
          alertId: `inactive_student002_${course.courseId}`,
          studentId: 'student_002',
          studentName: '李小華',
          studentEmail: 'xiaohua@example.com',
          courseId: course.courseId,
          courseTitle: course.title,
          message: '10 天未登入',
          lastLogin: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          severity: 'high',
          createdAt: now.toISOString()
        });
      }
    });

    // 按嚴重程度和時間排序
    alerts.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      success: true,
      data: alerts,
      summary: {
        total: alerts.length,
        behind: alerts.filter(a => a.type === 'behind').length,
        missing: alerts.filter(a => a.type === 'missing').length,
        inactive: alerts.filter(a => a.type === 'inactive').length,
        declining: alerts.filter(a => a.type === 'declining').length,
        high: alerts.filter(a => a.severity === 'high').length,
        medium: alerts.filter(a => a.severity === 'medium').length
      }
    });

  } catch (error) {
    console.error('Get teacher alerts error:', error);
    res.status(500).json({
      success: false,
      message: '獲取學生預警失敗',
      error: error.message
    });
  }
});

/**
 * 標記預警為已處理
 * POST /api/teachers/alerts/:alertId/dismiss
 */
router.post('/alerts/:alertId/dismiss', authMiddleware, async (req, res) => {
  try {
    const { alertId } = req.params;
    const teacherId = req.user.userId;
    const { note } = req.body;
    const now = new Date().toISOString();

    // 記錄已處理的預警到 DynamoDB
    await db.putItem({
      PK: `TEACHER#${teacherId}`,
      SK: `DISMISSED_ALERT#${alertId}`,
      entityType: 'DISMISSED_ALERT',
      alertId,
      teacherId,
      note: note || '',
      dismissedAt: now
    });

    res.json({
      success: true,
      message: '已標記為已處理'
    });

  } catch (error) {
    console.error('Dismiss alert error:', error);
    res.status(500).json({
      success: false,
      message: '標記失敗',
      error: error.message
    });
  }
});

/**
 * 獲取教師儀表板統計
 * GET /api/teachers/dashboard
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.user.userId;

    // 從 DynamoDB 獲取教師的課程
    const courses = await db.scan({
      filter: {
        expression: 'entityType = :type AND (instructorId = :teacherId OR creatorId = :teacherId)',
        values: {
          ':type': 'COURSE',
          ':teacherId': teacherId
        }
      }
    });

    // 計算統計數據
    const totalCourses = courses.length;
    let totalStudents = 0;
    let avgProgress = 0;

    // 實際應該查詢每個課程的報名人數和進度
    // 這裡使用課程資料中的 enrollmentCount
    courses.forEach(course => {
      totalStudents += course.enrollmentCount || 0;
      avgProgress += course.completionRate || 0;
    });

    if (totalCourses > 0) {
      avgProgress = Math.round((avgProgress / totalCourses) * 100);
    }

    res.json({
      success: true,
      data: {
        totalCourses,
        totalStudents,
        avgProgress,
        pendingAssignments: 0,  // 需要實際查詢
        pendingQuizzes: 0,      // 需要實際查詢
        unrepliedPosts: 0,      // 需要實際查詢
        weeklySubmissions: 0    // 需要實際查詢
      }
    });

  } catch (error) {
    console.error('Get teacher dashboard error:', error);
    res.status(500).json({
      success: false,
      message: '獲取儀表板統計失敗',
      error: error.message
    });
  }
});

module.exports = router;
