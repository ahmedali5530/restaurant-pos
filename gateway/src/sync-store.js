'use strict';

const { RecordId, StringRecordId } = require('surrealdb');

/**
 * Record-link fields per SCHEMAFULL table in the order aggregate.
 * Value is the target table; an array marks `array<record<...>>`.
 * Clients ship plain "table:id" strings (Dexie); Surreal never coerces a
 * string to `record<...>`, so we convert at the gateway boundary.
 */
const RECORD_LINK_FIELDS = {
  order: {
    floor: 'floor',
    table: 'floor_table',
    order_type: 'order_type',
    customer: 'customer',
    user: 'user',
    cashier: 'user',
    discount_manager: 'user',
    tax: 'tax',
    discount: 'discount',
    coupon: 'order_coupon',
    items: ['order_item'],
    payments: ['order_payment'],
    order_taxes: ['order_tax'],
    order_discounts: ['order_discount'],
    extras: ['order_extras'],
  },
  order_item: {
    order: 'order',
    item: 'menu_item',
    category_id: 'category',
    created_by: 'user',
    workflow: 'workflow',
    // `tax` is a float amount on SCHEMAFULL order_item — not a record<link>.
    // Only `taxes` is array<record<tax>>.
    taxes: ['tax'],
  },
  order_item_kitchen: {
    kitchen: 'kitchen',
    order_item: 'order_item',
    stage: 'workflow_stage',
    workflow: 'workflow',
    user: 'user',
    completed_by: ['user'],
  },
  order_payment: {
    payment_type: 'payment_type',
  },
  order_void: {
    order: 'order',
    deleted_by: 'user',
    logged_in_user: 'user',
    items: ['order_item'],
  },
  order_refund: {
    order: 'order',
    logged_in_user: 'user',
    manager: 'user',
    items: ['order_item'],
  },
  order_discount: {
    order: 'order',
    discount: 'discount',
    applied_by: 'user',
    approved_by: 'user',
    removed_by: 'user',
    reason: 'discount_reason',
    order_items: ['order_item'],
  },
  order_coupon: {
    coupon: 'coupon',
  },
  order_tax: {
    order: 'order',
    tax: 'tax',
  },
  coupon_redemption: {
    order: 'order',
    coupon: 'coupon',
    customer: 'customer',
    user: 'user',
  },
  order_split: {
    old_order: 'order',
    created_by: 'user',
    new_orders: ['order'],
  },
  order_merge: {
    new_order: 'order',
    created_by: 'user',
    old_orders: ['order'],
  },
  order_print: {
    order: 'order',
    printed_by: 'user',
  },
  customer: {
    addresses: ['customer_address'],
  },
  floor_table: {
    floor: 'floor',
    categories: ['category'],
    order_types: ['order_type'],
    payment_types: ['payment_type'],
  },
};

/**
 * Fields Dexie keeps for local indexing / cashier progress that do not exist on
 * the SCHEMAFULL Surreal table. Stripped before any write.
 */
const LOCAL_ONLY_FIELDS = {
  order: ['draft_payments'],
  // SCHEMAFULL order_payment only has amount/comments/payable/payment_type.
  order_payment: ['order', 'created_at', 'id', 'updated_at'],
  order_extras: ['order', 'id'],
  order_coupon: ['order', 'id'],
  order_tax: ['id'],
  order_discount: ['id'],
  order_split: ['order', 'id'],
  order_merge: ['order', 'id'],
  order_void: ['id'],
  order_refund: ['id'],
  coupon_redemption: ['id'],
  customer: ['order'],
  floor_table: ['updated_at'],
};

/** Only these `floor_table` fields may be touched by terminals (lock state). */
const FLOOR_TABLE_MUTABLE_FIELDS = ['is_locked', 'locked_by', 'locked_at'];

/** Ownership heartbeat considered stale after this many ms (mirrors client). */
const OWNER_HEARTBEAT_STALE_MS = 45_000;

/** `order` array relations a child CREATE / REPLACE may link into. */
const ORDER_ARRAY_RELATIONS = ['payments', 'order_taxes', 'order_discounts', 'extras'];
/** `order` single-link fields a child CREATE may set. */
const ORDER_LINK_FIELDS = ['coupon', 'customer', 'discount'];

function assertRelation(name, allowed) {
  const value = String(name || '');
  if (!allowed.includes(value)) {
    throw new Error(`Relation ${value || '(empty)'} is not allowed`);
  }
  return value;
}

function rows(result) {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : first != null ? [first] : [];
}

function first(result) {
  return rows(result)[0];
}

function isRecordLike(value) {
  return value instanceof RecordId || value instanceof StringRecordId;
}

function toRecord(table, id) {
  if (isRecordLike(id)) return id;
  if (id && typeof id === 'object' && 'id' in id) return toRecord(table, id.id);
  const raw = String(id ?? '');
  // Same semantics as the app's `toRecordId`: a "table:id" string is parsed by
  // Surreal itself so numeric / escaped ids survive intact.
  if (raw.includes(':')) return new StringRecordId(raw);
  return new RecordId(table, raw);
}

function toRecordLink(target, value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' && value.trim() === '') return null;
  return toRecord(target, value);
}

/**
 * Coerce every known record-link field of `table` from string / {id} shape to a
 * Surreal record id, and patch legacy client shapes so older outbox operations
 * still satisfy the SCHEMAFULL definitions.
 */
function toSurrealRecord(table, content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return content;
  const links = RECORD_LINK_FIELDS[table];
  const out = { ...content };

  if (table === 'order_item') {
    if (out.position === undefined || out.position === null) out.position = 0;
    if (out.level === undefined || out.level === null) out.level = 0;
    if (out.seat !== undefined && out.seat !== null && typeof out.seat !== 'string') {
      out.seat = String(out.seat);
    }
  }
  if (table === 'order_item_kitchen') {
    if (out.stage === undefined && 'workflow_stage' in out) out.stage = out.workflow_stage;
    delete out.workflow_stage;
  }
  if (table === 'floor_table') {
    for (const key of Object.keys(out)) {
      if (!FLOOR_TABLE_MUTABLE_FIELDS.includes(key)) delete out[key];
    }
  }
  for (const field of LOCAL_ONLY_FIELDS[table] || []) delete out[field];

  if (!links) return out;
  for (const [field, target] of Object.entries(links)) {
    if (!(field in out)) continue;
    const value = out[field];
    if (Array.isArray(target)) {
      if (!Array.isArray(value)) continue;
      out[field] = value
        .map((entry) => toRecordLink(target[0], entry))
        .filter((entry) => entry !== null && entry !== undefined);
    } else if (field === 'category_id') {
      // Preserve legacy free-form category strings; only coerce qualified refs.
      if (value === null || value === undefined) {
        out[field] = value;
      } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          out[field] = null;
        } else if (trimmed.startsWith('category:') || trimmed.includes(':')) {
          out[field] = toRecordLink(target, trimmed);
        }
        // else leave the legacy string untouched
      } else {
        out[field] = toRecordLink(target, value);
      }
    } else {
      out[field] = toRecordLink(target, value);
    }
  }
  return out;
}

function normalizeSurrealContent(value) {
  if (Array.isArray(value)) return value.map(normalizeSurrealContent);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (isRecordLike(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key.endsWith('_at') && typeof entry === 'string') {
        const date = new Date(entry);
        if (!Number.isNaN(date.getTime())) return [key, date];
      }
      return [key, normalizeSurrealContent(entry)];
    }),
  );
}

function withoutRecordId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const { id, ...content } = value;
  return normalizeSurrealContent(content);
}

/** Strip `id`, normalise datetimes, then coerce record links for `table`. */
function toSurrealContent(table, value) {
  return toSurrealRecord(table, withoutRecordId(value));
}

/**
 * Persist order_item / order_item_kitchen rows before linking them on `order`.
 * Returns the record ids that were written so the parent can append only those.
 */
async function upsertOrderChildren(db, payload) {
  const writtenItemIds = [];
  for (const item of payload.items || []) {
    const id = toRecord('order_item', item.id);
    await db.query(`UPSERT $id CONTENT $item`, {
      id,
      item: toSurrealContent('order_item', item),
    });
    writtenItemIds.push(id);
  }
  for (const kitchen of payload.kitchens || []) {
    await db.query(`UPSERT $id CONTENT $kitchen`, {
      id: toRecord('order_item_kitchen', kitchen.id),
      kitchen: toSurrealContent('order_item_kitchen', kitchen),
    });
  }
  return writtenItemIds;
}

/**
 * Append item links that actually exist as rows. Never trust a client-supplied
 * full `items` array — that is how orphaned links get revived after a partial
 * apply or a manual Surreal repair.
 */
async function appendOrderItemLinks(db, orderId, itemIds) {
  if (!itemIds.length) return;
  await db.query(
    `UPDATE $id SET items = array::union(items ?? [], $itemIds), updated_at = time::now()`,
    { id: toRecord('order', orderId), itemIds },
  );
}

async function ensureTerminal(db, terminalId, scopeId, metadata = {}, actorId = null) {
  const actor = String(actorId || '').trim() || 'anonymous';
  const existing = first(
    await db.query(
      `SELECT * FROM sync_terminal WHERE terminal_id = $terminalId LIMIT 1`,
      { terminalId },
    ),
  );
  if (existing) {
    await db.query(
      `UPDATE $id SET
        last_seen_at = time::now(),
        metadata = $metadata,
        actor_id = $actorId,
        scope_id = $scopeId,
        protocol_version = $protocolVersion`,
      {
        id: existing.id,
        metadata,
        actorId: actor,
        scopeId,
        protocolVersion: '1',
      },
    );
    return { ...existing, actor_id: actor, scope_id: scopeId };
  }
  const created = first(
    await db.query(
      `CREATE sync_terminal SET
        terminal_id = $terminalId,
        scope_id = $scopeId,
        actor_id = $actorId,
        protocol_version = $protocolVersion,
        schema_version = $schemaVersion,
        metadata = $metadata,
        last_sequence = 0,
        registered_at = time::now(),
        created_at = time::now(),
        last_seen_at = time::now()
      RETURN AFTER`,
      {
        terminalId,
        scopeId,
        actorId: actor,
        protocolVersion: '1',
        schemaVersion: 1,
        metadata,
      },
    ),
  );
  return created;
}

async function nextEventId(db) {
  const current = first(
    await db.query(`SELECT counter FROM ONLY sync_event_seq:singleton`),
  );
  if (!current) {
    await db.query(
      `CREATE sync_event_seq:singleton SET counter = 1`,
    );
    return 1;
  }
  const before = first(
    await db.query(
      `UPDATE sync_event_seq:singleton SET counter += 1 RETURN BEFORE`,
    ),
  );
  return Number(before?.counter ?? 1);
}

async function appendEvent(db, input) {
  const eventId = await nextEventId(db);
  await db.query(
    `CREATE sync_event SET
      event_id = $eventId,
      terminal_id = $terminalId,
      operation_id = $operationId,
      aggregate_type = $aggregateType,
      aggregate_id = $aggregateId,
      operation_type = $operationType,
      version = $version,
      payload = $payload,
      scope_id = $scopeId,
      created_at = time::now()`,
    {
      eventId,
      terminalId: input.terminalId,
      operationId: input.operationId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      operationType: input.operationType,
      version: input.version,
      payload: input.payload,
      scopeId: input.scopeId ?? 'default',
    },
  );
  return eventId;
}

async function findAcceptedOperation(db, operationId) {
  return first(
    await db.query(
      `SELECT * FROM sync_accepted_operation WHERE operation_id = $operationId LIMIT 1`,
      { operationId },
    ),
  );
}

function isKitchenOp(type) {
  return type === 'COMPLETE_KITCHEN_STAGE';
}

function isFinancialTable(table) {
  return table === 'order_payment' || table === 'order_refund' || table === 'order_void';
}

async function loadOrder(db, orderId) {
  return first(
    await db.query(`SELECT * FROM $id`, { id: toRecord('order', orderId) }),
  );
}

/** Ops that mutate the `order` aggregate and therefore need cashier ownership. */
const OWNER_GATED_OPS = [
  'MERGE_RECORD',
  'CREATE_PAYMENT',
  'REPLACE_ORDER_RELATION',
  'CLAIM_ORDER',
  'RELEASE_ORDER',
];

/**
 * Replace `order.<relation>` with `rows`: upsert every row, delete rows that
 * were linked before but are not in the new set, then set the link array and
 * any extra order fields (e.g. `tax_amount`) in `data`.
 */
async function replaceOrderRelation(db, orderId, payload) {
  const relation = assertRelation(payload.relation, ORDER_ARRAY_RELATIONS);
  const childTable = String(payload.table || '');
  if (!childTable || childTable === 'order') {
    throw new Error('REPLACE_ORDER_RELATION requires relation + child table');
  }
  const orderRecord = toRecord('order', orderId);
  const current = first(
    await db.query(`SELECT VALUE ${relation} FROM ONLY $id`, { id: orderRecord }),
  );
  const previous = Array.isArray(current) ? current : [];
  const nextIds = [];
  for (const row of payload.rows || []) {
    const id = toRecord(childTable, row.id);
    const content = toSurrealContent(childTable, row);
    // Child tables with an `order` link must always point at this order.
    if (RECORD_LINK_FIELDS[childTable]?.order) content.order = orderRecord;
    await db.query(`UPSERT $id CONTENT $content`, { id, content });
    nextIds.push(id);
  }
  const nextKeys = new Set(nextIds.map((id) => String(id)));
  const stale = previous.filter((entry) => !nextKeys.has(String(entry)));
  if (stale.length) {
    await db.query(`DELETE $stale`, { stale });
  }
  if (RECORD_LINK_FIELDS[childTable]?.order) {
    await db.query(
      `DELETE FROM type::table($table) WHERE order = $order AND id NOT IN $ids`,
      { table: childTable, order: orderRecord, ids: nextIds },
    );
  }
  const extra = toSurrealContent('order', payload.data || {});
  delete extra.items;
  await db.query(`UPDATE $id MERGE $patch`, {
    id: orderRecord,
    patch: { ...extra, [relation]: nextIds, updated_at: new Date() },
  });
}

async function applyOperation(db, op, terminalId, scopeId) {
  const accepted = await findAcceptedOperation(db, op.operationId);
  if (accepted) {
    return { status: 'accepted', eventId: accepted.event_id };
  }

  const type = op.operationType || op.type;
  const payload = op.payload || {};
  const table = payload.table || op.aggregateType;
  const recordId = String(payload.recordId || op.aggregateId || '');
  // The order that gates ownership: explicit `orderId` (payments / relations),
  // else the record itself when it is an order.
  const ownerOrderId = String(
    payload.orderId
      || (table === 'order' ? recordId : op.aggregateType === 'order' ? op.aggregateId : ''),
  );
  const expectedVersion = Number(op.expectedVersion ?? 0);
  let orderVersionPatch = null;

  // Ownership is enforced only while offline. Online, any terminal may open/mutate.
  if (!isKitchenOp(type) && ownerOrderId && OWNER_GATED_OPS.includes(type)) {
    const order = await loadOrder(db, ownerOrderId);
    // Stale expectedVersion from the pusher is normal: earlier outbox ops advanced
    // the server while a later/retried op still carried an older number.
    // Fast-forward instead of VERSION_CONFLICT so settle/tax retries work.
    const current = Number(order?.server_version);
    if (order) orderVersionPatch = Math.max(Number.isFinite(current) ? current : 0, expectedVersion) + 1;
  }

  if (type === 'STEAL_ORDER') {
    const order = await loadOrder(db, ownerOrderId || recordId);
    if (!order) {
      return { status: 'conflict', code: 'NOT_FOUND', message: 'Order not found' };
    }
    const heartbeat = order.owner_heartbeat_at ? new Date(order.owner_heartbeat_at).getTime() : NaN;
    const fresh = Number.isFinite(heartbeat) && Date.now() - heartbeat <= OWNER_HEARTBEAT_STALE_MS;
    if (
      order.owner_terminal_id
      && String(order.owner_terminal_id) !== terminalId
      && fresh
      && !payload.force
    ) {
      return {
        status: 'conflict',
        code: 'OWNER_FRESH',
        message: 'Cannot steal order — owner heartbeat is still fresh',
      };
    }
    orderVersionPatch = Math.max(Number(order.server_version) || 0, expectedVersion) + 1;
  }

  if (
    (type === 'MERGE_RECORD' || type === 'PATCH_RECORD' || type === 'DELETE_RECORD')
    && isFinancialTable(table)
  ) {
    return {
      status: 'conflict',
      code: 'FINANCIAL_OPERATION_IMMUTABLE',
      message: 'Financial rows cannot be mutated',
    };
  }

  try {
    if (type === 'CREATE_RECORD' && table === 'order') {
      // Children first so order.items never references missing order_item rows.
      const writtenItemIds = await upsertOrderChildren(db, payload);
      const data = toSurrealRecord(
        'order',
        normalizeSurrealContent({
          ...withoutRecordId(payload.data),
          items: writtenItemIds.length
            ? writtenItemIds.map((id) => String(id))
            : (payload.data?.items ?? []),
          owner_terminal_id: payload.data?.owner_terminal_id || terminalId,
          owner_heartbeat_at: payload.data?.owner_heartbeat_at || new Date(),
        }),
      );
      // Prefer the ids we actually wrote.
      if (writtenItemIds.length) data.items = writtenItemIds;
      await db.query(`UPSERT $id CONTENT $data`, {
        id: toRecord('order', recordId),
        data,
      });
    } else if (type === 'MERGE_RECORD' || type === 'CLAIM_ORDER' || type === 'RELEASE_ORDER' || type === 'STEAL_ORDER') {
      const patchTable = table || 'order';
      // Children (items / kitchens) may ride along on order *and* order_item
      // merges (e.g. firing a held line creates its stage rows).
      const writtenItemIds = await upsertOrderChildren(db, payload);
      const patch =
        type === 'CLAIM_ORDER' || type === 'STEAL_ORDER'
          ? {
              owner_terminal_id: terminalId,
              owner_heartbeat_at: new Date(),
              ...(payload.data || payload),
            }
          : type === 'RELEASE_ORDER'
            ? { owner_terminal_id: null, owner_heartbeat_at: new Date() }
            : (() => {
                const data = { ...(payload.data || {}) };
                // Online multi-terminal: transferring owner on accept unless the
                // client explicitly released/cleared ownership in this MERGE.
                if (
                  patchTable === 'order'
                  && !Object.prototype.hasOwnProperty.call(data, 'owner_terminal_id')
                ) {
                  data.owner_terminal_id = terminalId;
                  data.owner_heartbeat_at = new Date();
                }
                return data;
              })();
      // Client full `items` arrays revive orphans; append only children from this op.
      if (patchTable === 'order') delete patch.items;
      if (patchTable === 'order' && orderVersionPatch) patch.server_version = orderVersionPatch;
      const surrealPatch = toSurrealContent(patchTable, patch);
      if (Object.keys(surrealPatch).length > 0) {
        await db.query(`UPDATE $id MERGE $patch`, {
          id: toRecord(patchTable, recordId),
          patch: surrealPatch,
        });
      }
      if (patchTable === 'order' && writtenItemIds.length) {
        await appendOrderItemLinks(db, recordId, writtenItemIds);
      }
      // Split / merge close the parent and must drop its item links explicitly
      // (regular MERGE never replaces `items`, see above).
      if (patchTable === 'order' && Array.isArray(payload.replaceItems)) {
        await db.query(`UPDATE $id SET items = $items`, {
          id: toRecord('order', recordId),
          items: payload.replaceItems.map((id) => toRecord('order_item', id)),
        });
      }
    } else if (type === 'CREATE_PAYMENT') {
      if (!ownerOrderId) throw new Error('CREATE_PAYMENT requires payload.orderId');
      const paymentId = toRecord('order_payment', recordId);
      await db.query(`UPSERT $id CONTENT $data`, {
        id: paymentId,
        data: toSurrealContent('order_payment', payload.data),
      });
      await db.query(
        `UPDATE $id SET payments = array::union(payments ?? [], [$payment]), updated_at = time::now()`,
        { id: toRecord('order', ownerOrderId), payment: paymentId },
      );
      // Keep order.server_version in lockstep with other owner-gated ops so a
      // following MERGE_RECORD (settle) does not VERSION_CONFLICT.
      if (orderVersionPatch) {
        await db.query(`UPDATE $id SET server_version = $version, updated_at = time::now()`, {
          id: toRecord('order', ownerOrderId),
          version: orderVersionPatch,
        });
      }
    } else if (type === 'REPLACE_ORDER_RELATION') {
      if (!ownerOrderId) throw new Error('REPLACE_ORDER_RELATION requires payload.orderId');
      await replaceOrderRelation(db, ownerOrderId, {
        ...payload,
        data: orderVersionPatch
          ? { ...(payload.data || {}), server_version: orderVersionPatch }
          : payload.data,
      });
    } else if (type === 'COMPLETE_KITCHEN_STAGE') {
      await db.query(
        `UPDATE $id SET status = 'completed', completed_at = time::now()`,
        { id: toRecord('order_item_kitchen', payload.kitchenRowId) },
      );
      if (payload.nextPendingId) {
        await db.query(
          `UPDATE $id SET status = 'pending', activated_at = time::now()`,
          { id: toRecord('order_item_kitchen', payload.nextPendingId) },
        );
      }
    } else if (type === 'CREATE_RECORD') {
      await db.query(`UPSERT $id CONTENT $data`, {
        id: toRecord(table, recordId),
        data: toSurrealContent(table, payload.data),
      });
      // Child rows created standalone (voids, refunds, coupons, redemptions…)
      // may ask to be linked on the parent order.
      if (payload.linkRelation && ownerOrderId) {
        const relation = assertRelation(payload.linkRelation, ORDER_ARRAY_RELATIONS);
        await db.query(
          `UPDATE $id SET ${relation} = array::union(${relation} ?? [], [$child]), updated_at = time::now()`,
          { id: toRecord('order', ownerOrderId), child: toRecord(table, recordId) },
        );
      }
      if (payload.linkField && ownerOrderId) {
        const field = assertRelation(payload.linkField, ORDER_LINK_FIELDS);
        await db.query(
          `UPDATE $id SET ${field} = $child, updated_at = time::now()`,
          { id: toRecord('order', ownerOrderId), child: toRecord(table, recordId) },
        );
      }
    } else {
      return {
        status: 'conflict',
        code: 'UNSUPPORTED_OPERATION',
        message: `Unsupported operation ${type}`,
      };
    }
  } catch (err) {
    // A single malformed operation must not 500 the whole push batch; surface
    // it as a conflict so the terminal sees it and later operations still apply.
    return {
      status: 'conflict',
      code: 'APPLY_ERROR',
      message: String(err?.message || err),
    };
  }

  const version = orderVersionPatch ?? expectedVersion + 1;
  const eventId = await appendEvent(db, {
    terminalId,
    operationId: op.operationId,
    aggregateType: op.aggregateType || table,
    aggregateId: recordId,
    operationType: type,
    version,
    payload,
    scopeId,
  });

  await db.query(
    `CREATE sync_accepted_operation SET
      operation_id = $operationId,
      terminal_id = $terminalId,
      event_id = $eventId,
      created_at = time::now()`,
    { operationId: op.operationId, terminalId, eventId },
  );

  await db.query(
    `UPDATE sync_terminal SET last_sequence = math::max([last_sequence, $sequence])
     WHERE terminal_id = $terminalId`,
    { terminalId, sequence: Number(op.sequence ?? 0) },
  );

  return { status: 'accepted', eventId };
}

module.exports = {
  rows,
  first,
  toRecord,
  toSurrealRecord,
  toSurrealContent,
  RECORD_LINK_FIELDS,
  LOCAL_ONLY_FIELDS,
  OWNER_HEARTBEAT_STALE_MS,
  normalizeSurrealContent,
  withoutRecordId,
  ensureTerminal,
  applyOperation,
  appendEvent,
  nextEventId,
};
