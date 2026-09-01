'use strict';

const { getCheckoutSession, saveReturnResult } = require('../lib/jazzcash-checkout.store');
const { savePaymentWebhook } = require('../lib/payment-webhook.store');
const { normalizeOrderKey } = require('../lib/intent.utils');
const { verifyReturnHash, parseJazzcashReturn } = require('../gateways/jazzcash/jazzcash.client');
const logger = require('../lib/logger');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAutoSubmitForm(actionUrl, fields) {
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`
    )
    .join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Redirecting to JazzCash</title>
</head>
<body onload="document.forms[0].submit()">
  <p>Redirecting to JazzCash…</p>
  <form method="POST" action="${escapeHtml(actionUrl)}">
    ${inputs}
    <noscript><button type="submit">Continue to JazzCash</button></noscript>
  </form>
</body>
</html>`;
}

function renderReturnPage(parsed) {
  const success = parsed.paymentStatus === 'paid';
  const title = success ? 'Payment successful' : 'Payment status';
  const message = success
    ? 'Your JazzCash payment was received. You can close this tab and return to the POS.'
    : `JazzCash response: ${escapeHtml(parsed.responseMessage || parsed.responseCode || 'pending')}`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:24px;">
  <h2>${escapeHtml(title)}</h2>
  <p>${message}</p>
</body>
</html>`;
}

function collectRequestFields(req) {
  return { ...(req.query || {}), ...(req.body || {}) };
}

async function renderJazzcashCheckout(req, res, next) {
  try {
    const txnRefNo = decodeURIComponent(req.params.txnRefNo);
    const session = getCheckoutSession(txnRefNo);
    if (!session) {
      return res.status(404).send('JazzCash checkout session not found or expired.');
    }

    res.status(200).send(renderAutoSubmitForm(session.actionUrl, session.fields));
  } catch (err) {
    next(err);
  }
}

async function handleJazzcashReturn(req, res, next) {
  try {
    const fields = collectRequestFields(req);
    const parsed = parseJazzcashReturn(fields);
    const txnRefNo = parsed.txnRefNo;

    if (txnRefNo) {
      const session = getCheckoutSession(txnRefNo);
      if (session?.integritySalt) {
        const valid = verifyReturnHash(fields, session.integritySalt);
        if (!valid) {
          logger.warn('jazzcash', 'return hash verification failed', { txnRefNo });
        }
      }

      saveReturnResult(txnRefNo, parsed);

      const orderId = parsed.orderId || session?.orderId;
      if (orderId && parsed.paymentStatus === 'paid') {
        await savePaymentWebhook({
          key: normalizeOrderKey(orderId),
          gateway: 'jazzcash',
          data: {
            raw: fields,
            normalized: parsed,
          },
        });
        logger.info('jazzcash', 'stored return webhook', { txnRefNo, orderId });
      }
    }

    res.status(200).send(renderReturnPage(parsed));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  renderJazzcashCheckout,
  handleJazzcashReturn,
};
