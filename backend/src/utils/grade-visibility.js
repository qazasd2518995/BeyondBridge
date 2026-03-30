function getGradeVisibility(course = null, { canManage = false, isAdmin = false } = {}) {
  const showGradesImmediately = course?.settings?.showGradesImmediately !== false;
  const gradesReleased = Boolean(canManage || isAdmin || showGradesImmediately);

  return {
    showGradesImmediately,
    gradesReleased,
    pendingRelease: !gradesReleased
  };
}

function maskGradeSummary(summary = {}) {
  return {
    ...summary,
    totalEarned: null,
    totalPossible: null,
    overallGrade: null,
    overallPercentage: null,
    passing: null,
    categoryBreakdown: Array.isArray(summary.categoryBreakdown)
      ? summary.categoryBreakdown.map(category => ({
          ...category,
          overallPercentage: null
        }))
      : []
  };
}

function maskStudentGradeItems(items = []) {
  return (Array.isArray(items) ? items : []).map(item => ({
    ...item,
    grade: null,
    percentage: null,
    feedback: null,
    passed: item?.passed === undefined ? undefined : null,
    gradePendingRelease: true
  }));
}

function maskAssignmentSubmissionStatus(status = {}) {
  const masked = { ...status };
  masked.grade = null;
  masked.graded = Boolean(status.graded || status.gradedAt || status.grade !== null && status.grade !== undefined);
  masked.gradedAt = null;
  masked.gradePendingRelease = true;
  return masked;
}

function maskAssignmentSubmission(submission = {}) {
  const masked = { ...submission };
  masked.grade = null;
  masked.feedback = null;
  masked.gradedAt = null;
  masked.gradedBy = null;
  masked.graded = Boolean(submission.graded || submission.gradedAt || submission.grade !== null && submission.grade !== undefined);
  masked.gradePendingRelease = true;
  return masked;
}

function maskQuizUserStatus(status = {}) {
  return {
    ...status,
    bestScore: null,
    gradePendingRelease: true
  };
}

function maskQuizAttempt(attempt = {}) {
  const masked = { ...attempt };
  masked.score = null;
  masked.percentage = null;
  masked.passed = null;
  masked.gradePendingRelease = true;
  delete masked.questionResults;
  delete masked.correctAnswers;
  return masked;
}

module.exports = {
  getGradeVisibility,
  maskGradeSummary,
  maskStudentGradeItems,
  maskAssignmentSubmissionStatus,
  maskAssignmentSubmission,
  maskQuizUserStatus,
  maskQuizAttempt
};
