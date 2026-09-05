/**
 * AI Loyalty Tier Migration Predictor — predicts which customers will migrate
 * UP/DOWN a loyalty tier in next 30/60/90 days. Enables proactive upgrade push
 * + downgrade prevention.
 *
 * 142nd POSR-exclusive differentiator.
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
  faCrown, faRotate, faArrowUp, faArrowDown, faClock,
  faStar, faCalendarAlt, faGift, faUsers, faCheckCircle,
  faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runTierMigEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readTierMigConfig, DEFAULT_TIERMIG_CONFIG,
  type TierMigAlert,
} from "@/lib/loyalty-tier-migration.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  upgrade_imminent:            { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowUp,    label: 'UPGRADE SOON' },
  upgrade_within_reach:        { bg: 'bg-amber-50',    text: 'text-amber-700',   icon: faStar,       label: 'UPGRADE REACH' },
  downgrade_imminent:          { bg: 'bg-rose-50',     text: 'text-rose-700',    icon: faArrowDown,  label: 'DOWNGRADE RISK' },
  tier_stagnation:             { bg: 'bg-yellow-50',   text: 'text-yellow-700',  icon: faClock,      label: 'STAGNATION' },
  high_value_tier_upgrade:     { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faCrown,      label: 'PLATINUM APPROACH' },
  seasonal_tier_pattern:       { bg: 'bg-sky-50',      text: 'text-sky-700',     icon: faCalendarAlt,label: 'SEASONAL' },
  tier_benefit_underuse:       { bg: 'bg-orange-50',   text: 'text-orange-700',  icon: faGift,       label: 'BENEFIT UNDERUSE' },
  peer_tier_mismatch:          { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700', icon: faUsers,      label: 'PEER MISMATCH' },
};

const TIER_COLOR: Record<string, string> = {
  bronze: 'text-amber-700',
  silver: 'text-slate-500',
  gold: 'text-amber-500',
  platinum: 'text-violet-600',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function LoyaltyTierMigrationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TierMigAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, upgradeCandidates: 0, downgradeRisks: 0, avgTierProgress: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TIERMIG_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTierMigConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[tiermig-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTierMigEngine(db, config);
      toast.success(`Analyzed ${result.generated} tier migrations — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[tiermig-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[tiermig-report] status failed', err);
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
      <DocumentTitle parts={["AI Loyalty Tier Migration", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCrown} className="text-violet-500" />
              AI Loyalty Tier Migration Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts tier upgrades/downgrades 30/60/90 days ahead — accelerates upgrades, prevents silent downgrades
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faCrown} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze migrations'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faArrowUp} label="Upgrade candidates" value={String(summary.upgradeCandidates)} color="text-emerald-600" />
          <SummaryCard icon={faArrowDown} label="Downgrade risks" value={String(summary.downgradeRisks)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCrown} spin className="text-4xl mb-3" />
            <p>Analyzing tier migration patterns…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No tier migration alerts</p>
            <p className="text-sm mt-1">Customer tiers stable — no imminent migrations detected.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faCrown, label: alert.rule_id.toUpperCase() };
              const isUpgrade = alert.rule_id.includes('upgrade') || alert.rule_id === 'high_value_tier_upgrade' || alert.rule_id === 'peer_tier_mismatch';
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
                          {alert.customer_name && (
                            <span className="text-sm font-semibold text-neutral-800">{alert.customer_name}</span>
                          )}
                          {alert.current_tier && (
                            <span className={`text-xs font-bold uppercase ${TIER_COLOR[alert.current_tier] ?? 'text-neutral-500'}`}>
                              {alert.current_tier}
                            </span>
                          )}
                          {alert.target_tier && (
                            <>
                              <span className="text-neutral-400">→</span>
                              <span className={`text-xs font-bold uppercase ${TIER_COLOR[alert.target_tier] ?? 'text-neutral-500'}`}>
                                {alert.target_tier}
                              </span>
                            </>
                          )}
                          {alert.tier_progress_pct != null && (
                            <span className={`text-xs font-medium ${alert.tier_progress_pct >= 90 ? 'text-emerald-600' : alert.tier_progress_pct >= 70 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {alert.tier_progress_pct.toFixed(0)}% to next tier
                            </span>
                          )}
                          {alert.days_to_migration != null && (
                            <span className={`text-xs font-bold ${alert.days_to_migration <= 30 ? 'text-rose-600' : 'text-amber-600'}`}>
                              ~{alert.days_to_migration}d
                            </span>
                          )}
                          {alert.visits_last_30d != null && (
                            <span className="text-xs text-neutral-500">{alert.visits_last_30d} visits/30d</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.current_spend_30d != null && alert.projected_spend_30d != null && (
                            <span>
                              30d: <span className="text-neutral-700">{fmt$(alert.current_spend_30d)}</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className={isUpgrade ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>{fmt$(alert.projected_spend_30d)}</span>
                            </span>
                          )}
                          {alert.target_tier_threshold != null && (
                            <span>threshold: <span className="text-neutral-700 font-medium">{fmt$(alert.target_tier_threshold)}</span></span>
                          )}
                          {alert.benefits_used_count != null && alert.benefits_available_count != null && (
                            <span>benefits: <span className="text-amber-600 font-medium">{alert.benefits_used_count}/{alert.benefits_available_count}</span></span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className={`mt-2 border rounded px-3 py-2 text-xs flex items-start gap-2 ${isUpgrade ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-bold ${isUpgrade ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isUpgrade ? '+' : '−'}{fmt$(alert.est_monthly_opportunity)}
                        </div>
                        <div className="text-xs text-neutral-400">{isUpgrade ? 'value/mo' : 'loss/mo'}</div>
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
          <span>Upgrade imminent: ≥{config.upgradeImminentThreshold}%</span>
          <span>Upgrade reach: ≥{config.upgradeReachThreshold}%</span>
          <span>Downgrade risk: &lt;{config.downgradeRiskThreshold}% of threshold</span>
          <span>Stagnation: {config.stagnationMonths} months</span>
          <span className="text-neutral-400">142nd POSR-exclusive differentiator</span>
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

export default LoyaltyTierMigrationScreen;
