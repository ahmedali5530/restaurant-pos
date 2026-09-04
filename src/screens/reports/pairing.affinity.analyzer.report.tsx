/**
 * AI Menu Item Pairing Affinity Analyzer — measures pairing affinity strength
 * between menu items, detects invisible pairings, recommends combo creation.
 *
 * 115th POSR-exclusive differentiator — restaurants leave $300-1,200/mo per
 * location from unmonetized pairing affinities. No POS measures pairing
 * affinity strength or detects invisible pairings.
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
  faLink, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faEyeSlash, faBoxArchive, faArrowTrendDown,
  faShuffle, faStar, faDollarSign, faCalendarDays, faListUl,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPairAffEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readPairAffConfig, DEFAULT_PAIRAFF_CONFIG,
  type PairAffAlert,
} from "@/lib/pairing-affinity-analyzer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  invisible_pairing:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faEyeSlash,          label: 'INVISIBLE PAIRING' },
  combo_underperforming:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faBoxArchive,        label: 'COMBO UNDERPERF' },
  pairing_decay:               { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,    label: 'PAIRING DECAY' },
  cross_category_opportunity:  { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faShuffle,           label: 'CROSS-CATEGORY' },
  high_affinity_combo:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faStar,              label: 'HIGH AFFINITY' },
  pairing_revenue_leak:        { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faDollarSign,        label: 'REVENUE LEAK' },
  seasonal_pairing_shift:      { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCalendarDays,      label: 'SEASONAL SHIFT' },
  menu_layout_recommendation:  { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: faListUl,           label: 'MENU LAYOUT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function PairingAffinityAnalyzerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<PairAffAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, invisiblePairings: 0, totalPairingRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PAIRAFF_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPairAffConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[pairaff-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPairAffEngine(db, config);
      toast.success(`Analyzed ${result.generated} pairings — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[pairaff-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[pairaff-report] status failed', err);
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
      <DocumentTitle parts={["AI Pairing Affinity", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLink} className="text-violet-600" />
              AI Menu Item Pairing Affinity Analyzer
            </h1>
            <p className="text-sm text-neutral-500">
              Measures pairing affinity strength — detects invisible pairings + recommends combo creation
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze pairings'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faEyeSlash} label="Invisible pairings" value={String(summary.invisiblePairings)} color="text-amber-600" />
          <SummaryCard icon={faDollarSign} label="Pairing revenue" value={fmt$(summary.totalPairingRevenue)} color="text-emerald-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faLink} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-violet-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLink} spin className="text-4xl mb-3" />
            <p>Analyzing pairing affinities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No pairing affinity alerts</p>
            <p className="text-sm mt-1">All pairings at expected affinity — no invisible pairings.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLink, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">
                            {alert.item_a}
                            <span className="mx-1 text-neutral-400">+</span>
                            {alert.item_b}
                          </span>
                          {alert.category_a && alert.category_b && (
                            <span className="text-xs text-neutral-500">
                              <span className={alert.category_a !== alert.category_b ? 'text-violet-600 font-medium' : ''}>{alert.category_a}</span>
                              <span className="mx-0.5">·</span>
                              <span className={alert.category_a !== alert.category_b ? 'text-violet-600 font-medium' : ''}>{alert.category_b}</span>
                            </span>
                          )}
                          {alert.lift != null && (
                            <span className={`text-xs font-bold ${alert.lift >= 3 ? 'text-emerald-600' : alert.lift >= 2 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {alert.lift}x lift
                            </span>
                          )}
                          {alert.affinity_score != null && (
                            <span className="text-xs text-neutral-500">{alert.affinity_score}/100 affinity</span>
                          )}
                          {alert.is_promoted_combo && (
                            <span className="text-xs font-medium text-sky-600">combo</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.co_occurrence_count != null && <span>{alert.co_occurrence_count} co-occurrences</span>}
                          {alert.support_pct != null && <span>{alert.support_pct}% support</span>}
                          {alert.confidence_pct != null && <span>{alert.confidence_pct}% confidence</span>}
                          {alert.pairing_revenue != null && <span className="text-emerald-600 font-medium">Rev: {fmt$(alert.pairing_revenue)}</span>}
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Created
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Designing
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
          <span>Lift threshold: {config.liftThreshold}x</span>
          <span>Min support: {config.supportMin}%</span>
          <span>Revenue threshold: ${config.revenueThreshold}</span>
          <span>Decay drop: {config.decayDrop}%</span>
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

export default PairingAffinityAnalyzerScreen;
