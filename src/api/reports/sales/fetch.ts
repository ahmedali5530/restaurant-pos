import {Tables} from "@/api/db/tables.ts";
import {ORDER_FETCHES} from "@/api/model/order.ts";
import {MODIFIER_FETCH_DEPTH, buildModifierFetches} from "@/api/model/order_fetches.ts";
import type {Order} from "@/api/model/order.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import {buildCreatedAtDateConditions, buildNestedRecordAnyCondition, buildOrConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";

export const SALES_SUMMARY_FETCHES = [
  "payments",
  "payments.payment_type",
  "discount",
  "tax",
  "order_taxes",
  "order_taxes.tax",
  "order_type",
  "items",
  "items.item",
  "items.taxes",
  "items.tax_mode",
  "coupon",
  "coupon.coupon",
  "order_discounts",
  "order_discounts.discount",
];

export const PRODUCT_MIX_FETCHES = [
  "user",
  "order_type",
  "tax",
  "items",
  "items.item",
  "items.item.categories",
  "items.taxes",
  "items.tax_mode",
  "items.modifiers",
  ...buildModifierFetches(MODIFIER_FETCH_DEPTH),
];

export interface FetchOrdersOptions extends DateRangeFilter {
  fetches?: string[];
  paidOnly?: boolean;
  orderTakerIds?: string[];
  orderTypeIds?: string[];
  categoryIds?: string[];
  menuItemIds?: string[];
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
    categoryIds = [],
    menuItemIds = [],
  } = options;

  const conditions: string[] = [];
  const params: Record<string, any> = {};

  if (paidOnly) {
    conditions.push("status = 'Paid'");
  }

  const dateFilter = buildCreatedAtDateConditions({startDate, endDate});
  conditions.push(...dateFilter.conditions);
  Object.assign(params, dateFilter.params);

  const userFilter = buildOrConditions("user", orderTakerIds, "userIds");
  if (userFilter.condition) {
    conditions.push(userFilter.condition);
    Object.assign(params, userFilter.params);
  }

  const orderTypeFilter = buildOrConditions("order_type", orderTypeIds, "orderTypeIds");
  if (orderTypeFilter.condition) {
    conditions.push(orderTypeFilter.condition);
    Object.assign(params, orderTypeFilter.params);
  }

  const menuItemFilter = buildNestedRecordAnyCondition("items.item", menuItemIds, "menuItem");
  if (menuItemFilter.condition) {
    conditions.push(menuItemFilter.condition);
    Object.assign(params, menuItemFilter.params);
  }

  const categoryFilter = buildNestedRecordAnyCondition("items.item.categories", categoryIds, "category");
  if (categoryFilter.condition) {
    conditions.push(categoryFilter.condition);
    Object.assign(params, categoryFilter.params);
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
