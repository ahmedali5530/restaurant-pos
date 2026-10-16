'use strict';

/**
 * QR self-ordering HTTP API.
 *
 *   Public (customer phone, no login, rate limited):
 *     GET  /self-order/public/:token                      menu for the table
 *     POST /self-order/public/:token/quote                price a cart
 *     POST /self-order/public/:token/checkout             create checkout + payment intent
 *     POST /self-order/public/:token/checkout/:id/confirm verify payment, send order to POS
 *     GET  /self-order/public/:token/checkout/:id         checkout status
 *
 *   Admin (POS session with admin.tables access):
 *     GET  /self-order/admin/config
 *     PUT  /self-order/admin/settings
 *     POST /self-order/admin/tables/:tableId              { regenerate?, enabled? }
 *     POST /self-order/admin/checkouts/:id/retry
 */

const express = require('express');
const { getClient } = require('../surreal-client');
const { verifySession, extractBearer } = require('../jwt');
const { getUserRoleModules } = require('../auth.service');
const service = require('./service');

const router = express.Router();

/* Simple fixed-window limiter per client IP for the public endpoints. */
const WINDOW_MS = 60_000;
/** Cap tracked clients so an IP-rotating flood can't grow the map unbounded. */
const MAX_TRACKED_CLIENTS = 10_000;
const hits = new Map();
function publicLimit(maxPerMinute) {
  return (req, res, next) => {
    // server.js sets `trust proxy`, and nginx overwrites X-Forwarded-For, so
    // req.ip is the real client. Never read the raw header here — its first
    // entry is client-controlled.
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}|${maxPerMinute}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > WINDOW_MS) {
      if (hits.size >= MAX_TRACKED_CLIENTS) {
        // Evict the oldest entries to make room (Map preserves insert order).
        let evicted = 0;
        for (const existingKey of hits.keys()) {
          hits.delete(existingKey);
          if (++evicted >= Math.floor(MAX_TRACKED_CLIENTS / 2)) break;
        }
      }
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > maxPerMinute) {
      return res.status(429).json({ ok: false, error: 'Too many requests. Please wait a moment and try again.' });
    }
    return next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (now - entry.start > WINDOW_MS) hits.delete(key);
}, WINDOW_MS).unref();

function send(res, err) {
  const known = err instanceof service.SelfOrderError;
  // Preserve upstream service statuses (e.g. the payment sidecar sets 502) so
  // callers can tell a provider outage from an internal bug.
  const status = known
    ? err.status
    : Number.isInteger(err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  if (!known && status >= 500) console.error('[self-order]', err);
  return res.status(status).json({
    ok: false,
    error: known || status !== 500 ? err.message : 'Something went wrong. Please try again.',
    ...(known && err.code ? { code: err.code } : {}),
  });
}

const handle = (fn) => async (req, res) => {
  try {
    const db = await getClient();
    const data = await fn(db, req);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, ...data });
  } catch (err) {
    return send(res, err);
  }
};

async function requireTablesAdmin(req, res, next) {
  try {
    const session = await verifySession(extractBearer(req));
    const modules = (await getUserRoleModules(session.sub)).map(String);
    const allowed = modules.some(
      (m) => m === 'admin' || m === 'super_admin' || m === 'admin.*' || m === 'admin.tables' || m.startsWith('admin.tables.'),
    );
    if (!allowed) return res.status(403).json({ ok: false, error: 'You need table admin access to manage QR ordering.' });
    req.session = session;
    return next();
  } catch (err) {
    return res.status(err.status || 401).json({ ok: false, error: err.message || 'Unauthorized' });
  }
}

/* ---- public ---- */

router.get('/public/:token', publicLimit(60), handle((db, req) => service.getPublicMenu(db, req.params.token)));

router.post('/public/:token/quote', publicLimit(120), handle((db, req) => service.quote(db, req.params.token, req.body)));

router.post('/public/:token/checkout', publicLimit(15), handle((db, req) => service.startCheckout(db, req.params.token, req.body)));

router.post(
  '/public/:token/checkout/:checkoutId/confirm',
  publicLimit(30),
  handle((db, req) => service.confirmCheckout(db, req.params.checkoutId, req.params.token)),
);

router.get(
  '/public/:token/checkout/:checkoutId',
  publicLimit(120),
  handle((db, req) => service.getCheckoutStatus(db, req.params.checkoutId, req.params.token)),
);

/* ---- admin ---- */

router.get('/admin/config', requireTablesAdmin, handle((db) => service.adminConfig(db)));

router.put('/admin/settings', requireTablesAdmin, handle(async (db, req) => ({ settings: await service.saveSettings(db, req.body || {}) })));

router.post(
  '/admin/tables/:tableId',
  requireTablesAdmin,
  handle(async (db, req) => ({
    table: await service.updateTable(db, req.params.tableId, {
      regenerate: !!req.body?.regenerate,
      enabled: req.body?.enabled,
    }),
  })),
);

router.post('/admin/checkouts/:checkoutId/retry', requireTablesAdmin, handle((db, req) => service.retryCheckout(db, req.params.checkoutId)));

/* Expire abandoned checkouts every 10 minutes. */
setInterval(() => {
  getClient()
    .then((db) => service.expireStaleCheckouts(db))
    .catch(() => undefined);
}, 10 * 60 * 1000).unref();

module.exports = router;
