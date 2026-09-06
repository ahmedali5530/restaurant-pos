/**
 * AI Wall Decor & Artwork Impact Optimizer — predicts how wall decor
 * (artwork, murals, photographs, typography, brand graphics, empty walls,
 * seasonal decor) impacts customer satisfaction, perceived restaurant
 * quality, dwell time, and Instagram/photo sharing (free marketing).
 *
 * 159th POSR-exclusive differentiator.
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
  faImage, faRotate, faPalette, faCamera, faBrush,
  faCalendarXmark, faImages, faLightbulb, faPerson,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runWallDecorEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readWallDecorConfig, DEFAULT_WALL_DECOR_CONFIG,
  type WallDecorAlert,
} from "@/lib/wall-decor-artwork.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  empty_wall_detected:            { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faImage,           label: 'EMPTY WALL' },
  artwork_brand_mismatch:          { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faPalette,         label: 'BRAND MISMATCH' },
  photo_opportunity_wall_missing:  { bg: 'bg-violet-50',  text: 'text-violet-700',   icon: faCamera,          label: 'PHOTO WALL MISSING' },
  artwork_fading_wear:             { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faBrush,           label: 'FADING WEAR' },
  seasonal_decor_stale:            { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faCalendarXmark,   label: 'STALE SEASONAL' },
  wall_art_inconsistency:          { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faImages,          label: 'INCONSISTENCY' },
  artwork_lighting_poor:           { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faLightbulb,       label: 'POOR LIGHTING' },
  local_artist_opportunity:        { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faPerson,          label: 'LOCAL ARTIST' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function WallDecorArtworkScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<WallDecorAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, emptyWalls: 0, avgConditionScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_WALL_DECOR_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWallDecorConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[wall-decor-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runWallDecorEngine(db, config);
      toast.success(`Analyzed ${result.generated} wall decor signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[wall-decor-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[wall-decor-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_opportunity ?? 0) - (a.est_monthly_opportunity ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Wall Decor & Artwork", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faImage} className="text-violet-500" />
              AI Wall Decor & Artwork Impact Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how wall art impacts satisfaction, dwell time, and Instagram sharing — 78% of customers notice wall decor within 30 seconds
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faImage} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze wall decor'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faImage} label="Empty walls" value={String(summary.emptyWalls)} color={summary.emptyWalls > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faBrush} label="Avg condition" value={`${summary.avgConditionScore.toFixed(0)}/100`} color={summary.avgConditionScore < 70 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Zones at risk" value={String(summary.zonesAtRisk)} color={summary.zonesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faImage} spin className="text-4xl mb-3" />
            <p>Analyzing wall decor & artwork opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No wall decor alerts</p>
            <p className="text-sm mt-1">Wall decor & artwork optimized across all zones.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faImage, label: alert.rule_id.toUpperCase() };
              return (
                <div key={alert.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {alert.zone && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.zone}</span>
                          )}
                          {alert.decor_type && (
                            <span className="text-xs">
                              <span className="text-rose-600">{alert.decor_type}</span>
                              {alert.recommended_decor_type && (
                                <>
                                  <span className="text-neutral-400 mx-1">→</span>
                                  <span className="text-emerald-600 font-medium">{alert.recommended_decor_type}</span>
                                </>
                              )}
                            </span>
                          )}
                          {alert.cuisine_type && (
                            <span className="text-xs text-amber-600 uppercase">{alert.cuisine_type}</span>
                          )}
                          {alert.current_season && (
                            <span className="text-xs text-emerald-600 uppercase">{alert.current_season}</span>
                          )}
                          {alert.condition_score != null && alert.condition_score > 0 && (
                            <span className={`text-xs ${alert.condition_score < 40 ? 'text-rose-600 font-medium' : alert.condition_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.condition_score}/100 condition</span>
                          )}
                          {alert.cuisine_match_score != null && alert.cuisine_match_score > 0 && (
                            <span className={`text-xs ${alert.cuisine_match_score < 65 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.cuisine_match_score}/100 match</span>
                          )}
                          {alert.style_consistency_score != null && alert.style_consistency_score > 0 && (
                            <span className={`text-xs ${alert.style_consistency_score < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.style_consistency_score}/100 consistent</span>
                          )}
                          {alert.artwork_lighting_lux != null && alert.artwork_lighting_lux > 0 && (
                            <span className={`text-xs ${alert.artwork_lighting_lux < 150 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.artwork_lighting_lux} lux</span>
                          )}
                          {alert.instagram_post_rate_pct != null && (
                            <span className={`text-xs ${alert.instagram_post_rate_pct < 5 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.instagram_post_rate_pct}% post</span>
                          )}
                          {alert.seasonal_decor_age_days != null && alert.seasonal_decor_age_days > 0 && (
                            <span className="text-xs text-amber-600 font-medium">{alert.seasonal_decor_age_days}d old</span>
                          )}
                          {alert.has_local_artist_feature && (
                            <span className="text-xs text-emerald-600 font-medium">local artist</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_dwell_change_min != null && alert.predicted_dwell_change_min > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_dwell_change_min}min dwell</span>
                          )}
                          {alert.predicted_spend_change_pct != null && alert.predicted_spend_change_pct > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_spend_change_pct}% spend</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_satisfaction_change} satisfaction</span>
                          )}
                          {alert.predicted_instagram_posts_per_mo != null && alert.predicted_instagram_posts_per_mo > 0 && (
                            <span className="text-violet-600">+{alert.predicted_instagram_posts_per_mo} posts/mo</span>
                          )}
                          {alert.target_lighting_lux != null && alert.artwork_lighting_lux != null && alert.artwork_lighting_lux < alert.target_lighting_lux && (
                            <span>target: <span className="text-emerald-600 font-medium">{alert.target_lighting_lux} lux</span></span>
                          )}
                          {alert.artwork_age_months != null && alert.artwork_age_months > 0 && (
                            <span>{alert.artwork_age_months}mo old</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo at risk</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Action taken
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> In progress
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Min condition: {config.minConditionScore}/100</span>
          <span>Min cuisine match: {config.minCuisineMatchScore}/100</span>
          <span>Min consistency: {config.minStyleConsistency}/100</span>
          <span>Min artwork lighting: {config.minArtworkLightingLux} lux</span>
          <span>Max seasonal age: {config.maxSeasonalDecorAgeDays}d</span>
          <span className="text-neutral-400">159th POSR-exclusive differentiator</span>
        </div>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center gap-3">
      <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default WallDecorArtworkScreen;
