/**
 * LTI 1.3 Token Endpoint
 * BeyondBridge Education Platform
 *
 * OAuth 2.0 Client Credentials flow
 * 為 LTI Tools 發放 Access Token 以存取 AGS/NRPS 服務
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query, putItem } = require('../../utils/db');
const { createServiceAccessToken, verifyServiceAccessToken } = require('../../utils/lti/jwt');

// 支援的 scopes
const SUPPORTED_SCOPES = [
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'
];

/**
 * POST /api/lti/13/token
 * OAuth 2.0 Token Endpoint
 *
 * 支援 client_credentials grant type
 */
router.post('/token', async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';

    // 解析請求（支援 form-urlencoded 和 JSON）
    let params = req.body || {};
    if (typeof params === 'string') {
      params = Object.fromEntries(new URLSearchParams(params));
    }

    const {
      grant_type,
      client_id,
      client_secret,
      scope,
      client_assertion,
      client_assertion_type
    } = params;

    if (!client_id) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'client_id is required'
      });
    }

    // 驗證 grant_type
    if (grant_type !== 'client_credentials') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only client_credentials grant type is supported'
      });
    }

    // 查找 Tool
    let tool = null;

    if (client_id) {
      // 使用 client_id 查找
      try {
        const tools = await query('LTI_TOOL', { skPrefix: 'TOOL#' });
        tool = tools.find(t => t.clientId === client_id && t.status !== 'deleted');
      } catch (dbError) {
        console.warn('[Token] Database query failed, using dev mode fallback');
        // 開發模式：如果資料庫不可用，使用模擬工具
        if (process.env.NODE_ENV !== 'production') {
          tool = {
            toolId: 'dev_tool',
            clientId: client_id,
            name: 'Development Tool',
            status: 'active',
            services: { ags: { enabled: true }, nrps: { enabled: true } },
            allowGradePassback: true,
            allowMembershipService: true
          };
        }
      }
    }

    if (!tool) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Unknown client'
      });
    }

    const hasClientAssertion = !!client_assertion;
    const hasClientSecret = !!client_secret;

    // 驗證客戶端（支援 client_secret 或 client_assertion）
    if (hasClientAssertion) {
      if (client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Unsupported client_assertion_type'
        });
      }

      // TODO: 實作 JWT client assertion 驗證（使用 Tool 公鑰驗簽）
      if (isProduction) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'JWT client assertion authentication is not enabled'
        });
      }
      console.warn('[Token] JWT client assertion accepted in non-production mode');
    } else if (hasClientSecret) {
      // Secret-based authentication
      if (!tool.consumerSecret) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Client secret authentication is not configured for this tool'
        });
      }
      if (tool.consumerSecret !== client_secret) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client credentials'
        });
      }
    } else {
      if (isProduction) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Client authentication is required'
        });
      }
      // 非正式環境允許無認證，避免阻斷本地開發流程
      console.warn('[Token] No client authentication provided - non-production mode');
    }

    // 解析請求的 scopes
    const requestedScopes = scope ? scope.split(' ') : [];

    // 驗證 scopes
    const validScopes = requestedScopes.filter(s => SUPPORTED_SCOPES.includes(s));

    // 檢查 tool 是否啟用了請求的服務
    const grantedScopes = validScopes.filter(s => {
      if (s.includes('lti-ags') && !tool.services?.ags?.enabled && !tool.allowGradePassback) {
        return false;
      }
      if (s.includes('lti-nrps') && !tool.services?.nrps?.enabled && !tool.allowMembershipService) {
        return false;
      }
      return true;
    });

    if (grantedScopes.length === 0 && requestedScopes.length > 0) {
      return res.status(400).json({
        error: 'invalid_scope',
        error_description: 'None of the requested scopes are available'
      });
    }

    const effectiveScopes = grantedScopes.length > 0
      ? grantedScopes
      : SUPPORTED_SCOPES.slice(0, 4); // 預設 AGS scopes

    // 生成 access token
    const tokenResult = await createServiceAccessToken({
      tool,
      scopes: effectiveScopes
    });

    // 儲存 token 記錄（用於撤銷）
    const tokenHash = crypto.createHash('sha256').update(tokenResult.access_token).digest('hex').substring(0, 32);
    const tokenRecord = {
      PK: 'LTI_TOKEN',
      SK: `TOKEN#${tokenHash}`,
      entityType: 'LTI_ACCESS_TOKEN',
      tokenHash,
      toolId: tool.toolId,
      clientId: tool.clientId,
      scopes: effectiveScopes,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + tokenResult.expires_in * 1000).toISOString(),
      ttl: Math.floor(Date.now() / 1000) + tokenResult.expires_in + 3600 // 額外保留 1 小時
    };

    try {
      await putItem(tokenRecord);
    } catch (dbError) {
      console.warn('[Token] Could not save token record:', dbError.message);
      // 繼續執行，token 仍然有效
    }

    // 回傳 token
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');

    res.json({
      access_token: tokenResult.access_token,
      token_type: tokenResult.token_type,
      expires_in: tokenResult.expires_in,
      scope: effectiveScopes.join(' ')
    });

  } catch (error) {
    console.error('[LTI 1.3] Token error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to generate access token'
    });
  }
});

/**
 * Token 驗證中間件
 * 用於保護 AGS/NRPS 端點
 */
async function tokenAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing or invalid Authorization header'
      });
    }

    const token = authHeader.substring(7);

    // 驗證 token
    const payload = await verifyServiceAccessToken(token);

    // 將 token 資訊附加到請求
    req.ltiToken = payload;
    req.toolId = payload.tool_id;
    req.tokenScopes = payload.scope ? payload.scope.split(' ') : [];

    next();
  } catch (error) {
    console.error('[Token Auth] Verification failed:', error.message);
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token validation failed: ' + error.message
    });
  }
}

/**
 * Scope 檢查中間件工廠
 */
function requireScope(requiredScope) {
  return (req, res, next) => {
    if (!req.tokenScopes || !req.tokenScopes.includes(requiredScope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Required scope: ${requiredScope}`
      });
    }
    next();
  };
}

module.exports = router;
module.exports.tokenAuthMiddleware = tokenAuthMiddleware;
module.exports.requireScope = requireScope;
