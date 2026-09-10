'use strict';

const assert = require('assert');
const syncService = require('./sync-service');

assert.strictEqual(syncService.PROTOCOL_VERSION, 1);
assert.strictEqual(syncService.SCHEMA_VERSION, 1);
assert.ok(syncService.SNAPSHOT_TABLES.includes('menu_item'));

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
  console.log('gateway sync-service smoke ok');
})();
