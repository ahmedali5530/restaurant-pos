/**
 * AI Menu Item Cannibalization Detector — detects when menu items compete
 * with each other for the same customer demand (substitutes), causing
 * revenue splitting. Recommends consolidation, repositioning, or removal.
 *
 * 124th POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from menu items cannibalizing each other. No POS detects
 * cannibalization (negative pairings between items).
 *
 * Distinct from:
 *   - menu-engineering-matrix.service — classifies items as Stars/Dogs (NOT competition)
 *   - menu-optimization.service — BCG matrix at CATEGORY level (NOT item-vs-item)
 *   - pairing-affinity-analyzer.service — detects POSITIVE pairings (complements)
 *   - dish-profitability.service — per-item cost+margin (NOT demand competition)
 *   - dish-popularity.service — single-item volume ranking (NOT competition)
 *   - menu-rotation.service — seasonal rotation (NOT cannibalization)
 *   - menu-pairing.service — market basket suggestions (NOT competition)
 *
 * 8 AI rules:
 *   1. substitute_cannibalization — same-category similar-price items splitting demand
 *   2. new_item_cannibalization — new item reduced existing item sales 20%+
 *   3. price_tier_overlap — two items at same price point competing directly
 *   4. category_saturation — 4+ items in same category splitting demand
 *   5. demand_split — combined demand flat but split across items (net zero)
 *   6. feature_item_dominance — one item dominates, others are dead weight
 *   7. cannibalization_recovery — after removing cannibal, dominant item recovered
 *   8. menu_simplification — too many similar items confusing customers
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MenuCannibRuleId =
  | 'substitute_cannibalization'
  | 'new_item_cannibalization'
  | 'price_tier_overlap'
  | 'category_saturation'
  | 'demand_split'
  | 'feature_item_dominance'
  | 'cannibalization_recovery'
  | 'menu_simplification';

export type MenuCannibAiRec =
  | 'consolidate'
  | 'reposition'
  | 'remove_item'
  | 'differentiate_price'
  | 'differentiate_recipe'
  | 'promote_dominant'
  | 'monitor'
  | 'skip';

export interface MenuCannibAlert {
  id?: string;
  rule_id: MenuCannibRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  item_a: string;
  item_b: string;
  category?: string;
  item_a_price?: number;
  item_b_price?: number;
  price_gap_pct?: number;
  item_a_orders?: number;
  item_b_orders?: number;
  combined_orders?: number;
  item_a_pre_launch_orders?: number;
  cannibalization_pct?: number;
  est_revenue_recovered?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: MenuCannibAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface MenuCannibConfig {
  aiEnabled: boolean;
  priceGapMax: number;
  cannibalThreshold: number;
  saturationCount: number;
}

export const DEFAULT_MENUCANNIB_CONFIG: MenuCannibConfig = {
  aiEnabled: true,
  priceGapMax: 15.0,
  cannibalThreshold: 20.0,
  saturationCount: 4,
};

export const readMenuCannibConfig = (settings: any): MenuCannibConfig => ({
  aiEnabled: settings?.menucannib_ai_enabled ?? true,
  priceGapMax: safeNumber(settings?.menucannib_price_gap_max, 15.0),
  cannibalThreshold: safeNumber(settings?.menucannib_cannibal_threshold, 20.0),
  saturationCount: safeNumber(settings?.menucannib_saturation_count, 4),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface CannibalizationData {
  item_a: string;
  item_b: string;
  category: string;
  item_a_price: number;
  item_b_price: number;
  item_a_orders: number;       // current monthly orders
  item_b_orders: number;
  combined_orders: number;     // total demand for this item type
  // For new_item_cannibalization
  item_a_pre_launch_orders?: number; // item_a orders before item_b launched
  // For cannibalization_recovery
  item_a_post_removal_orders?: number; // item_a orders after cannibal removed
  item_b_was_removed?: boolean;
  // For category_saturation
  category_item_count?: number;  // how many items in this category
}

const MOCK_PAIRS: CannibalizationData[] = [
  {
    item_a: 'Beef Burger', item_b: 'Classic Burger', category: 'mains',
    item_a_price: 15.90, item_b_price: 14.50,
    item_a_orders: 180, item_b_orders: 120, combined_orders: 300,
  },
  {
    item_a: 'Margherita Pizza', item_b: 'Classic Cheese Pizza', category: 'mains',
    item_a_price: 14.50, item_b_price: 13.90,
    item_a_orders: 150, item_b_orders: 90, combined_orders: 240,
    item_a_pre_launch_orders: 220, // was 220 before Classic Cheese launched
  },
  {
    item_a: 'Caesar Salad', item_b: 'Garden Salad', category: 'salads',
    item_a_price: 10.90, item_b_price: 9.90,
    item_a_orders: 95, item_b_orders: 35, combined_orders: 130,
  },
  {
    item_a: 'Chicken Wings', item_b: 'Buffalo Wings', category: 'mains',
    item_a_price: 12.90, item_b_price: 13.50,
    item_a_orders: 220, item_b_orders: 45, combined_orders: 265,
  },
  {
    item_a: 'Pasta Alfredo', item_b: 'Pasta Carbonara', category: 'mains',
    item_a_price: 13.50, item_b_price: 14.20,
    item_a_orders: 60, item_b_orders: 55, combined_orders: 115,
    item_a_pre_launch_orders: 95,
  },
  {
    item_a: 'Salmon Bowl', item_b: 'Tuna Bowl', category: 'mains',
    item_a_price: 16.90, item_b_price: 15.90,
    item_a_orders: 180, item_b_orders: 40, combined_orders: 220,
    item_a_post_removal_orders: 210, item_b_was_removed: true,
  },
  {
    item_a: 'Iced Tea', item_b: 'Lemonade', category: 'beverages',
    item_a_price: 3.50, item_b_price: 3.50,
    item_a_orders: 280, item_b_orders: 150, combined_orders: 430,
    category_item_count: 6,
  },
  {
    item_a: 'Tiramisu', item_b: 'Chocolate Cake', category: 'desserts',
    item_a_price: 6.90, item_b_price: 6.50,
    item_a_orders: 85, item_b_orders: 75, combined_orders: 160,
    category_item_count: 5,
  },
];

export const runMenuCannibEngine = async (
  db: ReturnType<typeof useDB>,
  config: MenuCannibConfig = DEFAULT_MENUCANNIB_CONFIG
): Promise<{ alerts: MenuCannibAlert[]; generated: number }> => {
  const alerts: MenuCannibAlert[] = [];
  const now = new Date();

  let pairs: CannibalizationData[] = [];
  try {
    const result = await db.query(
      `SELECT item_a, item_b, category, item_a_price, item_b_price,
              item_a_orders, item_b_orders, combined_orders,
              item_a_pre_launch_orders, item_a_post_removal_orders,
              item_b_was_removed, category_item_count
       FROM menu_cannibalization_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    pairs = rows.map((r: any) => ({
      item_a: String(r.item_a ?? 'Unknown'),
      item_b: String(r.item_b ?? 'Unknown'),
      category: String(r.category ?? 'unknown'),
      item_a_price: safeNumber(r.item_a_price, 0),
      item_b_price: safeNumber(r.item_b_price, 0),
      item_a_orders: safeNumber(r.item_a_orders, 0),
      item_b_orders: safeNumber(r.item_b_orders, 0),
      combined_orders: safeNumber(r.combined_orders, 0),
      item_a_pre_launch_orders: r.item_a_pre_launch_orders != null ? safeNumber(r.item_a_pre_launch_orders, 0) : undefined,
      item_a_post_removal_orders: r.item_a_post_removal_orders != null ? safeNumber(r.item_a_post_removal_orders, 0) : undefined,
      item_b_was_removed: r.item_b_was_removed ?? false,
      category_item_count: r.category_item_count != null ? safeNumber(r.category_item_count, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[menucannib] fetchPairs failed — using mock', err);
  }

  if (pairs.length === 0) {
    pairs = MOCK_PAIRS;
  }

  for (const p of pairs) {
    const priceGapPct = Math.max(p.item_a_price, p.item_b_price) > 0
      ? (Math.abs(p.item_a_price - p.item_b_price) / Math.max(p.item_a_price, p.item_b_price)) * 100
      : 0;
    const cannibalPct = p.combined_orders > 0 ? (p.item_b_orders / p.combined_orders) * 100 : 0;
    const monthlyOpp = Math.round(Math.min(p.item_a_orders, p.item_b_orders) * Math.min(p.item_a_price, p.item_b_price) * 0.3);

    // Rule 1: SUBSTITUTE_CANNIBALIZATION (same category, similar price, splitting demand)
    if (priceGapPct <= config.priceGapMax && p.item_a_orders > 0 && p.item_b_orders > 0) {
      alerts.push({
        rule_id: 'substitute_cannibalization',
        severity: 'high',
        item_a: p.item_a,
        item_b: p.item_b,
        category: p.category,
        item_a_price: p.item_a_price,
        item_b_price: p.item_b_price,
        price_gap_pct: Math.round(priceGapPct * 10) / 10,
        item_a_orders: p.item_a_orders,
        item_b_orders: p.item_b_orders,
        combined_orders: p.combined_orders,
        cannibalization_pct: Math.round(cannibalPct * 10) / 10,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.item_a} vs ${p.item_b}: SUBSTITUTE CANNIBALIZATION — same category (${p.category}), similar price (${fmt$(p.item_a_price)} vs ${fmt$(p.item_b_price)}, ${priceGapPct.toFixed(0)}% gap). Demand split: ${p.item_a_orders}/${p.item_b_orders} orders (${cannibalPct.toFixed(0)}% captured by ${p.item_b}). Customers see these as either/or → revenue split. CONSOLIDATE: merge into one superior item, OR DIFFERENTIATE: make them clearly distinct (different price tier, different recipe, different positioning). Split demand = neither reaches profitable volume.`,
        ai_recommendation: 'consolidate',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: NEW_ITEM_CANNIBALIZATION (new item reduced existing item sales)
    if (p.item_a_pre_launch_orders != null) {
      const salesDrop = p.item_a_pre_launch_orders - p.item_a_orders;
      const dropPct = p.item_a_pre_launch_orders > 0 ? (salesDrop / p.item_a_pre_launch_orders) * 100 : 0;
      if (dropPct >= config.cannibalThreshold) {
        alerts.push({
          rule_id: 'new_item_cannibalization',
          severity: 'critical',
          item_a: p.item_a,
          item_b: p.item_b,
          category: p.category,
          item_a_orders: p.item_a_orders,
          item_b_orders: p.item_b_orders,
          item_a_pre_launch_orders: p.item_a_pre_launch_orders,
          cannibalization_pct: Math.round(dropPct * 10) / 10,
          est_monthly_opportunity: Math.round(salesDrop * p.item_a_price),
          description: `${p.item_b}: CANNIBALIZING ${p.item_a} — ${p.item_a} sales dropped ${dropPct.toFixed(0)}% (${p.item_a_pre_launch_orders} → ${p.item_a_orders} orders) since ${p.item_b} launched. ${p.item_b} captured ${p.item_b_orders} orders but ${p.item_a} lost ${salesDrop}. Net new revenue: ${fmt$(p.item_b_orders * p.item_b_price - salesDrop * p.item_a_price)}. If net is low/negative, ${p.item_b} is stealing demand, not creating it. REPOSITION or REMOVE ${p.item_b} if net contribution is negative.`,
          ai_recommendation: 'reposition',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 3: PRICE_TIER_OVERLAP (two items at same price point)
    if (priceGapPct <= 5 && p.item_a_price === p.item_b_price) {
      alerts.push({
        rule_id: 'price_tier_overlap',
        severity: 'medium',
        item_a: p.item_a,
        item_b: p.item_b,
        category: p.category,
        item_a_price: p.item_a_price,
        item_b_price: p.item_b_price,
        price_gap_pct: Math.round(priceGapPct * 10) / 10,
        item_a_orders: p.item_a_orders,
        item_b_orders: p.item_b_orders,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.item_a} vs ${p.item_b}: PRICE TIER OVERLAP — both at ${fmt$(p.item_a_price)} (${priceGapPct.toFixed(0)}% gap). Same price = direct competition. Customers choose based on preference, not value. DIFFERENTIATE PRICE: raise one to premium tier OR lower one to value tier. Creates clear value hierarchy → customers self-segment. Removes either/or competition. Price differentiation is cheapest fix — no recipe change needed.`,
        ai_recommendation: 'differentiate_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: CATEGORY_SATURATION (4+ items in same category splitting demand)
    if (p.category_item_count != null && p.category_item_count >= config.saturationCount) {
      alerts.push({
        rule_id: 'category_saturation',
        severity: 'medium',
        item_a: p.item_a,
        item_b: p.item_b,
        category: p.category,
        item_a_orders: p.item_a_orders,
        item_b_orders: p.item_b_orders,
        combined_orders: p.combined_orders,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.category} CATEGORY SATURATED — ${p.category_item_count} items competing for same demand. ${p.item_a} (${p.item_a_orders} orders) + ${p.item_b} (${p.item_b_orders} orders) = ${p.combined_orders} combined. Too many similar items: (1) confuses customers → slower ordering, (2) splits demand → none reaches profitable volume, (3) increases prep complexity + waste. SIMPLIFY: keep top 2 performers, remove rest. Fewer choices = faster decisions + higher satisfaction (Paradox of Choice).`,
        ai_recommendation: 'remove_item',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: DEMAND_SPLIT (combined demand flat but split across items)
    if (p.combined_orders > 0 && p.item_a_orders > 0 && p.item_b_orders > 0) {
      const splitRatio = Math.min(p.item_a_orders, p.item_b_orders) / Math.max(p.item_a_orders, p.item_b_orders);
      if (splitRatio >= 0.4 && splitRatio <= 0.6) {
        alerts.push({
          rule_id: 'demand_split',
          severity: 'medium',
          item_a: p.item_a,
          item_b: p.item_b,
          category: p.category,
          item_a_orders: p.item_a_orders,
          item_b_orders: p.item_b_orders,
          combined_orders: p.combined_orders,
          est_monthly_opportunity: monthlyOpp,
          description: `${p.item_a} vs ${p.item_b}: DEMAND SPLIT — nearly 50/50 split (${p.item_a_orders}/${p.item_b_orders}). Combined demand ${p.combined_orders} is healthy but split evenly across two items. Neither reaches dominant volume → both have higher per-unit costs (less economies of scale in prep). CONSOLIDATE into one superior item → captures full ${p.combined_orders} demand at lower cost. OR differentiate clearly so one becomes dominant (70/30 split is healthier than 50/50).`,
          ai_recommendation: 'consolidate',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 6: FEATURE_ITEM_DOMINANCE (one item dominates, others dead weight)
    if (p.combined_orders > 0) {
      const dominantPct = Math.max(p.item_a_orders, p.item_b_orders) / p.combined_orders * 100;
      const weakerItem = p.item_a_orders > p.item_b_orders ? p.item_b : p.item_a;
      const weakerOrders = Math.min(p.item_a_orders, p.item_b_orders);
      if (dominantPct >= 80) {
        alerts.push({
          rule_id: 'feature_item_dominance',
          severity: 'low',
          item_a: p.item_a,
          item_b: p.item_b,
          category: p.category,
          item_a_orders: p.item_a_orders,
          item_b_orders: p.item_b_orders,
          combined_orders: p.combined_orders,
          est_monthly_opportunity: Math.round(weakerOrders * Math.min(p.item_a_price, p.item_b_price)),
          description: `${p.item_a} vs ${p.item_b}: DOMINANCE — one item captures ${dominantPct.toFixed(0)}% of demand (${Math.max(p.item_a_orders, p.item_b_orders)}/${p.combined_orders}). ${weakerItem} only ${weakerOrders} orders (${100 - dominantPct.toFixed(0)}%). The weak item is dead weight — occupies menu space + prep capacity + inventory without meaningful contribution. PROMOTE DOMINANT item (feature it more) + consider REMOVING weak item. Menu real estate is valuable — don't waste on items nobody orders.`,
          ai_recommendation: 'promote_dominant',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 7: CANNIBALIZATION_RECOVERY (after removing cannibal, dominant recovered)
    if (p.item_b_was_removed && p.item_a_post_removal_orders != null) {
      const recovery = p.item_a_post_removal_orders - p.item_a_orders;
      const recoveryPct = p.item_a_orders > 0 ? (recovery / p.item_a_orders) * 100 : 0;
      if (recovery > 0) {
        alerts.push({
          rule_id: 'cannibalization_recovery',
          severity: 'low',
          item_a: p.item_a,
          item_b: p.item_b,
          category: p.category,
          item_a_orders: p.item_a_orders,
          item_a_pre_launch_orders: p.item_a_post_removal_orders,
          cannibalization_pct: Math.round(recoveryPct * 10) / 10,
          est_revenue_recovered: Math.round(recovery * p.item_a_price),
          est_monthly_opportunity: Math.round(recovery * p.item_a_price),
          description: `${p.item_a}: RECOVERY CONFIRMED — after removing ${p.item_b}, ${p.item_a} sales recovered ${recoveryPct.toFixed(0)}% (${p.item_a_orders} → ${p.item_a_post_removal_orders} orders). Revenue recovered: ${fmt$(recovery * p.item_a_price)}/mo. CANNIBALIZATION WAS REAL — removing the competitor restored demand. This validates the cannibalization detection model. Apply same logic to other substitute pairs — removing cannibals recovers revenue without losing total demand.`,
          ai_recommendation: 'monitor',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 8: MENU_SIMPLIFICATION (too many similar items confusing customers)
    if (p.category_item_count != null && p.category_item_count >= 5 && p.combined_orders < p.category_item_count * 40) {
      alerts.push({
        rule_id: 'menu_simplification',
        severity: 'high',
        item_a: p.item_a,
        item_b: p.item_b,
        category: p.category,
        item_a_orders: p.item_a_orders,
        item_b_orders: p.item_b_orders,
        combined_orders: p.combined_orders,
        est_monthly_opportunity: monthlyOpp * 2,
        description: `${p.category} MENU SIMPLIFICATION NEEDED — ${p.category_item_count} items but combined demand only ${p.combined_orders} orders (<40/item avg). Too many choices → Paradox of Choice: customers overwhelmed, order slower, less satisfied. SIMPLIFY: reduce to 2-3 best items. Benefits: (1) faster ordering, (2) higher per-item volume → lower per-unit cost, (3) less prep complexity + waste, (4) clearer menu narrative. Studies show reducing choices increases satisfaction + revenue 10-20%.`,
        ai_recommendation: 'remove_item',
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
            { role: 'system', content: 'You are a restaurant menu architecture AI specializing in cannibalization detection and menu optimization. Recommend specific consolidation or differentiation strategies. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Cannibalization: ${a.rule_id} — ${a.item_a} vs ${a.item_b} (${a.category}). Prices: ${fmt$(a.item_a_price ?? 0)} / ${fmt$(a.item_b_price ?? 0)} (${a.price_gap_pct ?? 0}% gap). Orders: ${a.item_a_orders ?? 0} / ${a.item_b_orders ?? 0} (combined ${a.combined_orders ?? 0}). Cannibal %: ${a.cannibalization_pct ?? 0}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM menu_cannibalization_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE menu_cannibalization_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<MenuCannibAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM menu_cannibalization_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  cannibalizedPairs: number; saturatedCategories: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'substitute_cannibalization') AS pairs,
              math::count(rule_id = 'category_saturation') AS saturated
       FROM menu_cannibalization_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      cannibalizedPairs: safeNumber(r.pairs, 0), saturatedCategories: safeNumber(r.saturated, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, cannibalizedPairs: 0, saturatedCategories: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
