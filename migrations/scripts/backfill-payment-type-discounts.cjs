'use strict';

/**
 * Invert payment_type.discounts links into discount.targets.payment_type_ids
 * so bank/card promos are owned by the discount engine only.
 *
 * Idempotent: re-running merges IDs without duplicates, then clears reverse links.
 *
 * Usage:
 *   SURREAL_URL=ws://127.0.0.1:8000/rpc \
 *   SURREAL_NS=posr SURREAL_DB=posr SURREAL_USER=root SURREAL_PASS=root \
 *   node migrations/scripts/backfill-payment-type-discounts.cjs
 *
 * Env:
 *   DRY_RUN=1 — log only, do not write
 */

const WS = require('ws');
const { Surreal } = require('surrealdb');
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER || 'root';
const DB_PASS = process.env.SURREAL_PASS || 'root';
const DRY_RUN = process.env.DRY_RUN === '1';

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

const toId = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const asString = value.toString();
    if (asString && asString !== '[object Object]' && asString.includes(':')) {
      return asString;
    }
  }
  if (typeof value === 'object' && value.tb != null && value.id != null) {
    return `${value.tb}:${value.id}`;
  }
  return String(value);
};

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  const paymentTypes = rows(
    await db.query(
      `SELECT id, name, discounts FROM payment_type
       WHERE deleted_at = none
         AND discounts != none
         AND array::len(discounts ?? []) > 0`
    )
  );

  console.log(`Found ${paymentTypes.length} payment type(s) with legacy discounts`);

  /** @type {Map<string, Set<string>>} discountId -> paymentTypeIds */
  const discountToPaymentTypes = new Map();

  for (const pt of paymentTypes) {
    const ptId = toId(pt.id);
    if (!ptId) continue;
    for (const d of pt.discounts || []) {
      const discountId = toId(typeof d === 'object' && d?.id != null ? d.id : d);
      if (!discountId) continue;
      if (!discountToPaymentTypes.has(discountId)) {
        discountToPaymentTypes.set(discountId, new Set());
      }
      discountToPaymentTypes.get(discountId).add(ptId);
    }
  }

  let updatedDiscounts = 0;
  for (const [discountId, ptSet] of discountToPaymentTypes) {
    const [existingRows] = await db.query(
      `SELECT id, targets, application_mode FROM type::thing($id)`,
      { id: discountId }
    );
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
    if (!existing) {
      console.warn(`  skip missing discount ${discountId}`);
      continue;
    }

    const targets = { ...(existing.targets || {}) };
    const current = new Set(
      (targets.payment_type_ids || []).map(toId).filter(Boolean)
    );
    for (const id of ptSet) current.add(id);
    targets.payment_type_ids = [...current];

    let applicationMode = existing.application_mode;
    if (!applicationMode || applicationMode === 'manual') {
      // ensure pay-time automatic evaluation can pick this up
      applicationMode = applicationMode === 'manual' ? 'both' : (applicationMode || 'automatic');
    }

    console.log(
      `  discount ${discountId}: payment_type_ids=${targets.payment_type_ids.join(', ')} mode=${applicationMode}`
    );

    if (!DRY_RUN) {
      await db.merge(discountId, {
        targets,
        application_mode: applicationMode,
      });
    }
    updatedDiscounts += 1;
  }

  let clearedPaymentTypes = 0;
  for (const pt of paymentTypes) {
    console.log(`  clear payment_type ${toId(pt.id)} (${pt.name}) discounts`);
    if (!DRY_RUN) {
      await db.merge(pt.id, {
        discounts: null,
        has_discount: false,
      });
    }
    clearedPaymentTypes += 1;
  }

  console.log(
    `Done. ${DRY_RUN ? '[DRY_RUN] ' : ''}Updated ${updatedDiscounts} discount(s), cleared ${clearedPaymentTypes} payment type(s).`
  );
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
