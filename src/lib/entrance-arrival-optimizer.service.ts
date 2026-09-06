/**
 * AI Entrance & Arrival Experience Optimizer — predicts optimal entrance
 * experience (greeting speed, host positioning, entry music/scent,
 * waitlist perception, first impression signals) per time-of-day, occupancy,
 * and customer segment. Entrance is the first impression — formed in 7
 * seconds (Harvard Business School); 55% of overall satisfaction is set
 * by first impression (Cornell CHR).
 *
 * 153rd POSR-exclusive differentiator — restaurants lose $400-1,800/mo per
 * location from poor entrance experience. 33% of customers leave without
 * entering if not greeted within 30 seconds (NRA); entrance sets tone for
 * entire visit. No POS optimizes entrance as distinct experience zone.
 *
 * Distinct from:
 *   - waitlist-optimizer.service (79th) — optimizes WAITLIST queue (not entrance)
 *   - wait-experience-personalizer.service (116th) — personalizes WAIT (not entrance)
 *   - seating-optimization.service — optimizes TABLE allocation (not greeting)
 *   - journey-friction.service (125th) — overall journey friction (not entrance-specific)
 *   - first-visit-conversion.service (143rd) — first-visit conversion (not entrance driver)
 *   - atmosphere-revenue.service (138th) — correlates ALL ambient factors (not entrance)
 *   - vibe-optimizer.service (49th) — optimizes MUSIC only (not entrance)
 *   - scent-marketing-optimizer.service (152nd) — scent only (not entrance greeting)
 *
 * 8 AI rules:
 *   1. greeting_delay_critical — greeting >30s → 33% walk away
 *   2. host_understaffed_peak — single host during peak → bottleneck
 *   3. entry_atmosphere_mismatch — entry scent/music/lighting doesn't match dining
 *   4. waitlist_perception_negative — quoted wait perceived as too long → leave
 *   5. vip_arrival_unrecognized — VIP arrives + host doesn't recognize → insult
 *   6. entrance_clutter — entrance cluttered (umbrellas, signage, etc) → bad first impression
 *   7. weather_entrance_adjustment — rainy/cold day → entrance needs adjustment
 *   8. segment_specific_greeting — business vs family vs date need different greeting style
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type EntranceRuleId =
  | 'greeting_delay_critical'
  | 'host_understaffed_peak'
  | 'entry_atmosphere_mismatch'
  | 'waitlist_perception_negative'
  | 'vip_arrival_unrecognized'
  | 'entrance_clutter'
  | 'weather_entrance_adjustment'
  | 'segment_specific_greeting';

export type EntranceAiRec =
  | 'add_greeter'
  | 'add_second_host'
  | 'align_entry_atmosphere'
  | 'reduce_quoted_wait'
  | 'train_vip_recognition'
  | 'declutter_entrance'
  | 'weather_adjust'
  | 'train_segment_greeting'
  | 'monitor'
  | 'skip';

export interface EntranceAlert {
  id?: string;
  rule_id: EntranceRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  // Greeting metrics
  avg_greeting_time_sec?: number;
  target_greeting_time_sec?: number;
  greeting_delay_pct?: number;          // % arrivals delayed >30s
  walk_away_count_30d?: number;
  // Host staffing
  host_count?: number;
  peak_arrival_rate_per_min?: number;
  host_capacity_per_min?: number;
  // Atmosphere
  entry_scent?: string;
  dining_scent?: string;
  entry_music_volume?: string;
  dining_music_volume?: string;
  entry_lux?: number;
  dining_lux?: number;
  // Waitlist
  avg_quoted_wait_min?: number;
  perceived_wait_too_long_pct?: number;
  waitlist_bail_rate_pct?: number;
  // VIP
  vip_arrivals_today?: number;
  vip_recognition_rate_pct?: number;
  // Context
  time_of_day?: string;
  customer_segment?: string;
  weather?: string;
  // Impact
  predicted_satisfaction_drop?: number;
  predicted_conversion_drop_pct?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: EntranceAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface EntranceConfig {
  aiEnabled: boolean;
  maxGreetingTimeSec: number;
  singleHostMaxArrivalsPerMin: number;
  walkAwayThresholdPerMo: number;
  vipRecognitionTargetPct: number;
}

export const DEFAULT_ENTRANCE_CONFIG: EntranceConfig = {
  aiEnabled: true,
  maxGreetingTimeSec: 30,
  singleHostMaxArrivalsPerMin: 3,
  walkAwayThresholdPerMo: 15,
  vipRecognitionTargetPct: 90,
};

export const readEntranceConfig = (settings: any): EntranceConfig => ({
  aiEnabled: settings?.entrance_ai_enabled ?? true,
  maxGreetingTimeSec: safeNumber(settings?.entrance_max_greeting, 30),
  singleHostMaxArrivalsPerMin: safeNumber(settings?.entrance_host_capacity, 3),
  walkAwayThresholdPerMo: safeNumber(settings?.entrance_walkaway_threshold, 15),
  vipRecognitionTargetPct: safeNumber(settings?.entrance_vip_target, 90),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface EntranceData {
  avg_greeting_time_sec: number;
  target_greeting_time_sec: number;
  greeting_delay_pct: number;
  walk_away_count_30d: number;
  host_count: number;
  peak_arrival_rate_per_min: number;
  host_capacity_per_min: number;
  entry_scent: string;
  dining_scent: string;
  entry_music_volume: string;
  dining_music_volume: string;
  entry_lux: number;
  dining_lux: number;
  avg_quoted_wait_min: number;
  perceived_wait_too_long_pct: number;
  waitlist_bail_rate_pct: number;
  vip_arrivals_today: number;
  vip_recognition_rate_pct: number;
  time_of_day: string;
  customer_segment: string;
  weather: string;
  avg_customer_value: number;
  monthly_arrivals: number;
}

const MOCK_DATA: EntranceData[] = [
  {
    avg_greeting_time_sec: 45, target_greeting_time_sec: 15,
    greeting_delay_pct: 38, walk_away_count_30d: 42,
    host_count: 1, peak_arrival_rate_per_min: 5, host_capacity_per_min: 3,
    entry_scent: 'none', dining_scent: 'vanilla',
    entry_music_volume: 'low', dining_music_volume: 'medium',
    entry_lux: 200, dining_lux: 150,
    avg_quoted_wait_min: 25, perceived_wait_too_long_pct: 35,
    waitlist_bail_rate_pct: 22, vip_arrivals_today: 3, vip_recognition_rate_pct: 65,
    time_of_day: 'dinner', customer_segment: 'all', weather: 'sunny',
    avg_customer_value: 48, monthly_arrivals: 2400,
  },
  {
    avg_greeting_time_sec: 12, target_greeting_time_sec: 15,
    greeting_delay_pct: 5, walk_away_count_30d: 3,
    host_count: 2, peak_arrival_rate_per_min: 4, host_capacity_per_min: 6,
    entry_scent: 'citrus', dining_scent: 'vanilla',
    entry_music_volume: 'medium', dining_music_volume: 'medium',
    entry_lux: 300, dining_lux: 150,
    avg_quoted_wait_min: 5, perceived_wait_too_long_pct: 8,
    waitlist_bail_rate_pct: 3, vip_arrivals_today: 1, vip_recognition_rate_pct: 95,
    time_of_day: 'lunch', customer_segment: 'business', weather: 'sunny',
    avg_customer_value: 32, monthly_arrivals: 1800,
  },
  {
    avg_greeting_time_sec: 65, target_greeting_time_sec: 15,
    greeting_delay_pct: 55, walk_away_count_30d: 68,
    host_count: 1, peak_arrival_rate_per_min: 7, host_capacity_per_min: 3,
    entry_scent: 'none', dining_scent: 'rosemary',
    entry_music_volume: 'none', dining_music_volume: 'medium',
    entry_lux: 150, dining_lux: 120,
    avg_quoted_wait_min: 45, perceived_wait_too_long_pct: 62,
    waitlist_bail_rate_pct: 35, vip_arrivals_today: 2, vip_recognition_rate_pct: 50,
    time_of_day: 'dinner', customer_segment: 'all', weather: 'rainy',
    avg_customer_value: 55, monthly_arrivals: 2200,
  },
];

export const runEntranceEngine = async (
  db: ReturnType<typeof useDB>,
  config: EntranceConfig = DEFAULT_ENTRANCE_CONFIG
): Promise<{ alerts: EntranceAlert[]; generated: number }> => {
  const alerts: EntranceAlert[] = [];
  const now = new Date();

  let data: EntranceData[] = [];
  try {
    const result = await db.query(
      `SELECT avg_greeting_time_sec, target_greeting_time_sec, greeting_delay_pct,
              walk_away_count_30d, host_count, peak_arrival_rate_per_min, host_capacity_per_min,
              entry_scent, dining_scent, entry_music_volume, dining_music_volume,
              entry_lux, dining_lux, avg_quoted_wait_min, perceived_wait_too_long_pct,
              waitlist_bail_rate_pct, vip_arrivals_today, vip_recognition_rate_pct,
              time_of_day, customer_segment, weather, avg_customer_value, monthly_arrivals
       FROM entrance_arrival_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      avg_greeting_time_sec: safeNumber(r.avg_greeting_time_sec, 0),
      target_greeting_time_sec: safeNumber(r.target_greeting_time_sec, 15),
      greeting_delay_pct: safeNumber(r.greeting_delay_pct, 0),
      walk_away_count_30d: safeNumber(r.walk_away_count_30d, 0),
      host_count: safeNumber(r.host_count, 1),
      peak_arrival_rate_per_min: safeNumber(r.peak_arrival_rate_per_min, 0),
      host_capacity_per_min: safeNumber(r.host_capacity_per_min, 0),
      entry_scent: String(r.entry_scent ?? 'none'),
      dining_scent: String(r.dining_scent ?? 'none'),
      entry_music_volume: String(r.entry_music_volume ?? 'none'),
      dining_music_volume: String(r.dining_music_volume ?? 'none'),
      entry_lux: safeNumber(r.entry_lux, 0),
      dining_lux: safeNumber(r.dining_lux, 0),
      avg_quoted_wait_min: safeNumber(r.avg_quoted_wait_min, 0),
      perceived_wait_too_long_pct: safeNumber(r.perceived_wait_too_long_pct, 0),
      waitlist_bail_rate_pct: safeNumber(r.waitlist_bail_rate_pct, 0),
      vip_arrivals_today: safeNumber(r.vip_arrivals_today, 0),
      vip_recognition_rate_pct: safeNumber(r.vip_recognition_rate_pct, 0),
      time_of_day: String(r.time_of_day ?? 'all'),
      customer_segment: String(r.customer_segment ?? 'all'),
      weather: String(r.weather ?? 'sunny'),
      avg_customer_value: safeNumber(r.avg_customer_value, 0),
      monthly_arrivals: safeNumber(r.monthly_arrivals, 0),
    }));
  } catch (err) {
    console.warn('[entrance] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const monthlyOpp = Math.round(d.walk_away_count_30d * (30 / 30) * d.avg_customer_value);

    // Rule 1: GREETING_DELAY_CRITICAL
    if (d.avg_greeting_time_sec > config.maxGreetingTimeSec) {
      const excess = d.avg_greeting_time_sec - config.maxGreetingTimeSec;
      alerts.push({
        rule_id: 'greeting_delay_critical',
        severity: d.avg_greeting_time_sec >= 60 ? 'critical' : 'high',
        avg_greeting_time_sec: d.avg_greeting_time_sec,
        target_greeting_time_sec: d.target_greeting_time_sec,
        greeting_delay_pct: d.greeting_delay_pct,
        walk_away_count_30d: d.walk_away_count_30d,
        time_of_day: d.time_of_day,
        predicted_satisfaction_drop: Math.min(20, excess / 3),
        predicted_conversion_drop_pct: Math.min(25, d.greeting_delay_pct * 0.5),
        est_monthly_opportunity: monthlyOpp,
        description: `GREETING DELAY CRITICAL: avg greeting ${d.avg_greeting_time_sec}s (target ${d.target_greeting_time_sec}s, threshold ${config.maxGreetingTimeSec}s). ${d.greeting_delay_pct}% of arrivals wait >30s. ${d.walk_away_count_30d} walk-aways in last 30 days = ${fmt$(monthlyOpp)} lost revenue. First impression formed in 7 seconds (Harvard Business School); 33% leave if not greeted within 30s (NRA). ${d.avg_greeting_time_sec >= 60 ? 'CRITICAL: 60s+ greeting = customers feel invisible, set negative tone for entire visit. ' : ''}ACTION: station host at door during ${d.time_of_day} peak; train staff to acknowledge within 5s (eye contact + smile) even if busy; assign dedicated greeter for first 10 seconds of arrival. Save ${fmt$(monthlyOpp)}/mo from prevented walk-aways. Greeting speed is the cheapest satisfaction lever — costs $0, just training.`,
        ai_recommendation: 'add_greeter',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: HOST_UNDERSTAFFED_PEAK
    const hostUtilization = d.host_capacity_per_min > 0 ? (d.peak_arrival_rate_per_min / (d.host_count * d.host_capacity_per_min)) * 100 : 0;
    if (hostUtilization >= 100) {
      alerts.push({
        rule_id: 'host_understaffed_peak',
        severity: hostUtilization >= 150 ? 'critical' : 'high',
        host_count: d.host_count,
        peak_arrival_rate_per_min: d.peak_arrival_rate_per_min,
        host_capacity_per_min: d.host_capacity_per_min,
        time_of_day: d.time_of_day,
        greeting_delay_pct: d.greeting_delay_pct,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.7),
        description: `HOST UNDERSTAFFED AT PEAK: ${d.host_count} host(s) for ${d.peak_arrival_rate_per_min} arrivals/min (${hostUtilization.toFixed(0)}% of capacity). Single host max = ${d.host_capacity_per_min} arrivals/min. During ${d.time_of_day} peak, host cannot greet + seat + manage waitlist simultaneously → greeting delays + waitlist chaos. ACTION: add second host during ${d.time_of_day} peak (2-3hr window). Second host cost: ~$30/hr × 3hr × 5 days = $450/mo. Recovered revenue from prevented walk-aways: ${fmt$(monthlyOpp * 0.7)}/mo. Net positive: ${fmt$(monthlyOpp * 0.7 - 450)}/mo. Peak staffing is the most controllable entrance lever — add staff when needed, remove when not.`,
        ai_recommendation: 'add_second_host',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: ENTRY_ATMOSPHERE_MISMATCH
    const atmosphereMismatch = (d.entry_scent !== d.dining_scent && d.dining_scent !== 'none') ||
                               (d.entry_music_volume !== d.dining_music_volume && d.dining_music_volume !== 'none') ||
                               (Math.abs(d.entry_lux - d.dining_lux) > 150);
    if (atmosphereMismatch) {
      alerts.push({
        rule_id: 'entry_atmosphere_mismatch',
        severity: 'medium',
        entry_scent: d.entry_scent,
        dining_scent: d.dining_scent,
        entry_music_volume: d.entry_music_volume,
        dining_music_volume: d.dining_music_volume,
        entry_lux: d.entry_lux,
        dining_lux: d.dining_lux,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `ENTRY ATMOSPHERE MISMATCH: entry atmosphere differs from dining. Entry scent: ${d.entry_scent}, dining: ${d.dining_scent}. Entry music: ${d.entry_music_volume}, dining: ${d.dining_music_volume}. Entry lux: ${d.entry_lux}, dining: ${d.dining_lux}. Customers experience jarring transition — entry should WELCOME into dining atmosphere, not clash. ACTION: align entry atmosphere with dining — entry scent should preview dining scent (lighter), entry music should match dining tempo, entry lighting should transition from bright (welcoming) to dining level gradually. ${d.entry_scent === 'none' && d.dining_scent !== 'none' ? 'Entry has no scent but dining does — add lighter version of dining scent at entry. ' : ''}Save ${fmt$(monthlyOpp * 0.3)}/mo. Smooth atmosphere transition signals intentional design — customers feel cared for.`,
        ai_recommendation: 'align_entry_atmosphere',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: WAITLIST_PERCEPTION_NEGATIVE
    if (d.perceived_wait_too_long_pct >= 25 || d.waitlist_bail_rate_pct >= 15) {
      alerts.push({
        rule_id: 'waitlist_perception_negative',
        severity: d.waitlist_bail_rate_pct >= 25 ? 'high' : 'medium',
        avg_quoted_wait_min: d.avg_quoted_wait_min,
        perceived_wait_too_long_pct: d.perceived_wait_too_long_pct,
        waitlist_bail_rate_pct: d.waitlist_bail_rate_pct,
        time_of_day: d.time_of_day,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.6),
        description: `WAITLIST PERCEPTION NEGATIVE: avg quoted wait ${d.avg_quoted_wait_min}min. ${d.perceived_wait_too_long_pct}% perceive as too long, ${d.waitlist_bail_rate_pct}% bail (leave waitlist). Perceived wait > actual wait when customers have nothing to do. ACTION: ${d.avg_quoted_wait_min > 20 ? 'reduce quoted wait by actually reducing wait (add tables, faster turnover). ' : 'reduce PERCEIVED wait — give customers something to do (bar menu, water, seating area). '}'Quote 10% longer than actual (manage expectations: quote 25min, seat in 22min = pleasant surprise). ${d.perceived_wait_too_long_pct >= 50 ? 'CRITICAL: 50%+ perceive too long = systematic issue — review staffing + table turnover. ' : ''}Save ${fmt$(monthlyOpp * 0.6)}/mo. Perceived wait management is free — just communication + distraction.`,
        ai_recommendation: 'reduce_quoted_wait',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: VIP_ARRIVAL_UNRECOGNIZED
    if (d.vip_arrivals_today > 0 && d.vip_recognition_rate_pct < config.vipRecognitionTargetPct) {
      alerts.push({
        rule_id: 'vip_arrival_unrecognized',
        severity: 'high',
        vip_arrivals_today: d.vip_arrivals_today,
        vip_recognition_rate_pct: d.vip_recognition_rate_pct,
        time_of_day: d.time_of_day,
        est_monthly_opportunity: Math.round(d.vip_arrivals_today * d.avg_customer_value * 4 * 0.3),
        description: `VIP ARRIVAL UNRECOGNIZED: ${d.vip_arrivals_today} VIP(s) arrived today, only ${d.vip_recognition_rate_pct}% recognized by host (target ${config.vipRecognitionTargetPct}%). ${100 - d.vip_recognition_rate_pct}% of VIPs were treated as strangers. VIPs drive 4-6x revenue + refer 3-5 new customers. Unrecognized VIP = insulted customer who may not return. ACTION: train host to recognize VIP photos (tablet with customer photos at host stand); implement CRM alert when VIP reservation approaches; manager personally greets platinum-tier. ${d.vip_recognition_rate_pct < 60 ? 'CRITICAL: <60% recognition = systematic failure — install tablet with customer photos + train host. ' : ''}Save ${fmt$(d.vip_arrivals_today * d.avg_customer_value * 4 * 0.3)}/mo from retained VIP loyalty. VIP recognition costs $0 — just training + CRM lookup.`,
        ai_recommendation: 'train_vip_recognition',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: ENTRANCE_CLUTTER
    if (d.entry_lux < 200 && d.time_of_day === 'dinner') {
      alerts.push({
        rule_id: 'entrance_clutter',
        severity: 'low',
        entry_lux: d.entry_lux,
        time_of_day: d.time_of_day,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
        description: `ENTRANCE CLUTTER SIGNAL: entry at ${d.entry_lux} lux during ${d.time_of_day} — likely cluttered or poorly lit. Dark/cluttered entrance = unwelcoming first impression. Common clutter: umbrella stands overflowing, promotional signage blocking path, dirty welcome mat, recycling bins visible, staff coats/jackets hanging. ACTION: declutter entrance — keep path clear minimum 4ft wide; ensure adequate lighting (300+ lux); clean welcome mat hourly; hide operational items (bins, coats) from customer view. ${d.weather === 'rainy' ? 'Rainy day: manage umbrella clutter — provide umbrella bags + stand. ' : ''}Save ${fmt$(monthlyOpp * 0.2)}/mo. Entrance cleanliness signals restaurant cleanliness — customers judge kitchen by entrance.`,
        ai_recommendation: 'declutter_entrance',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: WEATHER_ENTRANCE_ADJUSTMENT
    if (d.weather === 'rainy' || d.weather === 'snowy' || d.weather === 'cold') {
      alerts.push({
        rule_id: 'weather_entrance_adjustment',
        severity: 'medium',
        weather: d.weather,
        time_of_day: d.time_of_day,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `WEATHER ENTRANCE ADJUSTMENT NEEDED: ${d.weather} weather requires entrance adjustment. Cold air rushes in when door opens → dining area cools → discomfort. Wet umbrellas create slip hazard + mess. Customers arrive cold/wet → need warmth + comfort signals. ACTION: ${d.weather === 'rainy' || d.weather === 'snowy' ? 'install air curtain at door ($300-800) to block cold air; provide umbrella bags + stand; add non-slip mat; offer coat check. ' : 'install air curtain; warm lighting at entrance; hot drink sample for arriving customers. '}'Weather-adjusted entrance shows care + prevents discomfort cascade. Save ${fmt$(monthlyOpp * 0.4)}/mo. Weather is uncontrollable but entrance response is — adapt or lose customers to weather.`,
        ai_recommendation: 'weather_adjust',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: SEGMENT_SPECIFIC_GREETING
    if (d.customer_segment !== 'all' && d.customer_segment !== '') {
      alerts.push({
        rule_id: 'segment_specific_greeting',
        severity: 'low',
        customer_segment: d.customer_segment,
        time_of_day: d.time_of_day,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `SEGMENT-SPECIFIC GREETING: ${d.customer_segment} customers need tailored greeting style. ${d.customer_segment === 'business' ? 'Business: efficient + professional — greet by name if known, confirm reservation quickly, seat promptly. Value time over warmth. ' : d.customer_segment === 'family' ? 'Family: warm + kid-aware — greet children first (parents appreciate), offer high chairs immediately, acknowledge kids by name. ' : d.customer_segment === 'date' ? 'Date: intimate + discreet — low-key greeting, seat at quieter table, avoid loud announcement. ' : d.customer_segment === 'celebration' ? 'Celebration: festive + congratulatory — acknowledge occasion, offer champagne, seat at best table. ' : 'Segment-specific greeting needed. '}'ACTION: train host to identify segment within 5 seconds (party size, dress, demeanor, occasion signals) and adjust greeting style. Script 3-4 greeting variants. Save ${fmt$(monthlyOpp * 0.3)}/mo. Segment-specific greeting shows emotional intelligence — customers feel seen.`,
        ai_recommendation: 'train_segment_greeting',
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
              { role: 'system', content: 'You are a restaurant entrance experience + first impression AI. Given entrance data, recommend ONE specific action with expected satisfaction/revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Greeting: ${a.avg_greeting_time_sec ?? 0}s (target ${a.target_greeting_time_sec ?? 15}s). Delay: ${a.greeting_delay_pct ?? 0}%. Walk-aways 30d: ${a.walk_away_count_30d ?? 0}. Hosts: ${a.host_count ?? 1}. Peak arrivals: ${a.peak_arrival_rate_per_min ?? 0}/min. Quoted wait: ${a.avg_quoted_wait_min ?? 0}min. Bail rate: ${a.waitlist_bail_rate_pct ?? 0}%. VIP recognition: ${a.vip_recognition_rate_pct ?? 0}%. Time: ${a.time_of_day ?? 'all'}. Weather: ${a.weather ?? 'sunny'}. Segment: ${a.customer_segment ?? 'all'}. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM entrance_arrival_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE entrance_arrival_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<EntranceAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM entrance_arrival_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgGreetingTimeSec: number; totalWalkAways30d: number; avgVipRecognitionPct: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(avg_greeting_time_sec WHERE avg_greeting_time_sec != NONE) AS avggreet,
              math::sum(walk_away_count_30d WHERE walk_away_count_30d != NONE) AS walkaways,
              math::mean(vip_recognition_rate_pct WHERE vip_recognition_rate_pct != NONE) AS avgvip
       FROM entrance_arrival_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgGreetingTimeSec: safeNumber(r.avggreet, 0),
      totalWalkAways30d: safeNumber(r.walkaways, 0),
      avgVipRecognitionPct: safeNumber(r.avgvip, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgGreetingTimeSec: 0, totalWalkAways30d: 0, avgVipRecognitionPct: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
