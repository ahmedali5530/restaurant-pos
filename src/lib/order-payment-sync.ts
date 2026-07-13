import { Tables } from "@/api/db/tables.ts";
import { OrderPayment } from "@/api/model/order_payment.ts";

type SyncOrderPaymentsDb = {
  create: (table: string, data: Record<string, unknown>) => Promise<any>;
  merge: (id: unknown, data: Record<string, unknown>) => Promise<any>;
  delete: (id: unknown) => Promise<any>;
};

export const isPersistedOrderPaymentId = (id: unknown): boolean => {
  if (id === null || id === undefined) {
    return false;
  }

  if (typeof id === "object" && "tb" in (id as object)) {
    return String((id as { tb: unknown }).tb) === Tables.order_payment;
  }

  const value = String(id);
  return value.startsWith(`${Tables.order_payment}:`);
};

const paymentIdKey = (id: unknown): string => String(id);

/**
 * Incrementally sync UI payments to order_payment records.
 * Keeps existing rows, creates new (nanoid) ones, deletes only removed, drops stale null links.
 */
export async function syncOrderPayments(
  db: SyncOrderPaymentsDb,
  desiredPayments: OrderPayment[],
  existingPayments: (OrderPayment | null | undefined)[] | undefined,
  defaultPayable: number,
): Promise<{ paymentIds: any[]; payments: OrderPayment[] }> {
  const existing = (existingPayments ?? []).filter(
    (payment): payment is OrderPayment => payment != null && payment.id != null,
  );

  const desiredPersistedKeys = new Set(
    desiredPayments
      .filter((payment) => isPersistedOrderPaymentId(payment?.id))
      .map((payment) => paymentIdKey(payment.id)),
  );

  for (const existingPayment of existing) {
    const key = paymentIdKey(existingPayment.id);
    if (!desiredPersistedKeys.has(key)) {
      try {
        await db.delete(existingPayment.id);
      } catch {
        // Record may already be gone (stale link)
      }
    }
  }

  const paymentIds: any[] = [];
  const payments: OrderPayment[] = [];

  for (const payment of desiredPayments) {
    if (payment == null || !payment.payment_type?.id) {
      continue;
    }

    const payload = {
      amount: payment.amount,
      payment_type: payment.payment_type.id,
      comments: payment.comments || "",
      payable: payment.payable ?? defaultPayable,
    };

    if (isPersistedOrderPaymentId(payment.id)) {
      try {
        await db.merge(payment.id, payload);
        paymentIds.push(payment.id);
        payments.push(payment);
        continue;
      } catch {
        // Missing record — fall through and recreate
      }
    }

    const [created] = await db.create(Tables.order_payment, payload);
    const createdId = created?.id;
    paymentIds.push(createdId);
    payments.push({
      ...payment,
      id: createdId,
    });
  }

  return { paymentIds, payments };
}
