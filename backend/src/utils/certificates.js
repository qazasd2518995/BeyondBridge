const crypto = require('crypto');
const db = require('./db');
const { createLinkedEntityIndexes, enrichCourseActivity } = require('./legacy-course-activity-links');

const CERTIFICATE_CRITERION_TYPES = {
  ACTIVITY_COMPLETION: 'activity_completion',
  ACTIVITY_SCORE: 'activity_score',
  DURATION: 'duration'
};

const CERTIFICATE_THEME_OPTIONS = [
  { value: 'classic', name: 'Classic Blue' },
  { value: 'sunrise', name: 'Sunrise Gold' },
  { value: 'forest', name: 'Forest Green' },
  { value: 'ocean', name: 'Ocean Teal' }
];

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampPercentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

function toSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function secondsToDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(remainingSeconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function getThemeValue(theme) {
  return CERTIFICATE_THEME_OPTIONS.find(option => option.value === theme)?.value || 'classic';
}

function buildDefaultTemplate(course = {}) {
  const title = course.title || course.name || '課程結業證書';
  return {
    theme: 'classic',
    certificateTitle: title,
    certificateSubtitle: 'Certificate of Completion',
    issuerName: course.instructorName || course.teacherName || 'BeyondBridge',
    issuerTitle: '課程講師',
    statement: '茲證明學員已完成本課程規範之學習要求，特此頒發證書。'
  };
}

function defaultCertificateSettings(course = {}) {
  return {
    courseId: course.courseId || course.id || '',
    enabled: false,
    autoIssue: true,
    template: buildDefaultTemplate(course),
    criteria: [],
    createdAt: null,
    updatedAt: null
  };
}

function stripDbKeys(item) {
  if (!item) return item;
  const cloned = { ...item };
  delete cloned.PK;
  delete cloned.SK;
  delete cloned.GSI1PK;
  delete cloned.GSI1SK;
  delete cloned.GSI2PK;
  delete cloned.GSI2SK;
  delete cloned.GSI3PK;
  delete cloned.GSI3SK;
  delete cloned.GSI4PK;
  delete cloned.GSI4SK;
  return cloned;
}

function buildActivityMap(activities = []) {
  const map = new Map();
  activities.forEach((activity) => {
    const activityId = activity?.activityId || activity?.courseActivityId;
    if (activityId) map.set(activityId, activity);
    if (activity?.courseActivityId) map.set(activity.courseActivityId, activity);
  });
  return map;
}

function getActivityDisplayName(activity) {
  if (!activity) return '未命名活動';
  return activity.title || activity.name || activity.assignmentTitle || activity.quizTitle || activity.activityId || '未命名活動';
}

function getAssignmentOrQuizPercentage(progress, activity) {
  if (!progress || !activity) return null;
  const grades = Array.isArray(progress.grades) ? progress.grades : [];

  if (activity.type === 'assignment') {
    const assignmentId = activity.assignmentId || activity.activityId;
    const gradeEntry = grades.find(item => item.assignmentId === assignmentId);
    if (!gradeEntry || gradeEntry.grade == null) return null;
    const maxGrade = Number(gradeEntry.maxGrade || activity.maxGrade || 100);
    if (!Number.isFinite(maxGrade) || maxGrade <= 0) return null;
    return clampPercentage((Number(gradeEntry.grade || 0) / maxGrade) * 100);
  }

  if (activity.type === 'quiz') {
    const quizId = activity.quizId || activity.activityId;
    const gradeEntry = grades.find(item => item.quizId === quizId);
    if (!gradeEntry) return null;
    if (gradeEntry.percentage != null) {
      return clampPercentage(gradeEntry.percentage);
    }
    const totalPoints = Number(gradeEntry.totalPoints || activity.totalPoints || 100);
    if (!Number.isFinite(totalPoints) || totalPoints <= 0) return null;
    return clampPercentage((Number(gradeEntry.score || 0) / totalPoints) * 100);
  }

  return null;
}

function normalizeCriterion(raw = {}, index = 0, activityMap = new Map()) {
  const fallbackType = CERTIFICATE_CRITERION_TYPES.ACTIVITY_COMPLETION;
  const normalizedType = Object.values(CERTIFICATE_CRITERION_TYPES).includes(raw.type)
    ? raw.type
    : String(raw.type || '').trim().toLowerCase() || fallbackType;
  const type = Object.values(CERTIFICATE_CRITERION_TYPES).includes(normalizedType)
    ? normalizedType
    : fallbackType;

  const criterion = {
    criterionId: raw.criterionId || raw.id || db.generateId('certcrit'),
    order: parseInteger(raw.order, index + 1, { min: 1 }),
    type,
    description: String(raw.description || '').trim()
  };

  if (type === CERTIFICATE_CRITERION_TYPES.DURATION) {
    criterion.minMinutes = parseInteger(raw.minMinutes ?? raw.requiredMinutes, 30, { min: 1 });
    criterion.description = criterion.description || `累積學習時間達 ${criterion.minMinutes} 分鐘`;
    return criterion;
  }

  if (type === CERTIFICATE_CRITERION_TYPES.ACTIVITY_SCORE) {
    const activityId = String(raw.activityId || '').trim();
    const activity = activityMap.get(activityId);
    criterion.activityId = activityId;
    criterion.activityType = String(raw.activityType || activity?.type || '').trim() || 'assignment';
    criterion.activityTitle = String(raw.activityTitle || getActivityDisplayName(activity)).trim();
    criterion.minScore = parseInteger(raw.minScore ?? raw.gradeToPass, 60, { min: 0, max: 100 });
    criterion.description = criterion.description || `${criterion.activityTitle} 成績達 ${criterion.minScore} 分`;
    return criterion;
  }

  const activityIds = Array.isArray(raw.activityIds)
    ? Array.from(new Set(raw.activityIds.map(value => String(value || '').trim()).filter(Boolean)))
    : [];
  criterion.activityIds = activityIds;
  criterion.activityTitles = activityIds.map(activityId => {
    const activity = activityMap.get(activityId);
    return {
      activityId,
      title: getActivityDisplayName(activity),
      type: activity?.type || ''
    };
  });
  criterion.description = criterion.description || (
    activityIds.length > 1
      ? `完成 ${activityIds.length} 項指定活動`
      : `完成 ${criterion.activityTitles[0]?.title || '指定活動'}`
  );
  return criterion;
}

function normalizeCertificateSettings(raw = {}, course = {}, activities = []) {
  if (!raw || !raw.courseId) {
    return defaultCertificateSettings(course);
  }

  const activityMap = buildActivityMap(activities);
  const templateDefaults = buildDefaultTemplate(course);
  const template = {
    theme: getThemeValue(raw.template?.theme || raw.theme),
    certificateTitle: String(raw.template?.certificateTitle || raw.certificateTitle || templateDefaults.certificateTitle).trim(),
    certificateSubtitle: String(raw.template?.certificateSubtitle || raw.certificateSubtitle || templateDefaults.certificateSubtitle).trim(),
    issuerName: String(raw.template?.issuerName || raw.issuerName || templateDefaults.issuerName).trim(),
    issuerTitle: String(raw.template?.issuerTitle || raw.issuerTitle || templateDefaults.issuerTitle).trim(),
    statement: String(raw.template?.statement || raw.statement || templateDefaults.statement).trim()
  };

  return {
    courseId: raw.courseId || course.courseId || course.id || '',
    enabled: raw.enabled === true,
    autoIssue: raw.autoIssue !== false,
    template,
    criteria: (Array.isArray(raw.criteria) ? raw.criteria : []).map((criterion, index) =>
      normalizeCriterion(criterion, index, activityMap)
    ),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null
  };
}

async function getCourseActivities(courseId) {
  const [activities, linkedEntities] = await Promise.all([
    db.query(`COURSE#${courseId}`, { skPrefix: 'ACTIVITY#' }),
    db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK')
  ]);
  const linkedIndexes = createLinkedEntityIndexes(linkedEntities);
  return activities.map(activity => stripDbKeys(enrichCourseActivity(activity, linkedIndexes)));
}

async function getCertificateSettings(courseId) {
  const [course, storedSettings, activities] = await Promise.all([
    db.getItem(`COURSE#${courseId}`, 'META'),
    db.getItem(`COURSE#${courseId}`, 'CERTIFICATE_SETTINGS'),
    getCourseActivities(courseId)
  ]);
  return {
    course,
    activities,
    settings: normalizeCertificateSettings(storedSettings, course || { courseId }, activities)
  };
}

function evaluateCriterion(criterion, progress, activityMap = new Map()) {
  const completedActivities = new Set(Array.isArray(progress?.completedActivities) ? progress.completedActivities : []);
  const activityProgressMap = progress?.activityProgressMap || {};

  if (criterion.type === CERTIFICATE_CRITERION_TYPES.DURATION) {
    const spentSeconds = toSeconds(progress?.totalTimeSpent);
    const requiredSeconds = criterion.minMinutes * 60;
    return {
      ...criterion,
      met: spentSeconds >= requiredSeconds,
      currentValue: spentSeconds,
      targetValue: requiredSeconds,
      summary: `${secondsToDuration(spentSeconds)} / ${secondsToDuration(requiredSeconds)}`
    };
  }

  if (criterion.type === CERTIFICATE_CRITERION_TYPES.ACTIVITY_SCORE) {
    const activity = activityMap.get(criterion.activityId);
    const percentage = getAssignmentOrQuizPercentage(progress, activity || criterion);
    return {
      ...criterion,
      met: percentage != null && percentage >= criterion.minScore,
      currentValue: percentage,
      targetValue: criterion.minScore,
      summary: percentage == null
        ? '尚未取得成績'
        : `${Math.round(percentage * 100) / 100}% / ${criterion.minScore}%`
    };
  }

  const targetIds = Array.isArray(criterion.activityIds) ? criterion.activityIds : [];
  const completedCount = targetIds.filter((activityId) =>
    completedActivities.has(activityId) || Number(activityProgressMap[activityId] || 0) >= 100
  ).length;
  const total = targetIds.length;
  return {
    ...criterion,
    met: total > 0 && completedCount >= total,
    currentValue: completedCount,
    targetValue: total,
    summary: `${completedCount} / ${total} 項完成`
  };
}

function evaluateCertificateEligibility({ settings, progress, activities }) {
  const normalizedSettings = normalizeCertificateSettings(settings, {}, activities);
  const activityMap = buildActivityMap(activities);
  const criteriaStatus = normalizedSettings.criteria.map((criterion) =>
    evaluateCriterion(criterion, progress, activityMap)
  );
  const eligible = normalizedSettings.enabled
    && normalizedSettings.criteria.length > 0
    && criteriaStatus.every(criterion => criterion.met);

  return {
    eligible,
    criteriaStatus,
    totalCriteria: criteriaStatus.length,
    completedCriteria: criteriaStatus.filter(criterion => criterion.met).length
  };
}

function generateVerifyCode(courseId, userId, issuedAt) {
  const seed = `${courseId}:${userId}:${issuedAt}:${Math.random()}`;
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12).toUpperCase();
}

function buildIssuedCertificateRecord({ course, settings, userId, userName, issuedBy = 'system', issuedAt }) {
  const courseId = course.courseId || course.id;
  const verifyCode = generateVerifyCode(courseId, userId, issuedAt);
  const certificateId = db.generateId('cert');
  const certificateNo = `BB-${issuedAt.slice(0, 10).replace(/-/g, '')}-${verifyCode.slice(0, 6)}`;

  return {
    certificateId,
    certificateNo,
    verifyCode,
    userId,
    recipientName: userName,
    courseId,
    courseTitle: course.title || course.name || '',
    issuedBy,
    issuedAt,
    status: 'active',
    theme: settings.template.theme,
    certificateTitle: settings.template.certificateTitle || course.title || '課程結業證書',
    certificateSubtitle: settings.template.certificateSubtitle || 'Certificate of Completion',
    issuerName: settings.template.issuerName || 'BeyondBridge',
    issuerTitle: settings.template.issuerTitle || '',
    statement: settings.template.statement || '恭喜完成課程。'
  };
}

function serializeIssuedCertificate(record = {}) {
  return {
    certificateId: record.certificateId || null,
    certificateNo: record.certificateNo || '',
    verifyCode: record.verifyCode || '',
    userId: record.userId || '',
    recipientName: record.recipientName || record.userName || '',
    courseId: record.courseId || '',
    courseTitle: record.courseTitle || '',
    issuedBy: record.issuedBy || 'system',
    issuedAt: record.issuedAt || null,
    status: record.status || 'active',
    theme: getThemeValue(record.theme),
    certificateTitle: record.certificateTitle || '課程結業證書',
    certificateSubtitle: record.certificateSubtitle || 'Certificate of Completion',
    issuerName: record.issuerName || 'BeyondBridge',
    issuerTitle: record.issuerTitle || '',
    statement: record.statement || '',
    createdAt: record.createdAt || record.issuedAt || null,
    updatedAt: record.updatedAt || record.issuedAt || null
  };
}

async function issueCertificateIfEligible({ courseId, userId, issuedBy = 'system' }) {
  const [{ course, settings, activities }, progress, existingCertificate] = await Promise.all([
    getCertificateSettings(courseId),
    db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`),
    db.getItem(`USER#${userId}`, `CERT#COURSE#${courseId}`)
  ]);

  if (!course || !progress) {
    return { status: 'skipped', reason: 'missing_course_or_progress' };
  }

  const evaluation = evaluateCertificateEligibility({ settings, progress, activities });
  if (!settings.enabled || !settings.autoIssue) {
    return { status: 'skipped', reason: 'certificate_disabled', evaluation };
  }
  if (!evaluation.eligible) {
    return { status: 'not_eligible', evaluation };
  }

  if (existingCertificate && existingCertificate.entityType === 'USER_CERTIFICATE') {
    return {
      status: 'already_issued',
      certificate: serializeIssuedCertificate(existingCertificate),
      evaluation
    };
  }

  const issuedAt = new Date().toISOString();
  const user = await db.getUser(userId) || await db.getAdmin(userId);
  const userName = user?.displayName || user?.displayNameZh || userId;
  const baseRecord = buildIssuedCertificateRecord({
    course,
    settings,
    userId,
    userName,
    issuedBy,
    issuedAt
  });

  await db.putItem({
    PK: `USER#${userId}`,
    SK: `CERT#COURSE#${courseId}`,
    entityType: 'USER_CERTIFICATE',
    ...baseRecord,
    updatedAt: issuedAt,
    createdAt: issuedAt
  });

  await db.putItem({
    PK: `COURSE#${courseId}`,
    SK: `CERTIFICATE#${userId}`,
    entityType: 'COURSE_CERTIFICATE',
    ...baseRecord,
    updatedAt: issuedAt,
    createdAt: issuedAt
  });

  return {
    status: 'issued',
    certificate: serializeIssuedCertificate(baseRecord),
    evaluation
  };
}

async function syncCourseCertificates(courseId, { userId = null, issuedBy = 'system' } = {}) {
  if (userId) {
    return [await issueCertificateIfEligible({ courseId, userId, issuedBy })];
  }

  const progressList = await db.scan({
    filter: {
      expression: 'entityType = :type AND courseId = :courseId',
      values: {
        ':type': 'COURSE_PROGRESS',
        ':courseId': courseId
      }
    }
  });

  const results = [];
  for (const progress of progressList) {
    if (!progress?.userId) continue;
    results.push(await issueCertificateIfEligible({
      courseId,
      userId: progress.userId,
      issuedBy
    }));
  }
  return results;
}

async function listUserCertificates(userId) {
  const items = await db.query(`USER#${userId}`, { skPrefix: 'CERT#COURSE#' });
  return items
    .filter(item => item.entityType === 'USER_CERTIFICATE')
    .map(serializeIssuedCertificate)
    .sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());
}

async function listCourseRecipients(courseId) {
  const items = await db.query(`COURSE#${courseId}`, { skPrefix: 'CERTIFICATE#' });
  return items
    .filter(item => item.entityType === 'COURSE_CERTIFICATE')
    .map(serializeIssuedCertificate)
    .sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());
}

module.exports = {
  CERTIFICATE_CRITERION_TYPES,
  CERTIFICATE_THEME_OPTIONS,
  normalizeCertificateSettings,
  defaultCertificateSettings,
  getCourseActivities,
  getCertificateSettings,
  evaluateCertificateEligibility,
  issueCertificateIfEligible,
  syncCourseCertificates,
  listUserCertificates,
  listCourseRecipients,
  serializeIssuedCertificate,
  secondsToDuration
};
