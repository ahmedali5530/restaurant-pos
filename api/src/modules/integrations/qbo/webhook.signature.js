'use strict';

const crypto = require('crypto');
const logger = require('../../../lib/logger');

class QboWebhookVerifier {
  /**
   * @param {string} verifierToken - QBO webhook verifier token from env
   */
  constructor(verifierToken) {
    this.verifierToken = verifierToken;
  }

  /**
   * Verify an Intuit webhook signature.
   * Algorithm: HMAC-SHA256 of the raw body, compared to the intuit-signature header.
   */
  verify(rawBody, signatureHeader) {
    if (!this.verifierToken) {
      logger.warn('integrations.qbo.webhook', 'Cannot verify webhook — QBO_WEBHOOK_VERIFIER_TOKEN not set');
      return false;
    }

    if (!signatureHeader) {
      logger.warn('integrations.qbo.webhook', 'Missing intuit-signature header');
      return false;
    }

    if (!rawBody) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', this.verifierToken);
    hmac.update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
    const computed = Buffer.from(hmac.digest()).toString('base64');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed),
        Buffer.from(signatureHeader)
      );
    } catch {
      return false;
    }
  }
}

module.exports = { QboWebhookVerifier };
