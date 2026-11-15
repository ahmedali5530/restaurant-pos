import type {Order} from "@/api/model/order.ts";
import type {Tax} from "@/api/model/tax.ts";
import type {Coupon} from "@/api/model/coupon.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";
import {terminalSyncService} from "@/infrastructure/sync/sync-service.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {
  ensureOrderSyncedForFiscal,
  fiscalShouldBlockBeforePaid,
  listMissingLocalFiscalItemIds,
  loadOrderForFiscal,
  runFiscalSettlementForOrder,
} from "@/integrations/providers/fiscal/settlement.ts";
import {publishSaleCompleted} from "@/integrations/accounting/events/publish.ts";
import {
  publishInvoiceCreated,
  publishPaymentCompleted,
} from "@/integrations/events/publish/payments.ts";
import {toast} from "sonner";

type SettleDb = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<any>;
};

export type SettlePaidPaymentLine = {
  id?: string;
  paymentTypeId: string;
  paymentTypeName?: string;
  amount: number;
  payable: number;
  comments?: string | null;
};

export type SettlePaidOrderInput = {
  db: SettleDb;
  integrationManager?: any;
  order: Order;
  payments: SettlePaidPaymentLine[];
  cashierId?: string | null;
  tax?: Tax | null;
  taxId?: string | null;
  taxAmount?: number;
  tip?: number;
  tipAmount?: number;
  tipType?: DiscountType | string;
  serviceCharge?: number;
  serviceChargeAmount?: number;
  serviceChargeType?: DiscountType | string;
  notes?: string;
  discountAmount?: number;
  discountId?: string;
  extras?: Array<{id?: string; name: string; value: number}>;
  coupon?: Coupon | null;
  couponAmount?: number;
  keepTaxes?: boolean;
  skipDraft?: boolean;
  flushDraft?: () => Promise<void>;
  trackingPage?: string;
  trackingUser?: any;
  total?: number;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export type SettlePaidOrderResult =
  | {ok: true; payments: SettlePaidPaymentLine[]}
  | {ok: false; code: string; message?: string};

/**
 * Full paid-settle path shared by OrderPayment receiving and Quick Complete:
 * fiscal pre-check → settleOrder → tracking → background fiscal/accounting publishes.
 */
export async function settlePaidOrder(
  input: SettlePaidOrderInput,
): Promise<SettlePaidOrderResult> {
  const {
    db,
    integrationManager,
    order,
    payments,
    cashierId,
    tax,
    taxId,
    taxAmount,
    tip = 0,
    tipAmount = 0,
    tipType = DiscountType.Fixed,
    serviceCharge = 0,
    serviceChargeAmount = 0,
    serviceChargeType = DiscountType.Fixed,
    notes = "",
    discountAmount,
    discountId,
    extras = [],
    coupon,
    couponAmount,
    keepTaxes,
    skipDraft,
    flushDraft,
    trackingPage,
    trackingUser,
    total = 0,
    t,
  } = input;

  let blockBeforePaid = false;
  let fiscalOrderSnapshot: Order | undefined;
  let settledOrder = order;

  try {
    const syncState = await ensureOrderSyncedForFiscal(String(settledOrder.id));
    if (settledOrder.invoice_number == null) {
      const local = await posStore.getOrder(String(settledOrder.id));
      if (local?.invoice_number != null) {
        settledOrder = {...settledOrder, invoice_number: local.invoice_number} as Order;
      }
    }
    blockBeforePaid = await fiscalShouldBlockBeforePaid(integrationManager, db);
    if (blockBeforePaid) {
      fiscalOrderSnapshot = await loadOrderForFiscal(db, String(settledOrder.id));
      if (fiscalOrderSnapshot && settledOrder.invoice_number != null) {
        fiscalOrderSnapshot = {
          ...fiscalOrderSnapshot,
          invoice_number: settledOrder.invoice_number,
        };
      }
      const missingItems = await listMissingLocalFiscalItemIds(
        String(settledOrder.id),
        fiscalOrderSnapshot,
      );
      if (!syncState.ok || missingItems.length > 0) {
        toast.error(t("errors.itemsPendingSync"));
        return {ok: false, code: "ITEMS_PENDING_SYNC"};
      }
    }
  } catch (fiscalCheckError) {
    console.warn("Fiscal pre-check skipped (offline?)", fiscalCheckError);
    blockBeforePaid = false;
  }

  if (blockBeforePaid && fiscalOrderSnapshot) {
    const paymentRowsForFiscal = payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      payable: payment.payable,
      comments: payment.comments ?? null,
      payment_type: {
        id: payment.paymentTypeId,
        name: payment.paymentTypeName,
      },
    }));
    const preResult = await runFiscalSettlementForOrder(integrationManager, db, {
      ...fiscalOrderSnapshot,
      tax: tax ?? fiscalOrderSnapshot.tax,
      tax_amount: taxAmount ?? fiscalOrderSnapshot.tax_amount,
      discount_amount: discountAmount ?? fiscalOrderSnapshot.discount_amount,
      tip,
      tip_amount: tipAmount,
      tip_type: tipType as any,
      service_charge: serviceCharge,
      service_charge_amount: serviceChargeAmount,
      service_charge_type: serviceChargeType as any,
      payments:
        paymentRowsForFiscal.length > 0
          ? (paymentRowsForFiscal as any)
          : fiscalOrderSnapshot.payments,
    });
    if (preResult.blocked) {
      const message =
        preResult.blockedCode === "INVOICE_PENDING"
          ? t("errors.invoicePendingSync")
          : preResult.blockedCode === "ITEMS_PENDING_SYNC"
            ? t("errors.itemsPendingSync")
            : (preResult.blockedError ?? t("errors.fiscalFailed"));
      toast.error(message);
      return {
        ok: false,
        code: preResult.blockedCode ?? "FISCAL_BLOCKED",
        message,
      };
    }
    if (Object.values(preResult.resultsByProvider).some((row) => row.status === "failed")) {
      toast.warning("Some fiscal providers failed; check Integrations queue");
    }
  }

  const orderId = String(order.id);
  const hasCoupon = !!(coupon && couponAmount && couponAmount > 0);
  const resolvedDiscountAmount = discountAmount ?? order.discount_amount ?? 0;
  const resolvedDiscountId =
    discountId ?? (order.discount?.id ? String(order.discount.id) : undefined);

  if (flushDraft) {
    await flushDraft();
  }

  const settled = await posStore.settleOrder({
    orderId,
    payments: payments
      .filter((payment) => payment?.paymentTypeId && Number(payment.amount) > 0)
      .map((payment) => ({
        id: payment.id ? String(payment.id) : undefined,
        paymentTypeId: String(payment.paymentTypeId),
        amount: Number(payment.amount),
        payable: Number(payment.payable ?? total),
        comments: payment.comments ?? null,
      })),
    cashierId: cashierId ?? null,
    taxId: taxId !== undefined ? taxId : tax?.id ? String(tax.id) : null,
    tip,
    tipAmount,
    tipType,
    serviceCharge,
    serviceChargeAmount,
    serviceChargeType,
    notes,
    discountAmount: resolvedDiscountAmount,
    ...(resolvedDiscountId ? {discountId: resolvedDiscountId} : {}),
    extras,
    coupon: hasCoupon
      ? {
          id: order?.coupon?.id ? String(order.coupon.id) : undefined,
          couponId: String(coupon!.id),
          discount: Number(couponAmount),
        }
      : null,
    couponRedemption: hasCoupon
      ? {
          userId: cashierId ?? null,
          discountAmount: Number(couponAmount),
        }
      : null,
    keepTaxes,
    skipDraft,
    seed: {order, items: order.items},
  });

  const settledPayments = payments.map((payment) => {
    const row = settled.payments.find(
      (p) => p.id === payment.id || p.id === `order_payment:${payment.id}`,
    );
    return row ? {...payment, id: String(row.id)} : payment;
  });

  if (order?.table?.id) {
    void posStore.unlockTable(String(order.table.id)).catch(() => undefined);
  }

  postOrderTracking({
    module: "orders.complete_payment",
    page: trackingPage,
    orderId: order.id,
    payload: {
      payment_count: payments.length,
      coupon: coupon?.id?.toString(),
      total,
    },
    user: trackingUser,
  });

  void (async () => {
    try {
      await terminalSyncService.synchronize().catch(() => undefined);

      if (!blockBeforePaid) {
        await ensureOrderSyncedForFiscal(orderId);
        const settledForFiscal = await loadOrderForFiscal(db, orderId);
        if (settledForFiscal) {
          const fiscalResult = await runFiscalSettlementForOrder(
            integrationManager,
            db,
            settledForFiscal,
          );
          if (
            Object.values(fiscalResult.resultsByProvider).some((row) => row.status === "failed")
          ) {
            toast.warning("Some fiscal providers failed; check Integrations queue");
          }
        }
      }

      const saleOrder = await loadOrderForFiscal(db, orderId);
      if (saleOrder && integrationManager) {
        await publishSaleCompleted(integrationManager, saleOrder);
        await publishInvoiceCreated(integrationManager, {
          orderId: String(saleOrder.id),
          invoiceNumber: saleOrder.invoice_number,
          total: Number(
            saleOrder.payments?.reduce((s, p) => s + Number(p?.amount || 0), 0) || total,
          ),
          totalCollected: Number(
            saleOrder.payments?.reduce((s, p) => s + Number(p?.amount || 0), 0) || total,
          ),
          taxAmount: Number(saleOrder.tax_amount || taxAmount || 0),
          customerId: saleOrder.customer?.id ? String(saleOrder.customer.id) : undefined,
          completedAt: new Date().toISOString(),
        });
        for (const payment of settledPayments) {
          if (!payment?.id) continue;
          await publishPaymentCompleted(integrationManager, {
            paymentId: String(payment.id),
            orderId,
            amount: Number(payment.amount || 0),
            paymentTypeId: payment.paymentTypeId ? String(payment.paymentTypeId) : undefined,
            paymentTypeName: payment.paymentTypeName,
            tipAmount,
          });
        }
      }
    } catch (sideEffectError) {
      console.warn("Post-settlement side effects failed", sideEffectError);
    }
  })();

  return {ok: true, payments: settledPayments};
}
