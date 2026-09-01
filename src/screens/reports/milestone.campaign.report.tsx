/**
 * AI Customer Milestone Campaign Generator — birthday/anniversary dashboard.
 *
 * 55th POSR-exclusive differentiator — birthday marketing has 3-5x higher
 * open rates and 2-3x higher redemption rates (Experian, DMA).
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
  faCakeCandles, faRotate, faLightbulb, faCheckCircle,
  faCalendarHeart, faTrophy, faHashtag, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runMilestoneEngine, getActiveCampaigns, getSummary, updateCampaignStatus,
  readMilestoneConfig, DEFAULT_MILESTONE_CONFIG,
  type MilestoneCampaign,
} from "@/lib/milestone-campaign.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  birthday:        { bg: 'bg-pink-50',     text: 'text-pink-700',     icon: faCakeCandles,    label: 'BIRTHDAY' },
  anniversary:     { bg: 'bg-violet-50',    text: 'text-violet-700',   icon: faCalendarHeart,  label: 'ANNIVERSARY' },
  tier_milestone:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTrophy,         label: 'TIER MILESTONE' },
  visit_count:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faHashtag,        label: 'VISIT COUNT' },
  spend_milestone: { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faDollarSign,     label: 'SPEND MILESTONE' },
};

const OFFER_STYLE: Record<string, string> = {
  free_appetizer: 'bg-amber-100 text-amber-700',
  free_dessert:   'bg-pink-100 text-pink-700',
  discount_15pct: 'bg-blue-100 text-blue-700',
  discount_25pct: 'bg-violet-100 text-violet-700',
  free_drink:     'bg-emerald-100 text-emerald-700',
  vip_table:      'bg-rose-100 text-rose-700',
  chef_tasting:   'bg-purple-100 text-purple-700',
};

const CHANNEL_STYLE: Record<string, string> = {
  email: 'bg-blue-100 text-blue-700',
  sms:   'bg-emerald-100 text-emerald-700',
  push:  'bg-amber-100 text-amber-700',
  call:  'bg-rose-100 text-rose-700',
};

export function MilestoneCampaignScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [campaigns, setCampaigns] = useState<MilestoneCampaign[]>([]);
  const [summary, setSummary] = useState({ upcomingCount: 0, birthdayCount: 0, totalEstRevenue: 0, totalOfferCost: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MILESTONE_CONFIG);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMilestoneConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveCampaigns(db), getSummary(db)]);
      setCampaigns(list); setSummary(sum);
    } catch (err) { console.error('[milestone-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMilestoneEngine(db, config);
      toast.success(result.campaigns.length > 0
        ? `Generated ${result.campaigns.length} milestone campaigns — ${result.campaigns.filter(c => c.rule_id === 'birthday').length} birthdays, ${result.campaigns.filter(c => c.rule_id === 'anniversary').length} anniversaries`
        : `No upcoming milestones — need customers with order history`);
      await reload();
    } catch (err) { console.error('[milestone-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (campaignId: string, status: 'sent' | 'visited' | 'declined') => {
    try { await updateCampaignStatus(db, campaignId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: by days_until_milestone asc (soonest first)
  const sortedCampaigns = [...campaigns].sort((a, b) => a.days_until_milestone - b.days_until_milestone);

  const formatDate = (date?: Date | string): string => {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Layout>
      <DocumentTitle parts={["Milestone Campaigns", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCakeCandles} className="text-pink-600" />
              AI Milestone Campaigns
            </h1>
            <p className="text-sm text-neutral-500">
              Birthday/anniversary/loyalty campaigns — 3-5x higher open rates (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Detecting…' : 'Find milestones'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCakeCandles} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No upcoming milestones!</p>
            <p className="text-sm mt-1">Click "Find milestones" to detect birthdays, anniversaries, and loyalty milestones.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-pink-50 rounded-lg border border-pink-200 p-3 text-center">
                <div className="text-xs text-pink-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCakeCandles} />Birthdays</div>
                <div className="text-2xl font-bold text-pink-700 tabular-nums">{summary.birthdayCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCalendarHeart} />Total milestones</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.upcomingCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Est. revenue lift</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalEstRevenue)}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Offer cost</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalOfferCost)}</div>
                <div className="text-xs text-emerald-600 mt-0.5">ROI: {summary.totalOfferCost > 0 ? ((summary.totalEstRevenue / summary.totalOfferCost - 1) * 100).toFixed(0) : 0}%</div>
              </div>
            </div>

            {/* Campaigns list */}
            <div className="space-y-3">
              {sortedCampaigns.map((c, idx) => {
                const style = RULE_STYLE[c.rule_id] ?? RULE_STYLE.birthday;
                const isExpanded = expandedId === c.id;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    {/* Header */}
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className="font-medium">{c.customer_name}</span>
                          {c.days_until_milestone === 0 ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">TODAY</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">in {c.days_until_milestone}d ({formatDate(c.milestone_date)})</span>
                          )}
                          <span className="text-xs text-neutral-500">LTV: <strong className="text-violet-600">{withCurrency(c.customer_ltv)}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.suggested_offer && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${OFFER_STYLE[c.suggested_offer] ?? OFFER_STYLE.free_appetizer}`}>
                              {c.suggested_offer.replace(/_/g, ' ')}
                            </span>
                          )}
                          {c.suggested_channel && (
                            <span className={`text-xs px-2 py-0.5 rounded uppercase ${CHANNEL_STYLE[c.suggested_channel] ?? CHANNEL_STYLE.email}`}>
                              {c.suggested_channel}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{c.description}</p>
                    </div>

                    {/* Metrics + message */}
                    <div className="p-3">
                      <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">Offer cost</div>
                          <div className="font-bold text-rose-600 tabular-nums">{withCurrency(c.est_offer_cost)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Est. revenue</div>
                          <div className="font-bold text-emerald-600 tabular-nums">{withCurrency(c.est_revenue_lift)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">ROI</div>
                          <div className="font-bold text-violet-600 tabular-nums">
                            {c.est_offer_cost > 0 ? `${((c.est_revenue_lift / c.est_offer_cost - 1) * 100).toFixed(0)}%` : '∞'}
                          </div>
                        </div>
                      </div>

                      {/* AI message */}
                      {c.message_template && (
                        <div>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : c.id ?? null)}
                            className="text-xs text-violet-600 hover:underline mb-1 flex items-center gap-1"
                          >
                            <FontAwesomeIcon icon={faLightbulb} />
                            {isExpanded ? 'Hide' : 'Show'} AI message template
                          </button>
                          {isExpanded && (
                            <div className="text-sm text-neutral-700 bg-violet-50/50 p-3 rounded border border-violet-100 italic whitespace-pre-wrap">
                              "{c.message_template}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI insight */}
                      {c.ai_insight && (
                        <div className="mt-2 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{c.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <button onClick={() => c.id && handleStatus(c.id, 'sent')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Send
                        </button>
                        <button onClick={() => c.id && handleStatus(c.id, 'visited')} className="text-xs px-3 py-1.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 font-medium">
                          Visited
                        </button>
                        <button onClick={() => c.id && handleStatus(c.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookahead: <strong>{config.lookaheadDays}d</strong></span>
              <span>Send offset: <strong>{config.sendOffsetDays}d before</strong></span>
              <span>VIP threshold: <strong>{withCurrency(config.minLtvForVip)}</strong> LTV</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default MilestoneCampaignScreen;
