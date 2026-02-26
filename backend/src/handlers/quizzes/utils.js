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
    const { correctAnswer, correctAnswers, feedback, ...rest } = q;

    // 打亂選項（如果需要）
    if (shuffleAnswers && rest.options) {
      rest.options = shuffleArray([...rest.options]);
    }

    return rest;
  });

  // 打亂問題順序（如果需要）
  if (shuffleQuestions) {
    preparedQuestions = shuffleArray(preparedQuestions);
  }

  return preparedQuestions;
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
      case 'true_false':
        isCorrect = userAnswer === question.correctAnswer;
        earnedPoints = isCorrect ? points : 0;
        break;

      case 'multiple_select':
        // 多選題：部分給分
        if (Array.isArray(userAnswer) && Array.isArray(question.correctAnswers)) {
          const correctSet = new Set(question.correctAnswers);
          const userSet = new Set(userAnswer);
          const correctSelected = [...userSet].filter(a => correctSet.has(a)).length;
          const incorrectSelected = [...userSet].filter(a => !correctSet.has(a)).length;
          const totalCorrect = question.correctAnswers.length;

          // 扣除錯誤選擇
          const rawScore = (correctSelected - incorrectSelected) / totalCorrect;
          earnedPoints = Math.max(0, Math.round(rawScore * points * 100) / 100);
          isCorrect = earnedPoints === points;
        }
        break;

      case 'short_answer':
        // 短答題：檢查是否包含正確答案（不區分大小寫）
        if (userAnswer && question.correctAnswers) {
          const userLower = userAnswer.toLowerCase().trim();
          isCorrect = question.correctAnswers.some(ans =>
            userLower === ans.toLowerCase().trim()
          );
          earnedPoints = isCorrect ? points : 0;
        }
        break;

      case 'essay':
        // 申論題：需要手動評分，暫時給 0 分
        earnedPoints = 0;
        isCorrect = null; // 待評分
        break;

      default:
        break;
    }

    score += earnedPoints;
    questionResults.push({
      questionId: question.questionId,
      isCorrect,
      earnedPoints,
      maxPoints: points
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
