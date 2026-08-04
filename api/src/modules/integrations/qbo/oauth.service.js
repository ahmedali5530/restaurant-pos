'use strict';

/**
 * QuickBooks Online OAuth service.
 * Handles the authorization code flow, token exchange, and refresh.
 */

const crypto = require('crypto');
const logger = require('../../../lib/logger');
const { CredentialStore } = require('../shared/credential.store');
const { OAuthStateStore } = require('../shared/oauth-state.store');

const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_SANDBOX_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QBO_PRODUCTION_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QBO_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

const DEFAULT_SCOPES = 'com.intuit.quickbooks.accounting openid profile email phone address';

class QboOAuthService {
  /**
   * @param {object} db - SurrealDB client
   */
  constructor(db) {
    this.db = db;
    this.credentialStore = new CredentialStore(db);
    this.stateStore = new OAuthStateStore(db);
  }

  get environment() {
    return process.env.QBO_ENV || 'sandbox';
  }

  get clientId() {
    return process.env.QBO_CLIENT_ID;
  }

  get clientSecret() {
    return process.env.QBO_CLIENT_SECRET;
  }

  get redirectUri() {
    return process.env.QBO_REDIRECT_URI || '';
  }

  get authorizationUrl() {
    return this.environment === 'production' ? QBO_PRODUCTION_AUTH_URL : QBO_SANDBOX_AUTH_URL;
  }

  /**
   * Start OAuth flow — returns the Intuit authorization URL.
   */
  async startAuth(userId, redirectPath) {
    const state = await this.stateStore.save('provider:quickbooks', userId, redirectPath);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: DEFAULT_SCOPES,
      redirect_uri: this.redirectUri,
      state,
    });

    return `${this.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens.
   * Validates state, exchanges code, stores encrypted credentials.
   */
  async handleCallback(code, realmId, state) {
    // 1. Validate state
    const stateData = await this.stateStore.consume(state);
    if (!stateData) {
      const err = new Error('Invalid or expired OAuth state');
      err.statusCode = 400;
      throw err;
    }

    // 2. Exchange code for tokens
    const tokenResponse = await this.exchangeCode(code);

    if (!tokenResponse.access_token) {
      const err = new Error('Failed to obtain access token from Intuit');
      err.statusCode = 502;
      throw err;
    }

    // 3. Store encrypted credentials
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null;

    await this.credentialStore.save('provider:quickbooks', realmId, {
      companyName: null, // Will be populated by proxy on first API call
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type || 'bearer',
      expiresAt,
      scopes: DEFAULT_SCOPES,
    });

    logger.info('integrations.qbo', 'OAuth callback completed', {
      realmId,
      userId: stateData.userId,
    });

    return {
      realmId,
      redirectPath: stateData.redirectPath,
      companyName: null,
    };
  }

  async exchangeCode(code) {
    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(QBO_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }).toString(),
    });

    const body = await response.json();
    if (!response.ok) {
      const err = new Error(`Intuit token exchange failed: ${body.error_description || body.error || 'unknown'}`);
      err.statusCode = response.status;
      throw err;
    }
    return body;
  }

  /**
   * Refresh an access token using the stored refresh token.
   */
  async refreshToken(realmId) {
    const creds = await this.credentialStore.load('provider:quickbooks', realmId);
    if (!creds || !creds.refreshToken) {
      const err = new Error('No refresh token available');
      err.category = 'authentication';
      throw err;
    }

    try {
      const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await fetch(QBO_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: creds.refreshToken,
        }).toString(),
      });

      const body = await response.json();
      if (!response.ok) {
        // If refresh fails with invalid_grant, mark credentials as expired
        if (body.error === 'invalid_grant') {
          await this.credentialStore.markStatus('provider:quickbooks', realmId, 'expired');
        }
        const err = new Error(`QBO token refresh failed: ${body.error_description || body.error || 'unknown'}`);
        err.category = 'authentication';
        throw err;
      }

      const expiresAt = body.expires_in
        ? new Date(Date.now() + body.expires_in * 1000)
        : null;

      // Update stored tokens
      let companyName = creds.companyName;
      if (!companyName && body.id_token) {
        // Optionally extract name from id_token payload
        try {
          const payload = body.id_token.split('.')[1];
          const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
          companyName = decoded.given_name || decoded.name || null;
        } catch { /* silently ignore decoding failures */ }
      }

      await this.credentialStore.save('provider:quickbooks', realmId, {
        companyName,
        accessToken: body.access_token,
        refreshToken: body.refresh_token || creds.refreshToken,
        tokenType: body.token_type || 'bearer',
        expiresAt,
        scopes: creds.scopes || DEFAULT_SCOPES,
      });

      logger.info('integrations.qbo', 'Token refreshed', { realmId });

      return body.access_token;
    } catch (err) {
      if (err.category !== 'authentication') {
        err.category = 'network';
      }
      throw err;
    }
  }

  /**
   * Get a valid access token — refresh if expired.
   */
  async getValidAccessToken(realmId) {
    const creds = await this.credentialStore.load('provider:quickbooks', realmId);
    if (!creds || !creds.accessToken) {
      const err = new Error('No stored credentials for this company');
      err.category = 'authentication';
      throw err;
    }

    // Refresh if token expires within 5 minutes
    if (creds.expiresAt && new Date(creds.expiresAt).getTime() - Date.now() < 300_000) {
      return this.refreshToken(realmId);
    }

    return creds.accessToken;
  }

  /**
   * Disconnect — revoke tokens and mark credentials.
   */
  async disconnect(realmId) {
    const creds = await this.credentialStore.load('provider:quickbooks', realmId);

    if (creds?.refreshToken) {
      try {
        const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        await fetch(QBO_REVOKE_URL, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ token: creds.refreshToken }).toString(),
        });
      } catch (err) {
        logger.warn('integrations.qbo', 'Failed to revoke QBO token', {
          realmId,
          error: err.message,
        });
      }
    }

    await this.credentialStore.markStatus('provider:quickbooks', realmId, 'revoked');
    logger.info('integrations.qbo', 'Disconnected QBO company', { realmId });
  }
}

module.exports = { QboOAuthService };
