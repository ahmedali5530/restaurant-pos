/**
 * CLV Trajectory Dashboard — direction + velocity of CLV change per customer.
 *
 * 19th POSR-exclusive differentiator — Toast, Square, Lightspeed have
 * point-in-time CLV (snapshot) but NO trend analysis.
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
  faChartLine, faArrowTrendUp, faArrowTrendDown, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faEquals,
  faAward, faRocket, faLifeRing, faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runCLVTrajectoryAnalysis,
  getActiveTrajectories,
  getCLVTrajectorySummary,
  updateCLVTrajectoryAction,
  readCLVTrajConfig,
  DEFAULT_CLVTRAJ_CONFIG,
  type CLVTrajectory,
  type TrajectoryType,
  type CLVIntervention,
} from "@/lib/clv-trajectory.service.ts";

const TRAJECTORY_STYLE: Record<TrajectoryType, { bg: string; text: string; border: string; icon: any; label: string }> = {
  accelerating: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', icon: faRocket,        label: 'Accelerating' },
  growing:     { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-400',    icon: faArrowTrendUp, label: 'Growing' },
  stable:      { bg: 'bg-neutral-50',  text: 'text-neutral-600',  border: 'border-neutral-300',  icon: faEquals,       label: 'Stable' },
  declining:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-400',    icon: faArrowTrendDown, label: 'Declining' },
  churning:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-500',     icon: faArrowTrendDown, label: 'Churning' },
};

const INTERVENTION_LABEL: Record<CLVIntervention, string> = {
  nurture: 'Nurture',
  upsell: 'Upsell',
  retain: 'Retain',
  investigate: 'Investigate',
  reward: 'Reward',
};

const INTERVENTION_STYLE: Record<CLVIntervention, string> = {
  nurture: 'bg-blue-100 text-blue-700',
  upsell: 'bg-violet-100 text-violet-700',
  retain: 'bg-amber-100 text-amber-700',
  investigate: 'bg-rose-100 text-rose-700',
  reward: 'bg-emerald-100 text-emerald-700',
};

const INTERVENTION_ICON: Record<CLVIntervention, any> = {
  nurture: faLifeRing,
  upsell: faArrowTrendUp,
  retain: faLifeRing,
  investigate: faMagnifyingGlass,
  reward: faAward,
};

export function CLVTrajectoryScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [trajectories, setTrajectories] = useState<CLVTrajectory[]>([]);
  const [summary, setSummary] = useState({
    total: 0, accelerating: 0, growing: 0, stable: 0, declining: 0, churning: 0,
    totalProjectedChange: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_CLVTRAJ_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCLVTrajConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getActiveTrajectories(db),
        getCLVTrajectorySummary(db),
      ]);
      setTrajectories(list);
      setSummary(sum);
    } catch (err) {
      console.error('[clvtraj-report] reload failed', err);
      toast.error('Failed to load trajectories');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runCLVTrajectoryAnalysis(db, config, (current, total) => {
        setProgress({ current, total });
      });
      const actionable = result.trajectories.filter(t => t.trajectory !== 'stable').length;
      toast.success(
        result.trajectories.length > 0
          ? `Analyzed ${result.analyzed} customers — ${actionable} actionable trajectories (${withCurrency(summary.totalProjectedChange)} projected change)`
          : `Analyzed ${result.analyzed} customers — no significant trajectories`
      );
      await reload();
    } catch (err) {
      console.error('[clvtraj-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload, summary.totalProjectedChange]);

  const handleAction = useCallback(async (trajId: string, action: string) => {
    try {
      await updateCLVTrajectoryAction(db, trajId, action);
      toast.success(`Marked: ${action}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["CLV Trajectory", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-blue-600" />
              CLV Trajectory
            </h1>
            <p className="text-sm text-neutral-500">
              AI direction + velocity of CLV change — surface declining customers BEFORE they become at-risk (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Run analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading trajectories…</p>
          </div>
        ) : trajectories.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No actionable trajectories!</p>
            <p className="text-sm mt-1">All customers stable. Click "Run analysis" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendDown} />Churning</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.churning}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendDown} />Declining</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.declining}</div>
              </div>
              <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-3 text-center">
                <div className="text-xs text-neutral-600">Stable</div>
                <div className="text-2xl font-bold text-neutral-700 tabular-nums">{summary.stable}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendUp} />Growing</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.growing}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faRocket} />Accelerating</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.accelerating}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Total analyzed</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className={`rounded-lg border p-3 text-center ${summary.totalProjectedChange >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <div className={`text-xs ${summary.totalProjectedChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Projected Δ (90d)</div>
                <div className={`text-2xl font-bold tabular-nums ${summary.totalProjectedChange >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {summary.totalProjectedChange >= 0 ? '+' : ''}{withCurrency(summary.totalProjectedChange)}
                </div>
              </div>
            </div>

            {/* Trajectory list */}
            <div className="space-y-3">
              {trajectories.map((traj, idx) => {
                const style = TRAJECTORY_STYLE[traj.trajectory] ?? TRAJECTORY_STYLE.stable;
                const positive = traj.projected_change_pct >= 0;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{traj.customer_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {traj.ai_intervention && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INTERVENTION_STYLE[traj.ai_intervention]}`}>
                            <FontAwesomeIcon icon={INTERVENTION_ICON[traj.ai_intervention]} className="mr-1" />AI: {INTERVENTION_LABEL[traj.ai_intervention]}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Projected 90d change</div>
                        <div className={`font-bold tabular-nums ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {positive ? '+' : ''}{traj.projected_change_pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* CLV windows visualization */}
                    <div className="bg-white/70 rounded p-3 mb-2">
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-neutral-500">61-90d ago</div>
                          <div className="font-bold tabular-nums text-neutral-700">{withCurrency(traj.clv_61_90d)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">31-60d ago</div>
                          <div className="font-bold tabular-nums text-neutral-700">{withCurrency(traj.clv_31_60d)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Last 30d</div>
                          <div className={`font-bold tabular-nums ${style.text}`}>{withCurrency(traj.clv_30d)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Current 90d CLV</div>
                          <div className="font-bold tabular-nums text-neutral-700">{withCurrency(traj.current_clv)}</div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-neutral-200 flex justify-between text-xs">
                        <span className="text-neutral-500">
                          Slope: <strong className={`tabular-nums ${traj.slope_per_month >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {traj.slope_per_month >= 0 ? '+' : ''}{withCurrency(traj.slope_per_month)}/mo
                          </strong>
                        </span>
                        <span className="text-neutral-500">
                          Projected 90d: <strong className={`tabular-nums ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {withCurrency(traj.projected_clv_90d)}
                          </strong>
                        </span>
                        <span className="text-neutral-500">
                          Visit freq: <strong className={`tabular-nums ${traj.visit_frequency_change_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {traj.visit_frequency_change_pct >= 0 ? '+' : ''}{traj.visit_frequency_change_pct.toFixed(0)}%
                          </strong>
                        </span>
                        <span className="text-neutral-500">
                          Avg check: <strong className={`tabular-nums ${traj.avg_check_change_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {traj.avg_check_change_pct >= 0 ? '+' : ''}{traj.avg_check_change_pct.toFixed(0)}%
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* AI insight */}
                    {traj.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{traj.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => traj.id && handleAction(traj.id, 'rewarded')}
                        className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                        <FontAwesomeIcon icon={faAward} /> Reward
                      </button>
                      <button onClick={() => traj.id && handleAction(traj.id, 'retained')}
                        className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">
                        <FontAwesomeIcon icon={faLifeRing} /> Retain
                      </button>
                      <button onClick={() => traj.id && handleAction(traj.id, 'investigated')}
                        className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">
                        <FontAwesomeIcon icon={faMagnifyingGlass} /> Investigate
                      </button>
                      <button onClick={() => traj.id && handleAction(traj.id, 'upsold')}
                        className="px-2 py-1 rounded text-xs bg-violet-100 text-violet-700 hover:bg-violet-200">
                        <FontAwesomeIcon icon={faArrowTrendUp} /> Upsell
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Min orders: <strong>{config.minOrders}</strong></span>
              <span>Accelerating: <strong>&gt; {(config.acceleratingThreshold * 100).toFixed(0)}%/mo</strong></span>
              <span>Churning: <strong>&lt; {(config.churningThreshold * 100).toFixed(0)}%/mo</strong></span>
              <span>Stable: <strong>±{(config.stableThreshold * 100).toFixed(0)}%</strong></span>
              <span>Max results: <strong>{config.maxResults}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default CLVTrajectoryScreen;
