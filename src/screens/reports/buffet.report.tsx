import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {formatNumber} from "@/lib/utils.ts";
import {
  BuffetReportLine,
  fetchBuffetReportLines,
} from "@/lib/inventory/buffet.service.ts";

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    dateFrom: params.get("start") || undefined,
    dateTo: params.get("end") || undefined,
    storeId: params.get("store") || undefined,
    sessionType: (params.get("sessionType") || undefined) as BuffetReportLine["sessionType"] | undefined,
  };
};

export const BuffetReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const dbRef = useRef(db);
  const [lines, setLines] = useState<BuffetReportLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle =
    filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom} to ${filters.dateTo}`
      : undefined;

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const reportLines = await fetchBuffetReportLines(dbRef.current, {
          storeId: filters.storeId,
          sessionType: filters.sessionType,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          status: "closed",
        });
        setLines(reportLines);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [filters.dateFrom, filters.dateTo, filters.storeId, filters.sessionType]);

  const totals = useMemo(() => ({
    sales: lines.reduce((sum, l) => sum + l.totalSales, 0),
    foodCost: lines.reduce((sum, l) => sum + l.totalFoodCost, 0),
    profit: lines.reduce((sum, l) => sum + l.profit, 0),
    guests: lines.reduce((sum, l) => sum + l.actualGuests, 0),
  }), [lines]);

  return (
    <ReportsLayout title={t("titles.buffetReport")} subtitle={subtitle}>
      {loading && <p>{t("common:loading")}</p>}
      {error && <p className="text-danger-600">{error}</p>}
      {!loading && !error && (
        <>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-neutral-500">{t("buffet.totalSales")}</div>
          <div className="text-xl font-semibold">{formatNumber(totals.sales)}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-neutral-500">{t("buffet.totalFoodCost")}</div>
          <div className="text-xl font-semibold">{formatNumber(totals.foodCost)}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-neutral-500">{t("buffet.profit")}</div>
          <div className="text-xl font-semibold">{formatNumber(totals.profit)}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-neutral-500">{t("buffet.totalGuests")}</div>
          <div className="text-xl font-semibold">{totals.guests}</div>
        </div>
      </div>

      <table className="table table-sm bg-white w-full">
        <thead>
          <tr>
            <th>{t("buffet.sessionNumber")}</th>
            <th>{t("buffet.businessDate")}</th>
            <th>{t("buffet.sessionType")}</th>
            <th>{t("labels.store")}</th>
            <th>{t("buffet.actualGuests")}</th>
            <th>{t("buffet.totalSales")}</th>
            <th>{t("buffet.totalFoodCost")}</th>
            <th>{t("buffet.costPerGuest")}</th>
            <th>{t("buffet.wastePercent")}</th>
            <th>{t("buffet.overproduction")}</th>
            <th>{t("buffet.profit")}</th>
            <th>{t("buffet.profitMargin")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.sessionId}>
              <td>{line.sessionNumber}</td>
              <td>{line.businessDate}</td>
              <td>{t(`buffet.sessionTypes.${line.sessionType}`)}</td>
              <td>{line.storeName}</td>
              <td>{line.actualGuests}</td>
              <td>{formatNumber(line.totalSales)}</td>
              <td>{formatNumber(line.totalFoodCost)}</td>
              <td>{formatNumber(line.costPerGuest)}</td>
              <td>{line.wastePercent}%</td>
              <td>{formatNumber(line.totalOverproduction)}</td>
              <td>{formatNumber(line.profit)}</td>
              <td>{line.profitMargin}%</td>
            </tr>
          ))}
        </tbody>
      </table>
        </>
      )}
    </ReportsLayout>
  );
};
