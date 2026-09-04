/**
 * AI Customer Feedback Sentiment Heatmap — real-time multi-dimensional
 * sentiment tracking with heatmap visualization and trend detection.
 *
 * 105th POSR-exclusive differentiator — restaurants lose $200-1,500/mo from
 * not visualizing feedback sentiment across operational dimensions.
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
  faFire, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faUtensils, faUserGear, faDollarSign,
  faClock, faMusic, faArrowTrendUp, faUsers, faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runHeatmapEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readHeatmapConfig, DEFAULT_HEATMAP_CONFIG,
  type HeatmapAlert,
} from "@/lib/sentiment-heatmap.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  food_decline:             { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUtensils,         label: 'FOOD DECLINE' },
  service_decline:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUserGear,         label: 'SERVICE DECLINE' },
  price_complaint_spike:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faDollarSign,       label: 'PRICE COMPLAINT' },
  wait_time_spike:          { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faClock,            label: 'WAIT TIME' },
  ambience_decline:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faMusic,            label: 'AMBIENCE DECLINE' },
  staff_negative_mention:   { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faUsers,            label: 'STAFF NEGATIVE' },
  positive_amplification:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,     label: 'POSITIVE SPIKE' },
  negative_cluster:         { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faLayerGroup,       label: 'NEGATIVE CLUSTER' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const DIMENSION_COLOR: Record<string, string> = {
  food: 'text-orange-600',
  service: 'text-sky-600',
  price: 'text-rose-600',
  wait_time: 'text-amber-600',
  ambience: 'text-violet-600',
  value: 'text-emerald-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

const sentimentColor = (score: number): string => {
  if (score >= 0.5) return 'text-emerald-600';
  if (score >= 0) return 'text-amber-600';
  return 'text-rose-600';
};

export function SentimentHeatmapScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<HeatmapAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalRevenueImpact: 0, positiveSpikes: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_HEATMAP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readHeatmapConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[heatmap-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runHeatmapEngine(db, config);
      toast.success(`Generated ${result.generated} sentiment heatmap alerts`);
      await reload();
    } catch (err) {
      console.error('[heatmap-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[heatmap-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_revenue_impact ?? 0) - (a.est_revenue_impact ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Sentiment Heatmap", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faFire} className="text-rose-600" />
              AI Customer Feedback Sentiment Heatmap
            </h1>
            <p className="text-sm text-neutral-500">
              Multi-dimensional sentiment tracking — food, service, price, ambience, wait, value
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze sentiment'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Critical alerts" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faFire} label="Open alerts" value={String(summary.totalAlerts)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Revenue impact" value={fmt$(summary.totalRevenueImpact)} color="text-rose-600" />
          <SummaryCard icon={faArrowTrendUp} label="Positive spikes" value={String(summary.positiveSpikes)} color="text-emerald-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faFire} spin className="text-4xl mb-3" />
            <p>Loading sentiment heatmap alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No sentiment heatmap alerts</p>
            <p className="text-sm mt-1">All dimensions within healthy range.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faFire, label: alert.rule_id.toUpperCase() };
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
                          <span className={`text-xs font-medium ${DIMENSION_COLOR[alert.dimension] ?? 'text-neutral-500'}`}>
                            {alert.dimension.replace('_', ' ')}
                          </span>
                          {alert.current_sentiment != null && alert.previous_sentiment != null && (
                            <span className="text-xs">
                              Sentiment: <span className={`font-medium ${sentimentColor(alert.current_sentiment)}`}>{alert.current_sentiment.toFixed(2)}</span>
                              <span className="text-neutral-400"> (was {alert.previous_sentiment.toFixed(2)})</span>
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          {alert.time_window && <span className="text-xs text-neutral-400">Worst at: {alert.time_window}</span>}
                          {alert.staff_mentioned && <span className="text-xs text-rose-600 font-medium">Staff: {alert.staff_mentioned}</span>}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.mention_count != null && <span>Mentions: {alert.mention_count}</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_revenue_impact > 0 && (
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-bold ${alert.rule_id === 'positive_amplification' ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt$(alert.est_revenue_impact)}</div>
                        <div className="text-xs text-neutral-400">{alert.rule_id === 'positive_amplification' ? 'opportunity' : 'impact'}</div>
                      </div>
                    )}
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
          <span>Decline threshold: {config.declineThreshold}</span>
          <span>Min mentions: {config.mentionMin}</span>
          <span>Cluster window: {config.clusterWindowH}h</span>
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

export default SentimentHeatmapScreen;
