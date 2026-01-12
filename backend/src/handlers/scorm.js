/**
 * SCORM 學習內容包整合
 * Moodle-style SCORM Support
 *
 * 支援 SCORM 1.2 和 SCORM 2004 標準
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLE_NAME, putItem, getItem, queryItems, updateItem } = require('../utils/db');
const { authMiddleware, adminMiddleware } = require('../utils/auth');
const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

// SCORM 資料模型常量
const SCORM_VERSIONS = {
  SCORM_12: 'scorm_1.2',
  SCORM_2004: 'scorm_2004'
};

const SCORM_STATUS = {
  NOT_ATTEMPTED: 'not attempted',
  INCOMPLETE: 'incomplete',
  COMPLETED: 'completed',
  PASSED: 'passed',
  FAILED: 'failed',
  BROWSED: 'browsed'
};

const SCORM_INTERACTIONS = {
  TRUE_FALSE: 'true-false',
  CHOICE: 'choice',
  FILL_IN: 'fill-in',
  MATCHING: 'matching',
  PERFORMANCE: 'performance',
  SEQUENCING: 'sequencing',
  LIKERT: 'likert',
  NUMERIC: 'numeric',
  OTHER: 'other'
};

/**
 * GET /api/scorm
 * 獲取所有 SCORM 包列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { courseId, status, limit = 50 } = req.query;

    let params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': 'SCORM_PACKAGE'
      },
      ScanIndexForward: false,
      Limit: parseInt(limit)
    };

    if (courseId) {
      params.FilterExpression = 'courseId = :courseId';
      params.ExpressionAttributeValues[':courseId'] = courseId;
    }

    if (status) {
      const filterPrefix = params.FilterExpression ? params.FilterExpression + ' AND ' : '';
      params.FilterExpression = filterPrefix + '#status = :status';
      params.ExpressionAttributeNames = { '#status': 'status' };
      params.ExpressionAttributeValues[':status'] = status;
    }

    const result = await docClient.send(new QueryCommand(params));

    res.json({
      success: true,
      data: result.Items || []
    });
  } catch (error) {
    console.error('Get SCORM packages error:', error);
    res.status(500).json({
      success: false,
      message: '獲取 SCORM 包失敗'
    });
  }
});

/**
 * GET /api/scorm/:packageId
 * 獲取單個 SCORM 包詳情
 */
router.get('/:packageId', authMiddleware, async (req, res) => {
  try {
    const { packageId } = req.params;

    const result = await getItem({
      PK: 'SCORM_PACKAGE',
      SK: `PACKAGE#${packageId}`
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'SCORM 包不存在'
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get SCORM package error:', error);
    res.status(500).json({
      success: false,
      message: '獲取 SCORM 包失敗'
    });
  }
});

/**
 * POST /api/scorm
 * 創建新的 SCORM 包（管理員/教師）
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      description,
      courseId,
      moduleId,
      version = SCORM_VERSIONS.SCORM_2004,
      manifestUrl,
      entryUrl,
      maxAttempts = 0, // 0 = 無限制
      gradingMethod = 'highest', // highest, average, first, last
      completionThreshold = 1.0,
      masteryScore = null,
      maxTimeAllowed = null, // 秒
      launchData = null,
      sequencingRules = null
    } = req.body;

    if (!name || !courseId) {
      return res.status(400).json({
        success: false,
        message: '名稱和課程 ID 為必填'
      });
    }

    const packageId = uuidv4();
    const now = new Date().toISOString();

    const scormPackage = {
      PK: 'SCORM_PACKAGE',
      SK: `PACKAGE#${packageId}`,
      packageId,
      name,
      description,
      courseId,
      moduleId,
      version,
      manifestUrl,
      entryUrl,
      maxAttempts,
      gradingMethod,
      completionThreshold,
      masteryScore,
      maxTimeAllowed,
      launchData,
      sequencingRules,
      status: 'active',
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now,
      // GSI for course lookup
      GSI1PK: `COURSE#${courseId}`,
      GSI1SK: `SCORM#${packageId}`
    };

    await putItem(scormPackage);

    res.status(201).json({
      success: true,
      message: 'SCORM 包創建成功',
      data: scormPackage
    });
  } catch (error) {
    console.error('Create SCORM package error:', error);
    res.status(500).json({
      success: false,
      message: '創建 SCORM 包失敗'
    });
  }
});

/**
 * PUT /api/scorm/:packageId
 * 更新 SCORM 包
 */
router.put('/:packageId', authMiddleware, async (req, res) => {
  try {
    const { packageId } = req.params;
    const updates = req.body;

    const existing = await getItem({
      PK: 'SCORM_PACKAGE',
      SK: `PACKAGE#${packageId}`
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'SCORM 包不存在'
      });
    }

    // 允許更新的欄位
    const allowedFields = [
      'name', 'description', 'manifestUrl', 'entryUrl',
      'maxAttempts', 'gradingMethod', 'completionThreshold',
      'masteryScore', 'maxTimeAllowed', 'launchData',
      'sequencingRules', 'status'
    ];

    const updateExpression = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateExpression.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = updates[field];
      }
    });

    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    await updateItem({
      PK: 'SCORM_PACKAGE',
      SK: `PACKAGE#${packageId}`
    }, {
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    res.json({
      success: true,
      message: 'SCORM 包更新成功'
    });
  } catch (error) {
    console.error('Update SCORM package error:', error);
    res.status(500).json({
      success: false,
      message: '更新 SCORM 包失敗'
    });
  }
});

/**
 * POST /api/scorm/:packageId/launch
 * 啟動 SCORM 包並創建/恢復嘗試
 */
router.post('/:packageId/launch', authMiddleware, async (req, res) => {
  try {
    const { packageId } = req.params;
    const userId = req.user.userId;

    // 獲取包信息
    const scormPackage = await getItem({
      PK: 'SCORM_PACKAGE',
      SK: `PACKAGE#${packageId}`
    });

    if (!scormPackage) {
      return res.status(404).json({
        success: false,
        message: 'SCORM 包不存在'
      });
    }

    // 查找現有嘗試
    const attemptsResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':pk': `SCORM_ATTEMPT#${packageId}`,
        ':userId': userId
      },
      ScanIndexForward: false,
      Limit: 1
    }));

    let attempt;
    const existingAttempt = attemptsResult.Items?.[0];

    // 檢查是否可以創建新嘗試
    if (existingAttempt && existingAttempt.status !== SCORM_STATUS.COMPLETED && existingAttempt.status !== SCORM_STATUS.PASSED) {
      // 恢復現有嘗試
      attempt = existingAttempt;
    } else {
      // 計算嘗試次數
      const attemptCount = attemptsResult.Items?.length || 0;

      if (scormPackage.maxAttempts > 0 && attemptCount >= scormPackage.maxAttempts) {
        return res.status(400).json({
          success: false,
          message: `已達最大嘗試次數 (${scormPackage.maxAttempts})`
        });
      }

      // 創建新嘗試
      const attemptId = uuidv4();
      const now = new Date().toISOString();

      attempt = {
        PK: `SCORM_ATTEMPT#${packageId}`,
        SK: `ATTEMPT#${attemptId}`,
        attemptId,
        packageId,
        userId,
        attemptNumber: attemptCount + 1,
        status: SCORM_STATUS.NOT_ATTEMPTED,
        score: null,
        scaledScore: null,
        successStatus: null,
        completionStatus: 'incomplete',
        progressMeasure: 0,
        totalTime: 0,
        sessionTime: 0,
        suspendData: null,
        location: null,
        interactions: [],
        objectives: [],
        comments: [],
        startedAt: now,
        lastAccessedAt: now,
        completedAt: null,
        // GSI for user lookup
        GSI1PK: `USER#${userId}`,
        GSI1SK: `SCORM_ATTEMPT#${now}`
      };

      await putItem(attempt);
    }

    // 返回啟動數據
    res.json({
      success: true,
      data: {
        attempt,
        package: {
          packageId: scormPackage.packageId,
          name: scormPackage.name,
          version: scormPackage.version,
          entryUrl: scormPackage.entryUrl,
          launchData: scormPackage.launchData,
          maxTimeAllowed: scormPackage.maxTimeAllowed,
          masteryScore: scormPackage.masteryScore
        }
      }
    });
  } catch (error) {
    console.error('Launch SCORM package error:', error);
    res.status(500).json({
      success: false,
      message: '啟動 SCORM 包失敗'
    });
  }
});

/**
 * GET /api/scorm/:packageId/runtime/:attemptId
 * 獲取 SCORM 運行時數據 (cmi 數據)
 */
router.get('/:packageId/runtime/:attemptId', authMiddleware, async (req, res) => {
  try {
    const { packageId, attemptId } = req.params;

    const attempt = await getItem({
      PK: `SCORM_ATTEMPT#${packageId}`,
      SK: `ATTEMPT#${attemptId}`
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: '嘗試記錄不存在'
      });
    }

    // 構建 CMI 數據對象
    const cmiData = {
      // SCORM 2004 CMI 數據模型
      'cmi._version': '1.0',
      'cmi.completion_status': attempt.completionStatus || 'unknown',
      'cmi.completion_threshold': attempt.completionThreshold,
      'cmi.credit': 'credit',
      'cmi.entry': attempt.location ? 'resume' : 'ab-initio',
      'cmi.exit': '',
      'cmi.launch_data': attempt.launchData || '',
      'cmi.learner_id': attempt.userId,
      'cmi.learner_name': req.user.displayName || req.user.email,
      'cmi.location': attempt.location || '',
      'cmi.max_time_allowed': attempt.maxTimeAllowed || '',
      'cmi.mode': 'normal',
      'cmi.progress_measure': attempt.progressMeasure || 0,
      'cmi.scaled_passing_score': attempt.masteryScore || '',
      'cmi.score.scaled': attempt.scaledScore,
      'cmi.score.raw': attempt.score,
      'cmi.score.min': 0,
      'cmi.score.max': 100,
      'cmi.session_time': 'PT0H0M0S',
      'cmi.success_status': attempt.successStatus || 'unknown',
      'cmi.suspend_data': attempt.suspendData || '',
      'cmi.time_limit_action': 'continue,no message',
      'cmi.total_time': formatSCORMTime(attempt.totalTime || 0)
    };

    // 添加互動數據
    if (attempt.interactions && attempt.interactions.length > 0) {
      cmiData['cmi.interactions._count'] = attempt.interactions.length;
      attempt.interactions.forEach((interaction, index) => {
        cmiData[`cmi.interactions.${index}.id`] = interaction.id;
        cmiData[`cmi.interactions.${index}.type`] = interaction.type;
        cmiData[`cmi.interactions.${index}.timestamp`] = interaction.timestamp;
        cmiData[`cmi.interactions.${index}.weighting`] = interaction.weighting;
        cmiData[`cmi.interactions.${index}.learner_response`] = interaction.learnerResponse;
        cmiData[`cmi.interactions.${index}.result`] = interaction.result;
        cmiData[`cmi.interactions.${index}.latency`] = interaction.latency;
        cmiData[`cmi.interactions.${index}.description`] = interaction.description;
      });
    } else {
      cmiData['cmi.interactions._count'] = 0;
    }

    // 添加目標數據
    if (attempt.objectives && attempt.objectives.length > 0) {
      cmiData['cmi.objectives._count'] = attempt.objectives.length;
      attempt.objectives.forEach((objective, index) => {
        cmiData[`cmi.objectives.${index}.id`] = objective.id;
        cmiData[`cmi.objectives.${index}.score.scaled`] = objective.scaledScore;
        cmiData[`cmi.objectives.${index}.score.raw`] = objective.score;
        cmiData[`cmi.objectives.${index}.success_status`] = objective.successStatus;
        cmiData[`cmi.objectives.${index}.completion_status`] = objective.completionStatus;
        cmiData[`cmi.objectives.${index}.progress_measure`] = objective.progressMeasure;
        cmiData[`cmi.objectives.${index}.description`] = objective.description;
      });
    } else {
      cmiData['cmi.objectives._count'] = 0;
    }

    res.json({
      success: true,
      data: cmiData
    });
  } catch (error) {
    console.error('Get SCORM runtime data error:', error);
    res.status(500).json({
      success: false,
      message: '獲取 SCORM 運行時數據失敗'
    });
  }
});

/**
 * PUT /api/scorm/:packageId/runtime/:attemptId
 * 更新 SCORM 運行時數據
 */
router.put('/:packageId/runtime/:attemptId', authMiddleware, async (req, res) => {
  try {
    const { packageId, attemptId } = req.params;
    const { element, value } = req.body;

    if (!element) {
      return res.status(400).json({
        success: false,
        message: '元素名稱為必填'
      });
    }

    const attempt = await getItem({
      PK: `SCORM_ATTEMPT#${packageId}`,
      SK: `ATTEMPT#${attemptId}`
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: '嘗試記錄不存在'
      });
    }

    // 處理不同的 CMI 元素更新
    const updates = {};
    const now = new Date().toISOString();

    switch (element) {
      case 'cmi.completion_status':
        updates.completionStatus = value;
        if (value === 'completed') {
          updates.completedAt = now;
        }
        break;
      case 'cmi.success_status':
        updates.successStatus = value;
        break;
      case 'cmi.score.scaled':
        updates.scaledScore = parseFloat(value);
        break;
      case 'cmi.score.raw':
        updates.score = parseFloat(value);
        break;
      case 'cmi.progress_measure':
        updates.progressMeasure = parseFloat(value);
        break;
      case 'cmi.location':
        updates.location = value;
        break;
      case 'cmi.suspend_data':
        updates.suspendData = value;
        break;
      case 'cmi.session_time':
        const sessionSeconds = parseSCORMTime(value);
        updates.sessionTime = sessionSeconds;
        updates.totalTime = (attempt.totalTime || 0) + sessionSeconds;
        break;
      case 'cmi.exit':
        if (value === 'suspend' || value === 'logout') {
          updates.status = SCORM_STATUS.INCOMPLETE;
        }
        break;
      default:
        // 處理互動和目標等陣列元素
        if (element.startsWith('cmi.interactions.')) {
          const match = element.match(/cmi\.interactions\.(\d+)\.(.+)/);
          if (match) {
            const index = parseInt(match[1]);
            const field = match[2];
            const interactions = [...(attempt.interactions || [])];
            if (!interactions[index]) {
              interactions[index] = { id: `interaction_${index}` };
            }
            interactions[index][camelCase(field)] = value;
            updates.interactions = interactions;
          }
        } else if (element.startsWith('cmi.objectives.')) {
          const match = element.match(/cmi\.objectives\.(\d+)\.(.+)/);
          if (match) {
            const index = parseInt(match[1]);
            const field = match[2];
            const objectives = [...(attempt.objectives || [])];
            if (!objectives[index]) {
              objectives[index] = { id: `objective_${index}` };
            }
            objectives[index][camelCase(field)] = value;
            updates.objectives = objectives;
          }
        }
    }

    updates.lastAccessedAt = now;

    // 計算完成狀態
    if (updates.completionStatus === 'completed' || updates.successStatus === 'passed') {
      updates.status = updates.successStatus === 'passed' ? SCORM_STATUS.PASSED : SCORM_STATUS.COMPLETED;
    }

    // 構建更新表達式
    const updateExpression = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    Object.keys(updates).forEach(key => {
      updateExpression.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = updates[key];
    });

    if (updateExpression.length > 0) {
      await updateItem({
        PK: `SCORM_ATTEMPT#${packageId}`,
        SK: `ATTEMPT#${attemptId}`
      }, {
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      });
    }

    res.json({
      success: true,
      message: '更新成功'
    });
  } catch (error) {
    console.error('Update SCORM runtime data error:', error);
    res.status(500).json({
      success: false,
      message: '更新 SCORM 運行時數據失敗'
    });
  }
});

/**
 * POST /api/scorm/:packageId/commit/:attemptId
 * 提交 SCORM 數據 (LMSCommit)
 */
router.post('/:packageId/commit/:attemptId', authMiddleware, async (req, res) => {
  try {
    const { packageId, attemptId } = req.params;

    // 更新最後訪問時間
    await updateItem({
      PK: `SCORM_ATTEMPT#${packageId}`,
      SK: `ATTEMPT#${attemptId}`
    }, {
      UpdateExpression: 'SET lastAccessedAt = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString()
      }
    });

    res.json({
      success: true,
      message: '數據已提交'
    });
  } catch (error) {
    console.error('Commit SCORM data error:', error);
    res.status(500).json({
      success: false,
      message: '提交 SCORM 數據失敗'
    });
  }
});

/**
 * POST /api/scorm/:packageId/finish/:attemptId
 * 結束 SCORM 會話 (LMSFinish)
 */
router.post('/:packageId/finish/:attemptId', authMiddleware, async (req, res) => {
  try {
    const { packageId, attemptId } = req.params;
    const now = new Date().toISOString();

    const attempt = await getItem({
      PK: `SCORM_ATTEMPT#${packageId}`,
      SK: `ATTEMPT#${attemptId}`
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: '嘗試記錄不存在'
      });
    }

    // 確定最終狀態
    let finalStatus = attempt.status;
    if (attempt.completionStatus === 'completed') {
      finalStatus = attempt.successStatus === 'passed' ? SCORM_STATUS.PASSED : SCORM_STATUS.COMPLETED;
    } else if (attempt.status === SCORM_STATUS.NOT_ATTEMPTED) {
      finalStatus = SCORM_STATUS.INCOMPLETE;
    }

    await updateItem({
      PK: `SCORM_ATTEMPT#${packageId}`,
      SK: `ATTEMPT#${attemptId}`
    }, {
      UpdateExpression: 'SET #status = :status, lastAccessedAt = :now, finishedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': finalStatus,
        ':now': now
      }
    });

    res.json({
      success: true,
      message: '會話已結束'
    });
  } catch (error) {
    console.error('Finish SCORM session error:', error);
    res.status(500).json({
      success: false,
      message: '結束 SCORM 會話失敗'
    });
  }
});

/**
 * GET /api/scorm/:packageId/attempts
 * 獲取用戶的嘗試記錄
 */
router.get('/:packageId/attempts', authMiddleware, async (req, res) => {
  try {
    const { packageId } = req.params;
    const { userId } = req.query;

    const targetUserId = userId || req.user.userId;

    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':pk': `SCORM_ATTEMPT#${packageId}`,
        ':userId': targetUserId
      },
      ScanIndexForward: false
    }));

    res.json({
      success: true,
      data: result.Items || []
    });
  } catch (error) {
    console.error('Get SCORM attempts error:', error);
    res.status(500).json({
      success: false,
      message: '獲取嘗試記錄失敗'
    });
  }
});

/**
 * GET /api/scorm/:packageId/report
 * 獲取 SCORM 包的報告（教師/管理員）
 */
router.get('/:packageId/report', adminMiddleware, async (req, res) => {
  try {
    const { packageId } = req.params;

    // 獲取所有嘗試
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `SCORM_ATTEMPT#${packageId}`
      }
    }));

    const attempts = result.Items || [];

    // 統計數據
    const stats = {
      totalAttempts: attempts.length,
      uniqueUsers: new Set(attempts.map(a => a.userId)).size,
      completionRate: 0,
      passRate: 0,
      averageScore: 0,
      averageTime: 0,
      statusBreakdown: {
        [SCORM_STATUS.NOT_ATTEMPTED]: 0,
        [SCORM_STATUS.INCOMPLETE]: 0,
        [SCORM_STATUS.COMPLETED]: 0,
        [SCORM_STATUS.PASSED]: 0,
        [SCORM_STATUS.FAILED]: 0
      }
    };

    let totalScore = 0;
    let totalTime = 0;
    let scoredAttempts = 0;
    let completedAttempts = 0;
    let passedAttempts = 0;

    attempts.forEach(attempt => {
      stats.statusBreakdown[attempt.status] = (stats.statusBreakdown[attempt.status] || 0) + 1;

      if (attempt.score !== null && attempt.score !== undefined) {
        totalScore += attempt.score;
        scoredAttempts++;
      }

      if (attempt.totalTime) {
        totalTime += attempt.totalTime;
      }

      if (attempt.status === SCORM_STATUS.COMPLETED || attempt.status === SCORM_STATUS.PASSED) {
        completedAttempts++;
      }

      if (attempt.status === SCORM_STATUS.PASSED) {
        passedAttempts++;
      }
    });

    if (scoredAttempts > 0) {
      stats.averageScore = Math.round(totalScore / scoredAttempts * 100) / 100;
    }

    if (attempts.length > 0) {
      stats.averageTime = Math.round(totalTime / attempts.length);
      stats.completionRate = Math.round(completedAttempts / attempts.length * 100);
      stats.passRate = Math.round(passedAttempts / attempts.length * 100);
    }

    res.json({
      success: true,
      data: {
        stats,
        attempts
      }
    });
  } catch (error) {
    console.error('Get SCORM report error:', error);
    res.status(500).json({
      success: false,
      message: '獲取報告失敗'
    });
  }
});

/**
 * DELETE /api/scorm/:packageId
 * 刪除 SCORM 包
 */
router.delete('/:packageId', adminMiddleware, async (req, res) => {
  try {
    const { packageId } = req.params;

    // 軟刪除
    await updateItem({
      PK: 'SCORM_PACKAGE',
      SK: `PACKAGE#${packageId}`
    }, {
      UpdateExpression: 'SET #status = :status, deletedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'deleted',
        ':now': new Date().toISOString()
      }
    });

    res.json({
      success: true,
      message: 'SCORM 包已刪除'
    });
  } catch (error) {
    console.error('Delete SCORM package error:', error);
    res.status(500).json({
      success: false,
      message: '刪除 SCORM 包失敗'
    });
  }
});

// 輔助函數：格式化 SCORM 時間
function formatSCORMTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `PT${hours}H${minutes}M${secs}S`;
}

// 輔助函數：解析 SCORM 時間
function parseSCORMTime(timeString) {
  const match = timeString.match(/PT(\d+)H(\d+)M(\d+)S/);
  if (match) {
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
  }
  return 0;
}

// 輔助函數：轉換為駝峰命名
function camelCase(str) {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase()).replace(/\.([a-z])/g, (g) => g[1].toUpperCase());
}

module.exports = router;
module.exports.SCORM_VERSIONS = SCORM_VERSIONS;
module.exports.SCORM_STATUS = SCORM_STATUS;
