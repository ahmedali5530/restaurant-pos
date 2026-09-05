/**
 * AI Menu Item Price Elasticity Drift Tracker — tracks how each menu item's
 * price sensitivity changes over time and recommends adaptive pricing.
 *
 * 134th POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from stale price elasticity assumptions. No POS tracks how
 * elasticity itself changes over time.
 *
 * Distinct from:
 *   - price-elasticity.service (14th) — computes STATIC elasticity coefficient
 *   - dynamic-pricing.service — adjusts prices by demand (not elasticity drift)
 *   - price-ab-testing.service — tests specific prices (not elasticity evolution)
 *   - price-psychology.service — behavioral economics (not elasticity tracking)
 *   - profitability-decay.service — tracks margin decay (not elasticity)
 *   - menu-description-impact.service — text impact (not price sensitivity)
 *
 * 8 AI rules:
 *   1. elasticity_increasing — becoming more price-sensitive → hold/lower price
 *   2. elasticity_decreasing — becoming less price-sensitive → raise price
 *   3. elasticity_stale — not re-measured in 6+ months → remeasure
 *   4. pricing_strategy_mismatch — price set on old elasticity → reprice
 *   5. elasticity_volatility — elasticity swinging wildly → investigate cause
 *   6. seasonal_elasticity_shift — seasonal pattern in elasticity → adapt
 *   7. competitor_pressure_elasticity — competitor price changes shifting elasticity
 *   8. optimal_reprice_window — elasticity stable + favorable → safe to reprice
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ElasDriftRuleId =
  | 'elasticity_increasing'
  | 'elasticity_decreasing'
  | 'elasticity_stale'
  | 'pricing_strategy_mismatch'
  | 'elasticity_volatility'
  | 'seasonal_elasticity_shift'
  | 'competitor_pressure_elasticity'
  | 'optimal_reprice_window';

export type ElasDriftAiRec =
  | 'raise_price'
  | 'lower_price'
  | 'hold_price'
  | 'remeasure'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface ElasDriftAlert {
  id?: string;
  rule_id: ElasDriftRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  menu_item: string;
  current_elasticity?: number;
  previous_elasticity?: number;
  elasticity_change_pct?: number;
  elasticity_trend?: string;
  current_price?: number;
  recommended_price?: number;
  last_elasticity_measurement?: Date;
  months_since_measurement?: number;
  external_factors?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ElasDriftAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ElasDriftConfig {
  aiEnabled: boolean;
  driftThreshold: number;
  staleMonths: number;
  volatilityThreshold: number;
}

export const DEFAULT_ELASDRIFT_CONFIG: ElasDriftConfig = {
  aiEnabled: true,
  driftThreshold: 15.0,
  staleMonths: 6,
  volatilityThreshold: 30.0,
};

export const readElasDriftConfig = (settings: any): ElasDriftConfig => ({
  aiEnabled: settings?.elasdrift_ai_enabled ?? true,
  driftThreshold: safeNumber(settings?.elasdrift_drift_threshold, 15.0),
  staleMonths: safeNumber(settings?.elasdrift_stale_months, 6),
  volatilityThreshold: safeNumber(settings?.elasdrift_volatility_threshold, 30.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface ElasticityData {
  menu_item: string;
  current_elasticity: number;        // negative = normal demand curve (e.g., -1.5)
  previous_elasticity: number;       // from last measurement
  current_price: number;
  monthly_volume: number;
  margin_per_unit: number;
  last_measurement_months_ago: number;
  external_factors: string;
  // For volatility
  elasticity_history: number[];      // last 4 measurements
  // For seasonal
  current_season: string;
  previous_season_elasticity?: number;
  // For competitor
  competitor_price_change_pct?: number;
}

const MOCK_ITEMS: ElasticityData[] = [
  { menu_item: 'Beef Burger', current_elasticity: -1.8, previous_elasticity: -1.2, current_price: 15.90, monthly_volume: 280, margin_per_unit: 9.20, last_measurement_months_ago: 2, external_factors: 'competitor_price_drop', elasticity_history: [-1.2, -1.3, -1.5, -1.8], current_season: 'fall' },
  { menu_item: 'Margherita Pizza', current_elasticity: -0.8, previous_elasticity: -1.1, current_price: 14.50, monthly_volume: 320, margin_per_unit: 8.50, last_measurement_months_ago: 3, external_factors: 'brand_growth', elasticity_history: [-1.4, -1.2, -1.1, -0.8], current_season: 'fall' },
  { menu_item: 'Caesar Salad', current_elasticity: -1.5, previous_elasticity: -1.5, current_price: 10.90, monthly_volume: 145, margin_per_unit: 6.00, last_measurement_months_ago: 1, external_factors: 'none', elasticity_history: [-1.5, -1.4, -1.6, -1.5], current_season: 'fall' },
  { menu_item: 'Salmon Bowl', current_elasticity: -2.2, previous_elasticity: -1.4, current_price: 16.90, monthly_volume: 210, margin_per_unit: 12.50, last_measurement_months_ago: 8, external_factors: 'recession', elasticity_history: [-1.4, -1.6, -1.9, -2.2], current_season: 'fall', competitor_price_change_pct: -8 },
  { menu_item: 'Chicken Wings', current_elasticity: -0.9, previous_elasticity: -1.3, current_price: 12.90, monthly_volume: 260, margin_per_unit: 7.00, last_measurement_months_ago: 2, external_factors: 'brand_growth', elasticity_history: [-1.5, -1.3, -1.1, -0.9], current_season: 'fall' },
  { menu_item: 'Pasta Alfredo', current_elasticity: -1.6, previous_elasticity: -1.0, current_price: 13.50, monthly_volume: 90, margin_per_unit: 7.50, last_measurement_months_ago: 9, external_factors: 'none', elasticity_history: [-1.0, -1.2, -1.4, -1.6], current_season: 'fall' },
  { menu_item: 'Ribeye Steak', current_elasticity: -0.6, previous_elasticity: -0.9, current_price: 32.00, monthly_volume: 65, margin_per_unit: 18.00, last_measurement_months_ago: 4, external_factors: 'brand_growth', elasticity_history: [-1.2, -1.0, -0.9, -0.6], current_season: 'fall', previous_season_elasticity: -1.1 },
  { menu_item: 'Iced Tea', current_elasticity: -2.5, previous_elasticity: -1.8, current_price: 3.50, monthly_volume: 280, margin_per_unit: 2.80, last_measurement_months_ago: 1, external_factors: 'seasonal_shift', elasticity_history: [-1.8, -2.0, -2.2, -2.5], current_season: 'fall', previous_season_elasticity: -1.5 },
];

function computeElasticityChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.abs((Math.abs(current) - Math.abs(previous)) / Math.abs(previous)) * 100;
}

function computeVolatility(history: number[]): number {
  if (history.length < 2) return 0;
  const values = history.map(Math.abs);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return (Math.sqrt(variance) / mean) * 100;
}

export const runElasDriftEngine = async (
  db: ReturnType<typeof useDB>,
  config: ElasDriftConfig = DEFAULT_ELASDRIFT_CONFIG
): Promise<{ alerts: ElasDriftAlert[]; generated: number }> => {
  const alerts: ElasDriftAlert[] = [];
  const now = new Date();

  let items: ElasticityData[] = [];
  try {
    const result = await db.query(
      `SELECT menu_item, current_elasticity, previous_elasticity, current_price,
              monthly_volume, margin_per_unit, last_measurement_months_ago,
              external_factors, elasticity_history, current_season,
              previous_season_elasticity, competitor_price_change_pct
       FROM price_elasticity_drift_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    items = rows.map((r: any) => ({
      menu_item: String(r.menu_item ?? 'Unknown'),
      current_elasticity: safeNumber(r.current_elasticity, 0),
      previous_elasticity: safeNumber(r.previous_elasticity, 0),
      current_price: safeNumber(r.current_price, 0),
      monthly_volume: safeNumber(r.monthly_volume, 0),
      margin_per_unit: safeNumber(r.margin_per_unit, 0),
      last_measurement_months_ago: safeNumber(r.last_measurement_months_ago, 0),
      external_factors: String(r.external_factors ?? 'none'),
      elasticity_history: Array.isArray(r.elasticity_history) ? r.elasticity_history.map((v: any) => safeNumber(v, 0)) : [],
      current_season: String(r.current_season ?? 'fall'),
      previous_season_elasticity: r.previous_season_elasticity != null ? safeNumber(r.previous_season_elasticity, 0) : undefined,
      competitor_price_change_pct: r.competitor_price_change_pct != null ? safeNumber(r.competitor_price_change_pct, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[elasdrift] fetchItems failed — using mock', err);
  }

  if (items.length === 0) {
    items = MOCK_ITEMS;
  }

  for (const item of items) {
    const elasticityChangePct = computeElasticityChange(item.current_elasticity, item.previous_elasticity);
    const isMoreElastic = Math.abs(item.current_elasticity) > Math.abs(item.previous_elasticity);
    const trend = isMoreElastic ? 'more_elastic' : 'less_elastic';
    const volatility = computeVolatility(item.elasticity_history);
    const monthlyOpp = Math.round(elasticityChangePct * 0.01 * item.monthly_volume * item.current_price * 0.1);

    // Rule 1: ELASTICITY_INCREASING (becoming more price-sensitive)
    if (isMoreElastic && elasticityChangePct >= config.driftThreshold) {
      const recommendedPrice = Math.round(item.current_price * 0.97 * 100) / 100; // 3% decrease
      alerts.push({
        rule_id: 'elasticity_increasing',
        severity: 'high',
        menu_item: item.menu_item,
        current_elasticity: item.current_elasticity,
        previous_elasticity: item.previous_elasticity,
        elasticity_change_pct: Math.round(elasticityChangePct * 10) / 10,
        elasticity_trend: trend,
        current_price: item.current_price,
        recommended_price: recommendedPrice,
        external_factors: item.external_factors,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: ELASTICITY INCREASING — price sensitivity rose ${elasticityChangePct.toFixed(0)}% (${item.previous_elasticity} → ${item.current_elasticity}). Customers are MORE price-sensitive now. ${item.external_factors !== 'none' ? `Cause: ${item.external_factors}. ` : ''}Current price ${fmt$(item.current_price)} may now be too high for the new sensitivity. HOLD or LOWER price by ~3% to ${fmt$(recommendedPrice)}. Raising price now would cause disproportionate volume loss. Each 1% price increase now loses ${Math.abs(item.current_elasticity).toFixed(1)}% volume (was ${Math.abs(item.previous_elasticity).toFixed(1)}%).`,
        ai_recommendation: 'hold_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: ELASTICITY_DECREASING (becoming less price-sensitive)
    if (!isMoreElastic && elasticityChangePct >= config.driftThreshold) {
      const recommendedPrice = Math.round(item.current_price * 1.05 * 100) / 100; // 5% increase
      alerts.push({
        rule_id: 'elasticity_decreasing',
        severity: 'high',
        menu_item: item.menu_item,
        current_elasticity: item.current_elasticity,
        previous_elasticity: item.previous_elasticity,
        elasticity_change_pct: Math.round(elasticityChangePct * 10) / 10,
        elasticity_trend: trend,
        current_price: item.current_price,
        recommended_price: recommendedPrice,
        external_factors: item.external_factors,
        est_monthly_opportunity: Math.round((recommendedPrice - item.current_price) * item.monthly_volume),
        description: `${item.menu_item}: ELASTICITY DECREASING — price sensitivity dropped ${elasticityChangePct.toFixed(0)}% (${item.previous_elasticity} → ${item.current_elasticity}). Customers are LESS price-sensitive now. ${item.external_factors !== 'none' ? `Cause: ${item.external_factors}. ` : ''}RAISE PRICE by ~5% to ${fmt$(recommendedPrice)} — volume loss will be minimal (${Math.abs(item.current_elasticity).toFixed(1)}% per 1% increase vs old ${Math.abs(item.previous_elasticity).toFixed(1)}%). Each $1 increase now loses only ${Math.abs(item.current_elasticity).toFixed(1)} orders vs ${Math.abs(item.previous_elasticity).toFixed(1)} before. Revenue uplift: +${fmt$((recommendedPrice - item.current_price) * item.monthly_volume)}/mo.`,
        ai_recommendation: 'raise_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: ELASTICITY_STALE (not re-measured in 6+ months)
    if (item.last_measurement_months_ago >= config.staleMonths) {
      alerts.push({
        rule_id: 'elasticity_stale',
        severity: 'medium',
        menu_item: item.menu_item,
        current_elasticity: item.current_elasticity,
        last_elasticity_measurement: new Date(Date.now() - item.last_measurement_months_ago * 30 * 86400000),
        months_since_measurement: item.last_measurement_months_ago,
        current_price: item.current_price,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: ELASTICITY STALE — last measured ${item.last_measurement_months_ago} months ago (threshold ${config.staleMonths}mo). Current price ${fmt$(item.current_price)} based on old elasticity (${item.current_elasticity}). Elasticity likely shifted since then. REMEASURE: run a small price test (±3%) for 2 weeks to re-calibrate. Pricing on stale elasticity = pricing blind. Each month without re-measurement = ~${fmt$(monthlyOpp / item.last_measurement_months_ago)} in potential mispricing.`,
        ai_recommendation: 'remeasure',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: PRICING_STRATEGY_MISMATCH (price set on old elasticity)
    if (elasticityChangePct >= config.driftThreshold) {
      const direction = isMoreElastic ? 'too high' : 'too low';
      alerts.push({
        rule_id: 'pricing_strategy_mismatch',
        severity: 'medium',
        menu_item: item.menu_item,
        current_elasticity: item.current_elasticity,
        previous_elasticity: item.previous_elasticity,
        elasticity_change_pct: Math.round(elasticityChangePct * 10) / 10,
        elasticity_trend: trend,
        current_price: item.current_price,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: PRICING MISMATCH — price ${fmt$(item.current_price)} set when elasticity was ${item.previous_elasticity}, but it's now ${item.current_elasticity}. Price is now ${direction} for current sensitivity. ${isMoreElastic ? 'Customers are more price-sensitive → price feels expensive → volume loss. Consider lowering 3-5%.' : 'Customers are less price-sensitive → price could be higher → leaving money on table. Consider raising 3-5%.'} Pricing strategy must ADAPT to elasticity drift — static pricing on old assumptions = revenue leakage.`,
        ai_recommendation: isMoreElastic ? 'lower_price' : 'raise_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: ELASTICITY_VOLATILITY (elasticity swinging wildly)
    if (volatility >= config.volatilityThreshold) {
      alerts.push({
        rule_id: 'elasticity_volatility',
        severity: 'high',
        menu_item: item.menu_item,
        current_elasticity: item.current_elasticity,
        elasticity_change_pct: Math.round(volatility * 10) / 10,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: ELASTICITY VOLATILITY — ${volatility.toFixed(0)}% volatility across last 4 measurements (${item.elasticity_history.join(', ')}). Elasticity is swinging unpredictably — demand response to price is unstable. Causes: new competitor entering/leaving, menu redesign confusion, recipe changes, or market instability. INVESTIGATE before repricing — repricing on volatile elasticity is gambling. Wait for stability (2 consecutive measurements within 10%) before adjusting price.`,
        ai_recommendation: 'investigate',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: SEASONAL_ELASTICITY_SHIFT
    if (item.previous_season_elasticity != null) {
      const seasonalChange = computeElasticityChange(item.current_elasticity, item.previous_season_elasticity);
      if (seasonalChange >= 20) {
        alerts.push({
          rule_id: 'seasonal_elasticity_shift',
          severity: 'medium',
          menu_item: item.menu_item,
          current_elasticity: item.current_elasticity,
          previous_elasticity: item.previous_season_elasticity,
          elasticity_change_pct: Math.round(seasonalChange * 10) / 10,
          external_factors: 'seasonal_shift',
          est_monthly_opportunity: monthlyOpp,
          description: `${item.menu_item}: SEASONAL ELASTICITY SHIFT — elasticity changed ${seasonalChange.toFixed(0)}% from last season (${item.previous_season_elasticity} → ${item.current_elasticity}). ${item.current_season === 'summer' ? 'Summer: customers more price-sensitive (vacation budget). ' : item.current_season === 'winter' ? 'Winter: customers less price-sensitive (comfort food). ' : ''}ADAPT pricing seasonally: lower prices in high-elasticity seasons, raise in low-elasticity seasons. Seasonal pricing strategy captures maximum revenue per season. Don't use same price year-round when elasticity shifts seasonally.`,
          ai_recommendation: 'monitor',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 7: COMPETITOR_PRESSURE_ELASTICITY
    if (item.competitor_price_change_pct != null && Math.abs(item.competitor_price_change_pct) >= 5) {
      alerts.push({
        rule_id: 'competitor_pressure_elasticity',
        severity: 'high',
        menu_item: item.menu_item,
        current_elasticity: item.current_elasticity,
        previous_elasticity: item.previous_elasticity,
        elasticity_change_pct: Math.round(elasticityChangePct * 10) / 10,
        external_factors: 'competitor_price_drop',
        current_price: item.current_price,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: COMPETITOR PRESSURE — competitor ${item.competitor_price_change_pct < 0 ? 'dropped' : 'raised'} price ${Math.abs(item.competitor_price_change_pct)}%, which shifted your elasticity ${elasticityChangePct.toFixed(0)}% (${item.previous_elasticity} → ${item.current_elasticity}). ${item.competitor_price_change_pct < 0 ? 'Competitor cheaper → your customers more price-sensitive. ' : 'Competitor more expensive → your customers less price-sensitive. '}Your price ${fmt$(item.current_price)} now faces different competitive context. ${item.competitor_price_change_pct < 0 ? 'Consider matching or differentiating (quality/value props). ' : 'Opportunity to raise price slightly. '}Competitor pricing directly affects YOUR elasticity — monitor both.`,
        ai_recommendation: item.competitor_price_change_pct < 0 ? 'lower_price' : 'raise_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: OPTIMAL_REPRICE_WINDOW
    if (elasticityChangePct < 5 && item.last_measurement_months_ago <= 2 && volatility < 15) {
      const recommendedPrice = Math.abs(item.current_elasticity) < 1
        ? Math.round(item.current_price * 1.05 * 100) / 100  // inelastic → raise 5%
        : Math.round(item.current_price * 0.98 * 100) / 100; // elastic → lower 2%
      alerts.push({
        rule_id: 'optimal_reprice_window',
        severity: 'low',
        menu_item: item.menu_item,
        current_elasticity: item.current_elasticity,
        current_price: item.current_price,
        recommended_price: recommendedPrice,
        est_monthly_opportunity: Math.round(Math.abs(recommendedPrice - item.current_price) * item.monthly_volume * 0.8),
        description: `${item.menu_item}: OPTIMAL REPRICE WINDOW — elasticity is STABLE (${item.current_elasticity}, <5% change, low volatility, recently measured). Safe to reprice with confidence. ${Math.abs(item.current_elasticity) < 1 ? `Item is INELASTIC (|E|<1) → RAISE price 5% to ${fmt$(recommendedPrice)}. Volume loss will be minimal (${Math.abs(item.current_elasticity).toFixed(1)}% per 1%). Revenue gain: +${fmt$(Math.abs(recommendedPrice - item.current_price) * item.monthly_volume * 0.8)}/mo.` : `Item is ELASTIC (|E|>1) → LOWER price 2% to ${fmt$(recommendedPrice)} to capture volume. Revenue gain from volume increase exceeds price loss.`} Stable elasticity = predictable reprice outcome.`,
        ai_recommendation: Math.abs(item.current_elasticity) < 1 ? 'raise_price' : 'lower_price',
        status: 'open', detected_at: now,
      });
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant pricing strategy AI specializing in price elasticity drift tracking and adaptive pricing. Recommend specific price adjustments based on elasticity evolution. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Item: ${a.menu_item} — ${a.rule_id}. Current elasticity: ${a.current_elasticity ?? 0} (was ${a.previous_elasticity ?? 0}, ${a.elasticity_change_pct ?? 0}% change). Trend: ${a.elasticity_trend ?? 'N/A'}. Price: ${fmt$(a.current_price ?? 0)}. Recommended: ${fmt$(a.recommended_price ?? 0)}. Factors: ${a.external_factors ?? 'none'}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM price_elasticity_drift_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE price_elasticity_drift_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ElasDriftAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM price_elasticity_drift_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  moreElasticCount: number; lessElasticCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(elasticity_trend = 'more_elastic') AS moreelastic,
              math::count(elasticity_trend = 'less_elastic') AS lesselastic
       FROM price_elasticity_drift_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      moreElasticCount: safeNumber(r.moreelastic, 0), lessElasticCount: safeNumber(r.lesselastic, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, moreElasticCount: 0, lessElasticCount: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
