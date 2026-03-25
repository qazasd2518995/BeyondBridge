/**
 * BeyondBridge Platform App
 * 主應用程式 - 處理認證狀態和資料載入
 */

const App = {
  // 當前用戶資料
  currentUser: null,

  // 資料緩存
  resourcesCache: [],
  coursesCache: [],
  licensesCache: [],
  activitiesCache: [],
  consultationsCache: [],
  discussionsCache: [],

  getCurrentUser() {
    return this.currentUser || API.getCurrentUser();
  },

  syncCurrentUserState(user) {
    if (!user) return null;
    this.currentUser = user;
    API.setCurrentUser(user);
    return user;
  },

  isAdminUser(user = this.getCurrentUser()) {
    return !!(user && (user.isAdmin || user.role === 'admin'));
  },

  isStudentUser(user = this.getCurrentUser()) {
    return !!(user && user.role === 'student');
  },

  isTeachingUser(user = this.getCurrentUser()) {
    if (!user) return false;
    if (this.isAdminUser(user)) return true;
    return ['manager', 'coursecreator', 'educator', 'trainer', 'creator', 'teacher', 'assistant'].includes(user.role);
  },

  clampProgressValue(value) {
    if (window.PlatformUIRuntime?.clampProgressValue) {
      return window.PlatformUIRuntime.clampProgressValue(value);
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, numeric));
  },

  applyProgressData(root = document) {
    if (window.PlatformUIRuntime?.applyProgressWidths) {
      window.PlatformUIRuntime.applyProgressWidths(root);
      return;
    }
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[data-progress-width]').forEach((node) => {
      node.style.width = `${this.clampProgressValue(node.dataset.progressWidth)}%`;
    });
  },

  /**
   * 初始化應用程式
   */
  async init() {
    console.log('BeyondBridge Platform initializing...');

    // 檢查認證狀態
    if (API.isLoggedIn()) {
      try {
        // 驗證 token 有效性
        const result = await API.auth.me();
        if (result.success) {
          this.syncCurrentUserState(result.data);
          this.showApp();
          await this.loadDashboardData();
          // 觸發登入事件，通知聊天系統初始化
          window.dispatchEvent(new CustomEvent('userLoggedIn'));
        } else {
          this.showLogin();
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        this.showLogin();
      }
    } else {
      this.showLogin();
    }
  },

  /**
   * 顯示登入頁面
   */
  showLogin() {
    document.getElementById('loginView').hidden = false;
    document.getElementById('appContainer').hidden = true;
    if (window.PlatformRouter?.renderAuthScreen) {
      window.PlatformRouter.renderAuthScreen();
    }
  },

  /**
   * 顯示主應用程式
   */
  showApp() {
    document.getElementById('loginView').hidden = true;
    this.updateUserUI();
    this.updateSidebarByRole();
    document.getElementById('appContainer').hidden = false;
    if (window.PlatformRouter?.applyCurrentRoute) {
      window.PlatformRouter.applyCurrentRoute({ replace: true }).catch((error) => {
        console.error('Apply platform route error:', error);
        if (typeof window.showView === 'function') {
          window.showView('dashboard', { replaceHistory: true });
        }
      });
      return;
    }
    if (typeof window.showView === 'function') {
      window.showView('dashboard', { replaceHistory: true });
    }
  },

  /**
   * 根據用戶角色更新側邊欄
   */
  updateSidebarByRole() {
    const user = this.currentUser || API.getCurrentUser();
    if (!user) return;

    const isStudent = this.isStudentUser(user);
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    // 定義建橋者（教師/教育者）側邊欄 - 優化版
    const educatorSidebar = `
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.teachingCenter')}</div>
        <a href="#" class="nav-item active" data-view="dashboard" onclick="navigateTo(this, 'dashboard')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
          ${t('nav.dashboard')}
        </a>
        <a href="#" class="nav-item" data-view="moodleCourses" onclick="showView('moodleCourses'); MoodleUI.loadCourses();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
          </svg>
          ${t('nav.myCourses')}
        </a>
        <a href="#" class="nav-item" data-view="classes" onclick="navigateTo(this, 'classes')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          ${t('nav.myStudents')}
        </a>
        <a href="#" class="nav-item" data-view="moodleCalendar" onclick="showView('moodleCalendar'); MoodleUI.loadCalendar();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${t('nav.calendar')}
        </a>
        <a href="#" class="nav-item" data-view="moodleNotifications" onclick="showView('moodleNotifications'); MoodleUI.loadNotifications();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          ${t('nav.notifications')}
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.teachingActivities')}</div>
        <a href="#" class="nav-item" data-view="moodleAssignments" onclick="showView('moodleAssignments'); MoodleUI.loadAssignments();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          ${t('nav.assignments')}
        </a>
        <a href="#" class="nav-item" data-view="moodleQuizzes" onclick="showView('moodleQuizzes'); MoodleUI.loadQuizzes();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          ${t('nav.quizzes')}
        </a>
        <a href="#" class="nav-item" data-view="questionBank" onclick="showView('questionBank'); MoodleUI.openQuestionBank();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"/>
            <path d="M9 9h6M9 13h3"/>
            <circle cx="16" cy="13" r="1"/>
          </svg>
          ${t('nav.questionBank')}
        </a>
        <a href="#" class="nav-item" data-view="moodleForums" onclick="showView('moodleForums'); MoodleUI.loadForums();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          ${t('nav.forums')}
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.gradesAndAssessment')}</div>
        <a href="#" class="nav-item" data-view="moodleGradebook" onclick="showView('moodleGradebook'); MoodleUI.loadGradebook();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          ${t('nav.gradebook')}
        </a>
        <a href="#" class="nav-item" data-view="rubrics" onclick="showView('rubrics'); MoodleUI.openRubricsManager();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18"/>
            <path d="M3 15h18"/>
            <path d="M9 3v18"/>
            <path d="M15 3v18"/>
          </svg>
          ${t('nav.rubrics')}
        </a>
        <a href="#" class="nav-item" data-view="badges" onclick="showView('badges'); MoodleUI.openBadges();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="6"/>
            <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
          </svg>
          ${t('nav.badges')}
        </a>
        <a href="#" class="nav-item" data-view="teacherAnalytics" onclick="showView('teacherAnalytics'); MoodleUI.openTeacherAnalytics();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          ${t('nav.analytics')}
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.resources')}</div>
        <a href="#" class="nav-item" data-view="library" onclick="navigateTo(this, 'library')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          ${t('nav.library')}
        </a>
        <a href="#" class="nav-item" data-view="licenses" onclick="navigateTo(this, 'licenses')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10,9 9,9 8,9"/>
          </svg>
          ${t('nav.licenses')}
        </a>
        <a href="#" class="nav-item" data-view="moodleFiles" onclick="showView('moodleFiles');">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          ${t('nav.myResources')}
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.courseSettings')}</div>
        <a href="#" class="nav-item" data-view="courseCompletionSettings" onclick="showView('courseCompletionSettings'); MoodleUI.openCourseCompletionSettings();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
          ${t('nav.completionConditions')}
        </a>
        <a href="#" class="nav-item" data-view="learningProgress" onclick="showView('learningProgress'); MoodleUI.openLearningProgress();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 20V10"/>
            <path d="M12 20V4"/>
            <path d="M6 20v-6"/>
            <path d="M18 10l-6-6-6 6"/>
          </svg>
          ${t('nav.learningProgress')}
        </a>
        <a href="#" class="nav-item" data-view="courses" onclick="navigateTo(this, 'courses')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12,2 2,7 12,12 22,7"/>
            <polyline points="2,17 12,22 22,17"/>
            <polyline points="2,12 12,17 22,12"/>
          </svg>
          ${t('nav.classManagement')}
        </a>
        <a href="#" class="nav-item" data-view="groupsManager" onclick="showView('groupsManager');">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          ${t('nav.groupManagement')}
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.settings')}</div>
        <a href="#" class="nav-item" data-view="settings" onclick="navigateTo(this, 'settings')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          ${t('nav.personalSettings')}
        </a>
        <a href="#" class="nav-item" data-view="logout" onclick="navigateTo(this, 'logout')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          ${t('nav.logout')}
        </a>
      </div>
      <div class="nav-section sidebar-locale-section">
        <a href="#" class="nav-item sidebar-locale-link" onclick="event.preventDefault(); I18n.setLocale(I18n.getLocale() === 'zh-TW' ? 'en' : 'zh-TW');">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sidebar-locale-icon">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          </svg>
          ${t('lang.toggle')}
        </a>
      </div>
    `;

    // 定義探橋者（學生）側邊欄 - 簡化版
    const studentSidebar = `
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.learningCenter')}</div>
        <a href="#" class="nav-item active" data-view="dashboard" onclick="navigateTo(this, 'dashboard')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
          ${t('nav.learnerDashboard')}
        </a>
        <a href="#" class="nav-item" data-view="moodleCourses" onclick="showView('moodleCourses'); MoodleUI.loadCourses();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
          </svg>
          ${t('nav.enrolledCourses')}
        </a>
        <a href="#" class="nav-item" data-view="moodleCalendar" onclick="showView('moodleCalendar'); MoodleUI.loadCalendar();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${t('nav.learnerCalendar')}
        </a>
        <a href="#" class="nav-item" data-view="moodleNotifications" onclick="showView('moodleNotifications'); MoodleUI.loadNotifications();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          ${t('nav.learnerNotifications')}
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.learningTasks')}</div>
        <a href="#" class="nav-item" data-view="moodleAssignments" onclick="showView('moodleAssignments'); MoodleUI.loadAssignments();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          ${t('nav.pendingAssignments')}
        </a>
        <a href="#" class="nav-item" data-view="moodleQuizzes" onclick="showView('moodleQuizzes'); MoodleUI.loadQuizzes();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          ${t('nav.pendingQuizzes')}
        </a>
        <a href="#" class="nav-item" data-view="moodleForums" onclick="showView('moodleForums'); MoodleUI.loadForums();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          ${t('nav.classDiscussions')}
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.learningOutcomes')}</div>
        <a href="#" class="nav-item" data-view="moodleGradebook" onclick="showView('moodleGradebook'); MoodleUI.loadGradebook();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          ${t('nav.myGrades')}
        </a>
        <a href="#" class="nav-item" data-view="badges" onclick="showView('badges'); MoodleUI.openBadges();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="6"/>
            <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
          </svg>
          ${t('nav.myBadges')}
        </a>
        <a href="#" class="nav-item" data-view="learningProgress" onclick="showView('learningProgress'); MoodleUI.openLearningProgress();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 20V10"/>
            <path d="M12 20V4"/>
            <path d="M6 20v-6"/>
            <path d="M18 10l-6-6-6 6"/>
          </svg>
          ${t('nav.learningProgress')}
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.settings')}</div>
        <a href="#" class="nav-item" data-view="settings" onclick="navigateTo(this, 'settings')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          ${t('nav.personalSettings')}
        </a>
        <a href="#" class="nav-item" data-view="logout" onclick="navigateTo(this, 'logout')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          ${t('nav.logout')}
        </a>
      </div>
      <div class="nav-section sidebar-locale-section">
        <a href="#" class="nav-item sidebar-locale-link" onclick="event.preventDefault(); I18n.setLocale(I18n.getLocale() === 'zh-TW' ? 'en' : 'zh-TW');">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sidebar-locale-icon">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          </svg>
          ${t('lang.toggle')}
        </a>
      </div>
    `;

    // 管理員專用區塊
    const adminSection = `
      <div class="nav-section">
        <div class="nav-section-title">${t('nav.systemAdmin')}</div>
        <a href="#" class="nav-item" data-view="rolesManagement" onclick="showView('rolesManagement'); MoodleUI.openRolesManagement();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          ${t('nav.rolesPermissions')}
        </a>
        <a href="#" class="nav-item" data-view="courseCategories" onclick="showView('courseCategories'); MoodleUI.openCourseCategories();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            <path d="M12 11v6M9 14h6"/>
          </svg>
          ${t('nav.courseCategories')}
        </a>
        <a href="#" class="nav-item" data-view="auditLogs" onclick="showView('auditLogs'); MoodleUI.openAuditLogs();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <path d="M14 2v6h6"/>
            <path d="M16 13H8M16 17H8M10 9H8"/>
          </svg>
          ${t('admin.nav.auditLogs')}
        </a>
        <a href="#" class="nav-item" data-view="scormManager" onclick="showView('scormManager'); MoodleUI.openScormManager();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          ${t('admin.nav.scorm')}
        </a>
        <a href="#" class="nav-item" data-view="ltiManager" onclick="showView('ltiManager'); MoodleUI.openLtiManager();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          ${t('admin.nav.lti')}
        </a>
        <a href="#" class="nav-item" data-view="h5pManager" onclick="showView('h5pManager'); MoodleUI.openH5pManager();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
            <path d="M7 8h2v6H7zM11 8h2v6h-2zM15 8h2v6h-2"/>
          </svg>
          ${t('admin.nav.h5p')}
        </a>
        <a href="#" class="nav-item" onclick="window.location.href='/admin';">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="9"/>
            <rect x="14" y="3" width="7" height="5"/>
            <rect x="14" y="12" width="7" height="9"/>
            <rect x="3" y="16" width="7" height="5"/>
          </svg>
          ${t('nav.adminPanel')}
        </a>
      </div>
    `;

    const isAdmin = this.isAdminUser(user);

    if (isStudent) {
      sidebar.innerHTML = studentSidebar;
    } else {
      // 教師側邊欄，如果是管理員則添加系統管理區塊
      sidebar.innerHTML = isAdmin ? (educatorSidebar + adminSection) : educatorSidebar;
    }
  },

  /**
   * 更新用戶介面資訊
   */
  renderProfileAvatar(container, user, fallbackText) {
    if (!container) return;

    const label = fallbackText || t('app.user');
    const initial = (label || t('app.user')).trim().charAt(0) || t('app.user').charAt(0);
    const avatarUrl = user?.avatarUrl;

    container.replaceChildren();
    container.classList.toggle('has-image', Boolean(avatarUrl));

    if (avatarUrl) {
      const image = document.createElement('img');
      image.className = 'profile-avatar-image';
      image.alt = label;
      image.src = avatarUrl;
      image.addEventListener('error', () => {
        container.classList.remove('has-image');
        container.textContent = initial;
      }, { once: true });
      container.appendChild(image);
      return;
    }

    container.textContent = initial;
  },

  /**
   * 更新用戶介面資訊
   */
  updateUserUI() {
    const user = this.currentUser || API.getCurrentUser();
    if (!user) return;

    // 更新側邊欄用戶資訊
    const userName = document.querySelector('.user-name');
    const userRole = document.querySelector('.user-role');
    const userAvatar = document.querySelector('.user-avatar');

    if (userName) userName.textContent = user.displayName || user.displayNameZh || t('app.user');
    if (userRole) {
      const roleMap = {
        'educator': t('role.educator'),
        'trainer': t('role.trainer'),
        'creator': t('role.creator'),
        'manager': t('role.manager'),
        'coursecreator': t('role.coursecreator'),
        'teacher': t('role.teacher'),
        'assistant': t('role.assistant'),
        'admin': t('role.admin'),
        'student': t('role.student')
      };
      userRole.textContent = roleMap[user.role] || user.role || t('role.default');
    }
    if (userAvatar) {
      const avatarLabel = user.displayNameZh || user.displayName || t('app.user');
      this.renderProfileAvatar(userAvatar, user, avatarLabel);
    }

    // 更新設定頁面
    this.updateSettingsUI(user);
  },

  /**
   * 更新設定頁面的用戶資料
   */
  updateSettingsUI(user) {
    const settingsView = document.getElementById('settingsView');
    if (!settingsView) return;

    // 更新個人資料表單（使用正確的 ID）
    const nameInput = document.getElementById('settingsName');
    if (nameInput) nameInput.value = user.displayName || user.displayNameZh || '';

    const emailInput = document.getElementById('settingsEmail');
    if (emailInput) emailInput.value = user.email || '';

    const orgInput = document.getElementById('settingsOrganization');
    if (orgInput) orgInput.value = user.organization || '';

    const roleSelect = document.getElementById('settingsRole');
    if (roleSelect) roleSelect.value = user.role || 'educator';

    // 更新通知設定
    const prefs = user.preferences || {};
    const notifications = prefs.notifications || {};

    const notifyNewMaterial = document.getElementById('notifyNewMaterial');
    if (notifyNewMaterial) notifyNewMaterial.checked = notifications.newMaterial !== false;

    const notifyProgress = document.getElementById('notifyProgress');
    if (notifyProgress) notifyProgress.checked = notifications.progress !== false;

    const notifyExpiry = document.getElementById('notifyExpiry');
    if (notifyExpiry) notifyExpiry.checked = notifications.expiry !== false;

    const notifyEmail = document.getElementById('notifyEmail');
    if (notifyEmail) notifyEmail.checked = notifications.email === true;

    // 更新頂部 banner
    const heroInitial = document.getElementById('settingsProfileInitial');
    const heroName = document.getElementById('settingsProfileName');
    const heroEmail = document.getElementById('settingsProfileEmail');
    const heroTier = document.getElementById('settingsHeroTier');
    const heroJoinDate = document.getElementById('settingsHeroJoinDate');
    const heroLicense = document.getElementById('settingsHeroLicense');

    if (heroInitial) {
      this.renderProfileAvatar(heroInitial, user, user.displayName || user.displayNameZh || t('app.user'));
    }
    if (heroName) heroName.textContent = user.displayName || user.displayNameZh || t('app.user');
    if (heroEmail) heroEmail.textContent = user.email || '';
    if (heroTier) {
      heroTier.innerHTML = `<span class="settings-hero-meta-label">${t('settings.memberLevel')}</span><strong class="settings-hero-meta-value">${user.subscriptionTier === 'professional' ? t('settings.tierPro') : user.subscriptionTier === 'basic' ? t('settings.tierBasic') : t('settings.tierFree')}</strong>`;
    }
    if (heroJoinDate) {
      heroJoinDate.innerHTML = `<span class="settings-hero-meta-label">${t('settings.joinDate')}</span><strong class="settings-hero-meta-value">${this.formatLocaleDate(user.createdAt)}</strong>`;
    }
    if (heroLicense) {
      heroLicense.innerHTML = `<span class="settings-hero-meta-label">${t('settings.licenseQuota')}</span><strong class="settings-hero-meta-value">${user.licenseUsed || 0}/${user.licenseQuota || 0}</strong>`;
    }
  },

  /**
   * 更新通知設定
   */
  async updateNotificationSettings(settings) {
    const user = API.getCurrentUser();
    if (!user) return false;

    try {
      const preferences = user.preferences || {};
      preferences.notifications = settings;

      const result = await API.users.update(user.userId, { preferences });
      if (result.success) {
        const updatedUser = this.syncCurrentUserState({ ...user, preferences });
        showToast(t('toast.notificationUpdated'));
        return true;
      } else {
        showToast(result.message || t('toast.updateFailed'));
        return false;
      }
    } catch (error) {
      console.error('Update notification settings error:', error);
      showToast(t('toast.updateFailed'));
      return false;
    }
  },

  /**
   * 載入儀表板資料
   */
  async loadDashboardData() {
    try {
      const user = API.getCurrentUser();
      const isStudent = this.isStudentUser(user);

      // 並行載入各項資料
      const promises = [
        this.loadAnnouncements(),
        this.loadResources()
      ];

      // 如果有用戶 ID，載入更多資料
      if (user && user.userId) {
        promises.push(this.loadUserStats(user.userId));
        promises.push(this.loadUserCourses(user.userId));
        promises.push(this.loadUserActivities(user.userId));
        promises.push(this.loadUserLicenses(user.userId));

        // 學生專屬資料
        if (isStudent) {
          promises.push(this.loadUpcomingDeadlines(user.userId));
          promises.push(this.loadRecentBadges(user.userId));
          promises.push(this.loadWeeklyStats(user.userId));
        }
      }

      await Promise.all(promises);

      // 根據角色顯示/隱藏儀表板區塊
      const isTeacher = this.isTeachingUser(user);
      this.updateDashboardLayout(isStudent, isTeacher);

      // 教師專屬數據載入
      if (isTeacher) {
        await this.loadTeacherDashboardData();
      }
    } catch (error) {
      console.error('Load dashboard data error:', error);
    }
  },

  /**
   * 根據角色更新儀表板布局
   */
  updateDashboardLayout(isStudent, isTeacher) {
    const studentDashboard = document.getElementById('dashboardView');
    const teacherDashboard = document.getElementById('teacherDashboardView');
    const urgentSection = document.getElementById('urgentDeadlinesSection');
    const achievementsCard = document.getElementById('recentAchievementsCard');

    // 根據角色顯示對應的儀表板
    if (isTeacher) {
      if (studentDashboard) studentDashboard.hidden = true;
      if (teacherDashboard) teacherDashboard.hidden = false;
    } else {
      if (studentDashboard) studentDashboard.hidden = false;
      if (teacherDashboard) teacherDashboard.hidden = true;
    }

    // 學生專屬區塊
    if (urgentSection) {
      urgentSection.hidden = !isStudent;
    }
    if (achievementsCard) {
      achievementsCard.hidden = !isStudent;
    }
  },

  /**
   * 載入即將截止的任務（作業和測驗）
   */
  async loadUpcomingDeadlines(userId) {
    try {
      // 載入作業和測驗
      const [assignmentsRes, quizzesRes] = await Promise.all([
        API.assignments.list(),
        API.quizzes.list()
      ]);

      const now = new Date();
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const deadlines = [];

      // 處理作業截止日期
      if (assignmentsRes.success && assignmentsRes.data) {
        assignmentsRes.data.forEach(assignment => {
          if (!assignment.dueDate) return;

          const dueDate = new Date(assignment.dueDate);
          const submitted = Boolean(
            assignment.submitted === true ||
            assignment.submissionStatus?.submitted === true ||
            assignment.submission?.submitted === true ||
            assignment.submission?.submittedAt
          );

          if (dueDate > now && dueDate <= sevenDaysLater && !submitted) {
            deadlines.push({
              type: 'assignment',
              title: assignment.title,
              dueDate,
              courseTitle: assignment.courseTitle || assignment.courseName || '',
              id: assignment.assignmentId
            });
          }
        });
      }

      // 處理測驗截止日期
      if (quizzesRes.success && quizzesRes.data) {
        quizzesRes.data.forEach(quiz => {
          const dueDateValue = quiz.closeDate || quiz.endDate || quiz.dueDate;
          if (!dueDateValue) return;

          const dueDate = new Date(dueDateValue);
          const completed = Boolean(
            quiz.completed === true ||
            quiz.userStatus?.lastAttemptAt ||
            (quiz.userStatus?.bestScore !== undefined && quiz.userStatus?.bestScore !== null)
          );

          if (dueDate > now && dueDate <= sevenDaysLater && !completed) {
            deadlines.push({
              type: 'quiz',
              title: quiz.title,
              dueDate,
              courseTitle: quiz.courseTitle || quiz.courseName || '',
              id: quiz.quizId
            });
          }
        });
      }

      // 按截止日期排序
      deadlines.sort((a, b) => a.dueDate - b.dueDate);

      this.updateDeadlinesUI(deadlines);
    } catch (error) {
      console.error('Load upcoming deadlines error:', error);
    }
  },

  /**
   * 更新即將截止區塊的 UI
   */
  updateDeadlinesUI(deadlines) {
    const deadlineList = document.getElementById('deadlineList');
    const deadlineCount = document.querySelector('.deadline-count');

    if (deadlineCount) {
      deadlineCount.textContent = `${deadlines.length} ${t('app.items')}`;
    }

    if (!deadlineList) return;

    if (deadlines.length === 0) {
      deadlineList.innerHTML = this.renderDashboardEmptyState(t('dashboard.noUrgentTasks'));
      return;
    }

    deadlineList.innerHTML = deadlines.slice(0, 5).map(item => {
      const daysLeft = Math.ceil((item.dueDate - new Date()) / (1000 * 60 * 60 * 24));
      const urgencyClass = daysLeft <= 2 ? 'urgent' : daysLeft <= 4 ? 'warning' : 'normal';
      const toneClass = urgencyClass === 'urgent' ? 'tone-terracotta' : urgencyClass === 'warning' ? 'tone-sand' : 'tone-olive';
      const icon = item.type === 'assignment'
        ? `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line>`
        : `<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>`;
      const viewName = item.type === 'assignment' ? 'moodleAssignments' : 'moodleQuizzes';
      const loadCall = item.type === 'assignment' ? 'loadAssignments' : 'loadQuizzes';
      const typeLabel = item.type === 'assignment' ? t('app.assignment') : t('app.quiz');
      const safeTitle = this.escapeText(item.title || typeLabel);
      const safeCourseTitle = item.courseTitle ? this.escapeText(item.courseTitle) : '';
      const dayLabel = daysLeft === 0 ? t('app.today') : daysLeft === 1 ? t('app.tomorrow') : t('app.daysLater', { days: daysLeft });
      const dueDateLabel = this.formatLocaleMonthDay(item.dueDate);
      const metaItems = [
        safeCourseTitle ? `<span class="dashboard-row-meta-item">${safeCourseTitle}</span>` : '',
        `<span class="dashboard-row-meta-item">${this.escapeText(typeLabel)}</span>`
      ].filter(Boolean).join('');

      return `
        <button type="button" class="dashboard-row-card interactive" onclick="showView('${viewName}'); if (typeof MoodleUI !== 'undefined' && MoodleUI.${loadCall}) { MoodleUI.${loadCall}(); }">
          <div class="dashboard-row-icon ${toneClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${icon}
            </svg>
          </div>
          <div class="dashboard-row-body">
            <div class="dashboard-row-kicker">${this.escapeText(typeLabel)}</div>
            <div class="dashboard-row-title">${safeTitle}</div>
            <div class="dashboard-row-meta">
              ${metaItems}
            </div>
          </div>
          <div class="dashboard-row-side">
            <div class="dashboard-row-emphasis ${toneClass}">${this.escapeText(dayLabel)}</div>
            <div class="dashboard-row-note">${this.escapeText(dueDateLabel)}</div>
          </div>
        </button>
      `;
    }).join('');
  },

  /**
   * 載入最近獲得的徽章
   */
  async loadRecentBadges(userId) {
    try {
      const result = await API.badges.getUserBadges(userId);
      if (result.success && result.data) {
        const badges = Array.isArray(result.data) ? result.data : (result.data.badges || []);
        this.updateRecentBadgesUI(badges.slice(0, 4));
      }
    } catch (error) {
      console.error('Load recent badges error:', error);
    }
  },

  /**
   * 更新最近徽章的 UI
   */
  updateRecentBadgesUI(badges) {
    const badgesList = document.getElementById('recentBadgesList');
    const badgeCountStat = document.getElementById('statBadgeCount');

    if (badgeCountStat) {
      badgeCountStat.textContent = badges.length;
    }

    if (!badgesList) return;

    if (badges.length === 0) {
      badgesList.innerHTML = this.renderDashboardEmptyState(t('dashboard.earnBadges'), {
        iconMarkup: `
          <circle cx="12" cy="8" r="6"></circle>
          <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"></path>
        `
      });
      return;
    }

    const badgeTones = ['tone-gold', 'tone-silver', 'tone-copper', 'tone-success', 'tone-blue', 'tone-olive'];

    badgesList.innerHTML = `<div class="dashboard-badge-grid">${badges.map((badge, index) => `
      <div class="dashboard-badge-card">
        <div class="dashboard-badge-icon ${badgeTones[index % badgeTones.length]}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="6"></circle>
            <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"></path>
          </svg>
        </div>
        <div class="dashboard-badge-caption">${this.escapeText(I18n.getLocale() === 'en' ? 'Recently earned' : '最近獲得')}</div>
        <div class="dashboard-badge-name">${this.escapeText(badge.name || badge.badgeName || t('app.badge'))}</div>
        <div class="dashboard-badge-meta">${this.escapeText(badge.courseName || badge.issuerName || (I18n.getLocale() === 'en' ? 'Achievement' : '成就徽章'))}</div>
      </div>
    `).join('')}</div>`;
  },

  /**
   * 載入本週學習統計
   */
  async loadWeeklyStats(userId) {
    try {
      const result = await API.users.getStats(userId);
      if (result.success && result.data) {
        this.updateWeeklyStatsUI(result.data);
      }
    } catch (error) {
      console.error('Load weekly stats error:', error);
    }
  },

  /**
   * 更新本週學習統計 UI
   */
  updateWeeklyStatsUI(stats) {
    // 更新統計卡片
    const courseCount = document.getElementById('statCourseCount');
    const completionRate = document.getElementById('statCompletionRate');
    const studyHours = document.getElementById('statStudyHours');

    if (courseCount) courseCount.textContent = stats.coursesInProgress || 0;
    if (completionRate) completionRate.textContent = `${stats.avgCompletion || 0}%`;
    if (studyHours) studyHours.textContent = `${Math.round((stats.weeklyStudyMinutes || 0) / 60)}h`;

    // 更新週統計
    const weeklyCompleted = document.getElementById('weeklyCompletedItems');
    const weeklyMinutes = document.getElementById('weeklyStudyMinutes');
    const weeklyDays = document.getElementById('weeklyLoginDays');
    const weeklyScore = document.getElementById('weeklyQuizScore');

    if (weeklyCompleted) weeklyCompleted.textContent = stats.weeklyCompletedItems || 0;
    if (weeklyMinutes) weeklyMinutes.textContent = stats.weeklyStudyMinutes || 0;
    if (weeklyDays) weeklyDays.textContent = stats.consecutiveLoginDays || 0;
    if (weeklyScore) weeklyScore.textContent = stats.avgQuizScore ? `${stats.avgQuizScore}%` : '-';
  },

  /**
   * 載入教師儀表板數據
   */
  async loadTeacherDashboardData() {
    try {
      const [dashboardRes, coursesRes, alertsRes] = await Promise.all([
        API.teachers.getDashboard(),
        API.courses.getMyCourses('instructor'),
        API.teachers.getAlerts()
      ]);

      if (!dashboardRes.success) {
        throw new Error(dashboardRes.message || 'Load teacher dashboard failed');
      }

      const dashboard = dashboardRes.data || {};
      const courseStats = Array.isArray(dashboard.courses) ? dashboard.courses : [];
      const myCourses = coursesRes.success && Array.isArray(coursesRes.data) ? coursesRes.data : [];
      const statsMap = new Map(courseStats.map(course => [course.courseId, course]));
      let mergedCourses = myCourses.map(course => ({ ...course, ...(statsMap.get(course.courseId) || {}) }));
      if (mergedCourses.length === 0 && courseStats.length > 0) {
        mergedCourses = courseStats;
      }

      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value ?? 0);
      };

      const pendingAssignments = Number(dashboard.pendingAssignments) || 0;
      const pendingQuizzes = Number(dashboard.pendingQuizzes) || 0;
      const pendingForums = Number(dashboard.unrepliedPosts) || 0;
      const pendingNotifications = Number(dashboard.pendingNotifications) || 0;
      const totalStudents = Number(dashboard.totalStudents) || 0;
      const totalCourses = Number(dashboard.totalCourses) || mergedCourses.length || 0;
      const avgProgress = Number(dashboard.avgProgress) || 0;
      const weeklySubmissions = Number(dashboard.weeklySubmissions) || 0;
      const pendingGrading = pendingAssignments + pendingQuizzes;

      setText('pendingAssignments', pendingAssignments);
      setText('pendingQuizzes', pendingQuizzes);
      setText('pendingForums', pendingForums);
      setText('pendingNotifications', pendingNotifications);

      setText('teacherTotalStudents', totalStudents);
      setText('teacherActiveCourses', totalCourses);
      setText('teacherAvgProgress', `${avgProgress}%`);
      setText('teacherWeeklySubmissions', weeklySubmissions);

      setText('teacherPendingGrading', pendingGrading);
      setText('teacherStudentCount', totalStudents);
      setText('teacherCourseCount', totalCourses);

      this.updateTeacherCourseList(mergedCourses);
      this.updateGradingQueueUI(dashboard.gradingQueue || []);
      this.updateRecentSubmissionsUI(dashboard.recentSubmissions || []);

      const allAlerts = alertsRes.success && Array.isArray(alertsRes.data) ? alertsRes.data : [];
      this.updateStudentAlertsUI(allAlerts.slice(0, 5), allAlerts.length);
    } catch (error) {
      console.error('Load teacher dashboard data error:', error);
      this.updateGradingQueueUI([]);
      this.updateStudentAlertsUI([]);
      this.updateRecentSubmissionsUI([]);
    }
  },

  /**
   * 更新教師課程列表
   */
  updateTeacherCourseList(courses) {
    const courseList = document.getElementById('teacherCourseList');
    if (!courseList) return;

    if (courses.length === 0) {
      courseList.innerHTML = this.renderDashboardEmptyState(t('teacher.noCourses'), {
        iconMarkup: `
          <polygon points="12,2 2,7 12,12 22,7"></polygon>
          <polyline points="2,17 12,22 22,17"></polyline>
          <polyline points="2,12 12,17 22,12"></polyline>
        `,
        actionHtml: `<a href="#" class="empty-state-link" onclick="MoodleUI.showCreateCourseModal();">${this.escapeText(t('teacher.createFirstCourse'))}</a>`
      });
      return;
    }

    const tones = ['tone-olive', 'tone-terracotta', 'tone-sand', 'tone-blue'];

    courseList.innerHTML = `<div class="dashboard-stack">${courses.slice(0, 4).map((course, index) => {
      const toneClass = tones[index % tones.length];
      const avgProgress = course.avgProgress ?? course.averageProgress ?? 0;
      const pendingGrading = Number(course.pendingGrading || course.pendingAssignments || 0);
      const safeTitle = this.escapeText(course.title || course.courseTitle || t('app.course'));
      const metaItems = [
        `<span class="dashboard-row-meta-item">${this.escapeText(String(course.studentCount || 0))} ${this.escapeText(t('app.students'))}</span>`,
        `<span class="dashboard-row-meta-item">${this.escapeText(t('app.avgProgress'))} ${this.escapeText(String(avgProgress))}%</span>`
      ].join('');
      return `
        <button type="button" class="dashboard-row-card interactive" onclick="if (typeof MoodleUI !== 'undefined' && MoodleUI.openCourse) { MoodleUI.openCourse(${this.inlineActionValue(course.courseId)}); }">
          <div class="dashboard-row-icon ${toneClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12,2 2,7 12,12 22,7"></polygon>
              <polyline points="2,17 12,22 22,17"></polyline>
              <polyline points="2,12 12,17 22,12"></polyline>
            </svg>
          </div>
          <div class="dashboard-row-body">
            <div class="dashboard-row-title">${safeTitle}</div>
            <div class="dashboard-row-meta">${metaItems}</div>
          </div>
          <div class="dashboard-row-side">
            ${pendingGrading > 0 ? `<span class="dashboard-row-badge tone-terracotta">${this.escapeText(String(pendingGrading))} ${this.escapeText(t('app.pendingGrading'))}</span>` : `<span class="dashboard-row-badge tone-olive">${this.escapeText(t('teacher.pendingGrading'))}: 0</span>`}
          </div>
        </button>
      `;
    }).join('')}</div>`;
  },

  /**
   * 載入學生狀態警示
   */
  async loadStudentAlerts() {
    try {
      const result = await API.teachers.getAlerts();
      const allAlerts = result.success && Array.isArray(result.data) ? result.data : [];
      this.updateStudentAlertsUI(allAlerts.slice(0, 5), allAlerts.length);
    } catch (error) {
      console.error('Load student alerts error:', error);
      this.updateStudentAlertsUI([]);
    }
  },

  /**
   * 更新學生警示 UI
   */
  updateStudentAlertsUI(alerts, totalCount = alerts.length) {
    const alertsList = document.getElementById('studentAlertsList');
    const alertCount = document.getElementById('studentAlertCount');

    if (alertCount) {
      alertCount.textContent = `${totalCount} ${t('app.items')}`;
      alertCount.hidden = totalCount <= 0;
    }

    if (!alertsList) return;

    if (alerts.length === 0) {
      alertsList.innerHTML = this.renderDashboardEmptyState(t('teacher.noStudentAlerts'));
      return;
    }

    const alertTypes = {
      behind: { icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', color: 'var(--terracotta)', bg: 'var(--terracotta-light)' },
      missing: { icon: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="9" y1="15" x2="15" y2="15"/>', color: 'var(--sand)', bg: 'var(--sand-light)' },
      inactive: { icon: '<circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>', color: '#1976D2', bg: '#E3F2FD' },
      declining: { icon: '<polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/>', color: 'var(--terracotta)', bg: 'var(--terracotta-light)' }
    };

    alertsList.innerHTML = `<div class="dashboard-stack">${alerts.map(alert => {
      const config = alertTypes[alert.type] || alertTypes.behind;
      const toneClass = alert.type === 'missing'
        ? 'tone-sand'
        : alert.type === 'inactive'
          ? 'tone-blue'
          : 'tone-terracotta';
      const safeStudentName = this.escapeText(alert.studentName || t('app.user'));
      const safeMessage = this.escapeText(alert.message || '');
      const safeCourseTitle = alert.courseTitle ? this.escapeText(alert.courseTitle) : '';
      const actionHtml = alert.alertId
        ? `<button type="button" class="dashboard-row-action" onclick="event.stopPropagation(); App.dismissTeacherAlert(${this.inlineActionValue(alert.alertId)})">${this.escapeText(t('admin.dashboard.handleNow') || 'Handle')}</button>`
        : '';
      return `
        <div class="dashboard-row-card">
          <div class="dashboard-row-icon ${toneClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${config.icon}
            </svg>
          </div>
          <div class="dashboard-row-body">
            <div class="dashboard-row-title">${safeStudentName}</div>
            <div class="dashboard-row-meta">
              <span class="dashboard-row-meta-item">${safeMessage}</span>
              ${safeCourseTitle ? `<span class="dashboard-row-meta-item">${safeCourseTitle}</span>` : ''}
            </div>
          </div>
          <div class="dashboard-row-side">
            ${actionHtml}
          </div>
        </div>
      `;
    }).join('')}</div>`;
  },

  async dismissTeacherAlert(alertId) {
    if (!alertId) return;
    try {
      const result = await API.teachers.dismissAlert(alertId);
      if (result.success) {
        await this.loadStudentAlerts();
      } else {
        showToast(result.message || t('toast.operationFailed'));
      }
    } catch (error) {
      console.error('Dismiss teacher alert error:', error);
      showToast(t('toast.operationFailed'));
    }
  },

  updateGradingQueueUI(queue) {
    const queueList = document.getElementById('gradingQueueList');
    if (!queueList) return;

    if (!Array.isArray(queue) || queue.length === 0) {
      queueList.innerHTML = this.renderDashboardEmptyState(t('teacher.noGradingTasks'));
      return;
    }

    queueList.innerHTML = `<div class="dashboard-stack">${queue.slice(0, 5).map(item => {
      const safeTitle = this.escapeText(item.assignmentTitle || t('app.assignment'));
      const safeStudentName = this.escapeText(item.studentName || t('app.user'));
      const safeSubmittedAt = this.escapeText(this.formatTimeAgo(item.submittedAt));
      const actionHtml = item.assignmentId ? `
        <button type="button" class="dashboard-row-action" onclick="showView('moodleAssignments'); if (typeof MoodleUI !== 'undefined' && MoodleUI.openAssignment) { MoodleUI.openAssignment(${this.inlineActionValue(item.assignmentId)}); }">
          ${this.escapeText(t('moodleAssignment.gradeBtn') || 'Grade')}
        </button>
      ` : '';
      return `
        <div class="dashboard-row-card">
          <div class="dashboard-row-icon tone-olive">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
            </svg>
          </div>
          <div class="dashboard-row-body">
            <div class="dashboard-row-title">${safeTitle}</div>
            <div class="dashboard-row-meta">
              <span class="dashboard-row-meta-item">${safeStudentName}</span>
              <span class="dashboard-row-meta-item">${safeSubmittedAt}</span>
            </div>
          </div>
          <div class="dashboard-row-side">
            ${actionHtml}
          </div>
        </div>
      `;
    }).join('')}</div>`;
  },

  /**
   * 載入最近提交
   */
  async loadRecentSubmissions() {
    try {
      const result = await API.teachers.getDashboard();
      const submissions = result.success && Array.isArray(result.data?.recentSubmissions)
        ? result.data.recentSubmissions
        : [];
      this.updateRecentSubmissionsUI(submissions);
    } catch (error) {
      console.error('Load recent submissions error:', error);
      this.updateRecentSubmissionsUI([]);
    }
  },

  /**
   * 更新最近提交 UI
   */
  updateRecentSubmissionsUI(submissions) {
    const submissionsList = document.getElementById('recentSubmissionsList');
    const weeklySubmissionsEl = document.getElementById('teacherWeeklySubmissions');

    // 計算本週提交數
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyCount = submissions.filter(s => new Date(s.submittedAt) > oneWeekAgo).length;

    if (weeklySubmissionsEl) {
      weeklySubmissionsEl.textContent = weeklyCount;
    }

    if (!submissionsList) return;

    if (submissions.length === 0) {
      submissionsList.innerHTML = this.renderDashboardEmptyState(t('teacher.noSubmissions'), { compact: true });
      return;
    }

    submissionsList.innerHTML = `<div class="dashboard-stack">${submissions.map(sub => {
      const timeAgo = this.formatTimeAgo(sub.submittedAt);
      const toneClass = sub.status === 'graded' ? 'tone-olive' :
        (sub.status === 'pending' || sub.status === 'submitted') ? 'tone-sand' : 'tone-blue';
      const statusDotTone = sub.status === 'graded' ? 'tone-olive' :
        (sub.status === 'pending' || sub.status === 'submitted') ? 'tone-sand' : 'tone-blue';
      const assignmentTitle = sub.assignmentTitle || sub.title || t('app.assignment');
      const safeStudentName = this.escapeText(sub.studentName || t('app.user'));
      const safeAssignmentTitle = this.escapeText(assignmentTitle);
      const safeTimeAgo = this.escapeText(timeAgo);
      const initial = this.escapeText((sub.studentName || '?').trim().charAt(0) || '?');
      const statusTitle = sub.status === 'graded' ? t('app.statusCompleted') : t('app.pendingGrading');

      return `
        <div class="dashboard-row-card">
          <div class="dashboard-avatar">
            ${initial}
          </div>
          <div class="dashboard-row-body">
            <div class="dashboard-row-title">${safeStudentName} ${this.escapeText(t('app.submitted'))} ${safeAssignmentTitle}</div>
            <div class="dashboard-row-meta">
              <span class="dashboard-row-meta-item">${safeTimeAgo}</span>
            </div>
          </div>
          <div class="dashboard-row-side">
            <span class="dashboard-row-badge ${toneClass}">${this.escapeText(statusTitle)}</span>
            <span class="dashboard-status-dot ${statusDotTone}" title="${this.escapeText(statusTitle)}"></span>
          </div>
        </div>
      `;
    }).join('')}</div>`;
  },

  /**
   * 載入用戶課程
   */
  async loadUserCourses(userId) {
    try {
      const result = await API.users.getCourses(userId);
      if (result.success) {
        this.coursesCache = result.data || [];
        this.updateCoursesUI();
      }
    } catch (error) {
      console.error('Load user courses error:', error);
    }
  },

  /**
   * 更新課程介面
   */
  updateCoursesUI() {
    // 更新 Dashboard 的進行中課程
    const courseList = document.querySelector('#dashboardView .course-list');
    if (courseList && this.coursesCache.length > 0) {
      const inProgress = this.coursesCache.filter(c => c.progress < 100).slice(0, 3);
      if (inProgress.length > 0) {
        courseList.innerHTML = inProgress.map(course => this.renderCourseItem(course)).join('');
        this.applyProgressData(courseList);
      }
    }

    // 更新課程頁面
    const coursesGrid = document.querySelector('#coursesView .course-list');
    if (coursesGrid) {
      coursesGrid.innerHTML = this.coursesCache.map(course => this.renderCourseItem(course)).join('');
      this.applyProgressData(coursesGrid);
    }
  },

  /**
   * 渲染課程項目
   */
  renderCourseItem(course) {
    const toneClass = this.getToneClass(course.courseId || course.category || course.title);

    return `
      <button type="button" class="course-item" onclick="App.openCourse('${course.courseId}')">
        <div class="course-thumbnail ${toneClass}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12,2 2,7 12,12 22,7"/>
            <polyline points="2,17 12,22 22,17"/>
            <polyline points="2,12 12,17 22,12"/>
          </svg>
        </div>
        <div class="course-info">
          <h3 class="course-title">${course.title || course.courseTitle || t('app.course')}</h3>
          <p class="course-meta">${course.unitCount || '?'} ${t('app.units')} ・ ${t('app.totalHours', {hours: Math.round((course.totalDuration || 0) / 60)})}</p>
          <div class="course-progress">
            <div class="progress-bar">
              <div class="progress-fill" data-progress-width="${this.clampProgressValue(course.progress || 0)}"></div>
            </div>
            <span class="progress-text">${course.progress || 0}%</span>
          </div>
        </div>
      </button>
    `;
  },

  /**
   * 載入用戶活動記錄
   */
  async loadUserActivities(userId) {
    try {
      const result = await API.users.getActivities(userId, 10);
      if (result.success) {
        this.activitiesCache = result.data || [];
        this.updateActivitiesUI();
      }
    } catch (error) {
      console.error('Load user activities error:', error);
    }
  },

  /**
   * 更新活動記錄介面
   */
  updateActivitiesUI() {
    const activityList = document.querySelector('#dashboardView .activity-list');
    if (activityList && this.activitiesCache.length > 0) {
      activityList.innerHTML = this.activitiesCache.slice(0, 5).map(act => this.renderActivityItem(act)).join('');
    }
  },

  /**
   * 渲染活動項目
   */
  renderActivityItem(activity) {
    const iconMap = {
      'course_progress': { class: 'complete', icon: '<polyline points="20,6 9,17 4,12"/>' },
      'license_acquired': { class: 'new', icon: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>' },
      'login': { class: 'update', icon: '<path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10,17 15,12 10,7"/><line x1="15" y1="12" x2="3" y2="12"/>' },
      'default': { class: 'update', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' }
    };

    const config = iconMap[activity.action] || iconMap['default'];
    const timeAgo = this.formatTimeAgo(activity.createdAt);

    let text = activity.details?.description || t('app.performedAction');
    if (activity.action === 'course_progress') {
      text = `${t('app.completed')} <strong>${activity.details?.courseTitle || t('app.course')}</strong> ${t('app.unit')} ${activity.details?.unitId || '?'}`;
    } else if (activity.action === 'license_acquired') {
      text = `${t('app.newLicense')}：<strong>${activity.details?.resourceTitle || t('app.course')}</strong>`;
    }

    return `
      <div class="activity-item">
        <div class="activity-icon ${config.class}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${config.icon}
          </svg>
        </div>
        <div class="activity-content">
          <p class="activity-text">${text}</p>
          <span class="activity-time">${timeAgo}</span>
        </div>
      </div>
    `;
  },

  /**
   * 載入用戶授權
   */
  async loadUserLicenses(userId) {
    try {
      const result = await API.users.getLicenses(userId);
      if (result.success) {
        this.licensesCache = result.data || [];
        this.updateLicensesUI();
      }
    } catch (error) {
      console.error('Load user licenses error:', error);
    }
  },

  /**
   * 更新授權介面
   */
  updateLicensesUI() {
    // 更新統計卡片
    const activeCount = this.licensesCache.filter(l => l.status === 'active').length;
    const statCards = document.querySelectorAll('.stat-value');
    if (statCards.length >= 1) {
      statCards[0].textContent = activeCount;
    }

    // 更新授權頁面
    const licensesGrid = document.querySelector('#licensesView .license-grid');
    if (licensesGrid) {
      licensesGrid.innerHTML = this.licensesCache.map(lic => this.renderLicenseCard(lic)).join('');
    }
  },

  /**
   * 渲染授權卡片
   */
  renderLicenseCard(license) {
    const statusMap = {
      'active': { text: t('app.statusActive'), class: 'success' },
      'pending': { text: t('app.statusPendingReview'), class: 'warning' },
      'expired': { text: t('app.statusExpired'), class: 'danger' }
    };
    const status = statusMap[license.status] || statusMap['pending'];
    const daysLeft = this.getDaysUntil(license.expiryDate);

    return `
      <div class="license-card">
        <div class="license-header">
          <h3>${license.resourceTitle || t('app.course')}</h3>
          <span class="license-status ${status.class}">${status.text}</span>
        </div>
        <div class="license-body">
          <p><strong>${t('app.licenseType')}</strong>${license.licenseType === 'institutional' ? t('app.institutionalLicense') : t('app.personalLicense')}</p>
          <p><strong>${t('app.expiryDate')}</strong>${license.expiryDate || '-'}</p>
          ${daysLeft !== null ? `<p><strong>${t('app.daysLeft')}</strong>${daysLeft} ${t('app.days')}</p>` : ''}
        </div>
        ${license.status === 'active' && daysLeft <= 30 ? `
        <div class="license-footer">
          <button class="btn btn-outline" onclick="App.renewLicense('${license.licenseId}')">${t('app.renewLicense')}</button>
        </div>
        ` : ''}
      </div>
    `;
  },

  /**
   * 計算到期天數
   */
  getDaysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    const now = new Date();
    const diff = target - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  },

  /**
   * 格式化時間差
   */
  formatTimeAgo(dateStr) {
    if (!dateStr) return t('app.justNow');
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('app.justNow');
    if (minutes < 60) return t('app.minutesAgo', {n: minutes});
    if (hours < 24) return t('app.hoursAgo', {n: hours});
    if (days < 7) return t('app.daysAgo', {n: days});
    return date.toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW');
  },

  /**
   * 開啟課程詳情
   */
  openCourse(courseId) {
    const course = this.coursesCache.find(c => c.courseId === courseId);
    if (course) {
      openCourseModal(course.title || course.courseTitle);
    }
  },

  /**
   * 續約授權
   */
  async renewLicense(licenseId) {
    try {
      const result = await API.licenses.renew(licenseId);
      if (result.success) {
        showToast(t('toast.renewSubmitted'));
        // 重新載入授權列表
        const user = API.getCurrentUser();
        if (user) await this.loadUserLicenses(user.userId);
      } else {
        showToast(result.message || t('toast.renewFailed'));
      }
    } catch (error) {
      console.error('Renew license error:', error);
      showToast(t('toast.renewFailed'));
    }
  },

  /**
   * 載入公告
   */
  async loadAnnouncements() {
    try {
      const result = await API.announcements.list();
      if (result.success && result.data.length > 0) {
        this.showAnnouncementBanner(result.data[0]);
      }
    } catch (error) {
      console.error('Load announcements error:', error);
    }
  },

  /**
   * 顯示公告橫幅
   */
  showAnnouncementBanner(announcement) {
    // 檢查是否已存在
    if (document.getElementById('announcementBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'announcementBanner';
    banner.className = 'announcement-banner';
    banner.innerHTML = `
      <div class="announcement-content">
        <span class="announcement-badge">${announcement.priority === 'urgent' ? t('app.urgent') : t('app.announcement')}</span>
        <span class="announcement-text">${announcement.title}</span>
      </div>
      <button class="announcement-close" onclick="App.dismissAnnouncement('${announcement.announcementId}')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    const topBar = document.querySelector('.top-bar');
    if (topBar) {
      topBar.parentNode.insertBefore(banner, topBar);
    }
  },

  /**
   * 關閉公告
   */
  async dismissAnnouncement(announcementId) {
    const banner = document.getElementById('announcementBanner');
    if (banner) {
      banner.remove();
    }

    try {
      await API.announcements.dismiss(announcementId);
    } catch (error) {
      console.error('Dismiss announcement error:', error);
    }
  },

  /**
   * 載入資源
   */
  async loadResources() {
    try {
      const result = await API.resources.list();
      if (result.success) {
        this.resourcesCache = result.data || [];
        this.updateResourcesUI();
      }
    } catch (error) {
      console.error('Load resources error:', error);
    }
  },

  /**
   * 更新資源介面
   */
  updateResourcesUI() {
    // 更新資源庫視圖
    const libraryGrid = document.querySelector('#libraryView .resource-grid');
    if (libraryGrid && this.resourcesCache.length > 0) {
      libraryGrid.innerHTML = this.resourcesCache.map(res => this.renderResourceCard(res)).join('');
    }

    // 更新側邊欄資源數量
    const resourceBadge = document.querySelector('.nav-badge');
    if (resourceBadge) {
      resourceBadge.textContent = this.resourcesCache.length || '0';
    }
  },

  /**
   * 渲染資源卡片
   */
  renderResourceCard(resource) {
    const typeMap = {
      'video': t('app.resourceTypeVideo'),
      'interactive': t('app.resourceTypeInteractive'),
      'document': t('app.resourceTypeDocument'),
      'quiz': t('app.resourceTypeQuiz')
    };

    const typeIcons = {
      'video': '<polygon points="23,7 16,12 23,17"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
      'interactive': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      'document': '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
      'quiz': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
    };

    const tags = resource.tags || [];
    const initial = (resource.creatorName || 'U')[0].toUpperCase();
    const categoryMap = {
      language: I18n.getLocale() === 'en' ? 'Language' : '語言',
      wellness: I18n.getLocale() === 'en' ? 'Wellness' : '心靈成長',
      culture: I18n.getLocale() === 'en' ? 'Culture' : '文化',
      technology: I18n.getLocale() === 'en' ? 'Technology' : '科技'
    };
    const gradeMap = {
      elementary: I18n.getLocale() === 'en' ? 'Elementary' : '國小',
      junior: I18n.getLocale() === 'en' ? 'Junior high' : '國中',
      senior: I18n.getLocale() === 'en' ? 'Senior high' : '高中'
    };
    const eyebrow = categoryMap[resource.category] || (typeMap[resource.type] || resource.type);
    const supportingMeta = [gradeMap[resource.gradeLevel], resource.contentType].filter(Boolean).join(' · ');

    return `
      <button type="button" class="resource-card" onclick="App.openResourceModal('${resource.resourceId}')">
        <div class="resource-cover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${typeIcons[resource.type] || typeIcons['document']}
          </svg>
          <span class="resource-type-badge">${typeMap[resource.type] || resource.type}</span>
        </div>
        <div class="resource-content">
          <div class="resource-eyebrow-row">
            <span class="resource-eyebrow">${this.escapeText(eyebrow || '')}</span>
            ${supportingMeta ? `<span class="resource-support-pill">${this.escapeText(supportingMeta)}</span>` : ''}
          </div>
          <h3 class="resource-title">${resource.title}</h3>
          <p class="resource-desc">${resource.description || ''}</p>
          <div class="resource-tags">
            ${tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
          <div class="resource-footer">
            <div class="resource-footer-stack">
              <div class="resource-author">
                <div class="resource-author-avatar">${initial}</div>
                <span class="resource-author-name">${resource.creatorName || t('app.unknownAuthor')}</span>
              </div>
              <div class="resource-stats">
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${this.formatNumber(resource.viewCount)}</span>
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>${resource.averageRating || '-'}</span>
              </div>
            </div>
            <span class="resource-open-link">${I18n.getLocale() === 'en' ? 'View resource' : '查看教材'}</span>
          </div>
        </div>
      </button>
    `;
  },

  /**
   * 打開資源詳情 Modal
   */
  async openResourceModal(resourceId) {
    const resource = this.resourcesCache.find((item) => String(item.resourceId || item.id) === String(resourceId));
    if (!resource) {
      showToast(t('app.loadFailed'));
      return;
    }

    if (typeof window.showResourceModalForResource === 'function') {
      window.showResourceModalForResource(resource);
      return;
    }

    document.getElementById('modalTitle').textContent = resource.title;
    document.getElementById('modalBody').innerHTML = `<div class="empty-state"><p>${this.escapeText(resource.description || '')}</p></div>`;
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('resourceModal').classList.add('active');
  },

  /**
   * 載入用戶統計
   */
  async loadUserStats(userId) {
    try {
      const result = await API.users.getStats(userId);
      if (result.success) {
        this.updateStatsUI(result.data);
      }
    } catch (error) {
      console.error('Load user stats error:', error);
    }
  },

  /**
   * 更新統計介面
   */
  updateStatsUI(stats) {
    const statValues = document.querySelectorAll('.stat-value');
    if (statValues.length >= 4) {
      statValues[0].textContent = stats.coursesInProgress || '0';
      statValues[1].textContent = (stats.licensesActive || '0') + ' ' + t('app.licenseUnit');
      statValues[2].textContent = (stats.completionRate || '0') + '%';
      statValues[3].textContent = (stats.totalHours || '0') + 'h';
    }
  },

  /**
   * 登入處理
   */
  async login(email, password) {
    try {
      const result = await API.auth.login(email, password);

      if (result.success) {
        this.currentUser = result.data.user;

        // 如果是管理員，跳轉到管理後台
        if (result.data.user.isAdmin || result.data.user.role === 'admin') {
          showToast(t('toast.adminRedirect'));
          setTimeout(() => {
            window.location.href = '/admin';
          }, 1000);
          return true;
        }

        // 一般用戶顯示主應用程式
        this.showApp();
        await this.loadDashboardData();
        showToast(t('toast.loginSuccess'));
        // 觸發登入事件，通知聊天系統初始化
        window.dispatchEvent(new CustomEvent('userLoggedIn'));
        return true;
      } else {
        showToast(result.message || t('toast.loginFailed'));
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      showToast(t('toast.loginError'));
      return false;
    }
  },

  /**
   * 註冊處理
   */
  async register(userData) {
    try {
      const result = await API.auth.register(userData);

      if (result.success) {
        this.currentUser = result.data.user;
        this.showApp();
        await this.loadDashboardData();
        showToast(t('toast.registerSuccess'));
        return true;
      } else {
        showToast(result.message || t('toast.registerFailed'));
        return false;
      }
    } catch (error) {
      console.error('Register error:', error);
      showToast(t('toast.registerError'));
      return false;
    }
  },

  /**
   * 登出處理
   */
  async logout() {
    try {
      await API.auth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }

    this.currentUser = null;
    this.showLogin();
    showToast(t('toast.loggedOut'));
  },

  /**
   * 格式化數字
   */
  formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  },

  // ==================== 討論區功能 ====================

  /**
   * 載入討論列表
   */
  async loadDiscussions(filters = {}) {
    try {
      const result = await API.discussions.list(filters);
      if (result.success) {
        this.discussionsCache = result.data || [];
        this.updateDiscussionsUI();
      }
    } catch (error) {
      console.error('Load discussions error:', error);
    }
  },

  /**
   * 更新討論區介面
   */
  updateDiscussionsUI() {
    const discussionList = document.querySelector('#discussionsView .discussion-list');
    if (discussionList) {
      if (this.discussionsCache.length === 0) {
        discussionList.innerHTML = `<div class="empty-state"><p>${t('app.noDiscussions')}</p></div>`;
      } else {
        discussionList.innerHTML = this.discussionsCache.map(post => this.renderDiscussionItem(post)).join('');
      }
    }
  },

  /**
   * 渲染討論項目
   */
  renderDiscussionItem(post) {
    const timeAgo = this.formatTimeAgo(post.createdAt);
    const tags = post.tags || [];
    const initial = (post.userDisplayName || 'U')[0];

    return `
      <button type="button" class="discussion-item" onclick="App.openDiscussion('${post.postId}')">
        <div class="discussion-avatar">${initial}</div>
        <div class="discussion-content">
          <h3 class="discussion-title">${post.title}</h3>
          <p class="discussion-preview">${(post.content || '').substring(0, 100)}...</p>
          <div class="discussion-meta">
            <span class="discussion-author">${post.userDisplayName || t('app.anonymous')}</span>
            <span class="discussion-time">${timeAgo}</span>
            <div class="discussion-stats">
              <span>${post.replyCount || 0} ${t('app.replies')}</span>
              <span>${post.likeCount || 0} ${t('app.likes')}</span>
              <span>${post.viewCount || 0} ${t('app.views')}</span>
            </div>
          </div>
          <div class="discussion-tags">
            ${tags.map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
        </div>
      </button>
    `;
  },

  /**
   * 開啟討論詳情
   */
  closeDiscussionDetailModal() {
    if (typeof window.removeDiscussionModal === 'function') {
      window.removeDiscussionModal('legacyDiscussionDetailModal');
      return;
    }

    document.getElementById('legacyDiscussionDetailModal')?.remove();
  },

  renderDiscussionReplies(replies = []) {
    const items = Array.isArray(replies) ? replies : [];
    if (items.length === 0) {
      return typeof window.renderDiscussionState === 'function'
        ? window.renderDiscussionState(
            I18n.getLocale() === 'en'
              ? 'No replies yet. You can be the first to respond.'
              : '目前還沒有回覆，你可以成為第一個回應的人。'
          )
        : `<div class="empty-state"><p>${this.escapeText(I18n.getLocale() === 'en' ? 'No replies yet.' : '目前還沒有回覆。')}</p></div>`;
    }

    return `
      <div class="discussion-list">
        ${items.map((reply) => {
          const authorName = this.escapeText(reply.userDisplayName || reply.authorName || t('discussion.anonymous'));
          const initial = this.escapeText((reply.userDisplayName || reply.authorName || t('discussion.anonymous')).trim().charAt(0) || '匿');
          const content = this.escapeText(reply.content || '').replace(/\n/g, '<br>');
          const date = this.escapeText(this.formatLocaleDate(reply.createdAt));
          const toneClass = typeof window.getDiscussionToneClass === 'function'
            ? window.getDiscussionToneClass(reply.userDisplayName || reply.authorName || '')
            : '';

          return `
            <article class="discussion-card ${toneClass}">
              <div class="discussion-avatar">${initial}</div>
              <div class="discussion-content">
                <div class="discussion-meta">
                  <span>${authorName}</span>
                  <span class="discussion-meta-separator">•</span>
                  <span>${date}</span>
                </div>
                <p class="discussion-preview">${content || this.escapeText(t('discussion.noExcerpt'))}</p>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  },

  async openDiscussion(postId) {
    if (!postId) return;
    this.closeDiscussionDetailModal();

    try {
      const result = await API.discussions.get(postId);
      const discussion = result.success ? result.data : null;
      if (!discussion) {
        showToast(result.message || t('toast.discussionLoadFailed'));
        return;
      }

      const isEnglish = I18n.getLocale() === 'en';
      const safeTitle = this.escapeText(discussion.title || t('discussion.untitled'));
      const safeAuthorName = this.escapeText(discussion.userDisplayName || discussion.authorName || t('discussion.anonymous'));
      const safeCreatedAt = this.escapeText(this.formatLocaleDate(discussion.createdAt));
      const safeContent = this.escapeText(discussion.content || '').replace(/\n/g, '<br>');
      const tags = Array.isArray(discussion.tags) ? discussion.tags.filter(Boolean) : [];
      const discussionId = discussion.postId || discussion.id || postId;
      const discussionIdArg = this.inlineActionValue(discussionId);
      const overlay = document.createElement('div');

      overlay.id = 'legacyDiscussionDetailModal';
      overlay.className = 'modal-overlay active';
      overlay.innerHTML = `
        <div class="modal active discussion-modal" role="dialog" aria-modal="true" aria-labelledby="legacyDiscussionDetailModalTitle">
          <div class="modal-header">
            <h2 id="legacyDiscussionDetailModalTitle">${isEnglish ? 'Discussion detail' : '討論詳情'}</h2>
            <button type="button" class="modal-close" aria-label="${this.escapeText(t('discussion.modalClose'))}">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="discussion-modal-intro">
              <div class="discussion-modal-intro-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h6"/></svg>
              </div>
              <div>
                <div class="discussion-modal-intro-title">${safeTitle}</div>
                <p class="discussion-modal-intro-copy">${isEnglish ? 'This preserves the original legacy discussion thread and replies.' : '這裡保留舊版討論主題與其原始回覆內容。'}</p>
              </div>
            </div>

            <div class="discussion-modal-grid">
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Author' : '發佈者'}</label>
                <div>${safeAuthorName}</div>
              </div>
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Published at' : '發佈時間'}</label>
                <div>${safeCreatedAt}</div>
              </div>
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Replies' : '回覆數'}</label>
                <div>${this.escapeText(String(discussion.replyCount || 0))}</div>
              </div>
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Views' : '瀏覽數'}</label>
                <div>${this.escapeText(String(discussion.viewCount || 0))}</div>
              </div>
            </div>

            ${tags.length > 0 ? `
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Tags' : '標籤'}</label>
                <div class="discussion-tags">
                  ${tags.map((tag) => `<span class="tag">${this.escapeText(tag)}</span>`).join('')}
                </div>
              </div>
            ` : ''}

            <div class="bridge-form-group">
              <label class="bridge-form-label">${isEnglish ? 'Content' : '內容'}</label>
              <p class="discussion-preview">${safeContent || this.escapeText(t('discussion.noExcerpt'))}</p>
            </div>

            <div class="bridge-form-group">
              <label class="bridge-form-label">${isEnglish ? 'Replies' : '回覆內容'}</label>
              ${this.renderDiscussionReplies(discussion.replies)}
            </div>
          </div>
          <div class="modal-footer">
            <div class="discussion-modal-note">${isEnglish ? 'Need the newer learning-community workflow? Jump to the new forum hub from here.' : '如果你要改走新版課程論壇，也可以直接從這裡切換。'}</div>
            <button type="button" class="btn-secondary" onclick="App.closeDiscussionDetailModal()">${this.escapeText(t('common.cancel'))}</button>
            <button type="button" class="btn-secondary" onclick="App.closeDiscussionDetailModal(); openReplyModal(${discussionIdArg});">${this.escapeText(t('discussion.replyAction'))}</button>
            <button type="button" class="btn-primary" onclick="App.closeDiscussionDetailModal(); showView('moodleForums'); if (typeof MoodleUI !== 'undefined' && typeof MoodleUI.loadForums === 'function') { MoodleUI.loadForums(); }">${this.escapeText(t('discussion.openForumAction'))}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      if (typeof window.attachDiscussionModalBehavior === 'function') {
        window.attachDiscussionModalBehavior(overlay, () => this.closeDiscussionDetailModal(), '.btn-primary');
      }
      overlay.querySelector('.modal-close')?.addEventListener('click', () => this.closeDiscussionDetailModal());
    } catch (error) {
      console.error('Open discussion detail error:', error);
      showToast(t('toast.discussionLoadFailed'));
    }
  },

  /**
   * 發布新討論
   */
  async createDiscussion(title, content, tags = []) {
    try {
      const result = await API.discussions.create({ title, content, tags });
      if (result.success) {
        showToast(t('toast.discussionPosted'));
        await this.loadDiscussions();
        return true;
      } else {
        showToast(result.message || t('toast.discussionPostFailed'));
        return false;
      }
    } catch (error) {
      console.error('Create discussion error:', error);
      showToast(t('toast.discussionPostFailed'));
      return false;
    }
  },

  /**
   * 回覆討論
   */
  async replyToDiscussion(postId, content) {
    try {
      const result = await API.discussions.reply(postId, content);
      if (result.success) {
        showToast(t('toast.replySuccess'));
        return true;
      } else {
        showToast(result.message || t('toast.replyFailed'));
        return false;
      }
    } catch (error) {
      console.error('Reply to discussion error:', error);
      showToast(t('toast.replyFailed'));
      return false;
    }
  },

  /**
   * 按讚/取消讚
   */
  async toggleLike(postId) {
    const post = this.discussionsCache.find(p => p.postId === postId);
    if (!post) return;

    try {
      if (post.hasLiked) {
        await API.discussions.unlike(postId);
        post.hasLiked = false;
        post.likeCount = (post.likeCount || 1) - 1;
      } else {
        await API.discussions.like(postId);
        post.hasLiked = true;
        post.likeCount = (post.likeCount || 0) + 1;
      }
      this.updateDiscussionsUI();
    } catch (error) {
      console.error('Toggle like error:', error);
    }
  },

  // ==================== 諮詢服務功能 ====================

  /**
   * 載入諮詢列表
   */
  async loadConsultations(filters = {}) {
    try {
      const result = await API.consultations.list();
      if (result.success) {
        const items = Array.isArray(result.data) ? result.data : [];
        if (filters.status && filters.status !== 'all') {
          this.consultationsCache = items.filter(item => item?.status === filters.status);
        } else {
          this.consultationsCache = items;
        }
        this.updateConsultationsUI();
      }
    } catch (error) {
      console.error('Load consultations error:', error);
    }
  },

  /**
   * 更新諮詢列表介面
   */
  updateConsultationsUI() {
    const consultationList = document.querySelector('#consultationsView .consultation-list');
    if (consultationList) {
      if (this.consultationsCache.length === 0) {
        consultationList.innerHTML = `<div class="empty-state"><p>${t('app.noConsultations')}</p></div>`;
      } else {
        consultationList.innerHTML = this.consultationsCache.map(c => this.renderConsultationItem(c)).join('');
      }
    }
  },

  /**
   * 渲染諮詢項目
   */
  getConsultationTypeLabel(requestType) {
    const typeMap = {
      custom_material: t('app.typeCustomMaterial'),
      training: t('app.typeTraining'),
      technical: t('app.typeTechnical'),
      licensing: t('app.typeLicensing'),
      other: t('app.typeOther')
    };

    return typeMap[requestType] || requestType || t('support.chatTitle');
  },

  getConsultationStatusMeta(status) {
    const isEnglish = I18n.getLocale() === 'en';
    const statusMap = {
      pending: { text: t('app.statusPending'), class: 'warning' },
      reviewing: { text: t('app.statusReviewing'), class: 'info' },
      quoted: { text: t('app.statusQuoted'), class: 'primary' },
      accepted: { text: t('app.statusAccepted'), class: 'success' },
      rejected: { text: isEnglish ? 'Rejected' : '已拒絕', class: 'danger' },
      in_progress: { text: t('app.statusInProgress'), class: 'info' },
      completed: { text: t('app.statusCompleted'), class: 'success' },
      cancelled: { text: t('app.statusCancelled'), class: 'danger' }
    };

    return statusMap[status] || {
      text: status || (isEnglish ? 'Pending' : '待處理'),
      class: 'warning'
    };
  },

  renderConsultationItem(consultation) {
    const status = this.getConsultationStatusMeta(consultation.status);
    const type = this.getConsultationTypeLabel(consultation.requestType);
    const date = this.formatLocaleDate(consultation.createdAt);
    const title = this.escapeText(consultation.title || t('support.chatTitle'));
    const consultationId = consultation.consultationId || consultation.id || '';

    return `
      <button type="button" class="consultation-item" onclick="App.openConsultation(${this.inlineActionValue(consultationId)})">
        <div class="consultation-header">
          <h3>${title}</h3>
          <span class="status-badge ${status.class}">${status.text}</span>
        </div>
        <div class="consultation-body">
          <div class="consultation-meta">
            <span class="consultation-meta-pill">${t('app.type')} ${type}</span>
            <span class="consultation-meta-pill">${t('app.applicationDate')} ${date}</span>
            ${consultation.quote?.amount ? `<span class="consultation-meta-pill">${t('app.quote')} NT$ ${consultation.quote.amount.toLocaleString()}</span>` : ''}
          </div>
          <div class="consultation-footer">
            <span class="chat-room-kind">諮詢服務</span>
            <span class="consultation-link">前往對話 →</span>
          </div>
        </div>
      </button>
    `;
  },

  /**
   * 開啟諮詢詳情
   */
  closeConsultationDetailModal() {
    if (typeof window.removeDiscussionModal === 'function') {
      window.removeDiscussionModal('legacyConsultationDetailModal');
      return;
    }

    document.getElementById('legacyConsultationDetailModal')?.remove();
  },

  renderConsultationNotes(notes = [], emptyMessage = '') {
    const items = Array.isArray(notes) ? notes : [];
    if (items.length === 0) {
      return typeof window.renderDiscussionState === 'function'
        ? window.renderDiscussionState(emptyMessage || (I18n.getLocale() === 'en' ? 'No notes yet.' : '目前沒有備註。'))
        : `<div class="empty-state"><p>${this.escapeText(emptyMessage || (I18n.getLocale() === 'en' ? 'No notes yet.' : '目前沒有備註。'))}</p></div>`;
    }

    return `
      <div class="discussion-list">
        ${items.map((note) => `
          <article class="discussion-card">
            <div class="discussion-content">
              <div class="discussion-meta">
                <span>${this.escapeText(note.createdBy || note.userDisplayName || (I18n.getLocale() === 'en' ? 'System note' : '系統備註'))}</span>
                <span class="discussion-meta-separator">•</span>
                <span>${this.escapeText(this.formatLocaleDate(note.createdAt))}</span>
              </div>
              <p class="discussion-preview">${this.escapeText(note.content || '').replace(/\n/g, '<br>')}</p>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  },

  async openConsultationSupport() {
    this.closeConsultationDetailModal();

    try {
      showView('consultations');
      if (window.ChatModule && typeof window.ChatModule.loadRooms === 'function') {
        await window.ChatModule.loadRooms();
      }
      if (window.ChatModule && typeof window.ChatModule.checkStatus === 'function') {
        await window.ChatModule.checkStatus();
      }
    } catch (error) {
      console.error('Open consultation support error:', error);
    }
  },

  async openConsultation(consultationId) {
    if (!consultationId) return;
    this.closeConsultationDetailModal();

    try {
      const result = await API.consultations.get(consultationId);
      const consultation = result.success ? result.data : null;
      if (!consultation) {
        showToast(result.message || t('toast.consultationFailed'));
        return;
      }

      const isEnglish = I18n.getLocale() === 'en';
      const status = this.getConsultationStatusMeta(consultation.status);
      const type = this.getConsultationTypeLabel(consultation.requestType);
      const createdAt = this.escapeText(this.formatLocaleDate(consultation.createdAt));
      const budget = consultation.estimatedBudget
        ? `NT$ ${Number(consultation.estimatedBudget).toLocaleString()}`
        : (isEnglish ? 'Not specified' : '未填寫');
      const quoteAmount = consultation.quote?.amount !== undefined && consultation.quote?.amount !== null
        ? `NT$ ${Number(consultation.quote.amount).toLocaleString()}`
        : null;
      const consultationIdArg = this.inlineActionValue(consultation.consultationId || consultationId);
      const overlay = document.createElement('div');

      overlay.id = 'legacyConsultationDetailModal';
      overlay.className = 'modal-overlay active';
      overlay.innerHTML = `
        <div class="modal active discussion-modal" role="dialog" aria-modal="true" aria-labelledby="legacyConsultationDetailModalTitle">
          <div class="modal-header">
            <h2 id="legacyConsultationDetailModalTitle">${isEnglish ? 'Consultation detail' : '諮詢詳情'}</h2>
            <button type="button" class="modal-close" aria-label="${this.escapeText(t('discussion.modalClose'))}">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="discussion-modal-intro">
              <div class="discussion-modal-intro-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>
              </div>
              <div>
                <div class="discussion-modal-intro-title">${this.escapeText(consultation.title || t('support.chatTitle'))}</div>
                <p class="discussion-modal-intro-copy">${isEnglish ? 'Review the request scope, internal notes, quote status, and then continue in the support center if needed.' : '先看清楚需求內容、目前狀態與報價，再決定是否要前往客服中心繼續處理。'}</p>
              </div>
            </div>

            <div class="discussion-modal-grid">
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Request type' : '需求類型'}</label>
                <div>${this.escapeText(type)}</div>
              </div>
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Status' : '處理狀態'}</label>
                <div><span class="status-badge ${status.class}">${this.escapeText(status.text)}</span></div>
              </div>
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Submitted at' : '申請時間'}</label>
                <div>${createdAt}</div>
              </div>
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Estimated budget' : '預估預算'}</label>
                <div>${this.escapeText(budget)}</div>
              </div>
            </div>

            <div class="bridge-form-group">
              <label class="bridge-form-label">${isEnglish ? 'Description' : '需求說明'}</label>
              <p class="discussion-preview">${this.escapeText(consultation.description || '').replace(/\n/g, '<br>') || this.escapeText(isEnglish ? 'No description provided.' : '未填寫需求說明。')}</p>
            </div>

            ${(consultation.subject || consultation.gradeLevel || consultation.preferredContactTime || consultation.contactPhone) ? `
              <div class="discussion-modal-grid">
                ${consultation.subject ? `
                  <div class="bridge-form-group">
                    <label class="bridge-form-label">${isEnglish ? 'Subject' : '科目'}</label>
                    <div>${this.escapeText(consultation.subject)}</div>
                  </div>
                ` : ''}
                ${consultation.gradeLevel ? `
                  <div class="bridge-form-group">
                    <label class="bridge-form-label">${isEnglish ? 'Grade level' : '年級'}</label>
                    <div>${this.escapeText(consultation.gradeLevel)}</div>
                  </div>
                ` : ''}
                ${consultation.preferredContactTime ? `
                  <div class="bridge-form-group">
                    <label class="bridge-form-label">${isEnglish ? 'Preferred contact time' : '偏好聯繫時段'}</label>
                    <div>${this.escapeText(consultation.preferredContactTime)}</div>
                  </div>
                ` : ''}
                ${consultation.contactPhone ? `
                  <div class="bridge-form-group">
                    <label class="bridge-form-label">${isEnglish ? 'Contact phone' : '聯絡電話'}</label>
                    <div>${this.escapeText(consultation.contactPhone)}</div>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            ${consultation.quote ? `
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Quote summary' : '報價摘要'}</label>
                <div class="discussion-list">
                  <article class="discussion-card">
                    <div class="discussion-content">
                      <div class="discussion-meta">
                        <span>${this.escapeText(quoteAmount || (isEnglish ? 'Quoted' : '已提供報價'))}</span>
                        ${consultation.quote?.validUntil ? `<span class="discussion-meta-separator">•</span><span>${this.escapeText(this.formatLocaleDate(consultation.quote.validUntil))}</span>` : ''}
                      </div>
                      <p class="discussion-preview">${this.escapeText(consultation.quote.description || consultation.quote.notes || (isEnglish ? 'No additional quote notes.' : '目前沒有額外報價說明。')).replace(/\n/g, '<br>')}</p>
                    </div>
                  </article>
                </div>
              </div>
            ` : ''}

            ${Array.isArray(consultation.attachments) && consultation.attachments.length > 0 ? `
              <div class="bridge-form-group">
                <label class="bridge-form-label">${isEnglish ? 'Attachments' : '附件'}</label>
                <div class="discussion-tags">
                  ${consultation.attachments.map((attachment) => `<span class="tag">${this.escapeText(attachment.fileName || attachment.name || attachment.url || 'attachment')}</span>`).join('')}
                </div>
              </div>
            ` : ''}

            <div class="bridge-form-group">
              <label class="bridge-form-label">${isEnglish ? 'Admin notes' : '管理端備註'}</label>
              ${this.renderConsultationNotes(
                consultation.adminNotes,
                isEnglish ? 'No admin notes yet.' : '目前沒有管理端備註。'
              )}
            </div>

            <div class="bridge-form-group">
              <label class="bridge-form-label">${isEnglish ? 'Your notes' : '你的備註'}</label>
              ${this.renderConsultationNotes(
                consultation.userNotes,
                isEnglish ? 'No user notes yet.' : '目前沒有補充備註。'
              )}
            </div>
          </div>
          <div class="modal-footer">
            <div class="discussion-modal-note">${isEnglish ? 'This keeps the old consultation record readable while support chat remains in the service center.' : '這個視窗負責保留舊版諮詢案件明細；客服對話則維持在客服中心處理。'}</div>
            <button type="button" class="btn-secondary" onclick="App.closeConsultationDetailModal()">${this.escapeText(t('common.cancel'))}</button>
            ${consultation.status === 'quoted' ? `
              <button type="button" class="btn-secondary" onclick="App.rejectQuote(${consultationIdArg}, true)">${isEnglish ? 'Reject quote' : '婉拒報價'}</button>
              <button type="button" class="btn-secondary" onclick="App.acceptQuote(${consultationIdArg}, true)">${isEnglish ? 'Accept quote' : '接受報價'}</button>
            ` : ''}
            ${['pending', 'reviewing'].includes(consultation.status) ? `
              <button type="button" class="btn-secondary" onclick="App.cancelConsultation(${consultationIdArg}, true)">${isEnglish ? 'Cancel request' : '取消申請'}</button>
            ` : ''}
            <button type="button" class="btn-primary" onclick="App.openConsultationSupport(${consultationIdArg})">${isEnglish ? 'Open support center' : '前往客服中心'}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      if (typeof window.attachDiscussionModalBehavior === 'function') {
        window.attachDiscussionModalBehavior(overlay, () => this.closeConsultationDetailModal(), '.btn-primary');
      }
      overlay.querySelector('.modal-close')?.addEventListener('click', () => this.closeConsultationDetailModal());
    } catch (error) {
      console.error('Open consultation detail error:', error);
      showToast(t('toast.consultationFailed'));
    }
  },

  /**
   * 建立諮詢請求
   */
  async createConsultation(data) {
    try {
      const result = await API.consultations.create(data);
      if (result.success) {
        showToast(t('toast.consultationSubmitted'));
        await this.loadConsultations();
        return true;
      } else {
        showToast(result.message || t('toast.submitFailed'));
        return false;
      }
    } catch (error) {
      console.error('Create consultation error:', error);
      showToast(t('toast.submitFailed'));
      return false;
    }
  },

  /**
   * 接受報價
   */
  async acceptQuote(consultationId, reopenDetail = false) {
    try {
      const result = await API.consultations.acceptQuote(consultationId);
      if (result.success) {
        showToast(t('toast.quoteAccepted'));
        await this.loadConsultations();
        if (reopenDetail) {
          await this.openConsultation(consultationId);
        }
        return true;
      } else {
        showToast(result.message || t('toast.operationFailed'));
        return false;
      }
    } catch (error) {
      console.error('Accept quote error:', error);
      showToast(t('toast.operationFailed'));
      return false;
    }
  },

  async rejectQuote(consultationId, reopenDetail = false) {
    const confirmMessage = I18n.getLocale() === 'en'
      ? 'Reject this quote?'
      : '確定要婉拒這筆報價嗎？';
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return false;
    }

    try {
      const result = await API.consultations.rejectQuote(consultationId);
      if (result.success) {
        showToast(I18n.getLocale() === 'en' ? 'Quote rejected.' : '已婉拒報價。');
        await this.loadConsultations();
        if (reopenDetail) {
          await this.openConsultation(consultationId);
        }
        return true;
      }

      showToast(result.message || t('toast.operationFailed'));
      return false;
    } catch (error) {
      console.error('Reject quote error:', error);
      showToast(t('toast.operationFailed'));
      return false;
    }
  },

  async cancelConsultation(consultationId, reopenDetail = false) {
    const confirmMessage = I18n.getLocale() === 'en'
      ? 'Cancel this consultation request?'
      : '確定要取消這筆諮詢申請嗎？';
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return false;
    }

    try {
      const result = await API.consultations.cancel(consultationId);
      if (result.success) {
        showToast(I18n.getLocale() === 'en' ? 'Consultation request cancelled.' : '已取消諮詢申請。');
        await this.loadConsultations();
        if (reopenDetail) {
          await this.openConsultation(consultationId);
        }
        return true;
      }

      showToast(result.message || t('toast.operationFailed'));
      return false;
    } catch (error) {
      console.error('Cancel consultation error:', error);
      showToast(t('toast.operationFailed'));
      return false;
    }
  },

  // ==================== 搜尋和篩選功能 ====================

  /**
   * 搜尋資源
   */
  async searchResources(query, filters = {}) {
    try {
      const result = await API.resources.search(query, filters);
      if (result.success) {
        this.resourcesCache = result.data || [];
        this.updateResourcesUI();
      }
    } catch (error) {
      console.error('Search resources error:', error);
    }
  },

  /**
   * 篩選資源
   */
  async filterResources(filters) {
    try {
      const result = await API.resources.list(filters);
      if (result.success) {
        this.resourcesCache = result.data || [];
        this.updateResourcesUI();
      }
    } catch (error) {
      console.error('Filter resources error:', error);
    }
  },

  // ==================== 班級管理功能 ====================

  // 班級資料緩存
  classesCache: [],
  currentClass: null,

  /**
   * 載入班級列表
   */
  async loadClasses() {
    const user = API.getCurrentUser();
    // 優先使用 index.html 的橋隊渲染流程（目前主頁面的實際容器結構）
    if (this.isStudentUser(user) && typeof window.loadStudentClasses === 'function') {
      await window.loadStudentClasses();
      return;
    }
    if (!this.isStudentUser(user) && typeof window.loadClasses === 'function') {
      await window.loadClasses();
      return;
    }

    try {
      const result = await API.classes.list();
      if (result.success) {
        this.classesCache = result.data || [];
        this.updateClassesUI();
      }
    } catch (error) {
      console.error('Load classes error:', error);
    }
  },

  /**
   * 更新班級列表介面
   */
  updateClassesUI() {
    const user = API.getCurrentUser();
    const isStudent = this.isStudentUser(user);

    // 教師班級視圖
    const teacherView = document.querySelector('#classesView .class-grid');
    if (teacherView && !isStudent) {
      if (this.classesCache.length === 0) {
        teacherView.innerHTML = `<div class="empty-state"><p>${t('app.noClasses')}</p></div>`;
      } else {
        teacherView.innerHTML = this.classesCache.map(c => this.renderClassCard(c, false)).join('');
      }
    }

    // 學生班級視圖
    const studentView = document.querySelector('#studentClassesView .class-grid');
    if (studentView && isStudent) {
      if (this.classesCache.length === 0) {
        studentView.innerHTML = `<div class="empty-state"><p>${t('app.noEnrolledClasses')}</p></div>`;
      } else {
        studentView.innerHTML = this.classesCache.map(c => this.renderClassCard(c, true)).join('');
      }
    }
  },

  /**
   * 渲染班級卡片
   */
  renderClassCard(classInfo, isStudent) {
    const className = classInfo.name || classInfo.className || '班級';
    const memberCount = classInfo.members?.length || classInfo.memberCount || 0;
    const initial = className[0];

    return `
      <button type="button" class="class-card" onclick="App.openClassDetail('${classInfo.classId}')">
        <div class="class-card-header">
          <div class="class-avatar">${initial}</div>
          <div class="class-info">
            <h3>${className}</h3>
            <p>${classInfo.description || t('app.noDescription')}</p>
          </div>
        </div>
        <div class="class-card-body">
          <div class="class-stats">
            <span>${memberCount} ${t('app.members')}</span>
            ${!isStudent ? `<span>${t('app.inviteCode')}: ${classInfo.inviteCode}</span>` : ''}
          </div>
        </div>
        ${!isStudent ? `
        <div class="class-card-footer">
          <button class="btn btn-sm" onclick="event.stopPropagation(); App.copyInviteCode('${classInfo.inviteCode}')">${t('app.copyInviteCode')}</button>
        </div>
        ` : ''}
      </button>
    `;
  },

  /**
   * 建立新班級
   */
  async createClass(className, description = '') {
    try {
      const result = await API.classes.create({ name: className, description });
      if (result.success) {
        showToast(t('toast.classCreated'));
        await this.loadClasses();
        return result.data;
      } else {
        showToast(result.message || t('toast.classCreateFailed'));
        return null;
      }
    } catch (error) {
      console.error('Create class error:', error);
      showToast(t('toast.classCreateFailed'));
      return null;
    }
  },

  /**
   * 透過邀請碼加入班級
   */
  async joinClassByCode(inviteCode) {
    try {
      const result = await API.classes.joinByCode(inviteCode);
      if (result.success) {
        showToast(t('toast.classJoined'));
        await this.loadClasses();
        return true;
      } else {
        showToast(result.message || t('toast.classJoinFailed'));
        return false;
      }
    } catch (error) {
      console.error('Join class error:', error);
      showToast(t('toast.classJoinFailed'));
      return false;
    }
  },

  /**
   * 開啟班級詳情
   */
  async openClassDetail(classId) {
    try {
      const result = await API.classes.get(classId);
      if (result.success) {
        this.currentClass = result.data;
        this.showClassDetailView();
      } else {
        showToast(t('toast.classLoadFailed'));
      }
    } catch (error) {
      console.error('Open class detail error:', error);
      showToast(t('toast.classLoadFailed'));
    }
  },

  /**
   * 顯示班級詳情視圖
   */
  showClassDetailView() {
    const classDetail = document.getElementById('classDetailView');
    if (!classDetail || !this.currentClass) return;

    const c = this.currentClass;
    const user = API.getCurrentUser();
    const isOwner = c.teacherId === user?.userId;

    // 更新班級詳情內容
    const header = classDetail.querySelector('.class-detail-header');
    if (header) {
      const className = c.name || c.className || '班級';
      header.innerHTML = `
        <h2>${className}</h2>
        <p>${c.description || ''}</p>
        ${isOwner ? `<p>${t('app.inviteCode')}: <strong>${c.inviteCode}</strong></p>` : ''}
      `;
    }

    // 更新成員列表
    const memberList = classDetail.querySelector('.member-list');
    if (memberList) {
      const members = c.members || [];
      if (members.length === 0) {
        memberList.innerHTML = `<p class="empty-state">${t('app.noMembers')}</p>`;
      } else {
        memberList.innerHTML = members.map(m => this.renderMemberItem(m, isOwner, c.classId)).join('');
      }
    }

    // 切換到班級詳情視圖
    navigateTo(document.querySelector('[data-view="classDetail"]') || document.querySelector('[data-view="classes"]'), 'classDetail');
  },

  /**
   * 渲染成員項目
   */
  renderMemberItem(member, isOwner, classId) {
    const memberName = member.displayName || member.userName || member.email || member.userEmail || 'Unknown';
    const memberEmail = member.email || member.userEmail || '';
    const initial = memberName[0];
    const joinDate = member.joinedAt ? this.formatLocaleDate(member.joinedAt) : '';

    return `
      <div class="member-item">
        <div class="member-avatar">${initial}</div>
        <div class="member-info">
          <span class="member-name">${memberName}</span>
          ${memberEmail ? `<span class="member-email">${memberEmail}</span>` : ''}
          <span class="member-joined">${joinDate}</span>
        </div>
        ${isOwner && member.userId !== this.currentUser?.userId ? `
        <button class="btn btn-sm btn-danger" onclick="App.removeMember('${classId}', '${member.userId}')">${t('app.remove')}</button>
        ` : ''}
      </div>
    `;
  },

  /**
   * 移除班級成員
   */
  async removeMember(classId, userId) {
    const confirmed = await showConfirmDialog({
      message: t('confirm.removeMember'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.classes.removeMember(classId, userId);
      if (result.success) {
        showToast(t('toast.memberRemoved'));
        await this.openClassDetail(classId);
      } else {
        showToast(result.message || t('toast.memberRemoveFailed'));
      }
    } catch (error) {
      console.error('Remove member error:', error);
      showToast(t('toast.memberRemoveFailed'));
    }
  },

  /**
   * 複製邀請碼
   */
  copyInviteCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      showToast(t('toast.inviteCodeCopied'));
    }).catch(() => {
      showToast(t('toast.copyFailed'));
    });
  },

  /**
   * 刪除班級
   */
  async deleteClass(classId) {
    const confirmed = await showConfirmDialog({
      message: t('confirm.deleteClass'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const result = await API.classes.delete(classId);
      if (result.success) {
        showToast(t('toast.classDeleted'));
        await this.loadClasses();
        navigateTo(document.querySelector('[data-view="classes"]'), 'classes');
      } else {
        showToast(result.message || t('toast.classDeleteFailed'));
      }
    } catch (error) {
      console.error('Delete class error:', error);
      showToast(t('toast.classDeleteFailed'));
    }
  },

  // ==================== 設定頁面功能 ====================

  /**
   * 更新用戶資料
   */
  async updateProfile(data) {
    const user = API.getCurrentUser();
    if (!user) return false;

    try {
      const result = await API.users.update(user.userId, data);
      if (result.success) {
        // 更新本地用戶資料
        const updatedUser = this.syncCurrentUserState({ ...user, ...data });
        this.updateUserUI();
        showToast(t('toast.profileUpdated'));
        return true;
      } else {
        showToast(result.message || t('toast.updateFailed'));
        return false;
      }
    } catch (error) {
      console.error('Update profile error:', error);
      showToast(t('toast.updateFailed'));
      return false;
    }
  },

  /**
   * 變更密碼
   */
  async changePassword(currentPassword, newPassword) {
    try {
      const result = await API.auth.changePassword(currentPassword, newPassword);
      if (result.success) {
        showToast(t('toast.passwordChanged'));
        return true;
      } else {
        showToast(result.message || t('toast.passwordChangeFailed'));
        return false;
      }
    } catch (error) {
      console.error('Change password error:', error);
      showToast(t('toast.passwordChangeFailed'));
      return false;
    }
  },

  // ==================== 測驗系統功能 ====================

  quizzesCache: [],
  currentQuiz: null,
  quizStartTime: null,
  quizAnswers: [],

  /**
   * 載入測驗列表
   */
  async loadQuizzes(filters = {}) {
    try {
      const result = await API.quizzes.list(filters);
      if (result.success) {
        this.quizzesCache = result.data || [];
        this.updateQuizzesUI();
        return true;
      }
    } catch (error) {
      console.error('Load quizzes error:', error);
      showToast(t('toast.quizLoadFailed'));
    }
    return false;
  },

  /**
   * 更新測驗列表 UI
   */
  updateQuizzesUI() {
    const container = document.getElementById('quizList');
    if (!container) return;

    if (this.quizzesCache.length === 0) {
      container.innerHTML = `
        <div class="empty-state quiz-empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p>${t('app.noQuizzesAvailable')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="quiz-list-shell">${this.quizzesCache.map((quiz) => this.renderQuizItem(quiz)).join('')}</div>`;

    // 更新統計
    this.updateQuizStats();
  },

  /**
   * 渲染單個測驗項目
   */
  renderQuizItem(quiz) {
    return this.renderQuizRowCard(quiz, {
      buttonAction: `App.startQuiz(${this.inlineActionValue(quiz.quizId || quiz.id || '')})`
    });
  },

  /**
   * 更新測驗統計
   */
  updateQuizStats() {
    const stats = {
      total: this.quizzesCache.length,
      completed: this.quizzesCache.filter(q => q.userStatus === 'completed').length,
      inProgress: this.quizzesCache.filter(q => q.userStatus === 'in_progress').length,
      avgScore: 0
    };

    const completedWithScore = this.quizzesCache.filter(q => q.bestScore > 0);
    if (completedWithScore.length > 0) {
      stats.avgScore = Math.round(
        completedWithScore.reduce((sum, q) => sum + q.bestScore, 0) / completedWithScore.length
      );
    }

    // 更新統計卡片
    const statsContainer = document.querySelector('.quiz-stats');
    if (statsContainer) {
      const structuredStats = statsContainer.querySelectorAll('[data-quiz-stat]');
      if (structuredStats.length > 0) {
        structuredStats.forEach((node) => {
          const statKey = node.getAttribute('data-quiz-stat');
          if (statKey === 'avgScore') {
            node.textContent = `${stats.avgScore}%`;
            return;
          }
          if (statKey && Object.prototype.hasOwnProperty.call(stats, statKey)) {
            node.textContent = stats[statKey];
          }
        });
      } else {
        const cards = statsContainer.querySelectorAll('.stat-card');
        if (cards[0]) cards[0].querySelector('div[style*="font-size: 1.75rem"]').textContent = stats.total;
        if (cards[1]) cards[1].querySelector('div[style*="font-size: 1.75rem"]').textContent = stats.completed;
        if (cards[2]) cards[2].querySelector('div[style*="font-size: 1.75rem"]').textContent = stats.inProgress;
        if (cards[3]) cards[3].querySelector('div[style*="font-size: 1.75rem"]').textContent = stats.avgScore + '%';
      }
    }
  },

  /**
   * 開始測驗
   */
  async startQuiz(quizId) {
    try {
      const result = await API.quizzes.get(quizId);
      if (!result.success) {
        showToast(result.message || t('toast.quizLoadFailed'));
        return;
      }

      this.currentQuiz = result.data;
      this.quizAnswers = [];
      this.quizStartTime = Date.now();

      this.showQuizModal();
    } catch (error) {
      console.error('Start quiz error:', error);
      showToast(t('toast.quizLoadFailed'));
    }
  },

  /**
   * 顯示測驗 Modal
   */
  showQuizModal() {
    const quiz = this.currentQuiz;
    if (!quiz) return;

    // 關閉現有 modal
    const existingModal = document.getElementById('quizModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'quizModal';
    modal.className = 'quiz-modal-overlay';
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        this.closeQuiz();
      }
    });

    modal.innerHTML = `
      <div class="quiz-modal-shell" role="dialog" aria-modal="true" aria-labelledby="quizModalTitle" onclick="event.stopPropagation()">
        <div class="quiz-modal-header">
          <div class="quiz-modal-copy">
            <h2 id="quizModalTitle" class="quiz-modal-title">${this.escapeText(quiz.title)}</h2>
            <p class="quiz-modal-subtitle">${this.escapeText(`${quiz.questionCount || 0} ${t('app.questions')} | ${t('app.passingScore')} ${quiz.passingScore || 60}%`)}</p>
          </div>
          <div class="quiz-modal-timer">
            <div class="quiz-modal-timer-label">${this.escapeText(t('app.timeSpent'))}</div>
            <div id="quizTimer" class="quiz-modal-timer-value">00:00</div>
          </div>
        </div>
        <div id="quizContent" class="quiz-modal-content">
          ${this.renderQuizQuestions(quiz.questions)}
        </div>
        <div class="quiz-modal-footer">
          <div class="quiz-modal-subtitle">${this.escapeText(I18n.getLocale() === 'en' ? 'You can leave now and reopen the quiz later.' : '可先離開測驗，之後再回來繼續作答。')}</div>
          <div class="quiz-modal-actions">
            <button type="button" class="quiz-modal-btn secondary" onclick="App.closeQuiz()">${this.escapeText(t('app.leaveQuiz'))}</button>
            <button type="button" class="quiz-modal-btn primary" onclick="App.submitQuiz()">${this.escapeText(t('app.submitAnswers'))}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 開始計時
    this.startQuizTimer();
  },

  /**
   * 渲染測驗題目
   */
  renderQuizQuestions(questions) {
    return (questions || []).map((q, index) => `
      <section class="quiz-question-card">
        <div class="quiz-question-head">
          <span class="quiz-question-number">${index + 1}</span>
          <div class="quiz-question-copy">
            <p class="quiz-question-text">${this.escapeText(q.question)}</p>
            ${q.imageUrl ? `<img src="${this.escapeText(q.imageUrl)}" alt="" class="quiz-question-image">` : ''}
          </div>
        </div>
        <div>
          ${q.type === 'multiple_choice' ? this.renderMultipleChoice(q, index) : this.renderTextAnswer(q, index)}
        </div>
      </section>
    `).join('');
  },

  /**
   * 渲染選擇題選項
   */
  renderMultipleChoice(question, questionIndex) {
    const options = question.options || [];
    return `
      <div class="quiz-options">
        ${options.map((opt) => `
          <label class="quiz-option">
            <input class="quiz-option-input" type="radio" name="q_${questionIndex}" value="${this.escapeText(opt)}" onchange="App.recordAnswer(${this.inlineActionValue(question.questionId)}, ${this.inlineActionValue(opt)})">
            <span class="quiz-option-text">${this.escapeText(opt)}</span>
          </label>
        `).join('')}
      </div>
    `;
  },

  /**
   * 渲染文字答案
   */
  renderTextAnswer(question, questionIndex) {
    return `
      <div class="quiz-answer-field">
        <textarea class="quiz-answer-textarea"
                  placeholder="${this.escapeText(t('app.enterAnswer'))}"
                  onchange="App.recordAnswer(${this.inlineActionValue(question.questionId)}, this.value)"></textarea>
      </div>
    `;
  },

  /**
   * 記錄答案
   */
  recordAnswer(questionId, answer) {
    const existingIndex = this.quizAnswers.findIndex(a => a.questionId === questionId);
    if (existingIndex >= 0) {
      this.quizAnswers[existingIndex].answer = answer;
    } else {
      this.quizAnswers.push({ questionId, answer });
    }
  },

  /**
   * 開始計時器
   */
  startQuizTimer() {
    const timerEl = document.getElementById('quizTimer');
    if (!timerEl) return;

    this.quizTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.quizStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // 時間限制警告
      if (this.currentQuiz?.timeLimit) {
        const limitSeconds = this.currentQuiz.timeLimit * 60;
        if (elapsed >= limitSeconds) {
          clearInterval(this.quizTimerInterval);
          showToast(t('toast.timeUp'));
          this.submitQuiz();
        } else if (elapsed >= limitSeconds - 60 && elapsed < limitSeconds - 59) {
          showToast(t('toast.oneMinuteLeft'));
        }
      }
    }, 1000);
  },

  /**
   * 關閉測驗
   */
  closeQuiz() {
    if (this.quizTimerInterval) {
      clearInterval(this.quizTimerInterval);
    }
    const modal = document.getElementById('quizModal');
    if (modal) modal.remove();
    this.currentQuiz = null;
    this.quizAnswers = [];
  },

  /**
   * 提交測驗
   */
  async submitQuiz() {
    if (!this.currentQuiz) return;

    const timeSpent = Math.floor((Date.now() - this.quizStartTime) / 1000);

    // 檢查是否有未作答的題目
    const unanswered = this.currentQuiz.questions.length - this.quizAnswers.length;
    if (unanswered > 0) {
      const confirmed = await showConfirmDialog({
        message: t('confirm.unansweredQuiz', {n: unanswered}),
        confirmLabel: t('app.submitAnswers')
      });
      if (!confirmed) {
        return;
      }
    }

    try {
      const result = await API.quizzes.submit(this.currentQuiz.quizId, this.quizAnswers, timeSpent);

      if (this.quizTimerInterval) {
        clearInterval(this.quizTimerInterval);
      }

      if (result.success) {
        this.showQuizResult(result.data);
        // 重新載入測驗列表
        this.loadQuizzes();
      } else {
        showToast(result.message || t('toast.quizSubmitFailed'));
      }
    } catch (error) {
      console.error('Submit quiz error:', error);
      showToast(t('toast.quizSubmitFailed'));
    }
  },

  /**
   * 顯示測驗結果
   */
  showQuizResult(result) {
    const modal = document.getElementById('quizModal');
    if (!modal) return;

    const content = modal.querySelector('#quizContent');
    if (!content) return;

    const passed = result.passed;
    const resultToneClass = passed ? 'is-passed' : 'is-failed';
    const timeLabel = `${Math.floor(result.timeSpent / 60)}:${String(result.timeSpent % 60).padStart(2, '0')}`;

    content.innerHTML = `
      <div class="quiz-result-shell">
        <div class="quiz-result-hero">
          <div class="quiz-result-score-ring ${resultToneClass}">
            <div class="quiz-result-score-value">${result.score}%</div>
          </div>
          <div class="quiz-result-hero-copy">
            <div class="quiz-result-kicker">${this.escapeText(I18n.getLocale() === 'en' ? 'Quiz review' : '測驗結果')}</div>
            <div class="quiz-result-title ${resultToneClass}">${this.escapeText(passed ? t('app.congratsPassed') : t('app.keepTrying'))}</div>
            <div class="quiz-result-copy">${this.escapeText(`${t('app.correctAnswers', {correct: result.correctCount, total: result.totalQuestions})} | ${t('app.timeSpent')} ${timeLabel}`)}</div>
            <div class="quiz-result-tags">
              <span class="quiz-result-tag">${this.escapeText(`${result.correctCount}/${result.totalQuestions} ${I18n.getLocale() === 'en' ? 'correct' : '答對'}`)}</span>
              <span class="quiz-result-tag">${this.escapeText(`${t('app.bestScore')} ${result.bestScore}%`)}</span>
            </div>
          </div>
        </div>

        <div class="quiz-result-metrics">
          <div class="quiz-result-metric">
            <div class="quiz-result-metric-kicker">${this.escapeText(I18n.getLocale() === 'en' ? 'Earned' : '本次得分')}</div>
            <div class="quiz-result-metric-value">${result.earnedPoints}</div>
            <div class="quiz-result-metric-label">${this.escapeText(t('app.score'))}</div>
          </div>
          <div class="quiz-result-metric">
            <div class="quiz-result-metric-kicker">${this.escapeText(I18n.getLocale() === 'en' ? 'Total' : '滿分')}</div>
            <div class="quiz-result-metric-value">${result.totalPoints}</div>
            <div class="quiz-result-metric-label">${this.escapeText(t('app.fullScore'))}</div>
          </div>
          <div class="quiz-result-metric">
            <div class="quiz-result-metric-kicker">${this.escapeText(I18n.getLocale() === 'en' ? 'Personal best' : '最佳成績')}</div>
            <div class="quiz-result-metric-value">${result.bestScore}%</div>
            <div class="quiz-result-metric-label">${this.escapeText(t('app.bestScore'))}</div>
          </div>
        </div>

          <div class="quiz-result-details">
            <div class="quiz-result-details-head">
              <div class="quiz-result-details-kicker">${this.escapeText(I18n.getLocale() === 'en' ? 'Answer review' : '作答檢視')}</div>
              <div class="quiz-result-details-title">${this.escapeText(t('app.answerDetail'))}</div>
            </div>
          ${result.results.map((r, i) => `
            <div class="quiz-result-item ${r.isCorrect ? 'is-correct' : 'is-incorrect'}">
              <div class="quiz-result-item-head">
                <span class="quiz-result-item-index">${i + 1}</span>
                <div class="quiz-result-item-copy">
                  <div class="quiz-result-item-title">${this.escapeText(r.question)}</div>
                  <span class="quiz-result-item-status">${this.escapeText(r.isCorrect ? (I18n.getLocale() === 'en' ? 'Correct' : '答對') : (I18n.getLocale() === 'en' ? 'Needs review' : '需再複習'))}</span>
                </div>
              </div>
              <div class="quiz-result-answer-grid">
                <div class="quiz-result-answer-card ${r.isCorrect ? 'user-answer is-correct' : 'user-answer is-incorrect'}">
                  <span class="quiz-result-answer-label">${this.escapeText(t('app.yourAnswer'))}</span>
                  <strong class="${r.isCorrect ? 'correct' : 'incorrect'}">${this.escapeText(r.userAnswer || t('app.notAnswered'))}</strong>
                </div>
                ${!r.isCorrect ? `
                  <div class="quiz-result-answer-card correct-answer">
                    <span class="quiz-result-answer-label">${this.escapeText(t('app.correctAnswer'))}</span>
                    <strong class="correct">${this.escapeText(r.correctAnswer)}</strong>
                  </div>
                ` : ''}
              </div>
              ${r.explanation ? `<div class="quiz-result-explanation"><span class="quiz-result-answer-label">${this.escapeText(I18n.getLocale() === 'en' ? 'Explanation' : '補充說明')}</span><p>${this.escapeText(r.explanation)}</p></div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // 更新底部按鈕
    const footer = modal.querySelector('.quiz-modal-footer');
    if (footer) {
      footer.innerHTML = `
        <div class="quiz-modal-subtitle">${this.escapeText(I18n.getLocale() === 'en' ? 'You can review the results now or retake the quiz.' : '你可以先查看結果，或立即重新作答一次。')}</div>
        <div class="quiz-modal-actions">
          <button type="button" class="quiz-modal-btn secondary" onclick="App.closeQuiz()">${this.escapeText(t('app.close'))}</button>
          <button type="button" class="quiz-modal-btn primary" onclick="App.startQuiz(${this.inlineActionValue(this.currentQuiz.quizId)})">${this.escapeText(t('app.retake'))}</button>
        </div>
      `;
    }
  },

  escapeText(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  truncateText(value, maxLength = 160) {
    if (value === null || value === undefined) return '';
    const normalized = String(value).replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  },

  inlineActionValue(value) {
    return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  },

  formatLocaleDate(dateValue) {
    if (!dateValue) return '-';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW');
  },

  formatLocaleMonthDay(dateValue) {
    if (!dateValue) return '-';
    const parsed = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW', {
      month: 'short',
      day: 'numeric'
    });
  },

  renderDashboardEmptyState(message, options = {}) {
    const iconMarkup = options.iconMarkup || `
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path>
      <polyline points="22,4 12,14.01 9,11.01"></polyline>
    `;
    const compactClass = options.compact ? ' compact' : '';
    const actionHtml = options.actionHtml || '';
    return `
      <div class="empty-state${compactClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          ${iconMarkup}
        </svg>
        <p>${this.escapeText(message || '')}</p>
        ${actionHtml}
      </div>
    `;
  },

  formatFileSize(byteValue) {
    const bytes = Number(byteValue);
    if (!Number.isFinite(bytes) || bytes <= 0) return '--';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const normalized = bytes / (1024 ** unitIndex);
    const precision = normalized >= 100 ? 0 : normalized >= 10 ? 1 : 2;
    return `${normalized.toFixed(precision)} ${units[unitIndex]}`;
  },

  getToneClass(seedValue) {
    const tones = ['tone-olive', 'tone-terracotta', 'tone-success', 'tone-blue'];
    const seed = String(seedValue || 'default');
    const hash = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0);
    return tones[Math.abs(hash) % tones.length];
  },

  getLocalizedCategoryLabel(category) {
    const normalized = String(category || '').trim();
    if (!normalized) return t('app.noCategory');
    const fallbackLabels = {
      language: I18n.getLocale() === 'en' ? 'Language' : '語言',
      wellness: I18n.getLocale() === 'en' ? 'Wellness' : '身心成長',
      culture: I18n.getLocale() === 'en' ? 'Culture' : '文化',
      stem: 'STEM',
      arts: I18n.getLocale() === 'en' ? 'Arts' : '藝術',
      business: I18n.getLocale() === 'en' ? 'Business' : '商業',
      technology: I18n.getLocale() === 'en' ? 'Technology' : '科技'
    };
    if (typeof window !== 'undefined' && window.categoryLabels) {
      return window.categoryLabels[String(normalized).toLowerCase()] || fallbackLabels[String(normalized).toLowerCase()] || normalized;
    }
    return fallbackLabels[String(normalized).toLowerCase()] || normalized;
  },

  isInternalCourseIdentifier(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    return /^(course|crs|cls)_[a-z0-9]{6,}$/i.test(normalized) || /^COURSE#/i.test(normalized);
  },

  getDisplayCourseCode(course = {}) {
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

  getLicenseStatusMeta(status) {
    const normalizedStatus = String(status || '').toLowerCase();
    if (normalizedStatus === 'active') {
      return { label: t('app.licActive'), badgeClass: 'active' };
    }
    if (normalizedStatus === 'expired') {
      return { label: t('app.licExpired'), badgeClass: 'warning' };
    }
    return {
      label: normalizedStatus ? normalizedStatus.replace(/_/g, ' ') : '-',
      badgeClass: 'pending'
    };
  },

  getQuizStateMeta(quiz = {}) {
    const rawStatus = String(quiz.userStatus || quiz.status || '').toLowerCase();
    const attempts = Number(quiz.attempts || quiz.attemptCount || 0);
    const hasAttempts = quiz.attempted === true || attempts > 0;
    const hasScore = quiz.bestScore !== undefined && quiz.bestScore !== null && quiz.bestScore !== '';
    const inProgressLabel = I18n.getLocale() === 'en' ? 'In Progress' : '進行中';

    let state = 'not_started';
    if (['completed', 'passed', 'submitted'].includes(rawStatus) || (quiz.completed === true) || (hasScore && rawStatus !== 'in_progress')) {
      state = 'completed';
    } else if (['in_progress', 'attempted', 'active'].includes(rawStatus) || hasAttempts) {
      state = 'in_progress';
    }

    if (state === 'completed') {
      return {
        state,
        badgeLabel: t('app.completedQuizzes'),
        badgeClass: 'is-completed',
        actionLabel: t('app.viewResults'),
        actionIcon: '<polyline points="20 6 9 17 4 12"/>'
      };
    }

    if (state === 'in_progress') {
      return {
        state,
        badgeLabel: inProgressLabel,
        badgeClass: 'is-progress',
        actionLabel: t('app.continueQuiz'),
        actionIcon: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'
      };
    }

    return {
      state: 'not_started',
      badgeLabel: t('app.notAttempted'),
      badgeClass: 'is-idle',
      actionLabel: t('app.startQuiz'),
      actionIcon: '<polygon points="5,3 19,12 5,21"/>'
    };
  },

  renderQuizRowCard(quiz, options = {}) {
    const quizId = quiz.quizId || quiz.id || '';
    const title = this.escapeText(quiz.title || t('app.quiz'));
    const description = this.escapeText((quiz.description || '').trim()) || (I18n.getLocale() === 'en'
      ? 'Open this quiz to review the requirements, complete the questions, and track your best score.'
      : '開啟這份測驗以查看要求、完成作答並追蹤自己的最佳成績。');
    const questionCount = Number(quiz.questionCount || quiz.totalQuestions || 0);
    const passingScore = Number(quiz.passingScore || 60);
    const attempts = Number(quiz.attempts || quiz.attemptCount || 0);
    const bestScore = quiz.bestScore !== undefined && quiz.bestScore !== null && quiz.bestScore !== ''
      ? Number(quiz.bestScore)
      : null;
    const timeLimit = quiz.timeLimit || quiz.duration || null;
    const state = this.getQuizStateMeta(quiz);
    const rootAction = options.rootAction || '';
    const buttonAction = options.buttonAction || `App.startQuiz(${this.inlineActionValue(quizId)})`;
    const rootAttrs = rootAction
      ? ` role="button" tabindex="0" onclick="${rootAction}" onkeypress="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); ${rootAction}; }"`
      : '';
    const metaPills = [
      questionCount > 0 ? `<span class="quiz-row-meta-pill"><strong>${questionCount}</strong> ${this.escapeText(t('app.questions'))}</span>` : '',
      timeLimit ? `<span class="quiz-row-meta-pill">${this.escapeText(t('app.timeLimit', { n: timeLimit }))}</span>` : '',
      `<span class="quiz-row-meta-pill">${this.escapeText(t('app.passingScore'))} <strong>${passingScore}%</strong></span>`,
      attempts > 0 ? `<span class="quiz-row-meta-pill">${this.escapeText(t('app.attempted'))} <strong>${attempts}</strong> ${this.escapeText(t('app.times'))}</span>` : ''
    ].filter(Boolean).join('');

    const scoreMarkup = bestScore !== null && !Number.isNaN(bestScore)
      ? `
        <div class="quiz-row-score">
          <div class="quiz-row-score-value ${bestScore >= passingScore ? 'tone-success' : 'tone-terracotta'}">${bestScore}%</div>
          <div class="quiz-row-score-label">${this.escapeText(t('app.bestScore'))}</div>
        </div>
      `
      : '';

    return `
      <article class="quiz-row-card${rootAction ? ' is-clickable' : ''}"${rootAttrs}>
        <div class="quiz-row-main">
          <div class="quiz-row-topline">
            <h3 class="quiz-row-title">${title}</h3>
            <span class="quiz-status-pill ${state.badgeClass}">${this.escapeText(state.badgeLabel)}</span>
          </div>
          <p class="quiz-row-desc">${description}</p>
          <div class="quiz-row-meta">${metaPills}</div>
        </div>
        <div class="quiz-row-actions">
          ${scoreMarkup}
          <button type="button" class="quiz-launch-btn ${state.badgeClass}" onclick="event.stopPropagation(); ${buttonAction}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${state.actionIcon}</svg>
            <span>${this.escapeText(options.buttonLabel || state.actionLabel)}</span>
          </button>
        </div>
      </article>
    `;
  },

  // ============================================================
  // 動態視圖載入函數
  // ============================================================

  /**
   * 載入「我的課程」視圖
   */
  async loadMyCoursesView() {
    const container = document.getElementById('myCoursesContent');
    if (!container) return;
    container.innerHTML = `<div class="loading-indicator">${t('common.loading')}</div>`;
    try {
      const user = API.getCurrentUser();
      const role = this.isTeachingUser(user) ? 'instructor' : 'student';
      const result = await API.courses.getMyCourses(role);
      const courses = result.success ? (result.data || []) : [];
      if (courses.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>${t('app.noCourses')}</p><button onclick="showView('moodleCourses')" class="btn-primary">${t('app.browseCourses')}</button></div>`;
        return;
      }
      container.innerHTML = `
        <div class="courses-grid">
          ${courses.map(c => {
            const categoryLabel = this.getLocalizedCategoryLabel(c.category);
            const codeLabel = this.getDisplayCourseCode(c);
            const supportCode = [c.shortName, c.shortname]
              .map((value) => String(value || '').trim())
              .find((value) => value && value !== codeLabel && value.toLowerCase() !== String(c.title || '').trim().toLowerCase() && !this.isInternalCourseIdentifier(value)) || '';
            const summary = this.escapeText(this.truncateText(c.description || c.summary || (I18n.getLocale() === 'en' ? 'Continue learning in this course workspace.' : '在這個課程工作區中持續學習與互動。'), 110));
            const instructor = this.escapeText(c.instructorName || (I18n.getLocale() === 'en' ? 'Course instructor' : '課程教師'));
            return `
            <button type="button" class="course-card" onclick="MoodleUI.openCourse('${c.courseId}')">
              <div class="course-card-cover ${this.getToneClass(c.category || c.courseId || c.title)}">
                <div class="course-card-cover-top">
                  <span class="course-category">${categoryLabel}</span>
                  ${codeLabel ? `<span class="course-code-pill">${this.escapeText(codeLabel)}</span>` : ''}
                </div>
                <div class="course-card-cover-copy">
                  <h3>${c.title}</h3>
                  <p>${supportCode ? this.escapeText(supportCode) : instructor}</p>
                </div>
              </div>
              <div class="course-card-body">
                <p class="course-card-summary">${summary}</p>
                <div class="course-card-meta-row">
                  <div class="course-card-meta-stack">
                    <p class="course-instructor">${instructor}</p>
                    ${codeLabel ? `<span class="course-support-meta">${this.escapeText(codeLabel)}</span>` : ''}
                  </div>
                  <span class="course-open-link">${I18n.getLocale() === 'en' ? 'Open course' : '進入課程'} →</span>
                </div>
                ${c.progress !== undefined ? `
                  <div class="progress-bar-container">
                    <div class="progress-bar" data-progress-width="${this.clampProgressValue(c.progress)}"></div>
                    <span class="progress-text">${c.progress}%</span>
                  </div>
                ` : ''}
              </div>
            </button>
          `;
          }).join('')}
        </div>
      `;
      this.applyProgressData(container);
    } catch (error) {
      console.error('loadMyCoursesView error:', error);
      container.innerHTML = `<div class="error-state">${t('app.loadCourseFailed')}</div>`;
    }
  },

  /**
   * 載入授權管理視圖
   */
  async loadLicensesView() {
    const container = document.getElementById('licensesContent');
    if (!container) return;
    container.innerHTML = `<div class="loading-indicator">${t('common.loading')}</div>`;
    try {
      const result = await API.licenses.list();
      const licenses = result.success ? (result.data || []) : [];
      const activeCount = licenses.filter((license) => license.status === 'active').length;
      const expiredCount = licenses.filter((license) => license.status === 'expired').length;
      const totalNote = I18n.getLocale() === 'en'
        ? 'Licenses already assigned to platform resources.'
        : '目前已分配到平台資源的授權數量。';
      const activeNote = I18n.getLocale() === 'en'
        ? 'Resources learners can still access right now.'
        : '探橋者目前仍可使用的授權。';
      const expiredNote = I18n.getLocale() === 'en'
        ? 'Review these first if you need to reassign access.'
        : '若要重新指派內容權限，優先檢查這些授權。';

      container.innerHTML = `
        <section class="license-dashboard">
          <div class="license-stats">
            <article class="license-stat-card">
              <div class="license-stat-copy">
                <div class="license-stat-label">${this.escapeText(t('app.totalLicenses'))}</div>
                <div class="license-stat-value">${licenses.length}</div>
                <div class="license-stat-note">${this.escapeText(totalNote)}</div>
              </div>
              <div class="license-stat-icon tone-olive">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7"/><path d="M18 8v8"/><path d="M9 12h3"/><path d="M17 21l5-5"/><path d="M17 16h5v5"/></svg>
              </div>
            </article>
            <article class="license-stat-card">
              <div class="license-stat-copy">
                <div class="license-stat-label">${this.escapeText(t('app.activeLicenses'))}</div>
                <div class="license-stat-value">${activeCount}</div>
                <div class="license-stat-note">${this.escapeText(activeNote)}</div>
              </div>
              <div class="license-stat-icon tone-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/><path d="M12 3a9 9 0 1 1 0 18"/></svg>
              </div>
            </article>
            <article class="license-stat-card">
              <div class="license-stat-copy">
                <div class="license-stat-label">${this.escapeText(t('app.licExpired'))}</div>
                <div class="license-stat-value">${expiredCount}</div>
                <div class="license-stat-note">${this.escapeText(expiredNote)}</div>
              </div>
              <div class="license-stat-icon tone-terracotta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
              </div>
            </article>
          </div>

          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${t('app.licenseList')}</h2>
            </div>
            <div class="card-body card-body-flush">
              ${licenses.length === 0 ? `
                <div class="empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 13V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7"/><path d="M18 8v8"/><path d="M17 21l5-5"/><path d="M17 16h5v5"/></svg>
                  <p>${t('app.noLicenses')}</p>
                </div>
              ` : `
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>${t('app.licName')}</th>
                      <th>${t('app.licStatus')}</th>
                      <th>${t('app.licExpiry')}</th>
                      <th>${t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${licenses.map((license) => {
                      const expiryDate = license.expiresAt || license.expiryDate || '';
                      const licenseId = license.licenseId || license.id || '';
                      const title = license.name || license.resourceTitle || license.licenseId || t('app.course');
                      const typeLabel = license.licenseType === 'institutional'
                        ? t('app.institutionalLicense')
                        : license.licenseType === 'personal'
                          ? t('app.personalLicense')
                          : (license.licenseType || '-');
                      const statusMeta = this.getLicenseStatusMeta(license.status);
                      const daysLeft = this.getDaysUntil(expiryDate);
                      const expiryNote = Number.isFinite(daysLeft)
                        ? (daysLeft >= 0
                          ? (I18n.getLocale() === 'en' ? `${daysLeft} days left` : `距離到期 ${daysLeft} 天`)
                          : (I18n.getLocale() === 'en' ? `${Math.abs(daysLeft)} days overdue` : `已過期 ${Math.abs(daysLeft)} 天`))
                        : '-';

                      return `
                        <tr>
                          <td>
                            <div class="license-table-stack">
                              <div class="license-table-title">${this.escapeText(title)}</div>
                              <div class="license-table-subtitle">${this.escapeText(typeLabel)}</div>
                            </div>
                          </td>
                          <td><span class="status-badge ${statusMeta.badgeClass}">${this.escapeText(statusMeta.label)}</span></td>
                          <td>
                            <div class="license-table-stack">
                              <div class="license-table-title">${this.escapeText(this.formatLocaleDate(expiryDate))}</div>
                              <div class="license-table-note">${this.escapeText(expiryNote)}</div>
                            </div>
                          </td>
                          <td>
                            ${license.status === 'active' && licenseId
                              ? `<button type="button" class="btn-sm license-table-action" onclick="App.renewLicense(${this.inlineActionValue(licenseId)})">${this.escapeText(t('app.renewLicense'))}</button>`
                              : '<span class="license-table-note">-</span>'}
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        </section>
      `;
    } catch (error) {
      console.error('loadLicensesView error:', error);
      container.innerHTML = `<div class="error-state">${t('app.loadLicenseFailed')}</div>`;
    }
  },

  /**
   * 載入影音視圖
   */
  async loadVideosView() {
    const container = document.getElementById('videosContent');
    if (!container) return;
    container.innerHTML = `<div class="loading-indicator">${t('common.loading')}</div>`;
    try {
      if (typeof window.hydrateVideoProgressFromBackend === 'function') {
        await window.hydrateVideoProgressFromBackend();
      }
      const result = await API.resources.list({ type: 'video' });
      const videos = result.success ? (result.data || []) : [];
      const escapeText = value => {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
        if (value === null || value === undefined) return '';
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };
      const inlineValue = value => `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
      const compactNumber = value => {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return '--';
        return new Intl.NumberFormat(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW', {
          notation: numericValue >= 1000 ? 'compact' : 'standard',
          maximumFractionDigits: numericValue >= 1000 ? 1 : 0
        }).format(numericValue);
      };

      const normalizedVideos = videos.map(video => {
        const videoId = video.resourceId || video.id || video.videoId || '';
        const existingMeta = typeof videoData !== 'undefined' && videoData[videoId] ? videoData[videoId] : {};
        const contentUrl = video.contentUrl || video.videoUrl || video.url || '';
        const youtubeId = (typeof getYouTubeId === 'function' && contentUrl) ? getYouTubeId(contentUrl) : null;
        const progress = Math.max(0, Math.min(100, Number(video.progress ?? video.userProgress ?? existingMeta.progress ?? 0) || 0));
        const category = video.category || video.subject || (Array.isArray(video.tags) && video.tags[0]) || '影音橋段';
        const author = video.creatorName || video.authorName || video.author || existingMeta.author || t('app.unknownAuthor');
        const viewsValue = video.viewCount ?? video.views ?? existingMeta.views ?? null;
        const duration = video.duration || video.length || existingMeta.duration || '--:--';
        const description = video.description || video.summary || existingMeta.description || '';

        if (typeof videoData !== 'undefined' && videoId) {
          videoData[videoId] = {
            ...existingMeta,
            title: video.title || existingMeta.title || t('video.untitled'),
            author,
            duration,
            views: viewsValue !== null && viewsValue !== undefined ? compactNumber(viewsValue) : (existingMeta.views || '--'),
            youtubeId: youtubeId || existingMeta.youtubeId || null,
            description,
            progress
          };
        }

        return {
          ...video,
          videoId,
          contentUrl,
          youtubeId,
          progress,
          category,
          author,
          duration,
          description,
          viewsLabel: viewsValue !== null && viewsValue !== undefined ? compactNumber(viewsValue) : '--'
        };
      });

      const startedCount = normalizedVideos.filter(video => video.progress > 0).length;
      const completedCount = normalizedVideos.filter(video => video.progress >= 100).length;

      container.innerHTML = `
        <section class="video-library-shell">
          <div class="video-library-header">
            <div class="video-library-copy">
              <span class="video-library-count">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23,7 16,12 23,17"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <span>${normalizedVideos.length} ${t('app.videoCount')}</span>
              </span>
              <h2 class="video-library-title">${t('sidebar.videos') || '影音橋段'}</h2>
              <p class="video-library-subtitle">把影片列表收斂成同一套平台語言，保留進度、作者與分類資訊，點進去會直接接到新版 viewer shell。</p>
            </div>
          </div>

          <div class="video-library-stats">
            <div class="video-library-stat">
              <div class="video-library-stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23,7 16,12 23,17"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </div>
              <div>
                <div class="video-library-stat-value">${normalizedVideos.length}</div>
                <div class="video-library-stat-label">可用影片</div>
              </div>
            </div>
            <div class="video-library-stat">
              <div class="video-library-stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <div class="video-library-stat-value">${startedCount}</div>
                <div class="video-library-stat-label">已開始學習</div>
              </div>
            </div>
            <div class="video-library-stat">
              <div class="video-library-stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <div class="video-library-stat-value">${completedCount}</div>
                <div class="video-library-stat-label">已完成</div>
              </div>
            </div>
          </div>

          <div class="video-library-toolbar">
            <div class="bridge-form-group flush">
              <label class="bridge-form-label" for="videoSearch">搜尋影片</label>
              <input id="videoSearch" type="text" class="bridge-form-control" placeholder="搜尋標題或作者" oninput="filterVideos()">
            </div>
            <div class="bridge-form-group flush">
              <label class="bridge-form-label" for="videoCategory">分類</label>
              <select id="videoCategory" class="bridge-form-control" onchange="filterVideos()">
                <option value="">全部分類</option>
                ${Array.from(new Set(normalizedVideos.map(video => video.category).filter(Boolean))).map(category => `<option value="${escapeText(category)}">${escapeText(category)}</option>`).join('')}
              </select>
            </div>
            <div class="bridge-form-group flush">
              <label class="bridge-form-label" for="videoDuration">學習狀態</label>
              <select id="videoDuration" class="bridge-form-control" onchange="filterVideos()">
                <option value="">全部狀態</option>
                <option value="not_started">尚未開始</option>
                <option value="in_progress">學習中</option>
                <option value="completed">已完成</option>
              </select>
            </div>
          </div>

          <div id="videoGrid" class="video-library-grid">
            ${normalizedVideos.map(video => `
              <article
                class="video-card video-library-card"
                data-video-id="${escapeText(video.videoId)}"
                data-title="${escapeText((video.title || '').toLowerCase())}"
                data-author="${escapeText((video.author || '').toLowerCase())}"
                data-category="${escapeText(video.category || '')}"
                data-progress="${video.progress}"
                onclick="openVideoPlayer && openVideoPlayer(${inlineValue(video.videoId)}, ${video.contentUrl ? inlineValue(video.contentUrl) : 'undefined'})">
                <div class="video-library-thumb">
                  <div class="video-library-play">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16" fill="currentColor"/></svg>
                  </div>
                  <div class="video-library-thumb-meta">
                    <span class="video-library-chip">${escapeText(video.category || '影音橋段')}</span>
                    <span class="video-library-duration">${escapeText(video.duration || '--:--')}</span>
                  </div>
                </div>
                <div class="video-library-body">
                  <div>
                    <h3 class="video-library-card-title">${escapeText(video.title || t('video.untitled'))}</h3>
                    <p class="video-library-card-desc">${escapeText((video.description || '').trim() ? (String(video.description).replace(/\s+/g, ' ').trim().slice(0, 120) + (String(video.description).replace(/\s+/g, ' ').trim().length > 120 ? '...' : '')) : t('video.noDescription'))}</p>
                  </div>
                  <div class="video-library-card-meta">
                    <span class="video-library-meta-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <span>${escapeText(video.author)}</span>
                    </span>
                    <span class="video-library-meta-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                      <span>${escapeText(t('video.viewsLabel', { count: video.viewsLabel }))}</span>
                    </span>
                  </div>
                  <div class="video-library-progress-block">
                    <div class="video-library-progress-head">
                      <span>${t('video.progressTitle')}</span>
                      <span>${video.progress}%</span>
                    </div>
                    <div class="video-progress">
                      <div class="video-progress-fill" data-progress-width="${this.clampProgressValue(video.progress)}"></div>
                    </div>
                  </div>
                  <div class="video-library-card-actions">
                    <button type="button" class="video-library-card-action secondary" onclick="event.stopPropagation(); addToPlaylist(${inlineValue(video.videoId)})">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      <span>${t('video.watchLater')}</span>
                    </button>
                    <button type="button" class="video-library-card-action primary" onclick="event.stopPropagation(); openVideoPlayer && openVideoPlayer(${inlineValue(video.videoId)}, ${video.contentUrl ? inlineValue(video.contentUrl) : 'undefined'})">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"/></svg>
                      <span>${t('video.playNow')}</span>
                    </button>
                  </div>
                </div>
              </article>
            `).join('')}
            ${normalizedVideos.length === 0 ? `
              <div class="discussion-state full-span">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="23,7 16,12 23,17"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <div class="discussion-state-title">${t('app.noVideos')}</div>
                <div class="discussion-state-copy">${t('video.noVideosCopy')}</div>
              </div>
            ` : ''}
          </div>
        </section>
      `;
      this.applyProgressData(container);
    } catch (error) {
      console.error('loadVideosView error:', error);
      container.innerHTML = `<div class="error-state">${t('app.loadVideoFailed')}</div>`;
    }
  },

  /**
   * 載入測驗列表視圖
   */
  async loadQuizzesListView() {
    const container = document.getElementById('quizzesListContent');
    if (!container) return;
    container.innerHTML = `<div class="loading-indicator">${t('common.loading')}</div>`;
    try {
      const result = await API.quizzes.list();
      const quizzes = result.success ? (result.data || []) : [];
      const completed = quizzes.filter((quiz) => this.getQuizStateMeta(quiz).state === 'completed').length;
      const inProgress = quizzes.filter((quiz) => this.getQuizStateMeta(quiz).state === 'in_progress').length;
      const idleCount = quizzes.length - completed - inProgress;
      const summaryTotalNote = I18n.getLocale() === 'en'
        ? 'Every quiz currently visible in this learning workspace.'
        : '目前在這個探橋空間可查看的所有測驗。';
      const summaryCompletedNote = I18n.getLocale() === 'en'
        ? 'Quizzes already submitted and ready for result review.'
        : '已提交並可回看結果的測驗。';
      const summaryIdleNote = I18n.getLocale() === 'en'
        ? 'Quizzes learners have not started yet.'
        : '探橋者尚未開始作答的測驗。';

      container.innerHTML = `
        <section class="quiz-shell">
          <div class="quiz-summary-grid">
            <article class="quiz-summary-card">
              <div class="quiz-summary-copy">
                <div class="quiz-summary-label">${this.escapeText(t('app.totalQuizzes'))}</div>
                <div class="quiz-summary-value">${quizzes.length}</div>
                <div class="quiz-summary-note">${this.escapeText(summaryTotalNote)}</div>
              </div>
              <div class="quiz-summary-icon tone-olive">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
            </article>
            <article class="quiz-summary-card">
              <div class="quiz-summary-copy">
                <div class="quiz-summary-label">${this.escapeText(t('app.completedQuizzes'))}</div>
                <div class="quiz-summary-value">${completed}</div>
                <div class="quiz-summary-note">${this.escapeText(summaryCompletedNote)}</div>
              </div>
              <div class="quiz-summary-icon tone-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/><path d="M12 3a9 9 0 1 1 0 18"/></svg>
              </div>
            </article>
            <article class="quiz-summary-card">
              <div class="quiz-summary-copy">
                <div class="quiz-summary-label">${this.escapeText(t('app.notAttempted'))}</div>
                <div class="quiz-summary-value">${idleCount}</div>
                <div class="quiz-summary-note">${this.escapeText(summaryIdleNote)}</div>
              </div>
              <div class="quiz-summary-icon tone-terracotta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
              </div>
            </article>
          </div>

          <div class="quiz-list-shell">
            ${quizzes.length === 0
              ? `
                <div class="empty-state quiz-empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <p>${t('app.noQuizzes')}</p>
                </div>
              `
              : quizzes.map((quiz) => this.renderQuizRowCard(quiz, {
                  rootAction: `typeof MoodleUI !== 'undefined' && MoodleUI.openQuiz && MoodleUI.openQuiz(${this.inlineActionValue(quiz.quizId || quiz.id || '')})`,
                  buttonAction: `typeof MoodleUI !== 'undefined' && MoodleUI.openQuiz && MoodleUI.openQuiz(${this.inlineActionValue(quiz.quizId || quiz.id || '')})`
                })).join('')}
          </div>
        </section>
      `;
    } catch (error) {
      console.error('loadQuizzesListView error:', error);
      container.innerHTML = `<div class="error-state">${t('toast.quizLoadFailed')}</div>`;
    }
  },

  /**
   * 載入討論列表視圖
   */
  async loadDiscussionsListView() {
    const container = document.getElementById('discussionsListContent');
    if (!container) return;
    container.innerHTML = `<div class="loading-indicator">${t('common.loading')}</div>`;
    try {
      const result = await API.discussions.list();
      const posts = result.success ? (result.data || []) : [];
      const toInlineActionValue = value => `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
      const renderState = typeof window.renderDiscussionState === 'function'
        ? window.renderDiscussionState
        : (message, variant = 'empty') => `<div class="discussion-state${variant === 'error' ? ' is-error' : ''}"><div class="discussion-state-title">${variant === 'error' ? t('common.error') : t('app.noDiscussions')}</div><div class="discussion-state-copy">${message}</div></div>`;
      const renderCard = typeof window.renderDiscussionCard === 'function'
        ? window.renderDiscussionCard
        : post => `<article class="discussion-card"><div class="discussion-content"><h3 class="discussion-title">${post.title || ''}</h3></div></article>`;

      container.innerHTML = `
        <section class="discussions-shell">
          <div class="discussions-header">
            <div class="discussions-header-copy">
              <span class="discussion-count-pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>${posts.length} ${t('app.discussionCount')}</span>
              </span>
              <h2 class="discussions-title">${t('sidebar.discussions')}</h2>
              <p class="discussions-subtitle">這裡整理平台上的最新主題摘要。你可以直接發布新討論，或前往課程論壇查看完整脈絡與回覆。</p>
            </div>
            <div class="discussions-header-actions">
              <button type="button" class="btn-secondary discussion-header-btn" onclick="showView('moodleForums'); if (typeof MoodleUI !== 'undefined' && typeof MoodleUI.loadForums === 'function') { MoodleUI.loadForums(); }">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>${t('sidebar.forums')}</span>
              </button>
              <button type="button" class="btn-primary discussion-header-btn" onclick="openNewPostModal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>${t('app.startDiscussion')}</span>
              </button>
            </div>
          </div>
          <div class="discussion-list">
            ${posts.length === 0
              ? renderState('目前還沒有可顯示的主題。你可以先發起一則討論，或前往課程論壇查看更完整的社群交流。')
              : posts.map(post => renderCard(post, {
                  openAction: `App.openDiscussion(${toInlineActionValue(post.id || post.postId || '')})`,
                  replyAction: (post.id || post.postId) ? `toggleReplies(${toInlineActionValue(post.id || post.postId)})` : ''
                })).join('')}
          </div>
        </section>
      `;
    } catch (error) {
      console.error('loadDiscussionsListView error:', error);
      container.innerHTML = typeof window.renderDiscussionState === 'function'
        ? window.renderDiscussionState(t('toast.discussionLoadFailed'), 'error')
        : `<div class="error-state">${t('toast.discussionLoadFailed')}</div>`;
    }
  },

  async loadFilesView() {
    const container = document.getElementById('filesContent');
    if (!container) return;
    container.innerHTML = `
      <section class="management-shell">
        <div class="bridge-state">
          <div class="bridge-state-title">${this.escapeText(t('common.loading'))}</div>
        </div>
      </section>
    `;
    try {
      const result = await API.files.list();
      const files = result.success ? (result.data || []) : [];
      const locale = I18n.getLocale();
      const fileSummary = locale === 'en'
        ? `${files.length} file${files.length === 1 ? '' : 's'} in your library`
        : `目前共有 ${files.length} 份檔案可管理`;

      container.innerHTML = `
        <section class="management-shell">
          <div class="management-header">
            <div class="management-heading">
              <div class="management-title">${this.escapeText(t('app.myFiles'))}</div>
              <div class="management-copy">${this.escapeText(fileSummary)}</div>
            </div>
            <div class="management-inline-actions">
              <button type="button" onclick="document.getElementById('fileUploadInput').click()" class="bridge-primary-btn">${this.escapeText(t('app.uploadFile'))}</button>
              <input type="file" id="fileUploadInput" class="file-upload-input" onchange="App.handleFileUpload(this)">
            </div>
          </div>
          <div class="management-list">
            ${files.map(file => {
              const fileId = file.fileId || file.id || '';
              const fileName = this.escapeText(file.fileName || file.filename || file.name || 'file');
              const fileSize = this.escapeText(this.formatFileSize(file.size));
              const createdAt = this.escapeText(this.formatLocaleDate(file.createdAt));
              const deleteAction = fileId
                ? `<button type="button" onclick="App.deleteFile(${this.inlineActionValue(fileId)})" class="btn-sm btn-danger">${this.escapeText(t('app.delete'))}</button>`
                : '';
              return `
                <article class="management-card">
                  <div class="file-row">
                    <div class="file-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                        <polyline points="14,2 14,8 20,8"></polyline>
                      </svg>
                    </div>
                    <div class="file-content">
                      <div class="file-title">${fileName}</div>
                      <div class="file-meta">
                        <span class="file-meta-item">${fileSize}</span>
                        <span class="file-meta-item">${createdAt}</span>
                      </div>
                    </div>
                    <div class="file-actions">
                      ${deleteAction}
                    </div>
                  </div>
                </article>
              `;
            }).join('')}
            ${files.length === 0 ? `
              <div class="management-card management-empty">
                <div class="empty-state">
                  <p>${this.escapeText(t('app.noFiles'))}</p>
                </div>
              </div>
            ` : ''}
          </div>
        </section>
      `;
    } catch (error) {
      console.error('loadFilesView error:', error);
      container.innerHTML = `
        <section class="management-shell">
          <div class="bridge-state-error">${this.escapeText(t('app.loadFilesFailed'))}</div>
        </section>
      `;
    }
  },

  async handleFileUpload(input) {
    if (!input.files || !input.files[0]) return;
    try {
      showToast(t('toast.uploading'));
      const result = await API.files.upload(input.files[0]);
      if (result.success) {
        showToast(t('toast.uploadSuccess'));
        this.loadFilesView();
      } else {
        showToast(result.message || t('toast.uploadFailed'));
      }
    } catch (error) {
      showToast(t('toast.uploadFailed'));
    }
    input.value = '';
  },

  async deleteFile(fileId) {
    const confirmed = await showConfirmDialog({
      message: t('confirm.deleteFile'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.files.delete(fileId);
      if (result.success) {
        showToast(t('toast.fileDeleted'));
        this.loadFilesView();
      } else {
        showToast(result.message || t('toast.fileDeleteFailed'));
      }
    } catch (error) {
      showToast(t('toast.fileDeleteFailed'));
    }
  },

  async loadGroupsManagerView() {
    const container = document.getElementById('groupsManagerContent');
    if (!container) return;
    container.innerHTML = `
      <section class="management-shell">
        <div class="bridge-state">
          <div class="bridge-state-title">${this.escapeText(t('common.loading'))}</div>
        </div>
      </section>
    `;
    try {
      const coursesResult = await API.courses.getMyCourses('instructor');
      const courses = coursesResult.success ? (coursesResult.data || []) : [];
      const teacherCourses = courses;
      const locale = I18n.getLocale();
      const untitledCourseLabel = locale === 'en' ? 'Untitled Course' : '未命名課程';

      if (teacherCourses.length === 0) {
        container.innerHTML = `
          <section class="management-shell">
            <div class="empty-state">
              <p>${this.escapeText(t('app.noManagedCourses'))}</p>
            </div>
          </section>
        `;
        return;
      }

      container.innerHTML = `
        <section class="management-shell">
          <div class="management-header">
            <div class="management-heading">
              <div class="management-title">${this.escapeText(t('app.groupManagement'))}</div>
              <div class="management-copy">${this.escapeText(t('app.selectCourseToManageGroups'))}</div>
            </div>
            <div class="management-copy">${this.escapeText(locale === 'en' ? `${teacherCourses.length} course${teacherCourses.length === 1 ? '' : 's'}` : `可管理 ${teacherCourses.length} 門課程`)}</div>
          </div>
          <div class="course-picker-grid">
            ${teacherCourses.map(course => `
              <button type="button" class="management-card interactive course-picker-card" onclick="App.openCourseGroups(${this.inlineActionValue(course.courseId)})">
                <span class="course-picker-info">
                  <span class="course-picker-title">${this.escapeText(course.title || untitledCourseLabel)}</span>
                  <span class="course-picker-subtitle">${this.escapeText(course.shortName || course.courseId || '')}</span>
                </span>
                <span class="course-picker-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14"></path>
                    <path d="m12 5 7 7-7 7"></path>
                  </svg>
                </span>
              </button>
            `).join('')}
          </div>
        </section>
      `;
    } catch (error) {
      console.error('loadGroupsManagerView error:', error);
      container.innerHTML = `
        <section class="management-shell">
          <div class="bridge-state-error">${this.escapeText(t('app.loadFailed'))}</div>
        </section>
      `;
    }
  },

  async openCourseGroups(courseId) {
    const container = document.getElementById('groupsManagerContent');
    if (!container) return;
    container.innerHTML = `
      <section class="management-shell">
        <div class="bridge-state">
          <div class="bridge-state-title">${this.escapeText(t('common.loading'))}</div>
        </div>
      </section>
    `;
    try {
      const result = await API.courseGroups.list(courseId);
      const groups = result.success ? (result.data || []) : [];
      const course = Array.isArray(this.coursesCache)
        ? this.coursesCache.find(item => item.courseId === courseId || item.id === courseId)
        : null;
      const locale = I18n.getLocale();
      const groupSummary = locale === 'en'
        ? `${groups.length} group${groups.length === 1 ? '' : 's'} in this course`
        : `目前共有 ${groups.length} 個群組`;
      const untitledGroupLabel = locale === 'en' ? 'Untitled Group' : '未命名群組';
      const emptyGroupDescription = locale === 'en' ? 'No group description yet.' : '尚未提供群組說明。';

      container.innerHTML = `
        <section class="management-shell">
          <div class="management-header">
            <div class="management-heading">
              <div class="management-title">${this.escapeText(course?.title || t('app.groupManagement'))}</div>
              <div class="management-copy">${this.escapeText(groupSummary)}</div>
            </div>
            <div class="management-inline-actions">
              <button type="button" onclick="App.loadGroupsManagerView()" class="bridge-secondary-btn">← ${this.escapeText(t('app.back'))}</button>
              <button type="button" onclick="App.createGroupPrompt(${this.inlineActionValue(courseId)})" class="bridge-primary-btn">${this.escapeText(t('app.addGroup'))}</button>
            </div>
          </div>
          <div class="group-grid">
            ${groups.map(group => {
              const groupId = group.groupId || group.id || '';
              return `
              <article class="management-card">
                <div class="group-card-surface">
                  <div class="group-card-header">
                    <div class="management-heading">
                      <div class="group-card-title">${this.escapeText(group.name || untitledGroupLabel)}</div>
                      <div class="group-card-description">${this.escapeText(group.description || emptyGroupDescription)}</div>
                    </div>
                    <span class="group-member-badge">${this.escapeText(String(group.memberCount || 0))} ${this.escapeText(t('app.memberCount'))}</span>
                  </div>
                  <div class="management-inline-actions">
                    <button type="button" onclick="App.deleteGroup(${this.inlineActionValue(courseId)}, ${this.inlineActionValue(groupId)})" class="btn-sm btn-danger">${this.escapeText(t('app.delete'))}</button>
                  </div>
                </div>
              </article>
            `;
            }).join('')}
            ${groups.length === 0 ? `
              <div class="management-card management-empty">
                <div class="empty-state">
                  <p>${this.escapeText(t('app.noGroups'))}</p>
                </div>
              </div>
            ` : ''}
          </div>
        </section>
      `;
    } catch (error) {
      console.error('openCourseGroups error:', error);
      container.innerHTML = `
        <section class="management-shell">
          <div class="bridge-state-error">${this.escapeText(t('app.loadGroupsFailed'))}</div>
        </section>
      `;
    }
  },

  async createGroupPrompt(courseId) {
    const name = await showPromptDialog({
      title: t('app.addGroup'),
      message: t('app.enterGroupName'),
      confirmLabel: t('common.confirm')
    });
    if (!name) return;
    try {
      const result = await API.courseGroups.create(courseId, { name });
      if (result.success) {
        showToast(t('toast.groupCreated'));
        this.openCourseGroups(courseId);
      } else {
        showToast(result.message || t('toast.groupCreateFailed'));
      }
    } catch (error) {
      showToast(t('toast.groupCreateFailed'));
    }
  },

  async deleteGroup(courseId, groupId) {
    const confirmed = await showConfirmDialog({
      message: t('confirm.deleteGroup'),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      const result = await API.courseGroups.delete(courseId, groupId);
      if (result.success) {
        showToast(t('toast.groupDeleted'));
        this.openCourseGroups(courseId);
      } else {
        showToast(result.message || t('toast.groupDeleteFailed'));
      }
    } catch (error) {
      showToast(t('toast.groupDeleteFailed'));
    }
  }
};

// 頁面載入時初始化
document.addEventListener('DOMContentLoaded', () => {
  // 確保 API 已載入
  if (typeof API !== 'undefined') {
    App.init();
  } else {
    console.error('API module not loaded');
  }
});

// 監聽語言切換事件 → 重新渲染側邊欄和頁面標題
window.addEventListener('localeChanged', () => {
  if (typeof App !== 'undefined' && App.currentUser) {
    App.updateSidebarByRole();
    App.updateUserUI();
  }
  // 重新設定當前頁面標題
  if (typeof showView === 'function' && typeof getPageTitle === 'function') {
    const currentView = document.querySelector('.view-section[style*="display: block"]');
    if (currentView) {
      const viewName = currentView.id?.replace('View', '') || 'dashboard';
      const titleEl = document.getElementById('pageTitle');
      if (titleEl) titleEl.innerHTML = getPageTitle(viewName);
    }
  }
});

// 匯出到全域
window.App = App;
