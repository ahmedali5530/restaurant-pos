'use strict';

const { createConnectedClient, closeClient } = require('./surreal-client');
const { RecordId, StringRecordId } = require('surrealdb');
const {
  isRetryableError,
  isChangefeedRetentionError,
  compactChangeBatch,
  nextCursorVersionstamp,
  entriesAfterCursor,
  versionstampForStorage,
  normalizeShowChangesResult,
  normalizeSelectPage,
  recordIdKey,
  tableNameFromRecordId,
  jsonSafe,
  sinceLiteral,
} = require('./sync-helpers');

function isRecordIdString(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*:[^\s]+$/.test(value.trim());
}

function toAnyRecordId(value) {
  if (!value && value !== 0) return null;
  if (value instanceof RecordId || value instanceof StringRecordId) return value;

  if (typeof value === 'string') {
    return isRecordIdString(value) ? new StringRecordId(value.trim()) : null;
  }

  if (typeof value === 'object') {
    if ('tb' in value && 'id' in value) {
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

    if (value.constructor && (value.constructor.name === 'RecordId' || value.constructor.name === 'StringRecordId')) {
      const asString = String(value);
      return isRecordIdString(asString) ? new StringRecordId(asString) : null;
    }
  }

  return null;
}

function recordIdToString(value) {
  if (!value && value !== 0) return '';
  return String(value);
}

function isRecordLink(value) {
  return Boolean(toAnyRecordId(value));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function withRetry(task, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 5;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 75;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 20000;
  const label = options.label || 'operation';
  let lastError;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await withTimeout(Promise.resolve().then(task), timeoutMs, label);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }

  throw lastError;
}

function collectArrayLinkedRecordIds(record) {
  const links = [];
  if (!record || typeof record !== 'object') return links;

  for (const [key, value] of Object.entries(record)) {
    if (key === 'id' || !Array.isArray(value)) continue;
    for (const item of value) {
      if (!isRecordLink(item)) continue;
      links.push(toAnyRecordId(item));
    }
  }

  return links.filter(Boolean);
}

function normalizePayloadLinks(payload) {
  const normalized = { ...(payload || {}) };

  for (const [key, value] of Object.entries(normalized)) {
    if (key === 'id') continue;

    if (isRecordLink(value)) {
      normalized[key] = toAnyRecordId(value);
      continue;
    }

    if (!Array.isArray(value)) continue;
    if (!value.length || !value.some(isRecordLink)) continue;
    normalized[key] = value.map((item) => (isRecordLink(item) ? toAnyRecordId(item) : item));
  }

  return normalized;
}

function buildContentPayload(value, branchId) {
  const payload = normalizePayloadLinks({ ...(value || {}) });
  delete payload.id;
  if (branchId) {
    payload.branch_id = branchId;
  }
  return payload;
}

function cursorRecordId(tableName) {
  return new RecordId('sync_cloud_cursor', tableName);
}

class SyncManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.source = null;
    this.master = null;
    this.reconnectTimer = null;
    this.pollTimer = null;
    this.isStopping = false;
    this.isReconnecting = false;
    this.pollInFlight = false;
    this.pollStartedAt = null;
    this.tableState = new Map();
    this.writeChain = Promise.resolve();
    this.stats = {
      startedAt: null,
      healthy: false,
      connectedSource: false,
      connectedMaster: false,
      subscribedTables: [],
      eventsProcessed: 0,
      eventsFailed: 0,
      lastEventAt: null,
      lastError: null,
      /** Last successfully applied record (any table). */
      lastSynced: null,
      /** Record currently being applied, or null when idle between polls. */
      syncing: null,
      /** True while a poll cycle is running (including a hung master call). */
      pollInFlight: false,
      pollStartedAt: null,
      tables: {},
    };
  }

  noteSyncing( partial) {
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
    return jsonSafe({
      ...this.stats,
      pollInFlight: this.pollInFlight,
      pollStartedAt: this.pollStartedAt,
      subscribedTables: [...this.stats.subscribedTables],
      tables: { ...this.stats.tables, ...tables },
    });
  }

  enqueueWrite(task) {
    const run = this.writeChain.then(task, task);
    this.writeChain = run.catch(() => {});
    return run;
  }

  async start() {
    this.stats.startedAt = new Date().toISOString();
    try {
      await this.connectAndStart();
    } catch (error) {
      this.logger.error('Sync startup failed, scheduling reconnect', {
        error: error.message || String(error),
      });
      this.scheduleReconnect();
    }
  }

  async stop() {
    this.isStopping = true;
    this.stats.healthy = false;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.pollTimer);

    await closeClient(this.source);
    await closeClient(this.master);
    this.source = null;
    this.master = null;
    this.stats.connectedSource = false;
    this.stats.connectedMaster = false;
  }

  async connectAndStart() {
    try {
      await this.connectClients();
      await this.ensureMasterBranchFields();
      await this.ensureSourceCursorTable();
      await this.loadTableStates();
      this.stats.healthy = true;
      this.stats.lastError = null;
      this.stats.subscribedTables = [...this.config.includeTables];
      this.logger.info('Sync manager ready (changefeed)', {
        tables: this.config.includeTables.length,
      });
      this.schedulePoll(0);
    } catch (error) {
      this.stats.healthy = false;
      this.stats.connectedMaster = false;
      this.stats.lastError = error.message || String(error);
      // Caller (start / reconnect) schedules the next attempt. Do not call
      // scheduleReconnect here — reconnect() sets isReconnecting and would
      // make scheduleReconnect no-op, permanently stopping retries.
      throw error;
    }
  }

  async connectClients() {
    await closeClient(this.source);
    await closeClient(this.master);

    this.source = await withTimeout(
      createConnectedClient('Source', this.config.source, this.logger),
      15000,
      'source.connect'
    );
    this.stats.connectedSource = true;

    this.master = await withTimeout(
      createConnectedClient('Master', this.config.master, this.logger),
      15000,
      'master.connect'
    );
    this.stats.connectedMaster = true;
  }

  async ensureSourceCursorTable() {
    await this.source.query('DEFINE TABLE IF NOT EXISTS sync_cloud_cursor SCHEMALESS PERMISSIONS NONE;');
  }

  async ensureMasterBranchFields() {
    for (const tableName of this.config.includeTables) {
      try {
        await this.master.query(
          `DEFINE FIELD IF NOT EXISTS branch_id ON ${tableName} TYPE option<string> PERMISSIONS FULL;`
        );
      } catch (error) {
        // Master may be schemaless or the table may not exist yet — upsert will create rows.
        this.logger.warn('Could not define branch_id on master table', {
          table: tableName,
          error: error.message || String(error),
        });
      }
    }
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

  async loadTableStates() {
    this.tableState.clear();
    for (const tableName of this.config.includeTables) {
      const state = this.ensureTableState(tableName);
      try {
        const row = await this.source.select(cursorRecordId(tableName));
        if (row && typeof row === 'object') {
          state.versionstamp = row.versionstamp != null ? row.versionstamp : null;
          state.backfillDone = Boolean(row.backfill_done);
        }
      } catch (error) {
        this.logger.warn('Failed to load sync cursor', {
          table: tableName,
          error: error.message || String(error),
        });
      }
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
      () => this.source.upsert(cursorRecordId(tableName)).content(payload),
      { label: `cursor.upsert(${tableName})`, timeoutMs: 15000, retries: 3 }
    );
  }

  schedulePoll(delayMs) {
    if (this.isStopping) return;
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      this.pollAllTables().catch((error) => {
        // pollAllTables already handles failures; this is a last-resort guard.
        this.stats.lastError = error.message || String(error);
        this.logger.error('Poll cycle crashed', { error: this.stats.lastError });
        this.stats.healthy = false;
        this.scheduleReconnect();
      });
    }, Math.max(0, delayMs));
  }

  async pollAllTables() {
    if (this.isStopping || this.isReconnecting || this.pollInFlight) return;
    this.pollInFlight = true;
    this.pollStartedAt = new Date().toISOString();
    let reconnectScheduled = false;
    try {
      // Unbounded master.query can hang forever when the remote DB is stopped
      // but the websocket is half-open — always bound health checks.
      await withTimeout(this.source.query('RETURN 1;'), 10000, 'source.health');
      this.stats.connectedSource = true;
      try {
        await withTimeout(this.master.query('RETURN 1;'), 10000, 'master.health');
        this.stats.connectedMaster = true;
      } catch (masterError) {
        this.stats.connectedMaster = false;
        this.stats.healthy = false;
        this.stats.lastError = masterError.message || String(masterError);
        this.stats.eventsFailed += 1;
        this.logger.warn('Master unreachable; will reconnect and retry pending changes', {
          error: this.stats.lastError,
        });
        this.scheduleReconnect();
        reconnectScheduled = true;
        return;
      }

      this.stats.healthy = true;

      for (const tableName of this.config.includeTables) {
        if (this.isStopping || this.isReconnecting) break;
        await this.pollTable(tableName);
      }
    } catch (error) {
      this.stats.healthy = false;
      this.stats.lastError = error.message || String(error);
      this.stats.eventsFailed += 1;
      this.logger.error('Poll cycle failed', { error: this.stats.lastError });
      this.scheduleReconnect();
      reconnectScheduled = true;
    } finally {
      this.pollInFlight = false;
      this.pollStartedAt = null;
      if (!this.isStopping && !reconnectScheduled && !this.isReconnecting) {
        this.schedulePoll(this.config.pollMs);
      }
    }
  }

  async pollTable(tableName) {
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
        this.logger.warn('Changefeed cursor outside retention; re-backfilling', {
          table: tableName,
          error: state.lastError,
        });
        state.backfillDone = false;
        state.versionstamp = null;
        await this.saveCursor(tableName, { backfillDone: false, versionstamp: null }).catch(() => {});
        return;
      }

      if (isRetryableError(error)) {
        state.backoffMs = Math.min(state.backoffMs * 2, 5 * 60 * 1000);
        state.blockedUntil = Date.now() + state.backoffMs;
        this.logger.warn('Table sync blocked for retry', {
          table: tableName,
          backoffMs: state.backoffMs,
          error: state.lastError,
        });
        return;
      }

      // Non-retryable: still backoff so one poison row does not spin the CPU.
      state.backoffMs = Math.min(Math.max(state.backoffMs, 5000) * 2, 5 * 60 * 1000);
      state.blockedUntil = Date.now() + state.backoffMs;
      this.logger.error('Table sync failed (non-retryable)', {
        table: tableName,
        error: state.lastError,
      });
    }
  }

  /**
   * Snapshot the feed watermark, page all current rows, then resume the feed
   * from the pre-backfill stamp so overlap is idempotent.
   */
  async backfillTable(tableName) {
    const state = this.ensureTableState(tableName);
    this.logger.info('Starting backfill', { table: tableName });

    const watermark = await this.readFeedWatermark(tableName);
    const pageSize = this.config.backfillPageSize;
    let start = 0;

    for (;;) {
      if (this.isStopping) return;
      const page = await this.selectPage(tableName, pageSize, start);
      if (!page.length) break;

      for (const row of page) {
        const targetId = toAnyRecordId(row && row.id);
        if (!targetId) continue;
        const recordId = recordIdToString(targetId);
        this.noteSyncing({
          table: tableName,
          recordId,
          action: 'UPSERT',
          phase: 'backfill',
        });
        try {
          await this.enqueueWrite(() => this.syncWithArrayLinks(targetId, row));
          this.stats.eventsProcessed += 1;
          this.noteLastSynced({
            table: tableName,
            recordId,
            action: 'UPSERT',
            phase: 'backfill',
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
    this.logger.info('Backfill complete', {
      table: tableName,
      rows: start,
      versionstamp: state.versionstamp,
    });
  }

  async readFeedWatermark(tableName) {
    try {
      // SINCE 0 returns from the start of the feed; take the last stamp as watermark.
      const result = await this.source.query(
        `SHOW CHANGES FOR TABLE ${tableName} SINCE 0 LIMIT 1000;`
      );
      const entries = normalizeShowChangesResult(result);
      if (!entries.length) return 0;
      return entries[entries.length - 1].versionstamp ?? 0;
    } catch (error) {
      this.logger.warn('Could not read feed watermark; starting from 0 after backfill', {
        table: tableName,
        error: error.message || String(error),
      });
      return 0;
    }
  }

  async selectPage(tableName, limit, start) {
    // Table name is allowlisted in config — interpolate safely.
    const result = await withRetry(
      () => this.source.query(
        `SELECT * FROM ${tableName} LIMIT $limit START $start;`,
        { limit, start }
      ),
      { label: `source.selectPage(${tableName})`, timeoutMs: 30000, retries: 3 }
    );
    return normalizeSelectPage(result);
  }

  async tailTable(tableName) {
    const state = this.ensureTableState(tableName);
    const since = state.versionstamp != null ? state.versionstamp : 0;
    const limit = this.config.changeLimit;
    // SHOW CHANGES does not accept bound parameters for SINCE / LIMIT.
    const sql = `SHOW CHANGES FOR TABLE ${tableName} SINCE ${sinceLiteral(since)} LIMIT ${Number(limit) || 100};`;

    let result;
    try {
      result = await withRetry(
        () => this.source.query(sql),
        { label: `SHOW CHANGES(${tableName})`, timeoutMs: 20000, retries: 3 }
      );
    } catch (error) {
      if (isChangefeedRetentionError(error)) throw error;
      throw error;
    }

    const entries = entriesAfterCursor(
      normalizeShowChangesResult(result),
      since
    );
    if (!entries.length) return;

    const { operations, lastVersionstamp } = compactChangeBatch(entries);
    if (!operations.length) {
      // Feed advanced with only define_table / noise — still move the cursor.
      if (lastVersionstamp != null) {
        await this.saveCursor(tableName, { versionstamp: lastVersionstamp });
      }
      return;
    }

    // Apply in order; block the table cursor on the first failure.
    let appliedStamp = state.versionstamp;
    for (const op of operations) {
      const recordId = recordIdKey(op.recordId);
      this.noteSyncing({
        table: tableName,
        recordId,
        action: op.action,
        phase: 'changefeed',
      });
      try {
        await this.applyOperation(tableName, op);
        appliedStamp = nextCursorVersionstamp(appliedStamp, op.versionstamp);
        await this.saveCursor(tableName, { versionstamp: appliedStamp });
        this.stats.eventsProcessed += 1;
        this.noteLastSynced({
          table: tableName,
          recordId,
          action: op.action,
          phase: 'changefeed',
          versionstamp: op.versionstamp,
        });
        this.logger.debug(`Synced change for ${tableName}`, {
          id: recordId,
          action: op.action,
          versionstamp: versionstampForStorage(op.versionstamp),
        });
      } finally {
        this.noteSyncing(null);
      }
    }

    // If the batch ended with noise after the last mutation, catch up to lastVersionstamp.
    if (lastVersionstamp != null) {
      const advanced = nextCursorVersionstamp(state.versionstamp, lastVersionstamp);
      if (advanced !== state.versionstamp) {
        await this.saveCursor(tableName, { versionstamp: advanced });
      }
    }
  }

  async applyOperation(tableName, op) {
    const targetId = toAnyRecordId(op.recordId);
    if (!targetId) {
      this.logger.warn('Skipping change with missing record id', { table: tableName });
      return;
    }

    await this.enqueueWrite(async () => {
      if (op.action === 'DELETE') {
        await withRetry(
          () => this.master.delete(targetId),
          { label: `master.delete(${recordIdToString(targetId)})`, retries: 5, timeoutMs: 15000 }
        );
        return;
      }

      // Prefer a fresh source read so we never push a stale changefeed snapshot.
      let row = op.value || {};
      try {
        const fresh = await withTimeout(
          this.source.select(targetId),
          15000,
          `source.select(${recordIdToString(targetId)})`
        );
        if (fresh) {
          row = fresh;
        } else {
          // Row gone between feed entry and read — treat as delete.
          await withRetry(
            () => this.master.delete(targetId),
            { label: `master.delete(${recordIdToString(targetId)})`, retries: 3, timeoutMs: 15000 }
          );
          return;
        }
      } catch (error) {
        this.logger.warn('Fresh source read failed; using feed payload', {
          id: recordIdToString(targetId),
          error: error.message || String(error),
        });
      }

      await this.syncWithArrayLinks(targetId, row);
    });
  }

  isIncludeTable(tableName) {
    return Boolean(tableName) && this.config.includeTables.includes(tableName);
  }

  async upsertRecord(targetId, value) {
    const tableName = tableNameFromRecordId(targetId);
    // Only stamp branch_id on allowlisted FOH tables — linked catalog rows
    // (e.g. user) are never uploaded, and schemafull master rejects unknown fields.
    const branchId = this.isIncludeTable(tableName) ? this.config.clientId : null;
    const payload = buildContentPayload(value, branchId);
    const expectedId = recordIdToString(targetId);

    const written = await withRetry(
      () => this.master.upsert(targetId).content(payload),
      { label: `master.upsert(${expectedId})`, timeoutMs: 20000 }
    );
    const writtenRecord = Array.isArray(written) ? written[0] : written;
    const writtenId = recordIdToString(
      writtenRecord && typeof writtenRecord === 'object' ? writtenRecord.id : null
    );

    if (writtenId && writtenId !== expectedId) {
      throw new Error(`Master returned different id: expected ${expectedId}, got ${writtenId}`);
    }

    return writtenRecord;
  }

  async syncWithArrayLinks(targetId, value, options = {}) {
    const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 1;
    const depth = Number.isFinite(options.depth) ? options.depth : 0;
    const visited = options.visited || new Set();
    const idStr = recordIdToString(targetId);
    const tableName = tableNameFromRecordId(targetId);

    if (!idStr || visited.has(idStr)) return;
    // Never materialize non-FOH tables (user, menu_item, …) onto master.
    if (!this.isIncludeTable(tableName)) return;
    visited.add(idStr);

    if (depth < maxDepth) {
      const links = collectArrayLinkedRecordIds(value);
      for (const link of links) {
        const childId = toAnyRecordId(link);
        if (!childId) continue;
        const childKey = recordIdToString(childId);
        if (!childKey || visited.has(childKey)) continue;
        if (!this.isIncludeTable(tableNameFromRecordId(childId))) continue;

        try {
          const child = await withTimeout(
            this.source.select(childId),
            15000,
            `source.select(${childKey})`
          );
          if (!child) continue;
          await this.syncWithArrayLinks(childId, child, {
            depth: depth + 1,
            maxDepth,
            visited,
          });
        } catch (error) {
          this.logger.warn('Failed to sync array-linked record', {
            id: childKey,
            parent: idStr,
            error: error.message || String(error),
          });
        }
      }
    }

    await this.upsertRecord(targetId, value);
  }

  scheduleReconnect() {
    if (this.isStopping) return;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.pollTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.isReconnecting) {
        // Still in a previous attempt — try again after another delay.
        this.scheduleReconnect();
        return;
      }
      this.reconnect().catch((error) => {
        this.stats.lastError = error.message || String(error);
        this.logger.error('Reconnect attempt failed', { error: this.stats.lastError });
        this.scheduleReconnect();
      });
    }, this.config.reconnectMs);
  }

  async reconnect() {
    if (this.isStopping || this.isReconnecting) return;
    this.isReconnecting = true;
    try {
      clearTimeout(this.pollTimer);
      this.stats.connectedSource = false;
      this.stats.connectedMaster = false;
      await closeClient(this.source);
      await closeClient(this.master);
      this.source = null;
      this.master = null;
      await this.connectAndStart();
      this.logger.info('Reconnect succeeded');
    } catch (error) {
      this.stats.lastError = error.message || String(error);
      this.logger.error('Reconnect attempt failed', { error: this.stats.lastError });
    } finally {
      this.isReconnecting = false;
      if (!this.isStopping && !this.stats.healthy) {
        this.scheduleReconnect();
      }
    }
  }
}

module.exports = {
  SyncManager,
  toAnyRecordId,
  collectArrayLinkedRecordIds,
  normalizePayloadLinks,
  buildContentPayload,
};
