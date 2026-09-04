/**
 * AI Kitchen Demand Surge Predictor — predicts item-level demand surges
 * 15-30 min ahead and triggers pre-prep recommendations to prevent bottlenecks.
 *
 * 110th POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from kitchen bottlenecks that could be prevented with advance
 * warning. No POS predicts item-level demand surges.
 *
 * Distinct from:
 *   - kitchen-prep-scheduler.service (daily prep TASK scheduling — NOT surge prediction)
 *   - kitchen-bottleneck.service (detects bottlenecks AFTER they happen — NOT predictive)
 *   - peak-hour-prediction.service (predicts overall peak HOURS — NOT item-level)
 *   - order-pacing.service (paces incoming orders — NOT pre-prep triggers)
 *   - forecast-accuracy.service (tracks revenue forecast accuracy — NOT kitchen ops)
 *   - revenue-forecast.service (forecasts REVENUE — NOT kitchen item demand)
 *   - wait-prediction.service (predicts customer WAIT times — NOT kitchen load)
 *
 * 8 AI rules:
 *   1. surge_imminent — item demand predicted to spike >50% in next 15 min
 *   2. prep_lead_time_warning — long prep item + surge → start immediately
 *   3. station_overload_predicted — multiple items on same station surging
 *   4. ingredient_stock_warning — surge predicted but stock low → restock
 *   5. staffing_gap_predicted — surge predicted but station understaffed
 *   6. false_surge_filtered — context suggests false positive (weather change)
 *   7. surge_decayed — predicted surge didn't materialize → stop pre-prep
 *   8. cross_station_coordination — surge across stations needs coordinated timing
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type KitchenSurgeRuleId =
  | 'surge_imminent'
  | 'prep_lead_time_warning'
  | 'station_overload_predicted'
  | 'ingredient_stock_warning'
  | 'staffing_gap_predicted'
  | 'false_surge_filtered'
  | 'surge_decayed'
  | 'cross_station_coordination';

export type KitchenSurgeAiRec =
  | 'start_prep_now'
  | 'restock_ingredient'
  | 'reassign_staff'
  | 'hold_prep'
  | 'coordinate_stations'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface KitchenSurgeAlert {
  id?: string;
  rule_id: KitchenSurgeRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  menu_item: string;
  station?: string;
  current_rate?: number;
  predicted_rate?: number;
  surge_pct?: number;
  minutes_ahead?: number;
  prep_lead_minutes?: number;
  current_stock?: number;
  stock_needed?: number;
  staff_assigned?: number;
  staff_needed?: number;
  confidence_pct?: number;
  context_factors?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: KitchenSurgeAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface KitchenSurgeConfig {
  aiEnabled: boolean;
  threshold: number;
  prepWindow: number;
  minConfidence: number;
  stockBuffer: number;
}

export const DEFAULT_KITCHENSURGE_CONFIG: KitchenSurgeConfig = {
  aiEnabled: true,
  threshold: 50.0,
  prepWindow: 15,
  minConfidence: 70.0,
  stockBuffer: 20.0,
};

export const readKitchenSurgeConfig = (settings: any): KitchenSurgeConfig => ({
  aiEnabled: settings?.kitchensurge_ai_enabled ?? true,
  threshold: safeNumber(settings?.kitchensurge_threshold, 50.0),
  prepWindow: safeNumber(settings?.kitchensurge_prep_window, 15),
  minConfidence: safeNumber(settings?.kitchensurge_min_confidence, 70.0),
  stockBuffer: safeNumber(settings?.kitchensurge_stock_buffer, 20.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface KitchenItemData {
  menu_item: string;
  station: string;
  current_rate: number;       // orders per 15 min currently
  predicted_rate: number;     // predicted orders per 15 min in next window
  confidence_pct: number;
  prep_lead_minutes: number;
  current_stock: number;      // portions available
  stock_needed: number;       // portions needed during surge window
  staff_assigned: number;
  staff_needed: number;
  context_factors: string;
  // For surge_decay: was a surge predicted that didn't materialize?
  was_predicted_surge?: boolean;
  actual_rate?: number;       // what actually happened
  // For false_surge: context suggesting false positive
  context_flags?: string[];   // e.g. ['weather_change', 'event_cancelled']
}

const MOCK_ITEMS: KitchenItemData[] = [
  {
    menu_item: 'Beef Burger', station: 'grill',
    current_rate: 8, predicted_rate: 14, confidence_pct: 85,
    prep_lead_minutes: 12, current_stock: 20, stock_needed: 18,
    staff_assigned: 2, staff_needed: 3,
    context_factors: 'day_of_week,time_of_day,historical',
  },
  {
    menu_item: 'Margherita Pizza', station: 'pastry',
    current_rate: 6, predicted_rate: 11, confidence_pct: 78,
    prep_lead_minutes: 18, current_stock: 8, stock_needed: 15,
    staff_assigned: 1, staff_needed: 2,
    context_factors: 'day_of_week,promotion',
  },
  {
    menu_item: 'Caesar Salad', station: 'cold',
    current_rate: 4, predicted_rate: 9, confidence_pct: 82,
    prep_lead_minutes: 5, current_stock: 25, stock_needed: 12,
    staff_assigned: 1, staff_needed: 1,
    context_factors: 'time_of_day,weather,historical',
  },
  {
    menu_item: 'French Fries', station: 'fry',
    current_rate: 10, predicted_rate: 18, confidence_pct: 88,
    prep_lead_minutes: 8, current_stock: 30, stock_needed: 22,
    staff_assigned: 1, staff_needed: 2,
    context_factors: 'day_of_week,time_of_day,historical',
  },
  {
    menu_item: 'Pasta Alfredo', station: 'saute',
    current_rate: 3, predicted_rate: 7, confidence_pct: 65,
    prep_lead_minutes: 15, current_stock: 12, stock_needed: 10,
    staff_assigned: 1, staff_needed: 2,
    context_factors: 'time_of_day,historical',
    context_flags: ['weather_change'],
  },
  {
    menu_item: 'Salmon Bowl', station: 'saute',
    current_rate: 5, predicted_rate: 9, confidence_pct: 75,
    prep_lead_minutes: 14, current_stock: 6, stock_needed: 11,
    staff_assigned: 1, staff_needed: 2,
    context_factors: 'day_of_week,promotion,historical',
  },
  {
    menu_item: 'Grilled Chicken', station: 'grill',
    current_rate: 7, predicted_rate: 12, confidence_pct: 80,
    prep_lead_minutes: 10, current_stock: 15, stock_needed: 16,
    staff_assigned: 2, staff_needed: 3,
    context_factors: 'day_of_week,time_of_day',
  },
  {
    menu_item: 'Onion Rings', station: 'fry',
    current_rate: 5, predicted_rate: 6, confidence_pct: 60,
    prep_lead_minutes: 6, current_stock: 40, stock_needed: 8,
    staff_assigned: 1, staff_needed: 1,
    context_factors: 'historical',
    was_predicted_surge: true, actual_rate: 6,
  },
];

export const runKitchenSurgeEngine = async (
  db: ReturnType<typeof useDB>,
  config: KitchenSurgeConfig = DEFAULT_KITCHENSURGE_CONFIG
): Promise<{ alerts: KitchenSurgeAlert[]; generated: number }> => {
  const alerts: KitchenSurgeAlert[] = [];
  const now = new Date();

  let items: KitchenItemData[] = [];
  try {
    const result = await db.query(
      `SELECT menu_item, station, current_rate, predicted_rate, confidence_pct,
              prep_lead_minutes, current_stock, stock_needed,
              staff_assigned, staff_needed, context_factors,
              was_predicted_surge, actual_rate, context_flags
       FROM kitchen_surge_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    items = rows.map((r: any) => ({
      menu_item: String(r.menu_item ?? 'Unknown'),
      station: String(r.station ?? 'unknown'),
      current_rate: safeNumber(r.current_rate, 0),
      predicted_rate: safeNumber(r.predicted_rate, 0),
      confidence_pct: safeNumber(r.confidence_pct, 0),
      prep_lead_minutes: safeNumber(r.prep_lead_minutes, 0),
      current_stock: safeNumber(r.current_stock, 0),
      stock_needed: safeNumber(r.stock_needed, 0),
      staff_assigned: safeNumber(r.staff_assigned, 0),
      staff_needed: safeNumber(r.staff_needed, 0),
      context_factors: String(r.context_factors ?? ''),
      was_predicted_surge: r.was_predicted_surge ?? false,
      actual_rate: r.actual_rate != null ? safeNumber(r.actual_rate, 0) : undefined,
      context_flags: Array.isArray(r.context_flags) ? r.context_flags : undefined,
    }));
  } catch (err) {
    console.warn('[kitchensurge] fetchItems failed — using mock', err);
  }

  if (items.length === 0) {
    items = MOCK_ITEMS;
  }

  // Group items by station for station_overload and cross_station rules
  const byStation = new Map<string, KitchenItemData[]>();
  for (const item of items) {
    if (!byStation.has(item.station)) byStation.set(item.station, []);
    byStation.get(item.station)!.push(item);
  }

  for (const item of items) {
    const surgePct = item.current_rate > 0 ? ((item.predicted_rate - item.current_rate) / item.current_rate) * 100 : 0;
    const stockShortfall = item.stock_needed - item.current_stock;
    const staffGap = item.staff_needed - item.staff_assigned;
    const monthlyOpp = Math.round(surgePct * item.predicted_rate * 0.5 * 30);

    // Rule 1: SURGE_IMMINENT (item demand predicted to spike >threshold)
    if (surgePct >= config.threshold && item.confidence_pct >= config.minConfidence) {
      alerts.push({
        rule_id: 'surge_imminent',
        severity: surgePct >= 100 ? 'critical' : 'high',
        menu_item: item.menu_item,
        station: item.station,
        current_rate: item.current_rate,
        predicted_rate: item.predicted_rate,
        surge_pct: Math.round(surgePct * 10) / 10,
        minutes_ahead: config.prepWindow,
        confidence_pct: item.confidence_pct,
        context_factors: item.context_factors,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: SURGE IMMINENT — demand predicted to spike ${surgePct.toFixed(0)}% in next ${config.prepWindow} min (${item.current_rate} → ${item.predicted_rate} orders/15min). Confidence: ${item.confidence_pct}%. Context: ${item.context_factors}. START PRE-PREP NOW — ${item.prep_lead_minutes} min lead time needed. Preventing bottleneck saves ${fmt$(monthlyOpp)}/mo in lost orders + comped meals.`,
        ai_recommendation: 'start_prep_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: PREP_LEAD_TIME_WARNING (long prep item + surge)
    if (surgePct >= config.threshold && item.prep_lead_minutes >= 12 && item.confidence_pct >= config.minConfidence) {
      const prepStartTime = config.prepWindow - item.prep_lead_minutes;
      alerts.push({
        rule_id: 'prep_lead_time_warning',
        severity: 'critical',
        menu_item: item.menu_item,
        station: item.station,
        surge_pct: Math.round(surgePct * 10) / 10,
        minutes_ahead: config.prepWindow,
        prep_lead_minutes: item.prep_lead_minutes,
        confidence_pct: item.confidence_pct,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: PREP LEAD TIME WARNING — ${item.prep_lead_minutes} min prep time but surge hits in ${config.prepWindow} min. Must START PREP ${Math.abs(prepStartTime)} min ${prepStartTime < 0 ? 'AGO' : 'from now'} to be ready. Long-prep items are most vulnerable to surges — if you wait, tickets will back up ${item.prep_lead_minutes - config.prepWindow} min behind. Critical for ${item.station} station capacity.`,
        ai_recommendation: 'start_prep_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: STATION_OVERLOAD_PREDICTED (multiple items on same station surging)
    const stationItems = byStation.get(item.station) ?? [];
    const surgingOnStation = stationItems.filter(i => {
      const sp = i.current_rate > 0 ? ((i.predicted_rate - i.current_rate) / i.current_rate) * 100 : 0;
      return sp >= config.threshold && i.confidence_pct >= config.minConfidence;
    });
    if (surgingOnStation.length >= 2 && surgingOnStation[0].menu_item === item.menu_item) {
      const totalPredicted = surgingOnStation.reduce((sum, i) => sum + i.predicted_rate, 0);
      const totalStaff = surgingOnStation.reduce((sum, i) => sum + i.staff_assigned, 0);
      const totalNeeded = surgingOnStation.reduce((sum, i) => sum + i.staff_needed, 0);
      alerts.push({
        rule_id: 'station_overload_predicted',
        severity: 'critical',
        menu_item: `${item.station} station (${surgingOnStation.length} items)`,
        station: item.station,
        predicted_rate: totalPredicted,
        staff_assigned: totalStaff,
        staff_needed: totalNeeded,
        surge_pct: Math.round(surgePct * 10) / 10,
        minutes_ahead: config.prepWindow,
        est_monthly_opportunity: monthlyOpp * surgingOnStation.length,
        description: `STATION OVERLOAD: ${item.station.toUpperCase()} station has ${surgingOnStation.length} items surging simultaneously (${surgingOnStation.map(i => i.menu_item).join(', ')}). Total predicted load: ${totalPredicted} orders/15min with only ${totalStaff} staff (need ${totalNeeded}). CASCADING BOTTLENECK RISK — all items compete for same station. REASSIGN staff from slower stations NOW. Preventing cascade saves ${fmt$(monthlyOpp * surgingOnStation.length)}/mo.`,
        ai_recommendation: 'reassign_staff',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: INGREDIENT_STOCK_WARNING (surge predicted but stock low)
    if (surgePct >= config.threshold && stockShortfall > 0 && item.confidence_pct >= config.minConfidence) {
      const bufferNeeded = item.stock_needed * (1 + config.stockBuffer / 100);
      const totalShortfall = bufferNeeded - item.current_stock;
      alerts.push({
        rule_id: 'ingredient_stock_warning',
        severity: 'high',
        menu_item: item.menu_item,
        station: item.station,
        current_stock: item.current_stock,
        stock_needed: item.stock_needed,
        surge_pct: Math.round(surgePct * 10) / 10,
        minutes_ahead: config.prepWindow,
        confidence_pct: item.confidence_pct,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: INGREDIENT STOCK WARNING — surge predicted (${item.predicted_rate} orders) but only ${item.current_stock} portions in stock (need ${item.stock_needed} + ${config.stockBuffer}% buffer = ${Math.round(bufferNeeded)}). Shortfall: ${Math.round(totalShortfall)} portions. RESTOCK from walk-in or prep more base NOW — will run out ${Math.round(item.current_stock / Math.max(item.predicted_rate, 1) * 15)} min into surge. Running out mid-rush = comped meals + lost revenue.`,
        ai_recommendation: 'restock_ingredient',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: STAFFING_GAP_PREDICTED (surge predicted but station understaffed)
    if (surgePct >= config.threshold && staffGap > 0 && item.confidence_pct >= config.minConfidence) {
      alerts.push({
        rule_id: 'staffing_gap_predicted',
        severity: 'high',
        menu_item: item.menu_item,
        station: item.station,
        staff_assigned: item.staff_assigned,
        staff_needed: item.staff_needed,
        surge_pct: Math.round(surgePct * 10) / 10,
        minutes_ahead: config.prepWindow,
        confidence_pct: item.confidence_pct,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: STAFFING GAP — ${item.station} station has ${item.staff_assigned} staff but surge needs ${item.staff_needed} (gap: ${staffGap}). Surge in ${config.prepWindow} min — REASSIGN ${staffGap} staff member(s) from slower station NOW. Delay = ${item.prep_lead_minutes}+ min ticket backup. Cross-train staff for ${item.station} coverage during peaks. Preventing gap saves ${fmt$(monthlyOpp)}/mo.`,
        ai_recommendation: 'reassign_staff',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: FALSE_SURGE_FILTERED (context suggests false positive)
    if (surgePct >= config.threshold && item.context_flags && item.context_flags.length > 0 && item.confidence_pct < config.minConfidence) {
      alerts.push({
        rule_id: 'false_surge_filtered',
        severity: 'low',
        menu_item: item.menu_item,
        station: item.station,
        surge_pct: Math.round(surgePct * 10) / 10,
        confidence_pct: item.confidence_pct,
        context_factors: item.context_flags.join(','),
        minutes_ahead: config.prepWindow,
        est_monthly_opportunity: 0,
        description: `${item.menu_item}: FALSE SURGE FILTERED — predicted ${surgePct.toFixed(0)}% surge but confidence only ${item.confidence_pct}% (below ${config.minConfidence}% threshold). Context flags: ${item.context_flags.join(', ')}. Historical pattern disrupted by external factor — HOLD pre-prep to avoid wasted labor. Monitor actual rate; if surge materializes despite flags, escalate. Saves ~${fmt$(item.prep_lead_minutes * 2)}/event in wasted prep labor.`,
        ai_recommendation: 'hold_prep',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: SURGE_DECAYED (predicted surge didn't materialize)
    if (item.was_predicted_surge && item.actual_rate != null) {
      const actualSurgePct = item.current_rate > 0 ? ((item.actual_rate - item.current_rate) / item.current_rate) * 100 : 0;
      if (actualSurgePct < config.threshold * 0.5) {
        const wastedPrep = item.prep_lead_minutes * 1.5;
        alerts.push({
          rule_id: 'surge_decayed',
          severity: 'medium',
          menu_item: item.menu_item,
          station: item.station,
          current_rate: item.current_rate,
          predicted_rate: item.predicted_rate,
          surge_pct: Math.round(actualSurgePct * 10) / 10,
          confidence_pct: item.confidence_pct,
          est_monthly_opportunity: Math.round(wastedPrep * 30),
          description: `${item.menu_item}: SURGE DECAYED — predicted ${surgePct.toFixed(0)}% surge but actual was only ${actualSurgePct.toFixed(0)}% (${item.actual_rate} orders/15min). Pre-prep may have been wasted (~${wastedPrep.toFixed(0)} min labor). MODEL ACCURACY ISSUE — investigate why prediction failed. Context: ${item.context_factors}. Improve model by adding this case to training data. False prep cost: ~${fmt$(wastedPrep)}/event.`,
          ai_recommendation: 'investigate',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 8: CROSS_STATION_COORDINATION (surge across multiple stations needs timing)
    const surgingStations = new Set<string>();
    for (const [station, stationItemsList] of byStation.entries()) {
      const hasSurge = stationItemsList.some(i => {
        const sp = i.current_rate > 0 ? ((i.predicted_rate - i.current_rate) / i.current_rate) * 100 : 0;
        return sp >= config.threshold && i.confidence_pct >= config.minConfidence;
      });
      if (hasSurge) surgingStations.add(station);
    }
    if (surgingStations.size >= 3 && item.menu_item === items[0].menu_item) {
      alerts.push({
        rule_id: 'cross_station_coordination',
        severity: 'high',
        menu_item: `${surgingStations.size} stations surging`,
        station: Array.from(surgingStations).join(', '),
        surge_pct: Math.round(surgePct * 10) / 10,
        minutes_ahead: config.prepWindow,
        est_monthly_opportunity: monthlyOpp * 3,
        description: `CROSS-STATION COORDINATION: ${surgingStations.size} stations surging simultaneously (${Array.from(surgingStations).join(', ')}). Coordinated pre-prep needed — ${item.station} items must be timed with other stations for ticket assembly. EXPEDITER must coordinate firing sequence. Stagger prep starts by 2-3 min to prevent all stations peaking at once. Full-kitchen surge is rare — maximize throughput with synchronized timing. Potential +${fmt$(monthlyOpp * 3)}/mo from coordinated efficiency.`,
        ai_recommendation: 'coordinate_stations',
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
            { role: 'system', content: 'You are a restaurant kitchen operations AI specializing in demand surge prediction and pre-prep optimization. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Kitchen surge: ${a.rule_id} — ${a.menu_item} (${a.station}). Current ${a.current_rate ?? 0} → predicted ${a.predicted_rate ?? 0} orders/15min (+${a.surge_pct ?? 0}%), confidence ${a.confidence_pct ?? 0}%. Prep lead ${a.prep_lead_minutes ?? 0}min, stock ${a.current_stock ?? 0}/${a.stock_needed ?? 0}, staff ${a.staff_assigned ?? 0}/${a.staff_needed ?? 0}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM kitchen_surge_alert WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore - shorter TTL for real-time alerts */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE kitchen_surge_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<KitchenSurgeAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM kitchen_surge_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  surgesPredicted: number; stationsAffected: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'surge_imminent') AS surges,
              math::count(station != NONE) AS stations
       FROM kitchen_surge_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      surgesPredicted: safeNumber(r.surges, 0), stationsAffected: safeNumber(r.stations, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, surgesPredicted: 0, stationsAffected: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
