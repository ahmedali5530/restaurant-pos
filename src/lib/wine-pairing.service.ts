/**
 * AI Sommelier Wine Pairing Engine — flavor-science wine recommendations.
 *
 * 60th POSR-exclusive differentiator — wine pairing increases avg ticket
 * 18-25% (Wine & Spirit Wholesalers of America). 67% of diners order wine
 * when recommended (NRA). Yet most restaurants have NO systematic wine
 * pairing. Toast, Square, Lightspeed have NO sommelier AI.
 *
 * Distinct from:
 *   - menu-pairing.service (FOOD co-purchase analysis — NOT wine flavor science)
 *   - menu-optimization.service (BCG matrix — NOT wine pairing)
 *   - menu-rotation.service (fatigue detection — NOT wine)
 *   - upsell-analytics.service (measures upsell effectiveness — doesn't generate wine recs)
 *   - dynamic-pricing.service (price adjustments — NOT wine recommendations)
 *
 * Analyzes dish flavor profile (acid, fat, spice, sweet, umami), matches to
 * wine characteristics (body, tannin, acidity, sweetness), suggests specific
 * wines, generates server pitch scripts.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type WineRuleId =
  | 'classic_match'
  | 'contrast_pairing'
  | 'budget_friendly'
  | 'premium_upsell'
  | 'inventory_clearance';

export type WineAiRec =
  | 'add_to_menu'
  | 'train_staff'
  | 'feature_prominently'
  | 'monitor'
  | 'bundle_pricing';

export interface WinePairing {
  id?: string;
  rule_id: WineRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  dish_id?: string;
  dish_name?: string;
  dish_category?: string;
  dish_price: number;
  dish_flavor_profile?: string;
  recommended_wine?: string;
  wine_type?: string;
  wine_varietal?: string;
  wine_price?: number;
  price_tier?: string;
  pairing_score: number;
  pairing_logic?: string;
  server_pitch?: string;
  est_revenue_lift: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: WineAiRec;
  status: 'open' | 'added' | 'trained' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface WineConfig {
  aiEnabled: boolean;
  defaultPriceTier: string;
  pairingThreshold: number;
  upsellTargetPct: number;
}

export const DEFAULT_WINE_CONFIG: WineConfig = {
  aiEnabled: true,
  defaultPriceTier: 'mid',
  pairingThreshold: 70,
  upsellTargetPct: 0.50,
};

export const readWineConfig = (settings: any): WineConfig => ({
  aiEnabled: settings?.wine_ai_enabled ?? true,
  defaultPriceTier: settings?.wine_default_price_tier ?? 'mid',
  pairingThreshold: safeNumber(settings?.wine_pairing_threshold, 70),
  upsellTargetPct: safeNumber(settings?.wine_upsell_target_pct, 0.50),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Dish flavor profile inference from dish name keywords
// Returns {acid, fat, spice, sweet, umami} on 0-5 scale
const inferFlavorProfile = (dishName: string, category: string): { acid: number; fat: number; spice: number; sweet: number; umami: number } => {
  const name = (dishName + ' ' + category).toLowerCase();
  let acid = 2, fat = 2, spice = 1, sweet = 1, umami = 2;

  // Acid (tomato, citrus, vinegar)
  if (name.match(/tomato|citrus|lemon|lime|vinegar|vinaigrette/)) acid = 4;
  else if (name.match(/salsa|pickled/)) acid = 3;

  // Fat (cheese, cream, butter, fried, fatty meat)
  if (name.match(/cheese|cream|butter|fried|beef|pork|bacon|ribeye|burger/)) fat = 4;
  else if (name.match(/salmon|duck|lamb/)) fat = 3;

  // Spice (chili, curry, pepper)
  if (name.match(/spicy|chili|curry|cayenne|hot|szechuan|jerk/)) spice = 5;
  else if (name.match(/pepper|paprika|sriracha|wasabi/)) spice = 3;

  // Sweet (dessert, honey, glaze)
  if (name.match(/dessert|cake|ice cream|chocolate|honey|glaze|caramel/)) sweet = 5;
  else if (name.match(/teriyaki|bbq|sweet/)) sweet = 3;

  // Umami (mushroom, soy, aged, cured)
  if (name.match(/mushroom|soy|aged|cured|parmesan|anchovy|truffle/)) umami = 4;
  else if (name.match(/beef|steak|grilled/)) umami = 3;

  return { acid, fat, spice, sweet, umami };
};

// Wine varietal characteristics
// Each varietal: {body: 1-5, tannin: 0-5, acidity: 0-5, sweetness: 0-5, price_tier}
const WINE_CATALOG: Array<{
  name: string;
  varietal: string;
  type: string;
  body: number;
  tannin: number;
  acidity: number;
  sweetness: number;
  price_tier: string;
  base_price: number;
}> = [
  // Reds
  { name: 'Cabernet Sauvignon', varietal: 'cabernet_sauvignon', type: 'red', body: 5, tannin: 4, acidity: 3, sweetness: 0, price_tier: 'mid', base_price: 12 },
  { name: 'Merlot', varietal: 'merlot', type: 'red', body: 4, tannin: 3, acidity: 3, sweetness: 1, price_tier: 'budget', base_price: 9 },
  { name: 'Pinot Noir', varietal: 'pinot_noir', type: 'red', body: 3, tannin: 2, acidity: 4, sweetness: 0, price_tier: 'mid', base_price: 14 },
  { name: 'Syrah/Shiraz', varietal: 'syrah', type: 'red', body: 5, tannin: 4, acidity: 3, sweetness: 1, price_tier: 'mid', base_price: 13 },
  { name: 'Malbec', varietal: 'malbec', type: 'red', body: 4, tannin: 3, acidity: 3, sweetness: 1, price_tier: 'budget', base_price: 10 },
  { name: 'Cabernet Franc', varietal: 'cabernet_franc', type: 'red', body: 3, tannin: 3, acidity: 4, sweetness: 0, price_tier: 'premium', base_price: 18 },
  // Whites
  { name: 'Chardonnay (oaked)', varietal: 'chardonnay', type: 'white', body: 4, tannin: 0, acidity: 3, sweetness: 1, price_tier: 'mid', base_price: 12 },
  { name: 'Chardonnay (unoaked)', varietal: 'chardonnay', type: 'white', body: 3, tannin: 0, acidity: 4, sweetness: 1, price_tier: 'budget', base_price: 9 },
  { name: 'Sauvignon Blanc', varietal: 'sauvignon_blanc', type: 'white', body: 2, tannin: 0, acidity: 5, sweetness: 0, price_tier: 'budget', base_price: 10 },
  { name: 'Riesling (dry)', varietal: 'riesling', type: 'white', body: 2, tannin: 0, acidity: 5, sweetness: 2, price_tier: 'mid', base_price: 13 },
  { name: 'Pinot Grigio', varietal: 'pinot_grigio', type: 'white', body: 2, tannin: 0, acidity: 4, sweetness: 1, price_tier: 'budget', base_price: 8 },
  { name: 'Gewürztraminer', varietal: 'gewurztraminer', type: 'white', body: 3, tannin: 0, acidity: 3, sweetness: 3, price_tier: 'premium', base_price: 16 },
  // Rosé & Sparkling
  { name: 'Provence Rosé', varietal: 'rose', type: 'rose', body: 2, tannin: 1, acidity: 4, sweetness: 1, price_tier: 'mid', base_price: 12 },
  { name: 'Champagne/Sparkling', varietal: 'champagne', type: 'sparkling', body: 3, tannin: 0, acidity: 5, sweetness: 1, price_tier: 'premium', base_price: 20 },
  { name: 'Prosecco', varietal: 'prosecco', type: 'sparkling', body: 2, tannin: 0, acidity: 4, sweetness: 2, price_tier: 'budget', base_price: 9 },
  // Dessert
  { name: 'Port', varietal: 'port', type: 'dessert', body: 5, tannin: 3, acidity: 2, sweetness: 5, price_tier: 'premium', base_price: 18 },
  { name: 'Sauternes', varietal: 'sauternes', type: 'dessert', body: 4, tannin: 0, acidity: 4, sweetness: 5, price_tier: 'luxury', base_price: 35 },
];

/**
 * Compute pairing score (0-100) between dish flavor profile and wine.
 * Higher = better match.
 */
const computePairingScore = (
  dish: { acid: number; fat: number; spice: number; sweet: number; umami: number },
  wine: { body: number; tannin: number; acidity: number; sweetness: number }
): { score: number; logic: string } => {
  let score = 50; // base
  const logic: string[] = [];

  // Fat + tannin: high-fat dishes need tannin to cut through
  if (dish.fat >= 4 && wine.tannin >= 3) {
    score += 20;
    logic.push('tannin cuts through richness');
  } else if (dish.fat >= 4 && wine.tannin < 2) {
    score -= 10;
    logic.push('low tannin overwhelmed by fat');
  }

  // Acid + acid: dish acidity should be matched or exceeded by wine
  if (dish.acid >= 4 && wine.acidity >= 4) {
    score += 15;
    logic.push('acidity matches dish');
  } else if (dish.acid >= 4 && wine.acidity < 3) {
    score -= 15;
    logic.push('wine too low acid for acidic dish');
  }

  // Spice + sweetness: spicy dishes pair well with slight sweetness
  if (dish.spice >= 4 && wine.sweetness >= 2) {
    score += 20;
    logic.push('sweetness balances spice');
  } else if (dish.spice >= 4 && wine.tannin >= 3) {
    score -= 20;
    logic.push('tannin amplifies spice heat (bad)');
  } else if (dish.spice >= 3 && wine.alcohol) {
    score -= 10;
    logic.push('high alcohol amplifies spice');
  }

  // Sweet + sweet: dessert wines should be sweeter than dish
  if (dish.sweet >= 4 && wine.sweetness >= 4) {
    score += 15;
    logic.push('dessert wine matches sweetness');
  } else if (dish.sweet >= 4 && wine.sweetness < 2) {
    score -= 10;
    logic.push('dry wine clashes with sweet dish');
  }

  // Umami + body: umami-rich dishes need full-bodied wines
  if (dish.umami >= 3 && wine.body >= 4) {
    score += 10;
    logic.push('full body matches umami');
  }

  // Body matching: heavy dishes need full-bodied wine
  if (dish.fat >= 3 && dish.umami >= 3 && wine.body >= 4) {
    score += 10;
    logic.push('full body matches hearty dish');
  } else if (dish.fat <= 2 && dish.umami <= 2 && wine.body <= 2) {
    score += 10;
    logic.push('light body matches delicate dish');
  }

  return { score: Math.min(100, Math.max(0, score)), logic: logic.join(', ') };
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface DishData {
  id: string;
  name: string;
  price: number;
  category: string;
}

/**
 * Run the wine pairing engine.
 * Fetches dishes, infers flavor profiles, matches wines.
 */
export const runWineEngine = async (
  db: ReturnType<typeof useDB>,
  config: WineConfig = DEFAULT_WINE_CONFIG
): Promise<{ pairings: WinePairing[]; generated: number }> => {
  const pairings: WinePairing[] = [];
  const now = new Date();

  // 1. Fetch dishes
  let dishes: DishData[] = [];
  try {
    const result = await db.query(
      `SELECT id, name, price, category.name AS category
       FROM menu_item
       WHERE deleted_at IS NONE
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    dishes = rows.map((r: any) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? 'Unknown'),
      price: safeNumber(r.price, 0),
      category: String(r.category ?? ''),
    })).filter(d => d.price > 0);
  } catch (err) {
    console.warn('[wine] fetchDishes failed', err);
  }

  if (dishes.length === 0) return { pairings: [], generated: 0 };

  // 2. Generate wine pairing per dish
  for (const dish of dishes) {
    const flavor = inferFlavorProfile(dish.name, dish.category);

    // Score all wines and pick best match
    const scored = WINE_CATALOG.map(wine => {
      const { score, logic } = computePairingScore(flavor, wine);
      return { wine, score, logic };
    }).sort((a, b) => b.score - a.score);

    const bestMatch = scored[0];
    if (!bestMatch || bestMatch.score < config.pairingThreshold) continue;

    // Determine price tier based on dish price
    const targetWinePrice = dish.price * config.upsellTargetPct;
    const wine = bestMatch.wine;
    const winePrice = wine.base_price;

    let priceTier = wine.price_tier;
    if (winePrice < 10) priceTier = 'budget';
    else if (winePrice < 20) priceTier = 'mid';
    else if (winePrice < 40) priceTier = 'premium';
    else priceTier = 'luxury';

    // Determine rule
    let ruleId: WineRuleId;
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let aiRec: WineAiRec;
    let desc = '';

    if (bestMatch.score >= 85) {
      ruleId = 'classic_match';
      severity = 'high';
      aiRec = 'feature_prominently';
      desc = `${dish.name} + ${wine.name}: classic pairing (score ${bestMatch.score}/100) — ${bestMatch.logic}`;
    } else if (flavor.spice >= 4 && wine.sweetness >= 2) {
      ruleId = 'contrast_pairing';
      severity = 'medium';
      aiRec = 'add_to_menu';
      desc = `${dish.name} (spicy) + ${wine.name} (sweet): contrast pairing — ${bestMatch.logic}`;
    } else if (priceTier === 'budget') {
      ruleId = 'budget_friendly';
      severity = 'low';
      aiRec = 'train_staff';
      desc = `${dish.name} + ${wine.name}: budget-friendly pairing (${fmt$(winePrice)}) — ${bestMatch.logic}`;
    } else if (priceTier === 'premium' || priceTier === 'luxury') {
      ruleId = 'premium_upsell';
      severity = 'medium';
      aiRec = 'bundle_pricing';
      desc = `${dish.name} + ${wine.name}: premium upsell (${fmt$(winePrice)}) — ${bestMatch.logic}`;
    } else {
      ruleId = 'classic_match';
      severity = 'low';
      aiRec = 'add_to_menu';
      desc = `${dish.name} + ${wine.name}: good pairing (score ${bestMatch.score}/100) — ${bestMatch.logic}`;
    }

    // Est revenue lift: assume 30% of customers add wine
    const estRevenueLift = dish.price * 0.3 * (winePrice - winePrice * 0.4); // 40% margin on wine

    pairings.push({
      rule_id: ruleId,
      severity,
      dish_id: dish.id,
      dish_name: dish.name,
      dish_category: dish.category,
      dish_price: Math.round(dish.price * 100) / 100,
      dish_flavor_profile: JSON.stringify(flavor),
      recommended_wine: wine.name,
      wine_type: wine.type,
      wine_varietal: wine.varietal,
      wine_price: Math.round(winePrice * 100) / 100,
      price_tier: priceTier,
      pairing_score: Math.round(bestMatch.score),
      pairing_logic: bestMatch.logic,
      server_pitch: `“Our ${dish.name} pairs beautifully with ${wine.name} — ${bestMatch.logic}. Would you like a glass?”`,
      est_revenue_lift: Math.round(estRevenueLift * 100) / 100,
      description: desc,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 3. AI insight for top 5 high-priority pairings
  if (config.aiEnabled && pairings.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topPairings = pairings
        .filter(p => p.severity === 'high' || p.severity === 'medium')
        .slice(0, 5);
      for (const p of topPairings) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a sommelier AI for restaurants. Respond with a single pairing insight (max 200 chars).' },
            { role: 'user', content: `Dish "${p.dish_name}" (${fmt$(p.dish_price)}) + ${p.recommended_wine} (${p.wine_type}, ${fmt$(p.wine_price)}). Pairing score ${p.pairing_score}/100. Logic: ${p.pairing_logic}.` },
          ], { temperature: 0.4, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          p.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM wine_pairing WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const p of pairings) {
    try {
      await db.query(`CREATE wine_pairing CONTENT $data`, {
        data: { ...p, detected_at: p.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { pairings, generated: pairings.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActivePairings = async (db: ReturnType<typeof useDB>): Promise<WinePairing[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM wine_pairing
       WHERE status = 'open'
       ORDER BY pairing_score DESC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  pairingsCount: number;
  classicCount: number;
  avgPairingScore: number;
  totalRevenueLift: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'classic_match') AS classic,
         math::mean(pairing_score) AS score,
         math::sum(est_revenue_lift) AS lift
       FROM wine_pairing
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      pairingsCount: safeNumber(r.total, 0),
      classicCount: safeNumber(r.classic, 0),
      avgPairingScore: safeNumber(r.score, 0),
      totalRevenueLift: safeNumber(r.lift, 0),
    };
  } catch {
    return { pairingsCount: 0, classicCount: 0, avgPairingScore: 0, totalRevenueLift: 0 };
  }
};

export const updatePairingStatus = async (
  db: ReturnType<typeof useDB>,
  pairingId: string,
  status: 'added' | 'trained' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: pairingId, status });
};
