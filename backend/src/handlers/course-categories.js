/**
 * 課程類別管理 API
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, adminMiddleware } = require('../utils/auth');

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCategory(category, ext = {}) {
  const categoryId = category.categoryId || category.id;
  const sortOrder = category.sortOrder !== undefined
    ? category.sortOrder
    : (category.order !== undefined ? category.order : 0);

  return {
    id: categoryId,
    categoryId,
    name: category.name || '',
    description: category.description || '',
    parentId: category.parentId || null,
    sortOrder,
    order: sortOrder,
    status: category.status || 'active',
    courseCount: ext.courseCount ?? category.courseCount ?? 0,
    childCount: ext.childCount ?? category.childCount ?? 0,
    courses: ext.courses || category.courses || [],
    createdBy: category.createdBy || null,
    createdAt: category.createdAt || null,
    updatedAt: category.updatedAt || null
  };
}

async function getAllCategories() {
  const categories = await db.scan({
    filter: {
      expression: 'entityType = :type AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'COURSE_CATEGORY', ':deleted': 'deleted' },
      names: { '#status': 'status' }
    }
  });

  return categories;
}

async function getCategoryById(categoryId) {
  const direct = await db.getItem(`CATEGORY#${categoryId}`, 'META');
  if (direct && direct.entityType === 'COURSE_CATEGORY' && direct.status !== 'deleted') return direct;

  const fallback = await db.scan({
    filter: {
      expression: 'entityType = :type AND categoryId = :cid AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'COURSE_CATEGORY', ':cid': categoryId, ':deleted': 'deleted' },
      names: { '#status': 'status' }
    }
  });

  return fallback[0] || null;
}

async function getAllCourses() {
  const courses = await db.scan({
    filter: {
      expression: 'entityType = :type',
      values: { ':type': 'COURSE' }
    }
  });
  return courses;
}

function getCourseCategoryId(course) {
  return course.categoryId || course.category || null;
}

// ============================================================================
// 課程類別 CRUD
// ============================================================================

router.get('/', authMiddleware, async (req, res) => {
  try {
    const [categories, courses] = await Promise.all([
      getAllCategories(),
      getAllCourses()
    ]);

    const courseCountMap = new Map();
    courses.forEach(course => {
      const cid = getCourseCategoryId(course);
      if (!cid) return;
      courseCountMap.set(cid, (courseCountMap.get(cid) || 0) + 1);
    });

    const childCountMap = new Map();
    categories.forEach(cat => {
      if (!cat.parentId) return;
      childCountMap.set(cat.parentId, (childCountMap.get(cat.parentId) || 0) + 1);
    });

    const normalized = categories
      .map(cat => normalizeCategory(cat, {
        courseCount: courseCountMap.get(cat.categoryId) || 0,
        childCount: childCountMap.get(cat.categoryId) || 0
      }))
      .sort((a, b) => {
        if ((a.sortOrder || 0) !== (b.sortOrder || 0)) {
          return (a.sortOrder || 0) - (b.sortOrder || 0);
        }
        return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
      });

    res.json({
      success: true,
      data: normalized
    });
  } catch (error) {
    console.error('Get course categories error:', error);
    res.status(500).json({
      success: false,
      message: '取得課程類別失敗'
    });
  }
});

router.get('/:categoryId', authMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const category = await getCategoryById(categoryId);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: '找不到課程類別'
      });
    }

    const [categories, courses] = await Promise.all([
      getAllCategories(),
      getAllCourses()
    ]);

    const childCount = categories.filter(c => c.parentId === categoryId).length;
    const relatedCourses = courses
      .filter(c => getCourseCategoryId(c) === categoryId)
      .map(c => ({
        id: c.courseId || c.id,
        courseId: c.courseId || c.id,
        title: c.title || c.name || '未命名課程',
        isPublished: (c.status || '') === 'published'
      }));

    res.json({
      success: true,
      data: normalizeCategory(category, {
        childCount,
        courseCount: relatedCourses.length,
        courses: relatedCourses
      })
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: '取得類別詳情失敗'
    });
  }
});

router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { name, description, parentId, sortOrder } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: '請提供類別名稱'
      });
    }

    if (parentId) {
      const parent = await getCategoryById(parentId);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: '父類別不存在'
        });
      }
    }

    const existing = await getAllCategories();
    const nextSortOrder = sortOrder !== undefined
      ? parseInteger(sortOrder, 0, { min: 0 })
      : existing.length + 1;

    const categoryId = db.generateId('ccat');
    const now = new Date().toISOString();
    const category = {
      PK: `CATEGORY#${categoryId}`,
      SK: 'META',
      GSI1PK: parentId ? `CATEGORY#${parentId}` : 'CATEGORY#ROOT',
      GSI1SK: `CATEGORY#${categoryId}`,
      entityType: 'COURSE_CATEGORY',
      categoryId,
      name: String(name).trim(),
      description: description || '',
      parentId: parentId || null,
      sortOrder: nextSortOrder,
      order: nextSortOrder,
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
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: '建立類別失敗'
    });
  }
});

router.put('/:categoryId', adminMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, parentId, sortOrder } = req.body;

    const category = await getCategoryById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: '找不到課程類別'
      });
    }

    if (parentId && parentId === categoryId) {
      return res.status(400).json({
        success: false,
        message: '父類別不可設定為自己'
      });
    }

    if (parentId) {
      const parent = await getCategoryById(parentId);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: '父類別不存在'
        });
      }
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = String(name || '').trim();
    if (description !== undefined) updates.description = String(description || '');
    if (parentId !== undefined) {
      updates.parentId = parentId || null;
      updates.GSI1PK = parentId ? `CATEGORY#${parentId}` : 'CATEGORY#ROOT';
    }
    if (sortOrder !== undefined) {
      const nextOrder = parseInteger(sortOrder, 0, { min: 0 });
      updates.sortOrder = nextOrder;
      updates.order = nextOrder;
    }

    const updated = await db.updateItem(category.PK, category.SK, updates);

    res.json({
      success: true,
      data: normalizeCategory(updated),
      message: '類別更新成功'
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: '更新類別失敗'
    });
  }
});

router.delete('/:categoryId', adminMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const category = await getCategoryById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: '找不到課程類別'
      });
    }

    const [categories, courses] = await Promise.all([
      getAllCategories(),
      getAllCourses()
    ]);

    const hasChildren = categories.some(cat => cat.parentId === categoryId);
    if (hasChildren) {
      return res.status(400).json({
        success: false,
        message: '此類別仍包含子類別，請先處理子類別'
      });
    }

    const hasCourses = courses.some(course => getCourseCategoryId(course) === categoryId);
    if (hasCourses) {
      return res.status(400).json({
        success: false,
        message: '此類別仍有課程，請先移轉課程'
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
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: '刪除類別失敗'
    });
  }
});

router.put('/:categoryId/reorder', adminMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { newParentId, newSortOrder } = req.body;

    const category = await getCategoryById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: '找不到課程類別'
      });
    }

    if (newParentId) {
      if (newParentId === categoryId) {
        return res.status(400).json({
          success: false,
          message: '父類別不可設定為自己'
        });
      }

      const parent = await getCategoryById(newParentId);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: '指定的新父類別不存在'
        });
      }
    }

    const nextOrder = parseInteger(newSortOrder, category.sortOrder || category.order || 0, { min: 0 });
    const updates = {
      parentId: newParentId || null,
      sortOrder: nextOrder,
      order: nextOrder,
      GSI1PK: newParentId ? `CATEGORY#${newParentId}` : 'CATEGORY#ROOT',
      updatedAt: new Date().toISOString()
    };

    const updated = await db.updateItem(category.PK, category.SK, updates);

    res.json({
      success: true,
      data: normalizeCategory(updated),
      message: '排序更新成功'
    });
  } catch (error) {
    console.error('Reorder category error:', error);
    res.status(500).json({
      success: false,
      message: '排序更新失敗'
    });
  }
});

module.exports = router;
