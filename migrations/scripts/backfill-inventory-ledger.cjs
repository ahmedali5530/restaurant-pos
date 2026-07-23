'use strict';

/**
 * Backfill inventory_ledger from existing movement tables (idempotent).
 *
 * Prerequisite: apply migrations/2026_07_17_inventory_ledger.surql first.
 *
 * Sign map (matches computeStoreNet):
 *   purchase              +quantity
 *   purchase_return       -quantity
 *   issue                 -quantity
 *   issue_return          +quantity
 *   waste                 -quantity
 *   transfer_out          -quantity
 *   transfer_in           +quantity
 *   production_input      -quantity
 *   production_output     +quantity (disposition=inventory only)
 *   buffet_consumption    -quantity
 *
 * ledger_key = `${reference_type}:${reference_item_id}` — unique, re-runnable.
 *
 * After backfill, optionally run reconciliation (default on) comparing
 * SUM(ledger) vs legacy movement-table nets per item+store.
 *
 * Usage (from payments/ which has surrealdb + ws):
 *   cd payments
 *   NODE_PATH=./node_modules \
 *   SURREAL_URL=ws://localhost:8000/rpc \
 *   SURREAL_NS=posr SURREAL_DB=posr \
 *   SURREAL_USER=root SURREAL_PASS=root \
 *   node ../migrations/scripts/backfill-inventory-ledger.cjs
 *
 * Or via helper:
 *   ./migrations/scripts/run-backfill-inventory-ledger.sh
 *
 * Env:
 *   SKIP_RECONCILE=1  — skip reconciliation pass
 *   DRY_RUN=1         — count only, do not write
 */

const WS = require('ws');
const { Surreal, StringRecordId } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER || 'root';
const DB_PASS = process.env.SURREAL_PASS || 'root';
const DRY_RUN = process.env.DRY_RUN === '1';
const SKIP_RECONCILE = process.env.SKIP_RECONCILE === '1';

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

const toId = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  // Surreal RecordId: toString() => "table:key"; .id alone is just the key
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const asString = value.toString();
    if (asString && asString !== '[object Object]' && asString.includes(':')) {
      return asString;
    }
  }
  if (typeof value === 'object' && value.tb != null && value.id != null) {
    return `${value.tb}:${value.id}`;
  }
  if (typeof value === 'object' && value.id != null) {
    return toId(value.id);
  }
  return String(value);
};

const businessDateFrom = (createdAt) => {
  try {
    if (!createdAt) return new Date().toISOString().slice(0, 10);
    const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {
    // fall through
  }
  return new Date().toISOString().slice(0, 10);
};

const resolveRecord = (value) => {
  if (!value) return null;
  return toId(value);
};

async function upsertLedger(db, entry) {
  const existing = rows(
    await db.query(
      `SELECT id FROM inventory_ledger WHERE ledger_key = $key LIMIT 1`,
      { key: entry.ledger_key }
    )
  );
  if (existing.length > 0) {
    return 'skipped';
  }
  if (DRY_RUN) {
    return 'dry';
  }

  // SurrealDB 3.x: JS `null` becomes NULL and fails option<field> coercion.
  // Omit optional fields (or leave unset) instead of passing null.
  const params = {
    created_at: entry.created_at || new Date(),
    business_date: entry.business_date,
    inventory_item: new StringRecordId(entry.inventory_item),
    inventory_location: new StringRecordId(entry.inventory_location),
    quantity_change: entry.quantity_change,
    reference_type: entry.reference_type,
    reference_id: entry.reference_id,
    ledger_key: entry.ledger_key,
  };

  const sets = [
    'created_at = $created_at',
    'business_date = $business_date',
    'inventory_item = $inventory_item',
    'inventory_location = $inventory_location',
    'quantity_change = $quantity_change',
    'reference_type = $reference_type',
    'reference_id = $reference_id',
    'ledger_key = $ledger_key',
  ];

  if (entry.created_by) {
    params.created_by = new StringRecordId(entry.created_by);
    sets.push('created_by = $created_by');
  }
  if (entry.unit_cost != null && Number.isFinite(Number(entry.unit_cost))) {
    params.unit_cost = Number(entry.unit_cost);
    sets.push('unit_cost = $unit_cost');
  }
  if (entry.total_cost != null && Number.isFinite(Number(entry.total_cost))) {
    params.total_cost = Number(entry.total_cost);
    sets.push('total_cost = $total_cost');
  }
  if (entry.reference_item) {
    params.reference_item = entry.reference_item;
    sets.push('reference_item = $reference_item');
  }
  if (entry.notes) {
    params.notes = entry.notes;
    sets.push('notes = $notes');
  }

  await db.query(`CREATE inventory_ledger SET ${sets.join(', ')}`, params);
  return 'created';
}

async function backfillPurchases(db, stats) {
  const items = rows(
    await db.query(
      `SELECT id, item, store, quantity, price, purchase, purchase.created_at AS created_at, purchase.created_by AS created_by
       FROM inventory_purchase_item
       WHERE item != NONE AND store != NONE`
    )
  );
  for (const row of items) {
    const itemId = resolveRecord(row.item);
    const storeId = resolveRecord(row.store);
    const lineId = toId(row.id);
    const purchaseId = resolveRecord(row.purchase);
    if (!itemId || !storeId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    const unit = Number(row.price) || 0;
    const result = await upsertLedger(db, {
      created_at: row.created_at,
      created_by: resolveRecord(row.created_by),
      business_date: businessDateFrom(row.created_at),
      inventory_item: itemId,
      inventory_location: storeId,
      quantity_change: qty,
      unit_cost: unit,
      total_cost: unit * qty,
      reference_type: 'purchase',
      reference_id: purchaseId || lineId,
      reference_item: lineId,
      ledger_key: `purchase:${lineId}`,
    });
    stats[result] += 1;
  }
}

async function backfillPurchaseReturns(db, stats) {
  const items = rows(
    await db.query(
      `SELECT id, item, quantity, price, purchase_return, purchase_item,
              purchase_item.store AS store,
              purchase_return.created_at AS created_at,
              purchase_return.created_by AS created_by,
              store AS line_store
       FROM inventory_purchase_return_item
       WHERE item != NONE`
    )
  );
  for (const row of items) {
    const itemId = resolveRecord(row.item);
    const storeId = resolveRecord(row.store) || resolveRecord(row.line_store);
    const lineId = toId(row.id);
    const refId = resolveRecord(row.purchase_return);
    if (!itemId || !storeId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    const unit = Number(row.price) || 0;
    const result = await upsertLedger(db, {
      created_at: row.created_at,
      created_by: resolveRecord(row.created_by),
      business_date: businessDateFrom(row.created_at),
      inventory_item: itemId,
      inventory_location: storeId,
      quantity_change: -qty,
      unit_cost: unit,
      total_cost: unit * qty,
      reference_type: 'purchase_return',
      reference_id: refId || lineId,
      reference_item: lineId,
      ledger_key: `purchase_return:${lineId}`,
    });
    stats[result] += 1;
  }
}

async function backfillIssues(db, stats) {
  const items = rows(
    await db.query(
      `SELECT id, item, store, quantity, price, issue,
              issue.created_at AS created_at, issue.created_by AS created_by
       FROM inventory_issue_item
       WHERE item != NONE AND store != NONE`
    )
  );
  for (const row of items) {
    const itemId = resolveRecord(row.item);
    const storeId = resolveRecord(row.store);
    const lineId = toId(row.id);
    const refId = resolveRecord(row.issue);
    if (!itemId || !storeId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    const unit = Number(row.price) || 0;
    const result = await upsertLedger(db, {
      created_at: row.created_at,
      created_by: resolveRecord(row.created_by),
      business_date: businessDateFrom(row.created_at),
      inventory_item: itemId,
      inventory_location: storeId,
      quantity_change: -qty,
      unit_cost: unit,
      total_cost: unit * qty,
      reference_type: 'issue',
      reference_id: refId || lineId,
      reference_item: lineId,
      ledger_key: `issue:${lineId}`,
    });
    stats[result] += 1;
  }
}

async function backfillIssueReturns(db, stats) {
  const items = rows(
    await db.query(
      `SELECT id, item, quantity, price, issue_return, issued_item,
              store AS line_store,
              issued_item.store AS issued_store,
              issue_return.store AS header_store,
              issue_return.created_at AS created_at,
              issue_return.created_by AS created_by
       FROM inventory_issue_return_item
       WHERE item != NONE`
    )
  );
  for (const row of items) {
    const itemId = resolveRecord(row.item);
    const storeId =
      resolveRecord(row.line_store) ||
      resolveRecord(row.issued_store) ||
      resolveRecord(row.header_store);
    const lineId = toId(row.id);
    const refId = resolveRecord(row.issue_return);
    if (!itemId || !storeId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    const unit = Number(row.price) || 0;
    const result = await upsertLedger(db, {
      created_at: row.created_at,
      created_by: resolveRecord(row.created_by),
      business_date: businessDateFrom(row.created_at),
      inventory_item: itemId,
      inventory_location: storeId,
      quantity_change: qty,
      unit_cost: unit,
      total_cost: unit * qty,
      reference_type: 'issue_return',
      reference_id: refId || lineId,
      reference_item: lineId,
      ledger_key: `issue_return:${lineId}`,
    });
    stats[result] += 1;
  }
}

async function backfillWaste(db, stats) {
  const items = rows(
    await db.query(
      `SELECT id, item, quantity, price, waste, store, purchase_item, issue_item, source,
              purchase_item.store AS purchase_store,
              issue_item.store AS issue_store,
              waste.created_at AS created_at,
              waste.created_by AS created_by
       FROM inventory_item_waste_item
       WHERE item != NONE`
    )
  );
  for (const row of items) {
    const itemId = resolveRecord(row.item);
    const storeId =
      resolveRecord(row.store) ||
      resolveRecord(row.purchase_store) ||
      resolveRecord(row.issue_store);
    const lineId = toId(row.id);
    const refId = resolveRecord(row.waste);
    if (!itemId || !storeId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    const unit = Number(row.price) || 0;
    const result = await upsertLedger(db, {
      created_at: row.created_at,
      created_by: resolveRecord(row.created_by),
      business_date: businessDateFrom(row.created_at),
      inventory_item: itemId,
      inventory_location: storeId,
      quantity_change: -qty,
      unit_cost: unit,
      total_cost: unit * qty,
      reference_type: 'waste',
      reference_id: refId || lineId,
      reference_item: lineId,
      notes: row.source ? `source:${row.source}` : null,
      ledger_key: `waste:${lineId}`,
    });
    stats[result] += 1;
  }
}

async function backfillTransfers(db, stats) {
  const items = rows(
    await db.query(
      `SELECT id, item, quantity, transfer,
              transfer.from_location AS from_location,
              transfer.to_location AS to_location,
              transfer.from_store AS from_store,
              transfer.to_store AS to_store,
              transfer.created_at AS created_at,
              transfer.created_by AS created_by
       FROM stock_transfer_item
       WHERE item != NONE`
    )
  );
  for (const row of items) {
    const itemId = resolveRecord(row.item);
    const fromLocation = resolveRecord(row.from_location) || resolveRecord(row.from_store);
    const toLocation = resolveRecord(row.to_location) || resolveRecord(row.to_store);
    const lineId = toId(row.id);
    const refId = resolveRecord(row.transfer);
    if (!itemId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    if (fromLocation) {
      const result = await upsertLedger(db, {
        created_at: row.created_at,
        created_by: resolveRecord(row.created_by),
        business_date: businessDateFrom(row.created_at),
        inventory_item: itemId,
        inventory_location: fromLocation,
        quantity_change: -qty,
        reference_type: 'transfer_out',
        reference_id: refId || lineId,
        reference_item: lineId,
        ledger_key: `transfer_out:${lineId}`,
      });
      stats[result] += 1;
    }
    if (toLocation) {
      const result = await upsertLedger(db, {
        created_at: row.created_at,
        created_by: resolveRecord(row.created_by),
        business_date: businessDateFrom(row.created_at),
        inventory_item: itemId,
        inventory_location: toLocation,
        quantity_change: qty,
        reference_type: 'transfer_in',
        reference_id: refId || lineId,
        reference_item: lineId,
        ledger_key: `transfer_in:${lineId}`,
      });
      stats[result] += 1;
    }
  }
}

async function backfillProduction(db, stats) {
  const inputs = rows(
    await db.query(
      `SELECT id, item, store, quantity, unit_cost, total_cost, batch,
              batch.status AS batch_status,
              batch.created_at AS created_at,
              batch.created_by AS created_by
       FROM production_batch_input
       WHERE item != NONE AND store != NONE AND batch.status = 'completed'`
    )
  );
  for (const row of inputs) {
    const itemId = resolveRecord(row.item);
    const storeId = resolveRecord(row.store);
    const lineId = toId(row.id);
    const refId = resolveRecord(row.batch);
    if (!itemId || !storeId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    const unit = Number(row.unit_cost) || 0;
    const result = await upsertLedger(db, {
      created_at: row.created_at,
      created_by: resolveRecord(row.created_by),
      business_date: businessDateFrom(row.created_at),
      inventory_item: itemId,
      inventory_location: storeId,
      quantity_change: -qty,
      unit_cost: unit,
      total_cost: Number(row.total_cost) || unit * qty,
      reference_type: 'production_input',
      reference_id: refId || lineId,
      reference_item: lineId,
      ledger_key: `production_input:${lineId}`,
    });
    stats[result] += 1;
  }

  const outputs = rows(
    await db.query(
      `SELECT id, item, store, quantity, unit_cost, allocated_cost, disposition, batch,
              batch.status AS batch_status,
              batch.created_at AS created_at,
              batch.created_by AS created_by
       FROM production_batch_output
       WHERE item != NONE AND store != NONE
         AND batch.status = 'completed'
         AND disposition = 'inventory'`
    )
  );
  for (const row of outputs) {
    const itemId = resolveRecord(row.item);
    const storeId = resolveRecord(row.store);
    const lineId = toId(row.id);
    const refId = resolveRecord(row.batch);
    if (!itemId || !storeId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    const unit = Number(row.unit_cost) || 0;
    const result = await upsertLedger(db, {
      created_at: row.created_at,
      created_by: resolveRecord(row.created_by),
      business_date: businessDateFrom(row.created_at),
      inventory_item: itemId,
      inventory_location: storeId,
      quantity_change: qty,
      unit_cost: unit,
      total_cost: Number(row.allocated_cost) || unit * qty,
      reference_type: 'production_output',
      reference_id: refId || lineId,
      reference_item: lineId,
      ledger_key: `production_output:${lineId}`,
    });
    stats[result] += 1;
  }
}

async function backfillBuffet(db, stats) {
  const logs = rows(
    await db.query(
      `SELECT id, item, quantity, session, consumption_type,
              session.store AS store,
              session.closed_at AS created_at,
              session.created_by AS created_by,
              posted_to_ledger
       FROM buffet_consumption_log
       WHERE item != NONE AND posted_to_ledger = true`
    )
  );
  for (const row of logs) {
    const itemId = resolveRecord(row.item);
    const storeId = resolveRecord(row.store);
    const lineId = toId(row.id);
    const refId = resolveRecord(row.session);
    if (!itemId || !storeId || !lineId) {
      stats.skippedBad += 1;
      continue;
    }
    const qty = Number(row.quantity) || 0;
    const result = await upsertLedger(db, {
      created_at: row.created_at,
      created_by: resolveRecord(row.created_by),
      business_date: businessDateFrom(row.created_at),
      inventory_item: itemId,
      inventory_location: storeId,
      quantity_change: -qty,
      reference_type: 'buffet_consumption',
      reference_id: refId || lineId,
      reference_item: lineId,
      notes: row.consumption_type ? `type:${row.consumption_type}` : null,
      ledger_key: `buffet_consumption:${lineId}`,
    });
    stats[result] += 1;
  }
}

const totalOf = (result) => {
  const list = rows(result);
  return Number(list[0]?.total ?? 0);
};

async function sumQuery(db, sql, params) {
  return totalOf(await db.query(sql, params));
}

async function reconcile(db) {
  console.log('\nReconciling ledger net vs legacy movement nets...');

  const pairs = rows(
    await db.query(
      `SELECT inventory_item AS item, inventory_location AS store,
              math::sum(quantity_change) AS ledger_net
       FROM inventory_ledger
       GROUP BY inventory_item, inventory_location`
    )
  );

  let mismatches = 0;
  let checked = 0;

  for (const pair of pairs) {
    const itemId = resolveRecord(pair.item);
    const storeId = resolveRecord(pair.store);
    if (!itemId || !storeId) continue;

    const itemRef = new StringRecordId(itemId);
    const storeRef = new StringRecordId(storeId);
    const params = { item: itemRef, store: storeRef };

    // Sequential queries (Surreal 3): avoid Promise.all + JS null; use math::sum / NONE.
    const purchases = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM inventory_purchase_item WHERE item = $item AND store = $store GROUP ALL`,
      params
    );
    const returns = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM inventory_purchase_return_item
       WHERE item = $item AND purchase_item.store = $store GROUP ALL`,
      params
    );
    const issues = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM inventory_issue_item WHERE item = $item AND store = $store GROUP ALL`,
      params
    );
    const issueReturns = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM inventory_issue_return_item
       WHERE item = $item AND (store = $store OR issued_item.store = $store OR issue_return.store = $store) GROUP ALL`,
      params
    );
    const wastePurchase = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM inventory_item_waste_item
       WHERE item = $item AND purchase_item != NONE AND purchase_item.store = $store GROUP ALL`,
      params
    );
    const wasteIssue = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM inventory_item_waste_item
       WHERE item = $item AND issue_item != NONE AND issue_item.store = $store GROUP ALL`,
      params
    );
    const wasteDirect = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM inventory_item_waste_item
       WHERE item = $item AND store = $store GROUP ALL`,
      params
    );
    const transferOut = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM stock_transfer_item
       WHERE item = $item AND transfer.from_store = $store GROUP ALL`,
      params
    );
    const transferIn = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM stock_transfer_item
       WHERE item = $item AND transfer.to_store = $store GROUP ALL`,
      params
    );
    const prodIn = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM production_batch_input
       WHERE item = $item AND store = $store AND batch.status = 'completed' GROUP ALL`,
      params
    );
    const prodOut = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM production_batch_output
       WHERE item = $item AND store = $store AND batch.status = 'completed' AND disposition = 'inventory' GROUP ALL`,
      params
    );
    const buffet = await sumQuery(
      db,
      `SELECT math::sum(quantity) AS total FROM buffet_consumption_log
       WHERE item = $item AND session.store = $store AND posted_to_ledger = true GROUP ALL`,
      params
    );

    const waste = Math.max(wastePurchase + wasteIssue, wasteDirect);
    const legacyNet =
      purchases
      - returns
      - issues
      + issueReturns
      - waste
      - transferOut
      + transferIn
      - prodIn
      + prodOut
      - buffet;

    const ledgerNet = Number(pair.ledger_net ?? 0);
    checked += 1;

    if (Math.abs(ledgerNet - legacyNet) > 0.0001) {
      mismatches += 1;
      console.warn(
        `MISMATCH item=${itemId} store=${storeId} ledger=${ledgerNet} legacy=${legacyNet}`
      );
    } else {
      console.log(`OK item=${itemId} store=${storeId} net=${ledgerNet}`);
    }
  }

  console.log(`Reconcile checked=${checked} mismatches=${mismatches}`);
  return mismatches;
}

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL, {
    namespace: DB_NS,
    database: DB_NAME,
    authentication: { username: DB_USER, password: DB_PASS },
  });

  console.log(`Connected to SurrealDB at ${DB_URL} (${DB_NS}/${DB_NAME})`);
  if (DRY_RUN) console.log('DRY_RUN=1 — no writes');

  const stats = { created: 0, skipped: 0, dry: 0, skippedBad: 0 };

  console.log('Backfilling purchases...');
  await backfillPurchases(db, stats);
  console.log('Backfilling purchase returns...');
  await backfillPurchaseReturns(db, stats);
  console.log('Backfilling issues...');
  await backfillIssues(db, stats);
  console.log('Backfilling issue returns...');
  await backfillIssueReturns(db, stats);
  console.log('Backfilling waste...');
  await backfillWaste(db, stats);
  console.log('Backfilling transfers...');
  await backfillTransfers(db, stats);
  console.log('Backfilling production...');
  await backfillProduction(db, stats);
  console.log('Backfilling buffet consumption...');
  await backfillBuffet(db, stats);

  console.log('\nBackfill stats:', stats);

  if (!SKIP_RECONCILE && !DRY_RUN) {
    const mismatches = await reconcile(db);
    if (mismatches > 0) {
      console.error(`Reconciliation failed with ${mismatches} mismatches`);
      process.exitCode = 1;
    } else {
      console.log('Reconciliation OK — safe to enable inventory_ledger_enabled');
    }
  }

  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
