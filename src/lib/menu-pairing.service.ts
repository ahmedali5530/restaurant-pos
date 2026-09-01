/**
 * AI Menu Pairing Engine service — market basket analysis + AI suggestions.
 *
 * 16th POSR-exclusive differentiator — Toast and Square have STATIC "add-on"
 * config (manual lists). POSR generates DYNAMIC pairing suggestions from
 * actual co-purchase patterns + AI reasoning — "customers who ordered X
 * also ordered Y" with confidence scores.
 *
 * Distinct from upsell-analytics.service (which MEASURES effectiveness of
 * existing upsells). This service GENERATES new pairing recommendations
 * that didn't exist before.
 *
 * Algorithm (market basket analysis):
 *   1. Find item pairs that co-occur in same order more than random chance
 *   2. Confidence: P(Y | X) = count(X,Y) / count(X)
 *   3. Lift: confidence / P(Y) — how much more likely Y is given X
 *   4. Filter: min support, min confidence, lift > 1.2
 *   5. Tier:
 *      - 'classic': top 10% confidence (already well-paired — protect)
 *      - 'strong': lift > 2 (strong correlation — promote)
 *      - 'opportunity': high lift + low adoption (untapped — biggest win)
 *   6. AI enhancement: per-pair reasoning + staff pitch script
 *   7. est_revenue_lift: confidence × primary_sales × paired_price
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PairingTier = 'classic' | 'strong' | 'opportunity';

export interface MenuPairing {
  id?: string;
  primary_item?: string;
  primary_item_name: string;
  primary_category?: string;
  paired_item?: string;
  paired_item_name: string;
  paired_category?: string;
  co_occurrence_count: number;
  primary_count: number;
  paired_count: number;
  confidence: number;        // 0-1
  lift: number;              // >1 = positive correlation
  support: number;          // 0-1
  tier: PairingTier;
  est_revenue_lift: number;
  ai_reasoning?: string;
  ai_pitch_script?: string;
  analyzed_at: Date;
  branch_id?: string;
}

export interface PairingConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  minSupport: number;
  minConfidence: number;
  minLift: number;
  maxResults: number;
}

export const DEFAULT_PAIRING_CONFIG: PairingConfig = {
  aiEnabled: true,
  lookbackDays: 90,
  minSupport: 5,
  minConfidence: 0.05,
  minLift: 1.2,
  maxResults: 50,
};

export const readPairingConfig = (settings: any): PairingConfig => ({
  aiEnabled: settings?.pairing_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.pairing_lookback_days, 90),
  minSupport: safeNumber(settings?.pairing_min_support, 5),
  minConfidence: safeNumber(settings?.pairing_min_confidence, 0.05),
  minLift: safeNumber(settings?.pairing_min_lift, 1.2),
  maxResults: safeNumber(settings?.pairing_max_results, 50),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const classifyTier = (
  confidence: number,
  lift: number,
  confidenceP90: number
): PairingTier => {
  // 'opportunity': high lift but low adoption (below median confidence)
  if (lift > 2.0 && confidence < 0.15) return 'opportunity';
  // 'classic': top 10% confidence
  if (confidence >= confidenceP90) return 'classic';
  // 'strong': lift > 2
  if (lift > 2.0) return 'strong';
  return 'opportunity'; // default to opportunity for promotion
};

// ---------------------------------------------------------------------------
// Data fetching — market basket analysis
// ---------------------------------------------------------------------------

interface ItemPair {
  primaryId: string;
  primaryName: string;
  primaryCategory?: string;
  pairedId: string;
  pairedName: string;
  pairedCategory?: string;
  coOccurrence: number;
  primaryCount: number;
  pairedCount: number;
  pairedPrice: number;
}

const runMarketBasketAnalysis = async (
  db: any,
  cfg: PairingConfig
): Promise<{ pairs: ItemPair[]; totalOrders: number }> => {
  try {
    // Get all order_items grouped by order, with item details
    const result = await db.query(
      `SELECT
         order.id AS order_id,
         array::group(item.id) AS item_ids,
         array::group(item.name) AS item_names,
         array::group(item.categories) AS item_categories,
         array::group(item.price) AS item_prices
       FROM order_item
       WHERE order.status = 'Paid'
         AND order.deleted_at IS NONE
         AND item IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY order
       FETCH order, item`
    );
    const orderRows = Array.isArray(result) ? result.flat() : [];
    if (orderRows.length === 0) return { pairs: [], totalOrders: 0 };

    const totalOrders = orderRows.length;

    // Count single-item frequencies
    const itemCounts = new Map<string, { name: string; category?: string; count: number; price: number }>();
    // Count co-occurrences
    const pairCounts = new Map<string, number>();

    for (const order of orderRows) {
      const itemIds = Array.isArray(order.item_ids) ? order.item_ids : [];
      const itemNames = Array.isArray(order.item_names) ? order.item_names : [];
      const itemCategories = Array.isArray(order.item_categories) ? order.item_categories : [];
      const itemPrices = Array.isArray(order.item_prices) ? order.item_prices : [];

      // Deduplicate items per order (count each item once per order)
      const seen = new Set<string>();
      const uniqueItems: Array<{ id: string; name: string; category?: string; price: number }> = [];
      for (let i = 0; i < itemIds.length; i++) {
        const id = itemIds[i]?.toString?.();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const cat = Array.isArray(itemCategories[i]) ? itemCategories[i][0] : itemCategories[i];
        uniqueItems.push({
          id,
          name: itemNames[i] ?? 'Unknown',
          category: cat,
          price: safeNumber(itemPrices[i], 0),
        });
      }

      // Update single counts
      for (const item of uniqueItems) {
        if (!itemCounts.has(item.id)) {
          itemCounts.set(item.id, { name: item.name, category: item.category, count: 0, price: item.price });
        }
        itemCounts.get(item.id)!.count++;
      }

      // Update pair counts (only if 2+ unique items)
      if (uniqueItems.length < 2) continue;
      for (let i = 0; i < uniqueItems.length; i++) {
        for (let j = i + 1; j < uniqueItems.length; j++) {
          // Consistent ordering: smaller id first
          const a = uniqueItems[i];
          const b = uniqueItems[j];
          const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    // Build pairs with metrics
    const pairs: ItemPair[] = [];
    for (const [key, coOccurrence] of pairCounts) {
      if (coOccurrence < cfg.minSupport) continue;
      const [idA, idB] = key.split('|');
      const itemA = itemCounts.get(idA);
      const itemB = itemCounts.get(idB);
      if (!itemA || !itemB) continue;

      // Confidence both directions, use the higher one (primary → paired)
      const confAB = coOccurrence / itemA.count;
      const confBA = coOccurrence / itemB.count;
      const primaryIsA = confAB >= confBA;
      const primary = primaryIsA ? itemA : itemB;
      const paired = primaryIsA ? itemB : itemA;
      const confidence = primaryIsA ? confAB : confBA;
      if (confidence < cfg.minConfidence) continue;

      // Lift = confidence / P(paired) = (coOccurrence / primary.count) / (paired.count / totalOrders)
      const pPaired = itemB.count / totalOrders; // P(paired)
      const lift = confidence / Math.max(0.001, pPaired);
      if (lift < cfg.minLift) continue;

      const support = coOccurrence / totalOrders;

      pairs.push({
        primaryId: idA, // keep canonical ordering for dedup
        primaryName: primary.name,
        primaryCategory: primary.category,
        pairedId: idB,
        pairedName: paired.name,
        pairedCategory: paired.category,
        coOccurrence,
        primaryCount: primary.count,
        pairedCount: paired.count,
        pairedPrice: paired.price,
      });
      // Store lift/confidence for tier classification — attach via map
      (pairs[pairs.length - 1] as any)._lift = lift;
      (pairs[pairs.length - 1] as any)._confidence = confidence;
      (pairs[pairs.length - 1] as any)._support = support;
    }

    return { pairs, totalOrders };
  } catch (err) {
    console.warn('[pairing] marketBasketAnalysis failed', err);
    return { pairs: [], totalOrders: 0 };
  }
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (pairings: MenuPairing[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || pairings.length === 0) return;

  const top = pairings.slice(0, 15);
  const prompt = `You are a restaurant menu pairing expert.
For each item pair below, provide:
  - reasoning: max 200 chars — why these items go together (flavor, cuisine, occasion)
  - pitch_script: max 150 chars — ready-to-say suggestion for staff to offer the paired item

Pairs (JSON):
${JSON.stringify(top.map(p => ({
  primary: p.primary_item_name,
  primary_category: p.primary_category,
  paired: p.paired_item_name,
  paired_category: p.paired_category,
  confidence: p.confidence,
  lift: p.lift,
  co_occurrence: p.co_occurrence_count,
})), null, 2)}

Respond with JSON array:
[{
  "primary": "<match primary_item_name>",
  "paired": "<match paired_item_name>",
  "reasoning": "<max 200 chars>",
  "pitch_script": "<max 150 chars>"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a menu pairing AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.5, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      primary: string; paired: string; reasoning?: string; pitch_script?: string;
    }>;
    for (const item of parsed) {
      const pairing = pairings.find(p =>
        p.primary_item_name === item.primary && p.paired_item_name === item.paired
      );
      if (pairing) {
        if (item.reasoning) pairing.ai_reasoning = item.reasoning.slice(0, 200);
        if (item.pitch_script) pairing.ai_pitch_script = item.pitch_script.slice(0, 150);
      }
    }
  } catch (err) { console.warn('[pairing] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runPairingAnalysis = async (
  db: ReturnType<typeof useDB>,
  config: PairingConfig = DEFAULT_PAIRING_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ pairings: MenuPairing[]; analyzed: number }> => {
  if (onProgress) onProgress(0, 3);

  // 1. Market basket analysis
  const { pairs, totalOrders } = await runMarketBasketAnalysis(db, config);
  if (onProgress) onProgress(1, 3);

  if (pairs.length === 0) {
    if (onProgress) onProgress(3, 3);
    return { pairings: [], analyzed: 0 };
  }

  // 2. Sort by lift × confidence (composite score) and take top N
  pairs.sort((a, b) => {
    const scoreA = (a as any)._lift * (a as any)._confidence;
    const scoreB = (b as any)._lift * (b as any)._confidence;
    return scoreB - scoreA;
  });
  const topPairs = pairs.slice(0, config.maxResults);

  // Compute P90 confidence for 'classic' tier threshold
  const confidences = topPairs.map(p => (p as any)._confidence).sort((a, b) => a - b);
  const p90Idx = Math.floor(confidences.length * 0.9);
  const confidenceP90 = confidences[p90Idx] ?? 1;

  // 3. Build MenuPairing objects
  const pairings: MenuPairing[] = topPairs.map(p => {
    const lift = (p as any)._lift;
    const confidence = (p as any)._confidence;
    const support = (p as any)._support;
    const tier = classifyTier(confidence, lift, confidenceP90);
    // est_revenue_lift: if we promote this pairing actively, expect 10% lift in attachment
    // = primary_count × 0.10 × paired_price (monthly est from lookback window)
    const monthsInLookback = config.lookbackDays / 30;
    const estMonthlyLift = (p.primaryCount / Math.max(1, monthsInLookback)) * 0.10 * p.pairedPrice;
    return {
      primary_item: p.primaryId,
      primary_item_name: p.primaryName,
      primary_category: p.primaryCategory,
      paired_item: p.pairedId,
      paired_item_name: p.pairedName,
      paired_category: p.pairedCategory,
      co_occurrence_count: p.coOccurrence,
      primary_count: p.primaryCount,
      paired_count: p.pairedCount,
      confidence: Math.round(confidence * 1000) / 1000,
      lift: Math.round(lift * 100) / 100,
      support: Math.round(support * 10000) / 10000,
      tier,
      est_revenue_lift: Math.round(estMonthlyLift * 100) / 100,
      analyzed_at: new Date(),
    };
  });

  if (onProgress) onProgress(2, 3);

  // 4. AI enhancement
  if (config.aiEnabled && pairings.length > 0) {
    await enhanceWithAI(pairings);
  }

  // 5. Persist (refresh — delete old, create new)
  try {
    await db.query(`DELETE FROM menu_pairing WHERE analyzed_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const pairing of pairings) {
    try {
      await db.query(`CREATE menu_pairing CONTENT $data`, {
        data: { ...pairing, analyzed_at: pairing.analyzed_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(3, 3);
  return { pairings, analyzed: totalOrders };
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const getMenuPairings = async (
  db: ReturnType<typeof useDB>
): Promise<MenuPairing[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM menu_pairing
       ORDER BY
         CASE tier WHEN 'opportunity' THEN 0 WHEN 'strong' THEN 1 ELSE 2 END,
         est_revenue_lift DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getPairingSummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  total: number;
  opportunity: number;
  strong: number;
  classic: number;
  totalRevenueLift: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(tier = 'opportunity') AS opportunity,
         math::count(tier = 'strong') AS strong,
         math::count(tier = 'classic') AS classic,
         math::sum(est_revenue_lift) AS total_lift
       FROM menu_pairing GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      opportunity: safeNumber(row.opportunity, 0),
      strong: safeNumber(row.strong, 0),
      classic: safeNumber(row.classic, 0),
      totalRevenueLift: safeNumber(row.total_lift, 0),
    };
  } catch {
    return { total: 0, opportunity: 0, strong: 0, classic: 0, totalRevenueLift: 0 };
  }
};
