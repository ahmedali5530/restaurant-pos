/**
 * AI Social Media Ad ROI Tracker — tracks ad spend vs revenue per platform,
 * attributes orders to ads, recommends budget reallocation.
 *
 * 91st POSR-exclusive differentiator — restaurants waste $200-1,000/mo per
 * location on social media ads that don't convert.
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
  faChartLine, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowTrendDown, faArrowTrendUp, faMousePointer,
  faUsers, faDollarSign, faImage, faClock, faArrowsRotate,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runAdRoiEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readAdRoiConfig, DEFAULT_ADROI_CONFIG,
  type AdRoiAlert,
} from "@/lib/ad-roi-tracker.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  low_roi_platform:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowTrendDown,  label: 'LOW ROI' },
  high_roi_campaign:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,    label: 'WINNER' },
  click_no_order:            { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faMousePointer,    label: 'NO CONVERSION' },
  audience_mismatch:         { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faUsers,           label: 'AUDIENCE MISMATCH' },
  budget_overspend:          { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faDollarSign,      label: 'OVERSPEND' },
  creative_fatigue:          { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faImage,           label: 'CREATIVE FATIGUE' },
  conversion_lag:            { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faClock,           label: 'CONVERSION LAG' },
  platform_reallocation:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowsRotate,    label: 'REALLOCATE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const PLATFORM_COLOR: Record<string, string> = {
  facebook: 'text-blue-600',
  instagram: 'text-pink-600',
  tiktok: 'text-neutral-800',
  google: 'text-amber-600',
  youtube: 'text-red-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

const roiColor = (roi: number): string => {
  if (roi >= 200) return 'text-emerald-600';
  if (roi >= 100) return 'text-amber-600';
  return 'text-rose-600';
};

export function AdRoiTrackerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<AdRoiAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalWastedSpend: 0, totalRevenueOpportunity: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ADROI_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAdRoiConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[adroi-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runAdRoiEngine(db, config);
      toast.success(`Generated ${result.generated} ad ROI alerts`);
      await reload();
    } catch (err) {
      console.error('[adroi-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[adroi-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_wasted_spend + b.est_revenue_opportunity) - (a.est_wasted_spend + a.est_revenue_opportunity);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Ad ROI Tracker", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-violet-600" />
              AI Social Media Ad ROI Tracker
            </h1>
            <p className="text-sm text-neutral-500">
              Tracks ad spend vs revenue per platform — attributes orders, recommends budget reallocation
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Run ROI scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="High-impact alerts"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faChartLine}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-violet-600"
          />
          <SummaryCard
            icon={faArrowTrendDown}
            label="Wasted ad spend"
            value={fmt$(summary.totalWastedSpend)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faArrowTrendUp}
            label="Revenue opportunity"
            value={fmt$(summary.totalRevenueOpportunity)}
            color="text-emerald-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartLine} spin className="text-4xl mb-3" />
            <p>Loading ad ROI alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No ad ROI alerts</p>
            <p className="text-sm mt-1">Run ROI scan to analyze ad performance.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faChartLine, label: alert.rule_id.toUpperCase() };
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
                          <span className={`text-xs font-medium ${PLATFORM_COLOR[alert.platform] ?? 'text-neutral-500'}`}>
                            {alert.platform}
                          </span>
                          {alert.campaign_name && (
                            <span className="text-sm font-medium text-neutral-700">{alert.campaign_name}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          <span className={`text-sm font-bold ${roiColor(alert.roi_pct)}`}>
                            ROI: {alert.roi_pct.toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>Spend: <span className="font-medium text-neutral-700">{fmt$(alert.ad_spend)}</span></span>
                          <span>Revenue: <span className="font-medium text-neutral-700">{fmt$(alert.revenue_attributed)}</span></span>
                          {alert.orders_attributed != null && <span>Orders: {alert.orders_attributed}</span>}
                          {alert.ctr_pct != null && <span>CTR: {alert.ctr_pct}%</span>}
                          {alert.conversion_rate_pct != null && <span>Conv: {alert.conversion_rate_pct}%</span>}
                          {alert.avg_click_to_order_hours != null && (
                            <span className={alert.avg_click_to_order_hours > 72 ? 'text-amber-600 font-medium' : ''}>
                              Lag: {alert.avg_click_to_order_hours}h
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
                      {alert.est_wasted_spend > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_wasted_spend)}</div>
                          <div className="text-xs text-neutral-400">wasted</div>
                        </>
                      )}
                      {alert.est_revenue_opportunity > 0 && (
                        <>
                          <div className="text-sm font-bold text-emerald-600 mt-1">{fmt$(alert.est_revenue_opportunity)}</div>
                          <div className="text-xs text-neutral-400">opportunity</div>
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
          <span>Min ROI: {config.minRoiPct}% (breakeven)</span>
          <span>Click-no-order threshold: {config.maxClickNoOrderPct}%</span>
          <span>Creative fatigue: {config.creativeFatigueImpressions} impressions</span>
          <span>Conversion lag: {config.conversionLagHours}h</span>
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

export default AdRoiTrackerScreen;
