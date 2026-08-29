/**
 * AI Anomaly Detection & Real-time Alerts — operational monitoring.
 *
 * Research finding: Toast Smart Alerts $40+/mo (higher tier), Square
 * Anomaly Detection in Plus. POSR offers it free — monitors all business
 * metrics in real-time and alerts managers when something unusual happens.
 *
 * Complements the AI Command Center (which shows current state) by adding
 * PROACTIVE monitoring — the system watches for you and surfaces problems
 * before they become costly.
 *
 * Detection rules (9):
 *   1. SALES_DROP — hourly revenue < X% of same-hour 30-day average
 *   2. WASTE_SPIKE — today's waste cost > X× daily average
 *   3. CASH_FLOW_WARNING — projected min balance < reserve threshold
 *   4. INVENTORY_STOCKOUT — item stock below par level
 *   5. SENTIMENT_DROP — NPS dropped > 20 points week-over-week
 *   6. NO_SHOW_SPIKE — reservation no-show rate > X%
 *   7. VENDOR_DELAY — PO fulfillment > X days past due
 *   8. STAFFING_GAP — scheduled shifts < required staff for peak hours
 *   9. FORECAST_ERROR_SPIKE — MAPE > X% (AI unreliable)
 *
 * Each alert is deduplicated (won't re-alert same rule within X hours).
 * Each alert gets AI insight (why it happened + what to do).
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'false_positive';
export type AlertCategory = 'revenue' | 'waste' | 'finance' | 'inventory' | 'customer' | 'reservation' | 'procurement' | 'labor' | 'forecast';

export interface OperationalAlert {
  id?: string;
  rule_id: string;
  rule_name: string;
  severity: AlertSeverity;
  category: AlertCategory;
  metric_value: number;
  expected_value: number;
  threshold: number;
  deviation_pct: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_action?: string;
  status: AlertStatus;
  acknowledged_by?: string;
  acknowledged_at?: Date;
  resolved_at?: Date;
  resolved_by?: string;
  resolution_notes?: string;
  detected_at: Date;
}

export interface AnomalyConfig {
  enabled: boolean;
  aiEnabled: boolean;
  salesDropPct: number;
  wasteSpikeMultiplier: number;
  cashflowReservePct: number;
  noShowThreshold: number;
  vendorDelayDays: number;
  forecastMapeThreshold: number;
  dedupWindowHours: number;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  enabled: true,
  aiEnabled: true,
  salesDropPct: 50,
  wasteSpikeMultiplier: 3,
  cashflowReservePct: 100,
  noShowThreshold: 30,
  vendorDelayDays: 14,
  forecastMapeThreshold: 40,
  dedupWindowHours: 6,
};

export const readAnomalyConfig = (settings: any): AnomalyConfig => ({
  enabled: settings?.anomaly_detection_enabled ?? true,
  aiEnabled: settings?.anomaly_ai_enabled ?? true,
  salesDropPct: safeNumber(settings?.anomaly_sales_drop_pct, 50),
  wasteSpikeMultiplier: safeNumber(settings?.anomaly_waste_spike_multiplier, 3),
  cashflowReservePct: safeNumber(settings?.anomaly_cashflow_reserve_pct, 100),
  noShowThreshold: safeNumber(settings?.anomaly_no_show_threshold, 30),
  vendorDelayDays: safeNumber(settings?.anomaly_vendor_delay_days, 14),
  forecastMapeThreshold: safeNumber(settings?.anomaly_forecast_mape_threshold, 40),
  dedupWindowHours: safeNumber(settings?.anomaly_dedup_window_hours, 6),
});

// ---------------------------------------------------------------------------
// Deduplication — check if same rule fired recently
// ---------------------------------------------------------------------------

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  dedupHours: number
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM operational_alert
       WHERE rule_id = $ruleId
         AND detected_at > time::now() - ${dedupHours}h
       LIMIT 1`,
      { ruleId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.length > 0;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Rule 1: SALES_DROP — hourly revenue < X% of average
// ---------------------------------------------------------------------------

const checkSalesDrop = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'sales_drop', config.dedupWindowHours)) return null;

  const currentHour = new Date().getHours();
  try {
    // Today's revenue for current hour
    const todayResult = await db.query(
      `SELECT math::sum(total) AS revenue FROM order
       WHERE time::day(created_at) = time::day(time::now())
         AND time::hour(created_at) = $hour
         AND status = 'Paid' AND deleted_at IS NONE`,
      { hour: currentHour }
    );
    const todayRows = Array.isArray(todayResult) ? todayResult.flat() : [];
    const todayRevenue = safeNumber(todayRows[0]?.revenue, 0);

    // 30-day average for same hour
    const avgResult = await db.query(
      `SELECT math::sum(total) / 30 AS avg_revenue FROM order
       WHERE created_at > time::now() - 30d
         AND time::hour(created_at) = $hour
         AND status = 'Paid' AND deleted_at IS NONE`,
      { hour: currentHour }
    );
    const avgRows = Array.isArray(avgResult) ? avgResult.flat() : [];
    const avgRevenue = safeNumber(avgRows[0]?.avg_revenue, 0);

    if (avgRevenue <= 0) return null;

    const threshold = avgRevenue * (config.salesDropPct / 100);
    if (todayRevenue >= threshold) return null;

    const deviation = ((todayRevenue - avgRevenue) / avgRevenue) * 100;
    const severity = todayRevenue < avgRevenue * 0.25 ? 'critical' : 'warning';

    return {
      rule_id: 'sales_drop',
      rule_name: 'Sales Drop Detected',
      severity,
      category: 'revenue',
      metric_value: Math.round(todayRevenue * 100) / 100,
      expected_value: Math.round(avgRevenue * 100) / 100,
      threshold: Math.round(threshold * 100) / 100,
      deviation_pct: Math.round(deviation * 10) / 10,
      description: `Hour ${currentHour}:00 revenue is ${withCurrency(todayRevenue)}, expected ~${withCurrency(avgRevenue)} (dropped ${Math.abs(Math.round(deviation))}%).`,
      context: { hour: currentHour, avg_revenue: avgRevenue },
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkSalesDrop failed', err);
    return null;
  }
};

// Rule 2: WASTE_SPIKE
const checkWasteSpike = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'waste_spike', config.dedupWindowHours)) return null;

  try {
    // Today's waste
    const todayResult = await db.query(
      `SELECT math::sum(quantity * price) AS waste FROM inventory_item_waste_item
       WHERE created_at > time::now() - 1d`
    );
    const todayRows = Array.isArray(todayResult) ? todayResult.flat() : [];
    const todayWaste = safeNumber(todayRows[0]?.waste, 0);

    // 30-day daily average
    const avgResult = await db.query(
      `SELECT math::sum(quantity * price) / 30 AS avg_waste FROM inventory_item_waste_item
       WHERE created_at > time::now() - 30d`
    );
    const avgRows = Array.isArray(avgResult) ? avgResult.flat() : [];
    const avgWaste = safeNumber(avgRows[0]?.avg_waste, 0);

    if (avgWaste <= 0) return null;

    const threshold = avgWaste * config.wasteSpikeMultiplier;
    if (todayWaste <= threshold) return null;

    const deviation = ((todayWaste - avgWaste) / avgWaste) * 100;
    const severity = todayWaste > avgWaste * 5 ? 'critical' : 'warning';

    return {
      rule_id: 'waste_spike',
      rule_name: 'Waste Spike Detected',
      severity,
      category: 'waste',
      metric_value: Math.round(todayWaste * 100) / 100,
      expected_value: Math.round(avgWaste * 100) / 100,
      threshold: Math.round(threshold * 100) / 100,
      deviation_pct: Math.round(deviation * 10) / 10,
      description: `Today's waste is ${withCurrency(todayWaste)}, ${config.wasteSpikeMultiplier}× the daily average (${withCurrency(avgWaste)}).`,
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkWasteSpike failed', err);
    return null;
  }
};

// Rule 3: CASH_FLOW_WARNING
const checkCashFlow = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'cash_flow_warning', config.dedupWindowHours)) return null;

  try {
    const result = await db.query(
      `SELECT min_projected_balance, min_balance_date, health_status
       FROM cash_flow_forecast
       WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const forecast = rows[0];
    if (!forecast || forecast.health_status === 'healthy') return null;

    const minBalance = safeNumber(forecast.min_projected_balance, 0);
    const reserveThreshold = safeNumber(minBalance > 0 ? minBalance : 0, 0);
    const severity = minBalance < 0 ? 'critical' : 'warning';

    return {
      rule_id: 'cash_flow_warning',
      rule_name: 'Cash Flow Warning',
      severity,
      category: 'finance',
      metric_value: Math.round(minBalance * 100) / 100,
      expected_value: 0,
      threshold: 0,
      deviation_pct: minBalance < 0 ? -100 : 0,
      description: `Projected minimum balance is ${withCurrency(minBalance)} on ${forecast.min_balance_date ? new Date(forecast.min_balance_date).toLocaleDateString() : 'unknown date'}. Health: ${forecast.health_status}.`,
      context: { health_status: forecast.health_status, min_balance_date: forecast.min_balance_date },
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkCashFlow failed', err);
    return null;
  }
};

// Rule 4: INVENTORY_STOCKOUT
const checkInventoryStockout = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'inventory_stockout', config.dedupWindowHours)) return null;

  try {
    // Find reorder suggestions with urgency 'critical'
    const result = await db.query(
      `SELECT count() AS count, math::sum(total_cost) AS total FROM reorder_suggestion
       WHERE status = 'pending' AND urgency = 'critical'`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const data = rows[0];
    const count = safeNumber(data?.count, 0);
    if (count === 0) return null;

    const totalCost = safeNumber(data?.total, 0);
    const severity = count > 5 ? 'critical' : 'warning';

    return {
      rule_id: 'inventory_stockout',
      rule_name: 'Critical Inventory Stockout Risk',
      severity,
      category: 'inventory',
      metric_value: count,
      expected_value: 0,
      threshold: 1,
      deviation_pct: 100,
      description: `${count} items at critical stockout risk (urgent reorder needed, total value ${withCurrency(totalCost)}).`,
      context: { count, total_cost: totalCost },
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkInventoryStockout failed', err);
    return null;
  }
};

// Rule 5: SENTIMENT_DROP
const checkSentimentDrop = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'sentiment_drop', config.dedupWindowHours)) return null;

  try {
    // Compare this week's NPS with last week's
    const result = await db.query(
      `SELECT nps_score, period_type FROM sentiment_summary
       WHERE period_type = 'weekly'
       ORDER BY period_start DESC LIMIT 2`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length < 2) return null;

    const thisWeek = rows[0];
    const lastWeek = rows[1];
    const thisNps = safeNumber(thisWeek.nps_score, 0);
    const lastNps = safeNumber(lastWeek.nps_score, 0);
    const drop = lastNps - thisNps;

    if (drop < 20) return null; // need 20+ point drop

    const severity = drop > 40 ? 'critical' : 'warning';
    const deviation = lastNps > 0 ? -(drop / lastNps) * 100 : 0;

    return {
      rule_id: 'sentiment_drop',
      rule_name: 'Customer Sentiment Drop',
      severity,
      category: 'customer',
      metric_value: thisNps,
      expected_value: lastNps,
      threshold: lastNps - 20,
      deviation_pct: Math.round(deviation * 10) / 10,
      description: `NPS dropped ${drop} points (from ${lastNps} to ${thisNps}) week-over-week. Investigate reviews.`,
      context: { this_week_nps: thisNps, last_week_nps: lastNps, drop },
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkSentimentDrop failed', err);
    return null;
  }
};

// Rule 6: NO_SHOW_SPIKE
const checkNoShowSpike = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'no_show_spike', config.dedupWindowHours)) return null;

  try {
    const result = await db.query(
      `SELECT count() AS total,
         count(IF status = 'no_show' THEN 1 END) AS no_shows
       FROM reservation
       WHERE created_at > time::now() - 7d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const data = rows[0];
    const total = safeNumber(data?.total, 0);
    if (total < 5) return null; // need enough data

    const noShows = safeNumber(data?.no_shows, 0);
    const rate = (noShows / total) * 100;
    if (rate < config.noShowThreshold) return null;

    const severity = rate > 50 ? 'critical' : 'warning';
    const deviation = ((rate - 10) / 10) * 100; // baseline 10% no-show

    return {
      rule_id: 'no_show_spike',
      rule_name: 'Reservation No-Show Spike',
      severity,
      category: 'reservation',
      metric_value: Math.round(rate * 10) / 10,
      expected_value: 10,
      threshold: config.noShowThreshold,
      deviation_pct: Math.round(deviation * 10) / 10,
      description: `No-show rate is ${rate.toFixed(0)}% (${noShows}/${total} reservations this week). Threshold: ${config.noShowThreshold}%.`,
      context: { total, no_shows: noShows, rate },
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkNoShowSpike failed', err);
    return null;
  }
};

// Rule 7: VENDOR_DELAY
const checkVendorDelay = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'vendor_delay', config.dedupWindowHours)) return null;

  try {
    const result = await db.query(
      `SELECT count() AS count FROM inventory_purchase_order
       WHERE status = 'Approved'
         AND submitted_at < time::now() - ${config.vendorDelayDays}d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const count = safeNumber(rows[0]?.count, 0);
    if (count === 0) return null;

    const severity = count > 3 ? 'critical' : 'warning';

    return {
      rule_id: 'vendor_delay',
      rule_name: 'Vendor Delivery Delay',
      severity,
      category: 'procurement',
      metric_value: count,
      expected_value: 0,
      threshold: 1,
      deviation_pct: 100,
      description: `${count} approved purchase orders are > ${config.vendorDelayDays} days past submission without fulfillment.`,
      context: { count, delay_days: config.vendorDelayDays },
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkVendorDelay failed', err);
    return null;
  }
};

// Rule 8: STAFFING_GAP
const checkStaffingGap = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'staffing_gap', config.dedupWindowHours)) return null;

  try {
    const result = await db.query(
      `SELECT coverage_gaps FROM schedule_optimization
       ORDER BY generated_at DESC LIMIT 1`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const data = rows[0];
    const gaps = safeNumber(data?.coverage_gaps, 0);
    if (gaps < 3) return null;

    const severity = gaps > 10 ? 'critical' : 'warning';

    return {
      rule_id: 'staffing_gap',
      rule_name: 'Staffing Coverage Gap',
      severity,
      category: 'labor',
      metric_value: gaps,
      expected_value: 0,
      threshold: 3,
      deviation_pct: 100,
      description: `${gaps} hours with staffing gaps in the generated schedule. Peak demand may exceed staff capacity.`,
      context: { coverage_gaps: gaps },
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkStaffingGap failed', err);
    return null;
  }
};

// Rule 9: FORECAST_ERROR_SPIKE
const checkForecastError = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig
): Promise<OperationalAlert | null> => {
  if (await isRecentlyAlerted(db, 'forecast_error_spike', config.dedupWindowHours)) return null;

  try {
    const result = await db.query(
      `SELECT mape, evaluated_count FROM forecast_accuracy
       ORDER BY evaluated_at DESC LIMIT 1`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const data = rows[0];
    if (!data) return null;

    const mape = safeNumber(data.mape, 0);
    const evalCount = safeNumber(data.evaluated_count, 0);
    if (evalCount < 5) return null; // need enough data
    if (mape < config.forecastMapeThreshold) return null;

    const severity = mape > 60 ? 'critical' : 'warning';
    const deviation = ((mape - 15) / 15) * 100; // benchmark 15%

    return {
      rule_id: 'forecast_error_spike',
      rule_name: 'Forecast Accuracy Degraded',
      severity,
      category: 'forecast',
      metric_value: Math.round(mape * 10) / 10,
      expected_value: 15,
      threshold: config.forecastMapeThreshold,
      deviation_pct: Math.round(deviation * 10) / 10,
      description: `Forecast MAPE is ${mape.toFixed(1)}% (threshold ${config.forecastMapeThreshold}%). AI predictions may be unreliable — review before using for staffing/purchasing.`,
      context: { mape, evaluated_count: evalCount },
      status: 'open',
      detected_at: new Date(),
    };
  } catch (err) {
    console.warn('[anomaly] checkForecastError failed', err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// AI enhancement — per-alert insight + action
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  alert: OperationalAlert
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) return;

  const prompt = `You are a restaurant operations alert analyst.
An alert was triggered. Explain why + recommend action.

Alert:
  Rule: ${alert.rule_name}
  Severity: ${alert.severity}
  Category: ${alert.category}
  Current value: ${alert.metric_value}
  Expected: ${alert.expected_value}
  Threshold: ${alert.threshold}
  Deviation: ${alert.deviation_pct}%
  Description: ${alert.description}

Respond with JSON:
{
  "insight": "<max 300 chars — why this happened + potential causes>",
  "action": "<max 200 chars — concrete immediate next step>"
}`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant operations alert analyst AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 300 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    alert.ai_insight = parsed.insight?.slice(0, 300);
    alert.ai_action = parsed.action?.slice(0, 200);
  } catch (err) {
    console.warn('[anomaly] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Main entry — run all detection rules
// ---------------------------------------------------------------------------

export interface DetectionResult {
  checked: number;
  triggered: number;
  alerts: OperationalAlert[];
}

export const runAnomalyDetection = async (
  db: ReturnType<typeof useDB>,
  config: AnomalyConfig = DEFAULT_ANOMALY_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<DetectionResult> => {
  if (!config.enabled) {
    return { checked: 0, triggered: 0, alerts: [] };
  }

  const checks = [
    () => checkSalesDrop(db, config),
    () => checkWasteSpike(db, config),
    () => checkCashFlow(db, config),
    () => checkInventoryStockout(db, config),
    () => checkSentimentDrop(db, config),
    () => checkNoShowSpike(db, config),
    () => checkVendorDelay(db, config),
    () => checkStaffingGap(db, config),
    () => checkForecastError(db, config),
  ];

  const alerts: OperationalAlert[] = [];
  const total = checks.length;

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alert = await checks[i]();
      if (alert) {
        // AI enhancement
        if (config.aiEnabled) {
          await enhanceWithAI(alert);
        }
        // Persist
        try {
          const result = await db.query(
            `CREATE operational_alert CONTENT $data`,
            {
              data: {
                ...alert,
                detected_at: alert.detected_at.toISOString(),
                acknowledged_at: alert.acknowledged_at?.toISOString(),
                resolved_at: alert.resolved_at?.toISOString(),
              },
            }
          );
          alert.id = (result as any)?.id?.toString?.() ?? '';
        } catch (err) {
          console.warn('[anomaly] persist alert failed', err);
        }
        alerts.push(alert);
      }
    } catch (err) {
      console.warn('[anomaly] check failed at index', i, err);
    }
  }

  if (onProgress) onProgress(total, total);

  return { checked: total, triggered: alerts.length, alerts };
};

// ---------------------------------------------------------------------------
// Retrieval + lifecycle
// ---------------------------------------------------------------------------

export const getOpenAlerts = async (
  db: ReturnType<typeof useDB>
): Promise<OperationalAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM operational_alert
       WHERE status = 'open'
       ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         detected_at DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[anomaly] getOpenAlerts failed', err);
    return [];
  }
};

export const getAllAlerts = async (
  db: ReturnType<typeof useDB>,
  limit = 50
): Promise<OperationalAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM operational_alert ORDER BY detected_at DESC LIMIT $limit`,
      { limit }
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[anomaly] getAllAlerts failed', err);
    return [];
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: AlertStatus,
  userId?: string,
  resolutionNotes?: string
): Promise<void> => {
  const now = new Date().toISOString();
  const updates: any = { status };
  if (status === 'acknowledged') {
    updates.acknowledged_by = userId;
    updates.acknowledged_at = now;
  } else if (status === 'resolved' || status === 'false_positive') {
    updates.resolved_by = userId;
    updates.resolved_at = now;
    if (resolutionNotes) updates.resolution_notes = resolutionNotes;
  }
  await db.query(`UPDATE $id SET $updates`, { id: alertId, updates });
};

// Helper for currency display (imported from utils in report component, but needed here for descriptions)
const withCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};
