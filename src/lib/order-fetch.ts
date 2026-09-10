import {
  Order,
  ORDER_CARD_FETCHES,
  ORDER_FETCHES,
  parseOrderQueryResult,
} from "@/api/model/order.ts";
import {toRecordId} from "@/lib/utils.ts";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";

type DbQuery = {
  query: (sql: string, vars?: Record<string, unknown>) => Promise<unknown>;
};

const CARD_HYDRATE_CONCURRENCY = 4;
let cardHydrateActive = 0;
const cardHydrateWaiters: Array<() => void> = [];

const acquireCardHydrateSlot = (): Promise<void> => {
  if (cardHydrateActive < CARD_HYDRATE_CONCURRENCY) {
    cardHydrateActive += 1;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    cardHydrateWaiters.push(() => {
      cardHydrateActive += 1;
      resolve();
    });
  });
};

const releaseCardHydrateSlot = () => {
  cardHydrateActive = Math.max(0, cardHydrateActive - 1);
  const next = cardHydrateWaiters.shift();
  if (next) {
    next();
  }
};

export async function fetchOrderById(
  db: DbQuery,
  orderId: unknown,
  fetches: string[],
  options?: {limitConcurrency?: boolean},
): Promise<Order | undefined> {
  const limitConcurrency = options?.limitConcurrency === true;
  if (limitConcurrency) {
    await acquireCardHydrateSlot();
  }

  try {
    const result = await db.query(
      `SELECT * FROM ONLY ${toRecordId(orderId)} FETCH ${fetches.join(", ")}`,
    );
    return parseOrderQueryResult(result);
  } finally {
    if (limitConcurrency) {
      releaseCardHydrateSlot();
    }
  }
}

/**
 * PosStore first: Dexie already holds items, payments, taxes, discounts, extras,
 * coupon and customer for every recent order, so the hydrated local copy is the
 * critical-path read. Surreal FETCH is only the fallback for orders the terminal
 * has never seen (older history) and is never awaited when the local copy exists.
 */
async function fetchOrderLocalFirst(
  db: DbQuery,
  orderId: unknown,
  fetches: string[],
  options?: {limitConcurrency?: boolean},
): Promise<Order | undefined> {
  const local = await posStore.getOrderHydrated(String(orderId)).catch(() => null);
  if (local) {
    return local as unknown as Order;
  }
  try {
    return await fetchOrderById(db, orderId, fetches, options);
  } catch (error) {
    console.warn('Remote order fetch failed (offline?)', error);
    return undefined;
  }
}

/** Medium graph for order cards / table-row totals (no depth-3 modifier dishes). */
export async function fetchOrderCard(
  db: DbQuery,
  orderId: unknown,
): Promise<Order | undefined> {
  return fetchOrderLocalFirst(db, orderId, ORDER_CARD_FETCHES, {limitConcurrency: true});
}

/** Full graph for pay / split / print / cancel / refund. */
export async function fetchOrderFull(
  db: DbQuery,
  orderId: unknown,
): Promise<Order | undefined> {
  return fetchOrderLocalFirst(db, orderId, ORDER_FETCHES, {limitConcurrency: false});
}

export const orderSnapshotKey = (
  order: Pick<Order, "id" | "status" | "created_at" | "invoice_number"> & {
    updated_at?: unknown;
    server_version?: unknown;
    items?: unknown;
  },
): string => {
  const items = order.items;
  const itemSig = Array.isArray(items)
    ? items
        .map((line: any) => {
          if (line == null || typeof line !== 'object') return String(line ?? '');
          return [
            String(line.id ?? ''),
            line.deleted_at ? '1' : '0',
            String(line.quantity ?? ''),
            String(line.price ?? ''),
          ].join('/');
        })
        .join(',')
    : String(items ?? '');
  return [
    String(order.id),
    order.status ?? "",
    String(order.created_at ?? ""),
    String(order.invoice_number ?? ""),
    String(order.updated_at ?? ""),
    String(order.server_version ?? ""),
    itemSig,
  ].join(":");
};
