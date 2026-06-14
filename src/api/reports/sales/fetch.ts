import {Tables} from "@/api/db/tables.ts";
import {ORDER_FETCHES} from "@/api/model/order.ts";
import type {Order} from "@/api/model/order.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import {buildCreatedAtDateConditions, buildOrConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";

export const SALES_SUMMARY_FETCHES = [
  "payments",
  "payments.payment_type",
  "discount",
  "order_type",
  "items",
  "items.item",
  "coupon",
  "coupon.coupon",
];

// SurrealQL FETCH cannot express truly unbounded recursion, so nested modifier
// `dish` links are resolved down to a generous bounded depth that effectively
// covers any real menu. Deeper nodes still render with their fallback name.
export const MODIFIER_FETCH_DEPTH = 8;

const buildModifierFetches = (depth: number): string[] => {
  const fetches: string[] = [];
  let path = "items.modifiers";

  for (let level = 0; level <= depth; level += 1) {
    path += ".selectedModifiers";
    fetches.push(path);
    fetches.push(`${path}.dish`);
    path += ".selectedGroups";
  }

  return fetches;
};

export const PRODUCT_MIX_FETCHES = [
  "user",
  "order_type",
  "items",
  "items.item",
  "items.item.categories",
  "items.modifiers",
  ...buildModifierFetches(MODIFIER_FETCH_DEPTH),
];

export interface FetchOrdersOptions extends DateRangeFilter {
  fetches?: string[];
  paidOnly?: boolean;
  orderTakerIds?: string[];
  orderTypeIds?: string[];
}

export const fetchOrders = async (
  db: DbClient,
  options: FetchOrdersOptions = {},
): Promise<Order[]> => {
  const {
    startDate,
    endDate,
    fetches = SALES_SUMMARY_FETCHES,
    paidOnly = false,
    orderTakerIds = [],
    orderTypeIds = [],
  } = options;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (paidOnly) {
    conditions.push("status = 'Paid'");
  }

  const dateFilter = buildCreatedAtDateConditions({startDate, endDate});
  conditions.push(...dateFilter.conditions);
  Object.assign(params, dateFilter.params);

  const userFilter = buildOrConditions("user", orderTakerIds, "user");
  if (userFilter.condition) {
    conditions.push(userFilter.condition);
    Object.assign(params, userFilter.params);
  }

  const orderTypeFilter = buildOrConditions("order_type", orderTypeIds, "orderType");
  if (orderTypeFilter.condition) {
    conditions.push(orderTypeFilter.condition);
    Object.assign(params, orderTypeFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.orders}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    FETCH ${fetches.join(", ")}
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<Order>(result);
};

export const fetchPaidOrders = async (
  db: DbClient,
  options: Omit<FetchOrdersOptions, "paidOnly"> = {},
): Promise<Order[]> => {
  return fetchOrders(db, {...options, paidOnly: true});
};

export const fetchDashboardOrders = async (
  db: DbClient,
  options: DateRangeFilter = {},
): Promise<Order[]> => {
  return fetchOrders(db, {
    ...options,
    fetches: ORDER_FETCHES,
    paidOnly: false,
  });
};

export const fetchOrderVoids = async (
  db: DbClient,
  options: DateRangeFilter = {},
): Promise<OrderVoid[]> => {
  const {conditions, params} = buildCreatedAtDateConditions(options);

  const query = `
    SELECT * FROM ${Tables.order_voids}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    FETCH items
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<OrderVoid>(result);
};
