/**
 * AI Customer Milestone Campaign Generator — birthday/anniversary campaigns.
 *
 * 55th POSR-exclusive differentiator — birthday/anniversary marketing has
 * 3-5x higher open rates and 2-3x higher redemption rates (Experian, DMA).
 * 60% of consumers visit a restaurant for their birthday (NRA). Yet most
 * restaurants don't systematically track or act on customer milestones.
 *
 * Distinct from:
 *   - winback.service (targets churned customers — birthday is just ONE factor)
 *   - marketing.service (generic email/SMS campaigns — NOT milestone-specific)
 *   - loyalty-roi.service (predicts ROI of enrollment — NOT milestone campaigns)
 *   - churn.service (predicts departure — NOT celebration campaigns)
 *   - journey.service (tracks lifecycle stages — doesn't generate campaigns)
 *
 * Detects: birthdays, first-visit anniversaries, loyalty tier milestones,
 * visit count milestones (10/25/50/100), spend milestones ($500/$1k/$5k).
 * Generates personalized campaign per milestone with offer + message + channel.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MilestoneRuleId =
  | 'birthday'
  | 'anniversary'
  | 'tier_milestone'
  | 'visit_count'
  | 'spend_milestone';

export type MilestoneAiRec =
  | 'send_now'
  | 'schedule_7d_before'
  | 'schedule_14d_before'
  | 'personal_call'
  | 'monitor';

export type SuggestedOffer =
  | 'free_appetizer'
  | 'free_dessert'
  | 'discount_15pct'
  | 'discount_25pct'
  | 'free_drink'
  | 'vip_table'
  | 'chef_tasting';

export type SuggestedChannel = 'email' | 'sms' | 'push' | 'call';

export interface MilestoneCampaign {
  id?: string;
  rule_id: MilestoneRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  milestone_type: string;
  milestone_date?: Date;
  days_until_milestone: number;
  customer_ltv: number;
  suggested_offer?: SuggestedOffer;
  est_offer_cost: number;
  est_revenue_lift: number;
  suggested_channel?: SuggestedChannel;
  suggested_send_date?: Date;
  message_template?: string;
  description: string;
  ai_insight?: string;
  ai_recommendation?: MilestoneAiRec;
  status: 'open' | 'sent' | 'responded' | 'visited' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface MilestoneConfig {
  aiEnabled: boolean;
  lookaheadDays: number;
  sendOffsetDays: number;
  minLtvForVip: number;
}

export const DEFAULT_MILESTONE_CONFIG: MilestoneConfig = {
  aiEnabled: true,
  lookaheadDays: 30,
  sendOffsetDays: 7,
  minLtvForVip: 500,
};

export const readMilestoneConfig = (settings: any): MilestoneConfig => ({
  aiEnabled: settings?.milestone_ai_enabled ?? true,
  lookaheadDays: safeNumber(settings?.milestone_lookahead_days, 30),
  sendOffsetDays: safeNumber(settings?.milestone_send_offset_days, 7),
  minLtvForVip: safeNumber(settings?.milestone_min_ltv_for_vip, 500),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Offer cost estimates (restaurant cost, not customer value)
const OFFER_COSTS: Record<SuggestedOffer, number> = {
  free_appetizer: 8,
  free_dessert: 5,
  discount_15pct: 12,  // avg ticket $80 × 15%
  discount_25pct: 20,
  free_drink: 4,
  vip_table: 0,        // no direct cost (table assignment)
  chef_tasting: 30,    // multi-course tasting
};

// Estimated revenue lift from milestone visit
// (customers spend 2-3x more on celebration visits — Experian)
const estimateRevenueLift = (customerLtv: number, offer: SuggestedOffer): number => {
  const avgTicket = customerLtv > 0 ? customerLtv / 10 : 40; // estimate 10 visits
  const celebrationMultiplier = 2.5; // 2.5x normal spend on celebrations
  const additionalGuests = 2; // celebration visits bring more people
  return Math.round(avgTicket * celebrationMultiplier * (1 + additionalGuests) * 100) / 100;
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface CustomerData {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  birthday?: string;        // ISO date or MM-DD
  first_visit_date?: string;
  total_orders: number;
  total_spend: number;
  loyalty_tier?: string;
  lifetime_points?: number;
}

/**
 * Run the milestone campaign generator engine.
 * Fetches customer data, detects upcoming milestones, generates campaigns.
 */
export const runMilestoneEngine = async (
  db: ReturnType<typeof useDB>,
  config: MilestoneConfig = DEFAULT_MILESTONE_CONFIG
): Promise<{ campaigns: MilestoneCampaign[]; generated: number }> => {
  const campaigns: MilestoneCampaign[] = [];
  const now = new Date();

  // 1. Fetch customers with order history
  let customers: CustomerData[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         name,
         email,
         phone,
         birthday,
         created_at AS first_visit_date,
         points AS lifetime_points,
         tags
       FROM customer
       WHERE deleted_at IS NONE
       LIMIT 200`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Fetch order stats per customer
    let orderStats: Map<string, { count: number; spend: number }> = new Map();
    try {
      const statsResult = await db.query(
        `SELECT
           customer.id AS customer_id,
           count() AS order_count,
           math::sum(total) AS total_spend
         FROM order
         WHERE status = 'Paid' AND deleted_at IS NONE
           AND customer IS NOT NONE
         GROUP BY customer.id`
      );
      const statsRows = Array.isArray(statsResult) ? statsResult.flat() : [];
      for (const s of statsRows) {
        orderStats.set(String(s.customer_id), {
          count: safeNumber(s.order_count, 0),
          spend: safeNumber(s.total_spend, 0),
        });
      }
    } catch (err) {
      console.warn('[milestone] fetchOrderStats failed', err);
    }

    customers = rows.map((r: any) => {
      const stats = orderStats.get(String(r.id)) ?? { count: 0, spend: 0 };
      const tags = Array.isArray(r.tags) ? r.tags : [];
      // Infer loyalty tier from tags or points
      const tier = tags.find((t: string) => ['bronze', 'silver', 'gold', 'platinum'].includes(t))
        ?? (safeNumber(r.lifetime_points, 0) > 1500 ? 'platinum'
          : safeNumber(r.lifetime_points, 0) > 500 ? 'gold'
          : safeNumber(r.lifetime_points, 0) > 100 ? 'silver' : 'bronze');
      return {
        id: String(r.id ?? ''),
        name: String(r.name ?? 'Unknown'),
        email: r.email ?? undefined,
        phone: r.phone ? String(r.phone) : undefined,
        birthday: r.birthday ?? undefined,
        first_visit_date: r.first_visit_date ?? undefined,
        total_orders: stats.count,
        total_spend: stats.spend,
        loyalty_tier: tier,
        lifetime_points: safeNumber(r.lifetime_points, 0),
      };
    }).filter(c => c.total_orders > 0);
  } catch (err) {
    console.warn('[milestone] fetchCustomers failed', err);
  }

  if (customers.length === 0) return { campaigns: [], generated: 0 };

  // 2. Detect milestones per customer
  for (const customer of customers) {
    const isVip = customer.total_spend >= config.minLtvForVip;

    // --- Rule 1: BIRTHDAY ---
    if (customer.birthday) {
      const birthday = parseBirthday(customer.birthday, now);
      if (birthday) {
        const daysUntil = daysUntilDate(birthday, now);
        if (daysUntil >= 0 && daysUntil <= config.lookaheadDays) {
          const offer = isVip ? 'chef_tasting' : 'free_dessert';
          const sendDate = new Date(birthday.getTime() - config.sendOffsetDays * 24 * 60 * 60 * 1000);
          const channel = customer.phone ? 'sms' : customer.email ? 'email' : 'push';
          campaigns.push({
            rule_id: 'birthday',
            severity: daysUntil < 7 ? 'high' : 'medium',
            customer_id: customer.id,
            customer_name: customer.name,
            customer_email: customer.email,
            customer_phone: customer.phone,
            milestone_type: 'birthday',
            milestone_date: birthday,
            days_until_milestone: daysUntil,
            customer_ltv: customer.total_spend,
            suggested_offer: offer,
            est_offer_cost: OFFER_COSTS[offer],
            est_revenue_lift: estimateRevenueLift(customer.total_spend, offer),
            suggested_channel: channel,
            suggested_send_date: sendDate,
            description: `${customer.name}'s birthday in ${daysUntil}d (LTV ${fmt$(customer.total_spend)}) — ${offer} via ${channel}`,
            ai_recommendation: daysUntil < 7 ? 'send_now' : 'schedule_7d_before',
            status: 'open',
            detected_at: now,
          });
        }
      }
    }

    // --- Rule 2: FIRST VISIT ANNIVERSARY ---
    if (customer.first_visit_date) {
      const firstVisit = new Date(customer.first_visit_date);
      const anniversary = new Date(now.getFullYear(), firstVisit.getMonth(), firstVisit.getDate());
      // If anniversary already passed this year, check next year
      if (anniversary < now) {
        anniversary.setFullYear(now.getFullYear() + 1);
      }
      const daysUntil = Math.floor((anniversary.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const yearsAsCustomer = now.getFullYear() - firstVisit.getFullYear();

      if (daysUntil >= 0 && daysUntil <= config.lookaheadDays && yearsAsCustomer >= 1) {
        const offer = yearsAsCustomer >= 5 ? 'chef_tasting' : yearsAsCustomer >= 3 ? 'discount_25pct' : 'free_appetizer';
        const sendDate = new Date(anniversary.getTime() - config.sendOffsetDays * 24 * 60 * 60 * 1000);
        const channel = customer.email ? 'email' : customer.phone ? 'sms' : 'push';
        campaigns.push({
          rule_id: 'anniversary',
          severity: yearsAsCustomer >= 5 ? 'high' : 'medium',
          customer_id: customer.id,
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone,
          milestone_type: 'first_visit_anniversary',
          milestone_date: anniversary,
          days_until_milestone: daysUntil,
          customer_ltv: customer.total_spend,
          suggested_offer: offer,
          est_offer_cost: OFFER_COSTS[offer],
          est_revenue_lift: estimateRevenueLift(customer.total_spend, offer),
          suggested_channel: channel,
          suggested_send_date: sendDate,
          description: `${customer.name}'s ${yearsAsCustomer}yr anniversary in ${daysUntil}d — ${offer} via ${channel}`,
          ai_recommendation: 'schedule_7d_before',
          status: 'open',
          detected_at: now,
        });
      }
    }

    // --- Rule 3: TIER MILESTONE — approaching next loyalty tier ---
    const TIER_THRESHOLDS: Record<string, { next: string; threshold: number }> = {
      bronze: { next: 'silver', threshold: 100 },
      silver: { next: 'gold', threshold: 500 },
      gold: { next: 'platinum', threshold: 1500 },
    };
    const currentTier = customer.loyalty_tier ?? 'bronze';
    const tierInfo = TIER_THRESHOLDS[currentTier];
    if (tierInfo) {
      const points = customer.lifetime_points;
      const ratio = points / tierInfo.threshold;
      // Alert if within 15% of next tier (85-99%)
      if (ratio >= 0.85 && ratio < 1) {
        const pointsNeeded = Math.ceil(tierInfo.threshold - points);
        const offer = 'discount_15pct';
        campaigns.push({
          rule_id: 'tier_milestone',
          severity: 'high',
          customer_id: customer.id,
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone,
          milestone_type: 'tier_upgrade',
          milestone_date: now,
          days_until_milestone: 0,
          customer_ltv: customer.total_spend,
          suggested_offer: offer,
          est_offer_cost: OFFER_COSTS[offer],
          est_revenue_lift: estimateRevenueLift(customer.total_spend, offer),
          suggested_channel: customer.phone ? 'sms' : 'email',
          suggested_send_date: now,
          description: `${customer.name} is ${pointsNeeded} pts from ${tierInfo.next} tier (${points}/${tierInfo.threshold}) — nudge with offer`,
          ai_recommendation: 'send_now',
          status: 'open',
          detected_at: now,
        });
      }
    }

    // --- Rule 4: VISIT COUNT MILESTONES (10/25/50/100) ---
    const VISIT_MILESTONES = [10, 25, 50, 100];
    for (const milestone of VISIT_MILESTONES) {
      if (customer.total_orders === milestone) {
        // Exactly hit milestone this visit
        const offer = milestone >= 50 ? 'chef_tasting' : milestone >= 25 ? 'vip_table' : 'free_drink';
        campaigns.push({
          rule_id: 'visit_count',
          severity: milestone >= 50 ? 'high' : 'medium',
          customer_id: customer.id,
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone,
          milestone_type: `visit_${milestone}`,
          milestone_date: now,
          days_until_milestone: 0,
          customer_ltv: customer.total_spend,
          suggested_offer: offer,
          est_offer_cost: OFFER_COSTS[offer],
          est_revenue_lift: estimateRevenueLift(customer.total_spend, offer),
          suggested_channel: 'email',
          suggested_send_date: now,
          description: `${customer.name} just reached ${milestone} visits! — celebrate with ${offer}`,
          ai_recommendation: 'send_now',
          status: 'open',
          detected_at: now,
        });
      }
    }

    // --- Rule 5: SPEND MILESTONES ($500/$1k/$5k) ---
    const SPEND_MILESTONES = [500, 1000, 5000];
    for (const milestone of SPEND_MILESTONES) {
      // Check if customer crossed milestone recently (within last 7 days of spend)
      // Since we don't have exact crossing date, check if total is close
      if (customer.total_spend >= milestone && customer.total_spend < milestone * 1.05) {
        const offer = milestone >= 5000 ? 'chef_tasting' : milestone >= 1000 ? 'vip_table' : 'free_appetizer';
        campaigns.push({
          rule_id: 'spend_milestone',
          severity: milestone >= 1000 ? 'high' : 'medium',
          customer_id: customer.id,
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone,
          milestone_type: `spend_${milestone}`,
          milestone_date: now,
          days_until_milestone: 0,
          customer_ltv: customer.total_spend,
          suggested_offer: offer,
          est_offer_cost: OFFER_COSTS[offer],
          est_revenue_lift: estimateRevenueLift(customer.total_spend, offer),
          suggested_channel: 'email',
          suggested_send_date: now,
          description: `${customer.name} crossed ${fmt$(milestone)} lifetime spend! — celebrate with ${offer}`,
          ai_recommendation: 'send_now',
          status: 'open',
          detected_at: now,
        });
        break; // only one spend milestone per customer
      }
    }
  }

  // 3. Generate AI message templates for top 10 campaigns
  if (config.aiEnabled && campaigns.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topCampaigns = campaigns.slice(0, 10);
      for (const c of topCampaigns) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant marketing AI. Generate a single personalized milestone message (max 200 chars). No preamble.' },
            { role: 'user', content: `Customer: ${c.customer_name}
Milestone: ${c.milestone_type} in ${c.days_until_milestone}d
Offer: ${c.suggested_offer}
Channel: ${c.suggested_channel}
LTV: ${fmt$(c.customer_ltv)}

Generate a warm, personalized message celebrating their milestone and inviting them to celebrate with us. Include the offer naturally.` },
          ], { temperature: 0.7, maxTokens: 100 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          c.message_template = text.slice(0, 200);

          // Also generate insight
          const insightResponse = await callOpenAIChat([
            { role: 'system', content: 'You are a customer experience AI. Respond with a single insight (max 150 chars).' },
            { role: 'user', content: `Customer ${c.customer_name} (${c.milestone_type}, LTV ${fmt$(c.customer_ltv)}). Offer ${c.suggested_offer} (${fmt$(c.est_offer_cost)} cost, ${fmt$(c.est_revenue_lift)} lift). Channel ${c.suggested_channel}.` },
          ], { temperature: 0.3, maxTokens: 80 });
          const insightText = typeof insightResponse === 'string' ? insightResponse : (insightResponse as any)?.content ?? '';
          c.ai_insight = insightText.slice(0, 150);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM milestone_campaign WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const c of campaigns) {
    try {
      await db.query(`CREATE milestone_campaign CONTENT $data`, {
        data: {
          ...c,
          milestone_date: c.milestone_date?.toISOString(),
          suggested_send_date: c.suggested_send_date?.toISOString(),
          detected_at: c.detected_at.toISOString(),
        },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { campaigns, generated: campaigns.length };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseBirthday = (birthday: string, now: Date): Date | null => {
  try {
    // Try parsing as full ISO date
    const parsed = new Date(birthday);
    if (!isNaN(parsed.getTime())) {
      // Set to current year
      return new Date(now.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
    // Try MM-DD format
    const parts = birthday.split('-');
    if (parts.length >= 2) {
      const month = parseInt(parts[0]) - 1;
      const day = parseInt(parts[1]);
      if (month >= 0 && month < 12 && day > 0 && day < 32) {
        return new Date(now.getFullYear(), month, day);
      }
    }
  } catch { /* ignore */ }
  return null;
};

const daysUntilDate = (target: Date, now: Date): number => {
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveCampaigns = async (db: ReturnType<typeof useDB>): Promise<MilestoneCampaign[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM milestone_campaign
       WHERE status = 'open'
       ORDER BY days_until_milestone ASC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  upcomingCount: number;
  birthdayCount: number;
  totalEstRevenue: number;
  totalOfferCost: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'birthday') AS birthdays,
         math::sum(est_revenue_lift) AS revenue,
         math::sum(est_offer_cost) AS cost
       FROM milestone_campaign
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      upcomingCount: safeNumber(r.total, 0),
      birthdayCount: safeNumber(r.birthdays, 0),
      totalEstRevenue: safeNumber(r.revenue, 0),
      totalOfferCost: safeNumber(r.cost, 0),
    };
  } catch {
    return { upcomingCount: 0, birthdayCount: 0, totalEstRevenue: 0, totalOfferCost: 0 };
  }
};

export const updateCampaignStatus = async (
  db: ReturnType<typeof useDB>,
  campaignId: string,
  status: 'sent' | 'responded' | 'visited' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: campaignId, status });
};
