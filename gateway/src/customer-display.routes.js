'use strict';

/**
 * Public customer-display snapshot API (no POS login).
 *
 *   GET /customer-display-api/public/:terminalId?pair=<pair_token>
 *
 * The POS upserts customer_display:<terminalId> with a pair_token; the display
 * browser polls this route instead of opening a Surreal /rpc session.
 */

const express = require('express');
const { getClient } = require('./surreal-client');

const router = express.Router();

const WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 10_000;
const hits = new Map();

function publicLimit(maxPerMinute) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}|cd|${maxPerMinute}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > WINDOW_MS) {
      if (hits.size >= MAX_TRACKED_CLIENTS) {
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
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }
    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now - entry.start > WINDOW_MS) hits.delete(key);
  }
}, WINDOW_MS).unref();

function sanitizeTerminalId(raw) {
  const value = String(raw || '').trim();
  // Terminal ids are nanoid-based: terminal-<id> — reject path tricks.
  if (!value || value.length > 80 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  return value;
}

function sanitizePair(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  return value;
}

/**
 * Strip Surreal record noise; keep only customer-facing snapshot fields.
 */
function toPublicSnapshot(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  return {
    updatedAt: Number(row.updatedAt ?? row.updated_at) || 0,
    lines: Array.isArray(row.lines) ? row.lines : [],
    itemsBase: typeof row.itemsBase === 'number' ? row.itemsBase : Number(row.total) || 0,
    taxTotals: Array.isArray(row.taxTotals) ? row.taxTotals : [],
    adjustments: Array.isArray(row.adjustments) ? row.adjustments : [],
    total: Number(row.total) || 0,
    thankYou: row.thankYou === true,
  };
}

router.get(
  '/public/:terminalId',
  publicLimit(120),
  async (req, res) => {
    try {
      const terminalId = sanitizeTerminalId(req.params.terminalId);
      const pair = sanitizePair(req.query.pair);
      if (!terminalId || !pair) {
        return res.status(400).json({ ok: false, error: 'Invalid terminal or pair token.' });
      }

      const db = await getClient();
      const result = await db.query(
        `SELECT * FROM ONLY type::record('customer_display', $tid)`,
        { tid: terminalId },
      );
      const row = Array.isArray(result) ? result[0] : result;
      if (!row || typeof row !== 'object') {
        res.set('Cache-Control', 'no-store');
        return res.status(404).json({ ok: false, error: 'Display not found.' });
      }

      if (String(row.pair_token || '') !== pair) {
        return res.status(403).json({ ok: false, error: 'Invalid pair token.' });
      }

      const snapshot = toPublicSnapshot(row);
      res.set('Cache-Control', 'no-store');
      return res.json({
        ok: true,
        terminal_id: terminalId,
        snapshot,
      });
    } catch (err) {
      console.error('[customer-display]', err);
      return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
    }
  },
);

module.exports = router;
