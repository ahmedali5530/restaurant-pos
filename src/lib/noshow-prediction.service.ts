/**
 * AI Reservation No-Show Prediction service — 5th POSR-exclusive differentiator.
 *
 * Research finding: Restaurants lose $4-6k/year average to no-shows (up to 20%
 * industry-wide no-show rate). OpenTable has basic no-show scoring but
 * Toast and Square have NO no-show prediction at all. POSR offers it free.
 *
 * Scans upcoming reservations (next 14 days) and scores each on 10 risk factors:
 *   1. CUSTOMER_HISTORY  — prior no-shows by this customer (up to +30)
 *   2. NEW_CUSTOMER      — first-time reservation (+12)
 *   3. LARGE_PARTY       — party size >= 6 (+10)
 *   4. PEAK_SLOT         — Fri/Sat 18:00-21:00 (+8)
 *   5. SOURCE_RISK       — online/third-party less committed (+8)
 *   6. UNCONFIRMED       — pending status (+10)
 *   7. LONG_LEAD_TIME    — booked > 14 days ahead (+8)
 *   8. LATE_SLOT         — reservation after 21:00 (+6)
 *   9. DOW_BIAS         — historical no-show rate for that weekday (up to +15)
 *  10. COMMITMENT_BONUS  — special_requests present LOWER risk (-10)
 *
 * Each reservation gets a 0-100 risk score + AI insight + recommendation:
 *   confirm_now | require_deposit | call_reminder | overbook_slot | accept_risk | block_customer
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NoShowRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type NoShowRecommendation =
  | 'confirm_now' | 'require_deposit' | 'call_reminder'
  | 'overbook_slot' | 'accept_risk' | 'block_customer';

export interface RiskFactor {
  weight: number;
  detail: string;
}

export interface NoShowPrediction {
  id?: string;
  reservation?: string;
  customer?: string;
  customer_name: string;
  customer_phone?: string;
  party_size: number;
  reservation_date: Date;
  source: string;
  risk_score: number;          // 0-100
  risk_level: NoShowRiskLevel;
  risk_factors?: Record<string, RiskFactor>;
  est_revenue_at_risk: number;  // party_size * avg_check
  ai_insight?: string;
  ai_recommendation?: NoShowRecommendation;
  action_taken: string;
  branch_id?: string;
  predicted_at: Date;
  updated_at?: Date;
}

export interface NoShowConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  largePartySize: number;
  peakStartHour: number;
  peakEndHour: number;
  longLeadDays: number;
  highRiskThreshold: number;
  criticalRiskThreshold: number;
  depositThreshold: number;
}

export const DEFAULT_NOSHOW_CONFIG: NoShowConfig = {
  aiEnabled: true,
  lookbackDays: 365,
  largePartySize: 6,
  peakStartHour: 18,
  peakEndHour: 21,
  longLeadDays: 14,
  highRiskThreshold: 65,
  criticalRiskThreshold: 85,
  depositThreshold: 75,
};

export const readNoShowConfig = (settings: any): NoShowConfig => ({
  aiEnabled: settings?.noshow_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.noshow_lookback_days, 365),
  largePartySize: safeNumber(settings?.noshow_large_party_size, 6),
  peakStartHour: safeNumber(settings?.noshow_peak_start_hour, 18),
  peakEndHour: safeNumber(settings?.noshow_peak_end_hour, 21),
  longLeadDays: safeNumber(settings?.noshow_long_lead_days, 14),
  highRiskThreshold: safeNumber(settings?.noshow_high_risk_threshold, 65),
  criticalRiskThreshold: safeNumber(settings?.noshow_critical_risk_threshold, 85),
  depositThreshold: safeNumber(settings?.noshow_deposit_threshold, 75),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toLevel = (score: number, cfg: NoShowConfig): NoShowRiskLevel => {
  if (score >= cfg.criticalRiskThreshold) return 'critical';
  if (score >= cfg.highRiskThreshold) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

// Historical no-show rate per day-of-week (0=Sun .. 6=Sat)
const computeDowBias = async (db: any, cfg: NoShowConfig): Promise<number[]> => {
  try {
    const result = await db.query(
      `SELECT date, status FROM reservation
       WHERE status IN ['no_show', 'completed', 'cancelled']
         AND date > time::now() - ${cfg.lookbackDays}d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const totals = new Array(7).fill(0);
    const noShows = new Array(7).fill(0);
    for (const r of rows) {
      const dow = new Date(r.date).getDay();
      totals[dow]++;
      if (r.status === 'no_show') noShows[dow]++;
    }
    // Convert to bias points (0-15): rate * 60, capped at 15
    return totals.map((t, i) => {
      if (t < 5) return 0; // not enough data
      const rate = noShows[i] / t;
      return Math.min(15, Math.round(rate * 60));
    });
  } catch (err) {
    console.warn('[noshow] dow bias failed', err);
    return new Array(7).fill(0);
  }
};

const getAvgCheck = async (db: any): Promise<number> => {
  try {
    const result = await db.query(
      `SELECT math::mean(total) AS avg_check, math::mean(number_of_guests) AS avg_guests
       FROM order WHERE status = 'Paid' AND deleted_at IS NONE
         AND created_at > time::now() - 90d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const avgCheck = safeNumber(rows[0]?.avg_check, 0);
    const avgGuests = safeNumber(rows[0]?.avg_guests, 0);
    // Per-guest average check
    return avgGuests > 0 ? avgCheck / avgGuests : avgCheck;
  } catch {
    return 0;
  }
};

const getCustomerHistory = async (db: any, customerId: string, cfg: NoShowConfig): Promise<{
  total: number; noShows: number; completed: number;
}> => {
  if (!customerId) return { total: 0, noShows: 0, completed: 0 };
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(status = 'no_show') AS no_shows,
         math::count(status = 'completed') AS completed
       FROM reservation
       WHERE customer = $cid AND date > time::now() - ${cfg.lookbackDays}d
       GROUP ALL`,
      { cid: customerId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      noShows: safeNumber(row.no_shows, 0),
      completed: safeNumber(row.completed, 0),
    };
  } catch {
    return { total: 0, noShows: 0, completed: 0 };
  }
};

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

const scoreReservation = (
  res: any,
  history: { total: number; noShows: number; completed: number },
  dowBias: number[],
  avgCheckPerGuest: number,
  cfg: NoShowConfig
): { score: number; factors: Record<string, RiskFactor>; revenueAtRisk: number } => {
  const factors: Record<string, RiskFactor> = {};
  let score = 0;

  const resDate = new Date(res.date);
  const hour = resDate.getHours();
  const dow = resDate.getDay();
  const partySize = safeNumber(res.party_size, 1);
  const createdAt = res.created_at ? new Date(res.created_at) : new Date();
  const leadDays = Math.max(0, (resDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  // 1. CUSTOMER_HISTORY — prior no-shows (up to +30)
  if (history.total > 0) {
    const noShowRate = history.noShows / history.total;
    const weight = Math.min(30, Math.round(noShowRate * 50));
    if (weight > 0) {
      factors.customer_history = {
        weight,
        detail: `${history.noShows}/${history.total} prior reservations were no-shows (${(noShowRate * 100).toFixed(0)}%)`,
      };
      score += weight;
    }
  } else {
    // 2. NEW_CUSTOMER — no history (+12)
    factors.new_customer = {
      weight: 12,
      detail: 'First-time reservation — no historical attendance record',
    };
    score += 12;
  }

  // 3. LARGE_PARTY — party size >= threshold (+10)
  if (partySize >= cfg.largePartySize) {
    factors.large_party = {
      weight: 10,
      detail: `Large party of ${partySize} — coordination friction increases no-show rate`,
    };
    score += 10;
  }

  // 4. PEAK_SLOT — Fri/Sat evening (+8)
  const isPeakDay = dow === 5 || dow === 6;
  const isPeakHour = hour >= cfg.peakStartHour && hour < cfg.peakEndHour;
  if (isPeakDay && isPeakHour) {
    factors.peak_slot = {
      weight: 8,
      detail: `Peak slot — ${isPeakDay ? 'weekend' : 'weekday'} ${hour}:00 (Fri/Sat ${cfg.peakStartHour}:00-${cfg.peakEndHour}:00)`,
    };
    score += 8;
  }

  // 5. SOURCE_RISK — online/third-party less committed (+8)
  if (res.source === 'online' || res.source === 'third_party') {
    factors.source_risk = {
      weight: 8,
      detail: `Booked via ${res.source} — lower commitment than phone bookings`,
    };
    score += 8;
  }

  // 6. UNCONFIRMED — pending status (+10)
  if (res.status === 'pending') {
    factors.unconfirmed = {
      weight: 10,
      detail: 'Reservation still pending — no confirmation received',
    };
    score += 10;
  }

  // 7. LONG_LEAD_TIME — booked > N days ahead (+8)
  if (leadDays > cfg.longLeadDays) {
    factors.long_lead_time = {
      weight: 8,
      detail: `Booked ${Math.round(leadDays)} days in advance — plans change over time`,
    };
    score += 8;
  }

  // 8. LATE_SLOT — after 21:00 (+6)
  if (hour >= 21) {
    factors.late_slot = {
      weight: 6,
      detail: `Late evening slot (${hour}:00) — drop-off in attendance`,
    };
    score += 6;
  }

  // 9. DOW_BIAS — historical no-show rate for this weekday (up to +15)
  const dowWeight = dowBias[dow] ?? 0;
  if (dowWeight > 0) {
    factors.dow_bias = {
      weight: dowWeight,
      detail: `Historical ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]} no-show rate contributes ${dowWeight} pts`,
    };
    score += dowWeight;
  }

  // 10. COMMITMENT_BONUS — special_requests LOWERS risk (-10)
  if (res.special_requests && String(res.special_requests).trim().length > 0) {
    factors.commitment_bonus = {
      weight: -10,
      detail: `Special request ("${String(res.special_requests).slice(0, 40)}") — higher guest commitment`,
    };
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  const revenueAtRisk = partySize * avgCheckPerGuest;

  return { score, factors, revenueAtRisk };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (predictions: NoShowPrediction[], cfg: NoShowConfig): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || predictions.length === 0) return;

  const high = predictions.filter(p => p.risk_score >= 35).slice(0, 15);

  const prompt = `You are a restaurant reservation risk analyst.
For each upcoming reservation below, provide:
  - insight: max 200 chars — the single most likely reason for the no-show risk
  - recommendation: one of confirm_now | require_deposit | call_reminder | overbook_slot | accept_risk | block_customer

Recommendation guidance:
  - block_customer: only for chronic no-showers (3+ prior no-shows)
  - require_deposit: risk_score >= ${cfg.depositThreshold}
  - overbook_slot: high-risk peak slot where 1 extra booking is safe
  - call_reminder: medium-high risk, no deposit justified
  - confirm_now: pending status, quick win
  - accept_risk: low risk, no action needed

Reservations (JSON):
${JSON.stringify(high.map(p => ({
  name: p.customer_name,
  party_size: p.party_size,
  date: p.reservation_date,
  source: p.source,
  risk_score: p.risk_score,
  risk_factors: Object.fromEntries(
    Object.entries(p.risk_factors ?? {}).map(([k, v]) => [k, (v as any).detail])
  ),
  revenue_at_risk: p.est_revenue_at_risk,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match customer_name>",
  "insight": "<max 200 chars>",
  "recommendation": "confirm_now" | "require_deposit" | "call_reminder" | "overbook_slot" | "accept_risk" | "block_customer"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant reservation AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string; insight?: string; recommendation?: NoShowRecommendation;
    }>;
    for (const item of parsed) {
      const pred = predictions.find(p => p.customer_name === item.name);
      if (pred) {
        if (item.insight) pred.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) pred.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[noshow] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry — score upcoming reservations
// ---------------------------------------------------------------------------

export const runNoShowPrediction = async (
  db: ReturnType<typeof useDB>,
  config: NoShowConfig = DEFAULT_NOSHOW_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ predictions: NoShowPrediction[]; scanned: number }> => {
  if (onProgress) onProgress(0, 4);

  // 1. Compute DOW bias + avg check (shared across all reservations)
  const dowBias = await computeDowBias(db, config);
  if (onProgress) onProgress(1, 4);
  const avgCheckPerGuest = await getAvgCheck(db);
  if (onProgress) onProgress(2, 4);

  // 2. Fetch upcoming reservations (next 14 days, not yet completed/cancelled)
  let upcoming: any[] = [];
  try {
    const result = await db.query(
      `SELECT id, customer, customer_name, customer_phone, party_size, date,
              source, status, special_requests, created_at, branch_id
       FROM reservation
       WHERE date > time::now()
         AND date < time::now() + 14d
         AND status IN ['pending', 'confirmed']
       ORDER BY date ASC
       LIMIT 200`
    );
    upcoming = Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.warn('[noshow] failed to fetch upcoming reservations', err);
    return { predictions: [], scanned: 0 };
  }

  if (onProgress) onProgress(3, 4);

  // 3. Score each reservation
  const predictions: NoShowPrediction[] = [];
  const seenCustomers = new Map<string, { total: number; noShows: number; completed: number }>();

  for (const res of upcoming) {
    const customerId = res.customer?.toString?.() ?? '';
    let history = seenCustomers.get(customerId);
    if (!history) {
      history = customerId ? await getCustomerHistory(db, customerId, config) : { total: 0, noShows: 0, completed: 0 };
      seenCustomers.set(customerId, history);
    }

    const { score, factors, revenueAtRisk } = scoreReservation(
      res, history, dowBias, avgCheckPerGuest, config
    );

    predictions.push({
      reservation: res.id,
      customer: customerId,
      customer_name: res.customer_name ?? 'Walk-in',
      customer_phone: res.customer_phone,
      party_size: safeNumber(res.party_size, 1),
      reservation_date: new Date(res.date),
      source: res.source ?? 'phone',
      risk_score: score,
      risk_level: toLevel(score, config),
      risk_factors: factors,
      est_revenue_at_risk: Math.round(revenueAtRisk * 100) / 100,
      action_taken: 'none',
      branch_id: res.branch_id,
      predicted_at: new Date(),
    });
  }

  // 4. AI enhancement
  if (config.aiEnabled && predictions.length > 0) {
    await enhanceWithAI(predictions, config);
  }

  // 5. Persist (delete prior predictions for these reservations, then re-create)
  const reservationIds = predictions.map(p => p.reservation).filter(Boolean);
  if (reservationIds.length > 0) {
    try {
      // Wipe old predictions for the same reservations (refresh)
      await db.query(
        `DELETE FROM noshow_prediction WHERE reservation IN $ids`,
        { ids: reservationIds }
      );
    } catch { /* non-fatal */ }
  }
  for (const pred of predictions) {
    try {
      await db.query(`CREATE noshow_prediction CONTENT $data`, {
        data: {
          ...pred,
          reservation_date: pred.reservation_date.toISOString(),
          predicted_at: pred.predicted_at.toISOString(),
        },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(4, 4);
  return { predictions, scanned: upcoming.length };
};

// ---------------------------------------------------------------------------
// Read + update
// ---------------------------------------------------------------------------

export const getUpcomingPredictions = async (
  db: ReturnType<typeof useDB>
): Promise<NoShowPrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM noshow_prediction
       WHERE reservation_date > time::now()
         AND action_taken = 'none'
       ORDER BY
         CASE risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         risk_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getNoShowSummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  totalUpcoming: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  revenueAtRisk: number;
  chronicNoShowers: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level = 'critical') AS critical,
         math::count(risk_level = 'high') AS high,
         math::count(risk_level = 'medium') AS medium,
         math::count(risk_level = 'low') AS low,
         math::sum(est_revenue_at_risk) AS revenue_at_risk
       FROM noshow_prediction
       WHERE reservation_date > time::now() AND action_taken = 'none'
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      totalUpcoming: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      high: safeNumber(row.high, 0),
      medium: safeNumber(row.medium, 0),
      low: safeNumber(row.low, 0),
      revenueAtRisk: safeNumber(row.revenue_at_risk, 0),
      chronicNoShowers: 0,
    };
  } catch {
    return { totalUpcoming: 0, critical: 0, high: 0, medium: 0, low: 0, revenueAtRisk: 0, chronicNoShowers: 0 };
  }
};

export const updatePredictionAction = async (
  db: ReturnType<typeof useDB>,
  predictionId: string,
  action: string
): Promise<void> => {
  await db.query(
    `UPDATE $id SET action_taken = $action, updated_at = time::now()`,
    { id: predictionId, action }
  );
};
