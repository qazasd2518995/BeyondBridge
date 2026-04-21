/**
 * 作業批改與成績操作
 * BeyondBridge Education Platform - Assignment Grading Operations
 *
 * 功能:
 * - 查看提交列表與詳情（教師）
 * - 批改作業（單一/批量）
 * - 延長截止日期
 * - 批量下載提交
 * - 匯出成績
 * - 提交統計
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse } = require('../../utils/course-access');
const { invalidateGradebookSnapshots } = require('../../utils/gradebook-snapshots');
const { syncCourseCertificates } = require('../../utils/certificates');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs').promises;
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const S3_BUCKET = process.env.S3_BUCKET || 'beyondbridge-files';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

/**
 * 從 rubric 定義與教師給分計算總分
 * rubricScores 格式:[{ criterionId, score }]
 * 返回 null 表示無法計算（caller 應 fallback 到手動 grade）
 */
function computeGradeFromRubric(rubric, rubricScores, maxGrade) {
  if (!rubric || !Array.isArray(rubric.criteria) || rubric.criteria.length === 0) return null;
  if (!Array.isArray(rubricScores) || rubricScores.length === 0) return null;

  const scoreByCriterion = new Map();
  rubricScores.forEach(entry => {
    if (!entry) return;
    const cid = entry.criterionId || entry.id;
    if (!cid) return;
    const s = Number(entry.score ?? entry.points ?? 0);
    if (Number.isFinite(s)) scoreByCriterion.set(cid, s);
  });

  let totalEarned = 0;
  let totalMax = 0;
  for (const criterion of rubric.criteria) {
    const cid = criterion.criterionId || criterion.id;
    const max = Number(criterion.maxScore ?? criterion.points ?? 0);
    if (!Number.isFinite(max) || max <= 0) continue;
    totalMax += max;
    const earned = scoreByCriterion.has(cid) ? scoreByCriterion.get(cid) : 0;
    totalEarned += Math.max(0, Math.min(earned, max));
  }
  if (totalMax <= 0) return null;

  const target = Number(maxGrade) > 0 ? Number(maxGrade) : totalMax;
  const scaled = (totalEarned / totalMax) * target;
  return Math.round(scaled * 100) / 100;
}

/**
 * 建立學生評分通知
 */
async function createGradeNotification({ studentId, assignment, finalGrade, feedback, graderId }) {
  if (!studentId || !assignment) return;
  try {
    const notificationId = db.generateId('notif');
    const now = new Date().toISOString();
    await db.putItem({
      PK: `USER#${studentId}`,
      SK: `NOTIFICATION#${now}#${notificationId}`,
      entityType: 'NOTIFICATION',
      notificationId,
      userId: studentId,
      type: 'assignment_graded',
      title: '作業已批改',
      message: `您的作業「${assignment.title || ''}」已批改完成，得分 ${finalGrade} / ${assignment.maxGrade}`,
      payload: {
        assignmentId: assignment.assignmentId,
        courseId: assignment.courseId,
        grade: finalGrade,
        maxGrade: assignment.maxGrade,
        hasFeedback: !!feedback,
        gradedBy: graderId
      },
      readAt: null,
      createdAt: now
    });
  } catch (error) {
    console.warn('Create grade notification failed:', error.message);
  }
}

/**
 * 判斷某提交是否要匿名
 */
function shouldMaskSubmissionForAnonymous(submission, assignment) {
  if (!assignment?.anonymousGrading) return false;
  if (assignment.anonymousGradingUntil === 'never') return true;
  return !submission?.gradedAt;
}

/**
 * 產生匿名代稱
 */
function buildAnonymousHandle(submission) {
  const src = submission?.submissionId || submission?.userId || '';
  return `ANON-${String(src).slice(-6).toUpperCase() || 'XXXXXX'}`;
}

/**
 * 匿名化提交記錄（若作業啟用匿名評分且評分尚未釋出）
 */
function maskAnonymousSubmission(submission, assignment) {
  if (!submission) return submission;
  if (!assignment?.anonymousGrading) return submission;
  if (submission.gradedAt && assignment.anonymousGradingUntil === 'never') return submission;

  const anonId = submission.submissionId || submission.userId || '';
  const suffix = String(anonId).slice(-4).toUpperCase();
  return {
    ...submission,
    studentId: null,
    userId: submission.userId,
    studentName: `匿名學生 #${suffix}`,
    studentEmail: null,
    userName: `匿名學生 #${suffix}`,
    userEmail: null,
    _anonymous: true
  };
}

function extractStoredFileId(file = {}) {
  if (!file || typeof file !== 'object') return null;
  const directId = file.fileId || file.id || null;
  if (directId) return directId;

  const candidates = [
    file.downloadUrl,
    file.viewUrl,
    file.url,
    file.fileUrl
  ].filter(Boolean);

  for (const value of candidates) {
    const match = String(value).match(/\/api\/files\/([^/?#]+)/);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function getStoredFileBuffer(fileId) {
  if (!fileId) return null;
  const fileRecord = await db.getItem(`FILE#${fileId}`, 'META');
  if (!fileRecord) return null;

  const s3Key = fileRecord.s3Key || `files/${fileRecord.storageName}`;
  try {
    const result = await s3Client.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key
    }));
    const chunks = [];
    for await (const chunk of result.Body) {
      chunks.push(chunk);
    }
    return {
      buffer: Buffer.concat(chunks),
      filename: fileRecord.filename,
      contentType: fileRecord.contentType,
      uploadedAt: fileRecord.createdAt || fileRecord.updatedAt || null
    };
  } catch (s3Error) {
    try {
      if (!fileRecord.storagePath) {
        const fallbackPath = path.join(UPLOAD_DIR, fileRecord.storageName || '');
        await fs.access(fallbackPath);
        return {
          buffer: await fs.readFile(fallbackPath),
          filename: fileRecord.filename,
          contentType: fileRecord.contentType,
          uploadedAt: fileRecord.createdAt || fileRecord.updatedAt || null
        };
      }

      await fs.access(fileRecord.storagePath);
      return {
        buffer: await fs.readFile(fileRecord.storagePath),
        filename: fileRecord.filename,
        contentType: fileRecord.contentType,
        uploadedAt: fileRecord.createdAt || fileRecord.updatedAt || null
      };
    } catch (fsError) {
      console.warn('Load stored assignment file failed:', { fileId, s3Error: s3Error?.message, fsError: fsError?.message });
      return null;
    }
  }
}

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
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看提交'
      });
    }

    // 取得所有提交
    let submissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });

    // 取得用戶資訊（匿名評分時不揭露姓名，除非批改後解鎖）
    const isAnonymous = !!assignment.anonymousGrading;
    submissions = await Promise.all(
      submissions.map(async (s) => {
        delete s.PK;
        delete s.SK;
        const shouldMask = isAnonymous && (
          assignment.anonymousGradingUntil === 'never' || !s.gradedAt
        );
        const user = shouldMask ? null : await db.getUser(s.userId);
        const base = {
          ...s,
          studentId: s.studentId || s.userId,
          studentName: user?.displayName || '未知用戶',
          studentEmail: user?.email,
          userName: user?.displayName || '未知用戶',
          userEmail: user?.email
        };
        return shouldMask ? maskAnonymousSubmission(base, assignment) : base;
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
 * GET /api/assignments/:id/submissions/:submissionRef
 * 取得單一提交詳情（教師用）
 */
router.get('/:id/submissions/:submissionRef', authMiddleware, async (req, res) => {
  try {
    const { id, submissionRef } = req.params;
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
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看提交'
      });
    }

    // 找到提交
    const submissions = await db.query(`ASSIGNMENT#${id}`, { skPrefix: 'SUBMISSION#' });
    const submission = submissions.find(s =>
      s.submissionId === submissionRef ||
      s.userId === submissionRef ||
      s.studentId === submissionRef
    );

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'SUBMISSION_NOT_FOUND',
        message: '找不到此提交'
      });
    }

    // 匿名評分邏輯
    const shouldMask = !!assignment.anonymousGrading && (
      assignment.anonymousGradingUntil === 'never' || !submission.gradedAt
    );
    const user = shouldMask ? null : await db.getUser(submission.userId);

    delete submission.PK;
    delete submission.SK;

    const hydrated = {
      ...submission,
      studentId: submission.studentId || submission.userId,
      studentName: user?.displayName || '未知用戶',
      studentEmail: user?.email,
      userName: user?.displayName || '未知用戶',
      userEmail: user?.email,
      assignment: {
        title: assignment.title,
        maxGrade: assignment.maxGrade,
        rubric: assignment.rubric,
        anonymousGrading: !!assignment.anonymousGrading
      }
    };

    res.json({
      success: true,
      data: shouldMask ? maskAnonymousSubmission(hydrated, assignment) : hydrated
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
    const { grade, feedback, rubricScores, feedbackFiles = [], annotations = [] } = req.body;

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
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限批改此作業'
      });
    }

    // 取得提交（組別作業：studentId 可能是 "GROUP#<groupId>" 或任一組員 userId）
    let submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${studentId}`);
    if (!submission && assignment.teamSubmission) {
      // 退而求其次：當傳入的是 userId，透過群組找出組別提交
      const userGroups = await db.query(`USER#${studentId}`, { skPrefix: `COURSEGROUP#${assignment.courseId}#` });
      const groupId = userGroups?.[0]?.groupId;
      if (groupId) {
        submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#GROUP#${groupId}`);
      }
    }
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'SUBMISSION_NOT_FOUND',
        message: '找不到提交記錄'
      });
    }

    // Rubric 自動計算分數（若 body 未提供 grade 或 rubric 啟用時）
    const rubricComputed = computeGradeFromRubric(assignment.rubric, rubricScores, assignment.maxGrade);
    const resolvedGrade = (grade === undefined || grade === null || grade === '')
      ? rubricComputed
      : Number(grade);

    if (resolvedGrade === null || resolvedGrade === undefined || Number.isNaN(resolvedGrade)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_GRADE',
        message: '請提供分數或完整的 rubric 評分'
      });
    }

    // 驗證分數
    if (resolvedGrade < 0 || resolvedGrade > assignment.maxGrade) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_GRADE',
        message: `分數必須在 0 到 ${assignment.maxGrade} 之間`
      });
    }

    // 計算最終分數（考慮遲交扣分，封頂 100% 避免負分）
    let finalGrade = resolvedGrade;
    if (submission.isLate && assignment.lateDeductionPercent > 0) {
      const lateBy = Math.max(0, Number(submission.lateBy) || 0);
      const rawPercent = Number(assignment.lateDeductionPercent) * lateBy;
      const deductionPercent = Math.min(100, Math.max(0, rawPercent));
      const deduction = resolvedGrade * (deductionPercent / 100);
      finalGrade = Math.max(0, resolvedGrade - deduction);
    }

    const now = new Date().toISOString();

    // PDF 標註：驗證並序列化（僅保留白名單欄位，防止 payload 塞任意資料）
    const sanitizedAnnotations = Array.isArray(annotations)
      ? annotations.slice(0, 500).map((a, idx) => ({
          id: a?.id || `ann_${idx}`,
          fileId: a?.fileId || null,
          page: Number.isFinite(Number(a?.page)) ? Number(a.page) : 1,
          x: Number.isFinite(Number(a?.x)) ? Number(a.x) : 0,
          y: Number.isFinite(Number(a?.y)) ? Number(a.y) : 0,
          width: Number.isFinite(Number(a?.width)) ? Number(a.width) : 0,
          height: Number.isFinite(Number(a?.height)) ? Number(a.height) : 0,
          type: ['highlight', 'comment', 'strikethrough', 'draw'].includes(a?.type) ? a.type : 'comment',
          color: typeof a?.color === 'string' ? a.color.slice(0, 20) : '#FFD54F',
          comment: typeof a?.comment === 'string' ? a.comment.slice(0, 2000) : '',
          createdBy: userId,
          createdAt: a?.createdAt || now
        }))
      : [];

    const updates = {
      grade: finalGrade,
      originalGrade: resolvedGrade,
      feedback,
      feedbackFiles: Array.isArray(feedbackFiles) ? feedbackFiles : [],
      annotations: sanitizedAnnotations,
      rubricScores,
      rubricAutoCalculated: rubricComputed !== null && (grade === undefined || grade === null || grade === ''),
      gradedAt: now,
      gradedBy: userId,
      status: 'graded',
      updatedAt: now
    };

    // 組別作業的 SK 是 SUBMISSION#GROUP#<groupId>，個人作業是 SUBMISSION#<userId>
    const submissionSK = submission.SK || (submission.groupId
      ? `SUBMISSION#GROUP#${submission.groupId}`
      : `SUBMISSION#${submission.userId || studentId}`);

    const updatedSubmission = await db.updateItem(
      `ASSIGNMENT#${id}`,
      submissionSK,
      updates
    );

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

    // 更新用戶課程進度中的成績（組別作業同步給所有組員）
    const gradeTargets = submission.groupId && Array.isArray(submission.groupMemberIds) && submission.groupMemberIds.length > 0
      ? submission.groupMemberIds
      : [studentId];

    for (const targetUserId of gradeTargets) {
      const progress = await db.getItem(`USER#${targetUserId}`, `PROG#COURSE#${assignment.courseId}`);
      if (!progress) continue;

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

      const overallGrade = grades.reduce((sum, g) => sum + (g.grade / g.maxGrade * 100), 0) / grades.length;

      await db.updateItem(`USER#${targetUserId}`, `PROG#COURSE#${assignment.courseId}`, {
        grades,
        overallGrade: Math.round(overallGrade * 100) / 100,
        updatedAt: now
      });

      await syncCourseCertificates(assignment.courseId, {
        userId: targetUserId,
        issuedBy: req.user.userId
      });
    }

    await invalidateGradebookSnapshots(assignment.courseId);

    // 發送學生通知（組別作業通知所有組員）
    const notifyTargets = submission.groupId && Array.isArray(submission.groupMemberIds) && submission.groupMemberIds.length > 0
      ? submission.groupMemberIds
      : [studentId];
    await Promise.all(notifyTargets.map(target => createGradeNotification({
      studentId: target,
      assignment,
      finalGrade,
      feedback,
      graderId: userId
    })));

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
 * POST /api/assignments/:id/submissions/:studentId/return
 * 退回作業請學生修改
 */
router.post('/:id/submissions/:studentId/return', authMiddleware, async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const { feedback } = req.body;

    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此作業'
      });
    }

    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限操作此作業'
      });
    }

    const submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${studentId}`);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'SUBMISSION_NOT_FOUND',
        message: '找不到提交記錄'
      });
    }

    const now = new Date().toISOString();
    const updatedSubmission = await db.updateItem(
      `ASSIGNMENT#${id}`,
      `SUBMISSION#${studentId}`,
      {
        status: 'returned',
        returnedAt: now,
        returnedBy: req.user.userId,
        returnFeedback: feedback || '請修改後重新提交',
        updatedAt: now
      }
    );

    delete updatedSubmission.PK;
    delete updatedSubmission.SK;

    res.json({
      success: true,
      message: '作業已退回',
      data: updatedSubmission
    });
  } catch (error) {
    console.error('Return submission error:', error);
    res.status(500).json({
      success: false,
      error: 'RETURN_FAILED',
      message: '退回作業失敗'
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
    if (!canManageCourse(course, req.user)) {
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
    if (!canManageCourse(course, req.user)) {
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

    // 取得用戶資訊（匿名時不解析學生）
    const submissionsWithUsers = await Promise.all(
      submissions.map(async (s) => {
        const mask = shouldMaskSubmissionForAnonymous(s, assignment);
        if (mask) {
          const handle = buildAnonymousHandle(s);
          return {
            ...s,
            userName: handle,
            userEmail: '',
            _anonymous: true,
            _anonymousHandle: handle
          };
        }
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
        studentId: s._anonymous ? s._anonymousHandle : s.userId,
        studentName: s.userName,
        studentEmail: s.userEmail,
        anonymous: !!s._anonymous,
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
        s._anonymous ? s._anonymousHandle : s.userId,
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
      const folderIdSuffix = submission._anonymous
        ? submission._anonymousHandle
        : String(submission.userId || '').substring(0, 8);
      const folderName = `${safeName}_${folderIdSuffix}`;

      // 元資料 JSON
      const metadata = {
        submissionId: submission.submissionId,
        studentId: submission._anonymous ? submission._anonymousHandle : submission.userId,
        studentName: submission.userName,
        studentEmail: submission.userEmail,
        anonymous: !!submission._anonymous,
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

      // 附件資訊與實體檔案
      if (submission.files && submission.files.length > 0) {
        const filesList = submission.files.map((f, i) => ({
          index: i + 1,
          filename: f.name || f.filename || `file_${i + 1}`,
          size: f.size,
          type: f.type || f.mimeType,
          fileId: extractStoredFileId(f),
          url: f.downloadUrl || f.viewUrl || f.url || f.s3Key || '(本地檔案)',
          uploadedAt: f.uploadedAt
        }));

        archive.append(JSON.stringify(filesList, null, 2), {
          name: `${folderName}/files_list.json`
        });

        // 如果有正式檔案記錄，直接把實體檔案打進 zip。
        for (let i = 0; i < submission.files.length; i++) {
          const file = submission.files[i];
          const storedFile = await getStoredFileBuffer(extractStoredFileId(file));
          if (!storedFile?.buffer) continue;

          const filename = storedFile.filename || file.name || file.filename || `file_${i + 1}`;
          archive.append(storedFile.buffer, {
            name: `${folderName}/files/${filename}`
          });
        }

        // 舊資料若仍把 base64 內容直接存進提交，也一併保留。
        for (let i = 0; i < submission.files.length; i++) {
          const file = submission.files[i];
          if (file.content) {
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
    if (!canManageCourse(course, req.user)) {
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

    // 組合資料（匿名評分時遮罩）
    const exportData = await Promise.all(
      enrollments.map(async (e) => {
        const submission = submissionMap.get(e.userId);
        const mask = submission
          ? shouldMaskSubmissionForAnonymous(submission, assignment)
          : !!assignment.anonymousGrading;
        const handle = submission ? buildAnonymousHandle(submission) : `ANON-${String(e.userId || '').slice(-6).toUpperCase()}`;
        const user = mask ? null : await db.getUser(e.userId);

        return {
          '學號': mask ? handle : e.userId,
          '姓名': mask ? handle : (user?.displayName || '未知用戶'),
          'Email': mask ? '' : (user?.email || ''),
          '匿名': mask ? '是' : '否',
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

      const csvFilename = `${safeTitle}_成績_${timestamp}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(csvFilename)}`);
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
    if (!canManageCourse(course, req.user)) {
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

      const progress = await db.getItem(`USER#${g.studentId}`, `PROG#COURSE#${assignment.courseId}`);
      if (progress) {
        const progressGrades = [...(progress.grades || [])];
        const existingIndex = progressGrades.findIndex(item => item.assignmentId === id);
        const gradeEntry = {
          assignmentId: id,
          assignmentTitle: assignment.title,
          grade: finalGrade,
          maxGrade: assignment.maxGrade,
          gradedAt: now
        };

        if (existingIndex >= 0) {
          progressGrades[existingIndex] = gradeEntry;
        } else {
          progressGrades.push(gradeEntry);
        }

        const overallGrade = progressGrades.reduce((sum, item) => sum + (item.grade / item.maxGrade * 100), 0) / progressGrades.length;
        await db.updateItem(`USER#${g.studentId}`, `PROG#COURSE#${assignment.courseId}`, {
          grades: progressGrades,
          overallGrade: Math.round(overallGrade * 100) / 100,
          updatedAt: now
        });

        await syncCourseCertificates(assignment.courseId, {
          userId: g.studentId,
          issuedBy: req.user.userId
        });
      }

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

    await invalidateGradebookSnapshots(assignment.courseId);

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
    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到作業'
      });
    }

    // 驗證是否為課程教師或管理員
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (!canManageCourse(course, req.user)) {
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
    const studentIds = [...new Set(submissions.map(s => s.studentId || s.userId).filter(Boolean))];
    const students = {};
    for (const studentId of studentIds) {
      const student = await db.getUser(studentId);
      if (student) {
        students[studentId] = student;
      }
    }

    // 準備下載資料（返回提交清單和檔案連結）
    const downloadData = submissions.map(submission => {
      const effectiveStudentId = submission.studentId || submission.userId;
      const student = students[effectiveStudentId] || {};
      const studentName = student.displayName || student.email?.split('@')[0] || effectiveStudentId;

      return {
        studentId: effectiveStudentId,
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
        folderName: `${studentName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${String(effectiveStudentId).substring(0, 8)}`
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
 * GET /api/assignments/:id/submission-stats
 * 取得提交統計
 * 教師功能
 */
router.get('/:id/submission-stats', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 檢查權限（教師或管理員）
    const assignment = await db.getItem(`ASSIGNMENT#${id}`, 'META');
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '找不到作業'
      });
    }

    // 驗證是否為課程教師或管理員
    const course = await db.getItem(`COURSE#${assignment.courseId}`, 'META');
    if (!canManageCourse(course, req.user)) {
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
