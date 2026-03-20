/**
 * BeyondBridge Moodle-style UI Module
 * 前端頁面邏輯 - Moodle 風格功能
 */

const MoodleUI = {
  // 當前選中的課程
  currentCourse: null,
  currentCourseId: null,

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
      showToast('載入課程失敗');
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
          <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">尚無課程</p>
          <p style="font-size: 0.9rem;">等待教師建立課程或瀏覽課程目錄</p>
        </div>
      `;
      return;
    }

    container.innerHTML = courses.map(course => `
      <div class="moodle-course-card" onclick="MoodleUI.openCourse('${course.courseId}')">
        <div class="course-cover" style="background: ${this.getCourseGradient(course.category)}">
          <span class="course-category">${course.category || '一般'}</span>
          ${course.isEnrolled ? '<span class="enrolled-badge">已報名</span>' : ''}
        </div>
        <div class="course-body">
          <h3 class="course-name">${course.title || course.name || '未命名課程'}</h3>
          <p class="course-shortname">${course.shortName || course.shortname || ''}</p>
          <p class="course-summary">${course.description || course.summary || '尚無說明'}</p>
          <div class="course-meta">
            <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a7.5 7.5 0 0115 0"/></svg> ${course.instructorName || course.teacherName || '教師'}</span>
            <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ${course.enrollmentCount || course.enrolledCount || 0} 學生</span>
          </div>
          ${course.isEnrolled && course.progress !== undefined ? `
            <div class="course-progress-bar">
              <div class="progress-fill" style="width: ${course.progress}%"></div>
            </div>
            <span class="progress-text">${course.progress}% 完成</span>
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
        showToast('載入課程失敗');
        return;
      }

      this.currentCourse = result.data;
      this.currentCourseId = courseId;
      this.renderCoursePage(result.data);
      showView('courseDetail');
    } catch (error) {
      console.error('Open course error:', error);
      showToast('載入課程失敗');
    }
  },

  /**
   * 渲染課程詳情頁面
   */
  renderCoursePage(course) {
    const container = document.getElementById('courseDetailContent');
    if (!container) return;

    const user = API.getCurrentUser();
    const isTeacher = course.teacherId === user?.userId || user?.role === 'teacher';

    container.innerHTML = `
      <!-- 課程頭部 -->
      <div class="course-header">
        <button onclick="showView('moodleCourses')" class="back-btn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
          返回課程列表
        </button>
        <div class="course-header-content">
          <div class="course-header-info">
            <span class="course-category-badge">${course.category || '一般'}</span>
            <h1>${course.title || course.name || '課程'}</h1>
            <p>${course.description || course.summary || ''}</p>
            <div class="course-header-meta">
              <span>教師：${course.instructorName || course.teacherName || '教師'}</span>
              <span>${course.enrollmentCount || course.enrolledCount || 0} 位學生</span>
              <span>格式：${course.format === 'topics' ? '主題' : course.format === 'weeks' ? '週次' : '單一活動'}</span>
            </div>
          </div>
          <div class="course-header-actions">
            ${!course.isEnrolled && !isTeacher ? `
              <button onclick="MoodleUI.enrollCourse('${course.courseId}')" class="btn-primary">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                報名課程
              </button>
            ` : ''}
            ${isTeacher ? `
              <button onclick="MoodleUI.openCourseSettings('${course.courseId}')" class="btn-secondary">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                課程設定
              </button>
              <button onclick="MoodleUI.openAddSection('${course.courseId}')" class="btn-primary">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新增章節
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- 課程導航標籤 -->
      <div class="course-nav-tabs">
        <button class="nav-tab active" onclick="MoodleUI.switchCourseTab('content')">課程內容</button>
        <button class="nav-tab" onclick="MoodleUI.switchCourseTab('participants')">參與者</button>
        <button class="nav-tab" onclick="MoodleUI.switchCourseTab('grades')">成績</button>
        ${isTeacher ? '<button class="nav-tab" onclick="MoodleUI.switchCourseTab(\'reports\')">報表</button>' : ''}
      </div>

      <!-- 課程內容區 -->
      <div id="courseContentPanel" class="course-panel active">
        ${this.renderCourseSections(course.sections || [], isTeacher, course.courseId)}
      </div>

      <!-- 參與者區 -->
      <div id="courseParticipantsPanel" class="course-panel" style="display: none;">
        <div class="loading">載入中...</div>
      </div>

      <!-- 成績區 -->
      <div id="courseGradesPanel" class="course-panel" style="display: none;">
        <div class="loading">載入中...</div>
      </div>

      <!-- 報表區 (教師) -->
      <div id="courseReportsPanel" class="course-panel" style="display: none;">
        <div class="loading">載入中...</div>
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
          <p>此課程尚無內容</p>
          ${isTeacher ? '<p class="hint">點擊「新增章節」開始建立課程內容</p>' : ''}
        </div>
      `;
    }

    return sections.map((section, index) => `
      <div class="course-section ${section.visible === false ? 'hidden-section' : ''}">
        <div class="section-header">
          <div class="section-info">
            <h2 class="section-title">${section.name || `第 ${index + 1} 週`}</h2>
            ${section.summary ? `<p class="section-summary">${section.summary}</p>` : ''}
          </div>
          ${isTeacher ? `
            <div class="section-actions">
              <button onclick="MoodleUI.openAddActivity('${courseId}', '${section.sectionId}')" class="btn-sm">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新增活動
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
      return `<div class="no-activities">此章節尚無活動</div>`;
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
          <span class="activity-name">${activity.name}</span>
          ${activity.description ? `<span class="activity-desc">${activity.description}</span>` : ''}
          ${activity.dueDate ? `<span class="activity-due">截止日期：${new Date(activity.dueDate).toLocaleDateString('zh-TW')}</span>` : ''}
        </div>
        ${activity.completed ? '<span class="completed-badge">已完成</span>' : ''}
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
      const key = prompt('請輸入報名密碼：');
      if (!key) return;

      try {
        const result = await API.courses.enroll(courseId, key);
        if (result.success) {
          showToast('報名成功！');
          this.openCourse(courseId); // 重新載入
        } else {
          showToast(result.message || '報名失敗');
        }
      } catch (error) {
        console.error('Enroll error:', error);
        showToast('報名失敗');
      }
    } else {
      try {
        const result = await API.courses.enroll(courseId);
        if (result.success) {
          showToast('報名成功！');
          this.openCourse(courseId);
        } else {
          showToast(result.message || '報名失敗');
        }
      } catch (error) {
        console.error('Enroll error:', error);
        showToast('報名失敗');
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
      panel.innerHTML = '<div class="error">載入參與者失敗</div>';
    }
  },

  /**
   * 渲染參與者列表
   */
  renderParticipantsList(participants) {
    if (participants.length === 0) {
      return '<div class="empty-list">尚無參與者</div>';
    }

    return `
      <div class="participants-list">
        <table class="data-table">
          <thead>
            <tr>
              <th>學生</th>
              <th>電子郵件</th>
              <th>報名日期</th>
              <th>進度</th>
              <th>最後訪問</th>
            </tr>
          </thead>
          <tbody>
            ${participants.map(p => `
              <tr>
                <td>
                  <div class="user-cell">
                    <div class="user-avatar">${(p.userName || '學')[0]}</div>
                    <span>${p.userName || '學生'}</span>
                  </div>
                </td>
                <td>${p.userEmail || '-'}</td>
                <td>${p.enrolledAt ? new Date(p.enrolledAt).toLocaleDateString('zh-TW') : '-'}</td>
                <td>
                  <div class="mini-progress">
                    <div class="mini-progress-fill" style="width: ${p.progress || 0}%"></div>
                  </div>
                  <span class="progress-text-sm">${p.progress || 0}%</span>
                </td>
                <td>${p.lastAccess ? new Date(p.lastAccess).toLocaleDateString('zh-TW') : '從未'}</td>
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
    const isTeacher = this.currentCourse?.teacherId === user?.userId || user?.role === 'teacher';

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
      panel.innerHTML = '<div class="error">載入成績失敗</div>';
    }
  },

  /**
   * 渲染學生成績
   */
  renderStudentGrades(grades) {
    if (!grades || grades.items?.length === 0) {
      return '<div class="empty-list">尚無成績資料</div>';
    }

    return `
      <div class="student-grades">
        <div class="grade-summary">
          <div class="summary-card">
            <div class="summary-value">${grades.totalScore || '-'}</div>
            <div class="summary-label">總成績</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${grades.completedItems || 0}/${grades.totalItems || 0}</div>
            <div class="summary-label">完成項目</div>
          </div>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>項目</th>
              <th>類型</th>
              <th>分數</th>
              <th>權重</th>
              <th>回饋</th>
            </tr>
          </thead>
          <tbody>
            ${(grades.items || []).map(item => `
              <tr>
                <td>${item.name}</td>
                <td><span class="type-badge ${item.type}">${item.type === 'assignment' ? '作業' : item.type === 'quiz' ? '測驗' : '其他'}</span></td>
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
      return '<div class="empty-list">尚無成績資料</div>';
    }

    return `
      <div class="teacher-gradebook">
        <div class="gradebook-actions">
          <button onclick="MoodleUI.exportGrades('${this.currentCourseId}')" class="btn-secondary">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            匯出成績
          </button>
          <button onclick="MoodleUI.openGradeSettings('${this.currentCourseId}')" class="btn-secondary">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4"/></svg>
            成績設定
          </button>
        </div>
        <div class="gradebook-table-wrapper">
          <table class="gradebook-table">
            <thead>
              <tr>
                <th class="sticky-col">學生</th>
                ${(gradebook.items || []).map(item => `<th>${item.name}</th>`).join('')}
                <th>總成績</th>
              </tr>
            </thead>
            <tbody>
              ${(gradebook.students || []).map(student => `
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
        showToast('成績已匯出');
      }
    } catch (error) {
      console.error('Export grades error:', error);
      showToast('匯出成績失敗');
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
        showToast('不支援的活動類型: ' + type);
    }
  },

  /**
   * 開啟頁面活動 - 在 Modal 中顯示內容
   */
  async openPageActivity(activityId, courseId) {
    try {
      const result = await API.courseActivities.get(courseId, activityId);
      if (!result.success || !result.data) {
        showToast('無法載入頁面內容');
        return;
      }
      const activity = result.data;
      const content = activity.content || activity.description || '<p>此頁面沒有內容</p>';
      MoodleUI.createModal('page-activity-modal', activity.title || '頁面內容', `
        <div class="page-activity-content" style="line-height: 1.8; font-size: 0.95rem;">
          ${content}
        </div>
      `, { maxWidth: '800px' });
    } catch (error) {
      console.error('開啟頁面活動失敗:', error);
      showToast('載入頁面內容失敗');
    }
  },

  /**
   * 開啟網址活動 - 在新分頁中開啟 URL
   */
  async openUrlActivity(activityId, courseId) {
    try {
      const result = await API.courseActivities.get(courseId, activityId);
      if (!result.success || !result.data) {
        showToast('無法載入活動資訊');
        return;
      }
      const activity = result.data;
      const url = activity.url || activity.externalUrl;
      if (url) {
        window.open(url, '_blank');
      } else {
        showToast('此活動未設定網址');
      }
    } catch (error) {
      console.error('開啟網址活動失敗:', error);
      showToast('載入活動資訊失敗');
    }
  },

  /**
   * 開啟檔案活動 - 下載或開啟檔案
   */
  async openFileActivity(activityId, courseId) {
    try {
      const result = await API.courseActivities.get(courseId, activityId);
      if (!result.success || !result.data) {
        showToast('無法載入檔案資訊');
        return;
      }
      const activity = result.data;
      const fileUrl = activity.fileUrl || activity.url || activity.file;
      if (fileUrl) {
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = activity.fileName || activity.title || '';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        showToast('此活動未設定檔案');
      }
    } catch (error) {
      console.error('開啟檔案活動失敗:', error);
      showToast('載入檔案資訊失敗');
    }
  },

  /**
   * 啟動 LTI 1.3 外部工具
   */
  async launchLtiTool(activityId, courseId) {
    try {
      showToast('正在啟動外部工具...');

      // 取得活動詳情以獲得 toolId
      const activity = await API.courseActivities.get(courseId, activityId);
      if (!activity.success || !activity.data) {
        showToast('無法載入活動資訊');
        return;
      }

      const toolId = activity.data.toolId || activity.data.ltiToolId;
      if (!toolId) {
        showToast('此活動未設定 LTI 工具');
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

      // 建立啟動視窗/iframe
      this.openLtiLaunchModal(launchUrl, activity.data.name || '外部工具');

    } catch (error) {
      console.error('LTI launch error:', error);
      showToast('啟動外部工具失敗');
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
            <button onclick="MoodleUI.openLtiInNewWindow()" class="btn-secondary btn-sm" title="在新視窗開啟">
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
      showToast(`已新增 ${event.data.items?.length || 0} 個項目到課程`);
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
   * 在新視窗開啟 LTI 工具
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

    select.innerHTML = '<option value="">-- 請選擇工具 --</option>' +
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
      descEl.textContent = tool.description || '無說明';
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
    const token = localStorage.getItem('accessToken');
    const launchUrl = `${baseUrl}/api/lti/13/initiate?` + new URLSearchParams({
      tool_id: toolId,
      course_id: courseId,
      message_type: 'LtiDeepLinkingRequest',
      target: 'iframe',
      ...(token && { token })
    }).toString();

    this.openLtiLaunchModal(launchUrl, '選擇學習內容');
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
          <h3>新增章節</h3>
          <button onclick="MoodleUI.closeModal('addSectionModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>章節名稱 *</label>
            <input type="text" id="sectionName" placeholder="例如：第一週 - 課程簡介">
          </div>
          <div class="form-group">
            <label>章節說明</label>
            <textarea id="sectionSummary" rows="3" placeholder="輸入章節說明（選填）"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('addSectionModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.submitAddSection('${courseId}')" class="btn-primary">新增</button>
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
      showToast('請輸入章節名稱');
      return;
    }

    try {
      const result = await API.courseSections.create(courseId, { name, summary });
      if (result.success) {
        showToast('章節已新增');
        this.closeModal('addSectionModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || '新增章節失敗');
      }
    } catch (error) {
      console.error('Add section error:', error);
      showToast('新增章節失敗');
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
          <h3>新增活動</h3>
          <button onclick="MoodleUI.closeModal('addActivityModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="activity-types-grid">
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('page')">
              <div class="type-icon" style="background: var(--olive)20; color: var(--olive)">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              </div>
              <span>頁面</span>
              <p>建立純文字或 HTML 內容</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('url')">
              <div class="type-icon" style="background: #6366f120; color: #6366f1">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              </div>
              <span>網址</span>
              <p>連結到外部網站</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('file')">
              <div class="type-icon" style="background: #10b98120; color: #10b981">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <span>檔案</span>
              <p>上傳檔案供下載</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('assignment')">
              <div class="type-icon" style="background: var(--terracotta)20; color: var(--terracotta)">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              </div>
              <span>作業</span>
              <p>指派作業給學生</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('quiz')">
              <div class="type-icon" style="background: #8b5cf620; color: #8b5cf6">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <span>測驗</span>
              <p>建立線上測驗</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('forum')">
              <div class="type-icon" style="background: #f59e0b20; color: #f59e0b">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </div>
              <span>討論區</span>
              <p>建立討論論壇</p>
            </div>
            <div class="activity-type-card" onclick="MoodleUI.selectActivityType('lti')">
              <div class="type-icon" style="background: #ec489920; color: #ec4899">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <span>外部工具</span>
              <p>LTI 1.3 外部學習工具</p>
            </div>
          </div>

          <div id="activityFormArea" style="display: none; margin-top: 1.5rem;">
            <!-- 活動表單會動態插入這裡 -->
          </div>
        </div>
        <div class="modal-footer" id="activityModalFooter" style="display: none;">
          <button onclick="MoodleUI.closeModal('addActivityModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.submitAddActivity('${courseId}', '${sectionId}')" class="btn-primary">新增活動</button>
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
        <label>活動名稱 *</label>
        <input type="text" id="activityName" placeholder="輸入活動名稱">
      </div>
      <div class="form-group">
        <label>說明</label>
        <textarea id="activityDescription" rows="3" placeholder="輸入活動說明（選填）"></textarea>
      </div>
    `;

    switch (type) {
      case 'page':
        return commonFields + `
          <div class="form-group">
            <label>頁面內容 *</label>
            <textarea id="pageContent" rows="8" placeholder="輸入頁面內容（支援 HTML）"></textarea>
          </div>
        `;
      case 'url':
        return commonFields + `
          <div class="form-group">
            <label>網址 *</label>
            <input type="url" id="urlValue" placeholder="https://...">
          </div>
        `;
      case 'file':
        return commonFields + `
          <div class="form-group">
            <label>上傳檔案 *</label>
            <input type="file" id="fileUpload">
          </div>
        `;
      case 'assignment':
        return commonFields + `
          <div class="form-row">
            <div class="form-group">
              <label>截止日期</label>
              <input type="datetime-local" id="assignmentDueDate">
            </div>
            <div class="form-group">
              <label>分數</label>
              <input type="number" id="assignmentPoints" value="100" min="0">
            </div>
          </div>
          <div class="form-group">
            <label>提交類型</label>
            <select id="submissionType">
              <option value="text">線上文字</option>
              <option value="file">檔案上傳</option>
              <option value="both">兩者皆可</option>
            </select>
          </div>
        `;
      case 'quiz':
        return commonFields + `
          <div class="form-row">
            <div class="form-group">
              <label>開始時間</label>
              <input type="datetime-local" id="quizOpenDate">
            </div>
            <div class="form-group">
              <label>結束時間</label>
              <input type="datetime-local" id="quizCloseDate">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>時間限制 (分鐘)</label>
              <input type="number" id="quizTimeLimit" value="60" min="0">
            </div>
            <div class="form-group">
              <label>嘗試次數</label>
              <input type="number" id="quizAttempts" value="1" min="0">
            </div>
          </div>
          <p class="form-hint">建立測驗後可新增題目</p>
        `;
      case 'forum':
        return commonFields + `
          <div class="form-group">
            <label>討論區類型</label>
            <select id="forumType">
              <option value="general">一般討論</option>
              <option value="qanda">問答討論</option>
              <option value="news">公告討論</option>
            </select>
          </div>
        `;
      case 'lti':
        return commonFields + `
          <div class="form-group">
            <label>選擇外部工具 *</label>
            <select id="ltiToolSelect" onchange="MoodleUI.onLtiToolSelect()">
              <option value="">-- 請選擇工具 --</option>
            </select>
            <p class="form-hint">若無可用工具，請至系統設定新增 LTI 工具</p>
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
              使用 Deep Linking 選擇內容
            </label>
            <p class="form-hint">勾選後將開啟工具讓您選擇要新增的內容</p>
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
      showToast('請輸入活動名稱');
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
          showToast('請選擇外部工具');
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
        showToast('活動已新增');
        this.closeModal('addActivityModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || '新增活動失敗');
      }
    } catch (error) {
      console.error('Add activity error:', error);
      showToast('新增活動失敗');
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
  async loadAssignments(filter = 'all') {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    try {
      // 取得使用者報名的所有課程的作業
      const coursesResult = await API.courses.list({ enrolled: true });
      if (!coursesResult.success) return;

      let allAssignments = [];
      for (const course of coursesResult.data || []) {
        const assignmentsResult = await API.assignments.list(course.courseId);
        if (assignmentsResult.success) {
          const assignments = (assignmentsResult.data || []).map(a => ({
            ...a,
            courseName: course.name,
            courseId: course.courseId
          }));
          allAssignments = allAssignments.concat(assignments);
        }
      }

      // 篩選
      if (filter === 'pending') {
        allAssignments = allAssignments.filter(a => !a.submitted);
      } else if (filter === 'submitted') {
        allAssignments = allAssignments.filter(a => a.submitted && !a.graded);
      } else if (filter === 'graded') {
        allAssignments = allAssignments.filter(a => a.graded);
      }

      this.renderAssignmentsList(allAssignments);
    } catch (error) {
      console.error('Load assignments error:', error);
      container.innerHTML = '<div class="error">載入作業失敗</div>';
    }
  },

  /**
   * 渲染作業列表
   */
  renderAssignmentsList(assignments) {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    if (assignments.length === 0) {
      container.innerHTML = '<div class="empty-list">目前沒有作業</div>';
      return;
    }

    container.innerHTML = assignments.map(a => {
      const isOverdue = a.dueDate && new Date(a.dueDate) < new Date() && !a.submitted;
      const statusClass = a.graded ? 'graded' : a.submitted ? 'submitted' : isOverdue ? 'overdue' : 'pending';
      const statusText = a.graded ? '已評分' : a.submitted ? '已提交' : isOverdue ? '已逾期' : '待完成';

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
            <p class="assignment-course">${a.courseName || '課程'}</p>
            ${a.dueDate ? `<p class="assignment-due ${isOverdue ? 'overdue' : ''}">截止：${new Date(a.dueDate).toLocaleString('zh-TW')}</p>` : ''}
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
    btn.classList.add('active');
    this.loadAssignments(filter);
  },

  /**
   * 開啟作業
   */
  async openAssignment(assignmentId) {
    try {
      const result = await API.assignments.get(assignmentId);
      if (!result.success) {
        showToast('載入作業失敗');
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
              返回作業列表
            </button>
            <div class="assignment-info">
              <h1>${assignment.title}</h1>
              <div class="assignment-meta">
                <div class="assignment-meta-item">
                  <span class="label">課程</span>
                  <span class="value">${assignment.courseName || '課程'}</span>
                </div>
                <div class="assignment-meta-item">
                  <span class="label">截止日期</span>
                  <span class="value">${assignment.dueDate ? new Date(assignment.dueDate).toLocaleString('zh-TW') : '無'}</span>
                </div>
                <div class="assignment-meta-item">
                  <span class="label">滿分</span>
                  <span class="value">${assignment.maxPoints || 100} 分</span>
                </div>
              </div>
            </div>
            <div class="assignment-status ${assignment.submission ? (assignment.submission.grade !== undefined ? 'graded' : 'submitted') : 'not-submitted'}">
              ${assignment.submission ? (assignment.submission.grade !== undefined ? `已評分: ${assignment.submission.grade}/${assignment.maxPoints}` : '已提交') : '尚未提交'}
            </div>
          </div>

          <div class="assignment-content">
            <h3>作業說明</h3>
            <div class="content-body">${assignment.description || '無說明'}</div>
          </div>

          ${!isTeacher ? this.renderSubmissionArea(assignment) : this.renderGradingArea(assignment)}
        </div>
      `;

      showView('assignmentDetail');
    } catch (error) {
      console.error('Open assignment error:', error);
      showToast('載入作業失敗');
    }
  },

  /**
   * 渲染提交區域
   */
  renderSubmissionArea(assignment) {
    if (assignment.submission) {
      return `
        <div class="submission-area">
          <h3>我的提交</h3>
          <div class="submitted-content">
            ${assignment.submission.content ? `<div class="text-content">${assignment.submission.content}</div>` : ''}
            ${assignment.submission.files ? `<div class="file-list">${assignment.submission.files.map(f => `<span class="file-item">${f.filename}</span>`).join('')}</div>` : ''}
          </div>
          <p class="submit-time">提交時間：${new Date(assignment.submission.submittedAt).toLocaleString('zh-TW')}</p>
          ${assignment.submission.feedback ? `<div class="feedback"><h4>教師回饋</h4><p>${assignment.submission.feedback}</p></div>` : ''}
        </div>
      `;
    }

    return `
      <div class="submission-area">
        <h3>提交作業</h3>
        <form id="submissionForm">
          ${assignment.submissionType !== 'file' ? `
            <div class="form-group">
              <label>作業內容</label>
              <textarea id="submissionContent" rows="8" placeholder="輸入作業內容..."></textarea>
            </div>
          ` : ''}
          ${assignment.submissionType !== 'text' ? `
            <div class="form-group">
              <label>上傳檔案</label>
              <div class="file-upload-area" onclick="document.getElementById('submissionFile').click()">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p>點擊或拖放檔案至此處上傳</p>
              </div>
              <input type="file" id="submissionFile" style="display: none" onchange="MoodleUI.handleFileSelect(this)">
              <div id="selectedFiles"></div>
            </div>
          ` : ''}
          <button type="button" onclick="MoodleUI.submitAssignment('${assignment.assignmentId}')" class="btn-primary">提交作業</button>
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
        <h3>學生提交 (${assignment.submissions?.length || 0})</h3>
        ${(assignment.submissions || []).length === 0 ? '<p class="no-submissions">尚無學生提交</p>' : `
          <div class="submissions-list">
            ${assignment.submissions.map(s => `
              <div class="submission-item">
                <div class="student-info">
                  <div class="avatar">${(s.studentName || 'S')[0]}</div>
                  <div>
                    <span class="name">${s.studentName}</span>
                    <span class="time">${new Date(s.submittedAt).toLocaleString('zh-TW')}</span>
                  </div>
                </div>
                <div class="submission-actions">
                  <button onclick="MoodleUI.viewSubmission('${assignment.assignmentId}', '${s.studentId}')" class="btn-sm">查看</button>
                  <input type="number" id="grade_${s.studentId}" value="${s.grade || ''}" placeholder="分數" style="width: 80px">
                  <button onclick="MoodleUI.gradeSubmission('${assignment.assignmentId}', '${s.studentId}')" class="btn-primary">評分</button>
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
        MoodleUI.createModal('view-submission-modal', '查看提交', `
          <div class="submission-detail">
            <p><strong>學生：</strong>${s.studentName || studentId}</p>
            <p><strong>提交時間：</strong>${s.submittedAt ? new Date(s.submittedAt).toLocaleString('zh-TW') : '未提交'}</p>
            <div class="submission-content">${s.content || '<em>無文字內容</em>'}</div>
            ${s.files?.length ? `<div class="submission-files"><strong>附件：</strong><ul>${s.files.map(f => `<li>${f.name || f.fileName}</li>`).join('')}</ul></div>` : ''}
            ${s.grade !== undefined && s.grade !== null ? `<p><strong>成績：</strong>${s.grade}</p>` : ''}
            ${s.feedback ? `<p><strong>回饋：</strong>${s.feedback}</p>` : ''}
          </div>
        `);
      } else {
        showToast(result.message || '無法載入提交');
      }
    } catch (error) {
      showToast('載入提交失敗');
    }
  },

  /**
   * 教師評分提交
   */
  async gradeSubmission(assignmentId, studentId) {
    const gradeInput = document.getElementById(`grade_${studentId}`);
    const grade = gradeInput?.value;
    if (!grade) {
      showToast('請輸入分數');
      return;
    }
    try {
      const result = await API.assignments.gradeSubmission(assignmentId, studentId, {
        grade: parseFloat(grade),
        feedback: ''
      });
      if (result.success) {
        showToast('評分成功');
      } else {
        showToast(result.message || '評分失敗');
      }
    } catch (error) {
      showToast('評分失敗');
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
      showToast('請輸入內容或上傳檔案');
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
        showToast('作業已提交');
        this.openAssignment(assignmentId);
      } else {
        showToast(result.message || '提交失敗');
      }
    } catch (error) {
      console.error('Submit assignment error:', error);
      showToast('提交失敗');
    }
  },

  // ==================== 測驗系統 ====================

  /**
   * 載入測驗列表
   */
  async loadQuizzes(filter = 'all') {
    const container = document.getElementById('quizzesList');
    if (!container) return;

    try {
      const coursesResult = await API.courses.list({ enrolled: true });
      if (!coursesResult.success) return;

      let allQuizzes = [];
      for (const course of coursesResult.data || []) {
        const quizzesResult = await API.quizzes.list(course.courseId);
        if (quizzesResult.success) {
          const quizzes = (quizzesResult.data || []).map(q => ({
            ...q,
            courseName: course.name,
            courseId: course.courseId
          }));
          allQuizzes = allQuizzes.concat(quizzes);
        }
      }

      // 篩選
      const now = new Date();
      if (filter === 'available') {
        allQuizzes = allQuizzes.filter(q => {
          const open = q.openDate ? new Date(q.openDate) : null;
          const close = q.closeDate ? new Date(q.closeDate) : null;
          return (!open || open <= now) && (!close || close >= now);
        });
      } else if (filter === 'completed') {
        allQuizzes = allQuizzes.filter(q => q.completed);
      }

      this.renderQuizzesList(allQuizzes);
    } catch (error) {
      console.error('Load quizzes error:', error);
      container.innerHTML = '<div class="error">載入測驗失敗</div>';
    }
  },

  /**
   * 渲染測驗列表
   */
  renderQuizzesList(quizzes) {
    const container = document.getElementById('quizzesList');
    if (!container) return;

    if (quizzes.length === 0) {
      container.innerHTML = '<div class="empty-list">目前沒有測驗</div>';
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
            <p class="quiz-course">${q.courseName || '課程'}</p>
            <p class="quiz-meta">
              ${q.timeLimit ? `時限 ${q.timeLimit} 分鐘` : '不限時'} ·
              ${q.questionCount || q.questions?.length || 0} 題 ·
              ${q.attempts || 1} 次嘗試機會
            </p>
          </div>
          <div class="quiz-status">
            ${q.completed ? `
              <span class="completed">已完成</span>
              <span class="score">${q.bestScore || '-'} 分</span>
            ` : isOpen ? `
              <button class="btn-primary" onclick="event.stopPropagation(); MoodleUI.startQuiz('${q.quizId}')">開始測驗</button>
            ` : `
              <span class="not-available">尚未開放</span>
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
    btn.classList.add('active');
    this.loadQuizzes(filter);
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
        showToast(result.message || '無法開始測驗');
      }
    } catch (error) {
      console.error('Start quiz error:', error);
      showToast('開始測驗失敗');
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
        <h2>${attempt.quizTitle || '測驗'}</h2>
        <div class="quiz-progress">
          <span>第 ${this.currentQuestionIndex + 1} / ${totalQuestions} 題</span>
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
          <button ${this.currentQuestionIndex === 0 ? 'disabled' : ''} onclick="MoodleUI.prevQuestion()" class="btn-secondary">上一題</button>
          ${this.currentQuestionIndex === totalQuestions - 1 ? `
            <button onclick="MoodleUI.submitQuiz()" class="btn-primary">提交測驗</button>
          ` : `
            <button onclick="MoodleUI.nextQuestion()" class="btn-primary">下一題</button>
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
            <textarea id="answerText" rows="${question.type === 'essay' ? 8 : 2}" placeholder="輸入答案...">${question.answer || ''}</textarea>
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
    if (!confirm('確定要提交測驗嗎？提交後將無法修改答案。')) return;

    try {
      const result = await API.quizzes.submit(
        this.currentQuizAttempt.quizId,
        this.currentQuizAttempt.attemptId
      );

      if (result.success) {
        showToast(`測驗完成！得分：${result.data.score}`);
        showView('moodleQuizzes');
        this.loadQuizzes();
      } else {
        showToast(result.message || '提交失敗');
      }
    } catch (error) {
      console.error('Submit quiz error:', error);
      showToast('提交失敗');
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
  async loadForums(filter = 'all') {
    const container = document.getElementById('forumsList');
    if (!container) return;

    try {
      const coursesResult = await API.courses.list({ enrolled: true });
      if (!coursesResult.success) return;

      let allForums = [];
      for (const course of coursesResult.data || []) {
        const forumsResult = await API.forums.list(course.courseId);
        if (forumsResult.success) {
          const forums = (forumsResult.data || []).map(f => ({
            ...f,
            courseName: course.name,
            courseId: course.courseId
          }));
          allForums = allForums.concat(forums);
        }
      }

      if (filter === 'subscribed') {
        allForums = allForums.filter(f => f.subscribed);
      }

      this.renderForumsList(allForums);
    } catch (error) {
      console.error('Load forums error:', error);
      container.innerHTML = '<div class="error">載入討論區失敗</div>';
    }
  },

  /**
   * 渲染討論區列表
   */
  renderForumsList(forums) {
    const container = document.getElementById('forumsList');
    if (!container) return;

    if (forums.length === 0) {
      container.innerHTML = '<div class="empty-list">目前沒有討論區</div>';
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
              <h3>${f.title || f.name || '討論區'}</h3>
              <p class="forum-course">${f.courseName || '課程'}</p>
              <p class="forum-desc">${f.description || '無說明'}</p>
            </div>
            <div class="forum-stats">
              <span>${f.discussionCount || 0} 主題</span>
              <span>${f.postCount || 0} 回覆</span>
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
    btn.classList.add('active');
    this.loadForums(filter);
  },

  /**
   * 開啟討論區
   */
  async openForum(forumId) {
    try {
      const result = await API.forums.get(forumId);
      if (!result.success) {
        showToast('載入討論區失敗');
        return;
      }

      const forum = result.data;
      const container = document.getElementById('forumDetailContent');

      container.innerHTML = `
        <div class="forum-header">
          <button onclick="showView('moodleForums')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            返回討論區
          </button>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2>${forum.title || forum.name || '討論區'}</h2>
              <p>${forum.description || ''}</p>
            </div>
            <button onclick="MoodleUI.openNewDiscussionModal('${forumId}')" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              發起討論
            </button>
          </div>
        </div>
        <div class="discussion-list">
          ${(forum.discussions || []).length === 0 ? '<div class="empty-list">尚無討論</div>' : forum.discussions.map(d => `
            <div class="discussion-item ${d.pinned ? 'pinned' : ''}" onclick="MoodleUI.openDiscussion('${forumId}', '${d.discussionId}')">
              <div class="discussion-avatar">${(d.authorName || 'U')[0]}</div>
              <div class="discussion-content">
                <div class="discussion-title">
                  ${d.pinned ? '<span class="pin-badge">置頂</span>' : ''}
                  ${d.subject}
                </div>
                <div class="discussion-excerpt">${d.message?.substring(0, 100) || ''}...</div>
                <div class="discussion-meta">
                  <span>${d.authorName}</span>
                  <span>${new Date(d.createdAt).toLocaleDateString('zh-TW')}</span>
                </div>
              </div>
              <div class="discussion-stats">
                <span class="reply-count">${d.replyCount || 0} 回覆</span>
                ${d.lastReply ? `<span class="last-reply">最後回覆：${new Date(d.lastReply).toLocaleDateString('zh-TW')}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      showView('forumDetail');
    } catch (error) {
      console.error('Open forum error:', error);
      showToast('載入討論區失敗');
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

    titleEl.textContent = `${year} 年 ${month + 1} 月`;

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
      <div class="calendar-weekday">日</div>
      <div class="calendar-weekday">一</div>
      <div class="calendar-weekday">二</div>
      <div class="calendar-weekday">三</div>
      <div class="calendar-weekday">四</div>
      <div class="calendar-weekday">五</div>
      <div class="calendar-weekday">六</div>
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
          ${dayEvents.length > 3 ? `<div class="calendar-more">+${dayEvents.length - 3} 更多</div>` : ''}
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
        container.innerHTML = '<div class="empty-list">近期沒有事件</div>';
        return;
      }

      container.innerHTML = events.map(e => `
        <div class="event-item">
          <div class="event-date">
            <span class="day">${new Date(e.startDate || e.dueDate).getDate()}</span>
            <span class="month">${new Date(e.startDate || e.dueDate).toLocaleDateString('zh-TW', { month: 'short' })}</span>
          </div>
          <div class="event-info">
            <div class="event-title">${e.title}</div>
            <div class="event-course">${e.courseName || ''}</div>
            <div class="event-time">${e.type === 'assignment' ? '截止' : ''}：${new Date(e.startDate || e.dueDate).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</div>
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
          <option value="">選擇課程...</option>
          ${courses.map(c => `<option value="${c.courseId}">${c.title || c.name || '課程'}</option>`).join('')}
        `;
      }

      // 預設顯示提示
      container.innerHTML = `
        <div class="empty-list" style="text-align: center; padding: 3rem;">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 1rem; opacity: 0.5;">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <p>請選擇課程查看成績</p>
        </div>
      `;
    } catch (error) {
      console.error('Load gradebook error:', error);
      container.innerHTML = '<div class="error">載入成績簿失敗</div>';
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

    container.innerHTML = '<div class="loading">載入中...</div>';

    try {
      const user = API.getCurrentUser();

      // 取得課程資訊判斷是否為教師
      const courseResult = await API.courses.get(courseId);
      if (!courseResult.success) {
        container.innerHTML = '<div class="error">載入失敗</div>';
        return;
      }

      const course = courseResult.data;
      const isTeacher = course.teacherId === user?.userId || user?.role === 'teacher';

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
        container.innerHTML = '<div class="error">載入成績失敗</div>';
      }
    } catch (error) {
      console.error('Load gradebook for course error:', error);
      container.innerHTML = '<div class="error">載入成績簿失敗</div>';
    }
  },

  /**
   * 開啟測驗詳情
   */
  async openQuiz(quizId) {
    try {
      const result = await API.quizzes.get(quizId);
      if (!result.success) {
        showToast('載入測驗失敗');
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
            返回測驗列表
          </button>
          <div class="quiz-info-header">
            <h1>${quiz.title}</h1>
            <p class="quiz-description">${quiz.description || '無說明'}</p>
          </div>
          <div class="quiz-info-details">
            <div class="info-item">
              <span class="label">題目數量</span>
              <span class="value">${quiz.questionCount || 0} 題</span>
            </div>
            <div class="info-item">
              <span class="label">時間限制</span>
              <span class="value">${quiz.timeLimit ? quiz.timeLimit + ' 分鐘' : '不限時'}</span>
            </div>
            <div class="info-item">
              <span class="label">可嘗試次數</span>
              <span class="value">${quiz.attempts === 0 ? '無限' : quiz.attempts || 1} 次</span>
            </div>
            <div class="info-item">
              <span class="label">開放時間</span>
              <span class="value">${quiz.openDate ? new Date(quiz.openDate).toLocaleString('zh-TW') : '隨時開放'}</span>
            </div>
            <div class="info-item">
              <span class="label">截止時間</span>
              <span class="value">${quiz.closeDate ? new Date(quiz.closeDate).toLocaleString('zh-TW') : '無限制'}</span>
            </div>
          </div>
          ${quiz.myAttempts && quiz.myAttempts.length > 0 ? `
            <div class="quiz-attempts-history">
              <h3>作答紀錄</h3>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>嘗試</th>
                    <th>開始時間</th>
                    <th>完成時間</th>
                    <th>分數</th>
                  </tr>
                </thead>
                <tbody>
                  ${quiz.myAttempts.map((a, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${new Date(a.startedAt).toLocaleString('zh-TW')}</td>
                      <td>${a.completedAt ? new Date(a.completedAt).toLocaleString('zh-TW') : '-'}</td>
                      <td>${a.score !== undefined ? a.score + ' 分' : '-'}</td>
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
                開始測驗
              </button>
            ` : `
              <p class="not-available-message">測驗目前不開放</p>
            `}
          </div>
        </div>
      `;

      showView('quizAttempt');
    } catch (error) {
      console.error('Open quiz error:', error);
      showToast('載入測驗失敗');
    }
  },

  /**
   * 開啟新增討論 Modal
   */
  openNewDiscussionModal(forumId) {
    const modal = document.createElement('div');
    modal.id = 'newDiscussionModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>發起新討論</h3>
          <button onclick="MoodleUI.closeModal('newDiscussionModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>主題 *</label>
            <input type="text" id="discussionSubject" placeholder="輸入討論主題">
          </div>
          <div class="form-group">
            <label>內容 *</label>
            <textarea id="discussionMessage" rows="6" placeholder="輸入討論內容"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('newDiscussionModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.submitNewDiscussion('${forumId}')" class="btn-primary">發佈</button>
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
      showToast('請填寫主題和內容');
      return;
    }

    try {
      const result = await API.forums.createDiscussion(forumId, { subject, message });
      if (result.success) {
        showToast('討論已發佈');
        this.closeModal('newDiscussionModal');
        this.openForum(forumId);
      } else {
        showToast(result.message || '發佈失敗');
      }
    } catch (error) {
      console.error('Create discussion error:', error);
      showToast('發佈失敗');
    }
  },

  /**
   * 開啟討論主題
   */
  async openDiscussion(forumId, discussionId) {
    try {
      const result = await API.forums.getDiscussion(forumId, discussionId);
      if (!result.success) {
        showToast('載入討論失敗');
        return;
      }

      const discussion = result.data;
      const container = document.getElementById('forumDetailContent');

      container.innerHTML = `
        <div class="discussion-detail">
          <button onclick="MoodleUI.openForum('${forumId}')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            返回討論區
          </button>
          <div class="discussion-main">
            <div class="discussion-post main-post">
              <div class="post-header">
                <div class="post-avatar">${(discussion.authorName || 'U')[0]}</div>
                <div class="post-meta">
                  <span class="author-name">${discussion.authorName}</span>
                  <span class="post-time">${new Date(discussion.createdAt).toLocaleString('zh-TW')}</span>
                </div>
              </div>
              <h2 class="post-title">${discussion.subject}</h2>
              <div class="post-content">${discussion.message}</div>
            </div>

            <div class="replies-section">
              <h3>${discussion.posts?.length || 0} 則回覆</h3>
              ${(discussion.posts || []).map(p => `
                <div class="discussion-post reply-post">
                  <div class="post-header">
                    <div class="post-avatar">${(p.authorName || 'U')[0]}</div>
                    <div class="post-meta">
                      <span class="author-name">${p.authorName}</span>
                      <span class="post-time">${new Date(p.createdAt).toLocaleString('zh-TW')}</span>
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
                <h4>發表回覆</h4>
                <textarea id="replyMessage" rows="4" placeholder="輸入回覆內容..."></textarea>
                <button onclick="MoodleUI.submitReply('${forumId}', '${discussionId}')" class="btn-primary">發表回覆</button>
              </div>
            ` : '<div class="locked-notice">此討論已鎖定，無法回覆</div>'}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Open discussion error:', error);
      showToast('載入討論失敗');
    }
  },

  /**
   * 提交回覆
   */
  async submitReply(forumId, discussionId) {
    const message = document.getElementById('replyMessage').value.trim();
    if (!message) {
      showToast('請輸入回覆內容');
      return;
    }

    try {
      const result = await API.forums.reply(forumId, discussionId, { message });
      if (result.success) {
        showToast('回覆已發表');
        this.openDiscussion(forumId, discussionId);
      } else {
        showToast(result.message || '發表失敗');
      }
    } catch (error) {
      console.error('Submit reply error:', error);
      showToast('發表失敗');
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
    showToast(`${year}/${month + 1}/${day} 的事件`);
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
        container.innerHTML = '<div class="empty-list">沒有通知</div>';
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
      container.innerHTML = '<div class="error">載入通知失敗</div>';
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

    if (diff < 60) return '剛剛';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
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
      showToast('已全部標為已讀');
      this.loadNotifications();
    } catch (error) {
      showToast('操作失敗');
    }
  },

  /**
   * 刪除已讀通知
   */
  async deleteReadNotifications() {
    try {
      await API.notifications.deleteAllRead();
      showToast('已刪除已讀通知');
      this.loadNotifications();
    } catch (error) {
      showToast('操作失敗');
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
        container.innerHTML = '<div class="loading">載入課程列表...</div>';
        try {
          const result = await API.courses.list();
          const courses = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.courses || [])) : [];
          container.innerHTML = `
            <div class="page-header"><h2>成績簿管理</h2><p>請選擇一門課程以管理成績</p></div>
            <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;padding:1rem 0;">
              ${courses.length === 0 ? '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:2rem;">尚無可用課程</p>' :
                courses.map(c => `
                  <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;transition:box-shadow 0.2s;"
                       onclick="MoodleUI.openGradebookManagement('${c.courseId || c.id}')"
                       onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'">
                    <h3 style="margin:0 0 0.5rem;font-size:1.1rem;">${c.title || c.name || '未命名課程'}</h3>
                    <p style="margin:0;color:var(--gray-400);font-size:0.9rem;">${c.shortName || c.category || ''}</p>
                  </div>
                `).join('')}
            </div>`;
        } catch (error) {
          container.innerHTML = '<div class="error">載入課程列表失敗</div>';
        }
        return;
      }
    }
    this.currentGradebookCourseId = courseId;
    const container = document.getElementById('gradebookManagementContent');
    if (!container) return;

    container.innerHTML = '<div class="loading">載入中...</div>';
    showView('gradebookManagement');

    try {
      const [gradebookResult, categoriesResult, settingsResult] = await Promise.all([
        API.gradebook.getCourseGradebook(courseId),
        API.gradebookEnhanced.getCategories(courseId),
        API.gradebookEnhanced.getSettings(courseId)
      ]);

      if (!gradebookResult.success) {
        container.innerHTML = '<div class="error">載入成績簿失敗</div>';
        return;
      }

      const gradebook = gradebookResult.data;
      const categories = categoriesResult.success ? categoriesResult.data : [];
      const settings = settingsResult.success ? settingsResult.data : {};

      container.innerHTML = this.renderFullGradebookManagement(gradebook, categories, settings, courseId);
    } catch (error) {
      console.error('Open gradebook management error:', error);
      container.innerHTML = '<div class="error">載入成績簿失敗</div>';
    }
  },

  /**
   * 渲染完整成績簿管理界面
   */
  renderFullGradebookManagement(gradebook, categories, settings, courseId) {
    const items = gradebook.items || [];
    const students = gradebook.students || [];

    return `
      <div class="gradebook-management">
        <div class="gradebook-header">
          <button onclick="showView('moodleCourses')" class="back-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            返回
          </button>
          <h1>成績簿管理</h1>
        </div>

        <!-- 工具列 -->
        <div class="gradebook-toolbar">
          <div class="toolbar-left">
            <button onclick="MoodleUI.openGradeCategoryModal('${courseId}')" class="btn-secondary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              類別管理
            </button>
            <button onclick="MoodleUI.openGradeSettingsModal('${courseId}')" class="btn-secondary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4"/>
              </svg>
              成績設定
            </button>
          </div>
          <div class="toolbar-right">
            <button onclick="MoodleUI.exportGradesCSV('${courseId}')" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              匯出 CSV
            </button>
            <button onclick="MoodleUI.exportGradesExcel('${courseId}')" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              匯出 Excel
            </button>
          </div>
        </div>

        <!-- 成績類別摘要 -->
        ${categories.length > 0 ? `
          <div class="grade-categories-summary">
            <h3>成績類別</h3>
            <div class="categories-grid">
              ${categories.map(cat => `
                <div class="category-card">
                  <div class="category-name">${cat.name}</div>
                  <div class="category-weight">${cat.weight}% 權重</div>
                  <div class="category-items">${cat.itemCount || 0} 個項目</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 成績統計 -->
        <div class="gradebook-stats">
          <div class="stat-card">
            <div class="stat-value">${students.length}</div>
            <div class="stat-label">學生人數</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${items.length}</div>
            <div class="stat-label">評分項目</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${gradebook.classAverage ? gradebook.classAverage.toFixed(1) : '-'}</div>
            <div class="stat-label">班級平均</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${gradebook.highestScore || '-'}</div>
            <div class="stat-label">最高分</div>
          </div>
        </div>

        <!-- 成績表格 -->
        <div class="gradebook-table-container">
          <div class="gradebook-table-wrapper">
            <table class="gradebook-table editable">
              <thead>
                <tr>
                  <th class="sticky-col student-col">
                    學生
                    <button onclick="MoodleUI.sortGradebook('name')" class="sort-btn">↕</button>
                  </th>
                  ${items.map(item => `
                    <th class="item-header" data-item-id="${item.itemId}">
                      <div class="item-name">${item.name}</div>
                      <div class="item-meta">${item.maxScore} 分</div>
                      ${item.category ? `<div class="item-category">${item.category}</div>` : ''}
                    </th>
                  `).join('')}
                  <th class="total-col">
                    總成績
                    <button onclick="MoodleUI.sortGradebook('total')" class="sort-btn">↕</button>
                  </th>
                  <th class="letter-col">等級</th>
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
                          data-item-id="${items[idx]?.itemId}"
                          data-student-id="${student.userId}"
                          ondblclick="MoodleUI.editGradeCell(this)">
                        <span class="grade-value">${g.score !== null ? g.score : '-'}</span>
                        ${g.feedback ? '<span class="has-feedback" title="有回饋">💬</span>' : ''}
                      </td>
                    `).join('')}
                    <td class="total-cell">
                      <strong>${student.total !== null ? student.total.toFixed(1) : '-'}</strong>
                    </td>
                    <td class="letter-cell">
                      <span class="letter-grade ${this.getLetterGradeClass(student.letterGrade)}">${student.letterGrade || '-'}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 成績等級對應表 -->
        <div class="grade-scale-info">
          <h3>成績等級對應</h3>
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
        showToast('成績已更新');
        // 重新計算總分
        this.recalculateStudentTotal(studentId);
      } else {
        showToast(result.message || '更新失敗');
        cell.innerHTML = `<span class="grade-value">${input.defaultValue || '-'}</span>`;
      }
    } catch (error) {
      console.error('Save grade error:', error);
      showToast('更新失敗');
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
        showToast('CSV 已匯出');
      } else {
        showToast('匯出失敗');
      }
    } catch (error) {
      console.error('Export CSV error:', error);
      showToast('匯出失敗');
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
        showToast('Excel 已匯出');
      } else {
        showToast('匯出失敗');
      }
    } catch (error) {
      console.error('Export Excel error:', error);
      showToast('匯出失敗');
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
            <h3>成績類別管理</h3>
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
                    <button onclick="MoodleUI.editGradeCategory('${courseId}', '${cat.categoryId}')" class="btn-sm">編輯</button>
                    <button onclick="MoodleUI.deleteGradeCategory('${courseId}', '${cat.categoryId}')" class="btn-sm btn-danger">刪除</button>
                  </div>
                </div>
              `).join('')}
              ${categories.length === 0 ? '<div class="empty-list">尚無成績類別</div>' : ''}
            </div>
            <hr>
            <h4>新增類別</h4>
            <div class="form-row">
              <div class="form-group">
                <label>類別名稱</label>
                <input type="text" id="newCategoryName" placeholder="例如：作業、測驗、期末考">
              </div>
              <div class="form-group">
                <label>權重 (%)</label>
                <input type="number" id="newCategoryWeight" min="0" max="100" value="10">
              </div>
              <button onclick="MoodleUI.createGradeCategory('${courseId}')" class="btn-primary">新增</button>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('gradeCategoryModal')" class="btn-secondary">關閉</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('gradeCategoryModal'); };
    } catch (error) {
      console.error('Open grade category modal error:', error);
      showToast('載入類別失敗');
    }
  },

  /**
   * 建立成績類別
   */
  async createGradeCategory(courseId) {
    const name = document.getElementById('newCategoryName').value.trim();
    const weight = document.getElementById('newCategoryWeight').value;

    if (!name) {
      showToast('請輸入類別名稱');
      return;
    }

    try {
      const result = await API.gradebookEnhanced.createCategory(courseId, { name, weight: parseFloat(weight) });
      if (result.success) {
        showToast('類別已建立');
        this.closeModal('gradeCategoryModal');
        this.openGradeCategoryModal(courseId);
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      console.error('Create category error:', error);
      showToast('建立失敗');
    }
  },

  /**
   * 刪除成績類別
   */
  async deleteGradeCategory(courseId, categoryId) {
    if (!confirm('確定要刪除此類別嗎？')) return;

    try {
      const result = await API.gradebookEnhanced.deleteCategory(courseId, categoryId);
      if (result.success) {
        showToast('類別已刪除');
        this.openGradeCategoryModal(courseId);
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      console.error('Delete category error:', error);
      showToast('刪除失敗');
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
            <h3>成績設定</h3>
            <button onclick="MoodleUI.closeModal('gradeSettingsModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>聚合方式</label>
              <select id="gradeAggregation">
                <option value="weighted_mean" ${settings.aggregation === 'weighted_mean' ? 'selected' : ''}>加權平均</option>
                <option value="simple_mean" ${settings.aggregation === 'simple_mean' ? 'selected' : ''}>簡單平均</option>
                <option value="highest" ${settings.aggregation === 'highest' ? 'selected' : ''}>最高分</option>
                <option value="sum" ${settings.aggregation === 'sum' ? 'selected' : ''}>總和</option>
              </select>
            </div>
            <div class="form-group">
              <label>成績等級系統</label>
              <select id="gradeScaleType">
                <option value="letter" ${settings.scaleType === 'letter' ? 'selected' : ''}>A-F 等級</option>
                <option value="taiwan" ${settings.scaleType === 'taiwan' ? 'selected' : ''}>優甲乙丙丁</option>
                <option value="percentage" ${settings.scaleType === 'percentage' ? 'selected' : ''}>百分比</option>
              </select>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="showLetterGrades" ${settings.showLetterGrades ? 'checked' : ''}>
                顯示等級
              </label>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="includeInOverall" ${settings.includeInOverall !== false ? 'checked' : ''}>
                計入總成績
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('gradeSettingsModal')" class="btn-secondary">取消</button>
            <button onclick="MoodleUI.saveGradeSettings('${courseId}')" class="btn-primary">儲存設定</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('gradeSettingsModal'); };
    } catch (error) {
      console.error('Open grade settings modal error:', error);
      showToast('載入設定失敗');
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
        showToast('設定已儲存');
        this.closeModal('gradeSettingsModal');
        this.openGradebookManagement(courseId);
      } else {
        showToast(result.message || '儲存失敗');
      }
    } catch (error) {
      console.error('Save grade settings error:', error);
      showToast('儲存失敗');
    }
  },

  // ==================== 題庫管理系統 ====================

  currentQuestionBankFilters: {},

  /**
   * 開啟題庫管理頁面
   */
  async openQuestionBank() {
    const container = document.getElementById('questionBankContent');
    if (!container) return;

    container.innerHTML = '<div class="loading">載入中...</div>';
    showView('questionBank');

    try {
      const [questionsResult, categoriesResult] = await Promise.all([
        API.questionBank.list(this.currentQuestionBankFilters),
        API.questionBank.getCategories()
      ]);

      const questions = questionsResult.success ? questionsResult.data : [];
      const categories = categoriesResult.success ? categoriesResult.data : [];

      container.innerHTML = this.renderQuestionBankPage(questions, categories);
    } catch (error) {
      console.error('Open question bank error:', error);
      container.innerHTML = '<div class="error">載入題庫失敗</div>';
    }
  },

  /**
   * 渲染題庫頁面
   */
  renderQuestionBankPage(questions, categories) {
    const questionTypes = {
      'multiple_choice': '選擇題',
      'true_false': '是非題',
      'short_answer': '簡答題',
      'matching': '配對題',
      'fill_blank': '填空題',
      'essay': '問答題'
    };

    return `
      <div class="question-bank-page">
        <div class="qb-header">
          <h1>題庫管理</h1>
          <div class="qb-actions">
            <button onclick="MoodleUI.openCreateQuestionModal()" class="btn-primary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              新增題目
            </button>
            <button onclick="MoodleUI.openImportQuestionsModal()" class="btn-secondary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              匯入
            </button>
            <button onclick="MoodleUI.exportQuestions()" class="btn-secondary">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              匯出
            </button>
          </div>
        </div>

        <div class="qb-layout">
          <!-- 左側類別篩選 -->
          <div class="qb-sidebar">
            <div class="qb-categories">
              <h3>題目類別</h3>
              <button onclick="MoodleUI.openCategoryManageModal()" class="btn-sm">管理類別</button>
              <ul class="category-tree">
                <li class="category-item ${!this.currentQuestionBankFilters.categoryId ? 'active' : ''}"
                    onclick="MoodleUI.filterQuestionsByCategory('')">
                  <span>全部題目</span>
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
              <h3>題型篩選</h3>
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
              <input type="text" id="questionSearch" placeholder="搜尋題目內容..."
                     value="${this.currentQuestionBankFilters.search || ''}"
                     onkeyup="if(event.key==='Enter') MoodleUI.searchQuestions()">
              <button onclick="MoodleUI.searchQuestions()" class="btn-search">搜尋</button>
            </div>

            <div class="qb-list">
              ${questions.length === 0 ? '<div class="empty-list">沒有找到題目</div>' : ''}
              ${questions.map(q => `
                <div class="question-card" data-question-id="${q.questionId}">
                  <div class="question-header">
                    <span class="question-type">${questionTypes[q.type] || q.type}</span>
                    ${q.category ? `<span class="question-category">${q.category}</span>` : ''}
                    <span class="question-difficulty difficulty-${q.difficulty || 'medium'}">
                      ${q.difficulty === 'easy' ? '簡單' : q.difficulty === 'hard' ? '困難' : '中等'}
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
                      <button onclick="MoodleUI.previewQuestion('${q.questionId}')" class="btn-sm">預覽</button>
                      <button onclick="MoodleUI.editQuestion('${q.questionId}')" class="btn-sm">編輯</button>
                      <button onclick="MoodleUI.deleteQuestion('${q.questionId}')" class="btn-sm btn-danger">刪除</button>
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
          <h3>新增題目</h3>
          <button onclick="MoodleUI.closeModal('createQuestionModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>題型 *</label>
              <select id="questionType" onchange="MoodleUI.updateQuestionForm()">
                <option value="multiple_choice">選擇題</option>
                <option value="true_false">是非題</option>
                <option value="short_answer">簡答題</option>
                <option value="fill_blank">填空題</option>
                <option value="essay">問答題</option>
              </select>
            </div>
            <div class="form-group">
              <label>難度</label>
              <select id="questionDifficulty">
                <option value="easy">簡單</option>
                <option value="medium" selected>中等</option>
                <option value="hard">困難</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>題目內容 *</label>
            <textarea id="questionText" rows="3" placeholder="輸入題目內容"></textarea>
          </div>
          <div id="questionOptionsArea">
            <!-- 選項區域會根據題型動態更新 -->
          </div>
          <div class="form-group">
            <label>標籤 (用逗號分隔)</label>
            <input type="text" id="questionTags" placeholder="例如：第一章, 重點, 期中考">
          </div>
          <div class="form-group">
            <label>解答說明</label>
            <textarea id="questionExplanation" rows="2" placeholder="選填：提供答案解析"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createQuestionModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveNewQuestion()" class="btn-primary">建立題目</button>
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
          <label>選項 *</label>
          <div id="optionsList">
            <div class="option-item">
              <input type="radio" name="correctOption" value="0" checked>
              <input type="text" class="option-input" placeholder="選項 A">
              <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
            </div>
            <div class="option-item">
              <input type="radio" name="correctOption" value="1">
              <input type="text" class="option-input" placeholder="選項 B">
              <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
            </div>
            <div class="option-item">
              <input type="radio" name="correctOption" value="2">
              <input type="text" class="option-input" placeholder="選項 C">
              <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
            </div>
            <div class="option-item">
              <input type="radio" name="correctOption" value="3">
              <input type="text" class="option-input" placeholder="選項 D">
              <button type="button" onclick="this.parentElement.remove()" class="btn-remove">×</button>
            </div>
          </div>
          <button type="button" onclick="MoodleUI.addQuestionOption()" class="btn-sm">+ 新增選項</button>
        </div>
      `;
    } else if (type === 'true_false') {
      area.innerHTML = `
        <div class="form-group">
          <label>正確答案 *</label>
          <div class="radio-group">
            <label><input type="radio" name="tfAnswer" value="true" checked> 是 / 對</label>
            <label><input type="radio" name="tfAnswer" value="false"> 否 / 錯</label>
          </div>
        </div>
      `;
    } else if (type === 'short_answer' || type === 'fill_blank') {
      area.innerHTML = `
        <div class="form-group">
          <label>正確答案 * (可有多個，用逗號分隔)</label>
          <input type="text" id="correctAnswers" placeholder="輸入正確答案">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="caseSensitive"> 區分大小寫
          </label>
        </div>
      `;
    } else if (type === 'essay') {
      area.innerHTML = `
        <div class="form-group">
          <label>參考答案（供評分參考）</label>
          <textarea id="referenceAnswer" rows="3" placeholder="輸入參考答案"></textarea>
        </div>
        <div class="form-group">
          <label>最少字數</label>
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
      <input type="text" class="option-input" placeholder="選項 ${String.fromCharCode(65 + count)}">
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
      showToast('請輸入題目內容');
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
        showToast('選擇題至少需要 2 個選項');
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
        showToast('題目已建立');
        this.closeModal('createQuestionModal');
        this.openQuestionBank();
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      console.error('Create question error:', error);
      showToast('建立失敗');
    }
  },

  /**
   * 刪除題目
   */
  async deleteQuestion(questionId) {
    if (!confirm('確定要刪除此題目嗎？')) return;

    try {
      const result = await API.questionBank.delete(questionId);
      if (result.success) {
        showToast('題目已刪除');
        this.openQuestionBank();
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      console.error('Delete question error:', error);
      showToast('刪除失敗');
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
        showToast('題庫已匯出');
      } else {
        showToast('匯出失敗');
      }
    } catch (error) {
      console.error('Export questions error:', error);
      showToast('匯出失敗');
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
        if (!courseOptions) { showToast('尚無可用課程'); return; }
        const selectorModal = document.createElement('div');
        selectorModal.id = 'courseSelectForCompletionModal';
        selectorModal.className = 'modal-overlay';
        selectorModal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h3>選擇課程</h3>
              <button onclick="MoodleUI.closeModal('courseSelectForCompletionModal')" class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>請選擇要設定完成條件的課程</label>
                <select id="completionCourseSelect">${courseOptions}</select>
              </div>
            </div>
            <div class="modal-footer">
              <button onclick="MoodleUI.closeModal('courseSelectForCompletionModal')" class="btn-secondary">取消</button>
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
            <h3>課程完成條件設定</h3>
            <button onclick="MoodleUI.closeModal('courseCompletionModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="switch-label">
                <input type="checkbox" id="completionEnabled" ${settings.enabled ? 'checked' : ''}>
                <span class="switch-slider"></span>
                啟用完成追蹤
              </label>
            </div>

            <div id="completionSettingsArea" style="${settings.enabled ? '' : 'display:none'}">
              <div class="form-group">
                <label>聚合方式</label>
                <select id="completionAggregation">
                  <option value="all" ${settings.aggregation === 'all' ? 'selected' : ''}>滿足所有條件</option>
                  <option value="any" ${settings.aggregation === 'any' ? 'selected' : ''}>滿足任一條件</option>
                </select>
              </div>

              <h4>完成條件</h4>
              <div id="completionCriteriaList">
                ${(settings.criteria || []).map((c, idx) => this.renderCompletionCriterion(c, idx)).join('')}
              </div>
              <button onclick="MoodleUI.addCompletionCriterion()" class="btn-sm">+ 新增條件</button>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('courseCompletionModal')" class="btn-secondary">取消</button>
            <button onclick="MoodleUI.saveCourseCompletionSettings('${courseId}')" class="btn-primary">儲存設定</button>
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
      showToast('載入設定失敗');
    }
  },

  /**
   * 渲染完成條件項目
   */
  renderCompletionCriterion(criterion, index) {
    const types = {
      'ACTIVITY_COMPLETION': '活動完成',
      'GRADE': '成績門檻',
      'DURATION': '學習時間',
      'SELF_COMPLETION': '自我標記完成',
      'MANUAL': '教師手動標記'
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
        return `<input type="number" class="criterion-value" placeholder="最低分數" value="${criterion.minGrade || 60}" min="0" max="100">`;
      case 'DURATION':
        return `<input type="number" class="criterion-value" placeholder="最少分鐘" value="${criterion.minMinutes || 30}" min="1">`;
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
        <option value="ACTIVITY_COMPLETION">活動完成</option>
        <option value="GRADE">成績門檻</option>
        <option value="DURATION">學習時間</option>
        <option value="SELF_COMPLETION">自我標記完成</option>
        <option value="MANUAL">教師手動標記</option>
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
      optionsDiv.innerHTML = `<input type="number" class="criterion-value" placeholder="最低分數" value="60" min="0" max="100">`;
    } else if (type === 'DURATION') {
      optionsDiv.innerHTML = `<input type="number" class="criterion-value" placeholder="最少分鐘" value="30" min="1">`;
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
        showToast('完成條件已儲存');
        this.closeModal('courseCompletionModal');
      } else {
        showToast(result.message || '儲存失敗');
      }
    } catch (error) {
      console.error('Save completion settings error:', error);
      showToast('儲存失敗');
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

      const progress = status.completedCriteria / status.totalCriteria * 100;

      return `
        <div class="completion-status-card">
          <h4>課程完成進度</h4>
          <div class="completion-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="progress-text">${status.completedCriteria}/${status.totalCriteria} 完成</span>
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
              標記課程完成
            </button>
          ` : ''}
          ${status.isCompleted ? `
            <div class="completion-badge">
              <span class="badge-icon">🎉</span>
              <span>課程已完成！</span>
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
    if (!confirm('確定要標記此課程為完成嗎？')) return;

    try {
      const result = await API.courseCompletion.selfMark(courseId);
      if (result.success) {
        showToast('課程已標記為完成！');
        location.reload();
      } else {
        showToast(result.message || '操作失敗');
      }
    } catch (error) {
      console.error('Self mark completion error:', error);
      showToast('操作失敗');
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
            <h2>角色權限管理</h2>
            <p>管理系統角色與權限設定</p>
          </div>
          <div class="header-actions">
            <button class="btn-primary" onclick="MoodleUI.openCreateRoleModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              新增角色
            </button>
          </div>
        </div>

        <div class="roles-content">
          <div class="roles-sidebar">
            <h3>系統角色</h3>
            <div class="roles-list" id="rolesList">
              <div class="loading-spinner">載入中...</div>
            </div>
          </div>
          <div class="roles-detail" id="roleDetailPanel">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
              <p>選擇左側的角色以查看詳細資訊</p>
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

      if (!result.success || !result.data?.length) {
        rolesList.innerHTML = `
          <div class="empty-state-small">
            <p>尚無角色資料</p>
          </div>
        `;
        return;
      }

      const roleIcons = {
        admin: '👑',
        educator: '📚',
        trainer: '🎓',
        creator: '✏️',
        student: '🎒',
        guest: '👤'
      };

      rolesList.innerHTML = result.data.map(role => `
        <div class="role-item ${role.isSystem ? 'system-role' : ''}"
             onclick="MoodleUI.selectRole('${role.id}')"
             data-role-id="${role.id}">
          <span class="role-icon">${roleIcons[role.shortName] || '🔐'}</span>
          <div class="role-info">
            <span class="role-name">${role.name}</span>
            <span class="role-type">${role.isSystem ? '系統角色' : '自訂角色'}</span>
          </div>
          <span class="role-user-count">${role.userCount || 0} 人</span>
        </div>
      `).join('');
    } catch (error) {
      console.error('Load roles error:', error);
      document.getElementById('rolesList').innerHTML = `
        <div class="error-state">載入失敗</div>
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
        showToast('載入角色詳情失敗');
        return;
      }

      const role = result.data;
      const capResult = await API.roles.getCapabilities();
      const allCapabilities = capResult.success ? capResult.data : [];

      document.getElementById('roleDetailPanel').innerHTML = `
        <div class="role-detail-content">
          <div class="role-detail-header">
            <h3>${role.name}</h3>
            <p>${role.description || '無描述'}</p>
            ${role.isSystem ? '<span class="badge badge-info">系統角色</span>' : ''}
          </div>

          <div class="role-info-card">
            <div class="info-row">
              <span class="label">角色簡碼</span>
              <span class="value">${role.shortName}</span>
            </div>
            <div class="info-row">
              <span class="label">使用人數</span>
              <span class="value">${role.userCount || 0} 人</span>
            </div>
            <div class="info-row">
              <span class="label">建立時間</span>
              <span class="value">${new Date(role.createdAt).toLocaleDateString('zh-TW')}</span>
            </div>
          </div>

          <div class="capabilities-section">
            <h4>權限能力</h4>
            <div class="capabilities-grid">
              ${this.renderCapabilitiesEditor(role.capabilities || [], allCapabilities, role.isSystem)}
            </div>
          </div>

          ${!role.isSystem ? `
            <div class="role-actions">
              <button class="btn-secondary" onclick="MoodleUI.editRole('${role.id}')">
                編輯角色
              </button>
              <button class="btn-danger" onclick="MoodleUI.deleteRole('${role.id}')">
                刪除角色
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
      'course': { name: '課程管理', icon: '📚' },
      'assignment': { name: '作業管理', icon: '📝' },
      'quiz': { name: '測驗管理', icon: '❓' },
      'forum': { name: '討論區', icon: '💬' },
      'grade': { name: '成績管理', icon: '📊' },
      'user': { name: '用戶管理', icon: '👥' },
      'system': { name: '系統管理', icon: '⚙️' }
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
                     ${roleCapabilities.includes(cap.name) ? 'checked' : ''}
                     ${isReadOnly ? 'disabled' : ''}
                     data-capability="${cap.name}">
              <span class="cap-name">${cap.displayName || cap.name}</span>
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
      const allCapabilities = capResult.success ? capResult.data : [];

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>新增角色</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <form id="createRoleForm" onsubmit="MoodleUI.submitCreateRole(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>角色名稱 *</label>
                <input type="text" name="name" required placeholder="例如：助教">
              </div>
              <div class="form-group">
                <label>角色簡碼 *</label>
                <input type="text" name="shortName" required placeholder="例如：assistant">
                <small>只能使用英文小寫字母和底線</small>
              </div>
              <div class="form-group">
                <label>描述</label>
                <textarea name="description" rows="2" placeholder="角色的用途說明"></textarea>
              </div>
              <div class="form-group">
                <label>權限設定</label>
                <div class="capabilities-grid">
                  ${this.renderCapabilitiesEditor([], allCapabilities, false)}
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
              <button type="submit" class="btn-primary">建立角色</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);
    } catch (error) {
      console.error('Open create role modal error:', error);
      showToast('無法載入權限列表');
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
        shortName: formData.get('shortName'),
        description: formData.get('description'),
        capabilities
      });

      if (result.success) {
        showToast('角色建立成功');
        document.getElementById('createRoleModal').remove();
        await this.loadRolesList();
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      console.error('Create role error:', error);
      showToast('建立角色失敗');
    }
  },

  /**
   * 刪除角色
   */
  async deleteRole(roleId) {
    if (!confirm('確定要刪除此角色嗎？此操作無法復原。')) return;

    try {
      const result = await API.roles.delete(roleId);
      if (result.success) {
        showToast('角色已刪除');
        await this.loadRolesList();
        document.getElementById('roleDetailPanel').innerHTML = `
          <div class="empty-state">
            <p>選擇左側的角色以查看詳細資訊</p>
          </div>
        `;
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      console.error('Delete role error:', error);
      showToast('刪除角色失敗');
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
            <h2>課程類別管理</h2>
            <p>組織和管理課程分類結構</p>
          </div>
          <div class="header-actions">
            <button class="btn-primary" onclick="MoodleUI.openCreateCategoryModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              新增類別
            </button>
          </div>
        </div>

        <div class="categories-content">
          <div class="categories-tree" id="categoriesTree">
            <div class="loading-spinner">載入中...</div>
          </div>
          <div class="category-detail" id="categoryDetailPanel">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              <p>選擇類別以查看詳細資訊</p>
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
            <p>尚無課程類別</p>
            <button class="btn-secondary" onclick="MoodleUI.openCreateCategoryModal()">
              建立第一個類別
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
        <div class="error-state">載入失敗</div>
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
        showToast('載入類別詳情失敗');
        return;
      }

      const category = result.data;
      document.getElementById('categoryDetailPanel').innerHTML = `
        <div class="category-detail-content">
          <div class="category-detail-header">
            <h3>${category.name}</h3>
            <p>${category.description || '無描述'}</p>
          </div>

          <div class="category-info-card">
            <div class="info-row">
              <span class="label">類別 ID</span>
              <span class="value">${category.id}</span>
            </div>
            <div class="info-row">
              <span class="label">課程數量</span>
              <span class="value">${category.courseCount || 0} 個課程</span>
            </div>
            <div class="info-row">
              <span class="label">子類別數</span>
              <span class="value">${category.childCount || 0} 個</span>
            </div>
            <div class="info-row">
              <span class="label">建立時間</span>
              <span class="value">${new Date(category.createdAt).toLocaleDateString('zh-TW')}</span>
            </div>
          </div>

          ${category.courses?.length > 0 ? `
            <div class="category-courses">
              <h4>包含的課程</h4>
              <div class="courses-list">
                ${category.courses.map(course => `
                  <div class="course-item-mini">
                    <span class="course-name">${course.title}</span>
                    <span class="course-status">${course.isPublished ? '已發布' : '草稿'}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="category-actions">
            <button class="btn-secondary" onclick="MoodleUI.editCategory('${category.id}')">
              編輯類別
            </button>
            <button class="btn-secondary" onclick="MoodleUI.openCreateCategoryModal('${category.id}')">
              新增子類別
            </button>
            <button class="btn-danger" onclick="MoodleUI.deleteCategory('${category.id}')">
              刪除類別
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
            <h3>${parentId ? '新增子類別' : '新增類別'}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <form id="createCategoryForm" onsubmit="MoodleUI.submitCreateCategory(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>類別名稱 *</label>
                <input type="text" name="name" required placeholder="例如：程式設計">
              </div>
              <div class="form-group">
                <label>父類別</label>
                <select name="parentId">
                  <option value="">-- 無（頂層類別）--</option>
                  ${categories.map(cat => `
                    <option value="${cat.id}" ${cat.id === parentId ? 'selected' : ''}>${cat.name}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>描述</label>
                <textarea name="description" rows="3" placeholder="類別的說明"></textarea>
              </div>
              <div class="form-group">
                <label>排序</label>
                <input type="number" name="sortOrder" value="0" min="0">
                <small>數字越小越靠前</small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
              <button type="submit" class="btn-primary">建立類別</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);
    } catch (error) {
      console.error('Open create category modal error:', error);
      showToast('無法載入類別列表');
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
        showToast('類別建立成功');
        document.getElementById('createCategoryModal').remove();
        await this.loadCategoriesTree();
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      console.error('Create category error:', error);
      showToast('建立類別失敗');
    }
  },

  /**
   * 編輯類別
   */
  async editCategory(categoryId) {
    try {
      const result = await API.courseCategories.get(categoryId);
      if (!result.success) {
        showToast('載入類別資料失敗');
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
            <h3>編輯類別</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <form id="editCategoryForm" onsubmit="MoodleUI.submitEditCategory(event, '${categoryId}')">
            <div class="modal-body">
              <div class="form-group">
                <label>類別名稱 *</label>
                <input type="text" name="name" required value="${category.name}">
              </div>
              <div class="form-group">
                <label>父類別</label>
                <select name="parentId">
                  <option value="">-- 無（頂層類別）--</option>
                  ${categories.map(cat => `
                    <option value="${cat.id}" ${cat.id === category.parentId ? 'selected' : ''}>${cat.name}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>描述</label>
                <textarea name="description" rows="3">${category.description || ''}</textarea>
              </div>
              <div class="form-group">
                <label>排序</label>
                <input type="number" name="sortOrder" value="${category.sortOrder || 0}" min="0">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
              <button type="submit" class="btn-primary">儲存變更</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);
    } catch (error) {
      console.error('Edit category error:', error);
      showToast('無法載入類別資料');
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
        showToast('類別已更新');
        document.getElementById('editCategoryModal').remove();
        await this.loadCategoriesTree();
        await this.selectCategory(categoryId);
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      console.error('Update category error:', error);
      showToast('更新類別失敗');
    }
  },

  /**
   * 刪除類別
   */
  async deleteCategory(categoryId) {
    if (!confirm('確定要刪除此類別嗎？子類別將移至上層。')) return;

    try {
      const result = await API.courseCategories.delete(categoryId);
      if (result.success) {
        showToast('類別已刪除');
        await this.loadCategoriesTree();
        document.getElementById('categoryDetailPanel').innerHTML = `
          <div class="empty-state">
            <p>選擇類別以查看詳細資訊</p>
          </div>
        `;
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      console.error('Delete category error:', error);
      showToast('刪除類別失敗');
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
    container.innerHTML = '<div class="loading">載入中...</div>';
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
      container.innerHTML = '<div class="error">載入評量標準失敗</div>';
    }
  },

  renderRubricsPage(container, rubrics, templates) {
    const filtered = this.currentRubricsFilter === 'all' ? rubrics :
      rubrics.filter(r => r.status === this.currentRubricsFilter);

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">評量標準管理</h2>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="MoodleUI.openCreateRubricModal()" class="btn-primary">+ 建立評量標準</button>
          ${templates.length > 0 ? '<button onclick="MoodleUI.openCreateRubricFromTemplate()" class="btn-secondary">從範本建立</button>' : ''}
        </div>
      </div>
      <div class="filter-tabs" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;">
        ${['all','active','draft'].map(f => `
          <button class="btn-sm ${this.currentRubricsFilter === f ? 'btn-primary' : 'btn-secondary'}"
                  onclick="MoodleUI.currentRubricsFilter='${f}';MoodleUI.renderRubricsPage(document.getElementById('rubricsContent'),MoodleUI._rubricsData,MoodleUI._rubricsTemplates)">
            ${f === 'all' ? '全部' : f === 'active' ? '啟用' : '草稿'}
          </button>
        `).join('')}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${filtered.length === 0 ? '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">尚無評量標準</p>' :
          filtered.map(r => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewRubricDetail('${r.rubricId || r.id}')">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
                <h3 style="margin:0;font-size:1.1rem;">${r.name || '未命名'}</h3>
                <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;background:${r.status === 'active' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                  ${r.status === 'active' ? '啟用' : '草稿'}
                </span>
              </div>
              <p style="margin:0 0 0.5rem;color:var(--gray-400);font-size:0.9rem;">${r.description || '無描述'}</p>
              <div style="display:flex;gap:1rem;font-size:0.85rem;color:var(--gray-400);">
                <span>準則：${(r.criteria || []).length}</span>
                <span>最高分：${r.maxScore || 0}</span>
              </div>
            </div>
          `).join('')}
      </div>`;
  },

  async viewRubricDetail(rubricId) {
    const container = document.getElementById('rubricsContent');
    if (!container) return;
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const result = await API.rubrics.get(rubricId);
      if (!result.success) { container.innerHTML = '<div class="error">載入失敗</div>'; return; }
      const r = result.data;
      const criteria = r.criteria || [];
      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openRubricsManager()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.25rem;">${r.name || '未命名'}</h2>
            <p style="margin:0;color:var(--gray-400);">${r.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.duplicateRubric('${rubricId}')" class="btn-sm btn-secondary">複製</button>
            <button onclick="MoodleUI.deleteRubric('${rubricId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">刪除</button>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <thead>
              <tr style="background:var(--gray-100);">
                <th style="padding:10px;text-align:left;border:1px solid var(--gray-200);">準則</th>
                <th style="padding:10px;text-align:left;border:1px solid var(--gray-200);">描述</th>
                <th style="padding:10px;text-align:center;border:1px solid var(--gray-200);">分數</th>
                <th style="padding:10px;text-align:left;border:1px solid var(--gray-200);">等級</th>
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
          <strong>最高分數：</strong>${r.maxScore || 0} ｜ <strong>狀態：</strong>${r.status === 'active' ? '啟用' : '草稿'}
        </div>`;
    } catch (error) {
      console.error('View rubric detail error:', error);
      container.innerHTML = '<div class="error">載入失敗</div>';
    }
  },

  openCreateRubricModal() {
    const modal = document.createElement('div');
    modal.id = 'createRubricModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>建立評量標準</h3>
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名稱 *</label>
            <input type="text" id="rubricName" placeholder="評量標準名稱">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="rubricDescription" rows="2" placeholder="評量標準描述"></textarea>
          </div>
          <div class="form-group">
            <label>狀態</label>
            <select id="rubricStatus"><option value="draft">草稿</option><option value="active">啟用</option></select>
          </div>
          <h4>評分準則</h4>
          <div id="rubricCriteriaList">
            <div class="rubric-criterion-item" style="border:1px solid var(--gray-200);border-radius:8px;padding:1rem;margin-bottom:0.75rem;">
              <div class="form-row">
                <div class="form-group" style="flex:1"><label>準則名稱</label><input type="text" class="criterion-name" placeholder="例如：內容品質"></div>
                <div class="form-group" style="flex:1"><label>最高分數</label><input type="number" class="criterion-score" value="25" min="0"></div>
                <button type="button" onclick="this.closest('.rubric-criterion-item').remove()" style="align-self:flex-end;background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.2rem;padding:6px;">×</button>
              </div>
              <div class="form-group"><label>描述</label><input type="text" class="criterion-desc" placeholder="準則描述"></div>
              <div class="criterion-levels" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
                  <input type="text" class="level-name" value="優秀" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
                  <input type="number" class="level-score" value="25" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
                </div>
                <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
                  <input type="text" class="level-name" value="良好" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
                  <input type="number" class="level-score" value="18" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
                </div>
                <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
                  <input type="text" class="level-name" value="待改進" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
                  <input type="number" class="level-score" value="10" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
                </div>
              </div>
            </div>
          </div>
          <button onclick="MoodleUI.addRubricCriterion()" class="btn-sm btn-secondary" style="margin-top:0.5rem;">+ 新增準則</button>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveRubric()" class="btn-primary">建立</button>
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
        <div class="form-group" style="flex:1"><label>準則名稱</label><input type="text" class="criterion-name" placeholder="準則名稱"></div>
        <div class="form-group" style="flex:1"><label>最高分數</label><input type="number" class="criterion-score" value="25" min="0"></div>
        <button type="button" onclick="this.closest('.rubric-criterion-item').remove()" style="align-self:flex-end;background:none;border:none;color:#dc2626;cursor:pointer;font-size:1.2rem;padding:6px;">×</button>
      </div>
      <div class="form-group"><label>描述</label><input type="text" class="criterion-desc" placeholder="準則描述"></div>
      <div class="criterion-levels" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
          <input type="text" class="level-name" value="優秀" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
          <input type="number" class="level-score" value="25" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
        </div>
        <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
          <input type="text" class="level-name" value="良好" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
          <input type="number" class="level-score" value="18" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
        </div>
        <div style="background:var(--gray-50);padding:6px 8px;border-radius:4px;font-size:0.85rem;">
          <input type="text" class="level-name" value="待改進" style="width:50px;border:none;background:transparent;font-size:0.85rem;">
          <input type="number" class="level-score" value="10" min="0" style="width:40px;border:none;background:transparent;font-size:0.85rem;">
        </div>
      </div>`;
    list.appendChild(item);
  },

  async saveRubric() {
    const name = document.getElementById('rubricName')?.value?.trim();
    if (!name) { showToast('請填寫名稱'); return; }
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
        showToast('評量標準建立成功');
        this.closeModal('createRubricModal');
        this.openRubricsManager();
      } else { showToast(result.error || '建立失敗'); }
    } catch (error) {
      console.error('Save rubric error:', error);
      showToast('建立評量標準失敗');
    }
  },

  async deleteRubric(rubricId) {
    if (!confirm('確定要刪除此評量標準？')) return;
    try {
      const result = await API.rubrics.delete(rubricId);
      if (result.success) { showToast('已刪除'); this.openRubricsManager(); }
      else { showToast(result.error || '刪除失敗'); }
    } catch (error) { showToast('刪除失敗'); }
  },

  async duplicateRubric(rubricId) {
    try {
      const result = await API.rubrics.duplicate(rubricId);
      if (result.success) { showToast('已複製'); this.openRubricsManager(); }
      else { showToast(result.error || '複製失敗'); }
    } catch (error) { showToast('複製失敗'); }
  },

  openCreateRubricFromTemplate() {
    const templates = this._rubricsTemplates || [];
    const modal = document.createElement('div');
    modal.id = 'rubricTemplateModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>從範本建立</h3>
          <button onclick="MoodleUI.closeModal('rubricTemplateModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          ${templates.map(t => `
            <div style="padding:1rem;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:0.75rem;cursor:pointer;"
                 onclick="MoodleUI.closeModal('rubricTemplateModal');MoodleUI.duplicateRubric('${t.rubricId || t.id}')">
              <h4 style="margin:0 0 0.25rem;">${t.name || '範本'}</h4>
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
    container.innerHTML = '<div class="loading">載入中...</div>';
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
      container.innerHTML = '<div class="error">載入徽章系統失敗</div>';
    }
  },

  renderBadgesPage(container, badges, stats) {
    const filtered = this.currentBadgesFilter === 'all' ? badges :
      badges.filter(b => b.status === this.currentBadgesFilter || b.type === this.currentBadgesFilter);

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">徽章管理</h2>
        <button onclick="MoodleUI.openCreateBadgeModal()" class="btn-primary">+ 建立徽章</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:1.5rem;">
        <div style="padding:1rem;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:8px;">
          <div style="font-size:1.8rem;font-weight:700;">${stats.totalBadges || badges.length}</div>
          <div style="font-size:0.85rem;opacity:0.9;">總徽章數</div>
        </div>
        <div style="padding:1rem;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;border-radius:8px;">
          <div style="font-size:1.8rem;font-weight:700;">${stats.activeBadges || 0}</div>
          <div style="font-size:0.85rem;opacity:0.9;">啟用中</div>
        </div>
        <div style="padding:1rem;background:linear-gradient(135deg,#4facfe,#00f2fe);color:#fff;border-radius:8px;">
          <div style="font-size:1.8rem;font-weight:700;">${stats.totalIssued || 0}</div>
          <div style="font-size:0.85rem;opacity:0.9;">已頒發</div>
        </div>
      </div>
      <div class="filter-tabs" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;">
        ${['all','active','draft','course','site'].map(f => `
          <button class="btn-sm ${this.currentBadgesFilter === f ? 'btn-primary' : 'btn-secondary'}"
                  onclick="MoodleUI.currentBadgesFilter='${f}';MoodleUI.renderBadgesPage(document.getElementById('badgesContent'),MoodleUI._badgesData,MoodleUI._badgesStats)">
            ${{all:'全部',active:'啟用',draft:'草稿',course:'課程',site:'全站'}[f]}
          </button>
        `).join('')}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem;">
        ${filtered.length === 0 ? '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">尚無徽章</p>' :
          filtered.map(b => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;text-align:center;"
                 onclick="MoodleUI.viewBadgeDetail('${b.badgeId || b.id}')">
              <div style="width:64px;height:64px;margin:0 auto 1rem;background:${b.color || '#f59e0b'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">
                ${b.icon || '🏆'}
              </div>
              <h3 style="margin:0 0 0.5rem;font-size:1rem;">${b.name || '未命名'}</h3>
              <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;background:${b.status === 'active' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                ${b.status === 'active' ? '啟用' : '草稿'}
              </span>
              <div style="margin-top:0.75rem;font-size:0.85rem;color:var(--gray-400);">
                <span>類型：${{course:'課程',site:'全站',manual:'手動'}[b.type] || b.type || '—'}</span>
                <span style="margin-left:0.5rem;">已頒發：${b.issuedCount || 0}</span>
              </div>
            </div>
          `).join('')}
      </div>`;
  },

  async viewBadgeDetail(badgeId) {
    const container = document.getElementById('badgesContent');
    if (!container) return;
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const [badgeResult, recipientsResult] = await Promise.all([
        API.badges.get(badgeId),
        API.badges.getRecipients(badgeId)
      ]);
      if (!badgeResult.success) { container.innerHTML = '<div class="error">載入失敗</div>'; return; }
      const b = badgeResult.data;
      const recipients = recipientsResult.success ? (Array.isArray(recipientsResult.data) ? recipientsResult.data : (recipientsResult.data?.recipients || [])) : [];

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openBadges()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;gap:2rem;margin-bottom:2rem;">
          <div style="width:120px;height:120px;background:${b.color || '#f59e0b'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:3rem;flex-shrink:0;">
            ${b.icon || '🏆'}
          </div>
          <div style="flex:1;">
            <h2 style="margin:0 0 0.5rem;">${b.name || '未命名'}</h2>
            <p style="margin:0 0 0.5rem;color:var(--gray-400);">${b.description || '無描述'}</p>
            <div style="display:flex;gap:1rem;font-size:0.9rem;">
              <span>類型：${{course:'課程',site:'全站',manual:'手動'}[b.type] || b.type || '—'}</span>
              <span>狀態：${b.status === 'active' ? '啟用' : '草稿'}</span>
              <span>已頒發：${b.issuedCount || 0}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.5rem;">
            <button onclick="MoodleUI.openIssueBadgeModal('${badgeId}')" class="btn-primary btn-sm">頒發徽章</button>
            <button onclick="MoodleUI.deleteBadge('${badgeId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">刪除</button>
          </div>
        </div>
        ${(b.criteria || []).length > 0 ? `
          <div style="margin-bottom:1.5rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.75rem;">取得條件</h4>
            <ul style="margin:0;padding-left:1.5rem;">${b.criteria.map(c => `<li>${c.description || c.type || '條件'}</li>`).join('')}</ul>
          </div>
        ` : ''}
        <h3>獲獎者（${recipients.length}）</h3>
        ${recipients.length === 0 ? '<p style="color:var(--gray-400);">尚無獲獎者</p>' : `
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
              <thead><tr style="background:var(--gray-100);">
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">使用者</th>
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">頒發日期</th>
                <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">操作</th>
              </tr></thead>
              <tbody>
                ${recipients.map(r => `
                  <tr>
                    <td style="padding:8px;border:1px solid var(--gray-200);">${r.userName || r.userId || '—'}</td>
                    <td style="padding:8px;border:1px solid var(--gray-200);">${this.formatDate(r.issuedAt || r.createdAt, 'datetime')}</td>
                    <td style="padding:8px;text-align:center;border:1px solid var(--gray-200);">
                      <button onclick="MoodleUI.revokeBadge('${badgeId}','${r.userId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.8rem;">撤銷</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}`;
    } catch (error) {
      console.error('View badge detail error:', error);
      container.innerHTML = '<div class="error">載入失敗</div>';
    }
  },

  openCreateBadgeModal() {
    const modal = document.createElement('div');
    modal.id = 'createBadgeModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>建立徽章</h3>
          <button onclick="MoodleUI.closeModal('createBadgeModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>徽章名稱 *</label>
            <input type="text" id="badgeName" placeholder="輸入徽章名稱">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="badgeDescription" rows="2" placeholder="徽章描述"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>圖示</label>
              <select id="badgeIcon">
                <option value="🏆">🏆 獎盃</option><option value="⭐">⭐ 星星</option>
                <option value="🎓">🎓 畢業帽</option><option value="🏅">🏅 獎牌</option>
                <option value="💎">💎 鑽石</option><option value="🌟">🌟 閃星</option>
                <option value="📚">📚 書籍</option><option value="🎯">🎯 靶心</option>
              </select>
            </div>
            <div class="form-group">
              <label>類型</label>
              <select id="badgeType">
                <option value="course">課程徽章</option><option value="site">全站徽章</option><option value="manual">手動頒發</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>狀態</label>
            <select id="badgeStatus"><option value="draft">草稿</option><option value="active">啟用</option></select>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createBadgeModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveBadge()" class="btn-primary">建立徽章</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createBadgeModal'); };
  },

  async saveBadge() {
    const name = document.getElementById('badgeName')?.value?.trim();
    if (!name) { showToast('請填寫名稱'); return; }
    try {
      const result = await API.badges.create({
        name,
        description: document.getElementById('badgeDescription')?.value || '',
        icon: document.getElementById('badgeIcon')?.value || '🏆',
        type: document.getElementById('badgeType')?.value || 'course',
        status: document.getElementById('badgeStatus')?.value || 'draft'
      });
      if (result.success) {
        showToast('徽章建立成功');
        this.closeModal('createBadgeModal');
        this.openBadges();
      } else { showToast(result.error || '建立失敗'); }
    } catch (error) { showToast('建立徽章失敗'); }
  },

  openIssueBadgeModal(badgeId) {
    const modal = document.createElement('div');
    modal.id = 'issueBadgeModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>頒發徽章</h3>
          <button onclick="MoodleUI.closeModal('issueBadgeModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>使用者 ID（多個以逗號分隔）</label>
            <input type="text" id="issueBadgeUserIds" placeholder="例如：user1, user2">
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('issueBadgeModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.issueBadge('${badgeId}')" class="btn-primary">頒發</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('issueBadgeModal'); };
  },

  async issueBadge(badgeId) {
    const userIdsStr = document.getElementById('issueBadgeUserIds')?.value?.trim();
    if (!userIdsStr) { showToast('請輸入使用者 ID'); return; }
    const userIds = userIdsStr.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const result = await API.badges.issue(badgeId, { userIds });
      if (result.success) {
        showToast(`已頒發給 ${result.data?.issued || userIds.length} 位使用者`);
        this.closeModal('issueBadgeModal');
        this.viewBadgeDetail(badgeId);
      } else { showToast(result.error || '頒發失敗'); }
    } catch (error) { showToast('頒發失敗'); }
  },

  async revokeBadge(badgeId, userId) {
    if (!confirm('確定要撤銷此徽章？')) return;
    try {
      const result = await API.badges.revoke(badgeId, userId);
      if (result.success) { showToast('已撤銷'); this.viewBadgeDetail(badgeId); }
      else { showToast(result.error || '撤銷失敗'); }
    } catch (error) { showToast('撤銷失敗'); }
  },

  async deleteBadge(badgeId) {
    if (!confirm('確定要刪除此徽章？')) return;
    try {
      const result = await API.badges.delete(badgeId);
      if (result.success) { showToast('已刪除'); this.openBadges(); }
      else { showToast(result.error || '刪除失敗'); }
    } catch (error) { showToast('刪除失敗'); }
  },

  /**
   * 學習路徑
   */
  async openLearningPaths() {
    const container = document.getElementById('learningPathsContent');
    if (!container) return;
    showView('learningPaths');
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const result = await API.learningPaths.list();
      const paths = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.paths || [])) : [];
      this._learningPathsData = paths;
      this.renderLearningPathsPage(container, paths);
    } catch (error) {
      console.error('Open learning paths error:', error);
      container.innerHTML = '<div class="error">載入學習路徑失敗</div>';
    }
  },

  renderLearningPathsPage(container, paths) {
    const difficultyLabels = { beginner: '初級', intermediate: '中級', advanced: '高級' };
    const difficultyColors = { beginner: '#dcfce7', intermediate: '#fef3c7', advanced: '#fee2e2' };
    const difficultyText = { beginner: '#166534', intermediate: '#92400e', advanced: '#dc2626' };

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">學習路徑</h2>
        <button onclick="MoodleUI.openCreateLearningPathModal()" class="btn-primary">+ 建立學習路徑</button>
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${paths.length === 0 ? '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">尚無學習路徑</p>' :
          paths.map(p => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewLearningPathDetail('${p.pathId || p.id}')">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
                <h3 style="margin:0;font-size:1.1rem;">${p.name || p.title || '未命名'}</h3>
                <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;background:${difficultyColors[p.difficulty] || '#f3f4f6'};color:${difficultyText[p.difficulty] || '#374151'};">
                  ${difficultyLabels[p.difficulty] || p.difficulty || '—'}
                </span>
              </div>
              <p style="margin:0 0 0.75rem;color:var(--gray-400);font-size:0.9rem;">${p.description || '無描述'}</p>
              <div style="display:flex;gap:1rem;font-size:0.85rem;color:var(--gray-400);">
                <span>課程：${(p.courses || []).length}</span>
                <span>時長：${p.duration || '—'}</span>
                <span>已報名：${p.enrolledCount || 0}</span>
              </div>
              ${p.progress != null ? `
                <div style="margin-top:0.75rem;">
                  <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
                    <span>進度</span><span>${Math.round(p.progress)}%</span>
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
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const [pathResult, reportResult] = await Promise.all([
        API.learningPaths.get(pathId),
        API.learningPaths.getReport(pathId).catch(() => ({ success: false }))
      ]);
      if (!pathResult.success) { container.innerHTML = '<div class="error">載入失敗</div>'; return; }
      const p = pathResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const courses = p.courses || [];
      const progress = p.userProgress || p.progress;

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openLearningPaths()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.5rem;">${p.name || p.title || '未命名'}</h2>
            <p style="margin:0;color:var(--gray-400);">${p.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.enrollLearningPath('${pathId}')" class="btn-primary btn-sm">報名</button>
            <button onclick="MoodleUI.deleteLearningPath('${pathId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">刪除</button>
          </div>
        </div>
        ${progress != null ? `
          <div style="margin-bottom:1.5rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span>整體進度</span><span>${Math.round(typeof progress === 'object' ? progress.overallProgress || 0 : progress)}%</span>
            </div>
            <div style="height:8px;background:var(--gray-200);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${typeof progress === 'object' ? progress.overallProgress || 0 : progress}%;background:var(--primary);border-radius:4px;"></div>
            </div>
          </div>
        ` : ''}
        <h3 style="margin-bottom:1rem;">課程序列（${courses.length} 門）</h3>
        <div style="position:relative;padding-left:2rem;">
          ${courses.map((c, idx) => `
            <div style="display:flex;align-items:start;margin-bottom:1.5rem;position:relative;">
              <div style="position:absolute;left:-2rem;width:28px;height:28px;background:${c.completed ? 'var(--primary)' : 'var(--gray-300)'};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:600;">
                ${c.completed ? '✓' : idx + 1}
              </div>
              ${idx < courses.length - 1 ? `<div style="position:absolute;left:calc(-2rem + 13px);top:28px;width:2px;height:calc(100% + 0.5rem);background:var(--gray-200);"></div>` : ''}
              <div style="flex:1;padding:1rem;border:1px solid var(--gray-200);border-radius:8px;margin-left:0.5rem;${c.completed ? 'border-color:var(--primary);background:#f0f9ff;' : ''}">
                <h4 style="margin:0 0 0.25rem;">${c.title || c.name || '課程 ' + (idx + 1)}</h4>
                <p style="margin:0;font-size:0.85rem;color:var(--gray-400);">${c.description || ''}</p>
              </div>
            </div>
          `).join('')}
        </div>
        ${report.totalEnrolled ? `
          <div style="margin-top:1.5rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.5rem;">統計</h4>
            <div style="display:flex;gap:2rem;font-size:0.9rem;">
              <span>總報名：${report.totalEnrolled}</span>
              <span>完成率：${report.completionRate ? Math.round(report.completionRate) + '%' : '—'}</span>
            </div>
          </div>
        ` : ''}`;
    } catch (error) {
      console.error('View learning path detail error:', error);
      container.innerHTML = '<div class="error">載入失敗</div>';
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
          <h3>建立學習路徑</h3>
          <button onclick="MoodleUI.closeModal('createLearningPathModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>路徑名稱 *</label>
            <input type="text" id="lpName" placeholder="學習路徑名稱">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="lpDescription" rows="2" placeholder="學習路徑描述"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>難度</label>
              <select id="lpDifficulty">
                <option value="beginner">初級</option>
                <option value="intermediate">中級</option>
                <option value="advanced">高級</option>
              </select>
            </div>
            <div class="form-group">
              <label>預估時長</label>
              <input type="text" id="lpDuration" placeholder="例如：20 小時">
            </div>
          </div>
          <div class="form-group">
            <label>選擇課程（按住 Ctrl/Cmd 多選）</label>
            <select id="lpCourses" multiple style="min-height:120px;">
              ${courseOptions}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createLearningPathModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveLearningPath()" class="btn-primary">建立</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createLearningPathModal'); };
  },

  async saveLearningPath() {
    const name = document.getElementById('lpName')?.value?.trim();
    if (!name) { showToast('請填寫名稱'); return; }
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
        showToast('學習路徑建立成功');
        this.closeModal('createLearningPathModal');
        this.openLearningPaths();
      } else { showToast(result.error || '建立失敗'); }
    } catch (error) { showToast('建立學習路徑失敗'); }
  },

  async enrollLearningPath(pathId) {
    try {
      const result = await API.learningPaths.enroll(pathId);
      if (result.success) { showToast('報名成功'); this.viewLearningPathDetail(pathId); }
      else { showToast(result.error || '報名失敗'); }
    } catch (error) { showToast('報名失敗'); }
  },

  async deleteLearningPath(pathId) {
    if (!confirm('確定要刪除此學習路徑？')) return;
    try {
      const result = await API.learningPaths.delete(pathId);
      if (result.success) { showToast('已刪除'); this.openLearningPaths(); }
      else { showToast(result.error || '刪除失敗'); }
    } catch (error) { showToast('刪除失敗'); }
  },

  /**
   * 稽核日誌
   */
  currentAuditFilters: { eventType: '', severity: '', page: 1 },

  async openAuditLogs() {
    const container = document.getElementById('auditLogsContent');
    if (!container) return;
    showView('auditLogs');
    container.innerHTML = '<div class="loading">載入中...</div>';
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
      container.innerHTML = '<div class="error">載入稽核日誌失敗</div>';
    }
  },

  renderAuditLogsPage(container, logs, eventTypes, stats, pagination) {
    const severityColors = { info: '#3b82f6', warning: '#f59e0b', error: '#ef4444', critical: '#dc2626' };
    const severityLabels = { info: '資訊', warning: '警告', error: '錯誤', critical: '嚴重' };

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">稽核日誌</h2>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="MoodleUI.exportAuditLogs('csv')" class="btn-secondary btn-sm">匯出 CSV</button>
          <button onclick="MoodleUI.exportAuditLogs('json')" class="btn-secondary btn-sm">匯出 JSON</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
        <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;">${stats.totalLogs || logs.length}</div>
          <div style="font-size:0.8rem;color:var(--gray-400);">總記錄數</div>
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
          <label style="font-size:0.8rem;">事件類型</label>
          <select id="auditFilterType" onchange="MoodleUI.filterAuditLogs()" style="font-size:0.9rem;padding:6px;">
            <option value="">全部</option>
            ${eventTypes.map(et => `<option value="${et.type || et}" ${this.currentAuditFilters.eventType === (et.type || et) ? 'selected' : ''}>${et.label || et.name || et}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:120px;">
          <label style="font-size:0.8rem;">嚴重度</label>
          <select id="auditFilterSeverity" onchange="MoodleUI.filterAuditLogs()" style="font-size:0.9rem;padding:6px;">
            <option value="">全部</option>
            <option value="info" ${this.currentAuditFilters.severity === 'info' ? 'selected' : ''}>資訊</option>
            <option value="warning" ${this.currentAuditFilters.severity === 'warning' ? 'selected' : ''}>警告</option>
            <option value="error" ${this.currentAuditFilters.severity === 'error' ? 'selected' : ''}>錯誤</option>
            <option value="critical" ${this.currentAuditFilters.severity === 'critical' ? 'selected' : ''}>嚴重</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:140px;">
          <label style="font-size:0.8rem;">開始日期</label>
          <input type="date" id="auditFilterStartDate" onchange="MoodleUI.filterAuditLogs()" style="font-size:0.9rem;padding:6px;">
        </div>
        <div class="form-group" style="margin:0;min-width:140px;">
          <label style="font-size:0.8rem;">結束日期</label>
          <input type="date" id="auditFilterEndDate" onchange="MoodleUI.filterAuditLogs()" style="font-size:0.9rem;padding:6px;">
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead>
            <tr style="background:var(--gray-100);">
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">時間</th>
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">事件類型</th>
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">使用者</th>
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">IP</th>
              <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">描述</th>
              <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">嚴重度</th>
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
          <span style="padding:6px 12px;font-size:0.9rem;">第 ${pagination.page || this.currentAuditFilters.page} / ${pagination.totalPages} 頁</span>
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
        showToast('已匯出');
      } else { showToast('匯出失敗'); }
    } catch (error) {
      console.error('Export audit logs error:', error);
      showToast('匯出失敗');
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
    container.innerHTML = '<div class="loading">載入中...</div>';
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
      container.innerHTML = '<div class="error">載入 H5P 內容失敗</div>';
    }
  },

  renderH5pPage(container, contents, types) {
    const filtered = this.currentH5pFilter === 'all' ? contents :
      contents.filter(c => c.contentType === this.currentH5pFilter || c.status === this.currentH5pFilter);
    const typeIcons = { 'Interactive Video': '🎬', 'Course Presentation': '📊', 'Quiz': '❓', 'Drag and Drop': '🎯', 'Fill in the Blanks': '✏️', 'Dialog Cards': '🃏', 'Timeline': '📅', 'Flashcards': '🗂️' };

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">H5P 互動內容</h2>
        <button onclick="MoodleUI.openCreateH5pModal()" class="btn-primary">+ 建立 H5P 內容</button>
      </div>
      <div class="filter-tabs" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
        <button class="btn-sm ${this.currentH5pFilter === 'all' ? 'btn-primary' : 'btn-secondary'}"
                onclick="MoodleUI.currentH5pFilter='all';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">全部</button>
        <button class="btn-sm ${this.currentH5pFilter === 'published' ? 'btn-primary' : 'btn-secondary'}"
                onclick="MoodleUI.currentH5pFilter='published';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">已發佈</button>
        <button class="btn-sm ${this.currentH5pFilter === 'draft' ? 'btn-primary' : 'btn-secondary'}"
                onclick="MoodleUI.currentH5pFilter='draft';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">草稿</button>
        ${types.slice(0, 5).map(t => {
          const typeName = t.name || t.type || t;
          return `<button class="btn-sm ${this.currentH5pFilter === typeName ? 'btn-primary' : 'btn-secondary'}"
                onclick="MoodleUI.currentH5pFilter='${typeName}';MoodleUI.renderH5pPage(document.getElementById('h5pManagerContent'),MoodleUI._h5pData,MoodleUI._h5pTypes)">${typeName}</button>`;
        }).join('')}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${filtered.length === 0 ? '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">尚無 H5P 內容</p>' :
          filtered.map(c => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewH5pDetail('${c.contentId || c.id}')">
              <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                <span style="font-size:1.5rem;">${typeIcons[c.contentType] || '📦'}</span>
                <div style="flex:1;">
                  <h3 style="margin:0;font-size:1rem;">${c.title || '未命名'}</h3>
                  <span style="font-size:0.8rem;color:var(--gray-400);">${c.contentType || '—'}</span>
                </div>
                <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:${c.status === 'published' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                  ${c.status === 'published' ? '已發佈' : '草稿'}
                </span>
              </div>
              <div style="display:flex;gap:1rem;font-size:0.8rem;color:var(--gray-400);">
                <span>瀏覽：${c.viewCount || 0}</span>
                <span>嘗試：${c.attemptCount || 0}</span>
              </div>
            </div>
          `).join('')}
      </div>`;
  },

  async viewH5pDetail(contentId) {
    const container = document.getElementById('h5pManagerContent');
    if (!container) return;
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const [contentResult, reportResult, embedResult] = await Promise.all([
        API.h5p.get(contentId),
        API.h5p.getReport(contentId).catch(() => ({ success: false })),
        API.h5p.getEmbed(contentId).catch(() => ({ success: false }))
      ]);
      if (!contentResult.success) { container.innerHTML = '<div class="error">載入失敗</div>'; return; }
      const c = contentResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const embed = embedResult.success ? embedResult.data : {};

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openH5pManager()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.25rem;">${c.title || '未命名'}</h2>
            <p style="margin:0;color:var(--gray-400);">${c.contentType || ''} — ${c.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.duplicateH5pContent('${contentId}')" class="btn-sm btn-secondary">複製</button>
            <button onclick="MoodleUI.deleteH5pContent('${contentId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">刪除</button>
          </div>
        </div>
        ${embed.embedCode || embed.html ? `
          <div style="margin-bottom:1.5rem;padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.5rem;">預覽</h4>
            <div style="border:1px solid var(--gray-200);border-radius:4px;min-height:200px;background:#fff;padding:1rem;">
              ${embed.embedCode || embed.html || '<p style="color:var(--gray-400);text-align:center;">無法預覽</p>'}
            </div>
          </div>
        ` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.totalAttempts || c.attemptCount || 0}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">總嘗試</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.uniqueUsers || 0}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">使用者</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.averageScore != null ? Math.round(report.averageScore) + '%' : '—'}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">平均分數</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${c.viewCount || 0}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">瀏覽數</div>
          </div>
        </div>`;
    } catch (error) {
      console.error('View H5P detail error:', error);
      container.innerHTML = '<div class="error">載入失敗</div>';
    }
  },

  async openCreateH5pModal() {
    const types = this._h5pTypes || [];
    let courseOptions = '<option value="">不指定</option>';
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
          <h3>建立 H5P 內容</h3>
          <button onclick="MoodleUI.closeModal('createH5pModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>內容類型 *</label>
            <select id="h5pContentType">
              ${types.length > 0 ?
                types.map(t => `<option value="${t.type || t.name || t}">${t.name || t.type || t}</option>`).join('') :
                `<option value="Interactive Video">互動影片</option>
                 <option value="Course Presentation">課程簡報</option>
                 <option value="Quiz">測驗</option>
                 <option value="Drag and Drop">拖放題</option>
                 <option value="Fill in the Blanks">填空題</option>
                 <option value="Dialog Cards">對話卡片</option>`}
            </select>
          </div>
          <div class="form-group">
            <label>標題 *</label>
            <input type="text" id="h5pTitle" placeholder="內容標題">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="h5pDescription" rows="2" placeholder="內容描述"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>所屬課程</label>
              <select id="h5pCourse">${courseOptions}</select>
            </div>
            <div class="form-group">
              <label>狀態</label>
              <select id="h5pStatus"><option value="draft">草稿</option><option value="published">已發佈</option></select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createH5pModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveH5pContent()" class="btn-primary">建立</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createH5pModal'); };
  },

  async saveH5pContent() {
    const title = document.getElementById('h5pTitle')?.value?.trim();
    if (!title) { showToast('請填寫標題'); return; }
    try {
      const result = await API.h5p.create({
        title,
        contentType: document.getElementById('h5pContentType')?.value || 'Interactive Video',
        description: document.getElementById('h5pDescription')?.value || '',
        courseId: document.getElementById('h5pCourse')?.value || undefined,
        status: document.getElementById('h5pStatus')?.value || 'draft'
      });
      if (result.success) {
        showToast('H5P 內容建立成功');
        this.closeModal('createH5pModal');
        this.openH5pManager();
      } else { showToast(result.error || '建立失敗'); }
    } catch (error) { showToast('建立 H5P 內容失敗'); }
  },

  async duplicateH5pContent(contentId) {
    try {
      const result = await API.h5p.duplicate(contentId);
      if (result.success) { showToast('已複製'); this.openH5pManager(); }
      else { showToast(result.error || '複製失敗'); }
    } catch (error) { showToast('複製失敗'); }
  },

  async deleteH5pContent(contentId) {
    if (!confirm('確定要刪除此 H5P 內容？')) return;
    try {
      const result = await API.h5p.delete(contentId);
      if (result.success) { showToast('已刪除'); this.openH5pManager(); }
      else { showToast(result.error || '刪除失敗'); }
    } catch (error) { showToast('刪除失敗'); }
  },

  /**
   * LTI 管理
   */
  async openLtiManager() {
    const container = document.getElementById('ltiManagerContent');
    if (!container) return;
    showView('ltiManager');
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const result = await API.ltiTools.list();
      const tools = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.tools || [])) : [];
      this._ltiToolsData = tools;
      this.renderLtiPage(container, tools);
    } catch (error) {
      console.error('Open LTI manager error:', error);
      container.innerHTML = '<div class="error">載入 LTI 工具失敗</div>';
    }
  },

  renderLtiPage(container, tools) {
    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">LTI 外部工具</h2>
        <button onclick="MoodleUI.openRegisterLtiToolModal()" class="btn-primary">+ 註冊 LTI 工具</button>
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${tools.length === 0 ? '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">尚無 LTI 工具</p>' :
          tools.map(t => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewLtiToolDetail('${t.toolId || t.id}')">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
                <h3 style="margin:0;font-size:1.1rem;">${t.name || '未命名'}</h3>
                <div style="display:flex;gap:0.25rem;">
                  <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:#e0e7ff;color:#3730a3;">
                    LTI ${t.ltiVersion || t.version || '1.1'}
                  </span>
                  <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:${t.status === 'active' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                    ${t.status === 'active' ? '啟用' : '停用'}
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
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const [toolResult, gradesResult] = await Promise.all([
        API.ltiTools.get(toolId),
        API.ltiTools.getGrades(toolId).catch(() => ({ success: false }))
      ]);
      if (!toolResult.success) { container.innerHTML = '<div class="error">載入失敗</div>'; return; }
      const t = toolResult.data;
      const grades = gradesResult.success ? (Array.isArray(gradesResult.data) ? gradesResult.data : (gradesResult.data?.grades || [])) : [];

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openLtiManager()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.25rem;">${t.name || '未命名'}</h2>
            <p style="margin:0;color:var(--gray-400);">${t.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.launchLtiTool('${toolId}')" class="btn-primary btn-sm">啟動</button>
            <button onclick="MoodleUI.deleteLtiTool('${toolId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">刪除</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.75rem;">工具設定</h4>
            <div style="font-size:0.9rem;">
              <p><strong>啟動 URL：</strong><span style="word-break:break-all;">${t.toolUrl || t.launchUrl || t.url || '—'}</span></p>
              <p><strong>版本：</strong>LTI ${t.ltiVersion || t.version || '1.1'}</p>
              <p><strong>Consumer Key：</strong>${t.consumerKey || '—'}</p>
              <p><strong>狀態：</strong>${t.status === 'active' ? '啟用' : '停用'}</p>
              ${t.customParameters ? `<p><strong>自訂參數：</strong>${typeof t.customParameters === 'string' ? t.customParameters : JSON.stringify(t.customParameters)}</p>` : ''}
            </div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;">
            <h4 style="margin:0 0 0.75rem;">隱私設定</h4>
            <div style="font-size:0.9rem;">
              <p><strong>分享姓名：</strong>${t.shareName !== false ? '是' : '否'}</p>
              <p><strong>分享 Email：</strong>${t.shareEmail !== false ? '是' : '否'}</p>
              <p><strong>接受成績：</strong>${t.acceptGrades !== false ? '是' : '否'}</p>
            </div>
          </div>
        </div>
        ${grades.length > 0 ? `
          <h3>成績記錄（${grades.length}）</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
              <thead><tr style="background:var(--gray-100);">
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">使用者</th>
                <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">分數</th>
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">日期</th>
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
      container.innerHTML = '<div class="error">載入失敗</div>';
    }
  },

  openRegisterLtiToolModal() {
    const modal = document.createElement('div');
    modal.id = 'registerLtiToolModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>註冊 LTI 工具</h3>
          <button onclick="MoodleUI.closeModal('registerLtiToolModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>工具名稱 *</label>
            <input type="text" id="ltiToolName" placeholder="外部工具名稱">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="ltiToolDescription" rows="2" placeholder="工具描述"></textarea>
          </div>
          <div class="form-group">
            <label>啟動 URL *</label>
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
              <label>LTI 版本</label>
              <select id="ltiVersion">
                <option value="1.1">LTI 1.1</option>
                <option value="1.3">LTI 1.3</option>
              </select>
            </div>
            <div class="form-group">
              <label>狀態</label>
              <select id="ltiToolStatus"><option value="active">啟用</option><option value="inactive">停用</option></select>
            </div>
          </div>
          <div class="form-group">
            <label>自訂參數（每行一個，格式：key=value）</label>
            <textarea id="ltiCustomParams" rows="2" placeholder="key1=value1&#10;key2=value2"></textarea>
          </div>
          <h4>隱私設定</h4>
          <div style="display:flex;gap:1.5rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.9rem;">
              <input type="checkbox" id="ltiShareName" checked> 分享姓名
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.9rem;">
              <input type="checkbox" id="ltiShareEmail" checked> 分享 Email
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.9rem;">
              <input type="checkbox" id="ltiAcceptGrades" checked> 接受成績
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('registerLtiToolModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveLtiTool()" class="btn-primary">註冊工具</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('registerLtiToolModal'); };
  },

  async saveLtiTool() {
    const name = document.getElementById('ltiToolName')?.value?.trim();
    const launchUrl = document.getElementById('ltiToolUrl')?.value?.trim();
    if (!name || !launchUrl) { showToast('請填寫名稱和啟動 URL'); return; }
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
        showToast('LTI 工具註冊成功');
        this.closeModal('registerLtiToolModal');
        this.openLtiManager();
      } else { showToast(result.error || '註冊失敗'); }
    } catch (error) { showToast('註冊 LTI 工具失敗'); }
  },

  async launchLtiTool(toolId) {
    try {
      const result = await API.ltiTools.launch(toolId);
      if (result.success && result.data) {
        const launch = result.data;
        if (launch.launchUrl) {
          window.open(launch.launchUrl, '_blank');
        } else {
          showToast('啟動資訊不完整');
        }
      } else { showToast(result.error || '啟動失敗'); }
    } catch (error) { showToast('啟動 LTI 工具失敗'); }
  },

  async deleteLtiTool(toolId) {
    if (!confirm('確定要刪除此 LTI 工具？')) return;
    try {
      const result = await API.ltiTools.delete(toolId);
      if (result.success) { showToast('已刪除'); this.openLtiManager(); }
      else { showToast(result.error || '刪除失敗'); }
    } catch (error) { showToast('刪除失敗'); }
  },

  /**
   * SCORM 管理
   */
  currentScormFilter: 'all',

  async openScormManager() {
    const container = document.getElementById('scormManagerContent');
    if (!container) return;
    showView('scormManager');
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const result = await API.scorm.list();
      const packages = result.success ? (Array.isArray(result.data) ? result.data : (result.data?.packages || [])) : [];
      this._scormData = packages;
      this.renderScormPage(container, packages);
    } catch (error) {
      console.error('Open SCORM manager error:', error);
      container.innerHTML = '<div class="error">載入 SCORM 套件失敗</div>';
    }
  },

  renderScormPage(container, packages) {
    const filtered = this.currentScormFilter === 'all' ? packages :
      packages.filter(p => p.status === this.currentScormFilter);

    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">SCORM 套件管理</h2>
        <button onclick="MoodleUI.openCreateScormModal()" class="btn-primary">+ 建立 SCORM 套件</button>
      </div>
      <div class="filter-tabs" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;">
        ${['all','active','draft','archived'].map(f => `
          <button class="btn-sm ${this.currentScormFilter === f ? 'btn-primary' : 'btn-secondary'}"
                  onclick="MoodleUI.currentScormFilter='${f}';MoodleUI.renderScormPage(document.getElementById('scormManagerContent'),MoodleUI._scormData)">
            ${{all:'全部',active:'啟用',draft:'草稿',archived:'已封存'}[f]}
          </button>
        `).join('')}
      </div>
      <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${filtered.length === 0 ? '<p style="color:var(--gray-400);grid-column:1/-1;text-align:center;padding:3rem;">尚無 SCORM 套件</p>' :
          filtered.map(p => `
            <div class="card" style="padding:1.5rem;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;"
                 onclick="MoodleUI.viewScormDetail('${p.packageId || p.id}')">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
                <h3 style="margin:0;font-size:1.1rem;">${p.title || p.name || '未命名'}</h3>
                <div style="display:flex;gap:0.25rem;">
                  <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:#e0e7ff;color:#3730a3;">
                    SCORM ${p.version || p.scormVersion || '1.2'}
                  </span>
                  <span style="padding:2px 8px;border-radius:4px;font-size:0.7rem;background:${p.status === 'active' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                    ${p.status === 'active' ? '啟用' : p.status === 'archived' ? '已封存' : '草稿'}
                  </span>
                </div>
              </div>
              <p style="margin:0 0 0.5rem;color:var(--gray-400);font-size:0.85rem;">${p.description || ''}</p>
              <div style="display:flex;gap:1rem;font-size:0.8rem;color:var(--gray-400);">
                <span>課程：${p.courseName || p.courseId || '—'}</span>
                <span>完成率：${p.completionRate != null ? Math.round(p.completionRate) + '%' : '—'}</span>
              </div>
            </div>
          `).join('')}
      </div>`;
  },

  async viewScormDetail(packageId) {
    const container = document.getElementById('scormManagerContent');
    if (!container) return;
    container.innerHTML = '<div class="loading">載入中...</div>';
    try {
      const [pkgResult, reportResult, attemptsResult] = await Promise.all([
        API.scorm.get(packageId),
        API.scorm.getReport(packageId).catch(() => ({ success: false })),
        API.scorm.getAttempts(packageId).catch(() => ({ success: false }))
      ]);
      if (!pkgResult.success) { container.innerHTML = '<div class="error">載入失敗</div>'; return; }
      const p = pkgResult.data;
      const report = reportResult.success ? reportResult.data : {};
      const attempts = attemptsResult.success ? (Array.isArray(attemptsResult.data) ? attemptsResult.data : (attemptsResult.data?.attempts || [])) : [];

      container.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button onclick="MoodleUI.openScormManager()" class="back-btn" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.9rem;">← 返回列表</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem;">
          <div>
            <h2 style="margin:0 0 0.25rem;">${p.title || p.name || '未命名'}</h2>
            <p style="margin:0;color:var(--gray-400);">SCORM ${p.version || p.scormVersion || '1.2'} — ${p.description || ''}</p>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="MoodleUI.launchScormPackage('${packageId}')" class="btn-primary btn-sm">啟動</button>
            <button onclick="MoodleUI.deleteScormPackage('${packageId}')" class="btn-sm" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">刪除</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.totalAttempts || attempts.length}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">總嘗試</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.completionRate != null ? Math.round(report.completionRate) + '%' : '—'}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">完成率</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.passRate != null ? Math.round(report.passRate) + '%' : '—'}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">通過率</div>
          </div>
          <div style="padding:1rem;background:var(--gray-50);border-radius:8px;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;">${report.averageScore != null ? Math.round(report.averageScore) : '—'}</div>
            <div style="font-size:0.8rem;color:var(--gray-400);">平均分數</div>
          </div>
        </div>
        <div style="padding:1rem;background:var(--gray-50);border-radius:8px;margin-bottom:1.5rem;">
          <h4 style="margin:0 0 0.5rem;">套件設定</h4>
          <div style="display:flex;gap:2rem;font-size:0.9rem;">
            <span><strong>評分方式：</strong>${p.gradingMethod || p.gradeMethod || '最高分'}</span>
            <span><strong>最大嘗試：</strong>${p.maxAttempts || '無限'}</span>
          </div>
        </div>
        ${attempts.length > 0 ? `
          <h3>嘗試記錄</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
              <thead><tr style="background:var(--gray-100);">
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">嘗試</th>
                <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">狀態</th>
                <th style="padding:8px;text-align:center;border:1px solid var(--gray-200);">分數</th>
                <th style="padding:8px;text-align:left;border:1px solid var(--gray-200);">開始時間</th>
              </tr></thead>
              <tbody>
                ${attempts.map((a, idx) => `
                  <tr>
                    <td style="padding:8px;border:1px solid var(--gray-200);">#${idx + 1}</td>
                    <td style="padding:8px;text-align:center;border:1px solid var(--gray-200);">
                      <span style="padding:2px 8px;border-radius:4px;font-size:0.75rem;background:${a.completionStatus === 'completed' ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e'};">
                        ${a.completionStatus || a.status || '進行中'}
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
      container.innerHTML = '<div class="error">載入失敗</div>';
    }
  },

  async openCreateScormModal() {
    let courseOptions = '<option value="">不指定</option>';
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
          <h3>建立 SCORM 套件</h3>
          <button onclick="MoodleUI.closeModal('createScormModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>標題 *</label>
            <input type="text" id="scormTitle" placeholder="SCORM 套件標題">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="scormDescription" rows="2" placeholder="套件描述"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>所屬課程</label>
              <select id="scormCourse">${courseOptions}</select>
            </div>
            <div class="form-group">
              <label>SCORM 版本</label>
              <select id="scormVersion">
                <option value="1.2">SCORM 1.2</option>
                <option value="2004">SCORM 2004</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>評分方式</label>
              <select id="scormGrading">
                <option value="highest">最高分</option>
                <option value="average">平均</option>
                <option value="first">首次</option>
                <option value="last">最後一次</option>
              </select>
            </div>
            <div class="form-group">
              <label>最大嘗試次數</label>
              <input type="number" id="scormMaxAttempts" value="0" min="0" placeholder="0 = 無限">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createScormModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveScormPackage()" class="btn-primary">建立</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createScormModal'); };
  },

  async saveScormPackage() {
    const name = document.getElementById('scormTitle')?.value?.trim();
    const courseId = document.getElementById('scormCourse')?.value;
    if (!name) { showToast('請填寫標題'); return; }
    if (!courseId) { showToast('請選擇課程'); return; }
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
        showToast('SCORM 套件建立成功');
        this.closeModal('createScormModal');
        this.openScormManager();
      } else { showToast(result.error || '建立失敗'); }
    } catch (error) { showToast('建立 SCORM 套件失敗'); }
  },

  async launchScormPackage(packageId) {
    try {
      const result = await API.scorm.launch(packageId);
      if (result.success && result.data) {
        showToast('SCORM 套件已啟動');
        this.viewScormDetail(packageId);
      } else { showToast(result.error || '啟動失敗'); }
    } catch (error) { showToast('啟動失敗'); }
  },

  async deleteScormPackage(packageId) {
    if (!confirm('確定要刪除此 SCORM 套件？')) return;
    try {
      const result = await API.scorm.delete(packageId);
      if (result.success) { showToast('已刪除'); this.openScormManager(); }
      else { showToast(result.error || '刪除失敗'); }
    } catch (error) { showToast('刪除失敗'); }
  },

  /**
   * 建立課程 Modal
   */
  async showCreateCourseModal() {
    let categoryOptions = '<option value="">-- 選擇分類 --</option>';
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
          <h3>建立課程</h3>
          <button onclick="MoodleUI.closeModal('createCourseModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>課程名稱 *</label>
            <input type="text" id="newCourseTitle" placeholder="輸入課程名稱">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>簡稱 *</label>
              <input type="text" id="newCourseShortName" placeholder="例如：MATH101">
            </div>
            <div class="form-group">
              <label>分類</label>
              <select id="newCourseCategory">${categoryOptions}</select>
            </div>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="newCourseDescription" rows="3" placeholder="課程描述"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>課程格式</label>
              <select id="newCourseFormat">
                <option value="topics">主題格式</option>
                <option value="weekly">每週格式</option>
                <option value="social">社交格式</option>
              </select>
            </div>
            <div class="form-group">
              <label>可見性</label>
              <select id="newCourseVisibility">
                <option value="visible">可見</option>
                <option value="hidden">隱藏</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>開始日期</label>
              <input type="date" id="newCourseStartDate">
            </div>
            <div class="form-group">
              <label>結束日期</label>
              <input type="date" id="newCourseEndDate">
            </div>
          </div>
          <div class="form-group">
            <label>報名密鑰（選填）</label>
            <input type="text" id="newCourseEnrollKey" placeholder="設定後學生需輸入密鑰才能報名">
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createCourseModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveNewCourse()" class="btn-primary">建立課程</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createCourseModal'); };
  },

  async saveNewCourse() {
    const title = document.getElementById('newCourseTitle')?.value?.trim();
    const shortName = document.getElementById('newCourseShortName')?.value?.trim();
    if (!title || !shortName) { showToast('請填寫課程名稱和簡稱'); return; }
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
        showToast('課程建立成功');
        this.closeModal('createCourseModal');
        if (typeof this.loadCourses === 'function') this.loadCourses();
      } else {
        showToast(result.error || '建立課程失敗');
      }
    } catch (error) {
      console.error('Create course error:', error);
      showToast('建立課程失敗');
    }
  },

  /**
   * 建立作業 Modal
   */
  async showCreateAssignmentModal() {
    let courseOptions = '<option value="">-- 選擇課程 --</option>';
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
    modal.id = 'createAssignmentModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>建立作業</h3>
          <button onclick="MoodleUI.closeModal('createAssignmentModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>作業標題 *</label>
            <input type="text" id="newAssignmentTitle" placeholder="輸入作業標題">
          </div>
          <div class="form-group">
            <label>所屬課程 *</label>
            <select id="newAssignmentCourse">${courseOptions}</select>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="newAssignmentDescription" rows="3" placeholder="作業說明與要求"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>截止日期</label>
              <input type="datetime-local" id="newAssignmentDueDate">
            </div>
            <div class="form-group">
              <label>最高分數</label>
              <input type="number" id="newAssignmentMaxScore" value="100" min="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>提交類型</label>
              <select id="newAssignmentSubmitType">
                <option value="text">線上文字</option>
                <option value="file">檔案上傳</option>
                <option value="both">文字與檔案</option>
              </select>
            </div>
            <div class="form-group">
              <label>允許遲交</label>
              <select id="newAssignmentLateSubmit">
                <option value="true">允許</option>
                <option value="false">不允許</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createAssignmentModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveNewAssignment()" class="btn-primary">建立作業</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createAssignmentModal'); };
  },

  async saveNewAssignment() {
    const title = document.getElementById('newAssignmentTitle')?.value?.trim();
    const courseId = document.getElementById('newAssignmentCourse')?.value;
    if (!title || !courseId) { showToast('請填寫標題並選擇課程'); return; }
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
        showToast('作業建立成功');
        this.closeModal('createAssignmentModal');
        if (typeof this.loadAssignments === 'function') this.loadAssignments();
      } else {
        showToast(result.error || '建立作業失敗');
      }
    } catch (error) {
      console.error('Create assignment error:', error);
      showToast('建立作業失敗');
    }
  },

  /**
   * 建立測驗 Modal
   */
  async showCreateQuizModal() {
    let courseOptions = '<option value="">-- 選擇課程 --</option>';
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
    modal.id = 'createQuizModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>建立測驗</h3>
          <button onclick="MoodleUI.closeModal('createQuizModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>測驗標題 *</label>
            <input type="text" id="newQuizTitle" placeholder="輸入測驗標題">
          </div>
          <div class="form-group">
            <label>所屬課程 *</label>
            <select id="newQuizCourse">${courseOptions}</select>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="newQuizDescription" rows="3" placeholder="測驗說明"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>時間限制（分鐘）</label>
              <input type="number" id="newQuizTimeLimit" value="60" min="0">
            </div>
            <div class="form-group">
              <label>最大嘗試次數</label>
              <input type="number" id="newQuizMaxAttempts" value="1" min="1">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>開放日期</label>
              <input type="datetime-local" id="newQuizOpenDate">
            </div>
            <div class="form-group">
              <label>關閉日期</label>
              <input type="datetime-local" id="newQuizCloseDate">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createQuizModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveNewQuiz()" class="btn-primary">建立測驗</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createQuizModal'); };
  },

  async saveNewQuiz() {
    const title = document.getElementById('newQuizTitle')?.value?.trim();
    const courseId = document.getElementById('newQuizCourse')?.value;
    if (!title || !courseId) { showToast('請填寫標題並選擇課程'); return; }
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
        showToast('測驗建立成功');
        this.closeModal('createQuizModal');
        if (typeof this.loadQuizzes === 'function') this.loadQuizzes();
      } else {
        showToast(result.error || '建立測驗失敗');
      }
    } catch (error) {
      console.error('Create quiz error:', error);
      showToast('建立測驗失敗');
    }
  },

  /**
   * 建立公告 Modal
   */
  async showCreateAnnouncementModal() {
    let courseOptions = '<option value="">全站公告（不限課程）</option>';
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
          <h3>建立公告</h3>
          <button onclick="MoodleUI.closeModal('createAnnouncementModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>公告標題 *</label>
            <input type="text" id="newAnnouncementTitle" placeholder="輸入公告標題">
          </div>
          <div class="form-group">
            <label>公告內容 *</label>
            <textarea id="newAnnouncementContent" rows="5" placeholder="輸入公告內容"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>優先級</label>
              <select id="newAnnouncementPriority">
                <option value="low">低</option>
                <option value="normal" selected>一般</option>
                <option value="high">高</option>
                <option value="urgent">緊急</option>
              </select>
            </div>
            <div class="form-group">
              <label>課程（選填）</label>
              <select id="newAnnouncementCourse">${courseOptions}</select>
            </div>
          </div>
          <div class="form-group">
            <label>到期日（選填）</label>
            <input type="date" id="newAnnouncementExpiry">
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createAnnouncementModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveNewAnnouncement()" class="btn-primary">發佈公告</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createAnnouncementModal'); };
  },

  async saveNewAnnouncement() {
    const title = document.getElementById('newAnnouncementTitle')?.value?.trim();
    const content = document.getElementById('newAnnouncementContent')?.value?.trim();
    if (!title || !content) { showToast('請填寫標題和內容'); return; }
    try {
      const result = await API.admin.createAnnouncement({
        title,
        content,
        priority: document.getElementById('newAnnouncementPriority')?.value || 'normal',
        courseId: document.getElementById('newAnnouncementCourse')?.value || undefined,
        expiresAt: document.getElementById('newAnnouncementExpiry')?.value || undefined
      });
      if (result.success) {
        showToast('公告發佈成功');
        this.closeModal('createAnnouncementModal');
      } else {
        showToast(result.error || '發佈公告失敗');
      }
    } catch (error) {
      console.error('Create announcement error:', error);
      showToast('發佈公告失敗');
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
      if (!result.success) { showToast('無法載入課程設定'); return; }
      const c = result.data;
      this.createModal('courseSettingsModal', '課程設定', `
        <form onsubmit="event.preventDefault(); MoodleUI.saveCourseSettings('${courseId}')">
          <div class="form-group">
            <label>課程名稱</label>
            <input type="text" id="cs_title" value="${c.title || ''}" required>
          </div>
          <div class="form-group">
            <label>簡稱</label>
            <input type="text" id="cs_shortName" value="${c.shortName || ''}">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="cs_description" rows="3">${c.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>分類</label>
            <input type="text" id="cs_category" value="${c.category || ''}">
          </div>
          <div class="form-group">
            <label>課程格式</label>
            <select id="cs_format">
              <option value="topics" ${c.format === 'topics' ? 'selected' : ''}>主題式</option>
              <option value="weeks" ${c.format === 'weeks' ? 'selected' : ''}>週次式</option>
              <option value="social" ${c.format === 'social' ? 'selected' : ''}>社群式</option>
              <option value="singleactivity" ${c.format === 'singleactivity' ? 'selected' : ''}>單活動</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>開始日期</label>
              <input type="date" id="cs_startDate" value="${c.startDate ? c.startDate.split('T')[0] : ''}">
            </div>
            <div class="form-group">
              <label>結束日期</label>
              <input type="date" id="cs_endDate" value="${c.endDate ? c.endDate.split('T')[0] : ''}">
            </div>
          </div>
          <div class="form-group">
            <label>報名密碼</label>
            <input type="text" id="cs_enrollmentKey" value="${c.enrollmentKey || ''}">
          </div>
          <div class="form-group">
            <label>人數上限</label>
            <input type="number" id="cs_maxEnrollment" value="${c.maxEnrollment || ''}">
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="cs_visible" ${c.visible !== false ? 'checked' : ''}> 對學生可見
            </label>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('courseSettingsModal')" class="btn-secondary">取消</button>
            <button type="submit" class="btn-primary">儲存設定</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast('載入課程設定失敗');
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
        showToast('課程設定已儲存');
        this.closeModal('courseSettingsModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || '儲存失敗');
      }
    } catch (error) {
      showToast('儲存課程設定失敗');
    }
  },

  // ======== Edit Section ========
  async editSection(courseId, sectionId) {
    try {
      const courseResult = await API.courses.get(courseId);
      const sections = courseResult.data?.sections || [];
      const section = sections.find(s => s.sectionId === sectionId);
      if (!section) { showToast('找不到此章節'); return; }

      this.createModal('editSectionModal', '編輯章節', `
        <form onsubmit="event.preventDefault(); MoodleUI.saveSection('${courseId}', '${sectionId}')">
          <div class="form-group">
            <label>章節名稱</label>
            <input type="text" id="es_name" value="${section.name || ''}" required>
          </div>
          <div class="form-group">
            <label>摘要</label>
            <textarea id="es_summary" rows="3">${section.summary || ''}</textarea>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="es_visible" ${section.visible !== false ? 'checked' : ''}> 對學生可見
            </label>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editSectionModal')" class="btn-secondary">取消</button>
            <button type="submit" class="btn-primary">儲存</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast('載入章節資料失敗');
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
        showToast('章節已更新');
        this.closeModal('editSectionModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      showToast('更新章節失敗');
    }
  },

  // ======== Edit Activity ========
  async editActivity(courseId, sectionId, activityId) {
    try {
      const result = await API.courseActivities.get(courseId, activityId);
      if (!result.success) { showToast('無法載入活動'); return; }
      const a = result.data;

      this.createModal('editActivityModal', '編輯活動', `
        <form onsubmit="event.preventDefault(); MoodleUI.saveActivity('${courseId}', '${activityId}')">
          <div class="form-group">
            <label>活動名稱</label>
            <input type="text" id="ea_name" value="${a.name || ''}" required>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="ea_description" rows="3">${a.description || ''}</textarea>
          </div>
          ${a.type === 'assignment' || a.type === 'quiz' ? `
            <div class="form-group">
              <label>截止日期</label>
              <input type="datetime-local" id="ea_dueDate" value="${a.dueDate ? a.dueDate.slice(0, 16) : ''}">
            </div>
          ` : ''}
          ${a.type === 'url' ? `
            <div class="form-group">
              <label>網址</label>
              <input type="url" id="ea_url" value="${a.url || ''}">
            </div>
          ` : ''}
          ${a.type === 'page' ? `
            <div class="form-group">
              <label>頁面內容</label>
              <textarea id="ea_content" rows="6">${a.content || ''}</textarea>
            </div>
          ` : ''}
          <div class="form-group">
            <label>
              <input type="checkbox" id="ea_visible" ${a.visible !== false ? 'checked' : ''}> 對學生可見
            </label>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editActivityModal')" class="btn-secondary">取消</button>
            <button type="submit" class="btn-primary">儲存</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast('載入活動資料失敗');
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
        showToast('活動已更新');
        this.closeModal('editActivityModal');
        this.openCourse(courseId);
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      showToast('更新活動失敗');
    }
  },

  // ======== Delete Activity ========
  async deleteActivity(courseId, sectionId, activityId) {
    if (!confirm('確定要刪除此活動嗎？此操作無法復原。')) return;
    try {
      const result = await API.courseActivities.delete(courseId, activityId);
      if (result.success) {
        showToast('活動已刪除');
        this.openCourse(courseId);
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      showToast('刪除活動失敗');
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
    showToast(`已依${column === 'name' ? '姓名' : '總成績'}${this._gradebookSortDir === 'asc' ? '升冪' : '降冪'}排序`);
  },

  // ======== Edit Grade Category ========
  async editGradeCategory(courseId, categoryId) {
    try {
      const result = await API.gradebookEnhanced.getCategories(courseId);
      const categories = result.success ? result.data : [];
      const cat = categories.find(c => c.categoryId === categoryId);
      if (!cat) { showToast('找不到此類別'); return; }

      this.createModal('editGradeCatModal', '編輯成績類別', `
        <form onsubmit="event.preventDefault(); MoodleUI.saveGradeCategory('${courseId}', '${categoryId}')">
          <div class="form-group">
            <label>類別名稱</label>
            <input type="text" id="egc_name" value="${cat.name || ''}" required>
          </div>
          <div class="form-group">
            <label>權重 (%)</label>
            <input type="number" id="egc_weight" value="${cat.weight || 0}" min="0" max="100">
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editGradeCatModal')" class="btn-secondary">取消</button>
            <button type="submit" class="btn-primary">儲存</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast('載入類別失敗');
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
        showToast('類別已更新');
        this.closeModal('editGradeCatModal');
        this.openGradeCategoryModal(courseId);
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      showToast('更新類別失敗');
    }
  },

  // ======== Edit Question ========
  async editQuestion(questionId) {
    try {
      const result = await API.questionBank.get(questionId);
      if (!result.success) { showToast('無法載入題目'); return; }
      const q = result.data;

      this.createModal('editQuestionModal', '編輯題目', `
        <form onsubmit="event.preventDefault(); MoodleUI.saveEditedQuestion('${questionId}')">
          <div class="form-group">
            <label>題目類型</label>
            <input type="text" value="${{multiple_choice:'選擇題', true_false:'是非題', short_answer:'簡答題', fill_blank:'填空題', essay:'申論題'}[q.type] || q.type}" disabled>
          </div>
          <div class="form-group">
            <label>題目內容</label>
            <textarea id="eq_text" rows="3" required>${q.questionText || ''}</textarea>
          </div>
          ${q.type === 'multiple_choice' ? `
            <div class="form-group">
              <label>選項（每行一個）</label>
              <textarea id="eq_options" rows="4">${(q.options || []).join('\\n')}</textarea>
            </div>
            <div class="form-group">
              <label>正確答案索引（從 0 開始）</label>
              <input type="number" id="eq_correct" value="${q.correctAnswer ?? ''}" min="0">
            </div>
          ` : ''}
          ${q.type === 'true_false' ? `
            <div class="form-group">
              <label>正確答案</label>
              <select id="eq_correct_tf">
                <option value="true" ${q.correctAnswer === true ? 'selected' : ''}>是 (True)</option>
                <option value="false" ${q.correctAnswer === false ? 'selected' : ''}>否 (False)</option>
              </select>
            </div>
          ` : ''}
          <div class="form-row">
            <div class="form-group">
              <label>分數</label>
              <input type="number" id="eq_points" value="${q.points || 1}" min="1">
            </div>
            <div class="form-group">
              <label>難度</label>
              <select id="eq_difficulty">
                <option value="easy" ${q.difficulty === 'easy' ? 'selected' : ''}>簡單</option>
                <option value="medium" ${q.difficulty === 'medium' ? 'selected' : ''}>中等</option>
                <option value="hard" ${q.difficulty === 'hard' ? 'selected' : ''}>困難</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>標籤（逗號分隔）</label>
            <input type="text" id="eq_tags" value="${(q.tags || []).join(', ')}">
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editQuestionModal')" class="btn-secondary">取消</button>
            <button type="submit" class="btn-primary">儲存</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast('載入題目失敗');
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
        showToast('題目已更新');
        this.closeModal('editQuestionModal');
        this.openQuestionBank();
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      showToast('更新題目失敗');
    }
  },

  // ======== Preview Question ========
  async previewQuestion(questionId) {
    try {
      const result = await API.questionBank.get(questionId);
      if (!result.success) { showToast('無法載入題目'); return; }
      const q = result.data;
      const typeNames = {multiple_choice:'選擇題', true_false:'是非題', short_answer:'簡答題', fill_blank:'填空題', essay:'申論題'};

      let optionsHtml = '';
      if (q.type === 'multiple_choice' && q.options) {
        optionsHtml = '<ul class="preview-options">' + q.options.map((opt, i) =>
          `<li class="${i === q.correctAnswer ? 'correct-answer' : ''}">${String.fromCharCode(65+i)}. ${opt} ${i === q.correctAnswer ? '✓' : ''}</li>`
        ).join('') + '</ul>';
      } else if (q.type === 'true_false') {
        optionsHtml = `<p>正確答案：${q.correctAnswer ? '是 (True)' : '否 (False)'}</p>`;
      }

      this.createModal('previewQuestionModal', '題目預覽', `
        <div class="question-preview">
          <div class="preview-meta">
            <span class="badge">${typeNames[q.type] || q.type}</span>
            <span class="badge">${q.points || 1} 分</span>
            <span class="badge difficulty-${q.difficulty || 'medium'}">${{easy:'簡單',medium:'中等',hard:'困難'}[q.difficulty] || '中等'}</span>
          </div>
          <div class="preview-text"><strong>題目：</strong>${q.questionText}</div>
          ${optionsHtml}
          ${q.tags?.length ? '<div class="preview-tags">' + q.tags.map(t => '<span class="tag">' + t + '</span>').join('') + '</div>' : ''}
        </div>
      `);
    } catch (error) {
      showToast('載入題目預覽失敗');
    }
  },

  // ======== Import Questions ========
  openImportQuestionsModal() {
    this.createModal('importQuestionsModal', '匯入題目', `
      <form onsubmit="event.preventDefault(); MoodleUI.importQuestions()">
        <div class="form-group">
          <label>匯入格式</label>
          <select id="iq_format">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </div>
        <div class="form-group">
          <label>題目資料</label>
          <textarea id="iq_data" rows="10" placeholder='JSON 範例：[{"questionText":"...", "type":"multiple_choice", "options":["A","B","C","D"], "correctAnswer":0}]'></textarea>
        </div>
        <div class="form-group">
          <label>目標類別（選填）</label>
          <input type="text" id="iq_category" placeholder="分類名稱">
        </div>
        <div class="form-actions">
          <button type="button" onclick="MoodleUI.closeModal('importQuestionsModal')" class="btn-secondary">取消</button>
          <button type="submit" class="btn-primary">匯入</button>
        </div>
      </form>
    `);
  },

  async importQuestions() {
    const format = document.getElementById('iq_format').value;
    const rawData = document.getElementById('iq_data').value.trim();
    const category = document.getElementById('iq_category').value.trim();
    if (!rawData) { showToast('請輸入題目資料'); return; }

    try {
      let questions;
      if (format === 'json') {
        questions = JSON.parse(rawData);
      } else {
        questions = rawData;
      }
      const result = await API.questionBank.import({ format, questions, category: category || undefined });
      if (result.success) {
        showToast(`成功匯入 ${result.data?.imported || ''} 題`);
        this.closeModal('importQuestionsModal');
        this.openQuestionBank();
      } else {
        showToast(result.message || '匯入失敗');
      }
    } catch (error) {
      showToast('匯入失敗：' + (error.message || '資料格式錯誤'));
    }
  },

  // ======== Manage Question Categories ========
  async openCategoryManageModal() {
    try {
      const result = await API.questionBank.getCategories();
      const categories = result.success ? (result.data || []) : [];

      this.createModal('categoryManageModal', '管理題目類別', `
        <div class="category-list">
          ${categories.map(cat => `
            <div class="category-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee">
              <span>${cat.name} (${cat.questionCount || 0} 題)</span>
              <button onclick="MoodleUI.deleteQuestionCategory('${cat.categoryId}')" class="btn-sm btn-danger">刪除</button>
            </div>
          `).join('')}
          ${categories.length === 0 ? '<p class="empty-list">尚無類別</p>' : ''}
        </div>
        <hr>
        <form onsubmit="event.preventDefault(); MoodleUI.createQuestionCategory()" style="margin-top:12px">
          <div class="form-group">
            <label>新增類別</label>
            <div style="display:flex;gap:8px">
              <input type="text" id="newQCatName" placeholder="類別名稱" required style="flex:1">
              <button type="submit" class="btn-primary">新增</button>
            </div>
          </div>
        </form>
      `);
    } catch (error) {
      showToast('載入類別失敗');
    }
  },

  async createQuestionCategory() {
    const name = document.getElementById('newQCatName').value.trim();
    if (!name) return;
    try {
      const result = await API.questionBank.createCategory({ name });
      if (result.success) {
        showToast('類別已建立');
        this.openCategoryManageModal();
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      showToast('建立類別失敗');
    }
  },

  async deleteQuestionCategory(categoryId) {
    if (!confirm('確定要刪除此類別嗎？')) return;
    try {
      const result = await API.questionBank.deleteCategory(categoryId);
      if (result.success) {
        showToast('類別已刪除');
        this.openCategoryManageModal();
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      showToast('刪除類別失敗');
    }
  },

  // ======== Edit Role ========
  async editRole(roleId) {
    try {
      const [roleResult, capResult] = await Promise.all([
        API.roles.get(roleId),
        API.roles.getCapabilities()
      ]);
      if (!roleResult.success) { showToast('無法載入角色'); return; }
      const role = roleResult.data;
      const allCapabilities = capResult.success ? capResult.data : [];

      this.createModal('editRoleModal', '編輯角色', `
        <form onsubmit="event.preventDefault(); MoodleUI.saveRole('${roleId}')">
          <div class="form-group">
            <label>角色名稱</label>
            <input type="text" id="er_name" value="${role.name || ''}" required>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="er_description" rows="2">${role.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>權限能力</label>
            <div class="capabilities-checkboxes" style="max-height:300px;overflow-y:auto">
              ${allCapabilities.map(cap => `
                <label style="display:block;padding:4px 0">
                  <input type="checkbox" name="capabilities" value="${cap}"
                    ${(role.capabilities || []).includes(cap) ? 'checked' : ''}> ${cap}
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-actions">
            <button type="button" onclick="MoodleUI.closeModal('editRoleModal')" class="btn-secondary">取消</button>
            <button type="submit" class="btn-primary">儲存</button>
          </div>
        </form>
      `);
    } catch (error) {
      showToast('載入角色失敗');
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
        showToast('角色已更新');
        this.closeModal('editRoleModal');
        this.openRolesManagement();
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      showToast('更新角色失敗');
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
