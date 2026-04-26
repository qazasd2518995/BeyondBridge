/**
 * 測驗系統共用工具函數
 * BeyondBridge Education Platform - Quiz System Utilities
 */

const db = require('../../utils/db');

/**
 * 獲取測驗
 */
async function getQuiz(quizId) {
  return db.getItem(`QUIZ#${quizId}`, 'META');
}

/**
 * 準備學生作答用的問題（可能打亂順序）
 */
function prepareQuestionsForStudent(questions, shuffleQuestions, shuffleAnswers) {
  // 如果沒有題目，返回空陣列
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  let preparedQuestions = questions.map(q => {
    // 移除正確答案
    const {
      correctAnswer,
      correctAnswers,
      feedback,
      matchingPairs,
      pairs,
      orderingItems,
      orderItems,
      clozeAnswers,
      numericAnswer,
      numericTolerance,
      tolerance,
      ...rest
    } = q;

    if (rest.type === 'true_false') {
      rest.options = normalizeTrueFalseOptions(rest.options);
      if (shuffleAnswers) {
        rest.options = shuffleArray(rest.options);
      }
    } else if (rest.type === 'matching') {
      const normalizedPairs = normalizeMatchingPairs(matchingPairs || pairs);
      rest.matchingPrompts = normalizedPairs.map((pair, index) => ({
        id: String(index),
        text: pair.prompt
      }));
      rest.options = normalizedPairs.map((pair, index) => ({
        text: pair.answer,
        value: String(index)
      }));
      if (shuffleAnswers) {
        rest.options = shuffleArray(rest.options);
      }
      delete rest.matchingPairs;
      delete rest.pairs;
    } else if (rest.type === 'ordering') {
      const normalizedItems = normalizeOrderingItems(orderingItems || orderItems || rest.options);
      rest.options = normalizedItems.map((item, index) => ({
        text: item,
        value: String(index)
      }));
      rest.options = shuffleArray(rest.options);
      delete rest.orderingItems;
      delete rest.orderItems;
    } else if (rest.type === 'cloze') {
      const normalizedBlanks = normalizeClozeAnswers(clozeAnswers || correctAnswers);
      rest.clozeBlanks = normalizedBlanks.map((blank, index) => ({
        id: blank.id || String(index + 1)
      }));
      delete rest.clozeAnswers;
    } else if (Array.isArray(rest.options)) {
      // 選項打亂時仍保留原始 index 作為 answer value，避免顯示順序改變後評分錯位。
      rest.options = rest.options.map((option, index) => normalizeOptionForStudent(option, index));
      if (shuffleAnswers) {
        rest.options = shuffleArray(rest.options);
      }
    }

    return rest;
  });

  // 打亂問題順序（如果需要）
  if (shuffleQuestions) {
    preparedQuestions = shuffleArray(preparedQuestions);
  }

  return preparedQuestions;
}

function normalizeOptionForStudent(option, index) {
  if (option && typeof option === 'object') {
    return {
      text: String(option.text ?? option.label ?? option.value ?? ''),
      value: option.value ?? option.id ?? index
    };
  }

  return {
    text: String(option ?? ''),
    value: index
  };
}

function normalizeTrueFalseOptions(options) {
  if (Array.isArray(options) && options.length >= 2) {
    return options.slice(0, 2).map((option, index) => {
      const normalized = normalizeOptionForStudent(option, index === 0 ? true : false);
      return {
        text: normalized.text,
        value: normalizeBooleanAnswer(normalized.value, index === 0)
      };
    });
  }

  return [
    { text: 'True', value: true },
    { text: 'False', value: false }
  ];
}

function normalizeChoiceAnswer(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return normalizeChoiceAnswer(value.value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value.trim();
  }
  return value;
}

function normalizeBooleanAnswer(value, fallback = null) {
  if (value && typeof value === 'object' && 'value' in value) {
    return normalizeBooleanAnswer(value.value, fallback);
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 0) return true;
    if (value === 1) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 't', 'yes', 'y', '1', '是', '對', '正確'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', '0', '否', '錯', '錯誤'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeAnswerKey(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return normalizeAnswerKey(value.value);
  }
  return String(value ?? '').trim();
}

function normalizeAnswerArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function normalizeMatchingPairs(pairs = []) {
  return (Array.isArray(pairs) ? pairs : [])
    .map((pair) => {
      if (Array.isArray(pair)) {
        return {
          prompt: String(pair[0] ?? '').trim(),
          answer: String(pair[1] ?? '').trim()
        };
      }
      return {
        prompt: String(pair?.prompt ?? pair?.question ?? pair?.left ?? '').trim(),
        answer: String(pair?.answer ?? pair?.right ?? pair?.match ?? '').trim()
      };
    })
    .filter(pair => pair.prompt && pair.answer);
}

function normalizeOrderingItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => {
      if (item && typeof item === 'object') {
        return String(item.text ?? item.label ?? item.value ?? '').trim();
      }
      return String(item ?? '').trim();
    })
    .filter(Boolean);
}

function normalizeClozeAnswers(blanks = []) {
  return (Array.isArray(blanks) ? blanks : [])
    .map((blank, index) => {
      if (blank && typeof blank === 'object') {
        const accepted = Array.isArray(blank.answers)
          ? blank.answers
          : Array.isArray(blank.acceptedAnswers)
            ? blank.acceptedAnswers
            : [blank.answer ?? blank.value ?? ''];
        return {
          id: String(blank.id || blank.blankId || index + 1),
          answers: accepted.map(answer => String(answer ?? '').trim()).filter(Boolean),
          caseSensitive: !!blank.caseSensitive
        };
      }
      return {
        id: String(index + 1),
        answers: [String(blank ?? '').trim()].filter(Boolean),
        caseSensitive: false
      };
    })
    .filter(blank => blank.id && blank.answers.length > 0);
}

function roundScore(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100) / 100);
}

/**
 * Fisher-Yates 洗牌演算法
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 評分測驗
 */
function gradeQuiz(questions, answers) {
  let score = 0;
  let totalPoints = 0;
  const questionResults = [];

  for (const question of questions) {
    const points = question.points || 1;
    totalPoints += points;

    const userAnswer = answers[question.questionId];
    let isCorrect = false;
    let earnedPoints = 0;

    switch (question.type) {
      case 'multiple_choice':
        isCorrect = normalizeChoiceAnswer(userAnswer) === normalizeChoiceAnswer(question.correctAnswer);
        earnedPoints = isCorrect ? points : 0;
        break;

      case 'true_false':
        isCorrect = normalizeBooleanAnswer(userAnswer) === normalizeBooleanAnswer(question.correctAnswer);
        earnedPoints = isCorrect ? points : 0;
        break;

      case 'multiple_select':
        // 多選題：部分給分
        if (Array.isArray(userAnswer) && Array.isArray(question.correctAnswers)) {
          const correctSet = new Set(question.correctAnswers.map(normalizeAnswerKey));
          const userSet = new Set(userAnswer.map(normalizeAnswerKey));
          const correctSelected = [...userSet].filter(a => correctSet.has(a)).length;
          const incorrectSelected = [...userSet].filter(a => !correctSet.has(a)).length;
          const totalCorrect = question.correctAnswers.length;

          if (totalCorrect > 0) {
            // 扣除錯誤選擇
            const rawScore = (correctSelected - incorrectSelected) / totalCorrect;
            earnedPoints = roundScore(rawScore * points);
            isCorrect = earnedPoints === points;
          }
        }
        break;

      case 'matching': {
        const pairs = normalizeMatchingPairs(question.matchingPairs || question.pairs);
        const answerMap = userAnswer && typeof userAnswer === 'object' && !Array.isArray(userAnswer) ? userAnswer : {};
        if (pairs.length > 0) {
          const correctCount = pairs.reduce((count, pair, index) => {
            const answer = answerMap[String(index)] ?? answerMap[index];
            const answerKey = normalizeAnswerKey(answer);
            return count + (answerKey === String(index) || answerKey === pair.answer ? 1 : 0);
          }, 0);
          earnedPoints = roundScore((correctCount / pairs.length) * points);
          isCorrect = correctCount === pairs.length;
        }
        break;
      }

      case 'ordering': {
        const items = normalizeOrderingItems(question.orderingItems || question.orderItems || question.options);
        const answerOrder = normalizeAnswerArray(userAnswer).map(normalizeAnswerKey);
        if (items.length > 0 && answerOrder.length > 0) {
          const correctCount = items.reduce((count, _item, index) => {
            return count + (answerOrder[index] === String(index) ? 1 : 0);
          }, 0);
          earnedPoints = roundScore((correctCount / items.length) * points);
          isCorrect = correctCount === items.length;
        }
        break;
      }

      case 'numerical': {
        const expected = Number(question.numericAnswer ?? question.correctAnswer);
        const submitted = Number(userAnswer);
        const toleranceValue = Math.max(0, Number(question.numericTolerance ?? question.tolerance ?? 0) || 0);
        if (Number.isFinite(expected) && Number.isFinite(submitted)) {
          isCorrect = Math.abs(submitted - expected) <= toleranceValue;
          earnedPoints = isCorrect ? points : 0;
        }
        break;
      }

      case 'cloze': {
        const blanks = normalizeClozeAnswers(question.clozeAnswers || question.correctAnswers);
        const answerMap = userAnswer && typeof userAnswer === 'object' && !Array.isArray(userAnswer) ? userAnswer : {};
        if (blanks.length > 0) {
          const correctCount = blanks.reduce((count, blank) => {
            const submitted = String(answerMap[blank.id] ?? '').trim();
            if (!submitted) return count;
            const comparable = blank.caseSensitive ? submitted : submitted.toLowerCase();
            const matches = blank.answers.some(answer => {
              const expected = blank.caseSensitive ? answer : answer.toLowerCase();
              return comparable === expected;
            });
            return count + (matches ? 1 : 0);
          }, 0);
          earnedPoints = roundScore((correctCount / blanks.length) * points);
          isCorrect = correctCount === blanks.length;
        }
        break;
      }

      case 'short_answer':
      case 'fill_blank':
        // 短答題：檢查是否包含正確答案（不區分大小寫）
        if (userAnswer && question.correctAnswers) {
          const userText = String(userAnswer).trim();
          const userComparable = question.caseSensitive ? userText : userText.toLowerCase();
          isCorrect = question.correctAnswers.some(ans => {
            const answerText = String(ans).trim();
            return userComparable === (question.caseSensitive ? answerText : answerText.toLowerCase());
          });
          earnedPoints = isCorrect ? points : 0;
        }
        break;

      case 'essay':
        earnedPoints = 0;
        isCorrect = null;
        break;

      default:
        break;
    }

    score += earnedPoints;
    questionResults.push({
      questionId: question.questionId,
      isCorrect,
      earnedPoints,
      maxPoints: points,
      needsManualGrading: question.type === 'essay',
      manualGraded: question.type === 'essay' ? false : undefined
    });
  }

  return { score, totalPoints, questionResults };
}

/**
 * 防作弊設定常量
 */
const ANTI_CHEAT_SETTINGS = {
  // 焦點離開最大次數
  maxFocusLossCount: 5,
  // 複製嘗試最大次數
  maxCopyAttempts: 3,
  // 可疑行為警告閾值
  suspiciousBehaviorThreshold: 10,
  // IP 改變是否允許
  allowIpChange: false
};

/**
 * 計算風險等級
 */
function calculateRiskLevel(suspiciousScore) {
  if (suspiciousScore >= 20) return 'high';
  if (suspiciousScore >= 10) return 'medium';
  if (suspiciousScore >= 5) return 'low';
  return 'none';
}

/**
 * 生成警示標記
 */
function generateFlags(attempt) {
  const flags = [];
  const stats = attempt.behaviorStats || {};

  if (stats.focusLossCount >= 5) {
    flags.push({
      type: 'excessive_focus_loss',
      severity: 'high',
      message: `離開頁面 ${stats.focusLossCount} 次`
    });
  } else if (stats.focusLossCount >= 3) {
    flags.push({
      type: 'focus_loss',
      severity: 'medium',
      message: `離開頁面 ${stats.focusLossCount} 次`
    });
  }

  if (stats.copyAttempts > 0) {
    flags.push({
      type: 'copy_attempt',
      severity: 'medium',
      message: `嘗試複製 ${stats.copyAttempts} 次`
    });
  }

  if (stats.devtoolsOpens > 0) {
    flags.push({
      type: 'devtools_open',
      severity: 'high',
      message: `開啟開發者工具 ${stats.devtoolsOpens} 次`
    });
  }

  if (stats.fullscreenExits > 0) {
    flags.push({
      type: 'fullscreen_exit',
      severity: 'medium',
      message: `退出全螢幕 ${stats.fullscreenExits} 次`
    });
  }

  // 檢查作答時間是否異常短
  if (attempt.submittedAt && attempt.startedAt) {
    const durationMinutes = (new Date(attempt.submittedAt) - new Date(attempt.startedAt)) / 60000;
    if (durationMinutes < 2 && attempt.percentage > 80) {
      flags.push({
        type: 'quick_completion',
        severity: 'high',
        message: `作答時間異常短（${Math.round(durationMinutes)} 分鐘）且成績高`
      });
    }
  }

  return flags;
}

module.exports = {
  getQuiz,
  prepareQuestionsForStudent,
  shuffleArray,
  gradeQuiz,
  ANTI_CHEAT_SETTINGS,
  calculateRiskLevel,
  generateFlags
};
