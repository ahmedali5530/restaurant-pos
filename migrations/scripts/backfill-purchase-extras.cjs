'use strict';

/**
 * Normalize legacy purchase extras `{ name, amount }` to the landed-cost shape.
 * Does NOT re-post purchases or rewrite inventory_ledger.
 *
 * Usage (from payments/ which has surrealdb + ws):
 *   cd payments
 *   NODE_PATH=./node_modules \
 *   SURREAL_URL=ws://localhost:8000/rpc \
 *   SURREAL_NS=posr SURREAL_DB=posr \
 *   SURREAL_USER=root SURREAL_PASS=root \
 *   node ../migrations/scripts/backfill-purchase-extras.cjs
 *
 * Env:
 *   DRY_RUN=1 — count only, do not write
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
  console.error('ERROR: SURREAL_USER and SURREAL_PASS env vars are required. The previous root/root fallback was removed for security — set them explicitly (must match the existing SurrealDB root user created on first start).');
  process.exit(1);
}
const DRY_RUN = process.env.DRY_RUN === '1';

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

const inferCategory = (name) => {
  const n = String(name || '').toLowerCase();
  if (n.includes('discount') || n.includes('rebate')) return 'Discount';
  if (n.includes('shipping') || n.includes('ship')) return 'Shipping';
  if (n.includes('freight')) return 'Freight';
  if (n.includes('insurance')) return 'Insurance';
  if (n.includes('customs') || n.includes('custom')) return 'Customs';
  if (n.includes('duty') || n.includes('import')) return 'ImportDuty';
  if (n.includes('handling') || n.includes('handle')) return 'Handling';
  if (n.includes('tax') || n.includes('vat') || n.includes('gst')) return 'Tax';
  return 'Miscellaneous';
};

const defaultTreatment = (category) => {
  if (category === 'Tax') return 'ignore';
  return 'capitalize';
};

const normalizeExtra = (extra) => {
  if (!extra || typeof extra !== 'object') return null;
  if (extra.category && extra.allocation_method && extra.inventory_treatment) {
    return { ...extra, _unchanged: true };
  }
  const name = String(extra.name || 'Extra').trim() || 'Extra';
  const amount = Number(extra.amount) || 0;
  const category = extra.category || inferCategory(name);
  let inventory_treatment = extra.inventory_treatment || defaultTreatment(category);
  let tax_behavior = extra.tax_behavior ?? null;
  if (category === 'Tax') {
    tax_behavior = tax_behavior || 'non_recoverable';
    if (!extra.inventory_treatment) {
      inventory_treatment =
        tax_behavior === 'non_recoverable' || tax_behavior === 'exclusive'
          ? 'capitalize'
          : 'ignore';
    }
  }
  let normalizedAmount = amount;
  if (category === 'Discount' && normalizedAmount > 0) {
    normalizedAmount = -normalizedAmount;
  }
  return {
    name,
    amount: normalizedAmount,
    category,
    allocation_method: extra.allocation_method || 'by_value',
    inventory_treatment,
    tax_behavior,
    notes: extra.notes,
    account_hint: extra.account_hint,
    manual_allocations: extra.manual_allocations,
  };
};

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  const purchases = rows(
    await db.query(`SELECT id, extras FROM inventory_purchase WHERE extras != NONE AND array::len(extras) > 0`)
  );

  let updated = 0;
  let skipped = 0;

  for (const purchase of purchases) {
    const extras = Array.isArray(purchase.extras) ? purchase.extras : [];
    const next = extras.map(normalizeExtra).filter(Boolean);
    const allUnchanged = next.every((e) => e._unchanged);
    if (allUnchanged) {
      skipped += 1;
      continue;
    }
    const cleaned = next.map(({ _unchanged, ...rest }) => rest);
    if (DRY_RUN) {
      console.log(`[DRY_RUN] would update ${purchase.id}`);
      updated += 1;
      continue;
    }
    await db.query(`UPDATE $id SET extras = $extras`, {
      id: purchase.id,
      extras: cleaned,
    });
    updated += 1;
  }

  console.log(`Done. updated=${updated} skipped=${skipped} dry_run=${DRY_RUN}`);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
