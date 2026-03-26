/**
 * 測驗作答流程
 * BeyondBridge Education Platform - Quiz Attempts & Anti-Cheat
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse } = require('../../utils/course-access');
const { invalidateGradebookSnapshots } = require('../../utils/gradebook-snapshots');
const { syncCourseCertificates } = require('../../utils/certificates');
const {
  getQuiz,
  prepareQuestionsForStudent,
  gradeQuiz,
  ANTI_CHEAT_SETTINGS,
  calculateRiskLevel,
  generateFlags
} = require('./utils');

async function canManageQuiz(quiz, user) {
  if (!quiz || !user) return false;
  if (user.isAdmin) return true;
  if (quiz.courseId) {
    const course = await db.getItem(`COURSE#${quiz.courseId}`, 'META');
    if (course && canManageCourse(course, user)) {
      return true;
    }
  }
  return quiz.createdBy === user.userId;
}

// ==================== 作答流程（學生） ====================

/**
 * POST /api/quizzes/:id/start
 * 開始測驗
 */
router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得測驗資料
    const quiz = await getQuiz(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到此測驗'
      });
    }

    // 檢查是否已報名課程
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${quiz.courseId}`);
    if (!progress) {
      return res.status(403).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 檢查時間限制
    const now = new Date();
    if (quiz.openDate && new Date(quiz.openDate) > now) {
      return res.status(403).json({
        success: false,
        error: 'QUIZ_NOT_OPEN',
        message: '測驗尚未開放'
      });
    }

    if (quiz.closeDate && new Date(quiz.closeDate) < now) {
      return res.status(403).json({
        success: false,
        error: 'QUIZ_CLOSED',
        message: '測驗已關閉'
      });
    }

    // 檢查作答次數
    const attempts = await db.query(`QUIZ#${id}`, {
      skPrefix: `ATTEMPT#${userId}#`
    });
    const completedAttempts = attempts.filter(a => a.status === 'completed');

    if (quiz.maxAttempts && completedAttempts.length >= quiz.maxAttempts) {
      return res.status(403).json({
        success: false,
        error: 'MAX_ATTEMPTS_REACHED',
        message: `您已達到最大作答次數 (${quiz.maxAttempts} 次)`
      });
    }

    // 檢查是否有進行中的作答
    const inProgressAttempt = attempts.find(a => a.status === 'in_progress');
    if (inProgressAttempt) {
      // 返回現有的進行中作答
      delete inProgressAttempt.PK;
      delete inProgressAttempt.SK;

      return res.json({
        success: true,
        message: '繼續進行中的測驗',
        data: {
          ...inProgressAttempt,
          questions: prepareQuestionsForStudent(quiz.questions, quiz.shuffleQuestions, quiz.shuffleAnswers)
        }
      });
    }

    // 建立新的作答記錄
    const attemptId = db.generateId('attempt');
    const attemptNumber = attempts.length + 1;
    const startedAt = now.toISOString();

    // 計算結束時間（如果有時間限制）
    const expiresAt = quiz.timeLimit ?
      new Date(now.getTime() + quiz.timeLimit * 60 * 1000).toISOString() : null;

    const attemptItem = {
      PK: `QUIZ#${id}`,
      SK: `ATTEMPT#${userId}#${attemptNumber}`,
      entityType: 'QUIZ_ATTEMPT',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `ATTEMPT#${id}#${attemptNumber}`,

      attemptId,
      quizId: id,
      userId,
      courseId: quiz.courseId,
      attemptNumber,

      startedAt,
      expiresAt,
      submittedAt: null,

      answers: {},
      score: null,
      percentage: null,
      passed: null,

      status: 'in_progress',

      createdAt: startedAt,
      updatedAt: startedAt
    };

    await db.putItem(attemptItem);

    delete attemptItem.PK;
    delete attemptItem.SK;

    const preparedQuestions = prepareQuestionsForStudent(quiz.questions, quiz.shuffleQuestions, quiz.shuffleAnswers);

    res.status(201).json({
      success: true,
      message: '測驗開始',
      data: {
        ...attemptItem,
        questions: preparedQuestions,
        timeLimit: quiz.timeLimit,
        totalQuestions: preparedQuestions.length || quiz.questionCount || 0
      }
    });

  } catch (error) {
    console.error('Start quiz error:', error);
    res.status(500).json({
      success: false,
      error: 'START_FAILED',
      message: '開始測驗失敗'
    });
  }
});

/**
 * PUT /api/quizzes/:id/attempts/:attemptId/answer
 * 儲存答案（自動儲存）
 */
router.put('/:id/attempts/:attemptId/answer', authMiddleware, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    const userId = req.user.userId;
    const { questionId, answer } = req.body;

    // 找到作答記錄
    const attempts = await db.query(`QUIZ#${id}`, {
      skPrefix: `ATTEMPT#${userId}#`
    });
    const attempt = attempts.find(a => a.attemptId === attemptId);

    if (!attempt) {
      return res.status(404).json({
        success: false,
        error: 'ATTEMPT_NOT_FOUND',
        message: '找不到作答記錄'
      });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(403).json({
        success: false,
        error: 'ATTEMPT_COMPLETED',
        message: '此作答已完成'
      });
    }

    // 檢查時間是否過期
    if (attempt.expiresAt && new Date() > new Date(attempt.expiresAt)) {
      return res.status(403).json({
        success: false,
        error: 'TIME_EXPIRED',
        message: '作答時間已過期'
      });
    }

    // 更新答案
    const answers = { ...attempt.answers, [questionId]: answer };

    await db.updateItem(`QUIZ#${id}`, attempt.SK, {
      answers,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '答案已儲存'
    });

  } catch (error) {
    console.error('Save answer error:', error);
    res.status(500).json({
      success: false,
      error: 'SAVE_FAILED',
      message: '儲存答案失敗'
    });
  }
});

/**
 * POST /api/quizzes/:id/attempts/:attemptId/submit
 * 提交測驗
 */
router.post('/:id/attempts/:attemptId/submit', authMiddleware, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    const userId = req.user.userId;
    const { answers: finalAnswers } = req.body;

    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到此測驗'
      });
    }

    // 找到作答記錄
    const attempts = await db.query(`QUIZ#${id}`, {
      skPrefix: `ATTEMPT#${userId}#`
    });
    const attempt = attempts.find(a => a.attemptId === attemptId);

    if (!attempt) {
      return res.status(404).json({
        success: false,
        error: 'ATTEMPT_NOT_FOUND',
        message: '找不到作答記錄'
      });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(403).json({
        success: false,
        error: 'ATTEMPT_COMPLETED',
        message: '此作答已完成'
      });
    }

    // 合併答案
    const allAnswers = { ...attempt.answers, ...finalAnswers };

    // 評分
    const { score, totalPoints, questionResults } = gradeQuiz(quiz.questions, allAnswers);
    const percentage = Math.round((score / totalPoints) * 100);
    const passed = percentage >= quiz.passingGrade;

    const now = new Date().toISOString();

    // 更新作答記錄
    const updates = {
      answers: allAnswers,
      score,
      totalPoints,
      percentage,
      passed,
      questionResults,
      status: 'completed',
      submittedAt: now,
      updatedAt: now
    };

    await db.updateItem(`QUIZ#${id}`, attempt.SK, updates);

    // 更新測驗統計
    const allAttempts = await db.query(`QUIZ#${id}`, { skPrefix: 'ATTEMPT#' });
    const completedAttempts = allAttempts.filter(a => a.status === 'completed' || a.attemptId === attemptId);
    const totalScore = completedAttempts.reduce((sum, a) =>
      sum + (a.attemptId === attemptId ? percentage : a.percentage || 0), 0);
    const averageScore = totalScore / completedAttempts.length;
    const passCount = completedAttempts.filter(a =>
      a.attemptId === attemptId ? passed : a.passed).length;

    await db.updateItem(`QUIZ#${id}`, 'META', {
      'stats.totalAttempts': completedAttempts.length,
      'stats.averageScore': Math.round(averageScore * 100) / 100,
      'stats.passRate': Math.round((passCount / completedAttempts.length) * 100),
      updatedAt: now
    });

    // 更新用戶課程進度中的成績
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${quiz.courseId}`);
    if (progress) {
      const grades = [...(progress.grades || [])];
      const existingIndex = grades.findIndex(g => g.quizId === id);

      // 根據評分方式決定是否更新
      let shouldUpdate = false;
      if (quiz.gradeMethod === 'highest') {
        shouldUpdate = !existingIndex || percentage > (grades[existingIndex]?.percentage || 0);
      } else if (quiz.gradeMethod === 'last') {
        shouldUpdate = true;
      } else if (quiz.gradeMethod === 'first') {
        shouldUpdate = existingIndex < 0;
      }

      if (shouldUpdate) {
        const gradeEntry = {
          quizId: id,
          quizTitle: quiz.title,
          score,
          totalPoints,
          percentage,
          passed,
          gradedAt: now
        };

        if (existingIndex >= 0) {
          grades[existingIndex] = gradeEntry;
        } else {
          grades.push(gradeEntry);
        }

        // 計算整體成績
        const overallGrade = grades.reduce((sum, g) => sum + (g.percentage || 0), 0) / grades.length;

        await db.updateItem(`USER#${userId}`, `PROG#COURSE#${quiz.courseId}`, {
          grades,
          overallGrade: Math.round(overallGrade * 100) / 100,
          updatedAt: now
        });

        await syncCourseCertificates(quiz.courseId, {
          userId,
          issuedBy: 'system'
        });
      }
    }

    await invalidateGradebookSnapshots(quiz.courseId);

    // 準備回傳結果
    let result = {
      attemptId,
      score,
      totalPoints,
      percentage,
      passed,
      submittedAt: now
    };

    // 根據設定決定是否顯示詳細結果
    if (quiz.showResults === 'immediately') {
      result.questionResults = questionResults;
      if (quiz.showCorrectAnswers) {
        result.correctAnswers = quiz.questions.map(q => ({
          questionId: q.questionId,
          correctAnswer: q.correctAnswer,
          correctAnswers: q.correctAnswers,
          feedback: q.feedback
        }));
      }
    }

    res.json({
      success: true,
      message: passed ? '恭喜通過測驗！' : '測驗完成',
      data: result
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
 * GET /api/quizzes/:id/attempts/:attemptId/review
 * 查看測驗結果
 */
router.get('/:id/attempts/:attemptId/review', authMiddleware, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    const userId = req.user.userId;

    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到此測驗'
      });
    }

    // 找到作答記錄
    const attempts = await db.query(`QUIZ#${id}`, {
      skPrefix: `ATTEMPT#${userId}#`
    });
    const attempt = attempts.find(a => a.attemptId === attemptId);

    if (!attempt) {
      return res.status(404).json({
        success: false,
        error: 'ATTEMPT_NOT_FOUND',
        message: '找不到作答記錄'
      });
    }

    if (attempt.status !== 'completed') {
      return res.status(403).json({
        success: false,
        error: 'ATTEMPT_IN_PROGRESS',
        message: '此作答尚未完成'
      });
    }

    // 檢查是否可以查看結果
    const now = new Date();
    if (quiz.showResults === 'never') {
      return res.status(403).json({
        success: false,
        error: 'RESULTS_HIDDEN',
        message: '此測驗不顯示結果'
      });
    }

    if (quiz.showResults === 'after_close' && quiz.closeDate && new Date(quiz.closeDate) > now) {
      return res.status(403).json({
        success: false,
        error: 'RESULTS_NOT_AVAILABLE',
        message: '結果將在測驗關閉後顯示'
      });
    }

    delete attempt.PK;
    delete attempt.SK;

    const result = {
      ...attempt,
      questions: quiz.questions.map(q => ({
        questionId: q.questionId,
        type: q.type,
        text: q.text,
        options: q.options,
        points: q.points,
        userAnswer: attempt.answers[q.questionId],
        isCorrect: attempt.questionResults?.find(r => r.questionId === q.questionId)?.isCorrect,
        earnedPoints: attempt.questionResults?.find(r => r.questionId === q.questionId)?.earnedPoints,
        correctAnswer: quiz.showCorrectAnswers ? q.correctAnswer : undefined,
        correctAnswers: quiz.showCorrectAnswers ? q.correctAnswers : undefined,
        feedback: quiz.showCorrectAnswers ? q.feedback : undefined
      }))
    };

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Review quiz error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得測驗結果失敗'
    });
  }
});

// ==================== 防作弊機制 API ====================

/**
 * PUT /api/quizzes/:id/settings/anti-cheat
 * 更新測驗的防作弊設定
 */
router.put('/:id/settings/anti-cheat', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      enableSecureBrowser,        // 啟用安全瀏覽器模式
      shuffleQuestions,           // 打亂題目順序
      shuffleAnswers,             // 打亂選項順序
      blockCopyPaste,             // 禁止複製貼上
      blockRightClick,            // 禁止右鍵
      blockPrint,                 // 禁止列印
      monitorFocusLoss,           // 監控離開頁面
      maxFocusLossCount,          // 最大離開次數
      lockBrowser,                // 鎖定瀏覽器（全螢幕）
      ipRestriction,              // IP 限制類型 ('none', 'first', 'whitelist')
      allowedIps,                 // IP 白名單
      requirePassword,            // 需要密碼
      quizPassword,               // 測驗密碼
      timeLimit,                  // 時間限制（分鐘）
      timeLimitEnforced,          // 強制時間限制（時間到自動提交）
      showTimer,                  // 顯示倒數計時器
      questionPerPage,            // 每頁題目數量
      preventBacktracking,        // 禁止返回上一題
      webcamProctoring,           // 網路攝影機監考（記錄但不實時監控）
      screenshotInterval          // 截圖間隔（秒）
    } = req.body;

    // 驗證測驗存在且有權限
    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到測驗'
      });
    }

    if (!(await canManageQuiz(quiz, req.user))) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限修改測驗設定'
      });
    }

    // 建立防作弊設定物件
    const antiCheatSettings = {
      enableSecureBrowser: !!enableSecureBrowser,
      shuffleQuestions: !!shuffleQuestions,
      shuffleAnswers: !!shuffleAnswers,
      blockCopyPaste: !!blockCopyPaste,
      blockRightClick: !!blockRightClick,
      blockPrint: !!blockPrint,
      monitorFocusLoss: !!monitorFocusLoss,
      maxFocusLossCount: maxFocusLossCount || ANTI_CHEAT_SETTINGS.maxFocusLossCount,
      lockBrowser: !!lockBrowser,
      ipRestriction: ipRestriction || 'none',
      allowedIps: allowedIps || [],
      requirePassword: !!requirePassword,
      timeLimit: timeLimit || null,
      timeLimitEnforced: !!timeLimitEnforced,
      showTimer: showTimer !== false, // 預設為 true
      questionPerPage: questionPerPage || 1,
      preventBacktracking: !!preventBacktracking,
      webcamProctoring: !!webcamProctoring,
      screenshotInterval: screenshotInterval || 60
    };

    // 如果有密碼，另外儲存（不直接在設定中）
    const updates = {
      antiCheatSettings,
      shuffleQuestions: !!shuffleQuestions,
      shuffleAnswers: !!shuffleAnswers,
      timeLimit: timeLimit || null,
      updatedAt: new Date().toISOString()
    };

    if (requirePassword && quizPassword) {
      updates.quizPassword = quizPassword;
    } else if (requirePassword === false) {
      updates.quizPassword = null;
    }

    const updatedQuiz = await db.updateItem(`QUIZ#${id}`, 'META', updates);

    res.json({
      success: true,
      message: '防作弊設定已更新',
      data: antiCheatSettings
    });

  } catch (error) {
    console.error('Update anti-cheat settings error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新防作弊設定失敗'
    });
  }
});

/**
 * GET /api/quizzes/:id/settings/anti-cheat
 * 取得測驗的防作弊設定
 */
router.get('/:id/settings/anti-cheat', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到測驗'
      });
    }

    // 非建立者只能看到部分設定
    const isOwner = await canManageQuiz(quiz, req.user);

    if (isOwner) {
      res.json({
        success: true,
        data: {
          ...quiz.antiCheatSettings,
          hasPassword: !!quiz.quizPassword
        }
      });
    } else {
      // 學生只能看到影響他們體驗的設定
      res.json({
        success: true,
        data: {
          enableSecureBrowser: quiz.antiCheatSettings?.enableSecureBrowser,
          shuffleQuestions: quiz.antiCheatSettings?.shuffleQuestions,
          shuffleAnswers: quiz.antiCheatSettings?.shuffleAnswers,
          timeLimit: quiz.timeLimit,
          showTimer: quiz.antiCheatSettings?.showTimer !== false,
          questionPerPage: quiz.antiCheatSettings?.questionPerPage || 1,
          preventBacktracking: quiz.antiCheatSettings?.preventBacktracking,
          requirePassword: !!quiz.quizPassword
        }
      });
    }

  } catch (error) {
    console.error('Get anti-cheat settings error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得防作弊設定失敗'
    });
  }
});

/**
 * POST /api/quizzes/:id/attempts/:attemptId/behavior
 * 記錄作答行為（前端定期回報）
 */
router.post('/:id/attempts/:attemptId/behavior', authMiddleware, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    const userId = req.user.userId;
    const {
      eventType,     // 'focus_loss', 'focus_gain', 'copy_attempt', 'paste_attempt',
                     // 'right_click', 'print_attempt', 'tab_switch', 'screenshot',
                     // 'fullscreen_exit', 'devtools_open'
      timestamp,
      details        // 額外資訊
    } = req.body;

    const clientIp = req.headers['x-forwarded-for'] ||
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress || 'unknown';

    // 找到作答記錄
    const attempts = await db.query(`QUIZ#${id}`, {
      skPrefix: `ATTEMPT#${userId}#`
    });
    const attempt = attempts.find(a => a.attemptId === attemptId);

    if (!attempt || attempt.status !== 'in_progress') {
      return res.status(404).json({
        success: false,
        error: 'ATTEMPT_NOT_FOUND',
        message: '找不到進行中的作答'
      });
    }

    // 取得現有行為記錄
    const behaviorLog = attempt.behaviorLog || [];

    // 添加新記錄
    behaviorLog.push({
      eventType,
      timestamp: timestamp || new Date().toISOString(),
      details: details || {},
      ip: clientIp
    });

    // 計算可疑行為統計
    const behaviorStats = {
      focusLossCount: behaviorLog.filter(e => e.eventType === 'focus_loss').length,
      copyAttempts: behaviorLog.filter(e => e.eventType === 'copy_attempt').length,
      pasteAttempts: behaviorLog.filter(e => e.eventType === 'paste_attempt').length,
      rightClickCount: behaviorLog.filter(e => e.eventType === 'right_click').length,
      tabSwitches: behaviorLog.filter(e => e.eventType === 'tab_switch').length,
      fullscreenExits: behaviorLog.filter(e => e.eventType === 'fullscreen_exit').length,
      devtoolsOpens: behaviorLog.filter(e => e.eventType === 'devtools_open').length
    };

    // 計算可疑分數
    const suspiciousScore =
      behaviorStats.focusLossCount * 2 +
      behaviorStats.copyAttempts * 3 +
      behaviorStats.pasteAttempts * 3 +
      behaviorStats.tabSwitches * 2 +
      behaviorStats.fullscreenExits * 5 +
      behaviorStats.devtoolsOpens * 10;

    // 更新作答記錄
    await db.updateItem(`QUIZ#${id}`, attempt.SK, {
      behaviorLog,
      behaviorStats,
      suspiciousScore,
      lastActivityAt: new Date().toISOString()
    });

    // 檢查是否超過閾值
    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    const maxFocusLoss = quiz.antiCheatSettings?.maxFocusLossCount ||
                         ANTI_CHEAT_SETTINGS.maxFocusLossCount;

    let warning = null;
    if (behaviorStats.focusLossCount >= maxFocusLoss) {
      warning = {
        type: 'max_focus_loss_reached',
        message: '您已達到離開頁面的次數上限，測驗可能會被自動提交'
      };
    } else if (suspiciousScore >= ANTI_CHEAT_SETTINGS.suspiciousBehaviorThreshold) {
      warning = {
        type: 'suspicious_behavior',
        message: '系統偵測到可疑行為，請專注於測驗'
      };
    }

    res.json({
      success: true,
      data: {
        behaviorStats,
        suspiciousScore,
        warning
      }
    });

  } catch (error) {
    console.error('Record behavior error:', error);
    res.status(500).json({
      success: false,
      error: 'RECORD_FAILED',
      message: '記錄行為失敗'
    });
  }
});

/**
 * POST /api/quizzes/:id/verify-password
 * 驗證測驗密碼
 */
router.post('/:id/verify-password', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到測驗'
      });
    }

    if (!quiz.quizPassword) {
      return res.json({
        success: true,
        message: '此測驗不需要密碼'
      });
    }

    if (password !== quiz.quizPassword) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_PASSWORD',
        message: '密碼錯誤'
      });
    }

    res.json({
      success: true,
      message: '密碼正確'
    });

  } catch (error) {
    console.error('Verify password error:', error);
    res.status(500).json({
      success: false,
      error: 'VERIFY_FAILED',
      message: '驗證密碼失敗'
    });
  }
});

/**
 * POST /api/quizzes/:id/attempts/:attemptId/screenshot
 * 上傳截圖（用於監考）
 */
router.post('/:id/attempts/:attemptId/screenshot', authMiddleware, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    const userId = req.user.userId;
    const { imageData, timestamp } = req.body;

    // 找到作答記錄
    const attempts = await db.query(`QUIZ#${id}`, {
      skPrefix: `ATTEMPT#${userId}#`
    });
    const attempt = attempts.find(a => a.attemptId === attemptId);

    if (!attempt || attempt.status !== 'in_progress') {
      return res.status(404).json({
        success: false,
        error: 'ATTEMPT_NOT_FOUND',
        message: '找不到進行中的作答'
      });
    }

    // 在這裡可以將截圖儲存到 S3 或其他儲存空間
    // 目前僅記錄截圖事件

    const screenshots = attempt.screenshots || [];
    screenshots.push({
      timestamp: timestamp || new Date().toISOString(),
      // 在實際應用中，這裡會是 S3 URL
      // imageUrl: 'https://s3.amazonaws.com/...'
      recorded: true
    });

    await db.updateItem(`QUIZ#${id}`, attempt.SK, {
      screenshots,
      lastScreenshotAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '截圖已記錄',
      data: {
        screenshotCount: screenshots.length
      }
    });

  } catch (error) {
    console.error('Upload screenshot error:', error);
    res.status(500).json({
      success: false,
      error: 'UPLOAD_FAILED',
      message: '上傳截圖失敗'
    });
  }
});

/**
 * GET /api/quizzes/:id/attempts/:attemptId/proctoring-report
 * 取得作答的監考報告（教師專用）
 */
router.get('/:id/attempts/:attemptId/proctoring-report', authMiddleware, async (req, res) => {
  try {
    const { id, attemptId } = req.params;
    const userId = req.user.userId;

    // 驗證測驗存在且有權限
    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到測驗'
      });
    }

    if (!(await canManageQuiz(quiz, req.user))) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看監考報告'
      });
    }

    // 找到作答記錄
    const allAttempts = await db.query(`QUIZ#${id}`, { skPrefix: 'ATTEMPT#' });
    const attempt = allAttempts.find(a => a.attemptId === attemptId);

    if (!attempt) {
      return res.status(404).json({
        success: false,
        error: 'ATTEMPT_NOT_FOUND',
        message: '找不到作答記錄'
      });
    }

    // 取得學生資訊
    const student = await db.getUser(attempt.userId);

    // 生成監考報告
    const report = {
      attemptId: attempt.attemptId,
      student: {
        userId: attempt.userId,
        displayName: student?.displayName || 'Unknown',
        email: student?.email || ''
      },
      quiz: {
        quizId: quiz.quizId,
        title: quiz.title
      },
      timing: {
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        expiresAt: attempt.expiresAt,
        duration: attempt.submittedAt ?
          Math.round((new Date(attempt.submittedAt) - new Date(attempt.startedAt)) / 60000) :
          null
      },
      score: {
        score: attempt.score,
        percentage: attempt.percentage,
        passed: attempt.passed
      },
      behaviorStats: attempt.behaviorStats || {},
      suspiciousScore: attempt.suspiciousScore || 0,
      behaviorLog: attempt.behaviorLog || [],
      screenshots: (attempt.screenshots || []).length,
      riskLevel: calculateRiskLevel(attempt.suspiciousScore || 0),
      flags: generateFlags(attempt)
    };

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Get proctoring report error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得監考報告失敗'
    });
  }
});

/**
 * GET /api/quizzes/:id/proctoring-summary
 * 取得測驗的所有作答監考摘要（教師專用）
 */
router.get('/:id/proctoring-summary', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 驗證測驗存在且有權限
    const quiz = await db.getItem(`QUIZ#${id}`, 'META');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到測驗'
      });
    }

    if (!(await canManageQuiz(quiz, req.user))) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看監考摘要'
      });
    }

    // 取得所有作答記錄
    const allAttempts = await db.query(`QUIZ#${id}`, { skPrefix: 'ATTEMPT#' });
    const completedAttempts = allAttempts.filter(a => a.status === 'completed');

    // 生成摘要
    const summary = {
      quizId: id,
      quizTitle: quiz.title,
      antiCheatSettings: quiz.antiCheatSettings || {},
      totalAttempts: completedAttempts.length,
      riskDistribution: {
        high: 0,
        medium: 0,
        low: 0,
        none: 0
      },
      flaggedAttempts: [],
      averageSuspiciousScore: 0
    };

    let totalSuspiciousScore = 0;

    for (const attempt of completedAttempts) {
      const score = attempt.suspiciousScore || 0;
      totalSuspiciousScore += score;

      const riskLevel = calculateRiskLevel(score);
      summary.riskDistribution[riskLevel]++;

      if (riskLevel !== 'none') {
        const student = await db.getUser(attempt.userId);
        summary.flaggedAttempts.push({
          attemptId: attempt.attemptId,
          userId: attempt.userId,
          displayName: student?.displayName || 'Unknown',
          suspiciousScore: score,
          riskLevel,
          flags: generateFlags(attempt)
        });
      }
    }

    summary.averageSuspiciousScore = completedAttempts.length > 0 ?
      Math.round(totalSuspiciousScore / completedAttempts.length * 10) / 10 : 0;

    // 按風險排序
    summary.flaggedAttempts.sort((a, b) => b.suspiciousScore - a.suspiciousScore);

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Get proctoring summary error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得監考摘要失敗'
    });
  }
});

module.exports = router;
