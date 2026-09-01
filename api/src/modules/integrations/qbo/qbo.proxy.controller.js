'use strict';

/**
 * QuickBooks API proxy — the browser never talks to Intuit directly.
 * All QBO API calls are proxied through this controller with session auth.
 */

const logger = require('../../../lib/logger');
const { sendSuccess, sendError } = require('../../../lib/response');
const { QboOAuthService } = require('./oauth.service');
const { QboClient } = require('./qbo.client');
const { getClient } = require('../../../lib/surreal-client'); // shared surreal client

let qboServiceCache = null;
let qboClientCache = null;

async function getQboService() {
  if (!qboServiceCache) {
    const db = await getClient();
    qboServiceCache = new QboOAuthService(db);
  }
  return qboServiceCache;
}

async function getQboClient(realmId) {
  const service = await getQboService();
  // Rebuild client when realmId changes
  if (!qboClientCache || qboClientCache.realmId !== realmId) {
    qboClientCache = new QboClient({
      realmId,
      environment: process.env.QBO_ENV || 'sandbox',
      getAccessToken: () => service.getValidAccessToken(realmId),
    });
  }
  return qboClientCache;
}

/**
 * Generic pass-through proxy handler.
 * Body = { method, path, body, query, rawResponse }
 * Session JWT middleware already applied on route level.
 */
async function proxyRequest(req, res) {
  try {
    const { realmId, method, path, body, query } = req.body;
    if (!realmId) {
      return sendError(res, 400, 'realmId is required');
    }

    const client = await getQboClient(realmId);
    const result = await client.request({
      method: method || 'GET',
      path,
      body,
      query,
    });

    sendSuccess(res, result);
  } catch (err) {
    logger.error('integrations.qbo.proxy', 'Proxy request failed', {
      error: err.message,
      category: err.category,
      status: err.status,
    });
    sendError(res, err.status || 500, err.message);
  }
}

/**
 * Get connection status for the UI.
 */
async function getConnectionStatus(req, res) {
  try {
    const { realmId } = req.params;
    const service = await getQboService();
    const store = service.credentialStore;
    const summary = await store.getConnectionSummary('provider:quickbooks', realmId);
    sendSuccess(res, summary);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

/**
 * List all connected QBO companies.
 */
async function listCompanies(req, res) {
  try {
    const service = await getQboService();
    const providers = await service.credentialStore.listProviders();
    sendSuccess(res, providers);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

module.exports = {
  proxyRequest,
  getConnectionStatus,
  listCompanies,
};
