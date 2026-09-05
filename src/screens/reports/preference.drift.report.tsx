/**
 * AI Customer Preference Drift Tracker — tracks how customer preferences
 * evolve over time and updates profiles dynamically.
 *
 * 127th POSR-exclusive differentiator — restaurants lose $300-1,000/mo per
 * location from stale customer preference profiles.
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
  faShuffle, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faUtensils, faLayerGroup, faTags,
  faSeedling, faBolt, faLock, faClock, faExpand,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPrefDriftEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readPrefDriftConfig, DEFAULT_PREFDRIFT_CONFIG,
  type PrefDriftAlert,
} from "@/lib/preference-drift.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  favorite_item_shift:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUtensils,          label: 'ITEM SHIFT' },
  category_migration:          { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faLayerGroup,        label: 'CATEGORY MIGRATION' },
  price_tier_evolution:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTags,              label: 'PRICE TIER' },
  dietary_evolution:           { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faSeedling,          label: 'DIETARY CHANGE' },
  fast_drifter:                { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBolt,              label: 'FAST DRIFTER' },
  stable_customer:             { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faLock,              label: 'STABLE' },
  profile_staleness:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,             label: 'STALE PROFILE' },
  preference_diversification:  { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faExpand,            label: 'DIVERSIFYING' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const VELOCITY_COLOR: Record<string, string> = {
  fast: 'text-rose-600',
  moderate: 'text-amber-600',
  slow: 'text-sky-600',
  stable: 'text-emerald-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function PreferenceDriftScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<PrefDriftAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, driftingCustomers: 0, avgAccuracy: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PREFDRIFT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPrefDriftConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[prefdrift-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPrefDriftEngine(db, config);
      toast.success(`Tracked ${result.generated} preference drifts — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[prefdrift-report] analyze failed', err);
      toast.error('Tracking failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[prefdrift-report] status failed', err);
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
      <DocumentTitle parts={["AI Preference Drift", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faShuffle} className="text-violet-600" />
              AI Customer Preference Drift Tracker
            </h1>
            <p className="text-sm text-neutral-500">
              Tracks preference evolution over time — keeps profiles accurate for personalization
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Tracking…' : 'Track drift'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faShuffle} label="Drifting customers" value={String(summary.driftingCustomers)} color="text-amber-600" />
          <SummaryCard icon={faCheckCircle} label="Avg accuracy" value={`${summary.avgAccuracy.toFixed(0)}%`} color={summary.avgAccuracy >= 70 ? 'text-emerald-600' : 'text-rose-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faShuffle} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-violet-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faShuffle} spin className="text-4xl mb-3" />
            <p>Tracking preference drift…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No preference drift detected</p>
            <p className="text-sm mt-1">All customer profiles are current and accurate.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faShuffle, label: alert.rule_id.toUpperCase() };
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
                          {alert.drift_type && (
                            <span className="text-xs font-medium uppercase text-violet-600">{alert.drift_type}</span>
                          )}
                          {alert.old_preference && alert.new_preference && (
                            <span className="text-xs">
                              <span className="text-neutral-400">{alert.old_preference}</span>
                              <span className="mx-1 text-neutral-400">→</span>
                              <span className="font-medium text-violet-600">{alert.new_preference}</span>
                            </span>
                          )}
                          {alert.drift_pct != null && alert.drift_pct > 0 && (
                            <span className="text-xs font-bold text-amber-600">{alert.drift_pct}% drift</span>
                          )}
                          {alert.drift_velocity && (
                            <span className={`text-xs font-medium ${VELOCITY_COLOR[alert.drift_velocity] ?? 'text-neutral-500'}`}>
                              {alert.drift_velocity}
                            </span>
                          )}
                          {alert.recommendation_accuracy_pct != null && (
                            <span className={`text-xs font-medium ${alert.recommendation_accuracy_pct < 50 ? 'text-rose-600' : alert.recommendation_accuracy_pct < 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {alert.recommendation_accuracy_pct}% accuracy
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.staleness_days != null && <span className={alert.staleness_days >= 90 ? 'text-amber-600' : ''}>{alert.staleness_days} days stale</span>}
                          {alert.profile_age_months != null && <span className="text-neutral-400">{alert.profile_age_months}mo old</span>}
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Updated
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Updating
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
          <span>Shift threshold: {config.shiftThreshold}%</span>
          <span>Staleness threshold: {config.stalenessDays} days</span>
          <span>Fast drifter threshold: {config.fastDrifterOrders} changes/6mo</span>
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

export default PreferenceDriftScreen;
