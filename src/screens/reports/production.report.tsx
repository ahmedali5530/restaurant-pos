import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {formatNumber} from "@/lib/utils.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {
  fetchProductionLinesForReport,
  ProductionReportLine,
} from "@/lib/inventory/production.service.ts";

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    startDate: params.get("start") || undefined,
    endDate: params.get("end") || undefined,
    storeId: params.get("store") || undefined,
    recipeId: params.get("recipe") || undefined,
  };
};

type BatchSummary = {
  batchId: string;
  batchNumber: string;
  createdAt: Date;
  recipeName: string;
  storeName: string;
  producedQty: number;
  totalInputCost: number;
  totalOutputCost: number;
  yieldLossPercent: number;
  lines: ProductionReportLine[];
};

export const ProductionReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const dbRef = useRef(db);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
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
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const lines = await fetchProductionLinesForReport(dbRef.current, {
          dateFrom: filters.startDate,
          dateTo: filters.endDate,
          storeId: filters.storeId,
          recipeId: filters.recipeId,
        });

        const batchMap = new Map<string, BatchSummary>();
        for (const line of lines) {
          if (!batchMap.has(line.batchId)) {
            batchMap.set(line.batchId, {
              batchId: line.batchId,
              batchNumber: line.batchNumber,
              createdAt: line.createdAt,
              recipeName: line.recipeName,
              storeName: line.storeName,
              producedQty: line.producedQty,
              totalInputCost: line.totalInputCost,
              totalOutputCost: line.totalOutputCost,
              yieldLossPercent: line.yieldLossPercent,
              lines: [],
            });
          }
          batchMap.get(line.batchId)!.lines.push(line);
        }

        setBatches(
          Array.from(batchMap.values()).sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.unableToLoad"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [filters.startDate, filters.endDate, filters.storeId, filters.recipeId, t]);

  return (
    <ReportsLayout title={t("reports.productionReport")} subtitle={subtitle}>
      {loading && <p>{t("common:loading")}</p>}
      {error && <p className="text-danger-600">{error}</p>}
      {!loading && !error && (
        <>
      <table className="table table-hover table-sm bg-white w-full">
        <thead>
          <tr>
            <th>{t("production.batchNumber")}</th>
            <th>{t("production.date")}</th>
            <th>{t("labels.recipe")}</th>
            <th>{t("labels.store")}</th>
            <th>{t("production.producedQty")}</th>
            <th>{t("production.yieldLoss")}</th>
            <th>{t("production.inputCost")}</th>
            <th>{t("production.outputCost")}</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr key={batch.batchId}>
              <td>{batch.batchNumber}</td>
              <td>
                {toLuxonDateTime(batch.createdAt).toFormat(import.meta.env.VITE_DATE_FORMAT)}
              </td>
              <td>{batch.recipeName}</td>
              <td>{batch.storeName}</td>
              <td>{formatNumber(batch.producedQty)}</td>
              <td>{formatNumber(batch.yieldLossPercent)}%</td>
              <td>{formatNumber(batch.totalInputCost)}</td>
              <td>{formatNumber(batch.totalOutputCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {batches.map((batch) => (
        <div key={`detail-${batch.batchId}`} className="mt-6">
          <h3 className="text-lg font-medium mb-2">
            {batch.batchNumber} — {t("production.lineDetails")}
          </h3>
          <table className="table table-sm bg-white w-full">
            <thead>
              <tr>
                <th>{t("labels.item")}</th>
                <th>{t("labels.direction")}</th>
                <th>{t("labels.quantity")}</th>
                <th>{t("labels.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {batch.lines.map((line, index) => (
                <tr key={`${line.batchId}-${line.itemId}-${index}`}>
                  <td>{line.itemName}</td>
                  <td>{line.direction === "in" ? t("production.in") : t("production.out")}</td>
                  <td>{formatNumber(line.quantity)}</td>
                  <td>{formatNumber(line.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
        </>
      )}
    </ReportsLayout>
  );
};
