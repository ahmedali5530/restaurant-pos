import {useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {useTranslation} from "react-i18next";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {ResponsiveLine} from "@nivo/line";
import {DateTime} from "luxon";
import {
  ShoppingCart,
  RotateCcw,
  Package,
  ArrowLeftRight,
  Trash2,
  TrendingUp,
  Factory,
  Utensils,
  SlidersHorizontal,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {TabList, Tabs} from "react-aria-components";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs.tsx";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";
import {listKitchenReconciliationsForReport} from "@/lib/kitchen/reconciliation.service.ts";
import {computeLine, computeTotals} from "@/lib/kitchen/reconciliation.calculations.ts";
import {
  loadInventoryDashboard,
  type InventoryDashboardPayload,
  type LocationStockGroup,
} from "@/api/reports/inventory/dashboard.ts";

type ChartDataPoint = {x: string; y: number};

const COLORS = [
  "#0046FE",
  "#30C6E8",
  "#FFA514",
  "#3DE567",
  "#F43A30",
  "#7C3AED",
  "#0D9488",
  "#DB2777",
  "#64748B",
];

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getReconciliationTotals = (reconciliation: KitchenReconciliation) => {
  const lines = (reconciliation.items ?? []).map((line) =>
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
    }),
  );
  return computeTotals(lines);
};

const personName = (user?: {first_name?: string; last_name?: string} | null) =>
  `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "-";

const KPIMetricWidget = ({
  title,
  value,
  gradientClass,
  borderColor,
  textColor,
  labelColor,
}: {
  title: string;
  value: string;
  gradientClass: string;
  borderColor: string;
  textColor: string;
  labelColor: string;
}) => (
  <div className={`bg-gradient-to-br ${gradientClass} p-4 rounded-lg border ${borderColor}`}>
    <p className={`text-sm font-medium ${labelColor} mb-1`}>{title}</p>
    <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
  </div>
);

const SectionCard = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) => (
  <div className="bg-white p-5 rounded-lg shadow-xl border">
    <div className="mb-4">
      <h2 className="text-2xl font-bold text-neutral-700">{title}</h2>
      {subtitle ? <p className="text-sm text-neutral-500 mt-1">{subtitle}</p> : null}
    </div>
    {children}
  </div>
);

const OperationsLineChart = ({
  data,
  isLoading,
}: {
  data: {id: string; data: ChartDataPoint[]}[];
  isLoading: boolean;
}) => {
  const {t} = useTranslation("reports");
  return (
    <SectionCard
      title={t("labels.inventoryOperationsTrend")}
      subtitle={t("labels.inventoryOperationsTrendHelp")}
    >
      <div className="h-[300px] relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
              <p className="mt-2 text-sm text-neutral-500">{t("loading.chart")}</p>
            </div>
          </div>
        ) : null}
        {data.length > 0 && data.some((d) => d.data.length > 0) ? (
          <ResponsiveLine
            data={data}
            margin={{top: 20, right: 20, bottom: 50, left: 60}}
            xScale={{type: "point"}}
            yScale={{type: "linear", min: 0, max: "auto"}}
            curve="monotoneX"
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickRotation: -45,
              legend: t("labels.time"),
              legendOffset: 40,
              legendPosition: "middle",
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: t("labels.valueQuantity"),
              legendOffset: -50,
              legendPosition: "middle",
              format: (value: number) => {
                const num = Number(value);
                if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
                return num.toFixed(0);
              },
            }}
            enableGridX={false}
            enableGridY={true}
            gridYValues={6}
            colors={COLORS}
            lineWidth={3}
            pointSize={6}
            pointColor="#ffffff"
            pointBorderWidth={2}
            pointBorderColor={{from: "serieColor"}}
            enableArea={true}
            areaOpacity={0.05}
            useMesh={true}
            enableSlices="x"
            legends={[
              {
                anchor: "bottom",
                direction: "row",
                translateY: 50,
                itemsSpacing: 10,
                itemWidth: 100,
                itemHeight: 14,
                itemTextColor: "#525252",
                symbolSize: 10,
                symbolShape: "circle",
              },
            ]}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500">
            {t("labels.noInventoryOperationsData")}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

const DataTable = ({
  title,
  icon: Icon,
  color,
  columns,
  data,
  loading,
}: {
  title: string;
  icon: any;
  color: string;
  columns: {key: string; label: string; className?: string}[];
  data: any[];
  loading: boolean;
}) => {
  const {t} = useTranslation("reports");
  const colorMap: Record<string, {bg: string; icon: string; badge: string; badgeText: string}> = {
    primary: {bg: "bg-primary-100", icon: "text-primary-600", badge: "bg-primary-100", badgeText: "text-primary-500"},
    success: {bg: "bg-success-100", icon: "text-success-600", badge: "bg-success-100", badgeText: "text-success-500"},
    warning: {bg: "bg-warning-100", icon: "text-warning-600", badge: "bg-warning-100", badgeText: "text-warning-500"},
    danger: {bg: "bg-danger-100", icon: "text-danger-600", badge: "bg-danger-100", badgeText: "text-danger-500"},
    info: {bg: "bg-info-100", icon: "text-info-600", badge: "bg-info-100", badgeText: "text-info-500"},
  };
  const colors = colorMap[color] || colorMap.primary;

  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-3 rounded-full ${colors.bg}`}>
            <Icon className={`w-5 h-5 ${colors.icon}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-700">{title}</h2>
            <p className="text-xs text-neutral-500">{t("labels.latest20Records")}</p>
          </div>
        </div>
        <span className={`${colors.badge} ${colors.badgeText} text-xs font-semibold px-3 py-1.5 rounded-full`}>
          {data.length} {t("labels.records")}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider ${col.className || ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center">
                  <div className="flex items-center justify-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mr-2" />
                    <span className="text-sm text-neutral-500">{t("common:actions.loading")}</span>
                  </div>
                </td>
              </tr>
            ) : data.length > 0 ? (
              data.slice(0, 20).map((row, idx) => (
                <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key + idx} className={`py-3 px-3 text-sm text-neutral-700 ${col.className || ""}`}>
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-sm text-neutral-500">
                  {t("labels.noRecordsFound")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const InventoryDashboardReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const queryRef = useRef(db);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<InventoryDashboardPayload | null>(null);
  const [reconciliations, setReconciliations] = useState<KitchenReconciliation[]>([]);

  const filters = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      startDate: params.get("start") || undefined,
      endDate: params.get("end") || undefined,
    };
  }, []);

  useEffect(() => {
    queryRef.current = db;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [dashboard, reconciliationRows] = await Promise.all([
          loadInventoryDashboard(queryRef.current, filters),
          listKitchenReconciliationsForReport(queryRef.current, {
            startDate: filters.startDate ?? null,
            endDate: filters.endDate ?? null,
          }),
        ]);
        setPayload(dashboard);
        setReconciliations(reconciliationRows);
      } catch (err) {
        console.error("Failed to load inventory dashboard", err);
        setError(err instanceof Error ? err.message : t("errors.unableToLoad"));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const docs = payload?.documents;
  const stock = payload?.stock;
  const compare = payload?.issuanceVsConsumption;
  const today = payload?.today;
  const needed = payload?.neededToday;
  const runout = payload?.runout;

  const reconciliationKpis = useMemo(() => {
    const reconciliationCount = reconciliations.length;
    const verifiedReconciliationCount = reconciliations.filter((r) => r.status === "verified").length;
    const missedReconciliationCount = reconciliations.filter((r) => r.status === "missed").length;
    const totalKitchenVariance = reconciliations.reduce(
      (sum, reconciliation) => sum + getReconciliationTotals(reconciliation).totalVariance,
      0,
    );
    return {reconciliationCount, verifiedReconciliationCount, missedReconciliationCount, totalKitchenVariance};
  }, [reconciliations]);

  const chartData = useMemo(() => {
    if (!docs) return [];
    const allDates = new Set<string>();
    const dateFmt = import.meta.env.VITE_DATE_FORMAT;

    const addByDate = (
      map: Map<string, number>,
      rows: any[],
      getValue: (row: any) => number,
      getDate: (row: any) => DateTime,
    ) => {
      rows.forEach((row) => {
        const key = getDate(row).toFormat(dateFmt);
        allDates.add(key);
        map.set(key, (map.get(key) || 0) + getValue(row));
      });
    };

    const purchasesByDate = new Map<string, number>();
    const purchaseReturnsByDate = new Map<string, number>();
    const issuesByDate = new Map<string, number>();
    const issueReturnsByDate = new Map<string, number>();
    const wastesByDate = new Map<string, number>();
    const transfersByDate = new Map<string, number>();
    const productionByDate = new Map<string, number>();
    const buffetByDate = new Map<string, number>();
    const adjustmentsByDate = new Map<string, number>();
    const kitchenVarianceByDate = new Map<string, number>();

    addByDate(
      purchasesByDate,
      docs.purchases,
      (p) => {
        const itemsTotal = (p.items ?? []).reduce(
          (sum: number, item: any) => sum + safeNumber(item.quantity) * safeNumber(item.price),
          0,
        );
        const extras = (p.extras ?? []).reduce((sum: number, extra: any) => sum + safeNumber(extra.amount), 0);
        return itemsTotal + safeNumber(p.tax_amount) + extras;
      },
      (p) => DateTime.fromJSDate(p.created_at),
    );
    addByDate(
      purchaseReturnsByDate,
      docs.purchaseReturns,
      (pr) => (pr.items ?? []).reduce(
        (sum: number, item: any) => sum + safeNumber(item.quantity) * safeNumber(item.price),
        0,
      ),
      (pr) => DateTime.fromJSDate(pr.created_at),
    );
    addByDate(
      issuesByDate,
      docs.issues,
      (i) => (i.items ?? []).reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0),
      (i) => DateTime.fromJSDate(i.created_at),
    );
    addByDate(
      issueReturnsByDate,
      docs.issueReturns,
      (ir) => (ir.items ?? []).reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0),
      (ir) => DateTime.fromJSDate(ir.created_at),
    );
    addByDate(
      wastesByDate,
      docs.wastes,
      (w) => (w.items ?? []).reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0),
      (w) => DateTime.fromJSDate(w.created_at),
    );
    addByDate(
      transfersByDate,
      docs.transfers,
      (tr) => (tr.items ?? []).reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0),
      (tr) => DateTime.fromJSDate(tr.created_at),
    );
    addByDate(
      productionByDate,
      docs.productionBatches,
      (b) => (b.outputs ?? []).reduce((sum: number, out: any) => sum + safeNumber(out.quantity), 0),
      (b) => DateTime.fromJSDate(b.created_at),
    );
    addByDate(
      buffetByDate,
      docs.buffetSessions,
      (s) => (s.consumption_logs ?? []).reduce((sum: number, log: any) => sum + Math.abs(safeNumber(log.total_consumed ?? log.quantity)), 0),
      (s) => DateTime.fromJSDate(s.created_at),
    );
    addByDate(
      adjustmentsByDate,
      docs.adjustments,
      (a) => (a.items ?? []).reduce((sum: number, item: any) => sum + Math.abs(safeNumber(item.quantity_change)), 0),
      (a) => DateTime.fromJSDate(a.created_at),
    );

    reconciliations.forEach((reconciliation) => {
      const key = DateTime.fromISO(reconciliation.business_date).toFormat(dateFmt);
      allDates.add(key);
      kitchenVarianceByDate.set(
        key,
        (kitchenVarianceByDate.get(key) || 0) + getReconciliationTotals(reconciliation).totalVariance,
      );
    });

    const sortedDates = Array.from(allDates).sort();
    const series = (
      id: string,
      map: Map<string, number>,
    ) => ({id, data: sortedDates.map((x) => ({x, y: map.get(x) || 0}))});

    return [
      series(t("labels.purchases"), purchasesByDate),
      series(t("labels.purchaseReturns"), purchaseReturnsByDate),
      series(t("labels.issuesQty"), issuesByDate),
      series(t("labels.issueReturns"), issueReturnsByDate),
      series(t("labels.wastes"), wastesByDate),
      series(t("labels.transfers"), transfersByDate),
      series(t("labels.production"), productionByDate),
      series(t("labels.buffetConsumption"), buffetByDate),
      series(t("labels.adjustments"), adjustmentsByDate),
      series(t("labels.kitchenVariance"), kitchenVarianceByDate),
    ];
  }, [docs, reconciliations, t]);

  const consumptionTrendChart = useMemo(() => {
    if (!runout?.overallSeries?.length) return [];
    return [
      {
        id: t("labels.consumptionQty"),
        data: runout.overallSeries.map((point) => ({
          x: point.period,
          y: point.value,
        })),
      },
    ];
  }, [runout, t]);

  const locationStock: LocationStockGroup[] = stock?.locations ?? [];

  const purchasesTableData = useMemo(() => {
    return (docs?.purchases ?? []).slice(0, 20).map((p: any) => {
      const itemsTotal = (p.items ?? []).reduce(
        (sum: number, item: any) => sum + safeNumber(item.quantity) * safeNumber(item.price),
        0,
      );
      const extras = (p.extras ?? []).reduce((sum: number, extra: any) => sum + safeNumber(extra.amount), 0);
      return {
        invoice: `#${p.invoice_number || "-"}`,
        date: DateTime.fromJSDate(p.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
        supplier: p.supplier?.name || "-",
        location: p.location?.name || "-",
        createdBy: personName(p.created_by),
        items: p.items?.length || 0,
        total: withCurrency(itemsTotal + safeNumber(p.tax_amount) + extras),
      };
    });
  }, [docs]);

  const purchaseReturnsTableData = useMemo(() => {
    return (docs?.purchaseReturns ?? []).slice(0, 20).map((pr: any) => ({
      invoice: `#${pr.invoice_number || "-"}`,
      date: DateTime.fromJSDate(pr.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      purchase: pr.purchase ? `#${pr.purchase.invoice_number || "-"}` : "-",
      location: pr.location?.name || "-",
      createdBy: personName(pr.created_by),
      items: pr.items?.length || 0,
      total: withCurrency(
        (pr.items ?? []).reduce(
          (sum: number, item: any) => sum + safeNumber(item.quantity) * safeNumber(item.price),
          0,
        ),
      ),
    }));
  }, [docs]);

  const issuesTableData = useMemo(() => {
    return (docs?.issues ?? []).slice(0, 20).map((i: any) => ({
      invoice: i.invoice_number ? `#${i.invoice_number}` : "-",
      date: DateTime.fromJSDate(i.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      issuedTo: personName(i.issued_to),
      location: i.location?.name || "-",
      createdBy: personName(i.created_by),
      items: i.items?.length || 0,
      total: formatNumber((i.items ?? []).reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0)),
    }));
  }, [docs]);

  const issueReturnsTableData = useMemo(() => {
    return (docs?.issueReturns ?? []).slice(0, 20).map((ir: any) => ({
      invoice: `#${ir.invoice_number || "-"}`,
      date: DateTime.fromJSDate(ir.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      issuance: ir.issuance?.invoice_number ? `#${ir.issuance.invoice_number}` : "-",
      location: ir.location?.name || "-",
      createdBy: personName(ir.created_by),
      items: ir.items?.length || 0,
      total: formatNumber((ir.items ?? []).reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0)),
    }));
  }, [docs]);

  const wastesTableData = useMemo(() => {
    return (docs?.wastes ?? []).slice(0, 20).map((w: any) => ({
      invoice: `#${w.invoice_number || "-"}`,
      date: DateTime.fromJSDate(w.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      purchase: w.purchase?.invoice_number ? `#${w.purchase.invoice_number}` : "-",
      issue: w.issue?.invoice_number ? `#${w.issue.invoice_number}` : "-",
      createdBy: personName(w.created_by),
      items: w.items?.length || 0,
      total: formatNumber((w.items ?? []).reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0)),
    }));
  }, [docs]);

  const transfersTableData = useMemo(() => {
    return (docs?.transfers ?? []).slice(0, 20).map((tr: any) => ({
      date: DateTime.fromJSDate(tr.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      from: tr.from_location?.name || "-",
      to: tr.to_location?.name || "-",
      createdBy: personName(tr.created_by),
      items: tr.items?.length || 0,
      total: formatNumber((tr.items ?? []).reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0)),
    }));
  }, [docs]);

  const productionTableData = useMemo(() => {
    return (docs?.productionBatches ?? []).slice(0, 20).map((b: any) => ({
      batch: b.batch_number || "-",
      date: DateTime.fromJSDate(b.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      recipe: b.recipe?.name || "-",
      location: b.location?.name || "-",
      createdBy: personName(b.created_by),
      output: formatNumber((b.outputs ?? []).reduce((sum: number, out: any) => sum + safeNumber(out.quantity), 0)),
    }));
  }, [docs]);

  const buffetTableData = useMemo(() => {
    return (docs?.buffetSessions ?? []).slice(0, 20).map((s: any) => ({
      session: s.session_number || "-",
      date: s.business_date || DateTime.fromJSDate(s.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      menu: s.menu?.name || "-",
      location: s.location?.name || "-",
      status: s.status || "-",
      consumption: formatNumber(
        (s.consumption_logs ?? []).reduce(
          (sum: number, log: any) => sum + Math.abs(safeNumber(log.total_consumed ?? log.quantity)),
          0,
        ),
      ),
    }));
  }, [docs]);

  const adjustmentsTableData = useMemo(() => {
    return (docs?.adjustments ?? []).slice(0, 20).map((a: any) => ({
      invoice: `#${a.invoice_number || "-"}`,
      date: DateTime.fromJSDate(a.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      reason: a.reason || "-",
      location: a.location?.name || "-",
      createdBy: personName(a.created_by),
      items: a.items?.length || 0,
      total: formatNumber(
        (a.items ?? []).reduce((sum: number, item: any) => sum + Math.abs(safeNumber(item.quantity_change)), 0),
      ),
    }));
  }, [docs]);

  const reconciliationsTableData = useMemo(() => {
    return [...reconciliations]
      .sort((a, b) => b.business_date.localeCompare(a.business_date))
      .slice(0, 20)
      .map((reconciliation) => {
        const totals = getReconciliationTotals(reconciliation);
        return {
          location: reconciliation.location?.name || "-",
          businessDate: reconciliation.business_date,
          status: reconciliation.status,
          revision: reconciliation.revision,
          lineCount: totals.lineCount,
          totalVariance: formatNumber(totals.totalVariance),
          verifiedBy: personName(reconciliation.verified_by),
        };
      });
  }, [reconciliations]);

  if (error) {
    return (
      <ReportsLayout title={t("reports.inventoryDashboard")}>
        <div className="py-12 text-center text-danger-500">
          {t("errors.failedToLoadDashboard")}: {error}
        </div>
      </ReportsLayout>
    );
  }

  const totals = docs?.totals;
  const trendKey = today?.trendSummaryKey ?? "insufficient";

  return (
    <ReportsLayout title={t("reports.inventoryDashboard")} subtitle={t("titles.inventoryDashboard")}>
      <div className="space-y-5">
        <SectionCard title={t("labels.keyMetrics")}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <KPIMetricWidget
              title={t("labels.totalPurchases")}
              value={withCurrency(totals?.purchaseValue ?? 0)}
              gradientClass="from-primary-100 to-primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t("labels.purchaseReturns")}
              value={withCurrency(totals?.purchaseReturnValue ?? 0)}
              gradientClass="from-info-100 to-info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title={t("labels.totalIssues")}
              value={withCurrency(totals?.issueValue ?? 0)}
              gradientClass="from-warning-100 to-warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title={t("labels.issueReturns")}
              value={formatNumber(totals?.issueReturnQty ?? 0)}
              gradientClass="from-success-100 to-success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title={t("labels.wastes")}
              value={formatNumber(totals?.wasteQty ?? 0)}
              gradientClass="from-danger-100 to-danger-200"
              borderColor="border-danger-300"
              textColor="text-danger-900"
              labelColor="text-danger-700"
            />
            <KPIMetricWidget
              title={t("labels.transfers")}
              value={formatNumber(totals?.transferQty ?? 0)}
              gradientClass="from-info-100 to-info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title={t("labels.production")}
              value={formatNumber(totals?.productionOutputQty ?? 0)}
              gradientClass="from-primary-100 to-primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t("labels.buffetConsumption")}
              value={formatNumber(totals?.buffetConsumptionQty ?? 0)}
              gradientClass="from-warning-100 to-warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title={t("labels.adjustments")}
              value={formatNumber(totals?.adjustmentQty ?? 0)}
              gradientClass="from-neutral-100 to-neutral-200"
              borderColor="border-neutral-300"
              textColor="text-neutral-900"
              labelColor="text-neutral-700"
            />
            <KPIMetricWidget
              title={t("labels.stockValue")}
              value={withCurrency(stock?.totalStockValue ?? 0)}
              gradientClass="from-success-100 to-success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title={t("labels.belowReorder")}
              value={formatNumber(stock?.belowReorderCount ?? 0)}
              gradientClass="from-danger-100 to-danger-200"
              borderColor="border-danger-300"
              textColor="text-danger-900"
              labelColor="text-danger-700"
            />
          </div>
        </SectionCard>

        <SectionCard title={t("labels.kitchenReconciliationVarianceTrend")}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPIMetricWidget
              title={t("labels.kitchenReconciliationCount")}
              value={formatNumber(reconciliationKpis.reconciliationCount)}
              gradientClass="from-primary-100 to-primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t("labels.kitchenReconciliationVerified")}
              value={formatNumber(reconciliationKpis.verifiedReconciliationCount)}
              gradientClass="from-success-100 to-success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title={t("labels.kitchenReconciliationMissed")}
              value={formatNumber(reconciliationKpis.missedReconciliationCount)}
              gradientClass="from-warning-100 to-warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title={t("labels.kitchenReconciliationTotalVariance")}
              value={formatNumber(reconciliationKpis.totalKitchenVariance)}
              gradientClass="from-danger-100 to-danger-200"
              borderColor="border-danger-300"
              textColor="text-danger-900"
              labelColor="text-danger-700"
            />
          </div>
        </SectionCard>

        <SectionCard
          title={t("labels.issuanceAndConsumption")}
          subtitle={t("labels.issuanceAndConsumptionHelp")}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <KPIMetricWidget
              title={t("labels.totalIssued")}
              value={formatNumber(compare?.totals.issuedQty ?? 0)}
              gradientClass="from-warning-100 to-warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title={t("labels.totalConsumed")}
              value={formatNumber(compare?.totals.consumedQty ?? 0)}
              gradientClass="from-primary-100 to-primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t("labels.netVarianceIssuedConsumed")}
              value={formatNumber(compare?.totals.variance ?? 0)}
              gradientClass="from-info-100 to-info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase">{t("columns.itemName")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.issued")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.consumed")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.variance")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase">{t("columns.uom")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-neutral-500">{t("common:actions.loading")}</td>
                  </tr>
                ) : (compare?.rows.length ?? 0) > 0 ? (
                  compare!.rows.map((row) => (
                    <tr
                      key={row.itemId}
                      className={
                        row.variance > 0.01
                          ? "bg-warning-50/40"
                          : row.variance < -0.01
                            ? "bg-danger-50/40"
                            : ""
                      }
                    >
                      <td className="py-3 px-3 text-sm font-medium text-neutral-900">{row.name}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.issuedQty)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.consumedQty)}</td>
                      <td className={`py-3 px-3 text-sm text-right font-semibold ${row.variance > 0 ? "text-warning-700" : row.variance < 0 ? "text-danger-700" : "text-neutral-700"}`}>
                        {formatNumber(row.variance)}
                      </td>
                      <td className="py-3 px-3 text-sm text-neutral-600">{row.uom || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-neutral-500">{t("labels.noRecordsFound")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title={t("labels.todaysInventoryAndSales")}
          subtitle={t(`labels.todayTrend.${trendKey}`)}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
            <KPIMetricWidget
              title={t("labels.todayNetSales")}
              value={withCurrency(today?.netSales ?? 0)}
              gradientClass="from-primary-100 to-primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t("labels.todayOrders")}
              value={formatNumber(today?.orderCount ?? 0)}
              gradientClass="from-info-100 to-info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title={t("labels.todayConsumption")}
              value={formatNumber(today?.consumptionQty ?? 0)}
              gradientClass="from-warning-100 to-warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title={t("labels.todayIssuance")}
              value={formatNumber(today?.issuedQty ?? 0)}
              gradientClass="from-success-100 to-success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title={t("labels.todayPurchases")}
              value={withCurrency(today?.purchaseValue ?? 0)}
              gradientClass="from-primary-100 to-primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t("labels.todayWaste")}
              value={formatNumber(today?.wasteQty ?? 0)}
              gradientClass="from-danger-100 to-danger-200"
              borderColor="border-danger-300"
              textColor="text-danger-900"
              labelColor="text-danger-700"
            />
            <KPIMetricWidget
              title={t("labels.todayTransfers")}
              value={formatNumber(today?.transferQty ?? 0)}
              gradientClass="from-info-100 to-info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title={t("labels.todayConsumptionCost")}
              value={withCurrency(today?.consumptionCost ?? 0)}
              gradientClass="from-warning-100 to-warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
          </div>
          {(today?.salesTrendPercent != null || today?.consumptionTrendPercent != null) && (
            <p className="mt-4 text-sm text-neutral-600">
              {t("labels.todayTrendDetail", {
                salesPct: today?.salesTrendPercent != null ? formatNumber(today.salesTrendPercent) : "—",
                consumptionPct: today?.consumptionTrendPercent != null ? formatNumber(today.consumptionTrendPercent) : "—",
              })}
            </p>
          )}
        </SectionCard>

        <SectionCard
          title={t("labels.inventoryNeededForToday")}
          subtitle={t("labels.inventoryNeededForTodayHelp", {
            percent: formatNumber((needed?.dayFraction ?? 0) * 100),
          })}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KPIMetricWidget
              title={t("labels.coveredItems")}
              value={formatNumber(needed?.coveredCount ?? 0)}
              gradientClass="from-success-100 to-success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title={t("labels.shortItems")}
              value={formatNumber(needed?.shortCount ?? 0)}
              gradientClass="from-danger-100 to-danger-200"
              borderColor="border-danger-300"
              textColor="text-danger-900"
              labelColor="text-danger-700"
            />
            <KPIMetricWidget
              title={t("labels.projectedNeedCost")}
              value={withCurrency(needed?.totalProjectedNeedCost ?? 0)}
              gradientClass="from-primary-100 to-primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t("labels.shortfallCost")}
              value={withCurrency(needed?.totalShortfallCost ?? 0)}
              gradientClass="from-warning-100 to-warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase">{t("columns.itemName")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.onHand")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.todayConsumed")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.projectedNeed")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.shortfall")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase">{t("columns.uom")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(needed?.rows.length ?? 0) > 0 ? (
                  needed!.rows.map((row) => (
                    <tr key={row.itemId} className={row.shortfall > 0.001 ? "bg-danger-50/50" : ""}>
                      <td className="py-3 px-3 text-sm font-medium">{row.name}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.onHand)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.todayConsumed)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.projectedNeed)}</td>
                      <td className="py-3 px-3 text-sm text-right font-semibold text-danger-700">
                        {formatNumber(row.shortfall)}
                      </td>
                      <td className="py-3 px-3 text-sm">{row.uom || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-neutral-500">{t("labels.noRecordsFound")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title={t("labels.forecastRunout")}
          subtitle={t("labels.forecastRunoutHelp")}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="h-[240px]">
              {consumptionTrendChart.length > 0 && consumptionTrendChart[0].data.length > 0 ? (
                <ResponsiveLine
                  data={consumptionTrendChart}
                  margin={{top: 20, right: 20, bottom: 40, left: 50}}
                  xScale={{type: "point"}}
                  yScale={{type: "linear", min: 0, max: "auto"}}
                  curve="monotoneX"
                  colors={["#0046FE"]}
                  enableArea
                  areaOpacity={0.08}
                  pointSize={5}
                  useMesh
                  axisBottom={{tickRotation: -45}}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-neutral-500">
                  {t("labels.insufficientForecastData")}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 justify-center text-sm text-neutral-600">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary-600" />
                <span>{t("labels.forecastBasedOnSales")}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning-600" />
                <span>{t("labels.forecastMinHistory")}</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase">{t("columns.itemName")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.onHand")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.avgDailyConsumption")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.daysOfCover")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.stockoutInDays")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.suggestedReorder")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(runout?.rows.length ?? 0) > 0 ? (
                  runout!.rows.map((row) => (
                    <tr
                      key={row.itemId}
                      className={
                        row.daysOfCover != null && row.daysOfCover <= 3
                          ? "bg-danger-50/50"
                          : row.daysOfCover != null && row.daysOfCover <= 7
                            ? "bg-warning-50/40"
                            : ""
                      }
                    >
                      <td className="py-3 px-3 text-sm font-medium">
                        {row.name}
                        {row.insufficientData ? (
                          <span className="ml-2 text-xs text-neutral-500">({t("labels.insufficientData")})</span>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.onHand)}</td>
                      <td className="py-3 px-3 text-sm text-right">{formatNumber(row.avgDailyConsumption)}</td>
                      <td className="py-3 px-3 text-sm text-right">
                        {row.daysOfCover != null ? formatNumber(row.daysOfCover) : "—"}
                      </td>
                      <td className="py-3 px-3 text-sm text-right">
                        {row.estimatedStockoutDays != null ? formatNumber(row.estimatedStockoutDays) : "—"}
                      </td>
                      <td className="py-3 px-3 text-sm text-right">
                        {row.suggestedReorderQty != null ? formatNumber(row.suggestedReorderQty) : "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-neutral-500">
                      {t("labels.insufficientForecastData")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <OperationsLineChart data={chartData} isLoading={loading} />

        <div className="bg-white p-5 rounded-lg shadow-xl border">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-3 rounded-full bg-primary-100">
              <Package className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-700">{t("inventory:tabs.locations")}</h2>
              <p className="text-xs text-neutral-500">{t("labels.stockByLocationHelp")}</p>
            </div>
          </div>
          <Tabs className="w-full" defaultSelectedKey={locationStock[0]?.locationName || ""}>
            <TabList aria-label="Location tabs" className="flex flex-row gap-3 mb-4 flex-wrap">
              {locationStock.map((location) => (
                <Tab
                  activeClass="bg-neutral-900 text-warning-500"
                  id={location.locationName}
                  key={location.locationName}
                  className="whitespace-nowrap"
                >
                  {location.locationName} ({location.items.length})
                </Tab>
              ))}
            </TabList>
            {locationStock.map((location) => (
              <TabPanel id={location.locationName} key={location.locationName}>
                <table className="table">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-neutral-600 uppercase">{t("columns.itemName")}</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase">{t("columns.code")}</th>
                      <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("columns.quantity")}</th>
                      <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase">{t("labels.value")}</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase">{t("columns.uom")}</th>
                      <th className="py-3 pr-4 text-left text-xs font-semibold text-neutral-600 uppercase">{t("labels.reorder")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {location.items.length > 0 ? (
                      location.items.map((item) => (
                        <tr key={item.id} className={item.belowReorder ? "bg-danger-50/40" : "hover:bg-neutral-50"}>
                          <td className="py-3 pl-4 pr-3 text-sm font-medium text-neutral-900">{item.name}</td>
                          <td className="py-3 px-3 text-sm text-neutral-600 font-mono">{item.code}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold">{formatNumber(item.quantity)}</td>
                          <td className="py-3 px-3 text-right text-sm">{withCurrency(item.value)}</td>
                          <td className="py-3 px-3 text-sm text-neutral-600">{item.uom || "-"}</td>
                          <td className="py-3 pr-4 text-sm">
                            {item.belowReorder ? (
                              <span className="text-danger-600 font-semibold">{t("labels.belowReorder")}</span>
                            ) : item.reorderLevel ? (
                              formatNumber(item.reorderLevel)
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-neutral-500">
                          {t("labels.noStockForLocation")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TabPanel>
            ))}
            {locationStock.length === 0 && (
              <div className="py-12 text-center text-sm text-neutral-500">{t("labels.noLocationStock")}</div>
            )}
          </Tabs>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <DataTable
            title={t("labels.latestPurchases")}
            icon={ShoppingCart}
            color="primary"
            loading={loading}
            columns={[
              {key: "invoice", label: t("columns.invoice")},
              {key: "date", label: t("columns.date")},
              {key: "supplier", label: t("columns.supplier")},
              {key: "location", label: t("labels.location")},
              {key: "total", label: t("columns.total"), className: "text-right"},
            ]}
            data={purchasesTableData}
          />
          <DataTable
            title={t("labels.latestPurchaseReturns")}
            icon={RotateCcw}
            color="info"
            loading={loading}
            columns={[
              {key: "invoice", label: t("columns.invoice")},
              {key: "date", label: t("columns.date")},
              {key: "purchase", label: t("columns.purchase")},
              {key: "location", label: t("labels.location")},
              {key: "total", label: t("columns.total"), className: "text-right"},
            ]}
            data={purchaseReturnsTableData}
          />
          <DataTable
            title={t("labels.latestIssues")}
            icon={Package}
            color="warning"
            loading={loading}
            columns={[
              {key: "invoice", label: t("columns.invoice")},
              {key: "date", label: t("columns.date")},
              {key: "issuedTo", label: t("columns.issuedTo")},
              {key: "location", label: t("labels.location")},
              {key: "total", label: t("columns.quantity"), className: "text-right"},
            ]}
            data={issuesTableData}
          />
          <DataTable
            title={t("labels.latestIssueReturns")}
            icon={RotateCcw}
            color="success"
            loading={loading}
            columns={[
              {key: "invoice", label: t("columns.invoice")},
              {key: "date", label: t("columns.date")},
              {key: "issuance", label: t("columns.issuance")},
              {key: "location", label: t("labels.location")},
              {key: "total", label: t("columns.quantity"), className: "text-right"},
            ]}
            data={issueReturnsTableData}
          />
          <DataTable
            title={t("labels.latestWastes")}
            icon={Trash2}
            color="danger"
            loading={loading}
            columns={[
              {key: "invoice", label: t("columns.invoice")},
              {key: "date", label: t("columns.date")},
              {key: "purchase", label: t("columns.purchase")},
              {key: "issue", label: t("columns.issue")},
              {key: "total", label: t("columns.quantity"), className: "text-right"},
            ]}
            data={wastesTableData}
          />
          <DataTable
            title={t("labels.latestTransfers")}
            icon={ArrowLeftRight}
            color="info"
            loading={loading}
            columns={[
              {key: "date", label: t("columns.date")},
              {key: "from", label: t("labels.transfersOut")},
              {key: "to", label: t("labels.transfersIn")},
              {key: "items", label: t("columns.items")},
              {key: "total", label: t("columns.quantity"), className: "text-right"},
            ]}
            data={transfersTableData}
          />
          <DataTable
            title={t("labels.latestProduction")}
            icon={Factory}
            color="primary"
            loading={loading}
            columns={[
              {key: "batch", label: t("columns.batch")},
              {key: "date", label: t("columns.date")},
              {key: "recipe", label: t("labels.recipe")},
              {key: "location", label: t("labels.location")},
              {key: "output", label: t("columns.quantity"), className: "text-right"},
            ]}
            data={productionTableData}
          />
          <DataTable
            title={t("labels.latestBuffet")}
            icon={Utensils}
            color="warning"
            loading={loading}
            columns={[
              {key: "session", label: t("columns.session")},
              {key: "date", label: t("columns.date")},
              {key: "menu", label: t("columns.menu")},
              {key: "location", label: t("labels.location")},
              {key: "consumption", label: t("columns.quantity"), className: "text-right"},
            ]}
            data={buffetTableData}
          />
          <DataTable
            title={t("labels.latestAdjustments")}
            icon={SlidersHorizontal}
            color="info"
            loading={loading}
            columns={[
              {key: "invoice", label: t("columns.invoice")},
              {key: "date", label: t("columns.date")},
              {key: "reason", label: t("columns.reason")},
              {key: "location", label: t("labels.location")},
              {key: "total", label: t("columns.quantity"), className: "text-right"},
            ]}
            data={adjustmentsTableData}
          />
          <DataTable
            title={t("labels.kitchenReconciliationLatest")}
            icon={TrendingUp}
            color="primary"
            loading={loading}
            columns={[
              {key: "location", label: t("labels.location")},
              {key: "businessDate", label: t("labels.businessDate")},
              {key: "status", label: t("columns.status")},
              {key: "lineCount", label: t("labels.lineCount")},
              {key: "totalVariance", label: t("labels.totalVariance"), className: "text-right"},
            ]}
            data={reconciliationsTableData}
          />
        </div>
      </div>
    </ReportsLayout>
  );
};
