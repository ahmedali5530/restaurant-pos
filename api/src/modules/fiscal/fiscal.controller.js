'use strict';

const { sendError } = require('../../lib/response');
const logger = require('../../lib/logger');

/** Strip BOM / zero-width chars that often sneak in from copy-paste. */
function stripInvisible(value) {
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();
}

function normalizeUpstreamUrl(raw) {
  if (raw == null) return '';
  let value = stripInvisible(raw);
  // Common paste: "https://..." or 'https://...'
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = stripInvisible(value.slice(1, -1));
  }
  return value;
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function pickUpstreamUrl(body) {
  if (!body || typeof body !== 'object') return '';
  // Accept several aliases — clients / manual tests may use any of these.
  return normalizeUpstreamUrl(
    body.url ?? body.apiBaseUrl ?? body.upstreamUrl ?? body.endpoint ?? ''
  );
}

async function proxyInvoice(req, res, next) {
  try {
    const body = req.body || {};
    const { bearerToken, payload } = body;
    const url = pickUpstreamUrl(body);

    if (!isHttpUrl(url)) {
      const raw = body.url ?? body.apiBaseUrl ?? body.upstreamUrl ?? body.endpoint;
      logger.warn('fiscal', 'invalid upstream url', {
        typeof: typeof raw,
        keys: body && typeof body === 'object' ? Object.keys(body) : [],
        preview: raw == null ? null : String(raw).slice(0, 120),
      });
      return sendError(
        res,
        400,
        'url must be a valid http(s) URL',
        {
          receivedType: raw == null ? 'missing' : typeof raw,
          hint: 'Set Integrations → API Base URL to a full URL like https://ims.fbr.gov.pk/api/Live/PostData/ (no quotes).',
        }
      );
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
    let responseBody;
    if (raw) {
      try {
        responseBody = JSON.parse(raw);
      } catch {
        responseBody = { message: raw };
      }
    } else {
      responseBody = {};
    }

    logger.info('fiscal', 'upstream response', {
      status: upstream.status,
      contentType,
      ok: upstream.ok,
    });

    res.status(upstream.status).json(responseBody);
  } catch (err) {
    logger.error('fiscal', 'proxy invoice failed', { message: err.message });
    next(err);
  }
}

module.exports = { proxyInvoice, normalizeUpstreamUrl, isHttpUrl, pickUpstreamUrl };
