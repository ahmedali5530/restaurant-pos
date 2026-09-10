'use strict';

const express = require('express');
const { verifySession, extractBearer } = require('./jwt');
const { getClient } = require('./surreal-client');
const syncService = require('./sync-service');

const router = express.Router();

async function requireSession(req, res, next) {
  try {
    const token = extractBearer(req);
    req.session = await verifySession(token);
    return next();
  } catch (err) {
    return res.status(err.status || 401).json({ ok: false, error: err.message || 'Unauthorized' });
  }
}

function sendError(res, err) {
  const status = err.status || 500;
  return res.status(status).json({
    ok: false,
    error: err.message || 'Sync error',
    code: err.code,
  });
}

function withActor(req) {
  const body = { ...(req.body || {}) };
  const actorId = req.session?.sub || body.actorId || body.actor_id || null;
  if (actorId) {
    body.actorId = String(actorId);
  }
  return body;
}

router.post('/handshake', requireSession, async (req, res) => {
  try {
    const db = await getClient();
    const result = await syncService.handshake(db, withActor(req));
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
});

router.post('/terminals/register', requireSession, async (req, res) => {
  try {
    const db = await getClient();
    const result = await syncService.handshake(db, withActor(req));
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
});

router.post('/snapshot', requireSession, async (req, res) => {
  try {
    const db = await getClient();
    const result = await syncService.snapshotPage(db, req.body || {});
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
});

router.post('/reserve-numbers', requireSession, async (req, res) => {
  try {
    const db = await getClient();
    const result = await syncService.reserveNumberRange(db, req.body || {});
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
});

router.post('/push', requireSession, async (req, res) => {
  try {
    const db = await getClient();
    const result = await syncService.push(db, withActor(req));
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
});

router.get('/pull', requireSession, async (req, res) => {
  try {
    const db = await getClient();
    const result = await syncService.pull(db, req.query || {});
    return res.json(result);
  } catch (err) {
    return sendError(res, err);
  }
});

module.exports = router;
