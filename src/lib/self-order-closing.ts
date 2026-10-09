/**
 * QR self-orders in closings.
 *
 * Guests pay QR orders online (Stripe / PayPal) — that money never passes
 * through a till drawer or card terminal. Closings therefore keep them out of
 * the POS totals and report them in their own section. The gateway tags every
 * QR order `QR Order` (and `Test Payment` when paid in test mode).
 */

import {Tables} from "@/api/db/tables.ts";
import {OrderStatus} from "@/api/model/order.ts";
import {toSurrealDateTime} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";

export const QR_ORDER_TAG = "QR Order";
export const TEST_PAYMENT_TAG = "Test Payment";

/** SQL filter fragments for `order` rows. */
export const EXCLUDE_QR_ORDERS_SQL = `AND '${QR_ORDER_TAG}' NOTINSIDE (tags ?? [])`;
export const ONLY_QR_ORDERS_SQL = `AND (tags ?? []) CONTAINS '${QR_ORDER_TAG}'`;

export const isQrOrder = (tags: unknown): boolean =>
  Array.isArray(tags) && tags.includes(QR_ORDER_TAG);

export interface SelfOrderClosingRow {
  orderId: string;
  invoiceNumber: number | string;
  createdAt: unknown;
  table: string;
  paymentTypeName: string;
  amount: number;
  isTest: boolean;
}

export interface SelfOrderClosingSummary {
  orders: number;
  total: number;
  tax: number;
  test_orders: number;
  test_total: number;
  by_payment_type: Array<{ payment_type_id: string; payment_type_name: string; amount: number }>;
}

type DbLike = { query: (sql: string, vars?: Record<string, unknown>) => Promise<any> };

export async function fetchSelfOrderClosing(
  db: DbLike,
  window: { date_from: Date | unknown; date_to: Date | unknown },
): Promise<{ summary: SelfOrderClosingSummary; rows: SelfOrderClosingRow[] }> {
  const [result] = await db.query(
    `
      SELECT id, invoice_number, invoice_display, created_at, tags, tax_amount,
             table.name AS table_name, table.number AS table_number, payments
      FROM ${Tables.orders}
      WHERE created_at >= $start
        AND created_at <= $end
        AND status = $paid
        ${ONLY_QR_ORDERS_SQL}
      ORDER BY created_at ASC
      FETCH payments, payments.payment_type
    `,
    {
      start: toSurrealDateTime(window.date_from as Date),
      end: toSurrealDateTime(window.date_to as Date),
      paid: OrderStatus.Paid,
    },
  );

  const orders = (Array.isArray(result) ? result : []) as any[];
  const rows: SelfOrderClosingRow[] = [];
  const byType = new Map<string, { payment_type_id: string; payment_type_name: string; amount: number }>();
  const summary: SelfOrderClosingSummary = {
    orders: orders.length,
    total: 0,
    tax: 0,
    test_orders: 0,
    test_total: 0,
    by_payment_type: [],
  };

  for (const order of orders) {
    const isTest = Array.isArray(order.tags) && order.tags.includes(TEST_PAYMENT_TAG);
    const payments = Array.isArray(order.payments) ? order.payments : [];
    const orderTotal = payments.reduce((sum: number, p: any) => sum + safeNumber(p?.amount), 0);
    summary.total += orderTotal;
    summary.tax += safeNumber(order.tax_amount);
    if (isTest) {
      summary.test_orders += 1;
      summary.test_total += orderTotal;
    }
    const table = order.table_number || order.table_name || "";
    for (const payment of payments) {
      const typeId = String(payment?.payment_type?.id ?? payment?.payment_type ?? "");
      const typeName = String(payment?.payment_type?.name ?? "-");
      const amount = safeNumber(payment?.amount);
      const entry = byType.get(typeId) ?? { payment_type_id: typeId, payment_type_name: typeName, amount: 0 };
      entry.amount += amount;
      byType.set(typeId, entry);
      rows.push({
        orderId: String(order.id),
        invoiceNumber: order.invoice_display ?? order.invoice_number,
        createdAt: order.created_at,
        table: String(table),
        paymentTypeName: typeName,
        amount,
        isTest,
      });
    }
  }

  summary.by_payment_type = [...byType.values()];
  return { summary, rows };
}
