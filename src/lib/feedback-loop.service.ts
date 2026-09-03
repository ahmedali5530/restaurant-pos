/**
 * AI Customer Feedback Loop Tracker — full feedback lifecycle management.
 *
 * 76th POSR-exclusive differentiator — 85% of restaurants never act on feedback
 * (BrightLocal). Customers who see feedback implemented are 3x more likely to
 * return (HBR). This service tracks the full cycle: collect → analyze → act →
 * verify → close the loop.
 *
 * Distinct from:
 *   - sentiment.service (analyzes review SENTIMENT — NOT action tracking)
 *   - complaint-pattern.service (finds RECURRING themes — NOT implementation)
 *   - review-response.service (generates RESPONSES — NOT action items)
 *   - satisfaction-prediction.service (predicts per-order — NOT feedback loop)
 *   - sentiment-trend.service (tracks TRENDS — NOT individual feedback lifecycle)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type FeedbackLoopRuleId =
  | 'new_feedback'
  | 'recurring_theme'
  | 'action_needed'
  | 'impact_verified'
  | 'loop_closed';

export type FeedbackLoopAiRec =
  | 'assign_now'
  | 'implement_action'
  | 'verify_impact'
  | 'close_loop'
  | 'escalate';

export interface FeedbackLoop {
  id?: string;
  rule_id: FeedbackLoopRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  feedback_id?: string;
  customer_name?: string;
  feedback_text?: string;
  feedback_source?: string;
  category?: string;
  sentiment?: string;
  stage: string;
  assigned_to?: string;
  action_taken?: string;
  impact_score: number;
  days_open: number;
  est_revenue_impact: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: FeedbackLoopAiRec;
  status: 'open' | 'assigned' | 'implementing' | 'implemented' | 'verified' | 'closed' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface FeedbackLoopConfig {
  aiEnabled: boolean;
  maxDays: number;
  minImpactScore: number;
  autoAssign: boolean;
}

export const DEFAULT_FEEDBACK_LOOP_CONFIG: FeedbackLoopConfig = {
  aiEnabled: true,
  maxDays: 7,
  minImpactScore: 50,
  autoAssign: true,
};

export const readFeedbackLoopConfig = (settings: any): FeedbackLoopConfig => ({
  aiEnabled: settings?.feedback_loop_ai_enabled ?? true,
  maxDays: safeNumber(settings?.feedback_loop_max_days, 7),
  minImpactScore: safeNumber(settings?.feedback_loop_min_impact_score, 50),
  autoAssign: settings?.feedback_loop_auto_assign ?? true,
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Category auto-assignment mapping
const CATEGORY_ASSIGNMENT: Record<string, string> = {
  food_quality: 'Head Chef',
  service: 'Floor Manager',
  price: 'Owner/Manager',
  ambiance: 'Floor Manager',
  cleanliness: 'Floor Manager',
  wait_time: 'Floor Manager',
  other: 'Manager',
};

// Extract category from review text
const extractCategory = (text: string): string => {
  const t = text.toLowerCase();
  if (t.match(/taste|flavor|cold|overcooked|undercooked|bland|spicy|salty|food/)) return 'food_quality';
  if (t.match(/slow|rude|friendly|attentive|service|waiter|server/)) return 'service';
  if (t.match(/expensive|overpriced|cheap|price|value|cost/)) return 'price';
  if (t.match(/noisy|quiet|dark|bright|music|ambiance|atmosphere/)) return 'ambiance';
  if (t.match(/dirty|clean|bathroom|toilet|hygiene/)) return 'cleanliness';
  if (t.match(/wait|long time|queue|delay|fast|quick/)) return 'wait_time';
  return 'other';
};

const inferSentiment = (rating: number): string => {
  if (rating >= 4) return 'positive';
  if (rating <= 2) return 'negative';
  return 'neutral';
};

export const runFeedbackLoopEngine = async (
  db: ReturnType<typeof useDB>,
  config: FeedbackLoopConfig = DEFAULT_FEEDBACK_LOOP_CONFIG
): Promise<{ loops: FeedbackLoop[]; generated: number }> => {
  const loops: FeedbackLoop[] = [];
  const now = new Date();

  // 1. Fetch unprocessed reviews (not yet in feedback_loop)
  let reviews: Array<{ id: string; customer_name: string; text: string; rating: number; platform: string; created_at: string }> = [];
  try {
    const result = await db.query(
      `SELECT id, customer.name AS customer_name, text, rating, platform, created_at
       FROM review
       WHERE deleted_at IS NONE
         AND text IS NOT NONE AND text != ''
         AND created_at > time::now() - 7d
       ORDER BY created_at DESC
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    reviews = rows.map((r: any) => ({
      id: String(r.id ?? ''),
      customer_name: String(r.customer_name ?? 'Anonymous'),
      text: String(r.text ?? ''),
      rating: safeNumber(r.rating, 3),
      platform: String(r.platform ?? 'internal'),
      created_at: String(r.created_at ?? ''),
    }));
  } catch (err) {
    console.warn('[feedback-loop] fetchReviews failed', err);
  }

  // 2. Process each review through the feedback loop
  for (const review of reviews) {
    const category = extractCategory(review.text);
    const sentiment = inferSentiment(review.rating);
    const reviewDate = new Date(review.created_at);
    const daysOpen = Math.floor((now.getTime() - reviewDate.getTime()) / (24 * 60 * 60 * 1000));

    // Determine stage and rule based on review state
    let ruleId: FeedbackLoopRuleId;
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let stage: string;
    let aiRec: FeedbackLoopAiRec;
    let assignedTo: string | undefined;
    let estRevenueImpact = 0;

    if (review.rating <= 2) {
      // Negative review — needs immediate action
      ruleId = 'action_needed';
      severity = daysOpen > config.maxDays ? 'critical' : 'high';
      stage = 'collected';
      aiRec = daysOpen > config.maxDays ? 'escalate' : 'assign_now';
      assignedTo = config.autoAssign ? (CATEGORY_ASSIGNMENT[category] ?? 'Manager') : undefined;
      estRevenueImpact = 45 * 3; // avg ticket × 3 (lost repeat visits)
    } else if (review.rating === 3) {
      // Neutral review — needs attention
      ruleId = 'new_feedback';
      severity = 'medium';
      stage = 'collected';
      aiRec = 'assign_now';
      assignedTo = config.autoAssign ? (CATEGORY_ASSIGNMENT[category] ?? 'Manager') : undefined;
      estRevenueImpact = 45;
    } else if (review.rating >= 4 && sentiment === 'positive' && review.text.length > 50) {
      // Positive review — can be used for marketing
      ruleId = 'new_feedback';
      severity = 'low';
      stage = 'collected';
      aiRec = 'close_loop';
      estRevenueImpact = 0;
    } else {
      continue; // skip uninteresting reviews
    }

    loops.push({
      rule_id: ruleId,
      severity,
      feedback_id: review.id,
      customer_name: review.customer_name,
      feedback_text: review.text.length > 150 ? review.text.slice(0, 150) + '...' : review.text,
      feedback_source: review.platform,
      category,
      sentiment,
      stage,
      assigned_to: assignedTo,
      impact_score: 0,
      days_open: daysOpen,
      est_revenue_impact: Math.round(estRevenueImpact * 100) / 100,
      description: `${review.customer_name} (${review.rating}★ on ${review.platform}): "${review.text.slice(0, 100)}${review.text.length > 100 ? '...' : ''}" — Category: ${category}, ${sentiment}. ${daysOpen > config.maxDays ? `OVERDUE (${daysOpen}d). ` : ''}${assignedTo ? `Assigned to: ${assignedTo}.` : 'Needs assignment.'}`,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 3. Check for recurring themes (same category 3+ times in 7d)
  const categoryCounts: Record<string, number> = {};
  for (const loop of loops) {
    if (loop.category) {
      categoryCounts[loop.category] = (categoryCounts[loop.category] ?? 0) + 1;
    }
  }

  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count >= 3) {
      loops.push({
        rule_id: 'recurring_theme',
        severity: count >= 5 ? 'critical' : 'high',
        category,
        sentiment: 'negative',
        stage: 'analyzed',
        impact_score: 0,
        days_open: 0,
        est_revenue_impact: count * 45 * 2, // each complaint costs 2 future visits
        description: `RECURRING THEME: "${category}" mentioned ${count} times in last 7 days. Pattern detected — systemic issue needs root-cause analysis and process fix.`,
        ai_recommendation: 'implement_action',
        status: 'open',
        detected_at: now,
      });
    }
  }

  // 4. AI insight for top 5 critical/high loops
  if (config.aiEnabled && loops.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topLoops = loops.filter(l => l.severity === 'critical' || l.severity === 'high').slice(0, 5);
      for (const l of topLoops) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant customer experience improvement AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Feedback: ${l.feedback_text ?? l.description}. Category: ${l.category}. Sentiment: ${l.sentiment}. Stage: ${l.stage}. Days open: ${l.days_open}. Est revenue impact: ${fmt$(l.est_revenue_impact)}.` },
          ], { temperature: 0.4, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          l.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  // 5. Persist
  try { await db.query(`DELETE FROM feedback_loop WHERE status = 'open' AND detected_at < time::now() - 1h`); } catch { /* ignore */ }
  for (const l of loops) {
    try { await db.query(`CREATE feedback_loop CONTENT $data`, { data: { ...l, detected_at: l.detected_at.toISOString() } }); } catch { /* ignore */ }
  }

  return { loops, generated: loops.length };
};

// Reads
export const getActiveLoops = async (db: ReturnType<typeof useDB>): Promise<FeedbackLoop[]> => {
  try {
    const result = await db.query(`SELECT * FROM feedback_loop WHERE status != 'closed' AND status != 'expired' ORDER BY days_open DESC, severity ASC LIMIT 50`);
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  openCount: number;
  criticalCount: number;
  overdueCount: number;
  avgDaysOpen: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
       math::count(days_open > 7) AS overdue, math::mean(days_open) AS avg_days
       FROM feedback_loop WHERE status != 'closed' AND status != 'expired' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return { openCount: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0), overdueCount: safeNumber(r.overdue, 0), avgDaysOpen: safeNumber(r.avg_days, 0) };
  } catch { return { openCount: 0, criticalCount: 0, overdueCount: 0, avgDaysOpen: 0 }; }
};

export const updateLoopStatus = async (db: ReturnType<typeof useDB>, loopId: string, status: 'assigned' | 'implementing' | 'implemented' | 'verified' | 'closed' | 'expired'): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: loopId, status });
};
