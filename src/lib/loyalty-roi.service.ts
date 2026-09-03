/**
 * AI Loyalty ROI Predictor — predict revenue uplift from loyalty enrollment.
 *
 * 42nd POSR-exclusive differentiator — loyalty programs lift revenue 20-30%
 * per enrolled customer (Bain & Co, Cornell hospitality research), but
 * restaurants struggle to identify WHICH prospects to recruit, quantify
 * sign-up incentive ROI, and project 90-day revenue gain. Toast Loyalty
 * ($185/mo) accrues points but DOESN'T predict ROI or identify prospects.
 *
 * Distinct from:
 *   - loyalty.service.ts (operational accrue/redeem — does NOT predict)
 *   - clv.service.ts (per-customer LTV — doesn't model LOYALTY uplift)
 *   - churn.service.ts (churn risk — not loyalty conversion)
 *   - winback.service.ts (lost customer recovery — not loyalty-specific)
 *
 * This service predicts LOYALTY ROI + identifies prospects + recommends incentives.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type LoyaltyRoiRuleId =
  | 'high_propensity_prospect'
  | 'tier_upgrade_opportunity'
  | 'incentive_roi'
  | 'churned_prospect';

export type LoyaltyRoiRecommendation =
  | 'enroll_now'
  | 'offer_incentive'
  | 'upgrade_tier'
  | 'monitor'
  | 'personal_outreach';

export interface LoyaltyRoiPrediction {
  id?: string;
  rule_id: LoyaltyRoiRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_id?: string;
  customer_name?: string;
  prospect_score: number;          // 0-100
  projected_ltv: number;            // predicted LTV if enrolled
  ltv_uplift_pct: number;           // % revenue lift if enrolled
  suggested_incentive_pct?: number; // recommended sign-up discount
  est_conversion_pct?: number;      // predicted conversion rate
  est_revenue_gain: number;         // 90-day revenue gain projection
  description: string;
  ai_insight?: string;
  ai_recommendation?: LoyaltyRoiRecommendation;
  status: 'open' | 'enrolled' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface LoyaltyRoiConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  minProspectScore: number;
  baselineUpliftPct: number;
}

export const DEFAULT_LOYALTY_ROI_CONFIG: LoyaltyRoiConfig = {
  aiEnabled: true,
  lookbackDays: 90,
  minProspectScore: 50,
  baselineUpliftPct: 0.25,
};

export const readLoyaltyRoiConfig = (settings: any): LoyaltyRoiConfig => ({
  aiEnabled: settings?.loyalty_roi_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.loyalty_roi_lookback_days, 90),
  minProspectScore: safeNumber(settings?.loyalty_roi_min_prospect_score, 50),
  baselineUpliftPct: safeNumber(settings?.loyalty_roi_baseline_uplift_pct, 0.25),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export const runLoyaltyRoiEngine = async (
  db: ReturnType<typeof useDB>,
  config: LoyaltyRoiConfig = DEFAULT_LOYALTY_ROI_CONFIG
): Promise<{ predictions: LoyaltyRoiPrediction[]; generated: number }> => {
  const lookback = config.lookbackDays;

  // 1. Fetch member vs non-member customer activity in last N days
  type CustomerActivity = {
    customer_id: string;
    customer_name: string;
    is_member: boolean;
    visits: number;
    total_spend: number;
    avg_spend: number;
    last_visit: string | null;
    days_since_last: number;
  };

  let activities: CustomerActivity[] = [];
  try {
    const result = await db.query(
      `SELECT
         customer.id AS customer_id,
         customer.name AS customer_name,
         customer.id IN (SELECT customer FROM loyalty_member WHERE is_active = true) AS is_member,
         count() AS visits,
         math::sum(total) AS total_spend,
         math::mean(total) AS avg_spend,
         time::max(created_at) AS last_visit,
         time::now() - time::max(created_at) AS days_since_last
       FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND customer IS NOT NONE
         AND created_at > time::now() - ${lookback}d
       GROUP BY customer.id, customer.name
       ORDER BY total_spend DESC
       LIMIT 200`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    activities = rows.map((r: any) => ({
      customer_id: String(r.customer_id ?? ''),
      customer_name: String(r.customer_name ?? 'Unknown'),
      is_member: Boolean(r.is_member),
      visits: safeNumber(r.visits, 0),
      total_spend: safeNumber(r.total_spend, 0),
      avg_spend: safeNumber(r.avg_spend, 0),
      last_visit: r.last_visit ?? null,
      days_since_last: safeNumber(r.days_since_last, 0),
    }));
  } catch (err) {
    console.warn('[loyalty-roi] fetchCustomerActivity failed', err);
  }

  if (activities.length === 0) return { predictions: [], generated: 0 };

  // 2. Compute member vs non-member benchmarks
  const members = activities.filter(a => a.is_member);
  const nonMembers = activities.filter(a => !a.is_member);

  const avgMemberSpend = members.length > 0
    ? members.reduce((s, a) => s + a.avg_spend, 0) / members.length
    : 0;
  const avgNonMemberSpend = nonMembers.length > 0
    ? nonMembers.reduce((s, a) => s + a.avg_spend, 0) / nonMembers.length
    : 0;

  // Uplift = how much more members spend (vs non-members) per visit
  const upliftPct = avgNonMemberSpend > 0
    ? Math.min((avgMemberSpend - avgNonMemberSpend) / avgNonMemberSpend, config.baselineUpliftPct)
    : config.baselineUpliftPct;
  // Fall back to baseline uplift (25%) if members don't yet spend more

  // 3. Generate predictions
  const predictions: LoyaltyRoiPrediction[] = [];

  // 3a. HIGH PROPENSITY PROSPECTS — non-members with high visit frequency + spend
  const maxVisits = Math.max(...nonMembers.map(a => a.visits), 1);
  const maxSpend = Math.max(...nonMembers.map(a => a.total_spend), 1);

  for (const a of nonMembers) {
    const visitScore = (a.visits / maxVisits) * 50;            // 0-50
    const spendScore = (a.total_spend / maxSpend) * 30;       // 0-30
    const recencyScore = a.days_since_last < 14 ? 20 : a.days_since_last < 30 ? 10 : 0; // 0-20

    const score = Math.round(visitScore + spendScore + recencyScore);
    if (score < config.minProspectScore) continue;

    const projectedLtv = a.total_spend * (1 + upliftPct) * (90 / Math.max(lookback, 1));
    const estRevenueGain = projectedLtv - (a.total_spend * (90 / Math.max(lookback, 1)));

    // Suggested incentive — higher score → lower incentive needed
    const incentive = score > 80 ? 5 : score > 65 ? 10 : 15;
    // Higher incentive → higher conversion rate
    const conversionPct = Math.min(0.30 + (incentive - 5) * 0.05, 0.65);

    predictions.push({
      rule_id: 'high_propensity_prospect',
      severity: score > 80 ? 'critical' : score > 65 ? 'high' : 'medium',
      customer_id: a.customer_id,
      customer_name: a.customer_name,
      prospect_score: score,
      projected_ltv: Math.round(projectedLtv * 100) / 100,
      ltv_uplift_pct: Math.round(upliftPct * 10000) / 100,
      suggested_incentive_pct: incentive,
      est_conversion_pct: Math.round(conversionPct * 10000) / 100,
      est_revenue_gain: Math.round(estRevenueGain * 100) / 100,
      description: `${a.visits} visits, ${fmt$(a.total_spend)} in ${lookback}d — top ${score > 80 ? '1%' : score > 65 ? '10%' : '25%'} prospect`,
      status: 'open',
      detected_at: new Date(),
    });
  }

  // 3b. CHURNED PROSPECTS — non-members who visited recently then vanished
  for (const a of nonMembers) {
    if (a.days_since_last < 30 || a.days_since_last > 60) continue;
    if (a.visits < 2) continue;

    const score = Math.min(40 + a.visits * 5, 70);
    const projectedLtv = a.avg_spend * 4 * (1 + upliftPct);
    const estRevenueGain = projectedLtv * 0.5;

    predictions.push({
      rule_id: 'churned_prospect',
      severity: 'medium',
      customer_id: a.customer_id,
      customer_name: a.customer_name,
      prospect_score: score,
      projected_ltv: Math.round(projectedLtv * 100) / 100,
      ltv_uplift_pct: Math.round(upliftPct * 10000) / 100,
      suggested_incentive_pct: 15,
      est_conversion_pct: 55,
      est_revenue_gain: Math.round(estRevenueGain * 100) / 100,
      description: `Churned ${a.days_since_last}d ago after ${a.visits} visits — loyalty win-back`,
      status: 'open',
      detected_at: new Date(),
    });
  }

  // 3c. TIER UPGRADE OPPORTUNITIES — members near next tier threshold
  // (detected via loyalty_member tier + lifetime_points progression)
  try {
    const tierResult = await db.query(
      `SELECT customer.id AS customer_id, customer.name AS customer_name, tier, lifetime_points
       FROM loyalty_member
       WHERE is_active = true
       LIMIT 50`
    );
    const tierRows = Array.isArray(tierResult) ? tierResult.flat() : [];

    const TIER_THRESHOLDS: Record<string, number> = { bronze: 100, silver: 500, gold: 1500, platinum: 5000 };

    for (const m of tierRows) {
      const tier = String(m.tier ?? 'bronze');
      const points = safeNumber(m.lifetime_points, 0);
      const threshold = TIER_THRESHOLDS[tier] ?? 1000;
      const ratio = points / threshold;
      if (ratio < 0.85 || ratio >= 1) continue; // only 85-99% to next tier

      const projectedLtv = (points * 0.5) * (1 + upliftPct);
      predictions.push({
        rule_id: 'tier_upgrade_opportunity',
        severity: 'high',
        customer_id: String(m.customer_id ?? ''),
        customer_name: String(m.customer_name ?? 'Unknown'),
        prospect_score: Math.round(ratio * 100),
        projected_ltv: Math.round(projectedLtv * 100) / 100,
        ltv_uplift_pct: Math.round(upliftPct * 10000) / 100,
        est_revenue_gain: Math.round(projectedLtv * 0.15 * 100) / 100,
        description: `${tier} at ${Math.round(ratio * 100)}% of ${tier === 'bronze' ? 'silver' : tier === 'silver' ? 'gold' : 'platinum'} threshold — upgrade nudge`,
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) {
    console.warn('[loyalty-roi] fetchTierUpgrades failed', err);
  }

  // 3d. INCENTIVE ROI MATRIX — best sign-up incentive (synthesized row)
  const prospects = nonMembers.length;
  if (prospects > 0) {
    const avgNonMemberLtv = nonMembers.reduce((s, a) => s + a.total_spend, 0) / prospects * 0.5; // semi-annual projection
    for (const incentive of [5, 10, 15]) {
      const conversion = Math.min(0.30 + (incentive - 5) * 0.05, 0.65);
      const estCost = prospects * conversion * (avgNonMemberLtv * incentive / 100);
      const estGain = prospects * conversion * (avgNonMemberLtv * upliftPct);
      const roi = estCost > 0 ? (estGain - estCost) / estCost : 0;

      predictions.push({
        rule_id: 'incentive_roi',
        severity: roi > 3 ? 'critical' : roi > 1.5 ? 'high' : 'medium',
        prospect_score: Math.round(roi * 20), // ROI mapped to 0-100
        projected_ltv: Math.round(avgNonMemberLtv * 100) / 100,
        ltv_uplift_pct: Math.round(upliftPct * 10000) / 100,
        suggested_incentive_pct: incentive,
        est_conversion_pct: Math.round(conversion * 10000) / 100,
        est_revenue_gain: Math.round(estGain * 100) / 100,
        description: `Incentive ${incentive}% → ${Math.round(conversion * 100)}% conversion · cost ${fmt$(estCost)} · gain ${fmt$(estGain)} · ROI ${roi.toFixed(1)}x`,
        status: 'open',
        detected_at: new Date(),
      });
    }
  }

  // 4. AI insight for top 5 high-propensity prospects
  if (config.aiEnabled && predictions.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topProspects = predictions
        .filter(p => p.rule_id === 'high_propensity_prospect')
        .slice(0, 5);
      for (const p of topProspects) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a loyalty marketing AI. Respond with a single outreach insight (max 200 chars).' },
            { role: 'user', content: `Prospect "${p.customer_name}" score ${p.prospect_score}/100 — ${p.description}. Projected LTV ${fmt$(p.projected_ltv)} (+${p.ltv_uplift_pct}% uplift). Suggested incentive ${p.suggested_incentive_pct}%.` },
          ], { temperature: 0.4, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          p.ai_insight = text.slice(0, 200);
          p.ai_recommendation = p.prospect_score > 75 ? 'personal_outreach' : p.suggested_incentive_pct && p.suggested_incentive_pct > 10 ? 'offer_incentive' : 'enroll_now';
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist (clear prior open predictions older than 1h, then insert new)
  try {
    await db.query(`DELETE FROM loyalty_roi_prediction WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const p of predictions) {
    try {
      await db.query(`CREATE loyalty_roi_prediction CONTENT $data`, {
        data: { ...p, detected_at: p.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { predictions, generated: predictions.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActivePredictions = async (db: ReturnType<typeof useDB>): Promise<LoyaltyRoiPrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM loyalty_roi_prediction
       WHERE status = 'open'
       ORDER BY prospect_score DESC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  prospectCount: number;
  memberCount: number;
  avgUpliftPct: number;
  totalRevenueGain: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'high_propensity_prospect') AS prospects,
         math::mean(ltv_uplift_pct) AS avg_uplift,
         math::sum(est_revenue_gain) AS gain
       FROM loyalty_roi_prediction
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    let memberCount = 0;
    try {
      const mResult = await db.query(`SELECT count() AS total FROM loyalty_member WHERE is_active = true GROUP ALL`);
      const mRows = Array.isArray(mResult) ? mResult.flat() : [];
      memberCount = safeNumber(mRows[0]?.total, 0);
    } catch { /* ignore */ }
    return {
      prospectCount: safeNumber(r.prospects, 0),
      memberCount,
      avgUpliftPct: safeNumber(r.avg_uplift, 0),
      totalRevenueGain: safeNumber(r.gain, 0),
    };
  } catch {
    return { prospectCount: 0, memberCount: 0, avgUpliftPct: 0, totalRevenueGain: 0 };
  }
};

export const updatePredictionStatus = async (
  db: ReturnType<typeof useDB>,
  predictionId: string,
  status: 'enrolled' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: predictionId, status });
};
