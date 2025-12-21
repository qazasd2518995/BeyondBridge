/**
 * BeyondBridge API Client
 * 前端 API 呼叫模組
 */

const API = {
  // API 基礎 URL（自動偵測環境）
  baseUrl: window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api',

  // Token 管理
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),

  /**
   * 設定 Token
   */
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
  },

  /**
   * 清除 Token
   */
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },

  /**
   * 取得當前用戶
   */
  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * 儲存用戶資料
   */
  setCurrentUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  },

  /**
   * 檢查是否已登入
   */
  isLoggedIn() {
    return !!this.accessToken;
  },

  /**
   * 檢查是否為管理員
   */
  isAdmin() {
    const user = this.getCurrentUser();
    return user?.isAdmin || false;
  },

  /**
   * HTTP 請求封裝
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    // 添加認證 Token
    if (this.accessToken) {
      config.headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    // 處理 body
    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);

      // 處理 Token 過期
      if (response.status === 401) {
        const data = await response.json();
        if (data.error === 'TOKEN_EXPIRED' && this.refreshToken) {
          // 嘗試刷新 Token
          const refreshed = await this.auth.refreshToken();
          if (refreshed) {
            // 重試原請求
            config.headers['Authorization'] = `Bearer ${this.accessToken}`;
            return fetch(url, config).then(r => r.json());
          }
        }
        // Token 無效，清除並跳轉登入
        this.clearTokens();
        window.location.href = '#login';
        throw new Error('請重新登入');
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // ===== 認證 API =====
  auth: {
    /**
     * 登入
     */
    async login(email, password) {
      const result = await API.request('/auth/login', {
        method: 'POST',
        body: { email, password }
      });

      if (result.success) {
        API.setTokens(result.data.accessToken, result.data.refreshToken);
        API.setCurrentUser(result.data.user);
      }

      return result;
    },

    /**
     * 註冊
     */
    async register(userData) {
      const result = await API.request('/auth/register', {
        method: 'POST',
        body: userData
      });

      if (result.success) {
        API.setTokens(result.data.accessToken, result.data.refreshToken);
        API.setCurrentUser(result.data.user);
      }

      return result;
    },

    /**
     * 登出
     */
    async logout() {
      try {
        await API.request('/auth/logout', { method: 'POST' });
      } finally {
        API.clearTokens();
      }
    },

    /**
     * 刷新 Token
     */
    async refreshToken() {
      if (!API.refreshToken) return false;

      try {
        const result = await fetch(`${API.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: API.refreshToken })
        }).then(r => r.json());

        if (result.success) {
          API.accessToken = result.data.accessToken;
          localStorage.setItem('accessToken', result.data.accessToken);
          return true;
        }
      } catch (error) {
        console.error('Refresh token failed:', error);
      }

      return false;
    },

    /**
     * 取得當前用戶資料
     */
    async me() {
      return API.request('/auth/me');
    },

    /**
     * 變更密碼
     */
    async changePassword(currentPassword, newPassword) {
      return API.request('/auth/password', {
        method: 'PUT',
        body: { currentPassword, newPassword }
      });
    }
  },

  // ===== 用戶 API =====
  users: {
    async get(userId) {
      return API.request(`/users/${userId}`);
    },

    async update(userId, data) {
      return API.request(`/users/${userId}`, {
        method: 'PUT',
        body: data
      });
    },

    async getCourses(userId) {
      return API.request(`/users/${userId}/courses`);
    },

    async getLicenses(userId) {
      return API.request(`/users/${userId}/licenses`);
    },

    async getStats(userId) {
      return API.request(`/users/${userId}/stats`);
    },

    async getActivities(userId, limit = 50) {
      return API.request(`/users/${userId}/activities?limit=${limit}`);
    }
  },

  // ===== 資源 API =====
  resources: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/resources?${params}`);
    },

    async search(query, filters = {}) {
      const params = new URLSearchParams({ q: query, ...filters }).toString();
      return API.request(`/resources/search?${params}`);
    },

    async get(resourceId) {
      return API.request(`/resources/${resourceId}`);
    },

    async rate(resourceId, rating) {
      return API.request(`/resources/${resourceId}/rate`, {
        method: 'POST',
        body: { rating }
      });
    },

    async getCategories() {
      return API.request('/resources/meta/categories');
    }
  },

  // ===== 課程 API =====
  courses: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/courses?${params}`);
    },

    async get(courseId) {
      return API.request(`/courses/${courseId}`);
    },

    async enroll(courseId) {
      return API.request(`/courses/${courseId}/enroll`, {
        method: 'POST'
      });
    },

    async getProgress(courseId) {
      return API.request(`/courses/${courseId}/progress`);
    },

    async updateProgress(courseId, data) {
      return API.request(`/courses/${courseId}/progress`, {
        method: 'PUT',
        body: data
      });
    },

    async completeUnit(courseId, unitId) {
      return API.request(`/courses/${courseId}/units/${unitId}/complete`, {
        method: 'POST'
      });
    }
  },

  // ===== 授權 API =====
  licenses: {
    async list() {
      return API.request('/licenses');
    },

    async get(licenseId) {
      return API.request(`/licenses/${licenseId}`);
    },

    async request(resourceId, data = {}) {
      return API.request('/licenses/request', {
        method: 'POST',
        body: { resourceId, ...data }
      });
    },

    async renew(licenseId) {
      return API.request(`/licenses/${licenseId}/renew`, {
        method: 'POST'
      });
    },

    async getExpiring() {
      return API.request('/licenses/status/expiring');
    }
  },

  // ===== 公告 API =====
  announcements: {
    async list() {
      return API.request('/announcements');
    },

    async get(announcementId) {
      return API.request(`/announcements/${announcementId}`);
    },

    async dismiss(announcementId) {
      return API.request(`/announcements/${announcementId}/dismiss`, {
        method: 'POST'
      });
    }
  },

  // ===== 管理員 API =====
  admin: {
    async getDashboard() {
      return API.request('/admin/dashboard');
    },

    async getUsers(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/admin/users?${params}`);
    },

    async getUser(userId) {
      return API.request(`/admin/users/${userId}`);
    },

    async createUser(userData) {
      return API.request('/admin/users', {
        method: 'POST',
        body: userData
      });
    },

    async updateUser(userId, data) {
      return API.request(`/admin/users/${userId}`, {
        method: 'PUT',
        body: data
      });
    },

    async resetUserPassword(userId, newPassword) {
      return API.request(`/admin/users/${userId}/password`, {
        method: 'PUT',
        body: { newPassword }
      });
    },

    async deleteUser(userId) {
      return API.request(`/admin/users/${userId}`, {
        method: 'DELETE'
      });
    },

    async updateUserStatus(userId, status) {
      return API.request(`/admin/users/${userId}/status`, {
        method: 'PUT',
        body: { status }
      });
    },

    async createResource(data) {
      return API.request('/admin/resources', {
        method: 'POST',
        body: data
      });
    },

    async updateResource(resourceId, data) {
      return API.request(`/admin/resources/${resourceId}`, {
        method: 'PUT',
        body: data
      });
    },

    async publishResource(resourceId) {
      return API.request(`/admin/resources/${resourceId}/publish`, {
        method: 'PUT'
      });
    },

    async deleteResource(resourceId) {
      return API.request(`/admin/resources/${resourceId}`, {
        method: 'DELETE'
      });
    },

    async getLicenses(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/admin/licenses?${params}`);
    },

    async approveLicense(licenseId, approved = true) {
      return API.request(`/admin/licenses/${licenseId}/approve`, {
        method: 'PUT',
        body: { approved }
      });
    },

    async createAnnouncement(data) {
      return API.request('/announcements', {
        method: 'POST',
        body: data
      });
    },

    async updateAnnouncement(announcementId, data) {
      return API.request(`/announcements/${announcementId}`, {
        method: 'PUT',
        body: data
      });
    },

    async deleteAnnouncement(announcementId) {
      return API.request(`/announcements/${announcementId}`, {
        method: 'DELETE'
      });
    },

    async getAllAnnouncements(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/announcements/admin/all?${params}`);
    },

    async getAnalytics() {
      return API.request('/admin/analytics/overview');
    }
  },

  // ===== 班級 API =====
  classes: {
    async list() {
      return API.request('/classes');
    },

    async get(classId) {
      return API.request(`/classes/${classId}`);
    },

    async create(data) {
      return API.request('/classes', {
        method: 'POST',
        body: data
      });
    },

    async update(classId, data) {
      return API.request(`/classes/${classId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(classId) {
      return API.request(`/classes/${classId}`, {
        method: 'DELETE'
      });
    },

    async join(classId, inviteCode) {
      return API.request(`/classes/${classId}/join`, {
        method: 'POST',
        body: { inviteCode }
      });
    },

    async joinByCode(inviteCode) {
      return API.request('/classes/join-by-code', {
        method: 'POST',
        body: { inviteCode }
      });
    },

    async removeMember(classId, userId) {
      return API.request(`/classes/${classId}/members/${userId}`, {
        method: 'DELETE'
      });
    },

    async getAssignments(classId, type = null) {
      const params = type ? `?type=${type}` : '';
      return API.request(`/classes/${classId}/assignments${params}`);
    },

    async createAssignment(classId, data) {
      return API.request(`/classes/${classId}/assignments`, {
        method: 'POST',
        body: data
      });
    },

    async deleteAssignment(classId, assignmentId) {
      return API.request(`/classes/${classId}/assignments/${assignmentId}`, {
        method: 'DELETE'
      });
    }
  }
};

// 匯出到全域
window.API = API;
