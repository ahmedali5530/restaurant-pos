/**
 * AI Sound System & Speaker Placement Optimizer — predicts how sound system
 * hardware and speaker placement (speaker quality, count, positioning,
 * subwoofer, zone volume control, amplifier, Bluetooth vs wired, ceiling
 * vs wall) impacts audio quality consistency, customer experience, and
 * perceived restaurant quality.
 *
 * 176th POSR-exclusive differentiator.
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
  faVolumeHigh, faRotate, faTowerBroadcast, faMusic, faWaveSquare,
  faGaugeHigh, faSignal, faVolumeOff, faRadio,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runSoundSystemEngine, getActiveSoundSystemAlerts, getSoundSystemSummary,
  updateSoundSystemAlertStatus, readSoundSystemConfig, DEFAULT_SOUND_SYSTEM_CONFIG,
  type SoundSystemAlert,
} from "@/lib/sound-system-speaker.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  single_speaker_setup:              { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faVolumeOff,       label: 'SINGLE SPEAKER' },
  speaker_count_insufficient:        { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faTowerBroadcast,  label: 'INSUFFICIENT SPEAKERS' },
  speaker_placement_dead_zones:      { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faWaveSquare,      label: 'DEAD ZONES' },
  consumer_grade_equipment:          { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faRadio,           label: 'CONSUMER EQUIPMENT' },
  zone_volume_control_absent:        { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faGaugeHigh,       label: 'NO ZONE CONTROL' },
  bluetooth_instead_of_wired:        { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faSignal,          label: 'BLUETOOTH' },
  subwoofer_absent_or_misplaced:     { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faWaveSquare,      label: 'SUBWOOFER' },
  speaker_brand_tier_mismatch:       { bg: 'bg-red-50',      text: 'text-red-700',      icon: faMusic,           label: 'BRAND TIER MISMATCH' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function SoundSystemSpeakerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<SoundSystemAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, singleSpeakerCount: 0, insufficientSpeakerCount: 0, noZoneControl: 0, bluetoothCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SOUND_SYSTEM_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSoundSystemConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveSoundSystemAlerts(db), getSoundSystemSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[sound-system-speaker-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runSoundSystemEngine(db, config);
      toast.success(`Analyzed ${result.generated} sound system + speaker placement signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[sound-system-speaker-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateSoundSystemAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[sound-system-speaker-report] status failed', err);
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
      <DocumentTitle parts={["AI Sound System & Speaker Placement Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faVolumeHigh} className="text-sky-600" />
              AI Sound System &amp; Speaker Placement Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how sound system hardware and speaker placement (speaker quality, count, positioning, subwoofer, zone volume control, amplifier, Bluetooth vs wired, ceiling vs wall) impacts audio quality consistency + customer experience — 35% of seats have inconsistent audio (AES); single-speaker setups have 60% volume variance; consumer speakers last 2-3yr vs commercial 10-15yr; 72% notice sound quality not just music choice (Cornell CHR); Bluetooth has 40% latency; zone volume control delivers 25% satisfaction improvement; distinct from music-playlist-rotation (156th, optimizes WHAT plays) and noise-acoustic-comfort (149th, tracks noise SOURCES) — this optimizes PHYSICAL hardware + placement
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faVolumeHigh} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze sound system'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faVolumeOff} label="Single speaker setups" value={String(summary.singleSpeakerCount)} color={summary.singleSpeakerCount > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faGaugeHigh} label="No zone volume control" value={String(summary.noZoneControl)} color={summary.noZoneControl > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faSignal} label="Bluetooth connections" value={String(summary.bluetoothCount)} color={summary.bluetoothCount > 0 ? 'text-violet-600' : 'text-emerald-600'} />
          <SummaryCard icon={faVolumeHigh} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-emerald-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faVolumeHigh} spin className="text-4xl mb-3" />
            <p>Analyzing sound system + speaker placement opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No sound system / speaker placement alerts</p>
            <p className="text-sm mt-1">Multi-speaker distributed system deployed, sufficient speaker count for venue size, no dead zones, commercial-grade equipment, zone volume control active, wired connection throughout, subwoofer present and properly placed, speaker brand tier matches restaurant tier.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faVolumeHigh, label: alert.rule_id.toUpperCase() };
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
                          {alert.venue_size_sqft != null && alert.venue_size_sqft > 0 && (
                            <span className="text-xs text-neutral-500">{alert.venue_size_sqft} sqft</span>
                          )}
                          {alert.ceiling_height_ft != null && alert.ceiling_height_ft > 0 && (
                            <span className="text-xs text-neutral-500">{alert.ceiling_height_ft}ft ceiling</span>
                          )}
                          {alert.speaker_count != null && (
                            <span className={`text-xs ${alert.speaker_count <= 1 ? 'text-rose-600 font-medium' : alert.speaker_count < 4 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.speaker_count} speakers</span>
                          )}
                          {alert.speaker_type && (
                            <span className={`text-xs ${alert.speaker_type.startsWith('consumer') ? 'text-rose-600 font-medium' : alert.speaker_type === 'premium_commercial' ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.speaker_type}</span>
                          )}
                          {alert.speaker_positioning && (
                            <span className={`text-xs ${alert.speaker_positioning === 'one_corner' || alert.speaker_positioning === 'single_cluster' ? 'text-rose-600 font-medium' : alert.speaker_positioning === 'distributed_ceiling' ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.speaker_positioning}</span>
                          )}
                          {alert.connection_type && (
                            <span className={`text-xs ${alert.connection_type === 'bluetooth' || alert.connection_type === 'wifi_streaming' ? 'text-violet-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.connection_type}</span>
                          )}
                          {alert.speaker_brand_tier && (
                            <span className={`text-xs ${alert.speaker_brand_tier === 'consumer_mass' || alert.speaker_brand_tier === 'unknown_generic' ? 'text-rose-600 font-medium' : alert.speaker_brand_tier === 'audiophile_premium' || alert.speaker_brand_tier === 'commercial_pro' ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.speaker_brand_tier}</span>
                          )}
                          {alert.has_subwoofer != null && (
                            <span className={`text-xs ${alert.has_subwoofer ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_subwoofer ? 'has subwoofer' : 'NO subwoofer'}</span>
                          )}
                          {alert.has_zone_volume_control != null && (
                            <span className={`text-xs ${alert.has_zone_volume_control ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_zone_volume_control ? `zones (${alert.zone_count ?? 1})` : 'NO zone control'}</span>
                          )}
                          {alert.volume_variance_pct != null && alert.volume_variance_pct > 0 && (
                            <span className={`text-xs ${alert.volume_variance_pct > 40 ? 'text-rose-600 font-medium' : alert.volume_variance_pct > 15 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.volume_variance_pct}% variance</span>
                          )}
                          {alert.dead_zone_pct != null && alert.dead_zone_pct > 0 && (
                            <span className={`text-xs ${alert.dead_zone_pct > 25 ? 'text-rose-600 font-medium' : alert.dead_zone_pct > 10 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.dead_zone_pct}% dead zones</span>
                          )}
                          {alert.hot_spot_pct != null && alert.hot_spot_pct > 0 && (
                            <span className={`text-xs ${alert.hot_spot_pct > 10 ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.hot_spot_pct}% hot spots</span>
                          )}
                          {alert.audio_quality_score != null && alert.audio_quality_score > 0 && (
                            <span className={`text-xs ${alert.audio_quality_score < 50 ? 'text-rose-600 font-medium' : alert.audio_quality_score < 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.audio_quality_score}/100 audio</span>
                          )}
                          {alert.bass_response_score != null && alert.bass_response_score > 0 && (
                            <span className={`text-xs ${alert.bass_response_score < 45 ? 'text-rose-600 font-medium' : alert.bass_response_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.bass_response_score}/100 bass</span>
                          )}
                          {alert.perceived_quality_score != null && alert.perceived_quality_score > 0 && (
                            <span className={`text-xs ${alert.perceived_quality_score < 50 ? 'text-rose-600 font-medium' : alert.perceived_quality_score < 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.perceived_quality_score}/100 perceived</span>
                          )}
                          {alert.equipment_age_years != null && alert.equipment_age_years > 0 && (
                            <span className="text-xs text-neutral-500">{alert.equipment_age_years}yr old</span>
                          )}
                          {alert.equipment_lifespan_years != null && alert.equipment_lifespan_years > 0 && (
                            <span className={`text-xs ${alert.equipment_lifespan_years <= 2 ? 'text-rose-600 font-medium' : alert.equipment_lifespan_years <= 5 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.equipment_lifespan_years}yr left</span>
                          )}
                          {alert.replacement_cost_estimate != null && alert.replacement_cost_estimate > 0 && (
                            <span className="text-xs text-sky-600 font-medium">${alert.replacement_cost_estimate} replacement</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.volume_variance_change != null && alert.volume_variance_change < 0 && (
                            <span className="text-emerald-600">{alert.volume_variance_change}% volume variance (improvement)</span>
                          )}
                          {alert.dead_zone_change != null && alert.dead_zone_change < 0 && (
                            <span className="text-emerald-600">{alert.dead_zone_change}% dead zones (improvement)</span>
                          )}
                          {alert.audio_quality_change != null && alert.audio_quality_change > 0 && (
                            <span className="text-emerald-600">+{alert.audio_quality_change} audio quality</span>
                          )}
                          {alert.satisfaction_change != null && alert.satisfaction_change > 0 && (
                            <span className="text-emerald-600">+{alert.satisfaction_change}% satisfaction</span>
                          )}
                          {alert.perceived_quality_change != null && alert.perceived_quality_change > 0 && (
                            <span className="text-emerald-600">+{alert.perceived_quality_change}% perceived quality</span>
                          )}
                          {alert.competitive_diff_change != null && alert.competitive_diff_change > 0 && (
                            <span className="text-emerald-600">+{alert.competitive_diff_change}% competitive diff</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faVolumeHigh} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo opportunity</div>
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
          <span>Multi-speaker distributed: <span className={config.requireMultiSpeakerDistributed ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMultiSpeakerDistributed ? 'required' : 'optional'}</span></span>
          <span>Min speakers/1,000 sqft: {config.minSpeakersPer1000sqft}</span>
          <span>Max volume variance: {config.maxVolumeVariancePct}%</span>
          <span>Max dead zones: {config.maxDeadZonePct}%</span>
          <span>Commercial-grade: <span className={config.requireCommercialGrade ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCommercialGrade ? 'required' : 'optional'}</span></span>
          <span>Zone volume control: <span className={config.requireZoneVolumeControl ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireZoneVolumeControl ? 'required' : 'optional'}</span></span>
          <span>Wired connection: <span className={config.requireWiredConnection ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireWiredConnection ? 'required' : 'optional'}</span></span>
          <span>Subwoofer: <span className={config.requireSubwoofer ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireSubwoofer ? 'required' : 'optional'}</span></span>
          <span>Brand tier match: <span className={config.requireBrandTierMatch ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireBrandTierMatch ? 'required' : 'optional'}</span></span>
          <span>Min audio quality: {config.minAudioQualityScore}/100</span>
          <span>Min coverage consistency: {config.minCoverageConsistencyScore}/100</span>
          <span>Min bass response: {config.minBassResponseScore}/100</span>
          <span className="text-neutral-400">176th POSR-exclusive differentiator</span>
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

export default SoundSystemSpeakerScreen;
