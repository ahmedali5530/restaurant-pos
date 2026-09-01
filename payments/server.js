'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const paymentsRoutes = require('./src/routes/payments.routes');
const webhooksRoutes = require('./src/routes/webhooks.routes');
const credentialsRoutes = require('./src/routes/credentials.routes');
const { handleError } = require('./src/lib/response');
const { initSurrealClient } = require('./src/lib/surreal-client');
const { requestLogMiddleware } = require('./src/lib/request-log.middleware');
const {
  createSessionAuthMiddleware,
  createCorsOriginDelegate,
} = require('./src/lib/session-auth.middleware');
const {
  buildMpesaWebhookCallbackUrl,
  getPaymentBaseUrl,
  getPaymentCallbackBaseUrl,
} = require('./src/lib/intent.utils');

const app = express();
// SECURITY FIX: was 3133, mismatched docker-compose (3134). Worked only
// because compose overrides. Now matches the documented port.
const PORT = Number(process.env.PAYMENT_PORT || 3134);
const HOST = process.env.PAYMENT_HOST || '0.0.0.0';

app.use(cors({ origin: createCorsOriginDelegate() }));

// Keep webhook body untouched for signature verification in real integrations.
app.use('/webhooks', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogMiddleware);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'posr-payment-server' });
});

const requireSession = createSessionAuthMiddleware();

app.use('/payments', requireSession, paymentsRoutes);
// Credentials route has its own session-auth middleware (mounted per-route)
// so it can be toggled independently if ever needed.
app.use('/payments', credentialsRoutes);
app.use('/webhooks', webhooksRoutes);

app.use((err, req, res, next) => {
  handleError(res, err);
});

function start() {
  app.listen(PORT, HOST, () => {
    console.log(`Payment server listening on http://${HOST}:${PORT}`);
    console.log(`Payment base URL: ${getPaymentBaseUrl()}`);
    console.log(`Webhook callback base URL: ${getPaymentCallbackBaseUrl()}`);
    console.log(`M-Pesa STK callback pattern: ${buildMpesaWebhookCallbackUrl('order:example')}`);
    console.log('POST /payments/create-intent');
    console.log('POST /payments/verify');
    console.log('POST /payments/credentials/:paymentTypeId  (encrypts at rest)');
    console.log('DELETE /payments/credentials/:paymentTypeId  (revokes)');
    console.log('POST /webhooks/:gateway/:orderKey');
    console.log('GET /webhooks/:gateway/:orderKey');
  });

  // Do not block HTTP bind on SurrealDB — wrong/unreachable URL can hang connect indefinitely.
  void initSurrealClient()
    .then(() => {
      console.log('Connected to SurrealDB for gateway config lookup');
    })
    .catch((err) => {
      console.warn(
        'SurrealDB connection failed at startup (M-Pesa config lookup will retry on request):',
        err.message
      );
    });
}

start();
