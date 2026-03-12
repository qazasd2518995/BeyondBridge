/**
 * 題庫管理 API
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

const TEACHING_ROLES = new Set([
  'manager',
  'coursecreator',
  'educator',
  'trainer',
  'creator',
  'teacher',
  'assistant'
]);

function isTeachingUser(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return TEACHING_ROLES.has(user.role);
}

function ensureTeachingAccess(user, res) {
  if (isTeachingUser(user)) return true;
  res.status(403).json({
    success: false,
    message: '僅教師或管理員可使用題庫管理功能'
  });
  return false;
}

function normalizeCourseId(courseId) {
  if (!courseId) return null;
  const normalized = String(courseId).trim();
  return normalized || null;
}

function canManageCourse(course, user) {
  if (!course || !user) return false;
  if (user.isAdmin) return true;
  const ownerIds = new Set([
    course.instructorId,
    course.teacherId,
    course.creatorId,
    course.createdBy
  ].filter(Boolean));
  const inInstructors = Array.isArray(course.instructors) && course.instructors.includes(user.userId);
  return ownerIds.has(user.userId) || inInstructors;
}

async function getManagedCourse(courseId, user, res, { required = false } = {}) {
  const normalizedCourseId = normalizeCourseId(courseId);
  if (!normalizedCourseId) {
    if (required) {
      res.status(400).json({
        success: false,
        message: '題庫操作需要指定課程'
      });
      return false;
    }
    return null;
  }

  const course = await db.getItem(`COURSE#${normalizedCourseId}`, 'META');
  if (!course) {
    res.status(404).json({
      success: false,
      message: '找不到指定課程'
    });
    return false;
  }

  if (!canManageCourse(course, user)) {
    res.status(403).json({
      success: false,
      message: '無權限管理此課程的題庫'
    });
    return false;
  }

  return course;
}

function getDefaultCategoryId(courseId = null) {
  return courseId ? `qcat_default_${courseId}` : 'cat_default';
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseTypeFilters(type, types) {
  if (Array.isArray(types)) {
    return types.map(t => String(t).trim()).filter(Boolean);
  }
  if (typeof types === 'string' && types.trim()) {
    return types.split(',').map(t => t.trim()).filter(Boolean);
  }
  if (typeof type === 'string' && type.trim()) {
    return [type.trim()];
  }
  return [];
}

function parseTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map(t => String(t).trim()).filter(Boolean);
  }
  if (typeof tags === 'string') {
    return tags.split(',').map(t => t.trim()).filter(Boolean);
  }
  return [];
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  if (options.length === 0) return [];
  if (typeof options[0] === 'string') {
    return options.map(opt => String(opt)).filter(Boolean);
  }
  return options
    .map(opt => {
      if (typeof opt === 'string') return opt;
      if (opt && typeof opt.text === 'string') return opt.text;
      if (opt && typeof opt.label === 'string') return opt.label;
      return '';
    })
    .filter(Boolean);
}

function inferCorrectAnswerFromObjectOptions(options) {
  if (!Array.isArray(options)) return null;
  const idx = options.findIndex(opt => opt && (opt.isCorrect === true || opt.correct === true));
  return idx >= 0 ? idx : null;
}

function normalizeCategory(item) {
  const categoryId = item.categoryId || item.id;
  return {
    id: categoryId,
    categoryId,
    courseId: normalizeCourseId(item.courseId),
    name: item.name || '',
    description: item.description || '',
    parentId: item.parentId || null,
    questionCount: item.questionCount || 0,
    sortOrder: item.sortOrder || 0,
    status: item.status || 'active',
    createdBy: item.createdBy || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

function normalizeQuestion(item, categoriesMap = new Map()) {
  const questionId = item.questionId || item.id;
  const rawOptions = Array.isArray(item.options) ? item.options : [];
  const options = normalizeOptions(rawOptions);

  let correctAnswer = item.correctAnswer;
  if (correctAnswer === undefined || correctAnswer === null) {
    const inferred = inferCorrectAnswerFromObjectOptions(rawOptions);
    if (inferred !== null) correctAnswer = inferred;
  }
  correctAnswer = parseBoolean(correctAnswer);
  if (typeof correctAnswer === 'string' && /^\d+$/.test(correctAnswer)) {
    correctAnswer = parseInt(correctAnswer, 10);
  }

  const categoryId = item.categoryId || item.category || 'cat_default';
  const category = categoriesMap.get(categoryId);

  const questionText = item.questionText || item.text || item.content || item.title || '';

  return {
    id: questionId,
    questionId,
    courseId: normalizeCourseId(item.courseId || category?.courseId),
    type: item.type || 'multiple_choice',
    questionText,
    title: questionText,
    content: questionText,
    options,
    correctAnswer,
    correctAnswers: Array.isArray(item.correctAnswers) ? item.correctAnswers : [],
    caseSensitive: !!item.caseSensitive,
    referenceAnswer: item.referenceAnswer || '',
    minWords: item.minWords || 0,
    explanation: item.explanation || item.feedback || '',
    points: item.points || 10,
    difficulty: item.difficulty || 'medium',
    categoryId,
    category: category ? category.name : (item.categoryName || ''),
    tags: parseTags(item.tags),
    status: item.status || 'active',
    usageCount: item.usageCount || 0,
    createdBy: item.createdBy || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

async function getQuestionById(questionId) {
  const direct = await db.getItem(`QUESTION#${questionId}`, 'META');
  if (direct && direct.entityType === 'QUESTION') return direct;

  const fallback = await db.scan({
    filter: {
      expression: 'entityType = :type AND questionId = :qid',
      values: { ':type': 'QUESTION', ':qid': questionId }
    }
  });

  return fallback[0] || null;
}

async function getCategoryById(categoryId) {
  if (!categoryId) return null;
  const direct = await db.getItem('QUESTION_CATEGORIES', `CATEGORY#${categoryId}`);
  if (direct) return direct;

  const fallback = await db.scan({
    filter: {
      expression: 'entityType = :type AND categoryId = :cid',
      values: { ':type': 'QUESTION_CATEGORY', ':cid': categoryId }
    }
  });

  return fallback[0] || null;
}

async function loadCategories(courseId = null) {
  const categories = await db.query('QUESTION_CATEGORIES', { skPrefix: 'CATEGORY#' });
  const normalizedCourseId = normalizeCourseId(courseId);
  return categories.filter(cat => {
    if (cat.status === 'deleted') return false;
    if (!normalizedCourseId) return !normalizeCourseId(cat.courseId);
    return normalizeCourseId(cat.courseId) === normalizedCourseId;
  });
}

async function loadCategoriesMap(courseId = null) {
  const categories = await loadCategories(courseId);
  return new Map(categories.map(cat => [cat.categoryId, normalizeCategory(cat)]));
}

async function loadActiveQuestions(courseId = null) {
  const questions = await db.scan({
    filter: {
      expression: 'entityType = :type AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'QUESTION', ':deleted': 'deleted' },
      names: { '#status': 'status' }
    }
  });
  const normalizedCourseId = normalizeCourseId(courseId);
  return questions.filter(question => {
    if (!normalizedCourseId) return !normalizeCourseId(question.courseId);
    return normalizeCourseId(question.courseId) === normalizedCourseId;
  });
}

async function ensureDefaultCategory(userId = 'system', courseId = null) {
  const normalizedCourseId = normalizeCourseId(courseId);
  const defaultCategoryId = getDefaultCategoryId(normalizedCourseId);
  const existing = await getCategoryById(defaultCategoryId);
  if (existing && existing.status !== 'deleted') return existing;

  const now = new Date().toISOString();
  const category = {
    PK: 'QUESTION_CATEGORIES',
    SK: `CATEGORY#${defaultCategoryId}`,
    entityType: 'QUESTION_CATEGORY',
    categoryId: defaultCategoryId,
    courseId: normalizedCourseId,
    name: '預設類別',
    description: '系統預設題庫類別',
    parentId: null,
    sortOrder: 0,
    questionCount: 0,
    status: 'active',
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  };
  await db.putItem(category);
  return category;
}

async function refreshCategoryQuestionCount(categoryId) {
  if (!categoryId) return;
  const category = await getCategoryById(categoryId);
  if (!category || category.status === 'deleted') return;
  const questions = await loadActiveQuestions(category.courseId || null);
  const scopedQuestions = questions.filter(question => question.categoryId === categoryId);

  await db.updateItem(category.PK, category.SK, {
    questionCount: scopedQuestions.length,
    updatedAt: new Date().toISOString()
  });
}

function buildQuestionPayload(body, existing = null) {
  const type = body.type || existing?.type || 'multiple_choice';
  const questionText = body.questionText ?? body.text ?? body.content ?? body.title ?? existing?.questionText ?? existing?.content ?? '';

  const payload = {
    type,
    questionText: String(questionText || '').trim(),
    courseId: body.courseId !== undefined
      ? normalizeCourseId(body.courseId)
      : normalizeCourseId(existing?.courseId),
    points: body.points !== undefined ? parseInteger(body.points, 10, { min: 0 }) : (existing?.points || 10),
    difficulty: body.difficulty || existing?.difficulty || 'medium',
    tags: body.tags !== undefined ? parseTags(body.tags) : parseTags(existing?.tags),
    explanation: body.explanation !== undefined
      ? String(body.explanation || '')
      : String(existing?.explanation || existing?.feedback || ''),
    categoryId: body.categoryId !== undefined
      ? (body.categoryId || getDefaultCategoryId(normalizeCourseId(body.courseId) || normalizeCourseId(existing?.courseId)))
      : (body.category !== undefined
        ? (body.category || getDefaultCategoryId(normalizeCourseId(body.courseId) || normalizeCourseId(existing?.courseId)))
        : (existing?.categoryId || getDefaultCategoryId(normalizeCourseId(existing?.courseId))))
  };

  if (body.options !== undefined) {
    payload.options = normalizeOptions(body.options);
  } else if (existing?.options !== undefined) {
    payload.options = normalizeOptions(existing.options);
  } else {
    payload.options = [];
  }

  if (body.correctAnswer !== undefined) {
    payload.correctAnswer = parseBoolean(body.correctAnswer);
  } else if (existing?.correctAnswer !== undefined) {
    payload.correctAnswer = parseBoolean(existing.correctAnswer);
  } else {
    payload.correctAnswer = null;
  }

  if (typeof payload.correctAnswer === 'string' && /^\d+$/.test(payload.correctAnswer)) {
    payload.correctAnswer = parseInt(payload.correctAnswer, 10);
  }

  payload.correctAnswers = body.correctAnswers !== undefined
    ? parseTags(body.correctAnswers)
    : (Array.isArray(existing?.correctAnswers) ? existing.correctAnswers : []);

  payload.caseSensitive = body.caseSensitive !== undefined
    ? !!body.caseSensitive
    : !!existing?.caseSensitive;

  payload.referenceAnswer = body.referenceAnswer !== undefined
    ? String(body.referenceAnswer || '')
    : String(existing?.referenceAnswer || '');

  payload.minWords = body.minWords !== undefined
    ? parseInteger(body.minWords, 0, { min: 0 })
    : parseInteger(existing?.minWords, 0, { min: 0 });

  return payload;
}

function filterQuestions(questions, filters) {
  const {
    courseId,
    categoryId,
    difficulty,
    search,
    type,
    types
  } = filters;

  const selectedTypes = parseTypeFilters(type, types);
  const normalizedSearch = String(search || '').trim().toLowerCase();

  let filtered = [...questions];

  if (courseId) {
    filtered = filtered.filter(q => normalizeCourseId(q.courseId) === normalizeCourseId(courseId));
  }

  if (categoryId) {
    filtered = filtered.filter(q => q.categoryId === categoryId);
  }

  if (difficulty) {
    filtered = filtered.filter(q => q.difficulty === difficulty);
  }

  if (selectedTypes.length > 0) {
    filtered = filtered.filter(q => selectedTypes.includes(q.type));
  }

  if (normalizedSearch) {
    filtered = filtered.filter(q => {
      const text = `${q.questionText || ''} ${q.explanation || ''} ${(q.tags || []).join(' ')} ${(q.options || []).join(' ')}`.toLowerCase();
      return text.includes(normalizedSearch);
    });
  }

  filtered.sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  return filtered;
}

// ============================================================================
// 題目類別 CRUD
// ============================================================================

router.get('/categories', authMiddleware, async (req, res) => {
  try {
    if (!ensureTeachingAccess(req.user, res)) return;
    const courseId = normalizeCourseId(req.query.courseId);
    const managedCourse = await getManagedCourse(courseId, req.user, res);
    if (managedCourse === false) return;

    let categories = await loadCategories(courseId);
    if (categories.length === 0) {
      await ensureDefaultCategory(req.user.userId, courseId);
      categories = await loadCategories(courseId);
    }

    const activeQuestions = await loadActiveQuestions(courseId);
    const countMap = new Map();
    activeQuestions.forEach(q => {
      const cid = q.categoryId || 'cat_default';
      countMap.set(cid, (countMap.get(cid) || 0) + 1);
    });

    const normalized = categories
      .map(cat => {
        const mapped = normalizeCategory(cat);
        mapped.questionCount = countMap.get(mapped.categoryId) || 0;
        return mapped;
      })
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    res.json({
      success: true,
      data: normalized
    });
  } catch (error) {
    console.error('Get question categories error:', error);
    res.status(500).json({
      success: false,
      message: '取得題目類別失敗'
    });
  }
});

router.post('/categories', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可建立題目類別'
      });
    }

    const { name, description, parentId, sortOrder } = req.body;
    const courseId = normalizeCourseId(req.body.courseId);
    const managedCourse = await getManagedCourse(courseId, req.user, res, { required: true });
    if (!managedCourse) return;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: '請提供類別名稱'
      });
    }

    if (parentId) {
      const parent = await getCategoryById(parentId);
      if (!parent || parent.status === 'deleted' || normalizeCourseId(parent.courseId) !== courseId) {
        return res.status(400).json({
          success: false,
          message: '父類別不存在'
        });
      }
    }

    const categoryId = db.generateId('qcat');
    const now = new Date().toISOString();
    const category = {
      PK: 'QUESTION_CATEGORIES',
      SK: `CATEGORY#${categoryId}`,
      entityType: 'QUESTION_CATEGORY',
      categoryId,
      courseId,
      name: String(name).trim(),
      description: description || '',
      parentId: parentId || null,
      sortOrder: parseInteger(sortOrder, 0, { min: 0 }),
      questionCount: 0,
      status: 'active',
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(category);

    res.status(201).json({
      success: true,
      data: normalizeCategory(category),
      message: '類別建立成功'
    });
  } catch (error) {
    console.error('Create question category error:', error);
    res.status(500).json({
      success: false,
      message: '建立類別失敗'
    });
  }
});

router.put('/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可更新題目類別'
      });
    }

    const { categoryId } = req.params;
    const { name, description, parentId, sortOrder } = req.body;
    const category = await getCategoryById(categoryId);

    if (!category || category.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: '找不到題目類別'
      });
    }

    const managedCourse = await getManagedCourse(category.courseId, req.user, res, {
      required: !!normalizeCourseId(category.courseId)
    });
    if (managedCourse === false) return;

    if (parentId && parentId === categoryId) {
      return res.status(400).json({
        success: false,
        message: '父類別不可設定為自己'
      });
    }

    if (parentId) {
      const parent = await getCategoryById(parentId);
      if (!parent || parent.status === 'deleted' || normalizeCourseId(parent.courseId) !== normalizeCourseId(category.courseId)) {
        return res.status(400).json({
          success: false,
          message: '父類別不存在'
        });
      }
    }

    const updates = {
      updatedAt: new Date().toISOString()
    };
    if (name !== undefined) updates.name = String(name || '').trim();
    if (description !== undefined) updates.description = String(description || '');
    if (parentId !== undefined) updates.parentId = parentId || null;
    if (sortOrder !== undefined) updates.sortOrder = parseInteger(sortOrder, 0, { min: 0 });

    const updated = await db.updateItem(category.PK, category.SK, updates);

    res.json({
      success: true,
      data: normalizeCategory(updated),
      message: '類別更新成功'
    });
  } catch (error) {
    console.error('Update question category error:', error);
    res.status(500).json({
      success: false,
      message: '更新類別失敗'
    });
  }
});

router.delete('/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可刪除題目類別'
      });
    }

    const { categoryId } = req.params;
    const category = await getCategoryById(categoryId);
    if (!category || category.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: '找不到題目類別'
      });
    }

    const managedCourse = await getManagedCourse(category.courseId, req.user, res, {
      required: !!normalizeCourseId(category.courseId)
    });
    if (managedCourse === false) return;

    const questions = (await loadActiveQuestions(category.courseId || null))
      .filter(question => question.categoryId === categoryId);

    if (questions.length > 0) {
      return res.status(400).json({
        success: false,
        message: '此類別仍有題目，請先移動或刪除題目'
      });
    }

    await db.updateItem(category.PK, category.SK, {
      status: 'deleted',
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '類別刪除成功'
    });
  } catch (error) {
    console.error('Delete question category error:', error);
    res.status(500).json({
      success: false,
      message: '刪除類別失敗'
    });
  }
});

// ============================================================================
// 題目 CRUD
// ============================================================================

router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!ensureTeachingAccess(req.user, res)) return;

    const { courseId, categoryId, type, types, difficulty, search, page = 1, limit = 20 } = req.query;
    const managedCourse = await getManagedCourse(courseId, req.user, res, {
      required: !!normalizeCourseId(courseId)
    });
    if (managedCourse === false) return;

    const normalizedCourseId = normalizeCourseId(courseId);
    const categoriesMap = await loadCategoriesMap(normalizedCourseId);
    const rawQuestions = await loadActiveQuestions(normalizedCourseId);
    const normalizedQuestions = rawQuestions.map(q => normalizeQuestion(q, categoriesMap));
    const filtered = filterQuestions(normalizedQuestions, {
      courseId: normalizedCourseId,
      categoryId,
      type,
      types,
      difficulty,
      search
    });

    const pageNumber = parseInteger(page, 1, { min: 1 });
    const pageSize = parseInteger(limit, 20, { min: 1, max: 200 });
    const startIndex = (pageNumber - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);

    res.json({
      success: true,
      data: paginated,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / pageSize)
      }
    });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({
      success: false,
      message: '取得題目列表失敗'
    });
  }
});

router.get('/:questionId', authMiddleware, async (req, res) => {
  try {
    if (!ensureTeachingAccess(req.user, res)) return;

    const { questionId } = req.params;
    const requestedCourseId = normalizeCourseId(req.query.courseId);
    const question = await getQuestionById(questionId);

    if (!question || question.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: '找不到題目'
      });
    }

    const questionCourseId = normalizeCourseId(question.courseId);
    if (requestedCourseId && requestedCourseId !== questionCourseId) {
      return res.status(404).json({
        success: false,
        message: '找不到題目'
      });
    }

    const managedCourse = await getManagedCourse(questionCourseId || requestedCourseId, req.user, res, {
      required: !!(questionCourseId || requestedCourseId)
    });
    if (managedCourse === false) return;

    const categoriesMap = await loadCategoriesMap(questionCourseId);
    res.json({
      success: true,
      data: normalizeQuestion(question, categoriesMap)
    });
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({
      success: false,
      message: '取得題目失敗'
    });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可建立題目'
      });
    }

    const payload = buildQuestionPayload(req.body);
    const managedCourse = await getManagedCourse(payload.courseId, req.user, res, { required: true });
    if (!managedCourse) return;

    if (!payload.questionText) {
      return res.status(400).json({
        success: false,
        message: '題目內容不可為空'
      });
    }

    if (payload.categoryId === getDefaultCategoryId(payload.courseId)) {
      await ensureDefaultCategory(req.user.userId, payload.courseId);
    }

    if (payload.categoryId) {
      const category = await getCategoryById(payload.categoryId);
      if (!category || category.status === 'deleted' || normalizeCourseId(category.courseId) !== normalizeCourseId(payload.courseId)) {
        return res.status(400).json({
          success: false,
          message: '指定的題目類別不存在'
        });
      }
    }

    const questionId = db.generateId('q');
    const now = new Date().toISOString();
    const question = {
      PK: `QUESTION#${questionId}`,
      SK: 'META',
      GSI1PK: `QCAT#${payload.categoryId || 'uncategorized'}`,
      GSI1SK: `QUESTION#${questionId}`,
      entityType: 'QUESTION',
      questionId,
      ...payload,
      status: 'active',
      usageCount: 0,
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(question);
    if (payload.categoryId) {
      await refreshCategoryQuestionCount(payload.categoryId);
    }

    const categoriesMap = await loadCategoriesMap(payload.courseId);
    res.status(201).json({
      success: true,
      data: normalizeQuestion(question, categoriesMap),
      message: '題目建立成功'
    });
  } catch (error) {
    console.error('Create question error:', error);
    res.status(500).json({
      success: false,
      message: '建立題目失敗'
    });
  }
});

router.put('/:questionId', authMiddleware, async (req, res) => {
  try {
    const { questionId } = req.params;
    const existing = await getQuestionById(questionId);
    if (!existing || existing.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: '找不到題目'
      });
    }

    const managedCourse = await getManagedCourse(existing.courseId, req.user, res, {
      required: !!normalizeCourseId(existing.courseId)
    });
    if (managedCourse === false) return;

    if (!req.user.isAdmin && existing.createdBy !== req.user.userId && !isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '無權限更新此題目'
      });
    }

    const previousCategoryId = existing.categoryId || null;
    const payload = buildQuestionPayload(req.body, existing);
    payload.courseId = normalizeCourseId(existing.courseId) || normalizeCourseId(payload.courseId);

    if (!payload.questionText) {
      return res.status(400).json({
        success: false,
        message: '題目內容不可為空'
      });
    }

    if (payload.categoryId === getDefaultCategoryId(payload.courseId)) {
      await ensureDefaultCategory(req.user.userId, payload.courseId);
    }

    if (payload.categoryId) {
      const category = await getCategoryById(payload.categoryId);
      if (!category || category.status === 'deleted' || normalizeCourseId(category.courseId) !== normalizeCourseId(payload.courseId)) {
        return res.status(400).json({
          success: false,
          message: '指定的題目類別不存在'
        });
      }
    }

    const updates = {
      ...payload,
      GSI1PK: `QCAT#${payload.categoryId || 'uncategorized'}`,
      updatedAt: new Date().toISOString()
    };

    const updated = await db.updateItem(existing.PK, existing.SK, updates);

    if (previousCategoryId !== payload.categoryId) {
      await refreshCategoryQuestionCount(previousCategoryId);
      await refreshCategoryQuestionCount(payload.categoryId);
    } else {
      await refreshCategoryQuestionCount(payload.categoryId);
    }

    const categoriesMap = await loadCategoriesMap(payload.courseId);
    res.json({
      success: true,
      data: normalizeQuestion(updated, categoriesMap),
      message: '題目更新成功'
    });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({
      success: false,
      message: '更新題目失敗'
    });
  }
});

router.delete('/:questionId', authMiddleware, async (req, res) => {
  try {
    const { questionId } = req.params;
    const question = await getQuestionById(questionId);

    if (!question || question.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: '找不到題目'
      });
    }

    const managedCourse = await getManagedCourse(question.courseId, req.user, res, {
      required: !!normalizeCourseId(question.courseId)
    });
    if (managedCourse === false) return;

    if (!req.user.isAdmin && question.createdBy !== req.user.userId && !isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '無權限刪除此題目'
      });
    }

    await db.updateItem(question.PK, question.SK, {
      status: 'deleted',
      updatedAt: new Date().toISOString()
    });

    await refreshCategoryQuestionCount(question.categoryId || null);

    res.json({
      success: true,
      message: '題目刪除成功'
    });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({
      success: false,
      message: '刪除題目失敗'
    });
  }
});

router.post('/import', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可匯入題目'
      });
    }

    const courseId = normalizeCourseId(req.body.courseId);
    const managedCourse = await getManagedCourse(courseId, req.user, res, { required: true });
    if (!managedCourse) return;

    const inputQuestions = Array.isArray(req.body.questions) ? req.body.questions : [];
    if (inputQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: '請提供要匯入的題目資料'
      });
    }

    await ensureDefaultCategory(req.user.userId, courseId);

    const overrideCategoryId = req.body.categoryId || req.body.category || null;
    if (overrideCategoryId) {
      if (overrideCategoryId === getDefaultCategoryId(courseId)) {
        await ensureDefaultCategory(req.user.userId, courseId);
      }
      const category = await getCategoryById(overrideCategoryId);
      if (!category || category.status === 'deleted' || normalizeCourseId(category.courseId) !== courseId) {
        return res.status(400).json({
          success: false,
          message: '指定的匯入類別不存在'
        });
      }
    }

    const touchedCategories = new Set();
    const now = new Date().toISOString();
    const imported = [];

    for (const row of inputQuestions) {
      const payload = buildQuestionPayload({
        ...row,
        courseId,
        categoryId: overrideCategoryId || row.categoryId || row.category || null
      });

      if (!payload.questionText) continue;

      const questionId = db.generateId('q');
      const item = {
        PK: `QUESTION#${questionId}`,
        SK: 'META',
        GSI1PK: `QCAT#${payload.categoryId || 'uncategorized'}`,
        GSI1SK: `QUESTION#${questionId}`,
        entityType: 'QUESTION',
        questionId,
        ...payload,
        status: 'active',
        usageCount: 0,
        createdBy: req.user.userId,
        createdAt: now,
        updatedAt: now
      };

      await db.putItem(item);
      imported.push(item);
      if (payload.categoryId) touchedCategories.add(payload.categoryId);
    }

    for (const categoryId of touchedCategories) {
      await refreshCategoryQuestionCount(categoryId);
    }

    const categoriesMap = await loadCategoriesMap(courseId);
    res.json({
      success: true,
      data: {
        imported: imported.length,
        questions: imported.map(item => normalizeQuestion(item, categoriesMap))
      },
      message: `成功匯入 ${imported.length} 題`
    });
  } catch (error) {
    console.error('Import questions error:', error);
    res.status(500).json({
      success: false,
      message: '匯入題目失敗'
    });
  }
});

router.post('/export', authMiddleware, async (req, res) => {
  try {
    const { questionIds, format = 'json' } = req.body || {};
    const courseId = normalizeCourseId(req.body?.courseId);
    const managedCourse = await getManagedCourse(courseId, req.user, res, { required: true });
    if (!managedCourse) return;

    const categoriesMap = await loadCategoriesMap(courseId);
    let questions = [];

    if (Array.isArray(questionIds) && questionIds.length > 0) {
      for (const questionId of questionIds) {
        const question = await getQuestionById(questionId);
        if (question && question.status !== 'deleted' && normalizeCourseId(question.courseId) === courseId) {
          questions.push(normalizeQuestion(question, categoriesMap));
        }
      }
    } else {
      const all = await loadActiveQuestions(courseId);
      const normalized = all.map(q => normalizeQuestion(q, categoriesMap));
      questions = filterQuestions(normalized, { ...(req.body || {}), courseId });
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      format,
      questionCount: questions.length,
      questions
    };

    res.json({
      success: true,
      data: exportData,
      message: '匯出成功'
    });
  } catch (error) {
    console.error('Export questions error:', error);
    res.status(500).json({
      success: false,
      message: '匯出題目失敗'
    });
  }
});

router.post('/add-to-quiz', authMiddleware, async (req, res) => {
  try {
    const { quizId, questionIds } = req.body;
    if (!quizId || !Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '請提供測驗 ID 與題目列表'
      });
    }

    let added = 0;
    const now = new Date().toISOString();

    for (const questionId of questionIds) {
      const question = await getQuestionById(questionId);
      if (!question || question.status === 'deleted') continue;

      await db.putItem({
        PK: `QUIZ#${quizId}`,
        SK: `QUESTION#${questionId}`,
        entityType: 'QUIZ_QUESTION_REFERENCE',
        quizId,
        questionId,
        addedBy: req.user.userId,
        addedAt: now
      });

      await db.updateItem(question.PK, question.SK, {
        usageCount: (question.usageCount || 0) + 1,
        updatedAt: now
      });

      added += 1;
    }

    res.json({
      success: true,
      data: {
        quizId,
        addedQuestions: added
      },
      message: `成功加入 ${added} 題到測驗`
    });
  } catch (error) {
    console.error('Add to quiz error:', error);
    res.status(500).json({
      success: false,
      message: '加入測驗失敗'
    });
  }
});

module.exports = router;
