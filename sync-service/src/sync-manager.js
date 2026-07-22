'use strict';

const { createConnectedClient, closeClient } = require('./surreal-client');
const { Table } = require('surrealdb');

function normalizeRecordId(record) {
  if (!record || typeof record !== 'object') return null;
  if (!record.id) return null;
  return record.id;
}

function normalizeLiveEventArgs(arg1, arg2) {
  // SurrealJS can emit callback(action, result) or callback({ action, result }).
  if (arg1 && typeof arg1 === 'object' && arg1.action) {
    return {
      action: String(arg1.action || '').toUpperCase(),
      result: arg1.result,
    };
  }

  return {
    action: String(arg1 || '').toUpperCase(),
    result: arg2,
  };
}

class SyncManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.source = null;
    this.master = null;
    this.reconnectTimer = null;
    this.healthTimer = null;
    this.isStopping = false;
    this.isReconnecting = false;
    this.tableSubscriptions = new Map();
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
    await closeClient(this.source);
    await closeClient(this.master);
    this.source = null;
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
    await closeClient(this.source);
    await closeClient(this.master);

    this.source = await createConnectedClient('Source', this.config.source, this.logger);
    this.master = await createConnectedClient('Master', this.config.master, this.logger);
    this.stats.connectedSource = true;
    this.stats.connectedMaster = true;
  }

  async discoverTables() {
    const infoResult = await this.source.query('INFO FOR DB;');
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

  async subscribeToTables(tables) {
    await this.unsubscribeAll();
    const subscribed = [];

    for (const tableName of tables) {
      const subscription = await this.source.live(new Table(tableName));

      (async () => {
        for await (const message of subscription) {
          await this.handleLiveEvent(tableName, message.action, message.value);
        }
      })().catch((error) => {
        if (this.isStopping) return;
        this.stats.eventsFailed += 1;
        this.stats.lastError = error.message || String(error);
        this.logger.error(`Failed to process live event for table ${tableName}`, {
          error: this.stats.lastError,
        });
      });

      if (subscription) {
        this.tableSubscriptions.set(tableName, subscription);
      }

      subscribed.push(tableName);
    }

    this.stats.subscribedTables = subscribed;
  }

  async handleLiveEvent(tableName, arg1, arg2) {
    const { action, result } = normalizeLiveEventArgs(arg1, arg2);
    if (!result || (action !== 'CREATE' && action !== 'UPDATE' && action !== 'DELETE')) {
      return;
    }

    const recordId = normalizeRecordId(result);
    if (!recordId) return;

    if (action === 'DELETE') {
      await this.master.delete(recordId);
    } else {
      const payload = {
        ...result,
        // client_id: this.config.clientId,
      };
      await this.master.upsert(recordId).content(payload);
    }

    this.stats.eventsProcessed += 1;
    this.stats.lastEventAt = new Date().toISOString();
    this.logger.debug(`Synced ${action} for table ${tableName}`, { id: String(recordId) });
  }

  startHealthMonitor() {
    const interval = Math.max(this.config.reconnectMs, 5000);
    this.healthTimer = setInterval(async () => {
      if (this.isStopping || this.isReconnecting) return;
      try {
        await this.source.query('RETURN 1;');
        await this.master.query('RETURN 1;');
        this.stats.healthy = true;
      } catch (error) {
        this.stats.healthy = false;
        this.stats.lastError = error.message || String(error);
        this.logger.warn('Health check failed, reconnecting', { error: this.stats.lastError });
        await this.reconnect();
      }
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
    if (!this.source) {
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
};
