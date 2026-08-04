'use strict';

/**
 * Provider-agnostic OAuth credential store.
 * Saves encrypted access tokens, refresh tokens, and metadata per provider + tenant.
 * Tokens are encrypted at rest using the shared token.crypto module.
 */

const { encrypt, decrypt } = require('./token.crypto');
const logger = require('../../../lib/logger');

class CredentialStore {
  /**
   * @param {object} db - SurrealDB client
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Save or update OAuth credentials for a provider + tenant.
   */
  async save(providerId, tenantId, options) {
    const {
      companyName,
      accessToken,
      refreshToken,
      tokenType = 'bearer',
      expiresAt,
      scopes,
    } = options;

    try {
      // Build data object, omitting null optional fields (avoids option<string> coercion errors)
      const updateFields = {
        provider_id: providerId,
        tenant_id: tenantId,
        access_token_enc: encrypt(accessToken),
        refresh_token_enc: refreshToken ? encrypt(refreshToken) : undefined,
        token_type: tokenType,
        expires_at: expiresAt instanceof Date ? expiresAt : (expiresAt ? new Date(expiresAt) : undefined),
        scopes: scopes || undefined,
        status: 'connected',
        updated_at: new Date(),
      };
      if (companyName) updateFields.company_name = companyName;

      // Strip undefined keys
      for (const k of Object.keys(updateFields)) {
        if (updateFields[k] === undefined) delete updateFields[k];
      }

      // Upsert: one credential record per provider + tenant combination
      const [existing] = await this.db.query(
        `SELECT id FROM integration_oauth_credential
         WHERE provider_id = $providerId AND tenant_id = $tenantId LIMIT 1`,
        { providerId, tenantId }
      );

      if (existing?.[0]?.id) {
        await this.db.query(
          `UPDATE $id MERGE $fields`,
          { id: existing[0].id, fields: updateFields }
        );
      } else {
        await this.db.query(
          `CREATE integration_oauth_credential CONTENT $fields`,
          { fields: updateFields }
        );
      }

      logger.info('integrations.credentials', 'Saved OAuth credentials', {
        providerId,
        tenantId,
        companyName: companyName || '(unknown)',
      });
    } catch (err) {
      logger.error('integrations.credentials', 'Failed to save OAuth credentials', {
        providerId,
        tenantId,
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Load decrypted credentials for a provider + tenant.
   */
  async load(providerId, tenantId) {
    try {
      const [rows] = await this.db.query(
        `SELECT * FROM integration_oauth_credential
         WHERE provider_id = $providerId AND tenant_id = $tenantId LIMIT 1`,
        { providerId, tenantId }
      );

      const row = rows?.[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        providerId: row.provider_id,
        tenantId: row.tenant_id,
        companyName: row.company_name,
        accessToken: decrypt(row.access_token_enc),
        refreshToken: decrypt(row.refresh_token_enc),
        tokenType: row.token_type,
        expiresAt: row.expires_at,
        scopes: row.scopes,
        status: row.status,
        updatedAt: row.updated_at,
      };
    } catch (err) {
      logger.error('integrations.credentials', 'Failed to load OAuth credentials', {
        providerId,
        tenantId,
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Get connection status summary for UI (never returns tokens).
   */
  async getConnectionSummary(providerId, tenantId) {
    const creds = await this.load(providerId, tenantId);
    if (!creds || creds.status !== 'connected') {
      return { connected: false, status: creds?.status || 'disconnected' };
    }
    return {
      connected: true,
      status: creds.status,
      companyName: creds.companyName,
      tenantId: creds.tenantId,
      expiresAt: creds.expiresAt,
    };
  }

  /**
   * Mark credentials as revoked/expired without deleting (audit trail).
   */
  async markStatus(providerId, tenantId, status) {
    try {
      const [rows] = await this.db.query(
        `SELECT id FROM integration_oauth_credential
         WHERE provider_id = $providerId AND tenant_id = $tenantId LIMIT 1`,
        { providerId, tenantId }
      );
      if (rows?.[0]?.id) {
        await this.db.query(
          `UPDATE $id MERGE { status: $status, updated_at: $now }`,
          { id: rows[0].id, status, now: new Date() }
        );
      }
    } catch (err) {
      logger.warn('integrations.credentials', 'Failed to update credential status', {
        providerId,
        tenantId,
        status,
        error: err.message,
      });
    }
  }

  /**
   * List all providers connected with summary info.
   */
  async listProviders() {
    try {
      const [rows] = await this.db.query(
        `SELECT provider_id, tenant_id, company_name, status, expires_at, updated_at
         FROM integration_oauth_credential
         WHERE status = 'connected'
         ORDER BY updated_at DESC`
      );
      return (rows || []).map((r) => ({
        providerId: r.provider_id,
        tenantId: r.tenant_id,
        companyName: r.company_name,
        status: r.status,
        expiresAt: r.expires_at,
        updatedAt: r.updated_at,
      }));
    } catch (err) {
      logger.warn('integrations.credentials', 'Failed to list providers', {
        error: err.message,
      });
      return [];
    }
  }
}

module.exports = { CredentialStore };
