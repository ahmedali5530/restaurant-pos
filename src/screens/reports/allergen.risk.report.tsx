/**
 * AI Allergen Cross-Contamination Risk Detector — per-order safety analysis.
 *
 * 46th POSR-exclusive differentiator — 32M Americans have food allergies;
 * 200+ die annually from anaphylaxis (FDA, AAAAI).
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
  faTriangleExclamation, faRotate, faLightbulb, faCheckCircle,
  faUtensils, faFireBurner, faCircleQuestion, faRepeat,
} from "@fortawesome/free-solid-svg-icons";
import {
  runAllergenEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readAllergenConfig, DEFAULT_ALLERGEN_CONFIG,
  type AllergenRiskAlert,
} from "@/lib/allergen-risk.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  mixed_order_risk:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'MIXED ORDER' },
  shared_utensil_risk: { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUtensils,            label: 'SHARED UTENSIL' },
  deep_fryer_risk:     { bg: 'bg-orange-50',   text: 'text-orange-700',  icon: faFireBurner,         label: 'DEEP FRYER' },
  unknown_allergen:    { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faCircleQuestion,     label: 'UNKNOWN ALLERGEN' },
  repeat_offender:     { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faRepeat,             label: 'REPEAT OFFENDER' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

// Allergen color coding
const ALLERGEN_COLORS: Record<string, string> = {
  peanut:    'bg-rose-100 text-rose-800',
  tree_nut:  'bg-rose-100 text-rose-800',
  shellfish: 'bg-rose-100 text-rose-800',
  fish:      'bg-rose-100 text-rose-800',
  dairy:     'bg-amber-100 text-amber-800',
  egg:       'bg-amber-100 text-amber-800',
  gluten:    'bg-yellow-100 text-yellow-800',
  soy:       'bg-emerald-100 text-emerald-800',
  sesame:    'bg-violet-100 text-violet-800',
};

const allergenBadgeClass = (a: string): string => ALLERGEN_COLORS[a] ?? 'bg-neutral-100 text-neutral-700';

export function AllergenRiskScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<AllergenRiskAlert[]>([]);
  const [summary, setSummary] = useState({ criticalCount: 0, highCount: 0, totalAlerts: 0, repeatOffenderCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ALLERGEN_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAllergenConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[allergen-risk-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runAllergenEngine(db, config);
      toast.success(result.alerts.length > 0
        ? `Generated ${result.alerts.length} allergen alerts — ${result.alerts.filter(a => a.severity === 'critical').length} critical, ${result.alerts.filter(a => a.rule_id === 'repeat_offender').length} repeat offenders`
        : `No allergen risks detected — all orders allergen-consistent`);
      await reload();
    } catch (err) { console.error('[allergen-risk-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'mitigated' | 'declined_dish') => {
    try { await updateAlertStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: critical first, then by rule severity
  const sortedAlerts = [...alerts].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
  });

  return (
    <Layout>
      <DocumentTitle parts={["Allergen Risk", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTriangleExclamation} className="text-rose-600" />
              AI Allergen Risk Detector
            </h1>
            <p className="text-sm text-neutral-500">
              Detects cross-contamination risks per order — mixed dishes, shared utensils, deep fryer (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Scanning orders…' : 'Scan orders'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTriangleExclamation} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No allergen risks detected!</p>
            <p className="text-sm mt-1">Click "Scan orders" to analyze recent orders for cross-contamination risks.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-3xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCircleQuestion} />High</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.highCount}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">Total alerts</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.totalAlerts}</div>
              </div>
              <div className="bg-rose-100 rounded-lg border border-rose-300 p-3 text-center">
                <div className="text-xs text-rose-700 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faRepeat} />Repeat offenders</div>
                <div className="text-2xl font-bold text-rose-800 tabular-nums">{summary.repeatOffenderCount}</div>
              </div>
            </div>

            {/* Risk alerts table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="text-rose-600" />
                  Risk Alerts (sorted by severity)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Order / Table</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-left">Allergens</th>
                      <th className="p-3 text-left">Affected Items</th>
                      <th className="p-3 text-left">Kitchen Action</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAlerts.map((a, idx) => {
                      const style = RULE_STYLE[a.rule_id] ?? RULE_STYLE.mixed_order_risk;
                      const allergens = a.allergens.split(',').filter(Boolean);
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[a.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">Table {a.table_name ?? '—'}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{a.description}</p>
                            {a.server_name && a.server_name !== '—' && (
                              <p className="text-xs text-neutral-400 mt-0.5">Server: {a.server_name}</p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {allergens.length === 0 ? (
                                <span className="text-xs text-neutral-400">—</span>
                              ) : allergens.map((al, i) => (
                                <span key={i} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${allergenBadgeClass(al)}`}>
                                  {al.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {a.affected_items.split(', ').slice(0, 4).map((item, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">{item}</span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3">
                            {a.preparation_note && (
                              <p className="text-xs text-neutral-700 italic bg-amber-50 p-2 rounded border border-amber-100">
                                {a.preparation_note}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              <button onClick={() => a.id && handleStatus(a.id, 'mitigated')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap">
                                <FontAwesomeIcon icon={faCheckCircle} /> Mitigated
                              </button>
                              <button onClick={() => a.id && handleStatus(a.id, 'declined_dish')} className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200">
                                Decline
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
            {alerts.filter(a => a.ai_insight).slice(0, 5).map((a, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">Table {a.table_name ?? '—'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[a.rule_id].bg} ${RULE_STYLE[a.rule_id].text}`}>{a.rule_id.replace(/_/g, ' ')}</span>
                  {a.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{a.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{a.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Repeat threshold: <strong>{config.repeatThreshold}</strong></span>
              <span>Tracked allergens: <strong>{config.knownAllergens.length}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default AllergenRiskScreen;
