/**
 * AI Mirror & Reflective Surface Optimizer — predicts how mirrors and
 * reflective surfaces (wall mirrors, reflective panels, polished surfaces,
 * mirror placement, mirror size, reflective ceiling elements, decorative
 * mirrors) impact spatial perception, lighting amplification, customer
 * psychology, perceived spaciousness, and potential negative effects (glare,
 * unflattering angles, reflecting undesirable areas).
 *
 * 170th POSR-exclusive differentiator — MILESTONE.
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
  faClone, faRotate, faImage, faMaximize, faExpandArrowsAlt,
  faMagnifyingGlass, faBolt, faWindowMaximize, faEye,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runMirrorReflectiveEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readMirrorReflectiveConfig, DEFAULT_MIRROR_REFLECTIVE_CONFIG,
  type MirrorReflectiveAlert,
} from "@/lib/mirror-reflective-surface.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  mirror_absent_small_space:           { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faMaximize,           label: 'MIRROR ABSENT' },
  mirror_reflecting_undesirable_area:  { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faEye,                label: 'UNDESIRABLE REFLECTION' },
  mirror_causing_glare:                { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faBolt,               label: 'GLARE' },
  mirror_dirty_smudged:                { bg: 'bg-stone-50',    text: 'text-stone-700',    icon: faImage,              label: 'DIRTY MIRROR' },
  mirror_size_wrong:                   { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faExpandArrowsAlt,    label: 'SIZE WRONG' },
  mirror_placement_poor:               { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faMagnifyingGlass,    label: 'POOR PLACEMENT' },
  reflective_surface_overuse:          { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faClone,              label: 'OVERUSE' },
  mirror_opposite_window_opportunity:  { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faWindowMaximize,     label: 'WINDOW OPPORTUNITY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MirrorReflectiveSurfaceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MirrorReflectiveAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, locationsAtRisk: 0, mirrorsAbsentZones: 0, undesirableReflectionZones: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MIRROR_REFLECTIVE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMirrorReflectiveConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[mirror-reflective-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMirrorReflectiveEngine(db, config);
      toast.success(`Analyzed ${result.generated} mirror + reflective surface signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[mirror-reflective-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[mirror-reflective-report] status failed', err);
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
      <DocumentTitle parts={["AI Mirror & Reflective Surface Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClone} className="text-violet-600" />
              AI Mirror &amp; Reflective Surface Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how mirrors + reflective surfaces (wall mirrors, reflective panels, polished surfaces, mirror placement, mirror size, reflective ceiling, decorative mirrors) impact spatial perception, lighting amplification, customer psychology, perceived spaciousness — mirrors make small restaurants feel 30-40% larger (ASID); double natural light effect; 55% feel more comfortable with mirrors; poorly placed mirrors reflect undesirable areas; mirrors increase photo-taking 20-25%
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faClone} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze mirrors'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faMaximize} label="Mirror-absent zones" value={String(summary.mirrorsAbsentZones)} color={summary.mirrorsAbsentZones > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faEye} label="Undesirable reflections" value={String(summary.undesirableReflectionZones)} color={summary.undesirableReflectionZones > 0 ? 'text-orange-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Locations at risk" value={String(summary.locationsAtRisk)} color={summary.locationsAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faClone} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faClone} spin className="text-4xl mb-3" />
            <p>Analyzing mirror + reflective surface opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No mirror/reflective surface alerts</p>
            <p className="text-sm mt-1">Mirrors present in small spaces, no undesirable reflections, no glare, mirrors clean, sizes balanced, placement visible, reflective surfaces within threshold, mirror opposite window for light amplification.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faClone, label: alert.rule_id.toUpperCase() };
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
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.restaurant_size_sqft != null && alert.restaurant_size_sqft > 0 && (
                            <span className={`text-xs ${alert.is_small_space ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.restaurant_size_sqft} sqft{alert.is_small_space ? ' · small' : ''}</span>
                          )}
                          {alert.mirror_count != null && (
                            <span className={`text-xs ${alert.mirror_count === 0 ? 'text-rose-600 font-medium' : 'text-neutral-600 font-medium'}`}>{alert.mirror_count} mirror{alert.mirror_count === 1 ? '' : 's'}</span>
                          )}
                          {alert.mirror_size_category && alert.mirror_size_category !== 'none' && (
                            <span className={`text-xs ${alert.mirror_size_category === 'small' || (alert.is_small_space && alert.mirror_size_category === 'wall_to_wall') ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.mirror_size_category} size</span>
                          )}
                          {alert.mirror_placement_quality_score != null && alert.mirror_placement_quality_score > 0 && (
                            <span className={`text-xs ${alert.mirror_placement_quality_score < 40 ? 'text-rose-600 font-medium' : alert.mirror_placement_quality_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.mirror_placement_quality_score}/100 placement</span>
                          )}
                          {alert.mirror_visible_to_customers != null && (
                            <span className={`text-xs ${alert.mirror_visible_to_customers ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.mirror_visible_to_customers ? 'visible' : 'not visible'}</span>
                          )}
                          {alert.reflected_area && alert.reflected_area !== 'none' && (
                            <span className={`text-xs ${['kitchen', 'restroom', 'trash', 'empty_wall'].includes(alert.reflected_area) ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>reflects {alert.reflected_area}</span>
                          )}
                          {alert.mirror_causing_glare != null && alert.mirror_causing_glare && (
                            <span className="text-xs text-rose-600 font-medium">glare from {alert.glare_source ?? 'source'}</span>
                          )}
                          {alert.mirror_cleanliness_score != null && alert.mirror_cleanliness_score > 0 && (
                            <span className={`text-xs ${alert.mirror_cleanliness_score < 50 ? 'text-rose-600 font-medium' : alert.mirror_cleanliness_score < 80 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.mirror_cleanliness_score}/100 clean</span>
                          )}
                          {alert.mirror_dirty_smudged != null && alert.mirror_dirty_smudged && (
                            <span className="text-xs text-rose-600 font-medium">dirty/smudged</span>
                          )}
                          {alert.reflective_surface_count != null && alert.reflective_surface_count > 0 && (
                            <span className={`text-xs ${alert.reflective_surface_count > 6 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.reflective_surface_count} reflective</span>
                          )}
                          {alert.has_window != null && alert.has_window && (
                            <span className={`text-xs ${alert.mirror_opposite_window ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>window {alert.mirror_opposite_window ? '· mirror opposite' : '· no mirror opposite'}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.perceived_spaciousness_change != null && alert.perceived_spaciousness_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_spaciousness_change}% spaciousness</span>
                          )}
                          {alert.customer_satisfaction_change != null && alert.customer_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.customer_satisfaction_change}% satisfaction</span>
                          )}
                          {alert.predicted_dwell_change != null && alert.predicted_dwell_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_dwell_change}% dwell</span>
                          )}
                          {alert.energy_savings_change != null && alert.energy_savings_change < 0 && (
                            <span className="text-rose-600">{alert.energy_savings_change}% energy savings</span>
                          )}
                          {alert.photo_frequency_change != null && alert.photo_frequency_change < 0 && (
                            <span className="text-rose-600">{alert.photo_frequency_change}% photo-taking</span>
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
          <span>Min placement score: {config.minMirrorPlacementScore}/100</span>
          <span>Min cleanliness: {config.minMirrorCleanlinessScore}/100</span>
          <span>Small space threshold: {config.smallSpaceThresholdSqft} sqft</span>
          <span>Mirror in small spaces: <span className={config.requireMirrorInSmallSpaces ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMirrorInSmallSpaces ? 'required' : 'optional'}</span></span>
          <span>Min mirror count (small): {config.minMirrorCountForSmallSpace}</span>
          <span>Max reflective surfaces: {config.maxReflectiveSurfaceCount}</span>
          <span>Mirror opposite window: <span className={config.requireMirrorOppositeWindow ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMirrorOppositeWindow ? 'required' : 'optional'}</span></span>
          <span>Visible to customers: <span className={config.requireMirrorsVisibleToCustomers ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMirrorsVisibleToCustomers ? 'required' : 'optional'}</span></span>
          <span>Clean mirrors: <span className={config.requireCleanMirrors ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCleanMirrors ? 'required' : 'optional'}</span></span>
          <span>No undesirable reflections: <span className={config.requireNoUndesirableReflections ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireNoUndesirableReflections ? 'required' : 'optional'}</span></span>
          <span>No glare: <span className={config.requireNoGlare ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireNoGlare ? 'required' : 'optional'}</span></span>
          <span className="text-neutral-400">170th POSR-exclusive differentiator — MILESTONE</span>
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

export default MirrorReflectiveSurfaceScreen;
