'use strict';

const express = require('express');
const { createChatCompletion, createWebSearch, getAiUsage } = require('./ai.controller');

const router = express.Router();

router.get('/usage', getAiUsage);
router.post('/chat/completions', createChatCompletion);
router.post('/web-search', createWebSearch);

module.exports = router;
