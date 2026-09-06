/**
 * AI Color Scheme & Interior Palette Optimizer — predicts how interior color
 * scheme (wall paint color, accent colors, furniture color, brand color
 * consistency, color psychology, color temperature, contrast, color zone
 * differentiation) impacts customer mood, perceived restaurant quality, dwell
 * time, spend, and brand perception.
 *
 * 167th POSR-exclusive differentiator.
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
  faPalette, faRotate, faDroplet, faMagnifyingGlass,
  faUtensils, faFire, faLayerGroup, faMoon, faSun,
  faFillDrip, faBrush, faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runColorSchemeEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readColorSchemeConfig, DEFAULT_COLOR_SCHEME_CONFIG,
  type ColorSchemeAlert,
} from "@/lib/color-scheme-palette.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  color_cuisine_mismatch:               { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faUtensils,         label: 'CUISINE MISMATCH' },
  color_psychology_wrong_for_concept:   { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faFire,             label: 'PSYCH WRONG' },
  color_inconsistency_across_zones:     { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faLayerGroup,       label: 'INCONSISTENT' },
  color_too_dark_unwelcoming:           { bg: 'bg-slate-50',    text: 'text-slate-700',    icon: faMoon,             label: 'TOO DARK' },
  color_too_bright_cafeteria:           { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faSun,              label: 'CAFETERIA' },
  accent_color_missing:                 { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faFillDrip,         label: 'NO ACCENT' },
  brand_color_not_integrated:           { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faPalette,          label: 'BRAND MISSING' },
  color_fading_wear:                    { bg: 'bg-stone-50',    text: 'text-stone-700',    icon: faBrush,            label: 'FADED PAINT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function ColorSchemePaletteScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ColorSchemeAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, locationsAtRisk: 0, cuisineMismatchZones: 0, fadedPaintZones: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_COLOR_SCHEME_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readColorSchemeConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[color-scheme-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runColorSchemeEngine(db, config);
      toast.success(`Analyzed ${result.generated} color scheme signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[color-scheme-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[color-scheme-report] status failed', err);
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
      <DocumentTitle parts={["AI Color Scheme & Interior Palette Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faPalette} className="text-rose-500" />
              AI Color Scheme &amp; Interior Palette Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how interior color scheme + palette (wall paint color, accent colors, brand color consistency, color psychology, color temperature, cross-zone palette unity, brightness, paint wear) impact customer mood + perceived quality + dwell + spend + brand perception — 85% cite color as primary atmosphere factor (Institute for Color Research); red increases appetite 15-20% but reduces dwell 12%; blue/green extend dwell 18-22%; color inconsistency = 25% perceived quality drop; 62% associate colors with cuisine type
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faPalette} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze palette'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faUtensils} label="Cuisine mismatch zones" value={String(summary.cuisineMismatchZones)} color={summary.cuisineMismatchZones > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faBrush} label="Faded paint zones" value={String(summary.fadedPaintZones)} color={summary.fadedPaintZones > 0 ? 'text-stone-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Locations at risk" value={String(summary.locationsAtRisk)} color={summary.locationsAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faPalette} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faPalette} spin className="text-4xl mb-3" />
            <p>Analyzing color scheme &amp; interior palette opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No color scheme/palette alerts</p>
            <p className="text-sm mt-1">Wall paint colors match cuisine type, color psychology aligned with concept, palette unified across zones, wall lightness in healthy range, accent colors present, brand colors integrated, paint fade score above 75, paint age under 36 months.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faPalette, label: alert.rule_id.toUpperCase() };
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
                          {alert.location_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.location_id}</span>
                          )}
                          {alert.cuisine_type && (
                            <span className="text-xs text-neutral-500">{alert.cuisine_type}</span>
                          )}
                          {alert.concept_type && (
                            <span className="text-xs text-neutral-500">{alert.concept_type}</span>
                          )}
                          {alert.wall_paint_color && (
                            <span className="text-xs text-neutral-600 font-medium">{alert.wall_paint_color}</span>
                          )}
                          {alert.accent_color_present != null && (
                            <span className={`text-xs ${!alert.accent_color_present ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.accent_color_present ? `${alert.accent_color_count ?? 0} accents` : 'no accent'}</span>
                          )}
                          {alert.brand_color_integrated != null && (
                            <span className={`text-xs ${!alert.brand_color_integrated ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>brand {alert.brand_color_integrated ? 'integrated' : 'missing'}</span>
                          )}
                          {alert.brand_color_consistency_score != null && alert.brand_color_consistency_score > 0 && (
                            <span className={`text-xs ${alert.brand_color_consistency_score < 50 ? 'text-rose-600 font-medium' : alert.brand_color_consistency_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.brand_color_consistency_score}/100 brand</span>
                          )}
                          {alert.color_consistency_across_zones_score != null && alert.color_consistency_across_zones_score > 0 && (
                            <span className={`text-xs ${alert.color_consistency_across_zones_score < 50 ? 'text-rose-600 font-medium' : alert.color_consistency_across_zones_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.color_consistency_across_zones_score}/100 unified</span>
                          )}
                          {alert.color_palette_unified != null && !alert.color_palette_unified && (
                            <span className="text-xs text-amber-600 font-medium">palette split</span>
                          )}
                          {alert.wall_lightness_level != null && alert.wall_lightness_level > 0 && (
                            <span className={`text-xs ${alert.wall_lightness_level < 25 ? 'text-rose-600 font-medium' : alert.wall_lightness_level < 35 ? 'text-amber-600 font-medium' : alert.wall_lightness_level > 90 ? 'text-rose-600 font-medium' : alert.wall_lightness_level > 85 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.wall_lightness_level}/100 light</span>
                          )}
                          {alert.perceived_brightness_level && (
                            <span className="text-xs text-neutral-500">{alert.perceived_brightness_level}</span>
                          )}
                          {alert.color_temperature_kelvin != null && alert.color_temperature_kelvin > 0 && (
                            <span className={`text-xs ${alert.color_temperature_kelvin >= 5000 ? 'text-sky-600 font-medium' : alert.color_temperature_kelvin <= 3000 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.color_temperature_kelvin}K</span>
                          )}
                          {alert.wall_paint_fade_score != null && alert.wall_paint_fade_score > 0 && (
                            <span className={`text-xs ${alert.wall_paint_fade_score < 40 ? 'text-rose-600 font-medium' : alert.wall_paint_fade_score < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.wall_paint_fade_score}/100 fade</span>
                          )}
                          {alert.wall_paint_age_months != null && alert.wall_paint_age_months > 0 && (
                            <span className={`text-xs ${alert.wall_paint_age_months > 48 ? 'text-rose-600 font-medium' : alert.wall_paint_age_months > 36 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.wall_paint_age_months}mo old</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_mood_change != null && alert.predicted_mood_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_mood_change}% mood</span>
                          )}
                          {alert.perceived_quality_change != null && alert.perceived_quality_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_quality_change}% quality</span>
                          )}
                          {alert.predicted_dwell_change != null && alert.predicted_dwell_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_dwell_change}% dwell</span>
                          )}
                          {alert.predicted_spend_change != null && alert.predicted_spend_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_spend_change}% spend</span>
                          )}
                          {alert.brand_perception_change != null && alert.brand_perception_change < 0 && (
                            <span className="text-rose-600">{alert.brand_perception_change}% brand</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faMagnifyingGlass} className="mt-0.5 shrink-0" />
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
          <span>Cuisine match: <span className={config.requireCuisineColorMatch ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCuisineColorMatch ? 'required' : 'optional'}</span></span>
          <span>Min brand consistency: {config.minBrandColorConsistencyScore}/100</span>
          <span>Min cross-zone unity: {config.minColorConsistencyAcrossZones}/100</span>
          <span>Unified palette: <span className={config.requireUnifiedPalette ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireUnifiedPalette ? 'required' : 'optional'}</span></span>
          <span>Wall lightness: {config.minWallLightnessLevel}-{config.maxWallLightnessLevel}</span>
          <span>Accent color: <span className={config.requireAccentColor ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireAccentColor ? 'required' : 'optional'}</span></span>
          <span>Min accent count: {config.minAccentColorCount}</span>
          <span>Brand color: <span className={config.requireBrandColorIntegrated ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireBrandColorIntegrated ? 'required' : 'optional'}</span></span>
          <span>Min paint fade: {config.minWallPaintFadeScore}/100</span>
          <span>Max paint age: {config.maxWallPaintAgeMonths} months</span>
          <span className="text-neutral-400">167th POSR-exclusive differentiator</span>
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

export default ColorSchemePaletteScreen;
