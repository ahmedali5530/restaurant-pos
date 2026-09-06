/**
 * AI Table Setting & Tableware Quality Optimizer — predicts how tableware
 * (plates, cutlery, glassware, napkins, linens, centerpieces) impacts
 * customer perception of restaurant quality.
 *
 * 157th POSR-exclusive differentiator.
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
  faUtensils, faRotate, faWeightHanging, faTriangleExclamation,
  faWineGlass, faHandshake, faNapkin, faTable, faSeedling,
  faLayerGroup, faCheckCircle, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runTablewareEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readTablewareConfig, DEFAULT_TABLEWARE_CONFIG,
  type TablewareAlert,
} from "@/lib/table-setting-tableware.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  cutlery_weight_too_light:              { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faWeightHanging,    label: 'CUTLERY LIGHT' },
  plate_chip_wear:                       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'CHIPS' },
  glassware_mismatch:                    { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faWineGlass,        label: 'GLASS MISMATCH' },
  tableware_brand_tier_mismatch:         { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faHandshake,        label: 'TIER MISMATCH' },
  napkin_quality_low:                    { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faNapkin,           label: 'NAPKIN' },
  table_linen_missing:                   { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faTable,            label: 'NO LINEN' },
  centerpiece_absent:                    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faSeedling,         label: 'NO CENTERPIECE' },
  tableware_inconsistency_across_tables: { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faLayerGroup,       label: 'INCONSISTENT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function TableSettingTablewareScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TablewareAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgCutleryWeight: 0, avgChipRate: 0, settingsToStandardize: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TABLEWARE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTablewareConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[tableware-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTablewareEngine(db, config);
      toast.success(`Analyzed ${result.generated} tableware signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[tableware-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[tableware-report] status failed', err);
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
      <DocumentTitle parts={["AI Table Setting", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUtensils} className="text-violet-500" />
              AI Table Setting & Tableware Quality Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how tableware impacts quality perception — 68% judge restaurant by tableware (Cornell CHR)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faUtensils} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze tableware'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faWeightHanging} label="Avg cutlery weight" value={`${summary.avgCutleryWeight.toFixed(0)}g`} color={summary.avgCutleryWeight < 50 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Avg chip rate" value={`${summary.avgChipRate.toFixed(0)}%`} color={summary.avgChipRate >= 5 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLayerGroup} label="Settings to standardize" value={String(summary.settingsToStandardize)} color="text-amber-600" />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUtensils} spin className="text-4xl mb-3" />
            <p>Analyzing table setting & tableware quality…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No tableware alerts</p>
            <p className="text-sm mt-1">Tableware quality aligned, consistent, brand-matched.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faUtensils, label: alert.rule_id.toUpperCase() };
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
                          {alert.cutlery_weight_grams != null && (
                            <span className={`text-xs font-bold ${alert.cutlery_weight_grams < 50 ? 'text-rose-600' : 'text-emerald-600'}`}>{alert.cutlery_weight_grams}g cutlery</span>
                          )}
                          {alert.chip_rate_pct != null && (
                            <span className={`text-xs ${alert.chip_rate_pct >= 5 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.chip_rate_pct}% chipped</span>
                          )}
                          {alert.glassware_variants_per_table != null && alert.glassware_variants_per_table > 1 && (
                            <span className="text-xs text-violet-600">{alert.glassware_variants_per_table} glass variants</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-fuchsia-600 uppercase">{alert.restaurant_tier}</span>
                          )}
                          {alert.tableware_tier && (
                            <span className="text-xs text-neutral-500">{alert.tableware_tier} tableware</span>
                          )}
                          {alert.napkin_type && alert.napkin_type === 'paper' && (
                            <span className="text-xs text-orange-600 font-medium">paper napkins</span>
                          )}
                          {alert.has_table_linens === false && (
                            <span className="text-xs text-sky-600">no linens</span>
                          )}
                          {alert.has_centerpiece === false && (
                            <span className="text-xs text-emerald-600">no centerpiece</span>
                          )}
                          {alert.table_setting_variants != null && alert.table_setting_variants > 1 && (
                            <span className="text-xs text-yellow-700 font-medium">{alert.table_setting_variants} setting variants</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.perceived_quality_lift_pct != null && alert.perceived_quality_lift_pct > 0 && (
                            <span className="text-emerald-600">+{alert.perceived_quality_lift_pct}% perceived quality</span>
                          )}
                          {alert.predicted_spend_change_pct != null && alert.predicted_spend_change_pct > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_spend_change_pct}% spend</span>
                          )}
                          {alert.chipped_plate_count != null && (
                            <span>{alert.chipped_plate_count} chipped / {alert.total_plate_count} total</span>
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
                        <div className="text-xs text-neutral-400">/mo at risk</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Action taken
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
          <span>Min cutlery: {config.minCutleryWeightGrams}g</span>
          <span>Max chip rate: {config.maxChipRatePct}%</span>
          <span>Min glass consistency: {config.minGlasswareConsistency} variant</span>
          <span className="text-neutral-400">157th POSR-exclusive differentiator</span>
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

export default TableSettingTablewareScreen;
