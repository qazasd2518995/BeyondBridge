/**
 * 為心靈成長課程加入互動影片範例
 *
 * 執行方式：
 *   node backend/scripts/add-interactive-video-sample.js
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../src/utils/db');
const { normalizeInteractiveVideoConfig } = require('../src/utils/interactive-video-data');
const { invalidateGradebookSnapshots } = require('../src/utils/gradebook-snapshots');

const COURSE_TITLE_KEYWORD = '心靈成長';
const SAMPLE_TITLE = '互動範例｜正念冥想入門';
const DEFAULT_VIDEO_URL = 'https://youtu.be/BFrW9ARq8B4?si=XutukMh_6BYKFLKj';

function byOrder(a = {}, b = {}) {
  return (Number(a.order) || 0) - (Number(b.order) || 0);
}

function isYouTubeUrl(value = '') {
  return /(youtube\.com|youtu\.be)/i.test(String(value || ''));
}

async function findMindfulCourse() {
  const courses = await db.scan({
    filter: {
      expression: 'entityType = :type',
      values: { ':type': 'COURSE' }
    }
  });

  return courses.find((course) => String(course.title || '').includes(COURSE_TITLE_KEYWORD)) || null;
}

function buildPrompts(speakerName = '', speakerAvatar = '') {
  return [
    {
      promptId: 'mindful_prompt_001',
      triggerSecond: 15,
      questionType: 'single_choice',
      question: '影片一開始引導你先把注意力放回哪裡？',
      options: ['呼吸', '待辦清單', '手機通知'],
      correctAnswer: '呼吸',
      points: 10,
      required: true,
      pauseVideo: true,
      feedbackCorrect: '對，先把注意力帶回呼吸，是這段練習的起點。',
      feedbackIncorrect: '回想老師一開始的引導，核心是先回到自己的呼吸。',
      speakerName,
      speakerAvatar
    },
    {
      promptId: 'mindful_prompt_002',
      triggerSecond: 35,
      questionType: 'true_false',
      question: '當你分心時，影片建議你要責備自己、強迫立刻專心。',
      correctAnswer: 'false',
      points: 10,
      required: true,
      pauseVideo: true,
      feedbackCorrect: '沒錯，正念練習不是責備自己，而是溫柔地把注意力帶回來。',
      feedbackIncorrect: '這段的重點是溫柔覺察，不是批判自己。',
      speakerName,
      speakerAvatar
    },
    {
      promptId: 'mindful_prompt_003',
      triggerSecond: 50,
      questionType: 'short_text_reflection',
      question: '請寫一句話：你想把這個一分鐘的覺察練習帶進哪個日常時刻？',
      correctAnswer: null,
      points: 0,
      required: true,
      pauseVideo: true,
      feedbackCorrect: '很好，先替自己選一個真實的日常情境，之後比較容易持續練習。',
      feedbackIncorrect: '',
      speakerName,
      speakerAvatar
    }
  ];
}

async function main() {
  const now = new Date().toISOString();
  const course = await findMindfulCourse();

  if (!course) {
    throw new Error('找不到心靈成長課程');
  }

  const sections = (await db.query(`COURSE#${course.courseId}`, { skPrefix: 'SECTION#' })).sort(byOrder);
  const activities = await db.query(`COURSE#${course.courseId}`, { skPrefix: 'ACTIVITY#' });
  const existingSample = activities.find((activity) => activity.type === 'interactive_video' && activity.title === SAMPLE_TITLE);

  if (existingSample) {
    console.log(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'sample_exists',
      courseId: course.courseId,
      activityId: existingSample.activityId,
      title: existingSample.title
    }, null, 2));
    return;
  }

  const sourceActivity = activities.find((activity) => (
    (activity.type === 'url' || activity.type === 'interactive_video')
    && isYouTubeUrl(activity.url || '')
  )) || null;

  const targetSection = (
    sections.find((section) => String(section.title || '').includes('影片'))
    || sections.find((section) => section.sectionId === sourceActivity?.sectionId)
    || sections[0]
  );

  if (!targetSection) {
    throw new Error('找不到可用的章節來放置互動影片');
  }

  const sectionActivities = activities
    .filter((activity) => activity.sectionId === targetSection.sectionId)
    .sort(byOrder);
  const nextOrder = Math.max(0, ...sectionActivities.map((activity) => Number(activity.order) || 0)) + 1;
  const activityNumber = String(nextOrder).padStart(3, '0');
  const activityId = db.generateId('act');
  const videoUrl = sourceActivity?.url || DEFAULT_VIDEO_URL;
  const speakerName = course.instructorName || course.teacherName || '課程老師';
  const speakerAvatar = '';

  const interactiveVideo = normalizeInteractiveVideoConfig({
    type: 'interactive_video',
    url: videoUrl,
    interactiveVideo: {
      videoUrl,
      durationSeconds: 60,
      gradingMode: 'graded',
      passingScore: 70,
      completionRule: {
        minWatchPercent: 80,
        requiredPromptMode: 'all'
      },
      speakerName,
      speakerAvatar,
      prompts: buildPrompts(speakerName, speakerAvatar)
    }
  });

  const activityItem = {
    PK: `COURSE#${course.courseId}`,
    SK: `ACTIVITY#${targetSection.sectionId}#${activityNumber}`,
    entityType: 'COURSE_ACTIVITY',
    activityId,
    courseId: course.courseId,
    sectionId: targetSection.sectionId,
    type: 'interactive_video',
    title: SAMPLE_TITLE,
    description: '示範右側老師對話式 sidebar 與時間點提問。學生觀看影片時會在指定秒數停下來作答，完成後可同步進學習進度、成績與分析。',
    url: interactiveVideo.videoUrl,
    youtubeId: interactiveVideo.youtubeId,
    interactiveVideo,
    order: nextOrder,
    visible: true,
    availability: {},
    completion: { type: 'grade', gradeToPass: interactiveVideo.passingScore },
    stats: {
      views: 0,
      completions: 0
    },
    createdAt: now,
    updatedAt: now
  };

  await db.putItem(activityItem);
  await db.updateItem(`COURSE#${course.courseId}`, 'META', {
    'stats.totalActivities': Math.max(Number(course?.stats?.totalActivities || 0) + 1, activities.length + 1),
    updatedAt: now
  });
  await invalidateGradebookSnapshots(course.courseId);

  console.log(JSON.stringify({
    success: true,
    courseId: course.courseId,
    courseTitle: course.title,
    sectionId: targetSection.sectionId,
    sectionTitle: targetSection.title,
    activityId,
    activityTitle: SAMPLE_TITLE,
    sourceVideoUrl: videoUrl,
    youtubeId: interactiveVideo.youtubeId,
    promptCount: interactiveVideo.prompts.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
