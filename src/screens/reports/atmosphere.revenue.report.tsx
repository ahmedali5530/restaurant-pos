/**
 * AI Restaurant Atmosphere Revenue Optimizer — correlates ambient factors
 * with revenue outcomes and recommends optimal atmosphere per time-of-day.
 *
 * 138th POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from suboptimal atmosphere settings.
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
  faLightbulb, faRotate, faLightbulb as faLightbulbIcon, faCheckCircle,
  faTriangleExclamation, faTemperatureHalf, faMusic, faVolumeHigh,
  faChartColumn, faClock, faArrowTrendUp, faLeaf,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runAtmosRevEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readAtmosRevConfig, DEFAULT_ATMOSREV_CONFIG,
  type AtmosRevAlert,
} from "@/lib/atmosphere-revenue.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  lighting_mismatch:                { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faLightbulbIcon,      label: 'LIGHTING' },
  temperature_suboptimal:          { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faTemperatureHalf,    label: 'TEMPERATURE' },
  music_tempo_mismatch:            { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faMusic,              label: 'MUSIC TEMPO' },
  noise_level_high:                { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faVolumeHigh,        label: 'NOISE HIGH' },
  atmosphere_spend_correlation:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faChartColumn,       label: 'SPEND CORRELATION' },
  time_of_day_mismatch:            { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,             label: 'TIME MISMATCH' },
  atmosphere_adjustment_validated: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,      label: 'VALIDATED' },
  seasonal_atmosphere_shift:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faLeaf,              label: 'SEASONAL' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function AtmosphereRevenueScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<AtmosRevAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, mismatchCount: 0, avgSatisfaction: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ATMOSREV_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAtmosRevConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[atmosrev-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runAtmosRevEngine(db, config);
      toast.success(`Analyzed ${result.generated} atmosphere factors — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[atmosrev-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[atmosrev-report] status failed', err);
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
      <DocumentTitle parts={["AI Atmosphere Revenue", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLightbulb} className="text-amber-500" />
              AI Restaurant Atmosphere Revenue Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Correlates ambient factors (lighting, temp, music, noise) with revenue — optimizes for max spend
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze atmosphere'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Mismatches" value={String(summary.mismatchCount)} color="text-amber-600" />
          <SummaryCard icon={faCheckCircle} label="Avg satisfaction" value={`${summary.avgSatisfaction.toFixed(0)}/100`} color={summary.avgSatisfaction >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLightbulb} spin className="text-4xl mb-3" />
            <p>Analyzing atmosphere-revenue correlations…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No atmosphere alerts</p>
            <p className="text-sm mt-1">Atmosphere settings optimized for all time slots.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLightbulb, label: alert.rule_id.toUpperCase() };
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
                          {alert.time_of_day && (
                            <span className="text-xs font-medium uppercase text-amber-600">{alert.time_of_day.replace('_', ' ')}</span>
                          )}
                          {alert.ambient_factor && (
                            <span className="text-xs text-neutral-500 uppercase">{alert.ambient_factor.replace('_', ' ')}</span>
                          )}
                          {alert.current_setting && alert.recommended_setting && (
                            <span className="text-xs">
                              <span className="text-rose-600">{alert.current_setting}</span>
                              <span className="mx-1 text-neutral-400">→</span>
                              <span className="text-emerald-600 font-medium">{alert.recommended_setting}</span>
                            </span>
                          )}
                          {alert.spend_uplift_pct != null && alert.spend_uplift_pct > 0 && (
                            <span className="text-xs font-bold text-emerald-600">+{alert.spend_uplift_pct}% spend</span>
                          )}
                          {alert.current_satisfaction != null && (
                            <span className={`text-xs ${alert.current_satisfaction < 75 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>
                              {alert.current_satisfaction}/100 sat
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.current_avg_spend != null && alert.predicted_avg_spend != null && (
                            <span>{fmt$(alert.current_avg_spend)} → {fmt$(alert.predicted_avg_spend)} avg spend</span>
                          )}
                          {alert.current_dwell_time != null && <span>{alert.current_dwell_time}min dwell</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Adjusted
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Testing
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
          <span>Spend threshold: +{config.spendThreshold}%</span>
          <span>Dwell threshold: {config.dwellThreshold}%</span>
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

export default AtmosphereRevenueScreen;
