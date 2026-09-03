import {useCallback, useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useDB} from "@/api/db/db.ts";
import {getLaborDashboardSnapshot} from "@/api/reports/labor/dashboard.ts";
import type {LaborDashboardSnapshot} from "@/api/reports/labor/shared/types.ts";
import {Button} from "@/components/common/input/button.tsx";
import {formatNumber} from "@/lib/utils.ts";

const StatCard = ({label, value}: { label: string; value: string | number }) => (
  <div className="rounded-xl border-2 border-neutral-200 p-4 bg-white">
    <div className="text-sm text-neutral-500">{label}</div>
    <div className="text-2xl font-semibold mt-1">{value}</div>
  </div>
);

export const HrDashboard = () => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [snapshot, setSnapshot] = useState<LaborDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLaborDashboardSnapshot(db);
      setSnapshot(data);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  if (loading && !snapshot) {
    return <div className="p-6">{t("buttons.loading")}</div>;
  }

  const data = snapshot ?? {
    asOf: "",
    clockedInCount: 0,
    onBreakCount: 0,
    scheduledTodayCount: 0,
    missingCount: 0,
    lateTodayCount: 0,
    currentLaborCost: 0,
    projectedEodCost: 0,
    laborCostToday: 0,
    salesToday: 0,
    laborPercent: 0,
    salesPerLaborHour: 0,
    overtimeHoursToday: 0,
    pendingApprovals: 0,
    activeHeadcount: 0,
    avgHourlyCost: 0,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">{t("dashboard.title")}</h2>
        <Button variant="primary" onClick={() => void loadSnapshot()} disabled={loading}>
          {t("dashboard.refreshSnapshot")}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t("dashboard.clockedIn")} value={data.clockedInCount}/>
        <StatCard label={t("dashboard.onBreak")} value={data.onBreakCount}/>
        <StatCard label={t("dashboard.scheduledToday")} value={data.scheduledTodayCount}/>
        <StatCard label={t("dashboard.missing")} value={data.missingCount}/>
        <StatCard label={t("dashboard.lateToday")} value={data.lateTodayCount}/>
        <StatCard label={t("dashboard.headcount")} value={data.activeHeadcount}/>
        <StatCard label={t("dashboard.pendingApprovals")} value={data.pendingApprovals}/>
        <StatCard label={t("dashboard.laborPercent")} value={`${formatNumber(data.laborPercent)}%`}/>
        <StatCard label={t("dashboard.laborCostToday")} value={formatNumber(data.laborCostToday)}/>
        <StatCard label={t("dashboard.projectedCost")} value={formatNumber(data.projectedEodCost)}/>
        <StatCard label={t("dashboard.salesToday")} value={formatNumber(data.salesToday)}/>
        <StatCard label={t("dashboard.salesPerLaborHour")} value={formatNumber(data.salesPerLaborHour)}/>
        <StatCard label={t("dashboard.overtimeToday")} value={formatNumber(data.overtimeHoursToday)}/>
        <StatCard label={t("dashboard.avgHourlyCost")} value={formatNumber(data.avgHourlyCost)}/>
      </div>
    </div>
  );
};
