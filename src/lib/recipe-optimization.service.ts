/**
 * AI Recipe Cost Optimization service — per-dish cost breakdown + margin analysis.
 *
 * Research finding: Toast Recipe Engineering $40+/mo (higher tier), Square
 * Recipe Costing in Plus. POSR offers it free — analyzes each dish's recipe
 * cost breakdown (ingredient costs), computes food cost %, margin, + AI
 * recommendations (substitute/reportion/reprice/redesign/keep).
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type RecipeGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type RecipeRecommendation = 'substitute' | 'reportion' | 'reprice' | 'redesign' | 'keep';

export interface RecipeCostAnalysis {
  id?: string;
  dish_id: string;
  dish_name: string;
  dish_price: number;
  total_recipe_cost: number;
  food_cost_pct: number;
  margin_pct: number;
  margin_amount: number;
  ingredient_count: number;
  top_cost_ingredients?: Array<{ name: string; cost: number; pct_of_total: number }>;
  grade: RecipeGrade;
  ai_recommendation?: RecipeRecommendation;
  ai_insight?: string;
  potential_savings?: number;
  generated_at: Date;
}

export interface RecipeConfig {
  aiEnabled: boolean;
  targetFoodCostPct: number;
  criticalFoodCostPct: number;
}

export const DEFAULT_RECIPE_CONFIG: RecipeConfig = {
  aiEnabled: true,
  targetFoodCostPct: 30,
  criticalFoodCostPct: 40,
};

export const readRecipeConfig = (settings: any): RecipeConfig => ({
  aiEnabled: settings?.recipe_ai_enabled ?? true,
  targetFoodCostPct: safeNumber(settings?.recipe_target_food_cost_pct, 30),
  criticalFoodCostPct: safeNumber(settings?.recipe_critical_food_cost_pct, 40),
});

// ---------------------------------------------------------------------------
// Data collection — fetch dishes with their recipe items
// ---------------------------------------------------------------------------

interface DishRecipeData {
  dish_id: string;
  dish_name: string;
  dish_price: number;
  ingredients: Array<{ item_id: string; item_name: string; cost: number; quantity: number }>;
  total_cost: number;
}

const collectDishRecipes = async (
  db: ReturnType<typeof useDB>
): Promise<DishRecipeData[]> => {
  const dishes: DishRecipeData[] = [];

  try {
    // Fetch dishes with their recipe items
    const result = await db.query(
      `SELECT
         id,
         name,
         price,
         items
       FROM dish
       WHERE deleted_at IS NONE AND price > 0
       FETCH items, items.item`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const dish of rows) {
      const dishId = dish.id?.toString?.() ?? '';
      if (!dishId) continue;
      const dishPrice = safeNumber(dish.price, 0);
      const recipeItems = Array.isArray(dish.items) ? dish.items : [];

      const ingredients = recipeItems.map((ri: any) => ({
        item_id: ri?.item?.id?.toString?.() ?? '',
        item_name: ri?.item?.name ?? 'Unknown',
        cost: safeNumber(ri?.cost, 0),
        quantity: safeNumber(ri?.quantity, 0),
      }));

      const totalCost = ingredients.reduce((s, i) => s + (i.cost * i.quantity), 0);

      if (ingredients.length === 0 || totalCost <= 0) continue;

      dishes.push({
        dish_id: dishId,
        dish_name: dish.name ?? 'Unknown',
        dish_price: dishPrice,
        ingredients,
        total_cost: totalCost,
      });
    }
  } catch (err) {
    console.error('[recipe-opt] collectDishRecipes failed', err);
  }

  return dishes;
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

const computeGrade = (foodCostPct: number, targetPct: number, criticalPct: number): RecipeGrade => {
  if (foodCostPct < targetPct * 0.8) return 'A'; // well below target
  if (foodCostPct < targetPct) return 'B';
  if (foodCostPct < criticalPct) return 'C';
  if (foodCostPct < criticalPct * 1.1) return 'D';
  return 'F';
};

const determineRecommendation = (
  grade: RecipeGrade,
  foodCostPct: number,
  targetPct: number,
  topIngredientPct: number
): RecipeRecommendation => {
  if (grade === 'A' || grade === 'B') return 'keep';
  if (foodCostPct > targetPct * 1.5) {
    // Way above target — need major changes
    if (topIngredientPct > 0.5) return 'substitute'; // one ingredient dominates cost
    return 'redesign'; // many ingredients contribute, need to rethink
  }
  if (topIngredientPct > 0.4) return 'substitute'; // one ingredient is 40%+ of cost
  if (foodCostPct > targetPct * 1.2) return 'reprice'; // close, just need to raise price
  return 'reportion'; // reduce portion sizes slightly
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  analyses: RecipeCostAnalysis[],
  config: RecipeConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[recipe-opt] OpenAI not available — using rule-based');
    return;
  }

  // Top 20 dishes by food cost % (worst performers)
  const worst = [...analyses]
    .filter(a => a.grade === 'C' || a.grade === 'D' || a.grade === 'F')
    .sort((a, b) => b.food_cost_pct - a.food_cost_pct)
    .slice(0, 20);

  if (worst.length === 0) return;

  const prompt = `You are a restaurant recipe cost optimization expert.
Analyze these dish cost breakdowns and provide optimization recommendations.

Target food cost: ${config.targetFoodCostPct}%
Critical food cost: ${config.criticalFoodCostPct}%

Dishes needing attention (JSON):
${JSON.stringify(worst.map(a => ({
  dish: a.dish_name,
  price: a.dish_price,
  recipe_cost: a.total_recipe_cost,
  food_cost_pct: a.food_cost_pct + '%',
  margin: a.margin_pct + '%',
  grade: a.grade,
  top_ingredients: a.top_cost_ingredients ?? [],
  current_rec: a.ai_recommendation,
})), null, 2)}

Respond with JSON array:
[{
  "dish": "<match dish name>",
  "insight": "<max 200 chars — what's driving the cost + specific optimization>",
  "action": "substitute" | "reportion" | "reprice" | "redesign" | "keep",
  "potential_monthly_savings": <number>
}]

Focus on: which ingredient to substitute, by how much to reprice, or how to redesign.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant recipe optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      dish: string;
      insight?: string;
      action?: RecipeRecommendation;
      potential_monthly_savings?: number;
    }>;

    for (const item of parsed) {
      const analysis = analyses.find(a => a.dish_name === item.dish);
      if (!analysis) continue;
      if (item.insight) analysis.ai_insight = item.insight.slice(0, 200);
      if (item.action && ['substitute', 'reportion', 'reprice', 'redesign', 'keep'].includes(item.action)) {
        analysis.ai_recommendation = item.action;
      }
      if (item.potential_monthly_savings) {
        analysis.potential_savings = Math.round(item.potential_monthly_savings * 100) / 100;
      }
    }
  } catch (err) {
    console.warn('[recipe-opt] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export interface AnalyzeRecipeResult {
  analyses: RecipeCostAnalysis[];
  totalDishes: number;
  avgFoodCostPct: number;
  totalPotentialSavings: number;
  gradeCounts: Record<RecipeGrade, number>;
}

export const analyzeRecipeCosts = async (
  db: ReturnType<typeof useDB>,
  config: RecipeConfig = DEFAULT_RECIPE_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<AnalyzeRecipeResult> => {
  if (onProgress) onProgress(0, 3);

  const dishRecipes = await collectDishRecipes(db);
  if (onProgress) onProgress(1, 3);

  const analyses: RecipeCostAnalysis[] = dishRecipes.map(data => {
    const recipeCost = data.total_cost;
    const dishPrice = data.dish_price;
    const foodCostPct = dishPrice > 0 ? (recipeCost / dishPrice) * 100 : 0;
    const marginPct = 100 - foodCostPct;
    const marginAmount = dishPrice - recipeCost;

    // Top cost ingredients (sorted by cost × quantity, as % of total)
    const ingredientCosts = data.ingredients
      .map(i => ({ name: i.item_name, cost: i.cost * i.quantity, pct_of_total: 0 }))
      .sort((a, b) => b.cost - a.cost);
    ingredientCosts.forEach(ic => { ic.pct_of_total = recipeCost > 0 ? ic.cost / recipeCost : 0; });

    const topIngredients = ingredientCosts.slice(0, 5);
    const topIngredientPct = topIngredients[0]?.pct_of_total ?? 0;

    const grade = computeGrade(foodCostPct, config.targetFoodCostPct, config.criticalFoodCostPct);
    const recommendation = determineRecommendation(grade, foodCostPct, config.targetFoodCostPct, topIngredientPct);

    return {
      dish_id: data.dish_id,
      dish_name: data.dish_name,
      dish_price: Math.round(dishPrice * 100) / 100,
      total_recipe_cost: Math.round(recipeCost * 100) / 100,
      food_cost_pct: Math.round(foodCostPct * 10) / 10,
      margin_pct: Math.round(marginPct * 10) / 10,
      margin_amount: Math.round(marginAmount * 100) / 100,
      ingredient_count: data.ingredients.length,
      top_cost_ingredients: topIngredients.map(ti => ({
        name: ti.name,
        cost: Math.round(ti.cost * 100) / 100,
        pct_of_total: Math.round(ti.pct_of_total * 100),
      })),
      grade,
      ai_recommendation: recommendation,
      generated_at: new Date(),
    };
  });

  // Sort by food_cost_pct descending (worst performers first)
  analyses.sort((a, b) => b.food_cost_pct - a.food_cost_pct);
  if (onProgress) onProgress(2, 3);

  // AI enhancement
  if (config.aiEnabled && analyses.length > 0) {
    await enhanceWithAI(analyses, config);
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE recipe_cost_analysis SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const analysis of analyses) {
      try {
        await db.query(`CREATE recipe_cost_analysis CONTENT $data`, {
          data: {
            ...analysis,
            generated_at: analysis.generated_at.toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch {
        // Non-fatal
      }
    }
  } catch (err) {
    console.warn('[recipe-opt] persist failed', err);
  }

  // Summary
  const gradeCounts: Record<RecipeGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const a of analyses) gradeCounts[a.grade]++;
  const avgFoodCostPct = analyses.length > 0
    ? analyses.reduce((s, a) => s + a.food_cost_pct, 0) / analyses.length
    : 0;
  const totalPotentialSavings = analyses.reduce((s, a) => s + (a.potential_savings ?? 0), 0);

  return {
    analyses,
    totalDishes: analyses.length,
    avgFoodCostPct: Math.round(avgFoodCostPct * 10) / 10,
    totalPotentialSavings: Math.round(totalPotentialSavings * 100) / 100,
    gradeCounts,
  };
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getRecipeAnalyses = async (
  db: ReturnType<typeof useDB>
): Promise<RecipeCostAnalysis[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM recipe_cost_analysis
       WHERE expires_at > time::now()
       ORDER BY food_cost_pct DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[recipe-opt] getRecipeAnalyses failed', err);
    return [];
  }
};
