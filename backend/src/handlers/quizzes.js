/**
 * BeyondBridge 測驗系統 API
 * 處理測驗題目、作答、成績相關功能
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

/**
 * GET /api/quizzes
 * 取得用戶可用的測驗列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, category, limit = 20 } = req.query;
    const userId = req.user.userId;

    // 取得所有已發布的測驗
    const quizzes = await db.scan({
      filter: {
        expression: 'entityType = :type AND #status = :status',
        values: { ':type': 'QUIZ', ':status': 'published' },
        names: { '#status': 'status' }
      }
    });

    // 取得用戶的測驗進度
    const userProgress = await db.query(`USER#${userId}`, { skPrefix: 'QUIZ#' });
    const progressMap = {};
    userProgress.forEach(p => {
      progressMap[p.quizId] = p;
    });

    // 合併資料
    const enrichedQuizzes = quizzes.map(quiz => {
      const progress = progressMap[quiz.quizId] || {};
      return {
        ...quiz,
        userStatus: progress.status || 'not_started',
        userScore: progress.score,
        attempts: progress.attempts || 0,
        lastAttemptAt: progress.lastAttemptAt,
        bestScore: progress.bestScore
      };
    }).filter(quiz => {
      // 根據狀態篩選
      if (status === 'completed') return quiz.userStatus === 'completed';
      if (status === 'progress') return quiz.userStatus === 'in_progress';
      if (status === 'not_started') return quiz.userStatus === 'not_started';
      return true;
    });

    // 排序：進行中優先，然後是未開始，最後是已完成
    enrichedQuizzes.sort((a, b) => {
      const order = { 'in_progress': 0, 'not_started': 1, 'completed': 2 };
      return order[a.userStatus] - order[b.userStatus];
    });

    // 清理資料
    enrichedQuizzes.forEach(q => {
      delete q.PK;
      delete q.SK;
      delete q.questions; // 不在列表中返回題目
    });

    res.json({
      success: true,
      data: enrichedQuizzes.slice(0, parseInt(limit))
    });

  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得測驗列表失敗'
    });
  }
});

/**
 * GET /api/quizzes/:id
 * 取得測驗詳情（包含題目）
 */
router.get('/:id', authMiddleware, async (req, res) => {
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

    // 取得用戶進度
    const progress = await db.getItem(`USER#${userId}`, `QUIZ#${id}`);

    // 如果測驗設定隨機順序，打亂題目
    let questions = quiz.questions || [];
    if (quiz.shuffleQuestions) {
      questions = [...questions].sort(() => Math.random() - 0.5);
    }

    // 打亂選項（如果設定）
    if (quiz.shuffleOptions) {
      questions = questions.map(q => ({
        ...q,
        options: q.type === 'multiple_choice'
          ? [...q.options].sort(() => Math.random() - 0.5)
          : q.options
      }));
    }

    // 移除答案（防止作弊）
    const safeQuestions = questions.map(q => ({
      questionId: q.questionId,
      type: q.type,
      question: q.question,
      options: q.options,
      points: q.points || 1,
      imageUrl: q.imageUrl
    }));

    delete quiz.PK;
    delete quiz.SK;
    quiz.questions = safeQuestions;
    quiz.userProgress = progress ? {
      status: progress.status,
      attempts: progress.attempts || 0,
      bestScore: progress.bestScore,
      lastAttemptAt: progress.lastAttemptAt
    } : null;

    res.json({
      success: true,
      data: quiz
    });

  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得測驗失敗'
    });
  }
});

/**
 * POST /api/quizzes/:id/submit
 * 提交測驗答案
 */
router.post('/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers, timeSpent } = req.body;
    const userId = req.user.userId;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ANSWERS',
        message: '請提供有效的答案'
      });
    }

    // 取得測驗（含答案）
    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到此測驗'
      });
    }

    // 計算分數
    let correctCount = 0;
    let totalPoints = 0;
    let earnedPoints = 0;
    const results = [];

    quiz.questions.forEach(question => {
      const points = question.points || 1;
      totalPoints += points;

      const userAnswer = answers.find(a => a.questionId === question.questionId);
      const isCorrect = userAnswer && userAnswer.answer === question.correctAnswer;

      if (isCorrect) {
        correctCount++;
        earnedPoints += points;
      }

      results.push({
        questionId: question.questionId,
        question: question.question,
        userAnswer: userAnswer?.answer,
        correctAnswer: question.correctAnswer,
        isCorrect,
        points,
        earnedPoints: isCorrect ? points : 0,
        explanation: question.explanation
      });
    });

    const score = Math.round((earnedPoints / totalPoints) * 100);
    const passed = score >= (quiz.passingScore || 60);

    // 取得或建立用戶進度
    const now = new Date().toISOString();
    let progress = await db.getItem(`USER#${userId}`, `QUIZ#${id}`);

    if (!progress) {
      progress = {
        PK: `USER#${userId}`,
        SK: `QUIZ#${id}`,
        GSI1PK: `QUIZ#${id}`,
        GSI1SK: `USER#${userId}`,
        entityType: 'USER_QUIZ',
        userId,
        quizId: id,
        quizTitle: quiz.title,
        attempts: 0,
        bestScore: 0,
        status: 'not_started',
        createdAt: now
      };
    }

    // 更新進度
    progress.attempts = (progress.attempts || 0) + 1;
    progress.lastScore = score;
    progress.bestScore = Math.max(progress.bestScore || 0, score);
    progress.status = passed ? 'completed' : 'in_progress';
    progress.lastAttemptAt = now;
    progress.lastTimeSpent = timeSpent || 0;
    progress.totalTimeSpent = (progress.totalTimeSpent || 0) + (timeSpent || 0);
    progress.updatedAt = now;

    await db.putItem(progress);

    // 記錄活動
    await db.logActivity(userId, 'quiz_submitted', 'quiz', id, {
      score,
      passed,
      attempt: progress.attempts,
      timeSpent
    });

    // 更新測驗統計
    await db.updateItem(`QUIZ#${id}`, 'META', {
      totalAttempts: (quiz.totalAttempts || 0) + 1,
      totalPassed: passed ? (quiz.totalPassed || 0) + 1 : (quiz.totalPassed || 0),
      averageScore: Math.round(((quiz.averageScore || 0) * (quiz.totalAttempts || 0) + score) / ((quiz.totalAttempts || 0) + 1))
    });

    res.json({
      success: true,
      message: passed ? '恭喜通過測驗！' : '測驗完成，繼續加油！',
      data: {
        score,
        earnedPoints,
        totalPoints,
        correctCount,
        totalQuestions: quiz.questions.length,
        passed,
        passingScore: quiz.passingScore || 60,
        attempt: progress.attempts,
        bestScore: progress.bestScore,
        results,
        timeSpent
      }
    });

  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({
      success: false,
      error: 'SUBMIT_FAILED',
      message: '提交測驗失敗'
    });
  }
});

/**
 * GET /api/quizzes/:id/result
 * 取得用戶的測驗結果歷史
 */
router.get('/:id/result', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const progress = await db.getItem(`USER#${userId}`, `QUIZ#${id}`);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NO_RESULT',
        message: '尚未參加此測驗'
      });
    }

    delete progress.PK;
    delete progress.SK;

    res.json({
      success: true,
      data: progress
    });

  } catch (error) {
    console.error('Get quiz result error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得測驗結果失敗'
    });
  }
});

/**
 * GET /api/quizzes/stats/summary
 * 取得用戶的測驗統計摘要
 */
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 取得用戶所有測驗進度
    const userQuizzes = await db.query(`USER#${userId}`, { skPrefix: 'QUIZ#' });

    const stats = {
      totalQuizzes: userQuizzes.length,
      completed: 0,
      inProgress: 0,
      totalAttempts: 0,
      averageScore: 0,
      bestScore: 0,
      totalTimeSpent: 0
    };

    let totalScore = 0;
    userQuizzes.forEach(q => {
      if (q.status === 'completed') stats.completed++;
      else if (q.status === 'in_progress') stats.inProgress++;

      stats.totalAttempts += q.attempts || 0;
      stats.totalTimeSpent += q.totalTimeSpent || 0;

      if (q.bestScore > stats.bestScore) {
        stats.bestScore = q.bestScore;
      }

      if (q.bestScore) {
        totalScore += q.bestScore;
      }
    });

    stats.averageScore = stats.totalQuizzes > 0
      ? Math.round(totalScore / stats.totalQuizzes)
      : 0;

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get quiz stats error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得統計失敗'
    });
  }
});

// ========== 管理員端點 ==========

/**
 * POST /api/quizzes
 * 建立新測驗（管理員/教師）
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = req.user;

    // 檢查權限（管理員或教師）
    if (!user.isAdmin && user.role !== 'educator' && user.role !== 'trainer') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限建立測驗'
      });
    }

    const {
      title,
      description,
      category,
      gradeLevel,
      timeLimit,
      passingScore = 60,
      shuffleQuestions = true,
      shuffleOptions = true,
      questions = []
    } = req.body;

    if (!title || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供測驗標題和題目'
      });
    }

    const quizId = db.generateId('quiz');
    const now = new Date().toISOString();

    // 為每個題目生成 ID
    const processedQuestions = questions.map((q, index) => ({
      ...q,
      questionId: q.questionId || `q_${index + 1}`
    }));

    const quiz = {
      PK: `QUIZ#${quizId}`,
      SK: 'META',
      GSI1PK: `CAT#${category || 'general'}`,
      GSI1SK: now,
      GSI2PK: 'STATUS#draft',
      GSI2SK: now,
      entityType: 'QUIZ',
      quizId,
      title,
      description,
      category: category || 'general',
      gradeLevel,
      timeLimit,
      passingScore,
      shuffleQuestions,
      shuffleOptions,
      questions: processedQuestions,
      questionCount: processedQuestions.length,
      totalPoints: processedQuestions.reduce((sum, q) => sum + (q.points || 1), 0),
      creatorId: userId,
      creatorName: user.displayName || user.email,
      status: 'draft',
      totalAttempts: 0,
      totalPassed: 0,
      averageScore: 0,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(quiz);

    // 記錄活動
    await db.logActivity(userId, 'quiz_created', 'quiz', quizId, { title });

    delete quiz.PK;
    delete quiz.SK;

    res.status(201).json({
      success: true,
      message: '測驗建立成功',
      data: quiz
    });

  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立測驗失敗'
    });
  }
});

/**
 * PUT /api/quizzes/:id
 * 更新測驗
 */
router.put('/:id', authMiddleware, async (req, res) => {
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

    // 檢查權限
    if (!req.user.isAdmin && quiz.creatorId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限編輯此測驗'
      });
    }

    const allowedUpdates = [
      'title', 'description', 'category', 'gradeLevel',
      'timeLimit', 'passingScore', 'shuffleQuestions', 'shuffleOptions',
      'questions', 'status'
    ];

    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // 如果更新題目，重新計算統計
    if (updates.questions) {
      updates.questionCount = updates.questions.length;
      updates.totalPoints = updates.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    }

    updates.updatedAt = new Date().toISOString();

    const updated = await db.updateItem(`QUIZ#${id}`, 'META', updates);

    delete updated.PK;
    delete updated.SK;

    res.json({
      success: true,
      message: '測驗已更新',
      data: updated
    });

  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新測驗失敗'
    });
  }
});

/**
 * PUT /api/quizzes/:id/publish
 * 發布測驗
 */
router.put('/:id/publish', authMiddleware, async (req, res) => {
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

    if (!req.user.isAdmin && quiz.creatorId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限發布此測驗'
      });
    }

    const now = new Date().toISOString();
    await db.updateItem(`QUIZ#${id}`, 'META', {
      status: 'published',
      publishedAt: now,
      GSI2PK: 'STATUS#published',
      GSI2SK: now
    });

    res.json({
      success: true,
      message: '測驗已發布'
    });

  } catch (error) {
    console.error('Publish quiz error:', error);
    res.status(500).json({
      success: false,
      error: 'PUBLISH_FAILED',
      message: '發布測驗失敗'
    });
  }
});

/**
 * DELETE /api/quizzes/:id
 * 刪除測驗
 */
router.delete('/:id', authMiddleware, async (req, res) => {
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

    if (!req.user.isAdmin && quiz.creatorId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限刪除此測驗'
      });
    }

    await db.deleteItem(`QUIZ#${id}`, 'META');

    res.json({
      success: true,
      message: '測驗已刪除'
    });

  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除測驗失敗'
    });
  }
});

module.exports = router;
