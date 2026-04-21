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
 * 找出學生在課程中所屬的第一個群組（組別作業使用）
 * 返回 groupId 或 null
 */
async function findUserGroupInCourse(courseId, userId) {
  if (!courseId || !userId) return null;
  try {
    const userGroups = await db.query(`USER#${userId}`, { skPrefix: `COURSEGROUP#${courseId}#` });
    if (!userGroups || userGroups.length === 0) return null;
    return userGroups[0].groupId || null;
  } catch (error) {
    console.warn('findUserGroupInCourse failed:', error.message);
    return null;
  }
}

async function listGroupMemberUserIds(courseId, groupId) {
  if (!courseId || !groupId) return [];
  try {
    const members = await db.query(`COURSE#${courseId}`, { skPrefix: `GROUPMEMBER#${groupId}#` });
    return (members || []).map(m => m.userId).filter(Boolean);
  } catch (error) {
    console.warn('listGroupMemberUserIds failed:', error.message);
    return [];
  }
}

/**
 * 從檔案物件估算大小（bytes）。若前端未回報 size，返回 null 讓驗證跳過該項。
 */
function getFileSizeBytes(file) {
  if (!file) return null;
  const raw = file.size ?? file.fileSize ?? file.bytes ?? file.byteLength;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * 從檔案物件取出副檔名（不含 .，小寫）
 */
function getFileExtension(file) {
  const name = file?.name || file?.fileName || file?.filename || file?.url || '';
  const lastDot = String(name).lastIndexOf('.');
  if (lastDot < 0 || lastDot === String(name).length - 1) return '';
  return String(name).slice(lastDot + 1).toLowerCase();
}

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
    // 作業逾期後仍允許提交，只記錄逾時狀態與提交時間。
    const hasValidDueDate = dueDate instanceof Date && !Number.isNaN(dueDate.getTime());
    const isLate = hasValidDueDate ? now > dueDate : false;

    // 硬截止（cutoffDate）：超過則拒絕提交
    if (assignment.cutoffDate) {
      const cutoffDate = new Date(assignment.cutoffDate);
      if (!Number.isNaN(cutoffDate.getTime()) && now > cutoffDate) {
        return res.status(403).json({
          success: false,
          error: 'CUTOFF_PASSED',
          message: '已超過作業最終截止時間，無法提交'
        });
      }
    }

    // 遲交政策：若不允許遲交且已逾期，拒絕
    if (isLate && assignment.allowLateSubmission === false) {
      return res.status(403).json({
        success: false,
        error: 'LATE_SUBMISSION_NOT_ALLOWED',
        message: '作業已逾期，且不接受遲交'
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

    // 檔案驗證（數量、大小、類型）
    if (Array.isArray(files) && files.length > 0) {
      const maxFiles = Number(assignment.maxFiles) > 0 ? Number(assignment.maxFiles) : 5;
      if (files.length > maxFiles) {
        return res.status(400).json({
          success: false,
          error: 'TOO_MANY_FILES',
          message: `最多只能上傳 ${maxFiles} 個檔案`
        });
      }

      const maxFileSizeMB = Number(assignment.maxFileSize) > 0 ? Number(assignment.maxFileSize) : 10;
      const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
      const allowedTypes = Array.isArray(assignment.allowedFileTypes) && assignment.allowedFileTypes.length > 0
        ? assignment.allowedFileTypes.map(t => String(t).toLowerCase().replace(/^\./, ''))
        : null;

      for (const file of files) {
        const size = getFileSizeBytes(file);
        if (size !== null && size > maxFileSizeBytes) {
          return res.status(400).json({
            success: false,
            error: 'FILE_TOO_LARGE',
            message: `檔案「${file?.name || ''}」超過單檔大小上限 ${maxFileSizeMB} MB`
          });
        }

        if (allowedTypes) {
          const ext = getFileExtension(file);
          if (!ext || !allowedTypes.includes(ext)) {
            return res.status(400).json({
              success: false,
              error: 'FILE_TYPE_NOT_ALLOWED',
              message: `檔案「${file?.name || ''}」類型不被允許。允許類型：${allowedTypes.join(', ')}`
            });
          }
        }
      }
    }

    // 組別提交：找出學生所屬群組
    let groupId = null;
    let groupMemberIds = [];
    if (assignment.teamSubmission) {
      groupId = await findUserGroupInCourse(assignment.courseId, userId);
      if (!groupId) {
        return res.status(400).json({
          success: false,
          error: 'NO_GROUP',
          message: '此作業為組別提交，但您尚未被分配到任何群組'
        });
      }
      groupMemberIds = await listGroupMemberUserIds(assignment.courseId, groupId);
    }

    // 提交的 owner key：組別作業用 groupId，個人作業用 userId
    const submissionOwnerKey = groupId ? `GROUP#${groupId}` : userId;

    // 檢查是否已有提交
    const existingSubmission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${submissionOwnerKey}`);

    const submissionItem = {
      PK: `ASSIGNMENT#${id}`,
      SK: `SUBMISSION#${submissionOwnerKey}`,
      entityType: 'ASSIGNMENT_SUBMISSION',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `SUBMISSION#${id}`,

      submissionId: existingSubmission?.submissionId || db.generateId('sub'),
      assignmentId: id,
      userId,
      groupId: groupId || null,
      groupMemberIds: groupId ? groupMemberIds : [],
      submittedByUserId: userId,
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

    // 正式提交後清除草稿（不影響主流程）
    try {
      await db.deleteItem(`ASSIGNMENT#${id}`, `DRAFT#${userId}`);
    } catch (draftError) {
      console.warn('Clear draft after submit failed:', draftError.message);
    }

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

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    let ownerKey = userId;
    if (assignment?.teamSubmission) {
      const groupId = await findUserGroupInCourse(assignment.courseId, userId);
      if (groupId) ownerKey = `GROUP#${groupId}`;
    }

    const submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${ownerKey}`);
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

    await db.deleteItem(`ASSIGNMENT#${id}`, `SUBMISSION#${ownerKey}`);

    // 更新作業統計
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

// ==================== 草稿儲存 ====================

/**
 * PUT /api/assignments/:id/draft
 * 儲存作業草稿（未正式提交）
 */
router.put('/:id/draft', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { content = '', files = [] } = req.body || {};

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    // 已正式提交且已批改則不允許覆蓋
    const existingSubmission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${userId}`);
    if (existingSubmission?.status === 'submitted' || existingSubmission?.gradedAt) {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_SUBMITTED',
        message: '作業已提交，無法再儲存草稿'
      });
    }

    const now = new Date().toISOString();
    const draftItem = {
      PK: `ASSIGNMENT#${id}`,
      SK: `DRAFT#${userId}`,
      entityType: 'ASSIGNMENT_DRAFT',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `DRAFT#${id}`,

      assignmentId: id,
      userId,
      courseId: assignment.courseId,
      content,
      files,
      updatedAt: now,
      createdAt: now
    };

    await db.putItem(draftItem);

    delete draftItem.PK;
    delete draftItem.SK;

    res.json({
      success: true,
      message: '草稿已儲存',
      data: draftItem
    });
  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({
      success: false,
      error: 'SAVE_DRAFT_FAILED',
      message: '儲存草稿失敗'
    });
  }
});

/**
 * GET /api/assignments/:id/draft
 * 取得作業草稿
 */
router.get('/:id/draft', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const draft = await db.getItem(`ASSIGNMENT#${id}`, `DRAFT#${userId}`);
    if (!draft) {
      return res.json({ success: true, data: null });
    }

    delete draft.PK;
    delete draft.SK;
    res.json({ success: true, data: draft });
  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_DRAFT_FAILED',
      message: '取得草稿失敗'
    });
  }
});

module.exports = router;
