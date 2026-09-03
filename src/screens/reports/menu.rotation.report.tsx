/**
 * AI Menu Rotation Dashboard — detect menu fatigue + recommend rotation timing.
 *
 * 44th POSR-exclusive differentiator — menu fatigue causes 15-20% sales decline
 * per item after 4-6 weeks on menu (Cornell hospitality research).
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
  faArrowsRotate, faRotate, faLightbulb, faCheckCircle,
  faArrowTrendDown, faArrowTrendUp, faStar, faUtensils,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runMenuRotationEngine, getActiveSuggestions, getSummary, updateSuggestionStatus,
  readMenuRotationConfig, DEFAULT_MENU_ROTATION_CONFIG,
  type MenuRotationSuggestion,
} from "@/lib/menu-rotation.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  fatigue_detected:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowTrendDown, label: 'FATIGUE' },
  rising_star:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,   label: 'RISING STAR' },
  rotation_candidate:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowsRotate,   label: 'ROTATE' },
  comeback_candidate:  { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faStar,           label: 'COMEBACK' },
  permanent_keep:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCheckCircle,    label: 'KEEP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

export function MenuRotationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [suggestions, setSuggestions] = useState<MenuRotationSuggestion[]>([]);
  const [summary, setSummary] = useState({ fatigueCount: 0, risingStarCount: 0, rotationCount: 0, totalRevenueImpact: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MENU_ROTATION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMenuRotationConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveSuggestions(db), getSummary(db)]);
      setSuggestions(list); setSummary(sum);
    } catch (err) { console.error('[menu-rotation-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMenuRotationEngine(db, config);
      toast.success(result.suggestions.length > 0
        ? `Generated ${result.suggestions.length} menu rotation suggestions — ${result.suggestions.filter(s => s.rule_id === 'fatigue_detected').length} fatigued, ${result.suggestions.filter(s => s.rule_id === 'rising_star').length} rising stars`
        : `No suggestions — need ≥${config.minWeeksOnMenu} weeks of sales per item`);
      await reload();
    } catch (err) { console.error('[menu-rotation-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (suggId: string, status: 'rotated' | 'declined') => {
    try { await updateSuggestionStatus(db, suggId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: fatigue first, then by fatigue_score desc
  const sortedSuggestions = [...suggestions].sort((a, b) => {
    if (a.rule_id === 'fatigue_detected' && b.rule_id !== 'fatigue_detected') return -1;
    if (b.rule_id === 'fatigue_detected' && a.rule_id !== 'fatigue_detected') return 1;
    return b.fatigue_score - a.fatigue_score;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Menu Rotation", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faArrowsRotate} className="text-rose-600" />
              AI Menu Rotation
            </h1>
            <p className="text-sm text-neutral-500">
              Detects menu fatigue + recommends when to rotate items, suggests replacements (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Run analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : suggestions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUtensils} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No menu rotation suggestions yet!</p>
            <p className="text-sm mt-1">Click "Run analysis" to detect fatigued items and find rotation candidates.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendDown} />Fatigued</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.fatigueCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendUp} />Rising stars</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.risingStarCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowsRotate} />Rotate</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.rotationCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Revenue impact</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{withCurrency(summary.totalRevenueImpact)}</div>
              </div>
            </div>

            {/* Suggestions table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faArrowsRotate} className="text-rose-600" />
                  Rotation Suggestions (sorted by urgency)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Weeks</th>
                      <th className="p-3 text-right">Baseline</th>
                      <th className="p-3 text-right">Recent</th>
                      <th className="p-3 text-right">Trend</th>
                      <th className="p-3 text-right">Fatigue</th>
                      <th className="p-3 text-left">Action</th>
                      <th className="p-3 text-right">Impact</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSuggestions.map((s, idx) => {
                      const style = RULE_STYLE[s.rule_id] ?? RULE_STYLE.rotation_candidate;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[s.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{s.item_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{s.description}</p>
                            {s.suggested_replacement && (
                              <p className="text-xs text-emerald-600 mt-0.5">→ Replace with: {s.suggested_replacement}</p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{s.weeks_on_menu ?? '—'}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{s.baseline_sales.toFixed(1)}</td>
                          <td className="p-3 text-right tabular-nums font-semibold">{s.recent_sales.toFixed(1)}</td>
                          <td className={`p-3 text-right tabular-nums font-bold ${s.sales_trend_pct < 0 ? 'text-rose-600' : s.sales_trend_pct > 0 ? 'text-emerald-600' : 'text-neutral-500'}`}>
                            {s.sales_trend_pct > 0 ? '+' : ''}{s.sales_trend_pct}%
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="tabular-nums">{s.fatigue_score}</span>
                              <div className="w-8 h-1 bg-neutral-100 rounded">
                                <div className={`h-1 rounded ${s.fatigue_score > 75 ? 'bg-rose-500' : s.fatigue_score > 50 ? 'bg-amber-500' : s.fatigue_score > 25 ? 'bg-yellow-400' : 'bg-emerald-500'}`} style={{ width: `${s.fatigue_score}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-xs">
                            <span className="px-2 py-1 rounded bg-neutral-100 capitalize">{(s.suggested_action ?? 'monitor').replace(/_/g, ' ')}</span>
                          </td>
                          <td className={`p-3 text-right tabular-nums font-bold ${s.est_revenue_impact < 0 ? 'text-rose-600' : s.est_revenue_impact > 0 ? 'text-emerald-600' : 'text-neutral-500'}`}>
                            {s.est_revenue_impact !== 0 ? (s.est_revenue_impact > 0 ? '+' : '') + withCurrency(s.est_revenue_impact) : '—'}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              {s.rule_id === 'fatigue_detected' && (
                                <button onClick={() => s.id && handleStatus(s.id, 'rotated')} className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200">
                                  <FontAwesomeIcon icon={faCheckCircle} /> Rotate
                                </button>
                              )}
                              <button onClick={() => s.id && handleStatus(s.id, 'declined')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                                Skip
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI insights */}
            {suggestions.filter(s => s.ai_insight).slice(0, 5).map((s, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{s.item_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[s.rule_id].bg} ${RULE_STYLE[s.rule_id].text}`}>{s.rule_id.replace(/_/g, ' ')}</span>
                  {s.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{s.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{s.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackWeeks}w</strong></span>
              <span>Fatigue threshold: <strong>{(config.fatigueThreshold * 100).toFixed(0)}%</strong></span>
              <span>Min weeks on menu: <strong>{config.minWeeksOnMenu}w</strong></span>
              <span>Comeback after: <strong>{config.comebackWeeks}w</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default MenuRotationScreen;
