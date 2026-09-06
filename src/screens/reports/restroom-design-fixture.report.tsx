/**
 * AI Restroom Design & Fixture Quality Optimizer — predicts how restroom
 * design and fixture quality (fixture age, faucet quality, toilet type,
 * stall privacy, mirror quality, countertop material, tile condition,
 * lighting quality, ventilation, ADA compliance fixtures) impacts customer
 * perception of overall restaurant quality, satisfaction, and return
 * likelihood.
 *
 * 172nd POSR-exclusive differentiator.
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
  faRestroom, faRotate, faFaucetDrip, faSink, faLock, faDoorClosed,
  faWheelchair, faLightbulb, faWind, faToilet,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runRestroomDesignEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readRestroomDesignConfig, DEFAULT_RESTROOM_DESIGN_CONFIG,
  type RestroomDesignAlert,
} from "@/lib/restroom-design-fixture.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  fixture_age_excessive:            { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faToilet,              label: 'AGED FIXTURES' },
  touchless_fixtures_missing:       { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faFaucetDrip,          label: 'NO TOUCHLESS' },
  stall_privacy_inadequate:         { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faLock,                label: 'STALL PRIVACY' },
  faucet_drip_leak:                 { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faFaucetDrip,          label: 'DRIP/LEAK' },
  countertop_material_cheap:        { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faSink,                label: 'CHEAP COUNTERTOP' },
  restroom_lighting_poor:           { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faLightbulb,           label: 'POOR LIGHTING' },
  ada_fixture_noncompliant:         { bg: 'bg-red-50',      text: 'text-red-700',      icon: faWheelchair,          label: 'ADA NONCOMPLIANT' },
  restroom_ventilation_insufficient:{ bg: 'bg-stone-50',    text: 'text-stone-700',    icon: faWind,                label: 'NO VENTILATION' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function RestroomDesignFixtureScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<RestroomDesignAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, restroomsAtRisk: 0, agedFixtureRestrooms: 0, adaNoncompliantRestrooms: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_RESTROOM_DESIGN_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readRestroomDesignConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[restroom-design-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runRestroomDesignEngine(db, config);
      toast.success(`Analyzed ${result.generated} restroom design + fixture signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[restroom-design-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[restroom-design-report] status failed', err);
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
      <DocumentTitle parts={["AI Restroom Design & Fixture Quality Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faRestroom} className="text-sky-600" />
              AI Restroom Design &amp; Fixture Quality Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how restroom design + fixture quality (fixture age, faucet quality, toilet type, stall privacy, mirror quality, countertop material, tile condition, lighting, ventilation, ADA compliance) impacts customer perception of restaurant quality — 88% equate restroom with kitchen cleanliness (Zagat); 56% form entire impression from restroom (Harris Poll); touchless fixtures reduce germ perception 45%; ADA non-compliance = $55k-$200k lawsuit; 50% will not return with bad restroom
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faRestroom} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze restroom'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faToilet} label="Aged fixture restrooms" value={String(summary.agedFixtureRestrooms)} color={summary.agedFixtureRestrooms > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faWheelchair} label="ADA noncompliant" value={String(summary.adaNoncompliantRestrooms)} color={summary.adaNoncompliantRestrooms > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Restrooms at risk" value={String(summary.restroomsAtRisk)} color={summary.restroomsAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faRestroom} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRestroom} spin className="text-4xl mb-3" />
            <p>Analyzing restroom design + fixture quality opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No restroom design/fixture alerts</p>
            <p className="text-sm mt-1">Fixtures modern, touchless fixtures present, stall privacy adequate, faucets drip-free, countertops premium, lighting bright, ADA-compliant, ventilation sufficient.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faRestroom, label: alert.rule_id.toUpperCase() };
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
                          {alert.location_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.location_id}</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.fixture_age_years != null && alert.fixture_age_years > 0 && (
                            <span className={`text-xs ${alert.fixture_age_years > 15 ? 'text-rose-600 font-medium' : alert.fixture_age_years > 10 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.fixture_age_years} yr old fixtures</span>
                          )}
                          {alert.touchless_fixture_count != null && (
                            <span className={`text-xs ${alert.touchless_fixture_count < 3 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.touchless_fixture_count}/4 touchless</span>
                          )}
                          {alert.faucet_drip_leak != null && alert.faucet_drip_leak && (
                            <span className="text-xs text-rose-600 font-medium">drip/leak</span>
                          )}
                          {alert.stall_door_gap_inches != null && alert.stall_door_gap_inches > 0.5 && (
                            <span className={`text-xs ${alert.stall_door_gap_inches > 1.5 ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.stall_door_gap_inches}in side gap</span>
                          )}
                          {alert.stall_door_height_gap != null && alert.stall_door_height_gap > 1 && (
                            <span className={`text-xs ${alert.stall_door_height_gap > 3 ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.stall_door_height_gap}in height gap</span>
                          )}
                          {alert.countertop_material && (
                            <span className={`text-xs ${['laminate'].includes(alert.countertop_material) ? 'text-rose-600 font-medium' : ['granite', 'marble', 'quartz'].includes(alert.countertop_material) ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.countertop_material}</span>
                          )}
                          {alert.countertop_quality_score != null && alert.countertop_quality_score > 0 && (
                            <span className={`text-xs ${alert.countertop_quality_score < 60 ? 'text-rose-600 font-medium' : alert.countertop_quality_score < 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.countertop_quality_score}/100 countertop</span>
                          )}
                          {alert.lighting_lux != null && alert.lighting_lux > 0 && (
                            <span className={`text-xs ${alert.lighting_lux < 150 ? 'text-rose-600 font-medium' : alert.lighting_lux < 300 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.lighting_lux} lux</span>
                          )}
                          {alert.has_ada_stall != null && !alert.has_ada_stall && (
                            <span className="text-xs text-rose-600 font-medium">no ADA stall</span>
                          )}
                          {alert.has_grab_bars != null && !alert.has_grab_bars && (
                            <span className="text-xs text-rose-600 font-medium">no grab bars</span>
                          )}
                          {alert.ada_sink_clearance != null && !alert.ada_sink_clearance && (
                            <span className="text-xs text-rose-600 font-medium">no ADA sink</span>
                          )}
                          {alert.has_exhaust_fan != null && !alert.has_exhaust_fan && (
                            <span className="text-xs text-rose-600 font-medium">no exhaust fan</span>
                          )}
                          {alert.ventilation_quality_score != null && alert.ventilation_quality_score > 0 && alert.ventilation_quality_score < 75 && (
                            <span className={`text-xs ${alert.ventilation_quality_score < 50 ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.ventilation_quality_score}/100 ventilation</span>
                          )}
                          {alert.perceived_cleanliness_score != null && alert.perceived_cleanliness_score > 0 && (
                            <span className={`text-xs ${alert.perceived_cleanliness_score < 50 ? 'text-rose-600 font-medium' : alert.perceived_cleanliness_score < 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.perceived_cleanliness_score}/100 perceived clean</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.perceived_cleanliness_change != null && alert.perceived_cleanliness_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_cleanliness_change}% perceived cleanliness</span>
                          )}
                          {alert.customer_satisfaction_change != null && alert.customer_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.customer_satisfaction_change}% satisfaction</span>
                          )}
                          {alert.return_likelihood_change != null && alert.return_likelihood_change < 0 && (
                            <span className="text-rose-600">{alert.return_likelihood_change}% return likelihood</span>
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
          <span>Max fixture age: {config.maxFixtureAgeYears} yr</span>
          <span>Touchless fixtures: <span className={config.requireTouchlessFixtures ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireTouchlessFixtures ? 'required' : 'optional'}</span> (min {config.minTouchlessFixtureCount}/4)</span>
          <span>Max door gap: {config.maxStallDoorGapInches} in</span>
          <span>Max door height gap: {config.maxStallDoorHeightGap} in</span>
          <span>Min stall privacy: {config.minStallPrivacyScore}/100</span>
          <span>Drip/leak: <span className={config.prohibitFaucetDripLeak ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.prohibitFaucetDripLeak ? 'prohibited' : 'allowed'}</span></span>
          <span>Min countertop quality: {config.minCountertopQualityScore}/100</span>
          <span>Prohibited countertops: {config.prohibitedCountertopMaterials.join(', ') || 'none'}</span>
          <span>Min lighting: {config.minLightingLux} lux</span>
          <span>Min lighting quality: {config.minLightingQualityScore}/100</span>
          <span>ADA compliant: <span className={config.requireAdaCompliant ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireAdaCompliant ? 'required' : 'optional'}</span></span>
          <span>Exhaust fan: <span className={config.requireExhaustFan ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireExhaustFan ? 'required' : 'optional'}</span></span>
          <span>Min ventilation: {config.minVentilationQualityScore}/100</span>
          <span>Min perceived cleanliness: {config.minPerceivedCleanlinessScore}/100</span>
          <span className="text-neutral-400">172nd POSR-exclusive differentiator</span>
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

export default RestroomDesignFixtureScreen;
