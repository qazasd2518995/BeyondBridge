/**
 * 測驗報表
 * BeyondBridge Education Platform - Quiz Reports & Teacher Statistics
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse } = require('../../utils/course-access');
const {
  buildTeacherQuizAnalytics,
  buildTeacherAnalyticsCsv
} = require('./analytics');

function isQuizAttemptFinalForAnalytics(attempt = {}) {
  return attempt.status === 'completed' &&
    !attempt.needsManualGrading &&
    !['pending', 'partial'].includes(String(attempt.manualGradingStatus || '').toLowerCase()) &&
    Number.isFinite(Number(attempt.percentage));
}

// ==================== 教師報表 ====================

/**
 * GET /api/quizzes/:id/results
 * 取得測驗結果報表（教師用）
 */
router.get('/:id/results', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到此測驗'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${quiz.courseId}`, 'META');
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看測驗結果'
      });
    }

    // 取得所有作答記錄
    const attempts = await db.query(`QUIZ#${id}`, { skPrefix: 'ATTEMPT#' });
    const completedAttempts = attempts.filter(a => a.status === 'completed');

    // 取得用戶資訊
    const attemptsWithUser = await Promise.all(
      completedAttempts.map(async (a) => {
        const user = await db.getUser(a.userId);
        const { PK, SK, ...attempt } = a;
        return {
          ...attempt,
          userName: user?.displayName || '未知用戶',
          userEmail: user?.email
        };
      })
    );

    const analyticsAttempts = attemptsWithUser.filter(isQuizAttemptFinalForAnalytics);
    const analytics = buildTeacherQuizAnalytics(quiz, analyticsAttempts);
    const questionStats = analytics.sections.flatMap(section =>
      (section.questionStats || []).map(question => ({
        ...question,
        sectionId: section.sectionId,
        sectionTitle: section.title
      }))
    );
    const percentages = analyticsAttempts
      .map(attempt => Number(attempt.percentage))
      .filter(Number.isFinite);
    const averageScore = percentages.length > 0
      ? Math.round(percentages.reduce((sum, score) => sum + score, 0) / percentages.length)
      : null;
    const highestScore = percentages.length > 0 ? Math.max(...percentages) : null;
    const passingGrade = Number(quiz.passingGrade || 60);
    const passedCount = analyticsAttempts.filter(attempt => Number(attempt.percentage) >= passingGrade).length;

    res.json({
      success: true,
      data: {
        quiz: {
          quizId: quiz.quizId,
          title: quiz.title,
          totalQuestions: quiz.questions.length,
          totalPoints: quiz.totalPoints,
          passingGrade: quiz.passingGrade
        },
        stats: {
          ...(quiz.stats || {}),
          totalAttempts: completedAttempts.length,
          gradedAttempts: analyticsAttempts.length,
          averageScore,
          highestScore,
          passedCount,
          passRate: analyticsAttempts.length > 0
            ? Math.round((passedCount / analyticsAttempts.length) * 100)
            : 0
        },
        questionStats,
        sectionAnalytics: analytics,
        attempts: attemptsWithUser
      }
    });

  } catch (error) {
    console.error('Get quiz results error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得測驗結果失敗'
    });
  }
});

/**
 * GET /api/quizzes/:id/results.csv
 * 匯出測驗 section 分析與學生 section 成績
 */
router.get('/:id/results.csv', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到此測驗'
      });
    }

    const course = await db.getItem(`COURSE#${quiz.courseId}`, 'META');
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限匯出測驗結果'
      });
    }

    const attempts = await db.query(`QUIZ#${id}`, { skPrefix: 'ATTEMPT#' });
    const completedAttempts = attempts.filter(a => a.status === 'completed');
    const attemptsWithUser = await Promise.all(
      completedAttempts.map(async (a) => {
        const user = await db.getUser(a.userId);
        const { PK, SK, ...attempt } = a;
        return {
          ...attempt,
          userName: user?.displayName || '未知用戶',
          userEmail: user?.email || ''
        };
      })
    );
    const analyticsAttempts = attemptsWithUser.filter(isQuizAttemptFinalForAnalytics);
    const analytics = buildTeacherQuizAnalytics(quiz, analyticsAttempts);
    const csv = buildTeacherAnalyticsCsv(quiz, attemptsWithUser, analytics);
    const filename = `quiz-${id}-section-analytics.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Export quiz results CSV error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出測驗結果失敗'
    });
  }
});

module.exports = router;
