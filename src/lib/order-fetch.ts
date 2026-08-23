import {
  Order,
  ORDER_CARD_FETCHES,
  ORDER_FETCHES,
  parseOrderQueryResult,
} from "@/api/model/order.ts";
import {toRecordId} from "@/lib/utils.ts";

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

/** Medium graph for order cards / table-row totals (no depth-3 modifier dishes). */
export async function fetchOrderCard(
  db: DbQuery,
  orderId: unknown,
): Promise<Order | undefined> {
  return fetchOrderById(db, orderId, ORDER_CARD_FETCHES, {limitConcurrency: true});
}

/** Full graph for pay / split / print / cancel / refund. */
export async function fetchOrderFull(
  db: DbQuery,
  orderId: unknown,
): Promise<Order | undefined> {
  return fetchOrderById(db, orderId, ORDER_FETCHES, {limitConcurrency: false});
}

export const orderSnapshotKey = (order: Pick<Order, "id" | "status" | "created_at" | "invoice_number">): string => {
  return [
    String(order.id),
    order.status ?? "",
    String(order.created_at ?? ""),
    String(order.invoice_number ?? ""),
  ].join(":");
};
