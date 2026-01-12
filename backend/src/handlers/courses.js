/**
 * 課程 API 處理器
 * BeyondBridge Education Platform - Moodle-style LMS
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, optionalAuthMiddleware, adminMiddleware } = require('../utils/auth');

// ==================== 課程列表與詳情 ====================

/**
 * GET /api/courses
 * 取得課程列表
 */
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const {
      status = 'published',
      category,
      instructor,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let courses = await db.scan({
      filter: {
        expression: 'entityType = :type AND #status = :status',
        values: { ':type': 'COURSE', ':status': status },
        names: { '#status': 'status' }
      }
    });

    // 分類篩選
    if (category) {
      courses = courses.filter(c => c.category === category);
    }

    // 講師篩選
    if (instructor) {
      courses = courses.filter(c => c.instructorId === instructor);
    }

    // 搜尋篩選
    if (search) {
      const searchLower = search.toLowerCase();
      courses = courses.filter(c =>
        c.title?.toLowerCase().includes(searchLower) ||
        c.description?.toLowerCase().includes(searchLower) ||
        c.tags?.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    // 排序
    courses.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    // 分頁
    const total = courses.length;
    courses = courses.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // 清理資料
    courses = courses.map(c => {
      delete c.PK;
      delete c.SK;
      return c;
    });

    res.json({
      success: true,
      data: courses,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + courses.length < total
      }
    });

  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程列表失敗'
    });
  }
});

/**
 * GET /api/courses/my
 * 取得我的課程（教師創建的或學生報名的）
 */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { role = 'student' } = req.query;

    if (role === 'instructor') {
      // 教師：取得自己創建的課程
      let courses = await db.scan({
        filter: {
          expression: 'entityType = :type AND instructorId = :instructorId',
          values: { ':type': 'COURSE', ':instructorId': userId }
        }
      });

      courses = courses.map(c => {
        delete c.PK;
        delete c.SK;
        return c;
      });

      res.json({
        success: true,
        data: courses,
        count: courses.length
      });
    } else {
      // 學生：取得已報名的課程進度
      const progressList = await db.getUserCourseProgress(userId);

      // 取得課程詳情
      const courses = await Promise.all(
        progressList.map(async (p) => {
          const course = await db.getItem(`COURSE#${p.courseId}`, 'META');
          if (course) {
            delete course.PK;
            delete course.SK;
            return {
              ...course,
              progress: {
                status: p.status,
                progressPercentage: p.progressPercentage,
                completedUnits: p.completedUnits,
                currentUnit: p.currentUnit,
                totalTimeSpent: p.totalTimeSpent,
                lastAccessedAt: p.lastAccessedAt,
                enrolledAt: p.enrolledAt
              }
            };
          }
          return null;
        })
      );

      res.json({
        success: true,
        data: courses.filter(Boolean),
        count: courses.filter(Boolean).length
      });
    }

  } catch (error) {
    console.error('Get my courses error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程失敗'
    });
  }
});

// ==================== 課程分類系統 (Moodle-style) ====================

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

/**
 * GET /api/courses/:id
 * 取得課程詳情
 */
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 取得課程章節
    const sections = await db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' });

    // 取得每個章節的活動
    const sectionsWithActivities = await Promise.all(
      sections.map(async (section) => {
        const activities = await db.query(`COURSE#${id}`, {
          skPrefix: `ACTIVITY#${section.sectionId}#`
        });
        delete section.PK;
        delete section.SK;
        return {
          ...section,
          activities: activities.map(a => {
            delete a.PK;
            delete a.SK;
            return a;
          }).sort((a, b) => a.order - b.order)
        };
      })
    );

    // 如果用戶已登入，取得進度
    let userProgress = null;
    if (req.user) {
      const progress = await db.getItem(`USER#${req.user.userId}`, `PROG#COURSE#${id}`);
      if (progress) {
        delete progress.PK;
        delete progress.SK;
        userProgress = progress;
      }
    }

    // 清理資料
    delete course.PK;
    delete course.SK;

    res.json({
      success: true,
      data: {
        ...course,
        sections: sectionsWithActivities.sort((a, b) => a.order - b.order),
        userProgress
      }
    });

  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程失敗'
    });
  }
});

// ==================== 課程管理（教師/管理員） ====================

/**
 * POST /api/courses
 * 建立新課程
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      title,
      shortName,
      description,
      summary,
      category,
      format = 'topics', // topics, weeks, social, singleactivity
      startDate,
      endDate,
      visibility = 'show', // show, hide
      enrollmentKey,
      selfEnrollment = true,
      maxEnrollment,
      tags = [],
      thumbnail,
      language = 'zh-TW'
    } = req.body;

    // 驗證必填欄位
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供課程名稱'
      });
    }

    const courseId = db.generateId('course');
    const now = new Date().toISOString();

    // 取得講師資料
    const instructor = await db.getUser(userId) || await db.getAdmin(userId);

    const courseItem = {
      PK: `COURSE#${courseId}`,
      SK: 'META',
      entityType: 'COURSE',
      GSI1PK: `CAT#${category || 'general'}`,
      GSI1SK: `COURSE#${courseId}`,
      GSI2PK: `STATUS#${visibility === 'show' ? 'published' : 'draft'}`,
      GSI2SK: now,

      courseId,
      title,
      shortName: shortName || title.substring(0, 20),
      description,
      summary,
      category: category || 'general',
      format,

      instructorId: userId,
      instructorName: instructor?.displayName || '未知講師',

      startDate,
      endDate,
      visibility,
      status: visibility === 'show' ? 'published' : 'draft',

      enrollmentKey,
      selfEnrollment,
      maxEnrollment: maxEnrollment ? parseInt(maxEnrollment) : null,
      enrollmentCount: 0,

      tags,
      thumbnail,
      language,

      // 課程設定
      settings: {
        showActivityDates: true,
        showActivityReports: true,
        enableCompletion: true,
        enableGrades: true,
        gradeToPass: 60
      },

      // 統計資料
      stats: {
        totalActivities: 0,
        totalSections: 0,
        averageRating: 0,
        totalRatings: 0,
        completionRate: 0
      },

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(courseItem);

    // 建立預設章節
    const defaultSection = {
      PK: `COURSE#${courseId}`,
      SK: 'SECTION#01',
      entityType: 'COURSE_SECTION',

      sectionId: '01',
      courseId,
      title: '課程簡介',
      summary: '',
      order: 1,
      visible: true,

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(defaultSection);

    delete courseItem.PK;
    delete courseItem.SK;

    res.status(201).json({
      success: true,
      message: '課程建立成功',
      data: courseItem
    });

  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立課程失敗'
    });
  }
});

/**
 * PUT /api/courses/:id
 * 更新課程
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    // 取得課程
    const course = await db.getItem(`COURSE#${id}`, 'META');
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
        message: '沒有權限修改此課程'
      });
    }

    // 不允許更新的欄位
    delete updates.courseId;
    delete updates.instructorId;
    delete updates.createdAt;
    delete updates.enrollmentCount;

    // 更新 GSI 索引（如果需要）
    if (updates.category) {
      updates.GSI1PK = `CAT#${updates.category}`;
    }
    if (updates.visibility !== undefined) {
      updates.status = updates.visibility === 'show' ? 'published' : 'draft';
      updates.GSI2PK = `STATUS#${updates.status}`;
    }

    updates.updatedAt = new Date().toISOString();

    const updatedCourse = await db.updateItem(`COURSE#${id}`, 'META', updates);

    delete updatedCourse.PK;
    delete updatedCourse.SK;

    res.json({
      success: true,
      message: '課程已更新',
      data: updatedCourse
    });

  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新課程失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id
 * 刪除課程
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const course = await db.getItem(`COURSE#${id}`, 'META');
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
        message: '沒有權限刪除此課程'
      });
    }

    // 刪除所有相關資料
    // 1. 刪除章節和活動
    const sections = await db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' });
    for (const section of sections) {
      await db.deleteItem(`COURSE#${id}`, section.SK);
    }

    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
    for (const activity of activities) {
      await db.deleteItem(`COURSE#${id}`, activity.SK);
    }

    // 2. 刪除課程本身
    await db.deleteItem(`COURSE#${id}`, 'META');

    res.json({
      success: true,
      message: '課程已刪除'
    });

  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除課程失敗'
    });
  }
});

// ==================== 章節管理 ====================

/**
 * POST /api/courses/:id/sections
 * 新增章節
 */
router.post('/:id/sections', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { title, summary, visible = true } = req.body;

    // 取得課程並驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
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
        message: '沒有權限修改此課程'
      });
    }

    // 取得現有章節數量
    const existingSections = await db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' });
    const sectionNumber = String(existingSections.length + 1).padStart(2, '0');

    const now = new Date().toISOString();
    const sectionItem = {
      PK: `COURSE#${id}`,
      SK: `SECTION#${sectionNumber}`,
      entityType: 'COURSE_SECTION',

      sectionId: sectionNumber,
      courseId: id,
      title: title || `第 ${existingSections.length + 1} 週`,
      summary: summary || '',
      order: existingSections.length + 1,
      visible,

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(sectionItem);

    // 更新課程統計
    await db.updateItem(`COURSE#${id}`, 'META', {
      'stats.totalSections': existingSections.length + 1,
      updatedAt: now
    });

    delete sectionItem.PK;
    delete sectionItem.SK;

    res.status(201).json({
      success: true,
      message: '章節新增成功',
      data: sectionItem
    });

  } catch (error) {
    console.error('Add section error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '新增章節失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/sections/:sectionId
 * 更新章節
 */
router.put('/:id/sections/:sectionId', authMiddleware, async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 不允許更新的欄位
    delete updates.sectionId;
    delete updates.courseId;
    delete updates.createdAt;

    updates.updatedAt = new Date().toISOString();

    const updatedSection = await db.updateItem(
      `COURSE#${id}`,
      `SECTION#${sectionId}`,
      updates
    );

    delete updatedSection.PK;
    delete updatedSection.SK;

    res.json({
      success: true,
      message: '章節已更新',
      data: updatedSection
    });

  } catch (error) {
    console.error('Update section error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新章節失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/sections/:sectionId
 * 刪除章節
 */
router.delete('/:id/sections/:sectionId', authMiddleware, async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const userId = req.user.userId;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 刪除章節內的所有活動
    const activities = await db.query(`COURSE#${id}`, {
      skPrefix: `ACTIVITY#${sectionId}#`
    });
    for (const activity of activities) {
      await db.deleteItem(`COURSE#${id}`, activity.SK);
    }

    // 刪除章節
    await db.deleteItem(`COURSE#${id}`, `SECTION#${sectionId}`);

    res.json({
      success: true,
      message: '章節已刪除'
    });

  } catch (error) {
    console.error('Delete section error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除章節失敗'
    });
  }
});

// ==================== 活動管理（Moodle Activities） ====================

/**
 * POST /api/courses/:id/sections/:sectionId/activities
 * 新增活動到章節
 * 活動類型：page, url, file, assignment, quiz, forum, label, choice, feedback
 */
router.post('/:id/sections/:sectionId/activities', authMiddleware, async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const userId = req.user.userId;
    const {
      type, // page, url, file, assignment, quiz, forum, label, choice, feedback
      title,
      description,
      content, // 頁面內容
      url, // 外部連結
      fileId, // 檔案ID
      visible = true,
      availability, // { from, until, conditions }
      completion // { type: 'manual' | 'view' | 'grade', gradeToPass }
    } = req.body;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    if (!type || !title) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供活動類型和標題'
      });
    }

    // 取得現有活動數量
    const existingActivities = await db.query(`COURSE#${id}`, {
      skPrefix: `ACTIVITY#${sectionId}#`
    });
    const activityNumber = String(existingActivities.length + 1).padStart(3, '0');
    const activityId = db.generateId('act');

    const now = new Date().toISOString();
    const activityItem = {
      PK: `COURSE#${id}`,
      SK: `ACTIVITY#${sectionId}#${activityNumber}`,
      entityType: 'COURSE_ACTIVITY',

      activityId,
      courseId: id,
      sectionId,
      type,
      title,
      description,

      // 類型特定內容
      content: type === 'page' || type === 'label' ? content : undefined,
      url: type === 'url' ? url : undefined,
      fileId: type === 'file' ? fileId : undefined,

      order: existingActivities.length + 1,
      visible,

      availability: availability || {},
      completion: completion || { type: 'manual' },

      // 統計
      stats: {
        views: 0,
        completions: 0
      },

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(activityItem);

    // 更新課程統計
    const totalActivities = (course.stats?.totalActivities || 0) + 1;
    await db.updateItem(`COURSE#${id}`, 'META', {
      'stats.totalActivities': totalActivities,
      updatedAt: now
    });

    delete activityItem.PK;
    delete activityItem.SK;

    res.status(201).json({
      success: true,
      message: '活動新增成功',
      data: activityItem
    });

  } catch (error) {
    console.error('Add activity error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '新增活動失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/activities/:activityId
 * 更新活動
 */
router.put('/:id/activities/:activityId', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 找到活動
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
    const activity = activities.find(a => a.activityId === activityId);

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'ACTIVITY_NOT_FOUND',
        message: '找不到此活動'
      });
    }

    // 不允許更新的欄位
    delete updates.activityId;
    delete updates.courseId;
    delete updates.sectionId;
    delete updates.createdAt;

    updates.updatedAt = new Date().toISOString();

    const updatedActivity = await db.updateItem(`COURSE#${id}`, activity.SK, updates);

    delete updatedActivity.PK;
    delete updatedActivity.SK;

    res.json({
      success: true,
      message: '活動已更新',
      data: updatedActivity
    });

  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新活動失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/activities/:activityId
 * 刪除活動
 */
router.delete('/:id/activities/:activityId', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const userId = req.user.userId;

    // 驗證權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    // 找到活動
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
    const activity = activities.find(a => a.activityId === activityId);

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'ACTIVITY_NOT_FOUND',
        message: '找不到此活動'
      });
    }

    await db.deleteItem(`COURSE#${id}`, activity.SK);

    res.json({
      success: true,
      message: '活動已刪除'
    });

  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除活動失敗'
    });
  }
});

// ==================== 課程報名 ====================

/**
 * POST /api/courses/:id/enroll
 * 報名課程
 */
router.post('/:id/enroll', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { enrollmentKey } = req.body;

    // 檢查課程是否存在
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 檢查課程是否開放報名
    if (!course.selfEnrollment) {
      return res.status(403).json({
        success: false,
        error: 'ENROLLMENT_CLOSED',
        message: '此課程不開放自行報名'
      });
    }

    // 檢查報名密鑰
    if (course.enrollmentKey && course.enrollmentKey !== enrollmentKey) {
      return res.status(403).json({
        success: false,
        error: 'INVALID_KEY',
        message: '報名密鑰錯誤'
      });
    }

    // 檢查人數上限
    if (course.maxEnrollment && course.enrollmentCount >= course.maxEnrollment) {
      return res.status(403).json({
        success: false,
        error: 'COURSE_FULL',
        message: '課程已額滿'
      });
    }

    // 檢查是否已報名
    const existingProgress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (existingProgress) {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_ENROLLED',
        message: '您已報名此課程'
      });
    }

    // 取得課程章節和活動
    const sections = await db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' });

    // 建立進度記錄
    const now = new Date().toISOString();
    const progressItem = {
      PK: `USER#${userId}`,
      SK: `PROG#COURSE#${id}`,
      entityType: 'COURSE_PROGRESS',
      GSI1PK: `COURSE#${id}`,
      GSI1SK: `ENROLLED#${userId}`,
      createdAt: now,

      userId,
      courseId: id,
      courseTitle: course.title,
      status: 'in_progress',
      progressPercentage: 0,
      completedActivities: [],
      currentSectionId: sections[0]?.sectionId || '01',
      totalTimeSpent: 0,
      lastAccessedAt: now,
      enrolledAt: now,
      completedAt: null,

      // 成績記錄
      grades: [],
      overallGrade: null
    };

    await db.putItem(progressItem);

    // 更新課程報名數
    await db.updateItem(`COURSE#${id}`, 'META', {
      enrollmentCount: (course.enrollmentCount || 0) + 1
    });

    // 記錄活動日誌
    await db.logActivity(userId, 'course_enrolled', 'course', id, {
      courseTitle: course.title
    });

    res.status(201).json({
      success: true,
      message: '報名成功',
      data: {
        courseId: id,
        courseTitle: course.title,
        enrolledAt: now
      }
    });

  } catch (error) {
    console.error('Enroll course error:', error);
    res.status(500).json({
      success: false,
      error: 'ENROLL_FAILED',
      message: '報名失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/enroll
 * 退選課程
 */
router.delete('/:id/enroll', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 檢查是否已報名
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 刪除進度記錄
    await db.deleteItem(`USER#${userId}`, `PROG#COURSE#${id}`);

    // 更新課程報名數
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (course) {
      await db.updateItem(`COURSE#${id}`, 'META', {
        enrollmentCount: Math.max(0, (course.enrollmentCount || 1) - 1)
      });
    }

    res.json({
      success: true,
      message: '已退選課程'
    });

  } catch (error) {
    console.error('Unenroll course error:', error);
    res.status(500).json({
      success: false,
      error: 'UNENROLL_FAILED',
      message: '退選失敗'
    });
  }
});

/**
 * GET /api/courses/:id/participants
 * 取得課程參與者列表
 */
router.get('/:id/participants', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 只有講師和管理員可以看完整參與者列表
    const isInstructor = course.instructorId === userId;
    if (!isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看參與者列表'
      });
    }

    // 查詢已報名的用戶
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${id}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    // 取得用戶詳情
    const participants = await Promise.all(
      enrollments.map(async (e) => {
        const user = await db.getUser(e.userId);
        if (user) {
          return {
            userId: e.userId,
            displayName: user.displayName,
            email: user.email,
            role: 'student',
            enrolledAt: e.enrolledAt,
            lastAccess: e.lastAccessedAt,
            progress: e.progressPercentage,
            status: e.status
          };
        }
        return null;
      })
    );

    // 加入講師
    const instructor = await db.getUser(course.instructorId) || await db.getAdmin(course.instructorId);
    if (instructor) {
      participants.unshift({
        userId: course.instructorId,
        displayName: instructor.displayName,
        email: instructor.email,
        role: 'instructor',
        enrolledAt: course.createdAt
      });
    }

    res.json({
      success: true,
      data: participants.filter(Boolean),
      count: participants.filter(Boolean).length
    });

  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得參與者列表失敗'
    });
  }
});

// ==================== 進度追蹤 ====================

/**
 * GET /api/courses/:id/progress
 * 取得用戶的課程進度
 */
router.get('/:id/progress', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    delete progress.PK;
    delete progress.SK;

    res.json({
      success: true,
      data: progress
    });

  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得進度失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/progress
 * 更新課程進度
 */
router.put('/:id/progress', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { activityId, completed, timeSpent, currentSectionId } = req.body;

    // 取得現有進度
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 取得課程資訊
    const course = await db.getItem(`COURSE#${id}`, 'META');
    const totalActivities = course?.stats?.totalActivities || 1;

    const updates = {
      lastAccessedAt: new Date().toISOString()
    };

    // 更新已完成活動
    if (activityId && completed) {
      const completedActivities = [...(progress.completedActivities || [])];
      if (!completedActivities.includes(activityId)) {
        completedActivities.push(activityId);
      }
      updates.completedActivities = completedActivities;
      updates.progressPercentage = Math.round((completedActivities.length / totalActivities) * 100);

      // 檢查是否完成全部
      if (completedActivities.length >= totalActivities) {
        updates.status = 'completed';
        updates.completedAt = new Date().toISOString();
      }

      // 更新活動完成統計
      const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
      const activity = activities.find(a => a.activityId === activityId);
      if (activity) {
        await db.updateItem(`COURSE#${id}`, activity.SK, {
          'stats.completions': (activity.stats?.completions || 0) + 1
        });
      }
    }

    // 更新當前章節
    if (currentSectionId) {
      updates.currentSectionId = currentSectionId;
    }

    // 更新學習時間
    if (timeSpent) {
      updates.totalTimeSpent = (progress.totalTimeSpent || 0) + timeSpent;
    }

    const updatedProgress = await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, updates);

    // 記錄活動日誌
    await db.logActivity(userId, 'course_progress', 'course', id, {
      unitId: updates.currentUnit,
      progressPercentage: updates.progressPercentage,
      timeSpent: timeSpent || 0
    });

    delete updatedProgress.PK;
    delete updatedProgress.SK;

    res.json({
      success: true,
      message: '進度已更新',
      data: updatedProgress
    });

  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新進度失敗'
    });
  }
});

/**
 * POST /api/courses/:id/activities/:activityId/complete
 * 標記活動完成
 */
router.post('/:id/activities/:activityId/complete', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const userId = req.user.userId;

    // 取得現有進度
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    const completedActivities = [...(progress.completedActivities || [])];
    if (!completedActivities.includes(activityId)) {
      completedActivities.push(activityId);
    }

    // 取得課程資訊計算進度
    const course = await db.getItem(`COURSE#${id}`, 'META');
    const totalActivities = course?.stats?.totalActivities || 1;
    const progressPercentage = Math.round((completedActivities.length / totalActivities) * 100);

    const now = new Date().toISOString();
    const updates = {
      completedActivities,
      progressPercentage,
      lastAccessedAt: now
    };

    if (completedActivities.length >= totalActivities) {
      updates.status = 'completed';
      updates.completedAt = now;
    }

    await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, updates);

    res.json({
      success: true,
      message: '活動已標記完成',
      data: {
        activityId,
        progressPercentage,
        completed: true
      }
    });

  } catch (error) {
    console.error('Complete activity error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '標記完成失敗'
    });
  }
});

// ==================== 課程完成條件系統 (Moodle-style Completion) ====================

/**
 * 完成條件類型
 */
const COMPLETION_CRITERIA_TYPES = {
  ACTIVITY_COMPLETION: 'activity_completion',      // 完成特定活動
  GRADE: 'grade',                                   // 達到特定成績
  DATE: 'date',                                     // 特定日期後
  SELF_COMPLETION: 'self_completion',              // 學生自行標記
  MANUAL: 'manual',                                 // 教師手動標記
  DURATION: 'duration',                            // 學習時間達標
  ROLE: 'role'                                      // 特定角色完成
};

/**
 * 聚合類型
 */
const AGGREGATION_METHODS = {
  ALL: 'all',           // 所有條件都需達成
  ANY: 'any'            // 任一條件達成即可
};

/**
 * GET /api/courses/:id/completion/settings
 * 取得課程完成設定
 */
router.get('/:id/completion/settings', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 取得完成設定
    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');

    // 取得活動完成條件
    const activityCompletions = await db.query(`COURSE#${id}`, {
      skPrefix: 'ACTIVITY_COMPLETION#'
    });

    res.json({
      success: true,
      data: {
        courseId: id,
        enableCompletion: course.settings?.enableCompletion || false,
        completionSettings: completionSettings || {
          aggregationMethod: 'all',
          criteria: [],
          showCompletionOnFrontPage: true,
          completionMessage: '恭喜您完成此課程！'
        },
        activityCompletions: activityCompletions.map(c => {
          delete c.PK;
          delete c.SK;
          return c;
        })
      }
    });

  } catch (error) {
    console.error('Get completion settings error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得完成設定失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/completion/settings
 * 更新課程完成設定
 */
router.put('/:id/completion/settings', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      enableCompletion,
      aggregationMethod = 'all',
      criteria = [],
      showCompletionOnFrontPage = true,
      completionMessage,
      issueCertificate = false,
      awardBadgeId = null
    } = req.body;

    // 權限檢查
    const course = await db.getItem(`COURSE#${id}`, 'META');
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
        message: '沒有權限修改此課程'
      });
    }

    const now = new Date().toISOString();

    // 更新課程設定
    await db.updateItem(`COURSE#${id}`, 'META', {
      'settings.enableCompletion': enableCompletion !== false,
      updatedAt: now
    });

    // 儲存或更新完成設定
    const completionSettingsItem = {
      PK: `COURSE#${id}`,
      SK: 'COMPLETION_SETTINGS',
      entityType: 'COURSE_COMPLETION_SETTINGS',

      courseId: id,
      aggregationMethod,
      criteria: criteria.map((c, index) => ({
        ...c,
        criteriaId: c.criteriaId || db.generateId('crit'),
        order: index + 1
      })),
      showCompletionOnFrontPage,
      completionMessage: completionMessage || '恭喜您完成此課程！',
      issueCertificate,
      awardBadgeId,

      updatedBy: userId,
      updatedAt: now
    };

    await db.putItem(completionSettingsItem);

    delete completionSettingsItem.PK;
    delete completionSettingsItem.SK;

    res.json({
      success: true,
      message: '完成設定已更新',
      data: completionSettingsItem
    });

  } catch (error) {
    console.error('Update completion settings error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新完成設定失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/activities/:activityId/completion
 * 設定活動完成條件
 */
router.put('/:id/activities/:activityId/completion', authMiddleware, async (req, res) => {
  try {
    const { id, activityId } = req.params;
    const userId = req.user.userId;
    const {
      completionType = 'manual',  // manual, view, grade, submit
      gradeToPass = null,
      requiredViews = null,
      expectCompleteBy = null
    } = req.body;

    // 權限檢查
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此課程'
      });
    }

    const now = new Date().toISOString();

    // 儲存活動完成設定
    const activityCompletionItem = {
      PK: `COURSE#${id}`,
      SK: `ACTIVITY_COMPLETION#${activityId}`,
      entityType: 'ACTIVITY_COMPLETION_SETTINGS',

      courseId: id,
      activityId,
      completionType,
      gradeToPass: gradeToPass ? parseFloat(gradeToPass) : null,
      requiredViews: requiredViews ? parseInt(requiredViews) : null,
      expectCompleteBy,

      updatedBy: userId,
      updatedAt: now
    };

    await db.putItem(activityCompletionItem);

    // 同時更新活動本身的 completion 欄位
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });
    const activity = activities.find(a => a.activityId === activityId);
    if (activity) {
      await db.updateItem(`COURSE#${id}`, activity.SK, {
        completion: {
          type: completionType,
          gradeToPass,
          requiredViews,
          expectCompleteBy
        },
        updatedAt: now
      });
    }

    delete activityCompletionItem.PK;
    delete activityCompletionItem.SK;

    res.json({
      success: true,
      message: '活動完成設定已更新',
      data: activityCompletionItem
    });

  } catch (error) {
    console.error('Update activity completion error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新活動完成設定失敗'
    });
  }
});

/**
 * GET /api/courses/:id/completion/status
 * 取得用戶的課程完成狀態
 */
router.get('/:id/completion/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程和完成設定
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 取得活動完成設定
    const activityCompletions = await db.query(`COURSE#${id}`, {
      skPrefix: 'ACTIVITY_COMPLETION#'
    });

    // 取得所有活動
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });

    // 計算每個活動的完成狀態
    const activityStatuses = activities.map(activity => {
      const completionSetting = activityCompletions.find(c => c.activityId === activity.activityId);
      const isCompleted = (progress.completedActivities || []).includes(activity.activityId);

      return {
        activityId: activity.activityId,
        title: activity.title,
        type: activity.type,
        completionType: completionSetting?.completionType || activity.completion?.type || 'manual',
        gradeToPass: completionSetting?.gradeToPass || activity.completion?.gradeToPass,
        isCompleted,
        completedAt: isCompleted ? progress.lastAccessedAt : null
      };
    });

    // 檢查課程完成條件
    const criteria = completionSettings?.criteria || [];
    const criteriaStatuses = await Promise.all(criteria.map(async (criterion) => {
      let isMet = false;

      switch (criterion.type) {
        case COMPLETION_CRITERIA_TYPES.ACTIVITY_COMPLETION:
          // 檢查特定活動是否完成
          if (criterion.activityIds && criterion.activityIds.length > 0) {
            isMet = criterion.activityIds.every(actId =>
              (progress.completedActivities || []).includes(actId)
            );
          } else {
            // 所有活動都需完成
            isMet = activityStatuses.every(a => a.isCompleted);
          }
          break;

        case COMPLETION_CRITERIA_TYPES.GRADE:
          // 檢查成績
          const gradeRequired = criterion.gradeToPass || 60;
          isMet = (progress.overallGrade || 0) >= gradeRequired;
          break;

        case COMPLETION_CRITERIA_TYPES.DATE:
          // 檢查日期
          if (criterion.dateAfter) {
            isMet = new Date() >= new Date(criterion.dateAfter);
          }
          break;

        case COMPLETION_CRITERIA_TYPES.DURATION:
          // 檢查學習時間
          if (criterion.requiredDuration) {
            isMet = (progress.totalTimeSpent || 0) >= criterion.requiredDuration;
          }
          break;

        case COMPLETION_CRITERIA_TYPES.SELF_COMPLETION:
          // 學生自行標記
          isMet = progress.selfMarkedComplete === true;
          break;

        case COMPLETION_CRITERIA_TYPES.MANUAL:
          // 教師手動標記
          isMet = progress.manuallyCompleted === true;
          break;

        default:
          isMet = false;
      }

      return {
        ...criterion,
        isMet
      };
    }));

    // 計算整體完成狀態
    let isCourseComplete = false;
    const aggregationMethod = completionSettings?.aggregationMethod || 'all';

    if (criteriaStatuses.length > 0) {
      if (aggregationMethod === 'all') {
        isCourseComplete = criteriaStatuses.every(c => c.isMet);
      } else {
        isCourseComplete = criteriaStatuses.some(c => c.isMet);
      }
    } else {
      // 沒有設定條件時，依據活動完成率
      isCourseComplete = progress.status === 'completed';
    }

    res.json({
      success: true,
      data: {
        courseId: id,
        userId,
        isComplete: isCourseComplete,
        completedAt: progress.completedAt,
        progressPercentage: progress.progressPercentage || 0,
        overallGrade: progress.overallGrade,
        totalTimeSpent: progress.totalTimeSpent || 0,
        aggregationMethod,
        criteria: criteriaStatuses,
        activities: activityStatuses,
        completionMessage: isCourseComplete ? (completionSettings?.completionMessage || '恭喜您完成此課程！') : null
      }
    });

  } catch (error) {
    console.error('Get completion status error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得完成狀態失敗'
    });
  }
});

/**
 * POST /api/courses/:id/completion/self-mark
 * 學生自行標記課程完成
 */
router.post('/:id/completion/self-mark', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 檢查是否允許自行標記
    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');
    const allowsSelfMark = completionSettings?.criteria?.some(c =>
      c.type === COMPLETION_CRITERIA_TYPES.SELF_COMPLETION
    );

    if (!allowsSelfMark) {
      return res.status(403).json({
        success: false,
        error: 'SELF_MARK_NOT_ALLOWED',
        message: '此課程不允許自行標記完成'
      });
    }

    // 更新進度
    const now = new Date().toISOString();
    await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, {
      selfMarkedComplete: true,
      selfMarkedAt: now,
      status: 'completed',
      completedAt: now,
      updatedAt: now
    });

    res.json({
      success: true,
      message: '已標記課程完成',
      data: {
        courseId: id,
        completedAt: now
      }
    });

  } catch (error) {
    console.error('Self mark complete error:', error);
    res.status(500).json({
      success: false,
      error: 'MARK_FAILED',
      message: '標記完成失敗'
    });
  }
});

/**
 * POST /api/courses/:id/completion/manual/:userId
 * 教師手動標記學生完成（或撤銷）
 */
router.post('/:id/completion/manual/:targetUserId', authMiddleware, async (req, res) => {
  try {
    const { id, targetUserId } = req.params;
    const userId = req.user.userId;
    const { complete = true, reason } = req.body;

    // 權限檢查
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限執行此操作'
      });
    }

    // 檢查學生是否已報名
    const progress = await db.getItem(`USER#${targetUserId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '此學生尚未報名此課程'
      });
    }

    const now = new Date().toISOString();

    if (complete) {
      await db.updateItem(`USER#${targetUserId}`, `PROG#COURSE#${id}`, {
        manuallyCompleted: true,
        manuallyCompletedBy: userId,
        manuallyCompletedAt: now,
        manualCompletionReason: reason || '教師手動標記',
        status: 'completed',
        completedAt: now,
        updatedAt: now
      });

      res.json({
        success: true,
        message: '已手動標記學生完成課程',
        data: {
          courseId: id,
          userId: targetUserId,
          completedAt: now
        }
      });
    } else {
      // 撤銷完成狀態
      await db.updateItem(`USER#${targetUserId}`, `PROG#COURSE#${id}`, {
        manuallyCompleted: false,
        manuallyCompletedBy: null,
        manuallyCompletedAt: null,
        manualCompletionReason: null,
        status: 'in_progress',
        completedAt: null,
        updatedAt: now
      });

      res.json({
        success: true,
        message: '已撤銷學生完成狀態',
        data: {
          courseId: id,
          userId: targetUserId
        }
      });
    }

  } catch (error) {
    console.error('Manual mark complete error:', error);
    res.status(500).json({
      success: false,
      error: 'MARK_FAILED',
      message: '標記完成失敗'
    });
  }
});

/**
 * GET /api/courses/:id/completion/report
 * 取得課程完成報告（教師用）
 */
router.get('/:id/completion/report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 權限檢查
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course || (course.instructorId !== userId && !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此報告'
      });
    }

    // 取得所有報名學生
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${id}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    // 取得活動列表
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });

    // 取得每個學生的完成狀態
    const studentReports = await Promise.all(enrollments.map(async (enrollment) => {
      const user = await db.getUser(enrollment.userId);

      // 計算活動完成數
      const completedCount = (enrollment.completedActivities || []).length;
      const totalCount = activities.length;

      return {
        userId: enrollment.userId,
        userName: user?.displayName || '未知用戶',
        userEmail: user?.email,
        enrolledAt: enrollment.enrolledAt,
        lastAccessedAt: enrollment.lastAccessedAt,
        status: enrollment.status,
        progressPercentage: enrollment.progressPercentage || 0,
        completedActivities: completedCount,
        totalActivities: totalCount,
        overallGrade: enrollment.overallGrade,
        totalTimeSpent: enrollment.totalTimeSpent || 0,
        completedAt: enrollment.completedAt,
        manuallyCompleted: enrollment.manuallyCompleted || false,
        selfMarkedComplete: enrollment.selfMarkedComplete || false
      };
    }));

    // 統計
    const totalStudents = studentReports.length;
    const completedStudents = studentReports.filter(s => s.status === 'completed').length;
    const inProgressStudents = studentReports.filter(s => s.status === 'in_progress').length;
    const averageProgress = totalStudents > 0
      ? Math.round(studentReports.reduce((sum, s) => sum + s.progressPercentage, 0) / totalStudents)
      : 0;
    const averageGrade = totalStudents > 0
      ? Math.round(studentReports.filter(s => s.overallGrade != null)
          .reduce((sum, s) => sum + (s.overallGrade || 0), 0) /
        studentReports.filter(s => s.overallGrade != null).length || 0)
      : 0;

    // 活動完成統計
    const activityStats = activities.map(activity => {
      const completedBy = studentReports.filter(s =>
        (s.completedActivities || []).includes(activity.activityId)
      ).length;

      return {
        activityId: activity.activityId,
        title: activity.title,
        type: activity.type,
        completedBy,
        completionRate: totalStudents > 0
          ? Math.round((completedBy / totalStudents) * 100)
          : 0
      };
    });

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        summary: {
          totalStudents,
          completedStudents,
          inProgressStudents,
          completionRate: totalStudents > 0
            ? Math.round((completedStudents / totalStudents) * 100)
            : 0,
          averageProgress,
          averageGrade
        },
        activityStats,
        students: studentReports.sort((a, b) =>
          b.progressPercentage - a.progressPercentage
        )
      }
    });

  } catch (error) {
    console.error('Get completion report error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得完成報告失敗'
    });
  }
});

/**
 * POST /api/courses/:id/check-completion
 * 檢查並更新用戶的課程完成狀態
 */
router.post('/:id/check-completion', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程設定
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    if (!course.settings?.enableCompletion) {
      return res.json({
        success: true,
        data: {
          completionEnabled: false,
          message: '此課程未啟用完成追蹤'
        }
      });
    }

    // 取得進度
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 取得完成設定
    const completionSettings = await db.getItem(`COURSE#${id}`, 'COMPLETION_SETTINGS');
    const criteria = completionSettings?.criteria || [];

    // 取得所有活動
    const activities = await db.query(`COURSE#${id}`, { skPrefix: 'ACTIVITY#' });

    // 檢查所有條件
    let allCriteriaMet = true;
    let anyCriteriaMet = false;

    for (const criterion of criteria) {
      let isMet = false;

      switch (criterion.type) {
        case COMPLETION_CRITERIA_TYPES.ACTIVITY_COMPLETION:
          if (criterion.activityIds && criterion.activityIds.length > 0) {
            isMet = criterion.activityIds.every(actId =>
              (progress.completedActivities || []).includes(actId)
            );
          } else {
            isMet = (progress.completedActivities || []).length >= activities.length;
          }
          break;

        case COMPLETION_CRITERIA_TYPES.GRADE:
          isMet = (progress.overallGrade || 0) >= (criterion.gradeToPass || 60);
          break;

        case COMPLETION_CRITERIA_TYPES.DURATION:
          isMet = (progress.totalTimeSpent || 0) >= (criterion.requiredDuration || 0);
          break;

        case COMPLETION_CRITERIA_TYPES.SELF_COMPLETION:
          isMet = progress.selfMarkedComplete === true;
          break;

        case COMPLETION_CRITERIA_TYPES.MANUAL:
          isMet = progress.manuallyCompleted === true;
          break;
      }

      if (isMet) {
        anyCriteriaMet = true;
      } else {
        allCriteriaMet = false;
      }
    }

    // 決定是否完成
    const aggregationMethod = completionSettings?.aggregationMethod || 'all';
    let isCourseComplete = false;

    if (criteria.length === 0) {
      // 沒有條件時，所有活動完成即可
      isCourseComplete = (progress.completedActivities || []).length >= activities.length;
    } else if (aggregationMethod === 'all') {
      isCourseComplete = allCriteriaMet;
    } else {
      isCourseComplete = anyCriteriaMet;
    }

    // 更新狀態
    const now = new Date().toISOString();
    if (isCourseComplete && progress.status !== 'completed') {
      await db.updateItem(`USER#${userId}`, `PROG#COURSE#${id}`, {
        status: 'completed',
        completedAt: now,
        updatedAt: now
      });

      // TODO: 發放徽章或證書（如果設定）
      if (completionSettings?.awardBadgeId) {
        // 實作徽章發放
      }
      if (completionSettings?.issueCertificate) {
        // 實作證書發放
      }
    }

    res.json({
      success: true,
      data: {
        courseId: id,
        isComplete: isCourseComplete,
        previousStatus: progress.status,
        newStatus: isCourseComplete ? 'completed' : 'in_progress',
        completedAt: isCourseComplete ? (progress.completedAt || now) : null,
        message: isCourseComplete
          ? (completionSettings?.completionMessage || '恭喜您完成此課程！')
          : '課程尚未完成'
      }
    });

  } catch (error) {
    console.error('Check completion error:', error);
    res.status(500).json({
      success: false,
      error: 'CHECK_FAILED',
      message: '檢查完成狀態失敗'
    });
  }
});

// ==================== 課程報告與分析 ====================

/**
 * GET /api/courses/:id/participation-report
 * 課程參與報告
 * 教師功能
 */
router.get('/:id/participation-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { startDate, endDate } = req.query;

    // 取得課程
    const course = await db.get(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 檢查權限
    const isInstructor = course.instructorId === userId ||
                         (course.instructors && course.instructors.includes(userId));
    if (!req.user.isAdmin && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看報告'
      });
    }

    // 取得所有報名學生
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${id}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    // 取得課程活動（作業、測驗、論壇）
    const assignments = await db.query(`COURSE#${id}`, { skPrefix: 'ASSIGNMENT#' });
    const quizzes = await db.query(`COURSE#${id}`, { skPrefix: 'QUIZ#' });
    const forums = await db.query(`COURSE#${id}`, { skPrefix: 'FORUM#' });

    // 收集每個學生的參與資料
    const studentParticipation = [];

    for (const enrollment of enrollments) {
      const student = await db.getUser(enrollment.userId);
      if (!student) continue;

      // 取得學生的課程進度
      const progress = await db.get(`USER#${enrollment.userId}`, `PROG#COURSE#${id}`);

      // 取得作業提交數
      let assignmentSubmissions = 0;
      for (const assignment of assignments) {
        const submission = await db.get(`ASSIGNMENT#${assignment.assignmentId}`, `SUBMISSION#${enrollment.userId}`);
        if (submission && submission.submittedAt) {
          assignmentSubmissions++;
        }
      }

      // 取得測驗完成數
      let quizAttempts = 0;
      for (const quiz of quizzes) {
        const attempts = await db.query(`QUIZ#${quiz.quizId}`, {
          skPrefix: `ATTEMPT#${enrollment.userId}`
        });
        if (attempts && attempts.length > 0) {
          quizAttempts++;
        }
      }

      // 取得論壇參與（發帖 + 回覆數）
      let forumPosts = 0;
      let forumReplies = 0;
      for (const forum of forums) {
        const posts = await db.query(`FORUM#${forum.forumId}`, {
          skPrefix: 'DISCUSSION#'
        });
        for (const post of posts) {
          if (post.authorId === enrollment.userId) {
            forumPosts++;
          }
          const replies = await db.query(`FORUM#${forum.forumId}`, {
            skPrefix: `REPLY#${post.discussionId}`
          });
          for (const reply of replies) {
            if (reply.authorId === enrollment.userId) {
              forumReplies++;
            }
          }
        }
      }

      studentParticipation.push({
        studentId: enrollment.userId,
        studentName: student.displayName || student.email,
        studentEmail: student.email,
        enrolledAt: enrollment.enrolledAt,
        lastAccessed: progress?.lastAccessedAt || null,
        progressPercentage: progress?.progressPercentage || 0,
        status: progress?.status || 'not_started',
        activities: {
          assignmentSubmissions: assignmentSubmissions,
          totalAssignments: assignments.length,
          quizAttempts: quizAttempts,
          totalQuizzes: quizzes.length,
          forumPosts: forumPosts,
          forumReplies: forumReplies
        }
      });
    }

    // 計算整體統計
    const totalStudents = studentParticipation.length;
    const activeStudents = studentParticipation.filter(s => s.lastAccessed).length;
    const completedStudents = studentParticipation.filter(s => s.status === 'completed').length;
    const avgProgress = totalStudents > 0
      ? Math.round(studentParticipation.reduce((sum, s) => sum + s.progressPercentage, 0) / totalStudents)
      : 0;

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),

        summary: {
          totalStudents,
          activeStudents,
          completedStudents,
          completionRate: totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0,
          averageProgress: avgProgress,
          totalAssignments: assignments.length,
          totalQuizzes: quizzes.length,
          totalForums: forums.length
        },

        students: studentParticipation.sort((a, b) => b.progressPercentage - a.progressPercentage)
      }
    });

  } catch (error) {
    console.error('Get participation report error:', error);
    res.status(500).json({
      success: false,
      error: 'REPORT_FAILED',
      message: '生成報告失敗'
    });
  }
});

/**
 * GET /api/courses/:id/activity-report
 * 活動完成報告
 * 教師功能
 */
router.get('/:id/activity-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程
    const course = await db.get(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 檢查權限
    const isInstructor = course.instructorId === userId ||
                         (course.instructors && course.instructors.includes(userId));
    if (!req.user.isAdmin && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看報告'
      });
    }

    // 取得報名學生數
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${id}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );
    const totalStudents = enrollments.length;

    // 取得所有活動及其完成狀況
    const activityReport = [];

    // 作業
    const assignments = await db.query(`COURSE#${id}`, { skPrefix: 'ASSIGNMENT#' });
    for (const assignment of assignments) {
      const submissions = await db.query(`ASSIGNMENT#${assignment.assignmentId}`, {
        skPrefix: 'SUBMISSION#'
      });
      const submitted = submissions.filter(s => s.submittedAt).length;
      const graded = submissions.filter(s => s.status === 'graded').length;
      const grades = submissions.filter(s => s.grade !== null && s.grade !== undefined).map(s => s.grade);
      const avgGrade = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null;

      activityReport.push({
        type: 'assignment',
        id: assignment.assignmentId,
        title: assignment.title,
        dueDate: assignment.dueDate,
        maxGrade: assignment.maxGrade || 100,
        stats: {
          totalStudents,
          submitted,
          notSubmitted: totalStudents - submitted,
          graded,
          avgGrade,
          submissionRate: totalStudents > 0 ? Math.round((submitted / totalStudents) * 100) : 0
        }
      });
    }

    // 測驗
    const quizzes = await db.query(`COURSE#${id}`, { skPrefix: 'QUIZ#' });
    for (const quiz of quizzes) {
      let attempted = 0;
      let passed = 0;
      const scores = [];

      for (const enrollment of enrollments) {
        const attempts = await db.query(`QUIZ#${quiz.quizId}`, {
          skPrefix: `ATTEMPT#${enrollment.userId}`
        });
        if (attempts && attempts.length > 0) {
          attempted++;
          const bestAttempt = attempts.reduce((best, curr) =>
            (!best || (curr.percentage > best.percentage)) ? curr : best, null);
          if (bestAttempt) {
            scores.push(bestAttempt.percentage);
            if (bestAttempt.percentage >= (quiz.passingGrade || 60)) {
              passed++;
            }
          }
        }
      }

      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      activityReport.push({
        type: 'quiz',
        id: quiz.quizId,
        title: quiz.title,
        openDate: quiz.openDate,
        closeDate: quiz.closeDate,
        timeLimit: quiz.timeLimit,
        maxAttempts: quiz.maxAttempts,
        passingGrade: quiz.passingGrade || 60,
        stats: {
          totalStudents,
          attempted,
          notAttempted: totalStudents - attempted,
          passed,
          avgScore,
          attemptRate: totalStudents > 0 ? Math.round((attempted / totalStudents) * 100) : 0,
          passRate: attempted > 0 ? Math.round((passed / attempted) * 100) : 0
        }
      });
    }

    // 論壇
    const forums = await db.query(`COURSE#${id}`, { skPrefix: 'FORUM#' });
    for (const forum of forums) {
      const discussions = await db.query(`FORUM#${forum.forumId}`, {
        skPrefix: 'DISCUSSION#'
      });

      let totalReplies = 0;
      const participatingStudents = new Set();

      for (const discussion of discussions) {
        if (discussion.authorId) {
          participatingStudents.add(discussion.authorId);
        }
        const replies = await db.query(`FORUM#${forum.forumId}`, {
          skPrefix: `REPLY#${discussion.discussionId}`
        });
        totalReplies += replies.length;
        for (const reply of replies) {
          if (reply.authorId) {
            participatingStudents.add(reply.authorId);
          }
        }
      }

      activityReport.push({
        type: 'forum',
        id: forum.forumId,
        title: forum.title,
        stats: {
          totalStudents,
          participatingStudents: participatingStudents.size,
          totalDiscussions: discussions.length,
          totalReplies,
          participationRate: totalStudents > 0 ? Math.round((participatingStudents.size / totalStudents) * 100) : 0
        }
      });
    }

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),
        totalStudents,
        activities: activityReport
      }
    });

  } catch (error) {
    console.error('Get activity report error:', error);
    res.status(500).json({
      success: false,
      error: 'REPORT_FAILED',
      message: '生成報告失敗'
    });
  }
});

/**
 * GET /api/courses/:id/grade-analysis
 * 成績分析
 * 教師功能
 */
router.get('/:id/grade-analysis', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程
    const course = await db.get(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 檢查權限
    const isInstructor = course.instructorId === userId ||
                         (course.instructors && course.instructors.includes(userId));
    if (!req.user.isAdmin && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看分析'
      });
    }

    // 取得報名學生
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${id}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    // 收集所有成績數據
    const studentGrades = {};
    const gradeItems = [];

    // 初始化學生成績記錄
    for (const enrollment of enrollments) {
      const student = await db.getUser(enrollment.userId);
      studentGrades[enrollment.userId] = {
        studentId: enrollment.userId,
        studentName: student?.displayName || student?.email || 'Unknown',
        studentEmail: student?.email || '',
        items: {},
        totalPoints: 0,
        maxPoints: 0,
        percentage: 0
      };
    }

    // 收集作業成績
    const assignments = await db.query(`COURSE#${id}`, { skPrefix: 'ASSIGNMENT#' });
    for (const assignment of assignments) {
      gradeItems.push({
        type: 'assignment',
        id: assignment.assignmentId,
        title: assignment.title,
        maxGrade: assignment.maxGrade || 100,
        weight: assignment.weight || 1
      });

      for (const enrollment of enrollments) {
        const submission = await db.get(`ASSIGNMENT#${assignment.assignmentId}`, `SUBMISSION#${enrollment.userId}`);
        if (submission && submission.grade !== null && submission.grade !== undefined) {
          studentGrades[enrollment.userId].items[assignment.assignmentId] = {
            grade: submission.grade,
            maxGrade: assignment.maxGrade || 100,
            percentage: Math.round((submission.grade / (assignment.maxGrade || 100)) * 100)
          };
          studentGrades[enrollment.userId].totalPoints += submission.grade;
          studentGrades[enrollment.userId].maxPoints += (assignment.maxGrade || 100);
        }
      }
    }

    // 收集測驗成績
    const quizzes = await db.query(`COURSE#${id}`, { skPrefix: 'QUIZ#' });
    for (const quiz of quizzes) {
      gradeItems.push({
        type: 'quiz',
        id: quiz.quizId,
        title: quiz.title,
        maxGrade: 100, // 測驗以百分比計算
        weight: quiz.weight || 1
      });

      for (const enrollment of enrollments) {
        const attempts = await db.query(`QUIZ#${quiz.quizId}`, {
          skPrefix: `ATTEMPT#${enrollment.userId}`
        });
        if (attempts && attempts.length > 0) {
          // 取最高分
          const bestAttempt = attempts.reduce((best, curr) =>
            (!best || (curr.percentage > best.percentage)) ? curr : best, null);
          if (bestAttempt) {
            studentGrades[enrollment.userId].items[quiz.quizId] = {
              grade: bestAttempt.percentage,
              maxGrade: 100,
              percentage: Math.round(bestAttempt.percentage)
            };
            studentGrades[enrollment.userId].totalPoints += bestAttempt.percentage;
            studentGrades[enrollment.userId].maxPoints += 100;
          }
        }
      }
    }

    // 計算每個學生的總百分比
    for (const userId in studentGrades) {
      const student = studentGrades[userId];
      student.percentage = student.maxPoints > 0
        ? Math.round((student.totalPoints / student.maxPoints) * 100)
        : 0;
    }

    // 計算成績分佈
    const percentages = Object.values(studentGrades).map(s => s.percentage);
    const distribution = {
      'A (90-100)': percentages.filter(p => p >= 90).length,
      'B (80-89)': percentages.filter(p => p >= 80 && p < 90).length,
      'C (70-79)': percentages.filter(p => p >= 70 && p < 80).length,
      'D (60-69)': percentages.filter(p => p >= 60 && p < 70).length,
      'F (<60)': percentages.filter(p => p < 60).length
    };

    // 統計數據
    const avgPercentage = percentages.length > 0
      ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
      : 0;
    const highestPercentage = percentages.length > 0 ? Math.max(...percentages) : 0;
    const lowestPercentage = percentages.length > 0 ? Math.min(...percentages) : 0;
    const passRate = percentages.length > 0
      ? Math.round((percentages.filter(p => p >= 60).length / percentages.length) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),

        summary: {
          totalStudents: enrollments.length,
          averagePercentage: avgPercentage,
          highestPercentage,
          lowestPercentage,
          passRate,
          totalGradeItems: gradeItems.length
        },

        distribution,
        gradeItems,
        students: Object.values(studentGrades).sort((a, b) => b.percentage - a.percentage)
      }
    });

  } catch (error) {
    console.error('Get grade analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'ANALYSIS_FAILED',
      message: '生成分析失敗'
    });
  }
});

/**
 * GET /api/courses/:id/export-report
 * 匯出課程報告 (CSV)
 * 教師功能
 */
router.get('/:id/export-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { type = 'grades' } = req.query; // grades, participation

    // 取得課程
    const course = await db.get(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 檢查權限
    const isInstructor = course.instructorId === userId ||
                         (course.instructors && course.instructors.includes(userId));
    if (!req.user.isAdmin && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限匯出報告'
      });
    }

    // 取得報名學生
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${id}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    let csvContent = '';
    let filename = '';

    if (type === 'participation') {
      // 參與報告 CSV
      const headers = ['學生姓名', '學生 Email', '報名日期', '最後存取', '進度 %', '狀態'];
      const rows = [];

      for (const enrollment of enrollments) {
        const student = await db.getUser(enrollment.userId);
        const progress = await db.get(`USER#${enrollment.userId}`, `PROG#COURSE#${id}`);

        rows.push([
          student?.displayName || 'Unknown',
          student?.email || 'N/A',
          enrollment.enrolledAt ? new Date(enrollment.enrolledAt).toLocaleDateString('zh-TW') : 'N/A',
          progress?.lastAccessedAt ? new Date(progress.lastAccessedAt).toLocaleDateString('zh-TW') : '從未存取',
          progress?.progressPercentage || 0,
          progress?.status === 'completed' ? '已完成' : (progress?.status === 'in_progress' ? '進行中' : '未開始')
        ]);
      }

      csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
      filename = `${course.title}_參與報告_${new Date().toISOString().split('T')[0]}.csv`;

    } else {
      // 成績報告 CSV
      const assignments = await db.query(`COURSE#${id}`, { skPrefix: 'ASSIGNMENT#' });
      const quizzes = await db.query(`COURSE#${id}`, { skPrefix: 'QUIZ#' });

      const headers = ['學生姓名', '學生 Email'];
      assignments.forEach(a => headers.push(`作業: ${a.title}`));
      quizzes.forEach(q => headers.push(`測驗: ${q.title}`));
      headers.push('總分', '百分比', '等級');

      const rows = [];

      for (const enrollment of enrollments) {
        const student = await db.getUser(enrollment.userId);
        const row = [student?.displayName || 'Unknown', student?.email || 'N/A'];

        let totalPoints = 0;
        let maxPoints = 0;

        // 作業成績
        for (const assignment of assignments) {
          const submission = await db.get(`ASSIGNMENT#${assignment.assignmentId}`, `SUBMISSION#${enrollment.userId}`);
          if (submission?.grade !== null && submission?.grade !== undefined) {
            row.push(submission.grade);
            totalPoints += submission.grade;
            maxPoints += (assignment.maxGrade || 100);
          } else {
            row.push('-');
          }
        }

        // 測驗成績
        for (const quiz of quizzes) {
          const attempts = await db.query(`QUIZ#${quiz.quizId}`, {
            skPrefix: `ATTEMPT#${enrollment.userId}`
          });
          if (attempts && attempts.length > 0) {
            const best = attempts.reduce((b, c) => (!b || c.percentage > b.percentage) ? c : b, null);
            row.push(Math.round(best.percentage));
            totalPoints += best.percentage;
            maxPoints += 100;
          } else {
            row.push('-');
          }
        }

        const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
        let grade = 'F';
        if (percentage >= 90) grade = 'A';
        else if (percentage >= 80) grade = 'B';
        else if (percentage >= 70) grade = 'C';
        else if (percentage >= 60) grade = 'D';

        row.push(totalPoints, percentage + '%', grade);
        rows.push(row);
      }

      csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
      filename = `${course.title}_成績報告_${new Date().toISOString().split('T')[0]}.csv`;
    }

    // 添加 BOM
    const bom = '\uFEFF';
    const csvWithBom = bom + csvContent;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csvWithBom);

  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出報告失敗'
    });
  }
});

// ==================== 群組管理系統 (Moodle Group Mode) ====================

/**
 * 群組模式常量
 * 0: NOGROUPS - 無群組模式
 * 1: SEPARATEGROUPS - 分開群組（學生只能看到自己群組的成員和活動）
 * 2: VISIBLEGROUPS - 可見群組（學生可以看到其他群組但只能在自己群組中互動）
 */
const GROUP_MODES = {
  NOGROUPS: 0,
  SEPARATEGROUPS: 1,
  VISIBLEGROUPS: 2
};

/**
 * GET /api/courses/:id/groups
 * 取得課程的所有群組
 */
router.get('/:id/groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程資料
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 取得所有群組
    let groups = await db.query(`COURSE#${id}`, { skPrefix: 'GROUP#' });

    // 如果是分開群組模式，且用戶不是講師/管理員，只顯示自己的群組
    if (course.groupMode === GROUP_MODES.SEPARATEGROUPS &&
        course.instructorId !== userId && !req.user.isAdmin) {
      // 取得用戶所屬的群組
      const userGroups = await db.query(`USER#${userId}`, { skPrefix: `COURSEGROUP#${id}#` });
      const userGroupIds = userGroups.map(g => g.groupId);
      groups = groups.filter(g => userGroupIds.includes(g.groupId));
    }

    // 為每個群組取得成員數量
    for (let group of groups) {
      const members = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${group.groupId}#` });
      group.memberCount = members.length;
    }

    res.json({
      success: true,
      data: groups,
      groupMode: course.groupMode || GROUP_MODES.NOGROUPS,
      groupModeForced: course.groupModeForced || false
    });

  } catch (error) {
    console.error('Get course groups error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得群組失敗'
    });
  }
});

/**
 * POST /api/courses/:id/groups
 * 建立新群組
 */
router.post('/:id/groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, idNumber } = req.body;
    const userId = req.user.userId;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_NAME',
        message: '請提供群組名稱'
      });
    }

    // 驗證課程存在且用戶有權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限建立群組'
      });
    }

    const groupId = db.generateId('grp');
    const now = new Date().toISOString();

    const group = {
      PK: `COURSE#${id}`,
      SK: `GROUP#${groupId}`,
      GSI1PK: `GROUPS#${id}`,
      GSI1SK: `GROUP#${groupId}`,
      entityType: 'COURSE_GROUP',
      createdAt: now,

      groupId,
      courseId: id,
      name,
      description: description || '',
      idNumber: idNumber || '', // 外部識別碼（如學校班級代碼）

      memberCount: 0,
      createdBy: userId,
      updatedAt: now
    };

    await db.putItem(group);

    res.status(201).json({
      success: true,
      message: '群組已建立',
      data: group
    });

  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立群組失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/groups/:groupId
 * 更新群組資訊
 */
router.put('/:id/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const { name, description, idNumber } = req.body;
    const userId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限修改群組'
      });
    }

    // 驗證群組存在
    const group = await db.getItem(`COURSE#${id}`, `GROUP#${groupId}`);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'GROUP_NOT_FOUND',
        message: '找不到群組'
      });
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (idNumber !== undefined) updates.idNumber = idNumber;

    const updatedGroup = await db.updateItem(`COURSE#${id}`, `GROUP#${groupId}`, updates);

    res.json({
      success: true,
      message: '群組已更新',
      data: updatedGroup
    });

  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新群組失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/groups/:groupId
 * 刪除群組
 */
router.delete('/:id/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const userId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限刪除群組'
      });
    }

    // 刪除群組成員關係
    const members = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${groupId}#` });
    for (const member of members) {
      await db.deleteItem(`COURSE#${id}`, member.SK);
      // 刪除用戶端的反向關係
      await db.deleteItem(`USER#${member.userId}`, `COURSEGROUP#${id}#${groupId}`);
    }

    // 刪除群組
    await db.deleteItem(`COURSE#${id}`, `GROUP#${groupId}`);

    res.json({
      success: true,
      message: '群組已刪除'
    });

  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除群組失敗'
    });
  }
});

/**
 * GET /api/courses/:id/groups/:groupId/members
 * 取得群組成員
 */
router.get('/:id/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const userId = req.user.userId;

    // 取得課程資料
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 如果是分開群組模式，檢查用戶是否在該群組內
    if (course.groupMode === GROUP_MODES.SEPARATEGROUPS &&
        course.instructorId !== userId && !req.user.isAdmin) {
      const userMembership = await db.getItem(`USER#${userId}`, `COURSEGROUP#${id}#${groupId}`);
      if (!userMembership) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: '無權限查看此群組成員'
        });
      }
    }

    // 取得群組成員
    const memberRecords = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${groupId}#` });

    // 取得用戶詳細資訊
    const members = await Promise.all(
      memberRecords.map(async (m) => {
        const user = await db.getUser(m.userId);
        return {
          userId: m.userId,
          displayName: user?.displayName || 'Unknown',
          email: user?.email || '',
          avatar: user?.avatar || '',
          role: m.role || 'student',
          joinedAt: m.joinedAt
        };
      })
    );

    res.json({
      success: true,
      data: members
    });

  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得群組成員失敗'
    });
  }
});

/**
 * POST /api/courses/:id/groups/:groupId/members
 * 添加成員到群組
 */
router.post('/:id/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const { userIds } = req.body; // 支援批量添加
    const adminUserId = req.user.userId;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USERS',
        message: '請提供要添加的用戶'
      });
    }

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (course.instructorId !== adminUserId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限管理群組成員'
      });
    }

    // 驗證群組存在
    const group = await db.getItem(`COURSE#${id}`, `GROUP#${groupId}`);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'GROUP_NOT_FOUND',
        message: '找不到群組'
      });
    }

    const now = new Date().toISOString();
    const added = [];
    const skipped = [];

    for (const userId of userIds) {
      // 檢查用戶是否已在群組中
      const existing = await db.getItem(`COURSE#${id}`, `GROUPMEMBER#${groupId}#${userId}`);
      if (existing) {
        skipped.push(userId);
        continue;
      }

      // 檢查用戶是否報名課程
      const enrollment = await db.getItem(`COURSE#${id}`, `ENROLLMENT#${userId}`);
      if (!enrollment) {
        skipped.push(userId);
        continue;
      }

      // 建立群組成員關係
      const memberItem = {
        PK: `COURSE#${id}`,
        SK: `GROUPMEMBER#${groupId}#${userId}`,
        entityType: 'GROUP_MEMBER',
        createdAt: now,

        courseId: id,
        groupId,
        userId,
        role: 'student',
        joinedAt: now
      };

      await db.putItem(memberItem);

      // 在用戶端建立反向關係
      const userGroupItem = {
        PK: `USER#${userId}`,
        SK: `COURSEGROUP#${id}#${groupId}`,
        entityType: 'USER_GROUP',
        createdAt: now,

        userId,
        courseId: id,
        groupId,
        groupName: group.name,
        joinedAt: now
      };

      await db.putItem(userGroupItem);
      added.push(userId);
    }

    // 更新群組成員數
    const currentMembers = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${groupId}#` });
    await db.updateItem(`COURSE#${id}`, `GROUP#${groupId}`, {
      memberCount: currentMembers.length,
      updatedAt: now
    });

    res.json({
      success: true,
      message: `已添加 ${added.length} 位成員`,
      data: { added, skipped }
    });

  } catch (error) {
    console.error('Add group members error:', error);
    res.status(500).json({
      success: false,
      error: 'ADD_FAILED',
      message: '添加成員失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/groups/:groupId/members/:userId
 * 從群組移除成員
 */
router.delete('/:id/groups/:groupId/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { id, groupId, userId } = req.params;
    const adminUserId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (course.instructorId !== adminUserId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限管理群組成員'
      });
    }

    // 刪除成員關係
    await db.deleteItem(`COURSE#${id}`, `GROUPMEMBER#${groupId}#${userId}`);
    await db.deleteItem(`USER#${userId}`, `COURSEGROUP#${id}#${groupId}`);

    // 更新群組成員數
    const currentMembers = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${groupId}#` });
    await db.updateItem(`COURSE#${id}`, `GROUP#${groupId}`, {
      memberCount: currentMembers.length,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '成員已移除'
    });

  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({
      success: false,
      error: 'REMOVE_FAILED',
      message: '移除成員失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/group-settings
 * 更新課程的群組模式設定
 */
router.put('/:id/group-settings', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupMode, groupModeForced, defaultGroupingId } = req.body;
    const userId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限修改群組設定'
      });
    }

    const updates = { updatedAt: new Date().toISOString() };

    if (groupMode !== undefined) {
      // 驗證群組模式值
      if (![0, 1, 2].includes(groupMode)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_GROUP_MODE',
          message: '無效的群組模式值'
        });
      }
      updates.groupMode = groupMode;
    }

    if (groupModeForced !== undefined) {
      updates.groupModeForced = !!groupModeForced;
    }

    if (defaultGroupingId !== undefined) {
      updates.defaultGroupingId = defaultGroupingId;
    }

    const updatedCourse = await db.updateItem(`COURSE#${id}`, 'META', updates);

    res.json({
      success: true,
      message: '群組設定已更新',
      data: {
        groupMode: updatedCourse.groupMode,
        groupModeForced: updatedCourse.groupModeForced,
        defaultGroupingId: updatedCourse.defaultGroupingId
      }
    });

  } catch (error) {
    console.error('Update group settings error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新群組設定失敗'
    });
  }
});

/**
 * GET /api/courses/:id/my-groups
 * 取得當前用戶在課程中所屬的群組
 */
router.get('/:id/my-groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得用戶所屬的群組
    const userGroups = await db.query(`USER#${userId}`, { skPrefix: `COURSEGROUP#${id}#` });

    // 取得群組詳細資訊
    const groups = await Promise.all(
      userGroups.map(async (ug) => {
        const group = await db.getItem(`COURSE#${id}`, `GROUP#${ug.groupId}`);
        return group ? {
          groupId: group.groupId,
          name: group.name,
          description: group.description,
          memberCount: group.memberCount,
          joinedAt: ug.joinedAt
        } : null;
      })
    );

    res.json({
      success: true,
      data: groups.filter(Boolean)
    });

  } catch (error) {
    console.error('Get my groups error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得群組失敗'
    });
  }
});

/**
 * POST /api/courses/:id/auto-create-groups
 * 自動建立群組（根據報名學生數量均分）
 */
router.post('/:id/auto-create-groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupCount, groupNamePrefix = '群組' } = req.body;
    const userId = req.user.userId;

    if (!groupCount || groupCount < 2) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_COUNT',
        message: '群組數量必須至少為 2'
      });
    }

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限建立群組'
      });
    }

    // 取得所有報名學生
    const enrollments = await db.query(`COURSE#${id}`, { skPrefix: 'ENROLLMENT#' });
    const students = enrollments.filter(e => e.role === 'student' || !e.role);

    if (students.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_STUDENTS',
        message: '課程沒有報名學生'
      });
    }

    const now = new Date().toISOString();
    const createdGroups = [];

    // 隨機打亂學生順序
    const shuffledStudents = [...students].sort(() => Math.random() - 0.5);

    // 建立群組並分配學生
    for (let i = 0; i < groupCount; i++) {
      const groupId = db.generateId('grp');
      const groupName = `${groupNamePrefix} ${i + 1}`;

      const group = {
        PK: `COURSE#${id}`,
        SK: `GROUP#${groupId}`,
        GSI1PK: `GROUPS#${id}`,
        GSI1SK: `GROUP#${groupId}`,
        entityType: 'COURSE_GROUP',
        createdAt: now,

        groupId,
        courseId: id,
        name: groupName,
        description: '',
        idNumber: '',

        memberCount: 0,
        createdBy: userId,
        updatedAt: now
      };

      await db.putItem(group);
      createdGroups.push({ groupId, name: groupName, members: [] });
    }

    // 分配學生到群組
    for (let i = 0; i < shuffledStudents.length; i++) {
      const groupIndex = i % groupCount;
      const group = createdGroups[groupIndex];
      const student = shuffledStudents[i];

      // 建立群組成員關係
      const memberItem = {
        PK: `COURSE#${id}`,
        SK: `GROUPMEMBER#${group.groupId}#${student.userId}`,
        entityType: 'GROUP_MEMBER',
        createdAt: now,

        courseId: id,
        groupId: group.groupId,
        userId: student.userId,
        role: 'student',
        joinedAt: now
      };

      await db.putItem(memberItem);

      // 在用戶端建立反向關係
      const userGroupItem = {
        PK: `USER#${student.userId}`,
        SK: `COURSEGROUP#${id}#${group.groupId}`,
        entityType: 'USER_GROUP',
        createdAt: now,

        userId: student.userId,
        courseId: id,
        groupId: group.groupId,
        groupName: group.name,
        joinedAt: now
      };

      await db.putItem(userGroupItem);
      group.members.push(student.userId);
    }

    // 更新各群組成員數
    for (const group of createdGroups) {
      await db.updateItem(`COURSE#${id}`, `GROUP#${group.groupId}`, {
        memberCount: group.members.length,
        updatedAt: now
      });
    }

    res.status(201).json({
      success: true,
      message: `已建立 ${groupCount} 個群組並分配 ${students.length} 位學生`,
      data: createdGroups.map(g => ({
        groupId: g.groupId,
        name: g.name,
        memberCount: g.members.length
      }))
    });

  } catch (error) {
    console.error('Auto create groups error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '自動建立群組失敗'
    });
  }
});

/**
 * GET /api/courses/:id/group-overview
 * 取得課程群組總覽（供教師使用）
 */
router.get('/:id/group-overview', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看群組總覽'
      });
    }

    // 取得所有群組
    const groups = await db.query(`COURSE#${id}`, { skPrefix: 'GROUP#' });

    // 取得所有報名學生
    const enrollments = await db.query(`COURSE#${id}`, { skPrefix: 'ENROLLMENT#' });
    const totalStudents = enrollments.filter(e => e.role === 'student' || !e.role).length;

    // 統計未分組學生
    const groupedStudentIds = new Set();
    for (const group of groups) {
      const members = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${group.groupId}#` });
      members.forEach(m => groupedStudentIds.add(m.userId));
    }

    const ungroupedStudents = enrollments.filter(
      e => (e.role === 'student' || !e.role) && !groupedStudentIds.has(e.userId)
    );

    // 取得每個群組的詳細成員
    const groupsWithMembers = await Promise.all(
      groups.map(async (group) => {
        const members = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${group.groupId}#` });
        const memberDetails = await Promise.all(
          members.map(async (m) => {
            const user = await db.getUser(m.userId);
            return {
              userId: m.userId,
              displayName: user?.displayName || 'Unknown',
              email: user?.email || '',
              joinedAt: m.joinedAt
            };
          })
        );

        return {
          ...group,
          members: memberDetails
        };
      })
    );

    res.json({
      success: true,
      data: {
        courseId: id,
        groupMode: course.groupMode || GROUP_MODES.NOGROUPS,
        groupModeForced: course.groupModeForced || false,
        totalStudents,
        totalGroups: groups.length,
        groupedStudents: groupedStudentIds.size,
        ungroupedStudents: ungroupedStudents.length,
        groups: groupsWithMembers,
        ungrouped: await Promise.all(
          ungroupedStudents.map(async (e) => {
            const user = await db.getUser(e.userId);
            return {
              userId: e.userId,
              displayName: user?.displayName || 'Unknown',
              email: user?.email || ''
            };
          })
        )
      }
    });

  } catch (error) {
    console.error('Get group overview error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得群組總覽失敗'
    });
  }
});

module.exports = router;
