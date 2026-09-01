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

/**
 * SECURITY: SSRF guard.
 *
 * Without an allow-list, /fiscal/invoice accepts any http(s) URL from the SPA
 * (which means any logged-in POS user) and proxies it server-side with the
 * caller-supplied bearerToken. That turns the API into an open SSRF relay:
 *   - probes against internal IPs (http://192.168.1.1, http://169.254.169.254 ...)
 *   - port scanning of the docker network
 *   - bypassing firewalls that trust the api container
 *
 * When FISCAL_ALLOWED_UPSTREAMS is set (comma-separated hostnames or exact
 * origins), only those hosts may be proxied. When unset, we default to the
 * known Pakistan fiscal authorities (FBR + PRA) and the loopback dev proxy.
 * Set FISCAL_ALLOWED_UPSTREAMS explicitly in production to match your region.
 */
const DEFAULT_FISCAL_UPSTREAMS = [
  'ims.fbr.gov.pk',        // Pakistan FBR Live
  'fwbs.fbr.gov.pk',       // Pakistan FBR Sandbox
  'ebirfiler.fbropen.gov.pk', // legacy FBR sandbox
  'prs.punjab.gov.pk',     // Pakistan PRA (Punjab Revenue Authority)
  'localhost',
  '127.0.0.1',
];

function getFiscalAllowList() {
  const raw = process.env.FISCAL_ALLOWED_UPSTREAMS || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Merge with defaults — defaults can be removed by setting
  // FISCAL_ALLOWED_UPSTREAMS_STRICT=true and listing only the hosts you trust.
  if (process.env.FISCAL_ALLOWED_UPSTREAMS_STRICT === 'true') {
    return list;
  }
  return [...new Set([...list, ...DEFAULT_FISCAL_UPSTREAMS])];
}

function isUpstreamAllowed(url, allowList) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  // Block obvious metadata/SSRF targets even if a wildcard sneaks in.
  const BLOCKED = new Set([
    '169.254.169.254', // AWS / GCP / Azure IMDS
    'metadata',
    '0.0.0.0',
  ]);
  if (BLOCKED.has(host)) return false;
  // Allow exact host match.
  if (allowList.map((h) => h.toLowerCase()).includes(host)) return true;
  // Allow subdomain match (e.g. allow-list "fbr.gov.pk" matches "ims.fbr.gov.pk").
  return allowList.some(
    (h) => h && host.endsWith('.' + h.toLowerCase())
  );
}

function pickUpstreamUrl(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  // Accept several aliases — clients / manual tests may use any of these.
  return normalizeUpstreamUrl(
    body.url ?? body.apiBaseUrl ?? body.upstreamUrl ?? body.endpoint ?? ''
  );
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function bodyHasKeys(body) {
  return isPlainObject(body) && Object.keys(body).length > 0;
}

/**
 * When Content-Type is missing or not application/json, express.json() skips parsing
 * and leaves the stream unread. Recover the JSON body for those requests.
 */
function readRawJsonBody(req) {
  return new Promise((resolve) => {
    if (req.readableEnded || req.complete) {
      resolve(null);
      return;
    }
    const chunks = [];
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        finish(null);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        finish(isPlainObject(parsed) ? parsed : null);
      } catch {
        finish(null);
      }
    });
    req.on('error', () => finish(null));
  });
}

async function resolveRequestBody(req) {
  if (bodyHasKeys(req.body)) {
    return req.body;
  }
  // Common mis-config: body present but Content-Type omitted → Express left it unparsed.
  const recovered = await readRawJsonBody(req);
  if (recovered) {
    req.body = recovered;
    return recovered;
  }
  return isPlainObject(req.body) ? req.body : {};
}

async function proxyInvoice(req, res, next) {
  try {
    const body = await resolveRequestBody(req);
    const { bearerToken, payload } = body;
    const url = pickUpstreamUrl(body);

    if (!isHttpUrl(url)) {
      const raw = isPlainObject(body)
        ? body.url ?? body.apiBaseUrl ?? body.upstreamUrl ?? body.endpoint
        : undefined;
      const contentType = req.get('content-type') || '';
      logger.warn('fiscal', 'invalid upstream url', {
        typeof: raw == null ? 'missing' : typeof raw,
        keys: isPlainObject(body) ? Object.keys(body) : [],
        contentType: contentType || null,
        preview: raw == null ? null : String(raw).slice(0, 120),
      });
      return sendError(
        res,
        400,
        'url must be a valid http(s) URL',
        {
          receivedType: raw == null ? 'missing' : typeof raw,
          contentType: contentType || null,
          bodyKeys: isPlainObject(body) ? Object.keys(body) : [],
          hint:
            'POST JSON to /fiscal/invoice with Content-Type: application/json and fields url (or apiBaseUrl), bearerToken, payload. Example url: https://ims.fbr.gov.pk/api/Live/PostData/',
        }
      );
    }

    // SECURITY: SSRF allow-list check. Rejects any upstream host not on
    // FISCAL_ALLOWED_UPSTREAMS (+ defaults unless strict mode is on).
    const allowList = getFiscalAllowList();
    if (!isUpstreamAllowed(url, allowList)) {
      const parsed = new URL(url);
      logger.warn('fiscal', 'upstream host rejected by allow-list', {
        host: parsed.hostname,
        url,
      });
      return sendError(
        res,
        403,
        'upstream host is not allowed',
        {
          host: parsed.hostname,
          hint:
            'Add the host to FISCAL_ALLOWED_UPSTREAMS (comma-separated), or set FISCAL_ALLOWED_UPSTREAMS_STRICT=true to deny the defaults.',
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

module.exports = {
  proxyInvoice,
  normalizeUpstreamUrl,
  isHttpUrl,
  isUpstreamAllowed,
  getFiscalAllowList,
  pickUpstreamUrl,
  resolveRequestBody,
};
