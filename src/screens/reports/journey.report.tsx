/**
 * Customer Journey Analytics Dashboard — lifecycle tracking + funnel + AI recs.
 *
 * Research finding: Toast Customer Journey $35+/mo (higher tier), Square
 * doesn't have an equivalent. POSR offers it free.
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
  faRoute, faUsers, faArrowTrendUp, faRobot, faRotate,
  faLightbulb, faStar, faHeart, faUserPlus, faRepeat,
  faCrown, faTriangleExclamation, faUserXmark,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeCustomerJourneys,
  getCustomerJourneys,
  readJourneyConfig,
  DEFAULT_JOURNEY_CONFIG,
  type CustomerJourney,
  type JourneyStage,
} from "@/lib/journey.service.ts";

const STAGE_META: Record<JourneyStage, { icon: any; color: string; bg: string; label: string }> = {
  awareness:      { icon: faUserPlus,           color: 'text-blue-600',    bg: 'bg-blue-100',    label: 'Awareness' },
  first_purchase: { icon: faStar,               color: 'text-violet-600',  bg: 'bg-violet-100',  label: 'First Purchase' },
  repeat:         { icon: faRepeat,             color: 'text-amber-600',   bg: 'bg-amber-100',   label: 'Repeat' },
  loyal:          { icon: faHeart,              color: 'text-rose-600',    bg: 'bg-rose-100',    label: 'Loyal' },
  advocate:       { icon: faCrown,              color: 'text-amber-600',   bg: 'bg-amber-100',   label: 'Advocate' },
  at_risk:        { icon: faTriangleExclamation, color: 'text-orange-600', bg: 'bg-orange-100', label: 'At Risk' },
  churned:        { icon: faUserXmark,           color: 'text-neutral-500', bg: 'bg-neutral-100', label: 'Churned' },
};

const ACTION_LABEL: Record<string, string> = {
  welcome_offer: 'Welcome offer', loyalty_invite: 'Invite to loyalty',
  review_request: 'Request review', winback: 'Win-back campaign',
  vip_treatment: 'VIP treatment', monitor: 'Monitor',
};

export function JourneyScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [journeys, setJourneys] = useState<CustomerJourney[]>([]);
  const [funnel, setFunnel] = useState<Record<JourneyStage, number> | null>(null);
  const [conversionRates, setConversionRates] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_JOURNEY_CONFIG);
  const [filterStage, setFilterStage] = useState<JourneyStage | 'all'>('all');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readJourneyConfig(settingsRows[0] ?? {}));
      const list = await getCustomerJourneys(db);
      setJourneys(list);
    } catch (err) {
      console.error('[journey-report] reload failed', err);
      toast.error('Failed to load journey data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeCustomerJourneys(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setJourneys(result.journeys);
      setFunnel(result.funnel);
      setConversionRates(result.conversionRates);
      toast.success(
        `Analyzed ${result.journeys.length} customer journeys — ${result.funnel.advocate} advocates, ${result.funnel.churned} churned. Overall completion: ${result.conversionRates.overall_completion.toFixed(1)}%`
      );
    } catch (err) {
      console.error('[journey-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const filteredJourneys = useMemo(() => {
    if (filterStage === 'all') return journeys;
    return journeys.filter(j => j.current_stage === filterStage);
  }, [journeys, filterStage]);

  return (
    <Layout>
      <DocumentTitle parts={["Customer Journey", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faRoute} className="text-violet-600" />
              Customer Journey
            </h1>
            <p className="text-sm text-neutral-500">
              End-to-end lifecycle tracking — 7-stage funnel + touchpoints + AI next-best-action recommendations
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze journeys'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading journey data…</p>
          </div>
        ) : journeys.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRoute} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No journey data yet</p>
            <p className="text-sm mt-1">Click "Analyze journeys" to map customer lifecycles.</p>
          </div>
        ) : (
          <>
            {/* Funnel visualization */}
            {funnel && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Journey funnel</h3>
                <div className="space-y-2">
                  {(Object.keys(STAGE_META) as JourneyStage[]).map(stage => {
                    const count = funnel[stage] ?? 0;
                    const total = journeys.length || 1;
                    const widthPct = (count / total) * 100;
                    const meta = STAGE_META[stage];
                    return (
                      <button key={stage} onClick={() => setFilterStage(filterStage === stage ? 'all' : stage)}
                        className="w-full flex items-center gap-3 group">
                        <div className="w-32 text-right text-sm flex items-center justify-end gap-2">
                          <FontAwesomeIcon icon={meta.icon} className={meta.color} />
                          <span className="text-neutral-600">{meta.label}</span>
                        </div>
                        <div className="flex-1 bg-neutral-100 rounded-full h-8 relative overflow-hidden">
                          <div className={`h-full ${meta.bg} rounded-full transition-all flex items-center pl-3 ${filterStage === stage ? 'ring-2 ring-offset-1' : ''}`}
                            style={{ width: `${Math.max(3, widthPct)}%` }}>
                            <span className="text-sm font-semibold tabular-nums">{count}</span>
                          </div>
                        </div>
                        <div className="w-12 text-right text-xs text-neutral-500 tabular-nums">{widthPct.toFixed(0)}%</div>
                      </button>
                    );
                  })}
                </div>
                {conversionRates && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div className="bg-neutral-50 rounded p-2 text-center">
                      <div className="text-neutral-500">Awareness→1st</div>
                      <div className="font-bold text-blue-600">{conversionRates.awareness_to_first?.toFixed(0) ?? 0}%</div>
                    </div>
                    <div className="bg-neutral-50 rounded p-2 text-center">
                      <div className="text-neutral-500">1st→Repeat</div>
                      <div className="font-bold text-violet-600">{conversionRates.first_to_repeat?.toFixed(0) ?? 0}%</div>
                    </div>
                    <div className="bg-neutral-50 rounded p-2 text-center">
                      <div className="text-neutral-500">Repeat→Loyal</div>
                      <div className="font-bold text-rose-600">{conversionRates.repeat_to_loyal?.toFixed(0) ?? 0}%</div>
                    </div>
                    <div className="bg-neutral-50 rounded p-2 text-center">
                      <div className="text-neutral-500">Loyal→Advocate</div>
                      <div className="font-bold text-amber-600">{conversionRates.loyal_to_advocate?.toFixed(0) ?? 0}%</div>
                    </div>
                    <div className="bg-neutral-50 rounded p-2 text-center">
                      <div className="text-neutral-500">Completion</div>
                      <div className="font-bold text-emerald-600">{conversionRates.overall_completion?.toFixed(1) ?? 0}%</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filter chips */}
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={() => setFilterStage('all')}
                className={`px-3 py-1 rounded text-xs ${filterStage === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
                All ({journeys.length})
              </button>
              {(Object.keys(STAGE_META) as JourneyStage[]).map(stage => {
                const count = journeys.filter(j => j.current_stage === stage).length;
                if (count === 0) return null;
                return (
                  <button key={stage} onClick={() => setFilterStage(filterStage === stage ? 'all' : stage)}
                    className={`px-3 py-1 rounded text-xs capitalize ${filterStage === stage ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>
                    {STAGE_META[stage].label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Journey table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Customer</th>
                      <th className="text-center p-3">Stage</th>
                      <th className="text-right p-3">Orders</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">Avg days/visit</th>
                      <th className="text-right p-3">Days since last</th>
                      <th className="text-right p-3">Journey days</th>
                      <th className="text-center p-3">Loyalty</th>
                      <th className="text-center p-3">Reviewed</th>
                      <th className="text-center p-3">Next best action</th>
                      <th className="text-left p-3">AI insight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJourneys.slice(0, 100).map((j, idx) => {
                      const meta = STAGE_META[j.current_stage as JourneyStage] ?? STAGE_META.awareness;
                      return (
                        <tr key={idx} className="border-t hover:bg-neutral-50">
                          <td className="p-3 font-medium">{j.customer_name}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${meta.bg} ${meta.color}`}>
                              <FontAwesomeIcon icon={meta.icon} className="text-xs" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{j.total_orders}</td>
                          <td className="p-3 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(j.total_revenue)}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{j.avg_days_between_visits ?? '—'}</td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={j.days_since_last_order > 60 ? 'text-rose-600' : 'text-neutral-500'}>
                              {j.days_since_last_order}d
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{j.journey_duration_days}d</td>
                          <td className="p-3 text-center">
                            {j.is_loyalty_member ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 capitalize">{j.loyalty_tier ?? 'member'}</span>
                            ) : <span className="text-xs text-neutral-400">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            {j.has_reviewed ? (
                              <span className="text-amber-500">★ {j.avg_rating ?? 5}</span>
                            ) : <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            {j.ai_next_best_action && (
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                j.ai_next_best_action === 'vip_treatment' ? 'bg-emerald-100 text-emerald-700' :
                                j.ai_next_best_action === 'winback' ? 'bg-rose-100 text-rose-700' :
                                j.ai_next_best_action === 'welcome_offer' ? 'bg-blue-100 text-blue-700' :
                                j.ai_next_best_action === 'loyalty_invite' ? 'bg-amber-100 text-amber-700' :
                                j.ai_next_best_action === 'review_request' ? 'bg-violet-100 text-violet-700' :
                                'bg-neutral-100 text-neutral-600'
                              }`}>
                                {ACTION_LABEL[j.ai_next_best_action] ?? j.ai_next_best_action}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-violet-600 italic max-w-xs">
                            {j.ai_insight ? `"${j.ai_insight}"` : <span className="text-neutral-400">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Loyal threshold: <strong>{config.loyalThreshold}+ orders</strong></span>
              <span>Advocate threshold: <strong>{config.advocateOrderThreshold}+ orders + review</strong></span>
              <span>Churn: <strong>{config.churnDays} days</strong></span>
              <span>At-risk decline: <strong>{config.atRiskDeclinePct}%+</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default JourneyScreen;
