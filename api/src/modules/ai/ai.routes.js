'use strict';

const express = require('express');
const { createChatCompletion, getAiUsage } = require('./ai.controller');

const router = express.Router();

router.get('/usage', getAiUsage);
router.post('/chat/completions', createChatCompletion);

module.exports = router;
