/**
 * LTI 1.3 路由聚合模組
 * BeyondBridge Education Platform
 *
 * 整合所有 LTI 1.3 相關的路由
 */

const express = require('express');
const router = express.Router();

// 匯入子路由
const jwksRouter = require('./jwks');
const oidcRouter = require('./oidc');
const toolProxyRouter = require('./tool-proxy');
const tokenRouter = require('./token');
const agsRouter = require('./ags');
const deepLinkingRouter = require('./deep-linking');

// JWKS 和 OpenID 配置（公開端點）
router.use('/', jwksRouter);

// OIDC 認證流程
router.use('/', oidcRouter);

// Tool Proxy（進度同步）
router.use('/', toolProxyRouter);

// Token Endpoint（OAuth 2.0）
router.use('/', tokenRouter);

// AGS（Assignment and Grade Services）
router.use('/ags', agsRouter);

// Deep Linking
router.use('/dl', deepLinkingRouter);

// 未來可添加:
// const nrpsRouter = require('./nrps');
// router.use('/nrps', nrpsRouter);

module.exports = router;
