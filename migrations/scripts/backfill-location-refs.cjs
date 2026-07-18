'use strict';

/**
 * Remap inventory_store refs → inventory_location refs (ledger + documents).
 *
 * Prerequisite: apply migrations/2026_07_18_location_stock_cutover.surql
 *
 * Usage:
 *   ./migrations/scripts/run-backfill-location-refs.sh
 *
 * Env:
 *   DRY_RUN=1 — count only
 *   SKIP_LEDGER_SWAP=1 — leave inventory_location as store-typed (debug)
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
const SKIP_LEDGER_SWAP = process.env.SKIP_LEDGER_SWAP === '1';

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
  if (typeof value === 'object' && value.id != null) {
    return toId(value.id);
  }
  return String(value);
};

const normalizeKey = (id) => {
  const str = toId(id) || '';
  const colon = str.lastIndexOf(':');
  return colon >= 0 ? str.slice(colon + 1) : str;
};

const rid = (id) => new StringRecordId(toId(id));

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  console.log(`Connected ${DB_URL} ${DB_NS}/${DB_NAME} DRY_RUN=${DRY_RUN}`);

  // Ensure locations for stores/kitchens
  const stores = rows(await db.query('SELECT id, name FROM inventory_store'));
  const kitchens = rows(await db.query('SELECT id, name FROM kitchen WHERE deleted_at = NONE'));
  const existingLocs = rows(
    await db.query('SELECT id, linked_store, linked_kitchen FROM inventory_location')
  );

  const storeToLoc = new Map();
  const kitchenToLoc = new Map();
  for (const loc of existingLocs) {
    if (loc.linked_store) {
      storeToLoc.set(toId(loc.linked_store), toId(loc.id));
      storeToLoc.set(normalizeKey(loc.linked_store), toId(loc.id));
    }
    if (loc.linked_kitchen) {
      kitchenToLoc.set(toId(loc.linked_kitchen), toId(loc.id));
      kitchenToLoc.set(normalizeKey(loc.linked_kitchen), toId(loc.id));
    }
  }

  let created = 0;
  for (const store of stores) {
    const sid = toId(store.id);
    if (storeToLoc.has(sid) || storeToLoc.has(normalizeKey(sid))) continue;
    if (!DRY_RUN) {
      const [createdLoc] = await db.create('inventory_location', {
        name: store.name || 'Store',
        type: 'Store',
        linked_store: rid(sid),
        is_active: true,
      });
      const lid = toId(createdLoc?.id);
      storeToLoc.set(sid, lid);
      storeToLoc.set(normalizeKey(sid), lid);
    }
    created += 1;
  }
  for (const kitchen of kitchens) {
    const kid = toId(kitchen.id);
    if (kitchenToLoc.has(kid) || kitchenToLoc.has(normalizeKey(kid))) continue;
    if (!DRY_RUN) {
      const [createdLoc] = await db.create('inventory_location', {
        name: kitchen.name || 'Kitchen',
        type: 'Kitchen',
        linked_kitchen: rid(kid),
        is_active: true,
      });
      const lid = toId(createdLoc?.id);
      kitchenToLoc.set(kid, lid);
      kitchenToLoc.set(normalizeKey(kid), lid);
    }
    created += 1;
  }
  console.log(`Locations ensured (created=${created}, storeMap=${storeToLoc.size / 2})`);

  const resolveStoreLoc = (storeRef) => {
    if (!storeRef) return null;
    return storeToLoc.get(toId(storeRef)) || storeToLoc.get(normalizeKey(storeRef)) || null;
  };

  // Ledger: fill inventory_location_new
  const ledgerRows = rows(
    await db.query('SELECT id, inventory_location, inventory_location_new FROM inventory_ledger')
  );
  let ledgerUpdated = 0;
  for (const row of ledgerRows) {
    if (row.inventory_location_new) continue;
    const locId = resolveStoreLoc(row.inventory_location);
    if (!locId) {
      console.warn(`No location for ledger ${toId(row.id)} store=${toId(row.inventory_location)}`);
      continue;
    }
    if (!DRY_RUN) {
      await db.query(
        'UPDATE $id SET inventory_location_new = $loc',
        { id: rid(row.id), loc: rid(locId) }
      );
    }
    ledgerUpdated += 1;
  }
  console.log(`Ledger inventory_location_new set: ${ledgerUpdated}`);

  if (!SKIP_LEDGER_SWAP && !DRY_RUN) {
    // Swap field type: remove old store-typed field, promote new
    await db.query('REMOVE FIELD inventory_location ON inventory_ledger');
    await db.query(
      `DEFINE FIELD OVERWRITE inventory_location ON inventory_ledger TYPE option<record<inventory_location>> PERMISSIONS FULL`
    );
    await db.query(
      `UPDATE inventory_ledger SET inventory_location = inventory_location_new WHERE inventory_location_new != NONE`
    );
    await db.query('REMOVE FIELD inventory_location_new ON inventory_ledger');
    await db.query(
      `DEFINE FIELD OVERWRITE inventory_location ON inventory_ledger TYPE record<inventory_location> PERMISSIONS FULL`
    );
    console.log('Ledger inventory_location now record<inventory_location>');
  }

  // Document tables: store → location
  const docSpecs = [
    { table: 'inventory_purchase', field: 'store', target: 'location' },
    { table: 'inventory_purchase_item', field: 'store', target: 'location' },
    { table: 'inventory_purchase_order', field: 'store', target: 'location' },
    { table: 'inventory_purchase_return', field: 'store', target: 'location' },
    { table: 'inventory_purchase_return_item', field: 'store', target: 'location' },
    { table: 'inventory_issue', field: 'store', target: 'location' },
    { table: 'inventory_issue_item', field: 'store', target: 'location' },
    { table: 'inventory_issue_return', field: 'store', target: 'location' },
    { table: 'inventory_issue_return_item', field: 'store', target: 'location' },
    { table: 'inventory_item_waste_item', field: 'store', target: 'location' },
    { table: 'inventory_adjustment', field: 'store', target: 'location' },
    { table: 'inventory_adjustment_item', field: 'store', target: 'location' },
    { table: 'production_batch', field: 'store', target: 'location' },
    { table: 'production_batch_input', field: 'store', target: 'location' },
    { table: 'production_batch_output', field: 'store', target: 'location' },
    { table: 'buffet_session', field: 'store', target: 'location' },
  ];

  for (const spec of docSpecs) {
    const docs = rows(
      await db.query(
        `SELECT id, ${spec.field}, ${spec.target} FROM ${spec.table}`
      )
    );
    let n = 0;
    for (const doc of docs) {
      if (doc[spec.target]) continue;
      const locId = resolveStoreLoc(doc[spec.field]);
      if (!locId) continue;
      if (!DRY_RUN) {
        await db.query(`UPDATE $id SET ${spec.target} = $loc`, {
          id: rid(doc.id),
          loc: rid(locId),
        });
      }
      n += 1;
    }
    console.log(`${spec.table}.${spec.target}: ${n}`);
  }

  // Stock transfers
  const transfers = rows(
    await db.query(
      'SELECT id, from_store, to_store, from_location, to_location FROM stock_transfer'
    )
  );
  let transferN = 0;
  for (const tr of transfers) {
    const fromLoc = tr.from_location ? toId(tr.from_location) : resolveStoreLoc(tr.from_store);
    const toLoc = tr.to_location ? toId(tr.to_location) : resolveStoreLoc(tr.to_store);
    if (!fromLoc && !toLoc) continue;
    if (!DRY_RUN) {
      const sets = [];
      const params = { id: rid(tr.id) };
      if (fromLoc && !tr.from_location) {
        sets.push('from_location = $fromLoc');
        params.fromLoc = rid(fromLoc);
      }
      if (toLoc && !tr.to_location) {
        sets.push('to_location = $toLoc');
        params.toLoc = rid(toLoc);
      }
      if (sets.length) {
        await db.query(`UPDATE $id SET ${sets.join(', ')}`, params);
        transferN += 1;
      }
    } else {
      transferN += 1;
    }
  }
  console.log(`stock_transfer locations: ${transferN}`);

  // inventory_item.stores → locations + reorder_levels keys
  const items = rows(
    await db.query('SELECT id, stores, locations, reorder_levels FROM inventory_item')
  );
  let itemN = 0;
  for (const item of items) {
    const storeList = Array.isArray(item.stores) ? item.stores : [];
    const locIds = [];
    for (const s of storeList) {
      const lid = resolveStoreLoc(s);
      if (lid) locIds.push(lid);
    }
    // Also keep any existing locations
    const existing = Array.isArray(item.locations)
      ? item.locations.map(toId).filter(Boolean)
      : [];
    const merged = [...new Set([...existing, ...locIds])];

    let newReorder = item.reorder_levels;
    if (item.reorder_levels && typeof item.reorder_levels === 'object') {
      newReorder = {};
      for (const [key, value] of Object.entries(item.reorder_levels)) {
        const lid = resolveStoreLoc(key) || key;
        newReorder[lid] = value;
      }
    }

    if (!DRY_RUN) {
      const payload = {};
      if (merged.length) {
        payload.locations = merged.map((id) => rid(id));
      }
      if (newReorder) {
        payload.reorder_levels = newReorder;
      }
      if (Object.keys(payload).length) {
        await db.merge(rid(item.id), payload);
        itemN += 1;
      }
    } else if (merged.length || newReorder) {
      itemN += 1;
    }
  }
  console.log(`inventory_item locations/reorder: ${itemN}`);

  await db.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
