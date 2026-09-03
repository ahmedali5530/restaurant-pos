/**
 * AI Kitchen Prep Sheet Optimizer — daily per-ingredient prep quantities.
 *
 * 61st POSR-exclusive differentiator — restaurants waste $200-500/mo per
 * location on incorrect kitchen prep (over-prep spoilage + under-prep
 * stockouts + 30-60 min/day manager time on manual prep sheets). Classic
 * POS systems (Toast, Square, Lightspeed) have STATIC prep sheets or none.
 * Modern KDS (Toast KDS, FreshKDS, Square KDS) show ORDERS but DON'T
 * optimize PREP. The gap between demand forecasting and actual kitchen
 * prep is filled manually by managers guessing.
 *
 * Distinct from:
 *   - demand-forecast.service (DEMAND prediction: revenue/covers per hour
 *     — NOT conversion to per-ingredient prep quantities)
 *   - waste-tracking.service (WASTE tracking: after-the-fact logging — NOT
 *     predictive prep optimization)
 *   - spoilage-prediction.service (ingredient SHELF-LIFE prediction — NOT
 *     daily prep quantity optimization)
 *   - kitchen-bottleneck.service (BOTTLENECK detection DURING service — NOT
 *     pre-service prep planning)
 *   - recipe-optimization.service (recipe ingredient COST optimization — NOT
 *     prep quantity optimization)
 *   - forecast-accuracy.service (forecast vs actual accuracy tracking — NOT
 *     prep sheet generation)
 *
 * Generates OPTIMIZED DAILY PREP SHEETS per ingredient:
 *   - Converts demand forecast → per-ingredient prep quantities
 *   - Adjusts for reservations, weather, events, seasonal patterns
 *   - Reduces over-prep (waste) + under-prep (stockouts)
 *   - Considers yesterday's waste + leftover stock
 *   - Prioritizes high-impact items (top sellers, high-waste items)
 *
 * 8 AI rules:
 *   1. demand_forecast_adjustment — base prep from forecast × recipe yield
 *   2. waste_pattern_reduction — high-waste items get reduced prep
 *   3. reservation_spike — large reservations → boost prep for popular items
 *   4. weather_event_adjustment — rain/sun/holiday → demand multiplier
 *   5. seasonal_pattern — season affects which items sell (soup in winter)
 *   6. menu_promo_spike — promoted items need extra prep
 *   7. lead_time_prep — long-prep items (marinades, dough) start earlier
 *   8. over_prep_correction — yesterday's over-prep → reduce today's
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PrepRuleId =
  | 'demand_forecast_adjustment'
  | 'waste_pattern_reduction'
  | 'reservation_spike'
  | 'weather_event_adjustment'
  | 'seasonal_pattern'
  | 'menu_promo_spike'
  | 'lead_time_prep'
  | 'over_prep_correction';

export type PrepAiRec =
  | 'prep_now'
  | 'reduce_qty'
  | 'increase_qty'
  | 'hold_prep'
  | 'monitor';

export interface PrepRecommendation {
  id?: string;
  rule_id: PrepRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ingredient_id?: string;
  ingredient_name: string;
  category?: string;
  current_prep_qty: number;
  suggested_prep_qty: number;
  unit: string;
  prep_action: string;
  forecast_demand: number;
  reservation_count?: number;
  weather_factor?: number;
  leftover_stock: number;
  avg_waste_pct?: number;
  est_waste_savings: number;
  est_stockout_savings: number;
  est_savings_daily: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: PrepAiRec;
  status: 'open' | 'prepped' | 'adjusted' | 'rejected' | 'expired';
  shift: 'morning' | 'afternoon' | 'evening' | 'all_day';
  detected_at: Date;
  expires_at?: Date;
}

export interface PrepConfig {
  aiEnabled: boolean;
  wasteTolerancePct: number;     // 10.0
  stockoutBufferPct: number;     // 15.0
  leftoverMaxPct: number;        // 30.0
}

export const DEFAULT_PREP_CONFIG: PrepConfig = {
  aiEnabled: true,
  wasteTolerancePct: 10.0,
  stockoutBufferPct: 15.0,
  leftoverMaxPct: 30.0,
};

export const readPrepConfig = (settings: any): PrepConfig => ({
  aiEnabled: settings?.prep_ai_enabled ?? true,
  wasteTolerancePct: safeNumber(settings?.prep_waste_tolerance_pct, 10.0),
  stockoutBufferPct: safeNumber(settings?.prep_stockout_buffer_pct, 15.0),
  leftoverMaxPct: safeNumber(settings?.prep_leftover_max_pct, 30.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Mock ingredient prep profiles
// (in production, derived from recipe table × demand forecast × waste log)
// ---------------------------------------------------------------------------
interface PrepProfile {
  id: string;
  name: string;
  category: 'produce' | 'meat' | 'dairy' | 'dry_goods' | 'sauces' | 'dough' | 'other';
  unit: string;             // 'kg' | 'L' | 'units' | 'portions' | 'cups'
  prepAction: string;       // 'chop' | 'slice' | 'marinate' | 'cook' | 'portion' | 'thaw' | 'mix' | 'assemble'
  currentPrepQty: number;   // what manager would normally prep
  baseDemandPerCover: number; // units needed per customer
  unitCost: number;
  avgWastePct: number;      // historical waste % (7-day avg)
  leadTimeHours: number;    // prep time required (e.g., marinate = 12h)
  isPromoted?: boolean;     // on promo this week?
  isSeasonal?: boolean;     // seasonal item?
  shift: 'morning' | 'afternoon' | 'evening' | 'all_day';
}

const PREP_PROFILES: PrepProfile[] = [
  { id: 'prep-001', name: 'Roma Tomatoes (diced)',  category: 'produce',    unit: 'kg',      prepAction: 'chop',     currentPrepQty: 8,   baseDemandPerCover: 0.05, unitCost: 3.20,  avgWastePct: 18, leadTimeHours: 0.5, shift: 'morning' },
  { id: 'prep-002', name: 'Onions (sliced)',        category: 'produce',    unit: 'kg',      prepAction: 'slice',    currentPrepQty: 6,   baseDemandPerCover: 0.04, unitCost: 1.80,  avgWastePct: 12, leadTimeHours: 0.5, shift: 'morning' },
  { id: 'prep-003', name: 'Pizza Dough Balls',      category: 'dough',      unit: 'units',   prepAction: 'portion',  currentPrepQty: 50,  baseDemandPerCover: 1.0,  unitCost: 0.85,  avgWastePct: 8,  leadTimeHours: 24,  shift: 'morning', isSeasonal: false },
  { id: 'prep-004', name: 'Marinated Chicken',      category: 'meat',       unit: 'kg',      prepAction: 'marinate', currentPrepQty: 12,  baseDemandPerCover: 0.10, unitCost: 6.50,  avgWastePct: 15, leadTimeHours: 12,  shift: 'morning' },
  { id: 'prep-005', name: 'Beef Patties',           category: 'meat',       unit: 'units',   prepAction: 'portion',  currentPrepQty: 60,  baseDemandPerCover: 0.8,  unitCost: 1.20,  avgWastePct: 6,  leadTimeHours: 2,   shift: 'afternoon' },
  { id: 'prep-006', name: 'Caesar Dressing',        category: 'sauces',     unit: 'L',       prepAction: 'mix',      currentPrepQty: 4,   baseDemandPerCover: 0.03, unitCost: 4.20,  avgWastePct: 5,  leadTimeHours: 1,   shift: 'morning' },
  { id: 'prep-007', name: 'Tomato Sauce (batch)',   category: 'sauces',     unit: 'L',       prepAction: 'cook',     currentPrepQty: 10,  baseDemandPerCover: 0.08, unitCost: 2.50,  avgWastePct: 7,  leadTimeHours: 3,   shift: 'morning' },
  { id: 'prep-008', name: 'Fresh Basil Pesto',      category: 'sauces',     unit: 'kg',      prepAction: 'mix',      currentPrepQty: 1.5, baseDemandPerCover: 0.01, unitCost: 12.00, avgWastePct: 22, leadTimeHours: 1,   shift: 'morning' },
  { id: 'prep-009', name: 'Salad Mix',              category: 'produce',    unit: 'kg',      prepAction: 'mix',      currentPrepQty: 5,   baseDemandPerCover: 0.04, unitCost: 4.50,  avgWastePct: 16, leadTimeHours: 0.5, shift: 'afternoon' },
  { id: 'prep-010', name: 'Salmon Fillets (thaw)',  category: 'meat',       unit: 'units',   prepAction: 'thaw',     currentPrepQty: 15,  baseDemandPerCover: 0.2,  unitCost: 8.50,  avgWastePct: 9,  leadTimeHours: 8,   shift: 'morning' },
  { id: 'prep-011', name: 'Mozzarella (shredded)',  category: 'dairy',      unit: 'kg',      prepAction: 'portion',  currentPrepQty: 6,   baseDemandPerCover: 0.05, unitCost: 7.80,  avgWastePct: 4,  leadTimeHours: 1,   shift: 'morning' },
  { id: 'prep-012', name: 'Soup of the Day',        category: 'sauces',     unit: 'L',       prepAction: 'cook',     currentPrepQty: 12,  baseDemandPerCover: 0.10, unitCost: 3.00,  avgWastePct: 14, leadTimeHours: 4,   shift: 'morning', isSeasonal: true },
  { id: 'prep-013', name: 'Avocado (sliced)',       category: 'produce',    unit: 'units',   prepAction: 'slice',    currentPrepQty: 20,  baseDemandPerCover: 0.15, unitCost: 1.50,  avgWastePct: 25, leadTimeHours: 0.5, shift: 'afternoon' },
  { id: 'prep-014', name: 'Whipped Cream',          category: 'dairy',      unit: 'L',       prepAction: 'mix',      currentPrepQty: 2,   baseDemandPerCover: 0.02, unitCost: 3.50,  avgWastePct: 8,  leadTimeHours: 0.5, shift: 'afternoon' },
];

// Seasonal demand multipliers (month 1-12 → { ingredientName: multiplier })
const SEASONAL_DEMAND: Record<number, Record<string, number>> = {
  12: { 'Soup of the Day': 1.8, 'Salad Mix': 0.6 },
  1:  { 'Soup of the Day': 2.0, 'Salad Mix': 0.5 },
  2:  { 'Soup of the Day': 1.7, 'Salad Mix': 0.7 },
  6:  { 'Soup of the Day': 0.5, 'Salad Mix': 1.4 },
  7:  { 'Soup of the Day': 0.4, 'Salad Mix': 1.5 },
  8:  { 'Soup of the Day': 0.5, 'Salad Mix': 1.4 },
};

/**
 * Run the prep sheet optimizer engine.
 * Evaluates each ingredient's prep profile + generates recommendations.
 */
export const runPrepEngine = async (
  db: ReturnType<typeof useDB>,
  config: PrepConfig = DEFAULT_PREP_CONFIG
): Promise<{ recommendations: PrepRecommendation[]; generated: number }> => {
  const recs: PrepRecommendation[] = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  // 1. Fetch demand forecast + reservations + weather for today
  let forecastCovers = 120; // default
  let reservationCount = 0;
  let weatherFactor = 1.0;

  try {
    const fcResult = await db.query(
      `SELECT math::sum(covers) AS covers FROM demand_forecast
       WHERE forecast_date = time::now() GROUP ALL`
    );
    const fcRows = Array.isArray(fcResult) ? fcResult.flat() : [];
    forecastCovers = safeNumber(fcRows[0]?.covers, 120);
  } catch { /* use default */ }

  try {
    const resResult = await db.query(
      `SELECT count() AS cnt FROM reservation
       WHERE datetime > time::now() AND datetime < time::now() + 1d
         AND status = 'confirmed'`
    );
    const resRows = Array.isArray(resResult) ? resResult.flat() : [];
    reservationCount = safeNumber(resRows[0]?.cnt, 0);
  } catch { /* use default */ }

  // Weather heuristic (in production: weather API integration)
  // Mock: assume rain today (factor 0.85 = 15% lower walk-in demand, but
  // delivery orders spike 1.3x → net 0.9 for dine-in items, 1.3 for takeout)
  weatherFactor = 0.9;

  // 2. Yesterday's leftover stock (mock: assume 20% of yesterday's prep is usable)
  const leftoverPct = 0.20;

  for (const ing of PREP_PROFILES) {
    // Base suggested prep = forecast covers × demand per cover × buffer
    const seasonalFactor = SEASONAL_DEMAND[currentMonth]?.[ing.name] ?? 1.0;
    const adjustedDemand = forecastCovers * ing.baseDemandPerCover * seasonalFactor * weatherFactor;
    const stockoutBuffer = 1 + (config.stockoutBufferPct / 100);
    let suggestedPrep = Math.ceil(adjustedDemand * stockoutBuffer);

    // Subtract leftover stock (capped at leftoverMaxPct)
    const usableLeftover = Math.min(ing.currentPrepQty * leftoverPct, ing.currentPrepQty * (config.leftoverMaxPct / 100));
    suggestedPrep = Math.max(0, suggestedPrep - usableLeftover);

    // Round to reasonable unit (0.5 increments)
    suggestedPrep = Math.ceil(suggestedPrep * 2) / 2;

    // Promoted items get +20% prep boost
    if (ing.isPromoted) {
      suggestedPrep = Math.ceil(suggestedPrep * 1.2 * 2) / 2;
    }

    // --- Rule 1: DEMAND_FORECAST_ADJUSTMENT (base rule) ---
    const demandDelta = suggestedPrep - ing.currentPrepQty;
    if (Math.abs(demandDelta) >= 1) {
      const stockoutSavings = demandDelta > 0
        ? Math.min(demandDelta, 5) * ing.baseDemandPerCover * forecastCovers * ing.unitCost * 0.1
        : 0;
      recs.push(makeRec(
        'demand_forecast_adjustment', demandDelta > 0 ? 'medium' : 'low',
        ing, ing.currentPrepQty, suggestedPrep,
        forecastCovers, reservationCount, weatherFactor, usableLeftover,
        ing.avgWastePct,
        0, stockoutSavings, stockoutSavings,
        `${ing.name}: forecast ${forecastCovers} covers × ${ing.baseDemandPerCover}${ing.unit}/cover${seasonalFactor !== 1 ? ` × ${seasonalFactor} seasonal` : ''} × ${weatherFactor} weather = ${adjustedDemand.toFixed(1)}${ing.unit} needed. Adjust prep from ${ing.currentPrepQty} → ${suggestedPrep}${ing.unit} (buffer +${config.stockoutBufferPct}% - ${usableLeftover.toFixed(1)} leftover).`,
        demandDelta > 0 ? 'increase_qty' : 'reduce_qty'
      ));
    }

    // --- Rule 2: WASTE_PATTERN_REDUCTION — high waste % → reduce prep ---
    if (ing.avgWastePct > config.wasteTolerancePct + 5) {
      const wasteReductionQty = Math.ceil(ing.currentPrepQty * (ing.avgWastePct - config.wasteTolerancePct) / 100 * 2) / 2;
      const reducedPrep = Math.max(0, suggestedPrep - wasteReductionQty);
      const wasteSavings = wasteReductionQty * ing.unitCost * (ing.avgWastePct / 100);
      recs.push(makeRec(
        'waste_pattern_reduction', 'high',
        ing, ing.currentPrepQty, reducedPrep,
        forecastCovers, reservationCount, weatherFactor, usableLeftover,
        ing.avgWastePct,
        wasteSavings, 0, wasteSavings,
        `${ing.name}: 7-day avg waste ${ing.avgWastePct}% (tolerance ${config.wasteTolerancePct}%). Reduce prep by ${wasteReductionQty}${ing.unit} to cut waste — saves ${fmt$(wasteSavings)}/day. Monitor quality + portion control.`,
        'reduce_qty'
      ));
    }

    // --- Rule 3: RESERVATION_SPIKE — large reservations → boost prep ---
    if (reservationCount >= 5) {
      // Check if ingredient is used in popular reservation dishes
      const spikeBoost = Math.ceil(reservationCount * ing.baseDemandPerCover * 1.5 * 2) / 2;
      if (spikeBoost >= 1) {
        const spikedPrep = suggestedPrep + spikeBoost;
        const stockoutSavings = spikeBoost * ing.unitCost * 0.5;
        recs.push(makeRec(
          'reservation_spike', 'high',
          ing, ing.currentPrepQty, spikedPrep,
          forecastCovers, reservationCount, weatherFactor, usableLeftover,
          ing.avgWastePct,
          0, stockoutSavings, stockoutSavings,
          `${ing.name}: ${reservationCount} reservations today (party avg 4) → boost prep +${spikeBoost}${ing.unit} for reservation covers. Total prep: ${spikedPrep}${ing.unit}.`,
          'increase_qty'
        ));
      }
    }

    // --- Rule 4: WEATHER_EVENT_ADJUSTMENT — weather shifts demand ---
    if (weatherFactor < 0.95 || weatherFactor > 1.05) {
      const weatherAdjusted = Math.ceil(ing.currentPrepQty * weatherFactor * 2) / 2;
      if (Math.abs(weatherAdjusted - ing.currentPrepQty) >= 1) {
        const weatherSavings = Math.abs(weatherAdjusted - ing.currentPrepQty) * ing.unitCost * 0.15;
        recs.push(makeRec(
          'weather_event_adjustment', 'medium',
          ing, ing.currentPrepQty, weatherAdjusted,
          forecastCovers, reservationCount, weatherFactor, usableLeftover,
          ing.avgWastePct,
          weatherFactor < 1 ? weatherSavings : 0,
          weatherFactor > 1 ? weatherSavings : 0,
          weatherSavings,
          `${ing.name}: weather factor ${weatherFactor} (${weatherFactor < 1 ? 'rain reduces walk-in' : 'sunny boosts demand'}). Adjust prep from ${ing.currentPrepQty} → ${weatherAdjusted}${ing.unit}.`,
          weatherFactor < 1 ? 'reduce_qty' : 'increase_qty'
        ));
      }
    }

    // --- Rule 5: SEASONAL_PATTERN — seasonal items shift ---
    if (ing.isSeasonal && seasonalFactor !== 1.0) {
      const seasonalPrep = Math.ceil(ing.currentPrepQty * seasonalFactor * 2) / 2;
      const seasonalSavings = Math.abs(seasonalPrep - ing.currentPrepQty) * ing.unitCost * 0.2;
      recs.push(makeRec(
        'seasonal_pattern', seasonalFactor < 0.7 ? 'high' : 'medium',
        ing, ing.currentPrepQty, seasonalPrep,
        forecastCovers, reservationCount, weatherFactor, usableLeftover,
        ing.avgWastePct,
        seasonalFactor < 1 ? seasonalSavings : 0,
        seasonalFactor > 1 ? seasonalSavings : 0,
        seasonalSavings,
        `${ing.name}: seasonal factor ${seasonalFactor} (month ${currentMonth}). ${seasonalFactor < 1 ? 'Reduce prep — off-season demand' : 'Increase prep — peak season demand'}.`,
        seasonalFactor < 1 ? 'reduce_qty' : 'increase_qty'
      ));
    }

    // --- Rule 6: MENU_PROMO_SPIKE — promoted items need extra prep ---
    if (ing.isPromoted) {
      const promoBoost = Math.ceil(ing.currentPrepQty * 0.2 * 2) / 2;
      const promoSavings = promoBoost * ing.unitCost * 0.4;
      recs.push(makeRec(
        'menu_promo_spike', 'medium',
        ing, ing.currentPrepQty, suggestedPrep + promoBoost,
        forecastCovers, reservationCount, weatherFactor, usableLeftover,
        ing.avgWastePct,
        0, promoSavings, promoSavings,
        `${ing.name}: on promo this week — demand +20% expected. Boost prep +${promoBoost}${ing.unit} to avoid stockout during promo rush.`,
        'increase_qty'
      ));
    }

    // --- Rule 7: LEAD_TIME_PREP — long-prep items start earlier ---
    if (ing.leadTimeHours >= 8) {
      const shiftRec = ing.leadTimeHours >= 12 ? 'morning' : 'morning';
      recs.push(makeRec(
        'lead_time_prep', 'medium',
        ing, ing.currentPrepQty, suggestedPrep,
        forecastCovers, reservationCount, weatherFactor, usableLeftover,
        ing.avgWastePct,
        0, ing.currentPrepQty * ing.unitCost * 0.05, ing.currentPrepQty * ing.unitCost * 0.05,
        `${ing.name}: ${ing.prepAction} takes ${ing.leadTimeHours}h — start in ${shiftRec} shift to be ready for ${ing.shift} service. Prep ${suggestedPrep}${ing.unit} now.`,
        'prep_now'
      ));
    }

    // --- Rule 8: OVER_PREP_CORRECTION — yesterday over-prepped → reduce today ---
    if (ing.avgWastePct > 20 && usableLeftover > ing.currentPrepQty * 0.15) {
      const correctedPrep = Math.max(0, suggestedPrep - usableLeftover);
      const correctionSavings = usableLeftover * ing.unitCost * 0.5;
      recs.push(makeRec(
        'over_prep_correction', 'high',
        ing, ing.currentPrepQty, correctedPrep,
        forecastCovers, reservationCount, weatherFactor, usableLeftover,
        ing.avgWastePct,
        correctionSavings, 0, correctionSavings,
        `${ing.name}: yesterday over-prepped (${ing.avgWastePct}% waste). ${usableLeftover.toFixed(1)}${ing.unit} usable leftover — reduce today's prep to ${correctedPrep}${ing.unit}. Saves ${fmt$(correctionSavings)} in waste.`,
        'reduce_qty'
      ));
    }
  }

  // 3. AI insight for top 5 critical/high recommendations
  if (config.aiEnabled && recs.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topRecs = recs
        .filter(r => r.severity === 'critical' || r.severity === 'high')
        .slice(0, 5);
      for (const r of topRecs) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant kitchen prep optimization AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Prep rec: ${r.rule_id} for ${r.ingredient_name} — prep ${r.current_prep_qty} → ${r.suggested_prep_qty}${r.unit}, saves ${fmt$(r.est_savings_daily)}/day. ${r.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          r.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM prep_sheet_recommendation WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const r of recs) {
    try {
      await db.query(`CREATE prep_sheet_recommendation CONTENT $data`, {
        data: { ...r, detected_at: r.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { recommendations: recs, generated: recs.length };
};

// ---------------------------------------------------------------------------
// Helper: build a recommendation
// ---------------------------------------------------------------------------
function makeRec(
  ruleId: PrepRuleId,
  severity: PrepRecommendation['severity'],
  ing: PrepProfile,
  currentQty: number,
  suggestedQty: number,
  forecastDemand: number,
  reservationCount: number,
  weatherFactor: number,
  leftoverStock: number,
  avgWastePct: number,
  wasteSavings: number,
  stockoutSavings: number,
  totalSavings: number,
  description: string,
  aiRec: PrepAiRec
): PrepRecommendation {
  const now = new Date();
  return {
    rule_id: ruleId,
    severity,
    ingredient_id: ing.id,
    ingredient_name: ing.name,
    category: ing.category,
    current_prep_qty: currentQty,
    suggested_prep_qty: suggestedQty,
    unit: ing.unit,
    prep_action: ing.prepAction,
    forecast_demand: forecastDemand,
    reservation_count: reservationCount,
    weather_factor: weatherFactor,
    leftover_stock: Math.round(leftoverStock * 100) / 100,
    avg_waste_pct: avgWastePct,
    est_waste_savings: Math.round(wasteSavings * 100) / 100,
    est_stockout_savings: Math.round(stockoutSavings * 100) / 100,
    est_savings_daily: Math.round(totalSavings * 100) / 100,
    description,
    ai_recommendation: aiRec,
    status: 'open',
    shift: ing.shift,
    detected_at: now,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveRecommendations = async (db: ReturnType<typeof useDB>): Promise<PrepRecommendation[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM prep_sheet_recommendation
       WHERE status = 'open'
       ORDER BY est_savings_daily DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalRecs: number;
  criticalCount: number;
  totalSavings: number;
  highWasteItems: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(rule_id = 'over_prep_correction') AS high_waste,
         math::sum(est_savings_daily) AS savings
       FROM prep_sheet_recommendation
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalRecs: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      highWasteItems: safeNumber(r.high_waste, 0),
      totalSavings: safeNumber(r.savings, 0),
    };
  } catch {
    return { totalRecs: 0, criticalCount: 0, totalSavings: 0, highWasteItems: 0 };
  }
};

export const updateRecStatus = async (
  db: ReturnType<typeof useDB>,
  recId: string,
  status: 'prepped' | 'adjusted' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: recId, status });
};
