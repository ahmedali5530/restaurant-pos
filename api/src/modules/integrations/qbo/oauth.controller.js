'use strict';

/**
 * QuickBooks OAuth controller — start, callback, disconnect.
 */

const logger = require('../../../lib/logger');
const { sendSuccess, sendError } = require('../../../lib/response');
const { QboOAuthService } = require('./oauth.service');
const { getClient } = require('../../../lib/surreal-client');

let qboServiceInstance = null;

async function getQboService() {
  if (!qboServiceInstance) {
    const db = await getClient();
    qboServiceInstance = new QboOAuthService(db);
  }
  return qboServiceInstance;
}

/**
 * POST /integrations/qbo/oauth/start
 * Body: { userId, redirectPath }
 * Returns: { authorizeUrl }
 */
async function startOAuth(req, res) {
  try {
    const { userId, redirectPath } = req.body;
    const service = await getQboService();
    const authorizeUrl = await service.startAuth(userId || 'unknown', redirectPath || '/');
    sendSuccess(res, { authorizeUrl });
  } catch (err) {
    logger.error('integrations.qbo.oauth', 'Failed to start OAuth', { error: err.message });
    sendError(res, 500, err.message);
  }
}

/**
 * GET /integrations/qbo/oauth/callback
 * Query: { code, realmId, state }
 * Redirects back to the app on success.
 */
async function handleCallback(req, res) {
  try {
    const { code, realmId, state } = req.query;

    if (!code || !realmId || !state) {
      const missing = [];
      if (!code) missing.push('code');
      if (!realmId) missing.push('realmId');
      if (!state) missing.push('state');
      logger.error('integrations.qbo.oauth', `Missing callback params: ${missing.join(', ')}`, {
        query: Object.keys(req.query).join(', '),
        missing,
      });
      return res.status(400).send(`Missing OAuth callback parameters: ${missing.join(', ')}`);
    }

    logger.info('integrations.qbo.oauth', 'Received OAuth callback', {
      realmId,
      statePrefix: state?.slice(0, 8) ?? '(none)',
      hasCode: Boolean(code),
    });

    const service = await getQboService();
    const result = await service.handleCallback(code, realmId, state);

    if (!result) {
      logger.error('integrations.qbo.oauth', 'handleCallback returned null/undefined');
      return res.status(500).send('OAuth callback returned no result');
    }

    // Redirect back to the frontend app with realmId so the UI can pick it up
    const redirectUrl = result.redirectPath || '/integrations';
    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
    const baseUrl = redirectUrl.startsWith('http') ? redirectUrl : `${frontendOrigin}${redirectUrl}`;
    const params = new URLSearchParams();
    params.set('tenantId', realmId);
    if (result.companyName) params.set('companyName', result.companyName);
    res.redirect(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${params.toString()}`);
  } catch (err) {
    logger.error('integrations.qbo.oauth', 'OAuth callback failed', {
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 3).join(' | '),
      statusCode: err.statusCode,
      category: err.category,
    });
    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
    res.redirect(`${frontendOrigin}/integrations?error=oauth_failed&detail=${encodeURIComponent(err.message?.slice(0, 100) ?? 'unknown')}`);
  }
}

/**
 * POST /integrations/qbo/oauth/disconnect
 * Body: { realmId }
 */
async function disconnect(req, res) {
  try {
    const { realmId } = req.body;
    if (!realmId) {
      return sendError(res, 400, 'realmId is required');
    }
    const service = await getQboService();
    await service.disconnect(realmId);
    sendSuccess(res, { disconnected: true });
  } catch (err) {
    logger.error('integrations.qbo.oauth', 'Disconnect failed', { error: err.message });
    sendError(res, 500, err.message);
  }
}

/**
 * POST /integrations/qbo/oauth/refresh
 * Body: { realmId }
 */
async function refreshAccessToken(req, res) {
  try {
    const { realmId } = req.body;
    if (!realmId) {
      return sendError(res, 400, 'realmId is required');
    }
    const service = await getQboService();
    const token = await service.refreshToken(realmId);
    sendSuccess(res, { refreshed: true });
  } catch (err) {
    logger.error('integrations.qbo.oauth', 'Token refresh failed', { error: err.message });
    sendError(res, err.status || 500, err.message);
  }
}

module.exports = {
  startOAuth,
  handleCallback,
  disconnect,
  refreshAccessToken,
};
