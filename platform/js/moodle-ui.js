/**
 * BeyondBridge Moodle-style UI Module
 * 前端頁面邏輯 - Moodle 風格功能
 */

const MoodleUI = {
  // 當前選中的課程
  currentCourse: null,
  currentCourseId: null,

  // 當前各模組選中的課程
  currentAssignmentCourseId: null,
  currentQuizCourseId: null,
  currentForumCourseId: null,
  currentAssignmentBuilderState: null,
  currentQuizBuilderState: null,
  currentForumBuilderState: null,
  currentQuizQuestionEditorState: null,
  currentQuizQuestionBankPicker: null,
  currentQuizBulkImportState: null,
  currentAssignmentDetail: null,
  assignmentSubmissionDraft: null,
  currentViewedAssignmentSubmission: null,
  currentQuestionBankCourseId: null,
  currentQuestionBankCategoryFilter: null,
  currentCalendarEvents: [],
  currentEditingActivity: null,
  manageableCourseIdsCache: null,
  interactiveVideoEditorState: {},
  interactiveVideoPromptCounter: 0,

  teachingRoles: new Set(['manager', 'coursecreator', 'educator', 'trainer', 'creator', 'teacher', 'assistant']),

  isTeachingRole(user = API.getCurrentUser()) {
    if (!user) return false;
    return !!(user.isAdmin || this.teachingRoles.has(user.role));
  },

  isCourseOwner(course, user = API.getCurrentUser()) {
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
  },

  canTeachCourse(course, user = API.getCurrentUser()) {
    if (!this.isTeachingRole(user)) return false;
    if (!course) return true;
    return this.isCourseOwner(course, user);
  },

  canManageCourse(course, user = API.getCurrentUser()) {
    if (!course || !user) return false;
    if (!this.isTeachingRole(user)) return false;
    return this.isCourseOwner(course, user);
  },

  canViewParticipants(course, user = API.getCurrentUser()) {
    if (!course || !user) return false;
    if (this.canTeachCourse(course, user)) return true;
    return !!course.isEnrolled;
  },

  canManageBadge(badge, user = API.getCurrentUser()) {
    if (!badge || !user) return false;
    if (user.isAdmin) return true;
    if (!this.isTeachingRole(user)) return false;
    return !badge.createdBy || badge.createdBy === user.userId;
  },

  canManageRubric(rubric, user = API.getCurrentUser()) {
    if (!rubric || !user) return false;
    if (user.isAdmin) return true;
    if (!this.isTeachingRole(user)) return false;
    return !rubric.createdBy || rubric.createdBy === user.userId;
  },

  canManageH5pContent(content, user = API.getCurrentUser()) {
    if (!content || !user) return false;
    if (user.isAdmin) return true;
    return !!(content.createdBy && content.createdBy === user.userId);
  },

  isCurrentUser(userId, user = API.getCurrentUser()) {
    return !!(user && userId && user.userId === userId);
  },

  async getManageableCourseIds(forceRefresh = false) {
    if (!forceRefresh && this.manageableCourseIdsCache instanceof Set) {
      return this.manageableCourseIdsCache;
    }
    const courses = await this.getRoleScopedCourses({ manageOnly: true }).catch(() => []);
    this.manageableCourseIdsCache = new Set(
      courses
        .map(course => course.courseId || course.id)
        .filter(Boolean)
    );
    return this.manageableCourseIdsCache;
  },

  async canManageCourseById(courseId, user = API.getCurrentUser()) {
    if (!courseId || !user) return false;
    if (user.isAdmin) return true;
    if (!this.isTeachingRole(user)) return false;
    const manageableCourseIds = await this.getManageableCourseIds();
    return manageableCourseIds.has(courseId);
  },

  ensureViewVisible(viewName) {
    if (typeof window.showView !== 'function') return true;
    const result = window.showView(viewName);
    return result?.ok !== false;
  },

  setSidebarActiveView(viewName) {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${viewName}"]`)?.classList.add('active');
  },

  getPlatformViewPath(viewName, query = null) {
    if (window.PlatformRouter?.getPathForView) {
      return window.PlatformRouter.getPathForView(viewName, query) || '#';
    }
    return '#';
  },

  getCourseDetailPath(courseId, tab = '') {
    if (!courseId) return '#';
    const basePath = `/platform/course/${encodeURIComponent(courseId)}`;
    if (!tab || tab === 'content') return basePath;
    return `${basePath}?tab=${encodeURIComponent(tab)}`;
  },

  navigateCourseDetail(event, courseId, tab = 'content') {
    if (!courseId || typeof window.openPlatformPath !== 'function') return true;
    return window.openPlatformPath(event, this.getCourseDetailPath(courseId, tab));
  },

  navigateCourseWorkspace(event, viewName, courseId) {
    if (!courseId || typeof window.openPlatformView !== 'function') return true;
    return window.openPlatformView(event, viewName, { query: { courseId } });
  },

  canManageLearningPath(path, user = API.getCurrentUser()) {
    if (!path || !user) return false;
    if (user.isAdmin) return true;
    if (!this.isTeachingRole(user)) return false;
    return !path.createdBy || path.createdBy === user.userId;
  },

  contentActivityAutoCompleteMs: 15000,
  externalPlatformAutoCompleteMs: 300000, // 外部平台活動 5 分鐘後才自動標記完成
  progressHeartbeatIntervalMs: 60000, // 每 60 秒回報一次停留時間

  getLearningProgressUiCopy() {
    const isEnglish = I18n.getLocale() === 'en';
    return {
      title: isEnglish ? 'Learning Progress' : '學習進度',
      subtitle: isEnglish
        ? 'Track every course, every activity, your latest study time, and your accumulated learning time in one place.'
        : '集中查看每門課、每個活動的完成狀態、最後學習時間與累積學習時間。',
      noCoursesTitle: isEnglish ? 'No learning progress yet' : '目前還沒有學習進度',
      noCoursesHint: isEnglish
        ? 'Open a course and start interacting with learning activities. Your progress will appear here automatically.'
        : '先進入課程並開始學習，系統就會在這裡自動累積你的進度。',
      totalCourses: isEnglish ? 'Tracked courses' : '追蹤課程',
      completedCourses: isEnglish ? 'Completed courses' : '完成課程',
      totalTime: isEnglish ? 'Accumulated time' : '累積時間',
      lastLearning: isEnglish ? 'Last learning time' : '最後學習時間',
      overallProgress: isEnglish ? 'Overall progress' : '整體進度',
      completedActivities: isEnglish ? 'Completed activities' : '已完成項目',
      totalActivities: isEnglish ? 'Total activities' : '活動總數',
      courseSummary: isEnglish ? 'Course summary' : '課程摘要',
      activityDetails: isEnglish ? 'Activity progress details' : '活動學習明細',
      openCourse: isEnglish ? 'Open course' : '前往課程',
      viewDetails: isEnglish ? 'View details' : '查看明細',
      openActivity: isEnglish ? 'Open activity' : '開啟活動',
      backToOverview: isEnglish ? 'Back to progress overview' : '返回學習進度總覽',
      completed: isEnglish ? 'Completed' : '已完成',
      inProgress: isEnglish ? 'In progress' : '進行中',
      notStarted: isEnglish ? 'Not started' : '未開始',
      lastStudied: isEnglish ? 'Last studied' : '最後學習',
      noRecord: isEnglish ? 'No record yet' : '尚無紀錄',
      teacherHint: isEnglish
        ? 'This page currently focuses on learner-side progress records.'
        : '這個頁面目前聚焦在學員個人的學習紀錄。'
    };
  },

  extractCollectionData(result) {
    if (!result?.success) return [];
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.data?.courses)) return result.data.courses;
    if (Array.isArray(result.data?.items)) return result.data.items;
    return [];
  },

  isContentProgressActivity(activity = {}) {
    const activityType = String(activity.type || '').toLowerCase();
    const contentType = String(activity.contentType || '').toLowerCase();
    return ['page', 'url', 'file'].includes(activityType) ||
      contentType.startsWith('video/') ||
      contentType.startsWith('image/');
  },

  async triggerCourseCompletionCheck(courseId) {
    if (!courseId || typeof API?.request !== 'function') return null;
    try {
      return await API.request(`/courses/${courseId}/check-completion`, {
        method: 'POST'
      });
    } catch (error) {
      console.warn('Check completion after content activity failed:', error);
      return null;
    }
  },

  installCleanupHook(target, propertyName, cleanup) {
    if (!target || typeof cleanup !== 'function' || !propertyName) return;
    const previousCleanup = typeof target[propertyName] === 'function' ? target[propertyName] : null;
    target[propertyName] = async () => {
      if (previousCleanup) {
        await previousCleanup();
      }
      await cleanup();
    };
  },

  createContentProgressSession(activity, courseId, options = {}) {
    if (!activity?.activityId || !courseId) return null;

    const startedAt = Date.now();
    const autoCompleteAfterMs = Math.max(
      5000,
      Number(options.autoCompleteAfterMs || this.contentActivityAutoCompleteMs) || this.contentActivityAutoCompleteMs
    );
    const shouldAutoComplete = this.isContentProgressActivity(activity);
    let readyForCompletion = false;
    let completionTimer = null;
    let completionRecorded = false;
    let cleanupRan = false;
    let heartbeatTimer = null;
    let lastHeartbeatAt = startedAt;

    const recordAccess = async (payload = {}) => {
      try {
        return await API.courses.updateProgress(courseId, {
          activityId: activity.activityId,
          currentSectionId: activity.sectionId,
          ...payload
        });
      } catch (error) {
        console.warn('Record content activity progress failed:', error);
        return null;
      }
    };

    const recordCompletion = async () => {
      if (!shouldAutoComplete || completionRecorded) return false;
      completionRecorded = true;

      try {
        const result = await API.courses.completeActivity(courseId, activity.activityId);
        if (result?.success) {
          await this.triggerCourseCompletionCheck(courseId);
          return true;
        }
      } catch (error) {
        console.warn('Complete content activity failed:', error);
      }

      completionRecorded = false;
      return false;
    };

    const scheduleCompletion = () => {
      if (!shouldAutoComplete || !readyForCompletion || completionRecorded || completionTimer) return;
      completionTimer = window.setTimeout(() => {
        completionTimer = null;
        recordCompletion();
      }, autoCompleteAfterMs);
    };

    // 心跳：定時回報停留時間，確保老師能看到即時數據
    const startHeartbeat = () => {
      if (heartbeatTimer) return;
      const interval = this.progressHeartbeatIntervalMs || 60000;
      heartbeatTimer = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastHeartbeatAt) / 1000);
        if (elapsed > 0) {
          lastHeartbeatAt = Date.now();
          recordAccess({ timeSpent: elapsed });
        }
      }, interval);
    };

    recordAccess();

    return {
      markReady: () => {
        readyForCompletion = true;
        startHeartbeat();
        scheduleCompletion();
      },
      markCompletedNow: () => recordCompletion(),
      attachToCleanup: (target, propertyName) => {
        this.installCleanupHook(target, propertyName, async () => {
          if (cleanupRan) return;
          cleanupRan = true;
          if (completionTimer) {
            clearTimeout(completionTimer);
          }
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
          }

          const timeSpent = Math.floor((Date.now() - lastHeartbeatAt) / 1000);
          if (timeSpent > 0) {
            await recordAccess({ timeSpent });
          }

          if (readyForCompletion && !completionRecorded && (Date.now() - startedAt) >= autoCompleteAfterMs) {
            await recordCompletion();
          }
        });
      }
    };
  },

  normalizeCourseRecord(course = {}) {
    const progressSource = course.userProgress || course.progress;
    const progressValue = progressSource?.progressPercentage ?? course.progressPercentage ?? course.progress ?? null;
    const normalizedProgress = Number(progressValue);
    const progressDetails = progressSource && typeof progressSource === 'object'
      ? { ...progressSource }
      : null;
    const visibility = this.normalizeCourseVisibility(course.visibility ?? course.visible);
    return {
      ...course,
      courseId: course.courseId || course.id,
      isEnrolled: course.isEnrolled ?? Boolean(progressSource),
      progress: Number.isFinite(normalizedProgress) ? normalizedProgress : course.progress,
      progressDetails,
      userProgress: course.userProgress || progressDetails,
      visibility,
      visible: visibility === 'show'
    };
  },

  getCourseProgressSource(course = {}) {
    const source = course.userProgress || course.progressDetails || (typeof course.progress === 'object' ? course.progress : null) || {};
    const totalTimeSpent = Number(source.totalTimeSpent || 0) || 0;
    const completedActivities = Array.isArray(source.completedActivities) ? source.completedActivities : [];
    const activityAccessMap = source.activityAccessMap && typeof source.activityAccessMap === 'object' && !Array.isArray(source.activityAccessMap)
      ? source.activityAccessMap
      : {};
    const activityTimeMap = source.activityTimeMap && typeof source.activityTimeMap === 'object' && !Array.isArray(source.activityTimeMap)
      ? source.activityTimeMap
      : {};
    const activityProgressMap = source.activityProgressMap && typeof source.activityProgressMap === 'object' && !Array.isArray(source.activityProgressMap)
      ? source.activityProgressMap
      : {};
    const progressPercentage = this.clampProgressValue(
      source.progressPercentage ?? course.progressPercentage ?? course.progress ?? 0
    );

    return {
      ...source,
      totalTimeSpent,
      progressPercentage,
      completedActivities,
      activityAccessMap,
      activityTimeMap,
      activityProgressMap
    };
  },

  getCourseTotalActivities(course = {}) {
    const sectionActivities = Array.isArray(course.sections)
      ? course.sections.reduce((sum, section) => sum + ((Array.isArray(section.activities) ? section.activities.length : 0)), 0)
      : 0;
    const storedTotal = Number(
      course?.stats?.totalActivities ??
      course.totalActivities ??
      course.activityCount ??
      0
    ) || 0;
    return Math.max(sectionActivities, storedTotal);
  },

  getLearningProgressCourseStats(course = {}) {
    const progress = this.getCourseProgressSource(course);
    const totalActivities = this.getCourseTotalActivities(course);
    const completedActivities = progress.completedActivities.length > 0
      ? progress.completedActivities.length
      : (totalActivities > 0 ? Math.round((this.clampProgressValue(progress.progressPercentage) / 100) * totalActivities) : 0);
    const lastAccessedAt = progress.lastAccessedAt || progress.enrolledAt || null;
    const hasStarted = progress.progressPercentage > 0 || progress.totalTimeSpent > 0 || Boolean(lastAccessedAt);

    return {
      progress,
      totalActivities,
      completedActivities,
      progressPercentage: this.clampProgressValue(progress.progressPercentage),
      totalTimeSpent: progress.totalTimeSpent,
      lastAccessedAt,
      hasStarted,
      isCompleted: progress.status === 'completed' || (totalActivities > 0 && completedActivities >= totalActivities) || progress.progressPercentage >= 100
    };
  },

  getLearningProgressSections(course = {}) {
    const uiCopy = this.getLearningProgressUiCopy();
    const progress = this.getCourseProgressSource(course);
    const completedSet = new Set(progress.completedActivities);
    const accessMap = progress.activityAccessMap || {};
    const timeMap = progress.activityTimeMap || {};
    const progressMap = progress.activityProgressMap || {};
    const sections = Array.isArray(course.sections) ? course.sections : [];

    return sections.map((section, sectionIndex) => {
      const activities = Array.isArray(section.activities) ? section.activities : [];
      const activityModels = activities.map((activity, activityIndex) => {
        const resolvedActivityId = activity.launchActivityId || activity.activityId || activity.courseActivityId || '';
        const lastAccessedAt = accessMap[resolvedActivityId] || accessMap[activity.activityId] || null;
        const totalTimeSpent = Number(timeMap[resolvedActivityId] ?? timeMap[activity.activityId] ?? 0) || 0;
        const itemProgress = this.clampProgressValue(progressMap[resolvedActivityId] ?? progressMap[activity.activityId] ?? 0);
        const isCompleted = completedSet.has(resolvedActivityId) || completedSet.has(activity.activityId) || itemProgress >= 100;
        const isStarted = isCompleted || Boolean(lastAccessedAt) || totalTimeSpent > 0 || itemProgress > 0;
        const statusKey = isCompleted ? 'completed' : (isStarted ? 'in_progress' : 'not_started');
        const statusLabel = isCompleted ? uiCopy.completed : (isStarted ? uiCopy.inProgress : uiCopy.notStarted);
        const statusClass = isCompleted ? 'completed' : (isStarted ? 'in-progress' : 'not-started');

        return {
          ...activity,
          activityId: resolvedActivityId || activity.activityId || '',
          sequenceLabel: `${sectionIndex + 1}.${activityIndex + 1}`,
          isCompleted,
          isStarted,
          statusKey,
          statusLabel,
          statusClass,
          progressPercentage: isCompleted ? 100 : itemProgress,
          totalTimeSpent,
          lastAccessedAt
        };
      });

      return {
        ...section,
        sectionTitle: section.name || section.title || `${I18n.getLocale() === 'en' ? 'Section' : '章節'} ${sectionIndex + 1}`,
        activities: activityModels
      };
    }).filter(section => section.activities.length > 0);
  },

  normalizeCourseVisibility(value) {
    if (typeof value === 'boolean') {
      return value ? 'show' : 'hide';
    }
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 'show';
    if (['show', 'visible', 'published', 'true', '1'].includes(normalized)) return 'show';
    if (['hide', 'hidden', 'draft', 'false', '0'].includes(normalized)) return 'hide';
    return 'show';
  },

  getLocalizedCourseCategory(category) {
    const normalized = String(category || '').trim();
    if (!normalized) return t('moodleCourse.defaultCategory');
    const fallbackLabels = {
      math: '數學',
      chinese: '國文',
      english: '英文',
      science: '自然科學',
      social: '社會科學',
      business: '商業管理',
      technology: '資訊科技',
      arts: '藝術人文',
      language: '語言學習',
      wellness: '心靈成長'
    };
    if (typeof window !== 'undefined' && window.categoryLabels) {
      return window.categoryLabels[String(normalized).toLowerCase()] || fallbackLabels[String(normalized).toLowerCase()] || normalized;
    }
    return fallbackLabels[String(normalized).toLowerCase()] || normalized;
  },

  getLocalizedQuestionType(type) {
    const typeLabels = {
      multiple_choice: t('moodleQuestionBank.multipleChoice'),
      multiple_select: I18n.getLocale() === 'en' ? 'Multiple select' : '多選題',
      true_false: t('moodleQuestionBank.trueFalse'),
      short_answer: t('moodleQuestionBank.shortAnswer'),
      matching: t('moodleQuestionBank.matching'),
      ordering: I18n.getLocale() === 'en' ? 'Ordering' : '排序題',
      numerical: I18n.getLocale() === 'en' ? 'Numerical' : '數值題',
      fill_blank: t('moodleQuestionBank.fillBlank'),
      cloze: I18n.getLocale() === 'en' ? 'Cloze' : '克漏字',
      essay: t('moodleQuestionBank.essay')
    };
    return typeLabels[type] || type || '—';
  },

  normalizeCourseFormat(format) {
    const normalized = String(format || '').trim().toLowerCase();
    if (!normalized) return 'topics';
    if (normalized === 'weekly') return 'weeks';
    return normalized;
  },

  normalizeAssignmentSubmissionType(type) {
    if (type === 'online_text') return 'text';
    return type || 'text';
  },

  toDateTimeLocalValue(value) {
    if (!value) return '';
    return String(value).slice(0, 16);
  },

  extractAssignmentFileId(file = {}) {
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
  },

  normalizeAssignmentFile(file, index = 0) {
    if (!file) return null;

    if (typeof file === 'string') {
      const dataUrl = String(file);
      const mimeType = dataUrl.startsWith('data:')
        ? (dataUrl.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream')
        : 'application/octet-stream';
      return {
        fileId: null,
        name: `submission_file_${index + 1}`,
        filename: `submission_file_${index + 1}`,
        fileName: `submission_file_${index + 1}`,
        size: null,
        contentType: mimeType,
        mimeType,
        legacyDataUrl: dataUrl.startsWith('data:') ? dataUrl : null,
        content: dataUrl.startsWith('data:') ? String(dataUrl).split(',')[1] : null,
        uploadedAt: null
      };
    }

    const fileId = this.extractAssignmentFileId(file);
    const filename = file.filename || file.fileName || file.name || `file_${index + 1}`;
    const mimeType = file.contentType || file.mimeType || file.type || 'application/octet-stream';
    const token = encodeURIComponent(API.accessToken || localStorage.getItem('accessToken') || '');
    const generatedViewUrl = fileId ? `/api/files/${fileId}/view${token ? `?token=${token}` : ''}` : null;
    const generatedDownloadUrl = fileId ? `/api/files/${fileId}/download${token ? `?token=${token}` : ''}` : null;

    return {
      ...file,
      fileId,
      name: filename,
      filename,
      fileName: filename,
      size: Number(file.size ?? file.fileSize ?? 0) || null,
      contentType: mimeType,
      mimeType,
      uploadedAt: file.uploadedAt || file.createdAt || null,
      viewUrl: generatedViewUrl || file.viewUrl || null,
      downloadUrl: generatedDownloadUrl || file.downloadUrl || null,
      legacyDataUrl: file.legacyDataUrl || null,
      content: file.content || null
    };
  },

  normalizeAssignmentFiles(files = []) {
    if (!Array.isArray(files)) return [];
    return files
      .map((file, index) => this.normalizeAssignmentFile(file, index))
      .filter(Boolean);
  },

  filterCourseCollection(courses = [], filters = {}) {
    let filtered = Array.isArray(courses) ? [...courses] : [];
    const search = String(filters.search || '').trim().toLowerCase();
    const category = String(filters.category || '').trim().toLowerCase();
    const instructor = String(filters.instructor || '').trim();
    const status = String(filters.status || '').trim().toLowerCase();

    if (category) {
      filtered = filtered.filter(course => String(course.category || '').toLowerCase() === category);
    }

    if (instructor) {
      filtered = filtered.filter(course =>
        course.instructorId === instructor ||
        course.teacherId === instructor ||
        course.creatorId === instructor ||
        course.createdBy === instructor ||
        (Array.isArray(course.instructors) && course.instructors.includes(instructor))
      );
    }

    if (search) {
      filtered = filtered.filter(course => {
        const haystack = [
          course.title,
          course.name,
          course.description,
          course.summary,
          course.shortName,
          course.shortname
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    if (status) {
      filtered = filtered.filter(course => String(course.status || 'published').toLowerCase() === status);
    }

    return filtered;
  },

  getCourseDisplaySortTime(course = {}) {
    const progress = course.progressDetails || course.userProgress || (course.progress && typeof course.progress === 'object' ? course.progress : {});
    const candidates = [
      course.enrolledAt,
      progress.enrolledAt,
      course.joinedAt,
      course.createdAt,
      course.updatedAt
    ];

    for (const value of candidates) {
      if (value === undefined || value === null || value === '') continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp)) return timestamp;
    }

    return 0;
  },

  getCourseDisplayOrderValue(course = {}) {
    for (const value of [course.sortOrder, course.displayOrder, course.order]) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return null;
  },

  sortCourseCollectionForDisplay(courses = []) {
    return [...(Array.isArray(courses) ? courses : [])].sort((a = {}, b = {}) => {
      const orderA = this.getCourseDisplayOrderValue(a);
      const orderB = this.getCourseDisplayOrderValue(b);
      if (orderA !== null || orderB !== null) {
        return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
      }

      const timeDiff = this.getCourseDisplaySortTime(b) - this.getCourseDisplaySortTime(a);
      if (timeDiff !== 0) return timeDiff;

      const titleA = String(a.title || a.name || '').trim();
      const titleB = String(b.title || b.name || '').trim();
      const titleDiff = titleA.localeCompare(titleB, I18n.getLocale() === 'en' ? 'en' : 'zh-Hant-u-co-pinyin', {
        numeric: true,
        sensitivity: 'base'
      });
      if (titleDiff !== 0) return titleDiff;

      return String(a.courseId || a.id || '').localeCompare(String(b.courseId || b.id || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    });
  },

  async getRoleScopedCourses({ manageOnly = false, filters = {} } = {}) {
    const user = API.getCurrentUser();
    if (!user) return [];

    let courses = [];
    if (user.isAdmin || user.role === 'admin') {
      const result = await API.courses.list(filters);
      courses = this.extractCollectionData(result);
    } else if (manageOnly || this.isTeachingRole(user)) {
      const result = await API.courses.getMyCourses('instructor');
      courses = this.extractCollectionData(result);
    } else {
      const result = await API.courses.getMyCourses('student');
      courses = this.extractCollectionData(result);
    }

    courses = courses.map(course => this.normalizeCourseRecord(course));
    courses = this.filterCourseCollection(courses, filters);

    if (manageOnly) {
      courses = courses.filter(course => this.canManageCourse(course, user));
    }

    return this.sortCourseCollectionForDisplay(courses);
  },

  normalizeAssignmentState(assignment = {}) {
    const submission = assignment.submission
      ? {
          ...assignment.submission,
          files: this.normalizeAssignmentFiles(assignment.submission.files || [])
        }
      : null;
    const submissionStatus = assignment.submissionStatus || {};

    const submitted = Boolean(
      assignment.submitted === true ||
      submissionStatus.submitted === true ||
      submission?.submitted === true ||
      submission?.submittedAt
    );

    const hasGrade = (
      submission?.grade !== undefined && submission?.grade !== null
    ) || (
      submissionStatus.grade !== undefined && submissionStatus.grade !== null
    );
    const gradePendingRelease = Boolean(
      assignment.gradeVisibility?.pendingRelease ||
      submission?.gradePendingRelease ||
      submissionStatus.gradePendingRelease
    );

    const graded = Boolean(
      assignment.graded === true ||
      submissionStatus.graded === true ||
      submission?.graded === true ||
      submission?.gradedAt ||
      hasGrade ||
      gradePendingRelease
    );
    const computedSubmission = submission || (submissionStatus.submitted
      ? {
          submittedAt: submissionStatus.submittedAt || null,
          grade: submissionStatus.grade ?? null,
          gradedAt: submissionStatus.graded ? submissionStatus.gradedAt || null : null,
          graded: Boolean(submissionStatus.graded || submissionStatus.gradePendingRelease),
          gradePendingRelease: Boolean(submissionStatus.gradePendingRelease),
          isLate: submissionStatus.isLate ?? (submissionStatus.submittedAt && assignment.dueDate
            ? new Date(submissionStatus.submittedAt) > new Date(assignment.dueDate)
            : false),
          lateBy: submissionStatus.lateBy || 0,
          files: []
        }
      : null);

    return {
      ...assignment,
      submission: computedSubmission,
      submissions: Array.isArray(assignment.submissions)
        ? assignment.submissions.map((item = {}) => ({
            ...item,
            studentId: item.studentId || item.userId || '',
            studentName: item.studentName || item.userName || '',
            studentEmail: item.studentEmail || item.userEmail || '',
            files: this.normalizeAssignmentFiles(item.files || [])
          }))
        : [],
      submitted,
      graded,
      gradePendingRelease,
      grade: assignment.grade ?? computedSubmission?.grade ?? submissionStatus.grade ?? null,
      maxPoints: assignment.maxPoints ?? assignment.maxGrade ?? 100,
      maxGrade: assignment.maxGrade ?? assignment.maxPoints ?? 100,
      submissionType: this.normalizeAssignmentSubmissionType(assignment.submissionType)
    };
  },

  normalizeQuizState(quiz = {}) {
    const userStatus = quiz.userStatus || {};
    const resultVisibility = quiz.resultVisibility || {};
    const attempts = Array.isArray(quiz.attempts) ? quiz.attempts : [];
    const completedAttempts = attempts.filter(a => a.status === 'completed').length;
    const bestScore = quiz.bestScore ?? userStatus.bestScore ?? null;
    const gradePendingRelease = Boolean(
      quiz.gradeVisibility?.pendingRelease ||
      userStatus.gradePendingRelease ||
      attempts.some(attempt => attempt?.gradePendingRelease)
    );
    const attemptCount = Number(userStatus.attemptCount ?? attempts.length ?? 0);
    const completed = Boolean(
      quiz.completed === true ||
      completedAttempts > 0 ||
      userStatus.lastAttemptAt ||
      (bestScore !== null && bestScore !== undefined)
    );

    const maxAttemptsRaw = Number(quiz.maxAttempts);
    const maxAttempts = Number.isFinite(maxAttemptsRaw) ? maxAttemptsRaw : null;
    const canAttempt = userStatus.canAttempt !== undefined
      ? Boolean(userStatus.canAttempt)
      : (maxAttempts === null || maxAttempts === 0 || attemptCount < maxAttempts);

    return {
      ...quiz,
      completed,
      bestScore,
      resultVisibility,
      gradePendingRelease,
      attemptCount,
      canAttempt
    };
  },

  isQuizResultAvailable(record = {}) {
    const visibility = record.resultVisibility || {};
    return visibility.resultsAvailable !== false;
  },

  getQuizResultUnavailableLabel(record = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    const visibility = record.resultVisibility || {};
    if (record.gradePendingRelease || visibility.reason === 'grades_pending_release' || visibility.pendingRelease) {
      return t('moodleQuiz.pendingRelease');
    }
    if (visibility.reason === 'after_close') {
      return isEnglish ? 'Available after close' : '截止後公布';
    }
    if (visibility.reason === 'results_hidden') {
      return isEnglish ? 'Results hidden' : '不顯示結果';
    }
    return isEnglish ? 'Results unavailable' : '結果尚未開放';
  },

  isGradeReleasePending(record = {}) {
    return Boolean(record?.gradeVisibility?.pendingRelease || record?.visibility?.pendingRelease);
  },

  getCalendarEventDate(event = {}) {
    return event.startDate || event.start || event.dueDate || event.endDate || event.end || null;
  },

  toLocalDateKey(value) {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  getEventsForLocalDate(events = [], dateValue) {
    const dayKey = this.toLocalDateKey(dateValue);
    if (!dayKey) return [];
    return (Array.isArray(events) ? events : []).filter(event =>
      this.toLocalDateKey(this.getCalendarEventDate(event)) === dayKey
    );
  },

  getCalendarEventTypeLabel(type = '') {
    const labels = {
      assignment: '作業',
      quiz: '測驗',
      course: '課程',
      forum: '討論',
      personal: '個人'
    };
    return labels[type] || '事件';
  },

  handleCalendarEventClick(encodedType = '', encodedCourseId = '') {
    const eventType = decodeURIComponent(encodedType || '');
    const courseId = decodeURIComponent(encodedCourseId || '');

    this.closeModal('calendarDayEventsModal');

    if (eventType === 'assignment') {
      showView('moodleAssignments');
      this.loadAssignments(courseId || undefined);
      return;
    }

    if (eventType === 'quiz') {
      showView('moodleQuizzes');
      this.loadQuizzes(courseId || undefined);
      return;
    }

    if (eventType === 'forum') {
      showView('moodleForums');
      this.loadForums(courseId || undefined);
      return;
    }

    if (eventType === 'course') {
      showView('moodleCourses');
      if (courseId) {
        this.openCourse(courseId);
      } else {
        this.loadCourses();
      }
      return;
    }

    showView('moodleCalendar');
  },

  /**
   * 通用課程選擇器
   */
  async renderCoursePicker(title, icon, callbackFn, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    try {
      const isEnglish = I18n.getLocale() === 'en';
      const courses = await this.getRoleScopedCourses({
        manageOnly: this.isTeachingRole(),
        filters: { status: 'published' }
      });
      container.innerHTML = `
        <div class="activity-picker-page">
          <div class="activity-picker-header">
            <div class="activity-picker-title">
              <div class="activity-picker-icon">${icon}</div>
              <div class="activity-picker-copy">
                <h2>${this.escapeText(title)}</h2>
                <p>${isEnglish ? 'Choose a course to continue.' : '請選擇課程以瀏覽此功能。'}</p>
                <div class="activity-shell-meta">
                  <span class="activity-chip">${courses.length} ${isEnglish ? 'courses' : '門課程'}</span>
                </div>
              </div>
            </div>
          </div>
          ${courses.length === 0 ? this.renderActivityEmptyState({
            icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
            title: isEnglish ? 'No courses available' : '尚無課程',
            hint: isEnglish ? 'Join or create a course before using this area.' : '請先加入或建立課程後再查看這個功能。'
          }) : `
            <div class="activity-picker-grid">
              ${courses.map(c => this.renderActivityPickerCard(c, {
                action: `${callbackFn}(${this.toInlineActionValue(c.courseId || c.id)})`,
                ctaLabel: isEnglish ? 'Open' : '進入內容'
              })).join('')}
            </div>
          `}
        </div>
      `;
    } catch (error) {
      console.error('Render course picker error:', error);
      container.innerHTML = `<div class="error">載入課程失敗</div>`;
    }
  },

  getCoursePickerEyebrow(course = {}) {
    const locale = I18n.getLocale();
    const raw = course.subject || course.category || course.track || (locale === 'en' ? 'Published course' : '已發布課程');
    return this.getLocalizedCourseCategory(raw);
  },

  isInternalCourseIdentifier(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    return /^(course|crs|cls)_[a-z0-9]{6,}$/i.test(normalized) || /^COURSE#/i.test(normalized);
  },

  getCoursePickerCode(course = {}) {
    const title = String(course.title || course.name || '').trim().toLowerCase();
    const candidates = [course.courseCode, course.code, course.shortName, course.shortname];
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (!normalized) continue;
      if (this.isInternalCourseIdentifier(normalized)) continue;
      if (normalized.toLowerCase() === title) continue;
      return normalized;
    }
    return '';
  },

  renderActivityPickerCard(course = {}, options = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    const courseId = course.courseId || course.id || '';
    const title = course.title || course.name || (isEnglish ? 'Untitled course' : '未命名課程');
    const summary = options.summary
      || this.truncateText(course.summary || course.description || '', 120)
      || (isEnglish ? 'No course summary yet.' : '尚未提供課程摘要。');
    const eyebrow = options.eyebrow || this.getCoursePickerEyebrow(course);
    const code = options.code || this.getCoursePickerCode(course);
    const footerLabel = options.footerLabel || course.instructorName || course.teacherName || (isEnglish ? 'Course team' : '課程團隊');
    const ctaLabel = options.ctaLabel || (isEnglish ? 'Open' : '進入內容');
    const metaLabel = course.memberCount
      ? `${course.memberCount} ${isEnglish ? 'learners' : '位學習者'}`
      : (course.visibility === 'hide' ? (isEnglish ? 'Draft' : '草稿') : (isEnglish ? 'Published' : '已發布'));
    const showCode = code && String(code).trim() && String(code).trim() !== String(title).trim();

    return `
      <div class="activity-picker-card ${this.getSurfaceToneClass(courseId || title)}"
           onclick="${options.action}">
        <div class="activity-picker-card-accent">
          <div class="activity-picker-card-head">
            <span class="activity-picker-card-chip">${this.escapeText(eyebrow)}</span>
            ${showCode ? `<span class="activity-picker-card-code">${this.escapeText(code)}</span>` : ''}
          </div>
          <div class="activity-picker-card-hero">
            <h3 class="activity-picker-card-title">${this.escapeText(title)}</h3>
            <p class="activity-picker-card-kicker">${this.escapeText(footerLabel)}</p>
          </div>
        </div>
        <div class="activity-picker-card-body">
          <div class="activity-picker-card-copy">
            <p class="activity-picker-card-summary">${this.escapeText(summary)}</p>
          </div>
          <div class="activity-picker-card-footer">
            <span class="activity-picker-card-teacher">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${this.escapeText(metaLabel)}
            </span>
            <span class="activity-picker-card-link">
              <span>${this.escapeText(ctaLabel)}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
            </span>
          </div>
        </div>
      </div>
    `;
  },

  // ==================== 課程頁面 ====================

  /**
   * 載入課程列表
   */
  async loadCourses(filters = {}) {
    try {
      const courses = await this.getRoleScopedCourses({
        manageOnly: this.isTeachingRole(),
        filters
      });
      this.renderCourseGrid(courses);
    } catch (error) {
      console.error('Load courses error:', error);
      showToast(t('moodleCourse.loadFailed'));
    }
  },

  /**
   * 渲染課程網格
   */
  renderCourseGrid(courses) {
    const container = document.getElementById('moodleCourseGrid');
    if (!container) return;

    if (courses.length === 0) {
      container.innerHTML = this.renderActivityEmptyState({
        icon: '<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
        title: t('moodleCourse.noCourses'),
        hint: t('moodleCourse.waitForCourses')
      });
      return;
    }

    container.innerHTML = courses.map((course) => {
      const courseId = course.courseId || course.id || '';
      const title = this.escapeText(course.title || course.name || t('moodleCourse.untitledCourse'));
      const category = this.escapeText(this.getLocalizedCourseCategory(course.category));
      const courseCode = this.escapeText(this.getCoursePickerCode(course));
      const summary = this.escapeText(
        this.truncateText(course.description || course.summary || '', 140)
        || t('moodleCourse.noDescription')
      );
      const teacherName = this.escapeText(course.instructorName || course.teacherName || t('moodleCourse.teacher'));
      const learnersLabel = `${Number(course.enrollmentCount || course.enrolledCount || 0)} ${t('moodleCourse.students')}`;
      const progress = this.clampProgressValue(course.progress);

      return `
        <button type="button" class="moodle-course-card" onclick="MoodleUI.openCourse('${courseId}')">
          <div class="course-cover" data-cover-gradient="${this.escapeText(this.getCourseGradient(course.category))}">
            <div class="course-cover-top">
              <span class="course-category">${category}</span>
              ${course.isEnrolled ? `<span class="enrolled-badge">${t('moodleCourse.enrolled')}</span>` : ''}
            </div>
            <div class="course-cover-copy">
              <h3>${title}</h3>
              ${courseCode ? `<p>${courseCode}</p>` : ''}
            </div>
          </div>
          <div class="course-body">
            <h3 class="course-name">${title}</h3>
            <p class="course-summary">${summary}</p>
            <div class="course-meta">
              <span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a7.5 7.5 0 0115 0"/></svg>
                ${teacherName}
              </span>
              <span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                ${this.escapeText(learnersLabel)}
              </span>
              <span class="course-open-link">
                ${this.escapeText(I18n.getLocale() === 'en' ? 'Open course' : '進入課程')}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </span>
            </div>
            ${course.isEnrolled && course.progress !== undefined ? `
              <div class="course-progress">
                <div class="course-progress-bar">
                  <div class="progress-fill" data-progress-width="${progress}"></div>
                </div>
                <span class="progress-text">${progress}%</span>
              </div>
            ` : ''}
          </div>
        </button>
      `;
    }).join('');
    this.applyDynamicUiMetrics(container);
  },

  /**
   * 開啟課程頁面
   */
  async openCourse(courseId, options = {}) {
    try {
      const result = await API.courses.get(courseId);
      if (!result.success) {
        showToast(t('moodleCourse.loadFailed'));
        return;
      }

      const course = this.normalizeCourseRecord(result.data || {});
      this.currentCourse = course;
      this.currentCourseId = courseId;
      this.renderCoursePage(course);
      showView('courseDetail', {
        path: options.path || `/platform/course/${encodeURIComponent(courseId)}`,
        replaceHistory: options.replaceHistory
      });

      const requestedTab = String(options.tab || 'content').toLowerCase();
      if (requestedTab === 'participants' && this.canViewParticipants(course, API.getCurrentUser())) {
        if (this.canTeachCourse(course, API.getCurrentUser())) {
          await this.openCourseParticipantsWorkspace(courseId);
        } else {
          await this.switchCourseTab('participants');
        }
      } else {
        await this.switchCourseTab('content');
      }
    } catch (error) {
      console.error('Open course error:', error);
      showToast(t('moodleCourse.loadFailed'));
    }
  },

  /**
   * 渲染課程詳情頁面
   */
  renderCoursePage(course) {
    const container = document.getElementById('courseDetailContent');
    if (!container) return;

    const user = API.getCurrentUser();
    const canTeach = this.canTeachCourse(course, user);
    const canManage = this.canManageCourse(course, user);
    const canViewParticipants = this.canViewParticipants(course, user);
    const canViewReports = canTeach;
    const courseFormat = this.normalizeCourseFormat(course.format);
    const sections = Array.isArray(course.sections) ? course.sections : [];
    const sectionCount = sections.length;
    const activityCount = sections.reduce((sum, section) => sum + ((Array.isArray(section.activities) ? section.activities.length : 0)), 0);
    const courseTitle = course.title || course.name || t('moodleCourse.course');
    const categoryLabel = this.getLocalizedCourseCategory(course.category);
    const courseSummary = course.description || course.summary || (I18n.getLocale() === 'en' ? 'Explore lessons, activities, and progress for this course.' : '瀏覽這門課的學習內容、活動安排與學習進度。');
    const formatLabel = courseFormat === 'topics'
      ? t('moodleCourse.formatTopics')
      : courseFormat === 'weeks'
        ? t('moodleCourse.formatWeeks')
        : courseFormat === 'social'
          ? t('moodleCourse.formatSocial')
          : t('moodleCourse.formatSingle');
    const studentsLabel = `${course.enrollmentCount || course.enrolledCount || 0} ${t('moodleCourse.studentsCount')}`;
    const courseCode = course.shortName || course.code || course.courseCode || '';
    const participantsTabLabel = canTeach
      ? t('moodleCourse.tabParticipants')
      : (I18n.getLocale() === 'en' ? 'Members' : '成員');
    const courseDetailHref = this.getCourseDetailPath(course.courseId, 'content');
    const participantsHref = this.getCourseDetailPath(course.courseId, 'participants');
    const forumsHref = this.getPlatformViewPath('moodleForums', { courseId: course.courseId });
    const assignmentsHref = this.getPlatformViewPath('moodleAssignments', { courseId: course.courseId });
    const quizzesHref = this.getPlatformViewPath('moodleQuizzes', { courseId: course.courseId });
    const gradebookHref = this.getPlatformViewPath('moodleGradebook', { courseId: course.courseId });
    const analyticsHref = this.getPlatformViewPath('teacherAnalytics', { courseId: course.courseId });
    const courseMeta = [
      `${t('moodleCourse.teacherLabel')}：${course.instructorName || course.teacherName || t('moodleCourse.teacher')}`,
      studentsLabel,
      formatLabel,
      courseCode ? `${I18n.getLocale() === 'en' ? 'Code' : '代碼'}：${courseCode}` : ''
    ].filter(Boolean);
    const statCards = [
      {
        label: I18n.getLocale() === 'en' ? 'Sections' : '章節數',
        value: sectionCount
      },
      {
        label: I18n.getLocale() === 'en' ? 'Activities' : '活動數',
        value: activityCount
      },
      {
        label: I18n.getLocale() === 'en' ? 'Learners' : '學習者',
        value: course.enrollmentCount || course.enrolledCount || 0
      }
    ];

    container.innerHTML = `
      <!-- 課程頭部 -->
      <div class="course-header">
        <div class="course-hero">
          <a href="${this.escapeText(this.getPlatformViewPath('moodleCourses'))}" onclick="return openPlatformView(event, 'moodleCourses')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            ${t('moodleCourse.backToCourseList')}
          </a>
          <div class="course-hero-top">
            <div class="course-hero-badges">
              <span class="course-category-badge">${this.escapeText(categoryLabel)}</span>
              ${!canTeach && course.isEnrolled ? `<span class="course-enrolled-pill">${t('moodleCourse.enrolled')}</span>` : ''}
            </div>
            <span class="course-format-badge">${this.escapeText(formatLabel)}</span>
          </div>
          <div class="course-header-content">
            <div class="course-header-info">
              <p class="course-header-kicker">${I18n.getLocale() === 'en' ? 'Course overview' : '課程總覽'}</p>
              <h1>${this.escapeText(courseTitle)}</h1>
              <p>${this.escapeText(courseSummary)}</p>
              <div class="course-header-meta">
                ${courseMeta.map(item => `<span>${this.escapeText(item)}</span>`).join('')}
              </div>
            </div>
            <div class="course-header-actions">
              ${!course.isEnrolled && !canTeach ? `
                <button onclick="MoodleUI.enrollCourse('${course.courseId}')" class="btn-primary">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                  ${t('moodleCourse.enroll')}
                </button>
              ` : ''}
              ${canManage ? `
                <button onclick="MoodleUI.openCourseSettings('${course.courseId}')" class="btn-secondary">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  ${t('moodleCourse.courseSettings')}
                </button>
                <button onclick="MoodleUI.openAddSection('${course.courseId}')" class="btn-primary">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  ${t('moodleCourse.addSection')}
                </button>
              ` : ''}
            </div>
          </div>
          <div class="course-header-stat-grid">
            ${statCards.map((card) => `
              <div class="course-header-stat">
                <span class="course-header-stat-label">${this.escapeText(card.label)}</span>
                <span class="course-header-stat-value">${this.escapeText(card.value)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 課程導航標籤 -->
      <div class="course-nav-tabs">
        <a href="${this.escapeText(courseDetailHref)}" class="nav-tab active" data-course-tab="content" onclick="return MoodleUI.navigateCourseDetail(event, ${this.toInlineActionValue(course.courseId)}, 'content')">${t('moodleCourse.tabContent')}</a>
        ${canViewParticipants ? `<a href="${this.escapeText(participantsHref)}" class="nav-tab" data-course-tab="participants" onclick="return MoodleUI.navigateCourseDetail(event, ${this.toInlineActionValue(course.courseId)}, 'participants')">${participantsTabLabel}</a>` : ''}
        <a href="${this.escapeText(forumsHref)}" class="nav-tab" data-course-tab="forums" onclick="return MoodleUI.navigateCourseWorkspace(event, 'moodleForums', ${this.toInlineActionValue(course.courseId)})">${t('nav.classDiscussions')}</a>
        <a href="${this.escapeText(assignmentsHref)}" class="nav-tab" data-course-tab="assignments" onclick="return MoodleUI.navigateCourseWorkspace(event, 'moodleAssignments', ${this.toInlineActionValue(course.courseId)})">${t('moodleCourse.tabAssignments')}</a>
        <a href="${this.escapeText(quizzesHref)}" class="nav-tab" data-course-tab="quizzes" onclick="return MoodleUI.navigateCourseWorkspace(event, 'moodleQuizzes', ${this.toInlineActionValue(course.courseId)})">${t('moodleCourse.tabQuizzes')}</a>
        <a href="${this.escapeText(gradebookHref)}" class="nav-tab" data-course-tab="grades" onclick="return MoodleUI.navigateCourseWorkspace(event, 'moodleGradebook', ${this.toInlineActionValue(course.courseId)})">${t('moodleCourse.tabGrades')}</a>
        ${canViewReports ? `<a href="${this.escapeText(analyticsHref)}" class="nav-tab" data-course-tab="analytics" onclick="return MoodleUI.navigateCourseWorkspace(event, 'teacherAnalytics', ${this.toInlineActionValue(course.courseId)})">${t('moodleCourse.tabAnalytics')}</a>` : ''}
      </div>

      <!-- 課程內容區 -->
      <div id="courseContentPanel" class="course-panel active">
        ${this.renderCourseSections(sections, canManage, course.courseId)}
      </div>

      <!-- 參與者區 -->
      ${canViewParticipants ? `
      <div id="courseParticipantsPanel" class="course-panel">
        <div class="loading">${t('common.loading')}</div>
      </div>
      ` : ''}

      <!-- 成績區 -->
      <div id="courseGradesPanel" class="course-panel">
        <div class="loading">${t('common.loading')}</div>
      </div>

      <!-- 報表區 (教師) -->
      ${canViewReports ? `
      <div id="courseReportsPanel" class="course-panel">
        <div class="loading">${t('common.loading')}</div>
      </div>
      ` : ''}
    `;
    this.applyDynamicUiMetrics(container);
  },

  /**
   * 渲染課程章節
   */
  renderCourseSections(sections, isTeacher, courseId) {
    if (sections.length === 0) {
      return `
        <div class="empty-sections">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>
          </svg>
          <p>${t('moodleCourse.noContent')}</p>
          ${isTeacher ? `<p class="hint">${t('moodleCourse.addSectionHint')}</p>` : ''}
        </div>
      `;
    }

    return sections.map((section, index) => `
      <div class="course-section ${section.visible === false ? 'hidden-section' : ''}">
        <div class="section-header">
          <div class="section-header-main">
            <div class="section-kicker-row">
              <span class="section-kicker">${I18n.getLocale() === 'en' ? `Section ${index + 1}` : `章節 ${index + 1}`}</span>
              ${section.visible === false ? `<span class="section-state-chip">${I18n.getLocale() === 'en' ? 'Hidden' : '未顯示'}</span>` : ''}
            </div>
            <div class="section-info">
              <h2 class="section-title">${this.escapeText(section.name || section.title || `${t('moodleCourse.weekPrefix')} ${index + 1} ${t('moodleCourse.weekSuffix')}`)}</h2>
              ${section.summary ? `<p class="section-summary">${this.escapeText(section.summary)}</p>` : ''}
            </div>
          </div>
          <div class="section-header-side">
            <span class="section-meta-badge">${Array.isArray(section.activities) ? section.activities.length : 0} ${I18n.getLocale() === 'en' ? 'activities' : '個活動'}</span>
          ${isTeacher ? `
            <div class="section-actions">
              <button type="button" onclick="MoodleUI.openAddActivity('${courseId}', '${section.sectionId}')" class="btn-sm">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                ${t('moodleCourse.addActivity')}
              </button>
              <button type="button" onclick="MoodleUI.editSection('${courseId}', '${section.sectionId}')" class="btn-icon" aria-label="${this.escapeText(I18n.getLocale() === 'en' ? 'Edit section' : '編輯章節')}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
          ` : ''}</div>
        </div>
        <div class="section-activities">
          ${this.renderActivities(section.activities || [], isTeacher, courseId, section.sectionId)}
        </div>
      </div>
    `).join('');
  },

  /**
   * 渲染活動列表
   */
  renderActivities(activities, isTeacher, courseId, sectionId) {
    if (activities.length === 0) {
      return `<div class="no-activities">${t('moodleCourse.noActivities')}</div>`;
    }

    const activityIcons = {
      page: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>',
      url: '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
      file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
      interactive_video: '<rect x="3" y="4" width="18" height="13" rx="2"/><polygon points="10,8 16,11 10,14"/><path d="M7 20h10"/><path d="M9 17v3"/><path d="M15 17v3"/>',
      assignment: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
      quiz: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      forum: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
      label: '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>',
      lti: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/><circle cx="12" cy="12" r="3"/>'
    };

    const activityColors = {
      page: 'var(--olive)',
      url: '#6366f1',
      file: '#10b981',
      interactive_video: '#0ea5e9',
      assignment: 'var(--terracotta)',
      quiz: '#8b5cf6',
      forum: '#f59e0b',
      label: 'var(--gray-500)',
      lti: '#ec4899'
    };

    const typeLabels = {
      page: I18n.getLocale() === 'en' ? 'Page' : '頁面',
      url: I18n.getLocale() === 'en' ? 'Link' : '連結',
      file: I18n.getLocale() === 'en' ? 'File' : '檔案',
      interactive_video: I18n.getLocale() === 'en' ? 'Interactive Video' : '互動影片',
      assignment: I18n.getLocale() === 'en' ? 'Assignment' : '作業',
      quiz: I18n.getLocale() === 'en' ? 'Quiz' : '測驗',
      forum: I18n.getLocale() === 'en' ? 'Forum' : '討論區',
      label: I18n.getLocale() === 'en' ? 'Label' : '標籤',
      lti: 'LTI'
    };

    return activities.map((activity) => {
      const accentColor = activityColors[activity.type] || 'var(--gray-400)';
      const launchActivityId = activity.launchActivityId || activity.activityId;
      const managementActivityId = activity.courseActivityId || activity.activityId;
      const isBrokenLink = Boolean(activity.isBrokenLink) && !launchActivityId;
      const openAction = isBrokenLink
        ? `showToast(${this.toInlineActionValue(I18n.getLocale() === 'en' ? 'This activity link needs repair before it can be opened.' : '這個活動連結需要先修復，才能開啟。')})`
        : `MoodleUI.openActivity('${activity.type}', '${launchActivityId}', '${courseId}')`;
      const typeLabel = typeLabels[activity.type] || activity.type;
      const activityStateLabel = activity.completed
        ? t('moodleCourse.completed')
        : activity.visible === false
          ? (I18n.getLocale() === 'en' ? 'Hidden' : '未顯示')
          : (I18n.getLocale() === 'en' ? 'Available' : '可查看');
      return `
      <div class="activity-item ${activity.visible === false ? 'hidden-activity' : ''}">
        <button type="button" class="activity-item-main" onclick="${openAction}">
          <div class="activity-icon" data-accent-color="${this.escapeText(accentColor)}">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              ${activityIcons[activity.type] || activityIcons.page}
            </svg>
          </div>
          <div class="activity-info">
            <div class="activity-meta-row">
              <span class="activity-meta-chip">${this.escapeText(typeLabel)}</span>
              <span class="activity-meta-chip subtle">${this.escapeText(activityStateLabel)}</span>
              ${activity.dueDate ? `<span class="activity-meta-chip due">${t('moodleCourse.dueDate')} ${new Date(activity.dueDate).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')}</span>` : ''}
              ${activity.isBrokenLink ? `<span class="activity-meta-chip warning">${I18n.getLocale() === 'en' ? 'Needs repair' : '待修復'}</span>` : ''}
            </div>
            <span class="activity-name">${activity.name || activity.title}</span>
            ${activity.description ? `<span class="activity-desc">${activity.description}</span>` : ''}
            <span class="activity-open-chip">${isTeacher ? (I18n.getLocale() === 'en' ? 'Manage activity' : '管理活動') : (I18n.getLocale() === 'en' ? 'Open activity' : '開啟活動')} →</span>
          </div>
        </button>
        ${isTeacher ? `
          <div class="activity-actions" onclick="event.stopPropagation()">
            <button type="button" onclick="MoodleUI.editActivity('${courseId}', '${sectionId}', '${managementActivityId}')" class="btn-icon-sm" aria-label="${this.escapeText(I18n.getLocale() === 'en' ? 'Edit activity' : '編輯活動')}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button type="button" onclick="MoodleUI.deleteActivity('${courseId}', '${sectionId}', '${managementActivityId}')" class="btn-icon-sm danger" aria-label="${this.escapeText(I18n.getLocale() === 'en' ? 'Delete activity' : '刪除活動')}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        ` : ''}
      </div>
    `;
    }).join('');
  },

  /**
   * 切換課程標籤
   */
  async switchCourseTab(tab, tabButton = null) {
    // 更新標籤狀態
    document.querySelectorAll('.course-nav-tabs .nav-tab').forEach(t => t.classList.remove('active'));
    const activeTabButton = tabButton ||
      document.querySelector(`.course-nav-tabs .nav-tab[data-course-tab="${tab}"]`) ||
      globalThis.event?.currentTarget ||
      globalThis.event?.target;
    activeTabButton?.classList?.add('active');

    // 隱藏所有面板
    document.querySelectorAll('.course-panel').forEach(p => {
      p.hidden = true;
      p.classList.remove('active');
    });

    const panelId = `course${tab.charAt(0).toUpperCase() + tab.slice(1)}Panel`;
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.hidden = false;
      panel.classList.add('active');
    }

    // 載入對應資料
    if (tab === 'participants' && this.currentCourseId) {
      await this.loadParticipants(this.currentCourseId);
    } else if (tab === 'grades' && this.currentCourseId) {
      await this.loadGrades(this.currentCourseId);
    } else if ((tab === 'reports' || tab === 'analytics') && this.currentCourseId) {
      await this.loadCourseReports(this.currentCourseId);
    }
  },

  async openCourseParticipantsWorkspace(courseId = this.currentCourseId) {
    if (!courseId) return;

    const detailContent = document.getElementById('classDetailContent');
    if (!detailContent) return;

    try {
      const [courseResult, participantsResult, groupOverviewResult, inviteLinkResult] = await Promise.all([
        API.courses.get(courseId),
        API.courses.getParticipants(courseId),
        API.courseGroups.getOverview(courseId).catch(() => ({ success: false, data: null })),
        API.classes.getCourseInviteLink(courseId).catch(() => ({ success: false, data: null }))
      ]);

      if (!courseResult.success || !courseResult.data) {
        showToast(t('moodleCourse.loadFailed'));
        return;
      }

      this.currentCourseId = courseId;
      const course = this.normalizeCourseRecord(courseResult.data || {});
      this.currentCourse = course;
      const allParticipants = participantsResult.success && Array.isArray(participantsResult.data)
        ? participantsResult.data
        : [];
      const learnerRoles = new Set(['student', 'learner']);
      const learnerMembers = allParticipants
        .filter((participant) => learnerRoles.has(String(participant?.role || 'student').toLowerCase()))
        .map((participant) => ({
          userId: participant.userId || participant.id || '',
          displayName: participant.displayName || participant.userName || participant.name || (I18n.getLocale() === 'en' ? 'Learner' : '學員'),
          userName: participant.displayName || participant.userName || participant.name || (I18n.getLocale() === 'en' ? 'Learner' : '學員'),
          userEmail: participant.email || participant.userEmail || '',
          email: participant.email || participant.userEmail || '',
          enrolledAt: participant.enrolledAt || participant.joinedAt || null,
          joinedAt: participant.enrolledAt || participant.joinedAt || null,
          progress: Number(participant.progress ?? participant.progressPercentage ?? 0) || 0,
          lastAccess: participant.lastAccessAt || participant.lastAccessedAt || participant.lastAccess || null,
          role: 'student',
          studentId: participant.studentId || participant.userId || participant.id || ''
        }));

      const groupOverview = groupOverviewResult.success ? (groupOverviewResult.data || {}) : null;
      const inviteLink = inviteLinkResult.success ? (inviteLinkResult.data || null) : null;

      detailContent.innerHTML = this.renderCourseParticipantsWorkspace({
        course,
        learnerMembers,
        groupOverview,
        inviteLink
      });
      this.applyDynamicUiMetrics(detailContent);

      this.setSidebarActiveView('classes');
      showView('classDetail');
    } catch (error) {
      console.error('Open course participants workspace error:', error);
      showToast(t('moodleParticipant.loadFailed'));
    }
  },

  renderCourseParticipantsWorkspace({ course, learnerMembers, groupOverview, inviteLink }) {
    const isEnglish = I18n.getLocale() === 'en';
    const courseTitle = course.title || course.name || t('moodleCourse.course');
    const courseCategory = this.getLocalizedCourseCategory(course.category) || (isEnglish ? 'Course' : '課程');
    const instructorName = course.instructorName || course.teacherName || t('moodleCourse.teacher');
    const courseCode = course.shortName || course.code || course.courseCode || '';
    const totalStudents = learnerMembers.length;
    const totalGroups = Number(groupOverview?.totalGroups || 0);
    const groupedStudents = Number(groupOverview?.groupedStudents || 0);
    const ungroupedStudents = Array.isArray(groupOverview?.ungrouped)
      ? groupOverview.ungrouped.length
      : Math.max(totalStudents - groupedStudents, 0);
    const inviteActive = (inviteLink?.status || 'active') === 'active';

    return `
      <div class="management-detail-page course-roster-workspace">
        <div class="course-roster-toolbar">
          <button type="button" class="management-back-link" onclick="MoodleUI.setSidebarActiveView('classes'); showView('classes');">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            <span>${isEnglish ? 'Back to My Students' : '返回我的學生'}</span>
          </button>
          <div class="management-inline-actions">
            <button type="button" class="bridge-secondary-btn" onclick="MoodleUI.openCourse(${this.toInlineActionValue(course.courseId)})">
              ${isEnglish ? 'Open Course' : '查看課程'}
            </button>
          </div>
        </div>

        <section class="course-header course-roster-hero">
          <div class="course-hero">
            <div class="course-hero-top">
              <div class="management-heading">
                <span class="course-header-kicker">${isEnglish ? 'Student roster' : '學生名單'}</span>
                <h2 class="course-roster-title">${this.escapeText(courseTitle)}</h2>
                <p class="course-roster-copy">${this.escapeText(
                  isEnglish
                    ? 'Manage the roster, invite code, and learner groups for this course from one unified workspace.'
                    : '在同一個工作區管理這門課的學生名單、邀請碼與分組設定。'
                )}</p>
              </div>
            </div>
            <div class="course-hero-badges">
              <span class="course-hero-badge">${this.escapeText(courseCategory)}</span>
              <span class="course-hero-badge">${this.escapeText(instructorName)}</span>
              ${courseCode ? `<span class="course-hero-badge">${this.escapeText(courseCode)}</span>` : ''}
              ${inviteLink?.inviteCode ? `<span class="course-hero-badge">${this.escapeText(inviteActive ? (isEnglish ? 'Invite active' : '邀請碼啟用中') : (isEnglish ? 'Invite inactive' : '邀請碼已停用'))}</span>` : ''}
            </div>
          </div>
        </section>

        <div class="management-metric-grid course-roster-metrics">
          <article class="management-metric-card">
            <div class="management-metric-value">${totalStudents}</div>
            <div class="management-metric-label">${isEnglish ? 'Learners' : '學生數'}</div>
            <div class="management-metric-helper">${isEnglish ? 'Currently enrolled in this course' : '目前已加入這門課的學生'}</div>
          </article>
          <article class="management-metric-card tone-info">
            <div class="management-metric-value">${totalGroups}</div>
            <div class="management-metric-label">${isEnglish ? 'Groups' : '群組數'}</div>
            <div class="management-metric-helper">${isEnglish ? 'Group structures available' : '目前可用的分組數量'}</div>
          </article>
          <article class="management-metric-card ${ungroupedStudents > 0 ? 'tone-warning' : 'tone-info'}">
            <div class="management-metric-value">${ungroupedStudents}</div>
            <div class="management-metric-label">${isEnglish ? 'Ungrouped learners' : '未分組學生'}</div>
            <div class="management-metric-helper">${isEnglish ? 'Learners still waiting for grouping' : '尚未安排到群組的學生'}</div>
          </article>
          <article class="management-metric-card ${inviteActive ? 'tone-info' : 'tone-danger'}">
            <div class="management-metric-value">${inviteActive ? (isEnglish ? 'On' : '啟用') : (isEnglish ? 'Off' : '停用')}</div>
            <div class="management-metric-label">${isEnglish ? 'Invite code' : '邀請碼狀態'}</div>
            <div class="management-metric-helper">${this.escapeText(
              inviteLink?.inviteCode
                ? (inviteActive
                  ? (isEnglish ? 'Learners can register with this code' : '學生目前可使用通行碼加入')
                  : (isEnglish ? 'Registration via code is paused' : '通行碼加入目前已暫停'))
                : (isEnglish ? 'No invite code configured yet' : '目前還沒有可用通行碼')
            )}</div>
          </article>
        </div>

        <div class="course-roster-layout">
          <section class="management-card course-roster-main-card">
            <div class="course-roster-card-head">
              <div class="management-heading">
                <span class="participants-directory-kicker">${isEnglish ? 'Roster' : '名單總覽'}</span>
                <div class="management-title">${isEnglish ? 'Learner roster' : '學生名單'}</div>
                <p class="management-copy">${isEnglish ? 'Review each learner’s join date, progress, and recent activity.' : '查看每位學生的加入日期、學習進度與最近活動。'}</p>
              </div>
              <span class="participants-directory-count">${this.escapeText(`${totalStudents} ${isEnglish ? 'learners' : '位學生'}`)}</span>
            </div>
            <div class="course-roster-card-body">
              ${this.renderParticipantsList(learnerMembers)}
            </div>
          </section>

          <div class="course-roster-side">
            ${this.renderCourseInviteCodeSection(inviteLink)}
            ${this.renderCourseGroupManagementSection(course.courseId, groupOverview)}
          </div>
        </div>
      </div>
    `;
    this.applyDynamicUiMetrics(container);
  },

  renderCourseInviteCodeSection(inviteLink = null) {
    if (!inviteLink?.inviteCode) return '';

    const isEnglish = I18n.getLocale() === 'en';
    const inviteCode = this.escapeText(inviteLink.inviteCode);
    const isActive = (inviteLink.status || 'active') === 'active';
    const classId = inviteLink.classId || '';

    return `
      <section class="management-card course-roster-side-card">
        <div class="course-roster-side-card-body">
          <div class="section-title-row">
            <div class="management-heading">
              <span class="participants-directory-kicker">${isEnglish ? 'Invite code' : '邀請碼'}</span>
              <div class="management-title">${isEnglish ? 'Student registration code' : '學生註冊通行碼'}</div>
              <p class="management-copy">${isEnglish ? 'Share this code with learners. Registration or join-by-code will add them to this class and enroll them in the course automatically.' : '把這組通行碼提供給學生。學生註冊或加入後，會自動進入這堂課的班級與課程。'}</p>
            </div>
            <span class="management-status-badge ${isActive ? 'is-success' : 'is-warning'}">${this.escapeText(isActive ? (isEnglish ? 'Active' : '啟用中') : (isEnglish ? 'Inactive' : '已停用'))}</span>
          </div>
          <div class="management-inline-actions">
            <div class="bridge-detail-chip">
              <div class="bridge-detail-chip-body">
                <span class="bridge-detail-chip-label">${isEnglish ? 'Code' : '通行碼'}</span>
                <strong class="bridge-detail-chip-value">${inviteCode}</strong>
              </div>
              <button type="button" class="bridge-detail-icon-btn is-subtle" onclick="MoodleUI.copyInviteCode(${this.toInlineActionValue(inviteLink.inviteCode)})" aria-label="${this.escapeText(isEnglish ? 'Copy invite code' : '複製邀請碼')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
          </div>
          <div class="management-inline-actions course-roster-side-actions">
            <button type="button" class="bridge-secondary-btn" onclick="MoodleUI.regenerateCourseInviteCode(${this.toInlineActionValue(classId)}, ${this.toInlineActionValue(inviteLink.courseId || this.currentCourseId)})">
              ${isEnglish ? 'Regenerate' : '重發通行碼'}
            </button>
            <button type="button" class="bridge-secondary-btn" onclick="MoodleUI.setCourseInviteCodeStatus(${this.toInlineActionValue(classId)}, ${this.toInlineActionValue(isActive ? 'inactive' : 'active')}, ${this.toInlineActionValue(inviteLink.courseId || this.currentCourseId)})">
              ${isActive ? (isEnglish ? 'Disable' : '停用') : (isEnglish ? 'Enable' : '啟用')}
            </button>
          </div>
        </div>
      </section>
    `;
  },

  async copyInviteCode(code = '') {
    if (!code) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(code));
      } else {
        const fallback = document.createElement('textarea');
        fallback.value = String(code);
        fallback.setAttribute('readonly', 'readonly');
        fallback.style.position = 'absolute';
        fallback.style.left = '-9999px';
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand('copy');
        fallback.remove();
      }
      showToast(I18n.getLocale() === 'en' ? 'Invite code copied' : '邀請碼已複製');
    } catch (error) {
      console.error('Copy invite code error:', error);
      showToast(I18n.getLocale() === 'en' ? 'Failed to copy invite code' : '複製邀請碼失敗');
    }
  },

  async regenerateCourseInviteCode(classId, courseId = this.currentCourseId) {
    if (!classId || !courseId) return;

    const confirmed = await showConfirmDialog({
      message: I18n.getLocale() === 'en'
        ? 'Generate a new invite code for this course? The old code will stop working.'
        : '確定要為這堂課重發新的通行碼嗎？舊的通行碼將失效。',
      confirmLabel: I18n.getLocale() === 'en' ? 'Regenerate' : '重發'
    });
    if (!confirmed) return;

    try {
      const result = await API.classes.regenerateInviteCode(classId);
      if (!result?.success) {
        showToast(result?.message || (I18n.getLocale() === 'en' ? 'Failed to update invite code' : '更新邀請碼失敗'));
        return;
      }

      showToast(I18n.getLocale() === 'en' ? 'Invite code updated' : '通行碼已更新');
      await this.openCourseParticipantsWorkspace(courseId);
    } catch (error) {
      console.error('Regenerate invite code error:', error);
      showToast(I18n.getLocale() === 'en' ? 'Failed to update invite code' : '更新邀請碼失敗');
    }
  },

  async setCourseInviteCodeStatus(classId, status, courseId = this.currentCourseId) {
    if (!classId || !status || !courseId) return;

    const isEnabling = status === 'active';
    const confirmed = await showConfirmDialog({
      message: isEnabling
        ? (I18n.getLocale() === 'en'
          ? 'Enable this invite code so learners can register again?'
          : '確定要啟用這組通行碼，讓學生可以再次使用嗎？')
        : (I18n.getLocale() === 'en'
          ? 'Disable this invite code so new learners cannot use it?'
          : '確定要停用這組通行碼，讓新學生無法再使用嗎？'),
      confirmLabel: isEnabling
        ? (I18n.getLocale() === 'en' ? 'Enable' : '啟用')
        : (I18n.getLocale() === 'en' ? 'Disable' : '停用')
    });
    if (!confirmed) return;

    try {
      const result = await API.classes.updateInviteCodeStatus(classId, status);
      if (!result?.success) {
        showToast(result?.message || (I18n.getLocale() === 'en' ? 'Failed to update invite code status' : '更新通行碼狀態失敗'));
        return;
      }

      showToast(isEnabling
        ? (I18n.getLocale() === 'en' ? 'Invite code enabled' : '通行碼已啟用')
        : (I18n.getLocale() === 'en' ? 'Invite code disabled' : '通行碼已停用'));
      await this.openCourseParticipantsWorkspace(courseId);
    } catch (error) {
      console.error('Update invite code status error:', error);
      showToast(I18n.getLocale() === 'en' ? 'Failed to update invite code status' : '更新通行碼狀態失敗');
    }
  },

  renderCourseGroupManagementSection(courseId, overview = null) {
    const isEnglish = I18n.getLocale() === 'en';
    if (!overview) {
      return `
        <section class="management-card course-roster-side-card">
          <div class="course-roster-side-card-body">
            <div class="management-heading">
              <span class="participants-directory-kicker">${isEnglish ? 'Groups' : '分組'}</span>
              <div class="management-title">${isEnglish ? 'Group management' : '分組管理'}</div>
              <p class="management-copy">${isEnglish ? 'Group data is temporarily unavailable for this course.' : '這門課的分組資料目前暫時無法載入。'}</p>
            </div>
          </div>
        </section>
      `;
    }

    const groups = Array.isArray(overview.groups) ? overview.groups : [];
    const ungrouped = Array.isArray(overview.ungrouped) ? overview.ungrouped : [];
    const selectOptions = ungrouped.map((student) => `
      <option value="${this.escapeText(student.userId || '')}">
        ${this.escapeText(student.displayName || (isEnglish ? 'Learner' : '學生'))}${student.email ? ` · ${this.escapeText(student.email)}` : ''}
      </option>
    `).join('');

    return `
      <section class="management-card course-roster-side-card">
        <div class="course-roster-side-card-body">
          <div class="section-title-row">
            <div class="management-heading">
              <span class="participants-directory-kicker">${isEnglish ? 'Groups' : '分組'}</span>
              <div class="management-title">${isEnglish ? 'Group management' : '分組管理'}</div>
              <p class="management-copy">${isEnglish ? 'Create learner groups and assign students directly from this roster workspace.' : '直接在這個學生名單工作區建立群組並安排學生。'}</p>
            </div>
            <div class="management-inline-actions">
              <span class="management-status-badge is-accent">${this.escapeText(`${groups.length} ${isEnglish ? 'groups' : '個群組'}`)}</span>
              <button type="button" class="bridge-primary-btn" onclick="MoodleUI.createCourseGroupPrompt(${this.toInlineActionValue(courseId)})">
                ${isEnglish ? 'Create group' : '新增群組'}
              </button>
            </div>
          </div>

          <div class="course-group-summary">
            <div class="course-group-summary-copy">
              ${isEnglish
                ? `Grouped ${overview.groupedStudents || 0} of ${overview.totalStudents || 0} learners.`
                : `已分組 ${overview.groupedStudents || 0} / ${overview.totalStudents || 0} 位學生。`}
            </div>
            <div class="course-group-summary-badges">
              <span class="management-status-badge is-accent">${this.escapeText(`${overview.totalGroups || 0} ${isEnglish ? 'groups' : '群組'}`)}</span>
              <span class="management-status-badge ${ungrouped.length > 0 ? 'is-warning' : 'is-success'}">${this.escapeText(`${ungrouped.length} ${isEnglish ? 'ungrouped' : '未分組'}`)}</span>
            </div>
          </div>

          ${groups.length === 0 ? `
            <div class="course-group-empty">${isEnglish ? 'No groups yet. Create your first group to start organizing this course roster.' : '目前還沒有群組，建立第一個群組後就能開始整理這門課的學生名單。'}</div>
          ` : `
            <div class="group-grid">
              ${groups.map((group) => {
                  const members = Array.isArray(group.members) ? group.members : [];
                  const selectId = `course-group-select-${courseId}-${group.groupId}`;
                  return `
                    <article class="management-card group-card">
                      <div class="group-card-surface">
                        <div class="group-card-header">
                          <div class="management-heading">
                            <div class="group-card-title">${this.escapeText(group.name || (isEnglish ? 'Untitled group' : '未命名群組'))}</div>
                            <div class="group-card-description">${this.escapeText(group.description || (isEnglish ? 'Use this group to cluster learners for discussions or collaborative work.' : '可用於討論、小組合作或課堂分流。'))}</div>
                          </div>
                          <span class="group-member-badge">${this.escapeText(`${members.length} ${isEnglish ? 'members' : '位成員'}`)}</span>
                        </div>

                        <div class="course-group-members">
                          ${members.length ? members.map((member) => `
                            <div class="course-group-member-chip">
                              <div class="course-group-member-copy">
                                <strong>${this.escapeText(member.displayName || (isEnglish ? 'Learner' : '學生'))}</strong>
                                <span>${this.escapeText(member.email || '')}</span>
                              </div>
                              <button type="button" class="bridge-member-remove" onclick="MoodleUI.removeCourseGroupMember(${this.toInlineActionValue(courseId)}, ${this.toInlineActionValue(group.groupId)}, ${this.toInlineActionValue(member.userId)})">
                                ${isEnglish ? 'Remove' : '移出'}
                              </button>
                            </div>
                          `).join('') : `
                            <div class="course-group-empty">${isEnglish ? 'No learners assigned to this group yet.' : '這個群組目前還沒有學生。'}</div>
                          `}
                        </div>

                        <div class="management-inline-actions">
                          ${ungrouped.length ? `
                            <div class="course-group-inline-form">
                              <select id="${this.escapeText(selectId)}" class="course-group-select">
                                <option value="">${isEnglish ? 'Select an ungrouped learner' : '選擇未分組學生'}</option>
                                ${selectOptions}
                              </select>
                              <button type="button" class="btn-sm" onclick="MoodleUI.addCourseGroupMember(${this.toInlineActionValue(courseId)}, ${this.toInlineActionValue(group.groupId)}, document.getElementById(${this.toInlineActionValue(selectId)})?.value)">
                                ${isEnglish ? 'Add to group' : '加入群組'}
                              </button>
                            </div>
                          ` : `
                            <span class="management-status-badge is-success">${isEnglish ? 'All learners grouped' : '所有學生都已分組'}</span>
                          `}
                          <button type="button" class="btn-sm btn-danger" onclick="MoodleUI.deleteCourseGroup(${this.toInlineActionValue(courseId)}, ${this.toInlineActionValue(group.groupId)})">
                            ${isEnglish ? 'Delete group' : '刪除群組'}
                          </button>
                        </div>
                      </div>
                    </article>
                  `;
                }).join('')}
            </div>
          `}
        </div>
      </section>
    `;
  },

  async createCourseGroupPrompt(courseId) {
    const isEnglish = I18n.getLocale() === 'en';
    const name = await showPromptDialog({
      title: isEnglish ? 'Create group' : '新增群組',
      message: isEnglish ? 'Enter a group name for this course.' : '請輸入這門課的群組名稱。',
      confirmLabel: isEnglish ? 'Create' : '建立'
    });
    if (!name) return;

    try {
      const result = await API.courseGroups.create(courseId, { name });
      if (!result.success) {
        showToast(result.message || (isEnglish ? 'Failed to create group.' : '建立群組失敗。'));
        return;
      }
      showToast(isEnglish ? 'Group created.' : '群組已建立。');
      await this.openCourseParticipantsWorkspace(courseId);
    } catch (error) {
      console.error('Create course group error:', error);
      showToast(isEnglish ? 'Failed to create group.' : '建立群組失敗。');
    }
  },

  async addCourseGroupMember(courseId, groupId, userId) {
    const isEnglish = I18n.getLocale() === 'en';
    if (!userId) {
      showToast(isEnglish ? 'Select a learner first.' : '請先選擇學生。');
      return;
    }

    try {
      const result = await API.courseGroups.addMember(courseId, groupId, userId);
      if (!result.success) {
        showToast(result.message || (isEnglish ? 'Failed to add learner to this group.' : '加入群組失敗。'));
        return;
      }
      showToast(isEnglish ? 'Learner added to group.' : '已加入群組。');
      await this.openCourseParticipantsWorkspace(courseId);
    } catch (error) {
      console.error('Add course group member error:', error);
      showToast(isEnglish ? 'Failed to add learner to this group.' : '加入群組失敗。');
    }
  },

  async removeCourseGroupMember(courseId, groupId, userId) {
    const isEnglish = I18n.getLocale() === 'en';
    const confirmed = await showConfirmDialog({
      message: isEnglish ? 'Remove this learner from the group?' : '要把這位學生移出群組嗎？',
      confirmLabel: isEnglish ? 'Remove' : '移出',
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.courseGroups.removeMember(courseId, groupId, userId);
      if (!result.success) {
        showToast(result.message || (isEnglish ? 'Failed to remove learner from this group.' : '移出群組失敗。'));
        return;
      }
      showToast(isEnglish ? 'Learner removed from group.' : '已移出群組。');
      await this.openCourseParticipantsWorkspace(courseId);
    } catch (error) {
      console.error('Remove course group member error:', error);
      showToast(isEnglish ? 'Failed to remove learner from this group.' : '移出群組失敗。');
    }
  },

  async deleteCourseGroup(courseId, groupId) {
    const isEnglish = I18n.getLocale() === 'en';
    const confirmed = await showConfirmDialog({
      message: isEnglish ? 'Delete this group? Learners will become ungrouped.' : '要刪除這個群組嗎？刪除後學生會回到未分組狀態。',
      confirmLabel: isEnglish ? 'Delete' : '刪除',
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.courseGroups.delete(courseId, groupId);
      if (!result.success) {
        showToast(result.message || (isEnglish ? 'Failed to delete group.' : '刪除群組失敗。'));
        return;
      }
      showToast(isEnglish ? 'Group deleted.' : '群組已刪除。');
      await this.openCourseParticipantsWorkspace(courseId);
    } catch (error) {
      console.error('Delete course group error:', error);
      showToast(isEnglish ? 'Failed to delete group.' : '刪除群組失敗。');
    }
  },

  async openCourseForums(courseId = this.currentCourseId) {
    const targetCourseId = courseId || this.currentCourseId || this.currentForumCourseId;
    this.setSidebarActiveView('moodleForums');
    showView('moodleForums');

    if (targetCourseId) {
      await this.loadForums(targetCourseId);
      return;
    }

    await this.loadForums();
  },

  async openCourseAssignmentsWorkspace(courseId = this.currentCourseId) {
    const targetCourseId = courseId || this.currentCourseId || this.currentAssignmentCourseId;
    this.setSidebarActiveView('moodleAssignments');
    showView('moodleAssignments');
    await this.loadAssignments(targetCourseId);
  },

  async openCourseQuizzesWorkspace(courseId = this.currentCourseId) {
    const targetCourseId = courseId || this.currentCourseId || this.currentQuizCourseId;
    this.setSidebarActiveView('moodleQuizzes');
    showView('moodleQuizzes');
    await this.loadQuizzes(targetCourseId);
  },

  async openCourseGradebookWorkspace(courseId = this.currentCourseId) {
    const targetCourseId = courseId || this.currentCourseId;
    this.setSidebarActiveView('moodleGradebook');
    showView('moodleGradebook');
    await this.loadGradebookForCourse(targetCourseId);
  },

  async openCourseAnalyticsWorkspace(courseId = this.currentCourseId) {
    const targetCourseId = courseId || this.currentCourseId;
    this.setSidebarActiveView('teacherAnalytics');
    await this.openTeacherAnalytics(targetCourseId);
  },

  async openCourseReportsWorkspace(courseId = this.currentCourseId) {
    await this.openCourseAnalyticsWorkspace(courseId);
  },

  /**
   * 報名課程
   */
  async enrollCourse(courseId) {
    // 檢查是否需要報名密碼
    if (this.currentCourse?.enrollmentKey) {
      const key = await showPromptDialog({
        title: t('common.confirm'),
        message: t('moodleEnroll.enterKey'),
        confirmLabel: t('common.confirm'),
        placeholder: t('moodleEnroll.enterKey')
      });
      if (!key) return;

      try {
        const result = await API.courses.enroll(courseId, key);
        if (result.success) {
          showToast(t('moodleEnroll.success'));
          this.openCourse(courseId); // 重新載入
        } else {
          showToast(result.message || t('moodleEnroll.failed'));
        }
      } catch (error) {
        console.error('Enroll error:', error);
        showToast(t('moodleEnroll.failed'));
      }
    } else {
      try {
        const result = await API.courses.enroll(courseId);
        if (result.success) {
          showToast(t('moodleEnroll.success'));
          this.openCourse(courseId);
        } else {
          showToast(result.message || t('moodleEnroll.failed'));
        }
      } catch (error) {
        console.error('Enroll error:', error);
        showToast(t('moodleEnroll.failed'));
      }
    }
  },

  /**
   * 載入參與者
   */
  async loadParticipants(courseId) {
    const panel = document.getElementById('courseParticipantsPanel');
    if (!panel) return;

    if (!this.canViewParticipants(this.currentCourse, API.getCurrentUser())) {
      panel.innerHTML = `<div class="error">${I18n.getLocale() === 'en' ? 'You do not have permission to view participants.' : '你沒有權限查看課程參與者。'}</div>`;
      return;
    }

    try {
      const result = await API.courses.getParticipants(courseId);
      if (result.success) {
        const participants = result.data || [];
        panel.innerHTML = this.renderParticipantsList(participants);
        this.applyDynamicUiMetrics(panel);
      }
    } catch (error) {
      console.error('Load participants error:', error);
      panel.innerHTML = `<div class="error">${t('moodleParticipant.loadFailed')}</div>`;
    }
  },

  /**
   * 渲染參與者列表
   */
  renderParticipantsList(participants) {
    if (participants.length === 0) {
      return this.renderActivityEmptyState({
        icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
        title: t('moodleParticipant.noParticipants')
      });
    }

    const teacherView = this.canTeachCourse(this.currentCourse, API.getCurrentUser());
    const isEnglish = I18n.getLocale() === 'en';
    const roleLabelMap = {
      student: isEnglish ? 'Learner' : '學習者',
      learner: isEnglish ? 'Learner' : '學習者',
      teacher: isEnglish ? 'Instructor' : '教師',
      instructor: isEnglish ? 'Instructor' : '教師',
      admin: isEnglish ? 'Administrator' : '管理員'
    };

    if (!teacherView) {
      const sortedParticipants = [...participants].sort((a, b) => {
        const aRole = String(a.role || 'student').toLowerCase();
        const bRole = String(b.role || 'student').toLowerCase();
        const aPriority = ['instructor', 'teacher', 'admin'].includes(aRole) ? 0 : 1;
        const bPriority = ['instructor', 'teacher', 'admin'].includes(bRole) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aName = String(a.displayName || a.userName || '').trim();
        const bName = String(b.displayName || b.userName || '').trim();
        return aName.localeCompare(bName, isEnglish ? 'en' : 'zh-Hant');
      });

      return `
        <div class="participants-list">
          <div class="participants-directory-shell">
            <div class="participants-directory-header">
              <div class="participants-directory-copy">
                <span class="participants-directory-kicker">${isEnglish ? 'Course members' : '課程成員'}</span>
                <h3 class="participants-directory-title">${isEnglish ? 'Learn with this cohort' : '和這群成員一起學習'}</h3>
                <p class="participants-directory-desc">${isEnglish ? 'See the instructor and learners currently enrolled in this course.' : '查看目前加入這門課的教師與學員名單。'}</p>
              </div>
              <span class="participants-directory-count">${this.escapeText(`${sortedParticipants.length} ${isEnglish ? 'members' : '位成員'}`)}</span>
            </div>
            <div class="participants-directory-grid">
              ${sortedParticipants.map((participant) => {
                const roleKey = String(participant.role || 'student').toLowerCase();
                const roleLabel = roleLabelMap[roleKey] || (isEnglish ? 'Learner' : '學習者');
                const joinedText = participant.enrolledAt
                  ? (isEnglish
                    ? `Joined ${this.escapeText(this.formatPlatformDate(participant.enrolledAt, { year: 'numeric', month: 'short', day: 'numeric' }) || '')}`
                    : `加入課程 ${this.escapeText(this.formatPlatformDate(participant.enrolledAt, { year: 'numeric', month: 'numeric', day: 'numeric' }) || '')}`)
                  : (isEnglish ? 'Course member' : '課程成員');
                const avatarText = this.escapeText(((participant.displayName || participant.userName || roleLabel).trim().charAt(0) || roleLabel.charAt(0)).toUpperCase());

                return `
                  <article class="participants-member-card">
                    <div class="participants-member-avatar">${avatarText}</div>
                    <div class="participants-member-copy">
                      <strong>${this.escapeText(participant.displayName || participant.userName || (isEnglish ? 'Learner' : '學員'))}</strong>
                      <span class="participants-member-role">${this.escapeText(roleLabel)}</span>
                      <span class="participants-member-meta">${joinedText}</span>
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="participants-list">
        <div class="participants-table-shell">
        <table class="data-table participants-table">
          <thead>
            <tr>
              <th>${t('moodleParticipant.student')}</th>
              <th>${t('moodleParticipant.email')}</th>
              <th>${t('moodleParticipant.enrollDate')}</th>
              <th>${t('moodleParticipant.progress')}</th>
              <th>${t('moodleParticipant.lastAccess')}</th>
            </tr>
          </thead>
          <tbody>
            ${participants.map((p) => {
              const roleKey = String(p.role || 'student').toLowerCase();
              const roleLabel = roleLabelMap[roleKey] || (isEnglish ? 'Learner' : '學習者');

              return `
                <tr class="participant-row">
                  <td>
                    <div class="user-cell">
                      <div class="user-avatar">${(p.displayName || p.userName || t('moodleParticipant.defaultAvatar'))[0]}</div>
                      <div class="participant-name-stack">
                        <strong>${this.escapeText(p.displayName || p.userName || t('moodleParticipant.defaultName'))}</strong>
                        <span>${this.escapeText(p.studentId || p.userId || p.email || '-')}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="participant-meta-stack">
                      <span>${this.escapeText(p.email || p.userEmail || '-')}</span>
                      <span class="participant-role-chip">${this.escapeText(roleLabel)}</span>
                    </div>
                  </td>
                  <td>
                    <div class="participant-date-stack">
                      <strong>${p.enrolledAt ? this.escapeText(new Date(p.enrolledAt).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')) : '-'}</strong>
                      <span>${I18n.getLocale() === 'en' ? 'Joined course' : '加入課程'}</span>
                    </div>
                  </td>
                  <td>
                    <div class="participant-progress-cell">
                      <div class="mini-progress">
                        <div class="mini-progress-fill" data-progress-width="${this.clampProgressValue(p.progress || 0)}"></div>
                      </div>
                      <span class="progress-text-sm">${p.progress || 0}%</span>
                    </div>
                  </td>
                  <td>
                    <div class="participant-date-stack">
                      <strong>${p.lastAccess ? this.escapeText(new Date(p.lastAccess).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')) : this.escapeText(t('moodleParticipant.never'))}</strong>
                      <span>${I18n.getLocale() === 'en' ? 'Last seen' : '最近活動'}</span>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        </div>
      </div>
    `;
    this.applyDynamicUiMetrics(container);
  },

  /**
   * 載入成績
   */
  async loadGrades(courseId) {
    const panel = document.getElementById('courseGradesPanel');
    if (!panel) return;

    const user = API.getCurrentUser();
    const isTeacher = this.canTeachCourse(this.currentCourse, user);

    try {
      let result;
      if (isTeacher) {
        result = await API.gradebook.getCourseGradebook(courseId);
      } else {
        result = await API.gradebook.getMyGrades(courseId);
      }

      if (result.success) {
        if (isTeacher) {
          panel.innerHTML = this.renderTeacherGradebook(result.data);
        } else {
          panel.innerHTML = this.renderStudentGrades(result.data);
        }
      }
    } catch (error) {
      console.error('Load grades error:', error);
      panel.innerHTML = `<div class="error">${t('moodleGrade.loadFailed')}</div>`;
    }
  },

  async loadCourseReports(courseId) {
    const panel = document.getElementById('courseReportsPanel');
    if (!panel) return;

    if (!this.canTeachCourse(this.currentCourse, API.getCurrentUser())) {
      panel.innerHTML = `<div class="error">${I18n.getLocale() === 'en' ? 'You do not have permission to view reports.' : '你沒有權限查看課程報表。'}</div>`;
      return;
    }

    try {
      const result = await API.courseCompletion.getReport(courseId);
      if (!result.success) {
        panel.innerHTML = `<div class="error">${this.escapeText(result.message || t('common.loadFailed'))}</div>`;
        return;
      }

      panel.innerHTML = this.renderCourseReports(result.data || {});
      this.applyDynamicUiMetrics(panel);
    } catch (error) {
      console.error('Load course reports error:', error);
      panel.innerHTML = `<div class="error">${I18n.getLocale() === 'en' ? 'Failed to load course reports.' : '課程報表載入失敗。'}</div>`;
    }
  },

  renderCourseReports(report = {}) {
    const students = Array.isArray(report.students) ? report.students : [];
    const locale = I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW';
    const completedLabel = t('common.completed') || (locale === 'en-US' ? 'Completed' : '已完成');
    const inProgressLabel = t('common.inProgress') || (locale === 'en-US' ? 'In progress' : '進行中');
    const notStartedLabel = locale === 'en-US' ? 'Not started' : '尚未開始';

    return `
      <div class="path-report-grid">
        <div class="path-summary-card">
          <label>${locale === 'en-US' ? 'Learners' : '學員數'}</label>
          <strong>${report.totalStudents || 0}</strong>
        </div>
        <div class="path-summary-card">
          <label>${t('moodlePaths.completionRateLabel') || (locale === 'en-US' ? 'Completion rate' : '完成率')}</label>
          <strong>${report.completionRate != null ? `${report.completionRate}%` : '—'}</strong>
        </div>
        <div class="path-summary-card">
          <label>${t('moodlePaths.progress') || (locale === 'en-US' ? 'Average progress' : '平均進度')}</label>
          <strong>${report.averageProgress != null ? `${report.averageProgress}%` : '—'}</strong>
        </div>
        <div class="path-summary-card">
          <label>${locale === 'en-US' ? 'In progress' : '進行中'}</label>
          <strong>${report.inProgressCount || 0}</strong>
        </div>
      </div>
      ${students.length === 0 ? this.renderActivityEmptyState({
        icon: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
        title: locale === 'en-US' ? 'No learner progress yet' : '目前還沒有學員進度資料'
      }) : `
        <div class="participants-list">
          <table class="data-table">
            <thead>
              <tr>
                <th>${t('moodleParticipant.student')}</th>
                <th>${t('moodlePaths.progress') || (locale === 'en-US' ? 'Progress' : '進度')}</th>
                <th>${t('common.status')}</th>
                <th>${locale === 'en-US' ? 'Completed at' : '完成時間'}</th>
              </tr>
            </thead>
            <tbody>
              ${students.map(student => {
                const statusLabel = student.isCompleted
                  ? completedLabel
                  : (student.progress > 0 ? inProgressLabel : notStartedLabel);
                return `
                  <tr>
                    <td>${this.escapeText(student.displayName || student.userId || '—')}</td>
                    <td>${this.escapeText(String(student.progress ?? 0))}%</td>
                    <td>${this.escapeText(statusLabel)}</td>
                    <td>${student.completedAt ? this.escapeText(this.formatPlatformDate(student.completedAt, { dateStyle: 'medium', timeStyle: 'short' })) : '—'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;
  },

  /**
   * 渲染學生成績
   */
  renderStudentGrades(grades) {
    const normalizedGrades = Array.isArray(grades)
      ? (grades[0] || null)
      : grades;
    const gradeVisibility = normalizedGrades?.gradeVisibility || normalizedGrades?.visibility || {};
    const pendingRelease = Boolean(gradeVisibility.pendingRelease);

    const items = Array.isArray(normalizedGrades?.items)
      ? normalizedGrades.items
      : Array.isArray(normalizedGrades?.gradeItems)
        ? normalizedGrades.gradeItems.map((item) => ({
          name: item.name || item.title || t('moodleGrade.item'),
          title: item.title || item.name || t('moodleGrade.item'),
          type: item.type || 'manual',
          score: item.score ?? item.grade ?? null,
          maxScore: item.maxScore ?? item.maxGrade ?? null,
          weight: item.weight ?? null,
          feedback: item.feedback || '',
          submitted: item.submitted || false,
          graded: item.graded || false,
          gradePendingRelease: item.gradePendingRelease || false
        }))
        : [];

    const totalScore = pendingRelease
      ? t('moodleGrade.pendingReleaseLabel')
      : normalizedGrades?.totalScore
      ?? normalizedGrades?.summary?.overallGrade
      ?? '-';
    const completedItems = normalizedGrades?.completedItems
      ?? normalizedGrades?.summary?.completedItems
      ?? items.filter(item => item.score !== null && item.score !== undefined).length;
    const totalItems = normalizedGrades?.totalItems
      ?? normalizedGrades?.summary?.totalItems
      ?? items.length;

    if (!normalizedGrades || items.length === 0) {
      return this.renderActivityEmptyState({
        icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/></svg>',
        title: t('moodleGrade.noGrades')
      });
    }

    return `
      <div class="student-grades">
        ${pendingRelease ? `
          <div class="assignment-deadline-note is-submitted">
            <strong>${t('moodleGrade.pendingReleaseTitle')}</strong>
            <span>${t('moodleGrade.pendingReleaseDesc')}</span>
          </div>
        ` : ''}
        <div class="gradebook-shell">
          <div class="gradebook-shell-head">
            <div class="gradebook-shell-copy">
              <span class="gradebook-shell-kicker">${I18n.getLocale() === 'en' ? 'My progress' : '我的成績概覽'}</span>
              <div class="gradebook-shell-title">${I18n.getLocale() === 'en' ? 'Grade summary' : '成績摘要'}</div>
              <div class="gradebook-shell-desc">${pendingRelease
                ? t('moodleGrade.pendingReleaseDesc')
                : (I18n.getLocale() === 'en' ? 'Review your total score, completed work, and detailed feedback from each graded activity.' : '查看你的總分、完成項目與各項評分回饋。')}</div>
            </div>
          </div>
        </div>
        <div class="grade-summary">
          <div class="summary-card">
            <div class="summary-value">${totalScore}</div>
            <div class="summary-label">${t('moodleGrade.totalGrade')}</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${completedItems}/${totalItems}</div>
            <div class="summary-label">${t('moodleGrade.completedItems')}</div>
          </div>
        </div>
        <div class="gradebook-shell">
          <div class="gradebook-shell-head">
            <div class="gradebook-shell-copy">
              <span class="gradebook-shell-kicker">${I18n.getLocale() === 'en' ? 'Breakdown' : '詳細項目'}</span>
              <div class="gradebook-shell-title">${I18n.getLocale() === 'en' ? 'Detailed grades' : '詳細成績'}</div>
              <div class="gradebook-shell-desc">${pendingRelease
                ? t('moodleGrade.pendingReleaseDesc')
                : (I18n.getLocale() === 'en' ? 'Assignments, quizzes, interactive videos, and weighted items are listed below with scores and feedback.' : '下方列出每個作業、測驗、互動影片與加權項目的得分和回饋。')}</div>
            </div>
          </div>
          <div class="gradebook-table-wrapper">
            <table class="gradebook-table">
              <thead>
                <tr>
                  <th>${t('moodleGrade.item')}</th>
                  <th>${t('moodleGrade.type')}</th>
                  <th>${t('moodleGrade.score')}</th>
                  <th>${t('moodleGrade.weight')}</th>
                  <th>${t('moodleGrade.feedback')}</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr>
                    <td>${this.escapeText(item.name || item.title || t('moodleGrade.item'))}</td>
                    <td><span class="type-badge ${item.type}">${item.type === 'assignment' ? t('moodleGrade.typeAssignment') : item.type === 'quiz' ? t('moodleGrade.typeQuiz') : item.type === 'interactive_video' ? (I18n.getLocale() === 'en' ? 'Interactive Video' : '互動影片') : t('moodleGrade.typeOther')}</span></td>
                    <td><strong>${pendingRelease && item.graded ? t('moodleGrade.pendingReleaseLabel') : (item.score !== null && item.score !== undefined ? item.score : '-')}</strong> / ${item.maxScore ?? '-'}</td>
                    <td>${item.weight ? item.weight + '%' : '-'}</td>
                    <td>${this.escapeText(pendingRelease && item.graded ? t('moodleGrade.pendingReleaseLabel') : (item.feedback || '-'))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 渲染教師成績簿
   */
  renderTeacherGradebook(gradebook) {
    if (!gradebook || !gradebook.students) {
      return this.renderActivityEmptyState({
        icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/></svg>',
        title: t('moodleGrade.noGrades')
      });
    }

    const items = gradebook.columns || gradebook.items || [];
    const students = (gradebook.students || []).map(s => {
      if (s.grades && !Array.isArray(s.grades)) {
        s.grades = items.map(item => ({
          score: s.grades[item.id]?.grade ?? null,
          feedback: s.grades[item.id]?.feedback || '',
          submitted: s.grades[item.id]?.submitted || false
        }));
      }
      return s;
    });

    return `
      <div class="teacher-gradebook">
        <div class="gradebook-shell">
          <div class="gradebook-shell-head">
            <div class="gradebook-shell-copy">
              <span class="gradebook-shell-kicker">${I18n.getLocale() === 'en' ? 'Teaching overview' : '批改工作台'}</span>
              <div class="gradebook-shell-title">${I18n.getLocale() === 'en' ? 'Course gradebook' : '課程成績簿'}</div>
              <div class="gradebook-shell-desc">${I18n.getLocale() === 'en' ? 'Export the current roster, adjust grade settings, and review student performance in one place.' : '在同一個工作區匯出成績、調整設定，並檢視所有學生的學習表現。'}</div>
            </div>
            <div class="gradebook-actions">
              <button onclick="MoodleUI.exportGrades('${this.currentCourseId}')" class="btn-secondary">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                ${t('moodleGrade.exportGrades')}
              </button>
              <button onclick="MoodleUI.openGradeSettings('${this.currentCourseId}')" class="btn-secondary">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4"/></svg>
                ${t('moodleGrade.gradeSettings')}
              </button>
            </div>
          </div>
        </div>
        <div class="gradebook-shell">
          <div class="gradebook-shell-head">
            <div class="gradebook-shell-copy">
              <span class="gradebook-shell-kicker">${I18n.getLocale() === 'en' ? 'Performance table' : '成績總表'}</span>
              <div class="gradebook-shell-title">${I18n.getLocale() === 'en' ? 'Student scores' : '學生分數總覽'}</div>
              <div class="gradebook-shell-desc">${I18n.getLocale() === 'en' ? 'Scores are organized by student and activity, with totals aligned on the right.' : '依學生與活動整理分數，總分固定顯示在右側。'}</div>
            </div>
          </div>
          <div class="gradebook-table-wrapper">
            <table class="gradebook-table">
              <thead>
                <tr>
                  <th class="sticky-col">${t('moodleParticipant.student')}</th>
                  ${items.map(item => `<th>${item.name || item.title}</th>`).join('')}
                  <th>${t('moodleGrade.totalCol')}</th>
                </tr>
              </thead>
              <tbody>
                ${students.map(student => `
                  <tr>
                    <td class="sticky-col">
                      <div class="student-info">
                        <div class="student-avatar">${this.escapeText(((student.name || 'U').trim().charAt(0) || 'U').toUpperCase())}</div>
                        <div>
                          <strong>${this.escapeText(student.name || (I18n.getLocale() === 'en' ? 'Learner' : '學習者'))}</strong>
                          <small>${this.escapeText(student.userId || student.studentId || '')}</small>
                        </div>
                      </div>
                    </td>
                    ${(student.grades || []).map(g => `
                      <td class="grade-cell ${g.score === null ? 'not-graded' : ''}">
                        ${g.score !== null ? g.score : '-'}
                      </td>
                    `).join('')}
                    <td class="total-cell"><strong>${student.total || '-'}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 匯出成績
   */
  async exportGrades(courseId) {
    try {
      const result = await API.gradebook.exportGrades(courseId, 'csv');
      if (result.success) {
        // 下載 CSV
        const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grades_${courseId}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('moodleGrade.exported'));
      }
    } catch (error) {
      console.error('Export grades error:', error);
      showToast(t('moodleGrade.exportFailed'));
    }
  },

  // ==================== 輔助函數 ====================

  /**
   * 取得課程漸層色
   */
  getCourseGradient(category) {
    const gradients = {
      '數學': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      '英文': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      '國文': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      '自然': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      '社會': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      '程式': 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
      '企業培訓': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    };
    return gradients[category] || 'linear-gradient(135deg, var(--olive) 0%, var(--olive-deep) 100%)';
  },

  /**
   * 開啟活動
   */
  openActivity(type, activityId, courseId) {
    switch (type) {
      case 'assignment':
        this.openAssignment(activityId);
        break;
      case 'quiz':
        this.openQuiz(activityId);
        break;
      case 'forum':
        this.openForum(activityId);
        break;
      case 'lti':
        this.launchCourseLtiTool(activityId, courseId);
        break;
      case 'page':
        this.openPageActivity(activityId, courseId);
        break;
      case 'url':
        this.openUrlActivity(activityId, courseId);
        break;
      case 'file':
        this.openFileActivity(activityId, courseId);
        break;
      case 'interactive_video':
        this.openInteractiveVideoActivity(activityId, courseId);
        break;
      default:
        showToast(t('moodleActivity.unsupportedType') + ': ' + type);
    }
  },

  /**
   * 開啟頁面活動 - 在 Modal 中顯示內容
   */
  async openPageActivity(activityId, courseId) {
    try {
      const result = await API.courseActivities.get(courseId, activityId);
      if (!result.success || !result.data) {
        showToast(t('moodleActivity.loadPageFailed'));
        return;
      }
      const activity = result.data;
      const content = activity.content || activity.description || `<p>${t('moodleActivity.noPageContent')}</p>`;
      const modal = MoodleUI.createModal('page-activity-modal', activity.title || t('moodleActivity.pageTitle'), `
        <div class="page-activity-content">
          ${content}
        </div>
      `, { maxWidth: '800px' });
      const session = this.createContentProgressSession(activity, courseId);
      session?.markReady();
      session?.attachToCleanup(modal, '_modalCleanup');
    } catch (error) {
      console.error('開啟頁面活動失敗:', error);
      showToast(t('moodleActivity.loadPageError'));
    }
  },

  /**
   * 從 YouTube URL 提取影片 ID
   */
  extractYouTubeId(url) {
    const patterns = [
      /youtu\.be\/([^?&#]+)/,
      /youtube\.com\/watch\?.*v=([^&#]+)/,
      /youtube\.com\/embed\/([^?&#]+)/,
      /youtube\.com\/shorts\/([^?&#]+)/
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  },

  getInteractiveVideoUiCopy() {
    const isEnglish = I18n.getLocale() === 'en';
    return {
      subtitle: isEnglish ? 'Interactive video' : '互動影片',
      teacherPrompt: isEnglish ? 'Teacher prompt' : '老師提問',
      learnerReply: isEnglish ? 'Your reply' : '你的回答',
      continue: isEnglish ? 'Continue playback' : '繼續播放',
      waiting: isEnglish ? 'Keep watching. The next prompt will appear automatically.' : '繼續觀看，下一個提問會在時間點到達後自動出現。',
      emptyTranscript: isEnglish ? 'Your teacher-led conversation will appear here.' : '老師的互動提問會依照影片進度顯示在這裡。',
      watchProgress: isEnglish ? 'Watch progress' : '觀看進度',
      score: isEnglish ? 'Score' : '分數',
      answered: isEnglish ? 'Answered' : '已回答',
      watchedSeconds: isEnglish ? 'Watched time' : '觀看時間',
      submit: isEnglish ? 'Submit answer' : '送出答案',
      reflectionPlaceholder: isEnglish ? 'Write your reflection…' : '輸入你的想法…',
      questionRequired: isEnglish
        ? 'You can answer now or continue playback and return to this prompt later. Scores count only after every required prompt is correct.'
        : '你可以現在作答，也可以先繼續播放，之後再回來回答。必答題全部答對後才會計分。',
      completed: isEnglish ? 'Interactive video completed' : '互動影片已完成',
      resume: isEnglish ? 'Resume from where you left off' : '將從你上次看到的位置繼續',
      completionPending: isEnglish ? 'All required prompts must be answered correctly before score and completion are recorded.' : '必答題需全部作答且答對，才會計入分數與完成統計。',
      loading: isEnglish ? 'Preparing interactive video…' : '互動影片準備中…',
      invalidConfig: isEnglish ? 'This interactive video is not configured correctly.' : '這支互動影片尚未設定完成。',
      saved: isEnglish ? 'Answer saved' : '答案已儲存',
      play: isEnglish ? 'Play' : '播放',
      pause: isEnglish ? 'Pause' : '暫停',
      seekLocked: isEnglish ? 'Fast-forward locked' : '禁止快轉',
      seekAllowed: isEnglish ? 'Seeking allowed' : '允許跳轉',
      seekLockedHint: isEnglish
        ? 'Learners can only play or pause. Prompts may be answered immediately or later from the sidebar.'
        : '學生只能播放或暫停，遇到提問會自動停下；也可以先略過，之後從右側回覆。',
      seekAllowedHint: isEnglish
        ? 'Learners may seek freely. Every crossed checkpoint appears in the sidebar for later answering.'
        : '學生可自由跳轉；所有已跨過的題目都會出現在右側，可稍後逐題作答。',
      seekBlockedToast: isEnglish
        ? 'Fast-forward is disabled for this interactive video.'
        : '這支互動影片不允許快轉。',
      deferPrompt: isEnglish ? 'Answer later and continue' : '稍後回答並繼續播放',
      replyPrompt: isEnglish ? 'Reply' : '回覆這題',
      retryPrompt: isEnglish ? 'Try again' : '重新作答',
      correct: isEnglish ? 'Correct' : '答對',
      incorrect: isEnglish ? 'Incorrect' : '答錯',
      unanswered: isEnglish ? 'Unanswered' : '未作答',
      scorePending: isEnglish ? 'Pending' : '待完成'
    };
  },

  normalizeInteractiveVideoConfig(activity = {}) {
    const config = activity?.interactiveVideo && typeof activity.interactiveVideo === 'object'
      ? activity.interactiveVideo
      : {};
    const prompts = Array.isArray(config.prompts)
      ? config.prompts
          .filter(Boolean)
          .map((prompt, index) => {
            const options = Array.isArray(prompt.options)
              ? prompt.options.map((option, optionIndex) => (
                typeof option === 'object' && option !== null
                  ? {
                      value: option.value ?? `option_${optionIndex + 1}`,
                      label: option.label ?? option.text ?? String(option.value ?? `Option ${optionIndex + 1}`)
                    }
                  : {
                      value: String(option),
                      label: String(option)
                    }
              ))
              : [];
            return {
              promptId: prompt.promptId || `prompt_${String(index + 1).padStart(3, '0')}`,
              triggerSecond: Math.max(0, Math.floor(Number(prompt.triggerSecond) || 0)),
              questionType: prompt.questionType || 'single_choice',
              question: String(prompt.question || '').trim(),
              options,
              correctAnswer: prompt.correctAnswer ?? null,
              points: Math.max(0, Number(prompt.points) || 0),
              required: prompt.required !== false,
              pauseVideo: prompt.pauseVideo !== false,
              feedbackCorrect: prompt.feedbackCorrect || '',
              feedbackIncorrect: prompt.feedbackIncorrect || '',
              speakerName: prompt.speakerName || config.speakerName || '',
              speakerAvatar: prompt.speakerAvatar || config.speakerAvatar || ''
            };
          })
          .filter((prompt) => prompt.question)
          .sort((a, b) => a.triggerSecond - b.triggerSecond)
      : [];

    return {
      videoUrl: config.videoUrl || activity.url || '',
      youtubeId: config.youtubeId || activity.youtubeId || this.extractYouTubeId(config.videoUrl || activity.url || ''),
      durationSeconds: Math.max(0, Math.floor(Number(config.durationSeconds || 0) || 0)),
      allowSeeking: config.allowSeeking !== false && activity.allowSeeking !== false,
      gradingMode: config.gradingMode || 'graded',
      passingScore: Math.max(0, Math.min(100, Number(config.passingScore || 70) || 70)),
      completionRule: {
        minWatchPercent: Math.max(0, Math.min(100, Number(config?.completionRule?.minWatchPercent || 85) || 85)),
        requiredPromptMode: config?.completionRule?.requiredPromptMode || 'all'
      },
      speakerName: config.speakerName || '',
      speakerAvatar: config.speakerAvatar || '',
      prompts
    };
  },

  getInteractiveVideoEditorCopy() {
    const isEnglish = I18n.getLocale() === 'en';
    return {
      sectionLabel: isEnglish ? 'Timeline prompts' : '時間軸提問',
      sectionHint: isEnglish
        ? 'Create teacher prompts at specific timestamps. The video pauses automatically when a required checkpoint appears.'
        : '用卡片設定影片時間點的提問，播放到指定時間後會自動停下並請學生作答。',
      addPrompt: isEnglish ? 'Add prompt' : '新增提問',
      noPrompts: isEnglish ? 'No prompts yet. Add the first checkpoint to guide learners through the video.' : '尚未加入提問。先新增第一個時間點提問，建立互動學習節奏。',
      promptLabel: isEnglish ? 'Prompt' : '提問',
      promptType: isEnglish ? 'Question type' : '題型',
      triggerTime: isEnglish ? 'Trigger time' : '觸發時間',
      question: isEnglish ? 'Question' : '題目',
      questionPlaceholder: isEnglish ? 'What should the learner notice here?' : '這一段你想請學生注意什麼？',
      points: isEnglish ? 'Points' : '分數',
      correctAnswer: isEnglish ? 'Correct answer' : '正確答案',
      feedbackCorrect: isEnglish ? 'Correct feedback' : '答對回饋',
      feedbackIncorrect: isEnglish ? 'Incorrect feedback' : '答錯回饋',
      reflectionFeedback: isEnglish ? 'Reply feedback' : '作答後回饋',
      required: isEnglish ? 'Required checkpoint' : '必答題',
      pauseVideo: isEnglish ? 'Pause video when triggered' : '觸發時暫停影片',
      allowSeeking: isEnglish ? 'Allow learners to seek / fast-forward' : '允許學生跳轉 / 快轉',
      allowSeekingHint: isEnglish
        ? 'When disabled, learners can only play or pause and cannot skip ahead.'
        : '關閉後學生只能播放與暫停，不能快轉到後面的內容。',
      addOption: isEnglish ? 'Add option' : '新增選項',
      removePrompt: isEnglish ? 'Remove prompt' : '移除提問',
      removeOption: isEnglish ? 'Remove' : '移除',
      singleChoice: isEnglish ? 'Single choice' : '單選題',
      trueFalse: isEnglish ? 'True / False' : '是非題',
      reflection: isEnglish ? 'Short reflection' : '簡答反思',
      optionPlaceholder: isEnglish ? 'Option text' : '選項文字',
      answerTrue: isEnglish ? 'True' : '正確',
      answerFalse: isEnglish ? 'False' : '錯誤',
      timeHint: isEnglish ? 'Use mm:ss or hh:mm:ss' : '可輸入 mm:ss 或 hh:mm:ss',
      questionRequiredHint: isEnglish ? 'Learners must answer this prompt before completing the video.' : '學生必須完成這題，互動影片才算完成。',
      reflectionHint: isEnglish ? 'Reflections are stored for review but do not count as auto-graded points.' : '反思題會保留作答內容，但不會自動判分。',
      timelineScale: isEnglish ? 'Timeline checkpoints' : '時間軸節點',
      untitledPrompt: isEnglish ? 'Untitled prompt' : '未命名提問'
    };
  },

  generateInteractiveVideoPromptId() {
    this.interactiveVideoPromptCounter += 1;
    return `iv_prompt_${Date.now().toString(36)}_${String(this.interactiveVideoPromptCounter).padStart(3, '0')}`;
  },

  formatInteractiveVideoTimeInput(totalSeconds = 0) {
    return this.formatInteractiveVideoTime(totalSeconds);
  },

  parseInteractiveVideoTimeInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) {
      return Math.max(0, Math.floor(Number(raw) || 0));
    }
    const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) {
      throw new Error('INVALID_INTERACTIVE_VIDEO_PROMPTS');
    }
    const numeric = parts.map((part) => Number(part));
    if (parts.length === 2) {
      return (numeric[0] * 60) + numeric[1];
    }
    return (numeric[0] * 3600) + (numeric[1] * 60) + numeric[2];
  },

  normalizeInteractiveVideoPromptOption(option, index = 0) {
    if (typeof option === 'object' && option !== null) {
      return String(option.label || option.text || option.value || '').trim();
    }
    const normalized = String(option || '').trim();
    return normalized || (index < 2 ? '' : '');
  },

  normalizeInteractiveVideoPromptDraft(prompt = {}, index = 0, fallback = {}) {
    const type = ['single_choice', 'true_false', 'short_text_reflection'].includes(prompt.questionType)
      ? prompt.questionType
      : 'single_choice';
    const baseOptions = Array.isArray(prompt.options)
      ? prompt.options.map((option, optionIndex) => this.normalizeInteractiveVideoPromptOption(option, optionIndex))
      : [];
    const options = type === 'single_choice'
      ? (baseOptions.length > 0 ? baseOptions : ['', ''])
      : [];
    const correctAnswerIndex = type === 'single_choice'
      ? Math.max(0, options.findIndex((option) => String(option) === String(prompt.correctAnswer ?? '')))
      : null;
    return {
      promptId: prompt.promptId || this.generateInteractiveVideoPromptId(),
      triggerSecond: Math.max(0, Math.floor(Number(prompt.triggerSecond) || 0)),
      questionType: type,
      question: String(prompt.question || '').trim(),
      options,
      correctAnswerIndex,
      booleanAnswer: String(prompt.correctAnswer).toLowerCase() === 'false' ? 'false' : 'true',
      points: Math.max(0, Number(prompt.points) || 0),
      required: prompt.required !== false,
      pauseVideo: prompt.pauseVideo !== false,
      feedbackCorrect: prompt.feedbackCorrect || '',
      feedbackIncorrect: prompt.feedbackIncorrect || '',
      speakerName: prompt.speakerName || fallback.speakerName || '',
      speakerAvatar: prompt.speakerAvatar || fallback.speakerAvatar || ''
    };
  },

  getInteractiveVideoEditorState(prefix = '') {
    return Array.isArray(this.interactiveVideoEditorState[prefix]) ? this.interactiveVideoEditorState[prefix] : [];
  },

  seedInteractiveVideoPromptEditor(prefix = '', prompts = [], fallback = {}) {
    const sourcePrompts = Array.isArray(prompts) && prompts.length > 0 ? prompts : [{}];
    const preparedPrompts = sourcePrompts.map((prompt, index) => this.normalizeInteractiveVideoPromptDraft(prompt, index, fallback));
    this.interactiveVideoEditorState[prefix] = preparedPrompts;
    return preparedPrompts;
  },

  renderInteractiveVideoPromptTimeline(prefix = '', prompts = []) {
    const copy = this.getInteractiveVideoEditorCopy();
    const sortedPrompts = [...(prompts || [])]
      .sort((a, b) => a.triggerSecond - b.triggerSecond);
    if (sortedPrompts.length === 0) {
      return `<div class="interactive-video-editor-timeline-empty">${this.escapeText(copy.noPrompts)}</div>`;
    }
    const maxSecond = Math.max(60, ...sortedPrompts.map((prompt) => Number(prompt.triggerSecond) || 0));
    return `
      <div class="interactive-video-editor-timeline-rail">
        ${sortedPrompts.map((prompt, index) => {
          const ratio = maxSecond > 0 ? (Math.max(0, Number(prompt.triggerSecond) || 0) / maxSecond) * 100 : 0;
          return `
            <button
              type="button"
              class="interactive-video-editor-timeline-marker"
              style="left: ${Math.min(100, Math.max(0, ratio))}%"
              onclick="MoodleUI.scrollToInteractiveVideoPrompt(${this.toInlineActionValue(prefix)}, ${this.toInlineActionValue(prompt.promptId)})"
            >
              <span>${this.escapeText(this.formatInteractiveVideoTimeInput(prompt.triggerSecond || 0))}</span>
            </button>
          `;
        }).join('')}
      </div>
      <div class="interactive-video-editor-timeline-chips">
        ${sortedPrompts.map((prompt, index) => `
          <button
            type="button"
            class="interactive-video-editor-chip"
            onclick="MoodleUI.scrollToInteractiveVideoPrompt(${this.toInlineActionValue(prefix)}, ${this.toInlineActionValue(prompt.promptId)})"
          >
            <span>${this.escapeText(copy.promptLabel)} ${index + 1}</span>
            <strong>${this.escapeText(this.formatInteractiveVideoTimeInput(prompt.triggerSecond || 0))}</strong>
          </button>
        `).join('')}
      </div>
    `;
  },

  renderInteractiveVideoPromptCard(prompt = {}, index = 0, prefix = '') {
    const copy = this.getInteractiveVideoEditorCopy();
    const optionRows = (prompt.questionType === 'single_choice' ? prompt.options : []).map((option, optionIndex) => `
      <div class="interactive-video-editor-option-row">
        <label class="interactive-video-editor-option-correct">
          <input
            type="radio"
            name="${this.escapeText(`${prefix}interactiveVideoCorrect_${prompt.promptId}`)}"
            value="${optionIndex}"
            ${prompt.correctAnswerIndex === optionIndex ? 'checked' : ''}
          >
          <span>${this.escapeText(copy.correctAnswer)}</span>
        </label>
        <input
          type="text"
          class="interactive-video-editor-option-input"
          value="${this.escapeText(option || '')}"
          placeholder="${this.escapeText(copy.optionPlaceholder)}"
          oninput="MoodleUI.refreshInteractiveVideoPromptEditorTimeline(${this.toInlineActionValue(prefix)})"
        >
        <button
          type="button"
          class="btn-secondary btn-sm"
          onclick="MoodleUI.removeInteractiveVideoPromptOption(${this.toInlineActionValue(prefix)}, ${this.toInlineActionValue(prompt.promptId)}, ${optionIndex})"
        >
          ${this.escapeText(copy.removeOption)}
        </button>
      </div>
    `).join('');

    return `
      <article class="interactive-video-editor-card" data-prompt-id="${this.escapeText(prompt.promptId)}">
        <div class="interactive-video-editor-card-head">
          <div>
            <span class="interactive-video-editor-card-kicker">${this.escapeText(copy.promptLabel)} ${index + 1}</span>
            <div class="interactive-video-editor-card-meta">
              <h4 data-iv-editor-card-title>${this.escapeText(prompt.question || copy.untitledPrompt)}</h4>
              <span class="interactive-video-editor-card-time" data-iv-editor-card-time>${this.escapeText(this.formatInteractiveVideoTimeInput(prompt.triggerSecond || 0))}</span>
            </div>
          </div>
          <button
            type="button"
            class="btn-danger btn-sm"
            onclick="MoodleUI.removeInteractiveVideoPrompt(${this.toInlineActionValue(prefix)}, ${this.toInlineActionValue(prompt.promptId)})"
          >
            ${this.escapeText(copy.removePrompt)}
          </button>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>${this.escapeText(copy.triggerTime)}</label>
            <input
              type="text"
              class="interactive-video-editor-time-input"
              value="${this.escapeText(this.formatInteractiveVideoTimeInput(prompt.triggerSecond || 0))}"
              placeholder="00:30"
              oninput="MoodleUI.handleInteractiveVideoPromptFieldInput(this, ${this.toInlineActionValue(prefix)})"
            >
            <p class="form-hint">${this.escapeText(copy.timeHint)}</p>
          </div>
          <div class="form-group">
            <label>${this.escapeText(copy.promptType)}</label>
            <select
              class="interactive-video-editor-type-select"
              onchange="MoodleUI.changeInteractiveVideoPromptType(${this.toInlineActionValue(prefix)}, ${this.toInlineActionValue(prompt.promptId)}, this.value)"
            >
              <option value="single_choice" ${prompt.questionType === 'single_choice' ? 'selected' : ''}>${this.escapeText(copy.singleChoice)}</option>
              <option value="true_false" ${prompt.questionType === 'true_false' ? 'selected' : ''}>${this.escapeText(copy.trueFalse)}</option>
              <option value="short_text_reflection" ${prompt.questionType === 'short_text_reflection' ? 'selected' : ''}>${this.escapeText(copy.reflection)}</option>
            </select>
          </div>
          <div class="form-group">
            <label>${this.escapeText(copy.points)}</label>
            <input
              type="number"
              class="interactive-video-editor-points-input"
              min="0"
              value="${this.escapeText(prompt.points || 0)}"
              ${prompt.questionType === 'short_text_reflection' ? 'disabled' : ''}
            >
          </div>
        </div>

        <div class="form-group">
          <label>${this.escapeText(copy.question)}</label>
          <textarea
            class="interactive-video-editor-question-input"
            rows="3"
            placeholder="${this.escapeText(copy.questionPlaceholder)}"
            oninput="MoodleUI.handleInteractiveVideoPromptFieldInput(this, ${this.toInlineActionValue(prefix)})"
          >${this.escapeText(prompt.question || '')}</textarea>
        </div>

        ${prompt.questionType === 'single_choice' ? `
          <div class="form-group">
            <div class="interactive-video-editor-inline-head">
              <label>${this.escapeText(copy.singleChoice)}</label>
              <button
                type="button"
                class="btn-secondary btn-sm"
                onclick="MoodleUI.addInteractiveVideoPromptOption(${this.toInlineActionValue(prefix)}, ${this.toInlineActionValue(prompt.promptId)})"
              >
                ${this.escapeText(copy.addOption)}
              </button>
            </div>
            <div class="interactive-video-editor-option-list">
              ${optionRows}
            </div>
          </div>
        ` : ''}

        ${prompt.questionType === 'true_false' ? `
          <div class="form-group">
            <label>${this.escapeText(copy.correctAnswer)}</label>
            <select class="interactive-video-editor-boolean-answer">
              <option value="true" ${prompt.booleanAnswer === 'true' ? 'selected' : ''}>${this.escapeText(copy.answerTrue)}</option>
              <option value="false" ${prompt.booleanAnswer === 'false' ? 'selected' : ''}>${this.escapeText(copy.answerFalse)}</option>
            </select>
          </div>
        ` : ''}

        <div class="form-row interactive-video-editor-toggle-row">
          <div class="form-group form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" class="interactive-video-editor-required-input" ${prompt.required ? 'checked' : ''}>
              <span>${this.escapeText(copy.required)}</span>
            </label>
            <p class="form-hint">${this.escapeText(copy.questionRequiredHint)}</p>
          </div>
          <div class="form-group form-checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" class="interactive-video-editor-pause-input" ${prompt.pauseVideo ? 'checked' : ''}>
              <span>${this.escapeText(copy.pauseVideo)}</span>
            </label>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>${this.escapeText(prompt.questionType === 'short_text_reflection' ? copy.reflectionFeedback : copy.feedbackCorrect)}</label>
            <textarea class="interactive-video-editor-feedback-correct" rows="2">${this.escapeText(prompt.feedbackCorrect || '')}</textarea>
          </div>
          ${prompt.questionType !== 'short_text_reflection' ? `
            <div class="form-group">
              <label>${this.escapeText(copy.feedbackIncorrect)}</label>
              <textarea class="interactive-video-editor-feedback-incorrect" rows="2">${this.escapeText(prompt.feedbackIncorrect || '')}</textarea>
            </div>
          ` : `
            <div class="interactive-video-editor-reflection-hint">${this.escapeText(copy.reflectionHint)}</div>
          `}
        </div>
      </article>
    `;
  },

  buildInteractiveVideoPromptEditor(prefix = '', prompts = [], fallback = {}) {
    const copy = this.getInteractiveVideoEditorCopy();
    const draftPrompts = this.seedInteractiveVideoPromptEditor(prefix, prompts, fallback);
    return `
      <div class="interactive-video-editor-shell">
        <div class="interactive-video-editor-head">
          <div>
            <label>${this.escapeText(copy.sectionLabel)}</label>
            <p class="form-hint">${this.escapeText(copy.sectionHint)}</p>
          </div>
          <button type="button" class="btn-secondary btn-sm" onclick="MoodleUI.addInteractiveVideoPrompt(${this.toInlineActionValue(prefix)})">
            ${this.escapeText(copy.addPrompt)}
          </button>
        </div>
        <div id="${this.escapeText(`${prefix}interactiveVideoPromptTimeline`)}" class="interactive-video-editor-timeline">
          ${this.renderInteractiveVideoPromptTimeline(prefix, draftPrompts)}
        </div>
        <div id="${this.escapeText(`${prefix}interactiveVideoPromptList`)}" class="interactive-video-editor-list">
          ${draftPrompts.map((prompt, index) => this.renderInteractiveVideoPromptCard(prompt, index, prefix)).join('')}
        </div>
      </div>
    `;
  },

  collectInteractiveVideoPromptEditorDrafts(prefix = '', { preserveEmptyOptions = false } = {}) {
    const container = document.getElementById(`${prefix}interactiveVideoPromptList`);
    if (!container) {
      return this.getInteractiveVideoEditorState(prefix);
    }

    const field = (id) => document.getElementById(`${prefix}${id}`);
    const speakerName = field('interactiveVideoSpeakerName')?.value?.trim() || '';
    const speakerAvatar = field('interactiveVideoSpeakerAvatar')?.value?.trim() || '';
    const existingState = new Map(this.getInteractiveVideoEditorState(prefix).map((prompt) => [prompt.promptId, prompt]));

    return Array.from(container.querySelectorAll('.interactive-video-editor-card')).map((card, index) => {
      const promptId = card.dataset.promptId || this.generateInteractiveVideoPromptId();
      const previous = existingState.get(promptId) || {};
      let triggerSecond = Number(previous.triggerSecond || 0) || 0;
      try {
        triggerSecond = this.parseInteractiveVideoTimeInput(card.querySelector('.interactive-video-editor-time-input')?.value || '0');
      } catch (error) {
        if (!preserveEmptyOptions) throw error;
      }
      const questionType = card.querySelector('.interactive-video-editor-type-select')?.value || 'single_choice';
      const optionValues = Array.from(card.querySelectorAll('.interactive-video-editor-option-input'))
        .map((input) => input.value)
        .filter((value) => preserveEmptyOptions || String(value || '').trim());
      const checkedCorrect = Array.from(card.querySelectorAll('input[type="radio"]')).find((input) => input.checked);
      const correctAnswerIndex = checkedCorrect ? Number(checkedCorrect.value) : null;

      return {
        promptId,
        triggerSecond,
        questionType,
        question: card.querySelector('.interactive-video-editor-question-input')?.value?.trim() || '',
        options: questionType === 'single_choice'
          ? (preserveEmptyOptions ? optionValues : optionValues.map((value) => String(value).trim()).filter(Boolean))
          : [],
        correctAnswerIndex: questionType === 'single_choice' ? correctAnswerIndex : null,
        booleanAnswer: questionType === 'true_false'
          ? (card.querySelector('.interactive-video-editor-boolean-answer')?.value || 'true')
          : 'true',
        points: questionType === 'short_text_reflection'
          ? 0
          : Math.max(0, Number(card.querySelector('.interactive-video-editor-points-input')?.value || 0) || 0),
        required: card.querySelector('.interactive-video-editor-required-input')?.checked !== false,
        pauseVideo: card.querySelector('.interactive-video-editor-pause-input')?.checked !== false,
        feedbackCorrect: card.querySelector('.interactive-video-editor-feedback-correct')?.value?.trim() || '',
        feedbackIncorrect: questionType === 'short_text_reflection'
          ? ''
          : (card.querySelector('.interactive-video-editor-feedback-incorrect')?.value?.trim() || ''),
        speakerName: previous.speakerName || speakerName,
        speakerAvatar: previous.speakerAvatar || speakerAvatar
      };
    });
  },

  refreshInteractiveVideoPromptEditorTimeline(prefix = '') {
    try {
      const prompts = this.collectInteractiveVideoPromptEditorDrafts(prefix, { preserveEmptyOptions: true });
      this.interactiveVideoEditorState[prefix] = prompts;
      const timeline = document.getElementById(`${prefix}interactiveVideoPromptTimeline`);
      if (timeline) {
        timeline.innerHTML = this.renderInteractiveVideoPromptTimeline(prefix, prompts);
      }
    } catch (error) {
      // Ignore invalid partial input while the teacher is typing.
    }
  },

  handleInteractiveVideoPromptFieldInput(inputEl, prefix = '') {
    const card = inputEl?.closest?.('.interactive-video-editor-card');
    if (card) {
      const copy = this.getInteractiveVideoEditorCopy();
      const titleEl = card.querySelector('[data-iv-editor-card-title]');
      const timeEl = card.querySelector('[data-iv-editor-card-time]');
      const question = card.querySelector('.interactive-video-editor-question-input')?.value?.trim() || '';
      const timeValue = card.querySelector('.interactive-video-editor-time-input')?.value || '';
      if (titleEl) {
        titleEl.textContent = question || copy.untitledPrompt;
      }
      if (timeEl) {
        try {
          timeEl.textContent = this.formatInteractiveVideoTimeInput(this.parseInteractiveVideoTimeInput(timeValue));
        } catch (error) {
          timeEl.textContent = timeValue || '00:00';
        }
      }
    }
    this.refreshInteractiveVideoPromptEditorTimeline(prefix);
  },

  rerenderInteractiveVideoPromptEditor(prefix = '') {
    const prompts = this.getInteractiveVideoEditorState(prefix);
    const list = document.getElementById(`${prefix}interactiveVideoPromptList`);
    if (list) {
      list.innerHTML = prompts.map((prompt, index) => this.renderInteractiveVideoPromptCard(prompt, index, prefix)).join('');
    }
    const timeline = document.getElementById(`${prefix}interactiveVideoPromptTimeline`);
    if (timeline) {
      timeline.innerHTML = this.renderInteractiveVideoPromptTimeline(prefix, prompts);
    }
  },

  addInteractiveVideoPrompt(prefix = '') {
    const prompts = this.collectInteractiveVideoPromptEditorDrafts(prefix, { preserveEmptyOptions: true });
    prompts.push(this.normalizeInteractiveVideoPromptDraft({}, prompts.length));
    this.interactiveVideoEditorState[prefix] = prompts;
    this.rerenderInteractiveVideoPromptEditor(prefix);
  },

  removeInteractiveVideoPrompt(prefix = '', promptId = '') {
    let prompts = this.collectInteractiveVideoPromptEditorDrafts(prefix, { preserveEmptyOptions: true })
      .filter((prompt) => prompt.promptId !== promptId);
    if (prompts.length === 0) {
      prompts = [this.normalizeInteractiveVideoPromptDraft({}, 0)];
    }
    this.interactiveVideoEditorState[prefix] = prompts;
    this.rerenderInteractiveVideoPromptEditor(prefix);
  },

  changeInteractiveVideoPromptType(prefix = '', promptId = '', nextType = 'single_choice') {
    const prompts = this.collectInteractiveVideoPromptEditorDrafts(prefix, { preserveEmptyOptions: true })
      .map((prompt) => {
        if (prompt.promptId !== promptId) return prompt;
        if (nextType === 'single_choice') {
          const nextOptions = Array.isArray(prompt.options) && prompt.options.length > 0 ? prompt.options : ['', ''];
          return {
            ...prompt,
            questionType: 'single_choice',
            options: nextOptions,
            correctAnswerIndex: Number.isInteger(prompt.correctAnswerIndex) ? prompt.correctAnswerIndex : 0,
            booleanAnswer: 'true',
            points: Math.max(0, Number(prompt.points || 0) || 0),
            feedbackIncorrect: prompt.feedbackIncorrect || ''
          };
        }
        if (nextType === 'true_false') {
          return {
            ...prompt,
            questionType: 'true_false',
            options: [],
            correctAnswerIndex: null,
            booleanAnswer: prompt.booleanAnswer === 'false' ? 'false' : 'true',
            points: Math.max(0, Number(prompt.points || 0) || 0)
          };
        }
        return {
          ...prompt,
          questionType: 'short_text_reflection',
          options: [],
          correctAnswerIndex: null,
          booleanAnswer: 'true',
          points: 0,
          feedbackIncorrect: ''
        };
      });
    this.interactiveVideoEditorState[prefix] = prompts;
    this.rerenderInteractiveVideoPromptEditor(prefix);
  },

  addInteractiveVideoPromptOption(prefix = '', promptId = '') {
    const prompts = this.collectInteractiveVideoPromptEditorDrafts(prefix, { preserveEmptyOptions: true })
      .map((prompt) => {
        if (prompt.promptId !== promptId) return prompt;
        return {
          ...prompt,
          options: [...(Array.isArray(prompt.options) ? prompt.options : []), '']
        };
      });
    this.interactiveVideoEditorState[prefix] = prompts;
    this.rerenderInteractiveVideoPromptEditor(prefix);
  },

  removeInteractiveVideoPromptOption(prefix = '', promptId = '', optionIndex = 0) {
    const prompts = this.collectInteractiveVideoPromptEditorDrafts(prefix, { preserveEmptyOptions: true })
      .map((prompt) => {
        if (prompt.promptId !== promptId) return prompt;
        const nextOptions = (Array.isArray(prompt.options) ? prompt.options : []).filter((_, index) => index !== optionIndex);
        const safeOptions = nextOptions.length > 0 ? nextOptions : [''];
        const nextCorrectIndex = Number.isInteger(prompt.correctAnswerIndex)
          ? Math.min(prompt.correctAnswerIndex, safeOptions.length - 1)
          : 0;
        return {
          ...prompt,
          options: safeOptions,
          correctAnswerIndex: nextCorrectIndex
        };
      });
    this.interactiveVideoEditorState[prefix] = prompts;
    this.rerenderInteractiveVideoPromptEditor(prefix);
  },

  scrollToInteractiveVideoPrompt(prefix = '', promptId = '') {
    const list = document.getElementById(`${prefix}interactiveVideoPromptList`);
    const node = list
      ? Array.from(list.querySelectorAll('.interactive-video-editor-card')).find((item) => item.dataset.promptId === promptId)
      : null;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('is-highlighted');
    window.clearTimeout(node._ivHighlightTimer);
    node._ivHighlightTimer = window.setTimeout(() => node.classList.remove('is-highlighted'), 1200);
  },

  formatInteractiveVideoPromptsForTextarea(prompts = []) {
    return JSON.stringify((prompts || []).map((prompt) => ({
      triggerSecond: prompt.triggerSecond || 0,
      questionType: prompt.questionType || 'single_choice',
      question: prompt.question || '',
      options: Array.isArray(prompt.options) ? prompt.options.map((option) => option.label || option.text || option.value || option) : [],
      correctAnswer: prompt.correctAnswer ?? '',
      points: Number(prompt.points || 0) || 0,
      required: prompt.required !== false,
      pauseVideo: prompt.pauseVideo !== false,
      feedbackCorrect: prompt.feedbackCorrect || '',
      feedbackIncorrect: prompt.feedbackIncorrect || '',
      speakerName: prompt.speakerName || '',
      speakerAvatar: prompt.speakerAvatar || ''
    })), null, 2);
  },

  buildInteractiveVideoConfigFromForm(prefix = '') {
    const field = (id) => document.getElementById(`${prefix}${id}`);
    const videoUrl = field('interactiveVideoUrl')?.value?.trim() || '';
    const youtubeId = this.extractYouTubeId(videoUrl);
    if (!videoUrl || !youtubeId) {
      throw new Error('INVALID_INTERACTIVE_VIDEO_URL');
    }

    const speakerName = field('interactiveVideoSpeakerName')?.value?.trim() || '';
    const speakerAvatar = field('interactiveVideoSpeakerAvatar')?.value?.trim() || '';
    let prompts = [];

    if (document.getElementById(`${prefix}interactiveVideoPromptList`)) {
      const promptDrafts = this.collectInteractiveVideoPromptEditorDrafts(prefix)
        .filter((prompt) => prompt.question);

      prompts = promptDrafts.map((prompt) => {
        if (prompt.questionType === 'single_choice') {
          const options = (Array.isArray(prompt.options) ? prompt.options : []).map((option) => String(option || '').trim()).filter(Boolean);
          if (options.length < 2 || !Number.isInteger(prompt.correctAnswerIndex) || !options[prompt.correctAnswerIndex]) {
            throw new Error('INVALID_INTERACTIVE_VIDEO_PROMPTS');
          }
          return {
            promptId: prompt.promptId,
            triggerSecond: prompt.triggerSecond,
            questionType: prompt.questionType,
            question: prompt.question,
            options,
            correctAnswer: options[prompt.correctAnswerIndex],
            points: Math.max(0, Number(prompt.points || 0) || 0),
            required: prompt.required !== false,
            pauseVideo: prompt.pauseVideo !== false,
            feedbackCorrect: prompt.feedbackCorrect || '',
            feedbackIncorrect: prompt.feedbackIncorrect || '',
            speakerName: prompt.speakerName || speakerName,
            speakerAvatar: prompt.speakerAvatar || speakerAvatar
          };
        }

        if (prompt.questionType === 'true_false') {
          return {
            promptId: prompt.promptId,
            triggerSecond: prompt.triggerSecond,
            questionType: prompt.questionType,
            question: prompt.question,
            correctAnswer: prompt.booleanAnswer === 'false' ? 'false' : 'true',
            points: Math.max(0, Number(prompt.points || 0) || 0),
            required: prompt.required !== false,
            pauseVideo: prompt.pauseVideo !== false,
            feedbackCorrect: prompt.feedbackCorrect || '',
            feedbackIncorrect: prompt.feedbackIncorrect || '',
            speakerName: prompt.speakerName || speakerName,
            speakerAvatar: prompt.speakerAvatar || speakerAvatar
          };
        }

        return {
          promptId: prompt.promptId,
          triggerSecond: prompt.triggerSecond,
          questionType: 'short_text_reflection',
          question: prompt.question,
          correctAnswer: null,
          points: 0,
          required: prompt.required !== false,
          pauseVideo: prompt.pauseVideo !== false,
          feedbackCorrect: prompt.feedbackCorrect || '',
          feedbackIncorrect: '',
          speakerName: prompt.speakerName || speakerName,
          speakerAvatar: prompt.speakerAvatar || speakerAvatar
        };
      }).sort((a, b) => a.triggerSecond - b.triggerSecond);
    } else {
      const promptsRaw = field('interactiveVideoPrompts')?.value?.trim() || '[]';
      try {
        prompts = JSON.parse(promptsRaw);
      } catch (error) {
        throw new Error('INVALID_INTERACTIVE_VIDEO_PROMPTS');
      }
    }

    if (!Array.isArray(prompts) || prompts.length === 0) {
      throw new Error('INVALID_INTERACTIVE_VIDEO_PROMPTS');
    }

    return {
      url: videoUrl,
      youtubeId,
      interactiveVideo: {
        videoUrl,
        youtubeId,
        speakerName,
        speakerAvatar,
        gradingMode: field('interactiveVideoGradingMode')?.value || 'graded',
        allowSeeking: field('interactiveVideoAllowSeeking')?.checked !== false,
        passingScore: Math.max(0, Math.min(100, Number(field('interactiveVideoPassingScore')?.value || 70) || 70)),
        completionRule: {
          minWatchPercent: Math.max(0, Math.min(100, Number(field('interactiveVideoWatchPercent')?.value || 85) || 85)),
          requiredPromptMode: 'all'
        },
        prompts: Array.isArray(prompts) ? prompts : []
      }
    };
  },

  attemptYouTubeIframeApiLoad(src) {
    if (window.YT?.Player) {
      return Promise.resolve(window.YT);
    }

    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-youtube-iframe-api="1"]');
      let script = existingScript;
      let settled = false;
      let timeoutId = null;
      let readyHandlerInstalled = false;
      const previousReadyHandler = window.onYouTubeIframeAPIReady;

      const cleanup = () => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (script) {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
        }
      };

      const finish = (callback) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      const handleReady = () => {
        if (typeof previousReadyHandler === 'function' && readyHandlerInstalled) {
          previousReadyHandler();
        }
        if (window.YT?.Player) {
          finish(() => resolve(window.YT));
          return;
        }
        finish(() => reject(new Error('YOUTUBE_API_READY_WITHOUT_PLAYER')));
      };

      const handleLoad = () => {
        if (window.YT?.Player) {
          finish(() => resolve(window.YT));
        }
      };

      const handleError = () => {
        finish(() => reject(new Error('YOUTUBE_API_LOAD_FAILED')));
      };

      if (script && !String(script.src || '').includes(src)) {
        script.remove();
        script = null;
      }

      window.onYouTubeIframeAPIReady = handleReady;
      readyHandlerInstalled = true;

      if (!script) {
        script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.youtubeIframeApi = '1';
        document.head.appendChild(script);
      }

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      timeoutId = window.setTimeout(() => {
        if (script && script.parentNode) {
          script.remove();
        }
        finish(() => reject(new Error('YOUTUBE_API_TIMEOUT')));
      }, 8000);
    });
  },

  ensureYouTubeIframeApi() {
    if (window.YT?.Player) {
      return Promise.resolve(window.YT);
    }
    if (this._youtubeIframeApiPromise) {
      return this._youtubeIframeApiPromise;
    }

    this._youtubeIframeApiPromise = this.attemptYouTubeIframeApiLoad('https://www.youtube.com/iframe_api')
      .catch((primaryError) => {
        console.warn('Primary YouTube iframe API load failed, retrying with player_api:', primaryError);
        return this.attemptYouTubeIframeApiLoad('https://www.youtube.com/player_api');
      })
      .catch((error) => {
        this._youtubeIframeApiPromise = null;
        throw error;
      });

    return this._youtubeIframeApiPromise;
  },

  syncInteractiveVideoPlayerState(runtime, stateCode) {
    if (!runtime) return;
    const normalized = Number(stateCode);
    if (normalized === 1) {
      runtime.playerState = 'playing';
      if (runtime.activePromptId) {
        runtime.activePromptId = null;
        this.renderInteractiveVideoSidebar(runtime);
      }
      runtime.lastTrackedTime = Number(runtime.player?.getCurrentTime?.() || runtime.currentTime || 0);
    } else if (normalized === 2) {
      runtime.playerState = 'paused';
    } else if (normalized === 0) {
      runtime.playerState = 'ended';
      const endSecond = Number(runtime.player?.getDuration?.() || runtime.config?.durationSeconds || runtime.currentTime || 0) || 0;
      if (endSecond > 0) {
        runtime.currentTime = Math.max(Number(runtime.currentTime || 0) || 0, endSecond);
      }
      this.revealInteractiveVideoPromptsUpTo(runtime, runtime.currentTime, { activate: true, pause: false });
      this.finalizeInteractiveVideo(runtime, { autoComplete: true });
    } else {
      runtime.playerState = 'idle';
    }
    this.renderInteractiveVideoPlaybackControls(runtime);
  },

  createInteractiveVideoPostMessagePlayer(runtime, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error('INTERACTIVE_VIDEO_PLAYER_CONTAINER_MISSING');
    }

    const iframe = document.createElement('iframe');
    const params = new URLSearchParams({
      autoplay: '1',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      enablejsapi: '1',
      controls: runtime.config?.allowSeeking === false ? '0' : '1',
      disablekb: runtime.config?.allowSeeking === false ? '1' : '0',
      origin: window.location.origin
    });

    iframe.className = 'interactive-video-player-frame';
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(runtime.config.youtubeId)}?${params.toString()}`;
    iframe.allow = 'autoplay; encrypted-media; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.title = runtime.activity?.name || runtime.activity?.title || this.getInteractiveVideoUiCopy().subtitle;

    container.innerHTML = '';
    container.appendChild(iframe);

    const state = {
      ready: false,
      destroyed: false,
      currentTime: Math.max(0, Number(runtime.attempt?.lastPositionSecond || 0) || 0),
      listenTimer: null
    };

    const postToIframe = (payload) => {
      if (state.destroyed || !iframe.contentWindow) return;
      try {
        iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
      } catch (error) {
        console.warn('Interactive video iframe postMessage failed:', error);
      }
    };

    const sendListeningPing = () => {
      postToIframe({ event: 'listening', id: containerId, channel: 'widget' });
    };

    const postCommand = (func, args = []) => {
      postToIframe({ event: 'command', func, args, id: containerId });
    };

    const onMessage = (event) => {
      if (state.destroyed || event.source !== iframe.contentWindow) return;
      if (!/^https:\/\/www\.youtube(?:-nocookie)?\.com$/.test(String(event.origin || ''))) return;

      let payload = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (error) {
          return;
        }
      }

      if (!payload || typeof payload !== 'object') return;

      if (payload.event === 'onReady') {
        state.ready = true;
        if (state.listenTimer) {
          window.clearInterval(state.listenTimer);
          state.listenTimer = null;
        }
        if (state.currentTime > 0) {
          postCommand('seekTo', [state.currentTime, true]);
        }
        postCommand('addEventListener', ['onStateChange']);
        return;
      }

      if (payload.event === 'onStateChange') {
        this.syncInteractiveVideoPlayerState(runtime, Number(payload.info));
        return;
      }

      if ((payload.event === 'initialDelivery' || payload.event === 'infoDelivery') && payload.info) {
        const nextTime = Number(payload.info.currentTime);
        if (Number.isFinite(nextTime) && nextTime >= 0) {
          state.currentTime = nextTime;
          runtime.currentTime = nextTime;
        }
        if (Number.isFinite(Number(payload.info.playerState))) {
          this.syncInteractiveVideoPlayerState(runtime, Number(payload.info.playerState));
        }
      }
    };

    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', () => {
      sendListeningPing();
      state.listenTimer = window.setInterval(() => {
        if (state.ready || state.destroyed) return;
        sendListeningPing();
      }, 500);
      window.setTimeout(() => {
        if (!state.destroyed) {
          postCommand('playVideo');
        }
      }, 400);
    }, { once: true });

    return {
      playVideo: () => postCommand('playVideo'),
      pauseVideo: () => postCommand('pauseVideo'),
      seekTo: (seconds, allowSeekAhead = true) => {
        state.currentTime = Math.max(0, Number(seconds || 0) || 0);
        postCommand('seekTo', [state.currentTime, !!allowSeekAhead]);
      },
      getCurrentTime: () => state.currentTime,
      destroy: () => {
        state.destroyed = true;
        if (state.listenTimer) {
          window.clearInterval(state.listenTimer);
          state.listenTimer = null;
        }
        window.removeEventListener('message', onMessage);
        iframe.src = 'about:blank';
        container.innerHTML = '';
      }
    };
  },

  renderInteractiveVideoAvatar(name = '', avatar = '', variant = 'teacher') {
    if (avatar) {
      return `<span class="interactive-video-avatar ${variant}"><img src="${this.escapeText(avatar)}" alt="${this.escapeText(name || 'Teacher')}"></span>`;
    }
    const safeName = String(name || (variant === 'teacher' ? 'T' : 'S')).trim();
    const initials = safeName.slice(0, 1).toUpperCase();
    return `<span class="interactive-video-avatar ${variant}">${this.escapeText(initials)}</span>`;
  },

  resolveInteractiveVideoAnswerLabel(prompt, answerRecord) {
    if (!answerRecord) return '';
    const answerValue = answerRecord.answer;
    if (Array.isArray(answerValue)) {
      return answerValue.map((value) => this.resolveInteractiveVideoAnswerLabel(prompt, { answer: value })).filter(Boolean).join(', ');
    }
    if (prompt.questionType === 'true_false') {
      return String(answerValue).toLowerCase() === 'true'
        ? (I18n.getLocale() === 'en' ? 'True' : '是')
        : (I18n.getLocale() === 'en' ? 'False' : '否');
    }
    const matched = (prompt.options || []).find((option) => String(option.value) === String(answerValue));
    return matched?.label || String(answerValue || '');
  },

  getInteractiveVideoAnswerState(prompt, answerRecord) {
    if (!answerRecord) return 'unanswered';
    if (answerRecord.isCorrect === true) return 'correct';
    if (answerRecord.isCorrect === false) return 'incorrect';
    return 'answered';
  },

  shouldShowInteractiveVideoReplyAction(prompt, answerRecord) {
    if (!answerRecord) return true;
    return answerRecord.isCorrect === false;
  },

  setInteractiveVideoTriggeredPromptIds(runtime, promptIds = []) {
    if (!runtime) return [];
    const validPromptIds = new Set((runtime.prompts || []).map(prompt => prompt.promptId).filter(Boolean));
    const normalized = Array.from(new Set(
      (promptIds || [])
        .map(promptId => String(promptId || '').trim())
        .filter(promptId => promptId && validPromptIds.has(promptId))
    ));
    runtime.attempt = {
      ...(runtime.attempt || {}),
      triggeredPromptIds: normalized
    };
    return normalized;
  },

  revealInteractiveVideoPromptsUpTo(runtime, currentTime = 0, options = {}) {
    if (!runtime) return [];
    const triggerTime = Math.max(0, Number(currentTime || 0) || 0);
    const triggeredSet = new Set(runtime.attempt?.triggeredPromptIds || []);
    const answers = runtime.attempt?.answers || {};
    const newlyTriggered = (runtime.prompts || [])
      .filter(prompt => Number(prompt.triggerSecond || 0) <= triggerTime + 0.35)
      .filter(prompt => !triggeredSet.has(prompt.promptId));

    if (newlyTriggered.length === 0) return [];

    newlyTriggered.forEach(prompt => triggeredSet.add(prompt.promptId));
    this.setInteractiveVideoTriggeredPromptIds(runtime, Array.from(triggeredSet));

    if (options.activate !== false && !runtime.activePromptId) {
      const nextPrompt = newlyTriggered.find(prompt => this.shouldShowInteractiveVideoReplyAction(prompt, answers[prompt.promptId]));
      if (nextPrompt) {
        runtime.activePromptId = nextPrompt.promptId;
        if (options.pause !== false && nextPrompt.pauseVideo !== false && runtime.player?.pauseVideo) {
          runtime.player.pauseVideo();
        }
      }
    }

    return newlyTriggered;
  },

  openInteractiveVideoPrompt(promptId) {
    const runtime = this.currentInteractiveVideoRuntime;
    if (!runtime) return;
    const prompt = (runtime.prompts || []).find(item => item.promptId === promptId);
    if (!prompt) return;
    this.setInteractiveVideoTriggeredPromptIds(runtime, [
      ...(runtime.attempt?.triggeredPromptIds || []),
      prompt.promptId
    ]);
    runtime.activePromptId = prompt.promptId;
    if (runtime.player?.pauseVideo) {
      runtime.player.pauseVideo();
    }
    this.renderInteractiveVideoSidebar(runtime, { forceScroll: true });
  },

  buildInteractiveVideoTranscriptHtml(runtime) {
    const copy = this.getInteractiveVideoUiCopy();
    const prompts = runtime.prompts || [];
    const answers = runtime.attempt?.answers || {};
    const triggeredPromptIds = new Set([
      ...(runtime.attempt?.triggeredPromptIds || []),
      ...(runtime.attempt?.answeredPromptIds || [])
    ]);
    const messages = [];

    prompts.forEach((prompt) => {
      const answerRecord = answers[prompt.promptId];
      if (!triggeredPromptIds.has(prompt.promptId) && !answerRecord) return;
      const answerState = this.getInteractiveVideoAnswerState(prompt, answerRecord);
      const needsReply = this.shouldShowInteractiveVideoReplyAction(prompt, answerRecord);
      const stateLabel = answerState === 'correct'
        ? copy.correct
        : answerState === 'incorrect'
          ? copy.incorrect
          : answerState === 'unanswered'
            ? copy.unanswered
            : copy.answered;
      const actionLabel = answerState === 'incorrect' ? copy.retryPrompt : copy.replyPrompt;

      const speakerName = prompt.speakerName || runtime.config.speakerName || (I18n.getLocale() === 'en' ? 'Teacher' : '老師');
      messages.push(`
        <div class="interactive-video-bubble-row teacher">
          ${this.renderInteractiveVideoAvatar(speakerName, prompt.speakerAvatar || runtime.config.speakerAvatar, 'teacher')}
          <div class="interactive-video-bubble teacher ${needsReply ? 'needs-reply' : ''}">
            <div class="interactive-video-bubble-kicker">${this.escapeText(copy.teacherPrompt)}</div>
            <div class="interactive-video-bubble-text">${this.escapeText(prompt.question)}</div>
            <div class="interactive-video-prompt-state is-${this.escapeText(answerState)}">${this.escapeText(stateLabel)}</div>
            ${needsReply ? `
              <button type="button" class="interactive-video-reply-btn" onclick="MoodleUI.openInteractiveVideoPrompt(${this.toInlineActionValue(prompt.promptId)})">${this.escapeText(actionLabel)}</button>
            ` : ''}
          </div>
        </div>
      `);

      if (!answerRecord) return;

      messages.push(`
        <div class="interactive-video-bubble-row learner">
          <div class="interactive-video-bubble learner is-${this.escapeText(answerState)}">
            <div class="interactive-video-bubble-kicker">${this.escapeText(copy.learnerReply)}</div>
            <div class="interactive-video-bubble-text">${this.escapeText(this.resolveInteractiveVideoAnswerLabel(prompt, answerRecord))}</div>
          </div>
          ${this.renderInteractiveVideoAvatar(API.getCurrentUser()?.displayName || API.getCurrentUser()?.email || (I18n.getLocale() === 'en' ? 'You' : '我'), '', 'learner')}
        </div>
      `);

      const feedback = answerRecord.feedback || (answerRecord.isCorrect === false ? prompt.feedbackIncorrect : prompt.feedbackCorrect);
      if (feedback) {
        messages.push(`
          <div class="interactive-video-bubble-row teacher">
            ${this.renderInteractiveVideoAvatar(speakerName, prompt.speakerAvatar || runtime.config.speakerAvatar, 'teacher')}
            <div class="interactive-video-bubble teacher subtle">
              <div class="interactive-video-bubble-text">${this.escapeText(feedback)}</div>
            </div>
          </div>
        `);
      }
    });

    if (messages.length === 0) {
      return `<div class="interactive-video-empty">${this.escapeText(copy.emptyTranscript)}</div>`;
    }

    return messages.join('');
  },

  buildInteractiveVideoPromptCardHtml(runtime) {
    const copy = this.getInteractiveVideoUiCopy();
    const prompt = (runtime.prompts || []).find((item) => item.promptId === runtime.activePromptId);
    if (!prompt) {
      return `
        <div class="interactive-video-idle-card">
          <div class="interactive-video-idle-copy">${this.escapeText(copy.waiting)}</div>
        </div>
      `;
    }

    const answerRecord = runtime.attempt?.answers?.[prompt.promptId];
    const currentAnswer = answerRecord?.answer;
    const buttons = prompt.questionType === 'true_false'
      ? `
          <div class="interactive-video-options">
            <button type="button" class="interactive-video-option ${String(currentAnswer).toLowerCase() === 'true' ? 'is-selected' : ''}" onclick="MoodleUI.submitInteractiveVideoChoice(true)">${I18n.getLocale() === 'en' ? 'True' : '是'}</button>
            <button type="button" class="interactive-video-option ${String(currentAnswer).toLowerCase() === 'false' ? 'is-selected' : ''}" onclick="MoodleUI.submitInteractiveVideoChoice(false)">${I18n.getLocale() === 'en' ? 'False' : '否'}</button>
          </div>
        `
      : prompt.questionType === 'short_text_reflection'
        ? `
          <div class="interactive-video-text-answer">
            <textarea id="interactiveVideoTextAnswer" rows="4" placeholder="${this.escapeText(copy.reflectionPlaceholder)}">${this.escapeText(currentAnswer || '')}</textarea>
            <button type="button" class="interactive-video-submit" onclick="MoodleUI.submitInteractiveVideoText()">${this.escapeText(copy.submit)}</button>
          </div>
        `
        : `
          <div class="interactive-video-options">
            ${(prompt.options || []).map((option) => `
              <button type="button" class="interactive-video-option ${String(currentAnswer) === String(option.value) ? 'is-selected' : ''}" onclick="MoodleUI.submitInteractiveVideoChoice(${this.toInlineActionValue(option.value)})">${this.escapeText(option.label)}</button>
            `).join('')}
          </div>
        `;

    return `
      <div class="interactive-video-prompt-card">
        <div class="interactive-video-prompt-head">
          ${this.renderInteractiveVideoAvatar(prompt.speakerName || runtime.config.speakerName, prompt.speakerAvatar || runtime.config.speakerAvatar, 'teacher')}
          <div>
            <div class="interactive-video-prompt-label">${this.escapeText(copy.teacherPrompt)}</div>
            <div class="interactive-video-prompt-time">${this.escapeText(this.formatInteractiveVideoTime(prompt.triggerSecond))}</div>
          </div>
        </div>
        <div class="interactive-video-prompt-question">${this.escapeText(prompt.question)}</div>
        <div class="interactive-video-prompt-required">${this.escapeText(copy.questionRequired)}</div>
        ${buttons}
        <button type="button" class="interactive-video-defer-btn" onclick="MoodleUI.resumeInteractiveVideoPlayback()">${this.escapeText(copy.deferPrompt)}</button>
      </div>
    `;
  },

  buildInteractiveVideoSummaryHtml(runtime) {
    const copy = this.getInteractiveVideoUiCopy();
    const durationSeconds = Math.max(1, Number(runtime.config.durationSeconds || 0) || 1);
    const watchedSeconds = Number(runtime.attempt?.watchedSeconds || 0) || 0;
    const positionPercent = Math.min(100, Math.round((Number(runtime.currentTime || runtime.attempt?.lastPositionSecond || 0) / durationSeconds) * 100));
    const watchPercent = Math.max(
      Math.min(100, Math.round((watchedSeconds / durationSeconds) * 100)),
      Number(runtime.attempt?.progressPercentage || 0) || 0,
      positionPercent
    );
    const answeredCount = Array.isArray(runtime.attempt?.answeredPromptIds) ? runtime.attempt.answeredPromptIds.length : 0;
    const totalPrompts = Array.isArray(runtime.prompts) ? runtime.prompts.length : 0;
    const scoreReady = runtime.completedSummary?.scoreReady ?? runtime.attempt?.scoreReady ?? runtime.attempt?.status === 'completed';
    const score = Number(runtime.attempt?.score || 0) || 0;
    const maxScore = Number(runtime.attempt?.maxScore || 0) || 0;
    const scoreValue = maxScore > 0
      ? (scoreReady ? `${score}/${maxScore}` : `${copy.scorePending}/${maxScore}`)
      : '—';

    return `
      <div class="interactive-video-summary-card ${runtime.completedSummary?.status === 'completed' ? 'is-complete' : ''}">
        <div class="interactive-video-summary-grid">
          <div class="interactive-video-summary-item">
            <span>${this.escapeText(copy.watchProgress)}</span>
            <strong>${watchPercent}%</strong>
          </div>
          <div class="interactive-video-summary-item">
            <span>${this.escapeText(copy.answered)}</span>
            <strong>${answeredCount}/${totalPrompts}</strong>
          </div>
          <div class="interactive-video-summary-item">
            <span>${this.escapeText(copy.score)}</span>
            <strong>${this.escapeText(scoreValue)}</strong>
          </div>
          <div class="interactive-video-summary-item">
            <span>${this.escapeText(copy.watchedSeconds)}</span>
            <strong>${this.escapeText(this.formatInteractiveVideoTime(watchedSeconds))}</strong>
          </div>
        </div>
        ${runtime.completedSummary ? `
          <div class="interactive-video-summary-note">
            ${this.escapeText(runtime.completedSummary.completionEligible ? copy.completed : copy.completionPending)}
          </div>
        ` : ''}
      </div>
    `;
  },

  renderInteractiveVideoSidebar(runtime, { forceScroll = false } = {}) {
    if (!runtime?.overlay) return;
    const conversationEl = runtime.overlay.querySelector('[data-iv-conversation]');
    const transcriptEl = runtime.overlay.querySelector('[data-iv-transcript]');
    const promptEl = runtime.overlay.querySelector('[data-iv-prompt]');
    const summaryEl = runtime.overlay.querySelector('[data-iv-summary]');
    const shouldStickToBottom = forceScroll
      || !runtime.hasRenderedInteractiveVideoSidebar
      || (conversationEl
        ? (conversationEl.scrollHeight - conversationEl.scrollTop - conversationEl.clientHeight) <= 64
        : true);

    if (transcriptEl) transcriptEl.innerHTML = this.buildInteractiveVideoTranscriptHtml(runtime);
    if (promptEl) promptEl.innerHTML = this.buildInteractiveVideoPromptCardHtml(runtime);
    if (summaryEl) summaryEl.innerHTML = this.buildInteractiveVideoSummaryHtml(runtime);
    this.renderInteractiveVideoPlaybackControls(runtime);

    runtime.hasRenderedInteractiveVideoSidebar = true;
    if (conversationEl && shouldStickToBottom) {
      window.requestAnimationFrame(() => {
        conversationEl.scrollTop = conversationEl.scrollHeight;
      });
    }
  },

  renderInteractiveVideoPlaybackControls(runtime) {
    if (!runtime?.overlay) return;
    const copy = this.getInteractiveVideoUiCopy();
    const button = runtime.overlay.querySelector('[data-iv-toggle-playback]');
    const mode = runtime.overlay.querySelector('[data-iv-seek-mode]');
    const hint = runtime.overlay.querySelector('[data-iv-seek-hint]');
    const time = runtime.overlay.querySelector('[data-iv-current-time]');
    const isPlaying = runtime.playerState === 'playing';

    if (button) {
      button.textContent = isPlaying ? copy.pause : copy.play;
      button.dataset.state = isPlaying ? 'pause' : 'play';
    }
    if (mode) {
      mode.textContent = runtime.config?.allowSeeking === false ? copy.seekLocked : copy.seekAllowed;
      mode.dataset.mode = runtime.config?.allowSeeking === false ? 'locked' : 'open';
    }
    if (hint) {
      hint.textContent = runtime.config?.allowSeeking === false ? copy.seekLockedHint : copy.seekAllowedHint;
    }
    if (time) {
      time.textContent = this.formatInteractiveVideoTime(Math.floor(Number(runtime.currentTime || 0) || 0));
    }
  },

  safeSeekInteractiveVideo(runtime, seconds, allowSeekAhead = true) {
    if (!runtime?.player?.seekTo) return;
    runtime.seekGuardIgnoreUntil = Date.now() + 1600;
    runtime.currentTime = Math.max(0, Number(seconds || 0) || 0);
    runtime.lastTrackedTime = runtime.currentTime;
    runtime.player.seekTo(runtime.currentTime, allowSeekAhead);
  },

  toggleInteractiveVideoPlayback() {
    const runtime = this.currentInteractiveVideoRuntime;
    if (!runtime?.player) return;
    if (runtime.playerState === 'playing') {
      runtime.player.pauseVideo?.();
    } else {
      if (runtime.activePromptId) {
        runtime.activePromptId = null;
        this.renderInteractiveVideoSidebar(runtime);
      }
      runtime.player.playVideo?.();
    }
    this.renderInteractiveVideoPlaybackControls(runtime);
  },

  formatInteractiveVideoTime(totalSeconds = 0) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remain = seconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
  },

  async flushInteractiveVideoProgress(runtime, force = false) {
    if (!runtime?.courseId || !runtime?.activityId) return;
    const wholeSeconds = Math.floor(Number(runtime.pendingWatchSeconds || 0));
    const currentTime = Math.max(0, Math.floor(Number(runtime.currentTime || 0)));
    const hasProgressPayload = wholeSeconds > 0 || force;
    if (!hasProgressPayload) return;

    const durationSeconds = Math.max(1, Number(runtime.config.durationSeconds || 0) || 1);
    const nextWatchedSeconds = Math.max(0, Number(runtime.attempt?.watchedSeconds || 0) || 0) + wholeSeconds;
    const progressPercent = Math.min(100, Math.round((Math.max(currentTime, nextWatchedSeconds) / durationSeconds) * 100));
    const hasVerifiedCompletion = runtime.completedSummary?.completionEligible === true || runtime.attempt?.status === 'completed';
    // Course completion is finalized only after the interactive-video endpoint verifies prompt and score gates.
    const courseActivityProgress = hasVerifiedCompletion ? progressPercent : Math.min(progressPercent, 99);

    runtime.pendingWatchSeconds = Math.max(0, Number(runtime.pendingWatchSeconds || 0) - wholeSeconds);
    runtime.attempt = {
      ...(runtime.attempt || {}),
      watchedSeconds: nextWatchedSeconds,
      lastPositionSecond: currentTime,
      progressPercentage: progressPercent
    };

    this.renderInteractiveVideoSidebar(runtime);

    try {
      await Promise.all([
        API.interactiveVideos.heartbeat(runtime.courseId, runtime.activityId, {
          currentTime,
          playedDelta: wholeSeconds,
          playerState: runtime.playerState || 'paused',
          visible: document.visibilityState === 'visible',
          progressPercentage: progressPercent,
          triggeredPromptIds: runtime.attempt?.triggeredPromptIds || []
        }),
        API.courses.updateProgress(runtime.courseId, {
          activityId: runtime.activity.activityId,
          currentSectionId: runtime.activity.sectionId,
          timeSpent: wholeSeconds,
          activityProgress: courseActivityProgress
        })
      ]);
    } catch (error) {
      console.warn('Interactive video progress sync failed:', error);
    }
  },

  async finalizeInteractiveVideo(runtime, { autoComplete = false } = {}) {
    if (!runtime || runtime.isFinalizing) return;
    runtime.isFinalizing = true;

    try {
      await this.flushInteractiveVideoProgress(runtime, true);
      const result = await API.interactiveVideos.complete(runtime.courseId, runtime.activityId);
      if (result?.success) {
        const resultData = result.data || {};
        const hasScore = Object.prototype.hasOwnProperty.call(resultData, 'score');
        const hasScorePercent = Object.prototype.hasOwnProperty.call(resultData, 'scorePercent');
        runtime.completedSummary = result.data || null;
        runtime.attempt = {
          ...(runtime.attempt || {}),
          status: resultData.status || runtime.attempt?.status,
          score: hasScore ? resultData.score : runtime.attempt?.score,
          maxScore: resultData.maxScore ?? runtime.attempt?.maxScore,
          scorePercent: hasScorePercent ? resultData.scorePercent : runtime.attempt?.scorePercent,
          scoreReady: resultData.scoreReady ?? runtime.attempt?.scoreReady,
          allRequiredAnswered: resultData.allRequiredAnswered ?? runtime.attempt?.allRequiredAnswered,
          allRequiredCorrect: resultData.allRequiredCorrect ?? runtime.attempt?.allRequiredCorrect,
          watchedSeconds: resultData.watchedSeconds ?? runtime.attempt?.watchedSeconds,
          progressPercentage: resultData.watchPercent ?? runtime.attempt?.progressPercentage
        };

        if (resultData.completionEligible) {
          await API.courses.completeActivity(runtime.courseId, runtime.activityId);
          await this.triggerCourseCompletionCheck(runtime.courseId);
          if (autoComplete) {
            showToast(I18n.getLocale() === 'en'
              ? `Interactive video completed. Score: ${result.data.score ?? 0}${result.data.maxScore ? ` / ${result.data.maxScore}` : ''}`
              : `互動影片完成，分數：${result.data.score ?? 0}${result.data.maxScore ? ` / ${result.data.maxScore}` : ''}`);
          }
        }

        this.renderInteractiveVideoSidebar(runtime, { forceScroll: true });
      }
    } catch (error) {
      console.warn('Finalize interactive video failed:', error);
    } finally {
      runtime.isFinalizing = false;
    }
  },

  async submitInteractiveVideoChoice(answer) {
    const runtime = this.currentInteractiveVideoRuntime;
    if (!runtime?.activePromptId) return;
    const promptId = runtime.activePromptId;

    try {
      const result = await API.interactiveVideos.answer(runtime.courseId, runtime.activityId, {
        promptId,
        answer,
        currentTime: Math.floor(Number(runtime.currentTime || 0))
      });
      if (!result?.success) {
        showToast(result?.message || (I18n.getLocale() === 'en' ? 'Failed to save answer' : '儲存答案失敗'));
        return;
      }

      const resultData = result.data || {};
      const prompt = runtime.prompts.find((item) => item.promptId === promptId);
      const hasScore = Object.prototype.hasOwnProperty.call(resultData, 'score');
      const hasScorePercent = Object.prototype.hasOwnProperty.call(resultData, 'scorePercent');
      runtime.attempt = {
        ...(runtime.attempt || {}),
        answers: {
          ...((runtime.attempt && runtime.attempt.answers) || {}),
          [promptId]: {
            answer: resultData.answer ?? answer,
            isCorrect: resultData.isCorrect,
            feedback: resultData.feedback || '',
            pointsEarned: resultData.isCorrect === true ? Number(prompt?.points || 0) || 0 : 0,
            answeredAt: new Date().toISOString()
          }
        },
        answeredPromptIds: resultData.answeredPromptIds || runtime.attempt?.answeredPromptIds || [],
        triggeredPromptIds: resultData.triggeredPromptIds || runtime.attempt?.triggeredPromptIds || [],
        score: hasScore ? resultData.score : runtime.attempt?.score,
        maxScore: resultData.maxScore ?? runtime.attempt?.maxScore ?? 0,
        scorePercent: hasScorePercent ? resultData.scorePercent : runtime.attempt?.scorePercent,
        scoreReady: resultData.scoreReady ?? runtime.attempt?.scoreReady,
        allRequiredAnswered: resultData.allRequiredAnswered ?? runtime.attempt?.allRequiredAnswered,
        allRequiredCorrect: resultData.allRequiredCorrect ?? runtime.attempt?.allRequiredCorrect
      };
      runtime.activePromptId = null;
      this.renderInteractiveVideoSidebar(runtime);
      showToast(this.getInteractiveVideoUiCopy().saved);
      void this.finalizeInteractiveVideo(runtime, { autoComplete: true });
      if (runtime.player?.playVideo) {
        window.setTimeout(() => runtime.player.playVideo(), 320);
      }
    } catch (error) {
      console.error('Interactive video answer error:', error);
      showToast(I18n.getLocale() === 'en' ? 'Failed to save answer' : '儲存答案失敗');
    }
  },

  async submitInteractiveVideoText() {
    const textarea = document.getElementById('interactiveVideoTextAnswer');
    const value = textarea?.value?.trim();
    if (!value) return;
    return this.submitInteractiveVideoChoice(value);
  },

  resumeInteractiveVideoPlayback() {
    const runtime = this.currentInteractiveVideoRuntime;
    if (!runtime) return;
    if (runtime.activePromptId) {
      runtime.activePromptId = null;
      this.renderInteractiveVideoSidebar(runtime);
    }
    if (runtime?.player?.playVideo) {
      runtime.player.playVideo();
    }
    this.renderInteractiveVideoPlaybackControls(runtime);
  },

  async openInteractiveVideoActivity(activityId, courseId) {
    try {
      const copy = this.getInteractiveVideoUiCopy();
      const result = await API.interactiveVideos.get(courseId, activityId);
      if (!result?.success || !result.data?.interactiveVideo) {
        showToast(copy.invalidConfig);
        return;
      }

      const activity = {
        activityId: result.data.activityId,
        courseId: result.data.courseId,
        title: result.data.title,
        description: result.data.description || '',
        sectionId: result.data.sectionId || null
      };
      const config = this.normalizeInteractiveVideoConfig({
        type: 'interactive_video',
        url: result.data.interactiveVideo.videoUrl,
        youtubeId: result.data.interactiveVideo.youtubeId,
        interactiveVideo: result.data.interactiveVideo
      });
      if (!config.youtubeId) {
        showToast(copy.invalidConfig);
        return;
      }

      const sessionResult = await API.interactiveVideos.startSession(courseId, activityId);
      const attempt = sessionResult?.success
        ? (sessionResult.data?.attempt || result.data?.attempt || {})
        : (result.data?.attempt || {});

      const viewer = this.openActivityViewerShell({
        overlayId: 'interactive-video-viewer-overlay',
        title: result.data.title || copy.subtitle,
        subtitle: copy.subtitle,
        externalUrl: config.videoUrl
      });

      viewer.body.innerHTML = `
        <div class="interactive-video-layout">
          <div class="interactive-video-stage">
            <div class="interactive-video-player-shell">
              <div id="interactive-video-player" class="interactive-video-player"></div>
            </div>
            <div class="interactive-video-stage-controls">
              <button type="button" class="interactive-video-stage-toggle" data-iv-toggle-playback onclick="MoodleUI.toggleInteractiveVideoPlayback()">${this.escapeText(copy.play)}</button>
              <div class="interactive-video-stage-meta">
                <span class="interactive-video-stage-mode" data-iv-seek-mode>${this.escapeText(config.allowSeeking === false ? copy.seekLocked : copy.seekAllowed)}</span>
                <span class="interactive-video-stage-time" data-iv-current-time>${this.escapeText(this.formatInteractiveVideoTime(Number(attempt?.lastPositionSecond || 0) || 0))}</span>
              </div>
              <div class="interactive-video-stage-hint" data-iv-seek-hint>${this.escapeText(config.allowSeeking === false ? copy.seekLockedHint : copy.seekAllowedHint)}</div>
            </div>
          </div>
          <aside class="interactive-video-sidebar">
            <div class="interactive-video-sidebar-head">
              <div class="interactive-video-sidebar-title">${this.escapeText(result.data.title || copy.subtitle)}</div>
              <div class="interactive-video-sidebar-subtitle">${this.escapeText(activity.description || copy.resume)}</div>
            </div>
            <div class="interactive-video-summary-slot" data-iv-summary></div>
            <div class="interactive-video-conversation" data-iv-conversation>
              <div class="interactive-video-transcript" data-iv-transcript></div>
              <div class="interactive-video-prompt-slot" data-iv-prompt></div>
            </div>
            <div class="interactive-video-sidebar-actions">
              <button type="button" class="interactive-video-resume-btn" onclick="MoodleUI.resumeInteractiveVideoPlayback()">${this.escapeText(copy.continue)}</button>
            </div>
          </aside>
        </div>
      `;
      viewer.overlay.querySelector('.activity-viewer-shell')?.classList.add('activity-viewer-shell--interactive-video');
      viewer.body.classList.add('activity-viewer-body--interactive-video');

      const runtime = {
        overlay: viewer.overlay,
        courseId,
        activityId,
        activity,
        config,
        prompts: config.prompts || [],
        attempt: {
          ...(attempt || {}),
          answers: attempt?.answers || {},
          answeredPromptIds: attempt?.answeredPromptIds || [],
          triggeredPromptIds: attempt?.triggeredPromptIds || [],
          score: Object.prototype.hasOwnProperty.call(attempt || {}, 'score') ? attempt.score : null,
          maxScore: attempt?.maxScore ?? 0,
          scoreReady: attempt?.summary?.scoreReady ?? attempt?.scoreReady ?? attempt?.status === 'completed',
          allRequiredAnswered: attempt?.summary?.allRequiredAnswered ?? attempt?.allRequiredAnswered,
          allRequiredCorrect: attempt?.summary?.allRequiredCorrect ?? attempt?.allRequiredCorrect
        },
        currentTime: Number(attempt?.lastPositionSecond || 0) || 0,
        pendingWatchSeconds: 0,
        playerState: 'idle',
        maxUnlockedSecond: Number(attempt?.lastPositionSecond || 0) || 0,
        seekGuardIgnoreUntil: 0,
        hasSeekLockNotice: false,
        activePromptId: null,
        heartbeatTimer: null,
        pollTimer: null,
        lastTrackedTime: null,
        completedSummary: null,
        isFinalizing: false
      };
      this.currentInteractiveVideoRuntime = runtime;
      this.renderInteractiveVideoSidebar(runtime, { forceScroll: true });

      viewer.overlay._activityViewerCleanup = async () => {
        if (runtime.heartbeatTimer) clearInterval(runtime.heartbeatTimer);
        if (runtime.pollTimer) clearInterval(runtime.pollTimer);
        await this.finalizeInteractiveVideo(runtime, { autoComplete: false });
        if (runtime.player?.destroy) {
          try {
            runtime.player.destroy();
          } catch (error) {
            console.warn('Destroy interactive video player failed:', error);
          }
        }
        if (this.currentInteractiveVideoRuntime === runtime) {
          this.currentInteractiveVideoRuntime = null;
        }
      };

      try {
        await this.ensureYouTubeIframeApi();

        runtime.player = new window.YT.Player('interactive-video-player', {
          videoId: config.youtubeId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            controls: config.allowSeeking === false ? 0 : 1,
            disablekb: config.allowSeeking === false ? 1 : 0
          },
          events: {
            onReady: (event) => {
              const resumeSecond = Math.max(0, Math.floor(Number(runtime.attempt?.lastPositionSecond || 0) || 0));
              if (resumeSecond > 0 && event.target?.seekTo) {
                this.safeSeekInteractiveVideo(runtime, resumeSecond, true);
              }
              this.renderInteractiveVideoPlaybackControls(runtime);
            },
            onStateChange: (event) => {
              this.syncInteractiveVideoPlayerState(runtime, event.data);
            }
          }
        });
      } catch (youtubeApiError) {
        console.warn('Interactive video falling back to postMessage player:', youtubeApiError);
        runtime.player = this.createInteractiveVideoPostMessagePlayer(runtime, 'interactive-video-player');
        this.renderInteractiveVideoPlaybackControls(runtime);
        showToast(I18n.getLocale() === 'en'
          ? 'YouTube API was unavailable. Using compatible playback mode.'
          : 'YouTube API 載入失敗，已切換為相容播放模式。');
      }

      runtime.heartbeatTimer = window.setInterval(() => {
        this.flushInteractiveVideoProgress(runtime);
      }, 10000);

      runtime.pollTimer = window.setInterval(() => {
        if (!runtime.player || typeof runtime.player.getCurrentTime !== 'function') return;
        const currentTime = Number(runtime.player.getCurrentTime()) || 0;
        const seekLocked = runtime.config?.allowSeeking === false;
        const previousCurrentTime = Number(runtime.currentTime || 0) || 0;
        const previousUnlockedSecond = Math.max(0, Number(runtime.maxUnlockedSecond || 0) || 0);

        if (
          seekLocked
          && Date.now() > Number(runtime.seekGuardIgnoreUntil || 0)
          && currentTime > previousUnlockedSecond + 1.6
        ) {
          const restoreSecond = Math.max(0, previousUnlockedSecond);
          this.safeSeekInteractiveVideo(runtime, restoreSecond, true);
          runtime.playerState = 'paused';
          runtime.currentTime = restoreSecond;
          if (!runtime.hasSeekLockNotice) {
            runtime.hasSeekLockNotice = true;
            showToast(copy.seekBlockedToast);
            window.setTimeout(() => {
              if (this.currentInteractiveVideoRuntime === runtime) {
                runtime.hasSeekLockNotice = false;
              }
            }, 1800);
          }
          this.renderInteractiveVideoPlaybackControls(runtime);
          return;
        }

        runtime.currentTime = currentTime;

        if (runtime.playerState === 'playing' && document.visibilityState === 'visible' && Number.isFinite(runtime.lastTrackedTime)) {
          const delta = currentTime - runtime.lastTrackedTime;
          if (delta > 0 && delta <= 2) {
            runtime.pendingWatchSeconds += delta;
          }
        }

        if (
          runtime.playerState === 'playing'
          && currentTime >= previousUnlockedSecond
          && currentTime - previousCurrentTime <= 2.2
        ) {
          runtime.maxUnlockedSecond = currentTime;
        } else if (!seekLocked && currentTime > previousUnlockedSecond) {
          runtime.maxUnlockedSecond = currentTime;
        }
        runtime.lastTrackedTime = currentTime;

        const newlyTriggered = this.revealInteractiveVideoPromptsUpTo(runtime, currentTime, {
          activate: true,
          pause: runtime.playerState === 'playing'
        });
        if (newlyTriggered.length > 0) {
          this.renderInteractiveVideoSidebar(runtime, { forceScroll: true });
        }

        if (Math.floor(runtime.pendingWatchSeconds) >= 5) {
          this.flushInteractiveVideoProgress(runtime);
        }
        this.renderInteractiveVideoPlaybackControls(runtime);
      }, 400);
    } catch (error) {
      console.error('Open interactive video activity failed:', error);
      showToast(this.getInteractiveVideoUiCopy().invalidConfig);
    }
  },

  /**
   * 開啟網址活動 - YouTube 在平台內播放，其他開新分頁
   */
  async openUrlActivity(activityId, courseId) {
    try {
      const result = await API.courseActivities.get(courseId, activityId);
      if (!result.success || !result.data) {
        showToast(t('moodleActivity.loadActivityFailed'));
        return;
      }
      const activity = result.data;
      const url = activity.url || activity.externalUrl;
      if (!url) {
        showToast(t('moodleActivity.noUrl'));
        return;
      }

      // YouTube 影片：平台內嵌入播放
      const ytId = this.extractYouTubeId(url);
      if (ytId) {
        this.openVideoViewer(activity.name || activity.title || t('moodleActivity.video'), ytId, url, activity, courseId);
        return;
      }

      // 其他網頁：平台內 iframe 瀏覽
      this.openWebViewer(activity.name || activity.title || url, url, activity, courseId);
    } catch (error) {
      console.error('開啟網址活動失敗:', error);
      showToast(t('moodleActivity.loadActivityError'));
    }
  },

  /**
   * 共用活動 viewer shell
   */
  openActivityViewerShell({ overlayId, title, subtitle = '', externalUrl = '', externalLabel = '' }) {
    const isEnglish = I18n.getLocale() === 'en';
    const closeLabel = isEnglish ? 'Close' : '關閉';
    const defaultExternalHint = isEnglish ? 'External resource' : '外部資源';
    const defaultExternalLabel = isEnglish ? 'Open in new tab' : '在新分頁開啟';
    const existing = document.getElementById(overlayId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'activity-viewer-overlay';
    overlay.innerHTML = `
      <div class="activity-viewer-shell">
        <div class="activity-viewer-header">
          <div class="activity-viewer-title-block">
            <h3>${this.escapeText(title)}</h3>
            ${subtitle ? `<p>${this.escapeText(subtitle)}</p>` : ''}
          </div>
          <button type="button" class="activity-viewer-close" data-viewer-close aria-label="${this.escapeText(closeLabel)}">&times;</button>
        </div>
        <div class="activity-viewer-body"></div>
        ${externalUrl ? `
          <div class="activity-viewer-footer">
            <span class="activity-viewer-meta">${this.escapeText(defaultExternalHint)}</span>
            <a class="activity-viewer-link" href="${this.escapeText(externalUrl)}" target="_blank" rel="noopener noreferrer">
              ${this.escapeText(externalLabel || defaultExternalLabel)}
            </a>
          </div>
        ` : ''}
      </div>
    `;

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      Promise.resolve(typeof overlay._activityViewerCleanup === 'function' ? overlay._activityViewerCleanup() : null)
        .catch((error) => {
          console.error('Activity viewer cleanup failed:', error);
        });
    };
    const escHandler = (event) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });
    overlay.querySelector('[data-viewer-close]')?.addEventListener('click', close);

    document.body.appendChild(overlay);
    document.addEventListener('keydown', escHandler);

    return {
      overlay,
      body: overlay.querySelector('.activity-viewer-body'),
      close
    };
  },

  /**
   * YouTube 影片全螢幕播放器
   */
  openVideoViewer(title, youtubeId, originalUrl, activity = null, courseId = null) {
    const fallbackUrl = originalUrl || `https://www.youtube.com/watch?v=${youtubeId}`;
    const viewer = this.openActivityViewerShell({
      overlayId: 'video-viewer-overlay',
      title,
      subtitle: t('moodleActivity.video') || 'Video',
      externalUrl: fallbackUrl
    });

    viewer.body.innerHTML = `
      <div class="activity-viewer-frame">
        <iframe id="yt-embed-frame"
                class="activity-viewer-embed"
                src="https://www.youtube-nocookie.com/embed/${this.escapeText(youtubeId)}?autoplay=1&rel=0&modestbranding=1"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="autoplay; encrypted-media; fullscreen"
                allowfullscreen></iframe>
      </div>
    `;
    const session = this.createContentProgressSession(activity, courseId);
    session?.markReady();
    session?.attachToCleanup(viewer.overlay, '_activityViewerCleanup');
  },

  /**
   * 網頁全螢幕 iframe 瀏覽器（不跳出平台）
   */
  openWebViewer(title, url, activity = null, courseId = null) {
    const isEnglish = I18n.getLocale() === 'en';
    const viewer = this.openActivityViewerShell({
      overlayId: 'web-viewer-overlay',
      title,
      subtitle: url,
      externalUrl: url
    });

    viewer.body.innerHTML = `
      <div class="activity-viewer-frame">
        <div class="activity-tracking-bar">
          <span class="tracking-dot"></span>
          <span class="tracking-text">${isEnglish ? 'Tracking learning time...' : '學習時間追蹤中...'}</span>
          <span class="tracking-timer" id="web-viewer-timer">00:00</span>
        </div>
        <iframe src="${this.escapeText(url)}"
                class="activity-viewer-embed"
                allow="autoplay; encrypted-media; fullscreen"></iframe>
      </div>
    `;

    // 計時器顯示
    const timerEl = viewer.body.querySelector('#web-viewer-timer');
    const timerStart = Date.now();
    const timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerStart) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);

    // 外部平台用更長的自動完成時間
    const session = this.createContentProgressSession(activity, courseId, {
      autoCompleteAfterMs: this.externalPlatformAutoCompleteMs || 300000
    });
    session?.markReady();

    // 關閉時清除計時器
    const origCleanup = viewer.overlay._activityViewerCleanup;
    viewer.overlay._activityViewerCleanup = async () => {
      clearInterval(timerInterval);
      if (origCleanup) await origCleanup();
    };
    session?.attachToCleanup(viewer.overlay, '_activityViewerCleanup');
  },

  async ensurePdfJsLibrary() {
    if (window.pdfjsLib?.getDocument) {
      return window.pdfjsLib;
    }

    if (!this._pdfJsLibraryPromise) {
      this._pdfJsLibraryPromise = import('/vendor/pdfjs/legacy/build/pdf.mjs')
        .then((pdfjsLib) => {
          if (pdfjsLib?.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/legacy/build/pdf.worker.mjs';
          }
          window.pdfjsLib = pdfjsLib;
          return pdfjsLib;
        })
        .catch((error) => {
          this._pdfJsLibraryPromise = null;
          throw error;
        });
    }

    return this._pdfJsLibraryPromise;
  },

  async renderPdfActivityViewer({ viewer, url }) {
    const isEnglish = I18n.getLocale() === 'en';
    const loadingLabel = isEnglish ? 'Loading PDF…' : 'PDF 載入中…';
    const zoomOutLabel = isEnglish ? 'Zoom out' : '縮小';
    const zoomInLabel = isEnglish ? 'Zoom in' : '放大';
    const pageCountLabel = (count) => isEnglish ? `${count} pages` : `共 ${count} 頁`;
    const pageLabel = (pageNumber) => isEnglish ? `Page ${pageNumber}` : `第 ${pageNumber} 頁`;
    const loadErrorLabel = isEnglish ? 'This PDF cannot be previewed right now.' : '目前無法預覽這份 PDF。';

    viewer.body.innerHTML = `
      <div class="activity-viewer-frame activity-viewer-frame-pdf">
        <div class="activity-viewer-pdf-shell">
          <div class="activity-viewer-pdf-toolbar">
            <div class="activity-viewer-pdf-toolbar-group">
              <button type="button" class="activity-viewer-pdf-btn" data-pdf-zoom-out aria-label="${this.escapeText(zoomOutLabel)}">−</button>
              <span class="activity-viewer-pdf-scale" data-pdf-scale>110%</span>
              <button type="button" class="activity-viewer-pdf-btn" data-pdf-zoom-in aria-label="${this.escapeText(zoomInLabel)}">+</button>
            </div>
            <span class="activity-viewer-pdf-pages" data-pdf-pages>${this.escapeText(loadingLabel)}</span>
          </div>
          <div class="activity-viewer-pdf-canvas-wrap" data-pdf-canvas-wrap>
            <div class="activity-viewer-pdf-loading">${this.escapeText(loadingLabel)}</div>
          </div>
        </div>
      </div>
    `;

    const mount = viewer.body.querySelector('[data-pdf-canvas-wrap]');
    const scaleLabel = viewer.body.querySelector('[data-pdf-scale]');
    const pagesLabel = viewer.body.querySelector('[data-pdf-pages]');
    const zoomOutButton = viewer.body.querySelector('[data-pdf-zoom-out]');
    const zoomInButton = viewer.body.querySelector('[data-pdf-zoom-in]');
    const state = {
      destroyed: false,
      renderRunId: 0,
      renderTasks: [],
      scale: 1.1,
      pdf: null,
      loadingTask: null
    };
    let renderedSuccessfully = false;

    if (!mount || !scaleLabel || !pagesLabel || !zoomOutButton || !zoomInButton) {
      return false;
    }

    const cancelRenders = () => {
      state.renderTasks.forEach((task) => {
        try {
          task?.cancel?.();
        } catch (error) {
          console.warn('Cancel PDF render task failed:', error);
        }
      });
      state.renderTasks = [];
    };

    viewer.overlay._activityViewerCleanup = () => {
      state.destroyed = true;
      cancelRenders();
      try {
        state.loadingTask?.destroy?.();
      } catch (error) {
        console.warn('Destroy PDF loading task failed:', error);
      }
      try {
        state.pdf?.destroy?.();
      } catch (error) {
        console.warn('Destroy PDF document failed:', error);
      }
    };

    const pdfjsLib = await this.ensurePdfJsLibrary();
    if (state.destroyed) {
      return;
    }

    const renderDocument = async () => {
      if (!state.pdf || state.destroyed) {
        return;
      }

      const currentRunId = ++state.renderRunId;
      cancelRenders();
      scaleLabel.textContent = `${Math.round(state.scale * 100)}%`;
      pagesLabel.textContent = pageCountLabel(state.pdf.numPages);
      mount.innerHTML = `<div class="activity-viewer-pdf-loading">${this.escapeText(loadingLabel)}</div>`;

      try {
        const fragment = document.createDocumentFragment();
        for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
          if (state.destroyed || currentRunId !== state.renderRunId) {
            return;
          }

          const page = await state.pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: state.scale });
          const outputScale = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', { alpha: false });

          if (!context) {
            continue;
          }

          canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
          canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
          canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`;
          canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`;
          context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

          const renderTask = page.render({
            canvasContext: context,
            viewport
          });

          state.renderTasks.push(renderTask);
          await renderTask.promise;

          if (state.destroyed || currentRunId !== state.renderRunId) {
            return;
          }

          const pageCard = document.createElement('div');
          pageCard.className = 'activity-viewer-pdf-page';

          const pageMarker = document.createElement('div');
          pageMarker.className = 'activity-viewer-pdf-page-label';
          pageMarker.textContent = pageLabel(pageNumber);

          pageCard.appendChild(pageMarker);
          pageCard.appendChild(canvas);
          fragment.appendChild(pageCard);
        }

        if (state.destroyed || currentRunId !== state.renderRunId) {
          return;
        }

        mount.innerHTML = '';
        mount.appendChild(fragment);
        renderedSuccessfully = true;
      } catch (error) {
        if (error?.name === 'RenderingCancelledException' || state.destroyed) {
          return;
        }
        console.error('Render PDF document failed:', error);
        mount.innerHTML = `<div class="activity-viewer-pdf-error">${this.escapeText(loadErrorLabel)}</div>`;
      }
    };

    zoomOutButton.addEventListener('click', () => {
      if (state.destroyed) return;
      state.scale = Math.max(0.7, Number((state.scale - 0.1).toFixed(2)));
      renderDocument();
    });

    zoomInButton.addEventListener('click', () => {
      if (state.destroyed) return;
      state.scale = Math.min(2.2, Number((state.scale + 0.1).toFixed(2)));
      renderDocument();
    });

    try {
      state.loadingTask = pdfjsLib.getDocument({
        url,
        cMapUrl: '/vendor/pdfjs/cmaps/',
        cMapPacked: true
      });
      state.pdf = await state.loadingTask.promise;
      pagesLabel.textContent = pageCountLabel(state.pdf.numPages);
      await renderDocument();
      return renderedSuccessfully;
    } catch (error) {
      if (state.destroyed) {
        return false;
      }
      console.error('Load PDF document failed:', error);
      pagesLabel.textContent = '';
      mount.innerHTML = `<div class="activity-viewer-pdf-error">${this.escapeText(loadErrorLabel)}</div>`;
      return false;
    }
  },

  /**
   * 開啟檔案活動 - 在平台內預覽（禁止下載）
   */
  async openFileActivity(activityId, courseId) {
    try {
      const result = await API.courseActivities.get(courseId, activityId);
      if (!result.success || !result.data) {
        showToast(t('moodleActivity.loadFileFailed'));
        return;
      }
      const activity = result.data;
      const fileId = activity.fileId;
      if (!fileId) {
        showToast(t('moodleActivity.noFile'));
        return;
      }

      const viewUrl = `/api/files/${fileId}/view`;
      const title = activity.name || activity.title || t('moodleActivity.fileViewer');
      const contentType = activity.contentType || 'application/pdf';

      const token = localStorage.getItem('accessToken');
      const authedUrl = viewUrl + '?token=' + encodeURIComponent(token);
      const isPdf = contentType === 'application/pdf';
      const session = this.createContentProgressSession(activity, courseId);

      const viewer = this.openActivityViewerShell({
        overlayId: 'file-viewer-overlay',
        title,
        subtitle: contentType,
        externalUrl: isPdf ? '' : authedUrl
      });
      viewer.overlay.oncontextmenu = () => false;

      if (isPdf) {
        const rendered = await this.renderPdfActivityViewer({
          viewer,
          url: authedUrl
        });
        if (rendered) {
          session?.markReady();
        }
      } else if (contentType.startsWith('image/')) {
        viewer.body.innerHTML = `
          <div class="activity-viewer-frame">
            <div class="activity-viewer-media">
              <img src="${this.escapeText(authedUrl)}" oncontextmenu="return false" draggable="false" />
            </div>
          </div>
        `;
        session?.markReady();
      } else if (contentType.startsWith('video/')) {
        viewer.body.innerHTML = `
          <div class="activity-viewer-frame">
            <div class="activity-viewer-media">
              <video controls controlslist="nodownload" disablepictureinpicture oncontextmenu="return false">
                <source src="${this.escapeText(authedUrl)}" type="${this.escapeText(contentType)}">
              </video>
            </div>
          </div>
        `;
        const video = viewer.body.querySelector('video');
        session?.markReady();
        video?.addEventListener('ended', () => {
          session?.markCompletedNow();
        }, { once: true });
      } else {
        viewer.body.innerHTML = `
          <div class="activity-viewer-frame">
            <iframe src="${this.escapeText(authedUrl)}" class="activity-viewer-embed"></iframe>
          </div>
        `;
        session?.markReady();
      }
      session?.attachToCleanup(viewer.overlay, '_activityViewerCleanup');

    } catch (error) {
      console.error('開啟檔案活動失敗:', error);
      showToast(t('moodleActivity.loadFileError'));
    }
  },

  /**
   * 啟動 LTI 1.3 外部工具
   */
  async launchCourseLtiTool(activityId, courseId) {
    try {
      showToast(t('moodleActivity.launchingTool'));

      // 取得活動詳情以獲得 toolId
      const activity = await API.courseActivities.get(courseId, activityId);
      if (!activity.success || !activity.data) {
        showToast(t('moodleActivity.loadActivityFailed'));
        return;
      }

      const resolvedActivity = {
        ...activity.data,
        activityId: activity.data.activityId || activityId,
        sectionId: activity.data.sectionId || activity.data.currentSectionId || null
      };
      const toolId = resolvedActivity.toolId || resolvedActivity.ltiToolId;
      if (!toolId) {
        showToast(t('moodleActivity.noLtiTool'));
        return;
      }

      // 啟動 LTI OIDC 流程
      const baseUrl = window.location.origin;
      const token = localStorage.getItem('accessToken');
      const launchUrl = `${baseUrl}/api/lti/13/initiate?` + new URLSearchParams({
        tool_id: toolId,
        course_id: courseId,
        resource_link_id: activityId,
        target: 'iframe',
        ...(token && { token })
      }).toString();

      const progressSession = this.createContentProgressSession(resolvedActivity, courseId);

      // 建立啟動視窗/iframe
      this.openLtiLaunchModal(
        launchUrl,
        resolvedActivity.name || t('moodleLti.externalTool'),
        { progressSession }
      );

    } catch (error) {
      console.error('LTI launch error:', error);
      showToast(t('moodleActivity.launchFailed'));
    }
  },

  /**
   * 開啟 LTI 啟動 Modal
   */
  openLtiLaunchModal(launchUrl, toolName, options = {}) {
    const existing = document.getElementById('ltiLaunchModal');
    if (existing) this.closeModal('ltiLaunchModal');
    const safeToolName = this.escapeText(toolName || t('moodleLti.externalTool'));
    const openInWindowLabel = this.escapeText(t('moodleActivity.openNewWindow'));
    const closeLabel = this.escapeText(t('common.close'));
    const externalToolLabel = this.escapeText(t('moodleLti.externalTool'));
    const modal = document.createElement('div');
    modal.id = 'ltiLaunchModal';
    modal.className = 'modal-overlay active lti-launch-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-fullscreen lti-launch-modal-shell" role="dialog" aria-modal="true" aria-labelledby="ltiLaunchModalTitle">
        <div class="modal-header lti-launch-modal-header">
          <div class="modal-heading">
            <p class="modal-kicker">${externalToolLabel}</p>
            <h3 id="ltiLaunchModalTitle" class="modal-title">${safeToolName}</h3>
          </div>
          <div class="modal-header-actions">
            <button type="button" onclick="MoodleUI.openLtiInNewWindow()" class="btn-secondary btn-sm lti-launch-window-btn" title="${openInWindowLabel}" aria-label="${openInWindowLabel}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15,3 21,3 21,9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
            <button type="button" onclick="MoodleUI.closeModal('ltiLaunchModal')" class="modal-close" aria-label="${closeLabel}">&times;</button>
          </div>
        </div>
        <div class="modal-body lti-launch-modal-body">
          <iframe id="ltiLaunchFrame" class="lti-launch-frame" src="${launchUrl}" title="${safeToolName}"></iframe>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    if (options.progressSession && typeof options.progressSession.attachToCleanup === 'function') {
      options.progressSession.attachToCleanup(modal, '_modalCleanup');
    }

    // 儲存 launch URL 供新視窗使用
    this.currentLtiLaunchUrl = launchUrl;

    // 監聽 iframe 訊息（用於 Deep Linking 回傳）
    window.addEventListener('message', this.handleLtiMessage);
  },

  /**
   * 處理 LTI iframe 訊息
   */
  handleLtiMessage(event) {
    if (event.data.type === 'lti_deep_linking_complete') {
      showToast(`${t('moodleActivity.itemsAdded')} ${event.data.items?.length || 0} ${t('moodleActivity.itemsAddedSuffix')}`);
      MoodleUI.closeModal('ltiLaunchModal');
      // 重新載入課程頁面以顯示新內容
      if (MoodleUI.currentCourseId) {
        MoodleUI.openCourse(MoodleUI.currentCourseId);
      }
    } else if (event.data.type === 'lti_deep_linking_cancel') {
      MoodleUI.closeModal('ltiLaunchModal');
    }
  },

  /**
   * ${t('moodleActivity.openNewWindow')} LTI 工具
   */
  openLtiInNewWindow() {
    if (this.currentLtiLaunchUrl) {
      window.open(this.currentLtiLaunchUrl, '_blank', 'width=1024,height=768');
      this.closeModal('ltiLaunchModal');
    }
  },

  // 當前 LTI 啟動 URL
  currentLtiLaunchUrl: null,

  // LTI 工具快取
  ltiToolsCache: null,

  /**
   * 載入 LTI 工具列表到選擇框
   */
  async loadLtiTools() {
    try {
      // 如果有快取，直接使用
      if (this.ltiToolsCache) {
        return this.ltiToolsCache;
      }

      const response = await fetch('/api/lti/tools');
      if (!response.ok) {
        console.error('Failed to load LTI tools');
        return [];
      }

      const result = await response.json();
      if (result.success && result.data) {
        this.ltiToolsCache = result.data.filter(t => t.status === 'active');
        return this.ltiToolsCache;
      }
      return [];
    } catch (error) {
      console.error('Load LTI tools error:', error);
      return [];
    }
  },

  /**
   * 當選擇 LTI 活動類型時，載入工具列表
   */
  async onLtiActivityTypeSelected() {
    const select = document.getElementById('ltiToolSelect');
    if (!select) return;

    const tools = await this.loadLtiTools();

    select.innerHTML = `<option value="">${t('moodleLti.selectTool')}</option>` +
      tools.map(tool => `<option value="${tool.toolId}">${tool.name}</option>`).join('');
  },

  /**
   * 當選擇 LTI 工具時，顯示工具資訊
   */
  onLtiToolSelect() {
    const select = document.getElementById('ltiToolSelect');
    const infoDiv = document.getElementById('ltiToolInfo');
    const nameEl = document.getElementById('ltiToolName');
    const descEl = document.getElementById('ltiToolDesc');

    if (!select || !infoDiv) return;

    const toolId = select.value;
    if (!toolId) {
      infoDiv.hidden = true;
      return;
    }

    const tool = this.ltiToolsCache?.find(t => t.toolId === toolId);
    if (tool) {
      nameEl.textContent = tool.name;
      descEl.textContent = tool.description || t('moodleLti.noDescription');
      infoDiv.hidden = false;
    } else {
      infoDiv.hidden = true;
    }
  },

  /**
   * 啟動 Deep Linking 流程
   */
  async launchDeepLinking(toolId, courseId) {
    const baseUrl = window.location.origin;
    const token = localStorage.getItem('accessToken');
    const launchUrl = `${baseUrl}/api/lti/13/initiate?` + new URLSearchParams({
      tool_id: toolId,
      course_id: courseId,
      message_type: 'LtiDeepLinkingRequest',
      target: 'iframe',
      ...(token && { token })
    }).toString();

    this.openLtiLaunchModal(launchUrl, t('moodleLti.selectContent'));
  },

  // ==================== 新增章節/活動 Modal ====================

  /**
   * 開啟新增章節 Modal
   */
  openAddSection(courseId) {
    const modal = document.createElement('div');
    modal.id = 'addSectionModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${t('moodleSection.addTitle')}</h3>
          <button onclick="MoodleUI.closeModal('addSectionModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleSection.nameLabel')}</label>
            <input type="text" id="sectionName" placeholder="${t('moodleSection.namePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('moodleSection.summaryLabel')}</label>
            <textarea id="sectionSummary" rows="3" placeholder="${t('moodleSection.summaryPlaceholder')}"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('addSectionModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.submitAddSection('${courseId}')" class="btn-primary">${t('common.add')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('addSectionModal'); };
  },

  /**
   * 提交新增章節
   */
  async submitAddSection(courseId) {
    const name = document.getElementById('sectionName').value.trim();
    const summary = document.getElementById('sectionSummary').value.trim();

    if (!name) {
      showToast(t('moodleSection.nameRequired'));
      return;
    }

    try {
      const result = await API.courseSections.create(courseId, { title: name, summary });
      if (result.success) {
        showToast(t('moodleSection.added'));
        this.closeModal('addSectionModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || t('moodleSection.addFailed'));
      }
    } catch (error) {
      console.error('Add section error:', error);
      showToast(t('moodleSection.addFailed'));
    }
  },

  /**
   * 開啟新增活動 Modal
   */
  openAddActivity(courseId, sectionId) {
    const modal = document.createElement('div');
    modal.id = 'addActivityModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleAddActivity.title')}</h3>
          <button onclick="MoodleUI.closeModal('addActivityModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="activity-types-grid">
            <button type="button" class="activity-type-card" onclick="MoodleUI.selectActivityType('page', this)">
              <div class="type-icon tone-olive">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              </div>
              <span>${t('moodleAddActivity.typePage')}</span>
              <p>${t('moodleAddActivity.typePageDesc')}</p>
            </button>
            <button type="button" class="activity-type-card" onclick="MoodleUI.selectActivityType('url', this)">
              <div class="type-icon tone-indigo">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeUrl')}</span>
              <p>${t('moodleAddActivity.typeUrlDesc')}</p>
            </button>
            <button type="button" class="activity-type-card" onclick="MoodleUI.selectActivityType('file', this)">
              <div class="type-icon tone-emerald">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeFile')}</span>
              <p>${t('moodleAddActivity.typeFileDesc')}</p>
            </button>
            <button type="button" class="activity-type-card" onclick="MoodleUI.selectActivityType('interactive_video', this)">
              <div class="type-icon tone-sky">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><polygon points="10,8 16,11 10,14"/><path d="M7 20h10"/><path d="M9 17v3"/><path d="M15 17v3"/></svg>
              </div>
              <span>${I18n.getLocale() === 'en' ? 'Interactive video' : '互動影片'}</span>
              <p>${I18n.getLocale() === 'en' ? 'Pause a YouTube video at timeline checkpoints and ask learners questions in a sidebar.' : '在 YouTube 影片時間點自動停下，於右側 sidebar 提問並記錄作答。'}</p>
            </button>
            <button type="button" class="activity-type-card" onclick="MoodleUI.openActivityBuilderFromCourse('assignment', ${this.toInlineActionValue(courseId)}, ${this.toInlineActionValue(sectionId)})">
              <div class="type-icon tone-terracotta">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeAssignment')}</span>
              <p>${t('moodleAddActivity.typeAssignmentDesc')}</p>
            </button>
            <button type="button" class="activity-type-card" onclick="MoodleUI.openActivityBuilderFromCourse('quiz', ${this.toInlineActionValue(courseId)}, ${this.toInlineActionValue(sectionId)})">
              <div class="type-icon tone-violet">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeQuiz')}</span>
              <p>${t('moodleAddActivity.typeQuizDesc')}</p>
            </button>
            <button type="button" class="activity-type-card" onclick="MoodleUI.openActivityBuilderFromCourse('forum', ${this.toInlineActionValue(courseId)}, ${this.toInlineActionValue(sectionId)})">
              <div class="type-icon tone-amber">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeForum')}</span>
              <p>${t('moodleAddActivity.typeForumDesc')}</p>
            </button>
            <button type="button" class="activity-type-card" onclick="MoodleUI.selectActivityType('lti', this)">
              <div class="type-icon tone-pink">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeLti')}</span>
              <p>${t('moodleAddActivity.typeLtiDesc')}</p>
            </button>
          </div>

          <div id="activityFormArea" class="activity-form-shell" hidden>
            <!-- 活動表單會動態插入這裡 -->
          </div>
        </div>
        <div class="modal-footer" id="activityModalFooter" hidden>
          <button onclick="MoodleUI.closeModal('addActivityModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.submitAddActivity(${this.toInlineActionValue(courseId)}, ${this.toInlineActionValue(sectionId)})" class="btn-primary">${t('moodleCourse.addActivity')}</button>
        </div>
      </div>
    `;
    modal.dataset.courseId = courseId || '';
    modal.dataset.sectionId = sectionId || '';
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('addActivityModal'); };
  },

  selectedActivityType: null,

  async openActivityBuilderFromCourse(type, courseId, sectionId) {
    const normalizedType = String(type || '').trim();
    this.closeModal('addActivityModal');

    if (normalizedType === 'assignment') {
      await this.openAssignmentBuilderModal({ courseId, sectionId, returnTo: 'course' });
      return;
    }

    if (normalizedType === 'quiz') {
      await this.openQuizBuilderModal({ courseId, sectionId, returnTo: 'course' });
      return;
    }

    if (normalizedType === 'forum') {
      await this.openForumBuilderModal({ courseId, sectionId, returnTo: 'course' });
    }
  },

  /**
   * 選擇活動類型
   */
  selectActivityType(type, triggerEl = null) {
    this.selectedActivityType = type;
    const isRichBuilderType = ['assignment', 'quiz', 'forum'].includes(type);

    if (isRichBuilderType) {
      const modal = document.getElementById('addActivityModal');
      this.openActivityBuilderFromCourse(type, modal?.dataset.courseId || null, modal?.dataset.sectionId || null);
      return;
    }

    // 高亮選中的卡片
    document.querySelectorAll('.activity-type-card').forEach(card => card.classList.remove('selected'));
    if (triggerEl) triggerEl.classList.add('selected');

    // 顯示表單
    const formArea = document.getElementById('activityFormArea');
    const footer = document.getElementById('activityModalFooter');
    formArea.hidden = false;
    footer.hidden = false;
    formArea.dataset.selectedType = type;
    const footerPrimaryButton = footer.querySelector('.btn-primary');
    if (footerPrimaryButton) {
      footerPrimaryButton.dataset.selectedType = type;
      footerPrimaryButton.textContent = t('moodleCourse.addActivity');
    }

    // 根據類型顯示不同表單
    formArea.innerHTML = this.getActivityForm(type);

    // 如果是 LTI 類型，載入工具列表
    if (type === 'lti') {
      this.onLtiActivityTypeSelected();
    }
  },

  /**
   * 取得活動表單
   */
  getActivityForm(type) {
    const commonFields = `
      <div class="form-group">
        <label>${t('moodleAddActivity.nameLabel')}</label>
        <input type="text" id="activityName" placeholder="${t('moodleAddActivity.namePlaceholder')}">
      </div>
      <div class="form-group">
        <label>${t('moodleAddActivity.descLabel')}</label>
        <textarea id="activityDescription" rows="3" placeholder="${t('moodleAddActivity.descPlaceholder')}"></textarea>
      </div>
    `;

    switch (type) {
      case 'page':
        return commonFields + `
          <div class="form-group">
            <label>${t('moodleAddActivity.pageContentLabel')}</label>
            <textarea id="pageContent" rows="8" placeholder="${t('moodleAddActivity.pageContentPlaceholder')}"></textarea>
          </div>
        `;
      case 'url':
        return commonFields + `
          <div class="form-group">
            <label>${t('moodleAddActivity.urlLabel')}</label>
            <input type="url" id="urlValue" placeholder="https://...">
          </div>
        `;
      case 'file':
        return commonFields + `
          <div class="form-group">
            <label>${t('moodleAddActivity.fileLabel')}</label>
            <input type="file" id="fileUpload">
          </div>
        `;
      case 'interactive_video':
        return commonFields + `
          <div class="form-group">
            <label>${I18n.getLocale() === 'en' ? 'YouTube URL' : 'YouTube 連結'}</label>
            <input type="url" id="interactiveVideoUrl" placeholder="https://www.youtube.com/watch?v=...">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${I18n.getLocale() === 'en' ? 'Teacher name' : '老師名稱'}</label>
              <input type="text" id="interactiveVideoSpeakerName" placeholder="${I18n.getLocale() === 'en' ? 'Teacher Lin' : '林老師'}">
            </div>
            <div class="form-group">
              <label>${I18n.getLocale() === 'en' ? 'Teacher avatar URL' : '老師頭像 URL'}</label>
              <input type="url" id="interactiveVideoSpeakerAvatar" placeholder="/uploads/teacher-avatar.png">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${I18n.getLocale() === 'en' ? 'Grading mode' : '評分模式'}</label>
              <select id="interactiveVideoGradingMode">
                <option value="graded">${I18n.getLocale() === 'en' ? 'Graded' : '計分'}</option>
                <option value="practice">${I18n.getLocale() === 'en' ? 'Practice only' : '僅練習'}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${I18n.getLocale() === 'en' ? 'Passing score' : '通過分數'}</label>
              <input type="number" id="interactiveVideoPassingScore" value="70" min="0" max="100">
            </div>
            <div class="form-group">
              <label>${I18n.getLocale() === 'en' ? 'Min watch %' : '最少觀看比例 %'}</label>
              <input type="number" id="interactiveVideoWatchPercent" value="85" min="0" max="100">
            </div>
          </div>
          <div class="form-group form-checkbox-row">
            <label class="checkbox-label" for="interactiveVideoAllowSeeking">
              <input type="checkbox" id="interactiveVideoAllowSeeking" name="interactiveVideoAllowSeeking" checked>
              <span>${this.escapeText(this.getInteractiveVideoEditorCopy().allowSeeking)}</span>
            </label>
            <p class="form-hint">${this.escapeText(this.getInteractiveVideoEditorCopy().allowSeekingHint)}</p>
          </div>
          ${this.buildInteractiveVideoPromptEditor('')}
        `;
      case 'lti':
        return commonFields + `
          <div class="form-group">
            <label>${t('moodleAddActivity.ltiToolLabel')}</label>
            <select id="ltiToolSelect" onchange="MoodleUI.onLtiToolSelect()">
              <option value="">${t('moodleLti.selectTool')}</option>
            </select>
            <p class="form-hint">${t('moodleAddActivity.ltiToolHint')}</p>
          </div>
          <div id="ltiToolInfo" class="lti-tool-info-card" hidden>
            <h4 id="ltiToolName"></h4>
            <p id="ltiToolDesc"></p>
          </div>
          <div class="form-group form-checkbox-row">
            <label>
              <input type="checkbox" id="ltiDeepLinking">
              ${t('moodleAddActivity.deepLinkLabel')}
            </label>
            <p class="form-hint">${t('moodleAddActivity.deepLinkHint')}</p>
          </div>
        `;
      default:
        return commonFields;
    }
  },

  /**
   * 提交新增活動
   */
  async submitAddActivity(courseId, sectionId) {
    const modalSelectedType = document.getElementById('activityFormArea')?.dataset.selectedType
      || document.querySelector('#activityModalFooter .btn-primary')?.dataset.selectedType
      || this.selectedActivityType;

    this.selectedActivityType = modalSelectedType || this.selectedActivityType;

    if (['assignment', 'quiz', 'forum'].includes(modalSelectedType)) {
      this.closeModal('addActivityModal');
      if (modalSelectedType === 'assignment') {
        await this.openAssignmentBuilderModal({ courseId, sectionId, returnTo: 'course' });
      } else if (modalSelectedType === 'quiz') {
        await this.openQuizBuilderModal({ courseId, sectionId, returnTo: 'course' });
      } else {
        await this.openForumBuilderModal({ courseId, sectionId, returnTo: 'course' });
      }
      return;
    }

    const name = document.getElementById('activityName')?.value.trim();
    const description = document.getElementById('activityDescription')?.value.trim();

    if (!name) {
      showToast(t('moodleAddActivity.nameRequired'));
      return;
    }

    const activityData = {
      type: this.selectedActivityType,
      title: name,
      description,
      visible: true
    };

    // 根據類型收集額外資料
    switch (this.selectedActivityType) {
      case 'page':
        activityData.content = document.getElementById('pageContent')?.value;
        break;
      case 'url':
        activityData.url = document.getElementById('urlValue')?.value;
        break;
      case 'file':
        activityData.file = document.getElementById('fileUpload')?.files?.[0] || null;
        if (!activityData.file) {
          showToast(I18n.getLocale() === 'en' ? 'Please choose a file.' : '請選擇檔案');
          return;
        }
        break;
      case 'interactive_video':
        try {
          Object.assign(activityData, this.buildInteractiveVideoConfigFromForm());
        } catch (error) {
          showToast(error.message === 'INVALID_INTERACTIVE_VIDEO_PROMPTS'
            ? (I18n.getLocale() === 'en' ? 'Please complete each interactive video prompt before saving.' : '請先完成每一張互動影片提問卡的設定。')
            : (I18n.getLocale() === 'en' ? 'Please enter a valid YouTube URL.' : '請輸入有效的 YouTube 連結。'));
          return;
        }
        break;
      case 'lti':
        const toolId = document.getElementById('ltiToolSelect')?.value;
        const useDeepLinking = document.getElementById('ltiDeepLinking')?.checked;
        if (!toolId) {
          showToast(t('moodleAddActivity.ltiToolRequired'));
          return;
        }
        activityData.toolId = toolId;
        activityData.ltiToolId = toolId;
        // 如果使用 Deep Linking，先建立活動再啟動 Deep Linking
        if (useDeepLinking) {
          activityData.deepLinking = true;
        }
        break;
    }

    try {
      let result;

      if (this.selectedActivityType === 'file') {
        const uploadResult = await API.files.upload(activityData.file, `courses/${courseId}`);
        if (!uploadResult.success || !uploadResult.data?.fileId) {
          showToast(uploadResult.message || t('moodleAddActivity.addFailed'));
          return;
        }
        result = await API.courseSections.addActivity(courseId, sectionId, {
          type: 'file',
          title: activityData.title,
          description: activityData.description,
          fileId: uploadResult.data.fileId,
          visible: true
        });
      } else {
        result = await API.courseSections.addActivity(courseId, sectionId, activityData);
      }

      if (result.success) {
        showToast(t('moodleAddActivity.added'));
        this.closeModal('addActivityModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || t('moodleAddActivity.addFailed'));
      }
    } catch (error) {
      console.error('Add activity error:', error);
      showToast(t('moodleAddActivity.addFailed'));
    }
  },

  /**
   * 建立通用 Modal
   */
  createModal(modalId, title, bodyHtml, options = {}) {
    // 移除同 ID 的舊 modal
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay active';
    modal.onclick = (e) => { if (e.target === modal) this.closeModal(modalId); };

    const maxWidth = options.maxWidth || '600px';
    const contentClassName = options.className ? ` ${String(options.className).trim()}` : '';
    const bodyClassName = options.bodyClassName ? ` ${String(options.bodyClassName).trim()}` : '';
    const kicker = options.kicker || (I18n.getLocale() === 'en' ? 'Workspace' : '工作區');
    const description = options.description || '';

    modal.innerHTML = `
      <div class="modal-content modal-generic${contentClassName}">
        <div class="modal-header">
          <div class="modal-heading">
            <p class="modal-kicker">${this.escapeText(kicker)}</p>
            <h3 class="modal-title">${this.escapeText(title)}</h3>
            ${description ? `<p class="modal-description">${this.escapeText(description)}</p>` : ''}
          </div>
          <button class="modal-close" onclick="MoodleUI.closeModal('${modalId}')">&times;</button>
        </div>
        <div class="modal-body modal-scroll-body${bodyClassName}">
          ${bodyHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('.modal-content')?.style.setProperty('--modal-max-width', maxWidth);
    return modal;
  },

  /**
   * 關閉 Modal
   */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    const cleanup = modal && typeof modal._modalCleanup === 'function'
      ? modal._modalCleanup
      : null;
    if (modal) modal.remove();
    Promise.resolve(cleanup ? cleanup() : null).catch((error) => {
      console.error('Modal cleanup failed:', error);
    });
    if (modalId === 'editActivityModal') {
      this.currentEditingActivity = null;
    }
    if (modalId === 'addActivityModal') {
      this.selectedActivityType = null;
    }
    if (modalId === 'assignmentBuilderModal') {
      this.currentAssignmentBuilderState = null;
    }
    if (modalId === 'quizBuilderModal') {
      this.currentQuizBuilderState = null;
    }
    if (modalId === 'forumBuilderModal') {
      this.currentForumBuilderState = null;
    }
    if (modalId === 'quizQuestionEditorModal') {
      this.currentQuizQuestionEditorState = null;
    }
    if (modalId === 'quizQuestionBankModal') {
      this.currentQuizQuestionBankPicker = null;
    }
    if (modalId === 'ltiLaunchModal') {
      window.removeEventListener('message', this.handleLtiMessage);
      this.currentLtiLaunchUrl = null;
    }
  },

  escapeText(value) {
    if (typeof window.escapeHtml === 'function') {
      return window.escapeHtml(value);
    }
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatMultilineText(value) {
    return this.escapeText(value).replace(/\n/g, '<br>');
  },

  truncateText(value, maxLength = 160) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength).trim()}...`;
  },

  clampProgressValue(value) {
    if (window.PlatformUIRuntime?.clampProgressValue) {
      return window.PlatformUIRuntime.clampProgressValue(value);
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, numeric));
  },

  getSoftAccentBackground(color) {
    if (window.PlatformUIRuntime?.getSoftAccentBackground) {
      return window.PlatformUIRuntime.getSoftAccentBackground(color);
    }
    const normalized = String(color || '').trim();
    const cssVarPalette = {
      'var(--olive)': 'rgba(111, 135, 58, 0.16)',
      'var(--terracotta)': 'rgba(190, 96, 62, 0.16)',
      'var(--gray-500)': 'rgba(107, 114, 128, 0.16)',
      'var(--gray-400)': 'rgba(148, 163, 184, 0.16)'
    };
    if (cssVarPalette[normalized]) return cssVarPalette[normalized];

    const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      const fullHex = hex.length === 3
        ? hex.split('').map(part => part + part).join('')
        : hex;
      const red = parseInt(fullHex.slice(0, 2), 16);
      const green = parseInt(fullHex.slice(2, 4), 16);
      const blue = parseInt(fullHex.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, 0.16)`;
    }

    const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
      const parts = rgbMatch[1]
        .split(',')
        .map(part => Number(part.trim()))
        .filter(Number.isFinite);
      if (parts.length >= 3) {
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.16)`;
      }
    }

    return 'rgba(148, 163, 184, 0.16)';
  },

  getScopedNodes(root, selector) {
    if (window.PlatformUIRuntime?.getScopedNodes) {
      return window.PlatformUIRuntime.getScopedNodes(root, selector);
    }
    const nodes = [];
    if (!root) return nodes;
    if (root instanceof Element && root.matches(selector)) {
      nodes.push(root);
    }
    if (typeof root.querySelectorAll === 'function') {
      nodes.push(...root.querySelectorAll(selector));
    }
    return nodes;
  },

  applyDynamicUiMetrics(root = document) {
    if (window.PlatformUIRuntime?.applyRuntimeUi) {
      window.PlatformUIRuntime.applyRuntimeUi(root);
      return;
    }
    this.getScopedNodes(root, '[data-progress-width]').forEach((node) => {
      node.style.width = `${this.clampProgressValue(node.dataset.progressWidth)}%`;
    });

    this.getScopedNodes(root, '[data-cover-gradient]').forEach((node) => {
      const gradient = node.dataset.coverGradient;
      if (gradient) {
        node.style.background = gradient;
      }
    });

    this.getScopedNodes(root, '[data-accent-color]').forEach((node) => {
      const accentColor = node.dataset.accentColor || 'var(--gray-400)';
      node.style.color = accentColor;
      node.style.background = this.getSoftAccentBackground(accentColor);
    });

    this.getScopedNodes(root, '[data-tree-indent]').forEach((node) => {
      const indentLevel = Number(node.dataset.treeIndent);
      const paddingLeft = Number.isFinite(indentLevel) ? Math.max(0, indentLevel * 20) : 0;
      node.style.paddingLeft = `${paddingLeft}px`;
    });
  },

  ensureDynamicUiMetricsObserver() {
    if (window.PlatformUIRuntime?.observeRuntimeUi) {
      window.PlatformUIRuntime.observeRuntimeUi(document.body);
      return;
    }
    if (this._dynamicUiMetricsObserver || typeof MutationObserver === 'undefined' || !document.body) {
      return;
    }

    this._dynamicUiMetricsObserver = new MutationObserver((mutations) => {
      const seenNodes = new Set();
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element) || seenNodes.has(node)) return;
          seenNodes.add(node);
          this.applyDynamicUiMetrics(node);
        });
      });
    });

    this._dynamicUiMetricsObserver.observe(document.body, { childList: true, subtree: true });
  },

  formatPlatformDate(value, options = {}) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const locale = I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW';
    return new Intl.DateTimeFormat(locale, options).format(date);
  },

  toInlineActionValue(value) {
    return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  },

  getForumTypeMeta(type = 'general') {
    const map = {
      news: { label: '公告', className: 'type-news' },
      general: { label: '一般討論', className: 'type-general' },
      qanda: { label: '問與答', className: 'type-qanda' },
      social: { label: '社交交流', className: 'type-social' }
    };
    return map[type] || { label: type || '一般討論', className: 'type-general' };
  },

  getForumModeLabel(mode = 'standard') {
    const isEnglish = I18n.getLocale() === 'en';
    const map = {
      standard: isEnglish ? 'Standard forum' : '一般論壇',
      single: isEnglish ? 'Single discussion thread' : '單一討論串'
    };
    return map[mode] || mode || (isEnglish ? 'Standard forum' : '一般論壇');
  },

  getForumSubscriptionModeLabel(mode = 'optional') {
    const isEnglish = I18n.getLocale() === 'en';
    const map = {
      optional: isEnglish ? 'Optional subscription' : '自由訂閱',
      forced: isEnglish ? 'Forced subscription' : '強制訂閱',
      auto: isEnglish ? 'Auto subscribe' : '自動訂閱',
      disabled: isEnglish ? 'Subscriptions off' : '停用訂閱'
    };
    return map[mode] || mode || (isEnglish ? 'Optional subscription' : '自由訂閱');
  },

  renderForumState(message, variant = 'empty') {
    if (typeof window.renderDiscussionState === 'function') {
      return window.renderDiscussionState(message, variant);
    }
    return `<div class="forum-thread-state"><div class="forum-thread-state-title">${this.escapeText(message)}</div></div>`;
  },

  getSurfaceToneClass(seedValue = '') {
    const tones = ['tone-olive', 'tone-violet', 'tone-sky', 'tone-mint', 'tone-gold', 'tone-rose'];
    const seed = String(seedValue || 'surface');
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return tones[Math.abs(hash) % tones.length];
  },

  renderActivityCollectionHeader({ backAction, title, subtitle, ctaAction, ctaLabel, metaChips = [] }) {
    const chips = metaChips
      .filter(chip => chip && chip.label)
      .map(chip => `<span class="activity-chip${chip.tone ? ` ${chip.tone}` : ''}">${this.escapeText(chip.label)}</span>`)
      .join('');

    return `
      <div class="activity-shell-header">
        <div class="activity-shell-heading">
          <button type="button" class="btn-secondary activity-back-btn" onclick="${backAction}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
          </button>
          <div class="activity-shell-copy">
            <h2>${this.escapeText(title)}</h2>
            <p>${this.escapeText(subtitle)}</p>
            ${chips ? `<div class="activity-shell-meta">${chips}</div>` : ''}
          </div>
        </div>
        ${ctaAction && ctaLabel ? `
          <button type="button" class="btn-primary" onclick="${ctaAction}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            ${this.escapeText(ctaLabel)}
          </button>
        ` : ''}
      </div>
    `;
  },

  renderActivityEmptyState({ icon, title, hint = '' }) {
    return `
      <div class="activity-empty-state">
        ${icon}
        <h3>${this.escapeText(title)}</h3>
        ${hint ? `<p>${this.escapeText(hint)}</p>` : ''}
      </div>
    `;
  },

  getDifficultyMeta(difficulty = 'beginner') {
    const key = String(difficulty || 'beginner').toLowerCase();
    const isEnglish = I18n.getLocale() === 'en';
    const map = {
      beginner: {
        label: t('moodlePaths.beginner') || (isEnglish ? 'Beginner' : '初階'),
        className: 'beginner',
        toneClass: 'tone-mint',
        icon: '🌱'
      },
      intermediate: {
        label: t('moodlePaths.intermediate') || (isEnglish ? 'Intermediate' : '中階'),
        className: 'intermediate',
        toneClass: 'tone-gold',
        icon: '🧭'
      },
      advanced: {
        label: t('moodlePaths.advanced') || (isEnglish ? 'Advanced' : '進階'),
        className: 'advanced',
        toneClass: 'tone-rose',
        icon: '🚀'
      }
    };
    return map[key] || {
      label: difficulty || (isEnglish ? 'General' : '一般'),
      className: 'intermediate',
      toneClass: this.getSurfaceToneClass(difficulty || 'path'),
      icon: '📘'
    };
  },

  getBadgeTypeLabel(type = '') {
    const map = {
      course: t('moodleBadges.course'),
      site: t('moodleBadges.site'),
      manual: t('moodleBadges.manual')
    };
    return map[type] || type || '—';
  },

  getBadgeIconOptions() {
    return [
      { value: 'trophy', label: t('moodleBadges.iconTrophy') },
      { value: 'star', label: t('moodleBadges.iconStar') },
      { value: 'graduation-cap', label: t('moodleBadges.iconGradCap') },
      { value: 'medal', label: t('moodleBadges.iconMedal') },
      { value: 'gem', label: t('moodleBadges.iconDiamond') },
      { value: 'sparkles', label: t('moodleBadges.iconShiningStar') },
      { value: 'books', label: t('moodleBadges.iconBooks') },
      { value: 'target', label: t('moodleBadges.iconTarget') }
    ];
  },

  normalizeBadgeIcon(icon = '') {
    const normalized = String(icon || '').trim().toLowerCase();
    const legacyMap = {
      '🏆': 'trophy',
      trophy: 'trophy',
      award: 'trophy',
      '⭐': 'star',
      star: 'star',
      '🎓': 'graduation-cap',
      graduationcap: 'graduation-cap',
      'graduation-cap': 'graduation-cap',
      cap: 'graduation-cap',
      '🏅': 'medal',
      medal: 'medal',
      '💎': 'gem',
      gem: 'gem',
      diamond: 'gem',
      '🌟': 'sparkles',
      sparkles: 'sparkles',
      shiningstar: 'sparkles',
      '📚': 'books',
      books: 'books',
      book: 'books',
      '🎯': 'target',
      target: 'target'
    };
    return legacyMap[normalized] || 'trophy';
  },

  renderBadgeIcon(icon = 'trophy') {
    const key = this.normalizeBadgeIcon(icon);
    const icons = {
      trophy: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 4h8v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4V4Z"/>
          <path d="M7 5H4a1 1 0 0 0-1 1 4 4 0 0 0 4 4"/>
          <path d="M17 5h3a1 1 0 0 1 1 1 4 4 0 0 1-4 4"/>
          <path d="M12 11v4"/>
          <path d="M9 21h6"/>
          <path d="M10 15h4v3h-4z"/>
        </svg>
      `,
      star: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.9 6.8 19.99l.99-5.78-4.21-4.1 5.82-.85L12 3Z"/>
        </svg>
      `,
      'graduation-cap': `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m2 9 10-5 10 5-10 5-10-5Z"/>
          <path d="M6 11.5V16c0 .6 2.7 3 6 3s6-2.4 6-3v-4.5"/>
          <path d="M22 9v6"/>
        </svg>
      `,
      medal: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8 3 4 6 4-6"/>
          <path d="M12 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/>
          <path d="m12 13 1.2 2.1 2.3.3-1.7 1.6.4 2.3-2.2-1.2-2.2 1.2.4-2.3-1.7-1.6 2.3-.3L12 13Z"/>
        </svg>
      `,
      gem: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 4h12l4 5-10 11L2 9l4-5Z"/>
          <path d="m9 4 3 16 3-16"/>
          <path d="M2 9h20"/>
        </svg>
      `,
      sparkles: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z"/>
          <path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/>
          <path d="m19 12 .9 2.6L22.5 15l-2.6.9L19 18.5l-.9-2.6-2.6-.9 2.6-.9L19 12Z"/>
        </svg>
      `,
      books: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5A2.5 2.5 0 0 0 17.5 16H4V5.5Z"/>
          <path d="M4 16v2a2 2 0 0 0 2 2h14"/>
          <path d="M8 7h7"/>
          <path d="M8 10h7"/>
        </svg>
      `,
      target: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8"/>
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v3"/>
          <path d="M12 19v3"/>
          <path d="M2 12h3"/>
          <path d="M19 12h3"/>
          <circle cx="12" cy="12" r="1.5"/>
        </svg>
      `
    };
    return `<span class="badge-icon-glyph badge-icon-${key}" aria-hidden="true">${icons[key] || icons.trophy}</span>`;
  },

  updateBadgeIconPreview(iconValue = null) {
    const preview = document.getElementById('badgeIconPreview');
    const label = document.getElementById('badgeIconPreviewLabel');
    if (!preview) return;
    const iconKey = this.normalizeBadgeIcon(iconValue || document.getElementById('badgeIcon')?.value);
    const option = this.getBadgeIconOptions().find(item => item.value === iconKey);
    preview.innerHTML = this.renderBadgeIcon(iconKey);
    if (label) {
      label.textContent = option?.label || '';
    }
  },

  getBadgeStatusLabel(status = '') {
    return status === 'active' ? t('common.active') : t('common.draft');
  },

  getManagementStatusMeta(status = '', fallbackLabel = '') {
    const key = String(status || '').toLowerCase();
    const labelMap = {
      active: t('common.active'),
      published: t('common.published'),
      draft: t('common.draft'),
      inactive: t('common.inactive'),
      archived: t('moodleScorm.archived'),
      completed: t('common.completed'),
      complete: t('common.completed'),
      pending: t('common.pending'),
      failed: t('common.failed')
    };
    const toneMap = {
      active: 'is-success',
      published: 'is-success',
      completed: 'is-success',
      complete: 'is-success',
      draft: 'is-warning',
      pending: 'is-warning',
      inactive: 'is-neutral',
      archived: 'is-neutral',
      failed: 'is-danger'
    };
    return {
      label: fallbackLabel || labelMap[key] || status || '—',
      toneClass: toneMap[key] || 'is-neutral'
    };
  },

  renderManagementStatusBadge(status = '', fallbackLabel = '') {
    const meta = this.getManagementStatusMeta(status, fallbackLabel);
    return `<span class="management-status-badge ${meta.toneClass}">${this.escapeText(meta.label)}</span>`;
  },

  renderManagementMetricGrid(cards = []) {
    const items = cards
      .filter(card => card && card.label)
      .map(card => `
        <div class="management-metric-card${card.tone ? ` ${card.tone}` : ''}">
          <div class="management-metric-value">${this.escapeText(card.value ?? '—')}</div>
          <div class="management-metric-label">${this.escapeText(card.label)}</div>
          ${card.helper ? `<div class="management-metric-helper">${this.escapeText(card.helper)}</div>` : ''}
        </div>
      `)
      .join('');
    return items ? `<div class="management-metric-grid">${items}</div>` : '';
  },

  renderManagementDetailHeader({ backAction, backLabel, kicker = '', title, subtitle = '', actions = [] }) {
    const buttons = actions
      .filter(action => action && action.label && action.onclick)
      .map(action => `
        <button type="button" class="${action.className || 'btn-secondary'}" onclick="${action.onclick}">
          ${this.escapeText(action.label)}
        </button>
      `)
      .join('');

    return `
      <button type="button" class="management-back-link" onclick="${backAction}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15,18 9,12 15,6"/>
        </svg>
        ${this.escapeText(backLabel || t('common.back') || '返回')}
      </button>
      <div class="management-detail-header">
        <div class="management-detail-copy">
          ${kicker ? `<div class="management-detail-kicker">${this.escapeText(kicker)}</div>` : ''}
          <h2>${this.escapeText(title)}</h2>
          ${subtitle ? `<p>${this.escapeText(subtitle)}</p>` : ''}
        </div>
        ${buttons ? `<div class="management-detail-actions">${buttons}</div>` : ''}
      </div>
    `;
  },

  getAuditCategoryClass(eventType = '') {
    const value = String(eventType || '').toLowerCase();
    if (!value) return 'category-system';
    if (/(security|auth|login|password|token|session)/.test(value)) return 'category-security';
    if (/(user|role|permission|profile)/.test(value)) return 'category-user';
    if (/(course|enrol|enroll|class)/.test(value)) return 'category-course';
    if (/(assignment|submission)/.test(value)) return 'category-assignment';
    if (/(quiz|attempt|question)/.test(value)) return 'category-quiz';
    if (/(grade|score|rubric)/.test(value)) return 'category-grade';
    if (/(file|upload|resource|download)/.test(value)) return 'category-file';
    return 'category-system';
  },

  renderH5pTypeIcon(contentType = '') {
    const type = String(contentType || '').toLowerCase();
    const stroke = 'currentColor';
    if (type.includes('video')) {
      return `
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="10 8 16 12 10 16 10 8"/>
          <rect x="3" y="5" width="18" height="14" rx="2"/>
        </svg>
      `;
    }
    if (type.includes('presentation')) {
      return `
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="12" rx="2"/>
          <line x1="8" y1="20" x2="16" y2="20"/>
          <line x1="12" y1="16" x2="12" y2="20"/>
        </svg>
      `;
    }
    if (type.includes('quiz')) {
      return `
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M9.5 9a2.5 2.5 0 014.6 1.3c0 1.6-2.1 2-2.1 3.4"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `;
    }
    if (type.includes('drag')) {
      return `
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 7h8"/>
          <path d="M8 12h8"/>
          <path d="M8 17h8"/>
          <path d="M5 7h.01"/>
          <path d="M5 12h.01"/>
          <path d="M5 17h.01"/>
        </svg>
      `;
    }
    if (type.includes('dialog') || type.includes('card')) {
      return `
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="5" width="16" height="12" rx="2"/>
          <path d="M8 21l4-4 4 4"/>
        </svg>
      `;
    }
    if (type.includes('timeline')) {
      return `
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"/>
          <circle cx="8" cy="12" r="2"/>
          <circle cx="16" cy="12" r="2"/>
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
      </svg>
    `;
  },

  renderAssignmentCard(assignment, { teacherView = false, showCourse = false } = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    const a = this.normalizeAssignmentState(assignment || {});
    const title = a.title || (isEnglish ? 'Untitled assignment' : '未命名作業');
    const description = this.truncateText(a.description || '', teacherView ? 120 : 140);
    const dueDate = a.dueDate ? new Date(a.dueDate) : null;
    const isPastDue = dueDate instanceof Date && !Number.isNaN(dueDate.getTime()) && dueDate < new Date();
    const isStudentOverdue = isPastDue && !a.submitted;
    const dueLabel = a.dueDate
      ? `${t('moodleAssignment.duePrefix')}：${this.formatPlatformDate(a.dueDate, { dateStyle: 'medium', timeStyle: 'short' })}`
      : '';
    const pointsLabel = a.maxPoints ? `${a.maxPoints} ${t('moodleAssignment.points')}` : '';
    const metaItems = [
      showCourse && a.courseName ? a.courseName : '',
      dueLabel,
      pointsLabel
    ].filter(Boolean);

    const statusMeta = teacherView
      ? {
          label: isPastDue ? (isEnglish ? 'Closed' : '已截止') : (isEnglish ? 'Open' : '進行中'),
          tone: isPastDue ? 'is-danger' : 'is-success'
        }
      : a.graded
        ? (a.gradePendingRelease
          ? { label: t('moodleAssignment.pendingRelease'), tone: 'is-neutral' }
          : { label: t('moodleAssignment.statusGraded'), tone: 'is-accent' })
        : a.submitted
          ? {
              label: a.submission?.isLate
                ? (isEnglish ? 'Submitted late' : '逾時提交')
                : t('moodleAssignment.statusSubmitted'),
              tone: a.submission?.isLate ? 'is-warning' : 'is-success'
            }
          : isStudentOverdue
            ? { label: t('moodleAssignment.statusOverdue'), tone: 'is-danger' }
            : { label: t('moodleAssignment.statusPending'), tone: 'is-neutral' };

    const submissions = Number(a.stats?.totalSubmissions || 0);
    const graded = Number(a.stats?.gradedCount || 0);
    const gradeText = a.gradePendingRelease
      ? t('moodleGrade.pendingReleaseLabel')
      : a.graded && a.grade !== null && a.grade !== undefined
      ? `${a.grade}/${a.maxPoints || 100}`
      : '';

    return `
      <button type="button" class="assignment-card${teacherView ? ' is-teacher-card' : ''}" onclick="MoodleUI.openAssignment(${this.toInlineActionValue(a.assignmentId)})">
        <div class="assignment-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
        </div>
        <div class="activity-card-main">
          <div class="activity-card-topline">
            <div class="assignment-info activity-card-copy">
              <span class="activity-card-kicker">${teacherView ? (isEnglish ? 'Assignment management' : '作業管理') : (isEnglish ? 'Assignment' : '作業')}</span>
              <h3>${this.escapeText(title)}</h3>
            </div>
            <span class="activity-status-chip ${statusMeta.tone}">${this.escapeText(statusMeta.label)}</span>
          </div>
          ${description ? `<p class="activity-card-description">${this.escapeText(description)}</p>` : ''}
          ${metaItems.length ? `<div class="activity-card-meta">${metaItems.map(item => `<span>${this.escapeText(item)}</span>`).join('')}</div>` : ''}
          <div class="activity-card-footer">
            ${teacherView ? `
              <div class="activity-card-aside">
                <div class="activity-card-metrics">
                  <div class="activity-card-metric">
                    <strong>${submissions}</strong>
                    <span>${isEnglish ? 'Submitted' : '已提交'}</span>
                  </div>
                  <div class="activity-card-metric">
                    <strong>${graded}</strong>
                    <span>${isEnglish ? 'Graded' : '已評分'}</span>
                  </div>
                </div>
              </div>
            ` : `
              <div class="assignment-status">
                ${gradeText ? `<span class="grade">${this.escapeText(gradeText)}</span>` : ''}
              </div>
            `}
            <span class="activity-card-open">${teacherView ? (isEnglish ? 'Review work' : '查看批改') : (isEnglish ? 'Open assignment' : '查看作業')} →</span>
          </div>
        </div>
      </button>
    `;
  },

  renderQuizCard(quiz, { teacherView = false, showCourse = false } = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    const q = this.normalizeQuizState(quiz || {});
    const title = q.title || (isEnglish ? 'Untitled quiz' : '未命名測驗');
    const description = this.truncateText(q.description || '', teacherView ? 120 : 140);
    const now = new Date();
    const openDate = q.openDate ? new Date(q.openDate) : null;
    const closeDate = q.closeDate ? new Date(q.closeDate) : null;
    const hasOpened = !openDate || (!Number.isNaN(openDate.getTime()) && openDate <= now);
    const hasClosed = Boolean(closeDate && !Number.isNaN(closeDate.getTime()) && closeDate < now);
    const isOpen = hasOpened && !hasClosed;
    const questionCount = q.questionCount || q.questions?.length || 0;
    const attemptsAllowed = (q.maxAttempts === 0 || q.maxAttempts === null || q.maxAttempts === undefined)
      ? (isEnglish ? 'Unlimited attempts' : '不限次數')
      : `${q.maxAttempts} ${t('moodleQuiz.attemptsAllowed')}`;
    const metaItems = [
      showCourse && q.courseName ? q.courseName : '',
      `${questionCount} ${t('moodleQuiz.questionsUnit')}`,
      q.timeLimit ? `${q.timeLimit} ${t('moodleQuiz.minutes')}` : t('moodleQuiz.noTimeLimit'),
      teacherView ? (q.totalPoints ? `${q.totalPoints} ${t('moodleAssignment.points')}` : '') : attemptsAllowed
    ].filter(Boolean);

    const attempts = Number(q.stats?.totalAttempts || 0);
    const averageScore = q.stats?.averageScore;
    const averageScoreNumber = Number(averageScore);
    const bestScoreNumber = Number(q.bestScore);
    const averageScoreLabel = averageScore !== undefined && averageScore !== null && averageScore !== '' && Number.isFinite(averageScoreNumber)
      ? averageScoreNumber.toFixed(0)
      : '-';
    const resultsAvailable = this.isQuizResultAvailable(q);
    const bestScoreLabel = !resultsAvailable
      ? this.getQuizResultUnavailableLabel(q)
      : q.bestScore !== undefined && q.bestScore !== null && q.bestScore !== ''
      ? `${Number.isFinite(bestScoreNumber) ? bestScoreNumber.toFixed(0) : q.bestScore} ${t('moodleQuiz.score')}`
      : `- ${t('moodleQuiz.score')}`;

    let studentStatusHtml = '';
    if (q.completed) {
      studentStatusHtml = `
        <div class="quiz-status">
          <span class="score">${this.escapeText(bestScoreLabel)}</span>
        </div>
      `;
    } else if (isOpen && q.canAttempt !== false) {
      studentStatusHtml = `
        <div class="quiz-status">
          <button type="button" class="btn-primary activity-inline-action" onclick="event.stopPropagation(); MoodleUI.startQuiz(${this.toInlineActionValue(q.quizId)})">
            ${t('moodleQuiz.startQuiz')}
          </button>
        </div>
      `;
    } else {
      studentStatusHtml = '<div class="quiz-status"></div>';
    }

    const teacherStatusMeta = isOpen
      ? { label: isEnglish ? 'Open' : '開放中', tone: 'is-success' }
      : hasClosed
        ? { label: isEnglish ? 'Closed' : '已關閉', tone: 'is-neutral' }
        : { label: isEnglish ? 'Scheduled' : '未開放', tone: 'is-warning' };
    const studentStatusMeta = q.completed
      ? (!resultsAvailable
        ? { label: this.getQuizResultUnavailableLabel(q), tone: 'is-neutral' }
        : { label: t('moodleQuiz.completed'), tone: 'is-accent' })
      : isOpen && q.canAttempt !== false
        ? { label: isEnglish ? 'Available now' : '可立即作答', tone: 'is-success' }
        : {
            label: isOpen
              ? (isEnglish ? 'Attempt limit reached' : '已達作答上限')
              : hasClosed
                ? (isEnglish ? 'Closed' : '已關閉')
                : t('moodleQuiz.notAvailable'),
            tone: isOpen ? 'is-warning' : 'is-neutral'
          };
    const openAction = teacherView ? 'MoodleUI.openQuizResults' : 'MoodleUI.openQuiz';

    return `
      <div class="quiz-card${teacherView ? ' is-teacher-card' : ''}">
        <button type="button" class="quiz-card-main" onclick="${openAction}(${this.toInlineActionValue(q.quizId)})">
          <div class="quiz-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="activity-card-main">
            <div class="activity-card-topline">
              <div class="quiz-info activity-card-copy">
                <span class="activity-card-kicker">${teacherView ? (isEnglish ? 'Quiz analytics' : '測驗分析') : (isEnglish ? 'Quiz' : '測驗')}</span>
                <h3>${this.escapeText(title)}</h3>
              </div>
              <span class="activity-status-chip ${(teacherView ? teacherStatusMeta : studentStatusMeta).tone}">${this.escapeText((teacherView ? teacherStatusMeta : studentStatusMeta).label)}</span>
            </div>
            ${description ? `<p class="activity-card-description">${this.escapeText(description)}</p>` : ''}
            ${metaItems.length ? `<div class="activity-card-meta">${metaItems.map(item => `<span>${this.escapeText(item)}</span>`).join('')}</div>` : ''}
          </div>
        </button>
        <div class="activity-card-footer">
          ${teacherView ? `
            <div class="activity-card-aside">
              <div class="activity-card-metrics">
                <div class="activity-card-metric">
                  <strong>${attempts}</strong>
                  <span>${isEnglish ? 'Attempts' : '作答次數'}</span>
                </div>
                <div class="activity-card-metric">
                  <strong>${this.escapeText(averageScoreLabel)}</strong>
                  <span>${isEnglish ? 'Avg score' : '平均分'}</span>
                </div>
              </div>
            </div>
          ` : `
            ${studentStatusHtml}
          `}
          <button type="button" class="activity-card-open-btn" onclick="${openAction}(${this.toInlineActionValue(q.quizId)})">${teacherView ? (isEnglish ? 'View analytics' : '查看結果') : (isEnglish ? 'Open quiz' : '查看測驗')} →</button>
        </div>
      </div>
    `;
  },

  isAssignmentPastDue(assignment = {}) {
    const dueDate = assignment?.dueDate ? new Date(assignment.dueDate) : null;
    return Boolean(dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < new Date());
  },

  createAssignmentSubmissionDraft(assignment = {}) {
    const normalized = this.normalizeAssignmentState(assignment);
    const submission = normalized.submission || {};
    return {
      assignmentId: normalized.assignmentId,
      courseId: normalized.courseId,
      submissionType: normalized.submissionType,
      content: submission.content || '',
      existingFiles: this.normalizeAssignmentFiles(submission.files || []),
      pendingFiles: [],
      graded: Boolean(normalized.graded),
      submittedAt: submission.submittedAt || null,
      isLate: Boolean(submission.isLate),
      lateBy: Number(submission.lateBy || 0)
    };
  },

  renderAssignmentFileRows(files = [], { removable = false, removeHandler = '', downloadHandler = '' } = {}) {
    const normalizedFiles = this.normalizeAssignmentFiles(files);
    if (!normalizedFiles.length) return '';

    return normalizedFiles.map((file, index) => {
      const filename = this.escapeText(file.name || file.filename || file.fileName || `file_${index + 1}`);
      const sizeLabel = file.size ? `<span class="file-size">(${this.escapeText(this.formatFileSize(file.size))})</span>` : '';
      const uploadedAt = file.uploadedAt
        ? `<span class="assignment-file-meta">${this.escapeText(this.formatPlatformDate(file.uploadedAt, { dateStyle: 'medium', timeStyle: 'short' }) || '')}</span>`
        : '';
      const downloadControl = (file.downloadUrl || file.legacyDataUrl || file.content)
        ? (downloadHandler
          ? `<button type="button" class="assignment-file-action" onclick="${downloadHandler}(${index})">${t('common.download') || '下載'}</button>`
          : `<a class="assignment-file-action" href="${this.escapeText(file.downloadUrl)}" target="_blank" rel="noopener noreferrer">${t('common.download') || '下載'}</a>`)
        : '';
      const removeControl = removable
        ? `<button type="button" class="assignment-file-action is-danger" onclick="${removeHandler}(${index})">${t('common.remove') || '移除'}</button>`
        : '';

      return `
        <div class="selected-file assignment-file-row">
          <div class="assignment-file-copy">
            <span class="file-name">${filename}</span>
            ${sizeLabel}
            ${uploadedAt}
          </div>
          <div class="assignment-file-actions">
            ${downloadControl}
            ${removeControl}
          </div>
        </div>
      `;
    }).join('');
  },

  renderAssignmentDraftFiles() {
    const container = document.getElementById('selectedFiles');
    if (!container) return;

    const draft = this.assignmentSubmissionDraft;
    if (!draft) {
      container.innerHTML = '';
      return;
    }

    const existingHtml = this.renderAssignmentFileRows(draft.existingFiles, {
      removable: !draft.graded,
      removeHandler: 'MoodleUI.removeAssignmentExistingFile',
      downloadHandler: 'MoodleUI.downloadDraftAssignmentExistingFile'
    });
    const pendingHtml = (draft.pendingFiles || []).map((file, index) => `
      <div class="selected-file assignment-file-row is-pending">
        <div class="assignment-file-copy">
          <span class="file-name">${this.escapeText(file.name || `file_${index + 1}`)}</span>
          <span class="file-size">(${this.escapeText(this.formatFileSize(file.size || 0))})</span>
          <span class="assignment-file-meta">${I18n.getLocale() === 'en' ? 'Ready to upload' : '待上傳'}</span>
        </div>
        <div class="assignment-file-actions">
          <button type="button" class="assignment-file-action is-danger" onclick="MoodleUI.removeAssignmentPendingFile(${index})">${t('common.remove') || '移除'}</button>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      ${existingHtml ? `<div class="assignment-file-group"><div class="assignment-file-group-title">${I18n.getLocale() === 'en' ? 'Current attachments' : '目前附件'}</div>${existingHtml}</div>` : ''}
      ${pendingHtml ? `<div class="assignment-file-group"><div class="assignment-file-group-title">${I18n.getLocale() === 'en' ? 'New attachments' : '新附件'}</div>${pendingHtml}</div>` : ''}
    `;
  },

  syncAssignmentSubmissionContent(value) {
    if (!this.assignmentSubmissionDraft) return;
    this.assignmentSubmissionDraft.content = value;
    this.scheduleAssignmentDraftSave();
  },

  scheduleAssignmentDraftSave() {
    const draft = this.assignmentSubmissionDraft;
    if (!draft || !draft.assignmentId) return;
    // 已正式提交的草稿不再存（避免覆蓋後端已有提交）
    if (draft.submittedAt || draft.graded) return;
    if (this._assignmentDraftTimer) clearTimeout(this._assignmentDraftTimer);
    this._assignmentDraftTimer = setTimeout(() => {
      this.persistAssignmentDraft().catch(err => console.warn('Autosave draft failed:', err));
    }, 1200);
  },

  async persistAssignmentDraft() {
    const draft = this.assignmentSubmissionDraft;
    if (!draft || !draft.assignmentId) return;
    if (draft.submittedAt || draft.graded) return;
    if (!API.assignments?.saveDraft) return;
    try {
      const indicator = document.getElementById('assignmentDraftIndicator');
      if (indicator) {
        indicator.textContent = I18n.getLocale() === 'en' ? 'Saving draft…' : '儲存草稿中…';
        indicator.dataset.state = 'saving';
      }
      const result = await API.assignments.saveDraft(draft.assignmentId, {
        content: draft.content || '',
        files: this.normalizeAssignmentFiles(draft.existingFiles || [])
      });
      if (indicator) {
        const now = new Date();
        const time = now.toLocaleTimeString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW', {
          hour: '2-digit', minute: '2-digit'
        });
        indicator.textContent = result?.success
          ? (I18n.getLocale() === 'en' ? `Draft saved · ${time}` : `草稿已儲存 · ${time}`)
          : (I18n.getLocale() === 'en' ? 'Autosave failed' : '自動儲存失敗');
        indicator.dataset.state = result?.success ? 'saved' : 'error';
      }
    } catch (error) {
      const indicator = document.getElementById('assignmentDraftIndicator');
      if (indicator) {
        indicator.textContent = I18n.getLocale() === 'en' ? 'Autosave failed' : '自動儲存失敗';
        indicator.dataset.state = 'error';
      }
      console.warn('Persist assignment draft failed:', error);
    }
  },

  async hydrateAssignmentDraftFromServer(assignmentId) {
    const draft = this.assignmentSubmissionDraft;
    if (!draft || !assignmentId || !API.assignments?.getDraft) return;
    if (draft.submittedAt || draft.graded) return;
    try {
      const result = await API.assignments.getDraft(assignmentId);
      const data = result?.data;
      if (!data) return;
      // 若伺服器草稿比記憶體更新且非空，回填
      if (data.content && !draft.content) {
        draft.content = data.content;
        const textarea = document.getElementById('submissionContent');
        if (textarea) textarea.value = data.content;
      }
      if (Array.isArray(data.files) && data.files.length > 0 && (!draft.existingFiles || draft.existingFiles.length === 0)) {
        draft.existingFiles = this.normalizeAssignmentFiles(data.files);
        this.renderAssignmentDraftFiles();
      }
    } catch (error) {
      console.warn('Hydrate draft failed:', error);
    }
  },

  handleAssignmentFileSelect(input) {
    const draft = this.assignmentSubmissionDraft;
    if (!draft || !input?.files?.length) return;

    const files = Array.from(input.files);
    const maxFiles = Number(this.currentAssignmentDetail?.maxFiles || 0);
    const nextCount = (draft.existingFiles?.length || 0) + (draft.pendingFiles?.length || 0) + files.length;

    if (maxFiles > 0 && nextCount > maxFiles) {
      showToast(I18n.getLocale() === 'en'
        ? `You can upload up to ${maxFiles} files for this assignment.`
        : `這份作業最多可上傳 ${maxFiles} 個檔案。`);
      input.value = '';
      return;
    }

    draft.pendingFiles = [...(draft.pendingFiles || []), ...files];
    input.value = '';
    this.renderAssignmentDraftFiles();
  },

  removeAssignmentExistingFile(index) {
    if (!this.assignmentSubmissionDraft?.existingFiles) return;
    this.assignmentSubmissionDraft.existingFiles = this.assignmentSubmissionDraft.existingFiles.filter((_, fileIndex) => fileIndex !== index);
    this.renderAssignmentDraftFiles();
    this.scheduleAssignmentDraftSave();
  },

  removeAssignmentPendingFile(index) {
    if (!this.assignmentSubmissionDraft?.pendingFiles) return;
    this.assignmentSubmissionDraft.pendingFiles = this.assignmentSubmissionDraft.pendingFiles.filter((_, fileIndex) => fileIndex !== index);
    this.renderAssignmentDraftFiles();
  },

  triggerAssignmentFileDownload(file = {}, fallbackName = 'attachment') {
    const normalizedFile = this.normalizeAssignmentFile(file);
    if (!normalizedFile) return;

    if (normalizedFile.downloadUrl) {
      window.open(normalizedFile.downloadUrl, '_blank', 'noopener');
      return;
    }

    const dataUrl = normalizedFile.legacyDataUrl || (normalizedFile.content
      ? `data:${normalizedFile.contentType || 'application/octet-stream'};base64,${normalizedFile.content}`
      : '');

    if (!dataUrl) return;

    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = normalizedFile.name || fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  },

  downloadDraftAssignmentExistingFile(index) {
    const file = this.assignmentSubmissionDraft?.existingFiles?.[index];
    if (!file) return;
    this.triggerAssignmentFileDownload(file, file.name || `attachment_${index + 1}`);
  },

  downloadCurrentAssignmentFile(index) {
    const file = this.currentAssignmentDetail?.submission?.files?.[index];
    if (!file) return;
    this.triggerAssignmentFileDownload(file, file.name || `attachment_${index + 1}`);
  },

  downloadViewedAssignmentFile(index) {
    const file = this.currentViewedAssignmentSubmission?.files?.[index];
    if (!file) return;
    this.triggerAssignmentFileDownload(file, file.name || `attachment_${index + 1}`);
  },

  async withdrawAssignment(assignmentId) {
    const confirmed = await showConfirmDialog({
      message: I18n.getLocale() === 'en'
        ? 'Remove this submission and reopen the assignment for editing?'
        : '要移除這份提交，重新回到可編輯狀態嗎？',
      confirmLabel: t('common.confirm')
    });
    if (!confirmed) return;

    try {
      const result = await API.assignments.withdraw(assignmentId);
      if (result.success) {
        showToast(result.message || (I18n.getLocale() === 'en' ? 'Submission removed' : '提交已移除'));
        this.openAssignment(assignmentId);
      } else {
        showToast(result.message || t('moodleAssignment.submitFailed'));
      }
    } catch (error) {
      console.error('Withdraw assignment error:', error);
      showToast(t('moodleAssignment.submitFailed'));
    }
  },

  async deleteAssignment(assignmentId, courseId = this.currentAssignmentCourseId || this.currentCourseId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleActivityEdit.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.assignments.delete(assignmentId);
      if (!result.success) {
        showToast(result.message || t('common.deleteFailed'));
        return;
      }

      showToast(result.message || t('common.deleted'));
      this.currentAssignmentDetail = null;
      this.currentViewedAssignmentSubmission = null;
      showView('moodleAssignments');
      await this.loadAssignments(courseId || this.currentAssignmentCourseId);
    } catch (error) {
      console.error('Delete assignment error:', error);
      showToast(t('common.deleteFailed'));
    }
  },

  async downloadAllAssignmentSubmissions(assignmentId) {
    try {
      const response = await fetch(`${API.baseUrl}/assignments/${assignmentId}/download-all`, {
        headers: {
          Authorization: API.accessToken ? `Bearer ${API.accessToken}` : '',
          'X-Language': I18n.getLocale()
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        showToast(errorData?.message || (I18n.getLocale() === 'en' ? 'Download failed' : '下載失敗'));
        return;
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
      const filename = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1]) : `assignment_${assignmentId}_submissions.zip`;
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      console.error('Download all submissions error:', error);
      showToast(I18n.getLocale() === 'en' ? 'Download failed' : '下載失敗');
    }
  },

  // ==================== 作業系統 ====================

  /**
   * 載入作業列表
   */
  async loadAssignments(courseId, filter = 'all') {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    // 沒有指定課程 → 顯示課程選擇器
    if (!courseId) {
      this.currentAssignmentCourseId = null;
      this.renderCoursePicker(
        t('moodleAssignment.title'),
        '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--olive)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>',
        'MoodleUI.loadAssignments',
        'assignmentsList'
      );
      return;
    }

    this.currentAssignmentCourseId = courseId;

    try {
      container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
      const assignmentsResult = await API.assignments.list(courseId);
      let assignments = assignmentsResult.success ? (assignmentsResult.data || []) : [];

      // 取得課程名稱
      let courseName = '';
      let course = null;
      try {
        const courseResult = await API.courses.get(courseId);
        if (courseResult.success) {
          course = courseResult.data;
          courseName = course.title || course.name || '';
        }
      } catch(e) {}

      assignments = assignments.map(a =>
        this.normalizeAssignmentState({ ...a, courseName, courseId })
      );

      // 篩選
      if (filter === 'pending') {
        assignments = assignments.filter(a => !a.submitted);
      } else if (filter === 'submitted') {
        assignments = assignments.filter(a => a.submitted && !a.graded);
      } else if (filter === 'graded') {
        assignments = assignments.filter(a => a.graded);
      }

      this.renderAssignmentsWithBack(assignments, courseName, courseId, filter, {
        canManage: this.canManageCourse(course)
      });
    } catch (error) {
      console.error('Load assignments error:', error);
      container.innerHTML = `<div class="error">${t('moodleAssignment.loadFailed')}</div>`;
    }
  },

  renderAssignmentsWithBack(assignments, courseName, courseId, currentFilter, { canManage = false } = {}) {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    const normalizedAssignments = (Array.isArray(assignments) ? assignments : [])
      .map(a => this.normalizeAssignmentState(a));
    const user = API.getCurrentUser();
    const isTeacher = this.isTeachingRole(user) && canManage;
    const isEnglish = I18n.getLocale() === 'en';
    const header = this.renderActivityCollectionHeader({
      backAction: 'MoodleUI.loadAssignments()',
      title: `${courseName} — ${t('moodleAssignment.title')}`,
      subtitle: isTeacher
        ? (isEnglish ? 'Review submissions and grading progress.' : '查看提交與評分進度。')
        : (isEnglish ? 'Track due dates and submission status.' : '掌握截止時間與提交狀態。'),
      ctaAction: isTeacher ? `MoodleUI.showCreateAssignmentModal(${this.toInlineActionValue(courseId)})` : '',
      ctaLabel: isTeacher ? (isEnglish ? 'Create assignment' : '新增作業') : '',
      metaChips: [
        { label: `${normalizedAssignments.length} ${isEnglish ? 'assignments' : '份作業'}` },
        currentFilter && currentFilter !== 'all'
          ? { label: isEnglish ? `Filter: ${currentFilter}` : `篩選：${currentFilter}` }
          : null
      ]
    });

    const body = normalizedAssignments.length === 0
      ? this.renderActivityEmptyState({
          icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>',
          title: isTeacher ? (isEnglish ? 'No assignments yet' : '尚未建立作業') : t('moodleAssignment.noAssignments'),
          hint: isTeacher
            ? (isEnglish ? 'Create the first assignment for this course.' : '點擊「新增作業」開始派發作業給學生。')
            : (isEnglish ? 'Assignments will appear here once your teacher publishes them.' : '老師發布作業後，會顯示在這裡。')
        })
      : normalizedAssignments.map(a => this.renderAssignmentCard(a, { teacherView: isTeacher })).join('');

    container.innerHTML = `
      <div class="activity-shell">
        ${header}
        <div class="activity-shell-list">
          ${body}
        </div>
      </div>
    `;
  },

  /**
   * 渲染作業列表
   */
  renderAssignmentsList(assignments) {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    const normalizedAssignments = (Array.isArray(assignments) ? assignments : [])
      .map(a => this.normalizeAssignmentState(a));

    if (normalizedAssignments.length === 0) {
      container.innerHTML = this.renderActivityEmptyState({
        icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>',
        title: t('moodleAssignment.noAssignments')
      });
      return;
    }

    container.innerHTML = normalizedAssignments
      .map(a => this.renderAssignmentCard(a, { showCourse: true }))
      .join('');
  },

  /**
   * 篩選作業
   */
  filterAssignments(filter, btn) {
    document.querySelectorAll('#moodleAssignmentsView .tab-btn').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.loadAssignments(this.currentAssignmentCourseId, filter);
  },

  /**
   * 開啟作業
   */
  async openAssignment(assignmentId, options = {}) {
    try {
      const result = await API.assignments.get(assignmentId);
      if (!result.success) {
        showToast(t('moodleAssignment.loadFailed'));
        return;
      }

      const assignment = this.normalizeAssignmentState(result.data || {});
      this.currentAssignmentCourseId = assignment.courseId || this.currentAssignmentCourseId;
      const container = document.getElementById('assignmentDetailContent');
      const user = API.getCurrentUser();
      let isTeacher = false;
      if (this.isTeachingRole(user)) {
        isTeacher = Boolean(
          user?.isAdmin ||
          assignment.teacherId === user?.userId ||
          assignment.instructorId === user?.userId ||
          assignment.createdBy === user?.userId
        );

        if (!isTeacher && assignment.courseId) {
          try {
            const courseResult = await API.courses.get(assignment.courseId);
            if (courseResult.success) {
              isTeacher = this.canTeachCourse(courseResult.data, user);
            }
          } catch (courseError) {
            console.warn('Resolve assignment teacher role failed:', courseError);
          }
        }
      }

      if (isTeacher) {
        try {
          const submissionsResult = await API.assignments.getSubmissions(assignmentId);
          if (submissionsResult.success) {
            assignment.submissions = this.normalizeAssignmentState({
              submissions: submissionsResult.data || []
            }).submissions;
          }
        } catch (submissionError) {
          console.warn('Load assignment submissions failed:', submissionError);
        }
      }

      this.currentAssignmentDetail = assignment;
      this.assignmentSubmissionDraft = !isTeacher ? this.createAssignmentSubmissionDraft(assignment) : null;
      this.currentViewedAssignmentSubmission = null;

      // 非教師且尚未提交 → 從伺服器回填草稿
      if (!isTeacher && !assignment.submission && this.assignmentSubmissionDraft) {
        setTimeout(() => this.hydrateAssignmentDraftFromServer(assignmentId), 0);
      }

      const safeTitle = this.escapeText(assignment.title || t('moodleAssignment.title'));
      const safeCourseName = this.escapeText(assignment.courseName || t('moodleAssignment.course'));
      const isEnglish = I18n.getLocale() === 'en';
      const dueDateLabel = assignment.dueDate
        ? this.formatPlatformDate(assignment.dueDate, { dateStyle: 'medium', timeStyle: 'short' })
        : t('moodleAssignment.none');
      const pointsLabel = `${assignment.maxPoints || 100} ${t('moodleAssignment.points')}`;
      const submissionTypeLabel = assignment.submissionType === 'file'
        ? t('moodleAssignment.uploadLabel')
        : assignment.submissionType === 'text'
          ? t('moodleAssignment.contentLabel')
          : `${t('moodleAssignment.contentLabel')} / ${t('moodleAssignment.uploadLabel')}`;
      const heroKicker = isTeacher
        ? (isEnglish ? 'Assignment review' : '作業檢視')
        : (isEnglish ? 'Assignment detail' : '作業詳情');
      const briefKicker = isEnglish ? 'Brief' : '任務摘要';
      const briefNote = isTeacher
        ? (isEnglish ? 'Review the task brief, grading basis, and submission requirements before checking student work.' : '先確認這份作業的任務說明、評分依據與提交條件，再開始檢視學生作業。')
        : (isEnglish ? 'Understand the task goal, instructions, and submission requirements before you begin.' : '開始前先理解這次任務的目標、說明與提交方式。');
      const editAssignmentButton = isTeacher ? `
        <button type="button" class="btn-sm" onclick="MoodleUI.editAssignmentSettings(${this.toInlineActionValue(assignment.assignmentId)})">
          ${t('common.edit')}
        </button>
      ` : '';
      const deleteAssignmentButton = isTeacher ? `
        <button type="button" class="btn-sm btn-danger" onclick="MoodleUI.deleteAssignment(${this.toInlineActionValue(assignment.assignmentId)}, ${this.toInlineActionValue(assignment.courseId || this.currentAssignmentCourseId || '')})">
          ${t('common.delete')}
        </button>
      ` : '';
      const isPastDue = this.isAssignmentPastDue(assignment);
      const gradePendingRelease = Boolean(assignment.gradePendingRelease && assignment.submission);
      const hasSubmissionGrade = assignment.submission && assignment.submission.grade !== undefined && assignment.submission.grade !== null;
      const statusClass = assignment.submission
        ? (gradePendingRelease ? 'submitted' : (hasSubmissionGrade ? 'graded' : (assignment.submission.isLate ? 'late-submitted' : 'submitted')))
        : (isPastDue ? 'late-submitted' : 'not-submitted');
      const statusText = assignment.submission
        ? (gradePendingRelease
          ? t('moodleAssignment.pendingRelease')
          : (hasSubmissionGrade
            ? `${t('moodleAssignment.gradedStatus')}: ${assignment.submission.grade}/${assignment.maxPoints}`
            : (assignment.submission.isLate
              ? (isEnglish ? 'Submitted late' : '已逾時提交')
              : t('moodleAssignment.submittedStatus'))))
        : (isPastDue
          ? (isEnglish ? 'Overdue, submission still open' : '已逾時，仍可提交')
          : t('moodleAssignment.notSubmitted'));
      const descriptionHtml = assignment.description
        ? this.formatMultilineText(assignment.description)
        : this.escapeText(t('moodleAssignment.noDesc'));
      const instructionsHtml = assignment.instructions
        ? this.formatMultilineText(assignment.instructions)
        : '';
      const cutoffDateLabel = assignment.cutoffDate
        ? this.formatPlatformDate(assignment.cutoffDate, { dateStyle: 'medium', timeStyle: 'short' })
        : (assignment.allowLateSubmission === false
          ? (isEnglish ? 'No late submissions accepted' : '不接受遲交')
          : t('moodleAssignment.none'));
      const passingGradeLabel = assignment.gradeToPass !== undefined && assignment.gradeToPass !== null
        ? `${assignment.gradeToPass}/${assignment.maxPoints || assignment.maxGrade || 100}`
        : '—';
      const latePolicyLabel = assignment.allowLateSubmission === false
        ? (isEnglish ? 'Late submissions are disabled' : '不允許遲交')
        : (assignment.cutoffDate
          ? `${isEnglish ? 'Accepted until' : '接受至'} ${cutoffDateLabel}`
          : (isEnglish ? 'Late submissions stay open' : '截止後仍可提交'));
      const lateDeductionLabel = assignment.allowLateSubmission === false
        ? (isEnglish ? 'Not applicable' : '不適用')
        : `${assignment.lateDeductionPercent ?? 0}%`;
      const filePolicyLabel = assignment.submissionType === 'text'
        ? (isEnglish ? 'Online text only' : '僅限線上文字')
        : `${assignment.maxFiles || 0} ${isEnglish ? 'file(s)' : '個檔案'} · ${assignment.maxFileSize || 0} MB`;
      const rubricCriteria = Array.isArray(assignment.rubric?.criteria) ? assignment.rubric.criteria : [];
      const rubricPreview = assignment.rubric ? `
        <section class="assignment-panel">
          <div class="assignment-panel-head">
            <div class="assignment-panel-copy">
              <span class="assignment-panel-kicker">${isEnglish ? 'Rubric' : '評分規準'}</span>
              <h3 class="assignment-panel-title">${this.escapeText(assignment.rubric.name || (isEnglish ? 'Rubric' : '評分規準'))}</h3>
              <p class="assignment-panel-note">${rubricCriteria.length > 0
                ? this.escapeText(`${rubricCriteria.length} ${isEnglish ? 'criteria' : '個評分項目'}`)
                : this.escapeText(isEnglish ? 'Criterion-based grading is enabled for this assignment.' : '這份作業會使用評分項目進行評分。')}</p>
            </div>
          </div>
          <div class="builder-badge-row">
            ${(rubricCriteria.length > 0
              ? rubricCriteria.slice(0, 8).map(item => `<span class="builder-badge">${this.escapeText(item.name || (isEnglish ? 'Criterion' : '評分項目'))}</span>`).join('')
              : `<span class="builder-badge">${isEnglish ? 'Criteria pending' : '尚未設定評分項目'}</span>`)}
          </div>
        </section>
      ` : '';

      container.innerHTML = `
        <div class="assignment-detail">
          <section class="assignment-hero">
            <div class="assignment-hero-top">
              <button onclick="showView('moodleAssignments')" class="assignment-back-btn">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
                ${t('moodleAssignment.backToList')}
              </button>
              <div class="assignment-hero-actions">
                ${editAssignmentButton}
                ${deleteAssignmentButton}
                <div class="assignment-status ${statusClass}">
                  ${this.escapeText(statusText)}
                </div>
              </div>
            </div>
            <div class="assignment-info">
              <span class="assignment-kicker">${heroKicker}</span>
              <h1>${safeTitle}</h1>
              <p class="assignment-subtitle">${safeCourseName}</p>
              <div class="assignment-meta-grid">
                <div class="assignment-meta-item">
                  <span class="label">${t('moodleAssignment.courseLabel')}</span>
                  <span class="value">${safeCourseName}</span>
                </div>
                <div class="assignment-meta-item">
                  <span class="label">${t('moodleAssignment.dueDateLabel')}</span>
                  <span class="value">${this.escapeText(dueDateLabel)}</span>
                </div>
                <div class="assignment-meta-item">
                  <span class="label">${t('moodleAssignment.maxPoints')}</span>
                  <span class="value">${this.escapeText(pointsLabel)}</span>
                </div>
                <div class="assignment-meta-item">
                  <span class="label">${t('moodleAssignment.submitTitle')}</span>
                  <span class="value">${this.escapeText(submissionTypeLabel)}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="assignment-panel">
            <div class="assignment-panel-head">
              <div class="assignment-panel-copy">
                <span class="assignment-panel-kicker">${briefKicker}</span>
                <h3 class="assignment-panel-title">${t('moodleAssignment.description')}</h3>
                <p class="assignment-panel-note">${briefNote}</p>
              </div>
            </div>
            <div class="assignment-body">${descriptionHtml}</div>
          </section>

          ${assignment.instructions ? `
            <section class="assignment-panel">
              <div class="assignment-panel-head">
                <div class="assignment-panel-copy">
                  <span class="assignment-panel-kicker">${isEnglish ? 'Instructions' : '作業內容'}</span>
                  <h3 class="assignment-panel-title">${isEnglish ? 'What students need to deliver' : '學生要完成的內容'}</h3>
                  <p class="assignment-panel-note">${isEnglish
                    ? 'This is the actual task brief, expected output, and grading focus learners should follow.'
                    : '這裡顯示學生實際要完成的作業要求、輸出格式與評分重點。'}</p>
                </div>
              </div>
              <div class="assignment-body">${instructionsHtml}</div>
            </section>
          ` : ''}

          <div class="assignment-detail-grid">
            <section class="assignment-panel">
              <div class="assignment-panel-head">
                <div class="assignment-panel-copy">
                  <span class="assignment-panel-kicker">${isEnglish ? 'Rules' : '提交規則'}</span>
                  <h3 class="assignment-panel-title">${isEnglish ? 'Submission policy' : '提交與評分規則'}</h3>
                  <p class="assignment-panel-note">${isEnglish
                    ? 'Review the deadlines, submission window, file policy, and the passing threshold in one place.'
                    : '集中查看截止時間、遲交規則、檔案限制與及格門檻。'}</p>
                </div>
              </div>
              <div class="management-kv-list">
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleAssignment.dueDateLabel')}</div>
                  <div class="management-kv-value">${this.escapeText(dueDateLabel)}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${isEnglish ? 'Final cutoff' : '最終截止'}</div>
                  <div class="management-kv-value">${this.escapeText(cutoffDateLabel)}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleAssignment.submitTitle')}</div>
                  <div class="management-kv-value">${this.escapeText(submissionTypeLabel)}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${isEnglish ? 'File policy' : '檔案規則'}</div>
                  <div class="management-kv-value">${this.escapeText(filePolicyLabel)}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${isEnglish ? 'Late policy' : '遲交規則'}</div>
                  <div class="management-kv-value">${this.escapeText(latePolicyLabel)}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${isEnglish ? 'Late deduction' : '遲交扣分'}</div>
                  <div class="management-kv-value">${this.escapeText(lateDeductionLabel)}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${isEnglish ? 'Passing score' : '及格分數'}</div>
                  <div class="management-kv-value">${this.escapeText(passingGradeLabel)}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${isEnglish ? 'Visibility' : '可見性'}</div>
                  <div class="management-kv-value">${assignment.visible === false
                    ? this.escapeText(isEnglish ? 'Hidden from students' : '目前對學生隱藏')
                    : this.escapeText(isEnglish ? 'Visible to students' : '學生可見')}</div>
                </div>
              </div>
            </section>

            ${rubricPreview}
          </div>

          ${!isTeacher ? this.renderSubmissionArea(assignment) : this.renderGradingArea(assignment)}
        </div>
      `;

      if (!isTeacher) {
        this.renderAssignmentDraftFiles();
      }

      showView('assignmentDetail', {
        path: options.path || `/platform/assignment/${encodeURIComponent(assignmentId)}`,
        replaceHistory: options.replaceHistory
      });
    } catch (error) {
      console.error('Open assignment error:', error);
      showToast(t('moodleAssignment.loadFailed'));
    }
  },

  /**
   * 渲染提交區域
   */
  renderSubmissionArea(assignment) {
    const isEnglish = I18n.getLocale() === 'en';
    const normalizedAssignment = this.normalizeAssignmentState(assignment || {});
    const submission = normalizedAssignment.submission || null;
    const isPastDue = this.isAssignmentPastDue(normalizedAssignment);
    const isLateSubmission = Boolean(submission?.isLate);
    const gradePendingRelease = Boolean(normalizedAssignment.gradePendingRelease && submission);
    const canEditSubmission = Boolean(submission) && !normalizedAssignment.graded;
    const submissionKicker = isEnglish ? 'Submission' : '我的提交';
    const submissionNote = isEnglish
      ? 'Your text, files, and teacher feedback will stay attached to this assignment.'
      : '送出後，這裡會顯示你的內容、附件與建橋者回饋。';
    const submitWorkKicker = isEnglish ? 'Submit work' : '提交內容';
    const submitWorkNote = isEnglish
      ? 'Text and files can be submitted separately or together. The record will stay on this assignment page.'
      : '文字與附件可擇一或一起提交，送出後會記錄在此作業頁。';
    const noticeHtml = !submission && isPastDue
      ? `
        <div class="assignment-deadline-note is-late">
          <strong>${isEnglish ? 'Overdue, but submissions are still accepted.' : '已逾時，仍可繼續提交。'}</strong>
          <span>${isEnglish ? 'The upload time will be recorded and marked as late.' : '系統會保留你的上傳時間，並標記這次提交為逾時。'}</span>
        </div>
      `
      : (submission
        ? `
          <div class="assignment-deadline-note ${isLateSubmission ? 'is-late' : 'is-submitted'}">
            <strong>${isLateSubmission ? (isEnglish ? 'Submitted after the due date' : '這份作業是逾時提交') : (isEnglish ? 'Submission recorded' : '提交已記錄')}</strong>
            <span>${t('moodleAssignment.submitTime')}：${this.escapeText(this.formatPlatformDate(submission.submittedAt, { dateStyle: 'medium', timeStyle: 'short' }) || '—')}</span>
        </div>
      `
        : '');

    const submissionSummaryHtml = submission ? `
      <section class="assignment-submission-summary">
        <div class="assignment-panel-head">
          <div class="assignment-panel-copy">
            <span class="assignment-panel-kicker">${submissionKicker}</span>
            <h3 class="assignment-panel-title">${t('moodleAssignment.mySubmission')}</h3>
            <p class="assignment-panel-note">${submissionNote}</p>
          </div>
        </div>
        ${noticeHtml}
        ${gradePendingRelease ? `
          <div class="assignment-deadline-note is-submitted">
            <strong>${t('moodleAssignment.pendingRelease')}</strong>
            <span>${t('moodleAssignment.pendingReleaseNote')}</span>
          </div>
        ` : ''}
        <div class="assignment-body submitted-content">
          ${submission.content ? `<div class="text-content">${this.formatMultilineText(submission.content)}</div>` : ''}
          ${submission.files?.length ? `
            <div class="assignment-file-group">
              <div class="assignment-file-group-title">${t('moodleAssignment.attachments')}</div>
              ${this.renderAssignmentFileRows(submission.files, {
                removable: false,
                downloadHandler: 'MoodleUI.downloadCurrentAssignmentFile'
              })}
            </div>
          ` : ''}
        </div>
        ${submission.feedback ? `<div class="assignment-feedback-card"><h4>${t('moodleAssignment.teacherFeedback')}</h4><p>${this.formatMultilineText(submission.feedback)}</p></div>` : ''}
        ${Array.isArray(submission.feedbackFiles) && submission.feedbackFiles.length > 0 ? `
          <div class="assignment-feedback-card">
            <h4>${I18n.getLocale() === 'en' ? 'Feedback files' : '教師回饋檔案'}</h4>
            ${submission.feedbackFiles.map((f, i) => {
              const name = this.escapeText(f.name || f.filename || `feedback_${i + 1}`);
              const url = f.downloadUrl || f.viewUrl || '';
              return url
                ? `<a class="assignment-file-action" href="${this.escapeText(url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
                : `<span class="assignment-file-action">${name}</span>`;
            }).join('')}
          </div>
        ` : ''}
      </section>
    ` : '';

    return `
      <section class="submission-area">
        <div class="assignment-panel-head">
          <div class="assignment-panel-copy">
            <span class="assignment-panel-kicker">${submitWorkKicker}</span>
            <h3 class="assignment-panel-title">${t('moodleAssignment.submitTitle')}</h3>
            <p class="assignment-panel-note">${submitWorkNote}</p>
          </div>
        </div>
        ${submissionSummaryHtml}
        ${!submission ? noticeHtml : ''}
        ${!normalizedAssignment.graded ? `
          <form id="submissionForm" class="assignment-form">
            ${normalizedAssignment.submissionType !== 'file' ? `
            <div class="assignment-form-field">
              <label>${t('moodleAssignment.contentLabel')}</label>
              <textarea id="submissionContent" rows="8" placeholder="${t('moodleAssignment.contentPlaceholder')}" oninput="MoodleUI.syncAssignmentSubmissionContent(this.value)">${this.escapeText(this.assignmentSubmissionDraft?.content || submission?.content || '')}</textarea>
              <div id="assignmentDraftIndicator" class="assignment-draft-indicator" data-state="idle"></div>
            </div>
            ` : ''}
            ${normalizedAssignment.submissionType !== 'text' ? `
            <div class="assignment-form-field">
              <label>${t('moodleAssignment.uploadLabel')}</label>
              <button type="button" class="file-upload-area" onclick="document.getElementById('submissionFile').click()">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span class="file-upload-copy">${t('moodleAssignment.uploadHint')}</span>
              </button>
              <input type="file" id="submissionFile" class="hidden-file-input" onchange="MoodleUI.handleAssignmentFileSelect(this)" multiple>
              <div id="selectedFiles"></div>
            </div>
            ` : ''}
            <div class="assignment-form-actions">
              ${canEditSubmission ? `<button type="button" onclick="MoodleUI.withdrawAssignment('${normalizedAssignment.assignmentId}')" class="btn-secondary">${isEnglish ? 'Remove submission' : '移除提交'}</button>` : ''}
              <button type="button" onclick="MoodleUI.submitAssignment('${normalizedAssignment.assignmentId}')" class="btn-primary">${canEditSubmission ? (isEnglish ? 'Update submission' : '更新提交') : t('moodleAssignment.submitBtn')}</button>
            </div>
          </form>
        ` : ''}
      </section>
    `;
  },

  /**
   * 渲染評分區域 (教師)
   */
  renderGradingArea(assignment) {
    const isEnglish = I18n.getLocale() === 'en';
    const anonymousBadge = assignment?.anonymousGrading
      ? `<span class="assignment-submission-tag" style="background:var(--olive-deep, #2D5A3D);color:#fff;">${isEnglish ? 'Anonymous grading' : '匿名評分'}</span>`
      : '';
    const teamBadge = assignment?.teamSubmission
      ? `<span class="assignment-submission-tag" style="background:var(--olive, #4A7C59);color:#fff;">${isEnglish ? 'Team submission' : '組別提交'}</span>`
      : '';
    return `
      <section class="grading-area">
        <div class="assignment-panel-head">
          <div class="assignment-panel-copy">
            <span class="assignment-panel-kicker">${isEnglish ? 'Review' : '批改進度'}</span>
            <h3 class="assignment-panel-title">${t('moodleAssignment.studentSubmissions')} (${assignment.submissions?.length || 0}) ${anonymousBadge} ${teamBadge}</h3>
            <p class="assignment-panel-note">${isEnglish ? 'Review submission timestamps, score inputs, and grading actions in one place.' : '在同一個工作區檢視提交時間、分數欄位與批改操作。'}</p>
          </div>
          ${(assignment.submissions || []).length > 0 ? `
            <div class="assignment-panel-actions">
              <button type="button" class="btn-secondary" onclick="MoodleUI.downloadAllAssignmentSubmissions('${assignment.assignmentId}')">${isEnglish ? 'Download all' : '下載全部'}</button>
            </div>
          ` : ''}
        </div>
        ${(assignment.submissions || []).length === 0 ? `
          <div class="assignment-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/></svg>
            <div class="assignment-empty-state-title">${t('moodleAssignment.noStudentSubmissions')}</div>
            <div>${I18n.getLocale() === 'en' ? 'Submissions will appear here after learners turn in their work.' : '學生開始提交後，這裡會顯示每一筆作業。'}</div>
          </div>
        ` : `
          <div class="assignment-submission-list">
            ${assignment.submissions.map(s => `
              <div class="assignment-submission-item">
                <div class="assignment-submission-student">
                  <div class="assignment-submission-avatar">${this.escapeText((s.studentName || 'S')[0])}</div>
                  <div>
                    <span class="assignment-submission-name">${this.escapeText(s.studentName || s.studentId || 'Student')}</span>
                    <span class="assignment-submission-time">${this.escapeText(this.formatPlatformDate(s.submittedAt, { dateStyle: 'medium', timeStyle: 'short' }))}</span>
                    ${s.isLate ? `<span class="assignment-submission-tag is-late">${isEnglish ? 'Late' : '逾時'}</span>` : ''}
                  </div>
                </div>
                <div class="assignment-submission-actions">
                  <button onclick="MoodleUI.viewSubmission('${assignment.assignmentId}', '${s.studentId}')" class="btn-sm">${t('moodleAssignment.viewBtn')}</button>
                  <input type="number" id="grade_${s.studentId}" class="grade-input-compact" value="${s.grade ?? ''}" placeholder="${t('moodleGrade.score')}">
                  <button onclick="MoodleUI.gradeSubmission('${assignment.assignmentId}', '${s.studentId}')" class="btn-sm">${isEnglish ? 'Quick grade' : '快速評分'}</button>
                  <button onclick="MoodleUI.openGradingModal('${assignment.assignmentId}', '${s.studentId}')" class="btn-primary">${isEnglish ? 'Full review' : '完整批改'}</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>
    `;
  },

  /**
   * 查看學生提交
   */
  async viewSubmission(assignmentId, studentId) {
    try {
      const result = await API.assignments.getSubmission(assignmentId, studentId);
      if (result.success) {
        const submissionData = {
          ...result.data,
          studentId: result.data.studentId || result.data.userId || studentId,
          studentName: result.data.studentName || result.data.userName || studentId,
          studentEmail: result.data.studentEmail || result.data.userEmail || '',
          files: this.normalizeAssignmentFiles(result.data.files || [])
        };
        this.currentViewedAssignmentSubmission = submissionData;
        MoodleUI.createModal('view-submission-modal', t('moodleAssignment.viewSubmission'), `
          <div class="submission-detail">
            <p><strong>${t('moodleParticipant.student')}：</strong>${this.escapeText(submissionData.studentName || studentId)}</p>
            ${submissionData.studentEmail ? `<p><strong>Email：</strong>${this.escapeText(submissionData.studentEmail)}</p>` : ''}
            <p><strong>${t('moodleAssignment.submitTime')}：</strong>${submissionData.submittedAt ? this.escapeText(this.formatPlatformDate(submissionData.submittedAt, { dateStyle: 'medium', timeStyle: 'short' })) : t('moodleAssignment.notSubmitted')}</p>
            ${submissionData.isLate ? `<p><strong>${I18n.getLocale() === 'en' ? 'Status' : '狀態'}：</strong>${I18n.getLocale() === 'en' ? 'Late submission' : '逾時提交'}</p>` : ''}
            <div class="submission-content">${submissionData.content ? this.formatMultilineText(submissionData.content) : `<em>${t('moodleAssignment.noTextContent')}</em>`}</div>
            ${submissionData.files?.length ? `
              <div class="submission-files">
                <strong>${t('moodleAssignment.attachments')}：</strong>
                ${this.renderAssignmentFileRows(submissionData.files, {
                  removable: false,
                  downloadHandler: 'MoodleUI.downloadViewedAssignmentFile'
                })}
              </div>
            ` : ''}
            ${submissionData.grade !== undefined && submissionData.grade !== null ? `<p><strong>${t('moodleGrade.score')}：</strong>${this.escapeText(String(submissionData.grade))}</p>` : ''}
            ${submissionData.feedback ? `<p><strong>${t('moodleGrade.feedback')}：</strong>${this.formatMultilineText(submissionData.feedback)}</p>` : ''}
            ${Array.isArray(submissionData.feedbackFiles) && submissionData.feedbackFiles.length > 0 ? `
              <div class="submission-files">
                <strong>${I18n.getLocale() === 'en' ? 'Feedback files' : '回饋檔案'}：</strong>
                ${submissionData.feedbackFiles.map((f, i) => {
                  const name = this.escapeText(f.name || f.filename || `feedback_${i + 1}`);
                  const url = f.downloadUrl || f.viewUrl || '';
                  return url
                    ? `<a class="assignment-file-action" href="${this.escapeText(url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
                    : `<span class="assignment-file-action">${name}</span>`;
                }).join('')}
              </div>
            ` : ''}
          </div>
        `);
      } else {
        showToast(result.message || t('moodleAssignment.loadSubmissionFailed'));
      }
    } catch (error) {
      showToast(t('moodleAssignment.loadSubmissionError'));
    }
  },

  /**
   * 教師完整評分 modal：分數 + 文字回饋 + 檔案回饋
   */
  async openGradingModal(assignmentId, studentId) {
    try {
      const result = await API.assignments.getSubmission(assignmentId, studentId);
      if (!result.success) {
        showToast(result.message || t('moodleAssignment.loadSubmissionFailed'));
        return;
      }
      const sub = result.data || {};
      const assignment = this.currentAssignmentDetail || {};
      this._gradingModalFeedbackFiles = Array.isArray(sub.feedbackFiles) ? sub.feedbackFiles.slice() : [];
      this._gradingModalAnnotations = Array.isArray(sub.annotations) ? sub.annotations.slice() : [];
      this._gradingModalSubmissionFiles = Array.isArray(sub.files) ? sub.files.slice() : [];
      const isEnglish = I18n.getLocale() === 'en';
      const maxGrade = assignment.maxPoints || assignment.maxGrade || 100;
      const modalId = 'full-grade-modal';

      const rubricHtml = (assignment.rubric?.criteria || []).map((criterion, idx) => {
        const cid = criterion.criterionId || criterion.id || `c_${idx}`;
        const existing = (sub.rubricScores || []).find(r => (r.criterionId || r.id) === cid);
        const currentScore = existing?.score ?? '';
        const max = Number(criterion.maxScore ?? criterion.points ?? 0);
        return `
          <div class="rubric-row" data-criterion-id="${this.escapeText(cid)}" data-criterion-max="${max}">
            <label>${this.escapeText(criterion.name || `Criterion ${idx + 1}`)} (${max})</label>
            <input type="number" class="rubric-score-input" min="0" max="${max}" step="0.1" value="${currentScore}" />
          </div>
        `;
      }).join('');

      MoodleUI.createModal(modalId, isEnglish ? 'Grade submission' : '批改作業', `
        <div class="grading-modal">
          <div class="grading-modal-header">
            <div><strong>${isEnglish ? 'Student' : '學生'}:</strong> ${this.escapeText(sub.studentName || sub.userName || studentId)}</div>
            ${sub.isLate ? `<span class="assignment-submission-tag is-late">${isEnglish ? 'Late' : '逾時'}</span>` : ''}
          </div>
          <div class="grading-modal-section">
            <label>${isEnglish ? 'Score' : '分數'} (0 - ${maxGrade})</label>
            <input type="number" id="gradingModalScore" min="0" max="${maxGrade}" step="0.1" value="${sub.grade ?? ''}" ${rubricHtml ? 'placeholder="' + (isEnglish ? 'Leave empty to auto-calc from rubric' : '留空將由評分規準自動計算') + '"' : ''} />
          </div>
          ${rubricHtml ? `
            <div class="grading-modal-section">
              <label>${isEnglish ? 'Rubric scores' : '評分規準'}</label>
              <div class="rubric-grid" id="rubricScoresGrid">${rubricHtml}</div>
            </div>
          ` : ''}
          <div class="grading-modal-section">
            <label>${isEnglish ? 'Feedback' : '文字回饋'}</label>
            <textarea id="gradingModalFeedback" rows="4" placeholder="${isEnglish ? 'Comments visible to the student' : '將顯示給學生的評語'}">${this.escapeText(sub.feedback || '')}</textarea>
          </div>
          <div class="grading-modal-section">
            <label>${isEnglish ? 'Feedback files' : '回饋檔案'}</label>
            <button type="button" class="btn-secondary btn-sm" onclick="document.getElementById('gradingModalFiles').click()">
              ${isEnglish ? 'Upload file' : '上傳檔案'}
            </button>
            <input type="file" id="gradingModalFiles" class="hidden-file-input" multiple onchange="MoodleUI.handleGradingFeedbackFileSelect(this, '${assignmentId}')" />
            <div id="gradingModalFileList"></div>
          </div>
          <div class="grading-modal-section">
            <label>${isEnglish ? 'PDF annotations' : 'PDF 批註'}</label>
            <div id="gradingModalPdfPicker"></div>
            <div id="gradingModalPdfAnnotator"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="MoodleUI.closeModal('${modalId}')">${t('common.cancel') || '取消'}</button>
            <button type="button" class="btn-primary" onclick="MoodleUI.submitGradingModal('${assignmentId}', '${studentId}')">${isEnglish ? 'Save grade' : '儲存評分'}</button>
          </div>
        </div>
      `);

      this.renderGradingFeedbackFiles();
      this.renderGradingPdfPicker();
    } catch (error) {
      console.error('Open grading modal error:', error);
      showToast(t('moodleAssignment.gradeFailed'));
    }
  },

  renderGradingFeedbackFiles() {
    const container = document.getElementById('gradingModalFileList');
    if (!container) return;
    const files = this._gradingModalFeedbackFiles || [];
    if (files.length === 0) {
      container.innerHTML = `<div class="assignment-file-empty">${I18n.getLocale() === 'en' ? 'No feedback files' : '尚未上傳回饋檔案'}</div>`;
      return;
    }
    container.innerHTML = files.map((f, idx) => `
      <div class="selected-file assignment-file-row">
        <div class="assignment-file-copy">
          <span class="file-name">${this.escapeText(f.name || f.filename || 'file')}</span>
          ${f.size ? `<span class="file-size">(${this.escapeText(this.formatFileSize(f.size))})</span>` : ''}
        </div>
        <div class="assignment-file-actions">
          <button type="button" class="assignment-file-action is-danger" onclick="MoodleUI.removeGradingFeedbackFile(${idx})">${t('common.remove') || '移除'}</button>
        </div>
      </div>
    `).join('');
  },

  removeGradingFeedbackFile(index) {
    if (!Array.isArray(this._gradingModalFeedbackFiles)) return;
    this._gradingModalFeedbackFiles.splice(index, 1);
    this.renderGradingFeedbackFiles();
  },

  async handleGradingFeedbackFileSelect(input, assignmentId) {
    if (!input?.files?.length) return;
    const files = Array.from(input.files);
    const courseId = this.currentAssignmentDetail?.courseId || this.currentAssignmentCourseId || null;
    try {
      for (const file of files) {
        const uploadResult = await API.files.upload(file, {
          folder: `assignments/${courseId || 'general'}/${assignmentId}/feedback`,
          courseId,
          visibility: courseId ? 'course' : 'private'
        });
        if (uploadResult?.success && uploadResult.data) {
          this._gradingModalFeedbackFiles.push({
            fileId: uploadResult.data.fileId || null,
            name: uploadResult.data.filename || file.name,
            filename: uploadResult.data.filename || file.name,
            size: uploadResult.data.size || file.size,
            contentType: uploadResult.data.contentType || file.type || 'application/octet-stream',
            viewUrl: uploadResult.data.viewUrl || null,
            downloadUrl: uploadResult.data.downloadUrl || null,
            uploadedAt: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Upload feedback file failed:', error);
      showToast(I18n.getLocale() === 'en' ? 'Upload failed' : '上傳失敗');
    }
    input.value = '';
    this.renderGradingFeedbackFiles();
  },

  async submitGradingModal(assignmentId, studentId) {
    const scoreEl = document.getElementById('gradingModalScore');
    const feedbackEl = document.getElementById('gradingModalFeedback');
    const scoreRaw = scoreEl?.value;
    const feedback = feedbackEl?.value || '';

    // Rubric scores
    const rubricScores = [];
    document.querySelectorAll('#rubricScoresGrid .rubric-row').forEach(row => {
      const cid = row.dataset.criterionId;
      const input = row.querySelector('.rubric-score-input');
      if (!cid || !input) return;
      const val = input.value;
      if (val === '' || val === null || val === undefined) return;
      const score = Number(val);
      if (Number.isFinite(score)) rubricScores.push({ criterionId: cid, score });
    });

    const payload = {
      feedback,
      feedbackFiles: this._gradingModalFeedbackFiles || [],
      rubricScores,
      annotations: this._gradingModalAnnotations || []
    };
    if (scoreRaw !== '' && scoreRaw !== null && scoreRaw !== undefined) {
      payload.grade = parseFloat(scoreRaw);
    }

    try {
      const result = await API.assignments.gradeSubmission(assignmentId, studentId, payload);
      if (result.success) {
        showToast(t('moodleAssignment.gradeSuccess'));
        this.closeModal('full-grade-modal');
        this.openAssignment(assignmentId);
      } else {
        showToast(result.message || t('moodleAssignment.gradeFailed'));
      }
    } catch (error) {
      console.error('Submit grading modal error:', error);
      showToast(t('moodleAssignment.gradeFailed'));
    }
  },

  /**
   * 渲染 PDF 批註檔案選單
   */
  renderGradingPdfPicker() {
    const picker = document.getElementById('gradingModalPdfPicker');
    if (!picker) return;
    const pdfFiles = (this._gradingModalSubmissionFiles || []).filter(f => {
      const ct = String(f?.contentType || f?.mimeType || '').toLowerCase();
      const name = String(f?.name || f?.filename || '').toLowerCase();
      return ct.includes('pdf') || name.endsWith('.pdf');
    });
    if (pdfFiles.length === 0) {
      picker.innerHTML = `<div class="assignment-file-empty">${I18n.getLocale() === 'en' ? 'No PDF files to annotate' : '此提交沒有可批註的 PDF 檔案'}</div>`;
      return;
    }
    picker.innerHTML = pdfFiles.map((f, i) => `
      <button type="button" class="btn-sm" onclick="MoodleUI.openPdfAnnotator(${i})">
        ${this.escapeText(f.name || f.filename || `file_${i + 1}`)}
      </button>
    `).join(' ');
    this._gradingModalPdfFiles = pdfFiles;
  },

  /**
   * 開啟 PDF 標註器
   */
  async openPdfAnnotator(fileIndex) {
    const host = document.getElementById('gradingModalPdfAnnotator');
    if (!host) return;
    const file = (this._gradingModalPdfFiles || [])[fileIndex];
    if (!file) return;

    const fileId = file.fileId || null;
    const url = file.downloadUrl || file.viewUrl || (fileId ? `/api/files/${fileId}` : null);
    if (!url) {
      showToast(I18n.getLocale() === 'en' ? 'Cannot locate PDF URL' : '找不到 PDF 下載位置');
      return;
    }

    const isEnglish = I18n.getLocale() === 'en';
    host.innerHTML = `
      <div class="pdf-annotator">
        <div class="pdf-annotator-toolbar">
          <div class="pdf-annotator-tools">
            <button type="button" class="pdf-tool-btn is-active" data-tool="highlight">${isEnglish ? 'Highlight' : '標記'}</button>
            <button type="button" class="pdf-tool-btn" data-tool="comment">${isEnglish ? 'Comment' : '註解'}</button>
            <button type="button" class="pdf-tool-btn" data-tool="draw">${isEnglish ? 'Draw' : '手寫'}</button>
          </div>
          <div class="pdf-annotator-nav">
            <button type="button" class="btn-sm" id="pdfPrevPage">${isEnglish ? 'Prev' : '上一頁'}</button>
            <span id="pdfPageLabel">1/1</span>
            <button type="button" class="btn-sm" id="pdfNextPage">${isEnglish ? 'Next' : '下一頁'}</button>
          </div>
        </div>
        <div class="pdf-annotator-stage">
          <div class="pdf-annotator-canvas-wrap">
            <canvas id="pdfBaseCanvas"></canvas>
            <canvas id="pdfOverlayCanvas" class="pdf-overlay-canvas"></canvas>
          </div>
          <aside class="pdf-annotator-sidebar">
            <div class="pdf-annotator-sidebar-title">${isEnglish ? 'Annotations' : '批註列表'}</div>
            <div id="pdfAnnotationList"></div>
          </aside>
        </div>
      </div>
    `;

    this._pdfAnnoState = {
      fileId,
      url,
      pdf: null,
      page: 1,
      numPages: 1,
      scale: 1.2,
      tool: 'highlight',
      drawing: false,
      start: null,
      path: [],
      viewport: null
    };

    const state = this._pdfAnnoState;

    host.querySelectorAll('.pdf-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        host.querySelectorAll('.pdf-tool-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.tool = btn.dataset.tool;
      });
    });
    host.querySelector('#pdfPrevPage')?.addEventListener('click', () => {
      if (state.page > 1) { state.page -= 1; this.renderPdfAnnoPage(); }
    });
    host.querySelector('#pdfNextPage')?.addEventListener('click', () => {
      if (state.page < state.numPages) { state.page += 1; this.renderPdfAnnoPage(); }
    });

    const overlay = host.querySelector('#pdfOverlayCanvas');
    overlay.addEventListener('mousedown', (e) => this.pdfAnnoMouseDown(e));
    overlay.addEventListener('mousemove', (e) => this.pdfAnnoMouseMove(e));
    overlay.addEventListener('mouseup', (e) => this.pdfAnnoMouseUp(e));
    overlay.addEventListener('mouseleave', (e) => this.pdfAnnoMouseUp(e));

    try {
      const pdfjsLib = await this.ensurePdfJsLibrary();
      state.pdf = await pdfjsLib.getDocument({ url, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true }).promise;
      state.numPages = state.pdf.numPages || 1;
      await this.renderPdfAnnoPage();
      this.renderPdfAnnotationList();
    } catch (error) {
      console.error('Open PDF annotator failed:', error);
      host.innerHTML = `<div class="assignment-file-empty">${I18n.getLocale() === 'en' ? 'Failed to load PDF' : '載入 PDF 失敗'}</div>`;
    }
  },

  async renderPdfAnnoPage() {
    const state = this._pdfAnnoState;
    if (!state?.pdf) return;
    const page = await state.pdf.getPage(state.page);
    const viewport = page.getViewport({ scale: state.scale });
    state.viewport = viewport;

    const base = document.getElementById('pdfBaseCanvas');
    const overlay = document.getElementById('pdfOverlayCanvas');
    if (!base || !overlay) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    [base, overlay].forEach(c => {
      c.width = Math.floor(viewport.width * dpr);
      c.height = Math.floor(viewport.height * dpr);
      c.style.width = `${Math.floor(viewport.width)}px`;
      c.style.height = `${Math.floor(viewport.height)}px`;
    });

    const ctx = base.getContext('2d', { alpha: false });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const label = document.getElementById('pdfPageLabel');
    if (label) label.textContent = `${state.page}/${state.numPages}`;
    this.redrawPdfOverlay();
  },

  redrawPdfOverlay() {
    const state = this._pdfAnnoState;
    const overlay = document.getElementById('pdfOverlayCanvas');
    if (!state || !overlay) return;
    const ctx = overlay.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, overlay.width / dpr, overlay.height / dpr);

    const pageAnns = (this._gradingModalAnnotations || [])
      .filter(a => a.fileId === state.fileId && a.page === state.page);

    pageAnns.forEach(a => this.drawAnnotationOnCanvas(ctx, a));
  },

  drawAnnotationOnCanvas(ctx, a) {
    const color = a.color || (a.type === 'highlight' ? '#FFD54F' : '#E53935');
    if (a.type === 'highlight') {
      ctx.fillStyle = color + '66';
      ctx.fillRect(a.x, a.y, a.width, a.height);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(a.x, a.y, a.width, a.height);
    } else if (a.type === 'comment') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(a.x + 10, a.y + 10, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('!', a.x + 7, a.y + 14);
    } else if (a.type === 'draw' && Array.isArray(a.path) && a.path.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.path[0].x, a.path[0].y);
      a.path.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  },

  pdfAnnoEventToCoords(event) {
    const overlay = document.getElementById('pdfOverlayCanvas');
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    return {
      x: Math.max(0, event.clientX - rect.left),
      y: Math.max(0, event.clientY - rect.top)
    };
  },

  pdfAnnoMouseDown(event) {
    const state = this._pdfAnnoState;
    if (!state) return;
    state.drawing = true;
    state.start = this.pdfAnnoEventToCoords(event);
    state.path = [state.start];
  },

  pdfAnnoMouseMove(event) {
    const state = this._pdfAnnoState;
    if (!state?.drawing) return;
    const pt = this.pdfAnnoEventToCoords(event);
    if (state.tool === 'draw') {
      state.path.push(pt);
      const overlay = document.getElementById('pdfOverlayCanvas');
      const ctx = overlay.getContext('2d');
      ctx.strokeStyle = '#E53935';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const last = state.path[state.path.length - 2] || pt;
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else if (state.tool === 'highlight') {
      // 預覽
      this.redrawPdfOverlay();
      const overlay = document.getElementById('pdfOverlayCanvas');
      const ctx = overlay.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = pt.x - state.start.x;
      const h = pt.y - state.start.y;
      ctx.fillStyle = '#FFD54F66';
      ctx.fillRect(state.start.x, state.start.y, w, h);
      ctx.strokeStyle = '#FFD54F';
      ctx.strokeRect(state.start.x, state.start.y, w, h);
    }
  },

  async pdfAnnoMouseUp(event) {
    const state = this._pdfAnnoState;
    if (!state?.drawing) return;
    state.drawing = false;
    const pt = this.pdfAnnoEventToCoords(event);
    const isEnglish = I18n.getLocale() === 'en';

    if (state.tool === 'highlight') {
      const x = Math.min(state.start.x, pt.x);
      const y = Math.min(state.start.y, pt.y);
      const width = Math.abs(pt.x - state.start.x);
      const height = Math.abs(pt.y - state.start.y);
      if (width < 4 || height < 4) { this.redrawPdfOverlay(); return; }
      this._gradingModalAnnotations.push({
        id: `ann_${Date.now()}`,
        fileId: state.fileId,
        page: state.page,
        type: 'highlight',
        x, y, width, height,
        color: '#FFD54F',
        comment: '',
        createdAt: new Date().toISOString()
      });
    } else if (state.tool === 'comment') {
      const text = window.prompt(isEnglish ? 'Comment text:' : '批註文字：', '');
      if (!text) { this.redrawPdfOverlay(); return; }
      this._gradingModalAnnotations.push({
        id: `ann_${Date.now()}`,
        fileId: state.fileId,
        page: state.page,
        type: 'comment',
        x: state.start.x, y: state.start.y,
        width: 20, height: 20,
        color: '#E53935',
        comment: text.slice(0, 2000),
        createdAt: new Date().toISOString()
      });
    } else if (state.tool === 'draw') {
      if (state.path.length < 2) { this.redrawPdfOverlay(); return; }
      this._gradingModalAnnotations.push({
        id: `ann_${Date.now()}`,
        fileId: state.fileId,
        page: state.page,
        type: 'draw',
        x: state.start.x, y: state.start.y,
        width: 0, height: 0,
        path: state.path.slice(),
        color: '#E53935',
        comment: '',
        createdAt: new Date().toISOString()
      });
    }

    state.start = null;
    state.path = [];
    this.redrawPdfOverlay();
    this.renderPdfAnnotationList();
  },

  renderPdfAnnotationList() {
    const list = document.getElementById('pdfAnnotationList');
    if (!list) return;
    const state = this._pdfAnnoState;
    const anns = (this._gradingModalAnnotations || []).filter(a => !state?.fileId || a.fileId === state.fileId);
    const isEnglish = I18n.getLocale() === 'en';
    if (anns.length === 0) {
      list.innerHTML = `<div class="pdf-annotator-empty">${isEnglish ? 'No annotations yet' : '尚未新增批註'}</div>`;
      return;
    }
    list.innerHTML = anns.map((a, idx) => `
      <div class="pdf-annotator-item">
        <div>
          <strong>${this.escapeText(a.type)}</strong> · ${isEnglish ? 'p.' : '第'}${a.page}${isEnglish ? '' : '頁'}
          ${a.comment ? `<div>${this.escapeText(a.comment)}</div>` : ''}
        </div>
        <button type="button" class="btn-sm" onclick="MoodleUI.removePdfAnnotation(${idx})">${t('common.remove') || '移除'}</button>
      </div>
    `).join('');
  },

  removePdfAnnotation(index) {
    const state = this._pdfAnnoState;
    const all = this._gradingModalAnnotations || [];
    const filtered = all.filter(a => !state?.fileId || a.fileId === state.fileId);
    const target = filtered[index];
    if (!target) return;
    this._gradingModalAnnotations = all.filter(a => a !== target);
    this.redrawPdfOverlay();
    this.renderPdfAnnotationList();
  },

  /**
   * 教師評分提交
   */
  async gradeSubmission(assignmentId, studentId) {
    const gradeInput = document.getElementById(`grade_${studentId}`);
    const grade = gradeInput?.value;
    if (!grade) {
      showToast(t('moodleAssignment.gradeRequired'));
      return;
    }
    try {
      const result = await API.assignments.gradeSubmission(assignmentId, studentId, {
        grade: parseFloat(grade),
        feedback: ''
      });
      if (result.success) {
        showToast(t('moodleAssignment.gradeSuccess'));

        // Live-update the grade input to reflect the saved value
        const savedGrade = result.data?.grade ?? parseFloat(grade);
        if (gradeInput) {
          gradeInput.value = savedGrade;
          gradeInput.style.outline = '2px solid var(--olive, #6b8e23)';
          setTimeout(() => { gradeInput.style.outline = ''; }, 1500);
        }

        // Update the cached submission data so subsequent renders stay current
        if (this.currentAssignmentDetail?.submissions) {
          const sub = this.currentAssignmentDetail.submissions.find(
            s => s.studentId === studentId
          );
          if (sub) sub.grade = savedGrade;
        }
      } else {
        showToast(result.message || t('moodleAssignment.gradeFailed'));
      }
    } catch (error) {
      showToast(t('moodleAssignment.gradeFailed'));
    }
  },

  /**
   * 提交作業
   */
  async submitAssignment(assignmentId) {
    const assignment = this.currentAssignmentDetail?.assignmentId === assignmentId
      ? this.currentAssignmentDetail
      : await API.assignments.get(assignmentId).then(result => result.success ? this.normalizeAssignmentState(result.data || {}) : null);
    if (!assignment) {
      showToast(t('moodleAssignment.loadFailed'));
      return;
    }

    const draft = this.assignmentSubmissionDraft || this.createAssignmentSubmissionDraft(assignment);
    const content = String(draft.content || '').trim();
    const existingFiles = this.normalizeAssignmentFiles(draft.existingFiles || []);
    const pendingFiles = Array.isArray(draft.pendingFiles) ? draft.pendingFiles : [];
    const submissionType = assignment.submissionType || 'text';
    const totalFileCount = existingFiles.length + pendingFiles.length;

    if (submissionType === 'text' && !content) {
      showToast(t('moodleAssignment.contentRequired'));
      return;
    }

    if (submissionType === 'file' && totalFileCount === 0) {
      showToast(t('moodleAssignment.contentRequired'));
      return;
    }

    if (submissionType === 'both' && !content && totalFileCount === 0) {
      showToast(t('moodleAssignment.contentRequired'));
      return;
    }

    try {
      const uploadedFiles = [];
      for (const file of pendingFiles) {
        const uploadResult = await API.files.upload(file, {
          folder: `assignments/${assignment.courseId || 'general'}/${assignmentId}`,
          courseId: assignment.courseId || null,
          visibility: assignment.courseId ? 'course' : 'private'
        });

        if (!uploadResult.success || !uploadResult.data) {
          showToast(uploadResult.message || t('moodleAssignment.submitFailed'));
          return;
        }

        uploadedFiles.push(this.normalizeAssignmentFile({
          ...uploadResult.data,
          uploadedAt: uploadResult.data.createdAt || new Date().toISOString()
        }));
      }

      const files = [...existingFiles, ...uploadedFiles].map(file => ({
        fileId: file.fileId || null,
        filename: file.name || file.filename || file.fileName || 'file',
        name: file.name || file.filename || file.fileName || 'file',
        size: file.size || null,
        contentType: file.contentType || file.mimeType || 'application/octet-stream',
        mimeType: file.contentType || file.mimeType || 'application/octet-stream',
        uploadedAt: file.uploadedAt || new Date().toISOString(),
        viewUrl: file.viewUrl || null,
        downloadUrl: file.downloadUrl || null
      }));

      const result = await API.assignments.submit(assignmentId, {
        content,
        files
      });
      if (result.success) {
        showToast(result.message || t('moodleAssignment.submitSuccess'));
        this.openAssignment(assignmentId);
      } else {
        showToast(result.message || t('moodleAssignment.submitFailed'));
      }
    } catch (error) {
      console.error('Submit assignment error:', error);
      showToast(t('moodleAssignment.submitFailed'));
    }
  },

  // ==================== 測驗系統 ====================

  /**
   * 載入測驗列表
   */
  async loadQuizzes(courseId, filter = 'all') {
    const container = document.getElementById('quizzesList');
    if (!container) return;

    // 沒有指定課程 → 顯示課程選擇器
    if (!courseId) {
      this.currentQuizCourseId = null;
      this.renderCoursePicker(
        t('moodleQuiz.title'),
        '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--olive)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        'MoodleUI.loadQuizzes',
        'quizzesList'
      );
      return;
    }

    this.currentQuizCourseId = courseId;

    try {
      container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
      const quizzesResult = await API.quizzes.list(courseId ? { courseId } : {});
      let quizzes = quizzesResult.success ? (quizzesResult.data || []) : [];

      let courseName = '';
      let course = null;
      try {
        const courseResult = await API.courses.get(courseId);
        if (courseResult.success) {
          course = courseResult.data;
          courseName = course.title || course.name || '';
        }
      } catch(e) {}

      quizzes = quizzes.map(q =>
        this.normalizeQuizState({ ...q, courseName, courseId })
      );

      const now = new Date();
      if (filter === 'available') {
        quizzes = quizzes.filter(q => {
          const open = q.openDate ? new Date(q.openDate) : null;
          const close = q.closeDate ? new Date(q.closeDate) : null;
          return (!open || open <= now) && (!close || close >= now);
        });
      } else if (filter === 'completed') {
        quizzes = quizzes.filter(q => q.completed);
      }

      this.renderQuizzesWithBack(quizzes, courseName, courseId, filter, {
        canManage: this.canManageCourse(course)
      });
    } catch (error) {
      console.error('Load quizzes error:', error);
      container.innerHTML = `<div class="error">${t('moodleQuiz.loadFailed')}</div>`;
    }
  },

  renderQuizzesWithBack(quizzes, courseName, courseId, currentFilter, { canManage = false } = {}) {
    const container = document.getElementById('quizzesList');
    if (!container) return;

    const normalizedQuizzes = (Array.isArray(quizzes) ? quizzes : [])
      .map(q => this.normalizeQuizState(q));
    const user = API.getCurrentUser();
    const isTeacher = this.isTeachingRole(user) && canManage;
    const isEnglish = I18n.getLocale() === 'en';
    const header = this.renderActivityCollectionHeader({
      backAction: 'MoodleUI.loadQuizzes()',
      title: `${courseName} — ${t('moodleQuiz.title')}`,
      subtitle: isTeacher
        ? (isEnglish ? 'Manage availability and attempt analytics.' : '管理開放時間與作答表現。')
        : (isEnglish ? 'Start available quizzes and review your attempts.' : '查看可作答的測驗與作答結果。'),
      ctaAction: isTeacher ? `MoodleUI.showCreateQuizModal(${this.toInlineActionValue(courseId)})` : '',
      ctaLabel: isTeacher ? (isEnglish ? 'Create quiz' : '新增測驗') : '',
      metaChips: [
        { label: `${normalizedQuizzes.length} ${isEnglish ? 'quizzes' : '份測驗'}` },
        currentFilter && currentFilter !== 'all'
          ? { label: isEnglish ? `Filter: ${currentFilter}` : `篩選：${currentFilter}` }
          : null
      ]
    });

    const body = normalizedQuizzes.length === 0
      ? this.renderActivityEmptyState({
          icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
          title: isTeacher ? (isEnglish ? 'No quizzes yet' : '尚未建立測驗') : t('moodleQuiz.noQuizzes'),
          hint: isTeacher
            ? (isEnglish ? 'Create the first quiz for this course.' : '點擊「新增測驗」開始建立測驗。')
            : (isEnglish ? 'Quizzes will appear here once your teacher publishes them.' : '老師發布測驗後，會顯示在這裡。')
        })
      : normalizedQuizzes.map(q => this.renderQuizCard(q, { teacherView: isTeacher })).join('');

    container.innerHTML = `
      <div class="activity-shell">
        ${header}
        <div class="activity-shell-list">
          ${body}
        </div>
      </div>
    `;
  },

  /**
   * 渲染測驗列表
   */
  renderQuizzesList(quizzes) {
    const container = document.getElementById('quizzesList');
    if (!container) return;

    const normalizedQuizzes = (Array.isArray(quizzes) ? quizzes : [])
      .map(q => this.normalizeQuizState(q));

    if (normalizedQuizzes.length === 0) {
      container.innerHTML = this.renderActivityEmptyState({
        icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        title: t('moodleQuiz.noQuizzes')
      });
      return;
    }

    container.innerHTML = normalizedQuizzes
      .map(q => this.renderQuizCard(q, { showCourse: true }))
      .join('');
  },

  /**
   * 篩選測驗
   */
  filterQuizzes(filter, btn) {
    document.querySelectorAll('#moodleQuizzesView .tab-btn').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.loadQuizzes(this.currentQuizCourseId, filter);
  },

  async deleteQuiz(quizId, courseId = this.currentQuizCourseId || this.currentCourseId) {
    const confirmed = await showConfirmDialog({
      message: I18n.getLocale() === 'en' ? 'Delete this quiz and all attempt records?' : '確定要刪除此測驗與所有作答紀錄嗎？',
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.quizzes.delete(quizId);
      if (!result.success) {
        showToast(result.message || t('common.deleteFailed'));
        return;
      }

      showToast(result.message || (I18n.getLocale() === 'en' ? 'Quiz deleted' : '測驗已刪除'));
      showView('moodleQuizzes');
      await this.loadQuizzes(courseId || this.currentQuizCourseId);
    } catch (error) {
      console.error('Delete quiz error:', error);
      showToast(t('common.deleteFailed'));
    }
  },

  /**
   * 開始測驗
   */
  async startQuiz(quizId) {
    try {
      const result = await API.quizzes.start(quizId);
      if (result.success) {
        this.currentQuizAttempt = this.normalizeQuizAttemptState(result.data);
        this.currentQuestionIndex = 0;
        this.renderQuizQuestion();
        showView('quizAttempt');
        if (this.hasQuizPendingAnswerSaves()) {
          this.currentQuizAnswerSaveTimer = window.setTimeout(() => {
            this.flushQuizAnswerSaves({ silent: true });
          }, 500);
        }
      } else {
        showToast(result.message || t('moodleQuiz.startFailed'));
      }
    } catch (error) {
      console.error('Start quiz error:', error);
      showToast(t('moodleQuiz.startError'));
    }
  },

  currentQuizAttempt: null,
  currentQuestionIndex: 0,
  currentQuizPendingAnswerSaves: {},
  currentQuizAnswerSaveTimer: null,
  currentQuizAnswerSavePromise: null,
  quizAnswerSaveWarningShown: false,
  quizAutosaveLifecycleHandlersAttached: false,
  quizAutosaveState: { state: 'idle', message: '' },

  setupQuizAutosaveLifecycleHandlers() {
    if (this.quizAutosaveLifecycleHandlersAttached) return;
    this.quizAutosaveLifecycleHandlersAttached = true;

    const flushBeforeLeaving = (event = null) => {
      if (!this.currentQuizAttempt) return undefined;
      this.saveCurrentQuestionAnswer({ immediate: false });
      const hasPending = this.hasQuizPendingAnswerSaves();
      if (hasPending) {
        this.flushQuizAnswerSaves({ keepalive: true, silent: true });
      }

      if (event?.type === 'beforeunload' && hasPending) {
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
      return undefined;
    };

    window.addEventListener('beforeunload', flushBeforeLeaving);
    window.addEventListener('pagehide', flushBeforeLeaving);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushBeforeLeaving({ type: 'visibilitychange' });
      } else if (this.currentQuizAttempt) {
        this.flushQuizAnswerSaves({ silent: true });
      }
    });
    window.addEventListener('online', () => {
      if (this.currentQuizAttempt) this.flushQuizAnswerSaves();
    });
  },

  hasQuizPendingAnswerSaves() {
    return Object.keys(this.currentQuizPendingAnswerSaves || {}).length > 0;
  },

  getQuizAutosaveStorageKey(attempt = this.currentQuizAttempt) {
    if (!attempt?.quizId || !attempt?.attemptId) return null;
    const userId = API.getCurrentUser()?.userId || 'anonymous';
    return `bb.quizAutosave.${userId}.${attempt.quizId}.${attempt.attemptId}`;
  },

  readQuizPendingAnswerDraft(attempt = this.currentQuizAttempt) {
    const key = this.getQuizAutosaveStorageKey(attempt);
    if (!key) return {};
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed?.quizId !== attempt.quizId || parsed?.attemptId !== attempt.attemptId) return {};
      return this.normalizeQuizObjectAnswer(parsed.answers);
    } catch (error) {
      return {};
    }
  },

  writeQuizPendingAnswerDraft(attempt = this.currentQuizAttempt, answers = {}) {
    const key = this.getQuizAutosaveStorageKey(attempt);
    if (!key) return;
    const safeAnswers = this.normalizeQuizObjectAnswer(answers);
    try {
      if (Object.keys(safeAnswers).length === 0) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, JSON.stringify({
        quizId: attempt.quizId,
        attemptId: attempt.attemptId,
        answers: safeAnswers,
        updatedAt: new Date().toISOString()
      }));
    } catch (error) {
      // localStorage may be unavailable in private mode; server autosave still runs.
    }
  },

  mergeQuizPendingAnswerDraft(attempt = this.currentQuizAttempt, answers = {}) {
    const merged = {
      ...this.readQuizPendingAnswerDraft(attempt),
      ...this.normalizeQuizObjectAnswer(answers)
    };
    this.writeQuizPendingAnswerDraft(attempt, merged);
  },

  clearQuizPendingAnswerDraft(attempt = this.currentQuizAttempt, sentAnswers = null) {
    const key = this.getQuizAutosaveStorageKey(attempt);
    if (!key) return;
    if (!sentAnswers) {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
      return;
    }

    const stored = this.readQuizPendingAnswerDraft(attempt);
    Object.entries(sentAnswers).forEach(([questionId, answer]) => {
      if (this.serializeQuizAnswer(stored[questionId]) === this.serializeQuizAnswer(answer)) {
        delete stored[questionId];
      }
    });
    this.writeQuizPendingAnswerDraft(attempt, stored);
  },

  setQuizAutosaveState(state = 'idle', message = null) {
    const isEnglish = I18n.getLocale() === 'en';
    const now = new Date();
    const time = now.toLocaleTimeString(isEnglish ? 'en-US' : 'zh-TW', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const fallback = {
      idle: '',
      local: isEnglish ? 'Recovered local answers; syncing...' : '已回復本機暫存，等待同步...',
      saving: isEnglish ? 'Saving answers...' : '答案儲存中...',
      saved: isEnglish ? `Saved ${time}` : `已儲存 ${time}`,
      error: isEnglish ? 'Saved locally; retrying when online' : '已暫存在本機，連線後會重送'
    };
    const nextMessage = message ?? fallback[state] ?? '';
    this.quizAutosaveState = { state, message: nextMessage };

    const indicator = document.getElementById('quizAutosaveStatus');
    if (indicator) {
      indicator.dataset.state = state;
      indicator.textContent = nextMessage;
    }
  },

  renderQuizAutosaveStatus() {
    const state = this.quizAutosaveState?.state || 'idle';
    const message = this.quizAutosaveState?.message || '';
    return `<div id="quizAutosaveStatus" class="quiz-autosave-status" data-state="${this.escapeText(state)}" role="status" aria-live="polite">${this.escapeText(message)}</div>`;
  },

  getQuizQuestionPartMeta(question = {}) {
    if (question.toeicSectionTitle || question.toeicTaskTitle || question.toeicPartTitle) {
      return {
        label: question.toeicPartTitle || (question.toeicPart ? `Part ${question.toeicPart}` : 'TOEIC'),
        title: question.toeicTaskTitle || question.toeicSectionTitle || question.analysisSection || '',
        detail: question.toeicQuestionRangeLabel || ''
      };
    }

    const sectionTitle = String(question.analysisSection || question.sectionTitle || question.section || '').trim();
    if (!sectionTitle) return null;
    return {
      label: I18n.getLocale() === 'en' ? 'Section' : '區段',
      title: sectionTitle,
      detail: ''
    };
  },

  renderQuizQuestionPartHeader(question = {}) {
    const meta = this.getQuizQuestionPartMeta(question);
    if (!meta?.title) return '';

    return `
      <div class="quiz-question-part-header">
        <span class="quiz-question-part-label">${this.escapeText(meta.label)}</span>
        <strong>${this.escapeText(meta.title)}</strong>
        ${meta.detail ? `<span>${this.escapeText(meta.detail)}</span>` : ''}
      </div>
    `;
  },

  scrollCurrentQuizQuestionNavIntoView(container = document) {
    const nav = container.querySelector('.quiz-question-nav');
    const currentNavButton = nav?.querySelector('.question-nav-btn.current');
    if (!nav || !currentNavButton) return;

    window.requestAnimationFrame(() => {
      const left = currentNavButton.offsetLeft - ((nav.clientWidth - currentNavButton.offsetWidth) / 2);
      nav.scrollTo({ left: Math.max(0, left) });
    });
  },

  normalizeQuizAttemptState(attempt = {}) {
    if (this.currentQuizAnswerSaveTimer) {
      window.clearTimeout(this.currentQuizAnswerSaveTimer);
    }

    const savedAnswers = this.normalizeQuizObjectAnswer(attempt.answers);
    const storedPendingAnswers = this.readQuizPendingAnswerDraft(attempt);
    const mergedAnswers = {
      ...savedAnswers,
      ...storedPendingAnswers
    };
    const questions = (Array.isArray(attempt.questions) ? attempt.questions : []).map((question = {}) => {
      const questionId = question.questionId;
      const nextQuestion = { ...question };
      if (questionId && Object.prototype.hasOwnProperty.call(mergedAnswers, questionId)) {
        const savedAnswer = this.cloneQuizAnswerValue(mergedAnswers[questionId]);
        nextQuestion.answer = savedAnswer;
        nextQuestion.answered = this.isQuizAnswerComplete(nextQuestion, savedAnswer);
        nextQuestion._savedAnswerKey = this.serializeQuizAnswer(savedAnswer);
      } else {
        nextQuestion.answered = this.isQuizAnswerComplete(nextQuestion);
        if (nextQuestion.answer !== undefined) {
          nextQuestion._savedAnswerKey = this.serializeQuizAnswer(nextQuestion.answer);
        }
      }
      return nextQuestion;
    });

    this.currentQuizPendingAnswerSaves = { ...storedPendingAnswers };
    this.currentQuizAnswerSaveTimer = null;
    this.currentQuizAnswerSavePromise = null;
    this.quizAnswerSaveWarningShown = false;
    this.setQuizAutosaveState(Object.keys(storedPendingAnswers).length > 0 ? 'local' : 'idle');

    return {
      ...attempt,
      answers: { ...mergedAnswers },
      questions
    };
  },

  cloneQuizAnswerValue(value) {
    if (Array.isArray(value)) {
      return value.map(item => this.cloneQuizAnswerValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).reduce((copy, key) => {
        copy[key] = this.cloneQuizAnswerValue(value[key]);
        return copy;
      }, {});
    }
    return value;
  },

  serializeQuizAnswer(value) {
    const normalize = (input) => {
      if (Array.isArray(input)) return input.map(item => normalize(item));
      if (input && typeof input === 'object') {
        return Object.keys(input).sort().reduce((copy, key) => {
          copy[key] = normalize(input[key]);
          return copy;
        }, {});
      }
      return input;
    };

    try {
      return JSON.stringify(normalize(value));
    } catch (error) {
      return String(value);
    }
  },

  markQuizQuestionAnswerSaved(question, answer) {
    if (!question) return;
    question._savedAnswerKey = this.serializeQuizAnswer(answer);
  },

  queueQuizAnswerSave(question, answer, { immediate = false } = {}) {
    const attempt = this.currentQuizAttempt;
    if (!attempt || !question?.questionId) return Promise.resolve(true);

    const savedKey = this.serializeQuizAnswer(answer);
    const pending = this.currentQuizPendingAnswerSaves || {};
    if (question._savedAnswerKey === savedKey && !Object.prototype.hasOwnProperty.call(pending, question.questionId)) {
      return Promise.resolve(true);
    }

    const clonedAnswer = this.cloneQuizAnswerValue(answer);
    attempt.answers = {
      ...(attempt.answers || {}),
      [question.questionId]: clonedAnswer
    };
    this.currentQuizPendingAnswerSaves = {
      ...pending,
      [question.questionId]: clonedAnswer
    };
    this.mergeQuizPendingAnswerDraft(attempt, { [question.questionId]: clonedAnswer });
    this.setQuizAutosaveState('saving');

    if (immediate) {
      return this.flushQuizAnswerSaves();
    }

    if (this.currentQuizAnswerSaveTimer) {
      window.clearTimeout(this.currentQuizAnswerSaveTimer);
    }
    this.currentQuizAnswerSaveTimer = window.setTimeout(() => {
      this.flushQuizAnswerSaves();
    }, 700);

    return Promise.resolve(true);
  },

  async flushQuizAnswerSaves({ keepalive = false, silent = false } = {}) {
    if (this.currentQuizAnswerSavePromise) {
      return this.currentQuizAnswerSavePromise.then(() => {
        if (this.hasQuizPendingAnswerSaves()) {
          return this.flushQuizAnswerSaves({ keepalive, silent });
        }
        return true;
      });
    }

    if (this.currentQuizAnswerSaveTimer) {
      window.clearTimeout(this.currentQuizAnswerSaveTimer);
      this.currentQuizAnswerSaveTimer = null;
    }

    const attempt = this.currentQuizAttempt;
    const pending = this.currentQuizPendingAnswerSaves || {};
    const entries = Object.entries(pending);
    if (!attempt || entries.length === 0) return true;

    const answers = entries.reduce((map, [questionId, answer]) => {
      map[questionId] = this.cloneQuizAnswerValue(answer);
      return map;
    }, {});
    this.currentQuizPendingAnswerSaves = {};
    this.setQuizAutosaveState('saving');

    this.currentQuizAnswerSavePromise = (async () => {
    try {
      const result = await API.quizzes.answers(attempt.quizId, attempt.attemptId, answers, keepalive ? { keepalive: true } : {});
      if (!result?.success) {
        throw new Error(result?.message || 'Save answers failed');
      }

      entries.forEach(([questionId, answer]) => {
        const question = attempt.questions?.find(item => item.questionId === questionId);
        this.markQuizQuestionAnswerSaved(question, answer);
      });
      this.clearQuizPendingAnswerDraft(attempt, answers);
      this.quizAnswerSaveWarningShown = false;
      this.setQuizAutosaveState('saved');
      if (this.hasQuizPendingAnswerSaves()) {
        this.currentQuizAnswerSaveTimer = window.setTimeout(() => {
          this.flushQuizAnswerSaves({ silent: true });
        }, 300);
      }
      return true;
    } catch (error) {
      console.error('Save quiz answers error:', error);
      this.currentQuizPendingAnswerSaves = {
        ...answers,
        ...(this.currentQuizPendingAnswerSaves || {})
      };
      this.mergeQuizPendingAnswerDraft(attempt, answers);
      this.setQuizAutosaveState('error');
      if (!silent && !this.quizAnswerSaveWarningShown) {
        showToast(I18n.getLocale() === 'en'
          ? 'Answers are saved locally. They will retry automatically when you continue.'
          : '答案已先保留在畫面上，系統會在你繼續操作時重新儲存。');
        this.quizAnswerSaveWarningShown = true;
      }
      if (!keepalive && navigator.onLine !== false && !this.currentQuizAnswerSaveTimer) {
        this.currentQuizAnswerSaveTimer = window.setTimeout(() => {
          this.flushQuizAnswerSaves({ silent: true });
        }, 5000);
      }
      return false;
    } finally {
      this.currentQuizAnswerSavePromise = null;
    }
    })();

    return this.currentQuizAnswerSavePromise;
  },

  /**
   * 渲染測驗題目
   */
  renderQuizQuestion() {
    const container = document.getElementById('quizAttemptContent');
    const attempt = this.currentQuizAttempt;
    if (!container || !attempt) return;

    const question = attempt.questions[this.currentQuestionIndex];
    const totalQuestions = attempt.questions.length;
    const progress = ((this.currentQuestionIndex + 1) / totalQuestions) * 100;
    const isEnglish = I18n.getLocale() === 'en';

    container.innerHTML = `
      <div class="quiz-header">
        <div class="quiz-kicker">${isEnglish ? 'Quiz workspace' : '測驗工作區'}</div>
        <h2>${this.escapeText(attempt.quizTitle || t('moodleQuiz.title'))}</h2>
        <div class="quiz-progress">
          <div class="quiz-progress-copy">
            <span class="quiz-progress-value">${isEnglish ? `Question ${this.currentQuestionIndex + 1}` : `第 ${this.currentQuestionIndex + 1} 題`}</span>
            <span class="quiz-progress-label">${t('moodleQuiz.questionOf')} ${this.currentQuestionIndex + 1} / ${totalQuestions} ${t('moodleQuiz.questionSuffix')}</span>
          </div>
          <div class="quiz-progress-bar">
            <div class="quiz-progress-fill" data-progress-width="${this.clampProgressValue(progress)}"></div>
          </div>
          ${attempt.timeLimit ? `
            <div class="quiz-timer" id="quizTimer">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span id="timerDisplay">${this.formatTime(attempt.remainingTime || attempt.timeLimit * 60)}</span>
            </div>
          ` : ''}
        </div>
        ${this.renderQuizAutosaveStatus()}
      </div>
      <div class="quiz-body">
        <div class="quiz-question-panel">
          <div class="question-content">
            ${this.renderQuizQuestionPartHeader(question)}
            <div class="question-kicker">${isEnglish ? 'Question prompt' : '題目內容'}</div>
            <h3>${question.type === 'cloze'
              ? this.escapeText(isEnglish ? 'Complete the blanks' : '完成空格')
              : this.escapeText(question.text)}</h3>
            ${this.renderQuestionOptions(question)}
          </div>
        </div>
        <div class="quiz-navigation">
          <button type="button" ${this.currentQuestionIndex === 0 ? 'disabled' : ''} onclick="MoodleUI.prevQuestion()" class="btn-secondary">${t('moodleQuiz.prevQuestion')}</button>
          ${this.currentQuestionIndex === totalQuestions - 1 ? `
            <button type="button" onclick="MoodleUI.submitQuiz()" class="btn-primary">${t('moodleQuiz.submitQuiz')}</button>
          ` : `
            <button type="button" onclick="MoodleUI.nextQuestion()" class="btn-primary">${t('moodleQuiz.nextQuestion')}</button>
          `}
        </div>
        <div class="quiz-question-nav" aria-label="${this.escapeText(isEnglish ? 'Question navigation' : '題號導覽')}">
          ${attempt.questions.map((q, i) => {
            const isCurrent = i === this.currentQuestionIndex;
            const label = isEnglish
              ? `Question ${i + 1}${q.answered ? ', answered' : ''}`
              : `第 ${i + 1} 題${q.answered ? '，已作答' : ''}`;
            return `
            <button type="button" class="question-nav-btn ${isCurrent ? 'current' : ''} ${q.answered ? 'answered' : ''}" onclick="MoodleUI.goToQuestion(${i})" aria-label="${this.escapeText(label)}" ${isCurrent ? 'aria-current="step"' : ''}>${i + 1}</button>
          `;
          }).join('')}
        </div>
      </div>
    `;
    this.applyDynamicUiMetrics(container);
    this.scrollCurrentQuizQuestionNavIntoView(container);
  },

  /**
   * 渲染題目選項
   */
  renderQuestionOptions(question) {
    switch (question.type) {
      case 'multiple_choice': {
        const options = this.normalizeQuizAttemptOptions(question);
        return `
          <div class="question-options">
            ${options.map((opt) => `
              <label class="question-option ${this.quizAnswersEqual(question.answer, opt.value) ? 'selected' : ''}" onclick="MoodleUI.selectAnswer(${this.toInlineActionValue(opt.value)})">
                <input type="radio" name="answer" value="${this.escapeText(String(opt.value))}" ${this.quizAnswersEqual(question.answer, opt.value) ? 'checked' : ''}>
                <span class="question-option-text">${this.escapeText(opt.text)}</span>
              </label>
            `).join('')}
          </div>
        `;
      }
      case 'true_false': {
        const options = this.normalizeQuizAttemptOptions(question);
        return `
          <div class="question-options">
            ${options.map((opt) => `
              <label class="question-option ${this.quizAnswersEqual(question.answer, opt.value) ? 'selected' : ''}" onclick="MoodleUI.selectAnswer(${this.toInlineActionValue(opt.value)})">
                <input type="radio" name="answer" value="${this.escapeText(String(opt.value))}" ${this.quizAnswersEqual(question.answer, opt.value) ? 'checked' : ''}>
                <span class="question-option-text">${this.escapeText(opt.text)}</span>
              </label>
            `).join('')}
          </div>
        `;
      }
      case 'multiple_select': {
        const options = this.normalizeQuizAttemptOptions(question);
        const selectedKeys = new Set(this.normalizeQuizAnswerArray(question.answer).map(answer => this.normalizeQuizAnswerKey(answer)));
        return `
          <div class="question-options">
            ${options.map((opt) => {
              const selected = selectedKeys.has(this.normalizeQuizAnswerKey(opt.value));
              return `
              <label class="question-option ${selected ? 'selected' : ''}">
                <input type="checkbox" value="${this.escapeText(String(opt.value))}" ${selected ? 'checked' : ''} onchange="MoodleUI.selectMultipleAnswer(${this.toInlineActionValue(opt.value)})">
                <span class="question-option-text">${this.escapeText(opt.text)}</span>
              </label>
            `;
            }).join('')}
          </div>
        `;
      }
      case 'matching': {
        const prompts = Array.isArray(question.matchingPrompts) ? question.matchingPrompts : [];
        const options = this.normalizeQuizAttemptOptions(question);
        const answerMap = this.normalizeQuizObjectAnswer(question.answer);
        const placeholder = I18n.getLocale() === 'en' ? 'Select a match' : '選擇配對答案';
        return `
          <div class="quiz-matching-list">
            ${prompts.map((prompt, index) => {
              const promptId = String(prompt.id ?? index);
              const selectedValue = answerMap[promptId] ?? '';
              return `
                <div class="quiz-matching-row">
                  <div class="quiz-matching-prompt">${this.escapeText(prompt.text || prompt.prompt || '')}</div>
                  <select class="quiz-matching-select" data-prompt-id="${this.escapeText(promptId)}" onchange="MoodleUI.updateMatchingAnswer(${this.toInlineActionValue(promptId)}, this.value)">
                    <option value="">${this.escapeText(placeholder)}</option>
                    ${options.map(option => `
                      <option value="${this.escapeText(String(option.value))}" ${this.quizAnswersEqual(selectedValue, option.value) ? 'selected' : ''}>${this.escapeText(option.text)}</option>
                    `).join('')}
                  </select>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
      case 'ordering': {
        const orderedOptions = this.getCurrentOrderingOptions(question);
        return `
          <div class="quiz-ordering-list">
            ${orderedOptions.map((option, index) => `
              <div class="quiz-ordering-item" data-value="${this.escapeText(String(option.value))}">
                <span class="quiz-ordering-rank">${index + 1}</span>
                <span class="quiz-ordering-text">${this.escapeText(option.text)}</span>
                <div class="quiz-ordering-actions">
                  <button type="button" class="btn-icon-sm" ${index === 0 ? 'disabled' : ''} onclick="MoodleUI.moveOrderingAnswer(${index}, -1)" aria-label="${this.escapeText(I18n.getLocale() === 'en' ? 'Move up' : '上移')}">↑</button>
                  <button type="button" class="btn-icon-sm" ${index === orderedOptions.length - 1 ? 'disabled' : ''} onclick="MoodleUI.moveOrderingAnswer(${index}, 1)" aria-label="${this.escapeText(I18n.getLocale() === 'en' ? 'Move down' : '下移')}">↓</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
      case 'numerical':
        return `
          <div class="form-group">
            <input id="answerText" type="number" step="any" value="${this.escapeText(question.answer ?? '')}" placeholder="${this.escapeText(I18n.getLocale() === 'en' ? 'Enter a number' : '輸入數值')}" oninput="MoodleUI.updateCurrentTextAnswer(this.value)">
          </div>
        `;
      case 'cloze':
        return this.renderClozeAttemptPassage(question);
      case 'short_answer':
      case 'fill_blank':
      case 'essay':
        return `
          <div class="form-group">
            <textarea id="answerText" rows="${question.type === 'essay' ? 8 : 2}" placeholder="${this.escapeText(t('moodleQuiz.answerPlaceholder'))}" oninput="MoodleUI.updateCurrentTextAnswer(this.value)">${this.escapeText(question.answer ?? '')}</textarea>
          </div>
        `;
      default:
        return '';
    }
  },

  normalizeQuizAttemptOptions(question = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    if (question.type === 'true_false') {
      const fallback = [
        { text: t('moodleNewQuestion.tfTrue') || (isEnglish ? 'True' : '是'), value: true },
        { text: t('moodleNewQuestion.tfFalse') || (isEnglish ? 'False' : '否'), value: false }
      ];
      const sourceOptions = Array.isArray(question.options) && question.options.length >= 2
        ? question.options.slice(0, 2)
        : fallback;
      return sourceOptions.map((option, index) => {
        if (option && typeof option === 'object') {
          const value = this.normalizeQuizBooleanValue(option.value, index === 0);
          return {
            text: String(option.text || option.label || fallback[index].text),
            value
          };
        }

        return {
          text: String(option || fallback[index].text),
          value: index === 0
        };
      });
    }

    return (Array.isArray(question.options) ? question.options : []).map((option, index) => {
      if (option && typeof option === 'object') {
        return {
          text: String(option.text ?? option.label ?? option.value ?? ''),
          value: option.value ?? option.id ?? index
        };
      }

      return {
        text: String(option ?? ''),
        value: index
      };
    });
  },

  normalizeQuizBooleanValue(value, fallback = null) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === 0) return true;
      if (value === 1) return false;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 't', 'yes', 'y', '1', '是', '對', '正確'].includes(normalized)) return true;
      if (['false', 'f', 'no', 'n', '0', '否', '錯', '錯誤'].includes(normalized)) return false;
    }
    return fallback;
  },

  normalizeQuizAnswerKey(value) {
    if (value && typeof value === 'object' && 'value' in value) {
      return this.normalizeQuizAnswerKey(value.value);
    }
    return String(value ?? '').trim();
  },

  normalizeQuizAnswerArray(answer) {
    if (Array.isArray(answer)) return answer;
    if (answer === undefined || answer === null || answer === '') return [];
    return [answer];
  },

  normalizeQuizObjectAnswer(answer) {
    return answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
  },

  quizAnswersEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right)
      || this.normalizeQuizAnswerKey(left) === this.normalizeQuizAnswerKey(right);
  },

  isQuizTextQuestion(question = {}) {
    return ['short_answer', 'fill_blank', 'essay', 'numerical'].includes(question.type);
  },

  updateCurrentTextAnswer(answer) {
    const question = this.currentQuizAttempt?.questions?.[this.currentQuestionIndex];
    if (!question || !this.isQuizTextQuestion(question)) return;
    question.answer = answer;
    question.answered = String(answer || '').trim().length > 0;
    this.updateQuizCurrentNavAnsweredState(question.answered);
    this.queueQuizAnswerSave(question, answer);
  },

  getCurrentOrderingOptions(question = {}) {
    const options = this.normalizeQuizAttemptOptions(question);
    const optionByKey = new Map(options.map(option => [this.normalizeQuizAnswerKey(option.value), option]));
    const answerOrder = this.normalizeQuizAnswerArray(question.answer);
    if (answerOrder.length === 0) return options;

    const used = new Set();
    const ordered = answerOrder
      .map(value => {
        const key = this.normalizeQuizAnswerKey(value);
        const option = optionByKey.get(key);
        if (option) used.add(key);
        return option;
      })
      .filter(Boolean);

    options.forEach(option => {
      const key = this.normalizeQuizAnswerKey(option.value);
      if (!used.has(key)) ordered.push(option);
    });

    return ordered;
  },

  updateMatchingAnswer(promptId, value) {
    const question = this.currentQuizAttempt?.questions?.[this.currentQuestionIndex];
    if (!question || question.type !== 'matching') return;
    const answerMap = { ...this.normalizeQuizObjectAnswer(question.answer) };
    if (value === '') {
      delete answerMap[String(promptId)];
    } else {
      answerMap[String(promptId)] = value;
    }
    question.answer = answerMap;
    question.answered = this.isQuizAnswerComplete(question, answerMap);
    this.updateQuizCurrentNavAnsweredState(question.answered);
    this.queueQuizAnswerSave(question, answerMap);
  },

  updateClozeAnswer(blankId, value) {
    const question = this.currentQuizAttempt?.questions?.[this.currentQuestionIndex];
    if (!question || question.type !== 'cloze') return;
    const answerMap = { ...this.normalizeQuizObjectAnswer(question.answer), [String(blankId)]: value };
    question.answer = answerMap;
    question.answered = this.isQuizAnswerComplete(question, answerMap);
    this.updateQuizCurrentNavAnsweredState(question.answered);
    this.queueQuizAnswerSave(question, answerMap);
  },

  moveOrderingAnswer(index, delta) {
    const question = this.currentQuizAttempt?.questions?.[this.currentQuestionIndex];
    if (!question || question.type !== 'ordering') return;
    const orderedOptions = this.getCurrentOrderingOptions(question);
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= orderedOptions.length) return;
    const [item] = orderedOptions.splice(index, 1);
    orderedOptions.splice(nextIndex, 0, item);
    question.answer = orderedOptions.map(option => option.value);
    question.answered = question.answer.length > 0;
    this.queueQuizAnswerSave(question, question.answer);
    this.renderQuizQuestion();
  },

  renderClozeAttemptPassage(question = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    const text = String(question.clozeText || question.text || '');
    const blanks = Array.isArray(question.clozeBlanks) ? question.clozeBlanks : [];
    const answerMap = this.normalizeQuizObjectAnswer(question.answer);
    let html = '';
    let cursor = 0;
    const usedIds = new Set();
    const blankPattern = /\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = blankPattern.exec(text)) !== null) {
      const blankId = String(match[1] || '').trim();
      html += this.escapeText(text.slice(cursor, match.index));
      html += `
        <input
          class="quiz-cloze-input"
          data-blank-id="${this.escapeText(blankId)}"
          value="${this.escapeText(answerMap[blankId] || '')}"
          placeholder="${this.escapeText(isEnglish ? `Blank ${blankId}` : `空格 ${blankId}`)}"
          oninput="MoodleUI.updateClozeAnswer(${this.toInlineActionValue(blankId)}, this.value)"
        >
      `;
      usedIds.add(blankId);
      cursor = match.index + match[0].length;
    }

    html += this.escapeText(text.slice(cursor));

    const missingBlankInputs = blanks
      .map(blank => String(blank.id || '').trim())
      .filter(blankId => blankId && !usedIds.has(blankId));

    return `
      <div class="quiz-cloze-passage">${html || this.escapeText(text)}</div>
      ${missingBlankInputs.length > 0 ? `
        <div class="quiz-cloze-extra-list">
          ${missingBlankInputs.map(blankId => `
            <label class="quiz-cloze-extra">
              <span>${this.escapeText(isEnglish ? `Blank ${blankId}` : `空格 ${blankId}`)}</span>
              <input class="quiz-cloze-input" data-blank-id="${this.escapeText(blankId)}" value="${this.escapeText(answerMap[blankId] || '')}" oninput="MoodleUI.updateClozeAnswer(${this.toInlineActionValue(blankId)}, this.value)">
            </label>
          `).join('')}
        </div>
      ` : ''}
    `;
  },

  updateQuizCurrentNavAnsweredState(answered) {
    const buttons = document.querySelectorAll('.question-nav-btn');
    const button = buttons[this.currentQuestionIndex];
    if (button) button.classList.toggle('answered', !!answered);
  },

  isQuizAnswerComplete(question = {}, answer = question.answer) {
    if (answer === undefined || answer === null) return false;
    if (Array.isArray(answer)) return answer.length > 0;
    if (typeof answer === 'object') {
      return Object.values(answer).some(value => String(value ?? '').trim().length > 0);
    }
    return String(answer).trim().length > 0;
  },

  collectCurrentQuestionAnswer(question = {}) {
    if (this.isQuizTextQuestion(question)) {
      const field = document.getElementById('answerText');
      return field ? field.value : (question.answer ?? '');
    }

    if (question.type === 'matching') {
      return Array.from(document.querySelectorAll('.quiz-matching-select[data-prompt-id]')).reduce((answerMap, select) => {
        const promptId = select.getAttribute('data-prompt-id');
        if (promptId && select.value !== '') answerMap[promptId] = select.value;
        return answerMap;
      }, {});
    }

    if (question.type === 'ordering') {
      return Array.from(document.querySelectorAll('.quiz-ordering-item[data-value]'))
        .map(item => item.getAttribute('data-value'))
        .filter(value => value !== null);
    }

    if (question.type === 'cloze') {
      return Array.from(document.querySelectorAll('.quiz-cloze-input[data-blank-id]')).reduce((answerMap, input) => {
        const blankId = input.getAttribute('data-blank-id');
        if (blankId) answerMap[blankId] = input.value;
        return answerMap;
      }, {});
    }

    return question.answer;
  },

  async saveCurrentQuestionAnswer({ immediate = false } = {}) {
    const attempt = this.currentQuizAttempt;
    const question = attempt?.questions?.[this.currentQuestionIndex];
    if (!attempt || !question) return true;

    const answer = this.collectCurrentQuestionAnswer(question);
    if (answer === undefined) return true;
    question.answer = answer;
    question.answered = this.isQuizAnswerComplete(question, answer);

    return this.queueQuizAnswerSave(question, answer, { immediate });
  },

  async saveCurrentTextAnswer() {
    return this.saveCurrentQuestionAnswer();
  },

  /**
   * 選擇答案
   */
  async selectAnswer(answer) {
    const question = this.currentQuizAttempt?.questions?.[this.currentQuestionIndex];
    if (!question) return;
    question.answer = answer;
    question.answered = true;

    this.updateQuizCurrentNavAnsweredState(true);
    this.queueQuizAnswerSave(question, answer);
    this.renderQuizQuestion();
  },

  /**
   * 下一題
   */
  async nextQuestion() {
    this.saveCurrentQuestionAnswer();
    if (this.currentQuestionIndex < this.currentQuizAttempt.questions.length - 1) {
      this.currentQuestionIndex++;
      this.renderQuizQuestion();
    }
  },

  /**
   * 上一題
   */
  async prevQuestion() {
    this.saveCurrentQuestionAnswer();
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.renderQuizQuestion();
    }
  },

  /**
   * 跳轉到指定題目
   */
  async goToQuestion(index) {
    this.saveCurrentQuestionAnswer();
    this.currentQuestionIndex = index;
    this.renderQuizQuestion();
  },

  /**
   * 提交測驗
   */
  async submitQuiz() {
    await this.saveCurrentQuestionAnswer({ immediate: true });

    const confirmed = await showConfirmDialog({
      message: t('moodleQuiz.confirmSubmit'),
      confirmLabel: t('common.confirm')
    });
    if (!confirmed) return;

    try {
      await this.flushQuizAnswerSaves();
      const finalAnswers = (this.currentQuizAttempt.questions || []).reduce((answers, question) => {
        if (question.questionId && question.answer !== undefined) {
          answers[question.questionId] = question.answer;
        }
        return answers;
      }, {});
      const result = await API.quizzes.submitAttempt(
        this.currentQuizAttempt.quizId,
        this.currentQuizAttempt.attemptId,
        finalAnswers
      );

      if (result.success) {
        this.clearQuizPendingAnswerDraft(this.currentQuizAttempt);
        this.currentQuizPendingAnswerSaves = {};
        this.setQuizAutosaveState('saved');
        if (result.data?.gradeVisibility?.pendingRelease || result.data?.resultVisibility?.resultsAvailable === false) {
          showToast(result.message || t('moodleQuiz.submitPendingRelease'));
          showView('moodleQuizzes');
          this.loadQuizzes();
        } else {
          showToast(`${t('moodleQuiz.completeScore')}：${result.data.score}`);
          this.renderQuizResults(this.currentQuizAttempt.quizId, result.data);
        }
      } else {
        showToast(result.message || t('moodleAssignment.submitFailed'));
      }
    } catch (error) {
      console.error('Submit quiz error:', error);
      showToast(t('moodleAssignment.submitFailed'));
    }
  },

  async reviewQuizAttempt(quizId, attemptId) {
    try {
      const result = await API.quizzes.reviewAttempt(quizId, attemptId);
      if (!result?.success) {
        showToast(result?.message || (I18n.getLocale() === 'en' ? 'Quiz results are not available yet.' : '測驗結果尚未開放。'));
        return;
      }

      const data = result.data || {};
      this.currentQuizAttempt = {
        ...(this.currentQuizAttempt || {}),
        quizId,
        attemptId,
        quizTitle: data.quizTitle || data.title || this.currentQuizAttempt?.quizTitle,
        questions: Array.isArray(data.questions) ? data.questions : (this.currentQuizAttempt?.questions || [])
      };
      this.renderQuizResults(quizId, data);
      showView('quizAttempt', {
        path: `/platform/quiz/${encodeURIComponent(quizId)}/attempt/${encodeURIComponent(attemptId)}`
      });
    } catch (error) {
      console.error('Review quiz attempt error:', error);
      showToast(I18n.getLocale() === 'en' ? 'Quiz results are not available yet.' : '測驗結果尚未開放。');
    }
  },

  getQuizOptionTextFromValue(question = {}, value) {
    const valueKey = this.normalizeQuizAnswerKey(value);
    const option = this.normalizeQuizAttemptOptions(question)
      .find(item => this.normalizeQuizAnswerKey(item.value) === valueKey);
    return option ? option.text : String(value ?? '');
  },

  getQuizResultCorrectAnswer(question = {}) {
    if (question.type === 'multiple_select') return question.correctAnswers ?? question.correctAnswer ?? question.correct;
    if (question.type === 'matching') return question.matchingPairs ?? question.correctAnswer ?? question.correct;
    if (question.type === 'ordering') return question.orderingItems ?? question.correctAnswer ?? question.correct;
    if (question.type === 'numerical') return question.numericAnswer ?? question.correctAnswer ?? question.correct;
    if (question.type === 'cloze') return question.clozeAnswers ?? question.correctAnswers ?? question.correctAnswer ?? question.correct;
    return question.correctAnswer ?? question.correctAnswers ?? question.correct;
  },

  hasQuizResultCorrectAnswer(question = {}) {
    const answer = this.getQuizResultCorrectAnswer(question);
    if (Array.isArray(answer)) return answer.length > 0;
    if (answer && typeof answer === 'object') return Object.keys(answer).length > 0;
    return answer !== undefined && answer !== null && answer !== '';
  },

  formatQuizResultAnswer(question = {}, answer) {
    const isEnglish = I18n.getLocale() === 'en';
    if (answer === null || answer === undefined || answer === '') {
      return isEnglish ? 'No answer' : '未作答';
    }

    if (question.type === 'matching') {
      const pairs = Array.isArray(answer) ? answer : [];
      if (pairs.length > 0 && typeof pairs[0] === 'object') {
        return pairs.map(pair => `${this.escapeText(pair.prompt || pair.left || '')} → ${this.escapeText(pair.answer || pair.right || '')}`).join('<br>');
      }

      const answerMap = this.normalizeQuizObjectAnswer(answer);
      const prompts = Array.isArray(question.matchingPrompts) ? question.matchingPrompts : [];
      const correctPairs = Array.isArray(question.matchingPairs) ? question.matchingPairs : [];
      const rows = Object.entries(answerMap).map(([promptId, selectedValue]) => {
        const prompt = prompts.find(item => this.normalizeQuizAnswerKey(item.id) === this.normalizeQuizAnswerKey(promptId));
        const promptText = prompt?.text || correctPairs[Number(promptId)]?.prompt || promptId;
        const selectedText = this.getQuizOptionTextFromValue(question, selectedValue);
        return `${this.escapeText(promptText)} → ${this.escapeText(selectedText)}`;
      });
      return rows.length > 0 ? rows.join('<br>') : (isEnglish ? 'No answer' : '未作答');
    }

    if (question.type === 'ordering') {
      const order = this.normalizeQuizAnswerArray(answer);
      if (order.length === 0) return isEnglish ? 'No answer' : '未作答';
      return `<ol class="quiz-results-order-list">${order.map(item => `<li>${this.escapeText(this.getQuizOptionTextFromValue(question, item))}</li>`).join('')}</ol>`;
    }

    if (question.type === 'cloze') {
      if (Array.isArray(answer)) {
        return answer.map(blank => {
          const blankId = blank?.id || blank?.blankId || '';
          const answers = Array.isArray(blank?.answers || blank?.acceptedAnswers)
            ? (blank.answers || blank.acceptedAnswers)
            : [blank?.answer ?? blank?.value ?? ''];
          return `${this.escapeText(blankId)}: ${answers.map(item => this.escapeText(item)).join(' / ')}`;
        }).join('<br>');
      }

      const answerMap = this.normalizeQuizObjectAnswer(answer);
      const rows = Object.entries(answerMap)
        .filter(([, value]) => String(value ?? '').trim() !== '')
        .map(([blankId, value]) => `${this.escapeText(blankId)}: ${this.escapeText(value)}`);
      return rows.length > 0 ? rows.join('<br>') : (isEnglish ? 'No answer' : '未作答');
    }

    if (Array.isArray(answer)) {
      if (answer.length === 0) return isEnglish ? 'No answer' : '未作答';
      return answer.map(item => this.escapeText(this.getQuizOptionTextFromValue(question, item))).join(', ');
    }

    if (question.type === 'multiple_choice' || question.type === 'true_false' || question.type === 'multiple_select') {
      return this.escapeText(this.getQuizOptionTextFromValue(question, answer));
    }

    if (question.type === 'numerical' && question.numericTolerance !== undefined && answer === this.getQuizResultCorrectAnswer(question)) {
      return `${this.escapeText(answer)} ± ${this.escapeText(question.numericTolerance || 0)}`;
    }

    return this.escapeText(String(answer));
  },

  /**
   * 渲染測驗結果詳情頁
   */
  renderQuizResults(quizId, data) {
    const container = document.getElementById('quizAttemptContent');
    if (!container) return;

    const isEnglish = I18n.getLocale() === 'en';
    const attempt = this.currentQuizAttempt;
    const resultByQuestionId = new Map((data.questionResults || []).map(result => [result.questionId, result]));
    const correctByQuestionId = new Map((data.correctAnswers || []).map(result => [result.questionId, result]));
    const questions = Array.isArray(data.questions)
      ? data.questions
      : (attempt?.questions || []).map(question => ({
          ...question,
          ...(resultByQuestionId.get(question.questionId) || {}),
          ...(correctByQuestionId.get(question.questionId) || {}),
          userAnswer: question.answer
        }));
    const score = data.score ?? data.grade ?? '—';
    const total = data.totalPoints ?? data.totalScore ?? data.maxGrade ?? data.total ?? questions.reduce((sum, question) => sum + (Number(question.maxPoints || question.points) || 0), 0);
    const percentage = data.percentage ?? (total > 0 ? Math.round((parseFloat(score) / parseFloat(total)) * 100) : null);
    const passed = percentage !== null && percentage >= 60;
    const attemptId = data.attemptId || attempt?.attemptId || '';
    const sectionAnalytics = data.sectionAnalytics || null;

    container.innerHTML = `
      <div class="quiz-results">
        <div class="quiz-results-header">
          <div class="quiz-kicker">${isEnglish ? 'Quiz results' : '測驗結果'}</div>
          <h2>${attempt?.quizTitle || (isEnglish ? 'Quiz Complete' : '測驗完成')}</h2>
          <div class="quiz-results-score-card ${passed ? 'passed' : 'not-passed'}">
            <div class="quiz-results-score-value">${this.escapeText(String(score))} / ${this.escapeText(String(total))}</div>
            ${percentage !== null ? `<div class="quiz-results-score-pct">${percentage}%</div>` : ''}
            <div class="quiz-results-score-label">${passed ? (isEnglish ? 'Passed' : '通過') : (isEnglish ? 'Not passed' : '未通過')}</div>
          </div>
        </div>
        ${sectionAnalytics ? `
          <div class="management-table-shell quiz-results-section-shell">
            <div class="management-table-heading">
              <h3>${isEnglish ? 'Section analytics' : '區段分析'}</h3>
              ${attemptId ? `<button class="btn-sm" onclick="MoodleUI.downloadQuizAttemptCsv(${this.toInlineActionValue(quizId)}, ${this.toInlineActionValue(attemptId)})">${isEnglish ? 'Download CSV' : '下載 CSV'}</button>` : ''}
            </div>
            ${this.renderQuizSectionAnalytics(sectionAnalytics, { mode: 'student' })}
          </div>
        ` : ''}
        <div class="quiz-results-questions">
          <h3>${isEnglish ? 'Answer Review' : '答案檢視'}</h3>
          ${questions.map((q, i) => {
            const studentAnswer = q.studentAnswer ?? q.answer ?? q.userAnswer;
            const correctAnswer = this.getQuizResultCorrectAnswer(q);
            const isCorrect = q.isCorrect ?? q.correct === studentAnswer;
            const questionText = q.questionText ?? q.text ?? (isEnglish ? `Question ${i + 1}` : `第 ${i + 1} 題`);

            return `
              <div class="quiz-results-question ${isCorrect ? 'is-correct' : 'is-wrong'}">
                <div class="quiz-results-question-header">
                  <span class="quiz-results-question-num">${i + 1}</span>
                  <span class="quiz-results-question-status">${isCorrect
                    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--olive)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
                    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--rust)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
                  }</span>
                </div>
                <div class="quiz-results-question-text">${this.escapeText(questionText)}</div>
                <div class="quiz-results-answer quiz-results-student-answer ${isCorrect ? 'correct' : 'wrong'}">
                  <strong>${isEnglish ? 'Your answer:' : '你的答案：'}</strong> ${this.formatQuizResultAnswer(q, studentAnswer)}
                </div>
                ${!isCorrect && this.hasQuizResultCorrectAnswer(q) ? `
                  <div class="quiz-results-answer quiz-results-correct-answer">
                    <strong>${isEnglish ? 'Correct answer:' : '正確答案：'}</strong> ${this.formatQuizResultAnswer(q, correctAnswer)}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div class="quiz-results-footer">
          <button class="btn-primary" onclick="return openPlatformView(event, 'moodleQuizzes')">${isEnglish ? 'Back to quiz list' : '返回測驗列表'}</button>
        </div>
      </div>
    `;
    this.applyDynamicUiMetrics(container);
  },

  /**
   * 格式化時間
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  // ==================== 討論區系統 ====================

  /**
   * 載入討論區列表
   */
  async loadForums(courseId, filter = 'all') {
    const container = document.getElementById('forumsList');
    if (!container) return;

    // 沒有指定課程 → 顯示課程選擇器
    if (!courseId) {
      this.currentForumCourseId = null;
      this.renderCoursePicker(
        t('moodleForum.title'),
        '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--olive)" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
        'MoodleUI.loadForums',
        'forumsList'
      );
      return;
    }

    this.currentForumCourseId = courseId;

    try {
      container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
      const forumsResult = await API.forums.list(courseId);
      let forums = forumsResult.success ? (forumsResult.data || []) : [];

      let courseName = '';
      let course = null;
      try {
        const courseResult = await API.courses.get(courseId);
        if (courseResult.success) {
          course = courseResult.data;
          courseName = course.title || course.name || '';
        }
      } catch(e) {}

      forums = forums.map(f => ({ ...f, courseName, courseId }));

      if (filter === 'subscribed') {
        forums = forums.filter(f => f.subscribed);
      }

      this.renderForumsWithBack(forums, courseName, courseId, {
        canManage: this.canManageCourse(course)
      });
    } catch (error) {
      console.error('Load forums error:', error);
      container.innerHTML = `<div class="error">${t('moodleForum.loadFailed')}</div>`;
    }
  },

  renderForumsWithBack(forums, courseName, courseId, { canManage = false } = {}) {
    const container = document.getElementById('forumsList');
    if (!container) return;

    const user = API.getCurrentUser();
    const isTeacher = this.isTeachingRole(user) && canManage;
    const safeCourseName = this.escapeText(courseName || t('moodleCourse.course'));

    const header = `
      <section class="forum-shell">
          <div class="forum-header-panel">
            <div class="forum-header-top">
            <div class="forum-header-cluster">
              <button type="button" class="forum-back-btn" onclick="MoodleUI.loadForums()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                <span>${t('common.back') || '返回'}</span>
              </button>
              <div class="forum-header-copy">
                <span class="forum-thread-count-pill">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>${forums.length} ${t('moodleForum.topics')}</span>
                </span>
                <h2 class="forum-header-title">${safeCourseName} · ${this.escapeText(t('moodleForum.title'))}</h2>
                <p class="forum-header-subtitle">集中整理此課程的公告、提問與交流主題。列表只保留重要摘要，點進去可以看到完整討論脈絡與回覆。</p>
              </div>
              </div>
            <div class="forum-header-actions">
              <button type="button" class="btn-secondary" onclick="return openPlatformView(event, 'moodleCourses')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <span>${t('sidebar.courseCenter') || '課程中心'}</span>
              </button>
              ${isTeacher ? `
                <button type="button" class="btn-primary" onclick="MoodleUI.openCreateForumModal(${this.toInlineActionValue(courseId)})">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>新增討論區</span>
                </button>
              ` : ''}
            </div>
          </div>
          <div class="forum-count-row">
            <span class="forum-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>${forums.length} 個討論區</span>
            </span>
            <span class="forum-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4-.84L3 20l1.34-3.22A7.318 7.318 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"/></svg>
              <span>${forums.reduce((sum, forum) => sum + Number(forum.discussionCount ?? forum.stats?.discussionCount ?? 0), 0)} 篇主題</span>
            </span>
          </div>
        </div>
      `;

    if (forums.length === 0) {
      container.innerHTML = `${header}${this.renderForumState(t('moodleForum.noForums'))}</section>`;
      return;
    }

    container.innerHTML = `
      ${header}
        <div class="forum-list">
          ${forums.map(forum => {
            const typeMeta = this.getForumTypeMeta(forum.type);
            const forumName = this.escapeText(forum.title || forum.name || t('moodleForum.title'));
            const forumDescription = this.escapeText(this.truncateText(forum.description || '目前尚未提供討論區說明。', 180));
            const discussionCount = Number(forum.discussionCount ?? forum.stats?.discussionCount ?? 0);
            const postCount = Number(forum.postCount ?? forum.stats?.postCount ?? 0);
            const safeUpdatedAt = forum.updatedAt ? this.escapeText(this.formatPlatformDate(forum.updatedAt, { year: 'numeric', month: 'numeric', day: 'numeric' })) : '';
            return `
              <button type="button" class="forum-card ${typeMeta.className}" onclick="MoodleUI.openForum(${this.toInlineActionValue(forum.forumId)})">
                <div class="forum-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="forum-card-content">
                  <div class="forum-card-topline">
                    <div>
                      <div class="forum-card-title-row">
                        <span class="forum-type-badge ${typeMeta.className}">${this.escapeText(typeMeta.label)}</span>
                        <h3 class="forum-card-title">${forumName}</h3>
                      </div>
                      <div class="forum-card-meta">
                        <span>${safeCourseName}</span>
                        ${safeUpdatedAt ? `<span>•</span><span>${I18n.getLocale() === 'en' ? 'Updated' : '更新於'} ${safeUpdatedAt}</span>` : ''}
                      </div>
                    </div>
                  </div>
                  <p class="forum-card-description">${forumDescription}</p>
                  <div class="forum-card-stats">
                    <span class="forum-card-stat">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>${discussionCount} 篇討論</span>
                    </span>
                    <span class="forum-card-stat">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4-.84L3 20l1.34-3.22A7.318 7.318 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"/></svg>
                      <span>${postCount} 則回覆</span>
                    </span>
                  </div>
                  <div class="forum-card-footer">
                    <span class="forum-card-support">${discussionCount > 0 ? (I18n.getLocale() === 'en' ? 'Active discussion space' : '活躍討論空間') : (I18n.getLocale() === 'en' ? 'Ready for first topic' : '可立即開始第一篇主題')}</span>
                    <span class="forum-card-cta">
                      ${I18n.getLocale() === 'en' ? 'Open forum' : '進入討論區'}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </span>
                  </div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `;
  },

  /**
   * 渲染討論區列表
   */
  renderForumsList(forums) {
    const container = document.getElementById('forumsList');
    if (!container) return;

    if (forums.length === 0) {
      container.innerHTML = this.renderForumState(t('moodleForum.noForums'));
      return;
    }

    container.innerHTML = `
      <div class="forum-list">
        ${forums.map(forum => {
          const typeMeta = this.getForumTypeMeta(forum.type);
          const discussionCount = Number(forum.discussionCount ?? forum.stats?.discussionCount ?? 0);
          const postCount = Number(forum.postCount ?? forum.stats?.postCount ?? 0);
          return `
            <button type="button" class="forum-card ${typeMeta.className}" onclick="MoodleUI.openForum(${this.toInlineActionValue(forum.forumId)})">
              <div class="forum-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
                <div class="forum-card-content">
                  <div class="forum-card-topline">
                    <div>
                    <div class="forum-card-title-row">
                      <span class="forum-type-badge ${typeMeta.className}">${this.escapeText(typeMeta.label)}</span>
                      <h3 class="forum-card-title">${this.escapeText(forum.title || forum.name || t('moodleForum.title'))}</h3>
                    </div>
                    <div class="forum-card-meta">
                      <span>${this.escapeText(forum.courseName || t('moodleCourse.course'))}</span>
                    </div>
                  </div>
                </div>
                <p class="forum-card-description">${this.escapeText(this.truncateText(forum.description || t('moodleLti.noDescription'), 180))}</p>
                <div class="forum-card-stats">
                  <span class="forum-card-stat">${discussionCount} ${t('moodleForum.topics')}</span>
                  <span class="forum-card-stat">${postCount} ${t('moodleForum.replies')}</span>
                </div>
                <div class="forum-card-footer">
                  <span class="forum-card-support">${discussionCount > 0 ? (I18n.getLocale() === 'en' ? 'Open for replies' : '已開放互動回覆') : (I18n.getLocale() === 'en' ? 'No topic yet' : '尚未建立主題')}</span>
                  <span class="forum-card-cta">
                    ${I18n.getLocale() === 'en' ? 'Browse topics' : '查看主題'}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </span>
                </div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    `;
  },

  /**
   * 篩選討論區
   */
  filterForums(filter, btn) {
    document.querySelectorAll('#moodleForumsView .tab-btn').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.loadForums(this.currentForumCourseId, filter);
  },

  /**
   * 開啟討論區
   */
  async openForum(forumId, options = {}) {
    try {
      const result = await API.forums.get(forumId);
      if (!result.success) {
        showToast(t('moodleForum.loadFailed'));
        return;
      }

      const forum = result.data;
      this.currentForumCourseId = forum.courseId || this.currentForumCourseId;
      const container = document.getElementById('forumDetailContent');
      const typeMeta = this.getForumTypeMeta(forum.type);
      const discussions = Array.isArray(forum.discussions) ? forum.discussions : [];
      const currentUser = API.getCurrentUser();
      const canManageForum = await this.canManageCourseById(forum.courseId, currentUser);
      const subscriptionResult = await API.forums.getSubscription(forumId).catch(() => ({ success: false }));
      const isSubscribed = subscriptionResult?.success
        ? subscriptionResult.data?.subscribed !== false
        : !!forum.subscribed;
      const safeTitle = this.escapeText(forum.title || forum.name || t('moodleForum.title'));
      const safeDescription = this.escapeText(forum.description || (I18n.getLocale() === 'en' ? 'No additional description is available for this forum yet.' : '這個討論區暫時沒有補充說明。'));
      const canStartNewDiscussion = forum.forumMode !== 'single' || discussions.length === 0;
      const postingModeLabel = this.getForumModeLabel(forum.forumMode || 'standard');
      const subscriptionModeLabel = this.getForumSubscriptionModeLabel(forum.subscriptionMode || 'optional');
      const attachmentLabel = `${Number(forum.maxAttachments ?? 0)} ${I18n.getLocale() === 'en' ? 'attachments' : '個附件'} · ${Number(forum.maxAttachmentSize ?? 10)} MB`;
      const backAction = this.currentForumCourseId
        ? `showView('moodleForums'); MoodleUI.loadForums(${this.toInlineActionValue(this.currentForumCourseId)})`
        : `showView('moodleForums')`;

      container.innerHTML = `
        <section class="forum-shell">
          <div class="forum-header-panel">
            <div class="forum-header-top">
              <div class="forum-header-cluster">
                <button type="button" class="forum-back-btn" onclick="${backAction}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  <span>${t('moodleForum.backToForums')}</span>
                </button>
                <div class="forum-header-copy">
                  <span class="forum-type-badge ${typeMeta.className}">${this.escapeText(typeMeta.label)}</span>
                  <h2 class="forum-header-title">${safeTitle}</h2>
                  <p class="forum-header-subtitle">${safeDescription}</p>
                </div>
              </div>
              <div class="forum-header-actions">
                <button type="button" class="btn-secondary" onclick="return openPlatformView(event, 'moodleCourses')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  <span>${t('sidebar.courseCenter') || '課程中心'}</span>
                </button>
                <button type="button" class="btn-secondary" onclick="MoodleUI.markForumRead(${this.toInlineActionValue(forumId)})">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  <span>${I18n.getLocale() === 'en' ? 'Mark Read' : '標記已讀'}</span>
                </button>
                <button type="button" class="btn-secondary" onclick="MoodleUI.toggleForumSubscription(${this.toInlineActionValue(forumId)}, ${isSubscribed ? 'true' : 'false'})">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  <span>${isSubscribed ? (I18n.getLocale() === 'en' ? 'Unsubscribe' : '取消訂閱') : (I18n.getLocale() === 'en' ? 'Subscribe' : '訂閱討論區')}</span>
                </button>
                ${canManageForum ? `
                  <button type="button" class="btn-secondary" onclick="MoodleUI.editForumSettings(${this.toInlineActionValue(forumId)})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 20 7-7"/><path d="M16 4h4v4"/><path d="m4 20 4-4"/><path d="M4 4h7v7"/></svg>
                    <span>${t('common.edit')}</span>
                  </button>
                  <button type="button" class="btn-danger" onclick="MoodleUI.deleteForum(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(forum.courseId || this.currentForumCourseId || '')})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    <span>${t('common.delete')}</span>
                  </button>
                ` : ''}
                ${canStartNewDiscussion ? `
                  <button type="button" class="btn-primary" onclick="MoodleUI.openNewDiscussionModal(${this.toInlineActionValue(forumId)})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>${t('moodleForum.newDiscussion')}</span>
                  </button>
                ` : ''}
              </div>
            </div>
            <div class="forum-count-row">
              <span class="forum-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>${discussions.length} ${t('moodleForum.topics')}</span>
              </span>
              <span class="forum-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4-.84L3 20l1.34-3.22A7.318 7.318 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"/></svg>
                <span>${discussions.reduce((sum, item) => sum + Number(item.replyCount || 0), 0)} ${t('moodleForum.replies')}</span>
              </span>
              <span class="forum-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18"/><path d="M7 12h10"/><path d="M10 19h4"/></svg>
                <span>${this.escapeText(postingModeLabel)}</span>
              </span>
              <span class="forum-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0"/><path d="M18 8v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8"/><path d="M10 12h4"/></svg>
                <span>${this.escapeText(subscriptionModeLabel)}</span>
              </span>
              <span class="forum-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                <span>${this.escapeText(attachmentLabel)}</span>
              </span>
              ${forum.visible === false ? `
                <span class="forum-chip">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58"/><path d="M9.88 5.09A9.77 9.77 0 0 1 12 4c5 0 9.27 3 11 8a11.8 11.8 0 0 1-2.17 3.19"/><path d="M6.61 6.61A11.76 11.76 0 0 0 1 12a11.82 11.82 0 0 0 4.18 5.19"/></svg>
                  <span>${I18n.getLocale() === 'en' ? 'Hidden from students' : '目前對學生隱藏'}</span>
                </span>
              ` : ''}
              ${!canStartNewDiscussion ? `
                <span class="forum-chip">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12h6"/></svg>
                  <span>${I18n.getLocale() === 'en' ? 'Single-thread forum already started' : '單一討論論壇已建立主題'}</span>
                </span>
              ` : ''}
            </div>
          </div>
          <div class="forum-topic-list">
            ${discussions.length === 0
              ? this.renderForumState(t('moodleForum.noDiscussions'))
              : discussions.map(discussion => {
                  const discussionId = discussion.discussionId || discussion.id;
                  const isAuthor = this.isCurrentUser(discussion.authorId, currentUser);
                  const safeSubject = this.escapeText(discussion.subject || discussion.title || t('discussion.untitled'));
                  const safeExcerpt = this.escapeText(this.truncateText(discussion.message || discussion.content || '', 200) || t('discussion.noExcerpt'));
                  const safeAuthor = this.escapeText(discussion.authorName || t('discussion.anonymous'));
                  const safeDate = this.escapeText(this.formatPlatformDate(discussion.createdAt, { year: 'numeric', month: 'numeric', day: 'numeric' }) || '');
                  const safeLastReply = this.escapeText(this.formatPlatformDate(discussion.lastReply || discussion.lastReplyAt || discussion.latestReply?.createdAt, { year: 'numeric', month: 'numeric', day: 'numeric' }) || '');
                  const replyCount = Number(discussion.replyCount || 0);
                  return `
                    <article class="forum-topic-card${discussion.pinned ? ' is-pinned' : ''}">
                      <button type="button" class="forum-topic-main" onclick="MoodleUI.openDiscussion(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)})">
                        <div class="forum-thread-avatar">${this.escapeText((discussion.authorName || 'U').trim().charAt(0) || 'U')}</div>
                        <div class="forum-topic-content">
                          <div class="forum-topic-topline">
                            <div>
                              <div class="forum-topic-title-row">
                                ${discussion.pinned ? `<span class="forum-topic-badge">${t('moodleForum.pinned')}</span>` : ''}
                                ${discussion.locked ? `<span class="forum-topic-badge">${I18n.getLocale() === 'en' ? 'Locked' : '已鎖定'}</span>` : ''}
                                <h3 class="forum-topic-title">${safeSubject}</h3>
                              </div>
                              <div class="forum-topic-meta">
                                <span>${safeAuthor}</span>
                                ${safeDate ? `<span>•</span><span>${safeDate}</span>` : ''}
                                ${(discussion.lastReply || discussion.lastReplyAt || discussion.latestReply?.createdAt) ? `<span>•</span><span>${t('moodleForum.lastReply')} ${safeLastReply}</span>` : ''}
                              </div>
                            </div>
                          </div>
                          <p class="forum-topic-excerpt">${safeExcerpt}</p>
                        </div>
                      </button>
                      <div class="forum-topic-footer">
                        <div class="forum-topic-stats">
                          <span class="forum-topic-stat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <span>${replyCount} ${t('moodleForum.replies')}</span>
                          </span>
                          <span class="forum-topic-support">${replyCount > 0 ? (I18n.getLocale() === 'en' ? 'Conversation in progress' : '討論持續進行中') : (I18n.getLocale() === 'en' ? 'Awaiting first reply' : '等待第一則回覆')}</span>
                        </div>
                        <div class="category-actions">
                          <button type="button" class="forum-topic-cta" onclick="MoodleUI.openDiscussion(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)})">
                            ${I18n.getLocale() === 'en' ? 'Open & Reply' : '查看並回覆'}
                          </button>
                          ${(isAuthor || canManageForum) ? `
                            <button type="button" class="btn-sm" onclick="MoodleUI.openNewDiscussionModal(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(JSON.stringify({
                              discussionId,
                              subject: discussion.subject || discussion.title || '',
                              message: discussion.message || discussion.content || ''
                            }))})">${t('common.edit')}</button>
                            <button type="button" class="btn-sm btn-danger" onclick="MoodleUI.deleteDiscussion(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)})">${t('common.delete')}</button>
                          ` : ''}
                          ${canManageForum ? `
                            <button type="button" class="btn-sm" onclick="MoodleUI.toggleDiscussionPinned(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${discussion.pinned ? 'true' : 'false'})">${discussion.pinned ? (I18n.getLocale() === 'en' ? 'Unpin' : '取消置頂') : (I18n.getLocale() === 'en' ? 'Pin' : '置頂')}</button>
                            <button type="button" class="btn-sm" onclick="MoodleUI.toggleDiscussionLocked(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${discussion.locked ? 'true' : 'false'})">${discussion.locked ? (I18n.getLocale() === 'en' ? 'Unlock' : '解除鎖定') : (I18n.getLocale() === 'en' ? 'Lock' : '鎖定')}</button>
                          ` : ''}
                        </div>
                      </div>
                    </article>
                  `;
                }).join('')}
          </div>
        </section>
      `;

      showView('forumDetail', {
        path: options.path || `/platform/forum/${encodeURIComponent(forumId)}`,
        replaceHistory: options.replaceHistory
      });
    } catch (error) {
      console.error('Open forum error:', error);
      showToast(t('moodleForum.loadFailed'));
    }
  },

  // ==================== 行事曆系統 ====================

  currentCalendarDate: new Date(),

  /**
   * 載入行事曆
   */
  async loadCalendar() {
    await this.renderCalendarGrid();
    await this.loadUpcomingEvents();
  },

  /**
   * 渲染行事曆網格
   */
  async renderCalendarGrid() {
    const container = document.getElementById('calendarGrid');
    const titleEl = document.getElementById('calendarTitle');
    if (!container) return;

    const year = this.currentCalendarDate.getFullYear();
    const month = this.currentCalendarDate.getMonth();

    titleEl.textContent = `${I18n.getLocale() === 'en' ? '' : year + ' '}${I18n.getLocale() === 'en' ? this.formatPlatformDate(new Date(year, month), {month: 'long', year: 'numeric'}) : (month + 1) + ' 月'}`;

    // 取得事件
    const result = await API.calendar.getEvents({
      start: new Date(year, month, 1).toISOString(),
      end: new Date(year, month + 1, 0).toISOString()
    });

    const events = result.success ? result.data || [] : [];
    this.currentCalendarEvents = events;

    // 產生日曆
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let html = `
      <div class="calendar-weekday">${t('moodleCalendar.sun')}</div>
      <div class="calendar-weekday">${t('moodleCalendar.mon')}</div>
      <div class="calendar-weekday">${t('moodleCalendar.tue')}</div>
      <div class="calendar-weekday">${t('moodleCalendar.wed')}</div>
      <div class="calendar-weekday">${t('moodleCalendar.thu')}</div>
      <div class="calendar-weekday">${t('moodleCalendar.fri')}</div>
      <div class="calendar-weekday">${t('moodleCalendar.sat')}</div>
    `;

    // 上個月的日期
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      html += `<div class="calendar-day other-month"><span class="day-number">${prevMonthDays - i}</span></div>`;
    }

    // 本月日期
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
      const dayDate = new Date(year, month, day);
      const dayEvents = this.getEventsForLocalDate(events, dayDate);

      html += `
        <button type="button" class="calendar-day ${isToday ? 'today' : ''}" onclick="MoodleUI.openDayEvents(${year}, ${month}, ${day})">
          <span class="day-number">${day}</span>
          ${dayEvents.slice(0, 3).map(e => `
            <span class="calendar-event ${e.type}">${e.title}</span>
          `).join('')}
          ${dayEvents.length > 3 ? `<span class="calendar-more">+${dayEvents.length - 3} ${t('moodleCalendar.more')}</span>` : ''}
        </button>
      `;
    }

    // 下個月的日期
    const totalCells = firstDay + daysInMonth;
    const remainingCells = 42 - totalCells;
    for (let i = 1; i <= remainingCells && totalCells < 42; i++) {
      html += `<div class="calendar-day other-month"><span class="day-number">${i}</span></div>`;
    }

    container.innerHTML = html;
  },

  /**
   * 載入即將到來的事件
   */
  async loadUpcomingEvents() {
    const container = document.getElementById('upcomingEventsList');
    if (!container) return;

    try {
      const result = await API.calendar.getUpcoming(14);
      if (!result.success) return;

      const events = result.data || [];

      if (events.length === 0) {
        container.innerHTML = this.renderActivityEmptyState({
          icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
          title: t('moodleCalendar.noEvents')
        });
        return;
      }

      container.innerHTML = events.map(e => {
        const eventDateValue = this.getCalendarEventDate(e);
        const eventDate = eventDateValue ? new Date(eventDateValue) : null;
        const validDate = eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : new Date();
        return `
          <div class="event-item">
            <div class="event-date">
              <span class="day">${validDate.getDate()}</span>
              <span class="month">${validDate.toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW', { month: 'short' })}</span>
            </div>
            <div class="event-info">
              <div class="event-title">${e.title}</div>
              <div class="event-course">${e.courseName || ''}</div>
              <div class="event-time">${e.type === 'assignment' ? t('moodleCalendar.duePrefix') : ''}：${validDate.toLocaleTimeString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Load upcoming events error:', error);
    }
  },

  /**
   * 上個月
   */
  prevMonth() {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
    this.renderCalendarGrid();
  },

  /**
   * 下個月
   */
  nextMonth() {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
    this.renderCalendarGrid();
  },

  /**
   * 回到今天
   */
  goToToday() {
    this.currentCalendarDate = new Date();
    this.renderCalendarGrid();
  },

  // ==================== 成績簿系統 ====================

  async populateGradebookCourseSelect(selectedCourseId = '') {
    const courseSelect = document.getElementById('gradebookCourseSelect');
    if (!courseSelect) return [];

    const user = API.getCurrentUser();
    const courses = await this.getRoleScopedCourses({
      manageOnly: this.isTeachingRole(user)
    });

    courseSelect.innerHTML = `
      <option value="">${t('moodleGradebook.selectCourse')}</option>
      ${courses.map(c => `<option value="${c.courseId}">${c.title || c.name || t('moodleCourse.course')}</option>`).join('')}
    `;

    if (selectedCourseId && courses.some(course => course.courseId === selectedCourseId)) {
      courseSelect.value = selectedCourseId;
    } else {
      courseSelect.value = '';
    }

    return courses;
  },

  /**
   * 載入成績簿 (主入口)
   */
  async loadGradebook() {
    const container = document.getElementById('gradebookContent');
    if (!container) return;

    try {
      this.currentGradebookCourseId = null;
      await this.populateGradebookCourseSelect();

      // 預設顯示提示
      container.innerHTML = this.renderActivityEmptyState({
        icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
        title: t('common.selectCourseGrades')
      });
    } catch (error) {
      console.error('Load gradebook error:', error);
      container.innerHTML = `<div class="error">${t('moodleGradebook.loadFailed')}</div>`;
    }
  },

  /**
   * 載入特定課程的成績簿
   */
  async loadGradebookForCourse(courseId) {
    if (!courseId) {
      this.loadGradebook();
      return;
    }

    const container = document.getElementById('gradebookContent');
    if (!container) return;

    this.currentGradebookCourseId = courseId;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    try {
      await this.populateGradebookCourseSelect(courseId);
      const user = API.getCurrentUser();

      // 取得課程資訊判斷是否為教師
      const courseResult = await API.courses.get(courseId);
      if (!courseResult.success) {
        container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
        return;
      }

      const course = courseResult.data;
      const isTeacher = this.canTeachCourse(course, user);

      let result;
      if (isTeacher) {
        result = await API.gradebook.getCourseGradebook(courseId);
        if (result.success) {
          container.innerHTML = this.renderTeacherGradebook(result.data);
        }
      } else {
        result = await API.gradebook.getMyGrades(courseId);
        if (result.success) {
          container.innerHTML = this.renderStudentGrades(result.data);
        }
      }

      if (!result.success) {
        container.innerHTML = `<div class="error">${t('moodleGrade.loadFailed')}</div>`;
      }
    } catch (error) {
      console.error('Load gradebook for course error:', error);
      container.innerHTML = `<div class="error">${t('moodleGradebook.loadFailed')}</div>`;
    }
  },

  renderQuizRadarChart(radar = {}, { title = '' } = {}) {
    const labels = Array.isArray(radar.labels) ? radar.labels : [];
    const values = Array.isArray(radar.values) ? radar.values : [];
    if (labels.length === 0) {
      return '';
    }

    const axisCount = Math.max(labels.length, 3);
    const size = 260;
    const center = size / 2;
    const radius = 92;
    const axisPoints = Array.from({ length: axisCount }, (_, index) => {
      const angle = (-Math.PI / 2) + (2 * Math.PI * index / axisCount);
      return {
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
        labelX: center + (radius + 24) * Math.cos(angle),
        labelY: center + (radius + 24) * Math.sin(angle),
        label: labels[index] || '',
        value: Math.max(0, Math.min(100, Number(values[index] || 0)))
      };
    });
    const valuePoints = axisPoints
      .map(point => {
        const scale = point.value / 100;
        return `${center + (point.x - center) * scale},${center + (point.y - center) * scale}`;
      })
      .join(' ');
    const rings = [25, 50, 75, 100].map(level => {
      const ringRadius = radius * (level / 100);
      const points = Array.from({ length: axisCount }, (_, index) => {
        const angle = (-Math.PI / 2) + (2 * Math.PI * index / axisCount);
        return `${center + ringRadius * Math.cos(angle)},${center + ringRadius * Math.sin(angle)}`;
      }).join(' ');
      return `<polygon points="${points}" class="quiz-radar-ring"></polygon>`;
    }).join('');

    return `
      <div class="quiz-radar-card">
        ${title ? `<h4>${this.escapeText(title)}</h4>` : ''}
        <svg class="quiz-radar-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="${this.escapeText(title || 'Section radar')}">
          ${rings}
          ${axisPoints.map(point => `
            <line x1="${center}" y1="${center}" x2="${point.x}" y2="${point.y}" class="quiz-radar-axis"></line>
          `).join('')}
          <polygon points="${valuePoints}" class="quiz-radar-value"></polygon>
          ${axisPoints.map(point => point.label ? `
            <text x="${point.labelX}" y="${point.labelY}" text-anchor="middle" class="quiz-radar-label">${this.escapeText(this.truncateText(point.label, 14))}</text>
          ` : '').join('')}
        </svg>
      </div>
    `;
  },

  renderQuizDistributionBars(distribution = []) {
    if (!Array.isArray(distribution) || distribution.length === 0) return '';
    const maxCount = Math.max(1, ...distribution.map(bin => Number(bin.count || 0)));
    return `
      <div class="quiz-section-bars">
        ${distribution.map(bin => {
          const width = Math.round((Number(bin.count || 0) / maxCount) * 100);
          return `
            <div class="quiz-section-bar-row">
              <span class="quiz-section-bar-label">${this.escapeText(bin.label || bin.key || '')}</span>
              <div class="quiz-section-bar-track">
                <div class="quiz-section-bar-fill" data-progress-width="${this.clampProgressValue(width)}"></div>
              </div>
              <span class="quiz-section-bar-value">${this.escapeText(String(bin.count || 0))}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  renderQuizCorrectBars(questions = []) {
    if (!Array.isArray(questions) || questions.length === 0) return '';
    return `
      <div class="quiz-section-bars">
        ${questions.map((question, index) => `
          <div class="quiz-section-bar-row">
            <span class="quiz-section-bar-label">${this.escapeText(this.truncateText(question.questionText || `${I18n.getLocale() === 'en' ? 'Q' : '第'}${index + 1}`, 24))}</span>
            <div class="quiz-section-bar-track">
              <div class="quiz-section-bar-fill is-correct" data-progress-width="${this.clampProgressValue(question.correctRate || 0)}"></div>
            </div>
            <span class="quiz-section-bar-value">${this.escapeText(String(question.correctRate ?? 0))}%</span>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderQuizSectionAnalytics(analytics = {}, { mode = 'teacher' } = {}) {
    const sections = Array.isArray(analytics.sections) ? analytics.sections : [];
    const isEnglish = I18n.getLocale() === 'en';
    if (sections.length === 0) {
      return `
        <div class="management-empty-preview">${isEnglish ? 'Section analytics will appear after questions are tagged and attempts are submitted.' : '題目標記分析區段且學生作答後，這裡會顯示區段分析。'}</div>
      `;
    }

    return `
      <div class="quiz-section-analytics">
        ${this.renderQuizRadarChart(analytics.radar, {
          title: mode === 'teacher'
            ? (isEnglish ? 'Class section radar' : '全班區段雷達圖')
            : (isEnglish ? 'Your section radar' : '你的區段雷達圖')
        })}
        <div class="quiz-section-grid">
          ${sections.map(section => `
            <section class="quiz-section-card">
              <div class="quiz-section-card-head">
                <div>
                  <span class="quiz-report-panel-kicker">${this.escapeText(section.title)}</span>
                  <h4>${this.escapeText(mode === 'teacher' ? `${section.averageScore ?? 0}%` : `${section.percentage ?? 0}%`)}</h4>
                </div>
                <span class="activity-chip">${this.escapeText(`${section.questionCount || 0} ${isEnglish ? 'questions' : '題'}`)}</span>
              </div>
              <div class="quiz-section-metrics">
                <span>${isEnglish ? 'Correct' : '答對率'} <strong>${this.escapeText(String(section.correctRate ?? 0))}%</strong></span>
                <span>${isEnglish ? 'Points' : '得分'} <strong>${this.escapeText(String(mode === 'teacher' ? section.totalPoints : `${section.earnedPoints}/${section.totalPoints}`))}</strong></span>
              </div>
              ${mode === 'teacher' ? `
                <h5>${isEnglish ? 'Score distribution' : '成績分布'}</h5>
                ${this.renderQuizDistributionBars(section.scoreDistribution)}
                <h5>${isEnglish ? 'Correct distribution' : '答對分布'}</h5>
                ${this.renderQuizCorrectBars(section.questionStats)}
              ` : `
                <h5>${isEnglish ? 'Question results' : '題目結果'}</h5>
                ${this.renderQuizCorrectBars((section.questionResults || []).map((question, index) => ({
                  questionText: question.questionText || `${isEnglish ? 'Q' : '第'}${index + 1}`,
                  correctRate: question.isCorrect === true ? 100 : 0
                })))}
              `}
            </section>
          `).join('')}
        </div>
      </div>
    `;
  },

  async downloadQuizResultsCsv(quizId) {
    try {
      await API.quizzes.downloadResultsCsv(quizId);
    } catch (error) {
      console.error('Download quiz results CSV error:', error);
      showToast(I18n.getLocale() === 'en' ? 'CSV download failed' : 'CSV 下載失敗');
    }
  },

  async downloadQuizResultsXlsx(quizId) {
    try {
      await API.quizzes.downloadResultsXlsx(quizId);
    } catch (error) {
      console.error('Download quiz results XLSX error:', error);
      showToast(I18n.getLocale() === 'en' ? 'XLSX download failed' : 'XLSX 下載失敗');
    }
  },

  async downloadQuizAttemptCsv(quizId, attemptId) {
    try {
      await API.quizzes.downloadAttemptAnalyticsCsv(quizId, attemptId);
    } catch (error) {
      console.error('Download quiz attempt CSV error:', error);
      showToast(I18n.getLocale() === 'en' ? 'CSV download failed' : 'CSV 下載失敗');
    }
  },

  getQuizEssayQuestions(quiz = {}) {
    return (Array.isArray(quiz.questions) ? quiz.questions : [])
      .filter(question => question && question.type === 'essay');
  },

  getQuizAttemptManualStatusMeta(quiz = {}, attempt = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    const essayCount = this.getQuizEssayQuestions(quiz).length;
    const questionCount = Number(attempt.manualQuestionCount || essayCount || 0);
    const pendingCountRaw = Number(attempt.manualPendingCount);
    const gradedCountRaw = Number(attempt.manualGradedCount);
    const gradedCount = Number.isFinite(gradedCountRaw) ? gradedCountRaw : 0;
    const pendingCount = Number.isFinite(pendingCountRaw)
      ? pendingCountRaw
      : Math.max(0, questionCount - gradedCount);

    if (questionCount <= 0 && !attempt.manualGradingStatus && !attempt.needsManualGrading) {
      return {
        status: 'not_required',
        label: isEnglish ? 'Not required' : '不需批改',
        toneClass: 'is-neutral',
        questionCount: 0,
        pendingCount: 0,
        gradedCount: 0
      };
    }

    let status = String(attempt.manualGradingStatus || '').toLowerCase();
    if (!status || status === 'not_required') {
      status = pendingCount > 0
        ? (gradedCount > 0 ? 'partial' : 'pending')
        : 'graded';
    }
    if (attempt.needsManualGrading && pendingCount > 0) {
      status = gradedCount > 0 ? 'partial' : 'pending';
    }

    const labels = {
      pending: isEnglish ? 'Needs grading' : '待批改',
      partial: isEnglish ? 'Partially graded' : '部分批改',
      graded: isEnglish ? 'Graded' : '已批改',
      not_required: isEnglish ? 'Not required' : '不需批改'
    };
    const tones = {
      pending: 'is-warning',
      partial: 'is-warning',
      graded: 'is-success',
      not_required: 'is-neutral'
    };

    return {
      status,
      label: labels[status] || labels.pending,
      toneClass: tones[status] || 'is-warning',
      questionCount,
      pendingCount,
      gradedCount
    };
  },

  renderQuizAttemptManualStatus(quiz = {}, attempt = {}) {
    const meta = this.getQuizAttemptManualStatusMeta(quiz, attempt);
    const isEnglish = I18n.getLocale() === 'en';
    const detail = meta.questionCount > 0
      ? (isEnglish
        ? `${meta.gradedCount}/${meta.questionCount} graded`
        : `已批 ${meta.gradedCount}/${meta.questionCount}`)
      : '';
    return `
      <div class="management-status-stack">
        <span class="management-status-badge ${meta.toneClass}">${this.escapeText(meta.label)}</span>
        ${detail ? `<small>${this.escapeText(detail)}</small>` : ''}
      </div>
    `;
  },

  renderQuizAttemptManualAction(quiz = {}, attempt = {}) {
    const quizId = quiz.quizId || '';
    const attemptId = attempt.attemptId || '';
    const meta = this.getQuizAttemptManualStatusMeta(quiz, attempt);
    if (!quizId || !attemptId || meta.questionCount <= 0 || attempt.status !== 'completed') {
      return '—';
    }
    const isEnglish = I18n.getLocale() === 'en';
    const label = meta.status === 'graded'
      ? (isEnglish ? 'Edit grade' : '修改批改')
      : (isEnglish ? 'Grade' : '批改');
    const className = meta.status === 'graded' ? 'btn-sm' : 'btn-primary btn-sm';
    return `
      <button type="button" class="${className}" onclick="MoodleUI.openQuizManualGradeModal(${this.toInlineActionValue(quizId)}, ${this.toInlineActionValue(attemptId)})">
        ${this.escapeText(label)}
      </button>
    `;
  },

  formatQuizManualAnswer(answer) {
    if (answer === null || answer === undefined || answer === '') return '—';
    if (Array.isArray(answer)) {
      return answer.map(item => this.formatQuizManualAnswer(item)).join('\n');
    }
    if (typeof answer === 'object') {
      return Object.entries(answer)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value ?? '')}`)
        .join('\n');
    }
    return String(answer);
  },

  openQuizManualGradeModal(quizId, attemptId) {
    const context = this.currentTeacherQuizReportContext || {};
    const quiz = context.quiz || {};
    const report = context.report || {};
    const attempts = Array.isArray(report.attempts) ? report.attempts : [];
    const attempt = attempts.find(item => item.attemptId === attemptId);
    const essayQuestions = this.getQuizEssayQuestions(quiz);
    const isEnglish = I18n.getLocale() === 'en';

    if (!attempt) {
      showToast(isEnglish ? 'Attempt not found.' : '找不到這筆作答紀錄');
      return;
    }
    if (essayQuestions.length === 0) {
      showToast(isEnglish ? 'This quiz has no essay questions.' : '這份測驗沒有申論題');
      return;
    }

    const resultByQuestionId = new Map(
      (Array.isArray(attempt.questionResults) ? attempt.questionResults : [])
        .map(result => [result.questionId, result])
    );
    const studentName = attempt.userName || attempt.userEmail || attempt.userId || (isEnglish ? 'Learner' : '學生');

    const questionCards = essayQuestions.map((question, index) => {
      const result = resultByQuestionId.get(question.questionId) || {};
      const points = Number(question.points || result.maxPoints || 1);
      const answer = attempt.answers?.[question.questionId];
      const hasManualGrade = result.manualGraded === true || Boolean(result.manualGradedAt || result.manualGradedBy);
      const scoreValue = hasManualGrade
        ? this.escapeText(String(result.earnedPoints ?? ''))
        : '';
      return `
        <section class="quiz-create-card" data-manual-grade-question-id="${this.escapeText(question.questionId)}" data-max-points="${this.escapeText(String(points))}">
          <div class="quiz-create-card-head">
            <div>
              <div class="quiz-create-card-kicker">${this.escapeText(`${isEnglish ? 'Essay question' : '申論題'} ${index + 1}`)}</div>
              <div class="quiz-create-card-title">${this.escapeText(question.text || question.questionText || (isEnglish ? 'Untitled question' : '未命名題目'))}</div>
              <p class="quiz-create-card-note">${this.escapeText(`${isEnglish ? 'Maximum points' : '滿分'}: ${points}`)}</p>
            </div>
          </div>
          <div class="management-kv-list">
            <div class="management-kv-item">
              <div class="management-kv-label">${isEnglish ? 'Student answer' : '學生答案'}</div>
              <div class="management-kv-value">${this.formatMultilineText(this.formatQuizManualAnswer(answer))}</div>
            </div>
          </div>
          <div class="activity-builder-grid">
            <div class="form-group">
              <label>${isEnglish ? 'Score' : '得分'}</label>
              <input type="number" class="manual-grade-score-input" min="0" max="${this.escapeText(String(points))}" step="0.1" value="${scoreValue}" placeholder="0" required>
            </div>
            <div class="form-group">
              <label>${isEnglish ? 'Maximum' : '滿分'}</label>
              <input type="number" value="${this.escapeText(String(points))}" disabled>
            </div>
          </div>
          <div class="form-group">
            <label>${isEnglish ? 'Feedback' : '回饋'}</label>
            <textarea class="manual-grade-feedback-input" rows="3" placeholder="${this.escapeText(isEnglish ? 'Feedback shown to the student' : '給學生看的批改回饋')}">${this.escapeText(result.manualFeedback || result.feedback || '')}</textarea>
          </div>
        </section>
      `;
    }).join('');

    this.createModal('quizManualGradeModal', isEnglish ? 'Grade essay questions' : '批改申論題', `
      <form onsubmit="event.preventDefault(); MoodleUI.saveQuizManualGrades(${this.toInlineActionValue(quizId)}, ${this.toInlineActionValue(attemptId)})">
        <div class="quiz-create-shell">
          <section class="quiz-create-card quiz-create-card-primary">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Manual grading' : '人工批改'}</div>
                <div class="quiz-create-card-title">${this.escapeText(studentName)}</div>
                <p class="quiz-create-card-note">${this.escapeText(isEnglish
                  ? 'Enter scores for every essay question before the quiz grade is considered final.'
                  : '所有申論題都批改完成後，這次測驗成績才會視為最終成績。')}</p>
              </div>
            </div>
          </section>
          ${questionCards}
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('quizManualGradeModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${isEnglish ? 'Save grades' : '儲存批改'}</button>
          </div>
        </div>
      </form>
    `, {
      maxWidth: '980px',
      className: 'modal-workspace modal-question-builder-modal',
      kicker: isEnglish ? 'Assessment workspace' : '評量工作區',
      description: isEnglish
        ? 'Review the learner response and enter manual scores.'
        : '檢視學生答案並輸入人工批改分數。'
    });
  },

  async saveQuizManualGrades(quizId, attemptId) {
    const modal = document.getElementById('quizManualGradeModal');
    const rows = Array.from(modal?.querySelectorAll('[data-manual-grade-question-id]') || []);
    const isEnglish = I18n.getLocale() === 'en';
    const grades = [];

    for (const row of rows) {
      const questionId = row.getAttribute('data-manual-grade-question-id');
      const maxPoints = Number(row.getAttribute('data-max-points') || 0);
      const scoreInput = row.querySelector('.manual-grade-score-input');
      const feedbackInput = row.querySelector('.manual-grade-feedback-input');
      const earnedPoints = Number(scoreInput?.value);

      if (!questionId || !Number.isFinite(earnedPoints) || earnedPoints < 0 || earnedPoints > maxPoints) {
        showToast(isEnglish ? 'Please enter a valid score for every essay question.' : '請為每一題申論題輸入有效分數');
        scoreInput?.focus();
        return;
      }

      grades.push({
        questionId,
        earnedPoints,
        feedback: feedbackInput?.value || ''
      });
    }

    if (grades.length === 0) {
      showToast(isEnglish ? 'No essay questions to grade.' : '沒有可批改的申論題');
      return;
    }

    const submitButton = modal?.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const result = await API.quizzes.gradeAttempt(quizId, attemptId, grades);
      if (!result.success) {
        showToast(result.message || (isEnglish ? 'Failed to save grades.' : '儲存批改失敗'));
        return;
      }

      showToast(result.message || (isEnglish ? 'Grades saved.' : '批改已儲存'));
      this.closeModal('quizManualGradeModal');
      const context = this.currentTeacherQuizReportContext || {};
      await this.openQuizResults(quizId, {
        quiz: context.quiz || null,
        course: context.course || null,
        replaceHistory: true
      });
    } catch (error) {
      console.error('Save quiz manual grades error:', error);
      showToast(isEnglish ? 'Failed to save grades.' : '儲存批改失敗');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  },

  renderTeacherQuizResultsPage(quiz = {}, report = {}, course = null) {
    const container = document.getElementById('quizAttemptContent');
    if (!container) return;

    const quizMeta = report.quiz || {};
    const attempts = Array.isArray(report.attempts) ? report.attempts : [];
    const questionStats = Array.isArray(report.questionStats) ? report.questionStats : [];
    const sectionAnalytics = report.sectionAnalytics || {};
    const stats = report.stats || {};
    const averageScore = Number(stats.averageScore ?? stats.avgScore);
    const highestScore = Number(stats.highestScore ?? stats.maxScore);
    const passingGrade = Number(quizMeta.passingGrade ?? quiz.passingGrade ?? 60);
    const passedCount = Number.isFinite(Number(stats.passedCount))
      ? Number(stats.passedCount)
      : attempts.filter(attempt => Number(attempt.percentage) >= passingGrade).length;
    const latestAttemptAt = attempts
      .map(attempt => attempt.completedAt || attempt.submittedAt || attempt.startedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0];
    const courseName = course?.title || course?.name || quiz.courseName || t('moodleCourse.course');
    const targetCourseId = quiz.courseId || course?.courseId || this.currentQuizCourseId || null;
    const canManageQuiz = this.canTeachCourse(course);
    const safeBackAction = this.currentQuizCourseId
      ? `showView('moodleQuizzes'); MoodleUI.loadQuizzes(${this.toInlineActionValue(this.currentQuizCourseId)})`
      : `showView('moodleQuizzes'); MoodleUI.loadQuizzes()`;
    const statusLabel = quiz.visible === false ? t('common.draft') : t('common.published');
    const quizId = quiz.quizId || quizMeta.quizId || '';
    this.currentTeacherQuizReportContext = { quiz: { ...quiz, quizId }, report, course };

    container.innerHTML = `
      <div class="management-detail-page quiz-report-shell">
        ${this.renderManagementDetailHeader({
          backAction: safeBackAction,
          backLabel: t('moodleQuiz.backToList'),
          kicker: courseName,
          title: quiz.title || quizMeta.title || t('moodleQuiz.title'),
          subtitle: quiz.description || t('moodleQuiz.noDesc'),
          actions: canManageQuiz
            ? [
                ...(targetCourseId ? [{
                  label: I18n.getLocale() === 'en' ? 'Create quiz' : '新增測驗',
                  className: 'btn-primary btn-sm',
                  onclick: `MoodleUI.showCreateQuizModal(${this.toInlineActionValue(targetCourseId)})`
                }] : []),
                {
                  label: I18n.getLocale() === 'en' ? 'Edit quiz' : '編輯測驗',
                  className: 'btn-sm',
                  onclick: `MoodleUI.editQuizSettings(${this.toInlineActionValue(quizId)})`
                },
                {
                  label: I18n.getLocale() === 'en' ? 'Download CSV' : '下載 CSV',
                  className: 'btn-sm',
                  onclick: `MoodleUI.downloadQuizResultsCsv(${this.toInlineActionValue(quizId)})`
                },
                {
                  label: I18n.getLocale() === 'en' ? 'Download XLSX' : '下載 XLSX',
                  className: 'btn-sm',
                  onclick: `MoodleUI.downloadQuizResultsXlsx(${this.toInlineActionValue(quizId)})`
                },
                {
                  label: t('common.delete'),
                  className: 'btn-sm btn-danger',
                  onclick: `MoodleUI.deleteQuiz(${this.toInlineActionValue(quizId)}, ${this.toInlineActionValue(targetCourseId || '')})`
                }
              ]
            : []
        })}
        <section class="quiz-report-hero">
          <div class="quiz-report-hero-copy">
            <span class="quiz-report-kicker">${this.escapeText(courseName)}</span>
            <h2 class="quiz-report-title">${this.escapeText(quiz.title || quizMeta.title || t('moodleQuiz.title'))}</h2>
            <p class="quiz-report-desc">${this.escapeText(quiz.description || (I18n.getLocale() === 'en' ? 'Review learner attempts, score distribution, and question performance from one consolidated report.' : '在同一份報表中檢視學生作答、分數分布與題目表現。'))}</p>
            <div class="quiz-report-tags">
              <span class="quiz-report-tag">${this.escapeText(statusLabel)}</span>
              <span class="quiz-report-tag">${quiz.questionCount || quizMeta.totalQuestions || 0} ${t('moodleQuiz.questionsUnit')}</span>
              <span class="quiz-report-tag">${quiz.timeLimit ? `${quiz.timeLimit} ${t('moodleQuiz.minutes')}` : t('moodleQuiz.unlimitedTime')}</span>
              <span class="quiz-report-tag">${!quiz.maxAttempts ? t('moodleQuiz.unlimited') : `${quiz.maxAttempts} ${t('moodleQuiz.times')}`}</span>
            </div>
          </div>
          <div class="quiz-report-scoreboard">
            <div class="quiz-report-scorecard">
              <span class="quiz-report-scorecard-kicker">${I18n.getLocale() === 'en' ? 'Attempts' : '作答次數'}</span>
              <strong class="quiz-report-scorecard-value">${attempts.length}</strong>
              <span class="quiz-report-scorecard-note">${I18n.getLocale() === 'en' ? 'total records' : '累積作答紀錄'}</span>
            </div>
            <div class="quiz-report-scorecard tone-blue">
              <span class="quiz-report-scorecard-kicker">${I18n.getLocale() === 'en' ? 'Average score' : '平均分數'}</span>
              <strong class="quiz-report-scorecard-value">${Number.isFinite(averageScore) ? `${Math.round(averageScore)}%` : '—'}</strong>
              <span class="quiz-report-scorecard-note">${I18n.getLocale() === 'en' ? 'current average' : '目前整體表現'}</span>
            </div>
            <div class="quiz-report-scorecard tone-success">
              <span class="quiz-report-scorecard-kicker">${I18n.getLocale() === 'en' ? 'Pass count' : '通過人數'}</span>
              <strong class="quiz-report-scorecard-value">${passedCount}</strong>
              <span class="quiz-report-scorecard-note">${passingGrade}% ${I18n.getLocale() === 'en' ? 'passing grade' : '及格門檻'}</span>
            </div>
            <div class="quiz-report-scorecard tone-terracotta">
              <span class="quiz-report-scorecard-kicker">${I18n.getLocale() === 'en' ? 'Highest score' : '最高分'}</span>
              <strong class="quiz-report-scorecard-value">${Number.isFinite(highestScore) ? `${Math.round(highestScore)}%` : '—'}</strong>
              <span class="quiz-report-scorecard-note">${latestAttemptAt ? (I18n.getLocale() === 'en' ? 'updated recently' : '最近仍有作答') : (I18n.getLocale() === 'en' ? 'waiting for attempts' : '尚待學生作答')}</span>
            </div>
          </div>
        </section>
        <div class="quiz-report-insight-grid">
          <section class="quiz-report-panel">
            <div class="quiz-report-panel-head">
              <span class="quiz-report-panel-kicker">${t('common.details')}</span>
              <h3>${I18n.getLocale() === 'en' ? 'Quiz setup' : '測驗設定'}</h3>
            </div>
            <div class="management-kv-list">
              <div class="management-kv-item">
                <div class="management-kv-label">${t('moodleQuiz.questionCount')}</div>
                <div class="management-kv-value">${quiz.questionCount || quizMeta.totalQuestions || 0} ${t('moodleQuiz.questionsUnit')}</div>
              </div>
              <div class="management-kv-item">
                <div class="management-kv-label">${t('moodleQuiz.timeLimit')}</div>
                <div class="management-kv-value">${quiz.timeLimit ? `${quiz.timeLimit} ${t('moodleQuiz.minutes')}` : t('moodleQuiz.unlimitedTime')}</div>
              </div>
              <div class="management-kv-item">
                <div class="management-kv-label">${t('moodleQuiz.attemptsAllowed')}</div>
                <div class="management-kv-value">${!quiz.maxAttempts ? t('moodleQuiz.unlimited') : `${quiz.maxAttempts} ${t('moodleQuiz.times')}`}</div>
              </div>
              <div class="management-kv-item">
                <div class="management-kv-label">${t('moodleQuiz.closeDate')}</div>
                <div class="management-kv-value">${quiz.closeDate ? this.escapeText(this.formatPlatformDate(quiz.closeDate, { dateStyle: 'medium', timeStyle: 'short' }) || '—') : t('moodleQuiz.noLimit')}</div>
              </div>
            </div>
          </section>
          <section class="quiz-report-panel">
            <div class="quiz-report-panel-head">
              <span class="quiz-report-panel-kicker">${I18n.getLocale() === 'en' ? 'Teaching insight' : '教學摘要'}</span>
              <h3>${I18n.getLocale() === 'en' ? 'Teaching summary' : '教學摘要'}</h3>
            </div>
            <div class="management-kv-list">
              <div class="management-kv-item">
                <div class="management-kv-label">${I18n.getLocale() === 'en' ? 'Course' : '課程'}</div>
                <div class="management-kv-value">${this.escapeText(courseName)}</div>
              </div>
              <div class="management-kv-item">
                <div class="management-kv-label">${I18n.getLocale() === 'en' ? 'Published' : '狀態'}</div>
                <div class="management-kv-value">${this.renderManagementStatusBadge(quiz.visible === false ? 'draft' : 'published', statusLabel)}</div>
              </div>
              <div class="management-kv-item">
                <div class="management-kv-label">${I18n.getLocale() === 'en' ? 'Last activity' : '最近作答'}</div>
                <div class="management-kv-value">${latestAttemptAt ? this.escapeText(this.formatPlatformDate(latestAttemptAt, { dateStyle: 'medium', timeStyle: 'short' }) || '—') : '—'}</div>
              </div>
              <div class="management-kv-item">
                <div class="management-kv-label">${I18n.getLocale() === 'en' ? 'Report status' : '報表狀態'}</div>
                <div class="management-kv-value">${attempts.length > 0 ? (I18n.getLocale() === 'en' ? 'Live data available' : '已有可分析資料') : (I18n.getLocale() === 'en' ? 'Waiting for learner activity' : '等待學生作答')}</div>
              </div>
            </div>
          </section>
        </div>
        <div class="management-table-shell">
          <div class="management-table-heading">
            <h3>${I18n.getLocale() === 'en' ? 'Section analytics' : '區段分析'}</h3>
            <span class="activity-chip">${(sectionAnalytics.sections || []).length} ${I18n.getLocale() === 'en' ? 'sections' : '個區段'}</span>
          </div>
          ${this.renderQuizSectionAnalytics(sectionAnalytics, { mode: 'teacher' })}
        </div>
        <div class="management-table-shell">
          <div class="management-table-heading">
            <h3>${I18n.getLocale() === 'en' ? 'Attempts' : '作答紀錄'}</h3>
            <span class="activity-chip">${attempts.length} ${I18n.getLocale() === 'en' ? 'records' : '筆紀錄'}</span>
          </div>
          ${attempts.length === 0 ? `
            <div class="management-empty-preview">${I18n.getLocale() === 'en' ? 'No student attempts yet.' : '目前還沒有學生作答紀錄。'}</div>
          ` : `
            <table class="management-table">
              <thead>
                <tr>
                  <th>${I18n.getLocale() === 'en' ? 'Student' : '學生'}</th>
                  <th>${t('moodleQuiz.startTime')}</th>
                  <th>${t('moodleQuiz.finishTime')}</th>
                  <th class="is-center">${t('moodleQuiz.scoreCol')}</th>
                  <th class="is-center">${I18n.getLocale() === 'en' ? 'Essay grading' : '申論批改'}</th>
                  <th class="is-center">${I18n.getLocale() === 'en' ? 'Status' : '狀態'}</th>
                  <th class="is-center">${I18n.getLocale() === 'en' ? 'Action' : '操作'}</th>
                </tr>
              </thead>
              <tbody>
                ${attempts.map(attempt => `
                  <tr>
                    <td>${this.escapeText(attempt.userName || attempt.userEmail || attempt.userId || '—')}</td>
                    <td>${this.escapeText(this.formatPlatformDate(attempt.startedAt, { dateStyle: 'medium', timeStyle: 'short' }) || '—')}</td>
                    <td>${this.escapeText(this.formatPlatformDate(attempt.completedAt || attempt.submittedAt, { dateStyle: 'medium', timeStyle: 'short' }) || '—')}</td>
                    <td class="is-center">${attempt.score != null ? this.escapeText(String(attempt.score)) : (attempt.percentage != null ? `${this.escapeText(String(Math.round(attempt.percentage)))}%` : '—')}</td>
                    <td class="is-center">${this.renderQuizAttemptManualStatus({ ...quiz, quizId }, attempt)}</td>
                    <td class="is-center">${this.renderManagementStatusBadge(attempt.status || 'completed', attempt.status === 'completed' ? t('common.completed') : t('common.pending'))}</td>
                    <td class="is-center">${this.renderQuizAttemptManualAction({ ...quiz, quizId }, attempt)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
        <div class="management-table-shell">
          <div class="management-table-heading">
            <h3>${I18n.getLocale() === 'en' ? 'Question analytics' : '題目分析'}</h3>
            <span class="activity-chip">${questionStats.length} ${I18n.getLocale() === 'en' ? 'questions' : '題'}</span>
          </div>
          ${questionStats.length === 0 ? `
            <div class="management-empty-preview">${I18n.getLocale() === 'en' ? 'Question analytics will appear after submissions.' : '學生開始作答後，這裡會顯示題目分析。'}</div>
          ` : `
            <table class="management-table">
              <thead>
                <tr>
                  <th>${I18n.getLocale() === 'en' ? 'Question' : '題目'}</th>
                  <th class="is-center">${I18n.getLocale() === 'en' ? 'Correct rate' : '答對率'}</th>
                  <th>${I18n.getLocale() === 'en' ? 'Type' : '題型'}</th>
                </tr>
              </thead>
              <tbody>
                ${questionStats.map((question, index) => `
                  <tr>
                    <td>${this.escapeText(question.questionText || `${I18n.getLocale() === 'en' ? 'Question' : '題目'} ${index + 1}`)}</td>
                    <td class="is-center">${this.escapeText(String(question.correctRate ?? 0))}%</td>
                    <td>${this.escapeText(this.getLocalizedQuestionType(question.type))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
    this.applyDynamicUiMetrics(container);
  },

  async openQuizResults(quizId, { quiz: preloadedQuiz = null, course: preloadedCourse = null, path = null, replaceHistory = false } = {}) {
    try {
      let quiz = this.normalizeQuizState(preloadedQuiz || {});
      if (!quiz.quizId || !quiz.courseId || !quiz.title || !Array.isArray(quiz.questions)) {
        const quizDetailResult = await API.quizzes.get(quizId);
        if (!quizDetailResult.success) {
          showToast(quizDetailResult.message || t('moodleQuiz.loadFailed'));
          return;
        }
        quiz = this.normalizeQuizState(quizDetailResult.data || {});
      }

      const result = await API.quizzes.getResults(quizId);
      if (!result.success) {
        showToast(result.message || t('moodleQuiz.loadFailed'));
        return;
      }

      let course = preloadedCourse;
      if (!course && (quiz.courseId || result.data?.quiz?.courseId)) {
        const courseId = quiz.courseId || result.data?.quiz?.courseId;
        const courseResult = await API.courses.get(courseId);
        if (courseResult.success) {
          course = courseResult.data;
          this.currentQuizCourseId = courseId;
        }
      }

      if (!this.canTeachCourse(course)) {
        showToast(I18n.getLocale() === 'en' ? 'You do not have permission to view this quiz report.' : '你沒有權限查看這份測驗報表');
        return;
      }

      this.renderTeacherQuizResultsPage(quiz, result.data || {}, course);
      showView('quizAttempt', {
        path: path || `/platform/quiz/${encodeURIComponent(quizId)}`,
        replaceHistory
      });
    } catch (error) {
      console.error('Open quiz results error:', error);
      showToast(t('moodleQuiz.loadDetailFailed'));
    }
  },

  /**
   * 開啟測驗詳情
   */
  async openQuiz(quizId, options = {}) {
    try {
      const result = await API.quizzes.get(quizId);
      if (!result.success) {
        showToast(t('moodleQuiz.loadFailed'));
        return;
      }

      const quiz = this.normalizeQuizState(result.data || {});
      const user = API.getCurrentUser();
      let course = null;
      if (quiz.courseId) {
        try {
          const courseResult = await API.courses.get(quiz.courseId);
          if (courseResult.success) {
            course = courseResult.data;
            this.currentQuizCourseId = quiz.courseId;
          }
        } catch (error) {
          console.warn('Load quiz course for access check failed:', error);
        }
      }

      if (this.isTeachingRole(user) && this.canTeachCourse(course, user)) {
        await this.openQuizResults(quizId, {
          quiz,
          course,
          path: options.path || `/platform/quiz/${encodeURIComponent(quizId)}`,
          replaceHistory: options.replaceHistory
        });
        return;
      }

      const attemptsHistory = Array.isArray(quiz.myAttempts)
        ? quiz.myAttempts
        : (Array.isArray(quiz.attempts) ? quiz.attempts : []);
      const gradePendingRelease = Boolean(quiz.gradePendingRelease);
      const quizResultsAvailable = this.isQuizResultAvailable(quiz);
      const attemptsAllowedRaw = Number(quiz.maxAttempts);
      const attemptsAllowed = Number.isFinite(attemptsAllowedRaw) ? attemptsAllowedRaw : 0;
      const now = new Date();
      const isOpen = (!quiz.openDate || new Date(quiz.openDate) <= now) &&
                     (!quiz.closeDate || new Date(quiz.closeDate) >= now);

      // 顯示測驗資訊頁面
      const container = document.getElementById('quizAttemptContent');
      container.innerHTML = `
        <div class="quiz-info-page">
          <button onclick="showView('moodleQuizzes')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            ${t('moodleQuiz.backToList')}
          </button>
          <div class="quiz-info-header">
            <h1>${quiz.title}</h1>
            <p class="quiz-description">${quiz.description || t('moodleQuiz.noDesc')}</p>
          </div>
          <div class="quiz-info-details">
            <div class="info-item">
              <span class="label">${t('moodleQuiz.questionCount')}</span>
              <span class="value">${quiz.questionCount || 0} ${t('moodleQuiz.questionsUnit')}</span>
            </div>
            <div class="info-item">
              <span class="label">${t('moodleQuiz.timeLimit')}</span>
              <span class="value">${quiz.timeLimit ? quiz.timeLimit + ' ' + t('moodleQuiz.minutes') : t('moodleQuiz.unlimitedTime')}</span>
            </div>
            <div class="info-item">
              <span class="label">${t('moodleQuiz.attemptsAllowed')}</span>
              <span class="value">${attemptsAllowed === 0 ? t('moodleQuiz.unlimited') : attemptsAllowed} ${t('moodleQuiz.times')}</span>
            </div>
            <div class="info-item">
              <span class="label">${t('moodleQuiz.openDate')}</span>
              <span class="value">${quiz.openDate ? this.formatPlatformDate(quiz.openDate, { dateStyle: 'medium', timeStyle: 'short' }) : t('moodleQuiz.alwaysOpen')}</span>
            </div>
            <div class="info-item">
              <span class="label">${t('moodleQuiz.closeDate')}</span>
              <span class="value">${quiz.closeDate ? this.formatPlatformDate(quiz.closeDate, { dateStyle: 'medium', timeStyle: 'short' }) : t('moodleQuiz.noLimit')}</span>
            </div>
          </div>
          ${(!quizResultsAvailable || gradePendingRelease) ? `
            <div class="assignment-deadline-note is-submitted">
              <strong>${this.escapeText(this.getQuizResultUnavailableLabel(quiz))}</strong>
              <span>${quiz.resultVisibility?.reason === 'after_close'
                ? this.escapeText(isEnglish ? 'Your attempt is saved. The report will open after the quiz close date.' : '你的作答已保存，測驗截止後會開放報表。')
                : t('moodleQuiz.pendingReleaseNote')}</span>
            </div>
          ` : ''}
          ${attemptsHistory.length > 0 ? `
            <div class="quiz-attempts-history">
              <h3>${t('moodleQuiz.attemptHistory')}</h3>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>${t('moodleQuiz.attemptCol')}</th>
                    <th>${t('moodleQuiz.startTime')}</th>
                    <th>${t('moodleQuiz.finishTime')}</th>
                    <th>${t('moodleQuiz.scoreCol')}</th>
                    <th>${isEnglish ? 'Review' : '檢視'}</th>
                  </tr>
                </thead>
                <tbody>
                  ${attemptsHistory.map((a, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${a.startedAt ? this.formatPlatformDate(a.startedAt, { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td>
                      <td>${(a.completedAt || a.submittedAt) ? this.formatPlatformDate(a.completedAt || a.submittedAt, { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td>
                      <td>${(!quizResultsAvailable || a.resultVisibility?.resultsAvailable === false) && a.status === 'completed'
                        ? this.escapeText(this.getQuizResultUnavailableLabel(a.resultVisibility ? a : quiz))
                        : (a.score !== undefined && a.score !== null ? a.score + ' ' + t('moodleQuiz.pointsSuffix') : (a.percentage !== undefined && a.percentage !== null ? `${a.percentage}%` : '-'))}</td>
                      <td>${(a.canReview || a.resultVisibility?.resultsAvailable === true) && a.status === 'completed'
                        ? `<button type="button" class="btn-sm" onclick="MoodleUI.reviewQuizAttempt(${this.toInlineActionValue(quizId)}, ${this.toInlineActionValue(a.attemptId)})">${isEnglish ? 'Open report' : '查看報表'}</button>`
                        : '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
          <div class="quiz-action">
            ${isOpen && quiz.canAttempt !== false ? `
              <button onclick="MoodleUI.startQuiz('${quizId}')" class="btn-primary btn-lg">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>
                ${t('moodleQuiz.startQuiz')}
              </button>
            ` : isOpen ? `
              <p class="not-available-message">已達作答上限</p>
            ` : `
              <p class="not-available-message">${t('moodleQuiz.notOpenMsg')}</p>
            `}
          </div>
        </div>
      `;

      showView('quizAttempt', {
        path: options.path || `/platform/quiz/${encodeURIComponent(quizId)}`,
        replaceHistory: options.replaceHistory
      });
    } catch (error) {
      console.error('Open quiz error:', error);
      showToast(t('moodleQuiz.loadDetailFailed'));
    }
  },

  /**
   * 開啟新增討論 Modal
   */
  openCreateForumModal(courseId) {
    return this.openForumBuilderModal({
      courseId,
      returnTo: 'forums'
    });
  },

  async submitCreateForum(courseId) {
    return this.saveForumBuilder(courseId);
  },

  openNewDiscussionModal(forumId, discussion = null) {
    if (typeof discussion === 'string') {
      try {
        discussion = JSON.parse(discussion);
      } catch (error) {
        discussion = null;
      }
    }
    this.closeModal('newDiscussionModal');
    const isEditing = !!discussion;
    const subjectValue = this.escapeText(discussion?.subject || discussion?.title || '');
    const messageValue = this.escapeText(discussion?.message || discussion?.content || '');
    const modal = document.createElement('div');
    modal.id = 'newDiscussionModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal active discussion-modal discussion-modal-lg" role="dialog" aria-modal="true" aria-labelledby="newDiscussionModalTitle">
        <div class="modal-header">
          <h2 id="newDiscussionModalTitle">${isEditing ? (t('common.edit') + ' ' + t('moodleDiscussion.newTitle')) : t('moodleDiscussion.newTitle')}</h2>
          <button onclick="MoodleUI.closeModal('newDiscussionModal')" class="modal-close">&times;</button>
        </div>
        <form id="newDiscussionForm">
          <div class="modal-body">
            ${isEditing ? `<input type="hidden" id="editingDiscussionId" value="${this.escapeText(discussion.discussionId || discussion.id || '')}">` : ''}
            <div class="discussion-modal-intro">
              <div class="discussion-modal-intro-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>
              </div>
              <div>
                <div class="discussion-modal-intro-title">${I18n.getLocale() === 'en' ? (isEditing ? 'Refine the thread clearly' : 'Make the thread easier to answer') : (isEditing ? '重新整理主題內容' : '讓主題更容易被回覆')}</div>
                <p class="discussion-modal-intro-copy">${I18n.getLocale() === 'en' ? (isEditing ? 'Update the subject and details so learners and teachers can quickly understand the thread context.' : 'A clear subject and useful context help teachers and learners reply faster.') : (isEditing ? '請把主旨與內容補充完整，讓老師與同學能快速理解討論脈絡。' : '主旨先說清楚問題，內容補充背景與目前做法，能讓同學與老師更快切入重點。')}</p>
              </div>
            </div>
            <div class="bridge-form-group">
              <label class="bridge-form-label" for="discussionSubject">${t('moodleDiscussion.subjectLabel')}</label>
              <input type="text" id="discussionSubject" class="bridge-form-control" placeholder="${t('moodleDiscussion.subjectPlaceholder')}" value="${subjectValue}">
            </div>
            <div class="bridge-form-group">
              <label class="bridge-form-label" for="discussionMessage">${t('moodleDiscussion.contentLabel')}</label>
              <textarea id="discussionMessage" rows="7" class="bridge-form-control discussion-form-textarea" placeholder="${t('moodleDiscussion.contentPlaceholder')}">${messageValue}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <div class="discussion-modal-note">${I18n.getLocale() === 'en' ? (isEditing ? 'Updates will be reflected in the forum immediately.' : 'Once published, the discussion will appear in this course forum and count toward discussion statistics.') : (isEditing ? '儲存後會立即更新論壇中的主題內容。' : '發布後會顯示在這個課程論壇中，並納入主題與回覆統計。')}</div>
            <button type="button" onclick="MoodleUI.closeModal('newDiscussionModal')" class="btn-secondary">${t('moodleDiscussion.cancel')}</button>
            <button type="submit" class="btn-primary">${isEditing ? t('common.save') : t('moodleDiscussion.publish')}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('newDiscussionModal'); };
    modal.querySelector('#newDiscussionForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitNewDiscussion(forumId);
    });
    window.requestAnimationFrame(() => modal.querySelector('#discussionSubject')?.focus());
  },

  /**
   * 提交新討論
   */
  async submitNewDiscussion(forumId) {
    const subject = document.getElementById('discussionSubject').value.trim();
    const message = document.getElementById('discussionMessage').value.trim();
    const discussionId = document.getElementById('editingDiscussionId')?.value?.trim();

    if (!subject || !message) {
      showToast(t('moodleDiscussion.fieldsRequired'));
      return;
    }

    try {
      const result = discussionId
        ? await API.forums.updateDiscussion(forumId, discussionId, { subject, message })
        : await API.forums.createDiscussion(forumId, { subject, message });
      if (result.success) {
        showToast(discussionId
          ? (I18n.getLocale() === 'en' ? 'Discussion updated' : '討論已更新')
          : t('moodleDiscussion.published'));
        this.closeModal('newDiscussionModal');
        if (discussionId) {
          this.openDiscussion(forumId, discussionId);
        } else {
          this.openForum(forumId);
        }
      } else {
        showToast(result.message || (discussionId ? t('common.updateFailed') : t('moodleDiscussion.publishFailed')));
      }
    } catch (error) {
      console.error('Create discussion error:', error);
      showToast(discussionId ? t('common.updateFailed') : t('moodleDiscussion.publishFailed'));
    }
  },

  async toggleForumSubscription(forumId, currentlySubscribed) {
    try {
      const result = currentlySubscribed
        ? await API.forums.unsubscribe(forumId)
        : await API.forums.subscribe(forumId);
      if (result.success) {
        showToast(currentlySubscribed
          ? (I18n.getLocale() === 'en' ? 'Forum unsubscribed' : '已取消訂閱討論區')
          : (I18n.getLocale() === 'en' ? 'Forum subscribed' : '已訂閱討論區'));
        this.openForum(forumId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      console.error('Toggle forum subscription error:', error);
      showToast(t('common.updateFailed'));
    }
  },

  async markForumRead(forumId) {
    try {
      const result = await API.forums.markRead(forumId);
      if (result.success) {
        showToast(I18n.getLocale() === 'en' ? 'Marked forum as read' : '已將討論區標記為已讀');
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      console.error('Mark forum read error:', error);
      showToast(t('common.updateFailed'));
    }
  },

  async deleteForum(forumId, courseId = this.currentForumCourseId || this.currentCourseId) {
    const confirmed = await showConfirmDialog({
      message: I18n.getLocale() === 'en' ? 'Delete this forum, all discussions, and all replies?' : '確定要刪除此討論區、所有主題與回覆嗎？',
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.forums.delete(forumId);
      if (!result.success) {
        showToast(result.message || t('common.deleteFailed'));
        return;
      }

      showToast(result.message || (I18n.getLocale() === 'en' ? 'Forum deleted' : '討論區已刪除'));
      showView('moodleForums');
      await this.loadForums(courseId || this.currentForumCourseId);
    } catch (error) {
      console.error('Delete forum error:', error);
      showToast(t('common.deleteFailed'));
    }
  },

  async deleteDiscussion(forumId, discussionId) {
    const confirmed = await showConfirmDialog({
      message: I18n.getLocale() === 'en' ? 'Delete this discussion and all replies?' : '確定要刪除此討論與所有回覆嗎？',
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.forums.deleteDiscussion(forumId, discussionId);
      if (result.success) {
        showToast(I18n.getLocale() === 'en' ? 'Discussion deleted' : '討論已刪除');
        this.openForum(forumId);
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete discussion error:', error);
      showToast(t('common.deleteFailed'));
    }
  },

  async toggleDiscussionPinned(forumId, discussionId, pinned) {
    try {
      const result = pinned
        ? await API.forums.unpinDiscussion(forumId, discussionId)
        : await API.forums.pinDiscussion(forumId, discussionId);
      if (result.success) {
        showToast(pinned
          ? (I18n.getLocale() === 'en' ? 'Discussion unpinned' : '已取消置頂')
          : (I18n.getLocale() === 'en' ? 'Discussion pinned' : '討論已置頂'));
        this.openForum(forumId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      console.error('Toggle discussion pin error:', error);
      showToast(t('common.updateFailed'));
    }
  },

  async toggleDiscussionSubscription(forumId, discussionId, subscribed) {
    try {
      const result = subscribed
        ? await API.forums.unsubscribeDiscussion(forumId, discussionId)
        : await API.forums.subscribeDiscussion(forumId, discussionId);
      if (result.success) {
        showToast(subscribed
          ? (I18n.getLocale() === 'en' ? 'Discussion unsubscribed' : '已取消訂閱討論串')
          : (I18n.getLocale() === 'en' ? 'Discussion subscribed' : '已訂閱討論串'));
        this.openDiscussion(forumId, discussionId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      console.error('Toggle discussion subscription error:', error);
      showToast(t('common.updateFailed'));
    }
  },

  async toggleDiscussionLocked(forumId, discussionId, locked) {
    try {
      const result = locked
        ? await API.forums.unlockDiscussion(forumId, discussionId)
        : await API.forums.lockDiscussion(forumId, discussionId);
      if (result.success) {
        showToast(locked
          ? (I18n.getLocale() === 'en' ? 'Discussion unlocked' : '討論已解除鎖定')
          : (I18n.getLocale() === 'en' ? 'Discussion locked' : '討論已鎖定'));
        this.openDiscussion(forumId, discussionId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      console.error('Toggle discussion lock error:', error);
      showToast(t('common.updateFailed'));
    }
  },

  openEditPostModal(forumId, discussionId, post) {
    if (typeof post === 'string') {
      try {
        post = JSON.parse(post);
      } catch (error) {
        post = null;
      }
    }
    this.closeModal('editPostModal');
    const modal = document.createElement('div');
    modal.id = 'editPostModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal active discussion-modal" role="dialog" aria-modal="true" aria-labelledby="editPostModalTitle">
        <div class="modal-header">
          <h2 id="editPostModalTitle">${t('common.edit')} ${I18n.getLocale() === 'en' ? 'Reply' : '回覆'}</h2>
          <button onclick="MoodleUI.closeModal('editPostModal')" class="modal-close">&times;</button>
        </div>
        <form id="editPostForm">
          <div class="modal-body">
            <div class="bridge-form-group">
              <label class="bridge-form-label" for="editPostMessage">${t('moodleDiscussion.contentLabel')}</label>
              <textarea id="editPostMessage" rows="6" class="bridge-form-control discussion-form-textarea">${this.escapeText(post?.message || post?.content || '')}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="MoodleUI.closeModal('editPostModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${t('common.save')}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (event) => { if (event.target === modal) this.closeModal('editPostModal'); };
    modal.querySelector('#editPostForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('editPostMessage')?.value?.trim();
      if (!message) {
        showToast(t('moodleDiscussion.replyRequired'));
        return;
      }
      try {
        const result = await API.forums.updatePost(forumId, discussionId, post.postId, { message });
        if (result.success) {
          showToast(I18n.getLocale() === 'en' ? 'Reply updated' : '回覆已更新');
          this.closeModal('editPostModal');
          this.openDiscussion(forumId, discussionId);
        } else {
          showToast(result.message || t('common.updateFailed'));
        }
      } catch (error) {
        console.error('Edit post error:', error);
        showToast(t('common.updateFailed'));
      }
    });
  },

  async deletePost(forumId, discussionId, postId) {
    const confirmed = await showConfirmDialog({
      message: I18n.getLocale() === 'en' ? 'Delete this reply?' : '確定要刪除此回覆嗎？',
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.forums.deletePost(forumId, discussionId, postId);
      if (result.success) {
        showToast(I18n.getLocale() === 'en' ? 'Reply deleted' : '回覆已刪除');
        this.openDiscussion(forumId, discussionId);
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete post error:', error);
      showToast(t('common.deleteFailed'));
    }
  },

  async ratePost(forumId, discussionId, postId) {
    const rating = await showPromptDialog({
      message: I18n.getLocale() === 'en' ? 'Rate this reply from 1 to 5' : '請輸入 1 到 5 分評價這則回覆',
      defaultValue: '5',
      placeholder: '1-5',
      confirmLabel: t('common.confirm')
    });
    if (rating === null) return;

    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      showToast(I18n.getLocale() === 'en' ? 'Please enter a number between 1 and 5' : '請輸入 1 到 5 的數字');
      return;
    }

    try {
      const result = await API.forums.ratePost(forumId, discussionId, postId, numericRating);
      if (result.success) {
        showToast(I18n.getLocale() === 'en' ? 'Reply rated' : '已完成評分');
        this.openDiscussion(forumId, discussionId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      console.error('Rate post error:', error);
      showToast(t('common.updateFailed'));
    }
  },

  /**
   * 開啟討論主題
   */
  async openDiscussion(forumId, discussionId) {
    try {
      const result = await API.forums.getDiscussion(forumId, discussionId);
      if (!result.success) {
        showToast(t('moodleDiscussion.loadFailed'));
        return;
      }

      const discussion = result.data;
      const container = document.getElementById('forumDetailContent');
      const posts = Array.isArray(discussion.posts) ? discussion.posts : [];
      const currentUser = API.getCurrentUser();
      const canManageForum = await this.canManageCourseById(discussion.courseId || this.currentForumCourseId, currentUser);
      const isDiscussionAuthor = this.isCurrentUser(discussion.authorId, currentUser);
      const safeAuthor = this.escapeText(discussion.authorName || t('discussion.anonymous'));
      const safeSubject = this.escapeText(discussion.subject || discussion.title || t('discussion.untitled'));
      const safeMessage = this.formatMultilineText(discussion.message || discussion.content || '');
      const safeCreatedAt = this.escapeText(this.formatPlatformDate(discussion.createdAt, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) || '');
      const latestActivitySource = posts[posts.length - 1]?.createdAt || discussion.updatedAt || discussion.createdAt;
      const safeLatestActivity = this.escapeText(this.formatPlatformDate(latestActivitySource, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) || '');
      const totalLikes = posts.reduce((sum, post) => sum + Number(post.likes || 0), 0);
      const activeReplyCount = posts.filter((post) => Number(post.likes || 0) > 0 || Number(post.ratingCount || 0) > 0).length;

      container.innerHTML = `
        <section class="forum-thread-shell">
          <div class="forum-thread-panel is-hero">
            <div class="forum-thread-top">
              <div class="forum-header-cluster">
                <button type="button" class="forum-back-btn" onclick="MoodleUI.openForum(${this.toInlineActionValue(forumId)})">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  <span>${t('moodleDiscussion.backToForum')}</span>
                </button>
                <div class="forum-thread-copy">
                  <div class="forum-thread-title-row">
                    <span class="forum-thread-count-pill">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>${posts.length} ${t('moodleDiscussion.repliesCount')}</span>
                    </span>
                    ${discussion.pinned ? `<span class="forum-chip">${I18n.getLocale() === 'en' ? 'Pinned discussion' : '置頂主題'}</span>` : ''}
                    ${discussion.locked ? `<span class="forum-chip">${I18n.getLocale() === 'en' ? 'Read-only thread' : '唯讀討論串'}</span>` : ''}
                  </div>
                  <h2 class="forum-thread-title">${safeSubject}</h2>
                  <p class="forum-thread-subtitle">${I18n.getLocale() === 'en' ? 'The original discussion and all replies are shown below in chronological order.' : '以下顯示原始主題與所有回覆。內容會依時間排序，方便你追蹤討論脈絡。'}</p>
                </div>
              </div>
              <div class="forum-thread-actions">
                <div class="category-actions">
                  <button type="button" class="btn-sm" onclick="MoodleUI.toggleDiscussionSubscription(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${discussion.subscribed ? 'true' : 'false'})">
                    ${discussion.subscribed ? (I18n.getLocale() === 'en' ? 'Unsubscribe' : '取消訂閱') : (I18n.getLocale() === 'en' ? 'Subscribe' : '訂閱討論串')}
                  </button>
                </div>
              </div>
            </div>
            <div class="forum-thread-stats">
              <div class="forum-thread-stat-card">
                <span class="forum-thread-stat-label">${I18n.getLocale() === 'en' ? 'Thread starter' : '發文者'}</span>
                <span class="forum-thread-stat-value">${safeAuthor}</span>
                <span class="forum-thread-stat-note">${safeCreatedAt || t('discussion.createdRecently')}</span>
              </div>
              <div class="forum-thread-stat-card">
                <span class="forum-thread-stat-label">${t('discussion.latestActivity')}</span>
                <span class="forum-thread-stat-value">${safeLatestActivity || '-'}</span>
                <span class="forum-thread-stat-note">${posts.length > 0 ? t('discussion.repliesInThread', { count: posts.length }) : t('discussion.noRepliesShort')}</span>
              </div>
              <div class="forum-thread-stat-card">
                <span class="forum-thread-stat-label">${t('discussion.engagement')}</span>
                <span class="forum-thread-stat-value">${t('discussion.likesLabel', { count: totalLikes })}</span>
                <span class="forum-thread-stat-note">${activeReplyCount > 0 ? (I18n.getLocale() === 'en' ? `${activeReplyCount} replies already have reactions` : `${activeReplyCount} 則回覆已有互動`) : (I18n.getLocale() === 'en' ? 'Replies still need attention' : '目前仍等待更多回覆互動')}</span>
              </div>
            </div>
            <div class="forum-thread-meta">
              <span class="forum-chip">${safeAuthor}</span>
              ${safeCreatedAt ? `<span class="forum-chip">${safeCreatedAt}</span>` : ''}
              ${discussion.pinned ? `<span class="forum-chip">${I18n.getLocale() === 'en' ? 'Pinned' : '已置頂'}</span>` : ''}
              ${discussion.locked ? `<span class="forum-chip">${I18n.getLocale() === 'en' ? 'Locked' : '已鎖定'}</span>` : ''}
            </div>
          </div>

          <article class="forum-thread-post is-main">
            <div class="forum-thread-avatar">${this.escapeText((discussion.authorName || 'U').trim().charAt(0) || 'U')}</div>
            <div class="forum-thread-post-body">
              <div class="forum-thread-post-topline">
                <div>
                  <div class="forum-thread-post-author">${safeAuthor}</div>
                  <div class="forum-thread-post-meta">
                    ${safeCreatedAt ? `<span>${safeCreatedAt}</span>` : ''}
                    ${discussion.locked ? `<span>•</span><span>${t('moodleDiscussion.locked')}</span>` : ''}
                  </div>
                </div>
              </div>
              <h3 class="forum-thread-post-title">${safeSubject}</h3>
              <div class="forum-thread-post-content">${safeMessage || this.escapeText(I18n.getLocale() === 'en' ? 'No content provided yet.' : '尚未提供內容。')}</div>
              <div class="forum-thread-post-actions">
                <div class="forum-thread-post-tags">
                  <span class="forum-chip">${I18n.getLocale() === 'en' ? 'Original post' : '原始主題'}</span>
                  ${discussion.pinned ? `<span class="forum-chip">${I18n.getLocale() === 'en' ? 'Pinned' : '置頂中'}</span>` : ''}
                </div>
                <div class="category-actions">
                  ${(isDiscussionAuthor || canManageForum) ? `<button type="button" class="btn-sm" onclick="MoodleUI.openNewDiscussionModal(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(JSON.stringify({
                    discussionId,
                    subject: discussion.subject || discussion.title || '',
                    message: discussion.message || discussion.content || ''
                  }))})">${t('common.edit')}</button>` : ''}
                  ${(isDiscussionAuthor || canManageForum) ? `<button type="button" class="btn-sm btn-danger" onclick="MoodleUI.deleteDiscussion(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)})">${t('common.delete')}</button>` : ''}
                  ${canManageForum ? `<button type="button" class="btn-sm" onclick="MoodleUI.toggleDiscussionPinned(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${discussion.pinned ? 'true' : 'false'})">${discussion.pinned ? (I18n.getLocale() === 'en' ? 'Unpin' : '取消置頂') : (I18n.getLocale() === 'en' ? 'Pin' : '置頂')}</button>` : ''}
                  ${canManageForum ? `<button type="button" class="btn-sm" onclick="MoodleUI.toggleDiscussionLocked(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${discussion.locked ? 'true' : 'false'})">${discussion.locked ? (I18n.getLocale() === 'en' ? 'Unlock' : '解除鎖定') : (I18n.getLocale() === 'en' ? 'Lock' : '鎖定')}</button>` : ''}
                </div>
              </div>
            </div>
          </article>

          <section class="forum-thread-panel">
            <div class="forum-thread-replies-head">
              <div class="forum-thread-replies-title">${posts.length} ${t('moodleDiscussion.repliesCount')}</div>
              <div class="forum-count-row">
                <span class="forum-chip">${t('discussion.reactedReplies', { count: posts.filter(post => post.liked).length })}</span>
              </div>
            </div>
            <div class="forum-thread-replies">
              ${posts.length === 0
                ? this.renderForumState(t('discussion.noRepliesYet'))
                : posts.map((post, postIndex) => {
                    const isPostAuthor = this.isCurrentUser(post.authorId, currentUser);
                    const safePostAuthor = this.escapeText(post.authorName || t('discussion.anonymous'));
                    const safePostTime = this.escapeText(this.formatPlatformDate(post.createdAt, {
                      year: 'numeric',
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) || '');
                    const safePostMessage = this.formatMultilineText(post.message || post.content || '');
                    const replyDepth = Number(post.replyDepth || 0);
                    const replyStageLabel = replyDepth > 0
                      ? (I18n.getLocale() === 'en' ? `Nested reply ${Math.min(replyDepth + 1, 4)}` : `第 ${Math.min(replyDepth + 1, 4)} 層回覆`)
                      : (I18n.getLocale() === 'en' ? 'Direct reply' : '直接回覆');
                    return `
                      <article class="forum-thread-post is-reply${replyDepth > 0 ? ' is-nested-reply' : ''}">
                        <div class="forum-thread-avatar">${this.escapeText((post.authorName || 'U').trim().charAt(0) || 'U')}</div>
                        <div class="forum-thread-post-body">
                          <div class="forum-thread-post-rail">
                            <div class="forum-thread-post-kicker-row">
                              <span class="forum-thread-post-stage">${replyStageLabel}</span>
                              <span class="forum-thread-post-index">#${postIndex + 1}</span>
                            </div>
                            ${Number(post.ratingCount || 0) > 0 ? `<span class="forum-thread-post-index">${this.escapeText(`${post.ratingAverage || 0} / 5 (${post.ratingCount})`)}</span>` : ''}
                          </div>
                          <div class="forum-thread-post-header">
                            <div>
                              <div class="forum-thread-post-author">${safePostAuthor}</div>
                              <div class="forum-thread-post-meta">
                                ${replyDepth > 0 ? `<span>${'↳'.repeat(Math.min(replyDepth, 3))} ${I18n.getLocale() === 'en' ? 'Reply' : '回覆'}</span>${safePostTime ? '<span>•</span>' : ''}` : ''}
                                ${safePostTime ? `<span>${safePostTime}</span>` : ''}
                              </div>
                            </div>
                            <button type="button" onclick="event.stopPropagation(); MoodleUI.likePost(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${this.toInlineActionValue(post.postId)})" class="forum-thread-like-btn ${post.liked ? 'liked' : ''}">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                              </svg>
                              <span>${Number(post.likes || 0)}</span>
                            </button>
                          </div>
                          <div class="forum-thread-post-copy">
                            <div class="forum-thread-post-content">${safePostMessage || this.escapeText(I18n.getLocale() === 'en' ? 'No content provided yet.' : '尚未提供內容。')}</div>
                          </div>
                          <div class="forum-thread-post-actions">
                            <div class="forum-thread-post-tags">
                              <span class="forum-chip">${replyDepth > 0 ? (I18n.getLocale() === 'en' ? 'Nested thread' : '巢狀討論') : (I18n.getLocale() === 'en' ? 'Reply' : '回覆')}</span>
                              ${post.updatedAt && post.updatedAt !== post.createdAt ? `<span class="forum-chip">${I18n.getLocale() === 'en' ? 'Edited' : '已編輯'}</span>` : ''}
                            </div>
                            <div class="category-actions">
                              <button type="button" class="btn-sm" onclick="MoodleUI.ratePost(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${this.toInlineActionValue(post.postId)})">${I18n.getLocale() === 'en' ? 'Rate' : '評分'}</button>
                              ${(isPostAuthor || canManageForum) ? `<button type="button" class="btn-sm" onclick="MoodleUI.openEditPostModal(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${this.toInlineActionValue(JSON.stringify({
                                postId: post.postId,
                                message: post.message || post.content || ''
                              }))})">${t('common.edit')}</button>` : ''}
                              ${(isPostAuthor || canManageForum) ? `<button type="button" class="btn-sm btn-danger" onclick="MoodleUI.deletePost(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)}, ${this.toInlineActionValue(post.postId)})">${t('common.delete')}</button>` : ''}
                            </div>
                          </div>
                        </div>
                      </article>
                    `;
                  }).join('')}
            </div>
          </section>

          ${!discussion.locked ? `
            <section class="forum-thread-reply-form">
              <div class="forum-thread-reply-form-shell">
                <div class="forum-thread-reply-form-head">
                  <div>
                    <div class="forum-thread-reply-form-kicker">${I18n.getLocale() === 'en' ? 'Composer' : '回覆工作區'}</div>
                    <div class="forum-thread-reply-form-title">${t('moodleDiscussion.replyTitle')}</div>
                    <p class="forum-thread-reply-form-copy">${I18n.getLocale() === 'en' ? 'Write a reply that gives context, examples, or actionable next steps so the thread stays useful to other learners.' : '盡量補充情境、範例或可執行建議，讓後續讀到這則討論的人也能獲得幫助。'}</p>
                  </div>
                  <div class="forum-thread-reply-tools">
                    <span class="forum-thread-reply-tool">${I18n.getLocale() === 'en' ? 'Clear structure' : '清楚結構'}</span>
                    <span class="forum-thread-reply-tool">${I18n.getLocale() === 'en' ? 'Actionable advice' : '具體建議'}</span>
                  </div>
                </div>
              </div>
              <textarea id="replyMessage" class="bridge-form-control" rows="5" placeholder="${t('moodleDiscussion.replyPlaceholder')}"></textarea>
              <div class="forum-thread-reply-actions">
                <div class="forum-thread-reply-note">回覆會立即顯示在這個主題下方，請盡量提供具體、可執行的建議。</div>
                <button type="button" onclick="MoodleUI.submitReply(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)})" class="btn-primary">${t('moodleDiscussion.replyBtn')}</button>
              </div>
            </section>
          ` : `
            <div class="forum-thread-state forum-thread-locked">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div class="forum-thread-state-title">${t('moodleDiscussion.locked')}</div>
              <div class="forum-thread-state-copy">${I18n.getLocale() === 'en' ? 'This discussion is locked and no more replies can be added.' : '這則討論已鎖定，目前不能再新增回覆。'}</div>
            </div>
          `}
        </section>
      `;
      API.forums.markDiscussionRead(forumId, discussionId).catch(() => {});
    } catch (error) {
      console.error('Open discussion error:', error);
      showToast(t('moodleDiscussion.loadFailed'));
    }
  },

  /**
   * 提交回覆
   */
  async submitReply(forumId, discussionId) {
    const message = document.getElementById('replyMessage').value.trim();
    if (!message) {
      showToast(t('moodleDiscussion.replyRequired'));
      return;
    }

    try {
      const result = await API.forums.reply(forumId, discussionId, { message });
      if (result.success) {
        showToast(t('moodleDiscussion.replySuccess'));
        this.openDiscussion(forumId, discussionId);
      } else {
        showToast(result.message || t('moodleDiscussion.replyFailed'));
      }
    } catch (error) {
      console.error('Submit reply error:', error);
      showToast(t('moodleDiscussion.replyFailed'));
    }
  },

  /**
   * 按讚
   */
  async likePost(forumId, discussionId, postId) {
    try {
      await API.forums.likePost(forumId, discussionId, postId);
      this.openDiscussion(forumId, discussionId);
    } catch (error) {
      console.error('Like post error:', error);
    }
  },

  /**
   * 處理檔案選擇
   */
  handleFileSelect(input) {
    const container = document.getElementById('selectedFiles');
    if (!container) return;

    const files = input.files;
    if (files.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = Array.from(files).map(f => `
      <div class="selected-file">
        <span class="file-name">${f.name}</span>
        <span class="file-size">(${this.formatFileSize(f.size)})</span>
      </div>
    `).join('');
  },

  /**
   * 格式化檔案大小
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  /**
   * 開啟某一天的事件
   */
  async openDayEvents(year, month, day) {
    const selectedDate = new Date(year, month, day);
    const dateLabel = `${year}/${month + 1}/${day}`;
    const isEnglish = I18n.getLocale() === 'en';

    let monthEvents = Array.isArray(this.currentCalendarEvents) ? this.currentCalendarEvents : [];
    if (monthEvents.length === 0) {
      try {
        const result = await API.calendar.getEvents({
          start: new Date(year, month, 1).toISOString(),
          end: new Date(year, month + 1, 0).toISOString()
        });
        monthEvents = result.success ? (result.data || []) : [];
        this.currentCalendarEvents = monthEvents;
      } catch (error) {
        console.error('Load calendar day events error:', error);
      }
    }

    const dayEvents = this.getEventsForLocalDate(monthEvents, selectedDate)
      .sort((a, b) => {
        const aTs = new Date(this.getCalendarEventDate(a) || 0).getTime();
        const bTs = new Date(this.getCalendarEventDate(b) || 0).getTime();
        return aTs - bTs;
      });

    if (dayEvents.length === 0) {
      showToast(`${dateLabel} ${t('moodleCalendar.noEvents')}`);
      return;
    }

    const weekdayLabel = selectedDate.toLocaleDateString(
      isEnglish ? 'en-US' : 'zh-TW',
      { weekday: 'long' }
    );
    const dayLabel = selectedDate.toLocaleDateString(
      isEnglish ? 'en-US' : 'zh-TW',
      isEnglish
        ? { month: 'short', day: 'numeric' }
        : { month: 'numeric', day: 'numeric' }
    );
    const typeCounts = dayEvents.reduce((acc, event) => {
      const type = event.type || 'course';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const summaryLine = isEnglish
      ? `${dayEvents.length} scheduled item${dayEvents.length > 1 ? 's' : ''}${dominantType ? ` · mostly ${this.getCalendarEventTypeLabel(dominantType).toLowerCase()}` : ''}`
      : `共 ${dayEvents.length} 項安排${dominantType ? `，以${this.getCalendarEventTypeLabel(dominantType)}為主` : ''}`;

    const bodyHtml = `
      <div class="calendar-day-modal-shell">
        <section class="calendar-day-modal-hero">
          <div class="calendar-day-modal-date-card">
            <span class="calendar-day-modal-date-top">${this.escapeText(weekdayLabel)}</span>
            <strong class="calendar-day-modal-date-value">${this.escapeText(dayLabel)}</strong>
          </div>
          <div class="calendar-day-modal-copy">
            <div class="calendar-day-modal-kicker">${isEnglish ? 'Daily agenda' : '當日排程'}</div>
            <h4 class="calendar-day-modal-title">${this.escapeText(dateLabel)}</h4>
            <p class="calendar-day-modal-desc">${this.escapeText(summaryLine)}</p>
          </div>
        </section>
        <div class="calendar-day-event-list">
        ${dayEvents.map(event => {
          const eventDateValue = this.getCalendarEventDate(event);
          const eventDate = eventDateValue ? new Date(eventDateValue) : null;
          const validDate = eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null;
          const eventType = event.type || '';
          const encodedType = encodeURIComponent(eventType);
          const encodedCourseId = encodeURIComponent(event.courseId || '');
          return `
            <button type="button"
              class="calendar-day-event-item tone-${this.escapeText(eventType || 'course')}"
              onclick="MoodleUI.handleCalendarEventClick('${encodedType}', '${encodedCourseId}')">
              <div class="calendar-day-event-badge-row">
                <span class="calendar-day-event-badge type-${this.escapeText(eventType || 'course')}">${this.getCalendarEventTypeLabel(eventType)}</span>
                <span class="calendar-day-event-open">${isEnglish ? 'Open' : '查看'}</span>
              </div>
              <div class="calendar-day-event-main">
                <div class="calendar-day-event-copy">
                  <div class="calendar-day-event-title">${this.escapeText(event.title || '未命名事件')}</div>
                  ${event.courseName ? `<div class="calendar-day-event-course">${this.escapeText(event.courseName)}</div>` : ''}
                </div>
                <div class="calendar-day-event-time">
                  ${validDate ? validDate.toLocaleTimeString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </div>
              </div>
            </button>
          `;
        }).join('')}
        </div>
      </div>
    `;

    this.createModal(
      'calendarDayEventsModal',
      `${dateLabel} ${t('moodleCalendar.eventsOf')}`,
      bodyHtml,
      {
        maxWidth: '720px',
        kicker: isEnglish ? 'Calendar workspace' : '行事曆工作區',
        description: isEnglish
          ? 'Review the day agenda and jump directly into the related course activity.'
          : '檢視當日排程，並直接跳轉到對應的課程活動。'
      }
    );
  },

  // ==================== 通知系統 ====================

  /**
   * 載入通知列表
   */
  async loadNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    try {
      const result = await API.notifications.list();
      if (!result.success) return;

      const notifications = result.data || [];
      this.currentNotifications = notifications;
      this.updateNotificationBadge(result.unreadCount || 0);

      if (notifications.length === 0) {
        container.innerHTML = `
          <section class="notification-center">
            <div class="notification-header">
              <div class="notification-shell-copy">
                <span class="notification-shell-kicker">${I18n.getLocale() === 'en' ? 'Inbox' : '通知總覽'}</span>
                <h2>${t('sidebar.notifications') || (I18n.getLocale() === 'en' ? 'Notifications' : '通知中心')}</h2>
                <p class="notification-shell-desc">${I18n.getLocale() === 'en' ? 'Keep track of course updates, reminders, replies, and system activity in one place.' : '在同一個工作區掌握課程更新、提醒、回覆與系統通知。'}</p>
              </div>
              <div class="notification-actions">
                <button type="button" class="btn-secondary" onclick="MoodleUI.markAllNotificationsRead()">${I18n.getLocale() === 'en' ? 'Mark all read' : '全部已讀'}</button>
              </div>
            </div>
            <div class="notification-list">
              ${this.renderActivityEmptyState({
                icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
                title: t('moodleNotification.noNotifications')
              })}
            </div>
          </section>
        `;
        return;
      }

      container.innerHTML = `
        <section class="notification-center">
          <div class="notification-header">
            <div class="notification-shell-copy">
              <span class="notification-shell-kicker">${I18n.getLocale() === 'en' ? 'Inbox' : '通知總覽'}</span>
              <h2>${t('sidebar.notifications') || (I18n.getLocale() === 'en' ? 'Notifications' : '通知中心')}</h2>
              <p class="notification-shell-desc">${I18n.getLocale() === 'en' ? 'Review unread activity, course updates, and recent system messages.' : '查看未讀活動、課程更新與最近的系統訊息。'}</p>
            </div>
            <div class="notification-actions">
              <button type="button" class="btn-secondary" onclick="MoodleUI.markAllNotificationsRead()">${I18n.getLocale() === 'en' ? 'Mark all read' : '全部已讀'}</button>
              <button type="button" class="btn-secondary" onclick="MoodleUI.deleteReadNotifications()">${I18n.getLocale() === 'en' ? 'Clear read' : '清除已讀'}</button>
            </div>
          </div>
          <div class="notification-list">
            ${notifications.map(n => `
              <button type="button" class="notification-item ${n.readAt ? '' : 'unread'}" onclick="MoodleUI.openNotification('${n.notificationId}')">
                <div class="notification-icon ${n.type}">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    ${this.getNotificationIcon(n.type)}
                  </svg>
                </div>
                <div class="notification-content">
                  <div class="notification-card-head">
                    <div>
                      <div class="title">${this.escapeText(n.title || (I18n.getLocale() === 'en' ? 'Notification update' : '通知更新'))}</div>
                      <div class="message">${this.escapeText(n.message || '')}</div>
                    </div>
                    <span class="notification-card-chip">${this.escapeText(this.getLocalizedNotificationType(n.type))}</span>
                  </div>
                  <div class="time">${this.escapeText(this.formatTimeAgo(n.createdAt))}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </section>
      `;
    } catch (error) {
      console.error('Load notifications error:', error);
      container.innerHTML = `<div class="error">${t('moodleNotification.loadFailed')}</div>`;
    }
  },

  getLocalizedNotificationType(type) {
    const labels = {
      assignment: I18n.getLocale() === 'en' ? 'Assignment' : '作業',
      quiz: I18n.getLocale() === 'en' ? 'Quiz' : '測驗',
      forum: I18n.getLocale() === 'en' ? 'Forum' : '討論',
      grade: I18n.getLocale() === 'en' ? 'Grade' : '成績',
      course: I18n.getLocale() === 'en' ? 'Course' : '課程'
    };
    return labels[type] || (I18n.getLocale() === 'en' ? 'Update' : '更新');
  },

  getNotificationDetailSummary(notification = {}) {
    const summary = [];
    if (notification.createdAt) {
      summary.push({
        label: I18n.getLocale() === 'en' ? 'Received' : '收到時間',
        value: this.formatPlatformDate(notification.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) || '—'
      });
    }
    if (notification.metadata?.course?.title || notification.metadata?.course?.name) {
      summary.push({
        label: I18n.getLocale() === 'en' ? 'Course' : '課程',
        value: notification.metadata.course.title || notification.metadata.course.name
      });
    } else if (notification.metadata?.courseName) {
      summary.push({
        label: I18n.getLocale() === 'en' ? 'Course' : '課程',
        value: notification.metadata.courseName
      });
    }
    if (notification.metadata?.assignment?.title || notification.metadata?.quiz?.title || notification.metadata?.badge?.name || notification.metadata?.path?.name) {
      summary.push({
        label: I18n.getLocale() === 'en' ? 'Related item' : '相關項目',
        value:
          notification.metadata.assignment?.title ||
          notification.metadata.quiz?.title ||
          notification.metadata.badge?.name ||
          notification.metadata.path?.name
      });
    }
    return summary;
  },

  buildNotificationDetailBody(notification = {}) {
    const summary = this.getNotificationDetailSummary(notification);
    return `
      <div class="notification-detail-shell">
        <div class="notification-detail-hero">
          <div class="notification-detail-icon ${notification.type || 'course'}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              ${this.getNotificationIcon(notification.type)}
            </svg>
          </div>
          <div class="notification-detail-copy">
            <div class="notification-detail-kicker">${this.escapeText(this.getLocalizedNotificationType(notification.type))}</div>
            <h3 class="notification-detail-title">${this.escapeText(notification.title || (I18n.getLocale() === 'en' ? 'Notification update' : '通知更新'))}</h3>
            <p class="notification-detail-message">${this.escapeText(notification.message || '')}</p>
          </div>
        </div>
        ${summary.length ? `
          <div class="notification-detail-summary">
            ${summary.map(item => `
              <div class="notification-detail-summary-item">
                <span class="notification-detail-summary-label">${this.escapeText(item.label)}</span>
                <strong class="notification-detail-summary-value">${this.escapeText(item.value)}</strong>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="notification-detail-actions">
          ${notification.link ? `<button type="button" class="btn-primary" onclick="window.open('${this.escapeText(notification.link)}', '_blank', 'noopener'); MoodleUI.closeModal('notificationDetailModal')">${I18n.getLocale() === 'en' ? 'Open related content' : '開啟相關內容'}</button>` : ''}
          <button type="button" class="btn-secondary" onclick="MoodleUI.deleteNotification('${this.escapeText(notification.notificationId)}')">${I18n.getLocale() === 'en' ? 'Delete notification' : '刪除此通知'}</button>
        </div>
      </div>
    `;
  },

  /**
   * 取得通知圖示
   */
  getNotificationIcon(type) {
    const icons = {
      assignment: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>',
      quiz: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      forum: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
      grade: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>',
      course: '<polygon points="12,2 2,7 12,12 22,7"/><polyline points="2,17 12,22 22,17"/>'
    };
    return icons[type] || icons.course;
  },

  /**
   * 格式化時間差
   */
  formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return t('moodleNotification.justNow');
    if (diff < 3600) return `${Math.floor(diff / 60)} ${t('moodleNotification.minutesAgo')}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('moodleNotification.hoursAgo')}`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ${t('moodleNotification.daysAgo')}`;
    return this.formatLocaleDate(date);
  },

  formatLocaleDate(dateValue, options) {
    if (!dateValue) return '-';
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '-';
    const locale = I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW';
    return date.toLocaleDateString(locale, options);
  },

  /**
   * 更新通知徽章
   */
  updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }
  },

  /**
   * 開啟通知
   */
  async openNotification(notificationId) {
    try {
      const notification = Array.isArray(this.currentNotifications)
        ? this.currentNotifications.find(item => item.notificationId === notificationId)
        : null;

      await API.notifications.markAsRead(notificationId);

      if (notification) {
        notification.readAt = notification.readAt || new Date().toISOString();
      }

      const unreadCount = Array.isArray(this.currentNotifications)
        ? this.currentNotifications.filter(item => !item.readAt).length
        : 0;
      this.updateNotificationBadge(unreadCount);
      this.loadNotifications();

      if (!notification) return;

      this.createModal(
        'notificationDetailModal',
        notification.title || (I18n.getLocale() === 'en' ? 'Notification update' : '通知更新'),
        this.buildNotificationDetailBody(notification),
        {
          kicker: this.getLocalizedNotificationType(notification.type),
          description: I18n.getLocale() === 'en'
            ? 'Review the context of this notification and jump to the related content if needed.'
            : '查看這則通知的完整內容，並在需要時前往相關內容。',
          maxWidth: '620px'
        }
      );
    } catch (error) {
      console.error('Open notification error:', error);
      showToast(t('moodleNotification.actionFailed'));
    }
  },

  async deleteNotification(notificationId) {
    try {
      await API.notifications.delete(notificationId);
      showToast(I18n.getLocale() === 'en' ? 'Notification deleted' : '通知已刪除');
      this.closeModal('notificationDetailModal');
      this.currentNotifications = Array.isArray(this.currentNotifications)
        ? this.currentNotifications.filter(item => item.notificationId !== notificationId)
        : [];
      this.loadNotifications();
    } catch (error) {
      console.error('Delete notification error:', error);
      showToast(t('moodleNotification.actionFailed'));
    }
  },

  /**
   * 標記全部已讀
   */
  async markAllNotificationsRead() {
    try {
      await API.notifications.markAllAsRead();
      showToast(t('moodleNotification.allRead'));
      this.loadNotifications();
    } catch (error) {
      showToast(t('moodleNotification.actionFailed'));
    }
  },

  /**
   * 刪除已讀通知
   */
  async deleteReadNotifications() {
    try {
      await API.notifications.deleteAllRead();
      showToast(t('moodleNotification.readDeleted'));
      this.loadNotifications();
    } catch (error) {
      showToast(t('moodleNotification.actionFailed'));
    }
  },

  // ==================== 增強版成績簿管理 ====================

  currentGradebookCourseId: null,
  currentTeacherAnalyticsCourseId: null,

  getAnalyticsRiskMeta(level = '') {
    const normalized = String(level || '').toLowerCase();
    const isEnglish = I18n.getLocale() === 'en';
    const metaMap = {
      high: { label: isEnglish ? 'High risk' : '高風險', toneClass: 'is-danger' },
      medium: { label: isEnglish ? 'Needs attention' : '需留意', toneClass: 'is-warning' },
      low: { label: isEnglish ? 'Watch list' : '觀察名單', toneClass: 'is-neutral' }
    };
    return metaMap[normalized] || { label: isEnglish ? 'Stable' : '穩定', toneClass: 'is-success' };
  },

  renderAnalyticsRiskBadge(level = '') {
    const meta = this.getAnalyticsRiskMeta(level);
    return `<span class="management-status-badge ${meta.toneClass}">${this.escapeText(meta.label)}</span>`;
  },

  /**
   * 開啟教師學習分析頁面
   */
  async openTeacherAnalytics(courseId) {
    if (!courseId) {
      courseId = this.currentCourseId || this.currentTeacherAnalyticsCourseId;
      if (!courseId) {
        const container = document.getElementById('teacherAnalyticsContent');
        if (!container) return;
        if (!this.ensureViewVisible('teacherAnalytics')) return;
        await this.renderCoursePicker(
          t('nav.analytics'),
          '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19h16"/><path d="M7 16V8"/><path d="M12 16V5"/><path d="M17 16v-3"/></svg>',
          'MoodleUI.openTeacherAnalytics',
          'teacherAnalyticsContent'
        );
        return;
      }
    }

    this.currentTeacherAnalyticsCourseId = courseId;
    const container = document.getElementById('teacherAnalyticsContent');
    if (!container) return;
    if (!this.ensureViewVisible('teacherAnalytics')) return;

    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    try {
      const [progressResult, atRiskResult, activityReportResult] = await Promise.all([
        API.teachers.getStudentProgress(courseId),
        API.teachers.getAtRiskStudents(courseId).catch(() => ({ success: false, data: null })),
        API.courseReports.getActivityReport(courseId).catch(() => ({ success: false, data: null }))
      ]);

      if (!progressResult.success) {
        container.innerHTML = `<div class="error">${this.escapeText(progressResult.message || t('common.loadFailed'))}</div>`;
        return;
      }

      container.innerHTML = this.renderTeacherAnalyticsPage(
        progressResult.data || {},
        atRiskResult.success ? (atRiskResult.data || {}) : {},
        courseId,
        activityReportResult.success ? (activityReportResult.data || {}) : {}
      );
      this.applyDynamicUiMetrics(container);
    } catch (error) {
      console.error('Open teacher analytics error:', error);
      container.innerHTML = `<div class="error">${I18n.getLocale() === 'en' ? 'Failed to load learning analytics.' : '學習分析載入失敗。'}</div>`;
    }
  },

  renderTeacherAnalyticsPage(progressData = {}, atRiskData = {}, courseId, activityReport = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    const students = Array.isArray(progressData.students) ? progressData.students : [];
    const atRiskStudents = Array.isArray(atRiskData.students) ? atRiskData.students : [];
    const courseTitle = progressData.courseTitle || atRiskData.courseTitle || (isEnglish ? 'Course analytics' : '課程學習分析');
    const avgProgress = Number(progressData.avgProgress || 0);
    const engagedCount = students.filter(student => Number(student.progress || 0) >= 80).length;
    const inactiveCount = students.filter(student => Number(student.inactiveDays || 0) >= 7).length;
    const riskSummary = atRiskData.summary || {};
    const topAlertCount = (riskSummary.high || 0) + (riskSummary.medium || 0);
    const learnerLabel = isEnglish ? 'Learner' : '學員';
    const progressLabel = isEnglish ? 'Progress' : '進度';
    const riskLabel = isEnglish ? 'Risk level' : '風險等級';
    const missingLabel = isEnglish ? 'Missing work' : '缺交作業';
    const lastActiveLabel = isEnglish ? 'Last active' : '最近活動';
    const alertsLabel = isEnglish ? 'Alerts' : '警示內容';
    const interactiveVideoActivities = Array.isArray(activityReport.activities)
      ? activityReport.activities.filter((activity) => activity.type === 'interactive_video')
      : [];
    const avgInteractiveWatch = interactiveVideoActivities.length > 0
      ? Math.round(interactiveVideoActivities.reduce((sum, activity) => sum + Number(activity.stats?.avgWatchPercent || 0), 0) / interactiveVideoActivities.length)
      : 0;
    const avgInteractiveScore = interactiveVideoActivities.length > 0
      ? Math.round(interactiveVideoActivities.reduce((sum, activity) => sum + Number(activity.stats?.avgScore || 0), 0) / interactiveVideoActivities.length)
      : 0;

    return `
      <div class="management-detail-page teacher-analytics-page">
        ${this.renderManagementDetailHeader({
          backAction: 'MoodleUI.openTeacherAnalytics()',
          backLabel: isEnglish ? 'Back to course list' : '返回課程列表',
          kicker: isEnglish ? 'Learning analytics' : '學習分析',
          title: courseTitle,
          subtitle: isEnglish
            ? 'Track learner progress, identify students who need attention, and move directly to the gradebook when you need to act.'
            : '集中查看整體進度、需要關注的學生，以及可直接採取行動的學習風險訊號。',
          actions: [
            {
              label: isEnglish ? 'Open gradebook' : '開啟成績簿',
              onclick: `MoodleUI.openGradebookManagement(${this.toInlineActionValue(courseId)})`,
              className: 'btn-primary btn-sm'
            }
          ]
        })}

        ${this.renderManagementMetricGrid([
          {
            value: students.length,
            label: isEnglish ? 'Learners' : '學員總數',
            helper: isEnglish ? 'roster size' : '目前課程名單',
            tone: 'tone-info'
          },
          {
            value: `${Math.round(avgProgress)}%`,
            label: isEnglish ? 'Average progress' : '平均進度',
            helper: isEnglish ? 'course-wide completion' : '課程整體完成度',
            tone: 'tone-warning'
          },
          {
            value: atRiskStudents.length,
            label: isEnglish ? 'At-risk learners' : '高風險學生',
            helper: isEnglish ? 'need follow-up' : '建議優先追蹤',
            tone: atRiskStudents.length > 0 ? 'tone-danger' : 'tone-info'
          },
          {
            value: engagedCount,
            label: isEnglish ? 'On-track learners' : '進度穩定',
            helper: isEnglish ? '80%+ progress' : '進度達 80% 以上',
            tone: 'tone-info'
          }
        ])}

        <div class="management-panel-grid teacher-analytics-spotlight-grid">
          <section class="management-panel teacher-analytics-panel">
            <h3>${isEnglish ? 'Course snapshot' : '課程快照'}</h3>
            <div class="management-kv-list">
              <div class="management-kv-item">
                <span class="management-kv-label">${isEnglish ? 'Latest average' : '目前平均'}</span>
                <span class="management-kv-value">${this.escapeText(`${Math.round(avgProgress)}%`)}</span>
              </div>
              <div class="management-kv-item">
                <span class="management-kv-label">${isEnglish ? 'Inactive 7+ days' : '7 天未上線'}</span>
                <span class="management-kv-value">${this.escapeText(String(inactiveCount))}</span>
              </div>
              <div class="management-kv-item">
                <span class="management-kv-label">${t('teacherAnalytics.openAlerts')}</span>
                <span class="management-kv-value">${this.escapeText(String(topAlertCount))}</span>
              </div>
            </div>
          </section>
          <section class="management-panel teacher-analytics-panel">
            <h3>${t('teacherAnalytics.riskBreakdown')}</h3>
            <div class="teacher-analytics-risk-summary">
              <span class="management-status-badge is-danger">${this.escapeText(t('teacherAnalytics.riskHigh', { count: riskSummary.high || 0 }))}</span>
              <span class="management-status-badge is-warning">${this.escapeText(t('teacherAnalytics.riskMedium', { count: riskSummary.medium || 0 }))}</span>
              <span class="management-status-badge is-neutral">${this.escapeText(t('teacherAnalytics.riskLow', { count: riskSummary.low || 0 }))}</span>
            </div>
            <div class="teacher-analytics-panel-note">${t('teacherAnalytics.riskNote')}</div>
          </section>
        </div>

        <div class="management-table-shell">
          <div class="management-table-heading">
            <h3>${isEnglish ? 'Learner progress' : '學生進度總覽'}</h3>
            <span class="management-status-badge is-accent">${this.escapeText(`${students.length} ${isEnglish ? 'learners' : '位學員'}`)}</span>
          </div>
          ${students.length === 0 ? `
            <div class="management-empty-preview">${isEnglish ? 'No learner progress is available for this course yet.' : '這門課目前還沒有可顯示的學生進度資料。'}</div>
          ` : `
            <table class="management-table">
              <thead>
                <tr>
                  <th>${learnerLabel}</th>
                  <th>${progressLabel}</th>
                  <th>${riskLabel}</th>
                  <th>${missingLabel}</th>
                  <th>${lastActiveLabel}</th>
                </tr>
              </thead>
              <tbody>
                ${students.map((student) => `
                  <tr>
                    <td data-label="${learnerLabel}">
                      <div class="management-inline-stack">
                        <strong>${this.escapeText(student.studentName || student.studentId || (isEnglish ? 'Learner' : '學員'))}</strong>
                        <span>${this.escapeText(student.studentEmail || student.studentId || '—')}</span>
                      </div>
                    </td>
                    <td data-label="${progressLabel}">
                      <div class="teacher-analytics-progress-cell">
                        <div class="teacher-analytics-progress-bar">
                          <div class="teacher-analytics-progress-fill" data-progress-width="${this.clampProgressValue(student.progress || 0)}"></div>
                        </div>
                        <span>${this.escapeText(`${Math.round(Number(student.progress || 0))}%`)}</span>
                      </div>
                    </td>
                    <td data-label="${riskLabel}">${this.renderAnalyticsRiskBadge(student.riskLevel)}</td>
                    <td data-label="${missingLabel}">${this.escapeText(String(student.missingAssignments || 0))}</td>
                    <td data-label="${lastActiveLabel}">${student.lastAccessedAt ? this.escapeText(this.formatPlatformDate(student.lastAccessedAt, { year: 'numeric', month: 'numeric', day: 'numeric' }) || '—') : this.escapeText(isEnglish ? 'Never' : '尚無紀錄')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="management-table-shell">
          <div class="management-table-heading">
            <h3>${isEnglish ? 'Students needing attention' : '需要關注的學生'}</h3>
            <span class="management-status-badge ${atRiskStudents.length > 0 ? 'is-danger' : 'is-success'}">${this.escapeText(`${atRiskStudents.length} ${isEnglish ? 'students' : '位學生'}`)}</span>
          </div>
          ${atRiskStudents.length === 0 ? `
            <div class="management-empty-preview">${isEnglish ? 'No at-risk learners detected right now.' : '目前沒有偵測到需要立即關注的高風險學生。'}</div>
          ` : `
            <table class="management-table">
              <thead>
                <tr>
                  <th>${learnerLabel}</th>
                  <th>${riskLabel}</th>
                  <th>${alertsLabel}</th>
                  <th>${progressLabel}</th>
                </tr>
              </thead>
              <tbody>
                ${atRiskStudents.map((student) => `
                  <tr>
                    <td data-label="${learnerLabel}">
                      <div class="management-inline-stack">
                        <strong>${this.escapeText(student.studentName || student.studentId || (isEnglish ? 'Learner' : '學員'))}</strong>
                        <span>${this.escapeText(student.studentEmail || student.studentId || '—')}</span>
                      </div>
                    </td>
                    <td data-label="${riskLabel}">${this.renderAnalyticsRiskBadge(student.riskLevel)}</td>
                    <td data-label="${alertsLabel}">
                      <div class="teacher-analytics-alert-list">
                        ${(Array.isArray(student.alerts) ? student.alerts : []).map((alert) => `
                          <span class="teacher-analytics-alert-chip ${alert.severity === 'high' ? 'is-danger' : 'is-warning'}">${this.escapeText(alert.message || alert.type || '—')}</span>
                        `).join('')}
                      </div>
                    </td>
                    <td data-label="${progressLabel}">${this.escapeText(`${Math.round(Number(student.progress || 0))}%`)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="management-table-shell">
          <div class="management-table-heading">
            <h3>${isEnglish ? 'Interactive video performance' : '互動影片學習表現'}</h3>
            <span class="management-status-badge is-accent">${this.escapeText(`${interactiveVideoActivities.length} ${isEnglish ? 'activities' : '個活動'}`)}</span>
          </div>
          ${interactiveVideoActivities.length === 0 ? `
            <div class="management-empty-preview">${isEnglish ? 'No graded interactive videos have been added to this course yet.' : '這門課目前還沒有可分析的互動影片活動。'}</div>
          ` : `
            <div class="management-metric-grid">
              ${this.renderManagementMetricGrid([
                {
                  value: `${avgInteractiveWatch}%`,
                  label: isEnglish ? 'Average watch rate' : '平均觀看比例',
                  helper: isEnglish ? 'across interactive videos' : '互動影片整體觀看率',
                  tone: 'tone-info'
                },
                {
                  value: `${avgInteractiveScore}%`,
                  label: isEnglish ? 'Average score' : '平均得分',
                  helper: isEnglish ? 'graded prompts only' : '只計算有分數的題目',
                  tone: 'tone-warning'
                }
              ])}
            </div>
            <table class="management-table">
              <thead>
                <tr>
                  <th>${isEnglish ? 'Interactive video' : '互動影片'}</th>
                  <th>${isEnglish ? 'Prompts' : '題目數'}</th>
                  <th>${isEnglish ? 'Attempt rate' : '開始率'}</th>
                  <th>${isEnglish ? 'Completion rate' : '完成率'}</th>
                  <th>${isEnglish ? 'Avg watch' : '平均觀看'}</th>
                  <th>${isEnglish ? 'Avg score' : '平均得分'}</th>
                </tr>
              </thead>
              <tbody>
                ${interactiveVideoActivities.map((activity) => `
                  <tr>
                    <td data-label="${isEnglish ? 'Interactive video' : '互動影片'}">
                      <div class="management-inline-stack">
                        <strong>${this.escapeText(activity.title || (isEnglish ? 'Interactive video' : '互動影片'))}</strong>
                        <span>${this.escapeText((activity.maxGrade || 0) > 0 ? `${activity.maxGrade} ${isEnglish ? 'pts' : '分'}` : (isEnglish ? 'Practice activity' : '練習活動'))}</span>
                      </div>
                    </td>
                    <td data-label="${isEnglish ? 'Prompts' : '題目數'}">${this.escapeText(String(activity.promptCount || 0))}</td>
                    <td data-label="${isEnglish ? 'Attempt rate' : '開始率'}">${this.escapeText(`${Math.round(Number(activity.stats?.attemptRate || 0))}%`)}</td>
                    <td data-label="${isEnglish ? 'Completion rate' : '完成率'}">${this.escapeText(`${Math.round(Number(activity.stats?.completionRate || 0))}%`)}</td>
                    <td data-label="${isEnglish ? 'Avg watch' : '平均觀看'}">${activity.stats?.avgWatchPercent != null ? this.escapeText(`${Math.round(Number(activity.stats.avgWatchPercent))}%`) : '—'}</td>
                    <td data-label="${isEnglish ? 'Avg score' : '平均得分'}">${activity.stats?.avgScore != null ? this.escapeText(`${Math.round(Number(activity.stats.avgScore))}%`) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
  },

  /**
   * 開啟完整成績簿管理頁面（教師專用）
   */
  async openGradebookManagement(courseId) {
    if (!courseId) {
      courseId = this.currentCourseId || this.currentGradebookCourseId;
      if (!courseId) {
        const container = document.getElementById('gradebookManagementContent');
        if (!container) return;
        if (!this.ensureViewVisible('gradebookManagement')) return;
        container.innerHTML = `<div class="loading">${t('moodleGradebook.loadingCourses')}</div>`;
        try {
          const isEnglish = I18n.getLocale() === 'en';
          const courses = await this.getRoleScopedCourses({ manageOnly: true });
          container.innerHTML = `
            <div class="activity-picker-page">
              <div class="activity-picker-header">
                <div class="activity-picker-title">
                  <div class="activity-picker-icon">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v4H3z"/><path d="M7 7v13"/><path d="M17 7v13"/><path d="M7 12h10"/><path d="M7 17h10"/></svg>
                  </div>
                  <div class="activity-picker-copy">
                    <h2>${t('moodleGradebook.title')}</h2>
                    <p>${t('moodleGradebook.selectCourse')}</p>
                    <div class="activity-shell-meta">
                      <span class="activity-chip">${courses.length} ${isEnglish ? 'courses' : '門課程'}</span>
                    </div>
                  </div>
                </div>
              </div>
              ${courses.length === 0 ? this.renderActivityEmptyState({
                icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
                title: t('moodleGradebook.noCourses'),
                hint: isEnglish ? 'Assign or create a course to open gradebook management.' : '請先加入或建立課程，再開啟成績簿管理。'
              }) : `
                <div class="activity-picker-grid">
                  ${courses.map(c => this.renderActivityPickerCard(c, {
                    action: `MoodleUI.openGradebookManagement(${this.toInlineActionValue(c.courseId || c.id)})`,
                    ctaLabel: isEnglish ? 'Open gradebook' : '查看成績簿',
                    summary: this.truncateText(c.summary || c.description || '', 120) || (isEnglish ? 'Track grading progress, categories and exports for this course.' : '查看這門課的成績項目、類別與匯出資料。'),
                    footerLabel: c.instructorName || c.teacherName || (isEnglish ? 'Teaching team' : '教學團隊')
                  })).join('')}
                </div>
              `}
            </div>`;
        } catch (error) {
          container.innerHTML = `<div class="error">${t('moodleGradebook.loadCourseFailed')}</div>`;
        }
        return;
      }
    }
    this.currentGradebookCourseId = courseId;
    const container = document.getElementById('gradebookManagementContent');
    if (!container) return;

    if (!this.ensureViewVisible('gradebookManagement')) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    try {
      const [gradebookResult, categoriesResult, settingsResult] = await Promise.all([
        API.gradebook.getCourseGradebook(courseId),
        API.gradebookEnhanced.getCategories(courseId),
        API.gradebookEnhanced.getSettings(courseId)
      ]);

      if (!gradebookResult.success) {
        container.innerHTML = `<div class="error">${t('moodleGradebook.loadFailed')}</div>`;
        return;
      }

      const gradebook = gradebookResult.data;
      const categories = categoriesResult.success ? categoriesResult.data : [];
      const settings = settingsResult.success ? settingsResult.data : {};

      container.innerHTML = this.renderFullGradebookManagement(gradebook, categories, settings, courseId);
    } catch (error) {
      console.error('Open gradebook management error:', error);
      container.innerHTML = `<div class="error">${t('moodleGradebook.loadFailed')}</div>`;
    }
  },

  /**
   * 渲染完整成績簿管理界面
   */
  renderFullGradebookManagement(gradebook, categories, settings, courseId) {
    const items = gradebook.columns || gradebook.items || [];
    const manualItems = items.filter(item => item.type === 'manual');
    const students = (gradebook.students || []).map(s => {
      if (s.grades && !Array.isArray(s.grades)) {
        s.grades = items.map(item => ({
          score: s.grades[item.id]?.grade ?? null,
          feedback: s.grades[item.id]?.feedback || '',
          submitted: s.grades[item.id]?.submitted || false
        }));
      }
      return s;
    });

    const scaleType = settings.gradingScale || 'letter_5';
    const passGrade = Number(gradebook.course?.passingGrade ?? settings.gradeToPass ?? 60);

    return `
      <div class="gradebook-management" data-grade-scale="${this.escapeText(scaleType)}" data-grade-to-pass="${passGrade}">
        <div class="gradebook-header">
          <button onclick="return openPlatformView(event, 'moodleGradebook')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            ${t('moodleGradebook.back')}
          </button>
          <h1>${t('moodleGradebook.title')}</h1>
        </div>

        <!-- 工具列 -->
        <div class="gradebook-toolbar">
          <div class="toolbar-left">
            <button onclick="MoodleUI.openManualGradeItemModal('${courseId}')" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              ${I18n.getLocale() === 'en' ? 'Add Manual Item' : '新增手動項目'}
            </button>
            <button onclick="MoodleUI.openGradeCategoryModal('${courseId}')" class="btn-secondary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              ${t('moodleGradebook.categoryMgmt')}
            </button>
            <button onclick="MoodleUI.openGradeSettingsModal('${courseId}')" class="btn-secondary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4"/>
              </svg>
              ${t('moodleGradebook.gradeSettings')}
            </button>
          </div>
          <div class="toolbar-right">
            <button onclick="MoodleUI.exportGradesCSV('${courseId}')" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              ${t('moodleGradebook.exportCsv')}
            </button>
            <button onclick="MoodleUI.exportGradesExcel('${courseId}')" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              ${t('moodleGradebook.exportExcel')}
            </button>
          </div>
        </div>

        <!-- 成績類別摘要 -->
        ${categories.length > 0 ? `
          <div class="grade-categories-summary">
            <h3>${t('moodleGradebook.gradeCategories')}</h3>
            <div class="categories-grid">
              ${categories.map(cat => `
                <div class="category-card">
                  <div class="category-name">${cat.name}</div>
                  <div class="category-weight">${cat.weight}% ${t('moodleGradebook.weightSuffix')}</div>
                  <div class="category-items">${cat.itemCount || 0} ${t('moodleGradebook.itemsSuffix')}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 成績統計 -->
        <div class="gradebook-stats">
          <div class="stat-card tone-olive">
            <div class="stat-eyebrow">${I18n.getLocale() === 'en' ? 'Learners' : '學員'}</div>
            <div class="stat-value">${students.length}</div>
            <div class="stat-label">${t('moodleGradebook.studentCount')}</div>
          </div>
          <div class="stat-card tone-violet">
            <div class="stat-eyebrow">${I18n.getLocale() === 'en' ? 'Items' : '項目'}</div>
            <div class="stat-value">${items.length}</div>
            <div class="stat-label">${t('moodleGradebook.gradeItems')}</div>
          </div>
          <div class="stat-card tone-sky">
            <div class="stat-eyebrow">${I18n.getLocale() === 'en' ? 'Average' : '平均'}</div>
            <div class="stat-value">${(gradebook.stats?.averageGrade ?? gradebook.classAverage) != null ? (gradebook.stats?.averageGrade ?? gradebook.classAverage).toFixed(1) : '-'}</div>
            <div class="stat-label">${t('moodleGradebook.classAverage')}</div>
          </div>
          <div class="stat-card tone-gold">
            <div class="stat-eyebrow">${I18n.getLocale() === 'en' ? 'Performance' : '表現'}</div>
            <div class="stat-value">${gradebook.stats?.passingRate != null ? gradebook.stats.passingRate + '%' : (gradebook.highestScore || '-')}</div>
            <div class="stat-label">${t('moodleGradebook.highestScore')}</div>
          </div>
        </div>

        <div class="grade-categories-summary">
          <div class="section-title-row">
            <h3>${I18n.getLocale() === 'en' ? 'Manual Grade Items' : '手動評分項目'}</h3>
          </div>
          ${manualItems.length === 0 ? this.renderActivityEmptyState({
            icon: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 11h6"/><path d="M12 8v6"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>',
            title: I18n.getLocale() === 'en' ? 'No manual items yet' : '尚未建立手動項目',
            hint: I18n.getLocale() === 'en' ? 'Use manual items for participation, attendance, presentations, or other custom grading.' : '可用於課堂參與、出缺席、口頭報告等自訂評分項目。'
          }) : `
          <div class="badge-table-shell">
            <table class="rubric-table">
              <thead>
                <tr>
                  <th>${I18n.getLocale() === 'en' ? 'Item' : '項目'}</th>
                  <th>${t('common.description')}</th>
                  <th>${t('moodleRubrics.maxScore')}</th>
                  <th>${t('moodleGradebook.weightSuffix')}</th>
                  <th>${I18n.getLocale() === 'en' ? 'Due date' : '截止日期'}</th>
                  <th>${t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${manualItems.map(item => `
                  <tr>
                    <td>${this.escapeText(item.title || t('common.unnamed'))}</td>
                    <td>${this.escapeText(item.description || t('common.noDescription'))}</td>
                    <td>${Number(item.maxGrade || item.maxScore || 0)}</td>
                    <td>${item.weight != null ? `${Number(item.weight)}%` : '—'}</td>
                    <td>${item.dueDate ? this.escapeText(this.formatPlatformDate(item.dueDate, { dateStyle: 'medium', timeStyle: 'short' })) : '—'}</td>
                    <td class="table-action-cell">
                      <button onclick="MoodleUI.openManualGradeItemModal('${courseId}', '${item.itemId || item.id}')" class="btn-sm">${t('common.edit')}</button>
                      <button onclick="MoodleUI.deleteManualGradeItem('${courseId}', '${item.itemId || item.id}')" class="btn-sm btn-danger">${t('common.delete')}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          `}
        </div>

        <!-- 成績表格 -->
        <div class="gradebook-table-container">
          <div class="gradebook-table-wrapper">
            <table class="gradebook-table editable">
              <thead>
                <tr>
                  <th class="sticky-col student-col">
                    ${t('moodleGradebook.studentCol')}
                    <button onclick="MoodleUI.sortGradebook('name')" class="sort-btn">↕</button>
                  </th>
                  ${items.map(item => `
                    <th class="item-header" data-item-id="${item.itemId || item.id}">
                      <div class="item-name">${item.name || item.title}</div>
                      <div class="item-meta">${item.maxScore || item.maxGrade || 0} ${t('moodleGradebook.pointsSuffix')}</div>
                      ${item.category ? `<div class="item-category">${item.category}</div>` : ''}
                    </th>
                  `).join('')}
                  <th class="total-col">
                    ${t('moodleGradebook.totalCol')}
                    <button onclick="MoodleUI.sortGradebook('total')" class="sort-btn">↕</button>
                  </th>
                  <th class="letter-col">${t('moodleGradebook.letterCol')}</th>
                </tr>
              </thead>
              <tbody>
                ${students.map(student => `
                  <tr data-student-id="${student.userId}">
                    <td class="sticky-col student-col">
                      <div class="student-info">
                        <div class="student-avatar">${this.escapeText(((student.name || 'U').trim().charAt(0) || 'U').toUpperCase())}</div>
                        <div>
                          <strong>${this.escapeText(student.name || (I18n.getLocale() === 'en' ? 'Learner' : '學習者'))}</strong>
                          <small>${this.escapeText(student.email || student.userId || '')}</small>
                        </div>
                      </div>
                    </td>
                    ${(student.grades || []).map((g, idx) => {
                      const item = items[idx] || {};
                      const isEditable = item.type === 'manual';
                      return `
                      <td class="grade-cell ${g.score === null ? 'not-graded' : ''} ${isEditable ? 'is-editable' : ''}"
                          data-item-id="${item.itemId || item.id || ''}"
                          data-item-type="${item.type || ''}"
                          data-max-grade="${Number(item.maxGrade || item.maxScore || 0)}"
                          data-student-id="${student.userId}"
                          data-editable="${isEditable ? 'true' : 'false'}"
                          ${isEditable ? 'ondblclick="MoodleUI.editGradeCell(this)"' : `title="${I18n.getLocale() === 'en' ? 'Assignment and quiz grades are managed from their own grading flows.' : '作業與測驗成績需在各自的評分流程中調整。'}"`}>
                        <span class="grade-value">${g.score !== null ? g.score : '-'}</span>
                        ${g.feedback ? `<span class="has-feedback" title="${t('moodleGradebook.hasFeedback')}">💬</span>` : ''}
                      </td>
                    `;
                    }).join('')}
                    <td class="total-cell">
                      <strong>${(student.total ?? student.summary?.overallPercentage) != null ? (student.total ?? student.summary?.overallPercentage).toFixed(1) : '-'}</strong>
                    </td>
                    <td class="letter-cell">
                      <span class="letter-grade ${this.getLetterGradeClass(student.letterGrade || this.getLetterGradeLabelForPercentage(student.summary?.overallPercentage, scaleType))}">${student.letterGrade || this.getLetterGradeLabelForPercentage(student.summary?.overallPercentage, scaleType)}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 成績等級對應表 -->
        <div class="grade-scale-info">
          <h3>${t('moodleGradebook.gradeScale')}</h3>
          <div class="scale-items">
            ${this.getGradeScaleLegend(scaleType).map(scale => `
              <div class="scale-item">
                <span class="letter-grade ${this.getLetterGradeClass(scale.letter)}">${scale.letter}</span>
                <span class="score-range">${scale.minScore} - ${scale.maxScore}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 取得等級顏色類別
   */
  getLetterGradeClass(letter) {
    const classes = {
      'A': 'grade-a', 'A+': 'grade-a', 'A-': 'grade-a',
      'B': 'grade-b', 'B+': 'grade-b', 'B-': 'grade-b',
      'C': 'grade-c', 'C+': 'grade-c', 'C-': 'grade-c',
      'D': 'grade-d', 'D+': 'grade-d', 'D-': 'grade-d',
      'F': 'grade-f',
      '優': 'grade-a', '甲': 'grade-b', '乙': 'grade-c', '丙': 'grade-d', '丁': 'grade-f'
    };
    return classes[letter] || '';
  },

  getLetterGradeLabelForPercentage(percentage, scaleType = 'letter_5') {
    const value = Number(percentage);
    if (!Number.isFinite(value)) return '-';

    if (scaleType === 'letter_7') {
      if (value >= 95) return 'A+';
      if (value >= 90) return 'A';
      if (value >= 85) return 'B+';
      if (value >= 80) return 'B';
      if (value >= 75) return 'C+';
      if (value >= 70) return 'C';
      if (value >= 60) return 'D';
      return 'F';
    }

    if (scaleType === 'taiwan_100') {
      if (value >= 90) return '優';
      if (value >= 80) return '甲';
      if (value >= 70) return '乙';
      if (value >= 60) return '丙';
      return '丁';
    }

    if (value >= 90) return 'A';
    if (value >= 80) return 'B';
    if (value >= 70) return 'C';
    if (value >= 60) return 'D';
    return 'F';
  },

  getGradeScaleLegend(scaleType = 'letter_5') {
    if (scaleType === 'letter_7') {
      return [
        { letter: 'A+', minScore: 95, maxScore: 100 },
        { letter: 'A', minScore: 90, maxScore: 94 },
        { letter: 'B+', minScore: 85, maxScore: 89 },
        { letter: 'B', minScore: 80, maxScore: 84 },
        { letter: 'C+', minScore: 75, maxScore: 79 },
        { letter: 'C', minScore: 70, maxScore: 74 },
        { letter: 'D', minScore: 60, maxScore: 69 },
        { letter: 'F', minScore: 0, maxScore: 59 }
      ];
    }

    if (scaleType === 'taiwan_100') {
      return [
        { letter: '優', minScore: 90, maxScore: 100 },
        { letter: '甲', minScore: 80, maxScore: 89 },
        { letter: '乙', minScore: 70, maxScore: 79 },
        { letter: '丙', minScore: 60, maxScore: 69 },
        { letter: '丁', minScore: 0, maxScore: 59 }
      ];
    }

    return [
      { letter: 'A', minScore: 90, maxScore: 100 },
      { letter: 'B', minScore: 80, maxScore: 89 },
      { letter: 'C', minScore: 70, maxScore: 79 },
      { letter: 'D', minScore: 60, maxScore: 69 },
      { letter: 'F', minScore: 0, maxScore: 59 }
    ];
  },

  /**
   * 編輯成績儲存格
   */
  editGradeCell(cell) {
    if (cell.dataset.editable !== 'true') {
      showToast(I18n.getLocale() === 'en' ? 'This grade is managed from its original activity.' : '這個成績需回到原始活動中調整。');
      return;
    }
    if (cell.querySelector('input')) return;

    const currentValue = cell.querySelector('.grade-value').textContent;
    const itemId = cell.dataset.itemId;
    const studentId = cell.dataset.studentId;

    cell.innerHTML = `
      <input type="number" class="grade-input" value="${currentValue !== '-' ? currentValue : ''}"
             min="0" step="0.5"
             onblur="MoodleUI.saveGradeCell(this, '${itemId}', '${studentId}')"
             onkeydown="if(event.key==='Enter') this.blur(); if(event.key==='Escape') MoodleUI.cancelEditGradeCell(this, '${currentValue}');">
    `;
    cell.querySelector('input').focus();
    cell.querySelector('input').select();
  },

  /**
   * 儲存成績
   */
  async saveGradeCell(input, itemId, studentId) {
    const newValue = input.value.trim();
    const cell = input.parentElement;
    const courseId = this.currentGradebookCourseId;

    try {
      const result = await API.gradebook.updateGrade(
        courseId,
        itemId,
        { grades: [{ studentId, grade: newValue ? parseFloat(newValue) : null }] }
      );

      if (result.success) {
        cell.innerHTML = `<span class="grade-value">${newValue || '-'}</span>`;
        cell.classList.toggle('not-graded', !newValue);
        showToast(t('moodleGrade.updated'));
        await this.openGradebookManagement(courseId);
      } else {
        showToast(result.message || t('common.updateFailed'));
        cell.innerHTML = `<span class="grade-value">${input.defaultValue || '-'}</span>`;
      }
    } catch (error) {
      console.error('Save grade error:', error);
      showToast(t('common.updateFailed'));
      cell.innerHTML = `<span class="grade-value">${input.defaultValue || '-'}</span>`;
    }
  },

  /**
   * 取消編輯
   */
  cancelEditGradeCell(input, originalValue) {
    const cell = input.parentElement;
    cell.innerHTML = `<span class="grade-value">${originalValue}</span>`;
  },

  /**
   * 重新計算學生總分
   */
  async recalculateStudentTotal(studentId) {
    const row = document.querySelector(`tr[data-student-id="${studentId}"]`);
    if (!row) return;
    const gradeCells = Array.from(row.querySelectorAll('.grade-cell'));
    let totalEarned = 0;
    let totalPossible = 0;

    gradeCells.forEach(cell => {
      const score = Number(cell.querySelector('.grade-value')?.textContent);
      const maxGrade = Number(cell.dataset.maxGrade || 0);
      if (Number.isFinite(score)) {
        totalEarned += score;
        if (Number.isFinite(maxGrade) && maxGrade > 0) {
          totalPossible += maxGrade;
        }
      }
    });

    const percentage = totalPossible > 0
      ? Math.round((totalEarned / totalPossible) * 1000) / 10
      : null;
    const managementRoot = document.querySelector('.gradebook-management');
    const scaleType = managementRoot?.dataset.gradeScale || 'letter_5';
    const totalCell = row.querySelector('.total-cell strong');
    if (totalCell) {
      totalCell.textContent = percentage !== null ? percentage.toFixed(1) : '-';
    }

    const letterCell = row.querySelector('.letter-cell .letter-grade');
    if (letterCell) {
      const letter = this.getLetterGradeLabelForPercentage(percentage, scaleType);
      letterCell.textContent = letter;
      letterCell.className = `letter-grade ${this.getLetterGradeClass(letter)}`.trim();
    }
  },

  /**
   * 匯出 CSV 成績
   */
  async exportGradesCSV(courseId) {
    try {
      const result = await API.gradebookEnhanced.exportGrades(courseId, 'csv');
      const csvContent = result?.data?.csv;
      if (result.success && typeof csvContent === 'string' && csvContent.trim()) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grades_${courseId}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('moodleGradebook.csvExported'));
      } else {
        showToast(t('moodleGradebook.exportFailed'));
      }
    } catch (error) {
      console.error('Export CSV error:', error);
      showToast(t('moodleGradebook.exportFailed'));
    }
  },

  /**
   * 匯出 Excel 成績
   */
  async exportGradesExcel(courseId) {
    try {
      const table = document.querySelector('#gradebookManagementContent .gradebook-table');
      if (!table) {
        showToast(t('moodleGradebook.exportFailed'));
        return;
      }

      const excelHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="UTF-8">
          </head>
          <body>${table.outerHTML}</body>
        </html>
      `;
      const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grades_${courseId}_${new Date().toISOString().split('T')[0]}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('moodleGradebook.excelExported'));
    } catch (error) {
      console.error('Export Excel error:', error);
      showToast(t('moodleGradebook.exportFailed'));
    }
  },

  /**
   * 開啟成績類別管理 Modal
   */
  async openGradeCategoryModal(courseId) {
    this.closeModal('gradeCategoryModal');
    const modal = document.createElement('div');
    modal.id = 'gradeCategoryModal';
    modal.className = 'modal-overlay active';

    try {
      const result = await API.gradebookEnhanced.getCategories(courseId);
      const categories = result.success
        ? (Array.isArray(result.data) ? result.data : (result.data?.categories || []))
        : [];

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>${t('moodleGradeCategory.title')}</h3>
            <button onclick="MoodleUI.closeModal('gradeCategoryModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="category-list">
              ${categories.map(cat => `
                <div class="category-item" data-category-id="${cat.categoryId}">
                  <div class="category-info">
                    <span class="category-name">${cat.name}</span>
                    ${cat.isDefault ? `<span class="status-chip neutral">${I18n.getLocale() === 'en' ? 'Built-in' : '預設'}</span>` : ''}
                    <span class="category-weight">${cat.weight}%</span>
                  </div>
                  <div class="category-actions">
                    <button onclick="MoodleUI.editGradeCategory('${courseId}', '${cat.categoryId}')" class="btn-sm">${t('moodleGradeCategory.edit')}</button>
                    ${cat.isDefault ? '' : `<button onclick="MoodleUI.deleteGradeCategory('${courseId}', '${cat.categoryId}')" class="btn-sm btn-danger">${t('moodleGradeCategory.delete')}</button>`}
                  </div>
                </div>
              `).join('')}
              ${categories.length === 0 ? this.renderActivityEmptyState({
                icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
                title: t('moodleGradeCategory.noCategories')
              }) : ''}
            </div>
            <hr>
            <h4>${t('moodleGradeCategory.addTitle')}</h4>
            <div class="form-row">
              <div class="form-group">
                <label>${t('moodleGradeCategory.nameLabel')}</label>
                <input type="text" id="newCategoryName" placeholder="${t('moodleGradeCategory.namePlaceholder')}">
              </div>
              <div class="form-group">
                <label>${t('moodleGradeCategory.weightLabel')}</label>
                <input type="number" id="newCategoryWeight" min="0" max="100" value="10">
              </div>
              <button onclick="MoodleUI.createGradeCategory('${courseId}')" class="btn-primary">${t('common.add')}</button>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('gradeCategoryModal')" class="btn-secondary">${t('common.close')}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('gradeCategoryModal'); };
    } catch (error) {
      console.error('Open grade category modal error:', error);
      showToast(t('moodleGradeCategory.loadFailed'));
    }
  },

  /**
   * 建立成績類別
   */
  async createGradeCategory(courseId) {
    const name = document.getElementById('newCategoryName').value.trim();
    const weight = document.getElementById('newCategoryWeight').value;

    if (!name) {
      showToast(t('moodleGradeCategory.nameRequired'));
      return;
    }

    try {
      const result = await API.gradebookEnhanced.createCategory(courseId, { name, weight: parseFloat(weight) });
      if (result.success) {
        showToast(t('moodleGradeCategory.created'));
        this.closeModal('gradeCategoryModal');
        this.openGradeCategoryModal(courseId);
      } else {
        showToast(result.message || t('common.createFailed'));
      }
    } catch (error) {
      console.error('Create category error:', error);
      showToast(t('common.createFailed'));
    }
  },

  /**
   * 刪除成績類別
   */
  async deleteGradeCategory(courseId, categoryId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleGradeCategory.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.gradebookEnhanced.deleteCategory(courseId, categoryId);
      if (result.success) {
        showToast(t('moodleGradeCategory.deleted'));
        this.openGradeCategoryModal(courseId);
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete category error:', error);
      showToast(t('common.deleteFailed'));
    }
  },

  /**
   * 開啟成績設定 Modal
   */
  async openGradeSettingsModal(courseId) {
    this.closeModal('gradeSettingsModal');
    const modal = document.createElement('div');
    modal.id = 'gradeSettingsModal';
    modal.className = 'modal-overlay active';

    try {
      const result = await API.gradebookEnhanced.getSettings(courseId);
      const settings = result.success
        ? (result.data?.settings || result.data || {})
        : {};
      const isEnglish = I18n.getLocale() === 'en';
      const scaleOptions = Array.isArray(settings.availableScales) && settings.availableScales.length > 0
        ? settings.availableScales
        : [
            { id: 'letter_5', name: isEnglish ? 'A-F Letter' : 'A-F 等級' },
            { id: 'letter_7', name: isEnglish ? 'A+ to F' : 'A+ 到 F' },
            { id: 'taiwan_100', name: isEnglish ? 'Taiwan scale' : '台灣百分等第' }
          ];

      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>${t('moodleGradeSettings.title')}</h3>
            <button onclick="MoodleUI.closeModal('gradeSettingsModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>${isEnglish ? 'Passing grade' : '及格分數'}</label>
              <input type="number" id="gradeToPass" min="0" max="100" value="${Number(settings.gradeToPass ?? 60)}">
            </div>
            <div class="form-group">
              <label>${isEnglish ? 'Grade scale' : '評分等第'}</label>
              <select id="gradingScale">
                ${scaleOptions.map(scale => `
                  <option value="${scale.id}" ${(settings.gradingScale || 'letter_5') === scale.id ? 'selected' : ''}>${this.escapeText(scale.name)}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="showGradesImmediately" ${settings.showGradesImmediately !== false ? 'checked' : ''}>
                ${isEnglish ? 'Show grades to learners immediately' : '評分完成後立即顯示給學員'}
              </label>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="weightedCategories" ${settings.weightedCategories ? 'checked' : ''}>
                ${isEnglish ? 'Use weighted categories' : '啟用加權類別'}
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('gradeSettingsModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button onclick="MoodleUI.saveGradeSettings('${courseId}')" class="btn-primary">${t('moodleGradeSettings.save')}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('gradeSettingsModal'); };
    } catch (error) {
      console.error('Open grade settings modal error:', error);
      showToast(t('moodleGradeSettings.loadFailed'));
    }
  },

  /**
   * 儲存成績設定
   */
  async saveGradeSettings(courseId) {
    const settings = {
      gradeToPass: parseFloat(document.getElementById('gradeToPass').value) || 0,
      gradingScale: document.getElementById('gradingScale').value,
      showGradesImmediately: document.getElementById('showGradesImmediately').checked,
      weightedCategories: document.getElementById('weightedCategories').checked
    };

    try {
      const result = await API.gradebookEnhanced.updateSettings(courseId, settings);
      if (result.success) {
        showToast(t('moodleGradeSettings.saved'));
        this.closeModal('gradeSettingsModal');
        this.openGradebookManagement(courseId);
      } else {
        showToast(result.message || t('moodleGradeSettings.saveFailed'));
      }
    } catch (error) {
      console.error('Save grade settings error:', error);
      showToast(t('moodleGradeSettings.saveFailed'));
    }
  },

  async openManualGradeItemModal(courseId, itemId = null) {
    this.closeModal('manualGradeItemModal');
    const modal = document.createElement('div');
    modal.id = 'manualGradeItemModal';
    modal.className = 'modal-overlay active';

    let existingItem = null;
    if (itemId) {
      const itemsResult = await API.gradebook.getItems(courseId).catch(() => ({ success: false }));
      const items = itemsResult?.success
        ? (Array.isArray(itemsResult.data) ? itemsResult.data : (itemsResult.data?.items || []))
        : [];
      existingItem = items.find(item => (item.itemId || item.id) === itemId) || null;
    }

    const categoriesResult = await API.gradebookEnhanced.getCategories(courseId).catch(() => ({ success: false }));
    const categories = categoriesResult?.success ? categoriesResult.data : [];
    const isEditing = !!existingItem;

    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${isEditing ? (t('common.edit') + ' ' + (I18n.getLocale() === 'en' ? 'Manual Item' : '手動項目')) : (I18n.getLocale() === 'en' ? 'Create Manual Grade Item' : '建立手動評分項目')}</h3>
          <button onclick="MoodleUI.closeModal('manualGradeItemModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="manualGradeItemId" value="${this.escapeText(existingItem?.itemId || existingItem?.id || '')}">
          <div class="form-group">
            <label>${I18n.getLocale() === 'en' ? 'Item name' : '項目名稱'} *</label>
            <input type="text" id="manualGradeItemTitle" value="${this.escapeText(existingItem?.title || '')}" placeholder="${I18n.getLocale() === 'en' ? 'Attendance, participation, presentation...' : '例如：出席、參與、報告'}">
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="manualGradeItemDescription" rows="3" placeholder="${I18n.getLocale() === 'en' ? 'Describe how this manual item is graded.' : '描述這個手動項目的評分方式。'}">${this.escapeText(existingItem?.description || '')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleRubrics.maxScore')} *</label>
              <input type="number" id="manualGradeItemMaxGrade" min="0" step="0.1" value="${Number(existingItem?.maxGrade || existingItem?.maxScore || 100)}">
            </div>
            <div class="form-group">
              <label>${t('moodleGradebook.weightSuffix')}</label>
              <input type="number" id="manualGradeItemWeight" min="0" max="100" step="0.1" value="${existingItem?.weight ?? ''}" placeholder="${I18n.getLocale() === 'en' ? 'Optional' : '選填'}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleGradebook.categoryMgmt')}</label>
              <select id="manualGradeItemCategory">
                <option value="default_participation">${I18n.getLocale() === 'en' ? 'Default category' : '預設類別'}</option>
                ${categories.map(category => `
                  <option value="${this.escapeText(category.categoryId)}" ${(existingItem?.categoryId || '') === category.categoryId ? 'selected' : ''}>
                    ${this.escapeText(category.name)}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>${I18n.getLocale() === 'en' ? 'Due date' : '截止日期'}</label>
              <input type="datetime-local" id="manualGradeItemDueDate" value="${existingItem?.dueDate ? String(existingItem.dueDate).slice(0, 16) : ''}">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('manualGradeItemModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveManualGradeItem('${courseId}')" class="btn-primary">${isEditing ? t('common.save') : t('common.create')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.onclick = (event) => { if (event.target === modal) this.closeModal('manualGradeItemModal'); };
  },

  async saveManualGradeItem(courseId) {
    const itemId = document.getElementById('manualGradeItemId')?.value?.trim();
    const payload = {
      title: document.getElementById('manualGradeItemTitle')?.value?.trim(),
      description: document.getElementById('manualGradeItemDescription')?.value?.trim() || '',
      maxGrade: parseFloat(document.getElementById('manualGradeItemMaxGrade')?.value || 0),
      weight: document.getElementById('manualGradeItemWeight')?.value?.trim() || null,
      categoryId: document.getElementById('manualGradeItemCategory')?.value || 'default_participation',
      dueDate: document.getElementById('manualGradeItemDueDate')?.value || null
    };

    if (!payload.title) {
      showToast(I18n.getLocale() === 'en' ? 'Item name is required' : '請輸入項目名稱');
      return;
    }
    if (!Number.isFinite(payload.maxGrade) || payload.maxGrade <= 0) {
      showToast(I18n.getLocale() === 'en' ? 'Max grade must be greater than 0' : '滿分必須大於 0');
      return;
    }

    try {
      const result = itemId
        ? await API.gradebook.updateItem(courseId, itemId, payload)
        : await API.gradebook.createItem(courseId, payload);
      if (result.success) {
        showToast(itemId
          ? (I18n.getLocale() === 'en' ? 'Manual item updated' : '手動項目已更新')
          : (I18n.getLocale() === 'en' ? 'Manual item created' : '手動項目已建立'));
        this.closeModal('manualGradeItemModal');
        this.openGradebookManagement(courseId);
      } else {
        showToast(result.message || (itemId ? t('common.updateFailed') : t('common.createFailed')));
      }
    } catch (error) {
      console.error('Save manual grade item error:', error);
      showToast(itemId ? t('common.updateFailed') : t('common.createFailed'));
    }
  },

  async deleteManualGradeItem(courseId, itemId) {
    const confirmed = await showConfirmDialog({
      message: I18n.getLocale() === 'en' ? 'Delete this manual grade item and all entered grades?' : '確定要刪除此手動評分項目與已輸入的成績嗎？',
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.gradebook.deleteItem(courseId, itemId);
      if (result.success) {
        showToast(I18n.getLocale() === 'en' ? 'Manual item deleted' : '手動項目已刪除');
        this.openGradebookManagement(courseId);
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete manual grade item error:', error);
      showToast(t('common.deleteFailed'));
    }
  },

  // ==================== 題庫管理系統 ====================

  currentQuestionBankFilters: {},

  async getQuestionBankManagedCourses() {
    return this.getRoleScopedCourses({ manageOnly: true });
  },

  async getQuestionBankCategories(courseId = this.currentQuestionBankCourseId) {
    if (!courseId) return [];
    const result = await API.questionBank.getCategories({ courseId });
    return result.success ? (result.data || []) : [];
  },

  /**
   * 開啟題庫管理頁面
   */
  async openQuestionBank(courseId = null) {
    const container = document.getElementById('questionBankContent');
    if (!container) return;
    const isEnglish = I18n.getLocale() === 'en';

    // 沒有指定課程 → 顯示課程選擇器
    if (!courseId) {
      this.currentQuestionBankCourseId = null;
      this.currentQuestionBankFilters = {};
      if (!this.ensureViewVisible('questionBank')) return;
      container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

      try {
        const courses = await this.getQuestionBankManagedCourses();

        if (courses.length === 0) {
          container.innerHTML = this.renderActivityEmptyState({
            icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
            title: t('app.noManagedCourses'),
            hint: isEnglish ? 'No managed courses are available for question bank setup.' : '目前沒有可管理的課程可供設定題庫。'
          });
          return;
        }

        container.innerHTML = `
          <div class="activity-picker-page">
            <div class="activity-picker-header">
              <div class="activity-picker-title">
                <div class="activity-picker-icon">
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                </div>
                <div class="activity-picker-copy">
                  <h2>${t('moodleQuestionBank.title')}</h2>
                  <p>${isEnglish ? 'Choose a course to manage its question bank.' : '請先選擇課程，再管理該課程的題庫。'}</p>
                  <div class="activity-shell-meta">
                    <span class="activity-chip">${courses.length} ${isEnglish ? 'courses' : '門課程'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="activity-picker-grid">
              ${courses.map(course => this.renderActivityPickerCard(course, {
                action: `MoodleUI.openQuestionBank(${this.toInlineActionValue(course.courseId || course.id)})`,
                ctaLabel: isEnglish ? 'Open course' : '進入課程題庫',
                summary: this.truncateText(course.description || course.summary || '', 120) || (isEnglish ? 'Open this course to manage categories and questions.' : '進入此課程後可管理類別與題目。'),
                footerLabel: course.instructorName || course.teacherName || (isEnglish ? 'Question workspace' : '題庫工作區')
              })).join('')}
            </div>
          </div>
        `;
      } catch (error) {
        console.error('Open question bank error:', error);
        container.innerHTML = `<div class="error">${t('moodleQuestionBank.loadFailed')}</div>`;
      }
      return;
    }

    if (this.currentQuestionBankCourseId !== courseId) {
      this.currentQuestionBankFilters = {};
    }
    this.currentQuestionBankCourseId = courseId;

    if (!this.ensureViewVisible('questionBank')) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    try {
      const [courseResult, questionsResult, categoriesResult] = await Promise.all([
        API.courses.get(courseId),
        API.questionBank.list({ ...this.currentQuestionBankFilters, courseId: this.currentQuestionBankCourseId }),
        API.questionBank.getCategories({ courseId: this.currentQuestionBankCourseId })
      ]);

      const questions = questionsResult.success ? questionsResult.data : [];
      const categories = categoriesResult.success ? categoriesResult.data : [];
      const currentCat = categories.find(c => c.categoryId === this.currentQuestionBankFilters.categoryId);
      const course = courseResult.success ? courseResult.data : { courseId: this.currentQuestionBankCourseId };

      container.innerHTML = this.renderQuestionBankPageWithBack(questions, categories, currentCat, course);
    } catch (error) {
      console.error('Open question bank error:', error);
      container.innerHTML = `<div class="error">${t('moodleQuestionBank.loadFailed')}</div>`;
    }
  },

  /**
   * 渲染題庫頁面
   */
  renderQuestionBankPageWithBack(questions, categories, currentCat, course = {}) {
    const courseTitle = course.title || course.name || t('moodleQuestionBank.title');
    const isEnglish = I18n.getLocale() === 'en';
    const backHeader = this.renderActivityCollectionHeader({
      backAction: 'MoodleUI.openQuestionBank()',
      title: `${courseTitle} — ${t('moodleQuestionBank.title')}`,
      subtitle: isEnglish ? 'Manage course-specific questions, categories, and search filters.' : '管理此課程專屬的題目、分類與搜尋篩選。',
      metaChips: [
        { label: `${questions.length} ${isEnglish ? 'questions' : '道題目'}` },
        { label: this.escapeText(course.shortName || course.courseId || '') },
        currentCat ? { label: this.escapeText(currentCat.name) } : null
      ]
    });
    return backHeader + this.renderQuestionBankPage(questions, categories, course);
  },

  renderQuestionBankPage(questions, categories, course = {}) {
    const questionTypes = {
      'multiple_choice': t('moodleQuestionBank.multipleChoice'),
      'multiple_select': isEnglish ? 'Multiple select' : '多選題',
      'true_false': t('moodleQuestionBank.trueFalse'),
      'short_answer': t('moodleQuestionBank.shortAnswer'),
      'matching': t('moodleQuestionBank.matching'),
      'ordering': isEnglish ? 'Ordering' : '排序題',
      'numerical': isEnglish ? 'Numerical' : '數值題',
      'fill_blank': t('moodleQuestionBank.fillBlank'),
      'cloze': isEnglish ? 'Cloze' : '克漏字',
      'essay': t('moodleQuestionBank.essay')
    };

    return `
      <div class="question-bank-page">
          <div class="qb-header">
          <div>
            <h1>${t('moodleQuestionBank.title')}</h1>
            <p class="activity-shell-copy">${this.escapeText(course.title || course.name || '')}</p>
          </div>
          <div class="qb-actions">
            <button onclick="MoodleUI.openCreateQuestionModal()" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              ${t('moodleQuestionBank.addQuestion')}
            </button>
            <button onclick="MoodleUI.openImportQuestionsModal()" class="btn-secondary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              ${t('moodleQuestionBank.import')}
            </button>
            <button onclick="MoodleUI.exportQuestions()" class="btn-secondary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              ${t('moodleQuestionBank.export')}
            </button>
          </div>
        </div>

        <div class="qb-layout">
          <!-- 左側類別篩選 -->
          <div class="qb-sidebar">
            <div class="qb-categories qb-sidebar-card">
              <div class="qb-sidebar-head">
                <div>
                  <div class="qb-sidebar-kicker">${isEnglish ? 'Structure' : '題庫結構'}</div>
                  <h3>${t('moodleQuestionBank.categoriesTitle')}</h3>
                </div>
                <button onclick="MoodleUI.openCategoryManageModal()" class="btn-sm">${t('moodleQuestionBank.manageCategories')}</button>
              </div>
              <ul class="category-tree">
                <li class="category-item ${!this.currentQuestionBankFilters.categoryId ? 'active' : ''}"
                    onclick="MoodleUI.filterQuestionsByCategory('')">
                  <span>${t('moodleQuestionBank.allQuestions')}</span>
                  <span class="count">${questions.length}</span>
                </li>
                ${categories.map(cat => `
                  <li class="category-item ${this.currentQuestionBankFilters.categoryId === cat.categoryId ? 'active' : ''}"
                      onclick="MoodleUI.filterQuestionsByCategory('${cat.categoryId}')">
                    <span>${cat.name}</span>
                    <span class="count">${cat.questionCount || 0}</span>
                  </li>
                `).join('')}
              </ul>
            </div>

            <div class="qb-type-filter qb-sidebar-card">
              <div class="qb-sidebar-head">
                <div>
                  <div class="qb-sidebar-kicker">${isEnglish ? 'Filters' : '篩選條件'}</div>
                  <h3>${t('moodleQuestionBank.typeFilter')}</h3>
                </div>
              </div>
              <div class="type-checkboxes">
                ${Object.entries(questionTypes).map(([type, label]) => `
                  <label class="checkbox-item">
                    <input type="checkbox" value="${type}"
                           ${this.currentQuestionBankFilters.types?.includes(type) ? 'checked' : ''}
                           onchange="MoodleUI.filterQuestionsByType(this)">
                    ${label}
                  </label>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- 主內容區 -->
          <div class="qb-main">
            <div class="qb-search-shell">
              <div class="qb-search-head">
                <div class="qb-search-copy">
                  <div class="qb-sidebar-kicker">${isEnglish ? 'Question search' : '題目搜尋'}</div>
                  <h3>${isEnglish ? 'Search and narrow the question set' : '搜尋並縮小題目範圍'}</h3>
                </div>
                <div class="qb-filter-summary">
                  ${this.currentQuestionBankFilters.categoryId ? `<span class="qb-filter-pill">${this.escapeText((categories.find(cat => cat.categoryId === this.currentQuestionBankFilters.categoryId) || {}).name || (isEnglish ? 'Category' : '分類'))}</span>` : ''}
                  ${(this.currentQuestionBankFilters.types || []).map(type => `<span class="qb-filter-pill">${this.escapeText(questionTypes[type] || type)}</span>`).join('')}
                </div>
              </div>
            <div class="qb-search">
              <input type="text" id="questionSearch" placeholder="${t('moodleQuestionBank.searchPlaceholder')}"
                     value="${this.currentQuestionBankFilters.search || ''}"
                     onkeyup="if(event.key==='Enter') MoodleUI.searchQuestions()">
              <button onclick="MoodleUI.searchQuestions()" class="btn-search">${t('moodleQuestionBank.searchBtn')}</button>
            </div>
            </div>

            <div class="qb-list">
              ${questions.length === 0 ? this.renderActivityEmptyState({
                icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
                title: t('moodleQuestionBank.noQuestions')
              }) : ''}
              ${questions.map(q => `
                <div class="question-card" data-question-id="${q.questionId}">
                  <div class="question-header">
                    <span class="question-type">${questionTypes[q.type] || q.type}</span>
                    ${q.category ? `<span class="question-category">${q.category}</span>` : ''}
                    <span class="question-difficulty difficulty-${q.difficulty || 'medium'}">
                      ${q.difficulty === 'easy' ? t('moodleQuestionBank.diffEasy') : q.difficulty === 'hard' ? t('moodleQuestionBank.diffHard') : t('moodleQuestionBank.diffMedium')}
                    </span>
                  </div>
                  <div class="question-content">
                    <p class="question-text">${q.questionText}</p>
                    ${q.type === 'multiple_choice' ? `
                      <ul class="question-options">
                        ${(q.options || []).map((opt, i) => `
                          <li class="${q.correctAnswer === i ? 'correct' : ''}">${opt}</li>
                        `).join('')}
                      </ul>
                    ` : ''}
                  </div>
                  <div class="question-footer">
                    <div class="question-tags">
                      ${(q.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <div class="question-actions">
                      <button onclick="MoodleUI.previewQuestion('${q.questionId}')" class="btn-sm">${t('moodleQuestionBank.preview')}</button>
                      <button onclick="MoodleUI.editQuestion('${q.questionId}')" class="btn-sm">${t('moodleQuestionBank.edit')}</button>
                      <button onclick="MoodleUI.deleteQuestion('${q.questionId}')" class="btn-sm btn-danger">${t('moodleQuestionBank.deleteBtn')}</button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 篩選題目（依類別）
   */
  async filterQuestionsByCategory(categoryId) {
    this.currentQuestionBankFilters.categoryId = categoryId || undefined;
    await this.openQuestionBank(this.currentQuestionBankCourseId);
  },

  /**
   * 篩選題目（依類型）
   */
  async filterQuestionsByType(checkbox) {
    if (!this.currentQuestionBankFilters.types) {
      this.currentQuestionBankFilters.types = [];
    }

    if (checkbox.checked) {
      this.currentQuestionBankFilters.types.push(checkbox.value);
    } else {
      this.currentQuestionBankFilters.types = this.currentQuestionBankFilters.types.filter(t => t !== checkbox.value);
    }

    if (this.currentQuestionBankFilters.types.length === 0) {
      delete this.currentQuestionBankFilters.types;
    }

    await this.openQuestionBank(this.currentQuestionBankCourseId);
  },

  /**
   * 搜尋題目
   */
  async searchQuestions() {
    const searchInput = document.getElementById('questionSearch');
    this.currentQuestionBankFilters.search = searchInput?.value || '';
    await this.openQuestionBank(this.currentQuestionBankCourseId);
  },

  /**
   * 開啟新增題目 Modal
   */
  async openCreateQuestionModal() {
    if (!this.currentQuestionBankCourseId) {
      showToast(I18n.getLocale() === 'en' ? 'Please select a course first.' : '請先選擇課程。');
      await this.openQuestionBank();
      return;
    }

    const categories = await this.getQuestionBankCategories();
    const selectedCategoryId = this.currentQuestionBankFilters.categoryId || categories[0]?.categoryId || '';
    const modal = document.createElement('div');
    modal.id = 'createQuestionModal';
    modal.className = 'modal-overlay active';

    modal.innerHTML = `
      <div class="modal-content modal-lg modal-workspace modal-question-builder-modal">
        <div class="modal-header">
          <div class="modal-heading">
            <p class="modal-kicker">${I18n.getLocale() === 'en' ? 'Question bank' : '題庫工作區'}</p>
            <h3 class="modal-title">${t('moodleNewQuestion.title')}</h3>
            <p class="modal-description">${I18n.getLocale() === 'en'
              ? 'Create the full prompt, answer key, and feedback in a larger editing workspace.'
              : '用較大的編輯空間設定題目、正確答案與解析回饋。'}</p>
          </div>
          <button onclick="MoodleUI.closeModal('createQuestionModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body modal-scroll-body">
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleNewQuestion.typeLabel')}</label>
              <select id="questionType" onchange="MoodleUI.updateQuestionForm()">
                <option value="multiple_choice">${t('moodleQuestionBank.multipleChoice')}</option>
                <option value="multiple_select">${I18n.getLocale() === 'en' ? 'Multiple select' : '多選題'}</option>
                <option value="true_false">${t('moodleQuestionBank.trueFalse')}</option>
                <option value="short_answer">${t('moodleQuestionBank.shortAnswer')}</option>
                <option value="matching">${t('moodleQuestionBank.matching')}</option>
                <option value="ordering">${I18n.getLocale() === 'en' ? 'Ordering' : '排序題'}</option>
                <option value="numerical">${I18n.getLocale() === 'en' ? 'Numerical' : '數值題'}</option>
                <option value="fill_blank">${t('moodleQuestionBank.fillBlank')}</option>
                <option value="cloze">${I18n.getLocale() === 'en' ? 'Cloze' : '克漏字'}</option>
                <option value="essay">${t('moodleQuestionBank.essay')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('moodleNewQuestion.diffLabel')}</label>
              <select id="questionDifficulty">
                <option value="easy">${t('moodleNewQuestion.diffEasy')}</option>
                <option value="medium" selected>${t('moodleNewQuestion.diffMedium')}</option>
                <option value="hard">${t('moodleNewQuestion.diffHard')}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>${t('moodleQuestionBank.categoriesTitle')}</label>
            <select id="questionCategory">
              ${categories.map(category => `
                <option value="${this.escapeText(category.categoryId)}" ${category.categoryId === selectedCategoryId ? 'selected' : ''}>
                  ${this.escapeText(category.name)}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${t('moodleNewQuestion.contentLabel')}</label>
            <textarea id="questionText" rows="3" placeholder="${t('moodleNewQuestion.contentPlaceholder')}"></textarea>
          </div>
          <div id="questionOptionsArea">
            <!-- 選項區域會根據題型動態更新 -->
          </div>
          <div class="form-group">
            <label>${t('moodleNewQuestion.tagsLabel')}</label>
            <input type="text" id="questionTags" placeholder="${t('moodleNewQuestion.tagsPlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('moodleNewQuestion.explanationLabel')}</label>
            <textarea id="questionExplanation" rows="2" placeholder="${t('moodleNewQuestion.explanationPlaceholder')}"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createQuestionModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveNewQuestion()" class="btn-primary">${t('moodleNewQuestion.create')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('.modal-content')?.style.setProperty('--modal-max-width', '980px');
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createQuestionModal'); };
    this.updateQuestionForm();
  },

  /**
   * 更新題目表單（根據題型）
   */
  updateQuestionForm() {
    const type = document.getElementById('questionType')?.value;
    const area = document.getElementById('questionOptionsArea');
    if (!area) return;
    const isEnglish = I18n.getLocale() === 'en';

    if (type === 'multiple_choice') {
      area.innerHTML = `
        <div class="form-group">
          <label>${isEnglish ? 'Options and correct answer' : '選項與正確答案'}</label>
          <div id="optionsList">
            <div class="option-item choice-option-item">
              <label class="correct-option-control">
                <input type="radio" name="correctOption" value="0" checked>
                <span>${isEnglish ? 'Correct' : '正確答案'}</span>
              </label>
              <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionA')}">
              <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOptionIndices();" class="btn-remove" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
            </div>
            <div class="option-item choice-option-item">
              <label class="correct-option-control">
                <input type="radio" name="correctOption" value="1">
                <span>${isEnglish ? 'Correct' : '正確答案'}</span>
              </label>
              <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionB')}">
              <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOptionIndices();" class="btn-remove" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
            </div>
            <div class="option-item choice-option-item">
              <label class="correct-option-control">
                <input type="radio" name="correctOption" value="2">
                <span>${isEnglish ? 'Correct' : '正確答案'}</span>
              </label>
              <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionC')}">
              <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOptionIndices();" class="btn-remove" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
            </div>
            <div class="option-item choice-option-item">
              <label class="correct-option-control">
                <input type="radio" name="correctOption" value="3">
                <span>${isEnglish ? 'Correct' : '正確答案'}</span>
              </label>
              <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionD')}">
              <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOptionIndices();" class="btn-remove" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
            </div>
          </div>
          <button type="button" onclick="MoodleUI.addQuestionOption()" class="btn-sm">${t('moodleNewQuestion.addOption')}</button>
        </div>
      `;
    } else if (type === 'multiple_select') {
      area.innerHTML = `
        <div class="form-group">
          <label>${isEnglish ? 'Options and correct choices' : '選項與正確答案'}</label>
          <div id="optionsList">
            ${[0, 1, 2, 3].map(index => `
              <div class="option-item choice-option-item">
                <label class="correct-option-control">
                  <input type="checkbox" name="correctOptions" value="${index}">
                  <span>${isEnglish ? 'Correct' : '正確選項'}</span>
                </label>
                <input type="text" class="option-input" placeholder="${this.escapeText((isEnglish ? 'Option' : '選項') + ' ' + String.fromCharCode(65 + index))}">
                <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOptionIndices();" class="btn-remove" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" onclick="MoodleUI.addQuestionMultiSelectOption()" class="btn-sm">${t('moodleNewQuestion.addOption')}</button>
          <p class="form-hint">${isEnglish ? 'Partial credit is awarded automatically.' : '系統會自動計算部分得分。'}</p>
        </div>
      `;
    } else if (type === 'true_false') {
      area.innerHTML = `
        <div class="form-group">
          <label>${t('moodleNewQuestion.correctAnswer')}</label>
          <div class="radio-group">
            <label><input type="radio" name="tfAnswer" value="true" checked> ${t('moodleNewQuestion.tfTrue')}</label>
            <label><input type="radio" name="tfAnswer" value="false"> ${t('moodleNewQuestion.tfFalse')}</label>
          </div>
        </div>
      `;
    } else if (type === 'short_answer' || type === 'fill_blank') {
      area.innerHTML = `
        <div class="form-group">
          <label>${t('moodleNewQuestion.correctAnswers')}</label>
          <input type="text" id="correctAnswers" placeholder="${t('moodleNewQuestion.correctPlaceholder')}">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="caseSensitive"> ${t('moodleNewQuestion.caseSensitive')}
          </label>
        </div>
      `;
    } else if (type === 'matching') {
      area.innerHTML = `
        <div class="form-group">
          <label>${isEnglish ? 'Matching pairs' : '配對組合'}</label>
          <div id="matchingPairsList">
            ${[0, 1, 2].map(() => `
              <div class="option-item matching-pair-item">
                <input type="text" class="matching-prompt-input" placeholder="${this.escapeText(isEnglish ? 'Prompt' : '題目/左側')}">
                <input type="text" class="matching-answer-input" placeholder="${this.escapeText(isEnglish ? 'Matching answer' : '答案/右側')}">
                <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" onclick="MoodleUI.addQuestionMatchingPair()" class="btn-sm">${isEnglish ? 'Add pair' : '新增配對'}</button>
        </div>
      `;
    } else if (type === 'ordering') {
      area.innerHTML = `
        <div class="form-group">
          <label>${isEnglish ? 'Correct order' : '正確排序'}</label>
          <div id="orderingItemsList">
            ${[0, 1, 2].map(index => `
              <div class="option-item ordering-item">
                <span class="builder-badge">${index + 1}</span>
                <input type="text" class="ordering-item-input" placeholder="${this.escapeText(isEnglish ? 'Step or item' : '步驟或項目')}">
                <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOrderingIndices();" class="btn-remove">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" onclick="MoodleUI.addQuestionOrderingItem()" class="btn-sm">${isEnglish ? 'Add item' : '新增項目'}</button>
        </div>
      `;
    } else if (type === 'numerical') {
      area.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label>${isEnglish ? 'Correct number' : '正確數值'}</label>
            <input type="number" id="numericAnswer" step="any">
          </div>
          <div class="form-group">
            <label>${isEnglish ? 'Accepted tolerance' : '允許誤差'}</label>
            <input type="number" id="numericTolerance" min="0" step="any" value="0">
          </div>
        </div>
      `;
    } else if (type === 'cloze') {
      area.innerHTML = `
        <div class="form-group">
          <label>${isEnglish ? 'Cloze passage' : '克漏字文章'}</label>
          <textarea id="clozeText" rows="5" placeholder="${this.escapeText(isEnglish ? 'Use [[1]], [[2]]... where blanks should appear.' : '在空格處輸入 [[1]]、[[2]]...')}"></textarea>
        </div>
        <div class="form-group">
          <label>${isEnglish ? 'Accepted answers for blanks' : '各空格可接受答案'}</label>
          <div id="clozeAnswersList">
            ${[1, 2].map(id => `
              <div class="option-item cloze-answer-item">
                <input type="text" class="cloze-id-input" value="${id}" placeholder="${this.escapeText(isEnglish ? 'Blank ID' : '空格編號')}">
                <input type="text" class="cloze-answer-input" placeholder="${this.escapeText(isEnglish ? 'Answers separated by |' : '多個答案用 | 分隔')}">
                <label><input type="checkbox" class="cloze-case-input"> ${t('moodleNewQuestion.caseSensitive')}</label>
                <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" onclick="MoodleUI.addQuestionClozeBlank()" class="btn-sm">${isEnglish ? 'Add blank' : '新增空格'}</button>
        </div>
      `;
    } else if (type === 'essay') {
      area.innerHTML = `
        <div class="form-group">
          <label>${t('moodleNewQuestion.referenceAnswer')}</label>
          <textarea id="referenceAnswer" rows="3" placeholder="${t('moodleNewQuestion.referencePlaceholder')}"></textarea>
        </div>
        <div class="form-group">
          <label>${t('moodleNewQuestion.minWords')}</label>
          <input type="number" id="minWords" min="0" value="0">
        </div>
      `;
    }
  },

  /**
   * 新增選項
   */
  addQuestionOption() {
    const list = document.getElementById('optionsList');
    if (!list) return;

    const count = list.children.length;
    const isEnglish = I18n.getLocale() === 'en';
    const div = document.createElement('div');
    div.className = 'option-item choice-option-item';
    div.innerHTML = `
      <label class="correct-option-control">
        <input type="radio" name="correctOption" value="${count}">
        <span>${isEnglish ? 'Correct' : '正確答案'}</span>
      </label>
      <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionLabel')} ${String.fromCharCode(65 + count)}">
      <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOptionIndices();" class="btn-remove" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
    `;
    list.appendChild(div);
    this.syncQuestionBankOptionIndices();
  },

  syncQuestionBankOptionIndices() {
    const rows = Array.from(document.querySelectorAll('#optionsList .option-item'));
    const isEnglish = I18n.getLocale() === 'en';
    let checkedExists = false;

    rows.forEach((row, index) => {
      const radio = row.querySelector('input[name="correctOption"]');
      const checkbox = row.querySelector('input[name="correctOptions"]');
      const textInput = row.querySelector('.option-input');
      if (radio) radio.value = String(index);
      if (checkbox) checkbox.value = String(index);
      if (radio?.checked) checkedExists = true;
      if (textInput) {
        textInput.placeholder = `${isEnglish ? 'Option' : '選項'} ${String.fromCharCode(65 + index)}`;
      }
    });

    if (!checkedExists) {
      const firstRadio = rows[0]?.querySelector('input[name="correctOption"]');
      if (firstRadio) firstRadio.checked = true;
    }
  },

  syncQuestionBankOrderingIndices() {
    Array.from(document.querySelectorAll('#orderingItemsList .option-item')).forEach((row, index) => {
      const badge = row.querySelector('.builder-badge');
      if (badge) badge.textContent = String(index + 1);
    });
  },

  addQuestionMultiSelectOption() {
    const list = document.getElementById('optionsList');
    if (!list) return;
    const count = list.children.length;
    const isEnglish = I18n.getLocale() === 'en';
    const div = document.createElement('div');
    div.className = 'option-item choice-option-item';
    div.innerHTML = `
      <label class="correct-option-control">
        <input type="checkbox" name="correctOptions" value="${count}">
        <span>${isEnglish ? 'Correct' : '正確選項'}</span>
      </label>
      <input type="text" class="option-input" placeholder="${this.escapeText((isEnglish ? 'Option' : '選項') + ' ' + String.fromCharCode(65 + count))}">
      <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOptionIndices();" class="btn-remove" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
    `;
    list.appendChild(div);
    this.syncQuestionBankOptionIndices();
  },

  addQuestionMatchingPair() {
    const list = document.getElementById('matchingPairsList');
    if (!list) return;
    const isEnglish = I18n.getLocale() === 'en';
    const div = document.createElement('div');
    div.className = 'option-item matching-pair-item';
    div.innerHTML = `
      <input type="text" class="matching-prompt-input" placeholder="${this.escapeText(isEnglish ? 'Prompt' : '題目/左側')}">
      <input type="text" class="matching-answer-input" placeholder="${this.escapeText(isEnglish ? 'Matching answer' : '答案/右側')}">
      <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
    `;
    list.appendChild(div);
  },

  addQuestionOrderingItem() {
    const list = document.getElementById('orderingItemsList');
    if (!list) return;
    const isEnglish = I18n.getLocale() === 'en';
    const div = document.createElement('div');
    div.className = 'option-item ordering-item';
    div.innerHTML = `
      <span class="builder-badge">${list.children.length + 1}</span>
      <input type="text" class="ordering-item-input" placeholder="${this.escapeText(isEnglish ? 'Step or item' : '步驟或項目')}">
      <button type="button" onclick="this.parentElement.remove(); MoodleUI.syncQuestionBankOrderingIndices();" class="btn-remove">×</button>
    `;
    list.appendChild(div);
  },

  addQuestionClozeBlank() {
    const list = document.getElementById('clozeAnswersList');
    if (!list) return;
    const isEnglish = I18n.getLocale() === 'en';
    const div = document.createElement('div');
    div.className = 'option-item cloze-answer-item';
    div.innerHTML = `
      <input type="text" class="cloze-id-input" value="${list.children.length + 1}" placeholder="${this.escapeText(isEnglish ? 'Blank ID' : '空格編號')}">
      <input type="text" class="cloze-answer-input" placeholder="${this.escapeText(isEnglish ? 'Answers separated by |' : '多個答案用 | 分隔')}">
      <label><input type="checkbox" class="cloze-case-input"> ${t('moodleNewQuestion.caseSensitive')}</label>
      <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
    `;
    list.appendChild(div);
  },

  /**
   * 儲存新題目
   */
  async saveNewQuestion() {
    const type = document.getElementById('questionType').value;
    let questionText = document.getElementById('questionText').value.trim();
    const clozeTextDraft = type === 'cloze' ? document.getElementById('clozeText')?.value?.trim() : '';
    if (!questionText && clozeTextDraft) {
      questionText = clozeTextDraft;
    }
    const difficulty = document.getElementById('questionDifficulty').value;
    const tags = document.getElementById('questionTags').value.split(',').map(t => t.trim()).filter(t => t);
    const explanation = document.getElementById('questionExplanation').value.trim();

    if (!questionText) {
      showToast(t('moodleNewQuestion.contentRequired'));
      return;
    }

    let questionData = {
      courseId: this.currentQuestionBankCourseId,
      categoryId: document.getElementById('questionCategory')?.value || this.currentQuestionBankFilters.categoryId,
      type,
      questionText,
      difficulty,
      tags,
      explanation
    };

    // 根據題型收集答案資料
    if (type === 'multiple_choice') {
      const rows = Array.from(document.querySelectorAll('#optionsList .option-item'));
      const options = [];
      let correctAnswer = 0;
      rows.forEach(row => {
        const optionText = row.querySelector('.option-input')?.value?.trim();
        if (!optionText) return;
        const nextIndex = options.length;
        if (row.querySelector('input[name="correctOption"]')?.checked) {
          correctAnswer = nextIndex;
        }
        options.push(optionText);
      });
      questionData.options = options;
      questionData.correctAnswer = correctAnswer;
      questionData.correctAnswers = [];

      if (questionData.options.length < 2) {
        showToast(t('moodleNewQuestion.minOptions'));
        return;
      }
    } else if (type === 'multiple_select') {
      const rows = Array.from(document.querySelectorAll('#optionsList .option-item'));
      const options = [];
      const correctAnswers = [];
      rows.forEach(row => {
        const optionText = row.querySelector('.option-input')?.value?.trim();
        if (!optionText) return;
        const nextIndex = options.length;
        if (row.querySelector('input[name="correctOptions"]')?.checked) {
          correctAnswers.push(nextIndex);
        }
        options.push(optionText);
      });
      if (options.length < 2) {
        showToast(t('moodleNewQuestion.minOptions'));
        return;
      }
      if (correctAnswers.length === 0) {
        showToast(I18n.getLocale() === 'en' ? 'Select at least one correct option.' : '請至少勾選一個正確選項。');
        return;
      }
      questionData.options = options;
      questionData.correctAnswers = correctAnswers;
      questionData.correctAnswer = null;
    } else if (type === 'true_false') {
      const tfRadio = document.querySelector('input[name="tfAnswer"]:checked');
      questionData.correctAnswer = tfRadio?.value === 'true';
    } else if (type === 'short_answer' || type === 'fill_blank') {
      questionData.correctAnswers = document.getElementById('correctAnswers')?.value.split(',').map(a => a.trim()).filter(a => a);
      questionData.caseSensitive = document.getElementById('caseSensitive')?.checked;
    } else if (type === 'matching') {
      questionData.matchingPairs = Array.from(document.querySelectorAll('#matchingPairsList .option-item'))
        .map(row => ({
          prompt: row.querySelector('.matching-prompt-input')?.value?.trim() || '',
          answer: row.querySelector('.matching-answer-input')?.value?.trim() || ''
        }))
        .filter(pair => pair.prompt && pair.answer);
      if (questionData.matchingPairs.length < 2) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least two complete matching pairs.' : '請至少新增兩組完整配對。');
        return;
      }
    } else if (type === 'ordering') {
      questionData.orderingItems = Array.from(document.querySelectorAll('#orderingItemsList .ordering-item-input'))
        .map(input => input.value.trim())
        .filter(Boolean);
      if (questionData.orderingItems.length < 2) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least two ordered items.' : '請至少新增兩個排序項目。');
        return;
      }
    } else if (type === 'numerical') {
      const numericAnswer = Number(document.getElementById('numericAnswer')?.value);
      const numericTolerance = Number(document.getElementById('numericTolerance')?.value || 0);
      if (!Number.isFinite(numericAnswer)) {
        showToast(I18n.getLocale() === 'en' ? 'Enter a valid numeric answer.' : '請輸入有效的正確數值。');
        return;
      }
      questionData.correctAnswer = numericAnswer;
      questionData.numericAnswer = numericAnswer;
      questionData.numericTolerance = Number.isFinite(numericTolerance) && numericTolerance > 0 ? numericTolerance : 0;
    } else if (type === 'cloze') {
      questionData.questionText = clozeTextDraft || questionText;
      questionData.clozeText = clozeTextDraft || questionText;
      questionData.clozeAnswers = Array.from(document.querySelectorAll('#clozeAnswersList .option-item'))
        .map((row, index) => {
          const id = row.querySelector('.cloze-id-input')?.value?.trim() || String(index + 1);
          const answers = String(row.querySelector('.cloze-answer-input')?.value || '')
            .split('|')
            .map(answer => answer.trim())
            .filter(Boolean);
          return {
            id,
            answers,
            caseSensitive: row.querySelector('.cloze-case-input')?.checked === true
          };
        })
        .filter(blank => blank.id && blank.answers.length > 0);
      if (questionData.clozeAnswers.length === 0) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least one blank answer.' : '請至少新增一個空格答案。');
        return;
      }
    } else if (type === 'essay') {
      questionData.referenceAnswer = document.getElementById('referenceAnswer')?.value.trim();
      questionData.minWords = parseInt(document.getElementById('minWords')?.value) || 0;
    }

    try {
      const result = await API.questionBank.create(questionData);
      if (result.success) {
        showToast(t('moodleNewQuestion.created'));
        this.closeModal('createQuestionModal');
        this.openQuestionBank(this.currentQuestionBankCourseId);
      } else {
        showToast(result.message || t('common.createFailed'));
      }
    } catch (error) {
      console.error('Create question error:', error);
      showToast(t('common.createFailed'));
    }
  },

  /**
   * 刪除題目
   */
  async deleteQuestion(questionId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleNewQuestion.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.questionBank.delete(questionId);
      if (result.success) {
        showToast(t('moodleNewQuestion.deleted'));
        this.openQuestionBank(this.currentQuestionBankCourseId);
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete question error:', error);
      showToast(t('common.deleteFailed'));
    }
  },

  /**
   * 匯出題目
   */
  async exportQuestions() {
    if (!this.currentQuestionBankCourseId) {
      showToast(I18n.getLocale() === 'en' ? 'Please select a course first.' : '請先選擇課程。');
      return;
    }
    try {
      const result = await API.questionBank.export({
        ...this.currentQuestionBankFilters,
        courseId: this.currentQuestionBankCourseId
      });
      if (result.success && result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `question_bank_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('moodleQuestionBank.exported'));
      } else {
        showToast(t('moodleGradebook.exportFailed'));
      }
    } catch (error) {
      console.error('Export questions error:', error);
      showToast(t('moodleGradebook.exportFailed'));
    }
  },

  // ==================== 課程完成條件系統 ====================

  /**
   * 開啟課程完成設定（教師）
   */
  async openCourseCompletionSettings(courseId) {
    if (!this.ensureViewVisible('courseCompletionSettings')) return;
    if (!courseId) {
      courseId = this.currentCourseId;
      if (!courseId) {
        // 顯示課程選擇器 modal
        let courseOptions = '';
        try {
          const courses = await this.getRoleScopedCourses({ manageOnly: true });
          courses.forEach(c => {
            courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`;
          });
        } catch (e) { /* ignore */ }
        if (!courseOptions) { showToast(t('moodleGradebook.noCourses')); return; }
        const selectorModal = document.createElement('div');
        selectorModal.id = 'courseSelectForCompletionModal';
        selectorModal.className = 'modal-overlay active';
        selectorModal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h3>${t('moodleCompletion.selectCourse')}</h3>
              <button type="button" onclick="MoodleUI.closeModal('courseSelectForCompletionModal')" class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>${t('moodleCompletion.selectCourseLabel')}</label>
                <select id="completionCourseSelect">${courseOptions}</select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" onclick="MoodleUI.closeModal('courseSelectForCompletionModal')" class="btn-secondary">${t('common.cancel')}</button>
              <button type="button" onclick="MoodleUI.confirmCourseCompletionCourseSelection()" class="btn-primary">${t('common.confirm')}</button>
            </div>
          </div>
        `;
        document.body.appendChild(selectorModal);
        selectorModal.onclick = (e) => { if (e.target === selectorModal) this.closeModal('courseSelectForCompletionModal'); };
        return;
      }
    }
    const modal = document.createElement('div');
    modal.id = 'courseCompletionModal';
    modal.className = 'modal-overlay active';

    try {
      const result = await API.courseCompletion.getSettings(courseId);
      const settings = result.success ? result.data : { enabled: false, criteria: [], aggregation: 'all' };

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>${t('moodleCompletion.courseSettingsTitle')}</h3>
            <button onclick="MoodleUI.closeModal('courseCompletionModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="switch-label">
                <input type="checkbox" id="completionEnabled" ${settings.enabled ? 'checked' : ''}>
                <span class="switch-slider"></span>
                ${t('moodleCompletion.enableTracking')}
              </label>
            </div>

            <div id="completionSettingsArea" ${settings.enabled ? '' : 'hidden'}>
              <div class="form-group">
                <label>${t('moodleGradeSettings.aggregation')}</label>
                <select id="completionAggregation">
                  <option value="all" ${settings.aggregation === 'all' ? 'selected' : ''}>${t('moodleCompletion.allCriteria')}</option>
                  <option value="any" ${settings.aggregation === 'any' ? 'selected' : ''}>${t('moodleCompletion.anyCriteria')}</option>
                </select>
              </div>

              <h4>${t('moodleCompletion.criteria')}</h4>
              <div id="completionCriteriaList">
                ${(settings.criteria || []).map((c, idx) => this.renderCompletionCriterion(c, idx)).join('')}
              </div>
              <button onclick="MoodleUI.addCompletionCriterion()" class="btn-sm">${t('moodleCompletion.addCriterion')}</button>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('courseCompletionModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button onclick="MoodleUI.saveCourseCompletionSettings('${courseId}')" class="btn-primary">${t('moodleGradeSettings.save')}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // 綁定啟用開關事件
      document.getElementById('completionEnabled').onchange = function() {
        document.getElementById('completionSettingsArea').hidden = !this.checked;
      };

      modal.onclick = (e) => { if (e.target === modal) this.closeModal('courseCompletionModal'); };
    } catch (error) {
      console.error('Open completion settings error:', error);
      showToast(t('moodleGradeSettings.loadFailed'));
    }
  },

  confirmCourseCompletionCourseSelection() {
    const select = document.getElementById('completionCourseSelect');
    const courseId = select?.value;
    if (!courseId) {
      showToast(t('moodleGradebook.noCourses'));
      return;
    }
    this.closeModal('courseSelectForCompletionModal');
    this.openCourseCompletionSettings(courseId);
  },

  /**
   * 渲染完成條件項目
   */
  renderCompletionCriterion(criterion, index) {
    const types = {
      'ACTIVITY_COMPLETION': t('moodleCompletion.activityCompletion'),
      'GRADE': t('moodleCompletion.gradeThreshold'),
      'DURATION': t('moodleCompletion.studyDuration'),
      'SELF_COMPLETION': t('moodleCompletion.selfCompletion'),
      'MANUAL': t('moodleCompletion.manualCompletion')
    };

    return `
      <div class="criterion-item" data-index="${index}">
        <select class="criterion-type" onchange="MoodleUI.updateCriterionOptions(this)">
          ${Object.entries(types).map(([value, label]) => `
            <option value="${value}" ${criterion.type === value ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
        <div class="criterion-options">
          ${this.getCriterionOptionsHTML(criterion)}
        </div>
        <button onclick="this.parentElement.remove()" class="btn-remove">×</button>
      </div>
    `;
  },

  /**
   * 取得條件選項 HTML
   */
  getCriterionOptionsHTML(criterion) {
    switch (criterion.type) {
      case 'GRADE':
        return `<input type="number" class="criterion-value" placeholder="${t('moodleCompletion.minGrade')}" value="${criterion.minGrade || 60}" min="0" max="100">`;
      case 'DURATION':
        return `<input type="number" class="criterion-value" placeholder="${t('moodleCompletion.minMinutes')}" value="${criterion.minMinutes || 30}" min="1">`;
      default:
        return '';
    }
  },

  /**
   * 新增完成條件
   */
  addCompletionCriterion() {
    const list = document.getElementById('completionCriteriaList');
    if (!list) return;

    const index = list.children.length;
    const div = document.createElement('div');
    div.className = 'criterion-item';
    div.dataset.index = index;
    div.innerHTML = `
      <select class="criterion-type" onchange="MoodleUI.updateCriterionOptions(this)">
        <option value="ACTIVITY_COMPLETION">${t('moodleCompletion.activityCompletion')}</option>
        <option value="GRADE">${t('moodleCompletion.gradeThreshold')}</option>
        <option value="DURATION">${t('moodleCompletion.studyDuration')}</option>
        <option value="SELF_COMPLETION">${t('moodleCompletion.selfCompletion')}</option>
        <option value="MANUAL">${t('moodleCompletion.manualCompletion')}</option>
      </select>
      <div class="criterion-options"></div>
      <button onclick="this.parentElement.remove()" class="btn-remove">×</button>
    `;
    list.appendChild(div);
  },

  /**
   * 更新條件選項
   */
  updateCriterionOptions(select) {
    const optionsDiv = select.nextElementSibling;
    const type = select.value;

    if (type === 'GRADE') {
      optionsDiv.innerHTML = `<input type="number" class="criterion-value" placeholder="${t('moodleCompletion.minGrade')}" value="60" min="0" max="100">`;
    } else if (type === 'DURATION') {
      optionsDiv.innerHTML = `<input type="number" class="criterion-value" placeholder="${t('moodleCompletion.minMinutes')}" value="30" min="1">`;
    } else {
      optionsDiv.innerHTML = '';
    }
  },

  /**
   * 儲存課程完成設定
   */
  async saveCourseCompletionSettings(courseId) {
    const enabled = document.getElementById('completionEnabled').checked;
    const aggregation = document.getElementById('completionAggregation')?.value || 'all';

    const criteriaItems = document.querySelectorAll('.criterion-item');
    const criteria = Array.from(criteriaItems).map(item => {
      const type = item.querySelector('.criterion-type').value;
      const valueInput = item.querySelector('.criterion-value');
      const criterion = { type };

      if (type === 'GRADE' && valueInput) {
        criterion.minGrade = parseInt(valueInput.value) || 60;
      } else if (type === 'DURATION' && valueInput) {
        criterion.minMinutes = parseInt(valueInput.value) || 30;
      }

      return criterion;
    });

    try {
      const result = await API.courseCompletion.updateSettings(courseId, {
        enabled,
        aggregation,
        criteria
      });

      if (result.success) {
        showToast(t('moodleCompletion.saved'));
        this.closeModal('courseCompletionModal');
      } else {
        showToast(result.message || t('moodleGradeSettings.saveFailed'));
      }
    } catch (error) {
      console.error('Save completion settings error:', error);
      showToast(t('moodleGradeSettings.saveFailed'));
    }
  },

  /**
   * 渲染學生課程完成狀態
   */
  async renderStudentCompletionStatus(courseId) {
    try {
      const result = await API.courseCompletion.getStatus(courseId);
      if (!result.success) return '';

      const status = result.data;
      if (!status.enabled) return '';

      const progress = status.totalCriteria > 0
        ? (status.completedCriteria / status.totalCriteria) * 100
        : 0;

      return `
        <div class="completion-status-card">
          <h4>${t('moodleCompletion.courseProgress')}</h4>
          <div class="completion-progress">
            <div class="progress-bar">
              <div class="progress-fill" data-progress-width="${this.clampProgressValue(progress)}"></div>
            </div>
            <span class="progress-text">${status.completedCriteria}/${status.totalCriteria} ${t('moodleCompletion.completed')}</span>
          </div>
          <ul class="completion-checklist">
            ${(status.criteriaStatus || []).map(c => `
              <li class="${c.completed ? 'completed' : ''}">
                <span class="check-icon">${c.completed ? '✓' : '○'}</span>
                <span class="criteria-name">${c.description}</span>
              </li>
            `).join('')}
          </ul>
          ${status.allowSelfCompletion && !status.isCompleted ? `
            <button onclick="MoodleUI.selfMarkCompletion('${courseId}')" class="btn-primary">
              ${t('moodleCompletion.markComplete')}
            </button>
          ` : ''}
          ${status.isCompleted ? `
            <div class="completion-badge">
              <span class="badge-icon">🎉</span>
              <span>${t('moodleCompletion.courseCompleted')}</span>
            </div>
          ` : ''}
        </div>
      `;
    } catch (error) {
      console.error('Get completion status error:', error);
      return '';
    }
  },

  /**
   * 自我標記完成
   */
  async selfMarkCompletion(courseId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleCompletion.confirmComplete'),
      confirmLabel: t('common.confirm')
    });
    if (!confirmed) return;

    try {
      const result = await API.courseCompletion.selfMark(courseId);
      if (result.success) {
        showToast(t('moodleCompletion.markedComplete'));
        location.reload();
      } else {
        showToast(result.message || t('moodleNotification.actionFailed'));
      }
    } catch (error) {
      console.error('Self mark completion error:', error);
      showToast(t('moodleNotification.actionFailed'));
    }
  },

  // ==================== 角色權限管理 ====================

  /**
   * 開啟角色權限管理頁面
   */
  async openRolesManagement() {
    const container = document.getElementById('rolesManagementContent');
    if (!container) return;
    if (!this.ensureViewVisible('rolesManagement')) return;

    container.innerHTML = `
      <div class="roles-management-page">
        <div class="page-header-modern">
          <div class="header-content">
            <h2>${t('moodleRoles.title')}</h2>
            <p>${t('moodleRoles.description')}</p>
          </div>
          <div class="header-actions">
            <button class="btn-primary" onclick="MoodleUI.openCreateRoleModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              ${t('moodleRoles.addRole')}
            </button>
          </div>
        </div>

        <div class="roles-content">
          <div class="roles-sidebar">
            <h3>${t('moodleRoles.systemRoles')}</h3>
            <div class="roles-list" id="rolesList">
              <div class="loading-spinner">${t('common.loading')}</div>
            </div>
          </div>
          <div class="roles-detail" id="roleDetailPanel">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
              <p>${t('moodleRoles.selectRoleHint')}</p>
            </div>
          </div>
        </div>
      </div>
    `;

    await this.loadRolesList();
  },

  /**
   * 載入角色列表
   */
  async loadRolesList() {
    try {
      const result = await API.roles.list();
      const rolesList = document.getElementById('rolesList');

      if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
        rolesList.innerHTML = `
          <div class="empty-state-small">
            <p>${t('moodleRoles.noRoles')}</p>
          </div>
        `;
        return;
      }

      const roleIcons = {
        admin: '👑',
        manager: '🛡️',
        coursecreator: '🧩',
        teacher: '📘',
        assistant: '🧑‍🏫',
        educator: '📚',
        trainer: '🎓',
        creator: '✏️',
        student: '🎒',
        guest: '👤'
      };

      rolesList.innerHTML = result.data.map(role => `
        <button type="button" class="role-item ${role.isSystem ? 'system-role' : ''}"
             onclick="MoodleUI.selectRole('${role.id || role.roleId}')"
             data-role-id="${role.id || role.roleId}">
          <span class="role-icon">${roleIcons[role.shortName] || '🔐'}</span>
          <div class="role-info">
            <span class="role-name">${role.name}</span>
            <span class="role-type">${role.isSystem ? t('moodleRoles.systemRole') : t('moodleRoles.customRole')}</span>
          </div>
          <span class="role-user-count">${role.userCount || 0} ${t('moodleRoles.usersCount')}</span>
        </button>
      `).join('');
    } catch (error) {
      console.error('Load roles error:', error);
      document.getElementById('rolesList').innerHTML = `
        <div class="error-state">${t('common.loadFailed')}</div>
      `;
    }
  },

  /**
   * 選擇角色
   */
  async selectRole(roleId) {
    // 更新選中狀態
    document.querySelectorAll('.role-item').forEach(item => {
      item.classList.toggle('active', item.dataset.roleId === roleId);
    });

    try {
      const result = await API.roles.get(roleId);
      if (!result.success) {
        showToast(t('moodleRoles.loadDetailFailed'));
        return;
      }

      const role = result.data;
      const capResult = await API.roles.getCapabilities();
      const allCapabilities = (capResult.success && Array.isArray(capResult.data)) ? capResult.data : [];
      const createdAtText = this.formatLocaleDate(role.createdAt);

      document.getElementById('roleDetailPanel').innerHTML = `
        <div class="role-detail-content">
          <div class="role-detail-header">
            <h3>${role.name}</h3>
            <p>${role.description || t('common.noDescription')}</p>
            ${role.isSystem ? `<span class="badge badge-info">${t('moodleRoles.systemRole')}</span>` : ''}
          </div>

          <div class="role-info-card">
            <div class="info-row">
              <span class="label">${t('moodleRoles.shortCode')}</span>
              <span class="value">${role.shortName}</span>
            </div>
            <div class="info-row">
              <span class="label">${t('moodleRoles.userCount')}</span>
              <span class="value">${role.userCount || 0} 人</span>
            </div>
            <div class="info-row">
              <span class="label">${t('common.createdAt')}</span>
              <span class="value">${createdAtText}</span>
            </div>
          </div>

          <div class="capabilities-section">
            <h4>${t('moodleRoles.permissions')}</h4>
            <div class="capabilities-grid">
              ${this.renderCapabilitiesEditor(role.capabilities || [], allCapabilities, role.isSystem)}
            </div>
          </div>

          ${!role.isSystem ? `
            <div class="role-actions">
              <button class="btn-secondary" onclick="MoodleUI.editRole('${role.id || role.roleId}')">
                ${t('moodleRoles.editRole')}
              </button>
              <button class="btn-danger" onclick="MoodleUI.deleteRole('${role.id || role.roleId}')">
                ${t('moodleRoles.deleteRole')}
              </button>
            </div>
          ` : ''}
        </div>
      `;
    } catch (error) {
      console.error('Select role error:', error);
    }
  },

  /**
   * 渲染權限編輯器
   */
  renderCapabilitiesEditor(roleCapabilities, allCapabilities, isReadOnly) {
    const categories = {
      'course': { name: t('moodleRoles.capCourse'), icon: '📚' },
      'assignment': { name: t('moodleRoles.capAssignment'), icon: '📝' },
      'quiz': { name: t('moodleRoles.capQuiz'), icon: '❓' },
      'forum': { name: t('moodleRoles.capForum'), icon: '💬' },
      'grade': { name: t('moodleRoles.capGrade'), icon: '📊' },
      'user': { name: t('moodleRoles.capUser'), icon: '👥' },
      'system': { name: t('moodleRoles.capSystem'), icon: '⚙️' }
    };

    // 將能力按類別分組
    const grouped = {};
    allCapabilities.forEach(cap => {
      const category = cap.category || 'system';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(cap);
    });

    return Object.entries(grouped).map(([category, caps]) => `
      <div class="capability-category">
        <h5>
          <span>${categories[category]?.icon || '🔐'}</span>
          ${categories[category]?.name || category}
        </h5>
        <div class="capability-list">
          ${caps.map(cap => `
            <label class="capability-item ${isReadOnly ? 'readonly' : ''}">
              <input type="checkbox"
                     ${roleCapabilities.includes(cap.id) ? 'checked' : ''}
                     ${isReadOnly ? 'disabled' : ''}
                     data-capability="${cap.id}">
              <span class="cap-name">${cap.displayName || cap.name || cap.id}</span>
              <span class="cap-desc">${cap.description || ''}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  },

  /**
   * 開啟新增角色模態框
   */
  async openCreateRoleModal() {
    const modal = document.createElement('div');
    modal.id = 'createRoleModal';
    modal.className = 'modal-overlay active';

    try {
      const capResult = await API.roles.getCapabilities();
      const allCapabilities = (capResult.success && Array.isArray(capResult.data)) ? capResult.data : [];

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>${t('moodleRoles.addRole')}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <form id="createRoleForm" onsubmit="MoodleUI.submitCreateRole(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>${t('moodleRoles.nameLabel')} *</label>
                <input type="text" name="name" required placeholder="${t('moodleRoles.namePlaceholder')}">
              </div>
              <div class="form-group">
                <label>${t('moodleRoles.shortCodeLabel')} *</label>
                <input type="text" name="shortName" required placeholder="${t('moodleRoles.shortCodePlaceholder')}">
                <small>${t('moodleRoles.shortCodeHint')}</small>
              </div>
              <div class="form-group">
                <label>${t('common.description')}</label>
                <textarea name="description" rows="2" placeholder="${t('moodleRoles.descPlaceholder')}"></textarea>
              </div>
              <div class="form-group">
                <label>${t('moodleRoles.permissions')}</label>
                <div class="capabilities-grid">
                  ${this.renderCapabilitiesEditor([], allCapabilities, false)}
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">${t('common.cancel')}</button>
              <button type="submit" class="btn-primary">${t('moodleRoles.createBtn')}</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);
    } catch (error) {
      console.error('Open create role modal error:', error);
      showToast(t('moodleRoles.loadCapsFailed'));
    }
  },

  /**
   * 提交建立角色
   */
  async submitCreateRole(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const capabilities = [];
    form.querySelectorAll('input[data-capability]:checked').forEach(input => {
      capabilities.push(input.dataset.capability);
    });

    try {
      const result = await API.roles.create({
        name: formData.get('name'),
        nameEn: formData.get('shortName') || formData.get('name'),
        description: formData.get('description'),
        capabilities
      });

      if (result.success) {
        showToast(t('moodleRoles.created'));
        document.getElementById('createRoleModal').remove();
        await this.loadRolesList();
      } else {
        showToast(result.message || t('common.createFailed'));
      }
    } catch (error) {
      console.error('Create role error:', error);
      showToast(t('moodleRoles.createError'));
    }
  },

  /**
   * 刪除角色
   */
  async deleteRole(roleId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleRoles.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.roles.delete(roleId);
      if (result.success) {
        showToast(t('moodleRoles.deleted'));
        await this.loadRolesList();
        document.getElementById('roleDetailPanel').innerHTML = `
          <div class="empty-state">
            <p>${t('moodleRoles.selectRoleHint')}</p>
          </div>
        `;
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete role error:', error);
      showToast(t('moodleRoles.deleteError'));
    }
  },

  // ==================== 課程類別管理 ====================

  /**
   * 開啟課程類別管理頁面
   */
  async openCourseCategories() {
    const container = document.getElementById('courseCategoriesContent');
    if (!container) return;
    if (!this.ensureViewVisible('courseCategories')) return;

    container.innerHTML = `
      <div class="course-categories-page">
        <div class="page-header-modern">
          <div class="header-content">
            <h2>${t('moodleCategories.title')}</h2>
            <p>${t('moodleCategories.description')}</p>
          </div>
          <div class="header-actions">
            <button class="btn-primary" onclick="MoodleUI.openCreateCategoryModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              ${t('moodleCategories.addCategory')}
            </button>
          </div>
        </div>

        <div class="categories-content">
          <div class="categories-tree" id="categoriesTree">
            <div class="loading-spinner">${t('common.loading')}</div>
          </div>
          <div class="category-detail" id="categoryDetailPanel">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              <p>${t('moodleCategories.selectCategoryHint')}</p>
            </div>
          </div>
        </div>
      </div>
    `;

    await this.loadCategoriesTree();
  },

  /**
   * 載入類別樹狀結構
   */
  async loadCategoriesTree() {
    try {
      const result = await API.courseCategories.list();
      const container = document.getElementById('categoriesTree');

      if (!result.success || !result.data?.length) {
        container.innerHTML = `
          <div class="empty-state-small">
            <p>${t('moodleCategories.noCategories')}</p>
            <button class="btn-secondary" onclick="MoodleUI.openCreateCategoryModal()">
              ${t('moodleCategories.createFirst')}
            </button>
          </div>
        `;
        return;
      }

      // 建立樹狀結構
      const categories = result.data;
      container.innerHTML = this.renderCategoryTree(categories, null, 0);
      this.applyDynamicUiMetrics(container);
    } catch (error) {
      console.error('Load categories error:', error);
      document.getElementById('categoriesTree').innerHTML = `
        <div class="error-state">${t('common.loadFailed')}</div>
      `;
    }
  },

  /**
   * 遞迴渲染類別樹
   */
  renderCategoryTree(categories, parentId, level) {
    const children = categories.filter(c => c.parentId === parentId);
    if (children.length === 0) return '';

    return `
      <ul class="category-tree-list" data-tree-indent="${level}">
        ${children.map(cat => {
          const hasChildren = categories.some(c => c.parentId === cat.id);
          const childId = `category-children-${cat.id}`;
          return `
            <li class="category-tree-item">
              <div class="category-node" data-category-id="${cat.id}">
                ${hasChildren ? `
                  <button
                    type="button"
                    class="expand-icon"
                    onclick="MoodleUI.toggleCategoryExpand(this)"
                    aria-controls="${childId}"
                    aria-expanded="false"
                    aria-label="${t('moodleCategories.expandChildren')}"
                  >
                    <span aria-hidden="true">▶</span>
                  </button>
                ` : `
                  <span class="expand-icon is-placeholder" aria-hidden="true">•</span>
                `}
                <button type="button" class="category-node-main" onclick="MoodleUI.selectCategory('${cat.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  <span class="category-name">${cat.name}</span>
                  <span class="course-count">(${cat.courseCount || 0})</span>
                </button>
              </div>
              <div class="category-children" id="${childId}" hidden>
                ${this.renderCategoryTree(categories, cat.id, level + 1)}
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  },

  /**
   * 切換類別展開
   */
  toggleCategoryExpand(icon) {
    const item = icon.closest('.category-tree-item');
    const children = item.querySelector('.category-children');
    if (children && children.innerHTML.trim()) {
      const isExpanded = !children.hidden;
      children.hidden = isExpanded;
      icon.setAttribute('aria-expanded', String(!isExpanded));
      icon.setAttribute('aria-label', isExpanded ? t('moodleCategories.expandChildren') : t('moodleCategories.collapseChildren'));
      icon.innerHTML = `<span aria-hidden="true">${isExpanded ? '▶' : '▼'}</span>`;
    }
  },

  /**
   * 選擇類別
   */
  async selectCategory(categoryId) {
    // 更新選中狀態
    document.querySelectorAll('.category-node').forEach(node => {
      node.classList.toggle('active', node.dataset.categoryId === categoryId);
    });

    try {
      const result = await API.courseCategories.get(categoryId);
      if (!result.success) {
        showToast(t('moodleCategories.loadDetailFailed'));
        return;
      }

      const category = result.data;
      document.getElementById('categoryDetailPanel').innerHTML = `
        <div class="category-detail-content">
          <div class="category-detail-header">
            <h3>${category.name}</h3>
            <p>${category.description || t('common.noDescription')}</p>
          </div>

          <div class="category-info-card">
            <div class="info-row">
              <span class="label">${t('moodleCategories.categoryId')}</span>
              <span class="value">${category.id}</span>
            </div>
            <div class="info-row">
              <span class="label">${t('moodleCategories.courseCount')}</span>
              <span class="value">${category.courseCount || 0} ${t('moodleCategories.coursesUnit')}</span>
            </div>
            <div class="info-row">
              <span class="label">${t('moodleCategories.childCount')}</span>
              <span class="value">${category.childCount || 0} ${t('common.unit')}</span>
            </div>
            <div class="info-row">
              <span class="label">${t('common.createdAt')}</span>
              <span class="value">${this.formatLocaleDate(category.createdAt)}</span>
            </div>
          </div>

          ${category.courses?.length > 0 ? `
            <div class="category-courses">
              <h4>${t('moodleCategories.includedCourses')}</h4>
              <div class="courses-list">
                ${category.courses.map(course => `
                  <div class="course-item-mini">
                    <span class="course-name">${course.title}</span>
                    <span class="course-status">${course.isPublished ? t('common.published') : t('common.draft')}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="category-actions">
            <button class="btn-secondary" onclick="MoodleUI.editCategory('${category.id}')">
              ${t('moodleCategories.editCategory')}
            </button>
            <button class="btn-secondary" onclick="MoodleUI.openCreateCategoryModal('${category.id}')">
              ${t('moodleCategories.addSubcategory')}
            </button>
            <button class="btn-danger" onclick="MoodleUI.deleteCategory('${category.id}')">
              ${t('moodleCategories.deleteCategory')}
            </button>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Select category error:', error);
    }
  },

  /**
   * 開啟新增類別模態框
   */
  async openCreateCategoryModal(parentId = null) {
    const modal = document.createElement('div');
    modal.id = 'createCategoryModal';
    modal.className = 'modal-overlay active';

    try {
      const result = await API.courseCategories.list();
      const categories = result.success ? result.data : [];

      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>${parentId ? t('moodleCategories.addSubcategory') : t('moodleCategories.addCategory')}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <form id="createCategoryForm" onsubmit="MoodleUI.submitCreateCategory(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>${t('moodleCategories.nameLabel')} *</label>
                <input type="text" name="name" required placeholder="${t('moodleCategories.namePlaceholder')}">
              </div>
              <div class="form-group">
                <label>${t('moodleCategories.parentCategory')}</label>
                <select name="parentId">
                  <option value="">${t('moodleCategories.topLevel')}</option>
                  ${categories.map(cat => `
                    <option value="${cat.id}" ${cat.id === parentId ? 'selected' : ''}>${cat.name}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>${t('common.description')}</label>
                <textarea name="description" rows="3" placeholder="${t('moodleCategories.descPlaceholder')}"></textarea>
              </div>
              <div class="form-group">
                <label>${t('moodleCategories.sortOrder')}</label>
                <input type="number" name="sortOrder" value="0" min="0">
                <small>${t('moodleCategories.sortOrderHint')}</small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">${t('common.cancel')}</button>
              <button type="submit" class="btn-primary">${t('moodleCategories.createBtn')}</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);
    } catch (error) {
      console.error('Open create category modal error:', error);
      showToast(t('moodleCategories.loadListFailed'));
    }
  },

  /**
   * 提交建立類別
   */
  async submitCreateCategory(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
      const result = await API.courseCategories.create({
        name: formData.get('name'),
        parentId: formData.get('parentId') || null,
        description: formData.get('description'),
        sortOrder: parseInt(formData.get('sortOrder')) || 0
      });

      if (result.success) {
        showToast(t('moodleCategories.created'));
        document.getElementById('createCategoryModal').remove();
        await this.loadCategoriesTree();
      } else {
        showToast(result.message || t('common.createFailed'));
      }
    } catch (error) {
      console.error('Create category error:', error);
      showToast(t('moodleCategories.createError'));
    }
  },

  /**
   * 編輯類別
   */
  async editCategory(categoryId) {
    try {
      const result = await API.courseCategories.get(categoryId);
      if (!result.success) {
        showToast(t('moodleCategories.loadDataFailed'));
        return;
      }

      const category = result.data;
      const categoriesResult = await API.courseCategories.list();
      const categories = categoriesResult.success ? categoriesResult.data.filter(c => c.id !== categoryId) : [];

      const modal = document.createElement('div');
      modal.id = 'editCategoryModal';
      modal.className = 'modal-overlay active';

      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>${t('moodleCategories.editCategory')}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <form id="editCategoryForm" onsubmit="MoodleUI.submitEditCategory(event, '${categoryId}')">
            <div class="modal-body">
              <div class="form-group">
                <label>${t('moodleCategories.nameLabel')} *</label>
                <input type="text" name="name" required value="${category.name}">
              </div>
              <div class="form-group">
                <label>${t('moodleCategories.parentCategory')}</label>
                <select name="parentId">
                  <option value="">${t('moodleCategories.topLevel')}</option>
                  ${categories.map(cat => `
                    <option value="${cat.id}" ${cat.id === category.parentId ? 'selected' : ''}>${cat.name}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>${t('common.description')}</label>
                <textarea name="description" rows="3">${category.description || ''}</textarea>
              </div>
              <div class="form-group">
                <label>${t('moodleCategories.sortOrder')}</label>
                <input type="number" name="sortOrder" value="${category.sortOrder || 0}" min="0">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">${t('common.cancel')}</button>
              <button type="submit" class="btn-primary">${t('common.saveChanges')}</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);
    } catch (error) {
      console.error('Edit category error:', error);
      showToast(t('moodleCategories.loadDataError'));
    }
  },

  /**
   * 提交編輯類別
   */
  async submitEditCategory(e, categoryId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
      const result = await API.courseCategories.update(categoryId, {
        name: formData.get('name'),
        parentId: formData.get('parentId') || null,
        description: formData.get('description'),
        sortOrder: parseInt(formData.get('sortOrder')) || 0
      });

      if (result.success) {
        showToast(t('moodleCategories.updated'));
        document.getElementById('editCategoryModal').remove();
        await this.loadCategoriesTree();
        await this.selectCategory(categoryId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      console.error('Update category error:', error);
      showToast(t('moodleCategories.updateError'));
    }
  },

  /**
   * 刪除類別
   */
  async deleteCategory(categoryId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleCategories.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.courseCategories.delete(categoryId);
      if (result.success) {
        showToast(t('moodleGradeCategory.deleted'));
        await this.loadCategoriesTree();
        document.getElementById('categoryDetailPanel').innerHTML = `
          <div class="empty-state">
            <p>${t('moodleCategories.selectCategoryHint')}</p>
          </div>
        `;
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete category error:', error);
      showToast(t('moodleCategories.deleteError'));
    }
  },

  // ==================== 初始化 ====================

  /**
   * 初始化 Moodle UI
   */
  init() {
    if (this._initialized) {
      this.applyDynamicUiMetrics(document);
      return;
    }
    this._initialized = true;
    this.ensureDynamicUiMetricsObserver();
    this.setupQuizAutosaveLifecycleHandlers();
    this.applyDynamicUiMetrics(document);
    // 定期更新通知數量
    this.updateNotificationCount();
    setInterval(() => this.updateNotificationCount(), 60000);
  },

  /**
   * 評量標準管理
   */
  currentRubricsFilter: 'all',

  async openRubricsManager() {
    const container = document.getElementById('rubricsContent');
    if (!container) return;
    if (!this.ensureViewVisible('rubrics')) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const [rubricsResult, templatesResult] = await Promise.all([
        API.rubrics.list(),
        API.rubrics.getTemplates()
      ]);
      const rubrics = rubricsResult.success ? (Array.isArray(rubricsResult.data) ? rubricsResult.data : (rubricsResult.data?.rubrics || [])) : [];
      const templates = templatesResult.success ? (Array.isArray(templatesResult.data) ? templatesResult.data : (templatesResult.data?.templates || [])) : [];
      this._rubricsData = rubrics;
      this._rubricsTemplates = templates;
      this.renderRubricsPage(container, rubrics, templates);
    } catch (error) {
      console.error('Open rubrics manager error:', error);
      container.innerHTML = `<div class="error">${t('moodleRubrics.loadFailed')}</div>`;
    }
  },

  renderRubricsPage(container, rubrics, templates) {
    const filtered = this.currentRubricsFilter === 'all' ? rubrics :
      rubrics.filter(r => r.status === this.currentRubricsFilter);

    container.innerHTML = `
      <div class="rubrics-container">
      <div class="rubrics-header">
        <h2>${t('moodleRubrics.title')}</h2>
        <div class="rubrics-toolbar">
          <button onclick="MoodleUI.openCreateRubricModal()" class="btn-primary">+ ${t('moodleRubrics.createBtn')}</button>
          ${templates.length > 0 ? '<button onclick="MoodleUI.openCreateRubricFromTemplate()" class="btn-secondary">從範本建立</button>' : ''}
        </div>
      </div>
      <div class="badges-tabs">
        ${['all','active','draft'].map(f => `
          <button class="badge-tab ${this.currentRubricsFilter === f ? 'active' : ''}"
                  onclick="MoodleUI.currentRubricsFilter='${f}';MoodleUI.renderRubricsPage(document.getElementById('rubricsContent'),MoodleUI._rubricsData,MoodleUI._rubricsTemplates)">
            ${f === 'all' ? t('common.all') : f === 'active' ? t('common.active') : t('common.draft')}
          </button>
        `).join('')}
      </div>
      <div class="rubrics-list">
        ${filtered.length === 0 ? this.renderActivityEmptyState({
          icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
          title: t('moodleRubrics.noRubrics')
        }) :
          filtered.map(r => `
            <button type="button" class="rubric-card" onclick="MoodleUI.viewRubricDetail(${this.toInlineActionValue(r.rubricId || r.id)})">
              <div class="rubric-card-header">
                <div class="rubric-info">
                  <h3>${this.escapeText(r.name || t('common.unnamed'))}</h3>
                  <p>${this.escapeText(this.truncateText(r.description || t('common.noDescription'), 140))}</p>
                  <div class="rubric-meta">
                    <span>${t('moodleRubrics.criteria')}：${(r.criteria || []).length}</span>
                    <span>${t('moodleRubrics.maxScore')}：${r.maxScore || 0}</span>
                  </div>
                </div>
                <span class="badge-status-pill ${r.status === 'active' ? 'is-active' : 'is-draft'}">${r.status === 'active' ? t('common.active') : t('common.draft')}</span>
              </div>
              <div class="rubric-preview">
                <ul class="rubric-criteria-preview">
                  ${(r.criteria || []).slice(0, 3).map(c => `<li>${this.escapeText(c.name || t('moodleRubrics.criteria'))}</li>`).join('')}
                  ${(r.criteria || []).length > 3 ? `<li>+ ${(r.criteria || []).length - 3} ${t('moodleRubrics.criteria')}</li>` : ''}
                </ul>
              </div>
            </button>
          `).join('')}
      </div>
      </div>`;
  },

  async viewRubricDetail(rubricId) {
    const container = document.getElementById('rubricsContent');
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const user = (typeof API !== 'undefined' && API.getCurrentUser) ? API.getCurrentUser() : null;
      const result = await API.rubrics.get(rubricId);
      if (!result.success) { container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`; return; }
      const r = result.data;
      const criteria = r.criteria || [];
      const canManage = this.canManageRubric(r, user);
      container.innerHTML = `
        <div class="rubrics-container">
        <button onclick="MoodleUI.openRubricsManager()" class="btn-back">${t('common.backToList')}</button>
        <div class="rubric-card">
          <div class="rubric-card-header">
          <div class="rubric-info">
            <h3>${this.escapeText(r.name || t('common.unnamed'))}</h3>
            <p>${this.escapeText(r.description || '')}</p>
            <div class="rubric-meta">
              <span>${t('moodleRubrics.criteria')}：${criteria.length}</span>
              <span>${t('moodleRubrics.maxScore')}：${r.maxScore || 0}</span>
            </div>
          </div>
          <div class="rubric-actions">
            <button onclick="MoodleUI.duplicateRubric(${this.toInlineActionValue(rubricId)})" class="btn-sm btn-secondary">${t('common.duplicate')}</button>
            ${canManage ? `<button onclick="MoodleUI.openEditRubricModal(${this.toInlineActionValue(rubricId)})" class="btn-sm">${t('common.edit')}</button>` : ''}
            ${canManage ? `<button onclick="MoodleUI.deleteRubric(${this.toInlineActionValue(rubricId)})" class="btn-sm btn-danger">${t('moodleGradeCategory.delete')}</button>` : ''}
          </div>
          </div>
        <div class="rubric-preview">
          <div class="badge-detail-info">
            <div class="badge-info-item">
              <label>${t('common.status')}</label>
              <span>${r.status === 'active' ? t('common.active') : t('common.draft')}</span>
            </div>
            <div class="badge-info-item">
              <label>${t('moodleRubrics.criteria')}</label>
              <span>${criteria.length}</span>
            </div>
            <div class="badge-info-item">
              <label>${t('moodleRubrics.maxScore')}</label>
              <span>${r.maxScore || 0}</span>
            </div>
            <div class="badge-info-item">
              <label>${t('moodleGradebook.letterCol')}</label>
              <span>${criteria.reduce((count, item) => count + (item.levels || []).length, 0)}</span>
            </div>
          </div>
          <div class="badge-table-shell">
          <table class="rubric-table">
            <thead>
              <tr>
                <th class="criterion-header">${t('moodleRubrics.criteria')}</th>
                <th>${t('common.description')}</th>
                <th>${t('moodleGrade.score')}</th>
                <th>${t('moodleGradebook.letterCol')}</th>
              </tr>
            </thead>
            <tbody>
              ${criteria.map(c => `
                <tr>
                  <td>${this.escapeText(c.name || '')}</td>
                  <td>${this.escapeText(c.description || '')}</td>
                  <td>${c.maxScore || c.points || 0}</td>
                  <td>
                    <div class="rubric-level-tags">
                    ${(c.levels || []).map(l => `<span class="rubric-level-tag">${this.escapeText(l.name)}: ${l.score || l.points || 0}</span>`).join('')}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        </div>
        </div>
        </div>`;
    } catch (error) {
      console.error('View rubric detail error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  renderRubricCriterionBuilder(criterion = {}) {
    const levels = Array.isArray(criterion.levels) && criterion.levels.length > 0
      ? criterion.levels
      : [
          { name: t('moodleRubrics.levelExcellent'), score: 25 },
          { name: t('moodleRubrics.levelGood'), score: 18 },
          { name: t('moodleRubrics.levelNeedsWork'), score: 10 }
        ];

    return `
      <div class="rubric-criterion-item">
        <div class="rubric-criterion-header">
          <div class="form-group">
            <label>${t('moodleRubrics.criterionName')}</label>
            <input type="text" class="criterion-name" placeholder="${t('moodleRubrics.criterionNamePlaceholder')}" value="${this.escapeText(criterion.name || '')}">
          </div>
          <div class="form-group">
            <label>${t('moodleRubrics.maxScore')}</label>
            <input type="number" class="criterion-score" value="${this.escapeText(criterion.maxScore || 25)}" min="0">
          </div>
          <button type="button" class="rubric-criterion-remove" onclick="this.closest('.rubric-criterion-item').remove()" aria-label="${this.escapeText(t('common.delete') || 'Delete')}">×</button>
        </div>
        <div class="form-group">
          <label>${t('common.description')}</label>
          <input type="text" class="criterion-desc" placeholder="${t('moodleRubrics.criterionDescPlaceholder')}" value="${this.escapeText(criterion.description || '')}">
        </div>
        <div class="criterion-levels">
          ${levels.map(level => `
            <div class="criterion-level-chip">
              <input type="text" class="level-name" value="${this.escapeText(level.name || '')}">
              <input type="number" class="level-score" value="${this.escapeText(level.score || level.points || 0)}" min="0">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  openCreateRubricModal(rubric = null) {
    this.closeModal('createRubricModal');
    const isEditing = !!rubric;
    const modal = document.createElement('div');
    modal.id = 'createRubricModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content rubric-builder-modal">
        <div class="modal-header">
          <h3>${isEditing ? (I18n.getLocale() === 'en' ? 'Edit Rubric' : '編輯評量指標') : t('moodleRubrics.createTitle')}</h3>
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="rubric-builder-section">
            <input type="hidden" id="rubricId" value="${this.escapeText(rubric?.rubricId || rubric?.id || '')}">
            <div class="form-group">
              <label>${t('common.name')} *</label>
              <input type="text" id="rubricName" placeholder="${t('moodleRubrics.namePlaceholder')}" value="${this.escapeText(rubric?.name || '')}">
            </div>
            <div class="form-group">
              <label>${t('common.description')}</label>
              <textarea id="rubricDescription" rows="2" placeholder="${t('moodleRubrics.descPlaceholder')}">${this.escapeText(rubric?.description || '')}</textarea>
            </div>
            <div class="form-group">
              <label>${t('common.status')}</label>
              <select id="rubricStatus"><option value="draft" ${(rubric?.status || 'draft') === 'draft' ? 'selected' : ''}>${t('common.draft')}</option><option value="active" ${(rubric?.status || 'draft') === 'active' ? 'selected' : ''}>${t('common.active')}</option></select>
            </div>
            <div class="rubric-builder-heading">
              <h4>${t('moodleRubrics.gradingCriteria')}</h4>
              <button onclick="MoodleUI.addRubricCriterion()" class="btn-sm btn-secondary">${t('moodleRubrics.addCriterion')}</button>
            </div>
            <div id="rubricCriteriaList" class="rubric-builder-list">
              ${(Array.isArray(rubric?.criteria) && rubric.criteria.length > 0
                ? rubric.criteria.map(item => this.renderRubricCriterionBuilder(item)).join('')
                : this.renderRubricCriterionBuilder())}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveRubric()" class="btn-primary">${isEditing ? t('common.save') : t('common.create')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createRubricModal'); };
  },

  addRubricCriterion() {
    const list = document.getElementById('rubricCriteriaList');
    if (!list) return;
    list.insertAdjacentHTML('beforeend', this.renderRubricCriterionBuilder());
  },

  async saveRubric() {
    const rubricId = document.getElementById('rubricId')?.value?.trim();
    const name = document.getElementById('rubricName')?.value?.trim();
    if (!name) { showToast(t('common.nameRequired')); return; }
    const items = document.querySelectorAll('.rubric-criterion-item');
    const criteria = [];
    items.forEach(item => {
      const cName = item.querySelector('.criterion-name')?.value?.trim();
      if (!cName) return;
      const levels = [];
      item.querySelectorAll('.criterion-levels > div').forEach(ld => {
        levels.push({ name: ld.querySelector('.level-name')?.value || '', score: parseInt(ld.querySelector('.level-score')?.value) || 0 });
      });
      criteria.push({
        name: cName,
        description: item.querySelector('.criterion-desc')?.value || '',
        maxScore: parseInt(item.querySelector('.criterion-score')?.value) || 0,
        levels
      });
    });
    try {
      const payload = {
        name,
        description: document.getElementById('rubricDescription')?.value || '',
        status: document.getElementById('rubricStatus')?.value || 'draft',
        criteria
      };
      const result = rubricId
        ? await API.rubrics.update(rubricId, payload)
        : await API.rubrics.create(payload);
      if (result.success) {
        showToast(rubricId
          ? (I18n.getLocale() === 'en' ? 'Rubric updated' : '評量指標已更新')
          : t('moodleRubrics.created'));
        this.closeModal('createRubricModal');
        if (rubricId) {
          this.viewRubricDetail(rubricId);
        } else {
          this.openRubricsManager();
        }
      } else { showToast(result.error || (rubricId ? t('common.updateFailed') : t('common.createFailed'))); }
    } catch (error) {
      console.error('Save rubric error:', error);
      showToast(rubricId ? t('common.updateFailed') : t('moodleRubrics.createError'));
    }
  },

  async openEditRubricModal(rubricId) {
    try {
      const result = await API.rubrics.get(rubricId);
      if (!result.success) {
        showToast(t('common.loadFailed'));
        return;
      }
      this.openCreateRubricModal(result.data);
    } catch (error) {
      console.error('Open edit rubric modal error:', error);
      showToast(t('common.loadFailed'));
    }
  },

  async deleteRubric(rubricId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleRubrics.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.rubrics.delete(rubricId);
      if (result.success) { showToast(t('common.deleted')); this.openRubricsManager(); }
      else { showToast(result.error || t('common.deleteFailed')); }
    } catch (error) { showToast(t('common.deleteFailed')); }
  },

  async duplicateRubric(rubricId) {
    try {
      const result = await API.rubrics.duplicate(rubricId);
      if (result.success) { showToast(t('common.copied')); this.openRubricsManager(); }
      else { showToast(result.error || t('common.copyFailed')); }
    } catch (error) { showToast(t('common.copyFailed')); }
  },

  openCreateRubricFromTemplate() {
    const templates = this._rubricsTemplates || [];
    const modal = document.createElement('div');
    modal.id = 'rubricTemplateModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content rubric-template-modal">
        <div class="modal-header">
          <h3>${t('moodleRubrics.createFromTemplate')}</h3>
          <button onclick="MoodleUI.closeModal('rubricTemplateModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="rubric-template-list">
            ${templates.map(templateItem => `
              <div class="rubric-template-option"
                   onclick="MoodleUI.closeModal('rubricTemplateModal');MoodleUI.duplicateRubric(${this.toInlineActionValue(templateItem.rubricId || templateItem.id)})">
                <h4>${this.escapeText(templateItem.name || (I18n.getLocale() === 'en' ? 'Template' : '範本'))}</h4>
                <p>${this.escapeText(templateItem.description || t('moodleRubrics.descPlaceholder'))}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('rubricTemplateModal'); };
  },

  /**
   * 學習進度
   */
  async openLearningProgress(courseId = null, options = {}) {
    const container = document.getElementById('learningPathsContent');
    if (!container) return;
    if (!options.skipShowView) {
      showView('learningProgress', {
        path: options.path || '/platform/learning-progress',
        replaceHistory: options.replaceHistory
      });
    }
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    if (courseId) {
      await this.viewCourseLearningProgress(courseId, {
        container,
        skipShowView: true
      });
      return;
    }

    try {
      const courses = await this.getRoleScopedCourses({ filters: { status: 'published' } }).catch(() => []);
      this.currentLearningProgressCourses = Array.isArray(courses) ? courses : [];
      this.renderLearningProgressOverview(container, this.currentLearningProgressCourses);
    } catch (error) {
      console.error('Open learning progress error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  async openLearningPaths(courseId = null, options = {}) {
    return this.openLearningProgress(courseId, options);
  },

  formatLearningProgressTime(totalSeconds = 0) {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const isEnglish = I18n.getLocale() === 'en';

    if (safeSeconds >= 3600) {
      const hours = Math.round((safeSeconds / 3600) * 10) / 10;
      return isEnglish ? `${hours} hrs` : `${hours} 小時`;
    }

    if (safeSeconds >= 60) {
      const minutes = Math.round(safeSeconds / 60);
      return isEnglish ? `${minutes} mins` : `${minutes} 分鐘`;
    }

    return isEnglish ? `${safeSeconds} secs` : `${safeSeconds} 秒`;
  },

  formatLearningProgressLastAccess(value, { includeDateTime = false } = {}) {
    const uiCopy = this.getLearningProgressUiCopy();
    if (!value) return uiCopy.noRecord;
    const formatted = includeDateTime
      ? this.formatPlatformDate(value, { dateStyle: 'medium', timeStyle: 'short' })
      : this.formatTimeAgo(value);
    return formatted || uiCopy.noRecord;
  },

  renderLearningProgressOverview(container, courses = []) {
    const uiCopy = this.getLearningProgressUiCopy();
    const user = API.getCurrentUser();
    const trackedCourses = (Array.isArray(courses) ? courses : [])
      .filter(course => Boolean(course?.courseId || course?.id))
      .sort((a, b) => {
        const aStats = this.getLearningProgressCourseStats(a);
        const bStats = this.getLearningProgressCourseStats(b);
        return new Date(bStats.lastAccessedAt || 0).getTime() - new Date(aStats.lastAccessedAt || 0).getTime();
      });
    const aggregate = trackedCourses.reduce((acc, course) => {
      const stats = this.getLearningProgressCourseStats(course);
      acc.totalTimeSpent += stats.totalTimeSpent;
      if (stats.isCompleted) acc.completedCourses += 1;
      if (stats.lastAccessedAt) {
        const lastActivityAt = new Date(stats.lastAccessedAt).getTime();
        if (lastActivityAt > acc.lastActivityAt) {
          acc.lastActivityAt = lastActivityAt;
          acc.lastAccessedAt = stats.lastAccessedAt;
        }
      }
      return acc;
    }, {
      totalTimeSpent: 0,
      completedCourses: 0,
      lastActivityAt: 0,
      lastAccessedAt: null
    });

    container.innerHTML = `
      <div class="learning-progress-shell">
        <div class="learning-progress-hero">
          <div class="learning-progress-hero-copy">
            <span class="learning-progress-kicker">${this.escapeText(I18n.getLocale() === 'en' ? 'Progress Center' : '學習進度中心')}</span>
            <h2>${this.escapeText(uiCopy.title)}</h2>
            <p>${this.escapeText(uiCopy.subtitle)}</p>
            ${user && this.isTeachingRole(user) && user.role !== 'student'
              ? `<div class="learning-progress-note">${this.escapeText(uiCopy.teacherHint)}</div>`
              : ''}
          </div>
          <div class="learning-progress-summary-grid">
            <div class="learning-progress-summary-card">
              <label>${this.escapeText(uiCopy.totalCourses)}</label>
              <strong>${trackedCourses.length}</strong>
            </div>
            <div class="learning-progress-summary-card">
              <label>${this.escapeText(uiCopy.completedCourses)}</label>
              <strong>${aggregate.completedCourses}</strong>
            </div>
            <div class="learning-progress-summary-card">
              <label>${this.escapeText(uiCopy.totalTime)}</label>
              <strong>${this.escapeText(this.formatLearningProgressTime(aggregate.totalTimeSpent))}</strong>
            </div>
            <div class="learning-progress-summary-card">
              <label>${this.escapeText(uiCopy.lastLearning)}</label>
              <strong>${this.escapeText(this.formatLearningProgressLastAccess(aggregate.lastAccessedAt))}</strong>
            </div>
          </div>
        </div>

        <div class="learning-progress-course-grid">
          ${trackedCourses.length === 0 ? this.renderActivityEmptyState({
            icon: '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
            title: uiCopy.noCoursesTitle,
            hint: uiCopy.noCoursesHint
          }) : trackedCourses.map(course => {
            const courseId = course.courseId || course.id || '';
            const stats = this.getLearningProgressCourseStats(course);
            const description = this.truncateText(
              course.summary || course.description || (I18n.getLocale() === 'en' ? 'Keep learning and review your detailed activity records.' : '持續學習並查看每個活動的學習紀錄。'),
              150
            );
            return `
              <article class="learning-progress-course-card ${this.getSurfaceToneClass(courseId || course.title || course.name || '')}">
                <div class="learning-progress-course-head">
                  <div>
                    <div class="learning-progress-course-title">${this.escapeText(course.title || course.name || t('common.unnamed'))}</div>
                    <p class="learning-progress-course-desc">${this.escapeText(description)}</p>
                  </div>
                  <span class="learning-progress-status-chip ${stats.isCompleted ? 'completed' : (stats.hasStarted ? 'in-progress' : 'not-started')}">
                    ${this.escapeText(stats.isCompleted ? uiCopy.completed : (stats.hasStarted ? uiCopy.inProgress : uiCopy.notStarted))}
                  </span>
                </div>

                <div class="learning-progress-course-metrics">
                  <div class="learning-progress-metric">
                    <label>${this.escapeText(uiCopy.overallProgress)}</label>
                    <strong>${stats.progressPercentage}%</strong>
                  </div>
                  <div class="learning-progress-metric">
                    <label>${this.escapeText(uiCopy.completedActivities)}</label>
                    <strong>${stats.completedActivities} / ${stats.totalActivities || 0}</strong>
                  </div>
                  <div class="learning-progress-metric">
                    <label>${this.escapeText(uiCopy.totalTime)}</label>
                    <strong>${this.escapeText(this.formatLearningProgressTime(stats.totalTimeSpent))}</strong>
                  </div>
                  <div class="learning-progress-metric">
                    <label>${this.escapeText(uiCopy.lastLearning)}</label>
                    <strong>${this.escapeText(this.formatLearningProgressLastAccess(stats.lastAccessedAt))}</strong>
                  </div>
                </div>

                <div class="learning-progress-course-bar">
                  <div class="progress-bar">
                    <div class="progress-fill" data-progress-width="${stats.progressPercentage}"></div>
                  </div>
                </div>

                <div class="learning-progress-course-actions">
                  <button type="button" class="btn-secondary btn-sm" onclick="MoodleUI.viewCourseLearningProgress(${this.toInlineActionValue(courseId)})">
                    ${this.escapeText(uiCopy.viewDetails)}
                  </button>
                  <button type="button" class="btn-primary btn-sm" onclick="MoodleUI.openCourse(${this.toInlineActionValue(courseId)})">
                    ${this.escapeText(uiCopy.openCourse)}
                  </button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </div>
    `;
    this.applyDynamicUiMetrics(container);
  },

  async viewCourseLearningProgress(courseId, options = {}) {
    const container = options.container || document.getElementById('learningPathsContent');
    if (!container || !courseId) return;
    if (!options.skipShowView) {
      showView('learningProgress', {
        path: options.path || '/platform/learning-progress',
        replaceHistory: options.replaceHistory
      });
    }
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const result = await API.courses.get(courseId);
      if (!result.success || !result.data) {
        container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
        return;
      }
      const course = this.normalizeCourseRecord(result.data || {});
      this.currentLearningProgressCourse = course;
      const uiCopy = this.getLearningProgressUiCopy();
      const stats = this.getLearningProgressCourseStats(course);
      const sections = this.getLearningProgressSections(course);
      const activityTypeLabels = {
        page: I18n.getLocale() === 'en' ? 'Page' : '頁面',
        url: I18n.getLocale() === 'en' ? 'Link' : '連結',
        file: I18n.getLocale() === 'en' ? 'File' : '檔案',
        assignment: I18n.getLocale() === 'en' ? 'Assignment' : '作業',
        quiz: I18n.getLocale() === 'en' ? 'Quiz' : '測驗',
        forum: I18n.getLocale() === 'en' ? 'Forum' : '討論區',
        label: I18n.getLocale() === 'en' ? 'Label' : '標籤',
        lti: 'LTI'
      };

      container.innerHTML = `
        <div class="learning-progress-detail">
          <button type="button" class="btn-back" onclick="MoodleUI.openLearningProgress()">${this.escapeText(uiCopy.backToOverview)}</button>

          <div class="learning-progress-detail-hero">
            <div class="learning-progress-detail-copy">
              <span class="learning-progress-kicker">${this.escapeText(uiCopy.courseSummary)}</span>
              <h2>${this.escapeText(course.title || course.name || t('common.unnamed'))}</h2>
              <p>${this.escapeText(course.description || course.summary || t('common.noDescription'))}</p>
            </div>
            <div class="learning-progress-detail-actions">
              <button type="button" class="btn-primary btn-sm" onclick="MoodleUI.openCourse(${this.toInlineActionValue(courseId)})">
                ${this.escapeText(uiCopy.openCourse)}
              </button>
            </div>
          </div>

          <div class="learning-progress-summary-grid">
            <div class="learning-progress-summary-card">
              <label>${this.escapeText(uiCopy.overallProgress)}</label>
              <strong>${stats.progressPercentage}%</strong>
            </div>
            <div class="learning-progress-summary-card">
              <label>${this.escapeText(uiCopy.completedActivities)}</label>
              <strong>${stats.completedActivities} / ${stats.totalActivities || 0}</strong>
            </div>
            <div class="learning-progress-summary-card">
              <label>${this.escapeText(uiCopy.totalTime)}</label>
              <strong>${this.escapeText(this.formatLearningProgressTime(stats.totalTimeSpent))}</strong>
            </div>
            <div class="learning-progress-summary-card">
              <label>${this.escapeText(uiCopy.lastLearning)}</label>
              <strong>${this.escapeText(this.formatLearningProgressLastAccess(stats.lastAccessedAt, { includeDateTime: true }))}</strong>
            </div>
          </div>

          <div class="learning-progress-detail-progress">
            <div class="progress-bar">
              <div class="progress-fill" data-progress-width="${stats.progressPercentage}"></div>
            </div>
          </div>

          <div class="learning-progress-section-list">
            <div class="learning-progress-section-heading">
              <h3>${this.escapeText(uiCopy.activityDetails)}</h3>
            </div>
            ${sections.length === 0 ? this.renderActivityEmptyState({
              icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
              title: uiCopy.noCoursesTitle,
              hint: uiCopy.noCoursesHint
            }) : sections.map(section => `
              <section class="learning-progress-section">
                <div class="learning-progress-section-head">
                  <div>
                    <h4>${this.escapeText(section.sectionTitle)}</h4>
                    ${section.summary ? `<p>${this.escapeText(section.summary)}</p>` : ''}
                  </div>
                  <span class="learning-progress-section-count">${section.activities.length}</span>
                </div>
                <div class="learning-progress-activity-list">
                  ${section.activities.map(activity => {
                    const launchActivityId = activity.launchActivityId || activity.activityId;
                    const openAction = activity.isBrokenLink || !launchActivityId
                      ? `showToast(${this.toInlineActionValue(I18n.getLocale() === 'en' ? 'This activity link needs repair before it can be opened.' : '這個活動連結需要先修復，才能開啟。')})`
                      : `MoodleUI.openActivity(${this.toInlineActionValue(activity.type)}, ${this.toInlineActionValue(launchActivityId)}, ${this.toInlineActionValue(courseId)})`;
                    return `
                      <article class="learning-progress-activity-row">
                        <div class="learning-progress-activity-main">
                          <div class="learning-progress-activity-seq">${this.escapeText(activity.sequenceLabel)}</div>
                          <div class="learning-progress-activity-copy">
                            <div class="learning-progress-activity-meta">
                              <span class="learning-progress-type-chip">${this.escapeText(activityTypeLabels[activity.type] || activity.type || '—')}</span>
                              <span class="learning-progress-status-chip ${activity.statusClass}">${this.escapeText(activity.statusLabel)}</span>
                            </div>
                            <h5>${this.escapeText(activity.name || activity.title || t('common.unnamed'))}</h5>
                            ${activity.description ? `<p>${this.escapeText(this.truncateText(activity.description, 180))}</p>` : ''}
                          </div>
                        </div>
                        <div class="learning-progress-activity-stats">
                          <div class="learning-progress-activity-stat">
                            <label>${this.escapeText(uiCopy.totalTime)}</label>
                            <strong>${this.escapeText(this.formatLearningProgressTime(activity.totalTimeSpent))}</strong>
                          </div>
                          <div class="learning-progress-activity-stat">
                            <label>${this.escapeText(uiCopy.lastStudied)}</label>
                            <strong>${this.escapeText(this.formatLearningProgressLastAccess(activity.lastAccessedAt))}</strong>
                            ${activity.lastAccessedAt ? `<small>${this.escapeText(this.formatLearningProgressLastAccess(activity.lastAccessedAt, { includeDateTime: true }))}</small>` : ''}
                          </div>
                          <div class="learning-progress-activity-stat">
                            <label>${this.escapeText(uiCopy.overallProgress)}</label>
                            <strong>${activity.progressPercentage}%</strong>
                          </div>
                        </div>
                        <div class="learning-progress-activity-actions">
                          <button type="button" class="btn-secondary btn-sm" onclick="${openAction}">
                            ${this.escapeText(uiCopy.openActivity)}
                          </button>
                        </div>
                      </article>
                    `;
                  }).join('')}
                </div>
              </section>
            `).join('')}
          </div>
        </div>
      `;
      this.applyDynamicUiMetrics(container);
    } catch (error) {
      console.error('View learning progress detail error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  /**
   * 稽核日誌
   */
  currentAuditFilters: { eventType: '', severity: '', page: 1 },

  async openAuditLogs() {
    const container = document.getElementById('auditLogsContent');
    if (!container) return;
    if (!this.ensureViewVisible('auditLogs')) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const [logsResult, eventTypesResult, statsResult] = await Promise.all([
        API.auditLogs.list(this.currentAuditFilters),
        API.auditLogs.getEventTypes(),
        API.auditLogs.getStats()
      ]);
      const logs = logsResult.success ? (Array.isArray(logsResult.data) ? logsResult.data : (logsResult.data?.logs || [])) : [];
      const eventTypes = eventTypesResult.success ? (Array.isArray(eventTypesResult.data) ? eventTypesResult.data : (eventTypesResult.data?.eventTypes || [])) : [];
      const stats = statsResult.success ? statsResult.data : {};
      const pagination = logsResult.data?.pagination || {};
      this._auditEventTypes = eventTypes;
      this.renderAuditLogsPage(container, logs, eventTypes, stats, pagination);
    } catch (error) {
      console.error('Open audit logs error:', error);
      container.innerHTML = `<div class="error">${t('moodleAudit.loadFailed')}</div>`;
    }
  },

  renderAuditLogsPage(container, logs, eventTypes, stats, pagination) {
    const severityLabels = { info: t('moodleAudit.severityInfo'), warning: t('moodleAudit.severityWarning'), error: t('moodleAudit.severityError'), critical: t('moodleAudit.severityCritical') };
    const severityCounts = Object.keys(stats.severityCounts || {}).length > 0
      ? stats.severityCounts
      : logs.reduce((acc, log) => {
          const key = String(log?.severity || 'info').toLowerCase();
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
    const statCards = [
      {
        label: t('moodleAudit.totalRecords'),
        value: String(stats.totalLogs || logs.length || 0)
      },
      ...Object.entries(severityCounts).map(([severity, count]) => ({
        label: severityLabels[severity] || severity,
        value: String(count || 0),
        tone: ({
          info: 'tone-info',
          warning: 'tone-warning',
          error: 'tone-danger',
          critical: 'tone-critical'
        })[severity] || ''
      }))
    ];

    container.innerHTML = `
      <div class="audit-logs-page">
        <div class="page-header">
          <h1>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16"/>
              <path d="M4 12h16"/>
              <path d="M4 18h10"/>
            </svg>
            ${t('moodleAudit.title')}
          </h1>
          <div class="header-actions">
            <button onclick="MoodleUI.exportAuditLogs('csv')" class="btn-secondary btn-sm">${t('moodleGradebook.exportCsv')}</button>
            <button onclick="MoodleUI.exportAuditLogs('json')" class="btn-secondary btn-sm">${t('moodleAudit.exportJson')}</button>
          </div>
        </div>
        ${this.renderManagementMetricGrid(statCards)}
        <div class="audit-filters">
          <div class="filter-row">
            <div class="filter-group">
              <label>${t('moodleAudit.eventType')}</label>
              <select id="auditFilterType" onchange="MoodleUI.filterAuditLogs()">
                <option value="">${t('common.all')}</option>
                ${eventTypes.map(eventType => {
                  const value = eventType.type || eventType;
                  const label = eventType.label || eventType.name || eventType;
                  return `<option value="${this.escapeText(value)}" ${this.currentAuditFilters.eventType === value ? 'selected' : ''}>${this.escapeText(label)}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="filter-group">
              <label>${t('moodleAudit.severity')}</label>
              <select id="auditFilterSeverity" onchange="MoodleUI.filterAuditLogs()">
                <option value="">${t('common.all')}</option>
                <option value="info" ${this.currentAuditFilters.severity === 'info' ? 'selected' : ''}>${t('moodleAudit.severityInfo')}</option>
                <option value="warning" ${this.currentAuditFilters.severity === 'warning' ? 'selected' : ''}>${t('moodleAudit.severityWarning')}</option>
                <option value="error" ${this.currentAuditFilters.severity === 'error' ? 'selected' : ''}>${t('moodleAudit.severityError')}</option>
                <option value="critical" ${this.currentAuditFilters.severity === 'critical' ? 'selected' : ''}>${t('moodleAudit.severityCritical')}</option>
              </select>
            </div>
            <div class="filter-group">
              <label>${t('moodleAudit.startDate')}</label>
              <input type="date" id="auditFilterStartDate" value="${this.escapeText(this.currentAuditFilters.startDate || '')}" onchange="MoodleUI.filterAuditLogs()">
            </div>
            <div class="filter-group">
              <label>${t('moodleAudit.endDate')}</label>
              <input type="date" id="auditFilterEndDate" value="${this.escapeText(this.currentAuditFilters.endDate || '')}" onchange="MoodleUI.filterAuditLogs()">
            </div>
          </div>
        </div>
        <div class="audit-logs-container">
          <table class="audit-table">
            <thead>
              <tr>
                <th>${t('moodleAudit.timeCol')}</th>
                <th>${t('moodleAudit.eventType')}</th>
                <th>${t('common.user')}</th>
                <th>IP</th>
                <th>${t('common.description')}</th>
                <th class="is-center">${t('moodleAudit.severity')}</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0 ? `
                <tr>
                  <td colspan="6" class="is-center">${t('moodleAudit.noLogs') || '無記錄'}</td>
                </tr>
              ` : logs.map(log => {
                const severity = String(log.severity || 'info').toLowerCase();
                const eventType = log.eventType || '—';
                const categoryClass = this.getAuditCategoryClass(eventType);
                const userName = log.userName || log.userId || '—';
                const userEmail = log.userEmail || log.email || '';
                const description = log.description || log.message || '—';
                return `
                  <tr class="${severity === 'warning' || severity === 'error' || severity === 'critical' ? `severity-${severity}` : ''}">
                    <td class="log-time">${this.escapeText(this.formatPlatformDate(log.createdAt || log.timestamp, { dateStyle: 'medium', timeStyle: 'short' }))}</td>
                    <td>
                      <span class="event-badge ${categoryClass}">${this.escapeText(eventType)}</span>
                    </td>
                    <td>
                      <div class="log-user">
                        <span class="user-name">${this.escapeText(userName)}</span>
                        ${userEmail ? `<span class="user-email">${this.escapeText(userEmail)}</span>` : ''}
                      </div>
                    </td>
                    <td class="log-ip">${this.escapeText(log.ipAddress || log.ip || '—')}</td>
                    <td><span class="log-desc" title="${this.escapeText(description)}">${this.escapeText(description)}</span></td>
                    <td class="is-center">
                      <span class="severity-badge ${this.escapeText(severity)}">${this.escapeText(severityLabels[severity] || severity || '—')}</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ${pagination.totalPages > 1 ? `
        <div class="management-pagination">
          ${this.currentAuditFilters.page > 1 ? `<button onclick="MoodleUI.currentAuditFilters.page--;MoodleUI.openAuditLogs()" class="btn-sm btn-secondary">上一頁</button>` : ''}
          <span class="management-pagination-info">${t('moodleAudit.pageInfo', {current: pagination.page || this.currentAuditFilters.page, total: pagination.totalPages})}</span>
          ${(pagination.page || this.currentAuditFilters.page) < pagination.totalPages ? `<button onclick="MoodleUI.currentAuditFilters.page++;MoodleUI.openAuditLogs()" class="btn-sm btn-secondary">下一頁</button>` : ''}
        </div>
      ` : ''}`;
  },

  filterAuditLogs() {
    this.currentAuditFilters.eventType = document.getElementById('auditFilterType')?.value || '';
    this.currentAuditFilters.severity = document.getElementById('auditFilterSeverity')?.value || '';
    this.currentAuditFilters.startDate = document.getElementById('auditFilterStartDate')?.value || '';
    this.currentAuditFilters.endDate = document.getElementById('auditFilterEndDate')?.value || '';
    this.currentAuditFilters.page = 1;
    this.openAuditLogs();
  },

  async exportAuditLogs(format) {
    try {
      const result = await API.auditLogs.export({ ...this.currentAuditFilters, format });
      if (result.success && result.data) {
        const content = format === 'csv' ? result.data : JSON.stringify(result.data, null, 2);
        const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('moodleGradebook.csvExported'));
      } else { showToast(t('moodleGradebook.exportFailed')); }
    } catch (error) {
      console.error('Export audit logs error:', error);
      showToast(t('moodleGradebook.exportFailed'));
    }
  },

  /**
   * H5P 管理
   */
  currentH5pFilter: 'all',

  async openH5pManager() {
    const container = document.getElementById('h5pManagerContent');
    if (!container) return;
    if (!this.ensureViewVisible('h5pManager')) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const [contentResult, typesResult] = await Promise.all([
        API.h5p.list(),
        API.h5p.getTypes()
      ]);
      const contents = contentResult.success ? (Array.isArray(contentResult.data) ? contentResult.data : (contentResult.data?.contents || [])) : [];
      const types = typesResult.success ? (Array.isArray(typesResult.data) ? typesResult.data : (typesResult.data?.types || [])) : [];
      this._h5pData = contents;
      this._h5pTypes = types;
      this.renderH5pPage(container, contents, types);
    } catch (error) {
      console.error('Open H5P manager error:', error);
      container.innerHTML = `<div class="error">${t('moodleH5p.loadFailed')}</div>`;
    }
  },

  renderH5pPage(container, contents, types) {
    const filtered = this.currentH5pFilter === 'all' ? contents :
      contents.filter(c => c.contentType === this.currentH5pFilter || c.status === this.currentH5pFilter);

    container.innerHTML = `
      <div class="h5p-manager-page">
        <div class="page-header">
          <h1>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="14" rx="2"/>
              <line x1="8" y1="20" x2="16" y2="20"/>
              <line x1="12" y1="18" x2="12" y2="20"/>
            </svg>
            ${t('moodleH5p.title')}
          </h1>
          <button onclick="MoodleUI.openCreateH5pModal()" class="btn-primary">+ ${t('moodleH5p.createBtn')}</button>
        </div>
        <div class="management-filter-bar">
          <button class="filter-btn ${this.currentH5pFilter === 'all' ? 'active' : ''}"
                  onclick="MoodleUI.currentH5pFilter='all';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${t('common.all')}</button>
          <button class="filter-btn ${this.currentH5pFilter === 'published' ? 'active' : ''}"
                  onclick="MoodleUI.currentH5pFilter='published';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${t('common.published')}</button>
          <button class="filter-btn ${this.currentH5pFilter === 'draft' ? 'active' : ''}"
                  onclick="MoodleUI.currentH5pFilter='draft';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${t('common.draft')}</button>
          ${types.slice(0, 5).map(typeItem => {
            const typeName = typeItem.name || typeItem.type || typeItem;
            const inlineType = this.toInlineActionValue(typeName);
            return `<button class="filter-btn ${this.currentH5pFilter === typeName ? 'active' : ''}"
                onclick="MoodleUI.currentH5pFilter=${inlineType};MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${this.escapeText(typeName)}</button>`;
          }).join('')}
        </div>
        <div class="h5p-content-grid">
          ${filtered.length === 0
            ? this.renderActivityEmptyState({
                icon: `
                  <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="3" y="4" width="18" height="14" rx="2"/>
                    <line x1="8" y1="20" x2="16" y2="20"/>
                    <line x1="12" y1="18" x2="12" y2="20"/>
                  </svg>
                `,
                title: t('moodleH5p.noContent'),
                hint: t('moodleH5p.createTitle')
              })
            : filtered.map(content => `
              <button type="button" class="h5p-card" onclick="MoodleUI.viewH5pDetail(${this.toInlineActionValue(content.contentId || content.id)})">
                <div class="card-thumbnail">
                  ${this.renderH5pTypeIcon(content.contentType)}
                  <div class="type-name">${this.escapeText(content.contentType || 'H5P')}</div>
                </div>
                <div class="card-body">
                  <h3>${this.escapeText(content.title || t('common.unnamed'))}</h3>
                  <p>${this.escapeText(content.description || t('moodleH5p.descPlaceholder'))}</p>
                  <div class="card-stats">
                    <span>${t('moodleH5p.views')}：${this.escapeText(content.viewCount || 0)}</span>
                    <span>${t('moodleH5p.attempts')}：${this.escapeText(content.attemptCount || 0)}</span>
                    <span class="content-status">${this.renderManagementStatusBadge(content.status, content.status === 'published' ? t('common.published') : t('common.draft'))}</span>
                  </div>
                  <div class="card-actions">
                    <button type="button" class="btn-preview" onclick="event.stopPropagation();MoodleUI.viewH5pDetail(${this.toInlineActionValue(content.contentId || content.id)})">${t('common.view')}</button>
                    <button type="button" class="btn-report" onclick="event.stopPropagation();MoodleUI.duplicateH5pContent(${this.toInlineActionValue(content.contentId || content.id)})">${t('common.duplicate')}</button>
                  </div>
                </div>
              </button>
            `).join('')}
        </div>
      </div>`;
  },

  async viewH5pDetail(contentId) {
    const container = document.getElementById('h5pManagerContent');
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const user = (typeof API !== 'undefined' && API.getCurrentUser) ? API.getCurrentUser() : null;
      const [contentResult, reportResult, embedResult] = await Promise.all([
        API.h5p.get(contentId),
        API.h5p.getReport(contentId).catch(() => ({ success: false })),
        API.h5p.getEmbed(contentId).catch(() => ({ success: false }))
      ]);
      if (!contentResult.success) { container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`; return; }
      const content = contentResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const embed = embedResult.success ? embedResult.data : {};
      const canManage = this.canManageH5pContent(content, user);
      const contentSubtitle = [content.contentType || 'H5P', content.description || '']
        .filter(Boolean)
        .join(' · ');
      const detailActions = [
        {
          label: t('common.duplicate'),
          className: 'btn-secondary btn-sm',
          onclick: `MoodleUI.duplicateH5pContent(${this.toInlineActionValue(contentId)})`
        }
      ];
      if (canManage) {
        detailActions.push({
          label: t('moodleGradeCategory.delete'),
          className: 'btn-sm btn-danger',
          onclick: `MoodleUI.deleteH5pContent(${this.toInlineActionValue(contentId)})`
        });
      }

      container.innerHTML = `
        <div class="management-detail-page">
          ${this.renderManagementDetailHeader({
            backAction: 'MoodleUI.openH5pManager()',
            backLabel: t('common.back'),
            kicker: 'H5P',
            title: content.title || t('common.unnamed'),
            subtitle: contentSubtitle,
            actions: detailActions
          })}
          ${this.renderManagementMetricGrid([
            { label: t('moodleH5p.totalAttempts'), value: String(report.totalAttempts || content.attemptCount || 0) },
            { label: t('moodleH5p.uniqueUsers'), value: String(report.uniqueUsers || 0) },
            { label: t('moodleH5p.avgScore'), value: report.averageScore != null ? `${Math.round(report.averageScore)}%` : '—' },
            { label: t('moodleH5p.viewCount'), value: String(content.viewCount || 0) }
          ])}
          <div class="management-panel-grid">
            <section class="management-panel">
              <h3>${t('moodleH5p.preview')}</h3>
              <div class="management-preview-frame">
                ${(embed.embedCode || embed.html)
                  ? `<div class="management-rich-preview">${embed.embedCode || embed.html}</div>`
                  : `<div class="management-empty-preview">${t('moodleH5p.cannotPreview')}</div>`}
              </div>
            </section>
            <section class="management-panel">
              <h3>${t('common.details')}</h3>
              <div class="management-kv-list">
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleH5p.contentType')}</div>
                  <div class="management-kv-value">${this.escapeText(content.contentType || 'H5P')}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('common.status')}</div>
                  <div class="management-kv-value">${this.renderManagementStatusBadge(content.status, content.status === 'published' ? t('common.published') : t('common.draft'))}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleH5p.assignedCourse')}</div>
                  <div class="management-kv-value">${this.escapeText(content.courseName || content.courseId || t('common.notSpecified'))}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('common.description')}</div>
                  <div class="management-kv-value">${this.escapeText(content.description || '—')}</div>
                </div>
              </div>
            </section>
          </div>
        </div>`;
    } catch (error) {
      console.error('View H5P detail error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  async openCreateH5pModal() {
    const types = this._h5pTypes || [];
    let courseOptions = `<option value="">${t('common.notSpecified')}</option>`;
    try {
      const courses = await this.getRoleScopedCourses({ manageOnly: true });
      courses.forEach(c => { courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`; });
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createH5pModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleH5p.createTitle')}</h3>
          <button onclick="MoodleUI.closeModal('createH5pModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleH5p.contentType')} *</label>
            <select id="h5pContentType">
              ${types.length > 0 ?
                types.map(t => `<option value="${t.type || t.name || t}">${t.name || t.type || t}</option>`).join('') :
                `<option value="Interactive Video">${t('moodleH5p.typeVideo')}</option>
                 <option value="Course Presentation">${t('moodleH5p.typePresentation')}</option>
                 <option value="Quiz">${t('moodleH5p.typeQuiz')}</option>
                 <option value="Drag and Drop">${t('moodleH5p.typeDragDrop')}</option>
                 <option value="Fill in the Blanks">${t('moodleH5p.typeFillBlanks')}</option>
                 <option value="Dialog Cards">${t('moodleH5p.typeDialogCards')}</option>`}
            </select>
          </div>
          <div class="form-group">
            <label>${t('common.title')} *</label>
            <input type="text" id="h5pTitle" placeholder="${t('moodleH5p.titlePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="h5pDescription" rows="2" placeholder="${t('moodleH5p.descPlaceholder')}"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleH5p.assignedCourse')}</label>
              <select id="h5pCourse">${courseOptions}</select>
            </div>
            <div class="form-group">
              <label>${t('common.status')}</label>
              <select id="h5pStatus"><option value="draft">${t('common.draft')}</option><option value="published">${t('common.published')}</option></select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createH5pModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveH5pContent()" class="btn-primary">${t('common.create')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createH5pModal'); };
  },

  async saveH5pContent() {
    const title = document.getElementById('h5pTitle')?.value?.trim();
    if (!title) { showToast(t('common.titleRequired')); return; }
    try {
      const result = await API.h5p.create({
        title,
        contentType: document.getElementById('h5pContentType')?.value || 'Interactive Video',
        description: document.getElementById('h5pDescription')?.value || '',
        courseId: document.getElementById('h5pCourse')?.value || undefined,
        status: document.getElementById('h5pStatus')?.value || 'draft'
      });
      if (result.success) {
        showToast(t('moodleH5p.created'));
        this.closeModal('createH5pModal');
        this.openH5pManager();
      } else { showToast(result.error || t('common.createFailed')); }
    } catch (error) { showToast(t('moodleH5p.createError')); }
  },

  async duplicateH5pContent(contentId) {
    try {
      const result = await API.h5p.duplicate(contentId);
      if (result.success) { showToast(t('common.copied')); this.openH5pManager(); }
      else { showToast(result.error || t('common.copyFailed')); }
    } catch (error) { showToast(t('common.copyFailed')); }
  },

  async deleteH5pContent(contentId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleH5p.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.h5p.delete(contentId);
      if (result.success) { showToast(t('common.deleted')); this.openH5pManager(); }
      else { showToast(result.error || t('common.deleteFailed')); }
    } catch (error) { showToast(t('common.deleteFailed')); }
  },

  /**
   * LTI 管理
   */
  async openLtiManager() {
    const container = document.getElementById('ltiManagerContent');
    if (!container) return;
    if (!this.ensureViewVisible('ltiManager')) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const result = await API.ltiTools.list();
      const tools = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.tools || [])) : [];
      this._ltiToolsData = tools;
      this.renderLtiPage(container, tools);
    } catch (error) {
      console.error('Open LTI manager error:', error);
      container.innerHTML = `<div class="error">${t('moodleLtiMgmt.loadFailed')}</div>`;
    }
  },

  renderLtiPage(container, tools) {
    container.innerHTML = `
      <div class="lti-manager-page">
        <div class="page-header">
          <h1>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12h6"/>
              <path d="M12 9v6"/>
              <path d="M4.93 4.93a10 10 0 1014.14 14.14A10 10 0 004.93 4.93z"/>
            </svg>
            ${t('moodleLtiMgmt.title')}
          </h1>
          <div class="header-actions">
            <button onclick="MoodleUI.openRegisterLtiToolModal()" class="btn-primary">+ ${t('moodleLtiMgmt.registerBtn')}</button>
          </div>
        </div>
        <div class="lti-tools-list">
          ${tools.length === 0
            ? this.renderActivityEmptyState({
                icon: `
                  <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M9 12h6"/>
                    <path d="M12 9v6"/>
                    <path d="M4.93 4.93a10 10 0 1014.14 14.14A10 10 0 004.93 4.93z"/>
                  </svg>
                `,
                title: t('moodleLtiMgmt.noTools'),
                hint: t('moodleLtiMgmt.registerTitle')
              })
            : tools.map(tool => `
              <button type="button" class="lti-tool-card" onclick="MoodleUI.viewLtiToolDetail(${this.toInlineActionValue(tool.toolId || tool.id)})">
                <div class="card-header">
                  <div>
                    <h3>${this.escapeText(tool.name || t('common.unnamed'))}</h3>
                  </div>
                  ${this.renderManagementStatusBadge(tool.status, tool.status === 'active' ? t('common.active') : t('common.inactive'))}
                </div>
                <div class="card-body">
                  <div class="tool-url">${this.escapeText(tool.toolUrl || tool.launchUrl || tool.url || '—')}</div>
                  <div class="tool-meta">
                    <span>LTI ${this.escapeText(tool.ltiVersion || tool.version || '1.1')}</span>
                    <span>${this.escapeText(tool.consumerKey || t('moodleLtiMgmt.noConsumerKey') || 'Consumer Key —')}</span>
                  </div>
                  <p>${this.escapeText(tool.description || t('moodleLtiMgmt.descPlaceholder'))}</p>
                  <div class="card-actions">
                    <button type="button" class="btn-launch" onclick="event.stopPropagation();MoodleUI.launchLtiManagementTool(${this.toInlineActionValue(tool.toolId || tool.id)})">${t('moodleScorm.launch')}</button>
                    <button type="button" class="btn-manage" onclick="event.stopPropagation();MoodleUI.viewLtiToolDetail(${this.toInlineActionValue(tool.toolId || tool.id)})">${t('common.view')}</button>
                  </div>
                </div>
              </button>
            `).join('')}
        </div>
      </div>`;
  },

  async viewLtiToolDetail(toolId) {
    const container = document.getElementById('ltiManagerContent');
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const [toolResult, gradesResult] = await Promise.all([
        API.ltiTools.get(toolId),
        API.ltiTools.getGrades(toolId).catch(() => ({ success: false }))
      ]);
      if (!toolResult.success) { container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`; return; }
      const tool = toolResult.data;
      const grades = gradesResult.success ? (Array.isArray(gradesResult.data) ? gradesResult.data : (gradesResult.data?.grades || [])) : [];
      const customParameters = typeof tool.customParameters === 'string'
        ? tool.customParameters
        : (tool.customParameters ? JSON.stringify(tool.customParameters, null, 2) : '');

      container.innerHTML = `
        <div class="management-detail-page">
          ${this.renderManagementDetailHeader({
            backAction: 'MoodleUI.openLtiManager()',
            backLabel: t('common.back'),
            kicker: 'LTI',
            title: tool.name || t('common.unnamed'),
            subtitle: tool.description || (tool.toolUrl || tool.launchUrl || tool.url || ''),
            actions: [
              {
                label: t('moodleScorm.launch'),
                className: 'btn-primary btn-sm',
                onclick: `MoodleUI.launchLtiManagementTool(${this.toInlineActionValue(toolId)})`
              },
              {
                label: t('moodleGradeCategory.delete'),
                className: 'btn-sm btn-danger',
                onclick: `MoodleUI.deleteLtiTool(${this.toInlineActionValue(toolId)})`
              }
            ]
          })}
          ${this.renderManagementMetricGrid([
            { label: t('moodleLtiMgmt.version'), value: `LTI ${tool.ltiVersion || tool.version || '1.1'}` },
            { label: t('common.status'), value: this.getManagementStatusMeta(tool.status, tool.status === 'active' ? t('common.active') : t('common.inactive')).label },
            { label: t('moodleLtiMgmt.gradeRecords'), value: String(grades.length || 0) }
          ])}
          <div class="management-panel-grid">
            <section class="management-panel">
              <h3>${t('moodleLtiMgmt.toolSettings')}</h3>
              <div class="management-kv-list">
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleLtiMgmt.launchUrl')}</div>
                  <div class="management-kv-value is-code">${this.escapeText(tool.toolUrl || tool.launchUrl || tool.url || '—')}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleLtiMgmt.version')}</div>
                  <div class="management-kv-value">LTI ${this.escapeText(tool.ltiVersion || tool.version || '1.1')}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">Consumer Key</div>
                  <div class="management-kv-value is-code">${this.escapeText(tool.consumerKey || '—')}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('common.status')}</div>
                  <div class="management-kv-value">${this.renderManagementStatusBadge(tool.status, tool.status === 'active' ? t('common.active') : t('common.inactive'))}</div>
                </div>
                ${customParameters ? `
                  <div class="management-kv-item">
                    <div class="management-kv-label">${t('moodleLtiMgmt.customParams')}</div>
                    <div class="management-kv-value is-code">${this.escapeText(customParameters)}</div>
                  </div>
                ` : ''}
              </div>
            </section>
            <section class="management-panel">
              <h3>${t('moodleLtiMgmt.privacySettings')}</h3>
              <div class="management-kv-list">
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleLtiMgmt.shareName')}</div>
                  <div class="management-kv-value">${this.escapeText(tool.shareName !== false ? t('common.yes') : t('common.no'))}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleLtiMgmt.shareEmail')}</div>
                  <div class="management-kv-value">${this.escapeText(tool.shareEmail !== false ? t('common.yes') : t('common.no'))}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleLtiMgmt.acceptGrades')}</div>
                  <div class="management-kv-value">${this.escapeText(tool.acceptGrades !== false ? t('common.yes') : t('common.no'))}</div>
                </div>
              </div>
            </section>
          </div>
          <div class="management-table-shell">
            <div class="management-table-heading">
              <h3>${t('moodleLtiMgmt.gradeRecords')} (${grades.length})</h3>
            </div>
            <table class="management-table">
              <thead>
                <tr>
                  <th>${t('common.user')}</th>
                  <th class="is-center">${t('moodleGrade.score')}</th>
                  <th>${t('common.date')}</th>
                </tr>
              </thead>
              <tbody>
                ${grades.length === 0 ? `
                  <tr>
                    <td colspan="3" class="is-center">${t('moodleLtiMgmt.noGrades') || t('moodleGrade.noGrades')}</td>
                  </tr>
                ` : grades.map(grade => `
                  <tr>
                    <td>${this.escapeText(grade.userName || grade.userId || '—')}</td>
                    <td class="is-center">${this.escapeText(grade.score != null ? grade.score : '—')}</td>
                    <td>${this.escapeText(this.formatPlatformDate(grade.createdAt || grade.timestamp, { dateStyle: 'medium', timeStyle: 'short' }))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    } catch (error) {
      console.error('View LTI tool detail error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  openRegisterLtiToolModal() {
    const modal = document.createElement('div');
    modal.id = 'registerLtiToolModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleLtiMgmt.registerTitle')}</h3>
          <button onclick="MoodleUI.closeModal('registerLtiToolModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleLtiMgmt.toolName')} *</label>
            <input type="text" id="ltiToolName" placeholder="${t('moodleLtiMgmt.toolNamePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="ltiToolDescription" rows="2" placeholder="${t('moodleLtiMgmt.descPlaceholder')}"></textarea>
          </div>
          <div class="form-group">
            <label>${t('moodleLtiMgmt.launchUrl')} *</label>
            <input type="url" id="ltiToolUrl" placeholder="https://example.com/lti/launch">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Consumer Key</label>
              <input type="text" id="ltiConsumerKey" placeholder="Consumer Key">
            </div>
            <div class="form-group">
              <label>Shared Secret</label>
              <input type="password" id="ltiConsumerSecret" placeholder="Shared Secret">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleLtiMgmt.ltiVersion')}</label>
              <select id="ltiVersion">
                <option value="1.1">LTI 1.1</option>
                <option value="1.3">LTI 1.3</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('common.status')}</label>
              <select id="ltiToolStatus"><option value="active">${t('common.active')}</option><option value="inactive">${t('common.inactive')}</option></select>
            </div>
          </div>
          <div class="form-group">
            <label>${t('moodleLtiMgmt.customParamsLabel')}</label>
            <textarea id="ltiCustomParams" rows="2" placeholder="key1=value1&#10;key2=value2"></textarea>
          </div>
          <h4>${t('moodleLtiMgmt.privacySettings')}</h4>
          <div class="checkbox-inline-group">
            <label>
              <input type="checkbox" id="ltiShareName" checked> ${t('moodleLtiMgmt.shareName')}
            </label>
            <label>
              <input type="checkbox" id="ltiShareEmail" checked> ${t('moodleLtiMgmt.shareEmail')}
            </label>
            <label>
              <input type="checkbox" id="ltiAcceptGrades" checked> ${t('moodleLtiMgmt.acceptGrades')}
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('registerLtiToolModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveLtiTool()" class="btn-primary">${t('moodleLtiMgmt.registerBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('registerLtiToolModal'); };
  },

  async saveLtiTool() {
    const name = document.getElementById('ltiToolName')?.value?.trim();
    const launchUrl = document.getElementById('ltiToolUrl')?.value?.trim();
    if (!name || !launchUrl) { showToast(t('moodleLtiMgmt.nameUrlRequired')); return; }
    const customParamsText = document.getElementById('ltiCustomParams')?.value || '';
    const customParameters = {};
    customParamsText.split('\n').forEach(line => {
      const [key, ...rest] = line.split('=');
      if (key?.trim()) customParameters[key.trim()] = rest.join('=').trim();
    });
    try {
      const result = await API.ltiTools.create({
        name,
        description: document.getElementById('ltiToolDescription')?.value || '',
        toolUrl: launchUrl,
        consumerKey: document.getElementById('ltiConsumerKey')?.value || '',
        consumerSecret: document.getElementById('ltiConsumerSecret')?.value || '',
        ltiVersion: document.getElementById('ltiVersion')?.value || '1.1',
        status: document.getElementById('ltiToolStatus')?.value || 'active',
        customParameters: Object.keys(customParameters).length > 0 ? customParameters : undefined,
        shareName: document.getElementById('ltiShareName')?.checked,
        shareEmail: document.getElementById('ltiShareEmail')?.checked,
        acceptGrades: document.getElementById('ltiAcceptGrades')?.checked
      });
      if (result.success) {
        showToast(t('moodleLtiMgmt.registered'));
        this.closeModal('registerLtiToolModal');
        this.openLtiManager();
      } else { showToast(result.error || t('common.registerFailed')); }
    } catch (error) { showToast(t('moodleLtiMgmt.registerError')); }
  },

  async launchLtiManagementTool(toolId) {
    try {
      const result = await API.ltiTools.launch(toolId);
      if (result.success && result.data) {
        const launch = result.data;
        if (launch.launchUrl) {
          window.open(launch.launchUrl, '_blank');
        } else {
          showToast(t('moodleLtiMgmt.launchInfoIncomplete'));
        }
      } else { showToast(result.error || t('common.launchFailed')); }
    } catch (error) { showToast(t('moodleLtiMgmt.launchError')); }
  },

  async deleteLtiTool(toolId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleLtiMgmt.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.ltiTools.delete(toolId);
      if (result.success) { showToast(t('common.deleted')); this.openLtiManager(); }
      else { showToast(result.error || t('common.deleteFailed')); }
    } catch (error) { showToast(t('common.deleteFailed')); }
  },

  /**
   * SCORM 管理
   */
  currentScormFilter: 'all',

  async openScormManager() {
    const container = document.getElementById('scormManagerContent');
    if (!container) return;
    if (!this.ensureViewVisible('scormManager')) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const result = await API.scorm.list();
      const packages = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.packages || [])) : [];
      this._scormData = packages;
      this.renderScormPage(container, packages);
    } catch (error) {
      console.error('Open SCORM manager error:', error);
      container.innerHTML = `<div class="error">${t('moodleScorm.loadFailed')}</div>`;
    }
  },

  renderScormPage(container, packages) {
    const filtered = this.currentScormFilter === 'all' ? packages :
      packages.filter(p => p.status === this.currentScormFilter);

    container.innerHTML = `
      <div class="scorm-manager-page">
        <div class="page-header">
          <h1>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16v16H4z"/>
              <path d="M9 9h6v6H9z"/>
            </svg>
            ${t('moodleScorm.title')}
          </h1>
          <button onclick="MoodleUI.openCreateScormModal()" class="btn-primary">+ ${t('moodleScorm.createBtn')}</button>
        </div>
        <div class="scorm-info-banner">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 8v5"/>
            <path d="M12 16h.01"/>
          </svg>
          <p>${t('moodleScorm.description') || t('moodleScorm.createTitle')}</p>
        </div>
        <div class="management-filter-bar">
          ${['all','active','draft','archived'].map(filter => `
            <button class="filter-btn ${this.currentScormFilter === filter ? 'active' : ''}"
                    onclick="MoodleUI.currentScormFilter='${filter}';MoodleUI.renderScormPage(document.getElementById('scormManagerContent'),MoodleUI._scormData)">
              ${{all:t('common.all'),active:t('common.active'),draft:t('common.draft'),archived:t('moodleScorm.archived')}[filter]}
            </button>
          `).join('')}
        </div>
        <div class="scorm-list">
          ${filtered.length === 0
            ? this.renderActivityEmptyState({
                icon: `
                  <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M4 4h16v16H4z"/>
                    <path d="M9 9h6v6H9z"/>
                  </svg>
                `,
                title: t('moodleScorm.noPackages'),
                hint: t('moodleScorm.createTitle')
              })
            : filtered.map(pkg => `
              <button type="button" class="scorm-card" onclick="MoodleUI.viewScormDetail(${this.toInlineActionValue(pkg.packageId || pkg.id)})">
                <div class="card-header">
                  <h3>${this.escapeText(pkg.title || pkg.name || t('common.unnamed'))}</h3>
                  <span class="version-badge">SCORM ${this.escapeText(pkg.version || pkg.scormVersion || '1.2')}</span>
                </div>
                <div class="card-body">
                  <p>${this.escapeText(pkg.description || t('moodleScorm.descPlaceholder'))}</p>
                  <div class="card-meta">
                    <span>${this.escapeText(t('moodleCourse.course'))}：${this.escapeText(pkg.courseName || pkg.courseId || '—')}</span>
                    <span>${this.escapeText(t('moodleScorm.completionRate'))}：${this.escapeText(pkg.completionRate != null ? `${Math.round(pkg.completionRate)}%` : '—')}</span>
                    <span>${this.renderManagementStatusBadge(pkg.status, pkg.status === 'active' ? t('common.active') : pkg.status === 'archived' ? t('moodleScorm.archived') : t('common.draft'))}</span>
                  </div>
                  <div class="card-actions">
                    <button type="button" class="btn-launch" onclick="event.stopPropagation();MoodleUI.launchScormPackage(${this.toInlineActionValue(pkg.packageId || pkg.id)})">${t('moodleScorm.launch')}</button>
                    <button type="button" class="btn-report" onclick="event.stopPropagation();MoodleUI.viewScormDetail(${this.toInlineActionValue(pkg.packageId || pkg.id)})">${t('common.view')}</button>
                  </div>
                </div>
              </button>
            `).join('')}
        </div>
      </div>`;
  },

  async viewScormDetail(packageId) {
    const container = document.getElementById('scormManagerContent');
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const [pkgResult, reportResult, attemptsResult] = await Promise.all([
        API.scorm.get(packageId),
        API.scorm.getReport(packageId).catch(() => ({ success: false })),
        API.scorm.getAttempts(packageId).catch(() => ({ success: false }))
      ]);
      if (!pkgResult.success) { container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`; return; }
      const pkg = pkgResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const attempts = attemptsResult.success ? (Array.isArray(attemptsResult.data) ? attemptsResult.data : (attemptsResult.data?.attempts || [])) : [];
      const subtitle = `SCORM ${pkg.version || pkg.scormVersion || '1.2'}${pkg.description ? ` · ${pkg.description}` : ''}`;

      container.innerHTML = `
        <div class="management-detail-page">
          ${this.renderManagementDetailHeader({
            backAction: 'MoodleUI.openScormManager()',
            backLabel: t('common.back'),
            kicker: 'SCORM',
            title: pkg.title || pkg.name || t('common.unnamed'),
            subtitle,
            actions: [
              {
                label: t('moodleScorm.launch'),
                className: 'btn-primary btn-sm',
                onclick: `MoodleUI.launchScormPackage(${this.toInlineActionValue(packageId)})`
              },
              {
                label: t('moodleGradeCategory.delete'),
                className: 'btn-sm btn-danger',
                onclick: `MoodleUI.deleteScormPackage(${this.toInlineActionValue(packageId)})`
              }
            ]
          })}
          ${this.renderManagementMetricGrid([
            { label: t('moodleScorm.totalAttempts'), value: String(report.totalAttempts || attempts.length || 0) },
            { label: t('moodleScorm.completionRate'), value: report.completionRate != null ? `${Math.round(report.completionRate)}%` : '—' },
            { label: t('moodleScorm.passRate'), value: report.passRate != null ? `${Math.round(report.passRate)}%` : '—' },
            { label: t('moodleScorm.avgScore'), value: report.averageScore != null ? String(Math.round(report.averageScore)) : '—' }
          ])}
          <div class="management-panel-grid">
            <section class="management-panel">
              <h3>${t('moodleScorm.packageSettings')}</h3>
              <div class="management-kv-list">
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleScorm.assignedCourse')}</div>
                  <div class="management-kv-value">${this.escapeText(pkg.courseName || pkg.courseId || t('common.notSpecified'))}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleScorm.gradingMethod')}</div>
                  <div class="management-kv-value">${this.escapeText(pkg.gradingMethod || pkg.gradeMethod || t('moodleScorm.highestScore'))}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('moodleScorm.maxAttempts')}</div>
                  <div class="management-kv-value">${this.escapeText(pkg.maxAttempts || t('common.unlimited'))}</div>
                </div>
                <div class="management-kv-item">
                  <div class="management-kv-label">${t('common.status')}</div>
                  <div class="management-kv-value">${this.renderManagementStatusBadge(pkg.status, pkg.status === 'active' ? t('common.active') : pkg.status === 'archived' ? t('moodleScorm.archived') : t('common.draft'))}</div>
                </div>
              </div>
            </section>
          </div>
          <div class="management-table-shell">
            <div class="management-table-heading">
              <h3>${t('moodleScorm.attemptRecords')} (${attempts.length})</h3>
            </div>
            <table class="management-table">
              <thead>
                <tr>
                  <th>${t('moodleQuiz.attemptCol')}</th>
                  <th class="is-center">${t('common.status')}</th>
                  <th class="is-center">${t('moodleGrade.score')}</th>
                  <th>${t('moodleQuiz.startTime')}</th>
                </tr>
              </thead>
              <tbody>
                ${attempts.length === 0 ? `
                  <tr>
                    <td colspan="4" class="is-center">${t('moodleScorm.noAttempts') || t('moodleScorm.noPackages')}</td>
                  </tr>
                ` : attempts.map((attempt, index) => `
                  <tr>
                    <td>#${index + 1}</td>
                    <td class="is-center">
                      ${this.renderManagementStatusBadge(
                        attempt.completionStatus === 'completed' ? 'completed' : 'pending',
                        attempt.completionStatus || attempt.status || t('moodleScorm.inProgress')
                      )}
                    </td>
                    <td class="is-center">${this.escapeText(attempt.score != null ? attempt.score : '—')}</td>
                    <td>${this.escapeText(this.formatPlatformDate(attempt.startedAt || attempt.createdAt, { dateStyle: 'medium', timeStyle: 'short' }))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    } catch (error) {
      console.error('View SCORM detail error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  async openCreateScormModal() {
    let courseOptions = `<option value="">${t('common.notSpecified')}</option>`;
    try {
      const courses = await this.getRoleScopedCourses({ manageOnly: true });
      courses.forEach(c => { courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`; });
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createScormModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleScorm.createTitle')}</h3>
          <button onclick="MoodleUI.closeModal('createScormModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('common.title')} *</label>
            <input type="text" id="scormTitle" placeholder="${t('moodleScorm.titlePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="scormDescription" rows="2" placeholder="${t('moodleScorm.descPlaceholder')}"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleScorm.assignedCourse')}</label>
              <select id="scormCourse">${courseOptions}</select>
            </div>
            <div class="form-group">
              <label>${t('moodleScorm.scormVersion')}</label>
              <select id="scormVersion">
                <option value="1.2">SCORM 1.2</option>
                <option value="2004">SCORM 2004</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleScorm.gradingMethod')}</label>
              <select id="scormGrading">
                <option value="highest">${t('moodleGradeSettings.highest')}</option>
                <option value="average">${t('moodleScorm.gradeAvg')}</option>
                <option value="first">${t('moodleScorm.gradeFirst')}</option>
                <option value="last">${t('moodleScorm.gradeLast')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('moodleScorm.maxAttemptsLabel')}</label>
              <input type="number" id="scormMaxAttempts" value="0" min="0" placeholder="${t('moodleScorm.unlimitedHint')}">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createScormModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveScormPackage()" class="btn-primary">${t('common.create')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createScormModal'); };
  },

  async saveScormPackage() {
    const name = document.getElementById('scormTitle')?.value?.trim();
    const courseId = document.getElementById('scormCourse')?.value;
    if (!name) { showToast(t('common.titleRequired')); return; }
    if (!courseId) { showToast(t('moodleScorm.selectCourseRequired')); return; }
    try {
      const result = await API.scorm.create({
        name,
        description: document.getElementById('scormDescription')?.value || '',
        courseId,
        version: document.getElementById('scormVersion')?.value || '1.2',
        gradingMethod: document.getElementById('scormGrading')?.value || 'highest',
        maxAttempts: parseInt(document.getElementById('scormMaxAttempts')?.value) || 0
      });
      if (result.success) {
        showToast(t('moodleScorm.created'));
        this.closeModal('createScormModal');
        this.openScormManager();
      } else { showToast(result.error || t('common.createFailed')); }
    } catch (error) { showToast(t('moodleScorm.createError')); }
  },

  async launchScormPackage(packageId) {
    try {
      const result = await API.scorm.launch(packageId);
      if (result.success && result.data) {
        showToast(t('moodleScorm.launched'));
        this.viewScormDetail(packageId);
      } else { showToast(result.error || t('common.launchFailed')); }
    } catch (error) { showToast(t('common.launchFailed')); }
  },

  async deleteScormPackage(packageId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleScorm.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.scorm.delete(packageId);
      if (result.success) { showToast(t('common.deleted')); this.openScormManager(); }
      else { showToast(result.error || t('common.deleteFailed')); }
    } catch (error) { showToast(t('common.deleteFailed')); }
  },

  /**
   * 建立課程 Modal
   */
  async showCreateCourseModal() {
    if (!this.isTeachingRole()) {
      showToast(I18n.getLocale() === 'en' ? 'You do not have permission to create courses.' : '你沒有建立課程的權限');
      return;
    }

    let categoryOptions = `<option value="">${t('moodleCourseCreate.selectCategory')}</option>`;
    try {
      const catResult = await API.courseCategories.list();
      if (catResult.success && catResult.data) {
        const cats = Array.isArray(catResult.data) ? catResult.data : (catResult.data.categories || []);
        cats.forEach(c => {
          categoryOptions += `<option value="${c.categoryId || c.id}">${c.name}</option>`;
        });
      }
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createCourseModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleCourseCreate.title')}</h3>
          <button onclick="MoodleUI.closeModal('createCourseModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleCourseCreate.nameLabel')} *</label>
            <input type="text" id="newCourseTitle" placeholder="${t('moodleCourseCreate.namePlaceholder')}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleCourseCreate.shortNameLabel')} *</label>
              <input type="text" id="newCourseShortName" placeholder="${t('moodleCourseCreate.shortNamePlaceholder')}">
            </div>
            <div class="form-group">
              <label>${t('moodleCourseCreate.categoryLabel')}</label>
              <select id="newCourseCategory">${categoryOptions}</select>
            </div>
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="newCourseDescription" rows="3" placeholder="${t('moodleCourseCreate.descPlaceholder')}"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleCourseCreate.formatLabel')}</label>
              <select id="newCourseFormat">
                <option value="topics">${t('moodleCourseCreate.formatTopics')}</option>
                <option value="weeks">${t('moodleCourseCreate.formatWeekly')}</option>
                <option value="social">${t('moodleCourseCreate.formatSocial')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('moodleCourseCreate.visibilityLabel')}</label>
              <select id="newCourseVisibility">
                <option value="show">${t('common.visible')}</option>
                <option value="hide">${t('common.hidden')}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleCourseCreate.startDate')}</label>
              <input type="date" id="newCourseStartDate">
            </div>
            <div class="form-group">
              <label>${t('moodleCourseCreate.endDate')}</label>
              <input type="date" id="newCourseEndDate">
            </div>
          </div>
          <div class="form-group">
            <label>${t('moodleCourseCreate.enrollKeyLabel')}</label>
            <input type="text" id="newCourseEnrollKey" placeholder="${t('moodleCourseCreate.enrollKeyPlaceholder')}">
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createCourseModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveNewCourse()" class="btn-primary">${t('moodleCourseCreate.createBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createCourseModal'); };
  },

  async saveNewCourse() {
    const title = document.getElementById('newCourseTitle')?.value?.trim();
    const shortName = document.getElementById('newCourseShortName')?.value?.trim();
    if (!title || !shortName) { showToast(t('moodleCourseCreate.nameRequired')); return; }
    try {
      const result = await API.courses.create({
        title,
        shortName,
        description: document.getElementById('newCourseDescription')?.value || '',
        category: document.getElementById('newCourseCategory')?.value || undefined,
        format: this.normalizeCourseFormat(document.getElementById('newCourseFormat')?.value || 'topics'),
        visibility: this.normalizeCourseVisibility(document.getElementById('newCourseVisibility')?.value || 'show'),
        startDate: document.getElementById('newCourseStartDate')?.value || undefined,
        endDate: document.getElementById('newCourseEndDate')?.value || undefined,
        enrollmentKey: document.getElementById('newCourseEnrollKey')?.value || undefined
      });
      if (result.success) {
        showToast(t('moodleCourseCreate.created'));
        this.closeModal('createCourseModal');
        if (typeof this.loadCourses === 'function') this.loadCourses();
      } else {
        showToast(result.error || t('moodleCourseCreate.error'));
      }
    } catch (error) {
      console.error('Create course error:', error);
      showToast(t('moodleCourseCreate.error'));
    }
  },

  /**
   * 建立作業 Modal
   */
  async showCreateAssignmentModal(preselectedCourseId) {
    return this.openAssignmentBuilderModal({
      courseId: preselectedCourseId || null,
      returnTo: 'assignments'
    });
  },

  async saveNewAssignment() {
    return this.saveAssignmentBuilder();
  },

  async loadAssignmentBuilderRubrics(courseId) {
    if (!courseId) return [];
    try {
      const result = await API.rubrics.list({ courseId });
      if (!result?.success) return [];
      return (Array.isArray(result.data) ? result.data : [])
        .filter(rubric => rubric && rubric.rubricId)
        .sort((a, b) => {
          const scoreA = (a.status || 'draft') === 'active' ? 1 : 0;
          const scoreB = (b.status || 'draft') === 'active' ? 1 : 0;
          if (scoreA !== scoreB) return scoreB - scoreA;
          return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
        });
    } catch (error) {
      console.warn('Load assignment builder rubrics failed:', error);
      return [];
    }
  },

  renderAssignmentBuilderRubricOptions(rubrics = [], selectedRubricId = '') {
    const noneLabel = I18n.getLocale() === 'en' ? 'No rubric' : '不使用評分規準';
    const untitledLabel = I18n.getLocale() === 'en' ? 'Untitled rubric' : '未命名評分規準';
    return [
      `<option value="">${this.escapeText(noneLabel)}</option>`,
      ...rubrics.map((rubric) => {
        const rubricId = rubric.rubricId || rubric.id;
        const statusLabel = (rubric.status || 'draft') === 'active'
          ? ''
          : ` · ${I18n.getLocale() === 'en' ? 'Draft' : '草稿'}`;
        return `
          <option value="${this.escapeText(rubricId)}" ${rubricId === selectedRubricId ? 'selected' : ''}>
            ${this.escapeText(rubric.name || untitledLabel)}${statusLabel}
          </option>
        `;
      })
    ].join('');
  },

  renderAssignmentBuilderRubricPreview() {
    const preview = document.getElementById('assignmentBuilderRubricPreview');
    if (!preview) return;

    const selectedRubricId = document.getElementById('assignmentBuilderRubric')?.value || '';
    const rubric = (this.currentAssignmentBuilderState?.rubrics || []).find(
      item => (item.rubricId || item.id) === selectedRubricId
    );

    if (!rubric) {
      preview.innerHTML = `
        <div class="builder-kv-grid">
          <div class="builder-kv-card">
            <span class="label">${I18n.getLocale() === 'en' ? 'Assessment' : '評分方式'}</span>
            <strong class="value">${I18n.getLocale() === 'en' ? 'Direct grading' : '直接評分'}</strong>
            <p>${I18n.getLocale() === 'en'
              ? 'Use the total score and feedback fields when you do not need criterion-based grading.'
              : '若不指定評分規準，老師會直接輸入總分與文字回饋。'}</p>
          </div>
        </div>
      `;
      return;
    }

    const criteria = Array.isArray(rubric.criteria) ? rubric.criteria : [];
    const criteriaPreview = criteria.length > 0
      ? criteria.slice(0, 4).map(item => `<span class="builder-badge">${this.escapeText(item.name || (I18n.getLocale() === 'en' ? 'Criterion' : '評分項目'))}</span>`).join('')
      : `<span class="builder-badge">${I18n.getLocale() === 'en' ? 'No criteria yet' : '尚未設定評分項目'}</span>`;

    preview.innerHTML = `
      <div class="builder-kv-grid">
        <div class="builder-kv-card">
          <span class="label">${I18n.getLocale() === 'en' ? 'Selected rubric' : '已套用評分規準'}</span>
          <strong class="value">${this.escapeText(rubric.name || (I18n.getLocale() === 'en' ? 'Untitled rubric' : '未命名評分規準'))}</strong>
          <p>${criteria.length} ${I18n.getLocale() === 'en' ? 'criteria' : '個評分項目'} · ${rubric.maxScore || 0} ${I18n.getLocale() === 'en' ? 'points total' : '分總分'}</p>
          <div class="builder-badge-row">${criteriaPreview}</div>
        </div>
      </div>
    `;
  },

  async refreshAssignmentBuilderRubrics(selectedRubricId = null) {
    const state = this.currentAssignmentBuilderState;
    if (!state) return;

    const courseId = document.getElementById('assignmentBuilderCourse')?.value || state.courseId;
    state.courseId = courseId;
    state.rubrics = await this.loadAssignmentBuilderRubrics(courseId);

    const rubricSelect = document.getElementById('assignmentBuilderRubric');
    if (rubricSelect) {
      const nextSelectedRubricId = selectedRubricId !== null ? selectedRubricId : rubricSelect.value;
      rubricSelect.innerHTML = this.renderAssignmentBuilderRubricOptions(state.rubrics, nextSelectedRubricId);
    }

    this.renderAssignmentBuilderRubricPreview();
  },

  editAssignmentSettings(assignmentId) {
    return this.openAssignmentBuilderModal({
      assignmentId,
      returnTo: 'assignmentDetail'
    });
  },

  async openAssignmentBuilderModal({ assignmentId = null, courseId = null, sectionId = null, returnTo = null } = {}) {
    const isEditing = !!assignmentId;
    const isEnglish = I18n.getLocale() === 'en';

    let assignment = null;
    if (isEditing) {
      const detailResult = await API.assignments.get(assignmentId);
      if (!detailResult?.success) {
        showToast(detailResult?.message || t('moodleAssignment.loadFailed'));
        return;
      }
      assignment = this.normalizeAssignmentState(detailResult.data || {});
      courseId = assignment.courseId || courseId;
    }

    let courses = [];
    try {
      courses = await this.getRoleScopedCourses({ manageOnly: true });
    } catch (error) {
      console.warn('Load assignment builder courses failed:', error);
    }

    if (courses.length === 0) {
      showToast(t('moodleGradebook.noCourses'));
      return;
    }

    const resolvedCourseId = courseId || courses[0]?.courseId || courses[0]?.id || '';
    const courseOptions = courses.map((course) => {
      const currentCourseId = course.courseId || course.id;
      return `<option value="${this.escapeText(currentCourseId)}" ${currentCourseId === resolvedCourseId ? 'selected' : ''}>${this.escapeText(course.title || course.name || (isEnglish ? 'Untitled course' : '未命名課程'))}</option>`;
    }).join('');

    const rubrics = await this.loadAssignmentBuilderRubrics(resolvedCourseId);
    const selectedRubricId = assignment?.rubric?.rubricId || assignment?.rubric?.id || '';

    this.currentAssignmentBuilderState = {
      assignmentId,
      sectionId,
      returnTo: returnTo || (sectionId ? 'course' : 'assignments'),
      courseId: resolvedCourseId,
      rubrics
    };

    const modal = this.createModal('assignmentBuilderModal', isEditing
      ? (isEnglish ? 'Edit assignment' : '編輯作業')
      : t('moodleAssignmentCreate.title'), `
      <form id="assignmentBuilderForm" onsubmit="event.preventDefault(); MoodleUI.saveAssignmentBuilder()">
        <div class="quiz-create-shell activity-builder-shell">
          <section class="quiz-create-card quiz-create-card-primary">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Assignment' : '作業工作區'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Task brief' : '任務內容'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Write the assignment title, short summary, and the detailed brief learners will follow when they submit.'
                  : '先定義作業標題、簡短摘要與學生實際要遵循的作業內容。'}</p>
              </div>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${t('moodleAssignmentCreate.titleLabel')} *</label>
                <input type="text" id="assignmentBuilderTitle" value="${this.escapeText(assignment?.title || '')}" placeholder="${t('moodleAssignmentCreate.titlePlaceholder')}" required>
              </div>
              <div class="form-group">
                <label>${t('moodleAssignmentCreate.courseLabel')} *</label>
                <select id="assignmentBuilderCourse" ${isEditing ? 'disabled' : ''}>${courseOptions}</select>
              </div>
            </div>
            <div class="form-group">
              <label>${t('common.description')}</label>
              <textarea id="assignmentBuilderDescription" rows="3" placeholder="${t('moodleAssignmentCreate.descPlaceholder')}">${this.escapeText(assignment?.description || '')}</textarea>
            </div>
            <div class="form-group">
              <label>${isEnglish ? 'Assignment brief & instructions' : '作業內容與要求'}</label>
              <textarea id="assignmentBuilderInstructions" rows="8" placeholder="${isEnglish ? 'Explain what students should deliver, the expected format, and any grading focus.' : '請具體說明學生要完成什麼、提交格式，以及評分重點。'}">${this.escapeText(assignment?.instructions || '')}</textarea>
            </div>
          </section>

          <section class="quiz-create-card">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Schedule' : '時間與成績'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Deadlines and grading basis' : '截止時間與評分基準'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Set the due window, scoring range, and the passing threshold learners should hit.'
                  : '設定截止區間、總分與及格門檻，讓學生知道這份作業的時程與成績標準。'}</p>
              </div>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${t('moodleAddActivity.dueDateLabel')} *</label>
                <input type="datetime-local" id="assignmentBuilderDueDate" value="${this.escapeText(this.toDateTimeLocalValue(assignment?.dueDate))}" required>
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Final cutoff' : '最終截止'}</label>
                <input type="datetime-local" id="assignmentBuilderCutoffDate" value="${this.escapeText(this.toDateTimeLocalValue(assignment?.cutoffDate))}">
              </div>
              <div class="form-group">
                <label>${t('moodleRubrics.maxScore')}</label>
                <input type="number" id="assignmentBuilderMaxGrade" value="${this.escapeText(assignment?.maxGrade ?? assignment?.maxPoints ?? 100)}" min="1">
              </div>
              <div class="form-group">
                <label>${t('app.passingScore') || (isEnglish ? 'Passing score' : '及格分數')}</label>
                <input type="number" id="assignmentBuilderGradeToPass" value="${this.escapeText(assignment?.gradeToPass ?? 60)}" min="0">
              </div>
            </div>
          </section>

          <section class="quiz-create-card">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Submission' : '提交規則'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'How learners will submit' : '學生如何提交作業'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Decide whether students type online, upload files, submit both, and how late work should be handled.'
                  : '決定學生是在線上輸入、上傳檔案或兩者皆可，並設定遲交處理方式。'}</p>
              </div>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${t('moodleAddActivity.submitTypeLabel')}</label>
                <select id="assignmentBuilderSubmitType">
                  <option value="online_text" ${this.normalizeAssignmentSubmissionType(assignment?.submissionType) === 'text' ? 'selected' : ''}>${t('moodleAddActivity.submitTypeText')}</option>
                  <option value="file" ${this.normalizeAssignmentSubmissionType(assignment?.submissionType) === 'file' ? 'selected' : ''}>${t('moodleAddActivity.submitTypeFile')}</option>
                  <option value="both" ${this.normalizeAssignmentSubmissionType(assignment?.submissionType) === 'both' ? 'selected' : ''}>${t('moodleAssignmentCreate.typeBoth')}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${t('moodleAssignmentCreate.allowLate')}</label>
                <select id="assignmentBuilderAllowLate">
                  <option value="true" ${assignment?.allowLateSubmission !== false ? 'selected' : ''}>${t('common.allow')}</option>
                  <option value="false" ${assignment?.allowLateSubmission === false ? 'selected' : ''}>${t('common.disallow')}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Late deduction %' : '遲交扣分 %'}</label>
                <input type="number" id="assignmentBuilderLateDeduction" value="${this.escapeText(assignment?.lateDeductionPercent ?? 10)}" min="0" max="100">
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Max files' : '最多檔案數'}</label>
                <input type="number" id="assignmentBuilderMaxFiles" value="${this.escapeText(assignment?.maxFiles ?? 5)}" min="1" max="20">
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Max file size (MB)' : '單檔大小上限 (MB)'}</label>
                <input type="number" id="assignmentBuilderMaxFileSize" value="${this.escapeText(assignment?.maxFileSize ?? 10)}" min="1" max="500">
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Rubric' : '評分規準'}</label>
                <select id="assignmentBuilderRubric">${this.renderAssignmentBuilderRubricOptions(rubrics, selectedRubricId)}</select>
              </div>
            </div>
            <div id="assignmentBuilderRubricPreview"></div>
            <div class="form-group form-checkbox-row">
              <label class="checkbox-label" for="assignmentBuilderVisible">
                <input type="checkbox" id="assignmentBuilderVisible" ${assignment?.visible !== false ? 'checked' : ''}>
                <span>${t('moodleCourseSettings.visibleToStudents')}</span>
              </label>
            </div>
            <div class="form-group form-checkbox-row">
              <label class="checkbox-label" for="assignmentBuilderAnonymous">
                <input type="checkbox" id="assignmentBuilderAnonymous" ${assignment?.anonymousGrading ? 'checked' : ''}>
                <span>${isEnglish ? 'Anonymous grading (hide student identity from graders)' : '匿名評分（評分時隱藏學生姓名）'}</span>
              </label>
            </div>
            <div class="form-group form-checkbox-row">
              <label class="checkbox-label" for="assignmentBuilderTeamSubmission">
                <input type="checkbox" id="assignmentBuilderTeamSubmission" ${assignment?.teamSubmission ? 'checked' : ''}>
                <span>${isEnglish ? 'Team submission (one submission shared by each group)' : '組別提交（同組共用一份提交）'}</span>
              </label>
            </div>
          </section>

          <div class="form-actions quiz-create-actions">
            <button type="button" onclick="MoodleUI.closeModal('assignmentBuilderModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${isEditing ? t('common.save') : t('moodleAssignmentCreate.createBtn')}</button>
          </div>
        </div>
      </form>
    `, {
      maxWidth: '1180px',
      className: 'modal-workspace modal-assignment-builder-modal',
      kicker: isEnglish ? 'Assignment workspace' : '作業工作區',
      description: isEnglish
        ? 'Create an assignment with a proper task brief, grading baseline, and submission policy.'
        : '用完整流程設定作業內容、評分基準與提交規則。'
    });

    modal.querySelector('#assignmentBuilderCourse')?.addEventListener('change', () => {
      this.refreshAssignmentBuilderRubrics('');
    });
    modal.querySelector('#assignmentBuilderRubric')?.addEventListener('change', () => {
      this.renderAssignmentBuilderRubricPreview();
    });

    this.renderAssignmentBuilderRubricPreview();
    window.requestAnimationFrame(() => modal.querySelector('#assignmentBuilderTitle')?.focus());
  },

  async saveAssignmentBuilder() {
    const state = this.currentAssignmentBuilderState || {};
    const isEditing = !!state.assignmentId;
    const isEnglish = I18n.getLocale() === 'en';

    const title = document.getElementById('assignmentBuilderTitle')?.value?.trim();
    const courseId = isEditing
      ? state.courseId
      : (document.getElementById('assignmentBuilderCourse')?.value || state.courseId);
    const dueDate = document.getElementById('assignmentBuilderDueDate')?.value;
    const cutoffDate = document.getElementById('assignmentBuilderCutoffDate')?.value || null;

    if (!title || !courseId || !dueDate) {
      showToast(t('moodleAssignmentCreate.fieldsRequired'));
      return;
    }

    if (cutoffDate && new Date(cutoffDate) < new Date(dueDate)) {
      showToast(isEnglish ? 'Final cutoff must be after the due date.' : '最終截止時間必須晚於一般截止時間。');
      return;
    }

    const selectedRubricId = document.getElementById('assignmentBuilderRubric')?.value || '';
    const selectedRubric = (state.rubrics || []).find(
      item => (item.rubricId || item.id) === selectedRubricId
    ) || null;

    const payload = {
      courseId,
      title,
      description: document.getElementById('assignmentBuilderDescription')?.value || '',
      instructions: document.getElementById('assignmentBuilderInstructions')?.value || '',
      dueDate,
      cutoffDate,
      maxGrade: parseInt(document.getElementById('assignmentBuilderMaxGrade')?.value, 10) || 100,
      gradeToPass: parseInt(document.getElementById('assignmentBuilderGradeToPass')?.value, 10) || 0,
      submissionType: document.getElementById('assignmentBuilderSubmitType')?.value || 'online_text',
      allowLateSubmission: document.getElementById('assignmentBuilderAllowLate')?.value === 'true',
      lateDeductionPercent: parseInt(document.getElementById('assignmentBuilderLateDeduction')?.value, 10) || 0,
      maxFiles: parseInt(document.getElementById('assignmentBuilderMaxFiles')?.value, 10) || 5,
      maxFileSize: parseInt(document.getElementById('assignmentBuilderMaxFileSize')?.value, 10) || 10,
      visible: document.getElementById('assignmentBuilderVisible')?.checked !== false,
      anonymousGrading: !!document.getElementById('assignmentBuilderAnonymous')?.checked,
      teamSubmission: !!document.getElementById('assignmentBuilderTeamSubmission')?.checked,
      rubric: selectedRubric
    };

    if (state.sectionId) {
      payload.sectionId = state.sectionId;
    }

    try {
      const result = isEditing
        ? await API.assignments.update(state.assignmentId, payload)
        : await API.assignments.create(payload);

      if (!result?.success) {
        showToast(result?.message || t('moodleAssignmentCreate.error'));
        return;
      }

      const savedAssignment = this.normalizeAssignmentState(result.data || { ...payload, assignmentId: state.assignmentId });
      this.closeModal('assignmentBuilderModal');
      showToast(isEditing
        ? (isEnglish ? 'Assignment updated' : '作業已更新')
        : t('moodleAssignmentCreate.success'));

      if (state.returnTo === 'course' && courseId) {
        this.openCourse(courseId);
        return;
      }

      if (state.returnTo === 'assignmentDetail') {
        this.openAssignment(savedAssignment.assignmentId || state.assignmentId);
        return;
      }

      showView('moodleAssignments');
      await this.loadAssignments(courseId || this.currentAssignmentCourseId || undefined);
    } catch (error) {
      console.error('Save assignment builder error:', error);
      showToast(isEditing
        ? (isEnglish ? 'Failed to update assignment' : '更新作業失敗')
        : t('moodleAssignmentCreate.createFailed'));
    }
  },

  /**
   * 建立測驗 Modal
   */
  async showCreateQuizModal(preselectedCourseId) {
    return this.openQuizBuilderModal({
      courseId: preselectedCourseId || null,
      returnTo: 'quizzes'
    });
  },

  async saveNewQuiz() {
    return this.saveQuizBuilder();
  },

  editQuizSettings(quizId) {
    return this.openQuizBuilderModal({
      quizId,
      returnTo: 'quizResults'
    });
  },

  createEmptyQuizBuilderQuestion(type = 'multiple_choice') {
    return this.normalizeQuizBuilderQuestion({
      type,
      points: 10
    });
  },

  normalizeQuizBuilderQuestion(question = {}) {
    const type = question.type || 'multiple_choice';
    const normalized = {
      questionId: question.questionId || null,
      bankQuestionId: question.bankQuestionId || null,
      type,
      text: String(question.text ?? question.questionText ?? question.content ?? question.title ?? '').trim(),
      options: Array.isArray(question.options)
        ? question.options.map(option => (typeof option === 'string' ? option : (option?.text || option?.label || '')))
        : [],
      correctAnswer: question.correctAnswer,
      correctAnswers: Array.isArray(question.correctAnswers)
        ? question.correctAnswers.map(answer => String(answer).trim()).filter(Boolean)
        : [],
      caseSensitive: !!question.caseSensitive,
      referenceAnswer: String(question.referenceAnswer || ''),
      minWords: Number.isFinite(Number(question.minWords)) ? Number(question.minWords) : 0,
      points: Number.isFinite(Number(question.points)) ? Number(question.points) : 10,
      difficulty: question.difficulty || 'medium',
      analysisSection: String(question.analysisSection || question.sectionTitle || question.section || question.skill || question.categoryName || question.category || '').trim(),
      feedback: String(question.feedback || question.explanation || ''),
      tags: Array.isArray(question.tags) ? question.tags.map(tag => String(tag).trim()).filter(Boolean) : [],
      matchingPairs: Array.isArray(question.matchingPairs || question.pairs)
        ? (question.matchingPairs || question.pairs).map(pair => ({
            prompt: String(pair?.prompt ?? pair?.question ?? pair?.left ?? '').trim(),
            answer: String(pair?.answer ?? pair?.right ?? pair?.match ?? '').trim()
          })).filter(pair => pair.prompt || pair.answer)
        : [],
      orderingItems: Array.isArray(question.orderingItems || question.orderItems || (type === 'ordering' ? question.options : null))
        ? (question.orderingItems || question.orderItems || question.options).map(item => String(item?.text ?? item?.label ?? item ?? '').trim()).filter(Boolean)
        : [],
      numericAnswer: question.numericAnswer ?? question.correctAnswer ?? '',
      numericTolerance: Number.isFinite(Number(question.numericTolerance ?? question.tolerance))
        ? Number(question.numericTolerance ?? question.tolerance)
        : 0,
      clozeText: String(question.clozeText || (type === 'cloze' ? question.text || question.questionText || '' : '')).trim(),
      clozeAnswers: Array.isArray(question.clozeAnswers)
        ? question.clozeAnswers.map((blank, index) => ({
            id: String(blank?.id || blank?.blankId || index + 1).trim(),
            answers: (Array.isArray(blank?.answers || blank?.acceptedAnswers)
              ? (blank.answers || blank.acceptedAnswers)
              : [blank?.answer ?? blank?.value ?? ''])
              .map(answer => String(answer).trim())
              .filter(Boolean),
            caseSensitive: !!blank?.caseSensitive
          })).filter(blank => blank.id && blank.answers.length > 0)
        : []
    };

    if (type === 'multiple_choice') {
      normalized.options = normalized.options.length > 0 ? normalized.options : ['', '', '', ''];
      const correctIndex = Number(normalized.correctAnswer);
      normalized.correctAnswer = Number.isFinite(correctIndex)
        ? Math.max(0, Math.min(normalized.options.length - 1, correctIndex))
        : 0;
      normalized.correctAnswers = [];
    } else if (type === 'multiple_select') {
      normalized.options = normalized.options.length > 0 ? normalized.options : ['', '', '', ''];
      normalized.correctAnswer = null;
      normalized.correctAnswers = normalized.correctAnswers
        .map(answer => Number.isFinite(Number(answer)) ? Number(answer) : answer)
        .filter(answer => answer !== '');
    } else if (type === 'true_false') {
      normalized.options = [];
      normalized.correctAnswer = normalized.correctAnswer !== false;
      normalized.correctAnswers = [];
    } else if (type === 'matching') {
      normalized.options = [];
      normalized.correctAnswer = null;
      normalized.correctAnswers = [];
      normalized.matchingPairs = normalized.matchingPairs.length > 0
        ? normalized.matchingPairs
        : [
            { prompt: '', answer: '' },
            { prompt: '', answer: '' },
            { prompt: '', answer: '' }
          ];
    } else if (type === 'ordering') {
      normalized.options = [];
      normalized.correctAnswer = null;
      normalized.correctAnswers = [];
      normalized.orderingItems = normalized.orderingItems.length > 0 ? normalized.orderingItems : ['', '', ''];
    } else if (type === 'numerical') {
      normalized.options = [];
      normalized.correctAnswer = normalized.numericAnswer;
      normalized.correctAnswers = [];
    } else if (type === 'cloze') {
      normalized.options = [];
      normalized.correctAnswer = null;
      normalized.correctAnswers = [];
      if (normalized.clozeAnswers.length === 0) {
        normalized.clozeAnswers = [
          { id: '1', answers: [''], caseSensitive: false },
          { id: '2', answers: [''], caseSensitive: false }
        ];
      }
      normalized.text = normalized.clozeText || normalized.text;
    } else if (type === 'short_answer' || type === 'fill_blank') {
      normalized.options = [];
      if (normalized.correctAnswers.length === 0 && normalized.correctAnswer !== undefined && normalized.correctAnswer !== null) {
        normalized.correctAnswers = [String(normalized.correctAnswer)];
      }
      normalized.correctAnswer = null;
    } else if (type === 'essay') {
      normalized.options = [];
      normalized.correctAnswer = null;
      normalized.correctAnswers = [];
    }

    return normalized;
  },

  renderQuizBuilderQuestionList() {
    const state = this.currentQuizBuilderState;
    const list = document.getElementById('quizBuilderQuestionList');
    const summary = document.getElementById('quizBuilderQuestionSummary');
    if (!state || !list || !summary) return;

    const isEnglish = I18n.getLocale() === 'en';
    const questions = Array.isArray(state.questions) ? state.questions : [];
    const totalPoints = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);

    summary.innerHTML = `
      <div class="builder-summary-row">
        <span class="builder-badge">${questions.length} ${isEnglish ? 'questions' : '題目'}</span>
        <span class="builder-badge">${totalPoints} ${isEnglish ? 'points total' : '分總分'}</span>
        <span class="builder-badge">${questions.filter(question => question.bankQuestionId).length} ${isEnglish ? 'from question bank' : '題來自題庫'}</span>
      </div>
    `;

    if (questions.length === 0) {
      list.innerHTML = `
        <div class="builder-question-empty">
          <strong>${isEnglish ? 'No questions added yet' : '尚未加入題目'}</strong>
          <p>${isEnglish
            ? 'Add at least one question here so this quiz is more than a schedule shell.'
            : '請直接在這裡新增題目或從題庫加入，讓這份測驗不再只是時間外殼。'}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = questions.map((rawQuestion, index) => {
      const question = this.normalizeQuizBuilderQuestion(rawQuestion);
      const displayText = question.type === 'cloze'
        ? (question.clozeText || question.text)
        : question.text;
      const safeText = this.escapeText(this.truncateText(displayText || (isEnglish ? `Question ${index + 1}` : `第 ${index + 1} 題`), 180));
      const sourceLabel = question.bankQuestionId
        ? (isEnglish ? 'Question bank' : '題庫題目')
        : (isEnglish ? 'Manual question' : '手動題目');
      const typeLabel = this.escapeText(this.getLocalizedQuestionType(question.type));
      const sectionLabel = question.analysisSection || (isEnglish ? 'General' : '通用');
      const detailLabel = question.type === 'multiple_choice'
        ? `${(question.options || []).filter(Boolean).length} ${isEnglish ? 'options' : '個選項'}`
        : question.type === 'multiple_select'
          ? `${(question.correctAnswers || []).length} ${isEnglish ? 'correct choices' : '個正確選項'}`
        : question.type === 'true_false'
          ? (isEnglish ? 'True / false' : '是非題')
          : question.type === 'matching'
            ? `${(question.matchingPairs || []).filter(pair => pair.prompt && pair.answer).length} ${isEnglish ? 'pairs' : '組配對'}`
            : question.type === 'ordering'
              ? `${(question.orderingItems || []).filter(Boolean).length} ${isEnglish ? 'ordered items' : '個排序項目'}`
              : question.type === 'numerical'
                ? `${isEnglish ? 'Answer' : '答案'} ${question.numericAnswer || '-'} ± ${question.numericTolerance || 0}`
                : question.type === 'cloze'
                  ? `${(question.clozeAnswers || []).length} ${isEnglish ? 'blanks' : '個空格'}`
                  : question.type === 'essay'
                    ? (isEnglish ? 'Manual grading required' : '需人工評分')
                    : `${Math.max((question.correctAnswers || []).length, 1)} ${isEnglish ? 'accepted answers' : '個可接受答案'}`;

      return `
        <article class="builder-question-card">
          <div class="builder-question-top">
            <div class="builder-question-copy">
              <div class="builder-badge-row">
                <span class="builder-badge">${this.escapeText(sourceLabel)}</span>
                <span class="builder-badge">${this.escapeText(sectionLabel)}</span>
                <span class="builder-badge">${typeLabel}</span>
                <span class="builder-badge">${this.escapeText(String(question.points || 0))} ${isEnglish ? 'pts' : '分'}</span>
              </div>
              <h4>${safeText}</h4>
              <p>${this.escapeText(detailLabel)}</p>
            </div>
            <div class="builder-question-actions">
              <button type="button" class="btn-sm" onclick="MoodleUI.openQuizQuestionEditorModal(${index})">${t('common.edit')}</button>
              <button type="button" class="btn-sm" onclick="MoodleUI.duplicateQuizBuilderQuestion(${index})">${t('common.duplicate')}</button>
              <button type="button" class="btn-sm" onclick="MoodleUI.moveQuizBuilderQuestion(${index}, -1)" ${index === 0 ? 'disabled' : ''}>${isEnglish ? 'Move up' : '上移'}</button>
              <button type="button" class="btn-sm" onclick="MoodleUI.moveQuizBuilderQuestion(${index}, 1)" ${index === questions.length - 1 ? 'disabled' : ''}>${isEnglish ? 'Move down' : '下移'}</button>
              <button type="button" class="btn-sm btn-danger" onclick="MoodleUI.removeQuizBuilderQuestion(${index})">${t('common.delete')}</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  },

  duplicateQuizBuilderQuestion(index) {
    const state = this.currentQuizBuilderState;
    if (!state || !Array.isArray(state.questions) || !state.questions[index]) return;
    const sourceQuestion = this.normalizeQuizBuilderQuestion(state.questions[index]);
    state.questions.splice(index + 1, 0, {
      ...sourceQuestion,
      questionId: null
    });
    this.renderQuizBuilderQuestionList();
  },

  removeQuizBuilderQuestion(index) {
    const state = this.currentQuizBuilderState;
    if (!state || !Array.isArray(state.questions)) return;
    state.questions.splice(index, 1);
    this.renderQuizBuilderQuestionList();
  },

  moveQuizBuilderQuestion(index, delta) {
    const state = this.currentQuizBuilderState;
    if (!state || !Array.isArray(state.questions)) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= state.questions.length) return;
    const [item] = state.questions.splice(index, 1);
    state.questions.splice(nextIndex, 0, item);
    this.renderQuizBuilderQuestionList();
  },

  renderQuizQuestionEditorOptions(type, question = {}) {
    const isEnglish = I18n.getLocale() === 'en';
    const normalized = this.normalizeQuizBuilderQuestion({ ...question, type });

    if (type === 'multiple_choice') {
      const options = normalized.options.length > 0 ? normalized.options : ['', '', '', ''];
      return `
        <div class="form-group">
          <label>${isEnglish ? 'Options and correct answer' : '選項與正確答案'}</label>
          <div id="quizQuestionOptionsList">
            ${options.map((option, index) => `
              <div class="builder-option-row builder-choice-row">
                <label class="correct-option-control">
                  <input type="radio" name="quizQuestionCorrect" value="${index}" ${Number(normalized.correctAnswer) === index ? 'checked' : ''}>
                  <span>${isEnglish ? 'Correct' : '正確答案'}</span>
                </label>
                <input type="text" class="option-input" value="${this.escapeText(option || '')}" placeholder="${this.escapeText((isEnglish ? 'Option' : '選項'))} ${String.fromCharCode(65 + index)}">
                <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove(); MoodleUI.syncQuizQuestionOptionIndices();" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn-sm" onclick="MoodleUI.addQuizQuestionOptionRow()">${t('moodleNewQuestion.addOption')}</button>
        </div>
      `;
    }

    if (type === 'multiple_select') {
      const options = normalized.options.length > 0 ? normalized.options : ['', '', '', ''];
      const correctSet = new Set((normalized.correctAnswers || []).map(answer => String(answer)));
      return `
        <div class="form-group">
          <label>${isEnglish ? 'Options and correct choices' : '選項與正確答案'}</label>
          <div id="quizQuestionOptionsList">
            ${options.map((option, index) => `
              <div class="builder-option-row builder-choice-row">
                <label class="correct-option-control">
                  <input type="checkbox" name="quizQuestionCorrectMulti" value="${index}" ${correctSet.has(String(index)) ? 'checked' : ''}>
                  <span>${isEnglish ? 'Correct' : '正確選項'}</span>
                </label>
                <input type="text" class="option-input" value="${this.escapeText(option || '')}" placeholder="${this.escapeText((isEnglish ? 'Option' : '選項'))} ${String.fromCharCode(65 + index)}">
                <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove(); MoodleUI.syncQuizQuestionOptionIndices();" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn-sm" onclick="MoodleUI.addQuizQuestionMultiSelectOptionRow()">${t('moodleNewQuestion.addOption')}</button>
          <p class="form-hint">${isEnglish ? 'Students must select every correct choice. Partial credit is awarded automatically.' : '學生需選出所有正確選項，系統會自動計算部分得分。'}</p>
        </div>
      `;
    }

    if (type === 'true_false') {
      return `
        <div class="form-group">
          <label>${t('moodleNewQuestion.correctAnswer')}</label>
          <div class="radio-group">
            <label><input type="radio" name="quizQuestionTrueFalse" value="true" ${normalized.correctAnswer !== false ? 'checked' : ''}> ${t('moodleNewQuestion.tfTrue')}</label>
            <label><input type="radio" name="quizQuestionTrueFalse" value="false" ${normalized.correctAnswer === false ? 'checked' : ''}> ${t('moodleNewQuestion.tfFalse')}</label>
          </div>
        </div>
      `;
    }

    if (type === 'short_answer' || type === 'fill_blank') {
      return `
        <div class="form-group">
          <label>${t('moodleNewQuestion.correctAnswers')}</label>
          <textarea id="quizQuestionAcceptedAnswers" rows="4" placeholder="${this.escapeText(isEnglish ? 'One accepted answer per line' : '每行輸入一個可接受答案')}">${this.escapeText((normalized.correctAnswers || []).join('\n'))}</textarea>
        </div>
        <div class="form-group form-checkbox-row">
          <label class="checkbox-label" for="quizQuestionCaseSensitive">
            <input type="checkbox" id="quizQuestionCaseSensitive" ${normalized.caseSensitive ? 'checked' : ''}>
            <span>${t('moodleNewQuestion.caseSensitive')}</span>
          </label>
        </div>
      `;
    }

    if (type === 'matching') {
      return `
        <div class="form-group">
          <label>${isEnglish ? 'Matching pairs' : '配對組合'}</label>
          <div id="quizMatchingPairsList">
            ${(normalized.matchingPairs || []).map(pair => `
              <div class="builder-option-row builder-cloze-row">
                <input type="text" class="matching-prompt-input" value="${this.escapeText(pair.prompt || '')}" placeholder="${this.escapeText(isEnglish ? 'Prompt' : '題目/左側')}">
                <input type="text" class="matching-answer-input" value="${this.escapeText(pair.answer || '')}" placeholder="${this.escapeText(isEnglish ? 'Matching answer' : '答案/右側')}">
                <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove();">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn-sm" onclick="MoodleUI.addQuizMatchingPairRow()">${isEnglish ? 'Add pair' : '新增配對'}</button>
        </div>
      `;
    }

    if (type === 'ordering') {
      return `
        <div class="form-group">
          <label>${isEnglish ? 'Correct order' : '正確排序'}</label>
          <div id="quizOrderingItemsList">
            ${(normalized.orderingItems || []).map((item, index) => `
              <div class="builder-option-row">
                <span class="builder-badge">${index + 1}</span>
                <input type="text" class="ordering-item-input" value="${this.escapeText(item || '')}" placeholder="${this.escapeText(isEnglish ? 'Step or item' : '步驟或項目')}">
                <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove();">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn-sm" onclick="MoodleUI.addQuizOrderingItemRow()">${isEnglish ? 'Add item' : '新增項目'}</button>
          <p class="form-hint">${isEnglish ? 'Enter items in the correct order. Learners will receive them shuffled.' : '請依正確順序輸入，學生作答時會看到打亂後的項目。'}</p>
        </div>
      `;
    }

    if (type === 'numerical') {
      return `
        <div class="activity-builder-grid">
          <div class="form-group">
            <label>${isEnglish ? 'Correct number' : '正確數值'}</label>
            <input type="number" id="quizQuestionNumericAnswer" value="${this.escapeText(String(normalized.numericAnswer ?? ''))}" step="any">
          </div>
          <div class="form-group">
            <label>${isEnglish ? 'Accepted tolerance' : '允許誤差'}</label>
            <input type="number" id="quizQuestionNumericTolerance" value="${this.escapeText(String(normalized.numericTolerance || 0))}" min="0" step="any">
          </div>
        </div>
      `;
    }

    if (type === 'cloze') {
      return `
        <div class="form-group">
          <label>${isEnglish ? 'Cloze passage' : '克漏字文章'}</label>
          <textarea id="quizQuestionClozeText" rows="5" placeholder="${this.escapeText(isEnglish ? 'Use [[1]], [[2]]... where blanks should appear.' : '在空格處輸入 [[1]]、[[2]]...')}">${this.escapeText(normalized.clozeText || normalized.text || '')}</textarea>
          <p class="form-hint">${isEnglish ? 'Example: I [[1]] a student and this [[2]] my book.' : '範例：I [[1]] a student and this [[2]] my book.'}</p>
        </div>
        <div class="form-group">
          <label>${isEnglish ? 'Accepted answers for blanks' : '各空格可接受答案'}</label>
          <div id="quizClozeAnswersList">
            ${(normalized.clozeAnswers || []).map(blank => `
              <div class="builder-option-row">
                <input type="text" class="cloze-id-input" value="${this.escapeText(blank.id || '')}" placeholder="${this.escapeText(isEnglish ? 'Blank ID' : '空格編號')}">
                <input type="text" class="cloze-answer-input" value="${this.escapeText((blank.answers || []).join(' | '))}" placeholder="${this.escapeText(isEnglish ? 'Answers separated by |' : '多個答案用 | 分隔')}">
                <label class="checkbox-label"><input type="checkbox" class="cloze-case-input" ${blank.caseSensitive ? 'checked' : ''}> ${t('moodleNewQuestion.caseSensitive')}</label>
                <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove();">×</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn-sm" onclick="MoodleUI.addQuizClozeBlankRow()">${isEnglish ? 'Add blank' : '新增空格'}</button>
        </div>
      `;
    }

    return `
      <div class="form-group">
        <label>${t('moodleNewQuestion.referenceAnswer')}</label>
        <textarea id="quizQuestionReferenceAnswer" rows="4" placeholder="${t('moodleNewQuestion.referencePlaceholder')}">${this.escapeText(normalized.referenceAnswer || '')}</textarea>
      </div>
      <div class="form-group">
        <label>${t('moodleNewQuestion.minWords')}</label>
        <input type="number" id="quizQuestionMinWords" value="${this.escapeText(normalized.minWords || 0)}" min="0">
      </div>
    `;
  },

  updateQuizQuestionEditorForm() {
    const dynamicArea = document.getElementById('quizQuestionDynamicArea');
    if (!dynamicArea) return;
    const type = document.getElementById('quizQuestionType')?.value || 'multiple_choice';
    const draft = this.currentQuizQuestionEditorState?.draft || this.createEmptyQuizBuilderQuestion(type);
    this.currentQuizQuestionEditorState = {
      ...(this.currentQuizQuestionEditorState || {}),
      draft: this.normalizeQuizBuilderQuestion({ ...draft, type })
    };
    dynamicArea.innerHTML = this.renderQuizQuestionEditorOptions(type, this.currentQuizQuestionEditorState.draft);
    this.syncQuizQuestionOptionIndices();
  },

  syncQuizQuestionOptionIndices() {
    const rows = document.querySelectorAll('#quizQuestionOptionsList .builder-option-row');
    if (rows.length === 0) return;
    const isEnglish = I18n.getLocale() === 'en';
    let checkedExists = false;

    rows.forEach((row, index) => {
      const radio = row.querySelector('input[type="radio"]');
      const checkbox = row.querySelector('input[name="quizQuestionCorrectMulti"]');
      const textInput = row.querySelector('input[type="text"]');
      if (radio) {
        radio.value = String(index);
        if (radio.checked) checkedExists = true;
      }
      if (checkbox) {
        checkbox.value = String(index);
      }
      if (textInput) {
        textInput.placeholder = `${isEnglish ? 'Option' : '選項'} ${String.fromCharCode(65 + index)}`;
      }
    });

    if (!checkedExists) {
      const firstRadio = rows[0]?.querySelector('input[type="radio"]');
      if (firstRadio) {
        firstRadio.checked = true;
      }
    }
  },

  addQuizQuestionOptionRow() {
    const list = document.getElementById('quizQuestionOptionsList');
    if (!list) return;
    const isEnglish = I18n.getLocale() === 'en';

    const row = document.createElement('div');
    row.className = 'builder-option-row builder-choice-row';
    row.innerHTML = `
      <label class="correct-option-control">
        <input type="radio" name="quizQuestionCorrect" value="0">
        <span>${isEnglish ? 'Correct' : '正確答案'}</span>
      </label>
      <input type="text" class="option-input" placeholder="${this.escapeText(isEnglish ? 'Option' : '選項')}">
      <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove(); MoodleUI.syncQuizQuestionOptionIndices();" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
    `;
    list.appendChild(row);
    this.syncQuizQuestionOptionIndices();
  },

  addQuizQuestionMultiSelectOptionRow() {
    const list = document.getElementById('quizQuestionOptionsList');
    if (!list) return;
    const isEnglish = I18n.getLocale() === 'en';

    const row = document.createElement('div');
    row.className = 'builder-option-row builder-choice-row';
    row.innerHTML = `
      <label class="correct-option-control">
        <input type="checkbox" name="quizQuestionCorrectMulti" value="0">
        <span>${isEnglish ? 'Correct' : '正確選項'}</span>
      </label>
      <input type="text" class="option-input" placeholder="${this.escapeText(isEnglish ? 'Option' : '選項')}">
      <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove(); MoodleUI.syncQuizQuestionOptionIndices();" aria-label="${isEnglish ? 'Remove option' : '刪除選項'}">×</button>
    `;
    list.appendChild(row);
    this.syncQuizQuestionOptionIndices();
  },

  addQuizMatchingPairRow() {
    const list = document.getElementById('quizMatchingPairsList');
    if (!list) return;
    const isEnglish = I18n.getLocale() === 'en';
    const row = document.createElement('div');
    row.className = 'builder-option-row builder-cloze-row';
    row.innerHTML = `
      <input type="text" class="matching-prompt-input" placeholder="${this.escapeText(isEnglish ? 'Prompt' : '題目/左側')}">
      <input type="text" class="matching-answer-input" placeholder="${this.escapeText(isEnglish ? 'Matching answer' : '答案/右側')}">
      <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove();">×</button>
    `;
    list.appendChild(row);
  },

  addQuizOrderingItemRow() {
    const list = document.getElementById('quizOrderingItemsList');
    if (!list) return;
    const isEnglish = I18n.getLocale() === 'en';
    const row = document.createElement('div');
    row.className = 'builder-option-row';
    row.innerHTML = `
      <span class="builder-badge">${list.children.length + 1}</span>
      <input type="text" class="ordering-item-input" placeholder="${this.escapeText(isEnglish ? 'Step or item' : '步驟或項目')}">
      <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove();">×</button>
    `;
    list.appendChild(row);
  },

  addQuizClozeBlankRow() {
    const list = document.getElementById('quizClozeAnswersList');
    if (!list) return;
    const isEnglish = I18n.getLocale() === 'en';
    const row = document.createElement('div');
    row.className = 'builder-option-row';
    row.innerHTML = `
      <input type="text" class="cloze-id-input" value="${list.children.length + 1}" placeholder="${this.escapeText(isEnglish ? 'Blank ID' : '空格編號')}">
      <input type="text" class="cloze-answer-input" placeholder="${this.escapeText(isEnglish ? 'Answers separated by |' : '多個答案用 | 分隔')}">
      <label class="checkbox-label"><input type="checkbox" class="cloze-case-input"> ${t('moodleNewQuestion.caseSensitive')}</label>
      <button type="button" class="btn-remove" onclick="this.closest('.builder-option-row').remove();">×</button>
    `;
    list.appendChild(row);
  },

  openQuizQuestionEditorModal(index = null) {
    const state = this.currentQuizBuilderState;
    if (!state) return;

    const isEditing = Number.isInteger(index) && index >= 0;
    const question = this.normalizeQuizBuilderQuestion(
      isEditing ? (state.questions[index] || {}) : this.createEmptyQuizBuilderQuestion()
    );
    const isEnglish = I18n.getLocale() === 'en';

    this.currentQuizQuestionEditorState = {
      index: isEditing ? index : null,
      draft: question
    };

    const modal = this.createModal('quizQuestionEditorModal', isEditing
      ? (isEnglish ? 'Edit question' : '編輯題目')
      : t('moodleNewQuestion.title'), `
      <form onsubmit="event.preventDefault(); MoodleUI.saveQuizQuestionDraft()">
        <div class="quiz-create-shell">
          <section class="quiz-create-card quiz-create-card-primary">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Question' : '題目編輯器'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Question content' : '題目內容'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Define the prompt, answer structure, and grading data for this question.'
                  : '設定題目敘述、答案格式與評分所需資料。'}</p>
              </div>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${t('moodleNewQuestion.typeLabel')}</label>
                <select id="quizQuestionType">
                  <option value="multiple_choice" ${question.type === 'multiple_choice' ? 'selected' : ''}>${t('moodleQuestionBank.multipleChoice')}</option>
                  <option value="multiple_select" ${question.type === 'multiple_select' ? 'selected' : ''}>${isEnglish ? 'Multiple select' : '多選題'}</option>
                  <option value="true_false" ${question.type === 'true_false' ? 'selected' : ''}>${t('moodleQuestionBank.trueFalse')}</option>
                  <option value="short_answer" ${question.type === 'short_answer' ? 'selected' : ''}>${t('moodleQuestionBank.shortAnswer')}</option>
                  <option value="matching" ${question.type === 'matching' ? 'selected' : ''}>${t('moodleQuestionBank.matching')}</option>
                  <option value="ordering" ${question.type === 'ordering' ? 'selected' : ''}>${isEnglish ? 'Ordering' : '排序題'}</option>
                  <option value="numerical" ${question.type === 'numerical' ? 'selected' : ''}>${isEnglish ? 'Numerical' : '數值題'}</option>
                  <option value="fill_blank" ${question.type === 'fill_blank' ? 'selected' : ''}>${t('moodleQuestionBank.fillBlank')}</option>
                  <option value="cloze" ${question.type === 'cloze' ? 'selected' : ''}>${isEnglish ? 'Cloze' : '克漏字'}</option>
                  <option value="essay" ${question.type === 'essay' ? 'selected' : ''}>${t('moodleQuestionBank.essay')}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${t('moodleAddActivity.scoreLabel')}</label>
                <input type="number" id="quizQuestionPoints" value="${this.escapeText(question.points || 10)}" min="1">
              </div>
              <div class="form-group">
                <label>${t('moodleNewQuestion.diffLabel')}</label>
                <select id="quizQuestionDifficulty">
                  <option value="easy" ${question.difficulty === 'easy' ? 'selected' : ''}>${t('moodleNewQuestion.diffEasy')}</option>
                  <option value="medium" ${question.difficulty === 'medium' ? 'selected' : ''}>${t('moodleNewQuestion.diffMedium')}</option>
                  <option value="hard" ${question.difficulty === 'hard' ? 'selected' : ''}>${t('moodleNewQuestion.diffHard')}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Analysis section' : '分析區段'}</label>
                <input type="text" id="quizQuestionAnalysisSection" value="${this.escapeText(question.analysisSection || '')}" placeholder="${this.escapeText(isEnglish ? 'Grammar, Vocabulary, Listening...' : '文法、詞彙、聽力...')}">
                <p class="form-hint">${isEnglish ? 'Questions with the same section are grouped in bar charts, radar charts, and CSV exports.' : '相同區段的題目會一起進入長條圖、雷達圖與 CSV 匯出。'}</p>
              </div>
            </div>
            <div class="form-group">
              <label>${t('moodleNewQuestion.contentLabel')}</label>
              <textarea id="quizQuestionText" rows="4" placeholder="${t('moodleNewQuestion.contentPlaceholder')}">${this.escapeText(question.text || '')}</textarea>
            </div>
            <div id="quizQuestionDynamicArea">${this.renderQuizQuestionEditorOptions(question.type, question)}</div>
            <div class="form-group">
              <label>${t('moodleNewQuestion.explanationLabel')}</label>
              <textarea id="quizQuestionFeedback" rows="3" placeholder="${t('moodleNewQuestion.explanationPlaceholder')}">${this.escapeText(question.feedback || '')}</textarea>
            </div>
          </section>

          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('quizQuestionEditorModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${isEditing ? t('common.save') : t('moodleNewQuestion.create')}</button>
          </div>
        </div>
      </form>
    `, {
      maxWidth: '980px',
      className: 'modal-workspace modal-question-builder-modal',
      kicker: isEnglish ? 'Assessment workspace' : '評量工作區',
      description: isEnglish
        ? 'Edit the question before placing it into the quiz.'
        : '完成題目設定後，這一題就會加入測驗。'
    });

    modal.querySelector('#quizQuestionType')?.addEventListener('change', () => this.updateQuizQuestionEditorForm());
    this.syncQuizQuestionOptionIndices();
    window.requestAnimationFrame(() => modal.querySelector('#quizQuestionText')?.focus());
  },

  saveQuizQuestionDraft() {
    const builderState = this.currentQuizBuilderState;
    const editorState = this.currentQuizQuestionEditorState;
    if (!builderState || !editorState) return;

    const type = document.getElementById('quizQuestionType')?.value || 'multiple_choice';
    let text = document.getElementById('quizQuestionText')?.value?.trim();
    const clozeTextDraft = type === 'cloze'
      ? document.getElementById('quizQuestionClozeText')?.value?.trim()
      : '';
    if (!text && clozeTextDraft) {
      text = clozeTextDraft;
    }
    if (!text) {
      showToast(t('moodleNewQuestion.contentRequired'));
      return;
    }

    const baseQuestion = Number.isInteger(editorState.index) && builderState.questions[editorState.index]
      ? { ...builderState.questions[editorState.index] }
      : {};

    const question = {
      ...baseQuestion,
      type,
      text,
      points: parseInt(document.getElementById('quizQuestionPoints')?.value, 10) || 10,
      difficulty: document.getElementById('quizQuestionDifficulty')?.value || 'medium',
      analysisSection: document.getElementById('quizQuestionAnalysisSection')?.value?.trim()
        || (I18n.getLocale() === 'en' ? 'General' : '通用'),
      feedback: document.getElementById('quizQuestionFeedback')?.value || ''
    };

    if (type === 'multiple_choice') {
      const rows = Array.from(document.querySelectorAll('#quizQuestionOptionsList .builder-option-row'));
      const options = [];
      let correctOption = 0;
      rows.forEach(row => {
        const optionText = row.querySelector('.option-input')?.value?.trim();
        if (!optionText) return;
        const nextIndex = options.length;
        if (row.querySelector('input[name="quizQuestionCorrect"]')?.checked) {
          correctOption = nextIndex;
        }
        options.push(optionText);
      });
      if (options.length < 2) {
        showToast(t('moodleNewQuestion.minOptions'));
        return;
      }
      question.options = options;
      question.correctAnswer = Math.max(0, Math.min(options.length - 1, correctOption));
      question.correctAnswers = [];
      question.referenceAnswer = '';
      question.minWords = 0;
      question.caseSensitive = false;
      question.matchingPairs = [];
      question.orderingItems = [];
      question.clozeAnswers = [];
    } else if (type === 'multiple_select') {
      const rows = Array.from(document.querySelectorAll('#quizQuestionOptionsList .builder-option-row'));
      const options = [];
      const correctAnswers = [];
      rows.forEach(row => {
        const optionText = row.querySelector('.option-input')?.value?.trim();
        if (!optionText) return;
        const nextIndex = options.length;
        if (row.querySelector('input[name="quizQuestionCorrectMulti"]')?.checked) {
          correctAnswers.push(nextIndex);
        }
        options.push(optionText);
      });
      if (options.length < 2) {
        showToast(t('moodleNewQuestion.minOptions'));
        return;
      }
      if (correctAnswers.length === 0) {
        showToast(I18n.getLocale() === 'en' ? 'Select at least one correct option.' : '請至少勾選一個正確選項。');
        return;
      }
      question.options = options;
      question.correctAnswer = null;
      question.correctAnswers = correctAnswers;
      question.referenceAnswer = '';
      question.minWords = 0;
      question.caseSensitive = false;
      question.matchingPairs = [];
      question.orderingItems = [];
      question.clozeAnswers = [];
    } else if (type === 'true_false') {
      question.options = [];
      question.correctAnswer = document.querySelector('input[name="quizQuestionTrueFalse"]:checked')?.value !== 'false';
      question.correctAnswers = [];
      question.referenceAnswer = '';
      question.minWords = 0;
      question.caseSensitive = false;
      question.matchingPairs = [];
      question.orderingItems = [];
      question.clozeAnswers = [];
    } else if (type === 'short_answer' || type === 'fill_blank') {
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = String(document.getElementById('quizQuestionAcceptedAnswers')?.value || '')
        .split('\n')
        .map(answer => answer.trim())
        .filter(Boolean);
      question.referenceAnswer = '';
      question.minWords = 0;
      question.caseSensitive = document.getElementById('quizQuestionCaseSensitive')?.checked === true;
      question.matchingPairs = [];
      question.orderingItems = [];
      question.clozeAnswers = [];
    } else if (type === 'matching') {
      const pairs = Array.from(document.querySelectorAll('#quizMatchingPairsList .builder-option-row'))
        .map(row => ({
          prompt: row.querySelector('.matching-prompt-input')?.value?.trim() || '',
          answer: row.querySelector('.matching-answer-input')?.value?.trim() || ''
        }))
        .filter(pair => pair.prompt && pair.answer);
      if (pairs.length < 2) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least two complete matching pairs.' : '請至少新增兩組完整配對。');
        return;
      }
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = [];
      question.matchingPairs = pairs;
      question.referenceAnswer = '';
      question.minWords = 0;
      question.caseSensitive = false;
      question.orderingItems = [];
      question.clozeAnswers = [];
    } else if (type === 'ordering') {
      const orderingItems = Array.from(document.querySelectorAll('#quizOrderingItemsList .ordering-item-input'))
        .map(input => input.value.trim())
        .filter(Boolean);
      if (orderingItems.length < 2) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least two ordered items.' : '請至少新增兩個排序項目。');
        return;
      }
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = [];
      question.orderingItems = orderingItems;
      question.referenceAnswer = '';
      question.minWords = 0;
      question.caseSensitive = false;
      question.matchingPairs = [];
      question.clozeAnswers = [];
    } else if (type === 'numerical') {
      const numericAnswer = Number(document.getElementById('quizQuestionNumericAnswer')?.value);
      const numericTolerance = Number(document.getElementById('quizQuestionNumericTolerance')?.value || 0);
      if (!Number.isFinite(numericAnswer)) {
        showToast(I18n.getLocale() === 'en' ? 'Enter a valid numeric answer.' : '請輸入有效的正確數值。');
        return;
      }
      question.options = [];
      question.correctAnswer = numericAnswer;
      question.correctAnswers = [];
      question.numericAnswer = numericAnswer;
      question.numericTolerance = Number.isFinite(numericTolerance) && numericTolerance > 0 ? numericTolerance : 0;
      question.referenceAnswer = '';
      question.minWords = 0;
      question.caseSensitive = false;
      question.matchingPairs = [];
      question.orderingItems = [];
      question.clozeAnswers = [];
    } else if (type === 'cloze') {
      const clozeText = clozeTextDraft || text;
      const clozeAnswers = Array.from(document.querySelectorAll('#quizClozeAnswersList .builder-option-row'))
        .map((row, index) => {
          const id = row.querySelector('.cloze-id-input')?.value?.trim() || String(index + 1);
          const answers = String(row.querySelector('.cloze-answer-input')?.value || '')
            .split('|')
            .map(answer => answer.trim())
            .filter(Boolean);
          return {
            id,
            answers,
            caseSensitive: row.querySelector('.cloze-case-input')?.checked === true
          };
        })
        .filter(blank => blank.id && blank.answers.length > 0);
      if (!clozeText) {
        showToast(t('moodleNewQuestion.contentRequired'));
        return;
      }
      if (clozeAnswers.length === 0) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least one blank answer.' : '請至少新增一個空格答案。');
        return;
      }
      question.text = clozeText;
      question.clozeText = clozeText;
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = [];
      question.clozeAnswers = clozeAnswers;
      question.referenceAnswer = '';
      question.minWords = 0;
      question.caseSensitive = false;
      question.matchingPairs = [];
      question.orderingItems = [];
    } else {
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = [];
      question.referenceAnswer = document.getElementById('quizQuestionReferenceAnswer')?.value || '';
      question.minWords = parseInt(document.getElementById('quizQuestionMinWords')?.value, 10) || 0;
      question.caseSensitive = false;
      question.matchingPairs = [];
      question.orderingItems = [];
      question.clozeAnswers = [];
    }

    const normalizedQuestion = this.normalizeQuizBuilderQuestion(question);
    if (Number.isInteger(editorState.index) && editorState.index >= 0) {
      builderState.questions.splice(editorState.index, 1, normalizedQuestion);
    } else {
      builderState.questions.push(normalizedQuestion);
    }

    this.closeModal('quizQuestionEditorModal');
    this.renderQuizBuilderQuestionList();
  },

  createQuizQuestionFromBankQuestion(question = {}) {
    return this.normalizeQuizBuilderQuestion({
      bankQuestionId: question.questionId || question.id || null,
      type: question.type,
      text: question.questionText || question.text || question.content || '',
      options: question.options || [],
      correctAnswer: question.correctAnswer,
      correctAnswers: question.correctAnswers || [],
      caseSensitive: question.caseSensitive,
      referenceAnswer: question.referenceAnswer || '',
      minWords: question.minWords || 0,
      matchingPairs: question.matchingPairs || question.pairs || [],
      orderingItems: question.orderingItems || question.orderItems || [],
      numericAnswer: question.numericAnswer ?? question.correctAnswer ?? '',
      numericTolerance: question.numericTolerance ?? question.tolerance ?? 0,
      clozeText: question.clozeText || (question.type === 'cloze' ? question.questionText || question.text || '' : ''),
      clozeAnswers: question.clozeAnswers || [],
      points: question.points || 10,
      difficulty: question.difficulty || 'medium',
      analysisSection: question.analysisSection || question.categoryName || question.category || question.skill || '',
      feedback: question.explanation || question.feedback || '',
      tags: question.tags || []
    });
  },

  updateQuizQuestionBankSelectionSummary() {
    const summary = document.getElementById('quizQuestionBankSelectionSummary');
    if (!summary) return;
    const selectedCount = this.currentQuizQuestionBankPicker?.selectedIds?.size || 0;
    summary.textContent = I18n.getLocale() === 'en'
      ? `${selectedCount} question(s) selected`
      : `已選擇 ${selectedCount} 題`;
  },

  renderQuizQuestionBankPickerList() {
    const picker = this.currentQuizQuestionBankPicker;
    const list = document.getElementById('quizQuestionBankList');
    if (!picker || !list) return;

    const isEnglish = I18n.getLocale() === 'en';
    const search = String(document.getElementById('quizQuestionBankSearch')?.value || '').trim().toLowerCase();
    const categoryId = document.getElementById('quizQuestionBankCategory')?.value || '';
    const difficulty = document.getElementById('quizQuestionBankDifficulty')?.value || '';

    const filtered = (picker.questions || []).filter((question) => {
      const matchesSearch = !search
        || String(question.questionText || question.text || '').toLowerCase().includes(search)
        || (Array.isArray(question.tags) && question.tags.some(tag => String(tag).toLowerCase().includes(search)));
      const matchesCategory = !categoryId || question.categoryId === categoryId;
      const matchesDifficulty = !difficulty || question.difficulty === difficulty;
      return matchesSearch && matchesCategory && matchesDifficulty;
    });

    list.innerHTML = filtered.length === 0
      ? `
        <div class="builder-question-empty">
          <strong>${isEnglish ? 'No matching questions' : '找不到符合條件的題目'}</strong>
          <p>${isEnglish
            ? 'Try a different keyword or add new questions in the question bank first.'
            : '可以換個關鍵字，或先到題庫建立題目。'}</p>
        </div>
      `
      : filtered.map((question) => {
        const questionId = question.questionId || question.id;
        const checked = picker.selectedIds.has(questionId) ? 'checked' : '';
        return `
          <label class="quiz-bank-item">
            <div class="quiz-bank-item-check">
              <input type="checkbox" ${checked} onchange="MoodleUI.toggleQuizQuestionBankSelection(${this.toInlineActionValue(questionId)}, this.checked)">
            </div>
            <div class="quiz-bank-item-copy">
              <div class="builder-badge-row">
                <span class="builder-badge">${this.escapeText(this.getLocalizedQuestionType(question.type))}</span>
                <span class="builder-badge">${this.escapeText(String(question.points || 0))} ${isEnglish ? 'pts' : '分'}</span>
                ${question.category ? `<span class="builder-badge">${this.escapeText(question.category)}</span>` : ''}
              </div>
              <h4>${this.escapeText(this.truncateText(question.questionText || question.text || '', 220) || (isEnglish ? 'Untitled question' : '未命名題目'))}</h4>
              <p>${this.escapeText((question.tags || []).slice(0, 5).join(', ') || (isEnglish ? 'No tags' : '未設定標籤'))}</p>
            </div>
          </label>
        `;
      }).join('');

    this.updateQuizQuestionBankSelectionSummary();
  },

  toggleQuizQuestionBankSelection(questionId, checked) {
    const picker = this.currentQuizQuestionBankPicker;
    if (!picker) return;
    if (checked) {
      picker.selectedIds.add(questionId);
    } else {
      picker.selectedIds.delete(questionId);
    }
    this.updateQuizQuestionBankSelectionSummary();
  },

  async openQuizQuestionBankModal() {
    const builderState = this.currentQuizBuilderState;
    if (!builderState) return;

    const courseId = document.getElementById('quizBuilderCourse')?.value || builderState.courseId;
    if (!courseId) {
      showToast(I18n.getLocale() === 'en' ? 'Please select a course first.' : '請先選擇課程。');
      return;
    }

    const [questionsResult, categoriesResult] = await Promise.all([
      API.questionBank.list({ courseId, limit: 200 }).catch(() => ({ success: false, data: [] })),
      API.questionBank.getCategories({ courseId }).catch(() => ({ success: false, data: [] }))
    ]);

    const questions = questionsResult?.success && Array.isArray(questionsResult.data)
      ? questionsResult.data
      : [];
    const categories = categoriesResult?.success && Array.isArray(categoriesResult.data)
      ? categoriesResult.data
      : [];

    this.currentQuizQuestionBankPicker = {
      courseId,
      questions,
      categories,
      selectedIds: new Set()
    };

    const isEnglish = I18n.getLocale() === 'en';
    const modal = this.createModal('quizQuestionBankModal', isEnglish ? 'Add from question bank' : '從題庫加入題目', `
      <form onsubmit="event.preventDefault(); MoodleUI.appendSelectedBankQuestionsToQuizBuilder()">
        <div class="quiz-create-shell">
          <section class="quiz-create-card quiz-create-card-primary">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Question bank' : '題庫'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Pick reusable questions' : '選擇可重用題目'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Search this course question bank and add selected questions into the quiz builder.'
                  : '從這門課的題庫挑選題目，直接加入目前的測驗編排。'}</p>
              </div>
              <span id="quizQuestionBankSelectionSummary" class="builder-badge">0</span>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${isEnglish ? 'Search' : '搜尋'}</label>
                <input type="text" id="quizQuestionBankSearch" placeholder="${this.escapeText(isEnglish ? 'Search question text or tags' : '搜尋題目內容或標籤')}">
              </div>
              <div class="form-group">
                <label>${t('moodleQuestionBank.categoriesTitle')}</label>
                <select id="quizQuestionBankCategory">
                  <option value="">${t('moodleQuestionBank.allQuestions')}</option>
                  ${categories.map(category => `<option value="${this.escapeText(category.categoryId)}">${this.escapeText(category.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>${t('moodleNewQuestion.diffLabel')}</label>
                <select id="quizQuestionBankDifficulty">
                  <option value="">${isEnglish ? 'All levels' : '全部難度'}</option>
                  <option value="easy">${t('moodleNewQuestion.diffEasy')}</option>
                  <option value="medium">${t('moodleNewQuestion.diffMedium')}</option>
                  <option value="hard">${t('moodleNewQuestion.diffHard')}</option>
                </select>
              </div>
            </div>
            <div id="quizQuestionBankList" class="quiz-bank-list"></div>
          </section>

          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('quizQuestionBankModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${isEnglish ? 'Add selected questions' : '加入所選題目'}</button>
          </div>
        </div>
      </form>
    `, {
      maxWidth: '1040px',
      className: 'modal-workspace modal-question-bank-picker-modal',
      kicker: isEnglish ? 'Assessment workspace' : '評量工作區',
      description: isEnglish
        ? 'Bring existing question bank items into this quiz without leaving the builder.'
        : '不用離開測驗 builder，就能把題庫題目帶進來。'
    });

    modal.querySelector('#quizQuestionBankSearch')?.addEventListener('input', () => this.renderQuizQuestionBankPickerList());
    modal.querySelector('#quizQuestionBankCategory')?.addEventListener('change', () => this.renderQuizQuestionBankPickerList());
    modal.querySelector('#quizQuestionBankDifficulty')?.addEventListener('change', () => this.renderQuizQuestionBankPickerList());

    this.renderQuizQuestionBankPickerList();
  },

  appendSelectedBankQuestionsToQuizBuilder() {
    const builderState = this.currentQuizBuilderState;
    const picker = this.currentQuizQuestionBankPicker;
    if (!builderState || !picker) return;

    const selectedQuestions = (picker.questions || []).filter((question) => picker.selectedIds.has(question.questionId || question.id));
    if (selectedQuestions.length === 0) {
      showToast(I18n.getLocale() === 'en' ? 'Please select at least one question.' : '請至少選擇一題。');
      return;
    }

    const existingBankIds = new Set(
      (builderState.questions || [])
        .map(question => question.bankQuestionId)
        .filter(Boolean)
    );

    const appended = selectedQuestions
      .filter(question => !existingBankIds.has(question.questionId || question.id))
      .map(question => this.createQuizQuestionFromBankQuestion(question));

    if (appended.length === 0) {
      showToast(I18n.getLocale() === 'en' ? 'Those question bank items are already in this quiz.' : '這些題庫題目已經在這份測驗裡了。');
      return;
    }

    builderState.questions.push(...appended);
    this.closeModal('quizQuestionBankModal');
    this.renderQuizBuilderQuestionList();
    showToast(I18n.getLocale() === 'en'
      ? `${appended.length} question(s) added`
      : `已加入 ${appended.length} 題`);
  },

  getQuizBulkImportSample(format = 'csv') {
    if (format === 'json') {
      return JSON.stringify([
        {
          type: 'multiple_choice',
          text: '壓力管理的第一步通常是什麼？',
          options: ['覺察自己的狀態', '忽略壓力', '立刻責怪自己', '完全停止學習'],
          correctAnswer: 'A',
          points: 10,
          difficulty: 'medium',
          analysisSection: '壓力覺察',
          feedback: '先覺察狀態，才有機會選擇合適的調節策略。',
          tags: ['正念', '壓力']
        },
        {
          type: 'multiple_select',
          text: '下列哪些做法有助於穩定情緒？',
          options: ['深呼吸', '短暫休息', '熬夜硬撐', '向可信任的人求助'],
          correctAnswers: ['A', 'B', 'D'],
          points: 10,
          difficulty: 'medium',
          analysisSection: '情緒調節'
        },
        {
          type: 'true_false',
          text: '正念練習一定要完全沒有雜念才算成功。',
          correctAnswer: false,
          points: 5,
          difficulty: 'easy'
        },
        {
          type: 'short_answer',
          text: '請寫出一個你可以在課堂前使用的放鬆方法。',
          correctAnswers: ['深呼吸', '伸展', '覺察呼吸'],
          points: 10,
          difficulty: 'medium'
        },
        {
          type: 'essay',
          text: '請說明你會如何把今天學到的壓力調節方法用在生活中。',
          referenceAnswer: '能具體描述情境、方法與後續調整。',
          minWords: 50,
          points: 20,
          difficulty: 'hard'
        }
      ], null, 2);
    }

    return [
      'type,text,options,correctAnswer,correctAnswers,points,difficulty,analysisSection,feedback,tags',
      '"multiple_choice","壓力管理的第一步通常是什麼？","覺察自己的狀態|忽略壓力|立刻責怪自己|完全停止學習","A","",10,"medium","壓力覺察","先覺察狀態，才有機會選擇合適的調節策略。","正念|壓力"',
      '"multiple_select","下列哪些做法有助於穩定情緒？","深呼吸|短暫休息|熬夜硬撐|向可信任的人求助","","A|B|D",10,"medium","情緒調節","","正念|情緒"',
      '"true_false","正念練習一定要完全沒有雜念才算成功。","","false","",5,"easy","","",""',
      '"short_answer","請寫出一個你可以在課堂前使用的放鬆方法。","","深呼吸|伸展|覺察呼吸","",10,"medium","","",""',
      '"essay","請說明你會如何把今天學到的壓力調節方法用在生活中。","","","",20,"hard","生活應用","能具體描述情境、方法與後續調整。","反思"'
    ].join('\n');
  },

  switchQuizBulkImportFormat(format) {
    const textarea = document.getElementById('quizBulkImportData');
    if (!textarea) return;
    const previousFormat = this.currentQuizBulkImportState?.format || 'csv';
    const previousSample = this.getQuizBulkImportSample(previousFormat).trim();
    if (!textarea.value.trim() || textarea.value.trim() === previousSample) {
      textarea.value = this.getQuizBulkImportSample(format);
    }
    this.currentQuizBulkImportState = {
      ...(this.currentQuizBulkImportState || {}),
      format
    };
    this.updateQuizBulkImportPreview();
  },

  openQuizBulkImportModal() {
    const builderState = this.currentQuizBuilderState;
    if (!builderState) return;

    const courseId = document.getElementById('quizBuilderCourse')?.value || builderState.courseId;
    if (!courseId) {
      showToast(I18n.getLocale() === 'en' ? 'Please select a course first.' : '請先選擇課程。');
      return;
    }

    const isEnglish = I18n.getLocale() === 'en';
    this.currentQuizBulkImportState = {
      format: 'csv',
      rows: [],
      validQuestions: []
    };

    const modal = this.createModal('quizBulkImportModal', isEnglish ? 'Bulk import questions' : '批量匯入題目', `
      <form onsubmit="event.preventDefault(); MoodleUI.appendQuizBulkImportedQuestions()">
        <div class="quiz-create-shell">
          <section class="quiz-create-card quiz-create-card-primary">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Question import' : '題目匯入'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Paste CSV or JSON questions' : '貼上 CSV 或 JSON 題目'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Import multiple quiz questions at once, validate the answer keys, then add them into this quiz builder.'
                  : '一次貼上多題，先檢查題目與答案設定，再加入目前這份測驗。'}</p>
              </div>
              <span class="builder-badge">${isEnglish ? 'Supports 5 core types' : '支援 5 種核心題型'}</span>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${isEnglish ? 'Format' : '格式'}</label>
                <select id="quizBulkImportFormat" onchange="MoodleUI.switchQuizBulkImportFormat(this.value)">
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Save destination' : '儲存方式'}</label>
                <label class="checkbox-label bulk-import-checkbox">
                  <input type="checkbox" id="quizBulkImportSaveToBank" checked>
                  <span>${isEnglish ? 'Also save imported questions to this course question bank' : '同時存入這門課的題庫，之後可重複使用'}</span>
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>${isEnglish ? 'Question data' : '題目資料'}</label>
              <textarea id="quizBulkImportData" rows="14" spellcheck="false" placeholder="${this.escapeText(isEnglish ? 'Paste CSV or JSON question data here' : '在這裡貼上 CSV 或 JSON 題目資料')}">${this.escapeText(this.getQuizBulkImportSample('csv'))}</textarea>
              <p class="form-hint">${isEnglish
                ? 'CSV fields: type, text, options, correctAnswer, correctAnswers, points, difficulty, analysisSection, feedback, tags. Separate options and multiple answers with |.'
                : 'CSV 欄位：type, text, options, correctAnswer, correctAnswers, points, difficulty, analysisSection, feedback, tags。選項與多個答案用 | 分隔。'}</p>
            </div>
            <div class="builder-toolbar bulk-import-template-actions">
              <button type="button" class="btn-secondary" onclick="MoodleUI.downloadQuizBulkImportTemplate()">${isEnglish ? 'Download template' : '下載範本'}</button>
              <button type="button" class="btn-secondary" onclick="MoodleUI.updateQuizBulkImportPreview()">${isEnglish ? 'Preview validation' : '預覽驗證'}</button>
            </div>
          </section>

          <section class="quiz-create-card">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Validation' : '驗證結果'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Questions ready to add' : '準備加入的題目'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Rows with missing text, options, or answer keys must be fixed before importing.'
                  : '缺少題目、選項或正確答案的列必須先修正，才會加入測驗。'}</p>
              </div>
            </div>
            <div id="quizBulkImportPreview" class="bulk-import-preview"></div>
          </section>

          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('quizBulkImportModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${isEnglish ? 'Add questions to quiz' : '加入測驗'}</button>
          </div>
        </div>
      </form>
    `, {
      maxWidth: '1080px',
      className: 'modal-workspace modal-question-bulk-import-modal',
      kicker: isEnglish ? 'Assessment workspace' : '評量工作區',
      description: isEnglish
        ? 'Bulk import into the current quiz and optionally keep reusable copies in the question bank.'
        : '批量加入目前測驗，並可同步保存到題庫以便之後重複使用。'
    });

    modal.querySelector('#quizBulkImportData')?.addEventListener('input', () => this.updateQuizBulkImportPreview());
    this.updateQuizBulkImportPreview();
  },

  parseQuizBulkImportInput(format, rawData) {
    const trimmed = String(rawData || '').trim();
    if (!trimmed) {
      throw new Error(I18n.getLocale() === 'en' ? 'Question data is required.' : '請貼上題目資料。');
    }

    const parsed = format === 'json'
      ? JSON.parse(trimmed)
      : this.parseQuestionImportCsv(trimmed);
    const questions = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.questions) ? parsed.questions : [parsed]);

    return questions.filter(question => question && typeof question === 'object');
  },

  normalizeQuizImportQuestionType(type) {
    const key = String(type || 'multiple_choice')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const aliases = {
      single: 'multiple_choice',
      single_choice: 'multiple_choice',
      choice: 'multiple_choice',
      radio: 'multiple_choice',
      checkbox: 'multiple_select',
      checkboxes: 'multiple_select',
      multi_select: 'multiple_select',
      multiple: 'multiple_select',
      multi: 'multiple_select',
      truefalse: 'true_false',
      true_or_false: 'true_false',
      tf: 'true_false',
      boolean: 'true_false',
      short: 'short_answer',
      short_text: 'short_answer',
      text: 'short_answer',
      blank: 'fill_blank',
      fill_in_blank: 'fill_blank',
      numeric: 'numerical',
      number: 'numerical',
      open: 'essay',
      long_answer: 'essay'
    };
    return aliases[key] || key || 'multiple_choice';
  },

  splitQuizImportValues(value, { allowComma = false } = {}) {
    if (Array.isArray(value)) {
      return value.flatMap(item => this.splitQuizImportValues(item, { allowComma }));
    }
    if (value === undefined || value === null || value === '') return [];
    if (value && typeof value === 'object') {
      const candidate = value.value ?? value.text ?? value.label ?? value.answer ?? '';
      return this.splitQuizImportValues(candidate, { allowComma });
    }
    const text = String(value).trim();
    if (!text) return [];
    const separator = allowComma ? /[\n|,;]+/ : /[\n|;]+/;
    return text.split(separator).map(item => item.trim()).filter(Boolean);
  },

  getFirstFilledQuizImportValue(...values) {
    for (const value of values) {
      if (Array.isArray(value)) {
        if (value.length > 0) return value;
        continue;
      }
      if (value && typeof value === 'object') return value;
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return '';
  },

  normalizeQuizImportOptions(value) {
    if (Array.isArray(value)) {
      return value
        .map(option => {
          if (option && typeof option === 'object') {
            return String(option.text ?? option.label ?? option.value ?? '').trim();
          }
          return String(option ?? '').trim();
        })
        .filter(Boolean);
    }

    const text = String(value || '').trim();
    if (!text) return [];

    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        return this.normalizeQuizImportOptions(JSON.parse(text));
      } catch (error) {
        // Fall through to delimiter parsing.
      }
    }

    return text.split('|').map(option => option.trim()).filter(Boolean);
  },

  resolveQuizImportChoiceIndex(value, options = []) {
    if (value && typeof value === 'object') {
      return this.resolveQuizImportChoiceIndex(value.value ?? value.text ?? value.label, options);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const numericIndex = Math.trunc(value);
      return numericIndex >= 0 && numericIndex < options.length ? numericIndex : null;
    }

    const text = String(value ?? '').trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) {
      return this.resolveQuizImportChoiceIndex(Number(text), options);
    }

    const letterMatch = text.toUpperCase().match(/^(?:OPTION|選項)?\s*([A-Z])$/);
    if (letterMatch) {
      const index = letterMatch[1].charCodeAt(0) - 65;
      return index >= 0 && index < options.length ? index : null;
    }

    const lowered = text.toLowerCase();
    const exactIndex = options.findIndex(option => String(option).trim().toLowerCase() === lowered);
    return exactIndex >= 0 ? exactIndex : null;
  },

  parseQuizImportBooleanAnswer(value) {
    if (Array.isArray(value)) return this.parseQuizImportBooleanAnswer(value[0]);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    const text = String(value ?? '').trim().toLowerCase();
    if (['true', 't', 'yes', 'y', '1', '是', '對', '正確'].includes(text)) return true;
    if (['false', 'f', 'no', 'n', '0', '否', '錯', '錯誤'].includes(text)) return false;
    return null;
  },

  normalizeQuizImportMatchingPairs(value) {
    if (Array.isArray(value)) {
      return value
        .map(pair => {
          if (Array.isArray(pair)) {
            return {
              prompt: String(pair[0] ?? '').trim(),
              answer: String(pair[1] ?? '').trim()
            };
          }
          return {
            prompt: String(pair?.prompt ?? pair?.question ?? pair?.left ?? '').trim(),
            answer: String(pair?.answer ?? pair?.right ?? pair?.match ?? '').trim()
          };
        })
        .filter(pair => pair.prompt && pair.answer);
    }

    return String(value || '')
      .split(/[\n;]+/)
      .map(row => row.trim())
      .filter(Boolean)
      .map(row => {
        const parts = row.includes('=>') ? row.split('=>') : row.split(':');
        return {
          prompt: String(parts[0] || '').trim(),
          answer: String(parts.slice(1).join(':') || '').trim()
        };
      })
      .filter(pair => pair.prompt && pair.answer);
  },

  normalizeQuizImportClozeAnswers(value) {
    if (Array.isArray(value)) {
      return value
        .map((blank, index) => {
          if (blank && typeof blank === 'object') {
            const answers = this.splitQuizImportValues(blank.answers ?? blank.acceptedAnswers ?? blank.answer ?? blank.value);
            return {
              id: String(blank.id || blank.blankId || index + 1).trim(),
              answers,
              caseSensitive: !!blank.caseSensitive
            };
          }
          return {
            id: String(index + 1),
            answers: this.splitQuizImportValues(blank),
            caseSensitive: false
          };
        })
        .filter(blank => blank.id && blank.answers.length > 0);
    }

    return String(value || '')
      .split(/[\n;]+/)
      .map((row, index) => {
        const parts = row.split(':');
        const hasExplicitId = parts.length > 1;
        return {
          id: hasExplicitId ? parts.shift().trim() : String(index + 1),
          answers: this.splitQuizImportValues(parts.join(':') || row),
          caseSensitive: false
        };
      })
      .filter(blank => blank.id && blank.answers.length > 0);
  },

  normalizeQuizBulkImportQuestion(rawQuestion = {}, index = 0) {
    const isEnglish = I18n.getLocale() === 'en';
    const errors = [];
    const type = this.normalizeQuizImportQuestionType(rawQuestion.type || rawQuestion.questionType || rawQuestion.kind);
    const supportedTypes = new Set([
      'multiple_choice',
      'multiple_select',
      'true_false',
      'short_answer',
      'fill_blank',
      'essay',
      'matching',
      'ordering',
      'numerical',
      'cloze'
    ]);

    if (!supportedTypes.has(type)) {
      errors.push(isEnglish ? `Unsupported question type: ${type}` : `不支援的題型：${type}`);
    }

    const text = String(
      rawQuestion.questionText
      ?? rawQuestion.text
      ?? rawQuestion.question
      ?? rawQuestion.prompt
      ?? rawQuestion.title
      ?? rawQuestion.clozeText
      ?? ''
    ).trim();
    const pointsValue = Number(rawQuestion.points ?? rawQuestion.score ?? rawQuestion.grade ?? 10);
    const points = Number.isFinite(pointsValue) && pointsValue > 0 ? pointsValue : 10;
    const difficulty = ['easy', 'medium', 'hard'].includes(String(rawQuestion.difficulty || '').trim())
      ? String(rawQuestion.difficulty).trim()
      : 'medium';
    const analysisSection = String(
      rawQuestion.analysisSection
      ?? rawQuestion.section
      ?? rawQuestion.skill
      ?? rawQuestion.categoryName
      ?? ''
    ).trim();
    const feedback = String(rawQuestion.feedback ?? rawQuestion.explanation ?? rawQuestion.analysis ?? '').trim();
    const tags = this.splitQuizImportValues(rawQuestion.tags, { allowComma: true });

    const question = {
      type: supportedTypes.has(type) ? type : 'multiple_choice',
      text,
      points,
      difficulty,
      analysisSection,
      feedback,
      tags
    };

    if (!text) {
      errors.push(isEnglish ? 'Question text is required.' : '題目文字不可空白。');
    }

    if (type === 'multiple_choice') {
      const options = this.normalizeQuizImportOptions(rawQuestion.options ?? rawQuestion.choices);
      const correctAnswer = this.resolveQuizImportChoiceIndex(
        this.getFirstFilledQuizImportValue(
          rawQuestion.correctAnswer,
          rawQuestion.correct_answer,
          rawQuestion.answer,
          rawQuestion.correct
        ),
        options
      );
      question.options = options;
      question.correctAnswer = correctAnswer ?? 0;
      question.correctAnswers = [];
      if (options.length < 2) {
        errors.push(isEnglish ? 'Multiple choice needs at least two options.' : '選擇題至少需要兩個選項。');
      }
      if (correctAnswer === null) {
        errors.push(isEnglish ? 'Set a valid correct answer such as A, B, or 0.' : '請設定有效正確答案，例如 A、B 或 0。');
      }
    } else if (type === 'multiple_select') {
      const options = this.normalizeQuizImportOptions(rawQuestion.options ?? rawQuestion.choices);
      const answerValues = this.splitQuizImportValues(
        this.getFirstFilledQuizImportValue(
          rawQuestion.correctAnswers,
          rawQuestion.correct_answers,
          rawQuestion.correctAnswer,
          rawQuestion.correct_answer,
          rawQuestion.answer,
          rawQuestion.correct
        ),
        { allowComma: true }
      );
      const correctAnswers = [...new Set(answerValues
        .map(answer => this.resolveQuizImportChoiceIndex(answer, options))
        .filter(answer => answer !== null)
      )];
      question.options = options;
      question.correctAnswer = null;
      question.correctAnswers = correctAnswers;
      if (options.length < 2) {
        errors.push(isEnglish ? 'Multiple select needs at least two options.' : '多選題至少需要兩個選項。');
      }
      if (correctAnswers.length === 0) {
        errors.push(isEnglish ? 'Select at least one correct option.' : '請至少設定一個正確選項。');
      }
    } else if (type === 'true_false') {
      const correctAnswer = this.parseQuizImportBooleanAnswer(
        this.getFirstFilledQuizImportValue(
          rawQuestion.correctAnswer,
          rawQuestion.correct_answer,
          rawQuestion.answer,
          rawQuestion.correct
        )
      );
      question.options = [];
      question.correctAnswer = correctAnswer ?? true;
      question.correctAnswers = [];
      if (correctAnswer === null) {
        errors.push(isEnglish ? 'True/false answer must be true or false.' : '是非題答案必須是 true 或 false。');
      }
    } else if (type === 'short_answer' || type === 'fill_blank') {
      const correctAnswers = this.splitQuizImportValues(
        this.getFirstFilledQuizImportValue(
          rawQuestion.correctAnswers,
          rawQuestion.correct_answers,
          rawQuestion.correctAnswer,
          rawQuestion.correct_answer,
          rawQuestion.acceptedAnswers,
          rawQuestion.answers,
          rawQuestion.answer
        ),
        { allowComma: true }
      );
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = correctAnswers;
      question.caseSensitive = rawQuestion.caseSensitive === true || String(rawQuestion.caseSensitive || '').toLowerCase() === 'true';
      if (correctAnswers.length === 0) {
        errors.push(isEnglish ? 'Add at least one accepted answer.' : '請至少設定一個可接受答案。');
      }
    } else if (type === 'essay') {
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = [];
      question.referenceAnswer = String(rawQuestion.referenceAnswer ?? rawQuestion.reference ?? rawQuestion.sampleAnswer ?? '').trim();
      question.minWords = Number.isFinite(Number(rawQuestion.minWords)) ? Number(rawQuestion.minWords) : 0;
    } else if (type === 'matching') {
      const matchingPairs = this.normalizeQuizImportMatchingPairs(rawQuestion.matchingPairs ?? rawQuestion.pairs ?? rawQuestion.options);
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = [];
      question.matchingPairs = matchingPairs;
      if (matchingPairs.length < 2) {
        errors.push(isEnglish ? 'Matching questions need at least two pairs.' : '配對題至少需要兩組配對。');
      }
    } else if (type === 'ordering') {
      const orderingItems = this.normalizeQuizImportOptions(rawQuestion.orderingItems ?? rawQuestion.orderItems ?? rawQuestion.options);
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = [];
      question.orderingItems = orderingItems;
      if (orderingItems.length < 2) {
        errors.push(isEnglish ? 'Ordering questions need at least two items.' : '排序題至少需要兩個項目。');
      }
    } else if (type === 'numerical') {
      const numericAnswer = Number(this.getFirstFilledQuizImportValue(
        rawQuestion.numericAnswer,
        rawQuestion.correctAnswer,
        rawQuestion.correct_answer,
        rawQuestion.answer
      ));
      question.options = [];
      question.correctAnswer = Number.isFinite(numericAnswer) ? numericAnswer : '';
      question.correctAnswers = [];
      question.numericAnswer = Number.isFinite(numericAnswer) ? numericAnswer : '';
      question.numericTolerance = Math.max(0, Number(rawQuestion.numericTolerance ?? rawQuestion.tolerance ?? 0) || 0);
      if (!Number.isFinite(numericAnswer)) {
        errors.push(isEnglish ? 'Numerical questions need a valid numeric answer.' : '數值題需要有效的正確數值。');
      }
    } else if (type === 'cloze') {
      const clozeText = String(rawQuestion.clozeText ?? text).trim();
      const clozeAnswers = this.normalizeQuizImportClozeAnswers(this.getFirstFilledQuizImportValue(
        rawQuestion.clozeAnswers,
        rawQuestion.correctAnswers,
        rawQuestion.answers
      ));
      question.text = clozeText;
      question.clozeText = clozeText;
      question.options = [];
      question.correctAnswer = null;
      question.correctAnswers = [];
      question.clozeAnswers = clozeAnswers;
      if (!clozeText) {
        errors.push(isEnglish ? 'Cloze text is required.' : '克漏字文章不可空白。');
      }
      if (clozeAnswers.length === 0) {
        errors.push(isEnglish ? 'Cloze questions need at least one blank answer.' : '克漏字至少需要一個空格答案。');
      }
    }

    return {
      index,
      errors,
      question: this.normalizeQuizBuilderQuestion(question)
    };
  },

  updateQuizBulkImportPreview() {
    const preview = document.getElementById('quizBulkImportPreview');
    if (!preview) return this.currentQuizBulkImportState;

    const isEnglish = I18n.getLocale() === 'en';
    const format = document.getElementById('quizBulkImportFormat')?.value || this.currentQuizBulkImportState?.format || 'csv';
    const rawData = document.getElementById('quizBulkImportData')?.value || '';

    let rows = [];
    try {
      const rawQuestions = this.parseQuizBulkImportInput(format, rawData);
      rows = rawQuestions.map((question, index) => this.normalizeQuizBulkImportQuestion(question, index));
    } catch (error) {
      this.currentQuizBulkImportState = {
        format,
        rows: [],
        validQuestions: []
      };
      preview.innerHTML = `
        <div class="builder-question-empty bulk-import-error">
          <strong>${isEnglish ? 'Cannot parse question data' : '題目資料無法解析'}</strong>
          <p>${this.escapeText(error.message || (isEnglish ? 'Check the CSV or JSON format.' : '請檢查 CSV 或 JSON 格式。'))}</p>
        </div>
      `;
      return this.currentQuizBulkImportState;
    }

    const validRows = rows.filter(row => row.errors.length === 0);
    this.currentQuizBulkImportState = {
      format,
      rows,
      validQuestions: validRows.map(row => row.question)
    };

    if (rows.length === 0) {
      preview.innerHTML = `
        <div class="builder-question-empty">
          <strong>${isEnglish ? 'No questions found' : '尚未找到題目'}</strong>
          <p>${isEnglish ? 'Paste at least one question row before importing.' : '請至少貼上一列題目資料再匯入。'}</p>
        </div>
      `;
      return this.currentQuizBulkImportState;
    }

    const invalidCount = rows.length - validRows.length;
    const visibleRows = rows.slice(0, 80);
    preview.innerHTML = `
      <div class="builder-summary-row bulk-import-summary">
        <span class="builder-badge">${rows.length} ${isEnglish ? 'row(s)' : '列'}</span>
        <span class="builder-badge">${validRows.length} ${isEnglish ? 'valid' : '可匯入'}</span>
        <span class="builder-badge">${invalidCount} ${isEnglish ? 'need fixes' : '需修正'}</span>
      </div>
      <div class="bulk-import-preview-list">
        ${visibleRows.map((row) => {
          const question = row.question;
          const isInvalid = row.errors.length > 0;
          const statusText = isInvalid
            ? (isEnglish ? 'Needs fix' : '需修正')
            : (isEnglish ? 'Ready' : '可匯入');
          return `
            <article class="bulk-import-preview-item ${isInvalid ? 'is-invalid' : ''}">
              <div class="bulk-import-preview-main">
                <div class="builder-badge-row">
                  <span class="builder-badge">${isEnglish ? 'Row' : '第'} ${row.index + 1}${isEnglish ? '' : ' 列'}</span>
                  <span class="builder-badge">${this.escapeText(statusText)}</span>
                  <span class="builder-badge">${this.escapeText(this.getLocalizedQuestionType(question.type))}</span>
                  <span class="builder-badge">${this.escapeText(String(question.points || 0))} ${isEnglish ? 'pts' : '分'}</span>
                </div>
                <h4>${this.escapeText(this.truncateText(question.text || question.clozeText || '', 180) || (isEnglish ? 'Untitled question' : '未命名題目'))}</h4>
                ${row.errors.length ? `
                  <ul class="bulk-import-error-list">
                    ${row.errors.map(error => `<li>${this.escapeText(error)}</li>`).join('')}
                  </ul>
                ` : ''}
              </div>
            </article>
          `;
        }).join('')}
      </div>
      ${rows.length > visibleRows.length ? `<p class="form-hint">${isEnglish ? `Showing first ${visibleRows.length} rows.` : `目前只顯示前 ${visibleRows.length} 列。`}</p>` : ''}
    `;

    return this.currentQuizBulkImportState;
  },

  createQuestionBankPayloadFromQuizBuilderQuestion(question = {}) {
    const normalized = this.normalizeQuizBuilderQuestion(question);
    return {
      type: normalized.type,
      questionText: normalized.clozeText || normalized.text,
      text: normalized.clozeText || normalized.text,
      options: normalized.options || [],
      correctAnswer: normalized.correctAnswer,
      correctAnswers: normalized.correctAnswers || [],
      caseSensitive: normalized.caseSensitive,
      referenceAnswer: normalized.referenceAnswer || '',
      minWords: normalized.minWords || 0,
      matchingPairs: normalized.matchingPairs || [],
      orderingItems: normalized.orderingItems || [],
      numericAnswer: normalized.numericAnswer,
      numericTolerance: normalized.numericTolerance,
      clozeText: normalized.clozeText || '',
      clozeAnswers: normalized.clozeAnswers || [],
      points: normalized.points || 10,
      difficulty: normalized.difficulty || 'medium',
      explanation: normalized.feedback || '',
      feedback: normalized.feedback || '',
      tags: normalized.tags || []
    };
  },

  async appendQuizBulkImportedQuestions() {
    const builderState = this.currentQuizBuilderState;
    if (!builderState) return;

    const courseId = document.getElementById('quizBuilderCourse')?.value || builderState.courseId;
    if (!courseId) {
      showToast(I18n.getLocale() === 'en' ? 'Please select a course first.' : '請先選擇課程。');
      return;
    }

    const importState = this.updateQuizBulkImportPreview();
    const rows = importState?.rows || [];
    const invalidCount = rows.filter(row => row.errors.length > 0).length;
    if (rows.length === 0) {
      showToast(I18n.getLocale() === 'en' ? 'Paste at least one question.' : '請至少貼上一題。');
      return;
    }
    if (invalidCount > 0) {
      showToast(I18n.getLocale() === 'en'
        ? 'Fix invalid rows before importing.'
        : '請先修正標示為錯誤的題目列。');
      return;
    }

    const localQuestions = rows.map(row => row.question);
    let appendedQuestions = localQuestions;
    const shouldSaveToBank = document.getElementById('quizBulkImportSaveToBank')?.checked === true;

    if (shouldSaveToBank) {
      try {
        const result = await API.questionBank.import({
          format: importState.format,
          courseId,
          questions: localQuestions.map(question => this.createQuestionBankPayloadFromQuizBuilderQuestion(question))
        });

        if (!result?.success) {
          showToast(result?.message || (I18n.getLocale() === 'en' ? 'Failed to save imported questions to question bank.' : '題目存入題庫失敗。'));
          return;
        }

        const bankQuestions = Array.isArray(result.data?.questions) ? result.data.questions : [];
        if (bankQuestions.length === localQuestions.length) {
          appendedQuestions = bankQuestions.map((bankQuestion, index) => {
            const bankBuilderQuestion = this.createQuizQuestionFromBankQuestion(bankQuestion);
            return {
              ...bankBuilderQuestion,
              analysisSection: localQuestions[index]?.analysisSection || bankBuilderQuestion.analysisSection
            };
          });
        }
      } catch (error) {
        console.error('Bulk import questions to bank failed:', error);
        showToast(I18n.getLocale() === 'en' ? 'Failed to save imported questions to question bank.' : '題目存入題庫失敗。');
        return;
      }
    }

    builderState.questions.push(...appendedQuestions.map(question => this.normalizeQuizBuilderQuestion(question)));
    this.closeModal('quizBulkImportModal');
    this.renderQuizBuilderQuestionList();
    showToast(I18n.getLocale() === 'en'
      ? `${appendedQuestions.length} question(s) imported`
      : `已批量加入 ${appendedQuestions.length} 題`);
  },

  downloadQuizBulkImportTemplate() {
    const format = document.getElementById('quizBulkImportFormat')?.value || 'csv';
    const content = this.getQuizBulkImportSample(format);
    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quiz-question-import-template.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async openQuizBuilderModal({ quizId = null, courseId = null, sectionId = null, returnTo = null } = {}) {
    const isEditing = !!quizId;
    const isEnglish = I18n.getLocale() === 'en';

    let quiz = null;
    if (isEditing) {
      const detailResult = await API.quizzes.get(quizId);
      if (!detailResult?.success) {
        showToast(detailResult?.message || t('moodleQuiz.loadFailed'));
        return;
      }
      quiz = this.normalizeQuizState(detailResult.data || {});
      courseId = quiz.courseId || courseId;
    }

    let courses = [];
    try {
      courses = await this.getRoleScopedCourses({ manageOnly: true });
    } catch (error) {
      console.warn('Load quiz builder courses failed:', error);
    }

    if (courses.length === 0) {
      showToast(t('moodleGradebook.noCourses'));
      return;
    }

    const resolvedCourseId = courseId || courses[0]?.courseId || courses[0]?.id || '';
    const courseOptions = courses.map((course) => {
      const currentCourseId = course.courseId || course.id;
      return `<option value="${this.escapeText(currentCourseId)}" ${currentCourseId === resolvedCourseId ? 'selected' : ''}>${this.escapeText(course.title || course.name || (isEnglish ? 'Untitled course' : '未命名課程'))}</option>`;
    }).join('');

    this.currentQuizBuilderState = {
      quizId,
      sectionId,
      returnTo: returnTo || (sectionId ? 'course' : 'quizzes'),
      courseId: resolvedCourseId,
      questions: Array.isArray(quiz?.questions)
        ? quiz.questions.map(question => this.normalizeQuizBuilderQuestion(question))
        : []
    };

    const modal = this.createModal('quizBuilderModal', isEditing
      ? (isEnglish ? 'Edit quiz' : '編輯測驗')
      : t('moodleQuizCreate.title'), `
      <form id="quizBuilderForm" onsubmit="event.preventDefault(); MoodleUI.saveQuizBuilder()">
        <div class="quiz-create-shell activity-builder-shell">
          <section class="quiz-create-card quiz-create-card-primary">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Assessment' : '測驗工作區'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Quiz overview' : '測驗主設定'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Set the learner-facing title, summary, and instructions before arranging the questions.'
                  : '先設定學生會看到的標題、摘要與說明，再安排題目內容。'}</p>
              </div>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${t('moodleQuizCreate.titleLabel')} *</label>
                <input type="text" id="quizBuilderTitle" value="${this.escapeText(quiz?.title || '')}" placeholder="${t('moodleQuizCreate.titlePlaceholder')}" required>
              </div>
              <div class="form-group">
                <label>${t('moodleQuizCreate.courseLabel')} *</label>
                <select id="quizBuilderCourse" ${isEditing ? 'disabled' : ''}>${courseOptions}</select>
              </div>
            </div>
            <div class="form-group">
              <label>${t('common.description')}</label>
              <textarea id="quizBuilderDescription" rows="3" placeholder="${t('moodleQuizCreate.descPlaceholder')}">${this.escapeText(quiz?.description || '')}</textarea>
            </div>
            <div class="form-group">
              <label>${isEnglish ? 'Quiz instructions' : '測驗說明'}</label>
              <textarea id="quizBuilderInstructions" rows="6" placeholder="${this.escapeText(isEnglish ? 'Explain how students should complete the quiz and any important rules.' : '說明學生如何完成測驗，以及任何重要作答規則。')}">${this.escapeText(quiz?.instructions || '')}</textarea>
            </div>
          </section>

          <section class="quiz-create-card">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Policy' : '作答規則'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Attempts, schedule, and release' : '次數、時間與結果公布'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Define availability, grading method, and what learners can review after submission.'
                  : '設定測驗何時開放、如何計分，以及學生交卷後可看到多少資訊。'}</p>
              </div>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${t('moodleQuizCreate.timeLimitLabel')}</label>
                <input type="number" id="quizBuilderTimeLimit" value="${this.escapeText(quiz?.timeLimit ?? 60)}" min="0">
              </div>
              <div class="form-group">
                <label>${t('moodleQuizCreate.maxAttemptsLabel')}</label>
                <input type="number" id="quizBuilderMaxAttempts" value="${this.escapeText(quiz?.maxAttempts ?? 1)}" min="0">
              </div>
              <div class="form-group">
                <label>${t('moodleQuizCreate.openDate')}</label>
                <input type="datetime-local" id="quizBuilderOpenDate" value="${this.escapeText(this.toDateTimeLocalValue(quiz?.openDate))}">
              </div>
              <div class="form-group">
                <label>${t('moodleQuizCreate.closeDate')}</label>
                <input type="datetime-local" id="quizBuilderCloseDate" value="${this.escapeText(this.toDateTimeLocalValue(quiz?.closeDate))}">
              </div>
              <div class="form-group">
                <label>${t('app.passingScore') || (isEnglish ? 'Passing score' : '及格分數')}</label>
                <input type="number" id="quizBuilderPassingGrade" value="${this.escapeText(quiz?.passingGrade ?? 60)}" min="0" max="100">
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Grade method' : '計分方式'}</label>
                <select id="quizBuilderGradeMethod">
                  <option value="highest" ${(quiz?.gradeMethod || 'highest') === 'highest' ? 'selected' : ''}>${isEnglish ? 'Highest score' : '最高分'}</option>
                  <option value="average" ${(quiz?.gradeMethod || 'highest') === 'average' ? 'selected' : ''}>${isEnglish ? 'Average score' : '平均分'}</option>
                  <option value="first" ${(quiz?.gradeMethod || 'highest') === 'first' ? 'selected' : ''}>${isEnglish ? 'First attempt' : '第一次作答'}</option>
                  <option value="last" ${(quiz?.gradeMethod || 'highest') === 'last' ? 'selected' : ''}>${isEnglish ? 'Last attempt' : '最後一次作答'}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Results visibility' : '結果公布方式'}</label>
                <select id="quizBuilderShowResults">
                  <option value="immediately" ${(quiz?.showResults || 'immediately') === 'immediately' ? 'selected' : ''}>${isEnglish ? 'Immediately after submit' : '提交後立即'}</option>
                  <option value="after_close" ${(quiz?.showResults || 'immediately') === 'after_close' ? 'selected' : ''}>${isEnglish ? 'After close date' : '截止後公布'}</option>
                  <option value="never" ${(quiz?.showResults || 'immediately') === 'never' ? 'selected' : ''}>${isEnglish ? 'Do not show' : '不顯示'}</option>
                </select>
              </div>
            </div>
            <div class="builder-checkbox-grid">
              <label class="checkbox-label" for="quizBuilderShuffleQuestions">
                <input type="checkbox" id="quizBuilderShuffleQuestions" ${quiz?.shuffleQuestions ? 'checked' : ''}>
                <span>${isEnglish ? 'Shuffle question order' : '打亂題目順序'}</span>
              </label>
              <label class="checkbox-label" for="quizBuilderShuffleAnswers">
                <input type="checkbox" id="quizBuilderShuffleAnswers" ${quiz?.shuffleAnswers ? 'checked' : ''}>
                <span>${isEnglish ? 'Shuffle answer options' : '打亂選項順序'}</span>
              </label>
              <label class="checkbox-label" for="quizBuilderShowCorrectAnswers">
                <input type="checkbox" id="quizBuilderShowCorrectAnswers" ${quiz?.showCorrectAnswers !== false ? 'checked' : ''}>
                <span>${isEnglish ? 'Show correct answers in review' : '檢視結果時顯示正確答案'}</span>
              </label>
              <label class="checkbox-label" for="quizBuilderVisible">
                <input type="checkbox" id="quizBuilderVisible" ${quiz?.visible !== false ? 'checked' : ''}>
                <span>${t('moodleCourseSettings.visibleToStudents')}</span>
              </label>
            </div>
          </section>

          <section class="quiz-create-card">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Questions' : '題目工作區'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Build the question set' : '編排測驗題目'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Add questions manually or bring reusable items from the question bank into this quiz.'
                  : '可手動新增題目，也能直接把題庫題目帶進這份測驗。'}</p>
              </div>
            </div>
            <div class="builder-toolbar">
              <button type="button" class="btn-secondary" onclick="MoodleUI.openQuizQuestionEditorModal()">${t('moodleQuestionBank.addQuestion')}</button>
              <button type="button" class="btn-secondary" onclick="MoodleUI.openQuizQuestionBankModal()">${isEnglish ? 'Add from question bank' : '從題庫加入'}</button>
              <button type="button" class="btn-secondary" onclick="MoodleUI.openQuizBulkImportModal()">${isEnglish ? 'Bulk import' : '批量匯入'}</button>
            </div>
            <div id="quizBuilderQuestionSummary"></div>
            <div id="quizBuilderQuestionList" class="builder-question-list"></div>
          </section>

          <div class="form-actions quiz-create-actions">
            <button type="button" onclick="MoodleUI.closeModal('quizBuilderModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${isEditing ? t('common.save') : t('moodleQuizCreate.createBtn')}</button>
          </div>
        </div>
      </form>
    `, {
      maxWidth: '1200px',
      className: 'modal-workspace modal-quiz-builder-modal',
      kicker: isEnglish ? 'Assessment workspace' : '評量工作區',
      description: isEnglish
        ? 'Design the quiz settings and the actual question set in one place.'
        : '在同一個流程中完成測驗設定與題目內容。'
    });

    modal.querySelector('#quizBuilderCourse')?.addEventListener('change', (event) => {
      if (this.currentQuizBuilderState) {
        this.currentQuizBuilderState.courseId = event.target.value;
      }
    });

    this.renderQuizBuilderQuestionList();
    window.requestAnimationFrame(() => modal.querySelector('#quizBuilderTitle')?.focus());
  },

  estimateQuizPayloadSizeBytes(payload = {}) {
    const json = JSON.stringify(payload || {});
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).length;
    }
    if (typeof Blob !== 'undefined') {
      return new Blob([json]).size;
    }
    return json.length;
  },

  async saveQuizBuilder() {
    const state = this.currentQuizBuilderState || {};
    const isEditing = !!state.quizId;
    const isEnglish = I18n.getLocale() === 'en';

    const title = document.getElementById('quizBuilderTitle')?.value?.trim();
    const courseId = isEditing
      ? state.courseId
      : (document.getElementById('quizBuilderCourse')?.value || state.courseId);

    if (!title || !courseId) {
      showToast(t('moodleAssignmentCreate.fieldsRequired'));
      return;
    }

    const questions = Array.isArray(state.questions) ? state.questions : [];
    if (questions.length === 0) {
      showToast(isEnglish ? 'Add at least one question before saving the quiz.' : '請至少加入一題後再儲存測驗。');
      return;
    }

    const openDate = document.getElementById('quizBuilderOpenDate')?.value || '';
    const closeDate = document.getElementById('quizBuilderCloseDate')?.value || '';
    if (openDate && closeDate && new Date(closeDate) < new Date(openDate)) {
      showToast(isEnglish ? 'Close date must be after the open date.' : '截止時間必須晚於開放時間。');
      return;
    }

    const payload = {
      courseId,
      title,
      description: document.getElementById('quizBuilderDescription')?.value || '',
      instructions: document.getElementById('quizBuilderInstructions')?.value || '',
      timeLimit: parseInt(document.getElementById('quizBuilderTimeLimit')?.value, 10) || 0,
      maxAttempts: parseInt(document.getElementById('quizBuilderMaxAttempts')?.value, 10) || 0,
      openDate: openDate || undefined,
      closeDate: closeDate || undefined,
      passingGrade: parseInt(document.getElementById('quizBuilderPassingGrade')?.value, 10) || 0,
      gradeMethod: document.getElementById('quizBuilderGradeMethod')?.value || 'highest',
      shuffleQuestions: document.getElementById('quizBuilderShuffleQuestions')?.checked === true,
      shuffleAnswers: document.getElementById('quizBuilderShuffleAnswers')?.checked === true,
      showResults: document.getElementById('quizBuilderShowResults')?.value || 'immediately',
      showCorrectAnswers: document.getElementById('quizBuilderShowCorrectAnswers')?.checked === true,
      visible: document.getElementById('quizBuilderVisible')?.checked !== false,
      questions: questions.map((question, index) => {
        const normalized = this.normalizeQuizBuilderQuestion(question);
        return {
          ...normalized,
          order: index + 1
        };
      })
    };

    if (state.sectionId) {
      payload.sectionId = state.sectionId;
    }

    const payloadSizeBytes = this.estimateQuizPayloadSizeBytes(payload);
    const payloadSizeKb = Math.round(payloadSizeBytes / 1024);
    const hardLimitBytes = 360 * 1024;
    const warningLimitBytes = 320 * 1024;
    if (payloadSizeBytes > hardLimitBytes) {
      showToast(isEnglish
        ? `This quiz is too large to save safely (${payloadSizeKb} KB). Split it into smaller quizzes or shorten repeated passages.`
        : `這份測驗資料量太大（約 ${payloadSizeKb} KB），請拆成多份測驗或縮短重複題幹後再儲存。`);
      return;
    }
    if (payloadSizeBytes > warningLimitBytes) {
      const confirmed = await showConfirmDialog({
        message: isEnglish
          ? `This quiz is already large (${payloadSizeKb} KB). Saving may be slower; continue?`
          : `這份測驗資料量偏大（約 ${payloadSizeKb} KB），儲存可能較慢。是否繼續？`,
        confirmLabel: isEnglish ? 'Continue' : '繼續',
        tone: 'warning'
      });
      if (!confirmed) return;
    }

    try {
      const result = isEditing
        ? await API.quizzes.update(state.quizId, payload)
        : await API.quizzes.create(payload);

      if (!result?.success) {
        showToast(result?.message || t('moodleQuizCreate.error'));
        return;
      }

      const savedQuizId = result.data?.quizId || state.quizId;
      this.closeModal('quizBuilderModal');
      showToast(isEditing
        ? (isEnglish ? 'Quiz updated' : '測驗已更新')
        : t('moodleQuizCreate.success'));

      if (state.returnTo === 'course' && courseId) {
        this.openCourse(courseId);
        return;
      }

      if (state.returnTo === 'quizResults' && savedQuizId) {
        this.openQuiz(savedQuizId);
        return;
      }

      showView('moodleQuizzes');
      await this.loadQuizzes(courseId || this.currentQuizCourseId || undefined);
    } catch (error) {
      console.error('Save quiz builder error:', error);
      showToast(isEditing
        ? (isEnglish ? 'Failed to update quiz' : '更新測驗失敗')
        : t('moodleQuizCreate.createFailed'));
    }
  },

  editForumSettings(forumId) {
    return this.openForumBuilderModal({
      forumId,
      returnTo: 'forumDetail'
    });
  },

  async openForumBuilderModal({ forumId = null, courseId = null, sectionId = null, returnTo = null } = {}) {
    const isEditing = !!forumId;
    const isEnglish = I18n.getLocale() === 'en';

    let forum = null;
    if (isEditing) {
      const detailResult = await API.forums.get(forumId);
      if (!detailResult?.success) {
        showToast(detailResult?.message || t('moodleForum.loadFailed'));
        return;
      }
      forum = detailResult.data || {};
      courseId = forum.courseId || courseId;
    }

    let courses = [];
    try {
      courses = await this.getRoleScopedCourses({ manageOnly: true });
    } catch (error) {
      console.warn('Load forum builder courses failed:', error);
    }

    if (courses.length === 0) {
      showToast(t('moodleGradebook.noCourses'));
      return;
    }

    const resolvedCourseId = courseId || courses[0]?.courseId || courses[0]?.id || '';
    const courseOptions = courses.map((course) => {
      const currentCourseId = course.courseId || course.id;
      return `<option value="${this.escapeText(currentCourseId)}" ${currentCourseId === resolvedCourseId ? 'selected' : ''}>${this.escapeText(course.title || course.name || (isEnglish ? 'Untitled course' : '未命名課程'))}</option>`;
    }).join('');

    this.currentForumBuilderState = {
      forumId,
      sectionId,
      returnTo: returnTo || (sectionId ? 'course' : 'forums'),
      courseId: resolvedCourseId
    };

    const modal = this.createModal('forumBuilderModal', isEditing
      ? (isEnglish ? 'Edit forum' : '編輯討論區')
      : (isEnglish ? 'Create forum' : '建立討論區'), `
      <form onsubmit="event.preventDefault(); MoodleUI.saveForumBuilder()">
        <div class="quiz-create-shell activity-builder-shell">
          <section class="quiz-create-card quiz-create-card-primary">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Forum' : '討論區工作區'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Purpose and framing' : '用途與定位'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Clarify what belongs in this forum so learners know where to post and how to participate.'
                  : '先把這個討論區的用途講清楚，學生才知道哪些內容應該發在這裡。'}</p>
              </div>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${isEnglish ? 'Forum title' : '討論區名稱'} *</label>
                <input type="text" id="forumBuilderTitle" value="${this.escapeText(forum?.title || '')}" placeholder="${this.escapeText(isEnglish ? 'Announcements, Q&A, weekly discussion...' : '例如：課程公告、問答交流、每週討論')}" required>
              </div>
              <div class="form-group">
                <label>${t('moodleAssignmentCreate.courseLabel')} *</label>
                <select id="forumBuilderCourse" ${isEditing ? 'disabled' : ''}>${courseOptions}</select>
              </div>
            </div>
            <div class="form-group">
              <label>${t('common.description')}</label>
              <textarea id="forumBuilderDescription" rows="4" placeholder="${this.escapeText(isEnglish ? 'Explain what learners should post here and what kind of replies are expected.' : '說明這個討論區適合發什麼內容，以及希望學生如何互動。')}">${this.escapeText(forum?.description || '')}</textarea>
            </div>
          </section>

          <section class="quiz-create-card">
            <div class="quiz-create-card-head">
              <div>
                <div class="quiz-create-card-kicker">${isEnglish ? 'Rules' : '互動規則'}</div>
                <div class="quiz-create-card-title">${isEnglish ? 'Posting and notification settings' : '發文與通知設定'}</div>
                <p class="quiz-create-card-note">${isEnglish
                  ? 'Set whether this forum behaves like announcements, Q&A, or an open discussion hub.'
                  : '決定這裡偏公告、問答，還是開放交流的論壇，並補上附件與通知規則。'}</p>
              </div>
            </div>
            <div class="activity-builder-grid">
              <div class="form-group">
                <label>${t('moodleAddActivity.forumTypeLabel')}</label>
                <select id="forumBuilderType">
                  <option value="general" ${(forum?.type || 'general') === 'general' ? 'selected' : ''}>${t('moodleAddActivity.forumTypeGeneral')}</option>
                  <option value="qanda" ${(forum?.type || 'general') === 'qanda' ? 'selected' : ''}>${t('moodleAddActivity.forumTypeQA')}</option>
                  <option value="news" ${(forum?.type || 'general') === 'news' ? 'selected' : ''}>${t('moodleAddActivity.forumTypeNews')}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Posting mode' : '發文模式'}</label>
                <select id="forumBuilderMode">
                  <option value="standard" ${(forum?.forumMode || 'standard') === 'standard' ? 'selected' : ''}>${isEnglish ? 'Standard forum' : '一般論壇'}</option>
                  <option value="single" ${(forum?.forumMode || 'standard') === 'single' ? 'selected' : ''}>${isEnglish ? 'Single discussion thread' : '單一討論串'}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Subscription mode' : '訂閱模式'}</label>
                <select id="forumBuilderSubscriptionMode">
                  <option value="optional" ${(forum?.subscriptionMode || 'optional') === 'optional' ? 'selected' : ''}>${isEnglish ? 'Optional' : '自由訂閱'}</option>
                  <option value="forced" ${(forum?.subscriptionMode || 'optional') === 'forced' ? 'selected' : ''}>${isEnglish ? 'Forced' : '強制訂閱'}</option>
                  <option value="auto" ${(forum?.subscriptionMode || 'optional') === 'auto' ? 'selected' : ''}>${isEnglish ? 'Auto subscribe' : '自動訂閱'}</option>
                  <option value="disabled" ${(forum?.subscriptionMode || 'optional') === 'disabled' ? 'selected' : ''}>${isEnglish ? 'No subscriptions' : '停用訂閱'}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Max attachments' : '附件數上限'}</label>
                <input type="number" id="forumBuilderMaxAttachments" value="${this.escapeText(forum?.maxAttachments ?? 5)}" min="0" max="20">
              </div>
              <div class="form-group">
                <label>${isEnglish ? 'Max attachment size (MB)' : '附件大小上限 (MB)'}</label>
                <input type="number" id="forumBuilderMaxAttachmentSize" value="${this.escapeText(forum?.maxAttachmentSize ?? 10)}" min="1" max="500">
              </div>
            </div>
            <div class="builder-checkbox-grid">
              <label class="checkbox-label" for="forumBuilderRatingEnabled">
                <input type="checkbox" id="forumBuilderRatingEnabled" ${forum?.ratingEnabled ? 'checked' : ''}>
                <span>${isEnglish ? 'Allow post ratings' : '允許貼文評分'}</span>
              </label>
              <label class="checkbox-label" for="forumBuilderVisible">
                <input type="checkbox" id="forumBuilderVisible" ${forum?.visible !== false ? 'checked' : ''}>
                <span>${t('moodleCourseSettings.visibleToStudents')}</span>
              </label>
            </div>
          </section>

          ${!isEditing ? `
            <section class="quiz-create-card">
              <div class="quiz-create-card-head">
                <div>
                  <div class="quiz-create-card-kicker">${isEnglish ? 'Launch thread' : '起始主題'}</div>
                  <div class="quiz-create-card-title">${isEnglish ? 'Open with the first discussion' : '建立後直接發布第一個主題'}</div>
                  <p class="quiz-create-card-note">${isEnglish
                    ? 'Optional, but useful when this forum needs a teacher prompt or a pinned announcement right away.'
                    : '選填，但如果這裡需要老師先拋出討論題或公告，建議一起設定。'}</p>
                </div>
              </div>
              <div class="form-group">
                <label>${t('moodleDiscussion.subjectLabel')}</label>
                <input type="text" id="forumBuilderInitialSubject" placeholder="${this.escapeText(isEnglish ? 'First discussion subject' : '第一個主題標題')}">
              </div>
              <div class="form-group">
                <label>${t('moodleDiscussion.contentLabel')}</label>
                <textarea id="forumBuilderInitialMessage" rows="5" placeholder="${this.escapeText(isEnglish ? 'Write the opening prompt, announcement, or discussion question.' : '輸入老師要先發布的公告、問題或開場說明。')}"></textarea>
              </div>
            </section>
          ` : ''}

          <div class="form-actions quiz-create-actions">
            <button type="button" onclick="MoodleUI.closeModal('forumBuilderModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${isEditing ? t('common.save') : (isEnglish ? 'Create forum' : '建立討論區')}</button>
          </div>
        </div>
      </form>
    `, {
      maxWidth: '880px',
      kicker: isEnglish ? 'Learning community workspace' : '課程論壇工作區',
      description: isEnglish
        ? 'Build a forum with clear posting rules and an optional opening prompt.'
        : '把論壇規則與第一個主題一次設定完整。'
    });

    window.requestAnimationFrame(() => modal.querySelector('#forumBuilderTitle')?.focus());
  },

  async saveForumBuilder() {
    const state = this.currentForumBuilderState || {};
    const isEditing = !!state.forumId;
    const isEnglish = I18n.getLocale() === 'en';

    const title = document.getElementById('forumBuilderTitle')?.value?.trim();
    const courseId = isEditing
      ? state.courseId
      : (document.getElementById('forumBuilderCourse')?.value || state.courseId);

    if (!title || !courseId) {
      showToast(t('moodleAssignmentCreate.fieldsRequired'));
      return;
    }

    const initialSubject = document.getElementById('forumBuilderInitialSubject')?.value?.trim() || '';
    const initialMessage = document.getElementById('forumBuilderInitialMessage')?.value?.trim() || '';
    const forumMode = document.getElementById('forumBuilderMode')?.value || 'standard';
    if (!isEditing && ((initialSubject && !initialMessage) || (!initialSubject && initialMessage))) {
      showToast(isEnglish ? 'Please complete both the opening subject and message.' : '請同時填寫起始主題標題與內容。');
      return;
    }
    if (!isEditing && forumMode === 'single' && (!initialSubject || !initialMessage)) {
      showToast(isEnglish ? 'A single-thread forum needs the opening discussion right away.' : '單一討論串論壇建立時，請一併設定第一個主題。');
      return;
    }

    const payload = {
      courseId,
      title,
      description: document.getElementById('forumBuilderDescription')?.value || '',
      type: document.getElementById('forumBuilderType')?.value || 'general',
      forumMode,
      subscriptionMode: document.getElementById('forumBuilderSubscriptionMode')?.value || 'optional',
      ratingEnabled: document.getElementById('forumBuilderRatingEnabled')?.checked === true,
      maxAttachments: parseInt(document.getElementById('forumBuilderMaxAttachments')?.value, 10) || 0,
      maxAttachmentSize: parseInt(document.getElementById('forumBuilderMaxAttachmentSize')?.value, 10) || 10,
      visible: document.getElementById('forumBuilderVisible')?.checked !== false
    };

    if (state.sectionId) {
      payload.sectionId = state.sectionId;
    }

    try {
      const result = isEditing
        ? await API.forums.update(state.forumId, payload)
        : await API.forums.create(payload);

      if (!result?.success) {
        showToast(result?.message || (isEnglish ? 'Failed to save forum' : '儲存討論區失敗'));
        return;
      }

      const savedForumId = result.data?.forumId || state.forumId;
      if (!isEditing && savedForumId && initialSubject && initialMessage) {
        await API.forums.createDiscussion(savedForumId, {
          subject: initialSubject,
          message: initialMessage,
          pinned: payload.type === 'news'
        }).catch((error) => {
          console.warn('Create initial forum discussion failed:', error);
        });
      }

      this.closeModal('forumBuilderModal');
      showToast(isEditing
        ? (isEnglish ? 'Forum updated' : '討論區已更新')
        : (isEnglish ? 'Forum created' : '討論區已建立'));

      if (state.returnTo === 'course' && courseId) {
        this.openCourse(courseId);
        return;
      }

      if (state.returnTo === 'forumDetail' && savedForumId) {
        this.openForum(savedForumId);
        return;
      }

      showView('moodleForums');
      await this.loadForums(courseId || this.currentForumCourseId || undefined);
    } catch (error) {
      console.error('Save forum builder error:', error);
      showToast(isEditing
        ? (isEnglish ? 'Failed to update forum' : '更新討論區失敗')
        : (isEnglish ? 'Failed to create forum' : '建立討論區失敗'));
    }
  },

  /**
   * 建立公告 Modal
   */
  async showCreateAnnouncementModal() {
    let courseOptions = `<option value="">${t('moodleAnnouncement.siteWide')}</option>`;
    try {
      const courses = await this.getRoleScopedCourses({ manageOnly: true });
      courses.forEach(c => {
        courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`;
      });
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createAnnouncementModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleAnnouncement.title')}</h3>
          <button onclick="MoodleUI.closeModal('createAnnouncementModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleAnnouncement.titleLabel')} *</label>
            <input type="text" id="newAnnouncementTitle" placeholder="${t('moodleAnnouncement.titlePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('moodleAnnouncement.contentLabel')} *</label>
            <textarea id="newAnnouncementContent" rows="5" placeholder="${t('moodleAnnouncement.contentPlaceholder')}"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleAnnouncement.priority')}</label>
              <select id="newAnnouncementPriority">
                <option value="low">${t('moodleAnnouncement.priorityLow')}</option>
                <option value="normal" selected>${t('moodleAnnouncement.priorityNormal')}</option>
                <option value="high">${t('moodleAnnouncement.priorityHigh')}</option>
                <option value="urgent">${t('moodleAnnouncement.priorityUrgent')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('moodleAnnouncement.courseOptional')}</label>
              <select id="newAnnouncementCourse">${courseOptions}</select>
            </div>
          </div>
          <div class="form-group">
            <label>${t('moodleAnnouncement.expiryDate')}</label>
            <input type="date" id="newAnnouncementExpiry">
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createAnnouncementModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveNewAnnouncement()" class="btn-primary">${t('moodleAnnouncement.publishBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createAnnouncementModal'); };
  },

  async saveNewAnnouncement() {
    const title = document.getElementById('newAnnouncementTitle')?.value?.trim();
    const content = document.getElementById('newAnnouncementContent')?.value?.trim();
    if (!title || !content) { showToast(t('moodleAnnouncement.fieldsRequired')); return; }
    try {
      const result = await API.admin.createAnnouncement({
        title,
        content,
        priority: document.getElementById('newAnnouncementPriority')?.value || 'normal',
        courseId: document.getElementById('newAnnouncementCourse')?.value || undefined,
        expiresAt: document.getElementById('newAnnouncementExpiry')?.value || undefined
      });
      if (result.success) {
        showToast(t('moodleAnnouncement.success'));
        this.closeModal('createAnnouncementModal');
      } else {
        showToast(result.error || t('moodleAnnouncement.error'));
      }
    } catch (error) {
      console.error('Create announcement error:', error);
      showToast(t('moodleAnnouncement.error'));
    }
  },

  /**
   * 更新麵包屑導航
   */
  updateBreadcrumb(viewName) {
    // 靜默處理 — 麵包屑由各視圖自行管理
  },

  /**
   * 初始化學生儀表板
   */
  initStudentDashboard() {
    // 靜默處理 — 儀表板由 app.js 管理
  },

  /**
   * 初始化教師儀表板
   */
  initTeacherDashboard() {
    // 靜默處理 — 儀表板由 app.js 管理
  },

  // ======== Course Settings ========
  async openCourseSettings(courseId) {
    try {
      const result = await API.courses.get(courseId);
      if (!result.success) { showToast(t('moodleCourseSettings.loadFailed')); return; }
      const c = result.data;
      const courseVisibility = this.normalizeCourseVisibility(c.visibility ?? c.visible);
      const courseFormat = this.normalizeCourseFormat(c.format);
      this.createModal('courseSettingsModal', t('moodleCourseSettings.title'), `
        <form onsubmit="event.preventDefault(); MoodleUI.saveCourseSettings('${courseId}')">
          <div class="form-group">
            <label>${t('moodleCourseCreate.nameLabel')}</label>
            <input type="text" id="cs_title" value="${c.title || ''}" required>
          </div>
          <div class="form-group">
            <label>${t('moodleCourseCreate.shortNameLabel')}</label>
            <input type="text" id="cs_shortName" value="${c.shortName || ''}">
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="cs_description" rows="3">${c.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>${t('moodleCourseCreate.categoryLabel')}</label>
            <input type="text" id="cs_category" value="${c.category || ''}">
          </div>
          <div class="form-group">
            <label>${t('moodleCourseCreate.formatLabel')}</label>
            <select id="cs_format">
              <option value="topics" ${courseFormat === 'topics' ? 'selected' : ''}>${t('moodleCourseSettings.formatTopics')}</option>
              <option value="weeks" ${courseFormat === 'weeks' ? 'selected' : ''}>${t('moodleCourseSettings.formatWeeks')}</option>
              <option value="social" ${courseFormat === 'social' ? 'selected' : ''}>${t('moodleCourseSettings.formatSocial')}</option>
              <option value="singleactivity" ${courseFormat === 'singleactivity' ? 'selected' : ''}>${t('moodleCourseSettings.formatSingle')}</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleCourseCreate.startDate')}</label>
              <input type="date" id="cs_startDate" value="${c.startDate ? c.startDate.split('T')[0] : ''}">
            </div>
            <div class="form-group">
              <label>${t('moodleCourseCreate.endDate')}</label>
              <input type="date" id="cs_endDate" value="${c.endDate ? c.endDate.split('T')[0] : ''}">
            </div>
          </div>
          <div class="form-group">
            <label>${t('moodleCourseSettings.enrollKey')}</label>
            <input type="text" id="cs_enrollmentKey" value="${c.enrollmentKey || ''}">
          </div>
          <div class="form-group">
            <label>${t('moodleCourseSettings.maxStudents')}</label>
            <input type="number" id="cs_maxEnrollment" value="${c.maxEnrollment || ''}">
          </div>
          <div class="form-group form-checkbox-row">
            <label class="checkbox-label" for="cs_visible">
              <input type="checkbox" id="cs_visible" name="cs_visible" ${courseVisibility === 'show' ? 'checked' : ''}>
              <span>${t('moodleCourseSettings.visibleToStudents')}</span>
            </label>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('courseSettingsModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${t('moodleGradeSettings.save')}</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast(t('moodleCourseSettings.loadError'));
    }
  },

  async saveCourseSettings(courseId) {
    const data = {
      title: document.getElementById('cs_title').value,
      shortName: document.getElementById('cs_shortName').value,
      description: document.getElementById('cs_description').value,
      category: document.getElementById('cs_category').value,
      format: this.normalizeCourseFormat(document.getElementById('cs_format').value),
      startDate: document.getElementById('cs_startDate').value || null,
      endDate: document.getElementById('cs_endDate').value || null,
      enrollmentKey: document.getElementById('cs_enrollmentKey').value,
      maxEnrollment: document.getElementById('cs_maxEnrollment').value ? parseInt(document.getElementById('cs_maxEnrollment').value) : null,
      visibility: document.getElementById('cs_visible').checked ? 'show' : 'hide'
    };
    try {
      const result = await API.courses.update(courseId, data);
      if (result.success) {
        showToast(t('moodleCourseSettings.saved'));
        this.closeModal('courseSettingsModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || t('moodleGradeSettings.saveFailed'));
      }
    } catch (error) {
      showToast(t('moodleCourseSettings.saveError'));
    }
  },

  // ======== Edit Section ========
  async editSection(courseId, sectionId) {
    try {
      const courseResult = await API.courses.get(courseId);
      const sections = courseResult.data?.sections || [];
      const section = sections.find(s => s.sectionId === sectionId);
      if (!section) { showToast(t('moodleSectionEdit.notFound')); return; }

      this.createModal('editSectionModal', t('moodleSectionEdit.title'), `
        <form onsubmit="event.preventDefault(); MoodleUI.saveSection('${courseId}', '${sectionId}')">
          <div class="form-group">
            <label>${t('moodleSectionEdit.nameLabel')}</label>
            <input type="text" id="es_name" value="${section.title || section.name || ''}" required>
          </div>
          <div class="form-group">
            <label>${t('moodleSectionEdit.summaryLabel')}</label>
            <textarea id="es_summary" rows="3">${section.summary || ''}</textarea>
          </div>
          <div class="form-group form-checkbox-row">
            <label class="checkbox-label" for="es_visible">
              <input type="checkbox" id="es_visible" name="es_visible" ${section.visible !== false ? 'checked' : ''}>
              <span>${t('moodleCourseSettings.visibleToStudents')}</span>
            </label>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editSectionModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${t('common.save')}</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast(t('moodleSectionEdit.loadError'));
    }
  },

  async saveSection(courseId, sectionId) {
    const data = {
      title: document.getElementById('es_name').value,
      summary: document.getElementById('es_summary').value,
      visible: document.getElementById('es_visible').checked
    };
    try {
      const result = await API.courseSections.update(courseId, sectionId, data);
      if (result.success) {
        showToast(t('moodleSectionEdit.updated'));
        this.closeModal('editSectionModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      showToast(t('moodleSectionEdit.updateError'));
    }
  },

  // ======== Edit Activity ========
  async editActivity(courseId, sectionId, activityId) {
    try {
      const result = await API.courseActivities.get(courseId, activityId);
      if (!result.success) { showToast(t('moodleActivityEdit.loadFailed')); return; }
      const a = result.data || {};
      const activityType = a.type;
      let detail = {};

      if (a.type === 'assignment') {
        const detailResult = await API.assignments.get(a.assignmentId || activityId);
        if (detailResult.success) detail = detailResult.data || {};
      } else if (a.type === 'quiz') {
        const detailResult = await API.quizzes.get(a.quizId || activityId);
        if (detailResult.success) detail = detailResult.data || {};
      } else if (a.type === 'forum') {
        const detailResult = await API.forums.get(a.forumId || activityId);
        if (detailResult.success) detail = detailResult.data || {};
      }

      const merged = {
        ...a,
        ...detail,
        activityType,
        forumType: detail.type || a.forumType || 'general'
      };
      this.currentEditingActivity = merged;

      this.createModal('editActivityModal', t('moodleActivityEdit.title'), `
        <form onsubmit="event.preventDefault(); MoodleUI.saveActivity('${courseId}', '${activityId}')">
          <div class="form-group">
            <label>${t('moodleActivityEdit.nameLabel')}</label>
            <input type="text" id="ea_name" value="${merged.title || merged.name || ''}" required>
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="ea_description" rows="3">${merged.description || ''}</textarea>
          </div>
          ${merged.activityType === 'assignment' ? `
            <div class="form-group">
              <label>${t('moodleAddActivity.dueDateLabel')}</label>
              <input type="datetime-local" id="ea_dueDate" value="${merged.dueDate ? merged.dueDate.slice(0, 16) : ''}">
            </div>
          ` : ''}
          ${merged.activityType === 'quiz' ? `
            <div class="form-row">
              <div class="form-group">
                <label>${t('moodleAddActivity.startTimeLabel')}</label>
                <input type="datetime-local" id="ea_openDate" value="${merged.openDate ? merged.openDate.slice(0, 16) : ''}">
              </div>
              <div class="form-group">
                <label>${t('moodleAddActivity.endTimeLabel')}</label>
                <input type="datetime-local" id="ea_closeDate" value="${merged.closeDate ? merged.closeDate.slice(0, 16) : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>${t('moodleAddActivity.timeLimitLabel')}</label>
                <input type="number" id="ea_timeLimit" value="${this.escapeText(merged.timeLimit ?? 60)}" min="0">
              </div>
              <div class="form-group">
                <label>${t('moodleAddActivity.attemptsLabel')}</label>
                <input type="number" id="ea_maxAttempts" value="${this.escapeText(merged.maxAttempts ?? 1)}" min="0">
              </div>
            </div>
          ` : ''}
          ${merged.activityType === 'forum' ? `
            <div class="form-group">
              <label>${t('moodleAddActivity.forumTypeLabel')}</label>
              <select id="ea_forumType">
                <option value="general" ${merged.forumType === 'general' ? 'selected' : ''}>${t('moodleAddActivity.forumTypeGeneral')}</option>
                <option value="qanda" ${merged.forumType === 'qanda' ? 'selected' : ''}>${t('moodleAddActivity.forumTypeQA')}</option>
                <option value="news" ${merged.forumType === 'news' ? 'selected' : ''}>${t('moodleAddActivity.forumTypeNews')}</option>
              </select>
            </div>
          ` : ''}
          ${merged.activityType === 'url' ? `
            <div class="form-group">
              <label>${t('moodleActivityEdit.urlLabel')}</label>
              <input type="url" id="ea_url" value="${merged.url || ''}">
            </div>
          ` : ''}
          ${merged.activityType === 'interactive_video' ? `
            <div class="form-group">
              <label>${I18n.getLocale() === 'en' ? 'YouTube URL' : 'YouTube 連結'}</label>
              <input type="url" id="ea_interactiveVideoUrl" value="${this.escapeText(merged.interactiveVideo?.videoUrl || merged.url || '')}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>${I18n.getLocale() === 'en' ? 'Teacher name' : '老師名稱'}</label>
                <input type="text" id="ea_interactiveVideoSpeakerName" value="${this.escapeText(merged.interactiveVideo?.speakerName || '')}">
              </div>
              <div class="form-group">
                <label>${I18n.getLocale() === 'en' ? 'Teacher avatar URL' : '老師頭像 URL'}</label>
                <input type="url" id="ea_interactiveVideoSpeakerAvatar" value="${this.escapeText(merged.interactiveVideo?.speakerAvatar || '')}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>${I18n.getLocale() === 'en' ? 'Grading mode' : '評分模式'}</label>
                <select id="ea_interactiveVideoGradingMode">
                  <option value="graded" ${(merged.interactiveVideo?.gradingMode || 'graded') === 'graded' ? 'selected' : ''}>${I18n.getLocale() === 'en' ? 'Graded' : '計分'}</option>
                  <option value="practice" ${(merged.interactiveVideo?.gradingMode || 'graded') === 'practice' ? 'selected' : ''}>${I18n.getLocale() === 'en' ? 'Practice only' : '僅練習'}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${I18n.getLocale() === 'en' ? 'Passing score' : '通過分數'}</label>
                <input type="number" id="ea_interactiveVideoPassingScore" min="0" max="100" value="${this.escapeText(merged.interactiveVideo?.passingScore ?? 70)}">
              </div>
              <div class="form-group">
                <label>${I18n.getLocale() === 'en' ? 'Min watch %' : '最少觀看比例 %'}</label>
                <input type="number" id="ea_interactiveVideoWatchPercent" min="0" max="100" value="${this.escapeText(merged.interactiveVideo?.completionRule?.minWatchPercent ?? 85)}">
              </div>
            </div>
            <div class="form-group form-checkbox-row">
              <label class="checkbox-label" for="ea_interactiveVideoAllowSeeking">
                <input type="checkbox" id="ea_interactiveVideoAllowSeeking" name="ea_interactiveVideoAllowSeeking" ${merged.interactiveVideo?.allowSeeking !== false ? 'checked' : ''}>
                <span>${this.escapeText(this.getInteractiveVideoEditorCopy().allowSeeking)}</span>
              </label>
              <p class="form-hint">${this.escapeText(this.getInteractiveVideoEditorCopy().allowSeekingHint)}</p>
            </div>
            ${this.buildInteractiveVideoPromptEditor('ea_', merged.interactiveVideo?.prompts || [], {
              speakerName: merged.interactiveVideo?.speakerName || '',
              speakerAvatar: merged.interactiveVideo?.speakerAvatar || ''
            })}
          ` : ''}
          ${merged.activityType === 'page' ? `
            <div class="form-group">
              <label>${t('moodleActivityEdit.pageContent')}</label>
              <textarea id="ea_content" rows="6">${merged.content || ''}</textarea>
            </div>
          ` : ''}
          <div class="form-group form-checkbox-row">
            <label class="checkbox-label" for="ea_visible">
              <input type="checkbox" id="ea_visible" name="ea_visible" ${merged.visible !== false ? 'checked' : ''}>
              <span>${t('moodleCourseSettings.visibleToStudents')}</span>
            </label>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editActivityModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${t('common.save')}</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast(t('moodleActivityEdit.loadError'));
    }
  },

  async saveActivity(courseId, activityId) {
    const activity = this.currentEditingActivity || {};
    const data = {
      title: document.getElementById('ea_name').value,
      description: document.getElementById('ea_description').value,
      visible: document.getElementById('ea_visible').checked
    };
    const dueDate = document.getElementById('ea_dueDate');
    if (dueDate) data.dueDate = dueDate.value ? new Date(dueDate.value).toISOString() : null;
    const openDate = document.getElementById('ea_openDate');
    if (openDate) data.openDate = openDate.value ? new Date(openDate.value).toISOString() : null;
    const closeDate = document.getElementById('ea_closeDate');
    if (closeDate) data.closeDate = closeDate.value ? new Date(closeDate.value).toISOString() : null;
    const timeLimit = document.getElementById('ea_timeLimit');
    if (timeLimit) data.timeLimit = parseInt(timeLimit.value) || 0;
    const maxAttempts = document.getElementById('ea_maxAttempts');
    if (maxAttempts) data.maxAttempts = parseInt(maxAttempts.value) || 0;
    const forumType = document.getElementById('ea_forumType');
    if (forumType) data.type = forumType.value;
    const url = document.getElementById('ea_url');
    if (url) data.url = url.value;
    const content = document.getElementById('ea_content');
    if (content) data.content = content.value;
    if ((activity.activityType || activity.type) === 'interactive_video') {
      try {
        Object.assign(data, this.buildInteractiveVideoConfigFromForm('ea_'));
      } catch (error) {
        showToast(error.message === 'INVALID_INTERACTIVE_VIDEO_PROMPTS'
          ? (I18n.getLocale() === 'en' ? 'Please complete each interactive video prompt before saving.' : '請先完成每一張互動影片提問卡的設定。')
          : (I18n.getLocale() === 'en' ? 'Please enter a valid YouTube URL.' : '請輸入有效的 YouTube 連結。'));
        return;
      }
    }

    try {
      let result;
      if ((activity.activityType || activity.type) === 'assignment') {
        result = await API.assignments.update(activity.assignmentId || activityId, data);
      } else if ((activity.activityType || activity.type) === 'quiz') {
        result = await API.quizzes.update(activity.quizId || activityId, data);
      } else if ((activity.activityType || activity.type) === 'forum') {
        result = await API.forums.update(activity.forumId || activityId, data);
      } else {
        result = await API.courseActivities.update(courseId, activityId, data);
      }
      if (result.success) {
        showToast(t('moodleActivityEdit.updated'));
        this.closeModal('editActivityModal');
        this.currentEditingActivity = null;
        this.openCourse(courseId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      showToast(t('moodleActivityEdit.updateError'));
    }
  },

  // ======== Delete Activity ========
  async deleteActivity(courseId, sectionId, activityId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleActivityEdit.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const detailResult = await API.courseActivities.get(courseId, activityId);
      let result;
      if (detailResult.success && detailResult.data?.type === 'assignment') {
        result = await API.assignments.delete(detailResult.data.assignmentId || activityId);
      } else if (detailResult.success && detailResult.data?.type === 'quiz') {
        result = await API.quizzes.delete(detailResult.data.quizId || activityId);
      } else if (detailResult.success && detailResult.data?.type === 'forum') {
        result = await API.forums.delete(detailResult.data.forumId || activityId);
      } else {
        result = await API.courseActivities.delete(courseId, activityId);
      }
      if (result.success) {
        showToast(t('moodleActivityEdit.deleted'));
        this.openCourse(courseId);
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      showToast(t('moodleActivityEdit.deleteError'));
    }
  },

  // ======== Grade Settings Alias ========
  openGradeSettings(courseId) {
    this.openGradeSettingsModal(courseId);
  },

  // ======== Multi-select Quiz Answer Handler ========
  async selectMultipleAnswer(value) {
    if (!this.currentQuizAttempt) return;
    const q = this.currentQuizAttempt.questions[this.currentQuestionIndex];
    if (!q) return;
    if (!Array.isArray(q.answer)) q.answer = [];
    const valueKey = this.normalizeQuizAnswerKey(value);
    const pos = q.answer.findIndex(answer => this.normalizeQuizAnswerKey(answer) === valueKey);
    if (pos >= 0) {
      q.answer.splice(pos, 1);
    } else {
      q.answer.push(value);
    }
    q.answered = q.answer.length > 0;
    // Update visual state
    const labels = document.querySelectorAll('.question-option');
    labels.forEach(label => {
      const checkbox = label.querySelector('input[type="checkbox"]');
      if (checkbox) {
        const val = checkbox.value;
        const selected = q.answer.some(answer => this.normalizeQuizAnswerKey(answer) === this.normalizeQuizAnswerKey(val));
        label.classList.toggle('selected', selected);
      }
    });
    this.updateQuizCurrentNavAnsweredState(q.answered);
    this.queueQuizAnswerSave(q, q.answer);
  },

  // ======== Sort Gradebook ========
  sortGradebook(column) {
    const table = document.querySelector('.gradebook-table.editable tbody');
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr'));

    // Toggle sort direction
    this._gradebookSortDir = this._gradebookSortDir === 'asc' ? 'desc' : 'asc';
    const dir = this._gradebookSortDir === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      if (column === 'name') {
        const nameA = a.querySelector('.student-col')?.textContent?.trim() || '';
        const nameB = b.querySelector('.student-col')?.textContent?.trim() || '';
        return dir * nameA.localeCompare(nameB, 'zh-TW');
      } else if (column === 'total') {
        const totalA = parseFloat(a.querySelector('.total-col')?.textContent) || 0;
        const totalB = parseFloat(b.querySelector('.total-col')?.textContent) || 0;
        return dir * (totalA - totalB);
      }
      return 0;
    });

    rows.forEach(row => table.appendChild(row));
    showToast(`${t('moodleGradebook.sortedBy')} ${column === 'name' ? t('moodleGradebook.sortName') : t('moodleGradebook.sortTotal')} ${this._gradebookSortDir === 'asc' ? t('moodleGradebook.sortAsc') : t('moodleGradebook.sortDesc')}`);
  },

  // ======== Edit Grade Category ========
  async editGradeCategory(courseId, categoryId) {
    try {
      const result = await API.gradebookEnhanced.getCategories(courseId);
      const categories = result.success ? result.data : [];
      const cat = categories.find(c => c.categoryId === categoryId);
      if (!cat) { showToast(t('moodleGradeCategory.notFound')); return; }

      this.createModal('editGradeCatModal', t('moodleGradeCategory.editTitle'), `
        <form onsubmit="event.preventDefault(); MoodleUI.saveGradeCategory('${courseId}', '${categoryId}')">
          <div class="form-group">
            <label>${t('moodleGradeCategory.nameLabel')}</label>
            <input type="text" id="egc_name" value="${cat.name || ''}" required>
          </div>
          <div class="form-group">
            <label>${t('moodleGradeCategory.weightLabel')}</label>
            <input type="number" id="egc_weight" value="${cat.weight || 0}" min="0" max="100">
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editGradeCatModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${t('common.save')}</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast(t('moodleGradeCategory.loadFailed'));
    }
  },

  async saveGradeCategory(courseId, categoryId) {
    const data = {
      name: document.getElementById('egc_name').value,
      weight: parseFloat(document.getElementById('egc_weight').value) || 0
    };
    try {
      const result = await API.gradebookEnhanced.updateCategory(courseId, categoryId, data);
      if (result.success) {
        showToast(t('moodleCategories.updated'));
        this.closeModal('editGradeCatModal');
        this.openGradeCategoryModal(courseId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      showToast(t('moodleCategories.updateError'));
    }
  },

  // ======== Edit Question ========
  async editQuestion(questionId) {
    try {
      const result = await API.questionBank.get(questionId, { courseId: this.currentQuestionBankCourseId });
      if (!result.success) { showToast(t('moodleQuestionBank.loadQuestionFailed')); return; }
      const q = this.normalizeQuizBuilderQuestion(this.createQuizQuestionFromBankQuestion(result.data || {}));

      const modal = this.createModal('editQuestionModal', t('moodleQuestionBank.editTitle'), `
        <form onsubmit="event.preventDefault(); MoodleUI.saveEditedQuestion('${questionId}')">
          <div class="form-group">
            <label>${t('moodleQuestionBank.typeLabel')}</label>
            <input type="hidden" id="eq_type" value="${this.escapeText(q.type)}">
            <input type="text" value="${this.escapeText(this.getLocalizedQuestionType(q.type))}" disabled>
          </div>
          <div class="form-group">
            <label>${t('moodleNewQuestion.contentLabel')}</label>
            <textarea id="eq_text" rows="3" required>${this.escapeText(q.text || '')}</textarea>
          </div>
          <div id="eq_answer_fields">${this.renderQuizQuestionEditorOptions(q.type, q)}</div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleAddActivity.scoreLabel')}</label>
              <input type="number" id="eq_points" value="${q.points || 1}" min="1">
            </div>
            <div class="form-group">
              <label>${t('moodleNewQuestion.diffLabel')}</label>
              <select id="eq_difficulty">
                <option value="easy" ${q.difficulty === 'easy' ? 'selected' : ''}>${t('moodleQuestionBank.diffEasy')}</option>
                <option value="medium" ${q.difficulty === 'medium' ? 'selected' : ''}>${t('moodleQuestionBank.diffMedium')}</option>
                <option value="hard" ${q.difficulty === 'hard' ? 'selected' : ''}>${t('moodleQuestionBank.diffHard')}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>${t('moodleNewQuestion.tagsLabel')}</label>
            <input type="text" id="eq_tags" value="${this.escapeText((q.tags || []).join(', '))}">
          </div>
          <div class="form-group">
            <label>${t('moodleNewQuestion.explanationLabel')}</label>
            <textarea id="eq_explanation" rows="3" placeholder="${t('moodleNewQuestion.explanationPlaceholder')}">${this.escapeText(q.feedback || '')}</textarea>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editQuestionModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${t('common.save')}</button>
          </div>
        </form>
      `, {
        maxWidth: '980px',
        className: 'modal-workspace modal-question-builder-modal',
        kicker: I18n.getLocale() === 'en' ? 'Question bank' : '題庫工作區',
        description: I18n.getLocale() === 'en'
          ? 'Edit the full prompt, answer key, points, and feedback in one workspace.'
          : '在同一個清楚的工作區編輯題目、答案、配分與解析。'
      });
      this.syncQuizQuestionOptionIndices();
      window.requestAnimationFrame(() => modal.querySelector('#eq_text')?.focus());
    } catch (error) {
      showToast(t('moodleQuestionBank.loadQuestionError'));
    }
  },

  async saveEditedQuestion(questionId) {
    const type = document.getElementById('eq_type')?.value || 'multiple_choice';
    let questionText = document.getElementById('eq_text')?.value?.trim() || '';
    const clozeTextDraft = type === 'cloze'
      ? document.getElementById('quizQuestionClozeText')?.value?.trim()
      : '';
    if (!questionText && clozeTextDraft) {
      questionText = clozeTextDraft;
    }

    if (!questionText) {
      showToast(t('moodleNewQuestion.contentRequired'));
      return;
    }

    const data = {
      courseId: this.currentQuestionBankCourseId,
      type,
      questionText,
      points: parseInt(document.getElementById('eq_points')?.value, 10) || 1,
      difficulty: document.getElementById('eq_difficulty')?.value || 'medium',
      tags: document.getElementById('eq_tags')?.value.split(',').map(t => t.trim()).filter(Boolean) || [],
      explanation: document.getElementById('eq_explanation')?.value || ''
    };

    if (type === 'multiple_choice') {
      const rows = Array.from(document.querySelectorAll('#quizQuestionOptionsList .builder-option-row'));
      const options = [];
      let correctAnswer = 0;
      rows.forEach(row => {
        const optionText = row.querySelector('.option-input')?.value?.trim();
        if (!optionText) return;
        const nextIndex = options.length;
        if (row.querySelector('input[name="quizQuestionCorrect"]')?.checked) {
          correctAnswer = nextIndex;
        }
        options.push(optionText);
      });
      if (options.length < 2) {
        showToast(t('moodleNewQuestion.minOptions'));
        return;
      }
      data.options = options;
      data.correctAnswer = correctAnswer;
      data.correctAnswers = [];
    } else if (type === 'multiple_select') {
      const rows = Array.from(document.querySelectorAll('#quizQuestionOptionsList .builder-option-row'));
      const options = [];
      const correctAnswers = [];
      rows.forEach(row => {
        const optionText = row.querySelector('.option-input')?.value?.trim();
        if (!optionText) return;
        const nextIndex = options.length;
        if (row.querySelector('input[name="quizQuestionCorrectMulti"]')?.checked) {
          correctAnswers.push(nextIndex);
        }
        options.push(optionText);
      });
      if (options.length < 2) {
        showToast(t('moodleNewQuestion.minOptions'));
        return;
      }
      if (correctAnswers.length === 0) {
        showToast(I18n.getLocale() === 'en' ? 'Select at least one correct option.' : '請至少勾選一個正確選項。');
        return;
      }
      data.options = options;
      data.correctAnswer = null;
      data.correctAnswers = correctAnswers;
    } else if (type === 'true_false') {
      data.options = [];
      data.correctAnswer = document.querySelector('input[name="quizQuestionTrueFalse"]:checked')?.value !== 'false';
      data.correctAnswers = [];
    } else if (type === 'short_answer' || type === 'fill_blank') {
      data.options = [];
      data.correctAnswer = null;
      data.correctAnswers = String(document.getElementById('quizQuestionAcceptedAnswers')?.value || '')
        .split('\n')
        .map(answer => answer.trim())
        .filter(Boolean);
      data.caseSensitive = document.getElementById('quizQuestionCaseSensitive')?.checked === true;
    } else if (type === 'matching') {
      data.options = [];
      data.correctAnswer = null;
      data.correctAnswers = [];
      data.matchingPairs = Array.from(document.querySelectorAll('#quizMatchingPairsList .builder-option-row'))
        .map(row => ({
          prompt: row.querySelector('.matching-prompt-input')?.value?.trim() || '',
          answer: row.querySelector('.matching-answer-input')?.value?.trim() || ''
        }))
        .filter(pair => pair.prompt && pair.answer);
      if (data.matchingPairs.length < 2) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least two complete matching pairs.' : '請至少新增兩組完整配對。');
        return;
      }
    } else if (type === 'ordering') {
      data.options = [];
      data.correctAnswer = null;
      data.correctAnswers = [];
      data.orderingItems = Array.from(document.querySelectorAll('#quizOrderingItemsList .ordering-item-input'))
        .map(input => input.value.trim())
        .filter(Boolean);
      if (data.orderingItems.length < 2) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least two ordered items.' : '請至少新增兩個排序項目。');
        return;
      }
    } else if (type === 'numerical') {
      const numericAnswer = Number(document.getElementById('quizQuestionNumericAnswer')?.value);
      const numericTolerance = Number(document.getElementById('quizQuestionNumericTolerance')?.value || 0);
      if (!Number.isFinite(numericAnswer)) {
        showToast(I18n.getLocale() === 'en' ? 'Enter a valid numeric answer.' : '請輸入有效的正確數值。');
        return;
      }
      data.options = [];
      data.correctAnswer = numericAnswer;
      data.correctAnswers = [];
      data.numericAnswer = numericAnswer;
      data.numericTolerance = Number.isFinite(numericTolerance) && numericTolerance > 0 ? numericTolerance : 0;
    } else if (type === 'cloze') {
      data.questionText = clozeTextDraft || questionText;
      data.clozeText = clozeTextDraft || questionText;
      data.options = [];
      data.correctAnswer = null;
      data.correctAnswers = [];
      data.clozeAnswers = Array.from(document.querySelectorAll('#quizClozeAnswersList .builder-option-row'))
        .map((row, index) => {
          const id = row.querySelector('.cloze-id-input')?.value?.trim() || String(index + 1);
          const answers = String(row.querySelector('.cloze-answer-input')?.value || '')
            .split('|')
            .map(answer => answer.trim())
            .filter(Boolean);
          return {
            id,
            answers,
            caseSensitive: row.querySelector('.cloze-case-input')?.checked === true
          };
        })
        .filter(blank => blank.id && blank.answers.length > 0);
      if (data.clozeAnswers.length === 0) {
        showToast(I18n.getLocale() === 'en' ? 'Add at least one blank answer.' : '請至少新增一個空格答案。');
        return;
      }
    } else {
      data.options = [];
      data.correctAnswer = null;
      data.correctAnswers = [];
      data.referenceAnswer = document.getElementById('quizQuestionReferenceAnswer')?.value || '';
      data.minWords = parseInt(document.getElementById('quizQuestionMinWords')?.value, 10) || 0;
    }

    try {
      const result = await API.questionBank.update(questionId, data);
      if (result.success) {
        showToast(t('moodleQuestionBank.questionUpdated'));
        this.closeModal('editQuestionModal');
        this.openQuestionBank(this.currentQuestionBankCourseId);
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      showToast(t('moodleQuestionBank.updateFailed'));
    }
  },

  // ======== Preview Question ========
  async previewQuestion(questionId) {
    try {
      const result = await API.questionBank.get(questionId, { courseId: this.currentQuestionBankCourseId });
      if (!result.success) { showToast(t('moodleQuestionBank.loadQuestionFailed')); return; }
      const q = this.normalizeQuizBuilderQuestion(this.createQuizQuestionFromBankQuestion(result.data || {}));
      const correctAnswer = this.getQuizResultCorrectAnswer(q);

      this.createModal('previewQuestionModal', t('moodleQuestionBank.previewTitle'), `
        <div class="question-preview">
          <div class="preview-meta">
            <span class="badge">${this.escapeText(this.getLocalizedQuestionType(q.type))}</span>
            <span class="badge">${q.points || 1} ${t('moodleGradebook.pointsSuffix')}</span>
            <span class="badge difficulty-${q.difficulty || 'medium'}">${{easy:t('moodleQuestionBank.diffEasy'),medium:t('moodleQuestionBank.diffMedium'),hard:t('moodleQuestionBank.diffHard')}[q.difficulty] || t('moodleQuestionBank.diffMedium')}</span>
          </div>
          <div class="preview-text"><strong>${t('moodleQuestionBank.questionLabel')}：</strong>${this.escapeText(q.text || '')}</div>
          ${this.hasQuizResultCorrectAnswer(q) ? `
            <div class="quiz-results-answer quiz-results-correct-answer">
              <strong>${t('moodleQuestionBank.correctAnswer')}：</strong> ${this.formatQuizResultAnswer(q, correctAnswer)}
            </div>
          ` : ''}
          ${q.feedback ? `<div class="preview-text"><strong>${t('moodleNewQuestion.explanationLabel')}：</strong>${this.escapeText(q.feedback)}</div>` : ''}
          ${q.tags?.length ? '<div class="preview-tags">' + q.tags.map(tag => '<span class="tag">' + this.escapeText(tag) + '</span>').join('') + '</div>' : ''}
        </div>
      `);
    } catch (error) {
      showToast(t('moodleQuestionBank.previewFailed'));
    }
  },

  // ======== Import Questions ========
  async openImportQuestionsModal() {
    if (!this.currentQuestionBankCourseId) {
      showToast(I18n.getLocale() === 'en' ? 'Please select a course first.' : '請先選擇課程。');
      await this.openQuestionBank();
      return;
    }

    const categories = await this.getQuestionBankCategories();
    this.createModal('importQuestionsModal', t('moodleQuestionBank.importTitle'), `
      <form onsubmit="event.preventDefault(); MoodleUI.importQuestions()">
        <div class="form-group">
          <label>${t('moodleQuestionBank.importFormat')}</label>
          <select id="iq_format">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </div>
        <div class="form-group">
          <label>${t('moodleQuestionBank.questionData')}</label>
          <textarea id="iq_data" rows="10" placeholder="JSON ${t('moodleQuestionBank.jsonExample')}：[{&quot;questionText&quot;:&quot;...&quot;, &quot;type&quot;:&quot;multiple_choice&quot;, &quot;options&quot;:[&quot;A&quot;,&quot;B&quot;,&quot;C&quot;,&quot;D&quot;], &quot;correctAnswer&quot;:0}]"></textarea>
        </div>
        <div class="form-group">
          <label>${t('moodleQuestionBank.targetCategory')}</label>
          <select id="iq_category">
            <option value="">${t('moodleQuestionBank.allQuestions')}</option>
            ${categories.map(category => `
              <option value="${this.escapeText(category.categoryId)}" ${category.categoryId === this.currentQuestionBankFilters.categoryId ? 'selected' : ''}>
                ${this.escapeText(category.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-actions">
          <button type="button" onclick="MoodleUI.closeModal('importQuestionsModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button type="submit" class="btn-primary">${t('moodleQuestionBank.import')}</button>
        </div>
      </form>
    `);
  },

  async importQuestions() {
    const format = document.getElementById('iq_format').value;
    const rawData = document.getElementById('iq_data').value.trim();
    const categoryId = document.getElementById('iq_category').value.trim();
    if (!rawData) { showToast(t('moodleQuestionBank.importDataRequired')); return; }

    try {
      let questions;
      if (format === 'json') {
        questions = JSON.parse(rawData);
      } else {
        questions = this.parseQuestionImportCsv(rawData);
      }
      const result = await API.questionBank.import({
        format,
        questions,
        courseId: this.currentQuestionBankCourseId,
        categoryId: categoryId || undefined
      });
      if (result.success) {
        showToast(`${t('moodleQuestionBank.importSuccess')} ${result.data?.imported || ''} ${t('moodleQuestionBank.questionsUnit')}`);
        this.closeModal('importQuestionsModal');
        this.openQuestionBank(this.currentQuestionBankCourseId);
      } else {
        showToast(result.message || t('moodleQuestionBank.importFailed'));
      }
    } catch (error) {
      showToast(t('moodleQuestionBank.importFailed') + '：' + (error.message || t('moodleQuestionBank.dataFormatError')));
    }
  },

  parseQuestionImportCsv(rawCsv) {
    const lines = String(rawCsv || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error(t('moodleQuestionBank.dataFormatError'));
    }

    const parseCsvRow = (line) => {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"' && inQuotes && next === '"') {
          current += '"';
          i++;
          continue;
        }

        if (char === '"') {
          inQuotes = !inQuotes;
          continue;
        }

        if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
          continue;
        }

        current += char;
      }

      values.push(current.trim());
      return values;
    };

    const headers = parseCsvRow(lines[0]).map(header => header.toLowerCase());
    return lines.slice(1).map(line => {
      const columns = parseCsvRow(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = columns[index] ?? '';
      });

      const options = String(row.options || '')
        .split('|')
        .map(option => option.trim())
        .filter(Boolean);
      const correctAnswerRaw = row.correctanswer ?? row.correct_answer ?? '';
      const correctAnswersRaw = row.correctanswers ?? row.correct_answers ?? '';
      const normalizedType = String(row.type || 'multiple_choice').trim();
      const booleanAnswer = String(correctAnswerRaw).trim().toLowerCase();

      return {
        questionText: row.questiontext || row.text || row.question || row.prompt || '',
        type: normalizedType,
        options,
        correctAnswer: normalizedType === 'true_false'
          ? (correctAnswerRaw === '' ? null : ['true', 't', 'yes', 'y', '1', '是', '對', '正確'].includes(booleanAnswer))
          : (correctAnswerRaw === '' ? null : correctAnswerRaw),
        correctAnswers: String(correctAnswersRaw || '')
          .split(/[|,;]/)
          .map(answer => answer.trim())
          .filter(Boolean),
        difficulty: row.difficulty || 'medium',
        analysisSection: row.analysissection || row.analysis_section || row.section || row.skill || '',
        tags: String(row.tags || '')
          .split(/[|,]/)
          .map(tag => tag.trim())
          .filter(Boolean),
        explanation: row.explanation || row.feedback || '',
        feedback: row.feedback || row.explanation || '',
        points: row.points ? Number(row.points) : 1
      };
    }).filter(question => question.questionText);
  },

  // ======== Manage Question Categories ========
  async openCategoryManageModal() {
    try {
      if (!this.currentQuestionBankCourseId) {
        showToast(I18n.getLocale() === 'en' ? 'Please select a course first.' : '請先選擇課程。');
        await this.openQuestionBank();
        return;
      }

      const result = await API.questionBank.getCategories({ courseId: this.currentQuestionBankCourseId });
      const categories = result.success ? (result.data || []) : [];

      this.createModal('categoryManageModal', t('moodleQuestionBank.manageCategoriesTitle'), `
        <div class="question-category-manager">
          <div class="category-list">
          ${categories.map(cat => `
            <div class="category-item">
              <div class="category-info">
                <span class="category-name">${this.escapeText(cat.name)}</span>
                <span class="category-weight">${this.escapeText(cat.questionCount || 0)} ${t('moodleQuestionBank.questionsUnit')}</span>
              </div>
              <div class="category-actions">
                <button onclick="MoodleUI.deleteQuestionCategory(${this.toInlineActionValue(cat.categoryId)})" class="btn-sm btn-danger">${t('moodleGradeCategory.delete')}</button>
              </div>
            </div>
          `).join('')}
          ${categories.length === 0 ? this.renderActivityEmptyState({
            icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
            title: t('moodleQuestionBank.noCategories')
          }) : ''}
          </div>
          <hr class="modal-section-divider">
          <form class="question-category-form" onsubmit="event.preventDefault(); MoodleUI.createQuestionCategory()">
            <div class="form-group">
              <label>${t('moodleQuestionBank.addCategory')}</label>
              <div class="inline-form-row">
                <input class="fill" type="text" id="newQCatName" placeholder="${t('moodleQuestionBank.categoryPlaceholder')}" required>
                <button type="submit" class="btn-primary">${t('common.add')}</button>
              </div>
            </div>
          </form>
        </div>
      `);
    } catch (error) {
      showToast(t('moodleGradeCategory.loadFailed'));
    }
  },

  async createQuestionCategory() {
    const name = document.getElementById('newQCatName').value.trim();
    if (!name) return;
    try {
      const result = await API.questionBank.createCategory({
        name,
        courseId: this.currentQuestionBankCourseId
      });
      if (result.success) {
        showToast(t('moodleGradeCategory.created'));
        this.openCategoryManageModal();
        this.openQuestionBank(this.currentQuestionBankCourseId);
      } else {
        showToast(result.message || t('common.createFailed'));
      }
    } catch (error) {
      showToast(t('moodleCategories.createError'));
    }
  },

  async deleteQuestionCategory(categoryId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleGradeCategory.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.questionBank.deleteCategory(categoryId);
      if (result.success) {
        showToast(t('moodleGradeCategory.deleted'));
        this.openCategoryManageModal();
        if (this.currentQuestionBankFilters.categoryId === categoryId) {
          delete this.currentQuestionBankFilters.categoryId;
        }
        this.openQuestionBank(this.currentQuestionBankCourseId);
      } else {
        showToast(result.message || t('common.deleteFailed'));
      }
    } catch (error) {
      showToast(t('moodleCategories.deleteError'));
    }
  },

  // ======== Edit Role ========
  async editRole(roleId) {
    try {
      const [roleResult, capResult] = await Promise.all([
        API.roles.get(roleId),
        API.roles.getCapabilities()
      ]);
      if (!roleResult.success) { showToast(t('moodleRoles.loadFailed')); return; }
      const role = roleResult.data;
      const allCapabilities = (capResult.success && Array.isArray(capResult.data)) ? capResult.data : [];

      this.createModal('editRoleModal', t('moodleRoles.editRoleTitle'), `
        <form onsubmit="event.preventDefault(); MoodleUI.saveRole(${this.toInlineActionValue(roleId)})">
          <div class="form-group">
            <label>${t('moodleRoles.nameLabel')}</label>
            <input type="text" id="er_name" value="${this.escapeText(role.name || '')}" required>
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="er_description" rows="2">${this.escapeText(role.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label>${t('moodleRoles.permissions')}</label>
            <div class="capabilities-grid">
              ${this.renderCapabilitiesEditor(role.capabilities || [], allCapabilities, false)}
            </div>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editRoleModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${t('common.save')}</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast(t('moodleRoles.loadError'));
    }
  },

  async saveRole(roleId) {
    const capabilities = Array.from(document.querySelectorAll('#editRoleModal input[data-capability]:checked')).map(input => input.dataset.capability);
    const data = {
      name: document.getElementById('er_name').value,
      description: document.getElementById('er_description').value,
      capabilities
    };
    try {
      const result = await API.roles.update(roleId, data);
      if (result.success) {
        showToast(t('moodleRoles.updated'));
        this.closeModal('editRoleModal');
        this.openRolesManagement();
      } else {
        showToast(result.message || t('common.updateFailed'));
      }
    } catch (error) {
      showToast(t('moodleRoles.updateError'));
    }
  },

  getCertificateThemePalette(theme = 'classic') {
    const palettes = {
      classic: {
        accent: '#1f4e79',
        accentSoft: 'rgba(31, 78, 121, 0.12)',
        border: 'rgba(31, 78, 121, 0.24)',
        surface: 'linear-gradient(135deg, #f9fcff 0%, #eef4fb 100%)'
      },
      sunrise: {
        accent: '#b76e2b',
        accentSoft: 'rgba(183, 110, 43, 0.12)',
        border: 'rgba(183, 110, 43, 0.26)',
        surface: 'linear-gradient(135deg, #fffaf2 0%, #fdf0dd 100%)'
      },
      forest: {
        accent: '#2f6b4f',
        accentSoft: 'rgba(47, 107, 79, 0.12)',
        border: 'rgba(47, 107, 79, 0.24)',
        surface: 'linear-gradient(135deg, #f6fcf8 0%, #e8f4ec 100%)'
      },
      ocean: {
        accent: '#0f766e',
        accentSoft: 'rgba(15, 118, 110, 0.12)',
        border: 'rgba(15, 118, 110, 0.24)',
        surface: 'linear-gradient(135deg, #f4fffe 0%, #e5f7f5 100%)'
      }
    };
    return palettes[theme] || palettes.classic;
  },

  renderCertificatePreview(template = {}, courseTitle = '') {
    const palette = this.getCertificateThemePalette(template.theme);
    const issuedLabel = I18n.getLocale() === 'en' ? 'Issued for course completion' : '課程完成證書';
    return `
      <div class="certificate-preview-card" style="--certificate-accent:${palette.accent};--certificate-accent-soft:${palette.accentSoft};--certificate-border:${palette.border};--certificate-surface:${palette.surface};">
        <div class="certificate-preview-kicker">${issuedLabel}</div>
        <div class="certificate-preview-title">${this.escapeText(template.certificateTitle || courseTitle || (I18n.getLocale() === 'en' ? 'Certificate of Completion' : '課程結業證書'))}</div>
        <div class="certificate-preview-subtitle">${this.escapeText(template.certificateSubtitle || 'Certificate of Completion')}</div>
        <div class="certificate-preview-statement">${this.escapeText(template.statement || (I18n.getLocale() === 'en' ? 'Awarded to learners who meet the required course conditions.' : '頒發給完成指定課程條件的學員。'))}</div>
        <div class="certificate-preview-signature">
          <div>
            <strong>${this.escapeText(template.issuerName || 'BeyondBridge')}</strong>
            <span>${this.escapeText(template.issuerTitle || (I18n.getLocale() === 'en' ? 'Instructor' : '課程講師'))}</span>
          </div>
          <div class="certificate-preview-course">${this.escapeText(courseTitle || '')}</div>
        </div>
      </div>
    `;
  },

  renderCertificateActivityChecklist(items = [], selectedIds = new Set()) {
    if (!items.length) {
      return `<div class="certificate-rule-empty">${I18n.getLocale() === 'en' ? 'No learning materials in this course yet.' : '這堂課目前還沒有教材內容。'}</div>`;
    }

    return `
      <div class="certificate-rule-list">
        ${items.map((item) => `
          <label class="certificate-rule-item">
            <input type="checkbox" class="certificate-material-checkbox" value="${this.escapeText(item.activityId)}" ${selectedIds.has(item.activityId) ? 'checked' : ''}>
            <span class="certificate-rule-main">
              <strong>${this.escapeText(item.title)}</strong>
              <small>${this.escapeText(item.type)}</small>
            </span>
          </label>
        `).join('')}
      </div>
    `;
  },

  renderCertificateScoreChecklist(items = [], selectedMap = new Map()) {
    if (!items.length) {
      return `<div class="certificate-rule-empty">${I18n.getLocale() === 'en' ? 'No assignments or quizzes in this course yet.' : '這堂課目前還沒有作業或測驗。'}</div>`;
    }

    return `
      <div class="certificate-score-list">
        ${items.map((item) => {
          const selected = selectedMap.get(item.activityId);
          return `
            <div class="certificate-score-item">
              <label class="certificate-rule-item">
                <input type="checkbox" class="certificate-score-checkbox"
                       value="${this.escapeText(item.activityId)}"
                       data-activity-type="${this.escapeText(item.type)}"
                       data-activity-title="${this.escapeText(item.title)}"
                       ${selected ? 'checked' : ''}>
                <span class="certificate-rule-main">
                  <strong>${this.escapeText(item.title)}</strong>
                  <small>${this.escapeText(item.type === 'quiz' ? (I18n.getLocale() === 'en' ? 'Quiz' : '測驗') : (I18n.getLocale() === 'en' ? 'Assignment' : '作業'))}</small>
                </span>
              </label>
              <div class="certificate-score-threshold">
                <span>${I18n.getLocale() === 'en' ? 'Minimum score' : '最低分數'}</span>
                <input type="number"
                       class="certificate-score-input"
                       data-activity-id="${this.escapeText(item.activityId)}"
                       min="0"
                       max="100"
                       value="${this.escapeText(String(selected?.minScore ?? 60))}">
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  buildCertificateRecordIndex(records = []) {
    this.certificateRecordIndex = new Map();
    records.forEach((record) => {
      if (record?.certificateId) {
        this.certificateRecordIndex.set(record.certificateId, record);
      }
    });
  },

  async openCertificates(courseId = null) {
    const container = document.getElementById('certificatesContent');
    if (!container) return;
    showView('certificates');
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    try {
      const user = API.getCurrentUser();
      if (this.isTeachingRole(user)) {
        const courses = await this.getRoleScopedCourses({ manageOnly: true }).catch(() => []);
        const safeCourses = Array.isArray(courses) ? courses : [];
        const initialCourseId = courseId
          || this.currentCertificateCourseId
          || (safeCourses.find((course) => (course.courseId || course.id) === this.currentCourseId)?.courseId || this.currentCourseId)
          || safeCourses[0]?.courseId
          || safeCourses[0]?.id
          || null;

        if (!initialCourseId) {
          container.innerHTML = this.renderActivityEmptyState({
            icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>',
            title: I18n.getLocale() === 'en' ? 'No manageable courses yet' : '目前沒有可設定證書的課程',
            hint: I18n.getLocale() === 'en' ? 'Create or own a course first, then configure automatic certificates here.' : '先建立或管理一門課程，再回到這裡設定自動頒發證書。'
          });
          return;
        }

        this.currentCertificateCourseId = initialCourseId;
        const [settingsResult, recipientsResult] = await Promise.all([
          API.certificates.getSettings(initialCourseId),
          API.certificates.getRecipients(initialCourseId).catch(() => ({ success: false, data: [] }))
        ]);

        if (!settingsResult.success) {
          container.innerHTML = `<div class="error">${this.escapeText(settingsResult.message || t('common.loadFailed'))}</div>`;
          return;
        }

        const payload = settingsResult.data || {};
        const settings = payload.settings || {};
        const recipients = recipientsResult.success && Array.isArray(recipientsResult.data) ? recipientsResult.data : [];
        this.buildCertificateRecordIndex(recipients);
        this.renderCertificateTeacherWorkspace(container, {
          courses: safeCourses,
          payload,
          recipients
        });
        return;
      }

      const result = await API.certificates.getMy();
      const certificates = result.success && Array.isArray(result.data) ? result.data : [];
      this.buildCertificateRecordIndex(certificates);
      this.renderCertificateStudentWorkspace(container, certificates);
    } catch (error) {
      console.error('Open certificates error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  renderCertificateTeacherWorkspace(container, { courses, payload, recipients }) {
    const settings = payload.settings || {};
    const course = payload.course || {};
    const activityGroups = payload.activityGroups || {};
    const completionCriterion = (settings.criteria || []).find((criterion) => criterion.type === 'activity_completion');
    const selectedMaterialIds = new Set(completionCriterion?.activityIds || []);
    const scoreMap = new Map(
      (settings.criteria || [])
        .filter((criterion) => criterion.type === 'activity_score')
        .map((criterion) => [criterion.activityId, criterion])
    );
    const durationCriterion = (settings.criteria || []).find((criterion) => criterion.type === 'duration');

    container.innerHTML = `
      <div class="badges-container certificate-workspace">
        <div class="badges-header">
          <div>
            <h2>${I18n.getLocale() === 'en' ? 'Certificate Issuance' : '證書頒發'}</h2>
            <p class="certificate-subtitle">${I18n.getLocale() === 'en' ? 'Configure the certificate template, choose course conditions, and automatically issue certificates to qualified learners.' : '設定證書樣板、選擇課程條件，並自動把證書頒發給達成條件的學生。'}</p>
          </div>
          <div class="certificate-course-switcher">
            <label>${I18n.getLocale() === 'en' ? 'Course' : '課程'}</label>
            <select id="certificateCourseSelect" onchange="MoodleUI.openCertificates(this.value)">
              ${courses.map((item) => {
                const id = item.courseId || item.id || '';
                return `<option value="${this.escapeText(id)}" ${id === (course.courseId || course.id) ? 'selected' : ''}>${this.escapeText(item.title || item.name || t('moodleCourse.course'))}</option>`;
              }).join('')}
            </select>
          </div>
        </div>

        <div class="certificate-editor-layout">
          <div class="certificate-editor-panel">
            <div class="certificate-settings-card">
              <label class="switch-label">
                <input type="checkbox" id="certificateEnabled" ${settings.enabled ? 'checked' : ''}>
                <span class="switch-slider"></span>
                ${I18n.getLocale() === 'en' ? 'Enable automatic certificate issuance' : '啟用自動頒發證書'}
              </label>
            </div>

            <div class="certificate-settings-card">
              <h3>${I18n.getLocale() === 'en' ? 'Certificate template' : '證書樣板'}</h3>
              <div class="form-row">
                <div class="form-group">
                  <label>${I18n.getLocale() === 'en' ? 'Theme' : '主題'}</label>
                  <select id="certificateTheme" onchange="MoodleUI.refreshCertificatePreview()">
                    ${[
                      { value: 'classic', label: I18n.getLocale() === 'en' ? 'Classic Blue' : '經典藍' },
                      { value: 'sunrise', label: I18n.getLocale() === 'en' ? 'Sunrise Gold' : '晨曦金' },
                      { value: 'forest', label: I18n.getLocale() === 'en' ? 'Forest Green' : '森林綠' },
                      { value: 'ocean', label: I18n.getLocale() === 'en' ? 'Ocean Teal' : '海洋綠' }
                    ].map((option) => `<option value="${option.value}" ${option.value === (settings.template?.theme || 'classic') ? 'selected' : ''}>${this.escapeText(option.label)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>${I18n.getLocale() === 'en' ? 'Certificate title' : '證書名稱'}</label>
                  <input type="text" id="certificateTitle" value="${this.escapeText(settings.template?.certificateTitle || course.title || '')}" oninput="MoodleUI.refreshCertificatePreview()">
                </div>
              </div>
              <div class="form-group">
                <label>${I18n.getLocale() === 'en' ? 'Subtitle' : '副標題'}</label>
                <input type="text" id="certificateSubtitle" value="${this.escapeText(settings.template?.certificateSubtitle || 'Certificate of Completion')}" oninput="MoodleUI.refreshCertificatePreview()">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>${I18n.getLocale() === 'en' ? 'Issuer' : '頒發者'}</label>
                  <input type="text" id="certificateIssuerName" value="${this.escapeText(settings.template?.issuerName || course.instructorName || 'BeyondBridge')}" oninput="MoodleUI.refreshCertificatePreview()">
                </div>
                <div class="form-group">
                  <label>${I18n.getLocale() === 'en' ? 'Issuer title' : '頒發者職稱'}</label>
                  <input type="text" id="certificateIssuerTitle" value="${this.escapeText(settings.template?.issuerTitle || (I18n.getLocale() === 'en' ? 'Instructor' : '課程講師'))}" oninput="MoodleUI.refreshCertificatePreview()">
                </div>
              </div>
              <div class="form-group">
                <label>${I18n.getLocale() === 'en' ? 'Award statement' : '證書敘述'}</label>
                <textarea id="certificateStatement" rows="3" oninput="MoodleUI.refreshCertificatePreview()">${this.escapeText(settings.template?.statement || '')}</textarea>
              </div>
            </div>

            <div class="certificate-settings-card">
              <h3>${I18n.getLocale() === 'en' ? 'Completion conditions' : '取得條件'}</h3>
              <p class="certificate-section-note">${I18n.getLocale() === 'en' ? 'Choose the learning materials learners must complete.' : '勾選學生必須完成的教材內容。'}</p>
              <div class="certificate-rule-section">
                <h4>${I18n.getLocale() === 'en' ? 'Learning materials' : '教材內容'}</h4>
                ${this.renderCertificateActivityChecklist(activityGroups.materials || [], selectedMaterialIds)}
              </div>
              <div class="certificate-rule-section">
                <h4>${I18n.getLocale() === 'en' ? 'Assignments and quizzes' : '作業與測驗'}</h4>
                ${this.renderCertificateScoreChecklist([
                  ...(activityGroups.assignments || []),
                  ...(activityGroups.quizzes || [])
                ], scoreMap)}
              </div>
              <div class="certificate-rule-section">
                <h4>${I18n.getLocale() === 'en' ? 'Study time requirement' : '學習時數'}</h4>
                <label class="certificate-duration-toggle">
                  <input type="checkbox" id="certificateDurationEnabled" ${durationCriterion ? 'checked' : ''}>
                  <span>${I18n.getLocale() === 'en' ? 'Require accumulated learning time' : '要求累積學習時間達標'}</span>
                </label>
                <div class="certificate-duration-input">
                  <input type="number" id="certificateDurationMinutes" min="1" value="${this.escapeText(String(durationCriterion?.minMinutes || 60))}">
                  <span>${I18n.getLocale() === 'en' ? 'minutes' : '分鐘'}</span>
                </div>
              </div>
            </div>

            <div class="certificate-actions">
              <button class="btn-primary" onclick="MoodleUI.saveCertificateSettings()">${I18n.getLocale() === 'en' ? 'Save certificate settings' : '儲存證書設定'}</button>
            </div>
          </div>

          <div class="certificate-preview-panel">
            <div class="certificate-settings-card">
              <h3>${I18n.getLocale() === 'en' ? 'Preview' : '預覽'}</h3>
              <div id="certificatePreviewWrap">
                ${this.renderCertificatePreview(settings.template || {}, course.title || '')}
              </div>
            </div>
            <div class="certificate-settings-card">
              <div class="section-title-row">
                <h3>${I18n.getLocale() === 'en' ? 'Issued certificates' : '已頒發證書'}</h3>
                <span class="badge-summary-pill">${recipients.length}</span>
              </div>
              ${recipients.length === 0 ? this.renderActivityEmptyState({
                icon: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>',
                title: I18n.getLocale() === 'en' ? 'No certificates issued yet' : '目前還沒有已頒發的證書',
                hint: I18n.getLocale() === 'en' ? 'Once learners satisfy these conditions, they will appear here automatically.' : '學生達成條件後，系統會自動把證書頒發並顯示在這裡。'
              }) : `
                <div class="badge-table-shell">
                  <table class="rubric-table">
                    <thead>
                      <tr>
                        <th>${I18n.getLocale() === 'en' ? 'Learner' : '學生'}</th>
                        <th>${I18n.getLocale() === 'en' ? 'Issued at' : '頒發時間'}</th>
                        <th>${I18n.getLocale() === 'en' ? 'Certificate no.' : '證書編號'}</th>
                        <th>${t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${recipients.map((record) => `
                        <tr>
                          <td>${this.escapeText(record.recipientName || record.userId || '—')}</td>
                          <td>${this.escapeText(this.formatPlatformDate(record.issuedAt, { dateStyle: 'medium', timeStyle: 'short' }))}</td>
                          <td>${this.escapeText(record.certificateNo || '—')}</td>
                          <td class="table-action-cell">
                            <button class="btn-sm" onclick="MoodleUI.downloadCertificate(${this.toInlineActionValue(record.certificateId)})">${I18n.getLocale() === 'en' ? 'Download' : '下載'}</button>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderCertificateStudentWorkspace(container, certificates = []) {
    container.innerHTML = `
      <div class="badges-container certificate-workspace">
        <div class="badges-header">
          <div>
            <h2>${I18n.getLocale() === 'en' ? 'My Certificates' : '我的證書'}</h2>
            <p class="certificate-subtitle">${I18n.getLocale() === 'en' ? 'Download the certificates that were automatically issued after you satisfied the course requirements.' : '這裡會顯示你完成課程條件後自動取得的證書，並可直接下載。'}</p>
          </div>
        </div>
        ${certificates.length === 0 ? this.renderActivityEmptyState({
          icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>',
          title: I18n.getLocale() === 'en' ? 'No certificates yet' : '目前還沒有證書',
          hint: I18n.getLocale() === 'en' ? 'Complete course materials, quizzes, assignments, or study time requirements to receive certificates automatically.' : '完成課程教材、測驗、作業或學習時數條件後，系統會自動把證書發到這裡。'
        }) : `
          <div class="certificate-grid">
            ${certificates.map((record) => `
              <div class="certificate-card">
                ${this.renderCertificatePreview({
                  theme: record.theme,
                  certificateTitle: record.certificateTitle,
                  certificateSubtitle: record.certificateSubtitle,
                  issuerName: record.issuerName,
                  issuerTitle: record.issuerTitle,
                  statement: record.statement
                }, record.courseTitle)}
                <div class="certificate-card-meta">
                  <div>
                    <strong>${this.escapeText(record.courseTitle || '')}</strong>
                    <span>${this.escapeText(this.formatPlatformDate(record.issuedAt, { dateStyle: 'medium' }))}</span>
                  </div>
                  <button class="btn-primary btn-sm" onclick="MoodleUI.downloadCertificate(${this.toInlineActionValue(record.certificateId)})">${I18n.getLocale() === 'en' ? 'Download certificate' : '下載證書'}</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  },

  refreshCertificatePreview() {
    const wrap = document.getElementById('certificatePreviewWrap');
    const courseTitle = document.getElementById('certificateCourseSelect')?.selectedOptions?.[0]?.textContent || '';
    if (!wrap) return;
    wrap.innerHTML = this.renderCertificatePreview({
      theme: document.getElementById('certificateTheme')?.value || 'classic',
      certificateTitle: document.getElementById('certificateTitle')?.value || courseTitle,
      certificateSubtitle: document.getElementById('certificateSubtitle')?.value || 'Certificate of Completion',
      issuerName: document.getElementById('certificateIssuerName')?.value || 'BeyondBridge',
      issuerTitle: document.getElementById('certificateIssuerTitle')?.value || '',
      statement: document.getElementById('certificateStatement')?.value || ''
    }, courseTitle);
  },

  collectCertificateCriteriaFromForm() {
    const criteria = [];
    const materialIds = Array.from(document.querySelectorAll('.certificate-material-checkbox:checked'))
      .map((input) => input.value)
      .filter(Boolean);

    if (materialIds.length > 0) {
      criteria.push({
        type: 'activity_completion',
        activityIds: materialIds
      });
    }

    Array.from(document.querySelectorAll('.certificate-score-checkbox:checked')).forEach((input) => {
      const activityId = input.value;
      const scoreInput = Array.from(document.querySelectorAll('.certificate-score-input'))
        .find((item) => item.dataset.activityId === activityId);
      const minScore = Math.max(0, Math.min(100, parseInt(scoreInput?.value, 10) || 60));
      criteria.push({
        type: 'activity_score',
        activityId,
        activityType: input.dataset.activityType || 'assignment',
        activityTitle: input.dataset.activityTitle || '',
        minScore
      });
    });

    if (document.getElementById('certificateDurationEnabled')?.checked) {
      criteria.push({
        type: 'duration',
        minMinutes: Math.max(1, parseInt(document.getElementById('certificateDurationMinutes')?.value, 10) || 60)
      });
    }

    return criteria;
  },

  async saveCertificateSettings() {
    const courseId = document.getElementById('certificateCourseSelect')?.value || this.currentCertificateCourseId;
    if (!courseId) {
      showToast(I18n.getLocale() === 'en' ? 'Please select a course first.' : '請先選擇課程。');
      return;
    }

    const enabled = !!document.getElementById('certificateEnabled')?.checked;
    const criteria = this.collectCertificateCriteriaFromForm();

    if (enabled && criteria.length === 0) {
      showToast(I18n.getLocale() === 'en' ? 'Please configure at least one issuance rule.' : '請至少設定一項頒發條件。');
      return;
    }

    const payload = {
      enabled,
      autoIssue: true,
      template: {
        theme: document.getElementById('certificateTheme')?.value || 'classic',
        certificateTitle: document.getElementById('certificateTitle')?.value?.trim() || '',
        certificateSubtitle: document.getElementById('certificateSubtitle')?.value?.trim() || '',
        issuerName: document.getElementById('certificateIssuerName')?.value?.trim() || '',
        issuerTitle: document.getElementById('certificateIssuerTitle')?.value?.trim() || '',
        statement: document.getElementById('certificateStatement')?.value?.trim() || ''
      },
      criteria
    };

    try {
      const result = await API.certificates.updateSettings(courseId, payload);
      if (result.success) {
        showToast(I18n.getLocale() === 'en' ? 'Certificate settings saved' : '證書設定已儲存');
        await this.openCertificates(courseId);
      } else {
        showToast(result.message || t('common.saveFailed'));
      }
    } catch (error) {
      console.error('Save certificate settings error:', error);
      showToast(t('common.saveFailed'));
    }
  },

  buildCertificateHtml(record) {
    const palette = this.getCertificateThemePalette(record.theme);
    const issuedAt = this.formatPlatformDate(record.issuedAt, { dateStyle: 'medium' });

    return `<!DOCTYPE html>
<html lang="${this.escapeText(I18n.getLocale() || 'zh-TW')}">
<head>
  <meta charset="utf-8">
  <title>${this.escapeText(record.certificateTitle || 'Certificate')}</title>
  <style>
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #f4f5f7; color: #1f2933; }
    .sheet { width: 1120px; max-width: calc(100vw - 48px); margin: 32px auto; padding: 56px; box-sizing: border-box; background: ${palette.surface}; border: 12px solid ${palette.accent}; border-radius: 28px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12); }
    .kicker { text-transform: uppercase; letter-spacing: 0.36em; font-size: 12px; color: ${palette.accent}; margin-bottom: 24px; }
    .title { font-size: 56px; line-height: 1.08; margin: 0 0 12px; color: ${palette.accent}; }
    .subtitle { font-size: 22px; color: #52606d; margin-bottom: 32px; }
    .recipient { font-size: 44px; margin: 28px 0 12px; font-weight: 700; }
    .statement { font-size: 20px; line-height: 1.8; max-width: 820px; }
    .course { margin-top: 24px; font-size: 24px; font-weight: 600; }
    .footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 56px; padding-top: 24px; border-top: 1px solid ${palette.border}; }
    .signature strong { display: block; font-size: 20px; margin-bottom: 6px; }
    .signature span, .meta span { display: block; color: #52606d; font-size: 16px; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="kicker">${this.escapeText(I18n.getLocale() === 'en' ? 'BeyondBridge Certificate' : 'BeyondBridge 證書')}</div>
    <h1 class="title">${this.escapeText(record.certificateTitle || '')}</h1>
    <div class="subtitle">${this.escapeText(record.certificateSubtitle || '')}</div>
    <div>${this.escapeText(I18n.getLocale() === 'en' ? 'This certifies that' : '茲證明')}</div>
    <div class="recipient">${this.escapeText(record.recipientName || '')}</div>
    <div class="statement">${this.escapeText(record.statement || '')}</div>
    <div class="course">${this.escapeText(record.courseTitle || '')}</div>
    <div class="footer">
      <div class="signature">
        <strong>${this.escapeText(record.issuerName || 'BeyondBridge')}</strong>
        <span>${this.escapeText(record.issuerTitle || '')}</span>
      </div>
      <div class="meta">
        <span>${this.escapeText(I18n.getLocale() === 'en' ? `Issued: ${issuedAt}` : `頒發日期：${issuedAt}`)}</span>
        <span>${this.escapeText(I18n.getLocale() === 'en' ? `Certificate No.: ${record.certificateNo || ''}` : `證書編號：${record.certificateNo || ''}`)}</span>
        <span>${this.escapeText(I18n.getLocale() === 'en' ? `Verify Code: ${record.verifyCode || ''}` : `驗證碼：${record.verifyCode || ''}`)}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
  },

  downloadCertificate(certificateId) {
    const record = this.certificateRecordIndex instanceof Map
      ? this.certificateRecordIndex.get(certificateId)
      : null;
    if (!record) {
      showToast(I18n.getLocale() === 'en' ? 'Certificate not found.' : '找不到這張證書。');
      return;
    }

    const blob = new Blob([this.buildCertificateHtml(record)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${record.certificateNo || record.certificateId || 'certificate'}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * 更新通知數量
   */
  async updateNotificationCount() {
    try {
      const result = await API.notifications.getUnreadCount();
      if (result.success) {
        this.updateNotificationBadge(result.data?.unreadCount || 0);
      }
    } catch (error) {
      // 靜默失敗
    }
  }
};

// 匯出到全域
window.MoodleUI = MoodleUI;

// 頁面載入後初始化
document.addEventListener('DOMContentLoaded', () => {
  if (typeof API !== 'undefined' && API.getCurrentUser()) {
    MoodleUI.init();
  }
});
