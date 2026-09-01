/**
 * AI Delivery Driver Performance Coach — individual driver coaching.
 *
 * 66th POSR-exclusive differentiator — delivery driver performance varies
 * 40-60% between best and worst (McKinsey). Slow drivers cost $2-5/order in
 * cold food complaints. Bad ratings reduce repeat delivery by 25% (DoorDash).
 *
 * Distinct from:
 *   - delivery-analytics.service (PLATFORM metrics — NOT individual driver coaching)
 *   - delivery-route.service (ROUTE optimization — NOT driver skill development)
 *   - server-coach.service (WAITSTAFF coaching — NOT delivery drivers)
 *   - server-performance.service (SERVER ranking — NOT driver metrics)
 *   - delivery (operational delivery management — NOT AI coaching)
 *
 * Coaches individual drivers across 5 dimensions:
 *   1. Speed (avg delivery time vs target)
 *   2. Accuracy (correct orders delivered)
 *   3. Rating (customer satisfaction)
 *   4. Route efficiency (km per delivery)
 *   5. Complaint rate (issues per delivery)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type DriverCoachRuleId =
  | 'speed_coaching'
  | 'accuracy_coaching'
  | 'rating_improvement'
  | 'route_efficiency'
  | 'top_performer';

export type DriverCoachAiRec =
  | 'mentor_assignment'
  | 'route_retraining'
  | 'performance_review'
  | 'recognize'
  | 'monitor';

export interface DriverCoach {
  id?: string;
  rule_id: DriverCoachRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  driver_id?: string;
  driver_name?: string;
  total_deliveries: number;
  avg_delivery_time: number;
  on_time_rate: number;
  avg_rating: number;
  complaint_rate: number;
  fuel_efficiency: number;
  overall_score: number;
  top_strength?: string;
  improvement_area?: string;
  coaching_actions?: string;
  est_revenue_impact: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: DriverCoachAiRec;
  status: 'open' | 'coaching_applied' | 'reviewed' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface DriverCoachConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  minDeliveries: number;
  targetTimeMin: number;
}

export const DEFAULT_DRIVER_COACH_CONFIG: DriverCoachConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  minDeliveries: 5,
  targetTimeMin: 30,
};

export const readDriverCoachConfig = (settings: any): DriverCoachConfig => ({
  aiEnabled: settings?.driver_coach_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.driver_coach_lookback_days, 30),
  minDeliveries: safeNumber(settings?.driver_coach_min_deliveries, 5),
  targetTimeMin: safeNumber(settings?.driver_coach_target_time_min, 30),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Score dimensions (0-100 each, overall = weighted average)
const computeSpeedScore = (avgTime: number, target: number): number => {
  if (avgTime <= 0) return 0;
  const ratio = target / avgTime;
  return Math.min(100, Math.max(0, ratio * 70));
};

const computeAccuracyScore = (complaintRate: number): number => {
  return Math.max(0, 100 - complaintRate * 200);
};

const computeRatingScore = (avgRating: number): number => {
  return (avgRating / 5) * 100;
};

const computeOnTimeScore = (onTimeRate: number): number => {
  return onTimeRate * 100;
};

const computeRouteScore = (kmPerDelivery: number): number => {
  if (kmPerDelivery <= 3) return 90;
  if (kmPerDelivery <= 5) return 75;
  if (kmPerDelivery <= 8) return 55;
  return 30;
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface DriverMetric {
  driver_id: string;
  driver_name: string;
  total_deliveries: number;
  avg_delivery_time: number;
  on_time_count: number;
  complaint_count: number;
  avg_rating: number;
  total_km: number;
}

/**
 * Run the driver coach engine.
 */
export const runDriverCoachEngine = async (
  db: ReturnType<typeof useDB>,
  config: DriverCoachConfig = DEFAULT_DRIVER_COACH_CONFIG
): Promise<{ coachings: DriverCoach[]; generated: number }> => {
  const coachings: DriverCoach[] = [];
  const now = new Date();
  const lookback = config.lookbackDays;

  // 1. Fetch delivery metrics per driver
  let driverMetrics: DriverMetric[] = [];
  try {
    const result = await db.query(
      `SELECT
         delivery.driver.id AS driver_id,
         delivery.driver.name AS driver_name,
         count() AS total_deliveries,
         math::mean(time::minute(completed_at) - time::minute(created_at)) AS avg_delivery_time,
         math::count(completed_at <= time::now() + 30m) AS on_time_count,
         math::count(status = 'Refunded' OR status = 'Complained') AS complaint_count,
         math::mean(rating) AS avg_rating,
         math::sum(distance_km) AS total_km
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND delivery IS NOT NONE
         AND delivery.driver IS NOT NONE
         AND created_at > time::now() - ${lookback}d
       GROUP BY delivery.driver.id, delivery.driver.name`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    driverMetrics = rows.map((r: any) => ({
      driver_id: String(r.driver_id ?? ''),
      driver_name: String(r.driver_name ?? 'Unknown Driver'),
      total_deliveries: safeNumber(r.total_deliveries, 0),
      avg_delivery_time: safeNumber(r.avg_delivery_time, 0),
      on_time_count: safeNumber(r.on_time_count, 0),
      complaint_count: safeNumber(r.complaint_count, 0),
      avg_rating: safeNumber(r.avg_rating, 0),
      total_km: safeNumber(r.total_km, 0),
    })).filter(d => d.total_deliveries >= config.minDeliveries);
  } catch (err) {
    console.warn('[driver-coach] fetchMetrics failed', err);
  }

  if (driverMetrics.length === 0) return { coachings: [], generated: 0 };

  // 2. Compute scores per driver
  const scoredDrivers = driverMetrics.map(d => {
    const onTimeRate = d.total_deliveries > 0 ? d.on_time_count / d.total_deliveries : 0;
    const complaintRate = d.total_deliveries > 0 ? d.complaint_count / d.total_deliveries : 0;
    const kmPerDelivery = d.total_deliveries > 0 ? d.total_km / d.total_deliveries : 0;

    const speedScore = computeSpeedScore(d.avg_delivery_time, config.targetTimeMin);
    const accuracyScore = computeAccuracyScore(complaintRate);
    const ratingScore = computeRatingScore(d.avg_rating);
    const onTimeScore = computeOnTimeScore(onTimeRate);
    const routeScore = computeRouteScore(kmPerDelivery);

    // Overall = weighted average (speed 25%, accuracy 20%, rating 25%, on-time 20%, route 10%)
    const overallScore = (speedScore * 0.25 + accuracyScore * 0.20 + ratingScore * 0.25 + onTimeScore * 0.20 + routeScore * 0.10);

    const dimensions = [
      { name: 'speed', score: speedScore },
      { name: 'accuracy', score: accuracyScore },
      { name: 'rating', score: ratingScore },
      { name: 'on_time', score: onTimeScore },
      { name: 'route_efficiency', score: routeScore },
    ].sort((a, b) => b.score - a.score);

    return {
      ...d,
      on_time_rate: onTimeRate,
      complaint_rate: complaintRate,
      fuel_efficiency: kmPerDelivery,
      speed_score: speedScore,
      accuracy_score: accuracyScore,
      rating_score: ratingScore,
      on_time_score: onTimeScore,
      route_score: routeScore,
      overall_score: overallScore,
      top_strength: dimensions[0].name,
      improvement_area: dimensions[dimensions.length - 1].name,
    };
  });

  // 3. Generate coaching per driver
  for (const driver of scoredDrivers) {
    let ruleId: DriverCoachRuleId;
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let aiRec: DriverCoachAiRec;
    let desc = '';
    const actions: string[] = [];

    // Determine primary coaching need
    if (driver.speed_score < 40) {
      ruleId = 'speed_coaching';
      severity = driver.avg_delivery_time > 50 ? 'critical' : 'high';
      aiRec = 'route_retraining';
      actions.push(`Review route planning — avg ${driver.avg_delivery_time.toFixed(0)}min vs ${config.targetTimeMin}min target`);
      actions.push('Shadow top-performing driver for 3 deliveries');
      actions.push('Practice navigation app optimization (waypoints, traffic avoidance)');
      desc = `${driver.driver_name}: SLOW delivery — avg ${driver.avg_delivery_time.toFixed(0)}min (target ${config.targetTimeMin}min), speed score ${driver.speed_score.toFixed(0)}/100`;
    } else if (driver.complaint_rate > 0.10) {
      ruleId = 'accuracy_coaching';
      severity = driver.complaint_rate > 0.20 ? 'critical' : 'high';
      aiRec = 'performance_review';
      actions.push(`Review ${driver.complaint_count} complaints — identify patterns (wrong items, spills, late)`);
      actions.push('Implement double-check protocol before departure');
      actions.push('Provide insulated delivery bag training');
      desc = `${driver.driver_name}: HIGH complaint rate ${(driver.complaint_rate * 100).toFixed(0)}% (${driver.complaint_count}/${driver.total_deliveries} deliveries)`;
    } else if (driver.avg_rating < 4.0 && driver.total_deliveries >= 10) {
      ruleId = 'rating_improvement';
      severity = driver.avg_rating < 3.5 ? 'high' : 'medium';
      aiRec = 'mentor_assignment';
      actions.push(`Customer rating ${driver.avg_rating.toFixed(1)}/5 — below 4.0 threshold`);
      actions.push('Focus on greeting, professionalism, and order handoff');
      actions.push('Pair with 5-star driver for mentorship (2 weeks)');
      desc = `${driver.driver_name}: LOW rating ${driver.avg_rating.toFixed(1)}/5 — needs customer service coaching`;
    } else if (driver.route_score < 50) {
      ruleId = 'route_efficiency';
      severity = 'medium';
      aiRec = 'route_retraining';
      actions.push(`Route inefficient — ${driver.fuel_efficiency.toFixed(1)}km/delivery (target <5km)`);
      actions.push('Review delivery zone mapping and batch opportunities');
      actions.push('Consider navigation app with traffic-aware routing');
      desc = `${driver.driver_name}: ROUTE inefficient — ${driver.fuel_efficiency.toFixed(1)}km/delivery, route score ${driver.route_score.toFixed(0)}/100`;
    } else if (driver.overall_score >= 80) {
      ruleId = 'top_performer';
      severity = 'low';
      aiRec = 'recognize';
      actions.push(`Top performer — overall score ${driver.overall_score.toFixed(0)}/100`);
      actions.push(`Strength: ${driver.top_strength} (${driver[`${driver.top_strength}_score` as keyof typeof driver] ?? 'N/A'})`);
      actions.push('Consider as mentor for struggling drivers');
      desc = `${driver.driver_name}: TOP PERFORMER — score ${driver.overall_score.toFixed(0)}/100, ${driver.total_deliveries} deliveries, ${driver.avg_rating.toFixed(1)}★`;
    } else {
      continue; // driver is performing adequately
    }

    // Est revenue impact: improving a slow/inaccurate driver saves $2-5/delivery
    const estRevenueImpact = driver.total_deliveries * 3.50 * (1 - driver.overall_score / 100);

    coachings.push({
      rule_id: ruleId,
      severity,
      driver_id: driver.driver_id,
      driver_name: driver.driver_name,
      total_deliveries: driver.total_deliveries,
      avg_delivery_time: Math.round(driver.avg_delivery_time * 10) / 10,
      on_time_rate: Math.round(driver.on_time_rate * 100) / 100,
      avg_rating: Math.round(driver.avg_rating * 10) / 10,
      complaint_rate: Math.round(driver.complaint_rate * 10000) / 10000,
      fuel_efficiency: Math.round(driver.fuel_efficiency * 10) / 10,
      overall_score: Math.round(driver.overall_score),
      top_strength: driver.top_strength,
      improvement_area: driver.improvement_area,
      coaching_actions: JSON.stringify(actions),
      est_revenue_impact: Math.round(estRevenueImpact * 100) / 100,
      description: desc,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 4. AI insight for top 5 critical/high coachings
  if (config.aiEnabled && coachings.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topCoachings = coachings
        .filter(c => c.severity === 'critical' || c.severity === 'high')
        .slice(0, 5);
      for (const c of topCoachings) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a delivery driver coaching AI for restaurants. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Driver "${c.driver_name}": ${c.total_deliveries} deliveries, avg ${c.avg_delivery_time}min, on-time ${(c.on_time_rate * 100).toFixed(0)}%, rating ${c.avg_rating}/5, complaints ${(c.complaint_rate * 100).toFixed(0)}%, ${c.fuel_efficiency}km/delivery. Overall score ${c.overall_score}/100. Rule: ${c.rule_id}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          c.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM driver_coach WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const c of coachings) {
    try {
      await db.query(`CREATE driver_coach CONTENT $data`, {
        data: { ...c, detected_at: c.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { coachings, generated: coachings.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveCoachings = async (db: ReturnType<typeof useDB>): Promise<DriverCoach[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM driver_coach
       WHERE status = 'open'
       ORDER BY overall_score ASC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  driverCount: number;
  criticalCount: number;
  topPerformerCount: number;
  avgScore: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(rule_id = 'top_performer') AS top,
         math::mean(overall_score) AS score
       FROM driver_coach
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      driverCount: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      topPerformerCount: safeNumber(r.top, 0),
      avgScore: safeNumber(r.score, 0),
    };
  } catch {
    return { driverCount: 0, criticalCount: 0, topPerformerCount: 0, avgScore: 0 };
  }
};

export const updateCoachingStatus = async (
  db: ReturnType<typeof useDB>,
  coachingId: string,
  status: 'coaching_applied' | 'reviewed' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: coachingId, status });
};
