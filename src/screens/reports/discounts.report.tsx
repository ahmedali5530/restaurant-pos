import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {OrderDiscount} from "@/api/model/order_discount.ts";
import {DiscountReason} from "@/api/model/discount_reason.ts";
import {User} from "@/api/model/user.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {
  aggregateOrderDiscountBreakdown,
  getInvoiceNumber,
} from "@/lib/order.ts";
import {buildRecordInsideCondition} from "@/api/reports/shared/query.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeOrderId = (value: unknown): string => {
  const full = recordIdToString(value);
  if (!full) {
    return "";
  }
  return full.includes(":") ? full.split(":").slice(1).join(":") : full;
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    startDate: params.get("start") || "",
    endDate: params.get("end") || "",
    discountId: params.get("discount_id") || "",
  };
};

const formatPersonName = (person?: User | string | null): string => {
  if (!person) {
    return "-";
  }
  if (typeof person === "string") {
    return person.includes(":") ? "-" : person;
  }
  const full = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  return full || person.login || "-";
};

const formatReason = (line: Pick<OrderDiscount, "reason" | "reason_text">): string => {
  const reasonRef = line.reason;
  let reasonLabel = "";

  if (reasonRef && typeof reasonRef === "object" && "name" in reasonRef) {
    reasonLabel = String((reasonRef as DiscountReason).name ?? "").trim();
  } else if (typeof reasonRef === "string" && reasonRef && !reasonRef.includes(":")) {
    reasonLabel = reasonRef.trim();
  }

  const reasonText = typeof line.reason_text === "string" ? line.reason_text.trim() : "";
  const parts = [reasonLabel, reasonText].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : "-";
};

const formatValueType = (line: {
  value_type?: string | null;
  applied_rate?: number | null;
}): string => {
  const rate = safeNumber(line.applied_rate);
  const valueType = line.value_type || "";

  if (valueType === "percent") {
    return rate > 0 ? `${formatNumber(rate)}%` : "Percent";
  }
  if (valueType === "fixed_amount") {
    return rate > 0 ? withCurrency(rate) : "Fixed amount";
  }
  if (valueType === "fixed_price") {
    return rate > 0 ? withCurrency(rate) : "Fixed price";
  }
  if (rate > 0) {
    return `${formatNumber(rate)}%`;
  }
  return "-";
};

interface DiscountDetailRow {
  key: string;
  orderId: string;
  createdAt: Order["created_at"] | OrderDiscount["created_at"];
  invoiceLabel: string;
  cashierName: string;
  discountName: string;
  scope: string;
  valueTypeLabel: string;
  amount: number;
  applicationType: string;
  reason: string;
  appliedBy: string;
  approvedBy: string;
}

const getOrderFromLine = (line: OrderDiscount): Order | null => {
  const orderRef = line.order;
  if (!orderRef || typeof orderRef !== "object") {
    return null;
  }
  // RecordId has tb/id but no invoice_number — treat as unresolved.
  if (!("invoice_number" in orderRef) && !("status" in orderRef) && !("cashier" in orderRef)) {
    return null;
  }
  return orderRef as Order;
};

const getLineOrderId = (line: OrderDiscount): string => {
  const order = getOrderFromLine(line);
  if (order?.id) {
    return normalizeOrderId(order.id);
  }
  return normalizeOrderId(line.order);
};

const getCashierName = (order?: Order | null): string => {
  if (!order) {
    return "-";
  }
  const cashier = order.cashier as User | undefined;
  const user = order.user as User | undefined;
  return formatPersonName(cashier || user);
};

const buildDetailRows = (lines: OrderDiscount[]): DiscountDetailRow[] => {
  return lines.map((line, index) => {
    const order = getOrderFromLine(line);
    const orderId = getLineOrderId(line) || `unknown-${index}`;
    const invoiceLabel = order?.invoice_number != null
      ? `#${getInvoiceNumber(order)}`
      : orderId;
    const discountRef = line.discount;
    const discountName = line.name
      || (typeof discountRef === "object" && discountRef !== null && "name" in discountRef
        ? String((discountRef as {name?: string}).name ?? "")
        : typeof discountRef === "string" ? discountRef : "Discount");

    return {
      key: line.id?.toString?.() ?? `line-${index}`,
      orderId,
      createdAt: order?.created_at ?? line.created_at,
      invoiceLabel,
      cashierName: getCashierName(order),
      discountName: discountName || "Discount",
      scope: line.scope || "-",
      valueTypeLabel: formatValueType(line),
      amount: safeNumber(line.applied_amount),
      applicationType: line.application_type || "-",
      reason: formatReason(line),
      appliedBy: formatPersonName(line.applied_by),
      approvedBy: formatPersonName(line.approved_by),
    };
  });
};

const groupLinesOntoOrders = (lines: OrderDiscount[]): Order[] => {
  const map = new Map<string, Order>();

  lines.forEach((line) => {
    const order = getOrderFromLine(line);
    if (!order?.id) {
      return;
    }
    const orderId = normalizeOrderId(order.id);
    const existing = map.get(orderId);
    if (existing) {
      existing.order_discounts = [...(existing.order_discounts ?? []), line];
      return;
    }
    map.set(orderId, {...order, order_discounts: [line]});
  });

  return Array.from(map.values());
};

export const DiscountsReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orderDiscounts, setOrderDiscounts] = useState<OrderDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate
    ? `${filters.startDate} to ${filters.endDate}`
    : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions = [
          `(removed_at = NONE or removed_at = null)`,
          `order.status = 'Paid'`,
        ];
        const params: Record<string, any> = {};

        if (filters.startDate) {
          conditions.push(
            `time::format(order.created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`,
          );
          params.startDate = filters.startDate;
        }
        if (filters.endDate) {
          conditions.push(
            `time::format(order.created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`,
          );
          params.endDate = filters.endDate;
        }
        if (filters.discountId) {
          const discountFilter = buildRecordInsideCondition("discount", [filters.discountId], "discountIds");
          if (discountFilter.condition) {
            conditions.push(discountFilter.condition);
            Object.assign(params, discountFilter.params);
          }
        }

        const query = `
          SELECT * FROM ${Tables.order_discounts}
          WHERE ${conditions.join(" AND ")}
          ORDER BY created_at DESC
          FETCH order, order.cashier, order.user, discount, reason, applied_by, approved_by
        `;

        const [result] = await queryRef.current(query, params);
        setOrderDiscounts((result || []) as OrderDiscount[]);
      } catch (err) {
        console.error("Failed to load discounts report", err);
        setError(err instanceof Error ? err.message : t("errors.unableToLoad"));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.discountId, filters.endDate, filters.startDate]);

  const detailRows = useMemo(() => buildDetailRows(orderDiscounts), [orderDiscounts]);

  const summaryOrders = useMemo(
    () => groupLinesOntoOrders(orderDiscounts),
    [orderDiscounts],
  );

  const discountTypes = useMemo(
    () => aggregateOrderDiscountBreakdown(summaryOrders, "name", t("labels.customDiscount")),
    [summaryOrders, t],
  );

  const discountsByUsers = useMemo(
    () => aggregateOrderDiscountBreakdown(summaryOrders, "user", t("labels.customDiscount")),
    [summaryOrders, t],
  );

  const totalDiscount = useMemo(
    () => detailRows.reduce((sum, row) => sum + row.amount, 0),
    [detailRows],
  );

  const orderCount = useMemo(() => {
    const ids = new Set(detailRows.map((row) => row.orderId));
    return ids.size;
  }, [detailRows]);

  if (loading) {
    return (
      <ReportsLayout title={t("titles.discount")} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t("loading.discounts")}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t("titles.discount")} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t("errors.failedToLoad", {error})}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t("titles.discount")} subtitle={subtitle}>
      <div className="space-y-8">
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">{t("categories.orders")}</div>
            <div className="text-xl font-semibold">{formatNumber(orderCount)}</div>
          </div>
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">{t("labels.discountLines")}</div>
            <div className="text-xl font-semibold">{formatNumber(detailRows.length)}</div>
          </div>
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">{t("labels.totalDiscount")}</div>
            <div className="text-xl font-semibold">{withCurrency(totalDiscount)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">
              {t("labels.discountTypes")}
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t("columns.name")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("columns.valueType")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("columns.quantity")}</th>
                    <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t("columns.amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {discountTypes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">
                        {t("empty.noDiscountTypes")}
                      </td>
                    </tr>
                  ) : (
                    discountTypes.map((item) => (
                      <tr key={item.name}>
                        <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{item.name}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{item.rateLabel}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.quantity)}</td>
                        <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">
                          {withCurrency(item.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">
              {t("labels.discountsByUsers")}
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t("columns.user")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("columns.valueType")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("columns.quantity")}</th>
                    <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t("columns.amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {discountsByUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">
                        {t("empty.noDiscountsByUsers")}
                      </td>
                    </tr>
                  ) : (
                    discountsByUsers.map((item) => (
                      <tr key={item.name}>
                        <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{item.name}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{item.rateLabel}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.quantity)}</td>
                        <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">
                          {withCurrency(item.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">
            {t("labels.discountDetails")}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t("columns.date")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.order")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("metrics.cashier")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.discount")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.scope")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("columns.valueType")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("columns.amount")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.applicationType")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.reason")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.appliedBy")}</th>
                  <th className="py-3 pr-6 text-left text-xs font-semibold text-neutral-700">{t("columns.approvedBy")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {detailRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-sm text-neutral-500">
                      {t("empty.noDiscountRows")}
                    </td>
                  </tr>
                ) : (
                  detailRows.map((row) => (
                    <tr key={row.key}>
                      <td className="py-3 pl-6 pr-3 text-sm text-neutral-900 whitespace-nowrap">
                        {toLuxonDateTime(row.createdAt as any).toFormat("yyyy-LL-dd HH:mm")}
                      </td>
                      <td className="py-3 px-3 text-sm text-neutral-700">{row.invoiceLabel}</td>
                      <td className="py-3 px-3 text-sm text-neutral-700">{row.cashierName || "-"}</td>
                      <td className="py-3 px-3 text-sm font-medium text-neutral-900">{row.discountName}</td>
                      <td className="py-3 px-3 text-sm text-neutral-700 capitalize">{row.scope}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{row.valueTypeLabel}</td>
                      <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900">
                        {withCurrency(row.amount)}
                      </td>
                      <td className="py-3 px-3 text-sm text-neutral-700 capitalize">{row.applicationType}</td>
                      <td className="py-3 px-3 text-sm text-neutral-700">{row.reason}</td>
                      <td className="py-3 px-3 text-sm text-neutral-700">{row.appliedBy}</td>
                      <td className="py-3 pr-6 text-sm text-neutral-700">{row.approvedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {detailRows.length > 0 && (
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td colSpan={6} className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-900">
                      {t("columns.total")}
                    </td>
                    <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900">
                      {withCurrency(totalDiscount)}
                    </td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </ReportsLayout>
  );
};
