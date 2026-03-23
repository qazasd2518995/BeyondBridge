/**
 * 課程報名 (Enrollment)
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');
const { invalidateGradebookSnapshots } = require('../../utils/gradebook-snapshots');

function canManageCourse(course, user) {
  if (!course || !user) return false;
  if (user.isAdmin) return true;
  const ownerIds = new Set([
    course.instructorId,
    course.teacherId,
    course.creatorId,
    course.createdBy
  ].filter(Boolean));
  const inInstructors = Array.isArray(course.instructors) && course.instructors.includes(user.userId);
  return ownerIds.has(user.userId) || inInstructors;
}

// ==================== 課程報名 ====================

/**
 * POST /api/courses/:id/enroll
 * 報名課程
 */
router.post('/:id/enroll', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { enrollmentKey } = req.body;

    // 檢查課程是否存在
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    // 檢查課程是否開放報名
    if (!course.selfEnrollment) {
      return res.status(403).json({
        success: false,
        error: 'ENROLLMENT_CLOSED',
        message: '此課程不開放自行報名'
      });
    }

    // 檢查報名密鑰
    if (course.enrollmentKey && course.enrollmentKey !== enrollmentKey) {
      return res.status(403).json({
        success: false,
        error: 'INVALID_KEY',
        message: '報名密鑰錯誤'
      });
    }

    // 檢查人數上限
    if (course.maxEnrollment && course.enrollmentCount >= course.maxEnrollment) {
      return res.status(403).json({
        success: false,
        error: 'COURSE_FULL',
        message: '課程已額滿'
      });
    }

    // 檢查是否已報名
    const existingProgress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (existingProgress) {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_ENROLLED',
        message: '您已報名此課程'
      });
    }

    // 取得課程章節和活動
    const sections = await db.query(`COURSE#${id}`, { skPrefix: 'SECTION#' });

    // 建立進度記錄
    const now = new Date().toISOString();
    const progressItem = {
      PK: `USER#${userId}`,
      SK: `PROG#COURSE#${id}`,
      entityType: 'COURSE_PROGRESS',
      GSI1PK: `COURSE#${id}`,
      GSI1SK: `ENROLLED#${userId}`,
      createdAt: now,

      userId,
      courseId: id,
      courseTitle: course.title,
      status: 'in_progress',
      progressPercentage: 0,
      completedActivities: [],
      currentSectionId: sections[0]?.sectionId || '01',
      totalTimeSpent: 0,
      lastAccessedAt: now,
      enrolledAt: now,
      completedAt: null,

      // 成績記錄
      grades: [],
      overallGrade: null
    };

    await db.putItem(progressItem);

    // 更新課程報名數
    await db.updateItem(`COURSE#${id}`, 'META', {
      enrollmentCount: (course.enrollmentCount || 0) + 1
    });

    // 記錄活動日誌
    await db.logActivity(userId, 'course_enrolled', 'course', id, {
      courseTitle: course.title
    });

    await invalidateGradebookSnapshots(id);

    res.status(201).json({
      success: true,
      message: '報名成功',
      data: {
        courseId: id,
        courseTitle: course.title,
        enrolledAt: now
      }
    });

  } catch (error) {
    console.error('Enroll course error:', error);
    res.status(500).json({
      success: false,
      error: 'ENROLL_FAILED',
      message: '報名失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/enroll
 * 退選課程
 */
router.delete('/:id/enroll', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 檢查是否已報名
    const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'NOT_ENROLLED',
        message: '您尚未報名此課程'
      });
    }

    // 刪除進度記錄
    await db.deleteItem(`USER#${userId}`, `PROG#COURSE#${id}`);

    // 更新課程報名數
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (course) {
      await db.updateItem(`COURSE#${id}`, 'META', {
        enrollmentCount: Math.max(0, (course.enrollmentCount || 1) - 1)
      });
    }

    await invalidateGradebookSnapshots(id);

    res.json({
      success: true,
      message: '已退選課程'
    });

  } catch (error) {
    console.error('Unenroll course error:', error);
    res.status(500).json({
      success: false,
      error: 'UNENROLL_FAILED',
      message: '退選失敗'
    });
  }
});

/**
 * GET /api/courses/:id/participants
 * 取得課程參與者列表
 */
router.get('/:id/participants', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到此課程'
      });
    }

    const canManage = canManageCourse(course, req.user);
    const enrollment = canManage
      ? null
      : await db.getItem(`USER#${userId}`, `PROG#COURSE#${id}`);

    // 教師可看完整名單；已加入課程的學生可看精簡成員名單
    if (!canManage && !enrollment) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '沒有權限查看參與者列表'
      });
    }

    // 查詢已報名的用戶
    const enrollments = await db.queryByIndex(
      'GSI1',
      `COURSE#${id}`,
      'GSI1PK',
      { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
    );

    // 取得用戶詳情
    const participants = await Promise.all(
      enrollments.map(async (e) => {
        const user = await db.getUser(e.userId);
        if (user) {
          const participant = {
            userId: e.userId,
            displayName: user.displayName,
            role: 'student',
            enrolledAt: e.enrolledAt
          };
          if (canManage) {
            participant.email = user.email;
            participant.lastAccess = e.lastAccessedAt;
            participant.progress = e.progressPercentage;
            participant.status = e.status;
          }
          return participant;
        }
        return null;
      })
    );

    // 加入講師
    const instructor = await db.getUser(course.instructorId) || await db.getAdmin(course.instructorId);
    if (instructor) {
      const instructorParticipant = {
        userId: course.instructorId,
        displayName: instructor.displayName,
        role: 'instructor',
        enrolledAt: course.createdAt
      };
      if (canManage) {
        instructorParticipant.email = instructor.email;
      }
      participants.unshift(instructorParticipant);
    }

    res.json({
      success: true,
      data: participants.filter(Boolean),
      count: participants.filter(Boolean).length
    });

  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得參與者列表失敗'
    });
  }
});

module.exports = router;
