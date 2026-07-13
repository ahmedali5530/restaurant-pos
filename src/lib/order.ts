import {Order as OrderModel, OrderStatus} from '@/api/model/order';
import {OrderDiscount} from '@/api/model/order_discount.ts';
import {Discount, getDiscountValueType} from '@/api/model/discount.ts';
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

/** Active order_discounts lines (junction-first source). */
export const getActiveOrderDiscounts = (order: OrderModel): OrderDiscount[] =>
  (order.order_discounts ?? []).filter(line => !line.removed_at);

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

export interface DiscountRateBreakdown {
  percentRates: Set<number>;
  fixedAmounts: Set<number>;
}

export interface OrderDiscountBreakdownEntry {
  name: string;
  quantity: number;
  total: number;
  rateLabel: string;
}

const createDiscountRateBreakdown = (): DiscountRateBreakdown => ({
  percentRates: new Set<number>(),
  fixedAmounts: new Set<number>(),
});

const collectEngineLineDiscountRate = (
  breakdown: DiscountRateBreakdown,
  line: OrderDiscount,
) => {
  const rate = safeNumber(line.applied_rate);
  if (rate <= 0) {
    return;
  }
  if (line.value_type === 'percent') {
    breakdown.percentRates.add(rate);
  } else if (line.value_type === 'fixed_amount') {
    breakdown.fixedAmounts.add(rate);
  }
};

const collectLegacyDiscountRate = (
  breakdown: DiscountRateBreakdown,
  discount: Discount | string | undefined,
  discountRate: number,
) => {
  if (discountRate <= 0 || !discount || typeof discount === 'string') {
    return;
  }
  const valueType = getDiscountValueType(discount);
  if (valueType === 'percent') {
    breakdown.percentRates.add(discountRate);
  } else if (valueType === 'fixed_amount') {
    breakdown.fixedAmounts.add(discountRate);
  }
};

export const formatDiscountRateBreakdown = (breakdown: DiscountRateBreakdown): string => {
  const parts = [
    ...Array.from(breakdown.percentRates).sort((a, b) => a - b).map(rate => `${formatNumber(rate)}%`),
    ...Array.from(breakdown.fixedAmounts).sort((a, b) => a - b).map(rate => withCurrency(rate)),
  ];
  return parts.length > 0 ? parts.join(', ') : '-';
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
 * Aggregate discount breakdown grouped by discount name or applying user.
 * Junction-first: active order_discounts lines; legacy fallback per order.
 */
export const aggregateOrderDiscountBreakdown = (
  orders: OrderModel[],
  groupBy: DiscountBreakdownGroupBy,
  legacyDiscountLabel = 'Custom discount',
): OrderDiscountBreakdownEntry[] => {
  const map = new Map<string, {quantity: number; total: number} & DiscountRateBreakdown>();

  orders.forEach(order => {
    const activeLines = getActiveOrderDiscounts(order);

    if (activeLines.length > 0) {
      activeLines.forEach(line => {
        const key = groupBy === 'user'
          ? getUserDisplayName(order, line)
          : (line.name || legacyDiscountLabel);
        const amount = safeNumber(line.applied_amount);
        const existing = map.get(key) ?? {quantity: 0, total: 0, ...createDiscountRateBreakdown()};
        existing.quantity += 1;
        existing.total += amount;
        collectEngineLineDiscountRate(existing, line);
        map.set(key, existing);
      });
      return;
    }

    const discountAmount = getOrderCartDiscountAmount(order);
    if (discountAmount <= 0) {
      return;
    }

    const key = groupBy === 'user'
      ? getUserDisplayName(order)
      : (
        order.discount?.name
        || (typeof order.discount === 'string' ? order.discount : null)
        || legacyDiscountLabel
      );
    const existing = map.get(key) ?? {quantity: 0, total: 0, ...createDiscountRateBreakdown()};
    existing.quantity += 1;
    existing.total += discountAmount;
    collectLegacyDiscountRate(existing, order.discount, safeNumber(order.discount_rate));
    map.set(key, existing);
  });

  return Array.from(map.entries())
    .map(([name, data]) => ({
      name,
      quantity: data.quantity,
      total: data.total,
      rateLabel: formatDiscountRateBreakdown(data),
    }))
    .sort((a, b) => b.total - a.total);
};

/** Net sales after discounts (excludes tax, service, tips). */
export const calculateOrderNetSales = (order: OrderModel): number => {
  const filteredItems = getOrderFilteredItems(order);
  const grossTotal = filteredItems.reduce(
    (sum, item) => sum + safeNumber(calculateOrderItemPrice(item)),
    0,
  );
  const extrasTotal = (order.extras ?? []).reduce(
    (sum, extra) => sum + safeNumber(extra.value),
    0,
  );
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
  const extrasTotal = (order.extras ?? []).reduce((sum, extra) => sum + safeNumber(extra.value), 0);
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
