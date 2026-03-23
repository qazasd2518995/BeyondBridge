/**
 * 課程報告與分析
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse } = require('../../utils/course-access');

async function getCourseAssignments(courseId) {
  return db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'ASSIGNMENT#'
  });
}

async function getCourseQuizzes(courseId) {
  return db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'QUIZ#'
  });
}

async function getCourseForums(courseId) {
  return db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skName: 'GSI1SK',
    skPrefix: 'FORUM#'
  });
}

async function getCourseEnrollments(courseId) {
  return db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
    skPrefix: 'ENROLLED#',
    skName: 'GSI1SK'
  });
}

async function getForumDiscussions(forumId) {
  return db.query(`FORUM#${forumId}`, { skPrefix: 'DISCUSSION#' });
}

async function getDiscussionPosts(discussionId) {
  return db.query(`DISCUSSION#${discussionId}`, { skPrefix: 'POST#' });
}

// ==================== 課程報告與分析 ====================

/**
 * GET /api/courses/:id/participation-report
 * 課程參與報告
 * 教師功能
 */
router.get('/:id/participation-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    // 取得課程
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 檢查權限
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看報告'
      });
    }

    // 取得所有報名學生
    const enrollments = await getCourseEnrollments(id);

    // 取得課程活動（作業、測驗、論壇）
    const [assignments, quizzes, forums] = await Promise.all([
      getCourseAssignments(id),
      getCourseQuizzes(id),
      getCourseForums(id)
    ]);

    // 收集每個學生的參與資料
    const studentParticipation = [];

    for (const enrollment of enrollments) {
      const student = await db.getUser(enrollment.userId);
      if (!student) continue;

      // 取得學生的課程進度
      const progress = await db.getItem(`USER#${enrollment.userId}`, `PROG#COURSE#${id}`);

      // 取得作業提交數
      let assignmentSubmissions = 0;
      for (const assignment of assignments) {
        const submission = await db.getItem(`ASSIGNMENT#${assignment.assignmentId}`, `SUBMISSION#${enrollment.userId}`);
        if (submission && submission.submittedAt) {
          assignmentSubmissions++;
        }
      }

      // 取得測驗完成數
      let quizAttempts = 0;
      for (const quiz of quizzes) {
        const attempts = await db.query(`QUIZ#${quiz.quizId}`, {
          skPrefix: `ATTEMPT#${enrollment.userId}`
        });
        if (attempts && attempts.length > 0) {
          quizAttempts++;
        }
      }

      // 取得論壇參與（發帖 + 回覆數）
      let forumPosts = 0;
      let forumReplies = 0;
      for (const forum of forums) {
        const discussions = await getForumDiscussions(forum.forumId);
        for (const discussion of discussions) {
          if (discussion.authorId === enrollment.userId) {
            forumPosts++;
          }
          const posts = await getDiscussionPosts(discussion.discussionId);
          for (const post of posts) {
            if (post.authorId === enrollment.userId) {
              forumReplies++;
            }
          }
        }
      }

      studentParticipation.push({
        studentId: enrollment.userId,
        studentName: student.displayName || student.email,
        studentEmail: student.email,
        enrolledAt: enrollment.enrolledAt,
        lastAccessed: progress?.lastAccessedAt || null,
        progressPercentage: progress?.progressPercentage || 0,
        status: progress?.status || 'not_started',
        activities: {
          assignmentSubmissions: assignmentSubmissions,
          totalAssignments: assignments.length,
          quizAttempts: quizAttempts,
          totalQuizzes: quizzes.length,
          forumPosts: forumPosts,
          forumReplies: forumReplies
        }
      });
    }

    // 計算整體統計
    const totalStudents = studentParticipation.length;
    const activeStudents = studentParticipation.filter(s => s.lastAccessed).length;
    const completedStudents = studentParticipation.filter(s => s.status === 'completed').length;
    const avgProgress = totalStudents > 0
      ? Math.round(studentParticipation.reduce((sum, s) => sum + s.progressPercentage, 0) / totalStudents)
      : 0;

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),

        summary: {
          totalStudents,
          activeStudents,
          completedStudents,
          completionRate: totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0,
          averageProgress: avgProgress,
          totalAssignments: assignments.length,
          totalQuizzes: quizzes.length,
          totalForums: forums.length
        },

        students: studentParticipation.sort((a, b) => b.progressPercentage - a.progressPercentage)
      }
    });

  } catch (error) {
    console.error('Get participation report error:', error);
    res.status(500).json({
      success: false,
      error: 'REPORT_FAILED',
      message: '生成報告失敗'
    });
  }
});

/**
 * GET /api/courses/:id/activity-report
 * 活動完成報告
 * 教師功能
 */
router.get('/:id/activity-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 取得課程
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 檢查權限
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看報告'
      });
    }

    // 取得報名學生數
    const enrollments = await getCourseEnrollments(id);
    const totalStudents = enrollments.length;

    // 取得所有活動及其完成狀況
    const activityReport = [];

    // 作業
    const assignments = await getCourseAssignments(id);
    for (const assignment of assignments) {
      const submissions = await db.query(`ASSIGNMENT#${assignment.assignmentId}`, {
        skPrefix: 'SUBMISSION#'
      });
      const submitted = submissions.filter(s => s.submittedAt).length;
      const graded = submissions.filter(s => s.status === 'graded').length;
      const grades = submissions.filter(s => s.grade !== null && s.grade !== undefined).map(s => s.grade);
      const avgGrade = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : null;

      activityReport.push({
        type: 'assignment',
        id: assignment.assignmentId,
        title: assignment.title,
        dueDate: assignment.dueDate,
        maxGrade: assignment.maxGrade || 100,
        stats: {
          totalStudents,
          submitted,
          notSubmitted: totalStudents - submitted,
          graded,
          avgGrade,
          submissionRate: totalStudents > 0 ? Math.round((submitted / totalStudents) * 100) : 0
        }
      });
    }

    // 測驗
    const quizzes = await getCourseQuizzes(id);
    for (const quiz of quizzes) {
      let attempted = 0;
      let passed = 0;
      const scores = [];

      for (const enrollment of enrollments) {
        const attempts = await db.query(`QUIZ#${quiz.quizId}`, {
          skPrefix: `ATTEMPT#${enrollment.userId}`
        });
        if (attempts && attempts.length > 0) {
          attempted++;
          const bestAttempt = attempts.reduce((best, curr) =>
            (!best || (curr.percentage > best.percentage)) ? curr : best, null);
          if (bestAttempt) {
            scores.push(bestAttempt.percentage);
            if (bestAttempt.percentage >= (quiz.passingGrade || 60)) {
              passed++;
            }
          }
        }
      }

      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      activityReport.push({
        type: 'quiz',
        id: quiz.quizId,
        title: quiz.title,
        openDate: quiz.openDate,
        closeDate: quiz.closeDate,
        timeLimit: quiz.timeLimit,
        maxAttempts: quiz.maxAttempts,
        passingGrade: quiz.passingGrade || 60,
        stats: {
          totalStudents,
          attempted,
          notAttempted: totalStudents - attempted,
          passed,
          avgScore,
          attemptRate: totalStudents > 0 ? Math.round((attempted / totalStudents) * 100) : 0,
          passRate: attempted > 0 ? Math.round((passed / attempted) * 100) : 0
        }
      });
    }

    // 論壇
    const forums = await getCourseForums(id);
    for (const forum of forums) {
      const discussions = await getForumDiscussions(forum.forumId);

      let totalReplies = 0;
      const participatingStudents = new Set();

      for (const discussion of discussions) {
        if (discussion.authorId) {
          participatingStudents.add(discussion.authorId);
        }
        totalReplies += Number(discussion.replyCount || 0);
        const posts = await getDiscussionPosts(discussion.discussionId);
        for (const post of posts) {
          if (post.authorId) {
            participatingStudents.add(post.authorId);
          }
        }
      }

      activityReport.push({
        type: 'forum',
        id: forum.forumId,
        title: forum.title,
        stats: {
          totalStudents,
          participatingStudents: participatingStudents.size,
          totalDiscussions: discussions.length,
          totalReplies,
          participationRate: totalStudents > 0 ? Math.round((participatingStudents.size / totalStudents) * 100) : 0
        }
      });
    }

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),
        totalStudents,
        activities: activityReport
      }
    });

  } catch (error) {
    console.error('Get activity report error:', error);
    res.status(500).json({
      success: false,
      error: 'REPORT_FAILED',
      message: '生成報告失敗'
    });
  }
});

/**
 * GET /api/courses/:id/grade-analysis
 * 成績分析
 * 教師功能
 */
router.get('/:id/grade-analysis', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 取得課程
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 檢查權限
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看分析'
      });
    }

    // 取得報名學生
    const enrollments = await getCourseEnrollments(id);

    // 收集所有成績數據
    const studentGrades = {};
    const gradeItems = [];

    // 初始化學生成績記錄
    for (const enrollment of enrollments) {
      const student = await db.getUser(enrollment.userId);
      studentGrades[enrollment.userId] = {
        studentId: enrollment.userId,
        studentName: student?.displayName || student?.email || 'Unknown',
        studentEmail: student?.email || '',
        items: {},
        totalPoints: 0,
        maxPoints: 0,
        percentage: 0
      };
    }

    // 收集作業成績
    const assignments = await getCourseAssignments(id);
    for (const assignment of assignments) {
      gradeItems.push({
        type: 'assignment',
        id: assignment.assignmentId,
        title: assignment.title,
        maxGrade: assignment.maxGrade || 100,
        weight: assignment.weight || 1
      });

      for (const enrollment of enrollments) {
        const submission = await db.getItem(`ASSIGNMENT#${assignment.assignmentId}`, `SUBMISSION#${enrollment.userId}`);
        if (submission && submission.grade !== null && submission.grade !== undefined) {
          studentGrades[enrollment.userId].items[assignment.assignmentId] = {
            grade: submission.grade,
            maxGrade: assignment.maxGrade || 100,
            percentage: Math.round((submission.grade / (assignment.maxGrade || 100)) * 100)
          };
          studentGrades[enrollment.userId].totalPoints += submission.grade;
          studentGrades[enrollment.userId].maxPoints += (assignment.maxGrade || 100);
        }
      }
    }

    // 收集測驗成績
    const quizzes = await getCourseQuizzes(id);
    for (const quiz of quizzes) {
      gradeItems.push({
        type: 'quiz',
        id: quiz.quizId,
        title: quiz.title,
        maxGrade: 100, // 測驗以百分比計算
        weight: quiz.weight || 1
      });

      for (const enrollment of enrollments) {
        const attempts = await db.query(`QUIZ#${quiz.quizId}`, {
          skPrefix: `ATTEMPT#${enrollment.userId}`
        });
        if (attempts && attempts.length > 0) {
          // 取最高分
          const bestAttempt = attempts.reduce((best, curr) =>
            (!best || (curr.percentage > best.percentage)) ? curr : best, null);
          if (bestAttempt) {
            studentGrades[enrollment.userId].items[quiz.quizId] = {
              grade: bestAttempt.percentage,
              maxGrade: 100,
              percentage: Math.round(bestAttempt.percentage)
            };
            studentGrades[enrollment.userId].totalPoints += bestAttempt.percentage;
            studentGrades[enrollment.userId].maxPoints += 100;
          }
        }
      }
    }

    // 計算每個學生的總百分比
    for (const uId in studentGrades) {
      const student = studentGrades[uId];
      student.percentage = student.maxPoints > 0
        ? Math.round((student.totalPoints / student.maxPoints) * 100)
        : 0;
    }

    // 計算成績分佈
    const percentages = Object.values(studentGrades).map(s => s.percentage);
    const distribution = {
      'A (90-100)': percentages.filter(p => p >= 90).length,
      'B (80-89)': percentages.filter(p => p >= 80 && p < 90).length,
      'C (70-79)': percentages.filter(p => p >= 70 && p < 80).length,
      'D (60-69)': percentages.filter(p => p >= 60 && p < 70).length,
      'F (<60)': percentages.filter(p => p < 60).length
    };

    // 統計數據
    const avgPercentage = percentages.length > 0
      ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
      : 0;
    const highestPercentage = percentages.length > 0 ? Math.max(...percentages) : 0;
    const lowestPercentage = percentages.length > 0 ? Math.min(...percentages) : 0;
    const passRate = percentages.length > 0
      ? Math.round((percentages.filter(p => p >= 60).length / percentages.length) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        courseId: id,
        courseTitle: course.title,
        generatedAt: new Date().toISOString(),

        summary: {
          totalStudents: enrollments.length,
          averagePercentage: avgPercentage,
          highestPercentage,
          lowestPercentage,
          passRate,
          totalGradeItems: gradeItems.length
        },

        distribution,
        gradeItems,
        students: Object.values(studentGrades).sort((a, b) => b.percentage - a.percentage)
      }
    });

  } catch (error) {
    console.error('Get grade analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'ANALYSIS_FAILED',
      message: '生成分析失敗'
    });
  }
});

/**
 * GET /api/courses/:id/export-report
 * 匯出課程報告 (CSV)
 * 教師功能
 */
router.get('/:id/export-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'grades' } = req.query; // grades, participation

    // 取得課程
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 檢查權限
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限匯出報告'
      });
    }

    // 取得報名學生
    const enrollments = await getCourseEnrollments(id);

    let csvContent = '';
    let filename = '';

    if (type === 'participation') {
      // 參與報告 CSV
      const headers = ['學生姓名', '學生 Email', '報名日期', '最後存取', '進度 %', '狀態'];
      const rows = [];

      for (const enrollment of enrollments) {
        const student = await db.getUser(enrollment.userId);
        const progress = await db.getItem(`USER#${enrollment.userId}`, `PROG#COURSE#${id}`);

        rows.push([
          student?.displayName || 'Unknown',
          student?.email || 'N/A',
          enrollment.enrolledAt ? new Date(enrollment.enrolledAt).toLocaleDateString('zh-TW') : 'N/A',
          progress?.lastAccessedAt ? new Date(progress.lastAccessedAt).toLocaleDateString('zh-TW') : '從未存取',
          progress?.progressPercentage || 0,
          progress?.status === 'completed' ? '已完成' : (progress?.status === 'in_progress' ? '進行中' : '未開始')
        ]);
      }

      csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
      filename = `${course.title}_參與報告_${new Date().toISOString().split('T')[0]}.csv`;

    } else {
      // 成績報告 CSV
      const [assignments, quizzes] = await Promise.all([
        getCourseAssignments(id),
        getCourseQuizzes(id)
      ]);

      const headers = ['學生姓名', '學生 Email'];
      assignments.forEach(a => headers.push(`作業: ${a.title}`));
      quizzes.forEach(q => headers.push(`測驗: ${q.title}`));
      headers.push('總分', '百分比', '等級');

      const rows = [];

      for (const enrollment of enrollments) {
        const student = await db.getUser(enrollment.userId);
        const row = [student?.displayName || 'Unknown', student?.email || 'N/A'];

        let totalPoints = 0;
        let maxPoints = 0;

        // 作業成績
        for (const assignment of assignments) {
          const submission = await db.getItem(`ASSIGNMENT#${assignment.assignmentId}`, `SUBMISSION#${enrollment.userId}`);
          if (submission?.grade !== null && submission?.grade !== undefined) {
            row.push(submission.grade);
            totalPoints += submission.grade;
            maxPoints += (assignment.maxGrade || 100);
          } else {
            row.push('-');
          }
        }

        // 測驗成績
        for (const quiz of quizzes) {
          const attempts = await db.query(`QUIZ#${quiz.quizId}`, {
            skPrefix: `ATTEMPT#${enrollment.userId}`
          });
          if (attempts && attempts.length > 0) {
            const best = attempts.reduce((b, c) => (!b || c.percentage > b.percentage) ? c : b, null);
            row.push(Math.round(best.percentage));
            totalPoints += best.percentage;
            maxPoints += 100;
          } else {
            row.push('-');
          }
        }

        const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
        let grade = 'F';
        if (percentage >= 90) grade = 'A';
        else if (percentage >= 80) grade = 'B';
        else if (percentage >= 70) grade = 'C';
        else if (percentage >= 60) grade = 'D';

        row.push(totalPoints, percentage + '%', grade);
        rows.push(row);
      }

      csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
      filename = `${course.title}_成績報告_${new Date().toISOString().split('T')[0]}.csv`;
    }

    // 添加 BOM
    const bom = '\uFEFF';
    const csvWithBom = bom + csvContent;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csvWithBom);

  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出報告失敗'
    });
  }
});

module.exports = router;
