/**
 * Marketing service — segment builder + campaign management.
 *
 * Research finding: Toast charges $185/mo for the loyalty + marketing
 * bundle. POSR offers it free — major competitive differentiator.
 *
 * Features:
 *   - Segment builder: filter customers by tier, visit frequency, spend
 *   - Campaign creation: email/SMS with promo offers
 *   - Template variables: {{first_name}}, {{offer_code}}, {{expiry_date}}
 *   - Campaign tracking: sent/opened/clicked/redeemed stats
 *   - AI-assisted content: reuse AI Report OpenAI client
 *
 * Integration points:
 *   - Admin → Marketing tab (new) — campaign management UI
 *   - Customer checkout — auto-tag customers for segmentation
 *   - Loyalty — segment by tier (bronze/silver/gold/platinum)
 */

import { useDB } from "@/api/db/db.ts";

const SEGMENT = "marketing_segment";
const CAMPAIGN = "marketing_campaign";
const RECIPIENT = "marketing_campaign_recipient";
const TEMPLATE = "marketing_template";
const CUSTOMER = "customer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentCriteria {
  loyalty_tier?: string[];
  min_visits?: number;
  min_spend?: number;
  last_visit_days?: number; // within last N days
  tags?: string[];
  branch_id?: string;
}

export interface MarketingSegment {
  id: string;
  name: string;
  description?: string;
  criteria: SegmentCriteria;
  recipient_count?: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export type CampaignChannel = "email" | "sms" | "both";
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
export type OfferType = "discount_percent" | "discount_fixed" | "free_item" | "points_bonus" | "none";

export interface MarketingCampaign {
  id: string;
  name: string;
  segment?: string;
  channel: CampaignChannel;
  subject?: string;
  body_text: string;
  body_html?: string;
  offer_type?: OfferType;
  offer_value?: number;
  offer_code?: string;
  offer_expires_at?: string;
  status: CampaignStatus;
  scheduled_at?: string;
  sent_at?: string;
  created_at: string;
  created_by?: string;
  branch_id?: string;
  ai_generated: boolean;
  stats: {
    sent: number;
    opened: number;
    clicked: number;
    redeemed: number;
    bounced: number;
  };
}

export interface MarketingTemplate {
  id: string;
  name: string;
  channel: CampaignChannel;
  subject?: string;
  body_text: string;
  body_html?: string;
  variables: string[];
  created_at: string;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Segment builder — find matching customers
// ---------------------------------------------------------------------------

/**
 * Build a SurQL query from segment criteria.
 * Returns customers matching all specified filters.
 */
function buildSegmentQuery(criteria: SegmentCriteria): string {
  const conditions: string[] = ["deleted_at = NONE"];

  if (criteria.loyalty_tier && criteria.loyalty_tier.length > 0) {
    const tiers = criteria.loyalty_tier.map((t) => `'${t}'`).join(", ");
    conditions.push(`id IN (SELECT customer FROM loyalty_member WHERE tier IN [${tiers}])`);
  }

  if (criteria.min_spend) {
    conditions.push(`total_spent >= ${criteria.min_spend}`);
  }

  if (criteria.last_visit_days) {
    conditions.push(`last_visit_at > time::now() - ${criteria.last_visit_days}d`);
  }

  if (criteria.branch_id) {
    conditions.push(`branch_id = type::record('${criteria.branch_id}')`);
  }

  return `SELECT id, first_name, last_name, phone, email FROM ${CUSTOMER} WHERE ${conditions.join(" AND ")} LIMIT 10000;`;
}

/**
 * Find customers matching segment criteria.
 * Returns the customer list for preview + recipient count.
 */
export async function findSegmentCustomers(
  db: ReturnType<typeof useDB>,
  criteria: SegmentCriteria
): Promise<{ count: number; customers: any[] }> {
  const query = buildSegmentQuery(criteria);
  const result = await db.query<any[]>(query);
  const customers = Array.isArray(result) ? result : [];
  return { count: customers.length, customers };
}

/**
 * Save a segment (create or update).
 */
export async function saveSegment(
  db: ReturnType<typeof useDB>,
  params: { id?: string; name: string; description?: string; criteria: SegmentCriteria }
): Promise<string> {
  // Preview the count before saving
  const { count } = await findSegmentCustomers(db, params.criteria);

  if (params.id) {
    await db.update(params.id, {
      name: params.name,
      description: params.description,
      criteria: params.criteria,
      recipient_count: count,
      updated_at: new Date().toISOString(),
    });
    return params.id;
  }

  const [segment] = await db.create(SEGMENT, {
    name: params.name,
    description: params.description,
    criteria: params.criteria,
    recipient_count: count,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
  });

  return String(segment?.id || "");
}

// ---------------------------------------------------------------------------
// Campaign management
// ---------------------------------------------------------------------------

/**
 * Create a new campaign.
 */
export async function createCampaign(
  db: ReturnType<typeof useDB>,
  params: {
    name: string;
    segment?: string;
    channel: CampaignChannel;
    subject?: string;
    body_text: string;
    offer_type?: OfferType;
    offer_value?: number;
    offer_code?: string;
    offer_expires_at?: string;
    scheduled_at?: string;
    created_by?: string;
    branch_id?: string;
    ai_generated?: boolean;
  }
): Promise<string> {
  const [campaign] = await db.create(CAMPAIGN, {
    name: params.name,
    segment: params.segment || null,
    channel: params.channel,
    subject: params.subject || null,
    body_text: params.body_text,
    offer_type: params.offer_type || "none",
    offer_value: params.offer_value || null,
    offer_code: params.offer_code || generateOfferCode(),
    offer_expires_at: params.offer_expires_at || null,
    status: params.scheduled_at ? "scheduled" : "draft",
    scheduled_at: params.scheduled_at || null,
    created_at: new Date().toISOString(),
    created_by: params.created_by || null,
    branch_id: params.branch_id || null,
    ai_generated: params.ai_generated || false,
    stats: { sent: 0, opened: 0, clicked: 0, redeemed: 0, bounced: 0 },
  });

  return String(campaign?.id || "");
}

/**
 * Send a campaign to all segment recipients.
 * Creates marketing_campaign_recipient records for tracking.
 */
export async function sendCampaign(
  db: ReturnType<typeof useDB>,
  campaignId: string
): Promise<{ sent: number; failed: number }> {
  // Get campaign + segment
  const campaignResult = await db.query<any[]>(`
    SELECT * FROM ${CAMPAIGN} WHERE id = $id LIMIT 1;
  `, { id: campaignId });
  const campaign = Array.isArray(campaignResult) ? campaignResult[0] : null;
  if (!campaign) throw new Error("Campaign not found");

  // Find recipients from segment criteria
  let customers: any[] = [];
  if (campaign.segment) {
    const segResult = await db.query<any[]>(`
      SELECT * FROM ${SEGMENT} WHERE id = $id LIMIT 1;
    `, { id: campaign.segment });
    const segment = Array.isArray(segResult) ? segResult[0] : null;
    if (segment?.criteria) {
      const { customers: found } = await findSegmentCustomers(db, segment.criteria as SegmentCriteria);
      customers = found;
    }
  }

  // Create recipient records
  let sent = 0;
  let failed = 0;

  for (const customer of customers) {
    try {
      await db.create(RECIPIENT, {
        campaign: campaignId,
        customer: String(customer.id),
        email: customer.email || null,
        phone: customer.phone || null,
        status: "pending",
      });
      sent++;
    } catch {
      failed++;
    }
  }

  // Update campaign status + stats
  await db.update(campaignId, {
    status: "sent",
    sent_at: new Date().toISOString(),
    stats: { sent, opened: 0, clicked: 0, redeemed: 0, bounced: 0 },
  });

  return { sent, failed };
}

/**
 * Get campaign stats (sent, opened, clicked, redeemed).
 */
export async function getCampaignStats(
  db: ReturnType<typeof useDB>,
  campaignId: string
): Promise<{ sent: number; opened: number; clicked: number; redeemed: number; bounced: number }> {
  const result = await db.query<any[]>(`
    SELECT count() AS total,
      count(status = 'sent') AS sent,
      count(status = 'opened') AS opened,
      count(status = 'clicked') AS clicked,
      count(status = 'bounced') AS bounced,
      count(redeemed = true) AS redeemed
    FROM ${RECIPIENT}
    WHERE campaign = $campaignId;
  `, { campaignId });

  const stats = Array.isArray(result) ? result[0] : {};
  return {
    sent: stats.sent || 0,
    opened: stats.opened || 0,
    clicked: stats.clicked || 0,
    redeemed: stats.redeemed || 0,
    bounced: stats.bounced || 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique promo code (e.g. "PROMO-ABCD12").
 */
export function generateOfferCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PROMO-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Render template variables in body text.
 * Replaces {{first_name}}, {{offer_code}}, {{expiry_date}}, etc.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

/**
 * AI-assisted campaign content generation.
 * Uses the same OpenAI client as the AI Report.
 *
 * Returns suggested subject + body for the campaign.
 */
export async function generateCampaignContent(
  params: {
    campaign_type: string;
    channel?: CampaignChannel;
    offer_type: OfferType;
    offer_value?: number;
    segment_description?: string;
    restaurant_name?: string;
  }
): Promise<{ subject: string; body_text: string; body_html?: string }> {
  const channel = params.channel || "email";
  const prompt = `You are a restaurant marketing assistant. Generate a compelling ${channel} campaign message.

Campaign type: ${params.campaign_type}
Offer: ${params.offer_type === "discount_percent" ? `${params.offer_value}% off` : params.offer_type === "discount_fixed" ? `$${params.offer_value} off` : params.offer_type === "points_bonus" ? `${params.offer_value} bonus loyalty points` : params.offer_type}
Target audience: ${params.segment_description || "all customers"}
Restaurant: ${params.restaurant_name || "our restaurant"}

Generate:
1. A catchy subject line (max 60 chars)
2. A short, engaging message body (max 200 words)
3. Include a clear call-to-action with the promo code

Format as JSON: {"subject": "...", "body_text": "..."}`;

  try {
    const { callOpenAIChat } = await import("@/lib/openai.service.ts");
    const result = await callOpenAIChat(
      { messages: [{ role: "user", content: prompt }] }
    );
    const contentStr = typeof result?.choices?.[0]?.message?.content === "string"
      ? result.choices[0].message.content as string
      : "";
    // Try to parse JSON from the response
    const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // Fallback: use the raw content
    return {
      subject: params.campaign_type === "discount" ? "Special Offer Just for You!" : "We Miss You!",
      body_text: contentStr.slice(0, 500) || "Hi {{first_name}}, we have a special offer for you!",
    };
  } catch {
    return {
      subject: params.offer_type === "discount_percent"
        ? `${params.offer_value}% Off — Just for You!`
        : "Special Offer — Visit Us Soon!",
      body_text: `Hi {{first_name}},\n\nWe have a special offer for you: ${params.offer_type === "discount_percent" ? `${params.offer_value}% off` : "a special discount"} your next visit.\n\nUse code: {{offer_code}}\nValid until: {{expiry_date}}\n\nWe can't wait to see you again!`,
    };
  }
}
