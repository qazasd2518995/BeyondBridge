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
  currentQuestionBankCategoryFilter: null,
  currentCalendarEvents: [],

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

  normalizeAssignmentState(assignment = {}) {
    const submission = assignment.submission || null;
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

    const graded = Boolean(
      assignment.graded === true ||
      submissionStatus.graded === true ||
      submission?.gradedAt ||
      hasGrade
    );

    return {
      ...assignment,
      submitted,
      graded,
      grade: assignment.grade ?? submission?.grade ?? submissionStatus.grade ?? null
    };
  },

  normalizeQuizState(quiz = {}) {
    const userStatus = quiz.userStatus || {};
    const attempts = Array.isArray(quiz.attempts) ? quiz.attempts : [];
    const completedAttempts = attempts.filter(a => a.status === 'completed').length;
    const bestScore = quiz.bestScore ?? userStatus.bestScore ?? null;
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
      attemptCount,
      canAttempt
    };
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
  renderCoursePicker(title, icon, callbackFn, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    API.courses.list({ enrolled: true }).then(result => {
      const isEnglish = I18n.getLocale() === 'en';
      const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
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
              ${courses.map(c => `
                <div class="activity-picker-card ${this.getSurfaceToneClass(c.courseId || c.id || c.title || c.name)}"
                     onclick="${callbackFn}(${this.toInlineActionValue(c.courseId || c.id)})">
                  <div class="activity-picker-card-accent"></div>
                  <div class="activity-picker-card-body">
                    <div class="activity-picker-card-copy">
                      <h3 class="activity-picker-card-title">${this.escapeText(c.title || c.name || (isEnglish ? 'Untitled course' : '未命名課程'))}</h3>
                      <p class="activity-picker-card-summary">${this.escapeText(this.truncateText(c.summary || c.description || '', 120) || (isEnglish ? 'No course summary yet.' : '尚未提供課程摘要。'))}</p>
                    </div>
                    <div class="activity-picker-card-footer">
                      <span class="activity-picker-card-teacher">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        ${this.escapeText(c.instructorName || c.teacherName || (isEnglish ? 'Course team' : '課程團隊'))}
                      </span>
                      <span class="activity-picker-card-link">${isEnglish ? 'Open' : '進入內容'}</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    }).catch(() => {
      container.innerHTML = `<div class="error">載入課程失敗</div>`;
    });
  },

  // ==================== 課程頁面 ====================

  /**
   * 載入課程列表
   */
  async loadCourses(filters = {}) {
    try {
      const result = await API.courses.list(filters);
      if (result.success) {
        this.renderCourseGrid(result.data || []);
      }
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

    container.innerHTML = courses.map(course => `
      <div class="moodle-course-card" onclick="MoodleUI.openCourse('${course.courseId}')">
        <div class="course-cover" data-cover-gradient="${this.escapeText(this.getCourseGradient(course.category))}">
          <span class="course-category">${course.category || t('moodleCourse.defaultCategory')}</span>
          ${course.isEnrolled ? `<span class="enrolled-badge">${t('moodleCourse.enrolled')}</span>` : ''}
        </div>
        <div class="course-body">
          <h3 class="course-name">${course.title || course.name || t('moodleCourse.untitledCourse')}</h3>
          <p class="course-shortname">${course.shortName || course.shortname || ''}</p>
          <p class="course-summary">${course.description || course.summary || t('moodleCourse.noDescription')}</p>
          <div class="course-meta">
            <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a7.5 7.5 0 0115 0"/></svg> ${course.instructorName || course.teacherName || t('moodleCourse.teacher')}</span>
            <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ${course.enrollmentCount || course.enrolledCount || 0} ${t('moodleCourse.students')}</span>
          </div>
          ${course.isEnrolled && course.progress !== undefined ? `
            <div class="course-progress-bar">
              <div class="progress-fill" data-progress-width="${this.clampProgressValue(course.progress)}"></div>
            </div>
            <span class="progress-text">${course.progress}% ${t('moodleCourse.complete')}</span>
          ` : ''}
        </div>
      </div>
    `).join('');
    this.applyDynamicUiMetrics(container);
  },

  /**
   * 開啟課程頁面
   */
  async openCourse(courseId) {
    try {
      const result = await API.courses.get(courseId);
      if (!result.success) {
        showToast(t('moodleCourse.loadFailed'));
        return;
      }

      this.currentCourse = result.data;
      this.currentCourseId = courseId;
      this.renderCoursePage(result.data);
      showView('courseDetail');
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
    const isTeacher = this.canTeachCourse(course, user);

    container.innerHTML = `
      <!-- 課程頭部 -->
      <div class="course-header">
        <button onclick="showView('moodleCourses')" class="back-btn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
          ${t('moodleCourse.backToCourseList')}
        </button>
        <div class="course-header-content">
          <div class="course-header-info">
            <span class="course-category-badge">${course.category || t('moodleCourse.defaultCategory')}</span>
            <h1>${course.title || course.name || t('moodleCourse.course')}</h1>
            <p>${course.description || course.summary || ''}</p>
            <div class="course-header-meta">
              <span>${t('moodleCourse.teacherLabel')}：${course.instructorName || course.teacherName || t('moodleCourse.teacher')}</span>
              <span>${course.enrollmentCount || course.enrolledCount || 0} ${t('moodleCourse.studentsCount')}</span>
              <span>${course.format === 'topics' ? t('moodleCourse.formatTopics') : course.format === 'weeks' ? t('moodleCourse.formatWeeks') : t('moodleCourse.formatSingle')}</span>
            </div>
          </div>
          <div class="course-header-actions">
            ${!course.isEnrolled && !isTeacher ? `
              <button onclick="MoodleUI.enrollCourse('${course.courseId}')" class="btn-primary">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                ${t('moodleCourse.enroll')}
              </button>
            ` : ''}
            ${isTeacher ? `
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
      </div>

      <!-- 課程導航標籤 -->
      <div class="course-nav-tabs">
        <button class="nav-tab active" onclick="MoodleUI.switchCourseTab('content')">${t('moodleCourse.tabContent')}</button>
        <button class="nav-tab" onclick="MoodleUI.switchCourseTab('participants')">${t('moodleCourse.tabParticipants')}</button>
        <button class="nav-tab" onclick="MoodleUI.switchCourseTab('grades')">${t('moodleCourse.tabGrades')}</button>
        ${isTeacher ? `<button class="nav-tab" onclick="MoodleUI.switchCourseTab('reports')">${t('moodleCourse.tabReports')}</button>` : ''}
      </div>

      <!-- 課程內容區 -->
      <div id="courseContentPanel" class="course-panel active">
        ${this.renderCourseSections(course.sections || [], isTeacher, course.courseId)}
      </div>

      <!-- 參與者區 -->
      <div id="courseParticipantsPanel" class="course-panel">
        <div class="loading">${t('common.loading')}</div>
      </div>

      <!-- 成績區 -->
      <div id="courseGradesPanel" class="course-panel">
        <div class="loading">${t('common.loading')}</div>
      </div>

      <!-- 報表區 (教師) -->
      <div id="courseReportsPanel" class="course-panel">
        <div class="loading">${t('common.loading')}</div>
      </div>
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
          <div class="section-info">
            <h2 class="section-title">${section.name || section.title || `${t('moodleCourse.weekPrefix')} ${index + 1} ${t('moodleCourse.weekSuffix')}`}</h2>
            ${section.summary ? `<p class="section-summary">${section.summary}</p>` : ''}
          </div>
          ${isTeacher ? `
            <div class="section-actions">
              <button onclick="MoodleUI.openAddActivity('${courseId}', '${section.sectionId}')" class="btn-sm">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                ${t('moodleCourse.addActivity')}
              </button>
              <button onclick="MoodleUI.editSection('${courseId}', '${section.sectionId}')" class="btn-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
          ` : ''}
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
      assignment: 'var(--terracotta)',
      quiz: '#8b5cf6',
      forum: '#f59e0b',
      label: 'var(--gray-500)',
      lti: '#ec4899'
    };

    return activities.map((activity) => {
      const accentColor = activityColors[activity.type] || 'var(--gray-400)';
      return `
      <div class="activity-item ${activity.visible === false ? 'hidden-activity' : ''}" onclick="MoodleUI.openActivity('${activity.type}', '${activity.activityId}', '${courseId}')">
        <div class="activity-icon" data-accent-color="${this.escapeText(accentColor)}">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            ${activityIcons[activity.type] || activityIcons.page}
          </svg>
        </div>
        <div class="activity-info">
          <span class="activity-name">${activity.name || activity.title}</span>
          ${activity.description ? `<span class="activity-desc">${activity.description}</span>` : ''}
          ${activity.dueDate ? `<span class="activity-due">${t('moodleCourse.dueDate')}：${new Date(activity.dueDate).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')}</span>` : ''}
        </div>
        ${activity.completed ? `<span class="completed-badge">${t('moodleCourse.completed')}</span>` : ''}
        ${isTeacher ? `
          <div class="activity-actions" onclick="event.stopPropagation()">
            <button onclick="MoodleUI.editActivity('${courseId}', '${sectionId}', '${activity.activityId}')" class="btn-icon-sm">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button onclick="MoodleUI.deleteActivity('${courseId}', '${sectionId}', '${activity.activityId}')" class="btn-icon-sm danger">
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
  async switchCourseTab(tab) {
    // 更新標籤狀態
    document.querySelectorAll('.course-nav-tabs .nav-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

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
    }
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
      return `<div class="empty-list">${t('moodleParticipant.noParticipants')}</div>`;
    }

    return `
      <div class="participants-list">
        <table class="data-table">
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
            ${participants.map(p => `
              <tr>
                <td>
                  <div class="user-cell">
                    <div class="user-avatar">${(p.userName || t('moodleParticipant.defaultAvatar'))[0]}</div>
                    <span>${p.userName || t('moodleParticipant.defaultName')}</span>
                  </div>
                </td>
                <td>${p.userEmail || '-'}</td>
                <td>${p.enrolledAt ? new Date(p.enrolledAt).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : '-'}</td>
                <td>
                  <div class="mini-progress">
                    <div class="mini-progress-fill" data-progress-width="${this.clampProgressValue(p.progress || 0)}"></div>
                  </div>
                  <span class="progress-text-sm">${p.progress || 0}%</span>
                </td>
                <td>${p.lastAccess ? new Date(p.lastAccess).toLocaleDateString('zh-TW') : t('moodleParticipant.never')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
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

  /**
   * 渲染學生成績
   */
  renderStudentGrades(grades) {
    if (!grades || grades.items?.length === 0) {
      return `<div class="empty-list">${t('moodleGrade.noGrades')}</div>`;
    }

    return `
      <div class="student-grades">
        <div class="grade-summary">
          <div class="summary-card">
            <div class="summary-value">${grades.totalScore || '-'}</div>
            <div class="summary-label">${t('moodleGrade.totalGrade')}</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${grades.completedItems || 0}/${grades.totalItems || 0}</div>
            <div class="summary-label">${t('moodleGrade.completedItems')}</div>
          </div>
        </div>
        <table class="data-table">
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
            ${(grades.items || []).map(item => `
              <tr>
                <td>${item.name}</td>
                <td><span class="type-badge ${item.type}">${item.type === 'assignment' ? t('moodleGrade.typeAssignment') : item.type === 'quiz' ? t('moodleGrade.typeQuiz') : t('moodleGrade.typeOther')}</span></td>
                <td><strong>${item.score !== null ? item.score : '-'}</strong> / ${item.maxScore}</td>
                <td>${item.weight ? item.weight + '%' : '-'}</td>
                <td>${item.feedback || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /**
   * 渲染教師成績簿
   */
  renderTeacherGradebook(gradebook) {
    if (!gradebook || !gradebook.students) {
      return `<div class="empty-list">${t('moodleGrade.noGrades')}</div>`;
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
                  <td class="sticky-col">${student.name}</td>
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
        this.launchLtiTool(activityId, courseId);
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
      MoodleUI.createModal('page-activity-modal', activity.title || t('moodleActivity.pageTitle'), `
        <div class="page-activity-content">
          ${content}
        </div>
      `, { maxWidth: '800px' });
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
        this.openVideoViewer(activity.name || activity.title || t('moodleActivity.video'), ytId, url);
        return;
      }

      // 其他網頁：平台內 iframe 瀏覽
      this.openWebViewer(activity.name || activity.title || url, url);
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
  openVideoViewer(title, youtubeId, originalUrl) {
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
  },

  /**
   * 網頁全螢幕 iframe 瀏覽器（不跳出平台）
   */
  openWebViewer(title, url) {
    const viewer = this.openActivityViewerShell({
      overlayId: 'web-viewer-overlay',
      title,
      subtitle: url,
      externalUrl: url
    });

    viewer.body.innerHTML = `
      <div class="activity-viewer-frame">
        <iframe src="${this.escapeText(url)}"
                class="activity-viewer-embed"
                allow="autoplay; encrypted-media; fullscreen"></iframe>
      </div>
    `;
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

      const viewer = this.openActivityViewerShell({
        overlayId: 'file-viewer-overlay',
        title,
        subtitle: contentType,
        externalUrl: authedUrl
      });
      viewer.overlay.oncontextmenu = () => false;

      if (contentType === 'application/pdf') {
        viewer.body.innerHTML = `
          <div class="activity-viewer-frame">
            <iframe src="${this.escapeText(`${authedUrl}#toolbar=0&navpanes=0&scrollbar=1`)}" class="activity-viewer-embed"></iframe>
          </div>
        `;
      } else if (contentType.startsWith('image/')) {
        viewer.body.innerHTML = `
          <div class="activity-viewer-frame">
            <div class="activity-viewer-media">
              <img src="${this.escapeText(authedUrl)}" oncontextmenu="return false" draggable="false" />
            </div>
          </div>
        `;
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
      } else {
        viewer.body.innerHTML = `
          <div class="activity-viewer-frame">
            <iframe src="${this.escapeText(authedUrl)}" class="activity-viewer-embed"></iframe>
          </div>
        `;
      }

    } catch (error) {
      console.error('開啟檔案活動失敗:', error);
      showToast(t('moodleActivity.loadFileError'));
    }
  },

  /**
   * 啟動 LTI 1.3 外部工具
   */
  async launchLtiTool(activityId, courseId) {
    try {
      showToast(t('moodleActivity.launchingTool'));

      // 取得活動詳情以獲得 toolId
      const activity = await API.courseActivities.get(courseId, activityId);
      if (!activity.success || !activity.data) {
        showToast(t('moodleActivity.loadActivityFailed'));
        return;
      }

      const toolId = activity.data.toolId || activity.data.ltiToolId;
      if (!toolId) {
        showToast(t('moodleActivity.noLtiTool'));
        return;
      }

      // 啟動 LTI OIDC 流程
      const baseUrl = window.location.origin;
      const launchUrl = `${baseUrl}/api/lti/13/initiate?` + new URLSearchParams({
        tool_id: toolId,
        course_id: courseId,
        resource_link_id: activityId,
        target: 'iframe' // 或 'window' ${t('moodleActivity.openNewWindow')}
      }).toString();

      // 建立啟動視窗/iframe
      this.openLtiLaunchModal(launchUrl, activity.data.name || t('moodleLti.externalTool'));

    } catch (error) {
      console.error('LTI launch error:', error);
      showToast(t('moodleActivity.launchFailed'));
    }
  },

  /**
   * 開啟 LTI 啟動 Modal
   */
  openLtiLaunchModal(launchUrl, toolName) {
    const existing = document.getElementById('ltiLaunchModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'ltiLaunchModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-fullscreen">
        <div class="modal-header">
          <h3>🔗 ${toolName}</h3>
          <div class="modal-header-actions">
            <button onclick="MoodleUI.openLtiInNewWindow()" class="btn-secondary btn-sm" title="${t('moodleActivity.openNewWindow')}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15,3 21,3 21,9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
            <button onclick="MoodleUI.closeModal('ltiLaunchModal')" class="modal-close">&times;</button>
          </div>
        </div>
        <div class="modal-body">
          <iframe id="ltiLaunchFrame" class="lti-launch-frame" src="${launchUrl}"></iframe>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

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
    const launchUrl = `${baseUrl}/api/lti/13/initiate?` + new URLSearchParams({
      tool_id: toolId,
      course_id: courseId,
      message_type: 'LtiDeepLinkingRequest',
      target: 'iframe'
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
    modal.className = 'modal-overlay';
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
      const result = await API.courseSections.create(courseId, { name, summary });
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
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleAddActivity.title')}</h3>
          <button onclick="MoodleUI.closeModal('addActivityModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="activity-types-grid">
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('page', this)">
              <div class="type-icon tone-olive">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              </div>
              <span>${t('moodleAddActivity.typePage')}</span>
              <p>${t('moodleAddActivity.typePageDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('url', this)">
              <div class="type-icon tone-indigo">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeUrl')}</span>
              <p>${t('moodleAddActivity.typeUrlDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('file', this)">
              <div class="type-icon tone-emerald">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeFile')}</span>
              <p>${t('moodleAddActivity.typeFileDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('assignment', this)">
              <div class="type-icon tone-terracotta">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeAssignment')}</span>
              <p>${t('moodleAddActivity.typeAssignmentDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('quiz', this)">
              <div class="type-icon tone-violet">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeQuiz')}</span>
              <p>${t('moodleAddActivity.typeQuizDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('forum', this)">
              <div class="type-icon tone-amber">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeForum')}</span>
              <p>${t('moodleAddActivity.typeForumDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('lti', this)">
              <div class="type-icon tone-pink">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeLti')}</span>
              <p>${t('moodleAddActivity.typeLtiDesc')}</p>
            </div>
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
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('addActivityModal'); };
  },

  selectedActivityType: null,

  /**
   * 選擇活動類型
   */
  selectActivityType(type, triggerEl = null) {
    this.selectedActivityType = type;

    // 高亮選中的卡片
    document.querySelectorAll('.activity-type-card').forEach(card => card.classList.remove('selected'));
    if (triggerEl) triggerEl.classList.add('selected');

    // 顯示表單
    const formArea = document.getElementById('activityFormArea');
    const footer = document.getElementById('activityModalFooter');
    formArea.hidden = false;
    footer.hidden = false;

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
      case 'assignment':
        return commonFields + `
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleAddActivity.dueDateLabel')}</label>
              <input type="datetime-local" id="assignmentDueDate">
            </div>
            <div class="form-group">
              <label>${t('moodleAddActivity.scoreLabel')}</label>
              <input type="number" id="assignmentPoints" value="100" min="0">
            </div>
          </div>
          <div class="form-group">
            <label>${t('moodleAddActivity.submitTypeLabel')}</label>
            <select id="submissionType">
              <option value="text">${t('moodleAddActivity.submitTypeText')}</option>
              <option value="file">${t('moodleAddActivity.submitTypeFile')}</option>
              <option value="both">${t('moodleAddActivity.submitTypeBoth')}</option>
            </select>
          </div>
        `;
      case 'quiz':
        return commonFields + `
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleAddActivity.startTimeLabel')}</label>
              <input type="datetime-local" id="quizOpenDate">
            </div>
            <div class="form-group">
              <label>${t('moodleAddActivity.endTimeLabel')}</label>
              <input type="datetime-local" id="quizCloseDate">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleAddActivity.timeLimitLabel')}</label>
              <input type="number" id="quizTimeLimit" value="60" min="0">
            </div>
            <div class="form-group">
              <label>${t('moodleAddActivity.attemptsLabel')}</label>
              <input type="number" id="quizAttempts" value="1" min="0">
            </div>
          </div>
          <p class="form-hint">${t('moodleAddActivity.quizHint')}</p>
        `;
      case 'forum':
        return commonFields + `
          <div class="form-group">
            <label>${t('moodleAddActivity.forumTypeLabel')}</label>
            <select id="forumType">
              <option value="general">${t('moodleAddActivity.forumTypeGeneral')}</option>
              <option value="qanda">${t('moodleAddActivity.forumTypeQA')}</option>
              <option value="news">${t('moodleAddActivity.forumTypeNews')}</option>
            </select>
          </div>
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
    const name = document.getElementById('activityName')?.value.trim();
    const description = document.getElementById('activityDescription')?.value.trim();

    if (!name) {
      showToast(t('moodleAddActivity.nameRequired'));
      return;
    }

    const activityData = {
      type: this.selectedActivityType,
      name,
      description
    };

    // 根據類型收集額外資料
    switch (this.selectedActivityType) {
      case 'page':
        activityData.content = document.getElementById('pageContent')?.value;
        break;
      case 'url':
        activityData.url = document.getElementById('urlValue')?.value;
        break;
      case 'assignment':
        activityData.dueDate = document.getElementById('assignmentDueDate')?.value;
        activityData.points = parseInt(document.getElementById('assignmentPoints')?.value) || 100;
        activityData.submissionType = document.getElementById('submissionType')?.value;
        break;
      case 'quiz':
        activityData.openDate = document.getElementById('quizOpenDate')?.value;
        activityData.closeDate = document.getElementById('quizCloseDate')?.value;
        activityData.timeLimit = parseInt(document.getElementById('quizTimeLimit')?.value);
        activityData.attempts = parseInt(document.getElementById('quizAttempts')?.value);
        break;
      case 'forum':
        activityData.forumType = document.getElementById('forumType')?.value;
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
      const result = await API.courseSections.addActivity(courseId, sectionId, activityData);
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
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) this.closeModal(modalId); };

    const maxWidth = options.maxWidth || '600px';

    modal.innerHTML = `
      <div class="modal-content modal-generic">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" onclick="MoodleUI.closeModal('${modalId}')">&times;</button>
        </div>
        <div class="modal-body modal-scroll-body">
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
    if (modal) modal.remove();
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
        ? { label: t('moodleAssignment.statusGraded'), tone: 'is-accent' }
        : a.submitted
          ? { label: t('moodleAssignment.statusSubmitted'), tone: 'is-success' }
          : isStudentOverdue
            ? { label: t('moodleAssignment.statusOverdue'), tone: 'is-danger' }
            : { label: t('moodleAssignment.statusPending'), tone: 'is-neutral' };

    const submissions = Number(a.stats?.totalSubmissions || 0);
    const graded = Number(a.stats?.gradedCount || 0);
    const gradeText = a.graded && a.grade !== null && a.grade !== undefined
      ? `${a.grade}/${a.maxPoints || 100}`
      : '';

    return `
      <div class="assignment-card${teacherView ? ' is-teacher-card' : ''}" onclick="MoodleUI.openAssignment(${this.toInlineActionValue(a.assignmentId)})">
        <div class="assignment-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
        </div>
        <div class="assignment-info">
          <h3>${this.escapeText(title)}</h3>
          ${description ? `<p class="activity-card-description">${this.escapeText(description)}</p>` : ''}
          ${metaItems.length ? `<div class="activity-card-meta">${metaItems.map(item => `<span>${this.escapeText(item)}</span>`).join('')}</div>` : ''}
        </div>
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
            <span class="activity-status-chip ${statusMeta.tone}">${this.escapeText(statusMeta.label)}</span>
          </div>
        ` : `
          <div class="assignment-status">
            <span class="activity-status-chip ${statusMeta.tone}">${this.escapeText(statusMeta.label)}</span>
            ${gradeText ? `<span class="grade">${this.escapeText(gradeText)}</span>` : ''}
          </div>
        `}
      </div>
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
    const bestScoreLabel = q.bestScore !== undefined && q.bestScore !== null && q.bestScore !== ''
      ? `${Number.isFinite(bestScoreNumber) ? bestScoreNumber.toFixed(0) : q.bestScore} ${t('moodleQuiz.score')}`
      : `- ${t('moodleQuiz.score')}`;

    let studentStatusHtml = '';
    if (q.completed) {
      studentStatusHtml = `
        <div class="quiz-status">
          <span class="activity-status-chip is-accent">${t('moodleQuiz.completed')}</span>
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
      const statusLabel = isOpen
        ? (isEnglish ? 'Attempt limit reached' : '已達作答上限')
        : hasClosed
          ? (isEnglish ? 'Closed' : '已關閉')
          : t('moodleQuiz.notAvailable');
      studentStatusHtml = `
        <div class="quiz-status">
          <span class="activity-status-chip ${isOpen ? 'is-warning' : 'is-neutral'}">${this.escapeText(statusLabel)}</span>
        </div>
      `;
    }

    const teacherStatusMeta = isOpen
      ? { label: isEnglish ? 'Open' : '開放中', tone: 'is-success' }
      : hasClosed
        ? { label: isEnglish ? 'Closed' : '已關閉', tone: 'is-neutral' }
        : { label: isEnglish ? 'Scheduled' : '未開放', tone: 'is-warning' };

    return `
      <div class="quiz-card${teacherView ? ' is-teacher-card' : ''}" onclick="MoodleUI.openQuiz(${this.toInlineActionValue(q.quizId)})">
        <div class="quiz-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="quiz-info">
          <h3>${this.escapeText(title)}</h3>
          ${description ? `<p class="activity-card-description">${this.escapeText(description)}</p>` : ''}
          ${metaItems.length ? `<div class="activity-card-meta">${metaItems.map(item => `<span>${this.escapeText(item)}</span>`).join('')}</div>` : ''}
        </div>
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
            <span class="activity-status-chip ${teacherStatusMeta.tone}">${this.escapeText(teacherStatusMeta.label)}</span>
          </div>
        ` : studentStatusHtml}
      </div>
    `;
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
      try {
        const courseResult = await API.courses.get(courseId);
        if (courseResult.success) courseName = courseResult.data.title || courseResult.data.name || '';
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

      this.renderAssignmentsWithBack(assignments, courseName, courseId, filter);
    } catch (error) {
      console.error('Load assignments error:', error);
      container.innerHTML = `<div class="error">${t('moodleAssignment.loadFailed')}</div>`;
    }
  },

  renderAssignmentsWithBack(assignments, courseName, courseId, currentFilter) {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    const normalizedAssignments = (Array.isArray(assignments) ? assignments : [])
      .map(a => this.normalizeAssignmentState(a));
    const user = API.getCurrentUser();
    const isTeacher = this.isTeachingRole(user);
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
  async openAssignment(assignmentId) {
    try {
      const result = await API.assignments.get(assignmentId);
      if (!result.success) {
        showToast(t('moodleAssignment.loadFailed'));
        return;
      }

      const assignment = this.normalizeAssignmentState(result.data || {});
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

      container.innerHTML = `
        <div class="assignment-detail">
          <div class="assignment-header">
            <button onclick="showView('moodleAssignments')" class="back-btn">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
              ${t('moodleAssignment.backToList')}
            </button>
            <div class="assignment-info">
              <h1>${assignment.title}</h1>
              <div class="assignment-meta">
                <div class="assignment-meta-item">
                  <span class="label">${t('moodleAssignment.courseLabel')}</span>
                  <span class="value">${assignment.courseName || t('moodleAssignment.course')}</span>
                </div>
                <div class="assignment-meta-item">
                  <span class="label">${t('moodleAssignment.dueDateLabel')}</span>
                  <span class="value">${assignment.dueDate ? new Date(assignment.dueDate).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : t('moodleAssignment.none')}</span>
                </div>
                <div class="assignment-meta-item">
                  <span class="label">${t('moodleAssignment.maxPoints')}</span>
                  <span class="value">${assignment.maxPoints || 100} ${t('moodleAssignment.points')}</span>
                </div>
              </div>
            </div>
            <div class="assignment-status ${assignment.submission ? (assignment.submission.grade !== undefined ? 'graded' : 'submitted') : 'not-submitted'}">
              ${assignment.submission ? (assignment.submission.grade !== undefined ? `${t('moodleAssignment.gradedStatus')}: ${assignment.submission.grade}/${assignment.maxPoints}` : t('moodleAssignment.submittedStatus')) : t('moodleAssignment.notSubmitted')}
            </div>
          </div>

          <div class="assignment-content">
            <h3>${t('moodleAssignment.description')}</h3>
            <div class="content-body">${assignment.description || t('moodleAssignment.noDesc')}</div>
          </div>

          ${!isTeacher ? this.renderSubmissionArea(assignment) : this.renderGradingArea(assignment)}
        </div>
      `;

      showView('assignmentDetail');
    } catch (error) {
      console.error('Open assignment error:', error);
      showToast(t('moodleAssignment.loadFailed'));
    }
  },

  /**
   * 渲染提交區域
   */
  renderSubmissionArea(assignment) {
    if (assignment.submission) {
      return `
        <div class="submission-area">
          <h3>${t('moodleAssignment.mySubmission')}</h3>
          <div class="submitted-content">
            ${assignment.submission.content ? `<div class="text-content">${assignment.submission.content}</div>` : ''}
            ${assignment.submission.files ? `<div class="file-list">${assignment.submission.files.map(f => `<span class="file-item">${f.filename}</span>`).join('')}</div>` : ''}
          </div>
          <p class="submit-time">${t('moodleAssignment.submitTime')}：${new Date(assignment.submission.submittedAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')}</p>
          ${assignment.submission.feedback ? `<div class="feedback"><h4>${t('moodleAssignment.teacherFeedback')}</h4><p>${assignment.submission.feedback}</p></div>` : ''}
        </div>
      `;
    }

    return `
      <div class="submission-area">
        <h3>${t('moodleAssignment.submitTitle')}</h3>
        <form id="submissionForm">
          ${assignment.submissionType !== 'file' ? `
            <div class="form-group">
              <label>${t('moodleAssignment.contentLabel')}</label>
              <textarea id="submissionContent" rows="8" placeholder="${t('moodleAssignment.contentPlaceholder')}"></textarea>
            </div>
          ` : ''}
          ${assignment.submissionType !== 'text' ? `
            <div class="form-group">
              <label>${t('moodleAssignment.uploadLabel')}</label>
              <div class="file-upload-area" onclick="document.getElementById('submissionFile').click()">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p>${t('moodleAssignment.uploadHint')}</p>
              </div>
              <input type="file" id="submissionFile" class="hidden-file-input" onchange="MoodleUI.handleFileSelect(this)">
              <div id="selectedFiles"></div>
            </div>
          ` : ''}
          <button type="button" onclick="MoodleUI.submitAssignment('${assignment.assignmentId}')" class="btn-primary">${t('moodleAssignment.submitBtn')}</button>
        </form>
      </div>
    `;
  },

  /**
   * 渲染評分區域 (教師)
   */
  renderGradingArea(assignment) {
    return `
      <div class="grading-area">
        <h3>${t('moodleAssignment.studentSubmissions')} (${assignment.submissions?.length || 0})</h3>
        ${(assignment.submissions || []).length === 0 ? `<p class="no-submissions">${t('moodleAssignment.noStudentSubmissions')}</p>` : `
          <div class="submissions-list">
            ${assignment.submissions.map(s => `
              <div class="submission-item">
                <div class="student-info">
                  <div class="avatar">${(s.studentName || 'S')[0]}</div>
                  <div>
                    <span class="name">${s.studentName}</span>
                    <span class="time">${new Date(s.submittedAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')}</span>
                  </div>
                </div>
                <div class="submission-actions">
                  <button onclick="MoodleUI.viewSubmission('${assignment.assignmentId}', '${s.studentId}')" class="btn-sm">${t('moodleAssignment.viewBtn')}</button>
                  <input type="number" id="grade_${s.studentId}" class="grade-input-compact" value="${s.grade || ''}" placeholder="${t('moodleGrade.score')}">
                  <button onclick="MoodleUI.gradeSubmission('${assignment.assignmentId}', '${s.studentId}')" class="btn-primary">${t('moodleAssignment.gradeBtn')}</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  },

  /**
   * 查看學生提交
   */
  async viewSubmission(assignmentId, studentId) {
    try {
      const result = await API.assignments.getSubmission(assignmentId, studentId);
      if (result.success) {
        const s = result.data;
        MoodleUI.createModal('view-submission-modal', t('moodleAssignment.viewSubmission'), `
          <div class="submission-detail">
            <p><strong>${t('moodleParticipant.student')}：</strong>${s.studentName || studentId}</p>
            <p><strong>${t('moodleAssignment.submitTime')}：</strong>${s.submittedAt ? new Date(s.submittedAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : t('moodleAssignment.notSubmitted')}</p>
            <div class="submission-content">${s.content || `<em>${t('moodleAssignment.noTextContent')}</em>`}</div>
            ${s.files?.length ? `<div class="submission-files"><strong>${t('moodleAssignment.attachments')}：</strong><ul>${s.files.map(f => `<li>${f.name || f.fileName}</li>`).join('')}</ul></div>` : ''}
            ${s.grade !== undefined && s.grade !== null ? `<p><strong>${t('moodleGrade.score')}：</strong>${s.grade}</p>` : ''}
            ${s.feedback ? `<p><strong>${t('moodleGrade.feedback')}：</strong>${s.feedback}</p>` : ''}
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
    const content = document.getElementById('submissionContent')?.value;
    const fileInput = document.getElementById('submissionFile');
    const files = fileInput?.files;

    if (!content && (!files || files.length === 0)) {
      showToast(t('moodleAssignment.contentRequired'));
      return;
    }

    const data = { content };

    // 處理檔案上傳
    if (files && files.length > 0) {
      data.files = [];
      for (const file of files) {
        const fileData = await API.files.fileToBase64(file);
        data.files.push(fileData);
      }
    }

    try {
      const result = await API.assignments.submit(assignmentId, data);
      if (result.success) {
        showToast(t('moodleAssignment.submitSuccess'));
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
      const quizzesResult = await API.quizzes.list(courseId);
      let quizzes = quizzesResult.success ? (quizzesResult.data || []) : [];

      let courseName = '';
      try {
        const courseResult = await API.courses.get(courseId);
        if (courseResult.success) courseName = courseResult.data.title || courseResult.data.name || '';
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

      this.renderQuizzesWithBack(quizzes, courseName, courseId, filter);
    } catch (error) {
      console.error('Load quizzes error:', error);
      container.innerHTML = `<div class="error">${t('moodleQuiz.loadFailed')}</div>`;
    }
  },

  renderQuizzesWithBack(quizzes, courseName, courseId, currentFilter) {
    const container = document.getElementById('quizzesList');
    if (!container) return;

    const normalizedQuizzes = (Array.isArray(quizzes) ? quizzes : [])
      .map(q => this.normalizeQuizState(q));
    const user = API.getCurrentUser();
    const isTeacher = this.isTeachingRole(user);
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

  /**
   * 開始測驗
   */
  async startQuiz(quizId) {
    try {
      const result = await API.quizzes.start(quizId);
      if (result.success) {
        this.currentQuizAttempt = result.data;
        this.currentQuestionIndex = 0;
        this.renderQuizQuestion();
        showView('quizAttempt');
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

    container.innerHTML = `
      <div class="quiz-header">
        <h2>${attempt.quizTitle || t('moodleQuiz.title')}</h2>
        <div class="quiz-progress">
          <span>${t('moodleQuiz.questionOf')} ${this.currentQuestionIndex + 1} / ${totalQuestions} ${t('moodleQuiz.questionSuffix')}</span>
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
      </div>
      <div class="quiz-body">
        <div class="question-content">
          <h3>${question.text}</h3>
          ${this.renderQuestionOptions(question)}
        </div>
        <div class="quiz-navigation">
          <button ${this.currentQuestionIndex === 0 ? 'disabled' : ''} onclick="MoodleUI.prevQuestion()" class="btn-secondary">${t('moodleQuiz.prevQuestion')}</button>
          ${this.currentQuestionIndex === totalQuestions - 1 ? `
            <button onclick="MoodleUI.submitQuiz()" class="btn-primary">${t('moodleQuiz.submitQuiz')}</button>
          ` : `
            <button onclick="MoodleUI.nextQuestion()" class="btn-primary">${t('moodleQuiz.nextQuestion')}</button>
          `}
        </div>
        <div class="quiz-question-nav">
          ${attempt.questions.map((q, i) => `
            <button class="question-nav-btn ${i === this.currentQuestionIndex ? 'current' : ''} ${q.answered ? 'answered' : ''}" onclick="MoodleUI.goToQuestion(${i})">${i + 1}</button>
          `).join('')}
        </div>
      </div>
    `;
    this.applyDynamicUiMetrics(container);
  },

  /**
   * 渲染題目選項
   */
  renderQuestionOptions(question) {
    switch (question.type) {
      case 'multiple_choice':
      case 'true_false':
        return `
          <div class="question-options">
            ${question.options.map((opt, i) => `
              <label class="question-option ${question.answer === i ? 'selected' : ''}" onclick="MoodleUI.selectAnswer(${i})">
                <input type="radio" name="answer" value="${i}" ${question.answer === i ? 'checked' : ''}>
                <span>${opt}</span>
              </label>
            `).join('')}
          </div>
        `;
      case 'multiple_select':
        return `
          <div class="question-options">
            ${question.options.map((opt, i) => `
              <label class="question-option ${(question.answer || []).includes(i) ? 'selected' : ''}">
                <input type="checkbox" value="${i}" ${(question.answer || []).includes(i) ? 'checked' : ''} onchange="MoodleUI.selectMultipleAnswer(${i})">
                <span>${opt}</span>
              </label>
            `).join('')}
          </div>
        `;
      case 'short_answer':
      case 'essay':
        return `
          <div class="form-group">
            <textarea id="answerText" rows="${question.type === 'essay' ? 8 : 2}" placeholder="${t('moodleQuiz.answerPlaceholder')}">${question.answer || ''}</textarea>
          </div>
        `;
      default:
        return '';
    }
  },

  /**
   * 選擇答案
   */
  async selectAnswer(index) {
    const question = this.currentQuizAttempt.questions[this.currentQuestionIndex];
    question.answer = index;
    question.answered = true;

    await API.quizzes.answer(this.currentQuizAttempt.quizId, this.currentQuizAttempt.attemptId, {
      questionId: question.questionId,
      answer: index
    });

    this.renderQuizQuestion();
  },

  /**
   * 下一題
   */
  nextQuestion() {
    if (this.currentQuestionIndex < this.currentQuizAttempt.questions.length - 1) {
      this.currentQuestionIndex++;
      this.renderQuizQuestion();
    }
  },

  /**
   * 上一題
   */
  prevQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.renderQuizQuestion();
    }
  },

  /**
   * 跳轉到指定題目
   */
  goToQuestion(index) {
    this.currentQuestionIndex = index;
    this.renderQuizQuestion();
  },

  /**
   * 提交測驗
   */
  async submitQuiz() {
    const confirmed = await showConfirmDialog({
      message: t('moodleQuiz.confirmSubmit'),
      confirmLabel: t('common.confirm')
    });
    if (!confirmed) return;

    try {
      const result = await API.quizzes.submit(
        this.currentQuizAttempt.quizId,
        this.currentQuizAttempt.attemptId
      );

      if (result.success) {
        showToast(`${t('moodleQuiz.completeScore')}：${result.data.score}`);
        showView('moodleQuizzes');
        this.loadQuizzes();
      } else {
        showToast(result.message || t('moodleAssignment.submitFailed'));
      }
    } catch (error) {
      console.error('Submit quiz error:', error);
      showToast(t('moodleAssignment.submitFailed'));
    }
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
      try {
        const courseResult = await API.courses.get(courseId);
        if (courseResult.success) courseName = courseResult.data.title || courseResult.data.name || '';
      } catch(e) {}

      forums = forums.map(f => ({ ...f, courseName, courseId }));

      if (filter === 'subscribed') {
        forums = forums.filter(f => f.subscribed);
      }

      this.renderForumsWithBack(forums, courseName, courseId);
    } catch (error) {
      console.error('Load forums error:', error);
      container.innerHTML = `<div class="error">${t('moodleForum.loadFailed')}</div>`;
    }
  },

  renderForumsWithBack(forums, courseName, courseId) {
    const container = document.getElementById('forumsList');
    if (!container) return;

    const user = API.getCurrentUser();
    const isTeacher = this.isTeachingRole(user);
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
              <button type="button" class="forum-header-btn secondary" onclick="showView('moodleCourses'); MoodleUI.loadCourses();">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <span>${t('sidebar.courseCenter') || '課程中心'}</span>
              </button>
              ${isTeacher ? `
                <button type="button" class="forum-header-btn primary" onclick="MoodleUI.openCreateForumModal(${this.toInlineActionValue(courseId)})">
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
            return `
              <article class="forum-card ${typeMeta.className}" onclick="MoodleUI.openForum(${this.toInlineActionValue(forum.forumId)})">
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
                        ${forum.updatedAt ? `<span>•</span><span>更新於 ${this.escapeText(this.formatPlatformDate(forum.updatedAt, { year: 'numeric', month: 'numeric', day: 'numeric' }))}</span>` : ''}
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
                </div>
              </article>
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
          return `
            <article class="forum-card ${typeMeta.className}" onclick="MoodleUI.openForum(${this.toInlineActionValue(forum.forumId)})">
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
                  <span class="forum-card-stat">${Number(forum.discussionCount ?? forum.stats?.discussionCount ?? 0)} ${t('moodleForum.topics')}</span>
                  <span class="forum-card-stat">${Number(forum.postCount ?? forum.stats?.postCount ?? 0)} ${t('moodleForum.replies')}</span>
                </div>
              </div>
            </article>
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
  async openForum(forumId) {
    try {
      const result = await API.forums.get(forumId);
      if (!result.success) {
        showToast(t('moodleForum.loadFailed'));
        return;
      }

      const forum = result.data;
      const container = document.getElementById('forumDetailContent');
      const typeMeta = this.getForumTypeMeta(forum.type);
      const discussions = Array.isArray(forum.discussions) ? forum.discussions : [];
      const safeTitle = this.escapeText(forum.title || forum.name || t('moodleForum.title'));
      const safeDescription = this.escapeText(forum.description || '這個討論區暫時沒有補充說明。');
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
                <button type="button" class="forum-header-btn secondary" onclick="showView('moodleCourses'); MoodleUI.loadCourses();">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  <span>${t('sidebar.courseCenter') || '課程中心'}</span>
                </button>
                <button type="button" class="forum-header-btn primary" onclick="MoodleUI.openNewDiscussionModal(${this.toInlineActionValue(forumId)})">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>${t('moodleForum.newDiscussion')}</span>
                </button>
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
            </div>
          </div>
          <div class="forum-topic-list">
            ${discussions.length === 0
              ? this.renderForumState(t('moodleForum.noDiscussions'))
              : discussions.map(discussion => {
                  const discussionId = discussion.discussionId || discussion.id;
                  const safeSubject = this.escapeText(discussion.subject || '未命名主題');
                  const safeExcerpt = this.escapeText(this.truncateText(discussion.message || '', 200) || '這則主題尚未提供內容摘要。');
                  const safeAuthor = this.escapeText(discussion.authorName || '匿名');
                  const safeDate = this.escapeText(this.formatPlatformDate(discussion.createdAt, { year: 'numeric', month: 'numeric', day: 'numeric' }) || '');
                  const safeLastReply = this.escapeText(this.formatPlatformDate(discussion.lastReply, { year: 'numeric', month: 'numeric', day: 'numeric' }) || '');
                  return `
                    <article class="forum-topic-card${discussion.pinned ? ' is-pinned' : ''}" onclick="MoodleUI.openDiscussion(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)})">
                      <div class="forum-thread-avatar">${this.escapeText((discussion.authorName || 'U').trim().charAt(0) || 'U')}</div>
                      <div class="forum-topic-content">
                        <div class="forum-topic-topline">
                          <div>
                            <div class="forum-topic-title-row">
                              ${discussion.pinned ? `<span class="forum-topic-badge">${t('moodleForum.pinned')}</span>` : ''}
                              <h3 class="forum-topic-title">${safeSubject}</h3>
                            </div>
                            <div class="forum-topic-meta">
                              <span>${safeAuthor}</span>
                              ${safeDate ? `<span>•</span><span>${safeDate}</span>` : ''}
                              ${discussion.lastReply ? `<span>•</span><span>${t('moodleForum.lastReply')} ${safeLastReply}</span>` : ''}
                            </div>
                          </div>
                        </div>
                        <p class="forum-topic-excerpt">${safeExcerpt}</p>
                        <div class="forum-topic-stats">
                          <span class="forum-topic-stat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <span>${Number(discussion.replyCount || 0)} ${t('moodleForum.replies')}</span>
                          </span>
                        </div>
                      </div>
                    </article>
                  `;
                }).join('')}
          </div>
        </section>
      `;

      showView('forumDetail');
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

    titleEl.textContent = `${I18n.getLocale() === 'en' ? '' : year + ' '}${I18n.getLocale() === 'en' ? new Date(year, month).toLocaleString('en', {month: 'long', year: 'numeric'}) : (month + 1) + ' 月'}`;

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
        <div class="calendar-day ${isToday ? 'today' : ''}" onclick="MoodleUI.openDayEvents(${year}, ${month}, ${day})">
          <span class="day-number">${day}</span>
          ${dayEvents.slice(0, 3).map(e => `
            <div class="calendar-event ${e.type}">${e.title}</div>
          `).join('')}
          ${dayEvents.length > 3 ? `<div class="calendar-more">+${dayEvents.length - 3} ${t('moodleCalendar.more')}</div>` : ''}
        </div>
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
        container.innerHTML = `<div class="empty-list">${t('moodleCalendar.noEvents')}</div>`;
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

  /**
   * 載入成績簿 (主入口)
   */
  async loadGradebook() {
    const container = document.getElementById('gradebookContent');
    const courseSelect = document.getElementById('gradebookCourseSelect');
    if (!container) return;

    try {
      // 先載入使用者報名的課程
      const coursesResult = await API.courses.list({ enrolled: true });
      if (!coursesResult.success) return;

      const courses = coursesResult.data || [];

      // 更新課程選擇下拉選單
      if (courseSelect) {
        courseSelect.innerHTML = `
          <option value="">${t('moodleGradebook.selectCourse')}</option>
          ${courses.map(c => `<option value="${c.courseId}">${c.title || c.name || t('moodleCourse.course')}</option>`).join('')}
        `;
      }

      // 預設顯示提示
      container.innerHTML = `
        <div class="empty-list">
          <svg class="empty-list-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <p>${t('common.selectCourseGrades')}</p>
        </div>
      `;
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

    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    try {
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

  /**
   * 開啟測驗詳情
   */
  async openQuiz(quizId) {
    try {
      const result = await API.quizzes.get(quizId);
      if (!result.success) {
        showToast(t('moodleQuiz.loadFailed'));
        return;
      }

      const quiz = this.normalizeQuizState(result.data || {});
      const attemptsHistory = Array.isArray(quiz.myAttempts)
        ? quiz.myAttempts
        : (Array.isArray(quiz.attempts) ? quiz.attempts : []);
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
              <span class="value">${quiz.openDate ? new Date(quiz.openDate).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : t('moodleQuiz.alwaysOpen')}</span>
            </div>
            <div class="info-item">
              <span class="label">${t('moodleQuiz.closeDate')}</span>
              <span class="value">${quiz.closeDate ? new Date(quiz.closeDate).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : t('moodleQuiz.noLimit')}</span>
            </div>
          </div>
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
                  </tr>
                </thead>
                <tbody>
                  ${attemptsHistory.map((a, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${a.startedAt ? new Date(a.startedAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : '-'}</td>
                      <td>${(a.completedAt || a.submittedAt) ? new Date(a.completedAt || a.submittedAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : '-'}</td>
                      <td>${a.score !== undefined && a.score !== null ? a.score + ' ' + t('moodleQuiz.pointsSuffix') : (a.percentage !== undefined && a.percentage !== null ? `${a.percentage}%` : '-')}</td>
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

      showView('quizAttempt');
    } catch (error) {
      console.error('Open quiz error:', error);
      showToast(t('moodleQuiz.loadDetailFailed'));
    }
  },

  /**
   * 開啟新增討論 Modal
   */
  openCreateForumModal(courseId) {
    this.closeModal('createForumModal');
    const modal = document.createElement('div');
    modal.id = 'createForumModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal active discussion-modal discussion-modal-md" role="dialog" aria-modal="true" aria-labelledby="createForumModalTitle">
        <div class="modal-header">
          <h2 id="createForumModalTitle">新增討論區</h2>
          <button onclick="MoodleUI.closeModal('createForumModal')" class="modal-close">&times;</button>
        </div>
        <form id="createForumForm">
          <div class="modal-body">
            <div class="discussion-modal-intro">
              <div class="discussion-modal-intro-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>
              </div>
              <div>
                <div class="discussion-modal-intro-title">先定義清楚這個論壇的用途</div>
                <p class="discussion-modal-intro-copy">例如公告、問答或課堂交流。名稱和說明越清楚，學生越知道什麼內容應該發在哪裡。</p>
              </div>
            </div>
            <div class="bridge-form-group">
              <label class="bridge-form-label" for="newForumTitle">討論區名稱 *</label>
              <input type="text" id="newForumTitle" class="bridge-form-control" placeholder="例如：課程公告、學習交流">
            </div>
            <div class="discussion-modal-grid">
              <div class="bridge-form-group">
                <label class="bridge-form-label" for="newForumType">類型</label>
                <select id="newForumType" class="bridge-form-control">
                  <option value="general">一般討論</option>
                  <option value="news">公告</option>
                  <option value="qanda">問與答</option>
                </select>
              </div>
              <div class="bridge-form-group">
                <label class="bridge-form-label" for="newForumDesc">說明</label>
                <textarea id="newForumDesc" rows="4" class="bridge-form-control" placeholder="簡短說明這個討論區適合發什麼內容。"></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <div class="discussion-modal-note">建立後即可在課程論壇中開放新主題，教師與學生都能更有方向地使用。</div>
            <button type="button" onclick="MoodleUI.closeModal('createForumModal')" class="btn-secondary">取消</button>
            <button type="submit" class="btn-primary">建立討論區</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createForumModal'); };
    modal.querySelector('#createForumForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitCreateForum(courseId);
    });
    window.requestAnimationFrame(() => modal.querySelector('#newForumTitle')?.focus());
  },

  async submitCreateForum(courseId) {
    const title = document.getElementById('newForumTitle').value.trim();
    const description = document.getElementById('newForumDesc').value.trim();
    const type = document.getElementById('newForumType').value;

    if (!title) { showToast('請輸入討論區名稱'); return; }

    try {
      const result = await API.forums.create({ courseId, title, description, type });
      if (result.success) {
        showToast('討論區已建立');
        this.closeModal('createForumModal');
        this.loadForums(courseId);
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      console.error('Create forum error:', error);
      showToast('建立討論區失敗');
    }
  },

  openNewDiscussionModal(forumId) {
    this.closeModal('newDiscussionModal');
    const modal = document.createElement('div');
    modal.id = 'newDiscussionModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal active discussion-modal discussion-modal-lg" role="dialog" aria-modal="true" aria-labelledby="newDiscussionModalTitle">
        <div class="modal-header">
          <h2 id="newDiscussionModalTitle">${t('moodleDiscussion.newTitle')}</h2>
          <button onclick="MoodleUI.closeModal('newDiscussionModal')" class="modal-close">&times;</button>
        </div>
        <form id="newDiscussionForm">
          <div class="modal-body">
            <div class="discussion-modal-intro">
              <div class="discussion-modal-intro-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>
              </div>
              <div>
                <div class="discussion-modal-intro-title">讓主題更容易被回覆</div>
                <p class="discussion-modal-intro-copy">主旨先說清楚問題，內容補充背景與目前做法，能讓同學與老師更快切入重點。</p>
              </div>
            </div>
            <div class="bridge-form-group">
              <label class="bridge-form-label" for="discussionSubject">${t('moodleDiscussion.subjectLabel')}</label>
              <input type="text" id="discussionSubject" class="bridge-form-control" placeholder="${t('moodleDiscussion.subjectPlaceholder')}">
            </div>
            <div class="bridge-form-group">
              <label class="bridge-form-label" for="discussionMessage">${t('moodleDiscussion.contentLabel')}</label>
              <textarea id="discussionMessage" rows="7" class="bridge-form-control discussion-form-textarea" placeholder="${t('moodleDiscussion.contentPlaceholder')}"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <div class="discussion-modal-note">發布後會顯示在這個課程論壇中，並納入主題與回覆統計。</div>
            <button type="button" onclick="MoodleUI.closeModal('newDiscussionModal')" class="btn-secondary">${t('moodleDiscussion.cancel')}</button>
            <button type="submit" class="btn-primary">${t('moodleDiscussion.publish')}</button>
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

    if (!subject || !message) {
      showToast(t('moodleDiscussion.fieldsRequired'));
      return;
    }

    try {
      const result = await API.forums.createDiscussion(forumId, { subject, message });
      if (result.success) {
        showToast(t('moodleDiscussion.published'));
        this.closeModal('newDiscussionModal');
        this.openForum(forumId);
      } else {
        showToast(result.message || t('moodleDiscussion.publishFailed'));
      }
    } catch (error) {
      console.error('Create discussion error:', error);
      showToast(t('moodleDiscussion.publishFailed'));
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
      const safeAuthor = this.escapeText(discussion.authorName || '匿名');
      const safeSubject = this.escapeText(discussion.subject || '未命名主題');
      const safeMessage = this.formatMultilineText(discussion.message || '');
      const safeCreatedAt = this.escapeText(this.formatPlatformDate(discussion.createdAt, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) || '');

      container.innerHTML = `
        <section class="forum-thread-shell">
          <div class="forum-thread-panel">
            <div class="forum-thread-top">
              <div class="forum-header-cluster">
                <button type="button" class="forum-back-btn" onclick="MoodleUI.openForum(${this.toInlineActionValue(forumId)})">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  <span>${t('moodleDiscussion.backToForum')}</span>
                </button>
                <div class="forum-thread-copy">
                  <span class="forum-thread-count-pill">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span>${posts.length} ${t('moodleDiscussion.repliesCount')}</span>
                  </span>
                  <h2 class="forum-thread-title">${safeSubject}</h2>
                  <p class="forum-thread-subtitle">以下顯示原始主題與所有回覆。內容會依時間排序，方便你追蹤討論脈絡。</p>
                </div>
              </div>
            </div>
            <div class="forum-thread-meta">
              <span class="forum-chip">${safeAuthor}</span>
              ${safeCreatedAt ? `<span class="forum-chip">${safeCreatedAt}</span>` : ''}
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
              <div class="forum-thread-post-content">${safeMessage || this.escapeText('尚未提供內容。')}</div>
            </div>
          </article>

          <section class="forum-thread-panel">
            <div class="forum-thread-replies-head">
              <div class="forum-thread-replies-title">${posts.length} ${t('moodleDiscussion.repliesCount')}</div>
              <div class="forum-count-row">
                <span class="forum-chip">${posts.filter(post => post.liked).length} 已按讚回覆</span>
              </div>
            </div>
            <div class="forum-thread-replies">
              ${posts.length === 0
                ? this.renderForumState('目前還沒有任何回覆。你可以成為第一個回應這個主題的人。')
                : posts.map(post => {
                    const safePostAuthor = this.escapeText(post.authorName || '匿名');
                    const safePostTime = this.escapeText(this.formatPlatformDate(post.createdAt, {
                      year: 'numeric',
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) || '');
                    const safePostMessage = this.formatMultilineText(post.message || '');
                    return `
                      <article class="forum-thread-post is-reply">
                        <div class="forum-thread-avatar">${this.escapeText((post.authorName || 'U').trim().charAt(0) || 'U')}</div>
                        <div class="forum-thread-post-body">
                          <div class="forum-thread-post-header">
                            <div>
                              <div class="forum-thread-post-author">${safePostAuthor}</div>
                              <div class="forum-thread-post-meta">
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
                          <div class="forum-thread-post-content">${safePostMessage || this.escapeText('尚未提供內容。')}</div>
                        </div>
                      </article>
                    `;
                  }).join('')}
            </div>
          </section>

          ${!discussion.locked ? `
            <section class="forum-thread-reply-form">
              <div class="forum-thread-reply-form-title">${t('moodleDiscussion.replyTitle')}</div>
              <textarea id="replyMessage" class="bridge-form-control" rows="5" placeholder="${t('moodleDiscussion.replyPlaceholder')}"></textarea>
              <div class="forum-thread-reply-actions">
                <div class="forum-thread-reply-note">回覆會立即顯示在這個主題下方，請盡量提供具體、可執行的建議。</div>
                <button type="button" onclick="MoodleUI.submitReply(${this.toInlineActionValue(forumId)}, ${this.toInlineActionValue(discussionId)})" class="forum-header-btn primary">${t('moodleDiscussion.replyBtn')}</button>
              </div>
            </section>
          ` : `
            <div class="forum-thread-state forum-thread-locked">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div class="forum-thread-state-title">${t('moodleDiscussion.locked')}</div>
              <div class="forum-thread-state-copy">這則討論已鎖定，目前不能再新增回覆。</div>
            </div>
          `}
        </section>
      `;
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

    const bodyHtml = `
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
              class="calendar-day-event-item"
              onclick="MoodleUI.handleCalendarEventClick('${encodedType}', '${encodedCourseId}')">
              <div class="calendar-day-event-main">
                <div class="calendar-day-event-copy">
                  <div class="calendar-day-event-type">${this.getCalendarEventTypeLabel(eventType)}</div>
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
    `;

    this.createModal(
      'calendarDayEventsModal',
      `${dateLabel} ${t('moodleCalendar.eventsOf')}`,
      bodyHtml,
      { maxWidth: '560px' }
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
      this.updateNotificationBadge(result.unreadCount || 0);

      if (notifications.length === 0) {
        container.innerHTML = `<div class="empty-list">${t('moodleNotification.noNotifications')}</div>`;
        return;
      }

      container.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.readAt ? '' : 'unread'}" onclick="MoodleUI.openNotification('${n.notificationId}')">
          <div class="notification-icon ${n.type}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              ${this.getNotificationIcon(n.type)}
            </svg>
          </div>
          <div class="notification-content">
            <div class="title">${n.title}</div>
            <div class="message">${n.message}</div>
            <div class="time">${this.formatTimeAgo(n.createdAt)}</div>
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('Load notifications error:', error);
      container.innerHTML = `<div class="error">${t('moodleNotification.loadFailed')}</div>`;
    }
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
    return date.toLocaleDateString('zh-TW');
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
    await API.notifications.markAsRead(notificationId);
    this.loadNotifications();
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

  /**
   * 開啟完整成績簿管理頁面（教師專用）
   */
  async openGradebookManagement(courseId) {
    if (!courseId) {
      courseId = this.currentCourseId || this.currentGradebookCourseId;
      if (!courseId) {
        const container = document.getElementById('gradebookManagementContent');
        if (!container) return;
        showView('gradebookManagement');
        container.innerHTML = `<div class="loading">${t('moodleGradebook.loadingCourses')}</div>`;
        try {
          const isEnglish = I18n.getLocale() === 'en';
          const result = await API.courses.list();
          const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
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
                  ${courses.map(c => `
                    <div class="activity-picker-card ${this.getSurfaceToneClass(c.courseId || c.id || c.title || c.name)}"
                         onclick="MoodleUI.openGradebookManagement(${this.toInlineActionValue(c.courseId || c.id)})">
                      <div class="activity-picker-card-accent"></div>
                      <div class="activity-picker-card-body">
                        <div class="activity-picker-card-copy">
                          <h3 class="activity-picker-card-title">${this.escapeText(c.title || c.name || t('moodleGradebook.untitledCourse'))}</h3>
                          <p class="activity-picker-card-summary">${this.escapeText(this.truncateText(c.summary || c.description || '', 120) || (isEnglish ? 'No course summary yet.' : '尚未提供課程摘要。'))}</p>
                        </div>
                        <div class="activity-picker-card-footer">
                          <span class="activity-picker-card-teacher">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                            ${this.escapeText(c.shortName || c.category || (isEnglish ? 'Course details' : '課程資訊'))}
                          </span>
                          <span class="activity-picker-card-link">${isEnglish ? 'Open gradebook' : '查看成績簿'}</span>
                        </div>
                      </div>
                    </div>
                  `).join('')}
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

    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    showView('gradebookManagement');

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
      <div class="gradebook-management">
        <div class="gradebook-header">
          <button onclick="showView('moodleCourses')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            ${t('moodleGradebook.back')}
          </button>
          <h1>${t('moodleGradebook.title')}</h1>
        </div>

        <!-- 工具列 -->
        <div class="gradebook-toolbar">
          <div class="toolbar-left">
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
          <div class="stat-card">
            <div class="stat-value">${students.length}</div>
            <div class="stat-label">${t('moodleGradebook.studentCount')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${items.length}</div>
            <div class="stat-label">${t('moodleGradebook.gradeItems')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${(gradebook.stats?.averageGrade ?? gradebook.classAverage) != null ? (gradebook.stats?.averageGrade ?? gradebook.classAverage).toFixed(1) : '-'}</div>
            <div class="stat-label">${t('moodleGradebook.classAverage')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${gradebook.stats?.passingRate != null ? gradebook.stats.passingRate + '%' : (gradebook.highestScore || '-')}</div>
            <div class="stat-label">${t('moodleGradebook.highestScore')}</div>
          </div>
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
                        <div class="student-avatar">${(student.name || 'U')[0]}</div>
                        <div class="student-name">${student.name}</div>
                      </div>
                    </td>
                    ${(student.grades || []).map((g, idx) => `
                      <td class="grade-cell ${g.score === null ? 'not-graded' : ''}"
                          data-item-id="${items[idx]?.itemId || items[idx]?.id}"
                          data-student-id="${student.userId}"
                          ondblclick="MoodleUI.editGradeCell(this)">
                        <span class="grade-value">${g.score !== null ? g.score : '-'}</span>
                        ${g.feedback ? `<span class="has-feedback" title="${t('moodleGradebook.hasFeedback')}">💬</span>` : ''}
                      </td>
                    `).join('')}
                    <td class="total-cell">
                      <strong>${(student.total ?? student.summary?.overallPercentage) != null ? (student.total ?? student.summary?.overallPercentage).toFixed(1) : '-'}</strong>
                    </td>
                    <td class="letter-cell">
                      <span class="letter-grade ${this.getLetterGradeClass(student.letterGrade)}">${student.letterGrade || (student.summary?.passing ? 'P' : student.summary?.overallPercentage != null ? 'F' : '-')}</span>
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
            ${(settings.gradeScale || [
              { letter: 'A', minScore: 90, maxScore: 100 },
              { letter: 'B', minScore: 80, maxScore: 89 },
              { letter: 'C', minScore: 70, maxScore: 79 },
              { letter: 'D', minScore: 60, maxScore: 69 },
              { letter: 'F', minScore: 0, maxScore: 59 }
            ]).map(scale => `
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

  /**
   * 編輯成績儲存格
   */
  editGradeCell(cell) {
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

    try {
      const result = await API.gradebook.updateGrade(
        this.currentGradebookCourseId,
        itemId,
        { grades: [{ studentId, grade: newValue ? parseFloat(newValue) : null }] }
      );

      if (result.success) {
        cell.innerHTML = `<span class="grade-value">${newValue || '-'}</span>`;
        cell.classList.toggle('not-graded', !newValue);
        showToast(t('moodleGrade.updated'));
        // 重新計算總分
        this.recalculateStudentTotal(studentId);
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

    // 暫時顯示載入中
    const totalCell = row.querySelector('.total-cell strong');
    if (totalCell) totalCell.textContent = '...';
  },

  /**
   * 匯出 CSV 成績
   */
  async exportGradesCSV(courseId) {
    try {
      const result = await API.gradebookEnhanced.exportGrades(courseId, 'csv');
      if (result.success && result.data?.csv) {
        const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });
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
      const result = await API.gradebookEnhanced.exportGrades(courseId, 'excel');
      if (result.success && result.data?.excel) {
        // Base64 解碼並下載
        const byteCharacters = atob(result.data.excel);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grades_${courseId}_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('moodleGradebook.excelExported'));
      } else {
        showToast(t('moodleGradebook.exportFailed'));
      }
    } catch (error) {
      console.error('Export Excel error:', error);
      showToast(t('moodleGradebook.exportFailed'));
    }
  },

  /**
   * 開啟成績類別管理 Modal
   */
  async openGradeCategoryModal(courseId) {
    const modal = document.createElement('div');
    modal.id = 'gradeCategoryModal';
    modal.className = 'modal-overlay';

    try {
      const result = await API.gradebookEnhanced.getCategories(courseId);
      const categories = result.success ? result.data : [];

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
                    <span class="category-weight">${cat.weight}%</span>
                  </div>
                  <div class="category-actions">
                    <button onclick="MoodleUI.editGradeCategory('${courseId}', '${cat.categoryId}')" class="btn-sm">${t('moodleGradeCategory.edit')}</button>
                    <button onclick="MoodleUI.deleteGradeCategory('${courseId}', '${cat.categoryId}')" class="btn-sm btn-danger">${t('moodleGradeCategory.delete')}</button>
                  </div>
                </div>
              `).join('')}
              ${categories.length === 0 ? `<div class="empty-list">${t('moodleGradeCategory.noCategories')}</div>` : ''}
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
    const modal = document.createElement('div');
    modal.id = 'gradeSettingsModal';
    modal.className = 'modal-overlay';

    try {
      const result = await API.gradebookEnhanced.getSettings(courseId);
      const settings = result.success ? result.data : {};

      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>${t('moodleGradeSettings.title')}</h3>
            <button onclick="MoodleUI.closeModal('gradeSettingsModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>${t('moodleGradeSettings.aggregation')}</label>
              <select id="gradeAggregation">
                <option value="weighted_mean" ${settings.aggregation === 'weighted_mean' ? 'selected' : ''}>${t('moodleGradeSettings.weightedMean')}</option>
                <option value="simple_mean" ${settings.aggregation === 'simple_mean' ? 'selected' : ''}>${t('moodleGradeSettings.simpleMean')}</option>
                <option value="highest" ${settings.aggregation === 'highest' ? 'selected' : ''}>${t('moodleGradeSettings.highest')}</option>
                <option value="sum" ${settings.aggregation === 'sum' ? 'selected' : ''}>${t('moodleGradeSettings.sum')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('moodleGradeSettings.scaleType')}</label>
              <select id="gradeScaleType">
                <option value="letter" ${settings.scaleType === 'letter' ? 'selected' : ''}>${t('moodleGradeSettings.letterScale')}</option>
                <option value="taiwan" ${settings.scaleType === 'taiwan' ? 'selected' : ''}>${t('moodleGradeSettings.taiwanScale')}</option>
                <option value="percentage" ${settings.scaleType === 'percentage' ? 'selected' : ''}>${t('moodleGradeSettings.percentage')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="showLetterGrades" ${settings.showLetterGrades ? 'checked' : ''}>
                ${t('moodleGradeSettings.showLetter')}
              </label>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="includeInOverall" ${settings.includeInOverall !== false ? 'checked' : ''}>
                ${t('moodleGradeSettings.includeTotal')}
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
      aggregation: document.getElementById('gradeAggregation').value,
      scaleType: document.getElementById('gradeScaleType').value,
      showLetterGrades: document.getElementById('showLetterGrades').checked,
      includeInOverall: document.getElementById('includeInOverall').checked
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

  // ==================== 題庫管理系統 ====================

  currentQuestionBankFilters: {},

  /**
   * 開啟題庫管理頁面
   */
  async openQuestionBank(categoryId) {
    const container = document.getElementById('questionBankContent');
    if (!container) return;

    // 沒有指定類別 → 顯示課程選擇器（題庫以課程類別分類）
    if (!categoryId) {
      container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
      showView('questionBank');

      try {
        const categoriesResult = await API.questionBank.getCategories();
        const categories = categoriesResult.success ? categoriesResult.data : [];
        const isEnglish = I18n.getLocale() === 'en';

        if (categories.length === 0) {
          container.innerHTML = this.renderActivityEmptyState({
            icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
            title: t('moodleQuestionBank.noQuestions'),
            hint: isEnglish ? 'Create a category to start building your question bank.' : '先建立題庫類別，再開始整理題目。'
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
                  <p>${isEnglish ? 'Choose a category to manage your question bank.' : '請選擇題庫類別以瀏覽與管理題目。'}</p>
                  <div class="activity-shell-meta">
                    <span class="activity-chip">${categories.length} ${isEnglish ? 'categories' : '個類別'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="activity-picker-grid">
              ${categories.map(cat => `
                <div class="activity-picker-card ${this.getSurfaceToneClass(cat.id || cat.categoryId || cat.name)}"
                     onclick="MoodleUI.openQuestionBank(${this.toInlineActionValue(cat.id || cat.categoryId)})">
                  <div class="activity-picker-card-accent"></div>
                  <div class="activity-picker-card-body">
                    <div class="activity-picker-card-copy">
                      <h3 class="activity-picker-card-title">${this.escapeText(cat.name || (isEnglish ? 'Untitled category' : '未命名類別'))}</h3>
                      <p class="activity-picker-card-summary">${this.escapeText(this.truncateText(cat.description || '', 120) || (isEnglish ? 'No category description yet.' : '尚未提供類別說明。'))}</p>
                    </div>
                    <div class="activity-picker-card-footer">
                      <span class="activity-picker-card-teacher">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        ${cat.questionCount || 0} ${isEnglish ? 'questions' : '道題目'}
                      </span>
                      <span class="activity-picker-card-link">${isEnglish ? 'Open category' : '查看題目'}</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } catch (error) {
        console.error('Open question bank error:', error);
        container.innerHTML = `<div class="error">${t('moodleQuestionBank.loadFailed')}</div>`;
      }
      return;
    }

    // 有指定類別 → 載入該類別的題目
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    showView('questionBank');

    try {
      const [questionsResult, categoriesResult] = await Promise.all([
        API.questionBank.list({ ...this.currentQuestionBankFilters, categoryId }),
        API.questionBank.getCategories()
      ]);

      const questions = questionsResult.success ? questionsResult.data : [];
      const categories = categoriesResult.success ? categoriesResult.data : [];
      const currentCat = categories.find(c => c.id === categoryId);

      container.innerHTML = this.renderQuestionBankPageWithBack(questions, categories, currentCat, categoryId);
    } catch (error) {
      console.error('Open question bank error:', error);
      container.innerHTML = `<div class="error">${t('moodleQuestionBank.loadFailed')}</div>`;
    }
  },

  /**
   * 渲染題庫頁面
   */
  renderQuestionBankPageWithBack(questions, categories, currentCat, categoryId) {
    const catName = currentCat ? currentCat.name : '題庫';
    const isEnglish = I18n.getLocale() === 'en';
    const backHeader = this.renderActivityCollectionHeader({
      backAction: 'MoodleUI.openQuestionBank()',
      title: `${catName} — ${t('moodleQuestionBank.title')}`,
      subtitle: isEnglish ? 'Manage questions, categories, and search filters.' : '管理題目內容、分類與搜尋篩選。',
      metaChips: [
        { label: `${questions.length} ${isEnglish ? 'questions' : '道題目'}` },
        currentCat ? { label: this.escapeText(currentCat.name) } : null
      ]
    });
    return backHeader + this.renderQuestionBankPage(questions, categories);
  },

  renderQuestionBankPage(questions, categories) {
    const questionTypes = {
      'multiple_choice': t('moodleQuestionBank.multipleChoice'),
      'true_false': t('moodleQuestionBank.trueFalse'),
      'short_answer': t('moodleQuestionBank.shortAnswer'),
      'matching': t('moodleQuestionBank.matching'),
      'fill_blank': t('moodleQuestionBank.fillBlank'),
      'essay': t('moodleQuestionBank.essay')
    };

    return `
      <div class="question-bank-page">
        <div class="qb-header">
          <h1>${t('moodleQuestionBank.title')}</h1>
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
            <div class="qb-categories">
              <h3>${t('moodleQuestionBank.categoriesTitle')}</h3>
              <button onclick="MoodleUI.openCategoryManageModal()" class="btn-sm">${t('moodleQuestionBank.manageCategories')}</button>
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

            <div class="qb-type-filter">
              <h3>${t('moodleQuestionBank.typeFilter')}</h3>
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
            <div class="qb-search">
              <input type="text" id="questionSearch" placeholder="${t('moodleQuestionBank.searchPlaceholder')}"
                     value="${this.currentQuestionBankFilters.search || ''}"
                     onkeyup="if(event.key==='Enter') MoodleUI.searchQuestions()">
              <button onclick="MoodleUI.searchQuestions()" class="btn-search">${t('moodleQuestionBank.searchBtn')}</button>
            </div>

            <div class="qb-list">
              ${questions.length === 0 ? `<div class="empty-list">${t('moodleQuestionBank.noQuestions')}</div>` : ''}
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
    await this.openQuestionBank();
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

    await this.openQuestionBank();
  },

  /**
   * 搜尋題目
   */
  async searchQuestions() {
    const searchInput = document.getElementById('questionSearch');
    this.currentQuestionBankFilters.search = searchInput?.value || '';
    await this.openQuestionBank();
  },

  /**
   * 開啟新增題目 Modal
   */
  openCreateQuestionModal() {
    const modal = document.createElement('div');
    modal.id = 'createQuestionModal';
    modal.className = 'modal-overlay';

    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleNewQuestion.title')}</h3>
          <button onclick="MoodleUI.closeModal('createQuestionModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleNewQuestion.typeLabel')}</label>
              <select id="questionType" onchange="MoodleUI.updateQuestionForm()">
                <option value="multiple_choice">${t('moodleQuestionBank.multipleChoice')}</option>
                <option value="true_false">${t('moodleQuestionBank.trueFalse')}</option>
                <option value="short_answer">${t('moodleQuestionBank.shortAnswer')}</option>
                <option value="fill_blank">${t('moodleQuestionBank.fillBlank')}</option>
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

    if (type === 'multiple_choice') {
      area.innerHTML = `
        <div class="form-group">
          <label>${t('moodleNewQuestion.optionsLabel')}</label>
          <div id="optionsList">
            <div class="option-item">
              <input type="radio" name="correctOption" value="0" checked>
              <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionA')}">
              <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
            </div>
            <div class="option-item">
              <input type="radio" name="correctOption" value="1">
              <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionB')}">
              <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
            </div>
            <div class="option-item">
              <input type="radio" name="correctOption" value="2">
              <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionC')}">
              <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
            </div>
            <div class="option-item">
              <input type="radio" name="correctOption" value="3">
              <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionD')}">
              <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
            </div>
          </div>
          <button type="button" onclick="MoodleUI.addQuestionOption()" class="btn-sm">${t('moodleNewQuestion.addOption')}</button>
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
    const div = document.createElement('div');
    div.className = 'option-item';
    div.innerHTML = `
      <input type="radio" name="correctOption" value="${count}">
      <input type="text" class="option-input" placeholder="${t('moodleNewQuestion.optionLabel')} ${String.fromCharCode(65 + count)}">
      <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
    `;
    list.appendChild(div);
  },

  /**
   * 儲存新題目
   */
  async saveNewQuestion() {
    const type = document.getElementById('questionType').value;
    const questionText = document.getElementById('questionText').value.trim();
    const difficulty = document.getElementById('questionDifficulty').value;
    const tags = document.getElementById('questionTags').value.split(',').map(t => t.trim()).filter(t => t);
    const explanation = document.getElementById('questionExplanation').value.trim();

    if (!questionText) {
      showToast(t('moodleNewQuestion.contentRequired'));
      return;
    }

    let questionData = {
      type,
      questionText,
      difficulty,
      tags,
      explanation
    };

    // 根據題型收集答案資料
    if (type === 'multiple_choice') {
      const optionInputs = document.querySelectorAll('.option-input');
      const correctRadio = document.querySelector('input[name="correctOption"]:checked');
      questionData.options = Array.from(optionInputs).map(i => i.value.trim()).filter(v => v);
      questionData.correctAnswer = correctRadio ? parseInt(correctRadio.value) : 0;

      if (questionData.options.length < 2) {
        showToast(t('moodleNewQuestion.minOptions'));
        return;
      }
    } else if (type === 'true_false') {
      const tfRadio = document.querySelector('input[name="tfAnswer"]:checked');
      questionData.correctAnswer = tfRadio?.value === 'true';
    } else if (type === 'short_answer' || type === 'fill_blank') {
      questionData.correctAnswers = document.getElementById('correctAnswers')?.value.split(',').map(a => a.trim()).filter(a => a);
      questionData.caseSensitive = document.getElementById('caseSensitive')?.checked;
    } else if (type === 'essay') {
      questionData.referenceAnswer = document.getElementById('referenceAnswer')?.value.trim();
      questionData.minWords = parseInt(document.getElementById('minWords')?.value) || 0;
    }

    try {
      const result = await API.questionBank.create(questionData);
      if (result.success) {
        showToast(t('moodleNewQuestion.created'));
        this.closeModal('createQuestionModal');
        this.openQuestionBank();
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
        this.openQuestionBank();
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
    try {
      const result = await API.questionBank.export(this.currentQuestionBankFilters);
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
    if (!courseId) {
      courseId = this.currentCourseId;
      if (!courseId) {
        // 顯示課程選擇器 modal
        let courseOptions = '';
        try {
          const result = await API.courses.list();
          const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
          courses.forEach(c => {
            courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`;
          });
        } catch (e) { /* ignore */ }
        if (!courseOptions) { showToast(t('moodleGradebook.noCourses')); return; }
        const selectorModal = document.createElement('div');
        selectorModal.id = 'courseSelectForCompletionModal';
        selectorModal.className = 'modal-overlay';
        selectorModal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h3>${t('moodleCompletion.selectCourse')}</h3>
              <button onclick="MoodleUI.closeModal('courseSelectForCompletionModal')" class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>${t('moodleCompletion.selectCourseLabel')}</label>
                <select id="completionCourseSelect">${courseOptions}</select>
              </div>
            </div>
            <div class="modal-footer">
              <button onclick="MoodleUI.closeModal('courseSelectForCompletionModal')" class="btn-secondary">${t('common.cancel')}</button>
              <button onclick="MoodleUI.closeModal('courseSelectForCompletionModal');MoodleUI.openCourseCompletionSettings(document.getElementById('completionCourseSelect').value)" class="btn-primary">確認</button>
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
    modal.className = 'modal-overlay';

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
        <div class="role-item ${role.isSystem ? 'system-role' : ''}"
             onclick="MoodleUI.selectRole('${role.id || role.roleId}')"
             data-role-id="${role.id || role.roleId}">
          <span class="role-icon">${roleIcons[role.shortName] || '🔐'}</span>
          <div class="role-info">
            <span class="role-name">${role.name}</span>
            <span class="role-type">${role.isSystem ? t('moodleRoles.systemRole') : t('moodleRoles.customRole')}</span>
          </div>
          <span class="role-user-count">${role.userCount || 0} ${t('moodleRoles.usersCount')}</span>
        </div>
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
      const createdAtText = role.createdAt
        ? new Date(role.createdAt).toLocaleDateString('zh-TW')
        : '-';

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
    modal.className = 'modal-overlay';

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
        ${children.map(cat => `
          <li class="category-tree-item">
            <div class="category-node" onclick="MoodleUI.selectCategory('${cat.id}')" data-category-id="${cat.id}">
              <span class="expand-icon" onclick="event.stopPropagation(); MoodleUI.toggleCategoryExpand(this)">
                ${categories.some(c => c.parentId === cat.id) ? '▶' : '•'}
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              <span class="category-name">${cat.name}</span>
              <span class="course-count">(${cat.courseCount || 0})</span>
            </div>
            <div class="category-children" hidden>
              ${this.renderCategoryTree(categories, cat.id, level + 1)}
            </div>
          </li>
        `).join('')}
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
      icon.textContent = isExpanded ? '▶' : '▼';
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
              <span class="value">${new Date(category.createdAt).toLocaleDateString('zh-TW')}</span>
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
    modal.className = 'modal-overlay';

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
      modal.className = 'modal-overlay';

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
    this.ensureDynamicUiMetricsObserver();
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
    showView('rubrics');
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
            <div class="rubric-card" onclick="MoodleUI.viewRubricDetail(${this.toInlineActionValue(r.rubricId || r.id)})">
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
            </div>
          `).join('')}
      </div>
      </div>`;
  },

  async viewRubricDetail(rubricId) {
    const container = document.getElementById('rubricsContent');
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const result = await API.rubrics.get(rubricId);
      if (!result.success) { container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`; return; }
      const r = result.data;
      const criteria = r.criteria || [];
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
            <button onclick="MoodleUI.deleteRubric(${this.toInlineActionValue(rubricId)})" class="btn-sm btn-danger">${t('moodleGradeCategory.delete')}</button>
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

  openCreateRubricModal() {
    const modal = document.createElement('div');
    modal.id = 'createRubricModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content rubric-builder-modal">
        <div class="modal-header">
          <h3>${t('moodleRubrics.createTitle')}</h3>
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="rubric-builder-section">
            <div class="form-group">
              <label>${t('common.name')} *</label>
              <input type="text" id="rubricName" placeholder="${t('moodleRubrics.namePlaceholder')}">
            </div>
            <div class="form-group">
              <label>${t('common.description')}</label>
              <textarea id="rubricDescription" rows="2" placeholder="${t('moodleRubrics.descPlaceholder')}"></textarea>
            </div>
            <div class="form-group">
              <label>${t('common.status')}</label>
              <select id="rubricStatus"><option value="draft">${t('common.draft')}</option><option value="active">${t('common.active')}</option></select>
            </div>
            <div class="rubric-builder-heading">
              <h4>${t('moodleRubrics.gradingCriteria')}</h4>
              <button onclick="MoodleUI.addRubricCriterion()" class="btn-sm btn-secondary">${t('moodleRubrics.addCriterion')}</button>
            </div>
            <div id="rubricCriteriaList" class="rubric-builder-list">
              ${this.renderRubricCriterionBuilder()}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveRubric()" class="btn-primary">${t('common.create')}</button>
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
      const result = await API.rubrics.create({
        name,
        description: document.getElementById('rubricDescription')?.value || '',
        status: document.getElementById('rubricStatus')?.value || 'draft',
        criteria
      });
      if (result.success) {
        showToast(t('moodleRubrics.created'));
        this.closeModal('createRubricModal');
        this.openRubricsManager();
      } else { showToast(result.error || t('common.createFailed')); }
    } catch (error) {
      console.error('Save rubric error:', error);
      showToast(t('moodleRubrics.createError'));
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
    modal.className = 'modal-overlay';
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
   * 徽章系統
   */
  currentBadgesFilter: 'all',

  async openBadges() {
    const container = document.getElementById('badgesContent');
    if (!container) return;
    showView('badges');
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const [badgesResult, statsResult] = await Promise.all([
        API.badges.list(),
        API.badges.getStats()
      ]);
      const badges = badgesResult.success ? (Array.isArray(badgesResult.data) ? badgesResult.data : (badgesResult.data?.badges || [])) : [];
      const stats = statsResult.success ? statsResult.data : {};
      this._badgesData = badges;
      this._badgesStats = stats;
      this.renderBadgesPage(container, badges, stats);
    } catch (error) {
      console.error('Open badges error:', error);
      container.innerHTML = `<div class="error">${t('moodleBadges.loadFailed')}</div>`;
    }
  },

  renderBadgesPage(container, badges, stats) {
    const user = (typeof API !== 'undefined' && API.getCurrentUser) ? API.getCurrentUser() : null;
    const isEnglish = I18n.getLocale() === 'en';
    const canManage = !!(user && (user.isAdmin || ['manager', 'coursecreator', 'educator', 'trainer', 'creator', 'teacher', 'assistant'].includes(user.role)));
    const filtered = this.currentBadgesFilter === 'all' ? badges :
      badges.filter(b => b.status === this.currentBadgesFilter || b.type === this.currentBadgesFilter);

    container.innerHTML = `
      <div class="badges-container">
        <div class="badges-header">
          <h2>${t('moodleBadges.title')}</h2>
          ${canManage ? `<button onclick="MoodleUI.openCreateBadgeModal()" class="btn-primary">${t('moodleBadges.createBadge')}</button>` : ''}
        </div>
        <div class="badge-stats-grid">
          <div class="badge-stat-card tone-violet">
            <div class="value">${stats.totalBadges || badges.length}</div>
            <div class="label">${t('moodleBadges.totalBadges')}</div>
          </div>
          <div class="badge-stat-card tone-rose">
            <div class="value">${stats.activeBadges || 0}</div>
            <div class="label">${t('moodleBadges.activeBadges')}</div>
          </div>
          <div class="badge-stat-card tone-sky">
            <div class="value">${stats.totalIssued || 0}</div>
            <div class="label">${t('moodleBadges.totalIssued')}</div>
          </div>
        </div>
        <div class="badges-tabs">
        ${['all','active','draft','course','site'].map(f => `
          <button class="badge-tab ${this.currentBadgesFilter === f ? 'active' : ''}"
                  onclick="MoodleUI.currentBadgesFilter='${f}';MoodleUI.renderBadgesPage(document.getElementById('badgesContent'),MoodleUI._badgesData,MoodleUI._badgesStats)">
            ${{all:t('common.all'),active:t('common.active'),draft:t('common.draft'),course:t('moodleBadges.course'),site:t('moodleBadges.site')}[f]}
          </button>
        `).join('')}
        </div>
        <div class="badges-grid">
        ${filtered.length === 0 ? this.renderActivityEmptyState({
          icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
          title: t('moodleBadges.noBadges'),
          hint: isEnglish ? 'Create a badge or adjust the current filter.' : '建立新徽章，或切換目前的篩選條件。'
        }) :
          filtered.map(b => `
            <div class="badge-card ${b.status !== 'active' ? 'locked' : ''}"
                 onclick="MoodleUI.viewBadgeDetail(${this.toInlineActionValue(b.badgeId || b.id)})">
              <div class="badge-icon ${this.getSurfaceToneClass(b.badgeId || b.id || b.name)}">
                ${b.icon || '🏆'}
              </div>
              <h3 class="badge-name">${this.escapeText(b.name || t('common.unnamed'))}</h3>
              <p class="badge-description">${this.escapeText(this.truncateText(b.description || t('common.noDescription'), 96))}</p>
              <span class="badge-status-pill ${b.status === 'active' ? 'is-active' : 'is-draft'}">${this.getBadgeStatusLabel(b.status)}</span>
              <div class="badge-criteria">
                <span>${t('moodleBadges.typeLabel')}：${this.escapeText(this.getBadgeTypeLabel(b.type))}</span>
                <span>${t('moodleBadges.issuedLabel')}：${b.issuedCount || 0}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  },

  async viewBadgeDetail(badgeId) {
    const container = document.getElementById('badgesContent');
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const user = (typeof API !== 'undefined' && API.getCurrentUser) ? API.getCurrentUser() : null;
      const canManage = !!(user && (user.isAdmin || ['manager', 'coursecreator', 'educator', 'trainer', 'creator', 'teacher', 'assistant'].includes(user.role)));
      const [badgeResult, recipientsResult] = await Promise.all([
        API.badges.get(badgeId),
        API.badges.getRecipients(badgeId)
      ]);
      if (!badgeResult.success) { container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`; return; }
      const b = badgeResult.data;
      const recipients = recipientsResult.success ? (Array.isArray(recipientsResult.data) ? recipientsResult.data : (recipientsResult.data?.recipients || [])) : [];
      const isEnglish = I18n.getLocale() === 'en';

      container.innerHTML = `
        <div class="badges-container">
          <button onclick="MoodleUI.openBadges()" class="btn-back">${t('common.backToList')}</button>
          <div class="badge-detail-page">
          <div class="badge-detail-header-row">
            <div class="badge-detail-icon ${this.getSurfaceToneClass(b.badgeId || b.id || b.name)}">
              ${b.icon || '🏆'}
            </div>
            <div class="badge-detail-main">
              <div class="badge-detail-name">${this.escapeText(b.name || t('common.unnamed'))}</div>
              <div class="badge-detail-description">${this.escapeText(b.description || t('common.noDescription'))}</div>
              <div class="badge-summary-tags">
                <span class="badge-status-pill ${b.status === 'active' ? 'is-active' : 'is-draft'}">${this.getBadgeStatusLabel(b.status)}</span>
                <span class="badge-summary-pill">${t('moodleBadges.typeLabel')}：${this.escapeText(this.getBadgeTypeLabel(b.type))}</span>
                <span class="badge-summary-pill">${t('moodleBadges.issuedLabel')}：${b.issuedCount || 0}</span>
              </div>
            </div>
            ${canManage ? `
            <div class="badge-detail-actions">
              <button onclick="MoodleUI.openIssueBadgeModal(${this.toInlineActionValue(badgeId)})" class="btn-primary btn-sm">${t('moodleBadges.issueBadge')}</button>
              <button onclick="MoodleUI.deleteBadge(${this.toInlineActionValue(badgeId)})" class="btn-sm btn-danger">${t('moodleGradeCategory.delete')}</button>
            </div>
            ` : ''}
          </div>
          <div class="badge-detail-info">
            <div class="badge-info-item">
              <label>${t('moodleBadges.typeLabel')}</label>
              <span>${this.escapeText(this.getBadgeTypeLabel(b.type))}</span>
            </div>
            <div class="badge-info-item">
              <label>${t('common.status')}</label>
              <span>${this.getBadgeStatusLabel(b.status)}</span>
            </div>
            <div class="badge-info-item">
              <label>${t('moodleBadges.issuedLabel')}</label>
              <span>${b.issuedCount || 0}</span>
            </div>
            <div class="badge-info-item">
              <label>${t('moodleBadges.recipients')}</label>
              <span>${recipients.length}</span>
            </div>
          </div>
        ${(b.criteria || []).length > 0 ? `
          <div class="badge-criteria-panel">
            <h4>${t('moodleBadges.criteria')}</h4>
            <ul>${b.criteria.map(c => `<li>${this.escapeText(c.description || c.type || t('moodleBadges.criterion'))}</li>`).join('')}</ul>
          </div>
        ` : ''}
        <div class="badge-recipients-section">
          <div class="section-title-row">
            <h3>${t('moodleBadges.recipients')}（${recipients.length}）</h3>
          </div>
        ${recipients.length === 0 ? this.renderActivityEmptyState({
          icon: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a7.5 7.5 0 0113 0"/></svg>',
          title: t('moodleBadges.noRecipients'),
          hint: isEnglish ? 'Issue this badge to learners when they meet the criteria.' : '當學員達成條件後，就可以發送這枚徽章。'
        }) : `
          <div class="badge-table-shell">
            <table class="rubric-table">
              <thead><tr>
                <th>${t('moodleH5p.uniqueUsers')}</th>
                <th>${t('moodleBadges.issueDateCol')}</th>
                <th>${t('common.actions')}</th>
              </tr></thead>
              <tbody>
                ${recipients.map(r => `
                  <tr>
                    <td>${this.escapeText(r.userName || r.userId || '—')}</td>
                    <td>${this.escapeText(this.formatDate(r.issuedAt || r.createdAt, 'datetime'))}</td>
                    <td class="table-action-cell">
                      ${canManage ? `<button onclick="MoodleUI.revokeBadge(${this.toInlineActionValue(badgeId)},${this.toInlineActionValue(r.userId)})" class="btn-sm btn-danger">${t('moodleBadges.revoke')}</button>` : '—'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
        </div>
        </div>
        </div>`;
    } catch (error) {
      console.error('View badge detail error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  openCreateBadgeModal() {
    const modal = document.createElement('div');
    modal.id = 'createBadgeModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleBadges.createTitle')}</h3>
          <button onclick="MoodleUI.closeModal('createBadgeModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleBadges.nameLabel')} *</label>
            <input type="text" id="badgeName" placeholder="${t('moodleBadges.namePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="badgeDescription" rows="2" placeholder="${t('moodleBadges.descPlaceholder')}"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleBadges.iconLabel')}</label>
              <select id="badgeIcon">
                <option value="🏆">🏆 ${t('moodleBadges.iconTrophy')}</option><option value="⭐">⭐ ${t('moodleBadges.iconStar')}</option>
                <option value="🎓">🎓 ${t('moodleBadges.iconGradCap')}</option><option value="🏅">🏅 ${t('moodleBadges.iconMedal')}</option>
                <option value="💎">💎 ${t('moodleBadges.iconDiamond')}</option><option value="🌟">🌟 ${t('moodleBadges.iconShiningStar')}</option>
                <option value="📚">📚 ${t('moodleBadges.iconBooks')}</option><option value="🎯">🎯 ${t('moodleBadges.iconTarget')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('common.type')}</label>
              <select id="badgeType">
                <option value="course">${t('moodleBadges.typeCourse')}</option><option value="site">${t('moodleBadges.typeSite')}</option><option value="manual">${t('moodleBadges.typeManual')}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>${t('common.status')}</label>
            <select id="badgeStatus"><option value="draft">${t('common.draft')}</option><option value="active">${t('common.active')}</option></select>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createBadgeModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveBadge()" class="btn-primary">${t('moodleBadges.createBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createBadgeModal'); };
  },

  async saveBadge() {
    const name = document.getElementById('badgeName')?.value?.trim();
    if (!name) { showToast(t('common.nameRequired')); return; }
    try {
      const result = await API.badges.create({
        name,
        description: document.getElementById('badgeDescription')?.value || '',
        icon: document.getElementById('badgeIcon')?.value || '🏆',
        type: document.getElementById('badgeType')?.value || 'course',
        status: document.getElementById('badgeStatus')?.value || 'draft'
      });
      if (result.success) {
        showToast(t('moodleBadges.created'));
        this.closeModal('createBadgeModal');
        this.openBadges();
      } else { showToast(result.error || t('common.createFailed')); }
    } catch (error) { showToast(t('moodleBadges.createError')); }
  },

  openIssueBadgeModal(badgeId) {
    const modal = document.createElement('div');
    modal.id = 'issueBadgeModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${t('moodleBadges.issueTitle')}</h3>
          <button onclick="MoodleUI.closeModal('issueBadgeModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleBadges.userIdsLabel')}</label>
            <input type="text" id="issueBadgeUserIds" placeholder="${t('moodleBadges.userIdsPlaceholder')}">
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('issueBadgeModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.issueBadge('${badgeId}')" class="btn-primary">${t('moodleBadges.issueBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('issueBadgeModal'); };
  },

  async issueBadge(badgeId) {
    const userIdsStr = document.getElementById('issueBadgeUserIds')?.value?.trim();
    if (!userIdsStr) { showToast(t('moodleBadges.enterUserId')); return; }
    const userIds = userIdsStr.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const result = await API.badges.issue(badgeId, { userIds });
      if (result.success) {
        showToast(`${t('moodleBadges.issuedTo')} ${result.data?.issued || userIds.length} ${t('moodleBadges.users')}`);
        this.closeModal('issueBadgeModal');
        this.viewBadgeDetail(badgeId);
      } else { showToast(result.error || t('common.issueFailed')); }
    } catch (error) { showToast(t('common.issueFailed')); }
  },

  async revokeBadge(badgeId, userId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleBadges.confirmRevoke'),
      confirmLabel: t('common.confirm'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.badges.revoke(badgeId, userId);
      if (result.success) { showToast(t('moodleBadges.revoked')); this.viewBadgeDetail(badgeId); }
      else { showToast(result.error || t('common.revokeFailed')); }
    } catch (error) { showToast(t('common.revokeFailed')); }
  },

  async deleteBadge(badgeId) {
    const confirmed = await showConfirmDialog({
      message: t('moodleBadges.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.badges.delete(badgeId);
      if (result.success) { showToast(t('common.deleted')); this.openBadges(); }
      else { showToast(result.error || t('common.deleteFailed')); }
    } catch (error) { showToast(t('common.deleteFailed')); }
  },

  /**
   * 學習路徑
   */
  async openLearningPaths() {
    const container = document.getElementById('learningPathsContent');
    if (!container) return;
    showView('learningPaths');
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const result = await API.learningPaths.list();
      const paths = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.paths || [])) : [];
      this._learningPathsData = paths;
      this.renderLearningPathsPage(container, paths);
    } catch (error) {
      console.error('Open learning paths error:', error);
      container.innerHTML = `<div class="error">${t('moodlePaths.loadFailed')}</div>`;
    }
  },

  renderLearningPathsPage(container, paths) {
    const user = (typeof API !== 'undefined' && API.getCurrentUser) ? API.getCurrentUser() : null;
    const canManage = !!(user && (user.isAdmin || ['manager', 'coursecreator', 'educator', 'trainer', 'creator', 'teacher', 'assistant'].includes(user.role)));

    container.innerHTML = `
      <div class="learning-paths-container">
        <div class="learning-paths-header">
          <h2>${t('moodlePaths.title')}</h2>
          ${canManage ? `<button onclick="MoodleUI.openCreateLearningPathModal()" class="btn-primary">${t('moodlePaths.create')}</button>` : ''}
        </div>
      <div class="learning-paths-grid">
        ${paths.length === 0 ? this.renderActivityEmptyState({
          icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
          title: t('moodlePaths.noPaths')
        }) :
          paths.map(p => `
            ${(() => {
              const difficultyMeta = this.getDifficultyMeta(p.difficulty);
              return `
            <div class="learning-path-card"
                 onclick="MoodleUI.viewLearningPathDetail(${this.toInlineActionValue(p.pathId || p.id)})">
              <div class="path-thumbnail ${difficultyMeta.toneClass}">
                <span class="path-difficulty ${difficultyMeta.className}">${this.escapeText(difficultyMeta.label)}</span>
                <span class="path-thumbnail-icon">${difficultyMeta.icon}</span>
              </div>
              <div class="path-content">
                <div class="path-title">${this.escapeText(p.name || p.title || t('common.unnamed'))}</div>
                <div class="path-description">${this.escapeText(this.truncateText(p.description || t('common.noDescription'), 120))}</div>
                <div class="path-stats">
                  <span>${t('moodlePaths.coursesLabel')}${(p.courses || []).length}</span>
                  <span>${t('moodlePaths.durationLabel')}${this.escapeText(p.duration || '—')}</span>
                  <span>${t('moodlePaths.enrolledLabel')}${p.enrolledCount || 0}</span>
                </div>
              ${p.progress != null ? `
                <div class="path-progress">
                  <div class="progress-bar">
                    <div class="progress-fill" data-progress-width="${this.clampProgressValue(p.progress)}"></div>
                  </div>
                  <div class="progress-text">${t('moodlePaths.progress')} ${Math.round(p.progress)}%</div>
                </div>
              ` : ''}
            </div>
            `;
            })()}
          `).join('')}
      </div>
      </div>`;
    this.applyDynamicUiMetrics(container);
  },

  async viewLearningPathDetail(pathId) {
    const container = document.getElementById('learningPathsContent');
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const user = (typeof API !== 'undefined' && API.getCurrentUser) ? API.getCurrentUser() : null;
      const canManage = !!(user && (user.isAdmin || ['manager', 'coursecreator', 'educator', 'trainer', 'creator', 'teacher', 'assistant'].includes(user.role)));
      const [pathResult, reportResult] = await Promise.all([
        API.learningPaths.get(pathId),
        API.learningPaths.getReport(pathId).catch(() => ({ success: false }))
      ]);
      if (!pathResult.success) { container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`; return; }
      const p = pathResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const courses = p.courses || [];
      const progress = p.userProgress || p.progress;
      const overallProgress = Math.round(typeof progress === 'object' ? progress.overallProgress || 0 : progress || 0);
      const difficultyMeta = this.getDifficultyMeta(p.difficulty);
      const isEnglish = I18n.getLocale() === 'en';

      container.innerHTML = `
        <div class="learning-path-detail">
          <button onclick="MoodleUI.openLearningPaths()" class="btn-back">${t('common.backToList')}</button>
          <div class="path-detail-header">
            <div class="path-detail-image ${difficultyMeta.toneClass}">
              <div class="path-thumbnail ${difficultyMeta.toneClass}">
                <span class="path-difficulty ${difficultyMeta.className}">${this.escapeText(difficultyMeta.label)}</span>
                <span class="path-thumbnail-icon">${difficultyMeta.icon}</span>
              </div>
            </div>
            <div class="path-detail-info">
              <h1>${this.escapeText(p.name || p.title || t('common.unnamed'))}</h1>
              <p>${this.escapeText(p.description || '')}</p>
              <div class="path-summary-grid">
                <div class="path-summary-card">
                  <label>${t('moodlePaths.coursesLabel')}</label>
                  <strong>${courses.length}</strong>
                </div>
                <div class="path-summary-card">
                  <label>${t('moodlePaths.durationLabel')}</label>
                  <strong>${this.escapeText(p.duration || '—')}</strong>
                </div>
                <div class="path-summary-card">
                  <label>${t('moodlePaths.enrolledLabel')}</label>
                  <strong>${p.enrolledCount || report.totalEnrolled || 0}</strong>
                </div>
                <div class="path-summary-card">
                  <label>${t('moodlePaths.progress')}</label>
                  <strong>${overallProgress}%</strong>
                </div>
              </div>
              <div class="path-detail-actions">
                <button onclick="MoodleUI.enrollLearningPath(${this.toInlineActionValue(pathId)})" class="btn-primary btn-sm">${t('moodlePaths.enroll')}</button>
                ${canManage ? `<button onclick="MoodleUI.deleteLearningPath(${this.toInlineActionValue(pathId)})" class="btn-sm btn-danger">${t('moodleGradeCategory.delete')}</button>` : ''}
              </div>
            </div>
          </div>
        ${progress != null ? `
          <div class="path-progress-panel">
            <div class="path-progress-heading">
              <span>${t('moodlePaths.overallProgress')}</span><span>${overallProgress}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" data-progress-width="${this.clampProgressValue(overallProgress)}"></div>
            </div>
          </div>
        ` : ''}
        <div class="path-courses-section">
        <h3>${t('moodlePaths.courseSequence')}（${courses.length} ${t('moodlePaths.courseUnit')}）</h3>
        <div class="path-course-list">
          ${courses.map((c, idx) => `
            ${(() => {
              const statusLabel = c.completed
                ? (t('common.completed') || (isEnglish ? 'Completed' : '已完成'))
                : ((c.progress || 0) > 0
                  ? (t('common.inProgress') || (isEnglish ? 'In progress' : '進行中'))
                  : (t('common.locked') || (isEnglish ? 'Locked' : '未解鎖')));
              return `
            <div class="path-course-item ${c.completed ? 'is-complete' : ''}">
              <div class="course-order ${c.completed ? 'completed' : ''}">${c.completed ? '✓' : idx + 1}</div>
              <div class="course-info">
                <h4>${this.escapeText(c.title || c.name || `${t('moodlePaths.courseDefault')} ${idx + 1}`)}</h4>
                <p>${this.escapeText(c.description || '')}</p>
              </div>
              <div class="course-status ${c.completed ? 'completed' : ((c.progress || 0) > 0 ? 'in-progress' : 'locked')}">
                ${statusLabel}
              </div>
            </div>
            `;
            })()}
          `).join('')}
        </div>
        </div>
        ${report.totalEnrolled ? `
          <div class="path-report-grid">
            <div class="path-summary-card">
              <label>${t('moodlePaths.totalEnrolled')}</label>
              <strong>${report.totalEnrolled}</strong>
            </div>
            <div class="path-summary-card">
              <label>${t('moodlePaths.completionRateLabel')}</label>
              <strong>${report.completionRate ? Math.round(report.completionRate) + '%' : '—'}</strong>
            </div>
          </div>
        ` : ''}
        </div>`;
      this.applyDynamicUiMetrics(container);
    } catch (error) {
      console.error('View learning path detail error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  async openCreateLearningPathModal() {
    let courseOptions = '';
    try {
      const result = await API.courses.list();
      const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
      courses.forEach(c => {
        courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`;
      });
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createLearningPathModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodlePaths.createTitle')}</h3>
          <button onclick="MoodleUI.closeModal('createLearningPathModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodlePaths.nameLabel')} *</label>
            <input type="text" id="lpName" placeholder="${t('moodlePaths.namePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="lpDescription" rows="2" placeholder="${t('moodlePaths.descPlaceholder')}"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleNewQuestion.diffLabel')}</label>
              <select id="lpDifficulty">
                <option value="beginner">${t('moodlePaths.beginner')}</option>
                <option value="intermediate">${t('moodlePaths.intermediate')}</option>
                <option value="advanced">${t('moodlePaths.advanced')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('moodlePaths.estimatedDuration')}</label>
              <input type="text" id="lpDuration" placeholder="${t('moodlePaths.durationPlaceholder')}">
            </div>
          </div>
          <div class="form-group">
            <label>${t('moodlePaths.selectCourses')}</label>
            <select id="lpCourses" class="multi-select-tall" multiple>
              ${courseOptions}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createLearningPathModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveLearningPath()" class="btn-primary">${t('common.create')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createLearningPathModal'); };
  },

  async saveLearningPath() {
    const name = document.getElementById('lpName')?.value?.trim();
    if (!name) { showToast(t('common.nameRequired')); return; }
    const select = document.getElementById('lpCourses');
    const courseIds = select ? Array.from(select.selectedOptions).map(o => o.value) : [];
    try {
      const result = await API.learningPaths.create({
        name,
        description: document.getElementById('lpDescription')?.value || '',
        difficulty: document.getElementById('lpDifficulty')?.value || 'beginner',
        duration: document.getElementById('lpDuration')?.value || '',
        courseIds
      });
      if (result.success) {
        showToast(t('moodlePaths.created'));
        this.closeModal('createLearningPathModal');
        this.openLearningPaths();
      } else { showToast(result.error || t('common.createFailed')); }
    } catch (error) { showToast(t('moodlePaths.createError')); }
  },

  async enrollLearningPath(pathId) {
    try {
      const result = await API.learningPaths.enroll(pathId);
      if (result.success) { showToast(t('moodlePaths.enrollSuccess')); this.viewLearningPathDetail(pathId); }
      else { showToast(result.error || t('common.enrollFailed')); }
    } catch (error) { showToast(t('moodleEnroll.failed')); }
  },

  async deleteLearningPath(pathId) {
    const confirmed = await showConfirmDialog({
      message: t('moodlePaths.confirmDelete'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.learningPaths.delete(pathId);
      if (result.success) { showToast(t('common.deleted')); this.openLearningPaths(); }
      else { showToast(result.error || t('common.deleteFailed')); }
    } catch (error) { showToast(t('common.deleteFailed')); }
  },

  /**
   * 稽核日誌
   */
  currentAuditFilters: { eventType: '', severity: '', page: 1 },

  async openAuditLogs() {
    const container = document.getElementById('auditLogsContent');
    if (!container) return;
    showView('auditLogs');
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
                    <td class="log-time">${this.escapeText(this.formatDate(log.createdAt || log.timestamp, 'datetime'))}</td>
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
    showView('h5pManager');
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
              <article class="h5p-card" onclick="MoodleUI.viewH5pDetail(${this.toInlineActionValue(content.contentId || content.id)})">
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
              </article>
            `).join('')}
        </div>
      </div>`;
  },

  async viewH5pDetail(contentId) {
    const container = document.getElementById('h5pManagerContent');
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;
    try {
      const [contentResult, reportResult, embedResult] = await Promise.all([
        API.h5p.get(contentId),
        API.h5p.getReport(contentId).catch(() => ({ success: false })),
        API.h5p.getEmbed(contentId).catch(() => ({ success: false }))
      ]);
      if (!contentResult.success) { container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`; return; }
      const content = contentResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const embed = embedResult.success ? embedResult.data : {};
      const contentSubtitle = [content.contentType || 'H5P', content.description || '']
        .filter(Boolean)
        .join(' · ');

      container.innerHTML = `
        <div class="management-detail-page">
          ${this.renderManagementDetailHeader({
            backAction: 'MoodleUI.openH5pManager()',
            backLabel: t('common.back'),
            kicker: 'H5P',
            title: content.title || t('common.unnamed'),
            subtitle: contentSubtitle,
            actions: [
              {
                label: t('common.duplicate'),
                className: 'btn-secondary btn-sm',
                onclick: `MoodleUI.duplicateH5pContent(${this.toInlineActionValue(contentId)})`
              },
              {
                label: t('moodleGradeCategory.delete'),
                className: 'btn-sm btn-danger',
                onclick: `MoodleUI.deleteH5pContent(${this.toInlineActionValue(contentId)})`
              }
            ]
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
      const result = await API.courses.list();
      const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
      courses.forEach(c => { courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`; });
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createH5pModal';
    modal.className = 'modal-overlay';
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
    showView('ltiManager');
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
              <article class="lti-tool-card" onclick="MoodleUI.viewLtiToolDetail(${this.toInlineActionValue(tool.toolId || tool.id)})">
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
                    <button type="button" class="btn-launch" onclick="event.stopPropagation();MoodleUI.launchLtiTool(${this.toInlineActionValue(tool.toolId || tool.id)})">${t('moodleScorm.launch')}</button>
                    <button type="button" class="btn-manage" onclick="event.stopPropagation();MoodleUI.viewLtiToolDetail(${this.toInlineActionValue(tool.toolId || tool.id)})">${t('common.view')}</button>
                  </div>
                </div>
              </article>
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
                onclick: `MoodleUI.launchLtiTool(${this.toInlineActionValue(toolId)})`
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
                    <td>${this.escapeText(this.formatDate(grade.createdAt || grade.timestamp, 'datetime'))}</td>
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
    modal.className = 'modal-overlay';
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

  async launchLtiTool(toolId) {
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
    showView('scormManager');
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
              <article class="scorm-card" onclick="MoodleUI.viewScormDetail(${this.toInlineActionValue(pkg.packageId || pkg.id)})">
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
              </article>
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
                    <td>${this.escapeText(this.formatDate(attempt.startedAt || attempt.createdAt, 'datetime'))}</td>
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
      const result = await API.courses.list();
      const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
      courses.forEach(c => { courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`; });
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createScormModal';
    modal.className = 'modal-overlay';
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
    modal.className = 'modal-overlay';
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
                <option value="weekly">${t('moodleCourseCreate.formatWeekly')}</option>
                <option value="social">${t('moodleCourseCreate.formatSocial')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('moodleCourseCreate.visibilityLabel')}</label>
              <select id="newCourseVisibility">
                <option value="visible">${t('common.visible')}</option>
                <option value="hidden">${t('common.hidden')}</option>
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
        categoryId: document.getElementById('newCourseCategory')?.value || undefined,
        format: document.getElementById('newCourseFormat')?.value || 'topics',
        visibility: document.getElementById('newCourseVisibility')?.value || 'visible',
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
    let courseOptions = `<option value="">${t('moodleCourseCreate.selectCourse')}</option>`;
    try {
      const result = await API.courses.list();
      if (result.success && result.data) {
        const courses = Array.isArray(result.data) ? result.data : (result.data.courses || []);
        courses.forEach(c => {
          const cid = c.courseId || c.id;
          courseOptions += `<option value="${cid}" ${cid === preselectedCourseId ? 'selected' : ''}>${c.title || c.name}</option>`;
        });
      }
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createAssignmentModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleAssignmentCreate.title')}</h3>
          <button onclick="MoodleUI.closeModal('createAssignmentModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleAssignmentCreate.titleLabel')} *</label>
            <input type="text" id="newAssignmentTitle" placeholder="${t('moodleAssignmentCreate.titlePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('moodleAssignmentCreate.courseLabel')} *</label>
            <select id="newAssignmentCourse">${courseOptions}</select>
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="newAssignmentDescription" rows="3" placeholder="${t('moodleAssignmentCreate.descPlaceholder')}"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleAddActivity.dueDateLabel')}</label>
              <input type="datetime-local" id="newAssignmentDueDate">
            </div>
            <div class="form-group">
              <label>${t('moodleRubrics.maxScore')}</label>
              <input type="number" id="newAssignmentMaxScore" value="100" min="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleAddActivity.submitTypeLabel')}</label>
              <select id="newAssignmentSubmitType">
                <option value="text">${t('moodleAddActivity.submitTypeText')}</option>
                <option value="file">${t('moodleAddActivity.submitTypeFile')}</option>
                <option value="both">${t('moodleAssignmentCreate.typeBoth')}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('moodleAssignmentCreate.allowLate')}</label>
              <select id="newAssignmentLateSubmit">
                <option value="true">${t('common.allow')}</option>
                <option value="false">${t('common.disallow')}</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createAssignmentModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveNewAssignment()" class="btn-primary">${t('moodleAssignmentCreate.createBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createAssignmentModal'); };
  },

  async saveNewAssignment() {
    const title = document.getElementById('newAssignmentTitle')?.value?.trim();
    const courseId = document.getElementById('newAssignmentCourse')?.value;
    if (!title || !courseId) { showToast(t('moodleAssignmentCreate.fieldsRequired')); return; }
    try {
      const result = await API.assignments.create({
        title,
        courseId,
        description: document.getElementById('newAssignmentDescription')?.value || '',
        dueDate: document.getElementById('newAssignmentDueDate')?.value || undefined,
        maxScore: parseInt(document.getElementById('newAssignmentMaxScore')?.value) || 100,
        submissionType: document.getElementById('newAssignmentSubmitType')?.value || 'text',
        allowLateSubmission: document.getElementById('newAssignmentLateSubmit')?.value === 'true'
      });
      if (result.success) {
        showToast(t('moodleAssignmentCreate.success'));
        this.closeModal('createAssignmentModal');
        if (typeof this.loadAssignments === 'function') this.loadAssignments();
      } else {
        showToast(result.error || t('moodleAssignmentCreate.error'));
      }
    } catch (error) {
      console.error('Create assignment error:', error);
      showToast(t('moodleAssignmentCreate.createFailed'));
    }
  },

  /**
   * 建立測驗 Modal
   */
  async showCreateQuizModal(preselectedCourseId) {
    let courseOptions = `<option value="">${t('moodleCourseCreate.selectCourse')}</option>`;
    try {
      const result = await API.courses.list();
      if (result.success && result.data) {
        const courses = Array.isArray(result.data) ? result.data : (result.data.courses || []);
        courses.forEach(c => {
          const cid = c.courseId || c.id;
          courseOptions += `<option value="${cid}" ${cid === preselectedCourseId ? 'selected' : ''}>${c.title || c.name}</option>`;
        });
      }
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createQuizModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleQuizCreate.title')}</h3>
          <button onclick="MoodleUI.closeModal('createQuizModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleQuizCreate.titleLabel')} *</label>
            <input type="text" id="newQuizTitle" placeholder="${t('moodleQuizCreate.titlePlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('moodleQuizCreate.courseLabel')} *</label>
            <select id="newQuizCourse">${courseOptions}</select>
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="newQuizDescription" rows="3" placeholder="${t('moodleQuizCreate.descPlaceholder')}"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleQuizCreate.timeLimitLabel')}</label>
              <input type="number" id="newQuizTimeLimit" value="60" min="0">
            </div>
            <div class="form-group">
              <label>${t('moodleQuizCreate.maxAttemptsLabel')}</label>
              <input type="number" id="newQuizMaxAttempts" value="1" min="1">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t('moodleQuizCreate.openDate')}</label>
              <input type="datetime-local" id="newQuizOpenDate">
            </div>
            <div class="form-group">
              <label>${t('moodleQuizCreate.closeDate')}</label>
              <input type="datetime-local" id="newQuizCloseDate">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createQuizModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.saveNewQuiz()" class="btn-primary">${t('moodleQuizCreate.createBtn')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createQuizModal'); };
  },

  async saveNewQuiz() {
    const title = document.getElementById('newQuizTitle')?.value?.trim();
    const courseId = document.getElementById('newQuizCourse')?.value;
    if (!title || !courseId) { showToast(t('moodleAssignmentCreate.fieldsRequired')); return; }
    try {
      const result = await API.quizzes.create({
        title,
        courseId,
        description: document.getElementById('newQuizDescription')?.value || '',
        timeLimit: parseInt(document.getElementById('newQuizTimeLimit')?.value) || 60,
        maxAttempts: parseInt(document.getElementById('newQuizMaxAttempts')?.value) || 1,
        openDate: document.getElementById('newQuizOpenDate')?.value || undefined,
        closeDate: document.getElementById('newQuizCloseDate')?.value || undefined
      });
      if (result.success) {
        showToast(t('moodleQuizCreate.success'));
        this.closeModal('createQuizModal');
        if (typeof this.loadQuizzes === 'function') this.loadQuizzes();
      } else {
        showToast(result.error || t('moodleQuizCreate.error'));
      }
    } catch (error) {
      console.error('Create quiz error:', error);
      showToast(t('moodleQuizCreate.createFailed'));
    }
  },

  /**
   * 建立公告 Modal
   */
  async showCreateAnnouncementModal() {
    let courseOptions = `<option value="">${t('moodleAnnouncement.siteWide')}</option>`;
    try {
      const result = await API.courses.list();
      if (result.success && result.data) {
        const courses = Array.isArray(result.data) ? result.data : (result.data.courses || []);
        courses.forEach(c => {
          courseOptions += `<option value="${c.courseId || c.id}">${c.title || c.name}</option>`;
        });
      }
    } catch (e) { /* ignore */ }

    const modal = document.createElement('div');
    modal.id = 'createAnnouncementModal';
    modal.className = 'modal-overlay';
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

  /**
   * 格式化日期
   */
  formatDate(dateStr, format) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = n => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    if (format === 'datetime') {
      return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return date;
  },

  // ======== Course Settings ========
  async openCourseSettings(courseId) {
    try {
      const result = await API.courses.get(courseId);
      if (!result.success) { showToast(t('moodleCourseSettings.loadFailed')); return; }
      const c = result.data;
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
              <option value="topics" ${c.format === 'topics' ? 'selected' : ''}>${t('moodleCourseSettings.formatTopics')}</option>
              <option value="weeks" ${c.format === 'weeks' ? 'selected' : ''}>${t('moodleCourseSettings.formatWeeks')}</option>
              <option value="social" ${c.format === 'social' ? 'selected' : ''}>${t('moodleCourseSettings.formatSocial')}</option>
              <option value="singleactivity" ${c.format === 'singleactivity' ? 'selected' : ''}>${t('moodleCourseSettings.formatSingle')}</option>
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
          <div class="form-group">
            <label>
              <input type="checkbox" id="cs_visible" ${c.visible !== false ? 'checked' : ''}> ${t('moodleCourseSettings.visibleToStudents')}
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
      format: document.getElementById('cs_format').value,
      startDate: document.getElementById('cs_startDate').value || null,
      endDate: document.getElementById('cs_endDate').value || null,
      enrollmentKey: document.getElementById('cs_enrollmentKey').value,
      maxEnrollment: document.getElementById('cs_maxEnrollment').value ? parseInt(document.getElementById('cs_maxEnrollment').value) : null,
      visible: document.getElementById('cs_visible').checked
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
            <input type="text" id="es_name" value="${section.name || ''}" required>
          </div>
          <div class="form-group">
            <label>${t('moodleSectionEdit.summaryLabel')}</label>
            <textarea id="es_summary" rows="3">${section.summary || ''}</textarea>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="es_visible" ${section.visible !== false ? 'checked' : ''}> 對學生可見
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
      name: document.getElementById('es_name').value,
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
      const a = result.data;

      this.createModal('editActivityModal', t('moodleActivityEdit.title'), `
        <form onsubmit="event.preventDefault(); MoodleUI.saveActivity('${courseId}', '${activityId}')">
          <div class="form-group">
            <label>${t('moodleActivityEdit.nameLabel')}</label>
            <input type="text" id="ea_name" value="${a.name || ''}" required>
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="ea_description" rows="3">${a.description || ''}</textarea>
          </div>
          ${a.type === 'assignment' || a.type === 'quiz' ? `
            <div class="form-group">
              <label>${t('moodleAddActivity.dueDateLabel')}</label>
              <input type="datetime-local" id="ea_dueDate" value="${a.dueDate ? a.dueDate.slice(0, 16) : ''}">
            </div>
          ` : ''}
          ${a.type === 'url' ? `
            <div class="form-group">
              <label>${t('moodleActivityEdit.urlLabel')}</label>
              <input type="url" id="ea_url" value="${a.url || ''}">
            </div>
          ` : ''}
          ${a.type === 'page' ? `
            <div class="form-group">
              <label>${t('moodleActivityEdit.pageContent')}</label>
              <textarea id="ea_content" rows="6">${a.content || ''}</textarea>
            </div>
          ` : ''}
          <div class="form-group">
            <label>
              <input type="checkbox" id="ea_visible" ${a.visible !== false ? 'checked' : ''}> 對學生可見
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
    const data = {
      name: document.getElementById('ea_name').value,
      description: document.getElementById('ea_description').value,
      visible: document.getElementById('ea_visible').checked
    };
    const dueDate = document.getElementById('ea_dueDate');
    if (dueDate) data.dueDate = dueDate.value ? new Date(dueDate.value).toISOString() : null;
    const url = document.getElementById('ea_url');
    if (url) data.url = url.value;
    const content = document.getElementById('ea_content');
    if (content) data.content = content.value;

    try {
      const result = await API.courseActivities.update(courseId, activityId, data);
      if (result.success) {
        showToast(t('moodleActivityEdit.updated'));
        this.closeModal('editActivityModal');
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
      const result = await API.courseActivities.delete(courseId, activityId);
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
  selectMultipleAnswer(index) {
    if (!this.currentQuizAttempt) return;
    const q = this.currentQuizAttempt.questions[this.currentQuestionIndex];
    if (!q) return;
    if (!Array.isArray(q.answer)) q.answer = [];
    const pos = q.answer.indexOf(index);
    if (pos >= 0) {
      q.answer.splice(pos, 1);
    } else {
      q.answer.push(index);
    }
    // Update visual state
    const labels = document.querySelectorAll('.question-option');
    labels.forEach(label => {
      const checkbox = label.querySelector('input[type="checkbox"]');
      if (checkbox) {
        const val = parseInt(checkbox.value);
        label.classList.toggle('selected', q.answer.includes(val));
      }
    });
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
      const result = await API.questionBank.get(questionId);
      if (!result.success) { showToast(t('moodleQuestionBank.loadQuestionFailed')); return; }
      const q = result.data;

      this.createModal('editQuestionModal', t('moodleQuestionBank.editTitle'), `
        <form onsubmit="event.preventDefault(); MoodleUI.saveEditedQuestion('${questionId}')">
          <div class="form-group">
            <label>${t('moodleQuestionBank.typeLabel')}</label>
            <input type="text" value="${{multiple_choice:t('moodleQuestionBank.multipleChoice'), true_false:t('moodleQuestionBank.trueFalse'), short_answer:t('moodleQuestionBank.shortAnswer'), fill_blank:t('moodleQuestionBank.fillBlank'), essay:'申論題'}[q.type] || q.type}" disabled>
          </div>
          <div class="form-group">
            <label>${t('moodleNewQuestion.contentLabel')}</label>
            <textarea id="eq_text" rows="3" required>${q.questionText || ''}</textarea>
          </div>
          ${q.type === 'multiple_choice' ? `
            <div class="form-group">
              <label>${t('moodleQuestionBank.optionsLabel')}</label>
              <textarea id="eq_options" rows="4">${(q.options || []).join('\\n')}</textarea>
            </div>
            <div class="form-group">
              <label>${t('moodleQuestionBank.correctIndexLabel')}</label>
              <input type="number" id="eq_correct" value="${q.correctAnswer ?? ''}" min="0">
            </div>
          ` : ''}
          ${q.type === 'true_false' ? `
            <div class="form-group">
              <label>${t('moodleQuestionBank.correctAnswer')}</label>
              <select id="eq_correct_tf">
                <option value="true" ${q.correctAnswer === true ? 'selected' : ''}>${t('common.trueVal')}</option>
                <option value="false" ${q.correctAnswer === false ? 'selected' : ''}>${t('common.falseVal')}</option>
              </select>
            </div>
          ` : ''}
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
            <input type="text" id="eq_tags" value="${(q.tags || []).join(', ')}">
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editQuestionModal')" class="btn-secondary">${t('common.cancel')}</button>
            <button type="submit" class="btn-primary">${t('common.save')}</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast(t('moodleQuestionBank.loadQuestionError'));
    }
  },

  async saveEditedQuestion(questionId) {
    const data = {
      questionText: document.getElementById('eq_text').value,
      points: parseInt(document.getElementById('eq_points').value) || 1,
      difficulty: document.getElementById('eq_difficulty').value,
      tags: document.getElementById('eq_tags').value.split(',').map(t => t.trim()).filter(Boolean)
    };
    const optionsEl = document.getElementById('eq_options');
    if (optionsEl) data.options = optionsEl.value.split('\\n').filter(Boolean);
    const correctEl = document.getElementById('eq_correct');
    if (correctEl) data.correctAnswer = parseInt(correctEl.value);
    const correctTfEl = document.getElementById('eq_correct_tf');
    if (correctTfEl) data.correctAnswer = correctTfEl.value === 'true';

    try {
      const result = await API.questionBank.update(questionId, data);
      if (result.success) {
        showToast(t('moodleQuestionBank.questionUpdated'));
        this.closeModal('editQuestionModal');
        this.openQuestionBank();
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
      const result = await API.questionBank.get(questionId);
      if (!result.success) { showToast(t('moodleQuestionBank.loadQuestionFailed')); return; }
      const q = result.data;
      const typeNames = {multiple_choice:t('moodleQuestionBank.multipleChoice'), true_false:t('moodleQuestionBank.trueFalse'), short_answer:t('moodleQuestionBank.shortAnswer'), fill_blank:t('moodleQuestionBank.fillBlank'), essay:'申論題'};

      let optionsHtml = '';
      if (q.type === 'multiple_choice' && q.options) {
        optionsHtml = '<ul class="preview-options">' + q.options.map((opt, i) =>
          `<li class="${i === q.correctAnswer ? 'correct-answer' : ''}">${String.fromCharCode(65+i)}. ${opt} ${i === q.correctAnswer ? '✓' : ''}</li>`
        ).join('') + '</ul>';
      } else if (q.type === 'true_false') {
        optionsHtml = `<p>${t('moodleQuestionBank.correctAnswer')}：${q.correctAnswer ? t('common.trueVal') : t('common.falseVal')}</p>`;
      }

      this.createModal('previewQuestionModal', t('moodleQuestionBank.previewTitle'), `
        <div class="question-preview">
          <div class="preview-meta">
            <span class="badge">${typeNames[q.type] || q.type}</span>
            <span class="badge">${q.points || 1} ${t('moodleGradebook.pointsSuffix')}</span>
            <span class="badge difficulty-${q.difficulty || 'medium'}">${{easy:t('moodleQuestionBank.diffEasy'),medium:t('moodleQuestionBank.diffMedium'),hard:t('moodleQuestionBank.diffHard')}[q.difficulty] || t('moodleQuestionBank.diffMedium')}</span>
          </div>
          <div class="preview-text"><strong>${t('moodleQuestionBank.questionLabel')}：</strong>${q.questionText}</div>
          ${optionsHtml}
          ${q.tags?.length ? '<div class="preview-tags">' + q.tags.map(t => '<span class="tag">' + t + '</span>').join('') + '</div>' : ''}
        </div>
      `);
    } catch (error) {
      showToast(t('moodleQuestionBank.previewFailed'));
    }
  },

  // ======== Import Questions ========
  openImportQuestionsModal() {
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
          <input type="text" id="iq_category" placeholder="${t('moodleQuestionBank.categoryPlaceholder')}">
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
    const category = document.getElementById('iq_category').value.trim();
    if (!rawData) { showToast(t('moodleQuestionBank.importDataRequired')); return; }

    try {
      let questions;
      if (format === 'json') {
        questions = JSON.parse(rawData);
      } else {
        questions = rawData;
      }
      const result = await API.questionBank.import({ format, questions, category: category || undefined });
      if (result.success) {
        showToast(`${t('moodleQuestionBank.importSuccess')} ${result.data?.imported || ''} ${t('moodleQuestionBank.questionsUnit')}`);
        this.closeModal('importQuestionsModal');
        this.openQuestionBank();
      } else {
        showToast(result.message || t('moodleQuestionBank.importFailed'));
      }
    } catch (error) {
      showToast(t('moodleQuestionBank.importFailed') + '：' + (error.message || t('moodleQuestionBank.dataFormatError')));
    }
  },

  // ======== Manage Question Categories ========
  async openCategoryManageModal() {
    try {
      const result = await API.questionBank.getCategories();
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
          ${categories.length === 0 ? `<p class="empty-list">${t('moodleQuestionBank.noCategories')}</p>` : ''}
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
      const result = await API.questionBank.createCategory({ name });
      if (result.success) {
        showToast(t('moodleGradeCategory.created'));
        this.openCategoryManageModal();
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
