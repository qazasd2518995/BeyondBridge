const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { canManageCourse } = require('../utils/course-access');
const { invalidateGradebookSnapshots } = require('../utils/gradebook-snapshots');

function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function toPositiveSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function getAttemptKey(userId, activityId) {
  return {
    PK: `USER#${userId}`,
    SK: `INTERACTIVE_VIDEO#${activityId}`
  };
}

async function getCourseContext(courseId, user) {
  const course = await db.getItem(`COURSE#${courseId}`, 'META');
  if (!course) return { course: null, progress: null, canAccess: false, canManage: false };

  const progress = user?.userId
    ? await db.getItem(`USER#${user.userId}`, `PROG#COURSE#${courseId}`)
    : null;
  const canManage = canManageCourse(course, user);
  const canAccess = Boolean(user?.isAdmin || canManage || progress);
  return { course, progress, canAccess, canManage };
}

async function getCourseActivity(courseId, activityId) {
  const activities = await db.query(`COURSE#${courseId}`, { skPrefix: 'ACTIVITY#' });
  return activities.find((activity) => activity?.activityId === activityId) || null;
}

function getInteractiveVideoConfig(activity = {}) {
  if (activity?.type !== 'interactive_video') return null;
  const config = activity.interactiveVideo && typeof activity.interactiveVideo === 'object'
    ? activity.interactiveVideo
    : {};
  const prompts = Array.isArray(config.prompts)
    ? config.prompts
        .filter(Boolean)
        .map((prompt, index) => ({
          promptId: prompt.promptId || `prompt_${String(index + 1).padStart(3, '0')}`,
          triggerSecond: Math.max(0, Math.floor(Number(prompt.triggerSecond) || 0)),
          questionType: prompt.questionType || 'single_choice',
          question: String(prompt.question || '').trim(),
          options: Array.isArray(prompt.options)
            ? prompt.options.map((option, optionIndex) => (
              typeof option === 'object' && option !== null
                ? {
                    value: option.value ?? `option_${optionIndex + 1}`,
                    label: option.label ?? option.text ?? String(option.value ?? `Option ${optionIndex + 1}`)
                  }
                : {
                    value: String(option),
                    label: String(option)
                  }
            ))
            : [],
          correctAnswer: prompt.correctAnswer ?? null,
          points: Math.max(0, Number(prompt.points) || 0),
          required: prompt.required !== false,
          pauseVideo: prompt.pauseVideo !== false,
          feedbackCorrect: prompt.feedbackCorrect || '',
          feedbackIncorrect: prompt.feedbackIncorrect || '',
          speakerName: prompt.speakerName || config.speakerName || '',
          speakerAvatar: prompt.speakerAvatar || config.speakerAvatar || ''
        }))
        .filter((prompt) => prompt.question)
        .sort((a, b) => a.triggerSecond - b.triggerSecond)
    : [];

  const durationSeconds = Math.max(0, Math.floor(Number(config.durationSeconds || activity.durationSeconds || 0) || 0));

  return {
    youtubeId: config.youtubeId || activity.youtubeId || null,
    videoUrl: config.videoUrl || activity.url || '',
    durationSeconds,
    gradingMode: config.gradingMode || 'graded',
    passingScore: clampNumber(config.passingScore, 0, 100, 70),
    completionRule: {
      minWatchPercent: clampNumber(config?.completionRule?.minWatchPercent, 0, 100, 85),
      requiredPromptMode: config?.completionRule?.requiredPromptMode || 'all'
    },
    speakerName: config.speakerName || '',
    speakerAvatar: config.speakerAvatar || '',
    prompts
  };
}

function sanitizeConfigForLearner(config = {}) {
  return {
    ...config,
    prompts: (config.prompts || []).map((prompt) => {
      const sanitized = { ...prompt };
      delete sanitized.correctAnswer;
      return sanitized;
    })
  };
}

function calculateAttemptStats(config = {}, attempt = {}) {
  const prompts = Array.isArray(config.prompts) ? config.prompts : [];
  const answers = attempt.answers && typeof attempt.answers === 'object' ? attempt.answers : {};
  const watchedSeconds = toPositiveSeconds(attempt.watchedSeconds);
  const durationSeconds = Math.max(1, Number(config.durationSeconds) || 1);
  const watchPercent = Math.min(100, Math.round((watchedSeconds / durationSeconds) * 100));
  const requiredPrompts = prompts.filter((prompt) => prompt.required !== false);
  const answeredRequiredCount = requiredPrompts.filter((prompt) => answers[prompt.promptId]).length;
  const allRequiredAnswered = requiredPrompts.length === 0 || answeredRequiredCount >= requiredPrompts.length;

  let earnedScore = 0;
  let maxScore = 0;
  let correctCount = 0;

  prompts.forEach((prompt) => {
    const answerRecord = answers[prompt.promptId];
    const isGradable = ['single_choice', 'true_false'].includes(prompt.questionType) && prompt.points > 0;
    if (isGradable) {
      maxScore += prompt.points;
      if (answerRecord?.isCorrect) {
        earnedScore += prompt.points;
        correctCount += 1;
      }
    } else if (answerRecord?.isCorrect) {
      correctCount += 1;
    }
  });

  const scorePercent = maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : null;
  const passedScoreGate = config?.gradingMode === 'graded' && maxScore > 0
    ? (scorePercent !== null && scorePercent >= clampNumber(config?.passingScore, 0, 100, 70))
    : true;
  const completionEligible = watchPercent >= clampNumber(config?.completionRule?.minWatchPercent, 0, 100, 85)
    && allRequiredAnswered
    && passedScoreGate;

  return {
    watchedSeconds,
    watchPercent,
    answeredRequiredCount,
    requiredPromptCount: requiredPrompts.length,
    allRequiredAnswered,
    earnedScore,
    maxScore,
    scorePercent,
    correctCount,
    passedScoreGate,
    completionEligible
  };
}

function evaluatePromptAnswer(prompt, answer) {
  const normalizedType = String(prompt?.questionType || '').toLowerCase();
  if (normalizedType === 'short_text_reflection') {
    return {
      normalizedAnswer: String(answer || '').trim(),
      isCorrect: null
    };
  }

  if (normalizedType === 'true_false') {
    const expected = String(prompt.correctAnswer).toLowerCase();
    const actual = String(answer).toLowerCase();
    return {
      normalizedAnswer: actual,
      isCorrect: actual === expected
    };
  }

  const actual = Array.isArray(answer) ? answer.map(item => String(item)) : String(answer ?? '');
  const expected = Array.isArray(prompt.correctAnswer)
    ? prompt.correctAnswer.map(item => String(item)).sort()
    : String(prompt.correctAnswer ?? '');

  if (Array.isArray(actual) && Array.isArray(expected)) {
    return {
      normalizedAnswer: actual.sort(),
      isCorrect: JSON.stringify(actual.sort()) === JSON.stringify(expected)
    };
  }

  return {
    normalizedAnswer: actual,
    isCorrect: String(actual) === String(expected)
  };
}

async function ensureAttempt(userId, courseId, activityId, config = {}) {
  const key = getAttemptKey(userId, activityId);
  const existing = await db.getItem(key.PK, key.SK);
  if (existing) return existing;

  const now = new Date().toISOString();
  const freshAttempt = {
    PK: key.PK,
    SK: key.SK,
    entityType: 'INTERACTIVE_VIDEO_ATTEMPT',
    userId,
    courseId,
    activityId,
    status: 'in_progress',
    watchedSeconds: 0,
    lastPositionSecond: 0,
    progressPercentage: 0,
    answers: {},
    triggeredPromptIds: [],
    answeredPromptIds: [],
    score: 0,
    maxScore: 0,
    speakerName: config.speakerName || '',
    speakerAvatar: config.speakerAvatar || '',
    startedAt: now,
    lastAccessedAt: now,
    updatedAt: now
  };

  await db.putItem(freshAttempt);
  return freshAttempt;
}

router.get('/:courseId/:activityId', authMiddleware, async (req, res) => {
  try {
    const { courseId, activityId } = req.params;
    const { course, canAccess, canManage } = await getCourseContext(courseId, req.user);

    if (!course) {
      return res.status(404).json({ success: false, message: '找不到課程' });
    }
    if (!canAccess) {
      return res.status(403).json({ success: false, message: '沒有權限查看此互動影片' });
    }

    const activity = await getCourseActivity(courseId, activityId);
    if (!activity || activity.type !== 'interactive_video') {
      return res.status(404).json({ success: false, message: '找不到互動影片活動' });
    }

    const config = getInteractiveVideoConfig(activity);
    const attempt = await db.getItem(`USER#${req.user.userId}`, `INTERACTIVE_VIDEO#${activityId}`);
    const stats = calculateAttemptStats(config, attempt || {});

    res.json({
      success: true,
      data: {
        activityId,
        courseId,
        sectionId: activity.sectionId || null,
        title: activity.title,
        description: activity.description || '',
        interactiveVideo: canManage ? config : sanitizeConfigForLearner(config),
        attempt: attempt ? {
          ...attempt,
          summary: stats
        } : null
      }
    });
  } catch (error) {
    console.error('Get interactive video failed:', error);
    res.status(500).json({ success: false, message: '載入互動影片失敗' });
  }
});

router.post('/:courseId/:activityId/session', authMiddleware, async (req, res) => {
  try {
    const { courseId, activityId } = req.params;
    const { course, canAccess } = await getCourseContext(courseId, req.user);

    if (!course) {
      return res.status(404).json({ success: false, message: '找不到課程' });
    }
    if (!canAccess) {
      return res.status(403).json({ success: false, message: '沒有權限開始互動影片' });
    }

    const activity = await getCourseActivity(courseId, activityId);
    if (!activity || activity.type !== 'interactive_video') {
      return res.status(404).json({ success: false, message: '找不到互動影片活動' });
    }

    const config = getInteractiveVideoConfig(activity);
    const attempt = await ensureAttempt(req.user.userId, courseId, activityId, config);
    const now = new Date().toISOString();
    const updated = await db.updateItem(`USER#${req.user.userId}`, `INTERACTIVE_VIDEO#${activityId}`, {
      lastAccessedAt: now,
      updatedAt: now
    });

    res.json({
      success: true,
      data: {
        attempt: {
          ...updated,
          summary: calculateAttemptStats(config, updated)
        }
      }
    });
  } catch (error) {
    console.error('Start interactive video session failed:', error);
    res.status(500).json({ success: false, message: '建立互動影片 session 失敗' });
  }
});

router.post('/:courseId/:activityId/heartbeat', authMiddleware, async (req, res) => {
  try {
    const { courseId, activityId } = req.params;
    const { course, canAccess } = await getCourseContext(courseId, req.user);
    if (!course) {
      return res.status(404).json({ success: false, message: '找不到課程' });
    }
    if (!canAccess) {
      return res.status(403).json({ success: false, message: '沒有權限更新互動影片進度' });
    }

    const activity = await getCourseActivity(courseId, activityId);
    if (!activity || activity.type !== 'interactive_video') {
      return res.status(404).json({ success: false, message: '找不到互動影片活動' });
    }

    const config = getInteractiveVideoConfig(activity);
    const attempt = await ensureAttempt(req.user.userId, courseId, activityId, config);
    const playedDelta = toPositiveSeconds(req.body?.playedDelta);
    const currentTime = Math.max(0, Math.floor(Number(req.body?.currentTime) || 0));
    const playerState = String(req.body?.playerState || '').toLowerCase();
    const visible = req.body?.visible !== false;
    const now = new Date().toISOString();

    const shouldCountTime = visible && playerState === 'playing' && playedDelta > 0 && playedDelta <= 15;
    const watchedSeconds = toPositiveSeconds(attempt.watchedSeconds) + (shouldCountTime ? playedDelta : 0);
    const progressPercentage = config.durationSeconds > 0
      ? Math.min(100, Math.round((Math.max(currentTime, watchedSeconds) / config.durationSeconds) * 100))
      : clampNumber(req.body?.progressPercentage, 0, 100, attempt.progressPercentage || 0);

    const updated = await db.updateItem(`USER#${req.user.userId}`, `INTERACTIVE_VIDEO#${activityId}`, {
      watchedSeconds,
      lastPositionSecond: currentTime,
      progressPercentage,
      lastAccessedAt: now,
      updatedAt: now
    });

    res.json({
      success: true,
      data: {
        watchedSeconds: updated.watchedSeconds || watchedSeconds,
        progressPercentage: updated.progressPercentage || progressPercentage
      }
    });
  } catch (error) {
    console.error('Interactive video heartbeat failed:', error);
    res.status(500).json({ success: false, message: '更新互動影片進度失敗' });
  }
});

router.post('/:courseId/:activityId/answer', authMiddleware, async (req, res) => {
  try {
    const { courseId, activityId } = req.params;
    const { course, canAccess } = await getCourseContext(courseId, req.user);
    if (!course) {
      return res.status(404).json({ success: false, message: '找不到課程' });
    }
    if (!canAccess) {
      return res.status(403).json({ success: false, message: '沒有權限作答' });
    }

    const activity = await getCourseActivity(courseId, activityId);
    if (!activity || activity.type !== 'interactive_video') {
      return res.status(404).json({ success: false, message: '找不到互動影片活動' });
    }

    const config = getInteractiveVideoConfig(activity);
    const promptId = String(req.body?.promptId || '');
    const answer = req.body?.answer;
    const currentTime = Math.max(0, Math.floor(Number(req.body?.currentTime) || 0));
    const prompt = (config.prompts || []).find((item) => item.promptId === promptId);

    if (!prompt) {
      return res.status(404).json({ success: false, message: '找不到提問節點' });
    }

    const attempt = await ensureAttempt(req.user.userId, courseId, activityId, config);
    const evaluation = evaluatePromptAnswer(prompt, answer);
    const answers = {
      ...(attempt.answers || {}),
      [promptId]: {
        answer: evaluation.normalizedAnswer,
        isCorrect: evaluation.isCorrect,
        answeredAt: new Date().toISOString(),
        pointsEarned: evaluation.isCorrect === true ? prompt.points : 0
      }
    };
    const answeredPromptIds = Array.from(new Set([...(attempt.answeredPromptIds || []), promptId]));
    const triggeredPromptIds = Array.from(new Set([...(attempt.triggeredPromptIds || []), promptId]));

    const updated = await db.updateItem(`USER#${req.user.userId}`, `INTERACTIVE_VIDEO#${activityId}`, {
      answers,
      answeredPromptIds,
      triggeredPromptIds,
      lastPositionSecond: currentTime,
      lastAccessedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const stats = calculateAttemptStats(config, updated);
    const savePayload = {
      score: stats.earnedScore,
      maxScore: stats.maxScore
    };
    if ((updated.score || 0) !== stats.earnedScore || (updated.maxScore || 0) !== stats.maxScore) {
      await db.updateItem(`USER#${req.user.userId}`, `INTERACTIVE_VIDEO#${activityId}`, savePayload);
    }
    await invalidateGradebookSnapshots(courseId);

    res.json({
      success: true,
      data: {
        promptId,
        isCorrect: evaluation.isCorrect,
        feedback: evaluation.isCorrect === false ? (prompt.feedbackIncorrect || '') : (prompt.feedbackCorrect || ''),
        score: stats.earnedScore,
        maxScore: stats.maxScore,
        scorePercent: stats.scorePercent,
        answeredPromptIds
      }
    });
  } catch (error) {
    console.error('Interactive video answer failed:', error);
    res.status(500).json({ success: false, message: '提交答案失敗' });
  }
});

router.post('/:courseId/:activityId/complete', authMiddleware, async (req, res) => {
  try {
    const { courseId, activityId } = req.params;
    const { course, canAccess } = await getCourseContext(courseId, req.user);
    if (!course) {
      return res.status(404).json({ success: false, message: '找不到課程' });
    }
    if (!canAccess) {
      return res.status(403).json({ success: false, message: '沒有權限完成互動影片' });
    }

    const activity = await getCourseActivity(courseId, activityId);
    if (!activity || activity.type !== 'interactive_video') {
      return res.status(404).json({ success: false, message: '找不到互動影片活動' });
    }

    const config = getInteractiveVideoConfig(activity);
    const attempt = await ensureAttempt(req.user.userId, courseId, activityId, config);
    const stats = calculateAttemptStats(config, attempt);
    const now = new Date().toISOString();
    const finalStatus = stats.completionEligible ? 'completed' : 'in_progress';

    const updated = await db.updateItem(`USER#${req.user.userId}`, `INTERACTIVE_VIDEO#${activityId}`, {
      status: finalStatus,
      score: stats.earnedScore,
      maxScore: stats.maxScore,
      progressPercentage: Math.max(Number(attempt.progressPercentage || 0), stats.watchPercent),
      lastAccessedAt: now,
      updatedAt: now,
      completedAt: finalStatus === 'completed' ? (attempt.completedAt || now) : null
    });
    await invalidateGradebookSnapshots(courseId);

    res.json({
      success: true,
      data: {
        status: updated.status || finalStatus,
        completionEligible: stats.completionEligible,
        watchPercent: stats.watchPercent,
        watchedSeconds: stats.watchedSeconds,
        score: stats.earnedScore,
        maxScore: stats.maxScore,
        scorePercent: stats.scorePercent,
        allRequiredAnswered: stats.allRequiredAnswered
      }
    });
  } catch (error) {
    console.error('Interactive video complete failed:', error);
    res.status(500).json({ success: false, message: '完成互動影片失敗' });
  }
});

module.exports = router;
