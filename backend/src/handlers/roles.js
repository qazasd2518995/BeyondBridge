/**
 * 角色與權限管理 API
 * BeyondBridge Education Platform
 *
 * Moodle-style capability-based permission management
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware, adminMiddleware } = require('../utils/auth');
const permissions = require('../utils/permissions');

// ============================================================================
// CAPABILITY ENDPOINTS
// ============================================================================

/**
 * GET /api/roles/capabilities
 * 取得所有可用的能力（權限）列表
 */
router.get('/capabilities', authMiddleware, (req, res) => {
  try {
    const capabilities = Object.entries(permissions.CAPABILITIES).map(([key, value]) => ({
      id: key,
      ...value
    }));

    // Group by category
    const grouped = {};
    capabilities.forEach(cap => {
      if (!grouped[cap.category]) {
        grouped[cap.category] = [];
      }
      grouped[cap.category].push(cap);
    });

    res.json({
      success: true,
      data: {
        capabilities,
        grouped,
        total: capabilities.length
      }
    });

  } catch (error) {
    console.error('Get capabilities error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得能力列表失敗'
    });
  }
});

/**
 * GET /api/roles/my-capabilities
 * 取得當前用戶的能力列表
 */
router.get('/my-capabilities', authMiddleware, async (req, res) => {
  try {
    const { courseId, categoryId } = req.query;
    const context = { courseId, categoryId };

    const userCapabilities = await permissions.getUserCapabilities(req.user, context);

    // Get capability details
    const capabilityDetails = userCapabilities.map(capId => ({
      id: capId,
      ...permissions.CAPABILITIES[capId]
    }));

    res.json({
      success: true,
      data: {
        capabilities: capabilityDetails,
        capabilityIds: userCapabilities,
        context
      }
    });

  } catch (error) {
    console.error('Get my capabilities error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得能力列表失敗'
    });
  }
});

/**
 * POST /api/roles/check-capability
 * 檢查用戶是否擁有特定能力
 */
router.post('/check-capability', authMiddleware, async (req, res) => {
  try {
    const { capability, capabilities, mode = 'all', courseId, categoryId } = req.body;
    const context = { courseId, categoryId };

    let hasRequired;
    let checked;

    if (capabilities && Array.isArray(capabilities)) {
      hasRequired = await permissions.hasCapabilities(req.user, capabilities, context, mode);
      checked = capabilities;
    } else if (capability) {
      hasRequired = await permissions.hasCapability(req.user, capability, context);
      checked = [capability];
    } else {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CAPABILITY',
        message: '請提供要檢查的能力'
      });
    }

    res.json({
      success: true,
      data: {
        hasCapability: hasRequired,
        checked,
        mode,
        context
      }
    });

  } catch (error) {
    console.error('Check capability error:', error);
    res.status(500).json({
      success: false,
      error: 'CHECK_FAILED',
      message: '檢查能力失敗'
    });
  }
});

// ============================================================================
// ROLE DEFINITION ENDPOINTS
// ============================================================================

/**
 * GET /api/roles
 * 取得所有角色（系統角色 + 自訂角色）
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Get system roles
    const systemRoles = Object.entries(permissions.DEFAULT_ROLES).map(([key, value]) => ({
      roleId: key,
      ...value,
      capabilities: value.capabilities,
      capabilityCount: value.capabilities.length
    }));

    // Get custom roles
    const customRoles = await permissions.getCustomRolesList();
    const formattedCustomRoles = customRoles.map(role => ({
      ...role,
      capabilityCount: role.capabilities ? role.capabilities.length : 0
    }));

    res.json({
      success: true,
      data: {
        systemRoles,
        customRoles: formattedCustomRoles,
        total: systemRoles.length + formattedCustomRoles.length
      }
    });

  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得角色列表失敗'
    });
  }
});

/**
 * GET /api/roles/:roleId
 * 取得單一角色詳情
 */
router.get('/:roleId', authMiddleware, async (req, res) => {
  try {
    const { roleId } = req.params;

    // Check system roles first
    if (permissions.DEFAULT_ROLES[roleId]) {
      const role = {
        roleId,
        ...permissions.DEFAULT_ROLES[roleId]
      };

      // Add capability details
      role.capabilityDetails = role.capabilities.map(capId => ({
        id: capId,
        ...permissions.CAPABILITIES[capId]
      }));

      return res.json({
        success: true,
        data: role
      });
    }

    // Check custom roles
    const customRole = await db.getItem('ROLES', `ROLE#${roleId}`);
    if (!customRole) {
      return res.status(404).json({
        success: false,
        error: 'ROLE_NOT_FOUND',
        message: '找不到此角色'
      });
    }

    // Add capability details
    customRole.capabilityDetails = (customRole.capabilities || []).map(capId => ({
      id: capId,
      ...permissions.CAPABILITIES[capId]
    }));

    res.json({
      success: true,
      data: customRole
    });

  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得角色詳情失敗'
    });
  }
});

/**
 * POST /api/roles
 * 建立自訂角色（僅管理員）
 */
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { name, nameEn, description, capabilities = [], sortOrder } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_NAME',
        message: '請提供角色名稱'
      });
    }

    const role = await permissions.createCustomRole({
      name,
      nameEn: nameEn || name,
      description,
      capabilities,
      sortOrder,
      createdBy: req.user.userId
    });

    res.status(201).json({
      success: true,
      message: '角色建立成功',
      data: role
    });

  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: '建立角色失敗'
    });
  }
});

/**
 * PUT /api/roles/:roleId
 * 更新自訂角色（僅管理員）
 */
router.put('/:roleId', adminMiddleware, async (req, res) => {
  try {
    const { roleId } = req.params;
    const { name, nameEn, description, capabilities, sortOrder } = req.body;

    // Check if it's a system role
    if (permissions.DEFAULT_ROLES[roleId]) {
      return res.status(403).json({
        success: false,
        error: 'SYSTEM_ROLE',
        message: '無法修改系統角色'
      });
    }

    const updates = {};
    if (name) updates.name = name;
    if (nameEn) updates.nameEn = nameEn;
    if (description !== undefined) updates.description = description;
    if (capabilities) updates.capabilities = capabilities;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const updatedRole = await permissions.updateCustomRole(roleId, updates);

    res.json({
      success: true,
      message: '角色更新成功',
      data: updatedRole
    });

  } catch (error) {
    console.error('Update role error:', error);
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        error: 'ROLE_NOT_FOUND',
        message: '找不到此角色'
      });
    }
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: '更新角色失敗'
    });
  }
});

/**
 * DELETE /api/roles/:roleId
 * 刪除自訂角色（僅管理員）
 */
router.delete('/:roleId', adminMiddleware, async (req, res) => {
  try {
    const { roleId } = req.params;

    // Check if it's a system role
    if (permissions.DEFAULT_ROLES[roleId]) {
      return res.status(403).json({
        success: false,
        error: 'SYSTEM_ROLE',
        message: '無法刪除系統角色'
      });
    }

    await permissions.deleteCustomRole(roleId);

    res.json({
      success: true,
      message: '角色刪除成功'
    });

  } catch (error) {
    console.error('Delete role error:', error);
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        error: 'ROLE_NOT_FOUND',
        message: '找不到此角色'
      });
    }
    if (error.message.includes('active assignments')) {
      return res.status(409).json({
        success: false,
        error: 'ROLE_IN_USE',
        message: '此角色仍有使用者，無法刪除'
      });
    }
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: '刪除角色失敗'
    });
  }
});

// ============================================================================
// ROLE ASSIGNMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/roles/assignments/user/:userId
 * 取得用戶的角色指派
 */
router.get('/assignments/user/:userId', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Get all role assignments for user
    const assignments = await db.query({
      pk: `USER#${userId}`,
      sk: { begins_with: 'ROLE_ASSIGNMENT#' }
    });

    // Enrich with role details
    const enrichedAssignments = await Promise.all(assignments.map(async (assignment) => {
      let roleName, roleNameEn;

      if (permissions.DEFAULT_ROLES[assignment.roleId]) {
        roleName = permissions.DEFAULT_ROLES[assignment.roleId].name;
        roleNameEn = permissions.DEFAULT_ROLES[assignment.roleId].nameEn;
      } else {
        const customRole = await db.getItem('ROLES', `ROLE#${assignment.roleId}`);
        if (customRole) {
          roleName = customRole.name;
          roleNameEn = customRole.nameEn;
        }
      }

      return {
        ...assignment,
        roleName,
        roleNameEn
      };
    }));

    res.json({
      success: true,
      data: {
        userId,
        assignments: enrichedAssignments,
        total: enrichedAssignments.length
      }
    });

  } catch (error) {
    console.error('Get user assignments error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得角色指派失敗'
    });
  }
});

/**
 * POST /api/roles/assignments
 * 指派角色給用戶（僅管理員）
 */
router.post('/assignments', adminMiddleware, async (req, res) => {
  try {
    const { userId, roleId, courseId, categoryId, expiresAt } = req.body;

    if (!userId || !roleId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: '請提供用戶 ID 和角色 ID'
      });
    }

    // Verify user exists
    const user = await db.getUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '找不到此用戶'
      });
    }

    // Verify role exists
    const isSystemRole = !!permissions.DEFAULT_ROLES[roleId];
    if (!isSystemRole) {
      const customRole = await db.getItem('ROLES', `ROLE#${roleId}`);
      if (!customRole) {
        return res.status(404).json({
          success: false,
          error: 'ROLE_NOT_FOUND',
          message: '找不到此角色'
        });
      }
    }

    const assignment = await permissions.assignRole(userId, roleId, {
      courseId,
      categoryId,
      expiresAt,
      assignedBy: req.user.userId
    });

    res.status(201).json({
      success: true,
      message: '角色指派成功',
      data: assignment
    });

  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({
      success: false,
      error: 'ASSIGN_FAILED',
      message: '指派角色失敗'
    });
  }
});

/**
 * DELETE /api/roles/assignments/:assignmentId
 * 移除角色指派（僅管理員）
 */
router.delete('/assignments/:assignmentId', adminMiddleware, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USER_ID',
        message: '請提供用戶 ID'
      });
    }

    await permissions.removeRoleAssignment(userId, assignmentId);

    res.json({
      success: true,
      message: '角色指派已移除'
    });

  } catch (error) {
    console.error('Remove role assignment error:', error);
    if (error.message === 'Role assignment not found') {
      return res.status(404).json({
        success: false,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: '找不到此角色指派'
      });
    }
    res.status(500).json({
      success: false,
      error: 'REMOVE_FAILED',
      message: '移除角色指派失敗'
    });
  }
});

// ============================================================================
// COURSE ROLE ENDPOINTS
// ============================================================================

/**
 * GET /api/roles/course/:courseId
 * 取得課程的角色分配
 */
router.get('/course/:courseId', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;

    // Check if user has permission to view course roles
    const hasPermission = await permissions.hasCapability(
      req.user,
      'enrol:view_enrolled',
      { courseId }
    );

    if (!hasPermission && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '權限不足'
      });
    }

    // Get all enrollments with roles
    const enrollments = await db.query({
      pk: `COURSE#${courseId}`,
      sk: { begins_with: 'ENROLLMENT#' }
    });

    // Get course info
    const course = await db.getItem(`COURSE#${courseId}`, 'META');

    // Format response
    const roleAssignments = enrollments.map(enrol => ({
      userId: enrol.userId,
      userName: enrol.userName,
      userEmail: enrol.userEmail,
      courseRole: enrol.courseRole || 'student',
      enrolledAt: enrol.enrolledAt,
      progress: enrol.progress || 0
    }));

    // Group by role
    const byRole = {
      teacher: roleAssignments.filter(r => r.courseRole === 'teacher'),
      assistant: roleAssignments.filter(r => r.courseRole === 'assistant'),
      student: roleAssignments.filter(r => r.courseRole === 'student'),
      other: roleAssignments.filter(r => !['teacher', 'assistant', 'student'].includes(r.courseRole))
    };

    res.json({
      success: true,
      data: {
        courseId,
        courseName: course?.name,
        instructorId: course?.instructorId,
        assignments: roleAssignments,
        byRole,
        total: roleAssignments.length
      }
    });

  } catch (error) {
    console.error('Get course roles error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: '取得課程角色失敗'
    });
  }
});

/**
 * PUT /api/roles/course/:courseId/user/:userId
 * 設定用戶在課程中的角色
 */
router.put('/course/:courseId/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { courseId, userId } = req.params;
    const { role } = req.body;

    // Check if user has permission
    const canManage = await permissions.hasCapability(
      req.user,
      'enrol:enrol_students',
      { courseId }
    );

    if (!canManage && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '權限不足'
      });
    }

    // Validate role
    const validRoles = ['teacher', 'assistant', 'student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ROLE',
        message: '無效的角色，可用選項：teacher, assistant, student'
      });
    }

    await permissions.setCourseRole(courseId, userId, role);

    res.json({
      success: true,
      message: '課程角色設定成功',
      data: {
        courseId,
        userId,
        role
      }
    });

  } catch (error) {
    console.error('Set course role error:', error);
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '找不到此用戶'
      });
    }
    res.status(500).json({
      success: false,
      error: 'SET_ROLE_FAILED',
      message: '設定課程角色失敗'
    });
  }
});

/**
 * POST /api/roles/course/:courseId/bulk
 * 批量設定課程角色
 */
router.post('/course/:courseId/bulk', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { assignments } = req.body; // [{ userId, role }]

    // Check permission
    const canManage = await permissions.hasCapability(
      req.user,
      'enrol:enrol_students',
      { courseId }
    );

    if (!canManage && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '權限不足'
      });
    }

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ASSIGNMENTS',
        message: '請提供角色分配陣列'
      });
    }

    const results = [];
    const errors = [];

    for (const assignment of assignments) {
      try {
        const { userId, role } = assignment;

        if (!userId || !role) {
          errors.push({ userId, error: '缺少必要欄位' });
          continue;
        }

        const validRoles = ['teacher', 'assistant', 'student'];
        if (!validRoles.includes(role)) {
          errors.push({ userId, error: '無效的角色' });
          continue;
        }

        await permissions.setCourseRole(courseId, userId, role);
        results.push({ userId, role, success: true });
      } catch (err) {
        errors.push({ userId: assignment.userId, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `成功設定 ${results.length} 個角色`,
      data: {
        successful: results,
        failed: errors,
        total: assignments.length,
        successCount: results.length,
        failCount: errors.length
      }
    });

  } catch (error) {
    console.error('Bulk set course roles error:', error);
    res.status(500).json({
      success: false,
      error: 'BULK_SET_FAILED',
      message: '批量設定角色失敗'
    });
  }
});

module.exports = router;
