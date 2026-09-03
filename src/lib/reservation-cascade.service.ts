/**
 * AI Reservation Cascade Predictor — multi-reservation cascade effects.
 *
 * 48th POSR-exclusive differentiator — when a no-show happens at peak slot,
 * the impact cascades — late-arriving walk-ins take the table, subsequent
 * reservations get delayed, kitchen gets bottlenecked, and the night's
 * revenue drops 15-30% (Cornell hospitality operations research). Existing
 * POS systems treat each reservation independently — none predicts CASCADE
 * EFFECTS.
 *
 * Distinct from:
 *   - noshow-prediction.service (per-reservation risk — NOT cascade effects)
 *   - overbooking.service (slot-level capacity — NOT downstream cascades)
 *   - peak-hour.service (predicts demand — doesn't model cascade)
 *   - wait-prediction.service (per-party wait — not multi-reservation cascade)
 *   - kitchen-bottleneck.service (per-item delays — not reservation cascade)
 *   - table-utilization.service (occupancy patterns — not booking cascades)
 *
 * This service predicts MULTI-RESERVATION CASCADE EFFECTS — downstream
 * impact of a single event across the entire evening.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type CascadeRuleId =
  | 'no_show_cascade'
  | 'walk_in_storm'
  | 'turnover_bottleneck'
  | 'kitchen_spike'
  | 'double_booked_table';

export type CascadeAiRec =
  | 'call_ahead'
  | 'overbook_slot'
  | 'add_staff'
  | 'extend_hours'
  | 'decline_late_bookings'
  | 'monitor';

export interface ReservationCascadeAlert {
  id?: string;
  rule_id: CascadeRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  trigger_date?: Date;
  trigger_description?: string;
  affected_reservations: number;
  affected_tables: number;
  predicted_delay_minutes: number;
  cascade_depth: number;
  est_revenue_loss: number;
  mitigation_steps?: string;          // JSON array
  description: string;
  ai_insight?: string;
  ai_recommendation?: CascadeAiRec;
  status: 'open' | 'mitigated' | 'occurred' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface CascadeConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  peakThreshold: number;
  walkInStormThreshold: number;
}

export const DEFAULT_CASCADE_CONFIG: CascadeConfig = {
  aiEnabled: true,
  lookbackDays: 60,
  peakThreshold: 8,
  walkInStormThreshold: 10,
};

export const readCascadeConfig = (settings: any): CascadeConfig => ({
  aiEnabled: settings?.cascade_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.cascade_lookback_days, 60),
  peakThreshold: safeNumber(settings?.cascade_peak_threshold, 8),
  walkInStormThreshold: safeNumber(settings?.cascade_walk_in_storm_threshold, 10),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface SlotStats {
  day_of_week: number;
  hour: number;
  total_reservations: number;
  no_shows: number;
  walk_ins: number;
  avg_party_size: number;
  avg_turnover_minutes: number;
}

/**
 * Run the cascade predictor engine.
 * Analyzes historical slot patterns, identifies cascade risks, projects
 * downstream impact.
 */
export const runCascadeEngine = async (
  db: ReturnType<typeof useDB>,
  config: CascadeConfig = DEFAULT_CASCADE_CONFIG
): Promise<{ alerts: ReservationCascadeAlert[]; generated: number }> => {
  const lookback = config.lookbackDays;

  // 1. Fetch historical slot stats (DOW × hour) for last N days
  let slotStats: SlotStats[] = [];
  try {
    const result = await db.query(
      `SELECT
         time::dayofweek(datetime) AS dow,
         time::hour(datetime) AS hour,
         count() AS total,
         math::count(status = 'no_show') AS no_shows,
         math::count(type = 'walk_in') AS walk_ins,
         math::mean(party_size) AS avg_party,
         math::mean(duration) AS avg_turnover
       FROM reservation
       WHERE datetime > time::now() - ${lookback}d
         AND deleted_at IS NONE
       GROUP BY time::dayofweek(datetime), time::hour(datetime)`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    slotStats = rows.map((r: any) => ({
      day_of_week: safeNumber(r.dow, 0),
      hour: safeNumber(r.hour, 0),
      total_reservations: safeNumber(r.total, 0),
      no_shows: safeNumber(r.no_shows, 0),
      walk_ins: safeNumber(r.walk_ins, 0),
      avg_party_size: safeNumber(r.avg_party, 0),
      avg_turnover_minutes: safeNumber(r.avg_turnover, 0),
    })).filter(s => s.hour >= 10 && s.hour <= 22);
  } catch (err) {
    console.warn('[cascade] fetchSlotStats failed', err);
  }

  if (slotStats.length === 0) return { alerts: [], generated: 0 };

  // 2. Fetch upcoming reservations (next 7 days) grouped by datetime slot
  let upcoming: Array<{ datetime: string; count: number; party_size: number; walk_ins: number }> = [];
  try {
    const result = await db.query(
      `SELECT
         datetime,
         count() AS count,
         math::sum(party_size) AS party_size,
         math::count(type = 'walk_in') AS walk_ins
       FROM reservation
       WHERE datetime > time::now() AND datetime < time::now() + 7d
         AND status IN ('pending', 'confirmed')
         AND deleted_at IS NONE
       GROUP BY datetime
       ORDER BY datetime`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    upcoming = rows.map((r: any) => ({
      datetime: String(r.datetime ?? ''),
      count: safeNumber(r.count, 0),
      party_size: safeNumber(r.party_size, 0),
      walk_ins: safeNumber(r.walk_ins, 0),
    }));
  } catch (err) {
    console.warn('[cascade] fetchUpcoming failed', err);
  }

  const alerts: ReservationCascadeAlert[] = [];
  const now = new Date();
  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // 3. Compute cascade risks per slot
  for (const slot of slotStats) {
    // Skip slots with too little data
    if (slot.total_reservations < 3) continue;

    const noShowRate = slot.total_reservations > 0
      ? slot.no_shows / slot.total_reservations
      : 0;

    // Find upcoming reservations matching this slot pattern
    const matchingUpcoming = upcoming.filter(u => {
      const d = new Date(u.datetime);
      return d.getDay() === slot.day_of_week && d.getHours() === slot.hour;
    });

    const upcomingCount = matchingUpcoming.reduce((s, u) => s + u.count, 0);

    // Skip if no upcoming reservations match this slot
    if (upcomingCount === 0) continue;

    const dowName = DOW_NAMES[slot.day_of_week];

    // --- Rule 1: NO_SHOW_CASCADE — high no-show rate at peak slot ---
    if (noShowRate > 0.15 && upcomingCount >= config.peakThreshold) {
      // Cascade depth: more reservations → deeper cascade
      const cascadeDepth = Math.min(5, Math.floor(upcomingCount / 3));
      const affectedReservations = Math.floor(upcomingCount * noShowRate) + cascadeDepth * 2;
      const affectedTables = Math.ceil(affectedReservations / 4); // assume avg 4 per table
      const predictedDelay = cascadeDepth * 8; // 8 min delay per cascade level
      const estRevenueLoss = affectedReservations * 35 * 0.5; // 50% revenue impact per affected res

      alerts.push({
        rule_id: 'no_show_cascade',
        severity: noShowRate > 0.25 ? 'critical' : 'high',
        trigger_description: `${dowName} ${slot.hour}:00 — ${(noShowRate * 100).toFixed(0)}% historical no-show rate at peak slot (${upcomingCount} upcoming)`,
        affected_reservations: affectedReservations,
        affected_tables: affectedTables,
        predicted_delay_minutes: predictedDelay,
        cascade_depth: cascadeDepth,
        est_revenue_loss: Math.round(estRevenueLoss * 100) / 100,
        mitigation_steps: JSON.stringify([
          `Call ${Math.ceil(upcomingCount * 0.5)} highest-risk reservations 2h before`,
          `Prep ${cascadeDepth} backup tables for walk-ins`,
          `Alert kitchen to expect ${predictedDelay}min delay cascade`,
          `Have manager on floor for ${dowName} ${slot.hour}:00`,
        ]),
        description: `${dowName} ${slot.hour}:00 cascade: ${affectedReservations} reservations at risk, ${predictedDelay}min avg delay, depth ${cascadeDepth} levels — revenue loss ${fmt$(estRevenueLoss)}`,
        status: 'open',
        detected_at: now,
      });
      continue;
    }

    // --- Rule 2: WALK_IN_STORM — predicted high walk-in volume at peak ---
    const walkInRate = slot.total_reservations > 0 ? slot.walk_ins / slot.total_reservations : 0;
    if (walkInRate > 0.3 || slot.walk_ins >= config.walkInStormThreshold) {
      const expectedWalkIns = Math.ceil(slot.walk_ins * (upcomingCount / Math.max(slot.total_reservations, 1)));
      if (expectedWalkIns >= config.walkInStormThreshold) {
        const affectedTables = Math.ceil(expectedWalkIns / 4);
        alerts.push({
          rule_id: 'walk_in_storm',
          severity: expectedWalkIns > 15 ? 'critical' : 'high',
          trigger_description: `${dowName} ${slot.hour}:00 — predicted ${expectedWalkIns} walk-ins (storm)`,
          affected_reservations: upcomingCount,
          affected_tables: affectedTables,
          predicted_delay_minutes: expectedWalkIns * 2, // 2 min delay per walk-in
          cascade_depth: Math.min(4, Math.floor(expectedWalkIns / 4)),
          est_revenue_loss: 0, // walk-ins are revenue-positive, but may push out reservations
          mitigation_steps: JSON.stringify([
            `Pre-assign ${affectedTables} tables for walk-ins`,
            `Brief servers to expect ${expectedWalkIns} walk-ins`,
            `Set up waiting area with seating for ${Math.ceil(expectedWalkIns * 0.3)} overflow`,
            `Have waitlist manager on duty`,
          ]),
          description: `${dowName} ${slot.hour}:00 walk-in storm: ${expectedWalkIns} expected, ${affectedTables} tables needed, ${upcomingCount} reservations may be delayed`,
          status: 'open',
          detected_at: now,
        });
        continue;
      }
    }

    // --- Rule 3: TURNOVER_BOTTLENECK — slow turnover cascades to next slot ---
    if (slot.avg_turnover_minutes > 90 && upcomingCount >= 5) {
      // Slow turnover means table not freed in time for next slot
      const nextSlotCount = upcoming.filter(u => {
        const d = new Date(u.datetime);
        return d.getDay() === slot.day_of_week && d.getHours() === slot.hour + 1;
      }).reduce((s, u) => s + u.count, 0);

      if (nextSlotCount > 0) {
        const affectedTables = Math.ceil(upcomingCount / 4);
        const delayOverflow = slot.avg_turnover_minutes - 75; // expected - target
        alerts.push({
          rule_id: 'turnover_bottleneck',
          severity: delayOverflow > 30 ? 'high' : 'medium',
          trigger_description: `${dowName} ${slot.hour}:00 → ${slot.hour + 1}:00 — avg turnover ${slot.avg_turnover_minutes.toFixed(0)}min (target 75)`,
          affected_reservations: nextSlotCount,
          affected_tables: affectedTables,
          predicted_delay_minutes: delayOverflow,
          cascade_depth: 2,
          est_revenue_loss: nextSlotCount * 35 * 0.2, // 20% revenue impact
          mitigation_steps: JSON.stringify([
            `Notify ${slot.hour + 1}:00 reservations of potential ${delayOverflow.toFixed(0)}min delay`,
            `Brief servers to clear ${slot.hour}:00 tables within 75min`,
            `Offer dessert/coffee to departing tables to extend revenue`,
            `Have host stand ready with waitlist at ${slot.hour + 1}:00`,
          ]),
          description: `${dowName} ${slot.hour}:00 turnover bottleneck: ${slot.avg_turnover_minutes.toFixed(0)}min avg → ${delayOverflow.toFixed(0)}min overflow into ${slot.hour + 1}:00 slot (${nextSlotCount} reservations affected)`,
          status: 'open',
          detected_at: now,
        });
      }
    }

    // --- Rule 4: KITCHEN_SPIKE — 8+ reservations in 15-min window ---
    // Detect clustering of reservations in same 15-min window
    for (const u of matchingUpcoming) {
      if (u.count >= 8) {
        // Find reservations within 15-min window of this slot
        const window15Min = matchingUpcoming.filter(o => {
          const t1 = new Date(u.datetime).getTime();
          const t2 = new Date(o.datetime).getTime();
          return Math.abs(t1 - t2) <= 15 * 60 * 1000;
        }).reduce((s, o) => s + o.count, 0);

        if (window15Min >= 8) {
          alerts.push({
            rule_id: 'kitchen_spike',
            severity: window15Min > 12 ? 'critical' : 'high',
            trigger_description: `${dowName} ${slot.hour}:00 — ${window15Min} orders in 15-min window`,
            affected_reservations: window15Min,
            affected_tables: Math.ceil(window15Min / 4),
            predicted_delay_minutes: window15Min * 3, // 3 min kitchen delay per order
            cascade_depth: 3,
            est_revenue_loss: window15Min * 35 * 0.15, // 15% walk-away from long waits
            mitigation_steps: JSON.stringify([
              `Add 1 cook to ${slot.hour}:00 shift`,
              `Prep popular dishes 30min before`,
              `Stagger seating by 5min intervals`,
              `Brief expeditor on expected ${window15Min} order burst`,
            ]),
            description: `${dowName} ${slot.hour}:00 kitchen spike: ${window15Min} orders in 15min → ${(window15Min * 3).toFixed(0)}min kitchen delay cascade, ${fmt$(window15Min * 35 * 0.15)} walk-away loss`,
            status: 'open',
            detected_at: now,
          });
          break; // one alert per slot
        }
      }
    }
  }

  // --- Rule 5: DOUBLE_BOOKED_TABLE — table assigned to overlapping reservations ---
  try {
    const overlapResult = await db.query(
      `SELECT
         table.id AS table_id,
         table.name AS table_name,
         count() AS bookings,
         math::min(datetime) AS first_booking,
         math::max(datetime) AS last_booking
       FROM reservation
       WHERE datetime > time::now() AND datetime < time::now() + 7d
         AND status IN ('pending', 'confirmed')
         AND table IS NOT NONE
         AND deleted_at IS NONE
       GROUP BY table.id, table.name
       HAVING count() > 1
       LIMIT 20`
    );
    const overlapRows = Array.isArray(overlapResult) ? overlapResult.flat() : [];

    for (const o of overlapRows) {
      const bookings = safeNumber(o.bookings, 0);
      const firstDate = new Date(o.first_booking);
      const lastDate = new Date(o.last_booking);
      const gapMinutes = (lastDate.getTime() - firstDate.getTime()) / 60000;

      // Double-booking if gap < 90 min (typical turnover time)
      if (gapMinutes < 90 && bookings > 1) {
        alerts.push({
          rule_id: 'double_booked_table',
          severity: gapMinutes < 30 ? 'critical' : 'high',
          trigger_description: `Table "${o.table_name}" has ${bookings} reservations ${gapMinutes.toFixed(0)}min apart`,
          affected_reservations: bookings,
          affected_tables: 1,
          predicted_delay_minutes: Math.max(0, 90 - gapMinutes),
          cascade_depth: 2,
          est_revenue_loss: bookings * 35 * 0.3, // 30% revenue impact
          mitigation_steps: JSON.stringify([
            `Reassign 1 reservation to another table`,
            `Call customer to offer earlier/later slot`,
            `Brief host on table conflict at ${firstDate.toLocaleTimeString()}`,
          ]),
          description: `Table "${o.table_name}" double-booked: ${bookings} reservations ${gapMinutes.toFixed(0)}min apart — expected ${(90 - gapMinutes).toFixed(0)}min overlap delay`,
          status: 'open',
          detected_at: now,
        });
      }
    }
  } catch (err) {
    console.warn('[cascade] fetchOverlaps failed', err);
  }

  // 4. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant operations AI specializing in cascade risk prediction. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Cascade alert: ${a.description}. Affected: ${a.affected_reservations} reservations, ${a.affected_tables} tables. Predicted delay: ${a.predicted_delay_minutes}min. Depth: ${a.cascade_depth}. Est revenue loss: ${fmt$(a.est_revenue_loss)}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
          a.ai_recommendation = a.rule_id === 'no_show_cascade' ? 'call_ahead'
            : a.rule_id === 'walk_in_storm' ? 'add_staff'
            : a.rule_id === 'turnover_bottleneck' ? 'extend_hours'
            : a.rule_id === 'kitchen_spike' ? 'add_staff'
            : a.rule_id === 'double_booked_table' ? 'decline_late_bookings'
            : 'monitor';
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM reservation_cascade_alert WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE reservation_cascade_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { alerts, generated: alerts.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ReservationCascadeAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM reservation_cascade_alert
       WHERE status = 'open'
       ORDER BY est_revenue_loss DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  criticalCount: number;
  totalAlerts: number;
  totalAffectedReservations: number;
  totalRevenueLoss: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(affected_reservations) AS affected,
         math::sum(est_revenue_loss) AS loss
       FROM reservation_cascade_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      criticalCount: safeNumber(r.critical, 0),
      totalAlerts: safeNumber(r.total, 0),
      totalAffectedReservations: safeNumber(r.affected, 0),
      totalRevenueLoss: safeNumber(r.loss, 0),
    };
  } catch {
    return { criticalCount: 0, totalAlerts: 0, totalAffectedReservations: 0, totalRevenueLoss: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'mitigated' | 'occurred' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
