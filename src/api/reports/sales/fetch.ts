import {Tables} from "@/api/db/tables.ts";
import {OrderStatus} from "@/api/model/order.ts";
import {MODIFIER_FETCH_DEPTH, buildModifierFetches} from "@/api/model/order_fetches.ts";
import type {Order} from "@/api/model/order.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import {
  buildBranchInsideCondition,
  buildCreatedAtDateConditions,
  buildNestedRecordAnyCondition,
  buildOrConditions,
  buildRecordInsideCondition,
  unwrapQueryResult,
} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {toRecordId} from "@/lib/utils.ts";

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

/** Slimmer fetches for dashboard KPI cards (no deep modifiers). */
export const DASHBOARD_KPI_FETCHES = [
  ...SALES_SUMMARY_FETCHES,
  "user",
  "cashier",
  "table",
  "customer",
  "floor",
];

export const DASHBOARD_DELIVERY_FETCHES = [
  "delivery",
  "customer",
  "order_type",
];

export interface FetchOrdersOptions extends DateRangeFilter {
  fetches?: string[];
  paidOnly?: boolean;
  /** Explicit status list; ignored when paidOnly is true. */
  statuses?: string[];
  orderTakerIds?: string[];
  orderTypeIds?: string[];
  categoryIds?: string[];
  menuItemIds?: string[];
  /** Match legacy discount, order_discounts lines, or coupon. */
  hasDiscount?: boolean;
  paymentTypeIds?: string[];
  /** Orders with at least one cash payment (type/name). */
  cashPaymentsOnly?: boolean;
  /** Filter by cashier or order-taker shift. */
  shiftId?: string;
  /** Dine-in: table must be set. */
  tableRequired?: boolean;
  /** Orders with a delivery payload. */
  deliveryOnly?: boolean;
}

const DISCOUNT_EXISTENCE_CONDITION =
  "(discount != NONE OR (order_discounts != NONE AND array::len(order_discounts) > 0) OR coupon != NONE)";

const CASH_PAYMENT_CONDITION =
  "(array::any(payments.payment_type.type, 'cash') OR array::any(payments.payment_type.type, 'Cash') OR array::any(payments.payment_type.name, 'cash') OR array::any(payments.payment_type.name, 'Cash'))";

const DELIVERY_ORDER_CONDITION =
  "delivery != NONE AND delivery != {} AND delivery != []";

export const fetchOrders = async (
  db: DbClient,
  options: FetchOrdersOptions = {},
): Promise<Order[]> => {
  const {
    startDate,
    endDate,
    branchIds,
    fetches = SALES_SUMMARY_FETCHES,
    paidOnly = false,
    statuses = [],
    orderTakerIds = [],
    orderTypeIds = [],
    categoryIds = [],
    menuItemIds = [],
    hasDiscount = false,
    paymentTypeIds = [],
    cashPaymentsOnly = false,
    shiftId,
    tableRequired = false,
    deliveryOnly = false,
  } = options;

  const conditions: string[] = [];
  const params: Record<string, any> = {};

  if (paidOnly) {
    conditions.push("status = 'Paid'");
  } else if (statuses.length > 0) {
    conditions.push(`status INSIDE $statusList`);
    params.statusList = statuses;
  }

  const dateFilter = buildCreatedAtDateConditions({startDate, endDate});
  conditions.push(...dateFilter.conditions);
  Object.assign(params, dateFilter.params);

  const branchFilter = buildBranchInsideCondition(branchIds);
  if (branchFilter.emptyResult) {
    return [];
  }
  if (branchFilter.condition) {
    conditions.push(branchFilter.condition);
    Object.assign(params, branchFilter.params);
  }

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

  if (hasDiscount) {
    conditions.push(DISCOUNT_EXISTENCE_CONDITION);
  }

  if (paymentTypeIds.length > 0) {
    const paymentParts: string[] = [];
    paymentTypeIds.forEach((pt, index) => {
      const paramName = `paymentType${index}`;
      paymentParts.push(`array::any(payments.payment_type.id, $${paramName})`);
      params[paramName] = toRecordId(pt);
    });
    conditions.push(`(${paymentParts.join(" OR ")})`);
  }

  if (cashPaymentsOnly) {
    conditions.push(CASH_PAYMENT_CONDITION);
  }

  if (shiftId) {
    const shiftFilter = buildRecordInsideCondition("cashier.user_shift", [shiftId], "shiftIds");
    const userShiftFilter = buildRecordInsideCondition("user.user_shift", [shiftId], "userShiftIds");
    const parts = [shiftFilter.condition, userShiftFilter.condition].filter(Boolean);
    Object.assign(params, shiftFilter.params, userShiftFilter.params);
    if (parts.length > 0) {
      conditions.push(`(${parts.join(" OR ")})`);
    }
  }

  if (tableRequired) {
    conditions.push("table != NONE");
  }

  if (deliveryOnly) {
    conditions.push(DELIVERY_ORDER_CONDITION);
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

/** Paid orders for dashboard KPIs (date/branch scoped). */
export const fetchDashboardOrders = async (
  db: DbClient,
  options: DateRangeFilter = {},
): Promise<Order[]> => {
  return fetchOrders(db, {
    ...options,
    fetches: DASHBOARD_KPI_FETCHES,
    paidOnly: true,
  });
};

/**
 * Open delivery orders for the dashboard map (excludes Paid/Cancelled).
 * Kept separate so multi-month KPI ranges do not ship every status.
 */
export const fetchDashboardDeliveryOrders = async (
  db: DbClient,
  options: DateRangeFilter = {},
): Promise<Order[]> => {
  return fetchOrders(db, {
    ...options,
    fetches: DASHBOARD_DELIVERY_FETCHES,
    deliveryOnly: true,
    statuses: [
      OrderStatus["In Progress"],
      OrderStatus.Spilt,
      OrderStatus.Merged,
    ],
  });
};

export const fetchOrderVoids = async (
  db: DbClient,
  options: DateRangeFilter = {},
): Promise<OrderVoid[]> => {
  const {conditions, params} = buildCreatedAtDateConditions(options);
  const branchFilter = buildBranchInsideCondition(options.branchIds);
  if (branchFilter.emptyResult) {
    return [];
  }
  if (branchFilter.condition) {
    conditions.push(branchFilter.condition);
    Object.assign(params, branchFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.order_voids}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    FETCH items
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<OrderVoid>(result);
};
