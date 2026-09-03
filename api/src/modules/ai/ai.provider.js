'use strict';

const logger = require('../../lib/logger');
const { resolveProfile, buildHeaders } = require('./ai.profiles');

/**
 * Forwards an OpenAI-compatible chat completion request upstream, injecting the
 * profile key/URL/model from env. Returns the raw upstream response for the browser.
 * Messages are passed through unchanged (including vision image_url parts).
 */
async function chatCompletion({ task, messages, tools, response_format }) {
  const profile = resolveProfile(task);

  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('messages is required and must be a non-empty array.');
    err.statusCode = 422;
    throw err;
  }

  const body = { model: profile.model, messages };
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  // Pass through optional response_format (e.g. { type: 'json_object' }) for
  // structured extraction. Not all upstreams support it; callers should handle errors.
  if (response_format && typeof response_format === 'object') {
    body.response_format = response_format;
  }

  logger.debug('ai', 'forwarding chat completion', {
    task: profile.task || null,
    profile: profile.name,
    model: profile.model,
    messages: messages.length,
    tools: Array.isArray(tools) ? tools.length : 0,
  });

  const upstream = await fetch(profile.url, {
    method: 'POST',
    headers: buildHeaders(profile),
    body: JSON.stringify(body),
  });

  const text = await upstream.text();

  if (!upstream.ok) {
    const err = new Error(text || `AI request failed with status ${upstream.status}`);
    err.statusCode = upstream.status;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('AI provider returned a non-JSON response.');
    err.statusCode = 502;
    throw err;
  }
}

module.exports = { chatCompletion };
