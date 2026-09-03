/**
 * Peak Demand Pricing Dashboard — demand-responsive pricing adjustments.
 *
 * 39th POSR-exclusive differentiator — restaurants leave 15-20% revenue on
 * the table by not adjusting prices during peak demand.
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
  faTags, faRotate, faLightbulb, faCheckCircle,
  faArrowUp, faArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPeakPricingEngine, getActiveRules, getSummary, updateRuleStatus,
  readPeakPricingConfig, DEFAULT_PEAK_PRICING_CONFIG,
  type PeakPricingRule,
} from "@/lib/peak-pricing.service.ts";

const TIER_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  surge:    { bg: 'bg-rose-50',    text: 'text-rose-700',   icon: faArrowUp,   label: 'Surge (+%)' },
  discount: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowDown, label: 'Discount (−%)' },
  normal:   { bg: 'bg-neutral-50',  text: 'text-neutral-600', icon: faTags,      label: 'Normal' },
};

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PeakPricingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [rules, setRules] = useState<PeakPricingRule[]>([]);
  const [summary, setSummary] = useState({ surgeCount: 0, discountCount: 0, totalLift: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PEAK_PRICING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPeakPricingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRules(db), getSummary(db)]);
      setRules(list); setSummary(sum);
    } catch (err) { console.error('[peak-pricing-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPeakPricingEngine(db, config);
      toast.success(result.rules.length > 0
        ? `Generated ${result.rules.length} pricing rules — ${result.rules.filter(r => r.pricing_tier === 'surge').length} surge, ${result.rules.filter(r => r.pricing_tier === 'discount').length} discount`
        : `No pricing adjustments needed`);
      await reload();
    } catch (err) { console.error('[peak-pricing-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (ruleId: string, status: string) => {
    try { await updateRuleStatus(db, ruleId, status); toast.success(`Rule marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Peak Pricing", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTags} className="text-rose-600" />
              Peak Demand Pricing
            </h1>
            <p className="text-sm text-neutral-500">
              AI demand-responsive pricing — surge during peaks, discount during lulls (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Generating…' : 'Generate rules'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTags} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No pricing rules yet!</p>
            <p className="text-sm mt-1">Click "Generate rules" to create demand-based pricing.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowUp} />Surge rules</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.surgeCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowDown} />Discount rules</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.discountCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Est. revenue lift</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{withCurrency(summary.totalLift)}</div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="p-3 text-left">Tier</th>
                    <th className="p-3 text-left">Day</th>
                    <th className="p-3 text-right">Hour</th>
                    <th className="p-3 text-right">Demand</th>
                    <th className="p-3 text-right">Capacity</th>
                    <th className="p-3 text-right">Ratio</th>
                    <th className="p-3 text-right">Adjustment</th>
                    <th className="p-3 text-right">Est. Lift</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, idx) => {
                    const style = TIER_STYLE[rule.pricing_tier] ?? TIER_STYLE.normal;
                    return (
                      <tr key={idx} className="border-b border-neutral-100">
                        <td className="p-3"><span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>{style.label}</span></td>
                        <td className="p-3 font-semibold">{DOW_NAMES[rule.day_of_week] ?? '?'}</td>
                        <td className="p-3 text-right tabular-nums">{rule.hour}:00</td>
                        <td className="p-3 text-right tabular-nums">{rule.predicted_demand}</td>
                        <td className="p-3 text-right tabular-nums text-neutral-500">{rule.capacity}</td>
                        <td className={`p-3 text-right tabular-nums ${rule.demand_ratio > 0.8 ? 'text-rose-600' : 'text-emerald-600'}`}>{rule.demand_ratio}</td>
                        <td className={`p-3 text-right tabular-nums font-bold ${rule.price_adjustment_pct > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {rule.price_adjustment_pct > 0 ? '+' : ''}{rule.price_adjustment_pct}%
                        </td>
                        <td className={`p-3 text-right tabular-nums font-bold ${rule.est_revenue_lift > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {rule.est_revenue_lift > 0 ? '+' : ''}{withCurrency(rule.est_revenue_lift)}
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => rule.id && handleStatus(rule.id, 'active')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                            <FontAwesomeIcon icon={faCheckCircle} /> Activate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rules.filter(r => r.ai_insight).slice(0, 5).map((rule, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{DOW_NAMES[rule.day_of_week]} {rule.hour}:00</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_STYLE[rule.pricing_tier].bg} ${TIER_STYLE[rule.pricing_tier].text}`}>{rule.pricing_tier}</span>
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{rule.ai_insight}</p>
              </div>
            ))}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Surge: <strong>+{(config.surgePct * 100).toFixed(0)}%</strong></span>
              <span>Discount: <strong>−{(config.discountPct * 100).toFixed(0)}%</strong></span>
              <span>Surge threshold: <strong>{(config.demandThreshold * 100).toFixed(0)}%</strong></span>
              <span>Lull threshold: <strong>{(config.lullThreshold * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default PeakPricingScreen;
