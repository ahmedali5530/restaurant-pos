import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {parseMultiFilter} from "@/api/reports/shared/filters.ts";
import {
  aggregateDailyCategoryMix,
  fetchOrders,
  PRODUCT_MIX_FETCHES,
  sumFilteredExclusiveSales,
} from "@/api/reports/sales";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {useReportBranchScope} from "@/hooks/useReportBranchScope.ts";
import {BranchBreakdown} from "@/components/reports/branch.breakdown.tsx";

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  orderTakerIds: string[];
  orderTypeIds: string[];
  categoryIds: string[];
  menuItemIds: string[];
  modifierIds: string[];
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);

  return {
    startDate: params.get("start") || undefined,
    endDate: params.get("end") || undefined,
    orderTakerIds: parseMultiFilter(params, "order_takers"),
    orderTypeIds: parseMultiFilter(params, "order_types"),
    categoryIds: parseMultiFilter(params, "categories"),
    menuItemIds: parseMultiFilter(params, "menu_items"),
    modifierIds: parseMultiFilter(params, "modifiers"),
  };
};

export const ProductMixSummaryReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const branchScope = useReportBranchScope();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate
    ? `${filters.startDate} to ${filters.endDate}`
    : undefined;

  const [orders, setOrders] = useState<any[]>([]);

  const fetchData = async () => {
    if (!branchScope.ready) return;
    try {
      setLoading(true);
      setError(null);

      const fetched = await fetchOrders(db, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        branchIds: branchScope.branchIds,
        fetches: PRODUCT_MIX_FETCHES,
        paidOnly: true,
        orderTakerIds: filters.orderTakerIds,
        orderTypeIds: filters.orderTypeIds,
        categoryIds: filters.categoryIds,
        menuItemIds: filters.menuItemIds,
      });
      setOrders(fetched);
    } catch (err) {
      console.error("Failed to load product mix summary report", err);
      setError(err instanceof Error ? err.message : t("errors.unableToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when filter/branch inputs change; omit db
  }, [
    branchScope.ready,
    branchScope.branchIds,
    filters.startDate,
    filters.endDate,
    filters.orderTakerIds.join(","),
    filters.orderTypeIds.join(","),
    filters.categoryIds.join(","),
    filters.menuItemIds.join(","),
    filters.modifierIds.join(","),
  ]);

  if (loading || !branchScope.ready) {
    return (
      <ReportsLayout title={t("reports.productMixSummary")} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">{t("loading.productMixSummary")}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t("reports.productMixSummary")} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t("errors.failedToLoad", {error})}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout onRefresh={fetchData} title={t("reports.productMixSummary")} subtitle={subtitle}>
      <BranchBreakdown
        enabled={branchScope.isByBranch}
        rows={orders}
        labels={branchScope.branchLabels}
        branchOrder={branchScope.branchOrder}
        renderSection={({rows, key}) => (
          <ProductMixSummaryBody key={key} orders={rows} filters={filters} />
        )}
      />
    </ReportsLayout>
  );
};

/** Body uses partitioned orders so by-branch aggregates are recomputed. */
const ProductMixSummaryBody = ({
  orders,
  filters,
}: {
  orders: any[];
  filters: ReportFilters;
}) => {
  const {t} = useTranslation("reports");
  const productMixFilters = {
    categoryIds: filters.categoryIds,
    menuItemIds: filters.menuItemIds,
    modifierIds: filters.modifierIds,
  };

  const categoryMix = useMemo(
    () =>
      aggregateDailyCategoryMix(orders, {
        filters: productMixFilters,
        uncategorizedLabel: t("filters.uncategorized", {defaultValue: "Uncategorized"}),
        unknownItemLabel: t("labels.unknownItem", {defaultValue: "Unknown item"}),
      }),
    [orders, filters.categoryIds, filters.menuItemIds, filters.modifierIds, t],
  );

  const exclusiveSales = useMemo(
    () => sumFilteredExclusiveSales(orders, productMixFilters),
    [orders, filters.categoryIds, filters.menuItemIds, filters.modifierIds],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated p-4">
      <div className="border-b border-border py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <div className="flex">
          <span className="w-1/2">{t("filters.item")}</span>
          <span className="w-1/6 text-right">{t("columns.quantity")}</span>
          <span className="w-1/6 text-right">{t("columns.total")}</span>
          <span className="w-1/6 text-right">{t("labels.share", {defaultValue: "Share"})}</span>
        </div>
      </div>
      {categoryMix.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {t("errors.noDataForFilters", {defaultValue: "No data available for the selected filters"})}
        </p>
      ) : (
        categoryMix.map((category) => (
          <div key={category.name}>
            <div className="border-b border-border bg-surface py-2 text-sm font-semibold">
              <div className="flex">
                <span className="w-1/2">{category.name}</span>
                <span className="w-1/6 text-right tabular-nums">{formatNumber(category.quantity)}</span>
                <span className="w-1/6 text-right tabular-nums">{withCurrency(category.total)}</span>
                <span className="w-1/6 text-right tabular-nums">
                  {formatNumber(exclusiveSales > 0 ? (category.total / exclusiveSales) * 100 : 0)}%
                </span>
              </div>
            </div>
            {category.dishes.map((dish) => (
              <div key={`${category.name}-${dish.key}`} className="border-b border-border py-2 text-sm">
                <div className="flex">
                  <div className="w-1/2 pr-2">
                    <div className="pl-4">{dish.name}</div>
                    {dish.modifiers.map((modifier) => (
                      <div
                        key={`${category.name}-${dish.key}-${modifier.path}`}
                        className="flex text-xs text-muted"
                      >
                        <div
                          className="w-3/5"
                          style={{paddingLeft: `${modifier.depth + 1}rem`}}
                        >
                          - {modifier.name}
                        </div>
                        <div className="w-1/5">{formatNumber(modifier.quantity)}</div>
                        <div className="w-1/5">{formatNumber(modifier.price)}</div>
                      </div>
                    ))}
                  </div>
                  <span className="w-1/6 text-right tabular-nums">{formatNumber(dish.quantity)}</span>
                  <span className="w-1/6 text-right tabular-nums">{withCurrency(dish.total)}</span>
                  <span className="w-1/6 text-right tabular-nums">
                    {formatNumber(exclusiveSales > 0 ? (dish.total / exclusiveSales) * 100 : 0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
};
