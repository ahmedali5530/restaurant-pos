'use strict';

const { getClient } = require('./surreal-client');
const { normalizeOrderKey } = require('./intent.utils');

const TABLE = 'payment_webhook';

function firstRow(result) {
  if (!result) return null;
  const rows = Array.isArray(result) ? result[0] : result;
  if (!rows) return null;
  return Array.isArray(rows) ? rows[0] : rows;
}

async function savePaymentWebhook({ key, gateway, data }) {
  const client = await getClient();
  const orderKey = normalizeOrderKey(key);
  const gatewayName = String(gateway || '').toLowerCase();

  await client.query(
    `DELETE ${TABLE} WHERE key = $key AND gateway = $gateway;
     CREATE ${TABLE} CONTENT $content;`,
    {
      key: orderKey,
      gateway: gatewayName,
      content: {
        key: orderKey,
        gateway: gatewayName,
        data,
        created_at: new Date(),
      },
    }
  );
}

async function consumePaymentWebhook({ key, gateway }) {
  const client = await getClient();
  const orderKey = normalizeOrderKey(key);
  const gatewayName = String(gateway || '').toLowerCase();

  const result = await client.query(
    `SELECT * FROM ${TABLE} WHERE key = $key AND gateway = $gateway LIMIT 1;`,
    { key: orderKey, gateway: gatewayName }
  );

  const row = firstRow(result);
  if (!row) {
    return null;
  }

  const recordId = row.id;
  if (recordId) {
    await client.query('DELETE type::record($id);', { id: String(recordId) });
  }

  return row.data ?? null;
}

module.exports = {
  savePaymentWebhook,
  consumePaymentWebhook,
};
