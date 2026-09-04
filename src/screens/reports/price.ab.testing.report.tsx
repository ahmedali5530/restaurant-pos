/**
 * AI Menu Price A/B Testing Optimizer — runs controlled price tests,
 * measures revenue impact, recommends optimal pricing.
 *
 * 107th POSR-exclusive differentiator — restaurants leave $200-1,000/mo from
 * suboptimal pricing. No POS runs A/B price tests.
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
  faFlaskVial, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowTrendUp, faArrowTrendDown, faCoins,
  faShuffle, faCheckDouble, faQuestionCircle, faUndo, faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPriceTestEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readPriceTestConfig, DEFAULT_PRICETEST_CONFIG,
  type PriceTestAlert,
} from "@/lib/price-ab-testing.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  test_revenue_uplift:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,     label: 'REVENUE UP' },
  test_volume_drop:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,   label: 'VOLUME DROP' },
  test_margin_improvement:   { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCoins,            label: 'MARGIN UP' },
  cross_price_effect:        { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faShuffle,          label: 'CROSS-EFFECT' },
  test_significant:          { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCheckDouble,      label: 'SIGNIFICANT' },
  test_inconclusive:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faQuestionCircle,   label: 'INCONCLUSIVE' },
  rollback_needed:           { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faUndo,             label: 'ROLLBACK' },
  optimal_price_found:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTrophy,           label: 'OPTIMAL FOUND' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function PriceABTestingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<PriceTestAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalUplift: 0, testsRunning: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PRICETEST_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPriceTestConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[pricetest-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPriceTestEngine(db, config);
      toast.success(`Generated ${result.generated} price test alerts — ${fmt$(summary.totalUplift)}/mo uplift potential`);
      await reload();
    } catch (err) {
      console.error('[pricetest-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalUplift]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[pricetest-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_uplift ?? 0) - (a.est_monthly_uplift ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Price A/B Testing", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faFlaskVial} className="text-violet-600" />
              AI Menu Price A/B Testing Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Runs controlled price tests — measures revenue impact, finds optimal pricing
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze tests'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faArrowTrendUp} label="Monthly uplift" value={fmt$(summary.totalUplift)} color="text-emerald-600" />
          <SummaryCard icon={faFlaskVial} label="Tests running" value={String(summary.testsRunning)} color="text-violet-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faFlaskVial} label="Open alerts" value={String(summary.totalAlerts)} color="text-violet-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faFlaskVial} spin className="text-4xl mb-3" />
            <p>Loading price test alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No price test alerts</p>
            <p className="text-sm mt-1">All prices optimized or no tests running.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faFlaskVial, label: alert.rule_id.toUpperCase() };
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
                          {alert.control_price != null && alert.test_price != null && (
                            <span className="text-xs">
                              <span className="text-neutral-500">{fmt$(alert.control_price)}</span>
                              <span className="mx-1 text-neutral-400">→</span>
                              <span className={`font-medium ${alert.test_price > alert.control_price ? 'text-emerald-600' : 'text-amber-600'}`}>{fmt$(alert.test_price)}</span>
                            </span>
                          )}
                          {alert.significance_pct != null && (
                            <span className={`text-xs font-medium ${alert.significance_pct >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {alert.significance_pct}% sig
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.revenue_delta_pct != null && (
                            <span className={alert.revenue_delta_pct >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                              Revenue: {alert.revenue_delta_pct >= 0 ? '+' : ''}{alert.revenue_delta_pct}%
                            </span>
                          )}
                          {alert.volume_delta_pct != null && (
                            <span className={alert.volume_delta_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              Volume: {alert.volume_delta_pct >= 0 ? '+' : ''}{alert.volume_delta_pct}%
                            </span>
                          )}
                          {alert.test_days_elapsed != null && <span>Day {alert.test_days_elapsed}</span>}
                          {alert.cross_affected_item && <span className="text-violet-600">Affects: {alert.cross_affected_item}</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_uplift > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_uplift)}</div>
                        <div className="text-xs text-neutral-400">uplift/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Adopted
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
          <span>Min significance: {config.minSignificance}%</span>
          <span>Min test days: {config.minDays}</span>
          <span>Max test days: {config.maxDays}</span>
          <span>Revenue threshold: ±{config.revenueThreshold}%</span>
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

export default PriceABTestingScreen;
