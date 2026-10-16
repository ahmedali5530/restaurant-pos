'use strict';

const assert = require('assert');
const syncService = require('./sync-service');

assert.strictEqual(syncService.PROTOCOL_VERSION, 1);
assert.strictEqual(syncService.SCHEMA_VERSION, 1);
assert.ok(syncService.SNAPSHOT_TABLES.includes('menu_item'));
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
