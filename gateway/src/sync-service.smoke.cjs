'use strict';

const assert = require('assert');
const syncService = require('./sync-service');

assert.strictEqual(syncService.PROTOCOL_VERSION, 1);
assert.strictEqual(syncService.SCHEMA_VERSION, 1);
assert.ok(syncService.SNAPSHOT_TABLES.includes('menu_item'));
assert.ok(syncService.SNAPSHOT_TABLES.includes('user_role'));
assert.ok(
  syncService.SNAPSHOT_TABLES.indexOf('user_role')
    < syncService.SNAPSHOT_TABLES.indexOf('user'),
);
// Catalog (printer) must precede operational tables so menu can warm first.
assert.ok(
  syncService.SNAPSHOT_TABLES.indexOf('printer')
    < syncService.SNAPSHOT_TABLES.indexOf('order'),
);

// Default snapshot window (no env override in this process).
assert.strictEqual(syncService.SNAPSHOT_DURATIONS.operational, '3d');
assert.strictEqual(syncService.SNAPSHOT_DURATIONS.couponRedemption, '90d');
assert.ok(syncService.SNAPSHOT_FILTERS.order.includes('time::now() - 3d'));
assert.ok(syncService.SNAPSHOT_FILTERS.coupon_redemption.includes('time::now() - 90d'));

// Lean on-prem window + invalid env fallback.
const lean = syncService.resolveSnapshotDurations({
  POS_SNAPSHOT_OPERATIONAL_DURATION: '12h',
  POS_SNAPSHOT_COUPON_REDEMPTION_DURATION: '7d',
});
assert.deepStrictEqual(lean, { operational: '12h', couponRedemption: '7d' });
const leanFilters = syncService.buildSnapshotFilters(lean);
assert.ok(leanFilters.order.includes("status = 'In Progress'"));
assert.ok(leanFilters.order.includes('time::now() - 12h'));
assert.ok(leanFilters.coupon_redemption.includes('time::now() - 7d'));

const bad = syncService.resolveSnapshotDurations({
  POS_SNAPSHOT_OPERATIONAL_DURATION: '3 days; DROP',
  POS_SNAPSHOT_COUPON_REDEMPTION_DURATION: '',
});
assert.deepStrictEqual(bad, { operational: '3d', couponRedemption: '90d' });

(async () => {
  const db = { query: async () => [[]] };
  try {
    await syncService.handshake(db, {
      protocolVersion: 99,
      schemaVersion: 1,
      terminalId: 'terminal-abcdefgh',
    });
    assert.fail('expected 426');
  } catch (err) {
    assert.strictEqual(err.status, 426);
  }

  // Empty DB: snapshot finishes on records with no events phase.
  const empty = await syncService.snapshotPage(db, {
    terminalId: 'terminal-abcdefgh',
    limit: 200,
  });
  assert.strictEqual(empty.complete, true);
  assert.strictEqual(empty.catalogComplete, true);
  assert.strictEqual(empty.resumeToken, null);
  assert.notStrictEqual(empty.page?.kind, 'events');

  // Catalog scope: empty DB still completes without entering operational tables.
  assert.strictEqual(syncService.resolveSnapshotScope('catalog'), 'catalog');
  assert.strictEqual(syncService.resolveSnapshotScope('full'), 'full');
  assert.strictEqual(syncService.resolveSnapshotScope(undefined), 'full');
  const catalogEmpty = await syncService.snapshotPage(db, {
    terminalId: 'terminal-abcdefgh',
    scope: 'catalog',
    limit: 200,
  });
  assert.strictEqual(catalogEmpty.complete, true);
  assert.strictEqual(catalogEmpty.catalogComplete, true);
  assert.strictEqual(catalogEmpty.resumeToken, null);

  // Catalog scope with data: last page is printer (or earlier), never customer/order.
  const catalogTables = syncService.SNAPSHOT_TABLES.slice(
    0,
    syncService.LAST_CATALOG_TABLE_INDEX + 1,
  );
  const opsTables = new Set(
    syncService.SNAPSHOT_TABLES.slice(syncService.LAST_CATALOG_TABLE_INDEX + 1),
  );
  const catalogDb = {
    query: async (sql, params) => {
      const table = params?.table;
      if (!table || !catalogTables.includes(table)) return [[]];
      // One record per catalog table so pagination advances table-by-table.
      return [[{ id: `${table}:1`, name: table }]];
    },
  };
  let resume = null;
  const seen = [];
  for (let i = 0; i < 100; i += 1) {
    const page = await syncService.snapshotPage(catalogDb, {
      terminalId: 'terminal-abcdefgh',
      scope: 'catalog',
      limit: 200,
      resumeToken: resume,
    });
    if (page.page?.table) {
      assert.ok(
        !opsTables.has(page.page.table),
        `catalog scope must not return ${page.page.table}`,
      );
      seen.push(page.page.table);
    }
    if (page.complete) {
      assert.strictEqual(page.catalogComplete, true);
      assert.strictEqual(page.resumeToken, null);
      break;
    }
    resume = page.resumeToken;
    assert.ok(resume, 'expected resume token while incomplete');
  }
  assert.ok(seen.includes('printer'), `seen=${seen.join(',')}`);
  assert.ok(!seen.includes('customer'));
  assert.ok(!seen.includes('order'));

  // Legacy events resume token completes immediately without replaying history.
  const legacyToken = Buffer.from(
    JSON.stringify({ phase: 'events', afterEvent: 0, highWatermark: 384000 }),
    'utf8',
  ).toString('base64url');
  const legacy = await syncService.snapshotPage(db, {
    terminalId: 'terminal-abcdefgh',
    resumeToken: legacyToken,
  });
  assert.strictEqual(legacy.complete, true);
  assert.strictEqual(legacy.catalogComplete, true);
  assert.strictEqual(legacy.highWatermark, 384000);
  assert.strictEqual(legacy.resumeToken, null);

  console.log('gateway sync-service smoke ok');
})();
