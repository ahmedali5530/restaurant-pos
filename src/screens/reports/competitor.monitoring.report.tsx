/**
 * Competitor Price Monitoring Dashboard — track + compare prices + AI recs.
 *
 * Research finding: Toast Competitor Insights $45+/mo (higher tier), Square
 * Menu Benchmarking in Plus. POSR offers it free.
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
  faStore, faArrowTrendUp, faArrowTrendDown, faMinus, faRobot, faRotate,
  faLightbulb, faPlus, faBrain,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  getCompetitorPrices,
  getCompetitorSummary,
  addCompetitorPrice,
  enhanceWithAI,
  readCompetitorConfig,
  type CompetitorPrice,
  type CompetitorSummary,
} from "@/lib/competitor-monitoring.service.ts";
import { useSecurity } from "@/hooks/useSecurity.ts";

const POSITION_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  premium:   { bg: 'bg-rose-50',    text: 'text-rose-700',   icon: faArrowTrendUp,   label: 'Premium' },
  matching:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faMinus,          label: 'Matching' },
  discount:  { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: faArrowTrendDown, label: 'Discount' },
};

const REC_LABEL: Record<string, string> = {
  match: 'Match', undercut: 'Undercut', premium: 'Keep premium', keep: 'Keep', review: 'Review',
};

export function CompetitorMonitoringScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const { user } = useSecurity() as any;
  const [prices, setPrices] = useState<CompetitorPrice[]>([]);
  const [summary, setSummary] = useState<CompetitorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [enhancing, setEnhancing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [config, setConfig] = useState({ enabled: true, aiEnabled: true, lookbackDays: 90 });
  const [showAddForm, setShowAddForm] = useState(false);
  // Add form state
  const [formData, setFormData] = useState({
    dish_name: '', our_price: '', competitor_name: '', competitor_price_value: '',
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCompetitorConfig(settingsRows[0] ?? {}));
      const [priceList, sum] = await Promise.all([
        getCompetitorPrices(db),
        getCompetitorSummary(db),
      ]);
      setPrices(priceList);
      setSummary(sum);
    } catch (err) {
      console.error('[competitor-report] reload failed', err);
      toast.error('Failed to load competitor data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAdd = useCallback(async () => {
    if (!formData.dish_name || !formData.competitor_name || !formData.our_price || !formData.competitor_price_value) {
      toast.error('All fields are required');
      return;
    }
    const result = await addCompetitorPrice(db, {
      dish_id: `manual-${Date.now()}`,
      dish_name: formData.dish_name,
      our_price: parseFloat(formData.our_price),
      competitor_name: formData.competitor_name,
      competitor_price_value: parseFloat(formData.competitor_price_value),
      source: 'manual',
    });
    if (result) {
      toast.success(`Added: ${formData.dish_name} vs ${formData.competitor_name}`);
      setFormData({ dish_name: '', our_price: '', competitor_name: '', competitor_price_value: '' });
      setShowAddForm(false);
      await reload();
    } else {
      toast.error('Failed to add entry');
    }
  }, [db, formData, reload]);

  const handleEnhance = useCallback(async () => {
    setEnhancing(true);
    try {
      const result = await enhanceWithAI(db);
      if (result.summary) setAiSummary(result.summary);
      toast.success(`AI enhanced ${result.enhanced} entries`);
      await reload();
    } catch (err) {
      console.error('[competitor-report] enhance failed', err);
      toast.error('AI enhancement failed');
    } finally {
      setEnhancing(false);
    }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Competitor Monitoring", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faStore} className="text-orange-600" />
              Competitor Monitoring
            </h1>
            <p className="text-sm text-neutral-500">
              Track competitor prices + AI recommendations (match/undercut/premium/keep/review)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowAddForm(s => !s)} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faPlus} /> Add price
            </Button>
            <Button onClick={handleEnhance} disabled={enhancing || prices.length === 0} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faBrain} spin={enhancing} />
              {enhancing ? 'Analyzing…' : 'AI analyze'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading competitor data…</p>
          </div>
        ) : (
          <>
            {/* Add form */}
            {showAddForm && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Add competitor price entry</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-neutral-500">Dish name</label>
                    <input value={formData.dish_name} onChange={e => setFormData(f => ({ ...f, dish_name: e.target.value }))}
                      placeholder="Margherita Pizza" className="w-full px-3 py-2 border border-neutral-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Our price ($)</label>
                    <input type="number" step="0.01" value={formData.our_price} onChange={e => setFormData(f => ({ ...f, our_price: e.target.value }))}
                      placeholder="12.99" className="w-full px-3 py-2 border border-neutral-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Competitor</label>
                    <input value={formData.competitor_name} onChange={e => setFormData(f => ({ ...f, competitor_name: e.target.value }))}
                      placeholder="Pizza Palace" className="w-full px-3 py-2 border border-neutral-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Their price ($)</label>
                    <input type="number" step="0.01" value={formData.competitor_price_value} onChange={e => setFormData(f => ({ ...f, competitor_price_value: e.target.value }))}
                      placeholder="10.99" className="w-full px-3 py-2 border border-neutral-300 rounded text-sm" />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button onClick={() => setShowAddForm(false)} variant="custom" className="px-3 py-1.5 text-sm border border-neutral-300">Cancel</Button>
                  <Button onClick={handleAdd} variant="primary" className="px-4 py-1.5 text-sm">Add entry</Button>
                </div>
              </div>
            )}

            {/* Summary cards */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard icon={faStore} label="Compared" value={summary.totalCompared} color="text-orange-600" />
                <SummaryCard icon={faArrowTrendUp} label="Premium" value={summary.premiumCount} color="text-rose-600" />
                <SummaryCard icon={faMinus} label="Matching" value={summary.matchingCount} color="text-emerald-600" />
                <SummaryCard icon={faArrowTrendDown} label="Discount" value={summary.discountCount} color="text-blue-600" />
                <SummaryCard icon={faArrowTrendUp} label="Avg diff" value={`${summary.avgDiffPct > 0 ? '+' : ''}${summary.avgDiffPct}%`} color={summary.avgDiffPct > 0 ? 'text-rose-600' : 'text-emerald-600'} />
              </div>
            )}

            {/* AI summary */}
            {aiSummary && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Competitive Assessment
                </h3>
                <p className="text-sm text-violet-900">{aiSummary}</p>
              </div>
            )}

            {/* Price comparison table */}
            {prices.length === 0 ? (
              <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
                <FontAwesomeIcon icon={faStore} className="text-5xl mb-4 opacity-40" />
                <p className="text-lg font-medium">No competitor data yet</p>
                <p className="text-sm mt-1">Click "Add price" to start tracking competitor prices.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
                <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 sticky top-0 z-10">
                      <tr>
                        <th className="text-left p-3">Dish</th>
                        <th className="text-left p-3">Competitor</th>
                        <th className="text-right p-3">Our price</th>
                        <th className="text-right p-3">Their price</th>
                        <th className="text-right p-3">Diff</th>
                        <th className="text-right p-3">Diff %</th>
                        <th className="text-center p-3">Position</th>
                        <th className="text-center p-3">AI rec</th>
                        <th className="text-left p-3">AI insight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prices.map((p, idx) => {
                        const style = POSITION_STYLE[p.position] ?? POSITION_STYLE.matching;
                        return (
                          <tr key={idx} className="border-t hover:bg-neutral-50">
                            <td className="p-3 font-medium">{p.dish_name}</td>
                            <td className="p-3">{p.competitor_name}</td>
                            <td className="p-3 text-right tabular-nums font-semibold">{withCurrency(p.our_price)}</td>
                            <td className="p-3 text-right tabular-nums">{withCurrency(p.competitor_price_value)}</td>
                            <td className="p-3 text-right tabular-nums">
                              <span className={p.price_diff > 0 ? 'text-rose-600' : p.price_diff < 0 ? 'text-emerald-600' : 'text-neutral-500'}>
                                {p.price_diff > 0 ? '+' : ''}{withCurrency(p.price_diff)}
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              <span className={p.price_diff_pct > 10 ? 'text-rose-600 font-semibold' : p.price_diff_pct < -10 ? 'text-emerald-600 font-semibold' : 'text-emerald-600'}>
                                {p.price_diff_pct > 0 ? '+' : ''}{p.price_diff_pct}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${style.bg} ${style.text}`}>
                                <FontAwesomeIcon icon={style.icon} className="text-xs" />
                                {style.label}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {p.ai_recommendation && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                  {REC_LABEL[p.ai_recommendation] ?? p.ai_recommendation}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-xs text-violet-600 italic max-w-xs">
                              {p.ai_insight ? `"${p.ai_insight}"` : <span className="text-neutral-400">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Monitoring: <strong>{config.enabled ? 'enabled' : 'disabled'}</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Competitors tracked: <strong>{summary?.competitors.length ?? 0}</strong></span>
              {summary && summary.competitors.length > 0 && (
                <span>Names: <strong>{summary.competitors.join(', ')}</strong></span>
              )}
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

export default CompetitorMonitoringScreen;
