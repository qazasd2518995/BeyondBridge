/**
 * 成績簿系統 API 處理器
 * BeyondBridge Education Platform - Moodle-style Gradebook System
 *
 * 功能特色:
 * - 成績類別管理 (加權分組)
 * - 成績等第轉換 (A/B/C/D/F)
 * - CSV/Excel 匯出
 * - 手動成績項目
 * - 成績歷史記錄
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { v4: uuidv4 } = require('uuid');

// ==================== 預設成績等第量表 ====================

const DEFAULT_GRADE_SCALES = {
  'letter_5': {
    name: '五等第制 (A-F)',
    levels: [
      { letter: 'A', minPercent: 90, maxPercent: 100, gpa: 4.0 },
      { letter: 'B', minPercent: 80, maxPercent: 89.99, gpa: 3.0 },
      { letter: 'C', minPercent: 70, maxPercent: 79.99, gpa: 2.0 },
      { letter: 'D', minPercent: 60, maxPercent: 69.99, gpa: 1.0 },
      { letter: 'F', minPercent: 0, maxPercent: 59.99, gpa: 0 }
    ]
  },
  'letter_7': {
    name: '七等第制 (A+ to F)',
    levels: [
      { letter: 'A+', minPercent: 95, maxPercent: 100, gpa: 4.3 },
      { letter: 'A', minPercent: 90, maxPercent: 94.99, gpa: 4.0 },
      { letter: 'B+', minPercent: 85, maxPercent: 89.99, gpa: 3.5 },
      { letter: 'B', minPercent: 80, maxPercent: 84.99, gpa: 3.0 },
      { letter: 'C+', minPercent: 75, maxPercent: 79.99, gpa: 2.5 },
      { letter: 'C', minPercent: 70, maxPercent: 74.99, gpa: 2.0 },
      { letter: 'D', minPercent: 60, maxPercent: 69.99, gpa: 1.0 },
      { letter: 'F', minPercent: 0, maxPercent: 59.99, gpa: 0 }
    ]
  },
  'taiwan_100': {
    name: '百分制 (台灣)',
    levels: [
      { letter: '優', minPercent: 90, maxPercent: 100, gpa: 4.0 },
      { letter: '甲', minPercent: 80, maxPercent: 89.99, gpa: 3.0 },
      { letter: '乙', minPercent: 70, maxPercent: 79.99, gpa: 2.0 },
      { letter: '丙', minPercent: 60, maxPercent: 69.99, gpa: 1.0 },
      { letter: '丁', minPercent: 0, maxPercent: 59.99, gpa: 0 }
    ]
  }
};

/**
 * 將百分比轉換為等第
 */
function percentToLetter(percent, scaleType = 'letter_5') {
  if (percent === null || percent === undefined) return null;

  const scale = DEFAULT_GRADE_SCALES[scaleType] || DEFAULT_GRADE_SCALES['letter_5'];
  for (const level of scale.levels) {
    if (percent >= level.minPercent && percent <= level.maxPercent) {
      return {
        letter: level.letter,
        gpa: level.gpa,
        percent: Math.round(percent * 100) / 100
      };
    }
  }
  return { letter: 'F', gpa: 0, percent };
}

// ==================== 成績類別管理 ====================

/**
 * GET /api/gradebook/courses/:courseId/categories
 * 取得課程成績類別
 */
router.get('/courses/:courseId/categories', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 學生和教師都可以查看類別
    const isEnrolled = await db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`);
    const isInstructor = course.instructorId === userId;

    if (!isEnrolled && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此課程'
      });
    }

    // 取得成績類別
    const categories = await db.query(`COURSE#${courseId}`, {
      skPrefix: 'GRADECAT#'
    });

    // 如果沒有類別，返回預設類別
    const defaultCategories = [
      { categoryId: 'default_assignments', name: '作業', nameEn: 'Assignments', weight: 40, type: 'assignment' },
      { categoryId: 'default_quizzes', name: '測驗', nameEn: 'Quizzes', weight: 40, type: 'quiz' },
      { categoryId: 'default_participation', name: '參與', nameEn: 'Participation', weight: 20, type: 'manual' }
    ];

    res.json({
      success: true,
      data: {
        categories: categories.length > 0 ? categories : defaultCategories,
        totalWeight: categories.reduce((sum, c) => sum + (c.weight || 0), 0) || 100
      }
    });

  } catch (error) {
    console.error('Get grade categories error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得成績類別失敗'
    });
  }
});

/**
 * POST /api/gradebook/courses/:courseId/categories
 * 建立成績類別
 */
router.post('/courses/:courseId/categories', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const { name, nameEn, weight, type, dropLowest, aggregation } = req.body;

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限管理此課程成績類別'
      });
    }

    if (!name || weight === undefined) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: '類別名稱和權重為必填'
      });
    }

    const categoryId = `cat_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    const category = {
      PK: `COURSE#${courseId}`,
      SK: `GRADECAT#${categoryId}`,
      entityType: 'GRADE_CATEGORY',
      categoryId,
      courseId,
      name,
      nameEn: nameEn || name,
      weight: parseFloat(weight),
      type: type || 'mixed', // assignment, quiz, manual, mixed
      dropLowest: dropLowest || 0, // 移除最低的 N 個成績
      aggregation: aggregation || 'weighted_mean', // weighted_mean, simple_weighted_mean, mean, median, highest, lowest
      order: Date.now(),
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(category);

    res.status(201).json({
      success: true,
      message: '成績類別已建立',
      data: category
    });

  } catch (error) {
    console.error('Create grade category error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立成績類別失敗'
    });
  }
});

/**
 * PUT /api/gradebook/courses/:courseId/categories/:categoryId
 * 更新成績類別
 */
router.put('/courses/:courseId/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    const { courseId, categoryId } = req.params;
    const userId = req.user.userId;
    const { name, nameEn, weight, type, dropLowest, aggregation } = req.body;

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限管理此課程成績類別'
      });
    }

    const category = await db.getItem(`COURSE#${courseId}`, `GRADECAT#${categoryId}`);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此成績類別'
      });
    }

    const updates = {
      ...(name && { name }),
      ...(nameEn && { nameEn }),
      ...(weight !== undefined && { weight: parseFloat(weight) }),
      ...(type && { type }),
      ...(dropLowest !== undefined && { dropLowest }),
      ...(aggregation && { aggregation }),
      updatedAt: new Date().toISOString()
    };

    await db.updateItem(`COURSE#${courseId}`, `GRADECAT#${categoryId}`, updates);

    res.json({
      success: true,
      message: '成績類別已更新',
      data: { ...category, ...updates }
    });

  } catch (error) {
    console.error('Update grade category error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新成績類別失敗'
    });
  }
});

/**
 * DELETE /api/gradebook/courses/:courseId/categories/:categoryId
 * 刪除成績類別
 */
router.delete('/courses/:courseId/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    const { courseId, categoryId } = req.params;
    const userId = req.user.userId;

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限管理此課程成績類別'
      });
    }

    await db.deleteItem(`COURSE#${courseId}`, `GRADECAT#${categoryId}`);

    res.json({
      success: true,
      message: '成績類別已刪除'
    });

  } catch (error) {
    console.error('Delete grade category error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除成績類別失敗'
    });
  }
});

// ==================== 手動成績項目 ====================

/**
 * GET /api/gradebook/courses/:courseId/items
 * 取得課程所有成績項目（包含手動項目）
 */
router.get('/courses/:courseId/items', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    const isInstructor = course.instructorId === userId;
    const isEnrolled = await db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`);

    if (!isInstructor && !isEnrolled && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此課程'
      });
    }

    // 取得所有成績項目
    const [assignments, quizzes, manualItems] = await Promise.all([
      db.scan({
        filter: {
          expression: 'entityType = :type AND courseId = :courseId',
          values: { ':type': 'ASSIGNMENT', ':courseId': courseId }
        }
      }),
      db.scan({
        filter: {
          expression: 'entityType = :type AND courseId = :courseId',
          values: { ':type': 'QUIZ', ':courseId': courseId }
        }
      }),
      db.query(`COURSE#${courseId}`, { skPrefix: 'GRADEITEM#' })
    ]);

    const items = [
      ...assignments.map(a => ({
        itemId: a.assignmentId,
        type: 'assignment',
        title: a.title,
        maxGrade: a.maxGrade,
        weight: a.weight,
        categoryId: a.categoryId || 'default_assignments',
        dueDate: a.dueDate,
        hidden: a.hidden || false
      })),
      ...quizzes.map(q => ({
        itemId: q.quizId,
        type: 'quiz',
        title: q.title,
        maxGrade: q.totalPoints,
        weight: q.weight,
        categoryId: q.categoryId || 'default_quizzes',
        dueDate: q.closeDate,
        hidden: q.hidden || false
      })),
      ...manualItems.map(m => ({
        itemId: m.itemId,
        type: 'manual',
        title: m.title,
        maxGrade: m.maxGrade,
        weight: m.weight,
        categoryId: m.categoryId || 'default_participation',
        dueDate: m.dueDate,
        hidden: m.hidden || false
      }))
    ];

    res.json({
      success: true,
      data: { items }
    });

  } catch (error) {
    console.error('Get grade items error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得成績項目失敗'
    });
  }
});

/**
 * POST /api/gradebook/courses/:courseId/items
 * 建立手動成績項目（出缺席、課堂參與等）
 */
router.post('/courses/:courseId/items', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const { title, maxGrade, weight, categoryId, dueDate, description } = req.body;

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限管理此課程成績'
      });
    }

    if (!title || !maxGrade) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: '項目名稱和滿分為必填'
      });
    }

    const itemId = `item_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    const item = {
      PK: `COURSE#${courseId}`,
      SK: `GRADEITEM#${itemId}`,
      entityType: 'MANUAL_GRADE_ITEM',
      itemId,
      courseId,
      title,
      description: description || '',
      maxGrade: parseFloat(maxGrade),
      weight: weight ? parseFloat(weight) : null,
      categoryId: categoryId || 'default_participation',
      dueDate: dueDate || null,
      hidden: false,
      locked: false,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(item);

    res.status(201).json({
      success: true,
      message: '成績項目已建立',
      data: item
    });

  } catch (error) {
    console.error('Create manual grade item error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立成績項目失敗'
    });
  }
});

/**
 * PUT /api/gradebook/courses/:courseId/items/:itemId/grades
 * 批量更新手動成績項目的學生成績
 */
router.put('/courses/:courseId/items/:itemId/grades', authMiddleware, async (req, res) => {
  try {
    const { courseId, itemId } = req.params;
    const userId = req.user.userId;
    const { grades } = req.body; // Array of { studentId, grade, feedback }

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限評分'
      });
    }

    const item = await db.getItem(`COURSE#${courseId}`, `GRADEITEM#${itemId}`);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此成績項目'
      });
    }

    if (!grades || !Array.isArray(grades)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: '成績資料格式錯誤'
      });
    }

    const now = new Date().toISOString();
    const results = [];

    for (const g of grades) {
      if (!g.studentId || g.grade === undefined) continue;

      const gradeRecord = {
        PK: `GRADEITEM#${itemId}`,
        SK: `STUDENT#${g.studentId}`,
        entityType: 'MANUAL_GRADE',
        itemId,
        courseId,
        studentId: g.studentId,
        grade: parseFloat(g.grade),
        feedback: g.feedback || null,
        gradedBy: userId,
        gradedAt: now,
        updatedAt: now
      };

      await db.putItem(gradeRecord);
      results.push({ studentId: g.studentId, success: true });
    }

    res.json({
      success: true,
      message: `已更新 ${results.length} 筆成績`,
      data: { results }
    });

  } catch (error) {
    console.error('Update manual grades error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新成績失敗'
    });
  }
});

// ==================== 成績等第量表 ====================

/**
 * GET /api/gradebook/scales
 * 取得可用的成績等第量表
 */
router.get('/scales', authMiddleware, (req, res) => {
  res.json({
    success: true,
    data: {
      scales: Object.entries(DEFAULT_GRADE_SCALES).map(([key, scale]) => ({
        scaleId: key,
        name: scale.name,
        levels: scale.levels
      }))
    }
  });
});

// ==================== 學生成績查詢 ====================

/**
 * GET /api/gradebook/my
 * 取得我的成績（學生用）
 */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.query;

    // 取得已報名的課程
    let progressList = await db.getUserCourseProgress(userId);

    if (courseId) {
      progressList = progressList.filter(p => p.courseId === courseId);
    }

    const gradesData = await Promise.all(
      progressList.map(async (progress) => {
        const course = await db.getItem(`COURSE#${progress.courseId}`, 'META');

        // 取得課程的所有評分項目
        const assignments = await db.scan({
          filter: {
            expression: 'entityType = :type AND courseId = :courseId',
            values: { ':type': 'ASSIGNMENT', ':courseId': progress.courseId }
          }
        });

        const quizzes = await db.scan({
          filter: {
            expression: 'entityType = :type AND courseId = :courseId',
            values: { ':type': 'QUIZ', ':courseId': progress.courseId }
          }
        });

        // 整理成績項目
        const gradeItems = [];

        // 作業成績
        for (const a of assignments) {
          const submission = await db.getItem(
            `ASSIGNMENT#${a.assignmentId}`,
            `SUBMISSION#${userId}`
          );

          gradeItems.push({
            type: 'assignment',
            itemId: a.assignmentId,
            title: a.title,
            category: '作業',
            maxGrade: a.maxGrade,
            weight: a.weight || null,
            dueDate: a.dueDate,
            grade: submission?.grade || null,
            graded: !!submission?.gradedAt,
            submitted: !!submission,
            feedback: submission?.feedback || null
          });
        }

        // 測驗成績
        for (const q of quizzes) {
          const attempts = await db.query(`QUIZ#${q.quizId}`, {
            skPrefix: `ATTEMPT#${userId}#`
          });
          const completedAttempts = attempts.filter(a => a.status === 'completed');

          let bestScore = null;
          let bestPercentage = null;

          if (completedAttempts.length > 0) {
            if (q.gradeMethod === 'highest') {
              const best = completedAttempts.reduce((max, a) =>
                a.percentage > (max?.percentage || 0) ? a : max, null);
              bestScore = best?.score;
              bestPercentage = best?.percentage;
            } else if (q.gradeMethod === 'average') {
              bestScore = completedAttempts.reduce((sum, a) => sum + a.score, 0) / completedAttempts.length;
              bestPercentage = completedAttempts.reduce((sum, a) => sum + a.percentage, 0) / completedAttempts.length;
            } else if (q.gradeMethod === 'last') {
              const last = completedAttempts[completedAttempts.length - 1];
              bestScore = last?.score;
              bestPercentage = last?.percentage;
            } else {
              const first = completedAttempts[0];
              bestScore = first?.score;
              bestPercentage = first?.percentage;
            }
          }

          gradeItems.push({
            type: 'quiz',
            itemId: q.quizId,
            title: q.title,
            category: '測驗',
            maxGrade: q.totalPoints,
            weight: q.weight || null,
            dueDate: q.closeDate,
            grade: bestScore,
            percentage: bestPercentage,
            graded: completedAttempts.length > 0,
            attemptCount: completedAttempts.length,
            passed: bestPercentage >= q.passingGrade
          });
        }

        // 計算總成績
        const gradedItems = gradeItems.filter(g => g.grade !== null);
        let overallGrade = null;
        let overallPercentage = null;

        if (gradedItems.length > 0) {
          // 如果有權重，使用加權平均
          const hasWeights = gradedItems.some(g => g.weight);

          if (hasWeights) {
            const totalWeight = gradedItems.reduce((sum, g) => sum + (g.weight || 0), 0);
            if (totalWeight > 0) {
              overallPercentage = gradedItems.reduce((sum, g) => {
                const percentage = g.percentage || (g.grade / g.maxGrade * 100);
                return sum + percentage * (g.weight || 0) / totalWeight;
              }, 0);
            }
          } else {
            // 簡單平均
            overallPercentage = gradedItems.reduce((sum, g) => {
              const percentage = g.percentage || (g.grade / g.maxGrade * 100);
              return sum + percentage;
            }, 0) / gradedItems.length;
          }

          overallGrade = Math.round(overallPercentage * 100) / 100;
        }

        return {
          courseId: progress.courseId,
          courseTitle: course?.title || progress.courseTitle,
          gradeItems,
          summary: {
            totalItems: gradeItems.length,
            completedItems: gradedItems.length,
            overallGrade,
            overallPercentage,
            passingGrade: course?.settings?.gradeToPass || 60,
            passing: overallPercentage >= (course?.settings?.gradeToPass || 60)
          }
        };
      })
    );

    res.json({
      success: true,
      data: gradesData
    });

  } catch (error) {
    console.error('Get my grades error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得成績失敗'
    });
  }
});

// ==================== 課程成績簿（教師） ====================

/**
 * GET /api/gradebook/courses/:courseId
 * 取得課程成績簿（教師用）
 */
router.get('/courses/:courseId', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const { search, sortBy = 'name', sortOrder = 'asc' } = req.query;

    // 取得課程
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 權限檢查
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此課程成績'
      });
    }

    // 取得所有已報名的學生
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${courseId}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    // 取得評分項目
    const assignments = await db.scan({
      filter: {
        expression: 'entityType = :type AND courseId = :courseId',
        values: { ':type': 'ASSIGNMENT', ':courseId': courseId }
      }
    });

    const quizzes = await db.scan({
      filter: {
        expression: 'entityType = :type AND courseId = :courseId',
        values: { ':type': 'QUIZ', ':courseId': courseId }
      }
    });

    // 建立評分項目列表
    const gradeColumns = [
      ...assignments.map(a => ({
        id: a.assignmentId,
        type: 'assignment',
        title: a.title,
        maxGrade: a.maxGrade,
        weight: a.weight,
        dueDate: a.dueDate
      })),
      ...quizzes.map(q => ({
        id: q.quizId,
        type: 'quiz',
        title: q.title,
        maxGrade: q.totalPoints,
        weight: q.weight,
        dueDate: q.closeDate
      }))
    ];

    // 取得每個學生的成績
    let students = await Promise.all(
      enrollments.map(async (e) => {
        const user = await db.getUser(e.userId);
        const grades = {};
        let totalEarned = 0;
        let totalPossible = 0;
        let gradedCount = 0;

        // 取得作業成績
        for (const a of assignments) {
          const submission = await db.getItem(
            `ASSIGNMENT#${a.assignmentId}`,
            `SUBMISSION#${e.userId}`
          );

          grades[a.assignmentId] = {
            grade: submission?.grade ?? null,
            submitted: !!submission,
            gradedAt: submission?.gradedAt
          };

          if (submission?.grade !== undefined && submission?.grade !== null) {
            totalEarned += submission.grade;
            totalPossible += a.maxGrade;
            gradedCount++;
          }
        }

        // 取得測驗成績
        for (const q of quizzes) {
          const attempts = await db.query(`QUIZ#${q.quizId}`, {
            skPrefix: `ATTEMPT#${e.userId}#`
          });
          const completedAttempts = attempts.filter(a => a.status === 'completed');

          let bestScore = null;
          if (completedAttempts.length > 0) {
            bestScore = Math.max(...completedAttempts.map(a => a.score));
          }

          grades[q.quizId] = {
            grade: bestScore,
            submitted: completedAttempts.length > 0,
            attemptCount: completedAttempts.length
          };

          if (bestScore !== null) {
            totalEarned += bestScore;
            totalPossible += q.totalPoints;
            gradedCount++;
          }
        }

        const overallPercentage = totalPossible > 0 ?
          Math.round((totalEarned / totalPossible) * 10000) / 100 : null;

        return {
          userId: e.userId,
          name: user?.displayName || '未知用戶',
          email: user?.email,
          enrolledAt: e.enrolledAt,
          lastAccess: e.lastAccessedAt,
          grades,
          summary: {
            totalEarned,
            totalPossible,
            gradedCount,
            totalItems: gradeColumns.length,
            overallPercentage,
            passing: overallPercentage >= (course.settings?.gradeToPass || 60)
          }
        };
      })
    );

    // 搜尋篩選
    if (search) {
      const searchLower = search.toLowerCase();
      students = students.filter(s =>
        s.name?.toLowerCase().includes(searchLower) ||
        s.email?.toLowerCase().includes(searchLower)
      );
    }

    // 排序
    students.sort((a, b) => {
      let aVal, bVal;

      if (sortBy === 'name') {
        aVal = a.name || '';
        bVal = b.name || '';
      } else if (sortBy === 'grade') {
        aVal = a.summary.overallPercentage || 0;
        bVal = b.summary.overallPercentage || 0;
      } else if (sortBy === 'progress') {
        aVal = a.summary.gradedCount;
        bVal = b.summary.gradedCount;
      } else {
        aVal = a[sortBy] || '';
        bVal = b[sortBy] || '';
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    // 計算課程統計
    const studentsWithGrades = students.filter(s => s.summary.overallPercentage !== null);
    const courseStats = {
      totalStudents: students.length,
      studentsWithGrades: studentsWithGrades.length,
      averageGrade: studentsWithGrades.length > 0 ?
        Math.round(studentsWithGrades.reduce((sum, s) =>
          sum + s.summary.overallPercentage, 0) / studentsWithGrades.length * 100) / 100 : null,
      passingCount: studentsWithGrades.filter(s => s.summary.passing).length,
      passingRate: studentsWithGrades.length > 0 ?
        Math.round((studentsWithGrades.filter(s => s.summary.passing).length /
          studentsWithGrades.length) * 100) : null
    };

    res.json({
      success: true,
      data: {
        course: {
          courseId,
          title: course.title,
          passingGrade: course.settings?.gradeToPass || 60
        },
        columns: gradeColumns,
        students,
        stats: courseStats
      }
    });

  } catch (error) {
    console.error('Get course gradebook error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得成績簿失敗'
    });
  }
});

/**
 * GET /api/gradebook/courses/:courseId/students/:studentId
 * 取得特定學生的詳細成績
 */
router.get('/courses/:courseId/students/:studentId', authMiddleware, async (req, res) => {
  try {
    const { courseId, studentId } = req.params;
    const userId = req.user.userId;

    // 權限檢查
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    const isInstructor = course.instructorId === userId;
    const isSelf = studentId === userId;

    if (!isInstructor && !isSelf && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此成績'
      });
    }

    // 取得學生資訊
    const student = await db.getUser(studentId);
    const progress = await db.getItem(`USER#${studentId}`, `PROG#COURSE#${courseId}`);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '此學生未報名此課程'
      });
    }

    // 取得作業成績詳情
    const assignments = await db.scan({
      filter: {
        expression: 'entityType = :type AND courseId = :courseId',
        values: { ':type': 'ASSIGNMENT', ':courseId': courseId }
      }
    });

    const assignmentGrades = await Promise.all(
      assignments.map(async (a) => {
        const submission = await db.getItem(
          `ASSIGNMENT#${a.assignmentId}`,
          `SUBMISSION#${studentId}`
        );

        return {
          type: 'assignment',
          itemId: a.assignmentId,
          title: a.title,
          maxGrade: a.maxGrade,
          dueDate: a.dueDate,
          submission: submission ? {
            submittedAt: submission.submittedAt,
            grade: submission.grade,
            feedback: submission.feedback,
            gradedAt: submission.gradedAt,
            isLate: submission.isLate
          } : null
        };
      })
    );

    // 取得測驗成績詳情
    const quizzes = await db.scan({
      filter: {
        expression: 'entityType = :type AND courseId = :courseId',
        values: { ':type': 'QUIZ', ':courseId': courseId }
      }
    });

    const quizGrades = await Promise.all(
      quizzes.map(async (q) => {
        const attempts = await db.query(`QUIZ#${q.quizId}`, {
          skPrefix: `ATTEMPT#${studentId}#`
        });

        const completedAttempts = attempts
          .filter(a => a.status === 'completed')
          .map(a => ({
            attemptNumber: a.attemptNumber,
            score: a.score,
            percentage: a.percentage,
            passed: a.passed,
            submittedAt: a.submittedAt
          }));

        let bestAttempt = null;
        if (completedAttempts.length > 0) {
          bestAttempt = completedAttempts.reduce((max, a) =>
            a.percentage > (max?.percentage || 0) ? a : max, null);
        }

        return {
          type: 'quiz',
          itemId: q.quizId,
          title: q.title,
          maxGrade: q.totalPoints,
          passingGrade: q.passingGrade,
          closeDate: q.closeDate,
          maxAttempts: q.maxAttempts,
          gradeMethod: q.gradeMethod,
          attempts: completedAttempts,
          bestAttempt
        };
      })
    );

    // 計算總成績
    const allGrades = [...assignmentGrades, ...quizGrades];
    let totalEarned = 0;
    let totalPossible = 0;

    assignmentGrades.forEach(g => {
      if (g.submission?.grade !== undefined && g.submission?.grade !== null) {
        totalEarned += g.submission.grade;
        totalPossible += g.maxGrade;
      }
    });

    quizGrades.forEach(g => {
      if (g.bestAttempt) {
        totalEarned += g.bestAttempt.score;
        totalPossible += g.maxGrade;
      }
    });

    const overallPercentage = totalPossible > 0 ?
      Math.round((totalEarned / totalPossible) * 10000) / 100 : null;

    res.json({
      success: true,
      data: {
        student: {
          userId: studentId,
          name: student?.displayName || '未知用戶',
          email: student?.email,
          enrolledAt: progress.enrolledAt,
          lastAccess: progress.lastAccessedAt
        },
        grades: {
          assignments: assignmentGrades,
          quizzes: quizGrades
        },
        summary: {
          totalEarned,
          totalPossible,
          overallPercentage,
          passing: overallPercentage >= (course.settings?.gradeToPass || 60),
          passingGrade: course.settings?.gradeToPass || 60
        }
      }
    });

  } catch (error) {
    console.error('Get student grades error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得成績失敗'
    });
  }
});

// ==================== 成績匯出 ====================

/**
 * GET /api/gradebook/courses/:courseId/export
 * 匯出課程成績 (支援 CSV/Excel 格式)
 *
 * 參數:
 * - format: json (預設), csv
 * - includeLetterGrade: true/false (包含等第)
 * - gradeScale: letter_5, letter_7, taiwan_100
 */
router.get('/courses/:courseId/export', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const {
      format = 'json',
      includeLetterGrade = 'true',
      gradeScale = 'letter_5'
    } = req.query;

    // 權限檢查
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限匯出此課程成績'
      });
    }

    // 取得所有學生和成績
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${courseId}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    const [assignments, quizzes, manualItems] = await Promise.all([
      db.scan({
        filter: {
          expression: 'entityType = :type AND courseId = :courseId',
          values: { ':type': 'ASSIGNMENT', ':courseId': courseId }
        }
      }),
      db.scan({
        filter: {
          expression: 'entityType = :type AND courseId = :courseId',
          values: { ':type': 'QUIZ', ':courseId': courseId }
        }
      }),
      db.query(`COURSE#${courseId}`, { skPrefix: 'GRADEITEM#' })
    ]);

    const exportData = await Promise.all(
      enrollments.map(async (e) => {
        const user = await db.getUser(e.userId);
        const row = {
          '學號': e.userId,
          '姓名': user?.displayName || '未知用戶',
          'Email': user?.email || ''
        };

        let totalEarned = 0;
        let totalPossible = 0;

        // 作業成績
        for (const a of assignments) {
          const submission = await db.getItem(
            `ASSIGNMENT#${a.assignmentId}`,
            `SUBMISSION#${e.userId}`
          );

          const grade = submission?.grade ?? '';
          row[`作業: ${a.title}`] = grade;

          if (submission?.grade !== undefined && submission?.grade !== null) {
            totalEarned += submission.grade;
            totalPossible += a.maxGrade;
          }
        }

        // 測驗成績
        for (const q of quizzes) {
          const attempts = await db.query(`QUIZ#${q.quizId}`, {
            skPrefix: `ATTEMPT#${e.userId}#`
          });
          const completed = attempts.filter(a => a.status === 'completed');

          const bestScore = completed.length > 0 ?
            Math.max(...completed.map(a => a.score)) : '';

          row[`測驗: ${q.title}`] = bestScore;

          if (bestScore !== '') {
            totalEarned += bestScore;
            totalPossible += q.totalPoints;
          }
        }

        // 手動成績項目
        for (const m of manualItems) {
          const gradeRecord = await db.getItem(
            `GRADEITEM#${m.itemId}`,
            `STUDENT#${e.userId}`
          );

          row[`${m.title}`] = gradeRecord?.grade ?? '';

          if (gradeRecord?.grade !== undefined && gradeRecord?.grade !== null) {
            totalEarned += gradeRecord.grade;
            totalPossible += m.maxGrade;
          }
        }

        row['總得分'] = totalEarned;
        row['滿分'] = totalPossible;

        const overallPercentage = totalPossible > 0 ?
          Math.round((totalEarned / totalPossible) * 10000) / 100 : null;

        row['百分比'] = overallPercentage !== null ? `${overallPercentage}%` : '';

        // 加入等第
        if (includeLetterGrade === 'true' && overallPercentage !== null) {
          const letterGrade = percentToLetter(overallPercentage, gradeScale);
          row['等第'] = letterGrade?.letter || '';
          row['GPA'] = letterGrade?.gpa ?? '';
        }

        // 及格狀態
        const passingGrade = course.settings?.gradeToPass || 60;
        row['及格'] = overallPercentage !== null ?
          (overallPercentage >= passingGrade ? '是' : '否') : '';

        return row;
      })
    );

    if (format === 'csv') {
      // 轉換為 CSV (含 UTF-8 BOM 以支援 Excel 開啟中文)
      const headers = Object.keys(exportData[0] || {});

      // 處理 CSV 值（處理包含逗號、引號、換行的情況）
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...exportData.map(row =>
          headers.map(h => escapeCSV(row[h])).join(',')
        )
      ].join('\r\n'); // Windows 換行符以便 Excel 正確顯示

      // UTF-8 BOM (Byte Order Mark) 讓 Excel 正確識別編碼
      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;

      // 使用安全的檔名
      const safeFilename = course.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const timestamp = new Date().toISOString().split('T')[0];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}_成績_${timestamp}.csv`);
      res.send(csvWithBOM);

    } else {
      res.json({
        success: true,
        data: {
          course: {
            courseId,
            title: course.title,
            passingGrade: course.settings?.gradeToPass || 60,
            gradeScale: gradeScale
          },
          exportedAt: new Date().toISOString(),
          studentCount: exportData.length,
          grades: exportData
        }
      });
    }

  } catch (error) {
    console.error('Export grades error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出成績失敗'
    });
  }
});

// ==================== 成績設定 ====================

/**
 * GET /api/gradebook/courses/:courseId/settings
 * 取得課程評分設定
 */
router.get('/courses/:courseId/settings', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 檢查權限（教師或管理員）
    const isInstructor = course.instructorId === userId;
    if (!isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此課程設定'
      });
    }

    // 回傳設定，提供預設值
    const settings = {
      gradeToPass: course.settings?.gradeToPass ?? 60,
      showGradesImmediately: course.settings?.showGradesImmediately ?? true,
      gradingScale: course.settings?.gradingScale ?? 'letter_5',
      weightedCategories: course.settings?.weightedCategories ?? false,
      availableScales: Object.keys(DEFAULT_GRADE_SCALES).map(key => ({
        id: key,
        name: DEFAULT_GRADE_SCALES[key].name
      }))
    };

    res.json({
      success: true,
      data: { settings }
    });

  } catch (error) {
    console.error('Get grade settings error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得設定失敗'
    });
  }
});

/**
 * PUT /api/gradebook/courses/:courseId/settings
 * 更新課程評分設定
 */
router.put('/courses/:courseId/settings', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const {
      gradeToPass,
      showGradesImmediately,
      gradingScale,
      weightedCategories
    } = req.body;

    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程設定'
      });
    }

    const settings = {
      ...course.settings,
      gradeToPass: gradeToPass ?? course.settings?.gradeToPass ?? 60,
      showGradesImmediately: showGradesImmediately ?? course.settings?.showGradesImmediately ?? true,
      gradingScale: gradingScale ?? course.settings?.gradingScale,
      weightedCategories: weightedCategories ?? course.settings?.weightedCategories
    };

    await db.updateItem(`COURSE#${courseId}`, 'META', {
      settings,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '評分設定已更新',
      data: { settings }
    });

  } catch (error) {
    console.error('Update grade settings error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新設定失敗'
    });
  }
});

module.exports = router;
