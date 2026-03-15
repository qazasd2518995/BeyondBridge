const db = require('./db');

const ADMIN_METRICS_PK = 'ADMIN_METRICS';
const ADMIN_METRICS_VERSION = 1;
const ADMIN_METRICS_SNAPSHOT_KEYS = {
  DASHBOARD: 'dashboard',
  ANALYTICS_OVERVIEW: 'analytics_overview'
};

const ANALYTICS_ENTITY_FILTER = (type) => ({
  expression: 'entityType = :type',
  values: { ':type': type }
});

const USER_ANALYTICS_PROJECTION = [
  'userId',
  'displayName',
  'email',
  'role',
  'status',
  'createdAt',
  'lastLoginAt'
];

const RESOURCE_ANALYTICS_PROJECTION = [
  'resourceId',
  'title',
  'category',
  'status',
  'viewCount',
  'averageRating',
  'createdAt'
];

const LICENSE_ANALYTICS_PROJECTION = [
  'licenseId',
  'resourceId',
  'status',
  'startDate',
  'approvedAt',
  'createdAt',
  'expiryDate',
  'expiresAt'
];

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toMonthKey(value) {
  const d = parseDate(value);
  return d ? d.toISOString().slice(0, 7) : null;
}

function isResourcePublished(resource) {
  if (!resource?.status) return true;
  return resource.status === 'published';
}

function isActiveLicenseAt(license, atDate) {
  const rawStatus = (license?.status || 'pending').toLowerCase();
  if (rawStatus !== 'active') return false;

  const atTs = atDate.getTime();
  const start = parseDate(license.startDate || license.approvedAt || license.createdAt);
  const expiry = parseDate(license.expiryDate || license.expiresAt);

  if (start && start.getTime() > atTs) return false;
  if (expiry && expiry.getTime() < atTs) return false;
  return true;
}

function resolveLicenseStatus(license, now = new Date()) {
  const rawStatus = (license?.status || 'pending').toLowerCase();
  if (rawStatus === 'rejected') return 'rejected';
  if (rawStatus === 'pending') return 'pending';
  if (isActiveLicenseAt(license, now)) return 'active';
  return 'expired';
}

async function scanUsersForAnalytics() {
  return db.scan({
    filter: ANALYTICS_ENTITY_FILTER('USER'),
    projection: USER_ANALYTICS_PROJECTION
  });
}

async function scanResourcesForAnalytics() {
  return db.scan({
    filter: ANALYTICS_ENTITY_FILTER('RESOURCE'),
    projection: RESOURCE_ANALYTICS_PROJECTION
  });
}

async function scanLicensesForAnalytics() {
  return db.scan({
    filter: ANALYTICS_ENTITY_FILTER('LICENSE'),
    projection: LICENSE_ANALYTICS_PROJECTION
  });
}

async function scanChatRoomsForAnalytics() {
  return db.scan({
    filter: ANALYTICS_ENTITY_FILTER('CHAT_ROOM'),
    projection: ['status', 'rating']
  });
}

async function scanCoursesForDashboard() {
  return db.scan({
    filter: ANALYTICS_ENTITY_FILTER('COURSE'),
    projection: ['courseId', 'createdAt']
  });
}

async function scanAnnouncementsForDashboard() {
  return db.scan({
    filter: ANALYTICS_ENTITY_FILTER('ANNOUNCEMENT'),
    projection: ['id', 'status']
  });
}

async function buildAdminDashboardSnapshot() {
  const [users, resources, courses, licenses, announcements] = await Promise.all([
    scanUsersForAnalytics(),
    scanResourcesForAnalytics(),
    scanCoursesForDashboard(),
    scanLicensesForAnalytics(),
    scanAnnouncementsForDashboard()
  ]);

  const activeUsers = users.filter(u => u.status === 'active').length;
  const activeLicenses = licenses.filter(l => l.status === 'active').length;
  const pendingLicenses = licenses.filter(l => l.status === 'pending').length;
  const publishedResources = resources.filter(r => r.status === 'published').length;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const newUsers = users.filter(u => new Date(u.createdAt) >= thirtyDaysAgo).length;

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiringLicenses = licenses.filter(l => {
    if (!l.expiryDate) return false;
    const expiry = new Date(l.expiryDate);
    const today = new Date();
    return l.status === 'active' && expiry > today && expiry <= thirtyDaysFromNow;
  }).length;

  const recentUsers = users
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map(u => ({
      userId: u.userId,
      displayName: u.displayName,
      email: u.email,
      createdAt: u.createdAt
    }));

  return {
    stats: {
      totalUsers: users.length,
      activeUsers,
      newUsersThisMonth: newUsers,
      totalResources: resources.length,
      publishedResources,
      totalCourses: courses.length,
      activeLicenses,
      pendingLicenses,
      expiringLicenses,
      activeAnnouncements: announcements.filter(a => a.status === 'active').length
    },
    recentUsers,
    timestamp: new Date().toISOString(),
    sourceCounts: {
      users: users.length,
      resources: resources.length,
      courses: courses.length,
      licenses: licenses.length,
      announcements: announcements.length
    }
  };
}

async function buildAdminAnalyticsOverviewSnapshot() {
  const [users, resources, licenses, chatRooms] = await Promise.all([
    scanUsersForAnalytics(),
    scanResourcesForAnalytics(),
    scanLicensesForAnalytics(),
    scanChatRoomsForAnalytics()
  ]);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthKey = thisMonthStart.toISOString().slice(0, 7);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = lastMonthStart.toISOString().slice(0, 7);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const userCreatedTimes = users.map(u => parseDate(u.createdAt)?.getTime() ?? null);
  const usersWithoutCreatedAt = userCreatedTimes.filter(ts => ts === null).length;

  const newUsersThisMonth = users.reduce((sum, user) => (
    sum + (toMonthKey(user.createdAt) === thisMonthKey ? 1 : 0)
  ), 0);
  const newUsersLastMonth = users.reduce((sum, user) => (
    sum + (toMonthKey(user.createdAt) === lastMonthKey ? 1 : 0)
  ), 0);

  const userGrowthTrend = [];
  for (let i = 0; i < 6; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthStartTs = monthStart.getTime();
    const monthEndTs = monthEnd.getTime();

    const newUsers = userCreatedTimes.filter(ts => ts !== null && ts >= monthStartTs && ts <= monthEndTs).length;
    const totalUsers = usersWithoutCreatedAt +
      userCreatedTimes.filter(ts => ts !== null && ts <= monthEndTs).length;

    userGrowthTrend.push({
      label: `${monthStart.getMonth() + 1}月`,
      total: totalUsers,
      newUsers
    });
  }

  const userRoles = users.reduce((acc, user) => {
    const role = user.role || 'student';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  const resourceCategories = resources.reduce((acc, resource) => {
    const category = resource.category || 'other';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const licenseStatus = licenses.reduce((acc, license) => {
    const status = resolveLicenseStatus(license, now);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { active: 0, pending: 0, expired: 0, rejected: 0 });

  const licensedCountByResource = {};
  const activeLicensedCountByResource = {};
  licenses.forEach(license => {
    const resourceId = license.resourceId;
    if (!resourceId) return;

    const status = resolveLicenseStatus(license, now);
    if (status !== 'rejected') {
      licensedCountByResource[resourceId] = (licensedCountByResource[resourceId] || 0) + 1;
    }
    if (status === 'active') {
      activeLicensedCountByResource[resourceId] = (activeLicensedCountByResource[resourceId] || 0) + 1;
    }
  });

  const topResources = resources
    .map(resource => ({
      resourceId: resource.resourceId,
      title: resource.title,
      category: resource.category || 'other',
      viewCount: Number(resource.viewCount || 0),
      views: Number(resource.viewCount || 0),
      rating: Number(resource.averageRating || 0),
      licensedCount: licensedCountByResource[resource.resourceId] || 0,
      activeLicensedCount: activeLicensedCountByResource[resource.resourceId] || 0
    }))
    .sort((a, b) => (
      b.viewCount - a.viewCount ||
      b.activeLicensedCount - a.activeLicensedCount ||
      b.licensedCount - a.licensedCount
    ))
    .slice(0, 5);

  const totalResources = resources.length;
  const totalResourcesLastMonth = resources.reduce((sum, resource) => {
    const createdAt = parseDate(resource.createdAt);
    return sum + (!createdAt || createdAt <= lastMonthEnd ? 1 : 0);
  }, 0);

  const publishedResources = resources.reduce((sum, resource) => (
    sum + (isResourcePublished(resource) ? 1 : 0)
  ), 0);
  const publishedResourcesLastMonth = resources.reduce((sum, resource) => {
    const createdAt = parseDate(resource.createdAt);
    const existedByLastMonth = !createdAt || createdAt <= lastMonthEnd;
    return sum + (existedByLastMonth && isResourcePublished(resource) ? 1 : 0);
  }, 0);

  const activeLicenses = licenses.filter(license => isActiveLicenseAt(license, now)).length;
  const activeLicensesLastMonth = licenses.filter(license => isActiveLicenseAt(license, lastMonthEnd)).length;

  const ratedResources = resources
    .map(resource => Number(resource.averageRating || 0))
    .filter(score => score > 0);
  const avgRating = ratedResources.length > 0
    ? ratedResources.reduce((sum, score) => sum + score, 0) / ratedResources.length
    : 0;

  const totalChats = chatRooms.length;
  const closedChats = chatRooms.filter(room => room.status === 'closed').length;
  const ratedChats = chatRooms.filter(room => Number(room.rating?.score) > 0);
  const avgSupportRating = ratedChats.length > 0
    ? ratedChats.reduce((sum, room) => sum + Number(room.rating.score), 0) / ratedChats.length
    : 0;
  const satisfactionRate = ratedChats.length > 0
    ? Math.round((ratedChats.filter(room => Number(room.rating.score) >= 4).length / ratedChats.length) * 100)
    : 0;

  return {
    metrics: {
      totalUsers: users.length,
      newUsersThisMonth,
      newUsersLastMonth,
      totalResources,
      totalResourcesLastMonth,
      publishedResources,
      publishedResourcesLastMonth,
      resourcesLastMonth: publishedResourcesLastMonth,
      activeLicenses,
      activeLicensesLastMonth,
      licensesLastMonth: activeLicensesLastMonth,
      avgCustomerRating: Math.round(avgRating * 10) / 10
    },
    userGrowthTrend,
    userRoles,
    userRolesList: Object.entries(userRoles).map(([role, count]) => ({ role, count })),
    resourceCategories,
    resourceCategoriesList: Object.entries(resourceCategories).map(([name, count]) => ({ name, count })),
    licenseStatus,
    licenseStatusList: Object.entries(licenseStatus).map(([status, count]) => ({ status, count })),
    topResources,
    supportStats: {
      totalChats,
      closedChats,
      avgRating: Math.round(avgSupportRating * 10) / 10,
      satisfactionRate
    },
    timestamp: new Date().toISOString(),
    sourceCounts: {
      users: users.length,
      resources: resources.length,
      licenses: licenses.length,
      chatRooms: chatRooms.length
    }
  };
}

async function getAdminMetricsSnapshot(key) {
  if (!key) return null;
  const item = await db.getItem(ADMIN_METRICS_PK, `SNAPSHOT#${key}`);
  if (!item || item.entityType !== 'ADMIN_METRICS') return null;
  return item;
}

async function putAdminMetricsSnapshot(key, data, meta = {}) {
  const now = new Date().toISOString();
  const item = {
    PK: ADMIN_METRICS_PK,
    SK: `SNAPSHOT#${key}`,
    entityType: 'ADMIN_METRICS',
    metricsKey: key,
    version: ADMIN_METRICS_VERSION,
    rebuiltAt: now,
    data,
    ...meta
  };
  await db.putItem(item);
  return item;
}

async function rebuildAdminMetricsSnapshots(keys = Object.values(ADMIN_METRICS_SNAPSHOT_KEYS)) {
  const builders = {
    [ADMIN_METRICS_SNAPSHOT_KEYS.DASHBOARD]: buildAdminDashboardSnapshot,
    [ADMIN_METRICS_SNAPSHOT_KEYS.ANALYTICS_OVERVIEW]: buildAdminAnalyticsOverviewSnapshot
  };

  const results = [];
  for (const key of keys) {
    const builder = builders[key];
    if (!builder) {
      throw new Error(`Unknown admin metrics snapshot key: ${key}`);
    }
    const data = await builder();
    const item = await putAdminMetricsSnapshot(key, data, {
      snapshotType: key,
      source: 'rebuild-script'
    });
    results.push({
      key,
      rebuiltAt: item.rebuiltAt,
      sourceCounts: data.sourceCounts || null
    });
  }
  return results;
}

module.exports = {
  ADMIN_METRICS_PK,
  ADMIN_METRICS_VERSION,
  ADMIN_METRICS_SNAPSHOT_KEYS,
  scanUsersForAnalytics,
  buildAdminDashboardSnapshot,
  buildAdminAnalyticsOverviewSnapshot,
  getAdminMetricsSnapshot,
  putAdminMetricsSnapshot,
  rebuildAdminMetricsSnapshots
};
