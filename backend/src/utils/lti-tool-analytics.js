const db = require('./db');
const { syncInviteClassMembersForCourse } = require('./class-course-links');

const TEACHING_ROLES = new Set(['teacher', 'instructor', 'admin', 'manager', 'assistant']);
const GAME_TYPES = ['matching', 'sorting', 'maze', 'bingo', 'duel'];
const TOTAL_VOCABULARY = 27;
const TOTAL_DIALOGUES = 7;
const TOTAL_PRACTICES = 5;

function clampPercentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function toPositiveNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(baseValue, nextValue) {
  if (Array.isArray(nextValue)) {
    return [...nextValue];
  }

  if (!isPlainObject(nextValue)) {
    return nextValue;
  }

  const source = isPlainObject(baseValue) ? baseValue : {};
  const merged = { ...source };

  Object.entries(nextValue).forEach(([key, value]) => {
    merged[key] = deepMerge(source[key], value);
  });

  return merged;
}

function isTeachingRole(role) {
  return TEACHING_ROLES.has(String(role || '').trim().toLowerCase());
}

function dedupeValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeAchievementState(current = {}, incoming = {}) {
  return {
    ...current,
    ...incoming,
    unlocked: dedupeValues([...(current.unlocked || []), ...(incoming.unlocked || [])]),
    unlockedAt: {
      ...(current.unlockedAt || {}),
      ...(incoming.unlockedAt || {})
    }
  };
}

function mergeLatestDetails(records = []) {
  const latestByUnit = new Map();

  records.forEach((record) => {
    const unit = String(record.unit || 'general');
    const current = latestByUnit.get(unit);
    if (!current || new Date(record.createdAt || 0).getTime() > new Date(current.createdAt || 0).getTime()) {
      latestByUnit.set(unit, record);
    }
  });

  const merged = {
    vocabulary: {},
    dialogue: {},
    practice: {},
    statistics: null,
    achievements: null
  };

  Array.from(latestByUnit.values())
    .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
    .forEach((record) => {
      const details = record.details || {};
      if (details.vocabulary) {
        merged.vocabulary = deepMerge(merged.vocabulary, details.vocabulary);
      }
      if (details.dialogue) {
        merged.dialogue = deepMerge(merged.dialogue, details.dialogue);
      }
      if (details.practice) {
        merged.practice = deepMerge(merged.practice, details.practice);
      }
      if (details.statistics) {
        merged.statistics = deepMerge(merged.statistics || {}, details.statistics);
      }
      if (details.achievements) {
        merged.achievements = normalizeAchievementState(merged.achievements || {}, details.achievements);
      }
    });

  return merged;
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function getVocabularyViewedCount(vocabulary = {}) {
  return Math.max(
    countArray(vocabulary.learned),
    countArray(vocabulary.viewedCards),
    toPositiveNumber(vocabulary.flashcards?.viewed),
    toPositiveNumber(vocabulary.viewed)
  );
}

function getVocabularyMasteredCount(vocabulary = {}) {
  return Math.max(
    countArray(vocabulary.masteredCards),
    countArray(vocabulary.mastered),
    toPositiveNumber(vocabulary.masteredCount)
  );
}

function getDialogueCompletedCount(dialogue = {}) {
  return Math.max(
    countArray(dialogue.completed),
    countArray(dialogue.completedScenarios),
    toPositiveNumber(dialogue.scenarios?.completed)
  );
}

function getPracticeCompletedCount(practice = {}) {
  const objectCount = Object.values(practice || {}).reduce((total, entry) => {
    if (entry === true) return total + 1;
    if (entry && typeof entry === 'object' && entry.completed === true) return total + 1;
    return total;
  }, 0);

  return Math.max(
    countArray(practice.completed),
    toPositiveNumber(practice.totalCompleted),
    objectCount
  );
}

function extractViewedCardNumbers(vocabulary = {}) {
  const source = []
    .concat(Array.isArray(vocabulary.viewedCards) ? vocabulary.viewedCards : [])
    .concat(Array.isArray(vocabulary.masteredCards) ? vocabulary.masteredCards : [])
    .concat(Array.isArray(vocabulary.learned) ? vocabulary.learned : []);

  return dedupeValues(
    source
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value))
  );
}

function summarizeVocabulary(vocabulary = {}) {
  const viewed = getVocabularyViewedCount(vocabulary);
  const mastered = getVocabularyMasteredCount(vocabulary);
  const viewedCards = extractViewedCardNumbers(vocabulary);
  return {
    viewed,
    mastered,
    total: TOTAL_VOCABULARY,
    viewedCards,
    percent: clampPercentage((viewed / TOTAL_VOCABULARY) * 100)
  };
}

function summarizeDialogue(dialogue = {}) {
  const completed = getDialogueCompletedCount(dialogue);
  const completedScenarios = Array.isArray(dialogue.completedScenarios)
    ? [...dialogue.completedScenarios]
    : Array.isArray(dialogue.completed)
      ? [...dialogue.completed]
      : [];

  return {
    completed,
    total: TOTAL_DIALOGUES,
    completedScenarios,
    percent: clampPercentage((completed / TOTAL_DIALOGUES) * 100)
  };
}

function summarizePractice(practice = {}) {
  const completed = getPracticeCompletedCount(practice);
  return {
    completed,
    total: TOTAL_PRACTICES,
    percent: clampPercentage((completed / TOTAL_PRACTICES) * 100)
  };
}

function summarizeStatistics(statistics = {}) {
  const gamesPlayed = {};
  const bestScores = {};

  GAME_TYPES.forEach((gameType) => {
    gamesPlayed[gameType] = toPositiveNumber(statistics?.gamesPlayed?.[gameType]);
    bestScores[gameType] = toPositiveNumber(statistics?.bestScores?.[gameType]);
  });

  return {
    totalStudyTime: toPositiveNumber(statistics?.totalStudyTime),
    dailyStreak: toPositiveNumber(statistics?.dailyStreak),
    lastStudyDate: statistics?.lastStudyDate || null,
    gamesPlayed,
    bestScores
  };
}

function computeOverallProgress(summary) {
  return clampPercentage(
    (summary.vocabulary.percent + summary.dialogue.percent + summary.practice.percent) / 3
  );
}

function normalizeWeekday(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function buildTimeTrend(recordsByUser, studentCount) {
  const dayTotalsInSeconds = [0, 0, 0, 0, 0, 0, 0];

  recordsByUser.forEach((records) => {
    const sortedRecords = [...records]
      .filter((record) => record?.details?.statistics)
      .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime());

    let previousTotal = 0;
    sortedRecords.forEach((record) => {
      const currentTotal = toPositiveNumber(record.details?.statistics?.totalStudyTime);
      const delta = currentTotal > previousTotal ? currentTotal - previousTotal : 0;
      previousTotal = Math.max(previousTotal, currentTotal);
      const weekdayIndex = normalizeWeekday(record.createdAt);
      if (weekdayIndex !== null) {
        dayTotalsInSeconds[weekdayIndex] += delta;
      }
    });
  });

  return dayTotalsInSeconds.map((seconds) => {
    if (studentCount <= 0) return 0;
    return Math.round((seconds / 60) / studentCount);
  });
}

function buildAttentionReason(summary, nowTs) {
  const lastActiveTs = summary.lastActive ? new Date(summary.lastActive).getTime() : 0;
  const oneWeekAgo = nowTs - (7 * 24 * 60 * 60 * 1000);

  if (lastActiveTs > 0 && lastActiveTs < oneWeekAgo) {
    return { type: 'inactive', reason: '超過 7 天未學習' };
  }

  if (summary.progress < 30) {
    return { type: 'progress', reason: `進度落後 (${summary.progress}%)` };
  }

  return null;
}

async function loadCourseStudents(course) {
  await syncInviteClassMembersForCourse(course).catch((error) => {
    console.error('[LTIAnalytics] Sync invite class members failed:', {
      courseId: course?.courseId,
      error: error.message
    });
  });

  const enrollments = await db.queryByIndex(
    'GSI1',
    `COURSE#${course.courseId}`,
    'GSI1PK',
    { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
  );

  const studentEnrollments = enrollments.filter((enrollment) => !isTeachingRole(enrollment.role));
  const studentProfiles = await Promise.all(studentEnrollments.map((enrollment) => db.getUser(enrollment.userId)));

  return studentEnrollments.map((enrollment, index) => {
    const profile = studentProfiles[index];
    return {
      userId: enrollment.userId,
      displayName: profile?.displayName || enrollment.userName || enrollment.userId,
      email: profile?.email || enrollment.userEmail || null,
      enrolledAt: enrollment.enrolledAt || null,
      courseProgress: clampPercentage(enrollment.progressPercentage),
      courseLastAccessedAt: enrollment.lastAccessedAt || null
    };
  });
}

async function loadToolCourseProgress(toolId, courseId) {
  const records = await db.query(`LTI_PROGRESS#${toolId}`, {
    filter: {
      expression: 'courseId = :courseId',
      values: { ':courseId': courseId }
    }
  });

  const recordsByUser = new Map();
  records.forEach((record) => {
    if (!record?.userId) return;
    if (!recordsByUser.has(record.userId)) {
      recordsByUser.set(record.userId, []);
    }
    recordsByUser.get(record.userId).push(record);
  });

  return recordsByUser;
}

function buildStudentSummary(student, records = []) {
  const merged = mergeLatestDetails(records);
  const vocabulary = summarizeVocabulary(merged.vocabulary);
  const dialogue = summarizeDialogue(merged.dialogue);
  const practice = summarizePractice(merged.practice);
  const statistics = summarizeStatistics(merged.statistics);
  const achievements = normalizeAchievementState({ unlocked: [], unlockedAt: {} }, merged.achievements || {});
  const progress = computeOverallProgress({ vocabulary, dialogue, practice });
  const gamesPlayed = GAME_TYPES.reduce((total, gameType) => total + statistics.gamesPlayed[gameType], 0);
  const lastRecordAt = records
    .map((record) => record.createdAt)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  const lastActive = statistics.lastStudyDate || lastRecordAt || null;

  return {
    studentId: student.userId,
    studentName: student.displayName,
    studentEmail: student.email,
    progress,
    lastActive,
    vocabulary,
    dialogue,
    practice,
    statistics,
    achievements,
    gamesPlayed
  };
}

async function buildCourseToolAnalytics(toolId, courseId) {
  const course = await db.getItem(`COURSE#${courseId}`, 'META');
  if (!course) {
    const error = new Error('COURSE_NOT_FOUND');
    error.status = 404;
    throw error;
  }

  const [students, recordsByUser] = await Promise.all([
    loadCourseStudents(course),
    loadToolCourseProgress(toolId, courseId)
  ]);

  const summaries = students.map((student) => buildStudentSummary(student, recordsByUser.get(student.userId) || []));
  const studentCount = summaries.length;
  const nowTs = Date.now();
  const oneWeekAgo = nowTs - (7 * 24 * 60 * 60 * 1000);

  let totalProgress = 0;
  let totalStudyTime = 0;
  let activeCount = 0;
  const progressDistribution = [0, 0, 0, 0, 0];
  const gamePreferences = GAME_TYPES.reduce((accumulator, gameType) => ({ ...accumulator, [gameType]: 0 }), {});
  let fruitTotal = 0;
  let vegTotal = 0;
  let itemTotal = 0;
  const attentionStudents = [];

  summaries.forEach((summary) => {
    totalProgress += summary.progress;
    totalStudyTime += summary.statistics.totalStudyTime;

    const lastActiveTs = summary.lastActive ? new Date(summary.lastActive).getTime() : 0;
    if (lastActiveTs > oneWeekAgo) {
      activeCount += 1;
    }

    const attention = buildAttentionReason(summary, nowTs);
    if (attention) {
      attentionStudents.push({
        username: summary.studentId,
        displayName: summary.studentName,
        classId: courseId,
        type: attention.type,
        reason: attention.reason
      });
    }

    const bucket = Math.min(4, Math.floor(summary.progress / 20.01));
    progressDistribution[bucket] += 1;

    GAME_TYPES.forEach((gameType) => {
      gamePreferences[gameType] += summary.statistics.gamesPlayed[gameType];
    });

    summary.vocabulary.viewedCards.forEach((cardId) => {
      if (cardId >= 1 && cardId <= 12) fruitTotal += 1;
      else if (cardId >= 13 && cardId <= 25) vegTotal += 1;
      else if (cardId >= 26 && cardId <= 27) itemTotal += 1;
    });
  });

  const timeData = buildTimeTrend(recordsByUser, studentCount);
  const sortedSummaries = [...summaries].sort((left, right) => {
    const leftTs = left.lastActive ? new Date(left.lastActive).getTime() : 0;
    const rightTs = right.lastActive ? new Date(right.lastActive).getTime() : 0;
    return rightTs - leftTs;
  });

  return {
    course,
    summaries,
    stats: {
      studentCount,
      activeCount,
      avgProgress: studentCount > 0 ? Math.round(totalProgress / studentCount) : 0,
      avgStudyTime: studentCount > 0 ? Math.round(totalStudyTime / studentCount) : 0,
      attentionStudents: attentionStudents.slice(0, 5)
    },
    students: sortedSummaries.map((summary) => ({
      username: summary.studentId,
      displayName: summary.studentName,
      lastActive: summary.lastActive,
      vocabularyProgress: {
        viewed: summary.vocabulary.viewed,
        mastered: summary.vocabulary.mastered,
        total: summary.vocabulary.total,
        percent: summary.vocabulary.percent
      },
      dialogueProgress: {
        completed: summary.dialogue.completed,
        total: summary.dialogue.total
      },
      totalStudyTime: summary.statistics.totalStudyTime,
      gamesPlayed: summary.gamesPlayed,
      dailyStreak: summary.statistics.dailyStreak,
      achievementsUnlocked: summary.achievements.unlocked?.length || 0
    })),
    analytics: {
      progressDistribution,
      vocabMastery: studentCount > 0 ? [
        Math.round((fruitTotal / (studentCount * 12)) * 100),
        Math.round((vegTotal / (studentCount * 13)) * 100),
        Math.round((itemTotal / (studentCount * 2)) * 100)
      ] : [0, 0, 0],
      gamePreferences: GAME_TYPES.map((gameType) => gamePreferences[gameType]),
      timeData
    }
  };
}

async function buildCourseToolStudentDetail(toolId, courseId, userId) {
  const courseData = await buildCourseToolAnalytics(toolId, courseId);
  const summary = courseData.summaries.find((item) => item.studentId === userId);

  if (!summary) {
    const error = new Error('STUDENT_NOT_FOUND');
    error.status = 404;
    throw error;
  }

  const byCategory = {
    fruit: {
      viewed: summary.vocabulary.viewedCards.filter((id) => id >= 1 && id <= 12).length,
      mastered: 0,
      total: 12
    },
    vegetable: {
      viewed: summary.vocabulary.viewedCards.filter((id) => id >= 13 && id <= 25).length,
      mastered: 0,
      total: 13
    },
    item: {
      viewed: summary.vocabulary.viewedCards.filter((id) => id >= 26 && id <= 27).length,
      mastered: 0,
      total: 2
    }
  };

  const games = {};
  GAME_TYPES.forEach((gameType) => {
    games[gameType] = {
      played: summary.statistics.gamesPlayed[gameType],
      bestScore: summary.statistics.bestScores[gameType]
    };
  });

  return {
    success: true,
    student: {
      username: summary.studentId,
      displayName: summary.studentName
    },
    vocabulary: {
      viewed: summary.vocabulary.viewed,
      mastered: summary.vocabulary.mastered,
      total: summary.vocabulary.total,
      byCategory
    },
    dialogue: {
      completed: summary.dialogue.completed,
      total: summary.dialogue.total,
      scenarios: summary.dialogue.completedScenarios.map((id) => ({ id, status: 'completed' }))
    },
    games,
    statistics: {
      totalStudyTime: summary.statistics.totalStudyTime,
      dailyStreak: summary.statistics.dailyStreak,
      lastStudyDate: summary.statistics.lastStudyDate
    },
    achievements: {
      unlocked: summary.achievements.unlocked || [],
      unlockedAt: summary.achievements.unlockedAt || {},
      total: 9
    }
  };
}

module.exports = {
  buildCourseToolAnalytics,
  buildCourseToolStudentDetail
};
