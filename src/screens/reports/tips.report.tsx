import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { ReportsLayout } from "@/screens/partials/reports.layout.tsx";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { withCurrency, toRecordId } from "@/lib/utils.ts";
import { useReportBranchScope } from "@/hooks/useReportBranchScope.ts";
import { BranchBreakdown } from "@/components/reports/branch.breakdown.tsx";
import { buildBranchInsideCondition, buildCreatedAtDateConditions } from "@/api/reports/shared/query.ts";

const normalizeId = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "tb" in value && "id" in value) return `${value.tb}:${value.id}`;
  if (typeof value?.toString === "function") return value.toString();
  return String(value);
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  const shiftId = params.get("shift");
  return { startDate, endDate, shiftId };
};

type TipDistributionRow = {
  branch_id?: string | null;
  total_tips?: number;
  users?: Array<{ user?: { first_name?: string; last_name?: string }; amount?: number }>;
};

const TipsSection = ({ distributions }: { distributions: TipDistributionRow[] }) => {
  const { t } = useTranslation('reports');
  const totalTips = distributions.reduce((sum, distribution) => sum + safeNumber(distribution.total_tips), 0);
  const totalDistributions = distributions.length;

  const tipsByUser = useMemo(() => {
    const map = new Map<string, number>();
    distributions.forEach((distribution: any) => {
      (distribution.users || []).forEach((share: any) => {
        const user = share?.user;
        const userName = user
          ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown"
          : normalizeId(share?.user) || "Unknown";
        map.set(userName, (map.get(userName) || 0) + safeNumber(share?.amount));
      });
    });
    return Array.from(map.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [distributions]);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="border rounded-lg p-4 bg-surface">
          <div className="text-sm text-muted">Total tips</div>
          <div className="text-2xl font-semibold">{withCurrency(totalTips)}</div>
        </div>
        <div className="border rounded-lg p-4 bg-surface">
          <div className="text-sm text-muted">Saved distributions</div>
          <div className="text-2xl font-semibold">{totalDistributions}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-surface">
            <tr>
              <th className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-foreground">{t('filters.user')}</th>
              <th className="py-3.5 pr-6 text-right text-sm font-semibold text-foreground">{t('reports.tips')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
            {tipsByUser.length > 0 ? (
              tipsByUser.map((item) => (
                <tr key={item.name}>
                  <td className="py-3 pl-6 pr-3 text-sm text-foreground">{item.name}</td>
                  <td className="py-3 pr-6 text-right text-sm font-semibold text-foreground">{withCurrency(item.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="py-6 text-center text-sm text-muted">No tips found for selected filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export const TipsReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const branchScope = useReportBranchScope();
  const queryRef = useRef(db.query);
  const [distributions, setDistributions] = useState<TipDistributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shiftName, setShiftName] = useState<string>("All shifts");
  const filters = useMemo(parseFilters, []);

  const subtitle = useMemo(() => {
    const datePart = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : "All dates";
    const shiftPart = shiftName || "All shifts";
    return `${datePart} | ${shiftPart}`;
  }, [filters.startDate, filters.endDate, shiftName]);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    if (!branchScope.ready) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (filters.shiftId) {
          const [shiftRows] = await queryRef.current(`SELECT name FROM ${Tables.shifts} WHERE id = $id LIMIT 1`, { id: toRecordId(filters.shiftId) });
          setShiftName(shiftRows?.[0]?.name || "Selected shift");
        } else {
          setShiftName("All shifts");
        }

        const {conditions: dateConditions, params: dateParams} = buildCreatedAtDateConditions(
          {startDate: filters.startDate ?? undefined, endDate: filters.endDate ?? undefined},
          "from_at",
        );
        const conditions: string[] = [...dateConditions];
        const params: Record<string, any> = {...dateParams};
        if (filters.shiftId) {
          conditions.push(`shift = $shiftId`);
          params.shiftId = toRecordId(filters.shiftId);
        }

        const branchFilter = buildBranchInsideCondition(branchScope.branchIds);
        if (branchFilter.emptyResult) {
          setDistributions([]);
          return;
        }
        if (branchFilter.condition) {
          conditions.push(branchFilter.condition);
          Object.assign(params, branchFilter.params);
        }

        const query = `
          SELECT * FROM ${Tables.tip_distributions}
          ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
          FETCH shift, users, users.user
        `;

        const [rows] = await queryRef.current(query, params);
        setDistributions((rows || []) as TipDistributionRow[]);
      } catch (err) {
        console.error("Failed to load tips report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [branchScope.ready, branchScope.branchIds, filters.startDate, filters.endDate, filters.shiftId]);

  if (loading || !branchScope.ready) {
    return <ReportsLayout title={t('titles.tips')} subtitle={subtitle}><div className="py-12 text-center text-muted">{t('loading.tips')}</div></ReportsLayout>;
  }

  if (error) {
    return <ReportsLayout title={t('titles.tips')} subtitle={subtitle}><div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title={t('titles.tips')} subtitle={subtitle}>
      <BranchBreakdown
        enabled={branchScope.isByBranch}
        rows={distributions}
        labels={branchScope.branchLabels}
        branchOrder={branchScope.branchOrder}
        renderSection={({ rows, key }) => <TipsSection key={key} distributions={rows} />}
      />
    </ReportsLayout>
  );
};
