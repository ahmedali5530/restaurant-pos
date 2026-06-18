import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";
import {KitchenReconciliationStatus} from "@/api/model/kitchen_reconciliation.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {computeLine, computeTotals} from "@/lib/kitchen/reconciliation.calculations.ts";
import {listKitchenReconciliationsForReport} from "@/lib/kitchen/reconciliation.service.ts";
import {formatNumber} from "@/lib/utils.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {Tables} from "@/api/db/tables.ts";

const toFullRecordIdString = (value: unknown, table: string): string => {
  if (!value) return "";
  const raw =
    typeof value === "object" && value !== null && "toString" in value
      ? (value as {toString(): string}).toString()
      : typeof value === "string"
        ? value
        : String(value);
  return raw.includes(":") ? raw : `${table}:${raw}`;
};

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  kitchenIds: string[];
  statusIds: KitchenReconciliationStatus[];
  itemIds: string[];
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);
  const parseMulti = (name: string) => {
    return [...params.getAll(`${name}[]`), ...params.getAll(name)].filter(Boolean) as string[];
  };

  return {
    startDate: params.get("start"),
    endDate: params.get("end"),
    kitchenIds: parseMulti("kitchens"),
    statusIds: parseMulti("statuses") as KitchenReconciliationStatus[],
    itemIds: parseMulti("items"),
  };
};

const formatUserName = (user?: {first_name?: string; last_name?: string; login?: string}) => {
  if (!user) return "—";
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || user.login || "—";
};

export const KitchenReconciliationReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const dbRef = useRef(db);
  const [reconciliations, setReconciliations] = useState<KitchenReconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle =
    filters.startDate && filters.endDate
      ? `${filters.startDate} to ${filters.endDate}`
      : undefined;

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        let rows = await listKitchenReconciliationsForReport(dbRef.current, {
          startDate: filters.startDate,
          endDate: filters.endDate,
          kitchenIds: filters.kitchenIds.length > 0 ? filters.kitchenIds : undefined,
          statuses: filters.statusIds.length > 0 ? filters.statusIds : undefined,
        });

        if (filters.itemIds.length > 0) {
          const itemIdSet = new Set(
            filters.itemIds.map((id) => toFullRecordIdString(id, Tables.inventory_items))
          );
          rows = rows
            .map((reconciliation) => ({
              ...reconciliation,
              items: reconciliation.items?.filter((line) => {
                const itemId = toFullRecordIdString(line.item?.id ?? line.item, Tables.inventory_items);
                return itemIdSet.has(itemId);
              }),
            }))
            .filter((reconciliation) => (reconciliation.items?.length ?? 0) > 0);
        }

        setReconciliations(rows);
      } catch (err) {
        console.error("Failed to load kitchen reconciliation report:", err);
        setError(err instanceof Error ? err.message : t("errors.unableToLoad"));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [
    filters.startDate,
    filters.endDate,
    filters.kitchenIds,
    filters.statusIds,
    filters.itemIds,
    t,
  ]);

  const headerRows = useMemo(() => {
    return reconciliations.map((reconciliation) => {
      const computedLines = (reconciliation.items ?? []).map((line) =>
        computeLine({
          openingStock: line.opening_stock,
          issuedQty: line.issued_qty,
          transfersIn: line.transfers_in,
          transfersOut: line.transfers_out,
          theoreticalConsumption: line.theoretical_consumption,
          physicalCount: line.physical_count ?? null,
          wasteQty: line.waste_qty,
          staffMealQty: line.staff_meal_qty,
          complimentaryQty: line.complimentary_qty,
        })
      );
      const totals = computeTotals(computedLines);
      const dateFrom = toLuxonDateTime(reconciliation.date_from).toFormat(
        import.meta.env.VITE_DATE_FORMAT
      );
      const dateTo = toLuxonDateTime(reconciliation.date_to).toFormat(
        import.meta.env.VITE_DATE_FORMAT
      );

      return {
        kitchen: reconciliation.kitchen?.name ?? "—",
        businessDate: reconciliation.business_date,
        status: reconciliation.status,
        revision: reconciliation.revision,
        window: `${dateFrom} – ${dateTo}`,
        verifiedBy: formatUserName(reconciliation.verified_by),
        verifiedAt: reconciliation.verified_at
          ? toLuxonDateTime(reconciliation.verified_at).toFormat(import.meta.env.VITE_DATE_FORMAT)
          : "—",
        lineCount: totals.lineCount,
        totalVariance: totals.totalVariance,
        linesWithVariance: totals.linesWithVariance,
      };
    });
  }, [reconciliations]);

  const detailRows = useMemo(() => {
    return reconciliations.flatMap((reconciliation) => {
      const kitchenName = reconciliation.kitchen?.name ?? "—";
      return (reconciliation.items ?? []).map((line) => {
        const computed = computeLine({
          openingStock: line.opening_stock,
          issuedQty: line.issued_qty,
          transfersIn: line.transfers_in,
          transfersOut: line.transfers_out,
          theoreticalConsumption: line.theoretical_consumption,
          physicalCount: line.physical_count ?? null,
          wasteQty: line.waste_qty,
          staffMealQty: line.staff_meal_qty,
          complimentaryQty: line.complimentary_qty,
        });
        const itemId = recordToString(line.item?.id ?? line.item);

        return {
          kitchen: kitchenName,
          businessDate: reconciliation.business_date,
          status: reconciliation.status,
          itemCode: line.item?.code ?? "—",
          itemName: line.item?.name ?? itemId,
          opening: computed.openingStock,
          issued: computed.issuedQty,
          transfersIn: computed.transfersIn,
          transfersOut: computed.transfersOut,
          theoretical: computed.theoreticalConsumption,
          expected: computed.expectedStock,
          physical: line.physical_count ?? null,
          waste: computed.wasteQty,
          staffMeal: computed.staffMealQty,
          complimentary: computed.complimentaryQty,
          actualConsumption: computed.actualConsumption,
          variance: computed.variance,
        };
      });
    });
  }, [reconciliations]);

  const summary = useMemo(() => {
    const verifiedCount = reconciliations.filter((r) => r.status === "verified").length;
    const draftCount = reconciliations.filter((r) => r.status === "draft").length;
    const missedCount = reconciliations.filter((r) => r.status === "missed").length;
    const totals = headerRows.reduce(
      (acc, row) => ({
        totalVariance: acc.totalVariance + row.totalVariance,
        linesWithVariance: acc.linesWithVariance + row.linesWithVariance,
        lineCount: acc.lineCount + row.lineCount,
      }),
      {totalVariance: 0, linesWithVariance: 0, lineCount: 0}
    );

    return {
      reconciliationCount: reconciliations.length,
      verifiedCount,
      draftCount,
      missedCount,
      ...totals,
    };
  }, [reconciliations, headerRows]);

  if (loading) {
    return (
      <ReportsLayout title={t("titles.kitchenReconciliation")} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">
          {t("loading.kitchenReconciliation")}
        </div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t("titles.kitchenReconciliation")} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">
          {t("errors.failedToLoad", {error})}
        </div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t("titles.kitchenReconciliation")} subtitle={subtitle}>
      <div className="space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t("labels.kitchenReconciliationCount")}</p>
            <p className="text-2xl font-bold text-neutral-900">
              {formatNumber(summary.reconciliationCount)}
            </p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t("labels.kitchenReconciliationVerified")}</p>
            <p className="text-2xl font-bold text-neutral-900">
              {formatNumber(summary.verifiedCount)}
            </p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t("labels.kitchenReconciliationDraft")}</p>
            <p className="text-2xl font-bold text-neutral-900">
              {formatNumber(summary.draftCount)}
            </p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t("labels.kitchenReconciliationMissed")}</p>
            <p className="text-2xl font-bold text-neutral-900">
              {formatNumber(summary.missedCount)}
            </p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t("labels.kitchenReconciliationTotalVariance")}</p>
            <p className="text-2xl font-bold text-neutral-900">
              {formatNumber(summary.totalVariance)}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">
            {t("labels.kitchenReconciliationHeaders")}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t("filters.kitchen")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("labels.businessDate")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("filters.status")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("labels.revision")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("labels.operationalWindow")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("labels.verifiedBy")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("labels.verifiedAt")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.lineCount")}</th>
                  <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t("labels.totalVariance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {headerRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-sm text-neutral-500">
                      {t("labels.kitchenReconciliationNoResults")}
                    </td>
                  </tr>
                ) : (
                  headerRows.map((row, index) => (
                    <tr key={index}>
                      <td className="py-3 pl-6 pr-3 text-sm">{row.kitchen}</td>
                      <td className="py-3 px-3 text-sm">{row.businessDate}</td>
                      <td className="py-3 px-3 text-sm uppercase">{row.status}</td>
                      <td className="py-3 px-3 text-sm">{row.revision}</td>
                      <td className="py-3 px-3 text-sm whitespace-nowrap">{row.window}</td>
                      <td className="py-3 px-3 text-sm">{row.verifiedBy}</td>
                      <td className="py-3 px-3 text-sm">{row.verifiedAt}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.lineCount)}</td>
                      <td className="py-3 pr-6 text-sm text-right">{formatNumber(row.totalVariance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">
            {t("labels.kitchenReconciliationDetails")}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t("filters.kitchen")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("labels.businessDate")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("filters.status")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.code")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.name")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.opening")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.issued")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.transfersIn")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.transfersOut")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.theoretical")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.expected")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.physical")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.waste")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.staffMeal")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.complimentary")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("labels.actualConsumption")}</th>
                  <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t("labels.variance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {detailRows.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="py-6 text-center text-sm text-neutral-500">
                      {t("labels.kitchenReconciliationNoResults")}
                    </td>
                  </tr>
                ) : (
                  detailRows.map((row, index) => (
                    <tr key={index}>
                      <td className="py-3 pl-6 pr-3 text-sm">{row.kitchen}</td>
                      <td className="py-3 px-3 text-sm">{row.businessDate}</td>
                      <td className="py-3 px-3 text-sm uppercase">{row.status}</td>
                      <td className="py-3 px-3 text-sm">{row.itemCode}</td>
                      <td className="py-3 px-3 text-sm">{row.itemName}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.opening)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.issued)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.transfersIn)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.transfersOut)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.theoretical)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.expected)}</td>
                      <td className="py-3 px-3 text-sm text-right">
                        {row.physical == null ? "—" : formatNumber(row.physical)}
                      </td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.waste)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.staffMeal)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.complimentary)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.actualConsumption)}</td>
                      <td className="py-3 pr-6 text-sm text-right">{formatNumber(row.variance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ReportsLayout>
  );
};
