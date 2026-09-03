/**
 * Overtime Prediction Dashboard — forecast overtime before it happens.
 *
 * 41st POSR-exclusive differentiator — overtime costs restaurants $15k-40k/yr.
 * Toast, Square track overtime AFTER but DON'T predict BEFORE.
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
  faClock, faTriangleExclamation, faRotate, faLightbulb,
  faCheckCircle, faDollarSign, faUserClock, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runOvertimePrediction, getAtRiskEmployees, getSummary, updateAction,
  readOvertimeConfig, DEFAULT_OVERTIME_CONFIG,
  type OvertimePrediction, type OvertimeRiskLevel, type OvertimeRecommendation,
} from "@/lib/overtime-prediction.service.ts";

const LEVEL_STYLE: Record<OvertimeRiskLevel, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-500', label: 'Critical (over OT)' },
  high:     { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-400', label: 'High (>105%)' },
  medium:   { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-400', label: 'Medium (>90%)' },
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Low' },
};

const REC_LABEL: Record<OvertimeRecommendation, string> = {
  reduce_hours: 'Reduce hours', swap_shift: 'Swap shift', add_staff: 'Add staff',
  approve_overtime: 'Approve OT', redistribute: 'Redistribute',
};

const REC_STYLE: Record<OvertimeRecommendation, string> = {
  reduce_hours: 'bg-amber-100 text-amber-700', swap_shift: 'bg-blue-100 text-blue-700',
  add_staff: 'bg-violet-100 text-violet-700', approve_overtime: 'bg-rose-100 text-rose-700',
  redistribute: 'bg-emerald-100 text-emerald-700',
};

export function OvertimePredictionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<OvertimePrediction[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, high: 0, totalOTCost: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_OVERTIME_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readOvertimeConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getAtRiskEmployees(db), getSummary(db)]);
      setPredictions(list); setSummary(sum);
    } catch (err) { console.error('[overtime-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runOvertimePrediction(db, config);
      toast.success(result.predictions.length > 0
        ? `Analyzed ${result.scanned} employees — ${result.predictions.length} at overtime risk (${withCurrency(result.predictions.reduce((s, p) => s + p.overtime_cost, 0))} OT cost)`
        : `No employees at overtime risk`);
      await reload();
    } catch (err) { console.error('[overtime-report] analyze failed', err); toast.error('Prediction failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleAction = useCallback(async (id: string, action: string) => {
    try { await updateAction(db, id, action); toast.success(`Marked: ${action.replace(/_/g, ' ')}`); await reload(); }
    catch { toast.error('Failed'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Overtime Prediction", t("reports:title", { defaultValue: "Reports" })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClock} className="text-orange-600" />
              Overtime Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              AI overtime forecasting — predict before it happens + prevention recs (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Predicting…' : 'Predict overtime'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : predictions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No overtime risk!</p>
            <p className="text-sm mt-1">All employees within regular hours. Click "Predict" to recheck.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">High</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.high}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUsers} />At-risk</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />OT cost</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalOTCost)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {predictions.map((pred, idx) => {
                const style = LEVEL_STYLE[pred.risk_level] ?? LEVEL_STYLE.medium;
                const hoursBar = Math.min(100, (pred.projected_hours / pred.max_hours) * 100);
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faUserClock} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{pred.employee_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>{style.label}</span>
                        {pred.position && <span className="text-sm text-neutral-500">· {pred.position}</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">OT cost</div>
                        <div className="font-bold text-rose-600 tabular-nums">{withCurrency(pred.overtime_cost)}</div>
                      </div>
                    </div>

                    {/* Hours bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-neutral-600">Scheduled: {pred.scheduled_hours}h / {pred.max_hours}h max</span>
                        <span className={`font-semibold tabular-nums ${pred.projected_hours > pred.max_hours ? 'text-rose-600' : 'text-amber-600'}`}>
                          {pred.projected_hours}h projected
                        </span>
                      </div>
                      <div className="h-3 bg-neutral-200 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full ${pred.projected_hours > pred.max_hours ? 'bg-rose-500' : pred.projected_hours > pred.max_hours * 0.9 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${hoursBar}%` }}
                        />
                        <div className="absolute top-0 bottom-0" style={{ left: '100%', width: '2px', background: '#000' }} />
                      </div>
                      {pred.overtime_hours > 0 && (
                        <div className="text-xs text-rose-600 mt-1">{pred.overtime_hours}h overtime projected</div>
                      )}
                    </div>

                    {pred.ai_insight && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{pred.ai_insight}</p>
                      </div>
                    )}

                    <div className="flex gap-2 items-center">
                      {pred.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[pred.ai_recommendation] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          AI: {REC_LABEL[pred.ai_recommendation] ?? pred.ai_recommendation}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        <button onClick={() => pred.id && handleAction(pred.id, 'hours_reduced')} className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">Reduce</button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'shift_swapped')} className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">Swap</button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'approved')} className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">Approve</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Max hours: <strong>{config.maxHours}h/week</strong></span>
              <span>OT rate: <strong>{config.otRate}×</strong></span>
              <span>Avg rate: <strong>{withCurrency(config.avgRate)}/hr</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default OvertimePredictionScreen;
