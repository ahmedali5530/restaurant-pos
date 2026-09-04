/**
 * AI Menu Item Profitability Decay Tracker — tracks how each menu item's
 * profitability decays over time from multiple erosion sources.
 *
 * 120th POSR-exclusive differentiator — restaurants lose $500-2,000/mo per
 * location from undetected profitability decay. No POS tracks profitability
 * trajectory over time.
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
  faTriangleExclamation, faArrowTrendDown, faDollarSign, faScaleBalanced,
  faRecycle, faTags, faGaugeHigh, faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runProfDecayEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readProfDecayConfig, DEFAULT_PROFDECAY_CONFIG,
  type ProfDecayAlert,
} from "@/lib/profitability-decay.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  margin_erosion:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,  label: 'MARGIN EROSION' },
  cost_inflation_decay:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faDollarSign,      label: 'COST INFLATION' },
  portion_creep:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faScaleBalanced,   label: 'PORTION CREEP' },
  waste_accumulation:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faRecycle,         label: 'WASTE ACCUMULATION' },
  discount_creep:          { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faTags,            label: 'DISCOUNT CREEP' },
  threshold_crossing:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation, label: 'GRADE DROP' },
  decay_acceleration:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGaugeHigh,       label: 'DECAY ACCELERATING' },
  compounding_decay:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faLayerGroup,      label: 'COMPOUNDING DECAY' },
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
  C: 'text-orange-600',
  D: 'text-rose-600',
  F: 'text-rose-700',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function ProfitabilityDecayScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ProfDecayAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgDecay: 0, itemsAtRisk: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PROFDECAY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readProfDecayConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[profdecay-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runProfDecayEngine(db, config);
      toast.success(`Tracked ${result.generated} decay alerts — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[profdecay-report] analyze failed', err);
      toast.error('Tracking failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[profdecay-report] status failed', err);
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
      <DocumentTitle parts={["AI Profitability Decay", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-rose-600" />
              AI Menu Item Profitability Decay Tracker
            </h1>
            <p className="text-sm text-neutral-500">
              Tracks margin decay over time — alerts before profitable items become loss leaders
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Tracking…' : 'Track decay'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faArrowTrendDown} label="Avg decay" value={`${summary.avgDecay.toFixed(0)}pp`} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Items at risk (D/F)" value={String(summary.itemsAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faChartLine} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-rose-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartLine} spin className="text-4xl mb-3" />
            <p>Tracking profitability decay…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No profitability decay alerts</p>
            <p className="text-sm mt-1">All items maintaining healthy margins — no significant decay.</p>
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
                          <span className="font-semibold text-neutral-800">{alert.menu_item}</span>
                          {alert.current_grade && (
                            <span className={`text-xs font-bold ${GRADE_COLOR[alert.current_grade] ?? 'text-neutral-500'}`}>
                              grade {alert.current_grade}
                              {alert.previous_grade && <span className="text-neutral-400"> (was {alert.previous_grade})</span>}
                            </span>
                          )}
                          {alert.margin_decay_pct != null && (
                            <span className="text-xs font-bold text-rose-600">-{alert.margin_decay_pct}pp decay</span>
                          )}
                          {alert.launch_margin_pct != null && alert.current_margin_pct != null && (
                            <span className="text-xs text-neutral-500">
                              <span className="text-neutral-400">{alert.launch_margin_pct}%</span>
                              <span className="mx-1">→</span>
                              <span className="font-medium text-rose-600">{alert.current_margin_pct}%</span>
                            </span>
                          )}
                          {alert.months_to_unprofitable != null && alert.months_to_unprofitable < 12 && (
                            <span className="text-xs font-bold text-rose-600">{alert.months_to_unprofitable}mo to 0%</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.cost_inflation_pct != null && alert.cost_inflation_pct > 0 && (
                            <span className="text-rose-600">cost: -{alert.cost_inflation_pct}pp</span>
                          )}
                          {alert.portion_creep_pct != null && alert.portion_creep_pct > 0 && (
                            <span className="text-amber-600">portion: -{alert.portion_creep_pct}pp</span>
                          )}
                          {alert.waste_pct != null && alert.waste_pct > 0 && (
                            <span className="text-amber-600">waste: -{alert.waste_pct}pp</span>
                          )}
                          {alert.discount_creep_pct != null && alert.discount_creep_pct > 0 && (
                            <span className="text-sky-600">discount: -{alert.discount_creep_pct}pp</span>
                          )}
                          {alert.decay_velocity && (
                            <span className="text-rose-600 font-medium">{alert.decay_velocity}</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-xs text-rose-800 flex items-start gap-2">
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Fixed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Recovering
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
          <span>Erosion threshold: {config.erosionThreshold}pp</span>
          <span>Critical grade: {config.criticalGrade}</span>
          <span>Unprofitable window: {config.unprofitableWindow} months</span>
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

export default ProfitabilityDecayScreen;
