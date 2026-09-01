/**
 * AI Sommelier Wine Pairing Engine — flavor-science wine recommendations.
 *
 * 60th POSR-exclusive differentiator — wine pairing increases avg ticket 18-25%.
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
  faWineGlass, faRotate, faLightbulb, faCheckCircle,
  faStar, faCoins, faArrowTrendUp, faUtensils,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runWineEngine, getActivePairings, getSummary, updatePairingStatus,
  readWineConfig, DEFAULT_WINE_CONFIG,
  type WinePairing,
} from "@/lib/wine-pairing.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  classic_match:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faStar,          label: 'CLASSIC' },
  contrast_pairing:     { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faWineGlass,     label: 'CONTRAST' },
  budget_friendly:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCoins,         label: 'BUDGET' },
  premium_upsell:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowTrendUp,  label: 'PREMIUM' },
  inventory_clearance:  { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faWineGlass,     label: 'CLEARANCE' },
};

const WINE_TYPE_ICON: Record<string, string> = {
  red: '🍷', white: '🥂', rose: '🌸', sparkling: '✨', dessert: '🍮', fortified: '🍶',
};

const PRICE_TIER_STYLE: Record<string, string> = {
  budget: 'bg-emerald-100 text-emerald-700',
  mid: 'bg-amber-100 text-amber-700',
  premium: 'bg-rose-100 text-rose-700',
  luxury: 'bg-purple-100 text-purple-700',
};

const parseFlavorProfile = (json?: string): { acid: number; fat: number; spice: number; sweet: number; umami: number } => {
  if (!json) return { acid: 0, fat: 0, spice: 0, sweet: 0, umami: 0 };
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed : { acid: 0, fat: 0, spice: 0, sweet: 0, umami: 0 };
  } catch {
    return { acid: 0, fat: 0, spice: 0, sweet: 0, umami: 0 };
  }
};

const scoreColor = (score: number): string => {
  if (score >= 85) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-rose-600';
};

export function WinePairingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [pairings, setPairings] = useState<WinePairing[]>([]);
  const [summary, setSummary] = useState({ pairingsCount: 0, classicCount: 0, avgPairingScore: 0, totalRevenueLift: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_WINE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWineConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePairings(db), getSummary(db)]);
      setPairings(list); setSummary(sum);
    } catch (err) { console.error('[wine-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runWineEngine(db, config);
      toast.success(result.pairings.length > 0
        ? `Generated ${result.pairings.length} wine pairings — ${result.pairings.filter(p => p.rule_id === 'classic_match').length} classic matches, avg score ${(result.pairings.reduce((s, p) => s + p.pairing_score, 0) / result.pairings.length).toFixed(0)}/100`
        : `No pairings generated — need dishes with pricing`);
      await reload();
    } catch (err) { console.error('[wine-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (pairingId: string, status: 'added' | 'trained' | 'declined') => {
    try { await updatePairingStatus(db, pairingId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedPairings = [...pairings].sort((a, b) => b.pairing_score - a.pairing_score);

  return (
    <Layout>
      <DocumentTitle parts={["Wine Pairing", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWineGlass} className="text-rose-600" />
              AI Sommelier
            </h1>
            <p className="text-sm text-neutral-500">
              Flavor-science wine pairing — 18-25% avg ticket increase (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Pairing…' : 'Generate pairings'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : pairings.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWineGlass} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No wine pairings yet!</p>
            <p className="text-sm mt-1">Click "Generate pairings" to match wines to dishes using flavor science.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faWineGlass} />Pairings</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.pairingsCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faStar} />Classic matches</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.classicCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg score</div>
                <div className={`text-2xl font-bold tabular-nums ${scoreColor(summary.avgPairingScore)}`}>{summary.avgPairingScore.toFixed(0)}/100</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Est. revenue lift</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalRevenueLift)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedPairings.map((p, idx) => {
                const style = RULE_STYLE[p.rule_id] ?? RULE_STYLE.classic_match;
                const flavor = parseFlavorProfile(p.dish_flavor_profile);
                const wineIcon = WINE_TYPE_ICON[p.wine_type ?? 'red'] ?? '🍷';
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className="font-medium"><FontAwesomeIcon icon={faUtensils} className="mr-1 text-neutral-400" />{p.dish_name}</span>
                          <span className="text-amber-500">+</span>
                          <span className="text-xl">{wineIcon}</span>
                          <span className="font-medium text-rose-700">{p.recommended_wine}</span>
                          {p.price_tier && (
                            <span className={`text-xs px-2 py-0.5 rounded capitalize ${PRICE_TIER_STYLE[p.price_tier] ?? PRICE_TIER_STYLE.mid}`}>
                              {p.price_tier}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Dish: <strong className="text-amber-600">{withCurrency(p.dish_price)}</strong></span>
                          <span className="text-neutral-500">Wine: <strong className="text-rose-600">{withCurrency(p.wine_price ?? 0)}</strong></span>
                          <span className="text-neutral-500">Score: <strong className={scoreColor(p.pairing_score)}>{p.pairing_score}/100</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{p.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Flavor profile */}
                      <div className="mb-3">
                        <div className="text-xs text-neutral-500 mb-1">Dish flavor profile:</div>
                        <div className="grid grid-cols-5 gap-2">
                          {Object.entries(flavor).map(([key, val]) => (
                            <div key={key} className="text-center">
                              <div className="text-xs text-neutral-400 capitalize">{key}</div>
                              <div className="flex justify-center gap-0.5">
                                {[1,2,3,4,5].map(n => (
                                  <div key={n} className={`w-2 h-3 rounded-sm ${n <= val ? 'bg-rose-400' : 'bg-neutral-100'}`} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Pairing logic */}
                      {p.pairing_logic && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-100">
                          <p className="text-xs text-violet-700"><strong>Why it works:</strong> {p.pairing_logic}</p>
                        </div>
                      )}

                      {/* Server pitch */}
                      {p.server_pitch && (
                        <div className="mb-3 p-2 rounded bg-amber-50 border border-amber-100">
                          <p className="text-xs text-amber-800 italic"><strong>Server pitch:</strong> {p.server_pitch}</p>
                        </div>
                      )}

                      {/* AI insight */}
                      {p.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{p.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => p.id && handleStatus(p.id, 'added')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Add to menu
                        </button>
                        <button onClick={() => p.id && handleStatus(p.id, 'trained')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Train staff
                        </button>
                        <button onClick={() => p.id && handleStatus(p.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Default tier: <strong className="capitalize">{config.defaultPriceTier}</strong></span>
              <span>Min score: <strong>{config.pairingThreshold}/100</strong></span>
              <span>Upsell target: <strong>{(config.upsellTargetPct * 100).toFixed(0)}%</strong> of dish price</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default WinePairingScreen;
