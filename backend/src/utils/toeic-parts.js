const TOEIC_FULL_TEST_PROFILE = 'toeic_full_test';

const TOEIC_PART_SECTIONS = [
  {
    part: 1,
    start: 1,
    end: 6,
    taskTitle: 'Photographs',
    sectionTitle: 'Part 1 - Photographs'
  },
  {
    part: 2,
    start: 7,
    end: 31,
    taskTitle: 'Question-Response',
    sectionTitle: 'Part 2 - Question-Response'
  },
  {
    part: 3,
    start: 32,
    end: 70,
    taskTitle: 'Conversations',
    sectionTitle: 'Part 3 - Conversations'
  },
  {
    part: 4,
    start: 71,
    end: 100,
    taskTitle: 'Talks',
    sectionTitle: 'Part 4 - Talks'
  },
  {
    part: 5,
    start: 101,
    end: 130,
    taskTitle: 'Incomplete Sentences',
    sectionTitle: 'Part 5 - Incomplete Sentences'
  },
  {
    part: 6,
    start: 131,
    end: 146,
    taskTitle: 'Text Completion',
    sectionTitle: 'Part 6 - Text Completion'
  },
  {
    part: 7,
    start: 147,
    end: 175,
    taskTitle: 'Reading Comprehension: Single Passages',
    sectionTitle: 'Part 7 - Reading Comprehension: Single Passages'
  },
  {
    part: 7,
    start: 176,
    end: 200,
    taskTitle: 'Reading Comprehension: Multiple Passages',
    sectionTitle: 'Part 7 - Reading Comprehension: Multiple Passages'
  }
];

function normalizeProfile(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['toeic', 'toeic_200', 'toeic_full', TOEIC_FULL_TEST_PROFILE].includes(key)) {
    return TOEIC_FULL_TEST_PROFILE;
  }
  return key || '';
}

function hasToeicSignal(...values) {
  return values.some((value) => /toeic|多益/i.test(String(value || '')));
}

function getQuestionCount(quiz = {}, questions = quiz.questions) {
  if (Array.isArray(questions)) return questions.length;
  return Number(quiz.questionCount || quiz.totalQuestions || 0) || 0;
}

function inferQuizAnalysisProfile(quiz = {}, options = {}) {
  const explicit = normalizeProfile(quiz.analysisProfile || quiz.quizType || quiz.assessmentProfile);
  if (explicit) return explicit;

  const questions = options.questions || quiz.questions;
  const questionCount = getQuestionCount(quiz, questions);
  const hasSignal = hasToeicSignal(
    quiz.title,
    quiz.name,
    quiz.description,
    quiz.instructions,
    quiz.courseTitle,
    quiz.courseName,
    options.courseTitle,
    options.courseName
  );

  return hasSignal && questionCount === 200 ? TOEIC_FULL_TEST_PROFILE : '';
}

function isToeicFullTest(quiz = {}, options = {}) {
  return inferQuizAnalysisProfile(quiz, options) === TOEIC_FULL_TEST_PROFILE;
}

function getQuestionOrder(question = {}, index = 0) {
  const order = Number(question.order ?? question.questionNumber ?? question.number ?? index + 1);
  return Number.isFinite(order) && order > 0 ? Math.trunc(order) : index + 1;
}

function getToeicPartForOrder(order) {
  const questionNumber = Number(order);
  if (!Number.isFinite(questionNumber)) return null;
  return TOEIC_PART_SECTIONS.find(section =>
    questionNumber >= section.start && questionNumber <= section.end
  ) || null;
}

function getToeicQuestionSection(question = {}, index = 0) {
  const section = getToeicPartForOrder(getQuestionOrder(question, index));
  if (!section) return null;

  return {
    ...section,
    questionRange: `${section.start}-${section.end}`,
    questionRangeLabel: `Questions ${section.start}-${section.end}`
  };
}

function decorateToeicQuestion(question = {}, index = 0, quiz = {}) {
  if (!isToeicFullTest(quiz)) return question;
  const section = getToeicQuestionSection(question, index);
  if (!section) return question;

  return {
    ...question,
    analysisSection: section.sectionTitle,
    sectionTitle: section.sectionTitle,
    toeicPart: section.part,
    toeicPartTitle: `Part ${section.part}`,
    toeicTaskTitle: section.taskTitle,
    toeicSectionTitle: section.sectionTitle,
    toeicQuestionRange: section.questionRange,
    toeicQuestionRangeLabel: section.questionRangeLabel
  };
}

module.exports = {
  TOEIC_FULL_TEST_PROFILE,
  TOEIC_PART_SECTIONS,
  inferQuizAnalysisProfile,
  isToeicFullTest,
  getQuestionOrder,
  getToeicPartForOrder,
  getToeicQuestionSection,
  decorateToeicQuestion
};
