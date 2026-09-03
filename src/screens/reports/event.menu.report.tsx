/**
 * AI Event-Driven Menu Optimizer — event calendar + menu recs dashboard.
 *
 * 72nd POSR-exclusive differentiator — 50-300% revenue spikes on event days.
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
  faCalendarStar, faRotate, faLightbulb, faCheckCircle,
  faUtensils, faBullhorn, faUsers, faBoxOpen, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runEventMenuEngine, getActiveOptimizations, getSummary, updateOptimizationStatus,
  readEventMenuConfig, DEFAULT_EVENT_MENU_CONFIG,
  type EventMenuOptimization,
} from "@/lib/event-menu.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  holiday_menu:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faCalendarStar,  label: 'HOLIDAY' },
  sports_event:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCalendarStar,  label: 'SPORTS' },
  local_festival:  { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faCalendarStar,  label: 'FESTIVAL' },
  weather_event:   { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faCalendarStar,  label: 'WEATHER' },
  cultural_event:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCalendarStar,  label: 'CULTURAL' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const parseDishes = (json?: string): Array<{ name: string; reason: string; prepMultiplier: number }> => {
  if (!json) return [];
  try { const p = JSON.parse(json); return Array.isArray(p) ? p : []; } catch { return []; }
};
const parsePromos = (json?: string): string[] => {
  if (!json) return [];
  try { const p = JSON.parse(json); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
};
const parseInventory = (json?: string): Array<{ item: string; extraQty: string }> => {
  if (!json) return [];
  try { const p = JSON.parse(json); return Array.isArray(p) ? p : []; } catch { return []; }
};

export function EventMenuScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [opts, setOpts] = useState<EventMenuOptimization[]>([]);
  const [summary, setSummary] = useState({ eventCount: 0, criticalCount: 0, totalRevenueLift: 0, totalNetProfit: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_EVENT_MENU_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readEventMenuConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveOptimizations(db), getSummary(db)]);
      setOpts(list); setSummary(sum);
    } catch (err) { console.error('[event-menu-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runEventMenuEngine(db, config);
      toast.success(result.optimizations.length > 0
        ? `Found ${result.optimizations.length} upcoming events — est ${withCurrency(result.optimizations.reduce((s, o) => s + o.net_profit, 0))} total net profit`
        : `No upcoming events in ${config.lookaheadDays}d window`);
      await reload();
    } catch (err) { console.error('[event-menu-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (optId: string, status: 'prepared' | 'executed') => {
    try { await updateOptimizationStatus(db, optId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedOpts = [...opts].sort((a, b) => a.days_until_event - b.days_until_event);

  return (
    <Layout>
      <DocumentTitle parts={["Event Menu", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarStar} className="text-rose-600" />
              AI Event Menu
            </h1>
            <p className="text-sm text-neutral-500">
              Event-driven menu optimization — 50-300% revenue spikes on event days (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Scanning…' : 'Scan events'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : opts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCalendarStar} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No upcoming events!</p>
            <p className="text-sm mt-1">Click "Scan events" to detect holidays, sports events, and cultural events.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCalendarStar} />Events</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.eventCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-300 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold">Critical (≤3d)</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Est. revenue lift</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalRevenueLift)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-300 p-3 text-center">
                <div className="text-xs text-emerald-700 font-semibold">Net profit</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalNetProfit)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedOpts.map((o, idx) => {
                const style = RULE_STYLE[o.rule_id] ?? RULE_STYLE.holiday_menu;
                const dishes = parseDishes(o.suggested_dishes);
                const promos = parsePromos(o.suggested_promotions);
                const inventory = parseInventory(o.inventory_prep);
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[o.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className="font-medium text-lg">{o.event_name}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${o.days_until_event <= 3 ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-amber-100 text-amber-700'}`}>
                            {o.days_until_event === 0 ? 'TODAY' : o.days_until_event === 1 ? 'TOMORROW' : `in ${o.days_until_event}d`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Traffic: <strong className="text-rose-600">{o.est_traffic_multiplier}×</strong></span>
                          <span className="text-neutral-500">Net: <strong className="text-emerald-600">{withCurrency(o.net_profit)}</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{o.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Financial grid */}
                      <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">Revenue lift</div>
                          <div className="font-bold tabular-nums text-emerald-600">{withCurrency(o.est_revenue_lift)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Extra cost</div>
                          <div className="font-bold tabular-nums text-rose-600">{withCurrency(o.est_extra_cost)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Net profit</div>
                          <div className="font-bold tabular-nums text-emerald-600">{withCurrency(o.net_profit)}</div>
                        </div>
                      </div>

                      {/* Suggested dishes */}
                      {dishes.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-neutral-500 mb-1"><FontAwesomeIcon icon={faUtensils} className="mr-1" />Suggested dishes:</div>
                          <div className="space-y-1">
                            {dishes.map((d, i) => (
                              <div key={i} className="flex items-center justify-between text-xs bg-amber-50 p-2 rounded">
                                <div>
                                  <span className="font-medium">{d.name}</span>
                                  <span className="text-neutral-500 ml-2">— {d.reason}</span>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">Prep {d.prepMultiplier}×</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Promotions */}
                      {promos.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-neutral-500 mb-1"><FontAwesomeIcon icon={faBullhorn} className="mr-1" />Promotions:</div>
                          <div className="flex flex-wrap gap-1">
                            {promos.map((p, i) => <span key={i} className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700">{p}</span>)}
                          </div>
                        </div>
                      )}

                      {/* Inventory prep */}
                      {inventory.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-neutral-500 mb-1"><FontAwesomeIcon icon={faBoxOpen} className="mr-1" />Inventory prep:</div>
                          <div className="flex flex-wrap gap-1">
                            {inventory.map((inv, i) => <span key={i} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">{inv.item}: {inv.extraQty}</span>)}
                          </div>
                        </div>
                      )}

                      {/* Staffing */}
                      {o.staffing_recommendation && (
                        <div className="mb-3 p-2 rounded bg-amber-50 border border-amber-100">
                          <p className="text-xs text-amber-700"><FontAwesomeIcon icon={faUsers} className="mr-1" /><strong>Staffing:</strong> {o.staffing_recommendation}</p>
                        </div>
                      )}

                      {/* AI insight */}
                      {o.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{o.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => o.id && handleStatus(o.id, 'prepared')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Prepared
                        </button>
                        <button onClick={() => o.id && handleStatus(o.id, 'executed')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          Executed
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookahead: <strong>{config.lookaheadDays}d</strong></span>
              <span>Min multiplier: <strong>{config.minMultiplier}×</strong></span>
              <span>Avg daily revenue: <strong>{withCurrency(config.avgDailyRevenue)}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default EventMenuScreen;
