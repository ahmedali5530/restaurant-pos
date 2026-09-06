/**
 * AI Green Certification & Eco-Practice Optimizer — predicts which
 * eco-practices (compostable packaging, local sourcing, LED lighting, water
 * conservation, green cleaning, solar, EV charging) and green certifications
 * (Green Restaurant Association, LEED, B Corp) to implement for maximum
 * customer perception, certification ROI, cost savings, and competitive
 * differentiation.
 *
 * 175th POSR-exclusive differentiator.
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
  faLeaf, faRotate, faCertificate, faRecycle, faLightbulb,
  faSeedling, faHandHoldingDroplet, faSprayCan, faPlugCircleBolt,
  faShop, faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runGreenEcoEngine, getActiveGreenEcoAlerts, getGreenEcoSummary,
  updateGreenEcoAlertStatus, readGreenEcoConfig, DEFAULT_GREEN_ECO_CONFIG,
  type GreenEcoAlert,
} from "@/lib/green-certification-eco.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  green_certification_absent:         { bg: 'bg-rose-50',        text: 'text-rose-700',       icon: faCertificate,        label: 'NO CERT' },
  visible_eco_practice_missing:       { bg: 'bg-amber-50',       text: 'text-amber-700',      icon: faRecycle,            label: 'NO VISIBLE PRACTICES' },
  led_lighting_not_deployed:          { bg: 'bg-yellow-50',      text: 'text-yellow-700',     icon: faLightbulb,          label: 'NO LED' },
  compostable_packaging_absent:       { bg: 'bg-orange-50',      text: 'text-orange-700',     icon: faShop,               label: 'NO COMPOSTABLE PKG' },
  local_sourcing_not_promoted:        { bg: 'bg-emerald-50',     text: 'text-emerald-700',    icon: faSeedling,           label: 'LOCAL NOT PROMOTED' },
  water_conservation_gap:             { bg: 'bg-sky-50',         text: 'text-sky-700',        icon: faHandHoldingDroplet, label: 'NO WATER CONSERV' },
  green_cleaning_products_absent:     { bg: 'bg-violet-50',      text: 'text-violet-700',     icon: faSprayCan,           label: 'CHEMICAL CLEANERS' },
  ev_charging_station_opportunity:    { bg: 'bg-teal-50',        text: 'text-teal-700',       icon: faPlugCircleBolt,     label: 'NO EV CHARGING' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function GreenCertificationEcoScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<GreenEcoAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noGreenCertification: 0, missingVisiblePractices: 0, noLedLighting: 0, noEvCharging: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_GREEN_ECO_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readGreenEcoConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveGreenEcoAlerts(db), getGreenEcoSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[green-certification-eco-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runGreenEcoEngine(db, config);
      toast.success(`Analyzed ${result.generated} green certification + eco-practice signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[green-certification-eco-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateGreenEcoAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[green-certification-eco-report] status failed', err);
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
      <DocumentTitle parts={["AI Green Certification & Eco-Practice Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLeaf} className="text-emerald-600" />
              AI Green Certification &amp; Eco-Practice Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts which eco-practices (compostable packaging, local sourcing, LED lighting, water conservation, green cleaning, solar, EV charging) and certifications (Green Restaurant Association, LEED, B Corp) to implement for maximum customer perception, certification ROI, cost savings — 65% prefer eco-friendly restaurants and pay 10-15% more (Nielsen); green certification increases acquisition 20-30%; 38% of millennials choose by sustainability (McKinsey); LED saves 75% energy; distinct from carbon-footprint-tracker (90th) which tracks emissions — this optimizes visible eco-practices for customer-facing impact
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLeaf} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze eco-practices'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faCertificate} label="No green certification" value={String(summary.noGreenCertification)} color={summary.noGreenCertification > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faRecycle} label="Missing visible practices" value={String(summary.missingVisiblePractices)} color={summary.missingVisiblePractices > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faPlugCircleBolt} label="No EV charging" value={String(summary.noEvCharging)} color={summary.noEvCharging > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLeaf} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-emerald-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLeaf} spin className="text-4xl mb-3" />
            <p>Analyzing green certification + eco-practice opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No green certification / eco-practice alerts</p>
            <p className="text-sm mt-1">Green certification obtained or in progress, visible eco-practices deployed, LED lighting throughout, compostable packaging for delivery, local sourcing promoted on menu, water conservation fixtures installed, green cleaning products used, EV charging stations in parking lot.</p>
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
                          {alert.location_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.location_id}</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.setting_type && (
                            <span className="text-xs text-neutral-500">{alert.setting_type}</span>
                          )}
                          {alert.customer_demographic && (
                            <span className={`text-xs ${alert.customer_demographic === 'eco_conscious' ? 'text-emerald-600 font-medium' : alert.customer_demographic === 'millennial_heavy' ? 'text-sky-600 font-medium' : 'text-neutral-500'}`}>{alert.customer_demographic}</span>
                          )}
                          {alert.has_green_certification != null && (
                            <span className={`text-xs ${alert.has_green_certification ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_green_certification ? 'certified' : 'NO CERT'}</span>
                          )}
                          {alert.certification_type && alert.certification_type !== 'none' && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.certification_type}</span>
                          )}
                          {alert.certification_in_progress != null && alert.certification_in_progress && (
                            <span className="text-xs text-amber-600 font-medium">cert in progress</span>
                          )}
                          {alert.has_compostable_packaging != null && alert.has_compostable_packaging && (
                            <span className="text-xs text-emerald-600 font-medium">compostable pkg</span>
                          )}
                          {alert.has_local_sourcing != null && alert.has_local_sourcing && (
                            <span className={`text-xs ${alert.local_sourcing_promoted_on_menu ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>local {alert.local_sourcing_promoted_on_menu ? '(promoted)' : '(NOT promoted)'}</span>
                          )}
                          {alert.local_ingredient_pct != null && alert.local_ingredient_pct > 0 && (
                            <span className={`text-xs ${alert.local_ingredient_pct > 50 ? 'text-emerald-600 font-medium' : alert.local_ingredient_pct > 25 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.local_ingredient_pct}% local</span>
                          )}
                          {alert.has_recycling_stations != null && alert.has_recycling_stations && (
                            <span className="text-xs text-emerald-600 font-medium">recycling stations</span>
                          )}
                          {alert.has_visible_eco_signage != null && alert.has_visible_eco_signage && (
                            <span className="text-xs text-emerald-600 font-medium">eco signage</span>
                          )}
                          {alert.has_garden_or_green_wall != null && alert.has_garden_or_green_wall && (
                            <span className="text-xs text-emerald-600 font-medium">garden/green wall</span>
                          )}
                          {alert.has_led_lighting != null && alert.has_led_lighting && (
                            <span className="text-xs text-emerald-600 font-medium">LED</span>
                          )}
                          {alert.has_water_conservation != null && alert.has_water_conservation && (
                            <span className="text-xs text-emerald-600 font-medium">water conserv</span>
                          )}
                          {alert.has_green_cleaning_products != null && alert.has_green_cleaning_products && (
                            <span className="text-xs text-emerald-600 font-medium">green cleaning</span>
                          )}
                          {alert.has_ev_charging_stations != null && alert.has_ev_charging_stations > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">EV stations ({alert.has_ev_charging_stations})</span>
                          )}
                          {alert.eco_perception_score != null && alert.eco_perception_score > 0 && (
                            <span className={`text-xs ${alert.eco_perception_score < 40 ? 'text-rose-600 font-medium' : alert.eco_perception_score < 65 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.eco_perception_score}/100 eco</span>
                          )}
                          {alert.premium_pricing_eligibility != null && alert.premium_pricing_eligibility > 0 && (
                            <span className={`text-xs ${alert.premium_pricing_eligibility < 40 ? 'text-rose-600 font-medium' : alert.premium_pricing_eligibility < 60 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.premium_pricing_eligibility}/100 premium</span>
                          )}
                          {alert.monthly_energy_cost != null && alert.monthly_energy_cost > 0 && (
                            <span className={`text-xs ${alert.monthly_energy_cost > 2000 ? 'text-rose-600 font-medium' : alert.monthly_energy_cost > 1200 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>${alert.monthly_energy_cost}/mo energy</span>
                          )}
                          {alert.monthly_water_cost != null && alert.monthly_water_cost > 0 && (
                            <span className={`text-xs ${alert.monthly_water_cost > 800 ? 'text-rose-600 font-medium' : alert.monthly_water_cost > 500 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>${alert.monthly_water_cost}/mo water</span>
                          )}
                          {alert.delivery_revenue != null && alert.delivery_revenue > 0 && (
                            <span className={`text-xs ${alert.delivery_revenue > 15000 ? 'text-sky-600 font-medium' : 'text-neutral-500'}`}>${alert.delivery_revenue}/mo delivery</span>
                          )}
                          {alert.eco_conscious_customer_pct != null && alert.eco_conscious_customer_pct > 0 && (
                            <span className={`text-xs ${alert.eco_conscious_customer_pct > 50 ? 'text-emerald-600 font-medium' : alert.eco_conscious_customer_pct > 30 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.eco_conscious_customer_pct}% eco customers</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.customer_acquisition_change != null && alert.customer_acquisition_change < 0 && (
                            <span className="text-rose-600">{alert.customer_acquisition_change}% acquisition</span>
                          )}
                          {alert.premium_pricing_change != null && alert.premium_pricing_change < 0 && (
                            <span className="text-rose-600">{alert.premium_pricing_change}% premium pricing</span>
                          )}
                          {alert.energy_cost_change_pct != null && alert.energy_cost_change_pct < 0 && (
                            <span className="text-rose-600">{alert.energy_cost_change_pct}% energy cost (missed savings)</span>
                          )}
                          {alert.water_cost_change_pct != null && alert.water_cost_change_pct < 0 && (
                            <span className="text-rose-600">{alert.water_cost_change_pct}% water cost (missed savings)</span>
                          )}
                          {alert.packaging_cost_change_pct != null && alert.packaging_cost_change_pct > 0 && (
                            <span className="text-amber-600">+{alert.packaging_cost_change_pct}% packaging cost (offset by retention)</span>
                          )}
                          {alert.competitive_diff_change != null && alert.competitive_diff_change < 0 && (
                            <span className="text-rose-600">{alert.competitive_diff_change}% competitive diff</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLeaf} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo opportunity</div>
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
          <span>Green certification: <span className={config.requireGreenCertification ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireGreenCertification ? 'required' : 'optional'}</span></span>
          <span>Visible eco-practices: <span className={config.requireVisibleEcoPractices ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireVisibleEcoPractices ? 'required' : 'optional'}</span> (threshold {config.visibleEcoPracticeThreshold})</span>
          <span>LED lighting: <span className={config.requireLedLighting ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireLedLighting ? 'required' : 'optional'}</span></span>
          <span>Compostable packaging if delivery: <span className={config.requireCompostablePackagingIfDelivery ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCompostablePackagingIfDelivery ? 'required' : 'optional'}</span> (delivery threshold {config.deliveryRevenueThresholdPct}%)</span>
          <span>Local sourcing promotion: <span className={config.requireLocalSourcingPromotion ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireLocalSourcingPromotion ? 'required' : 'optional'}</span> (local threshold {config.localSourcingThresholdPct}%)</span>
          <span>Water conservation: <span className={config.requireWaterConservation ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireWaterConservation ? 'required' : 'optional'}</span></span>
          <span>Green cleaning products: <span className={config.requireGreenCleaningProducts ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireGreenCleaningProducts ? 'required' : 'optional'}</span></span>
          <span>EV charging if parking lot: <span className={config.requireEvChargingIfParkingLot ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireEvChargingIfParkingLot ? 'required' : 'optional'}</span></span>
          <span>Min eco perception: {config.minEcoPerceptionScore}/100</span>
          <span>Min competitive diff: {config.minCompetitiveDifferentiationScore}/100</span>
          <span>Min premium pricing: {config.minPremiumPricingEligibility}/100</span>
          <span className="text-neutral-400">175th POSR-exclusive differentiator</span>
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

export default GreenCertificationEcoScreen;
