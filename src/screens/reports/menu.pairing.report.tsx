/**
 * Menu Pairing Engine Dashboard — market basket analysis + AI suggestions.
 *
 * 16th POSR-exclusive differentiator — Toast and Square have STATIC add-on
 * config. POSR generates DYNAMIC pairing suggestions from co-purchase patterns.
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
  faUtensils, faLink, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faCopy, faChartBar,
  faArrowRight, faStar, faBullseye, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPairingAnalysis,
  getMenuPairings,
  getPairingSummary,
  readPairingConfig,
  DEFAULT_PAIRING_CONFIG,
  type MenuPairing,
  type PairingTier,
} from "@/lib/menu-pairing.service.ts";

const TIER_STYLE: Record<PairingTier, { bg: string; text: string; border: string; label: string; icon: any }> = {
  classic:     { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-400',   label: 'Classic (top pair)', icon: faStar },
  strong:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Strong correlation', icon: faLink },
  opportunity: { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-400',  label: 'Opportunity (untapped)', icon: faBullseye },
};

export function MenuPairingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [pairings, setPairings] = useState<MenuPairing[]>([]);
  const [summary, setSummary] = useState({
    total: 0, opportunity: 0, strong: 0, classic: 0, totalRevenueLift: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_PAIRING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPairingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getMenuPairings(db),
        getPairingSummary(db),
      ]);
      setPairings(list);
      setSummary(sum);
    } catch (err) {
      console.error('[pairing-report] reload failed', err);
      toast.error('Failed to load pairings');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await runPairingAnalysis(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.pairings.length > 0
          ? `Analyzed ${result.analyzed} orders — found ${result.pairings.length} pairings (${withCurrency(result.pairings.reduce((s, p) => s + p.est_revenue_lift, 0))}/mo potential lift)`
          : `Analyzed ${result.analyzed} orders — no significant pairings found`
      );
      await reload();
    } catch (err) {
      console.error('[pairing-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleCopyPitch = useCallback((text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast.success('Pitch script copied'));
  }, []);

  return (
    <Layout>
      <DocumentTitle parts={["Menu Pairing Engine", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLink} className="text-violet-600" />
              Menu Pairing Engine
            </h1>
            <p className="text-sm text-neutral-500">
              AI market basket analysis — co-purchase patterns + staff pitch scripts (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Run analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading pairings…</p>
          </div>
        ) : pairings.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No pairings yet!</p>
            <p className="text-sm mt-1">Click "Run analysis" to discover co-purchase patterns.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Opportunities</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.opportunity}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Strong</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.strong}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Classic</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.classic}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Total pairs</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Monthly lift potential</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalRevenueLift)}</div>
              </div>
            </div>

            {/* Pairing list */}
            <div className="space-y-3">
              {pairings.map((pairing, idx) => {
                const style = TIER_STYLE[pairing.tier] ?? TIER_STYLE.opportunity;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    {/* Top row: pair visualization */}
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-xs text-neutral-500">Primary</div>
                            <span className="font-semibold">{pairing.primary_item_name}</span>
                            {pairing.primary_category && <span className="text-xs text-neutral-400 ml-1">({pairing.primary_category})</span>}
                          </div>
                          <FontAwesomeIcon icon={faArrowRight} className="text-neutral-400" />
                          <div>
                            <div className="text-xs text-neutral-500">Pairs with</div>
                            <span className="font-semibold">{pairing.paired_item_name}</span>
                            {pairing.paired_category && <span className="text-xs text-neutral-400 ml-1">({pairing.paired_category})</span>}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Est. monthly lift</div>
                        <div className="font-bold text-emerald-600 tabular-nums">{withCurrency(pairing.est_revenue_lift)}</div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex gap-4 text-xs text-neutral-600 mb-2 bg-white/60 rounded p-2">
                      <span><FontAwesomeIcon icon={faChartBar} className="mr-1 text-neutral-400" />Confidence: <strong className="tabular-nums">{(pairing.confidence * 100).toFixed(1)}%</strong></span>
                      <span>Lift: <strong className="tabular-nums">{pairing.lift.toFixed(2)}×</strong></span>
                      <span>Support: <strong className="tabular-nums">{(pairing.support * 100).toFixed(2)}%</strong></span>
                      <span>Co-occurrence: <strong className="tabular-nums">{pairing.co_occurrence_count}</strong></span>
                      <span>Primary sales: <strong className="tabular-nums">{pairing.primary_count}</strong></span>
                    </div>

                    {/* AI reasoning */}
                    {pairing.ai_reasoning && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{pairing.ai_reasoning}
                        </p>
                      </div>
                    )}

                    {/* AI pitch script */}
                    {pairing.ai_pitch_script && (
                      <div className="bg-emerald-50 rounded p-2 mb-2 border border-emerald-200">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-emerald-700">
                            <FontAwesomeIcon icon={faUtensils} className="mr-1" />Staff pitch script:
                          </span>
                          <button
                            onClick={() => handleCopyPitch(pairing.ai_pitch_script)}
                            className="text-xs text-emerald-700 hover:text-emerald-900"
                            title="Copy pitch script"
                          >
                            <FontAwesomeIcon icon={faCopy} /> Copy
                          </button>
                        </div>
                        <p className="text-xs text-emerald-800 font-medium">"{pairing.ai_pitch_script}"</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min support: <strong>{config.minSupport} orders</strong></span>
              <span>Min confidence: <strong>{(config.minConfidence * 100).toFixed(0)}%</strong></span>
              <span>Min lift: <strong>{config.minLift}×</strong></span>
              <span>Max results: <strong>{config.maxResults}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default MenuPairingScreen;
