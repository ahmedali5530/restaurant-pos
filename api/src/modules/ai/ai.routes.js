'use strict';

const express = require('express');
const { createChatCompletion } = require('./ai.controller');

const router = express.Router();

router.post('/chat/completions', createChatCompletion);

module.exports = router;
