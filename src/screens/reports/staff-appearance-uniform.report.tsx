/**
 * AI Staff Appearance & Uniform Optimizer — predicts how staff appearance
 * (uniform cleanliness, grooming, dress code consistency) impacts customer
 * perception of restaurant quality + trust.
 *
 * 155th POSR-exclusive differentiator.
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
  faShirt, faRotate, faLayerGroup, faUserCheck, faSparkles,
  faUserGroup, faHandshake, faGem, faShoePrints, faSnowflake,
  faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runStaffAppEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readStaffAppConfig, DEFAULT_STAFFAPP_CONFIG,
  type StaffAppAlert,
} from "@/lib/staff-appearance-uniform.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  uniform_inconsistency:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faLayerGroup,    label: 'INCONSISTENCY' },
  grooming_standard_breach:        { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUserCheck,     label: 'GROOMING' },
  uniform_cleanliness_issue:       { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faSparkles,      label: 'CLEANLINESS' },
  role_differentiation_weak:       { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faUserGroup,     label: 'ROLE DIFF' },
  uniform_brand_mismatch:          { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faHandshake,     label: 'BRAND MISMATCH' },
  accessory_policy_inconsistent:   { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faGem,           label: 'ACCESSORIES' },
  footwear_safety_violation:       { bg: 'bg-red-50',     text: 'text-red-700',     icon: faShoePrints,    label: 'FOOTWEAR' },
  seasonal_uniform_mismatch:       { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faSnowflake,     label: 'SEASONAL' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function StaffAppearanceUniformScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<StaffAppAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, rolesAtRisk: 0, avgGroomingPct: 0, avgCleanlinessScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_STAFFAPP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readStaffAppConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[staffapp-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runStaffAppEngine(db, config);
      toast.success(`Analyzed ${result.generated} appearance signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[staffapp-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[staffapp-report] status failed', err);
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
      <DocumentTitle parts={["AI Staff Appearance", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faShirt} className="text-violet-500" />
              AI Staff Appearance & Uniform Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how staff appearance impacts quality perception — 68% form impression from staff look (Cornell CHR)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faShirt} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze appearance'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faUserGroup} label="Roles at risk" value={String(summary.rolesAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faUserCheck} label="Avg grooming" value={`${summary.avgGroomingPct.toFixed(0)}%`} color={summary.avgGroomingPct >= 90 ? 'text-emerald-600' : 'text-rose-600'} />
          <SummaryCard icon={faSparkles} label="Avg cleanliness" value={`${summary.avgCleanlinessScore.toFixed(0)}/100`} color={summary.avgCleanlinessScore >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faShirt} spin className="text-4xl mb-3" />
            <p>Analyzing staff appearance & uniform patterns…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No appearance alerts</p>
            <p className="text-sm mt-1">Staff appearance professional, uniforms consistent, grooming compliant.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faShirt, label: alert.rule_id.toUpperCase() };
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
                          {alert.staff_role && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.staff_role}</span>
                          )}
                          {alert.staff_name && (
                            <span className="text-xs text-neutral-500">{alert.staff_name}</span>
                          )}
                          {alert.uniform_style_variants != null && alert.uniform_style_variants > 1 && (
                            <span className="text-xs text-amber-600 font-medium">{alert.uniform_style_variants} uniform variants</span>
                          )}
                          {alert.uniform_cleanliness_score != null && (
                            <span className={`text-xs ${alert.uniform_cleanliness_score < 70 ? 'text-rose-600 font-medium' : alert.uniform_cleanliness_score < 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{alert.uniform_cleanliness_score}/100 cleanliness</span>
                          )}
                          {alert.grooming_compliance_pct != null && (
                            <span className={`text-xs ${alert.grooming_compliance_pct < 90 ? 'text-rose-600 font-medium' : 'text-emerald-600'}`}>{alert.grooming_compliance_pct}% grooming</span>
                          )}
                          {alert.uniform_age_months != null && alert.uniform_age_months > 12 && (
                            <span className="text-xs text-amber-600">{alert.uniform_age_months}mo old</span>
                          )}
                          {alert.role_distinguishable_pct != null && (
                            <span className={`text-xs ${alert.role_distinguishable_pct < 70 ? 'text-violet-600 font-medium' : 'text-neutral-500'}`}>{alert.role_distinguishable_pct}% distinguishable</span>
                          )}
                          {alert.footwear_safety_compliance_pct != null && (
                            <span className={`text-xs ${alert.footwear_safety_compliance_pct < 100 ? 'text-red-600 font-medium' : 'text-emerald-600'}`}>{alert.footwear_safety_compliance_pct}% footwear</span>
                          )}
                          {alert.current_season && !alert.uniform_season_appropriate && (
                            <span className="text-xs text-sky-600">{alert.current_season} mismatch</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_trust_drop_pct != null && alert.predicted_trust_drop_pct > 0 && (
                            <span className="text-rose-600">−{alert.predicted_trust_drop_pct}% trust</span>
                          )}
                          {alert.predicted_satisfaction_drop != null && alert.predicted_satisfaction_drop > 0 && (
                            <span className="text-rose-600">−{alert.predicted_satisfaction_drop}pts sat</span>
                          )}
                          {alert.grooming_issues_count != null && alert.grooming_issues_count > 0 && (
                            <span className="text-rose-600">{alert.grooming_issues_count} grooming issues</span>
                          )}
                          {alert.accessory_violations_count != null && alert.accessory_violations_count > 0 && (
                            <span className="text-yellow-700">{alert.accessory_violations_count} accessory violations</span>
                          )}
                          {alert.brand_tier && (
                            <span className="text-fuchsia-600">brand: {alert.brand_tier}</span>
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
                        <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_monthly_opportunity)}</div>
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
          <span>Min grooming: {config.minGroomingCompliancePct}%</span>
          <span>Min cleanliness: {config.minCleanlinessScore}/100</span>
          <span>Max uniform age: {config.maxUniformAgeMonths}mo</span>
          <span>Min footwear safety: {config.minFootwearSafetyPct}%</span>
          <span className="text-neutral-400">155th POSR-exclusive differentiator</span>
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

export default StaffAppearanceUniformScreen;
