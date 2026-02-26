/**
 * 測驗系統 API 處理器
 * BeyondBridge Education Platform - Moodle-style Quiz System
 *
 * This module combines all quiz sub-routers into a single router.
 * Route ordering matters: specific paths (e.g. /questionbank) must be
 * registered before parameterized paths (e.g. /:id) to avoid conflicts.
 */

const express = require('express');
const router = express.Router();
const questionBankRoutes = require('./question-bank');
const reportRoutes = require('./reports');
const attemptRoutes = require('./attempts');
const crudRoutes = require('./crud');

// Question bank routes must come first because paths like
// /questionbank would otherwise match /:id in crud routes.
router.use('/', questionBankRoutes);
router.use('/', reportRoutes);
router.use('/', attemptRoutes);
router.use('/', crudRoutes);

module.exports = router;
