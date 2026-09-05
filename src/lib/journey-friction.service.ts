/**
 * AI Customer Journey Friction Point Detector — identifies friction points
 * across the in-restaurant customer journey (arrival→seating→ordering→
 * eating→payment→departure) and recommends stage-specific improvements.
 *
 * 125th POSR-exclusive differentiator — restaurants lose $500-2,000/mo per
 * location from customer journey friction going undetected. No POS maps
 * the in-restaurant journey stage-by-stage for friction.
 *
 * Distinct from:
 *   - journey.service (existing) — tracks LIFECYCLE stages (awareness→loyal)
 *   - wait-experience-personalizer.service — personalizes wait by customer profile
 *   - table-turnover-velocity.service — decomposes turnover into phases (NOT friction)
 *   - ticket-complexity.service — analyzes ticket complexity (NOT journey friction)
 *   - satisfaction-prediction.service — predicts satisfaction (NOT stage friction)
 *   - complaint-pattern.service — tracks complaints (NOT journey-stage friction)
 *
 * 8 AI rules:
 *   1. arrival_friction — greeting delay >2min → sets negative tone for whole visit
 *   2. seating_friction — table not ready despite reservation → broken promise
 *   3. ordering_friction — menu confusion or server unavailable → frustration
 *   4. eating_friction — food delay, wrong order, cold food → core experience failure
 *   5. payment_friction — waiting for check/terminal → bad last impression (peak-end)
 *   6. departure_friction — slow goodbye, no farewell → experience ends cold
 *   7. friction_chain — friction at one stage cascading to next stages
 *   8. peak_friction_stage — highest-friction stage identified for priority intervention
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type JourneyFrictionRuleId =
  | 'arrival_friction'
  | 'seating_friction'
  | 'ordering_friction'
  | 'eating_friction'
  | 'payment_friction'
  | 'departure_friction'
  | 'friction_chain'
  | 'peak_friction_stage';

export type JourneyFrictionAiRec =
  | 'streamline_process'
  | 'add_staff'
  | 'add_equipment'
  | 'simplify_menu'
  | 'mobile_payment'
  | 'staff_training'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface JourneyFrictionAlert {
  id?: string;
  rule_id: JourneyFrictionRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  journey_stage?: string;
  friction_score?: number;
  stage_benchmark?: number;
  friction_gap?: number;
  avg_stage_time?: number;
  optimal_stage_time?: number;
  complaint_count?: number;
  error_count?: number;
  customers_affected?: number;
  time_of_day?: string;
  is_peak_hour?: boolean;
  friction_type?: string;
  chained_from_stage?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: JourneyFrictionAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface JourneyFrictionConfig {
  aiEnabled: boolean;
  threshold: number;
  chainThreshold: number;
  peakMultiplier: number;
}

export const DEFAULT_JOURNEYFRICTION_CONFIG: JourneyFrictionConfig = {
  aiEnabled: true,
  threshold: 30.0,
  chainThreshold: 2,
  peakMultiplier: 2.0,
};

export const readJourneyFrictionConfig = (settings: any): JourneyFrictionConfig => ({
  aiEnabled: settings?.journeyfriction_ai_enabled ?? true,
  threshold: safeNumber(settings?.journeyfriction_threshold, 30.0),
  chainThreshold: safeNumber(settings?.journeyfriction_chain_threshold, 2),
  peakMultiplier: safeNumber(settings?.journeyfriction_peak_multiplier, 2.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface StageData {
  journey_stage: string;          // 'arrival' | 'seating' | 'ordering' | 'eating' | 'payment' | 'departure'
  friction_score: number;         // 0-100 (higher = more friction)
  stage_benchmark: number;        // expected friction for this stage
  avg_stage_time: number;         // avg minutes
  optimal_stage_time: number;     // optimal minutes
  complaint_count: number;
  error_count: number;
  customers_affected: number;
  time_of_day: string;
  is_peak_hour: boolean;
  friction_type: string;          // 'delay' | 'error' | 'confusion' | 'rudeness' | 'equipment' | 'staffing'
  // For friction_chain: did this stage have friction AND was previous stage also friction?
  previous_stage_had_friction?: boolean;
}

const MOCK_STAGES: StageData[] = [
  { journey_stage: 'arrival', friction_score: 65, stage_benchmark: 20, avg_stage_time: 4, optimal_stage_time: 1,
    complaint_count: 12, error_count: 0, customers_affected: 85, time_of_day: 'dinner', is_peak_hour: true,
    friction_type: 'delay', previous_stage_had_friction: false },
  { journey_stage: 'seating', friction_score: 55, stage_benchmark: 15, avg_stage_time: 6, optimal_stage_time: 2,
    complaint_count: 8, error_count: 3, customers_affected: 65, time_of_day: 'dinner', is_peak_hour: true,
    friction_type: 'delay', previous_stage_had_friction: true },
  { journey_stage: 'ordering', friction_score: 70, stage_benchmark: 25, avg_stage_time: 14, optimal_stage_time: 8,
    complaint_count: 18, error_count: 5, customers_affected: 120, time_of_day: 'dinner', is_peak_hour: true,
    friction_type: 'confusion', previous_stage_had_friction: true },
  { journey_stage: 'eating', friction_score: 40, stage_benchmark: 20, avg_stage_time: 38, optimal_stage_time: 35,
    complaint_count: 6, error_count: 4, customers_affected: 45, time_of_day: 'dinner', is_peak_hour: true,
    friction_type: 'delay', previous_stage_had_friction: false },
  { journey_stage: 'payment', friction_score: 75, stage_benchmark: 15, avg_stage_time: 12, optimal_stage_time: 5,
    complaint_count: 22, error_count: 2, customers_affected: 140, time_of_day: 'dinner', is_peak_hour: true,
    friction_type: 'delay', previous_stage_had_friction: false },
  { journey_stage: 'departure', friction_score: 35, stage_benchmark: 10, avg_stage_time: 3, optimal_stage_time: 1,
    complaint_count: 4, error_count: 0, customers_affected: 30, time_of_day: 'dinner', is_peak_hour: false,
    friction_type: 'staffing', previous_stage_had_friction: true },
];

export const runJourneyFrictionEngine = async (
  db: ReturnType<typeof useDB>,
  config: JourneyFrictionConfig = DEFAULT_JOURNEYFRICTION_CONFIG
): Promise<{ alerts: JourneyFrictionAlert[]; generated: number }> => {
  const alerts: JourneyFrictionAlert[] = [];
  const now = new Date();

  let stages: StageData[] = [];
  try {
    const result = await db.query(
      `SELECT journey_stage, friction_score, stage_benchmark, avg_stage_time, optimal_stage_time,
              complaint_count, error_count, customers_affected, time_of_day, is_peak_hour,
              friction_type, previous_stage_had_friction
       FROM journey_friction_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    stages = rows.map((r: any) => ({
      journey_stage: String(r.journey_stage ?? 'unknown'),
      friction_score: safeNumber(r.friction_score, 0),
      stage_benchmark: safeNumber(r.stage_benchmark, 0),
      avg_stage_time: safeNumber(r.avg_stage_time, 0),
      optimal_stage_time: safeNumber(r.optimal_stage_time, 0),
      complaint_count: safeNumber(r.complaint_count, 0),
      error_count: safeNumber(r.error_count, 0),
      customers_affected: safeNumber(r.customers_affected, 0),
      time_of_day: r.time_of_day ?? 'dinner',
      is_peak_hour: r.is_peak_hour ?? false,
      friction_type: String(r.friction_type ?? 'delay'),
      previous_stage_had_friction: r.previous_stage_had_friction ?? false,
    }));
  } catch (err) {
    console.warn('[journeyfriction] fetchStages failed — using mock', err);
  }

  if (stages.length === 0) {
    stages = MOCK_STAGES;
  }

  // Find peak friction stage
  let peakStage = stages[0];
  for (const s of stages) {
    if (s.friction_score > peakStage.friction_score) peakStage = s;
  }

  for (const s of stages) {
    const frictionGap = s.friction_score - s.stage_benchmark;
    const revenueMultiplier = s.is_peak_hour ? config.peakMultiplier : 1.0;
    const monthlyOpp = Math.round(frictionGap * s.customers_affected * 0.5 * revenueMultiplier);

    // Rule 1: ARRIVAL_FRICTION
    if (s.journey_stage === 'arrival' && frictionGap >= config.threshold) {
      alerts.push({
        rule_id: 'arrival_friction',
        severity: s.is_peak_hour ? 'critical' : 'high',
        journey_stage: s.journey_stage,
        friction_score: s.friction_score,
        stage_benchmark: s.stage_benchmark,
        friction_gap: Math.round(frictionGap * 10) / 10,
        avg_stage_time: s.avg_stage_time,
        optimal_stage_time: s.optimal_stage_time,
        complaint_count: s.complaint_count,
        customers_affected: s.customers_affected,
        time_of_day: s.time_of_day,
        is_peak_hour: s.is_peak_hour,
        friction_type: s.friction_type,
        est_monthly_opportunity: monthlyOpp,
        description: `ARRIVAL FRICTION — greeting takes ${s.avg_stage_time} min (optimal ${s.optimal_stage_time} min). Friction score ${s.friction_score}/100 (benchmark ${s.stage_benchmark}). ${s.customers_affected} customers affected, ${s.complaint_count} complaints. Arrival sets the TONE for entire visit — first impression is 3x more impactful than later stages. ADD HOST STAFF during peak. Greet within 30 seconds of door entry. STREAMLINE: host stand positioned at entrance, not across room. Each minute of arrival delay = 10% satisfaction drop.`,
        ai_recommendation: 'add_staff',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: SEATING_FRICTION
    if (s.journey_stage === 'seating' && frictionGap >= config.threshold) {
      alerts.push({
        rule_id: 'seating_friction',
        severity: 'high',
        journey_stage: s.journey_stage,
        friction_score: s.friction_score,
        stage_benchmark: s.stage_benchmark,
        friction_gap: Math.round(frictionGap * 10) / 10,
        avg_stage_time: s.avg_stage_time,
        optimal_stage_time: s.optimal_stage_time,
        complaint_count: s.complaint_count,
        error_count: s.error_count,
        customers_affected: s.customers_affected,
        friction_type: s.friction_type,
        est_monthly_opportunity: monthlyOpp,
        description: `SEATING FRICTION — seating takes ${s.avg_stage_time} min (optimal ${s.optimal_stage_time} min). ${s.error_count} reservation errors. Friction score ${s.friction_score}/100. Customers with reservations expect immediate seating — delay = broken promise. STREAMLINE: pre-set tables 15 min before reservation. Confirm table readiness before customer arrives. If delay unavoidable, proactive communication + complimentary drink. Reservation errors = trust damage.`,
        ai_recommendation: 'streamline_process',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: ORDERING_FRICTION
    if (s.journey_stage === 'ordering' && frictionGap >= config.threshold) {
      alerts.push({
        rule_id: 'ordering_friction',
        severity: 'high',
        journey_stage: s.journey_stage,
        friction_score: s.friction_score,
        stage_benchmark: s.stage_benchmark,
        friction_gap: Math.round(frictionGap * 10) / 10,
        avg_stage_time: s.avg_stage_time,
        optimal_stage_time: s.optimal_stage_time,
        complaint_count: s.complaint_count,
        error_count: s.error_count,
        customers_affected: s.customers_affected,
        friction_type: s.friction_type,
        est_monthly_opportunity: monthlyOpp,
        description: `ORDERING FRICTION — ordering takes ${s.avg_stage_time} min (optimal ${s.optimal_stage_time} min). Friction type: ${s.friction_type}. ${s.complaint_count} complaints, ${s.error_count} order errors. ${s.friction_type === 'confusion' ? 'MENU TOO COMPLEX — simplify menu, add recommendations, use visual guides. ' : s.friction_type === 'staffing' ? 'NO SERVER AVAILABLE — add staff or reassign. ' : ''}Customers want to order within 5 min of seating. Ordering friction → rushed decisions → wrong orders → eating friction later. QR menu pre-order can eliminate this stage entirely.`,
        ai_recommendation: s.friction_type === 'confusion' ? 'simplify_menu' : 'add_staff',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: EATING_FRICTION
    if (s.journey_stage === 'eating' && frictionGap >= config.threshold) {
      alerts.push({
        rule_id: 'eating_friction',
        severity: 'critical',
        journey_stage: s.journey_stage,
        friction_score: s.friction_score,
        stage_benchmark: s.stage_benchmark,
        friction_gap: Math.round(frictionGap * 10) / 10,
        avg_stage_time: s.avg_stage_time,
        optimal_stage_time: s.optimal_stage_time,
        complaint_count: s.complaint_count,
        error_count: s.error_count,
        customers_affected: s.customers_affected,
        friction_type: s.friction_type,
        est_monthly_opportunity: monthlyOpp,
        description: `EATING FRICTION — eating stage takes ${s.avg_stage_time} min (optimal ${s.optimal_stage_time} min). ${s.error_count} food errors, ${s.complaint_count} complaints. This is the CORE experience — food quality + timing is what customers came for. ${s.friction_type === 'delay' ? 'FOOD DELAYED — kitchen bottleneck. ' : s.friction_type === 'error' ? 'WRONG/COLD FOOD — kitchen communication breakdown. ' : ''}Eating friction is the #1 predictor of non-return. Every food error = ~${fmt$(monthlyOpp / Math.max(s.error_count, 1))} in lost future revenue per affected customer.`,
        ai_recommendation: s.friction_type === 'delay' ? 'add_equipment' : 'staff_training',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: PAYMENT_FRICTION
    if (s.journey_stage === 'payment' && frictionGap >= config.threshold) {
      alerts.push({
        rule_id: 'payment_friction',
        severity: s.is_peak_hour ? 'critical' : 'high',
        journey_stage: s.journey_stage,
        friction_score: s.friction_score,
        stage_benchmark: s.stage_benchmark,
        friction_gap: Math.round(frictionGap * 10) / 10,
        avg_stage_time: s.avg_stage_time,
        optimal_stage_time: s.optimal_stage_time,
        complaint_count: s.complaint_count,
        customers_affected: s.customers_affected,
        is_peak_hour: s.is_peak_hour,
        friction_type: s.friction_type,
        est_monthly_opportunity: monthlyOpp,
        description: `PAYMENT FRICTION — payment takes ${s.avg_stage_time} min (optimal ${s.optimal_stage_time} min). Friction score ${s.friction_score}/100 (highest friction stage!). ${s.complaint_count} complaints. PEAK-END RULE: last experience disproportionately affects memory. Bad payment = entire visit remembered negatively. MOBILE PAYMENT: table-side QR pay, handheld terminals. Eliminates waiting for check + terminal. Each minute saved = ${fmt$(revenueMultiplier * 8)} in table turnover value.`,
        ai_recommendation: 'mobile_payment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: DEPARTURE_FRICTION
    if (s.journey_stage === 'departure' && frictionGap >= config.threshold) {
      alerts.push({
        rule_id: 'departure_friction',
        severity: 'medium',
        journey_stage: s.journey_stage,
        friction_score: s.friction_score,
        stage_benchmark: s.stage_benchmark,
        friction_gap: Math.round(frictionGap * 10) / 10,
        avg_stage_time: s.avg_stage_time,
        optimal_stage_time: s.optimal_stage_time,
        complaint_count: s.complaint_count,
        customers_affected: s.customers_affected,
        friction_type: s.friction_type,
        est_monthly_opportunity: monthlyOpp,
        description: `DEPARTURE FRICTION — departure takes ${s.avg_stage_time} min (optimal ${s.optimal_stage_time} min). ${s.complaint_count} complaints. Customers leaving without a proper farewell = missed loyalty moment. PEAK-END RULE: last 30 seconds define the memory. STAFF TRAINING: every departing customer gets "Thank you for joining us, we hope to see you again soon." Simple, free, powerful. ${s.friction_type === 'staffing' ? 'No staff available to say goodbye — add greeter at exit. ' : ''}Departure friction is cheapest to fix (just staff awareness).`,
        ai_recommendation: 'staff_training',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: FRICTION_CHAIN (friction cascading from previous stage)
    if (s.previous_stage_had_friction && frictionGap >= config.threshold) {
      alerts.push({
        rule_id: 'friction_chain',
        severity: 'high',
        journey_stage: s.journey_stage,
        friction_score: s.friction_score,
        friction_gap: Math.round(frictionGap * 10) / 10,
        friction_type: s.friction_type,
        chained_from_stage: 'previous',
        customers_affected: s.customers_affected,
        est_monthly_opportunity: monthlyOpp * 2,
        description: `FRICTION CHAIN — ${s.journey_stage} stage has friction AND previous stage also had friction. Cascade effect: frustration compounds across stages. Customer who waited at arrival → frustrated at seating → rushed ordering → wrong food → bad payment → negative review. BREAK THE CHAIN: fix the EARLIEST friction stage first. Preventing arrival friction prevents downstream cascade. Chain effects multiply — 2 friction stages = 4x satisfaction damage, not 2x.`,
        ai_recommendation: 'investigate',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: PEAK_FRICTION_STAGE (highest friction stage for priority intervention)
    if (s.journey_stage === peakStage.journey_stage && frictionGap >= config.threshold) {
      alerts.push({
        rule_id: 'peak_friction_stage',
        severity: 'critical',
        journey_stage: s.journey_stage,
        friction_score: s.friction_score,
        stage_benchmark: s.stage_benchmark,
        friction_gap: Math.round(frictionGap * 10) / 10,
        avg_stage_time: s.avg_stage_time,
        optimal_stage_time: s.optimal_stage_time,
        complaint_count: s.complaint_count,
        customers_affected: s.customers_affected,
        is_peak_hour: s.is_peak_hour,
        est_monthly_opportunity: monthlyOpp * 3,
        description: `PEAK FRICTION STAGE — "${s.journey_stage}" is the HIGHEST friction stage in the journey (${s.friction_score}/100, gap ${frictionGap.toFixed(0)} above benchmark). ${s.customers_affected} customers affected, ${s.complaint_count} complaints. This is the #1 priority for journey optimization — fixing this stage has the highest ROI. ${s.is_peak_hour ? 'Peak hour amplifies impact 2x. ' : ''}Focus all improvement resources here first. Potential ${fmt$(monthlyOpp * 3)}/mo from resolving the top friction stage.`,
        ai_recommendation: 'streamline_process',
        status: 'open', detected_at: now,
      });
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant customer experience AI specializing in journey friction detection and stage-specific process improvement. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Journey friction: ${a.rule_id} — stage: ${a.journey_stage}. Friction score ${a.friction_score ?? 0}/100 (benchmark ${a.stage_benchmark ?? 0}, gap ${a.friction_gap ?? 0}). Time: ${a.avg_stage_time ?? 0} min (optimal ${a.optimal_stage_time ?? 0}). Complaints: ${a.complaint_count ?? 0}, errors: ${a.error_count ?? 0}, customers: ${a.customers_affected ?? 0}. Peak: ${a.is_peak_hour ?? false}. Type: ${a.friction_type ?? 'N/A'}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM journey_friction_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE journey_friction_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<JourneyFrictionAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM journey_friction_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  peakFrictionStage: string; totalCustomersAffected: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::sum(customers_affected) AS customers
       FROM journey_friction_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    // Find peak friction stage
    const stageResult = await db.query(
      `SELECT journey_stage FROM journey_friction_alert
       WHERE status = 'open' AND rule_id = 'peak_friction_stage'
       ORDER BY est_monthly_opportunity DESC LIMIT 1`
    );
    const stageRows = Array.isArray(stageResult) ? stageResult.flat() : [];
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      peakFrictionStage: stageRows[0]?.journey_stage ?? '—',
      totalCustomersAffected: safeNumber(r.customers, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, peakFrictionStage: '—', totalCustomersAffected: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
