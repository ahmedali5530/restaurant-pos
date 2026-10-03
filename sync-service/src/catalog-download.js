'use strict';

const { RecordId, StringRecordId } = require('surrealdb');
const {
  isRetryableError,
  isChangefeedRetentionError,
  withTimeout,
  withRetry,
  compactChangeBatch,
  nextCursorVersionstamp,
  entriesAfterCursor,
  versionstampForStorage,
  normalizeShowChangesResult,
  normalizeSelectPage,
  recordIdKey,
  tableNameFromRecordId,
  sinceLiteral,
  shouldApplyCatalogRow,
  prepareCatalogPayload,
  resolveCatalogSyncTables,
  RELATION_CATALOG_TABLES,
  USER_SECRET_FIELDS,
} = require('./sync-helpers');
const {
  OVERRIDE_CONTROL_TABLE,
  mergeCatalogBaseWithPatch,
  overrideCacheKey,
} = require('./catalog-override-fields');

function isRecordIdString(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*:[^\s]+$/.test(value.trim());
}

function toAnyRecordId(value) {
  if (!value && value !== 0) return null;
  if (value instanceof RecordId || value instanceof StringRecordId) return value;
  if (typeof value === 'string') {
    return isRecordIdString(value) ? new StringRecordId(value.trim()) : null;
  }
  if (typeof value === 'object' && 'tb' in value && 'id' in value) {
    const keys = Object.keys(value);
    if (keys.length > 0 && !keys.every((key) => key === 'tb' || key === 'id' || key === 'table')) {
      return null;
    }
    const table = typeof value.tb === 'string'
      ? value.tb
      : (value.tb && typeof value.tb === 'object' && 'name' in value.tb
        ? value.tb.name
        : String(value.tb));
    if (!table) return null;
    return new RecordId(table, value.id);
  }
  return null;
}

function recordIdToString(value) {
  if (!value && value !== 0) return '';
  return String(value);
}

function downCursorId(tableName) {
  return new RecordId('sync_catalog_down_cursor', tableName);
}

function releaseMetaId() {
  return new RecordId('sync_catalog_down_cursor', '_meta');
}

/**
 * Cloud → local catalog downloader. Separate cursors from sales upload.
 */
class CatalogDownloadManager {
  constructor(config, logger, getClients) {
    this.config = config;
    this.logger = logger;
    /** @type {() => { source: any, master: any }} */
    this.getClients = getClients;
    this.tableState = new Map();
    this.writeChain = Promise.resolve();
    this.forceNextPoll = false;
    /** @type {Map<string, Record<string, unknown>>} */
    this.overrideCache = new Map();
    this.stats = {
      eventsProcessed: 0,
      eventsFailed: 0,
      lastEventAt: null,
      lastError: null,
      lastSynced: null,
      syncing: null,
      localVersion: 0,
      remoteVersion: 0,
      /** Tables used on the last Sync now (allowlist ∩ release.tables). */
      lastSyncTables: null,
      /** Tip release tables from master (may be null when legacy / full). */
      releaseTables: null,
      tables: {},
      progress: {
        running: false,
        totalTables: 0,
        completedTables: 0,
        currentTable: null,
        percent: 0,
        startedAt: null,
        finishedAt: null,
      },
    };
    /** @type {{ global: any, branch: any }} */
    this.releaseTips = { global: null, branch: null };
  }

  get source() {
    return this.getClients().source;
  }

  get master() {
    return this.getClients().master;
  }

  assertClients() {
    if (!this.source) {
      throw new Error('Local SurrealDB is not connected');
    }
    if (!this.master) {
      throw new Error('Cloud SurrealDB is not connected');
    }
  }

  getStats() {
    const tables = {};
    for (const [name, state] of this.tableState.entries()) {
      tables[name] = {
        versionstamp: versionstampForStorage(state.versionstamp),
        backfillDone: state.backfillDone,
        lastError: state.lastError,
        lastEventAt: state.lastEventAt,
        lastSynced: state.lastSynced || null,
        blocked: Boolean(state.blockedUntil && Date.now() < state.blockedUntil),
      };
    }
    return {
      ...this.stats,
      tables: { ...this.stats.tables, ...tables },
      subscribedTables: [...this.config.downloadTables],
    };
  }

  enqueueWrite(task) {
    const run = this.writeChain.then(task, task);
    this.writeChain = run.catch(() => {});
    return run;
  }

  ensureTableState(tableName) {
    if (!this.tableState.has(tableName)) {
      this.tableState.set(tableName, {
        versionstamp: null,
        backfillDone: false,
        lastError: null,
        lastEventAt: null,
        lastSynced: null,
        blockedUntil: 0,
        backoffMs: 1000,
      });
    }
    return this.tableState.get(tableName);
  }

  noteSyncing(partial) {
    this.stats.syncing = partial
      ? {
          table: partial.table,
          recordId: partial.recordId || null,
          action: partial.action || null,
          phase: partial.phase || null,
          at: new Date().toISOString(),
        }
      : null;
  }

  noteLastSynced(partial) {
    const entry = {
      table: partial.table,
      recordId: partial.recordId || null,
      action: partial.action || null,
      phase: partial.phase || null,
      versionstamp: versionstampForStorage(partial.versionstamp),
      at: new Date().toISOString(),
    };
    this.stats.lastSynced = entry;
    this.stats.lastEventAt = entry.at;
    const state = this.ensureTableState(partial.table);
    state.lastSynced = entry;
    state.lastEventAt = entry.at;
  }

  async ensureLocalCursorTable() {
    await this.source.query(
      'DEFINE TABLE IF NOT EXISTS sync_catalog_down_cursor SCHEMALESS PERMISSIONS NONE;'
    );
  }

  async ensureMasterCatalogFeeds() {
    for (const tableName of this.config.downloadTables) {
      try {
        await this.master.query(`ALTER TABLE IF EXISTS ${tableName} CHANGEFEED 14d;`);
      } catch (error) {
        this.logger.warn('Could not enable catalog changefeed on master', {
          table: tableName,
          error: error.message || String(error),
        });
      }
      try {
        await this.master.query(
          `DEFINE FIELD IF NOT EXISTS branch_id ON ${tableName} TYPE option<string> PERMISSIONS FULL;`
        );
      } catch (error) {
        this.logger.warn('Could not define branch_id on master catalog table', {
          table: tableName,
          error: error.message || String(error),
        });
      }
    }

    try {
      await this.master.query(
        `DEFINE FIELD IF NOT EXISTS branch_ids ON user TYPE option<array<string>> PERMISSIONS FULL;`
      );
    } catch (error) {
      this.logger.warn('Could not define branch_ids on master user', {
        error: error.message || String(error),
      });
    }

    try {
      await this.master.query(`
        DEFINE TABLE IF NOT EXISTS catalog_release SCHEMALESS PERMISSIONS NONE;
      `);
    } catch (error) {
      this.logger.warn('Could not define catalog_release on master', {
        error: error.message || String(error),
      });
    }

    try {
      await this.master.query(`
        DEFINE TABLE IF NOT EXISTS catalog_branch_override SCHEMALESS PERMISSIONS NONE;
        ALTER TABLE IF EXISTS catalog_branch_override CHANGEFEED 14d;
      `);
    } catch (error) {
      this.logger.warn('Could not define catalog_branch_override on master', {
        error: error.message || String(error),
      });
    }
  }

  /**
   * Load sparse branch patches for this SYNC_CLIENT_ID into memory for the sync pass.
   */
  async loadOverrideCache() {
    this.overrideCache = new Map();
    const branchId = String(this.config.clientId || '');
    if (!branchId) return;

    try {
      const result = await withTimeout(
        this.master.query(
          'SELECT * FROM catalog_branch_override WHERE branch_id = $branchId',
          { branchId }
        ),
        30000,
        'master.catalog_branch_override'
      );
      const rows = normalizeSelectPage(result);
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const table = String(row.table || '');
        const baseId = String(row.base_id || '');
        if (!table || !baseId) continue;
        const patch = row.patch && typeof row.patch === 'object' ? row.patch : {};
        this.overrideCache.set(overrideCacheKey(table, baseId), patch);
      }
      this.logger.info('Loaded catalog branch overrides', {
        branchId,
        count: this.overrideCache.size,
      });
    } catch (error) {
      this.logger.warn('Failed to load catalog_branch_override cache', {
        error: error.message || String(error),
      });
    }
  }

  patchForBase(tableName, targetId) {
    const key = overrideCacheKey(tableName, recordIdToString(targetId));
    return this.overrideCache.get(key) || null;
  }

  async loadTableStates() {
    this.tableState.clear();
    for (const tableName of this.config.downloadTables) {
      const state = this.ensureTableState(tableName);
      try {
        const row = await this.source.select(downCursorId(tableName));
        if (row && typeof row === 'object') {
          state.versionstamp = row.versionstamp != null ? row.versionstamp : null;
          state.backfillDone = Boolean(row.backfill_done);
        }
      } catch (error) {
        this.logger.warn('Failed to load catalog down cursor', {
          table: tableName,
          error: error.message || String(error),
        });
      }
    }

    try {
      const meta = await this.source.select(releaseMetaId());
      if (meta && meta.local_version != null) {
        this.stats.localVersion = Number(meta.local_version) || 0;
      }
    } catch {
      // ignore
    }
  }

  async saveCursor(tableName, patch) {
    const state = this.ensureTableState(tableName);
    if (patch.versionstamp !== undefined) state.versionstamp = patch.versionstamp;
    if (patch.backfillDone !== undefined) state.backfillDone = patch.backfillDone;

    const payload = {
      table: tableName,
      versionstamp: versionstampForStorage(state.versionstamp),
      backfill_done: state.backfillDone,
      updated_at: new Date().toISOString(),
    };

    await withRetry(
      () => this.source.upsert(downCursorId(tableName)).content(payload),
      { label: `downCursor.upsert(${tableName})`, timeoutMs: 15000, retries: 3 }
    );
  }

  async saveLocalVersion(version) {
    this.stats.localVersion = Number(version) || 0;
    await withRetry(
      () => this.source.upsert(releaseMetaId()).content({
        local_version: this.stats.localVersion,
        updated_at: new Date().toISOString(),
      }),
      { label: 'downCursor.meta', timeoutMs: 15000, retries: 3 }
    );
  }

  async refreshRemoteVersion() {
    let globalVersion = 0;
    let branchVersion = 0;
    let globalRow = null;
    let branchRow = null;
    try {
      globalRow = await this.master.select(new RecordId('catalog_release', 'current'));
      if (globalRow && globalRow.version != null) globalVersion = Number(globalRow.version) || 0;
    } catch {
      // missing is fine
    }
    try {
      const branchKey = String(this.config.clientId).replace(/[^A-Za-z0-9_-]/g, '_');
      branchRow = await this.master.select(new RecordId('catalog_release', branchKey));
      if (branchRow && branchRow.version != null) branchVersion = Number(branchRow.version) || 0;
    } catch {
      // missing is fine
    }
    this.releaseTips = { global: globalRow, branch: branchRow };
    this.stats.remoteVersion = Math.max(globalVersion, branchVersion);
    this.stats.releaseTables = resolveCatalogSyncTables({
      allowlist: this.config.downloadTables,
      localVersion: this.stats.localVersion,
      globalRelease: globalRow,
      branchRelease: branchRow,
    });
    return this.stats.remoteVersion;
  }

  /** Tables to download for the next Sync now pass (Phase 5 filter). */
  resolveSyncTables() {
    return resolveCatalogSyncTables({
      allowlist: this.config.downloadTables,
      localVersion: this.stats.localVersion,
      globalRelease: this.releaseTips.global,
      branchRelease: this.releaseTips.branch,
    });
  }

  requestForceSync() {
    this.forceNextPoll = true;
    for (const tableName of this.config.downloadTables) {
      const state = this.ensureTableState(tableName);
      state.blockedUntil = 0;
      state.backoffMs = 1000;
    }
    // Placeholder until pollAll resolves release.tables ∩ allowlist.
    this.stats.progress = {
      running: true,
      totalTables: 0,
      completedTables: 0,
      currentTable: null,
      percent: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
  }

  async initialize() {
    await this.ensureLocalCursorTable();
    await this.ensureMasterCatalogFeeds();
    await this.loadTableStates();
    await this.refreshRemoteVersion();
    this.logger.info('Catalog download ready', {
      tables: this.config.downloadTables.length,
      localVersion: this.stats.localVersion,
      remoteVersion: this.stats.remoteVersion,
      releaseTables: this.stats.releaseTables?.length ?? null,
    });
  }

  async pollAll() {
    if (!this.config.downloadEnabled) return;

    this.assertClients();
    await this.refreshRemoteVersion();

    const force = this.forceNextPoll;
    this.forceNextPoll = false;

    // Catalog download is on-demand only (POST /catalog/sync-now / Settings Sync now).
    if (!force) return;

    this.assertClients();

    const tables = this.resolveSyncTables();
    const total = tables.length;
    this.stats.lastSyncTables = [...tables];
    // Keep/refresh progress (requestForceSync already set running=true).
    this.stats.progress = {
      ...(this.stats.progress || {}),
      running: true,
      totalTables: total,
      completedTables: 0,
      currentTable: null,
      percent: 0,
      startedAt: this.stats.progress?.startedAt || new Date().toISOString(),
      finishedAt: null,
    };

    this.logger.info('Catalog download started (on-demand)', {
      tables: total,
      tableNames: tables,
      filtered: tables.length < this.config.downloadTables.length,
      localVersion: this.stats.localVersion,
      remoteVersion: this.stats.remoteVersion,
    });

    try {
      await this.loadOverrideCache();

      for (let i = 0; i < tables.length; i += 1) {
        const tableName = tables[i];
        this.stats.progress.currentTable = tableName;
        this.stats.progress.completedTables = i;
        this.stats.progress.percent = total > 0
          ? Math.min(99, Math.round((i / total) * 100))
          : 0;
        await this.pollTable(tableName);
        this.stats.progress.completedTables = i + 1;
        this.stats.progress.percent = total > 0
          ? Math.round(((i + 1) / total) * 100)
          : 100;
      }

      this.stats.progress.currentTable = OVERRIDE_CONTROL_TABLE;
      await this.pollOverrideControlTable();
      await this.reapplyOverriddenBases();

      if (this.stats.remoteVersion > this.stats.localVersion) {
        await this.saveLocalVersion(this.stats.remoteVersion);
      }
    } finally {
      this.stats.progress.running = false;
      this.stats.progress.currentTable = null;
      this.stats.progress.completedTables = total;
      this.stats.progress.percent = 100;
      this.stats.progress.finishedAt = new Date().toISOString();
      this.noteSyncing(null);
    }

    this.logger.info('Catalog download finished', {
      localVersion: this.stats.localVersion,
      remoteVersion: this.stats.remoteVersion,
      tablesSynced: total,
      eventsProcessed: this.stats.eventsProcessed,
      eventsFailed: this.stats.eventsFailed,
    });
  }

  async pollTable(tableName) {
    this.assertClients();
    const state = this.ensureTableState(tableName);
    if (state.blockedUntil && Date.now() < state.blockedUntil) return;

    try {
      if (!state.backfillDone) {
        await this.backfillTable(tableName);
      }
      await this.tailTable(tableName);
      state.lastError = null;
      state.backoffMs = 1000;
      state.blockedUntil = 0;
    } catch (error) {
      state.lastError = error.message || String(error);
      this.stats.lastError = state.lastError;
      this.stats.eventsFailed += 1;

      if (isChangefeedRetentionError(error)) {
        this.logger.warn('Catalog down cursor outside retention; re-backfilling', {
          table: tableName,
          error: state.lastError,
        });
        state.backfillDone = false;
        state.versionstamp = null;
        await this.saveCursor(tableName, { backfillDone: false, versionstamp: null }).catch(() => {});
        return;
      }

      state.backoffMs = Math.min(
        isRetryableError(error)
          ? state.backoffMs * 2
          : Math.max(state.backoffMs, 5000) * 2,
        5 * 60 * 1000
      );
      state.blockedUntil = Date.now() + state.backoffMs;
      this.logger.warn('Catalog download table blocked', {
        table: tableName,
        backoffMs: state.backoffMs,
        error: state.lastError,
      });
    }
  }

  async readFeedWatermark(tableName) {
    try {
      const result = await this.master.query(
        `SHOW CHANGES FOR TABLE ${tableName} SINCE 0 LIMIT 1000;`
      );
      const entries = normalizeShowChangesResult(result);
      if (!entries.length) return 0;
      return entries[entries.length - 1].versionstamp ?? 0;
    } catch (error) {
      this.logger.warn('Could not read master catalog watermark', {
        table: tableName,
        error: error.message || String(error),
      });
      return 0;
    }
  }

  async selectMasterPage(tableName, limit, start) {
    const branchId = this.config.clientId;
    // Shared (no branch_id) or this branch. Users may also list branch_ids[].
    const result = await withRetry(
      () => this.master.query(
        `SELECT * FROM ${tableName}
          WHERE branch_id = NONE OR branch_id = NULL OR branch_id = $branchId
            OR (type::is::array(branch_ids) AND $branchId IN branch_ids)
          LIMIT $limit START $start;`,
        { branchId, limit, start }
      ),
      { label: `master.selectPage(${tableName})`, timeoutMs: 30000, retries: 3 }
    );
    return normalizeSelectPage(result);
  }

  async backfillTable(tableName) {
    const state = this.ensureTableState(tableName);
    this.logger.info('Starting catalog backfill', { table: tableName });

    const watermark = await this.readFeedWatermark(tableName);
    const pageSize = this.config.backfillPageSize;
    let start = 0;

    for (;;) {
      const page = await this.selectMasterPage(tableName, pageSize, start);
      if (!page.length) break;

      for (const row of page) {
        if (!shouldApplyCatalogRow(row, this.config.clientId)) continue;
        const targetId = toAnyRecordId(row && row.id);
        if (!targetId) continue;
        const recordId = recordIdToString(targetId);
        this.noteSyncing({
          table: tableName,
          recordId,
          action: 'UPSERT',
          phase: 'catalog-backfill',
        });
        try {
          await this.enqueueWrite(() => this.upsertLocal(tableName, targetId, row));
          this.stats.eventsProcessed += 1;
          this.noteLastSynced({
            table: tableName,
            recordId,
            action: 'UPSERT',
            phase: 'catalog-backfill',
          });
        } finally {
          this.noteSyncing(null);
        }
      }

      start += page.length;
      if (page.length < pageSize) break;
    }

    await this.saveCursor(tableName, {
      backfillDone: true,
      versionstamp: watermark != null ? watermark : state.versionstamp,
    });
    this.logger.info('Catalog backfill complete', {
      table: tableName,
      rows: start,
      versionstamp: versionstampForStorage(state.versionstamp),
    });
  }

  async tailTable(tableName) {
    const state = this.ensureTableState(tableName);
    const since = state.versionstamp != null ? state.versionstamp : 0;
    const limit = this.config.changeLimit;
    const sql = `SHOW CHANGES FOR TABLE ${tableName} SINCE ${sinceLiteral(since)} LIMIT ${Number(limit) || 100};`;

    const result = await withRetry(
      () => this.master.query(sql),
      { label: `SHOW CHANGES down(${tableName})`, timeoutMs: 20000, retries: 3 }
    );

    const entries = entriesAfterCursor(normalizeShowChangesResult(result), since);
    if (!entries.length) return;

    const { operations, lastVersionstamp } = compactChangeBatch(entries);
    if (!operations.length) {
      if (lastVersionstamp != null) {
        await this.saveCursor(tableName, { versionstamp: lastVersionstamp });
      }
      return;
    }

    let appliedStamp = state.versionstamp;
    for (const op of operations) {
      const recordId = recordIdKey(op.recordId);
      this.noteSyncing({
        table: tableName,
        recordId,
        action: op.action,
        phase: 'catalog-changefeed',
      });
      try {
        const applied = await this.applyOperation(tableName, op);
        if (!applied) {
          // Skipped (other branch) — still advance past this stamp.
          appliedStamp = nextCursorVersionstamp(appliedStamp, op.versionstamp);
          await this.saveCursor(tableName, { versionstamp: appliedStamp });
          continue;
        }
        appliedStamp = nextCursorVersionstamp(appliedStamp, op.versionstamp);
        await this.saveCursor(tableName, { versionstamp: appliedStamp });
        this.stats.eventsProcessed += 1;
        this.noteLastSynced({
          table: tableName,
          recordId,
          action: op.action,
          phase: 'catalog-changefeed',
          versionstamp: op.versionstamp,
        });
      } finally {
        this.noteSyncing(null);
      }
    }

    if (lastVersionstamp != null) {
      const advanced = nextCursorVersionstamp(state.versionstamp, lastVersionstamp);
      if (advanced !== state.versionstamp) {
        await this.saveCursor(tableName, { versionstamp: advanced });
      }
    }
  }

  /**
   * Tail catalog_branch_override on master; refresh cache for this branch.
   * Does not write override rows to local Surreal.
   */
  async pollOverrideControlTable() {
    const tableName = OVERRIDE_CONTROL_TABLE;
    const state = this.ensureTableState(tableName);
    if (state.blockedUntil && Date.now() < state.blockedUntil) return;

    try {
      if (!state.backfillDone) {
        const watermark = await this.readFeedWatermark(tableName);
        await this.saveCursor(tableName, {
          backfillDone: true,
          versionstamp: watermark,
        });
      }

      const since = sinceLiteral(state.versionstamp);
      const result = await withTimeout(
        this.master.query(
          `SHOW CHANGES FOR TABLE ${tableName} SINCE ${since} LIMIT ${this.config.changeLimit};`
        ),
        30000,
        `master.showChanges(${tableName})`
      );
      const entries = entriesAfterCursor(
        normalizeShowChangesResult(result),
        state.versionstamp
      );
      if (!entries.length) return;

      const { operations, lastVersionstamp } = compactChangeBatch(entries);
      const branchId = String(this.config.clientId || '');
      let sawDelete = false;

      for (const op of operations) {
        if (op.action === 'DELETE') {
          sawDelete = true;
          continue;
        }
        const value = op.value || {};
        const rowBranch = value.branch_id != null ? String(value.branch_id) : null;
        if (rowBranch && rowBranch !== branchId) continue;
        const table = String(value.table || '');
        const baseId = String(value.base_id || '');
        if (!table || !baseId) continue;
        if (value.patch == null) {
          this.overrideCache.delete(overrideCacheKey(table, baseId));
        } else {
          const patch = value.patch && typeof value.patch === 'object' ? value.patch : {};
          this.overrideCache.set(overrideCacheKey(table, baseId), patch);
        }
      }

      if (sawDelete) {
        await this.loadOverrideCache();
      }

      if (lastVersionstamp != null) {
        await this.saveCursor(tableName, { versionstamp: lastVersionstamp });
      }
      state.lastError = null;
      state.backoffMs = 1000;
      state.blockedUntil = 0;
    } catch (error) {
      state.lastError = error.message || String(error);
      this.logger.warn('Override control poll failed', {
        error: state.lastError,
      });
      if (isChangefeedRetentionError(error)) {
        state.backfillDone = false;
        state.versionstamp = null;
        await this.saveCursor(tableName, { backfillDone: false, versionstamp: null }).catch(() => {});
        await this.loadOverrideCache();
      }
    }
  }

  /**
   * Re-upsert every base that has a patch for this branch (override-only publishes).
   */
  async reapplyOverriddenBases() {
    for (const key of this.overrideCache.keys()) {
      const sep = key.indexOf(':');
      if (sep <= 0) continue;
      const tableName = key.slice(0, sep);
      const baseIdStr = key.slice(sep + 1);
      const targetId = toAnyRecordId(baseIdStr);
      if (!targetId) continue;
      try {
        const row = await withTimeout(
          this.master.select(targetId),
          15000,
          `master.select(${baseIdStr})`
        );
        if (!row || !shouldApplyCatalogRow(row, this.config.clientId)) continue;
        await this.enqueueWrite(() => this.upsertLocal(tableName, targetId, row));
        this.stats.eventsProcessed += 1;
      } catch (error) {
        this.logger.warn('Failed to re-apply overridden base', {
          key,
          error: error.message || String(error),
        });
      }
    }
  }

  /**
   * @returns {Promise<boolean>} true if a local write happened
   */
  async applyOperation(tableName, op) {
    const targetId = toAnyRecordId(op.recordId);
    if (!targetId) return false;

    return this.enqueueWrite(async () => {
      if (op.action === 'DELETE') {
        await withRetry(
          () => this.source.delete(targetId),
          { label: `local.delete(${recordIdToString(targetId)})`, retries: 5, timeoutMs: 15000 }
        );
        return true;
      }

      let row = op.value || {};
      try {
        const fresh = await withTimeout(
          this.master.select(targetId),
          15000,
          `master.select(${recordIdToString(targetId)})`
        );
        if (!fresh) {
          await withRetry(
            () => this.source.delete(targetId),
            { label: `local.delete(${recordIdToString(targetId)})`, retries: 3, timeoutMs: 15000 }
          );
          return true;
        }
        row = fresh;
      } catch (error) {
        this.logger.warn('Fresh master read failed; using feed payload', {
          id: recordIdToString(targetId),
          error: error.message || String(error),
        });
      }

      if (!shouldApplyCatalogRow(row, this.config.clientId)) {
        return false;
      }

      await this.upsertLocal(tableName, targetId, row);
      return true;
    });
  }

  async upsertLocal(tableName, targetId, value) {
    const patch = this.patchForBase(tableName, targetId);
    const merged = mergeCatalogBaseWithPatch(tableName, value, patch);
    // Never materialize cloud branch scoping onto local schemafull catalog tables.
    delete merged.branch_id;
    delete merged.branch_ids;
    const payload = prepareCatalogPayload(tableName, merged);
    const expectedId = recordIdToString(targetId);

    if (RELATION_CATALOG_TABLES.includes(tableName)) {
      const inId = toAnyRecordId(payload.in);
      const outId = toAnyRecordId(payload.out);
      if (!inId || !outId) {
        throw new Error(`Relation ${expectedId} missing in/out endpoints`);
      }
      const row = { ...payload, id: targetId, in: inId, out: outId };
      const written = await withRetry(
        () => this.source.query(
          `DELETE $id; INSERT RELATION INTO ${tableName} $row;`,
          { id: targetId, row }
        ),
        { label: `local.relate(${expectedId})`, timeoutMs: 20000 }
      );
      const batch = Array.isArray(written) ? written[written.length - 1] : written;
      const writtenRecord = Array.isArray(batch) ? batch[0] : batch;
      const writtenId = recordIdToString(
        writtenRecord && typeof writtenRecord === 'object' ? writtenRecord.id : null
      );
      if (writtenId && writtenId !== expectedId) {
        throw new Error(`Local returned different id: expected ${expectedId}, got ${writtenId}`);
      }
      return writtenRecord;
    }

    const written = await withRetry(
      async () => {
        // Never let catalog merge wipe branch login secrets. Prefer existing
        // local credentials; only copy from cloud when local has none (repair).
        if (tableName === 'user') {
          let existing = null;
          try {
            existing = await this.source.select(targetId);
          } catch {
            existing = null;
          }
          for (const key of USER_SECRET_FIELDS) {
            const localVal = existing && existing[key];
            if (localVal != null && localVal !== '') {
              payload[key] = localVal;
            } else if (value && value[key] != null && value[key] !== '') {
              payload[key] = value[key];
            }
          }
        }
        return this.source.upsert(targetId).merge(payload);
      },
      { label: `local.upsert(${expectedId})`, timeoutMs: 20000 }
    );
    const writtenRecord = Array.isArray(written) ? written[0] : written;
    const writtenId = recordIdToString(
      writtenRecord && typeof writtenRecord === 'object' ? writtenRecord.id : null
    );
    if (writtenId && writtenId !== expectedId) {
      throw new Error(`Local returned different id: expected ${expectedId}, got ${writtenId}`);
    }
    return writtenRecord;
  }
}

module.exports = {
  CatalogDownloadManager,
  shouldApplyCatalogRow,
  prepareCatalogPayload,
};
