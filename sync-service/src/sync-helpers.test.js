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
  shouldApplyCatalogRow,
  stripUserSecrets,
  prepareCatalogPayload,
  resolveCatalogSyncTables,
  pickWinningCatalogRelease,
} = require('./sync-helpers');
const {
  resolveIncludeTables,
  DEFAULT_INCLUDE_TABLES,
  DEFAULT_UPLOAD_TABLES,
  DEFAULT_DOWNLOAD_TABLES,
  parseList,
  assertDisjointAllowlists,
  resolveDistributionMode,
  loadConfig,
} = require('./config');

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

describe('distribution allowlists', () => {
  it('keeps upload and download disjoint by default', () => {
    assert.doesNotThrow(() => assertDisjointAllowlists(DEFAULT_UPLOAD_TABLES, DEFAULT_DOWNLOAD_TABLES));
    assert.ok(!DEFAULT_DOWNLOAD_TABLES.includes('order'));
    assert.ok(DEFAULT_DOWNLOAD_TABLES.includes('menu_item'));
  });

  it('throws when allowlists overlap', () => {
    assert.throws(
      () => assertDisjointAllowlists(['order', 'menu_item'], ['menu_item', 'tax']),
      /overlap/
    );
  });

  it('defaults mode to report_only when master is set and mode unset', () => {
    assert.equal(resolveDistributionMode({}, 'wss://master'), 'report_only');
    assert.equal(resolveDistributionMode({}, ''), 'off');
    assert.equal(resolveDistributionMode({ SYNC_DISTRIBUTION_MODE: 'full' }, 'wss://x'), 'full');
  });

  it('loadConfig enables download only in full mode', () => {
    const base = {
      SYNC_CLIENT_ID: 'b1',
      SYNC_SOURCE_URL: 'ws://s',
      SYNC_SOURCE_NS: 'n',
      SYNC_SOURCE_DB: 'd',
      SYNC_SOURCE_USER: 'u',
      SYNC_SOURCE_PASS: 'p',
      SYNC_MASTER_URL: 'wss://m',
      SYNC_MASTER_NS: 'n',
      SYNC_MASTER_DB: 'd',
      SYNC_MASTER_USER: 'u',
      SYNC_MASTER_PASS: 'p',
    };
    const report = loadConfig({ ...base });
    assert.equal(report.distributionMode, 'report_only');
    assert.equal(report.uploadEnabled, true);
    assert.equal(report.downloadEnabled, false);

    const full = loadConfig({ ...base, SYNC_DISTRIBUTION_MODE: 'full' });
    assert.equal(full.downloadEnabled, true);
    assert.ok(full.downloadTables.includes('menu_item'));
  });
});

describe('catalog row filter and secrets', () => {
  it('applies shared and matching branch rows only', () => {
    assert.equal(shouldApplyCatalogRow({ name: 'A' }, 'b1'), true);
    assert.equal(shouldApplyCatalogRow({ name: 'A', branch_id: null }, 'b1'), true);
    assert.equal(shouldApplyCatalogRow({ name: 'A', branch_id: 'b1' }, 'b1'), true);
    assert.equal(shouldApplyCatalogRow({ name: 'A', branch_id: 'b2' }, 'b1'), false);
  });

  it('strips user secrets', () => {
    const cleaned = prepareCatalogPayload('user', {
      name: 'Sam',
      password: 'secret',
      pin: '1234',
      password_hash: 'x',
    });
    assert.equal(cleaned.name, 'Sam');
    assert.equal(cleaned.password, undefined);
    assert.equal(cleaned.pin, undefined);
    assert.equal(stripUserSecrets({ pin: '1' }).pin, undefined);
    const dish = prepareCatalogPayload('menu_item', { name: 'Wings', price: 1 });
    assert.deepEqual(dish.categories, []);
    const user = prepareCatalogPayload('user', { name: 'A', password: 'x' });
    assert.deepEqual(user.roles, []);
    assert.equal(user.password, undefined);

    const sparse = prepareCatalogPayload('discount', {
      name: 'fix',
      type: 'Fixed',
      priority: 1,
      category: null,
      application_mode: null,
    });
    assert.equal(sparse.name, 'fix');
    assert.equal(sparse.type, 'Fixed');
    assert.equal(sparse.priority, 1);
    assert.equal('category' in sparse, true);
    assert.equal(sparse.application_mode, 'manual');
    assert.equal(sparse.scope, 'cart');
  });
});

describe('resolveCatalogSyncTables (Phase 5)', () => {
  const allowlist = ['menu_item', 'category', 'tax', 'floor'];

  it('returns full allowlist when releases omit tables', () => {
    assert.deepEqual(
      resolveCatalogSyncTables({
        allowlist,
        localVersion: 1,
        globalRelease: { version: 2 },
        branchRelease: null,
      }),
      allowlist
    );
  });

  it('intersects declared tables with allowlist', () => {
    assert.deepEqual(
      resolveCatalogSyncTables({
        allowlist,
        localVersion: 1,
        globalRelease: { version: 3, tables: ['menu_item', 'tax', 'order'] },
      }),
      ['menu_item', 'tax']
    );
  });

  it('unions tables from tip releases newer than local', () => {
    assert.deepEqual(
      resolveCatalogSyncTables({
        allowlist,
        localVersion: 2,
        globalRelease: { version: 3, tables: ['menu_item'] },
        branchRelease: { version: 4, tables: ['tax', 'floor'] },
      }),
      ['menu_item', 'tax', 'floor']
    );
  });

  it('ignores tip releases already applied locally', () => {
    assert.deepEqual(
      resolveCatalogSyncTables({
        allowlist,
        localVersion: 5,
        globalRelease: { version: 3, tables: ['menu_item'] },
        branchRelease: { version: 4, tables: ['tax'] },
      }),
      // force / already current → use winning tip (branch 4)
      ['tax']
    );
  });

  it('falls back to full allowlist when intersection empty', () => {
    assert.deepEqual(
      resolveCatalogSyncTables({
        allowlist,
        localVersion: 0,
        globalRelease: { version: 1, tables: ['not_a_catalog_table'] },
      }),
      allowlist
    );
  });

  it('pickWinningCatalogRelease prefers higher version then branch on tie', () => {
    assert.equal(
      pickWinningCatalogRelease({ version: 2 }, { version: 5 }).version,
      5
    );
    const branch = { version: 3, id: 'b' };
    const global = { version: 3, id: 'g' };
    assert.equal(pickWinningCatalogRelease(global, branch), branch);
    assert.equal(pickWinningCatalogRelease(global, null), global);
  });
});
