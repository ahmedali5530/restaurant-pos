/**
 * AI Recipe Scaling Optimizer — scale recipes with culinary science.
 *
 * 59th POSR-exclusive differentiator — recipe scaling is NOT linear (CIA
 * Culinary Institute research). Spices, salt, leavening, liquids scale
 * sub-linearly; garnish scales super-linearly; heat is constant. 20-30% of
 * catering orders have portion miscalculations (CaterSource).
 *
 * Distinct from:
 *   - recipe-optimization.service (per-dish cost breakdown — NOT scaling)
 *   - yield-variance.service (production waste detection — NOT scaling math)
 *   - catering-optimizer.service (bulk pricing + menu mix — NOT ingredient scaling)
 *   - recipe-substitution.service (ingredient substitution — NOT scaling)
 *   - menu-optimization.service (BCG matrix — NOT scaling)
 *
 * Scales recipes from base servings to target servings using culinary science:
 *   - Spices: sub-linear (factor^0.85 — bitterness compounds)
 *   - Salt: sub-linear (factor^0.9)
 *   - Leavening: sub-linear (factor^0.75)
 *   - Liquids: sub-linear (factor^0.95 — evaporation constant)
 *   - Garnish: super-linear (factor^1.1 — more visible)
 *   - Cooking time: sub-linear (factor^0.6 — thicker batch)
 *   - Main ingredients: linear (factor^1.0)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type RecipeScaleRuleId =
  | 'bulk_scaling'
  | 'spice_adjustment'
  | 'liquid_adjustment'
  | 'cooking_time'
  | 'cost_per_portion';

export type RecipeScaleAiRec =
  | 'use_scaled_recipe'
  | 'verify_with_chef'
  | 'batch_split'
  | 'adjust_equipment'
  | 'monitor';

export interface RecipeScaling {
  id?: string;
  rule_id: RecipeScaleRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recipe_id?: string;
  recipe_name?: string;
  base_servings: number;
  target_servings: number;
  scale_factor: number;
  adjusted_ingredients?: string;
  total_cost: number;
  cost_per_portion: number;
  est_waste_pct: number;
  cooking_time_minutes?: number;
  equipment_needed?: string;
  est_savings: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: RecipeScaleAiRec;
  status: 'open' | 'applied' | 'adjusted' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface RecipeScaleConfig {
  aiEnabled: boolean;
  defaultTarget: number;
  bulkDiscountThreshold: number;
  wasteBenchmarkPct: number;
}

export const DEFAULT_RECIPE_SCALE_CONFIG: RecipeScaleConfig = {
  aiEnabled: true,
  defaultTarget: 50,
  bulkDiscountThreshold: 25,
  wasteBenchmarkPct: 0.08,
};

export const readRecipeScaleConfig = (settings: any): RecipeScaleConfig => ({
  aiEnabled: settings?.recipe_scale_ai_enabled ?? true,
  defaultTarget: safeNumber(settings?.recipe_scale_default_target, 50),
  bulkDiscountThreshold: safeNumber(settings?.recipe_scale_bulk_discount_threshold, 25),
  wasteBenchmarkPct: safeNumber(settings?.recipe_scale_waste_benchmark_pct, 0.08),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Ingredient scaling factors based on CIA Culinary Institute research
// Key: ingredient keyword → scaling exponent (1.0 = linear, <1 = sub-linear, >1 = super-linear)
const INGREDIENT_SCALING_RULES: Array<{ keywords: string[]; exponent: number; category: string }> = [
  // Spices — sub-linear (bitterness compounds at scale)
  { keywords: ['pepper', 'paprika', 'cumin', 'curry', 'chili', 'cayenne', 'oregano', 'thyme', 'rosemary', 'basil', 'sage'], exponent: 0.85, category: 'spice' },
  // Salt — sub-linear
  { keywords: ['salt', 'soy sauce', 'fish sauce', 'bouillon'], exponent: 0.90, category: 'salt' },
  // Leavening — sub-linear (baking)
  { keywords: ['baking soda', 'baking powder', 'yeast'], exponent: 0.75, category: 'leavening' },
  // Liquids — sub-linear (evaporation is constant)
  { keywords: ['water', 'stock', 'broth', 'milk', 'cream', 'wine', 'juice'], exponent: 0.95, category: 'liquid' },
  // Garnish — super-linear (more visible at scale)
  { keywords: ['garnish', 'parsley', 'cilantro', 'chive', 'lemon wedge', 'lime wedge'], exponent: 1.10, category: 'garnish' },
];

const getScalingExponent = (ingredientName: string): { exponent: number; category: string } => {
  const name = ingredientName.toLowerCase();
  for (const rule of INGREDIENT_SCALING_RULES) {
    if (rule.keywords.some(kw => name.includes(kw))) {
      return { exponent: rule.exponent, category: rule.category };
    }
  }
  return { exponent: 1.0, category: 'main' }; // linear for main ingredients
};

// Equipment suggestions based on total volume
const suggestEquipment = (totalLiters: number): string[] => {
  const equipment: string[] = [];
  if (totalLiters < 5) {
    equipment.push('Standard stock pot (8qt)');
  } else if (totalLiters < 15) {
    equipment.push('Large stock pot (20qt)');
    equipment.push('Half sheet pans × 2');
  } else if (totalLiters < 30) {
    equipment.push('Extra-large stock pot (40qt)');
    equipment.push('Full sheet pans × 4');
    equipment.push('Commercial mixer recommended');
  } else {
    equipment.push('Tilt skillet (60qt+)');
    equipment.push('Full sheet pans × 8');
    equipment.push('Commercial mixer required');
    equipment.push('Consider splitting into 2 batches');
  }
  return equipment;
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface RecipeIngredient {
  name: string;
  base_qty: number;
  unit: string;
  cost_per_unit: number;
}

interface RecipeData {
  id: string;
  name: string;
  base_servings: number;
  ingredients: RecipeIngredient[];
  cooking_time_minutes: number;
}

/**
 * Run the recipe scaling optimizer engine.
 * Fetches recipes, scales them to target servings, generates adjustments.
 */
export const runRecipeScaleEngine = async (
  db: ReturnType<typeof useDB>,
  config: RecipeScaleConfig = DEFAULT_RECIPE_SCALE_CONFIG
): Promise<{ scalings: RecipeScaling[]; generated: number }> => {
  const scalings: RecipeScaling[] = [];
  const now = new Date();

  // 1. Fetch recipes with ingredients
  let recipes: RecipeData[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         name,
         serving_size AS base_servings,
         prep_time AS cooking_time_minutes,
         items AS recipe_items
       FROM menu_item
       WHERE deleted_at IS NONE
         AND items IS NOT NONE
       LIMIT 20`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Fetch ingredient details from menu_item_recipe
    for (const r of rows) {
      try {
        const ingResult = await db.query(
          `SELECT
             item.name AS name,
             quantity AS base_qty,
             item.unit AS unit,
             item.cost AS cost_per_unit
           FROM menu_item_recipe
           WHERE menu_item = $recipeId
           LIMIT 20`,
          { recipeId: String(r.id) }
        );
        const ingRows = Array.isArray(ingResult) ? ingResult.flat() : [];
        const ingredients: RecipeIngredient[] = ingRows.map((ir: any) => ({
          name: String(ir.name ?? 'Unknown'),
          base_qty: safeNumber(ir.base_qty, 0),
          unit: String(ir.unit ?? 'g'),
          cost_per_unit: safeNumber(ir.cost_per_unit, 0),
        })).filter(i => i.base_qty > 0);

        if (ingredients.length > 0) {
          recipes.push({
            id: String(r.id ?? ''),
            name: String(r.name ?? 'Unknown Recipe'),
            base_servings: safeNumber(r.base_servings, 1),
            ingredients,
            cooking_time_minutes: safeNumber(r.cooking_time_minutes, 30),
          });
        }
      } catch { /* skip recipe if ingredients fail */ }
    }
  } catch (err) {
    console.warn('[recipe-scale] fetchRecipes failed', err);
  }

  if (recipes.length === 0) return { scalings: [], generated: 0 };

  // 2. Scale each recipe to target servings
  const targetServings = config.defaultTarget;

  for (const recipe of recipes) {
    if (recipe.base_servings <= 0) continue;
    const scaleFactor = targetServings / recipe.base_servings;

    // Skip if scale factor is too small (< 2x) or too large (> 200x)
    if (scaleFactor < 2 || scaleFactor > 200) continue;

    // Scale each ingredient with appropriate exponent
    const adjustedIngredients = recipe.ingredients.map(ing => {
      const { exponent, category } = getScalingExponent(ing.name);
      const adjustedFactor = Math.pow(scaleFactor, exponent);
      const scaledQty = ing.base_qty * adjustedFactor;
      const adjustedCost = scaledQty * ing.cost_per_unit;
      return {
        name: ing.name,
        base_qty: Math.round(ing.base_qty * 100) / 100,
        scaled_qty: Math.round(scaledQty * 100) / 100,
        adjustment_factor: Math.round(adjustedFactor * 100) / 100,
        linear_factor: Math.round(scaleFactor * 100) / 100,
        category,
        unit: ing.unit,
        cost: Math.round(adjustedCost * 100) / 100,
      };
    });

    // Calculate total cost
    const totalCost = adjustedIngredients.reduce((s, i) => s + i.cost, 0);
    const costPerPortion = totalCost / targetServings;

    // Estimate waste (larger batches have slightly more waste)
    const estWastePct = Math.min(0.15, config.wasteBenchmarkPct + (scaleFactor > 20 ? 0.03 : 0));

    // Adjusted cooking time (sub-linear: thicker batch cooks differently)
    const adjustedCookingTime = Math.round(recipe.cooking_time_minutes * Math.pow(scaleFactor, 0.6));

    // Estimate total volume for equipment suggestion (assume 1 unit ≈ 1ml for liquids)
    const totalVolume = adjustedIngredients
      .filter(i => ['liquid', 'main'].includes(i.category))
      .reduce((s, i) => s + i.scaled_qty, 0) / 1000; // convert ml to liters

    const equipment = suggestEquipment(totalVolume);

    // Calculate savings from bulk (bulk ingredient pricing ~5% cheaper)
    const isBulk = targetServings >= config.bulkDiscountThreshold;
    const bulkSavings = isBulk ? totalCost * 0.05 : 0;
    const adjustedTotalCost = totalCost - bulkSavings;

    // Determine primary rule based on what changed most
    const spiceAdjustments = adjustedIngredients.filter(i => i.category === 'spice' && i.adjustment_factor !== i.linear_factor);
    const liquidAdjustments = adjustedIngredients.filter(i => i.category === 'liquid' && i.adjustment_factor !== i.linear_factor);
    const hasCookingTimeChange = adjustedCookingTime !== recipe.cooking_time_minutes * scaleFactor;

    let ruleId: RecipeScaleRuleId;
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let aiRec: RecipeScaleAiRec;
    let desc = '';

    if (spiceAdjustments.length >= 2 && scaleFactor > 10) {
      ruleId = 'spice_adjustment';
      severity = 'high';
      aiRec = 'verify_with_chef';
      const exampleSpice = spiceAdjustments[0];
      desc = `${recipe.name}: ${targetServings} servings (×${scaleFactor.toFixed(1)}) — spices scaled sub-linearly (${exampleSpice.name}: ${exampleSpice.base_qty}→${exampleSpice.scaled_qty}${exampleSpice.unit}, factor ${exampleSpice.adjustment_factor} vs linear ${exampleSpice.linear_factor}) to prevent bitterness`;
    } else if (liquidAdjustments.length >= 2 && scaleFactor > 10) {
      ruleId = 'liquid_adjustment';
      severity = 'medium';
      aiRec = 'use_scaled_recipe';
      const exampleLiquid = liquidAdjustments[0];
      desc = `${recipe.name}: ${targetServings} servings — liquids scaled sub-linearly (${exampleLiquid.name}: factor ${exampleLiquid.adjustment_factor} vs ${exampleLiquid.linear_factor}) to account for constant evaporation`;
    } else if (hasCookingTimeChange && scaleFactor > 5) {
      ruleId = 'cooking_time';
      severity = 'medium';
      aiRec = 'adjust_equipment';
      desc = `${recipe.name}: cooking time adjusted to ${adjustedCookingTime}min (linear would be ${Math.round(recipe.cooking_time_minutes * scaleFactor)}min) — thicker batch cooks differently`;
    } else if (isBulk) {
      ruleId = 'bulk_scaling';
      severity = 'low';
      aiRec = 'use_scaled_recipe';
      desc = `${recipe.name}: bulk scaled to ${targetServings} servings — ${fmt$(bulkSavings)} bulk ingredient savings, cost ${fmt$(costPerPortion)}/portion`;
    } else {
      ruleId = 'cost_per_portion';
      severity = 'low';
      aiRec = 'monitor';
      desc = `${recipe.name}: scaled to ${targetServings} servings — cost ${fmt$(costPerPortion)}/portion, total ${fmt$(adjustedTotalCost)}`;
    }

    scalings.push({
      rule_id: ruleId,
      severity,
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      base_servings: recipe.base_servings,
      target_servings: targetServings,
      scale_factor: Math.round(scaleFactor * 100) / 100,
      adjusted_ingredients: JSON.stringify(adjustedIngredients),
      total_cost: Math.round(adjustedTotalCost * 100) / 100,
      cost_per_portion: Math.round(costPerPortion * 100) / 100,
      est_waste_pct: Math.round(estWastePct * 10000) / 10000,
      cooking_time_minutes: adjustedCookingTime,
      equipment_needed: JSON.stringify(equipment),
      est_savings: Math.round(bulkSavings * 100) / 100,
      description: desc,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 3. AI insight for top 5 high-priority scalings
  if (config.aiEnabled && scalings.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topScalings = scalings
        .filter(s => s.severity === 'high' || s.severity === 'medium')
        .slice(0, 5);
      for (const s of topScalings) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a culinary scaling AI for restaurants. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Recipe "${s.recipe_name}": scaling ${s.base_servings}→${s.target_servings} servings (×${s.scale_factor}). Cost ${fmt$(s.total_cost)} (${fmt$(s.cost_per_portion)}/portion). Waste ${(s.est_waste_pct * 100).toFixed(0)}%. Cooking time ${s.cooking_time_minutes}min. Rule: ${s.rule_id}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          s.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM recipe_scaling WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const s of scalings) {
    try {
      await db.query(`CREATE recipe_scaling CONTENT $data`, {
        data: { ...s, detected_at: s.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { scalings, generated: scalings.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveScalings = async (db: ReturnType<typeof useDB>): Promise<RecipeScaling[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM recipe_scaling
       WHERE status = 'open'
       ORDER BY target_servings DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  recipeCount: number;
  totalServings: number;
  totalCost: number;
  totalSavings: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(target_servings) AS servings,
         math::sum(total_cost) AS cost,
         math::sum(est_savings) AS savings
       FROM recipe_scaling
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      recipeCount: safeNumber(r.total, 0),
      totalServings: safeNumber(r.servings, 0),
      totalCost: safeNumber(r.cost, 0),
      totalSavings: safeNumber(r.savings, 0),
    };
  } catch {
    return { recipeCount: 0, totalServings: 0, totalCost: 0, totalSavings: 0 };
  }
};

export const updateScalingStatus = async (
  db: ReturnType<typeof useDB>,
  scalingId: string,
  status: 'applied' | 'adjusted' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: scalingId, status });
};
