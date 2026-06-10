'use strict';

const express = require('express');
const {
  handleWebhook,
  handleOrderWebhook,
  getWebhookResult,
} = require('../controllers/webhooks.controller');

const router = express.Router();

router.get('/:gateway/:orderKey', getWebhookResult);
router.post('/:gateway/:orderKey', handleOrderWebhook);
router.post('/:gateway', handleWebhook);

module.exports = router;
