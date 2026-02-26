/**
 * 題庫管理
 * BeyondBridge Education Platform - Question Bank Management
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { shuffleArray } = require('./utils');

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

module.exports = router;
