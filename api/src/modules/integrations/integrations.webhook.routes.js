'use strict';

const express = require('express');
const { handleWebhook } = require('./qbo/webhook.controller');
const { handleCallback } = require('./qbo/oauth.controller');

const router = express.Router();

// Webhook route — NO session auth, Intuit signature verification instead
router.post('/qbo/webhooks', handleWebhook);

// OAuth callback — NO session auth, comes from Intuit redirect
router.get('/qbo/oauth/callback', handleCallback);

module.exports = { webhookRouter: router };
