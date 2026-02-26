/**
 * 作業系統 API 處理器（模組化入口）
 * BeyondBridge Education Platform - Moodle-style Assignment System
 *
 * 此檔案已拆分為以下模組:
 * - assignments/crud.js        - 作業列表、詳情、CRUD 操作
 * - assignments/submissions.js - 學生提交相關操作
 * - assignments/grading.js     - 批改、成績匯出、統計相關操作
 */

module.exports = require('./assignments/index');
