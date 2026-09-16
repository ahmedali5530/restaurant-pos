'use strict';

/**
 * Minimal HTTP Digest authentication client for Hikvision ISAPI.
 * Performs a challenge/response round-trip then retries with Authorization.
 */

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

function md5(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex');
}

function parseWwwAuthenticate(header) {
  if (!header || !/^Digest\s+/i.test(header)) {
    return null;
  }
  const params = {};
  const body = header.replace(/^Digest\s+/i, '');
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    params[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return params;
}

function buildDigestHeader({ username, password, method, uri, challenge, nc, cnonce }) {
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = challenge.qop ? String(challenge.qop).split(',')[0].trim() : undefined;
  const algorithm = (challenge.algorithm || 'MD5').toUpperCase();
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);

  let response;
  let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}"`;

  if (qop) {
    const ncValue = nc || '00000001';
    const cnonceValue = cnonce || crypto.randomBytes(8).toString('hex');
    response = md5(`${ha1}:${nonce}:${ncValue}:${cnonceValue}:${qop}:${ha2}`);
    header += `, qop=${qop}, nc=${ncValue}, cnonce="${cnonceValue}", response="${response}"`;
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`);
    header += `, response="${response}"`;
  }

  if (algorithm) {
    header += `, algorithm=${algorithm}`;
  }
  if (challenge.opaque) {
    header += `, opaque="${challenge.opaque}"`;
  }

  return header;
}

function requestOnce(url, { method, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const pathWithQuery = `${parsed.pathname}${parsed.search || ''}`;

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: pathWithQuery,
        method: method || 'GET',
        headers: headers || {},
        timeout: timeoutMs || 15000,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString('utf8');
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            text,
            buffer,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Device request timed out'));
    });
    req.on('error', reject);

    if (body !== undefined && body !== null) {
      req.write(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * @param {object} options
 * @param {string} options.baseUrl - e.g. http://192.168.1.50
 * @param {string} options.path - e.g. /ISAPI/System/deviceInfo?format=json
 * @param {string} [options.method]
 * @param {string} options.username
 * @param {string} options.password
 * @param {any} [options.body]
 * @param {Record<string,string>} [options.headers]
 * @param {number} [options.timeoutMs]
 */
async function digestRequest(options) {
  const method = (options.method || 'GET').toUpperCase();
  const baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
  const path = options.path.startsWith('/') ? options.path : `/${options.path}`;
  const url = `${baseUrl}${path}`;
  const uri = path;
  const body =
    options.body === undefined || options.body === null
      ? null
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);

  const commonHeaders = {
    Accept: 'application/json, application/xml, text/plain, */*',
    ...(body
      ? {
          'Content-Type': options.headers?.['Content-Type'] || 'application/json',
          'Content-Length': Buffer.byteLength(body),
        }
      : {}),
    ...(options.headers || {}),
  };

  const first = await requestOnce(url, {
    method,
    headers: commonHeaders,
    body,
    timeoutMs: options.timeoutMs,
  });

  if (first.status !== 401) {
    return first;
  }

  const authHeader = first.headers['www-authenticate'] || first.headers['WWW-Authenticate'];
  const challenge = parseWwwAuthenticate(Array.isArray(authHeader) ? authHeader[0] : authHeader);
  if (!challenge) {
    const err = new Error('Device returned 401 without Digest challenge');
    err.statusCode = 401;
    throw err;
  }

  const authorization = buildDigestHeader({
    username: options.username,
    password: options.password,
    method,
    uri,
    challenge,
  });

  return requestOnce(url, {
    method,
    headers: {
      ...commonHeaders,
      Authorization: authorization,
    },
    body,
    timeoutMs: options.timeoutMs,
  });
}

function tryParseBody(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return { raw: trimmed };
    }
  }
  return { raw: trimmed };
}

class HikvisionClient {
  /**
   * @param {{ host: string, port?: number, useHttps?: boolean, username: string, password: string, timeoutMs?: number }} device
   */
  constructor(device) {
    this.host = device.host;
    this.port = Number(device.port) || (device.useHttps ? 443 : 80);
    this.useHttps = Boolean(device.useHttps);
    this.username = device.username;
    this.password = device.password;
    this.timeoutMs = device.timeoutMs || 15000;
  }

  get baseUrl() {
    const protocol = this.useHttps ? 'https' : 'http';
    const defaultPort = this.useHttps ? 443 : 80;
    const portPart = this.port && this.port !== defaultPort ? `:${this.port}` : '';
    return `${protocol}://${this.host}${portPart}`;
  }

  async request({ method, path, body, query, formatJson = true }) {
    let requestPath = path;
    const params = new URLSearchParams();
    if (formatJson && !String(path).includes('format=')) {
      params.set('format', 'json');
    }
    if (query && typeof query === 'object') {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
    }
    const qs = params.toString();
    if (qs) {
      requestPath += (requestPath.includes('?') ? '&' : '?') + qs;
    }

    const response = await digestRequest({
      baseUrl: this.baseUrl,
      path: requestPath,
      method,
      username: this.username,
      password: this.password,
      body,
      timeoutMs: this.timeoutMs,
    });

    const parsed = tryParseBody(response.text);
    if (response.status >= 400) {
      const message =
        parsed?.statusString ||
        parsed?.statusMessage ||
        parsed?.error ||
        parsed?.raw ||
        `Device HTTP ${response.status}`;
      const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
      err.statusCode = response.status;
      err.details = parsed;
      throw err;
    }

    return {
      status: response.status,
      data: parsed,
      raw: response.text,
    };
  }
}

module.exports = {
  HikvisionClient,
  digestRequest,
  parseWwwAuthenticate,
  buildDigestHeader,
};
