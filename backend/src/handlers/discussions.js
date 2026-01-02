/**
 * 討論區 API 處理器
 * 支援發文、回覆、按讚等社群功能
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, adminMiddleware } = require('../utils/auth');

// 生成唯一 ID
const generateId = (prefix = 'disc') => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
};

// 預設標籤
const DEFAULT_TAGS = [
  { value: 'general', label: '一般討論' },
  { value: 'question', label: '問題求助' },
  { value: 'sharing', label: '經驗分享' },
  { value: 'resource', label: '資源分享' },
  { value: 'announcement', label: '公告' },
  { value: 'feedback', label: '意見回饋' }
];

/**
 * GET /api/discussions
 * 取得討論列表（分頁）
 */
router.get('/', async (req, res) => {
  try {
    const {
      tag,
      limit = 20,
      offset = 0,
      sort = 'latest',  // latest, popular, unanswered
      userId  // 篩選特定用戶的貼文
    } = req.query;

    // 使用 scan 查詢討論貼文
    const params = {
      TableName: process.env.DYNAMODB_TABLE || 'beyondbridge',
      FilterExpression: 'entityType = :type AND SK = :sk',
      ExpressionAttributeValues: {
        ':type': 'DISCUSSION',
        ':sk': 'META'
      }
    };

    // 按標籤篩選
    if (tag) {
      params.FilterExpression += ' AND contains(tags, :tag)';
      params.ExpressionAttributeValues[':tag'] = tag;
    }

    // 按用戶篩選
    if (userId) {
      params.FilterExpression += ' AND userId = :userId';
      params.ExpressionAttributeValues[':userId'] = userId;
    }

    const result = await db.scan(params);

    let posts = (result.Items || [])
      .map(item => {
        // 清理內部欄位
        const post = { ...item };
        delete post.PK;
        delete post.SK;
        delete post.GSI1PK;
        delete post.GSI1SK;
        delete post.GSI2PK;
        delete post.GSI2SK;

        // 截斷內容預覽
        if (post.content && post.content.length > 200) {
          post.contentPreview = post.content.substring(0, 200) + '...';
        } else {
          post.contentPreview = post.content;
        }

        return post;
      });

    // 排序
    switch (sort) {
      case 'popular':
        posts.sort((a, b) => (b.likeCount + b.replyCount * 2) - (a.likeCount + a.replyCount * 2));
        break;
      case 'unanswered':
        posts = posts.filter(p => p.replyCount === 0);
        posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      default: // latest
        posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // 分頁
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedPosts = posts.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedPosts,
      pagination: {
        total: posts.length,
        offset: startIndex,
        limit: parseInt(limit),
        hasMore: endIndex < posts.length
      }
    });

  } catch (error) {
    console.error('Get discussions error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得討論列表失敗'
    });
  }
});

/**
 * GET /api/discussions/tags
 * 取得熱門標籤
 */
router.get('/tags', async (req, res) => {
  try {
    // 返回預設標籤，未來可以加上動態統計
    res.json({
      success: true,
      data: DEFAULT_TAGS
    });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得標籤失敗'
    });
  }
});

/**
 * GET /api/discussions/:id
 * 取得討論詳情（含回覆）
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 取得主貼文
    const post = await db.getItem(`DISC#${id}`, 'META');

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    // 取得所有回覆
    const repliesParams = {
      TableName: process.env.DYNAMODB_TABLE || 'beyondbridge',
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `DISC#${id}`,
        ':sk': 'REPLY#'
      }
    };

    const repliesResult = await db.query(repliesParams);
    const replies = (repliesResult.Items || []).map(reply => {
      delete reply.PK;
      delete reply.SK;
      return reply;
    }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // 更新瀏覽次數
    await db.updateItem(`DISC#${id}`, 'META', {
      viewCount: (post.viewCount || 0) + 1
    });

    // 清理貼文資料
    delete post.PK;
    delete post.SK;
    delete post.GSI1PK;
    delete post.GSI1SK;
    delete post.GSI2PK;
    delete post.GSI2SK;

    res.json({
      success: true,
      data: {
        ...post,
        replies
      }
    });

  } catch (error) {
    console.error('Get discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得討論詳情失敗'
    });
  }
});

/**
 * POST /api/discussions
 * 發布新討論
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, content, tags, isPinned } = req.body;

    // 驗證必填欄位
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請填寫標題和內容'
      });
    }

    if (title.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'TITLE_TOO_LONG',
        message: '標題不能超過 100 字'
      });
    }

    const postId = generateId('disc');
    const now = new Date().toISOString();

    // 取得用戶資訊
    const user = await db.getItem(`USER#${userId}`, 'PROFILE');

    // 處理標籤（取第一個作為主標籤）
    const primaryTag = (tags && tags.length > 0) ? tags[0] : 'general';

    const post = {
      PK: `DISC#${postId}`,
      SK: 'META',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `DISC#${postId}`,
      GSI2PK: `TAG#${primaryTag}`,
      GSI2SK: now,
      entityType: 'DISCUSSION',

      postId,
      userId,
      userDisplayName: user?.displayName || '匿名用戶',
      userAvatar: user?.avatarUrl || null,
      userRole: user?.role || 'user',

      title,
      content,
      tags: tags || ['general'],

      likeCount: 0,
      replyCount: 0,
      viewCount: 0,

      isPinned: req.user.isAdmin && isPinned ? true : false,
      isEdited: false,
      status: 'active',

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(post);

    // 記錄活動
    await db.logActivity(userId, 'discussion_created', 'discussion', postId, {
      title
    });

    // 清理回傳資料
    delete post.PK;
    delete post.SK;
    delete post.GSI1PK;
    delete post.GSI1SK;
    delete post.GSI2PK;
    delete post.GSI2SK;

    res.status(201).json({
      success: true,
      message: '討論已發布',
      data: post
    });

  } catch (error) {
    console.error('Create discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '發布討論失敗'
    });
  }
});

/**
 * PUT /api/discussions/:id
 * 編輯討論
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { title, content, tags } = req.body;

    const post = await db.getItem(`DISC#${id}`, 'META');

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    // 檢查權限（只有作者或管理員可以編輯）
    if (!req.user.isAdmin && post.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限編輯此討論'
      });
    }

    const now = new Date().toISOString();
    const updates = {
      updatedAt: now,
      isEdited: true
    };

    if (title) updates.title = title;
    if (content) updates.content = content;
    if (tags) {
      updates.tags = tags;
      // 更新主標籤的 GSI
      updates.GSI2PK = `TAG#${tags[0] || 'general'}`;
    }

    await db.updateItem(`DISC#${id}`, 'META', updates);

    res.json({
      success: true,
      message: '討論已更新',
      data: { postId: id, ...updates }
    });

  } catch (error) {
    console.error('Update discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新討論失敗'
    });
  }
});

/**
 * DELETE /api/discussions/:id
 * 刪除討論
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const post = await db.getItem(`DISC#${id}`, 'META');

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    // 檢查權限
    if (!req.user.isAdmin && post.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限刪除此討論'
      });
    }

    // 軟刪除（保留記錄但標記為已刪除）
    await db.updateItem(`DISC#${id}`, 'META', {
      status: 'deleted',
      deletedAt: new Date().toISOString(),
      deletedBy: userId
    });

    res.json({
      success: true,
      message: '討論已刪除'
    });

  } catch (error) {
    console.error('Delete discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除討論失敗'
    });
  }
});

/**
 * POST /api/discussions/:id/reply
 * 回覆討論
 */
router.post('/:id/reply', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { content, replyTo } = req.body;

    // 驗證
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請輸入回覆內容'
      });
    }

    // 確認貼文存在
    const post = await db.getItem(`DISC#${id}`, 'META');
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const replyId = generateId('reply');
    const now = new Date().toISOString();

    // 取得用戶資訊
    const user = await db.getItem(`USER#${userId}`, 'PROFILE');

    const reply = {
      PK: `DISC#${id}`,
      SK: `REPLY#${replyId}`,
      entityType: 'DISCUSSION_REPLY',

      replyId,
      postId: id,
      userId,
      userDisplayName: user?.displayName || '匿名用戶',
      userAvatar: user?.avatarUrl || null,
      userRole: user?.role || 'user',

      content,
      replyTo: replyTo || null,  // 回覆其他回覆

      likeCount: 0,
      isEdited: false,
      status: 'active',

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(reply);

    // 更新主貼文的回覆數
    await db.updateItem(`DISC#${id}`, 'META', {
      replyCount: (post.replyCount || 0) + 1,
      lastReplyAt: now,
      lastReplyBy: userId
    });

    // 記錄活動
    await db.logActivity(userId, 'discussion_replied', 'discussion', id, {
      replyId
    });

    // 清理回傳資料
    delete reply.PK;
    delete reply.SK;

    res.status(201).json({
      success: true,
      message: '回覆已發布',
      data: reply
    });

  } catch (error) {
    console.error('Reply discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'REPLY_FAILED',
      message: '回覆失敗'
    });
  }
});

/**
 * POST /api/discussions/:id/like
 * 按讚/取消按讚
 */
router.post('/:id/like', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { replyId } = req.body;  // 如果是對回覆按讚

    // 確認貼文存在
    const post = await db.getItem(`DISC#${id}`, 'META');
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    // 檢查是否已按讚（使用單獨的按讚記錄）
    const likeKey = replyId ? `${id}:${replyId}` : id;
    const existingLike = await db.getItem(`LIKE#${userId}`, `DISC#${likeKey}`);

    const now = new Date().toISOString();

    if (existingLike) {
      // 取消按讚
      await db.deleteItem(`LIKE#${userId}`, `DISC#${likeKey}`);

      // 更新按讚數
      if (replyId) {
        const reply = await db.getItem(`DISC#${id}`, `REPLY#${replyId}`);
        if (reply) {
          await db.updateItem(`DISC#${id}`, `REPLY#${replyId}`, {
            likeCount: Math.max(0, (reply.likeCount || 1) - 1)
          });
        }
      } else {
        await db.updateItem(`DISC#${id}`, 'META', {
          likeCount: Math.max(0, (post.likeCount || 1) - 1)
        });
      }

      res.json({
        success: true,
        message: '已取消按讚',
        data: { liked: false }
      });

    } else {
      // 新增按讚
      await db.putItem({
        PK: `LIKE#${userId}`,
        SK: `DISC#${likeKey}`,
        entityType: 'LIKE',
        userId,
        targetType: replyId ? 'reply' : 'post',
        targetId: replyId || id,
        createdAt: now
      });

      // 更新按讚數
      if (replyId) {
        const reply = await db.getItem(`DISC#${id}`, `REPLY#${replyId}`);
        if (reply) {
          await db.updateItem(`DISC#${id}`, `REPLY#${replyId}`, {
            likeCount: (reply.likeCount || 0) + 1
          });
        }
      } else {
        await db.updateItem(`DISC#${id}`, 'META', {
          likeCount: (post.likeCount || 0) + 1
        });
      }

      res.json({
        success: true,
        message: '已按讚',
        data: { liked: true }
      });
    }

  } catch (error) {
    console.error('Like discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'LIKE_FAILED',
      message: '操作失敗'
    });
  }
});

/**
 * GET /api/discussions/:id/liked
 * 檢查當前用戶是否已按讚
 */
router.get('/:id/liked', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const existingLike = await db.getItem(`LIKE#${userId}`, `DISC#${id}`);

    res.json({
      success: true,
      data: { liked: !!existingLike }
    });

  } catch (error) {
    console.error('Check liked error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '檢查按讚狀態失敗'
    });
  }
});

/**
 * DELETE /api/discussions/:postId/reply/:replyId
 * 刪除回覆
 */
router.delete('/:postId/reply/:replyId', authMiddleware, async (req, res) => {
  try {
    const { postId, replyId } = req.params;
    const userId = req.user.userId;

    const reply = await db.getItem(`DISC#${postId}`, `REPLY#${replyId}`);

    if (!reply) {
      return res.status(404).json({
        success: false,
        error: 'REPLY_NOT_FOUND',
        message: '找不到此回覆'
      });
    }

    // 檢查權限
    if (!req.user.isAdmin && reply.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限刪除此回覆'
      });
    }

    // 軟刪除
    await db.updateItem(`DISC#${postId}`, `REPLY#${replyId}`, {
      status: 'deleted',
      deletedAt: new Date().toISOString(),
      deletedBy: userId
    });

    // 更新主貼文的回覆數
    const post = await db.getItem(`DISC#${postId}`, 'META');
    if (post) {
      await db.updateItem(`DISC#${postId}`, 'META', {
        replyCount: Math.max(0, (post.replyCount || 1) - 1)
      });
    }

    res.json({
      success: true,
      message: '回覆已刪除'
    });

  } catch (error) {
    console.error('Delete reply error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除回覆失敗'
    });
  }
});

// ==================== 管理員端點 ====================

/**
 * PUT /api/discussions/admin/:id/pin
 * 置頂/取消置頂討論
 */
router.put('/admin/:id/pin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPinned } = req.body;

    const post = await db.getItem(`DISC#${id}`, 'META');
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    await db.updateItem(`DISC#${id}`, 'META', {
      isPinned: !!isPinned,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: isPinned ? '已置頂' : '已取消置頂',
      data: { postId: id, isPinned: !!isPinned }
    });

  } catch (error) {
    console.error('Pin discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '操作失敗'
    });
  }
});

module.exports = router;
