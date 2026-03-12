/**
 * 徽章系統 API
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

const BADGE_TYPES = {
  course: '課程徽章',
  site: '站台徽章',
  manual: '手動徽章',
  course_completion: '課程完成',
  activity_completion: '活動完成',
  grade_threshold: '成績門檻',
  competency: '能力達成',
  time_based: '時間條件'
};

const BADGE_STATUS = {
  draft: '草稿',
  active: '啟用中',
  disabled: '已停用'
};

function isTeachingUser(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return TEACHING_ROLES.has(user.role);
}

function canManageBadge(badge, user) {
  if (!badge || !user) return false;
  if (user.isAdmin) return true;
  if (!isTeachingUser(user)) return false;
  return !badge.createdBy || badge.createdBy === user.userId;
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCriteria(criteria) {
  if (Array.isArray(criteria)) {
    return criteria.map(item => ({
      type: item.type || 'manual',
      description: item.description || '',
      ...item
    }));
  }

  if (criteria && typeof criteria === 'object') {
    return [{
      type: criteria.type || 'manual',
      description: criteria.description || '',
      ...criteria
    }];
  }

  if (typeof criteria === 'string') {
    return [{ type: 'manual', description: criteria }];
  }

  return [];
}

function normalizeBadge(item) {
  const badgeId = item.badgeId || item.id;
  return {
    id: badgeId,
    badgeId,
    name: item.name || '',
    description: item.description || '',
    icon: item.icon || '🏆',
    color: item.color || '#f59e0b',
    image: item.image || '',
    type: item.type || 'manual',
    status: item.status || 'draft',
    criteria: normalizeCriteria(item.criteria),
    courseId: item.courseId || null,
    expiry: item.expiry || null,
    issuedCount: parseInteger(item.issuedCount, 0, { min: 0 }),
    createdBy: item.createdBy || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

async function getBadgeById(badgeId) {
  const direct = await db.getItem(`BADGE#${badgeId}`, 'META');
  if (direct && direct.entityType === 'BADGE' && direct.status !== 'deleted') return direct;

  const fallback = await db.scan({
    filter: {
      expression: 'entityType = :type AND badgeId = :bid AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'BADGE', ':bid': badgeId, ':deleted': 'deleted' },
      names: { '#status': 'status' }
    }
  });

  return fallback[0] || null;
}

async function getActiveBadges() {
  return db.scan({
    filter: {
      expression: 'entityType = :type AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'BADGE', ':deleted': 'deleted' },
      names: { '#status': 'status' }
    }
  });
}

async function getBadgeIssuances(badgeId) {
  const records = await db.query(`BADGE#${badgeId}`, { skPrefix: 'ISSUE#' });
  return records.filter(r => r.entityType === 'BADGE_ISSUANCE');
}

async function refreshBadgeIssuedCount(badgeId) {
  const badge = await getBadgeById(badgeId);
  if (!badge) return;

  const userBadges = await db.scan({
    filter: {
      expression: 'entityType = :type AND badgeId = :bid',
      values: { ':type': 'USER_BADGE', ':bid': badgeId }
    }
  });

  await db.updateItem(badge.PK, badge.SK, {
    issuedCount: userBadges.length,
    updatedAt: new Date().toISOString()
  });
}

async function buildRecipient(record) {
  const user = await db.getUser(record.userId) || await db.getAdmin(record.userId);
  return {
    issueId: record.issueId || null,
    userId: record.userId,
    userName: user?.displayName || user?.displayNameZh || record.userId,
    displayName: user?.displayName || user?.displayNameZh || record.userId,
    issuedAt: record.issuedAt,
    issuedBy: record.issuedBy || null,
    message: record.message || ''
  };
}

// ============================================================================
// 徽章管理
// ============================================================================

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { courseId, status, type } = req.query;
    let badges = await getActiveBadges();

    if (courseId) {
      badges = badges.filter(b => b.courseId === courseId || b.courseId === null || b.courseId === undefined);
    }
    if (status) {
      badges = badges.filter(b => b.status === status);
    }
    if (type) {
      badges = badges.filter(b => b.type === type);
    }

    badges.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    res.json({
      success: true,
      data: badges.map(normalizeBadge),
      badgeTypes: BADGE_TYPES,
      badgeStatus: BADGE_STATUS
    });
  } catch (error) {
    console.error('Get badges error:', error);
    res.status(500).json({
      success: false,
      message: '取得徽章列表失敗'
    });
  }
});

router.get('/my/collection', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userBadgeItems = await db.query(`USER#${userId}`, { skPrefix: 'BADGE#' });
    const displaySettings = await db.getItem(`USER#${userId}`, 'BADGE_DISPLAY_SETTINGS');

    const earned = [];
    for (const item of userBadgeItems) {
      if (item.entityType !== 'USER_BADGE') continue;
      const badge = await getBadgeById(item.badgeId);
      if (!badge) continue;
      earned.push({
        id: item.issueId || db.generateId('issue_ref'),
        badge: {
          id: badge.badgeId || badge.id,
          badgeId: badge.badgeId || badge.id,
          name: badge.name,
          description: badge.description || '',
          icon: badge.icon || '🏆',
          color: badge.color || '#f59e0b',
          image: badge.image || ''
        },
        issuedAt: item.issuedAt || item.updatedAt || item.createdAt,
        issuedBy: item.issuedBy || 'system'
      });
    }

    earned.sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());

    res.json({
      success: true,
      data: {
        earned,
        inProgress: [],
        totalEarned: earned.length,
        displayBadges: Array.isArray(displaySettings?.displayBadges) ? displaySettings.displayBadges : []
      }
    });
  } catch (error) {
    console.error('Get my badges error:', error);
    res.status(500).json({
      success: false,
      message: '取得我的徽章失敗'
    });
  }
});

router.get('/users/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const userBadgeItems = await db.query(`USER#${userId}`, { skPrefix: 'BADGE#' });
    const userProfile = await db.getUser(userId) || await db.getAdmin(userId);

    const badges = [];
    for (const item of userBadgeItems) {
      if (item.entityType !== 'USER_BADGE') continue;
      const badge = await getBadgeById(item.badgeId);
      if (!badge) continue;
      badges.push({
        id: badge.badgeId || badge.id,
        badgeId: badge.badgeId || badge.id,
        name: badge.name,
        description: badge.description || '',
        icon: badge.icon || '🏆',
        color: badge.color || '#f59e0b',
        image: badge.image || '',
        issuedAt: item.issuedAt || item.updatedAt || item.createdAt
      });
    }

    badges.sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());

    res.json({
      success: true,
      data: {
        userId,
        displayName: userProfile?.displayName || userProfile?.displayNameZh || userId,
        badges,
        totalBadges: badges.length
      }
    });
  } catch (error) {
    console.error('Get user badges error:', error);
    res.status(500).json({
      success: false,
      message: '取得用戶徽章失敗'
    });
  }
});

router.put('/my/display', authMiddleware, async (req, res) => {
  try {
    const { badgeIds } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(badgeIds)) {
      return res.status(400).json({
        success: false,
        message: '請提供要展示的徽章列表'
      });
    }

    await db.putItem({
      PK: `USER#${userId}`,
      SK: 'BADGE_DISPLAY_SETTINGS',
      entityType: 'USER_BADGE_DISPLAY',
      userId,
      displayBadges: badgeIds,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        userId,
        displayBadges: badgeIds
      },
      message: '展示徽章已更新'
    });
  } catch (error) {
    console.error('Update display badges error:', error);
    res.status(500).json({
      success: false,
      message: '更新展示徽章失敗'
    });
  }
});

router.get('/stats/overview', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可查看統計'
      });
    }

    const [badges, userBadges, issuances] = await Promise.all([
      getActiveBadges(),
      db.scan({
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'USER_BADGE' }
        }
      }),
      db.scan({
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'BADGE_ISSUANCE' }
        }
      })
    ]);

    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const issuedThisMonth = userBadges.filter(record =>
      String(record.issuedAt || '').startsWith(currentMonth)
    ).length;

    const topBadges = badges
      .map(normalizeBadge)
      .sort((a, b) => (b.issuedCount || 0) - (a.issuedCount || 0))
      .slice(0, 5)
      .map(b => ({ id: b.badgeId, badgeId: b.badgeId, name: b.name, issuedCount: b.issuedCount }));

    const recentActivity = issuances
      .sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime())
      .slice(0, 10)
      .map(record => ({
        type: 'issued',
        badgeId: record.badgeId,
        userId: record.userId,
        issuedBy: record.issuedBy,
        timestamp: record.issuedAt
      }));

    res.json({
      success: true,
      data: {
        totalBadges: badges.length,
        activeBadges: badges.filter(b => (b.status || 'draft') === 'active').length,
        totalIssued: userBadges.length,
        issuedThisMonth,
        topBadges,
        recentActivity,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get badge stats error:', error);
    res.status(500).json({
      success: false,
      message: '取得統計資料失敗'
    });
  }
});

router.get('/:badgeId/recipients', authMiddleware, async (req, res) => {
  try {
    const { badgeId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const badge = await getBadgeById(badgeId);
    if (!badge) {
      return res.status(404).json({
        success: false,
        message: '找不到徽章'
      });
    }

    if (!canManageBadge(badge, req.user)) {
      return res.status(403).json({
        success: false,
        message: '沒有權限查看徽章獲得者'
      });
    }

    const records = await getBadgeIssuances(badgeId);
    records.sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());

    const pageNumber = parseInteger(page, 1, { min: 1 });
    const pageSize = parseInteger(limit, 20, { min: 1, max: 200 });
    const start = (pageNumber - 1) * pageSize;
    const chunk = records.slice(start, start + pageSize);

    const recipients = await Promise.all(chunk.map(buildRecipient));

    res.json({
      success: true,
      data: {
        badgeId,
        total: records.length,
        recipients,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          totalPages: Math.ceil(records.length / pageSize)
        }
      }
    });
  } catch (error) {
    console.error('Get badge recipients error:', error);
    res.status(500).json({
      success: false,
      message: '取得獲得者列表失敗'
    });
  }
});

router.get('/:badgeId', authMiddleware, async (req, res) => {
  try {
    const { badgeId } = req.params;
    const badge = await getBadgeById(badgeId);

    if (!badge) {
      return res.status(404).json({
        success: false,
        message: '找不到徽章'
      });
    }

    const issuances = await getBadgeIssuances(badgeId);
    issuances.sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());
    const recentRecipients = await Promise.all(issuances.slice(0, 5).map(buildRecipient));

    res.json({
      success: true,
      data: {
        ...normalizeBadge(badge),
        recentRecipients
      }
    });
  } catch (error) {
    console.error('Get badge error:', error);
    res.status(500).json({
      success: false,
      message: '取得徽章詳情失敗'
    });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可建立徽章'
      });
    }

    const { name, description, icon, color, image, type, criteria, courseId, expiry, status } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: '請提供徽章名稱'
      });
    }

    const badgeId = db.generateId('badge');
    const now = new Date().toISOString();
    const badge = {
      PK: `BADGE#${badgeId}`,
      SK: 'META',
      entityType: 'BADGE',
      badgeId,
      name: String(name).trim(),
      description: description || '',
      icon: icon || '🏆',
      color: color || '#f59e0b',
      image: image || '',
      type: type || 'manual',
      status: status || 'draft',
      criteria: normalizeCriteria(criteria),
      courseId: courseId || null,
      expiry: expiry || null,
      issuedCount: 0,
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(badge);

    res.status(201).json({
      success: true,
      data: normalizeBadge(badge),
      message: '徽章建立成功'
    });
  } catch (error) {
    console.error('Create badge error:', error);
    res.status(500).json({
      success: false,
      message: '建立徽章失敗'
    });
  }
});

router.put('/:badgeId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可更新徽章'
      });
    }

    const { badgeId } = req.params;
    const badge = await getBadgeById(badgeId);
    if (!badge) {
      return res.status(404).json({
        success: false,
        message: '找不到徽章'
      });
    }

    if (!canManageBadge(badge, req.user)) {
      return res.status(403).json({
        success: false,
        message: '無權限更新此徽章'
      });
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (req.body.name !== undefined) updates.name = String(req.body.name || '').trim();
    if (req.body.description !== undefined) updates.description = String(req.body.description || '');
    if (req.body.icon !== undefined) updates.icon = req.body.icon || '🏆';
    if (req.body.color !== undefined) updates.color = req.body.color || '#f59e0b';
    if (req.body.image !== undefined) updates.image = req.body.image || '';
    if (req.body.type !== undefined) updates.type = req.body.type || 'manual';
    if (req.body.status !== undefined) updates.status = req.body.status || 'draft';
    if (req.body.criteria !== undefined) updates.criteria = normalizeCriteria(req.body.criteria);
    if (req.body.courseId !== undefined) updates.courseId = req.body.courseId || null;
    if (req.body.expiry !== undefined) updates.expiry = req.body.expiry || null;

    const updated = await db.updateItem(badge.PK, badge.SK, updates);

    res.json({
      success: true,
      data: normalizeBadge(updated),
      message: '徽章更新成功'
    });
  } catch (error) {
    console.error('Update badge error:', error);
    res.status(500).json({
      success: false,
      message: '更新徽章失敗'
    });
  }
});

router.delete('/:badgeId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可刪除徽章'
      });
    }

    const { badgeId } = req.params;
    const badge = await getBadgeById(badgeId);
    if (!badge) {
      return res.status(404).json({
        success: false,
        message: '找不到徽章'
      });
    }

    if (!canManageBadge(badge, req.user)) {
      return res.status(403).json({
        success: false,
        message: '無權限刪除此徽章'
      });
    }

    await db.updateItem(badge.PK, badge.SK, {
      status: 'deleted',
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '徽章刪除成功'
    });
  } catch (error) {
    console.error('Delete badge error:', error);
    res.status(500).json({
      success: false,
      message: '刪除徽章失敗'
    });
  }
});

// ============================================================================
// 徽章頒發
// ============================================================================

router.post('/:badgeId/issue', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可發放徽章'
      });
    }

    const { badgeId } = req.params;
    const { userIds, message } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '請指定要頒發的用戶'
      });
    }

    const badge = await getBadgeById(badgeId);
    if (!badge) {
      return res.status(404).json({
        success: false,
        message: '找不到徽章'
      });
    }

    if (!canManageBadge(badge, req.user)) {
      return res.status(403).json({
        success: false,
        message: '無權限發放此徽章'
      });
    }

    const issuances = [];
    for (const userId of userIds) {
      const issuedAt = new Date().toISOString();
      const issueId = db.generateId('issue');

      await db.putItem({
        PK: `BADGE#${badgeId}`,
        SK: `ISSUE#${issuedAt}#${userId}`,
        entityType: 'BADGE_ISSUANCE',
        issueId,
        badgeId,
        userId,
        issuedBy: req.user.userId,
        issuedAt,
        message: message || '',
        type: 'manual'
      });

      await db.putItem({
        PK: `USER#${userId}`,
        SK: `BADGE#${badgeId}`,
        entityType: 'USER_BADGE',
        issueId,
        badgeId,
        userId,
        badgeName: badge.name,
        badgeIcon: badge.icon || '🏆',
        issuedBy: req.user.userId,
        issuedAt,
        message: message || '',
        updatedAt: issuedAt,
        createdAt: issuedAt
      });

      issuances.push({
        id: issueId,
        issueId,
        badgeId,
        userId,
        issuedBy: req.user.userId,
        issuedAt,
        message: message || '',
        type: 'manual'
      });
    }

    await refreshBadgeIssuedCount(badgeId);

    res.json({
      success: true,
      data: {
        issued: issuances.length,
        issuances
      },
      message: `成功頒發徽章給 ${issuances.length} 位用戶`
    });
  } catch (error) {
    console.error('Issue badge error:', error);
    res.status(500).json({
      success: false,
      message: '頒發徽章失敗'
    });
  }
});

router.delete('/:badgeId/revoke/:userId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可撤銷徽章'
      });
    }

    const { badgeId, userId } = req.params;
    const { reason } = req.body || {};

    const badge = await getBadgeById(badgeId);
    if (!badge) {
      return res.status(404).json({
        success: false,
        message: '找不到徽章'
      });
    }

    if (!canManageBadge(badge, req.user)) {
      return res.status(403).json({
        success: false,
        message: '無權限撤銷此徽章'
      });
    }

    await db.deleteItem(`USER#${userId}`, `BADGE#${badgeId}`);

    const issuances = await getBadgeIssuances(badgeId);
    for (const issue of issuances.filter(item => item.userId === userId)) {
      await db.deleteItem(issue.PK, issue.SK);
    }

    await refreshBadgeIssuedCount(badgeId);

    res.json({
      success: true,
      data: {
        badgeId,
        userId,
        revokedBy: req.user.userId,
        revokedAt: new Date().toISOString(),
        reason: reason || ''
      },
      message: '徽章已撤銷'
    });
  } catch (error) {
    console.error('Revoke badge error:', error);
    res.status(500).json({
      success: false,
      message: '撤銷徽章失敗'
    });
  }
});

module.exports = router;
