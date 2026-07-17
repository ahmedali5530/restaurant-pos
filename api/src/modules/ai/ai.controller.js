'use strict';

const { chatCompletion } = require('./ai.provider');
const logger = require('../../lib/logger');

async function createChatCompletion(req, res, next) {
  try {
    const { messages, tools } = req.body || {};
    const data = await chatCompletion({ messages, tools });
    // Return the raw OpenAI-compatible response so the frontend agent can
    // consume it unchanged.
    res.status(200).json(data);
  } catch (err) {
    logger.error('ai', 'chat completion failed', {
      statusCode: err.statusCode,
      message: err.message,
    });
    next(err);
  }
}

module.exports = { createChatCompletion };
