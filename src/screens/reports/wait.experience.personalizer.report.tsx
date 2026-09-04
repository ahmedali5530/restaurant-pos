/**
 * AI Customer Wait Experience Personalizer — personalizes the wait experience
 * based on customer profile, predicted wait time, and context.
 *
 * 116th POSR-exclusive differentiator — restaurants lose $200-800/mo per
 * location from poor wait experience management. No POS personalizes the
 * wait experience based on customer profile.
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
  faClock, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faBriefcase, faChildren, faChampagneGlasses,
  faUser, faHeart, faGift, faShieldHeart, faFaceSmile,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runWaitExpEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readWaitExpConfig, DEFAULT_WAITEXP_CONFIG,
  type WaitExpAlert,
} from "@/lib/wait-experience-personalizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  business_lunch_priority:   { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faBriefcase,          label: 'BUSINESS LUNCH' },
  family_with_kids:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChildren,           label: 'FAMILY' },
  special_occasion_vip:      { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faChampagneGlasses,   label: 'SPECIAL OCCASION' },
  solo_diner_engagement:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faUser,               label: 'SOLO DINER' },
  regular_recognition:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faHeart,              label: 'REGULAR' },
  long_wait_compensation:    { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGift,               label: 'LONG WAIT' },
  complaint_risk_prevention: { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faShieldHeart,        label: 'COMPLAINT RISK' },
  wait_satisfaction_tracking:{ bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faFaceSmile,          label: 'SATISFACTION' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const PROFILE_COLOR: Record<string, string> = {
  business_lunch: 'text-sky-600',
  family: 'text-amber-600',
  special_occasion: 'text-violet-600',
  solo: 'text-emerald-600',
  regular: 'text-emerald-600',
  tourist: 'text-neutral-600',
  elderly: 'text-neutral-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function WaitExperiencePersonalizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<WaitExpAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgSatisfaction: 0, highRiskCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_WAITEXP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWaitExpConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[waitexp-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runWaitExpEngine(db, config);
      toast.success(`Personalized ${result.generated} wait experiences — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[waitexp-report] analyze failed', err);
      toast.error('Personalization failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[waitexp-report] status failed', err);
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
      <DocumentTitle parts={["AI Wait Experience", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClock} className="text-sky-600" />
              AI Customer Wait Experience Personalizer
            </h1>
            <p className="text-sm text-neutral-500">
              Personalizes wait experience by customer profile — reduces perceived wait + prevents complaints
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Personalizing…' : 'Personalize waits'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faShieldHeart} label="High-risk customers" value={String(summary.highRiskCount)} color="text-rose-600" />
          <SummaryCard icon={faFaceSmile} label="Avg satisfaction" value={`${summary.avgSatisfaction.toFixed(0)}/100`} color="text-emerald-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faClock} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-sky-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faClock} spin className="text-4xl mb-3" />
            <p>Personalizing wait experiences…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No wait experience alerts</p>
            <p className="text-sm mt-1">All customers getting appropriate wait experience.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faClock, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.customer_name}</span>
                          {alert.customer_profile && (
                            <span className={`text-xs font-medium uppercase ${PROFILE_COLOR[alert.customer_profile] ?? 'text-neutral-500'}`}>
                              {alert.customer_profile.replace('_', ' ')}
                            </span>
                          )}
                          {alert.party_size != null && <span className="text-xs text-neutral-500">party of {alert.party_size}</span>}
                          {alert.predicted_wait_minutes != null && (
                            <span className={`text-xs font-bold ${alert.predicted_wait_minutes >= 25 ? 'text-rose-600' : 'text-amber-600'}`}>
                              {alert.predicted_wait_minutes} min wait
                            </span>
                          )}
                          {alert.complaint_risk_score != null && (
                            <span className={`text-xs font-medium ${alert.complaint_risk_score >= 60 ? 'text-rose-600' : 'text-neutral-500'}`}>
                              risk {alert.complaint_risk_score}/100
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.recommended_tactic && (
                            <span className="text-sky-600 font-medium">→ {alert.recommended_tactic.replace('_', ' ')}</span>
                          )}
                          {alert.tactic_cost != null && alert.tactic_cost > 0 && (
                            <span className="text-amber-600">cost: {fmt$(alert.tactic_cost)}</span>
                          )}
                          {alert.actual_wait_minutes != null && <span>actual: {alert.actual_wait_minutes} min</span>}
                          {alert.satisfaction_score != null && (
                            <span className={alert.satisfaction_score < 85 ? 'text-rose-600 font-medium' : 'text-emerald-600'}>
                              satisfaction: {alert.satisfaction_score}/100
                            </span>
                          )}
                          {alert.context_factors && <span className="text-neutral-400">{alert.context_factors}</span>}
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
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Executed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Engaging
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
          <span>Long wait: {config.longWait} min</span>
          <span>Complaint threshold: {config.complaintThreshold}/100</span>
          <span>Max tactic cost: ${config.maxTacticCost}</span>
          <span>Target satisfaction: {config.targetSatisfaction}/100</span>
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

export default WaitExperiencePersonalizerScreen;
