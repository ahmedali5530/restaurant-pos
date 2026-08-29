/**
 * Dynamic Pricing Dashboard — AI-generated pricing rules + demand patterns.
 *
 * Research finding: Toast Dynamic Pricing $75+/mo, Square Intelligent Pricing
 * in higher tiers. POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (total rules, active count, projected revenue impact, max discount)
 *   2. Demand pattern chart — hourly bar chart (peak vs low visualization)
 *   3. Rules list — grouped by strategy with Activate/Reject actions
 *   4. Strategy explanation cards
 *   5. Generate button
 *
 * Placement: new route /reports/dynamic-pricing
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
  faTags, faClock, faDollarSign, faRobot, faRotate, faCheck, faXmark,
  faChartBar, faLightbulb, faCalendarDay, faBoxOpen, faUtensils,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  generatePricingRules,
  getRules,
  activateRule,
  rejectRule,
  readPricingConfig,
  DEFAULT_PRICING_CONFIG,
  type DynamicPricingRule,
  type PricingStrategy,
  type RuleStatus,
} from "@/lib/dynamic-pricing.service.ts";
import { useSecurity } from "@/hooks/useSecurity.ts";

const STRATEGY_META: Record<PricingStrategy, { icon: any; color: string; label: string; description: string }> = {
  happy_hour:  { icon: faClock, color: 'text-amber-600', label: 'Happy Hour', description: 'Discount low-demand hours to drive traffic' },
  slow_day:    { icon: faCalendarDay, color: 'text-blue-600', label: 'Slow Day', description: 'Promotional pricing on slow weekdays' },
  clearance:   { icon: faBoxOpen, color: 'text-rose-600', label: 'Clearance', description: 'Discount overstocked slow-moving items' },
  peak_surge:  { icon: faChartBar, color: 'text-violet-600', label: 'Peak Surge', description: 'Recommendation: suppress discounts during peak' },
  lunch_menu:  { icon: faUtensils, color: 'text-emerald-600', label: 'Lunch Menu', description: 'Lunch-special pricing for early hours' },
  item_promo:  { icon: faTags, color: 'text-orange-600', label: 'Item Promo', description: 'Feature high-margin low-popularity items' },
};

const STATUS_STYLE: Record<RuleStatus, string> = {
  draft: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-neutral-100 text-neutral-500',
  rejected: 'bg-rose-100 text-rose-700',
};

export function DynamicPricingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const { user } = useSecurity() as any;
  const [rules, setRules] = useState<DynamicPricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_PRICING_CONFIG);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | RuleStatus>('all');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPricingConfig(settingsRows[0] ?? {}));
      const list = await getRules(db);
      setRules(list);
    } catch (err) {
      console.error('[dyn-price-report] reload failed', err);
      toast.error('Failed to load pricing rules');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setProgress({ current: 0, total: 4 });
    try {
      const result = await generatePricingRules(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        `Generated ${result.rules.length} pricing rules across ${new Set(result.rules.map(r => r.strategy)).size} strategies`
      );
      await reload();
    } catch (err) {
      console.error('[dyn-price-report] generate failed', err);
      toast.error('Generation failed — see console');
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleActivate = useCallback(async (ruleId: string) => {
    setActivatingId(ruleId);
    try {
      const result = await activateRule(db, ruleId, user?.id?.toString?.());
      toast.success(`Rule activated — discount created${result.discountId ? '' : ' (without linked record)'}`);
      await reload();
    } catch (err) {
      console.error('[dyn-price-report] activate failed', err);
      const message = err instanceof Error ? err.message : 'Activation failed';
      toast.error(message);
    } finally {
      setActivatingId(null);
    }
  }, [db, user, reload]);

  const handleReject = useCallback(async (ruleId: string) => {
    try {
      await rejectRule(db, ruleId);
      toast.success('Rule rejected');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject');
    }
  }, [db, reload]);

  const stats = useMemo(() => {
    const active = rules.filter(r => r.status === 'active');
    const draft = rules.filter(r => r.status === 'draft');
    const activeImpact = active.reduce((s, r) => s + (r.expected_impact ?? 0), 0);
    const draftImpact = draft.reduce((s, r) => s + (r.expected_impact ?? 0), 0);
    return { activeCount: active.length, draftCount: draft.length, activeImpact, draftImpact };
  }, [rules]);

  const filteredRules = useMemo(() => {
    if (filter === 'all') return rules;
    return rules.filter(r => r.status === filter);
  }, [rules, filter]);

  return (
    <Layout>
      <DocumentTitle parts={["Dynamic Pricing", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTags} className="text-orange-600" />
              Dynamic Pricing
            </h1>
            <p className="text-sm text-neutral-500">
              AI-generated pricing rules — demand-based discounts + peak-hour recommendations, integrated with the discount engine
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={generating} />
            {generating ? `Generating… (${progress.current}/${progress.total})` : 'Generate rules'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading pricing rules…</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTags} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No pricing rules yet</p>
            <p className="text-sm mt-1">Click "Generate rules" to analyze demand patterns and create pricing suggestions.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faTags} label="Total rules" value={rules.length} color="text-orange-600" />
              <SummaryCard icon={faCheck} label="Active" value={stats.activeCount} color="text-emerald-600" />
              <SummaryCard icon={faDollarSign} label="Active impact" value={withCurrency(stats.activeImpact) + '/mo'} color="text-blue-600" />
              <SummaryCard icon={faLightbulb} label="Draft impact" value={withCurrency(stats.draftImpact) + '/mo'} color="text-violet-600" />
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-neutral-500">Status:</span>
              {(['all', 'draft', 'active', 'rejected', 'expired'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
                    filter === f ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {f} ({f === 'all' ? rules.length : rules.filter(r => r.status === f).length})
                </button>
              ))}
            </div>

            {/* Rules list */}
            <div className="space-y-3">
              {filteredRules.map((rule, idx) => {
                const meta = STRATEGY_META[rule.strategy];
                return (
                  <div
                    key={rule.id ?? idx}
                    className={`bg-white rounded-lg border p-4 ${
                      rule.status === 'active' ? 'border-emerald-300' :
                      rule.status === 'rejected' ? 'border-neutral-200 opacity-60' :
                      'border-neutral-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={meta.icon} className={meta.color} />
                        <span className="font-semibold">{rule.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[rule.status]}`}>
                          {rule.status}
                        </span>
                        {rule.value > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
                            -{rule.value}%
                          </span>
                        )}
                        {rule.days_of_week && (
                          <span className="text-xs text-neutral-500">
                            {rule.days_of_week.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}
                          </span>
                        )}
                        {rule.start_hour !== undefined && (
                          <span className="text-xs text-neutral-500">
                            {String(rule.start_hour).padStart(2, '0')}:00–{String(rule.end_hour ?? 23).padStart(2, '0')}:00
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {rule.expected_impact !== undefined && rule.expected_impact !== 0 && (
                          <div className={`text-sm font-semibold tabular-nums ${rule.expected_impact > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {rule.expected_impact > 0 ? '+' : ''}{withCurrency(rule.expected_impact)}/mo
                          </div>
                        )}
                        <div className="text-xs text-neutral-400">{Math.round(rule.confidence * 100)}% confidence</div>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 mb-1">{rule.description}</p>
                    {rule.ai_rationale && (
                      <p className="text-xs text-violet-600 italic mb-2">💡 {rule.ai_rationale}</p>
                    )}
                    {rule.status === 'draft' && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => rule.id && handleActivate(rule.id)}
                          disabled={activatingId === rule.id}
                          variant="primary"
                          className="px-3 py-1.5 text-xs gap-1"
                        >
                          <FontAwesomeIcon icon={faCheck} spin={activatingId === rule.id} />
                          {activatingId === rule.id ? 'Activating…' : 'Activate'}
                        </Button>
                        <Button
                          onClick={() => rule.id && handleReject(rule.id)}
                          variant="custom"
                          className="px-3 py-1.5 text-xs gap-1 border border-neutral-300"
                        >
                          <FontAwesomeIcon icon={faXmark} /> Reject
                        </Button>
                      </div>
                    )}
                    {rule.status === 'active' && rule.linked_discount && (
                      <p className="text-xs text-emerald-600">
                        ✓ Active discount: {rule.linked_discount}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Strategy legend */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3">Strategies</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(STRATEGY_META).map(([strategy, meta]) => (
                  <div key={strategy} className="flex items-start gap-2 text-xs">
                    <FontAwesomeIcon icon={meta.icon} className={`${meta.color} mt-0.5`} />
                    <div>
                      <div className="font-semibold">{meta.label}</div>
                      <div className="text-neutral-500">{meta.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Max discount: <strong>{config.maxDiscountPct}%</strong></span>
              <span>Margin floor: <strong>cost × {config.marginFloorMultiplier}</strong></span>
              <span>Max active/strategy: <strong>{config.maxActiveRules}</strong></span>
              <span>Rule duration: <strong>{config.ruleDurationDays} days</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon,
  label,
  value,
  color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default DynamicPricingScreen;
