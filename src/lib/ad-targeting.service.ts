/**
 * AI Social Media Ad Targeting Optimizer — POS-integrated ad optimization.
 *
 * 68th POSR-exclusive differentiator — restaurants waste 40-60% of ad spend
 * on poorly targeted social media ads (HubSpot). POS-integrated ad targeting
 * sees 3-5x ROI improvement (Meta case studies).
 *
 * Distinct from:
 *   - social-content.service (generates ORGANIC posts — NOT paid ad targeting)
 *   - marketing.service (email/SMS to EXISTING customers — NOT ad acquisition)
 *   - segmentation.service (RFM segments for campaigns — NOT ad audience building)
 *   - competitor-monitoring.service (tracks competitor prices — NOT ad optimization)
 *   - milestone-campaign.service (birthday/anniversary emails — NOT ads)
 *
 * Builds AD AUDIENCES from POS data, optimizes ad spend per platform, tracks
 * ROI, recommends lookalike audiences based on high-value customer profiles.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type AdTargetingRuleId =
  | 'lookalike_audience'
  | 'high_value_retarget'
  | 'lapsed_customer_winback'
  | 'demographic_optimize'
  | 'budget_optimize';

export type AdTargetingAiRec =
  | 'launch_now'
  | 'increase_budget'
  | 'decrease_budget'
  | 'test_audience'
  | 'pause';

export interface AdTargeting {
  id?: string;
  rule_id: AdTargetingRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  platform: string;
  audience_name?: string;
  audience_type?: string;
  audience_size: number;
  suggested_budget: number;
  est_reach: number;
  est_clicks: number;
  est_conversions: number;
  est_revenue: number;
  est_roas: number;
  targeting_criteria?: string;
  source_segment?: string;
  description: string;
  ai_insight?: string;
  ai_recommendation?: AdTargetingAiRec;
  status: 'open' | 'launched' | 'paused' | 'completed' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface AdConfig {
  aiEnabled: boolean;
  defaultBudget: number;
  targetRoas: number;
  lookalikeSource: string;
}

export const DEFAULT_AD_CONFIG: AdConfig = {
  aiEnabled: true,
  defaultBudget: 25,
  targetRoas: 4.0,
  lookalikeSource: 'champions',
};

export const readAdConfig = (settings: any): AdConfig => ({
  aiEnabled: settings?.ad_targeting_ai_enabled ?? true,
  defaultBudget: safeNumber(settings?.ad_targeting_default_budget, 25),
  targetRoas: safeNumber(settings?.ad_targeting_target_roas, 4.0),
  lookalikeSource: settings?.ad_targeting_lookalike_source ?? 'champions',
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Platform benchmarks (industry averages)
const PLATFORM_BENCHMARKS: Record<string, { cpm: number; ctr: number; cvr: number; avg_ticket: number }> = {
  facebook:   { cpm: 8,  ctr: 0.015, cvr: 0.05, avg_ticket: 35 },
  instagram:  { cpm: 10, ctr: 0.020, cvr: 0.06, avg_ticket: 38 },
  tiktok:     { cpm: 5,  ctr: 0.025, cvr: 0.04, avg_ticket: 30 },
  google_ads: { cpm: 12, ctr: 0.030, cvr: 0.08, avg_ticket: 42 },
  twitter:    { cpm: 6,  ctr: 0.010, cvr: 0.03, avg_ticket: 28 },
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface CustomerSegment {
  segment: string;
  count: number;
  avg_spend: number;
  avg_frequency: number;
  avg_recency_days: number;
}

/**
 * Run the ad targeting optimizer engine.
 * Fetches customer segments from POS data, generates ad audience recommendations.
 */
export const runAdEngine = async (
  db: ReturnType<typeof useDB>,
  config: AdConfig = DEFAULT_AD_CONFIG
): Promise<{ recommendations: AdTargeting[]; generated: number }> => {
  const recommendations: AdTargeting[] = [];
  const now = new Date();

  // 1. Fetch customer segments (RFM-based from order history)
  let segments: CustomerSegment[] = [];
  try {
    const result = await db.query(
      `SELECT
         CASE
           WHEN count() >= 10 AND time::now() - time::max(created_at) < 14d THEN 'champions'
           WHEN count() >= 5 AND time::now() - time::max(created_at) < 30d THEN 'loyal'
           WHEN count() >= 2 AND time::now() - time::max(created_at) < 60d THEN 'potential'
           WHEN count() >= 1 AND time::now() - time::max(created_at) < 90d THEN 'at_risk'
           WHEN count() >= 1 AND time::now() - time::max(created_at) >= 90d THEN 'lapsed'
           ELSE 'new'
         END AS segment,
         count() AS count,
         math::mean(total) AS avg_spend,
         count() AS avg_frequency,
         (time::now() - time::max(created_at)) / (24 * 60 * 60 * 1000000) AS avg_recency_days
       FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND customer IS NOT NONE
         AND created_at > time::now() - 365d
       GROUP BY customer.id
       SPLIT BY segment`
    );
    // Simplified: fetch raw customer stats and segment manually
    const rawResult = await db.query(
      `SELECT
         customer.id AS cid,
         count() AS orders,
         math::sum(total) AS total_spend,
         math::mean(total) AS avg_spend,
         time::max(created_at) AS last_order
       FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND customer IS NOT NONE
         AND created_at > time::now() - 365d
       GROUP BY customer.id
       LIMIT 500`
    );
    const rows = Array.isArray(rawResult) ? rawResult.flat() : [];

    // Segment customers manually
    const segmentMap: Record<string, { count: number; totalSpend: number; totalFreq: number; totalRecency: number }> = {};
    for (const r of rows) {
      const orders = safeNumber(r.orders, 0);
      const lastOrder = r.last_order ? new Date(String(r.last_order)) : now;
      const recencyDays = Math.floor((now.getTime() - lastOrder.getTime()) / (24 * 60 * 60 * 1000));

      let segment = 'new';
      if (orders >= 10 && recencyDays < 14) segment = 'champions';
      else if (orders >= 5 && recencyDays < 30) segment = 'loyal';
      else if (orders >= 2 && recencyDays < 60) segment = 'potential';
      else if (orders >= 1 && recencyDays < 90) segment = 'at_risk';
      else if (orders >= 1 && recencyDays >= 90) segment = 'lapsed';

      if (!segmentMap[segment]) {
        segmentMap[segment] = { count: 0, totalSpend: 0, totalFreq: 0, totalRecency: 0 };
      }
      segmentMap[segment].count += 1;
      segmentMap[segment].totalSpend += safeNumber(r.avg_spend, 0) * orders;
      segmentMap[segment].totalFreq += orders;
      segmentMap[segment].totalRecency += recencyDays;
    }

    segments = Object.entries(segmentMap).map(([seg, data]) => ({
      segment: seg,
      count: data.count,
      avg_spend: data.count > 0 ? data.totalSpend / data.count : 0,
      avg_frequency: data.count > 0 ? data.totalFreq / data.count : 0,
      avg_recency_days: data.count > 0 ? data.totalRecency / data.count : 0,
    }));
  } catch (err) {
    console.warn('[ad-targeting] fetchSegments failed', err);
  }

  if (segments.length === 0) return { recommendations: [], generated: 0 };

  // 2. Generate ad targeting recommendations per platform + segment combination
  const platforms = ['facebook', 'instagram', 'tiktok', 'google_ads'];

  for (const platform of platforms) {
    const benchmark = PLATFORM_BENCHMARKS[platform] ?? PLATFORM_BENCHMARKS.facebook;

    // --- Rule 1: LOOKALIKE_AUDIENCE — build from champions segment ---
    const champions = segments.find(s => s.segment === 'champions');
    if (champions && champions.count >= 10) {
      const budget = config.defaultBudget;
      const estReach = Math.floor((budget / benchmark.cpm) * 1000 * 10); // 10x lookalike
      const estClicks = Math.floor(estReach * benchmark.ctr);
      const estConversions = Math.floor(estClicks * benchmark.cvr);
      const estRevenue = estConversions * benchmark.avg_ticket;
      const estRoas = budget > 0 ? estRevenue / budget : 0;

      recommendations.push({
        rule_id: 'lookalike_audience',
        severity: estRoas >= config.targetRoas ? 'high' : 'medium',
        platform,
        audience_name: `Lookalike - ${champions.segment} (${champions.count} source)`,
        audience_type: 'lookalike',
        audience_size: champions.count * 100, // lookalike audience is ~100x source
        suggested_budget: Math.round(budget * 100) / 100,
        est_reach: estReach,
        est_clicks: estClicks,
        est_conversions: estConversions,
        est_revenue: Math.round(estRevenue * 100) / 100,
        est_roas: Math.round(estRoas * 100) / 100,
        targeting_criteria: JSON.stringify({
          age_min: 25, age_max: 55,
          genders: ['all'],
          interests: ['dining', 'restaurants', 'food delivery'],
          locations: ['5km radius'],
          radius_km: 5,
        }),
        source_segment: champions.segment,
        description: `Lookalike audience from ${champions.count} champion customers (avg ${fmt$(champions.avg_spend)}/visit) — est ${estConversions} new customers, ${fmt$(estRevenue)} revenue, ${estRoas.toFixed(1)}x ROAS`,
        ai_recommendation: estRoas >= config.targetRoas ? 'launch_now' : 'test_audience',
        status: 'open',
        detected_at: now,
      });
    }

    // --- Rule 2: HIGH_VALUE_RETARGET — retarget recent visitors ---
    const loyal = segments.find(s => s.segment === 'loyal');
    if (loyal && loyal.count >= 5) {
      const budget = config.defaultBudget * 0.6; // retargeting is cheaper
      const estReach = Math.floor((budget / benchmark.cpm) * 1000);
      const estClicks = Math.floor(estReach * benchmark.ctr * 2); // retargeting has 2x CTR
      const estConversions = Math.floor(estClicks * benchmark.cvr * 1.5); // higher CVR
      const estRevenue = estConversions * benchmark.avg_ticket;
      const estRoas = budget > 0 ? estRevenue / budget : 0;

      recommendations.push({
        rule_id: 'high_value_retarget',
        severity: 'medium',
        platform,
        audience_name: `Retarget - ${loyal.segment} (${loyal.count} recent)`,
        audience_type: 'retarget',
        audience_size: loyal.count,
        suggested_budget: Math.round(budget * 100) / 100,
        est_reach: estReach,
        est_clicks: estClicks,
        est_conversions: estConversions,
        est_revenue: Math.round(estRevenue * 100) / 100,
        est_roas: Math.round(estRoas * 100) / 100,
        targeting_criteria: JSON.stringify({
          source: 'website_visitors',
          lookback_days: 30,
          exclusion: 'purchased_7d',
        }),
        source_segment: loyal.segment,
        description: `Retarget ${loyal.count} loyal customers (visited ${loyal.avg_frequency.toFixed(0)}× in last 30d) — est ${estConversions} repeat visits, ${fmt$(estRevenue)} revenue, ${estRoas.toFixed(1)}x ROAS`,
        ai_recommendation: 'launch_now',
        status: 'open',
        detected_at: now,
      });
    }

    // --- Rule 3: LAPSED_CUSTOMER_WINBACK — win back via ads ---
    const lapsed = segments.find(s => s.segment === 'lapsed');
    if (lapsed && lapsed.count >= 3) {
      const budget = config.defaultBudget * 0.4; // winback is lower budget
      const estReach = Math.floor((budget / benchmark.cpm) * 1000);
      const estClicks = Math.floor(estReach * benchmark.ctr * 0.8); // lower CTR for lapsed
      const estConversions = Math.floor(estClicks * benchmark.cvr * 0.6);
      const estRevenue = estConversions * benchmark.avg_ticket;
      const estRoas = budget > 0 ? estRevenue / budget : 0;

      recommendations.push({
        rule_id: 'lapsed_customer_winback',
        severity: lapsed.count > 20 ? 'high' : 'medium',
        platform,
        audience_name: `Winback - ${lapsed.segment} (${lapsed.count} lapsed)`,
        audience_type: 'custom',
        audience_size: lapsed.count,
        suggested_budget: Math.round(budget * 100) / 100,
        est_reach: estReach,
        est_clicks: estClicks,
        est_conversions: estConversions,
        est_revenue: Math.round(estRevenue * 100) / 100,
        est_roas: Math.round(estRoas * 100) / 100,
        targeting_criteria: JSON.stringify({
          source: 'customer_list',
          filter: 'no_order_90d',
          offer: 'discount_20pct',
        }),
        source_segment: lapsed.segment,
        description: `Winback ads for ${lapsed.count} lapsed customers (avg ${loyal?.avg_recency_days.toFixed(0) || 120}d since last visit) — est ${estConversions} reactivations, ${fmt$(estRevenue)} revenue`,
        ai_recommendation: estRoas > 2 ? 'launch_now' : 'test_audience',
        status: 'open',
        detected_at: now,
      });
    }
  }

  // --- Rule 4: DEMOGRAPHIC_OPTIMIZE — best platform by segment ---
  // Find which platform has best est_roas for lookalike
  const lookalikeRecs = recommendations.filter(r => r.rule_id === 'lookalike_audience');
  if (lookalikeRecs.length > 0) {
    const bestPlatform = lookalikeRecs.sort((a, b) => b.est_roas - a.est_roas)[0];
    recommendations.push({
      rule_id: 'demographic_optimize',
      severity: 'high',
      platform: bestPlatform.platform,
      audience_name: `Best platform: ${bestPlatform.platform}`,
      audience_type: 'demographic',
      audience_size: bestPlatform.audience_size,
      suggested_budget: bestPlatform.suggested_budget * 1.5, // boost best platform
      est_reach: Math.floor(bestPlatform.est_reach * 1.5),
      est_clicks: Math.floor(bestPlatform.est_clicks * 1.5),
      est_conversions: Math.floor(bestPlatform.est_conversions * 1.5),
      est_revenue: Math.round(bestPlatform.est_revenue * 1.5 * 100) / 100,
      est_roas: bestPlatform.est_roas,
      targeting_criteria: bestPlatform.targeting_criteria,
      source_segment: bestPlatform.source_segment,
      description: `OPTIMAL PLATFORM: ${bestPlatform.platform} has best ROAS (${bestPlatform.est_roas.toFixed(1)}x) for lookalike audience — increase budget 50% here, reduce from underperforming platforms`,
      ai_recommendation: 'increase_budget',
      status: 'open',
      detected_at: now,
    });
  }

  // --- Rule 5: BUDGET_OPTIMIZE — overall budget recommendation ---
  const totalBudget = recommendations.reduce((s, r) => s + r.suggested_budget, 0);
  const totalRevenue = recommendations.reduce((s, r) => s + r.est_revenue, 0);
  const overallRoas = totalBudget > 0 ? totalRevenue / totalBudget : 0;

  if (overallRoas >= config.targetRoas) {
    recommendations.push({
      rule_id: 'budget_optimize',
      severity: 'high',
      platform: 'all',
      audience_name: 'Overall budget optimization',
      audience_type: 'budget',
      audience_size: 0,
      suggested_budget: Math.round(totalBudget * 1.2 * 100) / 100,
      est_reach: 0,
      est_clicks: 0,
      est_conversions: 0,
      est_revenue: Math.round(totalRevenue * 1.2 * 100) / 100,
      est_roas: Math.round(overallRoas * 100) / 100,
      description: `OVERALL: ${fmt$(totalBudget)}/day across ${recommendations.length} campaigns, est ${fmt$(totalRevenue)}/day revenue, ${overallRoas.toFixed(1)}x ROAS (exceeds ${config.targetRoas}x target). Increase total budget 20%.`,
      ai_recommendation: 'increase_budget',
      status: 'open',
      detected_at: now,
    });
  } else if (overallRoas < config.targetRoas * 0.5) {
    recommendations.push({
      rule_id: 'budget_optimize',
      severity: 'critical',
      platform: 'all',
      audience_name: 'Overall budget optimization',
      audience_type: 'budget',
      audience_size: 0,
      suggested_budget: Math.round(totalBudget * 0.5 * 100) / 100,
      est_reach: 0,
      est_clicks: 0,
      est_conversions: 0,
      est_revenue: Math.round(totalRevenue * 0.5 * 100) / 100,
      est_roas: Math.round(overallRoas * 100) / 100,
      description: `OVERALL: ${fmt$(totalBudget)}/day across ${recommendations.length} campaigns, est ${fmt$(totalRevenue)}/day revenue, ${overallRoas.toFixed(1)}x ROAS (below 50% of ${config.targetRoas}x target). Reduce budget 50% — campaigns underperforming.`,
      ai_recommendation: 'decrease_budget',
      status: 'open',
      detected_at: now,
    });
  }

  // 3. AI insight for top 5 high-priority recommendations
  if (config.aiEnabled && recommendations.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topRecs = recommendations
        .filter(r => r.severity === 'critical' || r.severity === 'high')
        .slice(0, 5);
      for (const r of topRecs) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a social media ad optimization AI for restaurants. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Ad: ${r.platform} ${r.audience_type} "${r.audience_name}". Budget ${fmt$(r.suggested_budget)}/day, est ${r.est_conversions} conversions, ${fmt$(r.est_revenue)} revenue, ${r.est_roas.toFixed(1)}x ROAS. Source: ${r.source_segment}.` },
          ], { temperature: 0.4, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          r.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM ad_targeting WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const r of recommendations) {
    try {
      await db.query(`CREATE ad_targeting CONTENT $data`, {
        data: { ...r, detected_at: r.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { recommendations, generated: recommendations.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveRecommendations = async (db: ReturnType<typeof useDB>): Promise<AdTargeting[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM ad_targeting
       WHERE status = 'open'
       ORDER BY est_roas DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  campaignCount: number;
  totalBudget: number;
  totalRevenue: number;
  avgRoas: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(suggested_budget) AS budget,
         math::sum(est_revenue) AS revenue,
         math::mean(est_roas) AS roas
       FROM ad_targeting
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      campaignCount: safeNumber(r.total, 0),
      totalBudget: safeNumber(r.budget, 0),
      totalRevenue: safeNumber(r.revenue, 0),
      avgRoas: safeNumber(r.roas, 0),
    };
  } catch {
    return { campaignCount: 0, totalBudget: 0, totalRevenue: 0, avgRoas: 0 };
  }
};

export const updateRecommendationStatus = async (
  db: ReturnType<typeof useDB>,
  recId: string,
  status: 'launched' | 'paused' | 'completed' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: recId, status });
};
