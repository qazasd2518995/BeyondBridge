/**
 * 討論區系統 API 處理器
 * BeyondBridge Education Platform - Moodle-style Forum System
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, optionalAuthMiddleware } = require('../utils/auth');

// ==================== 討論區列表與詳情 ====================

/**
 * GET /api/forums
 * 取得討論區列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.query;

    let forums = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'FORUM' }
      }
    });

    // 課程篩選
    if (courseId) {
      forums = forums.filter(f => f.courseId === courseId);
    }

    // 取得每個討論區的統計
    const forumsWithStats = await Promise.all(
      forums.map(async (f) => {
        const discussions = await db.query(`FORUM#${f.forumId}`, {
          skPrefix: 'DISCUSSION#'
        });

        // 計算總回覆數
        let totalReplies = 0;
        for (const d of discussions) {
          const replies = await db.query(`DISCUSSION#${d.discussionId}`, {
            skPrefix: 'POST#'
          });
          totalReplies += replies.length;
        }

        // 取得最新討論
        const latestDiscussion = discussions
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

        delete f.PK;
        delete f.SK;
        return {
          ...f,
          stats: {
            discussionCount: discussions.length,
            replyCount: totalReplies,
            latestDiscussion: latestDiscussion ? {
              title: latestDiscussion.title,
              createdAt: latestDiscussion.createdAt,
              authorName: latestDiscussion.authorName
            } : null
          }
        };
      })
    );

    res.json({
      success: true,
      data: forumsWithStats,
      count: forumsWithStats.length
    });

  } catch (error) {
    console.error('Get forums error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得討論區列表失敗'
    });
  }
});

/**
 * GET /api/forums/:id
 * 取得討論區詳情
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, sort = 'latest' } = req.query;

    const forum = await db.getItem(`FORUM#${id}`, 'META');
    if (!forum) {
      return res.status(404).json({
        success: false,
        error: 'FORUM_NOT_FOUND',
        message: '找不到此討論區'
      });
    }

    // 取得討論列表
    let discussions = await db.query(`FORUM#${id}`, {
      skPrefix: 'DISCUSSION#'
    });

    // 取得每個討論的回覆數和最新回覆
    discussions = await Promise.all(
      discussions.map(async (d) => {
        const posts = await db.query(`DISCUSSION#${d.discussionId}`, {
          skPrefix: 'POST#'
        });

        const latestPost = posts
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

        delete d.PK;
        delete d.SK;
        return {
          ...d,
          replyCount: posts.length,
          latestReply: latestPost ? {
            authorName: latestPost.authorName,
            createdAt: latestPost.createdAt
          } : null
        };
      })
    );

    // 排序
    if (sort === 'latest') {
      discussions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'active') {
      discussions.sort((a, b) => {
        const aLatest = a.latestReply?.createdAt || a.createdAt;
        const bLatest = b.latestReply?.createdAt || b.createdAt;
        return new Date(bLatest) - new Date(aLatest);
      });
    } else if (sort === 'popular') {
      discussions.sort((a, b) => b.replyCount - a.replyCount);
    }

    // 置頂的排在最前
    discussions.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    // 分頁
    const total = discussions.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    discussions = discussions.slice(offset, offset + parseInt(limit));

    delete forum.PK;
    delete forum.SK;

    res.json({
      success: true,
      data: {
        ...forum,
        discussions
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get forum error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得討論區失敗'
    });
  }
});

// ==================== 討論區管理（教師） ====================

/**
 * POST /api/forums
 * 建立討論區
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      courseId,
      sectionId,
      title,
      description,
      type = 'general', // general, news, qanda, social
      forumMode = 'standard', // standard (everyone can post), single (single discussion only)
      subscriptionMode = 'optional', // optional, forced, auto, disabled
      ratingEnabled = false,
      maxAttachments = 5,
      maxAttachmentSize = 10, // MB
      visible = true
    } = req.body;

    // 驗證必填欄位
    if (!courseId || !title) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供課程ID和討論區標題'
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

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限在此課程建立討論區'
      });
    }

    const forumId = db.generateId('forum');
    const now = new Date().toISOString();

    const forumItem = {
      PK: `FORUM#${forumId}`,
      SK: 'META',
      entityType: 'FORUM',
      GSI1PK: `COURSE#${courseId}`,
      GSI1SK: `FORUM#${forumId}`,

      forumId,
      courseId,
      sectionId,
      title,
      description,
      type,
      forumMode,
      subscriptionMode,
      ratingEnabled,
      maxAttachments,
      maxAttachmentSize,
      visible,

      stats: {
        discussionCount: 0,
        postCount: 0
      },

      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(forumItem);

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

        activityId: forumId,
        courseId,
        sectionId,
        type: 'forum',
        title,
        description,
        forumId,

        order: activities.length + 1,
        visible,

        completion: { type: 'view' },

        createdAt: now,
        updatedAt: now
      };

      await db.putItem(activityItem);
    }

    delete forumItem.PK;
    delete forumItem.SK;

    res.status(201).json({
      success: true,
      message: '討論區建立成功',
      data: forumItem
    });

  } catch (error) {
    console.error('Create forum error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立討論區失敗'
    });
  }
});

/**
 * PUT /api/forums/:id
 * 更新討論區
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    const forum = await db.getItem(`FORUM#${id}`, 'META');
    if (!forum) {
      return res.status(404).json({
        success: false,
        error: 'FORUM_NOT_FOUND',
        message: '找不到此討論區'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此討論區'
      });
    }

    // 不允許更新的欄位
    delete updates.forumId;
    delete updates.courseId;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.stats;

    updates.updatedAt = new Date().toISOString();

    const updatedForum = await db.updateItem(`FORUM#${id}`, 'META', updates);

    delete updatedForum.PK;
    delete updatedForum.SK;

    res.json({
      success: true,
      message: '討論區已更新',
      data: updatedForum
    });

  } catch (error) {
    console.error('Update forum error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新討論區失敗'
    });
  }
});

/**
 * DELETE /api/forums/:id
 * 刪除討論區
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const forum = await db.getItem(`FORUM#${id}`, 'META');
    if (!forum) {
      return res.status(404).json({
        success: false,
        error: 'FORUM_NOT_FOUND',
        message: '找不到此討論區'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此討論區'
      });
    }

    // 刪除所有討論和回覆
    const discussions = await db.query(`FORUM#${id}`, { skPrefix: 'DISCUSSION#' });
    for (const d of discussions) {
      // 刪除回覆
      const posts = await db.query(`DISCUSSION#${d.discussionId}`, { skPrefix: 'POST#' });
      for (const p of posts) {
        await db.deleteItem(`DISCUSSION#${d.discussionId}`, p.SK);
      }
      // 刪除討論
      await db.deleteItem(`FORUM#${id}`, d.SK);
      await db.deleteItem(`DISCUSSION#${d.discussionId}`, 'META');
    }

    // 刪除討論區
    await db.deleteItem(`FORUM#${id}`, 'META');

    res.json({
      success: true,
      message: '討論區已刪除'
    });

  } catch (error) {
    console.error('Delete forum error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除討論區失敗'
    });
  }
});

// ==================== 討論主題 ====================

/**
 * GET /api/forums/:id/discussions/:discussionId
 * 取得討論詳情（含回覆）
 */
router.get('/:id/discussions/:discussionId', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId } = req.params;
    const userId = req.user.userId;

    const discussion = await db.getItem(`DISCUSSION#${discussionId}`, 'META');
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    // 取得回覆
    let posts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });

    // 建立回覆樹狀結構
    posts = posts.map(p => {
      delete p.PK;
      delete p.SK;
      return p;
    });

    // 增加瀏覽次數
    await db.updateItem(`DISCUSSION#${discussionId}`, 'META', {
      viewCount: (discussion.viewCount || 0) + 1,
      updatedAt: new Date().toISOString()
    });

    delete discussion.PK;
    delete discussion.SK;

    // 標記用戶的貼文
    posts = posts.map(p => ({
      ...p,
      isOwner: p.authorId === userId
    }));

    res.json({
      success: true,
      data: {
        ...discussion,
        isOwner: discussion.authorId === userId,
        posts: buildPostTree(posts)
      }
    });

  } catch (error) {
    console.error('Get discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得討論失敗'
    });
  }
});

/**
 * POST /api/forums/:id/discussions
 * 發起新討論
 */
router.post('/:id/discussions', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      title,
      content,
      attachments = [],
      pinned = false
    } = req.body;

    const forum = await db.getItem(`FORUM#${id}`, 'META');
    if (!forum) {
      return res.status(404).json({
        success: false,
        error: 'FORUM_NOT_FOUND',
        message: '找不到此討論區'
      });
    }

    // 檢查是否已報名課程
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${forum.courseId}`);
    const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
    const isInstructor = course.instructorId === userId;

    if (!progress && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 驗證必填欄位
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供標題和內容'
      });
    }

    // 取得用戶資訊
    const user = await db.getUser(userId) || await db.getAdmin(userId);

    const discussionId = db.generateId('disc');
    const now = new Date().toISOString();

    // 只有教師可以置頂
    const canPin = isInstructor || req.user.isAdmin;

    const discussionItem = {
      PK: `DISCUSSION#${discussionId}`,
      SK: 'META',
      entityType: 'DISCUSSION',

      discussionId,
      forumId: id,
      courseId: forum.courseId,
      title,
      content,
      attachments,

      authorId: userId,
      authorName: user?.displayName || '未知用戶',
      authorRole: isInstructor ? 'instructor' : 'student',

      pinned: canPin && pinned,
      locked: false,
      viewCount: 0,

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(discussionItem);

    // 在討論區中建立索引
    await db.putItem({
      PK: `FORUM#${id}`,
      SK: `DISCUSSION#${discussionId}`,
      entityType: 'FORUM_DISCUSSION',
      discussionId,
      title,
      authorId: userId,
      authorName: user?.displayName || '未知用戶',
      pinned: canPin && pinned,
      createdAt: now
    });

    // 更新討論區統計
    await db.updateItem(`FORUM#${id}`, 'META', {
      'stats.discussionCount': (forum.stats?.discussionCount || 0) + 1,
      updatedAt: now
    });

    delete discussionItem.PK;
    delete discussionItem.SK;

    res.status(201).json({
      success: true,
      message: '討論發起成功',
      data: discussionItem
    });

  } catch (error) {
    console.error('Create discussion error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '發起討論失敗'
    });
  }
});

/**
 * PUT /api/forums/:id/discussions/:discussionId
 * 更新討論
 */
router.put('/:id/discussions/:discussionId', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    const discussion = await db.getItem(`DISCUSSION#${discussionId}`, 'META');
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    // 權限檢查：作者或教師
    const forum = await db.getItem(`FORUM#${id}`, 'META');
    const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
    const isInstructor = course.instructorId === userId;
    const isAuthor = discussion.authorId === userId;

    if (!isAuthor && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此討論'
      });
    }

    // 不允許更新的欄位
    delete updates.discussionId;
    delete updates.forumId;
    delete updates.courseId;
    delete updates.authorId;
    delete updates.authorName;
    delete updates.createdAt;

    // 只有教師可以置頂/鎖定
    if (!isInstructor && !req.user.isAdmin) {
      delete updates.pinned;
      delete updates.locked;
    }

    updates.updatedAt = new Date().toISOString();

    const updatedDiscussion = await db.updateItem(`DISCUSSION#${discussionId}`, 'META', updates);

    // 更新討論區中的索引
    if (updates.title || updates.pinned !== undefined) {
      await db.updateItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`, {
        title: updates.title || discussion.title,
        pinned: updates.pinned !== undefined ? updates.pinned : discussion.pinned,
        updatedAt: updates.updatedAt
      });
    }

    delete updatedDiscussion.PK;
    delete updatedDiscussion.SK;

    res.json({
      success: true,
      message: '討論已更新',
      data: updatedDiscussion
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
 * DELETE /api/forums/:id/discussions/:discussionId
 * 刪除討論
 */
router.delete('/:id/discussions/:discussionId', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId } = req.params;
    const userId = req.user.userId;

    const discussion = await db.getItem(`DISCUSSION#${discussionId}`, 'META');
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    // 權限檢查
    const forum = await db.getItem(`FORUM#${id}`, 'META');
    const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
    const isInstructor = course.instructorId === userId;
    const isAuthor = discussion.authorId === userId;

    if (!isAuthor && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此討論'
      });
    }

    // 刪除所有回覆
    const posts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
    for (const p of posts) {
      await db.deleteItem(`DISCUSSION#${discussionId}`, p.SK);
    }

    // 刪除討論
    await db.deleteItem(`DISCUSSION#${discussionId}`, 'META');
    await db.deleteItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`);

    // 更新討論區統計
    await db.updateItem(`FORUM#${id}`, 'META', {
      'stats.discussionCount': Math.max(0, (forum.stats?.discussionCount || 1) - 1),
      'stats.postCount': Math.max(0, (forum.stats?.postCount || posts.length) - posts.length),
      updatedAt: new Date().toISOString()
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

// ==================== 回覆管理 ====================

/**
 * POST /api/forums/:id/discussions/:discussionId/posts
 * 回覆討論
 */
router.post('/:id/discussions/:discussionId/posts', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId } = req.params;
    const userId = req.user.userId;
    const {
      content,
      parentPostId, // 回覆特定貼文（巢狀回覆）
      attachments = []
    } = req.body;

    const discussion = await db.getItem(`DISCUSSION#${discussionId}`, 'META');
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    // 檢查是否被鎖定
    if (discussion.locked) {
      return res.status(403).json({
        success: false,
        error: 'DISCUSSION_LOCKED',
        message: '此討論已被鎖定，無法回覆'
      });
    }

    // 檢查是否已報名課程
    const forum = await db.getItem(`FORUM#${id}`, 'META');
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${forum.courseId}`);
    const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
    const isInstructor = course.instructorId === userId;

    if (!progress && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 驗證必填欄位
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供回覆內容'
      });
    }

    // 取得用戶資訊
    const user = await db.getUser(userId) || await db.getAdmin(userId);

    const postId = db.generateId('post');
    const now = new Date().toISOString();

    // 取得現有回覆數以生成排序鍵
    const existingPosts = await db.query(`DISCUSSION#${discussionId}`, {
      skPrefix: 'POST#'
    });
    const postNumber = String(existingPosts.length + 1).padStart(5, '0');

    const postItem = {
      PK: `DISCUSSION#${discussionId}`,
      SK: `POST#${postNumber}`,
      entityType: 'FORUM_POST',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `POST#${postId}`,

      postId,
      discussionId,
      forumId: id,
      parentPostId: parentPostId || null,

      content,
      attachments,

      authorId: userId,
      authorName: user?.displayName || '未知用戶',
      authorRole: isInstructor ? 'instructor' : 'student',

      likes: 0,
      likedBy: [],

      createdAt: now,
      updatedAt: now
    };

    await db.putItem(postItem);

    // 更新討論區統計
    await db.updateItem(`FORUM#${id}`, 'META', {
      'stats.postCount': (forum.stats?.postCount || 0) + 1,
      updatedAt: now
    });

    // 更新討論的最後回覆時間
    await db.updateItem(`DISCUSSION#${discussionId}`, 'META', {
      lastReplyAt: now,
      lastReplyBy: userId,
      lastReplyByName: user?.displayName || '未知用戶',
      updatedAt: now
    });

    delete postItem.PK;
    delete postItem.SK;

    res.status(201).json({
      success: true,
      message: '回覆成功',
      data: postItem
    });

  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '回覆失敗'
    });
  }
});

/**
 * PUT /api/forums/:id/discussions/:discussionId/posts/:postId
 * 編輯回覆
 */
router.put('/:id/discussions/:discussionId/posts/:postId', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId, postId } = req.params;
    const userId = req.user.userId;
    const { content, attachments } = req.body;

    // 找到回覆
    const posts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
    const post = posts.find(p => p.postId === postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此回覆'
      });
    }

    // 權限檢查
    const forum = await db.getItem(`FORUM#${id}`, 'META');
    const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
    const isInstructor = course.instructorId === userId;
    const isAuthor = post.authorId === userId;

    if (!isAuthor && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限編輯此回覆'
      });
    }

    const now = new Date().toISOString();
    const updates = {
      content: content || post.content,
      attachments: attachments || post.attachments,
      editedAt: now,
      editedBy: userId,
      updatedAt: now
    };

    const updatedPost = await db.updateItem(`DISCUSSION#${discussionId}`, post.SK, updates);

    delete updatedPost.PK;
    delete updatedPost.SK;

    res.json({
      success: true,
      message: '回覆已更新',
      data: updatedPost
    });

  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新回覆失敗'
    });
  }
});

/**
 * DELETE /api/forums/:id/discussions/:discussionId/posts/:postId
 * 刪除回覆
 */
router.delete('/:id/discussions/:discussionId/posts/:postId', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId, postId } = req.params;
    const userId = req.user.userId;

    // 找到回覆
    const posts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
    const post = posts.find(p => p.postId === postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此回覆'
      });
    }

    // 權限檢查
    const forum = await db.getItem(`FORUM#${id}`, 'META');
    const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
    const isInstructor = course.instructorId === userId;
    const isAuthor = post.authorId === userId;

    if (!isAuthor && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此回覆'
      });
    }

    await db.deleteItem(`DISCUSSION#${discussionId}`, post.SK);

    // 更新討論區統計
    await db.updateItem(`FORUM#${id}`, 'META', {
      'stats.postCount': Math.max(0, (forum.stats?.postCount || 1) - 1),
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '回覆已刪除'
    });

  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除回覆失敗'
    });
  }
});

/**
 * POST /api/forums/:id/discussions/:discussionId/posts/:postId/like
 * 按讚回覆
 */
router.post('/:id/discussions/:discussionId/posts/:postId/like', authMiddleware, async (req, res) => {
  try {
    const { discussionId, postId } = req.params;
    const userId = req.user.userId;

    // 找到回覆
    const posts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
    const post = posts.find(p => p.postId === postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此回覆'
      });
    }

    const likedBy = post.likedBy || [];
    const alreadyLiked = likedBy.includes(userId);

    let newLikedBy;
    let newLikes;

    if (alreadyLiked) {
      // 取消按讚
      newLikedBy = likedBy.filter(id => id !== userId);
      newLikes = Math.max(0, (post.likes || 1) - 1);
    } else {
      // 按讚
      newLikedBy = [...likedBy, userId];
      newLikes = (post.likes || 0) + 1;
    }

    await db.updateItem(`DISCUSSION#${discussionId}`, post.SK, {
      likes: newLikes,
      likedBy: newLikedBy,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: alreadyLiked ? '已取消按讚' : '已按讚',
      data: {
        likes: newLikes,
        liked: !alreadyLiked
      }
    });

  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({
      success: false,
      error: 'LIKE_FAILED',
      message: '操作失敗'
    });
  }
});

// ==================== 輔助函數 ====================

/**
 * 建立回覆的樹狀結構
 */
function buildPostTree(posts) {
  const postMap = new Map();
  const rootPosts = [];

  // 建立映射
  posts.forEach(post => {
    postMap.set(post.postId, { ...post, replies: [] });
  });

  // 建立樹狀結構
  posts.forEach(post => {
    const postWithReplies = postMap.get(post.postId);
    if (post.parentPostId && postMap.has(post.parentPostId)) {
      postMap.get(post.parentPostId).replies.push(postWithReplies);
    } else {
      rootPosts.push(postWithReplies);
    }
  });

  // 按時間排序
  const sortByTime = (posts) => {
    posts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    posts.forEach(post => {
      if (post.replies.length > 0) {
        sortByTime(post.replies);
      }
    });
    return posts;
  };

  return sortByTime(rootPosts);
}

// ==================== 訂閱管理 ====================

/**
 * GET /api/forums/:id/subscription
 * 取得用戶的訂閱狀態
 */
router.get('/:id/subscription', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 模擬訂閱狀態
    const subscription = {
      forumId: id,
      userId,
      subscribed: true,
      subscriptionType: 'all_posts', // 'all_posts', 'first_post_only', 'none'
      emailNotification: true,
      subscribedAt: '2024-01-15T10:00:00Z'
    };

    res.json({
      success: true,
      data: subscription
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      message: '取得訂閱狀態失敗'
    });
  }
});

/**
 * POST /api/forums/:id/subscribe
 * 訂閱論壇
 */
router.post('/:id/subscribe', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { subscriptionType = 'all_posts', emailNotification = true } = req.body;

    const subscription = {
      forumId: id,
      userId,
      subscribed: true,
      subscriptionType,
      emailNotification,
      subscribedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: subscription,
      message: '已訂閱此論壇'
    });
  } catch (error) {
    console.error('Subscribe forum error:', error);
    res.status(500).json({
      success: false,
      message: '訂閱失敗'
    });
  }
});

/**
 * DELETE /api/forums/:id/subscribe
 * 取消訂閱論壇
 */
router.delete('/:id/subscribe', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    res.json({
      success: true,
      message: '已取消訂閱'
    });
  } catch (error) {
    console.error('Unsubscribe forum error:', error);
    res.status(500).json({
      success: false,
      message: '取消訂閱失敗'
    });
  }
});

/**
 * POST /api/forums/:id/discussions/:discussionId/subscribe
 * 訂閱特定討論串
 */
router.post('/:id/discussions/:discussionId/subscribe', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId } = req.params;
    const userId = req.user.userId;

    const subscription = {
      forumId: id,
      discussionId,
      userId,
      subscribed: true,
      subscribedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: subscription,
      message: '已訂閱此討論串'
    });
  } catch (error) {
    console.error('Subscribe discussion error:', error);
    res.status(500).json({
      success: false,
      message: '訂閱失敗'
    });
  }
});

/**
 * DELETE /api/forums/:id/discussions/:discussionId/subscribe
 * 取消訂閱討論串
 */
router.delete('/:id/discussions/:discussionId/subscribe', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId } = req.params;
    const userId = req.user.userId;

    res.json({
      success: true,
      message: '已取消訂閱討論串'
    });
  } catch (error) {
    console.error('Unsubscribe discussion error:', error);
    res.status(500).json({
      success: false,
      message: '取消訂閱失敗'
    });
  }
});

// ==================== 未讀追蹤 ====================

/**
 * GET /api/forums/:id/unread
 * 取得論壇中的未讀討論
 */
router.get('/:id/unread', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 模擬未讀資料
    const unreadData = {
      forumId: id,
      userId,
      totalUnread: 5,
      unreadDiscussions: [
        {
          discussionId: 'disc_001',
          title: '關於作業截止日期的問題',
          unreadPosts: 3,
          lastPostAt: '2024-01-25T14:30:00Z',
          lastPostBy: '張小明'
        },
        {
          discussionId: 'disc_002',
          title: '課程內容討論',
          unreadPosts: 2,
          lastPostAt: '2024-01-25T10:15:00Z',
          lastPostBy: '李小華'
        }
      ]
    };

    res.json({
      success: true,
      data: unreadData
    });
  } catch (error) {
    console.error('Get unread error:', error);
    res.status(500).json({
      success: false,
      message: '取得未讀資料失敗'
    });
  }
});

/**
 * POST /api/forums/:id/mark-read
 * 標記論壇所有討論為已讀
 */
router.post('/:id/mark-read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    res.json({
      success: true,
      data: {
        forumId: id,
        userId,
        markedAt: new Date().toISOString()
      },
      message: '已全部標記為已讀'
    });
  } catch (error) {
    console.error('Mark forum read error:', error);
    res.status(500).json({
      success: false,
      message: '標記失敗'
    });
  }
});

/**
 * POST /api/forums/:id/discussions/:discussionId/mark-read
 * 標記特定討論為已讀
 */
router.post('/:id/discussions/:discussionId/mark-read', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId } = req.params;
    const userId = req.user.userId;

    res.json({
      success: true,
      data: {
        forumId: id,
        discussionId,
        userId,
        markedAt: new Date().toISOString()
      },
      message: '討論已標記為已讀'
    });
  } catch (error) {
    console.error('Mark discussion read error:', error);
    res.status(500).json({
      success: false,
      message: '標記失敗'
    });
  }
});

// ==================== 帖子評分 ====================

/**
 * POST /api/forums/:id/discussions/:discussionId/posts/:postId/rate
 * 為帖子評分
 */
router.post('/:id/discussions/:discussionId/posts/:postId/rate', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId, postId } = req.params;
    const { rating } = req.body;
    const userId = req.user.userId;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: '評分必須在 1-5 之間'
      });
    }

    const ratingData = {
      postId,
      userId,
      rating,
      ratedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: ratingData,
      message: '評分成功'
    });
  } catch (error) {
    console.error('Rate post error:', error);
    res.status(500).json({
      success: false,
      message: '評分失敗'
    });
  }
});

/**
 * GET /api/forums/:id/discussions/:discussionId/posts/:postId/ratings
 * 取得帖子的評分統計
 */
router.get('/:id/discussions/:discussionId/posts/:postId/ratings', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;

    const ratings = {
      postId,
      averageRating: 4.2,
      totalRatings: 15,
      distribution: {
        5: 8,
        4: 4,
        3: 2,
        2: 1,
        1: 0
      }
    };

    res.json({
      success: true,
      data: ratings
    });
  } catch (error) {
    console.error('Get post ratings error:', error);
    res.status(500).json({
      success: false,
      message: '取得評分失敗'
    });
  }
});

// ==================== 帖子鎖定/置頂 ====================

/**
 * POST /api/forums/:id/discussions/:discussionId/pin
 * 置頂討論
 */
router.post('/:id/discussions/:discussionId/pin', authMiddleware, async (req, res) => {
  try {
    const { id, discussionId } = req.params;

    res.json({
      success: true,
      data: {
        discussionId,
        pinned: true,
        pinnedAt: new Date().toISOString(),
        pinnedBy: req.user.userId
      },
      message: '討論已置頂'
    });
  } catch (error) {
    console.error('Pin discussion error:', error);
    res.status(500).json({
      success: false,
      message: '置頂失敗'
    });
  }
});

/**
 * DELETE /api/forums/:id/discussions/:discussionId/pin
 * 取消置頂
 */
router.delete('/:id/discussions/:discussionId/pin', authMiddleware, async (req, res) => {
  try {
    const { discussionId } = req.params;

    res.json({
      success: true,
      data: {
        discussionId,
        pinned: false
      },
      message: '已取消置頂'
    });
  } catch (error) {
    console.error('Unpin discussion error:', error);
    res.status(500).json({
      success: false,
      message: '取消置頂失敗'
    });
  }
});

/**
 * POST /api/forums/:id/discussions/:discussionId/lock
 * 鎖定討論（禁止回覆）
 */
router.post('/:id/discussions/:discussionId/lock', authMiddleware, async (req, res) => {
  try {
    const { discussionId } = req.params;
    const { reason } = req.body;

    res.json({
      success: true,
      data: {
        discussionId,
        locked: true,
        lockedAt: new Date().toISOString(),
        lockedBy: req.user.userId,
        reason: reason || ''
      },
      message: '討論已鎖定'
    });
  } catch (error) {
    console.error('Lock discussion error:', error);
    res.status(500).json({
      success: false,
      message: '鎖定失敗'
    });
  }
});

/**
 * DELETE /api/forums/:id/discussions/:discussionId/lock
 * 解除鎖定
 */
router.delete('/:id/discussions/:discussionId/lock', authMiddleware, async (req, res) => {
  try {
    const { discussionId } = req.params;

    res.json({
      success: true,
      data: {
        discussionId,
        locked: false
      },
      message: '討論已解除鎖定'
    });
  } catch (error) {
    console.error('Unlock discussion error:', error);
    res.status(500).json({
      success: false,
      message: '解除鎖定失敗'
    });
  }
});

module.exports = router;
