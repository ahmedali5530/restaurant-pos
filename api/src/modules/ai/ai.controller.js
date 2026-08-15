'use strict';

const { chatCompletion } = require('./ai.provider');
const { assertAllowed, recordUse, getUsage } = require('./ai.quota');
const { getPublicConfig } = require('./ai.profiles');
const logger = require('../../lib/logger');

function sendQuotaError(res, err) {
  const details = err.details || {};
  res.status(err.statusCode || 429).json({
    success: false,
    error: err.message,
    code: err.code || details.code,
    daily: details.daily,
    monthly: details.monthly,
  });
}

async function createChatCompletion(req, res, next) {
  try {
    assertAllowed();

    const { task, messages, tools } = req.body || {};
    const data = await chatCompletion({ task, messages, tools });

    await recordUse();

    // Return the raw OpenAI-compatible response so the frontend agent can
    // consume it unchanged.
    res.status(200).json(data);
  } catch (err) {
    logger.error('ai', 'chat completion failed', {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
    });

    if (err.code === 'AI_DISABLED' || err.code === 'AI_DAILY_LIMIT' || err.code === 'AI_MONTHLY_LIMIT') {
      return sendQuotaError(res, err);
    }

    next(err);
  }
}

async function getAiUsage(req, res, next) {
  try {
    const usage = getUsage();
    const config = getPublicConfig();
    res.status(200).json({
      ...usage,
      ...config,
    });
  } catch (err) {
    logger.error('ai', 'usage read failed', { message: err.message });
    next(err);
  }
}

module.exports = { createChatCompletion, getAiUsage };
