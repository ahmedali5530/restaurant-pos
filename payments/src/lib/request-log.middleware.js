'use strict';

const logger = require('./logger');

function sanitizePaymentRequest(body) {
  if (!body || typeof body !== 'object') return body;
  return {
    gateway: body.gateway,
    amount: body.amount,
    currency: body.currency,
    orderId: body.orderId,
    intentId: body.intentId,
    customer: body.customer
      ? {
          name: body.customer.name,
          phone: body.customer.phone
            ? logger.maskSecret(String(body.customer.phone), 6)
            : undefined,
        }
      : undefined,
    metadata: body.metadata,
  };
}

function requestLogMiddleware(req, res, next) {
  const started = Date.now();
  const path = req.originalUrl || req.url;

  if (req.method === 'POST' && path.startsWith('/payments')) {
    logger.info('http', `${req.method} ${path}`, sanitizePaymentRequest(req.body));
  }

  res.on('finish', () => {
    if (req.method === 'POST' && path.startsWith('/payments')) {
      logger.info('http', `${req.method} ${path} → ${res.statusCode}`, {
        durationMs: Date.now() - started,
      });
    }
  });

  next();
}

module.exports = { requestLogMiddleware };
