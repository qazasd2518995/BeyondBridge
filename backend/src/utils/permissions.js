/**
 * Capability-based Permission System
 * BeyondBridge Education Platform
 *
 * Similar to Moodle's RBAC system with fine-grained capabilities
 * Supports context-based permissions (system > category > course > module)
 */

const db = require('./db');

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

/**
 * All available capabilities in the system
 * Organized by category for easy management
 */
const CAPABILITIES = {
  // ---- System Administration ----
  'system:manage_users': {
    name: '管理用戶',
    nameEn: 'Manage Users',
    description: '建立、編輯、刪除用戶帳號',
    category: 'system',
    riskLevel: 'high'
  },
  'system:manage_roles': {
    name: '管理角色',
    nameEn: 'Manage Roles',
    description: '建立和修改角色權限',
    category: 'system',
    riskLevel: 'high'
  },
  'system:manage_categories': {
    name: '管理課程類別',
    nameEn: 'Manage Course Categories',
    description: '建立和管理課程類別結構',
    category: 'system',
    riskLevel: 'medium'
  },
  'system:view_reports': {
    name: '查看系統報告',
    nameEn: 'View System Reports',
    description: '查看全站統計和報告',
    category: 'system',
    riskLevel: 'low'
  },
  'system:manage_settings': {
    name: '管理系統設定',
    nameEn: 'Manage System Settings',
    description: '修改系統配置和設定',
    category: 'system',
    riskLevel: 'high'
  },
  'system:manage_badges': {
    name: '管理徽章',
    nameEn: 'Manage Badges',
    description: '建立和管理系統徽章',
    category: 'system',
    riskLevel: 'medium'
  },

  // ---- Course Management ----
  'course:create': {
    name: '建立課程',
    nameEn: 'Create Course',
    description: '建立新課程',
    category: 'course',
    riskLevel: 'medium'
  },
  'course:view': {
    name: '查看課程',
    nameEn: 'View Course',
    description: '查看課程內容',
    category: 'course',
    riskLevel: 'low'
  },
  'course:view_hidden': {
    name: '查看隱藏課程',
    nameEn: 'View Hidden Course',
    description: '查看未發布的課程',
    category: 'course',
    riskLevel: 'low'
  },
  'course:edit': {
    name: '編輯課程',
    nameEn: 'Edit Course',
    description: '修改課程設定和結構',
    category: 'course',
    riskLevel: 'medium'
  },
  'course:delete': {
    name: '刪除課程',
    nameEn: 'Delete Course',
    description: '刪除課程',
    category: 'course',
    riskLevel: 'high'
  },
  'course:backup': {
    name: '備份課程',
    nameEn: 'Backup Course',
    description: '建立課程備份',
    category: 'course',
    riskLevel: 'medium'
  },
  'course:restore': {
    name: '還原課程',
    nameEn: 'Restore Course',
    description: '從備份還原課程',
    category: 'course',
    riskLevel: 'high'
  },
  'course:reset': {
    name: '重設課程',
    nameEn: 'Reset Course',
    description: '清除課程學生資料',
    category: 'course',
    riskLevel: 'high'
  },
  'course:manage_modules': {
    name: '管理課程模組',
    nameEn: 'Manage Course Modules',
    description: '新增、編輯、刪除課程模組',
    category: 'course',
    riskLevel: 'medium'
  },
  'course:manage_groups': {
    name: '管理課程群組',
    nameEn: 'Manage Course Groups',
    description: '建立和管理課程內群組',
    category: 'course',
    riskLevel: 'low'
  },

  // ---- Enrollment ----
  'enrol:view_enrolled': {
    name: '查看報名學生',
    nameEn: 'View Enrolled Students',
    description: '查看課程學生名單',
    category: 'enrollment',
    riskLevel: 'low'
  },
  'enrol:enrol_students': {
    name: '報名學生',
    nameEn: 'Enrol Students',
    description: '將學生加入課程',
    category: 'enrollment',
    riskLevel: 'medium'
  },
  'enrol:unenrol_students': {
    name: '退選學生',
    nameEn: 'Unenrol Students',
    description: '將學生從課程移除',
    category: 'enrollment',
    riskLevel: 'medium'
  },
  'enrol:self_enrol': {
    name: '自行報名',
    nameEn: 'Self Enrol',
    description: '自行報名課程',
    category: 'enrollment',
    riskLevel: 'low'
  },

  // ---- Assignment ----
  'assignment:view': {
    name: '查看作業',
    nameEn: 'View Assignment',
    description: '查看作業內容',
    category: 'assignment',
    riskLevel: 'low'
  },
  'assignment:create': {
    name: '建立作業',
    nameEn: 'Create Assignment',
    description: '建立新作業',
    category: 'assignment',
    riskLevel: 'medium'
  },
  'assignment:edit': {
    name: '編輯作業',
    nameEn: 'Edit Assignment',
    description: '修改作業設定',
    category: 'assignment',
    riskLevel: 'medium'
  },
  'assignment:delete': {
    name: '刪除作業',
    nameEn: 'Delete Assignment',
    description: '刪除作業',
    category: 'assignment',
    riskLevel: 'high'
  },
  'assignment:submit': {
    name: '提交作業',
    nameEn: 'Submit Assignment',
    description: '提交作業',
    category: 'assignment',
    riskLevel: 'low'
  },
  'assignment:view_submissions': {
    name: '查看作業提交',
    nameEn: 'View Submissions',
    description: '查看所有學生的作業提交',
    category: 'assignment',
    riskLevel: 'low'
  },
  'assignment:grade': {
    name: '評分作業',
    nameEn: 'Grade Assignment',
    description: '為作業評分',
    category: 'assignment',
    riskLevel: 'medium'
  },
  'assignment:manage_extensions': {
    name: '管理作業延期',
    nameEn: 'Manage Extensions',
    description: '給予學生作業延期',
    category: 'assignment',
    riskLevel: 'low'
  },
  'assignment:download_all': {
    name: '批量下載提交',
    nameEn: 'Download All Submissions',
    description: '批量下載所有作業提交',
    category: 'assignment',
    riskLevel: 'low'
  },

  // ---- Quiz ----
  'quiz:view': {
    name: '查看測驗',
    nameEn: 'View Quiz',
    description: '查看測驗內容',
    category: 'quiz',
    riskLevel: 'low'
  },
  'quiz:create': {
    name: '建立測驗',
    nameEn: 'Create Quiz',
    description: '建立新測驗',
    category: 'quiz',
    riskLevel: 'medium'
  },
  'quiz:edit': {
    name: '編輯測驗',
    nameEn: 'Edit Quiz',
    description: '修改測驗設定和題目',
    category: 'quiz',
    riskLevel: 'medium'
  },
  'quiz:delete': {
    name: '刪除測驗',
    nameEn: 'Delete Quiz',
    description: '刪除測驗',
    category: 'quiz',
    riskLevel: 'high'
  },
  'quiz:attempt': {
    name: '作答測驗',
    nameEn: 'Attempt Quiz',
    description: '參加測驗',
    category: 'quiz',
    riskLevel: 'low'
  },
  'quiz:view_reports': {
    name: '查看測驗報告',
    nameEn: 'View Quiz Reports',
    description: '查看測驗統計和分析',
    category: 'quiz',
    riskLevel: 'low'
  },
  'quiz:preview': {
    name: '預覽測驗',
    nameEn: 'Preview Quiz',
    description: '預覽測驗而不計分',
    category: 'quiz',
    riskLevel: 'low'
  },
  'quiz:manage_questions': {
    name: '管理題庫',
    nameEn: 'Manage Question Bank',
    description: '管理課程題庫',
    category: 'quiz',
    riskLevel: 'medium'
  },
  'quiz:regrade': {
    name: '重新評分',
    nameEn: 'Regrade Quiz',
    description: '重新計算測驗分數',
    category: 'quiz',
    riskLevel: 'medium'
  },

  // ---- Forum / Discussion ----
  'forum:view': {
    name: '查看討論區',
    nameEn: 'View Forum',
    description: '查看討論區內容',
    category: 'forum',
    riskLevel: 'low'
  },
  'forum:create': {
    name: '建立討論區',
    nameEn: 'Create Forum',
    description: '建立新討論區',
    category: 'forum',
    riskLevel: 'medium'
  },
  'forum:post': {
    name: '發表貼文',
    nameEn: 'Post in Forum',
    description: '發表新主題或回覆',
    category: 'forum',
    riskLevel: 'low'
  },
  'forum:reply': {
    name: '回覆貼文',
    nameEn: 'Reply in Forum',
    description: '回覆討論主題',
    category: 'forum',
    riskLevel: 'low'
  },
  'forum:edit_own': {
    name: '編輯自己的貼文',
    nameEn: 'Edit Own Posts',
    description: '編輯自己發表的貼文',
    category: 'forum',
    riskLevel: 'low'
  },
  'forum:edit_any': {
    name: '編輯任何貼文',
    nameEn: 'Edit Any Post',
    description: '編輯任何人的貼文',
    category: 'forum',
    riskLevel: 'medium'
  },
  'forum:delete_own': {
    name: '刪除自己的貼文',
    nameEn: 'Delete Own Posts',
    description: '刪除自己發表的貼文',
    category: 'forum',
    riskLevel: 'low'
  },
  'forum:delete_any': {
    name: '刪除任何貼文',
    nameEn: 'Delete Any Post',
    description: '刪除任何人的貼文',
    category: 'forum',
    riskLevel: 'medium'
  },
  'forum:pin': {
    name: '置頂貼文',
    nameEn: 'Pin Posts',
    description: '置頂討論主題',
    category: 'forum',
    riskLevel: 'low'
  },
  'forum:lock': {
    name: '鎖定貼文',
    nameEn: 'Lock Posts',
    description: '鎖定討論主題禁止回覆',
    category: 'forum',
    riskLevel: 'low'
  },
  'forum:rate': {
    name: '評分貼文',
    nameEn: 'Rate Posts',
    description: '為貼文評分',
    category: 'forum',
    riskLevel: 'low'
  },

  // ---- Gradebook ----
  'grade:view_own': {
    name: '查看自己的成績',
    nameEn: 'View Own Grades',
    description: '查看自己的成績',
    category: 'gradebook',
    riskLevel: 'low'
  },
  'grade:view_all': {
    name: '查看所有成績',
    nameEn: 'View All Grades',
    description: '查看所有學生成績',
    category: 'gradebook',
    riskLevel: 'low'
  },
  'grade:edit': {
    name: '編輯成績',
    nameEn: 'Edit Grades',
    description: '修改學生成績',
    category: 'gradebook',
    riskLevel: 'medium'
  },
  'grade:manage_categories': {
    name: '管理成績類別',
    nameEn: 'Manage Grade Categories',
    description: '建立和管理成績分類',
    category: 'gradebook',
    riskLevel: 'medium'
  },
  'grade:export': {
    name: '匯出成績',
    nameEn: 'Export Grades',
    description: '匯出成績到 CSV/Excel',
    category: 'gradebook',
    riskLevel: 'low'
  },
  'grade:import': {
    name: '匯入成績',
    nameEn: 'Import Grades',
    description: '從檔案匯入成績',
    category: 'gradebook',
    riskLevel: 'medium'
  },
  'grade:manage_scales': {
    name: '管理評分等第',
    nameEn: 'Manage Grade Scales',
    description: '管理成績等第對應',
    category: 'gradebook',
    riskLevel: 'low'
  },

  // ---- Class Management ----
  'class:create': {
    name: '建立班級',
    nameEn: 'Create Class',
    description: '建立新班級',
    category: 'class',
    riskLevel: 'medium'
  },
  'class:view': {
    name: '查看班級',
    nameEn: 'View Class',
    description: '查看班級資訊',
    category: 'class',
    riskLevel: 'low'
  },
  'class:edit': {
    name: '編輯班級',
    nameEn: 'Edit Class',
    description: '修改班級設定',
    category: 'class',
    riskLevel: 'medium'
  },
  'class:delete': {
    name: '刪除班級',
    nameEn: 'Delete Class',
    description: '刪除班級',
    category: 'class',
    riskLevel: 'high'
  },
  'class:manage_members': {
    name: '管理班級成員',
    nameEn: 'Manage Class Members',
    description: '新增或移除班級成員',
    category: 'class',
    riskLevel: 'medium'
  },

  // ---- Resources / Materials ----
  'resource:view': {
    name: '查看教材',
    nameEn: 'View Resources',
    description: '查看課程教材',
    category: 'resource',
    riskLevel: 'low'
  },
  'resource:create': {
    name: '上傳教材',
    nameEn: 'Create Resources',
    description: '上傳新教材',
    category: 'resource',
    riskLevel: 'medium'
  },
  'resource:edit': {
    name: '編輯教材',
    nameEn: 'Edit Resources',
    description: '修改教材設定',
    category: 'resource',
    riskLevel: 'medium'
  },
  'resource:delete': {
    name: '刪除教材',
    nameEn: 'Delete Resources',
    description: '刪除教材',
    category: 'resource',
    riskLevel: 'medium'
  },

  // ---- Calendar ----
  'calendar:view': {
    name: '查看行事曆',
    nameEn: 'View Calendar',
    description: '查看行事曆事件',
    category: 'calendar',
    riskLevel: 'low'
  },
  'calendar:create_personal': {
    name: '建立個人事件',
    nameEn: 'Create Personal Events',
    description: '建立個人行事曆事件',
    category: 'calendar',
    riskLevel: 'low'
  },
  'calendar:create_course': {
    name: '建立課程事件',
    nameEn: 'Create Course Events',
    description: '建立課程行事曆事件',
    category: 'calendar',
    riskLevel: 'low'
  },
  'calendar:create_site': {
    name: '建立站點事件',
    nameEn: 'Create Site Events',
    description: '建立全站行事曆事件',
    category: 'calendar',
    riskLevel: 'medium'
  },

  // ---- Notifications ----
  'notification:view': {
    name: '查看通知',
    nameEn: 'View Notifications',
    description: '查看系統通知',
    category: 'notification',
    riskLevel: 'low'
  },
  'notification:send_course': {
    name: '發送課程通知',
    nameEn: 'Send Course Notifications',
    description: '發送通知給課程學生',
    category: 'notification',
    riskLevel: 'low'
  },
  'notification:send_site': {
    name: '發送站點通知',
    nameEn: 'Send Site Notifications',
    description: '發送全站公告',
    category: 'notification',
    riskLevel: 'medium'
  },

  // ---- Badges ----
  'badge:view': {
    name: '查看徽章',
    nameEn: 'View Badges',
    description: '查看徽章',
    category: 'badge',
    riskLevel: 'low'
  },
  'badge:earn': {
    name: '獲得徽章',
    nameEn: 'Earn Badges',
    description: '獲得徽章',
    category: 'badge',
    riskLevel: 'low'
  },
  'badge:create': {
    name: '建立徽章',
    nameEn: 'Create Badges',
    description: '建立課程徽章',
    category: 'badge',
    riskLevel: 'medium'
  },
  'badge:award': {
    name: '頒發徽章',
    nameEn: 'Award Badges',
    description: '手動頒發徽章給學生',
    category: 'badge',
    riskLevel: 'medium'
  },

  // ---- Reports ----
  'report:view_course': {
    name: '查看課程報告',
    nameEn: 'View Course Reports',
    description: '查看課程參與和進度報告',
    category: 'report',
    riskLevel: 'low'
  },
  'report:view_user': {
    name: '查看用戶報告',
    nameEn: 'View User Reports',
    description: '查看個別用戶活動報告',
    category: 'report',
    riskLevel: 'low'
  },
  'report:view_logs': {
    name: '查看系統日誌',
    nameEn: 'View System Logs',
    description: '查看系統活動日誌',
    category: 'report',
    riskLevel: 'medium'
  },

  // ---- Messaging ----
  'message:send': {
    name: '發送訊息',
    nameEn: 'Send Messages',
    description: '發送私人訊息',
    category: 'message',
    riskLevel: 'low'
  },
  'message:view_all': {
    name: '查看所有訊息',
    nameEn: 'View All Messages',
    description: '查看系統所有訊息（管理用）',
    category: 'message',
    riskLevel: 'high'
  }
};

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

/**
 * Default role definitions with their capabilities
 * These are system-defined roles that cannot be deleted
 */
const DEFAULT_ROLES = {
  // Site Administrator - Full access
  admin: {
    name: '系統管理員',
    nameEn: 'Site Administrator',
    description: '完整的系統控制權限',
    isSystem: true,
    sortOrder: 1,
    capabilities: Object.keys(CAPABILITIES) // All capabilities
  },

  // Manager - Can manage courses and users but not system settings
  manager: {
    name: '管理者',
    nameEn: 'Manager',
    description: '管理課程和用戶，但不能修改系統設定',
    isSystem: true,
    sortOrder: 2,
    capabilities: [
      'system:manage_users', 'system:manage_categories', 'system:view_reports', 'system:manage_badges',
      'course:create', 'course:view', 'course:view_hidden', 'course:edit', 'course:delete',
      'course:backup', 'course:restore', 'course:reset', 'course:manage_modules', 'course:manage_groups',
      'enrol:view_enrolled', 'enrol:enrol_students', 'enrol:unenrol_students',
      'assignment:view', 'assignment:create', 'assignment:edit', 'assignment:delete',
      'assignment:view_submissions', 'assignment:grade', 'assignment:manage_extensions', 'assignment:download_all',
      'quiz:view', 'quiz:create', 'quiz:edit', 'quiz:delete', 'quiz:view_reports', 'quiz:preview',
      'quiz:manage_questions', 'quiz:regrade',
      'forum:view', 'forum:create', 'forum:post', 'forum:reply', 'forum:edit_own', 'forum:edit_any',
      'forum:delete_own', 'forum:delete_any', 'forum:pin', 'forum:lock', 'forum:rate',
      'grade:view_own', 'grade:view_all', 'grade:edit', 'grade:manage_categories',
      'grade:export', 'grade:import', 'grade:manage_scales',
      'class:create', 'class:view', 'class:edit', 'class:delete', 'class:manage_members',
      'resource:view', 'resource:create', 'resource:edit', 'resource:delete',
      'calendar:view', 'calendar:create_personal', 'calendar:create_course', 'calendar:create_site',
      'notification:view', 'notification:send_course', 'notification:send_site',
      'badge:view', 'badge:earn', 'badge:create', 'badge:award',
      'report:view_course', 'report:view_user', 'report:view_logs',
      'message:send'
    ]
  },

  // Course Creator - Can create courses
  coursecreator: {
    name: '課程建立者',
    nameEn: 'Course Creator',
    description: '可以建立課程',
    isSystem: true,
    sortOrder: 3,
    capabilities: [
      'course:create', 'course:view', 'course:view_hidden', 'course:edit',
      'course:backup', 'course:manage_modules', 'course:manage_groups',
      'enrol:view_enrolled', 'enrol:enrol_students', 'enrol:unenrol_students',
      'assignment:view', 'assignment:create', 'assignment:edit', 'assignment:delete',
      'assignment:view_submissions', 'assignment:grade', 'assignment:manage_extensions', 'assignment:download_all',
      'quiz:view', 'quiz:create', 'quiz:edit', 'quiz:delete', 'quiz:view_reports', 'quiz:preview',
      'quiz:manage_questions', 'quiz:regrade',
      'forum:view', 'forum:create', 'forum:post', 'forum:reply', 'forum:edit_own', 'forum:edit_any',
      'forum:delete_own', 'forum:delete_any', 'forum:pin', 'forum:lock', 'forum:rate',
      'grade:view_own', 'grade:view_all', 'grade:edit', 'grade:manage_categories',
      'grade:export', 'grade:import', 'grade:manage_scales',
      'class:create', 'class:view', 'class:edit', 'class:manage_members',
      'resource:view', 'resource:create', 'resource:edit', 'resource:delete',
      'calendar:view', 'calendar:create_personal', 'calendar:create_course',
      'notification:view', 'notification:send_course',
      'badge:view', 'badge:earn', 'badge:create', 'badge:award',
      'report:view_course', 'report:view_user',
      'message:send'
    ]
  },

  // Teacher (Editing Teacher) - Full course control
  teacher: {
    name: '教師',
    nameEn: 'Teacher',
    description: '在課程內有完整的控制權限（建橋者）',
    isSystem: true,
    sortOrder: 4,
    capabilities: [
      'course:view', 'course:view_hidden', 'course:edit',
      'course:backup', 'course:manage_modules', 'course:manage_groups',
      'enrol:view_enrolled', 'enrol:enrol_students', 'enrol:unenrol_students',
      'assignment:view', 'assignment:create', 'assignment:edit', 'assignment:delete',
      'assignment:view_submissions', 'assignment:grade', 'assignment:manage_extensions', 'assignment:download_all',
      'quiz:view', 'quiz:create', 'quiz:edit', 'quiz:delete', 'quiz:view_reports', 'quiz:preview',
      'quiz:manage_questions', 'quiz:regrade',
      'forum:view', 'forum:create', 'forum:post', 'forum:reply', 'forum:edit_own', 'forum:edit_any',
      'forum:delete_own', 'forum:delete_any', 'forum:pin', 'forum:lock', 'forum:rate',
      'grade:view_own', 'grade:view_all', 'grade:edit', 'grade:manage_categories',
      'grade:export', 'grade:import', 'grade:manage_scales',
      'class:view', 'class:edit', 'class:manage_members',
      'resource:view', 'resource:create', 'resource:edit', 'resource:delete',
      'calendar:view', 'calendar:create_personal', 'calendar:create_course',
      'notification:view', 'notification:send_course',
      'badge:view', 'badge:earn', 'badge:create', 'badge:award',
      'report:view_course', 'report:view_user',
      'message:send'
    ]
  },

  // Non-editing Teacher (Assistant) - Can grade but not edit course
  assistant: {
    name: '助教',
    nameEn: 'Non-editing Teacher',
    description: '可以評分但不能編輯課程內容',
    isSystem: true,
    sortOrder: 5,
    capabilities: [
      'course:view', 'course:view_hidden',
      'enrol:view_enrolled',
      'assignment:view', 'assignment:view_submissions', 'assignment:grade',
      'assignment:manage_extensions', 'assignment:download_all',
      'quiz:view', 'quiz:view_reports', 'quiz:preview',
      'forum:view', 'forum:post', 'forum:reply', 'forum:edit_own',
      'forum:delete_own', 'forum:pin', 'forum:lock', 'forum:rate',
      'grade:view_own', 'grade:view_all', 'grade:edit', 'grade:export',
      'class:view',
      'resource:view',
      'calendar:view', 'calendar:create_personal',
      'notification:view', 'notification:send_course',
      'badge:view', 'badge:earn', 'badge:award',
      'report:view_course', 'report:view_user',
      'message:send'
    ]
  },

  // Educator - Maps to existing BeyondBridge role
  educator: {
    name: '教育者',
    nameEn: 'Educator',
    description: '教育者/建橋者',
    isSystem: true,
    sortOrder: 6,
    capabilities: [
      'course:create', 'course:view', 'course:view_hidden', 'course:edit',
      'course:backup', 'course:manage_modules', 'course:manage_groups',
      'enrol:view_enrolled', 'enrol:enrol_students', 'enrol:unenrol_students',
      'assignment:view', 'assignment:create', 'assignment:edit', 'assignment:delete',
      'assignment:view_submissions', 'assignment:grade', 'assignment:manage_extensions', 'assignment:download_all',
      'quiz:view', 'quiz:create', 'quiz:edit', 'quiz:delete', 'quiz:view_reports', 'quiz:preview',
      'quiz:manage_questions', 'quiz:regrade',
      'forum:view', 'forum:create', 'forum:post', 'forum:reply', 'forum:edit_own', 'forum:edit_any',
      'forum:delete_own', 'forum:delete_any', 'forum:pin', 'forum:lock', 'forum:rate',
      'grade:view_own', 'grade:view_all', 'grade:edit', 'grade:manage_categories',
      'grade:export', 'grade:import', 'grade:manage_scales',
      'class:create', 'class:view', 'class:edit', 'class:manage_members',
      'resource:view', 'resource:create', 'resource:edit', 'resource:delete',
      'calendar:view', 'calendar:create_personal', 'calendar:create_course',
      'notification:view', 'notification:send_course',
      'badge:view', 'badge:earn', 'badge:create', 'badge:award',
      'report:view_course', 'report:view_user',
      'message:send'
    ]
  },

  // Student
  student: {
    name: '學生',
    nameEn: 'Student',
    description: '參與學習活動（探橋者）',
    isSystem: true,
    sortOrder: 7,
    capabilities: [
      'course:view',
      'enrol:self_enrol',
      'assignment:view', 'assignment:submit',
      'quiz:view', 'quiz:attempt',
      'forum:view', 'forum:post', 'forum:reply', 'forum:edit_own', 'forum:delete_own', 'forum:rate',
      'grade:view_own',
      'class:view',
      'resource:view',
      'calendar:view', 'calendar:create_personal',
      'notification:view',
      'badge:view', 'badge:earn',
      'message:send'
    ]
  },

  // Guest - Limited viewing
  guest: {
    name: '訪客',
    nameEn: 'Guest',
    description: '有限的瀏覽權限',
    isSystem: true,
    sortOrder: 8,
    capabilities: [
      'course:view',
      'forum:view',
      'resource:view',
      'calendar:view',
      'badge:view'
    ]
  }
};

// ============================================================================
// PERMISSION CHECKING FUNCTIONS
// ============================================================================

/**
 * Check if a user has a specific capability
 * @param {Object} user - User object with role
 * @param {string} capability - Capability to check
 * @param {Object} context - Context for checking (courseId, etc.)
 * @returns {boolean}
 */
async function hasCapability(user, capability, context = {}) {
  if (!user) return false;

  // Admins have all capabilities
  if (user.isAdmin) return true;

  // Get user's system role
  const systemRole = user.role || 'student';
  const roleConfig = DEFAULT_ROLES[systemRole];

  if (!roleConfig) {
    console.warn(`Unknown role: ${systemRole}`);
    return false;
  }

  // Check system-level capability
  if (roleConfig.capabilities.includes(capability)) {
    return true;
  }

  // If context includes a course, check course-level role override
  if (context.courseId) {
    const courseRole = await getCourseRole(user.userId, context.courseId);
    if (courseRole) {
      const courseRoleConfig = DEFAULT_ROLES[courseRole];
      if (courseRoleConfig && courseRoleConfig.capabilities.includes(capability)) {
        return true;
      }
    }
  }

  // Check for custom role assignments
  const customRoles = await getCustomRoles(user.userId, context);
  for (const customRole of customRoles) {
    if (customRole.capabilities && customRole.capabilities.includes(capability)) {
      return true;
    }
  }

  return false;
}

/**
 * Check multiple capabilities at once
 * @param {Object} user
 * @param {Array} capabilities
 * @param {Object} context
 * @param {string} mode - 'all' or 'any'
 * @returns {boolean}
 */
async function hasCapabilities(user, capabilities, context = {}, mode = 'all') {
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return true;
  }

  const results = await Promise.all(
    capabilities.map(cap => hasCapability(user, cap, context))
  );

  if (mode === 'all') {
    return results.every(r => r);
  } else {
    return results.some(r => r);
  }
}

/**
 * Get user's role in a specific course
 * @param {string} userId
 * @param {string} courseId
 * @returns {string|null}
 */
async function getCourseRole(userId, courseId) {
  try {
    // Check course enrollment with role
    const enrollment = await db.getItem(`COURSE#${courseId}`, `ENROLLMENT#${userId}`);
    if (enrollment && enrollment.courseRole) {
      return enrollment.courseRole;
    }

    // Check if user is the course instructor
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (course && course.instructorId === userId) {
      return 'teacher';
    }

    // Check if enrolled (default to student)
    if (enrollment) {
      return 'student';
    }

    return null;
  } catch (error) {
    console.error('Error getting course role:', error);
    return null;
  }
}

/**
 * Get custom role assignments for a user
 * @param {string} userId
 * @param {Object} context
 * @returns {Array}
 */
async function getCustomRoles(userId, context = {}) {
  try {
    // Query custom role assignments
    const assignments = await db.query({
      pk: `USER#${userId}`,
      sk: { begins_with: 'ROLE_ASSIGNMENT#' }
    });

    const customRoles = [];
    for (const assignment of assignments) {
      // Check if assignment applies to context
      if (context.courseId && assignment.courseId && assignment.courseId !== context.courseId) {
        continue;
      }
      if (context.categoryId && assignment.categoryId && assignment.categoryId !== context.categoryId) {
        continue;
      }

      // Get role definition
      const roleData = await db.getItem('ROLES', `ROLE#${assignment.roleId}`);
      if (roleData) {
        customRoles.push(roleData);
      }
    }

    return customRoles;
  } catch (error) {
    console.error('Error getting custom roles:', error);
    return [];
  }
}

/**
 * Get all capabilities for a user in a context
 * @param {Object} user
 * @param {Object} context
 * @returns {Array}
 */
async function getUserCapabilities(user, context = {}) {
  if (!user) return [];

  // Admins have all capabilities
  if (user.isAdmin) {
    return Object.keys(CAPABILITIES);
  }

  const capabilities = new Set();

  // Add system role capabilities
  const systemRole = user.role || 'student';
  const roleConfig = DEFAULT_ROLES[systemRole];
  if (roleConfig) {
    roleConfig.capabilities.forEach(cap => capabilities.add(cap));
  }

  // Add course role capabilities
  if (context.courseId) {
    const courseRole = await getCourseRole(user.userId, context.courseId);
    if (courseRole) {
      const courseRoleConfig = DEFAULT_ROLES[courseRole];
      if (courseRoleConfig) {
        courseRoleConfig.capabilities.forEach(cap => capabilities.add(cap));
      }
    }
  }

  // Add custom role capabilities
  const customRoles = await getCustomRoles(user.userId, context);
  for (const customRole of customRoles) {
    if (customRole.capabilities) {
      customRole.capabilities.forEach(cap => capabilities.add(cap));
    }
  }

  return Array.from(capabilities);
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Middleware factory to require specific capabilities
 * @param {string|Array} capabilities - Required capability/capabilities
 * @param {Object} options - Options for checking
 * @returns {Function} Express middleware
 */
function requireCapability(capabilities, options = {}) {
  const capArray = Array.isArray(capabilities) ? capabilities : [capabilities];
  const mode = options.mode || 'all'; // 'all' or 'any'

  return async (req, res, next) => {
    // User must be authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '需要登入'
      });
    }

    // Build context from request
    const context = {
      courseId: req.params.courseId || req.body.courseId || req.query.courseId,
      categoryId: req.params.categoryId || req.body.categoryId || req.query.categoryId,
      ...options.context
    };

    // Check capabilities
    const hasRequired = await hasCapabilities(req.user, capArray, context, mode);

    if (!hasRequired) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '權限不足',
        required: capArray,
        mode
      });
    }

    // Attach context and capabilities to request for later use
    req.permissionContext = context;
    req.userCapabilities = await getUserCapabilities(req.user, context);

    next();
  };
}

/**
 * Middleware to require being course teacher/instructor
 */
function requireCourseTeacher() {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '需要登入'
      });
    }

    const courseId = req.params.courseId || req.body.courseId;
    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_COURSE_ID',
        message: '需要提供課程 ID'
      });
    }

    // Admin always allowed
    if (req.user.isAdmin) {
      return next();
    }

    const courseRole = await getCourseRole(req.user.userId, courseId);
    if (courseRole === 'teacher' || courseRole === 'assistant') {
      req.courseRole = courseRole;
      return next();
    }

    // Check if user is course creator
    const course = await db.getItem(`COURSE#${courseId}`, 'META');
    if (course && course.instructorId === req.user.userId) {
      req.courseRole = 'teacher';
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'NOT_COURSE_TEACHER',
      message: '需要課程教師權限'
    });
  };
}

/**
 * Middleware to require course enrollment
 */
function requireCourseEnrollment() {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '需要登入'
      });
    }

    const courseId = req.params.courseId || req.body.courseId;
    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_COURSE_ID',
        message: '需要提供課程 ID'
      });
    }

    // Admin always allowed
    if (req.user.isAdmin) {
      return next();
    }

    const courseRole = await getCourseRole(req.user.userId, courseId);
    if (courseRole) {
      req.courseRole = courseRole;
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'NOT_ENROLLED',
      message: '尚未報名此課程'
    });
  };
}

// ============================================================================
// ROLE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Assign a role to a user in a specific context
 * @param {string} userId
 * @param {string} roleId
 * @param {Object} context - Where the role applies
 * @returns {Object}
 */
async function assignRole(userId, roleId, context = {}) {
  const now = new Date().toISOString();
  const assignmentId = db.generateId('ra');

  const assignment = {
    PK: `USER#${userId}`,
    SK: `ROLE_ASSIGNMENT#${assignmentId}`,
    entityType: 'ROLE_ASSIGNMENT',
    createdAt: now,

    assignmentId,
    userId,
    roleId,
    courseId: context.courseId || null,
    categoryId: context.categoryId || null,
    assignedBy: context.assignedBy || null,
    expiresAt: context.expiresAt || null,
    status: 'active'
  };

  await db.putItem(assignment);

  // Also create reverse lookup
  const reverseItem = {
    PK: `ROLE#${roleId}`,
    SK: `USER#${userId}#${assignmentId}`,
    entityType: 'ROLE_USER',
    createdAt: now,

    assignmentId,
    userId,
    roleId,
    courseId: context.courseId || null,
    categoryId: context.categoryId || null
  };

  await db.putItem(reverseItem);

  return assignment;
}

/**
 * Remove a role from a user
 * @param {string} userId
 * @param {string} assignmentId
 */
async function removeRoleAssignment(userId, assignmentId) {
  const assignment = await db.getItem(`USER#${userId}`, `ROLE_ASSIGNMENT#${assignmentId}`);
  if (!assignment) {
    throw new Error('Role assignment not found');
  }

  // Delete both items
  await db.deleteItem(`USER#${userId}`, `ROLE_ASSIGNMENT#${assignmentId}`);
  await db.deleteItem(`ROLE#${assignment.roleId}`, `USER#${userId}#${assignmentId}`);

  return { success: true };
}

/**
 * Create a custom role
 * @param {Object} roleData
 * @returns {Object}
 */
async function createCustomRole(roleData) {
  const now = new Date().toISOString();
  const roleId = db.generateId('role');

  // Validate capabilities
  const validCapabilities = roleData.capabilities.filter(cap => CAPABILITIES[cap]);

  const role = {
    PK: 'ROLES',
    SK: `ROLE#${roleId}`,
    entityType: 'CUSTOM_ROLE',
    createdAt: now,

    roleId,
    name: roleData.name,
    nameEn: roleData.nameEn,
    description: roleData.description || '',
    capabilities: validCapabilities,
    isSystem: false,
    sortOrder: roleData.sortOrder || 100,
    createdBy: roleData.createdBy,
    status: 'active',
    updatedAt: now
  };

  await db.putItem(role);
  return role;
}

/**
 * Update a custom role
 * @param {string} roleId
 * @param {Object} updates
 * @returns {Object}
 */
async function updateCustomRole(roleId, updates) {
  const role = await db.getItem('ROLES', `ROLE#${roleId}`);
  if (!role) {
    throw new Error('Role not found');
  }

  if (role.isSystem) {
    throw new Error('Cannot modify system roles');
  }

  const validUpdates = {};
  if (updates.name) validUpdates.name = updates.name;
  if (updates.nameEn) validUpdates.nameEn = updates.nameEn;
  if (updates.description) validUpdates.description = updates.description;
  if (updates.capabilities) {
    validUpdates.capabilities = updates.capabilities.filter(cap => CAPABILITIES[cap]);
  }
  if (updates.sortOrder) validUpdates.sortOrder = updates.sortOrder;

  validUpdates.updatedAt = new Date().toISOString();

  await db.updateItem('ROLES', `ROLE#${roleId}`, validUpdates);
  return { ...role, ...validUpdates };
}

/**
 * Delete a custom role
 * @param {string} roleId
 */
async function deleteCustomRole(roleId) {
  const role = await db.getItem('ROLES', `ROLE#${roleId}`);
  if (!role) {
    throw new Error('Role not found');
  }

  if (role.isSystem) {
    throw new Error('Cannot delete system roles');
  }

  // Check if role has any assignments
  const assignments = await db.query({
    pk: `ROLE#${roleId}`,
    sk: { begins_with: 'USER#' }
  });

  if (assignments.length > 0) {
    throw new Error('Cannot delete role with active assignments');
  }

  await db.deleteItem('ROLES', `ROLE#${roleId}`);
  return { success: true };
}

/**
 * Get all custom roles
 * @returns {Array}
 */
async function getCustomRolesList() {
  const roles = await db.query({
    pk: 'ROLES',
    sk: { begins_with: 'ROLE#' }
  });

  return roles.sort((a, b) => (a.sortOrder || 100) - (b.sortOrder || 100));
}

/**
 * Set course role for a user
 * @param {string} courseId
 * @param {string} userId
 * @param {string} role
 */
async function setCourseRole(courseId, userId, role) {
  const now = new Date().toISOString();

  // Check if enrollment exists
  let enrollment = await db.getItem(`COURSE#${courseId}`, `ENROLLMENT#${userId}`);

  if (enrollment) {
    // Update existing enrollment
    await db.updateItem(`COURSE#${courseId}`, `ENROLLMENT#${userId}`, {
      courseRole: role,
      updatedAt: now
    });
  } else {
    // Get user data for new enrollment
    const user = await db.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create new enrollment with role
    enrollment = {
      PK: `COURSE#${courseId}`,
      SK: `ENROLLMENT#${userId}`,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `ENROLLMENT#${courseId}`,
      entityType: 'ENROLLMENT',
      createdAt: now,

      courseId,
      userId,
      userName: user.displayName,
      userEmail: user.email,
      courseRole: role,
      enrolledAt: now,
      status: 'active',
      progress: 0,
      completedModules: []
    };

    await db.putItem(enrollment);
  }

  return { success: true, role };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  CAPABILITIES,
  DEFAULT_ROLES,

  // Core functions
  hasCapability,
  hasCapabilities,
  getCourseRole,
  getUserCapabilities,
  getCustomRoles,

  // Express middleware
  requireCapability,
  requireCourseTeacher,
  requireCourseEnrollment,

  // Role management
  assignRole,
  removeRoleAssignment,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  getCustomRolesList,
  setCourseRole
};
