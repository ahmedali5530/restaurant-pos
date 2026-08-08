import {Order as OrderModel, OrderExtra, OrderStatus} from '@/api/model/order';
import {OrderDiscount} from '@/api/model/order_discount.ts';
import {getDiscountValueType} from '@/api/model/discount.ts';
import {OrderPayment} from "@/api/model/order_payment.ts";
import {OrderVoidReason} from "@/api/model/order_void.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderTaxAmount} from "@/lib/tax-calculator.ts";
import {formatNumber, safeNumber, withCurrency} from "@/lib/utils.ts";
import type {TFunction} from 'i18next';

export const getInvoiceNumber = (order?: OrderModel | null) => {
  if (!order || order.invoice_number == null) {
    return '-';
  }

  return `${order.invoice_number}${order.split ? `/${order.split}` : ''}`;
}

export const getOrderFilteredItems = (order: OrderModel) => {
  return (order?.items ?? [])
    .filter(item => item?.deleted_at === undefined)
    .filter(item => item?.is_refunded !== true)
    .filter(item => item?.is_suspended !== true);
}

/** Resolved extras only — drops null/undefined FETCH holes from stale order.extras IDs. */
export const getOrderExtras = (order?: OrderModel | null): OrderExtra[] =>
  (order?.extras ?? []).filter((extra): extra is OrderExtra => !!extra && extra.value != null);

/** Sum of active order extras (safe against undefined array holes). */
export const getOrderExtrasTotal = (order?: OrderModel | null): number =>
  getOrderExtras(order).reduce((sum, extra) => sum + safeNumber(extra.value), 0);

/** Active order_discounts lines (junction-first source). Drops null/undefined FETCH holes. */
export const getActiveOrderDiscounts = (order: OrderModel): OrderDiscount[] =>
  (order.order_discounts ?? []).filter(
    (line): line is OrderDiscount => !!line && !line.removed_at,
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
const getAppliedAmount = (payment?: OrderPayment) => {
  const amount = safeNumber(payment?.amount);
  const payable = safeNumber(payment?.payable);
  if (payable > 0 && amount > payable) {
    return payable;
  }
  return amount;
};

const isCashPayment = (payment?: OrderPayment) => {
  const normalizedType = payment?.payment_type?.type?.toLowerCase()?.trim() ?? '';
  const normalizedName = payment?.payment_type?.name?.toLowerCase()?.trim() ?? '';
  return normalizedType === 'cash' || normalizedName === 'cash';
};

export interface OrderPaymentTotals {
  amountCollected: number
  cashAmount: number
  nonCashAmount: number
  nonCashBreakdown: Record<string, number>
  change: number
  totalReceivedWithChange: number
}

export const getOrderPaymentTotals = (order: Pick<OrderModel, 'payments'>): OrderPaymentTotals => {
  const payments = (order.payments ?? []).filter((payment) => payment != null);

  const nonCashBreakdown = payments.reduce((acc, payment) => {
    if (isCashPayment(payment)) {
      return acc;
    }
    const label = payment?.payment_type?.name || 'Other';
    const applied = getAppliedAmount(payment);
    acc[label] = (acc[label] ?? 0) + applied;
    return acc;
  }, {} as Record<string, number>);

  const cashAmount = payments.reduce((sum, payment) => {
    if (!isCashPayment(payment)) {
      return sum;
    }
    return sum + getAppliedAmount(payment);
  }, 0);

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
