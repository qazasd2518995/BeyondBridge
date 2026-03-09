/**
 * LTI 1.3 Deep Linking
 * BeyondBridge Education Platform
 *
 * 處理 Tool 回傳的 Deep Linking 內容選擇
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { putItem, query } = require('../../utils/db');
const { verifyToolJwt, LTI_CLAIMS } = require('../../utils/lti/jwt');

// Deep Linking Content Types
const DL_CONTENT_TYPES = {
  LTI_RESOURCE_LINK: 'ltiResourceLink',
  LINK: 'link',
  IMAGE: 'image',
  HTML: 'html',
  FILE: 'file'
};

/**
 * POST /api/lti/13/dl/callback
 * 接收 Tool 回傳的 Deep Linking Response
 */
router.post('/callback', async (req, res) => {
  try {
    // 解析請求
    let body = req.body;
    if (typeof body === 'string') {
      body = Object.fromEntries(new URLSearchParams(body));
    }

    const { JWT: jwtToken, id_token } = body;
    const token = jwtToken || id_token;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: 'JWT token is required'
      });
    }

    // 先解碼 payload 取得 issuer（僅用於定位 Tool，不可當作可信資料）
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_JWT',
        message: 'Invalid JWT format'
      });
    }

    let unverifiedPayload;
    try {
      unverifiedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_JWT',
        message: 'Invalid JWT payload'
      });
    }

    const issuerClientId = unverifiedPayload.iss;
    if (!issuerClientId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ISSUER',
        message: 'JWT issuer is required'
      });
    }

    // 根據 issuer 找到對應 Tool，再做 JWT 驗簽
    const tools = await query('LTI_TOOL', { skPrefix: 'TOOL#' });
    const tool = tools.find(t => t.clientId === issuerClientId && t.status !== 'deleted');
    if (!tool) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CLIENT',
        message: 'Unknown tool issuer'
      });
    }

    let payload;
    try {
      payload = await verifyToolJwt(token, tool);
    } catch (verifyError) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({
          success: false,
          error: 'INVALID_SIGNATURE',
          message: 'JWT signature verification failed'
        });
      }
      // 非正式環境保留相容性，避免阻斷本地串接測試
      console.warn('[Deep Linking] JWT verification failed in non-production mode:', verifyError.message);
      payload = unverifiedPayload;
    }

    console.log(`[Deep Linking] Response accepted from tool: ${tool.toolId || issuerClientId}`);

    // 驗證 message type
    const messageType = payload[LTI_CLAIMS.MESSAGE_TYPE] ||
      payload['https://purl.imsglobal.org/spec/lti-dl/claim/msg'];

    if (messageType !== 'LtiDeepLinkingResponse') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MESSAGE_TYPE',
        message: 'Expected LtiDeepLinkingResponse'
      });
    }

    // 提取 content items
    const contentItemsRaw = payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'];
    const contentItems = Array.isArray(contentItemsRaw) ? contentItemsRaw : [];

    // 提取 data（包含 courseId 和 toolId）
    let contextData = {};
    const dataStr = payload['https://purl.imsglobal.org/spec/lti-dl/claim/data'];
    if (dataStr) {
      try {
        contextData = JSON.parse(dataStr);
      } catch (e) {
        console.warn('[Deep Linking] Could not parse data:', dataStr);
      }
    }

    const { courseId, toolId } = contextData;
    if (toolId && tool.toolId && toolId !== tool.toolId) {
      return res.status(400).json({
        success: false,
        error: 'TOOL_MISMATCH',
        message: 'Tool context does not match token issuer'
      });
    }
    const resolvedToolId = tool.toolId || toolId;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CONTEXT',
        message: 'Course ID not found in context data'
      });
    }

    // 處理每個 content item
    const savedItems = [];
    const now = new Date().toISOString();

    for (const item of contentItems) {
      const resourceId = uuidv4();

      const resource = {
        PK: `COURSE#${courseId}`,
        SK: `RESOURCE#${resourceId}`,
        entityType: 'COURSE_RESOURCE',
        resourceId,
        courseId,
        toolId: resolvedToolId,
        type: item.type || DL_CONTENT_TYPES.LTI_RESOURCE_LINK,
        title: item.title || item.text || 'Untitled Resource',
        text: item.text,
        url: item.url,
        icon: item.icon,
        thumbnail: item.thumbnail,
        // LTI Resource Link 特有欄位
        ...(item.type === DL_CONTENT_TYPES.LTI_RESOURCE_LINK && {
          ltiResourceLink: {
            url: item.url,
            custom: item.custom,
            lineItem: item.lineItem
          }
        }),
        // 原始 item 資料
        originalItem: item,
        source: 'deep_linking',
        status: 'active',
        createdAt: now,
        updatedAt: now
      };

      try {
        await putItem(resource);
        savedItems.push({
          resourceId,
          title: resource.title,
          type: resource.type,
          url: resource.url
        });
        console.log(`[Deep Linking] Saved resource: ${resource.title}`);
      } catch (saveError) {
        console.error('[Deep Linking] Save error:', saveError);
      }
    }

    // 檢查是否有錯誤訊息
    const errorMsg = payload['https://purl.imsglobal.org/spec/lti-dl/claim/errormsg'];
    const errorLog = payload['https://purl.imsglobal.org/spec/lti-dl/claim/errorlog'];

    if (errorMsg) {
      console.warn('[Deep Linking] Tool reported error:', errorMsg);
    }

    // 回傳成功頁面（會被嵌入 iframe 或新視窗中）
    const successHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>內容已新增</title>
  <style>
    body {
      font-family: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h2 { margin-bottom: 10px; }
    p { opacity: 0.8; margin-bottom: 20px; }
    .items {
      text-align: left;
      background: rgba(255,255,255,0.1);
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .item {
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.2);
    }
    .item:last-child { border-bottom: none; }
    button {
      background: white;
      color: #667eea;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      font-weight: bold;
    }
    button:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h2>內容已成功新增</h2>
    <p>已將 ${savedItems.length} 個項目新增到課程</p>
    ${savedItems.length > 0 ? `
    <div class="items">
      ${savedItems.map(item => `
        <div class="item">📚 ${item.title}</div>
      `).join('')}
    </div>
    ` : ''}
    <button onclick="window.close(); if(window.opener) window.opener.location.reload();">
      關閉並返回
    </button>
  </div>
  <script>
    // 通知父視窗（如果在 iframe 中）
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'lti_deep_linking_complete',
        items: ${JSON.stringify(savedItems)}
      }, '*');
    }
  </script>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(successHtml);

  } catch (error) {
    console.error('[Deep Linking] Callback error:', error);
    res.status(500).json({
      success: false,
      error: 'CALLBACK_ERROR',
      message: 'Failed to process deep linking response'
    });
  }
});

/**
 * GET /api/lti/13/dl/resources/:courseId
 * 取得課程的 Deep Linking 資源
 */
router.get('/resources/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;

    const resources = await query(`COURSE#${courseId}`, {
      skPrefix: 'RESOURCE#'
    });

    // 過濾 Deep Linking 來源的資源
    const dlResources = resources.filter(r => r.source === 'deep_linking');

    res.json({
      success: true,
      data: dlResources.map(r => ({
        resourceId: r.resourceId,
        title: r.title,
        type: r.type,
        url: r.url,
        icon: r.icon,
        status: r.status,
        createdAt: r.createdAt
      }))
    });

  } catch (error) {
    console.error('[Deep Linking] Get resources error:', error);
    res.status(500).json({
      success: false,
      error: 'GET_RESOURCES_ERROR',
      message: 'Failed to get deep linking resources'
    });
  }
});

module.exports = router;
