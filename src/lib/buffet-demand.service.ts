/**
 * AI Buffet Demand Prediction service — predict guest count per session.
 *
 * 31st POSR-exclusive differentiator — buffet restaurants waste 15-25% of
 * food due to inaccurate guest forecasting. Toast, Square, Lightspeed have
 * NO buffet demand prediction. POSR predicts guest count from historical
 * patterns + DOW + seasonality + trend + AI.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export interface BuffetDemandPrediction {
  id?: string;
  session_id?: string;
  session_number?: string;
  session_type: string;
  business_date: Date;
  day_of_week: number;
  predicted_guests: number;
  expected_guests: number;
  historical_avg: number;
  trend_pct: number;
  confidence: number;
  recommended_qty: number;
  est_waste_prevention: number;
  est_stockout_risk: number;
  ai_insight?: string;
  actual_guests?: number;
  prediction_error?: number;
  predicted_at: Date;
  branch_id?: string;
}

export interface BuffetDemandConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  portionPerGuest: number;
  wasteCostPerKg: number;
}

export const DEFAULT_BUFFET_DEMAND_CONFIG: BuffetDemandConfig = {
  aiEnabled: true, lookbackDays: 90, portionPerGuest: 0.5, wasteCostPerKg: 8,
};

export const readBuffetDemandConfig = (settings: any): BuffetDemandConfig => ({
  aiEnabled: settings?.buffet_demand_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.buffet_demand_lookback_days, 90),
  portionPerGuest: safeNumber(settings?.buffet_demand_portion_per_guest, 0.5),
  wasteCostPerKg: safeNumber(settings?.buffet_demand_waste_cost_per_kg, 8),
});

// ---------------------------------------------------------------------------
// Historical baseline computation
// ---------------------------------------------------------------------------

interface DowTypeBaseline {
  avgGuests: number;
  count: number;
  stdDev: number;
  recentTrendPct: number;
}

const computeBaselines = async (db: any, cfg: BuffetDemandConfig): Promise<Map<string, DowTypeBaseline>> => {
  const baselines = new Map<string, DowTypeBaseline>();
  try {
    const result = await db.query(
      `SELECT actual_guests, session_type, business_date, expected_guests
       FROM buffet_session
       WHERE status = 'closed'
         AND actual_guests IS NOT NONE
         AND actual_guests > 0
         AND business_date > time::now() - ${cfg.lookbackDays}d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return baselines;

    // Group by DOW × session_type
    const groups = new Map<string, { guests: number[]; recentGuests: number[] }>();
    for (const r of rows) {
      const dt = new Date(r.business_date);
      const dow = dt.getDay();
      const stype = r.session_type ?? 'lunch';
      const key = `${dow}_${stype}`;
      if (!groups.has(key)) groups.set(key, { guests: [], recentGuests: [] });
      groups.get(key)!.guests.push(safeNumber(r.actual_guests, 0));
      // Recent = last 30 days
      const daysAgo = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo <= 30) groups.get(key)!.recentGuests.push(safeNumber(r.actual_guests, 0));
    }

    for (const [key, data] of groups) {
      const avg = data.guests.reduce((a, b) => a + b, 0) / data.guests.length;
      const variance = data.guests.reduce((s, g) => s + Math.pow(g - avg, 2), 0) / data.guests.length;
      const stdDev = Math.sqrt(variance);
      // Trend: recent avg vs overall avg
      const recentAvg = data.recentGuests.length > 0
        ? data.recentGuests.reduce((a, b) => a + b, 0) / data.recentGuests.length
        : avg;
      const trendPct = avg > 0 ? ((recentAvg - avg) / avg) * 100 : 0;
      baselines.set(key, { avgGuests: avg, count: data.guests.length, stdDev, recentTrendPct: trendPct });
    }
  } catch (err) { console.warn('[buffet-demand] computeBaselines failed', err); }
  return baselines;
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runBuffetDemandPrediction = async (
  db: ReturnType<typeof useDB>,
  config: BuffetDemandConfig = DEFAULT_BUFFET_DEMAND_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ predictions: BuffetDemandPrediction[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Compute baselines
  const baselines = await computeBaselines(db, config);
  if (onProgress) onProgress(1, 2);

  // 2. Fetch upcoming buffet sessions (next 7 days, not yet closed)
  let sessions: any[] = [];
  try {
    const result = await db.query(
      `SELECT id, session_number, session_type, business_date, expected_guests, scheduled_start
       FROM buffet_session
       WHERE status IN ['planned', 'in_progress']
         AND business_date > time::now()
         AND business_date < time::now() + 7d
       ORDER BY business_date ASC
       LIMIT 30`
    );
    sessions = Array.isArray(result) ? result.flat() : [];
  } catch (err) { console.warn('[buffet-demand] fetchSessions failed', err); return { predictions: [], scanned: 0 }; }

  // 3. Predict for each session
  const predictions: BuffetDemandPrediction[] = [];
  for (const session of sessions) {
    const dt = new Date(session.business_date);
    const dow = dt.getDay();
    const stype = session.session_type ?? 'lunch';
    const key = `${dow}_${stype}`;
    const baseline = baselines.get(key);

    const historicalAvg = baseline?.avgGuests ?? safeNumber(session.expected_guests, 50);
    const trendPct = baseline?.recentTrendPct ?? 0;
    const stdDev = baseline?.stdDev ?? 15;
    const dataCount = baseline?.count ?? 0;

    // Apply trend adjustment
    let predicted = historicalAvg * (1 + trendPct / 100);
    // Round to nearest 5
    predicted = Math.round(predicted / 5) * 5;
    predicted = Math.max(5, Math.min(500, predicted));

    // Confidence: based on data points + variance
    const dataFactor = Math.min(1, dataCount / 10);
    const cv = historicalAvg > 0 ? stdDev / historicalAvg : 1;
    const varianceFactor = Math.max(0, 1 - cv);
    let confidence = dataFactor * 0.6 + varianceFactor * 0.4;
    if (dataCount === 0) confidence = 0.2; // no data — low confidence
    confidence = Math.max(0, Math.min(1, confidence));

    // Recommended production qty = predicted_guests × portion_per_guest (kg)
    const recommendedQty = predicted * config.portionPerGuest;

    // Waste prevention: if manager expected 100 but AI predicts 70, we save 30 × portion × cost
    const expectedGuests = safeNumber(session.expected_guests, predicted);
    const wastePrevention = Math.max(0, (expectedGuests - predicted)) * config.portionPerGuest * config.wasteCostPerKg;

    // Stockout risk: if predicted > expected, risk of running out
    const stockoutRisk = predicted > expectedGuests
      ? Math.min(1, (predicted - expectedGuests) / Math.max(1, predicted))
      : 0;

    // AI insight
    let aiInsight: string | undefined;
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat && config.aiEnabled) {
      try {
        const dowName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow];
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a buffet demand prediction AI. Respond with a single insight (max 200 chars).' },
          { role: 'user', content: `Session: ${dowName} ${stype}, predicted ${predicted} guests (historical avg ${historicalAvg.toFixed(0)}, trend ${trendPct.toFixed(0)}%, manager expected ${expectedGuests}). Confidence ${(confidence*100).toFixed(0)}%.` },
        ], { temperature: 0.3, maxTokens: 100 });
        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        aiInsight = text.slice(0, 200);
      } catch { /* non-fatal */ }
    }

    predictions.push({
      session_id: session.id?.toString?.(),
      session_number: session.session_number?.toString?.(),
      session_type: stype,
      business_date: dt,
      day_of_week: dow,
      predicted_guests: predicted,
      expected_guests: expectedGuests,
      historical_avg: Math.round(historicalAvg * 10) / 10,
      trend_pct: Math.round(trendPct * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      recommended_qty: Math.round(recommendedQty * 10) / 10,
      est_waste_prevention: Math.round(wastePrevention * 100) / 100,
      est_stockout_risk: Math.round(stockoutRisk * 100) / 100,
      ai_insight: aiInsight,
      predicted_at: new Date(),
    });
  }

  // 4. Persist (refresh)
  try { await db.query(`DELETE FROM buffet_demand_prediction WHERE predicted_at < time::now() - 1h`); } catch { }
  for (const pred of predictions) {
    try {
      await db.query(`CREATE buffet_demand_prediction CONTENT $data`, {
        data: { ...pred, business_date: pred.business_date.toISOString(), predicted_at: pred.predicted_at.toISOString() },
      });
    } catch { }
  }

  if (onProgress) onProgress(2, 2);
  return { predictions, scanned: sessions.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getActivePredictions = async (db: ReturnType<typeof useDB>): Promise<BuffetDemandPrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM buffet_demand_prediction
       WHERE predicted_at > time::now() - 24h
         AND business_date > time::now()
       ORDER BY business_date ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  total: number; avgPredicted: number; totalWastePrevention: number; avgConfidence: number; stockoutRiskCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::mean(predicted_guests) AS avg_predicted,
         math::sum(est_waste_prevention) AS total_waste_prev,
         math::mean(confidence) AS avg_conf,
         math::count(est_stockout_risk > 0.2) AS stockout_count
       FROM buffet_demand_prediction
       WHERE predicted_at > time::now() - 24h AND business_date > time::now()
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0), avgPredicted: safeNumber(row.avg_predicted, 0),
      totalWastePrevention: safeNumber(row.total_waste_prev, 0),
      avgConfidence: safeNumber(row.avg_conf, 0), stockoutRiskCount: safeNumber(row.stockout_count, 0),
    };
  } catch { return { total: 0, avgPredicted: 0, totalWastePrevention: 0, avgConfidence: 0, stockoutRiskCount: 0 }; }
};
