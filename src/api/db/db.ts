import {
  AnyRecordId, ExprLike,
  LiveAction,
  LiveResource,
  LiveSubscription,
  Patch,
  RecordIdRange,
  RecordResult,
  StringRecordId,
  Table,
  Values
} from "surrealdb";
import {toast} from "sonner";
import {useDatabase} from "@/hooks/useDatabase.ts";
import {getSessionToken, isGatewayAuthEnabled} from "@/lib/session.ts";
import {enqueueWrite} from "@/lib/offline-write-queue.ts";

type QueryBindings = Record<string, unknown>;
type DbThing = AnyRecordId | RecordIdRange | Table | string;
type LiveCallback<T> = (action: LiveAction, value: T) => void;

const CONNECT_WAIT_MS = 15_000;
const CONNECT_POLL_MS = 50;

/** Thrown when a DB op is skipped (no session / not connected). Callers may catch; never toasted. */
export class DbNotReadyError extends Error {
  readonly code: 'no_session' | 'not_connected';

  constructor(code: 'no_session' | 'not_connected', message: string) {
    super(message);
    this.name = 'DbNotReadyError';
    this.code = code;
  }
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const isQuietError = (error: unknown) =>
  error instanceof DbNotReadyError;

const toTable = (value: string | Table) => (value instanceof Table ? value : new Table(value));

const toThing = (value: DbThing): AnyRecordId | RecordIdRange | Table => {
  if (typeof value === "string") {
    if (value.includes(":")) {
      return new StringRecordId(value);
    }

    return new Table(value);
  }

  return value;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForClientConnected(
  isLive: () => boolean,
  timeoutMs = CONNECT_WAIT_MS
): Promise<boolean> {
  if (isLive()) {
    return true;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isLive()) {
      return true;
    }
    await sleep(CONNECT_POLL_MS);
  }
  return isLive();
}

export const useDB = () => {
  const databaseContext = useDatabase();
  const {client, isConnected, isConnecting} = databaseContext;

  // Gateway pre-login: allow the hook so Login can render; queries still need a live connection.
  const allowDisconnected =
    isGatewayAuthEnabled() && !getSessionToken();

  // Prefer the live socket flag — React state can briefly lag after StrictMode/drop.
  const liveConnected = client.isConnected || isConnected;
  const isOfflineCapable = !liveConnected && !isConnecting && !allowDisconnected;

  if (!liveConnected && !isConnecting && !allowDisconnected && !isOfflineCapable) {
    throw new Error('Database is not connected. Please ensure DatabaseProvider is wrapping your app and connection is established.');
  }

  const ensureReady = async () => {
    if (isGatewayAuthEnabled() && !getSessionToken()) {
      throw new DbNotReadyError('no_session', 'No POS session — login required');
    }

    if (client.isConnected) {
      return;
    }

    const ready = await waitForClientConnected(() => client.isConnected);

    if (!ready || !client.isConnected) {
      throw new DbNotReadyError('not_connected', 'Database is not connected');
    }
  };

  const runGuarded = async <T>(op: () => Promise<T>, label: string): Promise<T> => {
    try {
      await ensureReady();
      return await op();
    } catch (e) {
      if (isQuietError(e)) {
        throw e;
      }
      console.error(`ERROR while ${label}`, e);
      toast.error(getErrorMessage(e));
      throw e;
    }
  };

  const runGuardedOffline = async <T>(
    op: () => Promise<T>,
    label: string,
    offlineOp?: { operation: 'create' | 'update' | 'merge' | 'delete'; table?: string; recordId?: string; data?: any }
  ): Promise<T> => {
    if (isOfflineCapable && offlineOp) {
      const queueId = await enqueueWrite(offlineOp.operation, {
        table: offlineOp.table,
        recordId: offlineOp.recordId,
        data: offlineOp.data,
      });
      return { id: queueId, _offline: true, _queuedAt: Date.now() } as unknown as T;
    }
    return runGuarded(op, label);
  };

  const query = async <R extends unknown[] = any[]>(sql: string, parameters?: QueryBindings): Promise<R> => {
    return runGuarded(async () => {
      const t0 = performance.now();
      const result = await client.query<R>(sql, parameters).collect<R>();
      const t1 = performance.now();

      console.group('DB Debug')
      if (import.meta.env.DEV) {
        console.info(sql.trim());
        console.info(parameters);
        console.info(result);
      }
      console.info(`Query fetch time: ${t1 - t0}ms`);
      console.groupEnd()
      return result as R;
    }, 'query');
  }

  const select = async <T = any>(
    thing: DbThing
  ): Promise<RecordResult<T> | RecordResult<T>[] | undefined> => {
    return runGuarded(async () => {
      if (import.meta.env.DEV) {
        console.group('DB Select')
        console.info(thing);
        console.groupEnd()
      }

      const normalizedThing = toThing(thing);
      if (normalizedThing instanceof Table) {
        return client.select<T>(normalizedThing);
      }
      if (normalizedThing instanceof RecordIdRange) {
        return client.select<T>(normalizedThing);
      }
      return client.select<T>(normalizedThing as AnyRecordId);
    }, 'select');
  }

  const del = async <T = any>(
    thing: DbThing
  ): Promise<RecordResult<T> | RecordResult<T>[]> => {
    return runGuardedOffline(async () => {
      if (import.meta.env.DEV) {
        console.group('DB Delete')
        console.info(thing);
        console.groupEnd()
      }

      const normalizedThing = toThing(thing);
      if (normalizedThing instanceof Table) {
        return client.delete<T>(normalizedThing);
      }
      if (normalizedThing instanceof RecordIdRange) {
        return client.delete<T>(normalizedThing);
      }
      return client.delete<T>(normalizedThing as AnyRecordId);
    }, 'delete', { operation: 'delete', recordId: String(thing) });
  }

  async function insert<T = any>(thing: Table | string, data: Values<T> | Values<T>[]) {
    return runGuardedOffline(async () => {
      if (import.meta.env.DEV) {
        console.group('DB Insert')
        console.info(thing);
        console.info(data);
        console.groupEnd()
      }

      return client.insert<T>(toTable(thing), data);
    }, 'insert', { operation: 'create', table: String(thing), data });
  }


  const update = async <T extends Record<string, unknown> = Record<string, unknown>>(
    thing: DbThing,
    data: Values<T>
  ) => {
    return runGuardedOffline(async () => {
      if (import.meta.env.DEV) {
        console.group('DB Update')
        console.info(thing);
        console.info(data);
        console.groupEnd()
      }

      const normalizedThing = toThing(thing);
      if (normalizedThing instanceof Table) {
        return client.update<T>(normalizedThing).merge(data);
      }
      if (normalizedThing instanceof RecordIdRange) {
        return client.update<T>(normalizedThing).merge(data);
      }
      return client.update<T>(normalizedThing as AnyRecordId).merge(data);
    }, 'updating', { operation: 'update', recordId: String(thing), data });
  }

  const patch = async <T extends Record<string, unknown> = Record<string, unknown>>(
    thing: DbThing,
    data: Patch[]
  ) => {
    return runGuarded(async () => {
      if (import.meta.env.DEV) {
        console.group('DB Patch')
        console.info(thing);
        console.info(data);
        console.groupEnd()
      }

      const normalizedThing = toThing(thing);
      if (normalizedThing instanceof Table) {
        return client.update<T>(normalizedThing).patch(data);
      }
      if (normalizedThing instanceof RecordIdRange) {
        return client.update<T>(normalizedThing).patch(data);
      }
      return client.update<T>(normalizedThing as AnyRecordId).patch(data);
    }, 'patching');
  }

  const merge = async <T extends Record<string, unknown> = Record<string, unknown>>(
    thing: DbThing,
    data: Values<T>
  ) => {
    return runGuardedOffline(async () => {
      if (import.meta.env.DEV) {
        console.group('DB Merge')
        console.info(thing);
        console.info(data);
        console.groupEnd()
      }

      const normalizedThing = toThing(thing);
      if (normalizedThing instanceof Table) {
        return client.update<T>(normalizedThing).merge(data);
      }
      if (normalizedThing instanceof RecordIdRange) {
        return client.update<T>(normalizedThing).merge(data);
      }
      return client.update<T>(normalizedThing as AnyRecordId).merge(data);
    }, 'merging', { operation: 'merge', recordId: String(thing), data });
  }

  const upsert = async <T extends Record<string, unknown> = Record<string, unknown>>(
    thing: DbThing,
    data: Values<T>
  ) => {
    return runGuarded(async () => {
      if (import.meta.env.DEV) {
        console.group('DB Upsert')
        console.info(thing);
        console.info(data);
        console.groupEnd()
      }

      const normalizedThing = toThing(thing);
      if (normalizedThing instanceof Table) {
        return client.upsert<T>(normalizedThing).content(data);
      }
      if (normalizedThing instanceof RecordIdRange) {
        return client.upsert<T>(normalizedThing).content(data);
      }
      return client.upsert<T>(normalizedThing as AnyRecordId).content(data);
    }, 'upserting');
  }

  const live = async <T = Record<string, unknown>>(
    thing: LiveResource | string,
    callback?: LiveCallback<T>,
    conditions?: ExprLike
  ): Promise<LiveSubscription> => {
    return runGuarded(async () => {
      const subscription = await client.live<T>(toTable(thing)).where(conditions);

      if (callback) {
        subscription.subscribe((message) => {
          callback(message.action, message.value as T);
        });
      }

      return subscription;
    }, 'live query');
  }

  return {
    query,
    db: client, // Expose the client for direct access if needed
    select,
    delete: del,
    insert, create: insert,
    update,
    patch,
    merge,
    upsert,
    live
  }
}
