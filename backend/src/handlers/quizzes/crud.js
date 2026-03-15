/**
 * 測驗 CRUD 操作
 * BeyondBridge Education Platform - Quiz CRUD & Question Management
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse } = require('../../utils/course-access');
const { invalidateGradebookSnapshots } = require('../../utils/gradebook-snapshots');
const { syncCourseActivityLink, deleteCourseActivityLink } = require('../../utils/course-activities');

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

    if (!req.user.isAdmin) {
      const [progressList, teachingCourses] = await Promise.all([
        db.getUserCourseProgress(userId),
        db.scan({
          filter: {
            expression: 'entityType = :type AND (instructorId = :userId OR teacherId = :userId OR creatorId = :userId OR createdBy = :userId OR contains(instructors, :userId))',
            values: { ':type': 'COURSE', ':userId': userId }
          }
        })
      ]);

      const allowedCourseIds = new Set([
        ...progressList.map(item => item.courseId).filter(Boolean),
        ...teachingCourses.map(item => item.courseId).filter(Boolean)
      ]);
      quizzes = quizzes.filter(item => allowedCourseIds.has(item.courseId));
    }

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
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${quiz.courseId}`);
    if (!req.user.isAdmin && !canManageCourse(course, req.user) && !progress) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此測驗'
      });
    }

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

    if (!canManageCourse(course, req.user)) {
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

    await invalidateGradebookSnapshots(courseId);

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
    if (!canManageCourse(course, req.user)) {
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

    await syncCourseActivityLink(quiz.courseId, id, {
      title: updatedQuiz.title || quiz.title,
      description: updatedQuiz.description || quiz.description,
      visible: updatedQuiz.visible !== false
    });

    await invalidateGradebookSnapshots(quiz.courseId);

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
    if (!canManageCourse(course, req.user)) {
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
    await deleteCourseActivityLink(quiz.courseId, id);
    await invalidateGradebookSnapshots(quiz.courseId);

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
    if (!canManageCourse(course, req.user)) {
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
    await invalidateGradebookSnapshots(quiz.courseId);

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
    if (!canManageCourse(course, req.user)) {
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
    await invalidateGradebookSnapshots(quiz.courseId);

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
    if (!canManageCourse(course, req.user)) {
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
    await invalidateGradebookSnapshots(quiz.courseId);

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

module.exports = router;
