/**
 * BeyondBridge API Client
 * 前端 API 呼叫模組
 */

const API = {
  // API 基礎 URL（自動偵測環境）
  // 自動偵測 API URL（使用當前頁面的 origin）
  baseUrl: window.location.hostname === 'localhost'
    ? `${window.location.origin}/api`
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
        'X-Language': (typeof I18n !== 'undefined' && I18n.getLocale) ? I18n.getLocale() : 'zh-TW',
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
        window.location.href = '/platform';
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
    },

    /**
     * 請求寄送密碼重設信
     */
    async requestPasswordReset(email) {
      return API.request('/auth/password/reset/request', {
        method: 'POST',
        body: { email }
      });
    },

    /**
     * 驗證密碼重設 token
     */
    async validatePasswordResetToken(token) {
      const query = new URLSearchParams({ token }).toString();
      return API.request(`/auth/password/reset/validate?${query}`);
    },

    /**
     * 完成密碼重設
     */
    async confirmPasswordReset(token, newPassword) {
      return API.request('/auth/password/reset/confirm', {
        method: 'POST',
        body: { token, newPassword }
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
    },

    async getVideoProgress(userId) {
      return API.request(`/users/${userId}/video-progress`);
    },

    async updateVideoProgress(userId, videoId, data) {
      return API.request(`/users/${userId}/video-progress/${encodeURIComponent(videoId)}`, {
        method: 'PUT',
        body: data
      });
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
    },

    async getMyCourses(role = 'student') {
      const qs = role ? `?role=${encodeURIComponent(role)}` : '';
      return API.request(`/courses/my${qs}`);
    },

    async enroll(courseId, enrollmentKey = null) {
      return API.request(`/courses/${courseId}/enroll`, {
        method: 'POST',
        body: enrollmentKey ? { enrollmentKey } : {}
      });
    },

    async unenroll(courseId) {
      return API.request(`/courses/${courseId}/enroll`, {
        method: 'DELETE'
      });
    },

    async getParticipants(courseId) {
      return API.request(`/courses/${courseId}/participants`);
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

    async completeActivity(courseId, activityId) {
      return API.request(`/courses/${courseId}/activities/${activityId}/complete`, {
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

    async grantLicense(data) {
      return API.request('/admin/licenses/grant', {
        method: 'POST',
        body: data
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
    },

    // 管理後台模組化 API（給 admin/index.html 使用）
    analytics: {
      async getOverview() {
        return API.request('/admin/analytics/overview');
      },

      async getUserActivity(range = '30d', groupBy = 'day') {
        const params = new URLSearchParams({ range, groupBy }).toString();
        return API.request(`/admin/analytics/user-activity?${params}`);
      }
    },

    automation: {
      async getRules() {
        return API.request('/admin/automation/rules');
      },

      async createRule(data) {
        return API.request('/admin/automation/rules', {
          method: 'POST',
          body: data
        });
      },

      async updateRule(ruleId, data) {
        return API.request(`/admin/automation/rules/${ruleId}`, {
          method: 'PUT',
          body: data
        });
      },

      async deleteRule(ruleId) {
        return API.request(`/admin/automation/rules/${ruleId}`, {
          method: 'DELETE'
        });
      },

      async toggleRule(ruleId) {
        return API.request(`/admin/automation/rules/${ruleId}/toggle`, {
          method: 'PUT'
        });
      }
    },

    systemHealth: {
      async get() {
        return API.request('/admin/system/health');
      },

      async getErrors(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return API.request(`/admin/system/errors${params ? '?' + params : ''}`);
      }
    },

    export: {
      async users(data = {}) {
        return API.request('/admin/export/users', {
          method: 'POST',
          body: data
        });
      },

      async courses(data = {}) {
        return API.request('/admin/export/courses', {
          method: 'POST',
          body: data
        });
      },

      async licenses(data = {}) {
        return API.request('/admin/export/licenses', {
          method: 'POST',
          body: data
        });
      }
    }
  },

  // ===== 班級 API =====
  classes: {
    normalizeMemberPayload(member = {}) {
      const displayName = member.displayName || member.userName || member.name || '';
      const email = member.email || member.userEmail || '';
      return {
        ...member,
        displayName,
        userName: member.userName || displayName,
        email,
        userEmail: member.userEmail || email
      };
    },

    normalizeClassPayload(classData = {}) {
      const classId = classData.classId || classData.id || '';
      const name = classData.name || classData.className || '';
      const members = Array.isArray(classData.members)
        ? classData.members.map(member => this.normalizeMemberPayload(member))
        : [];
      const assignments = Array.isArray(classData.assignments) ? classData.assignments : [];

      return {
        ...classData,
        classId,
        id: classId,
        name,
        className: name,
        description: classData.description || '',
        subject: classData.subject || '',
        teacherName: classData.teacherName || classData.instructorName || '',
        members,
        assignments,
        memberCount: classData.memberCount ?? members.length,
        assignmentCount: classData.assignmentCount ?? assignments.length
      };
    },

    normalizeClassList(payload) {
      if (!Array.isArray(payload)) return [];
      return payload.map(cls => this.normalizeClassPayload(cls));
    },

    filterByScope(classes, options = {}) {
      const user = API.getCurrentUser();
      const scope = typeof options === 'string' ? options : options.scope;
      const includeArchived = typeof options === 'object' && options.includeArchived === true;

      let result = Array.isArray(classes) ? classes : [];

      if (!includeArchived) {
        result = result.filter(cls => cls.status !== 'archived');
      }

      if (!scope || !user) return result;

      if (scope === 'owned') {
        if (user.isAdmin) return result;
        return result.filter(cls => cls.teacherId === user.userId);
      }

      if (scope === 'enrolled') {
        if (user.isAdmin) return result;
        return result.filter(cls => cls.isEnrolled === true || cls.teacherId !== user.userId);
      }

      return result;
    },

    async list(options = {}) {
      const result = await API.request('/classes');
      if (!result?.success) return result;

      const normalized = this.normalizeClassList(result.data);
      return {
        ...result,
        data: this.filterByScope(normalized, options)
      };
    },

    async get(classId) {
      const result = await API.request(`/classes/${classId}`);
      if (!result?.success) return result;
      return {
        ...result,
        data: this.normalizeClassPayload(result.data || {})
      };
    },

    async create(data) {
      const payload = { ...(data || {}) };
      if (!payload.name && payload.className) {
        payload.name = payload.className;
      }
      delete payload.className;

      const result = await API.request('/classes', {
        method: 'POST',
        body: payload
      });
      if (!result?.success) return result;
      return {
        ...result,
        data: this.normalizeClassPayload(result.data || {})
      };
    },

    async update(classId, data) {
      const payload = { ...(data || {}) };
      if (!payload.name && payload.className) {
        payload.name = payload.className;
      }
      delete payload.className;

      const result = await API.request(`/classes/${classId}`, {
        method: 'PUT',
        body: payload
      });
      if (!result?.success) return result;
      return {
        ...result,
        data: this.normalizeClassPayload(result.data || {})
      };
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
      return API.request(`/consultations/${consultationId}`, {
        method: 'PUT',
        body: { action: 'accept_quote' }
      });
    },

    async rejectQuote(consultationId) {
      return API.request(`/consultations/${consultationId}`, {
        method: 'PUT',
        body: { action: 'reject_quote' }
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
      return API.request(`/consultations/admin/${consultationId}`, {
        method: 'PUT',
        body: {
          quote: quoteData,
          status: quoteData?.status || 'quoted'
        }
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
      return API.request('/discussions/tags');
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
    },

    // 作答流程
    async start(quizId) {
      return API.request(`/quizzes/${quizId}/start`, { method: 'POST' });
    },

    async answer(quizId, attemptId, data) {
      return API.request(`/quizzes/${quizId}/attempts/${attemptId}/answer`, {
        method: 'PUT',
        body: data
      });
    },

    async submitAttempt(quizId, attemptId, answers) {
      return API.request(`/quizzes/${quizId}/attempts/${attemptId}/submit`, {
        method: 'POST',
        body: { answers }
      });
    },

    async reviewAttempt(quizId, attemptId) {
      return API.request(`/quizzes/${quizId}/attempts/${attemptId}/review`);
    },

    async getResults(quizId) {
      return API.request(`/quizzes/${quizId}/results`);
    }
  },

  // (courses API 已合併至上方)

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

  // ===== 課程活動 API =====
  courseActivities: {
    async get(courseId, activityId) {
      return API.request(`/courses/${courseId}/activities/${activityId}`);
    },

    async update(courseId, activityId, data) {
      return API.request(`/courses/${courseId}/activities/${activityId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(courseId, activityId) {
      return API.request(`/courses/${courseId}/activities/${activityId}`, {
        method: 'DELETE'
      });
    }
  },

  // ===== 成績簿 API =====
  gradebook: {
    async getCourseGradebook(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}`);
    },

    async getMyGrades(courseId) {
      return API.request(`/gradebook/my${courseId ? '?courseId=' + courseId : ''}`);
    },

    async updateGrade(courseId, itemId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/items/${itemId}/grades`, {
        method: 'PUT',
        body: data
      });
    },

    async getStudentGrades(courseId, studentId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/students/${studentId}`);
    },

    async getScales() {
      return API.request('/gradebook/scales');
    },

    async getItems(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/items`);
    },

    async createItem(courseId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/items`, {
        method: 'POST',
        body: data
      });
    },

    async updateItem(courseId, itemId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/items/${itemId}`, {
        method: 'PUT',
        body: data
      });
    },

    async deleteItem(courseId, itemId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/items/${itemId}`, {
        method: 'DELETE'
      });
    },

    async getSettings(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/settings`);
    },

    async updateSettings(courseId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/settings`, {
        method: 'PUT',
        body: data
      });
    },

    async exportGrades(courseId, format = 'csv') {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      const endpoint = `${API.baseUrl}/gradebook/courses/${courseId}/export?format=${encodeURIComponent(format)}`;
      const headers = {
        'X-Language': (typeof I18n !== 'undefined' && I18n.getLocale) ? I18n.getLocale() : 'zh-TW'
      };

      if (API.accessToken) {
        headers.Authorization = `Bearer ${API.accessToken}`;
      }

      const response = await fetch(endpoint, { headers });
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        return response.json();
      }

      const text = await response.text();
      if (!response.ok) {
        return {
          success: false,
          error: 'EXPORT_FAILED',
          message: text || '匯出失敗'
        };
      }

      return {
        success: true,
        data: format === 'csv' ? { csv: text } : { raw: text }
      };
    }
  },

  // ===== 作業 API =====
  assignments: {
    async list(courseId) {
      return API.request(courseId ? `/assignments?courseId=${courseId}` : '/assignments');
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

    async withdraw(assignmentId) {
      return API.request(`/assignments/${assignmentId}/submit`, {
        method: 'DELETE'
      });
    },

    async getSubmissions(assignmentId) {
      return API.request(`/assignments/${assignmentId}/submissions`);
    },

    async gradeSubmission(assignmentId, studentId, data) {
      return API.request(`/assignments/${assignmentId}/submissions/${studentId}/grade`, {
        method: 'POST',
        body: data
      });
    },

    async getSubmission(assignmentId, submissionId) {
      return API.request(`/assignments/${assignmentId}/submissions/${submissionId}`);
    },

    async extend(assignmentId, data) {
      return API.request(`/assignments/${assignmentId}/extend`, {
        method: 'POST',
        body: data
      });
    },

    async downloadAll(assignmentId) {
      return API.request(`/assignments/${assignmentId}/download-all`);
    },

    async exportGrades(assignmentId) {
      return API.request(`/assignments/${assignmentId}/export-grades`);
    },

    async bulkGrade(assignmentId, grades) {
      return API.request(`/assignments/${assignmentId}/bulk-grade`, {
        method: 'POST',
        body: { grades }
      });
    },

    async getSubmissionStats(assignmentId) {
      return API.request(`/assignments/${assignmentId}/submission-stats`);
    },

    async getMy() {
      return API.request('/assignments/my');
    }
  },

  // ===== 討論區 API =====
  forums: {
    normalizeDiscussion(data = {}) {
      const discussionId = data.discussionId || data.id || null;
      return {
        ...data,
        id: discussionId,
        discussionId,
        title: data.title || data.subject || '',
        subject: data.subject || data.title || '',
        content: data.content || data.message || '',
        message: data.message || data.content || '',
        replyCount: Number(data.replyCount ?? data.postCount ?? 0),
        lastReply: data.lastReply || data.lastReplyAt || data.latestReply?.createdAt || null
      };
    },

    normalizeDiscussionPost(post = {}, depth = 0) {
      const postId = post.postId || post.id || null;
      const currentUser = API.getCurrentUser ? API.getCurrentUser() : null;
      const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
      const replies = Array.isArray(post.replies) ? post.replies : [];

      return {
        ...post,
        id: postId,
        postId,
        content: post.content || post.message || '',
        message: post.message || post.content || '',
        likes: Number(post.likes || 0),
        liked: typeof post.liked === 'boolean'
          ? post.liked
          : !!(currentUser && likedBy.includes(currentUser.userId)),
        replyDepth: depth,
        replies: replies.map(reply => this.normalizeDiscussionPost(reply, depth + 1))
      };
    },

    flattenDiscussionPosts(posts = [], depth = 0, flat = []) {
      posts.forEach(post => {
        const normalized = this.normalizeDiscussionPost(post, depth);
        flat.push(normalized);
        if (Array.isArray(normalized.replies) && normalized.replies.length > 0) {
          this.flattenDiscussionPosts(normalized.replies, depth + 1, flat);
        }
      });
      return flat;
    },

    async list(courseId) {
      return API.request(courseId ? `/forums?courseId=${courseId}` : '/forums');
    },

    async get(forumId) {
      const result = await API.request(`/forums/${forumId}`);
      if (!result?.success || !result.data) return result;
      const discussions = Array.isArray(result.data.discussions) ? result.data.discussions : [];
      return {
        ...result,
        data: {
          ...result.data,
          discussions: discussions.map(discussion => this.normalizeDiscussion(discussion))
        }
      };
    },

    async create(data) {
      return API.request('/forums', {
        method: 'POST',
        body: data
      });
    },

    async update(forumId, data) {
      return API.request(`/forums/${forumId}`, {
        method: 'PUT',
        body: data
      });
    },

    async delete(forumId) {
      return API.request(`/forums/${forumId}`, {
        method: 'DELETE'
      });
    },

    async createDiscussion(forumId, data) {
      return API.request(`/forums/${forumId}/discussions`, {
        method: 'POST',
        body: {
          ...data,
          title: data?.title || data?.subject || '',
          content: data?.content || data?.message || ''
        }
      });
    },

    async getDiscussion(forumId, discussionId) {
      const result = await API.request(`/forums/${forumId}/discussions/${discussionId}`);
      if (!result?.success || !result.data) return result;
      const rootPosts = Array.isArray(result.data.posts) ? result.data.posts : [];
      return {
        ...result,
        data: {
          ...this.normalizeDiscussion(result.data),
          posts: this.flattenDiscussionPosts(rootPosts)
        }
      };
    },

    async updateDiscussion(forumId, discussionId, data) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}`, {
        method: 'PUT',
        body: {
          ...data,
          title: data?.title || data?.subject || '',
          content: data?.content || data?.message || ''
        }
      });
    },

    async deleteDiscussion(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}`, {
        method: 'DELETE'
      });
    },

    async replyToDiscussion(forumId, discussionId, data) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/posts`, {
        method: 'POST',
        body: {
          ...data,
          content: data?.content || data?.message || ''
        }
      });
    },

    // moodle-ui.js 使用的別名
    async reply(forumId, discussionId, data) {
      return this.replyToDiscussion(forumId, discussionId, data);
    },

    async updatePost(forumId, discussionId, postId, data) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/posts/${postId}`, {
        method: 'PUT',
        body: {
          ...data,
          content: data?.content || data?.message || ''
        }
      });
    },

    async deletePost(forumId, discussionId, postId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/posts/${postId}`, {
        method: 'DELETE'
      });
    },

    async likePost(forumId, discussionId, postId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/posts/${postId}/like`, {
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

    async getSubscription(forumId) {
      return API.request(`/forums/${forumId}/subscription`);
    },

    async subscribe(forumId, data = {}) {
      return API.request(`/forums/${forumId}/subscribe`, {
        method: 'POST',
        body: data
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

    async markRead(forumId) {
      return API.request(`/forums/${forumId}/mark-read`, {
        method: 'POST'
      });
    },

    async markDiscussionRead(forumId, discussionId) {
      return API.request(`/forums/${forumId}/discussions/${discussionId}/mark-read`, {
        method: 'POST'
      });
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

  // ===== 行事曆 API =====
  calendar: {
    async getEvents(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/calendar${params ? '?' + params : ''}`);
    },

    async createEvent(data) {
      return API.request('/calendar/events', {
        method: 'POST',
        body: data
      });
    },

    async updateEvent(eventId, data) {
      return API.request(`/calendar/events/${eventId}`, {
        method: 'PUT',
        body: data
      });
    },

    async deleteEvent(eventId) {
      return API.request(`/calendar/events/${eventId}`, {
        method: 'DELETE'
      });
    },

    async getCourseEvents(courseId) {
      return API.request(`/calendar/courses/${courseId}/events`);
    },

    async createCourseEvent(courseId, data) {
      return API.request(`/calendar/courses/${courseId}/events`, {
        method: 'POST',
        body: data
      });
    },

    async deleteCourseEvent(courseId, eventId) {
      return API.request(`/calendar/courses/${courseId}/events/${eventId}`, {
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

    async deleteAllRead() {
      return API.request('/notifications/', {
        method: 'DELETE'
      });
    },

    async delete(notificationId) {
      return API.request(`/notifications/${notificationId}`, {
        method: 'DELETE'
      });
    },

    async getUnreadCount() {
      return API.request('/notifications/count');
    },

    async getPreferences() {
      return API.request('/notifications/preferences');
    },

    async updatePreferences(data) {
      return API.request('/notifications/preferences', {
        method: 'PUT',
        body: data
      });
    }
  },

  // ===== 檔案 API =====
  files: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/files${params ? '?' + params : ''}`);
    },

    async upload(file, folderOrOptions = '') {
      const options = typeof folderOrOptions === 'string'
        ? { folder: folderOrOptions }
        : (folderOrOptions || {});
      const dataUrl = await this.fileToBase64(file);
      const content = String(dataUrl).includes(',') ? String(dataUrl).split(',')[1] : String(dataUrl);

      return API.request('/files/upload', {
        method: 'POST',
        body: {
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          content,
          folder: options.folder || '',
          courseId: options.courseId || null,
          visibility: options.visibility || 'private'
        }
      });
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
    normalizeRolePayload(role = {}) {
      const id = role.id || role.roleId || role.shortName || '';
      return {
        ...role,
        id,
        roleId: id,
        shortName: role.shortName || role.roleId || role.id || role.nameEn || '',
        name: role.name || role.nameEn || id,
        description: role.description || '',
        capabilities: Array.isArray(role.capabilities) ? role.capabilities : [],
        isSystem: !!role.isSystem,
        userCount: role.userCount || 0,
        createdAt: role.createdAt || null
      };
    },

    normalizeRoleList(payload) {
      if (Array.isArray(payload)) {
        return payload.map(role => this.normalizeRolePayload(role));
      }

      if (payload && typeof payload === 'object') {
        const systemRoles = Array.isArray(payload.systemRoles) ? payload.systemRoles : [];
        const customRoles = Array.isArray(payload.customRoles) ? payload.customRoles : [];
        return [...systemRoles, ...customRoles]
          .map(role => this.normalizeRolePayload(role))
          .sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
      }

      return [];
    },

    normalizeCapabilities(payload) {
      let capabilities = [];

      if (Array.isArray(payload)) {
        capabilities = payload;
      } else if (payload && Array.isArray(payload.capabilities)) {
        capabilities = payload.capabilities;
      } else if (payload && payload.grouped && typeof payload.grouped === 'object') {
        capabilities = Object.values(payload.grouped).flat();
      }

      return capabilities
        .map(cap => {
          const id = cap.id || cap.name || cap.capability || '';
          return {
            ...cap,
            id,
            name: cap.name || cap.nameEn || id
          };
        })
        .filter(cap => !!cap.id);
    },

    async list() {
      const result = await API.request('/roles');
      if (!result?.success) return result;
      return {
        ...result,
        data: this.normalizeRoleList(result.data)
      };
    },

    async get(roleId) {
      const result = await API.request(`/roles/${roleId}`);
      if (!result?.success) return result;
      return {
        ...result,
        data: this.normalizeRolePayload(result.data || {})
      };
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
      const result = await API.request('/roles/capabilities');
      if (!result?.success) return result;
      return {
        ...result,
        data: this.normalizeCapabilities(result.data)
      };
    },

    async assignRole(userIdOrCourseId, roleIdOrUserId, contextOrRole = {}) {
      // 相容舊版：assignRole(courseId, userId, role)
      if (typeof contextOrRole === 'string') {
        return this.setCourseRole(userIdOrCourseId, roleIdOrUserId, contextOrRole);
      }

      const userId = userIdOrCourseId;
      const roleId = roleIdOrUserId;
      const context = contextOrRole || {};

      return API.request('/roles/assignments', {
        method: 'POST',
        body: { userId, roleId, ...context }
      });
    },

    async setCourseRole(courseId, userId, role) {
      return API.request(`/roles/course/${courseId}/user/${userId}`, {
        method: 'PUT',
        body: { role }
      });
    },

    async removeRole(assignmentId, userId) {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return API.request(`/roles/assignments/${encodeURIComponent(assignmentId)}${qs}`, {
        method: 'DELETE'
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
    buildQuery(params = {}) {
      return new URLSearchParams(
        Object.entries(params).filter(([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== ''
        )
      ).toString();
    },

    async list(filters = {}) {
      const params = this.buildQuery(filters);
      return API.request(`/questionbank${params ? '?' + params : ''}`);
    },

    async get(questionId, filters = {}) {
      const params = this.buildQuery(filters);
      return API.request(`/questionbank/${questionId}${params ? '?' + params : ''}`);
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

    async getCategories(filters = {}) {
      const params = this.buildQuery(filters);
      return API.request(`/questionbank/categories${params ? '?' + params : ''}`);
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
      return API.request('/questionbank/export', {
        method: 'POST',
        body: filters
      });
    },

    async addToQuiz(quizId, questionIds) {
      return API.request('/questionbank/add-to-quiz', {
        method: 'POST',
        body: { quizId, questionIds }
      });
    }
  },

  // ===== 課程完成 API =====
  courseCompletion: {
    async getSettings(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/course-completion/${courseId}/settings`);
    },

    async updateSettings(courseId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/course-completion/${courseId}/settings`, {
        method: 'PUT',
        body: data
      });
    },

    async getStatus(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/course-completion/${courseId}/status`);
    },

    async selfMark(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/course-completion/${courseId}/self-mark`, {
        method: 'POST'
      });
    },

    async manualMark(courseId, userId, completed) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/course-completion/${courseId}/manual-mark`, {
        method: 'POST',
        body: { userId, completed }
      });
    },

    async getReport(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/course-completion/${courseId}/report`);
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

    async reorder(categoryId, data) {
      return API.request(`/course-categories/${categoryId}/reorder`, {
        method: 'PUT',
        body: data
      });
    }
  },

  // ===== 成績簿增強 API =====
  gradebookEnhanced: {
    async getCategories(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      const result = await API.request(`/gradebook/courses/${courseId}/categories`);
      if (!result?.success) return result;
      return {
        ...result,
        data: Array.isArray(result.data) ? result.data : (result.data?.categories || [])
      };
    },

    async createCategory(courseId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/categories`, {
        method: 'POST',
        body: data
      });
    },

    async updateCategory(courseId, categoryId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/categories/${categoryId}`, {
        method: 'PUT',
        body: data
      });
    },

    async deleteCategory(courseId, categoryId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/categories/${categoryId}`, {
        method: 'DELETE'
      });
    },

    async getSettings(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      const result = await API.request(`/gradebook/courses/${courseId}/settings`);
      if (!result?.success) return result;
      return {
        ...result,
        data: result.data?.settings || result.data || {}
      };
    },

    async updateSettings(courseId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/settings`, {
        method: 'PUT',
        body: data
      });
    },

    async exportGrades(courseId, format = 'csv') {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      const endpoint = `${API.baseUrl}/gradebook/courses/${courseId}/export?format=${encodeURIComponent(format)}`;
      const headers = {
        'X-Language': (typeof I18n !== 'undefined' && I18n.getLocale) ? I18n.getLocale() : 'zh-TW'
      };

      if (API.accessToken) {
        headers.Authorization = `Bearer ${API.accessToken}`;
      }

      const response = await fetch(endpoint, { headers });
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        return response.json();
      }

      const text = await response.text();
      if (!response.ok) {
        return {
          success: false,
          error: 'EXPORT_FAILED',
          message: text || '匯出失敗'
        };
      }

      if (format === 'csv') {
        return {
          success: true,
          data: { csv: text }
        };
      }

      return {
        success: true,
        data: { raw: text }
      };
    },

    async batchUpdateGrades(courseId, grades) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/gradebook/courses/${courseId}/batch`, {
        method: 'PUT',
        body: { grades }
      });
    }
  },

  // ===== 評量標準 API =====
  rubrics: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/rubrics${params ? '?' + params : ''}`);
    },
    async get(rubricId) {
      return API.request(`/rubrics/${rubricId}`);
    },
    async getTemplates() {
      return API.request('/rubrics/templates');
    },
    async create(data) {
      return API.request('/rubrics', { method: 'POST', body: data });
    },
    async update(rubricId, data) {
      return API.request(`/rubrics/${rubricId}`, { method: 'PUT', body: data });
    },
    async delete(rubricId) {
      return API.request(`/rubrics/${rubricId}`, { method: 'DELETE' });
    },
    async duplicate(rubricId) {
      return API.request(`/rubrics/${rubricId}/duplicate`, { method: 'POST' });
    },
    async grade(rubricId, data) {
      return API.request(`/rubrics/${rubricId}/grade`, { method: 'POST', body: data });
    },
    async getGrading(rubricId, submissionId) {
      return API.request(`/rubrics/${rubricId}/gradings/${submissionId}`);
    },
    async attach(rubricId, data) {
      return API.request(`/rubrics/${rubricId}/attach`, { method: 'PUT', body: data });
    },
    async detach(rubricId, assignmentId) {
      return API.request(`/rubrics/${rubricId}/detach/${assignmentId}`, { method: 'DELETE' });
    }
  },

  // ===== 徽章 API =====
  badges: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/badges${params ? '?' + params : ''}`);
    },
    async get(badgeId) {
      return API.request(`/badges/${badgeId}`);
    },
    async create(data) {
      return API.request('/badges', { method: 'POST', body: data });
    },
    async update(badgeId, data) {
      return API.request(`/badges/${badgeId}`, { method: 'PUT', body: data });
    },
    async delete(badgeId) {
      return API.request(`/badges/${badgeId}`, { method: 'DELETE' });
    },
    async issue(badgeId, data) {
      return API.request(`/badges/${badgeId}/issue`, { method: 'POST', body: data });
    },
    async revoke(badgeId, userId) {
      return API.request(`/badges/${badgeId}/revoke/${userId}`, { method: 'DELETE' });
    },
    async getMyCollection() {
      return API.request('/badges/my/collection');
    },
    async getUserBadges(userId) {
      return API.request(`/badges/users/${userId}`);
    },
    async updateDisplay(data) {
      return API.request('/badges/my/display', { method: 'PUT', body: data });
    },
    async getRecipients(badgeId, filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/badges/${badgeId}/recipients${params ? '?' + params : ''}`);
    },
    async getStats() {
      return API.request('/badges/stats/overview');
    }
  },

  // ===== 證書 API =====
  certificates: {
    async getMy() {
      return API.request('/certificates/my');
    },

    async getSettings(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/certificates/courses/${courseId}/settings`);
    },

    async updateSettings(courseId, data) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/certificates/courses/${courseId}/settings`, {
        method: 'PUT',
        body: data
      });
    },

    async getRecipients(courseId) {
      if (!courseId) return { success: false, error: 'MISSING_COURSE_ID' };
      return API.request(`/certificates/courses/${courseId}/recipients`);
    }
  },

  // ===== 學習路徑 API =====
  learningPaths: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/learning-paths${params ? '?' + params : ''}`);
    },
    async get(pathId) {
      return API.request(`/learning-paths/${pathId}`);
    },
    async create(data) {
      return API.request('/learning-paths', { method: 'POST', body: data });
    },
    async update(pathId, data) {
      return API.request(`/learning-paths/${pathId}`, { method: 'PUT', body: data });
    },
    async delete(pathId) {
      return API.request(`/learning-paths/${pathId}`, { method: 'DELETE' });
    },
    async enroll(pathId) {
      return API.request(`/learning-paths/${pathId}/enroll`, { method: 'POST' });
    },
    async unenroll(pathId) {
      return API.request(`/learning-paths/${pathId}/enroll`, { method: 'DELETE' });
    },
    async getProgress(pathId) {
      return API.request(`/learning-paths/${pathId}/progress`);
    },
    async getPrerequisites(courseId) {
      return API.request(`/learning-paths/courses/${courseId}/prerequisites`);
    },
    async updatePrerequisites(courseId, data) {
      return API.request(`/learning-paths/courses/${courseId}/prerequisites`, { method: 'PUT', body: data });
    },
    async checkPrerequisites(courseId) {
      return API.request(`/learning-paths/courses/${courseId}/check-prerequisites`, { method: 'POST' });
    },
    async getReport(pathId) {
      return API.request(`/learning-paths/${pathId}/report`);
    }
  },

  // ===== 稽核日誌 API =====
  auditLogs: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/audit-logs${params ? '?' + params : ''}`);
    },
    async getStats() {
      return API.request('/audit-logs/stats');
    },
    async getUserLogs(userId) {
      return API.request(`/audit-logs/user/${userId}`);
    },
    async getEventTypes() {
      return API.request('/audit-logs/event-types');
    },
    async export(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/audit-logs/export${params ? '?' + params : ''}`);
    },
    async create(data) {
      return API.request('/audit-logs', { method: 'POST', body: data });
    },
    async cleanup(days) {
      return API.request('/audit-logs/cleanup', { method: 'DELETE', body: { days } });
    },
    async search(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/audit-logs/search${params ? '?' + params : ''}`);
    }
  },

  // ===== H5P API =====
  h5p: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/h5p${params ? '?' + params : ''}`);
    },
    async getTypes() {
      return API.request('/h5p/types');
    },
    async get(contentId) {
      return API.request(`/h5p/${contentId}`);
    },
    async create(data) {
      return API.request('/h5p', { method: 'POST', body: data });
    },
    async update(contentId, data) {
      return API.request(`/h5p/${contentId}`, { method: 'PUT', body: data });
    },
    async delete(contentId) {
      return API.request(`/h5p/${contentId}`, { method: 'DELETE' });
    },
    async view(contentId) {
      return API.request(`/h5p/${contentId}/view`, { method: 'POST' });
    },
    async attempt(contentId, data) {
      return API.request(`/h5p/${contentId}/attempt`, { method: 'POST', body: data });
    },
    async getAttempts(contentId) {
      return API.request(`/h5p/${contentId}/attempts`);
    },
    async getReport(contentId) {
      return API.request(`/h5p/${contentId}/report`);
    },
    async getEmbed(contentId) {
      return API.request(`/h5p/${contentId}/embed`);
    },
    async duplicate(contentId) {
      return API.request(`/h5p/${contentId}/duplicate`, { method: 'POST' });
    }
  },

  // ===== SCORM API =====
  scorm: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/scorm${params ? '?' + params : ''}`);
    },
    async get(packageId) {
      return API.request(`/scorm/${packageId}`);
    },
    async create(data) {
      return API.request('/scorm', { method: 'POST', body: data });
    },
    async update(packageId, data) {
      return API.request(`/scorm/${packageId}`, { method: 'PUT', body: data });
    },
    async delete(packageId) {
      return API.request(`/scorm/${packageId}`, { method: 'DELETE' });
    },
    async launch(packageId) {
      return API.request(`/scorm/${packageId}/launch`, { method: 'POST' });
    },
    async getRuntime(packageId, attemptId) {
      return API.request(`/scorm/${packageId}/runtime/${attemptId}`);
    },
    async updateRuntime(packageId, attemptId, data) {
      return API.request(`/scorm/${packageId}/runtime/${attemptId}`, { method: 'PUT', body: data });
    },
    async commit(packageId, attemptId) {
      return API.request(`/scorm/${packageId}/commit/${attemptId}`, { method: 'POST' });
    },
    async finish(packageId, attemptId) {
      return API.request(`/scorm/${packageId}/finish/${attemptId}`, { method: 'POST' });
    },
    async getAttempts(packageId) {
      return API.request(`/scorm/${packageId}/attempts`);
    },
    async getReport(packageId) {
      return API.request(`/scorm/${packageId}/report`);
    }
  },

  // ===== LTI 工具 API =====
  ltiTools: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/lti/tools${params ? '?' + params : ''}`);
    },
    async get(toolId) {
      return API.request(`/lti/tools/${toolId}`);
    },
    async create(data) {
      return API.request('/lti/tools', { method: 'POST', body: data });
    },
    async update(toolId, data) {
      return API.request(`/lti/tools/${toolId}`, { method: 'PUT', body: data });
    },
    async delete(toolId) {
      return API.request(`/lti/tools/${toolId}`, { method: 'DELETE' });
    },
    async launch(toolId) {
      return API.request(`/lti/tools/${toolId}/launch`, { method: 'POST' });
    },
    async getGrades(toolId) {
      return API.request(`/lti/tools/${toolId}/grades`);
    },
    async getConfig() {
      return API.request('/lti/config');
    }
  },

  // ===== 教師 API =====
  teachers: {
    async getAlerts() {
      return API.request('/teachers/alerts');
    },

    async dismissAlert(alertId) {
      return API.request(`/teachers/alerts/${alertId}/dismiss`, { method: 'POST' });
    },

    async getDashboard() {
      return API.request('/teachers/dashboard');
    },

    async getStudentProgress(courseId) {
      return API.request(`/teachers/courses/${courseId}/progress`);
    },

    async getAtRiskStudents(courseId) {
      return API.request(`/teachers/courses/${courseId}/at-risk`);
    }
  },

  // ===== 課程分組 API =====
  courseGroups: {
    async list(courseId) {
      return API.request(`/courses/${courseId}/groups`);
    },

    async create(courseId, data) {
      return API.request(`/courses/${courseId}/groups`, { method: 'POST', body: data });
    },

    async update(courseId, groupId, data) {
      return API.request(`/courses/${courseId}/groups/${groupId}`, { method: 'PUT', body: data });
    },

    async delete(courseId, groupId) {
      return API.request(`/courses/${courseId}/groups/${groupId}`, { method: 'DELETE' });
    },

    async getMembers(courseId, groupId) {
      return API.request(`/courses/${courseId}/groups/${groupId}/members`);
    },

    async addMember(courseId, groupId, userId) {
      return API.request(`/courses/${courseId}/groups/${groupId}/members`, {
        method: 'POST',
        body: { userIds: [userId] }
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

    async updateSettings(courseId, data) {
      return API.request(`/courses/${courseId}/group-settings`, { method: 'PUT', body: data });
    },

    async getMyGroups(courseId) {
      return API.request(`/courses/${courseId}/my-groups`);
    },

    async autoCreate(courseId, data) {
      return API.request(`/courses/${courseId}/auto-create-groups`, { method: 'POST', body: data });
    },

    async getOverview(courseId) {
      return API.request(`/courses/${courseId}/group-overview`);
    }
  },

  // ===== 課程報告 API =====
  courseReports: {
    async getParticipation(courseId) {
      return API.request(`/courses/${courseId}/participation-report`);
    },

    async getActivityReport(courseId) {
      return API.request(`/courses/${courseId}/activity-report`);
    },

    async getGradeAnalysis(courseId) {
      return API.request(`/courses/${courseId}/grade-analysis`);
    },

    async exportReport(courseId, type = 'grades') {
      return API.request(`/courses/${courseId}/export-report?type=${type}`);
    }
  }
};

// 匯出到全域
window.API = API;
