/**
 * AI Competitor Price Monitoring service — track competitor prices + AI recs.
 *
 * Research finding: Toast Competitor Insights $45+/mo (higher tier), Square
 * Menu Benchmarking in Plus. POSR offers it free — operators manually enter
 * competitor menu prices + the system compares them against POSR's prices +
 * AI generates pricing recommendations (match/undercut/premium/keep/review).
 *
 * Strategy recommendations (AI):
 *   MATCH     — competitor within ±5% → match their price
 *   UNDERCUT  — we're >10% more expensive on popular items → undercut by 2-3%
 *   PREMIUM   — we're priced higher but have higher quality/sentiment → maintain premium
 *   KEEP      — we're cheaper → keep current pricing (competitive advantage)
 *   REVIEW    — large gap on slow-selling item → review pricing strategy
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PricePosition = 'premium' | 'matching' | 'discount';
export type CompetitorRecommendation = 'match' | 'undercut' | 'premium' | 'keep' | 'review';

export interface CompetitorPrice {
  id?: string;
  dish_id: string;
  dish_name: string;
  our_price: number;
  competitor_name: string;
  competitor_price_value: number;
  price_diff: number;
  price_diff_pct: number;
  position: PricePosition;
  location_distance_km?: number;
  source: string;
  ai_recommendation?: CompetitorRecommendation;
  ai_insight?: string;
  collected_at: Date;
}

export interface CompetitorConfig {
  enabled: boolean;
  aiEnabled: boolean;
  lookbackDays: number;
}

export const DEFAULT_COMPETITOR_CONFIG: CompetitorConfig = {
  enabled: true,
  aiEnabled: true,
  lookbackDays: 90,
};

export const readCompetitorConfig = (settings: any): CompetitorConfig => ({
  enabled: settings?.competitor_monitor_enabled ?? true,
  aiEnabled: settings?.competitor_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.competitor_lookback_days, 90),
});

// ---------------------------------------------------------------------------
// Add competitor price entry
// ---------------------------------------------------------------------------

export interface AddCompetitorPriceInput {
  dish_id: string;
  dish_name: string;
  our_price: number;
  competitor_name: string;
  competitor_price_value: number;
  location_distance_km?: number;
  source?: string;
}

const computePosition = (diffPct: number): PricePosition => {
  if (diffPct > 10) return 'premium';
  if (diffPct < -10) return 'discount';
  return 'matching';
};

const determineRecommendation = (
  position: PricePosition,
  diffPct: number,
): CompetitorRecommendation => {
  if (Math.abs(diffPct) <= 5) return 'match';
  if (position === 'premium' && diffPct > 20) return 'undercut';
  if (position === 'premium') return 'review';
  if (position === 'discount') return 'keep';
  return 'keep';
};

export const addCompetitorPrice = async (
  db: ReturnType<typeof useDB>,
  input: AddCompetitorPriceInput
): Promise<CompetitorPrice | null> => {
  const priceDiff = input.our_price - input.competitor_price_value;
  const priceDiffPct = input.competitor_price_value > 0
    ? (priceDiff / input.competitor_price_value) * 100
    : 0;
  const position = computePosition(priceDiffPct);
  const recommendation = determineRecommendation(position, priceDiffPct);

  const entry: CompetitorPrice = {
    dish_id: input.dish_id,
    dish_name: input.dish_name,
    our_price: input.our_price,
    competitor_name: input.competitor_name,
    competitor_price_value: input.competitor_price_value,
    price_diff: Math.round(priceDiff * 100) / 100,
    price_diff_pct: Math.round(priceDiffPct * 10) / 10,
    position,
    location_distance_km: input.location_distance_km,
    source: input.source ?? 'manual',
    ai_recommendation: recommendation,
    collected_at: new Date(),
  };

  // AI insight
  if (readCompetitorConfig({}).aiEnabled) {
    entry.ai_insight = generateInsight(entry);
  }

  try {
    const result = await db.query(
      `CREATE competitor_price CONTENT $data`,
      {
        data: {
          ...entry,
          dish: entry.dish_id,
          collected_at: entry.collected_at.toISOString(),
        },
      }
    );
    entry.id = (result as any)?.id?.toString?.() ?? '';
    return entry;
  } catch (err) {
    console.error('[competitor] addCompetitorPrice failed', err);
    return null;
  }
};

const generateInsight = (entry: CompetitorPrice): string => {
  const diff = entry.price_diff_pct;
  if (Math.abs(diff) <= 5) {
    return `Prices are within ${Math.abs(diff).toFixed(1)}% of ${entry.competitor_name}. Competitive parity — no action needed.`;
  }
  if (entry.position === 'premium') {
    return `We're ${diff.toFixed(1)}% more expensive than ${entry.competitor_name} for ${entry.dish_name}. Consider undercutting or justifying premium with quality/sentiment.`;
  }
  return `We're ${Math.abs(diff).toFixed(1)}% cheaper than ${entry.competitor_name} for ${entry.dish_name}. Competitive advantage — maintain or slightly raise for margin.`;
};

// ---------------------------------------------------------------------------
// Batch import (for AI photo scan or delivery app import)
// ---------------------------------------------------------------------------

export const batchImportCompetitorPrices = async (
  db: ReturnType<typeof useDB>,
  competitorName: string,
  entries: Array<{ dish_id: string; dish_name: string; our_price: number; competitor_price_value: number }>
): Promise<{ added: number; errors: number }> => {
  let added = 0;
  let errors = 0;
  for (const entry of entries) {
    const result = await addCompetitorPrice(db, {
      ...entry,
      competitor_name: competitorName,
      source: 'batch_import',
    });
    if (result) added++;
    else errors++;
  }
  return { added, errors };
};

// ---------------------------------------------------------------------------
// AI enhancement — analyze all prices + generate strategic recommendations
// ---------------------------------------------------------------------------

export const enhanceWithAI = async (
  db: ReturnType<typeof useDB>
): Promise<{ enhanced: number; summary?: string }> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[competitor] OpenAI not available');
    return { enhanced: 0 };
  }

  // Fetch all recent competitor prices
  const result = await db.query(
    `SELECT * FROM competitor_price ORDER BY collected_at DESC LIMIT 100`
  );
  const prices: CompetitorPrice[] = Array.isArray(result) ? result.flat() : [];
  if (prices.length === 0) return { enhanced: 0 };

  const prompt = `You are a restaurant competitive pricing strategist.
Analyze these competitor price comparisons and provide strategic recommendations.

Prices (JSON):
${JSON.stringify(prices.slice(0, 30).map(p => ({
  dish: p.dish_name,
  our_price: p.our_price,
  competitor: p.competitor_name,
  competitor_price: p.competitor_price_value,
  diff_pct: p.price_diff_pct + '%',
  position: p.position,
  current_rec: p.ai_recommendation,
})), null, 2)}

Respond with JSON:
{
  "summary": "<max 300 chars — overall competitive position assessment>",
  "recommendations": [{"dish_name": "...", "recommendation": "match"|"undercut"|"premium"|"keep"|"review", "insight": "<max 150 chars>"}]
}`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant competitive pricing AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { enhanced: 0 };
    const parsed = JSON.parse(jsonMatch[0]);

    // Update each price with AI recommendation
    let enhanced = 0;
    for (const rec of (parsed.recommendations ?? [])) {
      const price = prices.find(p => p.dish_name === rec.dish_name);
      if (price?.id) {
        try {
          await db.query(
            `UPDATE $id SET ai_recommendation = $rec, ai_insight = $insight`,
            { id: price.id, rec: rec.recommendation, insight: rec.insight?.slice(0, 300) }
          );
          enhanced++;
        } catch {
          // Non-fatal
        }
      }
    }

    return { enhanced, summary: parsed.summary };
  } catch (err) {
    console.warn('[competitor] AI enhancement failed', err);
    return { enhanced: 0 };
  }
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getCompetitorPrices = async (
  db: ReturnType<typeof useDB>
): Promise<CompetitorPrice[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM competitor_price ORDER BY collected_at DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[competitor] getCompetitorPrices failed', err);
    return [];
  }
};

export interface CompetitorSummary {
  totalCompared: number;
  premiumCount: number;
  matchingCount: number;
  discountCount: number;
  avgDiffPct: number;
  competitors: string[];
  matchCount: number;
  undercutCount: number;
  keepCount: number;
  reviewCount: number;
  premiumRecCount: number;
}

export const getCompetitorSummary = async (
  db: ReturnType<typeof useDB>
): Promise<CompetitorSummary | null> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         sum(IF position = 'premium' THEN 1 ELSE 0 END) AS premium,
         sum(IF position = 'matching' THEN 1 ELSE 0 END) AS matching,
         sum(IF position = 'discount' THEN 1 ELSE 0 END) AS discount,
         avg(price_diff_pct) AS avg_diff,
         array::distinct(competitor_name) AS competitors,
         sum(IF ai_recommendation = 'match' THEN 1 ELSE 0 END) AS match_rec,
         sum(IF ai_recommendation = 'undercut' THEN 1 ELSE 0 END) AS undercut_rec,
         sum(IF ai_recommendation = 'keep' THEN 1 ELSE 0 END) AS keep_rec,
         sum(IF ai_recommendation = 'review' THEN 1 ELSE 0 END) AS review_rec,
         sum(IF ai_recommendation = 'premium' THEN 1 ELSE 0 END) AS premium_rec
       FROM competitor_price`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0];
    if (!r) return null;
    return {
      totalCompared: safeNumber(r.total, 0),
      premiumCount: safeNumber(r.premium, 0),
      matchingCount: safeNumber(r.matching, 0),
      discountCount: safeNumber(r.discount, 0),
      avgDiffPct: Math.round(safeNumber(r.avg_diff, 0) * 10) / 10,
      competitors: Array.isArray(r.competitors) ? r.competitors : [],
      matchCount: safeNumber(r.match_rec, 0),
      undercutCount: safeNumber(r.undercut_rec, 0),
      keepCount: safeNumber(r.keep_rec, 0),
      reviewCount: safeNumber(r.review_rec, 0),
      premiumRecCount: safeNumber(r.premium_rec, 0),
    };
  } catch (err) {
    console.error('[competitor] getCompetitorSummary failed', err);
    return null;
  }
};
