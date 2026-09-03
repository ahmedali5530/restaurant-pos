/**
 * Dish Profitability Dashboard — true profitability (food + labor + overhead).
 *
 * 34th POSR-exclusive differentiator — restaurants miss labor cost (30-40%
 * of true cost). POSR computes total profitability per dish.
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
  faCalculator, faRobot, faRotate, faLightbulb,
  faTriangleExclamation, faDollarSign, faClock,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runDishProfitAnalysis, getDishes, getSummary,
  readDishProfitConfig, DEFAULT_DISH_PROFIT_CONFIG,
  type DishProfitability, type ProfitabilityGrade,
} from "@/lib/dish-profitability.service.ts";

const GRADE_STYLE: Record<ProfitabilityGrade, string> = {
  A: 'bg-emerald-100 text-emerald-700', B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700', D: 'bg-orange-100 text-orange-700',
  F: 'bg-rose-100 text-rose-700',
};

export function DishProfitabilityScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [dishes, setDishes] = useState<DishProfitability[]>([]);
  const [summary, setSummary] = useState({ totalDishes: 0, gradeF: 0, gradeD: 0, totalHiddenLoss: 0, avgNetMargin: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_DISH_PROFIT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readDishProfitConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getDishes(db), getSummary(db)]);
      setDishes(list); setSummary(sum);
    } catch (err) { console.error('[dish-profit-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true); setProgress({ current: 0, total: 2 });
    try {
      const result = await runDishProfitAnalysis(db, config, (current, total) => setProgress({ current, total }));
      toast.success(result.dishes.length > 0
        ? `Analyzed ${result.analyzed} dishes — ${result.dishes.filter(d => d.profitability_grade === 'F').length} failing, ${withCurrency(result.dishes.reduce((s, d) => s + d.hidden_loss, 0))} hidden loss`
        : `No dishes with enough orders to analyze`);
      await reload();
    } catch (err) { console.error('[dish-profit-report] analyze failed', err); toast.error('Analysis failed — see console'); }
    finally { setAnalyzing(false); setProgress({ current: 0, total: 0 }); }
  }, [db, config, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Dish Profitability", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalculator} className="text-emerald-600" />
              Dish Profitability
            </h1>
            <p className="text-sm text-neutral-500">
              AI true profitability — food + labor + overhead cost per dish (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze dishes'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading…</p>
          </div>
        ) : dishes.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCalculator} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No dishes analyzed yet!</p>
            <p className="text-sm mt-1">Click "Analyze dishes" to compute true profitability.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Grade F</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.gradeF}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">Grade D</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.gradeD}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Total dishes</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.totalDishes}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Hidden loss</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalHiddenLoss)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Avg net margin</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{Math.round(summary.avgNetMargin)}%</div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="p-3 text-left">Grade</th>
                    <th className="p-3 text-left">Dish</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-right">Food</th>
                    <th className="p-3 text-right">Labor</th>
                    <th className="p-3 text-right">Overhead</th>
                    <th className="p-3 text-right">Total Cost</th>
                    <th className="p-3 text-right">Net Profit</th>
                    <th className="p-3 text-right">Net Margin</th>
                    <th className="p-3 text-right">Hidden Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {dishes.map((d, idx) => (
                    <tr key={idx} className="border-b border-neutral-100">
                      <td className="p-3"><span className={`text-xs font-bold px-2 py-1 rounded-full ${GRADE_STYLE[d.profitability_grade]}`}>{d.profitability_grade}</span></td>
                      <td className="p-3 font-semibold">{d.menu_item_name}</td>
                      <td className="p-3 text-right tabular-nums">{withCurrency(d.selling_price)}</td>
                      <td className="p-3 text-right tabular-nums text-rose-600">{withCurrency(d.food_cost)}</td>
                      <td className="p-3 text-right tabular-nums text-amber-600">{withCurrency(d.labor_cost)}</td>
                      <td className="p-3 text-right tabular-nums text-neutral-500">{withCurrency(d.overhead_cost)}</td>
                      <td className="p-3 text-right tabular-nums font-bold text-rose-700">{withCurrency(d.total_cost)}</td>
                      <td className={`p-3 text-right tabular-nums font-bold ${d.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{withCurrency(d.net_profit)}</td>
                      <td className={`p-3 text-right tabular-nums font-bold ${d.net_margin_pct >= 40 ? 'text-emerald-600' : d.net_margin_pct >= 20 ? 'text-amber-600' : 'text-rose-600'}`}>{d.net_margin_pct.toFixed(1)}%</td>
                      <td className="p-3 text-right tabular-nums text-rose-600">{d.hidden_loss > 0 ? withCurrency(d.hidden_loss) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* AI insights */}
            <div className="space-y-2">
              {dishes.filter(d => d.ai_insight).slice(0, 8).map((d, idx) => (
                <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${GRADE_STYLE[d.profitability_grade]}`}>{d.profitability_grade}</span>
                    <span className="font-semibold text-sm">{d.menu_item_name}</span>
                    {d.ai_recommendation && <span className="text-xs text-violet-600 capitalize">· AI: {d.ai_recommendation.replace(/_/g, ' ')}</span>}
                  </div>
                  <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{d.ai_insight}</p>
                </div>
              ))}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Labor rate: <strong>{withCurrency(config.avgLaborRate)}/hr</strong></span>
              <span>Overhead: <strong>{(config.overheadPct * 100).toFixed(0)}% of price</strong></span>
              <span>Min orders: <strong>{config.minOrders}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default DishProfitabilityScreen;
