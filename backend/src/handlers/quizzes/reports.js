/**
 * 測驗報表
 * BeyondBridge Education Platform - Quiz Reports & Teacher Statistics
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');

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
    if (course.instructorId !== userId && !req.user.isAdmin) {
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
        delete a.PK;
        delete a.SK;
        return {
          ...a,
          userName: user?.displayName || '未知用戶',
          userEmail: user?.email
        };
      })
    );

    // 計算問題統計
    const questionStats = quiz.questions.map(q => {
      const responses = completedAttempts.map(a => ({
        answer: a.answers[q.questionId],
        isCorrect: a.questionResults?.find(r => r.questionId === q.questionId)?.isCorrect
      }));

      const correctCount = responses.filter(r => r.isCorrect).length;
      const totalResponses = responses.length;

      // 選擇題的選項分布
      let optionDistribution = null;
      if (q.type === 'multiple_choice' && q.options) {
        optionDistribution = q.options.map(opt => ({
          option: opt,
          count: responses.filter(r => r.answer === opt).length,
          percentage: totalResponses > 0 ?
            Math.round((responses.filter(r => r.answer === opt).length / totalResponses) * 100) : 0
        }));
      }

      return {
        questionId: q.questionId,
        questionText: q.text,
        type: q.type,
        correctRate: totalResponses > 0 ?
          Math.round((correctCount / totalResponses) * 100) : 0,
        optionDistribution
      };
    });

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
        stats: quiz.stats,
        questionStats,
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

module.exports = router;
