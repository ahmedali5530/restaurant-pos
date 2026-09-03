/**
 * AI Restaurant Opening & Closing Procedure Automator — generates daily
 * checklists, tracks completion, alerts on missed/overdue tasks.
 *
 * 89th POSR-exclusive differentiator — restaurants lose $200-500/mo per
 * location from inconsistent opening/closing procedures.
 */

import { useState, useCallback, useMemo } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboardList, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faFire, faTemperatureHalf, faBroom,
  faLock, faUserClock, faBoxesStacked, faDesktop, faPowerOff,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runProcedureEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readProcedureConfig, DEFAULT_PROCEDURE_CONFIG,
  type ProcedureAlert,
} from "@/lib/opening-closing-automator.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  equipment_startup_missed:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faFire,            label: 'EQUIPMENT STARTUP' },
  temp_check_overdue:         { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTemperatureHalf, label: 'TEMP CHECK' },
  cleaning_incomplete:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBroom,           label: 'CLEANING' },
  security_breach_risk:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faLock,            label: 'SECURITY' },
  staffing_gap_opening:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUserClock,       label: 'STAFFING GAP' },
  inventory_prep_missed:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faBoxesStacked,    label: 'PREP MISSED' },
  system_failure_risk:        { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faDesktop,         label: 'SYSTEM' },
  closing_equipment_left_on:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faPowerOff,        label: 'EQUIPMENT ON' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const SHIFT_COLOR: Record<string, string> = {
  opening: 'bg-amber-100 text-amber-700',
  closing: 'bg-violet-100 text-violet-700',
};

const ZONE_COLOR: Record<string, string> = {
  kitchen: 'text-orange-600',
  front_of_house: 'text-sky-600',
  storage: 'text-emerald-600',
  office: 'text-neutral-600',
  exterior: 'text-amber-600',
  all: 'text-neutral-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function OpeningClosingAutomatorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ProcedureAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalRevenueImpact: 0, totalRiskCost: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PROCEDURE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readProcedureConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[procedure-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runProcedureEngine(db, config);
      toast.success(`Generated ${result.generated} procedure alerts`);
      await reload();
    } catch (err) {
      console.error('[procedure-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'completed' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[procedure-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_risk_cost + b.est_revenue_impact) - (a.est_risk_cost + a.est_revenue_impact);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Opening/Closing Automator", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClipboardList} className="text-sky-600" />
              AI Opening & Closing Procedure Automator
            </h1>
            <p className="text-sm text-neutral-500">
              Daily checklist automation — equipment, temp checks, cleaning, security, systems
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Scanning…' : 'Run procedure scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical alerts"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faClipboardList}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-sky-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="Revenue impact"
            value={fmt$(summary.totalRevenueImpact)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faLock}
            label="Risk cost"
            value={fmt$(summary.totalRiskCost)}
            color="text-rose-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faClipboardList} spin className="text-4xl mb-3" />
            <p>Loading procedure alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No procedure alerts</p>
            <p className="text-sm mt-1">All opening/closing tasks on track.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faClipboardList, label: alert.rule_id.toUpperCase() };
              return (
                <div key={alert.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-neutral-800">{alert.task_name}</span>
                          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${SHIFT_COLOR[alert.shift_type] ?? SHIFT_COLOR.opening}`}>
                            {alert.shift_type}
                          </span>
                          {alert.zone && (
                            <span className={`text-xs font-medium ${ZONE_COLOR[alert.zone] ?? 'text-neutral-500'}`}>
                              {alert.zone.replace(/_/g, ' ')}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          {alert.minutes_overdue != null && alert.minutes_overdue > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                              <FontAwesomeIcon icon={faUserClock} /> {alert.minutes_overdue} min overdue
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.assigned_to && <span>Assigned: <span className="font-medium text-neutral-700">{alert.assigned_to}</span></span>}
                          {alert.due_time && <span>Due: {alert.due_time}</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {alert.est_revenue_impact > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_revenue_impact)}</div>
                          <div className="text-xs text-neutral-400">rev impact</div>
                        </>
                      )}
                      {alert.est_risk_cost > 0 && (
                        <>
                          <div className="text-sm font-bold text-rose-600 mt-1">{fmt$(alert.est_risk_cost)}</div>
                          <div className="text-xs text-neutral-400">risk cost</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'completed')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Completed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> In progress
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Config footer */}
        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Opening: {config.openingTime}</span>
          <span>Closing: {config.closingTime}</span>
          <span>Prep starts: -{config.openingPrepMin} min before opening</span>
          <span>Closing check: +{config.closingCheckMin} min after closing</span>
          <span>Overdue alert: +{config.overdueAlertMin} min</span>
        </div>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center gap-3">
      <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default OpeningClosingAutomatorScreen;
