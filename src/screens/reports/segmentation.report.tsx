/**
 * Customer Segmentation Dashboard — per-segment marketing strategies + AI recs.
 *
 * Research finding: Toast Customer Segmentation $40+/mo (higher tier), Square
 * Customer Segments in Plus. POSR offers it free.
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
  faUsers, faDollarSign, faRobot, faRotate, faLightbulb,
  faCrown, faHeart, faSeedling, faUserPlus, faClock,
  faTriangleExclamation, faSkull,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  computeSegmentStrategies,
  getSegmentStrategies,
  readSegConfig,
  DEFAULT_SEG_CONFIG,
  type SegmentStrategy,
  type CustomerSegment,
} from "@/lib/segmentation.service.ts";

const SEGMENT_META: Record<CustomerSegment, { icon: any; color: string; bg: string; label: string }> = {
  champion:    { icon: faCrown,    color: 'text-amber-600',    bg: 'bg-amber-100',    label: 'Champions' },
  loyal:       { icon: faHeart,    color: 'text-rose-600',     bg: 'bg-rose-100',     label: 'Loyal' },
  potential:   { icon: faSeedling, color: 'text-emerald-600', bg: 'bg-emerald-100',  label: 'Potential' },
  new:         { icon: faUserPlus, color: 'text-blue-600',    bg: 'bg-blue-100',     label: 'New' },
  at_risk:     { icon: faClock,    color: 'text-orange-600',  bg: 'bg-orange-100',   label: 'At Risk' },
  cant_lose:   { icon: faTriangleExclamation, color: 'text-rose-700', bg: 'bg-rose-200', label: "Can't Lose" },
  hibernating: { icon: faSkull,   color: 'text-neutral-500',  bg: 'bg-neutral-100',  label: 'Hibernating' },
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email', sms: 'SMS', push: 'Push notification', social: 'Social media',
  in_person: 'In person', none: 'None',
};

const OFFER_LABEL: Record<string, string> = {
  vip_perk: 'VIP perk', discount: 'Discount', free_item: 'Free item',
  early_access: 'Early access', winback: 'Win-back offer', welcome: 'Welcome offer', none: 'None',
};

export function SegmentationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [strategies, setStrategies] = useState<SegmentStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SEG_CONFIG);
  const [totalCLV, setTotalCLV] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSegConfig(settingsRows[0] ?? {}));
      const list = await getSegmentStrategies(db);
      setStrategies(list);
      setTotalCLV(list.reduce((s, x) => s + x.total_clv, 0));
    } catch (err) {
      console.error('[segmentation-report] reload failed', err);
      toast.error('Failed to load segmentation data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleCompute = useCallback(async () => {
    setComputing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await computeSegmentStrategies(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setStrategies(result.strategies);
      setTotalCLV(result.totalCLV);
      toast.success(
        result.strategies.length > 0
          ? `Generated strategies for ${result.strategies.length} segments — total CLV ${withCurrency(result.totalCLV)}`
          : 'No CLV data found. Run CLV analysis first.'
      );
    } catch (err) {
      console.error('[segmentation-report] compute failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setComputing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const stats = useMemo(() => {
    const totalCustomers = strategies.reduce((s, x) => s + x.customer_count, 0);
    const totalImpact = strategies.reduce((s, x) => s + (x.projected_revenue_impact ?? 0), 0);
    const atRiskCount = strategies.filter(s => s.segment === 'at_risk' || s.segment === 'cant_lose').reduce((s, x) => s + x.customer_count, 0);
    return { totalCustomers, totalImpact, atRiskCount };
  }, [strategies]);

  return (
    <Layout>
      <DocumentTitle parts={["Customer Segmentation", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUsers} className="text-violet-600" />
              Customer Segmentation
            </h1>
            <p className="text-sm text-neutral-500">
              Per-segment marketing strategies — channel + offer + frequency + AI campaign ideas
            </p>
          </div>
          <Button onClick={handleCompute} disabled={computing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={computing} />
            {computing ? `Analyzing… (${progress.current}/${progress.total})` : 'Generate strategies'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading segmentation data…</p>
          </div>
        ) : strategies.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUsers} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No segmentation data yet</p>
            <p className="text-sm mt-1">Click "Generate strategies" to analyze customer segments.</p>
            <p className="text-xs mt-2">Requires CLV data to be computed first (run CLV analysis at /reports/customer-clv).</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faUsers} label="Total customers" value={stats.totalCustomers} color="text-blue-600" />
              <SummaryCard icon={faDollarSign} label="Total CLV" value={withCurrency(totalCLV)} color="text-emerald-600" />
              <SummaryCard icon={faTriangleExclamation} label="At-risk customers" value={stats.atRiskCount} color="text-rose-600" />
              <SummaryCard icon={faLightbulb} label="Projected impact" value={withCurrency(stats.totalImpact) + '/mo'} color="text-violet-600" />
            </div>

            {/* Segment cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {strategies.map((s, idx) => {
                const meta = SEGMENT_META[s.segment as CustomerSegment] ?? SEGMENT_META.hibernating;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${meta.bg} border-neutral-200`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={meta.icon} className={`text-2xl ${meta.color}`} />
                        <div>
                          <div className={`font-bold ${meta.color}`}>{meta.label}</div>
                          <div className="text-xs text-neutral-600">{s.customer_count} customers · {s.revenue_share_pct}% of CLV</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Total CLV</div>
                        <div className="font-bold tabular-nums text-emerald-600">{withCurrency(s.total_clv)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div className="bg-white/60 rounded p-2 text-center">
                        <div className="text-neutral-500">Avg CLV</div>
                        <div className="font-semibold tabular-nums">{withCurrency(s.avg_clv)}</div>
                      </div>
                      <div className="bg-white/60 rounded p-2 text-center">
                        <div className="text-neutral-500">Churn risk</div>
                        <div className={`font-semibold ${s.avg_churn_risk >= 0.5 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {(s.avg_churn_risk * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="bg-white/60 rounded p-2 text-center">
                        <div className="text-neutral-500">Loyalty</div>
                        <div className="font-semibold">{s.loyalty_member_pct.toFixed(0)}%</div>
                      </div>
                    </div>

                    <div className="flex gap-2 text-xs mb-3">
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                        {CHANNEL_LABEL[s.recommended_channel ?? 'none']}
                      </span>
                      <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                        {OFFER_LABEL[s.recommended_offer ?? 'none']}
                      </span>
                      <span className="px-2 py-1 rounded-full bg-neutral-100 text-neutral-600 capitalize">
                        {s.recommended_frequency}
                      </span>
                    </div>

                    {s.ai_campaign_idea && (
                      <div className="bg-white/80 rounded p-2 mb-2">
                        <div className="text-xs font-semibold text-violet-700 mb-1">💡 Campaign idea</div>
                        <p className="text-xs text-violet-900">{s.ai_campaign_idea}</p>
                      </div>
                    )}

                    {s.ai_strategy && (
                      <p className="text-xs text-neutral-700 italic">{s.ai_strategy}</p>
                    )}

                    {s.projected_revenue_impact !== undefined && s.projected_revenue_impact > 0 && (
                      <div className="mt-2 text-xs text-emerald-600 font-semibold">
                        Projected impact: +{withCurrency(s.projected_revenue_impact)}/mo
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Segments: <strong>{strategies.length}</strong></span>
              <span>Total projected impact: <strong className="text-emerald-600">{withCurrency(stats.totalImpact)}/mo</strong></span>
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

export default SegmentationScreen;
