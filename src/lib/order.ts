import {Order as OrderModel, OrderExtra, OrderStatus} from '@/api/model/order';
import {OrderDiscount} from '@/api/model/order_discount.ts';
import {getDiscountValueType} from '@/api/model/discount.ts';
import {OrderPayment} from "@/api/model/order_payment.ts";
import {OrderVoidReason} from "@/api/model/order_void.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderTaxAmount} from "@/lib/tax-calculator.ts";
import {formatNumber, safeNumber, withCurrency} from "@/lib/utils.ts";
import type {TFunction} from 'i18next';

/** Stable sentinel while gateway assignment is pending — never a random local code. */
export const PENDING_INVOICE_LABEL = '—';

export const getInvoiceNumber = (order?: OrderModel | null) => {
  if (!order) {
    return PENDING_INVOICE_LABEL;
  }

  if (typeof order.invoice_display === 'string' && order.invoice_display.trim()) {
    return order.split ? `${order.invoice_display}/${order.split}` : order.invoice_display;
  }

  if (order.invoice_number != null && Number.isFinite(Number(order.invoice_number))) {
    return `${order.invoice_number}${order.split ? `/${order.split}` : ''}`;
  }

  // Do not surface local_invoice_code (random 6-char placeholders).
  return PENDING_INVOICE_LABEL;
}

export const hasAbsoluteInvoiceNumber = (order?: OrderModel | null): boolean => {
  if (!order) return false;
  if (typeof order.invoice_display === 'string' && order.invoice_display.trim()) return true;
  return order.invoice_number != null && Number.isFinite(Number(order.invoice_number));
};

export const getOrderFilteredItems = (order: OrderModel) => {
  return (order?.items ?? [])
    // Surreal may use `null` for "not deleted"; any truthy value means voided/cancelled.
    .filter((item) => item != null && !item.deleted_at)
    .filter((item) => item?.is_refunded !== true)
    .filter((item) => item?.is_suspended !== true);
};

/** SurrealDB FETCH can return a single record instead of `[record]` for one-item arrays. */
const asRecordArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value == null) {
    return [];
  }
  return [value as T];
};

/** Resolved extras only — drops null/undefined FETCH holes from stale order.extras IDs. */
export const getOrderExtras = (order?: OrderModel | null): OrderExtra[] =>
  asRecordArray<OrderExtra>(order?.extras).filter(
    (extra): extra is OrderExtra => !!extra && extra.value != null,
  );

/** Sum of active order extras (safe against undefined array holes). */
export const getOrderExtrasTotal = (order?: OrderModel | null): number =>
  getOrderExtras(order).reduce((sum, extra) => sum + safeNumber(extra.value), 0);

/** Active order_discounts lines (junction-first source). Drops null/undefined FETCH holes. */
export const getActiveOrderDiscounts = (order: OrderModel): OrderDiscount[] =>
  asRecordArray<OrderDiscount>(order?.order_discounts).filter(
    (line): line is OrderDiscount => !!line && typeof line === 'object' && !line.removed_at,
  );

/** Sum of applied_amount from active order_discounts; 0 when none. */
export const getOrderEngineDiscountTotal = (order: OrderModel): number =>
  getActiveOrderDiscounts(order).reduce(
    (sum, line) => sum + safeNumber(line.applied_amount),
    0,
  );

/** Junction-first cart/order discount total; falls back to discount_amount. */
export const getOrderCartDiscountAmount = (order: OrderModel): number => {
  const engineTotal = getOrderEngineDiscountTotal(order);
  if (engineTotal > 0) {
    return engineTotal;
  }
  return safeNumber(order.discount_amount);
};

/** Legacy per-line item discounts from order items. */
export const getOrderLineDiscountTotal = (order: OrderModel): number =>
  getOrderFilteredItems(order).reduce(
    (sum, item) => sum + safeNumber(item.discount),
    0,
  );

/** Full discount total including coupons (settlement-level). */
export const getOrderDiscountTotal = (order: OrderModel): number => {
  const lineDiscounts = getOrderLineDiscountTotal(order);
  const orderDiscount = getOrderCartDiscountAmount(order);
  const cartDiscount = Math.max(0, orderDiscount - lineDiscounts);
  const couponDiscount = safeNumber(order.coupon?.discount);
  return safeNumber(lineDiscounts + cartDiscount + couponDiscount);
};

export const orderHasDiscount = (order: OrderModel): boolean =>
  getOrderDiscountTotal(order) > 0;

const recordIdSuffix = (value: unknown): string => {
  const str = value?.toString?.() ?? String(value ?? '');
  return str.includes(':') ? str.split(':').slice(1).join(':') : str;
};

/** Match discount filter against active order_discounts lines or legacy order.discount. */
export const orderMatchesDiscountId = (order: OrderModel, discountId: string): boolean => {
  const normalizedFilter = recordIdSuffix(discountId);
  const activeLines = getActiveOrderDiscounts(order);

  if (activeLines.length > 0) {
    return activeLines.some(line => {
      const lineDiscountId = typeof line.discount === 'string'
        ? line.discount
        : line.discount?.id?.toString();
      return lineDiscountId && recordIdSuffix(lineDiscountId) === normalizedFilter;
    });
  }

  const legacyDiscountId = typeof order.discount === 'string'
    ? order.discount
    : order.discount?.id?.toString();
  return !!legacyDiscountId && recordIdSuffix(legacyDiscountId) === normalizedFilter;
};

export interface OrderDiscountBreakdownEntry {
  name: string;
  quantity: number;
  total: number;
  rateLabel: string;
}

const formatSingleDiscountRate = (valueType: string | undefined, rate: number): string => {
  if (rate <= 0) {
    return '-';
  }
  if (valueType === 'percent') {
    return `${formatNumber(rate)}%`;
  }
  if (valueType === 'fixed_amount') {
    return withCurrency(rate);
  }
  return '-';
};

const getUserDisplayName = (order: OrderModel, line?: OrderDiscount): string => {
  const appliedBy = line?.applied_by;
  if (appliedBy && typeof appliedBy === 'object') {
    const first = appliedBy.first_name ?? '';
    const last = appliedBy.last_name ?? '';
    const full = `${first} ${last}`.trim();
    if (full) {
      return full;
    }
    if (appliedBy.login) {
      return appliedBy.login;
    }
  }
  if (order.user?.first_name && order.user?.last_name) {
    return `${order.user.first_name} ${order.user.last_name}`;
  }
  return order.user?.login || 'Unknown';
};

type DiscountBreakdownGroupBy = 'name' | 'user';

/**
 * Aggregate discount breakdown grouped by discount name (or user) + value type + rate.
 * Junction-first: active order_discounts lines; legacy fallback per order.
 */
export const aggregateOrderDiscountBreakdown = (
  orders: OrderModel[],
  groupBy: DiscountBreakdownGroupBy,
  legacyDiscountLabel = 'Custom discount',
): OrderDiscountBreakdownEntry[] => {
  const map = new Map<string, OrderDiscountBreakdownEntry>();

  orders.forEach(order => {
    const activeLines = getActiveOrderDiscounts(order);

    if (activeLines.length > 0) {
      activeLines.forEach(line => {
        const name = groupBy === 'user'
          ? getUserDisplayName(order, line)
          : (line.name || legacyDiscountLabel);
        const rate = safeNumber(line.applied_rate);
        const valueType = line.value_type ?? '';
        const key = `${name}|${valueType}|${rate}`;
        const amount = safeNumber(line.applied_amount);
        const existing = map.get(key) ?? {
          name,
          quantity: 0,
          total: 0,
          rateLabel: formatSingleDiscountRate(valueType, rate),
        };
        existing.quantity += 1;
        existing.total += amount;
        map.set(key, existing);
      });
      return;
    }

    const discountAmount = getOrderCartDiscountAmount(order);
    if (discountAmount <= 0) {
      return;
    }

    const name = groupBy === 'user'
      ? getUserDisplayName(order)
      : (
        order.discount?.name
        || (typeof order.discount === 'string' ? order.discount : null)
        || legacyDiscountLabel
      );
    const rate = safeNumber(order.discount_rate);
    const valueType = order.discount && typeof order.discount !== 'string'
      ? getDiscountValueType(order.discount)
      : '';
    const key = `${name}|${valueType}|${rate}`;
    const existing = map.get(key) ?? {
      name,
      quantity: 0,
      total: 0,
      rateLabel: formatSingleDiscountRate(valueType, rate),
    };
    existing.quantity += 1;
    existing.total += discountAmount;
    map.set(key, existing);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};

/** Net sales after discounts (excludes tax, service, tips). */
export const calculateOrderNetSales = (order: OrderModel): number => {
  const filteredItems = getOrderFilteredItems(order);
  const grossTotal = filteredItems.reduce(
    (sum, item) => sum + safeNumber(calculateOrderItemPrice(item)),
    0,
  );
  const extrasTotal = getOrderExtrasTotal(order);
  const grossSales = safeNumber(grossTotal + extrasTotal);
  const net = grossSales - getOrderDiscountTotal(order);
  return net > 0 ? net : 0;
};

const getTenderedAmount = (payment?: OrderPayment) => safeNumber(payment?.amount);

/** Amount applied to the check (handles over-tender via payable). */
export const getAppliedPaymentAmount = (payment?: OrderPayment) => {
  const amount = safeNumber(payment?.amount);
  const payable = safeNumber(payment?.payable);
  if (payable > 0 && amount > payable) {
    return payable;
  }
  return amount;
};

const roundPaymentMoney = (value: number) => Math.round(safeNumber(value) * 100) / 100;

export const isCashPaymentType = (paymentType?: {type?: string; name?: string} | null) => {
  const normalizedType = paymentType?.type?.toLowerCase()?.trim() ?? '';
  const normalizedName = paymentType?.name?.toLowerCase()?.trim() ?? '';
  return normalizedType === 'cash' || normalizedName === 'cash';
};

/** Card (exact) tenders — case-insensitive type match. */
export const isCardPaymentType = (paymentType?: {type?: string; name?: string} | null) => {
  const normalizedType = paymentType?.type?.toLowerCase()?.trim() ?? '';
  return normalizedType === 'card';
};

/**
 * Remote gateway tenders store JSON in comments (intentId / provider).
 * Those amounts must stay sticky after capture.
 */
export const isRemoteCapturedDraftPayment = (payment?: {comments?: string} | null) => {
  const raw = payment?.comments;
  if (!raw || typeof raw !== 'string') {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as {intentId?: unknown; provider?: unknown};
    return !!(parsed && (parsed.intentId || parsed.provider));
  } catch {
    return false;
  }
};

type DraftPaymentLine = {
  payable?: number
  amount?: number
  payment_type?: {type?: string; name?: string} | null
  comments?: string
};

/**
 * After discount/tip/service/extras change, every draft tender line should
 * store the current check total as `payable` (cash may still over-tender).
 */
export const recomputeDraftPaymentPayables = <T extends {payable?: number}>(
  payments: T[],
  grandTotalDue: number,
): T[] => {
  const due = safeNumber(grandTotalDue);
  if (!payments.length) return payments;
  if (payments.every((p) => safeNumber(p.payable) === due)) return payments;
  return payments.map((p) => ({...p, payable: due}));
};

/**
 * Sync draft tenders when the check total changes:
 * - all lines get payable = due
 * - cash amounts stay sticky (over-tender / change)
 * - exact (non-cash) amounts waterfall from the last line to match remaining due
 * - remote-captured exact lines stay sticky
 * - zero-amount exact (adjustable) lines are dropped
 */
export const recomputeDraftPaymentsForTotal = <T extends DraftPaymentLine>(
  payments: T[],
  grandTotalDue: number,
): T[] => {
  const due = roundPaymentMoney(grandTotalDue);
  if (!payments.length) {
    return payments;
  }

  const withPayable = payments.map((p) => ({...p, payable: due}));

  const cashSum = withPayable
    .filter((p) => isCashPaymentType(p.payment_type))
    .reduce((sum, p) => sum + safeNumber(p.amount), 0);
  const appliedCash = Math.min(Math.max(0, cashSum), due);

  const stickyExactSum = withPayable
    .filter((p) => !isCashPaymentType(p.payment_type) && isRemoteCapturedDraftPayment(p))
    .reduce((sum, p) => sum + safeNumber(p.amount), 0);

  let remainingExact = roundPaymentMoney(Math.max(0, due - appliedCash - stickyExactSum));

  const adjustableIndexes: number[] = [];
  withPayable.forEach((p, index) => {
    if (isCashPaymentType(p.payment_type)) {
      return;
    }
    if (isRemoteCapturedDraftPayment(p)) {
      return;
    }
    adjustableIndexes.push(index);
  });

  if (adjustableIndexes.length === 0) {
    return withPayable;
  }

  const next = withPayable.slice();
  const currentSum = roundPaymentMoney(
    adjustableIndexes.reduce((sum, index) => sum + safeNumber(next[index].amount), 0),
  );

  if (adjustableIndexes.length === 1) {
    const index = adjustableIndexes[0];
    next[index] = {...next[index], amount: remainingExact};
  } else if (currentSum > remainingExact) {
    let delta = roundPaymentMoney(currentSum - remainingExact);
    for (let k = adjustableIndexes.length - 1; k >= 0 && delta > 0; k -= 1) {
      const index = adjustableIndexes[k];
      const amount = safeNumber(next[index].amount);
      const reduceBy = Math.min(amount, delta);
      next[index] = {...next[index], amount: roundPaymentMoney(amount - reduceBy)};
      delta = roundPaymentMoney(delta - reduceBy);
    }
  } else if (currentSum < remainingExact) {
    const lastIndex = adjustableIndexes[adjustableIndexes.length - 1];
    const bump = roundPaymentMoney(remainingExact - currentSum);
    next[lastIndex] = {
      ...next[lastIndex],
      amount: roundPaymentMoney(safeNumber(next[lastIndex].amount) + bump),
    };
  }

  return next.filter((p) => {
    if (isCashPaymentType(p.payment_type) || isRemoteCapturedDraftPayment(p)) {
      return true;
    }
    return safeNumber(p.amount) > 0;
  });
};

/** Change due for display: Remaining when underpaid; Change only from cash over-tender. */
export const getDraftPaymentChangeDisplay = (
  payments: DraftPaymentLine[],
  grandTotalDue: number,
): {remaining: number; change: number; displayAmount: number; isRemaining: boolean} => {
  const due = safeNumber(grandTotalDue);
  const cashTendered = payments
    .filter((p) => isCashPaymentType(p.payment_type))
    .reduce((sum, p) => sum + safeNumber(p.amount), 0);
  const exactTendered = payments
    .filter((p) => !isCashPaymentType(p.payment_type))
    .reduce((sum, p) => sum + safeNumber(p.amount), 0);

  const exactApplied = Math.min(Math.max(0, exactTendered), due);
  const remainingAfterExact = Math.max(0, due - exactApplied);
  const cashApplied = Math.min(Math.max(0, cashTendered), remainingAfterExact);
  const remaining = roundPaymentMoney(Math.max(0, due - exactApplied - cashApplied));
  const change = roundPaymentMoney(Math.max(0, cashTendered - cashApplied));

  if (remaining > 0) {
    return {remaining, change: 0, displayAmount: -remaining, isRemaining: true};
  }
  return {remaining: 0, change, displayAmount: change, isRemaining: false};
};

const isCashPayment = (payment?: OrderPayment) => isCashPaymentType(payment?.payment_type);

const getOrderPayments = (order?: Pick<OrderModel, 'payments'> | null): OrderPayment[] =>
  asRecordArray<OrderPayment>(order?.payments).filter((payment): payment is OrderPayment => payment != null);

/** Applied (not tendered) totals keyed by payment type record id. */
export const aggregateAppliedPaymentsByTypeId = (
  orders: Array<Pick<OrderModel, 'payments'>>,
): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const order of orders) {
    for (const payment of getOrderPayments(order)) {
      const paymentTypeId = payment.payment_type?.id != null
        ? String(payment.payment_type.id)
        : '';
      if (!paymentTypeId) continue;
      totals.set(paymentTypeId, (totals.get(paymentTypeId) ?? 0) + getAppliedPaymentAmount(payment));
    }
  }
  return totals;
};

export interface OrderPaymentTotals {
  amountCollected: number
  cashAmount: number
  nonCashAmount: number
  nonCashBreakdown: Record<string, number>
  change: number
  totalReceivedWithChange: number
}

export type GetOrderPaymentTotalsOptions = {
  /** Cap applied amounts so stale high `payable` cannot inflate collected. */
  maxCollectable?: number;
};

export const getOrderPaymentTotals = (
  order: Pick<OrderModel, 'payments'>,
  options?: GetOrderPaymentTotalsOptions,
): OrderPaymentTotals => {
  const payments = getOrderPayments(order);
  let remaining =
    options?.maxCollectable != null && Number.isFinite(options.maxCollectable)
      ? Math.max(0, safeNumber(options.maxCollectable))
      : null;

  let cashAmount = 0;
  const nonCashBreakdown: Record<string, number> = {};

  for (const payment of payments) {
    let applied = getAppliedPaymentAmount(payment);
    if (remaining != null) {
      applied = Math.min(applied, remaining);
      remaining = Math.max(0, remaining - applied);
    }
    if (isCashPayment(payment)) {
      cashAmount += applied;
    } else {
      const label = payment?.payment_type?.name || 'Other';
      nonCashBreakdown[label] = (nonCashBreakdown[label] ?? 0) + applied;
    }
  }

  const nonCashAmount = Object.values(nonCashBreakdown).reduce((sum, amount) => sum + amount, 0);
  const totalReceivedWithChange = payments.reduce((sum, payment) => sum + getTenderedAmount(payment), 0);
  const amountCollected = safeNumber(cashAmount + nonCashAmount);

  return {
    amountCollected,
    cashAmount,
    nonCashAmount,
    nonCashBreakdown,
    change: safeNumber(totalReceivedWithChange - amountCollected),
    totalReceivedWithChange,
  };
};

export interface OrderSettlementFigures {
  itemsTotal: number;
  extrasTotal: number;
  lineDiscounts: number;
  cartDiscount: number;
  couponDiscount: number;
  discounts: number;
  grossSales: number;
  netSales: number;
  serviceCharges: number;
  tax: number;
  amountDueBeforeTips: number;
  tips: number;
  grandTotalDue: number;
}

/** Per-order settlement totals using persisted amounts (matches payment save). */
export const getOrderSettlementFigures = (order: OrderModel): OrderSettlementFigures => {
  const items = getOrderFilteredItems(order);
  const itemsTotal = items.reduce((sum, item) => sum + safeNumber(calculateOrderItemPrice(item)), 0);
  const extrasTotal = getOrderExtrasTotal(order);
  const lineDiscounts = getOrderLineDiscountTotal(order);
  const orderDiscount = getOrderCartDiscountAmount(order);
  const cartDiscount = Math.max(0, orderDiscount - lineDiscounts);
  const couponDiscount = safeNumber(order.coupon?.discount);
  const discounts = safeNumber(lineDiscounts + cartDiscount + couponDiscount);
  const grossSales = safeNumber(itemsTotal + extrasTotal);
  const netSales = safeNumber(grossSales - discounts);
  const serviceCharges = safeNumber(order.service_charge_amount);
  const tax = getOrderTaxAmount(order);
  const tips = safeNumber(order.tip_amount);
  const amountDueBeforeTips = safeNumber(netSales + serviceCharges + tax);
  const grandTotalDue = safeNumber(amountDueBeforeTips + tips);

  return {
    itemsTotal,
    extrasTotal,
    lineDiscounts,
    cartDiscount,
    couponDiscount,
    discounts,
    grossSales,
    netSales,
    serviceCharges,
    tax,
    amountDueBeforeTips,
    tips,
    grandTotalDue,
  };
};

/** Payment totals capped to the order's current settlement due (incl. tips). */
export const getOrderPaymentTotalsForOrder = (order: OrderModel): OrderPaymentTotals => {
  const due = getOrderSettlementFigures(order).grandTotalDue;
  return getOrderPaymentTotals(order, {maxCollectable: due});
};

/** Amount due at checkout: max payment payable when recorded, else reconstructed settlement. */
export const getOrderAmountDueFromPayments = (order: OrderModel): number => {
  const payments = (order.payments ?? []).filter((payment) => payment != null);
  const payables = payments
    .map((payment) => safeNumber(payment?.payable))
    .filter((payable) => payable > 0);

  if (payables.length > 0) {
    return Math.max(...payables);
  }

  return getOrderSettlementFigures(order).grandTotalDue;
};

/** Collected minus amount due (zero when payment matches checkout payable). */
export const getOrderRounding = (order: OrderModel): number => {
  const amountDue = getOrderAmountDueFromPayments(order);
  return safeNumber(getOrderPaymentTotals(order).amountCollected - amountDue);
};

const ORDER_STATUS_I18N_KEY: Partial<Record<OrderStatus, string>> = {
  [OrderStatus['In Progress']]: 'status.inProgress',
  [OrderStatus.Paid]: 'status.paid',
  [OrderStatus.Cancelled]: 'status.cancelled',
  [OrderStatus.Spilt]: 'status.spilt',
  [OrderStatus.Merged]: 'status.merged',
  [OrderStatus.Refunded]: 'status.refunded',
};

export const translateOrderStatus = (t: TFunction<'orders'>, status: string) => {
  const key = ORDER_STATUS_I18N_KEY[status as OrderStatus];
  return key ? t(key) : status;
};

const VOID_REASON_I18N_KEY: Record<OrderVoidReason, string> = {
  [OrderVoidReason.FOHNotMade]: 'voidReasons.fohNotMade',
  [OrderVoidReason.BOHNotMade]: 'voidReasons.bohNotMade',
  [OrderVoidReason.GuestNotMade]: 'voidReasons.guestNotMade',
  [OrderVoidReason.FOHMade]: 'voidReasons.fohMade',
  [OrderVoidReason.BOHMade]: 'voidReasons.bohMade',
  [OrderVoidReason.GuestMade]: 'voidReasons.guestMade',
  [OrderVoidReason.PunchByMistake]: 'voidReasons.punchByMistake',
  [OrderVoidReason.Testing]: 'voidReasons.testing',
};

export const translateVoidReason = (t: TFunction<'orders'>, reason: OrderVoidReason) => {
  return t(VOID_REASON_I18N_KEY[reason]);
};
