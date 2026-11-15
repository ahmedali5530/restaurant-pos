'use strict';

/**
 * Move menu_item.kra_* overrides into integration_entity_mapping payload
 * for provider:kra before those dish columns are removed.
 *
 * Usage:
 *   SURREAL_USER=... SURREAL_PASS=... node migrations/scripts/backfill-kra-dish-fields-to-mapping.cjs
 *
 * Env:
 *   DRY_RUN=1 — log only
 */

const WS = require('ws');
const { Surreal } = require('surrealdb');
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
if (!DB_USER || !DB_PASS) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS env vars are required.');
  process.exit(1);
}
const DRY_RUN = process.env.DRY_RUN === '1';

const PROVIDER_ID = 'provider:kra';
const CONFIG_KEY = `integration_provider_config:${PROVIDER_ID}`;
const PENDING_PREFIX = '__pending__:';

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

const toId = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const asString = value.toString();
    if (asString && asString !== '[object Object]') return asString;
  }
  if (typeof value === 'object' && value.tb != null && value.id != null) {
    return `${value.tb}:${value.id}`;
  }
  return String(value);
};

(async () => {
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });
  console.log(`Connected ${DB_URL} ${DB_NS}/${DB_NAME} DRY_RUN=${DRY_RUN}`);

  const configRows = rows(
    await db.query(
      `SELECT values FROM setting WHERE key = $key AND is_global = true LIMIT 1`,
      { key: CONFIG_KEY }
    )
  );
  const values = configRows[0]?.values || {};
  const tin = String(values.tin || '').trim().toUpperCase();
  const bhfId = String(values.bhfId || '').trim();
  const tenantId = tin && bhfId ? `${tin}:${bhfId}` : '';

  const dishes = rows(
    await db.query(
      `SELECT id, kra_item_cls_cd, kra_tax_ty_cd FROM menu_item
       WHERE kra_item_cls_cd != NONE OR kra_tax_ty_cd != NONE`
    )
  );

  console.log(`Dishes with kra_* fields: ${dishes.length}; tenantId=${tenantId || '(none)'}`);

  let updated = 0;
  let created = 0;
  let skipped = 0;

  if (tenantId) {
    for (const dish of dishes) {
      const posrId = toId(dish.id);
      if (!posrId) {
        skipped += 1;
        continue;
      }
      const itemClsCd = dish.kra_item_cls_cd != null ? String(dish.kra_item_cls_cd).trim() : '';
      const taxTyCd = dish.kra_tax_ty_cd != null
        ? String(dish.kra_tax_ty_cd).trim().toUpperCase()
        : '';
      if (!itemClsCd && !taxTyCd) {
        skipped += 1;
        continue;
      }

      const existing = rows(
        await db.query(
          `SELECT * FROM integration_entity_mapping
           WHERE provider_id = $providerId AND tenant_id = $tenantId
             AND entity_type = 'item' AND posr_id = $posrId
           LIMIT 1`,
          { providerId: PROVIDER_ID, tenantId, posrId }
        )
      )[0];

      const externalId = existing?.external_id
        ? String(existing.external_id)
        : `${PENDING_PREFIX}${posrId}`;
      const registered =
        Boolean(existing?.external_id) &&
        !String(existing.external_id).startsWith(PENDING_PREFIX);
      const prevPayload =
        (existing && (existing.external_payload || existing.externalPayload)) || {};
      const externalPayload = {
        ...prevPayload,
        itemClsCd: itemClsCd || prevPayload.itemClsCd || null,
        taxTyCd: taxTyCd || prevPayload.taxTyCd || null,
        registered: registered || prevPayload.registered === true,
      };

      if (DRY_RUN) {
        console.log(existing ? 'would-update' : 'would-create', posrId, externalPayload);
        if (existing) updated += 1;
        else created += 1;
        continue;
      }

      if (existing?.id) {
        await db.merge(toId(existing.id), {
          external_id: externalId,
          external_payload: externalPayload,
          updated_at: new Date().toISOString(),
        });
        updated += 1;
      } else {
        await db.create('integration_entity_mapping', {
          provider_id: PROVIDER_ID,
          tenant_id: tenantId,
          entity_type: 'item',
          posr_id: posrId,
          external_id: externalId,
          external_payload: externalPayload,
          updated_at: new Date().toISOString(),
        });
        created += 1;
      }
    }
  } else if (dishes.length) {
    console.warn(
      'KRA provider config missing tin/bhfId — dish kra_* values will be dropped with the columns.'
    );
  }

  console.log(JSON.stringify({ created, updated, skipped, dryRun: DRY_RUN }));
  await db.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
