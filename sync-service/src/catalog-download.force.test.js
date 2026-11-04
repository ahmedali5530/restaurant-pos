'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CatalogDownloadManager } = require('./catalog-download');

function createManager() {
  const config = {
    downloadEnabled: true,
    downloadTables: ['menu_item', 'category'],
    clientId: 'branch-02',
    backfillPageSize: 200,
    changeLimit: 100,
  };
  const logger = {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
  return new CatalogDownloadManager(config, logger, () => ({
    source: null,
    master: null,
  }));
}

describe('CatalogDownloadManager requestForceSync', () => {
  it('flags the next poll to reset backfill cursors', () => {
    const mgr = createManager();
    const state = mgr.ensureTableState('menu_item');
    state.backfillDone = true;
    state.versionstamp = 99;
    state.blockedUntil = Date.now() + 60_000;

    mgr.requestForceSync();

    assert.equal(mgr.forceNextPoll, true);
    assert.equal(mgr.resetBackfillOnNextForce, true);
    assert.equal(state.blockedUntil, 0);
    assert.equal(mgr.stats.progress.running, true);
  });

  it('resetCatalogBackfillCursors clears backfill_done in memory', async () => {
    const mgr = createManager();
    const saves = [];
    mgr.saveCursor = async (tableName, patch) => {
      saves.push({ tableName, patch });
      const state = mgr.ensureTableState(tableName);
      if (patch.backfillDone !== undefined) state.backfillDone = patch.backfillDone;
      if (patch.versionstamp !== undefined) state.versionstamp = patch.versionstamp;
    };

    const menu = mgr.ensureTableState('menu_item');
    menu.backfillDone = true;
    menu.versionstamp = 42;

    await mgr.resetCatalogBackfillCursors(['menu_item']);

    assert.equal(menu.backfillDone, false);
    assert.equal(menu.versionstamp, null);
    assert.ok(saves.some((s) => s.tableName === 'menu_item' && s.patch.backfillDone === false));
    assert.ok(saves.some((s) => s.tableName === 'catalog_branch_override'));
  });
});

describe('CatalogDownloadManager pruneStaleRelationRows', () => {
  function createPruneManager(localRows) {
    const deleted = [];
    const source = {
      query: async () => [localRows],
      delete: async (id) => {
        deleted.push(String(id));
        return id;
      },
    };
    const config = {
      downloadEnabled: true,
      downloadTables: ['menu_item_modifier_group'],
      clientId: 'branch-02',
      backfillPageSize: 200,
      changeLimit: 100,
    };
    const logger = {
      info() {},
      warn() {},
      error() {},
      debug() {},
    };
    const mgr = new CatalogDownloadManager(config, logger, () => ({
      source,
      master: null,
    }));
    mgr.assertClients = () => {};
    mgr.enqueueWrite = async (fn) => fn();
    return { mgr, deleted };
  }

  it('deletes local menu_item_modifier_group edges missing from the HQ keep set', async () => {
    const { mgr, deleted } = createPruneManager([
      { id: 'menu_item_modifier_group:keep' },
      { id: 'menu_item_modifier_group:stale' },
    ]);

    await mgr.pruneStaleRelationRows(
      'menu_item_modifier_group',
      new Set(['menu_item_modifier_group:keep'])
    );

    assert.deepEqual(deleted, ['menu_item_modifier_group:stale']);
  });

  it('clears every local edge when the HQ keep set is empty', async () => {
    const { mgr, deleted } = createPruneManager([
      { id: 'menu_item_modifier_group:a' },
      { id: 'menu_item_modifier_group:b' },
    ]);

    await mgr.pruneStaleRelationRows('menu_item_modifier_group', new Set());

    assert.deepEqual(deleted, [
      'menu_item_modifier_group:a',
      'menu_item_modifier_group:b',
    ]);
  });
});
