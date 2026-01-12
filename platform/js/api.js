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
      return API.request(`/forums/${forumId}/discussions/${discussionId}/replies`, {
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
      return API.request(`/quizzes/questionbank${params ? '?' + params : ''}`);
    },

    async get(questionId) {
      return API.request(`/quizzes/questionbank/${questionId}`);
    },

    async create(data) {
      return API.request('/quizzes/questionbank', {
        method: 'POST',
        body: data
      });
    },

    async update(questionId, data) {
      return API.request(`/quizzes/questionbank/${questionId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(questionId) {
      return API.request(`/quizzes/questionbank/${questionId}`, {
        method: 'DELETE'
      });
    },

    async getCategories() {
      return API.request('/quizzes/questionbank/categories');
    },

    async createCategory(data) {
      return API.request('/quizzes/questionbank/categories', {
        method: 'POST',
        body: data
      });
    },

    async updateCategory(categoryId, data) {
      return API.request(`/quizzes/questionbank/categories/${categoryId}`, {
        method: 'PUT',
        body: data
      });
    },

    async deleteCategory(categoryId) {
      return API.request(`/quizzes/questionbank/categories/${categoryId}`, {
        method: 'DELETE'
      });
    },

    async import(data) {
      return API.request('/quizzes/questionbank/import', {
        method: 'POST',
        body: data
      });
    },

    async export(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/quizzes/questionbank/export${params ? '?' + params : ''}`);
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
      return API.request(`/courses/${courseId}/completion/settings`);
    },

    async updateSettings(courseId, data) {
      return API.request(`/courses/${courseId}/completion/settings`, {
        method: 'PUT',
        body: data
      });
    },

    async getStatus(courseId) {
      return API.request(`/courses/${courseId}/completion/status`);
    },

    async selfMark(courseId) {
      return API.request(`/courses/${courseId}/completion/self-mark`, {
        method: 'POST'
      });
    },

    async manualMark(courseId, userId, completed) {
      return API.request(`/courses/${courseId}/completion/manual/${userId}`, {
        method: 'POST',
        body: { completed }
      });
    },

    async getReport(courseId) {
      return API.request(`/courses/${courseId}/completion/report`);
    },

    async checkCompletion(courseId) {
      return API.request(`/courses/${courseId}/check-completion`, {
        method: 'POST'
      });
    }
  },

  // ===== 課程類別 API =====
  courseCategories: {
    async list() {
      return API.request('/courses/categories');
    },

    async get(categoryId) {
      return API.request(`/courses/categories/${categoryId}`);
    },

    async create(data) {
      return API.request('/courses/categories', {
        method: 'POST',
        body: data
      });
    },

    async update(categoryId, data) {
      return API.request(`/courses/categories/${categoryId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(categoryId) {
      return API.request(`/courses/categories/${categoryId}`, {
        method: 'DELETE'
      });
    },

    async reorder(categoryId, newParentId, position) {
      return API.request(`/courses/categories/${categoryId}/reorder`, {
        method: 'PUT',
        body: { newParentId, position }
      });
    },

    async getTree() {
      return API.request('/courses/categories/tree');
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
  }
};

// 匯出到全域
window.API = API;
