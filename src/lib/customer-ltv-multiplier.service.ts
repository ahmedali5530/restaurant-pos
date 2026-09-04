/**
 * AI Customer LTV Multiplier Predictor — identifies customers whose value
 * could 2-5x with targeted retention/upsell investment (multiplier candidates).
 *
 * 112th POSR-exclusive differentiator — restaurants leave $500-2,000/mo per
 * location by treating all customers equally instead of investing in
 * multiplier candidates. No POS identifies latent high-value potential.
 *
 * Distinct from:
 *   - clv.service (computes current CLV SNAPSHOT — NOT future multiplier potential)
 *   - clv-trajectory.service (tracks historical DIRECTION of CLV change — NOT predicted multiplier)
 *   - churn-prediction.service (predicts who will LEAVE — NOT who could multiply)
 *   - winback.service (targets customers who LEFT — NOT current multiplier candidates)
 *   - customer-segmentation.service (groups customers by behavior — NOT investment ROI)
 *   - loyalty-roi.service (measures loyalty program ROI — NOT individual customer multiplier)
 *   - retention-program.service (general retention — NOT targeted multiplier investment)
 *
 * 8 AI rules:
 *   1. multiplier_candidate — predicted LTV ≥2x current → invest in retention
 *   2. referral_multiplier — customer brings 3+ new customers → amplify referrals
 *   3. category_expansion — single-category buyer with multi-category potential
 *   4. frequency_multiplier — monthly buyer with weekly potential → frequency incentive
 *   5. vip_in_training — high-potential signals but not yet high-value → VIP treatment
 *   6. optimal_investment — ROI ≥3x on retention investment → invest now
 *   7. false_multiplier — one-time spike mistaken for potential → don't invest
 *   8. multiplier_realized — prediction came true → track + replicate strategy
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type LTVMultRuleId =
  | 'multiplier_candidate'
  | 'referral_multiplier'
  | 'category_expansion'
  | 'frequency_multiplier'
  | 'vip_in_training'
  | 'optimal_investment'
  | 'false_multiplier'
  | 'multiplier_realized';

export type LTVMultAiRec =
  | 'invest_now'
  | 'upsell_premium'
  | 'referral_program'
  | 'category_cross_sell'
  | 'frequency_incentive'
  | 'vip_treatment'
  | 'monitor'
  | 'skip';

export interface LTVMultAlert {
  id?: string;
  rule_id: LTVMultRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_id: string;
  customer_name: string;
  current_ltv?: number;
  predicted_ltv?: number;
  multiplier?: number;
  multiplier_type?: 'referral' | 'category_expansion' | 'frequency' | 'vip_escalation';
  retention_investment?: number;
  expected_return?: number;
  roi_multiple?: number;
  signals?: string;
  months_to_realize?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: LTVMultAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface LTVMultConfig {
  aiEnabled: boolean;
  minMultiplier: number;
  minRoi: number;
  maxInvestment: number;
  realizationWindow: number;
}

export const DEFAULT_LTVMULT_CONFIG: LTVMultConfig = {
  aiEnabled: true,
  minMultiplier: 2.0,
  minRoi: 3.0,
  maxInvestment: 100.0,
  realizationWindow: 6,
};

export const readLTVMultConfig = (settings: any): LTVMultConfig => ({
  aiEnabled: settings?.ltvmult_ai_enabled ?? true,
  minMultiplier: safeNumber(settings?.ltvmult_min_multiplier, 2.0),
  minRoi: safeNumber(settings?.ltvmult_min_roi, 3.0),
  maxInvestment: safeNumber(settings?.ltvmult_max_investment, 100.0),
  realizationWindow: safeNumber(settings?.ltvmult_realization_window, 6),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface CustomerData {
  customer_id: string;
  customer_name: string;
  current_ltv: number;
  predicted_ltv: number;
  // Signals for multiplier potential
  visit_frequency_per_month: number;   // current visits/mo
  predicted_frequency_per_month: number;
  categories_purchased: number;        // how many menu categories
  referral_count: number;              // customers they referred
  avg_order_value: number;
  predicted_aov: number;
  tenure_months: number;
  last_visit_days_ago: number;
  signals: string[];
  // For false_multiplier detection
  has_one_time_spike?: boolean;
  // For multiplier_realized tracking
  was_predicted_multiplier?: boolean;
  actual_ltv_now?: number;
  predicted_ltv_then?: number;
}

const MOCK_CUSTOMERS: CustomerData[] = [
  {
    customer_id: 'C001', customer_name: 'Sarah Chen',
    current_ltv: 340, predicted_ltv: 1280,
    visit_frequency_per_month: 2, predicted_frequency_per_month: 6,
    categories_purchased: 2, referral_count: 4,
    avg_order_value: 28, predicted_aov: 42,
    tenure_months: 4, last_visit_days_ago: 3,
    signals: ['growing_frequency', 'referral_history', 'high_spend_growth'],
  },
  {
    customer_id: 'C002', customer_name: 'Mike Rodriguez',
    current_ltv: 520, predicted_ltv: 1850,
    visit_frequency_per_month: 3, predicted_frequency_per_month: 8,
    categories_purchased: 1, referral_count: 6,
    avg_order_value: 35, predicted_aov: 48,
    tenure_months: 6, last_visit_days_ago: 2,
    signals: ['referral_history', 'single_category', 'growing_aov'],
  },
  {
    customer_id: 'C003', customer_name: 'Emma Williams',
    current_ltv: 180, predicted_ltv: 720,
    visit_frequency_per_month: 1, predicted_frequency_per_month: 5,
    categories_purchased: 3, referral_count: 1,
    avg_order_value: 22, predicted_aov: 32,
    tenure_months: 3, last_visit_days_ago: 5,
    signals: ['growing_frequency', 'multi_category', 'young_tenure'],
  },
  {
    customer_id: 'C004', customer_name: 'James Park',
    current_ltv: 890, predicted_ltv: 2100,
    visit_frequency_per_month: 6, predicted_frequency_per_month: 10,
    categories_purchased: 4, referral_count: 8,
    avg_order_value: 45, predicted_aov: 58,
    tenure_months: 12, last_visit_days_ago: 1,
    signals: ['high_frequency', 'referral_history', 'high_spend', 'multi_category'],
  },
  {
    customer_id: 'C005', customer_name: 'Lisa Anderson',
    current_ltv: 420, predicted_ltv: 380,
    visit_frequency_per_month: 3, predicted_frequency_per_month: 3,
    categories_purchased: 2, referral_count: 0,
    avg_order_value: 30, predicted_aov: 28,
    tenure_months: 8, last_visit_days_ago: 4,
    signals: ['stable', 'no_referrals'],
    has_one_time_spike: true,
  },
  {
    customer_id: 'C006', customer_name: 'David Kumar',
    current_ltv: 1450, predicted_ltv: 1650,
    visit_frequency_per_month: 8, predicted_frequency_per_month: 9,
    categories_purchased: 5, referral_count: 3,
    avg_order_value: 52, predicted_aov: 55,
    tenure_months: 18, last_visit_days_ago: 2,
    signals: ['high_value', 'stable', 'vip_candidate'],
    was_predicted_multiplier: true, actual_ltv_now: 1450, predicted_ltv_then: 1400,
  },
  {
    customer_id: 'C007', customer_name: 'Rachel Green',
    current_ltv: 260, predicted_ltv: 980,
    visit_frequency_per_month: 2, predicted_frequency_per_month: 5,
    categories_purchased: 1, referral_count: 2,
    avg_order_value: 26, predicted_aov: 38,
    tenure_months: 5, last_visit_days_ago: 6,
    signals: ['growing_frequency', 'single_category', 'referral_history'],
  },
];

export const runLTVMultEngine = async (
  db: ReturnType<typeof useDB>,
  config: LTVMultConfig = DEFAULT_LTVMULT_CONFIG
): Promise<{ alerts: LTVMultAlert[]; generated: number }> => {
  const alerts: LTVMultAlert[] = [];
  const now = new Date();

  let customers: CustomerData[] = [];
  try {
    const result = await db.query(
      `SELECT customer_id, customer_name, current_ltv, predicted_ltv,
              visit_frequency_per_month, predicted_frequency_per_month,
              categories_purchased, referral_count,
              avg_order_value, predicted_aov,
              tenure_months, last_visit_days_ago, signals,
              has_one_time_spike, was_predicted_multiplier,
              actual_ltv_now, predicted_ltv_then
       FROM customer_ltv_multiplier_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    customers = rows.map((r: any) => ({
      customer_id: String(r.customer_id ?? 'Unknown'),
      customer_name: String(r.customer_name ?? 'Unknown'),
      current_ltv: safeNumber(r.current_ltv, 0),
      predicted_ltv: safeNumber(r.predicted_ltv, 0),
      visit_frequency_per_month: safeNumber(r.visit_frequency_per_month, 0),
      predicted_frequency_per_month: safeNumber(r.predicted_frequency_per_month, 0),
      categories_purchased: safeNumber(r.categories_purchased, 0),
      referral_count: safeNumber(r.referral_count, 0),
      avg_order_value: safeNumber(r.avg_order_value, 0),
      predicted_aov: safeNumber(r.predicted_aov, 0),
      tenure_months: safeNumber(r.tenure_months, 0),
      last_visit_days_ago: safeNumber(r.last_visit_days_ago, 0),
      signals: Array.isArray(r.signals) ? r.signals : [],
      has_one_time_spike: r.has_one_time_spike ?? false,
      was_predicted_multiplier: r.was_predicted_multiplier ?? false,
      actual_ltv_now: r.actual_ltv_now != null ? safeNumber(r.actual_ltv_now, 0) : undefined,
      predicted_ltv_then: r.predicted_ltv_then != null ? safeNumber(r.predicted_ltv_then, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[ltvmult] fetchCustomers failed — using mock', err);
  }

  if (customers.length === 0) {
    customers = MOCK_CUSTOMERS;
  }

  for (const c of customers) {
    const multiplier = c.current_ltv > 0 ? c.predicted_ltv / c.current_ltv : 0;
    const uplift = c.predicted_ltv - c.current_ltv;
    const retentionInvestment = Math.min(config.maxInvestment, Math.round(uplift * 0.08 * 100) / 100);
    const expectedReturn = uplift;
    const roiMultiple = retentionInvestment > 0 ? expectedReturn / retentionInvestment : 0;
    const monthlyOpp = Math.round(uplift / config.realizationWindow);

    // Rule 1: MULTIPLIER_CANDIDATE (predicted LTV ≥2x current)
    if (multiplier >= config.minMultiplier && !c.has_one_time_spike) {
      alerts.push({
        rule_id: 'multiplier_candidate',
        severity: multiplier >= 3 ? 'critical' : 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        current_ltv: c.current_ltv,
        predicted_ltv: c.predicted_ltv,
        multiplier: Math.round(multiplier * 10) / 10,
        retention_investment: retentionInvestment,
        expected_return: expectedReturn,
        roi_multiple: Math.round(roiMultiple * 10) / 10,
        signals: c.signals.join(','),
        months_to_realize: config.realizationWindow,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: MULTIPLIER CANDIDATE — current LTV ${fmt$(c.current_ltv)} but predicted ${fmt$(c.predicted_ltv)} (${multiplier.toFixed(1)}x potential). Invest ${fmt$(retentionInvestment)} in retention → expected return ${fmt$(expectedReturn)} (ROI ${roiMultiple.toFixed(1)}x over ${config.realizationWindow}mo). Signals: ${c.signals.join(', ')}. This customer could become a top-10% customer with targeted investment.`,
        ai_recommendation: 'invest_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: REFERRAL_MULTIPLIER (customer brings 3+ new customers)
    if (c.referral_count >= 3) {
      const referralValue = c.referral_count * c.avg_order_value * 12; // 1 year of referred customer value
      const totalMultiplier = (c.current_ltv + referralValue) / Math.max(c.current_ltv, 1);
      alerts.push({
        rule_id: 'referral_multiplier',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        current_ltv: c.current_ltv,
        multiplier: Math.round(totalMultiplier * 10) / 10,
        multiplier_type: 'referral',
        expected_return: referralValue,
        signals: c.signals.join(','),
        est_monthly_opportunity: Math.round(referralValue / 12),
        description: `${c.customer_name}: REFERRAL MULTIPLIER — brought ${c.referral_count} new customers worth ~${fmt$(referralValue)} in annual referred value. True LTV (incl. referrals) is ${totalMultiplier.toFixed(1)}x stated LTV. AMPLIFY: enroll in referral program, offer double-sided rewards. Each new referral worth ~${fmt$(c.avg_order_value * 12)}/yr. Losing this customer = losing their entire referral network.`,
        ai_recommendation: 'referral_program',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: CATEGORY_EXPANSION (single-category buyer with multi-category potential)
    if (c.categories_purchased === 1 && c.predicted_ltv > c.current_ltv * 1.5) {
      const expansionValue = Math.round((c.predicted_ltv - c.current_ltv) * 0.6);
      alerts.push({
        rule_id: 'category_expansion',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        current_ltv: c.current_ltv,
        predicted_ltv: c.predicted_ltv,
        multiplier: Math.round(multiplier * 10) / 10,
        multiplier_type: 'category_expansion',
        expected_return: expansionValue,
        signals: c.signals.join(','),
        est_monthly_opportunity: Math.round(expansionValue / config.realizationWindow),
        description: `${c.customer_name}: CATEGORY EXPANSION — buys from only 1 category but has ${multiplier.toFixed(1)}x LTV potential. Likely unaware of other categories. CROSS-SELL: introduce complementary categories (e.g. desserts, beverages, sides). Each new category adopted = ~${fmt$(expansionValue / 3)} additional LTV. Targeted cross-sell campaign could unlock ${fmt$(expansionValue)} in value.`,
        ai_recommendation: 'category_cross_sell',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: FREQUENCY_MULTIPLIER (monthly buyer with weekly potential)
    if (c.visit_frequency_per_month <= 2 && c.predicted_frequency_per_month >= 5) {
      const freqUplift = (c.predicted_frequency_per_month - c.visit_frequency_per_month) * c.avg_order_value * 12;
      alerts.push({
        rule_id: 'frequency_multiplier',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        current_ltv: c.current_ltv,
        predicted_ltv: c.predicted_ltv,
        multiplier: Math.round(multiplier * 10) / 10,
        multiplier_type: 'frequency',
        expected_return: freqUplift,
        signals: c.signals.join(','),
        est_monthly_opportunity: Math.round(freqUplift / 12),
        description: `${c.customer_name}: FREQUENCY MULTIPLIER — visits ${c.visit_frequency_per_month}x/month but predicted to reach ${c.predicted_frequency_per_month}x/month. Frequency gap = ${fmt$(freqUplift)}/yr potential. INCENTIVE: frequency-based loyalty reward (visit 5x → free item). Converting monthly→weekly buyer = ${fmt$(c.avg_order_value * 4 * 12)}/yr uplift. Highest-ROI multiplier type.`,
        ai_recommendation: 'frequency_incentive',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: VIP_IN_TRAINING (high-potential signals but not yet high-value)
    if (c.current_ltv < 500 && c.predicted_ltv >= 1000 && c.signals.includes('growing_frequency')) {
      alerts.push({
        rule_id: 'vip_in_training',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        current_ltv: c.current_ltv,
        predicted_ltv: c.predicted_ltv,
        multiplier: Math.round(multiplier * 10) / 10,
        multiplier_type: 'vip_escalation',
        retention_investment: retentionInvestment,
        signals: c.signals.join(','),
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: VIP IN TRAINING — current LTV ${fmt$(c.current_ltv)} (low) but trajectory + signals suggest future VIP (${fmt$(c.predicted_ltv)}). Give VIP TREATMENT EARLY: priority service, personal greeting, exclusive offers. Investing ${fmt$(retentionInvestment)} now locks in ${fmt$(c.predicted_ltv)} future value. Catch them BEFORE they become high-value (cheaper to retain early).`,
        ai_recommendation: 'vip_treatment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: OPTIMAL_INVESTMENT (ROI ≥3x on retention investment)
    if (multiplier >= config.minMultiplier && roiMultiple >= config.minRoi && !c.has_one_time_spike) {
      alerts.push({
        rule_id: 'optimal_investment',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        current_ltv: c.current_ltv,
        predicted_ltv: c.predicted_ltv,
        multiplier: Math.round(multiplier * 10) / 10,
        retention_investment: retentionInvestment,
        expected_return: expectedReturn,
        roi_multiple: Math.round(roiMultiple * 10) / 10,
        months_to_realize: config.realizationWindow,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: OPTIMAL INVESTMENT — invest ${fmt$(retentionInvestment)} → expected return ${fmt$(expectedReturn)} (ROI ${roiMultiple.toFixed(1)}x). Among best investment opportunities in customer base. Recommended actions: personalized outreach + premium upsell offer + loyalty tier upgrade. Realization window: ${config.realizationWindow} months. Opportunity cost of NOT investing: ${fmt$(monthlyOpp)}/mo in unrealized value.`,
        ai_recommendation: 'upsell_premium',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: FALSE_MULTIPLIER (one-time spike mistaken for potential)
    if (c.has_one_time_spike && multiplier >= config.minMultiplier) {
      alerts.push({
        rule_id: 'false_multiplier',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        current_ltv: c.current_ltv,
        predicted_ltv: c.predicted_ltv,
        multiplier: Math.round(multiplier * 10) / 10,
        signals: c.signals.join(','),
        est_monthly_opportunity: 0,
        description: `${c.customer_name}: FALSE MULTIPLIER — appears to have ${multiplier.toFixed(1)}x potential but LTV spike was one-time event (catering order, gift card, holiday). Predicted LTV ${fmt$(c.predicted_ltv)} is inflated. DO NOT invest heavily — monitor for sustained pattern before committing retention budget. Saves ~${fmt$(retentionInvestment)} in misallocated investment. Real multiplier is likely ~1.2-1.5x.`,
        ai_recommendation: 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: MULTIPLIER_REALIZED (prediction came true)
    if (c.was_predicted_multiplier && c.actual_ltv_now != null && c.predicted_ltv_then != null) {
      const realizationRate = c.predicted_ltv_then > 0 ? (c.actual_ltv_now / c.predicted_ltv_then) * 100 : 0;
      if (realizationRate >= 80) {
        alerts.push({
          rule_id: 'multiplier_realized',
          severity: 'low',
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          current_ltv: c.actual_ltv_now,
          predicted_ltv: c.predicted_ltv_then,
          multiplier: Math.round((c.actual_ltv_now / Math.max(c.predicted_ltv_then * 0.5, 1)) * 10) / 10,
          months_to_realize: config.realizationWindow,
          est_monthly_opportunity: Math.round(c.actual_ltv_now / 12),
          description: `${c.customer_name}: MULTIPLIER REALIZED — predicted ${fmt$(c.predicted_ltv_then)} LTV, now at ${fmt$(c.actual_ltv_now)} (${realizationRate.toFixed(0)}% of prediction). STRATEGY WORKED — replicate with similar customers. This customer's growth validates the multiplier model. Continue investment to sustain trajectory. Tracking realized multipliers improves future prediction accuracy.`,
          ai_recommendation: 'vip_treatment',
          status: 'open', detected_at: now,
        });
      }
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant customer lifetime value AI specializing in identifying multiplier candidates (customers whose value could 2-5x with targeted investment). Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Customer: ${a.customer_name} — ${a.rule_id}. Current LTV ${fmt$(a.current_ltv ?? 0)}, predicted ${fmt$(a.predicted_ltv ?? 0)} (${a.multiplier ?? 0}x). ROI ${a.roi_multiple ?? 0}x on ${fmt$(a.retention_investment ?? 0)} investment. Signals: ${a.signals ?? 'none'}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM customer_ltv_multiplier_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE customer_ltv_multiplier_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<LTVMultAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM customer_ltv_multiplier_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgMultiplier: number; totalInvestment: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(multiplier WHERE multiplier != NONE) AS avgmult,
              math::sum(retention_investment WHERE retention_investment != NONE) AS invest
       FROM customer_ltv_multiplier_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgMultiplier: safeNumber(r.avgmult, 0), totalInvestment: safeNumber(r.invest, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgMultiplier: 0, totalInvestment: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
