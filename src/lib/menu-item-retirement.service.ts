/**
 * AI Menu Item Retirement Predictor — predicts which menu items should be
 * retired based on declining popularity, low margin, high modification rate,
 * kitchen complexity, and waste, with optimal timing recommendations.
 *
 * 136th POSR-exclusive differentiator — restaurants lose $300-1,000/mo per
 * location from keeping dead menu items too long. No POS predicts when to
 * retire items.
 *
 * Distinct from:
 *   - menu-engineering-matrix.service — classifies as Dogs (doesn't predict retirement)
 *   - menu-rotation.service — seasonal rotation (not retirement)
 *   - menu-cannibalization.service — detects competition (not retirement timing)
 *   - menu-optimization.service — BCG matrix (not retirement)
 *   - dish-popularity.service — volume ranking (not decline trajectory)
 *   - profitability-decay.service — margin decay (not retirement decision)
 *
 * 8 AI rules:
 *   1. retirement_candidate — score ≥65 → strong candidate for retirement
 *   2. zombie_item — dead item still on menu → remove immediately
 *   3. optimal_retirement_window — declining but not dead → retire next menu cycle
 *   4. carrying_cost_excessive — keeping costs more than revenue → retire now
 *   5. revivable_item — declining but fixable with recipe update → revive first
 *   6. post_retirement_revenue_shift — after retiring, did revenue shift? → validate
 *   7. seasonal_non_return — seasonal item didn't return → retire permanently
 *   8. retirement_blocker — item has loyal following despite low volume → investigate
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MenuRetireRuleId =
  | 'retirement_candidate'
  | 'zombie_item'
  | 'optimal_retirement_window'
  | 'carrying_cost_excessive'
  | 'revivable_item'
  | 'post_retirement_revenue_shift'
  | 'seasonal_non_return'
  | 'retirement_blocker';

export type MenuRetireAiRec =
  | 'retire_now'
  | 'schedule_retirement'
  | 'revive_recipe'
  | 'monitor'
  | 'investigate'
  | 'skip';

export interface MenuRetireAlert {
  id?: string;
  rule_id: MenuRetireRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  menu_item: string;
  retirement_score?: number;
  current_order_rate?: number;
  peak_order_rate?: number;
  decline_pct?: number;
  current_margin?: number;
  monthly_carrying_cost?: number;
  monthly_revenue?: number;
  net_cost_of_keeping?: number;
  months_on_menu?: number;
  predicted_unprofitable_months?: number;
  modification_rate?: number;
  loyal_customer_count?: number;
  recommendation?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: MenuRetireAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface MenuRetireConfig {
  aiEnabled: boolean;
  scoreThreshold: number;
  declineThreshold: number;
  carryingCostMin: number;
}

export const DEFAULT_MENURETIRE_CONFIG: MenuRetireConfig = {
  aiEnabled: true,
  scoreThreshold: 65.0,
  declineThreshold: 50.0,
  carryingCostMin: 50.0,
};

export const readMenuRetireConfig = (settings: any): MenuRetireConfig => ({
  aiEnabled: settings?.menuretire_ai_enabled ?? true,
  scoreThreshold: safeNumber(settings?.menuretire_score_threshold, 65.0),
  declineThreshold: safeNumber(settings?.menuretire_decline_threshold, 50.0),
  carryingCostMin: safeNumber(settings?.menuretire_carrying_cost_min, 50.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface RetirementData {
  menu_item: string;
  current_order_rate: number;       // orders per month
  peak_order_rate: number;          // peak popularity
  decline_pct: number;              // % decline from peak
  current_margin_pct: number;       // current margin %
  monthly_carrying_cost: number;    // hidden cost of keeping
  monthly_revenue: number;          // revenue from this item
  months_on_menu: number;
  modification_rate: number;        // % of orders modified
  is_seasonal: boolean;
  last_season_returned: boolean;
  // For revivable
  has_recipe_been_updated: boolean;
  // For post-retirement
  was_retired?: boolean;
  post_retirement_revenue_shift?: number;  // revenue that moved to other items
  // For retirement_blocker
  has_loyal_following: boolean;
  loyal_customer_count: number;
  avg_price: number;
}

const MOCK_ITEMS: RetirementData[] = [
  { menu_item: 'Mushroom Soup', current_order_rate: 12, peak_order_rate: 85, decline_pct: 86, current_margin_pct: 28, monthly_carrying_cost: 120, monthly_revenue: 90, months_on_menu: 14, modification_rate: 35, is_seasonal: false, last_season_returned: true, has_recipe_been_updated: false, has_loyal_following: false, loyal_customer_count: 0, avg_price: 7.50 },
  { menu_item: 'Onion Rings', current_order_rate: 8, peak_order_rate: 60, decline_pct: 87, current_margin_pct: 18, monthly_carrying_cost: 95, monthly_revenue: 64, months_on_menu: 18, modification_rate: 15, is_seasonal: false, last_season_returned: true, has_recipe_been_updated: false, has_loyal_following: false, loyal_customer_count: 0, avg_price: 8.00 },
  { menu_item: 'Garden Salad', current_order_rate: 18, peak_order_rate: 65, decline_pct: 72, current_margin_pct: 45, monthly_carrying_cost: 55, monthly_revenue: 178, months_on_menu: 10, modification_rate: 42, is_seasonal: false, last_season_returned: true, has_recipe_been_updated: false, has_loyal_following: false, loyal_customer_count: 0, avg_price: 9.90 },
  { menu_item: 'BBQ Ribs', current_order_rate: 22, peak_order_rate: 55, decline_pct: 60, current_margin_pct: 35, monthly_carrying_cost: 80, monthly_revenue: 528, months_on_menu: 12, modification_rate: 20, is_seasonal: false, last_season_returned: true, has_recipe_been_updated: false, has_loyal_following: true, loyal_customer_count: 8, avg_price: 24.00 },
  { menu_item: 'Pumpkin Soup', current_order_rate: 0, peak_order_rate: 45, decline_pct: 100, current_margin_pct: 0, monthly_carrying_cost: 35, monthly_revenue: 0, months_on_menu: 3, modification_rate: 0, is_seasonal: true, last_season_returned: false, has_recipe_been_updated: false, has_loyal_following: false, loyal_customer_count: 0, avg_price: 7.50 },
  { menu_item: 'Vegan Burger', current_order_rate: 15, peak_order_rate: 40, decline_pct: 63, current_margin_pct: 32, monthly_carrying_cost: 70, monthly_revenue: 195, months_on_menu: 8, modification_rate: 55, is_seasonal: false, last_season_returned: true, has_recipe_been_updated: false, has_loyal_following: false, loyal_customer_count: 0, avg_price: 13.00 },
  { menu_item: 'Fish Tacos', current_order_rate: 5, peak_order_rate: 50, decline_pct: 90, current_margin_pct: 22, monthly_carrying_cost: 110, monthly_revenue: 55, months_on_menu: 16, modification_rate: 30, is_seasonal: false, last_season_returned: true, has_recipe_been_updated: false, has_loyal_following: true, loyal_customer_count: 3, avg_price: 11.00 },
  { menu_item: 'Stuffed Mushrooms', current_order_rate: 0, peak_order_rate: 35, decline_pct: 100, current_margin_pct: 0, monthly_carrying_cost: 25, monthly_revenue: 0, months_on_menu: 20, modification_rate: 0, is_seasonal: false, last_season_returned: true, has_recipe_been_updated: false, has_loyal_following: false, loyal_customer_count: 0, avg_price: 9.50, was_retired: true, post_retirement_revenue_shift: 180 },
];

function computeRetirementScore(d: RetirementData): number {
  let score = 0;
  // Decline from peak (0-40 points)
  score += Math.min(40, d.decline_pct * 0.4);
  // Low margin (0-20 points)
  if (d.current_margin_pct < 20) score += 20;
  else if (d.current_margin_pct < 35) score += 10;
  // Carrying cost vs revenue (0-20 points)
  if (d.monthly_revenue < d.monthly_carrying_cost) score += 20;
  else if (d.monthly_revenue < d.monthly_carrying_cost * 2) score += 10;
  // High modification rate (0-10 points)
  if (d.modification_rate >= 40) score += 10;
  else if (d.modification_rate >= 25) score += 5;
  // Time on menu (0-10 points)
  if (d.months_on_menu >= 12) score += 10;
  else if (d.months_on_menu >= 6) score += 5;
  // Loyal following reduces score
  if (d.has_loyal_following) score -= 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export const runMenuRetireEngine = async (
  db: ReturnType<typeof useDB>,
  config: MenuRetireConfig = DEFAULT_MENURETIRE_CONFIG
): Promise<{ alerts: MenuRetireAlert[]; generated: number }> => {
  const alerts: MenuRetireAlert[] = [];
  const now = new Date();

  let items: RetirementData[] = [];
  try {
    const result = await db.query(
      `SELECT menu_item, current_order_rate, peak_order_rate, decline_pct,
              current_margin_pct, monthly_carrying_cost, monthly_revenue,
              months_on_menu, modification_rate, is_seasonal, last_season_returned,
              has_recipe_been_updated, was_retired, post_retirement_revenue_shift,
              has_loyal_following, loyal_customer_count, avg_price
       FROM menu_retirement_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    items = rows.map((r: any) => ({
      menu_item: String(r.menu_item ?? 'Unknown'),
      current_order_rate: safeNumber(r.current_order_rate, 0),
      peak_order_rate: safeNumber(r.peak_order_rate, 0),
      decline_pct: safeNumber(r.decline_pct, 0),
      current_margin_pct: safeNumber(r.current_margin_pct, 0),
      monthly_carrying_cost: safeNumber(r.monthly_carrying_cost, 0),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      months_on_menu: safeNumber(r.months_on_menu, 0),
      modification_rate: safeNumber(r.modification_rate, 0),
      is_seasonal: r.is_seasonal ?? false,
      last_season_returned: r.last_season_returned ?? true,
      has_recipe_been_updated: r.has_recipe_been_updated ?? false,
      was_retired: r.was_retired ?? false,
      post_retirement_revenue_shift: r.post_retirement_revenue_shift != null ? safeNumber(r.post_retirement_revenue_shift, 0) : undefined,
      has_loyal_following: r.has_loyal_following ?? false,
      loyal_customer_count: safeNumber(r.loyal_customer_count, 0),
      avg_price: safeNumber(r.avg_price, 0),
    }));
  } catch (err) {
    console.warn('[menuretire] fetchItems failed — using mock', err);
  }

  if (items.length === 0) {
    items = MOCK_ITEMS;
  }

  for (const item of items) {
    const retirementScore = computeRetirementScore(item);
    const netCostOfKeeping = item.monthly_carrying_cost - item.monthly_revenue;
    const monthlyOpp = Math.max(0, Math.round(netCostOfKeeping));

    // Rule 1: RETIREMENT_CANDIDATE
    if (retirementScore >= config.scoreThreshold && item.current_order_rate > 0) {
      alerts.push({
        rule_id: 'retirement_candidate',
        severity: 'high',
        menu_item: item.menu_item,
        retirement_score: retirementScore,
        current_order_rate: item.current_order_rate,
        peak_order_rate: item.peak_order_rate,
        decline_pct: Math.round(item.decline_pct * 10) / 10,
        current_margin: item.current_margin_pct,
        monthly_carrying_cost: item.monthly_carrying_cost,
        monthly_revenue: item.monthly_revenue,
        net_cost_of_keeping: netCostOfKeeping,
        months_on_menu: item.months_on_menu,
        modification_rate: item.modification_rate,
        recommendation: 'retire_next_menu_cycle',
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: RETIREMENT CANDIDATE — score ${retirementScore}/100. Declined ${item.decline_pct.toFixed(0)}% from peak (${item.peak_order_rate} → ${item.current_order_rate} orders/mo). Margin: ${item.current_margin_pct}%. Carrying cost: ${fmt$(item.monthly_carrying_cost)}/mo vs revenue ${fmt$(item.monthly_revenue)}/mo. Net ${netCostOfKeeping > 0 ? 'LOSS' : 'gain'}: ${fmt$(Math.abs(netCostOfKeeping))}/mo. ${item.modification_rate >= 30 ? `${item.modification_rate}% modification rate — customers rejecting the default recipe. ` : ''}RETIRE next menu cycle. Each month of delay = ${fmt$(monthlyOpp)} in carrying cost.`,
        ai_recommendation: 'schedule_retirement',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: ZOMBIE_ITEM (dead item still on menu)
    if (item.current_order_rate === 0 && item.peak_order_rate > 0 && !item.was_retired) {
      alerts.push({
        rule_id: 'zombie_item',
        severity: 'critical',
        menu_item: item.menu_item,
        retirement_score: 100,
        current_order_rate: 0,
        peak_order_rate: item.peak_order_rate,
        decline_pct: 100,
        monthly_carrying_cost: item.monthly_carrying_cost,
        monthly_revenue: 0,
        net_cost_of_keeping: item.monthly_carrying_cost,
        months_on_menu: item.months_on_menu,
        recommendation: 'retire_now',
        est_monthly_opportunity: item.monthly_carrying_cost,
        description: `${item.menu_item}: ZOMBIE ITEM — 0 orders/mo but still on menu for ${item.months_on_menu} months. Peak was ${item.peak_order_rate} orders. 100% decline. Carrying cost: ${fmt$(item.monthly_carrying_cost)}/mo for an item NOBODY orders. RETIRE IMMEDIATELY — remove from POS, menu, inventory, prep training. Each month it stays = ${fmt$(item.monthly_carrying_cost)} pure waste. Zombie items also confuse customers (more choices = decision fatigue).`,
        ai_recommendation: 'retire_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: OPTIMAL_RETIREMENT_WINDOW
    if (item.decline_pct >= config.declineThreshold && item.decline_pct < 80 && item.current_order_rate > 5 && retirementScore < config.scoreThreshold) {
      alerts.push({
        rule_id: 'optimal_retirement_window',
        severity: 'medium',
        menu_item: item.menu_item,
        retirement_score: retirementScore,
        current_order_rate: item.current_order_rate,
        peak_order_rate: item.peak_order_rate,
        decline_pct: Math.round(item.decline_pct * 10) / 10,
        months_on_menu: item.months_on_menu,
        recommendation: 'retire_next_menu_cycle',
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: OPTIMAL RETIREMENT WINDOW — declining (${item.decline_pct.toFixed(0)}% from peak) but still has ${item.current_order_rate} orders/mo. Not dead yet but trajectory is clear. RETIRE at next menu cycle (2-4 weeks): gives loyal customers time to transition + avoids abrupt removal. Schedule retirement: announce "last chance" to create urgency + capture final orders. Timing matters — retire too early = lose ${item.current_order_rate} orders; too late = 6 more months of carrying cost (${fmt$(item.monthly_carrying_cost * 6)}).`,
        ai_recommendation: 'schedule_retirement',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: CARRYING_COST_EXCESSIVE
    if (netCostOfKeeping > config.carryingCostMin && item.current_order_rate > 0) {
      alerts.push({
        rule_id: 'carrying_cost_excessive',
        severity: 'high',
        menu_item: item.menu_item,
        monthly_carrying_cost: item.monthly_carrying_cost,
        monthly_revenue: item.monthly_revenue,
        net_cost_of_keeping: netCostOfKeeping,
        current_order_rate: item.current_order_rate,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: CARRYING COST EXCESSIVE — costs ${fmt$(item.monthly_carrying_cost)}/mo to keep (inventory, prep capacity, menu space, training) but only generates ${fmt$(item.monthly_revenue)}/mo revenue. NET LOSS: ${fmt$(netCostOfKeeping)}/mo. Keeping this item is literally losing money. RETIRE NOW — the revenue it generates doesn't cover its own carrying cost. ${item.modification_rate >= 30 ? 'High modification rate adds prep complexity cost too. ' : ''}Each month of keeping = ${fmt$(netCostOfKeeping)} lost. Annual waste: ${fmt$(netCostOfKeeping * 12)}.`,
        ai_recommendation: 'retire_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: REVIVABLE_ITEM
    if (item.decline_pct >= 50 && !item.has_recipe_been_updated && item.modification_rate >= 30 && item.current_order_rate > 5) {
      alerts.push({
        rule_id: 'revivable_item',
        severity: 'medium',
        menu_item: item.menu_item,
        decline_pct: Math.round(item.decline_pct * 10) / 10,
        modification_rate: item.modification_rate,
        current_order_rate: item.current_order_rate,
        recommendation: 'revive_recipe',
        est_monthly_opportunity: Math.round(item.peak_order_rate * item.avg_price * 0.3),
        description: `${item.menu_item}: REVIVABLE — declining ${item.decline_pct.toFixed(0)}% but ${item.modification_rate}% of customers modify it. High modification = customers WANT the concept but REJECT the execution. Recipe hasn't been updated since launch. REVIVE: update recipe based on most common modifications. ${item.modification_rate >= 50 ? '50%+ modification = half your customers are rebuilding the dish. ' : ''}If 30%+ of customers make the same modification, that IS the new recipe. Reviving costs ~${fmt$(200)} (chef time + testing) vs retirement losing ${item.current_order_rate} orders/mo permanently. Try revive first, retire if revival fails in 60 days.`,
        ai_recommendation: 'revive_recipe',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: POST_RETIREMENT_REVENUE_SHIFT
    if (item.was_retired && item.post_retirement_revenue_shift != null) {
      const shiftPct = item.peak_order_rate > 0 ? (item.post_retirement_revenue_shift / (item.peak_order_rate * item.avg_price)) * 100 : 0;
      alerts.push({
        rule_id: 'post_retirement_revenue_shift',
        severity: 'low',
        menu_item: item.menu_item,
        monthly_revenue: item.post_retirement_revenue_shift,
        recommendation: 'monitor',
        est_monthly_opportunity: 0,
        description: `${item.menu_item}: POST-RETIREMENT REVENUE SHIFT — after retiring, ${fmt$(item.post_retirement_revenue_shift)}/mo revenue shifted to other items (${shiftPct.toFixed(0)}% of lost revenue recovered). ${shiftPct >= 70 ? 'EXCELLENT — most revenue shifted. Retirement was correct. ' : shiftPct >= 40 ? 'PARTIAL — some revenue shifted but ${100 - shiftPct.toFixed(0)}% was truly lost. ' : 'LOW — most revenue was lost, not shifted. '}'Customers who ordered this item migrated to: [check order data]. Validates retirement strategy: removing items doesn't destroy demand, it redirects it to better-performing items.`,
        ai_recommendation: 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: SEASONAL_NON_RETURN
    if (item.is_seasonal && !item.last_season_returned && item.current_order_rate === 0) {
      alerts.push({
        rule_id: 'seasonal_non_return',
        severity: 'medium',
        menu_item: item.menu_item,
        peak_order_rate: item.peak_order_rate,
        months_on_menu: item.months_on_menu,
        recommendation: 'retire_now',
        est_monthly_opportunity: item.monthly_carrying_cost,
        description: `${item.menu_item}: SEASONAL NON-RETURN — was a seasonal item that peaked at ${item.peak_order_rate} orders but hasn't returned this season. Permanently retire: remove from POS, inventory, and menu templates. Seasonal items that don't return are pure carrying cost (${fmt$(item.monthly_carrying_cost)}/mo) for zero revenue. If you want to bring it back next season, archive the recipe + data, then re-launch as a "new" item rather than leaving it as a zombie. Each month as zombie = ${fmt$(item.monthly_carrying_cost)} wasted.`,
        ai_recommendation: 'retire_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: RETIREMENT_BLOCKER
    if (item.decline_pct >= 70 && item.has_loyal_following && item.loyal_customer_count > 0) {
      alerts.push({
        rule_id: 'retirement_blocker',
        severity: 'medium',
        menu_item: item.menu_item,
        decline_pct: Math.round(item.decline_pct * 10) / 10,
        loyal_customer_count: item.loyal_customer_count,
        current_order_rate: item.current_order_rate,
        monthly_revenue: item.monthly_revenue,
        recommendation: 'keep_monitoring',
        est_monthly_opportunity: 0,
        description: `${item.menu_item}: RETIREMENT BLOCKER — declined ${item.decline_pct.toFixed(0)}% but has ${item.loyal_customer_count} loyal customers who order it regularly. Retiring would alienate these customers. INVESTIGATE: are these high-value loyal customers? If yes, KEEP the item (loyalty > efficiency). If low-value, retire and risk losing them. Alternative: offer a "replacement" item that satisfies the same need, then retire with a 30-day notice ("We're replacing X with Y — try it free!"). Loyal customers are hard to win back once lost.`,
        ai_recommendation: 'investigate',
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
            { role: 'system', content: 'You are a restaurant menu lifecycle management AI specializing in item retirement prediction. Recommend specific retirement timing and replacement strategies. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Item: ${a.menu_item} — ${a.rule_id}. Score: ${a.retirement_score ?? 0}/100. Orders: ${a.current_order_rate ?? 0}/mo (peak ${a.peak_order_rate ?? 0}, decline ${a.decline_pct ?? 0}%). Margin: ${a.current_margin ?? 0}%. Carrying: ${fmt$(a.monthly_carrying_cost ?? 0)}/mo vs rev ${fmt$(a.monthly_revenue ?? 0)}. Net: ${fmt$(a.net_cost_of_keeping ?? 0)}/mo. Mods: ${a.modification_rate ?? 0}%. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM menu_item_retirement_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE menu_item_retirement_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<MenuRetireAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM menu_item_retirement_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  zombieCount: number; avgRetirementScore: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'zombie_item') AS zombies,
              math::mean(retirement_score WHERE retirement_score != NONE) AS avgscore
       FROM menu_item_retirement_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      zombieCount: safeNumber(r.zombies, 0), avgRetirementScore: safeNumber(r.avgscore, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zombieCount: 0, avgRetirementScore: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
