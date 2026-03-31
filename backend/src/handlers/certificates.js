const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { canManageCourse } = require('../utils/course-access');
const {
  CERTIFICATE_CRITERION_TYPES,
  CERTIFICATE_THEME_OPTIONS,
  normalizeCertificateSettings,
  defaultCertificateSettings,
  getCourseActivities,
  getCertificateSettings,
  syncCourseCertificates,
  listUserCertificates,
  listCourseRecipients
} = require('../utils/certificates');

function buildActivityGroups(activities = []) {
  const groups = {
    materials: [],
    assignments: [],
    quizzes: [],
    others: []
  };

  activities.forEach((activity) => {
    const normalized = {
      activityId: activity.activityId || activity.courseActivityId,
      courseActivityId: activity.courseActivityId || activity.activityId,
      title: activity.title || activity.name || '未命名活動',
      type: activity.type || 'page',
      description: activity.description || '',
      sectionId: activity.sectionId || null
    };

    if (['page', 'url', 'file', 'video', 'lti', 'scorm', 'h5p', 'label'].includes(normalized.type)) {
      groups.materials.push(normalized);
      return;
    }
    if (normalized.type === 'assignment') {
      groups.assignments.push(normalized);
      return;
    }
    if (normalized.type === 'quiz') {
      groups.quizzes.push(normalized);
      return;
    }
    groups.others.push(normalized);
  });

  return groups;
}

router.get('/admin/courses', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '只有管理員可以查看證書總覽'
      });
    }

    const [courses, settingsItems] = await Promise.all([
      db.getItemsByEntityType('COURSE'),
      db.getItemsByEntityType('COURSE_CERTIFICATE_SETTINGS')
    ]);

    const courseMap = new Map(
      (Array.isArray(courses) ? courses : [])
        .filter(course => course?.courseId)
        .map(course => [course.courseId, course])
    );

    const overview = await Promise.all(
      (Array.isArray(settingsItems) ? settingsItems : [])
        .filter(item => item?.courseId)
        .map(async (item) => {
          const course = courseMap.get(item.courseId) || null;
          const normalized = normalizeCertificateSettings(item, course || { courseId: item.courseId }, []);
          const recipients = await listCourseRecipients(item.courseId);
          const durationCriterion = normalized.criteria.find(criterion => criterion?.type === CERTIFICATE_CRITERION_TYPES.DURATION) || null;

          return {
            courseId: item.courseId,
            courseTitle: course?.title || course?.name || normalized.template?.certificateTitle || '未命名課程',
            instructorName: course?.instructorName || course?.teacherName || '',
            enabled: normalized.enabled,
            autoIssue: normalized.autoIssue,
            issuedCount: Array.isArray(recipients) ? recipients.length : 0,
            criteriaCount: Array.isArray(normalized.criteria) ? normalized.criteria.length : 0,
            hasComplexCriteria: Array.isArray(normalized.criteria)
              ? normalized.criteria.some(criterion => criterion?.type !== CERTIFICATE_CRITERION_TYPES.DURATION)
              : false,
            durationMinutes: durationCriterion?.minMinutes || null,
            template: normalized.template,
            createdAt: item.createdAt || normalized.createdAt || null,
            updatedAt: item.updatedAt || normalized.updatedAt || null
          };
        })
    );

    overview.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());

    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Get admin certificate overview error:', error);
    res.status(500).json({
      success: false,
      message: '取得證書總覽失敗'
    });
  }
});

router.get('/my', authMiddleware, async (req, res) => {
  try {
    const certificates = await listUserCertificates(req.user.userId);
    res.json({
      success: true,
      data: certificates
    });
  } catch (error) {
    console.error('Get my certificates error:', error);
    res.status(500).json({
      success: false,
      message: '取得我的證書失敗'
    });
  }
});

router.get('/courses/:courseId/settings', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { course, settings, activities } = await getCertificateSettings(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: '沒有權限查看此課程證書設定'
      });
    }

    res.json({
      success: true,
      data: {
        course: {
          courseId: course.courseId || course.id,
          title: course.title || course.name || '未命名課程',
          instructorName: course.instructorName || course.teacherName || ''
        },
        settings,
        criteriaTypes: CERTIFICATE_CRITERION_TYPES,
        themes: CERTIFICATE_THEME_OPTIONS,
        activityGroups: buildActivityGroups(activities)
      }
    });
  } catch (error) {
    console.error('Get certificate settings error:', error);
    res.status(500).json({
      success: false,
      message: '取得證書設定失敗'
    });
  }
});

router.put('/courses/:courseId/settings', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await db.getItem(`COURSE#${courseId}`, 'META');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: '沒有權限修改此課程證書設定'
      });
    }

    const activities = await getCourseActivities(courseId);
    const normalized = normalizeCertificateSettings({
      courseId,
      enabled: req.body.enabled === true,
      autoIssue: req.body.autoIssue !== false,
      template: req.body.template || {},
      criteria: Array.isArray(req.body.criteria) ? req.body.criteria : [],
      createdAt: req.body.createdAt || null,
      updatedAt: new Date().toISOString()
    }, course, activities);

    const existing = await db.getItem(`COURSE#${courseId}`, 'CERTIFICATE_SETTINGS');
    const now = new Date().toISOString();
    const item = {
      PK: `COURSE#${courseId}`,
      SK: 'CERTIFICATE_SETTINGS',
      entityType: 'COURSE_CERTIFICATE_SETTINGS',
      courseId,
      enabled: normalized.enabled,
      autoIssue: normalized.autoIssue,
      template: normalized.template,
      criteria: normalized.criteria,
      updatedBy: req.user.userId,
      updatedAt: now,
      createdAt: existing?.createdAt || now
    };

    await db.putItem(item);
    await db.updateItem(`COURSE#${courseId}`, 'META', {
      updatedAt: now,
      'settings.issueCertificate': normalized.enabled
    });

    if (normalized.enabled) {
      await syncCourseCertificates(courseId, { issuedBy: req.user.userId });
    }

    res.json({
      success: true,
      data: {
        courseId,
        ...defaultCertificateSettings(course),
        ...normalized,
        updatedAt: now,
        createdAt: existing?.createdAt || now
      },
      message: '證書設定已更新'
    });
  } catch (error) {
    console.error('Update certificate settings error:', error);
    res.status(500).json({
      success: false,
      message: '更新證書設定失敗'
    });
  }
});

router.get('/courses/:courseId/recipients', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await db.getItem(`COURSE#${courseId}`, 'META');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: '找不到課程'
      });
    }

    if (!canManageCourse(course, req.user)) {
      return res.status(403).json({
        success: false,
        message: '沒有權限查看此課程證書名單'
      });
    }

    const recipients = await listCourseRecipients(courseId);
    res.json({
      success: true,
      data: recipients
    });
  } catch (error) {
    console.error('Get certificate recipients error:', error);
    res.status(500).json({
      success: false,
      message: '取得證書名單失敗'
    });
  }
});

module.exports = router;
