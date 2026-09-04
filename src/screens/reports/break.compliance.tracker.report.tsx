/**
 * AI Restaurant Break & Meal Period Compliance Tracker — monitors employee
 * breaks/meals for labor law compliance, calculates penalty liability.
 *
 * 102nd POSR-exclusive differentiator — $500-2,000 per violation, 5-15
 * violations/month = $2,500-7,500/mo liability.
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
  faMugHot, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faUtensils, faCoffee, faClock,
  faStopwatch, faPersonWalking, faChild, faFileSignature,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runBreakEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readBreakConfig, DEFAULT_BREAK_CONFIG,
  type BreakAlert,
} from "@/lib/break-compliance-tracker.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  missed_meal_period:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faUtensils,          label: 'MISSED MEAL' },
  missed_rest_break:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faCoffee,            label: 'MISSED BREAK' },
  late_meal_period:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,             label: 'LATE MEAL' },
  late_rest_break:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,             label: 'LATE BREAK' },
  short_break_duration:    { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faStopwatch,         label: 'SHORT BREAK' },
  overwork_no_break:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faPersonWalking,     label: 'OVERWORK' },
  minor_break_violation:   { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faChild,             label: 'MINOR VIOLATION' },
  meal_waiver_missing:     { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faFileSignature,     label: 'WAIVER MISSING' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function BreakComplianceTrackerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<BreakAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalPenalty: 0, totalLiability: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_BREAK_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readBreakConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[break-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runBreakEngine(db, config);
      toast.success(`Generated ${result.generated} break compliance alerts — ${fmt$(summary.totalPenalty)} penalties`);
      await reload();
    } catch (err) {
      console.error('[break-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalPenalty]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[break-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.penalty_amount ?? 0) - (a.penalty_amount ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Break Compliance", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faMugHot} className="text-amber-600" />
              AI Break & Meal Period Compliance Tracker
            </h1>
            <p className="text-sm text-neutral-500">
              Monitors employee breaks/meals — labor law compliance, penalty liability tracking
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Checking…' : 'Check compliance'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Critical violations" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faMugHot} label="Open alerts" value={String(summary.totalAlerts)} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Penalty liability" value={fmt$(summary.totalPenalty)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Monthly liability" value={fmt$(summary.totalLiability)} color="text-rose-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faMugHot} spin className="text-4xl mb-3" />
            <p>Loading break compliance alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No break compliance violations</p>
            <p className="text-sm mt-1">All breaks compliant with labor law.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faMugHot, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.employee_name}</span>
                          {alert.shift_date && <span className="text-xs text-neutral-400">{alert.shift_date}</span>}
                          {alert.is_minor && <span className="text-xs text-rose-600 font-medium bg-rose-50 px-1.5 py-0.5 rounded">MINOR</span>}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.hours_worked != null && <span>Hours: {alert.hours_worked}h</span>}
                          {alert.break_type && <span>Type: {alert.break_type}</span>}
                          {alert.break_due_at && <span>Due: {alert.break_due_at}</span>}
                          {alert.break_taken_at && <span>Taken: {alert.break_taken_at}</span>}
                          {alert.break_duration_min != null && alert.required_duration_min != null && (
                            <span className={alert.break_duration_min < alert.required_duration_min ? 'text-rose-600 font-medium' : ''}>
                              Duration: {alert.break_duration_min}min / {alert.required_duration_min}min required
                            </span>
                          )}
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
                      {alert.penalty_amount > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.penalty_amount)}</div>
                          <div className="text-xs text-neutral-400">penalty</div>
                        </>
                      )}
                      {alert.est_monthly_liability > 0 && (
                        <>
                          <div className="text-sm font-bold text-rose-600 mt-1">{fmt$(alert.est_monthly_liability)}</div>
                          <div className="text-xs text-neutral-400">monthly liability</div>
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

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Meal due: hour {config.mealDueHour}</span>
          <span>Rest interval: every {config.restIntervalHours}h</span>
          <span>Meal duration: {config.mealDurationMin}min</span>
          <span>Rest duration: {config.restDurationMin}min</span>
          <span>Penalty: {fmt$(config.penaltyAmount)}/violation</span>
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

export default BreakComplianceTrackerScreen;
