/**
 * 測驗系統 API 處理器
 * BeyondBridge Education Platform - Moodle-style Quiz System
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, optionalAuthMiddleware } = require('../utils/auth');

// ==================== Mock 測驗資料（當資料庫無資料時使用）====================
const mockQuizzes = {
  'quiz_demo001': {
    quizId: 'quiz_demo001',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    title: 'HTML 基礎測驗',
    description: '測試你對 HTML 標籤和結構的理解',
    instructions: '本測驗共 5 題，時間限制 20 分鐘。每題 20 分，及格分數 60 分。',
    timeLimit: 20,
    maxAttempts: 3,
    shuffleQuestions: true,
    shuffleAnswers: true,
    showResults: 'immediately',
    passingScore: 60,
    maxScore: 100,
    questionCount: 5,
    questions: [
      { questionId: 'q_html001', order: 1, type: 'multiple_choice', text: 'HTML 中哪個標籤用於定義網頁的標題？', points: 20, options: ['<header>', '<title>', '<h1>', '<head>'], correctAnswer: 1 },
      { questionId: 'q_html002', order: 2, type: 'multiple_choice', text: '以下哪個是正確的 HTML5 文件宣告？', points: 20, options: ['<!DOCTYPE HTML5>', '<!DOCTYPE html>', '<DOCTYPE html>', '<!html>'], correctAnswer: 1 },
      { questionId: 'q_html003', order: 3, type: 'multiple_choice', text: '在 HTML 中，<a> 標籤的 href 屬性用於什麼？', points: 20, options: ['設定文字顏色', '指定連結目標', '設定字體大小', '設定圖片來源'], correctAnswer: 1 },
      { questionId: 'q_html004', order: 4, type: 'true_false', text: '<br> 標籤需要閉合標籤', points: 20, correctAnswer: false },
      { questionId: 'q_html005', order: 5, type: 'multiple_choice', text: '哪個 HTML 元素用於定義無序列表？', points: 20, options: ['<ol>', '<li>', '<ul>', '<list>'], correctAnswer: 2 }
    ],
    status: 'published',
    openDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  'quiz_demo002': {
    quizId: 'quiz_demo002',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    title: 'CSS 樣式設計測驗',
    description: '測試你對 CSS 選擇器、屬性和佈局的掌握程度',
    instructions: '本測驗共 5 題，時間限制 30 分鐘。',
    timeLimit: 30,
    maxAttempts: 2,
    shuffleQuestions: true,
    shuffleAnswers: true,
    showResults: 'after_close',
    passingScore: 70,
    maxScore: 100,
    questionCount: 5,
    questions: [
      { questionId: 'q_css001', order: 1, type: 'multiple_choice', text: 'CSS 的全名是什麼？', points: 20, options: ['Creative Style Sheets', 'Cascading Style Sheets', 'Computer Style Sheets', 'Colorful Style Sheets'], correctAnswer: 1 },
      { questionId: 'q_css002', order: 2, type: 'multiple_choice', text: '如何選擇所有 class 為 "intro" 的元素？', points: 20, options: ['#intro', '.intro', 'intro', '*intro'], correctAnswer: 1 },
      { questionId: 'q_css003', order: 3, type: 'multiple_choice', text: '以下哪個屬性用於改變文字顏色？', points: 20, options: ['text-color', 'font-color', 'color', 'text-style'], correctAnswer: 2 },
      { questionId: 'q_css004', order: 4, type: 'true_false', text: 'CSS 中 padding 屬性用於設定元素的外邊距', points: 20, correctAnswer: false },
      { questionId: 'q_css005', order: 5, type: 'multiple_choice', text: 'Flexbox 中，justify-content 屬性用於控制什麼？', points: 20, options: ['垂直對齊', '主軸對齊', '字體大小', '背景顏色'], correctAnswer: 1 }
    ],
    status: 'published',
    openDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  'quiz_demo003': {
    quizId: 'quiz_demo003',
    courseId: 'crs_demo002',
    courseName: '資料科學與機器學習',
    title: 'Python 基礎測驗',
    description: '測試 Python 程式設計基礎知識',
    instructions: '本測驗共 5 題，時間限制 40 分鐘。',
    timeLimit: 40,
    maxAttempts: 1,
    shuffleQuestions: false,
    shuffleAnswers: true,
    showResults: 'immediately',
    passingScore: 60,
    maxScore: 100,
    questionCount: 5,
    questions: [
      { questionId: 'q_py001', order: 1, type: 'multiple_choice', text: 'Python 中用於輸出的函數是？', points: 20, options: ['echo()', 'printf()', 'print()', 'console.log()'], correctAnswer: 2 },
      { questionId: 'q_py002', order: 2, type: 'multiple_choice', text: '在 Python 中，如何定義一個列表？', points: 20, options: ['(1, 2, 3)', '[1, 2, 3]', '{1, 2, 3}', '<1, 2, 3>'], correctAnswer: 1 },
      { questionId: 'q_py003', order: 3, type: 'multiple_choice', text: 'Python 中用於定義函數的關鍵字是？', points: 20, options: ['function', 'def', 'func', 'define'], correctAnswer: 1 },
      { questionId: 'q_py004', order: 4, type: 'true_false', text: 'Python 使用大括號 {} 來定義程式碼區塊', points: 20, correctAnswer: false },
      { questionId: 'q_py005', order: 5, type: 'multiple_choice', text: '以下哪個是 Python 的資料類型？', points: 20, options: ['integer', 'char', 'int', 'long'], correctAnswer: 2 }
    ],
    status: 'published',
    openDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }
};

/**
 * 獲取測驗（包含 mock 回退）
 * 如果資料庫中的測驗沒有 questions，則合併 mock 資料
 */
async function getQuizWithFallback(quizId) {
  let quiz = await db.getItem(`QUIZ#${quizId}`, 'META');

  // 如果沒有資料，使用完整 mock
  if (!quiz && mockQuizzes[quizId]) {
    quiz = mockQuizzes[quizId];
  }
  // 如果有資料但沒有 questions，從 mock 合併 questions
  else if (quiz && (!quiz.questions || quiz.questions.length === 0) && mockQuizzes[quizId]) {
    quiz.questions = mockQuizzes[quizId].questions;
    quiz.questionCount = mockQuizzes[quizId].questionCount;
  }

  return quiz;
}

// ==================== 測驗列表與詳情 ====================

/**
 * GET /api/quizzes
 * 取得測驗列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId, status } = req.query;

    let quizzes = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'QUIZ' }
      }
    });

    // 課程篩選
    if (courseId) {
      quizzes = quizzes.filter(q => q.courseId === courseId);
    }

    // 狀態篩選
    const now = new Date();
    if (status === 'available') {
      quizzes = quizzes.filter(q => {
        const openDate = q.openDate ? new Date(q.openDate) : null;
        const closeDate = q.closeDate ? new Date(q.closeDate) : null;
        return (!openDate || openDate <= now) && (!closeDate || closeDate >= now);
      });
    } else if (status === 'upcoming') {
      quizzes = quizzes.filter(q => q.openDate && new Date(q.openDate) > now);
    } else if (status === 'closed') {
      quizzes = quizzes.filter(q => q.closeDate && new Date(q.closeDate) < now);
    }

    // 取得用戶的作答狀態
    const quizzesWithStatus = await Promise.all(
      quizzes.map(async (q) => {
        const attempts = await db.query(`QUIZ#${q.quizId}`, {
          skPrefix: `ATTEMPT#${userId}#`
        });

        const bestAttempt = attempts.reduce((best, current) => {
          if (!best || current.score > best.score) return current;
          return best;
        }, null);

        delete q.PK;
        delete q.SK;
        return {
          ...q,
          userStatus: {
            attemptCount: attempts.length,
            bestScore: bestAttempt?.score || null,
            lastAttemptAt: attempts.length > 0 ?
              attempts[attempts.length - 1].submittedAt : null,
            canAttempt: !q.maxAttempts || attempts.length < q.maxAttempts
          }
        };
      })
    );

    res.json({
      success: true,
      data: quizzesWithStatus,
      count: quizzesWithStatus.length
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
 * 取得測驗詳情（不包含答案）
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

    // 取得課程資訊
    const course = await db.getItem(`COURSE#${quiz.courseId}`, 'META');

    // 取得用戶的作答記錄
    const attempts = await db.query(`QUIZ#${id}`, {
      skPrefix: `ATTEMPT#${userId}#`
    });

    // 檢查是否有進行中的作答
    const inProgressAttempt = attempts.find(a => a.status === 'in_progress');

    delete quiz.PK;
    delete quiz.SK;

    // 不返回問題的答案
    if (quiz.questions) {
      quiz.questions = quiz.questions.map(q => {
        const { correctAnswer, correctAnswers, ...rest } = q;
        return rest;
      });
    }

    res.json({
      success: true,
      data: {
        ...quiz,
        courseName: course?.title,
        attempts: attempts.map(a => {
          delete a.PK;
          delete a.SK;
          // 不返回詳細答案
          delete a.answers;
          return a;
        }),
        inProgressAttemptId: inProgressAttempt?.attemptId,
        canAttempt: !quiz.maxAttempts || attempts.filter(a => a.status === 'completed').length < quiz.maxAttempts
      }
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

// ==================== 測驗管理（教師） ====================

/**
 * POST /api/quizzes
 * 建立新測驗
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      courseId,
      sectionId,
      title,
      description,
      instructions,
      openDate,
      closeDate,
      timeLimit, // 分鐘
      maxAttempts,
      gradeMethod = 'highest', // highest, average, first, last
      shuffleQuestions = false,
      shuffleAnswers = false,
      showResults = 'immediately', // immediately, after_close, never
      showCorrectAnswers = true,
      passingGrade = 60,
      questions = [],
      visible = true
    } = req.body;

    // 驗證必填欄位
    if (!courseId || !title) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供課程ID和測驗標題'
      });
    }

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限在此課程建立測驗'
      });
    }

    const quizId = db.generateId('quiz');
    const now = new Date().toISOString();

    // 處理問題，加入 ID
    const processedQuestions = questions.map((q, index) => ({
      questionId: db.generateId('q'),
      order: index + 1,
      ...q
    }));

    // 計算總分
    const totalPoints = processedQuestions.reduce((sum, q) => sum + (q.points || 1), 0);

    const quizItem = {
      PK: `QUIZ#${quizId}`,
      SK: 'META',
      entityType: 'QUIZ',
      GSI1PK: `COURSE#${courseId}`,
      GSI1SK: `QUIZ#${quizId}`,

      quizId,
      courseId,
      sectionId,
      title,
      description,
      instructions,

      // 時間設定
      openDate,
      closeDate,
      timeLimit,

      // 作答設定
      maxAttempts,
      gradeMethod,
      shuffleQuestions,
      shuffleAnswers,

      // 結果顯示設定
      showResults,
      showCorrectAnswers,
      passingGrade,

      // 問題
      questions: processedQuestions,
      questionCount: processedQuestions.length,
      totalPoints,

      visible,
      status: 'active',

      // 統計
      stats: {
        totalAttempts: 0,
        averageScore: 0,
        passRate: 0
      },

      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(quizItem);

    // 如果有 sectionId，也在課程活動中建立連結
    if (sectionId) {
      const activities = await db.query(`COURSE#${courseId}`, {
        skPrefix: `ACTIVITY#${sectionId}#`
      });
      const activityNumber = String(activities.length + 1).padStart(3, '0');

      const activityItem = {
        PK: `COURSE#${courseId}`,
        SK: `ACTIVITY#${sectionId}#${activityNumber}`,
        entityType: 'COURSE_ACTIVITY',

        activityId: quizId,
        courseId,
        sectionId,
        type: 'quiz',
        title,
        description,
        quizId,

        order: activities.length + 1,
        visible,

        completion: { type: 'grade', gradeToPass: passingGrade },

        createdAt: now,
        updatedAt: now
      };

      await db.putItem(activityItem);
    }

    delete quizItem.PK;
    delete quizItem.SK;

    res.status(201).json({
      success: true,
      message: '測驗建立成功',
      data: quizItem
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
    const updates = req.body;

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
        message: '沒有權限修改此測驗'
      });
    }

    // 不允許更新的欄位
    delete updates.quizId;
    delete updates.courseId;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.stats;

    // 如果更新問題，重新計算總分
    if (updates.questions) {
      updates.questions = updates.questions.map((q, index) => ({
        questionId: q.questionId || db.generateId('q'),
        order: index + 1,
        ...q
      }));
      updates.questionCount = updates.questions.length;
      updates.totalPoints = updates.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    }

    updates.updatedAt = new Date().toISOString();

    const updatedQuiz = await db.updateItem(`QUIZ#${id}`, 'META', updates);

    delete updatedQuiz.PK;
    delete updatedQuiz.SK;

    res.json({
      success: true,
      message: '測驗已更新',
      data: updatedQuiz
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
 * DELETE /api/quizzes/:id
 * 刪除測驗
 */
router.delete('/:id', authMiddleware, async (req, res) => {
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
        message: '沒有權限刪除此測驗'
      });
    }

    // 刪除所有作答記錄
    const attempts = await db.query(`QUIZ#${id}`, { skPrefix: 'ATTEMPT#' });
    for (const attempt of attempts) {
      await db.deleteItem(`QUIZ#${id}`, attempt.SK);
    }

    // 刪除測驗
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

// ==================== 題目管理 ====================

/**
 * POST /api/quizzes/:id/questions
 * 新增問題
 */
router.post('/:id/questions', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      type, // multiple_choice, true_false, short_answer, matching, essay
      text,
      options, // 選擇題選項
      correctAnswer, // 正確答案
      correctAnswers, // 多選題的多個正確答案
      points = 1,
      feedback, // 答案解釋
      hint
    } = req.body;

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
        message: '沒有權限修改此測驗'
      });
    }

    const newQuestion = {
      questionId: db.generateId('q'),
      order: (quiz.questions?.length || 0) + 1,
      type,
      text,
      options,
      correctAnswer,
      correctAnswers,
      points,
      feedback,
      hint
    };

    const questions = [...(quiz.questions || []), newQuestion];
    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

    await db.updateItem(`QUIZ#${id}`, 'META', {
      questions,
      questionCount: questions.length,
      totalPoints,
      updatedAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: '問題新增成功',
      data: newQuestion
    });

  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '新增問題失敗'
    });
  }
});

/**
 * PUT /api/quizzes/:id/questions/:questionId
 * 更新問題
 */
router.put('/:id/questions/:questionId', authMiddleware, async (req, res) => {
  try {
    const { id, questionId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

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
        message: '沒有權限修改此測驗'
      });
    }

    const questions = quiz.questions.map(q => {
      if (q.questionId === questionId) {
        return { ...q, ...updates };
      }
      return q;
    });

    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

    await db.updateItem(`QUIZ#${id}`, 'META', {
      questions,
      totalPoints,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '問題已更新'
    });

  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新問題失敗'
    });
  }
});

/**
 * DELETE /api/quizzes/:id/questions/:questionId
 * 刪除問題
 */
router.delete('/:id/questions/:questionId', authMiddleware, async (req, res) => {
  try {
    const { id, questionId } = req.params;
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
        message: '沒有權限修改此測驗'
      });
    }

    const questions = quiz.questions.filter(q => q.questionId !== questionId);
    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

    // 重新排序
    questions.forEach((q, index) => {
      q.order = index + 1;
    });

    await db.updateItem(`QUIZ#${id}`, 'META', {
      questions,
      questionCount: questions.length,
      totalPoints,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '問題已刪除'
    });

  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除問題失敗'
    });
  }
});

// ==================== 作答流程（學生） ====================

/**
 * POST /api/quizzes/:id/start
 * 開始測驗
 */
router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 使用 fallback 函數取得測驗（含 mock 資料）
    const quiz = await getQuizWithFallback(id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: 'QUIZ_NOT_FOUND',
        message: '找不到此測驗'
      });
    }

    // 檢查是否已報名課程（允許 mock 模式跳過）
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${quiz.courseId}`);
    if (!progress && !mockQuizzes[id]) {
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
      }
    }

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

// ==================== 題庫管理（Question Bank） ====================

/**
 * GET /api/quizzes/questionbank
 * 取得題庫列表
 */
router.get('/questionbank', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId, categoryId, type, tags, search, page = 1, limit = 20 } = req.query;

    // 查詢題庫
    let questions = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'QUESTION_BANK' }
      }
    });

    // 權限篩選：只顯示自己建立的或公開的問題
    if (!req.user.isAdmin) {
      questions = questions.filter(q =>
        q.createdBy === userId ||
        q.visibility === 'public' ||
        (q.visibility === 'course' && q.courseId === courseId)
      );
    }

    // 課程篩選
    if (courseId) {
      questions = questions.filter(q => q.courseId === courseId || !q.courseId);
    }

    // 分類篩選
    if (categoryId) {
      questions = questions.filter(q => q.categoryId === categoryId);
    }

    // 題型篩選
    if (type) {
      questions = questions.filter(q => q.type === type);
    }

    // 標籤篩選
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim().toLowerCase());
      questions = questions.filter(q =>
        q.tags && q.tags.some(t => tagList.includes(t.toLowerCase()))
      );
    }

    // 關鍵字搜尋
    if (search) {
      const searchLower = search.toLowerCase();
      questions = questions.filter(q =>
        q.text.toLowerCase().includes(searchLower) ||
        (q.tags && q.tags.some(t => t.toLowerCase().includes(searchLower)))
      );
    }

    // 分頁
    const total = questions.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedQuestions = questions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(startIndex, startIndex + parseInt(limit));

    // 移除敏感資料
    const sanitizedQuestions = paginatedQuestions.map(q => {
      delete q.PK;
      delete q.SK;
      return q;
    });

    res.json({
      success: true,
      data: sanitizedQuestions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get question bank error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得題庫失敗'
    });
  }
});

/**
 * GET /api/quizzes/questionbank/categories
 * 取得題庫分類
 */
router.get('/questionbank/categories', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.query;

    let categories = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'QUESTION_CATEGORY' }
      }
    });

    // 課程篩選
    if (courseId) {
      categories = categories.filter(c => c.courseId === courseId || c.isSystem);
    }

    // 移除敏感資料並排序
    const sanitizedCategories = categories
      .map(c => {
        delete c.PK;
        delete c.SK;
        return c;
      })
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    res.json({
      success: true,
      data: sanitizedCategories
    });

  } catch (error) {
    console.error('Get question categories error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得題目分類失敗'
    });
  }
});

/**
 * POST /api/quizzes/questionbank/categories
 * 建立題庫分類
 */
router.post('/questionbank/categories', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, nameEn, courseId, parentId, description, sortOrder = 0 } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供分類名稱'
      });
    }

    const categoryId = db.generateId('qcat');
    const now = new Date().toISOString();

    const categoryItem = {
      PK: 'QUESTION_CATEGORIES',
      SK: `CATEGORY#${categoryId}`,
      entityType: 'QUESTION_CATEGORY',

      categoryId,
      name,
      nameEn: nameEn || name,
      description: description || '',
      courseId: courseId || null,
      parentId: parentId || null,
      sortOrder,
      questionCount: 0,
      isSystem: false,

      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(categoryItem);

    delete categoryItem.PK;
    delete categoryItem.SK;

    res.status(201).json({
      success: true,
      message: '分類建立成功',
      data: categoryItem
    });

  } catch (error) {
    console.error('Create question category error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立分類失敗'
    });
  }
});

/**
 * POST /api/quizzes/questionbank
 * 新增題目到題庫
 */
router.post('/questionbank', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      courseId,
      categoryId,
      type,
      text,
      options,
      correctAnswer,
      correctAnswers,
      points = 1,
      feedback,
      hint,
      difficulty = 'medium', // easy, medium, hard
      tags = [],
      visibility = 'private' // private, course, public
    } = req.body;

    if (!type || !text) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供題型和題目內容'
      });
    }

    const questionId = db.generateId('qb');
    const now = new Date().toISOString();

    const questionItem = {
      PK: `QUESTIONBANK#${courseId || 'GLOBAL'}`,
      SK: `QUESTION#${questionId}`,
      GSI1PK: categoryId ? `QCAT#${categoryId}` : 'QCAT#UNCATEGORIZED',
      GSI1SK: `QUESTION#${questionId}`,
      entityType: 'QUESTION_BANK',

      questionId,
      courseId: courseId || null,
      categoryId: categoryId || null,

      type,
      text,
      options: options || null,
      correctAnswer: correctAnswer || null,
      correctAnswers: correctAnswers || null,
      points,
      feedback: feedback || null,
      hint: hint || null,

      difficulty,
      tags: tags.map(t => t.toLowerCase()),
      visibility,

      usageCount: 0, // 被引用到測驗的次數

      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(questionItem);

    // 更新分類的題目數量
    if (categoryId) {
      const category = await db.getItem('QUESTION_CATEGORIES', `CATEGORY#${categoryId}`);
      if (category) {
        await db.updateItem('QUESTION_CATEGORIES', `CATEGORY#${categoryId}`, {
          questionCount: (category.questionCount || 0) + 1,
          updatedAt: now
        });
      }
    }

    delete questionItem.PK;
    delete questionItem.SK;
    delete questionItem.GSI1PK;
    delete questionItem.GSI1SK;

    res.status(201).json({
      success: true,
      message: '題目已加入題庫',
      data: questionItem
    });

  } catch (error) {
    console.error('Add to question bank error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '新增題目失敗'
    });
  }
});

/**
 * PUT /api/quizzes/questionbank/:questionId
 * 更新題庫題目
 */
router.put('/questionbank/:questionId', authMiddleware, async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    // 查找題目
    const questions = await db.scan({
      filter: {
        expression: 'entityType = :type AND questionId = :qid',
        values: { ':type': 'QUESTION_BANK', ':qid': questionId }
      }
    });

    if (questions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'QUESTION_NOT_FOUND',
        message: '找不到此題目'
      });
    }

    const question = questions[0];

    // 權限檢查
    if (question.createdBy !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此題目'
      });
    }

    // 不允許更新的欄位
    delete updates.questionId;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.usageCount;

    if (updates.tags) {
      updates.tags = updates.tags.map(t => t.toLowerCase());
    }

    updates.updatedAt = new Date().toISOString();

    await db.updateItem(question.PK, question.SK, updates);

    res.json({
      success: true,
      message: '題目已更新'
    });

  } catch (error) {
    console.error('Update question bank error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新題目失敗'
    });
  }
});

/**
 * DELETE /api/quizzes/questionbank/:questionId
 * 刪除題庫題目
 */
router.delete('/questionbank/:questionId', authMiddleware, async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.user.userId;

    // 查找題目
    const questions = await db.scan({
      filter: {
        expression: 'entityType = :type AND questionId = :qid',
        values: { ':type': 'QUESTION_BANK', ':qid': questionId }
      }
    });

    if (questions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'QUESTION_NOT_FOUND',
        message: '找不到此題目'
      });
    }

    const question = questions[0];

    // 權限檢查
    if (question.createdBy !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此題目'
      });
    }

    await db.deleteItem(question.PK, question.SK);

    // 更新分類的題目數量
    if (question.categoryId) {
      const category = await db.getItem('QUESTION_CATEGORIES', `CATEGORY#${question.categoryId}`);
      if (category && category.questionCount > 0) {
        await db.updateItem('QUESTION_CATEGORIES', `CATEGORY#${question.categoryId}`, {
          questionCount: category.questionCount - 1,
          updatedAt: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      message: '題目已刪除'
    });

  } catch (error) {
    console.error('Delete question bank error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除題目失敗'
    });
  }
});

/**
 * POST /api/quizzes/questionbank/import
 * 批量匯入題目
 */
router.post('/questionbank/import', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId, categoryId, questions, format = 'json' } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供題目陣列'
      });
    }

    const now = new Date().toISOString();
    const results = { success: [], failed: [] };

    for (const q of questions) {
      try {
        if (!q.type || !q.text) {
          results.failed.push({ text: q.text?.substring(0, 50), error: '缺少必要欄位' });
          continue;
        }

        const questionId = db.generateId('qb');

        const questionItem = {
          PK: `QUESTIONBANK#${courseId || 'GLOBAL'}`,
          SK: `QUESTION#${questionId}`,
          GSI1PK: categoryId ? `QCAT#${categoryId}` : 'QCAT#UNCATEGORIZED',
          GSI1SK: `QUESTION#${questionId}`,
          entityType: 'QUESTION_BANK',

          questionId,
          courseId: courseId || null,
          categoryId: categoryId || null,

          type: q.type,
          text: q.text,
          options: q.options || null,
          correctAnswer: q.correctAnswer || null,
          correctAnswers: q.correctAnswers || null,
          points: q.points || 1,
          feedback: q.feedback || null,
          hint: q.hint || null,

          difficulty: q.difficulty || 'medium',
          tags: (q.tags || []).map(t => t.toLowerCase()),
          visibility: 'course',

          usageCount: 0,

          createdBy: userId,
          createdAt: now,
          updatedAt: now
        };

        await db.putItem(questionItem);
        results.success.push({ questionId, text: q.text.substring(0, 50) });
      } catch (err) {
        results.failed.push({ text: q.text?.substring(0, 50), error: err.message });
      }
    }

    // 更新分類的題目數量
    if (categoryId && results.success.length > 0) {
      const category = await db.getItem('QUESTION_CATEGORIES', `CATEGORY#${categoryId}`);
      if (category) {
        await db.updateItem('QUESTION_CATEGORIES', `CATEGORY#${categoryId}`, {
          questionCount: (category.questionCount || 0) + results.success.length,
          updatedAt: now
        });
      }
    }

    res.json({
      success: true,
      message: `成功匯入 ${results.success.length} 題，失敗 ${results.failed.length} 題`,
      data: results
    });

  } catch (error) {
    console.error('Import questions error:', error);
    res.status(500).json({
      success: false,
      error: 'IMPORT_FAILED',
      message: '匯入題目失敗'
    });
  }
});

/**
 * GET /api/quizzes/questionbank/export
 * 匯出題目
 */
router.get('/questionbank/export', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId, categoryId, format = 'json' } = req.query;

    let questions = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'QUESTION_BANK' }
      }
    });

    // 權限篩選
    if (!req.user.isAdmin) {
      questions = questions.filter(q => q.createdBy === userId || q.visibility === 'public');
    }

    // 課程篩選
    if (courseId) {
      questions = questions.filter(q => q.courseId === courseId);
    }

    // 分類篩選
    if (categoryId) {
      questions = questions.filter(q => q.categoryId === categoryId);
    }

    // 格式化輸出
    const exportData = questions.map(q => ({
      type: q.type,
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      correctAnswers: q.correctAnswers,
      points: q.points,
      feedback: q.feedback,
      hint: q.hint,
      difficulty: q.difficulty,
      tags: q.tags
    }));

    if (format === 'csv') {
      // CSV 格式輸出
      const csvHeader = 'type,text,options,correctAnswer,points,difficulty,tags\n';
      const csvRows = exportData.map(q =>
        `"${q.type}","${q.text.replace(/"/g, '""')}","${(q.options || []).join('|')}","${q.correctAnswer || ''}",${q.points},"${q.difficulty}","${(q.tags || []).join(',')}"`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=questions.csv');
      res.send('\ufeff' + csvHeader + csvRows); // UTF-8 BOM
    } else {
      res.json({
        success: true,
        data: {
          exportedAt: new Date().toISOString(),
          count: exportData.length,
          questions: exportData
        }
      });
    }

  } catch (error) {
    console.error('Export questions error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出題目失敗'
    });
  }
});

/**
 * POST /api/quizzes/:id/add-from-bank
 * 從題庫加入題目到測驗
 */
router.post('/:id/add-from-bank', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { questionIds } = req.body;

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供要加入的題目 ID'
      });
    }

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
        message: '沒有權限修改此測驗'
      });
    }

    // 查找題庫題目
    const bankQuestions = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'QUESTION_BANK' }
      }
    });

    const selectedQuestions = bankQuestions.filter(q => questionIds.includes(q.questionId));
    const now = new Date().toISOString();

    // 加入測驗
    const currentQuestions = quiz.questions || [];
    let order = currentQuestions.length;

    const newQuestions = selectedQuestions.map(q => {
      order++;
      return {
        questionId: db.generateId('q'),
        bankQuestionId: q.questionId, // 保存原始題庫ID以便追蹤
        order,
        type: q.type,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        correctAnswers: q.correctAnswers,
        points: q.points,
        feedback: q.feedback,
        hint: q.hint
      };
    });

    const allQuestions = [...currentQuestions, ...newQuestions];
    const totalPoints = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);

    await db.updateItem(`QUIZ#${id}`, 'META', {
      questions: allQuestions,
      questionCount: allQuestions.length,
      totalPoints,
      updatedAt: now
    });

    // 更新題庫題目的使用次數
    for (const q of selectedQuestions) {
      await db.updateItem(q.PK, q.SK, {
        usageCount: (q.usageCount || 0) + 1,
        updatedAt: now
      });
    }

    res.json({
      success: true,
      message: `已加入 ${newQuestions.length} 題`,
      data: {
        addedCount: newQuestions.length,
        totalQuestions: allQuestions.length,
        totalPoints
      }
    });

  } catch (error) {
    console.error('Add from bank error:', error);
    res.status(500).json({
      success: false,
      error: 'ADD_FAILED',
      message: '從題庫加入題目失敗'
    });
  }
});

/**
 * POST /api/quizzes/:id/add-random
 * 從題庫隨機抽取題目
 */
router.post('/:id/add-random', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      count = 5,
      categoryId,
      difficulty,
      tags,
      excludeExisting = true
    } = req.body;

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
        message: '沒有權限修改此測驗'
      });
    }

    // 查找符合條件的題庫題目
    let bankQuestions = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'QUESTION_BANK' }
      }
    });

    // 篩選課程
    bankQuestions = bankQuestions.filter(q =>
      q.courseId === quiz.courseId || q.visibility === 'public'
    );

    // 分類篩選
    if (categoryId) {
      bankQuestions = bankQuestions.filter(q => q.categoryId === categoryId);
    }

    // 難度篩選
    if (difficulty) {
      bankQuestions = bankQuestions.filter(q => q.difficulty === difficulty);
    }

    // 標籤篩選
    if (tags && tags.length > 0) {
      const tagList = tags.map(t => t.toLowerCase());
      bankQuestions = bankQuestions.filter(q =>
        q.tags && q.tags.some(t => tagList.includes(t))
      );
    }

    // 排除已在測驗中的題目
    if (excludeExisting && quiz.questions) {
      const existingBankIds = quiz.questions
        .filter(q => q.bankQuestionId)
        .map(q => q.bankQuestionId);
      bankQuestions = bankQuestions.filter(q => !existingBankIds.includes(q.questionId));
    }

    if (bankQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_QUESTIONS_FOUND',
        message: '沒有符合條件的題目'
      });
    }

    // 隨機抽取
    const shuffled = shuffleArray(bankQuestions);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    const now = new Date().toISOString();
    const currentQuestions = quiz.questions || [];
    let order = currentQuestions.length;

    const newQuestions = selected.map(q => {
      order++;
      return {
        questionId: db.generateId('q'),
        bankQuestionId: q.questionId,
        order,
        type: q.type,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        correctAnswers: q.correctAnswers,
        points: q.points,
        feedback: q.feedback,
        hint: q.hint
      };
    });

    const allQuestions = [...currentQuestions, ...newQuestions];
    const totalPoints = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);

    await db.updateItem(`QUIZ#${id}`, 'META', {
      questions: allQuestions,
      questionCount: allQuestions.length,
      totalPoints,
      updatedAt: now
    });

    // 更新使用次數
    for (const q of selected) {
      await db.updateItem(q.PK, q.SK, {
        usageCount: (q.usageCount || 0) + 1,
        updatedAt: now
      });
    }

    res.json({
      success: true,
      message: `已隨機加入 ${newQuestions.length} 題`,
      data: {
        requestedCount: count,
        addedCount: newQuestions.length,
        availableCount: bankQuestions.length,
        totalQuestions: allQuestions.length,
        totalPoints
      }
    });

  } catch (error) {
    console.error('Add random questions error:', error);
    res.status(500).json({
      success: false,
      error: 'ADD_FAILED',
      message: '隨機加入題目失敗'
    });
  }
});

/**
 * POST /api/quizzes/:id/save-to-bank
 * 將測驗題目保存到題庫
 */
router.post('/:id/save-to-bank', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { questionIds, categoryId, tags = [] } = req.body;

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
        message: '沒有權限操作此測驗'
      });
    }

    // 篩選要保存的題目
    let questionsToSave = quiz.questions || [];
    if (questionIds && questionIds.length > 0) {
      questionsToSave = questionsToSave.filter(q => questionIds.includes(q.questionId));
    }

    // 排除已經是從題庫來的題目
    questionsToSave = questionsToSave.filter(q => !q.bankQuestionId);

    if (questionsToSave.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_QUESTIONS',
        message: '沒有可保存的題目'
      });
    }

    const now = new Date().toISOString();
    const results = { success: [], failed: [] };

    for (const q of questionsToSave) {
      try {
        const bankQuestionId = db.generateId('qb');

        const questionItem = {
          PK: `QUESTIONBANK#${quiz.courseId}`,
          SK: `QUESTION#${bankQuestionId}`,
          GSI1PK: categoryId ? `QCAT#${categoryId}` : 'QCAT#UNCATEGORIZED',
          GSI1SK: `QUESTION#${bankQuestionId}`,
          entityType: 'QUESTION_BANK',

          questionId: bankQuestionId,
          courseId: quiz.courseId,
          categoryId: categoryId || null,

          type: q.type,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
          correctAnswers: q.correctAnswers,
          points: q.points,
          feedback: q.feedback,
          hint: q.hint,

          difficulty: 'medium',
          tags: tags.map(t => t.toLowerCase()),
          visibility: 'course',
          usageCount: 1,

          sourceQuizId: id,
          sourceQuizTitle: quiz.title,

          createdBy: userId,
          createdAt: now,
          updatedAt: now
        };

        await db.putItem(questionItem);
        results.success.push({ questionId: bankQuestionId, text: q.text.substring(0, 50) });
      } catch (err) {
        results.failed.push({ text: q.text?.substring(0, 50), error: err.message });
      }
    }

    // 更新分類的題目數量
    if (categoryId && results.success.length > 0) {
      const category = await db.getItem('QUESTION_CATEGORIES', `CATEGORY#${categoryId}`);
      if (category) {
        await db.updateItem('QUESTION_CATEGORIES', `CATEGORY#${categoryId}`, {
          questionCount: (category.questionCount || 0) + results.success.length,
          updatedAt: now
        });
      }
    }

    res.json({
      success: true,
      message: `已保存 ${results.success.length} 題到題庫`,
      data: results
    });

  } catch (error) {
    console.error('Save to bank error:', error);
    res.status(500).json({
      success: false,
      error: 'SAVE_FAILED',
      message: '保存到題庫失敗'
    });
  }
});

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

// ==================== 輔助函數 ====================

/**
 * 準備學生作答用的問題（可能打亂順序）
 */
function prepareQuestionsForStudent(questions, shuffleQuestions, shuffleAnswers) {
  // 如果沒有題目，返回空陣列
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  let preparedQuestions = questions.map(q => {
    // 移除正確答案
    const { correctAnswer, correctAnswers, feedback, ...rest } = q;

    // 打亂選項（如果需要）
    if (shuffleAnswers && rest.options) {
      rest.options = shuffleArray([...rest.options]);
    }

    return rest;
  });

  // 打亂問題順序（如果需要）
  if (shuffleQuestions) {
    preparedQuestions = shuffleArray(preparedQuestions);
  }

  return preparedQuestions;
}

/**
 * Fisher-Yates 洗牌演算法
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 評分測驗
 */
function gradeQuiz(questions, answers) {
  let score = 0;
  let totalPoints = 0;
  const questionResults = [];

  for (const question of questions) {
    const points = question.points || 1;
    totalPoints += points;

    const userAnswer = answers[question.questionId];
    let isCorrect = false;
    let earnedPoints = 0;

    switch (question.type) {
      case 'multiple_choice':
      case 'true_false':
        isCorrect = userAnswer === question.correctAnswer;
        earnedPoints = isCorrect ? points : 0;
        break;

      case 'multiple_select':
        // 多選題：部分給分
        if (Array.isArray(userAnswer) && Array.isArray(question.correctAnswers)) {
          const correctSet = new Set(question.correctAnswers);
          const userSet = new Set(userAnswer);
          const correctSelected = [...userSet].filter(a => correctSet.has(a)).length;
          const incorrectSelected = [...userSet].filter(a => !correctSet.has(a)).length;
          const totalCorrect = question.correctAnswers.length;

          // 扣除錯誤選擇
          const rawScore = (correctSelected - incorrectSelected) / totalCorrect;
          earnedPoints = Math.max(0, Math.round(rawScore * points * 100) / 100);
          isCorrect = earnedPoints === points;
        }
        break;

      case 'short_answer':
        // 短答題：檢查是否包含正確答案（不區分大小寫）
        if (userAnswer && question.correctAnswers) {
          const userLower = userAnswer.toLowerCase().trim();
          isCorrect = question.correctAnswers.some(ans =>
            userLower === ans.toLowerCase().trim()
          );
          earnedPoints = isCorrect ? points : 0;
        }
        break;

      case 'essay':
        // 申論題：需要手動評分，暫時給 0 分
        earnedPoints = 0;
        isCorrect = null; // 待評分
        break;

      default:
        break;
    }

    score += earnedPoints;
    questionResults.push({
      questionId: question.questionId,
      isCorrect,
      earnedPoints,
      maxPoints: points
    });
  }

  return { score, totalPoints, questionResults };
}

// ==================== 防作弊機制 API ====================

/**
 * 防作弊設定常量
 */
const ANTI_CHEAT_SETTINGS = {
  // 焦點離開最大次數
  maxFocusLossCount: 5,
  // 複製嘗試最大次數
  maxCopyAttempts: 3,
  // 可疑行為警告閾值
  suspiciousBehaviorThreshold: 10,
  // IP 改變是否允許
  allowIpChange: false
};

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

    if (quiz.createdBy !== userId && !req.user.isAdmin) {
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
    const isOwner = quiz.createdBy === userId || req.user.isAdmin;

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

    if (quiz.createdBy !== userId && !req.user.isAdmin) {
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
 * 計算風險等級
 */
function calculateRiskLevel(suspiciousScore) {
  if (suspiciousScore >= 20) return 'high';
  if (suspiciousScore >= 10) return 'medium';
  if (suspiciousScore >= 5) return 'low';
  return 'none';
}

/**
 * 生成警示標記
 */
function generateFlags(attempt) {
  const flags = [];
  const stats = attempt.behaviorStats || {};

  if (stats.focusLossCount >= 5) {
    flags.push({
      type: 'excessive_focus_loss',
      severity: 'high',
      message: `離開頁面 ${stats.focusLossCount} 次`
    });
  } else if (stats.focusLossCount >= 3) {
    flags.push({
      type: 'focus_loss',
      severity: 'medium',
      message: `離開頁面 ${stats.focusLossCount} 次`
    });
  }

  if (stats.copyAttempts > 0) {
    flags.push({
      type: 'copy_attempt',
      severity: 'medium',
      message: `嘗試複製 ${stats.copyAttempts} 次`
    });
  }

  if (stats.devtoolsOpens > 0) {
    flags.push({
      type: 'devtools_open',
      severity: 'high',
      message: `開啟開發者工具 ${stats.devtoolsOpens} 次`
    });
  }

  if (stats.fullscreenExits > 0) {
    flags.push({
      type: 'fullscreen_exit',
      severity: 'medium',
      message: `退出全螢幕 ${stats.fullscreenExits} 次`
    });
  }

  // 檢查作答時間是否異常短
  if (attempt.submittedAt && attempt.startedAt) {
    const durationMinutes = (new Date(attempt.submittedAt) - new Date(attempt.startedAt)) / 60000;
    if (durationMinutes < 2 && attempt.percentage > 80) {
      flags.push({
        type: 'quick_completion',
        severity: 'high',
        message: `作答時間異常短（${Math.round(durationMinutes)} 分鐘）且成績高`
      });
    }
  }

  return flags;
}

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

    if (quiz.createdBy !== userId && !req.user.isAdmin) {
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
