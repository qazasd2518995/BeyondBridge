/**
 * 系統審計日誌 API
 * Moodle-style Audit Log System
 *
 * 記錄和追蹤系統中的所有重要操作
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLE_NAME, putItem, batchWrite, generateId } = require('../utils/db');
const { QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { authMiddleware, adminMiddleware } = require('../utils/auth');

// 審計事件類型
const AUDIT_EVENT_TYPES = {
  // 用戶相關
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_REGISTER: 'user_register',
  USER_UPDATE: 'user_update',
  USER_DELETE: 'user_delete',
  USER_PASSWORD_CHANGE: 'user_password_change',
  USER_PASSWORD_RESET: 'user_password_reset',

  // 課程相關
  COURSE_CREATE: 'course_create',
  COURSE_UPDATE: 'course_update',
  COURSE_DELETE: 'course_delete',
  COURSE_ENROLL: 'course_enroll',
  COURSE_UNENROLL: 'course_unenroll',
  COURSE_ROLE_ASSIGN: 'course_role_assign',
  COURSE_ROLE_REMOVE: 'course_role_remove',

  // 作業相關
  ASSIGNMENT_CREATE: 'assignment_create',
  ASSIGNMENT_UPDATE: 'assignment_update',
  ASSIGNMENT_DELETE: 'assignment_delete',
  ASSIGNMENT_SUBMIT: 'assignment_submit',
  ASSIGNMENT_GRADE: 'assignment_grade',

  // 測驗相關
  QUIZ_CREATE: 'quiz_create',
  QUIZ_UPDATE: 'quiz_update',
  QUIZ_DELETE: 'quiz_delete',
  QUIZ_ATTEMPT_START: 'quiz_attempt_start',
  QUIZ_ATTEMPT_SUBMIT: 'quiz_attempt_submit',

  // 成績相關
  GRADE_UPDATE: 'grade_update',
  GRADE_OVERRIDE: 'grade_override',
  GRADE_EXPORT: 'grade_export',

  // 檔案相關
  FILE_UPLOAD: 'file_upload',
  FILE_DOWNLOAD: 'file_download',
  FILE_DELETE: 'file_delete',

  // 系統設定
  SYSTEM_CONFIG_UPDATE: 'system_config_update',
  ROLE_CREATE: 'role_create',
  ROLE_UPDATE: 'role_update',
  ROLE_DELETE: 'role_delete',
  PERMISSION_CHANGE: 'permission_change',

  // 安全相關
  SECURITY_FAILED_LOGIN: 'security_failed_login',
  SECURITY_SUSPICIOUS_ACTIVITY: 'security_suspicious_activity',
  SECURITY_IP_BLOCKED: 'security_ip_blocked',

  // 備份與恢復
  BACKUP_CREATE: 'backup_create',
  BACKUP_RESTORE: 'backup_restore',

  // 其他
  DATA_EXPORT: 'data_export',
  DATA_IMPORT: 'data_import',
  BULK_OPERATION: 'bulk_operation'
};

// 事件嚴重等級
const SEVERITY_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// 輔助函數：記錄審計日誌
async function logAuditEvent({
  userId,
  userEmail,
  userName,
  eventType,
  targetType,
  targetId,
  targetName,
  description,
  severity = SEVERITY_LEVELS.INFO,
  metadata = {},
  ipAddress,
  userAgent
}) {
  try {
    const logId = uuidv4();
    const now = new Date().toISOString();

    const logEntry = {
      PK: 'AUDIT_LOG',
      SK: `LOG#${now}#${logId}`,
      logId,
      userId,
      userEmail,
      userName,
      eventType,
      targetType,
      targetId,
      targetName,
      description,
      severity,
      metadata,
      ipAddress,
      userAgent,
      createdAt: now,
      // 用於查詢的輔助索引
      GSI1PK: `USER#${userId}`,
      GSI1SK: `AUDIT#${now}`,
      GSI2PK: `EVENT#${eventType}`,
      GSI2SK: now
    };

    await putItem(logEntry);

    return logEntry;
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // 不拋出錯誤，避免影響主要操作
    return null;
  }
}

// 匯出審計日誌函數供其他模組使用
module.exports.logAuditEvent = logAuditEvent;
module.exports.AUDIT_EVENT_TYPES = AUDIT_EVENT_TYPES;
module.exports.SEVERITY_LEVELS = SEVERITY_LEVELS;

// ===== API 端點 =====

/**
 * GET /api/audit-logs
 * 獲取審計日誌列表（管理員）
 */
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const {
      eventType,
      userId,
      startDate,
      endDate,
      severity,
      targetType,
      limit = 50,
      lastKey
    } = req.query;

    let keyConditionExpression = 'PK = :pk';
    let expressionAttributeValues = {
      ':pk': 'AUDIT_LOG'
    };

    // 日期範圍過濾
    if (startDate && endDate) {
      keyConditionExpression += ' AND SK BETWEEN :start AND :end';
      expressionAttributeValues[':start'] = `LOG#${startDate}`;
      expressionAttributeValues[':end'] = `LOG#${endDate}z`;
    } else if (startDate) {
      keyConditionExpression += ' AND SK >= :start';
      expressionAttributeValues[':start'] = `LOG#${startDate}`;
    } else if (endDate) {
      keyConditionExpression += ' AND SK <= :end';
      expressionAttributeValues[':end'] = `LOG#${endDate}z`;
    }

    // 過濾條件
    let filterExpressions = [];

    if (eventType) {
      filterExpressions.push('eventType = :eventType');
      expressionAttributeValues[':eventType'] = eventType;
    }

    if (userId) {
      filterExpressions.push('userId = :userId');
      expressionAttributeValues[':userId'] = userId;
    }

    if (severity) {
      filterExpressions.push('severity = :severity');
      expressionAttributeValues[':severity'] = severity;
    }

    if (targetType) {
      filterExpressions.push('targetType = :targetType');
      expressionAttributeValues[':targetType'] = targetType;
    }

    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false,
      Limit: parseInt(limit)
    };

    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
    }

    // 分頁
    if (lastKey) {
      params.ExclusiveStartKey = JSON.parse(Buffer.from(lastKey, 'base64').toString());
    }

    const result = await docClient.send(new QueryCommand(params));

    res.json({
      success: true,
      data: {
        logs: result.Items || [],
        lastKey: result.LastEvaluatedKey
          ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
          : null,
        count: (result.Items || []).length
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: '獲取審計日誌失敗'
    });
  }
});

/**
 * GET /api/audit-logs/stats
 * 獲取審計日誌統計（管理員）
 */
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK >= :start',
      ExpressionAttributeValues: {
        ':pk': 'AUDIT_LOG',
        ':start': `LOG#${startDate.toISOString()}`
      }
    };

    const result = await docClient.send(new QueryCommand(params));
    const logs = result.Items || [];

    // 統計各類型事件數量
    const eventTypeCounts = {};
    const severityCounts = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };
    const dailyCounts = {};
    const userActivityCounts = {};

    logs.forEach(log => {
      // 事件類型統計
      eventTypeCounts[log.eventType] = (eventTypeCounts[log.eventType] || 0) + 1;

      // 嚴重等級統計
      severityCounts[log.severity] = (severityCounts[log.severity] || 0) + 1;

      // 每日統計
      const date = log.createdAt.split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;

      // 用戶活動統計
      if (log.userId) {
        if (!userActivityCounts[log.userId]) {
          userActivityCounts[log.userId] = {
            userId: log.userId,
            userName: log.userName,
            count: 0
          };
        }
        userActivityCounts[log.userId].count++;
      }
    });

    // 轉換為數組並排序
    const topUsers = Object.values(userActivityCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topEvents = Object.entries(eventTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        totalLogs: logs.length,
        period: `${days} 天`,
        eventTypeCounts,
        severityCounts,
        dailyCounts,
        topUsers,
        topEvents
      }
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({
      success: false,
      message: '獲取審計統計失敗'
    });
  }
});

/**
 * GET /api/audit-logs/user/:userId
 * 獲取特定用戶的審計日誌
 */
router.get('/user/:userId', adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, lastKey } = req.query;

    const params = {
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`
      },
      ScanIndexForward: false,
      Limit: parseInt(limit)
    };

    if (lastKey) {
      params.ExclusiveStartKey = JSON.parse(Buffer.from(lastKey, 'base64').toString());
    }

    const result = await docClient.send(new QueryCommand(params));

    res.json({
      success: true,
      data: {
        logs: result.Items || [],
        lastKey: result.LastEvaluatedKey
          ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
          : null
      }
    });
  } catch (error) {
    console.error('Get user audit logs error:', error);
    res.status(500).json({
      success: false,
      message: '獲取用戶審計日誌失敗'
    });
  }
});

/**
 * GET /api/audit-logs/event-types
 * 獲取所有事件類型
 */
router.get('/event-types', adminMiddleware, (req, res) => {
  const eventTypes = Object.entries(AUDIT_EVENT_TYPES).map(([key, value]) => ({
    key,
    value,
    category: key.split('_')[0].toLowerCase()
  }));

  res.json({
    success: true,
    data: eventTypes
  });
});

/**
 * GET /api/audit-logs/export
 * 匯出審計日誌（CSV 格式）
 */
router.get('/export', adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, eventType, format = 'csv' } = req.query;

    let keyConditionExpression = 'PK = :pk';
    let expressionAttributeValues = {
      ':pk': 'AUDIT_LOG'
    };

    if (startDate && endDate) {
      keyConditionExpression += ' AND SK BETWEEN :start AND :end';
      expressionAttributeValues[':start'] = `LOG#${startDate}`;
      expressionAttributeValues[':end'] = `LOG#${endDate}z`;
    }

    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false
    };

    if (eventType) {
      params.FilterExpression = 'eventType = :eventType';
      expressionAttributeValues[':eventType'] = eventType;
    }

    const result = await docClient.send(new QueryCommand(params));
    const logs = result.Items || [];

    // 記錄匯出事件
    await logAuditEvent({
      userId: req.user.userId,
      userEmail: req.user.email,
      userName: req.user.displayName,
      eventType: AUDIT_EVENT_TYPES.DATA_EXPORT,
      targetType: 'audit_logs',
      description: `匯出 ${logs.length} 筆審計日誌`,
      severity: SEVERITY_LEVELS.INFO,
      metadata: { startDate, endDate, eventType, format, count: logs.length },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.json');
      return res.json(logs);
    }

    // CSV 格式
    const headers = ['時間', '用戶', 'Email', '事件類型', '目標類型', '目標', '說明', '嚴重等級', 'IP'];
    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      const row = [
        log.createdAt,
        log.userName || '',
        log.userEmail || '',
        log.eventType,
        log.targetType || '',
        log.targetName || '',
        `"${(log.description || '').replace(/"/g, '""')}"`,
        log.severity,
        log.ipAddress || ''
      ];
      csvRows.push(row.join(','));
    });

    const csv = '\uFEFF' + csvRows.join('\n'); // BOM for UTF-8

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csv);
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({
      success: false,
      message: '匯出審計日誌失敗'
    });
  }
});

/**
 * POST /api/audit-logs
 * 手動記錄審計事件（內部 API）
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      eventType,
      targetType,
      targetId,
      targetName,
      description,
      severity = SEVERITY_LEVELS.INFO,
      metadata = {}
    } = req.body;

    if (!eventType) {
      return res.status(400).json({
        success: false,
        message: '事件類型為必填'
      });
    }

    const log = await logAuditEvent({
      userId: req.user.userId,
      userEmail: req.user.email,
      userName: req.user.displayName,
      eventType,
      targetType,
      targetId,
      targetName,
      description,
      severity,
      metadata,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Create audit log error:', error);
    res.status(500).json({
      success: false,
      message: '記錄審計日誌失敗'
    });
  }
});

/**
 * DELETE /api/audit-logs/cleanup
 * 清理舊的審計日誌（管理員，保留指定天數的日誌）
 */
router.delete('/cleanup', adminMiddleware, async (req, res) => {
  try {
    const { keepDays = 90 } = req.query;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(keepDays));

    // 查詢要刪除的日誌
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK < :cutoff',
      ExpressionAttributeValues: {
        ':pk': 'AUDIT_LOG',
        ':cutoff': `LOG#${cutoffDate.toISOString()}`
      }
    };

    const result = await docClient.send(new QueryCommand(params));
    const logsToDelete = result.Items || [];

    if (logsToDelete.length === 0) {
      return res.json({
        success: true,
        message: '沒有需要清理的日誌',
        data: { deletedCount: 0 }
      });
    }

    // 批量刪除
    const deleteRequests = logsToDelete.map(log => ({
      DeleteRequest: {
        Key: { PK: log.PK, SK: log.SK }
      }
    }));

    // DynamoDB 批量寫入限制為 25 個項目
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch
        }
      }));
    }

    // 記錄清理事件
    await logAuditEvent({
      userId: req.user.userId,
      userEmail: req.user.email,
      userName: req.user.displayName,
      eventType: AUDIT_EVENT_TYPES.BULK_OPERATION,
      targetType: 'audit_logs',
      description: `清理 ${logsToDelete.length} 筆超過 ${keepDays} 天的審計日誌`,
      severity: SEVERITY_LEVELS.WARNING,
      metadata: { keepDays, deletedCount: logsToDelete.length },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: `已清理 ${logsToDelete.length} 筆審計日誌`,
      data: { deletedCount: logsToDelete.length }
    });
  } catch (error) {
    console.error('Cleanup audit logs error:', error);
    res.status(500).json({
      success: false,
      message: '清理審計日誌失敗'
    });
  }
});

/**
 * GET /api/audit-logs/search
 * 搜尋審計日誌
 */
router.get('/search', adminMiddleware, async (req, res) => {
  try {
    const {
      query,
      startDate,
      endDate,
      limit = 50
    } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: '搜尋關鍵字為必填'
      });
    }

    let keyConditionExpression = 'PK = :pk';
    let expressionAttributeValues = {
      ':pk': 'AUDIT_LOG',
      ':query': query
    };

    if (startDate && endDate) {
      keyConditionExpression += ' AND SK BETWEEN :start AND :end';
      expressionAttributeValues[':start'] = `LOG#${startDate}`;
      expressionAttributeValues[':end'] = `LOG#${endDate}z`;
    }

    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: keyConditionExpression,
      FilterExpression: 'contains(description, :query) OR contains(userName, :query) OR contains(userEmail, :query) OR contains(targetName, :query)',
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false,
      Limit: parseInt(limit) * 3 // 因為有過濾，多取一些
    };

    const result = await docClient.send(new QueryCommand(params));

    res.json({
      success: true,
      data: {
        logs: (result.Items || []).slice(0, parseInt(limit)),
        count: (result.Items || []).length
      }
    });
  } catch (error) {
    console.error('Search audit logs error:', error);
    res.status(500).json({
      success: false,
      message: '搜尋審計日誌失敗'
    });
  }
});

module.exports = router;
