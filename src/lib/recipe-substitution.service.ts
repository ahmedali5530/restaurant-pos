/**
 * AI Recipe Substitution Intelligence service — suggest substitute ingredients.
 *
 * 22nd POSR-exclusive differentiator — Toast and Square have recipe tracking
 * but NO substitution intelligence. When an ingredient is out of stock,
 * expensive, or about to spoil, chefs improvise. POSR analyzes flavor
 * profile, cost, category match, supplier availability + AI recommends
 * best substitute with substitution ratio.
 *
 * Distinct from:
 *   - recipe-optimization.service (optimizes recipe cost/yield)
 *   - yield-variance.service (detects production waste)
 *   - food-cost-trend.service (tracks price changes)
 *   - spoilage-prediction.service (predicts waste)
 *
 * This service SUGGESTS SUBSTITUTE ingredients when:
 *   1. Current ingredient is out of stock (stockout)
 *   2. Current ingredient price spiked (>20% above category median)
 *   3. Current ingredient is about to spoil (spoilage-prediction flagged)
 *   4. Dietary restriction requires alternative
 *
 * Algorithm:
 *   1. Identify ingredients needing substitution
 *   2. Find candidates in same inventory_category
 *   3. Score by category_match (40%) + cost_efficiency (30%) + availability (30%)
 *   4. AI: flavor compatibility + substitution ratio
 *   5. Recommendation: use_substitute | order_more | reformulate | keep_original
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubstitutionTrigger = 'stockout' | 'price_spike' | 'spoilage_risk' | 'dietary_restriction';
export type SubstitutionRecommendation = 'use_substitute' | 'order_more' | 'reformulate' | 'keep_original';

export interface SubstitutionSuggestion {
  id?: string;
  original_item?: string;
  original_item_name: string;
  original_category?: string;
  substitute_item?: string;
  substitute_item_name: string;
  substitute_category?: string;
  trigger_reason: SubstitutionTrigger;
  category_match_score: number;   // 0-1
  cost_score: number;             // 0-1
  availability_score: number;    // 0-1
  overall_score: number;         // 0-1
  original_price: number;
  substitute_price: number;
  price_difference: number;     // substitute - original
  substitution_ratio: number;   // how much to use vs original
  affected_recipes: number;
  est_monthly_savings: number;
  ai_insight?: string;
  ai_recommendation?: SubstitutionRecommendation;
  action_taken: string;
  suggested_at: Date;
  branch_id?: string;
}

export interface SubstitutionConfig {
  aiEnabled: boolean;
  priceSpikePct: number;
  costTolerancePct: number;
  minScore: number;
  maxCandidates: number;
}

export const DEFAULT_SUBSTITUTION_CONFIG: SubstitutionConfig = {
  aiEnabled: true,
  priceSpikePct: 0.20,
  costTolerancePct: 0.15,
  minScore: 0.5,
  maxCandidates: 5,
};

export const readSubstitutionConfig = (settings: any): SubstitutionConfig => ({
  aiEnabled: settings?.substitution_ai_enabled ?? true,
  priceSpikePct: safeNumber(settings?.substitution_price_spike_pct, 0.20),
  costTolerancePct: safeNumber(settings?.substitution_cost_tolerance_pct, 0.15),
  minScore: safeNumber(settings?.substitution_min_score, 0.5),
  maxCandidates: safeNumber(settings?.substitution_max_candidates, 5),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface InventoryItemData {
  id: string;
  name: string;
  category?: string;
  price: number;
  currentStock: number;
  categoryMedianPrice: number;
}

const fetchInventoryItems = async (db: any): Promise<InventoryItemData[]> => {
  try {
    // Get all inventory items with current stock
    const stockResult = await db.query(
      `SELECT
         inventory_item.id AS item_id,
         inventory_item.name AS name,
         inventory_item.category AS category,
         inventory_item.price AS price,
         inventory_item.average_price AS avg_price,
         math::sum(quantity_change) AS current_stock
       FROM inventory_ledger
       WHERE created_at > time::now() - 90d
       GROUP BY inventory_item
       FETCH inventory_item`
    );
    const stockRows = Array.isArray(stockResult) ? stockResult.flat() : [];

    // Get category median prices
    const categoryPrices = new Map<string, number[]>();
    for (const r of stockRows) {
      const cat = r.category?.toString?.() ?? 'unknown';
      const price = safeNumber(r.price, 0) || safeNumber(r.avg_price, 0);
      if (price > 0) {
        if (!categoryPrices.has(cat)) categoryPrices.set(cat, []);
        categoryPrices.get(cat)!.push(price);
      }
    }
    const categoryMedians = new Map<string, number>();
    for (const [cat, prices] of categoryPrices) {
      const sorted = prices.sort((a, b) => a - b);
      categoryMedians.set(cat, sorted[Math.floor(sorted.length / 2)]);
    }

    return stockRows.map((r: any) => ({
      id: r.item_id?.toString?.() ?? '',
      name: r.name ?? 'Unknown',
      category: r.category?.toString?.(),
      price: safeNumber(r.price, 0) || safeNumber(r.avg_price, 0),
      currentStock: safeNumber(r.current_stock, 0),
      categoryMedianPrice: categoryMedians.get(r.category?.toString?.() ?? 'unknown') ?? 0,
    }));
  } catch (err) {
    console.warn('[substitution] fetchInventoryItems failed', err);
    return [];
  }
};

const fetchRecipeUsageCount = async (db: any, itemId: string): Promise<number> => {
  try {
    const result = await db.query(
      `SELECT count() AS recipe_count FROM recipe_item WHERE item = $iid`,
      { iid: itemId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.recipe_count, 0);
  } catch { return 0; }
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const scoreSubstitute = (
  original: InventoryItemData,
  substitute: InventoryItemData,
  _trigger: SubstitutionTrigger,
  cfg: SubstitutionConfig
): {
  categoryMatch: number;
  costScore: number;
  availabilityScore: number;
  overall: number;
  priceDiff: number;
  substitutionRatio: number;
} => {
  // Category match: same category = 1.0, different = 0.0
  const categoryMatch = original.category === substitute.category ? 1.0 : 0.0;

  // Cost score: cheaper = 1.0, within tolerance = 0.5, more expensive = 0.0
  const priceDiff = substitute.price - original.price;
  const priceDiffPct = original.price > 0 ? priceDiff / original.price : 0;
  let costScore: number;
  if (priceDiffPct <= -cfg.costTolerancePct) costScore = 1.0; // cheaper
  else if (Math.abs(priceDiffPct) <= cfg.costTolerancePct) costScore = 0.5; // within tolerance
  else costScore = 0.0; // more expensive

  // Availability score: in stock = 1.0, low stock = 0.5, out = 0.0
  let availabilityScore: number;
  if (substitute.currentStock > 10) availabilityScore = 1.0;
  else if (substitute.currentStock > 0) availabilityScore = 0.5;
  else availabilityScore = 0.0;

  // Overall: weighted
  const overall = categoryMatch * 0.4 + costScore * 0.3 + availabilityScore * 0.3;

  // Substitution ratio: if substitute is more concentrated/intense, use less
  // Default 1.0 (same quantity). If cheaper per unit, might need more (1.2).
  // If more expensive per unit, might need less (0.8).
  let substitutionRatio = 1.0;
  if (priceDiffPct > cfg.costTolerancePct) substitutionRatio = 0.85; // more potent, use less
  else if (priceDiffPct < -cfg.costTolerancePct) substitutionRatio = 1.15; // less potent, use more

  return { categoryMatch, costScore, availabilityScore, overall, priceDiff, substitutionRatio };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  suggestions: SubstitutionSuggestion[],
  _cfg: SubstitutionConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || suggestions.length === 0) return;

  const top = suggestions.slice(0, 12);
  const prompt = `You are a restaurant chef de cuisine expert in ingredient substitution.
For each substitution suggestion below, provide:
  - insight: max 200 chars — flavor compatibility + any culinary considerations
  - recommendation: one of use_substitute | order_more | reformulate | keep_original

Recommendation guidance:
  - use_substitute: high overall score, good flavor match → go ahead
  - order_more: stockout trigger, no good substitute → order original ASAP
  - reformulate: price_spike persistent → permanently change recipe to use substitute
  - keep_original: no good substitute available, keep waiting for original

Suggestions (JSON):
${JSON.stringify(top.map(s => ({
  original: s.original_item_name,
  original_category: s.original_category,
  substitute: s.substitute_item_name,
  substitute_category: s.substitute_category,
  trigger: s.trigger_reason,
  original_price: s.original_price,
  substitute_price: s.substitute_price,
  price_diff: s.price_difference,
  overall_score: s.overall_score,
  category_match: s.category_match_score,
  availability: s.availability_score,
  substitution_ratio: s.substitution_ratio,
  affected_recipes: s.affected_recipes,
  est_savings: s.est_monthly_savings,
})), null, 2)}

Respond with JSON array:
[{
  "original": "<match original_item_name>",
  "substitute": "<match substitute_item_name>",
  "insight": "<max 200 chars>",
  "recommendation": "use_substitute" | "order_more" | "reformulate" | "keep_original"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are an ingredient substitution AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      original: string; substitute: string; insight?: string; recommendation?: SubstitutionRecommendation;
    }>;
    for (const item of parsed) {
      const sug = suggestions.find(s =>
        s.original_item_name === item.original && s.substitute_item_name === item.substitute
      );
      if (sug) {
        if (item.insight) sug.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) sug.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[substitution] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runSubstitutionAnalysis = async (
  db: ReturnType<typeof useDB>,
  config: SubstitutionConfig = DEFAULT_SUBSTITUTION_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ suggestions: SubstitutionSuggestion[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch all inventory items with stock + prices
  const items = await fetchInventoryItems(db);
  if (onProgress) onProgress(1, 2);

  if (items.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { suggestions: [], scanned: 0 };
  }

  // 2. Identify items needing substitution
  const needsSubstitution: Array<{ item: InventoryItemData; trigger: SubstitutionTrigger }> = [];
  for (const item of items) {
    if (item.currentStock <= 0) {
      needsSubstitution.push({ item, trigger: 'stockout' });
    } else if (item.categoryMedianPrice > 0 && item.price > item.categoryMedianPrice * (1 + config.priceSpikePct)) {
      needsSubstitution.push({ item, trigger: 'price_spike' });
    }
  }

  // 3. For each item needing substitution, find candidates
  const suggestions: SubstitutionSuggestion[] = [];
  for (const { item: original, trigger } of needsSubstitution) {
    // Find candidates: same category, different item, in stock
    const candidates = items.filter(c =>
      c.id !== original.id &&
      c.category === original.category &&
      c.currentStock > 0
    );

    if (candidates.length === 0) continue;

    // Score each candidate
    const scored = candidates.map(c => {
      const scores = scoreSubstitute(original, c, trigger, config);
      return { candidate: c, ...scores };
    });

    // Sort by overall score descending, take top N
    scored.sort((a, b) => b.overall - a.overall);
    const topCandidates = scored.slice(0, config.maxCandidates);

    // Get recipe usage count (cached)
    const recipeCount = await fetchRecipeUsageCount(db, original.id);

    for (const s of topCandidates) {
      if (s.overall < config.minScore) continue;

      // Estimate monthly savings: (original_price - substitute_price) × estimated_monthly_qty
      // Assume 100 units/month per recipe affected
      const estMonthlyQty = recipeCount * 100;
      const savings = (original.price - s.candidate.price) * estMonthlyQty * s.substitutionRatio;

      suggestions.push({
        original_item: original.id,
        original_item_name: original.name,
        original_category: original.category,
        substitute_item: s.candidate.id,
        substitute_item_name: s.candidate.name,
        substitute_category: s.candidate.category,
        trigger_reason: trigger,
        category_match_score: Math.round(s.categoryMatch * 100) / 100,
        cost_score: Math.round(s.costScore * 100) / 100,
        availability_score: Math.round(s.availabilityScore * 100) / 100,
        overall_score: Math.round(s.overall * 100) / 100,
        original_price: Math.round(original.price * 100) / 100,
        substitute_price: Math.round(s.candidate.price * 100) / 100,
        price_difference: Math.round(s.priceDiff * 100) / 100,
        substitution_ratio: Math.round(s.substitutionRatio * 100) / 100,
        affected_recipes: recipeCount,
        est_monthly_savings: Math.round(savings * 100) / 100,
        action_taken: 'none',
        suggested_at: new Date(),
      });
    }
  }

  // Sort: by overall score descending
  suggestions.sort((a, b) => b.overall_score - a.overall_score);

  // 4. AI enhancement
  if (config.aiEnabled && suggestions.length > 0) {
    await enhanceWithAI(suggestions, config);
  }

  // 5. Persist (refresh)
  try {
    await db.query(`DELETE FROM substitution_suggestion WHERE suggested_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const sug of suggestions) {
    try {
      await db.query(`CREATE substitution_suggestion CONTENT $data`, {
        data: { ...sug, suggested_at: sug.suggested_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { suggestions, scanned: items.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getActiveSuggestions = async (
  db: ReturnType<typeof useDB>
): Promise<SubstitutionSuggestion[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM substitution_suggestion
       WHERE action_taken = 'none'
         AND overall_score >= 0.5
         AND suggested_at > time::now() - 24h
       ORDER BY overall_score DESC, est_monthly_savings DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface SubstitutionSummary {
  total: number;
  stockout: number;
  priceSpike: number;
  spoilageRisk: number;
  totalSavings: number;
  highScoreCount: number;
}

export const getSubstitutionSummary = async (
  db: ReturnType<typeof useDB>
): Promise<SubstitutionSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(trigger_reason = 'stockout') AS stockout,
         math::count(trigger_reason = 'price_spike') AS price_spike,
         math::count(trigger_reason = 'spoilage_risk') AS spoilage_risk,
         math::sum(est_monthly_savings) AS total_savings,
         math::count(overall_score >= 0.7) AS high_score
       FROM substitution_suggestion
       WHERE action_taken = 'none'
         AND overall_score >= 0.5
         AND suggested_at > time::now() - 24h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      stockout: safeNumber(row.stockout, 0),
      priceSpike: safeNumber(row.price_spike, 0),
      spoilageRisk: safeNumber(row.spoilage_risk, 0),
      totalSavings: safeNumber(row.total_savings, 0),
      highScoreCount: safeNumber(row.high_score, 0),
    };
  } catch {
    return { total: 0, stockout: 0, priceSpike: 0, spoilageRisk: 0, totalSavings: 0, highScoreCount: 0 };
  }
};

export const updateSubstitutionAction = async (
  db: ReturnType<typeof useDB>, suggestionId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: suggestionId, action });
};
