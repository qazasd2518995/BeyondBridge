const SCORE_BINS = [
  { key: '0-59', label: '0-59%', min: 0, max: 59 },
  { key: '60-69', label: '60-69%', min: 60, max: 69 },
  { key: '70-79', label: '70-79%', min: 70, max: 79 },
  { key: '80-89', label: '80-89%', min: 80, max: 89 },
  { key: '90-100', label: '90-100%', min: 90, max: 100 }
];

function roundNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function toPercent(earned, total) {
  const totalNumber = Number(total);
  if (!Number.isFinite(totalNumber) || totalNumber <= 0) return 0;
  return Math.round((Number(earned || 0) / totalNumber) * 100);
}

function normalizeSectionLabel(value) {
  const label = String(value || '').trim();
  return label || 'General';
}

function getQuestionSection(question = {}) {
  return normalizeSectionLabel(
    question.analysisSection ||
    question.sectionTitle ||
    question.section ||
    question.skill ||
    question.categoryName ||
    question.category
  );
}

function sectionIdFromLabel(label) {
  return `section_${String(label || 'general')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'general'}`;
}

function getQuestionResult(attempt = {}, questionId) {
  return (attempt.questionResults || []).find(result => result.questionId === questionId) || null;
}

function getAttemptAnswer(attempt = {}, questionId) {
  return attempt.answers ? attempt.answers[questionId] : undefined;
}

function normalizeOptionValue(option, index) {
  if (option && typeof option === 'object') {
    return option.value ?? option.id ?? index;
  }
  return index;
}

function optionText(option) {
  if (option && typeof option === 'object') {
    return String(option.text ?? option.label ?? option.value ?? '');
  }
  return String(option ?? '');
}

function answersEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function answerMatchesOption(answer, option, index) {
  if (answersEqual(answer, normalizeOptionValue(option, index))) return true;
  if (answersEqual(answer, optionText(option))) return true;
  if (Number.isFinite(Number(answer)) && Number(answer) === index) return true;
  return false;
}

function findScoreBin(value) {
  const percentage = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  return SCORE_BINS.find(bin => percentage >= bin.min && percentage <= bin.max) || SCORE_BINS[0];
}

function createScoreDistribution() {
  return SCORE_BINS.map(bin => ({ ...bin, count: 0, percentage: 0 }));
}

function finalizeScoreDistribution(distribution, total) {
  return distribution.map(bin => ({
    ...bin,
    percentage: total > 0 ? Math.round((bin.count / total) * 100) : 0
  }));
}

function buildQuestionGroups(questions = []) {
  const sections = new Map();

  questions.forEach((question, index) => {
    const title = getQuestionSection(question);
    const sectionId = sectionIdFromLabel(title);
    if (!sections.has(sectionId)) {
      sections.set(sectionId, {
        sectionId,
        title,
        order: sections.size + 1,
        questions: [],
        totalPoints: 0
      });
    }

    const section = sections.get(sectionId);
    const points = Number(question.points || 1);
    section.questions.push({ ...question, order: question.order || index + 1 });
    section.totalPoints += Number.isFinite(points) ? points : 1;
  });

  return [...sections.values()];
}

function buildAttemptSectionAnalytics(quiz = {}, attempt = {}) {
  const sections = buildQuestionGroups(quiz.questions || []);

  return sections.map(section => {
    let earnedPoints = 0;
    let totalPoints = 0;
    let correctCount = 0;
    let scoredQuestionCount = 0;

    const questionResults = section.questions.map(question => {
      const result = getQuestionResult(attempt, question.questionId);
      const points = Number(result?.maxPoints ?? question.points ?? 1) || 1;
      const earned = Number(result?.earnedPoints ?? 0) || 0;
      const isScored = result?.isCorrect !== null && result?.isCorrect !== undefined;

      earnedPoints += earned;
      totalPoints += points;
      if (isScored) {
        scoredQuestionCount++;
        if (result?.isCorrect === true) correctCount++;
      }

      return {
        questionId: question.questionId,
        questionText: question.text || question.question || '',
        type: question.type,
        answer: getAttemptAnswer(attempt, question.questionId),
        isCorrect: result?.isCorrect ?? null,
        earnedPoints: earned,
        maxPoints: points
      };
    });

    return {
      sectionId: section.sectionId,
      title: section.title,
      questionCount: section.questions.length,
      scoredQuestionCount,
      correctCount,
      earnedPoints: roundNumber(earnedPoints, 2),
      totalPoints: roundNumber(totalPoints, 2),
      percentage: toPercent(earnedPoints, totalPoints),
      correctRate: scoredQuestionCount > 0 ? Math.round((correctCount / scoredQuestionCount) * 100) : null,
      questionResults
    };
  });
}

function buildTeacherQuizAnalytics(quiz = {}, attempts = []) {
  const completedAttempts = attempts.filter(attempt => attempt.status === 'completed');
  const sections = buildQuestionGroups(quiz.questions || []);

  const sectionAnalytics = sections.map(section => {
    let earnedPointsSum = 0;
    let totalPointsSum = 0;
    let correctCount = 0;
    let scoredResponseCount = 0;
    const distribution = createScoreDistribution();

    const questionStats = section.questions.map(question => {
      let questionCorrect = 0;
      let questionScored = 0;
      const optionDistribution = Array.isArray(question.options)
        ? question.options.map((option, index) => ({
            option: optionText(option),
            value: normalizeOptionValue(option, index),
            count: 0,
            percentage: 0
          }))
        : null;

      completedAttempts.forEach(attempt => {
        const result = getQuestionResult(attempt, question.questionId);
        const answer = getAttemptAnswer(attempt, question.questionId);
        if (optionDistribution) {
          const selectedOption = optionDistribution.find((_, index) =>
            answerMatchesOption(answer, question.options[index], index)
          );
          if (selectedOption) selectedOption.count++;
        }

        if (result?.isCorrect === null || result?.isCorrect === undefined) return;
        questionScored++;
        if (result.isCorrect === true) questionCorrect++;
      });

      return {
        questionId: question.questionId,
        questionText: question.text || question.question || '',
        type: question.type,
        points: Number(question.points || 1) || 1,
        correctCount: questionCorrect,
        responseCount: questionScored,
        correctRate: questionScored > 0 ? Math.round((questionCorrect / questionScored) * 100) : 0,
        optionDistribution: optionDistribution
          ? optionDistribution.map(option => ({
              ...option,
              percentage: completedAttempts.length > 0
                ? Math.round((option.count / completedAttempts.length) * 100)
                : 0
            }))
          : null
      };
    });

    completedAttempts.forEach(attempt => {
      const studentSection = buildAttemptSectionAnalytics(quiz, attempt)
        .find(item => item.sectionId === section.sectionId);
      if (!studentSection) return;

      earnedPointsSum += Number(studentSection.earnedPoints || 0);
      totalPointsSum += Number(studentSection.totalPoints || 0);
      correctCount += Number(studentSection.correctCount || 0);
      scoredResponseCount += Number(studentSection.scoredQuestionCount || 0);

      const bin = findScoreBin(studentSection.percentage);
      const target = distribution.find(item => item.key === bin.key);
      if (target) target.count++;
    });

    return {
      sectionId: section.sectionId,
      title: section.title,
      questionCount: section.questions.length,
      totalPoints: roundNumber(section.totalPoints, 2),
      attempts: completedAttempts.length,
      averageScore: toPercent(earnedPointsSum, totalPointsSum),
      correctRate: scoredResponseCount > 0 ? Math.round((correctCount / scoredResponseCount) * 100) : 0,
      correctCount,
      responseCount: scoredResponseCount,
      scoreDistribution: finalizeScoreDistribution(distribution, completedAttempts.length),
      questionStats
    };
  });

  const radar = {
    labels: sectionAnalytics.map(section => section.title),
    values: sectionAnalytics.map(section => section.averageScore)
  };

  const weakestSections = [...sectionAnalytics]
    .filter(section => section.attempts > 0)
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, 3)
    .map(section => ({
      sectionId: section.sectionId,
      title: section.title,
      averageScore: section.averageScore,
      correctRate: section.correctRate
    }));

  return {
    sections: sectionAnalytics,
    radar,
    weakestSections
  };
}

function buildStudentQuizAnalytics(quiz = {}, attempt = {}) {
  const sections = buildAttemptSectionAnalytics(quiz, attempt);
  return {
    sections,
    radar: {
      labels: sections.map(section => section.title),
      values: sections.map(section => section.percentage)
    },
    weakestSections: [...sections]
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 3)
      .map(section => ({
        sectionId: section.sectionId,
        title: section.title,
        percentage: section.percentage,
        correctRate: section.correctRate
      }))
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows) {
  return `\uFEFF${rows.map(row => row.map(csvEscape).join(',')).join('\n')}\n`;
}

function buildTeacherAnalyticsCsv(quiz = {}, attempts = [], analytics = {}) {
  const rows = [
    ['type', 'section', 'student', 'email', 'attemptId', 'metric', 'value', 'extra']
  ];

  (analytics.sections || []).forEach(section => {
    rows.push(['section_summary', section.title, '', '', '', 'average_score', section.averageScore, `${section.attempts} attempts`]);
    rows.push(['section_summary', section.title, '', '', '', 'correct_rate', section.correctRate, `${section.correctCount}/${section.responseCount}`]);
    (section.scoreDistribution || []).forEach(bin => {
      rows.push(['score_distribution', section.title, '', '', '', bin.label, bin.count, `${bin.percentage}%`]);
    });
    (section.questionStats || []).forEach(question => {
      rows.push(['question', section.title, '', '', '', question.questionText, `${question.correctRate}%`, `${question.correctCount}/${question.responseCount}`]);
      (question.optionDistribution || []).forEach(option => {
        rows.push(['option', section.title, '', '', '', question.questionText, option.option, `${option.count} (${option.percentage}%)`]);
      });
    });
  });

  attempts
    .filter(attempt => attempt.status === 'completed')
    .forEach(attempt => {
      const studentAnalytics = buildStudentQuizAnalytics(quiz, attempt);
      (studentAnalytics.sections || []).forEach(section => {
        rows.push([
          'student_section',
          section.title,
          attempt.userName || attempt.userEmail || attempt.userId || '',
          attempt.userEmail || '',
          attempt.attemptId || '',
          'score',
          section.percentage,
          `${section.earnedPoints}/${section.totalPoints}`
        ]);
      });
    });

  return rowsToCsv(rows);
}

function buildStudentAnalyticsCsv(quiz = {}, attempt = {}) {
  const analytics = buildStudentQuizAnalytics(quiz, attempt);
  const rows = [
    ['section', 'score_percent', 'correct_rate', 'earned_points', 'total_points', 'correct_count', 'question_count'],
    ...(analytics.sections || []).map(section => [
      section.title,
      section.percentage,
      section.correctRate ?? '',
      section.earnedPoints,
      section.totalPoints,
      section.correctCount,
      section.questionCount
    ])
  ];

  rows.push([]);
  rows.push(['section', 'question', 'type', 'is_correct', 'earned_points', 'max_points', 'answer']);
  (analytics.sections || []).forEach(section => {
    (section.questionResults || []).forEach(question => {
      rows.push([
        section.title,
        question.questionText,
        question.type,
        question.isCorrect,
        question.earnedPoints,
        question.maxPoints,
        JSON.stringify(question.answer ?? '')
      ]);
    });
  });

  return rowsToCsv(rows);
}

module.exports = {
  SCORE_BINS,
  buildAttemptSectionAnalytics,
  buildTeacherQuizAnalytics,
  buildStudentQuizAnalytics,
  buildTeacherAnalyticsCsv,
  buildStudentAnalyticsCsv,
  getQuestionSection
};
