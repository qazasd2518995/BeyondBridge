/**
 * 討論區系統 API 處理器
 * BeyondBridge Education Platform - Moodle-style Forum System
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { canManageCourse } = require('../utils/course-access');
const { syncCourseActivityLink, deleteCourseActivityLink } = require('../utils/course-activities');

function buildDiscussionPreview(content) {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function getDiscussionSortTime(discussion) {
  return discussion?.lastReplyAt || discussion?.createdAt || discussion?.updatedAt || null;
}

function normalizeDiscussionIndexRow(row) {
  if (!row) return null;
  return {
    discussionId: row.discussionId,
    forumId: row.forumId,
    title: row.title || '',
    subject: row.subject || row.title || '',
    message: row.message || row.contentPreview || row.content || '',
    authorId: row.authorId || null,
    authorName: row.authorName || '未知用戶',
    authorRole: row.authorRole || null,
    pinned: !!row.pinned,
    locked: !!row.locked,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    replyCount: Number(row.replyCount || 0),
    lastReply: row.lastReplyAt || null,
    latestReply: row.lastReplyAt ? {
      authorName: row.lastReplyByName || row.authorName || '未知用戶',
      createdAt: row.lastReplyAt
    } : null
  };
}

async function getForumSubscriptionMap(userId) {
  if (!userId) return new Map();
  const rows = await db.queryByIndex('GSI1', `USER#${userId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'FORUM_SUBSCRIPTION#',
    projection: ['forumId', 'subscribed']
  });
  return new Map(rows.filter(row => row?.forumId).map(row => [row.forumId, row]));
}

function summarizeForumFromIndices(forum, discussionRows) {
  const normalizedRows = discussionRows.map(normalizeDiscussionIndexRow).filter(Boolean);
  const hasStoredDiscussionCount = Number.isFinite(Number(forum.stats?.discussionCount));
  const hasStoredPostCount = Number.isFinite(Number(forum.stats?.postCount));
  const discussionCount = hasStoredDiscussionCount ? Number(forum.stats?.discussionCount) : normalizedRows.length;
  const postCount = hasStoredPostCount
    ? Number(forum.stats?.postCount)
    : normalizedRows.reduce((sum, row) => sum + Number(row.replyCount || 0), 0);

  const latestDiscussion = normalizedRows
    .slice()
    .sort((a, b) => new Date(getDiscussionSortTime(b) || 0) - new Date(getDiscussionSortTime(a) || 0))[0];

  return {
    discussionCount,
    postCount,
    latestDiscussion: latestDiscussion ? {
      title: latestDiscussion.title,
      createdAt: getDiscussionSortTime(latestDiscussion),
      authorName: latestDiscussion.latestReply?.authorName || latestDiscussion.authorName
    } : null
  };
}

async function deleteDiscussionGraph(discussionId) {
  const discussionItems = await db.query(`DISCUSSION#${discussionId}`);
  const postRows = discussionItems.filter(item => String(item?.SK || '').startsWith('POST#'));
  const ratingGroups = await Promise.all(
    postRows
      .filter(item => item?.postId)
      .map(async post => db.query(`POST#${post.postId}`, { skPrefix: 'RATING#' }))
  );

  const deleteKeys = [
    ...discussionItems.map(item => ({ PK: item.PK, SK: item.SK })),
    ...ratingGroups.flat().map(item => ({ PK: item.PK, SK: item.SK }))
  ];

  if (deleteKeys.length > 0) {
    await db.batchDelete(deleteKeys);
  }

  return {
    postCount: postRows.length
  };
}

// ==================== 討論區列表與詳情 ====================

/**
 * GET /api/forums
 * 取得討論區列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isAdmin = !!req.user.isAdmin;
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

    if (!isAdmin) {
      const [progressList, teachingCourses] = await Promise.all([
        db.getUserCourseProgress(userId),
        db.scan({
          filter: {
            expression: 'entityType = :type AND (instructorId = :userId OR teacherId = :userId OR creatorId = :userId OR createdBy = :userId OR contains(instructors, :userId))',
            values: {
              ':type': 'COURSE',
              ':userId': userId
            }
          }
        })
      ]);

      const allowedCourseIds = new Set([
        ...progressList.map(item => item.courseId).filter(Boolean),
        ...teachingCourses.map(item => item.courseId).filter(Boolean)
      ]);
      forums = forums.filter(f => allowedCourseIds.has(f.courseId));
    }

    const [forumDiscussionRows, subscriptionMap] = await Promise.all([
      Promise.all(
        forums.map(f => db.query(`FORUM#${f.forumId}`, {
          skPrefix: 'DISCUSSION#',
          projection: [
            'discussionId',
            'forumId',
            'title',
            'authorName',
            'authorRole',
            'pinned',
            'replyCount',
            'lastReplyAt',
            'lastReplyByName',
            'contentPreview',
            'createdAt',
            'updatedAt'
          ]
        }))
      ),
      getForumSubscriptionMap(userId)
    ]);

    const forumsWithStats = await Promise.all(
      forums.map(async (f, index) => {
        const discussions = forumDiscussionRows[index] || [];
        const summary = summarizeForumFromIndices(f, discussions);
        const storedSubscription = subscriptionMap.get(f.forumId);
        const defaultSubscribed = f.subscriptionMode === 'forced' || f.subscriptionMode === 'auto';
        const subscribed = storedSubscription
          ? storedSubscription.subscribed !== false
          : defaultSubscribed;

        delete f.PK;
        delete f.SK;
        return {
          ...f,
          discussionCount: summary.discussionCount,
          postCount: summary.postCount,
          replyCount: summary.postCount,
          subscribed,
          stats: {
            discussionCount: summary.discussionCount,
            postCount: summary.postCount,
            replyCount: summary.postCount,
            latestDiscussion: summary.latestDiscussion
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
    const userId = req.user.userId;
    const { page = 1, limit = 20, sort = 'latest' } = req.query;

    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }
    const forum = context.forum;

    // 取得討論列表（直接使用論壇索引，避免逐討論查貼文）
    let discussions = await db.query(`FORUM#${id}`, {
      skPrefix: 'DISCUSSION#',
      projection: [
        'discussionId',
        'forumId',
        'title',
        'authorId',
        'authorName',
        'authorRole',
        'pinned',
        'locked',
        'contentPreview',
        'replyCount',
        'lastReplyAt',
        'lastReplyByName',
        'createdAt',
        'updatedAt'
      ]
    });
    discussions = discussions.map(normalizeDiscussionIndexRow).filter(Boolean);

    // 排序
    if (sort === 'latest') {
      discussions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'active') {
      discussions.sort((a, b) => {
        const aLatest = getDiscussionSortTime(a);
        const bLatest = getDiscussionSortTime(b);
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

    if (!canManageCourse(course, req.user)) {
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
    if (!canManageCourse(course, req.user)) {
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

    await syncCourseActivityLink(forum.courseId, id, {
      title: updatedForum.title || forum.title,
      description: updatedForum.description || forum.description,
      visible: updatedForum.visible !== false
    });

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
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此討論區'
      });
    }

    const forumItems = await db.query(`FORUM#${id}`);
    const discussionIndexRows = forumItems.filter(item => String(item?.SK || '').startsWith('DISCUSSION#'));
    await Promise.all(
      discussionIndexRows
        .filter(row => row?.discussionId)
        .map(row => deleteDiscussionGraph(row.discussionId))
    );

    if (forumItems.length > 0) {
      await db.batchDelete(forumItems.map(item => ({ PK: item.PK, SK: item.SK })));
    }
    await deleteCourseActivityLink(forum.courseId, id);

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

    const [storedSubscription, rawPosts] = await Promise.all([
      db.getItem(`DISCUSSION#${discussionId}`, `SUBSCRIPTION#${userId}`),
      db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' })
    ]);

    // 取得回覆
    let posts = rawPosts;

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
      message: p.message || p.content || '',
      isOwner: p.authorId === userId
    }));

    res.json({
      success: true,
      data: {
        ...discussion,
        subject: discussion.subject || discussion.title || '',
        message: discussion.message || discussion.content || '',
        isOwner: discussion.authorId === userId,
        subscribed: storedSubscription ? storedSubscription.subscribed !== false : false,
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
      title: rawTitle,
      subject,
      content: rawContent,
      message,
      attachments = [],
      pinned = false
    } = req.body;
    const title = String(rawTitle || subject || '').trim();
    const content = String(rawContent || message || '').trim();

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
    const isInstructor = canManageCourse(course, req.user);

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
      replyCount: 0,
      lastReplyAt: null,
      lastReplyBy: null,
      lastReplyByName: null,

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
      forumId: id,
      courseId: forum.courseId,
      title,
      contentPreview: buildDiscussionPreview(content),
      authorId: userId,
      authorName: user?.displayName || '未知用戶',
      authorRole: isInstructor ? 'instructor' : 'student',
      pinned: canPin && pinned,
      locked: false,
      replyCount: 0,
      lastReplyAt: null,
      lastReplyByName: null,
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
      data: {
        ...discussionItem,
        subject: discussionItem.title,
        message: discussionItem.content
      }
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
    const updates = { ...req.body };

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
    const isInstructor = canManageCourse(course, req.user);
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
    if (updates.subject && !updates.title) updates.title = updates.subject;
    if (updates.message && !updates.content) updates.content = updates.message;
    delete updates.subject;
    delete updates.message;

    // 只有教師可以置頂/鎖定
    if (!isInstructor && !req.user.isAdmin) {
      delete updates.pinned;
      delete updates.locked;
    }

    updates.updatedAt = new Date().toISOString();

    const updatedDiscussion = await db.updateItem(`DISCUSSION#${discussionId}`, 'META', updates);

    // 更新討論區中的索引
    if (updates.title || updates.content !== undefined || updates.pinned !== undefined || updates.locked !== undefined) {
      await db.updateItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`, {
        title: updates.title || discussion.title,
        contentPreview: updates.content !== undefined ? buildDiscussionPreview(updates.content) : buildDiscussionPreview(discussion.content),
        pinned: updates.pinned !== undefined ? updates.pinned : discussion.pinned,
        locked: updates.locked !== undefined ? updates.locked : discussion.locked,
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
    const isInstructor = canManageCourse(course, req.user);
    const isAuthor = discussion.authorId === userId;

    if (!isAuthor && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此討論'
      });
    }

    const deletedDiscussion = await deleteDiscussionGraph(discussionId);
    await db.deleteItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`);

    // 更新討論區統計
    await db.updateItem(`FORUM#${id}`, 'META', {
      'stats.discussionCount': Math.max(0, (forum.stats?.discussionCount || 1) - 1),
      'stats.postCount': Math.max(0, (forum.stats?.postCount || deletedDiscussion.postCount) - deletedDiscussion.postCount),
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
      content: rawContent,
      message,
      parentPostId, // 回覆特定貼文（巢狀回覆）
      attachments = []
    } = req.body;
    const content = String(rawContent || message || '').trim();

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
    const isInstructor = canManageCourse(course, req.user);

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
      replyCount: (discussion.replyCount || 0) + 1,
      lastReplyAt: now,
      lastReplyBy: userId,
      lastReplyByName: user?.displayName || '未知用戶',
      updatedAt: now
    });

    await db.updateItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`, {
      replyCount: (discussion.replyCount || 0) + 1,
      lastReplyAt: now,
      lastReplyByName: user?.displayName || '未知用戶',
      updatedAt: now
    });

    delete postItem.PK;
    delete postItem.SK;

    res.status(201).json({
      success: true,
      message: '回覆成功',
      data: {
        ...postItem,
        message: postItem.content
      }
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
    const isInstructor = canManageCourse(course, req.user);
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
    const discussion = await db.getItem(`DISCUSSION#${discussionId}`, 'META');

    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

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
    const isInstructor = canManageCourse(course, req.user);
    const isAuthor = post.authorId === userId;

    if (!isAuthor && !isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此回覆'
      });
    }

    await db.deleteItem(`DISCUSSION#${discussionId}`, post.SK);

    const remainingPosts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
    const latestPost = remainingPosts
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const now = new Date().toISOString();

    // 更新討論區統計
    await db.updateItem(`FORUM#${id}`, 'META', {
      'stats.postCount': Math.max(0, (forum.stats?.postCount || 1) - 1),
      updatedAt: now
    });

    await db.updateItem(`DISCUSSION#${discussionId}`, 'META', {
      replyCount: Math.max(0, (discussion.replyCount || 1) - 1),
      lastReplyAt: latestPost?.createdAt || null,
      lastReplyBy: latestPost?.authorId || null,
      lastReplyByName: latestPost?.authorName || null,
      updatedAt: now
    });

    await db.updateItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`, {
      replyCount: Math.max(0, (discussion.replyCount || 1) - 1),
      lastReplyAt: latestPost?.createdAt || null,
      lastReplyByName: latestPost?.authorName || null,
      updatedAt: now
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

function isCourseInstructor(course, userId) {
  if (!course || !userId) return false;
  return canManageCourse(course, { userId, isAdmin: false });
}

function parseTime(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

async function getForumAccessContext(forumId, userId, isAdmin = false) {
  const forum = await db.getItem(`FORUM#${forumId}`, 'META');
  if (!forum) {
    return { ok: false, status: 404, error: 'FORUM_NOT_FOUND', message: '找不到此討論區' };
  }

  const course = await db.getItem(`COURSE#${forum.courseId}`, 'META');
  const instructor = isCourseInstructor(course, userId);
  const enrollment = await db.getItem(`USER#${userId}`, `PROG#COURSE#${forum.courseId}`);
  const enrolled = !!enrollment;
  const canAccess = isAdmin || instructor || enrolled;

  if (!canAccess) {
    return { ok: false, status: 403, error: 'FORBIDDEN', message: '沒有權限存取此討論區' };
  }

  return { ok: true, forum, course, isInstructor: instructor, isEnrolled: enrolled };
}

async function getDiscussionInForum(forumId, discussionId) {
  const discussion = await db.getItem(`DISCUSSION#${discussionId}`, 'META');
  if (!discussion) return null;
  if (discussion.forumId !== forumId) return null;
  return discussion;
}

function buildRatingSummary(ratings) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;

  ratings.forEach(item => {
    const value = Number(item.rating);
    if (Number.isNaN(value) || value < 1 || value > 5) return;
    distribution[value] = (distribution[value] || 0) + 1;
    total++;
    sum += value;
  });

  return {
    totalRatings: total,
    averageRating: total > 0 ? Math.round((sum / total) * 100) / 100 : 0,
    distribution
  };
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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const { forum } = context;
    const stored = await db.getItem(`FORUM#${id}`, `SUBSCRIPTION#${userId}`);
    const now = new Date().toISOString();

    let defaultSubscribed = false;
    let defaultType = 'none';
    let defaultNotify = true;

    if (forum.subscriptionMode === 'forced') {
      defaultSubscribed = true;
      defaultType = 'all_posts';
    } else if (forum.subscriptionMode === 'auto') {
      defaultSubscribed = true;
      defaultType = 'all_posts';
    } else if (forum.subscriptionMode === 'disabled') {
      defaultSubscribed = false;
      defaultType = 'none';
      defaultNotify = false;
    }

    const subscription = {
      forumId: id,
      userId,
      subscribed: stored ? stored.subscribed !== false : defaultSubscribed,
      subscriptionType: stored?.subscriptionType || defaultType,
      emailNotification: stored?.emailNotification ?? defaultNotify,
      subscribedAt: stored?.subscribedAt || now,
      updatedAt: stored?.updatedAt || now
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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    if (context.forum.subscriptionMode === 'disabled') {
      return res.status(403).json({
        success: false,
        error: 'SUBSCRIPTION_DISABLED',
        message: '此討論區不允許訂閱'
      });
    }

    const allowedTypes = new Set(['all_posts', 'first_post_only', 'none']);
    if (!allowedTypes.has(subscriptionType)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '無效的訂閱類型'
      });
    }

    const now = new Date().toISOString();
    const stored = await db.getItem(`FORUM#${id}`, `SUBSCRIPTION#${userId}`);
    const normalizedType = context.forum.subscriptionMode === 'forced' ? 'all_posts' : subscriptionType;

    await db.putItem({
      PK: `FORUM#${id}`,
      SK: `SUBSCRIPTION#${userId}`,
      entityType: 'FORUM_SUBSCRIPTION',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `FORUM_SUBSCRIPTION#${id}`,
      forumId: id,
      userId,
      subscribed: true,
      subscriptionType: normalizedType,
      emailNotification: !!emailNotification,
      subscribedAt: stored?.subscribedAt || now,
      updatedAt: now
    });

    const subscription = {
      forumId: id,
      userId,
      subscribed: true,
      subscriptionType: normalizedType,
      emailNotification: !!emailNotification,
      subscribedAt: stored?.subscribedAt || now,
      updatedAt: now
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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    if (context.forum.subscriptionMode === 'forced') {
      return res.status(403).json({
        success: false,
        error: 'SUBSCRIPTION_FORCED',
        message: '此討論區為強制訂閱，無法取消'
      });
    }

    await db.deleteItem(`FORUM#${id}`, `SUBSCRIPTION#${userId}`);

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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const now = new Date().toISOString();
    const stored = await db.getItem(`DISCUSSION#${discussionId}`, `SUBSCRIPTION#${userId}`);
    await db.putItem({
      PK: `DISCUSSION#${discussionId}`,
      SK: `SUBSCRIPTION#${userId}`,
      entityType: 'DISCUSSION_SUBSCRIPTION',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `DISCUSSION_SUBSCRIPTION#${discussionId}`,
      forumId: id,
      discussionId,
      userId,
      subscribed: true,
      subscribedAt: stored?.subscribedAt || now,
      updatedAt: now
    });

    const subscription = {
      forumId: id,
      discussionId,
      userId,
      subscribed: true,
      subscribedAt: stored?.subscribedAt || now,
      updatedAt: now
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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    await db.deleteItem(`DISCUSSION#${discussionId}`, `SUBSCRIPTION#${userId}`);

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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const forumReadState = await db.getItem(`FORUM#${id}`, `READ#${userId}`);
    const forumReadTs = parseTime(forumReadState?.lastReadAt) || 0;

    const discussions = await db.query(`FORUM#${id}`, { skPrefix: 'DISCUSSION#' });
    const unreadDiscussions = [];
    let totalUnread = 0;

    for (const discussionIndex of discussions) {
      const discussionId = discussionIndex.discussionId;
      if (!discussionId) continue;

      const discussion = await db.getItem(`DISCUSSION#${discussionId}`, 'META');
      if (!discussion) continue;

      const discussionReadState = await db.getItem(`DISCUSSION#${discussionId}`, `READ#${userId}`);
      const discussionReadTs = parseTime(discussionReadState?.lastReadAt) || forumReadTs;

      const posts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
      const unreadReplies = posts.filter(post => {
        const postTs = parseTime(post.createdAt);
        return postTs && postTs > discussionReadTs && post.authorId !== userId;
      });

      const discussionCreatedTs = parseTime(discussion.createdAt);
      const unreadDiscussionSelf = discussion.authorId !== userId &&
        discussionCreatedTs &&
        discussionCreatedTs > discussionReadTs ? 1 : 0;

      const unreadPosts = unreadReplies.length + unreadDiscussionSelf;
      if (unreadPosts <= 0) continue;

      const latestPost = posts
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

      unreadDiscussions.push({
        discussionId,
        title: discussion.title || discussionIndex.title || '未命名討論',
        unreadPosts,
        lastPostAt: latestPost?.createdAt || discussion.lastReplyAt || discussion.createdAt,
        lastPostBy: latestPost?.authorName || discussion.lastReplyByName || discussion.authorName || '未知用戶'
      });
      totalUnread += unreadPosts;
    }

    unreadDiscussions.sort((a, b) => new Date(b.lastPostAt) - new Date(a.lastPostAt));

    const unreadData = {
      forumId: id,
      userId,
      totalUnread,
      unreadDiscussions
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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const markedAt = new Date().toISOString();
    await db.putItem({
      PK: `FORUM#${id}`,
      SK: `READ#${userId}`,
      entityType: 'FORUM_READ_STATE',
      forumId: id,
      userId,
      lastReadAt: markedAt,
      markedAt,
      updatedAt: markedAt
    });

    res.json({
      success: true,
      data: {
        forumId: id,
        userId,
        markedAt
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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const markedAt = new Date().toISOString();
    await db.putItem({
      PK: `DISCUSSION#${discussionId}`,
      SK: `READ#${userId}`,
      entityType: 'DISCUSSION_READ_STATE',
      forumId: id,
      discussionId,
      userId,
      lastReadAt: markedAt,
      markedAt,
      updatedAt: markedAt
    });

    res.json({
      success: true,
      data: {
        forumId: id,
        discussionId,
        userId,
        markedAt
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
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: '評分必須在 1-5 之間'
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const posts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
    const post = posts.find(p => p.postId === postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此回覆'
      });
    }

    const now = new Date().toISOString();
    await db.putItem({
      PK: `POST#${postId}`,
      SK: `RATING#${userId}`,
      entityType: 'FORUM_POST_RATING',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `POST_RATING#${postId}`,
      forumId: id,
      discussionId,
      postId,
      userId,
      rating: Number(rating),
      ratedAt: now,
      updatedAt: now
    });

    const allRatings = await db.query(`POST#${postId}`, { skPrefix: 'RATING#' });
    const summary = buildRatingSummary(allRatings);
    await db.updateItem(`DISCUSSION#${discussionId}`, post.SK, {
      ratingAverage: summary.averageRating,
      ratingCount: summary.totalRatings,
      updatedAt: now
    });

    const ratingData = {
      postId,
      userId,
      rating: Number(rating),
      ratedAt: now
    };

    res.json({
      success: true,
      data: ratingData,
      stats: summary,
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
    const { id, discussionId, postId } = req.params;
    const userId = req.user.userId;
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const posts = await db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
    const post = posts.find(p => p.postId === postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'POST_NOT_FOUND',
        message: '找不到此回覆'
      });
    }

    const ratingRows = await db.query(`POST#${postId}`, { skPrefix: 'RATING#' });
    const summary = buildRatingSummary(ratingRows);
    const myRating = ratingRows.find(r => r.userId === userId)?.rating || null;

    const ratings = {
      postId,
      averageRating: summary.averageRating,
      totalRatings: summary.totalRatings,
      distribution: summary.distribution,
      myRating
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
    const userId = req.user.userId;
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    if (!context.isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有教師可置頂討論'
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const now = new Date().toISOString();
    await db.updateItem(`DISCUSSION#${discussionId}`, 'META', {
      pinned: true,
      pinnedAt: now,
      pinnedBy: userId,
      updatedAt: now
    });
    await db.updateItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`, {
      pinned: true,
      updatedAt: now
    });

    res.json({
      success: true,
      data: {
        discussionId,
        pinned: true,
        pinnedAt: now,
        pinnedBy: userId
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
    const { id, discussionId } = req.params;
    const userId = req.user.userId;
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    if (!context.isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有教師可取消置頂'
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const now = new Date().toISOString();
    await db.updateItem(`DISCUSSION#${discussionId}`, 'META', {
      pinned: false,
      pinnedAt: null,
      pinnedBy: null,
      updatedAt: now
    });
    await db.updateItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`, {
      pinned: false,
      updatedAt: now
    });

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
    const { id, discussionId } = req.params;
    const userId = req.user.userId;
    const { reason } = req.body;
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    if (!context.isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有教師可鎖定討論'
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const now = new Date().toISOString();
    await db.updateItem(`DISCUSSION#${discussionId}`, 'META', {
      locked: true,
      lockReason: reason || '',
      lockedAt: now,
      lockedBy: userId,
      updatedAt: now
    });
    await db.updateItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`, {
      locked: true,
      updatedAt: now
    });

    res.json({
      success: true,
      data: {
        discussionId,
        locked: true,
        lockedAt: now,
        lockedBy: userId,
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
    const { id, discussionId } = req.params;
    const userId = req.user.userId;
    const context = await getForumAccessContext(id, userId, req.user.isAdmin);
    if (!context.ok) {
      return res.status(context.status).json({
        success: false,
        error: context.error,
        message: context.message
      });
    }

    if (!context.isInstructor && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '只有教師可解除鎖定'
      });
    }

    const discussion = await getDiscussionInForum(id, discussionId);
    if (!discussion) {
      return res.status(404).json({
        success: false,
        error: 'DISCUSSION_NOT_FOUND',
        message: '找不到此討論'
      });
    }

    const now = new Date().toISOString();
    await db.updateItem(`DISCUSSION#${discussionId}`, 'META', {
      locked: false,
      lockReason: null,
      lockedAt: null,
      lockedBy: null,
      updatedAt: now
    });
    await db.updateItem(`FORUM#${id}`, `DISCUSSION#${discussionId}`, {
      locked: false,
      updatedAt: now
    });

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
