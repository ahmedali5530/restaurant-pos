import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {useReportBranchScope} from "@/hooks/useReportBranchScope.ts";
import {BranchBreakdown} from "@/components/reports/branch.breakdown.tsx";
import {buildBranchInsideCondition} from "@/api/reports/shared/query.ts";

type SplitOrderRow = {
  id: string;
  created_at: unknown;
  branch_id?: string | null;
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

const SplitTable = ({rows}: {rows: SplitOrderRow[]}) => (
  <div className="overflow-hidden rounded-lg border border-border">
    <table className="min-w-full divide-y divide-neutral-200">
      <thead className="bg-surface">
      <tr>
        <th className="py-3 pl-6 pr-3 text-left text-sm font-semibold text-foreground">Created at</th>
        <th className="py-3 px-3 text-left text-sm font-semibold text-foreground">Order</th>
        <th className="py-3 px-3 text-left text-sm font-semibold text-foreground">Split #</th>
        <th className="py-3 px-3 text-left text-sm font-semibold text-foreground">Status</th>
        <th className="py-3 px-3 text-left text-sm font-semibold text-foreground">Table</th>
        <th className="py-3 px-3 text-left text-sm font-semibold text-foreground">User</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
      {rows.length === 0 ? (
        <tr>
          <td colSpan={6} className="py-6 text-center text-sm text-muted">No split orders for selected range.</td>
        </tr>
      ) : rows.map((row) => (
        <tr key={row.id}>
          <td className="py-3 pl-6 pr-3 text-sm text-foreground">{toLuxonDateTime(row.created_at as any).toFormat("yyyy-LL-dd HH:mm")}</td>
          <td className="py-3 px-3 text-sm text-foreground">{row.invoice_number ? `#${row.invoice_number}` : row.id}</td>
          <td className="py-3 px-3 text-sm text-foreground">{row.split ?? "-"}</td>
          <td className="py-3 px-3 text-sm text-foreground">{row.status || "-"}</td>
          <td className="py-3 px-3 text-sm text-foreground">{row.table ? `${row.table.name || "Table"} ${row.table.number || ""}`.trim() : "-"}</td>
          <td className="py-3 px-3 text-sm text-foreground">{`${row.user?.first_name || ""} ${row.user?.last_name || ""}`.trim() || "-"}</td>
        </tr>
      ))}
      </tbody>
    </table>
  </div>
);

export const SplitOrdersReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const branchScope = useReportBranchScope();
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
    if (!branchScope.ready) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions = [
          `(split != NONE OR status = 'Spilt' OR tags CONTAINS 'Split' OR tags CONTAINS 'Split Order')`,
        ];
        const params: Record<string, any> = {};

        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }
        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const branchFilter = buildBranchInsideCondition(branchScope.branchIds);
        if (branchFilter.emptyResult) {
          setRows([]);
          return;
        }
        if (branchFilter.condition) {
          conditions.push(branchFilter.condition);
          Object.assign(params, branchFilter.params);
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
  }, [branchScope.ready, branchScope.branchIds, filters.endDate, filters.startDate]);

  if (loading || !branchScope.ready) {
    return <ReportsLayout title={t('titles.splitOrders')} subtitle={subtitle}><div className="py-12 text-center text-muted">{t('loading.splitOrders')}</div></ReportsLayout>;
  }
  if (error) {
    return <ReportsLayout title={t('titles.splitOrders')} subtitle={subtitle}><div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title={t('titles.splitOrders')} subtitle={subtitle}>
      <BranchBreakdown
        enabled={branchScope.isByBranch}
        rows={rows}
        labels={branchScope.branchLabels}
        branchOrder={branchScope.branchOrder}
        renderSection={({rows: sectionRows, key}) => <SplitTable key={key} rows={sectionRows} />}
      />
    </ReportsLayout>
  );
};
