'use strict';

const { sendError } = require('../../lib/response');
const logger = require('../../lib/logger');

function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function proxyInvoice(req, res, next) {
  try {
    const { url, bearerToken, payload } = req.body || {};

    if (!isHttpUrl(url)) {
      return sendError(res, 400, 'url must be a valid http(s) URL');
    }
    if (typeof bearerToken !== 'string' || !bearerToken.trim()) {
      return sendError(res, 400, 'bearerToken is required');
    }
    if (payload === undefined || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return sendError(res, 400, 'payload must be a JSON object');
    }

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      logger.error('fiscal', 'upstream fetch failed', {
        message: err && err.message ? err.message : String(err),
        url,
      });
      return sendError(res, 502, err && err.message ? err.message : 'Fiscal authority unreachable');
    }

    const contentType = upstream.headers.get('content-type') || '';
    const raw = await upstream.text();
    let body;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = { message: raw };
      }
    } else {
      body = {};
    }

    logger.info('fiscal', 'upstream response', {
      status: upstream.status,
      contentType,
      ok: upstream.ok,
    });

    res.status(upstream.status).json(body);
  } catch (err) {
    logger.error('fiscal', 'proxy invoice failed', { message: err.message });
    next(err);
  }
}

module.exports = { proxyInvoice };
