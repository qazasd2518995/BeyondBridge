/**
 * 通知系統 API 處理器
 * BeyondBridge Education Platform - Notification System
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

function normalizeBadgeIconLabel(icon) {
  const normalized = String(icon || '').trim().toLowerCase();
  const labels = {
    trophy: 'TROPHY',
    award: 'TROPHY',
    star: 'STAR',
    'graduation-cap': 'CAP',
    graduationcap: 'CAP',
    cap: 'CAP',
    medal: 'MEDAL',
    gem: 'GEM',
    diamond: 'GEM',
    sparkles: 'SPARK',
    shiningstar: 'SPARK',
    books: 'BOOKS',
    book: 'BOOKS',
    target: 'TARGET'
  };
  return labels[normalized] || 'BADGE';
}

// ==================== 通知列表 ====================

/**
 * GET /api/notifications
 * 取得通知列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, type, limit = 50, offset = 0 } = req.query;

    let notifications = await db.query(`USER#${userId}`, {
      skPrefix: 'NOTIFICATION#',
      scanIndexForward: false // 最新的在前
    });

    // 狀態篩選
    if (status === 'unread') {
      notifications = notifications.filter(n => !n.readAt);
    } else if (status === 'read') {
      notifications = notifications.filter(n => n.readAt);
    }

    // 類型篩選
    if (type) {
      notifications = notifications.filter(n => n.type === type);
    }

    // 計算未讀數量
    const unreadCount = notifications.filter(n => !n.readAt).length;

    // 分頁
    const total = notifications.length;
    notifications = notifications.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // 清理資料
    notifications = notifications.map(n => {
      delete n.PK;
      delete n.SK;
      return n;
    });

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + notifications.length < total
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得通知失敗'
    });
  }
});

/**
 * GET /api/notifications/count
 * 取得未讀通知數量
 */
router.get('/count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const notifications = await db.query(`USER#${userId}`, {
      skPrefix: 'NOTIFICATION#'
    });

    const unreadCount = notifications.filter(n => !n.readAt).length;

    res.json({
      success: true,
      data: { unreadCount }
    });

  } catch (error) {
    console.error('Get notification count error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得通知數量失敗'
    });
  }
});

// ==================== 通知操作 ====================

/**
 * PUT /api/notifications/:id/read
 * 標記通知為已讀
 */
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 找到通知
    const notifications = await db.query(`USER#${userId}`, {
      skPrefix: 'NOTIFICATION#'
    });
    const notification = notifications.find(n => n.notificationId === id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'NOTIFICATION_NOT_FOUND',
        message: '找不到此通知'
      });
    }

    await db.updateItem(`USER#${userId}`, notification.SK, {
      readAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '通知已標記為已讀'
    });

  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '標記通知失敗'
    });
  }
});

/**
 * PUT /api/notifications/read-all
 * 標記所有通知為已讀
 */
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const notifications = await db.query(`USER#${userId}`, {
      skPrefix: 'NOTIFICATION#'
    });

    const unreadNotifications = notifications.filter(n => !n.readAt);
    const now = new Date().toISOString();

    for (const n of unreadNotifications) {
      await db.updateItem(`USER#${userId}`, n.SK, {
        readAt: now
      });
    }

    res.json({
      success: true,
      message: `已標記 ${unreadNotifications.length} 則通知為已讀`
    });

  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '標記通知失敗'
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * 刪除通知
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const notifications = await db.query(`USER#${userId}`, {
      skPrefix: 'NOTIFICATION#'
    });
    const notification = notifications.find(n => n.notificationId === id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'NOTIFICATION_NOT_FOUND',
        message: '找不到此通知'
      });
    }

    await db.deleteItem(`USER#${userId}`, notification.SK);

    res.json({
      success: true,
      message: '通知已刪除'
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除通知失敗'
    });
  }
});

/**
 * DELETE /api/notifications
 * 刪除所有已讀通知
 */
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const notifications = await db.query(`USER#${userId}`, {
      skPrefix: 'NOTIFICATION#'
    });

    const readNotifications = notifications.filter(n => n.readAt);

    for (const n of readNotifications) {
      await db.deleteItem(`USER#${userId}`, n.SK);
    }

    res.json({
      success: true,
      message: `已刪除 ${readNotifications.length} 則已讀通知`
    });

  } catch (error) {
    console.error('Delete read notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除通知失敗'
    });
  }
});

// ==================== 通知偏好設定 ====================

/**
 * GET /api/notifications/preferences
 * 取得通知偏好設定
 */
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await db.getUser(userId);
    const preferences = user?.preferences?.notifications || {
      email: {
        enabled: true,
        assignmentDue: true,
        gradePosted: true,
        forumReply: true,
        courseAnnouncement: true
      },
      push: {
        enabled: false
      },
      digest: {
        enabled: false,
        frequency: 'daily' // daily, weekly
      }
    };

    res.json({
      success: true,
      data: preferences
    });

  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得設定失敗'
    });
  }
});

/**
 * PUT /api/notifications/preferences
 * 更新通知偏好設定
 */
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const preferences = req.body;

    const user = await db.getUser(userId);
    const updatedPreferences = {
      ...(user?.preferences || {}),
      notifications: preferences
    };

    await db.updateItem(`USER#${userId}`, 'PROFILE', {
      preferences: updatedPreferences,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '通知設定已更新',
      data: preferences
    });

  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新設定失敗'
    });
  }
});

// ==================== 發送通知的輔助函數 ====================

// 載入 Email 工具
const emailUtils = require('../utils/email');

// 預設通知偏好設定
const DEFAULT_NOTIFICATION_PREFERENCES = {
  // 站內通知（預設全部啟用）
  inApp: {
    assignment_due: true,
    grade_posted: true,
    forum_reply: true,
    announcement: true,
    course_update: true,
    quiz_available: true,
    badge_earned: true,
    path_completed: true,
    discussion_mention: true
  },
  // Email 通知（預設部分啟用）
  email: {
    assignment_due: true,
    grade_posted: true,
    forum_reply: false,
    announcement: true,
    course_update: false,
    quiz_available: true,
    badge_earned: true,
    path_completed: true,
    discussion_mention: false
  },
  // Email 摘要設定
  emailDigest: {
    enabled: false,
    frequency: 'daily' // daily, weekly
  }
};

/**
 * 取得用戶通知偏好設定
 */
async function getUserNotificationPreferences(userId) {
  try {
    const user = await db.getUser(userId);
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(user?.preferences?.notifications || {})
    };
  } catch (error) {
    console.error('Get user notification preferences error:', error);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * 建立並發送通知
 * 這個函數可以被其他模組調用
 * 會根據用戶偏好決定是否同時發送 Email
 */
async function createNotification({
  userId,
  type, // assignment_due, grade_posted, forum_reply, announcement, course_update, etc.
  title,
  message,
  link,
  metadata = {},
  sendEmail = true // 是否嘗試發送 Email（會受用戶偏好影響）
}) {
  try {
    const notificationId = db.generateId('notif');
    const now = new Date().toISOString();

    // 取得用戶偏好
    const preferences = await getUserNotificationPreferences(userId);

    // 建立站內通知（如果用戶允許）
    let notificationItem = null;
    if (preferences.inApp[type] !== false) {
      notificationItem = {
        PK: `USER#${userId}`,
        SK: `NOTIFICATION#${now}#${notificationId}`,
        entityType: 'NOTIFICATION',

        notificationId,
        type,
        title,
        message,
        link,
        metadata,

        readAt: null,
        createdAt: now
      };

      await db.putItem(notificationItem);
    }

    // 發送 Email（如果用戶允許且開啟了 sendEmail）
    if (sendEmail && preferences.email[type] === true) {
      try {
        const user = await db.getUser(userId);
        if (user && user.email) {
          // 根據通知類型選擇對應的 Email 模板
          await sendNotificationEmail(user, type, title, message, link, metadata);
        }
      } catch (emailError) {
        // Email 發送失敗不應影響通知建立
        console.error('Send notification email error:', emailError);
      }
    }

    return notificationItem;
  } catch (error) {
    console.error('Create notification error:', error);
    throw error;
  }
}

/**
 * 根據通知類型發送對應的 Email
 */
async function sendNotificationEmail(user, type, title, message, link, metadata) {
  const PLATFORM_URL = process.env.PLATFORM_URL || 'https://beyondbridge.onrender.com';

  // 根據類型選擇 Email 模板
  switch (type) {
    case 'assignment_due':
      if (metadata.assignment && metadata.course) {
        await emailUtils.sendAssignmentReminder(user, metadata.assignment, metadata.course);
      } else {
        await sendGenericNotificationEmail(user, title, message, link);
      }
      break;

    case 'grade_posted':
      if (metadata.gradeData) {
        await emailUtils.sendGradeNotification(user, metadata.gradeData);
      } else {
        await sendGenericNotificationEmail(user, title, message, link);
      }
      break;

    case 'forum_reply':
      if (metadata.post && metadata.reply) {
        await emailUtils.sendDiscussionReplyNotification(user, metadata.post, metadata.reply);
      } else {
        await sendGenericNotificationEmail(user, title, message, link);
      }
      break;

    case 'announcement':
      // 使用通用通知 Email
      await sendGenericNotificationEmail(user, title, message, link);
      break;

    case 'quiz_available':
      if (metadata.quiz && metadata.course) {
        await emailUtils.sendQuizReminder(user, metadata.quiz, metadata.course);
      } else {
        await sendGenericNotificationEmail(user, title, message, link);
      }
      break;

    case 'badge_earned':
      await sendBadgeEarnedEmail(user, title, message, metadata);
      break;

    case 'path_completed':
      await sendPathCompletedEmail(user, title, message, metadata);
      break;

    default:
      await sendGenericNotificationEmail(user, title, message, link);
  }
}

/**
 * 發送通用通知 Email
 */
async function sendGenericNotificationEmail(user, title, message, link) {
  const PLATFORM_URL = process.env.PLATFORM_URL || 'https://beyondbridge.onrender.com';

  const content = `
    <h2 style="margin: 0 0 20px; color: #4F46E5; font-size: 20px;">
      ${title}
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 20px; color: #4a4a4a; line-height: 1.6;">
      ${message}
    </p>
    ${link ? `
    <div style="text-align: center; margin: 30px 0;">
      ${emailUtils.buttonStyle('查看詳情', link.startsWith('http') ? link : `${PLATFORM_URL}${link}`)}
    </div>
    ` : ''}
  `;

  await emailUtils.sendEmail(
    user.email,
    `[BeyondBridge] ${title}`,
    emailUtils.emailTemplate(title, content)
  );
}

/**
 * 發送徽章獲得 Email
 */
async function sendBadgeEarnedEmail(user, title, message, metadata) {
  const PLATFORM_URL = process.env.PLATFORM_URL || 'https://beyondbridge.onrender.com';

  const content = `
    <h2 style="margin: 0 0 20px; color: #f59e0b; font-size: 20px;">
      🎖️ ${title}
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 20px; color: #4a4a4a; line-height: 1.6;">
      恭喜！${message}
    </p>
    ${metadata.badge ? `
    <div style="text-align: center; margin: 30px 0; padding: 30px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px;">
      <div style="margin-bottom: 10px;">${metadata.badge.image ? `<img src="${metadata.badge.image}" style="width: 80px; height: 80px; border-radius: 50%;">` : `<div style="display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; border-radius: 24px; background: rgba(255,255,255,0.72); color: #92400e; font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">${normalizeBadgeIconLabel(metadata.badge.icon)}</div>`}</div>
      <div style="font-size: 24px; font-weight: bold; color: #92400e;">${metadata.badge.name}</div>
      <div style="color: #a16207; margin-top: 10px;">${metadata.badge.description || ''}</div>
    </div>
    ` : ''}
    <div style="text-align: center; margin: 30px 0;">
      ${emailUtils.buttonStyle('查看我的徽章', `${PLATFORM_URL}/platform/#badges`, '#f59e0b')}
    </div>
  `;

  await emailUtils.sendEmail(
    user.email,
    `[BeyondBridge] 恭喜獲得新徽章！`,
    emailUtils.emailTemplate('徽章獲得通知', content)
  );
}

/**
 * 發送學習路徑完成 Email
 */
async function sendPathCompletedEmail(user, title, message, metadata) {
  const PLATFORM_URL = process.env.PLATFORM_URL || 'https://beyondbridge.onrender.com';

  const content = `
    <h2 style="margin: 0 0 20px; color: #10b981; font-size: 20px;">
      🎉 ${title}
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 20px; color: #4a4a4a; line-height: 1.6;">
      太棒了！${message}
    </p>
    ${metadata.path ? `
    <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
      <h3 style="margin: 0 0 10px; color: #065f46;">${metadata.path.name}</h3>
      <p style="margin: 0; color: #047857;">${metadata.path.description || ''}</p>
      ${metadata.path.coursesCompleted ? `
      <p style="margin: 10px 0 0; color: #065f46; font-weight: 600;">
        完成課程數: ${metadata.path.coursesCompleted}
      </p>
      ` : ''}
    </div>
    ` : ''}
    <div style="text-align: center; margin: 30px 0;">
      ${emailUtils.buttonStyle('探索更多學習路徑', `${PLATFORM_URL}/platform/#learning-paths`, '#10b981')}
    </div>
  `;

  await emailUtils.sendEmail(
    user.email,
    `[BeyondBridge] 恭喜完成學習路徑！`,
    emailUtils.emailTemplate('學習路徑完成', content)
  );
}

/**
 * 批量發送通知給多個用戶
 */
async function sendBulkNotifications({
  userIds,
  type,
  title,
  message,
  link,
  metadata = {}
}) {
  try {
    const notifications = [];
    const now = new Date();

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const notificationId = db.generateId('notif');
      const timestamp = new Date(now.getTime() + i).toISOString(); // 確保唯一性

      notifications.push({
        PK: `USER#${userId}`,
        SK: `NOTIFICATION#${timestamp}#${notificationId}`,
        entityType: 'NOTIFICATION',

        notificationId,
        type,
        title,
        message,
        link,
        metadata,

        readAt: null,
        createdAt: timestamp
      });
    }

    // 批量寫入
    if (notifications.length > 0) {
      await db.batchWrite(notifications);
    }

    return notifications.length;
  } catch (error) {
    console.error('Send bulk notifications error:', error);
    throw error;
  }
}

/**
 * 發送課程相關通知給所有學生
 */
async function notifyCourseStudents({
  courseId,
  type,
  title,
  message,
  link,
  metadata = {},
  excludeUserId
}) {
  try {
    // 取得所有已報名的學生
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${courseId}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    let userIds = enrollments.map(e => e.userId);

    // 排除特定用戶（例如發起者自己）
    if (excludeUserId) {
      userIds = userIds.filter(id => id !== excludeUserId);
    }

    if (userIds.length === 0) {
      return 0;
    }

    return await sendBulkNotifications({
      userIds,
      type,
      title,
      message,
      link,
      metadata: { ...metadata, courseId }
    });
  } catch (error) {
    console.error('Notify course students error:', error);
    throw error;
  }
}

// 匯出通知工具函數供其他模組使用
router.createNotification = createNotification;
router.sendBulkNotifications = sendBulkNotifications;
router.notifyCourseStudents = notifyCourseStudents;

module.exports = router;
