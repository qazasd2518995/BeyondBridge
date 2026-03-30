/**
 * 群組管理系統 (Moodle Group Mode)
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../../utils/db');
const { authMiddleware } = require('../../utils/auth');

/**
 * 群組模式常量
 * 0: NOGROUPS - 無群組模式
 * 1: SEPARATEGROUPS - 分開群組（學生只能看到自己群組的成員和活動）
 * 2: VISIBLEGROUPS - 可見群組（學生可以看到其他群組但只能在自己群組中互動）
 */
const GROUP_MODES = {
  NOGROUPS: 0,
  SEPARATEGROUPS: 1,
  VISIBLEGROUPS: 2
};

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

async function getCourseStudentEnrollments(courseId) {
  const enrollments = await db.queryByIndex(
    'GSI1',
    `COURSE#${courseId}`,
    'GSI1PK',
    { skPrefix: 'ENROLLED#', skName: 'GSI1SK' }
  );

  const deduped = new Map();
  enrollments.forEach((enrollment) => {
    if (!enrollment?.userId) return;
    deduped.set(enrollment.userId, {
      ...enrollment,
      role: enrollment.role || 'student'
    });
  });

  return Array.from(deduped.values());
}

async function isUserEnrolledInCourse(courseId, userId) {
  if (!courseId || !userId) return false;
  const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${courseId}`);
  return !!progress;
}

/**
 * GET /api/courses/:id/groups
 * 取得課程的所有群組
 */
router.get('/:id/groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得課程資料
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 取得所有群組
    let groups = await db.query(`COURSE#${id}`, { skPrefix: 'GROUP#' });

    // 如果是分開群組模式，且用戶不是講師/管理員，只顯示自己的群組
    if (course.groupMode === GROUP_MODES.SEPARATEGROUPS &&
        !canManageCourse(course, req.user)) {
      // 取得用戶所屬的群組
      const userGroups = await db.query(`USER#${userId}`, { skPrefix: `COURSEGROUP#${id}#` });
      const userGroupIds = userGroups.map(g => g.groupId);
      groups = groups.filter(g => userGroupIds.includes(g.groupId));
    }

    // 為每個群組取得成員數量
    for (let group of groups) {
      const members = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${group.groupId}#` });
      group.memberCount = members.length;
    }

    res.json({
      success: true,
      data: groups,
      groupMode: course.groupMode || GROUP_MODES.NOGROUPS,
      groupModeForced: course.groupModeForced || false
    });

  } catch (error) {
    console.error('Get course groups error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得群組失敗'
    });
  }
});

/**
 * POST /api/courses/:id/groups
 * 建立新群組
 */
router.post('/:id/groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, idNumber } = req.body;
    const userId = req.user.userId;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_NAME',
        message: '請提供群組名稱'
      });
    }

    // 驗證課程存在且用戶有權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限建立群組'
      });
    }

    const groupId = db.generateId('grp');
    const now = new Date().toISOString();

    const group = {
      PK: `COURSE#${id}`,
      SK: `GROUP#${groupId}`,
      GSI1PK: `GROUPS#${id}`,
      GSI1SK: `GROUP#${groupId}`,
      entityType: 'COURSE_GROUP',
      createdAt: now,

      groupId,
      courseId: id,
      name,
      description: description || '',
      idNumber: idNumber || '', // 外部識別碼（如學校班級代碼）

      memberCount: 0,
      createdBy: userId,
      updatedAt: now
    };

    await db.putItem(group);

    res.status(201).json({
      success: true,
      message: '群組已建立',
      data: group
    });

  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立群組失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/groups/:groupId
 * 更新群組資訊
 */
router.put('/:id/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const { name, description, idNumber } = req.body;
    const userId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限修改群組'
      });
    }

    // 驗證群組存在
    const group = await db.getItem(`COURSE#${id}`, `GROUP#${groupId}`);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'GROUP_NOT_FOUND',
        message: '找不到群組'
      });
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (idNumber !== undefined) updates.idNumber = idNumber;

    const updatedGroup = await db.updateItem(`COURSE#${id}`, `GROUP#${groupId}`, updates);

    res.json({
      success: true,
      message: '群組已更新',
      data: updatedGroup
    });

  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新群組失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/groups/:groupId
 * 刪除群組
 */
router.delete('/:id/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const userId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限刪除群組'
      });
    }

    // 刪除群組成員關係
    const members = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${groupId}#` });
    for (const member of members) {
      await db.deleteItem(`COURSE#${id}`, member.SK);
      // 刪除用戶端的反向關係
      await db.deleteItem(`USER#${member.userId}`, `COURSEGROUP#${id}#${groupId}`);
    }

    // 刪除群組
    await db.deleteItem(`COURSE#${id}`, `GROUP#${groupId}`);

    res.json({
      success: true,
      message: '群組已刪除'
    });

  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除群組失敗'
    });
  }
});

/**
 * GET /api/courses/:id/groups/:groupId/members
 * 取得群組成員
 */
router.get('/:id/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const userId = req.user.userId;

    // 取得課程資料
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    // 如果是分開群組模式，檢查用戶是否在該群組內
    if (course.groupMode === GROUP_MODES.SEPARATEGROUPS &&
        !canManageCourse(course, req.user)) {
      const userMembership = await db.getItem(`USER#${userId}`, `COURSEGROUP#${id}#${groupId}`);
      if (!userMembership) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: '無權限查看此群組成員'
        });
      }
    }

    // 取得群組成員
    const memberRecords = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${groupId}#` });

    // 取得用戶詳細資訊
    const members = await Promise.all(
      memberRecords.map(async (m) => {
        const user = await db.getUser(m.userId);
        return {
          userId: m.userId,
          displayName: user?.displayName || 'Unknown',
          email: user?.email || '',
          avatar: user?.avatar || '',
          role: m.role || 'student',
          joinedAt: m.joinedAt
        };
      })
    );

    res.json({
      success: true,
      data: members
    });

  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得群組成員失敗'
    });
  }
});

/**
 * POST /api/courses/:id/groups/:groupId/members
 * 添加成員到群組
 */
router.post('/:id/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const { userIds } = req.body; // 支援批量添加
    const adminUserId = req.user.userId;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USERS',
        message: '請提供要添加的用戶'
      });
    }

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限管理群組成員'
      });
    }

    // 驗證群組存在
    const group = await db.getItem(`COURSE#${id}`, `GROUP#${groupId}`);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'GROUP_NOT_FOUND',
        message: '找不到群組'
      });
    }

    const now = new Date().toISOString();
    const added = [];
    const skipped = [];

    for (const userId of userIds) {
      // 檢查用戶是否已在群組中
      const existing = await db.getItem(`COURSE#${id}`, `GROUPMEMBER#${groupId}#${userId}`);
      if (existing) {
        skipped.push(userId);
        continue;
      }

      // 檢查用戶是否報名課程
      const isEnrolled = await isUserEnrolledInCourse(id, userId);
      if (!isEnrolled) {
        skipped.push(userId);
        continue;
      }

      // 建立群組成員關係
      const memberItem = {
        PK: `COURSE#${id}`,
        SK: `GROUPMEMBER#${groupId}#${userId}`,
        entityType: 'GROUP_MEMBER',
        createdAt: now,

        courseId: id,
        groupId,
        userId,
        role: 'student',
        joinedAt: now
      };

      await db.putItem(memberItem);

      // 在用戶端建立反向關係
      const userGroupItem = {
        PK: `USER#${userId}`,
        SK: `COURSEGROUP#${id}#${groupId}`,
        entityType: 'USER_GROUP',
        createdAt: now,

        userId,
        courseId: id,
        groupId,
        groupName: group.name,
        joinedAt: now
      };

      await db.putItem(userGroupItem);
      added.push(userId);
    }

    // 更新群組成員數
    const currentMembers = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${groupId}#` });
    await db.updateItem(`COURSE#${id}`, `GROUP#${groupId}`, {
      memberCount: currentMembers.length,
      updatedAt: now
    });

    res.json({
      success: true,
      message: `已添加 ${added.length} 位成員`,
      data: { added, skipped }
    });

  } catch (error) {
    console.error('Add group members error:', error);
    res.status(500).json({
      success: false,
      error: 'ADD_FAILED',
      message: '添加成員失敗'
    });
  }
});

/**
 * DELETE /api/courses/:id/groups/:groupId/members/:userId
 * 從群組移除成員
 */
router.delete('/:id/groups/:groupId/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { id, groupId, userId } = req.params;
    const adminUserId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限管理群組成員'
      });
    }

    // 刪除成員關係
    await db.deleteItem(`COURSE#${id}`, `GROUPMEMBER#${groupId}#${userId}`);
    await db.deleteItem(`USER#${userId}`, `COURSEGROUP#${id}#${groupId}`);

    // 更新群組成員數
    const currentMembers = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${groupId}#` });
    await db.updateItem(`COURSE#${id}`, `GROUP#${groupId}`, {
      memberCount: currentMembers.length,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '成員已移除'
    });

  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({
      success: false,
      error: 'REMOVE_FAILED',
      message: '移除成員失敗'
    });
  }
});

/**
 * PUT /api/courses/:id/group-settings
 * 更新課程的群組模式設定
 */
router.put('/:id/group-settings', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupMode, groupModeForced, defaultGroupingId } = req.body;
    const userId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限修改群組設定'
      });
    }

    const updates = { updatedAt: new Date().toISOString() };

    if (groupMode !== undefined) {
      // 驗證群組模式值
      if (![0, 1, 2].includes(groupMode)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_GROUP_MODE',
          message: '無效的群組模式值'
        });
      }
      updates.groupMode = groupMode;
    }

    if (groupModeForced !== undefined) {
      updates.groupModeForced = !!groupModeForced;
    }

    if (defaultGroupingId !== undefined) {
      updates.defaultGroupingId = defaultGroupingId;
    }

    const updatedCourse = await db.updateItem(`COURSE#${id}`, 'META', updates);

    res.json({
      success: true,
      message: '群組設定已更新',
      data: {
        groupMode: updatedCourse.groupMode,
        groupModeForced: updatedCourse.groupModeForced,
        defaultGroupingId: updatedCourse.defaultGroupingId
      }
    });

  } catch (error) {
    console.error('Update group settings error:', error);
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新群組設定失敗'
    });
  }
});

/**
 * GET /api/courses/:id/my-groups
 * 取得當前用戶在課程中所屬的群組
 */
router.get('/:id/my-groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 取得用戶所屬的群組
    const userGroups = await db.query(`USER#${userId}`, { skPrefix: `COURSEGROUP#${id}#` });

    // 取得群組詳細資訊
    const groups = await Promise.all(
      userGroups.map(async (ug) => {
        const group = await db.getItem(`COURSE#${id}`, `GROUP#${ug.groupId}`);
        return group ? {
          groupId: group.groupId,
          name: group.name,
          description: group.description,
          memberCount: group.memberCount,
          joinedAt: ug.joinedAt
        } : null;
      })
    );

    res.json({
      success: true,
      data: groups.filter(Boolean)
    });

  } catch (error) {
    console.error('Get my groups error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得群組失敗'
    });
  }
});

/**
 * POST /api/courses/:id/auto-create-groups
 * 自動建立群組（根據報名學生數量均分）
 */
router.post('/:id/auto-create-groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupCount, groupNamePrefix = '群組' } = req.body;
    const userId = req.user.userId;

    if (!groupCount || groupCount < 2) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_COUNT',
        message: '群組數量必須至少為 2'
      });
    }

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限建立群組'
      });
    }

    // 取得所有報名學生
    const students = await getCourseStudentEnrollments(id);

    if (students.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_STUDENTS',
        message: '課程沒有報名學生'
      });
    }

    const now = new Date().toISOString();
    const createdGroups = [];

    // 隨機打亂學生順序
    const shuffledStudents = [...students].sort(() => Math.random() - 0.5);

    // 建立群組並分配學生
    for (let i = 0; i < groupCount; i++) {
      const groupId = db.generateId('grp');
      const groupName = `${groupNamePrefix} ${i + 1}`;

      const group = {
        PK: `COURSE#${id}`,
        SK: `GROUP#${groupId}`,
        GSI1PK: `GROUPS#${id}`,
        GSI1SK: `GROUP#${groupId}`,
        entityType: 'COURSE_GROUP',
        createdAt: now,

        groupId,
        courseId: id,
        name: groupName,
        description: '',
        idNumber: '',

        memberCount: 0,
        createdBy: userId,
        updatedAt: now
      };

      await db.putItem(group);
      createdGroups.push({ groupId, name: groupName, members: [] });
    }

    // 分配學生到群組
    for (let i = 0; i < shuffledStudents.length; i++) {
      const groupIndex = i % groupCount;
      const group = createdGroups[groupIndex];
      const student = shuffledStudents[i];

      // 建立群組成員關係
      const memberItem = {
        PK: `COURSE#${id}`,
        SK: `GROUPMEMBER#${group.groupId}#${student.userId}`,
        entityType: 'GROUP_MEMBER',
        createdAt: now,

        courseId: id,
        groupId: group.groupId,
        userId: student.userId,
        role: 'student',
        joinedAt: now
      };

      await db.putItem(memberItem);

      // 在用戶端建立反向關係
      const userGroupItem = {
        PK: `USER#${student.userId}`,
        SK: `COURSEGROUP#${id}#${group.groupId}`,
        entityType: 'USER_GROUP',
        createdAt: now,

        userId: student.userId,
        courseId: id,
        groupId: group.groupId,
        groupName: group.name,
        joinedAt: now
      };

      await db.putItem(userGroupItem);
      group.members.push(student.userId);
    }

    // 更新各群組成員數
    for (const group of createdGroups) {
      await db.updateItem(`COURSE#${id}`, `GROUP#${group.groupId}`, {
        memberCount: group.members.length,
        updatedAt: now
      });
    }

    res.status(201).json({
      success: true,
      message: `已建立 ${groupCount} 個群組並分配 ${students.length} 位學生`,
      data: createdGroups.map(g => ({
        groupId: g.groupId,
        name: g.name,
        memberCount: g.members.length
      }))
    });

  } catch (error) {
    console.error('Auto create groups error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '自動建立群組失敗'
    });
  }
});

/**
 * GET /api/courses/:id/group-overview
 * 取得課程群組總覽（供教師使用）
 */
router.get('/:id/group-overview', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 驗證課程權限
    const course = await db.getItem(`COURSE#${id}`, 'META');
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'COURSE_NOT_FOUND',
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '無權限查看群組總覽'
      });
    }

    // 取得所有群組
    const groups = await db.query(`COURSE#${id}`, { skPrefix: 'GROUP#' });

    // 取得所有報名學生
    const enrollments = await getCourseStudentEnrollments(id);
    const totalStudents = enrollments.length;

    // 統計未分組學生
    const groupedStudentIds = new Set();
    for (const group of groups) {
      const members = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${group.groupId}#` });
      members.forEach(m => groupedStudentIds.add(m.userId));
    }

    const ungroupedStudents = enrollments.filter(e => !groupedStudentIds.has(e.userId));

    // 取得每個群組的詳細成員
    const groupsWithMembers = await Promise.all(
      groups.map(async (group) => {
        const members = await db.query(`COURSE#${id}`, { skPrefix: `GROUPMEMBER#${group.groupId}#` });
        const memberDetails = await Promise.all(
          members.map(async (m) => {
            const user = await db.getUser(m.userId);
            return {
              userId: m.userId,
              displayName: user?.displayName || 'Unknown',
              email: user?.email || '',
              joinedAt: m.joinedAt
            };
          })
        );

        return {
          ...group,
          members: memberDetails
        };
      })
    );

    res.json({
      success: true,
      data: {
        courseId: id,
        groupMode: course.groupMode || GROUP_MODES.NOGROUPS,
        groupModeForced: course.groupModeForced || false,
        totalStudents,
        totalGroups: groups.length,
        groupedStudents: groupedStudentIds.size,
        ungroupedStudents: ungroupedStudents.length,
        groups: groupsWithMembers,
        ungrouped: await Promise.all(
          ungroupedStudents.map(async (e) => {
            const user = await db.getUser(e.userId);
            return {
              userId: e.userId,
              displayName: user?.displayName || 'Unknown',
              email: user?.email || ''
            };
          })
        )
      }
    });

  } catch (error) {
    console.error('Get group overview error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得群組總覽失敗'
    });
  }
});

module.exports = router;
