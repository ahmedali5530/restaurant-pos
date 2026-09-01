/**
 * AI Recipe Yield Variance Detection service — production waste detection.
 *
 * 10th POSR-exclusive differentiator — Toast and Square have basic recipe
 * tracking but NO yield variance AI. Restaurants lose 4-10% of food cost to
 * yield variance (over-portioning, inconsistent prep, equipment issues, theft).
 *
 * Analyzes production batches vs theoretical yields to detect where money leaks.
 *
 * Detection rules (7):
 *   1. YIELD_VARIANCE          — actual yield_loss > 15% above recipe theoretical
 *   2. COST_VARIANCE           — actual input cost > 10% above theoretical (over-portioning)
 *   3. INCONSISTENT_BATCHES    — same recipe has > 20% variance across recent batches
 *   4. HIGH_WASTE_RECIPE       — recipe consistently loses > 20% yield (recipe issue)
 *   5. PORTION_DRIFT           — input quantities increasing over time (portion creep)
 *   6. OUTPUT_VALUE_MISMATCH   — sum of output values < input cost (margin erosion)
 *   7. STAFF_VARIANCE          — specific staff's batches have higher variance (training need)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type YieldSeverity = 'info' | 'warning' | 'critical';
export type YieldRecommendation =
  | 'recalibrate_recipe' | 'retrain_staff' | 'repair_equipment'
  | 'adjust_portion' | 'review_procurement' | 'investigate_theft' | 'dismiss';

export interface YieldVarianceAlert {
  id?: string;
  rule_id: string;
  severity: YieldSeverity;
  recipe_id?: string;
  recipe_name?: string;
  batch_id?: string;
  staff_id?: string;
  staff_name?: string;
  metric_value: number;
  expected_value: number;
  deviation_pct: number;
  estimated_loss: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: YieldRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
  branch_id?: string;
}

export interface YieldConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  varianceThreshold: number;
  costVariancePct: number;
  inconsistencyPct: number;
  highWasteThreshold: number;
  driftWindowDays: number;
}

export const DEFAULT_YIELD_CONFIG: YieldConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  varianceThreshold: 0.15,
  costVariancePct: 0.10,
  inconsistencyPct: 0.20,
  highWasteThreshold: 0.20,
  driftWindowDays: 30,
};

export const readYieldConfig = (settings: any): YieldConfig => ({
  aiEnabled: settings?.yield_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.yield_lookback_days, 30),
  varianceThreshold: safeNumber(settings?.yield_variance_threshold, 0.15),
  costVariancePct: safeNumber(settings?.yield_cost_variance_pct, 0.10),
  inconsistencyPct: safeNumber(settings?.yield_inconsistency_pct, 0.20),
  highWasteThreshold: safeNumber(settings?.yield_high_waste_threshold, 0.20),
  driftWindowDays: safeNumber(settings?.yield_drift_window_days, 30),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  recipeId: string,
  hours = 24
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM yield_variance_alert
       WHERE rule_id = $ruleId AND recipe_id = $rid
         AND detected_at > time::now() - ${hours}h
       LIMIT 1`,
      { ruleId, rid: recipeId }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const annualizeLoss = (lossPerBatch: number, batchesPerMonth: number): number =>
  lossPerBatch * batchesPerMonth * 12;

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

// 1. YIELD_VARIANCE — actual yield_loss > 15% above recipe theoretical
const checkYieldVariance = async (db: any, cfg: YieldConfig): Promise<YieldVarianceAlert[]> => {
  const alerts: YieldVarianceAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         id, recipe.id AS recipe_id, recipe.name AS recipe_name,
         yield_loss_percent, produced_qty, scale_factor,
         total_input_cost, total_output_cost, created_at, created_by
       FROM production_batch
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.lookbackDays}d
       FETCH recipe, created_by`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Get theoretical yield per recipe
    const recipeResult = await db.query(
      `SELECT id, name, base_batch_qty FROM recipe WHERE is_active = true`
    );
    const recipeRows = Array.isArray(recipeResult) ? recipeResult.flat() : [];
    // Get recipe_output theoretical yield_percent per recipe
    const outputResult = await db.query(
      `SELECT recipe, yield_percent FROM recipe_output WHERE is_primary = true FETCH recipe`
    );
    const outputRows = Array.isArray(outputResult) ? outputResult.flat() : [];
    const theoreticalMap = new Map<string, number>();
    for (const o of outputRows) {
      const rid = o.recipe?.id?.toString?.() ?? o.recipe?.toString?.();
      if (rid) theoreticalMap.set(rid, safeNumber(o.yield_percent, 100));
    }

    for (const b of rows) {
      const recipeId = b.recipe_id?.toString?.() ?? '';
      if (!recipeId) continue;
      const actualYieldLoss = safeNumber(b.yield_loss_percent, 0) / 100;
      const theoretical = theoreticalMap.get(recipeId) ?? 100;
      const theoreticalLoss = (100 - theoretical) / 100;
      if (actualYieldLoss > theoreticalLoss + cfg.varianceThreshold) {
        const deviation = actualYieldLoss - theoreticalLoss;
        const inputCost = safeNumber(b.total_input_cost, 0);
        const loss = inputCost * deviation;
        alerts.push({
          rule_id: 'yield_variance',
          severity: deviation > cfg.varianceThreshold * 2 ? 'critical' : 'warning',
          recipe_id: recipeId,
          recipe_name: b.recipe_name,
          batch_id: b.id,
          staff_id: b.created_by?.id?.toString?.(),
          staff_name: b.created_by?.name,
          metric_value: actualYieldLoss,
          expected_value: theoreticalLoss,
          deviation_pct: Math.round((deviation / Math.max(0.01, theoreticalLoss)) * 100),
          estimated_loss: loss,
          description: `Batch "${b.batch_number ?? b.id}" of recipe "${b.recipe_name}" lost ${(actualYieldLoss * 100).toFixed(1)}% yield — ${(deviation * 100).toFixed(1)}pp above theoretical (${(theoreticalLoss * 100).toFixed(1)}%). Cost lost: ${formatCurrency(loss)}.`,
          context: {
            batch_id: b.id, actual_yield_loss: actualYieldLoss,
            theoretical_loss: theoreticalLoss, deviation, input_cost: inputCost,
          },
          status: 'open',
          detected_at: new Date(b.completed_at ?? b.created_at),
        });
      }
    }
  } catch (err) { console.warn('[yield] yield_variance failed', err); }
  return alerts;
};

// 2. COST_VARIANCE — actual input cost > 10% above theoretical
const checkCostVariance = async (db: any, cfg: YieldConfig): Promise<YieldVarianceAlert[]> => {
  const alerts: YieldVarianceAlert[] = [];
  try {
    // For each batch, compare total_input_cost / produced_qty vs theoretical cost per unit
    const result = await db.query(
      `SELECT
         id, recipe.id AS recipe_id, recipe.name AS recipe_name,
         total_input_cost, produced_qty, scale_factor,
         recipe.base_batch_qty AS base_qty
       FROM production_batch
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.lookbackDays}d
       FETCH recipe`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Get recipe theoretical cost (sum of recipe_item quantities × item cost)
    const recipeItemResult = await db.query(
      `SELECT recipe, item.id AS item_id, item.name AS item_name,
              item.price AS item_price, quantity
       FROM recipe_item FETCH recipe, item`
    );
    const recipeItemRows = Array.isArray(recipeItemResult) ? recipeItemResult.flat() : [];
    const theoreticalCostMap = new Map<string, number>();
    for (const ri of recipeItemRows) {
      const rid = ri.recipe?.id?.toString?.() ?? ri.recipe?.toString?.();
      if (!rid) continue;
      const cost = safeNumber(ri.quantity, 0) * safeNumber(ri.item_price, 0);
      theoreticalCostMap.set(rid, (theoreticalCostMap.get(rid) ?? 0) + cost);
    }

    for (const b of rows) {
      const recipeId = b.recipe_id?.toString?.() ?? '';
      if (!recipeId) continue;
      const theoretical = theoreticalCostMap.get(recipeId);
      if (!theoretical || theoretical === 0) continue;
      // Theoretical for this batch = theoretical × scale_factor
      const theoreticalBatch = theoretical * safeNumber(b.scale_factor, 1);
      const actual = safeNumber(b.total_input_cost, 0);
      if (actual > theoreticalBatch * (1 + cfg.costVariancePct)) {
        if (await isRecentlyAlerted(db, 'cost_variance', recipeId, 24)) continue;
        const variance = actual - theoreticalBatch;
        alerts.push({
          rule_id: 'cost_variance',
          severity: variance > theoreticalBatch * 0.25 ? 'critical' : 'warning',
          recipe_id: recipeId,
          recipe_name: b.recipe_name,
          batch_id: b.id,
          metric_value: actual,
          expected_value: theoreticalBatch,
          deviation_pct: Math.round((variance / theoreticalBatch) * 100),
          estimated_loss: variance,
          description: `Batch "${b.id}" of "${b.recipe_name}" input cost ${formatCurrency(actual)} — ${Math.round((variance / theoreticalBatch) * 100)}% above theoretical ${formatCurrency(theoreticalBatch)}. Likely over-portioning.`,
          context: { actual_cost: actual, theoretical_cost: theoreticalBatch, variance, scale_factor: b.scale_factor },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[yield] cost_variance failed', err); }
  return alerts;
};

// 3. INCONSISTENT_BATCHES — same recipe has > 20% variance across recent batches
const checkInconsistentBatches = async (db: any, cfg: YieldConfig): Promise<YieldVarianceAlert[]> => {
  const alerts: YieldVarianceAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         recipe.id AS recipe_id, recipe.name AS recipe_name,
         count() AS batch_count,
         math::mean(yield_loss_percent) AS avg_loss,
         math::stddev(yield_loss_percent) AS stddev_loss,
         math::sum(total_input_cost) AS total_cost
       FROM production_batch
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY recipe
       FETCH recipe`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const recipeId = r.recipe_id?.toString?.() ?? '';
      if (!recipeId) continue;
      const batchCount = safeNumber(r.batch_count, 0);
      if (batchCount < 3) continue; // need 3+ batches for variance
      const stddev = safeNumber(r.stddev_loss, 0);
      const mean = safeNumber(r.avg_loss, 0);
      // Coefficient of variation = stddev / mean
      const cv = mean > 0 ? stddev / mean : 0;
      if (cv > cfg.inconsistencyPct) {
        if (await isRecentlyAlerted(db, 'inconsistent_batches', recipeId, 48)) continue;
        alerts.push({
          rule_id: 'inconsistent_batches',
          severity: cv > cfg.inconsistencyPct * 2 ? 'critical' : 'warning',
          recipe_id: recipeId,
          recipe_name: r.recipe_name,
          metric_value: cv,
          expected_value: cfg.inconsistencyPct,
          deviation_pct: Math.round((cv / cfg.inconsistencyPct - 1) * 100),
          estimated_loss: annualizeLoss(safeNumber(r.total_cost, 0) / batchCount * 0.05, batchCount / (cfg.lookbackDays / 30)),
          description: `Recipe "${r.recipe_name}" has ${(cv * 100).toFixed(0)}% coefficient of variation across ${batchCount} batches — prep is inconsistent. Standardize recipe execution.`,
          context: { batch_count: batchCount, avg_loss: mean, stddev_loss: stddev, cv },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[yield] inconsistent_batches failed', err); }
  return alerts;
};

// 4. HIGH_WASTE_RECIPE — recipe consistently loses > 20% yield
const checkHighWasteRecipe = async (db: any, cfg: YieldConfig): Promise<YieldVarianceAlert[]> => {
  const alerts: YieldVarianceAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         recipe.id AS recipe_id, recipe.name AS recipe_name,
         math::mean(yield_loss_percent) AS avg_loss,
         count() AS batch_count,
         math::sum(total_input_cost) AS total_cost
       FROM production_batch
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY recipe
       FETCH recipe`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const recipeId = r.recipe_id?.toString?.() ?? '';
      if (!recipeId) continue;
      if (safeNumber(r.batch_count, 0) < 3) continue;
      const avgLoss = safeNumber(r.avg_loss, 0) / 100;
      if (avgLoss > cfg.highWasteThreshold) {
        if (await isRecentlyAlerted(db, 'high_waste_recipe', recipeId, 72)) continue;
        const waste = safeNumber(r.total_cost, 0) * avgLoss;
        alerts.push({
          rule_id: 'high_waste_recipe',
          severity: avgLoss > cfg.highWasteThreshold * 1.5 ? 'critical' : 'warning',
          recipe_id: recipeId,
          recipe_name: r.recipe_name,
          metric_value: avgLoss,
          expected_value: cfg.highWasteThreshold,
          deviation_pct: Math.round((avgLoss / cfg.highWasteThreshold - 1) * 100),
          estimated_loss: annualizeLoss(waste / (cfg.lookbackDays / 30), 1),
          description: `Recipe "${r.recipe_name}" consistently loses ${(avgLoss * 100).toFixed(1)}% yield across ${r.batch_count} batches — recipe or technique issue. Recipe needs recalibration.`,
          context: { avg_loss: avgLoss, batch_count: r.batch_count, total_cost: r.total_cost, waste },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[yield] high_waste_recipe failed', err); }
  return alerts;
};

// 5. PORTION_DRIFT — input quantities increasing over time (portion creep)
const checkPortionDrift = async (db: any, cfg: YieldConfig): Promise<YieldVarianceAlert[]> => {
  const alerts: YieldVarianceAlert[] = [];
  try {
    // Compare avg total_input_cost per recipe in last 30d vs previous 30d
    const recentResult = await db.query(
      `SELECT recipe.id AS recipe_id, recipe.name AS recipe_name,
         math::mean(total_input_cost) AS avg_cost,
         count() AS batch_count
       FROM production_batch
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.driftWindowDays}d
       GROUP BY recipe FETCH recipe`
    );
    const recentRows = Array.isArray(recentResult) ? recentResult.flat() : [];

    const prevResult = await db.query(
      `SELECT recipe.id AS recipe_id,
         math::mean(total_input_cost) AS prev_cost
       FROM production_batch
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.driftWindowDays * 2}d
         AND completed_at < time::now() - ${cfg.driftWindowDays}d
       GROUP BY recipe`
    );
    const prevRows = Array.isArray(prevResult) ? prevResult.flat() : [];
    const prevMap = new Map(prevRows.map((r: any) => [r.recipe_id?.toString?.(), r]));

    for (const curr of recentRows) {
      const recipeId = curr.recipe_id?.toString?.() ?? '';
      if (!recipeId) continue;
      if (safeNumber(curr.batch_count, 0) < 2) continue;
      const prev = prevMap.get(recipeId);
      if (!prev) continue;
      const currCost = safeNumber(curr.avg_cost, 0);
      const prevCost = safeNumber(prev.prev_cost, 0);
      if (prevCost === 0) continue;
      const drift = (currCost - prevCost) / prevCost;
      if (drift > cfg.costVariancePct) {
        if (await isRecentlyAlerted(db, 'portion_drift', recipeId, 72)) continue;
        const waste = (currCost - prevCost) * safeNumber(curr.batch_count, 0);
        alerts.push({
          rule_id: 'portion_drift',
          severity: drift > cfg.costVariancePct * 2 ? 'critical' : 'warning',
          recipe_id: recipeId,
          recipe_name: curr.recipe_name,
          metric_value: currCost,
          expected_value: prevCost,
          deviation_pct: Math.round(drift * 100),
          estimated_loss: annualizeLoss(waste / (cfg.driftWindowDays / 30), 1),
          description: `Recipe "${curr.recipe_name}" input cost rose ${Math.round(drift * 100)}% over ${cfg.driftWindowDays} days (from ${formatCurrency(prevCost)} to ${formatCurrency(currCost)}). Portion creep — staff may be over-portioning.`,
          context: { current_cost: currCost, prev_cost: prevCost, drift_pct: drift, batch_count: curr.batch_count },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[yield] portion_drift failed', err); }
  return alerts;
};

// 6. OUTPUT_VALUE_MISMATCH — sum of output values < input cost (margin erosion)
const checkOutputValueMismatch = async (db: any, cfg: YieldConfig): Promise<YieldVarianceAlert[]> => {
  const alerts: YieldVarianceAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         id, recipe.id AS recipe_id, recipe.name AS recipe_name,
         total_input_cost, total_output_cost, produced_qty
       FROM production_batch
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.lookbackDays}d
         AND total_input_cost > 0
         AND total_output_cost > 0
       FETCH recipe`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const b of rows) {
      const recipeId = b.recipe_id?.toString?.() ?? '';
      if (!recipeId) continue;
      const inputCost = safeNumber(b.total_input_cost, 0);
      const outputValue = safeNumber(b.total_output_cost, 0);
      // If output value < input cost, margin is eroding
      if (outputValue < inputCost * 0.95) {
        if (await isRecentlyAlerted(db, 'output_value_mismatch', recipeId, 48)) continue;
        const loss = inputCost - outputValue;
        alerts.push({
          rule_id: 'output_value_mismatch',
          severity: loss > inputCost * 0.15 ? 'critical' : 'warning',
          recipe_id: recipeId,
          recipe_name: b.recipe_name,
          batch_id: b.id,
          metric_value: outputValue,
          expected_value: inputCost,
          deviation_pct: Math.round((loss / inputCost) * 100),
          estimated_loss: loss,
          description: `Batch "${b.id}" of "${b.recipe_name}" output value ${formatCurrency(outputValue)} is below input cost ${formatCurrency(inputCost)} — margin erosion of ${formatCurrency(loss)}. Recipe pricing or yield issue.`,
          context: { input_cost: inputCost, output_value: outputValue, loss, produced_qty: b.produced_qty },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[yield] output_value_mismatch failed', err); }
  return alerts;
};

// 7. STAFF_VARIANCE — specific staff's batches have higher variance (training need)
const checkStaffVariance = async (db: any, cfg: YieldConfig): Promise<YieldVarianceAlert[]> => {
  const alerts: YieldVarianceAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         created_by.id AS user_id, created_by.name AS user_name,
         count() AS batch_count,
         math::mean(yield_loss_percent) AS avg_loss,
         math::stddev(yield_loss_percent) AS stddev_loss
       FROM production_batch
       WHERE status = 'completed'
         AND completed_at > time::now() - ${cfg.lookbackDays}d
         AND created_by IS NOT NONE
       GROUP BY created_by
       FETCH created_by`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Get staff avg + overall avg
    const overallAvg = rows.length > 0
      ? rows.reduce((s, r) => s + safeNumber(r.avg_loss, 0), 0) / rows.length
      : 0;
    for (const r of rows) {
      const userId = r.user_id?.toString?.() ?? '';
      if (!userId) continue;
      if (safeNumber(r.batch_count, 0) < 3) continue; // need 3+ batches
      const staffAvg = safeNumber(r.avg_loss, 0);
      if (overallAvg > 0 && staffAvg > overallAvg * 1.5) {
        if (await isRecentlyAlerted(db, 'staff_variance', userId, 72)) continue;
        const deviation = staffAvg - overallAvg;
        alerts.push({
          rule_id: 'staff_variance',
          severity: deviation > overallAvg ? 'critical' : 'warning',
          staff_id: userId,
          staff_name: r.user_name,
          metric_value: staffAvg,
          expected_value: overallAvg,
          deviation_pct: Math.round((staffAvg / Math.max(1, overallAvg) - 1) * 100),
          estimated_loss: 0, // hard to quantify without recipe cost
          description: `Staff "${r.user_name}" avg yield loss ${(staffAvg).toFixed(1)}% is ${Math.round((staffAvg / Math.max(1, overallAvg) - 1) * 100)}% above team average (${overallAvg.toFixed(1)}%) across ${r.batch_count} batches — training opportunity.`,
          context: { staff_avg: staffAvg, team_avg: overallAvg, batch_count: r.batch_count, stddev: r.stddev_loss },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[yield] staff_variance failed', err); }
  return alerts;
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: YieldVarianceAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const prompt = `You are a restaurant kitchen operations expert.
Analyze these yield-variance alerts and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 12).map(a => ({
  rule: a.rule_id,
  severity: a.severity,
  recipe: a.recipe_name,
  staff: a.staff_name,
  metric: a.metric_value,
  expected: a.expected_value,
  loss: a.estimated_loss,
  description: a.description,
})), null, 2)}

Respond with JSON array:
[{
  "rule": "<match rule_id>",
  "insight": "<max 200 chars — root cause + cost impact>",
  "recommendation": "recalibrate_recipe" | "retrain_staff" | "repair_equipment" | "adjust_portion" | "review_procurement" | "investigate_theft" | "dismiss"
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
      rule: string; insight?: string; recommendation?: YieldRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[yield] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runYieldVarianceScan = async (
  db: ReturnType<typeof useDB>,
  config: YieldConfig = DEFAULT_YIELD_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: YieldVarianceAlert[]; checked: number }> => {
  const checks = [
    () => checkYieldVariance(db, config),
    () => checkCostVariance(db, config),
    () => checkInconsistentBatches(db, config),
    () => checkHighWasteRecipe(db, config),
    () => checkPortionDrift(db, config),
    () => checkOutputValueMismatch(db, config),
    () => checkStaffVariance(db, config),
  ];
  const total = checks.length;
  let allAlerts: YieldVarianceAlert[] = [];

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alerts = await checks[i]();
      allAlerts.push(...alerts);
    } catch (err) { console.warn('[yield] check failed at', i, err); }
  }

  if (config.aiEnabled && allAlerts.length > 0) {
    await enhanceWithAI(allAlerts);
  }

  // Persist
  for (const alert of allAlerts) {
    try {
      await db.query(`CREATE yield_variance_alert CONTENT $data`, {
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

export const getOpenYieldAlerts = async (
  db: ReturnType<typeof useDB>
): Promise<YieldVarianceAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM yield_variance_alert WHERE status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       estimated_loss DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getYieldSummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  total: number;
  critical: number;
  warning: number;
  totalLoss: number;
  flaggedRecipes: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(severity = 'warning') AS warning,
         math::sum(estimated_loss) AS total_loss,
         math::count(DISTINCT recipe_id) AS flagged_recipes
       FROM yield_variance_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      warning: safeNumber(row.warning, 0),
      totalLoss: safeNumber(row.total_loss, 0),
      flaggedRecipes: safeNumber(row.flagged_recipes, 0),
    };
  } catch {
    return { total: 0, critical: 0, warning: 0, totalLoss: 0, flaggedRecipes: 0 };
  }
};

export const updateYieldStatus = async (
  db: ReturnType<typeof useDB>, alertId: string, status: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
