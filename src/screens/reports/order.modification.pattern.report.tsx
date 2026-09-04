/**
 * AI Order Modification Pattern Detector — detects when customers consistently
 * modify a menu item, signaling the default recipe needs redesign.
 *
 * 111th POSR-exclusive differentiator — restaurants lose $200-900/mo per
 * location from undetected modification patterns. No POS detects "silent
 * recipe feedback" from modification patterns.
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
  faPenToSquare, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faMinus, faPlus, faShuffle,
  faScaleBalanced, faPepperHot, faDollarSign, faGaugeHigh,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runModPatternEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readModPatternConfig, DEFAULT_MODPATTERN_CONFIG,
  type ModPatternAlert,
} from "@/lib/order-modification-pattern.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  high_modification_rate:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGaugeHigh,       label: 'HIGH MOD RATE' },
  common_removal:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faMinus,           label: 'COMMON REMOVAL' },
  common_addition:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faPlus,            label: 'COMMON ADDITION' },
  substitution_pattern:    { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faShuffle,         label: 'SUBSTITUTION' },
  portion_mismatch:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faScaleBalanced,   label: 'PORTION MISMATCH' },
  spice_level_mismatch:    { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faPepperHot,       label: 'SPICE MISMATCH' },
  revenue_leak:            { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faDollarSign,      label: 'REVENUE LEAK' },
  kitchen_slowdown:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGaugeHigh,       label: 'KITCHEN SLOWDOWN' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const MOD_TYPE_COLOR: Record<string, string> = {
  removal: 'text-rose-600',
  addition: 'text-emerald-600',
  substitution: 'text-violet-600',
  portion_change: 'text-amber-600',
  spice_change: 'text-orange-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function OrderModificationPatternScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ModPatternAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, revenueLeak: 0, itemsAffected: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MODPATTERN_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readModPatternConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[modpattern-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runModPatternEngine(db, config);
      toast.success(`Detected ${result.generated} modification patterns — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[modpattern-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[modpattern-report] status failed', err);
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
      <DocumentTitle parts={["AI Order Modification Patterns", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faPenToSquare} className="text-violet-600" />
              AI Order Modification Pattern Detector
            </h1>
            <p className="text-sm text-neutral-500">
              Detects "silent recipe feedback" — when customers consistently modify the same item
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Detecting…' : 'Detect patterns'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faDollarSign} label="Revenue leak/mo" value={fmt$(summary.revenueLeak)} color="text-rose-600" />
          <SummaryCard icon={faPenToSquare} label="Items affected" value={String(summary.itemsAffected)} color="text-violet-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faPenToSquare} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-violet-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faPenToSquare} spin className="text-4xl mb-3" />
            <p>Detecting modification patterns…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No modification patterns detected</p>
            <p className="text-sm mt-1">Recipes match customer preferences — no silent feedback.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faPenToSquare, label: alert.rule_id.toUpperCase() };
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
                          {alert.modification_type && (
                            <span className={`text-xs font-medium uppercase ${MOD_TYPE_COLOR[alert.modification_type] ?? 'text-neutral-500'}`}>
                              {alert.modification_type.replace('_', '-')}
                            </span>
                          )}
                          {alert.ingredient && (
                            <span className="text-xs text-neutral-600">
                              {alert.ingredient}
                              {alert.substitute_ingredient && (
                                <>
                                  <span className="mx-1 text-neutral-400">→</span>
                                  <span className="font-medium text-violet-600">{alert.substitute_ingredient}</span>
                                </>
                              )}
                            </span>
                          )}
                          {alert.modification_rate != null && (
                            <span className="text-xs font-bold text-amber-600">
                              {alert.modification_rate}% of orders
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.total_orders != null && alert.modified_orders != null && (
                            <span>{alert.modified_orders}/{alert.total_orders} orders modified</span>
                          )}
                          {alert.revenue_leak_per_order != null && alert.revenue_leak_per_order > 0 && (
                            <span className="text-rose-600 font-medium">Leak: {fmt$(alert.revenue_leak_per_order)}/order</span>
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
                      <FontAwesomeIcon icon={faRotate} /> Redesigning
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
          <span>High mod rate: {config.highRate}%</span>
          <span>Common pattern: {config.commonThreshold}%</span>
          <span>Revenue leak: ${config.revenueLeak}/order</span>
          <span>Slowdown threshold: {config.slowdownThreshold}s</span>
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

export default OrderModificationPatternScreen;
