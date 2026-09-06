/**
 * AI Music Playlist Rotation & Fatigue Optimizer — deep-dives into restaurant
 * music programming: playlist rotation, staff fatigue, silence gaps, genre
 * transitions, volume curves, licensing compliance, seasonal music.
 *
 * 156th POSR-exclusive differentiator.
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
  faMusic, faRotate, faListOl, faUserGroup, faVolumeXmark,
  faShuffle, faGaugeHigh, faFileShield, faSnowflake, faUsers,
  faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runMusicEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readMusicConfig, DEFAULT_MUSIC_CONFIG,
  type MusicAlert,
} from "@/lib/music-playlist-rotation.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  playlist_rotation_too_slow:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faListOl,         label: 'ROTATION SLOW' },
  staff_music_fatigue:            { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faUserGroup,      label: 'STAFF FATIGUE' },
  silence_gap_detected:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faVolumeXmark,    label: 'SILENCE' },
  genre_transition_abrupt:        { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faShuffle,        label: 'GENRE ABRUPT' },
  volume_curve_inconsistent:      { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faGaugeHigh,      label: 'VOLUME' },
  licensing_compliance_gap:       { bg: 'bg-red-50',     text: 'text-red-700',     icon: faFileShield,     label: 'LICENSING' },
  seasonal_music_missing:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faSnowflake,      label: 'SEASONAL' },
  regular_customer_fatigue:       { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faUsers,          label: 'REGULAR FATIGUE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MusicPlaylistRotationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MusicAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgRepeatRatePct: 0, avgStaffFatigue: 0, licensingGaps: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MUSIC_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMusicConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[music-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMusicEngine(db, config);
      toast.success(`Analyzed ${result.generated} music signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[music-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[music-report] status failed', err);
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
      <DocumentTitle parts={["AI Music Playlist", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faMusic} className="text-violet-500" />
              AI Music Playlist Rotation & Fatigue Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Deep-dives into playlist rotation, staff fatigue, silence gaps, licensing compliance
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faMusic} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze music'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faListOl} label="Avg repeat rate" value={`${summary.avgRepeatRatePct.toFixed(0)}%`} color={summary.avgRepeatRatePct >= 25 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faUserGroup} label="Avg staff fatigue" value={`${summary.avgStaffFatigue.toFixed(0)}/100`} color={summary.avgStaffFatigue >= 60 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faFileShield} label="Licensing gaps" value={String(summary.licensingGaps)} color={summary.licensingGaps > 0 ? 'text-red-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faMusic} spin className="text-4xl mb-3" />
            <p>Analyzing music playlist rotation + fatigue patterns…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No music alerts</p>
            <p className="text-sm mt-1">Playlist well-rotated, no fatigue, licensing compliant.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faMusic, label: alert.rule_id.toUpperCase() };
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
                          {alert.playlist_size_songs != null && (
                            <span className="text-xs text-neutral-500">{alert.playlist_size_songs} songs</span>
                          )}
                          {alert.repeat_rate_pct != null && (
                            <span className={`text-xs font-bold ${alert.repeat_rate_pct >= 40 ? 'text-rose-600' : alert.repeat_rate_pct >= 25 ? 'text-amber-600' : 'text-emerald-600'}`}>{alert.repeat_rate_pct}% repeat</span>
                          )}
                          {alert.silence_gaps_per_day != null && alert.silence_gaps_per_day > 0 && (
                            <span className="text-xs text-rose-600">{alert.silence_gaps_per_day} silence gaps/day</span>
                          )}
                          {alert.staff_fatigue_score != null && (
                            <span className={`text-xs ${alert.staff_fatigue_score >= 60 ? 'text-violet-600 font-medium' : 'text-neutral-500'}`}>fatigue {alert.staff_fatigue_score}/100</span>
                          )}
                          {alert.days_same_playlist != null && alert.days_same_playlist > 0 && (
                            <span className="text-xs text-amber-600">{alert.days_same_playlist}d same playlist</span>
                          )}
                          {alert.volume_variance_db != null && (
                            <span className={`text-xs ${alert.volume_variance_db >= 10 ? 'text-sky-600 font-medium' : 'text-neutral-500'}`}>{alert.volume_variance_db} dB variance</span>
                          )}
                          {alert.regular_complaint_count_30d != null && alert.regular_complaint_count_30d > 0 && (
                            <span className="text-xs text-fuchsia-600 font-medium">{alert.regular_complaint_count_30d} regular complaints/30d</span>
                          )}
                          {alert.has_ascap_license != null && (!alert.has_ascap_license || !alert.has_bmi_license || !alert.has_sesac_license) && (
                            <span className="text-xs text-red-600 font-bold">LICENSING GAP</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.avg_rotation_days != null && (
                            <span>rotation: <span className="text-neutral-700">{alert.avg_rotation_days} days</span></span>
                          )}
                          {alert.predicted_staff_productivity_drop_pct != null && alert.predicted_staff_productivity_drop_pct > 0 && (
                            <span className="text-rose-600">−{alert.predicted_staff_productivity_drop_pct}% productivity</span>
                          )}
                          {alert.regular_return_rate_pct != null && alert.regular_return_rate_pct > 0 && (
                            <span>regular return: <span className={alert.regular_return_rate_pct < 75 ? 'text-rose-600 font-medium' : 'text-emerald-600'}>{alert.regular_return_rate_pct}%</span></span>
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
                        <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_monthly_opportunity)}</div>
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
          <span>Max repeat: {config.maxRepeatRatePct}%</span>
          <span>Max silence: {config.maxSilenceGapSec}sec</span>
          <span>Max volume var: {config.maxVolumeVarianceDb} dB</span>
          <span>Staff fatigue: {config.staffFatigueThreshold} days</span>
          <span className="text-neutral-400">156th POSR-exclusive differentiator</span>
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

export default MusicPlaylistRotationScreen;
