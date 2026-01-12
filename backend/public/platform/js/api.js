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
  },

  // ===== 諮詢服務 API =====
  consultations: {
    async list() {
      return API.request('/consultations');
    },

    async get(consultationId) {
      return API.request(`/consultations/${consultationId}`);
    },

    async create(data) {
      return API.request('/consultations', {
        method: 'POST',
        body: data
      });
    },

    async update(consultationId, data) {
      return API.request(`/consultations/${consultationId}`, {
        method: 'PUT',
        body: data
      });
    },

    async cancel(consultationId) {
      return API.request(`/consultations/${consultationId}`, {
        method: 'DELETE'
      });
    },

    async acceptQuote(consultationId) {
      return API.request(`/consultations/${consultationId}/accept`, {
        method: 'POST'
      });
    },

    async rejectQuote(consultationId) {
      return API.request(`/consultations/${consultationId}/reject`, {
        method: 'POST'
      });
    },

    // 管理員專用
    async adminList(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/consultations/admin/all?${params}`);
    },

    async adminUpdate(consultationId, data) {
      return API.request(`/consultations/admin/${consultationId}`, {
        method: 'PUT',
        body: data
      });
    },

    async submitQuote(consultationId, quoteData) {
      return API.request(`/consultations/admin/${consultationId}/quote`, {
        method: 'POST',
        body: quoteData
      });
    }
  },

  // ===== 討論區 API =====
  discussions: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/discussions?${params}`);
    },

    async get(postId) {
      return API.request(`/discussions/${postId}`);
    },

    async create(data) {
      return API.request('/discussions', {
        method: 'POST',
        body: data
      });
    },

    async update(postId, data) {
      return API.request(`/discussions/${postId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(postId) {
      return API.request(`/discussions/${postId}`, {
        method: 'DELETE'
      });
    },

    async reply(postId, content) {
      return API.request(`/discussions/${postId}/reply`, {
        method: 'POST',
        body: { content }
      });
    },

    async deleteReply(postId, replyId) {
      return API.request(`/discussions/${postId}/reply/${replyId}`, {
        method: 'DELETE'
      });
    },

    async like(postId) {
      return API.request(`/discussions/${postId}/like`, {
        method: 'POST'
      });
    },

    async unlike(postId) {
      return API.request(`/discussions/${postId}/like`, {
        method: 'DELETE'
      });
    },

    async getTags() {
      return API.request('/discussions/meta/tags');
    },

    async search(query, filters = {}) {
      const params = new URLSearchParams({ q: query, ...filters }).toString();
      return API.request(`/discussions/search?${params}`);
    },

    // 管理員專用
    async adminList(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/discussions/admin/all?${params}`);
    },

    async adminDelete(postId) {
      return API.request(`/discussions/admin/${postId}`, {
        method: 'DELETE'
      });
    },

    async adminPin(postId, pinned = true) {
      return API.request(`/discussions/admin/${postId}/pin`, {
        method: 'PUT',
        body: { pinned }
      });
    }
  },

  // ===== 測驗 API =====
  quizzes: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/quizzes?${params}`);
    },

    async get(quizId) {
      return API.request(`/quizzes/${quizId}`);
    },

    async start(quizId) {
      return API.request(`/quizzes/${quizId}/start`, {
        method: 'POST'
      });
    },

    async answer(quizId, attemptId, questionId, answer) {
      return API.request(`/quizzes/${quizId}/attempts/${attemptId}/answer`, {
        method: 'POST',
        body: { questionId, answer }
      });
    },

    async submit(quizId, answers, timeSpent = 0) {
      return API.request(`/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: { answers, timeSpent }
      });
    },

    async getResult(quizId) {
      return API.request(`/quizzes/${quizId}/result`);
    },

    async getStats() {
      return API.request('/quizzes/stats/summary');
    },

    // 管理員/教師專用
    async create(data) {
      return API.request('/quizzes', {
        method: 'POST',
        body: data
      });
    },

    async update(quizId, data) {
      return API.request(`/quizzes/${quizId}`, {
        method: 'PUT',
        body: data
      });
    },

    async publish(quizId) {
      return API.request(`/quizzes/${quizId}/publish`, {
        method: 'PUT'
      });
    },

    async delete(quizId) {
      return API.request(`/quizzes/${quizId}`, {
        method: 'DELETE'
      });
    },

    // ===== 防作弊設定 API =====
    antiCheat: {
      // 獲取防作弊設定
      async getSettings(quizId) {
        return API.request(`/quizzes/${quizId}/settings/anti-cheat`);
      },

      // 更新防作弊設定
      async updateSettings(quizId, settings) {
        return API.request(`/quizzes/${quizId}/settings/anti-cheat`, {
          method: 'PUT',
          body: settings
        });
      },

      // 記錄行為事件
      async recordBehavior(quizId, attemptId, event) {
        return API.request(`/quizzes/${quizId}/attempts/${attemptId}/behavior`, {
          method: 'POST',
          body: event
        });
      },

      // 驗證測驗密碼
      async verifyPassword(quizId, password) {
        return API.request(`/quizzes/${quizId}/verify-password`, {
          method: 'POST',
          body: { password }
        });
      },

      // 上傳監控截圖
      async uploadScreenshot(quizId, attemptId, imageData) {
        return API.request(`/quizzes/${quizId}/attempts/${attemptId}/screenshot`, {
          method: 'POST',
          body: { imageData }
        });
      },

      // 獲取監控報告
      async getProctoringReport(quizId, attemptId) {
        return API.request(`/quizzes/${quizId}/attempts/${attemptId}/proctoring-report`);
      },

      // 獲取測驗監控摘要
      async getProctoringsSummary(quizId) {
        return API.request(`/quizzes/${quizId}/proctoring-summary`);
      }
    }
  },

  // ===== Moodle 課程 API =====
  courses: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/courses${params ? '?' + params : ''}`);
    },

    async get(courseId) {
      return API.request(`/courses/${courseId}`);
    },

    async create(data) {
      return API.request('/courses', {
        method: 'POST',
        body: data
      });
    },

    async update(courseId, data) {
      return API.request(`/courses/${courseId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(courseId) {
      return API.request(`/courses/${courseId}`, {
        method: 'DELETE'
      });
    }
  },

  // ===== 課程註冊 API =====
  courseEnrollment: {
    async enroll(courseId, enrollmentKey = null) {
      return API.request(`/courses/${courseId}/enroll`, {
        method: 'POST',
        body: enrollmentKey ? { enrollmentKey } : {}
      });
    },

    async unenroll(courseId) {
      return API.request(`/courses/${courseId}/unenroll`, {
        method: 'POST'
      });
    },

    async getParticipants(courseId) {
      return API.request(`/courses/${courseId}/participants`);
    }
  },

  // ===== 課程區段 API =====
  courseSections: {
    async list(courseId) {
      return API.request(`/courses/${courseId}/sections`);
    },

    async create(courseId, data) {
      return API.request(`/courses/${courseId}/sections`, {
        method: 'POST',
        body: data
      });
    },

    async update(courseId, sectionId, data) {
      return API.request(`/courses/${courseId}/sections/${sectionId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(courseId, sectionId) {
      return API.request(`/courses/${courseId}/sections/${sectionId}`, {
        method: 'DELETE'
      });
    },

    async addActivity(courseId, sectionId, activityData) {
      return API.request(`/courses/${courseId}/sections/${sectionId}/activities`, {
        method: 'POST',
        body: activityData
      });
    }
  },

  // ===== 成績簿 API =====
  gradebook: {
    async getCourseGradebook(courseId) {
      return API.request(`/gradebook/courses/${courseId}`);
    },

    async getMyGrades(courseId) {
      return API.request(`/gradebook/my${courseId ? '?courseId=' + courseId : ''}`);
    },

    async updateGrade(courseId, userId, itemId, data) {
      return API.request(`/gradebook/courses/${courseId}/users/${userId}/items/${itemId}`, {
        method: 'PUT',
        body: data
      });
    },

    async exportGrades(courseId, format = 'csv') {
      return API.request(`/gradebook/courses/${courseId}/export?format=${format}`);
    }
  },

  // ===== 作業 API =====
  assignments: {
    async list(courseId) {
      return API.request(`/assignments?courseId=${courseId}`);
    },

    async get(assignmentId) {
      return API.request(`/assignments/${assignmentId}`);
    },

    async create(data) {
      return API.request('/assignments', {
        method: 'POST',
        body: data
      });
    },

    async update(assignmentId, data) {
      return API.request(`/assignments/${assignmentId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(assignmentId) {
      return API.request(`/assignments/${assignmentId}`, {
        method: 'DELETE'
      });
    },

    async submit(assignmentId, data) {
      return API.request(`/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: data
      });
    },

    async getSubmissions(assignmentId) {
      return API.request(`/assignments/${assignmentId}/submissions`);
    },

    async gradeSubmission(assignmentId, submissionId, data) {
      return API.request(`/assignments/${assignmentId}/submissions/${submissionId}/grade`, {
        method: 'PUT',
        body: data
      });
    }
  },

  // ===== 討論區 API =====
  forums: {
    async list(courseId) {
      return API.request(`/forums?courseId=${courseId}`);
    },

    async get(forumId) {
      return API.request(`/forums/${forumId}`);
    },

    async create(data) {
      return API.request('/forums', {
        method: 'POST',
        body: data
      });
    },

    async createDiscussion(forumId, data) {
      return API.request(`/forums/${forumId}/discussions`, {
        method: 'POST',
        body: data
      });
    },

    async getDiscussion(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}`);
    },

    async replyToDiscussion(forumId, discussionId, data) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/posts`, {
        method: 'POST',
        body: data
      });
    }
  },

  // ===== 行事曆 API =====
  calendar: {
    async getEvents(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/calendar${params ? '?' + params : ''}`);
    },

    async createEvent(data) {
      return API.request('/calendar', {
        method: 'POST',
        body: data
      });
    },

    async updateEvent(eventId, data) {
      return API.request(`/calendar/${eventId}`, {
        method: 'PUT',
        body: data
      });
    },

    async deleteEvent(eventId) {
      return API.request(`/calendar/${eventId}`, {
        method: 'DELETE'
      });
    },

    async getUpcoming(days = 14) {
      const start = new Date().toISOString();
      const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      return API.request(`/calendar?start=${start}&end=${end}`);
    }
  },

  // ===== 通知 API =====
  notifications: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/notifications${params ? '?' + params : ''}`);
    },

    async markAsRead(notificationId) {
      return API.request(`/notifications/${notificationId}/read`, {
        method: 'PUT'
      });
    },

    async markAllAsRead() {
      return API.request('/notifications/read-all', {
        method: 'PUT'
      });
    },

    async getUnreadCount() {
      return API.request('/notifications/count');
    }
  },

  // ===== 檔案 API =====
  files: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/files${params ? '?' + params : ''}`);
    },

    async upload(file, folder = '') {
      const formData = new FormData();
      formData.append('file', file);
      if (folder) formData.append('folder', folder);

      return fetch(`${API.baseUrl}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API.accessToken}`
        },
        body: formData
      }).then(res => res.json());
    },

    async delete(fileId) {
      return API.request(`/files/${fileId}`, {
        method: 'DELETE'
      });
    },

    async createFolder(name, parentId = null) {
      return API.request('/files/folders', {
        method: 'POST',
        body: { name, parentId }
      });
    },

    async fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });
    }
  },

  // ===== 角色權限 API =====
  roles: {
    async list() {
      return API.request('/roles');
    },

    async get(roleId) {
      return API.request(`/roles/${roleId}`);
    },

    async create(data) {
      return API.request('/roles', {
        method: 'POST',
        body: data
      });
    },

    async update(roleId, data) {
      return API.request(`/roles/${roleId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(roleId) {
      return API.request(`/roles/${roleId}`, {
        method: 'DELETE'
      });
    },

    async getCapabilities() {
      return API.request('/roles/capabilities');
    },

    async assignRole(courseId, userId, role) {
      return API.request('/roles/assignments', {
        method: 'POST',
        body: { courseId, userId, role }
      });
    },

    async removeRole(courseId, userId) {
      return API.request('/roles/assignments', {
        method: 'DELETE',
        body: { courseId, userId }
      });
    },

    async getCourseRoles(courseId) {
      return API.request(`/roles/course/${courseId}`);
    },

    async getUserCapabilities(userId, courseId = null) {
      const params = courseId ? `?courseId=${courseId}` : '';
      return API.request(`/roles/users/${userId}/capabilities${params}`);
    }
  },

  // ===== 題庫 API =====
  questionBank: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/questionbank${params ? '?' + params : ''}`);
    },

    async get(questionId) {
      return API.request(`/questionbank/${questionId}`);
    },

    async create(data) {
      return API.request('/questionbank', {
        method: 'POST',
        body: data
      });
    },

    async update(questionId, data) {
      return API.request(`/questionbank/${questionId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(questionId) {
      return API.request(`/questionbank/${questionId}`, {
        method: 'DELETE'
      });
    },

    async getCategories() {
      return API.request('/questionbank/categories');
    },

    async createCategory(data) {
      return API.request('/questionbank/categories', {
        method: 'POST',
        body: data
      });
    },

    async updateCategory(categoryId, data) {
      return API.request(`/questionbank/categories/${categoryId}`, {
        method: 'PUT',
        body: data
      });
    },

    async deleteCategory(categoryId) {
      return API.request(`/questionbank/categories/${categoryId}`, {
        method: 'DELETE'
      });
    },

    async import(data) {
      return API.request('/questionbank/import', {
        method: 'POST',
        body: data
      });
    },

    async export(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/questionbank/export${params ? '?' + params : ''}`);
    },

    async addToQuiz(quizId, questionIds) {
      return API.request(`/quizzes/${quizId}/add-from-bank`, {
        method: 'POST',
        body: { questionIds }
      });
    },

    async addRandomToQuiz(quizId, categoryId, count, tags = []) {
      return API.request(`/quizzes/${quizId}/add-random`, {
        method: 'POST',
        body: { categoryId, count, tags }
      });
    }
  },

  // ===== 課程完成 API =====
  courseCompletion: {
    async getSettings(courseId) {
      return API.request(`/course-completion/${courseId}/settings`);
    },

    async updateSettings(courseId, data) {
      return API.request(`/course-completion/${courseId}/settings`, {
        method: 'PUT',
        body: data
      });
    },

    async getStatus(courseId) {
      return API.request(`/course-completion/${courseId}/status`);
    },

    async selfMark(courseId) {
      return API.request(`/course-completion/${courseId}/self-mark`, {
        method: 'POST'
      });
    },

    async manualMark(courseId, userId, completed) {
      return API.request(`/course-completion/${courseId}/manual-mark`, {
        method: 'POST',
        body: { userId, completed }
      });
    },

    async getReport(courseId) {
      return API.request(`/course-completion/${courseId}/report`);
    },

    async checkCompletion(courseId) {
      return API.request(`/course-completion/${courseId}/check`, {
        method: 'POST'
      });
    }
  },

  // ===== 課程類別 API =====
  courseCategories: {
    async list() {
      return API.request('/course-categories');
    },

    async get(categoryId) {
      return API.request(`/course-categories/${categoryId}`);
    },

    async create(data) {
      return API.request('/course-categories', {
        method: 'POST',
        body: data
      });
    },

    async update(categoryId, data) {
      return API.request(`/course-categories/${categoryId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(categoryId) {
      return API.request(`/course-categories/${categoryId}`, {
        method: 'DELETE'
      });
    },

    async reorder(categoryId, newParentId, position) {
      return API.request(`/course-categories/${categoryId}/reorder`, {
        method: 'PUT',
        body: { newParentId, position }
      });
    },

    async getTree() {
      return API.request('/course-categories/tree');
    }
  },

  // ===== 成績簿增強 API =====
  gradebookEnhanced: {
    async getCategories(courseId) {
      return API.request(`/gradebook/courses/${courseId}/categories`);
    },

    async createCategory(courseId, data) {
      return API.request(`/gradebook/courses/${courseId}/categories`, {
        method: 'POST',
        body: data
      });
    },

    async updateCategory(courseId, categoryId, data) {
      return API.request(`/gradebook/courses/${courseId}/categories/${categoryId}`, {
        method: 'PUT',
        body: data
      });
    },

    async deleteCategory(courseId, categoryId) {
      return API.request(`/gradebook/courses/${courseId}/categories/${categoryId}`, {
        method: 'DELETE'
      });
    },

    async getSettings(courseId) {
      return API.request(`/gradebook/courses/${courseId}/settings`);
    },

    async updateSettings(courseId, data) {
      return API.request(`/gradebook/courses/${courseId}/settings`, {
        method: 'PUT',
        body: data
      });
    },

    async exportGrades(courseId, format = 'csv') {
      return API.request(`/gradebook/courses/${courseId}/export?format=${format}`);
    },

    async batchUpdateGrades(courseId, grades) {
      return API.request(`/gradebook/courses/${courseId}/batch`, {
        method: 'PUT',
        body: { grades }
      });
    }
  },

  // ===== 學習路徑 API =====
  learningPaths: {
    async list() {
      return API.request('/learning-paths');
    },

    async get(pathId) {
      return API.request(`/learning-paths/${pathId}`);
    },

    async create(data) {
      return API.request('/learning-paths', {
        method: 'POST',
        body: data
      });
    },

    async update(pathId, data) {
      return API.request(`/learning-paths/${pathId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(pathId) {
      return API.request(`/learning-paths/${pathId}`, {
        method: 'DELETE'
      });
    },

    async enroll(pathId) {
      return API.request(`/learning-paths/${pathId}/enroll`, {
        method: 'POST'
      });
    },

    async unenroll(pathId) {
      return API.request(`/learning-paths/${pathId}/enroll`, {
        method: 'DELETE'
      });
    },

    async getProgress(pathId) {
      return API.request(`/learning-paths/${pathId}/progress`);
    },

    async getReport(pathId) {
      return API.request(`/learning-paths/${pathId}/report`);
    },

    async getPrerequisites(courseId) {
      return API.request(`/learning-paths/courses/${courseId}/prerequisites`);
    },

    async updatePrerequisites(courseId, requirements) {
      return API.request(`/learning-paths/courses/${courseId}/prerequisites`, {
        method: 'PUT',
        body: { requirements }
      });
    },

    async checkPrerequisites(courseId) {
      return API.request(`/learning-paths/courses/${courseId}/check-prerequisites`, {
        method: 'POST'
      });
    }
  },

  // ===== 徽章系統 API =====
  badges: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/badges${params ? '?' + params : ''}`);
    },

    async get(badgeId) {
      return API.request(`/badges/${badgeId}`);
    },

    async create(data) {
      return API.request('/badges', {
        method: 'POST',
        body: data
      });
    },

    async update(badgeId, data) {
      return API.request(`/badges/${badgeId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(badgeId) {
      return API.request(`/badges/${badgeId}`, {
        method: 'DELETE'
      });
    },

    async issue(badgeId, userIds, message = '') {
      return API.request(`/badges/${badgeId}/issue`, {
        method: 'POST',
        body: { userIds, message }
      });
    },

    async revoke(badgeId, userId, reason = '') {
      return API.request(`/badges/${badgeId}/revoke/${userId}`, {
        method: 'DELETE',
        body: { reason }
      });
    },

    async getMyBadges() {
      return API.request('/badges/my/collection');
    },

    async getUserBadges(userId) {
      return API.request(`/badges/users/${userId}`);
    },

    async updateDisplayBadges(badgeIds) {
      return API.request('/badges/my/display', {
        method: 'PUT',
        body: { badgeIds }
      });
    },

    async getRecipients(badgeId, page = 1, limit = 20) {
      return API.request(`/badges/${badgeId}/recipients?page=${page}&limit=${limit}`);
    },

    async getStats() {
      return API.request('/badges/stats/overview');
    }
  },

  // ===== 評分標準 (Rubrics) API =====
  rubrics: {
    async getTemplates() {
      return API.request('/rubrics/templates');
    },

    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/rubrics${params ? '?' + params : ''}`);
    },

    async get(rubricId) {
      return API.request(`/rubrics/${rubricId}`);
    },

    async create(data) {
      return API.request('/rubrics', {
        method: 'POST',
        body: data
      });
    },

    async update(rubricId, data) {
      return API.request(`/rubrics/${rubricId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(rubricId) {
      return API.request(`/rubrics/${rubricId}`, {
        method: 'DELETE'
      });
    },

    async duplicate(rubricId, data) {
      return API.request(`/rubrics/${rubricId}/duplicate`, {
        method: 'POST',
        body: data
      });
    },

    async grade(rubricId, submissionId, criteriaScores, feedback = '') {
      return API.request(`/rubrics/${rubricId}/grade`, {
        method: 'POST',
        body: { submissionId, criteriaScores, feedback }
      });
    },

    async getGrading(rubricId, submissionId) {
      return API.request(`/rubrics/${rubricId}/gradings/${submissionId}`);
    },

    async attachToAssignment(rubricId, assignmentId) {
      return API.request(`/rubrics/${rubricId}/attach`, {
        method: 'PUT',
        body: { assignmentId }
      });
    },

    async detachFromAssignment(rubricId, assignmentId) {
      return API.request(`/rubrics/${rubricId}/detach/${assignmentId}`, {
        method: 'DELETE'
      });
    }
  },

  // ===== 論壇增強 API =====
  forumsEnhanced: {
    async getSubscription(forumId) {
      return API.request(`/forums/${forumId}/subscription`);
    },

    async subscribe(forumId, options = {}) {
      return API.request(`/forums/${forumId}/subscribe`, {
        method: 'POST',
        body: options
      });
    },

    async unsubscribe(forumId) {
      return API.request(`/forums/${forumId}/subscribe`, {
        method: 'DELETE'
      });
    },

    async subscribeDiscussion(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/subscribe`, {
        method: 'POST'
      });
    },

    async unsubscribeDiscussion(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/subscribe`, {
        method: 'DELETE'
      });
    },

    async getUnread(forumId) {
      return API.request(`/forums/${forumId}/unread`);
    },

    async markForumRead(forumId) {
      return API.request(`/forums/${forumId}/mark-read`, {
        method: 'POST'
      });
    },

    async markDiscussionRead(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/mark-read`, {
        method: 'POST'
      });
    },

    async ratePost(forumId, discussionId, postId, rating) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/posts/${postId}/rate`, {
        method: 'POST',
        body: { rating }
      });
    },

    async getPostRatings(forumId, discussionId, postId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/posts/${postId}/ratings`);
    },

    async pinDiscussion(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/pin`, {
        method: 'POST'
      });
    },

    async unpinDiscussion(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/pin`, {
        method: 'DELETE'
      });
    },

    async lockDiscussion(forumId, discussionId, reason = '') {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/lock`, {
        method: 'POST',
        body: { reason }
      });
    },

    async unlockDiscussion(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/lock`, {
        method: 'DELETE'
      });
    }
  },

  // ===== 課程群組 API =====
  courseGroups: {
    // 群組模式常量
    GROUP_MODES: {
      NOGROUPS: 0,        // 無群組模式
      SEPARATEGROUPS: 1,  // 分開群組（學生只看自己群組）
      VISIBLEGROUPS: 2    // 可見群組（學生可看其他群組但只能在自己群組互動）
    },

    async list(courseId) {
      return API.request(`/courses/${courseId}/groups`);
    },

    async get(courseId, groupId) {
      return API.request(`/courses/${courseId}/groups/${groupId}`);
    },

    async create(courseId, data) {
      return API.request(`/courses/${courseId}/groups`, {
        method: 'POST',
        body: data
      });
    },

    async update(courseId, groupId, data) {
      return API.request(`/courses/${courseId}/groups/${groupId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(courseId, groupId) {
      return API.request(`/courses/${courseId}/groups/${groupId}`, {
        method: 'DELETE'
      });
    },

    async getMembers(courseId, groupId) {
      return API.request(`/courses/${courseId}/groups/${groupId}/members`);
    },

    async addMembers(courseId, groupId, userIds) {
      return API.request(`/courses/${courseId}/groups/${groupId}/members`, {
        method: 'POST',
        body: { userIds }
      });
    },

    async removeMember(courseId, groupId, userId) {
      return API.request(`/courses/${courseId}/groups/${groupId}/members/${userId}`, {
        method: 'DELETE'
      });
    },

    async getSettings(courseId) {
      return API.request(`/courses/${courseId}/group-settings`);
    },

    async updateSettings(courseId, settings) {
      return API.request(`/courses/${courseId}/group-settings`, {
        method: 'PUT',
        body: settings
      });
    },

    async getMyGroups(courseId) {
      return API.request(`/courses/${courseId}/my-groups`);
    },

    async getOverview(courseId) {
      return API.request(`/courses/${courseId}/group-overview`);
    },

    async autoCreate(courseId, groupCount, groupNamePrefix = '群組') {
      return API.request(`/courses/${courseId}/auto-create-groups`, {
        method: 'POST',
        body: { groupCount, groupNamePrefix }
      });
    }
  },

  // ===== 審計日誌 API =====
  auditLogs: {
    // 事件類型常量
    EVENT_TYPES: {
      USER_LOGIN: 'user_login',
      USER_LOGOUT: 'user_logout',
      USER_REGISTER: 'user_register',
      USER_UPDATE: 'user_update',
      USER_DELETE: 'user_delete',
      COURSE_CREATE: 'course_create',
      COURSE_UPDATE: 'course_update',
      COURSE_DELETE: 'course_delete',
      COURSE_ENROLL: 'course_enroll',
      COURSE_UNENROLL: 'course_unenroll',
      ASSIGNMENT_CREATE: 'assignment_create',
      ASSIGNMENT_UPDATE: 'assignment_update',
      ASSIGNMENT_SUBMIT: 'assignment_submit',
      ASSIGNMENT_GRADE: 'assignment_grade',
      QUIZ_CREATE: 'quiz_create',
      QUIZ_UPDATE: 'quiz_update',
      QUIZ_ATTEMPT_START: 'quiz_attempt_start',
      QUIZ_ATTEMPT_SUBMIT: 'quiz_attempt_submit',
      GRADE_UPDATE: 'grade_update',
      FILE_UPLOAD: 'file_upload',
      FILE_DOWNLOAD: 'file_download',
      FILE_DELETE: 'file_delete',
      SYSTEM_CONFIG_UPDATE: 'system_config_update',
      ROLE_CREATE: 'role_create',
      ROLE_UPDATE: 'role_update',
      SECURITY_FAILED_LOGIN: 'security_failed_login',
      DATA_EXPORT: 'data_export',
      BULK_OPERATION: 'bulk_operation'
    },

    SEVERITY_LEVELS: {
      INFO: 'info',
      WARNING: 'warning',
      ERROR: 'error',
      CRITICAL: 'critical'
    },

    // 獲取審計日誌列表
    async list(filters = {}) {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value);
        }
      });
      return API.request(`/audit-logs?${params.toString()}`);
    },

    // 獲取審計統計
    async getStats(days = 7) {
      return API.request(`/audit-logs/stats?days=${days}`);
    },

    // 獲取用戶審計日誌
    async getUserLogs(userId, limit = 50) {
      return API.request(`/audit-logs/user/${userId}?limit=${limit}`);
    },

    // 獲取事件類型列表
    async getEventTypes() {
      return API.request('/audit-logs/event-types');
    },

    // 搜尋審計日誌
    async search(query, filters = {}) {
      const params = new URLSearchParams({ query, ...filters });
      return API.request(`/audit-logs/search?${params.toString()}`);
    },

    // 匯出審計日誌
    async exportLogs(filters = {}, format = 'csv') {
      const params = new URLSearchParams({ ...filters, format });
      // 直接返回 URL，讓前端處理下載
      return `${API.BASE_URL}/audit-logs/export?${params.toString()}`;
    },

    // 記錄審計事件
    async log(eventType, data = {}) {
      return API.request('/audit-logs', {
        method: 'POST',
        body: { eventType, ...data }
      });
    },

    // 清理舊日誌
    async cleanup(keepDays = 90) {
      return API.request(`/audit-logs/cleanup?keepDays=${keepDays}`, {
        method: 'DELETE'
      });
    }
  },

  // ==================== SCORM API ====================
  scorm: {
    // 獲取 SCORM 包列表
    async list(filters = {}) {
      const params = new URLSearchParams();
      if (filters.courseId) params.append('courseId', filters.courseId);
      if (filters.status) params.append('status', filters.status);
      if (filters.limit) params.append('limit', filters.limit);
      return API.request(`/scorm?${params.toString()}`);
    },

    // 獲取單個 SCORM 包
    async get(packageId) {
      return API.request(`/scorm/${packageId}`);
    },

    // 創建 SCORM 包
    async create(data) {
      return API.request('/scorm', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // 更新 SCORM 包
    async update(packageId, data) {
      return API.request(`/scorm/${packageId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    // 啟動 SCORM 包
    async launch(packageId, data = {}) {
      return API.request(`/scorm/${packageId}/launch`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // 獲取運行時數據
    async getRuntime(packageId, attemptId) {
      return API.request(`/scorm/${packageId}/runtime/${attemptId}`);
    },

    // 更新運行時數據
    async setRuntime(packageId, attemptId, element, value) {
      return API.request(`/scorm/${packageId}/runtime/${attemptId}`, {
        method: 'PUT',
        body: JSON.stringify({ element, value })
      });
    },

    // 提交數據
    async commit(packageId, attemptId) {
      return API.request(`/scorm/${packageId}/commit/${attemptId}`, {
        method: 'POST'
      });
    },

    // 結束會話
    async finish(packageId, attemptId) {
      return API.request(`/scorm/${packageId}/finish/${attemptId}`, {
        method: 'POST'
      });
    },

    // 獲取嘗試記錄
    async getAttempts(packageId, userId = null) {
      const params = userId ? `?userId=${userId}` : '';
      return API.request(`/scorm/${packageId}/attempts${params}`);
    },

    // 獲取報告
    async getReport(packageId) {
      return API.request(`/scorm/${packageId}/report`);
    },

    // 刪除 SCORM 包
    async delete(packageId) {
      return API.request(`/scorm/${packageId}`, {
        method: 'DELETE'
      });
    }
  },

  // ==================== LTI API ====================
  lti: {
    // 獲取工具列表
    async getTools(filters = {}) {
      const params = new URLSearchParams();
      if (filters.courseId) params.append('courseId', filters.courseId);
      if (filters.status) params.append('status', filters.status);
      return API.request(`/lti/tools?${params.toString()}`);
    },

    // 獲取單個工具
    async getTool(toolId) {
      return API.request(`/lti/tools/${toolId}`);
    },

    // 創建工具
    async createTool(data) {
      return API.request('/lti/tools', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // 更新工具
    async updateTool(toolId, data) {
      return API.request(`/lti/tools/${toolId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    // 啟動工具
    async launch(toolId, data = {}) {
      return API.request(`/lti/tools/${toolId}/launch`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // 獲取成績
    async getGrades(toolId, filters = {}) {
      const params = new URLSearchParams();
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.resourceId) params.append('resourceId', filters.resourceId);
      return API.request(`/lti/tools/${toolId}/grades?${params.toString()}`);
    },

    // 刪除工具
    async deleteTool(toolId) {
      return API.request(`/lti/tools/${toolId}`, {
        method: 'DELETE'
      });
    },

    // 獲取平台配置
    async getConfig() {
      return API.request('/lti/config');
    }
  },

  // ==================== H5P API ====================
  h5p: {
    // 獲取內容列表
    async list(filters = {}) {
      const params = new URLSearchParams();
      if (filters.courseId) params.append('courseId', filters.courseId);
      if (filters.contentType) params.append('contentType', filters.contentType);
      if (filters.status) params.append('status', filters.status);
      if (filters.limit) params.append('limit', filters.limit);
      return API.request(`/h5p?${params.toString()}`);
    },

    // 獲取可用內容類型
    async getTypes() {
      return API.request('/h5p/types');
    },

    // 獲取單個內容
    async get(contentId) {
      return API.request(`/h5p/${contentId}`);
    },

    // 創建內容
    async create(data) {
      return API.request('/h5p', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // 更新內容
    async update(contentId, data) {
      return API.request(`/h5p/${contentId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    // 記錄瀏覽
    async recordView(contentId) {
      return API.request(`/h5p/${contentId}/view`, {
        method: 'POST'
      });
    },

    // 提交嘗試結果
    async submitAttempt(contentId, data) {
      return API.request(`/h5p/${contentId}/attempt`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // 獲取嘗試記錄
    async getAttempts(contentId, userId = null) {
      const params = userId ? `?userId=${userId}` : '';
      return API.request(`/h5p/${contentId}/attempts${params}`);
    },

    // 獲取報告
    async getReport(contentId) {
      return API.request(`/h5p/${contentId}/report`);
    },

    // 獲取嵌入代碼
    async getEmbed(contentId) {
      return API.request(`/h5p/${contentId}/embed`);
    },

    // 刪除內容
    async delete(contentId) {
      return API.request(`/h5p/${contentId}`, {
        method: 'DELETE'
      });
    },

    // 複製內容
    async duplicate(contentId, data = {}) {
      return API.request(`/h5p/${contentId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
  },

  // ===== 教師功能 API =====
  teachers: {
    // 獲取學生預警列表
    async getAlerts() {
      return API.request('/teachers/alerts');
    },

    // 標記預警為已處理
    async dismissAlert(alertId, note = '') {
      return API.request(`/teachers/alerts/${alertId}/dismiss`, {
        method: 'POST',
        body: { note }
      });
    },

    // 獲取教師儀表板統計
    async getDashboard() {
      return API.request('/teachers/dashboard');
    }
  }
};

// 匯出到全域
window.API = API;
