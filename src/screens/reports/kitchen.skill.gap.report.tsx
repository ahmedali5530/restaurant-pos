/**
 * AI Kitchen Staff Skill Gap Analyzer — analyzes kitchen staff technique-level
 * performance against station benchmarks to identify skill gaps.
 *
 * 123rd POSR-exclusive differentiator — restaurants lose $500-1,500/mo per
 * location from kitchen staff skill gaps going undetected.
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
  faGraduationCap, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowTrendDown, faStar, faShuffle,
  faArrowsRotate, faChartLine, faHandshake, faMinus,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runKitchenSkillEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readKitchenSkillConfig, DEFAULT_KITCHENSKILL_CONFIG,
  type KitchenSkillAlert,
} from "@/lib/kitchen-skill-gap.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  technique_gap:             { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'TECHNIQUE GAP' },
  skill_deterioration:       { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,     label: 'DETERIORATION' },
  top_performer:             { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faStar,               label: 'TOP PERFORMER' },
  cross_training_opportunity:{ bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faShuffle,            label: 'CROSS-TRAIN' },
  station_mismatch:          { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faArrowsRotate,       label: 'MISMATCH' },
  training_roi_positive:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faChartLine,          label: 'TRAINING ROI+' },
  peer_mentor_match:         { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faHandshake,          label: 'MENTOR MATCH' },
  skill_stagnation:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faMinus,              label: 'STAGNATION' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const STATION_COLOR: Record<string, string> = {
  grill: 'text-rose-600',
  saute: 'text-amber-600',
  fry: 'text-orange-600',
  cold: 'text-sky-600',
  pastry: 'text-violet-600',
  expediter: 'text-neutral-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function KitchenSkillGapScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<KitchenSkillAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, staffAffected: 0, topPerformers: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_KITCHENSKILL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readKitchenSkillConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[kitchenskill-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runKitchenSkillEngine(db, config);
      toast.success(`Analyzed ${result.generated} skill gaps — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[kitchenskill-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[kitchenskill-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_opportunity ?? 0) - (a.est_monthly_opportunity ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Kitchen Skill Gap", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faGraduationCap} className="text-violet-600" />
              AI Kitchen Staff Skill Gap Analyzer
            </h1>
            <p className="text-sm text-neutral-500">
              Technique-level skill gaps benchmarked against station standards — targeted training recommendations
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze skills'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Staff with gaps" value={String(summary.staffAffected)} color="text-rose-600" />
          <SummaryCard icon={faStar} label="Top performers" value={String(summary.topPerformers)} color="text-emerald-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faGraduationCap} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-violet-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faGraduationCap} spin className="text-4xl mb-3" />
            <p>Analyzing kitchen staff skill gaps…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No skill gap alerts</p>
            <p className="text-sm mt-1">All kitchen staff performing at or above benchmarks.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faGraduationCap, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.staff_name}</span>
                          {alert.station && (
                            <span className={`text-xs font-medium uppercase ${STATION_COLOR[alert.station.split(',')[0]] ?? 'text-neutral-500'}`}>
                              {alert.station}
                            </span>
                          )}
                          {alert.technique && (
                            <span className="text-xs text-violet-600 font-medium">{alert.technique.replace('_', ' ')}</span>
                          )}
                          {alert.current_skill_score != null && alert.benchmark_score != null && (
                            <span className="text-xs">
                              <span className={alert.current_skill_score < alert.benchmark_score ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>{alert.current_skill_score}</span>
                              <span className="text-neutral-400"> / {alert.benchmark_score}</span>
                            </span>
                          )}
                          {alert.skill_gap != null && alert.skill_gap > 0 && (
                            <span className="text-xs font-bold text-rose-600">-{alert.skill_gap} gap</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.error_rate_pct != null && <span className={alert.error_rate_pct >= 10 ? 'text-rose-600' : ''}>{alert.error_rate_pct}% errors</span>}
                          {alert.tasks_completed != null && <span>{alert.tasks_completed} tasks</span>}
                          {alert.avg_task_time != null && <span>{alert.avg_task_time} min/task</span>}
                          {alert.previous_skill_score != null && <span className="text-neutral-400">was {alert.previous_skill_score}</span>}
                          {alert.recommended_training && <span className="text-violet-600 font-medium">→ {alert.recommended_training.replace('_', ' ')}</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Trained
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Training
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
          <span>Gap threshold: {config.gapThreshold} points</span>
          <span>Deterioration drop: {config.deteriorationDrop} points</span>
          <span>Top performer threshold: {config.topThreshold}/100</span>
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

export default KitchenSkillGapScreen;
