'use strict';

const express = require('express');
const {
  handleWebhook,
  handleOrderWebhook,
  getWebhookResult,
} = require('../controllers/webhooks.controller');
const { createSessionAuthMiddleware } = require('../lib/session-auth.middleware');

const router = express.Router();
const requireSession = createSessionAuthMiddleware();

// POS polls stored webhook results — require session JWT
router.get('/:gateway/:orderKey', requireSession, getWebhookResult);
router.post('/:gateway/:orderKey', handleOrderWebhook);
router.post('/:gateway', handleWebhook);

module.exports = router;
