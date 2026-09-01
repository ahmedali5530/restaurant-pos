'use strict';

const express = require('express');
const { getClient } = require('../lib/surreal-client');
const { createSessionAuthMiddleware } = require('../lib/session-auth.middleware');
const { normalizeOrderKey: _unused } = require('../lib/intent.utils');
const { encryptGatewayConfig } = require('../lib/payment-credential.crypto');
const { sendSuccess, sendError } = require('../lib/response');
const logger = require('../lib/logger');

const router = express.Router();
const requireSession = createSessionAuthMiddleware();

/**
 * POST /payments/credentials/:paymentTypeId
 *
 * Saves gateway credentials for a payment type, encrypting them at rest
 * before writing to SurrealDB. The SPA should call this endpoint instead of
 * writing `gateway_config` directly to Surreal via /rpc — otherwise the
 * credentials are stored in plaintext.
 *
 * Body: { gatewayConfig: { … } }
 *   The shape depends on the gateway (see each driver's mapCredentials).
 *
 * Response: { ok: true, paymentTypeId, encrypted: true }
 *
 * The endpoint also clears the legacy `gateway_config` plaintext field after
 * writing the encrypted version, so a DB read compromise cannot recover the
 * plaintext via the old field. If the encryption key is unset in production,
 * the endpoint returns 500 (refuses to persist plaintext).
 */
router.post('/credentials/:paymentTypeId', requireSession, async (req, res, next) => {
  try {
    const paymentTypeId = String(req.params.paymentTypeId || '').trim();
    if (!paymentTypeId) {
      return sendError(res, 400, 'paymentTypeId is required');
    }
    const recordId = paymentTypeId.includes(':')
      ? paymentTypeId
      : `payment_type:${paymentTypeId}`;

    const gatewayConfig = req.body?.gatewayConfig;
    if (!gatewayConfig || typeof gatewayConfig !== 'object' || Array.isArray(gatewayConfig)) {
      return sendError(res, 400, 'gatewayConfig must be a JSON object');
    }

    let encrypted;
    try {
      encrypted = encryptGatewayConfig(gatewayConfig);
    } catch (err) {
      logger.error('credentials', 'Encryption refused', { message: err.message });
      return sendError(res, 500, 'Cannot encrypt credentials — set PAYMENT_CREDENTIAL_ENCRYPTION_KEY', {
        hint: 'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      });
    }

    const client = await getClient();
    // Upsert: write the encrypted blob AND clear the legacy plaintext field.
    // The MERGE keeps all other payment_type fields (name, gateway, type, etc.)
    // untouched — only the two credential fields are affected.
    await client.query(
      `UPDATE type::record($id) MERGE {
         gateway_config_encrypted: $encrypted,
         gateway_config: NONE,
         credentials_updated_at: time::now()
       };`,
      { id: recordId, encrypted }
    );

    logger.info('credentials', 'Saved encrypted gateway credentials', {
      paymentTypeId: recordId,
    });

    sendSuccess(res, {
      ok: true,
      paymentTypeId: recordId,
      encrypted: true,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /payments/credentials/:paymentTypeId
 *
 * Removes the encrypted credential blob. The payment_type record itself is
 * NOT deleted — only the credential fields. Useful for revoking access without
 * losing the payment type configuration (name, gateway, etc.).
 */
router.delete('/credentials/:paymentTypeId', requireSession, async (req, res, next) => {
  try {
    const paymentTypeId = String(req.params.paymentTypeId || '').trim();
    if (!paymentTypeId) {
      return sendError(res, 400, 'paymentTypeId is required');
    }
    const recordId = paymentTypeId.includes(':')
      ? paymentTypeId
      : `payment_type:${paymentTypeId}`;

    const client = await getClient();
    await client.query(
      `UPDATE type::record($id) MERGE {
         gateway_config_encrypted: NONE,
         gateway_config: NONE,
         credentials_updated_at: time::now()
       };`,
      { id: recordId }
    );

    logger.info('credentials', 'Removed gateway credentials', { paymentTypeId: recordId });
    sendSuccess(res, { ok: true, paymentTypeId: recordId, removed: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
