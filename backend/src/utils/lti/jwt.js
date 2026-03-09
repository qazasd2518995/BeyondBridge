/**
 * LTI 1.3 JWT 工具模組
 * BeyondBridge Education Platform
 *
 * 處理 LTI 1.3 JWT 的建立、簽名和驗證
 */

const { SignJWT, jwtVerify, createRemoteJWKSet, importPKCS8 } = require('jose');
const crypto = require('crypto');
const { getCurrentSigningKey, getKeyById, PLATFORM_ISSUER } = require('./keys');
const { putItem, getItem, deleteItem } = require('../db');

// LTI 1.3 Message Types
const LTI_MESSAGE_TYPES = {
  RESOURCE_LINK: 'LtiResourceLinkRequest',
  DEEP_LINKING: 'LtiDeepLinkingRequest',
  SUBMISSION_REVIEW: 'LtiSubmissionReviewRequest'
};

// LTI 1.3 Role URIs
const LTI_ROLES = {
  LEARNER: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
  INSTRUCTOR: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
  CONTENT_DEVELOPER: 'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
  MENTOR: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor',
  ADMIN: 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator'
};

// LTI Claim Namespaces
const LTI_CLAIMS = {
  MESSAGE_TYPE: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  VERSION: 'https://purl.imsglobal.org/spec/lti/claim/version',
  DEPLOYMENT_ID: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  TARGET_LINK_URI: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  RESOURCE_LINK: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  ROLES: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  CONTEXT: 'https://purl.imsglobal.org/spec/lti/claim/context',
  PLATFORM: 'https://purl.imsglobal.org/spec/lti/claim/tool_platform',
  LAUNCH_PRESENTATION: 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
  CUSTOM: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  AGS_ENDPOINT: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  NRPS_ENDPOINT: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
  DEEP_LINKING_SETTINGS: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'
};

/**
 * 生成隨機 nonce
 */
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 生成隨機 state
 */
function generateState() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * 儲存 OIDC state 到 DynamoDB
 */
async function saveOidcState(stateData) {
  const ttlSeconds = 5 * 60; // 5 分鐘過期
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const item = {
    PK: 'LTI_STATE',
    SK: `STATE#${stateData.state}`,
    entityType: 'LTI_STATE',
    ...stateData,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttl: Math.floor(expiresAt.getTime() / 1000)
  };

  await putItem(item);
  return item;
}

/**
 * 取得並驗證 OIDC state
 */
async function getAndValidateState(state) {
  const item = await getItem('LTI_STATE', `STATE#${state}`);

  if (!item) {
    throw new Error('Invalid or expired state');
  }

  const now = new Date();
  if (new Date(item.expiresAt) < now) {
    await deleteItem('LTI_STATE', `STATE#${state}`);
    throw new Error('State has expired');
  }

  return item;
}

/**
 * 消費 state（取得後刪除，防止重放）
 */
async function consumeState(state) {
  const stateData = await getAndValidateState(state);
  await deleteItem('LTI_STATE', `STATE#${state}`);
  return stateData;
}

/**
 * 將用戶角色轉換為 LTI 角色 URI
 */
function mapUserRoleToLti(user) {
  const roles = [];

  if (user.isAdmin) {
    roles.push(LTI_ROLES.ADMIN);
    roles.push(LTI_ROLES.INSTRUCTOR);
  } else if (user.role === 'educator' || user.role === 'trainer' || user.role === 'teacher') {
    roles.push(LTI_ROLES.INSTRUCTOR);
  } else {
    roles.push(LTI_ROLES.LEARNER);
  }

  return roles;
}

/**
 * 建立 LTI 1.3 Resource Link Launch JWT
 */
async function createResourceLinkJwt(options) {
  const {
    tool,
    user,
    course,
    resourceLink,
    customParams = {},
    includeAgs = true,
    includeNrps = false
  } = options;

  const signingKey = await getCurrentSigningKey();
  const privateKey = await importPKCS8(signingKey.privateKey, 'RS256');

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const nonce = generateNonce();
  const now = Math.floor(Date.now() / 1000);

  // 基本 claims
  const claims = {
    // OIDC 標準 claims
    iss: PLATFORM_ISSUER,
    sub: user.userId,
    aud: tool.clientId,
    exp: now + 3600, // 1 小時
    iat: now,
    nonce: nonce,

    // 用戶資訊（根據隱私設定）
    ...(tool.privacyLevel !== 'anonymous' && {
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      given_name: user.firstName,
      family_name: user.lastName
    }),
    ...((['email', 'public'].includes(tool.privacyLevel)) && {
      email: user.email
    }),

    // LTI 1.3 claims
    [LTI_CLAIMS.MESSAGE_TYPE]: LTI_MESSAGE_TYPES.RESOURCE_LINK,
    [LTI_CLAIMS.VERSION]: '1.3.0',
    [LTI_CLAIMS.DEPLOYMENT_ID]: tool.deploymentId,
    [LTI_CLAIMS.TARGET_LINK_URI]: tool.targetLinkUri || tool.toolUrl,

    // Resource Link
    [LTI_CLAIMS.RESOURCE_LINK]: {
      id: resourceLink?.id || `resource_${course?.courseId || 'default'}`,
      title: resourceLink?.title || tool.name,
      description: resourceLink?.description
    },

    // Roles
    [LTI_CLAIMS.ROLES]: mapUserRoleToLti(user),

    // Context (課程)
    ...(course && {
      [LTI_CLAIMS.CONTEXT]: {
        id: course.courseId,
        label: course.code || course.courseId,
        title: course.title || course.name,
        type: ['CourseOffering']
      }
    }),

    // Platform info
    [LTI_CLAIMS.PLATFORM]: {
      guid: PLATFORM_ISSUER,
      name: 'BeyondBridge',
      version: '1.0',
      product_family_code: 'beyondbridge'
    },

    // Launch presentation
    [LTI_CLAIMS.LAUNCH_PRESENTATION]: {
      document_target: tool.launchContainer === 'embed' ? 'iframe' : 'window',
      return_url: `${baseUrl}/platform`,
      locale: user.locale || 'zh-TW'
    },

    // Custom parameters
    ...(Object.keys(customParams).length > 0 && {
      [LTI_CLAIMS.CUSTOM]: customParams
    })
  };

  // AGS (Assignment and Grade Services)
  if (includeAgs && tool.services?.ags?.enabled) {
    claims[LTI_CLAIMS.AGS_ENDPOINT] = {
      scope: [
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score'
      ],
      lineitems: `${baseUrl}/api/lti/13/ags/courses/${course?.courseId || 'default'}/lineitems`
    };
  }

  // NRPS (Names and Role Provisioning Services)
  if (includeNrps && tool.services?.nrps?.enabled && course) {
    claims[LTI_CLAIMS.NRPS_ENDPOINT] = {
      context_memberships_url: `${baseUrl}/api/lti/13/nrps/courses/${course.courseId}/memberships`,
      service_versions: ['2.0']
    };
  }

  // 簽名並建立 JWT
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: signingKey.keyId, typ: 'JWT' })
    .sign(privateKey);

  return { jwt, nonce };
}

/**
 * 建立 Deep Linking Launch JWT
 */
async function createDeepLinkingJwt(options) {
  const {
    tool,
    user,
    course,
    returnUrl,
    acceptTypes = ['ltiResourceLink'],
    acceptPresentationDocumentTargets = ['iframe', 'window'],
    acceptMultiple = true
  } = options;

  const signingKey = await getCurrentSigningKey();
  const privateKey = await importPKCS8(signingKey.privateKey, 'RS256');

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const nonce = generateNonce();
  const now = Math.floor(Date.now() / 1000);

  const claims = {
    iss: PLATFORM_ISSUER,
    sub: user.userId,
    aud: tool.clientId,
    exp: now + 3600,
    iat: now,
    nonce: nonce,

    ...(tool.privacyLevel !== 'anonymous' && {
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim()
    }),

    [LTI_CLAIMS.MESSAGE_TYPE]: LTI_MESSAGE_TYPES.DEEP_LINKING,
    [LTI_CLAIMS.VERSION]: '1.3.0',
    [LTI_CLAIMS.DEPLOYMENT_ID]: tool.deploymentId,
    [LTI_CLAIMS.TARGET_LINK_URI]: tool.deepLinkingUrl || tool.toolUrl,

    [LTI_CLAIMS.ROLES]: mapUserRoleToLti(user),

    ...(course && {
      [LTI_CLAIMS.CONTEXT]: {
        id: course.courseId,
        label: course.code || course.courseId,
        title: course.title || course.name,
        type: ['CourseOffering']
      }
    }),

    [LTI_CLAIMS.PLATFORM]: {
      guid: PLATFORM_ISSUER,
      name: 'BeyondBridge',
      version: '1.0'
    },

    [LTI_CLAIMS.DEEP_LINKING_SETTINGS]: {
      deep_link_return_url: returnUrl || `${baseUrl}/api/lti/13/dl/callback`,
      accept_types: acceptTypes,
      accept_presentation_document_targets: acceptPresentationDocumentTargets,
      accept_multiple: acceptMultiple,
      auto_create: true,
      data: JSON.stringify({ courseId: course?.courseId, toolId: tool.toolId })
    }
  };

  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: signingKey.keyId, typ: 'JWT' })
    .sign(privateKey);

  return { jwt, nonce };
}

/**
 * 驗證來自 Tool 的 JWT（用於 Deep Linking response 等）
 */
async function verifyToolJwt(token, tool) {
  if (!tool.publicKeysetUrl && !tool.publicKey) {
    throw new Error('Tool public key not configured');
  }

  let publicKey;

  if (tool.publicKeysetUrl) {
    // 從 JWKS 端點取得公鑰
    const JWKS = createRemoteJWKSet(new URL(tool.publicKeysetUrl));
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: tool.clientId,
      audience: PLATFORM_ISSUER
    });
    return payload;
  } else {
    // 使用直接提供的公鑰
    const { importSPKI } = require('jose');
    publicKey = await importSPKI(tool.publicKey, 'RS256');
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: tool.clientId,
      audience: PLATFORM_ISSUER
    });
    return payload;
  }
}

/**
 * 建立 OAuth 2.0 Access Token（用於 AGS/NRPS）
 */
async function createServiceAccessToken(options) {
  const { tool, scopes, courseId } = options;

  const signingKey = await getCurrentSigningKey();
  const privateKey = await importPKCS8(signingKey.privateKey, 'RS256');

  const now = Math.floor(Date.now() / 1000);
  const tokenId = crypto.randomBytes(16).toString('hex');

  const claims = {
    iss: PLATFORM_ISSUER,
    sub: tool.clientId,
    aud: tool.clientId,
    iat: now,
    exp: now + 3600, // 1 小時
    jti: tokenId,
    scope: scopes.join(' '),
    // 自訂 claims
    tool_id: tool.toolId,
    ...(courseId && { course_id: courseId })
  };

  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: signingKey.keyId, typ: 'at+jwt' })
    .sign(privateKey);

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: scopes.join(' ')
  };
}

/**
 * 驗證 Service Access Token
 */
async function verifyServiceAccessToken(token) {
  const signingKey = await getCurrentSigningKey();
  const { importSPKI } = require('jose');
  const publicKey = await importSPKI(signingKey.publicKey, 'RS256');

  const { payload } = await jwtVerify(token, publicKey, {
    issuer: PLATFORM_ISSUER
  });

  return payload;
}

module.exports = {
  LTI_MESSAGE_TYPES,
  LTI_ROLES,
  LTI_CLAIMS,
  generateNonce,
  generateState,
  saveOidcState,
  getAndValidateState,
  consumeState,
  mapUserRoleToLti,
  createResourceLinkJwt,
  createDeepLinkingJwt,
  verifyToolJwt,
  createServiceAccessToken,
  verifyServiceAccessToken
};
