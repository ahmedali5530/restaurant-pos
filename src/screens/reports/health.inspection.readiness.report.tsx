/**
 * AI Health Inspection Readiness Predictor — FDA Food Code violation dashboard.
 *
 * 63rd POSR-exclusive differentiator — restaurants face surprise health
 * inspections that cost $500-5,000 per violation + letter grade drops
 * (A→B = 15-30% revenue loss) + temporary closures ($10k-50k/week).
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
  faClipboardCheck, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faTemperatureHalf, faPumpSoap, faBug,
  faSprayCan, faHandDots, faUtensils, faCalendarXmark, faGraduationCap,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runHealthEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readHealthConfig, DEFAULT_HEALTH_CONFIG,
  type HealthAlert,
} from "@/lib/health-inspection-readiness.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  temperature_control:     { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTemperatureHalf,  label: 'TEMP CONTROL' },
  surface_sanitation:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faPumpSoap,         label: 'SANITATION' },
  pest_control:            { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBug,              label: 'PEST CONTROL' },
  chemical_storage:        { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faSprayCan,         label: 'CHEMICALS' },
  hand_hygiene:            { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faHandDots,         label: 'HAND HYGIENE' },
  cross_contamination:     { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUtensils,         label: 'CROSS-CONTAM' },
  expired_food:            { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCalendarXmark,    label: 'EXPIRED FOOD' },
  training_certification:  { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faGraduationCap,    label: 'TRAINING' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const GRADE_COLOR: Record<string, string> = {
  A: 'text-emerald-600',
  B: 'text-amber-600',
  C: 'text-rose-600',
};

const VIOLATION_COLOR: Record<string, string> = {
  priority: 'text-rose-600',
  core: 'text-amber-600',
  foundation: 'text-neutral-500',
};

const ZONE_LABELS: Record<string, string> = {
  kitchen: 'Kitchen',
  prep_area: 'Prep Area',
  walk_in_cooler: 'Walk-in Cooler',
  walk_in_freezer: 'Walk-in Freezer',
  dish_station: 'Dish Station',
  front_of_house: 'Front of House',
  storage: 'Storage',
  restrooms: 'Restrooms',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

const scoreColor = (score: number): string => {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 80) return 'text-amber-600';
  if (score >= 70) return 'text-orange-600';
  return 'text-rose-600';
};

const scoreBarColor = (score: number): string => {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 80) return 'bg-amber-500';
  if (score >= 70) return 'bg-orange-500';
  return 'bg-rose-500';
};

export function HealthInspectionReadinessScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalFines: 0, totalRevenueRisk: 0 });
  const [readinessScore, setReadinessScore] = useState(0);
  const [predictedGrade, setPredictedGrade] = useState('A');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_HEALTH_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readHealthConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[health-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runHealthEngine(db, config);
      toast.success(`Generated ${result.generated} health alerts — readiness ${result.readinessScore}/100 (grade ${result.predictedGrade})`);
      setReadinessScore(result.readinessScore);
      setPredictedGrade(result.predictedGrade);
      await reload();
    } catch (err) {
      console.error('[health-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'fixed' | 'scheduled' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[health-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_revenue_risk ?? 0) - (a.est_revenue_risk ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Health Inspection Readiness", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClipboardCheck} className="text-emerald-600" />
              AI Health Inspection Readiness
            </h1>
            <p className="text-sm text-neutral-500">
              FDA Food Code violation detection — predicts letter grade + revenue risk
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Run readiness scan'}
            </Button>
          </div>
        </div>

        {/* Readiness score + grade banner */}
        <div className="bg-gradient-to-r from-emerald-50 to-sky-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-sm text-neutral-600 mb-1">Predicted Health Inspection Grade</div>
              <div className="flex items-center gap-3">
                <span className={`text-5xl font-bold ${GRADE_COLOR[predictedGrade]}`}>{predictedGrade}</span>
                <div>
                  <div className={`text-2xl font-bold ${scoreColor(readinessScore)}`}>{readinessScore}/100</div>
                  <div className="text-xs text-neutral-500">readiness score</div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-neutral-600">Target grade</div>
              <div className={`text-2xl font-bold ${GRADE_COLOR[config.targetGrade] ?? 'text-neutral-700'}`}>{config.targetGrade}</div>
              <div className="text-xs text-neutral-500">(≥{config.gradeAThreshold}% for A)</div>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical violations"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faClipboardCheck}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-amber-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="Est. fines if inspected"
            value={fmt$(summary.totalFines)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Revenue at risk /mo"
            value={fmt$(summary.totalRevenueRisk)}
            color="text-rose-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faClipboardCheck} spin className="text-4xl mb-3" />
            <p>Loading health alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No open health violations</p>
            <p className="text-sm mt-1">Run readiness scan to check all zones.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faClipboardCheck, label: alert.rule_id.toUpperCase() };
              const zoneLabel = ZONE_LABELS[alert.zone] ?? alert.zone;
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
                          <span className="font-semibold text-neutral-800">{zoneLabel}</span>
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          <span className={`text-xs font-medium ${VIOLATION_COLOR[alert.violation_type] ?? 'text-neutral-500'}`}>
                            {alert.violation_type} violation
                          </span>
                          {alert.days_overdue != null && alert.days_overdue > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                              <FontAwesomeIcon icon={faCalendarXmark} /> {alert.days_overdue}d overdue
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {/* Score bar */}
                          <div className="flex items-center gap-2">
                            <span>Score:</span>
                            <div className="w-24 h-2 bg-neutral-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${scoreBarColor(alert.current_score)}`}
                                style={{ width: `${alert.current_score}%` }}
                              />
                            </div>
                            <span className={`font-medium ${scoreColor(alert.current_score)}`}>{alert.current_score}/100</span>
                          </div>
                          {alert.est_fix_time_min != null && alert.est_fix_time_min > 0 && (
                            <span>Fix time: ~{alert.est_fix_time_min} min</span>
                          )}
                        </div>
                        {alert.correction_action && alert.correction_action !== 'No action needed' && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span><strong>Fix:</strong> {alert.correction_action}</span>
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
                      <div className="text-sm font-bold text-rose-600">{fmt$(alert.est_fine)}</div>
                      <div className="text-xs text-neutral-400">est. fine</div>
                      {alert.est_revenue_risk > 0 && (
                        <>
                          <div className="text-sm font-bold text-rose-600 mt-1">{fmt$(alert.est_revenue_risk)}</div>
                          <div className="text-xs text-neutral-400">rev risk/mo</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'fixed')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Fixed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'scheduled')}>
                      <FontAwesomeIcon icon={faCalendarXmark} /> Schedule
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
          <span>Target grade: <span className="font-medium text-neutral-700">{config.targetGrade}</span></span>
          <span>Checklist frequency: {config.checklistFrequency}x/day</span>
          <span>A threshold: ≥{config.gradeAThreshold}%</span>
          <span>B threshold: ≥{config.gradeBThreshold}%</span>
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

export default HealthInspectionReadinessScreen;
