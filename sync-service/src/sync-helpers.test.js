'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isRetryableError,
  isChangefeedRetentionError,
  parseChangeMutation,
  compactChangeBatch,
  nextCursorVersionstamp,
  normalizeShowChangesResult,
  normalizeSelectPage,
  tableNameFromRecordId,
  jsonSafe,
} = require('./sync-helpers');
const { resolveIncludeTables, DEFAULT_INCLUDE_TABLES, parseList } = require('./config');

describe('isRetryableError', () => {
  it('retries timeouts', () => {
    assert.equal(isRetryableError(new Error('master.upsert timed out after 20000ms')), true);
  });

  it('retries network errors', () => {
    assert.equal(isRetryableError(new Error('websocket closed')), true);
    assert.equal(isRetryableError(new Error('ECONNREFUSED')), true);
  });

  it('does not treat parse errors as retention gaps', () => {
    assert.equal(
      isChangefeedRetentionError(new Error('Parse error: Unexpected token SINCE')),
      false
    );
  });

  it('detects retention gaps', () => {
    assert.equal(isChangefeedRetentionError(new Error('cursor outside retention window')), true);
  });
});

describe('parseChangeMutation', () => {
  it('parses delete', () => {
    assert.deepEqual(
      parseChangeMutation({ delete: { id: 'order:1' } }),
      { action: 'DELETE', recordId: 'order:1', value: null }
    );
  });

  it('parses update after-image', () => {
    const value = { id: 'order:1', status: 'Paid' };
    assert.deepEqual(
      parseChangeMutation({ update: value }),
      { action: 'UPDATE', recordId: 'order:1', value }
    );
  });

  it('ignores define_table', () => {
    assert.equal(parseChangeMutation({ define_table: { name: 'order' } }), null);
  });
});

describe('compactChangeBatch', () => {
  it('keeps last action per id and prefers trailing delete', () => {
    const { operations, lastVersionstamp } = compactChangeBatch([
      {
        versionstamp: 10,
        changes: [{ update: { id: 'order:1', status: 'Open' } }],
      },
      {
        versionstamp: 20,
        changes: [
          { update: { id: 'order:1', status: 'Paid' } },
          { update: { id: 'order:2', status: 'Open' } },
        ],
      },
      {
        versionstamp: 30,
        changes: [{ delete: { id: 'order:1' } }],
      },
    ]);

    assert.equal(lastVersionstamp, 30);
    assert.equal(operations.length, 2);
    const byId = Object.fromEntries(operations.map((op) => [String(op.recordId), op]));
    assert.equal(byId['order:1'].action, 'DELETE');
    assert.equal(byId['order:2'].action, 'UPSERT');
    assert.equal(byId['order:2'].value.status, 'Open');
  });

  it('advances cursor on define_table-only batches', () => {
    const { operations, lastVersionstamp } = compactChangeBatch([
      {
        versionstamp: 5,
        changes: [{ define_table: { name: 'order' } }],
      },
    ]);
    assert.equal(operations.length, 0);
    assert.equal(lastVersionstamp, 5);
  });
});

describe('nextCursorVersionstamp', () => {
  it('advances when applied is newer', () => {
    assert.equal(nextCursorVersionstamp(10, 20), 20);
  });

  it('keeps current when applied is older numeric', () => {
    assert.equal(nextCursorVersionstamp(20, 10), 20);
  });

  it('returns applied when current is null', () => {
    assert.equal(nextCursorVersionstamp(null, 7), 7);
  });

  it('compares large versionstamps as BigInt', () => {
    const a = '117324769043873792';
    const b = '117324769043873793';
    assert.equal(nextCursorVersionstamp(a, b), b);
  });
});

describe('sinceLiteral', () => {
  const { sinceLiteral } = require('./sync-helpers');
  it('stringifies bigint stamps', () => {
    assert.equal(sinceLiteral(10n), '10');
    assert.equal(sinceLiteral('117n'), '117');
    assert.equal(sinceLiteral(null), '0');
  });
});

describe('normalize helpers', () => {
  it('unwraps SHOW CHANGES result wrapper', () => {
    const rows = normalizeShowChangesResult([{ result: [{ changes: [], versionstamp: 1 }] }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].versionstamp, 1);
  });

  it('unwraps SELECT page', () => {
    const rows = normalizeSelectPage([[{ id: 'order:1' }]]);
    assert.equal(rows.length, 1);
  });
});

describe('entriesAfterCursor', () => {
  const { entriesAfterCursor } = require('./sync-helpers');

  it('drops the inclusive SINCE stamp so the last change is not replayed', () => {
    const entries = [
      { versionstamp: '10', changes: [{ update: { id: 'order:1' } }] },
      { versionstamp: '20', changes: [{ update: { id: 'order:2' } }] },
    ];
    const next = entriesAfterCursor(entries, '10');
    assert.equal(next.length, 1);
    assert.equal(String(next[0].versionstamp), '20');
  });

  it('returns empty when only the cursor stamp is present', () => {
    const entries = [
      { versionstamp: 117324772836442112n, changes: [{ update: { id: 'order:1' } }] },
    ];
    assert.equal(entriesAfterCursor(entries, '117324772836442112').length, 0);
  });
});

describe('tableNameFromRecordId', () => {
  it('extracts table from record id string', () => {
    assert.equal(tableNameFromRecordId('user:abc'), 'user');
    assert.equal(tableNameFromRecordId('order_item_kitchen:x'), 'order_item_kitchen');
    assert.equal(tableNameFromRecordId(''), '');
  });
});

describe('jsonSafe', () => {
  it('stringifies BigInt for JSON', () => {
    const safe = jsonSafe({ versionstamp: 117324772836442112n, nested: { n: 1n } });
    assert.equal(safe.versionstamp, '117324772836442112');
    assert.equal(safe.nested.n, '1');
    assert.equal(JSON.stringify(safe).includes('117324772836442112'), true);
  });
});

describe('resolveIncludeTables', () => {
  it('uses default FOH allowlist', () => {
    const tables = resolveIncludeTables({});
    assert.ok(tables.includes('order'));
    assert.ok(tables.includes('customer'));
    assert.ok(!tables.includes('inventory_item'));
    assert.equal(tables.length, DEFAULT_INCLUDE_TABLES.length);
  });

  it('honours SYNC_INCLUDE_TABLES override and excludes', () => {
    const tables = resolveIncludeTables({
      SYNC_INCLUDE_TABLES: 'order, inventory_item, order_payment',
      SYNC_EXCLUDE_TABLES: 'inventory_item',
    });
    assert.deepEqual(tables, ['order', 'order_payment']);
  });

  it('parseList trims empty parts', () => {
    assert.deepEqual(parseList(' a, ,b '), ['a', 'b']);
  });
});
