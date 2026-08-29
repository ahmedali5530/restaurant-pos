/**
 * AI Waste Tracking Intelligence service — pattern detection + insights.
 *
 * Research finding: Toast Waste Management $40+/mo, Lightspeed Waste Tracking
 * add-on. POSR offers it free — analyzes waste patterns (by item, time-of-day,
 * day-of-week, staff) + AI generates recommendations for reducing waste.
 *
 * Architecture:
 *   1. Collect waste data:
 *      - inventory_item_waste (storage-level waste)
 *      - kitchen_waste (prep/cooking waste)
 *      - buffet_waste_log (buffet leftover waste)
 *   2. Pattern detection (statistical):
 *      - item_recurring: same item wasted 3+ times in lookback window
 *      - time_of_day: waste clusters at specific hours
 *      - day_of_week: waste clusters on specific days
 *      - staff_correlation: waste correlates with specific staff
 *      - reason_cluster: same reason code recurring
 *   3. Severity scoring (0-100):
 *      - occurrence frequency (40%)
 *      - total cost impact (40%)
 *      - trend direction (20% — increasing = higher severity)
 *   4. AI enhancement (optional):
 *      - OpenAI analyzes patterns + generates per-pattern insights
 *      - Recommended action (reduce_order / retrain_staff / adjust_prep / etc.)
 *      - Projected monthly savings if action taken
 *      - Confidence score (0-1)
 *   5. Aggregated summary:
 *      - Total waste value + quantity
 *      - Waste % of revenue (benchmarked against industry: healthy <2%, critical >6%)
 *      - Top wasted items
 *      - Top reason codes
 *      - Projected annual savings if all recommendations implemented
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PatternType = 'item_recurring' | 'time_of_day' | 'day_of_week' | 'staff_correlation' | 'reason_cluster';
export type TrendDirection = 'increasing' | 'decreasing' | 'stable';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type InsightType = 'reduce_order' | 'retrain_staff' | 'adjust_prep' | 'check_storage' | 'menu_change' | 'supplier_issue' | 'monitor';
export type InsightPriority = 'low' | 'medium' | 'high';

export interface WastePattern {
  id?: string;
  pattern_type: PatternType;
  item_id?: string;
  item_name?: string;
  reason_code?: string;
  day_of_week?: number;
  hour_of_day?: number;
  user_id?: string;
  user_name?: string;
  occurrence_count: number;
  total_quantity: number;
  total_cost: number;
  avg_cost_per_event: number;
  first_seen: Date;
  last_seen: Date;
  trend_direction: TrendDirection;
  severity: Severity;
  detected_at: Date;
}

export interface WasteInsight {
  id?: string;
  pattern_id: string;
  insight_type: InsightType;
  insight_text: string;
  recommended_action: string;
  projected_savings?: number;
  confidence: number;
  priority: InsightPriority;
  status: 'open' | 'acknowledged' | 'acted_on' | 'dismissed';
  generated_at: Date;
  expires_at?: Date;
}

export interface WasteReasonCode {
  id: string;
  code: string;
  label: string;
  description?: string;
  is_preventable: boolean;
  category: string;
  sort_order: number;
}

export interface WasteSummary {
  totalEvents: number;
  totalQuantity: number;
  totalCost: number;
  wastePctOfRevenue: number;
  healthLevel: 'healthy' | 'acceptable' | 'concerning' | 'critical';
  topWastedItems: Array<{ name: string; quantity: number; cost: number; count: number }>;
  topReasons: Array<{ code: string; label: string; count: number; cost: number }>;
  preventableCost: number;
  preventablePct: number;
  projectedAnnualSavings: number;
  period_start: Date;
  period_end: Date;
  generatedAt: Date;
}

export interface WasteConfig {
  criticalPct: number;
  concerningPct: number;
  acceptablePct: number;
  lookbackDays: number;
  aiEnabled: boolean;
  patternMinOccurrences: number;
}

export const DEFAULT_WASTE_CONFIG: WasteConfig = {
  criticalPct: 6,
  concerningPct: 4,
  acceptablePct: 2,
  lookbackDays: 30,
  aiEnabled: true,
  patternMinOccurrences: 3,
};

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

export const readWasteConfig = (settings: any): WasteConfig => ({
  criticalPct: safeNumber(settings?.waste_critical_pct, 6),
  concerningPct: safeNumber(settings?.waste_concerning_pct, 4),
  acceptablePct: safeNumber(settings?.waste_acceptable_pct, 2),
  lookbackDays: safeNumber(settings?.waste_lookback_days, 30),
  aiEnabled: settings?.waste_ai_enabled ?? true,
  patternMinOccurrences: safeNumber(settings?.waste_pattern_min_occurrences, 3),
});

// ---------------------------------------------------------------------------
// Reason codes
// ---------------------------------------------------------------------------

export const getWasteReasonCodes = async (
  db: ReturnType<typeof useDB>
): Promise<WasteReasonCode[]> => {
  try {
    const result = await db.query<WasteReasonCode[]>(
      `SELECT * FROM waste_reason_code WHERE is_active = true ORDER BY sort_order ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Waste data collection — from inventory_item_waste + kitchen_waste
// ---------------------------------------------------------------------------

interface WasteEvent {
  id: string;
  item_id?: string;
  item_name?: string;
  quantity: number;
  cost: number;
  reason_code?: string;
  created_at: Date;
  user_id?: string;
  user_name?: string;
  hour: number;
  day_of_week: number;
}

const collectWasteEvents = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<WasteEvent[]> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const events: WasteEvent[] = [];

  // 1. inventory_item_waste (storage-level waste)
  try {
    const result = await db.query<any[]>(
      `SELECT
         id,
         items.item.id AS item_id,
         items.item.name AS item_name,
         items.quantity AS quantity,
         items.price AS unit_cost,
         items.source AS reason_code,
         created_at,
         created_by.id AS user_id,
         created_by.name AS user_name
       FROM inventory_item_waste
       WHERE created_at > $cutoff AND deleted_at IS NONE
       SPLIT items
       FETCH items.item, created_by`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const created = r.created_at ? new Date(r.created_at as any) : new Date();
      events.push({
        id: r.id?.toString?.() ?? Math.random().toString(),
        item_id: r.item_id?.toString?.(),
        item_name: r.item_name,
        quantity: safeNumber(r.quantity, 0),
        cost: safeNumber(r.quantity, 0) * safeNumber(r.unit_cost, 0),
        reason_code: r.reason_code ?? 'other',
        created_at: created,
        user_id: r.user_id?.toString?.(),
        user_name: r.user_name,
        hour: created.getHours(),
        day_of_week: created.getDay(),
      });
    }
  } catch (err) {
    console.warn('[waste] inventory_item_waste fetch failed', err);
  }

  // 2. kitchen_waste (prep/cooking waste)
  try {
    const result = await db.query<any[]>(
      `SELECT
         id,
         item.id AS item_id,
         item.name AS item_name,
         quantity,
         cost AS unit_cost,
         reason_code,
         created_at,
         user.id AS user_id,
         user.name AS user_name
       FROM kitchen_waste
       WHERE created_at > $cutoff AND deleted_at IS NONE
       FETCH item, user`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const created = r.created_at ? new Date(r.created_at as any) : new Date();
      events.push({
        id: r.id?.toString?.() ?? Math.random().toString(),
        item_id: r.item_id?.toString?.(),
        item_name: r.item_name,
        quantity: safeNumber(r.quantity, 0),
        cost: safeNumber(r.quantity, 0) * safeNumber(r.unit_cost, 0),
        reason_code: r.reason_code ?? 'other',
        created_at: created,
        user_id: r.user_id?.toString?.(),
        user_name: r.user_name,
        hour: created.getHours(),
        day_of_week: created.getDay(),
      });
    }
  } catch (err) {
    console.warn('[waste] kitchen_waste fetch failed', err);
  }

  return events;
};

// ---------------------------------------------------------------------------
// Revenue fetch (for waste % of revenue calculation)
// ---------------------------------------------------------------------------

const fetchPeriodRevenue = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<number> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  try {
    const result = await db.query<any[]>(
      `SELECT math::sum(total) AS revenue FROM order WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.revenue, 0);
  } catch {
    return 0;
  }
};

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

const computeSeverity = (
  occurrenceCount: number,
  totalCost: number,
  trend: TrendDirection,
  _avgCost: number
): Severity => {
  // Severity score 0-100
  const freqScore = Math.min(40, occurrenceCount * 5); // 8+ occurrences = max
  const costScore = Math.min(40, totalCost / 10); // $400+ = max
  const trendScore = trend === 'increasing' ? 20 : trend === 'decreasing' ? 5 : 10;
  const score = freqScore + costScore + trendScore;
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
};

const detectTrend = (events: WasteEvent[]): TrendDirection => {
  if (events.length < 4) return 'stable';
  // Split events into first half + second half by time
  const sorted = [...events].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  const mid = Math.floor(sorted.length / 2);
  const firstHalfCost = sorted.slice(0, mid).reduce((s, e) => s + e.cost, 0);
  const secondHalfCost = sorted.slice(mid).reduce((s, e) => s + e.cost, 0);
  if (secondHalfCost > firstHalfCost * 1.3) return 'increasing';
  if (secondHalfCost < firstHalfCost * 0.7) return 'decreasing';
  return 'stable';
};

const detectPatterns = (
  events: WasteEvent[],
  config: WasteConfig
): WastePattern[] => {
  const patterns: WastePattern[] = [];
  const minOccurrences = config.patternMinOccurrences;

  // 1. item_recurring — same item wasted multiple times
  const byItem = new Map<string, WasteEvent[]>();
  for (const e of events) {
    if (!e.item_id) continue;
    if (!byItem.has(e.item_id)) byItem.set(e.item_id, []);
    byItem.get(e.item_id)!.push(e);
  }
  for (const [itemId, itemEvents] of byItem) {
    if (itemEvents.length < minOccurrences) continue;
    const totalCost = itemEvents.reduce((s, e) => s + e.cost, 0);
    const totalQty = itemEvents.reduce((s, e) => s + e.quantity, 0);
    const trend = detectTrend(itemEvents);
    patterns.push({
      pattern_type: 'item_recurring',
      item_id: itemId,
      item_name: itemEvents[0].item_name,
      occurrence_count: itemEvents.length,
      total_quantity: totalQty,
      total_cost: Math.round(totalCost * 100) / 100,
      avg_cost_per_event: Math.round((totalCost / itemEvents.length) * 100) / 100,
      first_seen: itemEvents[0].created_at,
      last_seen: itemEvents[itemEvents.length - 1].created_at,
      trend_direction: trend,
      severity: computeSeverity(itemEvents.length, totalCost, trend, totalCost / itemEvents.length),
      detected_at: new Date(),
    });
  }

  // 2. reason_cluster — same reason code recurring
  const byReason = new Map<string, WasteEvent[]>();
  for (const e of events) {
    const code = e.reason_code ?? 'other';
    if (!byReason.has(code)) byReason.set(code, []);
    byReason.get(code)!.push(e);
  }
  for (const [reasonCode, reasonEvents] of byReason) {
    if (reasonEvents.length < minOccurrences) continue;
    const totalCost = reasonEvents.reduce((s, e) => s + e.cost, 0);
    const totalQty = reasonEvents.reduce((s, e) => s + e.quantity, 0);
    const trend = detectTrend(reasonEvents);
    patterns.push({
      pattern_type: 'reason_cluster',
      reason_code: reasonCode,
      occurrence_count: reasonEvents.length,
      total_quantity: totalQty,
      total_cost: Math.round(totalCost * 100) / 100,
      avg_cost_per_event: Math.round((totalCost / reasonEvents.length) * 100) / 100,
      first_seen: reasonEvents[0].created_at,
      last_seen: reasonEvents[reasonEvents.length - 1].created_at,
      trend_direction: trend,
      severity: computeSeverity(reasonEvents.length, totalCost, trend, totalCost / reasonEvents.length),
      detected_at: new Date(),
    });
  }

  // 3. time_of_day — waste clusters at specific hours
  const byHour = new Map<number, WasteEvent[]>();
  for (const e of events) {
    if (!byHour.has(e.hour)) byHour.set(e.hour, []);
    byHour.get(e.hour)!.push(e);
  }
  for (const [hour, hourEvents] of byHour) {
    if (hourEvents.length < minOccurrences) continue;
    const totalCost = hourEvents.reduce((s, e) => s + e.cost, 0);
    const trend = detectTrend(hourEvents);
    patterns.push({
      pattern_type: 'time_of_day',
      hour_of_day: hour,
      occurrence_count: hourEvents.length,
      total_quantity: hourEvents.reduce((s, e) => s + e.quantity, 0),
      total_cost: Math.round(totalCost * 100) / 100,
      avg_cost_per_event: Math.round((totalCost / hourEvents.length) * 100) / 100,
      first_seen: hourEvents[0].created_at,
      last_seen: hourEvents[hourEvents.length - 1].created_at,
      trend_direction: trend,
      severity: computeSeverity(hourEvents.length, totalCost, trend, totalCost / hourEvents.length),
      detected_at: new Date(),
    });
  }

  // 4. day_of_week — waste clusters on specific days
  const byDay = new Map<number, WasteEvent[]>();
  for (const e of events) {
    if (!byDay.has(e.day_of_week)) byDay.set(e.day_of_week, []);
    byDay.get(e.day_of_week)!.push(e);
  }
  for (const [day, dayEvents] of byDay) {
    if (dayEvents.length < minOccurrences) continue;
    const totalCost = dayEvents.reduce((s, e) => s + e.cost, 0);
    const trend = detectTrend(dayEvents);
    patterns.push({
      pattern_type: 'day_of_week',
      day_of_week: day,
      occurrence_count: dayEvents.length,
      total_quantity: dayEvents.reduce((s, e) => s + e.quantity, 0),
      total_cost: Math.round(totalCost * 100) / 100,
      avg_cost_per_event: Math.round((totalCost / dayEvents.length) * 100) / 100,
      first_seen: dayEvents[0].created_at,
      last_seen: dayEvents[dayEvents.length - 1].created_at,
      trend_direction: trend,
      severity: computeSeverity(dayEvents.length, totalCost, trend, totalCost / dayEvents.length),
      detected_at: new Date(),
    });
  }

  // 5. staff_correlation — waste correlates with specific staff
  const byStaff = new Map<string, WasteEvent[]>();
  for (const e of events) {
    if (!e.user_id) continue;
    if (!byStaff.has(e.user_id)) byStaff.set(e.user_id, []);
    byStaff.get(e.user_id)!.push(e);
  }
  for (const [userId, staffEvents] of byStaff) {
    if (staffEvents.length < minOccurrences) continue;
    const totalCost = staffEvents.reduce((s, e) => s + e.cost, 0);
    const trend = detectTrend(staffEvents);
    patterns.push({
      pattern_type: 'staff_correlation',
      user_id: userId,
      user_name: staffEvents[0].user_name,
      occurrence_count: staffEvents.length,
      total_quantity: staffEvents.reduce((s, e) => s + e.quantity, 0),
      total_cost: Math.round(totalCost * 100) / 100,
      avg_cost_per_event: Math.round((totalCost / staffEvents.length) * 100) / 100,
      first_seen: staffEvents[0].created_at,
      last_seen: staffEvents[staffEvents.length - 1].created_at,
      trend_direction: trend,
      severity: computeSeverity(staffEvents.length, totalCost, trend, totalCost / staffEvents.length),
      detected_at: new Date(),
    });
  }

  // Sort by severity (critical first), then by total_cost descending
  const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];
  return patterns.sort((a, b) => {
    const sevDiff = severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    if (sevDiff !== 0) return sevDiff;
    return b.total_cost - a.total_cost;
  });
};

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

const computeSummary = (
  events: WasteEvent[],
  revenue: number,
  config: WasteConfig
): WasteSummary => {
  const totalEvents = events.length;
  const totalQuantity = events.reduce((s, e) => s + e.quantity, 0);
  const totalCost = events.reduce((s, e) => s + e.cost, 0);
  const wastePct = revenue > 0 ? (totalCost / revenue) * 100 : 0;

  let healthLevel: WasteSummary['healthLevel'] = 'healthy';
  if (wastePct >= config.criticalPct) healthLevel = 'critical';
  else if (wastePct >= config.concerningPct) healthLevel = 'concerning';
  else if (wastePct >= config.acceptablePct) healthLevel = 'acceptable';

  // Top wasted items
  const byItem = new Map<string, { name: string; quantity: number; cost: number; count: number }>();
  for (const e of events) {
    const key = e.item_id ?? e.item_name ?? 'unknown';
    const name = e.item_name ?? 'Unknown';
    if (!byItem.has(key)) byItem.set(key, { name, quantity: 0, cost: 0, count: 0 });
    const item = byItem.get(key)!;
    item.quantity += e.quantity;
    item.cost += e.cost;
    item.count += 1;
  }
  const topWastedItems = Array.from(byItem.values())
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  // Top reasons
  const byReason = new Map<string, { count: number; cost: number }>();
  for (const e of events) {
    const code = e.reason_code ?? 'other';
    if (!byReason.has(code)) byReason.set(code, { count: 0, cost: 0 });
    byReason.get(code)!.count += 1;
    byReason.get(code)!.cost += e.cost;
  }
  const topReasons = Array.from(byReason.entries())
    .map(([code, v]) => ({ code, label: code.replace(/_/g, ' '), count: v.count, cost: v.cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  // Preventable cost (reasons where is_preventable = true)
  const preventableCodes = ['spoilage', 'over_prep', 'burn', 'customer_return', 'expired', 'damage', 'training', 'portion_error', 'trim_waste', 'temp_abuse'];
  const preventableCost = events
    .filter(e => preventableCodes.includes(e.reason_code ?? 'other'))
    .reduce((s, e) => s + e.cost, 0);
  const preventablePct = totalCost > 0 ? (preventableCost / totalCost) * 100 : 0;

  // Projected annual savings: assume 50% reduction in preventable waste
  const projectedAnnualSavings = preventableCost * 0.5 * 12;

  return {
    totalEvents,
    totalQuantity: Math.round(totalQuantity * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    wastePctOfRevenue: Math.round(wastePct * 100) / 100,
    healthLevel,
    topWastedItems: topWastedItems.map(i => ({
      ...i,
      cost: Math.round(i.cost * 100) / 100,
    })),
    topReasons: topReasons.map(r => ({ ...r, cost: Math.round(r.cost * 100) / 100 })),
    preventableCost: Math.round(preventableCost * 100) / 100,
    preventablePct: Math.round(preventablePct * 100) / 100,
    projectedAnnualSavings: Math.round(projectedAnnualSavings * 100) / 100,
    period_start: new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000),
    period_end: new Date(),
    generatedAt: new Date(),
  };
};

// ---------------------------------------------------------------------------
// AI enhancement — per-pattern insights + recommendations
// ---------------------------------------------------------------------------

const enhancePatternsWithAI = async (
  patterns: WastePattern[],
  summary: WasteSummary
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[waste] OpenAI not available — using rule-based insights');
    ruleBasedInsights(patterns);
    return;
  }

  const topPatterns = patterns.filter(p => p.severity === 'critical' || p.severity === 'high').slice(0, 20);
  if (topPatterns.length === 0) {
    ruleBasedInsights(patterns);
    return;
  }

  const prompt = `You are a restaurant waste reduction expert.
Analyze these waste patterns and provide insights + recommendations.

Overall waste summary:
  Total waste cost: $${summary.totalCost}
  Waste % of revenue: ${summary.wastePctOfRevenue}%
  Total events: ${summary.totalEvents}
  Preventable %: ${summary.preventablePct}%

Top patterns (JSON):
${JSON.stringify(topPatterns.map(p => ({
  type: p.pattern_type,
  item: p.item_name,
  reason: p.reason_code,
  hour: p.hour_of_day,
  day: p.day_of_week,
  staff: p.user_name,
  occurrences: p.occurrence_count,
  total_cost: p.total_cost,
  trend: p.trend_direction,
  severity: p.severity,
})), null, 2)}

For each pattern, respond with JSON:
[{
  "insight_type": "reduce_order" | "retrain_staff" | "adjust_prep" | "check_storage" | "menu_change" | "supplier_issue" | "monitor",
  "insight_text": "<max 300 chars — what's happening>",
  "recommended_action": "<max 200 chars — concrete next step>",
  "projected_monthly_savings": <number>,
  "confidence": <0-1>,
  "priority": "low" | "medium" | "high"
}]

Order the array to match the input patterns. Only include meaningful insights.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant waste reduction AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 2000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      ruleBasedInsights(patterns);
      return;
    }
    const insights = JSON.parse(jsonMatch[0]) as Array<{
      insight_type: InsightType;
      insight_text: string;
      recommended_action: string;
      projected_monthly_savings?: number;
      confidence?: number;
      priority?: InsightPriority;
    }>;

    // Attach insights to patterns (as transient property — persisted separately)
    (patterns as any)._aiInsights = insights;
  } catch (err) {
    console.warn('[waste] AI enhancement failed — using rule-based', err);
    ruleBasedInsights(patterns);
  }
};

const ruleBasedInsights = (patterns: WastePattern[]): void => {
  const insights = patterns.map(p => {
    let insight_type: InsightType = 'monitor';
    let insight_text = '';
    let recommended_action = '';
    let projected_savings = p.total_cost * 0.5;
    let priority: InsightPriority = p.severity === 'critical' ? 'high' : p.severity === 'high' ? 'medium' : 'low';

    switch (p.pattern_type) {
      case 'item_recurring':
        insight_type = p.reason_code === 'spoilage' || p.reason_code === 'expired' ? 'reduce_order' : 'adjust_prep';
        insight_text = `${p.item_name ?? 'Item'} wasted ${p.occurrence_count} times, costing $${p.total_cost.toFixed(2)}. Trend: ${p.trend_direction}.`;
        recommended_action = p.reason_code === 'spoilage'
          ? `Reduce order quantity for ${p.item_name} by 30% + check storage temperature.`
          : `Review prep process for ${p.item_name} — possible portion or training issue.`;
        break;
      case 'reason_cluster':
        insight_type = p.reason_code === 'burn' || p.reason_code === 'training' ? 'retrain_staff' : 'monitor';
        insight_text = `${p.reason_code} recurring ${p.occurrence_count} times, total $${p.total_cost.toFixed(2)}.`;
        recommended_action = p.reason_code === 'burn'
          ? 'Schedule cooking retraining for kitchen staff + review equipment calibration.'
          : 'Investigate root cause + implement corrective process.';
        break;
      case 'time_of_day':
        insight_type = 'adjust_prep';
        insight_text = `Waste clusters at ${p.hour_of_day}:00 (${p.occurrence_count} events, $${p.total_cost.toFixed(2)}).`;
        recommended_action = 'Adjust prep schedule for this hour — possible over-production during slow period.';
        break;
      case 'day_of_week':
        insight_type = 'adjust_prep';
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        insight_text = `Waste clusters on ${days[p.day_of_week ?? 0]} (${p.occurrence_count} events, $${p.total_cost.toFixed(2)}).`;
        recommended_action = 'Review demand forecast for this day — adjust ordering + prep accordingly.';
        break;
      case 'staff_correlation':
        insight_type = 'retrain_staff';
        insight_text = `${p.user_name ?? 'Staff'} has ${p.occurrence_count} waste events ($${p.total_cost.toFixed(2)}).`;
        recommended_action = 'Provide targeted training + review work process. Avoid blame — focus on coaching.';
        break;
    }

    return {
      insight_type,
      insight_text: insight_text.slice(0, 300),
      recommended_action: recommended_action.slice(0, 200),
      projected_monthly_savings: Math.round(projected_savings * 100) / 100,
      confidence: 0.6,
      priority,
    };
  });

  (patterns as any)._aiInsights = insights;
};

// ---------------------------------------------------------------------------
// Main entry — analyze waste + generate patterns + insights
// ---------------------------------------------------------------------------

export interface AnalyzeWasteResult {
  summary: WasteSummary;
  patterns: WastePattern[];
  insights: WasteInsight[];
}

export const analyzeWaste = async (
  db: ReturnType<typeof useDB>,
  config: WasteConfig = DEFAULT_WASTE_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<AnalyzeWasteResult> => {
  if (onProgress) onProgress(0, 4);

  // 1. Collect waste events
  const events = await collectWasteEvents(db, config.lookbackDays);
  if (onProgress) onProgress(1, 4);

  // 2. Fetch revenue for waste % calculation
  const revenue = await fetchPeriodRevenue(db, config.lookbackDays);
  if (onProgress) onProgress(2, 4);

  // 3. Compute summary
  const summary = computeSummary(events, revenue, config);
  if (onProgress) onProgress(3, 4);

  // 4. Detect patterns
  const patterns = detectPatterns(events, config);

  // 5. AI enhancement (optional)
  if (config.aiEnabled && patterns.length > 0) {
    await enhancePatternsWithAI(patterns, summary);
  } else {
    ruleBasedInsights(patterns);
  }
  if (onProgress) onProgress(4, 4);

  // 6. Build insights array
  const aiInsights = (patterns as any)._aiInsights as Array<{
    insight_type: InsightType;
    insight_text: string;
    recommended_action: string;
    projected_monthly_savings?: number;
    confidence?: number;
    priority?: InsightPriority;
  }> ?? [];

  const insights: WasteInsight[] = patterns.map((p, idx) => {
    const ai = aiInsights[idx];
    return {
      pattern_id: p.id ?? `${p.pattern_type}-${idx}`,
      insight_type: ai?.insight_type ?? 'monitor',
      insight_text: ai?.insight_text ?? `${p.pattern_type} pattern detected`,
      recommended_action: ai?.recommended_action ?? 'Monitor and investigate.',
      projected_savings: ai?.projected_monthly_savings,
      confidence: ai?.confidence ?? 0.6,
      priority: ai?.priority ?? 'medium',
      status: 'open',
      generated_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  });

  // 7. Persist patterns + insights (expire old)
  try {
    await db.query(`UPDATE waste_insight SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      const insight = insights[i];
      try {
        // Create pattern
        const patternResult = await db.query<any>(
          `CREATE waste_pattern CONTENT $data`,
          {
            data: {
              ...p,
              item_id: p.item_id,
              user_id: p.user_id,
              first_seen: p.first_seen.toISOString(),
              last_seen: p.last_seen.toISOString(),
              detected_at: p.detected_at.toISOString(),
            },
          }
        );
        const patternId = (patternResult as any)?.id?.toString?.() ?? '';
        if (patternId) {
          p.id = patternId;
          insight.pattern_id = patternId;
          // Create insight
          await db.query(
            `CREATE waste_insight CONTENT $data`,
            {
              data: {
                ...insight,
                pattern: patternId,
                generated_at: insight.generated_at.toISOString(),
                expires_at: insight.expires_at?.toISOString(),
              },
            }
          );
        }
      } catch (err) {
        console.warn('[waste] persist pattern failed', err);
      }
    }
  } catch (err) {
    console.warn('[waste] persist batch failed', err);
  }

  return { summary, patterns, insights };
};

// ---------------------------------------------------------------------------
// Insight retrieval + lifecycle
// ---------------------------------------------------------------------------

export const getOpenInsights = async (
  db: ReturnType<typeof useDB>
): Promise<{ pattern: WastePattern; insight: WasteInsight }[]> => {
  try {
    const result = await db.query<any[]>(
      `SELECT
         *,
         (SELECT * FROM waste_pattern WHERE id = $parent.pattern LIMIT 1)[0] AS pattern
       FROM waste_insight
       WHERE status = 'open' AND (expires_at = NONE OR expires_at > time::now())
       ORDER BY
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         projected_savings DESC`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map(r => ({
      insight: r as WasteInsight,
      pattern: r.pattern as WastePattern,
    })).filter(item => item.pattern);
  } catch (err) {
    console.error('[waste] getOpenInsights failed', err);
    return [];
  }
};

export const updateInsightStatus = async (
  db: ReturnType<typeof useDB>,
  insightId: string,
  status: 'acknowledged' | 'acted_on' | 'dismissed'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: insightId, status });
};
