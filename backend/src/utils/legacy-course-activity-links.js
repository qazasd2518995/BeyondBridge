const LINKED_ACTIVITY_CONFIG = {
  assignment: {
    entityType: 'ASSIGNMENT',
    idField: 'assignmentId',
    idPrefix: 'assign',
    gsiPrefix: 'ASSIGNMENT',
    extractFields: ['dueDate', 'cutoffDate', 'maxGrade', 'gradeToPass', 'submissionType', 'maxFiles', 'maxFileSize', 'allowedFileTypes', 'status']
  },
  quiz: {
    entityType: 'QUIZ',
    idField: 'quizId',
    idPrefix: 'quiz',
    gsiPrefix: 'QUIZ',
    extractFields: ['openDate', 'closeDate', 'timeLimit', 'maxAttempts', 'questionCount', 'totalPoints', 'passingGrade', 'status']
  },
  forum: {
    entityType: 'FORUM',
    idField: 'forumId',
    idPrefix: 'forum',
    gsiPrefix: 'FORUM',
    extractFields: ['forumMode', 'subscriptionMode', 'ratingEnabled', 'maxAttachments', 'maxAttachmentSize', 'stats']
  }
};

function normalizeLookupText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildSectionTitleKey(type, sectionId, title) {
  return `${type}::${sectionId || ''}::${normalizeLookupText(title)}`;
}

function buildTitleKey(type, title) {
  return `${type}::${normalizeLookupText(title)}`;
}

function stripDbKeys(item) {
  if (!item) return item;
  const cleaned = { ...item };
  delete cleaned.PK;
  delete cleaned.SK;
  delete cleaned.GSI1PK;
  delete cleaned.GSI1SK;
  delete cleaned.GSI2PK;
  delete cleaned.GSI2SK;
  delete cleaned.GSI3PK;
  delete cleaned.GSI3SK;
  delete cleaned.GSI4PK;
  delete cleaned.GSI4SK;
  return cleaned;
}

function createLinkedEntityIndexes(items = []) {
  const indexes = {};

  for (const [type] of Object.entries(LINKED_ACTIVITY_CONFIG)) {
    indexes[type] = {
      byId: new Map(),
      bySectionTitle: new Map(),
      byTitle: new Map()
    };
  }

  for (const rawItem of items) {
    const item = stripDbKeys(rawItem);
    const entry = Object.entries(LINKED_ACTIVITY_CONFIG)
      .find(([, config]) => config.entityType === item.entityType);
    if (!entry) continue;

    const [type, config] = entry;
    const typedIndex = indexes[type];
    const entityId = item[config.idField];
    if (!entityId) continue;

    typedIndex.byId.set(entityId, item);

    const sectionTitleKey = buildSectionTitleKey(type, item.sectionId, item.title);
    const titleKey = buildTitleKey(type, item.title);

    const bySectionTitle = typedIndex.bySectionTitle.get(sectionTitleKey) || [];
    bySectionTitle.push(item);
    typedIndex.bySectionTitle.set(sectionTitleKey, bySectionTitle);

    const byTitle = typedIndex.byTitle.get(titleKey) || [];
    byTitle.push(item);
    typedIndex.byTitle.set(titleKey, byTitle);
  }

  return indexes;
}

function resolveLinkedEntity(activity, indexes = {}) {
  const config = LINKED_ACTIVITY_CONFIG[activity?.type];
  if (!config) return null;

  const typedIndex = indexes[activity.type];
  if (!typedIndex) return null;

  const directIds = [activity[config.idField], activity.activityId]
    .filter(Boolean);

  for (const id of directIds) {
    const direct = typedIndex.byId.get(id);
    if (direct) return direct;
  }

  const sectionTitleMatches = typedIndex.bySectionTitle.get(
    buildSectionTitleKey(activity.type, activity.sectionId, activity.title || activity.name)
  ) || [];
  if (sectionTitleMatches.length === 1) return sectionTitleMatches[0];

  const titleMatches = typedIndex.byTitle.get(
    buildTitleKey(activity.type, activity.title || activity.name)
  ) || [];
  if (titleMatches.length === 1) return titleMatches[0];

  return null;
}

function enrichCourseActivity(activity, indexes = {}) {
  const cleaned = stripDbKeys(activity);
  const config = LINKED_ACTIVITY_CONFIG[cleaned?.type];
  if (!config) {
    return cleaned;
  }

  const resolved = resolveLinkedEntity(cleaned, indexes);
  const originalActivityId = cleaned.activityId;

  if (!resolved) {
    return {
      ...cleaned,
      courseActivityId: originalActivityId,
      launchActivityId: cleaned[config.idField] || null,
      isBrokenLink: true,
      legacyLinkStatus: 'missing'
    };
  }

  const linkedId = resolved[config.idField];
  const merged = {
    ...cleaned,
    courseActivityId: originalActivityId,
    launchActivityId: linkedId,
    activityId: linkedId,
    [config.idField]: linkedId,
    title: resolved.title || cleaned.title,
    name: resolved.title || cleaned.name || cleaned.title,
    description: resolved.description ?? cleaned.description,
    visible: resolved.visible !== undefined ? resolved.visible : cleaned.visible,
    sectionId: cleaned.sectionId || resolved.sectionId,
    isBrokenLink: false,
    legacyLinkStatus: (
      cleaned[config.idField] === linkedId && originalActivityId === linkedId
    ) ? 'linked' : 'resolved'
  };

  for (const field of config.extractFields) {
    if (resolved[field] !== undefined) {
      merged[field] = resolved[field];
    }
  }

  return merged;
}

function buildActivityRepairPatch(activity, linkedEntity) {
  const config = LINKED_ACTIVITY_CONFIG[activity?.type];
  if (!config || !linkedEntity) return null;

  const linkedId = linkedEntity[config.idField];
  if (!linkedId) return null;

  const patch = {
    activityId: linkedId,
    [config.idField]: linkedId,
    title: linkedEntity.title || activity.title,
    description: linkedEntity.description ?? activity.description,
    visible: linkedEntity.visible !== undefined ? linkedEntity.visible : activity.visible,
    updatedAt: new Date().toISOString()
  };

  for (const field of config.extractFields) {
    if (linkedEntity[field] !== undefined) {
      patch[field] = linkedEntity[field];
    }
  }

  return patch;
}

function normalizeLegacyAssignmentSubmissionType(value, activity = {}) {
  if (value === 'text') return 'online_text';
  if (value) return value;
  return activity.fileId ? 'file' : 'online_text';
}

function buildLinkedEntityFromLegacyActivity(activity, course, generateId) {
  const config = LINKED_ACTIVITY_CONFIG[activity?.type];
  if (!config || typeof generateId !== 'function') return null;

  const now = new Date().toISOString();
  const ownerId = course?.createdBy || course?.creatorId || course?.teacherId || course?.instructorId || 'system';

  if (activity.type === 'assignment') {
    const assignmentId = generateId(config.idPrefix);
    const dueDate = activity.dueDate || activity.availability?.until || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return {
      PK: `ASSIGNMENT#${assignmentId}`,
      SK: 'META',
      entityType: 'ASSIGNMENT',
      GSI1PK: `COURSE#${activity.courseId}`,
      GSI1SK: `ASSIGNMENT#${assignmentId}`,
      GSI2PK: `DUE#${dueDate.substring(0, 10)}`,
      GSI2SK: `ASSIGNMENT#${assignmentId}`,
      assignmentId,
      courseId: activity.courseId,
      sectionId: activity.sectionId,
      title: activity.title || activity.name || 'Untitled assignment',
      description: activity.description || '',
      instructions: activity.instructions || activity.description || '',
      dueDate,
      cutoffDate: activity.cutoffDate || null,
      allowLateSubmission: activity.allowLateSubmission !== false,
      lateDeductionPercent: activity.lateDeductionPercent || 0,
      maxGrade: activity.maxGrade || activity.gradeToPass || 100,
      gradeToPass: activity.gradeToPass || activity.completion?.gradeToPass || 60,
      submissionType: normalizeLegacyAssignmentSubmissionType(activity.submissionType, activity),
      maxFiles: activity.maxFiles || 1,
      maxFileSize: activity.maxFileSize || 10485760,
      allowedFileTypes: Array.isArray(activity.allowedFileTypes) ? activity.allowedFileTypes : [],
      teamSubmission: false,
      teamSize: null,
      rubric: null,
      visible: activity.visible !== false,
      status: activity.status || 'active',
      stats: {
        totalSubmissions: 0,
        gradedCount: 0,
        averageGrade: 0
      },
      createdBy: ownerId,
      createdAt: activity.createdAt || now,
      updatedAt: now
    };
  }

  if (activity.type === 'quiz') {
    const quizId = generateId(config.idPrefix);
    return {
      PK: `QUIZ#${quizId}`,
      SK: 'META',
      entityType: 'QUIZ',
      GSI1PK: `COURSE#${activity.courseId}`,
      GSI1SK: `QUIZ#${quizId}`,
      quizId,
      courseId: activity.courseId,
      sectionId: activity.sectionId,
      title: activity.title || activity.name || 'Untitled quiz',
      description: activity.description || '',
      instructions: activity.instructions || activity.description || '',
      openDate: activity.openDate || null,
      closeDate: activity.closeDate || null,
      timeLimit: activity.timeLimit || null,
      maxAttempts: activity.maxAttempts || null,
      gradeMethod: activity.gradeMethod || 'highest',
      shuffleQuestions: activity.shuffleQuestions === true,
      shuffleAnswers: activity.shuffleAnswers === true,
      showResults: activity.showResults || 'immediately',
      showCorrectAnswers: activity.showCorrectAnswers !== false,
      passingGrade: activity.passingGrade || activity.completion?.gradeToPass || 60,
      questions: Array.isArray(activity.questions) ? activity.questions : [],
      questionCount: Array.isArray(activity.questions) ? activity.questions.length : 0,
      totalPoints: activity.totalPoints || 0,
      visible: activity.visible !== false,
      status: activity.status || 'active',
      stats: {
        totalAttempts: 0,
        averageScore: 0,
        passRate: 0
      },
      createdBy: ownerId,
      createdAt: activity.createdAt || now,
      updatedAt: now
    };
  }

  if (activity.type === 'forum') {
    const forumId = generateId(config.idPrefix);
    return {
      PK: `FORUM#${forumId}`,
      SK: 'META',
      entityType: 'FORUM',
      GSI1PK: `COURSE#${activity.courseId}`,
      GSI1SK: `FORUM#${forumId}`,
      forumId,
      courseId: activity.courseId,
      sectionId: activity.sectionId,
      title: activity.title || activity.name || 'Untitled forum',
      description: activity.description || '',
      type: activity.forumType || activity.mode || 'general',
      forumMode: activity.forumMode || 'standard',
      subscriptionMode: activity.subscriptionMode || 'optional',
      ratingEnabled: activity.ratingEnabled === true,
      maxAttachments: activity.maxAttachments || 3,
      maxAttachmentSize: activity.maxAttachmentSize || 5242880,
      visible: activity.visible !== false,
      stats: {
        discussionCount: 0,
        postCount: 0
      },
      createdBy: ownerId,
      createdAt: activity.createdAt || now,
      updatedAt: now
    };
  }

  return null;
}

module.exports = {
  LINKED_ACTIVITY_CONFIG,
  createLinkedEntityIndexes,
  resolveLinkedEntity,
  enrichCourseActivity,
  buildActivityRepairPatch,
  buildLinkedEntityFromLegacyActivity
};
