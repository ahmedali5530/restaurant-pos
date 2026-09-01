/**
 * AI Upsell Effectiveness Analytics service — measure upsell conversion + impact.
 *
 * Research finding: Square Upsell Analytics + Toast Upsell Insights bundle
 * upsell performance measurement in higher tiers (~$35/mo). POSR offers it
 * free — persists upsell events (shown/accepted/declined) then computes
 * conversion rate + revenue lift + per-item effectiveness + AI insights.
 *
 * Architecture:
 *   1. recordUpsellShown — called when UpsellPrompt is displayed
 *   2. recordUpsellOutcome — called when user accepts/declines/timeouts
 *   3. computeEffectiveness — per-item + overall conversion/revenue metrics
 *   4. enhanceWithAI — OpenAI analyzes which items to feature more / remove
 *
 * Integration with existing UpsellPrompt component:
 *   - The component's onAccept/onDecline callbacks should call recordUpsellOutcome
 *   - A useEffect in the component calls recordUpsellShown on mount
 *
 * Metrics:
 *   - Conversion rate: accepted / shown × 100
 *   - Revenue lift: sum of accepted item prices
 *   - Avg ticket lift: revenue_lift / orders_with_upsell
 *   - Attachment rate: % orders with at least one accepted upsell
 *   - Grade: A (>=30%) / B (20-29%) / C (10-19%) / D (5-9%) / F (<5%)
 *
 * AI actions per item:
 *   - 'feature_more' — high converter, show more prominently
 *   - 'keep' — solid performer, maintain
 *   - 'rework' — low converter with high potential (rephrase/replace)
 *   - 'remove' — consistently fails, drop from suggestions
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpsellOutcome = 'shown' | 'accepted' | 'declined' | 'timeout';
export type UpsellPlacement = 'after_dish' | 'at_checkout' | 'kiosk';
export type UpsellGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type UpsellAction = 'feature_more' | 'keep' | 'rework' | 'remove';

export interface UpsellEvent {
  id?: string;
  order_id?: string;
  trigger_item_id?: string;
  trigger_item_name?: string;
  suggested_item_id?: string;
  suggested_item_name?: string;
  suggested_price: number;
  outcome: UpsellOutcome;
  placement: UpsellPlacement;
  hour_of_day?: number;
  day_of_week?: number;
  user_id?: string;
  terminal_id?: string;
  response_time_ms?: number;
  created_at: Date;
}

export interface UpsellEffectiveness {
  id?: string;
  item_id?: string;
  item_name?: string;
  period_start: Date;
  period_end: Date;
  times_shown: number;
  times_accepted: number;
  times_declined: number;
  times_timeout: number;
  conversion_rate: number;       // 0-100
  revenue_lift: number;
  avg_response_ms: number;
  grade: UpsellGrade;
  ai_insight?: string;
  ai_action?: UpsellAction;
  is_overall: boolean;
  generated_at: Date;
  expires_at?: Date;
}

export interface UpsellConfig {
  enabled: boolean;
  lookbackDays: number;
  aiEnabled: boolean;
  minShowsForEval: number;
}

export const DEFAULT_UPSELL_CONFIG: UpsellConfig = {
  enabled: true,
  lookbackDays: 30,
  aiEnabled: true,
  minShowsForEval: 10,
};

export const readUpsellConfig = (settings: any): UpsellConfig => ({
  enabled: settings?.upsell_analytics_enabled ?? true,
  lookbackDays: safeNumber(settings?.upsell_lookback_days, 30),
  aiEnabled: settings?.upsell_ai_enabled ?? true,
  minShowsForEval: safeNumber(settings?.upsell_min_shows_for_eval, 10),
});

// ---------------------------------------------------------------------------
// Event recording — called by UpsellPrompt component
// ---------------------------------------------------------------------------

export interface RecordShownInput {
  order_id?: string;
  trigger_item_id?: string;
  trigger_item_name?: string;
  suggested_item_id: string;
  suggested_item_name: string;
  suggested_price: number;
  placement?: UpsellPlacement;
  user_id?: string;
  terminal_id?: string;
}

export const recordUpsellShown = async (
  db: ReturnType<typeof useDB>,
  input: RecordShownInput
): Promise<string | null> => {
  try {
    const now = new Date();
    const result = await db.query<any>(
      `CREATE upsell_event CONTENT $data`,
      {
        data: {
          order_id: input.order_id,
          trigger_item_id: input.trigger_item_id,
          trigger_item_name: input.trigger_item_name,
          suggested_item_id: input.suggested_item_id,
          suggested_item_name: input.suggested_item_name,
          suggested_price: input.suggested_price,
          outcome: 'shown',
          placement: input.placement ?? 'after_dish',
          hour_of_day: now.getHours(),
          day_of_week: now.getDay(),
          user_id: input.user_id,
          terminal_id: input.terminal_id,
          created_at: now.toISOString(),
        },
      }
    );
    return (result as any)?.id?.toString?.() ?? null;
  } catch (err) {
    console.warn('[upsell-analytics] recordShown failed', err);
    return null;
  }
};

export interface RecordOutcomeInput {
  event_id: string;
  outcome: 'accepted' | 'declined' | 'timeout';
  response_time_ms?: number;
}

export const recordUpsellOutcome = async (
  db: ReturnType<typeof useDB>,
  input: RecordOutcomeInput
): Promise<void> => {
  try {
    await db.query(
      `UPDATE $id SET outcome = $outcome, response_time_ms = $rtms`,
      {
        id: input.event_id,
        outcome: input.outcome,
        rtms: input.response_time_ms,
      }
    );
  } catch (err) {
    console.warn('[upsell-analytics] recordOutcome failed', err);
  }
};

// ---------------------------------------------------------------------------
// Effectiveness computation
// ---------------------------------------------------------------------------

const computeGrade = (conversionRate: number, timesShown: number): UpsellGrade => {
  // Need enough data for statistical significance
  if (timesShown < 5) return 'C';
  if (conversionRate >= 30) return 'A';
  if (conversionRate >= 20) return 'B';
  if (conversionRate >= 10) return 'C';
  if (conversionRate >= 5) return 'D';
  return 'F';
};

const determineAction = (
  grade: UpsellGrade,
  _conversionRate: number,
  timesShown: number,
  revenueLift: number
): UpsellAction => {
  if (timesShown < 5) return 'keep'; // not enough data
  if (grade === 'A') return 'feature_more';
  if (grade === 'B') return 'keep';
  if (grade === 'C') return 'keep';
  if (grade === 'D') {
    // Low converter but high revenue → try rework
    return revenueLift > 50 ? 'rework' : 'remove';
  }
  // F
  return 'remove';
};

// ---------------------------------------------------------------------------
// Collect events + compute per-item + overall metrics
// ---------------------------------------------------------------------------

interface ItemAgg {
  item_id: string;
  item_name: string;
  shown: number;
  accepted: number;
  declined: number;
  timeout: number;
  revenue: number;
  responseTimes: number[];
}

export const computeEffectiveness = async (
  db: ReturnType<typeof useDB>,
  config: UpsellConfig = DEFAULT_UPSELL_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ items: UpsellEffectiveness[]; overall: UpsellEffectiveness | null }> => {
  if (onProgress) onProgress(0, 3);

  const cutoff = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);
  try {
    const result = await db.query<UpsellEvent[]>(
      `SELECT * FROM upsell_event WHERE created_at > $cutoff ORDER BY created_at DESC`,
      { cutoff: cutoff.toISOString() }
    );
    const events = Array.isArray(result) ? result.flat() : [];
    if (onProgress) onProgress(1, 3);

    if (events.length === 0) {
      return { items: [], overall: null };
    }

    // Aggregate by suggested_item_id
    const byItem = new Map<string, ItemAgg>();
    let totalShown = 0, totalAccepted = 0, totalDeclined = 0, totalTimeout = 0;
    let totalRevenue = 0;
    const allResponseTimes: number[] = [];

    for (const e of events) {
      const itemId = e.suggested_item_id ?? 'unknown';
      const itemName = e.suggested_item_name ?? 'Unknown';
      if (!byItem.has(itemId)) {
        byItem.set(itemId, {
          item_id: itemId, item_name: itemName,
          shown: 0, accepted: 0, declined: 0, timeout: 0,
          revenue: 0, responseTimes: [],
        });
      }
      const agg = byItem.get(itemId)!;
      if (e.outcome === 'shown') {
        agg.shown++;
        totalShown++;
      } else if (e.outcome === 'accepted') {
        agg.accepted++;
        agg.revenue += safeNumber(e.suggested_price, 0);
        totalAccepted++;
        totalRevenue += safeNumber(e.suggested_price, 0);
      } else if (e.outcome === 'declined') {
        agg.declined++;
        totalDeclined++;
      } else if (e.outcome === 'timeout') {
        agg.timeout++;
        totalTimeout++;
      }
      if (e.response_time_ms) {
        agg.responseTimes.push(e.response_time_ms);
        allResponseTimes.push(e.response_time_ms);
      }
    }

    // Build per-item effectiveness
    const items: UpsellEffectiveness[] = [];
    for (const agg of byItem.values()) {
      // Skip items with too few shows
      if (agg.shown < config.minShowsForEval) continue;
      const convRate = agg.shown > 0 ? (agg.accepted / agg.shown) * 100 : 0;
      const avgResponseMs = agg.responseTimes.length > 0
        ? agg.responseTimes.reduce((s, t) => s + t, 0) / agg.responseTimes.length
        : 0;
      const grade = computeGrade(convRate, agg.shown);
      const action = determineAction(grade, convRate, agg.shown, agg.revenue);
      items.push({
        item_id: agg.item_id,
        item_name: agg.item_name,
        period_start: cutoff,
        period_end: new Date(),
        times_shown: agg.shown,
        times_accepted: agg.accepted,
        times_declined: agg.declined,
        times_timeout: agg.timeout,
        conversion_rate: Math.round(convRate * 100) / 100,
        revenue_lift: Math.round(agg.revenue * 100) / 100,
        avg_response_ms: Math.round(avgResponseMs),
        grade,
        ai_action: action,
        is_overall: false,
        generated_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    // Sort by revenue_lift descending
    items.sort((a, b) => b.revenue_lift - a.revenue_lift);

    // Overall
    const overallConv = totalShown > 0 ? (totalAccepted / totalShown) * 100 : 0;
    const overallAvgResponse = allResponseTimes.length > 0
      ? allResponseTimes.reduce((s, t) => s + t, 0) / allResponseTimes.length
      : 0;
    const overall: UpsellEffectiveness = {
      period_start: cutoff,
      period_end: new Date(),
      times_shown: totalShown,
      times_accepted: totalAccepted,
      times_declined: totalDeclined,
      times_timeout: totalTimeout,
      conversion_rate: Math.round(overallConv * 100) / 100,
      revenue_lift: Math.round(totalRevenue * 100) / 100,
      avg_response_ms: Math.round(overallAvgResponse),
      grade: computeGrade(overallConv, totalShown),
      is_overall: true,
      generated_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    if (onProgress) onProgress(2, 3);

    // AI enhancement
    if (config.aiEnabled && items.length > 0) {
      await enhanceWithAI(items, overall);
    }

    // Persist (expire old first)
    try {
      await db.query(`UPDATE upsell_effectiveness SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
      // Persist overall
      await db.query(`CREATE upsell_effectiveness CONTENT $data`, {
        data: {
          ...overall,
          period_start: overall.period_start.toISOString(),
          period_end: overall.period_end.toISOString(),
          generated_at: overall.generated_at.toISOString(),
          expires_at: overall.expires_at?.toISOString(),
        },
      });
      // Persist per-item
      for (const item of items) {
        try {
          await db.query(`CREATE upsell_effectiveness CONTENT $data`, {
            data: {
              ...item,
              period_start: item.period_start.toISOString(),
              period_end: item.period_end.toISOString(),
              generated_at: item.generated_at.toISOString(),
              expires_at: item.expires_at?.toISOString(),
            },
          });
        } catch (err) {
          console.warn('[upsell-analytics] persist item failed', err);
        }
      }
    } catch (err) {
      console.warn('[upsell-analytics] persist batch failed', err);
    }

    if (onProgress) onProgress(3, 3);
    return { items, overall };
  } catch (err) {
    console.error('[upsell-analytics] computeEffectiveness failed', err);
    return { items: [], overall: null };
  }
};

// ---------------------------------------------------------------------------
// AI enhancement — per-item insights + actions
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  items: UpsellEffectiveness[],
  overall: UpsellEffectiveness
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[upsell-analytics] OpenAI not available — using rule-based actions');
    return;
  }

  const prompt = `You are a restaurant upsell optimization expert.
Analyze these upsell item performance metrics and provide per-item insights.

Overall:
  Conversion rate: ${overall.conversion_rate.toFixed(1)}%
  Revenue lift: $${overall.revenue_lift}
  Total shown: ${overall.times_shown}
  Total accepted: ${overall.times_accepted}

Top items (JSON):
${JSON.stringify(items.slice(0, 20).map(i => ({
  name: i.item_name,
  shown: i.times_shown,
  accepted: i.times_accepted,
  conversion: i.conversion_rate + '%',
  revenue: i.revenue_lift,
  grade: i.grade,
  current_action: i.ai_action,
})), null, 2)}

Respond with JSON array (only for items needing insight):
[{
  "name": "<match item name>",
  "insight": "<max 200 chars — why it's performing this way>",
  "action": "feature_more" | "keep" | "rework" | "remove"
}]

Focus on actionable recommendations — what to do differently.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant upsell optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      insight?: string;
      action?: UpsellAction;
    }>;

    for (const item of parsed) {
      const eff = items.find(i => i.item_name === item.name);
      if (!eff) continue;
      if (item.insight) eff.ai_insight = item.insight.slice(0, 200);
      if (item.action && ['feature_more', 'keep', 'rework', 'remove'].includes(item.action)) {
        eff.ai_action = item.action;
      }
    }
  } catch (err) {
    console.warn('[upsell-analytics] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getEffectiveness = async (
  db: ReturnType<typeof useDB>
): Promise<{ items: UpsellEffectiveness[]; overall: UpsellEffectiveness | null }> => {
  try {
    const result = await db.query<UpsellEffectiveness[]>(
      `SELECT * FROM upsell_effectiveness
       WHERE expires_at > time::now()
       ORDER BY is_overall DESC, revenue_lift DESC`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const overall = list.find(e => e.is_overall) ?? null;
    const items = list.filter(e => !e.is_overall);
    return { items, overall };
  } catch (err) {
    console.error('[upsell-analytics] getEffectiveness failed', err);
    return { items: [], overall: null };
  }
};
