/**
 * Churn Prediction Dashboard — at-risk customers + retention tracking.
 *
 * Research finding: Toast Customer 360 + Square Customer Retention bundle
 * churn prediction in higher tiers (~$50/mo). POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (at-risk count, critical count, revenue at risk, save rate)
 *   2. AI summary panel (overall churn assessment)
 *   3. Churn trend chart (snapshots over time)
 *   4. At-risk customer list — sortable by priority, with AI message + suggested action + "Log action" button
 *   5. Retention actions log (recent attempts + outcomes)
 *   6. Generate button (refresh at-risk list + AI recommendations + snapshot)
 *
 * Placement: new route /reports/churn-prediction
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
  faUserMinus, faTriangleExclamation, faDollarSign, faCheckCircle,
  faRobot, faRotate, faLightbulb, faPhone, faEnvelope, faSms,
  faGift, faUser, faClock,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  getAtRiskCustomers,
  generateRetentionRecommendations,
  generateSnapshot,
  getSnapshotHistory,
  getRetentionActions,
  getRetentionStats,
  readChurnConfig,
  DEFAULT_CHURN_CONFIG,
  type AtRiskCustomer,
  type ChurnSnapshot,
  type RetentionAction,
  type RetentionActionType,
  type ChurnPriority,
} from "@/lib/churn.service.ts";

const PRIORITY_STYLE: Record<ChurnPriority, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-500', label: 'Critical' },
  high:     { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-400', label: 'High' },
  moderate: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-400', label: 'Moderate' },
  low:      { bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-300', label: 'Low' },
};

const ACTION_ICON: Record<RetentionActionType, any> = {
  email: faEnvelope,
  sms: faSms,
  phone_call: faPhone,
  discount: faGift,
  loyalty_bonus: faGift,
  personal_visit: faUser,
  other: faClock,
};

const OUTCOME_STYLE: Record<string, string> = {
  saved: 'bg-emerald-100 text-emerald-700',
  churned: 'bg-rose-100 text-rose-700',
  pending: 'bg-amber-100 text-amber-700',
  no_response: 'bg-neutral-100 text-neutral-500',
};

export function ChurnPredictionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [atRisk, setAtRisk] = useState<AtRiskCustomer[]>([]);
  const [snapshots, setSnapshots] = useState<ChurnSnapshot[]>([]);
  const [actions, setActions] = useState<RetentionAction[]>([]);
  const [retentionStats, setRetentionStats] = useState({ total: 0, saved: 0, churned: 0, pending: 0, noResponse: 0, saveRate: 0, revenueSaved: 0 });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_CHURN_CONFIG);
  const [filterPriority, setFilterPriority] = useState<ChurnPriority | 'all'>('all');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readChurnConfig(settingsRows[0] ?? {}));
      const [riskList, snaps, acts, stats] = await Promise.all([
        getAtRiskCustomers(db, readChurnConfig(settingsRows[0] ?? {})),
        getSnapshotHistory(db, 12),
        getRetentionActions(db, 20),
        getRetentionStats(db),
      ]);
      setAtRisk(riskList);
      setSnapshots(snaps);
      setActions(acts);
      setRetentionStats(stats);
    } catch (err) {
      console.error('[churn-report] reload failed', err);
      toast.error('Failed to load churn data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setProgress({ current: 0, total: 3 });
    try {
      // 1. Get at-risk customers
      const riskList = await getAtRiskCustomers(db, config);
      setAtRisk(riskList);
      setProgress({ current: 1, total: 3 });

      // 2. Generate AI retention recommendations
      if (config.aiEnabled && riskList.length > 0) {
        await generateRetentionRecommendations(riskList);
        setAtRisk([...riskList]);
      }
      setProgress({ current: 2, total: 3 });

      // 3. Generate snapshot
      await generateSnapshot(db, config);
      setProgress({ current: 3, total: 3 });

      toast.success(
        `Found ${riskList.length} at-risk customers — ${riskList.filter(c => c.priority === 'critical').length} critical. AI recommendations generated.`
      );
      await reload();
    } catch (err) {
      console.error('[churn-report] generate failed', err);
      toast.error('Churn analysis failed — see console');
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const stats = useMemo(() => {
    const critical = atRisk.filter(c => c.priority === 'critical').length;
    const high = atRisk.filter(c => c.priority === 'high').length;
    const revenueAtRisk = atRisk.reduce((s, c) => s + c.clv, 0);
    return { critical, high, revenueAtRisk };
  }, [atRisk]);

  const filteredAtRisk = useMemo(() => {
    if (filterPriority === 'all') return atRisk;
    return atRisk.filter(c => c.priority === filterPriority);
  }, [atRisk, filterPriority]);

  return (
    <Layout>
      <DocumentTitle parts={["Churn Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUserMinus} className="text-rose-600" />
              Churn Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              At-risk customers + AI retention recommendations + action tracking + trend
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={generating} />
            {generating ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze churn'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading churn data…</p>
          </div>
        ) : atRisk.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No at-risk customers!</p>
            <p className="text-sm mt-1">All customers are healthy. Click "Analyze churn" to refresh.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faUserMinus} label="At-risk" value={atRisk.length} color="text-amber-600" />
              <SummaryCard icon={faTriangleExclamation} label="Critical" value={stats.critical} color="text-rose-600" />
              <SummaryCard icon={faDollarSign} label="Revenue at risk" value={withCurrency(stats.revenueAtRisk)} color="text-orange-600" />
              <SummaryCard icon={faCheckCircle} label="Save rate" value={`${retentionStats.saveRate.toFixed(0)}%`} color="text-emerald-600" />
            </div>

            {/* AI summary */}
            {snapshots[0]?.ai_summary && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Churn Assessment
                </h3>
                <p className="text-sm text-violet-900">{snapshots[0].ai_summary}</p>
              </div>
            )}

            {/* Churn trend chart */}
            {snapshots.length > 1 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Churn rate trend</h3>
                <div className="relative h-32 flex items-end gap-2">
                  {[...snapshots].reverse().map((snap, idx) => {
                    const heightPct = (snap.churn_rate / 100) * 100;
                    return (
                      <div key={idx} className="flex-1 relative group" style={{ height: '100%' }}
                        title={`${new Date(snap.snapshot_date as any).toLocaleDateString()}: ${snap.churn_rate}% churn, ${snap.at_risk_count} at-risk`}>
                        <div className={`absolute bottom-0 left-0 right-0 rounded-t transition-colors ${
                          snap.churn_rate >= 30 ? 'bg-rose-400' : snap.churn_rate >= 15 ? 'bg-amber-400' : 'bg-emerald-400'
                        }`} style={{ height: `${Math.max(5, heightPct)}%` }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-neutral-400 mt-2">
                  <span>{snapshots.length > 0 ? new Date(snapshots[snapshots.length - 1].snapshot_date as any).toLocaleDateString() : ''}</span>
                  <span>Now</span>
                </div>
              </div>
            )}

            {/* Filter chips */}
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-neutral-500">Priority:</span>
              {(['all', 'critical', 'high', 'moderate'] as const).map(f => (
                <button key={f} onClick={() => setFilterPriority(f)}
                  className={`px-3 py-1 rounded text-xs capitalize transition-colors ${filterPriority === f ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>
                  {f === 'all' ? `All (${atRisk.length})` : `${f} (${atRisk.filter(c => c.priority === f).length})`}
                </button>
              ))}
            </div>

            {/* At-risk customers list */}
            <div className="space-y-2">
              {filteredAtRisk.slice(0, 50).map((customer, idx) => {
                const style = PRIORITY_STYLE[customer.priority];
                return (
                  <div key={idx} className={`rounded-lg border-2 p-3 ${style.bg} ${style.border}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{customer.customer_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {customer.days_since_last_order} days since last visit · {customer.total_orders} orders
                        </span>
                        {customer.loyalty_tier && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 capitalize">
                            {customer.loyalty_tier}
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-neutral-500">Churn risk</div>
                        <div className={`font-bold tabular-nums ${customer.churn_risk >= 0.7 ? 'text-rose-600' : customer.churn_risk >= 0.5 ? 'text-orange-600' : 'text-amber-600'}`}>
                          {(customer.churn_risk * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-neutral-600 mb-2">
                      <span>CLV: <strong className="text-emerald-600">{withCurrency(customer.clv)}</strong></span>
                      <span>Segment: <strong className="capitalize">{customer.segment.replace(/_/g, ' ')}</strong></span>
                      {customer.email && <span>Email: {customer.email}</span>}
                      {customer.phone && <span>Phone: {customer.phone}</span>}
                    </div>
                    {customer.ai_message && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <p className="text-xs text-violet-700 italic">💡 {customer.ai_message}</p>
                        {customer.ai_recommendation && (
                          <p className="text-xs text-neutral-600 mt-1">→ {customer.ai_recommendation}</p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">Suggested action:</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center gap-1">
                        <FontAwesomeIcon icon={ACTION_ICON[customer.suggested_action] ?? faClock} className="text-xs" />
                        {customer.suggested_action.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Retention actions log */}
            {actions.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Recent retention actions</h3>
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Customer</th>
                        <th className="text-center p-2">Action</th>
                        <th className="text-right p-2">CLV</th>
                        <th className="text-right p-2">Risk at action</th>
                        <th className="text-center p-2">Outcome</th>
                        <th className="text-left p-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actions.map((action, idx) => (
                        <tr key={idx} className="border-t hover:bg-neutral-50">
                          <td className="p-2 font-medium">{action.customer_name}</td>
                          <td className="p-2 text-center text-xs capitalize">
                            <FontAwesomeIcon icon={ACTION_ICON[action.action_type] ?? faClock} className="mr-1" />
                            {action.action_type.replace(/_/g, ' ')}
                          </td>
                          <td className="p-2 text-right tabular-nums">{withCurrency(action.clv_at_action)}</td>
                          <td className="p-2 text-right tabular-nums">{(action.churn_risk_at_action * 100).toFixed(0)}%</td>
                          <td className="p-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${OUTCOME_STYLE[action.outcome] ?? OUTCOME_STYLE.pending}`}>
                              {action.outcome.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-2 text-xs text-neutral-500">
                            {new Date(action.initiated_at as any).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {retentionStats.total > 0 && (
                  <div className="mt-3 text-xs text-neutral-500 flex gap-4">
                    <span>Total actions: <strong>{retentionStats.total}</strong></span>
                    <span>Saved: <strong className="text-emerald-600">{retentionStats.saved}</strong></span>
                    <span>Churned: <strong className="text-rose-600">{retentionStats.churned}</strong></span>
                    <span>Revenue saved: <strong className="text-emerald-600">{withCurrency(retentionStats.revenueSaved)}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>At-risk threshold: <strong>{(config.atRiskThreshold * 100).toFixed(0)}%</strong></span>
              <span>Critical threshold: <strong>{(config.criticalThreshold * 100).toFixed(0)}%</strong></span>
              <span>Min CLV for retention: <strong>{withCurrency(config.minClvForRetention)}</strong></span>
              <span>Prediction window: <strong>{config.predictionWindowDays} days</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon, label, value, color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default ChurnPredictionScreen;
