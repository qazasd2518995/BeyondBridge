/**
 * Mark full TOEIC 200-question quizzes with the TOEIC analysis profile.
 *
 * Usage:
 *   node backend/scripts/apply-toeic-quiz-profile.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../src/utils/db');
const { TOEIC_FULL_TEST_PROFILE } = require('../src/utils/toeic-parts');

function hasToeicSignal(...values) {
  return values.some(value => /toeic|多益/i.test(String(value || '')));
}

async function main() {
  const courses = await db.scan({
    filter: {
      expression: '#type = :type',
      names: { '#type': 'entityType' },
      values: { ':type': 'COURSE' }
    },
    projection: ['PK', 'SK', 'courseId', 'title', 'name']
  });

  const toeicCourses = courses.filter(course => hasToeicSignal(course.title, course.name));
  const courseTitleById = new Map(toeicCourses.map(course => [
    course.courseId || String(course.PK || '').replace(/^COURSE#/, ''),
    course.title || course.name || ''
  ]));
  const quizzes = await db.scan({
    filter: {
      expression: '#type = :type',
      names: { '#type': 'entityType' },
      values: { ':type': 'QUIZ' }
    }
  });
  const updates = [];

  for (const quiz of quizzes) {
    const courseTitle = courseTitleById.get(quiz.courseId);
    if (!courseTitle && !hasToeicSignal(quiz.title, quiz.description, quiz.instructions)) continue;

    const questionCount = Array.isArray(quiz.questions) ? quiz.questions.length : Number(quiz.questionCount || 0);
    if (questionCount !== 200) continue;

    const updatesForQuiz = {
      analysisProfile: TOEIC_FULL_TEST_PROFILE,
      toeicPartSchemaVersion: '2026-toeic-lr-200',
      shuffleQuestions: false,
      updatedAt: new Date().toISOString()
    };

    await db.updateItem(`QUIZ#${quiz.quizId}`, 'META', updatesForQuiz);
    updates.push({
      courseId: quiz.courseId,
      courseTitle,
      quizId: quiz.quizId,
      quizTitle: quiz.title || '',
      questionCount
    });
  }

  console.log(JSON.stringify({
    updatedCount: updates.length,
    updates
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
