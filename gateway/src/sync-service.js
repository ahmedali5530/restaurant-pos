'use strict';

const { rows, first, ensureTerminal, applyOperation, toRecord } = require('./sync-store');

const PROTOCOL_VERSION = 1;
const SCHEMA_VERSION = 1;

const SNAPSHOT_TABLES = [
  'order_type',
  'category',
  'menu_item',
  'modifier_group',
  'modifier',
  'menu_item_modifier_group',
  'floor',
  'floor_table',
  'kitchen',
  'workflow',
  'workflow_stage',
  'payment_type',
  'tax',
  'menu',
  'menu_menu_item',
  'setting',
  'user',
  'extra',
  'discount',
  'discount_reason',
  'coupon',
  'customer',
  'coupon_redemption',
  'printer',
  'order',
  'order_item',
  'order_item_kitchen',
  'order_void',
  'order_refund',
  'order_print',
];

/**
 * Operational tables are snapshotted for open + recent orders only; history is
 * served by SurrealDB reports, not the terminal cache.
 */
const SNAPSHOT_FILTERS = {
  order: `(status = 'In Progress' OR created_at > time::now() - 3d)`,
  order_item: `(order.status = 'In Progress' OR created_at > time::now() - 3d)`,
  order_item_kitchen: `(order_item.order.status = 'In Progress' OR created_at > time::now() - 3d)`,
  order_void: `(order.status = 'In Progress' OR created_at > time::now() - 3d)`,
  order_refund: `(order.status = 'In Progress' OR created_at > time::now() - 3d)`,
  order_print: `(order.status = 'In Progress' OR printed_at > time::now() - 3d)`,
  coupon_redemption: `(created_at > time::now() - 90d)`,
};

/**
 * Order child relations are embedded in the `order` page (FETCH) — the client
 * explodes them into its child stores. `order_payment` / `order_extras` have no
 * back-link to the order, so this is the only way to page them.
 */
const SNAPSHOT_FETCH = {
  order: 'payments, order_taxes, order_discounts, extras, coupon',
};

function snapshotQuery(table, hasAfter) {
  const where = [hasAfter ? 'id > $after' : null, SNAPSHOT_FILTERS[table] || null]
    .filter(Boolean)
    .join(' AND ');
  const fetch = SNAPSHOT_FETCH[table] ? ` FETCH ${SNAPSHOT_FETCH[table]}` : '';
  return `SELECT * FROM type::table($table)${where ? ` WHERE ${where}` : ''} ORDER BY id ASC LIMIT $limit${fetch}`;
}

function encodeToken(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeToken(token) {
  if (!token) return null;
  try {
    return JSON.parse(Buffer.from(String(token), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function highWatermark(db) {
  const row = first(
    await db.query(`SELECT math::max(event_id) AS max FROM sync_event GROUP ALL`),
  );
  const max = Number(row?.max);
  return Number.isFinite(max) ? max : 0;
}

async function handshake(db, body) {
  const protocolVersion = Number(body.protocolVersion ?? 0);
  const schemaVersion = Number(body.schemaVersion ?? 0);
  if (protocolVersion !== PROTOCOL_VERSION || schemaVersion !== SCHEMA_VERSION) {
    const err = new Error('Unsupported sync protocol or schema version');
    err.status = 426;
    throw err;
  }
  const terminalId = String(body.terminalId || '');
  if (!terminalId || terminalId.length < 8) {
    const err = new Error('terminalId is required');
    err.status = 400;
    throw err;
  }
  const terminal = await ensureTerminal(
    db,
    terminalId,
    String(body.scopeId || 'default'),
    body.metadata || {},
    body.actorId || body.actor_id || null,
  );
  const cursor = await highWatermark(db);
  return {
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    minimumProtocolVersion: PROTOCOL_VERSION,
    schemaVersion: SCHEMA_VERSION,
    minimumSchemaVersion: SCHEMA_VERSION,
    lastSequence: Number(terminal.last_sequence ?? 0),
    cursor,
  };
}

async function snapshotPage(db, body) {
  const terminalId = String(body.terminalId || '');
  const limit = Math.min(Number(body.limit || 200), 500);
  const token = decodeToken(body.resumeToken);
  const hw = token?.highWatermark ?? (await highWatermark(db));
  let tableIndex = Number(token?.tableIndex ?? 0);
  let afterId = token?.afterId ?? null;
  let phase = token?.phase || 'records';

  if (phase === 'records') {
    while (tableIndex < SNAPSHOT_TABLES.length) {
      const table = SNAPSHOT_TABLES[tableIndex];
      // Surreal compares record ids only when $after is a RecordId — a
      // "table:id" string makes `id > $after` match the first page forever.
      const afterRecord = afterId ? toRecord(table, afterId) : null;
      let records = [];
      try {
        records = rows(
          await db.query(snapshotQuery(table, !!afterRecord), {
            table,
            after: afterRecord,
            limit,
          }),
        );
      } catch (err) {
        const message = String(err?.message || err);
        // Missing catalog tables should not stall snapshot forever.
        if (/does not exist|not found/i.test(message)) {
          tableIndex += 1;
          afterId = null;
          continue;
        }
        throw err;
      }
      if (records.length === 0) {
        tableIndex += 1;
        afterId = null;
        continue;
      }
      const lastId = String(records[records.length - 1].id);
      const advanceTable = records.length < limit;
      const nextTableIndex = advanceTable ? tableIndex + 1 : tableIndex;
      const nextAfterId = advanceTable ? null : lastId;
      const finishedTables = advanceTable && nextTableIndex >= SNAPSHOT_TABLES.length;
      return {
        ok: true,
        schemaVersion: SCHEMA_VERSION,
        highWatermark: hw,
        page: { kind: 'records', table, records },
        complete: false,
        resumeToken: finishedTables
          ? encodeToken({ phase: 'events', afterEvent: 0, highWatermark: hw })
          : encodeToken({
              phase: 'records',
              tableIndex: nextTableIndex,
              afterId: nextAfterId,
              highWatermark: hw,
            }),
      };
    }
    phase = 'events';
    afterId = 0;
  }

  const afterEvent = Number(token?.afterEvent ?? afterId ?? 0);
  const events = rows(
    await db.query(
      `SELECT * FROM sync_event WHERE event_id > $after AND event_id <= $hw
       ORDER BY event_id ASC LIMIT $limit`,
      { after: afterEvent, hw, limit },
    ),
  );
  const last = events.length ? Number(events[events.length - 1].event_id) : afterEvent;
  const complete = events.length < limit || last >= hw;
  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    highWatermark: hw,
    page: { kind: 'events', events },
    complete,
    resumeToken: complete
      ? null
      : encodeToken({ phase: 'events', afterEvent: last, highWatermark: hw }),
  };
}

const SERIES_SEED_FIELD = { invoice: 'invoice_number', auto_id: 'auto_id' };

async function seedCounterValue(db, series) {
  const field = SERIES_SEED_FIELD[series];
  if (!field) return 0;
  try {
    const row = first(
      await db.query(`SELECT math::max(${field}) AS max FROM order GROUP ALL`),
    );
    const max = Number(row?.max);
    return Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  } catch {
    return 0;
  }
}

async function reserveNumberRange(db, body) {
  const terminalId = String(body.terminalId || '');
  const series = String(body.series || body.kind || 'invoice');
  const count = Math.min(Math.max(Number(body.count || 1), 1), 1000);
  const reservationId = String(body.reservationId || '');
  if (!terminalId || !reservationId) {
    const err = new Error('terminalId and reservationId are required');
    err.status = 400;
    throw err;
  }

  const existing = first(
    await db.query(
      `SELECT * FROM sync_number_reservation WHERE reservation_id = $reservationId LIMIT 1`,
      { reservationId },
    ),
  );
  if (existing) {
    if (existing.series !== series || Number(existing.count) !== count) {
      const err = new Error('Reservation id reused with different parameters');
      err.status = 409;
      throw err;
    }
    return {
      ok: true,
      start: Number(existing.start),
      end: Number(existing.end),
      reservationId,
    };
  }

  const scopeId = String(body.scopeId || 'default');
  const counterId = toRecord('sync_number_counter', series);
  let counter = first(await db.query(`SELECT * FROM $id`, { id: counterId }));
  if (!counter) {
    // Seed from existing orders so reserved ranges never collide with numbers
    // handed out by the legacy Surreal counters.
    const seed = await seedCounterValue(db, series);
    await db.query(
      `CREATE $id SET series = $series, scope_id = $scopeId, value = $seed, updated_at = time::now()`,
      { id: counterId, series, scopeId, seed },
    );
    counter = { value: seed };
  }
  const start = Number(counter.value || 0) + 1;
  const end = start + count - 1;
  await db.query(
    `UPDATE $id SET value = $end, updated_at = time::now()`,
    { id: counterId, end },
  );
  await db.query(
    `CREATE sync_number_reservation SET
      reservation_id = $reservationId,
      terminal_id = $terminalId,
      scope_id = $scopeId,
      series = $series,
      start = $start,
      end = $end,
      first_number = $start,
      last_number = $end,
      count = $count,
      created_at = time::now()`,
    { reservationId, terminalId, scopeId, series, start, end, count },
  );
  return { ok: true, start, end, reservationId };
}

async function push(db, body) {
  const terminalId = String(body.terminalId || '');
  const operations = Array.isArray(body.operations) ? body.operations : [];
  if (!terminalId) {
    const err = new Error('terminalId is required');
    err.status = 400;
    throw err;
  }
  if (operations.length === 0 || operations.length > 100) {
    const err = new Error('operations must contain 1-100 items');
    err.status = 400;
    throw err;
  }

  await ensureTerminal(
    db,
    terminalId,
    String(body.scopeId || 'default'),
    body.metadata || {},
    body.actorId || body.actor_id || null,
  );

  const accepted = [];
  const conflicts = [];
  let lastSeq = 0;
  for (const op of operations) {
    const sequence = Number(op.sequence ?? 0);
    if (sequence <= lastSeq) {
      conflicts.push({
        operationId: op.operationId,
        code: 'SEQUENCE_GAP',
        message: 'Sequences must be strictly increasing',
      });
      continue;
    }
    lastSeq = sequence;
    const result = await applyOperation(db, op, terminalId, body.scopeId || 'default');
    if (result.status === 'accepted') {
      accepted.push(op.operationId);
    } else {
      conflicts.push({
        operationId: op.operationId,
        code: result.code || 'CONFLICT',
        message: result.message || 'Conflict',
      });
      await db.query(
        `CREATE sync_conflict SET
          operation_id = $operationId,
          terminal_id = $terminalId,
          code = $code,
          message = $message,
          created_at = time::now()`,
        {
          operationId: op.operationId,
          terminalId,
          code: result.code,
          message: result.message,
        },
      );
    }
  }

  return { ok: true, protocolVersion: PROTOCOL_VERSION, accepted, conflicts };
}

async function pull(db, query) {
  const terminalId = String(query.terminalId || '');
  const cursor = Number(query.cursor || 0);
  const limit = Math.min(Number(query.limit || 200), 500);
  const hw = await highWatermark(db);
  const events = rows(
    await db.query(
      `SELECT * FROM sync_event WHERE event_id > $cursor ORDER BY event_id ASC LIMIT $limit`,
      { cursor, limit },
    ),
  );
  const nextCursor = events.length
    ? Number(events[events.length - 1].event_id)
    : cursor;
  return {
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    events,
    cursor: nextCursor,
    highWatermark: hw,
    hasMore: nextCursor < hw && events.length === limit,
  };
}

module.exports = {
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
  SNAPSHOT_TABLES,
  handshake,
  snapshotPage,
  reserveNumberRange,
  push,
  pull,
};
