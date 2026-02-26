/**
 * 作業提交操作
 * BeyondBridge Education Platform - Assignment Submission Operations
 *
 * 功能:
 * - 學生提交作業
 * - 撤回提交
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');

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

module.exports = router;
