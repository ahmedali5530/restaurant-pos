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
