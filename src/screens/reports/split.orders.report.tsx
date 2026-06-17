import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";

type SplitOrderRow = {
  id: string;
  created_at: unknown;
  invoice_number?: number;
  split?: number;
  status?: string;
  tags?: string[];
  user?: {first_name?: string; last_name?: string};
  table?: {name?: string; number?: string | number};
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  return {startDate, endDate};
};

export const SplitOrdersReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [rows, setRows] = useState<SplitOrderRow[]>([]);
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

        const conditions = [
          `(split != NONE OR status = 'Spilt' OR tags CONTAINS 'Split' OR tags CONTAINS 'Split Order')`,
        ];
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
          SELECT * FROM ${Tables.orders}
          WHERE ${conditions.join(" AND ")}
          ORDER BY created_at DESC
          FETCH user, table
        `;

        const [result] = await queryRef.current(query, params);
        setRows((result || []) as SplitOrderRow[]);
      } catch (err) {
        console.error("Failed to load split orders report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.endDate, filters.startDate]);

  if (loading) {
    return <ReportsLayout title={t('titles.splitOrders')} subtitle={subtitle}><div className="py-12 text-center text-neutral-500">{t('loading.splitOrders')}</div></ReportsLayout>;
  }
  if (error) {
    return <ReportsLayout title={t('titles.splitOrders')} subtitle={subtitle}><div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title={t('titles.splitOrders')} subtitle={subtitle}>
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
          <tr>
            <th className="py-3 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">Created at</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">{t('columns.order')}</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">Split #</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">{t('filters.status')}</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">{t('filters.table')}</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">{t('filters.user')}</th>
          </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-neutral-500">No split orders for selected range.</td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{toLuxonDateTime(row.created_at as any).toFormat("yyyy-LL-dd HH:mm")}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{row.invoice_number ? `#${row.invoice_number}` : row.id}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{row.split ?? "-"}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{row.status || "-"}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{row.table ? `${row.table.name || "Table"} ${row.table.number || ""}`.trim() : "-"}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{`${row.user?.first_name || ""} ${row.user?.last_name || ""}`.trim() || "-"}</td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </ReportsLayout>
  );
};
