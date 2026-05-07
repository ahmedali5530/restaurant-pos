import {Order as OrderModel} from '@/api/model/order';
import {OrderPayment} from "@/api/model/order_payment.ts";
import {safeNumber} from "@/lib/utils.ts";

export const getInvoiceNumber = (order: OrderModel) => {
  return `${order.invoice_number}${order.split ? `/${order.split}` : ''}`;
}

export const getOrderFilteredItems = (order: OrderModel) => {
  return order.items
    .filter(item => item?.deleted_at === undefined)
    .filter(item => item?.is_refunded !== true)
    .filter(item => item?.is_suspended !== true);
}

const getPaymentAmount = (payment?: OrderPayment) => {
  if (!payment) return 0;
  const amount = safeNumber(payment.payable);
  if (amount !== 0 || payment.payable === 0) return amount;
  return safeNumber(payment.amount);
};

const isCashPayment = (payment?: OrderPayment) => {
  const normalizedType = payment?.payment_type?.type?.toLowerCase()?.trim() ?? '';
  return normalizedType === 'cash';
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

  const baseAmount = getPaymentAmount(payments[0]);
  const nonCashBreakdown = payments.reduce((acc, payment) => {
    if (isCashPayment(payment)) return acc;
    const label = payment?.payment_type?.name || 'Other';
    const amount = getPaymentAmount(payment);
    acc[label] = (acc[label] ?? 0) + amount;
    return acc;
  }, {} as Record<string, number>);

  const nonCashAmount = Object.values(nonCashBreakdown).reduce((sum, amount) => sum + amount, 0);
  const cashAmount = baseAmount - nonCashAmount;

  const totalReceived = payments.reduce((sum, amount) => sum + amount.amount, 0);

  return {
    amountCollected: baseAmount,
    cashAmount,
    nonCashAmount,
    nonCashBreakdown,
    change: totalReceived - cashAmount - nonCashAmount,
    totalReceivedWithChange: totalReceived
  };
};