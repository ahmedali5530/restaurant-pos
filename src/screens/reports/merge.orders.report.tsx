import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {formatNumber} from "@/lib/utils.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";

type MergeRow = {
  id: string;
  created_at: unknown;
  created_by?: {first_name?: string; last_name?: string};
  new_order?: {id?: string; invoice_number?: number};
  old_orders?: Array<{id?: string; invoice_number?: number}>;
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  return {startDate, endDate};
};

export const MergeOrdersReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [rows, setRows] = useState<MergeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions: string[] = [];
        const params: Record<string, string> = {};

        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }
        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const query = `
          SELECT * FROM ${Tables.order_merge}
          ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY created_at DESC
          FETCH created_by, new_order, old_orders
        `;
        const [result] = await queryRef.current(query, params);
        setRows((result || []) as MergeRow[]);
      } catch (err) {
        console.error("Failed to load merge orders report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.endDate, filters.startDate]);

  if (loading) {
    return <ReportsLayout title={t('titles.mergeOrders')} subtitle={subtitle}><div className="py-12 text-center text-neutral-500">{t('loading.mergeOrders')}</div></ReportsLayout>;
  }

  if (error) {
    return <ReportsLayout title={t('titles.mergeOrders')} subtitle={subtitle}><div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title={t('titles.mergeOrders')} subtitle={subtitle}>
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
          <tr>
            <th className="py-3 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">Merged at</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">Merged by</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">New order</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">Old orders</th>
          </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">No merge events for selected range.</td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{toLuxonDateTime(row.created_at as any).toFormat("yyyy-LL-dd HH:mm")}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{`${row.created_by?.first_name || ""} ${row.created_by?.last_name || ""}`.trim() || "-"}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{row.new_order?.invoice_number ? `#${row.new_order.invoice_number}` : row.new_order?.id || "-"}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">
                {(row.old_orders || []).length > 0
                  ? (row.old_orders || []).map((order) => order?.invoice_number ? `#${order.invoice_number}` : order?.id || "-").join(", ")
                  : "-"}
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-sm text-neutral-600">Total merge events: <span className="font-semibold">{formatNumber(rows.length)}</span></div>
    </ReportsLayout>
  );
};
