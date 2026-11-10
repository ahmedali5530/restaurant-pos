'use strict';

/**
 * Public customer-display snapshot API (no POS login).
 *
 *   GET /customer-display-api/public/:terminalId?pair=<pair_token>
 *   GET /customer-display-api/public/:terminalId/media?pair=<pair_token>
 *   GET /customer-display-api/public/:terminalId/media/file?pair=<pair_token>&id=<documentId>
 *
 * The POS upserts customer_display:<terminalId> with a pair_token; the display
 * browser polls this route instead of opening a Surreal /rpc session.
 * Idle ads use the same pair gate (settings are global; documents are streamed).
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

function surrealBytesToBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (ArrayBuffer.isView?.(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
    return Buffer.from(Uint8Array.from(value));
  }
  if (typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(Uint8Array.from(value.data));
  }
  if (typeof value === 'string') {
    try {
      return Buffer.from(value, 'base64');
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeMediaSettings(raw) {
  const values = raw && typeof raw === 'object' ? raw : {};
  const itemsRaw = Array.isArray(values.items) ? values.items : [];
  const items = itemsRaw
    .filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.mimeType === 'string' &&
        typeof item.documentId === 'string',
    )
    .map((item, index) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      documentId: item.documentId,
      sort: typeof item.sort === 'number' ? item.sort : index,
    }))
    .sort((a, b) => a.sort - b.sort);

  const rotation = Number(values.rotationIntervalSec);
  return {
    enabled: values.enabled === true,
    rotationIntervalSec:
      Number.isFinite(rotation) && rotation > 0
        ? Math.min(120, Math.max(2, Math.round(rotation)))
        : 8,
    items,
  };
}

function sanitizeDocumentId(raw) {
  const value = String(raw || '').trim();
  // Accept document:xxx or bare id chars used by Surreal record keys.
  if (!value || value.length > 200 || !/^[A-Za-z0-9_:\-]+$/.test(value)) {
    return null;
  }
  return value;
}

async function assertPair(db, terminalId, pair) {
  const result = await db.query(
    `SELECT pair_token FROM ONLY type::record('customer_display', $tid)`,
    { tid: terminalId },
  );
  const row = Array.isArray(result) ? result[0] : result;
  if (!row || typeof row !== 'object') {
    return { ok: false, status: 404, error: 'Display not found.' };
  }
  if (String(row.pair_token || '') !== pair) {
    return { ok: false, status: 403, error: 'Invalid pair token.' };
  }
  return { ok: true };
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

/** Idle advertisement playlist (global setting), gated by display pair token. */
router.get(
  '/public/:terminalId/media',
  publicLimit(60),
  async (req, res) => {
    try {
      const terminalId = sanitizeTerminalId(req.params.terminalId);
      const pair = sanitizePair(req.query.pair);
      if (!terminalId || !pair) {
        return res.status(400).json({ ok: false, error: 'Invalid terminal or pair token.' });
      }

      const db = await getClient();
      const gate = await assertPair(db, terminalId, pair);
      if (!gate.ok) {
        res.set('Cache-Control', 'no-store');
        return res.status(gate.status).json({ ok: false, error: gate.error });
      }

      const result = await db.query(
        `SELECT values FROM setting WHERE key = $key LIMIT 1`,
        { key: 'customer_display_media' },
      );
      const rows = Array.isArray(result?.[0]) ? result[0] : [];
      const settings = normalizeMediaSettings(rows[0]?.values);

      res.set('Cache-Control', 'no-store');
      return res.json({
        ok: true,
        terminal_id: terminalId,
        settings,
      });
    } catch (err) {
      console.error('[customer-display media]', err);
      return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
    }
  },
);

/** Stream one advertisement document, gated by display pair token. */
router.get(
  '/public/:terminalId/media/file',
  publicLimit(120),
  async (req, res) => {
    try {
      const terminalId = sanitizeTerminalId(req.params.terminalId);
      const pair = sanitizePair(req.query.pair);
      const documentId = sanitizeDocumentId(req.query.id);
      if (!terminalId || !pair || !documentId) {
        return res.status(400).json({ ok: false, error: 'Invalid terminal, pair, or document.' });
      }

      const db = await getClient();
      const gate = await assertPair(db, terminalId, pair);
      if (!gate.ok) {
        res.set('Cache-Control', 'no-store');
        return res.status(gate.status).json({ ok: false, error: gate.error });
      }

      const id = documentId.includes(':')
        ? documentId
        : `document:${documentId}`;
      const result = await db.query(
        `SELECT content, type FROM ONLY type::record($id)`,
        { id },
      );
      const row = Array.isArray(result) ? result[0] : result;
      if (!row || typeof row !== 'object' || row.content == null) {
        res.set('Cache-Control', 'no-store');
        return res.status(404).json({ ok: false, error: 'Media not found.' });
      }

      const buf = surrealBytesToBuffer(row.content);
      if (!buf || !buf.length) {
        res.set('Cache-Control', 'no-store');
        return res.status(404).json({ ok: false, error: 'Media not found.' });
      }

      const mime =
        typeof row.type === 'string' && row.type.length > 0
          ? row.type
          : 'application/octet-stream';
      res.set('Cache-Control', 'private, max-age=300');
      res.set('Content-Type', mime);
      res.set('Content-Length', String(buf.length));
      return res.send(buf);
    } catch (err) {
      console.error('[customer-display media file]', err);
      return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
    }
  },
);

module.exports = router;
