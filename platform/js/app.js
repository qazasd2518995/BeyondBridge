/**
 * BeyondBridge Platform App
 * 主應用程式 - 處理認證狀態和資料載入
 */

const App = {
  // 當前用戶資料
  currentUser: null,

  // 資源緩存
  resourcesCache: [],
  coursesCache: [],

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
    document.getElementById('loginView').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
  },

  /**
   * 顯示主應用程式
   */
  showApp() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    this.updateUserUI();
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
        'educator': '教育工作者',
        'trainer': '培訓主管',
        'creator': '內容創作者',
        'admin': '管理員'
      };
      userRole.textContent = roleMap[user.role] || user.role || '會員';
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

    // 更新個人資料表單
    const nameInput = settingsView.querySelector('input[value="林老師"]');
    if (nameInput) nameInput.value = user.displayName || user.displayNameZh || '';

    const emailInput = settingsView.querySelector('input[type="email"]');
    if (emailInput) emailInput.value = user.email || '';

    const orgInput = settingsView.querySelector('input[value="台北市立第一中學"]');
    if (orgInput) orgInput.value = user.organization || '';

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
    }
  },

  /**
   * 載入儀表板資料
   */
  async loadDashboardData() {
    try {
      // 載入公告
      this.loadAnnouncements();

      // 載入資源
      this.loadResources();

      // 載入用戶統計（如果有 userId）
      const user = API.getCurrentUser();
      if (user && user.userId) {
        this.loadUserStats(user.userId);
      }
    } catch (error) {
      console.error('Load dashboard data error:', error);
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
        this.showApp();
        await this.loadDashboardData();
        showToast('登入成功！');
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
