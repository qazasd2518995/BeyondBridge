/**
 * 課程分類系統 (Moodle-style)
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');

// 預設分類（當資料庫沒有分類時使用）
const DEFAULT_CATEGORIES = [
  { categoryId: 'cat_language', name: '語言學習', nameEn: 'Language Learning', icon: 'book-open', order: 1 },
  { categoryId: 'cat_math', name: '數學', nameEn: 'Mathematics', icon: 'calculator', order: 2 },
  { categoryId: 'cat_science', name: '自然科學', nameEn: 'Science', icon: 'flask', order: 3 },
  { categoryId: 'cat_social', name: '社會科學', nameEn: 'Social Studies', icon: 'users', order: 4 },
  { categoryId: 'cat_art', name: '藝術', nameEn: 'Art', icon: 'palette', order: 5 },
  { categoryId: 'cat_music', name: '音樂', nameEn: 'Music', icon: 'music', order: 6 },
  { categoryId: 'cat_pe', name: '體育', nameEn: 'Physical Education', icon: 'dumbbell', order: 7 },
  { categoryId: 'cat_tech', name: '資訊科技', nameEn: 'Technology', icon: 'laptop-code', order: 8 },
  { categoryId: 'cat_life', name: '生活技能', nameEn: 'Life Skills', icon: 'home', order: 9 },
  { categoryId: 'cat_career', name: '職業發展', nameEn: 'Career Development', icon: 'briefcase', order: 10 }
];

/**
 * 建立分類樹狀結構
 */
function buildCategoryTree(categories) {
  const categoryMap = new Map();
  const rootCategories = [];

  // 建立 map
  categories.forEach(cat => {
    categoryMap.set(cat.categoryId, { ...cat, children: [] });
  });

  // 建立樹狀結構
  categories.forEach(cat => {
    const catWithChildren = categoryMap.get(cat.categoryId);
    if (cat.parentId && categoryMap.has(cat.parentId)) {
      categoryMap.get(cat.parentId).children.push(catWithChildren);
    } else {
      rootCategories.push(catWithChildren);
    }
  });

  // 排序
  const sortByOrder = (a, b) => (a.order || 0) - (b.order || 0);
  rootCategories.sort(sortByOrder);
  rootCategories.forEach(cat => {
    if (cat.children.length > 0) {
      cat.children.sort(sortByOrder);
    }
  });

  return rootCategories;
}

/**
 * GET /api/courses/categories
 * 取得課程分類列表（支援階層結構）
 */
router.get('/categories', async (req, res) => {
  try {
    const { flat = 'false', includeCount = 'true' } = req.query;

    // 從資料庫取得分類
    let categories = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'COURSE_CATEGORY' }
      }
    });

    // 如果沒有分類，使用預設分類
    if (categories.length === 0) {
      categories = DEFAULT_CATEGORIES.map(c => ({
        ...c,
        id: c.categoryId,
        parentId: null,
        description: '',
        visible: true,
        courseCount: 0
      }));
    } else {
      // 清理資料
      categories = categories.map(c => {
        delete c.PK;
        delete c.SK;
        return {
          ...c,
          id: c.categoryId
        };
      });
    }

    // 計算每個分類的課程數量
    if (includeCount === 'true') {
      const courses = await db.scan({
        filter: {
          expression: 'entityType = :type AND #status = :status',
          values: { ':type': 'COURSE', ':status': 'published' },
          names: { '#status': 'status' }
        }
      });

      const countMap = new Map();
      courses.forEach(c => {
        const catId = c.categoryId || 'uncategorized';
        countMap.set(catId, (countMap.get(catId) || 0) + 1);
      });

      categories = categories.map(c => ({
        ...c,
        courseCount: countMap.get(c.categoryId) || 0
      }));
    }

    // 決定輸出格式
    if (flat === 'true') {
      // 扁平列表
      categories.sort((a, b) => (a.order || 0) - (b.order || 0));
      res.json({
        success: true,
        data: categories
      });
    } else {
      // 樹狀結構
      const tree = buildCategoryTree(categories);
      res.json({
        success: true,
        data: tree
      });
    }
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得分類失敗'
    });
  }
});

/**
 * GET /api/courses/categories/:categoryId
 * 取得特定分類詳情
 */
router.get('/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await db.getItem(`CATEGORY#${categoryId}`, 'META');

    if (!category) {
      // 檢查是否為預設分類
      const defaultCat = DEFAULT_CATEGORIES.find(c => c.categoryId === categoryId);
      if (defaultCat) {
        return res.json({
          success: true,
          data: { ...defaultCat, id: defaultCat.categoryId, courseCount: 0 }
        });
      }

      return res.status(404).json({
        success: false,
        error: 'CATEGORY_NOT_FOUND',
        message: '找不到此分類'
      });
    }

    delete category.PK;
    delete category.SK;

    // 取得該分類下的課程
    const courses = await db.scan({
      filter: {
        expression: 'entityType = :type AND categoryId = :categoryId',
        values: { ':type': 'COURSE', ':categoryId': categoryId }
      }
    });

    res.json({
      success: true,
      data: {
        ...category,
        id: category.categoryId,
        courseCount: courses.length
      }
    });

  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得分類失敗'
    });
  }
});

/**
 * POST /api/courses/categories
 * 建立新分類（管理員專用）
 */
router.post('/categories', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有管理員可以建立分類'
      });
    }

    const { name, nameEn, parentId, description, icon, visible = true } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '分類名稱為必填'
      });
    }

    // 如果有父分類，驗證其存在
    if (parentId) {
      const parent = await db.getItem(`CATEGORY#${parentId}`, 'META');
      if (!parent) {
        return res.status(400).json({
          success: false,
          error: 'PARENT_NOT_FOUND',
          message: '找不到父分類'
        });
      }
    }

    // 取得現有分類以決定順序
    const existingCategories = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'COURSE_CATEGORY' }
      }
    });

    const categoryId = db.generateId('cat');
    const now = new Date().toISOString();

    const category = {
      PK: `CATEGORY#${categoryId}`,
      SK: 'META',
      entityType: 'COURSE_CATEGORY',
      GSI1PK: parentId ? `CATEGORY#${parentId}` : 'CATEGORY#ROOT',
      GSI1SK: `CATEGORY#${categoryId}`,

      categoryId,
      name,
      nameEn: nameEn || name,
      parentId: parentId || null,
      description: description || '',
      icon: icon || 'folder',
      visible,
      depth: parentId ? 1 : 0, // 簡化：只支援兩層
      order: existingCategories.length + 1,

      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(category);

    delete category.PK;
    delete category.SK;

    res.status(201).json({
      success: true,
      message: '分類建立成功',
      data: category
    });

  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立分類失敗'
    });
  }
});

/**
 * PUT /api/courses/categories/:categoryId
 * 更新分類（管理員專用）
 */
router.put('/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有管理員可以更新分類'
      });
    }

    const { categoryId } = req.params;
    const { name, nameEn, parentId, description, icon, visible, order } = req.body;

    const category = await db.getItem(`CATEGORY#${categoryId}`, 'META');
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'CATEGORY_NOT_FOUND',
        message: '找不到此分類'
      });
    }

    // 防止將分類設為自己的子分類
    if (parentId === categoryId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARENT',
        message: '無法將分類設為自己的子分類'
      });
    }

    const updates = {
      ...(name && { name }),
      ...(nameEn && { nameEn }),
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(description !== undefined && { description }),
      ...(icon && { icon }),
      ...(visible !== undefined && { visible }),
      ...(order !== undefined && { order }),
      updatedAt: new Date().toISOString()
    };

    // 更新 GSI
    if (parentId !== undefined) {
      updates.GSI1PK = parentId ? `CATEGORY#${parentId}` : 'CATEGORY#ROOT';
      updates.depth = parentId ? 1 : 0;
    }

    const updated = await db.updateItem(`CATEGORY#${categoryId}`, 'META', updates);

    delete updated.PK;
    delete updated.SK;

    res.json({
      success: true,
      message: '分類更新成功',
      data: updated
    });

  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新分類失敗'
    });
  }
});

/**
 * DELETE /api/courses/categories/:categoryId
 * 刪除分類（管理員專用）
 */
router.delete('/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有管理員可以刪除分類'
      });
    }

    const { categoryId } = req.params;
    const { moveCoursesTo } = req.query; // 可選：將課程移動到的目標分類

    const category = await db.getItem(`CATEGORY#${categoryId}`, 'META');
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'CATEGORY_NOT_FOUND',
        message: '找不到此分類'
      });
    }

    // 檢查是否有子分類
    const childCategories = await db.scan({
      filter: {
        expression: 'entityType = :type AND parentId = :parentId',
        values: { ':type': 'COURSE_CATEGORY', ':parentId': categoryId }
      }
    });

    if (childCategories.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'HAS_CHILDREN',
        message: '請先刪除或移動子分類'
      });
    }

    // 取得該分類下的課程
    const courses = await db.scan({
      filter: {
        expression: 'entityType = :type AND categoryId = :categoryId',
        values: { ':type': 'COURSE', ':categoryId': categoryId }
      }
    });

    // 處理課程
    if (courses.length > 0) {
      if (moveCoursesTo) {
        // 移動課程到目標分類
        for (const course of courses) {
          await db.updateItem(`COURSE#${course.courseId}`, 'META', {
            categoryId: moveCoursesTo,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        // 將課程設為未分類
        for (const course of courses) {
          await db.updateItem(`COURSE#${course.courseId}`, 'META', {
            categoryId: null,
            updatedAt: new Date().toISOString()
          });
        }
      }
    }

    // 刪除分類
    await db.deleteItem(`CATEGORY#${categoryId}`, 'META');

    res.json({
      success: true,
      message: '分類已刪除',
      data: {
        coursesAffected: courses.length,
        movedTo: moveCoursesTo || null
      }
    });

  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除分類失敗'
    });
  }
});

/**
 * PUT /api/courses/categories/reorder
 * 重新排序分類（管理員專用）
 */
router.put('/categories/reorder', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有管理員可以排序分類'
      });
    }

    const { orderedIds } = req.body; // Array of categoryIds in desired order

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: '請提供排序後的分類 ID 陣列'
      });
    }

    const now = new Date().toISOString();

    for (let i = 0; i < orderedIds.length; i++) {
      await db.updateItem(`CATEGORY#${orderedIds[i]}`, 'META', {
        order: i + 1,
        updatedAt: now
      });
    }

    res.json({
      success: true,
      message: '分類順序已更新'
    });

  } catch (error) {
    console.error('Reorder categories error:', error);
    res.status(500).json({
      success: false,
      error: 'REORDER_FAILED',
      message: '排序分類失敗'
    });
  }
});

module.exports = router;
