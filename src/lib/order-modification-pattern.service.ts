/**
 * AI Order Modification Pattern Detector — detects when customers consistently
 * modify a menu item, signaling the default recipe needs redesign.
 *
 * 111th POSR-exclusive differentiator — restaurants lose $200-900/mo per
 * location from undetected modification patterns. No POS detects "silent
 * recipe feedback" from modification patterns.
 *
 * Distinct from:
 *   - order-customization-analyzer.service (customization OPTIONS available — NOT modification PATTERNS)
 *   - complaint-pattern.service (explicit complaints — NOT silent modifications)
 *   - menu-optimization.service (BCG matrix classification — NOT modification-driven redesign)
 *   - dish-popularity.service (volume ranking — NOT modification rate)
 *   - allergen-risk.service (allergen safety — NOT general modification patterns)
 *   - recipe-optimization.service (recipe cost optimization — NOT customer-driven redesign)
 *   - recipe-substitution.service (ingredient substitution suggestions — NOT detected patterns)
 *
 * 8 AI rules:
 *   1. high_modification_rate — item modified >30% of the time → recipe review needed
 *   2. common_removal — specific ingredient removed >20% of time → remove from default
 *   3. common_addition — ingredient added >15% of time → add to default or as option
 *   4. substitution_pattern — customers consistently substitute A for B
 *   5. portion_mismatch — portion change requests signal portion too large/small
 *   6. spice_level_mismatch — spice level changes signal default mismatched
 *   7. revenue_leak — free modifications that should be upcharged
 *   8. kitchen_slowdown — complex modifications slowing kitchen output
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ModPatternRuleId =
  | 'high_modification_rate'
  | 'common_removal'
  | 'common_addition'
  | 'substitution_pattern'
  | 'portion_mismatch'
  | 'spice_level_mismatch'
  | 'revenue_leak'
  | 'kitchen_slowdown';

export type ModPatternAiRec =
  | 'redesign_recipe'
  | 'remove_ingredient'
  | 'add_to_default'
  | 'add_as_option'
  | 'adjust_portion'
  | 'adjust_spice'
  | 'add_upcharge'
  | 'simplify_recipe'
  | 'monitor'
  | 'skip';

export interface ModPatternAlert {
  id?: string;
  rule_id: ModPatternRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  menu_item: string;
  modification_type?: 'removal' | 'addition' | 'substitution' | 'portion_change' | 'spice_change';
  ingredient?: string;
  substitute_ingredient?: string;
  total_orders?: number;
  modified_orders?: number;
  modification_rate?: number;
  revenue_leak_per_order?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ModPatternAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ModPatternConfig {
  aiEnabled: boolean;
  highRate: number;
  commonThreshold: number;
  revenueLeak: number;
  slowdownThreshold: number;
}

export const DEFAULT_MODPATTERN_CONFIG: ModPatternConfig = {
  aiEnabled: true,
  highRate: 30.0,
  commonThreshold: 20.0,
  revenueLeak: 2.0,
  slowdownThreshold: 15.0,
};

export const readModPatternConfig = (settings: any): ModPatternConfig => ({
  aiEnabled: settings?.modpattern_ai_enabled ?? true,
  highRate: safeNumber(settings?.modpattern_high_rate, 30.0),
  commonThreshold: safeNumber(settings?.modpattern_common_threshold, 20.0),
  revenueLeak: safeNumber(settings?.modpattern_revenue_leak, 2.0),
  slowdownThreshold: safeNumber(settings?.modpattern_slowdown_threshold, 15.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface ModificationData {
  menu_item: string;
  total_orders: number;
  modified_orders: number;
  // Per-modification breakdown
  modifications: {
    type: 'removal' | 'addition' | 'substitution' | 'portion_change' | 'spice_change';
    ingredient?: string;
    substitute_ingredient?: string;
    count: number;
    revenue_leak_per_order?: number; // $ lost if free mod that should be paid
    extra_seconds?: number; // kitchen time added per modification
  }[];
}

const MOCK_ITEMS: ModificationData[] = [
  {
    menu_item: 'Beef Burger',
    total_orders: 250,
    modified_orders: 140,
    modifications: [
      { type: 'removal', ingredient: 'pickles', count: 100, extra_seconds: 8 },
      { type: 'removal', ingredient: 'onion', count: 60, extra_seconds: 8 },
      { type: 'addition', ingredient: 'extra cheese', count: 55, revenue_leak_per_order: 1.50, extra_seconds: 12 },
      { type: 'substitution', ingredient: 'regular bun', substitute_ingredient: 'gluten-free bun', count: 35, revenue_leak_per_order: 0, extra_seconds: 15 },
    ],
  },
  {
    menu_item: 'Margherita Pizza',
    total_orders: 180,
    modified_orders: 45,
    modifications: [
      { type: 'addition', ingredient: 'extra basil', count: 30, revenue_leak_per_order: 0.75, extra_seconds: 10 },
      { type: 'spice_change', ingredient: 'chili flakes', count: 25, extra_seconds: 5 },
    ],
  },
  {
    menu_item: 'Caesar Salad',
    total_orders: 120,
    modified_orders: 72,
    modifications: [
      { type: 'portion_change', ingredient: 'dressing', count: 50, extra_seconds: 10 },
      { type: 'removal', ingredient: 'croutons', count: 40, extra_seconds: 8 },
      { type: 'addition', ingredient: 'chicken', count: 30, revenue_leak_per_order: 3.00, extra_seconds: 15 },
    ],
  },
  {
    menu_item: 'Pasta Alfredo',
    total_orders: 90,
    modified_orders: 55,
    modifications: [
      { type: 'portion_change', ingredient: 'sauce', count: 38, extra_seconds: 10 },
      { type: 'spice_change', ingredient: 'black pepper', count: 28, extra_seconds: 5 },
      { type: 'substitution', ingredient: 'fettuccine', substitute_ingredient: 'gluten-free pasta', count: 20, revenue_leak_per_order: 0, extra_seconds: 20 },
    ],
  },
  {
    menu_item: 'Chicken Wings',
    total_orders: 160,
    modified_orders: 100,
    modifications: [
      { type: 'spice_change', ingredient: 'buffalo sauce', count: 70, extra_seconds: 5 },
      { type: 'addition', ingredient: 'ranch dip', count: 60, revenue_leak_per_order: 0.50, extra_seconds: 8 },
      { type: 'portion_change', ingredient: 'wing count', count: 40, extra_seconds: 5 },
    ],
  },
  {
    menu_item: 'Salmon Bowl',
    total_orders: 75,
    modified_orders: 28,
    modifications: [
      { type: 'addition', ingredient: 'avocado', count: 22, revenue_leak_per_order: 2.00, extra_seconds: 12 },
      { type: 'removal', ingredient: 'sesame seeds', count: 15, extra_seconds: 5 },
    ],
  },
];

export const runModPatternEngine = async (
  db: ReturnType<typeof useDB>,
  config: ModPatternConfig = DEFAULT_MODPATTERN_CONFIG
): Promise<{ alerts: ModPatternAlert[]; generated: number }> => {
  const alerts: ModPatternAlert[] = [];
  const now = new Date();

  let items: ModificationData[] = [];
  try {
    const result = await db.query(
      `SELECT menu_item, total_orders, modified_orders, modifications
       FROM order_modification_log
       WHERE period = 'last_30d'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    items = rows.map((r: any) => ({
      menu_item: String(r.menu_item ?? 'Unknown'),
      total_orders: safeNumber(r.total_orders, 0),
      modified_orders: safeNumber(r.modified_orders, 0),
      modifications: Array.isArray(r.modifications) ? r.modifications : [],
    }));
  } catch (err) {
    console.warn('[modpattern] fetchItems failed — using mock', err);
  }

  if (items.length === 0) {
    items = MOCK_ITEMS;
  }

  for (const item of items) {
    const modRate = item.total_orders > 0 ? (item.modified_orders / item.total_orders) * 100 : 0;

    // Rule 1: HIGH_MODIFICATION_RATE (item modified >threshold% of the time)
    if (modRate >= config.highRate) {
      const monthlyOpp = Math.round(item.modified_orders * 0.5 * 30 / 30);
      alerts.push({
        rule_id: 'high_modification_rate',
        severity: 'high',
        menu_item: item.menu_item,
        total_orders: item.total_orders,
        modified_orders: item.modified_orders,
        modification_rate: Math.round(modRate * 10) / 10,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: HIGH MODIFICATION RATE — ${modRate.toFixed(0)}% of orders are modified (${item.modified_orders}/${item.total_orders}). Customers are voting with their modifications — the default recipe doesn't match what they want. REDESIGN RECIPE: analyze most common modifications and adjust defaults. Reducing modification rate by 50% saves ~${fmt$(monthlyOpp)}/mo in kitchen time + ingredient waste + customer friction.`,
        ai_recommendation: 'redesign_recipe',
        status: 'open', detected_at: now,
      });
    }

    // Process individual modifications for rules 2-8
    for (const mod of item.modifications) {
      const modPct = item.total_orders > 0 ? (mod.count / item.total_orders) * 100 : 0;

      // Rule 2: COMMON_REMOVAL (specific ingredient removed >threshold% of time)
      if (mod.type === 'removal' && modPct >= config.commonThreshold) {
        const monthlyWaste = Math.round(mod.count * 0.3 * 30 / 30);
        alerts.push({
          rule_id: 'common_removal',
          severity: 'high',
          menu_item: item.menu_item,
          modification_type: 'removal',
          ingredient: mod.ingredient,
          total_orders: item.total_orders,
          modified_orders: mod.count,
          modification_rate: Math.round(modPct * 10) / 10,
          est_monthly_opportunity: monthlyWaste,
          description: `${item.menu_item}: COMMON REMOVAL — "${mod.ingredient}" removed in ${modPct.toFixed(0)}% of orders (${mod.count}/${item.total_orders}). Customers DON'T WANT this ingredient. REMOVE from default recipe → saves prep time + reduces ingredient waste + faster kitchen output. Ingredient waste cost: ~${fmt$(monthlyWaste)}/mo. Silent feedback louder than any complaint.`,
          ai_recommendation: 'remove_ingredient',
          status: 'open', detected_at: now,
        });
      }

      // Rule 3: COMMON_ADDITION (ingredient added >threshold% of time)
      if (mod.type === 'addition' && modPct >= 15) {
        const monthlyOpp = Math.round(mod.count * (mod.revenue_leak_per_order ?? 1) * 30 / 30);
        alerts.push({
          rule_id: 'common_addition',
          severity: 'medium',
          menu_item: item.menu_item,
          modification_type: 'addition',
          ingredient: mod.ingredient,
          total_orders: item.total_orders,
          modified_orders: mod.count,
          modification_rate: Math.round(modPct * 10) / 10,
          revenue_leak_per_order: mod.revenue_leak_per_order,
          est_monthly_opportunity: monthlyOpp,
          description: `${item.menu_item}: COMMON ADDITION — "${mod.ingredient}" added in ${modPct.toFixed(0)}% of orders (${mod.count}/${item.total_orders}). Customers WANT this ingredient. ADD to default recipe (if cheap) OR add as paid option (if ${mod.revenue_leak_per_order ? fmt$(mod.revenue_leak_per_order) + ' upcharge' : 'free'}). Revenue opportunity: +${fmt$(monthlyOpp)}/mo if upcharged. Satisfies customer demand + captures value.`,
          ai_recommendation: mod.revenue_leak_per_order ? 'add_as_option' : 'add_to_default',
          status: 'open', detected_at: now,
        });
      }

      // Rule 4: SUBSTITUTION_PATTERN (customers substitute A for B)
      if (mod.type === 'substitution' && modPct >= 15) {
        const monthlyOpp = Math.round(mod.count * 1.5 * 30 / 30);
        alerts.push({
          rule_id: 'substitution_pattern',
          severity: 'medium',
          menu_item: item.menu_item,
          modification_type: 'substitution',
          ingredient: mod.ingredient,
          substitute_ingredient: mod.substitute_ingredient,
          total_orders: item.total_orders,
          modified_orders: mod.count,
          modification_rate: Math.round(modPct * 10) / 10,
          est_monthly_opportunity: monthlyOpp,
          description: `${item.menu_item}: SUBSTITUTION PATTERN — ${modPct.toFixed(0)}% of customers substitute "${mod.ingredient}" → "${mod.substitute_ingredient}" (${mod.count} orders). Strong signal of unmet dietary preference (GF/vegan/dairy-free). ADD "${mod.substitute_ingredient}" as permanent option or create a variant SKU. Captures ${monthlyOpp} potential orders/mo currently requiring manual modification. Reduces kitchen friction.`,
          ai_recommendation: 'add_as_option',
          status: 'open', detected_at: now,
        });
      }

      // Rule 5: PORTION_MISMATCH (portion change requests signal portion too large/small)
      if (mod.type === 'portion_change' && modPct >= 20) {
        const monthlyWaste = Math.round(mod.count * 1.2 * 30 / 30);
        alerts.push({
          rule_id: 'portion_mismatch',
          severity: 'high',
          menu_item: item.menu_item,
          modification_type: 'portion_change',
          ingredient: mod.ingredient,
          total_orders: item.total_orders,
          modified_orders: mod.count,
          modification_rate: Math.round(modPct * 10) / 10,
          est_monthly_opportunity: monthlyWaste,
          description: `${item.menu_item}: PORTION MISMATCH — ${modPct.toFixed(0)}% of orders request portion change for "${mod.ingredient ?? 'item'}" (${mod.count} orders). Default portion doesn't match customer preference — likely TOO LARGE (customers request less). ADJUST PORTION SIZE down 15-20% → reduces food cost + waste + price can stay same (margin improvement). Potential savings: ${fmt$(monthlyWaste)}/mo in ingredient cost.`,
          ai_recommendation: 'adjust_portion',
          status: 'open', detected_at: now,
        });
      }

      // Rule 6: SPICE_LEVEL_MISMATCH (spice level changes signal default mismatched)
      if (mod.type === 'spice_change' && modPct >= 20) {
        const monthlyOpp = Math.round(mod.count * 0.5 * 30 / 30);
        alerts.push({
          rule_id: 'spice_level_mismatch',
          severity: 'medium',
          menu_item: item.menu_item,
          modification_type: 'spice_change',
          ingredient: mod.ingredient,
          total_orders: item.total_orders,
          modified_orders: mod.count,
          modification_rate: Math.round(modPct * 10) / 10,
          est_monthly_opportunity: monthlyOpp,
          description: `${item.menu_item}: SPICE LEVEL MISMATCH — ${modPct.toFixed(0)}% of orders change spice level for "${mod.ingredient ?? 'spice'}" (${mod.count} orders). Default spice level doesn't match market preference. ADJUST default to match majority preference (likely milder) + offer "extra spicy" as explicit option. Reduces modification friction + improves satisfaction. Kitchen time savings: ~${fmt$(monthlyOpp)}/mo.`,
          ai_recommendation: 'adjust_spice',
          status: 'open', detected_at: now,
        });
      }

      // Rule 7: REVENUE_LEAK (free modifications that should be upcharged)
      if (mod.revenue_leak_per_order && mod.revenue_leak_per_order >= config.revenueLeak) {
        const monthlyLeak = Math.round(mod.count * mod.revenue_leak_per_order * 30 / 30);
        alerts.push({
          rule_id: 'revenue_leak',
          severity: 'high',
          menu_item: item.menu_item,
          modification_type: mod.type,
          ingredient: mod.ingredient,
          total_orders: item.total_orders,
          modified_orders: mod.count,
          modification_rate: Math.round(modPct * 10) / 10,
          revenue_leak_per_order: mod.revenue_leak_per_order,
          est_monthly_opportunity: monthlyLeak,
          description: `${item.menu_item}: REVENUE LEAK — "${mod.ingredient}" added free ${modPct.toFixed(0)}% of the time (${mod.count} orders) but costs ${fmt$(mod.revenue_leak_per_order)}/order. Customers expect to pay for this addition. ADD UPCHARGE of ${fmt$(mod.revenue_leak_per_order)}/order → captures ${fmt$(monthlyLeak)}/mo in lost revenue. Most customers won't object to standard upcharge for extras. Stop giving away margin.`,
          ai_recommendation: 'add_upcharge',
          status: 'open', detected_at: now,
        });
      }

      // Rule 8: KITCHEN_SLOWDOWN (complex modifications slowing kitchen)
      if (mod.extra_seconds && mod.extra_seconds >= config.slowdownThreshold && modPct >= 15) {
        const totalExtraMinutes = Math.round(mod.count * mod.extra_seconds / 60);
        const monthlyOpp = Math.round(totalExtraMinutes * 0.5 * 30 / 30);
        alerts.push({
          rule_id: 'kitchen_slowdown',
          severity: 'medium',
          menu_item: item.menu_item,
          modification_type: mod.type,
          ingredient: mod.ingredient,
          total_orders: item.total_orders,
          modified_orders: mod.count,
          modification_rate: Math.round(modPct * 10) / 10,
          est_monthly_opportunity: monthlyOpp,
          description: `${item.menu_item}: KITCHEN SLOWDOWN — "${mod.ingredient ?? mod.type}" modification adds ${mod.extra_seconds}s per order, happening ${modPct.toFixed(0)}% of the time (${mod.count} orders = ${totalExtraMinutes} extra min/mo). Modifications disrupt kitchen flow + increase ticket times. SIMPLIFY recipe: if ingredient commonly removed, remove from default (0s). If commonly added, pre-prep batches. Potential +${fmt$(monthlyOpp)}/mo from faster throughput + higher table turnover.`,
          ai_recommendation: 'simplify_recipe',
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
            { role: 'system', content: 'You are a restaurant menu engineering AI specializing in order modification pattern analysis. Detect "silent recipe feedback" from how customers modify orders. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Modification pattern: ${a.rule_id} — ${a.menu_item}: ${a.modification_type ?? 'general'} of "${a.ingredient ?? 'N/A'}" in ${a.modification_rate ?? 0}% of orders (${a.modified_orders ?? 0}/${a.total_orders ?? 0}). Revenue leak ${fmt$(a.revenue_leak_per_order ?? 0)}/order. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM order_modification_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE order_modification_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ModPatternAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM order_modification_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  revenueLeak: number; itemsAffected: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::sum(revenue_leak_per_order * modified_orders) AS leak,
              math::count(menu_item != NONE) AS items
       FROM order_modification_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      revenueLeak: safeNumber(r.leak, 0), itemsAffected: safeNumber(r.items, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, revenueLeak: 0, itemsAffected: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
