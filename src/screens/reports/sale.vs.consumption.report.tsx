import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {formatInventoryNumber, withInventoryCurrency} from "@/lib/inventory/rounding.ts";
import {formatInventoryItemLabel} from "@/lib/inventory/item.label.ts";
import {
  getSaleVsConsumptionReport,
  type SaleVsConsumptionItemRow,
} from "@/api/reports/inventory/consumption.ts";

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);
  return {
    startDate: params.get("start") || params.get("start"),
    endDate: params.get("end") || params.get("end"),
  };
};

type ReportData = Awaited<ReturnType<typeof getSaleVsConsumptionReport>>;

export const SaleVsConsumptionReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const queryRef = useRef(db.query);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);

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

        const report = await getSaleVsConsumptionReport(
          {query: (...args) => queryRef.current(...args)},
          {
            startDate: filters.startDate ?? undefined,
            endDate: filters.endDate ?? undefined,
          },
        );

        setData(report);
      } catch (err) {
        console.error("Failed to load sale vs consumption report:", err);
        setError(err instanceof Error ? err.message : t("errors.unableToLoad"));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.startDate, filters.endDate, t]);

  if (loading) {
    return (
      <ReportsLayout title={t("titles.saleVsConsumption")} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">{t("loading.generic")}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t("titles.saleVsConsumption")} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t("errors.failedToLoad", {error})}</div>
      </ReportsLayout>
    );
  }

  if (!data) {
    return (
      <ReportsLayout title={t("titles.saleVsConsumption")} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">{t("empty.noData")}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t("titles.saleVsConsumption")}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        <div className="overflow-hidden rounded-lg border border-border">
          <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">
            {t("labels.saleVsConsumption")}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">{t("columns.metric")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.saleTotal")}</td>
                  <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(data.saleTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.consumptionTotal")}</td>
                  <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(data.consumptionTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.estimatedProfit")}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.consumptionProfit >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {withInventoryCurrency(data.consumptionProfit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.profitPercent")}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.consumptionProfitPercent >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {formatInventoryNumber(data.consumptionProfitPercent)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">
            {t("labels.saleVsIssuance")}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">{t("columns.metric")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.saleTotal")}</td>
                  <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(data.saleTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.issuanceTotal")}</td>
                  <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(data.issuanceTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.estimatedProfit")}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.issuanceProfit >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {withInventoryCurrency(data.issuanceProfit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.profitPercent")}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.issuanceProfitPercent >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {formatInventoryNumber(data.issuanceProfitPercent)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">
            {t("labels.saleVsPurchase")}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">{t("columns.metric")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.saleTotal")}</td>
                  <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(data.saleTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.purchaseTotal")}</td>
                  <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(data.purchaseTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.estimatedProfit")}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.purchaseProfit >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {withInventoryCurrency(data.purchaseProfit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-foreground">{t("labels.profitPercent")}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.purchaseProfitPercent >= 0 ? "text-success-600" : "text-danger-600"}`}>
                    {formatInventoryNumber(data.purchaseProfitPercent)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">
            {t("labels.byItem")}
          </h3>
          <p className="border-b border-border bg-surface px-6 py-2 text-xs text-muted">
            {t("labels.qtyVarianceHelp")}
          </p>
          {data.byItem.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">{t("empty.noItemActivity")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-surface">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">{t("columns.itemName")}</th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t("columns.uom")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.purchasedQty")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.purchasedCost")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.issuedQty")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.issuedCost")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.consumedQty")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.consumedCost")}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t("columns.qtyVariance")}</th>
                    <th className="py-3 pr-6 pl-3 text-right text-xs font-semibold text-foreground">{t("columns.costVariance")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                  {data.byItem.map((row: SaleVsConsumptionItemRow) => (
                    <tr key={row.itemId}>
                      <td className="py-3 pl-6 pr-3 text-sm text-foreground">
                        {formatInventoryItemLabel(row.name, row.code)}
                      </td>
                      <td className="py-3 px-3 text-sm text-muted">{row.uom || "—"}</td>
                      <td className="py-3 px-3 text-right text-sm text-foreground">{formatInventoryNumber(row.purchasedQty)}</td>
                      <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(row.purchasedCost)}</td>
                      <td className="py-3 px-3 text-right text-sm text-foreground">{formatInventoryNumber(row.issuedQty)}</td>
                      <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(row.issuedCost)}</td>
                      <td className="py-3 px-3 text-right text-sm text-foreground">{formatInventoryNumber(row.consumedQty)}</td>
                      <td className="py-3 px-3 text-right text-sm text-foreground">{withInventoryCurrency(row.consumedCost)}</td>
                      <td className={`py-3 px-3 text-right text-sm font-medium ${row.qtyVariance > 0 ? "text-warning-600" : row.qtyVariance < 0 ? "text-info-600" : "text-foreground"}`}>
                        {formatInventoryNumber(row.qtyVariance)}
                      </td>
                      <td className={`py-3 pr-6 pl-3 text-right text-sm font-medium ${row.costVariance > 0 ? "text-warning-600" : row.costVariance < 0 ? "text-info-600" : "text-foreground"}`}>
                        {withInventoryCurrency(row.costVariance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ReportsLayout>
  );
};
