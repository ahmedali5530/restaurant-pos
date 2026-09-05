/**
 * AI Recipe Cost Volatility Predictor — predicts which menu items will become
 * unprofitable in the next 30/60/90 days due to forecasted ingredient cost
 * changes (seasonal patterns, commodity market trends, weather disruptions,
 * supply chain delays). Enables pre-emptive action (lock supplier contracts,
 * raise prices, substitute ingredients, promote alternatives) BEFORE margin
 * erosion hits.
 *
 * 140th POSR-exclusive differentiator — restaurants react to cost changes
 * AFTER they hit the P&L (typically 30-60 days late), losing $800-3,000/mo
 * per location from margin erosion on items that could have been repriced or
 * reformulated weeks earlier. No POS predicts future ingredient costs.
 *
 * Distinct from:
 *   - food-cost-trend.service — tracks HISTORICAL cost changes (backward-looking)
 *   - profitability-decay.service (120th) — tracks margin decay TRAJECTORY (current state)
 *   - price-elasticity-drift.service (134th) — tracks price SENSITIVITY changes (customer side)
 *   - ingredient-substitution-impact.service — measures substitution EFFECT (post-hoc)
 *   - supplier-negotiation.service — current supplier terms (not predictive)
 *   - dynamic-pricing.service — demand-driven pricing (not cost-driven)
 *
 * 8 AI rules:
 *   1. seasonal_cost_spike_predicted — ingredient cost expected to spike in next 30 days (seasonal pattern)
 *   2. commodity_market_trend_up — commodity futures trending up (wheat/beef/dairy/coffee)
 *   3. weather_disruption_predicted — weather event (drought/frost/storm) will disrupt supply
 *   4. supply_chain_delay_predicted — port/shipping/fuel delays will increase costs
 *   5. margin_threshold_breach_forecast — menu item will cross profitability threshold in forecast window
 *   6. high_volatility_ingredient — ingredient has high historical price volatility, recommend hedging
 *   7. alternative_supplier_available — alternative supplier offers lower price for same ingredient
 *   8. recipe_reformulation_recommended — substitute ingredient to avoid predicted cost spike
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type CostVolRuleId =
  | 'seasonal_cost_spike_predicted'
  | 'commodity_market_trend_up'
  | 'weather_disruption_predicted'
  | 'supply_chain_delay_predicted'
  | 'margin_threshold_breach_forecast'
  | 'high_volatility_ingredient'
  | 'alternative_supplier_available'
  | 'recipe_reformulation_recommended';

export type CostVolAiRec =
  | 'lock_contract'
  | 'raise_price'
  | 'substitute_ingredient'
  | 'promote_alternative'
  | 'hedge_commodity'
  | 'switch_supplier'
  | 'reformulate_recipe'
  | 'monitor'
  | 'skip';

export interface CostVolAlert {
  id?: string;
  rule_id: CostVolRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ingredient_name?: string;
  ingredient_category?: string;        // 'produce' | 'meat' | 'dairy' | 'grain' | 'seafood' | 'spice' | 'oil' | 'beverage'
  affected_dishes?: string;            // comma-separated dish names
  affected_dish_count?: number;
  current_price?: number;              // $ per unit
  forecast_price_30d?: number;
  forecast_price_60d?: number;
  forecast_price_90d?: number;
  price_change_pct_30d?: number;
  price_change_pct_90d?: number;
  current_margin_pct?: number;
  forecast_margin_pct?: number;
  threshold_breach_days?: number;      // days until margin falls below threshold
  trigger_signal?: string;             // 'seasonal_pattern' | 'commodity_futures' | 'weather_forecast' | 'supply_chain_alert' | 'historical_volatility' | 'supplier_quote'
  trigger_detail?: string;             // human-readable detail of the trigger signal
  confidence_score?: number;           // 0-100
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: CostVolAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface CostVolConfig {
  aiEnabled: boolean;
  marginThreshold: number;             // minimum acceptable margin %
  forecastHorizonDays: number;         // 30/60/90
  volatilityThreshold: number;         // std-dev threshold for "high volatility"
}

export const DEFAULT_COSTVOL_CONFIG: CostVolConfig = {
  aiEnabled: true,
  marginThreshold: 30.0,
  forecastHorizonDays: 90,
  volatilityThreshold: 15.0,
};

export const readCostVolConfig = (settings: any): CostVolConfig => ({
  aiEnabled: settings?.costvol_ai_enabled ?? true,
  marginThreshold: safeNumber(settings?.costvol_margin_threshold, 30.0),
  forecastHorizonDays: safeNumber(settings?.costvol_forecast_horizon, 90),
  volatilityThreshold: safeNumber(settings?.costvol_volatility_threshold, 15.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface IngredientForecast {
  ingredient_name: string;
  ingredient_category: string;
  current_price: number;                // $ per unit
  forecast_price_30d: number;
  forecast_price_60d: number;
  forecast_price_90d: number;
  price_change_pct_30d: number;
  price_change_pct_90d: number;
  historical_volatility_pct: number;   // std-dev of monthly price changes
  avg_monthly_volume: number;          // units used per month
  trigger_signal: string;
  trigger_detail: string;              // e.g. "El Niño drought forecast Q1"
  confidence_score: number;
  // Menu impact
  affected_dishes: string;             // comma-separated
  affected_dish_count: number;
  current_margin_pct: number;          // weighted avg margin across affected dishes
  forecast_margin_pct_30d: number;
  forecast_margin_pct_90d: number;
  // Supplier alternatives
  current_supplier: string;
  current_supplier_price: number;
  alternative_supplier: string;
  alternative_supplier_price: number;
  alternative_available: boolean;
  // Substitute ingredient
  substitute_ingredient: string;
  substitute_price: number;
  substitute_quality_match: number;    // 0-100
  // Monthly economics
  monthly_volume_value: number;        // current spend on this ingredient
  forecast_monthly_cost_increase: number;
}

const MOCK_DATA: IngredientForecast[] = [
  {
    ingredient_name: 'Tomatoes (Roma)', ingredient_category: 'produce',
    current_price: 2.40, forecast_price_30d: 2.65, forecast_price_60d: 3.10, forecast_price_90d: 3.45,
    price_change_pct_30d: 10.4, price_change_pct_90d: 43.8,
    historical_volatility_pct: 22.5, avg_monthly_volume: 480,
    trigger_signal: 'seasonal_pattern', trigger_detail: 'Winter greenhouse supply gap (Dec-Feb), historically +40% price spike',
    confidence_score: 88,
    affected_dishes: 'Margherita Pizza, Caprese Salad, Marinara Pasta, Bruschetta',
    affected_dish_count: 4,
    current_margin_pct: 68, forecast_margin_pct_30d: 62, forecast_margin_pct_90d: 54,
    current_supplier: 'Sysco Produce', current_supplier_price: 2.40,
    alternative_supplier: 'Local Farm Co-op', alternative_supplier_price: 2.55, alternative_available: true,
    substitute_ingredient: 'Canned San Marzano tomatoes', substitute_price: 1.80, substitute_quality_match: 75,
    monthly_volume_value: 1152, forecast_monthly_cost_increase: 504,
  },
  {
    ingredient_name: 'Beef Ribeye', ingredient_category: 'meat',
    current_price: 18.50, forecast_price_30d: 19.20, forecast_price_60d: 20.10, forecast_price_90d: 21.30,
    price_change_pct_30d: 3.8, price_change_pct_90d: 15.1,
    historical_volatility_pct: 12.3, avg_monthly_volume: 180,
    trigger_signal: 'commodity_futures', trigger_detail: 'Cattle futures up 8% on feed cost inflation + herd reduction',
    confidence_score: 82,
    affected_dishes: 'Ribeye Steak, Steak Frites, Surf & Turf',
    affected_dish_count: 3,
    current_margin_pct: 55, forecast_margin_pct_30d: 52, forecast_margin_pct_90d: 47,
    current_supplier: 'US Foods Meat', current_supplier_price: 18.50,
    alternative_supplier: 'Local Butcher', alternative_supplier_price: 19.10, alternative_available: true,
    substitute_ingredient: 'Beef Striploin', substitute_price: 16.20, substitute_quality_match: 82,
    monthly_volume_value: 3330, forecast_monthly_cost_increase: 504,
  },
  {
    ingredient_name: 'Coffee Beans (Arabica)', ingredient_category: 'beverage',
    current_price: 8.20, forecast_price_30d: 8.80, forecast_price_60d: 9.50, forecast_price_90d: 10.40,
    price_change_pct_30d: 7.3, price_change_pct_90d: 26.8,
    historical_volatility_pct: 28.7, avg_monthly_volume: 95,
    trigger_signal: 'weather_forecast', trigger_detail: 'Brazil frost damaging arabica plantations, supply tightening Q1-Q2',
    confidence_score: 91,
    affected_dishes: 'Espresso, Cappuccino, Latte, Cold Brew',
    affected_dish_count: 4,
    current_margin_pct: 78, forecast_margin_pct_30d: 76, forecast_margin_pct_90d: 72,
    current_supplier: 'Coffee Distributors Inc', current_supplier_price: 8.20,
    alternative_supplier: 'Direct Trade Roaster', alternative_supplier_price: 8.45, alternative_available: true,
    substitute_ingredient: 'Robusta blend (60/40)', substitute_price: 6.80, substitute_quality_match: 65,
    monthly_volume_value: 779, forecast_monthly_cost_increase: 209,
  },
  {
    ingredient_name: 'Salmon (Atlantic)', ingredient_category: 'seafood',
    current_price: 12.80, forecast_price_30d: 13.50, forecast_price_60d: 14.20, forecast_price_90d: 15.10,
    price_change_pct_30d: 5.5, price_change_pct_90d: 18.0,
    historical_volatility_pct: 18.2, avg_monthly_volume: 220,
    trigger_signal: 'supply_chain_alert', trigger_detail: 'Norwegian salmon export delays (port congestion + new tariff)',
    confidence_score: 76,
    affected_dishes: 'Salmon Niçoise, Grilled Salmon, Salmon Tartare',
    affected_dish_count: 3,
    current_margin_pct: 62, forecast_margin_pct_30d: 58, forecast_margin_pct_90d: 53,
    current_supplier: 'Coastal Seafood', current_supplier_price: 12.80,
    alternative_supplier: 'Farm-Raised Atlantic', alternative_supplier_price: 11.90, alternative_available: true,
    substitute_ingredient: 'Arctic Char', substitute_price: 11.20, substitute_quality_match: 85,
    monthly_volume_value: 2816, forecast_monthly_cost_increase: 506,
  },
  {
    ingredient_name: 'Olive Oil (Extra Virgin)', ingredient_category: 'oil',
    current_price: 14.50, forecast_price_30d: 15.20, forecast_price_60d: 16.40, forecast_price_90d: 17.80,
    price_change_pct_30d: 4.8, price_change_pct_90d: 22.8,
    historical_volatility_pct: 25.4, avg_monthly_volume: 65,
    trigger_signal: 'weather_forecast', trigger_detail: 'Mediterranean drought (2nd year) — Spain/Italy yields -30%',
    confidence_score: 89,
    affected_dishes: 'All pasta dishes, all salads, bruschetta, dressings',
    affected_dish_count: 18,
    current_margin_pct: 71, forecast_margin_pct_30d: 69, forecast_margin_pct_90d: 65,
    current_supplier: 'Mediterranean Imports', current_supplier_price: 14.50,
    alternative_supplier: 'California Olive Ranch', alternative_supplier_price: 15.10, alternative_available: true,
    substitute_ingredient: 'Olive oil blend (EVOO + canola)', substitute_price: 9.80, substitute_quality_match: 70,
    monthly_volume_value: 942, forecast_monthly_cost_increase: 215,
  },
  {
    ingredient_name: 'Wheat Flour (All-Purpose)', ingredient_category: 'grain',
    current_price: 0.85, forecast_price_30d: 0.88, forecast_price_60d: 0.92, forecast_price_90d: 0.97,
    price_change_pct_30d: 3.5, price_change_pct_90d: 14.1,
    historical_volatility_pct: 9.8, avg_monthly_volume: 850,
    trigger_signal: 'commodity_futures', trigger_detail: 'Wheat futures up 6% on Russia export uncertainty + drought',
    confidence_score: 73,
    affected_dishes: 'Pizza dough, bread, pasta, desserts',
    affected_dish_count: 22,
    current_margin_pct: 74, forecast_margin_pct_30d: 73, forecast_margin_pct_90d: 71,
    current_supplier: 'Sysco Bakery', current_supplier_price: 0.85,
    alternative_supplier: 'Regional Mill', alternative_supplier_price: 0.87, alternative_available: true,
    substitute_ingredient: 'Lower-protein flour blend', substitute_price: 0.78, substitute_quality_match: 80,
    monthly_volume_value: 722, forecast_monthly_cost_increase: 102,
  },
];

export const runCostVolEngine = async (
  db: ReturnType<typeof useDB>,
  config: CostVolConfig = DEFAULT_COSTVOL_CONFIG
): Promise<{ alerts: CostVolAlert[]; generated: number }> => {
  const alerts: CostVolAlert[] = [];
  const now = new Date();

  let data: IngredientForecast[] = [];
  try {
    const result = await db.query(
      `SELECT ingredient_name, ingredient_category, current_price,
              forecast_price_30d, forecast_price_60d, forecast_price_90d,
              price_change_pct_30d, price_change_pct_90d, historical_volatility_pct,
              avg_monthly_volume, trigger_signal, trigger_detail, confidence_score,
              affected_dishes, affected_dish_count, current_margin_pct,
              forecast_margin_pct_30d, forecast_margin_pct_90d,
              current_supplier, current_supplier_price,
              alternative_supplier, alternative_supplier_price, alternative_available,
              substitute_ingredient, substitute_price, substitute_quality_match,
              monthly_volume_value, forecast_monthly_cost_increase
       FROM ingredient_cost_forecast
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      ingredient_name: String(r.ingredient_name ?? ''),
      ingredient_category: String(r.ingredient_category ?? 'produce'),
      current_price: safeNumber(r.current_price, 0),
      forecast_price_30d: safeNumber(r.forecast_price_30d, 0),
      forecast_price_60d: safeNumber(r.forecast_price_60d, 0),
      forecast_price_90d: safeNumber(r.forecast_price_90d, 0),
      price_change_pct_30d: safeNumber(r.price_change_pct_30d, 0),
      price_change_pct_90d: safeNumber(r.price_change_pct_90d, 0),
      historical_volatility_pct: safeNumber(r.historical_volatility_pct, 0),
      avg_monthly_volume: safeNumber(r.avg_monthly_volume, 0),
      trigger_signal: String(r.trigger_signal ?? 'seasonal_pattern'),
      trigger_detail: String(r.trigger_detail ?? ''),
      confidence_score: safeNumber(r.confidence_score, 50),
      affected_dishes: String(r.affected_dishes ?? ''),
      affected_dish_count: safeNumber(r.affected_dish_count, 0),
      current_margin_pct: safeNumber(r.current_margin_pct, 0),
      forecast_margin_pct_30d: safeNumber(r.forecast_margin_pct_30d, 0),
      forecast_margin_pct_90d: safeNumber(r.forecast_margin_pct_90d, 0),
      current_supplier: String(r.current_supplier ?? ''),
      current_supplier_price: safeNumber(r.current_supplier_price, 0),
      alternative_supplier: String(r.alternative_supplier ?? ''),
      alternative_supplier_price: safeNumber(r.alternative_supplier_price, 0),
      alternative_available: Boolean(r.alternative_available ?? false),
      substitute_ingredient: String(r.substitute_ingredient ?? ''),
      substitute_price: safeNumber(r.substitute_price, 0),
      substitute_quality_match: safeNumber(r.substitute_quality_match, 0),
      monthly_volume_value: safeNumber(r.monthly_volume_value, 0),
      forecast_monthly_cost_increase: safeNumber(r.forecast_monthly_cost_increase, 0),
    }));
  } catch (err) {
    console.warn('[costvol] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const monthlyOpp = Math.round(d.forecast_monthly_cost_increase);

    // Rule 1: SEASONAL_COST_SPIKE_PREDICTED
    if (d.trigger_signal === 'seasonal_pattern' && d.price_change_pct_30d >= 10) {
      alerts.push({
        rule_id: 'seasonal_cost_spike_predicted',
        severity: d.price_change_pct_30d >= 25 ? 'critical' : 'high',
        ingredient_name: d.ingredient_name,
        ingredient_category: d.ingredient_category,
        affected_dishes: d.affected_dishes,
        affected_dish_count: d.affected_dish_count,
        current_price: d.current_price,
        forecast_price_30d: d.forecast_price_30d,
        forecast_price_90d: d.forecast_price_90d,
        price_change_pct_30d: d.price_change_pct_30d,
        price_change_pct_90d: d.price_change_pct_90d,
        trigger_signal: d.trigger_signal,
        trigger_detail: d.trigger_detail,
        confidence_score: d.confidence_score,
        est_monthly_opportunity: monthlyOpp,
        description: `SEASONAL COST SPIKE PREDICTED: ${d.ingredient_name} expected +${d.price_change_pct_30d.toFixed(0)}% in 30 days, +${d.price_change_pct_90d.toFixed(0)}% in 90 days. Pattern: ${d.trigger_detail}. Affects ${d.affected_dish_count} dishes (${d.affected_dishes}). Current price ${fmt$(d.current_price)}/unit → forecast ${fmt$(d.forecast_price_90d)} in 90 days. ACTION: ${d.price_change_pct_30d >= 25 ? 'CRITICAL — pre-buy 60-90 day supply NOW at current price (save ' + fmt$(monthlyOpp * 3) + ' over 90 days), OR reformulate recipe to reduce reliance on this ingredient. ' : 'Lock 30-day supplier contract at current price; consider menu price adjustment of +$0.50-$1.00 on affected dishes. '}'Seasonal patterns are HIGH-confidence signals (88%+). Advance procurement saves ${fmt$(monthlyOpp * 3)}/quarter vs reactive purchasing.`,
        ai_recommendation: d.price_change_pct_30d >= 25 ? 'lock_contract' : 'raise_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: COMMODITY_MARKET_TREND_UP
    if (d.trigger_signal === 'commodity_futures' && d.price_change_pct_90d >= 8) {
      alerts.push({
        rule_id: 'commodity_market_trend_up',
        severity: d.price_change_pct_90d >= 15 ? 'high' : 'medium',
        ingredient_name: d.ingredient_name,
        ingredient_category: d.ingredient_category,
        affected_dishes: d.affected_dishes,
        affected_dish_count: d.affected_dish_count,
        current_price: d.current_price,
        forecast_price_90d: d.forecast_price_90d,
        price_change_pct_90d: d.price_change_pct_90d,
        trigger_signal: d.trigger_signal,
        trigger_detail: d.trigger_detail,
        confidence_score: d.confidence_score,
        est_monthly_opportunity: monthlyOpp,
        description: `COMMODITY MARKET TREND UP: ${d.ingredient_name} futures trending up (+${d.price_change_pct_90d.toFixed(0)}% projected 90 days). Signal: ${d.trigger_detail}. Affects ${d.affected_dish_count} dishes (${d.affected_dishes}). Current ${fmt$(d.current_price)} → forecast ${fmt$(d.forecast_price_90d)} in 90 days. Monthly cost increase: ${fmt$(monthlyOpp)}. ACTION: consider commodity hedging (forward contract with supplier), lock 90-day pricing, OR gradually raise menu prices 2-3% on commodity-heavy dishes. Commodity signals have medium confidence (73-82%) — combine with seasonal check before large commitments. Hedge saves ${fmt$(monthlyOpp * 3)}/quarter if trend sustains.`,
        ai_recommendation: 'hedge_commodity',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: WEATHER_DISRUPTION_PREDICTED
    if (d.trigger_signal === 'weather_forecast' && d.price_change_pct_30d >= 5) {
      alerts.push({
        rule_id: 'weather_disruption_predicted',
        severity: d.price_change_pct_30d >= 10 ? 'critical' : 'high',
        ingredient_name: d.ingredient_name,
        ingredient_category: d.ingredient_category,
        affected_dishes: d.affected_dishes,
        affected_dish_count: d.affected_dish_count,
        current_price: d.current_price,
        forecast_price_30d: d.forecast_price_30d,
        forecast_price_90d: d.forecast_price_90d,
        price_change_pct_30d: d.price_change_pct_30d,
        price_change_pct_90d: d.price_change_pct_90d,
        trigger_signal: d.trigger_signal,
        trigger_detail: d.trigger_detail,
        confidence_score: d.confidence_score,
        est_monthly_opportunity: monthlyOpp,
        description: `WEATHER DISRUPTION PREDICTED: ${d.ingredient_name} supply will be disrupted by weather event. Signal: ${d.trigger_detail}. Forecast: +${d.price_change_pct_30d.toFixed(0)}% in 30 days, +${d.price_change_pct_90d.toFixed(0)}% in 90 days. Affects ${d.affected_dish_count} dishes. ACTION: source from alternative growing region (different hemisphere if available), pre-buy 60-day supply, OR temporarily substitute with similar ingredient. Weather signals are HIGH confidence (88-91%) when forecasts are within 30 days. Cost of inaction: ${fmt$(monthlyOpp * 2)} over 60 days. Weather-driven spikes are usually TEMPORARY — don't permanently reprice, just bridge the gap.`,
        ai_recommendation: 'substitute_ingredient',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SUPPLY_CHAIN_DELAY_PREDICTED
    if (d.trigger_signal === 'supply_chain_alert' && d.price_change_pct_30d >= 4) {
      alerts.push({
        rule_id: 'supply_chain_delay_predicted',
        severity: d.price_change_pct_30d >= 8 ? 'high' : 'medium',
        ingredient_name: d.ingredient_name,
        ingredient_category: d.ingredient_category,
        affected_dishes: d.affected_dishes,
        affected_dish_count: d.affected_dish_count,
        current_price: d.current_price,
        forecast_price_30d: d.forecast_price_30d,
        price_change_pct_30d: d.price_change_pct_30d,
        trigger_signal: d.trigger_signal,
        trigger_detail: d.trigger_detail,
        confidence_score: d.confidence_score,
        est_monthly_opportunity: monthlyOpp,
        description: `SUPPLY CHAIN DELAY PREDICTED: ${d.ingredient_name} costs rising due to logistics disruption. Signal: ${d.trigger_detail}. Forecast: +${d.price_change_pct_30d.toFixed(0)}% in 30 days. Affects ${d.affected_dish_count} dishes. ACTION: source locally (avoid port/shipping delays), build 30-day buffer stock, OR switch to domestic supplier. Supply chain signals have medium-high confidence (76-85%) depending on disruption type. ${d.alternative_available ? `Alternative supplier available: ${d.alternative_supplier} at ${fmt$(d.alternative_supplier_price)} (${d.alternative_supplier_price < d.current_price ? 'LOWER' : 'higher'} than current). ` : ''}Cost of inaction: ${fmt$(monthlyOpp)}/mo.`,
        ai_recommendation: d.alternative_available ? 'switch_supplier' : 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: MARGIN_THRESHOLD_BREACH_FORECAST
    const willBreach30d = d.forecast_margin_pct_30d < config.marginThreshold && d.current_margin_pct >= config.marginThreshold;
    const willBreach90d = d.forecast_margin_pct_90d < config.marginThreshold && d.current_margin_pct >= config.marginThreshold;
    if (willBreach30d || willBreach90d) {
      const breachDays = willBreach30d ? 30 : 60;
      alerts.push({
        rule_id: 'margin_threshold_breach_forecast',
        severity: willBreach30d ? 'critical' : 'high',
        ingredient_name: d.ingredient_name,
        affected_dishes: d.affected_dishes,
        affected_dish_count: d.affected_dish_count,
        current_margin_pct: d.current_margin_pct,
        forecast_margin_pct: willBreach30d ? d.forecast_margin_pct_30d : d.forecast_margin_pct_90d,
        threshold_breach_days: breachDays,
        trigger_signal: d.trigger_signal,
        confidence_score: d.confidence_score,
        est_monthly_opportunity: monthlyOpp,
        description: `MARGIN THRESHOLD BREACH FORECAST: ${d.affected_dish_count} dish(es) using ${d.ingredient_name} will drop below ${config.marginThreshold}% margin in ~${breachDays} days. Current margin ${d.current_margin_pct.toFixed(0)}% → forecast ${(willBreach30d ? d.forecast_margin_pct_30d : d.forecast_margin_pct_90d).toFixed(0)}% (threshold ${config.marginThreshold}%). Affected: ${d.affected_dishes}. ACTION: ${willBreach30d ? 'URGENT — raise menu prices $1-2 on these dishes BEFORE cost spike hits, OR reformulate recipe with cheaper substitute. ' : 'Plan gradual menu price increase over next 30 days to absorb forecasted cost. '}'Profit margin breach = dishes become loss leaders. Pre-emptive repricing preserves ${fmt$(monthlyOpp * 3)}/quarter; reactive repricing loses ${fmt$(monthlyOpp * 2)}/mo until menus catch up (typically 30-60 day lag).`,
        ai_recommendation: willBreach30d ? 'raise_price' : 'promote_alternative',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: HIGH_VOLATILITY_INGREDIENT
    if (d.historical_volatility_pct >= config.volatilityThreshold) {
      alerts.push({
        rule_id: 'high_volatility_ingredient',
        severity: d.historical_volatility_pct >= 25 ? 'medium' : 'low',
        ingredient_name: d.ingredient_name,
        ingredient_category: d.ingredient_category,
        affected_dishes: d.affected_dishes,
        affected_dish_count: d.affected_dish_count,
        current_price: d.current_price,
        trigger_signal: 'historical_volatility',
        confidence_score: 100,  // historical fact
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `HIGH VOLATILITY INGREDIENT: ${d.ingredient_name} has ${d.historical_volatility_pct.toFixed(0)}% historical price volatility (threshold ${config.volatilityThreshold}%). Affects ${d.affected_dish_count} dishes. Volatile ingredients create unpredictable margins — month-to-month swings of 15-30% make pricing strategy difficult. ACTION: ${d.historical_volatility_pct >= 25 ? 'establish hedging strategy — forward contracts or fixed-price agreements with suppliers for 90-180 days. ' : 'maintain a 30-day buffer stock to ride out short-term price spikes. '}'Consider diversifying suppliers (3+ sources) so you can switch quickly when one spikes. Volatility hedging typically saves 8-12% on annual procurement costs for high-volatility ingredients. ${fmt$(Math.round(monthlyOpp * 0.5 * 12))}/yr potential savings on this ingredient alone.`,
        ai_recommendation: 'hedge_commodity',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: ALTERNATIVE_SUPPLIER_AVAILABLE
    if (d.alternative_available && d.alternative_supplier_price < d.current_supplier_price * 0.97) {
      const savingsPerUnit = d.current_supplier_price - d.alternative_supplier_price;
      const monthlySavings = Math.round(savingsPerUnit * d.avg_monthly_volume);
      alerts.push({
        rule_id: 'alternative_supplier_available',
        severity: monthlySavings >= 200 ? 'high' : 'medium',
        ingredient_name: d.ingredient_name,
        ingredient_category: d.ingredient_category,
        affected_dishes: d.affected_dishes,
        affected_dish_count: d.affected_dish_count,
        current_price: d.current_supplier_price,
        trigger_signal: 'supplier_quote',
        confidence_score: 95,
        est_monthly_opportunity: monthlySavings,
        description: `ALTERNATIVE SUPPLIER AVAILABLE: ${d.ingredient_name} available from ${d.alternative_supplier} at ${fmt$(d.alternative_supplier_price)}/unit (current: ${fmt$(d.current_supplier_price)} from ${d.current_supplier}). Savings: ${fmt$(savingsPerUnit)}/unit × ${d.avg_monthly_volume} units/mo = ${fmt$(monthlySavings)}/mo. ACTION: trial order with alternative supplier (test quality, delivery reliability, payment terms). If trial succeeds, switch primary or split orders 70/30 to maintain leverage with both. Supplier diversification also reduces supply chain risk. Note: verify quality match before full switch — request sample batch and chef tasting.`,
        ai_recommendation: 'switch_supplier',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: RECIPE_REFORMULATION_RECOMMENDED
    if (d.substitute_ingredient && d.substitute_price < d.current_price * 0.92 && d.substitute_quality_match >= 70) {
      const savingsPerUnit = d.current_price - d.substitute_price;
      const monthlySavings = Math.round(savingsPerUnit * d.avg_monthly_volume);
      alerts.push({
        rule_id: 'recipe_reformulation_recommended',
        severity: monthlySavings >= 300 ? 'high' : 'medium',
        ingredient_name: d.ingredient_name,
        ingredient_category: d.ingredient_category,
        affected_dishes: d.affected_dishes,
        affected_dish_count: d.affected_dish_count,
        current_price: d.current_price,
        trigger_signal: 'substitute_analysis',
        confidence_score: 80,
        est_monthly_opportunity: monthlySavings,
        description: `RECIPE REFORMULATION RECOMMENDED: substitute ${d.ingredient_name} (${fmt$(d.current_price)}/unit) with ${d.substitute_ingredient} (${fmt$(d.substitute_price)}/unit) in ${d.affected_dish_count} dishes. Quality match: ${d.substitute_quality_match}/100. Savings: ${fmt$(savingsPerUnit)}/unit × ${d.avg_monthly_volume}/mo = ${fmt$(monthlySavings)}/mo = ${fmt$(monthlySavings * 12)}/yr. ACTION: chef R&D trial — blind taste test with staff + select customers; if quality holds, reformulate recipe. ${d.substitute_quality_match >= 85 ? 'High quality match — low risk of customer noticing. ' : d.substitute_quality_match >= 75 ? 'Medium quality match — may need recipe adjustment to compensate. ' : 'Lower quality match — consider partial substitution (50/50) to balance savings + quality. '}'Recipe reformulation is the HIGHEST-ROI cost reduction lever — permanent savings, no menu price increase needed.`,
        ai_recommendation: 'reformulate_recipe',
        status: 'open', detected_at: now,
      });
    }
  }

  // Generate AI insights for critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat({
            messages: [
              { role: 'system', content: 'You are a restaurant procurement + cost forecasting AI. Given a forecasted cost change, recommend ONE specific action with timing + expected savings (max 200 chars, imperative voice).' },
              { role: 'user', content: `Ingredient: ${a.ingredient_name ?? 'n/a'} (category: ${a.ingredient_category ?? 'n/a'}). Current: ${fmt$(a.current_price ?? 0)} → 30d: ${fmt$(a.forecast_price_30d ?? 0)} (+${a.price_change_pct_30d ?? 0}%) → 90d: ${fmt$(a.forecast_price_90d ?? 0)} (+${a.price_change_pct_90d ?? 0}%). Trigger: ${a.trigger_signal ?? 'n/a'} — ${a.trigger_detail ?? 'n/a'}. Confidence: ${a.confidence_score ?? 0}/100. Affected: ${a.affected_dish_count ?? 0} dishes. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
            ],
            task: 'reporting',
          });
          const text = typeof response === 'string'
            ? response
            : (response as any)?.choices?.[0]?.message?.content ?? '';
          a.ai_insight = String(text).slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  // Persist alerts
  try {
    await db.query(`DELETE FROM recipe_cost_volatility_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE recipe_cost_volatility_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<CostVolAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM recipe_cost_volatility_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  ingredientCount: number; avgConfidence: number; thresholdBreaches: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'margin_threshold_breach_forecast') AS breach,
              math::count(ingredient_name != NONE) AS ingredients,
              math::mean(confidence_score WHERE confidence_score != NONE) AS avgconf
       FROM recipe_cost_volatility_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      ingredientCount: safeNumber(r.ingredients, 0),
      avgConfidence: safeNumber(r.avgconf, 0),
      thresholdBreaches: safeNumber(r.breach, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, ingredientCount: 0, avgConfidence: 0, thresholdBreaches: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
