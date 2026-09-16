'use strict';

/**
 * Hikvision ISAPI proxy — browser never talks to the device directly.
 * Session JWT is applied at the /integrations mount; device credentials arrive in the body.
 */

const logger = require('../../../lib/logger');
const { sendSuccess, sendError } = require('../../../lib/response');
const { HikvisionClient } = require('./hikvision.client');
const { normalizeDevice } = require('./hikvision.service');
const endpoints = require('./isapi/endpoints');

async function proxyRequest(req, res) {
  try {
    const { device, method, path, body, query, formatJson } = req.body || {};
    if (!path) {
      return sendError(res, 400, 'path is required');
    }

    const normalized = normalizeDevice(device);
    const client = new HikvisionClient(normalized);
    const result = await client.request({
      method: method || 'GET',
      path,
      body,
      query,
      formatJson: formatJson !== false,
    });

    sendSuccess(res, {
      deviceId: normalized.id,
      status: result.status,
      data: result.data,
    });
  } catch (err) {
    logger.error('integrations.hikvision.proxy', 'Proxy request failed', {
      error: err.message,
      status: err.statusCode,
    });
    sendError(res, err.statusCode || 500, err.message, err.details);
  }
}

async function testConnection(req, res) {
  try {
    const normalized = normalizeDevice(req.body?.device);
    const client = new HikvisionClient(normalized);
    const info = await client.request({
      method: 'GET',
      path: endpoints.DEVICE_INFO,
    });

    let capabilities = null;
    try {
      const caps = await client.request({
        method: 'GET',
        path: endpoints.ACS_EVENT_CAPABILITIES,
      });
      capabilities = caps.data;
    } catch {
      // Not all terminals expose AcsEvent capabilities; deviceInfo is enough.
    }

    sendSuccess(res, {
      deviceId: normalized.id,
      connected: true,
      deviceInfo: info.data,
      capabilities,
    });
  } catch (err) {
    logger.error('integrations.hikvision.test', 'Connection test failed', {
      error: err.message,
      status: err.statusCode,
    });
    sendError(res, err.statusCode || 500, err.message, err.details);
  }
}

/**
 * Server-side AcsEvent pagination helper used by Sync now.
 * Body: { device, startTime, endTime, maxResults?, major? }
 */
async function syncEvents(req, res) {
  try {
    const { startTime, endTime, maxResults, major } = req.body || {};
    if (!startTime || !endTime) {
      return sendError(res, 400, 'startTime and endTime are required');
    }

    const normalized = normalizeDevice(req.body?.device);
    const client = new HikvisionClient(normalized);
    const pageSize = Math.min(Number(maxResults) || 100, 200);
    const searchID = `posr-${Date.now()}`;
    const events = [];
    let position = 0;
    let pages = 0;
    const maxPages = 50;

    while (pages < maxPages) {
      pages += 1;
      const body = {
        AcsEventCond: {
          searchID,
          searchResultPosition: position,
          maxResults: pageSize,
          major: major === undefined ? 5 : major,
          startTime,
          endTime,
        },
      };

      const result = await client.request({
        method: 'POST',
        path: endpoints.ACS_EVENT,
        body,
      });

      const acs = result.data?.AcsEvent || result.data || {};
      const list = Array.isArray(acs.InfoList)
        ? acs.InfoList
        : acs.InfoList
          ? [acs.InfoList]
          : [];
      events.push(...list);

      const status = String(acs.responseStatusStrg || '').toUpperCase();
      const num = Number(acs.numOfMatches) || list.length;
      if (status !== 'MORE' || num <= 0) {
        break;
      }
      position += num;
    }

    sendSuccess(res, {
      deviceId: normalized.id,
      count: events.length,
      events,
    });
  } catch (err) {
    logger.error('integrations.hikvision.syncEvents', 'Event sync failed', {
      error: err.message,
      status: err.statusCode,
    });
    sendError(res, err.statusCode || 500, err.message, err.details);
  }
}

module.exports = {
  proxyRequest,
  testConnection,
  syncEvents,
};
