'use strict';

/**
 * Backfill script: set branch_id on existing orders, kitchen items, and day
 * closings that were created before the branch_id field was added.
 *
 * Strategy:
 *   - For each order without branch_id: look up the creating user's branch_id
 *     and copy it to the order. Orders where the user has no branch_id remain
 *     null (visible to all — backward compatible).
 *   - For order_item_kitchen: derive from the parent order's branch_id.
 *   - For day_closing: look up the closing user's branch_id.
 *
 * Idempotent: skips rows that already have a branch_id set.
 *
 * Env vars (required):
 *   SURREAL_USER / SURREAL_PASS (no root/root fallback)
 *   SURREAL_URL (default ws://surrealdb:8000/rpc)
 *   SURREAL_NS / SURREAL_DB (default posr)
 *   DRY_RUN=1 (optional — report without writing)
 *
 * Usage:
 *   SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/backfill-branch-id.cjs
 *
 *   # Dry run:
 *   DRY_RUN=1 SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/backfill-branch-id.cjs
 *
 * See: migrations/2026_08_28_user_branch_id.surql (adds branch_id fields)
 * See: migrations/scripts/apply-row-level-permissions.cjs (uses branch_id)
 */

const { Surreal } = require('surrealdb');

const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_URL = process.env.SURREAL_URL || 'ws://surrealdb:8000/rpc';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

if (require.main === module && (!DB_USER || !DB_PASS)) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS are required (no root/root fallback).');
  process.exit(1);
}

/**
 * Backfill branch_id on the `order` table by copying from the creating user.
 */
async function backfillOrders(db) {
  // Find orders without branch_id, FETCH the creating user to read their branch_id.
  const rows = await db.query(
    `SELECT id, user, user.branch_id AS user_branch_id
     FROM order
     WHERE branch_id = NONE
     LIMIT 5000;`
  );
  const list = Array.isArray(rows) ? rows[0] || rows : rows;
  const orders = Array.isArray(list) ? list : [];

  if (orders.length === 0) {
    console.log('  orders: 0 rows need backfill (all already have branch_id).');
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  console.log(`  orders: ${orders.length} rows without branch_id. Backfilling from user...`);

  let updated = 0;
  let skipped = 0;

  for (const order of orders) {
    // user_branch_id comes from the FETCH — it's the user's home branch.
    const userBranchId = order.user_branch_id;
    if (!userBranchId) {
      // The creating user has no branch_id — skip (order remains visible to all).
      skipped++;
      continue;
    }

    const branchIdStr = typeof userBranchId === 'object'
      ? userBranchId?.id?.toString?.() || String(userBranchId?.id || '')
      : String(userBranchId);

    if (DRY_RUN) {
      console.log(`    DRY-RUN  ${order.id} → branch_id=${branchIdStr}`);
      updated++;
      continue;
    }

    try {
      await db.query(
        `UPDATE type::record($id) SET branch_id = type::record($branch);`,
        { id: String(order.id), branch: branchIdStr }
      );
      updated++;
    } catch (err) {
      console.error(`    FAIL     ${order.id}: ${err.message}`);
    }
  }

  return { scanned: orders.length, updated, skipped };
}

/**
 * Backfill branch_id on order_item_kitchen by copying from the parent order.
 */
async function backfillKitchenItems(db) {
  // Find kitchen items without branch_id, FETCH the parent order_item → order.
  const rows = await db.query(
    `SELECT id, order_item.order.branch_id AS order_branch_id
     FROM order_item_kitchen
     WHERE branch_id = NONE
     LIMIT 5000;`
  );
  const list = Array.isArray(rows) ? rows[0] || rows : rows;
  const items = Array.isArray(list) ? list : [];

  if (items.length === 0) {
    console.log('  order_item_kitchen: 0 rows need backfill.');
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  console.log(`  order_item_kitchen: ${items.length} rows without branch_id. Backfilling from parent order...`);

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const orderBranchId = item.order_branch_id;
    if (!orderBranchId) {
      skipped++;
      continue;
    }

    const branchIdStr = typeof orderBranchId === 'object'
      ? orderBranchId?.id?.toString?.() || String(orderBranchId?.id || '')
      : String(orderBranchId);

    if (DRY_RUN) {
      console.log(`    DRY-RUN  ${item.id} → branch_id=${branchIdStr}`);
      updated++;
      continue;
    }

    try {
      await db.query(
        `UPDATE type::record($id) SET branch_id = type::record($branch);`,
        { id: String(item.id), branch: branchIdStr }
      );
      updated++;
    } catch (err) {
      console.error(`    FAIL     ${item.id}: ${err.message}`);
    }
  }

  return { scanned: items.length, updated, skipped };
}

/**
 * Backfill branch_id on day_closing by copying from the closing user.
 */
async function backfillDayClosings(db) {
  // Find day_closings without branch_id, FETCH the user.
  const rows = await db.query(
    `SELECT id, user, user.branch_id AS user_branch_id
     FROM day_closing
     WHERE branch_id = NONE
     LIMIT 5000;`
  );
  const list = Array.isArray(rows) ? rows[0] || rows : rows;
  const closings = Array.isArray(list) ? list : [];

  if (closings.length === 0) {
    console.log('  day_closing: 0 rows need backfill.');
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  console.log(`  day_closing: ${closings.length} rows without branch_id. Backfilling from user...`);

  let updated = 0;
  let skipped = 0;

  for (const closing of closings) {
    const userBranchId = closing.user_branch_id;
    if (!userBranchId) {
      skipped++;
      continue;
    }

    const branchIdStr = typeof userBranchId === 'object'
      ? userBranchId?.id?.toString?.() || String(userBranchId?.id || '')
      : String(userBranchId);

    if (DRY_RUN) {
      console.log(`    DRY-RUN  ${closing.id} → branch_id=${branchIdStr}`);
      updated++;
      continue;
    }

    try {
      await db.query(
        `UPDATE type::record($id) SET branch_id = type::record($branch);`,
        { id: String(closing.id), branch: branchIdStr }
      );
      updated++;
    } catch (err) {
      console.error(`    FAIL     ${closing.id}: ${err.message}`);
    }
  }

  return { scanned: closings.length, updated, skipped };
}

async function main() {
  console.log('Connecting to', DB_URL, 'ns=' + DB_NS, 'db=' + DB_NAME);
  const db = new Surreal();
  await db.connect(DB_URL, {
    namespace: DB_NS,
    database: DB_NAME,
    auth: { username: DB_USER, password: DB_PASS },
  });

  console.log('');
  console.log(`Backfilling branch_id on historical rows.${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);
  console.log('');

  const orderResult = await backfillOrders(db);
  console.log(`  → orders: scanned=${orderResult.scanned}, updated=${orderResult.updated}, skipped (no user branch)=${orderResult.skipped}`);
  console.log('');

  const kitchenResult = await backfillKitchenItems(db);
  console.log(`  → order_item_kitchen: scanned=${kitchenResult.scanned}, updated=${kitchenResult.updated}, skipped=${kitchenResult.skipped}`);
  console.log('');

  const closingResult = await backfillDayClosings(db);
  console.log(`  → day_closing: scanned=${closingResult.scanned}, updated=${closingResult.updated}, skipped=${closingResult.skipped}`);
  console.log('');

  const totalUpdated = orderResult.updated + kitchenResult.updated + closingResult.updated;
  const totalSkipped = orderResult.skipped + kitchenResult.skipped + closingResult.skipped;

  console.log(`Done. Total updated: ${totalUpdated}, skipped (no user branch): ${totalSkipped}${DRY_RUN ? ' (DRY RUN)' : ''}.`);

  if (!DRY_RUN && totalUpdated > 0) {
    console.log('');
    console.log('Historical rows now have branch_id set. Row-level PERMISSIONS');
    console.log('(from apply-row-level-permissions.cjs) will now filter them by');
    console.log("the user's home branch — waiters at Branch A can no longer see");
    console.log("Branch B's historical orders.");
  }

  if (totalSkipped > 0) {
    console.log('');
    console.log(`Note: ${totalSkipped} rows were skipped because their creating`);
    console.log('user has no branch_id. These rows remain visible to ALL users');
    console.log('(backward compatible). To restrict them, set branch_id on the');
    console.log('relevant users first, then re-run this script.');
  }

  await db.close();
}

module.exports = {
  backfillOrders,
  backfillKitchenItems,
  backfillDayClosings,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
