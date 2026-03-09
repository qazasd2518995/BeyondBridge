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

  /**
   * 通用課程選擇器
   */
  renderCoursePicker(title, icon, callbackFn, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="loading">${t('common.loading')}</div>`;

    API.courses.list({ enrolled: true }).then(result => {
      const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
      const courseColors = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
      ];
      container.innerHTML = `
        <div style="padding: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem;">
            ${icon}
            <div>
              <h2 style="font-size: 1.5rem; font-weight: 700; margin: 0;">${title}</h2>
              <p style="color: var(--gray-500); margin: 0.25rem 0 0; font-size: 0.9rem;">請選擇課程</p>
            </div>
          </div>
          ${courses.length === 0 ? `
            <div style="text-align: center; padding: 4rem 2rem; color: var(--gray-400);">
              <p style="font-size: 1.1rem;">尚無課程</p>
            </div>
          ` : `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem;">
              ${courses.map((c, idx) => `
                <div onclick="${callbackFn}('${c.courseId || c.id}')"
                     style="background: var(--white); border-radius: 16px; overflow: hidden; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.06);"
                     onmouseover="this.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)';this.style.transform='translateY(-2px)'"
                     onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)';this.style.transform='none'">
                  <div style="height: 8px; background: ${courseColors[idx % courseColors.length]};"></div>
                  <div style="padding: 1.5rem;">
                    <h3 style="font-size: 1.15rem; font-weight: 600; margin: 0 0 0.5rem;">${c.title || c.name || '未命名課程'}</h3>
                    <p style="color: var(--gray-500); font-size: 0.85rem; margin: 0 0 1rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${c.summary || c.description || ''}</p>
                    <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--gray-400);">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      ${c.instructorName || c.teacherName || ''}
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
      container.innerHTML = `
        <div style="text-align: center; padding: 4rem 2rem; color: var(--gray-400); grid-column: 1/-1;">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 1rem; opacity: 0.5;">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">${t('moodleCourse.noCourses')}</p>
          <p style="font-size: 0.9rem;">${t('moodleCourse.waitForCourses')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = courses.map(course => `
      <div class="moodle-course-card" onclick="MoodleUI.openCourse('${course.courseId}')">
        <div class="course-cover" style="background: ${this.getCourseGradient(course.category)}">
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
              <div class="progress-fill" style="width: ${course.progress}%"></div>
            </div>
            <span class="progress-text">${course.progress}% ${t('moodleCourse.complete')}</span>
          ` : ''}
        </div>
      </div>
    `).join('');
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
      <div id="courseParticipantsPanel" class="course-panel" style="display: none;">
        <div class="loading">${t('common.loading')}</div>
      </div>

      <!-- 成績區 -->
      <div id="courseGradesPanel" class="course-panel" style="display: none;">
        <div class="loading">${t('common.loading')}</div>
      </div>

      <!-- 報表區 (教師) -->
      <div id="courseReportsPanel" class="course-panel" style="display: none;">
        <div class="loading">${t('common.loading')}</div>
      </div>
    `;
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

    return activities.map(activity => `
      <div class="activity-item ${activity.visible === false ? 'hidden-activity' : ''}" onclick="MoodleUI.openActivity('${activity.type}', '${activity.activityId}', '${courseId}')">
        <div class="activity-icon" style="background: ${activityColors[activity.type] || 'var(--gray-400)'}20; color: ${activityColors[activity.type] || 'var(--gray-400)'}">
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
    `).join('');
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
      p.style.display = 'none';
      p.classList.remove('active');
    });

    const panelId = `course${tab.charAt(0).toUpperCase() + tab.slice(1)}Panel`;
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.style.display = 'block';
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
      const key = prompt(t('moodleEnroll.enterKey'));
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
                    <div class="mini-progress-fill" style="width: ${p.progress || 0}%"></div>
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
        <div class="page-activity-content" style="line-height: 1.8; font-size: 0.95rem;">
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
   * YouTube 影片全螢幕播放器
   */
  openVideoViewer(title, youtubeId, originalUrl) {
    const existing = document.getElementById('video-viewer-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'video-viewer-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 20px;color:#fff;flex-shrink:0;';
    header.innerHTML = `
      <h3 style="margin:0;font-size:1rem;font-weight:500;">${title}</h3>
      <button id="video-viewer-close" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;padding:4px 8px;">&times;</button>
    `;
    overlay.appendChild(header);

    const content = document.createElement('div');
    content.id = 'video-viewer-content';
    content.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;padding:0 20px 20px;';
    content.innerHTML = `
      <div style="width:100%;max-width:960px;aspect-ratio:16/9;position:relative;">
        <iframe id="yt-embed-frame" src="https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1"
                style="width:100%;height:100%;border:none;border-radius:8px;"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>
      </div>
    `;
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // 偵測嵌入失敗（Error 150/153 = 不允許嵌入），顯示縮圖 + 連結
    const iframe = document.getElementById('yt-embed-frame');
    setTimeout(() => {
      try {
        // 如果 iframe 內容無法存取（跨域正常），不處理
        // 用一個備案：同時顯示一個可點擊的縮圖覆蓋層
      } catch(e) {}
    }, 3000);

    // 加一個備案按鈕，以防影片無法嵌入
    const fallbackUrl = originalUrl || `https://www.youtube.com/watch?v=${youtubeId}`;
    const fallback = document.createElement('div');
    fallback.style.cssText = 'text-align:center;padding:10px;flex-shrink:0;';
    fallback.innerHTML = `<a href="${fallbackUrl}" target="_blank" style="color:#aaa;font-size:0.85rem;text-decoration:underline;">${t('moodleActivity.openInNewTab') || '若影片無法播放，點此在新分頁開啟'}</a>`;
    overlay.appendChild(fallback);

    document.getElementById('video-viewer-close').onclick = () => overlay.remove();
    const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
  },

  /**
   * 網頁全螢幕 iframe 瀏覽器（不跳出平台）
   */
  openWebViewer(title, url) {
    const existing = document.getElementById('web-viewer-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'web-viewer-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#1a1a2e;color:#fff;flex-shrink:0;';
    header.innerHTML = `
      <h3 style="margin:0;font-size:0.95rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;margin-right:12px;">${title}</h3>
      <button id="web-viewer-close" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;padding:4px 8px;flex-shrink:0;">&times;</button>
    `;
    overlay.appendChild(header);

    const content = document.createElement('div');
    content.style.cssText = 'flex:1;overflow:hidden;';
    content.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:none;background:#fff;" allow="autoplay; encrypted-media; fullscreen"></iframe>`;
    overlay.appendChild(content);

    document.body.appendChild(overlay);

    document.getElementById('web-viewer-close').onclick = () => overlay.remove();
    const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
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

      // 移除舊的 viewer
      const existing = document.getElementById('file-viewer-overlay');
      if (existing) existing.remove();

      // 建立全螢幕 viewer overlay
      const overlay = document.createElement('div');
      overlay.id = 'file-viewer-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;';
      overlay.oncontextmenu = () => false;

      // 標題列
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 20px;background:rgba(0,0,0,0.95);color:#fff;flex-shrink:0;';
      header.innerHTML = `
        <h3 style="margin:0;font-size:1rem;font-weight:500;">${title}</h3>
        <button id="file-viewer-close" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;padding:4px 8px;">&times;</button>
      `;
      overlay.appendChild(header);

      // 內容區域
      const content = document.createElement('div');
      content.style.cssText = 'flex:1;overflow:hidden;';

      if (contentType === 'application/pdf') {
        content.innerHTML = `<iframe src="${authedUrl}#toolbar=0&navpanes=0&scrollbar=1" style="width:100%;height:100%;border:none;"></iframe>`;
      } else if (contentType.startsWith('image/')) {
        content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:1rem;"><img src="${authedUrl}" style="max-width:100%;max-height:100%;object-fit:contain;" oncontextmenu="return false" draggable="false" /></div>`;
      } else if (contentType.startsWith('video/')) {
        content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;"><video controls controlslist="nodownload" disablepictureinpicture style="max-width:100%;max-height:100%;" oncontextmenu="return false"><source src="${authedUrl}" type="${contentType}"></video></div>`;
      } else {
        content.innerHTML = `<iframe src="${authedUrl}" style="width:100%;height:100%;border:none;"></iframe>`;
      }

      overlay.appendChild(content);
      document.body.appendChild(overlay);

      // 關閉按鈕
      document.getElementById('file-viewer-close').onclick = () => overlay.remove();
      // ESC 關閉
      const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
      document.addEventListener('keydown', escHandler);

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
    const modal = document.createElement('div');
    modal.id = 'ltiLaunchModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-fullscreen">
        <div class="modal-header">
          <h3>🔗 ${toolName}</h3>
          <div style="display: flex; gap: 0.5rem;">
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
        <div class="modal-body" style="padding: 0; height: calc(100vh - 120px);">
          <iframe id="ltiLaunchFrame" src="${launchUrl}" style="width: 100%; height: 100%; border: none;"></iframe>
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
      infoDiv.style.display = 'none';
      return;
    }

    const tool = this.ltiToolsCache?.find(t => t.toolId === toolId);
    if (tool) {
      nameEl.textContent = tool.name;
      descEl.textContent = tool.description || t('moodleLti.noDescription');
      infoDiv.style.display = 'block';
    } else {
      infoDiv.style.display = 'none';
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
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('page')">
              <div class="type-icon" style="background: var(--olive)20; color: var(--olive)">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              </div>
              <span>${t('moodleAddActivity.typePage')}</span>
              <p>${t('moodleAddActivity.typePageDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('url')">
              <div class="type-icon" style="background: #6366f120; color: #6366f1">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeUrl')}</span>
              <p>${t('moodleAddActivity.typeUrlDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('file')">
              <div class="type-icon" style="background: #10b98120; color: #10b981">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeFile')}</span>
              <p>${t('moodleAddActivity.typeFileDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('assignment')">
              <div class="type-icon" style="background: var(--terracotta)20; color: var(--terracotta)">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeAssignment')}</span>
              <p>${t('moodleAddActivity.typeAssignmentDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('quiz')">
              <div class="type-icon" style="background: #8b5cf620; color: #8b5cf6">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeQuiz')}</span>
              <p>${t('moodleAddActivity.typeQuizDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('forum')">
              <div class="type-icon" style="background: #f59e0b20; color: #f59e0b">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeForum')}</span>
              <p>${t('moodleAddActivity.typeForumDesc')}</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('lti')">
              <div class="type-icon" style="background: #ec489920; color: #ec4899">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <span>${t('moodleAddActivity.typeLti')}</span>
              <p>${t('moodleAddActivity.typeLtiDesc')}</p>
            </div>
          </div>

          <div id="activityFormArea" style="display: none; margin-top: 1.5rem;">
            <!-- 活動表單會動態插入這裡 -->
          </div>
        </div>
        <div class="modal-footer" id="activityModalFooter" style="display: none;">
          <button onclick="MoodleUI.closeModal('addActivityModal')" class="btn-secondary">${t('common.cancel')}</button>
          <button onclick="MoodleUI.submitAddActivity('${courseId}', '${sectionId}')" class="btn-primary">${t('moodleCourse.addActivity')}</button>
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
  selectActivityType(type) {
    this.selectedActivityType = type;

    // 高亮選中的卡片
    document.querySelectorAll('.activity-type-card').forEach(card => card.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

    // 顯示表單
    const formArea = document.getElementById('activityFormArea');
    const footer = document.getElementById('activityModalFooter');
    formArea.style.display = 'block';
    footer.style.display = 'flex';

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
          <div id="ltiToolInfo" style="display: none; margin-top: 1rem;">
            <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
              <h4 id="ltiToolName" style="margin-bottom: 0.5rem;"></h4>
              <p id="ltiToolDesc" style="font-size: 0.9rem; color: var(--gray-600);"></p>
            </div>
          </div>
          <div class="form-group" style="margin-top: 1rem;">
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
    modal.style.display = 'flex';
    modal.onclick = (e) => { if (e.target === modal) this.closeModal(modalId); };

    const maxWidth = options.maxWidth || '600px';

    modal.innerHTML = `
      <div class="modal" style="max-width: ${maxWidth}; width: 90%;">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close" onclick="MoodleUI.closeModal('${modalId}')">&times;</button>
        </div>
        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
          ${bodyHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  },

  /**
   * 關閉 Modal
   */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
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

      assignments = assignments.map(a => ({ ...a, courseName, courseId }));

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

    const user = API.getCurrentUser();
    const isTeacher = this.isTeachingRole(user);

    const header = `
      <div style="padding: 1.5rem 1.5rem 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <button onclick="MoodleUI.loadAssignments()" style="background: var(--gray-100); border: none; padding: 0.5rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center;">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            </button>
            <div>
              <h2 style="font-size: 1.3rem; font-weight: 700; margin: 0;">${courseName} — ${t('moodleAssignment.title')}</h2>
              <p style="color: var(--gray-500); margin: 0.25rem 0 0; font-size: 0.85rem;">${assignments.length} 份作業</p>
            </div>
          </div>
          ${isTeacher ? `
            <button onclick="MoodleUI.showCreateAssignmentModal('${courseId}')" style="padding: 0.6rem 1.25rem; background: var(--olive); color: var(--cream); border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              新增作業
            </button>
          ` : ''}
        </div>
      </div>
    `;

    if (assignments.length === 0) {
      container.innerHTML = header + `<div style="text-align: center; padding: 4rem 2rem; color: var(--gray-400);">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 1rem; opacity: 0.5;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
        <p style="font-size: 1.05rem;">${isTeacher ? '尚未建立作業' : t('moodleAssignment.noAssignments')}</p>
        ${isTeacher ? '<p style="font-size: 0.85rem; margin-top: 0.5rem;">點擊「新增作業」開始派發作業給學生</p>' : ''}
      </div>`;
      return;
    }

    container.innerHTML = header + `<div style="padding: 0 1.5rem 1.5rem;">` + assignments.map(a => {
      const isOverdue = a.dueDate && new Date(a.dueDate) < new Date();
      const submissions = a.stats?.totalSubmissions || 0;
      const graded = a.stats?.gradedCount || 0;

      if (isTeacher) {
        return `
          <div onclick="MoodleUI.openAssignment('${a.assignmentId}')" style="display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--white); border-radius: 12px; margin-bottom: 0.75rem; cursor: pointer; transition: box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
            <div style="width: 48px; height: 48px; background: var(--olive-light, #e8f0e0); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--olive)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
            </div>
            <div style="flex: 1; min-width: 0;">
              <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem;">${a.title}</h3>
              <p style="color: var(--gray-500); font-size: 0.85rem; margin: 0; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">${a.description || ''}</p>
              ${a.dueDate ? `<p style="color: ${isOverdue ? 'var(--terracotta)' : 'var(--gray-400)'}; font-size: 0.8rem; margin: 0.25rem 0 0;">截止：${new Date(a.dueDate).toLocaleString('zh-TW')}</p>` : ''}
            </div>
            <div style="flex-shrink: 0; display: flex; gap: 1rem; align-items: center;">
              <div style="text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 700; color: var(--olive);">${submissions}</div>
                <div style="font-size: 0.7rem; color: var(--gray-400);">已提交</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 700; color: #6366f1;">${graded}</div>
                <div style="font-size: 0.7rem; color: var(--gray-400);">已評分</div>
              </div>
              <div style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500; background: ${isOverdue ? '#fee2e2' : '#f0fdf4'}; color: ${isOverdue ? '#dc2626' : '#16a34a'};">
                ${isOverdue ? '已截止' : '進行中'}
              </div>
            </div>
          </div>
        `;
      } else {
        const statusClass = a.graded ? 'graded' : a.submitted ? 'submitted' : isOverdue ? 'overdue' : 'pending';
        const statusText = a.graded ? '已評分' : a.submitted ? '已提交' : isOverdue ? '已逾期' : '待提交';
        return `
          <div onclick="MoodleUI.openAssignment('${a.assignmentId}')" style="display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--white); border-radius: 12px; margin-bottom: 0.75rem; cursor: pointer; transition: box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
            <div style="width: 48px; height: 48px; background: var(--olive-light, #e8f0e0); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--olive)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
            </div>
            <div style="flex: 1; min-width: 0;">
              <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem;">${a.title}</h3>
              <p style="color: var(--gray-500); font-size: 0.85rem; margin: 0;">${a.description || ''}</p>
              ${a.dueDate ? `<p style="color: ${isOverdue && !a.submitted ? 'var(--terracotta)' : 'var(--gray-400)'}; font-size: 0.8rem; margin: 0.25rem 0 0;">截止：${new Date(a.dueDate).toLocaleString('zh-TW')}</p>` : ''}
            </div>
            <div style="flex-shrink: 0; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500;
              background: ${statusClass === 'graded' ? '#dcfce7' : statusClass === 'submitted' ? '#dbeafe' : statusClass === 'overdue' ? '#fee2e2' : '#f3f4f6'};
              color: ${statusClass === 'graded' ? '#16a34a' : statusClass === 'submitted' ? '#2563eb' : statusClass === 'overdue' ? '#dc2626' : '#6b7280'};">
              ${statusText}
            </div>
          </div>
        `;
      }
    }).join('') + `</div>`;
  },

  /**
   * 渲染作業列表
   */
  renderAssignmentsList(assignments) {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    if (assignments.length === 0) {
      container.innerHTML = `<div class="empty-list">${t('moodleAssignment.noAssignments')}</div>`;
      return;
    }

    container.innerHTML = assignments.map(a => {
      const isOverdue = a.dueDate && new Date(a.dueDate) < new Date() && !a.submitted;
      const statusClass = a.graded ? 'graded' : a.submitted ? 'submitted' : isOverdue ? 'overdue' : 'pending';
      const statusText = a.graded ? t('moodleAssignment.statusGraded') : a.submitted ? t('moodleAssignment.statusSubmitted') : isOverdue ? t('moodleAssignment.statusOverdue') : t('moodleAssignment.statusPending');

      return `
        <div class="assignment-card" onclick="MoodleUI.openAssignment('${a.assignmentId}')">
          <div class="assignment-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
          </div>
          <div class="assignment-info">
            <h3>${a.title}</h3>
            <p class="assignment-course">${a.courseName || t('moodleAssignment.course')}</p>
            ${a.dueDate ? `<p class="assignment-due ${isOverdue ? 'overdue' : ''}">${t('moodleAssignment.duePrefix')}：${new Date(a.dueDate).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')}</p>` : ''}
          </div>
          <div class="assignment-status ${statusClass}">
            <span>${statusText}</span>
            ${a.graded ? `<span class="grade">${a.grade}/${a.maxPoints}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
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

      const assignment = result.data;
      const container = document.getElementById('assignmentDetailContent');
      const user = API.getCurrentUser();
      const isTeacher = assignment.teacherId === user?.userId;

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
              <input type="file" id="submissionFile" style="display: none" onchange="MoodleUI.handleFileSelect(this)">
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
                  <input type="number" id="grade_${s.studentId}" value="${s.grade || ''}" placeholder="${t('moodleGrade.score')}" style="width: 80px">
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

      quizzes = quizzes.map(q => ({ ...q, courseName, courseId }));

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

    const user = API.getCurrentUser();
    const isTeacher = this.isTeachingRole(user);

    const header = `
      <div style="padding: 1.5rem 1.5rem 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <button onclick="MoodleUI.loadQuizzes()" style="background: var(--gray-100); border: none; padding: 0.5rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center;">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            </button>
            <div>
              <h2 style="font-size: 1.3rem; font-weight: 700; margin: 0;">${courseName} — ${t('moodleQuiz.title')}</h2>
              <p style="color: var(--gray-500); margin: 0.25rem 0 0; font-size: 0.85rem;">${quizzes.length} 份測驗</p>
            </div>
          </div>
          ${isTeacher ? `
            <button onclick="MoodleUI.showCreateQuizModal('${courseId}')" style="padding: 0.6rem 1.25rem; background: var(--olive); color: var(--cream); border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              新增測驗
            </button>
          ` : ''}
        </div>
      </div>
    `;

    if (quizzes.length === 0) {
      container.innerHTML = header + `<div style="text-align: center; padding: 4rem 2rem; color: var(--gray-400);">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 1rem; opacity: 0.5;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <p style="font-size: 1.05rem;">${isTeacher ? '尚未建立測驗' : t('moodleQuiz.noQuizzes')}</p>
        ${isTeacher ? '<p style="font-size: 0.85rem; margin-top: 0.5rem;">點擊「新增測驗」開始建立測驗</p>' : ''}
      </div>`;
      return;
    }

    container.innerHTML = header + `<div style="padding: 0 1.5rem 1.5rem;">` + quizzes.map(q => {
      const now = new Date();
      const isOpen = (!q.openDate || new Date(q.openDate) <= now) && (!q.closeDate || new Date(q.closeDate) >= now);
      const qCount = q.questionCount || q.questions?.length || 0;
      const attempts = q.stats?.totalAttempts || 0;
      const avgScore = q.stats?.averageScore || 0;

      if (isTeacher) {
        return `
          <div onclick="MoodleUI.openQuiz('${q.quizId}')" style="display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--white); border-radius: 12px; margin-bottom: 0.75rem; cursor: pointer; transition: box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
            <div style="width: 48px; height: 48px; background: #ede9fe; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#7c3aed" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style="flex: 1; min-width: 0;">
              <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem;">${q.title}</h3>
              <p style="color: var(--gray-500); font-size: 0.85rem; margin: 0; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">${q.description || ''}</p>
              <p style="color: var(--gray-400); font-size: 0.8rem; margin: 0.25rem 0 0;">
                ${qCount} 題 · ${q.timeLimit ? q.timeLimit + ' 分鐘' : '不限時'} · ${q.totalPoints || 0} 分
              </p>
            </div>
            <div style="flex-shrink: 0; display: flex; gap: 1rem; align-items: center;">
              <div style="text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 700; color: #7c3aed;">${attempts}</div>
                <div style="font-size: 0.7rem; color: var(--gray-400);">作答次數</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 700; color: var(--olive);">${avgScore ? avgScore.toFixed(0) : '-'}</div>
                <div style="font-size: 0.7rem; color: var(--gray-400);">平均分</div>
              </div>
              <div style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500; background: ${isOpen ? '#f0fdf4' : '#f3f4f6'}; color: ${isOpen ? '#16a34a' : '#6b7280'};">
                ${isOpen ? '開放中' : '未開放'}
              </div>
            </div>
          </div>
        `;
      } else {
        return `
          <div onclick="MoodleUI.openQuiz('${q.quizId}')" style="display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--white); border-radius: 12px; margin-bottom: 0.75rem; cursor: pointer; transition: box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
            <div style="width: 48px; height: 48px; background: #ede9fe; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#7c3aed" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div style="flex: 1; min-width: 0;">
              <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem;">${q.title}</h3>
              <p style="color: var(--gray-500); font-size: 0.85rem; margin: 0;">${q.description || ''}</p>
              <p style="color: var(--gray-400); font-size: 0.8rem; margin: 0.25rem 0 0;">
                ${qCount} 題 · ${q.timeLimit ? q.timeLimit + ' 分鐘' : '不限時'} · 最多 ${q.maxAttempts || 1} 次
              </p>
            </div>
            <div style="flex-shrink: 0;">
              ${q.completed ? `
                <span style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500; background: #dcfce7; color: #16a34a;">已完成</span>
              ` : isOpen ? `
                <button onclick="event.stopPropagation(); MoodleUI.startQuiz('${q.quizId}')" style="padding: 0.5rem 1rem; background: var(--olive); color: var(--cream); border: none; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">開始作答</button>
              ` : `
                <span style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500; background: #f3f4f6; color: #6b7280;">未開放</span>
              `}
            </div>
          </div>
        `;
      }
    }).join('') + `</div>`;
  },

  /**
   * 渲染測驗列表
   */
  renderQuizzesList(quizzes) {
    const container = document.getElementById('quizzesList');
    if (!container) return;

    if (quizzes.length === 0) {
      container.innerHTML = `<div class="empty-list">${t('moodleQuiz.noQuizzes')}</div>`;
      return;
    }

    container.innerHTML = quizzes.map(q => {
      const now = new Date();
      const isOpen = (!q.openDate || new Date(q.openDate) <= now) && (!q.closeDate || new Date(q.closeDate) >= now);

      return `
        <div class="quiz-card" onclick="MoodleUI.openQuiz('${q.quizId}')">
          <div class="quiz-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="quiz-info">
            <h3>${q.title}</h3>
            <p class="quiz-course">${q.courseName || t('moodleQuiz.course')}</p>
            <p class="quiz-meta">
              ${q.timeLimit ? `${t('moodleQuiz.timeLimitMin')} ${q.timeLimit} ${t('moodleQuiz.minutes')}` : t('moodleQuiz.noTimeLimit')} ·
              ${q.questionCount || q.questions?.length || 0} ${t('moodleQuiz.questionsUnit')} ·
              ${q.attempts || 1} ${t('moodleQuiz.attemptsAllowed')}
            </p>
          </div>
          <div class="quiz-status">
            ${q.completed ? `
              <span class="completed">${t('moodleQuiz.completed')}</span>
              <span class="score">${q.bestScore || '-'} ${t('moodleQuiz.score')}</span>
            ` : isOpen ? `
              <button class="btn-primary" onclick="event.stopPropagation(); MoodleUI.startQuiz('${q.quizId}')">${t('moodleQuiz.startQuiz')}</button>
            ` : `
              <span class="not-available">${t('moodleQuiz.notAvailable')}</span>
            `}
          </div>
        </div>
      `;
    }).join('');
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
            <div class="quiz-progress-fill" style="width: ${progress}%"></div>
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
    if (!confirm(t('moodleQuiz.confirmSubmit'))) return;

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

    const header = `
      <div style="padding: 1.5rem 1.5rem 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <button onclick="MoodleUI.loadForums()" style="background: var(--gray-100); border: none; padding: 0.5rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center;">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            </button>
            <div>
              <h2 style="font-size: 1.3rem; font-weight: 700; margin: 0;">${courseName} — ${t('moodleForum.title')}</h2>
              <p style="color: var(--gray-500); margin: 0.25rem 0 0; font-size: 0.85rem;">${forums.length} 個討論區</p>
            </div>
          </div>
          ${isTeacher ? `
            <button onclick="MoodleUI.openCreateForumModal('${courseId}')" style="padding: 0.6rem 1.25rem; background: var(--olive); color: var(--cream); border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              新增討論區
            </button>
          ` : ''}
        </div>
      </div>
    `;

    if (forums.length === 0) {
      container.innerHTML = header + `<div class="empty-list" style="padding: 3rem; text-align: center; color: var(--gray-400);">${t('moodleForum.noForums')}</div>`;
      return;
    }

    const typeLabels = { 'news': '公告', 'general': '一般討論', 'qanda': '問與答', 'social': '社交' };
    const typeColors = { 'news': '#ef4444', 'general': 'var(--olive)', 'qanda': '#6366f1', 'social': '#f59e0b' };

    container.innerHTML = header + `
      <div style="padding: 0 1.5rem 1.5rem;">
        ${forums.map(f => `
          <div onclick="MoodleUI.openForum('${f.forumId}')" style="display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--white); border-radius: 12px; margin-bottom: 0.75rem; cursor: pointer; transition: box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
            <div style="width: 48px; height: 48px; background: ${(typeColors[f.type] || 'var(--olive)')}15; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${typeColors[f.type] || 'var(--olive)'}" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span style="padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 500; background: ${(typeColors[f.type] || 'var(--olive)')}; color: white;">${typeLabels[f.type] || f.type}</span>
                <h3 style="font-size: 1rem; font-weight: 600; margin: 0;">${f.title || f.name}</h3>
              </div>
              <p style="color: var(--gray-500); font-size: 0.85rem; margin: 0;">${f.description || ''}</p>
            </div>
            <div style="flex-shrink: 0; display: flex; gap: 1.5rem; font-size: 0.85rem; color: var(--gray-400);">
              <span>${f.discussionCount ?? f.stats?.discussionCount ?? 0} 篇討論</span>
              <span>${f.postCount ?? f.stats?.postCount ?? 0} 則回覆</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  /**
   * 渲染討論區列表
   */
  renderForumsList(forums) {
    const container = document.getElementById('forumsList');
    if (!container) return;

    if (forums.length === 0) {
      container.innerHTML = `<div class="empty-list">${t('moodleForum.noForums')}</div>`;
      return;
    }

    container.innerHTML = `
      <div class="forum-list">
        ${forums.map(f => `
          <div class="forum-item" onclick="MoodleUI.openForum('${f.forumId}')">
            <div class="forum-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <div class="forum-info">
              <h3>${f.title || f.name || t('moodleForum.title')}</h3>
              <p class="forum-course">${f.courseName || t('moodleCourse.course')}</p>
              <p class="forum-desc">${f.description || t('moodleLti.noDescription')}</p>
            </div>
            <div class="forum-stats">
              <span>${f.discussionCount ?? f.stats?.discussionCount ?? 0} ${t('moodleForum.topics')}</span>
              <span>${f.postCount ?? f.stats?.postCount ?? 0} ${t('moodleForum.replies')}</span>
            </div>
          </div>
        `).join('')}
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

      container.innerHTML = `
        <div class="forum-header">
          <button onclick="MoodleUI.currentForumCourseId ? (showView('moodleForums'), MoodleUI.loadForums(MoodleUI.currentForumCourseId)) : showView('moodleForums')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            ${t('moodleForum.backToForums')}
          </button>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2>${forum.title || forum.name || t('moodleForum.title')}</h2>
              <p>${forum.description || ''}</p>
            </div>
            <button onclick="MoodleUI.openNewDiscussionModal('${forumId}')" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              ${t('moodleForum.newDiscussion')}
            </button>
          </div>
        </div>
        <div class="discussion-list">
          ${(forum.discussions || []).length === 0 ? `<div class="empty-list">${t('moodleForum.noDiscussions')}</div>` : forum.discussions.map(d => `
            <div class="discussion-item ${d.pinned ? 'pinned' : ''}" onclick="MoodleUI.openDiscussion('${forumId}', '${d.discussionId}')">
              <div class="discussion-avatar">${(d.authorName || 'U')[0]}</div>
              <div class="discussion-content">
                <div class="discussion-title">
                  ${d.pinned ? `<span class="pin-badge">${t('moodleForum.pinned')}</span>` : ''}
                  ${d.subject}
                </div>
                <div class="discussion-excerpt">${d.message?.substring(0, 100) || ''}...</div>
                <div class="discussion-meta">
                  <span>${d.authorName}</span>
                  <span>${new Date(d.createdAt).toLocaleDateString('zh-TW')}</span>
                </div>
              </div>
              <div class="discussion-stats">
                <span class="reply-count">${d.replyCount || 0} ${t('moodleForum.replies')}</span>
                ${d.lastReply ? `<span class="last-reply">${t('moodleForum.lastReply')}：${new Date(d.lastReply).toLocaleDateString('zh-TW')}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
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
      const dayEvents = events.filter(e => new Date(e.startDate || e.dueDate).getDate() === day);

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

      container.innerHTML = events.map(e => `
        <div class="event-item">
          <div class="event-date">
            <span class="day">${new Date(e.startDate || e.dueDate).getDate()}</span>
            <span class="month">${new Date(e.startDate || e.dueDate).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW', { month: 'short' })}</span>
          </div>
          <div class="event-info">
            <div class="event-title">${e.title}</div>
            <div class="event-course">${e.courseName || ''}</div>
            <div class="event-time">${e.type === 'assignment' ? t('moodleCalendar.duePrefix') : ''}：${new Date(e.startDate || e.dueDate).toLocaleTimeString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      `).join('');
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
        <div class="empty-list" style="text-align: center; padding: 3rem;">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 1rem; opacity: 0.5;">
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

      const quiz = result.data;
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
              <span class="value">${quiz.attempts === 0 ? t('moodleQuiz.unlimited') : quiz.attempts || 1} ${t('moodleQuiz.times')}</span>
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
          ${quiz.myAttempts && quiz.myAttempts.length > 0 ? `
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
                  ${quiz.myAttempts.map((a, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${new Date(a.startedAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')}</td>
                      <td>${a.completedAt ? new Date(a.completedAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : '-'}</td>
                      <td>${a.score !== undefined ? a.score + ' ' + t('moodleQuiz.pointsSuffix') : '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
          <div class="quiz-action">
            ${isOpen ? `
              <button onclick="MoodleUI.startQuiz('${quizId}')" class="btn-primary btn-lg">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>
                ${t('moodleQuiz.startQuiz')}
              </button>
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
    const modal = document.createElement('div');
    modal.id = 'createForumModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3>新增討論區</h3>
          <button onclick="MoodleUI.closeModal('createForumModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">討論區名稱 *</label>
            <input type="text" id="newForumTitle" placeholder="例如：課程公告、學習交流" style="width: 100%; padding: 0.75rem; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 1rem;">
          </div>
          <div class="form-group" style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">說明</label>
            <textarea id="newForumDesc" rows="3" placeholder="討論區說明（選填）" style="width: 100%; padding: 0.75rem; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 1rem; resize: vertical;"></textarea>
          </div>
          <div class="form-group" style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">類型</label>
            <select id="newForumType" style="width: 100%; padding: 0.75rem; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 1rem;">
              <option value="general">一般討論</option>
              <option value="news">公告</option>
              <option value="qanda">問與答</option>
            </select>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.75rem; padding: 1rem 1.5rem; border-top: 1px solid var(--gray-200);">
          <button onclick="MoodleUI.closeModal('createForumModal')" class="btn-secondary" style="padding: 0.75rem 1.5rem; background: var(--gray-200); border: none; border-radius: 8px; cursor: pointer;">取消</button>
          <button onclick="MoodleUI.submitCreateForum('${courseId}')" class="btn-primary" style="padding: 0.75rem 1.5rem; background: var(--olive); color: var(--cream); border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">建立</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createForumModal'); };
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
    const modal = document.createElement('div');
    modal.id = 'newDiscussionModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${t('moodleDiscussion.newTitle')}</h3>
          <button onclick="MoodleUI.closeModal('newDiscussionModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>${t('moodleDiscussion.subjectLabel')}</label>
            <input type="text" id="discussionSubject" placeholder="${t('moodleDiscussion.subjectPlaceholder')}">
          </div>
          <div class="form-group">
            <label>${t('moodleDiscussion.contentLabel')}</label>
            <textarea id="discussionMessage" rows="6" placeholder="${t('moodleDiscussion.contentPlaceholder')}"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('newDiscussionModal')" class="btn-secondary">${t('moodleDiscussion.cancel')}</button>
          <button onclick="MoodleUI.submitNewDiscussion('${forumId}')" class="btn-primary">${t('moodleDiscussion.publish')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('newDiscussionModal'); };
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

      container.innerHTML = `
        <div class="discussion-detail">
          <button onclick="MoodleUI.openForum('${forumId}')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            ${t('moodleDiscussion.backToForum')}
          </button>
          <div class="discussion-main">
            <div class="discussion-post main-post">
              <div class="post-header">
                <div class="post-avatar">${(discussion.authorName || 'U')[0]}</div>
                <div class="post-meta">
                  <span class="author-name">${discussion.authorName}</span>
                  <span class="post-time">${new Date(discussion.createdAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')}</span>
                </div>
              </div>
              <h2 class="post-title">${discussion.subject}</h2>
              <div class="post-content">${discussion.message}</div>
            </div>

            <div class="replies-section">
              <h3>${discussion.posts?.length || 0} ${t('moodleDiscussion.repliesCount')}</h3>
              ${(discussion.posts || []).map(p => `
                <div class="discussion-post reply-post">
                  <div class="post-header">
                    <div class="post-avatar">${(p.authorName || 'U')[0]}</div>
                    <div class="post-meta">
                      <span class="author-name">${p.authorName}</span>
                      <span class="post-time">${new Date(p.createdAt).toLocaleString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW')}</span>
                    </div>
                  </div>
                  <div class="post-content">${p.message}</div>
                  <div class="post-actions">
                    <button onclick="MoodleUI.likePost('${forumId}', '${discussionId}', '${p.postId}')" class="btn-like ${p.liked ? 'liked' : ''}">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
                        <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                      </svg>
                      ${p.likes || 0}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>

            ${!discussion.locked ? `
              <div class="reply-form">
                <h4>${t('moodleDiscussion.replyTitle')}</h4>
                <textarea id="replyMessage" rows="4" placeholder="${t('moodleDiscussion.replyPlaceholder')}"></textarea>
                <button onclick="MoodleUI.submitReply('${forumId}', '${discussionId}')" class="btn-primary">${t('moodleDiscussion.replyBtn')}</button>
              </div>
            ` : `<div class="locked-notice">${t('moodleDiscussion.locked')}</div>`}
          </div>
        </div>
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
  openDayEvents(year, month, day) {
    // 可以展開顯示當天的所有事件
    showToast(`${year}/${month + 1}/${day} ${t('moodleCalendar.eventsOf')}`);
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
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
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
          const result = await API.courses.list();
          const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
          container.innerHTML = `
            <div class="page-header"><h2>${t('moodleGradebook.title')}</h2><p>${t('moodleGradebook.selectCourse')}</p></div>
            <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;padding:1rem 0;">
              ${courses.length === 0 ? `<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:2rem;">${t('moodleGradebook.noCourses')}</p>` :
                courses.map(c => `
                  <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;transition:box-shadow 0.2s;"
                       onclick="MoodleUI.openGradebookManagement('${c.courseId || c.id}')"
                       onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'">
                    <h3 style="margin:0 0 0.5rem;font-size:1.1rem;">${c.title || c.name || t('moodleGradebook.untitledCourse')}</h3>
                    <p style="margin:0;color:var(--gray-400);font-size:0.9rem;">${c.shortName || c.category || ''}</p>
                  </div>
                `).join('')}
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
    if (!confirm(t('moodleGradeCategory.confirmDelete'))) return;

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

        if (categories.length === 0) {
          container.innerHTML = `<div class="empty-list" style="padding: 3rem; text-align: center; color: var(--gray-400);">${t('moodleQuestionBank.noQuestions')}</div>`;
          return;
        }

        const catColors = [
          'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        ];

        container.innerHTML = `
          <div style="padding: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem;">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--olive)" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
              <div>
                <h2 style="font-size: 1.5rem; font-weight: 700; margin: 0;">${t('moodleQuestionBank.title')}</h2>
                <p style="color: var(--gray-500); margin: 0.25rem 0 0; font-size: 0.9rem;">請選擇題庫類別</p>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem;">
              ${categories.map((cat, idx) => `
                <div onclick="MoodleUI.openQuestionBank('${cat.id}')"
                     style="background: var(--white); border-radius: 16px; overflow: hidden; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.06);"
                     onmouseover="this.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)';this.style.transform='translateY(-2px)'"
                     onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)';this.style.transform='none'">
                  <div style="height: 8px; background: ${catColors[idx % catColors.length]};"></div>
                  <div style="padding: 1.5rem;">
                    <h3 style="font-size: 1.15rem; font-weight: 600; margin: 0 0 0.5rem;">${cat.name}</h3>
                    <p style="color: var(--gray-500); font-size: 0.85rem; margin: 0 0 1rem;">${cat.description || ''}</p>
                    <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--gray-400);">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      ${cat.questionCount || 0} 道題目
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
    const backHeader = `
      <div style="padding: 1.5rem 1.5rem 0;">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
          <button onclick="MoodleUI.openQuestionBank()" style="background: var(--gray-100); border: none; padding: 0.5rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
          <div>
            <h2 style="font-size: 1.3rem; font-weight: 700; margin: 0;">${catName} — ${t('moodleQuestionBank.title')}</h2>
            <p style="color: var(--gray-500); margin: 0.25rem 0 0; font-size: 0.85rem;">${questions.length} 道題目</p>
          </div>
        </div>
      </div>
    `;
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
    if (!confirm(t('moodleNewQuestion.confirmDelete'))) return;

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

            <div id="completionSettingsArea" style="${settings.enabled ? '' : 'display:none'}">
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
        document.getElementById('completionSettingsArea').style.display = this.checked ? '' : 'none';
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
              <div class="progress-fill" style="width: ${progress}%"></div>
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
    if (!confirm(t('moodleCompletion.confirmComplete'))) return;

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
    if (!confirm(t('moodleRoles.confirmDelete'))) return;

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
      <ul class="category-tree-list" style="padding-left: ${level * 20}px;">
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
            <div class="category-children" style="display: none;">
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
      const isExpanded = children.style.display !== 'none';
      children.style.display = isExpanded ? 'none' : 'block';
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
    if (!confirm(t('moodleCategories.confirmDelete'))) return;

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
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">${t('moodleRubrics.title')}</h2>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="MoodleUI.openCreateRubricModal()" class="btn-primary">+ ${t('moodleRubrics.createBtn')}</button>
          ${templates.length > 0 ? '<button onclick="MoodleUI.openCreateRubricFromTemplate()" class="btn-secondary">從範本建立</button>' : ''}
        </div>
      </div>
      <div class="filter-tabs" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;">
        ${['all','active','draft'].map(f => `
          <button class="btn-sm ${this.currentRubricsFilter === f ? 'btn-primary' : 'btn-secondary'}"
                  onclick="MoodleUI.currentRubricsFilter='${f}';MoodleUI.renderRubricsPage(document.getElementById('rubricsContent'),MoodleUI._rubricsData,MoodleUI._rubricsTemplates)">
            ${f === 'all' ? t('common.all') : f === 'active' ? t('common.active') : t('common.draft')}
          </button>
        `).join('')}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${filtered.length === 0 ? `<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">${t('moodleRubrics.noRubrics')}</p>` :
          filtered.map(r => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewRubricDetail('${r.rubricId || r.id}')">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
                <h3 style="margin:0;font-size:1.1rem;">${r.name || t('common.unnamed')}</h3>
                <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;background:${r.status === 'active' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                  ${r.status === 'active' ? t('common.active') : t('common.draft')}
                </span>
              </div>
              <p style="margin:0 0 0.5rem;color:var(--gray-400);font-size:0.9rem;">${r.description || t('common.noDescription')}</p>
              <div style="display:flex;gap:1rem;font-size:0.85rem;color:var(--gray-400);">
                <span>${t('moodleRubrics.criteria')}：${(r.criteria || []).length}</span>
                <span>${t('moodleRubrics.maxScore')}：${r.maxScore || 0}</span>
              </div>
            </div>
          `).join('')}
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
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openRubricsManager()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← ${t('common.backToList')}</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.25rem;">${r.name || t('common.unnamed')}</h2>
            <p style="margin:0;color:var(--gray-400);">${r.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.duplicateRubric('${rubricId}')" class="btn-sm btn-secondary">${t('common.duplicate')}</button>
            <button onclick="MoodleUI.deleteRubric('${rubricId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">${t('moodleGradeCategory.delete')}</button>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <thead>
              <tr style="background:var(--gray-100);">
                <th style="padding:10px;text-align:left;border:1px solid var(--gray-200);">${t('moodleRubrics.criteria')}</th>
                <th style="padding:10px;text-align:left;border:1px solid var(--gray-200);">${t('common.description')}</th>
                <th style="padding:10px;text-align:center;border:1px solid var(--gray-200);">${t('moodleGrade.score')}</th>
                <th style="padding:10px;text-align:left;border:1px solid var(--gray-200);">${t('moodleGradebook.letterCol')}</th>
              </tr>
            </thead>
            <tbody>
              ${criteria.map(c => `
                <tr>
                  <td style="padding:10px;border:1px solid var(--gray-200);font-weight:600;">${c.name || ''}</td>
                  <td style="padding:10px;border:1px solid var(--gray-200);">${c.description || ''}</td>
                  <td style="padding:10px;text-align:center;border:1px solid var(--gray-200);">${c.maxScore || c.points || 0}</td>
                  <td style="padding:10px;border:1px solid var(--gray-200);">
                    ${(c.levels || []).map(l => `<span style="display:inline-block;margin:2px;padding:2px 6px;background:var(--gray-100);border-radius:4px;font-size:0.8rem;">${l.name}: ${l.score || l.points || 0}</span>`).join(' ')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:1rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
          <strong>${t('moodleRubrics.maxScore')}：</strong>${r.maxScore || 0} ｜ <strong>${t('common.status')}：</strong>${r.status === 'active' ? t('common.active') : t('common.draft')}
        </div>`;
    } catch (error) {
      console.error('View rubric detail error:', error);
      container.innerHTML = `<div class="error">${t('common.loadFailed')}</div>`;
    }
  },

  openCreateRubricModal() {
    const modal = document.createElement('div');
    modal.id = 'createRubricModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>${t('moodleRubrics.createTitle')}</h3>
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
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
          <h4>${t('moodleRubrics.gradingCriteria')}</h4>
          <div id="rubricCriteriaList">
            <div class="rubric-criterion-item" style="border:1px solid var(--gray-200);border-radius:8px;padding:1rem;margin-bottom:0.75rem;">
              <div class="form-row">
                <div class="form-group" style="flex:1"><label>${t('moodleRubrics.criterionName')}</label><input type="text" class="criterion-name" placeholder="${t('moodleRubrics.criterionNamePlaceholder')}"></div>
                <div class="form-group" style="flex:1"><label>${t('moodleAssignmentCreate.maxScore')}</label><input type="number" class="criterion-score" value="25" min="0"></div>
                <button type="button" onclick="this.closest('.rubric-criterion-item').remove()" style="align-self:flex-end;background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.2rem;padding:6px;">×</button>
              </div>
              <div class="form-group"><label>${t('common.description')}</label><input type="text" class="criterion-desc" placeholder="${t('moodleRubrics.criterionDescPlaceholder')}"></div>
              <div class="criterion-levels" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
                  <input type="text" class="level-name" value="${t('moodleRubrics.levelExcellent')}" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
                  <input type="number" class="level-score" value="25" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
                </div>
                <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
                  <input type="text" class="level-name" value="${t('moodleRubrics.levelGood')}" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
                  <input type="number" class="level-score" value="18" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
                </div>
                <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
                  <input type="text" class="level-name" value="${t('moodleRubrics.levelNeedsWork')}" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
                  <input type="number" class="level-score" value="10" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
                </div>
              </div>
            </div>
          </div>
          <button onclick="MoodleUI.addRubricCriterion()" class="btn-sm btn-secondary" style="margin-top:0.5rem;">${t('moodleRubrics.addCriterion')}</button>
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
    const item = document.createElement('div');
    item.className = 'rubric-criterion-item';
    item.style = 'border:1px solid var(--gray-200);border-radius:8px;padding:1rem;margin-bottom:0.75rem;';
    item.innerHTML = `
      <div class="form-row">
        <div class="form-group" style="flex:1"><label>${t('moodleRubrics.criterionName')}</label><input type="text" class="criterion-name" placeholder="${t('moodleRubrics.criterionName')}"></div>
        <div class="form-group" style="flex:1"><label>${t('moodleRubrics.maxScore')}</label><input type="number" class="criterion-score" value="25" min="0"></div>
        <button type="button" onclick="this.closest('.rubric-criterion-item').remove()" style="align-self:flex-end;background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.2rem;padding:6px;">×</button>
      </div>
      <div class="form-group"><label>${t('common.description')}</label><input type="text" class="criterion-desc" placeholder="${t('moodleRubrics.criterionDescPlaceholder')}"></div>
      <div class="criterion-levels" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
          <input type="text" class="level-name" value="${t('moodleRubrics.levelExcellent')}" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
          <input type="number" class="level-score" value="25" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
        </div>
        <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
          <input type="text" class="level-name" value="${t('moodleRubrics.levelGood')}" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
          <input type="number" class="level-score" value="18" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
        </div>
        <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
          <input type="text" class="level-name" value="${t('moodleRubrics.levelNeedsWork')}" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
          <input type="number" class="level-score" value="10" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
        </div>
      </div>`;
    list.appendChild(item);
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
    if (!confirm(t('moodleRubrics.confirmDelete'))) return;
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
      <div class="modal-content">
        <div class="modal-header">
          <h3>${t('moodleRubrics.createFromTemplate')}</h3>
          <button onclick="MoodleUI.closeModal('rubricTemplateModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          ${templates.map(t => `
            <div style="padding:1rem;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:0.75rem;cursor:pointer;"
                 onclick="MoodleUI.closeModal('rubricTemplateModal');MoodleUI.duplicateRubric('${t.rubricId || t.id}')">
              <h4 style="margin:0 0 0.25rem;">${t.name || t('moodleRubrics.template')}</h4>
              <p style="margin:0;font-size:0.85rem;color:var(--gray-400);">${t.description || ''}</p>
            </div>
          `).join('')}
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
    const canManage = !!(user && (user.isAdmin || ['manager', 'coursecreator', 'educator', 'trainer', 'creator', 'teacher', 'assistant'].includes(user.role)));
    const filtered = this.currentBadgesFilter === 'all' ? badges :
      badges.filter(b => b.status === this.currentBadgesFilter || b.type === this.currentBadgesFilter);

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">${t('moodleBadges.title')}</h2>
        ${canManage ? `<button onclick="MoodleUI.openCreateBadgeModal()" class="btn-primary">${t('moodleBadges.createBadge')}</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:1.5rem;">
        <div style="padding:1rem;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:8px;">
          <div style="font-size:1.8rem;font-weight:700;">${stats.totalBadges || badges.length}</div>
          <div style="font-size:0.85rem;opacity:0.9;">${t('moodleBadges.totalBadges')}</div>
        </div>
        <div style="padding:1rem;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;border-radius:8px;">
          <div style="font-size:1.8rem;font-weight:700;">${stats.activeBadges || 0}</div>
          <div style="font-size:0.85rem;opacity:0.9;">${t('moodleBadges.activeBadges')}</div>
        </div>
        <div style="padding:1rem;background:linear-gradient(135deg,#4facfe,#00f2fe);color:#fff;border-radius:8px;">
          <div style="font-size:1.8rem;font-weight:700;">${stats.totalIssued || 0}</div>
          <div style="font-size:0.85rem;opacity:0.9;">${t('moodleBadges.totalIssued')}</div>
        </div>
      </div>
      <div class="filter-tabs" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;">
        ${['all','active','draft','course','site'].map(f => `
          <button class="btn-sm ${this.currentBadgesFilter === f ? 'btn-primary' : 'btn-secondary'}"
                  onclick="MoodleUI.currentBadgesFilter='${f}';MoodleUI.renderBadgesPage(document.getElementById('badgesContent'),MoodleUI._badgesData,MoodleUI._badgesStats)">
            ${{all:t('common.all'),active:t('common.active'),draft:t('common.draft'),course:t('moodleBadges.course'),site:t('moodleBadges.site')}[f]}
          </button>
        `).join('')}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem;">
        ${filtered.length === 0 ? `<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">${t('moodleBadges.noBadges')}</p>` :
          filtered.map(b => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;text-align:center;"
                 onclick="MoodleUI.viewBadgeDetail('${b.badgeId || b.id}')">
              <div style="width:64px;height:64px;margin:0 auto 1rem;background:${b.color || '#f59e0b'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">
                ${b.icon || '🏆'}
              </div>
              <h3 style="margin:0 0 0.5rem;font-size:1rem;">${b.name || t('common.unnamed')}</h3>
              <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;background:${b.status === 'active' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                ${b.status === 'active' ? t('common.active') : t('common.draft')}
              </span>
              <div style="margin-top:0.75rem;font-size:0.85rem;color:var(--gray-400);">
                <span>${t('moodleBadges.typeLabel')}：${({course:t('moodleBadges.course'),site:t('moodleBadges.site'),manual:t('moodleBadges.manual')})[b.type] || b.type || '—'}</span>
                <span style="margin-left:0.5rem;">${t('moodleBadges.issuedLabel')}：${b.issuedCount || 0}</span>
              </div>
            </div>
          `).join('')}
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

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openBadges()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← ${t('common.backToList')}</button>
        </div>
        <div style="display:flex;gap:2rem;margin-bottom:2rem;">
          <div style="width:120px;height:120px;background:${b.color || '#f59e0b'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:3rem;flex-shrink:0;">
            ${b.icon || '🏆'}
          </div>
          <div style="flex:1;">
            <h2 style="margin:0 0 0.5rem;">${b.name || t('common.unnamed')}</h2>
            <p style="margin:0 0 0.5rem;color:var(--gray-400);">${b.description || t('common.noDescription')}</p>
            <div style="display:flex;gap:1rem;font-size:0.9rem;">
              <span>${t('moodleBadges.typeLabel')}：${({course:t('moodleBadges.course'),site:t('moodleBadges.site'),manual:t('moodleBadges.manual')})[b.type] || b.type || '—'}</span>
              <span>${t('common.status')}：${b.status === 'active' ? t('common.active') : t('common.draft')}</span>
              <span>${t('moodleBadges.issuedLabel')}：${b.issuedCount || 0}</span>
            </div>
          </div>
          ${canManage ? `
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <button onclick="MoodleUI.openIssueBadgeModal('${badgeId}')" class="btn-primary btn-sm">${t('moodleBadges.issueBadge')}</button>
              <button onclick="MoodleUI.deleteBadge('${badgeId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">${t('moodleGradeCategory.delete')}</button>
            </div>
          ` : ''}
        </div>
        ${(b.criteria || []).length > 0 ? `
          <div style="margin-bottom:1.5rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.75rem;">${t('moodleBadges.criteria')}</h4>
            <ul style="margin:0;padding-left:1.5rem;">${b.criteria.map(c => `<li>${c.description || c.type || t('moodleBadges.criterion')}</li>`).join('')}</ul>
          </div>
        ` : ''}
        <h3>${t('moodleBadges.recipients')}（${recipients.length}）</h3>
        ${recipients.length === 0 ? `<p style="color:var(--gray-400);">${t('moodleBadges.noRecipients')}</p>` : `
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
              <thead><tr style="background:var(--gray-100);">
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('moodleH5p.uniqueUsers')}</th>
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('moodleBadges.issueDateCol')}</th>
                <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">${t('common.actions')}</th>
              </tr></thead>
              <tbody>
                ${recipients.map(r => `
                  <tr>
                    <td style="padding:8px;border:1px solid var(--gray-200);">${r.userName || r.userId || '—'}</td>
                    <td style="padding:8px;border:1px solid var(--gray-200);">${this.formatDate(r.issuedAt || r.createdAt, 'datetime')}</td>
                    <td style="padding:8px;text-align:center;border:1px solid var(--gray-200);">
                      ${canManage ? `<button onclick="MoodleUI.revokeBadge('${badgeId}','${r.userId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.8rem;">${t('moodleBadges.revoke')}</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}`;
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
    if (!confirm(t('moodleBadges.confirmRevoke'))) return;
    try {
      const result = await API.badges.revoke(badgeId, userId);
      if (result.success) { showToast(t('moodleBadges.revoked')); this.viewBadgeDetail(badgeId); }
      else { showToast(result.error || t('common.revokeFailed')); }
    } catch (error) { showToast(t('common.revokeFailed')); }
  },

  async deleteBadge(badgeId) {
    if (!confirm(t('moodleBadges.confirmDelete'))) return;
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
    const difficultyLabels = { beginner: t('moodlePaths.beginner'), intermediate: t('moodlePaths.intermediate'), advanced: t('moodlePaths.advanced') };
    const difficultyColors = { beginner: '#dcfce7', intermediate: '#fef3c7', advanced: '#fee2e2' };
    const difficultyText = { beginner: '#166534', intermediate: '#92400e', advanced: '#dc2626' };

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">${t('moodlePaths.title')}</h2>
        ${canManage ? `<button onclick="MoodleUI.openCreateLearningPathModal()" class="btn-primary">${t('moodlePaths.create')}</button>` : ''}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${paths.length === 0 ? `<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">${t('moodlePaths.noPaths')}</p>` :
          paths.map(p => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewLearningPathDetail('${p.pathId || p.id}')">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
                <h3 style="margin:0;font-size:1.1rem;">${p.name || p.title || t('common.unnamed')}</h3>
                <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;background:${difficultyColors[p.difficulty] || '#f3f4f6'};color:${difficultyText[p.difficulty] || '#374151'};">
                  ${difficultyLabels[p.difficulty] || p.difficulty || '—'}
                </span>
              </div>
              <p style="margin:0 0 0.75rem;color:var(--gray-400);font-size:0.9rem;">${p.description || t('common.noDescription')}</p>
              <div style="display:flex;gap:1rem;font-size:0.85rem;color:var(--gray-400);">
                <span>${t('moodlePaths.coursesLabel')}${(p.courses || []).length}</span>
                <span>${t('moodlePaths.durationLabel')}${p.duration || '—'}</span>
                <span>${t('moodlePaths.enrolledLabel')}${p.enrolledCount || 0}</span>
              </div>
              ${p.progress != null ? `
                <div style="margin-top:0.75rem;">
                  <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
                    <span>${t('moodlePaths.progress')}</span><span>${Math.round(p.progress)}%</span>
                  </div>
                  <div style="height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${p.progress}%;background:var(--primary);border-radius:3px;"></div>
                  </div>
                </div>
              ` : ''}
            </div>
          `).join('')}
      </div>`;
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

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openLearningPaths()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← ${t('common.backToList')}</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.5rem;">${p.name || p.title || t('common.unnamed')}</h2>
            <p style="margin:0;color:var(--gray-400);">${p.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.enrollLearningPath('${pathId}')" class="btn-primary btn-sm">${t('moodlePaths.enroll')}</button>
            ${canManage ? `<button onclick="MoodleUI.deleteLearningPath('${pathId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">${t('moodleGradeCategory.delete')}</button>` : ''}
          </div>
        </div>
        ${progress != null ? `
          <div style="margin-bottom:1.5rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span>${t('moodlePaths.overallProgress')}</span><span>${Math.round(typeof progress === 'object' ? progress.overallProgress || 0 : progress)}%</span>
            </div>
            <div style="height:8px;background:var(--gray-200);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${typeof progress === 'object' ? progress.overallProgress || 0 : progress}%;background:var(--primary);border-radius:4px;"></div>
            </div>
          </div>
        ` : ''}
        <h3 style="margin-bottom:1rem;">${t('moodlePaths.courseSequence')}（${courses.length} ${t('moodlePaths.courseUnit')}）</h3>
        <div style="position:relative;padding-left:2rem;">
          ${courses.map((c, idx) => `
            <div style="display:flex;align-items:start;margin-bottom:1.5rem;position:relative;">
              <div style="position:absolute;left:-2rem;width:28px;height:28px;background:${c.completed ? 'var(--primary)' : 'var(--gray-300)'};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:600;">
                ${c.completed ? '✓' : idx + 1}
              </div>
              ${idx < courses.length - 1 ? `<div style="position:absolute;left:calc(-2rem + 13px);top:28px;width:2px;height:calc(100% + 0.5rem);background:var(--gray-200);"></div>` : ''}
              <div style="flex:1;padding:1rem;border:1px solid var(--gray-200);border-radius:8px;margin-left:0.5rem;${c.completed ? 'border-color:var(--primary);background:#f0f9ff;' : ''}">
                <h4 style="margin:0 0 0.25rem;">${c.title || c.name || t('moodlePaths.courseDefault') + ' ' + (idx + 1)}</h4>
                <p style="margin:0;font-size:0.85rem;color:var(--gray-400);">${c.description || ''}</p>
              </div>
            </div>
          `).join('')}
        </div>
        ${report.totalEnrolled ? `
          <div style="margin-top:1.5rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.5rem;">${t('moodlePaths.statistics')}</h4>
            <div style="display:flex;gap:2rem;font-size:0.9rem;">
              <span>${t('moodlePaths.totalEnrolled')}${report.totalEnrolled}</span>
              <span>${t('moodlePaths.completionRateLabel')}${report.completionRate ? Math.round(report.completionRate) + '%' : '—'}</span>
            </div>
          </div>
        ` : ''}`;
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
            <select id="lpCourses" multiple style="min-height:120px;">
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
    if (!confirm(t('moodlePaths.confirmDelete'))) return;
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
    const severityColors = { info: '#3b82f6', warning: '#f59e0b', error: '#ef4444', critical: '#dc2626' };
    const severityLabels = { info: t('moodleAudit.severityInfo'), warning: t('moodleAudit.severityWarning'), error: t('moodleAudit.severityError'), critical: t('moodleAudit.severityCritical') };

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">${t('moodleAudit.title')}</h2>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="MoodleUI.exportAuditLogs('csv')" class="btn-secondary btn-sm">${t('moodleGradebook.exportCsv')}</button>
          <button onclick="MoodleUI.exportAuditLogs('json')" class="btn-secondary btn-sm">${t('moodleAudit.exportJson')}</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
        <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;">${stats.totalLogs || logs.length}</div>
          <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleAudit.totalRecords')}</div>
        </div>
        ${Object.entries(stats.severityCounts || {}).map(([sev, count]) => `
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;color:${severityColors[sev] || '#333'};">${count}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${severityLabels[sev] || sev}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;align-items:end;">
        <div class="form-group" style="margin:0;min-width:150px;">
          <label style="font-size:0.8rem;">${t('moodleAudit.eventType')}</label>
          <select id="auditFilterType" onchange="MoodleUI.filterAuditLogs()" style="font-size:0.9rem;padding:6px;">
            <option value="">全部</option>
            ${eventTypes.map(et => `<option value="${et.type || et}" ${this.currentAuditFilters.eventType === (et.type || et) ? 'selected' : ''}>${et.label || et.name || et}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:120px;">
          <label style="font-size:0.8rem;">${t('moodleAudit.severity')}</label>
          <select id="auditFilterSeverity" onchange="MoodleUI.filterAuditLogs()" style="font-size:0.9rem;padding:6px;">
            <option value="">${t('common.all')}</option>
            <option value="info" ${this.currentAuditFilters.severity === 'info' ? 'selected' : ''}>${t('moodleAudit.severityInfo')}</option>
            <option value="warning" ${this.currentAuditFilters.severity === 'warning' ? 'selected' : ''}>${t('moodleAudit.severityWarning')}</option>
            <option value="error" ${this.currentAuditFilters.severity === 'error' ? 'selected' : ''}>${t('moodleAudit.severityError')}</option>
            <option value="critical" ${this.currentAuditFilters.severity === 'critical' ? 'selected' : ''}>${t('moodleAudit.severityCritical')}</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:140px;">
          <label style="font-size:0.8rem;">${t('moodleAudit.startDate')}</label>
          <input type="date" id="auditFilterStartDate" onchange="MoodleUI.filterAuditLogs()" style="font-size:0.9rem;padding:6px;">
        </div>
        <div class="form-group" style="margin:0;min-width:140px;">
          <label style="font-size:0.8rem;">${t('moodleAudit.endDate')}</label>
          <input type="date" id="auditFilterEndDate" onchange="MoodleUI.filterAuditLogs()" style="font-size:0.9rem;padding:6px;">
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead>
            <tr style="background:var(--gray-100);">
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('moodleAudit.timeCol')}</th>
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('moodleAudit.eventType')}</th>
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('common.user')}</th>
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">IP</th>
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('common.description')}</th>
              <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">${t('moodleAudit.severity')}</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length === 0 ? '<tr><td colspan="6" style="padding:2rem;text-align:center;color:var(--gray-400);border:1px solid var(--gray-200);">無記錄</td></tr>' :
              logs.map(log => `
                <tr>
                  <td style="padding:8px;border:1px solid var(--gray-200);white-space:nowrap;">${this.formatDate(log.createdAt || log.timestamp, 'datetime')}</td>
                  <td style="padding:8px;border:1px solid var(--gray-200);">${log.eventType || '—'}</td>
                  <td style="padding:8px;border:1px solid var(--gray-200);">${log.userName || log.userId || '—'}</td>
                  <td style="padding:8px;border:1px solid var(--gray-200);">${log.ipAddress || log.ip || '—'}</td>
                  <td style="padding:8px;border:1px solid var(--gray-200);">${log.description || log.message || '—'}</td>
                  <td style="padding:8px;text-align:center;border:1px solid var(--gray-200);">
                    <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;color:#fff;background:${severityColors[log.severity] || '#6b7280'};">
                      ${severityLabels[log.severity] || log.severity || '—'}
                    </span>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
      ${pagination.totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:0.5rem;margin-top:1rem;">
          ${this.currentAuditFilters.page > 1 ? `<button onclick="MoodleUI.currentAuditFilters.page--;MoodleUI.openAuditLogs()" class="btn-sm btn-secondary">上一頁</button>` : ''}
          <span style="padding:6px 12px;font-size:0.9rem;">${t('moodleAudit.pageInfo', {current: pagination.page || this.currentAuditFilters.page, total: pagination.totalPages})}</span>
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
    const typeIcons = { 'Interactive Video': '🎬', 'Course Presentation': '📊', 'Quiz': '❓', 'Drag and Drop': '🎯', 'Fill in the Blanks': '✏️', 'Dialog Cards': '🃏', 'Timeline': '📅', 'Flashcards': '🗂️' };

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">${t('moodleH5p.title')}</h2>
        <button onclick="MoodleUI.openCreateH5pModal()" class="btn-primary">+ ${t('moodleH5p.createBtn')}</button>
      </div>
      <div class="filter-tabs" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
        <button class="btn-sm ${this.currentH5pFilter === 'all' ? 'btn-primary' : 'btn-secondary'}"
                onclick="MoodleUI.currentH5pFilter='all';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${t('common.all')}</button>
        <button class="btn-sm ${this.currentH5pFilter === 'published' ? 'btn-primary' : 'btn-secondary'}"
                onclick="MoodleUI.currentH5pFilter='published';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${t('common.published')}</button>
        <button class="btn-sm ${this.currentH5pFilter === 'draft' ? 'btn-primary' : 'btn-secondary'}"
                onclick="MoodleUI.currentH5pFilter='draft';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${t('common.draft')}</button>
        ${types.slice(0, 5).map(t => {
          const typeName = t.name || t.type || t;
          return `<button class="btn-sm ${this.currentH5pFilter === typeName ? 'btn-primary' : 'btn-secondary'}"
                onclick="MoodleUI.currentH5pFilter='${typeName}';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${typeName}</button>`;
        }).join('')}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${filtered.length === 0 ? `<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">${t('moodleH5p.noContent')}</p>` :
          filtered.map(c => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewH5pDetail('${c.contentId || c.id}')">
              <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                <span style="font-size:1.5rem;">${typeIcons[c.contentType] || '📦'}</span>
                <div style="flex:1;">
                  <h3 style="margin:0;font-size:1rem;">${c.title || t('common.unnamed')}</h3>
                  <span style="font-size:0.8rem;color:var(--gray-400);">${c.contentType || '—'}</span>
                </div>
                <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:${c.status === 'published' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                  ${c.status === 'published' ? t('common.published') : t('common.draft')}
                </span>
              </div>
              <div style="display:flex;gap:1rem;font-size:0.8rem;color:var(--gray-400);">
                <span>${t('moodleH5p.views')}：${c.viewCount || 0}</span>
                <span>${t('moodleH5p.attempts')}：${c.attemptCount || 0}</span>
              </div>
            </div>
          `).join('')}
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
      const c = contentResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const embed = embedResult.success ? embedResult.data : {};

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openH5pManager()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.25rem;">${c.title || t('common.unnamed')}</h2>
            <p style="margin:0;color:var(--gray-400);">${c.contentType || ''} — ${c.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.duplicateH5pContent('${contentId}')" class="btn-sm btn-secondary">${t('common.duplicate')}</button>
            <button onclick="MoodleUI.deleteH5pContent('${contentId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">${t('moodleGradeCategory.delete')}</button>
          </div>
        </div>
        ${embed.embedCode || embed.html ? `
          <div style="margin-bottom:1.5rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.5rem;">${t('moodleH5p.preview')}</h4>
            <div style="border:1px solid var(--gray-200);border-radius:4px;min-height:200px;background:#fff;padding:1rem;">
              ${embed.embedCode || embed.html || `<p style="color:var(--gray-400);text-align:center;">${t('moodleH5p.cannotPreview')}</p>`}
            </div>
          </div>
        ` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.totalAttempts || c.attemptCount || 0}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleH5p.totalAttempts')}</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.uniqueUsers || 0}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleH5p.uniqueUsers')}</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.averageScore != null ? Math.round(report.averageScore) + '%' : '—'}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleH5p.avgScore')}</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${c.viewCount || 0}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleH5p.viewCount')}</div>
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
    if (!confirm(t('moodleH5p.confirmDelete'))) return;
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
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">${t('moodleLtiMgmt.title')}</h2>
        <button onclick="MoodleUI.openRegisterLtiToolModal()" class="btn-primary">+ ${t('moodleLtiMgmt.registerBtn')}</button>
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${tools.length === 0 ? `<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">${t('moodleLtiMgmt.noTools')}</p>` :
          tools.map(t => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewLtiToolDetail('${t.toolId || t.id}')">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
                <h3 style="margin:0;font-size:1.1rem;">${t.name || t('common.unnamed')}</h3>
                <div style="display:flex;gap:0.25rem;">
                  <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:#e0e7ff;color:#3730a3;">
                    LTI ${t.ltiVersion || t.version || '1.1'}
                  </span>
                  <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:${t.status === 'active' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                    ${t.status === 'active' ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
              </div>
              <p style="margin:0 0 0.5rem;color:var(--gray-400);font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${t.toolUrl || t.launchUrl || t.url || '—'}
              </p>
              <p style="margin:0;font-size:0.85rem;color:var(--gray-400);">${t.description || ''}</p>
            </div>
          `).join('')}
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
      const t = toolResult.data;
      const grades = gradesResult.success ? (Array.isArray(gradesResult.data) ? gradesResult.data : (gradesResult.data?.grades || [])) : [];

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openLtiManager()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.25rem;">${t.name || t('common.unnamed')}</h2>
            <p style="margin:0;color:var(--gray-400);">${t.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.launchLtiTool('${toolId}')" class="btn-primary btn-sm">${t('moodleScorm.launch')}</button>
            <button onclick="MoodleUI.deleteLtiTool('${toolId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">${t('moodleGradeCategory.delete')}</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.75rem;">${t('moodleLtiMgmt.toolSettings')}</h4>
            <div style="font-size:0.9rem;">
              <p><strong>${t('moodleLtiMgmt.launchUrl')}：</strong><span style="word-break:break-all;">${t.toolUrl || t.launchUrl || t.url || '—'}</span></p>
              <p><strong>${t('moodleLtiMgmt.version')}：</strong>LTI ${t.ltiVersion || t.version || '1.1'}</p>
              <p><strong>Consumer Key：</strong>${t.consumerKey || '—'}</p>
              <p><strong>${t('common.status')}：</strong>${t.status === 'active' ? t('common.active') : t('common.inactive')}</p>
              ${t.customParameters ? `<p><strong>${t('moodleLtiMgmt.customParams')}：</strong>${typeof t.customParameters === 'string' ? t.customParameters : JSON.stringify(t.customParameters)}</p>` : ''}
            </div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.75rem;">${t('moodleLtiMgmt.privacySettings')}</h4>
            <div style="font-size:0.9rem;">
              <p><strong>${t('moodleLtiMgmt.shareName')}：</strong>${t.shareName !== false ? t('common.yes') : t('common.no')}</p>
              <p><strong>${t('moodleLtiMgmt.shareEmail')}：</strong>${t.shareEmail !== false ? t('common.yes') : t('common.no')}</p>
              <p><strong>${t('moodleLtiMgmt.acceptGrades')}：</strong>${t.acceptGrades !== false ? t('common.yes') : t('common.no')}</p>
            </div>
          </div>
        </div>
        ${grades.length > 0 ? `
          <h3>${t('moodleLtiMgmt.gradeRecords')}（${grades.length}）</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
              <thead><tr style="background:var(--gray-100);">
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('common.user')}</th>
                <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">${t('moodleGrade.score')}</th>
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('common.date')}</th>
              </tr></thead>
              <tbody>
                ${grades.map(g => `
                  <tr>
                    <td style="padding:8px;border:1px solid var(--gray-200);">${g.userName || g.userId || '—'}</td>
                    <td style="padding:8px;text-align:center;border:1px solid var(--gray-200);">${g.score != null ? g.score : '—'}</td>
                    <td style="padding:8px;border:1px solid var(--gray-200);">${this.formatDate(g.createdAt || g.timestamp, 'datetime')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}`;
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
          <div style="display:flex;gap:1.5rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.9rem;">
              <input type="checkbox" id="ltiShareName" checked> ${t('moodleLtiMgmt.shareName')}
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.9rem;">
              <input type="checkbox" id="ltiShareEmail" checked> ${t('moodleLtiMgmt.shareEmail')}
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.9rem;">
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
    if (!confirm(t('moodleLtiMgmt.confirmDelete'))) return;
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
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">${t('moodleScorm.title')}</h2>
        <button onclick="MoodleUI.openCreateScormModal()" class="btn-primary">+ ${t('moodleScorm.createBtn')}</button>
      </div>
      <div class="filter-tabs" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;">
        ${['all','active','draft','archived'].map(f => `
          <button class="btn-sm ${this.currentScormFilter === f ? 'btn-primary' : 'btn-secondary'}"
                  onclick="MoodleUI.currentScormFilter='${f}';MoodleUI.renderScormPage(document.getElementById('scormManagerContent'),MoodleUI._scormData)">
            ${{all:t('common.all'),active:t('common.active'),draft:t('common.draft'),archived:t('moodleScorm.archived')}[f]}
          </button>
        `).join('')}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${filtered.length === 0 ? `<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">${t('moodleScorm.noPackages')}</p>` :
          filtered.map(p => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewScormDetail('${p.packageId || p.id}')">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
                <h3 style="margin:0;font-size:1.1rem;">${p.title || p.name || t('common.unnamed')}</h3>
                <div style="display:flex;gap:0.25rem;">
                  <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:#e0e7ff;color:#3730a3;">
                    SCORM ${p.version || p.scormVersion || '1.2'}
                  </span>
                  <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:${p.status === 'active' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                    ${p.status === 'active' ? t('common.active') : p.status === 'archived' ? t('moodleScorm.archived') : t('common.draft')}
                  </span>
                </div>
              </div>
              <p style="margin:0 0 0.5rem;color:var(--gray-400);font-size:0.85rem;">${p.description || ''}</p>
              <div style="display:flex;gap:1rem;font-size:0.8rem;color:var(--gray-400);">
                <span>${t('moodleCourse.course')}：${p.courseName || p.courseId || '—'}</span>
                <span>${t('moodleScorm.completionRate')}：${p.completionRate != null ? Math.round(p.completionRate) + '%' : '—'}</span>
              </div>
            </div>
          `).join('')}
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
      const p = pkgResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const attempts = attemptsResult.success ? (Array.isArray(attemptsResult.data) ? attemptsResult.data : (attemptsResult.data?.attempts || [])) : [];

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openScormManager()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.25rem;">${p.title || p.name || t('common.unnamed')}</h2>
            <p style="margin:0;color:var(--gray-400);">SCORM ${p.version || p.scormVersion || '1.2'} — ${p.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.launchScormPackage('${packageId}')" class="btn-primary btn-sm">${t('moodleScorm.launch')}</button>
            <button onclick="MoodleUI.deleteScormPackage('${packageId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">${t('moodleGradeCategory.delete')}</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.totalAttempts || attempts.length}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleScorm.totalAttempts')}</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.completionRate != null ? Math.round(report.completionRate) + '%' : '—'}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleScorm.completionRate')}</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.passRate != null ? Math.round(report.passRate) + '%' : '—'}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleScorm.passRate')}</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.averageScore != null ? Math.round(report.averageScore) : '—'}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">${t('moodleScorm.avgScore')}</div>
          </div>
        </div>
        <div style="padding:1rem;background:var(--gray-50);border-radius:8px;margin-bottom:1.5rem;">
          <h4 style="margin:0 0 0.5rem;">${t('moodleScorm.packageSettings')}</h4>
          <div style="display:flex;gap:2rem;font-size:0.9rem;">
            <span><strong>${t('moodleScorm.gradingMethod')}：</strong>${p.gradingMethod || p.gradeMethod || t('moodleScorm.highestScore')}</span>
            <span><strong>${t('moodleScorm.maxAttempts')}：</strong>${p.maxAttempts || t('common.unlimited')}</span>
          </div>
        </div>
        ${attempts.length > 0 ? `
          <h3>${t('moodleScorm.attemptRecords')}</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
              <thead><tr style="background:var(--gray-100);">
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('moodleQuiz.attemptCol')}</th>
                <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">${t('common.status')}</th>
                <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">${t('moodleGrade.score')}</th>
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">${t('moodleQuiz.startTime')}</th>
              </tr></thead>
              <tbody>
                ${attempts.map((a, idx) => `
                  <tr>
                    <td style="padding:8px;border:1px solid var(--gray-200);">#${idx + 1}</td>
                    <td style="padding:8px;text-align:center;border:1px solid var(--gray-200);">
                      <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;background:${a.completionStatus === 'completed' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                        ${a.completionStatus || a.status || t('moodleScorm.inProgress')}
                      </span>
                    </td>
                    <td style="padding:8px;text-align:center;border:1px solid var(--gray-200);">${a.score != null ? a.score : '—'}</td>
                    <td style="padding:8px;border:1px solid var(--gray-200);">${this.formatDate(a.startedAt || a.createdAt, 'datetime')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}`;
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
    if (!confirm(t('moodleScorm.confirmDelete'))) return;
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
    if (!confirm(t('moodleActivityEdit.confirmDelete'))) return;
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
        <div class="category-list">
          ${categories.map(cat => `
            <div class="category-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee">
              <span>${cat.name} (${cat.questionCount || 0} ${t('moodleQuestionBank.questionsUnit')})</span>
              <button onclick="MoodleUI.deleteQuestionCategory('${cat.categoryId}')" class="btn-sm btn-danger">${t('moodleGradeCategory.delete')}</button>
            </div>
          `).join('')}
          ${categories.length === 0 ? `<p class="empty-list">${t('moodleQuestionBank.noCategories')}</p>` : ''}
        </div>
        <hr>
        <form onsubmit="event.preventDefault(); MoodleUI.createQuestionCategory()" style="margin-top:12px">
          <div class="form-group">
            <label>${t('moodleQuestionBank.addCategory')}</label>
            <div style="display:flex;gap:8px">
              <input type="text" id="newQCatName" placeholder="${t('moodleQuestionBank.categoryPlaceholder')}" required style="flex:1">
              <button type="submit" class="btn-primary">${t('common.add')}</button>
            </div>
          </div>
        </form>
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
    if (!confirm(t('moodleGradeCategory.confirmDelete'))) return;
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
        <form onsubmit="event.preventDefault(); MoodleUI.saveRole('${roleId}')">
          <div class="form-group">
            <label>${t('moodleRoles.nameLabel')}</label>
            <input type="text" id="er_name" value="${role.name || ''}" required>
          </div>
          <div class="form-group">
            <label>${t('common.description')}</label>
            <textarea id="er_description" rows="2">${role.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>${t('moodleRoles.permissions')}</label>
            <div class="capabilities-checkboxes" style="max-height:300px;overflow-y:auto">
              ${allCapabilities.map(cap => `
                <label style="display:block;padding:4px 0">
                  <input type="checkbox" name="capabilities" value="${cap.id}"
                    ${(role.capabilities || []).includes(cap.id) ? 'checked' : ''}>
                  ${cap.name || cap.id}
                </label>
              `).join('')}
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
    const capabilities = Array.from(document.querySelectorAll('input[name="capabilities"]:checked')).map(cb => cb.value);
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
