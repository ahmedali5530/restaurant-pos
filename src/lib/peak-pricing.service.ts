/**
 * AI Peak Demand Pricing Engine — demand-responsive pricing adjustments.
 *
 * 39th POSR-exclusive differentiator — restaurants leave 15-20% revenue on
 * the table by not adjusting prices during peak demand. Toast and Square have
 * STATIC discount rules but NO dynamic peak pricing. POSR generates
 * demand-based price adjustments (surge pricing during peaks, discount lulls).
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PricingTier = 'surge' | 'normal' | 'discount';

export interface PeakPricingRule {
  id?: string;
  day_of_week: number;
  hour: number;
  predicted_demand: number;
  capacity: number;
  demand_ratio: number;
  pricing_tier: PricingTier;
  price_adjustment_pct: number;
  est_revenue_lift: number;
  ai_insight?: string;
  status: string;
  created_at: Date;
  expires_at?: Date;
}

export interface PeakPricingConfig {
  aiEnabled: boolean;
  surgePct: number;
  discountPct: number;
  demandThreshold: number;
  lullThreshold: number;
}

export const DEFAULT_PEAK_PRICING_CONFIG: PeakPricingConfig = {
  aiEnabled: true, surgePct: 0.10, discountPct: 0.15, demandThreshold: 0.8, lullThreshold: 0.4,
};

export const readPeakPricingConfig = (settings: any): PeakPricingConfig => ({
  aiEnabled: settings?.peak_pricing_ai_enabled ?? true,
  surgePct: safeNumber(settings?.peak_pricing_surge_pct, 0.10),
  discountPct: safeNumber(settings?.peak_pricing_discount_pct, 0.15),
  demandThreshold: safeNumber(settings?.peak_pricing_demand_threshold, 0.8),
  lullThreshold: safeNumber(settings?.peak_pricing_lull_threshold, 0.4),
});

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

export const runPeakPricingEngine = async (
  db: ReturnType<typeof useDB>,
  config: PeakPricingConfig = DEFAULT_PEAK_PRICING_CONFIG
): Promise<{ rules: PeakPricingRule[]; generated: number }> => {
  // 1. Get hourly order counts for last 30 days (by DOW × hour)
  let hourlyData: Array<{ dow: number; hour: number; avgOrders: number; avgRevenue: number }> = [];
  try {
    const result = await db.query(
      `SELECT
         time::dayofweek(created_at) AS dow,
         time::hour(created_at) AS hour,
         count() / 30 AS avg_orders,
         math::sum(total) / 30 AS avg_revenue
       FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND created_at > time::now() - 30d
       GROUP BY time::dayofweek(created_at), time::hour(created_at)`
    );
    hourlyData = (Array.isArray(result) ? result.flat() : []).map((r: any) => ({
      dow: safeNumber(r.dow, 0), hour: safeNumber(r.hour, 0),
      avgOrders: safeNumber(r.avg_orders, 0), avgRevenue: safeNumber(r.avg_revenue, 0),
    }));
  } catch (err) { console.warn('[peak-pricing] fetchHourlyData failed', err); }

  if (hourlyData.length === 0) return { rules: [], generated: 0 };

  // 2. Estimate capacity (avg max orders per hour = 95th percentile of hourly counts)
  const allCounts = hourlyData.map(d => d.avgOrders).sort((a, b) => a - b);
  const capacity = allCounts[Math.floor(allCounts.length * 0.95)] || 50;

  // 3. Generate rules for each DOW × hour
  const rules: PeakPricingRule[] = [];
  for (const hd of hourlyData) {
    const demandRatio = capacity > 0 ? hd.avgOrders / capacity : 0;
    let tier: PricingTier = 'normal';
    let adjustmentPct = 0;

    if (demandRatio > config.demandThreshold) {
      tier = 'surge';
      adjustmentPct = config.surgePct;
    } else if (demandRatio < config.lullThreshold) {
      tier = 'discount';
      adjustmentPct = -config.discountPct;
    }

    // Skip normal (no adjustment needed)
    if (tier === 'normal') continue;

    const estRevenueLift = hd.avgRevenue * adjustmentPct;

    rules.push({
      day_of_week: hd.dow,
      hour: hd.hour,
      predicted_demand: Math.round(hd.avgOrders),
      capacity: Math.round(capacity),
      demand_ratio: Math.round(demandRatio * 100) / 100,
      pricing_tier: tier,
      price_adjustment_pct: Math.round(adjustmentPct * 10000) / 100,
      est_revenue_lift: Math.round(estRevenueLift * 100) / 100,
      status: 'pending',
      created_at: new Date(),
    });
  }

  // 4. AI insight for top 5 surge rules
  if (config.aiEnabled && rules.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const surgeRules = rules.filter(r => r.pricing_tier === 'surge').slice(0, 5);
      for (const rule of surgeRules) {
        try {
          const dowName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][rule.day_of_week];
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a pricing optimization AI. Respond with a single insight (max 200 chars).' },
            { role: 'user', content: `Surge pricing for ${dowName} ${rule.hour}:00 — demand ${rule.predicted_demand}/${rule.capacity} (${rule.demand_ratio} ratio), +${rule.price_adjustment_pct}% price, est +${formatCurrency(rule.est_revenue_lift)} revenue.` },
          ], { temperature: 0.3, maxTokens: 100 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          rule.ai_insight = text.slice(0, 200);
        } catch { }
      }
    }
  }

  // 5. Persist
  try { await db.query(`DELETE FROM peak_pricing_rule WHERE status = 'pending' AND created_at < time::now() - 1h`); } catch { }
  for (const rule of rules) {
    try { await db.query(`CREATE peak_pricing_rule CONTENT $data`, { data: { ...rule, created_at: rule.created_at.toISOString() } }); } catch { }
  }

  return { rules, generated: rules.length };
};

export const getActiveRules = async (db: ReturnType<typeof useDB>): Promise<PeakPricingRule[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM peak_pricing_rule WHERE status IN ('pending', 'active') ORDER BY day_of_week, hour`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  surgeCount: number; discountCount: number; totalLift: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(pricing_tier = 'surge') AS surge, math::count(pricing_tier = 'discount') AS discount, math::sum(est_revenue_lift) AS lift
       FROM peak_pricing_rule WHERE status IN ('pending', 'active') GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return { surgeCount: safeNumber(row.surge, 0), discountCount: safeNumber(row.discount, 0), totalLift: safeNumber(row.lift, 0) };
  } catch { return { surgeCount: 0, discountCount: 0, totalLift: 0 }; }
};

export const updateRuleStatus = async (db: ReturnType<typeof useDB>, ruleId: string, status: string): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: ruleId, status });
};
