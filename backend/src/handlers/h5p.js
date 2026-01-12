/**
 * H5P 互動內容整合
 * Moodle-style H5P Support
 *
 * 支援 H5P 互動內容的創建、管理和嵌入
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLE_NAME, putItem, getItem, queryItems, updateItem } = require('../utils/db');
const { authMiddleware, adminMiddleware } = require('../utils/auth');
const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

// H5P 內容類型
const H5P_CONTENT_TYPES = {
  INTERACTIVE_VIDEO: 'H5P.InteractiveVideo',
  COURSE_PRESENTATION: 'H5P.CoursePresentation',
  QUIZ_QUESTION_SET: 'H5P.QuestionSet',
  DRAG_AND_DROP: 'H5P.DragQuestion',
  FILL_IN_BLANKS: 'H5P.Blanks',
  MARK_THE_WORDS: 'H5P.MarkTheWords',
  MULTIPLE_CHOICE: 'H5P.MultiChoice',
  TRUE_FALSE: 'H5P.TrueFalse',
  DRAG_TEXT: 'H5P.DragText',
  SUMMARY: 'H5P.Summary',
  TIMELINE: 'H5P.Timeline',
  HOTSPOTS: 'H5P.ImageHotspots',
  ACCORDION: 'H5P.Accordion',
  DIALOG_CARDS: 'H5P.Dialogcards',
  FLASHCARDS: 'H5P.Flashcards',
  MEMORY_GAME: 'H5P.MemoryGame',
  BRANCHING_SCENARIO: 'H5P.BranchingScenario',
  VIRTUAL_TOUR: 'H5P.ThreeImage',
  COLUMN: 'H5P.Column'
};

// H5P 狀態
const H5P_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived'
};

/**
 * GET /api/h5p
 * 獲取所有 H5P 內容列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { courseId, contentType, status, limit = 50 } = req.query;

    let params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': 'H5P_CONTENT'
      },
      ScanIndexForward: false,
      Limit: parseInt(limit)
    };

    const filterExpressions = [];
    const expressionAttributeNames = {};

    if (courseId) {
      filterExpressions.push('courseId = :courseId');
      params.ExpressionAttributeValues[':courseId'] = courseId;
    }

    if (contentType) {
      filterExpressions.push('contentType = :contentType');
      params.ExpressionAttributeValues[':contentType'] = contentType;
    }

    if (status) {
      filterExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      params.ExpressionAttributeValues[':status'] = status;
    }

    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
      if (Object.keys(expressionAttributeNames).length > 0) {
        params.ExpressionAttributeNames = expressionAttributeNames;
      }
    }

    const result = await docClient.send(new QueryCommand(params));

    res.json({
      success: true,
      data: result.Items || []
    });
  } catch (error) {
    console.error('Get H5P contents error:', error);
    res.status(500).json({
      success: false,
      message: '獲取 H5P 內容失敗'
    });
  }
});

/**
 * GET /api/h5p/types
 * 獲取可用的 H5P 內容類型
 */
router.get('/types', authMiddleware, (req, res) => {
  const types = Object.entries(H5P_CONTENT_TYPES).map(([key, value]) => ({
    id: value,
    name: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
    description: getContentTypeDescription(value)
  }));

  res.json({
    success: true,
    data: types
  });
});

/**
 * GET /api/h5p/:contentId
 * 獲取單個 H5P 內容詳情
 */
router.get('/:contentId', authMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;

    const result = await getItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'H5P 內容不存在'
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get H5P content error:', error);
    res.status(500).json({
      success: false,
      message: '獲取 H5P 內容失敗'
    });
  }
});

/**
 * POST /api/h5p
 * 創建新的 H5P 內容
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      title,
      contentType,
      courseId,
      moduleId,
      description,
      parameters = {}, // H5P 內容參數
      metadata = {},
      embedType = 'iframe', // iframe, div
      maxScore = null,
      showFrame = true,
      showCopyright = true,
      showDownload = false,
      showEmbed = false,
      settings = {}
    } = req.body;

    if (!title || !contentType) {
      return res.status(400).json({
        success: false,
        message: '標題和內容類型為必填'
      });
    }

    const contentId = uuidv4();
    const now = new Date().toISOString();

    const h5pContent = {
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`,
      contentId,
      title,
      contentType,
      courseId,
      moduleId,
      description,
      parameters,
      metadata: {
        ...metadata,
        contentType,
        license: metadata.license || 'U',
        authors: metadata.authors || [{ name: req.user.displayName || req.user.email, role: 'Author' }]
      },
      embedType,
      maxScore,
      showFrame,
      showCopyright,
      showDownload,
      showEmbed,
      settings,
      status: H5P_STATUS.DRAFT,
      viewCount: 0,
      attemptCount: 0,
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now,
      // GSI for course lookup
      GSI1PK: courseId ? `COURSE#${courseId}` : 'H5P_GLOBAL',
      GSI1SK: `H5P#${contentId}`
    };

    await putItem(h5pContent);

    res.status(201).json({
      success: true,
      message: 'H5P 內容創建成功',
      data: h5pContent
    });
  } catch (error) {
    console.error('Create H5P content error:', error);
    res.status(500).json({
      success: false,
      message: '創建 H5P 內容失敗'
    });
  }
});

/**
 * PUT /api/h5p/:contentId
 * 更新 H5P 內容
 */
router.put('/:contentId', authMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;
    const updates = req.body;

    const existing = await getItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'H5P 內容不存在'
      });
    }

    // 檢查權限
    if (existing.createdBy !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '無權限編輯此內容'
      });
    }

    // 允許更新的欄位
    const allowedFields = [
      'title', 'description', 'parameters', 'metadata',
      'embedType', 'maxScore', 'showFrame', 'showCopyright',
      'showDownload', 'showEmbed', 'settings', 'status'
    ];

    const updateExpression = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateExpression.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = updates[field];
      }
    });

    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    await updateItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    }, {
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    res.json({
      success: true,
      message: 'H5P 內容更新成功'
    });
  } catch (error) {
    console.error('Update H5P content error:', error);
    res.status(500).json({
      success: false,
      message: '更新 H5P 內容失敗'
    });
  }
});

/**
 * POST /api/h5p/:contentId/view
 * 記錄 H5P 內容瀏覽
 */
router.post('/:contentId/view', authMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;

    await updateItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    }, {
      UpdateExpression: 'SET viewCount = if_not_exists(viewCount, :zero) + :inc',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':inc': 1
      }
    });

    // 記錄用戶瀏覽
    const viewRecord = {
      PK: `H5P_VIEW#${contentId}`,
      SK: `USER#${req.user.userId}#${Date.now()}`,
      contentId,
      userId: req.user.userId,
      viewedAt: new Date().toISOString()
    };

    await putItem(viewRecord);

    res.json({
      success: true,
      message: '瀏覽已記錄'
    });
  } catch (error) {
    console.error('Record H5P view error:', error);
    res.status(500).json({
      success: false,
      message: '記錄瀏覽失敗'
    });
  }
});

/**
 * POST /api/h5p/:contentId/attempt
 * 提交 H5P 嘗試結果
 */
router.post('/:contentId/attempt', authMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;
    const {
      score,
      maxScore,
      duration, // 秒
      completed,
      success,
      responses = [], // 用戶答案
      statement = {} // xAPI 語句
    } = req.body;

    const attemptId = uuidv4();
    const now = new Date().toISOString();

    // 創建嘗試記錄
    const attempt = {
      PK: `H5P_ATTEMPT#${contentId}`,
      SK: `ATTEMPT#${attemptId}`,
      attemptId,
      contentId,
      userId: req.user.userId,
      score,
      maxScore,
      scaledScore: maxScore ? Math.round((score / maxScore) * 100) / 100 : null,
      duration,
      completed,
      success,
      responses,
      statement,
      createdAt: now,
      // GSI for user lookup
      GSI1PK: `USER#${req.user.userId}`,
      GSI1SK: `H5P_ATTEMPT#${now}`
    };

    await putItem(attempt);

    // 更新內容統計
    await updateItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    }, {
      UpdateExpression: 'SET attemptCount = if_not_exists(attemptCount, :zero) + :inc',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':inc': 1
      }
    });

    res.json({
      success: true,
      message: '嘗試已記錄',
      data: attempt
    });
  } catch (error) {
    console.error('Record H5P attempt error:', error);
    res.status(500).json({
      success: false,
      message: '記錄嘗試失敗'
    });
  }
});

/**
 * GET /api/h5p/:contentId/attempts
 * 獲取 H5P 內容的嘗試記錄
 */
router.get('/:contentId/attempts', authMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { userId, limit = 50 } = req.query;

    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `H5P_ATTEMPT#${contentId}`
      },
      ScanIndexForward: false,
      Limit: parseInt(limit)
    };

    // 如果不是管理員，只能看自己的記錄
    if (!req.user.isAdmin) {
      params.FilterExpression = 'userId = :userId';
      params.ExpressionAttributeValues[':userId'] = req.user.userId;
    } else if (userId) {
      params.FilterExpression = 'userId = :userId';
      params.ExpressionAttributeValues[':userId'] = userId;
    }

    const result = await docClient.send(new QueryCommand(params));

    res.json({
      success: true,
      data: result.Items || []
    });
  } catch (error) {
    console.error('Get H5P attempts error:', error);
    res.status(500).json({
      success: false,
      message: '獲取嘗試記錄失敗'
    });
  }
});

/**
 * GET /api/h5p/:contentId/report
 * 獲取 H5P 內容的報告（教師/管理員）
 */
router.get('/:contentId/report', adminMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;

    // 獲取內容資訊
    const content = await getItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'H5P 內容不存在'
      });
    }

    // 獲取所有嘗試
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `H5P_ATTEMPT#${contentId}`
      }
    }));

    const attempts = result.Items || [];

    // 統計數據
    const stats = {
      totalAttempts: attempts.length,
      uniqueUsers: new Set(attempts.map(a => a.userId)).size,
      averageScore: 0,
      averageDuration: 0,
      completionRate: 0,
      successRate: 0,
      scoreDistribution: {
        '0-20': 0,
        '21-40': 0,
        '41-60': 0,
        '61-80': 0,
        '81-100': 0
      }
    };

    let totalScore = 0;
    let totalDuration = 0;
    let scoredAttempts = 0;
    let completedAttempts = 0;
    let successfulAttempts = 0;

    attempts.forEach(attempt => {
      if (attempt.scaledScore !== null && attempt.scaledScore !== undefined) {
        totalScore += attempt.scaledScore;
        scoredAttempts++;

        // 分數分佈
        const percentage = attempt.scaledScore * 100;
        if (percentage <= 20) stats.scoreDistribution['0-20']++;
        else if (percentage <= 40) stats.scoreDistribution['21-40']++;
        else if (percentage <= 60) stats.scoreDistribution['41-60']++;
        else if (percentage <= 80) stats.scoreDistribution['61-80']++;
        else stats.scoreDistribution['81-100']++;
      }

      if (attempt.duration) {
        totalDuration += attempt.duration;
      }

      if (attempt.completed) {
        completedAttempts++;
      }

      if (attempt.success) {
        successfulAttempts++;
      }
    });

    if (scoredAttempts > 0) {
      stats.averageScore = Math.round(totalScore / scoredAttempts * 100) / 100;
    }

    if (attempts.length > 0) {
      stats.averageDuration = Math.round(totalDuration / attempts.length);
      stats.completionRate = Math.round(completedAttempts / attempts.length * 100);
      stats.successRate = Math.round(successfulAttempts / attempts.length * 100);
    }

    res.json({
      success: true,
      data: {
        content: {
          contentId: content.contentId,
          title: content.title,
          contentType: content.contentType,
          viewCount: content.viewCount,
          attemptCount: content.attemptCount
        },
        stats,
        recentAttempts: attempts.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Get H5P report error:', error);
    res.status(500).json({
      success: false,
      message: '獲取報告失敗'
    });
  }
});

/**
 * GET /api/h5p/:contentId/embed
 * 獲取 H5P 嵌入代碼
 */
router.get('/:contentId/embed', authMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;

    const content = await getItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'H5P 內容不存在'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const embedUrl = `${baseUrl}/api/h5p/${contentId}/render`;

    const embedCode = content.embedType === 'iframe'
      ? `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen="allowfullscreen"></iframe>`
      : `<div class="h5p-container" data-content-id="${contentId}"></div><script src="${baseUrl}/js/h5p-embed.js"></script>`;

    res.json({
      success: true,
      data: {
        embedUrl,
        embedCode,
        embedType: content.embedType
      }
    });
  } catch (error) {
    console.error('Get H5P embed error:', error);
    res.status(500).json({
      success: false,
      message: '獲取嵌入代碼失敗'
    });
  }
});

/**
 * DELETE /api/h5p/:contentId
 * 刪除 H5P 內容
 */
router.delete('/:contentId', authMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;

    const existing = await getItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'H5P 內容不存在'
      });
    }

    // 檢查權限
    if (existing.createdBy !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '無權限刪除此內容'
      });
    }

    // 軟刪除
    await updateItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    }, {
      UpdateExpression: 'SET #status = :status, deletedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': H5P_STATUS.ARCHIVED,
        ':now': new Date().toISOString()
      }
    });

    res.json({
      success: true,
      message: 'H5P 內容已刪除'
    });
  } catch (error) {
    console.error('Delete H5P content error:', error);
    res.status(500).json({
      success: false,
      message: '刪除 H5P 內容失敗'
    });
  }
});

/**
 * POST /api/h5p/:contentId/duplicate
 * 複製 H5P 內容
 */
router.post('/:contentId/duplicate', authMiddleware, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { title, courseId } = req.body;

    const original = await getItem({
      PK: 'H5P_CONTENT',
      SK: `CONTENT#${contentId}`
    });

    if (!original) {
      return res.status(404).json({
        success: false,
        message: 'H5P 內容不存在'
      });
    }

    const newContentId = uuidv4();
    const now = new Date().toISOString();

    const duplicate = {
      ...original,
      SK: `CONTENT#${newContentId}`,
      contentId: newContentId,
      title: title || `${original.title} (副本)`,
      courseId: courseId || original.courseId,
      status: H5P_STATUS.DRAFT,
      viewCount: 0,
      attemptCount: 0,
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now,
      GSI1PK: courseId ? `COURSE#${courseId}` : (original.courseId ? `COURSE#${original.courseId}` : 'H5P_GLOBAL'),
      GSI1SK: `H5P#${newContentId}`
    };

    await putItem(duplicate);

    res.status(201).json({
      success: true,
      message: 'H5P 內容複製成功',
      data: duplicate
    });
  } catch (error) {
    console.error('Duplicate H5P content error:', error);
    res.status(500).json({
      success: false,
      message: '複製 H5P 內容失敗'
    });
  }
});

// 輔助函數：獲取內容類型描述
function getContentTypeDescription(type) {
  const descriptions = {
    'H5P.InteractiveVideo': '在影片中添加互動元素，如問答、熱點等',
    'H5P.CoursePresentation': '創建互動式簡報，包含各種互動元素',
    'H5P.QuestionSet': '創建一系列問題組成的測驗',
    'H5P.DragQuestion': '拖放式問答活動',
    'H5P.Blanks': '填空題練習',
    'H5P.MarkTheWords': '標記文本中的特定詞彙',
    'H5P.MultiChoice': '多選題',
    'H5P.TrueFalse': '是非題',
    'H5P.DragText': '拖放文字到正確位置',
    'H5P.Summary': '摘要活動',
    'H5P.Timeline': '互動式時間軸',
    'H5P.ImageHotspots': '圖片熱點互動',
    'H5P.Accordion': '手風琴式內容展示',
    'H5P.Dialogcards': '對話卡片學習',
    'H5P.Flashcards': '閃卡學習工具',
    'H5P.MemoryGame': '記憶遊戲',
    'H5P.BranchingScenario': '分支情境學習',
    'H5P.ThreeImage': '虛擬導覽 (360°)',
    'H5P.Column': '組合多種內容類型'
  };

  return descriptions[type] || '互動學習內容';
}

module.exports = router;
module.exports.H5P_CONTENT_TYPES = H5P_CONTENT_TYPES;
module.exports.H5P_STATUS = H5P_STATUS;
