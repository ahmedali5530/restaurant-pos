'use strict';

const { getClient } = require('../surreal-client');

const TRACKING_TABLE = 'tracking';

function normalizeTrackingPayload(raw) {
  const payload = { ...(raw || {}) };

  if (!payload.created_at) {
    payload.created_at = new Date();
  }

  if (!payload.page) {
    payload.page = 'unknown';
  }

  if (!payload.user) {
    payload.user = 'unknown';
  }

  return payload;
}

function toTrackingId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

async function createTracking(rawPayload) {
  const client = await getClient();
  const payload = normalizeTrackingPayload(rawPayload);
  const trackingId = toTrackingId(payload.id);

  if (trackingId) {
    const { id, ...rest } = payload;
    const [result] = await client.query(
      'CREATE type::record($table, $id) CONTENT $data;',
      {
        table: TRACKING_TABLE,
        id: trackingId,
        data: rest,
      }
    );
    return result;
  }

  const [result] = await client.query(
    'CREATE type::table($table) CONTENT $data;',
    {
      table: TRACKING_TABLE,
      data: payload,
    }
  );
  return result;
}

module.exports = {
  createTracking,
};
