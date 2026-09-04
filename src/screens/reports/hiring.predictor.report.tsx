/**
 * AI Restaurant Staff Hiring Predictor — scores candidates against top
 * performer profiles, predicts retention, recommends hire/no-hire.
 *
 * 100th POSR-exclusive differentiator — 75% annual turnover, bad hires cost
 * $3,000-5,000 each. No POS has hiring prediction.
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
  faUserPlus, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faStar, faArrowRightArrowLeft, faGraduationCap,
  faDollarSign, faClock, faUsers, faHandshakeSlash, faArrowUpRightDots,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runHiringEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readHiringConfig, DEFAULT_HIRING_CONFIG,
  type HiringAlert,
} from "@/lib/hiring-predictor.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  success_profile_match:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faStar,              label: 'TOP MATCH' },
  retention_risk_high:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faArrowRightArrowLeft, label: 'RETENTION RISK' },
  skill_gap_identified:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGraduationCap,     label: 'SKILL GAP' },
  salary_mismatch:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faDollarSign,        label: 'SALARY MISMATCH' },
  peak_availability_gap:     { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faClock,             label: 'AVAILABILITY' },
  training_cost_high:        { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faGraduationCap,     label: 'TRAINING COST' },
  cultural_fit_concern:      { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faHandshakeSlash,    label: 'FIT CONCERN' },
  experience_overqualified:  { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faArrowUpRightDots,  label: 'OVERQUALIFIED' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const ROLE_COLOR: Record<string, string> = {
  server: 'text-sky-600',
  cook: 'text-orange-600',
  bartender: 'text-violet-600',
  host: 'text-emerald-600',
  manager: 'text-rose-600',
  dishwasher: 'text-neutral-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

const scoreColor = (score: number): string => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 65) return 'text-amber-600';
  if (score >= 50) return 'text-orange-600';
  return 'text-rose-600';
};

export function HiringPredictorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<HiringAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalTurnoverRisk: 0, totalTrainingCost: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_HIRING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readHiringConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[hiring-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runHiringEngine(db, config);
      toast.success(`Generated ${result.generated} hiring prediction alerts`);
      await reload();
    } catch (err) {
      console.error('[hiring-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[hiring-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.success_score ?? 0) - (a.success_score ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Hiring Predictor", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUserPlus} className="text-emerald-600" />
              AI Staff Hiring Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Scores candidates against top performer profiles — predicts retention, recommends hire/no-hire
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Scoring…' : 'Score candidates'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="High-risk candidates" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faUserPlus} label="Open alerts" value={String(summary.totalAlerts)} color="text-emerald-600" />
          <SummaryCard icon={faArrowRightArrowLeft} label="Turnover risk" value={fmt$(summary.totalTurnoverRisk)} color="text-rose-600" />
          <SummaryCard icon={faGraduationCap} label="Training investment" value={fmt$(summary.totalTrainingCost)} color="text-amber-600" />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUserPlus} spin className="text-4xl mb-3" />
            <p>Loading hiring predictions…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No hiring alerts</p>
            <p className="text-sm mt-1">Run prediction to score candidates.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faUserPlus, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.candidate_name}</span>
                          {alert.role_applied && (
                            <span className={`text-xs font-medium ${ROLE_COLOR[alert.role_applied] ?? 'text-neutral-500'}`}>
                              {alert.role_applied}
                            </span>
                          )}
                          {alert.success_score != null && (
                            <span className={`text-xs font-medium ${scoreColor(alert.success_score)}`}>
                              Score: {alert.success_score}/100
                            </span>
                          )}
                          {alert.retention_probability != null && (
                            <span className={`text-xs font-medium ${alert.retention_probability >= 70 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              Retention: {alert.retention_probability}%
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.experience_years != null && <span>Experience: {alert.experience_years}y</span>}
                          {alert.requested_salary != null && <span>Salary: ${alert.requested_salary}/hr</span>}
                          {alert.benchmark_salary != null && <span>Benchmark: ${alert.benchmark_salary}/hr</span>}
                          {alert.peak_availability_pct != null && <span className={alert.peak_availability_pct < 60 ? 'text-rose-600 font-medium' : ''}>Peak avail: {alert.peak_availability_pct}%</span>}
                          {alert.est_training_days != null && <span>Training: {alert.est_training_days}d</span>}
                          {alert.est_turnover_cost != null && alert.est_turnover_cost > 0 && <span className="text-rose-600">Risk cost: {fmt$(alert.est_turnover_cost)}</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Hired
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Interviewing
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Reject
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
          <span>Min success score: {config.minSuccessScore}/100</span>
          <span>Min retention: {config.minRetentionPct}%</span>
          <span>Turnover cost: {fmt$(config.turnoverCost)}/hire</span>
          <span>Training: ${config.trainingCostDaily}/day</span>
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

export default HiringPredictorScreen;
