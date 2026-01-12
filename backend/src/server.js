/**
 * BeyondBridge API Server
 * Express 後端伺服器主程式
 * Moodle-style Learning Management System + 即時通訊
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

// 載入路由處理器
const authRoutes = require('./handlers/auth');
const userRoutes = require('./handlers/users');
const resourceRoutes = require('./handlers/resources');
const courseRoutes = require('./handlers/courses');
const licenseRoutes = require('./handlers/licenses');
const adminRoutes = require('./handlers/admin');
const announcementRoutes = require('./handlers/announcements');
const classRoutes = require('./handlers/classes');

// Moodle 風格功能路由
const assignmentRoutes = require('./handlers/assignments');
const quizRoutes = require('./handlers/quizzes');
const forumRoutes = require('./handlers/forums');
const gradebookRoutes = require('./handlers/gradebook');
const notificationRoutes = require('./handlers/notifications');
const calendarRoutes = require('./handlers/calendar');
const fileRoutes = require('./handlers/files');
const roleRoutes = require('./handlers/roles');

// 新增功能路由 (from origin/main)
const consultationRoutes = require('./handlers/consultations');
const discussionRoutes = require('./handlers/discussions');
const chatRoutes = require('./handlers/chat');

// Moodle P0 功能路由
const questionBankRoutes = require('./handlers/questionbank');
const courseCategoriesRoutes = require('./handlers/course-categories');
const courseCompletionRoutes = require('./handlers/course-completion');

// Moodle P1 功能路由
const learningPathsRoutes = require('./handlers/learning-paths');
const badgesRoutes = require('./handlers/badges');
const rubricsRoutes = require('./handlers/rubrics');

// P2 功能路由
const auditLogsRoutes = require('./handlers/audit-logs');
const scormRoutes = require('./handlers/scorm');
const ltiRoutes = require('./handlers/lti');
const h5pRoutes = require('./handlers/h5p');

// 教師功能路由
const teacherAlertsRoutes = require('./handlers/teacher-alerts');

// 載入 WebSocket 伺服器
const { initSocketServer } = require('./realtime/socketServer');

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件設定 - CORS 允許所有來源（開發模式）
app.use(cors({
  origin: true,  // 允許所有來源，包括 file:// 和 null origin
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 請求日誌（只記錄 API 請求）
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/classes', classRoutes);

// Moodle 風格功能路由
app.use('/api/assignments', assignmentRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/forums', forumRoutes);
app.use('/api/gradebook', gradebookRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/roles', roleRoutes);

// 新增功能路由
app.use('/api/consultations', consultationRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/chat', chatRoutes);

// Moodle P0 功能路由
app.use('/api/questionbank', questionBankRoutes);
app.use('/api/course-categories', courseCategoriesRoutes);
app.use('/api/course-completion', courseCompletionRoutes);

// Moodle P1 功能路由
app.use('/api/learning-paths', learningPathsRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/rubrics', rubricsRoutes);

// P2 功能路由
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/scorm', scormRoutes);
app.use('/api/lti', ltiRoutes);
app.use('/api/h5p', h5pRoutes);

// 教師功能路由
app.use('/api/teachers', teacherAlertsRoutes);

// 靜態檔案服務
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// 平台路由 - SPA 支援
app.get('/platform', (req, res) => {
  res.sendFile(path.join(publicPath, 'platform', 'index.html'));
});

app.get('/platform/*', (req, res) => {
  res.sendFile(path.join(publicPath, 'platform', 'index.html'));
});

// 管理後台路由
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicPath, 'platform', 'admin', 'index.html'));
});

app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(publicPath, 'platform', 'admin', 'index.html'));
});

// 官網首頁
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// 404 處理 - API 請求回傳 JSON，其他回傳官網
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: '請求的 API 資源不存在'
    });
  } else {
    // 非 API 請求，回傳官網首頁
    res.sendFile(path.join(publicPath, 'index.html'));
  }
});

// 錯誤處理
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : '伺服器內部錯誤'
  });
});

// 建立 HTTP 伺服器並整合 Socket.io
const httpServer = http.createServer(app);
const io = initSocketServer(httpServer);

// 將 io 實例掛載到 app 上，方便其他模組使用
app.set('io', io);

// 啟動伺服器
httpServer.listen(PORT, () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     BeyondBridge Full Stack Server     ║');
  console.log('║     Moodle-style LMS + Real-time       ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\nServer running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\nRoutes:`);
  console.log('  /              → 官方網站');
  console.log('  /platform      → 教育平台');
  console.log('  /admin         → 管理後台');
  console.log('  /api/*         → API 端點');
  console.log('  /health        → 健康檢查');
  console.log('  ws://          → WebSocket 即時通訊');
  console.log(`\nAPI Endpoints:`);
  console.log('  /api/auth          → 認證');
  console.log('  /api/users         → 用戶');
  console.log('  /api/resources     → 教材資源');
  console.log('  /api/courses       → 課程');
  console.log('  /api/assignments   → 作業');
  console.log('  /api/quizzes       → 測驗');
  console.log('  /api/forums        → 論壇');
  console.log('  /api/gradebook     → 成績簿');
  console.log('  /api/notifications → 通知');
  console.log('  /api/calendar      → 行事曆');
  console.log('  /api/files         → 檔案');
  console.log('  /api/roles         → 角色權限');
  console.log('  /api/consultations → 諮詢服務');
  console.log('  /api/discussions   → 討論區');
  console.log('  /api/chat          → 即時客服');
  console.log('  /api/licenses      → 授權');
  console.log('  /api/classes       → 班級');
  console.log('  /api/announcements → 公告');
  console.log('  /api/admin         → 管理員');
  console.log('  /api/questionbank  → 題庫管理');
  console.log('  /api/course-categories → 課程類別');
  console.log('  /api/course-completion → 課程完成追蹤');
  console.log('  /api/learning-paths → 學習路徑');
  console.log('  /api/badges        → 徽章系統');
  console.log('  /api/rubrics       → 評分標準');
  console.log('  /api/audit-logs    → 審計日誌');
  console.log('  /api/scorm         → SCORM 學習包');
  console.log('  /api/lti           → LTI 外部工具');
  console.log('  /api/h5p           → H5P 互動內容');
});

module.exports = { app, httpServer, io };
