/**
 * 教材資源 API 處理器
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, optionalAuthMiddleware } = require('../utils/auth');

/**
 * GET /api/resources
 * 取得資源列表（支援篩選）
 */
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const { category, gradeLevel, type, status = 'published', limit = 50 } = req.query;

    let resources;

    if (category) {
      resources = await db.getResourcesByCategory(category);
    } else if (status) {
      resources = await db.getResourcesByStatus(status);
    } else {
      resources = await db.getAllResources({ limit: parseInt(limit) });
    }

    // 套用額外篩選
    if (gradeLevel) {
      resources = resources.filter(r => r.gradeLevel === gradeLevel);
    }
    if (type) {
      resources = resources.filter(r => r.type === type);
    }

    // 移除不需要的欄位
    resources = resources.map(r => {
      delete r.PK;
      delete r.SK;
      delete r.s3Location;
      return r;
    });

    res.json({
      success: true,
      data: resources,
      count: resources.length
    });

  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得資源列表失敗'
    });
  }
});

/**
 * GET /api/resources/search
 * 搜尋資源
 */
router.get('/search', optionalAuthMiddleware, async (req, res) => {
  try {
    const { q, category, gradeLevel, type, limit = 50 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_QUERY',
        message: '請提供搜尋關鍵字'
      });
    }

    const searchTerm = q.toLowerCase();
    let resources = await db.getAllResources({ limit: 200 });

    // 搜尋標題、描述、標籤
    resources = resources.filter(r => {
      const titleMatch = r.title?.toLowerCase().includes(searchTerm);
      const descMatch = r.description?.toLowerCase().includes(searchTerm);
      const tagMatch = r.tags?.some(t => t.toLowerCase().includes(searchTerm));
      return titleMatch || descMatch || tagMatch;
    });

    // 套用額外篩選
    if (category) {
      resources = resources.filter(r => r.category === category);
    }
    if (gradeLevel) {
      resources = resources.filter(r => r.gradeLevel === gradeLevel);
    }
    if (type) {
      resources = resources.filter(r => r.type === type);
    }

    // 只顯示已發布的
    resources = resources.filter(r => r.status === 'published');

    // 限制數量
    resources = resources.slice(0, parseInt(limit));

    // 清理資料
    resources = resources.map(r => {
      delete r.PK;
      delete r.SK;
      delete r.s3Location;
      return r;
    });

    res.json({
      success: true,
      data: resources,
      count: resources.length,
      query: q
    });

  } catch (error) {
    console.error('Search resources error:', error);
    res.status(500).json({
      success: false,
      error: 'SEARCH_FAILED',
      message: '搜尋失敗'
    });
  }
});

/**
 * GET /api/resources/:id
 * 取得單一資源詳情
 */
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const resource = await db.getItem(`RES#${id}`, 'META');

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'RESOURCE_NOT_FOUND',
        message: '找不到此資源'
      });
    }

    // 增加瀏覽次數
    await db.updateItem(`RES#${id}`, 'META', {
      viewCount: (resource.viewCount || 0) + 1
    });

    // 清理資料
    delete resource.PK;
    delete resource.SK;

    res.json({
      success: true,
      data: resource
    });

  } catch (error) {
    console.error('Get resource error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得資源失敗'
    });
  }
});

/**
 * POST /api/resources/:id/rate
 * 評分資源
 */
router.post('/:id/rate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RATING',
        message: '評分須介於 1-5 之間'
      });
    }

    const resource = await db.getItem(`RES#${id}`, 'META');
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'RESOURCE_NOT_FOUND',
        message: '找不到此資源'
      });
    }

    // 更新平均評分（簡化計算）
    const currentRating = resource.averageRating || 0;
    const ratingCount = resource.ratingCount || 0;
    const newRatingCount = ratingCount + 1;
    const newAverageRating = ((currentRating * ratingCount) + rating) / newRatingCount;

    await db.updateItem(`RES#${id}`, 'META', {
      averageRating: Math.round(newAverageRating * 10) / 10,
      ratingCount: newRatingCount
    });

    res.json({
      success: true,
      message: '評分成功',
      data: {
        averageRating: Math.round(newAverageRating * 10) / 10,
        ratingCount: newRatingCount
      }
    });

  } catch (error) {
    console.error('Rate resource error:', error);
    res.status(500).json({
      success: false,
      error: 'RATING_FAILED',
      message: '評分失敗'
    });
  }
});

/**
 * GET /api/resources/categories
 * 取得資源分類列表
 */
router.get('/meta/categories', async (req, res) => {
  res.json({
    success: true,
    data: {
      categories: [
        { id: 'math', name: '數學', nameEn: 'Mathematics' },
        { id: 'chinese', name: '國文', nameEn: 'Chinese' },
        { id: 'english', name: '英文', nameEn: 'English' },
        { id: 'science', name: '自然科學', nameEn: 'Science' },
        { id: 'social', name: '社會科學', nameEn: 'Social Studies' },
        { id: 'business', name: '商業管理', nameEn: 'Business' },
        { id: 'technology', name: '資訊科技', nameEn: 'Technology' },
        { id: 'arts', name: '藝術人文', nameEn: 'Arts & Humanities' }
      ],
      gradeLevels: [
        { id: 'elementary', name: '國小', nameEn: 'Elementary' },
        { id: 'junior', name: '國中', nameEn: 'Junior High' },
        { id: 'senior', name: '高中', nameEn: 'Senior High' },
        { id: 'university', name: '大學', nameEn: 'University' },
        { id: 'corporate', name: '企業培訓', nameEn: 'Corporate' }
      ],
      types: [
        { id: 'video', name: '影音教材', nameEn: 'Video' },
        { id: 'interactive', name: '互動教材', nameEn: 'Interactive' },
        { id: 'document', name: '文件講義', nameEn: 'Document' },
        { id: 'quiz', name: '測驗題庫', nameEn: 'Quiz' }
      ]
    }
  });
});

module.exports = router;
