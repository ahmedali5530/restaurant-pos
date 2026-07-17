'use strict';

const logger = require('../../lib/logger');

const getConfig = () => ({
  apiUrl: process.env.OPENAI_API_URL || undefined,
  proxyUrl: process.env.OPENAI_PROXY_URL || undefined,
  apiKey: process.env.OPENAI_API_KEY || undefined,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
});

const resolveApiUrl = (config) => config.proxyUrl || config.apiUrl;

const isAzureUrl = (url) => url.includes('openai.azure.com');

const buildHeaders = (url, apiKey) => ({
  'Content-Type': 'application/json',
  ...(isAzureUrl(url)
    ? { 'api-key': apiKey }
    : { Authorization: `Bearer ${apiKey}` }),
});

/**
 * Forwards an OpenAI-compatible chat completion request upstream, injecting the
 * server-side key/URL/model. Returns the raw upstream response for the browser.
 */
async function chatCompletion({ messages, tools }) {
  const config = getConfig();

  if (!config.apiKey) {
    const err = new Error('OpenAI API key is not configured. Set OPENAI_API_KEY in the api service environment.');
    err.statusCode = 500;
    throw err;
  }

  const resolvedUrl = resolveApiUrl(config);
  if (!resolvedUrl) {
    const err = new Error('OpenAI API URL is not configured. Set OPENAI_API_URL or OPENAI_PROXY_URL in the api service environment.');
    err.statusCode = 500;
    throw err;
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('messages is required and must be a non-empty array.');
    err.statusCode = 422;
    throw err;
  }

  const body = { model: config.model, messages };
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  logger.debug('ai', 'forwarding chat completion', {
    model: config.model,
    messages: messages.length,
    tools: Array.isArray(tools) ? tools.length : 0,
  });

  const upstream = await fetch(resolvedUrl, {
    method: 'POST',
    headers: buildHeaders(resolvedUrl, config.apiKey),
    body: JSON.stringify(body),
  });

  const text = await upstream.text();

  if (!upstream.ok) {
    const err = new Error(text || `OpenAI request failed with status ${upstream.status}`);
    err.statusCode = upstream.status;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('OpenAI returned a non-JSON response.');
    err.statusCode = 502;
    throw err;
  }
}

module.exports = { chatCompletion };
