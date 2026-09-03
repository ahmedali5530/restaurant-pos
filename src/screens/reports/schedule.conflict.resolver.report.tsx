/**
 * AI Staff Schedule Conflict Resolver — detects + resolves 8 conflict types.
 *
 * 64th POSR-exclusive differentiator — restaurant managers spend 2-4 hours/week
 * manually resolving schedule conflicts (NRA). Labor law violations cost
 * $500-5,000 per occurrence.
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
  faCalendarXmark, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faUserClock, faClockRotateLeft, faBed,
  faHourglassHalf, faUsersSlash, faUserTag, faCalendarMinus, faCalendarPlus,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runSchedConflictEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readSchedConflictConfig, DEFAULT_SCHEDCONFLICT_CONFIG,
  type SchedConflictAlert,
} from "@/lib/schedule-conflict-resolver.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  double_booking:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faUserClock,        label: 'DOUBLE-BOOK' },
  shift_overlap:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faClockRotateLeft,  label: 'OVERLAP' },
  short_rest_period:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBed,              label: 'SHORT REST' },
  max_hours_exceeded:  { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faHourglassHalf,    label: 'MAX HOURS' },
  understaffing:       { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faUsersSlash,       label: 'UNDERSTAFF' },
  role_mismatch:       { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faUserTag,          label: 'ROLE MISMATCH' },
  preference_conflict: { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCalendarMinus,    label: 'PREF CONFLICT' },
  uncovered_shift:     { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faCalendarPlus,     label: 'UNCOVERED' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const COMPLIANCE_COLOR: Record<string, string> = {
  none: 'text-neutral-400',
  minor: 'text-amber-600',
  major: 'text-orange-600',
  critical: 'text-rose-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function ScheduleConflictResolverScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<SchedConflictAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, complianceViolations: 0, totalFines: 0, totalRevenueImpact: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SCHEDCONFLICT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSchedConflictConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[schedconflict-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runSchedConflictEngine(db, config);
      toast.success(`Generated ${result.generated} schedule conflict alerts`);
      await reload();
    } catch (err) {
      console.error('[schedconflict-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[schedconflict-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_fine + b.est_revenue_impact) - (a.est_fine + a.est_revenue_impact);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Schedule Conflict Resolver", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarXmark} className="text-rose-600" />
              AI Schedule Conflict Resolver
            </h1>
            <p className="text-sm text-neutral-500">
              Detects double-booking, labor law violations, understaffing — auto-suggests resolutions
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Scanning…' : 'Scan for conflicts'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Compliance violations"
            value={String(summary.complianceViolations)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faCalendarXmark}
            label="Critical conflicts"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faUserClock}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-amber-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Fines + revenue at risk"
            value={fmt$(summary.totalFines + summary.totalRevenueImpact)}
            color="text-rose-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCalendarXmark} spin className="text-4xl mb-3" />
            <p>Loading schedule conflicts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No schedule conflicts detected</p>
            <p className="text-sm mt-1">Run conflict scan to check all shifts.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faCalendarXmark, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">
                            {alert.employee_name ?? 'Shift coverage'}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          {alert.compliance_risk !== 'none' && (
                            <span className={`text-xs font-medium ${COMPLIANCE_COLOR[alert.compliance_risk]}`}>
                              <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1" />
                              {alert.compliance_risk} compliance risk
                            </span>
                          )}
                          {alert.shift_date && (
                            <span className="text-xs text-neutral-400">{alert.shift_date}</span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.shift_id_1 && (
                            <span>Shift: <span className="font-medium text-neutral-700">{alert.shift_id_1}</span>{alert.shift_id_2 ? ` + ${alert.shift_id_2}` : ''}</span>
                          )}
                          {alert.rest_hours != null && (
                            <span className={alert.rest_hours < 8 ? 'text-rose-600 font-medium' : ''}>
                              Rest: {alert.rest_hours}h
                            </span>
                          )}
                          {alert.weekly_hours != null && (
                            <span className={alert.weekly_hours > 40 ? 'text-rose-600 font-medium' : ''}>
                              Weekly: {alert.weekly_hours}h
                            </span>
                          )}
                          {alert.role_assigned && (
                            <span>Role: <span className="font-medium text-neutral-700">{alert.role_assigned}</span>{alert.role_qualified ? ` (qualified: ${alert.role_qualified})` : ''}</span>
                          )}
                          {alert.zone && <span>Zone: {alert.zone.replace('_', ' ')}</span>}
                        </div>
                        {alert.resolution_action && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span><strong>Fix:</strong> {alert.resolution_action}</span>
                          </div>
                        )}
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {alert.est_fine > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_fine)}</div>
                          <div className="text-xs text-neutral-400">est. fine</div>
                        </>
                      )}
                      {alert.est_revenue_impact > 0 && (
                        <>
                          <div className="text-sm font-bold text-rose-600 mt-1">{fmt$(alert.est_revenue_impact)}</div>
                          <div className="text-xs text-neutral-400">rev impact</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Resolved
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
          <span>Min rest: {config.minRestHours}h</span>
          <span>Max weekly: {config.maxWeeklyHours}h</span>
          <span>Minor cutoff: {config.minorCutoffHour}:00</span>
          <span>Target coverage: {config.targetCoveragePct}%</span>
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

export default ScheduleConflictResolverScreen;
