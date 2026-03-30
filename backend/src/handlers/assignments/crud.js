/**
 * 作業 CRUD 操作
 * BeyondBridge Education Platform - Assignment CRUD Operations
 *
 * 功能:
 * - 作業列表與詳情
 * - 作業建立、更新、刪除
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { canManageCourse, isTeachingUser } = require('../../utils/course-access');
const { invalidateGradebookSnapshots } = require('../../utils/gradebook-snapshots');
const { syncCourseActivityLink, deleteCourseActivityLink } = require('../../utils/course-activities');
const {
  getGradeVisibility,
  maskAssignmentSubmissionStatus,
  maskAssignmentSubmission
} = require('../../utils/grade-visibility');
const {
  listManagedCourseIds,
  backfillCourseOwnerLinks
} = require('../../utils/course-owner-links');

function uniqueIds(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function stripDbKeys(item = {}) {
  if (!item || typeof item !== 'object') return item;
  const { PK, SK, ...rest } = item;
  return rest;
}

async function getManagedAssignmentCourseIds(user) {
  if (!user?.userId || !isTeachingUser(user) || user.isAdmin) {
    return [];
  }

  const linkedCourseIds = await listManagedCourseIds(user.userId);
  if (linkedCourseIds.length > 0) {
    return linkedCourseIds;
  }

  const courses = await db.getItemsByEntityType('COURSE', {
    projection: [
      'courseId',
      'title',
      'name',
      'category',
      'visibility',
      'status',
      'updatedAt',
      'createdAt',
      'instructorId',
      'teacherId',
      'creatorId',
      'createdBy',
      'instructors'
    ]
  });
  const managedCourses = courses.filter(course => canManageCourse(course, user));

  if (managedCourses.length > 0) {
    await backfillCourseOwnerLinks(managedCourses);
  }

  return uniqueIds(managedCourses.map(course => course.courseId));
}

async function listAssignmentsForCourseIds(courseIds = []) {
  const ids = uniqueIds(courseIds);
  if (ids.length === 0) return [];

  const results = await Promise.all(ids.map(courseId =>
    db.queryByIndex('GSI1', `COURSE#${courseId}`, 'GSI1PK', {
      skName: 'GSI1SK',
      skPrefix: 'ASSIGNMENT#'
    })
  ));

  return results.flat().filter(Boolean);
}

async function getAssignmentSubmissionMap(assignmentIds = [], userId) {
  const ids = uniqueIds(assignmentIds);
  if (ids.length === 0 || !userId) return new Map();

  const submissions = await db.batchGetItems(ids.map(assignmentId => ({
    PK: `ASSIGNMENT#${assignmentId}`,
    SK: `SUBMISSION#${userId}`
  })), {
    projection: ['PK', 'submittedAt', 'content', 'files', 'grade', 'feedback', 'gradedAt', 'isLate', 'lateBy', 'version']
  });

  return new Map(submissions.map((submission) => {
    const assignmentId = String(submission.PK || '').replace('ASSIGNMENT#', '');
    return [assignmentId, submission];
  }));
}

async function getAssignmentCourseMap(assignments = []) {
  const courseIds = uniqueIds(assignments.map(item => item.courseId));
  if (courseIds.length === 0) return new Map();

  const courses = await db.getCoursesByIds(courseIds, {
    projection: [
      'courseId',
      'settings',
      'instructorId',
      'teacherId',
      'creatorId',
      'createdBy',
      'instructors'
    ]
  });

  return new Map(
    courses
      .filter(course => course?.courseId)
      .map(course => [course.courseId, course])
  );
}

// ==================== 作業列表與詳情 ====================

/**
 * GET /api/assignments
 * 取得所有作業列表（依課程分組）
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId, status, dueIn } = req.query;

    let assignments = [];

    if (req.user.isAdmin) {
      assignments = courseId
        ? await listAssignmentsForCourseIds([courseId])
        : await db.getItemsByEntityType('ASSIGNMENT');
    } else {
      const [progressList, managedCourseIds] = await Promise.all([
        db.getUserCourseProgress(userId),
        getManagedAssignmentCourseIds(req.user)
      ]);
      const allowedCourseIds = uniqueIds([
        ...progressList.map(item => item.courseId),
        ...managedCourseIds
      ]);
      const targetCourseIds = courseId
        ? allowedCourseIds.filter(id => id === courseId)
        : allowedCourseIds;
      assignments = await listAssignmentsForCourseIds(targetCourseIds);
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

    const courseMap = await getAssignmentCourseMap(assignments);
    const submissionMap = await getAssignmentSubmissionMap(
      assignments.map(item => item.assignmentId),
      userId
    );
    const assignmentsWithStatus = assignments.map((assignment) => {
      const submission = submissionMap.get(assignment.assignmentId);
      const course = courseMap.get(assignment.courseId) || null;
      const gradeVisibility = getGradeVisibility(course, {
        canManage: req.user.isAdmin || canManageCourse(course, req.user),
        isAdmin: req.user.isAdmin
      });
      const submissionStatus = submission ? {
        submitted: true,
        submittedAt: submission.submittedAt,
        grade: submission.grade,
        graded: submission.gradedAt !== null && submission.gradedAt !== undefined,
        gradedAt: submission.gradedAt || null,
        isLate: !!submission.isLate,
        lateBy: submission.lateBy || 0
      } : {
        submitted: false
      };
      return {
        ...stripDbKeys(assignment),
        submissionStatus: gradeVisibility.gradesReleased
          ? submissionStatus
          : maskAssignmentSubmissionStatus(submissionStatus),
        gradeVisibility
      };
    });

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
      const courseIds = req.user.isAdmin
        ? []
        : await getManagedAssignmentCourseIds(req.user);
      const assignments = req.user.isAdmin
        ? await db.getItemsByEntityType('ASSIGNMENT')
        : await listAssignmentsForCourseIds(courseIds);

      // 取得每個作業的提交統計
      const assignmentsWithStats = await Promise.all(
        assignments.map(async (assignment) => {
          const submissions = await db.query(`ASSIGNMENT#${assignment.assignmentId}`, {
            skPrefix: 'SUBMISSION#'
          });

          const gradedCount = submissions.filter(s => s.gradedAt).length;
          const pendingCount = submissions.filter(s => !s.gradedAt).length;

          return {
            ...stripDbKeys(assignment),
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
      const courseIds = uniqueIds(progressList.map(p => p.courseId));
      const assignments = await listAssignmentsForCourseIds(courseIds);
      const courseMap = await getAssignmentCourseMap(assignments);
      const submissionMap = await getAssignmentSubmissionMap(
        assignments.map(item => item.assignmentId),
        userId
      );
      const assignmentsWithStatus = assignments.map((assignment) => {
        const submission = submissionMap.get(assignment.assignmentId);
        const course = courseMap.get(assignment.courseId) || null;
        const gradeVisibility = getGradeVisibility(course, {
          canManage: req.user.isAdmin || canManageCourse(course, req.user),
          isAdmin: req.user.isAdmin
        });
        const normalizedSubmission = submission ? {
          submitted: true,
          submittedAt: submission.submittedAt,
          content: submission.content,
          files: submission.files,
          grade: submission.grade,
          feedback: submission.feedback,
          gradedAt: submission.gradedAt,
          isLate: !!submission.isLate,
          lateBy: submission.lateBy || 0,
          version: submission.version || 1
        } : null;
        return {
          ...stripDbKeys(assignment),
          submission: normalizedSubmission
            ? (gradeVisibility.gradesReleased ? normalizedSubmission : maskAssignmentSubmission(normalizedSubmission))
            : null,
          gradeVisibility
        };
      });

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
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${assignment.courseId}`);
    if (!req.user.isAdmin && !canManageCourse(course, req.user) && !progress) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看此作業'
      });
    }

    // 取得用戶的提交
    const submission = await db.getItem(`ASSIGNMENT#${id}`, `SUBMISSION#${userId}`);
    const gradeVisibility = getGradeVisibility(course, {
      canManage: req.user.isAdmin || canManageCourse(course, req.user),
      isAdmin: req.user.isAdmin
    });

    delete assignment.PK;
    delete assignment.SK;

    res.json({
      success: true,
      data: {
        ...assignment,
        courseName: course?.title,
        submission: submission ? (gradeVisibility.gradesReleased ? {
          submittedAt: submission.submittedAt,
          content: submission.content,
          files: submission.files,
          grade: submission.grade,
          feedback: submission.feedback,
          gradedAt: submission.gradedAt,
          gradedBy: submission.gradedBy,
          isLate: !!submission.isLate,
          lateBy: submission.lateBy || 0,
          version: submission.version || 1
        } : maskAssignmentSubmission({
          submittedAt: submission.submittedAt,
          content: submission.content,
          files: submission.files,
          grade: submission.grade,
          feedback: submission.feedback,
          gradedAt: submission.gradedAt,
          gradedBy: submission.gradedBy,
          isLate: !!submission.isLate,
          lateBy: submission.lateBy || 0,
          version: submission.version || 1
        })) : null,
        gradeVisibility
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

    if (!canManageCourse(course, req.user)) {
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

    await invalidateGradebookSnapshots(courseId);

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
    if (!canManageCourse(course, req.user)) {
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

    await syncCourseActivityLink(assignment.courseId, id, {
      title: updatedAssignment.title || assignment.title,
      description: updatedAssignment.description || assignment.description,
      visible: updatedAssignment.visible !== false,
      dueDate: updatedAssignment.dueDate || assignment.dueDate
    });

    await invalidateGradebookSnapshots(assignment.courseId);

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
    if (!canManageCourse(course, req.user)) {
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
    await deleteCourseActivityLink(assignment.courseId, id);
    await invalidateGradebookSnapshots(assignment.courseId);

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

module.exports = router;
