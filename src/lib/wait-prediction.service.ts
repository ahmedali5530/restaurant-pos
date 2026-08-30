/**
 * AI Wait Time Prediction service — predictive waitlist quoting.
 *
 * 17th POSR-exclusive differentiator — OpenTable has basic waitlist but NO
 * predictive modeling. Toast Waitlist $50/mo has static quoting. Restaurants
 * quote inaccurate wait times 40% of the time, leading to walk-aways
 * (15-25% abandonment when quote exceeded by 5+ min).
 *
 * Distinct from no-show-prediction.service (which predicts reservation
 * attendance). This service predicts WAIT TIME for walk-in waitlist entries.
 *
 * Algorithm:
 *   1. Historical baseline: avg actual_wait by DOW × hour (last 90 days)
 *   2. Real-time load multiplier: current_occupancy / typical_occupancy
 *   3. Party size adjustment: +20% per seat above 2
 *   4. AI confidence score (0-1) based on data points + variance
 *   5. Continuous learning: compare predicted vs actual, refine baseline
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaitPrediction {
  id?: string;
  waitlist_entry?: string;
  customer_name: string;
  party_size: number;
  day_of_week: number;
  hour_of_day: number;
  current_occupancy: number;
  typical_occupancy: number;
  load_multiplier: number;
  historical_baseline_min: number;
  predicted_wait_min: number;
  confidence: number;
  est_walkaway_risk: number;
  ai_reasoning?: string;
  actual_wait_min?: number;
  prediction_error_min?: number;
  predicted_at: Date;
  branch_id?: string;
}

export interface WaitPredictionConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  partySizeAdjust: number;
  minConfidence: number;
  walkawayThresholdMin: number;
}

export const DEFAULT_WAITPRED_CONFIG: WaitPredictionConfig = {
  aiEnabled: true,
  lookbackDays: 90,
  partySizeAdjust: 0.20,
  minConfidence: 0.30,
  walkawayThresholdMin: 45,
};

export const readWaitPredConfig = (settings: any): WaitPredictionConfig => ({
  aiEnabled: settings?.waitpred_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.waitpred_lookback_days, 90),
  partySizeAdjust: safeNumber(settings?.waitpred_party_size_adjust, 0.20),
  minConfidence: safeNumber(settings?.waitpred_min_confidence, 0.30),
  walkawayThresholdMin: safeNumber(settings?.waitpred_walkaway_threshold_min, 45),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatMin = (min: number): string => min < 60 ? `${min.toFixed(0)} min` : `${Math.floor(min/60)}h ${Math.round(min%60)}m`;

// Compute walkaway risk based on predicted wait
// Risk = sigmoid function: low risk under 30min, high risk over 60min
const computeWalkawayRisk = (predictedWait: number, cfg: WaitPredictionConfig): number => {
  const threshold = cfg.walkawayThresholdMin;
  // Sigmoid: 1 / (1 + e^-(wait - threshold)/10)
  const exponent = -(predictedWait - threshold) / 10;
  return 1 / (1 + Math.exp(exponent));
};

// ---------------------------------------------------------------------------
// Historical baseline computation
// ---------------------------------------------------------------------------

interface DowHourBaseline {
  avgWait: number;
  medianWait: number;
  count: number;
  stdDev: number;
}

const computeBaselines = async (
  db: any,
  cfg: WaitPredictionConfig
): Promise<Map<string, DowHourBaseline>> => {
  const baselines = new Map<string, DowHourBaseline>();
  try {
    const result = await db.query(
      `SELECT
         actual_wait_minutes,
         added_at
       FROM waitlist_entry
       WHERE status IN ['seated', 'left']
         AND actual_wait_minutes IS NOT NONE
         AND added_at > time::now() - ${cfg.lookbackDays}d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return baselines;

    // Group by DOW × hour
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      const dt = new Date(r.added_at);
      const dow = dt.getDay();
      const hour = dt.getHours();
      const key = `${dow}_${hour}`;
      const wait = safeNumber(r.actual_wait_minutes, 0);
      if (wait <= 0) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(wait);
    }

    for (const [key, waits] of groups) {
      const avg = waits.reduce((a, b) => a + b, 0) / waits.length;
      const sorted = [...waits].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const variance = waits.reduce((s, w) => s + Math.pow(w - avg, 2), 0) / waits.length;
      const stdDev = Math.sqrt(variance);
      baselines.set(key, { avgWait: avg, medianWait: median, count: waits.length, stdDev });
    }
  } catch (err) {
    console.warn('[waitpred] computeBaselines failed', err);
  }
  return baselines;
};

// ---------------------------------------------------------------------------
// Current occupancy
// ---------------------------------------------------------------------------

const getCurrentOccupancy = async (db: any): Promise<number> => {
  try {
    // Count floor_tables currently occupied (status = 'occupied' or with active order)
    const result = await db.query(
      `SELECT count() AS occupied
       FROM reservation_table
       WHERE cleared_at IS NONE
         AND assigned_at > time::now() - 4h`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.occupied, 0);
  } catch {
    return 0;
  }
};

// ---------------------------------------------------------------------------
// Prediction computation
// ---------------------------------------------------------------------------

const computePrediction = (
  partySize: number,
  dow: number,
  hour: number,
  currentOccupancy: number,
  baseline: DowHourBaseline | undefined,
  cfg: WaitPredictionConfig
): { predicted: number; confidence: number; historicalBaseline: number; typicalOccupancy: number } => {
  const key = `${dow}_${hour}`;
  const baselineAvg = baseline?.avgWait ?? 20; // default 20 min if no data
  const baselineCount = baseline?.count ?? 0;
  const baselineStdDev = baseline?.stdDev ?? 15;

  // Typical occupancy = estimate from baseline count (avg entries per DOW+hour window)
  // Assume 4-hour window, so typical = count / 4
  const typicalOccupancy = Math.max(1, Math.round(baselineCount / 4));

  // Load multiplier: current vs typical
  const loadMultiplier = typicalOccupancy > 0
    ? Math.max(0.5, Math.min(2.5, currentOccupancy / typicalOccupancy))
    : 1.0;

  // Party size adjustment: +partySizeAdjust per seat above 2
  const partyMultiplier = partySize > 2
    ? 1 + cfg.partySizeAdjust * (partySize - 2)
    : 1.0;

  // Final prediction
  let predicted = baselineAvg * loadMultiplier * partyMultiplier;
  // Round to nearest 5 min (quotes look cleaner)
  predicted = Math.round(predicted / 5) * 5;
  predicted = Math.max(5, Math.min(120, predicted)); // clamp 5-120 min

  // Confidence: based on data points + variance
  // More data + lower CV = higher confidence
  const dataPointsFactor = Math.min(1, baselineCount / 20); // 20+ data points = full confidence
  const cv = baselineAvg > 0 ? baselineStdDev / baselineAvg : 1;
  const varianceFactor = Math.max(0, 1 - cv);
  let confidence = dataPointsFactor * 0.6 + varianceFactor * 0.4;
  // Reduce confidence if load is extreme (multiplier far from 1.0)
  const loadDeviation = Math.abs(loadMultiplier - 1.0);
  confidence *= Math.max(0.5, 1 - loadDeviation * 0.5);
  confidence = Math.max(0, Math.min(1, confidence));

  // If below min confidence, fall back to simple avg (lower confidence but still usable)
  if (confidence < cfg.minConfidence && baselineCount > 0) {
    predicted = Math.round(baselineAvg / 5) * 5;
    confidence = cfg.minConfidence;
  }

  return { predicted, confidence, historicalBaseline: baselineAvg, typicalOccupancy };
};

// ---------------------------------------------------------------------------
// AI reasoning
// ---------------------------------------------------------------------------

const generateReasoning = (
  _predicted: number,
  baselineAvg: number,
  loadMultiplier: number,
  partySize: number,
  dow: number,
  hour: number,
  confidence: number
): string => {
  const dowName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow];
  const parts: string[] = [];
  parts.push(`${dowName} ${hour}:00 baseline ${baselineAvg.toFixed(0)} min`);
  if (loadMultiplier > 1.2) parts.push(`busier than typical (${loadMultiplier.toFixed(1)}× load)`);
  else if (loadMultiplier < 0.8) parts.push(`quieter than typical (${loadMultiplier.toFixed(1)}× load)`);
  if (partySize > 2) parts.push(`party of ${partySize} adds ${(partySize - 2) * 20}%`);
  if (confidence < 0.5) parts.push(`low confidence (${(confidence * 100).toFixed(0)}%)`);
  return parts.join(' · ');
};

// ---------------------------------------------------------------------------
// AI enhancement (optional — OpenAI generates natural-language reasoning)
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  predictions: WaitPrediction[],
  cfg: WaitPredictionConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || predictions.length === 0) return;

  const high = predictions.filter(p => p.confidence >= cfg.minConfidence).slice(0, 10);
  if (high.length === 0) return;

  const prompt = `You are a restaurant host AI. For each waitlist prediction, provide a natural-language reasoning (max 200 chars) explaining the wait time to staff.

Predictions (JSON):
${JSON.stringify(high.map(p => ({
  customer: p.customer_name,
  party_size: p.party_size,
  dow: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][p.day_of_week],
  hour: p.hour_of_day,
  historical_baseline: p.historical_baseline_min,
  current_occupancy: p.current_occupancy,
  typical_occupancy: p.typical_occupancy,
  load_multiplier: p.load_multiplier,
  predicted_wait: p.predicted_wait_min,
  confidence: p.confidence,
})), null, 2)}

Respond with JSON array:
[{
  "customer": "<match customer_name>",
  "reasoning": "<max 200 chars>"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a waitlist prediction AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 1000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      customer: string; reasoning?: string;
    }>;
    for (const item of parsed) {
      const pred = predictions.find(p => p.customer_name === item.customer);
      if (pred && item.reasoning) {
        pred.ai_reasoning = item.reasoning.slice(0, 200);
      }
    }
  } catch (err) { console.warn('[waitpred] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry — predict for current waitlist entries
// ---------------------------------------------------------------------------

export const runWaitPrediction = async (
  db: ReturnType<typeof useDB>,
  config: WaitPredictionConfig = DEFAULT_WAITPRED_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ predictions: WaitPrediction[]; scanned: number }> => {
  if (onProgress) onProgress(0, 3);

  // 1. Compute historical baselines
  const baselines = await computeBaselines(db, config);
  if (onProgress) onProgress(1, 3);

  // 2. Get current occupancy
  const currentOccupancy = await getCurrentOccupancy(db);
  if (onProgress) onProgress(2, 3);

  // 3. Fetch current waitlist entries (status = 'waiting' or 'called')
  let entries: any[] = [];
  try {
    const result = await db.query(
      `SELECT id, customer_name, party_size, added_at, branch_id
       FROM waitlist_entry
       WHERE status IN ['waiting', 'called']
       ORDER BY added_at ASC
       LIMIT 50`
    );
    entries = Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.warn('[waitpred] fetchEntries failed', err);
    return { predictions: [], scanned: 0 };
  }

  // 4. Predict for each entry
  const now = new Date();
  const dow = now.getDay();
  const hour = now.getHours();
  const predictions: WaitPrediction[] = [];

  for (const entry of entries) {
    const partySize = safeNumber(entry.party_size, 2);
    const key = `${dow}_${hour}`;
    const baseline = baselines.get(key);
    const { predicted, confidence, historicalBaseline, typicalOccupancy } = computePrediction(
      partySize, dow, hour, currentOccupancy, baseline, config
    );
    const walkawayRisk = computeWalkawayRisk(predicted, config);

    predictions.push({
      waitlist_entry: entry.id,
      customer_name: entry.customer_name ?? 'Walk-in',
      party_size: partySize,
      day_of_week: dow,
      hour_of_day: hour,
      current_occupancy: currentOccupancy,
      typical_occupancy: typicalOccupancy,
      load_multiplier: typicalOccupancy > 0 ? currentOccupancy / typicalOccupancy : 1.0,
      historical_baseline_min: Math.round(historicalBaseline * 10) / 10,
      predicted_wait_min: predicted,
      confidence: Math.round(confidence * 100) / 100,
      est_walkaway_risk: Math.round(walkawayRisk * 100) / 100,
      ai_reasoning: generateReasoning(predicted, historicalBaseline, typicalOccupancy > 0 ? currentOccupancy / typicalOccupancy : 1.0, partySize, dow, hour, confidence),
      predicted_at: new Date(),
      branch_id: entry.branch_id?.toString?.(),
    });
  }

  // 5. AI enhancement
  if (config.aiEnabled && predictions.length > 0) {
    await enhanceWithAI(predictions, config);
  }

  // 6. Persist (refresh — delete old predictions for these entries)
  const entryIds = predictions.map(p => p.waitlist_entry).filter(Boolean);
  if (entryIds.length > 0) {
    try {
      await db.query(`DELETE FROM wait_prediction WHERE waitlist_entry IN $ids`, { ids: entryIds });
    } catch { /* non-fatal */ }
  }
  for (const pred of predictions) {
    try {
      await db.query(`CREATE wait_prediction CONTENT $data`, {
        data: { ...pred, predicted_at: pred.predicted_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(3, 3);
  return { predictions, scanned: entries.length };
};

// ---------------------------------------------------------------------------
// Accuracy tracking — when entry is seated, update actual wait + error
// ---------------------------------------------------------------------------

export const recordActualWait = async (
  db: ReturnType<typeof useDB>,
  waitlistEntryId: string,
  actualWaitMin: number
): Promise<void> => {
  try {
    // Update the prediction with actual wait + error
    await db.query(
      `UPDATE wait_prediction
       SET actual_wait_min = $actual,
           prediction_error_min = $actual - predicted_wait_min
       WHERE waitlist_entry = $wid`,
      { wid: waitlistEntryId, actual: actualWaitMin }
    );
  } catch (err) {
    console.warn('[waitpred] recordActualWait failed', err);
  }
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getActivePredictions = async (
  db: ReturnType<typeof useDB>
): Promise<WaitPrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM wait_prediction
       WHERE actual_wait_min IS NONE
         AND predicted_at > time::now() - 2h
       ORDER BY predicted_at ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface WaitPredSummary {
  totalActive: number;
  avgPredictedWait: number;
  highWalkawayRisk: number;
  avgConfidence: number;
  // Accuracy metrics (from completed entries)
  accuracyCount: number;
  avgErrorMin: number;
  mapePct: number; // mean absolute percentage error
  within5MinPct: number; // % predictions within ±5 min of actual
}

export const getWaitPredSummary = async (
  db: ReturnType<typeof useDB>
): Promise<WaitPredSummary> => {
  try {
    // Active predictions
    const activeResult = await db.query(
      `SELECT count() AS total,
         math::mean(predicted_wait_min) AS avg_wait,
         math::mean(est_walkaway_risk) AS avg_risk,
         math::count(est_walkaway_risk > 0.5) AS high_risk,
         math::mean(confidence) AS avg_conf
       FROM wait_prediction
       WHERE actual_wait_min IS NONE
         AND predicted_at > time::now() - 2h
       GROUP ALL`
    );
    const activeRows = Array.isArray(activeResult) ? activeResult.flat() : [];
    const a = activeRows[0] ?? {};

    // Accuracy (completed predictions with actual wait recorded)
    const accResult = await db.query(
      `SELECT count() AS total,
         math::mean(prediction_error_min) AS avg_error,
         math::mean(ABS(prediction_error_min) / actual_wait_min * 100) AS mape,
         math::count(ABS(prediction_error_min) <= 5) AS within5
       FROM wait_prediction
       WHERE actual_wait_min IS NOT NONE
       GROUP ALL`
    );
    const accRows = Array.isArray(accResult) ? accResult.flat() : [];
    const acc = accRows[0] ?? {};
    const accTotal = safeNumber(acc.total, 0);

    return {
      totalActive: safeNumber(a.total, 0),
      avgPredictedWait: safeNumber(a.avg_wait, 0),
      highWalkawayRisk: safeNumber(a.high_risk, 0),
      avgConfidence: safeNumber(a.avg_conf, 0),
      accuracyCount: accTotal,
      avgErrorMin: safeNumber(acc.avg_error, 0),
      mapePct: safeNumber(acc.mape, 0),
      within5MinPct: accTotal > 0 ? (safeNumber(acc.within5, 0) / accTotal) * 100 : 0,
    };
  } catch {
    return { totalActive: 0, avgPredictedWait: 0, highWalkawayRisk: 0, avgConfidence: 0, accuracyCount: 0, avgErrorMin: 0, mapePct: 0, within5MinPct: 0 };
  }
};
