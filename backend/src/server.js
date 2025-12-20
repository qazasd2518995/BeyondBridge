/**
 * BeyondBridge API Server
 * Express 後端伺服器主程式
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

// 載入路由處理器
const authRoutes = require('./handlers/auth');
const userRoutes = require('./handlers/users');
const resourceRoutes = require('./handlers/resources');
const courseRoutes = require('./handlers/courses');
const licenseRoutes = require('./handlers/licenses');
const adminRoutes = require('./handlers/admin');
const announcementRoutes = require('./handlers/announcements');
const classRoutes = require('./handlers/classes');

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件設定 - CORS 允許所有來源（開發模式）
app.use(cors({
  origin: true,  // 允許所有來源，包括 file:// 和 null origin
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 請求日誌
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 根路徑
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'BeyondBridge API Server',
    version: '1.0.0',
    documentation: {
      auth: '/api/auth - 認證相關',
      users: '/api/users - 用戶管理',
      resources: '/api/resources - 教材資源',
      courses: '/api/courses - 課程管理',
      licenses: '/api/licenses - 授權管理',
      announcements: '/api/announcements - 公告系統',
      classes: '/api/classes - 班級管理',
      admin: '/api/admin - 管理員後台'
    }
  });
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
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

// 404 處理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: '請求的資源不存在'
  });
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

// 啟動伺服器
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     BeyondBridge API Server            ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\nServer running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\nAvailable endpoints:`);
  console.log('  POST /api/auth/login');
  console.log('  POST /api/auth/register');
  console.log('  GET  /api/users/:id');
  console.log('  GET  /api/resources');
  console.log('  GET  /api/courses');
  console.log('  GET  /api/admin/dashboard');
  console.log('  ...');
});

module.exports = app;
