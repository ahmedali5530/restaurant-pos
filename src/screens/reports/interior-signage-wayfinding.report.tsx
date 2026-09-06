/**
 * AI Interior Signage & Wayfinding Optimizer — predicts how interior signage
 * and wayfinding (restroom signs, directional arrows, zone labels, ADA
 * signage, exit signs, digital signage, branding consistency, signage
 * lighting) impacts customer navigation friction, perceived professionalism,
 * ADA compliance, operational efficiency.
 *
 * 166th POSR-exclusive differentiator.
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
  faSignsPost, faRotate, faRestroom, faMagnifyingGlass,
  faArrowRight, faUniversalAccess, faFont, faRightFromBracket,
  faDisplay, faMapLocationDot, faLightbulb,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runSignageEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readSignageConfig, DEFAULT_SIGNAGE_CONFIG,
  type SignageAlert,
} from "@/lib/interior-signage-wayfinding.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  restroom_signage_missing_unclear:    { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faRestroom,             label: 'RESTROOM SIGN' },
  directional_signage_insufficient:    { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faArrowRight,           label: 'NO DIRECTIONAL' },
  ada_signage_noncompliant:            { bg: 'bg-red-50',      text: 'text-red-700',      icon: faUniversalAccess,      label: 'ADA RISK' },
  signage_inconsistency:               { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faFont,                 label: 'INCONSISTENT' },
  exit_signage_obscured:               { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faRightFromBracket,     label: 'EXIT OBSCURED' },
  digital_signage_underutilized:       { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faDisplay,              label: 'NO DIGITAL' },
  zone_labeling_absent:                { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faMapLocationDot,       label: 'NO ZONE LABELS' },
  signage_lighting_poor:               { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faLightbulb,            label: 'POOR LIGHTING' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function InteriorSignageWayfindingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<SignageAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, locationsAtRisk: 0, adaRiskLocations: 0, missingRestroomSigns: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SIGNAGE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSignageConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[interior-signage-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runSignageEngine(db, config);
      toast.success(`Analyzed ${result.generated} signage/wayfinding signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[interior-signage-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[interior-signage-report] status failed', err);
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
      <DocumentTitle parts={["AI Interior Signage & Wayfinding Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faSignsPost} className="text-rose-500" />
              AI Interior Signage &amp; Wayfinding Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how interior signage + wayfinding (restroom signs, directional arrows, ADA Braille signage, exit signs, digital menu boards, zone labels, signage consistency, signage lighting) impact navigation friction + perceived professionalism + ADA compliance — 45% report difficulty finding restrooms (ADA Network); poor wayfinding increases perceived wait 12-15%; missing ADA signage = $55k-$200k lawsuit risk; 68% judge professionalism by signage quality (Cornell CHR); digital signage increases impulse purchases 18-25%
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faSignsPost} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze signage'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faRestroom} label="Missing restroom signs" value={String(summary.missingRestroomSigns)} color={summary.missingRestroomSigns > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faUniversalAccess} label="ADA risk locations" value={String(summary.adaRiskLocations)} color={summary.adaRiskLocations > 0 ? 'text-red-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Locations at risk" value={String(summary.locationsAtRisk)} color={summary.locationsAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faSignsPost} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faSignsPost} spin className="text-4xl mb-3" />
            <p>Analyzing interior signage &amp; wayfinding opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No interior signage/wayfinding alerts</p>
            <p className="text-sm mt-1">Restroom signs visible with clarity above 80, directional arrows above 2, ADA Braille signage present, signage consistency above 80, illuminated exit signs unobstructed, digital menu boards deployed, zone labels on every zone, signage lux above 200, signage lighting score above 80.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faSignsPost, label: alert.rule_id.toUpperCase() };
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
                          {alert.has_restroom_signage != null && (
                            <span className={`text-xs ${alert.has_restroom_signage ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>restroom {alert.has_restroom_signage ? 'signed' : 'missing'}</span>
                          )}
                          {alert.restroom_sign_clarity_score != null && alert.restroom_sign_clarity_score > 0 && (
                            <span className={`text-xs ${alert.restroom_sign_clarity_score < 50 ? 'text-rose-600 font-medium' : alert.restroom_sign_clarity_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.restroom_sign_clarity_score}/100 clarity</span>
                          )}
                          {alert.has_directional_arrows != null && (
                            <span className={`text-xs ${!alert.has_directional_arrows ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.directional_sign_count ?? 0} arrows</span>
                          )}
                          {alert.has_ada_braille_signage != null && (
                            <span className={`text-xs ${!alert.has_ada_braille_signage ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>ADA {alert.has_ada_braille_signage ? 'Braille' : 'no Braille'}</span>
                          )}
                          {alert.ada_compliance_score != null && alert.ada_compliance_score > 0 && (
                            <span className={`text-xs ${alert.ada_compliance_score < 50 ? 'text-rose-600 font-medium' : alert.ada_compliance_score < 85 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.ada_compliance_score}/100 ADA</span>
                          )}
                          {alert.signage_consistency_score != null && alert.signage_consistency_score > 0 && (
                            <span className={`text-xs ${alert.signage_consistency_score < 50 ? 'text-rose-600 font-medium' : alert.signage_consistency_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.signage_consistency_score}/100 consistent</span>
                          )}
                          {alert.has_unified_brand_signage != null && !alert.has_unified_brand_signage && (
                            <span className="text-xs text-amber-600 font-medium">no brand unity</span>
                          )}
                          {alert.has_illuminated_exit_sign != null && (
                            <span className={`text-xs ${!alert.has_illuminated_exit_sign ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>exit {alert.has_illuminated_exit_sign ? 'lit' : 'unlit'}</span>
                          )}
                          {alert.exit_sign_obstructed && (
                            <span className="text-xs text-rose-600 font-medium">exit obstructed</span>
                          )}
                          {alert.has_digital_menu_board != null && (
                            <span className={`text-xs ${!alert.has_digital_menu_board ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.has_digital_menu_board ? 'digital menu' : 'no digital menu'}</span>
                          )}
                          {alert.has_digital_promo_display != null && alert.has_digital_promo_display && (
                            <span className="text-xs text-emerald-600 font-medium">promo display</span>
                          )}
                          {alert.digital_signage_count != null && alert.digital_signage_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.digital_signage_count} digital signs</span>
                          )}
                          {alert.has_zone_labels != null && (
                            <span className={`text-xs ${!alert.has_zone_labels ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.zone_label_count ?? 0} zone labels</span>
                          )}
                          {alert.signage_lux_level != null && alert.signage_lux_level > 0 && (
                            <span className={`text-xs ${alert.signage_lux_level < 100 ? 'text-rose-600 font-medium' : alert.signage_lux_level < 200 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.signage_lux_level} lux</span>
                          )}
                          {alert.signage_lighting_score != null && alert.signage_lighting_score > 0 && (
                            <span className={`text-xs ${alert.signage_lighting_score < 50 ? 'text-rose-600 font-medium' : alert.signage_lighting_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.signage_lighting_score}/100 lit</span>
                          )}
                          {alert.ada_lawsuit_risk_level && (
                            <span className={`text-xs font-medium ${alert.ada_lawsuit_risk_level === 'critical' ? 'text-rose-600' : alert.ada_lawsuit_risk_level === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>{alert.ada_lawsuit_risk_level} ADA risk</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.perceived_professionalism_change != null && alert.perceived_professionalism_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_professionalism_change}% professionalism</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_satisfaction_change}% satisfaction</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faMagnifyingGlass} className="mt-0.5 shrink-0" />
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
          <span>Min restroom clarity: {config.minRestroomSignClarityScore}/100</span>
          <span>Min directional signs: {config.minDirectionalSignCount}</span>
          <span>ADA Braille: <span className={config.requireAdaBrailleSignage ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireAdaBrailleSignage ? 'required' : 'optional'}</span></span>
          <span>Min ADA score: {config.minAdaComplianceScore}/100</span>
          <span>Min consistency: {config.minSignageConsistencyScore}/100</span>
          <span>Illuminated exit: <span className={config.requireIlluminatedExitSign ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireIlluminatedExitSign ? 'required' : 'optional'}</span></span>
          <span>Digital menu board: <span className={config.requireDigitalMenuBoard ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireDigitalMenuBoard ? 'required' : 'optional'}</span></span>
          <span>Min digital signs: {config.minDigitalSignageCount}</span>
          <span>Zone labels: <span className={config.requireZoneLabels ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireZoneLabels ? 'required' : 'optional'}</span></span>
          <span>Min signage lux: {config.minSignageLuxLevel}</span>
          <span>Min signage lighting: {config.minSignageLightingScore}/100</span>
          <span className="text-neutral-400">166th POSR-exclusive differentiator</span>
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

export default InteriorSignageWayfindingScreen;
