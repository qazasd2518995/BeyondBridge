/**
 * LTI 1.3 OIDC 認證流程
 * BeyondBridge Education Platform
 *
 * 處理 LTI 1.3 的 OIDC 登入啟動和授權流程
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authMiddleware } = require('../../utils/auth');
const { getItem, query } = require('../../utils/db');
const {
  generateState,
  generateNonce,
  saveOidcState,
  consumeState,
  createResourceLinkJwt,
  createDeepLinkingJwt,
  LTI_MESSAGE_TYPES
} = require('../../utils/lti/jwt');

/**
 * POST /api/lti/13/initiate
 * 啟動 LTI 1.3 OIDC 登入流程
 *
 * 這是從 BeyondBridge 啟動外部工具的起點
 * 需要已認證的用戶
 */
router.post('/initiate', authMiddleware, async (req, res) => {
  try {
    const {
      toolId,
      courseId,
      resourceId,
      resourceTitle,
      messageType = 'LtiResourceLinkRequest',
      customParams = {}
    } = req.body;

    if (!toolId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOOL_ID',
        message: 'Tool ID is required'
      });
    }

    // 取得 Tool 配置
    const tool = await getItem('LTI_TOOL', `TOOL#${toolId}`);
    if (!tool || tool.status === 'deleted') {
      return res.status(404).json({
        success: false,
        error: 'TOOL_NOT_FOUND',
        message: 'Tool not found'
      });
    }

    // 驗證是 LTI 1.3 工具
    if (tool.ltiVersion !== '1.3' && tool.version !== '1.3') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_LTI_VERSION',
        message: 'This tool is not configured for LTI 1.3'
      });
    }

    // 檢查必要的 LTI 1.3 配置
    if (!tool.oidcLoginUrl) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_OIDC_CONFIG',
        message: 'Tool OIDC login URL not configured'
      });
    }

    // 取得課程資訊（如果有）
    let course = null;
    if (courseId) {
      course = await getItem(`COURSE#${courseId}`, 'INFO');
    }

    // 生成 OIDC 狀態參數
    const state = generateState();
    const nonce = generateNonce();

    // 儲存狀態（用於後續驗證）
    await saveOidcState({
      state,
      nonce,
      toolId,
      userId: req.user.userId,
      courseId: courseId || null,
      resourceId: resourceId || null,
      resourceTitle: resourceTitle || tool.name,
      messageType,
      customParams,
      targetLinkUri: tool.targetLinkUri || tool.toolUrl
    });

    // 構建 OIDC 登入初始化請求參數
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const loginParams = new URLSearchParams({
      iss: process.env.LTI_PLATFORM_ISSUER || 'https://beyondbridge.edu',
      target_link_uri: tool.targetLinkUri || tool.toolUrl,
      login_hint: req.user.userId,
      lti_message_hint: JSON.stringify({
        courseId,
        resourceId,
        messageType
      }),
      client_id: tool.clientId,
      lti_deployment_id: tool.deploymentId
    });

    // 回傳 OIDC 登入 URL（前端將重導向用戶到此 URL）
    const oidcLoginUrl = `${tool.oidcLoginUrl}?${loginParams.toString()}`;

    res.json({
      success: true,
      data: {
        oidcLoginUrl,
        state,
        // 也提供分離的參數，讓前端可以選擇如何處理
        loginParams: {
          iss: process.env.LTI_PLATFORM_ISSUER || 'https://beyondbridge.edu',
          target_link_uri: tool.targetLinkUri || tool.toolUrl,
          login_hint: req.user.userId,
          client_id: tool.clientId,
          lti_deployment_id: tool.deploymentId
        },
        toolLoginUrl: tool.oidcLoginUrl
      }
    });

  } catch (error) {
    console.error('[LTI 1.3] Initiate error:', error);
    res.status(500).json({
      success: false,
      error: 'INITIATE_ERROR',
      message: 'Failed to initiate LTI launch'
    });
  }
});

/**
 * GET/POST /api/lti/13/authorize
 * OIDC 授權端點
 *
 * Tool 在收到登入初始化後，會將用戶重導向到此端點
 * 我們驗證請求並發放 ID Token (JWT)
 */
router.all('/authorize', async (req, res) => {
  try {
    // 支援 GET 和 POST
    const params = req.method === 'GET' ? req.query : req.body;

    const {
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      nonce: clientNonce,
      login_hint,
      lti_message_hint
    } = params;

    // 驗證必要參數
    if (!client_id || !redirect_uri || !state) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMS',
        message: 'Missing required parameters'
      });
    }

    // 驗證 response_type
    if (response_type !== 'id_token') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RESPONSE_TYPE',
        message: 'Only id_token response type is supported'
      });
    }

    // 查找 Tool
    const tools = await query('LTI_TOOL', { skPrefix: 'TOOL#' });
    const tool = tools.find(t =>
      t.clientId === client_id &&
      t.status !== 'deleted'
    );

    if (!tool) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CLIENT',
        message: 'Unknown client_id'
      });
    }

    // 驗證 redirect_uri（如果有配置）
    if (tool.redirectUris && tool.redirectUris.length > 0) {
      if (!tool.redirectUris.includes(redirect_uri)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_REDIRECT_URI',
          message: 'Redirect URI not registered'
        });
      }
    }

    // 解析 lti_message_hint
    let messageHint = {};
    if (lti_message_hint) {
      try {
        messageHint = JSON.parse(lti_message_hint);
      } catch (e) {
        // 忽略解析錯誤
      }
    }

    // 取得用戶資訊
    const userId = login_hint;
    const user = await getItem(`USER#${userId}`, 'PROFILE');
    if (!user) {
      // 嘗試查找管理員
      const admin = await getItem(`ADMIN#${userId}`, 'PROFILE');
      if (!admin) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_USER',
          message: 'User not found'
        });
      }
      user = { ...admin, isAdmin: true };
    }

    // 取得課程資訊
    let course = null;
    if (messageHint.courseId) {
      course = await getItem(`COURSE#${messageHint.courseId}`, 'INFO');
    }

    // 決定 message type
    const messageType = messageHint.messageType || 'LtiResourceLinkRequest';

    // 建立 JWT
    let jwtResult;
    if (messageType === LTI_MESSAGE_TYPES.DEEP_LINKING) {
      jwtResult = await createDeepLinkingJwt({
        tool,
        user,
        course,
        returnUrl: `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/api/lti/dl/callback`
      });
    } else {
      jwtResult = await createResourceLinkJwt({
        tool,
        user,
        course,
        resourceLink: {
          id: messageHint.resourceId || `resource_${tool.toolId}`,
          title: tool.name
        },
        customParams: messageHint.customParams || {}
      });
    }

    // 使用 form_post 回傳 ID Token
    const formHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>LTI Launch</title>
</head>
<body onload="document.forms[0].submit()">
  <form method="POST" action="${escapeHtml(redirect_uri)}">
    <input type="hidden" name="id_token" value="${jwtResult.jwt}" />
    <input type="hidden" name="state" value="${escapeHtml(state)}" />
    <noscript>
      <p>JavaScript is disabled. Please click the button to continue.</p>
      <button type="submit">Continue</button>
    </noscript>
  </form>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(formHtml);

  } catch (error) {
    console.error('[LTI 1.3] Authorize error:', error);
    res.status(500).json({
      success: false,
      error: 'AUTHORIZE_ERROR',
      message: 'Failed to authorize LTI launch'
    });
  }
});

/**
 * HTML 跳脫函數
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

module.exports = router;
