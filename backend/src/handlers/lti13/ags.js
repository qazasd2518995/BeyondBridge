/**
 * LTI 1.3 Assignment and Grade Services (AGS)
 * BeyondBridge Education Platform
 *
 * 提供 Line Items 和 Scores 管理
 * 符合 LTI AGS 2.0 規範
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getItem, putItem, updateItem, deleteItem, query } = require('../../utils/db');
const { tokenAuthMiddleware, requireScope } = require('./token');

// AGS Content Types
const AGS_CONTENT_TYPES = {
  LINEITEM: 'application/vnd.ims.lis.v2.lineitem+json',
  LINEITEM_CONTAINER: 'application/vnd.ims.lis.v2.lineitemcontainer+json',
  SCORE: 'application/vnd.ims.lis.v1.score+json',
  RESULT: 'application/vnd.ims.lis.v2.resultcontainer+json'
};

/**
 * GET /api/lti/ags/courses/:courseId/lineitems
 * 取得課程的所有 Line Items
 */
router.get('/courses/:courseId/lineitems',
  tokenAuthMiddleware,
  requireScope('https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly'),
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const { resource_link_id, resource_id, tag, limit = 100 } = req.query;

      // 查詢 line items
      let items = await query(`COURSE#${courseId}`, {
        skPrefix: 'LINEITEM#',
        limit: parseInt(limit)
      });

      // 過濾條件
      if (resource_link_id) {
        items = items.filter(item => item.resourceLinkId === resource_link_id);
      }
      if (resource_id) {
        items = items.filter(item => item.resourceId === resource_id);
      }
      if (tag) {
        items = items.filter(item => item.tag === tag);
      }

      // 只回傳該 tool 的 items（如果有 toolId）
      if (req.toolId) {
        items = items.filter(item => item.toolId === req.toolId || !item.toolId);
      }

      // 轉換為 AGS 格式
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const agsItems = items.map(item => formatLineItem(item, baseUrl, courseId));

      res.set('Content-Type', AGS_CONTENT_TYPES.LINEITEM_CONTAINER);
      res.json(agsItems);

    } catch (error) {
      console.error('[AGS] Get lineitems error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to get line items'
      });
    }
  }
);

/**
 * POST /api/lti/ags/courses/:courseId/lineitems
 * 建立新的 Line Item
 */
router.post('/courses/:courseId/lineitems',
  tokenAuthMiddleware,
  requireScope('https://purl.imsglobal.org/spec/lti-ags/scope/lineitem'),
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const {
        scoreMaximum,
        label,
        resourceId,
        resourceLinkId,
        tag,
        startDateTime,
        endDateTime,
        gradesReleased
      } = req.body;

      // 驗證必要欄位
      if (!scoreMaximum || !label) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'scoreMaximum and label are required'
        });
      }

      const lineitemId = uuidv4();
      const now = new Date().toISOString();

      const lineitem = {
        PK: `COURSE#${courseId}`,
        SK: `LINEITEM#${lineitemId}`,
        entityType: 'LTI_LINEITEM',
        lineitemId,
        courseId,
        toolId: req.toolId,
        scoreMaximum: parseFloat(scoreMaximum),
        label,
        resourceId,
        resourceLinkId,
        tag,
        startDateTime,
        endDateTime,
        gradesReleased: gradesReleased !== false,
        createdAt: now,
        updatedAt: now
      };

      await putItem(lineitem);

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const formattedItem = formatLineItem(lineitem, baseUrl, courseId);

      res.status(201);
      res.set('Content-Type', AGS_CONTENT_TYPES.LINEITEM);
      res.set('Location', formattedItem.id);
      res.json(formattedItem);

    } catch (error) {
      console.error('[AGS] Create lineitem error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to create line item'
      });
    }
  }
);

/**
 * GET /api/lti/ags/courses/:courseId/lineitems/:lineitemId
 * 取得單一 Line Item
 */
router.get('/courses/:courseId/lineitems/:lineitemId',
  tokenAuthMiddleware,
  requireScope('https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly'),
  async (req, res) => {
    try {
      const { courseId, lineitemId } = req.params;

      const lineitem = await getItem(`COURSE#${courseId}`, `LINEITEM#${lineitemId}`);

      if (!lineitem) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Line item not found'
        });
      }

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const formattedItem = formatLineItem(lineitem, baseUrl, courseId);

      res.set('Content-Type', AGS_CONTENT_TYPES.LINEITEM);
      res.json(formattedItem);

    } catch (error) {
      console.error('[AGS] Get lineitem error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to get line item'
      });
    }
  }
);

/**
 * PUT /api/lti/ags/courses/:courseId/lineitems/:lineitemId
 * 更新 Line Item
 */
router.put('/courses/:courseId/lineitems/:lineitemId',
  tokenAuthMiddleware,
  requireScope('https://purl.imsglobal.org/spec/lti-ags/scope/lineitem'),
  async (req, res) => {
    try {
      const { courseId, lineitemId } = req.params;
      const updates = req.body;

      const existing = await getItem(`COURSE#${courseId}`, `LINEITEM#${lineitemId}`);

      if (!existing) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Line item not found'
        });
      }

      // 允許更新的欄位
      const allowedFields = ['scoreMaximum', 'label', 'resourceId', 'resourceLinkId', 'tag', 'startDateTime', 'endDateTime', 'gradesReleased'];
      const updateData = { updatedAt: new Date().toISOString() };

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateData[field] = field === 'scoreMaximum' ? parseFloat(updates[field]) : updates[field];
        }
      }

      const updated = await updateItem(`COURSE#${courseId}`, `LINEITEM#${lineitemId}`, updateData);

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const formattedItem = formatLineItem({ ...existing, ...updateData }, baseUrl, courseId);

      res.set('Content-Type', AGS_CONTENT_TYPES.LINEITEM);
      res.json(formattedItem);

    } catch (error) {
      console.error('[AGS] Update lineitem error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to update line item'
      });
    }
  }
);

/**
 * DELETE /api/lti/ags/courses/:courseId/lineitems/:lineitemId
 * 刪除 Line Item
 */
router.delete('/courses/:courseId/lineitems/:lineitemId',
  tokenAuthMiddleware,
  requireScope('https://purl.imsglobal.org/spec/lti-ags/scope/lineitem'),
  async (req, res) => {
    try {
      const { courseId, lineitemId } = req.params;

      const existing = await getItem(`COURSE#${courseId}`, `LINEITEM#${lineitemId}`);

      if (!existing) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Line item not found'
        });
      }

      await deleteItem(`COURSE#${courseId}`, `LINEITEM#${lineitemId}`);

      res.status(204).send();

    } catch (error) {
      console.error('[AGS] Delete lineitem error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to delete line item'
      });
    }
  }
);

/**
 * POST /api/lti/ags/courses/:courseId/lineitems/:lineitemId/scores
 * 提交成績
 */
router.post('/courses/:courseId/lineitems/:lineitemId/scores',
  tokenAuthMiddleware,
  requireScope('https://purl.imsglobal.org/spec/lti-ags/scope/score'),
  async (req, res) => {
    try {
      const { courseId, lineitemId } = req.params;
      const {
        userId,
        scoreGiven,
        scoreMaximum,
        comment,
        timestamp,
        activityProgress,  // Initialized, Started, InProgress, Submitted, Completed
        gradingProgress    // FullyGraded, Pending, PendingManual, Failed, NotReady
      } = req.body;

      // 驗證必要欄位
      if (!userId) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'userId is required'
        });
      }

      if (activityProgress && !['Initialized', 'Started', 'InProgress', 'Submitted', 'Completed'].includes(activityProgress)) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Invalid activityProgress value'
        });
      }

      if (gradingProgress && !['FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady'].includes(gradingProgress)) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Invalid gradingProgress value'
        });
      }

      // 確認 lineitem 存在
      const lineitem = await getItem(`COURSE#${courseId}`, `LINEITEM#${lineitemId}`);
      if (!lineitem) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Line item not found'
        });
      }

      const now = new Date().toISOString();

      // 建立或更新成績記錄
      const scoreRecord = {
        PK: `LINEITEM#${lineitemId}`,
        SK: `SCORE#${userId}`,
        entityType: 'LTI_SCORE',
        lineitemId,
        courseId,
        userId,
        scoreGiven: scoreGiven !== undefined ? parseFloat(scoreGiven) : null,
        scoreMaximum: scoreMaximum !== undefined ? parseFloat(scoreMaximum) : lineitem.scoreMaximum,
        comment,
        activityProgress: activityProgress || 'Completed',
        gradingProgress: gradingProgress || (scoreGiven !== undefined ? 'FullyGraded' : 'NotReady'),
        timestamp: timestamp || now,
        updatedAt: now
      };

      await putItem(scoreRecord);

      // 同步到 gradebook
      try {
        await syncScoreToGradebook(courseId, userId, lineitem, scoreRecord);
      } catch (syncError) {
        console.warn('[AGS] Gradebook sync warning:', syncError.message);
      }

      res.status(200).json({
        success: true,
        message: 'Score recorded'
      });

    } catch (error) {
      console.error('[AGS] Submit score error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to submit score'
      });
    }
  }
);

/**
 * GET /api/lti/ags/courses/:courseId/lineitems/:lineitemId/results
 * 取得成績結果
 */
router.get('/courses/:courseId/lineitems/:lineitemId/results',
  tokenAuthMiddleware,
  requireScope('https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly'),
  async (req, res) => {
    try {
      const { courseId, lineitemId } = req.params;
      const { user_id, limit = 100 } = req.query;

      // 查詢成績
      let queryOptions = {
        skPrefix: 'SCORE#',
        limit: parseInt(limit)
      };

      if (user_id) {
        queryOptions.skPrefix = `SCORE#${user_id}`;
      }

      const scores = await query(`LINEITEM#${lineitemId}`, queryOptions);

      // 轉換為 AGS Result 格式
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const results = scores.map(score => formatResult(score, baseUrl, courseId, lineitemId));

      res.set('Content-Type', AGS_CONTENT_TYPES.RESULT);
      res.json(results);

    } catch (error) {
      console.error('[AGS] Get results error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to get results'
      });
    }
  }
);

/**
 * 格式化 Line Item 為 AGS 格式
 */
function formatLineItem(item, baseUrl, courseId) {
  return {
    id: `${baseUrl}/api/lti/ags/courses/${courseId}/lineitems/${item.lineitemId}`,
    scoreMaximum: item.scoreMaximum,
    label: item.label,
    resourceId: item.resourceId,
    resourceLinkId: item.resourceLinkId,
    tag: item.tag,
    startDateTime: item.startDateTime,
    endDateTime: item.endDateTime,
    gradesReleased: item.gradesReleased
  };
}

/**
 * 格式化 Result 為 AGS 格式
 */
function formatResult(score, baseUrl, courseId, lineitemId) {
  const result = {
    id: `${baseUrl}/api/lti/ags/courses/${courseId}/lineitems/${lineitemId}/results/${score.userId}`,
    scoreOf: `${baseUrl}/api/lti/ags/courses/${courseId}/lineitems/${lineitemId}`,
    userId: score.userId,
    resultMaximum: score.scoreMaximum,
    comment: score.comment
  };

  if (score.scoreGiven !== null && score.scoreGiven !== undefined) {
    result.resultScore = score.scoreGiven;
  }

  return result;
}

/**
 * 同步成績到 gradebook
 */
async function syncScoreToGradebook(courseId, userId, lineitem, score) {
  if (score.scoreGiven === null || score.scoreGiven === undefined) {
    return; // 無分數則不同步
  }

  const gradeRecord = {
    PK: `COURSE#${courseId}`,
    SK: `GRADE#${userId}#${lineitem.lineitemId}`,
    entityType: 'GRADE',
    gradeId: `grade_${lineitem.lineitemId}_${userId}`,
    courseId,
    userId,
    lineitemId: lineitem.lineitemId,
    itemName: lineitem.label,
    itemType: 'lti_ags',
    score: score.scoreGiven,
    maxScore: score.scoreMaximum,
    percentage: Math.round((score.scoreGiven / score.scoreMaximum) * 100),
    status: score.gradingProgress === 'FullyGraded' ? 'graded' : 'pending',
    gradedAt: score.timestamp,
    comment: score.comment,
    updatedAt: new Date().toISOString()
  };

  await putItem(gradeRecord);
  console.log(`[AGS] Synced to gradebook: ${userId} - ${score.scoreGiven}/${score.scoreMaximum}`);
}

module.exports = router;
