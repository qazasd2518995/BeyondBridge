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
          this.currentUser = result.data;
          API.setCurrentUser(result.data);
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
    document.getElementById('loginView').style.display = 'grid';
    document.getElementById('appContainer').style.display = 'none';
  },

  /**
   * 顯示主應用程式
   */
  showApp() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    this.updateUserUI();
    this.updateSidebarByRole();
  },

  /**
   * 根據用戶角色更新側邊欄
   */
  updateSidebarByRole() {
    const user = this.currentUser || API.getCurrentUser();
    if (!user) return;

    const isStudent = user.role === 'student';
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
        <a href="#" class="nav-item" data-view="gradebookManagement" onclick="showView('gradebookManagement'); MoodleUI.openGradebookManagement();">
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
        <a href="#" class="nav-item" data-view="learningPaths" onclick="showView('learningPaths'); MoodleUI.openLearningPaths();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 20V10"/>
            <path d="M12 20V4"/>
            <path d="M6 20v-6"/>
            <path d="M18 10l-6-6-6 6"/>
          </svg>
          ${t('nav.learningPaths')}
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
      <div class="nav-section" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.75rem; margin-top: 0.5rem;">
        <a href="#" class="nav-item" onclick="event.preventDefault(); I18n.setLocale(I18n.getLocale() === 'zh-TW' ? 'en' : 'zh-TW');" style="font-size: 0.85rem; opacity: 0.7;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
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
        <a href="#" class="nav-item" data-view="learningPaths" onclick="showView('learningPaths'); MoodleUI.openLearningPaths();">
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
        <div class="nav-section-title">${t('nav.community')}</div>
        <a href="#" class="nav-item" data-view="studentClasses" onclick="navigateTo(this, 'studentClasses')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          ${t('nav.myClasses')}
        </a>
        <a href="#" class="nav-item" data-view="moodleFiles" onclick="showView('moodleFiles');">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          ${t('nav.myFiles')}
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
      <div class="nav-section" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.75rem; margin-top: 0.5rem;">
        <a href="#" class="nav-item" onclick="event.preventDefault(); I18n.setLocale(I18n.getLocale() === 'zh-TW' ? 'en' : 'zh-TW');" style="font-size: 0.85rem; opacity: 0.7;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
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

    const isAdmin = user.role === 'admin' || user.isAdmin;

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
        'admin': t('role.admin'),
        'student': t('role.student')
      };
      userRole.textContent = roleMap[user.role] || user.role || t('role.default');
    }
    if (userAvatar) {
      const initial = (user.displayNameZh || user.displayName || t('app.user'))[0];
      userAvatar.textContent = initial;
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
    const profileBanner = settingsView.querySelector('.card-body');
    if (profileBanner) {
      const initial = (user.displayNameZh || user.displayName || t('app.user'))[0];
      const avatarDiv = profileBanner.querySelector('div[style*="width: 80px"]');
      if (avatarDiv) avatarDiv.textContent = initial;

      const nameH2 = profileBanner.querySelector('h2');
      if (nameH2) nameH2.textContent = user.displayName || user.displayNameZh || t('app.user');

      const emailP = profileBanner.querySelector('p');
      if (emailP) emailP.textContent = user.email || '';

      // 更新會員資訊
      const infoSpans = profileBanner.querySelectorAll('div[style*="display: flex; gap: 1.5rem"] span');
      if (infoSpans.length >= 3) {
        infoSpans[0].innerHTML = `<strong>${t('settings.memberLevel')}</strong> ${user.subscriptionTier === 'professional' ? t('settings.tierPro') : user.subscriptionTier === 'basic' ? t('settings.tierBasic') : t('settings.tierFree')}`;
        infoSpans[1].innerHTML = `<strong>${t('settings.joinDate')}</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : '-'}`;
        infoSpans[2].innerHTML = `<strong>${t('settings.licenseQuota')}</strong> ${user.licenseUsed || 0}/${user.licenseQuota || 0}`;
      }
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
        const updatedUser = { ...user, preferences };
        API.setCurrentUser(updatedUser);
        this.currentUser = updatedUser;
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
      const isStudent = user && user.role === 'student';

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
      const isTeacher = user && (user.role === 'educator' || user.role === 'trainer' || user.role === 'creator');
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
      if (studentDashboard) studentDashboard.style.display = 'none';
      if (teacherDashboard) teacherDashboard.style.display = 'block';
    } else {
      if (studentDashboard) studentDashboard.style.display = 'block';
      if (teacherDashboard) teacherDashboard.style.display = 'none';
    }

    // 學生專屬區塊
    if (urgentSection) {
      urgentSection.style.display = isStudent ? 'block' : 'none';
    }
    if (achievementsCard) {
      achievementsCard.style.display = isStudent ? 'block' : 'none';
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
          if (assignment.dueDate) {
            const dueDate = new Date(assignment.dueDate);
            if (dueDate > now && dueDate <= sevenDaysLater && assignment.status !== 'submitted') {
              deadlines.push({
                type: 'assignment',
                title: assignment.title,
                dueDate: dueDate,
                courseTitle: assignment.courseTitle,
                id: assignment.assignmentId
              });
            }
          }
        });
      }

      // 處理測驗截止日期
      if (quizzesRes.success && quizzesRes.data) {
        quizzesRes.data.forEach(quiz => {
          if (quiz.endDate || quiz.dueDate) {
            const dueDate = new Date(quiz.endDate || quiz.dueDate);
            if (dueDate > now && dueDate <= sevenDaysLater && quiz.status !== 'completed') {
              deadlines.push({
                type: 'quiz',
                title: quiz.title,
                dueDate: dueDate,
                courseTitle: quiz.courseTitle,
                id: quiz.quizId
              });
            }
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
      deadlineList.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 48px; height: 48px; margin-bottom: 0.5rem; opacity: 0.5;">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
          <p>${t('dashboard.noUrgentTasks')}</p>
        </div>
      `;
      return;
    }

    deadlineList.innerHTML = deadlines.slice(0, 5).map(item => {
      const daysLeft = Math.ceil((item.dueDate - new Date()) / (1000 * 60 * 60 * 24));
      const urgencyClass = daysLeft <= 2 ? 'urgent' : daysLeft <= 4 ? 'warning' : 'normal';
      const icon = item.type === 'assignment' ?
        `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>` :
        `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`;

      return `
        <div class="deadline-item" style="display: flex; align-items: center; padding: 0.75rem; border-radius: 8px; background: var(--surface-light); margin-bottom: 0.5rem; cursor: pointer;" onclick="showView('moodle${item.type === 'assignment' ? 'Assignments' : 'Quizzes'}');">
          <div class="deadline-icon ${urgencyClass}" style="width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; background: ${urgencyClass === 'urgent' ? 'var(--terracotta-light)' : urgencyClass === 'warning' ? 'var(--sand-light)' : 'var(--olive-light)'};">
            <svg viewBox="0 0 24 24" fill="none" stroke="${urgencyClass === 'urgent' ? 'var(--terracotta)' : urgencyClass === 'warning' ? 'var(--sand)' : 'var(--olive)'}" stroke-width="2" style="width: 18px; height: 18px;">
              ${icon}
            </svg>
          </div>
          <div class="deadline-info" style="flex: 1;">
            <div class="deadline-title" style="font-weight: 500; margin-bottom: 2px;">${item.title}</div>
            <div class="deadline-meta" style="font-size: 0.75rem; color: var(--text-secondary);">
              ${item.courseTitle || ''} ・ ${item.type === 'assignment' ? t('app.assignment') : t('app.quiz')}
            </div>
          </div>
          <div class="deadline-due" style="text-align: right;">
            <div class="days-left" style="font-weight: 600; color: ${urgencyClass === 'urgent' ? 'var(--terracotta)' : urgencyClass === 'warning' ? 'var(--sand)' : 'var(--olive)'};">
              ${daysLeft === 0 ? t('app.today') : daysLeft === 1 ? t('app.tomorrow') : t('app.daysLater', {days: daysLeft})}
            </div>
            <div class="due-date" style="font-size: 0.7rem; color: var(--text-secondary);">
              ${item.dueDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
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
        this.updateRecentBadgesUI(result.data.slice(0, 4));
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
      badgesList.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-secondary); grid-column: 1/-1;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 48px; height: 48px; margin-bottom: 0.5rem; opacity: 0.5;">
            <circle cx="12" cy="8" r="6"/>
            <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
          </svg>
          <p>${t('dashboard.earnBadges')}</p>
        </div>
      `;
      return;
    }

    const badgeColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#4CAF50', '#2196F3', '#9C27B0'];

    badgesList.innerHTML = badges.map((badge, index) => `
      <div class="badge-item" style="text-align: center; padding: 0.75rem; background: var(--surface-light); border-radius: 8px;">
        <div class="badge-icon" style="width: 48px; height: 48px; margin: 0 auto 0.5rem; background: ${badgeColors[index % badgeColors.length]}20; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="${badgeColors[index % badgeColors.length]}" stroke-width="2" style="width: 24px; height: 24px;">
            <circle cx="12" cy="8" r="6"/>
            <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
          </svg>
        </div>
        <div class="badge-name" style="font-size: 0.75rem; font-weight: 500;">${badge.name || badge.badgeName || t('app.badge')}</div>
      </div>
    `).join('');
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
      // 並行載入所有教師相關數據
      const [coursesRes, assignmentsRes, quizzesRes, forumsRes] = await Promise.all([
        API.courses.list(),
        API.assignments.list(),
        API.quizzes.list(),
        API.forums.list()
      ]);

      // 計算待處理事項
      let pendingAssignments = 0;
      let pendingQuizzes = 0;
      let pendingForums = 0;

      if (assignmentsRes.success && assignmentsRes.data) {
        pendingAssignments = assignmentsRes.data.filter(a => a.pendingGrading > 0 || a.status === 'pending').length;
      }

      if (quizzesRes.success && quizzesRes.data) {
        pendingQuizzes = quizzesRes.data.filter(q => q.pendingReview > 0 || q.status === 'pending').length;
      }

      if (forumsRes.success && forumsRes.data) {
        pendingForums = forumsRes.data.filter(f => f.unrepliedPosts > 0).length;
      }

      // 更新待處理事項 UI
      const pendingAssignmentsEl = document.getElementById('pendingAssignments');
      const pendingQuizzesEl = document.getElementById('pendingQuizzes');
      const pendingForumsEl = document.getElementById('pendingForums');

      if (pendingAssignmentsEl) pendingAssignmentsEl.textContent = pendingAssignments;
      if (pendingQuizzesEl) pendingQuizzesEl.textContent = pendingQuizzes;
      if (pendingForumsEl) pendingForumsEl.textContent = pendingForums;

      // 更新統計卡片
      if (coursesRes.success && coursesRes.data) {
        const courses = coursesRes.data;
        const totalStudents = courses.reduce((sum, c) => sum + (c.studentCount || 0), 0);
        const avgProgress = courses.length > 0 ?
          Math.round(courses.reduce((sum, c) => sum + (c.avgProgress || 0), 0) / courses.length) : 0;

        const totalStudentsEl = document.getElementById('teacherTotalStudents');
        const activeCoursesEl = document.getElementById('teacherActiveCourses');
        const avgProgressEl = document.getElementById('teacherAvgProgress');

        if (totalStudentsEl) totalStudentsEl.textContent = totalStudents;
        if (activeCoursesEl) activeCoursesEl.textContent = courses.length;
        if (avgProgressEl) avgProgressEl.textContent = `${avgProgress}%`;

        // 更新課程列表
        this.updateTeacherCourseList(courses);
      }

      // 載入學生警示和最近提交
      await Promise.all([
        this.loadStudentAlerts(),
        this.loadRecentSubmissions()
      ]);
    } catch (error) {
      console.error('Load teacher dashboard data error:', error);
    }
  },

  /**
   * 更新教師課程列表
   */
  updateTeacherCourseList(courses) {
    const courseList = document.getElementById('teacherCourseList');
    if (!courseList) return;

    if (courses.length === 0) {
      courseList.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 48px; height: 48px; margin-bottom: 0.5rem; opacity: 0.5;">
            <polygon points="12,2 2,7 12,12 22,7"/>
            <polyline points="2,17 12,22 22,17"/>
            <polyline points="2,12 12,17 22,12"/>
          </svg>
          <p>${t('teacher.noCourses')}</p>
          <a href="#" onclick="MoodleUI.showCreateCourseModal();" style="color: var(--olive); text-decoration: underline;">${t('teacher.createFirstCourse')}</a>
        </div>
      `;
      return;
    }

    const colors = [
      { bg: 'var(--olive-light)', color: 'var(--olive)' },
      { bg: 'var(--terracotta-light)', color: 'var(--terracotta)' },
      { bg: 'var(--sand-light)', color: 'var(--sand)' },
      { bg: '#E3F2FD', color: '#1976D2' }
    ];

    courseList.innerHTML = courses.slice(0, 4).map((course, index) => {
      const colorSet = colors[index % colors.length];
      return `
        <div class="teacher-course-item" style="display: flex; align-items: center; padding: 0.75rem; border-radius: 8px; background: var(--surface-light); margin-bottom: 0.5rem; cursor: pointer;" onclick="App.openCourse('${course.courseId}');">
          <div class="course-icon" style="width: 40px; height: 40px; border-radius: 8px; background: ${colorSet.bg}; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; flex-shrink: 0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="${colorSet.color}" stroke-width="2" style="width: 20px; height: 20px;">
              <polygon points="12,2 2,7 12,12 22,7"/>
              <polyline points="2,17 12,22 22,17"/>
              <polyline points="2,12 12,17 22,12"/>
            </svg>
          </div>
          <div class="course-info" style="flex: 1; min-width: 0;">
            <div class="course-title" style="font-weight: 500; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${course.title || course.courseTitle || t('app.course')}</div>
            <div class="course-meta" style="font-size: 0.75rem; color: var(--text-secondary);">
              ${course.studentCount || 0} ${t('app.students')} ・ ${t('app.avgProgress')} ${course.avgProgress || 0}%
            </div>
          </div>
          <div class="course-stats" style="text-align: right;">
            ${course.pendingGrading > 0 ? `
              <span style="background: var(--terracotta-light); color: var(--terracotta); padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 500;">
                ${course.pendingGrading} ${t('app.pendingGrading')}
              </span>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * 載入學生狀態警示
   */
  async loadStudentAlerts() {
    try {
      // 從 API 獲取學生預警
      const result = await API.teachers.getAlerts();

      let alerts = [];
      if (result.success && result.data) {
        alerts = result.data.slice(0, 5); // 只顯示前 5 項
      }

      this.updateStudentAlertsUI(alerts);
    } catch (error) {
      console.error('Load student alerts error:', error);
      // 發生錯誤時顯示空列表
      this.updateStudentAlertsUI([]);
    }
  },

  /**
   * 更新學生警示 UI
   */
  updateStudentAlertsUI(alerts) {
    const alertsList = document.getElementById('studentAlertsList');
    const alertCount = document.getElementById('studentAlertCount');

    if (alertCount) {
      alertCount.textContent = `${alerts.length} ${t('app.items')}`;
      alertCount.style.display = alerts.length > 0 ? 'inline-block' : 'none';
    }

    if (!alertsList) return;

    if (alerts.length === 0) {
      alertsList.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 48px; height: 48px; margin-bottom: 0.5rem; opacity: 0.5;">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
          <p>${t('teacher.noStudentAlerts')}</p>
        </div>
      `;
      return;
    }

    const alertTypes = {
      behind: { icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', color: 'var(--terracotta)', bg: 'var(--terracotta-light)' },
      missing: { icon: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="9" y1="15" x2="15" y2="15"/>', color: 'var(--sand)', bg: 'var(--sand-light)' },
      inactive: { icon: '<circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>', color: '#1976D2', bg: '#E3F2FD' },
      declining: { icon: '<polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/>', color: 'var(--terracotta)', bg: 'var(--terracotta-light)' }
    };

    alertsList.innerHTML = alerts.map(alert => {
      const config = alertTypes[alert.type] || alertTypes.behind;
      return `
        <div class="alert-item" style="display: flex; align-items: center; padding: 0.75rem; border-radius: 8px; background: var(--surface-light); margin-bottom: 0.5rem;">
          <div class="alert-icon" style="width: 36px; height: 36px; border-radius: 8px; background: ${config.bg}; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="${config.color}" stroke-width="2" style="width: 18px; height: 18px;">
              ${config.icon}
            </svg>
          </div>
          <div class="alert-info" style="flex: 1;">
            <div class="alert-student" style="font-weight: 500; margin-bottom: 2px;">${alert.studentName}</div>
            <div class="alert-message" style="font-size: 0.75rem; color: var(--text-secondary);">
              ${alert.message}${alert.courseTitle ? ` - ${alert.courseTitle}` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * 載入最近提交
   */
  async loadRecentSubmissions() {
    try {
      const result = await API.assignments.list();
      let submissions = [];

      if (result.success && result.data) {
        // 從作業中提取最近提交
        submissions = result.data
          .filter(a => a.submissions && a.submissions.length > 0)
          .flatMap(a => a.submissions.map(s => ({
            studentName: s.studentName || t('app.user'),
            assignmentTitle: a.title,
            submittedAt: s.submittedAt || s.createdAt,
            status: s.status
          })))
          .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
          .slice(0, 5);
      }

      this.updateRecentSubmissionsUI(submissions);
    } catch (error) {
      console.error('Load recent submissions error:', error);
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
      submissionsList.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 1.5rem; color: var(--text-secondary);">
          <p>${t('teacher.noSubmissions')}</p>
        </div>
      `;
      return;
    }

    submissionsList.innerHTML = submissions.map(sub => {
      const timeAgo = this.formatTimeAgo(sub.submittedAt);
      const statusColor = sub.status === 'graded' ? 'var(--success)' :
                         sub.status === 'pending' ? 'var(--sand)' : 'var(--text-secondary)';

      return `
        <div class="submission-item" style="display: flex; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-100);">
          <div class="submission-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: var(--olive-light); display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; font-size: 0.75rem; font-weight: 600; color: var(--olive);">
            ${(sub.studentName || '?')[0]}
          </div>
          <div class="submission-info" style="flex: 1; min-width: 0;">
            <div style="font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              <strong>${sub.studentName}</strong> ${t('app.submitted')} <span style="color: var(--olive);">${sub.assignmentTitle}</span>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-secondary);">${timeAgo}</div>
          </div>
          <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};" title="${sub.status === 'graded' ? t('app.statusCompleted') : t('app.pendingGrading')}"></div>
        </div>
      `;
    }).join('');
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
      }
    }

    // 更新課程頁面
    const coursesGrid = document.querySelector('#coursesView .course-list');
    if (coursesGrid) {
      coursesGrid.innerHTML = this.coursesCache.map(course => this.renderCourseItem(course)).join('');
    }
  },

  /**
   * 渲染課程項目
   */
  renderCourseItem(course) {
    const colors = [
      'linear-gradient(135deg, var(--olive) 0%, var(--olive-light) 100%)',
      'linear-gradient(135deg, var(--terracotta) 0%, var(--terracotta-light) 100%)',
      'linear-gradient(135deg, var(--success) 0%, var(--sage) 100%)'
    ];
    const colorIndex = Math.abs(course.courseId?.charCodeAt(0) || 0) % colors.length;

    return `
      <div class="course-item" onclick="App.openCourse('${course.courseId}')">
        <div class="course-thumbnail" style="background: ${colors[colorIndex]}">
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
              <div class="progress-fill" style="width: ${course.progress || 0}%"></div>
            </div>
            <span class="progress-text">${course.progress || 0}%</span>
          </div>
        </div>
      </div>
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

    return `
      <div class="resource-card" onclick="App.openResourceModal('${resource.resourceId}')">
        <div class="resource-cover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${typeIcons[resource.type] || typeIcons['document']}
          </svg>
          <span class="resource-type-badge">${typeMap[resource.type] || resource.type}</span>
        </div>
        <div class="resource-content">
          <h3 class="resource-title">${resource.title}</h3>
          <p class="resource-desc">${resource.description || ''}</p>
          <div class="resource-tags">
            ${tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
          <div class="resource-footer">
            <div class="resource-author">
              <div class="resource-author-avatar">${initial}</div>
              <span class="resource-author-name">${resource.creatorName || t('app.unknownAuthor')}</span>
            </div>
            <div class="resource-stats">
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${this.formatNumber(resource.viewCount)}</span>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>${resource.averageRating || '-'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 打開資源詳情 Modal
   */
  async openResourceModal(resourceId) {
    const resource = this.resourcesCache.find(r => r.resourceId === resourceId);
    if (!resource) return;

    const typeMap = {
      'video': t('app.resourceTypeVideo'),
      'interactive': t('app.resourceTypeInteractive'),
      'document': t('app.resourceTypeDocument'),
      'quiz': t('app.resourceTypeQuiz')
    };

    const tags = resource.tags || [];

    document.getElementById('modalTitle').textContent = resource.title;
    document.getElementById('modalBody').innerHTML = `
      <div style="margin-bottom: 1rem;">
        <span class="tag" style="background: var(--olive); color: var(--cream);">${typeMap[resource.type] || resource.type}</span>
        ${tags.map(t => `<span class="tag">${t}</span>`).join(' ')}
      </div>
      <p style="margin-bottom: 1rem; color: var(--gray-500);">${resource.description || ''}</p>
      <div style="display: flex; gap: 2rem; margin-bottom: 1rem;">
        <div><strong>${t('app.author')}</strong>${resource.creatorName || t('app.unknownAuthor')}</div>
        <div><strong>${t('app.viewCountLabel')}</strong>${this.formatNumber(resource.viewCount)}</div>
        <div><strong>${t('app.ratingLabel')}</strong>${resource.averageRating || '-'}</div>
      </div>
      <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
        <h4 style="margin-bottom: 0.5rem;">${t('app.resourceContent')}</h4>
        <ul style="margin-left: 1.5rem; color: var(--gray-500);">
          <li>${resource.unitCount || t('app.many')} ${t('app.teachingUnits')}</li>
          <li>${t('app.includesExercises')}</li>
          <li>${t('app.downloadablePdf')}</li>
          <li>${t('app.includesQuiz')}</li>
        </ul>
      </div>
    `;
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
            window.location.href = 'admin/index.html';
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
      <div class="discussion-item" onclick="App.openDiscussion('${post.postId}')">
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
      </div>
    `;
  },

  /**
   * 開啟討論詳情
   */
  async openDiscussion(postId) {
    try {
      const result = await API.discussions.get(postId);
      if (result.success) {
        const post = result.data;
        // 這裡可以顯示討論詳情 Modal 或導航到詳情頁
        alert(`討論：${post.title}\n\n${post.content}\n\n回覆數：${post.replyCount || 0}`);
      }
    } catch (error) {
      console.error('Open discussion error:', error);
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
  async loadConsultations() {
    try {
      const result = await API.consultations.list();
      if (result.success) {
        this.consultationsCache = result.data || [];
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
  renderConsultationItem(consultation) {
    const typeMap = {
      'custom_material': t('app.typeCustomMaterial'),
      'training': t('app.typeTraining'),
      'technical': t('app.typeTechnical'),
      'licensing': t('app.typeLicensing'),
      'other': t('app.typeOther')
    };

    const statusMap = {
      'pending': { text: t('app.statusPending'), class: 'warning' },
      'reviewing': { text: t('app.statusReviewing'), class: 'info' },
      'quoted': { text: t('app.statusQuoted'), class: 'primary' },
      'accepted': { text: t('app.statusAccepted'), class: 'success' },
      'in_progress': { text: t('app.statusInProgress'), class: 'info' },
      'completed': { text: t('app.statusCompleted'), class: 'success' },
      'cancelled': { text: t('app.statusCancelled'), class: 'danger' }
    };

    const status = statusMap[consultation.status] || statusMap['pending'];
    const type = typeMap[consultation.requestType] || consultation.requestType;
    const date = new Date(consultation.createdAt).toLocaleDateString('zh-TW');

    return `
      <div class="consultation-item" onclick="App.openConsultation('${consultation.consultationId}')">
        <div class="consultation-header">
          <h3>${consultation.title}</h3>
          <span class="status-badge ${status.class}">${status.text}</span>
        </div>
        <div class="consultation-body">
          <p><strong>${t('app.type')}</strong>${type}</p>
          <p><strong>${t('app.applicationDate')}</strong>${date}</p>
          ${consultation.quote?.amount ? `<p><strong>${t('app.quote')}</strong>NT$ ${consultation.quote.amount.toLocaleString()}</p>` : ''}
        </div>
      </div>
    `;
  },

  /**
   * 開啟諮詢詳情
   */
  async openConsultation(consultationId) {
    try {
      const result = await API.consultations.get(consultationId);
      if (result.success) {
        const c = result.data;
        // 這裡可以顯示詳情 Modal
        alert(`諮詢：${c.title}\n\n說明：${c.description}\n\n狀態：${c.status}`);
      }
    } catch (error) {
      console.error('Open consultation error:', error);
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
  async acceptQuote(consultationId) {
    try {
      const result = await API.consultations.acceptQuote(consultationId);
      if (result.success) {
        showToast(t('toast.quoteAccepted'));
        await this.loadConsultations();
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
    const isStudent = user?.role === 'student';

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
    const memberCount = classInfo.members?.length || classInfo.memberCount || 0;
    const initial = (classInfo.className || 'C')[0];

    return `
      <div class="class-card" onclick="App.openClassDetail('${classInfo.classId}')">
        <div class="class-card-header">
          <div class="class-avatar">${initial}</div>
          <div class="class-info">
            <h3>${classInfo.className}</h3>
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
      </div>
    `;
  },

  /**
   * 建立新班級
   */
  async createClass(className, description = '') {
    try {
      const result = await API.classes.create({ className, description });
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
      header.innerHTML = `
        <h2>${c.className}</h2>
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
    const initial = (member.displayName || member.email || 'U')[0];
    const joinDate = member.joinedAt ? new Date(member.joinedAt).toLocaleDateString('zh-TW') : '';

    return `
      <div class="member-item">
        <div class="member-avatar">${initial}</div>
        <div class="member-info">
          <span class="member-name">${member.displayName || member.email}</span>
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
    if (!confirm(t('confirm.removeMember'))) return;

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
    if (!confirm(t('confirm.deleteClass'))) return;

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
        const updatedUser = { ...user, ...data };
        API.setCurrentUser(updatedUser);
        this.currentUser = updatedUser;
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
        <div style="text-align: center; padding: 3rem; color: var(--gray-500);">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 1rem;">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p>${t('app.noQuizzesAvailable')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.quizzesCache.map(quiz => this.renderQuizItem(quiz)).join('');

    // 更新統計
    this.updateQuizStats();
  },

  /**
   * 渲染單個測驗項目
   */
  renderQuizItem(quiz) {
    const statusColors = {
      'not_started': 'var(--olive)',
      'in_progress': 'var(--terracotta)',
      'completed': 'var(--gray-400)'
    };
    const statusLabels = {
      'not_started': t('app.startQuiz'),
      'in_progress': t('app.continueQuiz'),
      'completed': t('app.viewResults')
    };
    const statusIcons = {
      'not_started': '<path d="M5 3l14 9-14 9V3z"/>',
      'in_progress': '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
      'completed': '<polyline points="20 6 9 17 4 12"/>'
    };

    const color = statusColors[quiz.userStatus] || statusColors['not_started'];
    const label = statusLabels[quiz.userStatus] || statusLabels['not_started'];
    const icon = statusIcons[quiz.userStatus] || statusIcons['not_started'];

    return `
      <div class="quiz-item" style="background: var(--white); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1;">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem; color: var(--charcoal);">${quiz.title}</h3>
          <p style="color: var(--gray-500); font-size: 0.9rem; margin-bottom: 0.75rem;">${quiz.description || ''}</p>
          <div style="display: flex; gap: 1.5rem; font-size: 0.85rem; color: var(--gray-500);">
            <span><strong>${quiz.questionCount || 0}</strong> ${t('app.questions')}</span>
            ${quiz.timeLimit ? `<span><strong>${quiz.timeLimit}</strong> ${t('app.minutes')}</span>` : ''}
            <span>${t('app.passingScore')}: <strong>${quiz.passingScore || 60}</strong>%</span>
            ${quiz.attempts > 0 ? `<span>${t('app.attempted')} <strong>${quiz.attempts}</strong> ${t('app.times')}</span>` : ''}
            ${quiz.bestScore !== undefined && quiz.bestScore > 0 ? `<span>${t('app.bestScore')}: <strong>${quiz.bestScore}</strong>%</span>` : ''}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          ${quiz.userStatus === 'completed' ? `
            <div style="text-align: center;">
              <div style="font-size: 1.5rem; font-weight: 700; color: ${quiz.bestScore >= (quiz.passingScore || 60) ? 'var(--success)' : 'var(--terracotta)'};">${quiz.bestScore}%</div>
              <div style="font-size: 0.75rem; color: var(--gray-500);">${t('app.bestScore')}</div>
            </div>
          ` : ''}
          <button onclick="App.startQuiz('${quiz.quizId}')" style="padding: 0.75rem 1.5rem; background: ${color}; color: var(--cream); border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 0.5rem;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>
            ${label}
          </button>
        </div>
      </div>
    `;
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
      const cards = statsContainer.querySelectorAll('.stat-card');
      if (cards[0]) cards[0].querySelector('div[style*="font-size: 1.75rem"]').textContent = stats.total;
      if (cards[1]) cards[1].querySelector('div[style*="font-size: 1.75rem"]').textContent = stats.completed;
      if (cards[2]) cards[2].querySelector('div[style*="font-size: 1.75rem"]').textContent = stats.inProgress;
      if (cards[3]) cards[3].querySelector('div[style*="font-size: 1.75rem"]').textContent = stats.avgScore + '%';
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
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;';

    modal.innerHTML = `
      <div style="width:95%;max-width:800px;max-height:90vh;background:var(--cream);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:1.5rem 2rem;border-bottom:1px solid var(--gray-200);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h2 style="margin:0;font-size:1.25rem;">${quiz.title}</h2>
            <p style="margin:0.25rem 0 0;font-size:0.85rem;color:var(--gray-500);">${quiz.questionCount} ${t('app.questions')} | ${t('app.passingScore')} ${quiz.passingScore || 60}%</p>
          </div>
          <div id="quizTimer" style="font-size:1.5rem;font-weight:700;color:var(--olive);">00:00</div>
        </div>
        <div id="quizContent" style="flex:1;overflow-y:auto;padding:2rem;">
          ${this.renderQuizQuestions(quiz.questions)}
        </div>
        <div style="padding:1rem 2rem;border-top:1px solid var(--gray-200);display:flex;justify-content:space-between;">
          <button onclick="App.closeQuiz()" style="padding:0.75rem 1.5rem;background:var(--gray-200);border:none;border-radius:8px;cursor:pointer;">${t('app.leaveQuiz')}</button>
          <button onclick="App.submitQuiz()" style="padding:0.75rem 2rem;background:var(--olive);color:var(--cream);border:none;border-radius:8px;cursor:pointer;font-weight:500;">${t('app.submitAnswers')}</button>
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
    return questions.map((q, index) => `
      <div class="quiz-question" style="margin-bottom:2rem;padding-bottom:2rem;border-bottom:1px solid var(--gray-200);">
        <div style="display:flex;align-items:flex-start;gap:1rem;margin-bottom:1rem;">
          <span style="background:var(--olive);color:var(--cream);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.9rem;flex-shrink:0;">${index + 1}</span>
          <div style="flex:1;">
            <p style="margin:0;font-size:1rem;line-height:1.6;">${q.question}</p>
            ${q.imageUrl ? `<img src="${q.imageUrl}" style="max-width:100%;margin-top:1rem;border-radius:8px;">` : ''}
          </div>
        </div>
        <div style="padding-left:2.5rem;">
          ${q.type === 'multiple_choice' ? this.renderMultipleChoice(q, index) : this.renderTextAnswer(q, index)}
        </div>
      </div>
    `).join('');
  },

  /**
   * 渲染選擇題選項
   */
  renderMultipleChoice(question, questionIndex) {
    const options = question.options || [];
    return `
      <div class="quiz-options">
        ${options.map((opt, optIndex) => `
          <label style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;border:2px solid var(--gray-200);border-radius:8px;margin-bottom:0.5rem;cursor:pointer;transition:all 0.2s;"
                 onmouseover="this.style.borderColor='var(--olive-light)'"
                 onmouseout="if(!this.querySelector('input').checked)this.style.borderColor='var(--gray-200)'">
            <input type="radio" name="q_${questionIndex}" value="${opt}" onchange="App.recordAnswer('${question.questionId}', '${opt}')" style="width:18px;height:18px;accent-color:var(--olive);">
            <span>${opt}</span>
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
      <textarea placeholder="${t('app.enterAnswer')}"
                onchange="App.recordAnswer('${question.questionId}', this.value)"
                style="width:100%;padding:0.75rem 1rem;border:2px solid var(--gray-200);border-radius:8px;font-size:1rem;resize:vertical;min-height:80px;"></textarea>
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
      if (!confirm(t('confirm.unansweredQuiz', {n: unanswered}))) {
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
    const passColor = passed ? 'var(--success)' : 'var(--terracotta)';

    content.innerHTML = `
      <div style="text-align:center;padding:2rem 0;">
        <div style="width:120px;height:120px;border-radius:50%;background:${passColor};color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 1.5rem;">
          <div style="font-size:2.5rem;font-weight:700;">${result.score}%</div>
        </div>
        <h2 style="margin-bottom:0.5rem;color:${passColor};">${passed ? t('app.congratsPassed') : t('app.keepTrying')}</h2>
        <p style="color:var(--gray-500);margin-bottom:2rem;">${t('app.correctAnswers', {correct: result.correctCount, total: result.totalQuestions})} | ${t('app.timeSpent')} ${Math.floor(result.timeSpent / 60)}:${String(result.timeSpent % 60).padStart(2, '0')}</p>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;max-width:400px;margin:0 auto 2rem;">
          <div style="background:var(--gray-100);padding:1rem;border-radius:8px;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--olive);">${result.earnedPoints}</div>
            <div style="font-size:0.8rem;color:var(--gray-500);">${t('app.score')}</div>
          </div>
          <div style="background:var(--gray-100);padding:1rem;border-radius:8px;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--charcoal);">${result.totalPoints}</div>
            <div style="font-size:0.8rem;color:var(--gray-500);">${t('app.fullScore')}</div>
          </div>
          <div style="background:var(--gray-100);padding:1rem;border-radius:8px;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--terracotta);">${result.bestScore}%</div>
            <div style="font-size:0.8rem;color:var(--gray-500);">${t('app.bestScore')}</div>
          </div>
        </div>

        <h3 style="text-align:left;margin-bottom:1rem;">${t('app.answerDetail')}</h3>
        <div style="text-align:left;">
          ${result.results.map((r, i) => `
            <div style="padding:1rem;margin-bottom:0.5rem;background:${r.isCorrect ? 'rgba(74,124,89,0.1)' : 'rgba(193,122,94,0.1)'};border-radius:8px;border-left:4px solid ${r.isCorrect ? 'var(--success)' : 'var(--terracotta)'};">
              <div style="font-weight:500;margin-bottom:0.5rem;">${i + 1}. ${r.question}</div>
              <div style="font-size:0.9rem;color:var(--gray-600);">
                ${t('app.yourAnswer')}: <span style="color:${r.isCorrect ? 'var(--success)' : 'var(--terracotta)'};">${r.userAnswer || t('app.notAnswered')}</span>
                ${!r.isCorrect ? `<br>${t('app.correctAnswer')}: <span style="color:var(--success);">${r.correctAnswer}</span>` : ''}
                ${r.explanation ? `<br><em style="color:var(--gray-500);">${r.explanation}</em>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // 更新底部按鈕
    const footer = modal.querySelector('div[style*="border-top"]');
    if (footer) {
      footer.innerHTML = `
        <button onclick="App.closeQuiz()" style="padding:0.75rem 1.5rem;background:var(--gray-200);border:none;border-radius:8px;cursor:pointer;">${t('app.close')}</button>
        <button onclick="App.startQuiz('${this.currentQuiz.quizId}')" style="padding:0.75rem 2rem;background:var(--olive);color:var(--cream);border:none;border-radius:8px;cursor:pointer;font-weight:500;">${t('app.retake')}</button>
      `;
    }
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
      const result = await API.courses.getMyCourses();
      const courses = result.success ? (result.data || []) : [];
      if (courses.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>${t('app.noCourses')}</p><button onclick="showView('moodleCourses')" class="btn-primary">${t('app.browseCourses')}</button></div>`;
        return;
      }
      container.innerHTML = `
        <div class="courses-grid">
          ${courses.map(c => `
            <div class="course-card" onclick="MoodleUI.openCourse('${c.courseId}')">
              <div class="course-card-header" style="background: ${MoodleUI.getCourseGradient ? MoodleUI.getCourseGradient(c.category) : 'linear-gradient(135deg, var(--olive) 0%, var(--olive-light) 100%)'}">
                <span class="course-category">${c.category || t('app.noCategory')}</span>
                <h3>${c.title}</h3>
              </div>
              <div class="course-card-body">
                <p class="course-instructor">${c.instructorName || ''}</p>
                ${c.progress !== undefined ? `
                  <div class="progress-bar-container">
                    <div class="progress-bar" style="width:${c.progress}%"></div>
                    <span class="progress-text">${c.progress}%</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
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
      container.innerHTML = `
        <div class="stats-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:1.5rem;">
          <div class="stat-card" style="background:var(--white);padding:1.5rem;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);"><div class="stat-number" style="font-size:2rem;font-weight:700;color:var(--olive);">${licenses.length}</div><div class="stat-label" style="font-size:0.85rem;color:var(--gray-500);">${t('app.totalLicenses')}</div></div>
          <div class="stat-card" style="background:var(--white);padding:1.5rem;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);"><div class="stat-number" style="font-size:2rem;font-weight:700;color:var(--olive);">${licenses.filter(l => l.status === 'active').length}</div><div class="stat-label" style="font-size:0.85rem;color:var(--gray-500);">${t('app.activeLicenses')}</div></div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">${t('app.licenseList')}</h2>
          </div>
          <div class="card-body">
            <table class="data-table">
              <thead><tr><th>${t('app.licName')}</th><th>${t('app.licStatus')}</th><th>${t('app.licExpiry')}</th></tr></thead>
              <tbody>
                ${licenses.map(l => `
                  <tr>
                    <td>${l.name || l.licenseId}</td>
                    <td><span class="status-badge ${l.status === 'active' ? 'active' : l.status === 'expired' ? 'warning' : ''}">${l.status === 'active' ? t('app.licActive') : l.status === 'expired' ? t('app.licExpired') : l.status}</span></td>
                    <td>${l.expiresAt ? new Date(l.expiresAt).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : '-'}</td>
                  </tr>
                `).join('')}
                ${licenses.length === 0 ? `<tr><td colspan="3" style="text-align:center;padding:2rem;color:var(--gray-500);">${t('app.noLicenses')}</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
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
      const result = await API.resources.list({ type: 'video' });
      const videos = result.success ? (result.data || []) : [];
      container.innerHTML = `
        <div class="video-stats" style="margin-bottom:1rem;">
          <span style="color:var(--gray-500);">${videos.length} ${t('app.videoCount')}</span>
        </div>
        <div class="videos-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.5rem;">
          ${videos.map(v => `
            <div class="video-card" style="background:var(--white);border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);cursor:pointer;" onclick="openVideoPlayer && openVideoPlayer('${v.resourceId || ''}')">
              <div class="video-thumbnail" style="position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);display:flex;align-items:center;justify-content:center;">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#f5f0e8" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16" fill="#f5f0e8"/></svg>
              </div>
              <div class="video-info" style="padding:1rem;">
                <h4 style="font-size:1rem;font-weight:600;margin-bottom:0.5rem;">${v.title}</h4>
                <p style="font-size:0.85rem;color:var(--gray-500);">${v.description || ''}</p>
              </div>
            </div>
          `).join('')}
          ${videos.length === 0 ? `<div class="empty-state" style="text-align:center;padding:3rem;color:var(--gray-500);grid-column:1/-1;"><p>${t('app.noVideos')}</p></div>` : ''}
        </div>
      `;
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
      const completed = quizzes.filter(q => q.status === 'completed' || q.attempted).length;
      container.innerHTML = `
        <div class="stats-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:1.5rem;">
          <div class="stat-card" style="background:var(--white);padding:1.5rem;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);"><div style="font-size:2rem;font-weight:700;color:var(--olive);">${quizzes.length}</div><div style="font-size:0.85rem;color:var(--gray-500);">${t('app.totalQuizzes')}</div></div>
          <div class="stat-card" style="background:var(--white);padding:1.5rem;border-radius:12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);"><div style="font-size:2rem;font-weight:700;color:var(--terracotta);">${completed}</div><div style="font-size:0.85rem;color:var(--gray-500);">${t('app.completedQuizzes')}</div></div>
        </div>
        <div class="quiz-list">
          ${quizzes.map(q => `
            <div class="quiz-item" style="background:var(--white);border-radius:12px;padding:1.5rem;margin-bottom:1rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="typeof MoodleUI !== 'undefined' && MoodleUI.openQuiz && MoodleUI.openQuiz('${q.quizId}')">
              <div class="quiz-info">
                <h4 style="font-size:1.1rem;font-weight:600;margin-bottom:0.25rem;">${q.title}</h4>
                <p style="font-size:0.85rem;color:var(--gray-500);">${q.description || ''}</p>
                <div class="quiz-meta" style="display:flex;gap:0.75rem;margin-top:0.5rem;font-size:0.8rem;color:var(--gray-400);">
                  ${q.timeLimit ? `<span>${t('app.timeLimit')}: ${q.timeLimit} ${t('app.minutes')}</span>` : ''}
                  ${q.questionCount ? `<span>${q.questionCount} ${t('app.questions')}</span>` : ''}
                </div>
              </div>
              <div class="quiz-status">
                ${q.attempted ? `<span class="status-badge active" style="background:var(--olive-light);color:var(--olive);padding:4px 12px;border-radius:20px;font-size:0.8rem;">${t('app.attempted')}</span>` : `<span class="status-badge" style="background:var(--gray-100);color:var(--gray-500);padding:4px 12px;border-radius:20px;font-size:0.8rem;">${t('app.notAttempted')}</span>`}
              </div>
            </div>
          `).join('')}
          ${quizzes.length === 0 ? `<div class="empty-state" style="text-align:center;padding:3rem;color:var(--gray-500);"><p>${t('app.noQuizzes')}</p></div>` : ''}
        </div>
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
      container.innerHTML = `
        <div class="discussions-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <span style="color:var(--gray-500);">${posts.length} ${t('app.discussionCount')}</span>
          <button onclick="typeof MoodleUI !== 'undefined' && MoodleUI.showCreateDiscussionForm ? MoodleUI.showCreateDiscussionForm() : (typeof openNewPostModal === 'function' ? openNewPostModal() : showToast(t('toast.featureInDevelopment')))" class="btn-primary" style="padding:0.75rem 1.5rem;background:var(--olive);color:var(--cream);border:none;border-radius:8px;cursor:pointer;font-weight:500;display:flex;align-items:center;gap:0.5rem;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            ${t('app.startDiscussion')}
          </button>
        </div>
        <div class="discussions-list">
          ${posts.map(p => {
            const avatarColors = ['var(--olive)', 'var(--terracotta)', '#6366f1', '#059669', '#1976D2'];
            const colorIndex = (p.authorName || '').charCodeAt(0) % avatarColors.length || 0;
            return `
            <div class="discussion-card" style="background:var(--white);border-radius:12px;padding:1.5rem;margin-bottom:1rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);cursor:pointer;display:flex;gap:1rem;" onclick="typeof MoodleUI !== 'undefined' && MoodleUI.openDiscussion && MoodleUI.openDiscussion('${p.id || p.postId}')">
              <div class="discussion-avatar" style="width:48px;height:48px;background:${avatarColors[colorIndex]};border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--cream);font-weight:600;flex-shrink:0;">${(p.authorName || t('app.anonymous'))[0]}</div>
              <div class="discussion-content" style="flex:1;">
                <h4 style="font-size:1.1rem;font-weight:600;margin-bottom:0.25rem;">${p.title}</h4>
                <p style="color:var(--gray-600);margin-bottom:0.75rem;line-height:1.6;font-size:0.9rem;">${(p.content || '').substring(0, 100)}${(p.content || '').length > 100 ? '...' : ''}</p>
                <div class="discussion-meta" style="display:flex;gap:1rem;font-size:0.8rem;color:var(--gray-400);">
                  <span>${p.authorName || t('app.anonymous')}</span>
                  <span>${p.createdAt ? new Date(p.createdAt).toLocaleDateString(I18n.getLocale() === 'en' ? 'en-US' : 'zh-TW') : ''}</span>
                  <span>${p.replyCount || 0} ${t('app.replies')}</span>
                  <span>${p.likeCount || 0} ${t('app.likes')}</span>
                </div>
              </div>
            </div>
          `}).join('')}
          ${posts.length === 0 ? `<div class="empty-state" style="text-align:center;padding:3rem;color:var(--gray-500);"><p>${t('app.noDiscussionsYet')}</p></div>` : ''}
        </div>
      `;
    } catch (error) {
      console.error('loadDiscussionsListView error:', error);
      container.innerHTML = `<div class="error-state">${t('toast.discussionLoadFailed')}</div>`;
    }
  },

  async loadFilesView() {
    const container = document.getElementById('filesContent');
    if (!container) return;
    container.innerHTML = `<div class="loading-indicator" style="text-align:center;padding:2rem;color:var(--gray-500);">${t('common.loading')}</div>`;
    try {
      const result = await API.files.list();
      const files = result.success ? (result.data || []) : [];
      container.innerHTML = `
        <div style="padding:1.5rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <h2>${t('app.myFiles')}</h2>
            <button onclick="document.getElementById('fileUploadInput').click()" class="btn-primary">${t('app.uploadFile')}</button>
            <input type="file" id="fileUploadInput" style="display:none" onchange="App.handleFileUpload(this)">
          </div>
          <div class="files-list">
            ${files.map(f => `
              <div class="file-item" style="display:flex;align-items:center;padding:12px;border-bottom:1px solid #eee;gap:12px">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                <div style="flex:1">
                  <div style="font-weight:500">${f.fileName || f.name || 'file'}</div>
                  <div style="font-size:0.85rem;color:var(--gray-500)">${f.size ? (f.size / 1024).toFixed(1) + ' KB' : ''} ${f.createdAt ? '・' + new Date(f.createdAt).toLocaleDateString('zh-TW') : ''}</div>
                </div>
                <button onclick="App.deleteFile('${f.fileId || f.id}')" class="btn-sm btn-danger">${t('app.delete')}</button>
              </div>
            `).join('')}
            ${files.length === 0 ? `<div class="empty-state" style="text-align:center;padding:3rem;color:var(--gray-500)"><p>${t('app.noFiles')}</p></div>` : ''}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('loadFilesView error:', error);
      container.innerHTML = `<div class="error-state">${t('app.loadFilesFailed')}</div>`;
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
    if (!confirm(t('confirm.deleteFile'))) return;
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
    container.innerHTML = `<div class="loading-indicator" style="text-align:center;padding:2rem;color:var(--gray-500);">${t('common.loading')}</div>`;
    try {
      const user = API.getCurrentUser();
      const coursesResult = await API.courses.getMyCourses();
      const courses = coursesResult.success ? (coursesResult.data || []) : [];
      const teacherCourses = courses.filter(c => c.instructorId === user?.userId || c.role === 'teacher');

      if (teacherCourses.length === 0) {
        container.innerHTML = `<div class="empty-state" style="text-align:center;padding:3rem;color:var(--gray-500)"><p>${t('app.noManagedCourses')}</p></div>`;
        return;
      }

      container.innerHTML = `
        <div style="padding:1.5rem">
          <h2>${t('app.groupManagement')}</h2>
          <p style="color:var(--gray-500);margin-bottom:1rem">${t('app.selectCourseToManageGroups')}</p>
          <div class="course-select-list">
            ${teacherCourses.map(c => `
              <div class="course-select-card" onclick="App.openCourseGroups('${c.courseId}')" style="padding:16px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:background 0.2s" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background=''">
                <strong>${c.title}</strong>
                <span style="color:var(--gray-500);margin-left:8px">${c.shortName || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('loadGroupsManagerView error:', error);
      container.innerHTML = `<div class="error-state">${t('app.loadFailed')}</div>`;
    }
  },

  async openCourseGroups(courseId) {
    const container = document.getElementById('groupsManagerContent');
    if (!container) return;
    container.innerHTML = `<div class="loading-indicator" style="text-align:center;padding:2rem">${t('common.loading')}</div>`;
    try {
      const result = await API.courseGroups.list(courseId);
      const groups = result.success ? (result.data || []) : [];
      container.innerHTML = `
        <div style="padding:1.5rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <div>
              <button onclick="App.loadGroupsManagerView()" class="btn-secondary" style="margin-right:8px">← ${t('app.back')}</button>
              <strong>${t('app.groupManagement')}</strong>
            </div>
            <button onclick="App.createGroupPrompt('${courseId}')" class="btn-primary">${t('app.addGroup')}</button>
          </div>
          <div class="groups-list">
            ${groups.map(g => `
              <div class="group-card" style="padding:16px;border:1px solid #eee;border-radius:8px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong>${g.name}</strong>
                  <div>
                    <span style="color:var(--gray-500);margin-right:8px">${g.memberCount || 0} ${t('app.memberCount')}</span>
                    <button onclick="App.deleteGroup('${courseId}', '${g.groupId}')" class="btn-sm btn-danger">${t('app.delete')}</button>
                  </div>
                </div>
                ${g.description ? `<p style="color:var(--gray-500);margin-top:4px">${g.description}</p>` : ''}
              </div>
            `).join('')}
            ${groups.length === 0 ? `<div class="empty-state" style="text-align:center;padding:2rem;color:var(--gray-500)"><p>${t('app.noGroups')}</p></div>` : ''}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('openCourseGroups error:', error);
      container.innerHTML = `<div class="error-state">${t('app.loadGroupsFailed')}</div>`;
    }
  },

  async createGroupPrompt(courseId) {
    const name = prompt(t('app.enterGroupName'));
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
    if (!confirm(t('confirm.deleteGroup'))) return;
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
