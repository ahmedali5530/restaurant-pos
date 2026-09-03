/**
 * Spoilage Prediction Dashboard — predict waste BEFORE it happens.
 *
 * 20th POSR-exclusive differentiator — existing services detect waste AFTER
 * it happens or find items ALREADY expired. POSR PREDICTS spoilage before
 * it occurs, enabling preventive action.
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
  faClockRotateLeft, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faClock,
  faCube, faCalendarXmark, faUtensils, faHandHoldingHeart,
  faTag, faArrowRightArrowLeft, faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runSpoilagePrediction,
  getAtRiskItems,
  getSpoilageSummary,
  updateSpoilageAction,
  readSpoilageConfig,
  DEFAULT_SPOILAGE_CONFIG,
  type SpoilagePrediction,
  type SpoilageRiskLevel,
  type SpoilageRecommendation,
} from "@/lib/spoilage-prediction.service.ts";

const LEVEL_STYLE: Record<SpoilageRiskLevel, { bg: string; text: string; border: string; icon: any; label: string }> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   icon: faTriangleExclamation, label: 'Critical (< 3 days)' },
  high:     { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-400', label: 'High (< 7 days)',     icon: faClock },
  medium:   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'Medium (< 14 days)',   icon: faEye },
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Low (safe)',          icon: faCheckCircle },
};

const REC_LABEL: Record<SpoilageRecommendation, string> = {
  use_in_special: 'Use in special',
  mark_down: 'Mark down',
  redistribute: 'Redistribute',
  reduce_reorder: 'Reduce reorder',
  donate: 'Donate',
  discard_now: 'Discard now',
  monitor: 'Monitor',
};

const REC_STYLE: Record<SpoilageRecommendation, string> = {
  use_in_special: 'bg-emerald-100 text-emerald-700',
  mark_down: 'bg-amber-100 text-amber-700',
  redistribute: 'bg-blue-100 text-blue-700',
  reduce_reorder: 'bg-violet-100 text-violet-700',
  donate: 'bg-rose-100 text-rose-700',
  discard_now: 'bg-neutral-800 text-white',
  monitor: 'bg-neutral-100 text-neutral-600',
};

const REC_ICON: Record<SpoilageRecommendation, any> = {
  use_in_special: faUtensils,
  mark_down: faTag,
  redistribute: faArrowRightArrowLeft,
  reduce_reorder: faClockRotateLeft,
  donate: faHandHoldingHeart,
  discard_now: faTrash,
  monitor: faEye,
};

const formatDate = (d: Date | string): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function SpoilagePredictionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<SpoilagePrediction[]>([]);
  const [summary, setSummary] = useState({
    total: 0, critical: 0, high: 0, medium: 0, totalSpoilageCost: 0, totalItemsScanned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SPOILAGE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSpoilageConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getAtRiskItems(db),
        getSpoilageSummary(db),
      ]);
      setPredictions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[spoilage-report] reload failed', err);
      toast.error('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runSpoilagePrediction(db, config, (current, total) => {
        setProgress({ current, total });
      });
      const atRisk = result.predictions.filter(p => p.will_spoil).length;
      const cost = result.predictions.reduce((s, p) => s + p.est_spoilage_cost, 0);
      toast.success(
        result.predictions.length > 0
          ? `Scanned ${result.scanned} items — ${atRisk} will spoil (${withCurrency(cost)} at risk)`
          : `No items with expiry dates found to analyze`
      );
      await reload();
    } catch (err) {
      console.error('[spoilage-report] analyze failed', err);
      toast.error('Prediction failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAction = useCallback(async (predId: string, action: string) => {
    try {
      await updateSpoilageAction(db, predId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Spoilage Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClockRotateLeft} className="text-amber-600" />
              Spoilage Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              AI spoilage prediction — consumption rate × expiry date × stock level + preventive AI recs (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Predicting… (${progress.current}/${progress.total})` : 'Run prediction'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading predictions…</p>
          </div>
        ) : predictions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No spoilage risk!</p>
            <p className="text-sm mt-1">All stock will be consumed before expiry. Click "Run prediction" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Critical (&lt; 3d)</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">High (&lt; 7d)</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.high}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Medium (&lt; 14d)</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.medium}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">At-risk items</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Spoilage cost</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalSpoilageCost)}</div>
              </div>
            </div>

            {/* Prediction list */}
            <div className="space-y-3">
              {predictions.map((pred, idx) => {
                const style = LEVEL_STYLE[pred.risk_level] ?? LEVEL_STYLE.medium;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{pred.item_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {pred.category && <span className="text-sm text-neutral-500">· {pred.category}</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Spoilage cost</div>
                        <div className="font-bold text-rose-600 tabular-nums">{withCurrency(pred.est_spoilage_cost)}</div>
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2 bg-white/70 rounded p-3 text-sm">
                      <div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faCube} />Current stock</div>
                        <div className="font-bold tabular-nums text-neutral-700">{pred.current_stock.toFixed(1)}</div>
                        <div className="text-[10px] text-neutral-400">@ {withCurrency(pred.unit_cost)}/unit</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Daily consumption</div>
                        <div className="font-bold tabular-nums text-neutral-700">{pred.avg_daily_consumption.toFixed(1)}/day</div>
                        <div className="text-[10px] text-neutral-400">{pred.days_of_stock.toFixed(0)}d of stock</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faCalendarXmark} />Expiry date</div>
                        <div className="font-bold tabular-nums text-neutral-700">{pred.expiry_date ? formatDate(pred.expiry_date) : 'N/A'}</div>
                        <div className="text-[10px] text-neutral-400">{pred.days_until_expiry.toFixed(0)}d until expiry</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Will spoil</div>
                        <div className={`font-bold tabular-nums ${pred.will_spoil ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {pred.will_spoil ? 'YES' : 'NO'}
                        </div>
                        <div className="text-[10px] text-neutral-400">{pred.est_spoilage_qty.toFixed(1)} units at risk</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Risk score</div>
                        <div className={`font-bold tabular-nums ${style.text}`}>{pred.risk_score}/100</div>
                        <div className="text-[10px] text-neutral-400">of total stock</div>
                      </div>
                    </div>

                    {/* AI insight */}
                    {pred.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{pred.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 items-center flex-wrap">
                      {pred.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[pred.ai_recommendation]}`}>
                          <FontAwesomeIcon icon={REC_ICON[pred.ai_recommendation]} className="mr-1" />AI: {REC_LABEL[pred.ai_recommendation]}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        <button onClick={() => pred.id && handleAction(pred.id, 'used_in_special')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faUtensils} /> Used in special
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'marked_down')}
                          className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">
                          <FontAwesomeIcon icon={faTag} /> Marked down
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'donated')}
                          className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">
                          <FontAwesomeIcon icon={faHandHoldingHeart} /> Donated
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'discarded')}
                          className="px-2 py-1 rounded text-xs bg-neutral-200 text-neutral-700 hover:bg-neutral-300">
                          <FontAwesomeIcon icon={faXmark} /> Discarded
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
              <span>Consumption lookback: <strong>{config.consumptionLookbackDays} days</strong></span>
              <span>Critical: <strong>&lt; {config.criticalDays}d</strong></span>
              <span>High: <strong>&lt; {config.highDays}d</strong></span>
              <span>Medium: <strong>&lt; {config.mediumDays}d</strong></span>
              <span>Min stock value: <strong>{withCurrency(config.minStockValue)}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default SpoilagePredictionScreen;
