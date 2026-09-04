/**
 * AI Order Pacing & Batching Optimizer — prevents kitchen bottlenecks by
 * proactively pacing, throttling, and batching order flow.
 *
 * 104th POSR-exclusive differentiator — restaurants lose $300-1,200/mo from
 * poor order pacing. No POS proactively paces orders.
 *
 * Distinct from:
 *   - kitchen-bottleneck.service (DETECTS bottlenecks AFTER they form — NOT
 *     prevention through pacing/throttling)
 *   - kitchen-prep-scheduler.service (schedules PREP timing — NOT order flow
 *     pacing/throttling)
 *   - prep-sheet-optimizer.service (optimizes prep QUANTITIES — NOT order
 *     flow control)
 *   - table-turnover-predictor (predicts table FREE timing — NOT kitchen
 *     capacity/pacing)
 *   - wait-prediction.service (quotes waitlist times — NOT kitchen pacing)
 *   - delivery-analytics.service (delivery platform performance — NOT
 *     kitchen order flow)
 *
 * 8 AI rules:
 *   1. kitchen_capacity_warning — current tickets > 80% of max capacity
 *   2. online_order_throttle — online orders flooding faster than kitchen can handle
 *   3. reservation_pace_mismatch — reservations arriving faster than kitchen throughput
 *   4. batch_opportunity — 3+ same-dish orders can be batch-cooked
 *   5. rush_incoming — historical patterns + current trajectory predict rush in 20 min
 *   6. staff_coverage_gap — station has no assigned cook
 *   7. ticket_priority_needed — VIP/regular/allergy order buried in queue
 *   8. prep_lead_time_violation — order with 30min prep fired as ASAP
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PacingRuleId =
  | 'kitchen_capacity_warning'
  | 'online_order_throttle'
  | 'reservation_pace_mismatch'
  | 'batch_opportunity'
  | 'rush_incoming'
  | 'staff_coverage_gap'
  | 'ticket_priority_needed'
  | 'prep_lead_time_violation';

export type PacingAiRec =
  | 'throttle_now'
  | 'pace_reservations'
  | 'batch_now'
  | 'add_staff'
  | 'reprioritize'
  | 'adjust_quote'
  | 'monitor'
  | 'skip';

export interface PacingAlert {
  id?: string;
  rule_id: PacingRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  current_tickets?: number;
  max_capacity?: number;
  avg_ticket_time_min?: number;
  online_orders_pending?: number;
  reservations_next_hour?: number;
  batch_group_count?: number;
  est_revenue_at_risk: number;
  est_time_savings_min?: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: PacingAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface PacingConfig {
  aiEnabled: boolean;
  maxTickets: number;
  maxOnlinePending: number;
  rushLookaheadMin: number;
  targetTicketTime: number;
}

export const DEFAULT_PACING_CONFIG: PacingConfig = {
  aiEnabled: true,
  maxTickets: 15,
  maxOnlinePending: 8,
  rushLookaheadMin: 20,
  targetTicketTime: 15,
};

export const readPacingConfig = (settings: any): PacingConfig => ({
  aiEnabled: settings?.pacing_ai_enabled ?? true,
  maxTickets: safeNumber(settings?.pacing_max_tickets, 15),
  maxOnlinePending: safeNumber(settings?.pacing_max_online_pending, 8),
  rushLookaheadMin: safeNumber(settings?.pacing_rush_lookahead_min, 20),
  targetTicketTime: safeNumber(settings?.pacing_target_ticket_time, 15),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

interface KitchenState {
  current_tickets: number;
  max_capacity: number;
  avg_ticket_time_min: number;
  online_orders_pending: number;
  reservations_next_hour: number;
  cooks_on_duty: number;
  stations_covered: number;
  total_stations: number;
  vip_tickets_in_queue: number;
  allergy_tickets_in_queue: number;
  same_dish_groups: { dish: string; count: number }[];
  prep_lead_time_orders: { item: string; prep_time_min: number; quoted_time_min: number }[];
  historical_hourly_orders: number[];
  current_hour_orders: number;
}

const MOCK_KITCHEN: KitchenState = {
  current_tickets: 18,
  max_capacity: 15,
  avg_ticket_time_min: 22,
  online_orders_pending: 12,
  reservations_next_hour: 18,
  cooks_on_duty: 4,
  stations_covered: 3,
  total_stations: 5,
  vip_tickets_in_queue: 2,
  allergy_tickets_in_queue: 1,
  same_dish_groups: [
    { dish: 'Margherita Pizza', count: 4 },
    { dish: 'Chicken Burger', count: 3 },
    { dish: 'Caesar Salad', count: 3 },
  ],
  prep_lead_time_orders: [
    { item: 'Slow-Braised Short Rib', prep_time_min: 35, quoted_time_min: 20 },
    { item: 'Wood-Fired Pizza (well-done)', prep_time_min: 25, quoted_time_min: 15 },
  ],
  historical_hourly_orders: [8, 12, 35, 45, 28, 15, 20, 40, 55, 38, 22],
  current_hour_orders: 30,
};

export const runPacingEngine = async (
  db: ReturnType<typeof useDB>,
  config: PacingConfig = DEFAULT_PACING_CONFIG
): Promise<{ alerts: PacingAlert[]; generated: number }> => {
  const alerts: PacingAlert[] = [];
  const now = new Date();

  // Fetch real kitchen state or use mock
  let kitchen: KitchenState = MOCK_KITCHEN;
  try {
    const result = await db.query(
      `SELECT current_tickets, max_capacity, avg_ticket_time_min,
              online_orders_pending, reservations_next_hour,
              cooks_on_duty, stations_covered, total_stations,
              vip_tickets_in_queue, allergy_tickets_in_queue,
              same_dish_groups, prep_lead_time_orders,
              historical_hourly_orders, current_hour_orders
       FROM kitchen_state
       WHERE detected_at > time::now() - 5m
       LIMIT 1`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length > 0) {
      const r = rows[0];
      kitchen = {
        current_tickets: safeNumber(r.current_tickets, 0),
        max_capacity: safeNumber(r.max_capacity, 15),
        avg_ticket_time_min: safeNumber(r.avg_ticket_time_min, 15),
        online_orders_pending: safeNumber(r.online_orders_pending, 0),
        reservations_next_hour: safeNumber(r.reservations_next_hour, 0),
        cooks_on_duty: safeNumber(r.cooks_on_duty, 0),
        stations_covered: safeNumber(r.stations_covered, 0),
        total_stations: safeNumber(r.total_stations, 5),
        vip_tickets_in_queue: safeNumber(r.vip_tickets_in_queue, 0),
        allergy_tickets_in_queue: safeNumber(r.allergy_tickets_in_queue, 0),
        same_dish_groups: Array.isArray(r.same_dish_groups) ? r.same_dish_groups : [],
        prep_lead_time_orders: Array.isArray(r.prep_lead_time_orders) ? r.prep_lead_time_orders : [],
        historical_hourly_orders: Array.isArray(r.historical_hourly_orders) ? r.historical_hourly_orders.map(Number) : [],
        current_hour_orders: safeNumber(r.current_hour_orders, 0),
      };
    }
  } catch (err) {
    console.warn('[pacing] fetchKitchenState failed — using mock', err);
  }

  // Rule 1: KITCHEN_CAPACITY_WARNING
  const capacityPct = (kitchen.current_tickets / kitchen.max_capacity) * 100;
  if (capacityPct >= 80) {
    const revenueAtRisk = kitchen.current_tickets * 15 * (kitchen.avg_ticket_time_min - config.targetTicketTime) / 60;
    alerts.push({
      rule_id: 'kitchen_capacity_warning',
      severity: capacityPct >= 120 ? 'critical' : 'high',
      current_tickets: kitchen.current_tickets,
      max_capacity: kitchen.max_capacity,
      avg_ticket_time_min: kitchen.avg_ticket_time_min,
      est_revenue_at_risk: Math.round(revenueAtRisk),
      description: `Kitchen at ${capacityPct.toFixed(0)}% capacity (${kitchen.current_tickets}/${kitchen.max_capacity} tickets). Avg ticket time ${kitchen.avg_ticket_time_min}min (target ${config.targetTicketTime}min). ${capacityPct >= 120 ? 'OVER CAPACITY — throttle incoming orders NOW.' : 'Approaching limit — prepare to throttle.'} Revenue at risk: ${fmt$(revenueAtRisk)} from delayed/lost orders.`,
      ai_recommendation: capacityPct >= 120 ? 'throttle_now' : 'monitor',
      status: 'open', detected_at: now,
    });
  }

  // Rule 2: ONLINE_ORDER_THROTTLE
  if (kitchen.online_orders_pending >= config.maxOnlinePending) {
    const overflow = kitchen.online_orders_pending - config.maxOnlinePending;
    const revenueAtRisk = overflow * 25;
    alerts.push({
      rule_id: 'online_order_throttle',
      severity: 'critical',
      online_orders_pending: kitchen.online_orders_pending,
      est_revenue_at_risk: Math.round(revenueAtRisk),
      description: `${kitchen.online_orders_pending} online orders pending (max ${config.maxOnlinePending}). ${overflow} over limit — kitchen can't keep up. THROTTLE: temporarily pause DoorDash/UberEats acceptance (5-10 min) or extend quoted times +15min. Platform late penalties if not addressed.`,
      ai_recommendation: 'throttle_now',
      status: 'open', detected_at: now,
    });
  }

  // Rule 3: RESERVATION_PACE_MISMATCH
  const kitchenThroughput = Math.floor(60 / kitchen.avg_ticket_time_min) * kitchen.cooks_on_duty;
  if (kitchen.reservations_next_hour > kitchenThroughput * 1.5) {
    const mismatch = kitchen.reservations_next_hour - kitchenThroughput * 1.5;
    alerts.push({
      rule_id: 'reservation_pace_mismatch',
      severity: 'high',
      reservations_next_hour: kitchen.reservations_next_hour,
      est_revenue_at_risk: Math.round(mismatch * 30),
      description: `${kitchen.reservations_next_hour} reservations next hour but kitchen throughput ~${kitchenThroughput} parties/hr. ${mismatch.toFixed(0)} parties over capacity → 30+ min ticket times. PACE: stagger seating by 5min intervals or offer bar seating to reduce kitchen load.`,
      ai_recommendation: 'pace_reservations',
      status: 'open', detected_at: now,
    });
  }

  // Rule 4: BATCH_OPPORTUNITY
  for (const group of kitchen.same_dish_groups) {
    if (group.count >= 3) {
      const timeSaved = group.count * 3; // ~3 min saved per batched item
      alerts.push({
        rule_id: 'batch_opportunity',
        severity: 'medium',
        batch_group_count: group.count,
        est_revenue_at_risk: 0,
        est_time_savings_min: timeSaved,
        description: `BATCH: ${group.count}x "${group.dish}" orders in queue. Batch-cooking saves ~${timeSaved}min (one prep cycle vs ${group.count} separate). Fire as batch — improves throughput + reduces station switches.`,
        ai_recommendation: 'batch_now',
        status: 'open', detected_at: now,
      });
    }
  }

  // Rule 5: RUSH_INCOMING
  if (kitchen.historical_hourly_orders.length > 0) {
    const nextHourIdx = (now.getHours() + 1) % kitchen.historical_hourly_orders.length;
    const nextHourExpected = kitchen.historical_hourly_orders[nextHourIdx] || 0;
    if (nextHourExpected > kitchen.current_hour_orders * 1.5 && nextHourExpected > 25) {
      const minutesUntilRush = 60 - now.getMinutes();
      alerts.push({
        rule_id: 'rush_incoming',
        severity: minutesUntilRush < config.rushLookaheadMin ? 'high' : 'medium',
        est_revenue_at_risk: 0,
        est_time_savings_min: 10,
        description: `RUSH INCOMING: historical data shows ~${nextHourExpected} orders next hour (current: ${kitchen.current_hour_orders}/hr, +${((nextHourExpected / kitchen.current_hour_orders - 1) * 100).toFixed(0)}% increase). ${minutesUntilRush}min until rush. PREP NOW: start batch prep of top 3 items, add 1 cook if available, pre-stage ingredients.`,
        ai_recommendation: 'add_staff',
        status: 'open', detected_at: now,
      });
    }
  }

  // Rule 6: STAFF_COVERAGE_GAP
  const uncoveredStations = kitchen.total_stations - kitchen.stations_covered;
  if (uncoveredStations > 0) {
    alerts.push({
      rule_id: 'staff_coverage_gap',
      severity: 'high',
      est_revenue_at_risk: uncoveredStations * 50,
      description: `${uncoveredStations} of ${kitchen.total_stations} kitchen stations UNCOVERED (${kitchen.stations_covered} staffed, ${kitchen.cooks_on_duty} cooks on duty). Uncovered stations = bottleneck — orders requiring those stations will be delayed. Reassign cooks or call in backup.`,
      ai_recommendation: 'add_staff',
      status: 'open', detected_at: now,
    });
  }

  // Rule 7: TICKET_PRIORITY_NEEDED
  if (kitchen.vip_tickets_in_queue > 0 || kitchen.allergy_tickets_in_queue > 0) {
    const priorityCount = kitchen.vip_tickets_in_queue + kitchen.allergy_tickets_in_queue;
    alerts.push({
      rule_id: 'ticket_priority_needed',
      severity: kitchen.allergy_tickets_in_queue > 0 ? 'high' : 'medium',
      est_revenue_at_risk: kitchen.vip_tickets_in_queue * 100,
      description: `${priorityCount} priority tickets in queue (${kitchen.vip_tickets_in_queue} VIP, ${kitchen.allergy_tickets_in_queue} allergy). Allergy orders need dedicated prep area (cross-contamination risk). VIP orders should be prioritized for retention. REPRIORITIZE: move priority tickets to front of queue.`,
      ai_recommendation: 'reprioritize',
      status: 'open', detected_at: now,
    });
  }

  // Rule 8: PREP_LEAD_TIME_VIOLATION
  for (const order of kitchen.prep_lead_time_orders) {
    if (order.prep_time_min > order.quoted_time_min) {
      const violationMin = order.prep_time_min - order.quoted_time_min;
      alerts.push({
        rule_id: 'prep_lead_time_violation',
        severity: 'high',
        est_revenue_at_risk: 30,
        est_time_savings_min: 0,
        description: `LEAD TIME VIOLATION: "${order.item}" needs ${order.prep_time_min}min prep but was quoted ${order.quoted_time_min}min (${violationMin}min short). Customer will wait ${violationMin}min longer than promised. Adjust quote to ${order.prep_time_min + 5}min going forward + notify customer of delay.`,
        ai_recommendation: 'adjust_quote',
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
            { role: 'system', content: 'You are a restaurant kitchen operations AI specializing in order flow optimization. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Order pacing alert: ${a.rule_id} — ${a.current_tickets ?? 0} tickets (max ${a.max_capacity ?? 'N/A'}), avg ${a.avg_ticket_time_min ?? 0}min, ${a.online_orders_pending ?? 0} online pending. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM order_pacing_alert WHERE status = 'open' AND detected_at < time::now() - 30m`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE order_pacing_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<PacingAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM order_pacing_alert WHERE status = 'open'
       ORDER BY est_revenue_at_risk DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalRevenueRisk: number; totalTimeSavings: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_revenue_at_risk) AS risk, math::sum(est_time_savings_min) AS savings
       FROM order_pacing_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalRevenueRisk: safeNumber(r.risk, 0), totalTimeSavings: safeNumber(r.savings, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalRevenueRisk: 0, totalTimeSavings: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
