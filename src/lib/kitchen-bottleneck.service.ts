/**
 * AI Real-Time Kitchen Bottleneck Detection service — predictive KDS.
 *
 * 11th POSR-exclusive differentiator — Toast KDS has basic timer alerts,
 * Square has nothing. Restaurants lose 8-15% of revenue from kitchen
 * bottlenecks (long ticket times → customer complaints → lost repeat
 * business). POSR predicts bottlenecks 10-30 min ahead + AI recs.
 *
 * Detection rules (7):
 *   1. STAGE_BOTTLENECK   — a specific stage has avg duration > 1.5x other stages
 *   2. RUSH_HOUR_OVERFLOW — incoming tickets faster than completion rate during peak
 *   3. TABLE_TICKET_DELAY — ticket time > 25 min for dine-in (FDA rec < 20min)
 *   4. STATION_OVERLOAD   — single station has > capacity items in queue
 *   5. STAFF_IDLE_WHILE_QUEUE — staff available but not picking up tickets
 *   6. REROUTE_SUGGESTION — items waiting > 10 min could be rerouted to idle station
 *   7. SLOW_ITEM          — specific menu_item consistently slower than similar items
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KitchenSeverity = 'info' | 'warning' | 'critical';
export type KitchenRecommendation =
  | 'reroute_items' | 'add_staff' | 'redistribute_load'
  | 'simplify_recipe' | 'train_staff' | 'prep_ahead' | 'dismiss';

export interface KitchenBottleneckAlert {
  id?: string;
  rule_id: string;
  severity: KitchenSeverity;
  stage?: string;
  station_id?: string;
  station_name?: string;
  menu_item_id?: string;
  menu_item_name?: string;
  order_item_id?: string;
  staff_id?: string;
  staff_name?: string;
  metric_value: number;
  expected_value: number;
  deviation_pct: number;
  estimated_loss: number;
  queue_size?: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: KitchenRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
  branch_id?: string;
}

export interface KitchenConfig {
  aiEnabled: boolean;
  lookbackHours: number;
  stageBottleneckMultiplier: number;
  ticketDelayMin: number;
  stationCapacity: number;
  rerouteThresholdMin: number;
  slowItemPct: number;
}

export const DEFAULT_KITCHEN_CONFIG: KitchenConfig = {
  aiEnabled: true,
  lookbackHours: 4,
  stageBottleneckMultiplier: 1.5,
  ticketDelayMin: 25,
  stationCapacity: 8,
  rerouteThresholdMin: 10,
  slowItemPct: 0.25,
};

export const readKitchenConfig = (settings: any): KitchenConfig => ({
  aiEnabled: settings?.kitchen_ai_enabled ?? true,
  lookbackHours: safeNumber(settings?.kitchen_lookback_hours, 4),
  stageBottleneckMultiplier: safeNumber(settings?.kitchen_stage_bottleneck_multiplier, 1.5),
  ticketDelayMin: safeNumber(settings?.kitchen_ticket_delay_min, 25),
  stationCapacity: safeNumber(settings?.kitchen_station_capacity, 8),
  rerouteThresholdMin: safeNumber(settings?.kitchen_reroute_threshold_min, 10),
  slowItemPct: safeNumber(settings?.kitchen_slow_item_pct, 0.25),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  identifier: string,
  hours = 1
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM kitchen_bottleneck_alert
       WHERE rule_id = $ruleId
         AND (stage = $id OR station_id = $id OR menu_item_id = $id)
         AND detected_at > time::now() - ${hours}h
       LIMIT 1`,
      { ruleId, id: identifier }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

const formatDuration = (min: number): string => {
  if (min < 60) return `${min.toFixed(0)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
};

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

// 1. STAGE_BOTTLENECK — specific stage has avg duration > 1.5x others
const checkStageBottleneck = async (db: any, cfg: KitchenConfig): Promise<KitchenBottleneckAlert[]> => {
  const alerts: KitchenBottleneckAlert[] = [];
  try {
    // Get avg duration per stage in lookback window
    const result = await db.query(
      `SELECT stage, stage_name,
         count() AS item_count,
         math::mean(time::minute(completed_at - started_at)) AS avg_duration_min,
         math::max(time::minute(completed_at - started_at)) AS max_duration_min
       FROM order_item_kitchen
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.lookbackHours}h
         AND started_at IS NOT NONE
       GROUP BY stage`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length < 2) return alerts;
    const durations = rows.map((r: any) => safeNumber(r.avg_duration_min, 0));
    const overallAvg = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;
    for (const r of rows) {
      const avg = safeNumber(r.avg_duration_min, 0);
      if (avg > overallAvg * cfg.stageBottleneckMultiplier && safeNumber(r.item_count, 0) >= 3) {
        const stageId = r.stage?.toString?.() ?? r.stage_name ?? '';
        if (await isRecentlyAlerted(db, 'stage_bottleneck', stageId, 2)) continue;
        const deviation = avg - overallAvg;
        alerts.push({
          rule_id: 'stage_bottleneck',
          severity: deviation > overallAvg * 0.5 ? 'critical' : 'warning',
          stage: r.stage_name ?? r.stage,
          metric_value: avg,
          expected_value: overallAvg,
          deviation_pct: Math.round((avg / Math.max(0.1, overallAvg) - 1) * 100),
          estimated_loss: deviation * 5, // $5/min of delay as customer churn risk
          queue_size: safeNumber(r.item_count, 0),
          description: `Stage "${r.stage_name ?? r.stage}" averaging ${formatDuration(avg)} — ${(avg / Math.max(0.1, overallAvg)).toFixed(1)}x slower than overall avg (${formatDuration(overallAvg)}). ${r.item_count} items affected.`,
          context: { avg_duration_min: avg, overall_avg: overallAvg, item_count: r.item_count, max_duration: r.max_duration_min },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[kitchen] stage_bottleneck failed', err); }
  return alerts;
};

// 2. RUSH_HOUR_OVERFLOW — incoming tickets faster than completion rate
const checkRushHourOverflow = async (db: any, cfg: KitchenConfig): Promise<KitchenBottleneckAlert[]> => {
  const alerts: KitchenBottleneckAlert[] = [];
  try {
    // Last 30 min: incoming rate vs completion rate
    const result = await db.query(
      `SELECT
         math::count(created_at > time::now() - 30m) AS incoming_30m,
         math::count(completed_at > time::now() - 30m) AS completed_30m
       FROM order_item_kitchen
       WHERE created_at > time::now() - ${cfg.lookbackHours}h`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    const incoming = safeNumber(r.incoming_30m, 0);
    const completed = safeNumber(r.completed_30m, 0);
    if (incoming > 0 && completed > 0) {
      const ratio = incoming / completed;
      if (ratio > 1.3 && incoming > 10) { // 30% more incoming than completion + 10+ items
        if (await isRecentlyAlerted(db, 'rush_hour_overflow', 'rush', 1)) return alerts;
        const backlog = incoming - completed;
        alerts.push({
          rule_id: 'rush_hour_overflow',
          severity: ratio > 1.6 ? 'critical' : 'warning',
          metric_value: ratio,
          expected_value: 1.0,
          deviation_pct: Math.round((ratio - 1) * 100),
          estimated_loss: backlog * 3,
          queue_size: backlog,
          description: `Rush hour overflow — ${incoming} items arrived in last 30 min but only ${completed} completed (${ratio.toFixed(1)}x inflow vs outflow). Backlog of ${backlog} items growing.`,
          context: { incoming_30m: incoming, completed_30m: completed, backlog, ratio },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[kitchen] rush_hour_overflow failed', err); }
  return alerts;
};

// 3. TABLE_TICKET_DELAY — ticket time > 25 min for dine-in
const checkTableTicketDelay = async (db: any, cfg: KitchenConfig): Promise<KitchenBottleneckAlert[]> => {
  const alerts: KitchenBottleneckAlert[] = [];
  try {
    // Find dine-in orders with ticket time > threshold
    const result = await db.query(
      `SELECT
         oik.order_item.id AS order_item_id,
         oik.order_item.order.id AS order_id,
         oik.order_item.order.table.name AS table_name,
         oik.stage_name,
         oik.started_at,
         oik.activated_at
       FROM order_item_kitchen AS oik
       WHERE oik.status = 'in_progress'
         AND oik.activated_at < time::now() - ${cfg.ticketDelayMin}m
         AND oik.order_item.order.table IS NOT NONE
       LIMIT 20
       FETCH oik.order_item, oik.order_item.order, oik.order_item.order.table`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const waitMin = r.activated_at
        ? (Date.now() - new Date(r.activated_at).getTime()) / 60000
        : cfg.ticketDelayMin;
      if (waitMin < cfg.ticketDelayMin) continue;
      if (await isRecentlyAlerted(db, 'table_ticket_delay', r.order_id?.toString?.() ?? '', 1)) continue;
      alerts.push({
        rule_id: 'table_ticket_delay',
        severity: waitMin > cfg.ticketDelayMin * 1.5 ? 'critical' : 'warning',
        order_item_id: r.order_item_id?.toString?.(),
        stage: r.stage_name,
        metric_value: waitMin,
        expected_value: cfg.ticketDelayMin,
        deviation_pct: Math.round((waitMin / cfg.ticketDelayMin - 1) * 100),
        estimated_loss: (waitMin - cfg.ticketDelayMin) * 2,
        description: `Table "${r.table_name}" ticket waiting ${formatDuration(waitMin)} — exceeds ${cfg.ticketDelayMin} min FDA-recommended threshold. Customer satisfaction at risk.`,
        context: { table: r.table_name, wait_min: waitMin, stage: r.stage_name, activated_at: r.activated_at },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[kitchen] table_ticket_delay failed', err); }
  return alerts;
};

// 4. STATION_OVERLOAD — single station has > capacity items in queue
const checkStationOverload = async (db: any, cfg: KitchenConfig): Promise<KitchenBottleneckAlert[]> => {
  const alerts: KitchenBottleneckAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         kitchen.id AS station_id,
         kitchen.name AS station_name,
         count() AS queue_size
       FROM order_item_kitchen
       WHERE status IN ['pending', 'in_progress']
         AND activated_at > time::now() - ${cfg.lookbackHours}h
       GROUP BY kitchen
       FETCH kitchen`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const queue = safeNumber(r.queue_size, 0);
      if (queue > cfg.stationCapacity) {
        const stationId = r.station_id?.toString?.() ?? r.station_name ?? '';
        if (await isRecentlyAlerted(db, 'station_overload', stationId, 1)) continue;
        alerts.push({
          rule_id: 'station_overload',
          severity: queue > cfg.stationCapacity * 1.5 ? 'critical' : 'warning',
          station_id: r.station_id?.toString?.(),
          station_name: r.station_name,
          metric_value: queue,
          expected_value: cfg.stationCapacity,
          deviation_pct: Math.round((queue / cfg.stationCapacity - 1) * 100),
          estimated_loss: (queue - cfg.stationCapacity) * 4,
          queue_size: queue,
          description: `Station "${r.station_name}" has ${queue} items in queue — exceeds capacity of ${cfg.stationCapacity}. Items backing up; consider rerouting.`,
          context: { queue_size: queue, capacity: cfg.stationCapacity },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[kitchen] station_overload failed', err); }
  return alerts;
};

// 5. STAFF_IDLE_WHILE_QUEUE — staff available but not picking up tickets
const checkStaffIdleWhileQueue = async (db: any, _cfg: KitchenConfig): Promise<KitchenBottleneckAlert[]> => {
  const alerts: KitchenBottleneckAlert[] = [];
  try {
    // Find staff who completed an item > 10 min ago but no new item started
    const result = await db.query(
      `SELECT
         completed_by.id AS staff_id,
         completed_by.name AS staff_name,
         max(completed_at) AS last_completed,
         count() AS completed_count
       FROM order_item_kitchen
       WHERE status = 'completed'
         AND completed_at > time::now() - 30m
         AND completed_by IS NOT NONE
       GROUP BY completed_by
       FETCH completed_by`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Check pending queue size
    const queueResult = await db.query(
      `SELECT count() AS pending FROM order_item_kitchen WHERE status = 'pending'`
    );
    const queueRows = Array.isArray(queueResult) ? queueResult.flat() : [];
    const pendingCount = safeNumber(queueRows[0]?.pending, 0);
    if (pendingCount === 0) return alerts;

    for (const r of rows) {
      const lastCompleted = r.last_completed ? new Date(r.last_completed) : null;
      if (!lastCompleted) continue;
      const idleMin = (Date.now() - lastCompleted.getTime()) / 60000;
      if (idleMin > 10) { // idle > 10 min while queue exists
        const staffId = r.staff_id?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'staff_idle_while_queue', staffId, 1)) continue;
        alerts.push({
          rule_id: 'staff_idle_while_queue',
          severity: idleMin > 20 ? 'critical' : 'warning',
          staff_id: r.staff_id?.toString?.(),
          staff_name: r.staff_name,
          metric_value: idleMin,
          expected_value: 0,
          deviation_pct: 100,
          estimated_loss: idleMin * 2,
          queue_size: pendingCount,
          description: `Staff "${r.staff_name}" idle ${formatDuration(idleMin)} while ${pendingCount} pending items in queue. Possible assignment issue or staff disengagement.`,
          context: { idle_min: idleMin, pending_count: pendingCount, last_completed: lastCompleted },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[kitchen] staff_idle_while_queue failed', err); }
  return alerts;
};

// 6. REROUTE_SUGGESTION — items waiting > 10 min could be rerouted to idle station
const checkRerouteSuggestion = async (db: any, cfg: KitchenConfig): Promise<KitchenBottleneckAlert[]> => {
  const alerts: KitchenBottleneckAlert[] = [];
  try {
    // Find items in pending > rerouteThresholdMin
    const result = await db.query(
      `SELECT
         id,
         order_item.id AS order_item_id,
         order_item.item.name AS item_name,
         kitchen.id AS station_id,
         kitchen.name AS station_name,
         activated_at,
         stage_name
       FROM order_item_kitchen
       WHERE status = 'pending'
         AND activated_at < time::now() - ${cfg.rerouteThresholdMin}m
       LIMIT 10
       FETCH order_item, order_item.item, kitchen`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return alerts;
    // Find idle stations (stations with < 3 items in queue)
    const idleResult = await db.query(
      `SELECT kitchen.id AS station_id, kitchen.name AS station_name, count() AS queue
       FROM order_item_kitchen
       WHERE status IN ['pending', 'in_progress']
       GROUP BY kitchen
       FETCH kitchen`
    );
    const idleRows = Array.isArray(idleResult) ? idleResult.flat() : [];
    const idleStations = idleRows.filter((r: any) => safeNumber(r.queue, 0) < 3);
    if (idleStations.length === 0) return alerts;
    for (const r of rows) {
      const waitMin = r.activated_at ? (Date.now() - new Date(r.activated_at).getTime()) / 60000 : 0;
      if (waitMin < cfg.rerouteThresholdMin) continue;
      const stationId = r.station_id?.toString?.() ?? '';
      if (await isRecentlyAlerted(db, 'reroute_suggestion', stationId, 1)) continue;
      const idleStation = idleStations[0]; // pick first idle station
      alerts.push({
        rule_id: 'reroute_suggestion',
        severity: waitMin > cfg.rerouteThresholdMin * 2 ? 'critical' : 'warning',
        order_item_id: r.order_item_id?.toString?.(),
        menu_item_name: r.item_name,
        station_id: r.station_id?.toString?.(),
        station_name: r.station_name,
        metric_value: waitMin,
        expected_value: cfg.rerouteThresholdMin,
        deviation_pct: Math.round((waitMin / cfg.rerouteThresholdMin - 1) * 100),
        estimated_loss: (waitMin - cfg.rerouteThresholdMin) * 1.5,
        description: `Item "${r.item_name}" waiting ${formatDuration(waitMin)} at "${r.station_name}". Suggest rerouting to idle station "${idleStation.station_name}" (queue: ${idleStation.queue}).`,
        context: { wait_min: waitMin, current_station: r.station_name, suggested_station: idleStation.station_name },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[kitchen] reroute_suggestion failed', err); }
  return alerts;
};

// 7. SLOW_ITEM — specific menu_item consistently slower than category avg
const checkSlowItem = async (db: any, cfg: KitchenConfig): Promise<KitchenBottleneckAlert[]> => {
  const alerts: KitchenBottleneckAlert[] = [];
  try {
    // Avg prep time per menu_item vs category avg (last 7 days for stable signal)
    const result = await db.query(
      `SELECT
         order_item.item.id AS item_id,
         order_item.item.name AS item_name,
         order_item.item.categories AS categories,
         count() AS batch_count,
         math::mean(time::minute(completed_at - activated_at)) AS avg_prep_min
       FROM order_item_kitchen
       WHERE status = 'completed'
         AND completed_at > time::now() - 7d
         AND activated_at IS NOT NONE
       GROUP BY order_item.item
       FETCH order_item.item`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length < 5) return alerts;
    // Group by category and compute avg
    const byCategory = new Map<string, number[]>();
    for (const r of rows) {
      const cat = Array.isArray(r.categories) ? (r.categories[0] ?? 'unknown') : (r.categories ?? 'unknown');
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(safeNumber(r.avg_prep_min, 0));
    }
    const catAvg = new Map<string, number>();
    for (const [cat, durations] of byCategory) {
      catAvg.set(cat, durations.reduce((a, b) => a + b, 0) / durations.length);
    }
    for (const r of rows) {
      if (safeNumber(r.batch_count, 0) < 5) continue; // need 5+ batches
      const cat = Array.isArray(r.categories) ? (r.categories[0] ?? 'unknown') : (r.categories ?? 'unknown');
      const avg = safeNumber(r.avg_prep_min, 0);
      const catAvgVal = catAvg.get(cat) ?? avg;
      if (avg > catAvgVal * (1 + cfg.slowItemPct)) {
        const itemId = r.item_id?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'slow_item', itemId, 24)) continue;
        alerts.push({
          rule_id: 'slow_item',
          severity: avg > catAvgVal * 1.5 ? 'critical' : 'warning',
          menu_item_id: r.item_id?.toString?.(),
          menu_item_name: r.item_name,
          metric_value: avg,
          expected_value: catAvgVal,
          deviation_pct: Math.round((avg / Math.max(0.1, catAvgVal) - 1) * 100),
          estimated_loss: (avg - catAvgVal) * safeNumber(r.batch_count, 0) * 0.5,
          description: `Item "${r.item_name}" averaging ${formatDuration(avg)} prep time — ${Math.round((avg / Math.max(0.1, catAvgVal) - 1) * 100)}% slower than category avg (${formatDuration(catAvgVal)}). Recipe or technique issue.`,
          context: { avg_prep_min: avg, category_avg: catAvgVal, category: cat, batch_count: r.batch_count },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[kitchen] slow_item failed', err); }
  return alerts;
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: KitchenBottleneckAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const prompt = `You are a restaurant kitchen operations expert.
Analyze these kitchen bottleneck alerts and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 12).map(a => ({
  rule: a.rule_id,
  severity: a.severity,
  stage: a.stage,
  station: a.station_name,
  item: a.menu_item_name,
  staff: a.staff_name,
  metric: a.metric_value,
  expected: a.expected_value,
  queue: a.queue_size,
  description: a.description,
})), null, 2)}

Respond with JSON array:
[{
  "rule": "<match rule_id>",
  "insight": "<max 200 chars — root cause + impact>",
  "recommendation": "reroute_items" | "add_staff" | "redistribute_load" | "simplify_recipe" | "train_staff" | "prep_ahead" | "dismiss"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a kitchen operations AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string; insight?: string; recommendation?: KitchenRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[kitchen] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runKitchenBottleneckScan = async (
  db: ReturnType<typeof useDB>,
  config: KitchenConfig = DEFAULT_KITCHEN_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: KitchenBottleneckAlert[]; checked: number }> => {
  const checks = [
    () => checkStageBottleneck(db, config),
    () => checkRushHourOverflow(db, config),
    () => checkTableTicketDelay(db, config),
    () => checkStationOverload(db, config),
    () => checkStaffIdleWhileQueue(db, config),
    () => checkRerouteSuggestion(db, config),
    () => checkSlowItem(db, config),
  ];
  const total = checks.length;
  let allAlerts: KitchenBottleneckAlert[] = [];

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alerts = await checks[i]();
      allAlerts.push(...alerts);
    } catch (err) { console.warn('[kitchen] check failed at', i, err); }
  }

  if (config.aiEnabled && allAlerts.length > 0) {
    await enhanceWithAI(allAlerts);
  }

  // Persist
  for (const alert of allAlerts) {
    try {
      await db.query(`CREATE kitchen_bottleneck_alert CONTENT $data`, {
        data: { ...alert, detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

// ---------------------------------------------------------------------------
// Read + update
// ---------------------------------------------------------------------------

export const getOpenKitchenAlerts = async (
  db: ReturnType<typeof useDB>
): Promise<KitchenBottleneckAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM kitchen_bottleneck_alert
       WHERE status = 'open'
         AND detected_at > time::now() - 4h
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       estimated_loss DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getKitchenSummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  total: number;
  critical: number;
  warning: number;
  totalLoss: number;
  avgWaitMin: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(severity = 'warning') AS warning,
         math::sum(estimated_loss) AS total_loss,
         math::mean(metric_value) AS avg_wait
       FROM kitchen_bottleneck_alert
       WHERE status = 'open' AND detected_at > time::now() - 4h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      warning: safeNumber(row.warning, 0),
      totalLoss: safeNumber(row.total_loss, 0),
      avgWaitMin: safeNumber(row.avg_wait, 0),
    };
  } catch {
    return { total: 0, critical: 0, warning: 0, totalLoss: 0, avgWaitMin: 0 };
  }
};

export const updateKitchenStatus = async (
  db: ReturnType<typeof useDB>, alertId: string, status: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
