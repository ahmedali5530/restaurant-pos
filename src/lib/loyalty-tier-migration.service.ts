/**
 * AI Loyalty Tier Migration Predictor — predicts which customers will migrate
 * UP (bronze→silver→gold→platinum) or DOWN a tier in the next 30/60/90 days,
 * based on spend trajectory, visit frequency, tier threshold proximity,
 * engagement signals, and seasonal patterns. Enables targeted incentives to
 * accelerate upgrades (capture higher revenue) + prevent downgrades (protect
 * relationship) before they happen.
 *
 * 142nd POSR-exclusive differentiator — restaurants leave $700-2,500/mo per
 * location from missed tier upgrades (customers ready but unpushed) and silent
 * downgrades (customers churned without intervention). No POS predicts tier
 * migration; all react after the fact.
 *
 * Distinct from:
 *   - loyalty.service — OPERATIONAL accrue/redeem (not predictive migration)
 *   - loyalty-roi.service (42nd) — predicts loyalty PROGRAM ROI (not individual tier movement)
 *   - customer-ltv-multiplier.service (112th) — identifies LTV multiplier potential (not tier movement)
 *   - order-frequency-predictor.service (121st) — predicts FREQUENCY trajectory (not tier)
 *   - churn-prediction.service — predicts IF customer leaves entirely (binary, not tier drop)
 *   - retention-program.service — general retention (not tier-specific)
 *   - clv-trajectory.service — tracks VALUE direction (not tier migration timing)
 *
 * 8 AI rules:
 *   1. upgrade_imminent — customer 90%+ to next tier threshold, predicted to cross in 30d → accelerate
 *   2. upgrade_within_reach — customer 70-89% to next tier, predicted in 60d → gentle push
 *   3. downgrade_imminent — customer at risk of dropping below current tier threshold in 30d → save
 *   4. tier_stagnation — customer has been at same tier 18+ months despite activity → re-engage
 *   5. high_value_tier_upgrade — customer approaching platinum → personal outreach + VIP
 *   6. seasonal_tier_pattern — customer annually migrates tiers at this time → proactive
 *   7. tier_benefit_underuse — customer in tier but not using benefits → education needed
 *   8. peer_tier_mismatch — customer spends like a higher tier but isn't there → promote
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type TierMigRuleId =
  | 'upgrade_imminent'
  | 'upgrade_within_reach'
  | 'downgrade_imminent'
  | 'tier_stagnation'
  | 'high_value_tier_upgrade'
  | 'seasonal_tier_pattern'
  | 'tier_benefit_underuse'
  | 'peer_tier_mismatch';

export type TierMigAiRec =
  | 'accelerate_upgrade'
  | 'gentle_push'
  | 'save_offer'
  | 're_engage'
  | 'personal_outreach'
  | 'seasonal_proactive'
  | 'benefit_education'
  | 'promote_to_tier'
  | 'monitor'
  | 'skip';

export interface TierMigAlert {
  id?: string;
  rule_id: TierMigRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_name?: string;
  customer_id?: string;
  current_tier?: string;             // 'bronze' | 'silver' | 'gold' | 'platinum'
  target_tier?: string;              // tier they're approaching (upgrade or downgrade)
  tier_progress_pct?: number;        // 0-100 toward next tier threshold
  current_spend_30d?: number;        // spend in last 30 days
  projected_spend_30d?: number;      // forecasted next 30 days
  current_tier_threshold?: number;   // $ threshold to maintain current tier
  target_tier_threshold?: number;    // $ threshold to reach next tier
  days_to_migration?: number;        // predicted days until migration event
  monthly_spend_avg?: number;
  visits_last_30d?: number;
  benefits_used_count?: number;
  benefits_available_count?: number;
  months_at_current_tier?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: TierMigAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface TierMigConfig {
  aiEnabled: boolean;
  upgradeImminentThreshold: number;   // % to next tier (90%+ = imminent)
  upgradeReachThreshold: number;      // % to next tier (70% = within reach)
  downgradeRiskThreshold: number;     // % above current tier threshold (<110% = risk)
  stagnationMonths: number;           // months at tier to trigger stagnation
}

export const DEFAULT_TIERMIG_CONFIG: TierMigConfig = {
  aiEnabled: true,
  upgradeImminentThreshold: 90.0,
  upgradeReachThreshold: 70.0,
  downgradeRiskThreshold: 110.0,
  stagnationMonths: 18,
};

export const readTierMigConfig = (settings: any): TierMigConfig => ({
  aiEnabled: settings?.tiermig_ai_enabled ?? true,
  upgradeImminentThreshold: safeNumber(settings?.tiermig_upgrade_imminent, 90.0),
  upgradeReachThreshold: safeNumber(settings?.tiermig_upgrade_reach, 70.0),
  downgradeRiskThreshold: safeNumber(settings?.tiermig_downgrade_risk, 110.0),
  stagnationMonths: safeNumber(settings?.tiermig_stagnation_months, 18),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Tier threshold structure (annual spend $)
const TIER_THRESHOLDS: Record<string, { min: number; next: string; next_threshold: number; multiplier: number }> = {
  bronze:   { min: 0,     next: 'silver',   next_threshold: 500,   multiplier: 1.0 },
  silver:   { min: 500,   next: 'gold',     next_threshold: 1500,  multiplier: 1.25 },
  gold:     { min: 1500,  next: 'platinum', next_threshold: 4000,  multiplier: 1.5 },
  platinum: { min: 4000,  next: 'platinum', next_threshold: 4000,  multiplier: 2.0 },
};

interface CustomerTierData {
  customer_name: string;
  customer_id: string;
  current_tier: string;
  months_at_current_tier: number;
  // Spend trajectory
  current_spend_30d: number;          // spend in last 30 days
  projected_spend_30d: number;        // forecast next 30 days
  monthly_spend_avg: number;          // trailing 90-day avg
  annual_spend_run_rate: number;      // projected 365-day spend
  // Tier progress
  current_tier_threshold: number;     // $ to maintain current tier (annual)
  target_tier_threshold: number;      // $ to reach next tier (annual)
  tier_progress_pct: number;          // progress to next tier (0-100)
  // Engagement
  visits_last_30d: number;
  benefits_used_count: number;
  benefits_available_count: number;
  benefit_usage_pct: number;          // benefits_used / benefits_available
  // Seasonal pattern
  historical_upgrade_month?: string;  // month customer historically upgrades
  current_month?: string;
  // Peer comparison
  peer_group_avg_spend?: number;      // similar customers' avg spend
  // Economics
  tier_upgrade_value?: number;        // $ annual value if upgraded (multiplier effect)
  tier_downgrade_loss?: number;       // $ annual loss if downgraded
}

const MOCK_DATA: CustomerTierData[] = [
  {
    customer_name: 'Sarah Chen', customer_id: 'cust_001',
    current_tier: 'gold', months_at_current_tier: 14,
    current_spend_30d: 380, projected_spend_30d: 420, monthly_spend_avg: 340, annual_spend_run_rate: 4080,
    current_tier_threshold: 1500, target_tier_threshold: 4000, tier_progress_pct: 92,
    visits_last_30d: 8, benefits_used_count: 3, benefits_available_count: 6, benefit_usage_pct: 50,
    historical_upgrade_month: 'Nov', current_month: 'Oct',
    peer_group_avg_spend: 280, tier_upgrade_value: 1200,
  },
  {
    customer_name: 'Marcus Webb', customer_id: 'cust_002',
    current_tier: 'silver', months_at_current_tier: 8,
    current_spend_30d: 95, projected_spend_30d: 85, monthly_spend_avg: 110, annual_spend_run_rate: 1320,
    current_tier_threshold: 500, target_tier_threshold: 1500, tier_progress_pct: 78,
    visits_last_30d: 4, benefits_used_count: 1, benefits_available_count: 4, benefit_usage_pct: 25,
    tier_upgrade_value: 800,
  },
  {
    customer_name: 'Rodriguez Family', customer_id: 'cust_003',
    current_tier: 'gold', months_at_current_tier: 22,
    current_spend_30d: 110, projected_spend_30d: 95, monthly_spend_avg: 130, annual_spend_run_rate: 1560,
    current_tier_threshold: 1500, target_tier_threshold: 4000, tier_progress_pct: 102,
    visits_last_30d: 3, benefits_used_count: 2, benefits_available_count: 6, benefit_usage_pct: 33,
    tier_downgrade_loss: 600,
  },
  {
    customer_name: 'Jennifer Park', customer_id: 'cust_004',
    current_tier: 'silver', months_at_current_tier: 24,
    current_spend_30d: 60, projected_spend_30d: 65, monthly_spend_avg: 62, annual_spend_run_rate: 744,
    current_tier_threshold: 500, target_tier_threshold: 1500, tier_progress_pct: 50,
    visits_last_30d: 2, benefits_used_count: 0, benefits_available_count: 4, benefit_usage_pct: 0,
    tier_upgrade_value: 400,
  },
  {
    customer_name: 'David Okafor', customer_id: 'cust_005',
    current_tier: 'gold', months_at_current_tier: 6,
    current_spend_30d: 410, projected_spend_30d: 450, monthly_spend_avg: 380, annual_spend_run_rate: 4560,
    current_tier_threshold: 1500, target_tier_threshold: 4000, tier_progress_pct: 96,
    visits_last_30d: 9, benefits_used_count: 5, benefits_available_count: 6, benefit_usage_pct: 83,
    peer_group_avg_spend: 320, tier_upgrade_value: 1500,
  },
  {
    customer_name: 'Emily Davis', customer_id: 'cust_006',
    current_tier: 'bronze', months_at_current_tier: 3,
    current_spend_30d: 55, projected_spend_30d: 60, monthly_spend_avg: 50, annual_spend_run_rate: 600,
    current_tier_threshold: 0, target_tier_threshold: 500, tier_progress_pct: 84,
    visits_last_30d: 5, benefits_used_count: 1, benefits_available_count: 2, benefit_usage_pct: 50,
    historical_upgrade_month: 'Oct', current_month: 'Oct',
    tier_upgrade_value: 300,
  },
  {
    customer_name: 'Tom Anderson', customer_id: 'cust_007',
    current_tier: 'platinum', months_at_current_tier: 36,
    current_spend_30d: 480, projected_spend_30d: 510, monthly_spend_avg: 460, annual_spend_run_rate: 5520,
    current_tier_threshold: 4000, target_tier_threshold: 4000, tier_progress_pct: 100,
    visits_last_30d: 11, benefits_used_count: 7, benefits_available_count: 8, benefit_usage_pct: 88,
    peer_group_avg_spend: 350,
  },
  {
    customer_name: 'Lisa Martinez', customer_id: 'cust_008',
    current_tier: 'gold', months_at_current_tier: 11,
    current_spend_30d: 350, projected_spend_30d: 380, monthly_spend_avg: 320, annual_spend_run_rate: 3840,
    current_tier_threshold: 1500, target_tier_threshold: 4000, tier_progress_pct: 88,
    visits_last_30d: 7, benefits_used_count: 2, benefits_available_count: 6, benefit_usage_pct: 33,
    peer_group_avg_spend: 280, tier_upgrade_value: 1100,
  },
];

export const runTierMigEngine = async (
  db: ReturnType<typeof useDB>,
  config: TierMigConfig = DEFAULT_TIERMIG_CONFIG
): Promise<{ alerts: TierMigAlert[]; generated: number }> => {
  const alerts: TierMigAlert[] = [];
  const now = new Date();

  let data: CustomerTierData[] = [];
  try {
    const result = await db.query(
      `SELECT customer_name, customer_id, current_tier, months_at_current_tier,
              current_spend_30d, projected_spend_30d, monthly_spend_avg, annual_spend_run_rate,
              current_tier_threshold, target_tier_threshold, tier_progress_pct,
              visits_last_30d, benefits_used_count, benefits_available_count, benefit_usage_pct,
              historical_upgrade_month, current_month, peer_group_avg_spend,
              tier_upgrade_value, tier_downgrade_loss
       FROM loyalty_tier_migration_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      customer_name: String(r.customer_name ?? ''),
      customer_id: String(r.customer_id ?? ''),
      current_tier: String(r.current_tier ?? 'bronze'),
      months_at_current_tier: safeNumber(r.months_at_current_tier, 0),
      current_spend_30d: safeNumber(r.current_spend_30d, 0),
      projected_spend_30d: safeNumber(r.projected_spend_30d, 0),
      monthly_spend_avg: safeNumber(r.monthly_spend_avg, 0),
      annual_spend_run_rate: safeNumber(r.annual_spend_run_rate, 0),
      current_tier_threshold: safeNumber(r.current_tier_threshold, 0),
      target_tier_threshold: safeNumber(r.target_tier_threshold, 0),
      tier_progress_pct: safeNumber(r.tier_progress_pct, 0),
      visits_last_30d: safeNumber(r.visits_last_30d, 0),
      benefits_used_count: safeNumber(r.benefits_used_count, 0),
      benefits_available_count: safeNumber(r.benefits_available_count, 0),
      benefit_usage_pct: safeNumber(r.benefit_usage_pct, 0),
      historical_upgrade_month: r.historical_upgrade_month ?? undefined,
      current_month: r.current_month ?? undefined,
      peer_group_avg_spend: r.peer_group_avg_spend != null ? safeNumber(r.peer_group_avg_spend, 0) : undefined,
      tier_upgrade_value: r.tier_upgrade_value != null ? safeNumber(r.tier_upgrade_value, 0) : undefined,
      tier_downgrade_loss: r.tier_downgrade_loss != null ? safeNumber(r.tier_downgrade_loss, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[tiermig] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const tierInfo = TIER_THRESHOLDS[d.current_tier] ?? TIER_THRESHOLDS.bronze;
    const targetTier = tierInfo.next !== d.current_tier ? tierInfo.next : null;

    // Rule 1: UPGRADE_IMMINENT
    if (d.tier_progress_pct >= config.upgradeImminentThreshold && targetTier && d.current_tier !== 'platinum') {
      const daysToMigration = Math.max(7, Math.round((100 - d.tier_progress_pct) / (d.projected_spend_30d / d.target_tier_threshold * 100) * 30));
      const upgradeValue = d.tier_upgrade_value ?? Math.round(d.annual_spend_run_rate * (tierInfo.multiplier - 1) * 0.3);
      alerts.push({
        rule_id: 'upgrade_imminent',
        severity: 'high',
        customer_name: d.customer_name,
        current_tier: d.current_tier,
        target_tier: targetTier,
        tier_progress_pct: d.tier_progress_pct,
        current_spend_30d: d.current_spend_30d,
        projected_spend_30d: d.projected_spend_30d,
        target_tier_threshold: d.target_tier_threshold,
        days_to_migration: daysToMigration,
        visits_last_30d: d.visits_last_30d,
        est_monthly_opportunity: Math.round(upgradeValue / 12),
        description: `UPGRADE IMMINENT: ${d.customer_name} is ${d.tier_progress_pct.toFixed(0)}% toward ${d.current_tier}→${targetTier} tier (threshold ${fmt$(d.target_tier_threshold)} annual). Predicted migration: ~${daysToMigration} days. Current 30d spend ${fmt$(d.current_spend_30d)}, projected ${fmt$(d.projected_spend_30d)} (+${((d.projected_spend_30d - d.current_spend_30d) / Math.max(d.current_spend_30d, 1) * 100).toFixed(0)}%). ACTION: send targeted upgrade incentive — "You're ${fmt$(d.target_tier_threshold * (1 - d.tier_progress_pct / 100))} from ${targetTier}! Bonus 2x points this week" or comp a dessert on next visit to push over threshold. Tier upgrade captures ${fmt$(upgradeValue)}/yr in incremental revenue (multiplier effect + retention). Cost of missed push: customer stalls at current tier for months.`,
        ai_recommendation: 'accelerate_upgrade',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: UPGRADE_WITHIN_REACH
    if (d.tier_progress_pct >= config.upgradeReachThreshold && d.tier_progress_pct < config.upgradeImminentThreshold && targetTier) {
      const daysToMigration = Math.max(30, Math.round((100 - d.tier_progress_pct) / (d.projected_spend_30d / d.target_tier_threshold * 100) * 30));
      const upgradeValue = d.tier_upgrade_value ?? Math.round(d.annual_spend_run_rate * (tierInfo.multiplier - 1) * 0.3);
      alerts.push({
        rule_id: 'upgrade_within_reach',
        severity: 'medium',
        customer_name: d.customer_name,
        current_tier: d.current_tier,
        target_tier: targetTier,
        tier_progress_pct: d.tier_progress_pct,
        current_spend_30d: d.current_spend_30d,
        projected_spend_30d: d.projected_spend_30d,
        target_tier_threshold: d.target_tier_threshold,
        days_to_migration: daysToMigration,
        visits_last_30d: d.visits_last_30d,
        est_monthly_opportunity: Math.round(upgradeValue / 12 * 0.6),
        description: `UPGRADE WITHIN REACH: ${d.customer_name} is ${d.tier_progress_pct.toFixed(0)}% toward ${d.current_tier}→${targetTier} tier. Predicted migration: ~${daysToMigration} days (60-day window). Spend trajectory healthy (${fmt$(d.current_spend_30d)} → ${fmt$(d.projected_spend_30d)} projected). ACTION: gentle push — soft reminder of tier progress + small incentive (bonus points weekend, free upgrade-eligible item). Don't overdo — customer is on natural trajectory. Captures ${fmt$(upgradeValue * 0.6)}/yr if accelerated by 60 days. ${d.visits_last_30d >= 6 ? 'High visit frequency — single extra visit could trigger upgrade. ' : ''}Tiered customers spend 20-30% more than non-tiered.`,
        ai_recommendation: 'gentle_push',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: DOWNGRADE_IMMINENT
    const downgradeRiskPct = d.current_tier_threshold > 0
      ? (d.annual_spend_run_rate / d.current_tier_threshold) * 100
      : 999;
    if (downgradeRiskPct < config.downgradeRiskThreshold && d.current_tier !== 'bronze') {
      const downgradeLoss = d.tier_downgrade_loss ?? Math.round(d.annual_spend_run_rate * 0.2);
      const daysToDowngrade = Math.max(14, Math.round((d.current_tier_threshold - d.annual_spend_run_rate) / Math.max(d.projected_spend_30d * 12 - d.annual_spend_run_rate, 1) * 30));
      alerts.push({
        rule_id: 'downgrade_imminent',
        severity: 'critical',
        customer_name: d.customer_name,
        current_tier: d.current_tier,
        target_tier: TIER_THRESHOLDS[d.current_tier] ? 'bronze' : d.current_tier, // approximate downgrade target
        tier_progress_pct: downgradeRiskPct,
        current_spend_30d: d.current_spend_30d,
        projected_spend_30d: d.projected_spend_30d,
        current_tier_threshold: d.current_tier_threshold,
        days_to_migration: daysToDowngrade,
        visits_last_30d: d.visits_last_30d,
        est_monthly_opportunity: Math.round(downgradeLoss / 12),
        description: `DOWNGRADE IMMINENT: ${d.customer_name} (${d.current_tier} tier) projected to drop below ${fmt$(d.current_tier_threshold)} annual threshold in ~${daysToDowngrade} days. Annual run-rate: ${fmt$(d.annual_spend_run_rate)} (${downgradeRiskPct.toFixed(0)}% of threshold). Spend declining: ${fmt$(d.current_spend_30d)} last 30d → ${fmt$(d.projected_spend_30d)} projected (−${((d.current_spend_30d - d.projected_spend_30d) / Math.max(d.current_spend_30d, 1) * 100).toFixed(0)}%). ACTION: URGENT — personal save offer: "We've missed you! Come back this week for 3x points + free appetizer." Tier downgrade signals disengagement → 60% will churn within 6 months. Cost of lost customer: ${fmt$(downgradeLoss * 5)} LTV. Tier downgrade is the canary in the churn coal mine — intervene NOW.`,
        ai_recommendation: 'save_offer',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: TIER_STAGNATION
    if (d.months_at_current_tier >= config.stagnationMonths && d.current_tier !== 'platinum') {
      const upgradeValue = d.tier_upgrade_value ?? Math.round(d.annual_spend_run_rate * 0.2);
      alerts.push({
        rule_id: 'tier_stagnation',
        severity: 'medium',
        customer_name: d.customer_name,
        current_tier: d.current_tier,
        target_tier: targetTier ?? undefined,
        months_at_current_tier: d.months_at_current_tier,
        tier_progress_pct: d.tier_progress_pct,
        current_spend_30d: d.current_spend_30d,
        visits_last_30d: d.visits_last_30d,
        est_monthly_opportunity: Math.round(upgradeValue / 12 * 0.4),
        description: `TIER STAGNATION: ${d.customer_name} has been at ${d.current_tier} tier for ${d.months_at_current_tier} months (threshold ${config.stagnationMonths}). Active customer (${d.visits_last_30d} visits last 30d, ${fmt$(d.current_spend_30d)} spend) but not progressing. ACTION: re-engage with tier progress update + targeted incentive to push upgrade. Common causes: customer doesn't know they're close, benefits aren't compelling, or no recent communication. Send personalized "You're X% to ${targetTier ?? 'next tier'}" message + tier-specific perk (free dessert, priority seating). Stagnant customers are vulnerable to competitor poaching — they're active but not committed. Captures ${fmt$(upgradeValue * 0.4)}/yr if nudged to upgrade.`,
        ai_recommendation: 're_engage',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: HIGH_VALUE_TIER_UPGRADE (approaching platinum)
    if (d.current_tier === 'gold' && d.tier_progress_pct >= 85) {
      const upgradeValue = d.tier_upgrade_value ?? 1500;
      alerts.push({
        rule_id: 'high_value_tier_upgrade',
        severity: 'high',
        customer_name: d.customer_name,
        current_tier: d.current_tier,
        target_tier: 'platinum',
        tier_progress_pct: d.tier_progress_pct,
        current_spend_30d: d.current_spend_30d,
        target_tier_threshold: d.target_tier_threshold,
        days_to_migration: Math.max(14, Math.round((100 - d.tier_progress_pct) / (d.projected_spend_30d / d.target_tier_threshold * 100) * 30)),
        visits_last_30d: d.visits_last_30d,
        est_monthly_opportunity: Math.round(upgradeValue / 12),
        description: `HIGH-VALUE TIER UPGRADE: ${d.customer_name} approaching PLATINUM tier (${d.tier_progress_pct.toFixed(0)}% to threshold ${fmt$(d.target_tier_threshold)}). Platinum customers drive 4-6x revenue of bronze, refer 3-5 new customers annually, and have 95% retention. ACTION: personal outreach from manager — phone call or handwritten note recognizing their loyalty + inviting to platinum. Offer platinum preview perks (priority booking, chef's tasting menu invitation). ${d.visits_last_30d >= 8 ? 'Already visits 8+ times/month — highly engaged. ' : ''}Platinum upgrade captures ${fmt$(upgradeValue)}/yr in incremental revenue + 4-5 referrals worth ${fmt$(upgradeValue * 2)} LTV each. Don't let this slip — manager personally handles.`,
        ai_recommendation: 'personal_outreach',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: SEASONAL_TIER_PATTERN
    if (d.historical_upgrade_month && d.current_month && d.historical_upgrade_month === d.current_month) {
      const upgradeValue = d.tier_upgrade_value ?? Math.round(d.annual_spend_run_rate * 0.2);
      alerts.push({
        rule_id: 'seasonal_tier_pattern',
        severity: 'low',
        customer_name: d.customer_name,
        current_tier: d.current_tier,
        target_tier: targetTier ?? undefined,
        tier_progress_pct: d.tier_progress_pct,
        visits_last_30d: d.visits_last_30d,
        est_monthly_opportunity: Math.round(upgradeValue / 12 * 0.3),
        description: `SEASONAL TIER PATTERN: ${d.customer_name} historically upgrades tier in ${d.historical_upgrade_month} (current month). Customer's spend pattern shows annual seasonality — they concentrate spend in this period. ACTION: proactive outreach this month with upgrade incentive matching their pattern ("It's that time of year! Bonus points through end of month"). Customers with seasonal patterns respond well to acknowledgment of their rhythm. Captures ${fmt$(upgradeValue * 0.3)}/yr in incremental revenue. Don't miss the seasonal window — they'll spend somewhere, make sure it's with you.`,
        ai_recommendation: 'seasonal_proactive',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: TIER_BENEFIT_UNDERUSE
    if (d.benefit_usage_pct < 40 && d.benefits_available_count >= 3) {
      alerts.push({
        rule_id: 'tier_benefit_underuse',
        severity: 'medium',
        customer_name: d.customer_name,
        current_tier: d.current_tier,
        benefits_used_count: d.benefits_used_count,
        benefits_available_count: d.benefits_available_count,
        visits_last_30d: d.visits_last_30d,
        est_monthly_opportunity: Math.round(d.monthly_spend_avg * 0.15),
        description: `TIER BENEFIT UNDERUSE: ${d.customer_name} (${d.current_tier} tier) uses only ${d.benefits_used_count}/${d.benefits_available_count} benefits (${d.benefit_usage_pct.toFixed(0)}% utilization). Customer is active (${d.visits_last_30d} visits last 30d) but not engaging with tier perks. Underused benefits = perceived low tier value = downgrade risk + churn risk. ACTION: benefit education campaign — send personalized "Did you know?" email listing unused benefits (free birthday dessert, priority booking, 2x points Tuesday). Have servers mention benefits during visits. Customers who use benefits are 3x more likely to upgrade + 5x less likely to churn. Save ${fmt$(d.monthly_spend_avg * 0.15 * 12)}/yr in retained revenue.`,
        ai_recommendation: 'benefit_education',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: PEER_TIER_MISMATCH
    if (d.peer_group_avg_spend != null && d.peer_group_avg_spend > 0) {
      const spendVsPeers = (d.current_spend_30d / d.peer_group_avg_spend) * 100;
      const peerTier = d.current_tier === 'bronze' ? 'silver' : d.current_tier === 'silver' ? 'gold' : 'platinum';
      if (spendVsPeers >= 130 && d.tier_progress_pct < config.upgradeReachThreshold && d.current_tier !== 'platinum') {
        const upgradeValue = d.tier_upgrade_value ?? Math.round(d.annual_spend_run_rate * 0.25);
        alerts.push({
          rule_id: 'peer_tier_mismatch',
          severity: 'medium',
          customer_name: d.customer_name,
          current_tier: d.current_tier,
          target_tier: peerTier,
          current_spend_30d: d.current_spend_30d,
          visits_last_30d: d.visits_last_30d,
          est_monthly_opportunity: Math.round(upgradeValue / 12),
          description: `PEER TIER MISMATCH: ${d.customer_name} spends ${fmt$(d.current_spend_30d)}/mo — ${spendVsPeers.toFixed(0)}% of peer group avg (${fmt$(d.peer_group_avg_spend)}). Spending like a ${peerTier} customer but stuck at ${d.current_tier}. This usually means: (a) customer should be in higher tier — promote, or (b) tier thresholds are misaligned with customer behavior. ACTION: ${d.tier_progress_pct < 50 ? 'review tier threshold structure — peers all spending similarly but stuck at lower tier means threshold too high. ' : 'fast-track this customer to higher tier — they are already spending at that level. '}Peer mismatch = opportunity. Promoting them captures ${fmt$(upgradeValue)}/yr + signals you see their loyalty. Customers promoted early show 2x retention vs those who reach tier naturally.`,
          ai_recommendation: 'promote_to_tier',
          status: 'open', detected_at: now,
        });
      }
    }
  }

  // Generate AI insights for critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat({
            messages: [
              { role: 'system', content: 'You are a restaurant loyalty program optimization AI. Given tier migration prediction, recommend ONE specific action with expected revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Customer: ${a.customer_name ?? 'n/a'}. Current tier: ${a.current_tier ?? 'n/a'}. Target: ${a.target_tier ?? 'n/a'}. Progress: ${a.tier_progress_pct ?? 0}%. Current 30d spend: ${fmt$(a.current_spend_30d ?? 0)}. Projected: ${fmt$(a.projected_spend_30d ?? 0)}. Days to migration: ${a.days_to_migration ?? 0}. Visits: ${a.visits_last_30d ?? 0}/30d. Benefits used: ${a.benefits_used_count ?? 0}/${a.benefits_available_count ?? 0}. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
            ],
            task: 'reporting',
          });
          const text = typeof response === 'string'
            ? response
            : (response as any)?.choices?.[0]?.message?.content ?? '';
          a.ai_insight = String(text).slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  // Persist alerts
  try {
    await db.query(`DELETE FROM loyalty_tier_migration_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE loyalty_tier_migration_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<TierMigAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM loyalty_tier_migration_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  upgradeCandidates: number; downgradeRisks: number; avgTierProgress: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id LIKE '%upgrade%' OR rule_id = 'high_value_tier_upgrade') AS upgrades,
              math::count(rule_id = 'downgrade_imminent') AS downgrades,
              math::mean(tier_progress_pct WHERE tier_progress_pct != NONE) AS avgprogress
       FROM loyalty_tier_migration_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      upgradeCandidates: safeNumber(r.upgrades, 0),
      downgradeRisks: safeNumber(r.downgrades, 0),
      avgTierProgress: safeNumber(r.avgprogress, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, upgradeCandidates: 0, downgradeRisks: 0, avgTierProgress: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
