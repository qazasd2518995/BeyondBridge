/**
 * 教師預警系統路由處理器
 * 提供學生狀態預警相關的 API
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../utils/auth');
const db = require('../utils/db');

/**
 * 獲取教師的學生預警列表
 * GET /api/teachers/alerts
 */
router.get('/alerts', authenticate, authorize(['educator', 'trainer', 'creator', 'admin']), async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const alerts = [];

    // 獲取教師的所有課程
    const courses = await db.query(`
      SELECT c.*,
             (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id AND e.status = 'active') as student_count
      FROM courses c
      WHERE c.instructor_id = ? AND c.status = 'active'
    `, [teacherId]);

    if (!courses || courses.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const courseIds = courses.map(c => c.course_id);

    // 1. 進度落後警示 - 低於平均進度 20%
    const behindStudents = await db.query(`
      SELECT
        u.user_id,
        u.display_name,
        u.email,
        e.course_id,
        c.title as course_title,
        COALESCE(cp.progress, 0) as progress,
        (SELECT AVG(COALESCE(cp2.progress, 0)) FROM course_progress cp2
         JOIN enrollments e2 ON cp2.enrollment_id = e2.enrollment_id
         WHERE e2.course_id = e.course_id) as avg_progress
      FROM users u
      JOIN enrollments e ON u.user_id = e.user_id
      JOIN courses c ON e.course_id = c.course_id
      LEFT JOIN course_progress cp ON e.enrollment_id = cp.enrollment_id
      WHERE e.course_id IN (?) AND e.status = 'active'
      HAVING progress < (avg_progress - 20)
    `, [courseIds]);

    behindStudents?.forEach(student => {
      alerts.push({
        type: 'behind',
        alertId: `behind_${student.user_id}_${student.course_id}`,
        studentId: student.user_id,
        studentName: student.display_name,
        studentEmail: student.email,
        courseId: student.course_id,
        courseTitle: student.course_title,
        message: `進度落後平均 ${Math.round(student.avg_progress - student.progress)}%`,
        currentProgress: student.progress,
        avgProgress: student.avg_progress,
        severity: student.avg_progress - student.progress > 30 ? 'high' : 'medium',
        createdAt: new Date().toISOString()
      });
    });

    // 2. 未繳交作業警示 - 截止日期前 48 小時未提交
    const now = new Date();
    const twoDaysLater = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const missingAssignments = await db.query(`
      SELECT
        u.user_id,
        u.display_name,
        u.email,
        a.assignment_id,
        a.title as assignment_title,
        a.due_date,
        c.course_id,
        c.title as course_title
      FROM users u
      JOIN enrollments e ON u.user_id = e.user_id
      JOIN courses c ON e.course_id = c.course_id
      JOIN assignments a ON a.course_id = c.course_id
      LEFT JOIN submissions s ON s.assignment_id = a.assignment_id AND s.user_id = u.user_id
      WHERE e.course_id IN (?)
        AND e.status = 'active'
        AND a.due_date > ?
        AND a.due_date <= ?
        AND s.submission_id IS NULL
    `, [courseIds, now.toISOString(), twoDaysLater.toISOString()]);

    missingAssignments?.forEach(item => {
      const hoursLeft = Math.round((new Date(item.due_date) - now) / (1000 * 60 * 60));
      alerts.push({
        type: 'missing',
        alertId: `missing_${item.user_id}_${item.assignment_id}`,
        studentId: item.user_id,
        studentName: item.display_name,
        studentEmail: item.email,
        courseId: item.course_id,
        courseTitle: item.course_title,
        assignmentId: item.assignment_id,
        assignmentTitle: item.assignment_title,
        dueDate: item.due_date,
        message: `作業「${item.assignment_title}」將於 ${hoursLeft} 小時後截止，尚未提交`,
        severity: hoursLeft < 24 ? 'high' : 'medium',
        createdAt: new Date().toISOString()
      });
    });

    // 3. 長期未活動警示 - 超過 7 天未登入
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const inactiveStudents = await db.query(`
      SELECT
        u.user_id,
        u.display_name,
        u.email,
        u.last_login,
        e.course_id,
        c.title as course_title
      FROM users u
      JOIN enrollments e ON u.user_id = e.user_id
      JOIN courses c ON e.course_id = c.course_id
      WHERE e.course_id IN (?)
        AND e.status = 'active'
        AND (u.last_login IS NULL OR u.last_login < ?)
    `, [courseIds, sevenDaysAgo.toISOString()]);

    inactiveStudents?.forEach(student => {
      const daysSinceLogin = student.last_login
        ? Math.round((now - new Date(student.last_login)) / (1000 * 60 * 60 * 24))
        : null;

      alerts.push({
        type: 'inactive',
        alertId: `inactive_${student.user_id}`,
        studentId: student.user_id,
        studentName: student.display_name,
        studentEmail: student.email,
        courseId: student.course_id,
        courseTitle: student.course_title,
        message: daysSinceLogin ? `${daysSinceLogin} 天未登入` : '從未登入',
        lastLogin: student.last_login,
        severity: daysSinceLogin > 14 ? 'high' : 'medium',
        createdAt: new Date().toISOString()
      });
    });

    // 4. 成績下滑警示 - 連續 2 次成績低於平均
    const decliningGrades = await db.query(`
      SELECT
        u.user_id,
        u.display_name,
        u.email,
        c.course_id,
        c.title as course_title,
        (SELECT AVG(g.grade) FROM grades g WHERE g.user_id = u.user_id AND g.course_id = c.course_id ORDER BY g.created_at DESC LIMIT 2) as recent_avg,
        (SELECT AVG(g2.grade) FROM grades g2 WHERE g2.course_id = c.course_id) as course_avg
      FROM users u
      JOIN enrollments e ON u.user_id = e.user_id
      JOIN courses c ON e.course_id = c.course_id
      WHERE e.course_id IN (?) AND e.status = 'active'
      HAVING recent_avg < (course_avg * 0.8)
    `, [courseIds]);

    decliningGrades?.forEach(student => {
      alerts.push({
        type: 'declining',
        alertId: `declining_${student.user_id}_${student.course_id}`,
        studentId: student.user_id,
        studentName: student.display_name,
        studentEmail: student.email,
        courseId: student.course_id,
        courseTitle: student.course_title,
        message: `近期成績低於課程平均`,
        recentAvg: student.recent_avg,
        courseAvg: student.course_avg,
        severity: 'medium',
        createdAt: new Date().toISOString()
      });
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
router.post('/alerts/:alertId/dismiss', authenticate, authorize(['educator', 'trainer', 'creator', 'admin']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const teacherId = req.user.userId;
    const { note } = req.body;

    // 記錄已處理的預警
    await db.query(`
      INSERT INTO dismissed_alerts (alert_id, teacher_id, note, dismissed_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE dismissed_at = NOW(), note = ?
    `, [alertId, teacherId, note || '', note || '']);

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
router.get('/dashboard', authenticate, authorize(['educator', 'trainer', 'creator', 'admin']), async (req, res) => {
  try {
    const teacherId = req.user.userId;

    // 獲取課程統計
    const courseStats = await db.query(`
      SELECT
        COUNT(DISTINCT c.course_id) as total_courses,
        COUNT(DISTINCT e.user_id) as total_students,
        AVG(COALESCE(cp.progress, 0)) as avg_progress
      FROM courses c
      LEFT JOIN enrollments e ON c.course_id = e.course_id AND e.status = 'active'
      LEFT JOIN course_progress cp ON e.enrollment_id = cp.enrollment_id
      WHERE c.instructor_id = ? AND c.status = 'active'
    `, [teacherId]);

    // 獲取待處理事項
    const pendingAssignments = await db.query(`
      SELECT COUNT(*) as count
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.assignment_id
      JOIN courses c ON a.course_id = c.course_id
      WHERE c.instructor_id = ? AND s.status = 'submitted' AND s.grade IS NULL
    `, [teacherId]);

    const pendingQuizzes = await db.query(`
      SELECT COUNT(*) as count
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.quiz_id
      JOIN courses c ON q.course_id = c.course_id
      WHERE c.instructor_id = ? AND qa.status = 'completed' AND qa.reviewed = 0
    `, [teacherId]);

    const unrepliedPosts = await db.query(`
      SELECT COUNT(*) as count
      FROM forum_posts fp
      JOIN forums f ON fp.forum_id = f.forum_id
      JOIN courses c ON f.course_id = c.course_id
      WHERE c.instructor_id = ? AND fp.reply_count = 0
    `, [teacherId]);

    // 獲取本週提交數
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weeklySubmissions = await db.query(`
      SELECT COUNT(*) as count
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.assignment_id
      JOIN courses c ON a.course_id = c.course_id
      WHERE c.instructor_id = ? AND s.submitted_at > ?
    `, [teacherId, oneWeekAgo.toISOString()]);

    res.json({
      success: true,
      data: {
        totalCourses: courseStats[0]?.total_courses || 0,
        totalStudents: courseStats[0]?.total_students || 0,
        avgProgress: Math.round(courseStats[0]?.avg_progress || 0),
        pendingAssignments: pendingAssignments[0]?.count || 0,
        pendingQuizzes: pendingQuizzes[0]?.count || 0,
        unrepliedPosts: unrepliedPosts[0]?.count || 0,
        weeklySubmissions: weeklySubmissions[0]?.count || 0
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
