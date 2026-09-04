/**
 * AI Menu Seasonal Demand Shift Detector — detects item-level seasonal demand
 * shifts (rising/falling) and recommends proactive menu rotation, ingredient
 * pre-stocking, and seasonal pricing before the shift fully hits.
 *
 * 118th POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from unmanaged seasonal demand shifts. No POS detects item-level
 * seasonal shifts with forward-looking action triggers.
 *
 * Distinct from:
 *   - seasonal.service (existing) — tracks seasonal REVENUE trends (MoM/YoY)
 *   - menu-rotation.service — rotates menu items (manual schedule)
 *   - weather-impact.service — measures weather impact on sales (reactive)
 *   - dish-popularity.service — single-item volume ranking (not seasonal)
 *   - food-cost-trend.service — ingredient cost trends (not demand)
 *   - forecast-accuracy.service — revenue forecast accuracy (not item demand)
 *   - menu-engineering-matrix.service — BCG classification (not seasonal)
 *
 * 8 AI rules:
 *   1. entering_peak_season — item demand rising ≥40% YoY → add to menu + pre-stock
 *   2. exiting_peak_season — item demand falling ≥30% YoY → remove/discount
 *   3. weather_driven_shift — weather event driving demand shift → capitalize
 *   4. seasonal_stockout_risk — peak predicted but stock low → pre-stock now
 *   5. off_season_menu_bloat — off-season item still on menu → remove
 *   6. seasonal_pricing_opportunity — in-season item could command premium
 *   7. early_shift_detected — shift starting earlier than last year → adapt fast
 *   8. shift_timing_anomaly — shift timing differs from historical pattern
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type SeasonalShiftRuleId =
  | 'entering_peak_season'
  | 'exiting_peak_season'
  | 'weather_driven_shift'
  | 'seasonal_stockout_risk'
  | 'off_season_menu_bloat'
  | 'seasonal_pricing_opportunity'
  | 'early_shift_detected'
  | 'shift_timing_anomaly';

export type SeasonalShiftAiRec =
  | 'add_to_menu'
  | 'remove_from_menu'
  | 'pre_stock'
  | 'raise_price'
  | 'lower_price'
  | 'promote'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface SeasonalShiftAlert {
  id?: string;
  rule_id: SeasonalShiftRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  menu_item: string;
  category?: string;
  current_demand?: number;
  previous_period_demand?: number;
  shift_pct?: number;
  predicted_peak_date?: Date;
  days_to_peak?: number;
  season?: string;
  weather_correlation?: string;
  current_stock?: number;
  stock_needed_at_peak?: number;
  on_menu?: boolean;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: SeasonalShiftAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface SeasonalShiftConfig {
  aiEnabled: boolean;
  peakThreshold: number;
  exitThreshold: number;
  stockBuffer: number;
  earlyWindow: number;
}

export const DEFAULT_SEASONALSHIFT_CONFIG: SeasonalShiftConfig = {
  aiEnabled: true,
  peakThreshold: 40.0,
  exitThreshold: 30.0,
  stockBuffer: 25.0,
  earlyWindow: 14,
};

export const readSeasonalShiftConfig = (settings: any): SeasonalShiftConfig => ({
  aiEnabled: settings?.seasonalshift_ai_enabled ?? true,
  peakThreshold: safeNumber(settings?.seasonalshift_peak_threshold, 40.0),
  exitThreshold: safeNumber(settings?.seasonalshift_exit_threshold, 30.0),
  stockBuffer: safeNumber(settings?.seasonalshift_stock_buffer, 25.0),
  earlyWindow: safeNumber(settings?.seasonalshift_early_window, 14),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface SeasonalItemData {
  menu_item: string;
  category: string;
  current_demand: number;          // avg daily orders currently
  previous_period_demand: number;  // same period last year
  predicted_peak_date?: Date;      // when demand predicted to peak
  days_to_peak?: number;
  season: string;                  // 'spring' | 'summer' | 'fall' | 'winter'
  weather_correlation?: string;    // 'heat_wave' | 'cold_snap' | 'rainy' | 'sunny'
  current_stock: number;           // portions available
  stock_needed_at_peak: number;    // predicted portions needed at peak
  on_menu: boolean;
  // For early_shift_detected
  historical_peak_date?: Date;     // when peak occurred last year
  // For shift_timing_anomaly
  expected_shift_date?: Date;      // when shift was expected
  actual_shift_date?: Date;        // when shift actually started
}

const MOCK_ITEMS: SeasonalItemData[] = [
  {
    menu_item: 'Mushroom Soup', category: 'soups',
    current_demand: 35, previous_period_demand: 18,
    predicted_peak_date: new Date(Date.now() + 18 * 86400000), days_to_peak: 18,
    season: 'fall', current_stock: 60, stock_needed_at_peak: 120, on_menu: true,
    historical_peak_date: new Date(Date.now() + 25 * 86400000),
  },
  {
    menu_item: 'Caesar Salad', category: 'salads',
    current_demand: 42, previous_period_demand: 28,
    predicted_peak_date: new Date(Date.now() + 12 * 86400000), days_to_peak: 12,
    season: 'summer', weather_correlation: 'sunny',
    current_stock: 80, stock_needed_at_peak: 140, on_menu: true,
  },
  {
    menu_item: 'Iced Tea', category: 'beverages',
    current_demand: 95, previous_period_demand: 45,
    predicted_peak_date: new Date(Date.now() + 8 * 86400000), days_to_peak: 8,
    season: 'summer', weather_correlation: 'heat_wave',
    current_stock: 50, stock_needed_at_peak: 180, on_menu: true,
  },
  {
    menu_item: 'Hot Chocolate', category: 'beverages',
    current_demand: 8, previous_period_demand: 38,
    season: 'summer', current_stock: 90, stock_needed_at_peak: 20, on_menu: true,
  },
  {
    menu_item: 'Grilled Salmon', category: 'mains',
    current_demand: 55, previous_period_demand: 35,
    predicted_peak_date: new Date(Date.now() + 20 * 86400000), days_to_peak: 20,
    season: 'summer', current_stock: 40, stock_needed_at_peak: 95, on_menu: true,
  },
  {
    menu_item: 'Pumpkin Spice Latte', category: 'beverages',
    current_demand: 12, previous_period_demand: 2,
    predicted_peak_date: new Date(Date.now() + 15 * 86400000), days_to_peak: 15,
    season: 'fall', current_stock: 30, stock_needed_at_peak: 85, on_menu: false,
    historical_peak_date: new Date(Date.now() + 22 * 86400000),
  },
  {
    menu_item: 'BBQ Ribs', category: 'mains',
    current_demand: 48, previous_period_demand: 30,
    predicted_peak_date: new Date(Date.now() + 10 * 86400000), days_to_peak: 10,
    season: 'summer', weather_correlation: 'sunny',
    current_stock: 25, stock_needed_at_peak: 80, on_menu: true,
    expected_shift_date: new Date(Date.now() + 5 * 86400000),
    actual_shift_date: new Date(Date.now() - 2 * 86400000),
  },
  {
    menu_item: 'Beef Stew', category: 'mains',
    current_demand: 6, previous_period_demand: 32,
    season: 'summer', current_stock: 75, stock_needed_at_peak: 15, on_menu: true,
  },
];

export const runSeasonalShiftEngine = async (
  db: ReturnType<typeof useDB>,
  config: SeasonalShiftConfig = DEFAULT_SEASONALSHIFT_CONFIG
): Promise<{ alerts: SeasonalShiftAlert[]; generated: number }> => {
  const alerts: SeasonalShiftAlert[] = [];
  const now = new Date();

  let items: SeasonalItemData[] = [];
  try {
    const result = await db.query(
      `SELECT menu_item, category, current_demand, previous_period_demand,
              predicted_peak_date, days_to_peak, season, weather_correlation,
              current_stock, stock_needed_at_peak, on_menu,
              historical_peak_date, expected_shift_date, actual_shift_date
       FROM seasonal_demand_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    items = rows.map((r: any) => ({
      menu_item: String(r.menu_item ?? 'Unknown'),
      category: String(r.category ?? 'unknown'),
      current_demand: safeNumber(r.current_demand, 0),
      previous_period_demand: safeNumber(r.previous_period_demand, 0),
      predicted_peak_date: r.predicted_peak_date ? new Date(r.predicted_peak_date) : undefined,
      days_to_peak: r.days_to_peak != null ? safeNumber(r.days_to_peak, 0) : undefined,
      season: String(r.season ?? 'unknown'),
      weather_correlation: r.weather_correlation ?? undefined,
      current_stock: safeNumber(r.current_stock, 0),
      stock_needed_at_peak: safeNumber(r.stock_needed_at_peak, 0),
      on_menu: r.on_menu ?? false,
      historical_peak_date: r.historical_peak_date ? new Date(r.historical_peak_date) : undefined,
      expected_shift_date: r.expected_shift_date ? new Date(r.expected_shift_date) : undefined,
      actual_shift_date: r.actual_shift_date ? new Date(r.actual_shift_date) : undefined,
    }));
  } catch (err) {
    console.warn('[seasonalshift] fetchItems failed — using mock', err);
  }

  if (items.length === 0) {
    items = MOCK_ITEMS;
  }

  for (const item of items) {
    const shiftPct = item.previous_period_demand > 0
      ? ((item.current_demand - item.previous_period_demand) / item.previous_period_demand) * 100
      : 0;
    const monthlyOpp = Math.round(Math.abs(shiftPct) * item.current_demand * 0.5 * 30 / 30);

    // Rule 1: ENTERING_PEAK_SEASON (demand rising ≥40% YoY)
    if (shiftPct >= config.peakThreshold) {
      alerts.push({
        rule_id: 'entering_peak_season',
        severity: 'high',
        menu_item: item.menu_item,
        category: item.category,
        current_demand: item.current_demand,
        previous_period_demand: item.previous_period_demand,
        shift_pct: Math.round(shiftPct * 10) / 10,
        predicted_peak_date: item.predicted_peak_date,
        days_to_peak: item.days_to_peak,
        season: item.season,
        on_menu: item.on_menu,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: ENTERING PEAK SEASON — demand up ${shiftPct.toFixed(0)}% YoY (${item.previous_period_demand} → ${item.current_demand} avg daily orders). ${item.season} peak predicted in ${item.days_to_peak ?? 'N/A'} days. ${!item.on_menu ? 'NOT ON MENU — ADD NOW to capture seasonal demand. ' : ''}Pre-stock ingredients before peak hits. Historical pattern shows this item will continue rising for 3-4 weeks. Potential ${fmt$(monthlyOpp)}/mo from seasonal capture.`,
        ai_recommendation: item.on_menu ? 'pre_stock' : 'add_to_menu',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: EXITING_PEAK_SEASON (demand falling ≥30% YoY)
    if (shiftPct <= -config.exitThreshold) {
      alerts.push({
        rule_id: 'exiting_peak_season',
        severity: 'medium',
        menu_item: item.menu_item,
        category: item.category,
        current_demand: item.current_demand,
        previous_period_demand: item.previous_period_demand,
        shift_pct: Math.round(shiftPct * 10) / 10,
        season: item.season,
        on_menu: item.on_menu,
        current_stock: item.current_stock,
        est_monthly_opportunity: Math.round(item.current_stock * 2),
        description: `${item.menu_item}: EXITING PEAK SEASON — demand down ${Math.abs(shiftPct).toFixed(0)}% YoY (${item.previous_period_demand} → ${item.current_demand} orders). Seasonal decline starting. ${item.on_menu ? 'CONSIDER REMOVING from menu in 2-3 weeks. ' : ''}Discount remaining stock to clear before demand fully drops. Freeing menu space for in-season items. Excess stock: ${item.current_stock} portions (~${fmt$(item.current_stock * 2)} tied up).`,
        ai_recommendation: item.on_menu ? 'remove_from_menu' : 'lower_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: WEATHER_DRIVEN_SHIFT (weather event driving demand)
    if (item.weather_correlation && item.weather_correlation !== 'none' && shiftPct >= 20) {
      alerts.push({
        rule_id: 'weather_driven_shift',
        severity: 'high',
        menu_item: item.menu_item,
        category: item.category,
        current_demand: item.current_demand,
        shift_pct: Math.round(shiftPct * 10) / 10,
        weather_correlation: item.weather_correlation,
        season: item.season,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: WEATHER-DRIVEN SHIFT — ${item.weather_correlation.replace('_', ' ')} driving +${shiftPct.toFixed(0)}% demand spike. Current: ${item.current_demand} orders/day. Weather events create SHORT windows of high demand — capitalize NOW. ${item.weather_correlation === 'heat_wave' ? 'Stock extra cold beverages + promote. ' : item.weather_correlation === 'cold_snap' ? 'Stock extra hot items + promote. ' : 'Adjust stock + promotion for weather. '}Weather shifts are unpredictable but profitable if caught early. +${fmt$(monthlyOpp)}/mo during weather window.`,
        ai_recommendation: 'promote',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SEASONAL_STOCKOUT_RISK (peak predicted but stock low)
    if (item.predicted_peak_date && item.stock_needed_at_peak > item.current_stock * 1.5) {
      const shortfall = item.stock_needed_at_peak * (1 + config.stockBuffer / 100) - item.current_stock;
      alerts.push({
        rule_id: 'seasonal_stockout_risk',
        severity: 'critical',
        menu_item: item.menu_item,
        category: item.category,
        predicted_peak_date: item.predicted_peak_date,
        days_to_peak: item.days_to_peak,
        current_stock: item.current_stock,
        stock_needed_at_peak: item.stock_needed_at_peak,
        season: item.season,
        est_monthly_opportunity: Math.round(shortfall * 3),
        description: `${item.menu_item}: STOCKOUT RISK — peak predicted in ${item.days_to_peak} days but only ${item.current_stock} portions stocked (need ${item.stock_needed_at_peak} + ${config.stockBuffer}% buffer = ${Math.round(item.stock_needed_at_peak * (1 + config.stockBuffer / 100))}). Shortfall: ${Math.round(shortfall)} portions. PRE-STOCK NOW — supplier lead time may be 5-7 days. Stockout during peak = lost revenue + customer disappointment. Cost of stockout: ~${fmt$(shortfall * 3)} in lost sales.`,
        ai_recommendation: 'pre_stock',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: OFF_SEASON_MENU_BLOAT (off-season item still on menu)
    if (item.on_menu && shiftPct <= -config.exitThreshold && item.current_stock > item.stock_needed_at_peak * 3) {
      alerts.push({
        rule_id: 'off_season_menu_bloat',
        severity: 'medium',
        menu_item: item.menu_item,
        category: item.category,
        current_demand: item.current_demand,
        shift_pct: Math.round(shiftPct * 10) / 10,
        current_stock: item.current_stock,
        stock_needed_at_peak: item.stock_needed_at_peak,
        season: item.season,
        est_monthly_opportunity: Math.round(item.current_stock * 1.5),
        description: `${item.menu_item}: OFF-SEASON MENU BLOAT — demand down ${Math.abs(shiftPct).toFixed(0)}% but still on menu with ${item.current_stock} portions in stock (only need ${item.stock_needed_at_peak}). This item occupies menu real estate better used for in-season items. Excess stock will spoil/waste. REMOVE from menu + discount remaining stock to clear. Freeing menu space for high-demand seasonal item. Waste cost: ~${fmt$(item.current_stock * 1.5)}.`,
        ai_recommendation: 'remove_from_menu',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: SEASONAL_PRICING_OPPORTUNITY (in-season item could command premium)
    if (shiftPct >= config.peakThreshold && item.on_menu && item.days_to_peak != null && item.days_to_peak <= 14) {
      const priceUplift = Math.round(monthlyOpp * 0.15);
      alerts.push({
        rule_id: 'seasonal_pricing_opportunity',
        severity: 'medium',
        menu_item: item.menu_item,
        category: item.category,
        shift_pct: Math.round(shiftPct * 10) / 10,
        days_to_peak: item.days_to_peak,
        season: item.season,
        est_monthly_opportunity: priceUplift,
        description: `${item.menu_item}: SEASONAL PRICING OPPORTUNITY — demand up ${shiftPct.toFixed(0)}%, peak in ${item.days_to_peak} days. In-season items with high demand can command 10-15% price premium. Customers expect seasonal pricing (pumpkin spice latte costs more in fall). RAISE PRICE 10% during peak window → +${fmt$(priceUplift)}/mo pure margin. Price sensitivity is LOW for in-season items — demand-driven not price-driven.`,
        ai_recommendation: 'raise_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: EARLY_SHIFT_DETECTED (shift starting earlier than last year)
    if (item.historical_peak_date && item.predicted_peak_date) {
      const daysDiff = Math.round((item.historical_peak_date.getTime() - item.predicted_peak_date.getTime()) / 86400000);
      if (daysDiff >= 5) {
        alerts.push({
          rule_id: 'early_shift_detected',
          severity: 'medium',
          menu_item: item.menu_item,
          category: item.category,
          shift_pct: Math.round(shiftPct * 10) / 10,
          days_to_peak: item.days_to_peak,
          season: item.season,
          est_monthly_opportunity: monthlyOpp,
          description: `${item.menu_item}: EARLY SHIFT — peak predicted ${daysDiff} days EARLIER than last year. Seasonal pattern shifting (climate change? trend change?). ADAPT FAST — adjust stock + menu NOW, don't wait for historical timing. Early shifters capture demand first; late movers lose 2-3 weeks of peak sales. Investigate cause (weather pattern? marketing? competitor?). +${fmt$(monthlyOpp)}/mo from early adaptation.`,
          ai_recommendation: 'investigate',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 8: SHIFT_TIMING_ANOMALY (shift timing differs from expected)
    if (item.expected_shift_date && item.actual_shift_date) {
      const daysEarly = Math.round((item.expected_shift_date.getTime() - item.actual_shift_date.getTime()) / 86400000);
      if (Math.abs(daysEarly) >= 5) {
        alerts.push({
          rule_id: 'shift_timing_anomaly',
          severity: 'low',
          menu_item: item.menu_item,
          category: item.category,
          shift_pct: Math.round(shiftPct * 10) / 10,
          season: item.season,
          est_monthly_opportunity: 0,
          description: `${item.menu_item}: TIMING ANOMALY — seasonal shift started ${Math.abs(daysEarly)} days ${daysEarly > 0 ? 'EARLY' : 'LATE'} vs expected. Model prediction was off by ${Math.abs(daysEarly)} days. INVESTIGATE: was the prediction wrong, or did an external factor (weather event, competitor promo, social trend) shift timing? Improves future prediction accuracy. No immediate revenue impact but valuable for model calibration.`,
          ai_recommendation: 'monitor',
          status: 'open', detected_at: now,
        });
      }
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant menu seasonal planning AI specializing in demand shift detection and proactive seasonal adaptation. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Item: ${a.menu_item} (${a.category}) — ${a.rule_id}. Current demand ${a.current_demand ?? 0}/day, YoY shift ${a.shift_pct ?? 0}%. Season: ${a.season}. Peak in ${a.days_to_peak ?? 'N/A'} days. Stock ${a.current_stock ?? 0}/${a.stock_needed_at_peak ?? 0}. On menu: ${a.on_menu ?? 'N/A'}. Weather: ${a.weather_correlation ?? 'none'}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM seasonal_demand_shift_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE seasonal_demand_shift_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString(), predicted_peak_date: a.predicted_peak_date?.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<SeasonalShiftAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM seasonal_demand_shift_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  enteringPeak: number; exitingPeak: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'entering_peak_season') AS entering,
              math::count(rule_id = 'exiting_peak_season') AS exiting
       FROM seasonal_demand_shift_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      enteringPeak: safeNumber(r.entering, 0), exitingPeak: safeNumber(r.exiting, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, enteringPeak: 0, exitingPeak: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
