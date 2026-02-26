/**
 * 課程 API 處理器 - 主路由
 * BeyondBridge Education Platform - Moodle-style LMS
 *
 * 此模組整合所有課程相關的子路由。
 * 掛載順序很重要：具體路徑（如 /categories）必須在參數路徑（如 /:id）之前。
 */

const express = require('express');
const router = express.Router();

// 導入子路由
const categoryRoutes = require('./categories');
const listRoutes = require('./list');
const managementRoutes = require('./management');
const sectionRoutes = require('./sections');
const enrollmentRoutes = require('./enrollment');
const progressRoutes = require('./progress');
const completionRoutes = require('./completion');
const reportRoutes = require('./reports');
const groupRoutes = require('./groups');

// 掛載子路由
// 注意：categories 必須在 list 之前，因為 list 中有 /:id 會攔截 /categories
router.use('/', categoryRoutes);
router.use('/', listRoutes);
router.use('/', managementRoutes);
router.use('/', sectionRoutes);
router.use('/', enrollmentRoutes);
router.use('/', progressRoutes);
router.use('/', completionRoutes);
router.use('/', reportRoutes);
router.use('/', groupRoutes);

module.exports = router;
