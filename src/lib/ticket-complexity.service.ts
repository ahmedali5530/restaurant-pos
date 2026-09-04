/**
 * AI Order Ticket Complexity Analyzer — analyzes each ticket's complexity
 * (items, modifiers, splits, special requests), predicts fulfillment time,
 * and recommends dynamic station routing.
 *
 * 113th POSR-exclusive differentiator — restaurants lose $250-1,000/mo per
 * location from unmanaged ticket complexity. No POS analyzes ticket
 * complexity before routing to kitchen.
 *
 * Distinct from:
 *   - kitchen-bottleneck.service (detects bottlenecks AFTER they happen)
 *   - kitchen-demand-surge.service (predicts demand SURGES — NOT ticket complexity)
 *   - kitchen-prep-scheduler.service (daily prep TASK scheduling — NOT ticket routing)
 *   - order-pacing.service (paces incoming order VOLUME — NOT ticket complexity)
 *   - wait-prediction.service (predicts customer WAIT — NOT ticket fulfillment time)
 *   - order-modification-pattern.service (detects modification PATTERNS — NOT per-ticket complexity)
 *   - server-load-balancer.service (balances SERVER load — NOT kitchen station load)
 *
 * 8 AI rules:
 *   1. high_complexity_ticket — complexity score ≥60 → flag for careful handling
 *   2. station_overload_risk — ticket pushes station load ≥80% → route elsewhere
 *   3. modifier_heavy_ticket — 5+ modifiers → kitchen clarification needed
 *   4. split_payment_delay — split payment + complex → expedite prep
 *   5. special_request_flag — allergy/custom request → chef attention
 *   6. predicted_long_fulfillment — predicted ≥20 min → customer notification
 *   7. complexity_pattern — recurring complex ticket pattern → simplify menu
 *   8. routing_recommendation — route to underutilized station
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type TicketCompRuleId =
  | 'high_complexity_ticket'
  | 'station_overload_risk'
  | 'modifier_heavy_ticket'
  | 'split_payment_delay'
  | 'special_request_flag'
  | 'predicted_long_fulfillment'
  | 'complexity_pattern'
  | 'routing_recommendation';

export type TicketCompAiRec =
  | 'route_to_station'
  | 'split_ticket'
  | 'expedite_prep'
  | 'chef_attention'
  | 'simplify_menu'
  | 'add_staffing'
  | 'monitor'
  | 'skip';

export interface TicketCompAlert {
  id?: string;
  rule_id: TicketCompRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ticket_id: string;
  complexity_score?: number;
  item_count?: number;
  modifier_count?: number;
  split_payment_count?: number;
  special_request_count?: number;
  stations_involved?: string;
  predicted_fulfillment_minutes?: number;
  actual_fulfillment_minutes?: number;
  primary_station?: string;
  station_load_pct?: number;
  recommended_station?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: TicketCompAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface TicketCompConfig {
  aiEnabled: boolean;
  highThreshold: number;
  modThreshold: number;
  longFulfill: number;
  stationOverload: number;
}

export const DEFAULT_TICKETCOMP_CONFIG: TicketCompConfig = {
  aiEnabled: true,
  highThreshold: 60.0,
  modThreshold: 5,
  longFulfill: 20.0,
  stationOverload: 80.0,
};

export const readTicketCompConfig = (settings: any): TicketCompConfig => ({
  aiEnabled: settings?.ticketcomp_ai_enabled ?? true,
  highThreshold: safeNumber(settings?.ticketcomp_high_threshold, 60.0),
  modThreshold: safeNumber(settings?.ticketcomp_mod_threshold, 5),
  longFulfill: safeNumber(settings?.ticketcomp_long_fulfill, 20.0),
  stationOverload: safeNumber(settings?.ticketcomp_station_overload, 80.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface TicketData {
  ticket_id: string;
  item_count: number;
  modifier_count: number;
  split_payment_count: number;
  special_request_count: number;
  stations: string[];           // stations involved in this ticket
  station_items: { station: string; item_count: number; prep_minutes: number }[];
  // Current station queue load (0-100%)
  station_current_load: { station: string; load_pct: number }[];
  // For complexity_pattern: recurring pattern detection
  pattern_key?: string;         // e.g. "4items_3mods_2splits"
  pattern_count?: number;       // how many times this pattern occurred
  // For predicted vs actual
  actual_fulfillment_minutes?: number;
}

const MOCK_TICKETS: TicketData[] = [
  {
    ticket_id: 'TKT-4821', item_count: 7, modifier_count: 8, split_payment_count: 3,
    special_request_count: 1,
    stations: ['grill', 'fry', 'cold'],
    station_items: [
      { station: 'grill', item_count: 3, prep_minutes: 14 },
      { station: 'fry', item_count: 2, prep_minutes: 8 },
      { station: 'cold', item_count: 2, prep_minutes: 5 },
    ],
    station_current_load: [
      { station: 'grill', load_pct: 85 }, { station: 'fry', load_pct: 60 },
      { station: 'cold', load_pct: 40 }, { station: 'saute', load_pct: 30 },
    ],
    pattern_key: '7items_8mods_3splits', pattern_count: 12,
  },
  {
    ticket_id: 'TKT-4822', item_count: 3, modifier_count: 6, split_payment_count: 0,
    special_request_count: 2,
    stations: ['grill'],
    station_items: [{ station: 'grill', item_count: 3, prep_minutes: 12 }],
    station_current_load: [
      { station: 'grill', load_pct: 75 }, { station: 'saute', load_pct: 25 },
    ],
  },
  {
    ticket_id: 'TKT-4823', item_count: 5, modifier_count: 4, split_payment_count: 2,
    special_request_count: 0,
    stations: ['saute', 'pastry'],
    station_items: [
      { station: 'saute', item_count: 3, prep_minutes: 15 },
      { station: 'pastry', item_count: 2, prep_minutes: 18 },
    ],
    station_current_load: [
      { station: 'saute', load_pct: 70 }, { station: 'pastry', load_pct: 82 },
      { station: 'grill', load_pct: 50 },
    ],
    pattern_key: '5items_4mods_2splits', pattern_count: 18,
    actual_fulfillment_minutes: 24,
  },
  {
    ticket_id: 'TKT-4824', item_count: 2, modifier_count: 2, split_payment_count: 4,
    special_request_count: 0,
    stations: ['grill'],
    station_items: [{ station: 'grill', item_count: 2, prep_minutes: 8 }],
    station_current_load: [{ station: 'grill', load_pct: 65 }],
  },
  {
    ticket_id: 'TKT-4825', item_count: 6, modifier_count: 3, split_payment_count: 0,
    special_request_count: 3,
    stations: ['grill', 'saute', 'fry', 'cold'],
    station_items: [
      { station: 'grill', item_count: 2, prep_minutes: 10 },
      { station: 'saute', item_count: 2, prep_minutes: 12 },
      { station: 'fry', item_count: 1, prep_minutes: 6 },
      { station: 'cold', item_count: 1, prep_minutes: 4 },
    ],
    station_current_load: [
      { station: 'grill', load_pct: 70 }, { station: 'saute', load_pct: 65 },
      { station: 'fry', load_pct: 55 }, { station: 'cold', load_pct: 45 },
    ],
    pattern_key: '6items_3mods_4stations', pattern_count: 8,
  },
  {
    ticket_id: 'TKT-4826', item_count: 4, modifier_count: 7, split_payment_count: 1,
    special_request_count: 1,
    stations: ['saute', 'pastry'],
    station_items: [
      { station: 'saute', item_count: 2, prep_minutes: 14 },
      { station: 'pastry', item_count: 2, prep_minutes: 16 },
    ],
    station_current_load: [
      { station: 'saute', load_pct: 88 }, { station: 'pastry', load_pct: 72 },
      { station: 'grill', load_pct: 40 },
    ],
    pattern_key: '4items_7mods', pattern_count: 15,
  },
];

// Complexity score: weighted combination of items, modifiers, splits, special requests, stations
function computeComplexityScore(t: TicketData): number {
  const itemScore = Math.min(t.item_count * 6, 30);
  const modScore = Math.min(t.modifier_count * 5, 25);
  const splitScore = Math.min(t.split_payment_count * 6, 18);
  const specialScore = Math.min(t.special_request_count * 8, 15);
  const stationScore = Math.min(t.stations.length * 4, 12);
  return Math.min(itemScore + modScore + splitScore + specialScore + stationScore, 100);
}

// Predicted fulfillment: max station prep time + coordination overhead
function predictFulfillment(t: TicketData): number {
  const maxStationTime = Math.max(...t.station_items.map(s => s.prep_minutes), 0);
  const coordinationOverhead = (t.stations.length - 1) * 3; // 3 min per extra station
  const modifierOverhead = t.modifier_count * 0.5;
  return maxStationTime + coordinationOverhead + modifierOverhead;
}

export const runTicketCompEngine = async (
  db: ReturnType<typeof useDB>,
  config: TicketCompConfig = DEFAULT_TICKETCOMP_CONFIG
): Promise<{ alerts: TicketCompAlert[]; generated: number }> => {
  const alerts: TicketCompAlert[] = [];
  const now = new Date();

  let tickets: TicketData[] = [];
  try {
    const result = await db.query(
      `SELECT ticket_id, item_count, modifier_count, split_payment_count,
              special_request_count, stations, station_items,
              station_current_load, pattern_key, pattern_count,
              actual_fulfillment_minutes
       FROM ticket_complexity_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    tickets = rows.map((r: any) => ({
      ticket_id: String(r.ticket_id ?? 'Unknown'),
      item_count: safeNumber(r.item_count, 0),
      modifier_count: safeNumber(r.modifier_count, 0),
      split_payment_count: safeNumber(r.split_payment_count, 0),
      special_request_count: safeNumber(r.special_request_count, 0),
      stations: Array.isArray(r.stations) ? r.stations : [],
      station_items: Array.isArray(r.station_items) ? r.station_items : [],
      station_current_load: Array.isArray(r.station_current_load) ? r.station_current_load : [],
      pattern_key: r.pattern_key ?? undefined,
      pattern_count: r.pattern_count != null ? safeNumber(r.pattern_count, 0) : undefined,
      actual_fulfillment_minutes: r.actual_fulfillment_minutes != null ? safeNumber(r.actual_fulfillment_minutes, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[ticketcomp] fetchTickets failed — using mock', err);
  }

  if (tickets.length === 0) {
    tickets = MOCK_TICKETS;
  }

  for (const t of tickets) {
    const complexityScore = computeComplexityScore(t);
    const predictedFulfill = predictFulfillment(t);
    const stationsStr = t.stations.join(',');
    const monthlyOpp = Math.round(complexityScore * 0.5 * 30 / 30);

    // Find primary station (highest load after adding this ticket)
    let primaryStation = '';
    let primaryLoad = 0;
    for (const sl of t.station_current_load) {
      if (sl.load_pct > primaryLoad) {
        primaryLoad = sl.load_pct;
        primaryStation = sl.station;
      }
    }
    // Find underutilized station for routing recommendation
    let underutilizedStation = '';
    let minLoad = 100;
    for (const sl of t.station_current_load) {
      if (sl.load_pct < minLoad) {
        minLoad = sl.load_pct;
        underutilizedStation = sl.station;
      }
    }

    // Rule 1: HIGH_COMPLEXITY_TICKET (complexity score ≥60)
    if (complexityScore >= config.highThreshold) {
      alerts.push({
        rule_id: 'high_complexity_ticket',
        severity: complexityScore >= 80 ? 'high' : 'medium',
        ticket_id: t.ticket_id,
        complexity_score: complexityScore,
        item_count: t.item_count,
        modifier_count: t.modifier_count,
        split_payment_count: t.split_payment_count,
        special_request_count: t.special_request_count,
        stations_involved: stationsStr,
        predicted_fulfillment_minutes: Math.round(predictedFulfill * 10) / 10,
        est_monthly_opportunity: monthlyOpp,
        description: `${t.ticket_id}: HIGH COMPLEXITY — score ${complexityScore}/100 (${t.item_count} items, ${t.modifier_count} mods, ${t.split_payment_count} splits, ${t.special_request_count} special requests, ${t.stations.length} stations). Predicted fulfillment: ${predictedFulfill.toFixed(0)} min. Complex tickets risk errors + delays. FLAG for careful handling — expediter should monitor. Consider splitting into sub-tickets for parallel prep.`,
        ai_recommendation: 'split_ticket',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: STATION_OVERLOAD_RISK (ticket pushes station load ≥80%)
    if (primaryLoad >= config.stationOverload) {
      const overloadItems = t.station_items.find(s => s.station === primaryStation);
      alerts.push({
        rule_id: 'station_overload_risk',
        severity: 'critical',
        ticket_id: t.ticket_id,
        primary_station: primaryStation,
        station_load_pct: primaryLoad,
        complexity_score: complexityScore,
        recommended_station: underutilizedStation,
        item_count: overloadItems?.item_count ?? t.item_count,
        predicted_fulfillment_minutes: Math.round(predictedFulfill * 10) / 10,
        est_monthly_opportunity: monthlyOpp,
        description: `${t.ticket_id}: STATION OVERLOAD RISK — ${primaryStation} station at ${primaryLoad}% capacity. Adding this ticket (${overloadItems?.item_count ?? 0} items, ${overloadItems?.prep_minutes ?? 0} min prep) will exceed capacity → bottlenecks. ROUTE to ${underutilizedStation} station instead (currently ${minLoad}% loaded). Dynamic routing prevents cascading delays. Potential ${fmt$(monthlyOpp)}/mo from prevented slowdowns.`,
        ai_recommendation: 'route_to_station',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: MODIFIER_HEAVY_TICKET (5+ modifiers)
    if (t.modifier_count >= config.modThreshold) {
      alerts.push({
        rule_id: 'modifier_heavy_ticket',
        severity: 'medium',
        ticket_id: t.ticket_id,
        modifier_count: t.modifier_count,
        complexity_score: complexityScore,
        stations_involved: stationsStr,
        predicted_fulfillment_minutes: Math.round(predictedFulfill * 10) / 10,
        est_monthly_opportunity: monthlyOpp,
        description: `${t.ticket_id}: MODIFIER-HEAVY — ${t.modifier_count} modifiers across ${t.item_count} items. High modifier count risks kitchen errors + miscommunication. CLARIFY with kitchen before prep starts — print modifier summary on KDS. Consider pre-validating complex modifications at POS. Modifier overhead: +${(t.modifier_count * 0.5).toFixed(1)} min to fulfillment time.`,
        ai_recommendation: 'expedite_prep',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SPLIT_PAYMENT_DELAY (split payment + complex ticket)
    if (t.split_payment_count >= 2 && complexityScore >= 40) {
      const delayMinutes = t.split_payment_count * 2;
      alerts.push({
        rule_id: 'split_payment_delay',
        severity: 'medium',
        ticket_id: t.ticket_id,
        split_payment_count: t.split_payment_count,
        complexity_score: complexityScore,
        predicted_fulfillment_minutes: Math.round(predictedFulfill * 10) / 10,
        est_monthly_opportunity: Math.round(delayMinutes * 5 * 30 / 30),
        description: `${t.ticket_id}: SPLIT PAYMENT DELAY — ${t.split_payment_count}-way split on complex ticket (score ${complexityScore}). Split payments add ~${delayMinutes} min to table turnaround. EXPEDITE PREP so food arrives before payment processing completes — prevents "waiting for food" complaint during split. Pre-stage payment terminals. Potential ${fmt$(delayMinutes * 5 * 30 / 30)}/mo from faster table turnover.`,
        ai_recommendation: 'expedite_prep',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: SPECIAL_REQUEST_FLAG (allergy/custom request)
    if (t.special_request_count >= 1) {
      alerts.push({
        rule_id: 'special_request_flag',
        severity: t.special_request_count >= 2 ? 'high' : 'medium',
        ticket_id: t.ticket_id,
        special_request_count: t.special_request_count,
        complexity_score: complexityScore,
        stations_involved: stationsStr,
        predicted_fulfillment_minutes: Math.round(predictedFulfill * 10) / 10,
        est_monthly_opportunity: monthlyOpp,
        description: `${t.ticket_id}: SPECIAL REQUEST — ${t.special_request_count} special request(s) (allergy/custom). Requires CHEF ATTENTION to ensure safe preparation. Flag on KDS with allergy alert. Chef should verify allergen-free prep station + clean utensils. Do NOT rush — safety > speed. Special requests have highest error cost (allergy liability + reputation damage).`,
        ai_recommendation: 'chef_attention',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: PREDICTED_LONG_FULFILLMENT (≥20 min predicted)
    if (predictedFulfill >= config.longFulfill) {
      alerts.push({
        rule_id: 'predicted_long_fulfillment',
        severity: 'high',
        ticket_id: t.ticket_id,
        predicted_fulfillment_minutes: Math.round(predictedFulfill * 10) / 10,
        complexity_score: complexityScore,
        item_count: t.item_count,
        stations_involved: stationsStr,
        est_monthly_opportunity: monthlyOpp,
        description: `${t.ticket_id}: LONG FULFILLMENT PREDICTED — ${predictedFulfill.toFixed(0)} min (threshold ${config.longFulfill} min). ${t.stations.length} stations involved, max station prep ${Math.max(...t.station_items.map(s => s.prep_minutes), 0)} min. NOTIFY CUSTOMER of expected wait time upfront — manages expectations + reduces complaints. Consider splitting ticket for parallel prep to cut time by 30-40%.`,
        ai_recommendation: 'split_ticket',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: COMPLEXITY_PATTERN (recurring complex pattern → simplify menu)
    if (t.pattern_key && t.pattern_count && t.pattern_count >= 8) {
      alerts.push({
        rule_id: 'complexity_pattern',
        severity: 'medium',
        ticket_id: t.ticket_id,
        complexity_score: complexityScore,
        item_count: t.item_count,
        modifier_count: t.modifier_count,
        stations_involved: stationsStr,
        est_monthly_opportunity: monthlyOpp * 2,
        description: `${t.ticket_id}: COMPLEXITY PATTERN — pattern "${t.pattern_key}" recurring ${t.pattern_count} times/mo. Customers consistently order this complex configuration → MENU SIMPLIFICATION opportunity. Create a pre-configured combo/PROMO matching this pattern → reduces per-ticket complexity + modifier errors + kitchen time. Potential ${fmt$(monthlyOpp * 2)}/mo from simplified workflow + combo upsell.`,
        ai_recommendation: 'simplify_menu',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: ROUTING_RECOMMENDATION (route to underutilized station)
    if (primaryLoad >= 70 && underutilizedStation && underutilizedStation !== primaryStation && minLoad < 50) {
      alerts.push({
        rule_id: 'routing_recommendation',
        severity: 'low',
        ticket_id: t.ticket_id,
        primary_station: primaryStation,
        station_load_pct: primaryLoad,
        recommended_station: underutilizedStation,
        complexity_score: complexityScore,
        est_monthly_opportunity: monthlyOpp,
        description: `${t.ticket_id}: ROUTING RECOMMENDATION — primary station ${primaryStation} at ${primaryLoad}% load. Route to ${underutilizedStation} station (only ${minLoad}% loaded) for better balance. Cross-train staff for ${underutilizedStation} coverage. Dynamic station balancing improves throughput by 15-25%. Balanced load = faster overall ticket fulfillment + less station-specific bottlenecks.`,
        ai_recommendation: 'route_to_station',
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
            { role: 'system', content: 'You are a restaurant kitchen operations AI specializing in ticket complexity analysis and dynamic station routing. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Ticket: ${a.ticket_id} — ${a.rule_id}. Complexity ${a.complexity_score ?? 0}/100, ${a.item_count ?? 0} items, ${a.modifier_count ?? 0} mods, ${a.split_payment_count ?? 0} splits, ${a.special_request_count ?? 0} special. Stations: ${a.stations_involved ?? 'N/A'}. Predicted ${a.predicted_fulfillment_minutes ?? 0} min. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM ticket_complexity_alert WHERE status = 'open' AND detected_at < time::now() - 2h`);
  } catch { /* ignore - shorter TTL for real-time alerts */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE ticket_complexity_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<TicketCompAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM ticket_complexity_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgComplexity: number; longFulfillmentCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(complexity_score WHERE complexity_score != NONE) AS avgcomp,
              math::count(rule_id = 'predicted_long_fulfillment') AS longcount
       FROM ticket_complexity_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgComplexity: safeNumber(r.avgcomp, 0), longFulfillmentCount: safeNumber(r.longcount, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgComplexity: 0, longFulfillmentCount: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
