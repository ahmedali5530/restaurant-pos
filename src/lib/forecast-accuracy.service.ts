/**
 * AI Forecast Accuracy Tracking service — measure prediction quality.
 *
 * Research finding: Toast Predict + Square Forecast bundle accuracy
 * measurement in their AI tiers. POSR offers it free — persists hourly
 * predictions then compares against actuals once the day passes, computing
 * standard metrics (MAPE/MAE/bias) + per-hour + per-day accuracy.
 *
 * Architecture:
 *   1. recordPredictions — called whenever a demand forecast is generated.
 *      Persists per-hour predictions to forecast_prediction table (locked
 *      in — never modified after creation so we can compare later).
 *   2. evaluatePendingPredictions — runs daily (or on-demand). Finds
 *      predictions whose target_date has passed, fetches actual orders
 *      from the order table for that hour, computes error.
 *   3. computeAccuracy — for a given forecast batch, aggregates errors into
 *      MAPE/MAE/bias/accuracy% metrics. Identifies best/worst hours/days.
 *   4. enhanceWithAI — OpenAI analyzes error patterns + suggests
 *      improvements (e.g. "Tuesday 14:00 consistently over-predicted by
 *      35% — likely a school schedule effect not in the model")
 *   5. getAccuracyTrend — shows MAPE over time (is AI getting better?)
 *
 * Metrics:
 *   - MAPE: Mean Absolute Percentage Error = avg(|actual - predicted| / actual) × 100
 *   - MAE: Mean Absolute Error = avg(|predicted - actual|) in orders
 *   - Bias: avg(predicted - actual) — positive = over-predicting
 *   - Accuracy: max(0, 100 - MAPE)
 *   - Coverage: % predictions with actual data (excludes closed hours)
 *
 * Benchmarks (restaurant industry):
 *   - MAPE < 15%: excellent (trust for staffing + purchasing)
 *   - MAPE 15-25%: good (usable with buffer)
 *   - MAPE 25-40%: fair (use cautiously, add safety margin)
 *   - MAPE > 40%: poor (review model, check data quality)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ForecastPrediction {
  id?: string;
  forecast_batch_id: string;
  target_date: Date;
  target_hour?: number;
  day_of_week?: number;
  predicted_orders: number;
  predicted_revenue: number;
  confidence: number;
  ai_enhanced: boolean;
  generated_at: Date;
  evaluated: boolean;
  actual_orders?: number;
  actual_revenue?: number;
  evaluated_at?: Date;
  error_orders?: number;
  error_pct?: number;
}

export interface ForecastAccuracy {
  id?: string;
  forecast_batch_id: string;
  period_start: Date;
  period_end: Date;
  total_predictions: number;
  evaluated_count: number;
  mape: number;
  mae: number;
  bias: number;
  accuracy_pct: number;
  coverage_pct: number;
  best_hour?: number;
  worst_hour?: number;
  best_day?: string;
  worst_day?: string;
  ai_enhanced: boolean;
  ai_insights?: string;
  ai_recommendations: string[];
  generated_at: Date;
  evaluated_at: Date;
}

export interface AccuracyConfig {
  autoEvaluate: boolean;
  lookbackDays: number;
  aiEnabled: boolean;
  minEvaluations: number;
}

export const DEFAULT_ACCURACY_CONFIG: AccuracyConfig = {
  autoEvaluate: true,
  lookbackDays: 30,
  aiEnabled: true,
  minEvaluations: 5,
};

export const readAccuracyConfig = (settings: any): AccuracyConfig => ({
  autoEvaluate: settings?.forecast_accuracy_auto_evaluate ?? true,
  lookbackDays: safeNumber(settings?.forecast_accuracy_lookback_days, 30),
  aiEnabled: settings?.forecast_accuracy_ai_enabled ?? true,
  minEvaluations: safeNumber(settings?.forecast_accuracy_min_evaluations, 5),
});

// ---------------------------------------------------------------------------
// Step 1: Record predictions — called when a demand forecast is generated
// ---------------------------------------------------------------------------

export interface PredictionInput {
  predicted_orders: number;
  predicted_revenue: number;
  confidence: number;
  target_date: Date;
  target_hour?: number;
  ai_enhanced: boolean;
}

export const recordPredictions = async (
  db: ReturnType<typeof useDB>,
  batchId: string,
  predictions: PredictionInput[]
): Promise<number> => {
  let recorded = 0;
  for (const pred of predictions) {
    try {
      const date = new Date(pred.target_date);
      date.setHours(0, 0, 0, 0);
      const dayOfWeek = date.getDay();
      await db.query(
        `CREATE forecast_prediction CONTENT $data`,
        {
          data: {
            forecast_batch_id: batchId,
            target_date: date.toISOString(),
            target_hour: pred.target_hour,
            day_of_week: dayOfWeek,
            predicted_orders: pred.predicted_orders,
            predicted_revenue: pred.predicted_revenue,
            confidence: pred.confidence,
            ai_enhanced: pred.ai_enhanced,
            generated_at: new Date().toISOString(),
            evaluated: false,
          },
        }
      );
      recorded++;
    } catch (err) {
      console.warn('[forecast-acc] record prediction failed', err);
    }
  }
  return recorded;
};

// ---------------------------------------------------------------------------
// Step 2: Evaluate pending predictions — compare with actuals
// ---------------------------------------------------------------------------

export interface EvaluateResult {
  evaluated: number;
  skipped: number;
  errors: number;
}

export const evaluatePendingPredictions = async (
  db: ReturnType<typeof useDB>
): Promise<EvaluateResult> => {
  // Find un-evaluated predictions whose target_date+hour has passed
  const now = new Date();
  let evaluated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const pendingResult = await db.query<ForecastPrediction[]>(
      `SELECT * FROM forecast_prediction
       WHERE evaluated = false
         AND (target_hour = NONE OR time::hour(target_date) + (target_hour * 1h) < time::now())
       ORDER BY target_date ASC
       LIMIT 500`
    );
    const pending = Array.isArray(pendingResult) ? pendingResult.flat() : [];

    if (pending.length === 0) {
      return { evaluated: 0, skipped: 0, errors: 0 };
    }

    // Group by target_date for batched actual fetching
    const byDate = new Map<string, ForecastPrediction[]>();
    for (const pred of pending) {
      const dateKey = new Date(pred.target_date as any).toISOString().split('T')[0];
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(pred);
    }

    for (const [dateStr, predictions] of byDate) {
      const targetDate = new Date(dateStr);
      const dateEnd = new Date(targetDate);
      dateEnd.setDate(dateEnd.getDate() + 1);

      // Fetch actuals for this date (Paid orders)
      try {
        const actualsResult = await db.query<any[]>(
          `SELECT
             time::hour(created_at) AS hour,
             count() AS order_count,
             math::sum(total) AS revenue
           FROM order
           WHERE created_at >= $start AND created_at < $end
             AND status = 'Paid'
             AND deleted_at IS NONE
           GROUP BY hour`,
          { start: targetDate.toISOString(), end: dateEnd.toISOString() }
        );
        const actualsByHour = new Map<number, { orders: number; revenue: number }>();
        const actualRows = Array.isArray(actualsResult) ? actualsResult.flat() : [];
        for (const a of actualRows) {
          actualsByHour.set(safeNumber(a.hour, 0), {
            orders: safeNumber(a.order_count, 0),
            revenue: safeNumber(a.revenue, 0),
          });
        }

        // Daily aggregate actual (sum of all hours)
        let dailyOrders = 0;
        let dailyRevenue = 0;
        for (const a of actualsByHour.values()) {
          dailyOrders += a.orders;
          dailyRevenue += a.revenue;
        }

        for (const pred of predictions) {
          let actualOrders: number;
          let actualRevenue: number;

          if (pred.target_hour !== null && pred.target_hour !== undefined) {
            const a = actualsByHour.get(pred.target_hour);
            if (!a) {
              // No actual data for this hour — skip (likely closed)
              skipped++;
              continue;
            }
            actualOrders = a.orders;
            actualRevenue = a.revenue;
          } else {
            // Daily prediction
            actualOrders = dailyOrders;
            actualRevenue = dailyRevenue;
            if (actualOrders === 0) {
              skipped++;
              continue;
            }
          }

          // Compute error
          const errorOrders = pred.predicted_orders - actualOrders;
          const errorPct = actualOrders > 0
            ? Math.abs(errorOrders) / actualOrders * 100
            : 100;

          try {
            await db.query(
              `UPDATE $id SET
                 evaluated = true,
                 actual_orders = $actualOrders,
                 actual_revenue = $actualRevenue,
                 evaluated_at = time::now(),
                 error_orders = $errorOrders,
                 error_pct = $errorPct`,
              {
                id: pred.id,
                actualOrders,
                actualRevenue,
                errorOrders,
                errorPct: Math.round(errorPct * 100) / 100,
              }
            );
            evaluated++;
          } catch (err) {
            console.warn('[forecast-acc] update prediction failed', err);
            errors++;
          }
        }
      } catch (err) {
        console.warn('[forecast-acc] fetch actuals failed for', dateStr, err);
        errors += predictions.length;
      }
    }
  } catch (err) {
    console.error('[forecast-acc] evaluatePendingPredictions failed', err);
  }

  return { evaluated, skipped, errors };
};

// ---------------------------------------------------------------------------
// Step 3: Compute accuracy for a forecast batch
// ---------------------------------------------------------------------------

const computeAccuracy = (
  predictions: ForecastPrediction[]
): Omit<ForecastAccuracy, 'id' | 'forecast_batch_id' | 'generated_at' | 'evaluated_at' | 'ai_insights' | 'ai_recommendations'> => {
  const evaluated = predictions.filter(p => p.evaluated && p.actual_orders !== undefined);
  const total = predictions.length;
  const evaluatedCount = evaluated.length;

  if (evaluatedCount === 0) {
    return {
      period_start: new Date(),
      period_end: new Date(),
      total_predictions: total,
      evaluated_count: 0,
      mape: 0,
      mae: 0,
      bias: 0,
      accuracy_pct: 0,
      coverage_pct: 0,
      ai_enhanced: false,
    };
  }

  // MAPE: avg(|actual - predicted| / actual × 100)
  const mape = evaluated.reduce((s, p) => s + (p.error_pct ?? 0), 0) / evaluatedCount;
  // MAE: avg(|predicted - actual|) in orders
  const mae = evaluated.reduce((s, p) => s + Math.abs(p.error_orders ?? 0), 0) / evaluatedCount;
  // Bias: avg(predicted - actual) — positive = over-predicting
  const bias = evaluated.reduce((s, p) => s + (p.error_orders ?? 0), 0) / evaluatedCount;
  // Accuracy: 100 - MAPE, capped at 0
  const accuracyPct = Math.max(0, 100 - mape);
  // Coverage
  const coveragePct = (evaluatedCount / total) * 100;

  // Find best/worst hour
  const byHour = new Map<number, { errors: number[] }>();
  for (const p of evaluated) {
    if (p.target_hour === undefined || p.target_hour === null) continue;
    const h = p.target_hour;
    if (!byHour.has(h)) byHour.set(h, { errors: [] });
    byHour.get(h)!.errors.push(p.error_pct ?? 0);
  }
  const hourStats = Array.from(byHour.entries()).map(([hour, data]) => ({
    hour,
    avgError: data.errors.reduce((s, e) => s + e, 0) / data.errors.length,
  }));
  hourStats.sort((a, b) => a.avgError - b.avgError);
  const bestHour = hourStats[0]?.hour;
  const worstHour = hourStats[hourStats.length - 1]?.hour;

  // Find best/worst day-of-week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = new Map<number, { errors: number[] }>();
  for (const p of evaluated) {
    if (p.day_of_week === undefined || p.day_of_week === null) continue;
    if (!byDay.has(p.day_of_week)) byDay.set(p.day_of_week, { errors: [] });
    byDay.get(p.day_of_week)!.errors.push(p.error_pct ?? 0);
  }
  const dayStats = Array.from(byDay.entries()).map(([dow, data]) => ({
    day: dayNames[dow],
    avgError: data.errors.reduce((s, e) => s + e, 0) / data.errors.length,
  }));
  dayStats.sort((a, b) => a.avgError - b.avgError);
  const bestDay = dayStats[0]?.day;
  const worstDay = dayStats[dayStats.length - 1]?.day;

  // Period
  const dates = evaluated.map(p => new Date(p.target_date as any).getTime());
  const periodStart = new Date(Math.min(...dates));
  const periodEnd = new Date(Math.max(...dates));

  // AI-enhanced flag (true if any prediction was AI-enhanced)
  const aiEnhanced = evaluated.some(p => p.ai_enhanced);

  return {
    period_start: periodStart,
    period_end: periodEnd,
    total_predictions: total,
    evaluated_count: evaluatedCount,
    mape: Math.round(mape * 100) / 100,
    mae: Math.round(mae * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    accuracy_pct: Math.round(accuracyPct * 100) / 100,
    coverage_pct: Math.round(coveragePct * 100) / 100,
    best_hour: bestHour,
    worst_hour: worstHour,
    best_day: bestDay,
    worst_day: worstDay,
    ai_enhanced: aiEnhanced,
  };
};

// ---------------------------------------------------------------------------
// Step 4: AI enhancement — analyze error patterns
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  accuracy: ForecastAccuracy,
  predictions: ForecastPrediction[]
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[forecast-acc] OpenAI not available — skipping AI insights');
    return;
  }

  // Top error predictions (worst 10)
  const worst = [...predictions]
    .filter(p => p.evaluated)
    .sort((a, b) => (b.error_pct ?? 0) - (a.error_pct ?? 0))
    .slice(0, 10);

  if (worst.length === 0) return;

  const prompt = `You are a forecasting accuracy analyst.
Analyze these prediction errors and explain what's happening.

Overall metrics:
  MAPE: ${accuracy.mape}% (lower = better)
  MAE: ${accuracy.mae} orders
  Bias: ${accuracy.bias} (positive = over-predicting)
  Accuracy: ${accuracy.accuracy_pct}%
  Coverage: ${accuracy.coverage_pct}%
  Best hour: ${accuracy.best_hour ?? 'n/a'}:00
  Worst hour: ${accuracy.worst_hour ?? 'n/a'}:00
  Best day: ${accuracy.best_day ?? 'n/a'}
  Worst day: ${accuracy.worst_day ?? 'n/a'}

Worst 10 predictions (JSON):
${JSON.stringify(worst.map(p => ({
  date: new Date(p.target_date as any).toLocaleDateString(),
  hour: p.target_hour,
  day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][p.day_of_week ?? 0],
  predicted: p.predicted_orders,
  actual: p.actual_orders,
  error_pct: p.error_pct,
  ai_enhanced: p.ai_enhanced,
})), null, 2)}

Respond with JSON:
{
  "insights": "<max 500 chars — what patterns you see + why errors likely occur>",
  "recommendations": ["<max 200 chars each — actionable steps to improve>"]
}

Focus on: systematic biases, recurring time patterns, data gaps, model limitations.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a forecasting accuracy analyst AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    accuracy.ai_insights = parsed.insights;
    accuracy.ai_recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
  } catch (err) {
    console.warn('[forecast-acc] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Step 5: Main entry — generate accuracy rollups for all unevaluated batches
// ---------------------------------------------------------------------------

export interface GenerateAccuracyResult {
  batchesProcessed: number;
  totalPredictions: number;
  totalEvaluated: number;
}

export const generateAccuracyRollups = async (
  db: ReturnType<typeof useDB>,
  config: AccuracyConfig = DEFAULT_ACCURACY_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<GenerateAccuracyResult> => {
  if (onProgress) onProgress(0, 3);

  // 1. First, evaluate any pending predictions (compare with actuals)
  const evalResult = await evaluatePendingPredictions(db);
  if (onProgress) onProgress(1, 3);

  // 2. Find all forecast batches that have evaluated predictions but no accuracy rollup yet
  const batchResult = await db.query<any[]>(
    `SELECT forecast_batch_id FROM forecast_prediction
     WHERE evaluated = true
     GROUP BY forecast_batch_id`
  );
  const batchRows = Array.isArray(batchResult) ? batchResult.flat() : [];
  const batchIds = batchRows.map(b => b.forecast_batch_id).filter(Boolean);
  if (onProgress) onProgress(2, 3);

  if (batchIds.length === 0) {
    if (onProgress) onProgress(3, 3);
    return { batchesProcessed: 0, totalPredictions: 0, totalEvaluated: 0 };
  }

  // 3. For each batch, compute accuracy + persist rollup
  let batchesProcessed = 0;
  let totalPredictions = 0;
  let totalEvaluated = 0;

  for (const batchId of batchIds) {
    try {
      // Check if rollup already exists
      const existing = await db.query<any[]>(
        `SELECT id FROM forecast_accuracy WHERE forecast_batch_id = $batchId LIMIT 1`,
        { batchId }
      );
      const existingRows = Array.isArray(existing) ? existing.flat() : [];
      if (existingRows.length > 0) continue;

      // Fetch predictions for this batch
      const predResult = await db.query<ForecastPrediction[]>(
        `SELECT * FROM forecast_prediction WHERE forecast_batch_id = $batchId`,
        { batchId }
      );
      const predictions = Array.isArray(predResult) ? predResult.flat() : [];
      if (predictions.length === 0) continue;

      // Skip if too few evaluated
      const evaluatedCount = predictions.filter(p => p.evaluated).length;
      if (evaluatedCount < config.minEvaluations) continue;

      // Compute accuracy
      const accuracyData = computeAccuracy(predictions);
      const accuracy: ForecastAccuracy = {
        ...accuracyData,
        forecast_batch_id: batchId,
        ai_recommendations: [],
        generated_at: new Date(),
        evaluated_at: new Date(),
      };

      // AI enhancement
      if (config.aiEnabled) {
        await enhanceWithAI(accuracy, predictions);
      }

      // Persist
      try {
        await db.query(
          `CREATE forecast_accuracy CONTENT $data`,
          {
            data: {
              ...accuracy,
              period_start: accuracy.period_start.toISOString(),
              period_end: accuracy.period_end.toISOString(),
              generated_at: accuracy.generated_at.toISOString(),
              evaluated_at: accuracy.evaluated_at.toISOString(),
            },
          }
        );
      } catch (err) {
        console.warn('[forecast-acc] persist accuracy failed', err);
      }

      batchesProcessed++;
      totalPredictions += predictions.length;
      totalEvaluated += evaluatedCount;
    } catch (err) {
      console.warn('[forecast-acc] process batch failed', batchId, err);
    }
  }
  if (onProgress) onProgress(3, 3);

  return { batchesProcessed, totalPredictions, totalEvaluated };
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getAccuracyHistory = async (
  db: ReturnType<typeof useDB>,
  limit = 20
): Promise<ForecastAccuracy[]> => {
  try {
    const result = await db.query<ForecastAccuracy[]>(
      `SELECT * FROM forecast_accuracy
       ORDER BY evaluated_at DESC
       LIMIT $limit`,
      { limit }
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[forecast-acc] getAccuracyHistory failed', err);
    return [];
  }
};

export const getLatestAccuracy = async (
  db: ReturnType<typeof useDB>
): Promise<ForecastAccuracy | null> => {
  const list = await getAccuracyHistory(db, 1);
  return list[0] ?? null;
};

export interface AccuracyTrend {
  date: Date;
  mape: number;
  accuracy_pct: number;
  bias: number;
}

export const getAccuracyTrend = async (
  db: ReturnType<typeof useDB>,
  days = 30
): Promise<AccuracyTrend[]> => {
  try {
    const result = await db.query<ForecastAccuracy[]>(
      `SELECT * FROM forecast_accuracy
       WHERE evaluated_at > time::now() - ${days}d
       ORDER BY evaluated_at ASC`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    return list.map(a => ({
      date: new Date(a.evaluated_at as any),
      mape: a.mape,
      accuracy_pct: a.accuracy_pct,
      bias: a.bias,
    }));
  } catch (err) {
    console.error('[forecast-acc] getAccuracyTrend failed', err);
    return [];
  }
};

export interface WorstPrediction {
  target_date: Date;
  target_hour?: number;
  day_of_week?: number;
  predicted_orders: number;
  actual_orders: number;
  error_pct: number;
  ai_enhanced: boolean;
}

export const getWorstPredictions = async (
  db: ReturnType<typeof useDB>,
  limit = 10
): Promise<WorstPrediction[]> => {
  try {
    const result = await db.query<any[]>(
      `SELECT * FROM forecast_prediction
       WHERE evaluated = true AND error_pct != NONE
       ORDER BY error_pct DESC
       LIMIT $limit`,
      { limit }
    );
    const list = Array.isArray(result) ? result.flat() : [];
    return list.map(p => ({
      target_date: new Date(p.target_date as any),
      target_hour: p.target_hour,
      day_of_week: p.day_of_week,
      predicted_orders: p.predicted_orders,
      actual_orders: p.actual_orders ?? 0,
      error_pct: p.error_pct ?? 0,
      ai_enhanced: p.ai_enhanced ?? false,
    }));
  } catch (err) {
    console.error('[forecast-acc] getWorstPredictions failed', err);
    return [];
  }
};
