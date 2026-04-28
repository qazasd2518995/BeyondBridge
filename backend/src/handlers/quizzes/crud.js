/**
 * 測驗 CRUD 操作
 * BeyondBridge Education Platform - Quiz CRUD & Question Management
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse, isTeachingUser } = require('../../utils/course-access');
const { invalidateGradebookSnapshots } = require('../../utils/gradebook-snapshots');
const { syncCourseActivityLink, deleteCourseActivityLink } = require('../../utils/course-activities');
const {
  getGradeVisibility,
  maskQuizUserStatus,
  maskQuizAttempt
} = require('../../utils/grade-visibility');
const { getQuizResultVisibility } = require('../../utils/quiz-result-visibility');
const {
  listManagedCourseIds,
  backfillCourseOwnerLinks
} = require('../../utils/course-owner-links');
const { inferQuizAnalysisProfile } = require('../../utils/toeic-parts');

function uniqueIds(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function stripDbKeys(item = {}) {
  if (!item || typeof item !== 'object') return item;
  const { PK, SK, ...rest } = item;
  return rest;
}

const MAX_SAFE_QUIZ_ITEM_BYTES = (() => {
  const configured = parseInt(process.env.MAX_QUIZ_ITEM_BYTES, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 360 * 1024;
})();

function estimateItemBytes(item) {
  return Buffer.byteLength(JSON.stringify(item || {}), 'utf8');
}

function ensureQuizItemWithinLimit(res, item) {
  const sizeBytes = estimateItemBytes(item);
  if (sizeBytes <= MAX_SAFE_QUIZ_ITEM_BYTES) {
    return true;
  }

  res.status(400).json({
    success: false,
    error: 'QUIZ_TOO_LARGE',
    message: '這份測驗題目資料過大，請拆成多份測驗或減少題幹、解析、選項中的重複長文字後再儲存。',
    data: {
      sizeBytes,
      maxBytes: MAX_SAFE_QUIZ_ITEM_BYTES
    }
  });
  return false;
}

async function getManagedQuizCourseIds(user) {
  if (!user?.userId || !isTeachingUser(user) || user.isAdmin) {
    return [];
  }

  const linkedCourseIds = await listManagedCourseIds(user.userId);
  if (linkedCourseIds.length > 0) {
    return linkedCourseIds;
  }

  const courses = await db.getItemsByEntityType('COURSE', {
    projection: [
      'courseId',
      'title',
      'name',
      'category',
      'visibility',
      'status',
      'updatedAt',
      'createdAt',
      'instructorId',
      'teacherId',
      'creatorId',
      'createdBy',
      'instructors'
    ]
  });
  const managedCourses = courses.filter(course => canManageCourse(course, user));

  if (managedCourses.length > 0) {
    await backfillCourseOwnerLinks(managedCourses);
  }

  return uniqueIds(managedCourses.map(course => course.courseId));
}

async function listQuizzesForCourseIds(courseIds = []) {
  const ids = uniqueIds(courseIds);
  if (ids.length === 0) return [];

  const results = await Promise.all(ids.map(courseId =>
    db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
      skName: 'GSI1SK',
      skPrefix: 'QUIZ#'
    })
  ));

  return results.flat().filter(Boolean);
}

async function getQuizCourseMap(quizzes = []) {
  const courseIds = uniqueIds(quizzes.map(item => item.courseId));
  if (courseIds.length === 0) return new Map();

  const courses = await db.getCoursesByIds(courseIds, {
    projection: [
      'courseId',
      'settings',
      'instructorId',
      'teacherId',
      'creatorId',
      'createdBy',
      'instructors'
    ]
  });

  return new Map(
    courses
      .filter(course => course?.courseId)
      .map(course => [course.courseId, course])
  );
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

    let quizzes = [];

    if (req.user.isAdmin) {
      quizzes = courseId
        ? await listQuizzesForCourseIds([courseId])
        : await db.getItemsByEntityType('QUIZ');
    } else {
      const [progressList, managedCourseIds] = await Promise.all([
        db.getUserCourseProgress(userId),
        getManagedQuizCourseIds(req.user)
      ]);
      const allowedCourseIds = uniqueIds([
        ...progressList.map(item => item.courseId),
        ...managedCourseIds
      ]);
      const targetCourseIds = courseId
        ? allowedCourseIds.filter(id => id === courseId)
        : allowedCourseIds;
      quizzes = await listQuizzesForCourseIds(targetCourseIds);
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

    // 學生不應看到尚未發布給學生的測驗；教師/管理員可管理隱藏測驗。
    const courseMap = await getQuizCourseMap(quizzes);
    quizzes = quizzes.filter((q) => {
      if (q.visible !== false) return true;
      const course = courseMap.get(q.courseId);
      return req.user.isAdmin || canManageCourse(course, req.user);
    });

    // 取得用戶的作答狀態
    const quizzesWithStatus = await Promise.all(
      quizzes.map(async (q) => {
        const attempts = await db.query(`QUIZ#${q.quizId}`, {
          skPrefix: `ATTEMPT#${userId}#`
        });
        const completedAttempts = attempts.filter(a => a.status === 'completed');

        const bestAttempt = attempts.reduce((best, current) => {
          if (!best || current.score > best.score) return current;
          return best;
        }, null);
        const course = courseMap.get(q.courseId) || null;
        const canManage = req.user.isAdmin || canManageCourse(course, req.user);
        const gradeVisibility = getGradeVisibility(course, {
          canManage,
          isAdmin: req.user.isAdmin
        });
        const resultVisibility = getQuizResultVisibility(q, gradeVisibility, new Date(), { canManage });
        const userStatus = {
          attemptCount: attempts.length,
          bestScore: bestAttempt?.score || null,
          lastAttemptAt: attempts.length > 0 ?
            attempts[attempts.length - 1].submittedAt : null,
          canAttempt: !q.maxAttempts || completedAttempts.length < q.maxAttempts
        };
        return {
          ...stripDbKeys(q),
          userStatus: resultVisibility.resultsAvailable ? userStatus : maskQuizUserStatus(userStatus),
          gradeVisibility,
          resultVisibility
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
    const canManage = req.user.isAdmin || canManageCourse(course, req.user);

    if (!canManage && !progress) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此測驗'
      });
    }

    if (!canManage && quiz.visible === false) {
      return res.status(403).json({
        success: false,
        error: 'QUIZ_HIDDEN',
        message: '此測驗尚未開放給學生'
      });
    }

    // 取得用戶的作答記錄
    const attempts = await db.query(`QUIZ#${id}`, {
      skPrefix: `ATTEMPT#${userId}#`
    });
    const gradeVisibility = getGradeVisibility(course, {
      canManage,
      isAdmin: req.user.isAdmin
    });
    const resultVisibility = getQuizResultVisibility(quiz, gradeVisibility, new Date(), { canManage });

    // 檢查是否有進行中的作答
    const inProgressAttempt = attempts.find(a => a.status === 'in_progress');

    delete quiz.PK;
    delete quiz.SK;

    // 只有學生端需要隱藏正確答案，教師與管理員保留完整題目資料供編輯
    if (quiz.questions && !canManage) {
      quiz.questions = quiz.questions.map(q => {
        const {
          correctAnswer,
          correctAnswers,
          matchingPairs,
          pairs,
          orderingItems,
          orderItems,
          numericAnswer,
          numericTolerance,
          tolerance,
          clozeAnswers,
          ...rest
        } = q;
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
          const visibleAttempt = resultVisibility.resultsAvailable ? a : maskQuizAttempt(a);
          return {
            ...visibleAttempt,
            resultVisibility,
            canReview: resultVisibility.resultsAvailable && a.status === 'completed'
          };
        }),
        inProgressAttemptId: inProgressAttempt?.attemptId,
        canAttempt: !quiz.maxAttempts || attempts.filter(a => a.status === 'completed').length < quiz.maxAttempts,
        gradeVisibility,
        resultVisibility
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

    // 處理問題，加入穩定 ID。前端新題目會送 questionId: null，
    // 所以 ID 必須在展開題目資料後寫入，避免被 null 覆蓋。
    const processedQuestions = questions.map((q, index) => {
      const { questionId, order, ...questionData } = q || {};
      return {
        ...questionData,
        questionId: questionId || db.generateId('q'),
        order: index + 1
      };
    });

    // 計算總分
    const totalPoints = processedQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
    const analysisProfile = req.body.analysisProfile || inferQuizAnalysisProfile({
      title,
      description,
      instructions,
      courseTitle: course.title || course.name,
      questions: processedQuestions
    });

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
      analysisProfile: analysisProfile || undefined,

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

    if (!ensureQuizItemWithinLimit(res, quizItem)) return;

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
      updates.questions = updates.questions.map((q, index) => {
        const { questionId, order, ...questionData } = q || {};
        return {
          ...questionData,
          questionId: questionId || db.generateId('q'),
          order: index + 1
        };
      });
      updates.questionCount = updates.questions.length;
      updates.totalPoints = updates.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    }

    const inferredAnalysisProfile = inferQuizAnalysisProfile({
      ...quiz,
      ...updates,
      courseTitle: course?.title || course?.name
    }, {
      questions: updates.questions || quiz.questions
    });
    if (inferredAnalysisProfile) {
      updates.analysisProfile = inferredAnalysisProfile;
    }

    updates.updatedAt = new Date().toISOString();

    const estimatedQuiz = { ...quiz, ...updates };
    if (!ensureQuizItemWithinLimit(res, estimatedQuiz)) return;

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

    if (!ensureQuizItemWithinLimit(res, {
      ...quiz,
      questions,
      questionCount: questions.length,
      totalPoints
    })) return;

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

    if (!ensureQuizItemWithinLimit(res, {
      ...quiz,
      questions,
      totalPoints
    })) return;

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
