/**
 * AI Customer Segmentation for Targeted Marketing — per-segment strategies.
 *
 * Research finding: Toast Customer Segmentation $40+/mo (higher tier), Square
 * Customer Segments in Plus. POSR offers it free — aggregates CLV data into
 * segment-level insights + AI generates per-segment marketing strategies.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type CustomerSegment = 'champion' | 'loyal' | 'potential' | 'new' | 'at_risk' | 'cant_lose' | 'hibernating';
export type MarketingChannel = 'email' | 'sms' | 'push' | 'social' | 'in_person' | 'none';
export type MarketingOffer = 'vip_perk' | 'discount' | 'free_item' | 'early_access' | 'winback' | 'welcome' | 'none';

export interface SegmentStrategy {
  id?: string;
  segment: CustomerSegment;
  customer_count: number;
  total_clv: number;
  avg_clv: number;
  avg_churn_risk: number;
  revenue_share_pct: number;
  loyalty_member_pct: number;
  recommended_channel?: MarketingChannel;
  recommended_offer?: MarketingOffer;
  recommended_frequency?: string;
  ai_strategy?: string;
  ai_campaign_idea?: string;
  projected_revenue_impact?: number;
  generated_at: Date;
}

export interface SegmentationConfig {
  aiEnabled: boolean;
}

export const DEFAULT_SEG_CONFIG: SegmentationConfig = {
  aiEnabled: true,
};

export const readSegConfig = (settings: any): SegmentationConfig => ({
  aiEnabled: settings?.segmentation_ai_enabled ?? true,
});

const SEGMENT_META: Record<CustomerSegment, { label: string; channel: MarketingChannel; offer: MarketingOffer; frequency: string }> = {
  champion:    { label: 'Champions',     channel: 'email',     offer: 'vip_perk',     frequency: 'monthly' },
  loyal:       { label: 'Loyal',          channel: 'email',     offer: 'early_access', frequency: 'biweekly' },
  potential:   { label: 'Potential',      channel: 'sms',       offer: 'discount',     frequency: 'biweekly' },
  new:         { label: 'New',            channel: 'email',     offer: 'welcome',      frequency: 'weekly' },
  at_risk:     { label: 'At Risk',        channel: 'sms',       offer: 'discount',     frequency: 'weekly' },
  cant_lose:   { label: "Can't Lose",    channel: 'in_person', offer: 'vip_perk',     frequency: 'weekly' },
  hibernating: { label: 'Hibernating',   channel: 'email',     offer: 'winback',      frequency: 'quarterly' },
};

// ---------------------------------------------------------------------------
// Aggregate CLV data per segment
// ---------------------------------------------------------------------------

export const computeSegmentStrategies = async (
  db: ReturnType<typeof useDB>,
  config: SegmentationConfig = DEFAULT_SEG_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ strategies: SegmentStrategy[]; totalCLV: number }> => {
  if (onProgress) onProgress(0, 3);

  // Fetch all CLV records
  let result;
  try {
    result = await db.query(
      `SELECT segment, total_clv, churn_risk, is_loyalty_member
       FROM customer_clv
       WHERE expires_at > time::now()`
    );
  } catch (err) {
    console.error('[segmentation] fetch CLV failed', err);
    return { strategies: [], totalCLV: 0 };
  }
  const rows = Array.isArray(result) ? result.flat() : [];
  if (rows.length === 0) {
    return { strategies: [], totalCLV: 0 };
  }
  if (onProgress) onProgress(1, 3);

  // Aggregate per segment
  const bySegment = new Map<CustomerSegment, {
    count: number; totalCLV: number; totalChurn: number; loyaltyMembers: number;
  }>();

  for (const row of rows) {
    const seg = row.segment as CustomerSegment;
    if (!seg) continue;
    if (!bySegment.has(seg)) {
      bySegment.set(seg, { count: 0, totalCLV: 0, totalChurn: 0, loyaltyMembers: 0 });
    }
    const data = bySegment.get(seg)!;
    data.count++;
    data.totalCLV += safeNumber(row.total_clv, 0);
    data.totalChurn += safeNumber(row.churn_risk, 0);
    if (row.is_loyalty_member) data.loyaltyMembers++;
  }

  const totalCLV = Array.from(bySegment.values()).reduce((s, d) => s + d.totalCLV, 0);

  const strategies: SegmentStrategy[] = [];
  for (const [segment, data] of bySegment) {
    const meta = SEGMENT_META[segment];
    const avgCLV = data.count > 0 ? data.totalCLV / data.count : 0;
    const avgChurn = data.count > 0 ? data.totalChurn / data.count : 0;
    const revenueShare = totalCLV > 0 ? (data.totalCLV / totalCLV) * 100 : 0;
    const loyaltyPct = data.count > 0 ? (data.loyaltyMembers / data.count) * 100 : 0;

    strategies.push({
      segment,
      customer_count: data.count,
      total_clv: Math.round(data.totalCLV * 100) / 100,
      avg_clv: Math.round(avgCLV * 100) / 100,
      avg_churn_risk: Math.round(avgChurn * 100) / 100,
      revenue_share_pct: Math.round(revenueShare * 10) / 10,
      loyalty_member_pct: Math.round(loyaltyPct * 10) / 10,
      recommended_channel: meta.channel,
      recommended_offer: meta.offer,
      recommended_frequency: meta.frequency,
      generated_at: new Date(),
    });
  }

  // Sort by total CLV descending
  strategies.sort((a, b) => b.total_clv - a.total_clv);
  if (onProgress) onProgress(2, 3);

  // AI enhancement
  if (config.aiEnabled && strategies.length > 0) {
    await enhanceWithAI(strategies, totalCLV);
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE segment_strategy SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const strategy of strategies) {
      try {
        await db.query(`CREATE segment_strategy CONTENT $data`, {
          data: {
            ...strategy,
            generated_at: strategy.generated_at.toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch {
        // Non-fatal
      }
    }
  } catch (err) {
    console.warn('[segmentation] persist failed', err);
  }

  return { strategies, totalCLV: Math.round(totalCLV * 100) / 100 };
};

// ---------------------------------------------------------------------------
// AI enhancement — per-segment strategy + campaign idea
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  strategies: SegmentStrategy[],
  totalCLV: number
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[segmentation] OpenAI not available — using rule-based');
    // Fill in rule-based strategies
    for (const s of strategies) {
      s.ai_strategy = generateRuleBasedStrategy(s);
      s.ai_campaign_idea = generateRuleBasedCampaign(s);
      s.projected_revenue_impact = s.total_clv * 0.05; // 5% uplift estimate
    }
    return;
  }

  const prompt = `You are a restaurant marketing strategist.
Generate per-segment marketing strategies for targeted campaigns.

Total customer CLV: $${totalCLV.toFixed(0)}

Segments (JSON):
${JSON.stringify(strategies.map(s => ({
  segment: s.segment,
  customers: s.customer_count,
  total_clv: s.total_clv,
  avg_clv: s.avg_clv,
  avg_churn_risk: s.avg_churn_risk,
  revenue_share: s.revenue_share_pct + '%',
  loyalty_pct: s.loyalty_member_pct + '%',
  recommended_channel: s.recommended_channel,
  recommended_offer: s.recommended_offer,
  recommended_frequency: s.recommended_frequency,
})), null, 2)}

Respond with JSON array:
[{
  "segment": "<match segment>",
  "strategy": "<max 500 chars — full marketing strategy for this segment>",
  "campaign_idea": "<max 200 chars — specific campaign name + concept>",
  "projected_revenue_impact": <number — estimated monthly revenue uplift>
}]

Focus on: what to offer, how to communicate, what outcome to expect.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant marketing strategy AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 2000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      for (const s of strategies) {
        s.ai_strategy = generateRuleBasedStrategy(s);
        s.ai_campaign_idea = generateRuleBasedCampaign(s);
        s.projected_revenue_impact = s.total_clv * 0.05;
      }
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      segment: string;
      strategy?: string;
      campaign_idea?: string;
      projected_revenue_impact?: number;
    }>;

    for (const item of parsed) {
      const strategy = strategies.find(s => s.segment === item.segment);
      if (!strategy) continue;
      if (item.strategy) strategy.ai_strategy = item.strategy.slice(0, 500);
      if (item.campaign_idea) strategy.ai_campaign_idea = item.campaign_idea.slice(0, 200);
      if (item.projected_revenue_impact) {
        strategy.projected_revenue_impact = Math.round(item.projected_revenue_impact * 100) / 100;
      }
    }
  } catch (err) {
    console.warn('[segmentation] AI enhancement failed', err);
    for (const s of strategies) {
      s.ai_strategy = generateRuleBasedStrategy(s);
      s.ai_campaign_idea = generateRuleBasedCampaign(s);
      s.projected_revenue_impact = s.total_clv * 0.05;
    }
  }
};

const generateRuleBasedStrategy = (s: SegmentStrategy): string => {
  switch (s.segment) {
    case 'champion':
      return `VIP treatment: invite to exclusive tasting events, recognize by name, offer chef's table. ${s.customer_count} customers representing ${s.revenue_share_pct}% of CLV. Retention is critical — these are your best customers.`;
    case 'loyal':
      return `Early access to new menu items + loyalty point bonuses. ${s.customer_count} customers. Encourage frequency increase through "visit X times, get Y free" campaigns.`;
    case 'potential':
      return `Convert to loyal: offer first-visit discount on their next visit. ${s.customer_count} customers who are recent but infrequent — nurture with targeted promotions.`;
    case 'new':
      return `Welcome series: introduce loyalty program + highlight best sellers. ${s.customer_count} first-time customers — maximize second-visit conversion.`;
    case 'at_risk':
      return `Reactivation: personalized "we miss you" message + special comeback offer. ${s.customer_count} customers with ${s.avg_churn_risk * 100}% avg churn risk — act now.`;
    case 'cant_lose':
      return `URGENT: personal phone call from manager + VIP welcome-back experience. ${s.customer_count} top customers who haven't visited recently. Revenue at risk: $${s.total_clv.toFixed(0)}.`;
    case 'hibernating':
      return `Win-back email with "we've changed" message + deep discount. ${s.customer_count} inactive customers. Low investment, potential upside if reactivated.`;
    default:
      return 'Monitor segment.';
  }
};

const generateRuleBasedCampaign = (s: SegmentStrategy): string => {
  switch (s.segment) {
    case 'champion': return '"VIP Tasting Night" — exclusive preview of new seasonal menu';
    case 'loyal': return '"Double Points Week" — earn 2x loyalty points on all orders';
    case 'potential': return '"Come Back & Save" — 20% off next visit within 14 days';
    case 'new': return '"Welcome to the Family" — free dessert on second visit';
    case 'at_risk': return '"We Miss You" — personalized 25% off comeback offer';
    case 'cant_lose': return '"Manager Invitation" — personal call + complimentary appetizer';
    case 'hibernating': return '"We Changed" — 30% off + showcase new menu items';
    default: return 'General promotion';
  }
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getSegmentStrategies = async (
  db: ReturnType<typeof useDB>
): Promise<SegmentStrategy[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM segment_strategy
       WHERE expires_at > time::now()
       ORDER BY total_clv DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[segmentation] getSegmentStrategies failed', err);
    return [];
  }
};
