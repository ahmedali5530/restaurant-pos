import {useEffect, useMemo, useRef, useState} from "react";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Tracking} from "@/api/model/tracking.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  return {startDate, endDate};
};

export const ActivityReport = () => {
  const db = useDB();
  const queryRef = useRef(db.query);
  const [rows, setRows] = useState<Tracking[]>([]);
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
          SELECT * FROM ${Tables.tracking}
          ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY created_at DESC
        `;
        const [result] = await queryRef.current(query, params);
        setRows((result || []) as Tracking[]);
      } catch (err) {
        console.error("Failed to load activity report", err);
        setError(err instanceof Error ? err.message : "Unable to load report");
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.endDate, filters.startDate]);

  if (loading) {
    return <ReportsLayout title="Activity report" subtitle={subtitle}><div className="py-12 text-center text-neutral-500">Loading activity report...</div></ReportsLayout>;
  }
  if (error) {
    return <ReportsLayout title="Activity report" subtitle={subtitle}><div className="py-12 text-center text-red-600">Failed to load report: {error}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title="Activity report" subtitle={subtitle}>
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
          <tr>
            <th className="py-3 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">Time</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">User</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">Role</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">Module</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">Page</th>
            <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">Auth</th>
            <th className="py-3 pr-6 text-left text-sm font-semibold text-neutral-700">Device</th>
          </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-6 text-center text-sm text-neutral-500">No activity logs for selected range.</td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{toLuxonDateTime(row.created_at as any).toFormat("yyyy-LL-dd HH:mm:ss")}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{String(row.user || "-")}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{String(row.user_role || "-")}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{row.module || "-"}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{row.page || "-"}</td>
              <td className="py-3 px-3 text-sm text-neutral-700">{row.auth_method || "-"}</td>
              <td className="py-3 pr-6 text-sm text-neutral-700">
                <div>{row.resolution || "-"}</div>
                <div className="text-xs text-neutral-500">{row.user_agent || "-"}</div>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </ReportsLayout>
  );
};
