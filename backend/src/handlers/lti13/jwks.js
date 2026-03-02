/**
 * LTI 1.3 JWKS 端點
 * BeyondBridge Education Platform
 *
 * 提供平台的公鑰供 LTI Tools 驗證 JWT 簽名
 */

const express = require('express');
const router = express.Router();
const { generateJWKS, getPlatformConfig, rotateKeysIfNeeded } = require('../../utils/lti/keys');

/**
 * GET /api/lti/13/jwks
 * 回傳平台的 JWKS (JSON Web Key Set)
 *
 * 這是公開端點，不需要認證
 * LTI Tools 使用此端點驗證平台簽發的 JWT
 */
router.get('/jwks', async (req, res) => {
  try {
    // 檢查是否需要金鑰輪替
    await rotateKeysIfNeeded();

    // 生成 JWKS
    const jwks = await generateJWKS();

    // 設置快取標頭（建議快取 1 小時，但可能隨時更新）
    res.set({
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json'
    });

    res.json(jwks);
  } catch (error) {
    console.error('[LTI 1.3] JWKS error:', error);
    res.status(500).json({
      success: false,
      error: 'JWKS_ERROR',
      message: 'Failed to generate JWKS'
    });
  }
});

/**
 * GET /api/lti/13/.well-known/openid-configuration
 * OpenID Connect Discovery 端點
 *
 * 提供平台的 OIDC 配置資訊
 */
router.get('/.well-known/openid-configuration', async (req, res) => {
  try {
    const config = getPlatformConfig();

    res.set({
      'Cache-Control': 'public, max-age=86400',
      'Content-Type': 'application/json'
    });

    res.json(config);
  } catch (error) {
    console.error('[LTI 1.3] OpenID config error:', error);
    res.status(500).json({
      success: false,
      error: 'CONFIG_ERROR',
      message: 'Failed to get OpenID configuration'
    });
  }
});

/**
 * GET /api/lti/13/config
 * 平台 LTI 1.3 配置端點
 *
 * 提供完整的平台配置資訊供 Tool 註冊使用
 */
router.get('/config', async (req, res) => {
  try {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const config = getPlatformConfig();

    const fullConfig = {
      ...config,
      platform: {
        name: 'BeyondBridge',
        guid: config.issuer,
        contact_email: process.env.ADMIN_EMAIL || 'admin@beyondbridge.edu',
        description: 'BeyondBridge Learning Management System',
        version: '1.0'
      },
      lti_versions: ['1.1', '1.3'],
      capabilities: {
        deep_linking: true,
        assignment_and_grades: true,
        names_and_roles: true,
        dynamic_registration: false // 未來支援
      },
      messages_supported: [
        { type: 'LtiResourceLinkRequest' },
        { type: 'LtiDeepLinkingRequest' }
      ]
    };

    res.json({
      success: true,
      data: fullConfig
    });
  } catch (error) {
    console.error('[LTI 1.3] Config error:', error);
    res.status(500).json({
      success: false,
      error: 'CONFIG_ERROR',
      message: 'Failed to get platform configuration'
    });
  }
});

module.exports = router;
