/**
 * AI Menu Seasonal Demand Shift Detector — detects item-level seasonal demand
 * shifts and recommends proactive menu rotation, pre-stocking, and pricing.
 *
 * 118th POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from unmanaged seasonal demand shifts. No POS detects item-level
 * seasonal shifts with forward-looking action triggers.
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
  faLeaf, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowTrendUp, faArrowTrendDown, faCloudSun,
  faBoxOpen, faListUl, faTags, faClock, faCalendarDays,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runSeasonalShiftEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readSeasonalShiftConfig, DEFAULT_SEASONALSHIFT_CONFIG,
  type SeasonalShiftAlert,
} from "@/lib/seasonal-demand-shift.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  entering_peak_season:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,    label: 'ENTERING PEAK' },
  exiting_peak_season:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,  label: 'EXITING PEAK' },
  weather_driven_shift:        { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCloudSun,        label: 'WEATHER SHIFT' },
  seasonal_stockout_risk:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBoxOpen,         label: 'STOCKOUT RISK' },
  off_season_menu_bloat:       { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faListUl,          label: 'OFF-SEASON BLOAT' },
  seasonal_pricing_opportunity:{ bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTags,            label: 'PRICING OPP' },
  early_shift_detected:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,           label: 'EARLY SHIFT' },
  shift_timing_anomaly:        { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: faCalendarDays,  label: 'TIMING ANOMALY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const SEASON_COLOR: Record<string, string> = {
  spring: 'text-emerald-600',
  summer: 'text-amber-600',
  fall: 'text-orange-600',
  winter: 'text-sky-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function SeasonalDemandShiftScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<SeasonalShiftAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, enteringPeak: 0, exitingPeak: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SEASONALSHIFT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSeasonalShiftConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[seasonalshift-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runSeasonalShiftEngine(db, config);
      toast.success(`Detected ${result.generated} seasonal shifts — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[seasonalshift-report] analyze failed', err);
      toast.error('Detection failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[seasonalshift-report] status failed', err);
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
      <DocumentTitle parts={["AI Seasonal Demand Shift", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLeaf} className="text-emerald-600" />
              AI Menu Seasonal Demand Shift Detector
            </h1>
            <p className="text-sm text-neutral-500">
              Detects item-level seasonal demand shifts — proactive menu rotation + pre-stocking + pricing
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Detecting…' : 'Detect shifts'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faArrowTrendUp} label="Entering peak" value={String(summary.enteringPeak)} color="text-emerald-600" />
          <SummaryCard icon={faArrowTrendDown} label="Exiting peak" value={String(summary.exitingPeak)} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faLeaf} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-emerald-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLeaf} spin className="text-4xl mb-3" />
            <p>Detecting seasonal demand shifts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No seasonal shift alerts</p>
            <p className="text-sm mt-1">Item demand stable — no significant seasonal shifts detected.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLeaf, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.menu_item}</span>
                          {alert.category && (
                            <span className="text-xs text-neutral-500 uppercase">{alert.category}</span>
                          )}
                          {alert.season && (
                            <span className={`text-xs font-medium uppercase ${SEASON_COLOR[alert.season] ?? 'text-neutral-500'}`}>
                              {alert.season}
                            </span>
                          )}
                          {alert.shift_pct != null && (
                            <span className={`text-xs font-bold ${alert.shift_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {alert.shift_pct >= 0 ? '+' : ''}{alert.shift_pct}% YoY
                            </span>
                          )}
                          {alert.on_menu != null && (
                            <span className={`text-xs ${alert.on_menu ? 'text-neutral-400' : 'text-rose-600 font-medium'}`}>
                              {alert.on_menu ? 'on menu' : 'NOT on menu'}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.current_demand != null && <span>{alert.current_demand} orders/day</span>}
                          {alert.days_to_peak != null && <span>peak in {alert.days_to_peak}d</span>}
                          {alert.current_stock != null && alert.stock_needed_at_peak != null && (
                            <span className={alert.current_stock < alert.stock_needed_at_peak ? 'text-rose-600 font-medium' : ''}>
                              stock {alert.current_stock}/{alert.stock_needed_at_peak}
                            </span>
                          )}
                          {alert.weather_correlation && alert.weather_correlation !== 'none' && (
                            <span className="text-sky-600 font-medium">{alert.weather_correlation.replace('_', ' ')}</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Acted
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Adapting
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
          <span>Peak threshold: +{config.peakThreshold}%</span>
          <span>Exit threshold: -{config.exitThreshold}%</span>
          <span>Stock buffer: +{config.stockBuffer}%</span>
          <span>Early window: {config.earlyWindow} days</span>
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

export default SeasonalDemandShiftScreen;
