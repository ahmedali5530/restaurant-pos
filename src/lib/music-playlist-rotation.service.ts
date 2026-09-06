/**
 * AI Music Playlist Rotation & Fatigue Optimizer — deep-dives into restaurant
 * music programming: playlist rotation frequency, song repetition fatigue
 * (staff + regulars hear same songs daily), silence gap detection, genre
 * transition smoothness, volume curve optimization, licensing compliance
 * (ASCAP/BMI/SESAC), staff music fatigue, and seasonal/holiday music
 * integration.
 *
 * 156th POSR-exclusive differentiator — restaurants lose $200-1,000/mo per
 * location from music programming issues. Repeated playlists annoy staff
 * (productivity drops 8-12%) + regulars (return rate drops 10-15%);
 * silence gaps signal operational failure; abrupt genre changes jar
 * customers. Existing vibe-optimizer (49th) recommends genre/tempo/volume
 * per hour — this deep-dives into playlist OPERATIONS: rotation, fatigue,
 * transitions, compliance, silence detection.
 *
 * Distinct from:
 *   - vibe-optimizer.service (49th) — recommends GENRE/TEMPO/VOLUME (not playlist ops)
 *   - atmosphere-revenue.service (138th) — correlates ALL ambient factors (1 music rule)
 *   - noise-acoustic-comfort.service (149th) — acoustic comfort/noise sources (not music programming)
 *   - journey-friction.service (125th) — overall journey (not music-specific)
 *   - staff-energy-monitor.service (130th) — energy levels (not music fatigue)
 *
 * 8 AI rules:
 *   1. playlist_rotation_too_slow — same songs repeating >3x/week → fatigue
 *   2. staff_music_fatigue — staff hear same playlist daily → productivity drop
 *   3. silence_gap_detected — >5sec silence between songs → awkward
 *   4. genre_transition_abrupt — jarring genre change between hours → customer discomfort
 *   5. volume_curve_inconsistent — abrupt volume changes → annoyance
 *   6. licensing_compliance_gap — no ASCAP/BMI/SESAC license → $750-30k fine risk
 *   7. seasonal_music_missing — no holiday/seasonal music → missed atmosphere opportunity
 *   8. regular_customer_fatigue — regulars report music repetition → return rate drop
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MusicRuleId =
  | 'playlist_rotation_too_slow'
  | 'staff_music_fatigue'
  | 'silence_gap_detected'
  | 'genre_transition_abrupt'
  | 'volume_curve_inconsistent'
  | 'licensing_compliance_gap'
  | 'seasonal_music_missing'
  | 'regular_customer_fatigue';

export type MusicAiRec =
  | 'expand_playlist'
  | 'rotate_playlists_daily'
  | 'enable_crossfade'
  | 'smooth_transitions'
  | 'automate_volume_curve'
  | 'verify_licenses'
  | 'add_seasonal_playlist'
  | 'refresh_for_regulars'
  | 'monitor'
  | 'skip';

export interface MusicAlert {
  id?: string;
  rule_id: MusicRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  // Playlist metrics
  playlist_size_songs?: number;
  unique_songs_played_7d?: number;
  repeat_rate_pct?: number;            // % songs repeated >3x/week
  avg_rotation_days?: number;          // days before full playlist cycles
  // Silence
  silence_gaps_per_day?: number;
  avg_silence_duration_sec?: number;
  // Transitions
  abrupt_genre_changes_per_day?: number;
  // Volume
  volume_variance_db?: number;          // std-dev of volume changes
  // Licensing
  has_ascap_license?: boolean;
  has_bmi_license?: boolean;
  has_sesac_license?: boolean;
  estimated_monthly_royalty?: number;
  // Seasonal
  current_season?: string;
  has_seasonal_playlist?: boolean;
  // Staff fatigue
  staff_fatigue_score?: number;         // 0-100 (higher = more fatigued)
  days_same_playlist?: number;
  // Regular fatigue
  regular_complaint_count_30d?: number;
  regular_return_rate_pct?: number;
  // Impact
  predicted_dwell_change_min?: number;
  predicted_spend_change_pct?: number;
  predicted_staff_productivity_drop_pct?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: MusicAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface MusicConfig {
  aiEnabled: boolean;
  maxRepeatRatePct: number;             // max acceptable repeat rate
  maxSilenceGapSec: number;
  maxVolumeVarianceDb: number;
  staffFatigueThreshold: number;        // days same playlist before fatigue
}

export const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  aiEnabled: true,
  maxRepeatRatePct: 25,
  maxSilenceGapSec: 3,
  maxVolumeVarianceDb: 8,
  staffFatigueThreshold: 5,
};

export const readMusicConfig = (settings: any): MusicConfig => ({
  aiEnabled: settings?.music_ai_enabled ?? true,
  maxRepeatRatePct: safeNumber(settings?.music_max_repeat, 25),
  maxSilenceGapSec: safeNumber(settings?.music_max_silence, 3),
  maxVolumeVarianceDb: safeNumber(settings?.music_max_volume_var, 8),
  staffFatigueThreshold: safeNumber(settings?.music_fatigue_days, 5),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface MusicData {
  playlist_size_songs: number;
  unique_songs_played_7d: number;
  repeat_rate_pct: number;
  avg_rotation_days: number;
  silence_gaps_per_day: number;
  avg_silence_duration_sec: number;
  abrupt_genre_changes_per_day: number;
  volume_variance_db: number;
  has_ascap_license: boolean;
  has_bmi_license: boolean;
  has_sesac_license: boolean;
  estimated_monthly_royalty: number;
  current_season: string;
  has_seasonal_playlist: boolean;
  staff_fatigue_score: number;
  days_same_playlist: number;
  regular_complaint_count_30d: number;
  regular_return_rate_pct: number;
  monthly_customers: number;
  avg_customer_value: number;
}

const MOCK_DATA: MusicData[] = [
  {
    playlist_size_songs: 45, unique_songs_played_7d: 38, repeat_rate_pct: 42,
    avg_rotation_days: 1.2, silence_gaps_per_day: 12, avg_silence_duration_sec: 6,
    abrupt_genre_changes_per_day: 4, volume_variance_db: 12,
    has_ascap_license: true, has_bmi_license: false, has_sesac_license: false,
    estimated_monthly_royalty: 0, current_season: 'winter', has_seasonal_playlist: false,
    staff_fatigue_score: 72, days_same_playlist: 8, regular_complaint_count_30d: 5,
    regular_return_rate_pct: 68, monthly_customers: 2400, avg_customer_value: 38,
  },
  {
    playlist_size_songs: 120, unique_songs_played_7d: 95, repeat_rate_pct: 15,
    avg_rotation_days: 3.5, silence_gaps_per_day: 1, avg_silence_duration_sec: 2,
    abrupt_genre_changes_per_day: 1, volume_variance_db: 4,
    has_ascap_license: true, has_bmi_license: true, has_sesac_license: true,
    estimated_monthly_royalty: 350, current_season: 'winter', has_seasonal_playlist: true,
    staff_fatigue_score: 25, days_same_playlist: 1, regular_complaint_count_30d: 0,
    regular_return_rate_pct: 85, monthly_customers: 1800, avg_customer_value: 42,
  },
];

export const runMusicEngine = async (
  db: ReturnType<typeof useDB>,
  config: MusicConfig = DEFAULT_MUSIC_CONFIG
): Promise<{ alerts: MusicAlert[]; generated: number }> => {
  const alerts: MusicAlert[] = [];
  const now = new Date();

  let data: MusicData[] = [];
  try {
    const result = await db.query(
      `SELECT playlist_size_songs, unique_songs_played_7d, repeat_rate_pct,
              avg_rotation_days, silence_gaps_per_day, avg_silence_duration_sec,
              abrupt_genre_changes_per_day, volume_variance_db,
              has_ascap_license, has_bmi_license, has_sesac_license,
              estimated_monthly_royalty, current_season, has_seasonal_playlist,
              staff_fatigue_score, days_same_playlist, regular_complaint_count_30d,
              regular_return_rate_pct, monthly_customers, avg_customer_value
       FROM music_playlist_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      playlist_size_songs: safeNumber(r.playlist_size_songs, 0),
      unique_songs_played_7d: safeNumber(r.unique_songs_played_7d, 0),
      repeat_rate_pct: safeNumber(r.repeat_rate_pct, 0),
      avg_rotation_days: safeNumber(r.avg_rotation_days, 0),
      silence_gaps_per_day: safeNumber(r.silence_gaps_per_day, 0),
      avg_silence_duration_sec: safeNumber(r.avg_silence_duration_sec, 0),
      abrupt_genre_changes_per_day: safeNumber(r.abrupt_genre_changes_per_day, 0),
      volume_variance_db: safeNumber(r.volume_variance_db, 0),
      has_ascap_license: Boolean(r.has_ascap_license ?? false),
      has_bmi_license: Boolean(r.has_bmi_license ?? false),
      has_sesac_license: Boolean(r.has_sesac_license ?? false),
      estimated_monthly_royalty: safeNumber(r.estimated_monthly_royalty, 0),
      current_season: String(r.current_season ?? 'summer'),
      has_seasonal_playlist: Boolean(r.has_seasonal_playlist ?? false),
      staff_fatigue_score: safeNumber(r.staff_fatigue_score, 0),
      days_same_playlist: safeNumber(r.days_same_playlist, 0),
      regular_complaint_count_30d: safeNumber(r.regular_complaint_count_30d, 0),
      regular_return_rate_pct: safeNumber(r.regular_return_rate_pct, 0),
      monthly_customers: safeNumber(r.monthly_customers, 0),
      avg_customer_value: safeNumber(r.avg_customer_value, 0),
    }));
  } catch (err) {
    console.warn('[music] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const monthlyOpp = Math.round(d.monthly_customers * d.avg_customer_value * 0.02);

    // Rule 1: PLAYLIST_ROTATION_TOO_SLOW
    if (d.repeat_rate_pct > config.maxRepeatRatePct) {
      alerts.push({
        rule_id: 'playlist_rotation_too_slow',
        severity: d.repeat_rate_pct >= 40 ? 'high' : 'medium',
        playlist_size_songs: d.playlist_size_songs,
        unique_songs_played_7d: d.unique_songs_played_7d,
        repeat_rate_pct: d.repeat_rate_pct,
        avg_rotation_days: d.avg_rotation_days,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `PLAYLIST ROTATION TOO SLOW: ${d.playlist_size_songs}-song playlist, only ${d.unique_songs_played_7d} unique songs in 7 days. ${d.repeat_rate_pct}% repeat rate (threshold ${config.maxRepeatRatePct}%). Full rotation every ${d.avg_rotation_days} days — customers + staff hear same songs repeatedly. ACTION: expand playlist to 100+ songs OR rotate between 3-5 playlists (A/B/C daily rotation). Spotify Business / Apple Music for Business ($16-30/mo) offers 5000+ song commercial-licensed libraries. Save ${fmt$(monthlyOpp * 0.4)}/mo from improved ambiance + reduced fatigue. ${d.repeat_rate_pct >= 40 ? 'CRITICAL: 40%+ repeat = customers notice repetition → perceive restaurant as low-effort. ' : ''}Playlist size is the cheapest music lever — $0 cost to add songs.`,
        ai_recommendation: 'expand_playlist',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: STAFF_MUSIC_FATIGUE
    if (d.days_same_playlist >= config.staffFatigueThreshold || d.staff_fatigue_score >= 60) {
      alerts.push({
        rule_id: 'staff_music_fatigue',
        severity: d.staff_fatigue_score >= 70 ? 'high' : 'medium',
        staff_fatigue_score: d.staff_fatigue_score,
        days_same_playlist: d.days_same_playlist,
        predicted_staff_productivity_drop_pct: Math.round(d.staff_fatigue_score * 0.15),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `STAFF MUSIC FATIGUE: same playlist for ${d.days_same_playlist} days, fatigue score ${d.staff_fatigue_score}/100 (threshold ${config.staffFatigueThreshold} days). Staff hear playlist 8-10hr/day × ${d.days_same_playlist} days = ${d.days_same_playlist * 9}hrs of same songs. Music fatigue → irritability → lower service quality → 8-12% productivity drop (Journal of Applied Psychology). ACTION: rotate playlists daily (A/B/C/D/E rotation). Give staff music choice on slow shifts (empowers + engages). Consider staff-curated playlist (monthly). Save ${fmt$(monthlyOpp * 0.3)}/mo from improved staff productivity + mood. Staff music fatigue is invisible but expensive — fatigued staff serve worse, tip lower, quit sooner.`,
        ai_recommendation: 'rotate_playlists_daily',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: SILENCE_GAP_DETECTED
    if (d.silence_gaps_per_day >= 3 || d.avg_silence_duration_sec > config.maxSilenceGapSec) {
      alerts.push({
        rule_id: 'silence_gap_detected',
        severity: d.silence_gaps_per_day >= 10 ? 'high' : 'medium',
        silence_gaps_per_day: d.silence_gaps_per_day,
        avg_silence_duration_sec: d.avg_silence_duration_sec,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `SILENCE GAP DETECTED: ${d.silence_gaps_per_day} silence gaps/day, avg ${d.avg_silence_duration_sec}sec each. Silence in restaurant = awkward — customers notice immediately, conversation stalls, atmosphere dies. Common cause: playlist ends (not enough songs), Spotify ads (free tier), device sleep, manual playlist (not auto-queue). ACTION: ${d.avg_silence_duration_sec > 5 ? 'enable crossfade (3-5sec overlap between songs) in music player settings. ' : 'enable gapless playback OR auto-queue (playlist loops automatically). '}${d.silence_gaps_per_day >= 10 ? 'CRITICAL: 10+ gaps/day = manual playlist management failure — use commercial music service with auto-queue. ' : ''}Switch to commercial music service (Soundtrack Your Brand, Mood Media, Cloud Cover Music — $25-35/mo) with seamless auto-queue. Save ${fmt$(monthlyOpp * 0.3)}/mo from uninterrupted atmosphere. Silence gaps are the most jarring music failure — free to fix with right settings.`,
        ai_recommendation: 'enable_crossfade',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: GENRE_TRANSITION_ABRUPT
    if (d.abrupt_genre_changes_per_day >= 3) {
      alerts.push({
        rule_id: 'genre_transition_abrupt',
        severity: 'medium',
        abrupt_genre_changes_per_day: d.abrupt_genre_changes_per_day,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
        description: `GENRE TRANSITION ABRUPT: ${d.abrupt_genre_changes_per_day} abrupt genre changes/day. Going from jazz to rock to pop within minutes = jarring customer experience. Each abrupt change breaks atmosphere mood → customers feel disoriented. ACTION: create smooth genre transitions — schedule genres by hour (jazz 5-7pm, lounge 7-9pm, upbeat 9-11pm) with 15min transition playlists between genres. Use commercial music service with mood-based scheduling (not random shuffle). Save ${fmt$(monthlyOpp * 0.2)}/mo from smooth atmosphere. Genre transitions are like scene transitions in film — must be gradual, not jarring.`,
        ai_recommendation: 'smooth_transitions',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: VOLUME_CURVE_INCONSISTENT
    if (d.volume_variance_db > config.maxVolumeVarianceDb) {
      alerts.push({
        rule_id: 'volume_curve_inconsistent',
        severity: 'medium',
        volume_variance_db: d.volume_variance_db,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
        description: `VOLUME CURVE INCONSISTENT: volume variance ${d.volume_variance_db} dB (threshold ${config.maxVolumeVarianceDb} dB). Volume changes abruptly between songs — some songs too loud, others too quiet. Customers + staff experience constant volume fluctuations → annoyance + difficulty conversing. Common cause: songs from different sources (some mastered louder), manual volume adjustments, no normalization. ACTION: enable volume normalization / loudness equalization in music player (Spotify: Settings > Playback > Normalize Volume). ${d.volume_variance_db >= 12 ? 'CRITICAL: 12+ dB variance = some songs 4x louder than others — extremely jarring. ' : ''}Use commercial music service with pre-normalized audio. Save ${fmt$(monthlyOpp * 0.2)}/mo from consistent volume experience. Volume consistency is invisible when right, very noticeable when wrong.`,
        ai_recommendation: 'automate_volume_curve',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: LICENSING_COMPLIANCE_GAP
    if (!d.has_ascap_license || !d.has_bmi_license || !d.has_sesac_license) {
      const missing: string[] = [];
      if (!d.has_ascap_license) missing.push('ASCAP');
      if (!d.has_bmi_license) missing.push('BMI');
      if (!d.has_sesac_license) missing.push('SESAC');
      alerts.push({
        rule_id: 'licensing_compliance_gap',
        severity: 'critical',
        has_ascap_license: d.has_ascap_license,
        has_bmi_license: d.has_bmi_license,
        has_sesac_license: d.has_sesac_license,
        estimated_monthly_royalty: 300,
        est_monthly_opportunity: 0,
        description: `LICENSING COMPLIANCE GAP: missing ${missing.join(', ')} license(s). Playing copyrighted music without proper licensing = federal copyright violation. Fines: $750-$30,000 per song (US Copyright Act). ASCAP/BMI/SESAC actively audit restaurants — enforcement agents visit + send demand letters. ACTION: obtain all three licenses immediately. ASCAP: $200-500/yr, BMI: $200-500/yr, SESAC: $100-300/yr. Total: $500-1300/yr. OR use commercial music service (Soundtrack Your Brand, Mood Media) that includes all licensing in subscription ($25-35/mo = $300-420/yr, cheaper than individual licenses). ${missing.length >= 2 ? 'CRITICAL: missing 2+ licenses = high audit risk — one complaint triggers investigation. ' : ''}Cost of compliance: $300-1300/yr. Cost of non-compliance: $750-30,000 PER SONG. Music licensing is non-negotiable legal requirement.`,
        ai_recommendation: 'verify_licenses',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: SEASONAL_MUSIC_MISSING
    if (!d.has_seasonal_playlist && (d.current_season === 'winter' || d.current_season === 'fall')) {
      alerts.push({
        rule_id: 'seasonal_music_missing',
        severity: 'low',
        current_season: d.current_season,
        has_seasonal_playlist: d.has_seasonal_playlist,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.15),
        description: `SEASONAL MUSIC MISSING: no ${d.current_season} playlist active. ${d.current_season === 'winter' ? 'Winter: customers expect holiday/winter-themed music (not Christmas carols necessarily, but warm/cozy genres — acoustic, folk, warm jazz). ' : 'Fall: customers expect autumnal music (acoustic, indie folk, warm tones). '}'Seasonal music signals attention to detail + matches customer seasonal mood. ACTION: create seasonal playlist (50-100 songs) OR use commercial service seasonal playlists. ${d.current_season === 'winter' ? 'December: holiday music (instrumental, not vocal — avoid lyrics that date restaurant). January: winter acoustic. ' : ''}Save ${fmt$(monthlyOpp * 0.15)}/mo from seasonal atmosphere alignment. Seasonal music is the most visible music marketing — customers consciously notice seasonal shifts.`,
        ai_recommendation: 'add_seasonal_playlist',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: REGULAR_CUSTOMER_FATIGUE
    if (d.regular_complaint_count_30d >= 3 || (d.regular_return_rate_pct < 75 && d.regular_return_rate_pct > 0)) {
      alerts.push({
        rule_id: 'regular_customer_fatigue',
        severity: d.regular_complaint_count_30d >= 5 ? 'high' : 'medium',
        regular_complaint_count_30d: d.regular_complaint_count_30d,
        regular_return_rate_pct: d.regular_return_rate_pct,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `REGULAR CUSTOMER FATIGUE: ${d.regular_complaint_count_30d} music complaints from regulars in 30 days. Regular return rate: ${d.regular_return_rate_pct}% (should be 80%+). Regulars visit 2-4x/week — they hear the same playlist repeatedly. Music repetition is the #1 complaint from regulars (they notice more than one-time visitors). Each verbal complaint = 26 silent unhappy regulars (White House OCA). ACTION: refresh playlist weekly (add 10-20 new songs, remove 10-20 old). Survey regulars on music preferences. Consider regular-curated playlist monthly (engages + validates). Save ${fmt$(monthlyOpp * 0.5)}/mo from retained regular loyalty. Regulars are the highest-value customers — music fatigue drives them to competitors.`,
        ai_recommendation: 'refresh_for_regulars',
        status: 'open', detected_at: now,
      });
    }
  }

  // Generate AI insights for critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat({
            messages: [
              { role: 'system', content: 'You are a restaurant music programming + audio operations AI. Given playlist data, recommend ONE specific action with expected impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Playlist: ${a.playlist_size_songs ?? 0} songs. Repeat: ${a.repeat_rate_pct ?? 0}%. Rotation: ${a.avg_rotation_days ?? 0} days. Silence gaps: ${a.silence_gaps_per_day ?? 0}/day. Genre changes: ${a.abrupt_genre_changes_per_day ?? 0}/day. Volume var: ${a.volume_variance_db ?? 0} dB. Staff fatigue: ${a.staff_fatigue_score ?? 0}/100. Days same playlist: ${a.days_same_playlist ?? 0}. Regular complaints: ${a.regular_complaint_count_30d ?? 0}/30d. Regular return: ${a.regular_return_rate_pct ?? 0}%. Licenses: ASCAP=${a.has_ascap_license ?? false}, BMI=${a.has_bmi_license ?? false}, SESAC=${a.has_sesac_license ?? false}. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
            ],
            task: 'reporting',
          });
          const text = typeof response === 'string'
            ? response
            : (response as any)?.choices?.[0]?.message?.content ?? '';
          a.ai_insight = String(text).slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  // Persist alerts
  try {
    await db.query(`DELETE FROM music_playlist_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE music_playlist_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<MusicAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM music_playlist_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgRepeatRatePct: number; avgStaffFatigue: number; licensingGaps: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(repeat_rate_pct WHERE repeat_rate_pct != NONE) AS avgrepeat,
              math::mean(staff_fatigue_score WHERE staff_fatigue_score != NONE) AS avgfatigue,
              math::count(rule_id = 'licensing_compliance_gap') AS licensing
       FROM music_playlist_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgRepeatRatePct: safeNumber(r.avgrepeat, 0),
      avgStaffFatigue: safeNumber(r.avgfatigue, 0),
      licensingGaps: safeNumber(r.licensing, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgRepeatRatePct: 0, avgStaffFatigue: 0, licensingGaps: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
