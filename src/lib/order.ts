import {Order as OrderModel, OrderStatus} from '@/api/model/order';
import {OrderPayment} from "@/api/model/order_payment.ts";
import {OrderVoidReason} from "@/api/model/order_void.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderTaxAmount} from "@/lib/tax-calculator.ts";
import {safeNumber} from "@/lib/utils.ts";
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
  const payments = order.payments ?? [];

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
  const lineDiscounts = items.reduce((sum, item) => sum + safeNumber(item.discount), 0);
  const orderDiscount = safeNumber(order.discount_amount);
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
  const payments = order.payments ?? [];
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
