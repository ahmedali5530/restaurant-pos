import {
  AnyRecordId, ExprCtx, ExprLike,
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
import {string} from "yup";

type QueryBindings = Record<string, unknown>;
type DbThing = AnyRecordId | RecordIdRange | Table | string;
type LiveCallback<T> = (action: LiveAction, value: T) => void;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

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

export const useDB = () => {
  const databaseContext = useDatabase();
  const {client, isConnected, isConnecting} = databaseContext;

  // Gateway pre-login: allow the hook so Login can render; queries still need a live connection.
  const allowDisconnected =
    isGatewayAuthEnabled() && !getSessionToken();

  // Prefer the live socket flag — React state can briefly lag after StrictMode/drop.
  const liveConnected = client.isConnected || isConnected;

  if (!liveConnected && !isConnecting && !allowDisconnected) {
    throw new Error('Database is not connected. Please ensure DatabaseProvider is wrapping your app and connection is established.');
  }

  const query = async <R extends unknown[] = any[]>(sql: string, parameters?: QueryBindings): Promise<R> => {
    try {
      // start performance timer
      const t0 = performance.now();

      const result = await client.query<R>(sql, parameters).collect<R>();

      // end performance timer
      const t1 = performance.now();

      // log sql in dev mode
      console.group('DB Debug')
      if (import.meta.env.DEV) {
        console.info(sql.trim());
        console.info(parameters);
      }
      console.info(result);
      console.info(`Query fetch time: ${t1 - t0}ms`);
      console.groupEnd()
      return result as R;
    } catch (e) {
      console.error('ERROR while query', e, sql);
      toast.error(getErrorMessage(e));
      throw e;
    }
  }

  const select = async <T = any>(
    thing: DbThing
  ): Promise<RecordResult<T> | RecordResult<T>[] | undefined> => {
    try {
      // log sql in dev mode
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
    } catch (e) {
      console.log('ERROR while select', e);
      toast.error(getErrorMessage(e));
      throw e;
    }
  }

  const del = async <T = any>(
    thing: DbThing
  ): Promise<RecordResult<T> | RecordResult<T>[]> => {
    try {
      // log sql in dev mode
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
    } catch (e) {
      console.error('ERROR while delete', e);
      toast.error(getErrorMessage(e));
      throw e;
    }
  }

  async function insert<T = any>(thing: Table | string, data: Values<T> | Values<T>[]) {
    try {
      // log sql in dev mode
      if (import.meta.env.DEV) {
        console.group('DB Insert')
        console.info(thing);
        console.info(data);
        console.groupEnd()
      }

      return client.insert<T>(toTable(thing), data);
    } catch (e) {
      console.error('ERROR while insert', e);
      toast.error(getErrorMessage(e));
      throw e;
    }
  }


  const update = async <T extends Record<string, unknown> = Record<string, unknown>>(
    thing: DbThing,
    data: Values<T>
  ) => {
    try {
      // log sql in dev mode
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
    } catch (e) {
      console.error('ERROR while updating', e);
      toast.error(getErrorMessage(e));
      throw e;
    }
  }

  const patch = async <T extends Record<string, unknown> = Record<string, unknown>>(
    thing: DbThing,
    data: Patch[]
  ) => {
    try {
      // log sql in dev mode
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
    } catch (e) {
      console.error('ERROR while patching', e);
      toast.error(getErrorMessage(e));
      throw e;
    }
  }

  const merge = async <T extends Record<string, unknown> = Record<string, unknown>>(
    thing: DbThing,
    data: Values<T>
  ) => {
    try {
      // log sql in dev mode
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
    } catch (e) {
      console.error('ERROR while merging', e);
      toast.error(getErrorMessage(e));
      throw e;
    }
  }

  const upsert = async <T extends Record<string, unknown> = Record<string, unknown>>(
    thing: DbThing,
    data: Values<T>
  ) => {
    try {
      // log sql in dev mode
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
    } catch (e) {
      console.error('ERROR while upserting', e);
      toast.error(getErrorMessage(e));
      throw e;
    }
  }

  const live = async <T = Record<string, unknown>>(
    thing: LiveResource | string,
    callback?: LiveCallback<T>,
    conditions?: ExprLike
  ): Promise<LiveSubscription> => {
    try {
      const subscription = await client.live<T>(toTable(thing)).where(conditions);

      if (callback) {
        subscription.subscribe((message) => {
          callback(message.action, message.value as T);
        });
      }

      return subscription;
    } catch (e) {
      console.log('ERROR while live query', e);
      toast.error(getErrorMessage(e));
      throw e;
    }
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
