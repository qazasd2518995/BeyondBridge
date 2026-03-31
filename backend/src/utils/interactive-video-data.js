const db = require('./db');

const INTERACTIVE_VIDEO_ATTEMPT_PROJECTION = [
  'PK',
  'SK',
  'userId',
  'courseId',
  'activityId',
  'status',
  'watchedSeconds',
  'lastPositionSecond',
  'progressPercentage',
  'answeredPromptIds',
  'triggeredPromptIds',
  'score',
  'maxScore',
  'lastAccessedAt',
  'completedAt',
  'updatedAt'
];

function clampPercent(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
}

function toNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function extractYouTubeId(value = '') {
  const source = String(value || '').trim();
  if (!source) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&?/]+)/i,
    /(?:youtu\.be\/)([^&?/]+)/i,
    /(?:youtube\.com\/embed\/)([^&?/]+)/i,
    /(?:youtube\.com\/shorts\/)([^&?/]+)/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1];
  }
  if (/^[A-Za-z0-9_-]{6,}$/.test(source)) return source;
  return null;
}

function normalizePrompt(prompt = {}, index = 0) {
  const options = Array.isArray(prompt.options)
    ? prompt.options.map((option, optionIndex) => {
        if (typeof option === 'object' && option !== null) {
          return {
            value: option.value ?? `option_${optionIndex + 1}`,
            label: option.label ?? option.text ?? String(option.value ?? `Option ${optionIndex + 1}`)
          };
        }
        return {
          value: String(option),
          label: String(option)
        };
      })
    : [];

  return {
    promptId: prompt.promptId || `prompt_${String(index + 1).padStart(3, '0')}`,
    triggerSecond: Math.max(0, Math.floor(Number(prompt.triggerSecond) || 0)),
    questionType: prompt.questionType || 'single_choice',
    question: String(prompt.question || '').trim(),
    options,
    points: Math.max(0, Number(prompt.points) || 0),
    required: prompt.required !== false,
    pauseVideo: prompt.pauseVideo !== false,
    correctAnswer: prompt.correctAnswer ?? null,
    feedbackCorrect: prompt.feedbackCorrect || '',
    feedbackIncorrect: prompt.feedbackIncorrect || '',
    speakerName: prompt.speakerName || '',
    speakerAvatar: prompt.speakerAvatar || ''
  };
}

function normalizeInteractiveVideoConfig(activity = {}) {
  if (activity?.type !== 'interactive_video' && !activity?.interactiveVideo) {
    return null;
  }

  const raw = activity?.interactiveVideo && typeof activity.interactiveVideo === 'object'
    ? activity.interactiveVideo
    : {};
  const prompts = (Array.isArray(raw.prompts) ? raw.prompts : [])
    .map((prompt, index) => normalizePrompt(prompt, index))
    .filter((prompt) => prompt.question)
    .sort((a, b) => a.triggerSecond - b.triggerSecond);

  return {
    videoUrl: raw.videoUrl || activity.url || '',
    youtubeId: raw.youtubeId || activity.youtubeId || extractYouTubeId(raw.videoUrl || activity.url || ''),
    durationSeconds: Math.max(0, Math.floor(Number(raw.durationSeconds || activity.durationSeconds || 0) || 0)),
    gradingMode: raw.gradingMode || 'graded',
    passingScore: clampPercent(raw.passingScore, 70),
    completionRule: {
      minWatchPercent: clampPercent(raw?.completionRule?.minWatchPercent, 85),
      requiredPromptMode: raw?.completionRule?.requiredPromptMode || 'all'
    },
    speakerName: raw.speakerName || '',
    speakerAvatar: raw.speakerAvatar || '',
    categoryId: raw.categoryId || null,
    weight: raw.weight ?? null,
    prompts
  };
}

function getInteractiveVideoMaxScore(activity = {}) {
  const config = normalizeInteractiveVideoConfig(activity);
  if (!config) return 0;
  return Math.max(0, config.prompts.reduce((sum, prompt) => sum + (Number(prompt.points) || 0), 0));
}

function normalizeInteractiveVideoGradeItem(activity = {}) {
  const config = normalizeInteractiveVideoConfig(activity);
  if (!config) return null;

  const activityId = activity.activityId || activity.itemId || activity.id || null;
  const maxScore = getInteractiveVideoMaxScore(activity);

  return {
    id: activityId,
    itemId: activityId,
    activityId,
    type: 'interactive_video',
    title: activity.title || activity.name || '互動影片',
    description: activity.description || '',
    sectionId: activity.sectionId || null,
    maxGrade: maxScore,
    maxScore,
    weight: config.weight ?? null,
    categoryId: config.categoryId || 'default_quizzes',
    dueDate: activity.dueDate || null,
    hidden: !!activity.hidden,
    gradingMode: config.gradingMode,
    passingScore: config.passingScore,
    completionRule: config.completionRule,
    promptCount: config.prompts.length,
    youtubeId: config.youtubeId,
    videoUrl: config.videoUrl,
    speakerName: config.speakerName,
    speakerAvatar: config.speakerAvatar
  };
}

async function getCourseInteractiveVideoActivities(courseId, { gradedOnly = false } = {}) {
  if (!courseId) return [];
  const activities = await db.query(`COURSE#${courseId}`, { skPrefix: 'ACTIVITY#' });
  return activities
    .filter((activity) => activity?.type === 'interactive_video')
    .map((activity) => ({
      ...activity,
      interactiveVideo: normalizeInteractiveVideoConfig(activity)
    }))
    .filter((activity) => activity.interactiveVideo)
    .filter((activity) => !gradedOnly || activity.interactiveVideo.gradingMode === 'graded');
}

async function getInteractiveVideoAttemptsByActivity(courseId, activities = [], studentIds = []) {
  const normalizedActivities = (Array.isArray(activities) ? activities : [])
    .map((activity) => ({
      ...activity,
      itemId: activity.itemId || activity.activityId || activity.id || null
    }))
    .filter((activity) => activity.itemId);
  const uniqueStudentIds = [...new Set((studentIds || []).filter(Boolean))];

  if (normalizedActivities.length === 0 || uniqueStudentIds.length === 0) {
    return new Map();
  }

  const attemptRows = await db.batchGetItems(
    uniqueStudentIds.flatMap((studentId) => normalizedActivities.map((activity) => ({
      PK: `USER#${studentId}`,
      SK: `INTERACTIVE_VIDEO#${activity.itemId}`
    }))),
    { projection: INTERACTIVE_VIDEO_ATTEMPT_PROJECTION }
  );

  const attemptsByActivity = new Map(
    normalizedActivities.map((activity) => [activity.itemId, new Map()])
  );

  attemptRows.forEach((row) => {
    const activityId = row.activityId || (typeof row.SK === 'string' ? row.SK.replace('INTERACTIVE_VIDEO#', '') : null);
    const userId = row.userId || (typeof row.PK === 'string' ? row.PK.replace('USER#', '') : null);
    if (!activityId || !userId) return;
    if (!attemptsByActivity.has(activityId)) {
      attemptsByActivity.set(activityId, new Map());
    }
    attemptsByActivity.get(activityId).set(userId, row);
  });

  return attemptsByActivity;
}

function hasInteractiveVideoAttemptStarted(attempt = {}) {
  return Number(attempt?.watchedSeconds || 0) > 0
    || Number(attempt?.progressPercentage || 0) > 0
    || (Array.isArray(attempt?.answeredPromptIds) && attempt.answeredPromptIds.length > 0);
}

function calculateInteractiveVideoScorePercent(attempt = {}, item = {}) {
  const score = Number(attempt?.score);
  const maxScore = Number(attempt?.maxScore ?? item?.maxScore ?? item?.maxGrade);
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 10000) / 100;
}

module.exports = {
  INTERACTIVE_VIDEO_ATTEMPT_PROJECTION,
  normalizeInteractiveVideoConfig,
  normalizeInteractiveVideoGradeItem,
  getInteractiveVideoMaxScore,
  getCourseInteractiveVideoActivities,
  getInteractiveVideoAttemptsByActivity,
  hasInteractiveVideoAttemptStarted,
  calculateInteractiveVideoScorePercent
};
