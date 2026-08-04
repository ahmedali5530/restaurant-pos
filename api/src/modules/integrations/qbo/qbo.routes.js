'use strict';

const express = require('express');
const { startOAuth, disconnect, refreshAccessToken } = require('./oauth.controller');
const { proxyRequest, getConnectionStatus, listCompanies } = require('./qbo.proxy.controller');

const router = express.Router();

// OAuth flow (needs session JWT, applied by parent route)
router.post('/oauth/start', startOAuth);
// OAuth callback is mounted without session auth in integrations.webhook.routes.js
router.post('/oauth/disconnect', disconnect);
router.post('/oauth/refresh', refreshAccessToken);

// Status (session JWT)
router.get('/status/:realmId', getConnectionStatus);
router.get('/companies', listCompanies);

// API proxy (session JWT)
router.post('/proxy', proxyRequest);

module.exports = router;
