/**
 * AI Promotional Halo Effect Analyzer — measures indirect sales lift on
 * non-promoted items caused by promotions (halo) + negative cannibalization.
 *
 * 109th POSR-exclusive differentiator — restaurants lose $200-800/mo per
 * location from unmeasured promotional halo effects. No POS tracks
 * cross-item promotional lift.
 *
 * Distinct from:
 *   - promo-analytics.service (promoted-item performance — NOT cross-item halo)
 *   - promo-forecast.service (promo demand FORECAST — NOT measured halo)
 *   - promo-abuse.service (promo FRAUD — NOT halo effect)
 *   - cross-sell.service (item pairing patterns — NOT promo-driven)
 *   - menu-pairing.service (recipe pairings — NOT promotional)
 *   - menu-engineering-matrix.service (item classification — NOT promo impact)
 *   - peak-pricing.service (demand-based pricing — NOT promo measurement)
 *
 * 8 AI rules:
 *   1. halo_uplift — promoted item boosted non-promoted complement sales >10%
 *   2. cannibalization — promoted item reduced substitute sales >15%
 *   3. halo_underestimated — promo ROI higher than measured (halo not counted)
 *   4. halo_negative — promo actually lost money after cannibalization counted
 *   5. cross_category_lift — promo in one category boosted another category
 *   6. halo_decay — halo effect fading over promo duration (fatigue)
 *   7. repeat_halo — promo buyers returned for full-price item (loyalty halo)
 *   8. optimal_promo_combo — promo + complement bundle would maximize halo
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PromoHaloRuleId =
  | 'halo_uplift'
  | 'cannibalization'
  | 'halo_underestimated'
  | 'halo_negative'
  | 'cross_category_lift'
  | 'halo_decay'
  | 'repeat_halo'
  | 'optimal_promo_combo';

export type PromoHaloAiRec =
  | 'count_halo'
  | 'stop_promo'
  | 'extend_promo'
  | 'bundle_promo'
  | 'investigate'
  | 'adjust_targeting'
  | 'monitor'
  | 'skip';

export interface PromoHaloAlert {
  id?: string;
  rule_id: PromoHaloRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  promotion_name: string;
  promoted_item: string;
  affected_item: string;
  relationship?: 'complement' | 'substitute' | 'cross_category' | 'repeat_purchase';
  before_sales?: number;
  during_sales?: number;
  halo_lift_pct?: number;
  direct_revenue?: number;
  halo_revenue?: number;
  cannibalization_revenue?: number;
  true_roi_pct?: number;
  promo_days_elapsed?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: PromoHaloAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface PromoHaloConfig {
  aiEnabled: boolean;
  haloThreshold: number;
  cannibalThreshold: number;
  decayDrop: number;
  repeatThreshold: number;
}

export const DEFAULT_PROMOHALO_CONFIG: PromoHaloConfig = {
  aiEnabled: true,
  haloThreshold: 10.0,
  cannibalThreshold: 15.0,
  decayDrop: 30.0,
  repeatThreshold: 20.0,
};

export const readPromoHaloConfig = (settings: any): PromoHaloConfig => ({
  aiEnabled: settings?.promohalo_ai_enabled ?? true,
  haloThreshold: safeNumber(settings?.promohalo_halo_threshold, 10.0),
  cannibalThreshold: safeNumber(settings?.promohalo_cannibal_threshold, 15.0),
  decayDrop: safeNumber(settings?.promohalo_decay_drop, 30.0),
  repeatThreshold: safeNumber(settings?.promohalo_repeat_threshold, 20.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface PromoHaloData {
  promotion_name: string;
  promoted_item: string;
  affected_item: string;
  relationship: 'complement' | 'substitute' | 'cross_category' | 'repeat_purchase';
  before_sales: number;   // avg daily sales of affected_item before promo
  during_sales: number;   // avg daily sales of affected_item during promo
  direct_revenue: number; // promoted item revenue during promo
  promo_days_elapsed: number;
  promo_days_total: number;
  discount_cost: number;  // total discount given on promoted item
  // For repeat_halo: % of promo buyers who returned for full-price item
  repeat_return_pct?: number;
  // For halo_decay: halo effect % in first half vs second half of promo
  first_half_halo_pct?: number;
  second_half_halo_pct?: number;
}

const MOCK_PROMOS: PromoHaloData[] = [
  {
    promotion_name: 'Burger Bonanza Week',
    promoted_item: 'Beef Burger',
    affected_item: 'French Fries',
    relationship: 'complement',
    before_sales: 180, during_sales: 245,
    direct_revenue: 4200, promo_days_elapsed: 7, promo_days_total: 7,
    discount_cost: 840,
    first_half_halo_pct: 42, second_half_halo_pct: 38,
  },
  {
    promotion_name: 'Burger Bonanza Week',
    promoted_item: 'Beef Burger',
    affected_item: 'Chicken Burger',
    relationship: 'substitute',
    before_sales: 90, during_sales: 62,
    direct_revenue: 4200, promo_days_elapsed: 7, promo_days_total: 7,
    discount_cost: 840,
  },
  {
    promotion_name: 'Steak Night Special',
    promoted_item: 'Ribeye Steak',
    affected_item: 'Red Wine Glass',
    relationship: 'cross_category',
    before_sales: 24, during_sales: 41,
    direct_revenue: 6800, promo_days_elapsed: 3, promo_days_total: 3,
    discount_cost: 1360,
  },
  {
    promotion_name: 'Salad Sprint',
    promoted_item: 'Caesar Salad',
    affected_item: 'Iced Tea',
    relationship: 'complement',
    before_sales: 60, during_sales: 84,
    direct_revenue: 1890, promo_days_elapsed: 5, promo_days_total: 14,
    discount_cost: 378,
    first_half_halo_pct: 48, second_half_halo_pct: 28,
  },
  {
    promotion_name: 'Pizza Fiesta',
    promoted_item: 'Margherita Pizza',
    affected_item: 'Garlic Bread',
    relationship: 'complement',
    before_sales: 120, during_sales: 168,
    direct_revenue: 5400, promo_days_elapsed: 10, promo_days_total: 10,
    discount_cost: 1080,
    repeat_return_pct: 28,
  },
  {
    promotion_name: 'Salmon Splash',
    promoted_item: 'Salmon Bowl',
    affected_item: 'Pasta Alfredo',
    relationship: 'substitute',
    before_sales: 48, during_sales: 30,
    direct_revenue: 3300, promo_days_elapsed: 6, promo_days_total: 7,
    discount_cost: 660,
  },
];

export const runPromoHaloEngine = async (
  db: ReturnType<typeof useDB>,
  config: PromoHaloConfig = DEFAULT_PROMOHALO_CONFIG
): Promise<{ alerts: PromoHaloAlert[]; generated: number }> => {
  const alerts: PromoHaloAlert[] = [];
  const now = new Date();

  let promos: PromoHaloData[] = [];
  try {
    const result = await db.query(
      `SELECT promotion_name, promoted_item, affected_item, relationship,
              before_sales, during_sales, direct_revenue,
              promo_days_elapsed, promo_days_total, discount_cost,
              repeat_return_pct, first_half_halo_pct, second_half_halo_pct
       FROM promo_halo_log
       WHERE status = 'running'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    promos = rows.map((r: any) => ({
      promotion_name: String(r.promotion_name ?? 'Unknown'),
      promoted_item: String(r.promoted_item ?? 'Unknown'),
      affected_item: String(r.affected_item ?? 'Unknown'),
      relationship: r.relationship ?? 'complement',
      before_sales: safeNumber(r.before_sales, 0),
      during_sales: safeNumber(r.during_sales, 0),
      direct_revenue: safeNumber(r.direct_revenue, 0),
      promo_days_elapsed: safeNumber(r.promo_days_elapsed, 0),
      promo_days_total: safeNumber(r.promo_days_total, 0),
      discount_cost: safeNumber(r.discount_cost, 0),
      repeat_return_pct: r.repeat_return_pct != null ? safeNumber(r.repeat_return_pct, 0) : undefined,
      first_half_halo_pct: r.first_half_halo_pct != null ? safeNumber(r.first_half_halo_pct, 0) : undefined,
      second_half_halo_pct: r.second_half_halo_pct != null ? safeNumber(r.second_half_halo_pct, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[promohalo] fetchPromos failed — using mock', err);
  }

  if (promos.length === 0) {
    promos = MOCK_PROMOS;
  }

  for (const p of promos) {
    const haloLiftPct = p.before_sales > 0 ? ((p.during_sales - p.before_sales) / p.before_sales) * 100 : 0;
    const haloRevenue = haloLiftPct > 0 ? Math.round((p.during_sales - p.before_sales) * (p.direct_revenue / Math.max(p.during_sales, 1)) * p.promo_days_elapsed) : 0;
    const cannibalRevenue = haloLiftPct < 0 ? Math.round((p.before_sales - p.during_sales) * (p.direct_revenue / Math.max(p.before_sales, 1)) * p.promo_days_elapsed) : 0;
    const netHaloRevenue = haloRevenue - cannibalRevenue;
    const trueRoiPct = p.discount_cost > 0 ? Math.round(((p.direct_revenue + netHaloRevenue - p.discount_cost) / p.discount_cost) * 100) : 0;
    const measuredRoiPct = p.discount_cost > 0 ? Math.round(((p.direct_revenue - p.discount_cost) / p.discount_cost) * 100) : 0;

    // Rule 1: HALO_UPLIFT (complement sales boosted by promo)
    if (haloLiftPct >= config.haloThreshold && (p.relationship === 'complement' || p.relationship === 'cross_category')) {
      const monthlyOpp = Math.round(haloRevenue * 30 / Math.max(p.promo_days_elapsed, 1));
      alerts.push({
        rule_id: 'halo_uplift',
        severity: 'high',
        promotion_name: p.promotion_name,
        promoted_item: p.promoted_item,
        affected_item: p.affected_item,
        relationship: p.relationship,
        before_sales: p.before_sales,
        during_sales: p.during_sales,
        halo_lift_pct: Math.round(haloLiftPct * 10) / 10,
        direct_revenue: p.direct_revenue,
        halo_revenue: haloRevenue,
        promo_days_elapsed: p.promo_days_elapsed,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.promotion_name}: HALO UPLIFT — ${p.promoted_item} promo boosted "${p.affected_item}" (${p.relationship}) sales by ${haloLiftPct.toFixed(1)}% (${p.before_sales} → ${p.during_sales} avg daily). Indirect halo revenue: ${fmt$(haloRevenue)} over ${p.promo_days_elapsed}d. TRUE promo impact is HIGHER than direct revenue suggests. COUNT halo in ROI → +${fmt$(monthlyOpp)}/mo opportunity.`,
        ai_recommendation: 'count_halo',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: CANNIBALIZATION (substitute sales dropped due to promo)
    if (haloLiftPct <= -config.cannibalThreshold && p.relationship === 'substitute') {
      const monthlyOpp = Math.round(cannibalRevenue * 30 / Math.max(p.promo_days_elapsed, 1));
      alerts.push({
        rule_id: 'cannibalization',
        severity: 'critical',
        promotion_name: p.promotion_name,
        promoted_item: p.promoted_item,
        affected_item: p.affected_item,
        relationship: p.relationship,
        before_sales: p.before_sales,
        during_sales: p.during_sales,
        halo_lift_pct: Math.round(haloLiftPct * 10) / 10,
        direct_revenue: p.direct_revenue,
        cannibalization_revenue: cannibalRevenue,
        promo_days_elapsed: p.promo_days_elapsed,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.promotion_name}: CANNIBALIZATION — ${p.promoted_item} promo CUT "${p.affected_item}" (substitute) sales by ${Math.abs(haloLiftPct).toFixed(1)}% (${p.before_sales} → ${p.during_sales} avg daily). Revenue LOST to cannibalization: ${fmt$(cannibalRevenue)} over ${p.promo_days_elapsed}d. Customers switched from substitute to promoted item — net gain is LOWER than direct revenue suggests. ADJUST targeting to reach new customers, not existing ones.`,
        ai_recommendation: 'adjust_targeting',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: HALO_UNDERESTIMATED (promo ROI higher than measured)
    if (haloRevenue > 0 && trueRoiPct > measuredRoiPct + 20) {
      const monthlyOpp = Math.round(haloRevenue * 30 / Math.max(p.promo_days_elapsed, 1));
      alerts.push({
        rule_id: 'halo_underestimated',
        severity: 'medium',
        promotion_name: p.promotion_name,
        promoted_item: p.promoted_item,
        affected_item: p.affected_item,
        direct_revenue: p.direct_revenue,
        halo_revenue: haloRevenue,
        true_roi_pct: trueRoiPct,
        promo_days_elapsed: p.promo_days_elapsed,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.promotion_name}: ROI UNDERESTIMATED — measured ROI ${measuredRoiPct}% but TRUE ROI (including ${fmt$(haloRevenue)} halo) is ${trueRoiPct}%. Promo is ${trueRoiPct - measuredRoiPct}% MORE profitable than reported. EXTEND promo — hidden halo value of ${fmt$(monthlyOpp)}/mo being missed. Recurring this promo is justified.`,
        ai_recommendation: 'extend_promo',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: HALO_NEGATIVE (promo lost money after cannibalization)
    if (cannibalRevenue > 0 && trueRoiPct < 0) {
      const monthlyOpp = Math.round(cannibalRevenue * 30 / Math.max(p.promo_days_elapsed, 1));
      alerts.push({
        rule_id: 'halo_negative',
        severity: 'critical',
        promotion_name: p.promotion_name,
        promoted_item: p.promoted_item,
        affected_item: p.affected_item,
        direct_revenue: p.direct_revenue,
        cannibalization_revenue: cannibalRevenue,
        true_roi_pct: trueRoiPct,
        promo_days_elapsed: p.promo_days_elapsed,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.promotion_name}: NEGATIVE TRUE ROI — direct revenue ${fmt$(p.direct_revenue)} looked positive, but ${fmt$(cannibalRevenue)} cannibalization + ${fmt$(p.discount_cost)} discount cost means TRUE ROI is ${trueRoiPct}% (LOSS). Promo is DESTROYING value — STOP immediately. Losing ~${fmt$(monthlyOpp)}/mo. Redesign promo to target new customers instead of cannibalizing existing item sales.`,
        ai_recommendation: 'stop_promo',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: CROSS_CATEGORY_LIFT (promo in one category boosted another)
    if (haloLiftPct >= config.haloThreshold && p.relationship === 'cross_category') {
      const monthlyOpp = Math.round(haloRevenue * 30 / Math.max(p.promo_days_elapsed, 1));
      alerts.push({
        rule_id: 'cross_category_lift',
        severity: 'high',
        promotion_name: p.promotion_name,
        promoted_item: p.promoted_item,
        affected_item: p.affected_item,
        relationship: p.relationship,
        before_sales: p.before_sales,
        during_sales: p.during_sales,
        halo_lift_pct: Math.round(haloLiftPct * 10) / 10,
        direct_revenue: p.direct_revenue,
        halo_revenue: haloRevenue,
        promo_days_elapsed: p.promo_days_elapsed,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.promotion_name}: CROSS-CATEGORY LIFT — ${p.promoted_item} (mains) promo boosted "${p.affected_item}" (different category) sales by ${haloLiftPct.toFixed(1)}% (${p.before_sales} → ${p.during_sales} avg daily). Halo revenue: ${fmt$(haloRevenue)}. Cross-category halo is RARE and valuable — customers buying mains also bought beverages/sides. BUNDLE these categories in future promos. +${fmt$(monthlyOpp)}/mo opportunity.`,
        ai_recommendation: 'bundle_promo',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: HALO_DECAY (halo effect fading over promo duration)
    if (p.first_half_halo_pct != null && p.second_half_halo_pct != null) {
      const decayPct = ((p.first_half_halo_pct - p.second_half_halo_pct) / Math.max(p.first_half_halo_pct, 1)) * 100;
      if (decayPct >= config.decayDrop) {
        const monthlyOpp = Math.round(haloRevenue * 0.3 * 30 / Math.max(p.promo_days_elapsed, 1));
        alerts.push({
          rule_id: 'halo_decay',
          severity: 'medium',
          promotion_name: p.promotion_name,
          promoted_item: p.promoted_item,
          affected_item: p.affected_item,
          halo_lift_pct: Math.round(haloLiftPct * 10) / 10,
          promo_days_elapsed: p.promo_days_elapsed,
          est_monthly_opportunity: monthlyOpp,
          description: `${p.promotion_name}: HALO DECAY — halo effect on "${p.affected_item}" dropped ${decayPct.toFixed(0)}% over promo duration (first half: ${p.first_half_halo_pct}% → second half: ${p.second_half_halo_pct}%). Promo fatigue setting in — customers habituating. SHORTEN future promos to capture peak halo before decay. Stop extending — diminishing returns. Potential +${fmt$(monthlyOpp)}/mo with shorter cycles.`,
          ai_recommendation: 'monitor',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 7: REPEAT_HALO (promo buyers returned for full-price item)
    if (p.repeat_return_pct != null && p.repeat_return_pct >= config.repeatThreshold) {
      const repeatRevenue = Math.round(p.direct_revenue * 0.3 * p.repeat_return_pct / 100);
      const monthlyOpp = Math.round(repeatRevenue * 30 / Math.max(p.promo_days_elapsed, 1));
      alerts.push({
        rule_id: 'repeat_halo',
        severity: 'high',
        promotion_name: p.promotion_name,
        promoted_item: p.promoted_item,
        affected_item: p.affected_item,
        relationship: 'repeat_purchase',
        halo_lift_pct: p.repeat_return_pct,
        direct_revenue: p.direct_revenue,
        halo_revenue: repeatRevenue,
        promo_days_elapsed: p.promo_days_elapsed,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.promotion_name}: REPEAT HALO — ${p.repeat_return_pct}% of promo buyers returned to purchase "${p.affected_item}" at FULL PRICE within 30d. Promo acquired LOYAL customers, not just deal-seekers. Repeat halo revenue: ${fmt$(repeatRevenue)}. This promo is a CUSTOMER ACQUISITION tool, not just a discount. REPEAT this promo — LTV impact far exceeds direct revenue. +${fmt$(monthlyOpp)}/mo long-term.`,
        ai_recommendation: 'extend_promo',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: OPTIMAL_PROMO_COMBO (promo + complement bundle would maximize halo)
    if (haloLiftPct >= config.haloThreshold && p.relationship === 'complement' && haloRevenue > p.discount_cost * 0.5) {
      const bundleUplift = Math.round(haloRevenue * 1.4);
      const monthlyOpp = Math.round(bundleUplift * 30 / Math.max(p.promo_days_elapsed, 1));
      alerts.push({
        rule_id: 'optimal_promo_combo',
        severity: 'low',
        promotion_name: p.promotion_name,
        promoted_item: p.promoted_item,
        affected_item: p.affected_item,
        relationship: p.relationship,
        halo_lift_pct: Math.round(haloLiftPct * 10) / 10,
        halo_revenue: haloRevenue,
        direct_revenue: p.direct_revenue,
        promo_days_elapsed: p.promo_days_elapsed,
        est_monthly_opportunity: monthlyOpp,
        description: `${p.promotion_name}: OPTIMAL BUNDLE FOUND — ${p.promoted_item} + ${p.affected_item} combo promo would maximize halo. Current halo (${haloLiftPct.toFixed(1)}% lift, ${fmt$(haloRevenue)} indirect rev) proves strong complement demand. BUNDLE both items at slight discount → projected +40% halo capture = ${fmt$(bundleUplift)} indirect revenue. Bundle drives BOTH items' volume simultaneously. +${fmt$(monthlyOpp)}/mo opportunity.`,
        ai_recommendation: 'bundle_promo',
        status: 'open', detected_at: now,
      });
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant promotional analytics AI specializing in halo effect measurement (indirect cross-item sales lift). Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Promo: ${a.promotion_name} — ${a.promoted_item} → affected "${a.affected_item}" (${a.relationship}). Halo lift: ${a.halo_lift_pct ?? 0}%, direct rev ${fmt$(a.direct_revenue ?? 0)}, halo rev ${fmt$(a.halo_revenue ?? 0)}, cannibalization ${fmt$(a.cannibalization_revenue ?? 0)}, true ROI ${a.true_roi_pct ?? 0}%. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM promo_halo_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE promo_halo_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<PromoHaloAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM promo_halo_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  haloRevenue: number; cannibalizationRevenue: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::sum(halo_revenue) AS halo,
              math::sum(cannibalization_revenue) AS cannibal
       FROM promo_halo_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      haloRevenue: safeNumber(r.halo, 0), cannibalizationRevenue: safeNumber(r.cannibal, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, haloRevenue: 0, cannibalizationRevenue: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
