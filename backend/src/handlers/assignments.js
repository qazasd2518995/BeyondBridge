/**
 * 作業系統 API 處理器
 * BeyondBridge Education Platform - Moodle-style Assignment System
 *
 * 功能特色:
 * - 作業建立與管理
 * - 多種提交類型 (文字/檔案)
 * - 遲交管理與扣分
 * - 批量下載提交
 * - 評分工作流程
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, optionalAuthMiddleware } = require('../utils/auth');
const archiver = require('archiver');
const path = require('path');

// ==================== 作業列表與詳情 ====================

/**
 * GET /api/assignments
 * 取得所有作業列表（依課程分組）
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId, status, dueIn } = req.query;

    let assignments = await db.scan({
      filter: {
        expression: 'entityType = :type',
        values: { ':type': 'ASSIGNMENT' }
      }
    });

    // 課程篩選
    if (courseId) {
      assignments = assignments.filter(a => a.courseId === courseId);
    }

    // 狀態篩選（upcoming, past, all）
    const now = new Date();
    if (status === 'upcoming') {
      assignments = assignments.filter(a => new Date(a.dueDate) > now);
    } else if (status === 'past') {
      assignments = assignments.filter(a => new Date(a.dueDate) <= now);
    }

    // 即將到期篩選（天數內）
    if (dueIn) {
      const daysLater = new Date(now.getTime() + parseInt(dueIn) * 24 * 60 * 60 * 1000);
      assignments = assignments.filter(a => {
        const dueDate = new Date(a.dueDate);
        return dueDate > now && dueDate <= daysLater;
      });
    }

    // 取得用戶的提交狀態
    const assignmentsWithStatus = await Promise.all(
      assignments.map(async (a) => {
        const submission = await db.getItem(
          `ASSIGNMENT#${a.assignmentId}`,
          `SUBMISSION#${userId}`
        );
        delete a.PK;
        delete a.SK;
        return {
          ...a,
          submissionStatus: submission ? {
            submitted: true,
            submittedAt: submission.submittedAt,
            grade: submission.grade,
            graded: submission.gradedAt !== null
          } : {
            submitted: false
          }
        };
      })
    );

    // 排序：按截止日期
    assignmentsWithStatus.sort((a, b) =>
      new Date(a.dueDate) - new Date(b.dueDate)
    );

    res.json({
      success: true,
      data: assignmentsWithStatus,
      count: assignmentsWithStatus.length
    });

  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得作業列表失敗'
    });
  }
});

/**
 * GET /api/assignments/my
 * 取得我的作業（學生：待完成/已完成，教師：待批改）
 */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { role = 'student', status = 'all' } = req.query;

    if (role === 'instructor') {
      // 教師：取得自己課程的所有作業
      const courses = await db.scan({
        filter: {
          expression: 'entityType = :type AND instructorId = :instructorId',
          values: { ':type': 'COURSE', ':instructorId': userId }
        }
      });

      const courseIds = courses.map(c => c.courseId);

      let assignments = await db.scan({
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'ASSIGNMENT' }
        }
      });

      assignments = assignments.filter(a => courseIds.includes(a.courseId));

      // 取得每個作業的提交統計
      const assignmentsWithStats = await Promise.all(
        assignments.map(async (a) => {
          const submissions = await db.query(`ASSIGNMENT#${a.assignmentId}`, {
            skPrefix: 'SUBMISSION#'
          });

          const gradedCount = submissions.filter(s => s.gradedAt).length;
          const pendingCount = submissions.filter(s => !s.gradedAt).length;

          delete a.PK;
          delete a.SK;
          return {
            ...a,
            stats: {
              totalSubmissions: submissions.length,
              graded: gradedCount,
              pending: pendingCount
            }
          };
        })
      );

      res.json({
        success: true,
        data: assignmentsWithStats,
        count: assignmentsWithStats.length
      });

    } else {
      // 學生：取得已報名課程的作業
      const progressList = await db.getUserCourseProgress(userId);
      const courseIds = progressList.map(p => p.courseId);

      let assignments = await db.scan({
        filter: {
          expression: 'entityType = :type',
          values: { ':type': 'ASSIGNMENT' }
        }
      });

      assignments = assignments.filter(a => courseIds.includes(a.courseId));

      // 取得提交狀態
      const assignmentsWithStatus = await Promise.all(
        assignments.map(async (a) => {
          const submission = await db.getItem(
            `ASSIGNMENT#${a.assignmentId}`,
            `SUBMISSION#${userId}`
          );
          delete a.PK;
          delete a.SK;
          return {
            ...a,
            submission: submission ? {
              submitted: true,
              submittedAt: submission.submittedAt,
              content: submission.content,
              files: submission.files,
              grade: submission.grade,
              feedback: submission.feedback,
              gradedAt: submission.gradedAt
            } : null
          };
        })
      );

      // 狀態篩選
      let filtered = assignmentsWithStatus;
      const now = new Date();
      if (status === 'pending') {
        filtered = filtered.filter(a => !a.submission?.submitted && new Date(a.dueDate) > now);
      } else if (status === 'submitted') {
        filtered = filtered.filter(a => a.submission?.submitted);
      } else if (status === 'graded') {
        filtered = filtered.filter(a => a.submission?.gradedAt);
      } else if (status === 'overdue') {
        filtered = filtered.filter(a => !a.submission?.submitted && new Date(a.dueDate) <= now);
      }

      // 排序
      filtered.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

      res.json({
        success: true,
        data: filtered,
        count: filtered.length
      });
    }

  } catch (error) {
    console.error('Get my assignments error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得作業失敗'
    });
  }
});

/**
 * GET /api/assignments/:id
 * 取得作業詳情
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 取得課程資訊
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');

    // 取得用戶的提交
    const submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${userId}`);

    delete assignment.PK;
    delete assignment.SK;

    res.json({
      success: true,
      data: {
        ...assignment,
        courseName: course?.title,
        submission: submission ? {
          submittedAt: submission.submittedAt,
          content: submission.content,
          files: submission.files,
          grade: submission.grade,
          feedback: submission.feedback,
          gradedAt: submission.gradedAt,
          gradedBy: submission.gradedBy
        } : null
      }
    });

  } catch (error) {
    console.error('Get assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得作業失敗'
    });
  }
});

// ==================== 作業管理（教師） ====================

/**
 * POST /api/assignments
 * 建立新作業
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      courseId,
      sectionId,
      title,
      description,
      instructions,
      dueDate,
      cutoffDate, // 逾期後不再接受
      allowLateSubmission = true,
      lateDeductionPercent = 10, // 遲交扣分百分比
      maxGrade = 100,
      gradeToPass = 60,
      submissionType = 'online_text', // online_text, file, both
      maxFiles = 5,
      maxFileSize = 10, // MB
      allowedFileTypes = ['pdf', 'doc', 'docx', 'txt', 'zip'],
      teamSubmission = false,
      teamSize,
      rubric, // 評分標準
      visible = true
    } = req.body;

    // 驗證必填欄位
    if (!courseId || !title || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供課程ID、作業標題和截止日期'
      });
    }

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限在此課程建立作業'
      });
    }

    const assignmentId = db.generateId('assign');
    const now = new Date().toISOString();

    const assignmentItem = {
      PK: `ASSIGNMENT#${assignmentId}`,
      SK: 'META',
      entityType: 'ASSIGNMENT',
      GSI1PK: `COURSE#${courseId}`,
      GSI1SK: `ASSIGNMENT#${assignmentId}`,
      GSI2PK: `DUE#${dueDate.substring(0, 10)}`,
      GSI2SK: `ASSIGNMENT#${assignmentId}`,

      assignmentId,
      courseId,
      sectionId,
      title,
      description,
      instructions,

      // 日期設定
      dueDate,
      cutoffDate: cutoffDate || null,
      allowLateSubmission,
      lateDeductionPercent,

      // 評分設定
      maxGrade,
      gradeToPass,

      // 提交設定
      submissionType,
      maxFiles,
      maxFileSize,
      allowedFileTypes,

      // 團隊設定
      teamSubmission,
      teamSize: teamSubmission ? teamSize : null,

      // 評分標準
      rubric: rubric || null,

      visible,
      status: 'active',

      // 統計
      stats: {
        totalSubmissions: 0,
        gradedCount: 0,
        averageGrade: 0
      },

      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(assignmentItem);

    // 如果有 sectionId，也在課程活動中建立連結
    if (sectionId) {
      const activities = await db.query(`COURSE#${courseId}`, {
        skPrefix: `ACTIVITY#${sectionId}#`
      });
      const activityNumber = String(activities.length + 1).padStart(3, '0');

      const activityItem = {
        PK: `COURSE#${courseId}`,
        SK: `ACTIVITY#${sectionId}#${activityNumber}`,
        entityType: 'COURSE_ACTIVITY',

        activityId: assignmentId,
        courseId,
        sectionId,
        type: 'assignment',
        title,
        description,
        assignmentId,

        order: activities.length + 1,
        visible,

        completion: { type: 'grade', gradeToPass },

        createdAt: now,
        updatedAt: now
      };

      await db.putItem(activityItem);
    }

    delete assignmentItem.PK;
    delete assignmentItem.SK;

    res.status(201).json({
      success: true,
      message: '作業建立成功',
      data: assignmentItem
    });

  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立作業失敗'
    });
  }
});

/**
 * PUT /api/assignments/:id
 * 更新作業
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此作業'
      });
    }

    // 不允許更新的欄位
    delete updates.assignmentId;
    delete updates.courseId;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.stats;

    updates.updatedAt = new Date().toISOString();

    // 更新 GSI（如果截止日期改變）
    if (updates.dueDate) {
      updates.GSI2PK = `DUE#${updates.dueDate.substring(0, 10)}`;
    }

    const updatedAssignment = await db.updateItem(`ASSIGNMENT#${id}`, 'META', updates);

    delete updatedAssignment.PK;
    delete updatedAssignment.SK;

    res.json({
      success: true,
      message: '作業已更新',
      data: updatedAssignment
    });

  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新作業失敗'
    });
  }
});

/**
 * DELETE /api/assignments/:id
 * 刪除作業
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限刪除此作業'
      });
    }

    // 刪除所有提交
    const submissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });
    for (const sub of submissions) {
      await db.deleteItem(`ASSIGNMENT#${id}`, sub.SK);
    }

    // 刪除作業
    await db.deleteItem(`ASSIGNMENT#${id}`, 'META');

    res.json({
      success: true,
      message: '作業已刪除'
    });

  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除作業失敗'
    });
  }
});

// ==================== 作業提交（學生） ====================

/**
 * POST /api/assignments/:id/submit
 * 提交作業
 */
router.post('/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { content, files = [] } = req.body;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 檢查是否已報名課程
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${assignment.courseId}`);
    if (!progress) {
      return res.status(403).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    const cutoffDate = assignment.cutoffDate ? new Date(assignment.cutoffDate) : null;

    // 檢查是否已過最終截止日期
    if (cutoffDate && now > cutoffDate) {
      return res.status(403).json({
        success: false,
        error: 'SUBMISSION_CLOSED',
        message: '已超過最終截止日期，無法提交'
      });
    }

    // 檢查是否遲交
    const isLate = now > dueDate;
    if (isLate && !assignment.allowLateSubmission) {
      return res.status(403).json({
        success: false,
        error: 'LATE_SUBMISSION_NOT_ALLOWED',
        message: '此作業不接受遲交'
      });
    }

    // 驗證提交內容
    if (assignment.submissionType === 'online_text' && !content) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請提供文字內容'
      });
    }

    if (assignment.submissionType === 'file' && files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '請上傳檔案'
      });
    }

    // 檢查是否已有提交
    const existingSubmission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${userId}`);

    const submissionItem = {
      PK: `ASSIGNMENT#${id}`,
      SK: `SUBMISSION#${userId}`,
      entityType: 'ASSIGNMENT_SUBMISSION',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `SUBMISSION#${id}`,

      submissionId: existingSubmission?.submissionId || db.generateId('sub'),
      assignmentId: id,
      userId,
      courseId: assignment.courseId,

      content,
      files,

      submittedAt: now.toISOString(),
      isLate,
      lateBy: isLate ? Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24)) : 0, // 遲交天數

      status: 'submitted',
      grade: null,
      feedback: null,
      gradedAt: null,
      gradedBy: null,

      // 版本控制
      version: (existingSubmission?.version || 0) + 1,
      previousVersions: existingSubmission ? [
        ...(existingSubmission.previousVersions || []),
        {
          content: existingSubmission.content,
          files: existingSubmission.files,
          submittedAt: existingSubmission.submittedAt
        }
      ] : [],

      createdAt: existingSubmission?.createdAt || now.toISOString(),
      updatedAt: now.toISOString()
    };

    await db.putItem(submissionItem);

    // 更新作業統計
    if (!existingSubmission) {
      await db.updateItem(`ASSIGNMENT#${id}`, 'META', {
        'stats.totalSubmissions': (assignment.stats?.totalSubmissions || 0) + 1,
        updatedAt: now.toISOString()
      });
    }

    delete submissionItem.PK;
    delete submissionItem.SK;

    res.status(201).json({
      success: true,
      message: existingSubmission ? '作業已重新提交' : '作業提交成功',
      data: submissionItem
    });

  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'SUBMIT_FAILED',
      message: '提交作業失敗'
    });
  }
});

/**
 * DELETE /api/assignments/:id/submit
 * 撤回作業提交
 */
router.delete('/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${userId}`);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'SUBMISSION_NOT_FOUND',
        message: '找不到提交記錄'
      });
    }

    // 已批改的不能撤回
    if (submission.gradedAt) {
      return res.status(403).json({
        success: false,
        error: 'ALREADY_GRADED',
        message: '已批改的作業無法撤回'
      });
    }

    await db.deleteItem(`ASSIGNMENT#${id}`, `SUBMISSION#${userId}`);

    // 更新作業統計
    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (assignment) {
      await db.updateItem(`ASSIGNMENT#${id}`, 'META', {
        'stats.totalSubmissions': Math.max(0, (assignment.stats?.totalSubmissions || 1) - 1)
      });
    }

    res.json({
      success: true,
      message: '作業提交已撤回'
    });

  } catch (error) {
    console.error('Withdraw submission error:', error);
    res.status(500).json({
      success: false,
      error: 'WITHDRAW_FAILED',
      message: '撤回提交失敗'
    });
  }
});

// ==================== 作業批改（教師） ====================

/**
 * GET /api/assignments/:id/submissions
 * 取得所有提交（教師用）
 */
router.get('/:id/submissions', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { status, search } = req.query;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看提交'
      });
    }

    // 取得所有提交
    let submissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });

    // 取得用戶資訊
    submissions = await Promise.all(
      submissions.map(async (s) => {
        const user = await db.getUser(s.userId);
        delete s.PK;
        delete s.SK;
        return {
          ...s,
          userName: user?.displayName || '未知用戶',
          userEmail: user?.email
        };
      })
    );

    // 狀態篩選
    if (status === 'graded') {
      submissions = submissions.filter(s => s.gradedAt);
    } else if (status === 'pending') {
      submissions = submissions.filter(s => !s.gradedAt);
    } else if (status === 'late') {
      submissions = submissions.filter(s => s.isLate);
    }

    // 搜尋篩選
    if (search) {
      const searchLower = search.toLowerCase();
      submissions = submissions.filter(s =>
        s.userName?.toLowerCase().includes(searchLower) ||
        s.userEmail?.toLowerCase().includes(searchLower)
      );
    }

    // 排序：未批改的在前，然後按提交時間
    submissions.sort((a, b) => {
      if (a.gradedAt && !b.gradedAt) return 1;
      if (!a.gradedAt && b.gradedAt) return -1;
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    });

    res.json({
      success: true,
      data: submissions,
      count: submissions.length,
      stats: {
        total: submissions.length,
        graded: submissions.filter(s => s.gradedAt).length,
        pending: submissions.filter(s => !s.gradedAt).length,
        late: submissions.filter(s => s.isLate).length
      }
    });

  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得提交列表失敗'
    });
  }
});

/**
 * GET /api/assignments/:id/submissions/:submissionId
 * 取得單一提交詳情（教師用）
 */
router.get('/:id/submissions/:submissionId', authMiddleware, async (req, res) => {
  try {
    const { id, submissionId } = req.params;
    const userId = req.user.userId;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看提交'
      });
    }

    // 找到提交
    const submissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });
    const submission = submissions.find(s => s.submissionId === submissionId);

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'SUBMISSION_NOT_FOUND',
        message: '找不到此提交'
      });
    }

    // 取得用戶資訊
    const user = await db.getUser(submission.userId);

    delete submission.PK;
    delete submission.SK;

    res.json({
      success: true,
      data: {
        ...submission,
        userName: user?.displayName || '未知用戶',
        userEmail: user?.email,
        assignment: {
          title: assignment.title,
          maxGrade: assignment.maxGrade,
          rubric: assignment.rubric
        }
      }
    });

  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得提交失敗'
    });
  }
});

/**
 * POST /api/assignments/:id/submissions/:userId/grade
 * 批改作業
 */
router.post('/:id/submissions/:studentId/grade', authMiddleware, async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const userId = req.user.userId;
    const { grade, feedback, rubricScores } = req.body;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限批改此作業'
      });
    }

    // 取得提交
    const submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${studentId}`);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'SUBMISSION_NOT_FOUND',
        message: '找不到提交記錄'
      });
    }

    // 驗證分數
    if (grade < 0 || grade > assignment.maxGrade) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_GRADE',
        message: `分數必須在 0 到 ${assignment.maxGrade} 之間`
      });
    }

    // 計算最終分數（考慮遲交扣分）
    let finalGrade = grade;
    if (submission.isLate && assignment.lateDeductionPercent > 0) {
      const deduction = grade * (assignment.lateDeductionPercent / 100) * submission.lateBy;
      finalGrade = Math.max(0, grade - deduction);
    }

    const now = new Date().toISOString();
    const updates = {
      grade: finalGrade,
      originalGrade: grade,
      feedback,
      rubricScores,
      gradedAt: now,
      gradedBy: userId,
      status: 'graded',
      updatedAt: now
    };

    const updatedSubmission = await db.updateItem(
      `ASSIGNMENT#${id}`,
      `SUBMISSION#${studentId}`,
      updates
    );

    // 更新作業統計
    const submissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });
    const gradedSubmissions = submissions.filter(s => s.gradedAt);
    const totalGrades = gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0);
    const averageGrade = gradedSubmissions.length > 0 ? totalGrades / gradedSubmissions.length : 0;

    await db.updateItem(`ASSIGNMENT#${id}`, 'META', {
      'stats.gradedCount': gradedSubmissions.length,
      'stats.averageGrade': Math.round(averageGrade * 100) / 100,
      updatedAt: now
    });

    // 更新用戶課程進度中的成績
    const progress = await db.getItem(`USER#${studentId}`, `PROG#COURSE#${assignment.courseId}`);
    if (progress) {
      const grades = [...(progress.grades || [])];
      const existingIndex = grades.findIndex(g => g.assignmentId === id);
      const gradeEntry = {
        assignmentId: id,
        assignmentTitle: assignment.title,
        grade: finalGrade,
        maxGrade: assignment.maxGrade,
        gradedAt: now
      };

      if (existingIndex >= 0) {
        grades[existingIndex] = gradeEntry;
      } else {
        grades.push(gradeEntry);
      }

      // 計算整體成績
      const overallGrade = grades.reduce((sum, g) => sum + (g.grade / g.maxGrade * 100), 0) / grades.length;

      await db.updateItem(`USER#${studentId}`, `PROG#COURSE#${assignment.courseId}`, {
        grades,
        overallGrade: Math.round(overallGrade * 100) / 100,
        updatedAt: now
      });
    }

    delete updatedSubmission.PK;
    delete updatedSubmission.SK;

    res.json({
      success: true,
      message: '批改完成',
      data: updatedSubmission
    });

  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(500).json({
      success: false,
      error: 'GRADE_FAILED',
      message: '批改失敗'
    });
  }
});

/**
 * POST /api/assignments/:id/extend
 * 延長截止日期
 */
router.post('/:id/extend', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { newDueDate, userIds } = req.body;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限修改此作業'
      });
    }

    const now = new Date().toISOString();

    if (userIds && userIds.length > 0) {
      // 為特定用戶延長
      for (const studentId of userIds) {
        const extensionItem = {
          PK: `ASSIGNMENT#${id}`,
          SK: `EXTENSION#${studentId}`,
          entityType: 'ASSIGNMENT_EXTENSION',

          assignmentId: id,
          userId: studentId,
          originalDueDate: assignment.dueDate,
          extendedDueDate: newDueDate,
          grantedBy: userId,
          grantedAt: now
        };

        await db.putItem(extensionItem);
      }

      res.json({
        success: true,
        message: `已為 ${userIds.length} 位學生延長截止日期`
      });
    } else {
      // 延長所有人
      await db.updateItem(`ASSIGNMENT#${id}`, 'META', {
        dueDate: newDueDate,
        GSI2PK: `DUE#${newDueDate.substring(0, 10)}`,
        updatedAt: now
      });

      res.json({
        success: true,
        message: '截止日期已延長'
      });
    }

  } catch (error) {
    console.error('Extend deadline error:', error);
    res.status(500).json({
      success: false,
      error: 'EXTEND_FAILED',
      message: '延長截止日期失敗'
    });
  }
});

// ==================== 批量下載提交 ====================

/**
 * GET /api/assignments/:id/download-all
 * 批量下載所有提交（教師用）
 *
 * 參數:
 * - format: zip (預設), json
 * - status: all, graded, pending
 * - includeText: true/false (是否包含文字提交)
 *
 * ZIP 結構:
 * assignment_[title]/
 * ├── _summary.csv          # 提交摘要
 * ├── [student_name]_[id]/
 * │   ├── submission.txt    # 文字內容（如有）
 * │   ├── metadata.json     # 提交資訊
 * │   └── [uploaded files]  # 上傳的檔案
 */
router.get('/:id/download-all', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      format = 'zip',
      status = 'all',
      includeText = 'true'
    } = req.query;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限下載提交'
      });
    }

    // 取得所有提交
    let submissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });

    // 狀態篩選
    if (status === 'graded') {
      submissions = submissions.filter(s => s.gradedAt);
    } else if (status === 'pending') {
      submissions = submissions.filter(s => !s.gradedAt);
    }

    if (submissions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NO_SUBMISSIONS',
        message: '沒有符合條件的提交'
      });
    }

    // 取得用戶資訊
    const submissionsWithUsers = await Promise.all(
      submissions.map(async (s) => {
        const user = await db.getUser(s.userId);
        return {
          ...s,
          userName: user?.displayName || '未知用戶',
          userEmail: user?.email || ''
        };
      })
    );

    if (format === 'json') {
      // JSON 格式輸出
      const exportData = submissionsWithUsers.map(s => ({
        submissionId: s.submissionId,
        studentId: s.userId,
        studentName: s.userName,
        studentEmail: s.userEmail,
        submittedAt: s.submittedAt,
        isLate: s.isLate,
        lateBy: s.lateBy,
        status: s.status,
        grade: s.grade,
        maxGrade: assignment.maxGrade,
        feedback: s.feedback,
        gradedAt: s.gradedAt,
        content: includeText === 'true' ? s.content : undefined,
        files: s.files?.map(f => ({
          name: f.name || f.filename,
          size: f.size,
          type: f.type || f.mimeType,
          url: f.url
        }))
      }));

      return res.json({
        success: true,
        data: {
          assignment: {
            assignmentId: assignment.assignmentId,
            title: assignment.title,
            dueDate: assignment.dueDate,
            maxGrade: assignment.maxGrade
          },
          course: {
            courseId: course.courseId,
            title: course.title
          },
          exportedAt: new Date().toISOString(),
          submissionCount: exportData.length,
          submissions: exportData
        }
      });
    }

    // ZIP 格式輸出
    const safeTitle = assignment.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];
    const zipFilename = `${safeTitle}_提交_${timestamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(zipFilename)}`);

    const archive = archiver('zip', {
      zlib: { level: 6 } // 壓縮等級
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw err;
    });

    archive.pipe(res);

    // 建立摘要 CSV
    const BOM = '\uFEFF';
    const csvHeaders = ['學號', '姓名', 'Email', '提交時間', '遲交', '遲交天數', '狀態', '分數', '滿分', '百分比', '批改時間', '回饋'];
    const csvRows = submissionsWithUsers.map(s => {
      const percentage = s.grade !== null && s.grade !== undefined
        ? Math.round((s.grade / assignment.maxGrade) * 10000) / 100 + '%'
        : '';
      return [
        s.userId,
        s.userName,
        s.userEmail,
        s.submittedAt,
        s.isLate ? '是' : '否',
        s.lateBy || 0,
        s.gradedAt ? '已批改' : '待批改',
        s.grade ?? '',
        assignment.maxGrade,
        percentage,
        s.gradedAt || '',
        (s.feedback || '').replace(/"/g, '""')
      ].map(v => {
        const str = String(v);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str}"`
          : str;
      }).join(',');
    });

    const csvContent = BOM + [csvHeaders.join(','), ...csvRows].join('\r\n');
    archive.append(csvContent, { name: '_summary.csv' });

    // 為每個提交建立資料夾
    for (const submission of submissionsWithUsers) {
      const safeName = (submission.userName || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const folderName = `${safeName}_${submission.userId.substring(0, 8)}`;

      // 元資料 JSON
      const metadata = {
        submissionId: submission.submissionId,
        studentId: submission.userId,
        studentName: submission.userName,
        studentEmail: submission.userEmail,
        submittedAt: submission.submittedAt,
        isLate: submission.isLate,
        lateByDays: submission.lateBy,
        status: submission.gradedAt ? 'graded' : 'pending',
        grade: submission.grade,
        maxGrade: assignment.maxGrade,
        feedback: submission.feedback,
        gradedAt: submission.gradedAt,
        version: submission.version,
        filesCount: submission.files?.length || 0
      };
      archive.append(JSON.stringify(metadata, null, 2), {
        name: `${folderName}/metadata.json`
      });

      // 文字內容
      if (includeText === 'true' && submission.content) {
        archive.append(submission.content, {
          name: `${folderName}/submission.txt`
        });
      }

      // 檔案資訊（不實際下載檔案，只提供 URL 清單）
      if (submission.files && submission.files.length > 0) {
        const filesList = submission.files.map((f, i) => ({
          index: i + 1,
          filename: f.name || f.filename || `file_${i + 1}`,
          size: f.size,
          type: f.type || f.mimeType,
          url: f.url || f.s3Key || '(本地檔案)',
          uploadedAt: f.uploadedAt
        }));

        archive.append(JSON.stringify(filesList, null, 2), {
          name: `${folderName}/files_list.json`
        });

        // 如果有 base64 內容，也包含進去（小檔案可能直接存在 DB 中）
        for (let i = 0; i < submission.files.length; i++) {
          const file = submission.files[i];
          if (file.content) {
            // Base64 編碼的檔案內容
            const buffer = Buffer.from(file.content, 'base64');
            const filename = file.name || file.filename || `file_${i + 1}`;
            archive.append(buffer, {
              name: `${folderName}/files/${filename}`
            });
          }
        }
      }

      // 歷史版本摘要
      if (submission.previousVersions && submission.previousVersions.length > 0) {
        const versionsSummary = submission.previousVersions.map((v, i) => ({
          version: i + 1,
          submittedAt: v.submittedAt,
          contentPreview: v.content ? v.content.substring(0, 200) + '...' : null,
          filesCount: v.files?.length || 0
        }));

        archive.append(JSON.stringify(versionsSummary, null, 2), {
          name: `${folderName}/previous_versions.json`
        });
      }
    }

    await archive.finalize();

  } catch (error) {
    console.error('Download submissions error:', error);

    // 如果尚未開始回應，發送錯誤 JSON
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'DOWNLOAD_FAILED',
        message: '下載提交失敗'
      });
    }
  }
});

/**
 * GET /api/assignments/:id/export-grades
 * 匯出作業成績
 */
router.get('/:id/export-grades', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { format = 'csv' } = req.query;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限匯出成績'
      });
    }

    // 取得所有學生（已報名的）
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${assignment.courseId}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    // 取得所有提交
    const submissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });
    const submissionMap = new Map(submissions.map(s => [s.userId, s]));

    // 組合資料
    const exportData = await Promise.all(
      enrollments.map(async (e) => {
        const user = await db.getUser(e.userId);
        const submission = submissionMap.get(e.userId);

        return {
          '學號': e.userId,
          '姓名': user?.displayName || '未知用戶',
          'Email': user?.email || '',
          '提交狀態': submission ? (submission.gradedAt ? '已批改' : '已提交') : '未提交',
          '提交時間': submission?.submittedAt || '',
          '遲交': submission?.isLate ? '是' : (submission ? '否' : ''),
          '遲交天數': submission?.lateBy || '',
          '原始分數': submission?.originalGrade ?? '',
          '最終分數': submission?.grade ?? '',
          '滿分': assignment.maxGrade,
          '百分比': submission?.grade !== null && submission?.grade !== undefined
            ? `${Math.round((submission.grade / assignment.maxGrade) * 10000) / 100}%`
            : '',
          '及格': submission?.grade !== null && submission?.grade !== undefined
            ? (submission.grade >= (assignment.gradeToPass || 60) ? '是' : '否')
            : '',
          '回饋': submission?.feedback || '',
          '批改時間': submission?.gradedAt || ''
        };
      })
    );

    if (format === 'csv') {
      const headers = Object.keys(exportData[0] || {});
      const BOM = '\uFEFF';

      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...exportData.map(row => headers.map(h => escapeCSV(row[h])).join(','))
      ].join('\r\n');

      const safeTitle = assignment.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const timestamp = new Date().toISOString().split('T')[0];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}_成績_${timestamp}.csv`);
      res.send(BOM + csvContent);

    } else {
      res.json({
        success: true,
        data: {
          assignment: {
            assignmentId: assignment.assignmentId,
            title: assignment.title,
            dueDate: assignment.dueDate,
            maxGrade: assignment.maxGrade
          },
          exportedAt: new Date().toISOString(),
          grades: exportData
        }
      });
    }

  } catch (error) {
    console.error('Export assignment grades error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出成績失敗'
    });
  }
});

/**
 * POST /api/assignments/:id/bulk-grade
 * 批量評分
 */
router.post('/:id/bulk-grade', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { grades } = req.body; // Array of { studentId, grade, feedback }

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 權限檢查
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (course.instructorId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限批改此作業'
      });
    }

    if (!grades || !Array.isArray(grades)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: '請提供成績資料陣列'
      });
    }

    const now = new Date().toISOString();
    const results = [];

    for (const g of grades) {
      if (!g.studentId || g.grade === undefined) {
        results.push({ studentId: g.studentId, success: false, error: '缺少必要欄位' });
        continue;
      }

      // 取得提交
      const submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${g.studentId}`);
      if (!submission) {
        results.push({ studentId: g.studentId, success: false, error: '找不到提交' });
        continue;
      }

      // 驗證分數
      if (g.grade < 0 || g.grade > assignment.maxGrade) {
        results.push({ studentId: g.studentId, success: false, error: '分數超出範圍' });
        continue;
      }

      // 計算最終分數（考慮遲交扣分）
      let finalGrade = g.grade;
      if (submission.isLate && assignment.lateDeductionPercent > 0) {
        const deduction = g.grade * (assignment.lateDeductionPercent / 100) * submission.lateBy;
        finalGrade = Math.max(0, g.grade - deduction);
      }

      await db.updateItem(`ASSIGNMENT#${id}`, `SUBMISSION#${g.studentId}`, {
        grade: finalGrade,
        originalGrade: g.grade,
        feedback: g.feedback || null,
        gradedAt: now,
        gradedBy: userId,
        status: 'graded',
        updatedAt: now
      });

      results.push({ studentId: g.studentId, success: true, finalGrade });
    }

    // 更新作業統計
    const allSubmissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });
    const gradedSubmissions = allSubmissions.filter(s => s.gradedAt);
    const totalGrades = gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0);
    const averageGrade = gradedSubmissions.length > 0 ? totalGrades / gradedSubmissions.length : 0;

    await db.updateItem(`ASSIGNMENT#${id}`, 'META', {
      'stats.gradedCount': gradedSubmissions.length,
      'stats.averageGrade': Math.round(averageGrade * 100) / 100,
      updatedAt: now
    });

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `已批改 ${successCount}/${grades.length} 份作業`,
      data: { results }
    });

  } catch (error) {
    console.error('Bulk grade error:', error);
    res.status(500).json({
      success: false,
      error: 'BULK_GRADE_FAILED',
      message: '批量評分失敗'
    });
  }
});

// ==================== 批量下載提交 ====================

/**
 * GET /api/assignments/:id/download-submissions
 * 批量下載作業提交（打包成 ZIP）
 * 教師功能
 */
router.get('/:id/download-submissions', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { filter = 'all' } = req.query; // all, graded, ungraded, late

    // 檢查權限（教師或管理員）
    const assignment = await db.get(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到作業'
      });
    }

    // 驗證是否為課程教師或管理員
    const course = await db.get(`COURSE#${assignment.courseId}`, 'META');
    const isInstructor = course?.instructorId === userId ||
                         (course?.instructors && course.instructors.includes(userId));

    if (!req.user.isAdmin && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限下載提交'
      });
    }

    // 取得所有提交
    let submissions = await db.query(`ASSIGNMENT#${id}`, {
      skPrefix: 'SUBMISSION#'
    });

    // 過濾提交
    switch (filter) {
      case 'graded':
        submissions = submissions.filter(s => s.status === 'graded');
        break;
      case 'ungraded':
        submissions = submissions.filter(s => s.status !== 'graded');
        break;
      case 'late':
        submissions = submissions.filter(s => s.isLate);
        break;
      // 'all' 不需要過濾
    }

    if (submissions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NO_SUBMISSIONS',
        message: '沒有符合條件的提交'
      });
    }

    // 取得所有相關學生資訊
    const studentIds = [...new Set(submissions.map(s => s.studentId))];
    const students = {};
    for (const studentId of studentIds) {
      const student = await db.getUser(studentId);
      if (student) {
        students[studentId] = student;
      }
    }

    // 準備下載資料（返回提交清單和檔案連結）
    const downloadData = submissions.map(submission => {
      const student = students[submission.studentId] || {};
      const studentName = student.displayName || student.email?.split('@')[0] || submission.studentId;

      return {
        studentId: submission.studentId,
        studentName: studentName,
        studentEmail: student.email || null,
        submittedAt: submission.submittedAt,
        status: submission.status,
        isLate: submission.isLate || false,
        grade: submission.grade || null,
        feedback: submission.feedback || null,
        // 文字提交
        textContent: submission.content || null,
        // 檔案提交
        files: (submission.files || []).map(file => ({
          fileName: file.fileName,
          fileUrl: file.fileUrl,
          fileSize: file.fileSize,
          uploadedAt: file.uploadedAt
        })),
        // 用於建立資料夾名稱
        folderName: `${studentName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${submission.studentId.substring(0, 8)}`
      };
    });

    // 生成下載資訊
    const downloadInfo = {
      assignmentId: id,
      assignmentTitle: assignment.title,
      courseId: assignment.courseId,
      courseName: course?.title || 'Unknown Course',
      totalSubmissions: downloadData.length,
      filter: filter,
      generatedAt: new Date().toISOString(),
      submissions: downloadData
    };

    res.json({
      success: true,
      data: downloadInfo,
      message: `已準備 ${downloadData.length} 份提交供下載`
    });

  } catch (error) {
    console.error('Download submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'DOWNLOAD_FAILED',
      message: '準備下載失敗'
    });
  }
});

/**
 * GET /api/assignments/:id/export-grades
 * 匯出成績為 CSV
 * 教師功能
 */
router.get('/:id/export-grades', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 檢查權限（教師或管理員）
    const assignment = await db.get(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到作業'
      });
    }

    // 驗證是否為課程教師或管理員
    const course = await db.get(`COURSE#${assignment.courseId}`, 'META');
    const isInstructor = course?.instructorId === userId ||
                         (course?.instructors && course.instructors.includes(userId));

    if (!req.user.isAdmin && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限匯出成績'
      });
    }

    // 取得所有提交
    const submissions = await db.query(`ASSIGNMENT#${id}`, {
      skPrefix: 'SUBMISSION#'
    });

    // 取得所有學生資訊
    const studentIds = [...new Set(submissions.map(s => s.studentId))];
    const students = {};
    for (const studentId of studentIds) {
      const student = await db.getUser(studentId);
      if (student) {
        students[studentId] = student;
      }
    }

    // 建立 CSV 內容
    const headers = ['學生姓名', '學生 Email', '提交時間', '狀態', '遲交', '成績', '滿分', '百分比', '回饋'];
    const rows = submissions.map(submission => {
      const student = students[submission.studentId] || {};
      const studentName = student.displayName || 'Unknown';
      const studentEmail = student.email || 'N/A';
      const submittedAt = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString('zh-TW') : 'N/A';
      const status = submission.status === 'graded' ? '已評分' :
                     submission.status === 'submitted' ? '已提交' : '未提交';
      const isLate = submission.isLate ? '是' : '否';
      const grade = submission.grade !== null && submission.grade !== undefined ? submission.grade : 'N/A';
      const maxGrade = assignment.maxGrade || 100;
      const percentage = submission.grade !== null && submission.grade !== undefined
        ? Math.round((submission.grade / maxGrade) * 100) + '%'
        : 'N/A';
      const feedback = submission.feedback ? submission.feedback.replace(/,/g, '，').replace(/\n/g, ' ') : '';

      return [studentName, studentEmail, submittedAt, status, isLate, grade, maxGrade, percentage, feedback];
    });

    // 組合 CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // 添加 BOM 以支援 Excel 正確讀取 UTF-8
    const bom = '\uFEFF';
    const csvWithBom = bom + csvContent;

    // 設定回應標頭
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(assignment.title)}_grades_${new Date().toISOString().split('T')[0]}.csv"`);

    res.send(csvWithBom);

  } catch (error) {
    console.error('Export grades error:', error);
    res.status(500).json({
      success: false,
      error: 'EXPORT_FAILED',
      message: '匯出成績失敗'
    });
  }
});

/**
 * GET /api/assignments/:id/submission-stats
 * 取得提交統計
 * 教師功能
 */
router.get('/:id/submission-stats', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 檢查權限（教師或管理員）
    const assignment = await db.get(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到作業'
      });
    }

    // 驗證是否為課程教師或管理員
    const course = await db.get(`COURSE#${assignment.courseId}`, 'META');
    const isInstructor = course?.instructorId === userId ||
                         (course?.instructors && course.instructors.includes(userId));

    if (!req.user.isAdmin && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看統計'
      });
    }

    // 取得所有提交
    const submissions = await db.query(`ASSIGNMENT#${id}`, {
      skPrefix: 'SUBMISSION#'
    });

    // 取得課程學生數（已報名的學生）
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${assignment.courseId}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );
    const totalStudents = enrollments.length;

    // 計算統計
    const submittedCount = submissions.filter(s => s.submittedAt).length;
    const gradedCount = submissions.filter(s => s.status === 'graded').length;
    const lateCount = submissions.filter(s => s.isLate).length;
    const pendingCount = submittedCount - gradedCount;
    const notSubmittedCount = totalStudents - submittedCount;

    // 成績統計
    const gradedSubmissions = submissions.filter(s => s.grade !== null && s.grade !== undefined);
    const grades = gradedSubmissions.map(s => s.grade);
    const avgGrade = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
    const maxGrade = grades.length > 0 ? Math.max(...grades) : 0;
    const minGrade = grades.length > 0 ? Math.min(...grades) : 0;

    // 成績分佈
    const gradeDistribution = {
      'A (90-100)': 0,
      'B (80-89)': 0,
      'C (70-79)': 0,
      'D (60-69)': 0,
      'F (<60)': 0
    };

    gradedSubmissions.forEach(s => {
      const percentage = (s.grade / (assignment.maxGrade || 100)) * 100;
      if (percentage >= 90) gradeDistribution['A (90-100)']++;
      else if (percentage >= 80) gradeDistribution['B (80-89)']++;
      else if (percentage >= 70) gradeDistribution['C (70-79)']++;
      else if (percentage >= 60) gradeDistribution['D (60-69)']++;
      else gradeDistribution['F (<60)']++;
    });

    res.json({
      success: true,
      data: {
        assignmentId: id,
        assignmentTitle: assignment.title,
        maxGrade: assignment.maxGrade || 100,
        dueDate: assignment.dueDate,

        // 提交統計
        submission: {
          total: totalStudents,
          submitted: submittedCount,
          notSubmitted: notSubmittedCount,
          graded: gradedCount,
          pending: pendingCount,
          late: lateCount,
          submissionRate: totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0
        },

        // 成績統計
        grades: {
          count: gradedSubmissions.length,
          average: Math.round(avgGrade * 100) / 100,
          highest: maxGrade,
          lowest: minGrade,
          passRate: gradedSubmissions.length > 0
            ? Math.round((gradedSubmissions.filter(s => (s.grade / (assignment.maxGrade || 100)) * 100 >= 60).length / gradedSubmissions.length) * 100)
            : 0
        },

        // 成績分佈
        distribution: gradeDistribution
      }
    });

  } catch (error) {
    console.error('Get submission stats error:', error);
    res.status(500).json({
      success: false,
      error: 'STATS_FAILED',
      message: '取得統計失敗'
    });
  }
});

module.exports = router;
