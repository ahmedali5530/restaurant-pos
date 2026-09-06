/**
 * AI Curb Appeal & Exterior Facade Optimizer — predicts how curb appeal and
 * exterior facade (storefront signage, window display, exterior lighting,
 * entrance visibility, sidewalk cleanliness, facade paint, awning condition,
 * landscaping frontage) impacts customer acquisition, walk-in rate,
 * perceived restaurant quality, brand perception, and price acceptance.
 *
 * 164th POSR-exclusive differentiator.
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
  faStore, faRotate, faSignHanging, faLightbulb, faBroom,
  faPaintRoller, faBuilding, faDoorOpen, faTree,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runCurbAppealEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readCurbAppealConfig, DEFAULT_CURB_APPEAL_CONFIG,
  type CurbAppealAlert,
} from "@/lib/curb-appeal-facade.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  signage_faded_damaged:            { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faSignHanging, label: 'FADED SIGNAGE' },
  exterior_lighting_insufficient:   { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faLightbulb,   label: 'DARK EXTERIOR' },
  sidewalk_cleanliness_poor:        { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faBroom,       label: 'DIRTY SIDEWALK' },
  window_display_absent:            { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faStore,       label: 'NO WINDOW DISPLAY' },
  facade_paint_peeling:             { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faPaintRoller, label: 'PEELING PAINT' },
  awning_condition_poor:            { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faBuilding,    label: 'AWNING POOR' },
  entrance_visibility_poor:         { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faDoorOpen,    label: 'HIDDEN ENTRANCE' },
  landscaping_frontage_neglected:   { bg: 'bg-lime-50',     text: 'text-lime-700',     icon: faTree,        label: 'DEAD LANDSCAPING' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function CurbAppealFacadeScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<CurbAppealAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, storesAtRisk: 0, fadedSignageStores: 0, poorLightingStores: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CURB_APPEAL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCurbAppealConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[curb-appeal-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCurbAppealEngine(db, config);
      toast.success(`Analyzed ${result.generated} curb appeal signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[curb-appeal-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[curb-appeal-report] status failed', err);
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
      <DocumentTitle parts={["AI Curb Appeal & Exterior Facade Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faStore} className="text-rose-500" />
              AI Curb Appeal &amp; Exterior Facade Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how curb appeal (signage, lighting, sidewalk, window display, facade paint, awning, entrance, landscaping) impacts walk-in rate + perceived quality + price expectation — 70% of walk-in decisions made from street (NRA); faded signage reduces walk-ins 25-35% (Cornell CHR); dark exteriors reduce evening walk-ins 40%
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faStore} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze curb appeal'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faSignHanging} label="Faded signage stores" value={String(summary.fadedSignageStores)} color={summary.fadedSignageStores > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLightbulb} label="Poor lighting stores" value={String(summary.poorLightingStores)} color={summary.poorLightingStores > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Stores at risk" value={String(summary.storesAtRisk)} color={summary.storesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faStore} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faStore} spin className="text-4xl mb-3" />
            <p>Analyzing curb appeal &amp; exterior facade opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No curb appeal alerts</p>
            <p className="text-sm mt-1">Signage above 75, exterior lighting above 100 lux, sidewalk above 80, window display fresh, facade paint above 80, awning above 80, entrance visible, landscaping above 75.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faStore, label: alert.rule_id.toUpperCase() };
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
                          {alert.store_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.store_id}</span>
                          )}
                          {alert.signage_condition_score != null && alert.signage_condition_score > 0 && (
                            <span className={`text-xs ${alert.signage_condition_score < 45 ? 'text-rose-600 font-medium' : alert.signage_condition_score < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.signage_condition_score}/100 signage</span>
                          )}
                          {alert.exterior_lighting_lux != null && alert.exterior_lighting_lux > 0 && (
                            <span className={`text-xs ${alert.exterior_lighting_lux < 50 ? 'text-rose-600 font-medium' : alert.exterior_lighting_lux < 100 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.exterior_lighting_lux} lux</span>
                          )}
                          {alert.sidewalk_cleanliness_score != null && alert.sidewalk_cleanliness_score > 0 && (
                            <span className={`text-xs ${alert.sidewalk_cleanliness_score < 60 ? 'text-rose-600 font-medium' : alert.sidewalk_cleanliness_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.sidewalk_cleanliness_score}/100 sidewalk</span>
                          )}
                          {alert.facade_paint_condition_score != null && alert.facade_paint_condition_score > 0 && (
                            <span className={`text-xs ${alert.facade_paint_condition_score < 55 ? 'text-rose-600 font-medium' : alert.facade_paint_condition_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.facade_paint_condition_score}/100 paint</span>
                          )}
                          {alert.awning_condition_score != null && alert.awning_condition_score > 0 && (
                            <span className={`text-xs ${alert.awning_condition_score < 50 ? 'text-rose-600 font-medium' : alert.awning_condition_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.awning_condition_score}/100 awning</span>
                          )}
                          {alert.entrance_visibility_score != null && alert.entrance_visibility_score > 0 && (
                            <span className={`text-xs ${alert.entrance_visibility_score < 60 ? 'text-rose-600 font-medium' : alert.entrance_visibility_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.entrance_visibility_score}/100 entrance</span>
                          )}
                          {alert.landscaping_frontage_score != null && alert.landscaping_frontage_score > 0 && (
                            <span className={`text-xs ${alert.landscaping_frontage_score < 50 ? 'text-rose-600 font-medium' : alert.landscaping_frontage_score < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.landscaping_frontage_score}/100 landscape</span>
                          )}
                          {alert.has_window_display && (
                            <span className="text-xs text-emerald-600 font-medium">window display</span>
                          )}
                          {alert.has_awning && (
                            <span className="text-xs text-emerald-600 font-medium">awning</span>
                          )}
                          {alert.has_signage_illumination && (
                            <span className="text-xs text-emerald-600 font-medium">sign lit</span>
                          )}
                          {alert.price_expectation_index != null && alert.price_expectation_index > 0 && (
                            <span className={`text-xs ${alert.price_expectation_index < 60 ? 'text-rose-600 font-medium' : alert.price_expectation_index < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.price_expectation_index}/100 price exp</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_walk_in_change_pct != null && alert.predicted_walk_in_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_walk_in_change_pct}% walk-ins</span>
                          )}
                          {alert.perceived_quality_change != null && alert.perceived_quality_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_quality_change}% perceived quality</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
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
          <span>Min signage score: {config.minSignageConditionScore}/100</span>
          <span>Min exterior lux: {config.minExteriorLightingLux}</span>
          <span>Min sidewalk: {config.minSidewalkCleanlinessScore}/100</span>
          <span>Window display: <span className={config.requireWindowDisplay ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireWindowDisplay ? 'required' : 'optional'}</span></span>
          <span>Max display age: {config.maxWindowDisplayAgeDays} days</span>
          <span>Min facade paint: {config.minFacadePaintScore}/100</span>
          <span>Min awning: {config.minAwningScore}/100</span>
          <span>Min entrance: {config.minEntranceVisibilityScore}/100</span>
          <span>Min landscaping: {config.minLandscapingScore}/100</span>
          <span className="text-neutral-400">164th POSR-exclusive differentiator</span>
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

export default CurbAppealFacadeScreen;
