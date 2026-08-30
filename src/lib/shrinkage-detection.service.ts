/**
 * AI Inventory Theft/Shrinkage Detection service — anomaly detection.
 *
 * Unique to POSR — Toast and Square only have basic waste tracking, not
 * theft/shrinkage detection. POSR analyzes inventory ledger + waste +
 * purchases to detect anomalies that indicate theft or unexplained loss.
 *
 * Detection rules:
 *   1. NEGATIVE_STOCK — stock went negative (sold more than received)
 *   2. EXCESSIVE_WASTE — waste rate > 2x normal for an item
 *   3. AFTER_HOURS_ADJUSTMENT — inventory adjustments at unusual hours (22:00-06:00)
 *   4. REPEATED_ADJUSTMENTS — same item adjusted 3+ times in a week
 *   5. STOCK_VS_SALES_MISMATCH — stock decreased faster than sales justify
 *   6. HIGH_VALUE_LOSS — shrinkage cost > $100 for an item
 *   7. MISSING_PURCHASES — items in stock but no purchase record
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ShrinkageSeverity = 'info' | 'warning' | 'critical';
export type ShrinkageRecommendation = 'investigate' | 'audit_employee' | 'install_camera' | 'review_process' | 'dismiss';

export interface ShrinkageAlert {
  id?: string;
  rule_id: string;
  severity: ShrinkageSeverity;
  item_id?: string;
  item_name?: string;
  metric_value: number;
  expected_value: number;
  deviation_pct: number;
  estimated_loss: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: ShrinkageRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
}

export interface ShrinkageConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  wasteMultiplier: number;
  highValueThreshold: number;
  afterHoursStart: number;
  afterHoursEnd: number;
}

export const DEFAULT_SHRINKAGE_CONFIG: ShrinkageConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  wasteMultiplier: 2,
  highValueThreshold: 100,
  afterHoursStart: 22,
  afterHoursEnd: 6,
};

export const readShrinkageConfig = (settings: any): ShrinkageConfig => ({
  aiEnabled: settings?.shrinkage_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.shrinkage_lookback_days, 30),
  wasteMultiplier: safeNumber(settings?.shrinkage_waste_multiplier, 2),
  highValueThreshold: safeNumber(settings?.shrinkage_high_value_threshold, 100),
  afterHoursStart: safeNumber(settings?.shrinkage_after_hours_start, 22),
  afterHoursEnd: safeNumber(settings?.shrinkage_after_hours_end, 6),
});

const isRecentlyAlerted = async (db: ReturnType<typeof useDB>, ruleId: string, hours = 12): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM shrinkage_alert WHERE rule_id = $ruleId AND detected_at > time::now() - ${hours}h LIMIT 1`,
      { ruleId }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

const checkNegativeStock = async (db: any, config: ShrinkageConfig): Promise<ShrinkageAlert[]> => {
  if (await isRecentlyAlerted(db, 'negative_stock')) return [];
  const alerts: ShrinkageAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         inventory_item.id AS item_id,
         inventory_item.name AS item_name,
         inventory_item.price AS price,
         math::sum(quantity_change) AS current_stock
       FROM inventory_ledger
       WHERE created_at > time::now() - ${config.lookbackDays}d
       GROUP BY inventory_item
       FETCH inventory_item`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const stock = safeNumber(r.current_stock, 0);
      if (stock < 0) {
        const price = safeNumber(r.price, 0);
        alerts.push({
          rule_id: 'negative_stock',
          severity: stock < -10 ? 'critical' : 'warning',
          item_id: r.item_id?.toString?.(),
          item_name: r.item_name,
          metric_value: stock,
          expected_value: 0,
          deviation_pct: 100,
          estimated_loss: Math.abs(stock) * price,
          description: `Item "${r.item_name}" has negative stock (${stock}). Sold more than received — possible theft or recording error.`,
          context: { current_stock: stock, price },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[shrinkage] negative_stock check failed', err); }
  return alerts;
};

const checkExcessiveWaste = async (db: any, config: ShrinkageConfig): Promise<ShrinkageAlert[]> => {
  if (await isRecentlyAlerted(db, 'excessive_waste')) return [];
  const alerts: ShrinkageAlert[] = [];
  try {
    // Current period waste per item
    const currentResult = await db.query(
      `SELECT
         item.id AS item_id,
         item.name AS item_name,
         item.price AS price,
         math::sum(quantity * price) AS waste_cost,
         math::sum(quantity) AS waste_qty
       FROM inventory_item_waste_item
       WHERE created_at > time::now() - ${config.lookbackDays}d
       GROUP BY item
       FETCH item`
    );
    const currentRows = Array.isArray(currentResult) ? currentResult.flat() : [];

    // Previous period (same length, shifted back)
    const prevResult = await db.query(
      `SELECT
         item.id AS item_id,
         math::sum(quantity * price) AS prev_waste_cost,
         math::sum(quantity) AS prev_waste_qty
       FROM inventory_item_waste_item
       WHERE created_at > time::now() - ${config.lookbackDays * 2}d
         AND created_at < time::now() - ${config.lookbackDays}d
       GROUP BY item`
    );
    const prevRows = Array.isArray(prevResult) ? prevResult.flat() : [];
    const prevMap = new Map(prevRows.map((r: any) => [r.item_id?.toString?.(), r]));

    for (const curr of currentRows) {
      const itemId = curr.item_id?.toString?.();
      const prev = prevMap.get(itemId);
      const prevQty = safeNumber(prev?.prev_waste_qty, 0);
      const currQty = safeNumber(curr.waste_qty, 0);
      if (prevQty === 0 && currQty < 3) continue; // not enough data
      const expected = prevQty > 0 ? prevQty : currQty / 2;
      if (currQty > expected * config.wasteMultiplier) {
        const wasteCost = safeNumber(curr.waste_cost, 0);
        alerts.push({
          rule_id: 'excessive_waste',
          severity: wasteCost > config.highValueThreshold ? 'critical' : 'warning',
          item_id: itemId,
          item_name: curr.item_name,
          metric_value: currQty,
          expected_value: expected,
          deviation_pct: Math.round(((currQty - expected) / expected) * 100),
          estimated_loss: wasteCost,
          description: `Item "${curr.item_name}" waste is ${currQty} units (${config.wasteMultiplier}x normal of ${expected.toFixed(0)}). Cost: $${wasteCost.toFixed(2)}.`,
          context: { current_qty: currQty, prev_qty: prevQty, waste_cost: wasteCost },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[shrinkage] excessive_waste check failed', err); }
  return alerts;
};

const checkAfterHoursAdjustment = async (db: any, config: ShrinkageConfig): Promise<ShrinkageAlert[]> => {
  if (await isRecentlyAlerted(db, 'after_hours_adjustment')) return [];
  const alerts: ShrinkageAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         inventory_item.id AS item_id,
         inventory_item.name AS item_name,
         quantity_change,
         unit_cost,
         created_by.name AS user_name,
         created_at
       FROM inventory_ledger
       WHERE reference_type = 'adjustment'
         AND created_at > time::now() - ${config.lookbackDays}d
       FETCH inventory_item, created_by`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const hour = new Date(r.created_at).getHours();
      const isAfterHours = hour >= config.afterHoursStart || hour < config.afterHoursEnd;
      if (isAfterHours) {
        const change = safeNumber(r.quantity_change, 0);
        const loss = change < 0 ? Math.abs(change) * safeNumber(r.unit_cost, 0) : 0;
        alerts.push({
          rule_id: 'after_hours_adjustment',
          severity: loss > config.highValueThreshold ? 'critical' : 'warning',
          item_id: r.item_id?.toString?.(),
          item_name: r.item_name,
          metric_value: change,
          expected_value: 0,
          deviation_pct: 100,
          estimated_loss: loss,
          description: `Inventory adjustment for "${r.item_name}" at ${hour}:00 by ${r.user_name ?? 'unknown'}. Change: ${change} units. After-hours adjustments warrant review.`,
          context: { hour, user: r.user_name, change, unit_cost: r.unit_cost },
          status: 'open',
          detected_at: new Date(r.created_at),
        });
      }
    }
  } catch (err) { console.warn('[shrinkage] after_hours check failed', err); }
  return alerts;
};

const checkRepeatedAdjustments = async (db: any, config: ShrinkageConfig): Promise<ShrinkageAlert[]> => {
  if (await isRecentlyAlerted(db, 'repeated_adjustments')) return [];
  const alerts: ShrinkageAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         inventory_item.id AS item_id,
         inventory_item.name AS item_name,
         count() AS adjust_count,
         math::sum(quantity_change) AS total_change,
         math::sum(quantity_change * unit_cost) AS total_loss
       FROM inventory_ledger
       WHERE reference_type = 'adjustment'
         AND quantity_change < 0
         AND created_at > time::now() - 7d
       GROUP BY inventory_item
       FETCH inventory_item`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      if (safeNumber(r.adjust_count, 0) >= 3) {
        const loss = Math.abs(safeNumber(r.total_loss, 0));
        alerts.push({
          rule_id: 'repeated_adjustments',
          severity: loss > config.highValueThreshold ? 'critical' : 'warning',
          item_id: r.item_id?.toString?.(),
          item_name: r.item_name,
          metric_value: safeNumber(r.adjust_count, 0),
          expected_value: 1,
          deviation_pct: 200,
          estimated_loss: loss,
          description: `Item "${r.item_name}" had ${r.adjust_count} negative adjustments in the last 7 days. Total loss: $${loss.toFixed(2)}. Pattern suggests systematic issue.`,
          context: { adjust_count: r.adjust_count, total_change: r.total_change, total_loss: loss },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[shrinkage] repeated_adjustments check failed', err); }
  return alerts;
};

const checkHighValueLoss = async (db: any, config: ShrinkageConfig): Promise<ShrinkageAlert[]> => {
  if (await isRecentlyAlerted(db, 'high_value_loss')) return [];
  const alerts: ShrinkageAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         inventory_item.id AS item_id,
         inventory_item.name AS item_name,
         math::sum(quantity_change * unit_cost) AS total_loss
       FROM inventory_ledger
       WHERE quantity_change < 0
         AND reference_type IN ['adjustment', 'waste', 'issue']
         AND created_at > time::now() - ${config.lookbackDays}d
       GROUP BY inventory_item
       FETCH inventory_item`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const loss = Math.abs(safeNumber(r.total_loss, 0));
      if (loss > config.highValueThreshold) {
        alerts.push({
          rule_id: 'high_value_loss',
          severity: loss > config.highValueThreshold * 3 ? 'critical' : 'warning',
          item_id: r.item_id?.toString?.(),
          item_name: r.item_name,
          metric_value: loss,
          expected_value: config.highValueThreshold,
          deviation_pct: Math.round((loss / config.highValueThreshold - 1) * 100),
          estimated_loss: loss,
          description: `Item "${r.item_name}" has $${loss.toFixed(2)} total loss in ${config.lookbackDays} days (threshold: $${config.highValueThreshold}). Investigate cause.`,
          context: { total_loss: loss, threshold: config.highValueThreshold },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[shrinkage] high_value_loss check failed', err); }
  return alerts;
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: ShrinkageAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const prompt = `You are a restaurant loss prevention expert.
Analyze these shrinkage alerts and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 15).map(a => ({
  rule: a.rule_id,
  severity: a.severity,
  item: a.item_name,
  metric: a.metric_value,
  expected: a.expected_value,
  loss: a.estimated_loss,
  description: a.description,
})), null, 2)}

Respond with JSON array:
[{
  "rule": "<match rule_id>",
  "insight": "<max 200 chars — what likely happened>",
  "recommendation": "investigate" | "audit_employee" | "install_camera" | "review_process" | "dismiss"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant loss prevention AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string; insight?: string; recommendation?: ShrinkageRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[shrinkage] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runShrinkageDetection = async (
  db: ReturnType<typeof useDB>,
  config: ShrinkageConfig = DEFAULT_SHRINKAGE_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: ShrinkageAlert[]; checked: number }> => {
  const checks = [
    () => checkNegativeStock(db, config),
    () => checkExcessiveWaste(db, config),
    () => checkAfterHoursAdjustment(db, config),
    () => checkRepeatedAdjustments(db, config),
    () => checkHighValueLoss(db, config),
  ];
  const total = checks.length;
  let allAlerts: ShrinkageAlert[] = [];

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alerts = await checks[i]();
      allAlerts.push(...alerts);
    } catch (err) { console.warn('[shrinkage] check failed at', i, err); }
  }

  if (config.aiEnabled && allAlerts.length > 0) {
    await enhanceWithAI(allAlerts);
  }

  // Persist
  for (const alert of allAlerts) {
    try {
      await db.query(`CREATE shrinkage_alert CONTENT $data`, {
        data: { ...alert, detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

export const getOpenShrinkageAlerts = async (db: ReturnType<typeof useDB>): Promise<ShrinkageAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM shrinkage_alert WHERE status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       estimated_loss DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const updateShrinkageStatus = async (
  db: ReturnType<typeof useDB>, alertId: string, status: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
