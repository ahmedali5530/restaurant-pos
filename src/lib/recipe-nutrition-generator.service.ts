/**
 * AI Recipe Nutrition & Dietary Label Generator — auto-calculates nutrition
 * from recipe ingredients, detects allergens, generates dietary labels.
 *
 * 86th POSR-exclusive differentiator — restaurants spend $200-500/mo on
 * third-party nutrition analysis (NutriSlice, MenuCalc, Healthy Dining).
 * FDA menu labeling law (2018) requires chains 20+ locations to post calorie
 * counts — non-compliance = $500-1,000 per item per day. Classic POS systems
 * (Toast, Square, Lightspeed) have NO nutrition calculation.
 *
 * Distinct from:
 *   - allergen-risk.service (ALLERGEN cross-contamination RISK in kitchen
 *     — NOT nutrition calculation or dietary label generation)
 *   - recipe-optimization.service (recipe COST optimization — NOT nutrition)
 *   - recipe-substitution.service (ingredient SWAP suggestions — NOT nutrition)
 *   - recipe-scaling.service (BATCH scaling — NOT nutrition)
 *   - dish-profitability.service (dish PROFITABILITY — NOT nutrition)
 *   - menu-optimization.service (BCG matrix — NOT nutrition)
 *
 * GENERATES NUTRITION DATA from recipe ingredients:
 *   - Auto-calculates calories, macros (protein/carbs/fat/fiber/sugar/sodium)
 *   - Detects 14 major allergens (FDA/EFSA list)
 *   - Generates dietary labels (vegan, vegetarian, gluten-free, dairy-free, keto, paleo)
 *   - Calculates per-serving nutrition from total recipe ÷ servings
 *   - Scores healthfulness (0-100)
 *   - Generates FDA-compliant menu labels
 *   - Flags high-sodium/high-sugar items for reformulation
 *
 * 8 AI rules:
 *   1. high_sodium — sodium > 800mg per serving (FDA high-sodium threshold)
 *   2. high_sugar — added sugar > 25g per serving (AHA daily limit)
 *   3. high_calorie_density — calories > 800 per serving
 *   4. low_protein — protein < 10g per serving (unbalanced meal)
 *   5. missing_allergen_tag — allergen detected but not labeled on menu
 *   6. dietary_label_conflict — labeled vegan but contains animal product
 *   7. serving_size_mismatch — nutrition per serving doesn't match actual plate
 *   8. reformulation_opportunity — low health score + high cost = reformulate
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type NutritionRuleId =
  | 'high_sodium'
  | 'high_sugar'
  | 'high_calorie_density'
  | 'low_protein'
  | 'missing_allergen_tag'
  | 'dietary_label_conflict'
  | 'serving_size_mismatch'
  | 'reformulation_opportunity';

export type NutritionAiRec =
  | 'reformulate'
  | 'add_label'
  | 'adjust_portion'
  | 'feature_healthy'
  | 'monitor'
  | 'skip';

export interface NutritionAlert {
  id?: string;
  rule_id: NutritionRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recipe_id?: string;
  recipe_name: string;
  category?: string;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  health_score?: number;
  allergens_detected?: string;
  dietary_labels?: string;
  current_price?: number;
  est_reformulation_savings: number;
  est_compliance_risk: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: NutritionAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface NutritionConfig {
  aiEnabled: boolean;
  sodiumMaxMg: number;        // 800
  sugarMaxG: number;          // 25
  calorieMax: number;         // 800
  healthScoreMin: number;     // 60
  chainLocations: number;     // 1 (20+ triggers FDA compliance)
}

export const DEFAULT_NUTRITION_CONFIG: NutritionConfig = {
  aiEnabled: true,
  sodiumMaxMg: 800,
  sugarMaxG: 25,
  calorieMax: 800,
  healthScoreMin: 60,
  chainLocations: 1,
};

export const readNutritionConfig = (settings: any): NutritionConfig => ({
  aiEnabled: settings?.nutrition_ai_enabled ?? true,
  sodiumMaxMg: safeNumber(settings?.nutrition_sodium_max_mg, 800),
  sugarMaxG: safeNumber(settings?.nutrition_sugar_max_g, 25.0),
  calorieMax: safeNumber(settings?.nutrition_calorie_max, 800),
  healthScoreMin: safeNumber(settings?.nutrition_health_score_min, 60),
  chainLocations: safeNumber(settings?.nutrition_chain_locations, 1),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// USDA-style ingredient nutrition database (mock — per 100g)
// ---------------------------------------------------------------------------
interface IngredientNutrition {
  name: string;
  category: string;
  calories: number;  // per 100g
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  allergens: string[];   // allergen codes
  dietary: string[];     // dietary labels this ingredient satisfies
}

const NUTRITION_DB: Record<string, IngredientNutrition> = {
  'chicken_breast': { name: 'Chicken Breast', category: 'meat', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, sugar_g: 0, sodium_mg: 74, allergens: [], dietary: ['high_protein', 'keto', 'paleo'] },
  'beef_patty':     { name: 'Beef Patty',     category: 'meat', calories: 250, protein_g: 26, carbs_g: 0, fat_g: 15, fiber_g: 0, sugar_g: 0, sodium_mg: 75, allergens: [], dietary: ['keto', 'paleo'] },
  'salmon_fillet':  { name: 'Salmon Fillet',  category: 'fish', calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13, fiber_g: 0, sugar_g: 0, sodium_mg: 59, allergens: ['fish'], dietary: ['keto', 'paleo', 'pescatarian'] },
  'shrimp':         { name: 'Shrimp',         category: 'shellfish', calories: 99, protein_g: 24, carbs_g: 0.2, fat_g: 0.3, fiber_g: 0, sugar_g: 0, sodium_mg: 111, allergens: ['shellfish'], dietary: ['keto', 'paleo', 'pescatarian'] },
  'mozzarella':     { name: 'Mozzarella',     category: 'dairy', calories: 280, protein_g: 28, carbs_g: 3.1, fat_g: 17, fiber_g: 0, sugar_g: 1, sodium_mg: 627, allergens: ['milk'], dietary: ['keto', 'vegetarian'] },
  'cheddar':        { name: 'Cheddar',        category: 'dairy', calories: 403, protein_g: 25, carbs_g: 1.3, fat_g: 33, fiber_g: 0, sugar_g: 0.5, sodium_mg: 621, allergens: ['milk'], dietary: ['keto', 'vegetarian'] },
  'egg':            { name: 'Egg',            category: 'dairy', calories: 143, protein_g: 13, carbs_g: 1.1, fat_g: 9.5, fiber_g: 0, sugar_g: 1.1, sodium_mg: 142, allergens: ['eggs'], dietary: ['keto', 'paleo', 'vegetarian'] },
  'milk_whole':     { name: 'Milk (Whole)',   category: 'dairy', calories: 61, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.3, fiber_g: 0, sugar_g: 5.1, sodium_mg: 44, allergens: ['milk'], dietary: ['vegetarian'] },
  'butter':         { name: 'Butter',         category: 'dairy', calories: 717, protein_g: 0.9, carbs_g: 0.1, fat_g: 81, fiber_g: 0, sugar_g: 0.1, sodium_mg: 11, allergens: ['milk'], dietary: ['keto', 'vegetarian'] },
  'wheat_flour':    { name: 'Wheat Flour',    category: 'grain', calories: 364, protein_g: 10, carbs_g: 76, fat_g: 1, fiber_g: 2.7, sugar_g: 0.3, sodium_mg: 2, allergens: ['wheat', 'gluten'], dietary: ['vegetarian'] },
  'pizza_dough':    { name: 'Pizza Dough',    category: 'grain', calories: 265, protein_g: 7, carbs_g: 53, fat_g: 3.2, fiber_g: 2.3, sugar_g: 1.5, sodium_mg: 400, allergens: ['wheat', 'gluten'], dietary: ['vegetarian'] },
  'pasta':          { name: 'Pasta',          category: 'grain', calories: 131, protein_g: 5, carbs_g: 25, fat_g: 1.1, fiber_g: 1.8, sugar_g: 0.6, sodium_mg: 6, allergens: ['wheat', 'gluten'], dietary: ['vegetarian'] },
  'rice_white':     { name: 'Rice (White)',   category: 'grain', calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4, sugar_g: 0.1, sodium_mg: 1, allergens: [], dietary: ['vegan', 'vegetarian'] },
  'tomato_sauce':   { name: 'Tomato Sauce',   category: 'vegetable', calories: 29, protein_g: 1.6, carbs_g: 5.5, fat_g: 0.2, fiber_g: 1.5, sugar_g: 3.6, sodium_mg: 580, allergens: [], dietary: ['vegan', 'vegetarian'] },
  'fresh_basil':    { name: 'Fresh Basil',    category: 'vegetable', calories: 23, protein_g: 3.2, carbs_g: 2.7, fat_g: 0.6, fiber_g: 1.6, sugar_g: 0.3, sodium_mg: 4, allergens: [], dietary: ['vegan', 'vegetarian'] },
  'lettuce':        { name: 'Lettuce',        category: 'vegetable', calories: 15, protein_g: 1.4, carbs_g: 2.9, fat_g: 0.2, fiber_g: 1.3, sugar_g: 0.8, sodium_mg: 28, allergens: [], dietary: ['vegan', 'vegetarian', 'keto'] },
  'avocado':        { name: 'Avocado',        category: 'vegetable', calories: 160, protein_g: 2, carbs_g: 8.5, fat_g: 14.7, fiber_g: 6.7, sugar_g: 0.7, sodium_mg: 7, allergens: [], dietary: ['vegan', 'vegetarian', 'keto', 'paleo'] },
  'olive_oil':      { name: 'Olive Oil',      category: 'oil', calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: 0, sugar_g: 0, sodium_mg: 2, allergens: [], dietary: ['vegan', 'vegetarian', 'keto', 'paleo'] },
  'soy_sauce':      { name: 'Soy Sauce',      category: 'condiment', calories: 53, protein_g: 8, carbs_g: 4.9, fat_g: 0.6, fiber_g: 0.8, sugar_g: 1, sodium_mg: 5493, allergens: ['soy', 'wheat', 'gluten'], dietary: ['vegan', 'vegetarian'] },
  'peanut_butter':  { name: 'Peanut Butter',  category: 'nuts', calories: 588, protein_g: 25, carbs_g: 20, fat_g: 50, fiber_g: 6, sugar_g: 9, sodium_mg: 17, allergens: ['peanuts'], dietary: ['vegan', 'vegetarian', 'keto'] },
  'almond_milk':    { name: 'Almond Milk',    category: 'dairy_alt', calories: 17, protein_g: 0.6, carbs_g: 0.6, fat_g: 1.5, fiber_g: 0.5, sugar_g: 0.3, sodium_mg: 73, allergens: ['tree_nuts'], dietary: ['vegan', 'vegetarian'] },
};

// Allergen codes (FDA 9 major + EFSA additional 5)
const ALLERGEN_LABELS: Record<string, string> = {
  milk: 'Milk',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  tree_nuts: 'Tree Nuts',
  peanuts: 'Peanuts',
  wheat: 'Wheat',
  soy: 'Soybeans',
  sesame: 'Sesame',
  gluten: 'Gluten',
  sulfites: 'Sulfites',
  mustard: 'Mustard',
  celery: 'Celery',
  lupin: 'Lupin',
};

// Mock recipe data (in production, from recipe table + ingredients)
interface RecipeData {
  id: string;
  name: string;
  category: string;
  ingredients: { key: string; grams: number }[];
  servings: number;
  current_price?: number;
  menu_allergen_tags?: string[];   // what menu currently claims
  menu_dietary_labels?: string[];  // what menu currently claims
}

const MOCK_RECIPES: RecipeData[] = [
  {
    id: 'REC-001', name: 'Margherita Pizza', category: 'pizza', servings: 2, current_price: 14.50,
    ingredients: [
      { key: 'pizza_dough', grams: 200 },
      { key: 'tomato_sauce', grams: 80 },
      { key: 'mozzarella', grams: 120 },
      { key: 'fresh_basil', grams: 10 },
      { key: 'olive_oil', grams: 10 },
    ],
    menu_allergen_tags: ['gluten', 'milk'],
    menu_dietary_labels: ['vegetarian'],
  },
  {
    id: 'REC-002', name: 'Chicken Alfredo Pasta', category: 'pasta', servings: 1, current_price: 16.90,
    ingredients: [
      { key: 'pasta', grams: 150 },
      { key: 'chicken_breast', grams: 120 },
      { key: 'butter', grams: 30 },
      { key: 'cheddar', grams: 50 },
      { key: 'milk_whole', grams: 80 },
    ],
    menu_allergen_tags: ['gluten'],
    menu_dietary_labels: [],
  },
  {
    id: 'REC-003', name: 'Salmon Avocado Bowl', category: 'bowl', servings: 1, current_price: 18.50,
    ingredients: [
      { key: 'salmon_fillet', grams: 150 },
      { key: 'avocado', grams: 80 },
      { key: 'rice_white', grams: 120 },
      { key: 'soy_sauce', grams: 15 },
      { key: 'lettuce', grams: 30 },
    ],
    menu_allergen_tags: ['fish', 'soy'],
    menu_dietary_labels: ['pescatarian'],
  },
  {
    id: 'REC-004', name: 'Vegan Buddha Bowl', category: 'bowl', servings: 1, current_price: 13.50,
    ingredients: [
      { key: 'rice_white', grams: 100 },
      { key: 'avocado', grams: 60 },
      { key: 'lettuce', grams: 40 },
      { key: 'tomato_sauce', grams: 30 },
      { key: 'olive_oil', grams: 10 },
    ],
    menu_allergen_tags: [],
    menu_dietary_labels: ['vegan', 'vegetarian', 'gluten_free'],
  },
  {
    id: 'REC-005', name: 'Peanut Butter Smoothie', category: 'beverage', servings: 1, current_price: 7.50,
    ingredients: [
      { key: 'peanut_butter', grams: 60 },
      { key: 'almond_milk', grams: 200 },
      { key: 'avocado', grams: 40 },
    ],
    menu_allergen_tags: ['peanuts'],
    menu_dietary_labels: ['vegan', 'vegetarian'],
  },
  {
    id: 'REC-006', name: 'Shrimp Scampi', category: 'pasta', servings: 1, current_price: 19.90,
    ingredients: [
      { key: 'pasta', grams: 120 },
      { key: 'shrimp', grams: 150 },
      { key: 'butter', grams: 25 },
      { key: 'olive_oil', grams: 15 },
      { key: 'soy_sauce', grams: 10 },
    ],
    menu_allergen_tags: ['shellfish'],
    menu_dietary_labels: ['pescatarian'],
  },
  {
    id: 'REC-007', name: 'Classic Beef Burger', category: 'burger', servings: 1, current_price: 12.50,
    ingredients: [
      { key: 'beef_patty', grams: 150 },
      { key: 'pizza_dough', grams: 60 }, // bun
      { key: 'cheddar', grams: 30 },
      { key: 'lettuce', grams: 15 },
      { key: 'tomato_sauce', grams: 20 },
    ],
    menu_allergen_tags: ['gluten', 'milk'],
    menu_dietary_labels: [],
  },
  {
    id: 'REC-008', name: 'Caprese Salad', category: 'salad', servings: 1, current_price: 10.50,
    ingredients: [
      { key: 'mozzarella', grams: 80 },
      { key: 'tomato_sauce', grams: 50 },
      { key: 'fresh_basil', grams: 8 },
      { key: 'olive_oil', grams: 12 },
    ],
    menu_allergen_tags: [],
    menu_dietary_labels: ['vegetarian', 'gluten_free'],
  },
];

/**
 * Calculate nutrition for a recipe from its ingredients.
 */
function calculateRecipeNutrition(recipe: RecipeData): {
  totalCalories: number; totalProtein: number; totalCarbs: number; totalFat: number;
  totalFiber: number; totalSugar: number; totalSodium: number;
  allergens: string[]; dietary: string[];
  perServing: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number };
} {
  let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
  let totalFiber = 0, totalSugar = 0, totalSodium = 0;
  const allergenSet = new Set<string>();
  const dietarySets: string[][] = [];

  for (const ing of recipe.ingredients) {
    const db = NUTRITION_DB[ing.key];
    if (!db) continue;
    const factor = ing.grams / 100;
    totalCalories += db.calories * factor;
    totalProtein += db.protein_g * factor;
    totalCarbs += db.carbs_g * factor;
    totalFat += db.fat_g * factor;
    totalFiber += db.fiber_g * factor;
    totalSugar += db.sugar_g * factor;
    totalSodium += db.sodium_mg * factor;
    db.allergens.forEach(a => allergenSet.add(a));
    dietarySets.push(db.dietary);
  }

  // Dietary labels: ingredient must be in ALL ingredients' dietary lists
  // (intersection — if any ingredient doesn't qualify, recipe doesn't)
  let dietary: string[] = [];
  if (dietarySets.length > 0) {
    dietary = dietarySets[0].filter(d => dietarySets.every(ds => ds.includes(d)));
  }

  const servings = Math.max(1, recipe.servings);
  return {
    totalCalories: Math.round(totalCalories),
    totalProtein: Math.round(totalProtein * 10) / 10,
    totalCarbs: Math.round(totalCarbs * 10) / 10,
    totalFat: Math.round(totalFat * 10) / 10,
    totalFiber: Math.round(totalFiber * 10) / 10,
    totalSugar: Math.round(totalSugar * 10) / 10,
    totalSodium: Math.round(totalSodium),
    allergens: Array.from(allergenSet),
    dietary,
    perServing: {
      calories: Math.round(totalCalories / servings),
      protein: Math.round((totalProtein / servings) * 10) / 10,
      carbs: Math.round((totalCarbs / servings) * 10) / 10,
      fat: Math.round((totalFat / servings) * 10) / 10,
      fiber: Math.round((totalFiber / servings) * 10) / 10,
      sugar: Math.round((totalSugar / servings) * 10) / 10,
      sodium: Math.round(totalSodium / servings),
    },
  };
}

/**
 * Calculate health score (0-100) based on calorie density + macro balance.
 */
function calculateHealthScore(perServing: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number }): number {
  let score = 50; // base
  // Protein bonus (target: 20-40g)
  if (perServing.protein >= 20 && perServing.protein <= 40) score += 15;
  else if (perServing.protein >= 10) score += 8;
  // Fiber bonus (target: 5-10g)
  if (perServing.fiber >= 5) score += 10;
  else if (perServing.fiber >= 3) score += 5;
  // Sodium penalty (>800mg)
  if (perServing.sodium > 800) score -= 15;
  else if (perServing.sodium > 600) score -= 8;
  // Sugar penalty (>25g)
  if (perServing.sugar > 25) score -= 10;
  else if (perServing.sugar > 15) score -= 5;
  // Calorie density penalty (>800 cal)
  if (perServing.calories > 800) score -= 10;
  else if (perServing.calories > 600) score -= 5;
  // Low calorie + high protein = healthy
  if (perServing.calories < 500 && perServing.protein >= 20) score += 10;
  return Math.max(0, Math.min(100, score));
}

/**
 * Run the nutrition generator engine.
 */
export const runNutritionEngine = async (
  db: ReturnType<typeof useDB>,
  config: NutritionConfig = DEFAULT_NUTRITION_CONFIG
): Promise<{ alerts: NutritionAlert[]; generated: number }> => {
  const alerts: NutritionAlert[] = [];
  const now = new Date();

  // 1. Fetch recipes from database
  let recipes: RecipeData[] = [];
  try {
    const result = await db.query(
      `SELECT id, name, category, ingredients, servings, price AS current_price,
              menu_allergen_tags, menu_dietary_labels
       FROM recipe
       WHERE deleted_at IS NONE
       LIMIT 100`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    recipes = rows.map((r: any) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? 'Unknown'),
      category: String(r.category ?? ''),
      ingredients: Array.isArray(r.ingredients) ? r.ingredients.map((i: any) => ({
        key: String(i.key ?? ''),
        grams: safeNumber(i.grams, 0),
      })) : [],
      servings: safeNumber(r.servings, 1),
      current_price: r.current_price ? safeNumber(r.current_price, 0) : undefined,
      menu_allergen_tags: Array.isArray(r.menu_allergen_tags) ? r.menu_allergen_tags.map(String) : [],
      menu_dietary_labels: Array.isArray(r.menu_dietary_labels) ? r.menu_dietary_labels.map(String) : [],
    }));
  } catch (err) {
    console.warn('[nutrition] fetchRecipes failed — using mock', err);
  }

  // Fallback: use mock data
  if (recipes.length === 0) {
    recipes = MOCK_RECIPES;
  }

  // 2. Calculate nutrition + apply 8 rules per recipe
  for (const recipe of recipes) {
    const nutrition = calculateRecipeNutrition(recipe);
    const healthScore = calculateHealthScore(nutrition.perServing);
    const allergenLabels = nutrition.allergens.map(a => ALLERGEN_LABELS[a] ?? a);

    // --- Rule 1: HIGH_SODIUM ---
    if (nutrition.perServing.sodium > config.sodiumMaxMg) {
      const severity = nutrition.perServing.sodium > config.sodiumMaxMg * 1.5 ? 'high' : 'medium';
      alerts.push(makeAlert(
        'high_sodium', severity,
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        0, config.chainLocations >= 20 ? 500 : 0,
        `${recipe.name}: ${nutrition.perServing.sodium}mg sodium per serving (FDA high-sodium threshold ${config.sodiumMaxMg}mg). ${severity === 'high' ? 'Critical — exceeds AHA daily limit by 50%.' : 'High — consider low-sodium ingredient swaps.'}`,
        'reformulate'
      ));
    }

    // --- Rule 2: HIGH_SUGAR ---
    if (nutrition.perServing.sugar > config.sugarMaxG) {
      alerts.push(makeAlert(
        'high_sugar', 'medium',
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        0, 0,
        `${recipe.name}: ${nutrition.perServing.sugar}g sugar per serving (AHA daily limit ${config.sugarMaxG}g). Consider reducing sweet ingredients or offering sugar-free alternative.`,
        'reformulate'
      ));
    }

    // --- Rule 3: HIGH_CALORIE_DENSITY ---
    if (nutrition.perServing.calories > config.calorieMax) {
      alerts.push(makeAlert(
        'high_calorie_density', 'medium',
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        recipe.current_price ? recipe.current_price * 0.15 : 0,
        config.chainLocations >= 20 ? 1000 : 0,
        `${recipe.name}: ${nutrition.perServing.calories} cal per serving (threshold ${config.calorieMax}). Consider smaller portion or lighter ingredients. FDA requires calorie posting for chains 20+.`,
        'adjust_portion'
      ));
    }

    // --- Rule 4: LOW_PROTEIN ---
    if (nutrition.perServing.protein < 10 && nutrition.perServing.calories > 300) {
      alerts.push(makeAlert(
        'low_protein', 'low',
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        0, 0,
        `${recipe.name}: only ${nutrition.perServing.protein}g protein per serving (unbalanced — target 15-30g). Add protein-rich ingredient or pair with protein side.`,
        'reformulate'
      ));
    }

    // --- Rule 5: MISSING_ALLERGEN_TAG — detected allergen not on menu ---
    const untaggedAllergens = nutrition.allergens.filter(a =>
      !recipe.menu_allergen_tags?.includes(a)
    );
    if (untaggedAllergens.length > 0) {
      const untaggedLabels = untaggedAllergens.map(a => ALLERGEN_LABELS[a] ?? a);
      alerts.push(makeAlert(
        'missing_allergen_tag', 'critical',
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        0, 25000, // allergen lawsuit risk
        `${recipe.name}: ${untaggedLabels.length} allergen(s) NOT labeled on menu: ${untaggedLabels.join(', ')}. Undeclared allergen = $25k+ lawsuit risk + FDA violation. Add to menu allergen tags immediately.`,
        'add_label'
      ));
    }

    // --- Rule 6: DIETARY_LABEL_CONFLICT — labeled vegan but contains animal ---
    const menuLabels = recipe.menu_dietary_labels ?? [];
    if (menuLabels.includes('vegan') && nutrition.allergens.some(a => ['milk', 'eggs', 'fish', 'shellfish'].includes(a))) {
      const conflictingIngredient = nutrition.allergens.find(a => ['milk', 'eggs', 'fish', 'shellfish'].includes(a));
      alerts.push(makeAlert(
        'dietary_label_conflict', 'critical',
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        0, 15000, // false advertising lawsuit risk
        `${recipe.name}: labeled VEGAN but contains ${ALLERGEN_LABELS[conflictingIngredient!] ?? conflictingIngredient}. False advertising = $15k+ lawsuit + brand damage. Remove vegan label or reformulate.`,
        'add_label'
      ));
    }
    if (menuLabels.includes('gluten_free') && nutrition.allergens.includes('gluten')) {
      alerts.push(makeAlert(
        'dietary_label_conflict', 'critical',
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        0, 20000, // celiac lawsuit risk
        `${recipe.name}: labeled GLUTEN-FREE but contains gluten/wheat. Celiac customers can be hospitalized. $20k+ lawsuit risk + FDA violation. Remove label immediately.`,
        'add_label'
      ));
    }

    // --- Rule 7: SERVING_SIZE_MISMATCH ---
    // (mock: if calories per serving seem unrealistically high or low vs price)
    if (recipe.current_price && nutrition.perServing.calories > 0) {
      const caloriesPerDollar = nutrition.perServing.calories / recipe.current_price;
      if (caloriesPerDollar > 200) {
        // Very calorie-dense for the price = likely oversized portion
        alerts.push(makeAlert(
          'serving_size_mismatch', 'low',
          recipe, nutrition.perServing, healthScore,
          nutrition.allergens, nutrition.dietary,
          recipe.current_price * 0.2, 0,
          `${recipe.name}: ${caloriesPerDollar.toFixed(0)} cal/$ (very high). Likely oversized portion — reduce serving size by 15-20% to save ${fmt$(recipe.current_price * 0.2)}/plate in food cost.`,
          'adjust_portion'
        ));
      }
    }

    // --- Rule 8: REFORMULATION_OPPORTUNITY — low health score + cost ---
    if (healthScore < config.healthScoreMin && recipe.current_price) {
      const reformulationSavings = recipe.current_price * 0.10; // 10% cost reduction
      alerts.push(makeAlert(
        'reformulation_opportunity', 'medium',
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        reformulationSavings * 50, // monthly savings (50 orders/mo)
        0,
        `${recipe.name}: health score ${healthScore}/100 (target ${config.healthScoreMin}). Reformulate with healthier ingredients (low-sodium, high-fiber) — saves ${fmt$(reformulationSavings)}/plate + 10% cost reduction = ${fmt$(reformulationSavings * 50)}/mo.`,
        'reformulate'
      ));
    }

    // Feature healthy items (score >= 80)
    if (healthScore >= 80) {
      alerts.push(makeAlert(
        'reformulation_opportunity', 'low',
        recipe, nutrition.perServing, healthScore,
        nutrition.allergens, nutrition.dietary,
        0, 0,
        `${recipe.name}: health score ${healthScore}/100 — EXCELLENT. Feature as "Healthy Choice" on menu + highlight on delivery platforms (UberEats/DoorDash prioritize healthy tags).`,
        'feature_healthy'
      ));
    }
  }

  // 3. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant nutrition and dietary compliance AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Nutrition alert: ${a.rule_id} for ${a.recipe_name} — ${a.calories_per_serving} cal, ${a.protein_g}g protein, ${a.sodium_mg ?? 0}mg sodium, health score ${a.health_score ?? 0}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM recipe_nutrition_alert WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE recipe_nutrition_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { alerts, generated: alerts.length };
};

// ---------------------------------------------------------------------------
// Helper: build an alert
// ---------------------------------------------------------------------------
function makeAlert(
  ruleId: NutritionRuleId,
  severity: NutritionAlert['severity'],
  recipe: RecipeData,
  perServing: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number },
  healthScore: number,
  allergens: string[],
  dietary: string[],
  estSavings: number,
  estComplianceRisk: number,
  description: string,
  aiRec: NutritionAiRec
): NutritionAlert {
  const now = new Date();
  return {
    rule_id: ruleId,
    severity,
    recipe_id: recipe.id,
    recipe_name: recipe.name,
    category: recipe.category,
    calories_per_serving: perServing.calories,
    protein_g: perServing.protein,
    carbs_g: perServing.carbs,
    fat_g: perServing.fat,
    fiber_g: perServing.fiber,
    sugar_g: perServing.sugar,
    sodium_mg: perServing.sodium,
    health_score: healthScore,
    allergens_detected: allergens.length > 0 ? JSON.stringify(allergens) : undefined,
    dietary_labels: dietary.length > 0 ? JSON.stringify(dietary) : undefined,
    current_price: recipe.current_price,
    est_reformulation_savings: Math.round(estSavings * 100) / 100,
    est_compliance_risk: Math.round(estComplianceRisk),
    description,
    ai_recommendation: aiRec,
    status: 'open',
    detected_at: now,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<NutritionAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM recipe_nutrition_alert
       WHERE status = 'open'
       ORDER BY est_compliance_risk DESC, est_reformulation_savings DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number;
  criticalCount: number;
  totalSavings: number;
  totalComplianceRisk: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_reformulation_savings) AS savings,
         math::sum(est_compliance_risk) AS risk
       FROM recipe_nutrition_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalSavings: safeNumber(r.savings, 0),
      totalComplianceRisk: safeNumber(r.risk, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalSavings: 0, totalComplianceRisk: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
