/**
 * AI Reservation Overbooking Optimizer — compute optimal slot overbooking level.
 *
 * 47th POSR-exclusive differentiator — restaurants lose $4-6k/year to no-shows
 * (NRA). Airlines overbook +95% capacity using predictive models; restaurants
 * don't. OpenTable ($300+/mo) shows per-reservation no-show risk but DOESN'T
 * compute optimal overbooking level per slot.
 *
 * Distinct from:
 *   - noshow-prediction.service (per-reservation risk, NOT aggregate slot capacity)
 *   - reservation.service (operational booking — doesn't optimize)
 *   - peak-hour.service (predicts demand — doesn't compute overbooking)
 *   - peak-pricing.service (price adjustments — not seat count)
 *   - table-utilization.service (occupancy patterns — not booking strategy)
 *   - seating-optimization.service (real-time assignment — not overbooking)
 *
 * Algorithm:
 *   1. For each DOW × hour slot:
 *      - capacity_seats = sum(floor_table.capacity) where active
 *      - current_bookings = sum(reservation.party_size) for upcoming slot
 *      - historical_no_show_rate = no-shows / total reservations in this slot
 *      - predicted_no_shows = current_bookings × no_show_rate
 *      - predicted_walk_ins = historical avg walk-ins for slot
 *      - effective_demand = current_bookings - predicted_no_shows + predicted_walk_ins
 *      - optimal_overbook = floor(capacity_seats × max_overbook_pct - effective_demand)
 *   2. Compute expected_fill_rate, service_risk, est_revenue_gain
 *   3. Classify rule + AI insight
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type OverbookingRuleId =
  | 'slot_overbook'
  | 'slot_conservative'
  | 'slot_walk_in_friendly'
  | 'slot_at_risk';

export type OverbookingAiRec =
  | 'accept_N_extra'
  | 'accept_walk_ins'
  | 'hold_capacity'
  | 'reduce_bookings'
  | 'monitor';

export interface OverbookingPlan {
  id?: string;
  rule_id: OverbookingRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  day_of_week: number;
  hour: number;
  capacity_seats: number;
  current_bookings: number;
  predicted_no_shows: number;
  predicted_walk_ins: number;
  optimal_overbook_count: number;
  historical_no_show_rate: number;
  expected_fill_rate: number;
  est_revenue_gain: number;
  service_risk: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: OverbookingAiRec;
  status: 'open' | 'applied' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface OverbookingConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  serviceWaitThreshold: number;
  maxOverbookPct: number;
}

export const DEFAULT_OVERBOOKING_CONFIG: OverbookingConfig = {
  aiEnabled: true,
  lookbackDays: 90,
  serviceWaitThreshold: 15,
  maxOverbookPct: 0.30,
};

export const readOverbookingConfig = (settings: any): OverbookingConfig => ({
  aiEnabled: settings?.overbooking_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.overbooking_lookback_days, 90),
  serviceWaitThreshold: safeNumber(settings?.overbooking_service_wait_threshold, 15),
  maxOverbookPct: safeNumber(settings?.overbooking_max_overbook_pct, 0.30),
});

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface SlotMetrics {
  day_of_week: number;
  hour: number;
  total_reservations: number;
  no_shows: number;
  total_party_size: number;
  walk_ins: number;
}

/**
 * Run the overbooking optimizer engine.
 * Fetches historical reservation stats per slot, current bookings,
 * computes optimal overbooking level.
 */
export const runOverbookingEngine = async (
  db: ReturnType<typeof useDB>,
  config: OverbookingConfig = DEFAULT_OVERBOOKING_CONFIG
): Promise<{ plans: OverbookingPlan[]; generated: number }> => {
  const lookback = config.lookbackDays;

  // 1. Get total seat capacity (sum of active floor_table capacities)
  let totalCapacity = 0;
  try {
    const capResult = await db.query(
      `SELECT math::sum(capacity) AS total_seats FROM floor_table WHERE deleted_at IS NONE AND status != 'inactive' GROUP ALL`
    );
    const capRows = Array.isArray(capResult) ? capResult.flat() : [];
    totalCapacity = safeNumber(capRows[0]?.total_seats, 0);
  } catch (err) {
    console.warn('[overbooking] fetchCapacity failed', err);
  }
  if (totalCapacity === 0) totalCapacity = 80; // fallback default

  // 2. Fetch historical reservation stats per slot (DOW × hour) in last N days
  let slotStats: SlotMetrics[] = [];
  try {
    const result = await db.query(
      `SELECT
         time::dayofweek(datetime) AS dow,
         time::hour(datetime) AS hour,
         count() AS total,
         math::count(status = 'no_show') AS no_shows,
         math::sum(party_size) AS total_party,
         math::count(type = 'walk_in') AS walk_ins
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
      total_party_size: safeNumber(r.total_party, 0),
      walk_ins: safeNumber(r.walk_ins, 0),
    }));
  } catch (err) {
    console.warn('[overbooking] fetchSlotStats failed', err);
  }

  if (slotStats.length === 0) return { plans: [], generated: 0 };

  // 3. Fetch current upcoming bookings per slot (next 7 days)
  let currentBookings: Array<{ dow: number; hour: number; bookings: number; party_size: number }> = [];
  try {
    const result = await db.query(
      `SELECT
         time::dayofweek(datetime) AS dow,
         time::hour(datetime) AS hour,
         count() AS bookings,
         math::sum(party_size) AS party_size
       FROM reservation
       WHERE datetime > time::now() AND datetime < time::now() + 7d
         AND status IN ('pending', 'confirmed')
         AND deleted_at IS NONE
       GROUP BY time::dayofweek(datetime), time::hour(datetime)`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    currentBookings = rows.map((r: any) => ({
      dow: safeNumber(r.dow, 0),
      hour: safeNumber(r.hour, 0),
      bookings: safeNumber(r.bookings, 0),
      party_size: safeNumber(r.party_size, 0),
    }));
  } catch (err) {
    console.warn('[overbooking] fetchCurrentBookings failed', err);
  }

  // 4. Build slot-by-slot plans
  const plans: OverbookingPlan[] = [];
  const now = new Date();

  // For each historical slot, find matching current bookings
  for (const slot of slotStats) {
    // Skip off-hours (before 10am, after 23:00)
    if (slot.hour < 10 || slot.hour > 22) continue;

    // Historical no-show rate
    const noShowRate = slot.total_reservations > 0
      ? slot.no_shows / slot.total_reservations
      : 0.10; // fallback 10% industry average

    // Skip slots with too little data
    if (slot.total_reservations < 3 && noShowRate === 0.10) continue;

    // Current bookings for this slot (sum party_size of upcoming reservations)
    const matching = currentBookings.find(b => b.dow === slot.day_of_week && b.hour === slot.hour);
    const currentBookingsSeats = matching ? matching.party_size : 0;
    const currentBookingsCount = matching ? matching.bookings : 0;

    // Skip slots with no current bookings (no overbooking needed)
    if (currentBookingsCount === 0) continue;

    // Compute optimal overbooking
    const predictedNoShows = currentBookingsSeats * noShowRate;
    const avgWalkIns = slot.total_reservations > 0
      ? slot.walk_ins / slot.total_reservations * 2 // estimate ~2x avg walk-ins per slot
      : 0;

    // Effective demand = current bookings - no-shows + walk-ins
    const effectiveDemand = Math.max(0, currentBookingsSeats - predictedNoShows + avgWalkIns);

    // Max overbook = capacity × maxOverbookPct
    const maxOverbookSeats = Math.floor(totalCapacity * config.maxOverbookPct);

    // Optimal overbook = how many more seats we can accept
    // = max(maxOverbookSeats - (effectiveDemand - capacity), 0) if demand < capacity
    // = if demand > capacity, no overbook needed
    let optimalOverbook = 0;
    if (effectiveDemand < totalCapacity) {
      optimalOverbook = Math.min(
        Math.floor(totalCapacity - effectiveDemand),
        maxOverbookSeats
      );
    }

    // Expected fill rate after overbooking
    const expectedFillRate = totalCapacity > 0
      ? (effectiveDemand + optimalOverbook) / totalCapacity
      : 0;

    // Service risk: if optimalOverbook > 20% of capacity → higher risk
    const serviceRisk = Math.min(100, Math.max(0,
      (optimalOverbook / Math.max(totalCapacity * config.maxOverbookPct, 1)) * 100
    ));

    // Est revenue gain = avg ticket × optimalOverbook seats × (1 - noShowRate)
    const avgTicketSize = 35; // industry avg
    const estRevenueGain = optimalOverbook * avgTicketSize * (1 - noShowRate);

    // Classify rule
    let ruleId: OverbookingRuleId = 'slot_overbook';
    let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
    let aiRec: OverbookingAiRec = 'accept_N_extra';
    let desc = '';

    if (optimalOverbook >= 15) {
      ruleId = 'slot_overbook';
      severity = 'high';
      desc = `${DOW_NAMES[slot.day_of_week]} ${slot.hour}:00 — high overbooking opportunity (+${optimalOverbook} seats)`;
    } else if (optimalOverbook >= 5) {
      ruleId = 'slot_overbook';
      severity = 'medium';
      desc = `${DOW_NAMES[slot.day_of_week]} ${slot.hour}:00 — moderate overbooking (+${optimalOverbook} seats)`;
    } else if (noShowRate < 0.05 && avgWalkIns > 5) {
      ruleId = 'slot_walk_in_friendly';
      severity = 'low';
      aiRec = 'accept_walk_ins';
      desc = `${DOW_NAMES[slot.day_of_week]} ${slot.hour}:00 — low no-show risk, hold capacity for walk-ins (avg ${avgWalkIns.toFixed(1)})`;
    } else if (noShowRate > 0.20) {
      ruleId = 'slot_at_risk';
      severity = 'critical';
      aiRec = 'reduce_bookings';
      desc = `${DOW_NAMES[slot.day_of_week]} ${slot.hour}:00 — high no-show rate (${(noShowRate * 100).toFixed(0)}%), reduce bookings or require deposit`;
    } else if (expectedFillRate < 0.5) {
      ruleId = 'slot_conservative';
      severity = 'low';
      aiRec = 'hold_capacity';
      desc = `${DOW_NAMES[slot.day_of_week]} ${slot.hour}:00 — low fill expected (${(expectedFillRate * 100).toFixed(0)}%), hold capacity`;
    } else {
      continue; // skip uninteresting slots
    }

    plans.push({
      rule_id: ruleId,
      severity,
      day_of_week: slot.day_of_week,
      hour: slot.hour,
      capacity_seats: totalCapacity,
      current_bookings: currentBookingsSeats,
      predicted_no_shows: Math.round(predictedNoShows * 10) / 10,
      predicted_walk_ins: Math.round(avgWalkIns * 10) / 10,
      optimal_overbook_count: optimalOverbook,
      historical_no_show_rate: Math.round(noShowRate * 10000) / 10000,
      expected_fill_rate: Math.round(expectedFillRate * 10000) / 10000,
      est_revenue_gain: Math.round(estRevenueGain * 100) / 100,
      service_risk: Math.round(serviceRisk),
      description: desc,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 5. AI insight for top 5 high-priority plans
  if (config.aiEnabled && plans.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topPlans = plans
        .filter(p => p.severity === 'critical' || p.severity === 'high')
        .slice(0, 5);
      for (const p of topPlans) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant revenue optimization AI specializing in reservation management. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Slot ${DOW_NAMES[p.day_of_week]} ${p.hour}:00 — capacity ${p.capacity_seats} seats, current bookings ${p.current_bookings}, predicted no-shows ${p.predicted_no_shows} (${(p.historical_no_show_rate * 100).toFixed(0)}% rate), walk-ins ${p.predicted_walk_ins}. Optimal overbook: +${p.optimal_overbook_count} seats. Est revenue gain ${fmt$(p.est_revenue_gain)}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          p.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 6. Persist
  try {
    await db.query(`DELETE FROM overbooking_plan WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const p of plans) {
    try {
      await db.query(`CREATE overbooking_plan CONTENT $data`, {
        data: { ...p, detected_at: p.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { plans, generated: plans.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActivePlans = async (db: ReturnType<typeof useDB>): Promise<OverbookingPlan[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM overbooking_plan
       WHERE status = 'open'
       ORDER BY est_revenue_gain DESC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  overbookSlots: number;
  atRiskSlots: number;
  totalRevenueGain: number;
  avgNoShowRate: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'slot_overbook') AS overbook,
         math::count(rule_id = 'slot_at_risk') AS at_risk,
         math::sum(est_revenue_gain) AS gain,
         math::mean(historical_no_show_rate) AS avg_ns_rate
       FROM overbooking_plan
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      overbookSlots: safeNumber(r.overbook, 0),
      atRiskSlots: safeNumber(r.at_risk, 0),
      totalRevenueGain: safeNumber(r.gain, 0),
      avgNoShowRate: safeNumber(r.avg_ns_rate, 0),
    };
  } catch {
    return { overbookSlots: 0, atRiskSlots: 0, totalRevenueGain: 0, avgNoShowRate: 0 };
  }
};

export const updatePlanStatus = async (
  db: ReturnType<typeof useDB>,
  planId: string,
  status: 'applied' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: planId, status });
};
