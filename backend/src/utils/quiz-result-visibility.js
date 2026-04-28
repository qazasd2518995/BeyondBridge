function isDateInFuture(value, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date > now;
}

function getQuizResultVisibility(quiz = {}, gradeVisibility = {}, now = new Date(), { canManage = false } = {}) {
  const showResults = quiz.showResults || 'immediately';
  if (canManage) {
    return {
      resultsAvailable: true,
      reason: null,
      showResults,
      pendingRelease: false,
      availableAt: null
    };
  }

  if (!gradeVisibility.gradesReleased) {
    return {
      resultsAvailable: false,
      reason: 'grades_pending_release',
      showResults,
      pendingRelease: true,
      availableAt: null
    };
  }

  if (showResults === 'never') {
    return {
      resultsAvailable: false,
      reason: 'results_hidden',
      showResults,
      pendingRelease: false,
      availableAt: null
    };
  }

  if (showResults === 'after_close' && isDateInFuture(quiz.closeDate, now)) {
    return {
      resultsAvailable: false,
      reason: 'after_close',
      showResults,
      pendingRelease: false,
      availableAt: quiz.closeDate
    };
  }

  return {
    resultsAvailable: true,
    reason: null,
    showResults,
    pendingRelease: false,
    availableAt: null
  };
}

function getQuizResultVisibilityMessage(visibility = {}) {
  if (visibility.reason === 'grades_pending_release') return '此課程成績尚未釋出';
  if (visibility.reason === 'results_hidden') return '此測驗不顯示結果';
  if (visibility.reason === 'after_close') return '結果將在測驗關閉後顯示';
  return '測驗結果可查看';
}

module.exports = {
  getQuizResultVisibility,
  getQuizResultVisibilityMessage
};
