import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {DayClosing} from "@/api/model/day_closing.ts";
import {Button} from "@/components/common/input/button.tsx";
import {cn, toRecordId, withCurrency} from "@/lib/utils.ts";
import {toLuxonDateTime, toSurrealDateTime} from "@/lib/datetime.ts";

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    selectedDate: params.get("date") || params.get("start") || "",
    shiftId: params.get("shift") || "",
  };
};

const toRecordString = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
};

type TransactionRow = {
  orderId: string;
  invoiceNumber: number | string;
  createdAt: unknown;
  paymentTypeName: string;
  amount: number;
};

const closingTabLabel = (closing: DayClosing, t: (key: string) => string) => {
  const shiftName = closing.shift?.name || t('labels.noShift');
  const time = closing.date_from ? toLuxonDateTime(closing.date_from).toFormat("HH:mm") : "";
  return `${shiftName}${time ? ` (${time})` : ""}`;
};

export const CashClosingReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [closings, setClosings] = useState<DayClosing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {selectedDate, shiftId: filterShiftId} = useMemo(parseFilters, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions = [
          `time::format(date_from, "${import.meta.env.VITE_DB_DATABASE_DATE_FORMAT}") = $selectedDate`,
        ];
        const params: Record<string, unknown> = {selectedDate};
        if (filterShiftId) {
          conditions.push(`shift = $shiftId`);
          params.shiftId = toRecordId(filterShiftId);
        }

        const [rows] = await queryRef.current(
          `
            SELECT * FROM ${Tables.closings}
            WHERE ${conditions.join(" AND ")}
            ORDER BY date_from ASC, created_at ASC
            FETCH closed_by, opened_by, shift
          `,
          params
        );

        const list = (Array.isArray(rows) ? rows : []) as DayClosing[];
        setClosings(list);
        setSelectedId(list.length > 0 ? toRecordString(list[0].id) : null);
      } catch (err) {
        console.error("Failed to load cash closing report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [selectedDate, filterShiftId]);

  const closing = useMemo(
    () => closings.find((item) => toRecordString(item.id) === selectedId) || null,
    [closings, selectedId],
  );

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!closing?.date_from || !closing?.date_to) {
        setTransactions([]);
        return;
      }

      try {
        setTransactionsLoading(true);
        const shiftId = closing.shift?.id ? toRecordString(closing.shift.id) : null;
        const [rows] = await queryRef.current(
          `
            SELECT id, invoice_number, created_at, payments
            FROM ${Tables.orders}
            WHERE created_at >= $start
              AND created_at <= $end
              AND status = 'Paid'
              ${shiftId ? `AND (cashier.user_shift = $shiftId OR user.user_shift = $shiftId)` : ""}
            ORDER BY created_at ASC
            FETCH payments, payments.payment_type
          `,
          {
            start: toSurrealDateTime(closing.date_from),
            end: toSurrealDateTime(closing.date_to),
            ...(shiftId ? {shiftId: toRecordId(shiftId)} : {}),
          },
        );

        const orders = (Array.isArray(rows) ? rows : []) as Array<{
          id: unknown;
          invoice_number: number;
          created_at: unknown;
          payments?: Array<{ amount?: number; payment_type?: { name?: string } }>;
        }>;

        const flattened: TransactionRow[] = [];
        for (const order of orders) {
          const payments = Array.isArray(order.payments) ? order.payments : [];
          if (payments.length === 0) continue;
          for (const payment of payments) {
            flattened.push({
              orderId: toRecordString(order.id),
              invoiceNumber: order.invoice_number,
              createdAt: order.created_at,
              paymentTypeName: payment.payment_type?.name || "-",
              amount: Number(payment.amount || 0),
            });
          }
        }

        setTransactions(flattened);
      } catch (err) {
        console.error("Failed to load closing transactions", err);
        setTransactions([]);
      } finally {
        setTransactionsLoading(false);
      }
    };

    void fetchTransactions();
  }, [closing?.id, closing?.date_from, closing?.date_to, closing?.shift?.id]);

  const subtitle = [
    selectedDate || "Selected day",
    filterShiftId && closings[0]?.shift?.name ? closings[0].shift.name : null,
    !filterShiftId && closings.length > 1
      ? t('labels.closingsCount', { count: closings.length, defaultValue: `${closings.length} closings` })
      : null,
  ].filter(Boolean).join(" · ");
  const openingBalance = Number((closing as any)?.previous_day_balance ?? closing?.opening_balance ?? 0);
  const totalCash = Number((closing?.terminal_cash || []).reduce((sum, item: any) => sum + Number(item?.cash_amount || 0), 0));
  const totalOtherPayments = Number((closing?.payments_data || [])
    .filter((item: any) => String(item?.payment_type?.type || "").toLowerCase() !== "cash")
    .reduce((sum, item: any) => sum + Number(item?.amount || 0), 0));
  const totalExpenses = Number(closing?.expenses || 0);
  const closingBalance = Number(closing?.closing_balance || 0);
  const drawerFloat = Number((closing as any)?.drawer_float ?? closingBalance);
  const cashDrop = Number((closing as any)?.cash_withdrawn ?? (closing as any)?.cash_withdraw ?? 0);
  const varianceReason = String((closing as any)?.variance_reason || "");
  const batchTotals = Array.isArray((closing as any)?.batch_totals) ? (closing as any).batch_totals : [];
  const shiftRecap = (closing as any)?.shift_recap as Record<string, number> | undefined;
  const closedBy = closing?.closed_by as { first_name?: string; last_name?: string; login?: string } | undefined;
  const closedByName = closedBy
    ? ([closedBy.first_name, closedBy.last_name].filter(Boolean).join(" ").trim() || closedBy.login || "")
    : "";
  const transactionsTotal = transactions.reduce((sum, row) => sum + row.amount, 0);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.cashClosing')} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">{t('loading.cashClosing')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.cashClosing')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  if (closings.length === 0) {
    return (
      <ReportsLayout title={t('titles.cashClosing')} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">
          {filterShiftId
            ? t('errors.noCashClosingForShift', {
                defaultValue: 'No cash closing found for the selected date and shift.',
              })
            : t('errors.noCashClosing', {
                defaultValue: 'No cash closing found for selected date.',
              })}
        </div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('titles.cashClosing')} subtitle={subtitle}>
      <div className="space-y-6">
        {closings.length > 0 && (
          <div className="space-y-2" data-testid="cash-closing-selector">
            <div className="text-sm font-semibold text-foreground">
              {t('labels.closingsForDay', { defaultValue: 'Closings for this day' })}
            </div>
            <div className="flex flex-wrap gap-2">
              {closings.map((item) => {
                const id = toRecordString(item.id);
                const isSelected = id === selectedId;
                return (
                  <Button
                    key={id}
                    type="button"
                    flat
                    variant={isSelected ? "primary" : "secondary"}
                    onClick={() => setSelectedId(id)}
                    className={cn(
                      "px-4 py-2 rounded-lg border text-sm font-medium",
                      !isSelected && "bg-surface-elevated border-border text-foreground"
                    )}
                  >
                    {closingTabLabel(item, t)}
                    <span className="ml-2 text-xs opacity-75 capitalize">({item.status || "-"})</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {closing && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4 bg-surface">
                <div className="text-sm text-muted">{t('labels.shift')}</div>
                <div className="text-xl font-semibold">{closing.shift?.name || t('labels.noShift')}</div>
              </div>
              <div className="border rounded-lg p-4 bg-surface">
                <div className="text-sm text-muted">{t('labels.previousFloat')}</div>
                <div className="text-xl font-semibold">{withCurrency(openingBalance)}</div>
              </div>
              <div className="border rounded-lg p-4 bg-surface">
                <div className="text-sm text-muted">{t('labels.countedCash')}</div>
                <div className="text-xl font-semibold">{withCurrency(totalCash)}</div>
              </div>
              <div className="border rounded-lg p-4 bg-surface">
                <div className="text-sm text-muted">{t('labels.cashDrop')}</div>
                <div className="text-xl font-semibold">{withCurrency(cashDrop)}</div>
              </div>
              <div className="border rounded-lg p-4 bg-surface">
                <div className="text-sm text-muted">{t('labels.cashAdded')}</div>
                <div className="text-xl font-semibold">{withCurrency(Number(closing.cash_added || 0))}</div>
              </div>
              <div className="border rounded-lg p-4 bg-surface">
                <div className="text-sm text-muted">{t('columns.expenses')}</div>
                <div className="text-xl font-semibold">{withCurrency(totalExpenses)}</div>
              </div>
              <div className="border rounded-lg p-4 bg-surface">
                <div className="text-sm text-muted">{t('labels.drawerFloat')}</div>
                <div className="text-xl font-semibold">{withCurrency(drawerFloat)}</div>
              </div>
              <div className="border rounded-lg p-4 bg-surface">
                <div className="text-sm text-muted">Other payments</div>
                <div className="text-xl font-semibold">{withCurrency(totalOtherPayments)}</div>
              </div>
              {closedByName && (
                <div className="border rounded-lg p-4 bg-surface">
                  <div className="text-sm text-muted">{t('labels.closedBy')}</div>
                  <div className="text-xl font-semibold">{closedByName}</div>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <table className="min-w-full divide-y divide-neutral-200">
                <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                  <tr>
                    <td className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">{t('filters.status')}</td>
                    <td className="py-3 pr-6 text-sm text-foreground capitalize">{closing.status || "-"}</td>
                  </tr>
                  <tr>
                    <td className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">{t('labels.shift')}</td>
                    <td className="py-3 pr-6 text-sm text-foreground">{closing.shift?.name || t('labels.noShift')}</td>
                  </tr>
                  <tr>
                    <td className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">Window</td>
                    <td className="py-3 pr-6 text-sm text-foreground">
                      {toLuxonDateTime(closing.date_from).toFormat("yyyy-LL-dd HH:mm")} - {toLuxonDateTime(closing.date_to).toFormat("yyyy-LL-dd HH:mm")}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">Created at</td>
                    <td className="py-3 pr-6 text-sm text-foreground">
                      {toLuxonDateTime(closing.created_at).toFormat("yyyy-LL-dd HH:mm")}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">Closed at</td>
                    <td className="py-3 pr-6 text-sm text-foreground">
                      {closing.closed_at ? toLuxonDateTime(closing.closed_at).toFormat("yyyy-LL-dd HH:mm") : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">Notes</td>
                    <td className="py-3 pr-6 text-sm text-foreground">{closing.notes || "-"}</td>
                  </tr>
                  {varianceReason && (
                    <tr>
                      <td className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">{t('labels.varianceReason')}</td>
                      <td className="py-3 pr-6 text-sm text-foreground">{varianceReason}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {batchTotals.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">{t('labels.batchTotals')}</h3>
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-surface">
                    <tr>
                      <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold">{t('columns.paymentMethod')}</th>
                      <th className="py-3 px-3 text-right text-xs font-semibold">{t('labels.systemAmount')}</th>
                      <th className="py-3 px-3 text-right text-xs font-semibold">{t('labels.batchAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                    {batchTotals.map((row: any, index: number) => (
                      <tr key={`${row.payment_type_id}_${index}`}>
                        <td className="py-3 pl-6 pr-3 text-sm">{row.payment_type_name || "-"}</td>
                        <td className="py-3 px-3 text-right text-sm">{withCurrency(Number(row.system_amount || 0))}</td>
                        <td className="py-3 px-3 text-right text-sm">{withCurrency(Number(row.batch_amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {shiftRecap && (
              <div className="overflow-hidden rounded-lg border border-border">
                <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">{t('labels.shiftRecap')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                  <div><div className="text-xs text-muted">{t('labels.paidOrders')}</div><div className="font-semibold">{Number(shiftRecap.paid_orders || 0)}</div></div>
                  <div><div className="text-xs text-muted">{t('labels.discounts')}</div><div className="font-semibold">{withCurrency(Number(shiftRecap.discounts || 0))}</div></div>
                  <div><div className="text-xs text-muted">{t('columns.tax')}</div><div className="font-semibold">{withCurrency(Number(shiftRecap.tax || 0))}</div></div>
                  <div><div className="text-xs text-muted">{t('labels.serviceCharge')}</div><div className="font-semibold">{withCurrency(Number(shiftRecap.service_charge || 0))}</div></div>
                  <div><div className="text-xs text-muted">{t('labels.tips')}</div><div className="font-semibold">{withCurrency(Number(shiftRecap.tips || 0))}</div></div>
                  <div><div className="text-xs text-muted">{t('labels.voids')}</div><div className="font-semibold">{withCurrency(Number(shiftRecap.voids || 0))}</div></div>
                  <div><div className="text-xs text-muted">{t('labels.refunds')}</div><div className="font-semibold">{Number(shiftRecap.refunds || 0)}</div></div>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-border">
              <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">Terminal cash</h3>
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-surface">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">Terminal</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                  {(closing.terminal_cash || []).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-sm text-muted">No terminal cash data</td>
                    </tr>
                  ) : (
                    (closing.terminal_cash || []).map((terminal: any, index) => (
                      <tr key={toRecordString(terminal?.terminal_id) || String(index)}>
                        <td className="py-3 pl-6 pr-3 text-sm text-foreground">{terminal?.terminal_name || "Terminal"}</td>
                        <td className="py-3 px-3 text-right text-sm text-foreground">{withCurrency(Number(terminal?.cash_amount || 0))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">Payment summary</h3>
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-surface">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">Payment type</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                  {(closing.payments_data || []).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-sm text-muted">No payment summary data</td>
                    </tr>
                  ) : (
                    (closing.payments_data || []).map((payment: any, index) => (
                      <tr key={`${toRecordString(payment?.payment_type?.id || payment?.payment_type)}_${index}`}>
                        <td className="py-3 pl-6 pr-3 text-sm text-foreground">
                          {payment?.payment_type?.name || toRecordString(payment?.payment_type) || "Unknown"}
                        </td>
                        <td className="py-3 px-3 text-right text-sm text-foreground">{withCurrency(Number(payment?.amount || 0))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">{t('labels.transactions')}</h3>
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-surface">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">{t('columns.invoice')}</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.time')}</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.paymentMethod')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                  {transactionsLoading ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-muted">{t('loading.cashClosing')}</td>
                    </tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-muted">No transactions in this closing</td>
                    </tr>
                  ) : (
                    transactions.map((row, index) => (
                      <tr key={`${row.orderId}_${index}`}>
                        <td className="py-3 pl-6 pr-3 text-sm text-foreground">#{row.invoiceNumber}</td>
                        <td className="py-3 px-3 text-sm text-foreground">
                          {toLuxonDateTime(row.createdAt as any).toFormat("HH:mm")}
                        </td>
                        <td className="py-3 px-3 text-sm text-foreground">{row.paymentTypeName}</td>
                        <td className="py-3 px-3 text-right text-sm text-foreground">{withCurrency(row.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {transactions.length > 0 && (
                  <tfoot className="bg-surface">
                    <tr>
                      <td colSpan={3} className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">Total</td>
                      <td className="py-3 px-3 text-right text-sm font-bold text-foreground">{withCurrency(transactionsTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">{t('columns.expenses')}</h3>
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-surface">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">{t('columns.description')}</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.category')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                  {(closing.expenses_data || []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-sm text-muted">No expense records</td>
                    </tr>
                  ) : (
                    (closing.expenses_data || []).map((expense: any, index) => (
                      <tr key={toRecordString(expense?.id) || String(index)}>
                        <td className="py-3 pl-6 pr-3 text-sm text-foreground">{expense?.description || "-"}</td>
                        <td className="py-3 px-3 text-sm text-foreground">{expense?.category || "-"}</td>
                        <td className="py-3 px-3 text-right text-sm text-foreground">{withCurrency(Number(expense?.amount || 0))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {(closing.expenses_data || []).length > 0 && (
                  <tfoot className="bg-surface">
                    <tr>
                      <td colSpan={2} className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">Total expenses</td>
                      <td className="py-3 px-3 text-right text-sm font-bold text-foreground">{withCurrency(totalExpenses)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </ReportsLayout>
  );
};
