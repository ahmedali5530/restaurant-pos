'use strict';

/**
 * OAuth CSRF state store — shared by all providers.
 * Stores a random state string with expiry (default 10 min) and the requesting user.
 * Callback validates state is single-use and not expired.
 */

const crypto = require('crypto');
const logger = require('../../../lib/logger');

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Normalize a SurrealDB datetime value (could be object, string, or Date)
 * into a JS Date for comparison.
 */
function toJsDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toISOString === 'function') {
    return new Date(value.toISOString());
  }
  return new Date(value);
}

class OAuthStateStore {
  /**
   * @param {object} db - SurrealDB client (already connected, namespace+db selected)
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Save a new OAuth state for the given provider and user.
   * @returns {string} the generated state
   */
  async save(providerId, userId, redirectPath, options = {}) {
    const state = generateState();
    const ttlSeconds = options.ttlSeconds || 600; // 10 minutes default
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    try {
      await this.db.query(
        `CREATE integration_oauth_state CONTENT $data`,
        { data: {
          state,
          provider_id: providerId,
          user_id: userId || 'unknown',
          redirect_path: redirectPath || '/',
          expires_at: expiresAt,
        }}
      );
      logger.info('integrations.oauth', 'Saved OAuth state', {
        providerId,
        statePrefix: state.slice(0, 8),
      });
    } catch (err) {
      logger.error('integrations.oauth', 'Failed to save OAuth state', {
        providerId,
        error: err.message,
        stack: err.stack?.split('\n').slice(0, 3).join(' | '),
      });
      throw err;
    }

    return state;
  }

  /**
   * Consume an OAuth state — validates it exists, is unused, and is not expired.
   * Marks it as used on success. Returns the saved data or null if invalid.
   */
  async consume(state) {
    const statePrefix = state?.slice(0, 8) ?? '(none)';
    try {
      const [rows] = await this.db.query(
        `SELECT * FROM integration_oauth_state
         WHERE state = $state LIMIT 1`,
        { state }
      );

      const row = rows?.[0];
      if (!row) {
        logger.warn('integrations.oauth', 'OAuth state not found in DB', {
          statePrefix,
        });
        return null;
      }

      if (row.used_at) {
        logger.warn('integrations.oauth', 'OAuth state already used', {
          statePrefix,
          usedAt: toJsDate(row.used_at)?.toISOString(),
        });
        return null;
      }

      const expiry = toJsDate(row.expires_at);
      if (expiry && expiry < new Date()) {
        logger.warn('integrations.oauth', 'OAuth state expired', {
          statePrefix,
          expiredAt: expiry.toISOString(),
          now: new Date().toISOString(),
          type: typeof row.expires_at,
        });
        return null;
      }

      // Single-use — mark as consumed
      await this.db.query(
        `UPDATE $id MERGE { used_at: $now }`,
        { id: row.id, now: new Date() }
      );

      return {
        providerId: row.provider_id,
        userId: row.user_id,
        redirectPath: row.redirect_path,
      };
    } catch (err) {
      logger.error('integrations.oauth', 'Failed to consume OAuth state', {
        statePrefix,
        error: err.message,
        stack: err.stack?.split('\n').slice(0, 3).join(' | '),
      });
      return null;
    }
  }

  /**
   * Clean up expired states — call periodically.
   */
  async cleanExpired() {
    try {
      await this.db.query(
        `DELETE FROM integration_oauth_state
         WHERE expires_at < $now`,
        { now: new Date() }
      );
    } catch (err) {
      logger.warn('integrations.oauth', 'Failed to clean expired OAuth states', {
        error: err.message,
      });
    }
  }
}

module.exports = { OAuthStateStore };
