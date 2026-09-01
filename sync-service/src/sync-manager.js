'use strict';

const { createConnectedClient, closeClient } = require('./surreal-client');
const { Table, RecordId, StringRecordId } = require('surrealdb');

function isRecordIdString(value) {
  // Accept only table:id shapes — never plain strings like "Normal" from tag/status arrays.
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
      // Plain link objects are typically only { tb, id }. RecordId instances use private fields.
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

    // RecordId/StringRecordId-like values from other realms
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

function isRetryableError(error) {
  const message = error && error.message ? String(error.message) : String(error || '');
  // Do not retry hard timeouts — they usually mean the socket is wedged.
  if (/timed out after/i.test(message)) return false;
  return /transaction|conflict|retry|temporar|network|websocket/i.test(message);
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

/**
 * Collect record links from array fields only.
 * Surreal LIVE can drop sibling CREATE events under burst writes; parents must
 * pull array-linked child rows (e.g. order.items -> order_item) explicitly.
 */
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

/** Ensure array/single record-link fields stay proper RecordId values in CONTENT. */
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

function buildContentPayload(value, clientId) {
  const payload = normalizePayloadLinks({ ...(value || {}) });
  delete payload.id;
  // payload.client_id = clientId; // disabled for now, will enable it later
  return payload;
}

class SyncManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    // Separate source clients: live + query share one websocket and can deadlock
    // when handleLiveEvent calls source.select() while consuming LIVE messages.
    this.sourceLive = null;
    this.sourceQuery = null;
    this.master = null;
    this.reconnectTimer = null;
    this.healthTimer = null;
    this.isStopping = false;
    this.isReconnecting = false;
    this.tableSubscriptions = new Map();
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
    };
  }

  getStats() {
    return {
      ...this.stats,
      subscribedTables: [...this.stats.subscribedTables],
    };
  }

  enqueueWrite(task) {
    const run = this.writeChain.then(task, task);
    // Keep the chain alive even if a task fails.
    this.writeChain = run.catch(() => {});
    return run;
  }

  async start() {
    this.stats.startedAt = new Date().toISOString();
    await this.connectAndSubscribe();
    this.startHealthMonitor();
  }

  async stop() {
    this.isStopping = true;
    this.stats.healthy = false;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.healthTimer);

    await this.unsubscribeAll();
    await closeClient(this.sourceLive);
    await closeClient(this.sourceQuery);
    await closeClient(this.master);
    this.sourceLive = null;
    this.sourceQuery = null;
    this.master = null;
    this.stats.connectedSource = false;
    this.stats.connectedMaster = false;
  }

  async connectAndSubscribe() {
    try {
      await this.connectClients();
      const tables = await this.discoverTables();
      await this.subscribeToTables(tables);
      this.stats.healthy = true;
      this.stats.lastError = null;
      this.logger.info('Sync manager ready', { tables: this.stats.subscribedTables.length });
    } catch (error) {
      this.stats.healthy = false;
      this.stats.lastError = error.message || String(error);
      this.logger.error('Sync startup failed, scheduling reconnect', { error: this.stats.lastError });
      this.scheduleReconnect();
    }
  }

  async connectClients() {
    await closeClient(this.sourceLive);
    await closeClient(this.sourceQuery);
    await closeClient(this.master);

    this.sourceLive = await createConnectedClient('SourceLive', this.config.source, this.logger);
    this.sourceQuery = await createConnectedClient('SourceQuery', this.config.source, this.logger);
    this.master = await createConnectedClient('Master', this.config.master, this.logger);
    this.stats.connectedSource = true;
    this.stats.connectedMaster = true;
  }

  async discoverTables() {
    const infoResult = await this.sourceQuery.query('INFO FOR DB;');
    const first = Array.isArray(infoResult) ? infoResult[0] : infoResult;
    const result = first && typeof first === 'object' && 'result' in first ? first.result : first;
    const tablesObject = result && typeof result === 'object'
      ? (result.tables || result.tb || {})
      : {};
    const tableNames = Object.keys(tablesObject || {});
    this.logger.info('Discovered tables', { tables: tableNames });
    const filtered = tableNames.filter((name) => !this.config.excludeTables.includes(name));

    if (!filtered.length) {
      this.logger.warn('No tables discovered after applying exclusions');
    }

    return filtered;
  }

  async waitForLiveId(subscription, timeoutMs = 10000) {
    const started = Date.now();
    while (!subscription.id) {
      if (Date.now() - started > timeoutMs) {
        throw new Error('Timed out waiting for LIVE SELECT id');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return subscription.id;
  }

  async subscribeToTables(tables) {
    await this.unsubscribeAll();
    const subscribed = [];

    for (const tableName of tables) {
      const subscription = await this.sourceLive.live(new Table(tableName));
      // Wait until LIVE SELECT is registered before attaching a consumer channel.
      // Attaching too early with many concurrent lives drops all events for that sub.
      await this.waitForLiveId(subscription);

      let tableChain = Promise.resolve();
      subscription.subscribe((message) => {
        tableChain = tableChain
          .then(async () => {
            if (this.isStopping) return;
            await this.handleLiveEvent(tableName, message);
          })
          .catch((error) => {
            if (this.isStopping) return;
            this.stats.eventsFailed += 1;
            this.stats.lastError = error.message || String(error);
            this.logger.error(`Failed to process live event for table ${tableName}`, {
              error: this.stats.lastError,
              recordId: message && message.recordId ? String(message.recordId) : undefined,
            });
          });
      });

      this.tableSubscriptions.set(tableName, subscription);
      subscribed.push(tableName);
    }

    this.stats.subscribedTables = subscribed;
  }

  async upsertRecord(targetId, value) {
    const payload = buildContentPayload(value, this.config.clientId);
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

  /**
   * Materialize rows referenced by array<record<...>> fields, then upsert the parent.
   * Recurses through nested array links (order.items -> order_item.taxes) with a visit set.
   */
  async syncWithArrayLinks(targetId, value, options = {}) {
    const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 1;
    const depth = Number.isFinite(options.depth) ? options.depth : 0;
    const visited = options.visited || new Set();
    const idStr = recordIdToString(targetId);

    if (!idStr || visited.has(idStr)) return;
    visited.add(idStr);

    if (depth < maxDepth) {
      const links = collectArrayLinkedRecordIds(value);
      for (const link of links) {
        const childId = toAnyRecordId(link);
        if (!childId) continue;
        const childKey = recordIdToString(childId);
        if (!childKey || visited.has(childKey)) continue;

        try {
          const child = await withTimeout(
            this.sourceQuery.select(childId),
            15000,
            `sourceQuery.select(${childKey})`
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

  async handleLiveEvent(tableName, message) {
    if (!message || typeof message !== 'object') return;

    const action = String(message.action || '').toUpperCase();
    if (action !== 'CREATE' && action !== 'UPDATE' && action !== 'DELETE') {
      return;
    }

    const targetId = toAnyRecordId(message.recordId)
      || toAnyRecordId(message.value && message.value.id);
    if (!targetId) {
      this.logger.warn(`Skipping ${action} for table ${tableName}: missing record id`);
      return;
    }

    const expectedId = recordIdToString(targetId);

    await this.enqueueWrite(async () => {
      if (action === 'DELETE') {
        await withRetry(
          () => this.master.delete(targetId),
          { label: `master.delete(${expectedId})`, retries: 3, timeoutMs: 15000 }
        );
        return;
      }

      // Prefer a fresh source read over the live payload so array links and
      // typed values are complete/consistent before materializing children.
      let row = message.value || {};
      try {
        const fresh = await withTimeout(
          this.sourceQuery.select(targetId),
          15000,
          `sourceQuery.select(${expectedId})`
        );
        if (fresh) row = fresh;
      } catch (error) {
        this.logger.warn('Fresh source read failed; using live payload', {
          id: expectedId,
          error: error.message || String(error),
        });
      }

      await this.syncWithArrayLinks(targetId, row);
    });

    this.stats.eventsProcessed += 1;
    this.stats.lastEventAt = new Date().toISOString();
    this.logger.debug(`Synced ${action} for table ${tableName}`, { id: expectedId });
  }

  startHealthMonitor() {
    const interval = Math.max(this.config.reconnectMs, 5000);
    this.healthTimer = setInterval(() => {
      if (this.isStopping || this.isReconnecting) return;
      // Serialize health checks with writes so we never concurrent-query the
      // same Surreal websocket used by upsert/select (avoids hard deadlocks).
      this.enqueueWrite(async () => {
        await this.sourceQuery.query('RETURN 1;');
        await this.master.query('RETURN 1;');
        this.stats.healthy = true;
      }).catch((error) => {
        this.stats.healthy = false;
        this.stats.lastError = error.message || String(error);
        this.logger.warn('Health check failed, reconnecting', { error: this.stats.lastError });
        this.reconnect().catch(() => {});
      });
    }, interval);
  }

  scheduleReconnect() {
    if (this.isStopping || this.isReconnecting) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
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
      await this.unsubscribeAll();
      await this.connectAndSubscribe();
    } finally {
      this.isReconnecting = false;
    }
  }

  async unsubscribeAll() {
    if (!this.sourceLive) {
      this.tableSubscriptions.clear();
      this.stats.subscribedTables = [];
      return;
    }

    const pending = [];
    for (const subscription of this.tableSubscriptions.values()) {
      if (!subscription) continue;
      pending.push(subscription.kill());
    }

    await Promise.allSettled(pending);
    this.tableSubscriptions.clear();
    this.stats.subscribedTables = [];
  }
}

module.exports = {
  SyncManager,
  toAnyRecordId,
  collectArrayLinkedRecordIds,
  normalizePayloadLinks,
  // Exported for testing — used internally by SyncManager
  isRetryableError,
  withRetry,
  buildContentPayload,
};
