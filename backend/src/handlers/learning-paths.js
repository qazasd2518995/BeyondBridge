/**
 * 學習路徑 API
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

const TEACHING_ROLES = new Set([
  'manager',
  'coursecreator',
  'educator',
  'trainer',
  'creator',
  'teacher',
  'assistant'
]);

function isTeachingUser(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return TEACHING_ROLES.has(user.role);
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function getPathById(pathId) {
  const direct = await db.getItem(`LEARNING_PATH#${pathId}`, 'META');
  if (direct && direct.entityType === 'LEARNING_PATH' && direct.status !== 'deleted') return direct;

  const fallback = await db.scan({
    filter: {
      expression: 'entityType = :type AND pathId = :pid AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'LEARNING_PATH', ':pid': pathId, ':deleted': 'deleted' },
      names: { '#status': 'status' }
    }
  });

  return fallback[0] || null;
}

async function getAllPaths() {
  return db.scan({
    filter: {
      expression: 'entityType = :type AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'LEARNING_PATH', ':deleted': 'deleted' },
      names: { '#status': 'status' }
    }
  });
}

async function getEnrollment(pathId, userId) {
  return db.getItem(`LEARNING_PATH#${pathId}`, `ENROLL#${userId}`);
}

async function getCourseTitle(courseId) {
  const course = await db.getItem(`COURSE#${courseId}`, 'META');
  return course?.title || course?.name || '';
}

async function normalizeCourseEntries(courses = [], courseIds = []) {
  if (Array.isArray(courses) && courses.length > 0) {
    const list = [];
    for (let idx = 0; idx < courses.length; idx += 1) {
      const course = courses[idx];
      const courseId = course.courseId || course.id;
      if (!courseId) continue;
      list.push({
        courseId,
        title: course.title || await getCourseTitle(courseId),
        description: course.description || '',
        order: parseInteger(course.order, idx + 1, { min: 1 }),
        required: course.required !== false,
        estimatedHours: parseInteger(course.estimatedHours, 0, { min: 0 }),
        prerequisites: Array.isArray(course.prerequisites) ? course.prerequisites : []
      });
    }
    return list.sort((a, b) => a.order - b.order);
  }

  if (Array.isArray(courseIds) && courseIds.length > 0) {
    const list = [];
    for (let idx = 0; idx < courseIds.length; idx += 1) {
      const courseId = courseIds[idx];
      list.push({
        courseId,
        title: await getCourseTitle(courseId),
        description: '',
        order: idx + 1,
        required: true,
        estimatedHours: 0,
        prerequisites: idx > 0 ? [courseIds[idx - 1]] : []
      });
    }
    return list;
  }

  return [];
}

function calculateProgress(path, enrollment) {
  if (!path || !enrollment) return 0;

  const courses = Array.isArray(path.courses) ? path.courses : [];
  const requiredCourses = courses.filter(c => c.required !== false);
  const baseCourses = requiredCourses.length > 0 ? requiredCourses : courses;
  const total = baseCourses.length;
  if (total === 0) return 0;

  const completedSet = new Set(enrollment.completedCourses || []);
  const completed = baseCourses.filter(c => completedSet.has(c.courseId)).length;
  const computed = (completed / total) * 100;

  if (enrollment.progress !== undefined && enrollment.progress !== null) {
    return Math.max(0, Math.min(100, parseInteger(enrollment.progress, Math.round(computed), { min: 0, max: 100 })));
  }
  return Math.round(computed);
}

function normalizePath(path, enrollment = null) {
  const pathId = path.pathId || path.id;
  const courses = Array.isArray(path.courses) ? [...path.courses].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
  const progress = enrollment ? calculateProgress(path, enrollment) : null;

  const normalizedCourses = courses.map(course => ({
    courseId: course.courseId || course.id,
    title: course.title || '',
    description: course.description || '',
    order: course.order || 0,
    required: course.required !== false,
    estimatedHours: parseInteger(course.estimatedHours, 0, { min: 0 }),
    completed: enrollment ? (enrollment.completedCourses || []).includes(course.courseId || course.id) : false,
    prerequisites: Array.isArray(course.prerequisites) ? course.prerequisites : []
  }));

  return {
    id: pathId,
    pathId,
    name: path.name || path.title || '',
    description: path.description || '',
    thumbnail: path.thumbnail || '',
    courses: normalizedCourses,
    totalCourses: path.totalCourses || normalizedCourses.length,
    duration: path.duration || (path.estimatedDuration ? `${path.estimatedDuration}h` : ''),
    estimatedDuration: parseInteger(path.estimatedDuration, 0, { min: 0 }),
    difficulty: path.difficulty || 'beginner',
    prerequisites: Array.isArray(path.prerequisites) ? path.prerequisites : [],
    enrolledCount: parseInteger(path.enrolledCount, 0, { min: 0 }),
    completedCount: parseInteger(path.completedCount, 0, { min: 0 }),
    userEnrolled: !!enrollment,
    userProgress: progress,
    progress,
    badges: Array.isArray(path.badges) ? path.badges : [],
    status: path.status || 'active',
    createdBy: path.createdBy || null,
    createdAt: path.createdAt || null,
    updatedAt: path.updatedAt || null
  };
}

async function refreshPathStats(pathId) {
  const path = await getPathById(pathId);
  if (!path) return;

  const enrollments = await db.query(`LEARNING_PATH#${pathId}`, { skPrefix: 'ENROLL#' });
  const activeEnrollments = enrollments.filter(e => e.entityType === 'LEARNING_PATH_ENROLLMENT' && e.status !== 'withdrawn');
  const completedCount = activeEnrollments.filter(e => e.status === 'completed' || calculateProgress(path, e) >= 100).length;

  await db.updateItem(path.PK, path.SK, {
    enrolledCount: activeEnrollments.length,
    completedCount,
    updatedAt: new Date().toISOString()
  });
}

async function evaluatePrerequisites(userId, requirements = []) {
  const normalized = [];

  for (const requirement of requirements) {
    let met = false;
    let details = '';

    if (requirement.type === 'course_completion' && requirement.courseId) {
      const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${requirement.courseId}`);
      met = !!progress && ((progress.status === 'completed') || (progress.progressPercentage || 0) >= 100);
      details = met ? '已完成課程' : '尚未完成課程';
    } else if (requirement.type === 'grade_threshold' && requirement.courseId) {
      const minGrade = parseInteger(requirement.minGrade, 60, { min: 0, max: 100 });
      const progress = await db.getItem(`USER#${userId}`, `PROG#COURSE#${requirement.courseId}`);
      const grade = parseInteger(progress?.overallGrade, 0, { min: 0, max: 100 });
      met = !!progress && grade >= minGrade;
      details = met ? `成績達標 (${grade})` : `需要 ${minGrade} 分，目前 ${grade} 分`;
    } else if (requirement.type === 'learning_path_completion' && requirement.pathId) {
      const enroll = await getEnrollment(requirement.pathId, userId);
      met = !!enroll && (enroll.status === 'completed' || parseInteger(enroll.progress, 0, { min: 0, max: 100 }) >= 100);
      details = met ? '已完成學習路徑' : '尚未完成學習路徑';
    } else if (requirement.type === 'manual') {
      met = !!requirement.met;
      details = met ? '手動確認通過' : '尚未人工確認';
    } else {
      met = false;
      details = '不支援的先決條件類型';
    }

    normalized.push({
      ...requirement,
      met,
      details
    });
  }

  const allMet = normalized.every(req => req.met);
  return { requirements: normalized, allMet, canEnroll: allMet };
}

// ============================================================================
// 學習路徑管理
// ============================================================================

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const paths = await getAllPaths();
    const userPathLinks = await db.query(`USER#${userId}`, { skPrefix: 'LEARNING_PATH#' });
    const enrolledPathIds = new Set(userPathLinks.filter(link => link.entityType === 'USER_LEARNING_PATH').map(link => link.pathId));

    const data = [];
    for (const path of paths) {
      const enrollment = enrolledPathIds.has(path.pathId) ? await getEnrollment(path.pathId, userId) : null;
      data.push(normalizePath(path, enrollment));
    }

    data.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get learning paths error:', error);
    res.status(500).json({
      success: false,
      message: '取得學習路徑失敗'
    });
  }
});

router.get('/:pathId', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const userId = req.user.userId;

    const path = await getPathById(pathId);
    if (!path) {
      return res.status(404).json({
        success: false,
        message: '找不到學習路徑'
      });
    }

    const enrollment = await getEnrollment(pathId, userId);
    res.json({
      success: true,
      data: normalizePath(path, enrollment || null)
    });
  } catch (error) {
    console.error('Get learning path error:', error);
    res.status(500).json({
      success: false,
      message: '取得學習路徑詳情失敗'
    });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可建立學習路徑'
      });
    }

    const {
      name,
      description,
      courses,
      courseIds,
      difficulty,
      estimatedDuration,
      duration,
      prerequisites,
      thumbnail,
      status
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: '請提供學習路徑名稱'
      });
    }

    const courseEntries = await normalizeCourseEntries(courses, courseIds);
    const pathId = db.generateId('path');
    const now = new Date().toISOString();

    const path = {
      PK: `LEARNING_PATH#${pathId}`,
      SK: 'META',
      entityType: 'LEARNING_PATH',
      pathId,
      name: String(name).trim(),
      description: description || '',
      thumbnail: thumbnail || '',
      courses: courseEntries,
      totalCourses: courseEntries.length,
      duration: duration || '',
      estimatedDuration: parseInteger(estimatedDuration, 0, { min: 0 }),
      difficulty: difficulty || 'beginner',
      prerequisites: Array.isArray(prerequisites) ? prerequisites : [],
      badges: [],
      enrolledCount: 0,
      completedCount: 0,
      status: status || 'active',
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(path);

    res.status(201).json({
      success: true,
      data: normalizePath(path),
      message: '學習路徑建立成功'
    });
  } catch (error) {
    console.error('Create learning path error:', error);
    res.status(500).json({
      success: false,
      message: '建立學習路徑失敗'
    });
  }
});

router.put('/:pathId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可更新學習路徑'
      });
    }

    const { pathId } = req.params;
    const path = await getPathById(pathId);
    if (!path) {
      return res.status(404).json({
        success: false,
        message: '找不到學習路徑'
      });
    }

    if (!req.user.isAdmin && path.createdBy && path.createdBy !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: '無權限更新此學習路徑'
      });
    }

    const updates = {
      updatedAt: new Date().toISOString()
    };

    if (req.body.name !== undefined) updates.name = String(req.body.name || '').trim();
    if (req.body.description !== undefined) updates.description = String(req.body.description || '');
    if (req.body.thumbnail !== undefined) updates.thumbnail = req.body.thumbnail || '';
    if (req.body.difficulty !== undefined) updates.difficulty = req.body.difficulty || 'beginner';
    if (req.body.estimatedDuration !== undefined) updates.estimatedDuration = parseInteger(req.body.estimatedDuration, 0, { min: 0 });
    if (req.body.duration !== undefined) updates.duration = req.body.duration || '';
    if (req.body.prerequisites !== undefined) updates.prerequisites = Array.isArray(req.body.prerequisites) ? req.body.prerequisites : [];
    if (req.body.status !== undefined) updates.status = req.body.status || 'active';

    if (req.body.courses !== undefined || req.body.courseIds !== undefined) {
      const courseEntries = await normalizeCourseEntries(req.body.courses, req.body.courseIds);
      updates.courses = courseEntries;
      updates.totalCourses = courseEntries.length;
    }

    const updated = await db.updateItem(path.PK, path.SK, updates);

    res.json({
      success: true,
      data: normalizePath(updated),
      message: '學習路徑更新成功'
    });
  } catch (error) {
    console.error('Update learning path error:', error);
    res.status(500).json({
      success: false,
      message: '更新學習路徑失敗'
    });
  }
});

router.delete('/:pathId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可刪除學習路徑'
      });
    }

    const { pathId } = req.params;
    const path = await getPathById(pathId);
    if (!path) {
      return res.status(404).json({
        success: false,
        message: '找不到學習路徑'
      });
    }

    if (!req.user.isAdmin && path.createdBy && path.createdBy !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: '無權限刪除此學習路徑'
      });
    }

    await db.updateItem(path.PK, path.SK, {
      status: 'deleted',
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '學習路徑刪除成功'
    });
  } catch (error) {
    console.error('Delete learning path error:', error);
    res.status(500).json({
      success: false,
      message: '刪除學習路徑失敗'
    });
  }
});

// ============================================================================
// 學習路徑報名
// ============================================================================

router.post('/:pathId/enroll', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const userId = req.user.userId;

    const path = await getPathById(pathId);
    if (!path || path.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: '找不到學習路徑'
      });
    }

    if (Array.isArray(path.prerequisites) && path.prerequisites.length > 0) {
      const missing = [];
      for (const requiredPathId of path.prerequisites) {
        const prereqEnroll = await getEnrollment(requiredPathId, userId);
        if (!prereqEnroll || (prereqEnroll.status !== 'completed' && calculateProgress(await getPathById(requiredPathId), prereqEnroll) < 100)) {
          missing.push(requiredPathId);
        }
      }

      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          message: '尚未完成必要先修學習路徑',
          data: { missingPrerequisites: missing }
        });
      }
    }

    const existing = await getEnrollment(pathId, userId);
    if (existing && existing.status !== 'withdrawn') {
      return res.json({
        success: true,
        data: {
          pathId,
          userId,
          enrolledAt: existing.enrolledAt || existing.createdAt,
          progress: calculateProgress(path, existing),
          currentCourseOrder: existing.currentCourseOrder || 1,
          completedCourses: existing.completedCourses || []
        },
        message: '已在學習路徑中'
      });
    }

    const now = new Date().toISOString();
    const enrollment = {
      PK: `LEARNING_PATH#${pathId}`,
      SK: `ENROLL#${userId}`,
      entityType: 'LEARNING_PATH_ENROLLMENT',
      pathId,
      userId,
      enrolledAt: now,
      status: 'active',
      progress: 0,
      currentCourseOrder: 1,
      completedCourses: [],
      totalTimeSpent: 0,
      lastActivity: now,
      updatedAt: now,
      createdAt: now
    };

    await db.putItem(enrollment);
    await db.putItem({
      PK: `USER#${userId}`,
      SK: `LEARNING_PATH#${pathId}`,
      entityType: 'USER_LEARNING_PATH',
      userId,
      pathId,
      enrolledAt: now,
      status: 'active',
      updatedAt: now
    });

    await refreshPathStats(pathId);

    res.json({
      success: true,
      data: {
        pathId,
        userId,
        enrolledAt: now,
        progress: 0,
        currentCourseOrder: 1,
        completedCourses: []
      },
      message: '已成功報名學習路徑'
    });
  } catch (error) {
    console.error('Enroll learning path error:', error);
    res.status(500).json({
      success: false,
      message: '報名學習路徑失敗'
    });
  }
});

router.delete('/:pathId/enroll', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const userId = req.user.userId;

    const existing = await getEnrollment(pathId, userId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '尚未報名此學習路徑'
      });
    }

    await db.deleteItem(`LEARNING_PATH#${pathId}`, `ENROLL#${userId}`);
    await db.deleteItem(`USER#${userId}`, `LEARNING_PATH#${pathId}`);
    await refreshPathStats(pathId);

    res.json({
      success: true,
      message: '已取消報名學習路徑'
    });
  } catch (error) {
    console.error('Unenroll learning path error:', error);
    res.status(500).json({
      success: false,
      message: '取消報名失敗'
    });
  }
});

router.get('/:pathId/progress', authMiddleware, async (req, res) => {
  try {
    const { pathId } = req.params;
    const userId = req.user.userId;

    const path = await getPathById(pathId);
    if (!path) {
      return res.status(404).json({
        success: false,
        message: '找不到學習路徑'
      });
    }

    const enrollment = await getEnrollment(pathId, userId);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: '尚未報名此學習路徑'
      });
    }

    const normalized = normalizePath(path, enrollment);
    const courses = normalized.courses;
    const completedSet = new Set(enrollment.completedCourses || []);
    const currentCourse = courses.find(c => !completedSet.has(c.courseId)) || null;
    const unlockedCourses = courses.filter((course, idx) => {
      if (idx === 0) return true;
      const prev = courses[idx - 1];
      return completedSet.has(prev.courseId);
    }).map(c => c.courseId);
    const lockedCourses = courses.filter(c => !unlockedCourses.includes(c.courseId)).map(c => c.courseId);

    res.json({
      success: true,
      data: {
        pathId,
        userId,
        overallProgress: normalized.userProgress || 0,
        currentCourse: currentCourse ? {
          courseId: currentCourse.courseId,
          title: currentCourse.title,
          progress: completedSet.has(currentCourse.courseId) ? 100 : (normalized.userProgress || 0)
        } : null,
        completedCourses: courses
          .filter(c => completedSet.has(c.courseId))
          .map(c => ({ courseId: c.courseId, completedAt: enrollment.lastActivity || enrollment.updatedAt })),
        unlockedCourses,
        lockedCourses,
        estimatedCompletion: enrollment.estimatedCompletion || null,
        totalTimeSpent: parseInteger(enrollment.totalTimeSpent, 0, { min: 0 }),
        lastActivity: enrollment.lastActivity || enrollment.updatedAt || enrollment.enrolledAt
      }
    });
  } catch (error) {
    console.error('Get learning path progress error:', error);
    res.status(500).json({
      success: false,
      message: '取得學習進度失敗'
    });
  }
});

// ============================================================================
// 課程先決條件
// ============================================================================

router.get('/courses/:courseId/prerequisites', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const item = await db.getItem(`COURSE#${courseId}`, 'PREREQUISITES');
    const requirements = Array.isArray(item?.requirements) ? item.requirements : [];
    const result = await evaluatePrerequisites(req.user.userId, requirements);

    res.json({
      success: true,
      data: {
        courseId,
        ...result
      }
    });
  } catch (error) {
    console.error('Get prerequisites error:', error);
    res.status(500).json({
      success: false,
      message: '取得先決條件失敗'
    });
  }
});

router.put('/courses/:courseId/prerequisites', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可設定先決條件'
      });
    }

    const { courseId } = req.params;
    const { requirements } = req.body;
    const normalizedRequirements = Array.isArray(requirements) ? requirements : [];
    const now = new Date().toISOString();

    await db.putItem({
      PK: `COURSE#${courseId}`,
      SK: 'PREREQUISITES',
      entityType: 'COURSE_PREREQUISITES',
      courseId,
      requirements: normalizedRequirements,
      updatedBy: req.user.userId,
      updatedAt: now,
      createdAt: now
    });

    res.json({
      success: true,
      data: {
        courseId,
        requirements: normalizedRequirements,
        updatedAt: now
      },
      message: '先決條件設定已更新'
    });
  } catch (error) {
    console.error('Update prerequisites error:', error);
    res.status(500).json({
      success: false,
      message: '更新先決條件失敗'
    });
  }
});

router.post('/courses/:courseId/check-prerequisites', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const item = await db.getItem(`COURSE#${courseId}`, 'PREREQUISITES');
    const requirements = Array.isArray(item?.requirements) ? item.requirements : [];
    const result = await evaluatePrerequisites(req.user.userId, requirements);

    res.json({
      success: true,
      data: {
        courseId,
        userId: req.user.userId,
        ...result,
        checkedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Check prerequisites error:', error);
    res.status(500).json({
      success: false,
      message: '檢查先決條件失敗'
    });
  }
});

// ============================================================================
// 學習路徑報告
// ============================================================================

router.get('/:pathId/report', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可查看學習路徑報告'
      });
    }

    const { pathId } = req.params;
    const path = await getPathById(pathId);
    if (!path) {
      return res.status(404).json({
        success: false,
        message: '找不到學習路徑'
      });
    }

    const normalizedPath = normalizePath(path);
    const enrollments = await db.query(`LEARNING_PATH#${pathId}`, { skPrefix: 'ENROLL#' });
    const activeEnrollments = enrollments.filter(e => e.entityType === 'LEARNING_PATH_ENROLLMENT' && e.status !== 'withdrawn');
    const completedEnrollments = activeEnrollments.filter(e => e.status === 'completed' || calculateProgress(path, e) >= 100);
    const averageProgress = activeEnrollments.length > 0
      ? Math.round(activeEnrollments.reduce((sum, e) => sum + calculateProgress(path, e), 0) / activeEnrollments.length)
      : 0;

    const completionRate = activeEnrollments.length > 0
      ? Math.round((completedEnrollments.length / activeEnrollments.length) * 100)
      : 0;

    const courseBreakdown = normalizedPath.courses.map(course => {
      const completedInCourse = activeEnrollments.filter(e => (e.completedCourses || []).includes(course.courseId)).length;
      return {
        courseId: course.courseId,
        title: course.title || '',
        completionRate: activeEnrollments.length > 0
          ? Math.round((completedInCourse / activeEnrollments.length) * 100)
          : 0,
        avgGrade: null
      };
    });

    const recentCompletions = [];
    for (const enrollment of completedEnrollments
      .sort((a, b) => new Date(b.updatedAt || b.completedAt || 0).getTime() - new Date(a.updatedAt || a.completedAt || 0).getTime())
      .slice(0, 10)) {
      const user = await db.getUser(enrollment.userId) || await db.getAdmin(enrollment.userId);
      recentCompletions.push({
        userId: enrollment.userId,
        displayName: user?.displayName || user?.displayNameZh || enrollment.userId,
        completedAt: enrollment.completedAt || enrollment.updatedAt || enrollment.lastActivity || enrollment.enrolledAt
      });
    }

    res.json({
      success: true,
      data: {
        pathId,
        pathName: normalizedPath.name,
        totalEnrolled: activeEnrollments.length,
        activeUsers: activeEnrollments.length - completedEnrollments.length,
        completedUsers: completedEnrollments.length,
        completionRate,
        averageProgress,
        averageCompletionDays: null,
        courseBreakdown,
        recentCompletions,
        dropoutPoints: [],
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get learning path report error:', error);
    res.status(500).json({
      success: false,
      message: '取得學習路徑報告失敗'
    });
  }
});

module.exports = router;
