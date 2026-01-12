/**
 * LTI (Learning Tools Interoperability) 整合
 * Moodle-style LTI Support
 *
 * 支援 LTI 1.1 和 LTI 1.3 標準
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { docClient, TABLE_NAME, putItem, getItem, queryItems, updateItem } = require('../utils/db');
const { authMiddleware, adminMiddleware } = require('../utils/auth');
const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

// LTI 版本
const LTI_VERSIONS = {
  LTI_11: '1.1',
  LTI_13: '1.3'
};

// LTI 啟動類型
const LTI_LAUNCH_TYPES = {
  BASIC_LAUNCH: 'basic-lti-launch-request',
  CONTENT_ITEM: 'ContentItemSelectionRequest',
  DEEP_LINK: 'LtiDeepLinkingRequest'
};

// LTI 角色映射
const LTI_ROLES = {
  STUDENT: ['Learner', 'Student', 'urn:lti:role:ims/lis/Learner'],
  INSTRUCTOR: ['Instructor', 'Faculty', 'urn:lti:role:ims/lis/Instructor'],
  ADMIN: ['Administrator', 'urn:lti:role:ims/lis/Administrator']
};

/**
 * GET /api/lti/tools
 * 獲取所有外部工具列表
 */
router.get('/tools', authMiddleware, async (req, res) => {
  try {
    const { courseId, status, limit = 50 } = req.query;

    let params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': 'LTI_TOOL'
      },
      ScanIndexForward: false,
      Limit: parseInt(limit)
    };

    if (courseId) {
      params.FilterExpression = 'courseId = :courseId OR isGlobal = :true';
      params.ExpressionAttributeValues[':courseId'] = courseId;
      params.ExpressionAttributeValues[':true'] = true;
    }

    if (status) {
      const filterPrefix = params.FilterExpression ? params.FilterExpression + ' AND ' : '';
      params.FilterExpression = filterPrefix + '#status = :status';
      params.ExpressionAttributeNames = { '#status': 'status' };
      params.ExpressionAttributeValues[':status'] = status;
    }

    const result = await docClient.send(new QueryCommand(params));

    // 過濾敏感資訊
    const tools = (result.Items || []).map(tool => ({
      ...tool,
      consumerSecret: undefined,
      privateKey: undefined
    }));

    res.json({
      success: true,
      data: tools
    });
  } catch (error) {
    console.error('Get LTI tools error:', error);
    res.status(500).json({
      success: false,
      message: '獲取 LTI 工具失敗'
    });
  }
});

/**
 * GET /api/lti/tools/:toolId
 * 獲取單個 LTI 工具詳情
 */
router.get('/tools/:toolId', authMiddleware, async (req, res) => {
  try {
    const { toolId } = req.params;

    const result = await getItem({
      PK: 'LTI_TOOL',
      SK: `TOOL#${toolId}`
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'LTI 工具不存在'
      });
    }

    // 移除敏感資訊
    const { consumerSecret, privateKey, ...tool } = result;

    res.json({
      success: true,
      data: tool
    });
  } catch (error) {
    console.error('Get LTI tool error:', error);
    res.status(500).json({
      success: false,
      message: '獲取 LTI 工具失敗'
    });
  }
});

/**
 * POST /api/lti/tools
 * 創建新的 LTI 外部工具（管理員）
 */
router.post('/tools', adminMiddleware, async (req, res) => {
  try {
    const {
      name,
      description,
      toolUrl,
      version = LTI_VERSIONS.LTI_13,
      courseId = null, // null = 全站可用
      consumerKey,
      consumerSecret,
      clientId,
      deploymentId,
      platformId,
      publicKeysetUrl,
      loginUrl,
      redirectUris = [],
      customParameters = {},
      iconUrl = null,
      privacyLevel = 'anonymous', // anonymous, name, email, public
      allowGradePassback = true,
      allowMembershipService = false,
      allowContentSelection = false,
      launchContainer = 'window' // window, embed, iframe
    } = req.body;

    if (!name || !toolUrl) {
      return res.status(400).json({
        success: false,
        message: '名稱和工具 URL 為必填'
      });
    }

    const toolId = uuidv4();
    const now = new Date().toISOString();

    // 生成 LTI 1.1 密鑰（如果未提供）
    const finalConsumerKey = consumerKey || `bb_${toolId.slice(0, 8)}`;
    const finalConsumerSecret = consumerSecret || crypto.randomBytes(32).toString('hex');

    const tool = {
      PK: 'LTI_TOOL',
      SK: `TOOL#${toolId}`,
      toolId,
      name,
      description,
      toolUrl,
      version,
      courseId,
      isGlobal: courseId === null,
      consumerKey: finalConsumerKey,
      consumerSecret: finalConsumerSecret,
      clientId,
      deploymentId,
      platformId,
      publicKeysetUrl,
      loginUrl,
      redirectUris,
      customParameters,
      iconUrl,
      privacyLevel,
      allowGradePassback,
      allowMembershipService,
      allowContentSelection,
      launchContainer,
      status: 'active',
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now
    };

    await putItem(tool);

    // 返回時隱藏敏感資訊
    const { consumerSecret: _, privateKey: __, ...safeTool } = tool;

    res.status(201).json({
      success: true,
      message: 'LTI 工具創建成功',
      data: safeTool
    });
  } catch (error) {
    console.error('Create LTI tool error:', error);
    res.status(500).json({
      success: false,
      message: '創建 LTI 工具失敗'
    });
  }
});

/**
 * PUT /api/lti/tools/:toolId
 * 更新 LTI 工具
 */
router.put('/tools/:toolId', adminMiddleware, async (req, res) => {
  try {
    const { toolId } = req.params;
    const updates = req.body;

    const existing = await getItem({
      PK: 'LTI_TOOL',
      SK: `TOOL#${toolId}`
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'LTI 工具不存在'
      });
    }

    // 允許更新的欄位
    const allowedFields = [
      'name', 'description', 'toolUrl', 'version', 'courseId',
      'customParameters', 'iconUrl', 'privacyLevel',
      'allowGradePassback', 'allowMembershipService',
      'allowContentSelection', 'launchContainer', 'status',
      'loginUrl', 'redirectUris', 'publicKeysetUrl'
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

    // 更新 isGlobal 標記
    if (updates.courseId !== undefined) {
      updateExpression.push('#isGlobal = :isGlobal');
      expressionAttributeNames['#isGlobal'] = 'isGlobal';
      expressionAttributeValues[':isGlobal'] = updates.courseId === null;
    }

    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    await updateItem({
      PK: 'LTI_TOOL',
      SK: `TOOL#${toolId}`
    }, {
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    res.json({
      success: true,
      message: 'LTI 工具更新成功'
    });
  } catch (error) {
    console.error('Update LTI tool error:', error);
    res.status(500).json({
      success: false,
      message: '更新 LTI 工具失敗'
    });
  }
});

/**
 * POST /api/lti/tools/:toolId/launch
 * 生成 LTI 啟動請求
 */
router.post('/tools/:toolId/launch', authMiddleware, async (req, res) => {
  try {
    const { toolId } = req.params;
    const { courseId, resourceId, returnUrl } = req.body;

    const tool = await getItem({
      PK: 'LTI_TOOL',
      SK: `TOOL#${toolId}`
    });

    if (!tool) {
      return res.status(404).json({
        success: false,
        message: 'LTI 工具不存在'
      });
    }

    if (tool.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'LTI 工具已停用'
      });
    }

    const launchId = uuidv4();
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');

    // 準備 LTI 參數
    const ltiParams = {
      // 必要參數
      lti_message_type: LTI_LAUNCH_TYPES.BASIC_LAUNCH,
      lti_version: tool.version === LTI_VERSIONS.LTI_13 ? 'LTI-1p0' : 'LTI-1p0',

      // 工具消費者資訊
      oauth_consumer_key: tool.consumerKey,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp.toString(),
      oauth_nonce: nonce,
      oauth_version: '1.0',
      oauth_callback: 'about:blank',

      // 資源資訊
      resource_link_id: resourceId || launchId,
      resource_link_title: tool.name,
      resource_link_description: tool.description || '',

      // 用戶資訊（根據隱私級別）
      user_id: req.user.userId,
      roles: getUserLtiRole(req.user)
    };

    // 根據隱私級別添加用戶資訊
    if (tool.privacyLevel === 'name' || tool.privacyLevel === 'public') {
      ltiParams.lis_person_name_given = req.user.firstName || '';
      ltiParams.lis_person_name_family = req.user.lastName || '';
      ltiParams.lis_person_name_full = req.user.displayName || req.user.email;
    }

    if (tool.privacyLevel === 'email' || tool.privacyLevel === 'public') {
      ltiParams.lis_person_contact_email_primary = req.user.email;
    }

    // 課程資訊
    if (courseId) {
      ltiParams.context_id = courseId;
      ltiParams.context_type = 'CourseSection';
      // 可以從資料庫獲取課程名稱
      ltiParams.context_title = 'Course';
    }

    // 平台資訊
    ltiParams.tool_consumer_instance_guid = process.env.LTI_INSTANCE_GUID || 'beyondbridge.edu';
    ltiParams.tool_consumer_instance_name = 'BeyondBridge';
    ltiParams.tool_consumer_instance_description = 'BeyondBridge Education Platform';
    ltiParams.tool_consumer_info_product_family_code = 'beyondbridge';
    ltiParams.tool_consumer_info_version = '1.0';

    // 服務 URL
    if (tool.allowGradePassback) {
      ltiParams.lis_outcome_service_url = `${process.env.BASE_URL || 'http://localhost:3000'}/api/lti/outcomes`;
      ltiParams.lis_result_sourcedid = `${launchId}::${req.user.userId}::${resourceId || ''}`;
    }

    // 自定義參數
    if (tool.customParameters) {
      Object.entries(tool.customParameters).forEach(([key, value]) => {
        ltiParams[`custom_${key}`] = value;
      });
    }

    // 返回 URL
    if (returnUrl) {
      ltiParams.launch_presentation_return_url = returnUrl;
    }

    // 計算 OAuth 簽名
    const signature = generateOAuthSignature(
      'POST',
      tool.toolUrl,
      ltiParams,
      tool.consumerSecret
    );
    ltiParams.oauth_signature = signature;

    // 記錄啟動
    const launchRecord = {
      PK: 'LTI_LAUNCH',
      SK: `LAUNCH#${launchId}`,
      launchId,
      toolId,
      userId: req.user.userId,
      courseId,
      resourceId,
      timestamp: new Date().toISOString(),
      status: 'initiated'
    };

    await putItem(launchRecord);

    res.json({
      success: true,
      data: {
        launchUrl: tool.toolUrl,
        method: 'POST',
        params: ltiParams,
        launchContainer: tool.launchContainer
      }
    });
  } catch (error) {
    console.error('Generate LTI launch error:', error);
    res.status(500).json({
      success: false,
      message: '生成 LTI 啟動請求失敗'
    });
  }
});

/**
 * POST /api/lti/outcomes
 * LTI 成績回傳服務
 */
router.post('/outcomes', async (req, res) => {
  try {
    const { body } = req;

    // 解析 XML 格式的成績回傳請求
    // 注意：實際實作需要 XML 解析庫
    const resultSourcedid = extractFromXml(body, 'sourcedId');
    const score = extractFromXml(body, 'textString');

    if (!resultSourcedid) {
      return res.status(400).send(generateOutcomeResponse('failure', 'Missing sourcedId'));
    }

    // 解析 sourcedId: launchId::userId::resourceId
    const [launchId, userId, resourceId] = resultSourcedid.split('::');

    // 驗證啟動記錄
    const launch = await getItem({
      PK: 'LTI_LAUNCH',
      SK: `LAUNCH#${launchId}`
    });

    if (!launch) {
      return res.status(400).send(generateOutcomeResponse('failure', 'Invalid launch'));
    }

    // 保存成績
    const gradeRecord = {
      PK: `LTI_GRADE#${launch.toolId}`,
      SK: `GRADE#${userId}#${resourceId || 'default'}`,
      userId,
      toolId: launch.toolId,
      resourceId,
      score: parseFloat(score),
      submittedAt: new Date().toISOString()
    };

    await putItem(gradeRecord);

    res.send(generateOutcomeResponse('success', 'Score updated'));
  } catch (error) {
    console.error('LTI outcomes error:', error);
    res.status(500).send(generateOutcomeResponse('failure', 'Internal error'));
  }
});

/**
 * GET /api/lti/tools/:toolId/grades
 * 獲取 LTI 工具的成績記錄
 */
router.get('/tools/:toolId/grades', authMiddleware, async (req, res) => {
  try {
    const { toolId } = req.params;
    const { userId, resourceId, limit = 50 } = req.query;

    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `LTI_GRADE#${toolId}`
      },
      ScanIndexForward: false,
      Limit: parseInt(limit)
    };

    if (userId) {
      params.FilterExpression = 'userId = :userId';
      params.ExpressionAttributeValues[':userId'] = userId;
    }

    if (resourceId) {
      const filterPrefix = params.FilterExpression ? params.FilterExpression + ' AND ' : '';
      params.FilterExpression = filterPrefix + 'resourceId = :resourceId';
      params.ExpressionAttributeValues[':resourceId'] = resourceId;
    }

    const result = await docClient.send(new QueryCommand(params));

    res.json({
      success: true,
      data: result.Items || []
    });
  } catch (error) {
    console.error('Get LTI grades error:', error);
    res.status(500).json({
      success: false,
      message: '獲取成績記錄失敗'
    });
  }
});

/**
 * DELETE /api/lti/tools/:toolId
 * 刪除 LTI 工具
 */
router.delete('/tools/:toolId', adminMiddleware, async (req, res) => {
  try {
    const { toolId } = req.params;

    await updateItem({
      PK: 'LTI_TOOL',
      SK: `TOOL#${toolId}`
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
      message: 'LTI 工具已刪除'
    });
  } catch (error) {
    console.error('Delete LTI tool error:', error);
    res.status(500).json({
      success: false,
      message: '刪除 LTI 工具失敗'
    });
  }
});

/**
 * GET /api/lti/config
 * 獲取 LTI 平台配置（用於向外部工具註冊）
 */
router.get('/config', (req, res) => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  res.json({
    success: true,
    data: {
      platform: {
        name: 'BeyondBridge',
        guid: process.env.LTI_INSTANCE_GUID || 'beyondbridge.edu',
        version: '1.0'
      },
      lti11: {
        launchUrl: `${baseUrl}/api/lti/tools/{tool_id}/launch`,
        outcomesUrl: `${baseUrl}/api/lti/outcomes`
      },
      lti13: {
        issuer: baseUrl,
        authorizationEndpoint: `${baseUrl}/api/lti/authorize`,
        tokenEndpoint: `${baseUrl}/api/lti/token`,
        jwksUri: `${baseUrl}/api/lti/jwks`,
        registrationEndpoint: `${baseUrl}/api/lti/register`
      }
    }
  });
});

// 輔助函數：獲取用戶 LTI 角色
function getUserLtiRole(user) {
  if (user.isAdmin) {
    return 'urn:lti:role:ims/lis/Administrator';
  }
  if (user.role === 'educator' || user.role === 'trainer') {
    return 'urn:lti:role:ims/lis/Instructor';
  }
  return 'urn:lti:role:ims/lis/Learner';
}

// 輔助函數：生成 OAuth 簽名
function generateOAuthSignature(method, url, params, secret) {
  // 排序參數
  const sortedParams = Object.keys(params)
    .filter(k => k !== 'oauth_signature')
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  // 構建基礎字符串
  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&');

  // 生成簽名
  const signingKey = `${encodeURIComponent(secret)}&`;
  const hmac = crypto.createHmac('sha1', signingKey);
  hmac.update(baseString);
  return hmac.digest('base64');
}

// 輔助函數：從 XML 提取值（簡化版）
function extractFromXml(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return match ? match[1] : null;
}

// 輔助函數：生成 LTI Outcome Response
function generateOutcomeResponse(status, message) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeResponse xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader>
    <imsx_POXResponseHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>${Date.now()}</imsx_messageIdentifier>
      <imsx_statusInfo>
        <imsx_codeMajor>${status}</imsx_codeMajor>
        <imsx_severity>status</imsx_severity>
        <imsx_description>${message}</imsx_description>
      </imsx_statusInfo>
    </imsx_POXResponseHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>
    <replaceResultResponse/>
  </imsx_POXBody>
</imsx_POXEnvelopeResponse>`;
}

module.exports = router;
module.exports.LTI_VERSIONS = LTI_VERSIONS;
module.exports.LTI_LAUNCH_TYPES = LTI_LAUNCH_TYPES;
module.exports.LTI_ROLES = LTI_ROLES;
