/**
 * BeyondBridge Moodle-style UI Module
 * 前端頁面邏輯 - Moodle 風格功能
 */

const MoodleUI = {
  // 當前選中的課程
  currentCourse: null,
  currentCourseId: null,

  // ==================== 麵包屑導航 ====================

  // 導航歷史堆疊
  breadcrumbStack: [],

  // 視圖層級定義 (定義父子關係)
  viewHierarchy: {
    // 主要頁面 (頂層)
    'dashboard': { parent: null, label: '首頁' },
    'teacherDashboard': { parent: null, label: '教學儀表板' },
    'studentDashboard': { parent: null, label: '學習儀表板' },

    // 課程相關
    'moodleCourses': { parent: 'dashboard', label: '我的課程' },
    'courseDetail': { parent: 'moodleCourses', label: '課程內容', dynamic: true },

    // 作業相關
    'moodleAssignments': { parent: 'dashboard', label: '作業管理' },
    'assignmentDetail': { parent: 'moodleAssignments', label: '作業詳情', dynamic: true },

    // 測驗相關
    'moodleQuizzes': { parent: 'dashboard', label: '測驗中心' },
    'quizAttempt': { parent: 'moodleQuizzes', label: '測驗作答', dynamic: true },
    'questionBank': { parent: 'dashboard', label: '題庫管理' },

    // 論壇相關
    'moodleForums': { parent: 'dashboard', label: '討論區' },
    'forumDetail': { parent: 'moodleForums', label: '討論詳情', dynamic: true },

    // 成績相關
    'moodleGradebook': { parent: 'dashboard', label: '成績簿' },
    'gradebookManagement': { parent: 'moodleGradebook', label: '成績管理' },

    // 行事曆與通知
    'moodleCalendar': { parent: 'dashboard', label: '行事曆' },
    'moodleNotifications': { parent: 'dashboard', label: '通知中心' },

    // 檔案管理
    'moodleFiles': { parent: 'dashboard', label: '檔案管理' },

    // 學習路徑與徽章
    'learningPaths': { parent: 'dashboard', label: '學習路徑' },
    'badges': { parent: 'dashboard', label: '成就徽章' },

    // 系統管理
    'rolesManagement': { parent: 'dashboard', label: '角色權限' },
    'courseCategories': { parent: 'dashboard', label: '課程類別' },
    'auditLogs': { parent: 'dashboard', label: '審計日誌' },
    'rubrics': { parent: 'dashboard', label: '評分標準' },
    'groupsManager': { parent: 'dashboard', label: '群組管理' },
    'courseCompletionSettings': { parent: 'dashboard', label: '課程完成設定' },

    // 外部工具
    'scormManager': { parent: 'dashboard', label: 'SCORM 管理' },
    'ltiManager': { parent: 'dashboard', label: 'LTI 外部工具' },
    'h5pManager': { parent: 'dashboard', label: 'H5P 內容' },

    // 其他
    'settings': { parent: 'dashboard', label: '設定' },
    'discussions': { parent: 'dashboard', label: '討論' },
    'consultations': { parent: 'dashboard', label: '即時客服' },
    'classes': { parent: 'dashboard', label: '班級管理' },
    'studentClasses': { parent: 'dashboard', label: '我的班級' },
    'classDetail': { parent: 'classes', label: '班級詳情', dynamic: true }
  },

  // 動態標籤緩存 (用於存儲課程名、作業名等)
  dynamicLabels: {},

  /**
   * 設置動態標籤 (用於課程名、作業名等)
   * @param {string} viewName - 視圖名稱
   * @param {string} label - 動態標籤
   */
  setDynamicLabel(viewName, label) {
    this.dynamicLabels[viewName] = label;
    this.renderBreadcrumb();
  },

  /**
   * 更新麵包屑導航
   * @param {string} viewName - 當前視圖名稱
   * @param {Object} options - 額外選項 (如動態標籤)
   */
  updateBreadcrumb(viewName, options = {}) {
    // 如果提供了動態標籤，設置它
    if (options.label) {
      this.dynamicLabels[viewName] = options.label;
    }

    // 建立麵包屑路徑
    const path = this.buildBreadcrumbPath(viewName);
    this.breadcrumbStack = path;
    this.renderBreadcrumb();
  },

  /**
   * 建立麵包屑路徑
   * @param {string} viewName - 視圖名稱
   * @returns {Array} 路徑數組
   */
  buildBreadcrumbPath(viewName) {
    const path = [];
    let current = viewName;

    while (current) {
      const viewInfo = this.viewHierarchy[current];
      if (!viewInfo) break;

      const label = viewInfo.dynamic && this.dynamicLabels[current]
        ? this.dynamicLabels[current]
        : viewInfo.label;

      path.unshift({
        view: current,
        label: label
      });

      current = viewInfo.parent;
    }

    return path;
  },

  /**
   * 渲染麵包屑導航
   */
  renderBreadcrumb() {
    const container = document.getElementById('breadcrumbNav');
    if (!container) return;

    const path = this.breadcrumbStack;

    // 如果只有一個項目或沒有項目，隱藏麵包屑
    if (path.length <= 1) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    // 分隔符 SVG
    const separatorSvg = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>`;

    // 首頁圖標 SVG
    const homeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;

    let html = '';

    path.forEach((item, index) => {
      const isFirst = index === 0;
      const isLast = index === path.length - 1;
      const isMiddle = !isFirst && !isLast;

      if (index > 0) {
        html += `<span class="breadcrumb-separator">${separatorSvg}</span>`;
      }

      if (isLast) {
        // 當前頁 (不可點擊)
        html += `<span class="breadcrumb-current">${item.label}</span>`;
      } else if (isFirst && item.view === 'dashboard') {
        // 首頁連結
        html += `
          <a href="#" class="breadcrumb-home" onclick="showView('dashboard'); MoodleUI.updateBreadcrumb('dashboard'); return false;">
            ${homeSvg}
          </a>
        `;
      } else {
        // 中間層級連結
        const middleClass = isMiddle ? 'breadcrumb-middle' : '';
        html += `
          <a href="#" class="${middleClass}" onclick="showView('${item.view}'); MoodleUI.updateBreadcrumb('${item.view}'); return false;">
            ${item.label}
          </a>
        `;
      }
    });

    // 添加省略號 (用於手機模式)
    if (path.length > 2) {
      container.classList.add('breadcrumb-collapsed');
    } else {
      container.classList.remove('breadcrumb-collapsed');
    }

    container.innerHTML = html;
  },

  /**
   * 清除麵包屑導航
   */
  clearBreadcrumb() {
    this.breadcrumbStack = [];
    this.dynamicLabels = {};
    const container = document.getElementById('breadcrumbNav');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
  },

  // ==================== 工具函數 ====================

  // 活躍的 Quill 編輯器實例
  activeEditors: new Map(),

  /**
   * 初始化 Quill 富文本編輯器
   * @param {string} containerId - 容器元素 ID
   * @param {Object} options - 配置選項
   * @returns {Quill|null} Quill 實例或 null
   */
  initEditor(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Editor container not found: ${containerId}`);
      return null;
    }

    // 如果已有編輯器實例，先銷毀
    if (this.activeEditors.has(containerId)) {
      this.destroyEditor(containerId);
    }

    // 默認配置
    const defaultConfig = {
      modules: {
        toolbar: [
          [{ 'header': [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'color': [] }, { 'background': [] }],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          [{ 'indent': '-1' }, { 'indent': '+1' }],
          ['blockquote', 'code-block'],
          ['link', 'image'],
          ['clean']
        ]
      },
      theme: 'snow',
      placeholder: options.placeholder || '請輸入內容...'
    };

    // 簡易版配置（用於評論、論壇回覆等）
    const simpleConfig = {
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['link'],
          ['clean']
        ]
      },
      theme: 'snow',
      placeholder: options.placeholder || '請輸入內容...'
    };

    // 根據 options.config 選擇配置
    const useSimple = options.simple || options.config === 'simple';
    const config = useSimple ? simpleConfig : { ...defaultConfig, ...options };

    try {
      const quill = new Quill(container, config);
      this.activeEditors.set(containerId, quill);

      // 設置初始內容
      if (options.content) {
        quill.root.innerHTML = options.content;
      }

      return quill;
    } catch (error) {
      console.error('Failed to initialize Quill editor:', error);
      return null;
    }
  },

  /**
   * 獲取編輯器內容
   * @param {string} containerId - 容器元素 ID
   * @returns {Object} { html, text, delta }
   */
  getEditorContent(containerId) {
    const quill = this.activeEditors.get(containerId);
    if (!quill) {
      return { html: '', text: '', delta: null };
    }
    return {
      html: quill.root.innerHTML,
      text: quill.getText().trim(),
      delta: quill.getContents()
    };
  },

  /**
   * 設置編輯器內容
   * @param {string} containerId - 容器元素 ID
   * @param {string} content - HTML 內容
   */
  setEditorContent(containerId, content) {
    const quill = this.activeEditors.get(containerId);
    if (quill) {
      quill.root.innerHTML = content || '';
    }
  },

  /**
   * 清空編輯器內容
   * @param {string} containerId - 容器元素 ID
   */
  clearEditor(containerId) {
    const quill = this.activeEditors.get(containerId);
    if (quill) {
      quill.setText('');
    }
  },

  /**
   * 銷毀編輯器實例
   * @param {string} containerId - 容器元素 ID
   */
  destroyEditor(containerId) {
    const quill = this.activeEditors.get(containerId);
    if (quill) {
      // Quill 沒有官方的 destroy 方法，需要手動清理
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = '';
        container.className = container.className.replace(/ql-\S+/g, '').trim();
      }
      this.activeEditors.delete(containerId);
    }
  },

  /**
   * 創建帶編輯器的表單區塊 HTML
   * @param {string} id - 編輯器 ID
   * @param {string} label - 標籤文字
   * @param {Object} options - 選項
   * @returns {string} HTML 字串
   */
  createEditorField(id, label, options = {}) {
    const required = options.required ? '<span style="color: var(--terracotta);">*</span>' : '';
    const height = options.height || '200px';
    return `
      <div class="form-group" style="margin-bottom: 1.5rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-primary);">
          ${label} ${required}
        </label>
        <div id="${id}" class="quill-editor-container" style="min-height: ${height}; background: white; border-radius: 8px;"></div>
      </div>
    `;
  },

  /**
   * HTML 轉義 - 防止 XSS 和正確顯示 HTML 標籤文字
   * @param {string} text - 要轉義的文字
   * @returns {string} 轉義後的文字
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * 安全格式化日期
   * @param {string|Date|number} dateValue - 日期值
   * @param {string} format - 格式 ('date' | 'datetime' | 'time')
   * @param {string} fallback - 無效日期時的回傳值
   * @returns {string} 格式化後的日期字串
   */
  formatDate(dateValue, format = 'date', fallback = '-') {
    if (!dateValue) return fallback;

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return fallback;

    const options = { timeZone: 'Asia/Taipei' };

    switch (format) {
      case 'datetime':
        return date.toLocaleString('zh-TW', options);
      case 'time':
        return date.toLocaleTimeString('zh-TW', { ...options, hour: '2-digit', minute: '2-digit' });
      case 'month':
        return date.toLocaleDateString('zh-TW', { ...options, month: 'short' });
      case 'date':
      default:
        return date.toLocaleDateString('zh-TW', options);
    }
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

      // 設置麵包屑動態標籤 (課程名稱)
      const courseName = result.data.title || result.data.name || '課程';
      this.setDynamicLabel('courseDetail', courseName);

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
    const sections = course.sections || [];

    // 計算進度
    let totalActivities = 0;
    let completedActivities = 0;
    sections.forEach(section => {
      const activities = section.activities || [];
      totalActivities += activities.length;
      completedActivities += activities.filter(a => a.completed).length;
    });
    const progressPercent = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;

    container.innerHTML = `
      <div class="course-page-layout">
        <!-- 課程頭部 - 橫跨三欄 -->
        <div class="course-page-header">
          <button onclick="showView('moodleCourses')" class="back-btn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            返回課程列表
          </button>
          <h1>${course.title || course.name || '課程'}</h1>
          <p style="opacity: 0.9; margin: 0;">${course.description || course.summary || ''}</p>
          <div class="course-meta">
            <span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${course.instructorName || course.teacherName || '教師'}
            </span>
            <span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              ${course.enrollmentCount || course.enrolledCount || 0} 位學生
            </span>
            <span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${sections.length} 個章節
            </span>
          </div>
          <div class="course-actions">
            ${!course.isEnrolled && !isTeacher ? `
              <button onclick="MoodleUI.enrollCourse('${course.courseId}')" class="btn-primary" style="background: white; color: var(--olive);">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                報名課程
              </button>
            ` : ''}
            ${isTeacher ? `
              <button onclick="MoodleUI.openCourseSettings('${course.courseId}')" class="btn-secondary" style="background: rgba(255,255,255,0.2); color: white; border: none;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                課程設定
              </button>
              <button onclick="MoodleUI.openAddSection('${course.courseId}')" class="btn-primary" style="background: white; color: var(--olive);">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新增章節
              </button>
            ` : ''}
          </div>
        </div>

        <!-- 左側欄 - 課程導航 -->
        <aside class="course-left-sidebar">
          <!-- 章節導航 -->
          <div class="course-nav-card">
            <div class="course-nav-card-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
              課程章節
            </div>
            <div class="sections-tree">
              ${this.renderSectionsTree(sections, course.courseId)}
            </div>
          </div>

          <!-- 快速連結 -->
          <div class="course-nav-card">
            <div class="course-nav-card-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              快速連結
            </div>
            <div class="quick-links-list">
              <div class="quick-link-item" onclick="MoodleUI.switchCourseTab('participants')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                <span>參與者</span>
              </div>
              <div class="quick-link-item" onclick="MoodleUI.switchCourseTab('grades')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>成績簿</span>
              </div>
              <div class="quick-link-item" onclick="showView('moodleForums'); MoodleUI.loadForums();">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <span>討論區</span>
              </div>
              <div class="quick-link-item" onclick="showView('moodleCalendar'); MoodleUI.loadCalendar();">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>行事曆</span>
              </div>
              ${isTeacher ? `
                <div class="quick-link-item" onclick="MoodleUI.switchCourseTab('groups')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  <span>群組管理</span>
                </div>
                <div class="quick-link-item" onclick="MoodleUI.switchCourseTab('reports')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <span>報表分析</span>
                </div>
              ` : ''}
            </div>
          </div>
        </aside>

        <!-- 中央內容區 -->
        <main class="course-main-content">
          <!-- 課程內容區 -->
          <div id="courseContentPanel" class="course-panel active">
            ${this.renderCourseSectionsCards(sections, isTeacher, course.courseId)}
          </div>

          <!-- 參與者區 -->
          <div id="courseParticipantsPanel" class="course-panel" style="display: none;">
            <div class="loading">載入中...</div>
          </div>

          <!-- 成績區 -->
          <div id="courseGradesPanel" class="course-panel" style="display: none;">
            <div class="loading">載入中...</div>
          </div>

          <!-- 群組區 (教師) -->
          <div id="courseGroupsPanel" class="course-panel" style="display: none;">
            <div class="loading">載入中...</div>
          </div>

          <!-- 報表區 (教師) -->
          <div id="courseReportsPanel" class="course-panel" style="display: none;">
            <div class="loading">載入中...</div>
          </div>
        </main>

        <!-- 右側欄 -->
        <aside class="course-right-sidebar">
          <!-- 進度小工具 -->
          <div class="sidebar-widget">
            <div class="sidebar-widget-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--olive)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
              學習進度
            </div>
            <div class="course-progress-widget">
              <div class="course-progress-ring">
                <svg viewBox="0 0 36 36" width="120" height="120">
                  <circle class="progress-bg" cx="18" cy="18" r="15.915"/>
                  <circle class="progress-fill" cx="18" cy="18" r="15.915"
                          stroke-dasharray="100" stroke-dashoffset="${100 - progressPercent}"
                          id="courseProgressCircle"/>
                </svg>
                <div class="course-progress-center">
                  <div class="course-progress-value">${progressPercent}%</div>
                  <div class="course-progress-label">完成</div>
                </div>
              </div>
              <div class="course-progress-stats">
                <div class="progress-stat">
                  <div class="progress-stat-value">${completedActivities}</div>
                  <div class="progress-stat-label">已完成</div>
                </div>
                <div class="progress-stat">
                  <div class="progress-stat-value">${totalActivities - completedActivities}</div>
                  <div class="progress-stat-label">待完成</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 迷你行事曆 -->
          <div class="sidebar-widget">
            <div class="sidebar-widget-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--olive)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              行事曆
            </div>
            <div class="sidebar-widget-body" id="courseMiniCalendar">
              <!-- 由 JS 填充 -->
            </div>
          </div>

          <!-- 最近活動 -->
          <div class="sidebar-widget">
            <div class="sidebar-widget-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--olive)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
              最近活動
            </div>
            <div class="sidebar-widget-body">
              <div class="recent-activity-list" id="courseRecentActivity">
                ${this.renderRecentCourseActivity(sections)}
              </div>
            </div>
          </div>
        </aside>
      </div>
    `;

    // 初始化迷你行事曆
    const calendarContainer = document.getElementById('courseMiniCalendar');
    if (calendarContainer) {
      this.renderMiniCalendar(calendarContainer, new Date());
    }
  },

  /**
   * 渲染章節樹狀導航
   */
  renderSectionsTree(sections, courseId) {
    if (sections.length === 0) {
      return '<div class="empty-state small" style="padding: 1rem;">尚無章節</div>';
    }

    return sections.map((section, index) => {
      const activities = section.activities || [];
      const hasActivities = activities.length > 0;
      const completedCount = activities.filter(a => a.completed).length;

      return `
        <div class="section-tree-item" data-section-id="${section.sectionId}">
          <div class="section-tree-header" onclick="MoodleUI.toggleSectionTree(this, '${section.sectionId}')">
            <span class="section-tree-toggle ${hasActivities ? '' : 'no-children'}">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,6 15,12 9,18"/></svg>
            </span>
            <span class="section-tree-name">${section.name || `第 ${index + 1} 週`}</span>
            ${hasActivities ? `<span class="section-tree-badge">${completedCount}/${activities.length}</span>` : ''}
          </div>
          <div class="section-activities-list" id="sectionActivities_${section.sectionId}">
            ${this.renderActivitiesTreeItems(activities, courseId)}
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * 渲染活動樹狀項目
   */
  renderActivitiesTreeItems(activities, courseId) {
    if (activities.length === 0) return '';

    const activityIcons = {
      page: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>',
      url: '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
      file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>',
      assignment: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
      quiz: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      forum: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
      label: '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>'
    };

    return activities.map(activity => `
      <div class="activity-tree-item ${activity.completed ? 'completed' : ''}" onclick="MoodleUI.openActivity('${activity.type}', '${activity.activityId}', '${courseId}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${activityIcons[activity.type] || activityIcons.page}
        </svg>
        <span>${activity.name}</span>
        ${activity.completed ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>' : ''}
      </div>
    `).join('');
  },

  /**
   * 切換章節樹展開/收起
   */
  toggleSectionTree(headerEl, sectionId) {
    const activitiesList = document.getElementById(`sectionActivities_${sectionId}`);
    const toggleIcon = headerEl.querySelector('.section-tree-toggle');

    if (activitiesList) {
      activitiesList.classList.toggle('expanded');
      toggleIcon?.classList.toggle('expanded');
    }
  },

  /**
   * 渲染章節卡片 (中央內容區)
   */
  renderCourseSectionsCards(sections, isTeacher, courseId) {
    if (sections.length === 0) {
      return `
        <div class="section-card">
          <div class="section-card-header" style="justify-content: center;">
            <div style="text-align: center; padding: 2rem;">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--gray-400)" stroke-width="1">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>
              </svg>
              <p style="color: var(--text-secondary); margin: 1rem 0 0.5rem;">此課程尚無內容</p>
              ${isTeacher ? '<p style="font-size: 0.85rem; color: var(--text-secondary);">點擊「新增章節」開始建立課程內容</p>' : ''}
            </div>
          </div>
        </div>
      `;
    }

    return sections.map((section, index) => `
      <div class="section-card ${section.visible === false ? 'hidden-section' : ''}" id="section_${section.sectionId}">
        <div class="section-card-header">
          <div>
            <h3 class="section-card-title">${section.name || `第 ${index + 1} 週`}</h3>
            ${section.summary ? `<p class="section-card-summary">${section.summary}</p>` : ''}
          </div>
          ${isTeacher ? `
            <div class="section-card-actions">
              <button onclick="MoodleUI.openAddActivity('${courseId}', '${section.sectionId}')" class="btn-sm btn-primary">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新增活動
              </button>
              <button onclick="MoodleUI.editSection('${courseId}', '${section.sectionId}')" class="btn-sm btn-secondary">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                編輯
              </button>
            </div>
          ` : ''}
        </div>
        <div class="activity-list">
          ${this.renderActivityListItems(section.activities || [], isTeacher, courseId, section.sectionId)}
        </div>
      </div>
    `).join('');
  },

  /**
   * 渲染活動列表項目 (新版)
   */
  renderActivityListItems(activities, isTeacher, courseId, sectionId) {
    if (activities.length === 0) {
      return `<div class="activity-list-item" style="justify-content: center; color: var(--text-secondary); cursor: default;">此章節尚無活動</div>`;
    }

    const activityIcons = {
      page: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>',
      url: '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
      file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
      assignment: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
      quiz: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      forum: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
      label: '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>'
    };

    const activityColors = {
      page: 'var(--olive)',
      url: '#6366f1',
      file: '#10b981',
      assignment: 'var(--terracotta)',
      quiz: '#8b5cf6',
      forum: '#f59e0b',
      label: 'var(--gray-500)'
    };

    const activityLabels = {
      page: '頁面',
      url: '連結',
      file: '檔案',
      assignment: '作業',
      quiz: '測驗',
      forum: '討論',
      label: '標籤'
    };

    return activities.map(activity => `
      <div class="activity-list-item ${activity.visible === false ? 'hidden-activity' : ''}" onclick="MoodleUI.openActivity('${activity.type}', '${activity.activityId}', '${courseId}')">
        <div class="activity-list-icon" style="background: ${activityColors[activity.type] || 'var(--gray-400)'}15; color: ${activityColors[activity.type] || 'var(--gray-400)'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${activityIcons[activity.type] || activityIcons.page}
          </svg>
        </div>
        <div class="activity-list-info">
          <div class="activity-list-name">${activity.name}</div>
          <div class="activity-list-meta">
            <span>${activityLabels[activity.type] || '活動'}</span>
            ${activity.dueDate ? `<span>截止：${this.formatDate(activity.dueDate)}</span>` : ''}
          </div>
        </div>
        <div class="activity-list-status">
          ${activity.completed ? `
            <span class="completed-badge">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>
              已完成
            </span>
          ` : ''}
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
      </div>
    `).join('');
  },

  /**
   * 渲染最近課程活動
   */
  renderRecentCourseActivity(sections) {
    // 收集所有活動並按時間排序
    const allActivities = [];
    sections.forEach(section => {
      (section.activities || []).forEach(activity => {
        allActivities.push({
          ...activity,
          sectionName: section.name
        });
      });
    });

    // 取最近 5 個活動
    const recentActivities = allActivities.slice(0, 5);

    if (recentActivities.length === 0) {
      return '<p style="font-size: 0.85rem; color: var(--text-secondary); text-align: center;">尚無活動</p>';
    }

    const activityIcons = {
      page: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>',
      assignment: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>',
      quiz: '<circle cx="12" cy="12" r="10"/>',
      forum: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
      default: '<circle cx="12" cy="12" r="10"/>'
    };

    return recentActivities.map(activity => `
      <div class="recent-activity-item">
        <div class="recent-activity-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${activityIcons[activity.type] || activityIcons.default}
          </svg>
        </div>
        <div class="recent-activity-content">
          <div class="recent-activity-text">${activity.name}</div>
          <div class="recent-activity-time">${activity.sectionName || '章節'}</div>
        </div>
      </div>
    `).join('');
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
      label: '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>'
    };

    const activityColors = {
      page: 'var(--olive)',
      url: '#6366f1',
      file: '#10b981',
      assignment: 'var(--terracotta)',
      quiz: '#8b5cf6',
      forum: '#f59e0b',
      label: 'var(--gray-500)'
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
          ${activity.dueDate ? `<span class="activity-due">截止日期：${MoodleUI.formatDate(activity.dueDate)}</span>` : ''}
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
    } else if (tab === 'groups' && this.currentCourseId) {
      await this.loadGroupsPanel(this.currentCourseId);
    }
  },

  /**
   * 載入群組面板
   */
  async loadGroupsPanel(courseId) {
    const panel = document.getElementById('courseGroupsPanel');
    if (!panel) return;

    panel.innerHTML = '<div class="loading">載入中...</div>';

    try {
      const result = await API.courseGroups.getOverview(courseId);
      if (!result.success) {
        panel.innerHTML = '<div class="error">載入群組資料失敗</div>';
        return;
      }

      const data = result.data;
      panel.innerHTML = this.renderGroupsPanelContent(courseId, data);
    } catch (error) {
      console.error('Load groups panel error:', error);
      panel.innerHTML = '<div class="error">載入群組資料失敗</div>';
    }
  },

  /**
   * 渲染群組面板內容
   */
  renderGroupsPanelContent(courseId, data) {
    return `
      <div class="groups-panel-content">
        <div class="groups-panel-header">
          <h3>群組管理</h3>
          <button onclick="MoodleUI.openGroupsManager('${courseId}')" class="btn-primary">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            完整管理
          </button>
        </div>

        <div class="groups-panel-mode">
          <label>群組模式：</label>
          <span class="mode-badge">${this.getGroupModeName(data.groupMode)}</span>
          ${data.groupModeForced ? '<span class="forced-badge">強制</span>' : ''}
        </div>

        <div class="groups-panel-stats">
          <div class="stat-item">
            <span class="stat-value">${data.totalGroups}</span>
            <span class="stat-label">群組</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${data.groupedStudents}</span>
            <span class="stat-label">已分組</span>
          </div>
          <div class="stat-item ${data.ungroupedStudents > 0 ? 'warning' : ''}">
            <span class="stat-value">${data.ungroupedStudents}</span>
            <span class="stat-label">未分組</span>
          </div>
        </div>

        ${data.groups.length === 0 ? `
          <div class="empty-groups">
            <p>尚未建立任何群組</p>
            <button onclick="MoodleUI.openGroupsManager('${courseId}')" class="btn-secondary">
              建立群組
            </button>
          </div>
        ` : `
          <div class="groups-preview-list">
            ${data.groups.slice(0, 5).map(g => `
              <div class="group-preview-item">
                <span class="group-name">${g.name}</span>
                <span class="group-count">${g.memberCount || 0} 人</span>
              </div>
            `).join('')}
            ${data.groups.length > 5 ? `<p class="more-text">還有 ${data.groups.length - 5} 個群組...</p>` : ''}
          </div>
        `}
      </div>
    `;
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
        const result = await API.courseEnrollment.enroll(courseId, key);
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
        const result = await API.courseEnrollment.enroll(courseId);
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
      const result = await API.courseEnrollment.getParticipants(courseId);
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
                <td>${p.enrolledAt ? MoodleUI.formatDate(p.enrolledAt) : '-'}</td>
                <td>
                  <div class="mini-progress">
                    <div class="mini-progress-fill" style="width: ${p.progress || 0}%"></div>
                  </div>
                  <span class="progress-text-sm">${p.progress || 0}%</span>
                </td>
                <td>${p.lastAccess ? MoodleUI.formatDate(p.lastAccess) : '從未'}</td>
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

    // 防止 undefined courseId
    if (!courseId) {
      panel.innerHTML = '<div class="info">請先選擇課程</div>';
      return;
    }

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
      case 'page':
      case 'url':
      case 'file':
      default:
        showToast('開啟活動: ' + type);
    }
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
   * 關閉 Modal
   */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      // 清理 modal 內的 Quill 編輯器
      const editorContainers = modal.querySelectorAll('.quill-editor-container');
      editorContainers.forEach(container => {
        if (container.id) {
          this.destroyEditor(container.id);
        }
      });
      modal.remove();
    }
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
            ${a.dueDate ? `<p class="assignment-due ${isOverdue ? 'overdue' : ''}">截止：${MoodleUI.formatDate(a.dueDate, 'datetime')}</p>` : ''}
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
                  <span class="value">${assignment.dueDate ? MoodleUI.formatDate(assignment.dueDate, 'datetime') : '無'}</span>
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

      // 設置麵包屑動態標籤 (作業名稱)
      this.setDynamicLabel('assignmentDetail', assignment.title || '作業');

      showView('assignmentDetail');

      // 初始化作業提交編輯器 (如果有的話)
      if (!isTeacher && !assignment.submission && assignment.submissionType !== 'file') {
        setTimeout(() => {
          this.initEditor('submissionContentEditor', {
            placeholder: '輸入作業內容...',
            config: 'default'
          });
        }, 100);
      }
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
          <p class="submit-time">提交時間：${MoodleUI.formatDate(assignment.submission.submittedAt, 'datetime')}</p>
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
              <div id="submissionContentEditor" class="quill-editor-container"></div>
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
                    <span class="time">${MoodleUI.formatDate(s.submittedAt, 'datetime')}</span>
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
   * 提交作業
   */
  async submitAssignment(assignmentId) {
    // 從 Quill 編輯器取得內容
    const editorContent = this.getEditorContent('submissionContentEditor');
    const content = editorContent?.html || '';
    const fileInput = document.getElementById('submissionFile');
    const files = fileInput?.files;

    if (!content.trim() && (!files || files.length === 0)) {
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
              ${q.maxAttempts || '無限'} 次嘗試機會
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
      // 檢查防作弊設定
      let antiCheatSettings = null;
      try {
        const acResult = await API.quizzes.antiCheat.getSettings(quizId);
        if (acResult.success && acResult.data && acResult.data.enabled) {
          antiCheatSettings = acResult.data;
        }
      } catch (e) {
        console.log('No anti-cheat settings or error:', e);
      }

      // 如果需要密碼驗證
      if (antiCheatSettings && antiCheatSettings.requirePassword) {
        try {
          await this.showQuizPasswordPrompt(quizId);
        } catch (e) {
          // 用戶取消
          return;
        }
      }

      const result = await API.quizzes.start(quizId);
      if (result.success) {
        this.currentQuizAttempt = result.data;
        this.currentQuestionIndex = 0;

        // 如果有防作弊設定，啟動監控
        if (antiCheatSettings) {
          this.initAntiCheatMonitor(quizId, result.data.attemptId, antiCheatSettings);
        }

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
          <h3>${this.escapeHtml(question.text)}</h3>
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
    // 處理是非題：自動提供選項
    let options = question.options;
    if (question.type === 'true_false' && (!options || !Array.isArray(options) || options.length === 0)) {
      options = ['是 (True)', '否 (False)'];
    }

    if (!options || !Array.isArray(options) || options.length === 0) {
      return '<div class="question-options"><p class="text-muted">此題目沒有選項</p></div>';
    }
    switch (question.type) {
      case 'multiple_choice':
      case 'true_false':
        return `
          <div class="question-options">
            ${options.map((opt, i) => `
              <label class="question-option ${question.answer === i ? 'selected' : ''}" onclick="MoodleUI.selectAnswer(${i})">
                <input type="radio" name="answer" value="${i}" ${question.answer === i ? 'checked' : ''}>
                <span>${this.escapeHtml(opt)}</span>
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
                <span>${this.escapeHtml(opt)}</span>
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
      // 停止防作弊監控
      this.stopAntiCheatMonitor();

      // 移除視訊預覽
      const webcamPreview = document.getElementById('webcamPreview');
      if (webcamPreview) webcamPreview.remove();

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
                  <span>${MoodleUI.formatDate(d.createdAt)}</span>
                </div>
              </div>
              <div class="discussion-stats">
                <span class="reply-count">${d.replyCount || 0} 回覆</span>
                ${d.lastReply ? `<span class="last-reply">最後回覆：${MoodleUI.formatDate(d.lastReply)}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // 設置麵包屑動態標籤 (論壇名稱)
      this.setDynamicLabel('forumDetail', forum.title || forum.name || '討論區');

      showView('forumDetail');
    } catch (error) {
      console.error('Open forum error:', error);
      showToast('載入討論區失敗');
    }
  },

  // ==================== 學生儀表板增強 ====================

  /**
   * 更新儀表板問候訊息
   */
  updateDashboardGreeting() {
    const user = API.getCurrentUser();
    const greetingMessage = document.getElementById('greetingMessage');
    const greetingSubtext = document.getElementById('greetingSubtext');

    if (!greetingMessage) return;

    const hour = new Date().getHours();
    let greeting = '';
    let subtext = '';

    if (hour < 12) {
      greeting = '早安';
      subtext = '新的一天，新的學習機會！';
    } else if (hour < 18) {
      greeting = '午安';
      subtext = '繼續保持學習的動力！';
    } else {
      greeting = '晚安';
      subtext = '今天的學習進度如何？';
    }

    const userName = user?.name || user?.fullName || '學習者';
    greetingMessage.textContent = `${greeting}，${userName}！`;
    greetingSubtext.textContent = subtext;
  },

  /**
   * 更新進度圓環
   * @param {number} percentage - 完成百分比 (0-100)
   */
  updateProgressRing(percentage) {
    const circle = document.getElementById('progressCircle');
    const valueDisplay = document.getElementById('progressValue');

    if (!circle || !valueDisplay) return;

    // 計算 stroke-dashoffset (圓周長為 100)
    const offset = 100 - percentage;
    circle.style.strokeDashoffset = offset;

    valueDisplay.textContent = `${Math.round(percentage)}%`;
  },

  /**
   * 更新儀表板統計
   */
  async updateDashboardStats() {
    try {
      // 更新問候訊息
      this.updateDashboardGreeting();

      // 嘗試載入課程數據
      const coursesResult = await API.courses.list({ enrolled: true });
      let courseCount = 0;
      let totalProgress = 0;

      if (coursesResult.success && coursesResult.data) {
        const courses = Array.isArray(coursesResult.data) ? coursesResult.data : coursesResult.data.courses || [];
        courseCount = courses.length;

        // 計算總進度
        courses.forEach(course => {
          totalProgress += course.progress || 0;
        });

        if (courseCount > 0) {
          totalProgress = totalProgress / courseCount;
        }
      }

      // 更新顯示
      const greetingCourses = document.getElementById('greetingCourses');
      if (greetingCourses) greetingCourses.textContent = courseCount;

      // 更新進度圓環
      this.updateProgressRing(totalProgress);

      // 更新統計卡片
      const statCourseCount = document.getElementById('statCourseCount');
      if (statCourseCount) statCourseCount.textContent = courseCount;

      const statCompletionRate = document.getElementById('statCompletionRate');
      if (statCompletionRate) statCompletionRate.textContent = `${Math.round(totalProgress)}%`;

    } catch (error) {
      console.error('Update dashboard stats error:', error);
    }
  },

  /**
   * 檢查並顯示緊急提醒 (48小時內到期)
   */
  async checkUrgentDeadlines() {
    const container = document.getElementById('urgentAlertContainer');
    if (!container) return;

    try {
      const assignmentsResult = await API.assignments.list({ filter: 'pending' });
      if (!assignmentsResult.success) return;

      const assignments = assignmentsResult.data?.assignments || assignmentsResult.data || [];
      const now = new Date();
      const fortyEightHours = 48 * 60 * 60 * 1000;

      // 找出 48 小時內到期的作業
      const urgentItems = assignments.filter(a => {
        if (!a.dueDate || a.submitted) return false;
        const dueDate = new Date(a.dueDate);
        const timeDiff = dueDate - now;
        return timeDiff > 0 && timeDiff <= fortyEightHours;
      });

      if (urgentItems.length === 0) {
        container.innerHTML = '';
        return;
      }

      // 找出最緊急的項目
      const mostUrgent = urgentItems.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
      const dueDate = new Date(mostUrgent.dueDate);
      const hoursLeft = Math.ceil((dueDate - now) / (60 * 60 * 1000));

      container.innerHTML = `
        <div class="urgent-alert">
          <div class="urgent-alert-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div class="urgent-alert-content">
            <div class="urgent-alert-title">⚠️ 緊急提醒：${mostUrgent.title}</div>
            <div class="urgent-alert-subtitle">
              剩餘 ${hoursLeft} 小時到期${urgentItems.length > 1 ? ` (還有 ${urgentItems.length - 1} 項即將到期)` : ''}
            </div>
          </div>
          <button class="urgent-alert-action" onclick="MoodleUI.openAssignment('${mostUrgent.assignmentId}')">
            立即查看
          </button>
        </div>
      `;
    } catch (error) {
      console.error('Check urgent deadlines error:', error);
    }
  },

  /**
   * 渲染迷你行事曆
   * @param {HTMLElement} container - 容器元素
   * @param {Date} date - 當前顯示的月份
   */
  renderMiniCalendar(container, date = new Date()) {
    if (!container) return;

    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();

    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

    let html = `
      <div class="mini-calendar">
        <div class="mini-calendar-header">
          <span class="mini-calendar-title">${year}年 ${monthNames[month]}</span>
          <div class="mini-calendar-nav">
            <button onclick="MoodleUI.changeMiniCalendarMonth(-1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
            </button>
            <button onclick="MoodleUI.changeMiniCalendarMonth(1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,6 15,12 9,18"/></svg>
            </button>
          </div>
        </div>
        <div class="mini-calendar-grid">
    `;

    // 星期標題
    dayNames.forEach(day => {
      html += `<div class="mini-calendar-day-name">${day}</div>`;
    });

    // 上月填充
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      html += `<div class="mini-calendar-day other-month">${prevMonthDays - i}</div>`;
    }

    // 當月日期
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
      html += `<div class="mini-calendar-day${isToday ? ' today' : ''}">${day}</div>`;
    }

    // 下月填充
    const remainingDays = 42 - (startDay + lastDay.getDate());
    for (let i = 1; i <= remainingDays && remainingDays < 7; i++) {
      html += `<div class="mini-calendar-day other-month">${i}</div>`;
    }

    html += '</div></div>';
    container.innerHTML = html;
  },

  // 迷你行事曆當前日期
  miniCalendarDate: new Date(),

  /**
   * 切換迷你行事曆月份
   * @param {number} delta - 月份變化 (+1 或 -1)
   */
  changeMiniCalendarMonth(delta) {
    this.miniCalendarDate.setMonth(this.miniCalendarDate.getMonth() + delta);
    const container = document.querySelector('.mini-calendar')?.parentElement;
    if (container) {
      this.renderMiniCalendar(container, this.miniCalendarDate);
    }
  },

  /**
   * 初始化學生儀表板
   */
  async initStudentDashboard() {
    // 更新統計數據
    await this.updateDashboardStats();

    // 檢查緊急提醒
    await this.checkUrgentDeadlines();
  },

  // ==================== 教師儀表板增強 ====================

  /**
   * 更新教師儀表板問候訊息
   */
  updateTeacherDashboardGreeting() {
    const user = API.getCurrentUser();
    const greetingMessage = document.getElementById('teacherGreetingMessage');
    const greetingSubtext = document.getElementById('teacherGreetingSubtext');

    if (!greetingMessage) return;

    const hour = new Date().getHours();
    let greeting = '';
    let subtext = '';

    if (hour < 12) {
      greeting = '早安';
      subtext = '新的一天，準備好啟發學生了嗎？';
    } else if (hour < 18) {
      greeting = '午安';
      subtext = '持續關注學生的學習進度！';
    } else {
      greeting = '晚安';
      subtext = '辛苦了！看看今天的教學成果';
    }

    const userName = user?.name || user?.fullName || '老師';
    greetingMessage.textContent = `${greeting}，${userName}！`;
    greetingSubtext.textContent = subtext;
  },

  /**
   * 更新教師儀表板統計數據
   */
  async updateTeacherDashboardStats() {
    try {
      // 更新問候訊息
      this.updateTeacherDashboardGreeting();

      // 載入課程數據
      const coursesResult = await API.courses.list({ role: 'teacher' });
      let courseCount = 0;
      let totalStudents = 0;

      if (coursesResult.success && coursesResult.data) {
        const courses = Array.isArray(coursesResult.data) ? coursesResult.data : coursesResult.data.courses || [];
        courseCount = courses.length;
        courses.forEach(course => {
          totalStudents += course.studentCount || course.enrolledCount || 0;
        });
      }

      // 載入待評分作業
      let pendingGrading = 0;
      try {
        const assignmentsResult = await API.assignments.list({ filter: 'pending_grading' });
        if (assignmentsResult.success) {
          const assignments = assignmentsResult.data?.assignments || assignmentsResult.data || [];
          assignments.forEach(a => {
            pendingGrading += a.pendingSubmissions || a.ungraded || 0;
          });
        }
      } catch (e) {
        console.log('Could not load pending grading count');
      }

      // 更新問候區域統計
      const teacherPendingGrading = document.getElementById('teacherPendingGrading');
      if (teacherPendingGrading) teacherPendingGrading.textContent = pendingGrading;

      const teacherStudentCount = document.getElementById('teacherStudentCount');
      if (teacherStudentCount) teacherStudentCount.textContent = totalStudents;

      const teacherCourseCount = document.getElementById('teacherCourseCount');
      if (teacherCourseCount) teacherCourseCount.textContent = courseCount;

      // 更新統計卡片
      const teacherTotalStudents = document.getElementById('teacherTotalStudents');
      if (teacherTotalStudents) teacherTotalStudents.textContent = totalStudents;

      const teacherActiveCourses = document.getElementById('teacherActiveCourses');
      if (teacherActiveCourses) teacherActiveCourses.textContent = courseCount;

      // 更新待處理任務區域
      const pendingAssignments = document.getElementById('pendingAssignments');
      if (pendingAssignments) pendingAssignments.textContent = pendingGrading;

    } catch (error) {
      console.error('Update teacher dashboard stats error:', error);
    }
  },

  /**
   * 載入待評分佇列
   */
  async loadGradingQueue() {
    const container = document.getElementById('gradingQueueList');
    if (!container) return;

    try {
      const result = await API.assignments.list({ filter: 'pending_grading', limit: 5 });

      if (!result.success) {
        container.innerHTML = '<p class="empty-state">無法載入待評分項目</p>';
        return;
      }

      const assignments = result.data?.assignments || result.data || [];

      if (assignments.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p>太棒了！目前沒有待評分的作業</p>
          </div>
        `;
        return;
      }

      let html = '';
      for (const assignment of assignments) {
        const pendingCount = assignment.pendingSubmissions || assignment.ungraded || 0;
        const dueDate = assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString('zh-TW') : '無截止日期';

        html += `
          <div class="grading-item" onclick="MoodleUI.openAssignment('${assignment.assignmentId}')">
            <div class="grading-item-info">
              <div class="grading-item-title">${assignment.title}</div>
              <div class="grading-item-meta">
                <span>${assignment.courseName || '課程'}</span>
                <span>•</span>
                <span>截止：${dueDate}</span>
              </div>
            </div>
            <div class="grading-item-count">
              <span class="count-number">${pendingCount}</span>
              <span class="count-label">待評分</span>
            </div>
          </div>
        `;
      }

      container.innerHTML = html;

    } catch (error) {
      console.error('Load grading queue error:', error);
      container.innerHTML = '<p class="empty-state">載入失敗</p>';
    }
  },

  /**
   * 載入需關注學生列表
   */
  async loadAtRiskStudents() {
    const container = document.getElementById('studentAlertsList');
    if (!container) return;

    try {
      // 嘗試從 API 載入需關注學生
      // 如果 API 不存在，顯示空狀態
      let students = [];

      try {
        const result = await API.request('/api/analytics/at-risk-students', { method: 'GET' });
        if (result.success && result.data) {
          students = result.data || [];
        }
      } catch (e) {
        // API 可能不存在，使用空陣列
      }

      if (students.length === 0) {
        container.innerHTML = `
          <div class="empty-state small">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <p>目前沒有需要特別關注的學生</p>
          </div>
        `;
        return;
      }

      let html = '';
      for (const student of students.slice(0, 5)) {
        const alertType = student.riskLevel === 'high' ? 'danger' : 'warning';
        html += `
          <div class="student-alert-item ${alertType}">
            <div class="student-alert-avatar">
              ${student.name?.charAt(0) || '?'}
            </div>
            <div class="student-alert-info">
              <div class="student-alert-name">${student.name || '未知學生'}</div>
              <div class="student-alert-reason">${student.reason || '需要關注'}</div>
            </div>
            <button class="student-alert-action" onclick="MoodleUI.viewStudentDetail('${student.userId}')">
              查看
            </button>
          </div>
        `;
      }

      container.innerHTML = html;

    } catch (error) {
      console.error('Load at-risk students error:', error);
      container.innerHTML = '<p class="empty-state small">載入失敗</p>';
    }
  },

  /**
   * 載入最近提交
   */
  async loadRecentSubmissions() {
    const container = document.getElementById('recentSubmissionsList');
    if (!container) return;

    try {
      const result = await API.assignments.list({ filter: 'recent_submissions', limit: 5 });

      if (!result.success) {
        container.innerHTML = '<p class="empty-state small">無法載入</p>';
        return;
      }

      const submissions = result.data?.submissions || result.data?.assignments || [];

      if (submissions.length === 0) {
        container.innerHTML = `
          <div class="empty-state small">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <p>目前沒有新提交</p>
          </div>
        `;
        return;
      }

      let html = '<div class="recent-submissions-list">';
      for (const item of submissions.slice(0, 5)) {
        const submittedAt = item.submittedAt ? new Date(item.submittedAt).toLocaleString('zh-TW', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : '';

        html += `
          <div class="submission-item" onclick="MoodleUI.openAssignment('${item.assignmentId}')">
            <div class="submission-student">${item.studentName || '學生'}</div>
            <div class="submission-assignment">${item.title || item.assignmentTitle || '作業'}</div>
            <div class="submission-time">${submittedAt}</div>
          </div>
        `;
      }
      html += '</div>';

      container.innerHTML = html;

    } catch (error) {
      console.error('Load recent submissions error:', error);
      container.innerHTML = '<p class="empty-state small">載入失敗</p>';
    }
  },

  /**
   * 查看學生詳情
   * @param {string} userId - 學生 ID
   */
  viewStudentDetail(userId) {
    // 導航到學生詳情頁面（如果有的話）
    if (typeof showView === 'function') {
      window.currentStudentId = userId;
      showView('studentDetail');
    } else {
      showToast('學生詳情功能開發中');
    }
  },

  /**
   * 初始化教師儀表板
   */
  async initTeacherDashboard() {
    // 更新統計數據
    await this.updateTeacherDashboardStats();

    // 載入待評分佇列
    await this.loadGradingQueue();

    // 載入需關注學生
    await this.loadAtRiskStudents();

    // 載入最近提交
    await this.loadRecentSubmissions();
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

      container.innerHTML = events.map(e => {
        const eventDate = new Date(e.startDate || e.dueDate);
        const isValidDate = !isNaN(eventDate.getTime());
        return `
        <div class="event-item">
          <div class="event-date">
            <span class="day">${isValidDate ? eventDate.getDate() : '-'}</span>
            <span class="month">${isValidDate ? eventDate.toLocaleDateString('zh-TW', { month: 'short' }) : '-'}</span>
          </div>
          <div class="event-info">
            <div class="event-title">${e.title}</div>
            <div class="event-course">${e.courseName || ''}</div>
            <div class="event-time">${e.type === 'assignment' ? '截止' : ''}：${isValidDate ? eventDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '-'}</div>
          </div>
        </div>
      `}).join('');
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
              <span class="value">${quiz.maxAttempts === 0 || !quiz.maxAttempts ? '無限' : quiz.maxAttempts} 次</span>
            </div>
            <div class="info-item">
              <span class="label">開放時間</span>
              <span class="value">${quiz.openDate ? MoodleUI.formatDate(quiz.openDate, 'datetime') : '隨時開放'}</span>
            </div>
            <div class="info-item">
              <span class="label">截止時間</span>
              <span class="value">${quiz.closeDate ? MoodleUI.formatDate(quiz.closeDate, 'datetime') : '無限制'}</span>
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
                      <td>${MoodleUI.formatDate(a.startedAt, 'datetime')}</td>
                      <td>${a.completedAt ? MoodleUI.formatDate(a.completedAt, 'datetime') : '-'}</td>
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
            <div id="discussionMessageEditor" class="quill-editor-container"></div>
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

    // 初始化討論內容編輯器
    setTimeout(() => {
      this.initEditor('discussionMessageEditor', {
        placeholder: '輸入討論內容...',
        config: 'default'
      });
    }, 100);
  },

  /**
   * 提交新討論
   */
  async submitNewDiscussion(forumId) {
    const subject = document.getElementById('discussionSubject').value.trim();
    // 從 Quill 編輯器取得內容
    const editorContent = this.getEditorContent('discussionMessageEditor');
    const message = editorContent?.html || '';

    if (!subject || !message.trim()) {
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
                  <span class="post-time">${MoodleUI.formatDate(discussion.createdAt, 'datetime')}</span>
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
                      <span class="post-time">${MoodleUI.formatDate(p.createdAt, 'datetime')}</span>
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
                <div id="replyMessageEditor" class="quill-editor-container quill-editor-simple"></div>
                <button onclick="MoodleUI.submitReply('${forumId}', '${discussionId}')" class="btn-primary">發表回覆</button>
              </div>
            ` : '<div class="locked-notice">此討論已鎖定，無法回覆</div>'}
          </div>
        </div>
      `;

      // 初始化回覆編輯器 (如果討論未鎖定)
      if (!discussion.locked) {
        setTimeout(() => {
          this.initEditor('replyMessageEditor', {
            placeholder: '輸入回覆內容...',
            config: 'simple'
          });
        }, 100);
      }
    } catch (error) {
      console.error('Open discussion error:', error);
      showToast('載入討論失敗');
    }
  },

  /**
   * 提交回覆
   */
  async submitReply(forumId, discussionId) {
    // 從 Quill 編輯器取得內容
    const editorContent = this.getEditorContent('replyMessageEditor');
    const message = editorContent?.html || '';

    if (!message.trim()) {
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
    await API.notifications.markRead(notificationId);
    this.loadNotifications();
  },

  /**
   * 標記全部已讀
   */
  async markAllNotificationsRead() {
    try {
      await API.notifications.markAllRead();
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
    const container = document.getElementById('gradebookManagementContent');
    if (!container) return;

    showView('gradebookManagement');

    // 如果沒有指定課程，顯示課程選擇頁面
    if (!courseId) {
      container.innerHTML = '<div class="loading">載入課程列表...</div>';
      try {
        const result = await API.courses.list({ role: 'teacher' });
        const courses = result.success ? (result.data || []) : [];

        if (courses.length === 0) {
          container.innerHTML = `
            <div class="empty-state">
              <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
              </svg>
              <h3>沒有課程</h3>
              <p>您目前沒有任何課程的教師權限</p>
            </div>
          `;
          return;
        }

        container.innerHTML = `
          <div class="gradebook-course-select">
            <h2>選擇課程</h2>
            <p>請選擇要管理成績的課程</p>
            <div class="course-grid">
              ${courses.map(course => `
                <div class="course-card" onclick="MoodleUI.openGradebookManagement('${course.courseId}')">
                  <div class="course-icon" style="background: linear-gradient(135deg, var(--olive-500), var(--olive-600))">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="white" stroke-width="2">
                      <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
                    </svg>
                  </div>
                  <h3>${course.title}</h3>
                  <p>${course.studentCount || 0} 位學生</p>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } catch (error) {
        console.error('Load courses for gradebook error:', error);
        container.innerHTML = '<div class="error">載入課程失敗</div>';
      }
      return;
    }

    this.currentGradebookCourseId = courseId;
    container.innerHTML = '<div class="loading">載入中...</div>';

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
        studentId,
        itemId,
        { score: newValue ? parseFloat(newValue) : null }
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
   * 開啟類別管理 Modal
   */
  async openCategoryManageModal() {
    const modal = document.createElement('div');
    modal.id = 'categoryManageModal';
    modal.className = 'modal-overlay';

    // 載入類別
    const result = await API.questionBank.getCategories();
    const categories = result.success ? result.data : [];

    modal.innerHTML = `
      <div class="modal-content modal-md">
        <div class="modal-header">
          <h3>管理題目類別</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="category-form">
            <div class="form-row">
              <input type="text" id="newCategoryName" placeholder="輸入新類別名稱..." class="form-input">
              <button onclick="MoodleUI.createQuestionCategory()" class="btn-primary btn-sm">新增類別</button>
            </div>
          </div>
          <div class="category-list" style="margin-top: 1rem; max-height: 300px; overflow-y: auto;">
            ${categories.length === 0 ? '<p class="text-muted">尚無類別</p>' : categories.map(cat => `
              <div class="category-list-item" data-id="${cat.categoryId}" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-bottom: 1px solid var(--gray-200);">
                <span>${cat.name}</span>
                <div class="item-actions">
                  <button onclick="MoodleUI.editQuestionCategory('${cat.categoryId}', '${cat.name}')" class="btn-icon" title="編輯">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onclick="MoodleUI.deleteQuestionCategory('${cat.categoryId}')" class="btn-icon btn-danger" title="刪除">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">關閉</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#newCategoryName')?.focus();
  },

  /**
   * 新增題目類別
   */
  async createQuestionCategory() {
    const nameInput = document.getElementById('newCategoryName');
    const name = nameInput?.value?.trim();

    if (!name) {
      showToast('請輸入類別名稱');
      return;
    }

    try {
      const result = await API.questionBank.createCategory({ name });
      if (result.success) {
        showToast('類別已建立');
        document.getElementById('categoryManageModal')?.remove();
        await this.openCategoryManageModal();
        await this.openQuestionBank();
      } else {
        showToast(result.message || '建立類別失敗');
      }
    } catch (error) {
      console.error('Create category error:', error);
      showToast('建立類別時發生錯誤');
    }
  },

  /**
   * 編輯題目類別
   */
  async editQuestionCategory(categoryId, currentName) {
    const newName = prompt('請輸入新的類別名稱:', currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
      const result = await API.questionBank.updateCategory(categoryId, { name: newName.trim() });
      if (result.success) {
        showToast('類別已更新');
        document.getElementById('categoryManageModal')?.remove();
        await this.openCategoryManageModal();
        await this.openQuestionBank();
      } else {
        showToast(result.message || '更新類別失敗');
      }
    } catch (error) {
      console.error('Update category error:', error);
      showToast('更新類別時發生錯誤');
    }
  },

  /**
   * 刪除題目類別
   */
  async deleteQuestionCategory(categoryId) {
    if (!confirm('確定要刪除此類別嗎？類別內的題目不會被刪除，但會失去類別關聯。')) return;

    try {
      const result = await API.questionBank.deleteCategory(categoryId);
      if (result.success) {
        showToast('類別已刪除');
        document.getElementById('categoryManageModal')?.remove();
        await this.openCategoryManageModal();
        await this.openQuestionBank();
      } else {
        showToast(result.message || '刪除類別失敗');
      }
    } catch (error) {
      console.error('Delete category error:', error);
      showToast('刪除類別時發生錯誤');
    }
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
   * 預覽題目
   */
  async previewQuestion(questionId) {
    if (!questionId || questionId === 'undefined') {
      showToast('請先選擇題目');
      return;
    }

    try {
      const result = await API.questionBank.get(questionId);
      if (!result.success) {
        showToast('載入題目失敗');
        return;
      }

      const question = result.data;
      const questionTypes = {
        'multiple_choice': '選擇題',
        'true_false': '是非題',
        'short_answer': '簡答題',
        'essay': '申論題',
        'matching': '配對題',
        'fill_blank': '填空題'
      };

      const modal = document.createElement('div');
      modal.id = 'questionPreviewModal';
      modal.className = 'modal-overlay';

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>題目預覽</h3>
            <button onclick="MoodleUI.closeModal('questionPreviewModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="question-preview">
              <div class="question-preview-meta">
                <span class="question-type">${questionTypes[question.type] || question.type}</span>
                ${question.category ? `<span class="question-category">${question.category}</span>` : ''}
                <span class="question-difficulty difficulty-${question.difficulty || 'medium'}">
                  ${question.difficulty === 'easy' ? '簡單' : question.difficulty === 'hard' ? '困難' : '中等'}
                </span>
                ${question.points ? `<span class="question-points">${question.points} 分</span>` : ''}
              </div>
              <div class="question-preview-text">
                <p>${question.questionText}</p>
              </div>
              ${question.type === 'multiple_choice' && question.options ? `
                <ul class="question-preview-options">
                  ${question.options.map((opt, i) => `
                    <li class="${question.correctAnswer === i ? 'correct-answer' : ''}">
                      <span class="option-letter">${String.fromCharCode(65 + i)}</span>
                      <span class="option-text">${opt}</span>
                      ${question.correctAnswer === i ? '<span class="correct-badge">✓ 正確答案</span>' : ''}
                    </li>
                  `).join('')}
                </ul>
              ` : ''}
              ${question.type === 'true_false' ? `
                <div class="true-false-answer">
                  <p>正確答案: <strong>${question.correctAnswer === true || question.correctAnswer === 'true' ? '是' : '否'}</strong></p>
                </div>
              ` : ''}
              ${question.type === 'short_answer' || question.type === 'fill_blank' ? `
                <div class="short-answer">
                  <p>參考答案: <strong>${question.correctAnswer || '無'}</strong></p>
                </div>
              ` : ''}
              ${question.explanation ? `
                <div class="question-explanation">
                  <h4>解答說明</h4>
                  <p>${question.explanation}</p>
                </div>
              ` : ''}
              ${question.tags && question.tags.length ? `
                <div class="question-tags">
                  ${question.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('questionPreviewModal')" class="btn-secondary">關閉</button>
            <button onclick="MoodleUI.closeModal('questionPreviewModal'); MoodleUI.editQuestion('${questionId}')" class="btn-primary">編輯題目</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('questionPreviewModal'); };
    } catch (error) {
      console.error('Preview question error:', error);
      showToast('載入題目失敗');
    }
  },

  /**
   * 編輯題目
   */
  async editQuestion(questionId) {
    if (!questionId || questionId === 'undefined') {
      showToast('請先選擇題目');
      return;
    }

    try {
      const result = await API.questionBank.get(questionId);
      if (!result.success) {
        showToast('載入題目失敗');
        return;
      }

      const question = result.data;

      // 載入類別列表
      const catResult = await API.questionBank.getCategories();
      const categories = catResult.success ? catResult.data : [];

      const modal = document.createElement('div');
      modal.id = 'editQuestionModal';
      modal.className = 'modal-overlay';

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>編輯題目</h3>
            <button onclick="MoodleUI.closeModal('editQuestionModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>題目類型</label>
              <select id="editQuestionType" class="form-control" onchange="MoodleUI.toggleEditQuestionTypeOptions()">
                <option value="multiple_choice" ${question.type === 'multiple_choice' ? 'selected' : ''}>選擇題</option>
                <option value="true_false" ${question.type === 'true_false' ? 'selected' : ''}>是非題</option>
                <option value="short_answer" ${question.type === 'short_answer' ? 'selected' : ''}>簡答題</option>
                <option value="essay" ${question.type === 'essay' ? 'selected' : ''}>申論題</option>
                <option value="fill_blank" ${question.type === 'fill_blank' ? 'selected' : ''}>填空題</option>
              </select>
            </div>
            <div class="form-group">
              <label>類別</label>
              <select id="editQuestionCategory" class="form-control">
                <option value="">未分類</option>
                ${categories.map(cat => `
                  <option value="${cat.categoryId}" ${question.categoryId === cat.categoryId ? 'selected' : ''}>${cat.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>題目內容 *</label>
              <textarea id="editQuestionText" class="form-control" rows="3">${question.questionText || ''}</textarea>
            </div>
            <div id="editQuestionOptionsContainer" class="form-group" style="${question.type === 'multiple_choice' ? '' : 'display:none'}">
              <label>選項</label>
              <div id="editQuestionOptions">
                ${(question.options || ['', '', '', '']).map((opt, i) => `
                  <div class="option-input">
                    <input type="radio" name="editCorrectAnswer" value="${i}" ${question.correctAnswer === i ? 'checked' : ''}>
                    <input type="text" class="form-control" value="${opt}" placeholder="選項 ${i + 1}">
                  </div>
                `).join('')}
              </div>
              <button type="button" class="btn-sm" onclick="MoodleUI.addEditQuestionOption()">+ 新增選項</button>
            </div>
            <div id="editTrueFalseContainer" class="form-group" style="${question.type === 'true_false' ? '' : 'display:none'}">
              <label>正確答案</label>
              <select id="editTrueFalseAnswer" class="form-control">
                <option value="true" ${question.correctAnswer === true || question.correctAnswer === 'true' ? 'selected' : ''}>是</option>
                <option value="false" ${question.correctAnswer === false || question.correctAnswer === 'false' ? 'selected' : ''}>否</option>
              </select>
            </div>
            <div id="editShortAnswerContainer" class="form-group" style="${question.type === 'short_answer' || question.type === 'fill_blank' ? '' : 'display:none'}">
              <label>參考答案</label>
              <input type="text" id="editShortAnswer" class="form-control" value="${question.correctAnswer || ''}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>難度</label>
                <select id="editQuestionDifficulty" class="form-control">
                  <option value="easy" ${question.difficulty === 'easy' ? 'selected' : ''}>簡單</option>
                  <option value="medium" ${question.difficulty === 'medium' ? 'selected' : ''}>中等</option>
                  <option value="hard" ${question.difficulty === 'hard' ? 'selected' : ''}>困難</option>
                </select>
              </div>
              <div class="form-group">
                <label>分數</label>
                <input type="number" id="editQuestionPoints" class="form-control" value="${question.points || 1}" min="1">
              </div>
            </div>
            <div class="form-group">
              <label>解答說明</label>
              <textarea id="editQuestionExplanation" class="form-control" rows="2">${question.explanation || ''}</textarea>
            </div>
            <div class="form-group">
              <label>標籤 (以逗號分隔)</label>
              <input type="text" id="editQuestionTags" class="form-control" value="${(question.tags || []).join(', ')}">
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('editQuestionModal')" class="btn-secondary">取消</button>
            <button onclick="MoodleUI.updateQuestion('${questionId}')" class="btn-primary">儲存變更</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('editQuestionModal'); };
    } catch (error) {
      console.error('Edit question error:', error);
      showToast('載入題目失敗');
    }
  },

  /**
   * 切換編輯題目類型選項
   */
  toggleEditQuestionTypeOptions() {
    const type = document.getElementById('editQuestionType').value;
    document.getElementById('editQuestionOptionsContainer').style.display = type === 'multiple_choice' ? '' : 'none';
    document.getElementById('editTrueFalseContainer').style.display = type === 'true_false' ? '' : 'none';
    document.getElementById('editShortAnswerContainer').style.display = (type === 'short_answer' || type === 'fill_blank') ? '' : 'none';
  },

  /**
   * 新增編輯題目選項
   */
  addEditQuestionOption() {
    const container = document.getElementById('editQuestionOptions');
    const optionCount = container.children.length;
    const div = document.createElement('div');
    div.className = 'option-input';
    div.innerHTML = `
      <input type="radio" name="editCorrectAnswer" value="${optionCount}">
      <input type="text" class="form-control" placeholder="選項 ${optionCount + 1}">
      <button type="button" class="btn-icon btn-danger" onclick="this.parentElement.remove()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    container.appendChild(div);
  },

  /**
   * 更新題目
   */
  async updateQuestion(questionId) {
    const type = document.getElementById('editQuestionType').value;
    const questionText = document.getElementById('editQuestionText').value.trim();
    const categoryId = document.getElementById('editQuestionCategory').value;
    const difficulty = document.getElementById('editQuestionDifficulty').value;
    const points = parseInt(document.getElementById('editQuestionPoints').value) || 1;
    const explanation = document.getElementById('editQuestionExplanation').value.trim();
    const tagsInput = document.getElementById('editQuestionTags').value.trim();
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

    if (!questionText) {
      showToast('請輸入題目內容');
      return;
    }

    let correctAnswer;
    let options;

    if (type === 'multiple_choice') {
      const optionInputs = document.querySelectorAll('#editQuestionOptions .option-input');
      options = Array.from(optionInputs).map(div => div.querySelector('input[type="text"]').value);
      const selectedRadio = document.querySelector('input[name="editCorrectAnswer"]:checked');
      correctAnswer = selectedRadio ? parseInt(selectedRadio.value) : 0;
    } else if (type === 'true_false') {
      correctAnswer = document.getElementById('editTrueFalseAnswer').value === 'true';
    } else if (type === 'short_answer' || type === 'fill_blank') {
      correctAnswer = document.getElementById('editShortAnswer').value.trim();
    }

    try {
      const result = await API.questionBank.update(questionId, {
        type,
        questionText,
        categoryId: categoryId || undefined,
        options,
        correctAnswer,
        difficulty,
        points,
        explanation,
        tags
      });

      if (result.success) {
        showToast('題目已更新');
        this.closeModal('editQuestionModal');
        this.openQuestionBank();
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      console.error('Update question error:', error);
      showToast('更新題目失敗');
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

  /**
   * 開啟匯入題目對話框
   */
  openImportQuestionsModal() {
    const modal = document.createElement('div');
    modal.id = 'importQuestionsModal';
    modal.className = 'modal-overlay';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>匯入題目</h3>
          <button onclick="MoodleUI.closeModal('importQuestionsModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>匯入類別</label>
            <select id="importCategoryId">
              <option value="">預設類別</option>
            </select>
          </div>
          <div class="form-group">
            <label>選擇檔案 (JSON 格式)</label>
            <input type="file" id="importQuestionsFile" accept=".json" class="form-control">
          </div>
          <div class="import-preview" id="importPreview" style="display:none;">
            <h4>預覽</h4>
            <div id="importPreviewContent"></div>
          </div>
          <div class="form-help">
            <strong>JSON 格式範例：</strong>
            <pre style="font-size:12px; background:#f5f5f5; padding:10px; border-radius:4px; overflow:auto;">
{
  "questions": [
    {
      "type": "multiple_choice",
      "title": "問題標題",
      "content": "問題內容",
      "options": [
        {"id": "a", "text": "選項A", "isCorrect": false},
        {"id": "b", "text": "選項B", "isCorrect": true}
      ],
      "points": 10,
      "difficulty": "medium"
    }
  ]
}</pre>
          </div>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('importQuestionsModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.executeImportQuestions()" class="btn-primary" id="importQuestionsBtn" disabled>匯入</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 載入類別選項
    this.loadImportCategoryOptions();

    // 綁定檔案選擇事件
    document.getElementById('importQuestionsFile').onchange = (e) => {
      this.previewImportQuestions(e.target.files[0]);
    };

    modal.onclick = (e) => { if (e.target === modal) this.closeModal('importQuestionsModal'); };
  },

  /**
   * 載入匯入類別選項
   */
  async loadImportCategoryOptions() {
    try {
      const result = await API.questionBank.getCategories();
      if (result.success) {
        const select = document.getElementById('importCategoryId');
        result.data.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.id;
          option.textContent = cat.name;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Load import categories error:', error);
    }
  },

  /**
   * 預覽匯入的題目
   */
  async previewImportQuestions(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.questions || !Array.isArray(data.questions)) {
        showToast('無效的 JSON 格式：缺少 questions 陣列');
        return;
      }

      const preview = document.getElementById('importPreview');
      const content = document.getElementById('importPreviewContent');

      content.innerHTML = `
        <p>將匯入 <strong>${data.questions.length}</strong> 題</p>
        <ul style="max-height:200px; overflow:auto;">
          ${data.questions.slice(0, 10).map(q => `
            <li><strong>${q.type || 'unknown'}</strong>: ${q.title || q.content?.substring(0, 50) || '無標題'}</li>
          `).join('')}
          ${data.questions.length > 10 ? `<li>... 還有 ${data.questions.length - 10} 題</li>` : ''}
        </ul>
      `;

      preview.style.display = 'block';
      document.getElementById('importQuestionsBtn').disabled = false;

      // 暫存資料
      this._importData = data;
    } catch (error) {
      console.error('Parse import file error:', error);
      showToast('檔案解析失敗：' + error.message);
    }
  },

  /**
   * 執行匯入題目
   */
  async executeImportQuestions() {
    if (!this._importData) {
      showToast('請先選擇檔案');
      return;
    }

    const categoryId = document.getElementById('importCategoryId').value;

    try {
      const result = await API.questionBank.import({
        questions: this._importData.questions,
        categoryId: categoryId || undefined
      });

      if (result.success) {
        showToast(result.message || `成功匯入 ${result.data?.imported || 0} 題`);
        this.closeModal('importQuestionsModal');
        this._importData = null;
        await this.openQuestionBank(); // 重新載入題庫
      } else {
        showToast(result.message || '匯入失敗');
      }
    } catch (error) {
      console.error('Import questions error:', error);
      showToast('匯入失敗');
    }
  },

  // ==================== 課程完成條件系統 ====================

  /**
   * 開啟課程完成設定（教師）
   */
  async openCourseCompletionSettings(courseId) {
    // 如果沒有提供課程 ID，顯示課程選擇頁面
    if (!courseId) {
      const container = document.getElementById('courseCompletionSettingsContent');
      if (!container) return;

      container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>載入課程列表...</p></div>';

      try {
        const result = await API.courses.list();
        const courses = result.success ? result.data.filter(c => c.role === 'teacher' || c.isCreator) : [];

        container.innerHTML = `
          <div class="completion-settings-page">
            <div class="page-header-modern">
              <div class="header-content">
                <h2>課程完成設定</h2>
                <p>選擇課程以設定完成條件</p>
              </div>
            </div>
            <div class="courses-grid">
              ${courses.length === 0 ? `
                <div class="empty-state">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 14l9-5-9-5-9 5 9 5z"/>
                    <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
                  </svg>
                  <h3>沒有可管理的課程</h3>
                  <p>您需要是課程的教師才能設定完成條件</p>
                </div>
              ` : courses.map(course => `
                <div class="course-card" onclick="MoodleUI.openCourseCompletionSettingsModal('${course.courseId}')">
                  <div class="card-cover" style="background: linear-gradient(135deg, var(--olive) 0%, var(--olive-deep) 100%);">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="white" stroke-width="1.5">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                      <polyline points="22,4 12,14.01 9,11.01"/>
                    </svg>
                  </div>
                  <div class="card-body">
                    <h3>${course.title}</h3>
                    <p class="text-muted">${course.category || '未分類'}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
        return;
      } catch (error) {
        console.error('Load courses error:', error);
        container.innerHTML = '<div class="error-state"><p>載入課程失敗</p></div>';
        return;
      }
    }

    // 有課程 ID 時打開 modal
    this.openCourseCompletionSettingsModal(courseId);
  },

  /**
   * 開啟課程完成設定 Modal
   */
  async openCourseCompletionSettingsModal(courseId) {
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
              <span class="value">${MoodleUI.formatDate(role.createdAt)}</span>
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
              <span class="value">${MoodleUI.formatDate(category.createdAt)}</span>
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

  // ==================== 學習路徑系統 ====================

  /**
   * 開啟學習路徑頁面
   */
  async openLearningPaths() {
    const container = document.getElementById('learningPathsContent');
    if (!container) return;
    container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>載入學習路徑中...</p></div>';

    try {
      const result = await API.learningPaths.list();
      const paths = result.success ? result.data : [];

      container.innerHTML = `
        <div class="learning-paths-page">
          <div class="page-header-modern">
            <div class="header-content">
              <h2>學習路徑</h2>
              <p>系統化的學習計劃，幫助您有序地掌握技能</p>
            </div>
            ${API.isAdmin() ? `
            <div class="header-actions">
              <button class="btn-primary" onclick="MoodleUI.openCreateLearningPathModal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                建立學習路徑
              </button>
            </div>
            ` : ''}
          </div>

          <div class="learning-paths-grid">
            ${paths.length === 0 ? `
              <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="64" height="64">
                  <path d="M18 10h-4v4h4v-4z"/>
                  <path d="M22 2H2v20h20V2z"/>
                  <path d="M6 6h4v4H6V6z"/>
                  <path d="M6 14h4v4H6v-4z"/>
                </svg>
                <h3>尚無學習路徑</h3>
                <p>系統還沒有建立學習路徑</p>
              </div>
            ` : paths.map(path => this.renderLearningPathCard(path)).join('')}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Load learning paths error:', error);
      container.innerHTML = '<div class="error-state">載入學習路徑失敗</div>';
    }
  },

  /**
   * 渲染學習路徑卡片
   */
  renderLearningPathCard(path) {
    const difficultyLabels = {
      beginner: { text: '入門', class: 'easy' },
      intermediate: { text: '進階', class: 'medium' },
      advanced: { text: '高級', class: 'hard' }
    };
    const diff = difficultyLabels[path.difficulty] || difficultyLabels.beginner;

    return `
      <div class="learning-path-card" onclick="MoodleUI.openLearningPathDetail('${path.id}')">
        <div class="path-thumbnail">
          <img src="${path.thumbnail || '/images/default-path.jpg'}" alt="${path.name}" onerror="this.src='/images/default-path.jpg'">
          <span class="difficulty-badge ${diff.class}">${diff.text}</span>
        </div>
        <div class="path-content">
          <h3>${path.name}</h3>
          <p>${path.description}</p>
          <div class="path-meta">
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg> ${path.estimatedDuration || 0} 小時</span>
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> ${path.totalCourses || 0} 門課程</span>
          </div>
          <div class="path-stats">
            <span>${path.enrolledCount || 0} 人學習中</span>
            <span>${path.completedCount || 0} 人已完成</span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 開啟學習路徑詳情
   */
  async openLearningPathDetail(pathId) {
    const container = document.getElementById('learningPathsContent');
    if (!container) return;
    container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div></div>';

    try {
      const result = await API.learningPaths.get(pathId);
      if (!result.success) {
        showToast('載入學習路徑失敗');
        return;
      }

      const path = result.data;
      container.innerHTML = `
        <div class="learning-path-detail">
          <div class="path-header">
            <button class="btn-back" onclick="MoodleUI.openLearningPaths()">← 返回學習路徑</button>
            <h2>${path.name}</h2>
            <p>${path.description}</p>
            ${path.userEnrolled ? `
              <div class="progress-section">
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${path.userProgress || 0}%"></div>
                </div>
                <span class="progress-text">${path.userProgress || 0}% 完成</span>
              </div>
            ` : `
              <button class="btn-primary" onclick="MoodleUI.enrollLearningPath('${path.id}')">開始學習路徑</button>
            `}
          </div>

          <div class="path-courses">
            <h3>課程內容</h3>
            ${path.courses.map((course, idx) => `
              <div class="path-course-item ${course.completed ? 'completed' : ''} ${course.userProgress > 0 ? 'in-progress' : ''}">
                <div class="course-order">${idx + 1}</div>
                <div class="course-info">
                  <h4>${course.title}</h4>
                  <p>${course.description || ''}</p>
                  <div class="course-meta">
                    <span>${course.estimatedHours || 0} 小時</span>
                    ${course.required ? '<span class="required-badge">必修</span>' : '<span class="optional-badge">選修</span>'}
                  </div>
                  ${course.userProgress > 0 ? `
                    <div class="mini-progress">
                      <div class="mini-progress-bar">
                        <div class="mini-progress-fill" style="width: ${course.userProgress}%"></div>
                      </div>
                      <span>${course.userProgress}%</span>
                    </div>
                  ` : ''}
                </div>
                <div class="course-status">
                  ${course.completed ? '<span class="status-complete">✓ 已完成</span>' :
                    course.prerequisites?.length && !course.prerequisites.every(p => path.courses.find(c => c.courseId === p)?.completed) ?
                    '<span class="status-locked">🔒 需先完成前置課程</span>' :
                    `<button class="btn-sm" onclick="MoodleUI.openCourse('${course.courseId}')">開始學習</button>`}
                </div>
              </div>
            `).join('')}
          </div>

          ${path.badges?.length ? `
            <div class="path-badges">
              <h3>可獲得的徽章</h3>
              <div class="badges-list">
                ${path.badges.map(badge => `
                  <div class="badge-item">
                    <img src="${badge.image || '/images/badges/default.png'}" alt="${badge.name}">
                    <span>${badge.name}</span>
                    <small>${badge.criteria}</small>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } catch (error) {
      console.error('Load learning path detail error:', error);
      container.innerHTML = '<div class="error-state">載入失敗</div>';
    }
  },

  /**
   * 報名學習路徑
   */
  async enrollLearningPath(pathId) {
    try {
      const result = await API.learningPaths.enroll(pathId);
      if (result.success) {
        showToast('已成功報名學習路徑');
        await this.openLearningPathDetail(pathId);
      } else {
        showToast(result.message || '報名失敗');
      }
    } catch (error) {
      console.error('Enroll learning path error:', error);
      showToast('報名失敗');
    }
  },

  // ==================== 徽章系統 ====================

  /**
   * 開啟徽章頁面
   */
  async openBadges() {
    const container = document.getElementById('badgesContent');
    if (!container) return;
    container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>載入徽章中...</p></div>';

    try {
      const [badgesResult, myBadgesResult] = await Promise.all([
        API.badges.list(),
        API.badges.getMyBadges()
      ]);

      const badges = badgesResult.success ? badgesResult.data : [];
      const myBadges = myBadgesResult.success ? myBadgesResult.data : { earned: [], inProgress: [] };

      container.innerHTML = `
        <div class="badges-page">
          <div class="page-header-modern">
            <div class="header-content">
              <h2>徽章</h2>
              <p>您的學習成就與榮譽展示</p>
            </div>
            ${API.isAdmin() ? `
            <div class="header-actions">
              <button class="btn-primary" onclick="MoodleUI.openCreateBadgeModal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                建立徽章
              </button>
            </div>
            ` : ''}
          </div>

          <div class="badges-sections">
            <section class="badges-section">
              <h3>我獲得的徽章 (${myBadges.earned?.length || 0})</h3>
              <div class="badges-grid">
                ${myBadges.earned?.length ? myBadges.earned.map(item => `
                  <div class="badge-card earned" onclick="MoodleUI.openBadgeDetail('${item.badge.id}')">
                    <img src="${item.badge.image || '/images/badges/default.png'}" alt="${item.badge.name}">
                    <h4>${item.badge.name}</h4>
                    <p>${item.badge.description}</p>
                    <small>獲得於 ${MoodleUI.formatDate(item.issuedAt)}</small>
                  </div>
                `).join('') : '<p class="empty-text">尚未獲得任何徽章</p>'}
              </div>
            </section>

            <section class="badges-section">
              <h3>進行中 (${myBadges.inProgress?.length || 0})</h3>
              <div class="badges-grid">
                ${myBadges.inProgress?.length ? myBadges.inProgress.map(item => `
                  <div class="badge-card in-progress">
                    <img src="${item.badge.image || '/images/badges/default.png'}" alt="${item.badge.name}" class="grayscale">
                    <h4>${item.badge.name}</h4>
                    <p>${item.badge.description}</p>
                    <div class="progress-mini">
                      <div class="progress-bar-mini">
                        <div class="progress-fill-mini" style="width: ${item.progress}%"></div>
                      </div>
                      <span>${item.progress}%</span>
                    </div>
                    <small>${item.remaining}</small>
                  </div>
                `).join('') : '<p class="empty-text">沒有進行中的徽章</p>'}
              </div>
            </section>

            <section class="badges-section">
              <h3>所有徽章 (${badges.length})</h3>
              <div class="badges-grid">
                ${badges.map(badge => {
                  const isEarned = myBadges.earned?.some(e => e.badge.id === badge.id);
                  return `
                    <div class="badge-card ${isEarned ? 'earned' : 'locked'}" onclick="MoodleUI.openBadgeDetail('${badge.id}')">
                      <img src="${badge.image || '/images/badges/default.png'}" alt="${badge.name}" class="${isEarned ? '' : 'grayscale'}">
                      <h4>${badge.name}</h4>
                      <p>${badge.description}</p>
                      <small>${badge.issuedCount} 人獲得</small>
                    </div>
                  `;
                }).join('')}
              </div>
            </section>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Load badges error:', error);
      container.innerHTML = '<div class="error-state">載入徽章失敗</div>';
    }
  },

  /**
   * 開啟徽章詳情
   */
  async openBadgeDetail(badgeId) {
    try {
      const result = await API.badges.get(badgeId);
      if (!result.success) {
        showToast('載入徽章詳情失敗');
        return;
      }

      const badge = result.data;
      const modal = document.createElement('div');
      modal.id = 'badgeDetailModal';
      modal.className = 'modal-overlay';

      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>徽章詳情</h3>
            <button onclick="MoodleUI.closeModal('badgeDetailModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="badge-detail-content">
              <img src="${badge.image || '/images/badges/default.png'}" alt="${badge.name}" class="badge-large-image">
              <h2>${badge.name}</h2>
              <p class="badge-description">${badge.description}</p>
              <div class="badge-criteria">
                <h4>獲得條件</h4>
                <p>${badge.criteria?.description || '完成指定的學習任務'}</p>
              </div>
              <div class="badge-stats">
                <span><strong>${badge.issuedCount}</strong> 人已獲得</span>
                ${badge.expiry ? `<span>有效期至 ${MoodleUI.formatDate(badge.expiry)}</span>` : ''}
              </div>
              ${badge.recentRecipients?.length ? `
                <div class="recent-recipients">
                  <h4>最近獲得者</h4>
                  <ul>
                    ${badge.recentRecipients.map(r => `
                      <li>${r.displayName} - ${MoodleUI.formatDate(r.issuedAt)}</li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('badgeDetailModal')" class="btn-secondary">關閉</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('badgeDetailModal'); };
    } catch (error) {
      console.error('Open badge detail error:', error);
      showToast('載入徽章詳情失敗');
    }
  },

  // ==================== 評分標準 (Rubrics) 系統 ====================

  /**
   * 開啟評分標準管理頁面
   */
  async openRubricsManager(courseId) {
    const container = document.getElementById('rubricsContent');
    if (!container) return;
    container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>載入評分標準中...</p></div>';

    try {
      const [rubricsResult, templatesResult] = await Promise.all([
        API.rubrics.list(courseId ? { courseId } : {}),
        API.rubrics.getTemplates()
      ]);

      const rubrics = rubricsResult.success ? rubricsResult.data : [];
      const templates = templatesResult.success ? templatesResult.data : [];

      container.innerHTML = `
        <div class="rubrics-page">
          <div class="page-header-modern">
            <div class="header-content">
              <h2>評分標準管理</h2>
              <p>建立和管理評分標準 (Rubrics) 以提供一致的評分</p>
            </div>
            <div class="header-actions">
              <button class="btn-secondary" onclick="MoodleUI.openRubricTemplates()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                從範本建立
              </button>
              <button class="btn-primary" onclick="MoodleUI.openCreateRubricModal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                建立評分標準
              </button>
            </div>
          </div>

          <div class="rubrics-list">
            ${rubrics.length === 0 ? `
              <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="64" height="64">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
                <h3>尚無評分標準</h3>
                <p>建立評分標準以提供一致、透明的評分方式</p>
              </div>
            ` : rubrics.map(rubric => `
              <div class="rubric-card">
                <div class="rubric-header">
                  <h3>${rubric.name}</h3>
                  <span class="rubric-status ${rubric.status}">${rubric.status === 'active' ? '啟用中' : '草稿'}</span>
                </div>
                <p>${rubric.description || '無描述'}</p>
                <div class="rubric-meta">
                  <span>${rubric.criteria?.length || 0} 個評分項目</span>
                  <span>滿分 ${rubric.maxScore || 100} 分</span>
                  <span>已使用 ${rubric.usageCount || 0} 次</span>
                </div>
                <div class="rubric-actions">
                  <button class="btn-sm" onclick="MoodleUI.previewRubric('${rubric.id}')">預覽</button>
                  <button class="btn-sm" onclick="MoodleUI.editRubric('${rubric.id}')">編輯</button>
                  <button class="btn-sm btn-danger" onclick="MoodleUI.deleteRubric('${rubric.id}')">刪除</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Load rubrics error:', error);
      container.innerHTML = '<div class="error-state">載入評分標準失敗</div>';
    }
  },

  /**
   * 預覽評分標準
   */
  async previewRubric(rubricId) {
    try {
      const result = await API.rubrics.get(rubricId);
      if (!result.success) {
        showToast('載入評分標準失敗');
        return;
      }

      const rubric = result.data;
      const modal = document.createElement('div');
      modal.id = 'rubricPreviewModal';
      modal.className = 'modal-overlay';

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>評分標準預覽: ${rubric.name}</h3>
            <button onclick="MoodleUI.closeModal('rubricPreviewModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <p class="rubric-description">${rubric.description || ''}</p>
            <table class="rubric-table">
              <thead>
                <tr>
                  <th>評分項目</th>
                  ${rubric.criteria[0]?.levels?.map(l => `<th>${l.label} (${l.score}分)</th>`).join('') || ''}
                  <th>權重</th>
                </tr>
              </thead>
              <tbody>
                ${rubric.criteria.map(crit => `
                  <tr>
                    <td>
                      <strong>${crit.name}</strong>
                      <br><small>${crit.description || ''}</small>
                    </td>
                    ${crit.levels.map(level => `
                      <td class="level-cell">
                        <div class="level-description">${level.description}</div>
                      </td>
                    `).join('')}
                    <td class="weight-cell">${crit.weight}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="rubric-summary">
              <strong>滿分: ${rubric.maxScore} 分</strong>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('rubricPreviewModal')" class="btn-secondary">關閉</button>
            <button onclick="MoodleUI.duplicateRubric('${rubric.id}')" class="btn-primary">複製此標準</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('rubricPreviewModal'); };
    } catch (error) {
      console.error('Preview rubric error:', error);
      showToast('載入評分標準失敗');
    }
  },

  /**
   * 開啟評分標準範本選擇
   */
  async openRubricTemplates() {
    try {
      const result = await API.rubrics.getTemplates();
      if (!result.success) {
        showToast('載入範本失敗');
        return;
      }

      const templates = result.data;
      const modal = document.createElement('div');
      modal.id = 'rubricTemplatesModal';
      modal.className = 'modal-overlay';

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>選擇評分標準範本</h3>
            <button onclick="MoodleUI.closeModal('rubricTemplatesModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="templates-grid">
              ${templates.map(template => `
                <div class="template-card" onclick="MoodleUI.useRubricTemplate('${template.id}')">
                  <h4>${template.name}</h4>
                  <p>${template.description}</p>
                  <div class="template-meta">
                    <span>${template.criteria?.length || 0} 個評分項目</span>
                    <span>滿分 ${template.maxScore} 分</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('rubricTemplatesModal')" class="btn-secondary">取消</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('rubricTemplatesModal'); };
    } catch (error) {
      console.error('Open rubric templates error:', error);
      showToast('載入範本失敗');
    }
  },

  /**
   * 使用評分標準範本
   */
  async useRubricTemplate(templateId) {
    this.closeModal('rubricTemplatesModal');
    // 開啟建立評分標準的模態框，並預填範本內容
    showToast('已選擇範本，請編輯後儲存');
    this.openCreateRubricModal(templateId);
  },

  /**
   * 開啟建立評分標準模態框
   */
  openCreateRubricModal(templateId = null) {
    const modal = document.createElement('div');
    modal.id = 'createRubricModal';
    modal.className = 'modal-overlay';

    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3>建立評分標準</h3>
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>評分標準名稱 *</label>
            <input type="text" id="rubricName" class="form-control" placeholder="例如：期中報告評分標準">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="rubricDescription" class="form-control" rows="2" placeholder="描述這個評分標準的用途"></textarea>
          </div>

          <h4>評分項目</h4>
          <div id="rubricCriteriaList">
            <div class="criteria-item" data-index="0">
              <div class="criteria-header">
                <input type="text" class="form-control criteria-name" placeholder="評分項目名稱">
                <input type="number" class="form-control criteria-weight" placeholder="權重" value="100" min="0" max="100">
                <span>%</span>
                <button class="btn-icon" onclick="this.closest('.criteria-item').remove()">✕</button>
              </div>
              <textarea class="form-control criteria-description" placeholder="項目說明"></textarea>
              <div class="criteria-levels">
                <div class="level-item">
                  <input type="number" class="level-score" value="4" min="0">
                  <input type="text" class="level-label" value="優秀">
                  <input type="text" class="level-desc" placeholder="描述">
                </div>
                <div class="level-item">
                  <input type="number" class="level-score" value="3" min="0">
                  <input type="text" class="level-label" value="良好">
                  <input type="text" class="level-desc" placeholder="描述">
                </div>
                <div class="level-item">
                  <input type="number" class="level-score" value="2" min="0">
                  <input type="text" class="level-label" value="尚可">
                  <input type="text" class="level-desc" placeholder="描述">
                </div>
                <div class="level-item">
                  <input type="number" class="level-score" value="1" min="0">
                  <input type="text" class="level-label" value="需改進">
                  <input type="text" class="level-desc" placeholder="描述">
                </div>
              </div>
            </div>
          </div>
          <button class="btn-sm" onclick="MoodleUI.addRubricCriteria()">+ 新增評分項目</button>
        </div>
        <div class="modal-footer">
          <button onclick="MoodleUI.closeModal('createRubricModal')" class="btn-secondary">取消</button>
          <button onclick="MoodleUI.saveRubric()" class="btn-primary">儲存評分標準</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) this.closeModal('createRubricModal'); };
  },

  /**
   * 新增評分項目
   */
  addRubricCriteria() {
    const list = document.getElementById('rubricCriteriaList');
    const index = list.children.length;

    const html = `
      <div class="criteria-item" data-index="${index}">
        <div class="criteria-header">
          <input type="text" class="form-control criteria-name" placeholder="評分項目名稱">
          <input type="number" class="form-control criteria-weight" placeholder="權重" value="0" min="0" max="100">
          <span>%</span>
          <button class="btn-icon" onclick="this.closest('.criteria-item').remove()">✕</button>
        </div>
        <textarea class="form-control criteria-description" placeholder="項目說明"></textarea>
        <div class="criteria-levels">
          <div class="level-item">
            <input type="number" class="level-score" value="4" min="0">
            <input type="text" class="level-label" value="優秀">
            <input type="text" class="level-desc" placeholder="描述">
          </div>
          <div class="level-item">
            <input type="number" class="level-score" value="3" min="0">
            <input type="text" class="level-label" value="良好">
            <input type="text" class="level-desc" placeholder="描述">
          </div>
          <div class="level-item">
            <input type="number" class="level-score" value="2" min="0">
            <input type="text" class="level-label" value="尚可">
            <input type="text" class="level-desc" placeholder="描述">
          </div>
          <div class="level-item">
            <input type="number" class="level-score" value="1" min="0">
            <input type="text" class="level-label" value="需改進">
            <input type="text" class="level-desc" placeholder="描述">
          </div>
        </div>
      </div>
    `;

    list.insertAdjacentHTML('beforeend', html);
  },

  /**
   * 儲存評分標準
   */
  async saveRubric() {
    const name = document.getElementById('rubricName').value.trim();
    const description = document.getElementById('rubricDescription').value.trim();

    if (!name) {
      showToast('請輸入評分標準名稱');
      return;
    }

    const criteriaItems = document.querySelectorAll('.criteria-item');
    const criteria = Array.from(criteriaItems).map((item, idx) => {
      const levels = Array.from(item.querySelectorAll('.level-item')).map(level => ({
        score: parseInt(level.querySelector('.level-score').value) || 0,
        label: level.querySelector('.level-label').value || '',
        description: level.querySelector('.level-desc').value || ''
      }));

      return {
        id: `crit_${idx + 1}`,
        name: item.querySelector('.criteria-name').value || `項目 ${idx + 1}`,
        description: item.querySelector('.criteria-description').value || '',
        weight: parseInt(item.querySelector('.criteria-weight').value) || 0,
        levels
      };
    });

    try {
      const result = await API.rubrics.create({
        name,
        description,
        criteria
      });

      if (result.success) {
        showToast('評分標準建立成功');
        this.closeModal('createRubricModal');
        await this.openRubricsManager();
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      console.error('Save rubric error:', error);
      showToast('建立評分標準失敗');
    }
  },

  /**
   * 編輯評分標準
   */
  async editRubric(rubricId) {
    try {
      const result = await API.rubrics.get(rubricId);
      if (!result.success) {
        showToast('載入評分標準失敗');
        return;
      }

      const rubric = result.data;
      const modal = document.createElement('div');
      modal.id = 'editRubricModal';
      modal.className = 'modal-overlay';

      modal.innerHTML = `
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3>編輯評分標準</h3>
            <button onclick="MoodleUI.closeModal('editRubricModal')" class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>評分標準名稱 *</label>
              <input type="text" id="editRubricName" class="form-control" value="${rubric.name || ''}">
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea id="editRubricDescription" class="form-control" rows="2">${rubric.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label>狀態</label>
              <select id="editRubricStatus" class="form-control">
                <option value="draft" ${rubric.status === 'draft' ? 'selected' : ''}>草稿</option>
                <option value="active" ${rubric.status === 'active' ? 'selected' : ''}>啟用</option>
              </select>
            </div>
            <div class="form-group">
              <label>評分項目</label>
              <div id="editCriteriaList">
                ${(rubric.criteria || []).map((crit, idx) => `
                  <div class="criteria-item">
                    <div class="criteria-header">
                      <input type="text" class="criteria-name" value="${crit.name || ''}" placeholder="項目名稱">
                      <input type="number" class="criteria-weight" value="${crit.weight || 0}" min="0" max="100" placeholder="權重%">
                      <button type="button" class="btn-icon btn-danger" onclick="this.closest('.criteria-item').remove()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                      </button>
                    </div>
                    <textarea class="criteria-description" placeholder="描述">${crit.description || ''}</textarea>
                    <div class="levels-list">
                      ${(crit.levels || []).map(level => `
                        <div class="level-item">
                          <input type="number" class="level-score" value="${level.score || 0}" min="0">
                          <input type="text" class="level-label" value="${level.label || ''}">
                          <input type="text" class="level-desc" value="${level.description || ''}" placeholder="描述">
                        </div>
                      `).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
              <button type="button" class="btn-secondary" onclick="MoodleUI.addCriteriaItem('editCriteriaList')">+ 新增評分項目</button>
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="MoodleUI.closeModal('editRubricModal')" class="btn-secondary">取消</button>
            <button onclick="MoodleUI.updateRubric('${rubricId}')" class="btn-primary">儲存變更</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.onclick = (e) => { if (e.target === modal) this.closeModal('editRubricModal'); };
    } catch (error) {
      console.error('Edit rubric error:', error);
      showToast('載入評分標準失敗');
    }
  },

  /**
   * 更新評分標準
   */
  async updateRubric(rubricId) {
    const name = document.getElementById('editRubricName').value.trim();
    const description = document.getElementById('editRubricDescription').value.trim();
    const status = document.getElementById('editRubricStatus').value;

    if (!name) {
      showToast('請輸入評分標準名稱');
      return;
    }

    const criteriaItems = document.querySelectorAll('#editCriteriaList .criteria-item');
    const criteria = Array.from(criteriaItems).map((item, idx) => {
      const levels = Array.from(item.querySelectorAll('.level-item')).map(level => ({
        score: parseInt(level.querySelector('.level-score').value) || 0,
        label: level.querySelector('.level-label').value || '',
        description: level.querySelector('.level-desc').value || ''
      }));

      return {
        id: `crit_${idx + 1}`,
        name: item.querySelector('.criteria-name').value || `項目 ${idx + 1}`,
        description: item.querySelector('.criteria-description').value || '',
        weight: parseInt(item.querySelector('.criteria-weight').value) || 0,
        levels
      };
    });

    try {
      const result = await API.rubrics.update(rubricId, {
        name,
        description,
        status,
        criteria
      });

      if (result.success) {
        showToast('評分標準已更新');
        this.closeModal('editRubricModal');
        await this.openRubricsManager();
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      console.error('Update rubric error:', error);
      showToast('更新評分標準失敗');
    }
  },

  /**
   * 刪除評分標準
   */
  async deleteRubric(rubricId) {
    if (!confirm('確定要刪除此評分標準嗎？此操作無法復原。')) return;

    try {
      const result = await API.rubrics.delete(rubricId);
      if (result.success) {
        showToast('評分標準已刪除');
        await this.openRubricsManager();
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      console.error('Delete rubric error:', error);
      showToast('刪除評分標準失敗');
    }
  },

  /**
   * 複製評分標準
   */
  async duplicateRubric(rubricId) {
    try {
      const result = await API.rubrics.get(rubricId);
      if (!result.success) {
        showToast('載入評分標準失敗');
        return;
      }

      const rubric = result.data;
      const duplicateResult = await API.rubrics.create({
        name: `${rubric.name} (複製)`,
        description: rubric.description,
        criteria: rubric.criteria
      });

      if (duplicateResult.success) {
        showToast('評分標準已複製');
        this.closeModal('rubricPreviewModal');
        await this.openRubricsManager();
      } else {
        showToast(duplicateResult.message || '複製失敗');
      }
    } catch (error) {
      console.error('Duplicate rubric error:', error);
      showToast('複製評分標準失敗');
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
  },

  // ==================== 課程群組管理 (Moodle Group Mode) ====================

  /**
   * 群組模式常量
   */
  GROUP_MODES: {
    NOGROUPS: 0,        // 無群組
    SEPARATEGROUPS: 1,  // 分開群組
    VISIBLEGROUPS: 2    // 可見群組
  },

  /**
   * 群組模式名稱
   */
  getGroupModeName(mode) {
    const names = {
      0: '無群組',
      1: '分開群組',
      2: '可見群組'
    };
    return names[mode] || '無群組';
  },

  /**
   * 群組模式說明
   */
  getGroupModeDescription(mode) {
    const descriptions = {
      0: '課程不使用群組功能',
      1: '學生只能看到自己群組的成員和活動',
      2: '學生可以看到其他群組，但只能在自己群組中互動'
    };
    return descriptions[mode] || '';
  },

  /**
   * 開啟群組管理頁面
   */
  async openGroupsManager(courseId = null) {
    const cid = courseId || this.currentCourseId;
    if (!cid) {
      showToast('請先選擇課程');
      return;
    }

    try {
      const result = await API.courseGroups.getOverview(cid);
      if (!result.success) {
        showToast(result.message || '載入群組失敗');
        return;
      }

      this.renderGroupsManager(cid, result.data);
      showView('groupsManager');
    } catch (error) {
      console.error('Load groups error:', error);
      showToast('載入群組管理失敗');
    }
  },

  /**
   * 渲染群組管理頁面
   */
  renderGroupsManager(courseId, data) {
    const container = document.getElementById('groupsManagerContent');
    if (!container) return;

    const groupModeHtml = `
      <div class="group-mode-selector">
        <label>群組模式:</label>
        <select id="groupModeSelect" onchange="MoodleUI.updateGroupMode('${courseId}', parseInt(this.value))">
          <option value="0" ${data.groupMode === 0 ? 'selected' : ''}>無群組</option>
          <option value="1" ${data.groupMode === 1 ? 'selected' : ''}>分開群組</option>
          <option value="2" ${data.groupMode === 2 ? 'selected' : ''}>可見群組</option>
        </select>
        <p class="mode-description">${this.getGroupModeDescription(data.groupMode)}</p>
        <label class="checkbox-label">
          <input type="checkbox" id="groupModeForced" ${data.groupModeForced ? 'checked' : ''}
                 onchange="MoodleUI.updateGroupModeForced('${courseId}', this.checked)">
          強制群組模式（套用至所有活動）
        </label>
      </div>
    `;

    const statsHtml = `
      <div class="groups-stats">
        <div class="stat-card">
          <span class="stat-value">${data.totalStudents}</span>
          <span class="stat-label">總學生數</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${data.totalGroups}</span>
          <span class="stat-label">群組數量</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${data.groupedStudents}</span>
          <span class="stat-label">已分組</span>
        </div>
        <div class="stat-card warning">
          <span class="stat-value">${data.ungroupedStudents}</span>
          <span class="stat-label">未分組</span>
        </div>
      </div>
    `;

    const actionsHtml = `
      <div class="groups-actions">
        <button class="btn-primary" onclick="MoodleUI.showCreateGroupModal('${courseId}')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新增群組
        </button>
        <button class="btn-secondary" onclick="MoodleUI.showAutoCreateGroupsModal('${courseId}')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          自動建立群組
        </button>
      </div>
    `;

    const groupsListHtml = `
      <div class="groups-list">
        <h3>群組列表</h3>
        ${data.groups.length === 0 ? `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <p>尚未建立任何群組</p>
          </div>
        ` : data.groups.map(group => `
          <div class="group-card" data-group-id="${group.groupId}">
            <div class="group-header">
              <h4>${group.name}</h4>
              <span class="member-count">${group.memberCount || 0} 位成員</span>
            </div>
            ${group.description ? `<p class="group-description">${group.description}</p>` : ''}
            <div class="group-members">
              ${(group.members || []).slice(0, 5).map(m => `
                <div class="member-avatar" title="${m.displayName}">
                  ${m.displayName.charAt(0)}
                </div>
              `).join('')}
              ${(group.members || []).length > 5 ? `<span class="more-members">+${group.members.length - 5}</span>` : ''}
            </div>
            <div class="group-actions">
              <button onclick="MoodleUI.showGroupMembers('${courseId}', '${group.groupId}', '${group.name}')" class="btn-sm">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                </svg>
                管理成員
              </button>
              <button onclick="MoodleUI.showEditGroupModal('${courseId}', '${group.groupId}')" class="btn-sm">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                編輯
              </button>
              <button onclick="MoodleUI.deleteGroup('${courseId}', '${group.groupId}')" class="btn-sm btn-danger">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                刪除
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    const ungroupedHtml = data.ungrouped && data.ungrouped.length > 0 ? `
      <div class="ungrouped-students">
        <h3>未分組學生 (${data.ungrouped.length})</h3>
        <div class="ungrouped-list">
          ${data.ungrouped.map(s => `
            <div class="ungrouped-student">
              <div class="student-avatar">${s.displayName.charAt(0)}</div>
              <div class="student-info">
                <span class="student-name">${s.displayName}</span>
                <span class="student-email">${s.email}</span>
              </div>
              <button onclick="MoodleUI.showAssignToGroupModal('${courseId}', '${s.userId}', '${s.displayName}')" class="btn-sm btn-primary">
                分配到群組
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    container.innerHTML = `
      <div class="groups-manager-container">
        <div class="page-header">
          <button onclick="MoodleUI.openCourse('${courseId}')" class="btn-back">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            返回課程
          </button>
          <h1>群組管理</h1>
        </div>

        ${groupModeHtml}
        ${statsHtml}
        ${actionsHtml}
        ${groupsListHtml}
        ${ungroupedHtml}
      </div>
    `;
  },

  /**
   * 更新群組模式
   */
  async updateGroupMode(courseId, mode) {
    try {
      const result = await API.courseGroups.updateSettings(courseId, { groupMode: mode });
      if (result.success) {
        showToast(`已切換為「${this.getGroupModeName(mode)}」模式`);
        // 更新說明文字
        const desc = document.querySelector('.mode-description');
        if (desc) desc.textContent = this.getGroupModeDescription(mode);
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      console.error('Update group mode error:', error);
      showToast('更新群組模式失敗');
    }
  },

  /**
   * 更新強制群組模式
   */
  async updateGroupModeForced(courseId, forced) {
    try {
      const result = await API.courseGroups.updateSettings(courseId, { groupModeForced: forced });
      if (result.success) {
        showToast(forced ? '已啟用強制群組模式' : '已停用強制群組模式');
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      console.error('Update group mode forced error:', error);
      showToast('更新失敗');
    }
  },

  /**
   * 顯示建立群組對話框
   */
  showCreateGroupModal(courseId) {
    const modal = document.createElement('div');
    modal.id = 'createGroupModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h2>建立新群組</h2>
          <button class="modal-close" onclick="MoodleUI.closeModal('createGroupModal')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>群組名稱 *</label>
            <input type="text" id="newGroupName" placeholder="輸入群組名稱" required>
          </div>
          <div class="form-group">
            <label>群組說明</label>
            <textarea id="newGroupDescription" rows="3" placeholder="選填：群組說明"></textarea>
          </div>
          <div class="form-group">
            <label>識別碼</label>
            <input type="text" id="newGroupIdNumber" placeholder="選填：外部識別碼（如班級代碼）">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="MoodleUI.closeModal('createGroupModal')">取消</button>
          <button class="btn-primary" onclick="MoodleUI.createGroup('${courseId}')">建立群組</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  /**
   * 建立群組
   */
  async createGroup(courseId) {
    const name = document.getElementById('newGroupName').value.trim();
    const description = document.getElementById('newGroupDescription').value.trim();
    const idNumber = document.getElementById('newGroupIdNumber').value.trim();

    if (!name) {
      showToast('請輸入群組名稱');
      return;
    }

    try {
      const result = await API.courseGroups.create(courseId, { name, description, idNumber });
      if (result.success) {
        showToast('群組建立成功');
        this.closeModal('createGroupModal');
        await this.openGroupsManager(courseId);
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      console.error('Create group error:', error);
      showToast('建立群組失敗');
    }
  },

  /**
   * 顯示自動建立群組對話框
   */
  showAutoCreateGroupsModal(courseId) {
    const modal = document.createElement('div');
    modal.id = 'autoCreateGroupsModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h2>自動建立群組</h2>
          <button class="modal-close" onclick="MoodleUI.closeModal('autoCreateGroupsModal')">×</button>
        </div>
        <div class="modal-body">
          <p class="info-text">系統將根據課程報名學生自動建立群組並均勻分配。</p>
          <div class="form-group">
            <label>群組數量 *</label>
            <input type="number" id="autoGroupCount" min="2" max="50" value="4" placeholder="2-50">
          </div>
          <div class="form-group">
            <label>群組名稱前綴</label>
            <input type="text" id="autoGroupPrefix" value="群組" placeholder="群組">
          </div>
          <p class="hint-text">例如：群組 1、群組 2、群組 3...</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="MoodleUI.closeModal('autoCreateGroupsModal')">取消</button>
          <button class="btn-primary" onclick="MoodleUI.autoCreateGroups('${courseId}')">自動建立</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  /**
   * 自動建立群組
   */
  async autoCreateGroups(courseId) {
    const groupCount = parseInt(document.getElementById('autoGroupCount').value);
    const groupNamePrefix = document.getElementById('autoGroupPrefix').value.trim() || '群組';

    if (!groupCount || groupCount < 2) {
      showToast('群組數量至少需要 2');
      return;
    }

    try {
      const result = await API.courseGroups.autoCreate(courseId, groupCount, groupNamePrefix);
      if (result.success) {
        showToast(result.message || '群組建立成功');
        this.closeModal('autoCreateGroupsModal');
        await this.openGroupsManager(courseId);
      } else {
        showToast(result.message || '建立失敗');
      }
    } catch (error) {
      console.error('Auto create groups error:', error);
      showToast('自動建立群組失敗');
    }
  },

  /**
   * 顯示編輯群組對話框
   */
  async showEditGroupModal(courseId, groupId) {
    try {
      const result = await API.courseGroups.get(courseId, groupId);
      if (!result.success) {
        showToast('載入群組資訊失敗');
        return;
      }

      const group = result.data;
      const modal = document.createElement('div');
      modal.id = 'editGroupModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h2>編輯群組</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('editGroupModal')">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>群組名稱 *</label>
              <input type="text" id="editGroupName" value="${group.name || ''}" required>
            </div>
            <div class="form-group">
              <label>群組說明</label>
              <textarea id="editGroupDescription" rows="3">${group.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label>識別碼</label>
              <input type="text" id="editGroupIdNumber" value="${group.idNumber || ''}">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('editGroupModal')">取消</button>
            <button class="btn-primary" onclick="MoodleUI.updateGroup('${courseId}', '${groupId}')">儲存變更</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Load group error:', error);
      showToast('載入群組資訊失敗');
    }
  },

  /**
   * 更新群組
   */
  async updateGroup(courseId, groupId) {
    const name = document.getElementById('editGroupName').value.trim();
    const description = document.getElementById('editGroupDescription').value.trim();
    const idNumber = document.getElementById('editGroupIdNumber').value.trim();

    if (!name) {
      showToast('請輸入群組名稱');
      return;
    }

    try {
      const result = await API.courseGroups.update(courseId, groupId, { name, description, idNumber });
      if (result.success) {
        showToast('群組已更新');
        this.closeModal('editGroupModal');
        await this.openGroupsManager(courseId);
      } else {
        showToast(result.message || '更新失敗');
      }
    } catch (error) {
      console.error('Update group error:', error);
      showToast('更新群組失敗');
    }
  },

  /**
   * 刪除群組
   */
  async deleteGroup(courseId, groupId) {
    if (!confirm('確定要刪除此群組嗎？群組內的成員將變為未分組狀態。')) {
      return;
    }

    try {
      const result = await API.courseGroups.delete(courseId, groupId);
      if (result.success) {
        showToast('群組已刪除');
        await this.openGroupsManager(courseId);
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      console.error('Delete group error:', error);
      showToast('刪除群組失敗');
    }
  },

  /**
   * 顯示群組成員管理
   */
  async showGroupMembers(courseId, groupId, groupName) {
    try {
      const [membersResult, overviewResult] = await Promise.all([
        API.courseGroups.getMembers(courseId, groupId),
        API.courseGroups.getOverview(courseId)
      ]);

      if (!membersResult.success) {
        showToast('載入成員失敗');
        return;
      }

      const members = membersResult.data || [];
      const ungrouped = overviewResult.data?.ungrouped || [];

      const modal = document.createElement('div');
      modal.id = 'groupMembersModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 80vh;">
          <div class="modal-header">
            <h2>${groupName} - 成員管理</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('groupMembersModal')">×</button>
          </div>
          <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
            <div class="members-section">
              <h3>群組成員 (${members.length})</h3>
              ${members.length === 0 ? '<p class="empty-text">尚無成員</p>' : `
                <div class="members-list">
                  ${members.map(m => `
                    <div class="member-item">
                      <div class="member-avatar">${m.displayName.charAt(0)}</div>
                      <div class="member-info">
                        <span class="member-name">${m.displayName}</span>
                        <span class="member-email">${m.email}</span>
                      </div>
                      <button onclick="MoodleUI.removeFromGroup('${courseId}', '${groupId}', '${m.userId}')" class="btn-sm btn-danger">
                        移除
                      </button>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            ${ungrouped.length > 0 ? `
              <div class="add-members-section">
                <h3>新增成員</h3>
                <p class="hint-text">以下是尚未分組的學生：</p>
                <div class="available-students">
                  ${ungrouped.map(s => `
                    <div class="student-item" data-user-id="${s.userId}">
                      <input type="checkbox" id="add_${s.userId}" value="${s.userId}">
                      <label for="add_${s.userId}">
                        <div class="student-avatar">${s.displayName.charAt(0)}</div>
                        <span>${s.displayName}</span>
                      </label>
                    </div>
                  `).join('')}
                </div>
                <button class="btn-primary" onclick="MoodleUI.addSelectedToGroup('${courseId}', '${groupId}')">
                  新增選取的學生
                </button>
              </div>
            ` : '<p class="info-text">所有學生都已分配到群組</p>'}
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('groupMembersModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Load group members error:', error);
      showToast('載入成員失敗');
    }
  },

  /**
   * 從群組移除成員
   */
  async removeFromGroup(courseId, groupId, userId) {
    if (!confirm('確定要將此成員從群組中移除嗎？')) {
      return;
    }

    try {
      const result = await API.courseGroups.removeMember(courseId, groupId, userId);
      if (result.success) {
        showToast('成員已移除');
        this.closeModal('groupMembersModal');
        await this.openGroupsManager(courseId);
      } else {
        showToast(result.message || '移除失敗');
      }
    } catch (error) {
      console.error('Remove member error:', error);
      showToast('移除成員失敗');
    }
  },

  /**
   * 新增選取的學生到群組
   */
  async addSelectedToGroup(courseId, groupId) {
    const checkboxes = document.querySelectorAll('.available-students input[type="checkbox"]:checked');
    const userIds = Array.from(checkboxes).map(cb => cb.value);

    if (userIds.length === 0) {
      showToast('請選擇要新增的學生');
      return;
    }

    try {
      const result = await API.courseGroups.addMembers(courseId, groupId, userIds);
      if (result.success) {
        showToast(result.message || '成員已新增');
        this.closeModal('groupMembersModal');
        await this.openGroupsManager(courseId);
      } else {
        showToast(result.message || '新增失敗');
      }
    } catch (error) {
      console.error('Add members error:', error);
      showToast('新增成員失敗');
    }
  },

  /**
   * 顯示分配學生到群組的對話框
   */
  async showAssignToGroupModal(courseId, userId, userName) {
    try {
      const result = await API.courseGroups.list(courseId);
      if (!result.success) {
        showToast('載入群組失敗');
        return;
      }

      const groups = result.data || [];
      if (groups.length === 0) {
        showToast('請先建立群組');
        return;
      }

      const modal = document.createElement('div');
      modal.id = 'assignToGroupModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
          <div class="modal-header">
            <h2>分配到群組</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('assignToGroupModal')">×</button>
          </div>
          <div class="modal-body">
            <p>將 <strong>${userName}</strong> 分配到：</p>
            <div class="group-select-list">
              ${groups.map(g => `
                <div class="group-select-item" onclick="MoodleUI.assignToGroup('${courseId}', '${g.groupId}', '${userId}')">
                  <span class="group-name">${g.name}</span>
                  <span class="member-count">${g.memberCount || 0} 位成員</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('assignToGroupModal')">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Load groups error:', error);
      showToast('載入群組失敗');
    }
  },

  /**
   * 分配學生到群組
   */
  async assignToGroup(courseId, groupId, userId) {
    try {
      const result = await API.courseGroups.addMembers(courseId, groupId, [userId]);
      if (result.success) {
        showToast('學生已分配到群組');
        this.closeModal('assignToGroupModal');
        await this.openGroupsManager(courseId);
      } else {
        showToast(result.message || '分配失敗');
      }
    } catch (error) {
      console.error('Assign to group error:', error);
      showToast('分配失敗');
    }
  },

  /**
   * 學生查看自己的群組
   */
  async viewMyGroups(courseId) {
    try {
      const result = await API.courseGroups.getMyGroups(courseId);
      if (!result.success) {
        showToast('載入群組資訊失敗');
        return;
      }

      const groups = result.data || [];

      const modal = document.createElement('div');
      modal.id = 'myGroupsModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h2>我的群組</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('myGroupsModal')">×</button>
          </div>
          <div class="modal-body">
            ${groups.length === 0 ? `
              <div class="empty-state">
                <p>您尚未被分配到任何群組</p>
              </div>
            ` : groups.map(g => `
              <div class="my-group-card">
                <h4>${g.name}</h4>
                ${g.description ? `<p>${g.description}</p>` : ''}
                <div class="group-meta">
                  <span>${g.memberCount} 位成員</span>
                  <span>加入時間：${MoodleUI.formatDate(g.joinedAt)}</span>
                </div>
                <button onclick="MoodleUI.viewGroupMembersList('${courseId}', '${g.groupId}', '${g.name}')" class="btn-sm">
                  查看成員
                </button>
              </div>
            `).join('')}
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('myGroupsModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Load my groups error:', error);
      showToast('載入群組資訊失敗');
    }
  },

  /**
   * 查看群組成員列表（學生視角）
   */
  async viewGroupMembersList(courseId, groupId, groupName) {
    try {
      const result = await API.courseGroups.getMembers(courseId, groupId);
      if (!result.success) {
        showToast('載入成員失敗');
        return;
      }

      const members = result.data || [];
      this.closeModal('myGroupsModal');

      const modal = document.createElement('div');
      modal.id = 'groupMembersListModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h2>${groupName} - 成員</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('groupMembersListModal')">×</button>
          </div>
          <div class="modal-body">
            ${members.length === 0 ? '<p>尚無成員</p>' : `
              <div class="members-list-view">
                ${members.map(m => `
                  <div class="member-list-item">
                    <div class="member-avatar">${m.displayName.charAt(0)}</div>
                    <div class="member-details">
                      <span class="member-name">${m.displayName}</span>
                      <span class="member-role">${m.role === 'student' ? '學生' : m.role}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('groupMembersListModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Load members error:', error);
      showToast('載入成員失敗');
    }
  },

  // ===== 防作弊系統 =====

  // 防作弊監控狀態
  antiCheatMonitor: {
    active: false,
    quizId: null,
    attemptId: null,
    focusLossCount: 0,
    copyAttempts: 0,
    pasteAttempts: 0,
    tabSwitches: 0,
    rightClickAttempts: 0,
    startTime: null,
    eventListeners: {}
  },

  /**
   * 開啟防作弊設定管理
   */
  async openAntiCheatSettings(quizId) {
    try {
      const result = await API.quizzes.antiCheat.getSettings(quizId);

      const settings = result.success ? result.data : {
        enabled: false,
        shuffleQuestions: false,
        shuffleAnswers: false,
        blockCopyPaste: false,
        blockRightClick: false,
        monitorFocusLoss: false,
        lockBrowser: false,
        requirePassword: false,
        password: '',
        ipRestriction: false,
        allowedIps: [],
        maxAttemptTime: null,
        preventBacktrack: false,
        webcamProctoring: false
      };

      const modal = document.createElement('div');
      modal.id = 'antiCheatSettingsModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content anti-cheat-settings-modal">
          <div class="modal-header">
            <h2><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 防作弊設定</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('antiCheatSettingsModal')">×</button>
          </div>
          <div class="modal-body">
            <div class="anti-cheat-section">
              <h3>基本設定</h3>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acEnabled" ${settings.enabled ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">啟用防作弊</span>
                  <span class="toggle-desc">開啟此功能以啟用所有防作弊措施</span>
                </div>
              </div>
            </div>

            <div class="anti-cheat-section">
              <h3>題目設定</h3>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acShuffleQuestions" ${settings.shuffleQuestions ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">隨機題目順序</span>
                  <span class="toggle-desc">每個學生看到的題目順序不同</span>
                </div>
              </div>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acShuffleAnswers" ${settings.shuffleAnswers ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">隨機選項順序</span>
                  <span class="toggle-desc">選擇題的選項順序隨機排列</span>
                </div>
              </div>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acPreventBacktrack" ${settings.preventBacktrack ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">禁止返回上一題</span>
                  <span class="toggle-desc">學生無法回到已作答的題目</span>
                </div>
              </div>
            </div>

            <div class="anti-cheat-section">
              <h3>行為監控</h3>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acBlockCopyPaste" ${settings.blockCopyPaste ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">禁止複製/貼上</span>
                  <span class="toggle-desc">防止學生複製題目或貼上答案</span>
                </div>
              </div>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acBlockRightClick" ${settings.blockRightClick ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">禁止右鍵選單</span>
                  <span class="toggle-desc">防止使用右鍵選單</span>
                </div>
              </div>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acMonitorFocusLoss" ${settings.monitorFocusLoss ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">監控焦點離開</span>
                  <span class="toggle-desc">記錄學生切換分頁/視窗的行為</span>
                </div>
              </div>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acLockBrowser" ${settings.lockBrowser ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">鎖定瀏覽器</span>
                  <span class="toggle-desc">要求全螢幕模式作答（可被跳過）</span>
                </div>
              </div>
            </div>

            <div class="anti-cheat-section">
              <h3>進階監控</h3>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acWebcamProctoring" ${settings.webcamProctoring ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">視訊監控</span>
                  <span class="toggle-desc">要求開啟視訊鏡頭並定期擷取畫面</span>
                </div>
              </div>
            </div>

            <div class="anti-cheat-section">
              <h3>存取控制</h3>
              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acRequirePassword" ${settings.requirePassword ? 'checked' : ''} onchange="document.getElementById('acPasswordField').style.display = this.checked ? 'block' : 'none'">
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">需要密碼</span>
                  <span class="toggle-desc">學生須輸入密碼才能開始測驗</span>
                </div>
              </div>
              <div id="acPasswordField" class="form-group" style="display: ${settings.requirePassword ? 'block' : 'none'}; margin-left: 50px;">
                <input type="password" id="acPassword" value="${settings.password || ''}" placeholder="輸入測驗密碼">
              </div>

              <div class="anti-cheat-toggle">
                <label class="toggle-switch">
                  <input type="checkbox" id="acIpRestriction" ${settings.ipRestriction ? 'checked' : ''} onchange="document.getElementById('acIpField').style.display = this.checked ? 'block' : 'none'">
                  <span class="toggle-slider"></span>
                </label>
                <div class="toggle-info">
                  <span class="toggle-label">IP 限制</span>
                  <span class="toggle-desc">限制只有特定 IP 位址才能作答</span>
                </div>
              </div>
              <div id="acIpField" class="form-group" style="display: ${settings.ipRestriction ? 'block' : 'none'}; margin-left: 50px;">
                <textarea id="acAllowedIps" rows="3" placeholder="每行一個 IP 位址或 CIDR 範圍">${(settings.allowedIps || []).join('\n')}</textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('antiCheatSettingsModal')">取消</button>
            <button class="btn-primary" onclick="MoodleUI.saveAntiCheatSettings('${quizId}')">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              儲存設定
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Load anti-cheat settings error:', error);
      showToast('載入防作弊設定失敗');
    }
  },

  /**
   * 儲存防作弊設定
   */
  async saveAntiCheatSettings(quizId) {
    try {
      const settings = {
        enabled: document.getElementById('acEnabled').checked,
        shuffleQuestions: document.getElementById('acShuffleQuestions').checked,
        shuffleAnswers: document.getElementById('acShuffleAnswers').checked,
        preventBacktrack: document.getElementById('acPreventBacktrack').checked,
        blockCopyPaste: document.getElementById('acBlockCopyPaste').checked,
        blockRightClick: document.getElementById('acBlockRightClick').checked,
        monitorFocusLoss: document.getElementById('acMonitorFocusLoss').checked,
        lockBrowser: document.getElementById('acLockBrowser').checked,
        webcamProctoring: document.getElementById('acWebcamProctoring').checked,
        requirePassword: document.getElementById('acRequirePassword').checked,
        password: document.getElementById('acPassword').value,
        ipRestriction: document.getElementById('acIpRestriction').checked,
        allowedIps: document.getElementById('acAllowedIps').value.split('\n').filter(ip => ip.trim())
      };

      const result = await API.quizzes.antiCheat.updateSettings(quizId, settings);
      if (result.success) {
        showToast('防作弊設定已儲存');
        this.closeModal('antiCheatSettingsModal');
      } else {
        showToast(result.message || '儲存失敗');
      }
    } catch (error) {
      console.error('Save anti-cheat settings error:', error);
      showToast('儲存失敗');
    }
  },

  /**
   * 初始化防作弊監控
   */
  initAntiCheatMonitor(quizId, attemptId, settings) {
    // 重置監控狀態
    this.antiCheatMonitor = {
      active: true,
      quizId,
      attemptId,
      focusLossCount: 0,
      copyAttempts: 0,
      pasteAttempts: 0,
      tabSwitches: 0,
      rightClickAttempts: 0,
      startTime: Date.now(),
      eventListeners: {},
      settings
    };

    const monitor = this.antiCheatMonitor;

    // 監控焦點離開
    if (settings.monitorFocusLoss) {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          monitor.tabSwitches++;
          this.recordBehaviorEvent('tab_switch', { count: monitor.tabSwitches });
          this.showAntiCheatWarning('偵測到切換分頁');
        }
      };
      const handleBlur = () => {
        monitor.focusLossCount++;
        this.recordBehaviorEvent('focus_loss', { count: monitor.focusLossCount });
        this.showAntiCheatWarning('偵測到視窗失焦');
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleBlur);
      monitor.eventListeners.visibilitychange = handleVisibilityChange;
      monitor.eventListeners.blur = handleBlur;
    }

    // 禁止複製貼上
    if (settings.blockCopyPaste) {
      const handleCopy = (e) => {
        e.preventDefault();
        monitor.copyAttempts++;
        this.recordBehaviorEvent('copy_attempt', { count: monitor.copyAttempts });
        this.showAntiCheatWarning('複製功能已禁用');
      };
      const handlePaste = (e) => {
        e.preventDefault();
        monitor.pasteAttempts++;
        this.recordBehaviorEvent('paste_attempt', { count: monitor.pasteAttempts });
        this.showAntiCheatWarning('貼上功能已禁用');
      };
      const handleCut = (e) => {
        e.preventDefault();
        this.showAntiCheatWarning('剪下功能已禁用');
      };
      document.addEventListener('copy', handleCopy);
      document.addEventListener('paste', handlePaste);
      document.addEventListener('cut', handleCut);
      monitor.eventListeners.copy = handleCopy;
      monitor.eventListeners.paste = handlePaste;
      monitor.eventListeners.cut = handleCut;
    }

    // 禁止右鍵
    if (settings.blockRightClick) {
      const handleContextMenu = (e) => {
        e.preventDefault();
        monitor.rightClickAttempts++;
        this.recordBehaviorEvent('right_click_attempt', { count: monitor.rightClickAttempts });
        this.showAntiCheatWarning('右鍵選單已禁用');
      };
      document.addEventListener('contextmenu', handleContextMenu);
      monitor.eventListeners.contextmenu = handleContextMenu;
    }

    // 鎖定瀏覽器（全螢幕）
    if (settings.lockBrowser) {
      this.requestFullScreen();
      const handleFullScreenChange = () => {
        if (!document.fullscreenElement) {
          this.recordBehaviorEvent('fullscreen_exit', {});
          this.showAntiCheatWarning('偵測到離開全螢幕模式');
          setTimeout(() => this.requestFullScreen(), 2000);
        }
      };
      document.addEventListener('fullscreenchange', handleFullScreenChange);
      monitor.eventListeners.fullscreenchange = handleFullScreenChange;
    }

    // 視訊監控
    if (settings.webcamProctoring) {
      this.initWebcamProctoring();
    }

    // 禁止鍵盤快捷鍵
    const handleKeyDown = (e) => {
      // Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, F12, Ctrl+Shift+I
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'p'].includes(e.key.toLowerCase())) {
        if (settings.blockCopyPaste) {
          e.preventDefault();
          this.showAntiCheatWarning('鍵盤快捷鍵已禁用');
        }
      }
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        e.preventDefault();
        this.recordBehaviorEvent('devtools_attempt', {});
        this.showAntiCheatWarning('開發者工具已禁用');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    monitor.eventListeners.keydown = handleKeyDown;

    console.log('防作弊監控已啟動', settings);
  },

  /**
   * 停止防作弊監控
   */
  stopAntiCheatMonitor() {
    const monitor = this.antiCheatMonitor;
    if (!monitor.active) return;

    // 移除所有事件監聽器
    Object.entries(monitor.eventListeners).forEach(([event, handler]) => {
      if (event === 'blur') {
        window.removeEventListener(event, handler);
      } else {
        document.removeEventListener(event, handler);
      }
    });

    // 停止視訊監控
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop());
      this.webcamStream = null;
    }

    // 離開全螢幕
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    this.antiCheatMonitor.active = false;
    console.log('防作弊監控已停止');
  },

  /**
   * 記錄行為事件
   */
  async recordBehaviorEvent(eventType, eventData) {
    const monitor = this.antiCheatMonitor;
    if (!monitor.active || !monitor.quizId || !monitor.attemptId) return;

    try {
      await API.quizzes.antiCheat.recordBehavior(monitor.quizId, monitor.attemptId, {
        type: eventType,
        data: eventData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Record behavior error:', error);
    }
  },

  /**
   * 顯示防作弊警告
   */
  showAntiCheatWarning(message) {
    // 移除舊警告
    const existing = document.querySelector('.anti-cheat-warning');
    if (existing) existing.remove();

    const warning = document.createElement('div');
    warning.className = 'anti-cheat-warning';
    warning.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(warning);

    setTimeout(() => warning.remove(), 3000);
  },

  /**
   * 請求全螢幕
   */
  requestFullScreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {
        console.log('無法進入全螢幕');
      });
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  },

  webcamStream: null,
  webcamInterval: null,

  /**
   * 初始化視訊監控
   */
  async initWebcamProctoring() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.webcamStream = stream;

      // 建立視訊預覽元素
      let videoPreview = document.getElementById('webcamPreview');
      if (!videoPreview) {
        videoPreview = document.createElement('div');
        videoPreview.id = 'webcamPreview';
        videoPreview.className = 'webcam-preview';
        videoPreview.innerHTML = `
          <video id="webcamVideo" autoplay muted></video>
          <div class="webcam-status">
            <span class="webcam-dot"></span>
            監控中
          </div>
        `;
        document.body.appendChild(videoPreview);
      }

      const video = document.getElementById('webcamVideo');
      video.srcObject = stream;

      // 每 30 秒擷取一次畫面
      this.webcamInterval = setInterval(() => {
        this.captureWebcamScreenshot();
      }, 30000);

      // 初始擷取
      setTimeout(() => this.captureWebcamScreenshot(), 2000);

    } catch (error) {
      console.error('Webcam access error:', error);
      this.recordBehaviorEvent('webcam_denied', { error: error.message });
      showToast('無法存取視訊鏡頭，監控功能受限');
    }
  },

  /**
   * 擷取視訊畫面
   */
  async captureWebcamScreenshot() {
    const video = document.getElementById('webcamVideo');
    if (!video || !this.webcamStream) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      const imageData = canvas.toDataURL('image/jpeg', 0.5);

      const monitor = this.antiCheatMonitor;
      if (monitor.active && monitor.quizId && monitor.attemptId) {
        await API.quizzes.antiCheat.uploadScreenshot(monitor.quizId, monitor.attemptId, imageData);
      }
    } catch (error) {
      console.error('Capture screenshot error:', error);
    }
  },

  /**
   * 顯示測驗密碼輸入框
   */
  showQuizPasswordPrompt(quizId) {
    return new Promise((resolve, reject) => {
      const modal = document.createElement('div');
      modal.id = 'quizPasswordModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
          <div class="modal-header">
            <h2><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> 需要密碼</h2>
          </div>
          <div class="modal-body">
            <p>此測驗需要輸入密碼才能開始</p>
            <div class="form-group">
              <input type="password" id="quizPasswordInput" placeholder="輸入測驗密碼" onkeypress="if(event.key==='Enter') document.getElementById('submitQuizPassword').click()">
            </div>
            <p id="passwordError" class="error-text" style="display: none; color: var(--terracotta-dark);">密碼錯誤，請重試</p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('quizPasswordModal'); MoodleUI.quizPasswordReject && MoodleUI.quizPasswordReject();">取消</button>
            <button id="submitQuizPassword" class="btn-primary" onclick="MoodleUI.verifyQuizPassword('${quizId}')">確認</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      this.quizPasswordResolve = resolve;
      this.quizPasswordReject = reject;

      setTimeout(() => document.getElementById('quizPasswordInput').focus(), 100);
    });
  },

  /**
   * 驗證測驗密碼
   */
  async verifyQuizPassword(quizId) {
    const password = document.getElementById('quizPasswordInput').value;
    if (!password) {
      document.getElementById('passwordError').style.display = 'block';
      document.getElementById('passwordError').textContent = '請輸入密碼';
      return;
    }

    try {
      const result = await API.quizzes.antiCheat.verifyPassword(quizId, password);
      if (result.success && result.data.valid) {
        this.closeModal('quizPasswordModal');
        if (this.quizPasswordResolve) {
          this.quizPasswordResolve(true);
        }
      } else {
        document.getElementById('passwordError').style.display = 'block';
        document.getElementById('passwordError').textContent = '密碼錯誤，請重試';
      }
    } catch (error) {
      console.error('Verify password error:', error);
      document.getElementById('passwordError').style.display = 'block';
      document.getElementById('passwordError').textContent = '驗證失敗，請重試';
    }
  },

  /**
   * 開啟監控報告（教師）
   */
  async openProctoringReport(quizId, attemptId) {
    try {
      const result = await API.quizzes.antiCheat.getProctoringReport(quizId, attemptId);
      if (!result.success) {
        showToast('載入監控報告失敗');
        return;
      }

      const report = result.data;
      const riskClass = report.riskLevel === 'high' ? 'risk-high' :
                        report.riskLevel === 'medium' ? 'risk-medium' : 'risk-low';

      const modal = document.createElement('div');
      modal.id = 'proctoringReportModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content proctoring-report-modal">
          <div class="modal-header">
            <h2><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> 監控報告</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('proctoringReportModal')">×</button>
          </div>
          <div class="modal-body">
            <div class="proctoring-summary">
              <div class="risk-badge ${riskClass}">
                ${report.riskLevel === 'high' ? '高風險' : report.riskLevel === 'medium' ? '中等風險' : '低風險'}
              </div>
              <div class="suspicious-score">
                可疑分數: <strong>${report.suspiciousScore || 0}</strong>
              </div>
            </div>

            <div class="proctoring-stats">
              <h4>行為統計</h4>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-label">切換分頁</span>
                  <span class="stat-value">${report.tabSwitches || 0} 次</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">視窗失焦</span>
                  <span class="stat-value">${report.focusLossCount || 0} 次</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">複製嘗試</span>
                  <span class="stat-value">${report.copyAttempts || 0} 次</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">貼上嘗試</span>
                  <span class="stat-value">${report.pasteAttempts || 0} 次</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">右鍵嘗試</span>
                  <span class="stat-value">${report.rightClickAttempts || 0} 次</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">全螢幕離開</span>
                  <span class="stat-value">${report.fullscreenExits || 0} 次</span>
                </div>
              </div>
            </div>

            ${report.flags && report.flags.length > 0 ? `
              <div class="proctoring-flags">
                <h4>警告標記</h4>
                <ul>
                  ${report.flags.map(f => `<li class="flag-item">${f}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${report.screenshots && report.screenshots.length > 0 ? `
              <div class="proctoring-screenshots">
                <h4>視訊截圖 (${report.screenshots.length} 張)</h4>
                <div class="screenshots-grid">
                  ${report.screenshots.slice(0, 6).map((s, i) => `
                    <div class="screenshot-item" onclick="MoodleUI.viewScreenshot('${s.url}')">
                      <img src="${s.url}" alt="截圖 ${i + 1}">
                      <span class="screenshot-time">${MoodleUI.formatDate(s.timestamp, 'time')}</span>
                    </div>
                  `).join('')}
                </div>
                ${report.screenshots.length > 6 ? `<p class="more-screenshots">還有 ${report.screenshots.length - 6} 張截圖...</p>` : ''}
              </div>
            ` : ''}

            ${report.events && report.events.length > 0 ? `
              <div class="proctoring-events">
                <h4>事件時間軸</h4>
                <div class="events-timeline">
                  ${report.events.slice(0, 20).map(e => `
                    <div class="event-item">
                      <span class="event-time">${MoodleUI.formatDate(e.timestamp, 'time')}</span>
                      <span class="event-type">${this.getEventTypeName(e.type)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('proctoringReportModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Load proctoring report error:', error);
      showToast('載入監控報告失敗');
    }
  },

  /**
   * 獲取事件類型名稱
   */
  getEventTypeName(type) {
    const names = {
      'tab_switch': '切換分頁',
      'focus_loss': '視窗失焦',
      'copy_attempt': '複製嘗試',
      'paste_attempt': '貼上嘗試',
      'right_click_attempt': '右鍵嘗試',
      'fullscreen_exit': '離開全螢幕',
      'devtools_attempt': '開發者工具',
      'webcam_denied': '拒絕視訊',
      'screenshot_captured': '擷取截圖'
    };
    return names[type] || type;
  },

  /**
   * 查看截圖大圖
   */
  viewScreenshot(url) {
    const modal = document.createElement('div');
    modal.id = 'screenshotViewModal';
    modal.className = 'modal-overlay active';
    modal.style.background = 'rgba(0,0,0,0.9)';
    modal.innerHTML = `
      <div class="screenshot-view">
        <button class="modal-close" onclick="MoodleUI.closeModal('screenshotViewModal')" style="position: fixed; top: 20px; right: 20px; color: white; font-size: 36px; background: none; border: none; cursor: pointer;">×</button>
        <img src="${url}" style="max-width: 90vw; max-height: 90vh; object-fit: contain;">
      </div>
    `;
    modal.onclick = (e) => {
      if (e.target === modal) this.closeModal('screenshotViewModal');
    };
    document.body.appendChild(modal);
  },

  // ===== 審計日誌系統 =====

  /**
   * 開啟審計日誌管理界面（管理員）
   */
  async openAuditLogs() {
    const container = document.getElementById('auditLogsContent');
    if (!container) return;

    container.innerHTML = `
      <div class="audit-logs-page">
        <div class="page-header">
          <h1>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            系統審計日誌
          </h1>
          <div class="header-actions">
            <button class="btn-secondary" onclick="MoodleUI.exportAuditLogs()">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              匯出 CSV
            </button>
            <button class="btn-secondary" onclick="MoodleUI.showAuditStats()">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              查看統計
            </button>
          </div>
        </div>

        <div class="audit-filters">
          <div class="filter-row">
            <div class="filter-group">
              <label>事件類型</label>
              <select id="auditEventType" onchange="MoodleUI.loadAuditLogs()">
                <option value="">全部</option>
                <optgroup label="用戶">
                  <option value="user_login">登入</option>
                  <option value="user_logout">登出</option>
                  <option value="user_register">註冊</option>
                  <option value="user_update">更新資料</option>
                  <option value="user_delete">刪除用戶</option>
                </optgroup>
                <optgroup label="課程">
                  <option value="course_create">建立課程</option>
                  <option value="course_update">更新課程</option>
                  <option value="course_delete">刪除課程</option>
                  <option value="course_enroll">報名課程</option>
                  <option value="course_unenroll">退出課程</option>
                </optgroup>
                <optgroup label="作業">
                  <option value="assignment_create">建立作業</option>
                  <option value="assignment_submit">提交作業</option>
                  <option value="assignment_grade">評分作業</option>
                </optgroup>
                <optgroup label="測驗">
                  <option value="quiz_create">建立測驗</option>
                  <option value="quiz_attempt_start">開始測驗</option>
                  <option value="quiz_attempt_submit">提交測驗</option>
                </optgroup>
                <optgroup label="系統">
                  <option value="system_config_update">更新設定</option>
                  <option value="role_create">建立角色</option>
                  <option value="role_update">更新角色</option>
                  <option value="data_export">資料匯出</option>
                  <option value="bulk_operation">批量操作</option>
                </optgroup>
                <optgroup label="安全">
                  <option value="security_failed_login">登入失敗</option>
                  <option value="security_suspicious_activity">可疑活動</option>
                </optgroup>
              </select>
            </div>
            <div class="filter-group">
              <label>嚴重等級</label>
              <select id="auditSeverity" onchange="MoodleUI.loadAuditLogs()">
                <option value="">全部</option>
                <option value="info">一般</option>
                <option value="warning">警告</option>
                <option value="error">錯誤</option>
                <option value="critical">嚴重</option>
              </select>
            </div>
            <div class="filter-group">
              <label>開始日期</label>
              <input type="date" id="auditStartDate" onchange="MoodleUI.loadAuditLogs()">
            </div>
            <div class="filter-group">
              <label>結束日期</label>
              <input type="date" id="auditEndDate" onchange="MoodleUI.loadAuditLogs()">
            </div>
            <div class="filter-group">
              <label>搜尋</label>
              <input type="text" id="auditSearch" placeholder="搜尋用戶、描述..." onkeyup="if(event.key==='Enter') MoodleUI.searchAuditLogs()">
            </div>
            <button class="btn-primary" onclick="MoodleUI.searchAuditLogs()">搜尋</button>
          </div>
        </div>

        <div class="audit-logs-container" id="auditLogsContainer">
          <div class="loading">載入中...</div>
        </div>
      </div>
    `;

    // 設定預設日期範圍（最近 7 天）
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    document.getElementById('auditEndDate').value = endDate.toISOString().split('T')[0];
    document.getElementById('auditStartDate').value = startDate.toISOString().split('T')[0];

    await this.loadAuditLogs();
  },

  /**
   * 載入審計日誌
   */
  async loadAuditLogs() {
    const container = document.getElementById('auditLogsContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading">載入中...</div>';

    try {
      const filters = {
        eventType: document.getElementById('auditEventType')?.value || '',
        severity: document.getElementById('auditSeverity')?.value || '',
        startDate: document.getElementById('auditStartDate')?.value || '',
        endDate: document.getElementById('auditEndDate')?.value || '',
        limit: 100
      };

      const result = await API.auditLogs.list(filters);

      if (!result.success) {
        container.innerHTML = '<div class="empty-state">載入審計日誌失敗</div>';
        return;
      }

      const logs = result.data.logs || [];

      if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state">沒有找到審計日誌</div>';
        return;
      }

      container.innerHTML = `
        <table class="data-table audit-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>用戶</th>
              <th>事件類型</th>
              <th>目標</th>
              <th>說明</th>
              <th>等級</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr class="severity-${log.severity}">
                <td class="log-time">${MoodleUI.formatDate(log.createdAt, 'datetime')}</td>
                <td class="log-user">
                  <span class="user-name">${log.userName || '-'}</span>
                  <span class="user-email">${log.userEmail || ''}</span>
                </td>
                <td class="log-event">
                  <span class="event-badge ${this.getEventCategory(log.eventType)}">${this.getEventTypeName(log.eventType)}</span>
                </td>
                <td class="log-target">${log.targetName || log.targetType || '-'}</td>
                <td class="log-desc">${log.description || '-'}</td>
                <td class="log-severity">
                  <span class="severity-badge ${log.severity}">${this.getSeverityName(log.severity)}</span>
                </td>
                <td class="log-ip">${log.ipAddress || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${result.data.lastKey ? `
          <div class="load-more">
            <button class="btn-secondary" onclick="MoodleUI.loadMoreAuditLogs('${result.data.lastKey}')">載入更多</button>
          </div>
        ` : ''}
      `;
    } catch (error) {
      console.error('Load audit logs error:', error);
      container.innerHTML = '<div class="empty-state">載入審計日誌失敗</div>';
    }
  },

  /**
   * 搜尋審計日誌
   */
  async searchAuditLogs() {
    const query = document.getElementById('auditSearch')?.value?.trim();
    if (!query) {
      return this.loadAuditLogs();
    }

    const container = document.getElementById('auditLogsContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading">搜尋中...</div>';

    try {
      const filters = {
        startDate: document.getElementById('auditStartDate')?.value || '',
        endDate: document.getElementById('auditEndDate')?.value || ''
      };

      const result = await API.auditLogs.search(query, filters);

      if (!result.success || !result.data.logs.length) {
        container.innerHTML = '<div class="empty-state">沒有找到符合的日誌</div>';
        return;
      }

      const logs = result.data.logs;
      container.innerHTML = `
        <div class="search-results-info">找到 ${logs.length} 筆結果</div>
        <table class="data-table audit-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>用戶</th>
              <th>事件類型</th>
              <th>目標</th>
              <th>說明</th>
              <th>等級</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr class="severity-${log.severity}">
                <td class="log-time">${MoodleUI.formatDate(log.createdAt, 'datetime')}</td>
                <td class="log-user">
                  <span class="user-name">${log.userName || '-'}</span>
                  <span class="user-email">${log.userEmail || ''}</span>
                </td>
                <td class="log-event">
                  <span class="event-badge ${this.getEventCategory(log.eventType)}">${this.getEventTypeName(log.eventType)}</span>
                </td>
                <td class="log-target">${log.targetName || log.targetType || '-'}</td>
                <td class="log-desc">${log.description || '-'}</td>
                <td class="log-severity">
                  <span class="severity-badge ${log.severity}">${this.getSeverityName(log.severity)}</span>
                </td>
                <td class="log-ip">${log.ipAddress || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (error) {
      console.error('Search audit logs error:', error);
      container.innerHTML = '<div class="empty-state">搜尋失敗</div>';
    }
  },

  /**
   * 獲取事件類型名稱
   */
  getAuditEventTypeName(type) {
    const names = {
      'user_login': '用戶登入',
      'user_logout': '用戶登出',
      'user_register': '用戶註冊',
      'user_update': '更新資料',
      'user_delete': '刪除用戶',
      'user_password_change': '修改密碼',
      'course_create': '建立課程',
      'course_update': '更新課程',
      'course_delete': '刪除課程',
      'course_enroll': '報名課程',
      'course_unenroll': '退出課程',
      'course_role_assign': '分配角色',
      'assignment_create': '建立作業',
      'assignment_update': '更新作業',
      'assignment_submit': '提交作業',
      'assignment_grade': '評分作業',
      'quiz_create': '建立測驗',
      'quiz_update': '更新測驗',
      'quiz_attempt_start': '開始測驗',
      'quiz_attempt_submit': '提交測驗',
      'grade_update': '更新成績',
      'grade_override': '覆蓋成績',
      'grade_export': '匯出成績',
      'file_upload': '上傳檔案',
      'file_download': '下載檔案',
      'file_delete': '刪除檔案',
      'system_config_update': '更新設定',
      'role_create': '建立角色',
      'role_update': '更新角色',
      'role_delete': '刪除角色',
      'security_failed_login': '登入失敗',
      'security_suspicious_activity': '可疑活動',
      'data_export': '資料匯出',
      'bulk_operation': '批量操作'
    };
    return names[type] || type;
  },

  /**
   * 獲取事件類別
   */
  getEventCategory(type) {
    if (type.startsWith('user_')) return 'category-user';
    if (type.startsWith('course_')) return 'category-course';
    if (type.startsWith('assignment_')) return 'category-assignment';
    if (type.startsWith('quiz_')) return 'category-quiz';
    if (type.startsWith('grade_')) return 'category-grade';
    if (type.startsWith('file_')) return 'category-file';
    if (type.startsWith('security_')) return 'category-security';
    if (type.startsWith('system_') || type.startsWith('role_')) return 'category-system';
    return 'category-other';
  },

  /**
   * 獲取嚴重等級名稱
   */
  getSeverityName(severity) {
    const names = {
      'info': '一般',
      'warning': '警告',
      'error': '錯誤',
      'critical': '嚴重'
    };
    return names[severity] || severity;
  },

  /**
   * 顯示審計統計
   */
  async showAuditStats() {
    try {
      const result = await API.auditLogs.getStats(30);

      if (!result.success) {
        showToast('載入統計失敗');
        return;
      }

      const stats = result.data;

      const modal = document.createElement('div');
      modal.id = 'auditStatsModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content audit-stats-modal" style="max-width: 800px;">
          <div class="modal-header">
            <h2>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              審計日誌統計（${stats.period}）
            </h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('auditStatsModal')">×</button>
          </div>
          <div class="modal-body">
            <div class="stats-overview">
              <div class="stat-card">
                <span class="stat-number">${stats.totalLogs}</span>
                <span class="stat-label">總事件數</span>
              </div>
              <div class="stat-card severity-info">
                <span class="stat-number">${stats.severityCounts.info || 0}</span>
                <span class="stat-label">一般</span>
              </div>
              <div class="stat-card severity-warning">
                <span class="stat-number">${stats.severityCounts.warning || 0}</span>
                <span class="stat-label">警告</span>
              </div>
              <div class="stat-card severity-error">
                <span class="stat-number">${stats.severityCounts.error || 0}</span>
                <span class="stat-label">錯誤</span>
              </div>
              <div class="stat-card severity-critical">
                <span class="stat-number">${stats.severityCounts.critical || 0}</span>
                <span class="stat-label">嚴重</span>
              </div>
            </div>

            <div class="stats-sections">
              <div class="stats-section">
                <h4>熱門事件類型</h4>
                <div class="top-events">
                  ${stats.topEvents.map(e => `
                    <div class="event-row">
                      <span class="event-name">${this.getAuditEventTypeName(e.type)}</span>
                      <span class="event-count">${e.count}</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="stats-section">
                <h4>最活躍用戶</h4>
                <div class="top-users">
                  ${stats.topUsers.map(u => `
                    <div class="user-row">
                      <span class="user-name">${u.userName || '未知用戶'}</span>
                      <span class="user-count">${u.count} 筆</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <div class="daily-chart">
              <h4>每日事件趨勢</h4>
              <div class="chart-bars">
                ${Object.entries(stats.dailyCounts).slice(-14).map(([date, count]) => {
                  const maxCount = Math.max(...Object.values(stats.dailyCounts));
                  const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return `
                    <div class="chart-bar-container">
                      <div class="chart-bar" style="height: ${height}%" title="${date}: ${count}"></div>
                      <span class="chart-label">${date.slice(5)}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('auditStatsModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Show audit stats error:', error);
      showToast('載入統計失敗');
    }
  },

  /**
   * 匯出審計日誌
   */
  async exportAuditLogs() {
    try {
      const filters = {
        eventType: document.getElementById('auditEventType')?.value || '',
        startDate: document.getElementById('auditStartDate')?.value || '',
        endDate: document.getElementById('auditEndDate')?.value || ''
      };

      // 獲取當前 token
      const token = localStorage.getItem('authToken');
      const url = API.auditLogs.exportLogs(filters, 'csv');

      // 創建隱藏的 iframe 來下載
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url + `&token=${token}`;
      document.body.appendChild(iframe);

      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 5000);

      showToast('正在匯出審計日誌...');
    } catch (error) {
      console.error('Export audit logs error:', error);
      showToast('匯出失敗');
    }
  },

  /**
   * 開啟測驗監控摘要（教師）
   */
  async openProctoringsSummary(quizId) {
    try {
      const result = await API.quizzes.antiCheat.getProctoringsSummary(quizId);
      if (!result.success) {
        showToast('載入監控摘要失敗');
        return;
      }

      const summary = result.data;

      const modal = document.createElement('div');
      modal.id = 'proctoringsSummaryModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content proctoring-summary-modal" style="max-width: 900px;">
          <div class="modal-header">
            <h2><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 測驗監控摘要</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('proctoringsSummaryModal')">×</button>
          </div>
          <div class="modal-body">
            <div class="summary-overview">
              <div class="summary-stat">
                <span class="stat-number">${summary.totalAttempts || 0}</span>
                <span class="stat-label">總作答數</span>
              </div>
              <div class="summary-stat risk-high">
                <span class="stat-number">${summary.highRiskCount || 0}</span>
                <span class="stat-label">高風險</span>
              </div>
              <div class="summary-stat risk-medium">
                <span class="stat-number">${summary.mediumRiskCount || 0}</span>
                <span class="stat-label">中等風險</span>
              </div>
              <div class="summary-stat risk-low">
                <span class="stat-number">${summary.lowRiskCount || 0}</span>
                <span class="stat-label">低風險</span>
              </div>
            </div>

            <div class="attempts-table-container">
              <table class="data-table proctoring-table">
                <thead>
                  <tr>
                    <th>學生</th>
                    <th>嘗試時間</th>
                    <th>分數</th>
                    <th>風險等級</th>
                    <th>可疑分數</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${(summary.attempts || []).map(a => {
                    const riskClass = a.riskLevel === 'high' ? 'risk-high' :
                                      a.riskLevel === 'medium' ? 'risk-medium' : 'risk-low';
                    return `
                      <tr>
                        <td>${a.studentName || '未知'}</td>
                        <td>${MoodleUI.formatDate(a.startedAt, 'datetime')}</td>
                        <td>${a.score !== undefined ? a.score : '-'}</td>
                        <td><span class="risk-badge ${riskClass}">${a.riskLevel === 'high' ? '高' : a.riskLevel === 'medium' ? '中' : '低'}</span></td>
                        <td>${a.suspiciousScore || 0}</td>
                        <td>
                          <button class="btn-sm btn-secondary" onclick="MoodleUI.openProctoringReport('${quizId}', '${a.attemptId}')">
                            查看詳情
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('proctoringsSummaryModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Load proctoring summary error:', error);
      showToast('載入監控摘要失敗');
    }
  },

  // ==================== SCORM 管理 ====================

  /**
   * 開啟 SCORM 管理頁面
   */
  async openScormManager() {
    const container = document.getElementById('scormManagerContent');
    if (!container) return;

    container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>載入 SCORM 內容中...</p></div>';

    try {
      const result = await API.scorm.list();
      const packages = result.success ? result.data : [];

      container.innerHTML = `
        <div class="scorm-manager-page">
          <div class="page-header">
            <h1>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              SCORM 學習包管理
            </h1>
            <div class="header-actions">
              <button class="btn-primary" onclick="MoodleUI.openCreateScormModal()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新增 SCORM 包
              </button>
            </div>
          </div>

          <div class="scorm-info-banner">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <p>SCORM（Sharable Content Object Reference Model）是電子學習內容的國際標準，支援 SCORM 1.2 和 SCORM 2004 格式。</p>
          </div>

          <div class="scorm-list">
            ${packages.length === 0 ? `
              <div class="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                <h3>尚無 SCORM 學習包</h3>
                <p>點擊「新增 SCORM 包」開始上傳您的 SCORM 內容</p>
              </div>
            ` : packages.map(pkg => `
              <div class="scorm-card" data-package-id="${pkg.packageId}">
                <div class="scorm-card-header">
                  <div class="scorm-icon">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  </div>
                  <div class="scorm-info">
                    <h3>${pkg.name}</h3>
                    <span class="scorm-version">${pkg.version === 'scorm_2004' ? 'SCORM 2004' : 'SCORM 1.2'}</span>
                  </div>
                  <span class="status-badge ${pkg.status}">${pkg.status === 'active' ? '啟用中' : '已停用'}</span>
                </div>
                <p class="scorm-description">${pkg.description || '無描述'}</p>
                <div class="scorm-meta">
                  <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg> 最大嘗試: ${pkg.maxAttempts || '無限制'}</span>
                  <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg> ${MoodleUI.formatDate(pkg.createdAt)}</span>
                </div>
                <div class="scorm-actions">
                  <button class="btn-secondary btn-sm" onclick="MoodleUI.launchScorm('${pkg.packageId}')">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    啟動
                  </button>
                  <button class="btn-secondary btn-sm" onclick="MoodleUI.viewScormReport('${pkg.packageId}')">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    報告
                  </button>
                  <button class="btn-secondary btn-sm" onclick="MoodleUI.editScorm('${pkg.packageId}')">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    編輯
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Load SCORM packages error:', error);
      container.innerHTML = '<div class="error-state"><p>載入 SCORM 內容失敗</p></div>';
    }
  },

  /**
   * 開啟新增 SCORM 模態框
   */
  openCreateScormModal() {
    const modal = document.createElement('div');
    modal.id = 'createScormModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h2>新增 SCORM 學習包</h2>
          <button class="modal-close" onclick="MoodleUI.closeModal('createScormModal')">&times;</button>
        </div>
        <div class="modal-body">
          <form id="createScormForm">
            <div class="form-group">
              <label>名稱 <span class="required">*</span></label>
              <input type="text" name="name" required placeholder="輸入 SCORM 包名稱">
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea name="description" rows="3" placeholder="輸入描述"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>SCORM 版本</label>
                <select name="version">
                  <option value="scorm_2004">SCORM 2004</option>
                  <option value="scorm_1.2">SCORM 1.2</option>
                </select>
              </div>
              <div class="form-group">
                <label>最大嘗試次數</label>
                <input type="number" name="maxAttempts" value="0" min="0" placeholder="0 = 無限制">
              </div>
            </div>
            <div class="form-group">
              <label>入口 URL <span class="required">*</span></label>
              <input type="url" name="entryUrl" required placeholder="https://example.com/scorm/index.html">
            </div>
            <div class="form-group">
              <label>計分方式</label>
              <select name="gradingMethod">
                <option value="highest">最高分</option>
                <option value="average">平均分</option>
                <option value="first">首次嘗試</option>
                <option value="last">最後嘗試</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="MoodleUI.closeModal('createScormModal')">取消</button>
          <button class="btn-primary" onclick="MoodleUI.saveScorm()">儲存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  /**
   * 儲存 SCORM 包
   */
  async saveScorm() {
    const form = document.getElementById('createScormForm');
    const formData = new FormData(form);

    const data = {
      name: formData.get('name'),
      description: formData.get('description'),
      version: formData.get('version'),
      maxAttempts: parseInt(formData.get('maxAttempts')) || 0,
      entryUrl: formData.get('entryUrl'),
      gradingMethod: formData.get('gradingMethod')
    };

    try {
      const result = await API.scorm.create(data);
      if (result.success) {
        showToast('SCORM 包創建成功');
        this.closeModal('createScormModal');
        this.openScormManager();
      } else {
        showToast(result.message || '創建失敗');
      }
    } catch (error) {
      console.error('Save SCORM error:', error);
      showToast('創建失敗');
    }
  },

  /**
   * 啟動 SCORM 包
   */
  async launchScorm(packageId) {
    try {
      const result = await API.scorm.launch(packageId);
      if (result.success) {
        const { launchUrl, params } = result.data;

        // 創建表單並提交
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = launchUrl;
        form.target = '_blank';

        Object.entries(params).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      } else {
        showToast(result.message || '啟動失敗');
      }
    } catch (error) {
      console.error('Launch SCORM error:', error);
      showToast('啟動失敗');
    }
  },

  /**
   * 查看 SCORM 報告
   */
  async viewScormReport(packageId) {
    try {
      const result = await API.scorm.getReport(packageId);
      if (!result.success) {
        showToast('載入報告失敗');
        return;
      }

      const { stats, attempts } = result.data;

      const modal = document.createElement('div');
      modal.id = 'scormReportModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
          <div class="modal-header">
            <h2>SCORM 報告</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('scormReportModal')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value">${stats.totalAttempts}</div>
                <div class="stat-label">總嘗試次數</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${stats.uniqueUsers}</div>
                <div class="stat-label">參與人數</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${stats.completionRate}%</div>
                <div class="stat-label">完成率</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${stats.averageScore}</div>
                <div class="stat-label">平均分數</div>
              </div>
            </div>

            <h3 style="margin: 1.5rem 0 1rem;">最近嘗試</h3>
            <table class="data-table">
              <thead>
                <tr>
                  <th>用戶</th>
                  <th>狀態</th>
                  <th>分數</th>
                  <th>時間</th>
                  <th>日期</th>
                </tr>
              </thead>
              <tbody>
                ${attempts.slice(0, 10).map(a => `
                  <tr>
                    <td>${a.userId}</td>
                    <td><span class="status-badge ${a.status}">${a.status}</span></td>
                    <td>${a.score !== null ? a.score : '-'}</td>
                    <td>${Math.round((a.totalTime || 0) / 60)} 分鐘</td>
                    <td>${MoodleUI.formatDate(a.startedAt, 'datetime')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('scormReportModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('View SCORM report error:', error);
      showToast('載入報告失敗');
    }
  },

  // ==================== LTI 管理 ====================

  /**
   * 開啟 LTI 外部工具管理頁面
   */
  async openLtiManager() {
    const container = document.getElementById('ltiManagerContent');
    if (!container) return;

    container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>載入外部工具中...</p></div>';

    try {
      const result = await API.lti.getTools();
      const tools = result.success ? result.data : [];

      container.innerHTML = `
        <div class="lti-manager-page">
          <div class="page-header">
            <h1>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              LTI 外部工具
            </h1>
            <div class="header-actions">
              <button class="btn-secondary" onclick="MoodleUI.showLtiConfig()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                平台配置
              </button>
              <button class="btn-primary" onclick="MoodleUI.openCreateLtiModal()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新增外部工具
              </button>
            </div>
          </div>

          <div class="lti-info-banner">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <p>LTI（Learning Tools Interoperability）允許您整合第三方學習工具，如 Turnitin、Khan Academy、Google Docs 等。</p>
          </div>

          <div class="lti-tools-grid">
            ${tools.length === 0 ? `
              <div class="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <h3>尚無外部工具</h3>
                <p>點擊「新增外部工具」開始整合第三方學習工具</p>
              </div>
            ` : tools.map(tool => `
              <div class="lti-tool-card" data-tool-id="${tool.toolId}">
                <div class="tool-icon">
                  ${tool.iconUrl ? `<img src="${tool.iconUrl}" alt="${tool.name}">` : `
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                    </svg>
                  `}
                </div>
                <div class="tool-info">
                  <h3>${tool.name}</h3>
                  <p>${tool.description || '無描述'}</p>
                  <div class="tool-meta">
                    <span class="lti-version">LTI ${tool.version}</span>
                    <span class="status-badge ${tool.status}">${tool.status === 'active' ? '啟用' : '停用'}</span>
                    ${tool.isGlobal ? '<span class="global-badge">全站</span>' : ''}
                  </div>
                </div>
                <div class="tool-actions">
                  <button class="btn-primary btn-sm" onclick="MoodleUI.launchLtiTool('${tool.toolId}')">啟動</button>
                  <button class="btn-secondary btn-sm" onclick="MoodleUI.editLtiTool('${tool.toolId}')">編輯</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Load LTI tools error:', error);
      container.innerHTML = '<div class="error-state"><p>載入外部工具失敗</p></div>';
    }
  },

  /**
   * 顯示 LTI 平台配置
   */
  async showLtiConfig() {
    try {
      const result = await API.lti.getConfig();
      if (!result.success) {
        showToast('載入配置失敗');
        return;
      }

      const config = result.data;

      const modal = document.createElement('div');
      modal.id = 'ltiConfigModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
          <div class="modal-header">
            <h2>LTI 平台配置</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('ltiConfigModal')">&times;</button>
          </div>
          <div class="modal-body">
            <p style="color: var(--gray-600); margin-bottom: 1rem;">將以下資訊提供給外部工具提供商進行配置：</p>

            <div class="config-section">
              <h4>平台資訊</h4>
              <div class="config-item">
                <label>平台名稱</label>
                <div class="config-value">${config.platform.name}</div>
              </div>
              <div class="config-item">
                <label>平台 GUID</label>
                <div class="config-value">${config.platform.guid}</div>
              </div>
            </div>

            <div class="config-section">
              <h4>LTI 1.1 端點</h4>
              <div class="config-item">
                <label>啟動 URL</label>
                <div class="config-value copyable" onclick="MoodleUI.copyToClipboard('${config.lti11.launchUrl}')">${config.lti11.launchUrl}</div>
              </div>
              <div class="config-item">
                <label>成績回傳 URL</label>
                <div class="config-value copyable" onclick="MoodleUI.copyToClipboard('${config.lti11.outcomesUrl}')">${config.lti11.outcomesUrl}</div>
              </div>
            </div>

            <div class="config-section">
              <h4>LTI 1.3 端點</h4>
              <div class="config-item">
                <label>發行者 (Issuer)</label>
                <div class="config-value copyable" onclick="MoodleUI.copyToClipboard('${config.lti13.issuer}')">${config.lti13.issuer}</div>
              </div>
              <div class="config-item">
                <label>JWKS URI</label>
                <div class="config-value copyable" onclick="MoodleUI.copyToClipboard('${config.lti13.jwksUri}')">${config.lti13.jwksUri}</div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('ltiConfigModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Show LTI config error:', error);
      showToast('載入配置失敗');
    }
  },

  /**
   * 開啟新增 LTI 工具模態框
   */
  openCreateLtiModal() {
    const modal = document.createElement('div');
    modal.id = 'createLtiModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h2>新增外部工具</h2>
          <button class="modal-close" onclick="MoodleUI.closeModal('createLtiModal')">&times;</button>
        </div>
        <div class="modal-body">
          <form id="createLtiForm">
            <div class="form-group">
              <label>工具名稱 <span class="required">*</span></label>
              <input type="text" name="name" required placeholder="例如：Turnitin">
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea name="description" rows="2" placeholder="工具描述"></textarea>
            </div>
            <div class="form-group">
              <label>工具 URL <span class="required">*</span></label>
              <input type="url" name="toolUrl" required placeholder="https://tool.example.com/lti">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>LTI 版本</label>
                <select name="version">
                  <option value="1.3">LTI 1.3</option>
                  <option value="1.1">LTI 1.1</option>
                </select>
              </div>
              <div class="form-group">
                <label>隱私級別</label>
                <select name="privacyLevel">
                  <option value="anonymous">匿名</option>
                  <option value="name">僅姓名</option>
                  <option value="email">包含 Email</option>
                  <option value="public">完整資訊</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>啟動方式</label>
              <select name="launchContainer">
                <option value="window">新視窗</option>
                <option value="embed">嵌入頁面</option>
                <option value="iframe">iFrame</option>
              </select>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" name="allowGradePassback" checked>
                允許成績回傳
              </label>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="MoodleUI.closeModal('createLtiModal')">取消</button>
          <button class="btn-primary" onclick="MoodleUI.saveLtiTool()">儲存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  /**
   * 儲存 LTI 工具
   */
  async saveLtiTool() {
    const form = document.getElementById('createLtiForm');
    const formData = new FormData(form);

    const data = {
      name: formData.get('name'),
      description: formData.get('description'),
      toolUrl: formData.get('toolUrl'),
      version: formData.get('version'),
      privacyLevel: formData.get('privacyLevel'),
      launchContainer: formData.get('launchContainer'),
      allowGradePassback: form.querySelector('[name="allowGradePassback"]').checked
    };

    try {
      const result = await API.lti.createTool(data);
      if (result.success) {
        showToast('外部工具創建成功');
        this.closeModal('createLtiModal');
        this.openLtiManager();
      } else {
        showToast(result.message || '創建失敗');
      }
    } catch (error) {
      console.error('Save LTI tool error:', error);
      showToast('創建失敗');
    }
  },

  /**
   * 啟動 LTI 工具
   */
  async launchLtiTool(toolId) {
    try {
      const result = await API.lti.launch(toolId);
      if (result.success) {
        const { launchUrl, params, launchContainer } = result.data;

        if (launchContainer === 'window') {
          // 創建表單並在新視窗提交
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = launchUrl;
          form.target = '_blank';

          Object.entries(params).forEach(([key, value]) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value;
            form.appendChild(input);
          });

          document.body.appendChild(form);
          form.submit();
          document.body.removeChild(form);
        } else {
          showToast('嵌入式啟動暫不支援');
        }
      } else {
        showToast(result.message || '啟動失敗');
      }
    } catch (error) {
      console.error('Launch LTI tool error:', error);
      showToast('啟動失敗');
    }
  },

  // ==================== H5P 管理 ====================

  /**
   * 開啟 H5P 互動內容管理頁面
   */
  async openH5pManager() {
    const container = document.getElementById('h5pManagerContent');
    if (!container) return;

    container.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>載入 H5P 內容中...</p></div>';

    try {
      const [contentsResult, typesResult] = await Promise.all([
        API.h5p.list(),
        API.h5p.getTypes()
      ]);

      const contents = contentsResult.success ? contentsResult.data : [];
      const types = typesResult.success ? typesResult.data : [];

      container.innerHTML = `
        <div class="h5p-manager-page">
          <div class="page-header">
            <h1>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              H5P 互動內容
            </h1>
            <div class="header-actions">
              <button class="btn-primary" onclick="MoodleUI.openCreateH5pModal()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                創建 H5P 內容
              </button>
            </div>
          </div>

          <div class="h5p-info-banner">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <p>H5P 是一個開源的互動內容創建工具，支援互動影片、測驗、簡報、遊戲等多種內容類型。</p>
          </div>

          <div class="h5p-type-filter">
            <span>內容類型：</span>
            <select id="h5pTypeFilter" onchange="MoodleUI.filterH5pContent()">
              <option value="">全部</option>
              ${types.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>

          <div class="h5p-contents-grid">
            ${contents.length === 0 ? `
              <div class="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                  <polyline points="2 17 12 22 22 17"/>
                  <polyline points="2 12 12 17 22 12"/>
                </svg>
                <h3>尚無 H5P 內容</h3>
                <p>點擊「創建 H5P 內容」開始製作互動學習內容</p>
              </div>
            ` : contents.map(content => `
              <div class="h5p-content-card" data-content-id="${content.contentId}" data-type="${content.contentType}">
                <div class="h5p-card-preview">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                    <polyline points="2 17 12 22 22 17"/>
                    <polyline points="2 12 12 17 22 12"/>
                  </svg>
                </div>
                <div class="h5p-card-body">
                  <h3>${content.title}</h3>
                  <span class="h5p-type-badge">${this.getH5pTypeName(content.contentType)}</span>
                  <p>${content.description || '無描述'}</p>
                  <div class="h5p-card-meta">
                    <span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${content.viewCount || 0}</span>
                    <span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> ${content.attemptCount || 0}</span>
                  </div>
                </div>
                <div class="h5p-card-actions">
                  <button class="btn-primary btn-sm" onclick="MoodleUI.previewH5p('${content.contentId}')">預覽</button>
                  <button class="btn-secondary btn-sm" onclick="MoodleUI.editH5p('${content.contentId}')">編輯</button>
                  <button class="btn-secondary btn-sm" onclick="MoodleUI.viewH5pReport('${content.contentId}')">報告</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Load H5P contents error:', error);
      container.innerHTML = '<div class="error-state"><p>載入 H5P 內容失敗</p></div>';
    }
  },

  /**
   * 獲取 H5P 類型名稱
   */
  getH5pTypeName(type) {
    const typeNames = {
      'H5P.InteractiveVideo': '互動影片',
      'H5P.CoursePresentation': '課程簡報',
      'H5P.QuestionSet': '題組測驗',
      'H5P.DragQuestion': '拖放問答',
      'H5P.Blanks': '填空題',
      'H5P.MarkTheWords': '標記詞彙',
      'H5P.MultiChoice': '選擇題',
      'H5P.TrueFalse': '是非題',
      'H5P.DragText': '拖放文字',
      'H5P.Summary': '摘要活動',
      'H5P.Timeline': '時間軸',
      'H5P.ImageHotspots': '圖片熱點',
      'H5P.Accordion': '手風琴',
      'H5P.Dialogcards': '對話卡片',
      'H5P.Flashcards': '閃卡',
      'H5P.MemoryGame': '記憶遊戲',
      'H5P.BranchingScenario': '分支情境',
      'H5P.ThreeImage': '虛擬導覽',
      'H5P.Column': '內容組合'
    };
    return typeNames[type] || type.replace('H5P.', '');
  },

  /**
   * 開啟創建 H5P 模態框
   */
  async openCreateH5pModal() {
    let types = [];
    try {
      const result = await API.h5p.getTypes();
      types = result.success ? result.data : [];
    } catch (error) {
      console.error('Load H5P types error:', error);
    }

    const modal = document.createElement('div');
    modal.id = 'createH5pModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h2>創建 H5P 互動內容</h2>
          <button class="modal-close" onclick="MoodleUI.closeModal('createH5pModal')">&times;</button>
        </div>
        <div class="modal-body">
          <form id="createH5pForm">
            <div class="form-group">
              <label>標題 <span class="required">*</span></label>
              <input type="text" name="title" required placeholder="輸入內容標題">
            </div>
            <div class="form-group">
              <label>內容類型 <span class="required">*</span></label>
              <select name="contentType" required>
                <option value="">選擇內容類型</option>
                ${types.map(t => `<option value="${t.id}">${t.name} - ${t.description}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea name="description" rows="3" placeholder="輸入內容描述"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>最高分數</label>
                <input type="number" name="maxScore" min="0" placeholder="自動計算">
              </div>
              <div class="form-group">
                <label>嵌入方式</label>
                <select name="embedType">
                  <option value="iframe">iFrame</option>
                  <option value="div">Div 容器</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" name="showFrame" checked>
                顯示框架
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="showCopyright" checked>
                顯示版權資訊
              </label>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="MoodleUI.closeModal('createH5pModal')">取消</button>
          <button class="btn-primary" onclick="MoodleUI.saveH5p()">創建</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  /**
   * 儲存 H5P 內容
   */
  async saveH5p() {
    const form = document.getElementById('createH5pForm');
    const formData = new FormData(form);

    const data = {
      title: formData.get('title'),
      contentType: formData.get('contentType'),
      description: formData.get('description'),
      maxScore: formData.get('maxScore') ? parseInt(formData.get('maxScore')) : null,
      embedType: formData.get('embedType'),
      showFrame: form.querySelector('[name="showFrame"]').checked,
      showCopyright: form.querySelector('[name="showCopyright"]').checked
    };

    if (!data.title || !data.contentType) {
      showToast('請填寫必填欄位');
      return;
    }

    try {
      const result = await API.h5p.create(data);
      if (result.success) {
        showToast('H5P 內容創建成功');
        this.closeModal('createH5pModal');
        this.openH5pManager();
      } else {
        showToast(result.message || '創建失敗');
      }
    } catch (error) {
      console.error('Save H5P error:', error);
      showToast('創建失敗');
    }
  },

  /**
   * 預覽 H5P 內容
   */
  async previewH5p(contentId) {
    try {
      const result = await API.h5p.getEmbed(contentId);
      if (result.success) {
        const { embedUrl, embedCode } = result.data;

        const modal = document.createElement('div');
        modal.id = 'h5pPreviewModal';
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
          <div class="modal-content" style="max-width: 900px; height: 80vh;">
            <div class="modal-header">
              <h2>H5P 預覽</h2>
              <button class="modal-close" onclick="MoodleUI.closeModal('h5pPreviewModal')">&times;</button>
            </div>
            <div class="modal-body" style="height: calc(100% - 120px); padding: 0;">
              <iframe src="${embedUrl}" style="width: 100%; height: 100%; border: none;"></iframe>
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" onclick="MoodleUI.copyToClipboard(\`${embedCode.replace(/`/g, '\\`')}\`); showToast('嵌入代碼已複製');">複製嵌入代碼</button>
              <button class="btn-secondary" onclick="MoodleUI.closeModal('h5pPreviewModal')">關閉</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        // 記錄瀏覽
        API.h5p.recordView(contentId);
      } else {
        showToast('載入預覽失敗');
      }
    } catch (error) {
      console.error('Preview H5P error:', error);
      showToast('載入預覽失敗');
    }
  },

  /**
   * 查看 H5P 報告
   */
  async viewH5pReport(contentId) {
    try {
      const result = await API.h5p.getReport(contentId);
      if (!result.success) {
        showToast('載入報告失敗');
        return;
      }

      const { content, stats, recentAttempts } = result.data;

      const modal = document.createElement('div');
      modal.id = 'h5pReportModal';
      modal.className = 'modal-overlay active';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
          <div class="modal-header">
            <h2>${content.title} - 報告</h2>
            <button class="modal-close" onclick="MoodleUI.closeModal('h5pReportModal')">&times;</button>
          </div>
          <div class="modal-body">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value">${stats.totalAttempts}</div>
                <div class="stat-label">總嘗試次數</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${stats.uniqueUsers}</div>
                <div class="stat-label">參與人數</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${Math.round(stats.averageScore * 100)}%</div>
                <div class="stat-label">平均分數</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${stats.completionRate}%</div>
                <div class="stat-label">完成率</div>
              </div>
            </div>

            <h3 style="margin: 1.5rem 0 1rem;">分數分佈</h3>
            <div class="score-distribution">
              ${Object.entries(stats.scoreDistribution).map(([range, count]) => `
                <div class="distribution-bar">
                  <span class="range">${range}%</span>
                  <div class="bar-container">
                    <div class="bar" style="width: ${stats.totalAttempts ? (count / stats.totalAttempts * 100) : 0}%"></div>
                  </div>
                  <span class="count">${count}</span>
                </div>
              `).join('')}
            </div>

            <h3 style="margin: 1.5rem 0 1rem;">最近嘗試</h3>
            <table class="data-table">
              <thead>
                <tr>
                  <th>用戶</th>
                  <th>分數</th>
                  <th>完成</th>
                  <th>時間</th>
                </tr>
              </thead>
              <tbody>
                ${recentAttempts.map(a => `
                  <tr>
                    <td>${a.userId}</td>
                    <td>${a.scaledScore !== null ? Math.round(a.scaledScore * 100) + '%' : '-'}</td>
                    <td>${a.completed ? '是' : '否'}</td>
                    <td>${new Date(a.createdAt).toLocaleString('zh-TW')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="MoodleUI.closeModal('h5pReportModal')">關閉</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('View H5P report error:', error);
      showToast('載入報告失敗');
    }
  },

  /**
   * 過濾 H5P 內容
   */
  filterH5pContent() {
    const filter = document.getElementById('h5pTypeFilter').value;
    const cards = document.querySelectorAll('.h5p-content-card');

    cards.forEach(card => {
      if (!filter || card.dataset.type === filter) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  },

  /**
   * 複製到剪貼簿
   */
  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('已複製到剪貼簿');
    }).catch(() => {
      showToast('複製失敗');
    });
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
