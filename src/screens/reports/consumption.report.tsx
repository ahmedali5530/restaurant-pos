import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {useShowInclusivePrices} from "@/hooks/useShowInclusivePrices.ts";
import {
  getRecipeConsumptionSummary,
  type RecipeConsumptionItem,
} from "@/api/reports/inventory/consumption.ts";

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  itemIds: string[];
  dishIds: string[];
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);
  const parseMulti = (name: string) => {
    const list = [
      ...params.getAll(`${name}[]`),
      ...params.getAll(name),
    ].filter(Boolean);
    return list as string[];
  };

  return {
    startDate: params.get("start") || params.get("start"),
    endDate: params.get("end") || params.get("end"),
    itemIds: parseMulti("items"),
    dishIds: parseMulti("dishes"),
  };
};

type ConsumptionRow = RecipeConsumptionItem & {
  itemId: string;
  itemName: string;
  itemCode?: string;
  totalQuantity: number;
  totalSalePrice: number;
  totalCostAverage: number;
  totalCostCurrent: number;
};

export const ConsumptionReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const {enabled: showInclusive} = useShowInclusivePrices();
  const queryRef = useRef(db.query);
  const [consumptionData, setConsumptionData] = useState<ConsumptionRow[]>([]);
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

        const summary = await getRecipeConsumptionSummary(
          {query: (...args) => queryRef.current(...args)},
          {
            startDate: filters.startDate,
            endDate: filters.endDate,
            itemIds: filters.itemIds,
            dishIds: filters.dishIds,
            showInclusive,
          },
        );

        setConsumptionData(summary.byItem.map((item) => ({
          ...item,
          itemId: item.id,
          itemName: item.name,
          itemCode: item.code,
          totalQuantity: item.quantity,
          totalSalePrice: item.saleAllocated,
          totalCostAverage: item.costAverage,
          totalCostCurrent: item.costCurrent,
        })));
      } catch (err) {
        console.error("Failed to load consumption report:", err);
        setError(err instanceof Error ? err.message : t("errors.unableToLoad"));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.startDate, filters.endDate, filters.itemIds.join(","), filters.dishIds.join(","), showInclusive, t]);

  const totals = useMemo(() => {
    return consumptionData.reduce((acc, item) => {
      acc.totalQuantity += item.totalQuantity;
      acc.totalSalePrice += item.totalSalePrice;
      acc.totalCostAverage += item.totalCostAverage;
      acc.totalCostCurrent += item.totalCostCurrent;
      acc.differenceAverage += item.differenceAverage;
      acc.differenceCurrent += item.differenceCurrent;
      return acc;
    }, {
      totalQuantity: 0,
      totalSalePrice: 0,
      totalCostAverage: 0,
      totalCostCurrent: 0,
      differenceAverage: 0,
      differenceCurrent: 0,
    });
  }, [consumptionData]);

  if (loading) {
    return (
      <ReportsLayout title={t("titles.consumption")} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t("loading.consumption")}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t("titles.consumption")} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t("errors.failedToLoad", {error})}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t("titles.consumption")}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Items</p>
            <p className="text-2xl font-bold text-neutral-900">{formatNumber(consumptionData.length)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Sale Price</p>
            <p className="text-2xl font-bold text-neutral-900">{withCurrency(totals.totalSalePrice)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Cost (Average)</p>
            <p className="text-2xl font-bold text-neutral-900">{withCurrency(totals.totalCostAverage)}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">{t("labels.consumptionDetails")}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t("filters.item")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.code")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("columns.quantity")}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t("columns.uom")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Sale Price</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("metrics.costAvg")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("metrics.costCurrent")}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t("metrics.differenceAvg")}</th>
                  <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t("metrics.differenceCurrent")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {consumptionData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-sm text-neutral-500">
                      No consumption data found for the selected filters
                    </td>
                  </tr>
                ) : (
                  consumptionData.map((item) => (
                    <tr key={item.itemId}>
                      <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{item.itemName}</td>
                      <td className="py-3 px-3 text-sm text-neutral-700">{item.itemCode || "-"}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.totalQuantity, 4)}</td>
                      <td className="py-3 px-3 text-sm text-neutral-700">{item.uom || "-"}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(item.totalSalePrice)}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(item.totalCostAverage)}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(item.totalCostCurrent)}</td>
                      <td className={`py-3 px-3 text-right text-sm font-semibold ${item.differenceAverage >= 0 ? "text-success-600" : "text-danger-600"}`}>
                        {withCurrency(item.differenceAverage)}
                      </td>
                      <td className={`py-3 pr-6 text-right text-sm font-semibold ${item.differenceCurrent >= 0 ? "text-success-600" : "text-danger-600"}`}>
                        {withCurrency(item.differenceCurrent)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {consumptionData.length > 0 && (
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td colSpan={2} className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-900">{t("columns.total")}</td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {formatNumber(totals.totalQuantity, 4)}
                    </td>
                    <td colSpan={1}></td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {withCurrency(totals.totalSalePrice)}
                    </td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {withCurrency(totals.totalCostAverage)}
                    </td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {withCurrency(totals.totalCostCurrent)}
                    </td>
                    <td className={`py-3 px-3 text-right text-sm font-bold ${totals.differenceAverage >= 0 ? "text-success-600" : "text-danger-600"}`}>
                      {withCurrency(totals.differenceAverage)}
                    </td>
                    <td className={`py-3 pr-6 text-right text-sm font-bold ${totals.differenceCurrent >= 0 ? "text-success-600" : "text-danger-600"}`}>
                      {withCurrency(totals.differenceCurrent)}
                    </td>
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
