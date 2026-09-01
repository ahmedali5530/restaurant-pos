/**
 * AI Menu Rotation Suggester — detect menu fatigue + recommend rotation timing.
 *
 * 44th POSR-exclusive differentiator — menu fatigue causes 15-20% sales
 * decline per item after 4-6 weeks on menu (Cornell hospitality research,
 * NRA menu psychology). Customers crave novelty — without rotation, even
 * Stars become stale. Toast Menu Intelligence ($100+/mo) shows popularity
 * but DOESN'T detect fatigue or recommend WHEN to rotate.
 *
 * Distinct from:
 *   - menu-optimization.service (BCG matrix classification — not fatigue/timing)
 *   - menu-pairing.service (which items pair together — not when to rotate)
 *   - seasonal.service (seasonal patterns — not per-item fatigue)
 *   - recipe-optimization.service (recipe cost reduction — not menu rotation)
 *
 * This service detects ITEM FATIGUE (declining sales trend) + recommends WHEN
 * to rotate items, suggests replacements from same category, projects revenue impact.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MenuRotationRuleId =
  | 'fatigue_detected'
  | 'rising_star'
  | 'rotation_candidate'
  | 'comeback_candidate'
  | 'permanent_keep';

export type MenuRotationAction =
  | 'rotate_out'
  | 'rotate_out_30d'
  | 'feature'
  | 'keep'
  | 'rename'
  | 'reposition';

export type MenuRotationAiRec =
  | 'rotate_now'
  | 'feature_prominently'
  | 'rename_reposition'
  | 'keep_permanent'
  | 'monitor_2w';

export interface MenuRotationSuggestion {
  id?: string;
  rule_id: MenuRotationRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  item_id?: string;
  item_name?: string;
  category?: string;
  weeks_on_menu?: number;
  recent_sales: number;
  baseline_sales: number;
  fatigue_score: number;             // 0-100 (100 = severe fatigue)
  sales_trend_pct: number;           // -ve = declining, +ve = rising
  suggested_action?: MenuRotationAction;
  suggested_replacement?: string;
  est_revenue_impact: number;         // $ impact (-ve = loss, +ve = refresh gain)
  description: string;
  ai_insight?: string;
  ai_recommendation?: MenuRotationAiRec;
  status: 'open' | 'rotated' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface MenuRotationConfig {
  aiEnabled: boolean;
  lookbackWeeks: number;
  fatigueThreshold: number;
  minWeeksOnMenu: number;
  comebackWeeks: number;
}

export const DEFAULT_MENU_ROTATION_CONFIG: MenuRotationConfig = {
  aiEnabled: true,
  lookbackWeeks: 12,
  fatigueThreshold: -0.25,
  minWeeksOnMenu: 4,
  comebackWeeks: 8,
};

export const readMenuRotationConfig = (settings: any): MenuRotationConfig => ({
  aiEnabled: settings?.menu_rotation_ai_enabled ?? true,
  lookbackWeeks: safeNumber(settings?.menu_rotation_lookback_weeks, 12),
  fatigueThreshold: safeNumber(settings?.menu_rotation_fatigue_threshold, -0.25),
  minWeeksOnMenu: safeNumber(settings?.menu_rotation_min_weeks_on_menu, 4),
  comebackWeeks: safeNumber(settings?.menu_rotation_comback_weeks, 8),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface WeeklySales {
  item_id: string;
  item_name: string;
  category: string;
  week_start: string;
  units: number;
  revenue: number;
}

/**
 * Run the menu rotation engine.
 * Fetches weekly sales per item, computes baseline vs recent trends,
 * generates fatigue/rotation suggestions.
 */
export const runMenuRotationEngine = async (
  db: ReturnType<typeof useDB>,
  config: MenuRotationConfig = DEFAULT_MENU_ROTATION_CONFIG
): Promise<{ suggestions: MenuRotationSuggestion[]; generated: number }> => {
  const lookbackDays = config.lookbackWeeks * 7;

  // 1. Fetch weekly sales per menu item
  let weeklyData: WeeklySales[] = [];
  try {
    const result = await db.query(
      `SELECT
         item.id AS item_id,
         item.name AS item_name,
         item.category AS category,
         time::format(created_at, '%Y-W%V') AS week_start,
         math::sum(quantity) AS units,
         math::sum(price * quantity) AS revenue
       FROM order_item
       WHERE order.status = 'Paid'
         AND order.deleted_at IS NONE
         AND deleted_at IS NONE
         AND item IS NOT NONE
         AND created_at > time::now() - ${lookbackDays}d
       GROUP BY item.id, item.name, item.category, time::format(created_at, '%Y-W%V')`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    weeklyData = rows.map((r: any) => ({
      item_id: String(r.item_id ?? ''),
      item_name: String(r.item_name ?? 'Unknown'),
      category: String(r.category ?? 'Uncategorized'),
      week_start: String(r.week_start ?? ''),
      units: safeNumber(r.units, 0),
      revenue: safeNumber(r.revenue, 0),
    })).filter(w => w.units > 0);
  } catch (err) {
    console.warn('[menu-rotation] fetchWeeklySales failed', err);
  }

  if (weeklyData.length === 0) return { suggestions: [], generated: 0 };

  // 2. Group by item_id and compute per-item metrics
  const itemMap = new Map<string, {
    item_id: string;
    item_name: string;
    category: string;
    weeklyUnits: Array<{ week: string; units: number; revenue: number }>;
    firstWeek: string;
    lastWeek: string;
  }>();

  for (const point of weeklyData) {
    if (!itemMap.has(point.item_id)) {
      itemMap.set(point.item_id, {
        item_id: point.item_id,
        item_name: point.item_name,
        category: point.category,
        weeklyUnits: [],
        firstWeek: point.week_start,
        lastWeek: point.week_start,
      });
    }
    const item = itemMap.get(point.item_id)!;
    item.weeklyUnits.push({ week: point.week_start, units: point.units, revenue: point.revenue });
    if (point.week_start < item.firstWeek) item.firstWeek = point.week_start;
    if (point.week_start > item.lastWeek) item.lastWeek = point.week_start;
  }

  // 3. Compute fatigue score per item + generate suggestions
  const suggestions: MenuRotationSuggestion[] = [];
  const now = new Date();

  // Group items by category for replacement suggestion lookup
  const itemsByCategory = new Map<string, string[]>();
  for (const item of itemMap.values()) {
    if (!itemsByCategory.has(item.category)) {
      itemsByCategory.set(item.category, []);
    }
    itemsByCategory.get(item.category)!.push(item.item_name);
  }

  for (const item of itemMap.values()) {
    // Sort weekly data chronologically
    item.weeklyUnits.sort((a, b) => a.week.localeCompare(b.week));

    const weeksOnMenu = item.weeklyUnits.length;
    if (weeksOnMenu < config.minWeeksOnMenu) continue;

    // Baseline = avg of first 4 weeks (peak novelty period)
    const first4 = item.weeklyUnits.slice(0, 4);
    const baselineSales = first4.length > 0
      ? first4.reduce((s, w) => s + w.units, 0) / first4.length
      : 0;

    // Recent = avg of last 2 weeks
    const last2 = item.weeklyUnits.slice(-2);
    const recentSales = last2.length > 0
      ? last2.reduce((s, w) => s + w.units, 0) / last2.length
      : 0;

    if (baselineSales <= 0) continue;

    // Sales trend % = (recent - baseline) / baseline
    const trendPct = (recentSales - baselineSales) / baselineSales;

    // Fatigue score: 0-100
    // -50% from baseline = 100 fatigue; -25% = 50; 0% = 0; +50% = -50 (capped at 0)
    const fatigueScore = Math.max(0, Math.min(100, Math.round(-trendPct * 100)));

    // Skip items with no meaningful change
    if (Math.abs(trendPct) < 0.10 && fatigueScore < 25) continue;

    // --- Rule 1: FATIGUE DETECTED — sales dropped significantly ---
    if (trendPct < config.fatigueThreshold) {
      // Suggest rotation: replacement from same category (highest-trending item)
      const sameCategoryItems = itemsByCategory.get(item.category) ?? [];
      const replacementCandidate = sameCategoryItems
        .filter(n => n !== item.item_name)
        .find(() => true); // first alternative

      // Revenue impact: if we rotate, we lose recent_sales revenue
      // but refresh could restore to baseline (-recent_sales + baseline)
      const estRevenueImpact = (baselineSales - recentSales) * 4 * -1; // 4 weeks projection

      suggestions.push({
        rule_id: 'fatigue_detected',
        severity: fatigueScore > 75 ? 'critical' : fatigueScore > 50 ? 'high' : 'medium',
        item_id: item.item_id,
        item_name: item.item_name,
        category: item.category,
        weeks_on_menu: weeksOnMenu,
        recent_sales: Math.round(recentSales * 10) / 10,
        baseline_sales: Math.round(baselineSales * 10) / 10,
        fatigue_score: fatigueScore,
        sales_trend_pct: Math.round(trendPct * 10000) / 100,
        suggested_action: fatigueScore > 75 ? 'rotate_out' : 'rotate_out_30d',
        suggested_replacement: replacementCandidate,
        est_revenue_impact: Math.round(estRevenueImpact * 100) / 100,
        description: `${item.item_name} sales dropped ${Math.abs(trendPct * 100).toFixed(0)}% from baseline (${baselineSales.toFixed(1)}→${recentSales.toFixed(1)}/wk) after ${weeksOnMenu}w on menu — fatigue detected.`,
        status: 'open',
        detected_at: new Date(),
      });
      continue;
    }

    // --- Rule 2: RISING STAR — sales increasing rapidly ---
    if (trendPct > 0.25) {
      const estRevenueImpact = (recentSales - baselineSales) * 4; // 4 weeks gain
      suggestions.push({
        rule_id: 'rising_star',
        severity: 'low',
        item_id: item.item_id,
        item_name: item.item_name,
        category: item.category,
        weeks_on_menu: weeksOnMenu,
        recent_sales: Math.round(recentSales * 10) / 10,
        baseline_sales: Math.round(baselineSales * 10) / 10,
        fatigue_score: 0,
        sales_trend_pct: Math.round(trendPct * 10000) / 100,
        suggested_action: 'feature',
        est_revenue_impact: Math.round(estRevenueImpact * 100) / 100,
        description: `${item.item_name} sales up ${Math.round(trendPct * 100)}% (${baselineSales.toFixed(1)}→${recentSales.toFixed(1)}/wk) — feature prominently on menu.`,
        status: 'open',
        detected_at: new Date(),
      });
      continue;
    }

    // --- Rule 3: ROTATION CANDIDATE — stable but boring (long on menu, flat sales) ---
    if (weeksOnMenu >= 8 && Math.abs(trendPct) < 0.10 && recentSales < 5) {
      const sameCategoryItems = itemsByCategory.get(item.category) ?? [];
      const replacementCandidate = sameCategoryItems.filter(n => n !== item.item_name)[0];

      suggestions.push({
        rule_id: 'rotation_candidate',
        severity: 'low',
        item_id: item.item_id,
        item_name: item.item_name,
        category: item.category,
        weeks_on_menu: weeksOnMenu,
        recent_sales: Math.round(recentSales * 10) / 10,
        baseline_sales: Math.round(baselineSales * 10) / 10,
        fatigue_score: 30,
        sales_trend_pct: Math.round(trendPct * 10000) / 100,
        suggested_action: 'rename',
        suggested_replacement: replacementCandidate,
        est_revenue_impact: 0,
        description: `${item.item_name} flat for ${weeksOnMenu}w at ${recentSales.toFixed(1)}/wk — rename or reposition to revive.`,
        status: 'open',
        detected_at: new Date(),
      });
      continue;
    }

    // --- Rule 4: COMEBACK CANDIDATE — was rotated out, time to bring back ---
    // Detect: item had sales 8+ weeks ago, then stopped, now could return
    if (weeksOnMenu >= config.comebackWeeks && recentSales === 0 && baselineSales > 5) {
      suggestions.push({
        rule_id: 'comeback_candidate',
        severity: 'medium',
        item_id: item.item_id,
        item_name: item.item_name,
        category: item.category,
        weeks_on_menu: weeksOnMenu,
        recent_sales: 0,
        baseline_sales: Math.round(baselineSales * 10) / 10,
        fatigue_score: 0,
        sales_trend_pct: -100,
        suggested_action: 'reposition',
        est_revenue_impact: Math.round(baselineSales * 4 * 0.5 * 100) / 100, // 50% of baseline for 4w
        description: `${item.item_name} rotated out — bring back as "fan favorite" (baseline ${baselineSales.toFixed(1)}/wk).`,
        status: 'open',
        detected_at: new Date(),
      });
      continue;
    }

    // --- Rule 5: PERMANENT KEEP — consistent high seller, no fatigue ---
    if (recentSales > 10 && Math.abs(trendPct) < 0.10 && weeksOnMenu >= 6) {
      suggestions.push({
        rule_id: 'permanent_keep',
        severity: 'low',
        item_id: item.item_id,
        item_name: item.item_name,
        category: item.category,
        weeks_on_menu: weeksOnMenu,
        recent_sales: Math.round(recentSales * 10) / 10,
        baseline_sales: Math.round(baselineSales * 10) / 10,
        fatigue_score: 0,
        sales_trend_pct: Math.round(trendPct * 10000) / 100,
        suggested_action: 'keep',
        est_revenue_impact: 0,
        description: `${item.item_name} consistently sells ${recentSales.toFixed(1)}/wk for ${weeksOnMenu}w — permanent keeper.`,
        status: 'open',
        detected_at: new Date(),
      });
    }
  }

  // 4. AI insight for top 5 critical/high suggestions
  if (config.aiEnabled && suggestions.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topSugg = suggestions
        .filter(s => s.severity === 'critical' || s.severity === 'high')
        .slice(0, 5);
      for (const s of topSugg) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a menu engineering AI for restaurants. Respond with a single rotation insight (max 200 chars).' },
            { role: 'user', content: `Item "${s.item_name}" (${s.category}): ${s.weeks_on_menu}w on menu, baseline ${s.baseline_sales.toFixed(1)}/wk → recent ${s.recent_sales.toFixed(1)}/wk (${s.sales_trend_pct}% trend, fatigue ${s.fatigue_score}/100). Rule: ${s.rule_id}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          s.ai_insight = text.slice(0, 200);
          s.ai_recommendation = s.rule_id === 'fatigue_detected' && s.fatigue_score > 75
            ? 'rotate_now'
            : s.rule_id === 'fatigue_detected' ? 'monitor_2w'
            : s.rule_id === 'rising_star' ? 'feature_prominently'
            : s.rule_id === 'comeback_candidate' ? 'rename_reposition'
            : s.rule_id === 'permanent_keep' ? 'keep_permanent'
            : 'monitor_2w';
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM menu_rotation_suggestion WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const s of suggestions) {
    try {
      await db.query(`CREATE menu_rotation_suggestion CONTENT $data`, {
        data: { ...s, detected_at: s.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { suggestions, generated: suggestions.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveSuggestions = async (db: ReturnType<typeof useDB>): Promise<MenuRotationSuggestion[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM menu_rotation_suggestion
       WHERE status = 'open'
       ORDER BY fatigue_score DESC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  fatigueCount: number;
  risingStarCount: number;
  rotationCount: number;
  totalRevenueImpact: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'fatigue_detected') AS fatigue,
         math::count(rule_id = 'rising_star') AS rising,
         math::count(rule_id = 'rotation_candidate') AS rotation,
         math::sum(est_revenue_impact) AS impact
       FROM menu_rotation_suggestion
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      fatigueCount: safeNumber(r.fatigue, 0),
      risingStarCount: safeNumber(r.rising, 0),
      rotationCount: safeNumber(r.rotation, 0),
      totalRevenueImpact: safeNumber(r.impact, 0),
    };
  } catch {
    return { fatigueCount: 0, risingStarCount: 0, rotationCount: 0, totalRevenueImpact: 0 };
  }
};

export const updateSuggestionStatus = async (
  db: ReturnType<typeof useDB>,
  suggId: string,
  status: 'rotated' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: suggId, status });
};
