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

    // 定義建橋者（教師/教育者）側邊欄
    const educatorSidebar = `
      <div class="nav-section">
        <div class="nav-section-title">建橋中心</div>
        <a href="#" class="nav-item active" data-view="dashboard" onclick="navigateTo(this, 'dashboard')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
          建橋總覽
        </a>
        <a href="#" class="nav-item" data-view="library" onclick="navigateTo(this, 'library')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          知識建材庫
          <span class="nav-badge">128</span>
        </a>
        <a href="#" class="nav-item" data-view="courses" onclick="navigateTo(this, 'courses')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12,2 2,7 12,12 22,7"/>
            <polyline points="2,17 12,22 22,17"/>
            <polyline points="2,12 12,17 22,12"/>
          </svg>
          我的橋樑
        </a>
        <a href="#" class="nav-item" data-view="classes" onclick="navigateTo(this, 'classes')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          共建團隊
        </a>
        <a href="#" class="nav-item" data-view="licenses" onclick="navigateTo(this, 'licenses')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10,9 9,9 8,9"/>
          </svg>
          建材授權
        </a>
        <a href="#" class="nav-item" data-view="consultations" onclick="navigateTo(this, 'consultations')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          專業諮詢
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">課程學習</div>
        <a href="#" class="nav-item" data-view="moodleCourses" onclick="showView('moodleCourses'); MoodleUI.loadCourses();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
          </svg>
          課程中心
        </a>
        <a href="#" class="nav-item" data-view="moodleAssignments" onclick="showView('moodleAssignments'); MoodleUI.loadAssignments();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          我的作業
        </a>
        <a href="#" class="nav-item" data-view="moodleQuizzes" onclick="showView('moodleQuizzes'); MoodleUI.loadQuizzes();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          測驗中心
        </a>
        <a href="#" class="nav-item" data-view="moodleForums" onclick="showView('moodleForums'); MoodleUI.loadForums();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          討論區
        </a>
        <a href="#" class="nav-item" data-view="moodleGradebook" onclick="showView('moodleGradebook'); MoodleUI.loadGradebook();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          成績簿
        </a>
        <a href="#" class="nav-item" data-view="moodleCalendar" onclick="showView('moodleCalendar'); MoodleUI.loadCalendar();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          行事曆
        </a>
        <a href="#" class="nav-item" data-view="moodleNotifications" onclick="showView('moodleNotifications'); MoodleUI.loadNotifications();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          通知中心
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">教學管理</div>
        <a href="#" class="nav-item" data-view="questionBank" onclick="showView('questionBank'); MoodleUI.openQuestionBank();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"/>
            <path d="M9 9h6M9 13h3"/>
            <circle cx="16" cy="13" r="1"/>
          </svg>
          題庫管理
        </a>
        <a href="#" class="nav-item" data-view="gradebookManagement" onclick="showView('gradebookManagement'); MoodleUI.openGradebookManagement();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
          成績簿管理
        </a>
        <a href="#" class="nav-item" data-view="courseCompletionSettings" onclick="showView('courseCompletionSettings'); MoodleUI.openCourseCompletionSettings();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
          課程完成設定
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">橋樑管理</div>
        <a href="#" class="nav-item" data-view="settings" onclick="navigateTo(this, 'settings')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          橋樑設定
        </a>
        <a href="#" class="nav-item" data-view="logout" onclick="navigateTo(this, 'logout')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          離開橋樑
        </a>
      </div>
    `;

    // 定義探橋者（學生）側邊欄
    const studentSidebar = `
      <div class="nav-section">
        <div class="nav-section-title">探索中心</div>
        <a href="#" class="nav-item active" data-view="dashboard" onclick="navigateTo(this, 'dashboard')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
          探索總覽
        </a>
        <a href="#" class="nav-item" data-view="studentClasses" onclick="navigateTo(this, 'studentClasses')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          我的橋隊
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">過橋工具</div>
        <a href="#" class="nav-item" data-view="videos" onclick="navigateTo(this, 'videos')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="23,7 16,12 23,17"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
          影音橋段
        </a>
        <a href="#" class="nav-item" data-view="quizzes" onclick="navigateTo(this, 'quizzes')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          橋樑驗收
        </a>
        <a href="#" class="nav-item" data-view="discussions" onclick="navigateTo(this, 'discussions')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          共建論壇
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">課程學習</div>
        <a href="#" class="nav-item" data-view="moodleCourses" onclick="showView('moodleCourses'); MoodleUI.loadCourses();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
          </svg>
          課程中心
        </a>
        <a href="#" class="nav-item" data-view="moodleAssignments" onclick="showView('moodleAssignments'); MoodleUI.loadAssignments();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          我的作業
        </a>
        <a href="#" class="nav-item" data-view="moodleQuizzes" onclick="showView('moodleQuizzes'); MoodleUI.loadQuizzes();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          測驗中心
        </a>
        <a href="#" class="nav-item" data-view="moodleForums" onclick="showView('moodleForums'); MoodleUI.loadForums();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          討論區
        </a>
        <a href="#" class="nav-item" data-view="moodleGradebook" onclick="showView('moodleGradebook'); MoodleUI.loadGradebook();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          成績簿
        </a>
        <a href="#" class="nav-item" data-view="moodleCalendar" onclick="showView('moodleCalendar'); MoodleUI.loadCalendar();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          行事曆
        </a>
        <a href="#" class="nav-item" data-view="moodleNotifications" onclick="showView('moodleNotifications'); MoodleUI.loadNotifications();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          通知中心
        </a>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">探橋者</div>
        <a href="#" class="nav-item" data-view="settings" onclick="navigateTo(this, 'settings')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          個人設定
        </a>
        <a href="#" class="nav-item" data-view="logout" onclick="navigateTo(this, 'logout')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          離開橋樑
        </a>
      </div>
    `;

    // 管理員專用區塊
    const adminSection = `
      <div class="nav-section">
        <div class="nav-section-title">系統管理</div>
        <a href="#" class="nav-item" data-view="rolesManagement" onclick="showView('rolesManagement'); MoodleUI.openRolesManagement();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          角色權限
        </a>
        <a href="#" class="nav-item" data-view="courseCategories" onclick="showView('courseCategories'); MoodleUI.openCourseCategories();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            <path d="M12 11v6M9 14h6"/>
          </svg>
          課程類別
        </a>
        <a href="#" class="nav-item" onclick="window.location.href='/admin';">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="9"/>
            <rect x="14" y="3" width="7" height="5"/>
            <rect x="14" y="12" width="7" height="9"/>
            <rect x="3" y="16" width="7" height="5"/>
          </svg>
          管理後台
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

    if (userName) userName.textContent = user.displayName || user.displayNameZh || '用戶';
    if (userRole) {
      const roleMap = {
        'educator': '建橋者',
        'trainer': '橋樑工匠',
        'creator': '知識建築師',
        'admin': '橋樑守護者',
        'student': '探橋者'
      };
      userRole.textContent = roleMap[user.role] || user.role || '旅人';
    }
    if (userAvatar) {
      const initial = (user.displayNameZh || user.displayName || '用')[0];
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
      const initial = (user.displayNameZh || user.displayName || '用')[0];
      const avatarDiv = profileBanner.querySelector('div[style*="width: 80px"]');
      if (avatarDiv) avatarDiv.textContent = initial;

      const nameH2 = profileBanner.querySelector('h2');
      if (nameH2) nameH2.textContent = user.displayName || user.displayNameZh || '用戶';

      const emailP = profileBanner.querySelector('p');
      if (emailP) emailP.textContent = user.email || '';

      // 更新會員資訊
      const infoSpans = profileBanner.querySelectorAll('div[style*="display: flex; gap: 1.5rem"] span');
      if (infoSpans.length >= 3) {
        infoSpans[0].innerHTML = `<strong>會員等級:</strong> ${user.subscriptionTier === 'professional' ? '專業版' : user.subscriptionTier === 'basic' ? '基本版' : '免費版'}`;
        infoSpans[1].innerHTML = `<strong>加入日期:</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-TW') : '-'}`;
        infoSpans[2].innerHTML = `<strong>授權額度:</strong> ${user.licenseUsed || 0}/${user.licenseQuota || 0}`;
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
        showToast('通知設定已更新！');
        return true;
      } else {
        showToast(result.message || '更新失敗');
        return false;
      }
    } catch (error) {
      console.error('Update notification settings error:', error);
      showToast('更新失敗');
      return false;
    }
  },

  /**
   * 載入儀表板資料
   */
  async loadDashboardData() {
    try {
      const user = API.getCurrentUser();

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
      }

      await Promise.all(promises);
    } catch (error) {
      console.error('Load dashboard data error:', error);
    }
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
          <h3 class="course-title">${course.title || course.courseTitle || '課程'}</h3>
          <p class="course-meta">${course.unitCount || '?'} 個單元 ・ 共 ${Math.round((course.totalDuration || 0) / 60)} 小時</p>
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

    let text = activity.details?.description || '進行了操作';
    if (activity.action === 'course_progress') {
      text = `完成了 <strong>${activity.details?.courseTitle || '課程'}</strong> 第 ${activity.details?.unitId || '?'} 單元`;
    } else if (activity.action === 'license_acquired') {
      text = `新增授權：<strong>${activity.details?.resourceTitle || '教材'}</strong>`;
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
      'active': { text: '使用中', class: 'success' },
      'pending': { text: '待審核', class: 'warning' },
      'expired': { text: '已過期', class: 'danger' }
    };
    const status = statusMap[license.status] || statusMap['pending'];
    const daysLeft = this.getDaysUntil(license.expiryDate);

    return `
      <div class="license-card">
        <div class="license-header">
          <h3>${license.resourceTitle || '教材'}</h3>
          <span class="license-status ${status.class}">${status.text}</span>
        </div>
        <div class="license-body">
          <p><strong>授權類型：</strong>${license.licenseType === 'institutional' ? '機構授權' : '個人授權'}</p>
          <p><strong>到期日期：</strong>${license.expiryDate || '-'}</p>
          ${daysLeft !== null ? `<p><strong>剩餘天數：</strong>${daysLeft} 天</p>` : ''}
        </div>
        ${license.status === 'active' && daysLeft <= 30 ? `
        <div class="license-footer">
          <button class="btn btn-outline" onclick="App.renewLicense('${license.licenseId}')">續約授權</button>
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
    if (!dateStr) return '剛剛';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '剛剛';
    if (minutes < 60) return `${minutes} 分鐘前`;
    if (hours < 24) return `${hours} 小時前`;
    if (days < 7) return `${days} 天前`;
    return date.toLocaleDateString('zh-TW');
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
        showToast('續約申請已提交');
        // 重新載入授權列表
        const user = API.getCurrentUser();
        if (user) await this.loadUserLicenses(user.userId);
      } else {
        showToast(result.message || '續約失敗');
      }
    } catch (error) {
      console.error('Renew license error:', error);
      showToast('續約失敗');
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
        <span class="announcement-badge">${announcement.priority === 'urgent' ? '緊急' : '公告'}</span>
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
      'video': '影音',
      'interactive': '互動',
      'document': '講義',
      'quiz': '測驗'
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
              <span class="resource-author-name">${resource.creatorName || '未知作者'}</span>
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
      'video': '影音',
      'interactive': '互動',
      'document': '講義',
      'quiz': '測驗'
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
        <div><strong>作者：</strong>${resource.creatorName || '未知'}</div>
        <div><strong>觀看：</strong>${this.formatNumber(resource.viewCount)}</div>
        <div><strong>評分：</strong>${resource.averageRating || '-'}</div>
      </div>
      <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
        <h4 style="margin-bottom: 0.5rem;">教材內容</h4>
        <ul style="margin-left: 1.5rem; color: var(--gray-500);">
          <li>${resource.unitCount || '多'} 個教學單元</li>
          <li>含練習題與解答</li>
          <li>可下載 PDF 講義</li>
          <li>附互動測驗</li>
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
      statValues[1].textContent = (stats.licensesActive || '0') + '個';
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
          showToast('歡迎回來，管理員！正在跳轉到管理後台...');
          setTimeout(() => {
            window.location.href = 'admin/index.html';
          }, 1000);
          return true;
        }

        // 一般用戶顯示主應用程式
        this.showApp();
        await this.loadDashboardData();
        showToast('登入成功！');
        // 觸發登入事件，通知聊天系統初始化
        window.dispatchEvent(new CustomEvent('userLoggedIn'));
        return true;
      } else {
        showToast(result.message || '登入失敗，請檢查帳號密碼');
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      showToast('登入失敗，請稍後再試');
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
        showToast('註冊成功！');
        return true;
      } else {
        showToast(result.message || '註冊失敗');
        return false;
      }
    } catch (error) {
      console.error('Register error:', error);
      showToast('註冊失敗，請稍後再試');
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
    showToast('已登出系統');
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
        discussionList.innerHTML = '<div class="empty-state"><p>還沒有任何討論，成為第一個發起討論的人！</p></div>';
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
            <span class="discussion-author">${post.userDisplayName || '匿名用戶'}</span>
            <span class="discussion-time">${timeAgo}</span>
            <div class="discussion-stats">
              <span>${post.replyCount || 0} 回覆</span>
              <span>${post.likeCount || 0} 讚</span>
              <span>${post.viewCount || 0} 觀看</span>
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
      showToast('載入討論失敗');
    }
  },

  /**
   * 發布新討論
   */
  async createDiscussion(title, content, tags = []) {
    try {
      const result = await API.discussions.create({ title, content, tags });
      if (result.success) {
        showToast('討論發布成功！');
        await this.loadDiscussions();
        return true;
      } else {
        showToast(result.message || '發布失敗');
        return false;
      }
    } catch (error) {
      console.error('Create discussion error:', error);
      showToast('發布失敗');
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
        showToast('回覆成功！');
        return true;
      } else {
        showToast(result.message || '回覆失敗');
        return false;
      }
    } catch (error) {
      console.error('Reply to discussion error:', error);
      showToast('回覆失敗');
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
        consultationList.innerHTML = '<div class="empty-state"><p>您還沒有諮詢記錄</p></div>';
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
      'custom_material': '客製化教材',
      'training': '教育訓練',
      'technical': '技術支援',
      'licensing': '授權諮詢',
      'other': '其他'
    };

    const statusMap = {
      'pending': { text: '待處理', class: 'warning' },
      'reviewing': { text: '審核中', class: 'info' },
      'quoted': { text: '已報價', class: 'primary' },
      'accepted': { text: '已接受', class: 'success' },
      'in_progress': { text: '進行中', class: 'info' },
      'completed': { text: '已完成', class: 'success' },
      'cancelled': { text: '已取消', class: 'danger' }
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
          <p><strong>類型：</strong>${type}</p>
          <p><strong>申請日期：</strong>${date}</p>
          ${consultation.quote?.amount ? `<p><strong>報價：</strong>NT$ ${consultation.quote.amount.toLocaleString()}</p>` : ''}
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
      showToast('載入諮詢詳情失敗');
    }
  },

  /**
   * 建立諮詢請求
   */
  async createConsultation(data) {
    try {
      const result = await API.consultations.create(data);
      if (result.success) {
        showToast('諮詢請求已提交！');
        await this.loadConsultations();
        return true;
      } else {
        showToast(result.message || '提交失敗');
        return false;
      }
    } catch (error) {
      console.error('Create consultation error:', error);
      showToast('提交失敗');
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
        showToast('已接受報價！');
        await this.loadConsultations();
        return true;
      } else {
        showToast(result.message || '操作失敗');
        return false;
      }
    } catch (error) {
      console.error('Accept quote error:', error);
      showToast('操作失敗');
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
        teacherView.innerHTML = '<div class="empty-state"><p>您還沒有建立任何班級</p></div>';
      } else {
        teacherView.innerHTML = this.classesCache.map(c => this.renderClassCard(c, false)).join('');
      }
    }

    // 學生班級視圖
    const studentView = document.querySelector('#studentClassesView .class-grid');
    if (studentView && isStudent) {
      if (this.classesCache.length === 0) {
        studentView.innerHTML = '<div class="empty-state"><p>您還沒有加入任何班級</p></div>';
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
            <p>${classInfo.description || '暫無描述'}</p>
          </div>
        </div>
        <div class="class-card-body">
          <div class="class-stats">
            <span>${memberCount} 位成員</span>
            ${!isStudent ? `<span>邀請碼: ${classInfo.inviteCode}</span>` : ''}
          </div>
        </div>
        ${!isStudent ? `
        <div class="class-card-footer">
          <button class="btn btn-sm" onclick="event.stopPropagation(); App.copyInviteCode('${classInfo.inviteCode}')">複製邀請碼</button>
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
        showToast('班級建立成功！');
        await this.loadClasses();
        return result.data;
      } else {
        showToast(result.message || '建立失敗');
        return null;
      }
    } catch (error) {
      console.error('Create class error:', error);
      showToast('建立失敗');
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
        showToast('成功加入班級！');
        await this.loadClasses();
        return true;
      } else {
        showToast(result.message || '加入失敗');
        return false;
      }
    } catch (error) {
      console.error('Join class error:', error);
      showToast('加入失敗');
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
        showToast('載入班級詳情失敗');
      }
    } catch (error) {
      console.error('Open class detail error:', error);
      showToast('載入班級詳情失敗');
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
        ${isOwner ? `<p>邀請碼: <strong>${c.inviteCode}</strong></p>` : ''}
      `;
    }

    // 更新成員列表
    const memberList = classDetail.querySelector('.member-list');
    if (memberList) {
      const members = c.members || [];
      if (members.length === 0) {
        memberList.innerHTML = '<p class="empty-state">還沒有成員加入</p>';
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
        <button class="btn btn-sm btn-danger" onclick="App.removeMember('${classId}', '${member.userId}')">移除</button>
        ` : ''}
      </div>
    `;
  },

  /**
   * 移除班級成員
   */
  async removeMember(classId, userId) {
    if (!confirm('確定要移除此成員嗎？')) return;

    try {
      const result = await API.classes.removeMember(classId, userId);
      if (result.success) {
        showToast('成員已移除');
        await this.openClassDetail(classId);
      } else {
        showToast(result.message || '移除失敗');
      }
    } catch (error) {
      console.error('Remove member error:', error);
      showToast('移除失敗');
    }
  },

  /**
   * 複製邀請碼
   */
  copyInviteCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      showToast('邀請碼已複製！');
    }).catch(() => {
      showToast('複製失敗，請手動複製');
    });
  },

  /**
   * 刪除班級
   */
  async deleteClass(classId) {
    if (!confirm('確定要刪除此班級嗎？此操作無法復原。')) return;

    try {
      const result = await API.classes.delete(classId);
      if (result.success) {
        showToast('班級已刪除');
        await this.loadClasses();
        navigateTo(document.querySelector('[data-view="classes"]'), 'classes');
      } else {
        showToast(result.message || '刪除失敗');
      }
    } catch (error) {
      console.error('Delete class error:', error);
      showToast('刪除失敗');
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
        showToast('資料更新成功！');
        return true;
      } else {
        showToast(result.message || '更新失敗');
        return false;
      }
    } catch (error) {
      console.error('Update profile error:', error);
      showToast('更新失敗');
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
        showToast('密碼變更成功！');
        return true;
      } else {
        showToast(result.message || '密碼變更失敗');
        return false;
      }
    } catch (error) {
      console.error('Change password error:', error);
      showToast('密碼變更失敗');
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
      showToast('載入測驗失敗');
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
          <p>目前沒有可用的測驗</p>
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
      'not_started': '開始測驗',
      'in_progress': '繼續測驗',
      'completed': '查看結果'
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
            <span><strong>${quiz.questionCount || 0}</strong> 題</span>
            ${quiz.timeLimit ? `<span><strong>${quiz.timeLimit}</strong> 分鐘</span>` : ''}
            <span>通過分數: <strong>${quiz.passingScore || 60}</strong>%</span>
            ${quiz.attempts > 0 ? `<span>已作答 <strong>${quiz.attempts}</strong> 次</span>` : ''}
            ${quiz.bestScore !== undefined && quiz.bestScore > 0 ? `<span>最高分: <strong>${quiz.bestScore}</strong>%</span>` : ''}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          ${quiz.userStatus === 'completed' ? `
            <div style="text-align: center;">
              <div style="font-size: 1.5rem; font-weight: 700; color: ${quiz.bestScore >= (quiz.passingScore || 60) ? 'var(--success)' : 'var(--terracotta)'};">${quiz.bestScore}%</div>
              <div style="font-size: 0.75rem; color: var(--gray-500);">最高分數</div>
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
        showToast(result.message || '載入測驗失敗');
        return;
      }

      this.currentQuiz = result.data;
      this.quizAnswers = [];
      this.quizStartTime = Date.now();

      this.showQuizModal();
    } catch (error) {
      console.error('Start quiz error:', error);
      showToast('載入測驗失敗');
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
            <p style="margin:0.25rem 0 0;font-size:0.85rem;color:var(--gray-500);">${quiz.questionCount} 題 | 通過分數 ${quiz.passingScore || 60}%</p>
          </div>
          <div id="quizTimer" style="font-size:1.5rem;font-weight:700;color:var(--olive);">00:00</div>
        </div>
        <div id="quizContent" style="flex:1;overflow-y:auto;padding:2rem;">
          ${this.renderQuizQuestions(quiz.questions)}
        </div>
        <div style="padding:1rem 2rem;border-top:1px solid var(--gray-200);display:flex;justify-content:space-between;">
          <button onclick="App.closeQuiz()" style="padding:0.75rem 1.5rem;background:var(--gray-200);border:none;border-radius:8px;cursor:pointer;">離開測驗</button>
          <button onclick="App.submitQuiz()" style="padding:0.75rem 2rem;background:var(--olive);color:var(--cream);border:none;border-radius:8px;cursor:pointer;font-weight:500;">提交答案</button>
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
      <textarea placeholder="請輸入您的答案..."
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
          showToast('時間到！自動提交測驗');
          this.submitQuiz();
        } else if (elapsed >= limitSeconds - 60 && elapsed < limitSeconds - 59) {
          showToast('還剩 1 分鐘！');
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
      if (!confirm(`還有 ${unanswered} 題未作答，確定要提交嗎？`)) {
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
        showToast(result.message || '提交失敗');
      }
    } catch (error) {
      console.error('Submit quiz error:', error);
      showToast('提交失敗');
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
        <h2 style="margin-bottom:0.5rem;color:${passColor};">${passed ? '恭喜通過！' : '繼續加油！'}</h2>
        <p style="color:var(--gray-500);margin-bottom:2rem;">答對 ${result.correctCount}/${result.totalQuestions} 題 | 用時 ${Math.floor(result.timeSpent / 60)}:${String(result.timeSpent % 60).padStart(2, '0')}</p>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;max-width:400px;margin:0 auto 2rem;">
          <div style="background:var(--gray-100);padding:1rem;border-radius:8px;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--olive);">${result.earnedPoints}</div>
            <div style="font-size:0.8rem;color:var(--gray-500);">得分</div>
          </div>
          <div style="background:var(--gray-100);padding:1rem;border-radius:8px;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--charcoal);">${result.totalPoints}</div>
            <div style="font-size:0.8rem;color:var(--gray-500);">滿分</div>
          </div>
          <div style="background:var(--gray-100);padding:1rem;border-radius:8px;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--terracotta);">${result.bestScore}%</div>
            <div style="font-size:0.8rem;color:var(--gray-500);">最高分</div>
          </div>
        </div>

        <h3 style="text-align:left;margin-bottom:1rem;">題目詳解</h3>
        <div style="text-align:left;">
          ${result.results.map((r, i) => `
            <div style="padding:1rem;margin-bottom:0.5rem;background:${r.isCorrect ? 'rgba(74,124,89,0.1)' : 'rgba(193,122,94,0.1)'};border-radius:8px;border-left:4px solid ${r.isCorrect ? 'var(--success)' : 'var(--terracotta)'};">
              <div style="font-weight:500;margin-bottom:0.5rem;">${i + 1}. ${r.question}</div>
              <div style="font-size:0.9rem;color:var(--gray-600);">
                您的答案: <span style="color:${r.isCorrect ? 'var(--success)' : 'var(--terracotta)'};">${r.userAnswer || '未作答'}</span>
                ${!r.isCorrect ? `<br>正確答案: <span style="color:var(--success);">${r.correctAnswer}</span>` : ''}
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
        <button onclick="App.closeQuiz()" style="padding:0.75rem 1.5rem;background:var(--gray-200);border:none;border-radius:8px;cursor:pointer;">關閉</button>
        <button onclick="App.startQuiz('${this.currentQuiz.quizId}')" style="padding:0.75rem 2rem;background:var(--olive);color:var(--cream);border:none;border-radius:8px;cursor:pointer;font-weight:500;">再試一次</button>
      `;
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

// 匯出到全域
window.App = App;
