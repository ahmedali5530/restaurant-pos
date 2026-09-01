'use strict';

/**
 * QuickBooks webhook receiver.
 * No session auth — raw body verification via Intuit HMAC signature.
 */

const logger = require('../../../lib/logger');
const { sendSuccess, sendError } = require('../../../lib/response');
const { QboWebhookVerifier } = require('./webhook.signature');
const { getClient } = require('../../../lib/surreal-client');

const verifier = new QboWebhookVerifier(process.env.QBO_WEBHOOK_VERIFIER_TOKEN);

/**
 * POST /integrations/qbo/webhooks
 * No session JWT — Intuit signature auth only.
 */
async function handleWebhook(req, res) {
  try {
    const signature = req.get('intuit-signature');
    const rawBody = req.body;

    if (!verifier.verify(
      typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
      signature
    )) {
      logger.warn('integrations.qbo.webhook', 'Invalid or missing webhook signature');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    // Parse webhook notifications
    // QBO sends an array of { realmId, dataChangeEvent: { entities: [...] } }
    const notifications = Array.isArray(rawBody) ? rawBody : rawBody?.eventNotifications || [];

    const db = await getClient();

    for (const notification of notifications) {
      const realmId = notification.realmId;
      const entities = notification.dataChangeEvent?.entities || [];

      for (const entity of entities) {
        const eventPayload = {
          realmId,
          entityName: entity.name,
          entityId: entity.id,
          operation: entity.operation, // Create, Update, Delete, Merge, Void
          lastUpdated: entity.lastUpdated,
        };

        // Persist webhook event
        try {
          await db.query(
            `CREATE integration_provider_webhook CONTENT $data`,
            { data: {
              provider_id: 'provider:quickbooks',
              event_name: `entity.${entity.operation || 'changed'}`,
              payload: eventPayload,
              received_at: new Date(),
            }}
          );
        } catch (err) {
          logger.warn('integrations.qbo.webhook', 'Failed to persist webhook event', {
            entityId: entity.id,
            error: err.message,
          });
        }

        logger.info('integrations.qbo.webhook', 'Received entity change notification', {
          realmId,
          entity: entity.name,
          operation: entity.operation,
          entityId: entity.id,
        });
      }
    }

    // Intuit expects a quick 200 response
    sendSuccess(res, { received: true });
  } catch (err) {
    logger.error('integrations.qbo.webhook', 'Webhook processing failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Webhook processing error' });
  }
}

module.exports = { handleWebhook };
