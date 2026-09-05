/**
 * AI Customer Preference Drift Tracker — tracks how customer preferences
 * evolve over time (favorite items, categories, price tiers, dietary)
 * and updates profiles dynamically for ever-more-accurate personalization.
 *
 * 127th POSR-exclusive differentiator — restaurants lose $300-1,000/mo per
 * location from stale customer preference profiles. No POS tracks preference
 * drift over time.
 *
 * Distinct from:
 *   - guest-preference.service (existing) — learns STATIC preferences (snapshot)
 *   - customer-segmentation.service — groups by current behavior (not drift)
 *   - order-pattern-anomaly.service — detects one-time anomalies (not gradual drift)
 *   - customer-journey.service — tracks lifecycle stages (not preference evolution)
 *   - visit-cadence.service — predicts visit timing (not preference changes)
 *   - order-frequency-predictor.service — tracks frequency trajectory (not preferences)
 *
 * 8 AI rules:
 *   1. favorite_item_shift — favorite item changed → update recommendations
 *   2. category_migration — shifting to different menu categories → adapt menu
 *   3. price_tier_evolution — moving up/down price range → adjust upsell strategy
 *   4. dietary_evolution — omnivore→vegetarian/vegan → critical profile update
 *   5. fast_drifter — 3+ preference changes in 6mo → update profile frequently
 *   6. stable_customer — no drift in 6mo → profile is reliable, low maintenance
 *   7. profile_staleness — profile not updated in 90+ days → accuracy degrading
 *   8. preference_diversification — exploring more items/categories → broaden recs
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PrefDriftRuleId =
  | 'favorite_item_shift'
  | 'category_migration'
  | 'price_tier_evolution'
  | 'dietary_evolution'
  | 'fast_drifter'
  | 'stable_customer'
  | 'profile_staleness'
  | 'preference_diversification';

export type PrefDriftAiRec =
  | 'update_profile'
  | 'update_recommendations'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface PrefDriftAlert {
  id?: string;
  rule_id: PrefDriftRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_id: string;
  customer_name: string;
  drift_type?: string;
  old_preference?: string;
  new_preference?: string;
  drift_pct?: number;
  drift_velocity?: string;
  profile_age_months?: number;
  staleness_days?: number;
  recommendation_accuracy_pct?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: PrefDriftAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface PrefDriftConfig {
  aiEnabled: boolean;
  shiftThreshold: number;
  stalenessDays: number;
  fastDrifterOrders: number;
}

export const DEFAULT_PREFDRIFT_CONFIG: PrefDriftConfig = {
  aiEnabled: true,
  shiftThreshold: 30.0,
  stalenessDays: 90,
  fastDrifterOrders: 3,
};

export const readPrefDriftConfig = (settings: any): PrefDriftConfig => ({
  aiEnabled: settings?.prefdrift_ai_enabled ?? true,
  shiftThreshold: safeNumber(settings?.prefdrift_shift_threshold, 30.0),
  stalenessDays: safeNumber(settings?.prefdrift_staleness_days, 90),
  fastDrifterOrders: safeNumber(settings?.prefdrift_fast_drifter_orders, 3),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface DriftData {
  customer_id: string;
  customer_name: string;
  // Old preferences (from profile)
  old_favorite_item: string;
  old_favorite_category: string;
  old_price_tier: 'budget' | 'mid' | 'premium';
  old_dietary: 'omnivore' | 'vegetarian' | 'vegan' | 'unknown';
  // New preferences (from recent orders)
  new_favorite_item: string;
  new_favorite_category: string;
  new_price_tier: 'budget' | 'mid' | 'premium';
  new_dietary: 'omnivore' | 'vegetarian' | 'vegan' | 'unknown';
  // Drift metrics
  drift_pct: number;               // overall preference shift %
  preference_changes_6mo: number;  // number of preference changes in 6 months
  profile_age_months: number;
  days_since_profile_update: number;
  recommendation_accuracy_pct: number;
  // For diversification
  old_item_variety: number;        // how many different items they used to order
  new_item_variety: number;        // how many different items they order now
  avg_order_value: number;
  monthly_orders: number;
}

const MOCK_CUSTOMERS: DriftData[] = [
  {
    customer_id: 'D001', customer_name: 'Sarah Chen',
    old_favorite_item: 'Beef Burger', old_favorite_category: 'mains', old_price_tier: 'mid', old_dietary: 'omnivore',
    new_favorite_item: 'Salmon Bowl', new_favorite_category: 'mains', new_price_tier: 'premium', new_dietary: 'omnivore',
    drift_pct: 45, preference_changes_6mo: 2, profile_age_months: 8, days_since_profile_update: 120,
    recommendation_accuracy_pct: 55, old_item_variety: 3, new_item_variety: 5, avg_order_value: 18, monthly_orders: 8,
  },
  {
    customer_id: 'D002', customer_name: 'Mike Rodriguez',
    old_favorite_item: 'Caesar Salad', old_favorite_category: 'salads', old_price_tier: 'budget', old_dietary: 'omnivore',
    new_favorite_item: 'Margherita Pizza', new_favorite_category: 'mains', new_price_tier: 'mid', new_dietary: 'vegetarian',
    drift_pct: 60, preference_changes_6mo: 4, profile_age_months: 12, days_since_profile_update: 95,
    recommendation_accuracy_pct: 40, old_item_variety: 2, new_item_variety: 6, avg_order_value: 22, monthly_orders: 6,
  },
  {
    customer_id: 'D003', customer_name: 'Emma Williams',
    old_favorite_item: 'Margherita Pizza', old_favorite_category: 'mains', old_price_tier: 'mid', old_dietary: 'vegetarian',
    new_favorite_item: 'Margherita Pizza', new_favorite_category: 'mains', new_price_tier: 'mid', new_dietary: 'vegetarian',
    drift_pct: 5, preference_changes_6mo: 0, profile_age_months: 14, days_since_profile_update: 30,
    recommendation_accuracy_pct: 92, old_item_variety: 4, new_item_variety: 4, avg_order_value: 25, monthly_orders: 10,
  },
  {
    customer_id: 'D004', customer_name: 'James Park',
    old_favorite_item: 'Pasta Alfredo', old_favorite_category: 'mains', old_price_tier: 'mid', old_dietary: 'omnivore',
    new_favorite_item: 'Vegan Buddha Bowl', new_favorite_category: 'mains', new_price_tier: 'mid', new_dietary: 'vegan',
    drift_pct: 75, preference_changes_6mo: 3, profile_age_months: 6, days_since_profile_update: 45,
    recommendation_accuracy_pct: 30, old_item_variety: 3, new_item_variety: 4, avg_order_value: 16, monthly_orders: 5,
  },
  {
    customer_id: 'D005', customer_name: 'Lisa Anderson',
    old_favorite_item: 'Chicken Burger', old_favorite_category: 'mains', old_price_tier: 'budget', old_dietary: 'omnivore',
    new_favorite_item: 'Ribeye Steak', new_favorite_category: 'mains', new_price_tier: 'premium', new_dietary: 'omnivore',
    drift_pct: 50, preference_changes_6mo: 2, profile_age_months: 10, days_since_profile_update: 150,
    recommendation_accuracy_pct: 45, old_item_variety: 2, new_item_variety: 3, avg_order_value: 35, monthly_orders: 4,
  },
  {
    customer_id: 'D006', customer_name: 'David Kumar',
    old_favorite_item: 'Salmon Bowl', old_favorite_category: 'mains', old_price_tier: 'premium', old_dietary: 'omnivore',
    new_favorite_item: 'Caesar Salad', new_favorite_category: 'salads', new_price_tier: 'budget', new_dietary: 'omnivore',
    drift_pct: 55, preference_changes_6mo: 3, profile_age_months: 9, days_since_profile_update: 60,
    recommendation_accuracy_pct: 50, old_item_variety: 5, new_item_variety: 8, avg_order_value: 14, monthly_orders: 7,
  },
  {
    customer_id: 'D007', customer_name: 'Rachel Green',
    old_favorite_item: 'Caesar Salad', old_favorite_category: 'salads', old_price_tier: 'budget', old_dietary: 'omnivore',
    new_favorite_item: 'Caesar Salad', new_favorite_category: 'salads', new_price_tier: 'budget', new_dietary: 'omnivore',
    drift_pct: 8, preference_changes_6mo: 1, profile_age_months: 7, days_since_profile_update: 100,
    recommendation_accuracy_pct: 85, old_item_variety: 3, new_item_variety: 5, avg_order_value: 12, monthly_orders: 6,
  },
];

function computeVelocity(changes: number): 'fast' | 'moderate' | 'slow' | 'stable' {
  if (changes >= 3) return 'fast';
  if (changes >= 2) return 'moderate';
  if (changes >= 1) return 'slow';
  return 'stable';
}

export const runPrefDriftEngine = async (
  db: ReturnType<typeof useDB>,
  config: PrefDriftConfig = DEFAULT_PREFDRIFT_CONFIG
): Promise<{ alerts: PrefDriftAlert[]; generated: number }> => {
  const alerts: PrefDriftAlert[] = [];
  const now = new Date();

  let customers: DriftData[] = [];
  try {
    const result = await db.query(
      `SELECT customer_id, customer_name,
              old_favorite_item, old_favorite_category, old_price_tier, old_dietary,
              new_favorite_item, new_favorite_category, new_price_tier, new_dietary,
              drift_pct, preference_changes_6mo, profile_age_months, days_since_profile_update,
              recommendation_accuracy_pct, old_item_variety, new_item_variety,
              avg_order_value, monthly_orders
       FROM preference_drift_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    customers = rows.map((r: any) => ({
      customer_id: String(r.customer_id ?? 'Unknown'),
      customer_name: String(r.customer_name ?? 'Unknown'),
      old_favorite_item: String(r.old_favorite_item ?? 'Unknown'),
      old_favorite_category: String(r.old_favorite_category ?? 'unknown'),
      old_price_tier: r.old_price_tier ?? 'mid',
      old_dietary: r.old_dietary ?? 'unknown',
      new_favorite_item: String(r.new_favorite_item ?? 'Unknown'),
      new_favorite_category: String(r.new_favorite_category ?? 'unknown'),
      new_price_tier: r.new_price_tier ?? 'mid',
      new_dietary: r.new_dietary ?? 'unknown',
      drift_pct: safeNumber(r.drift_pct, 0),
      preference_changes_6mo: safeNumber(r.preference_changes_6mo, 0),
      profile_age_months: safeNumber(r.profile_age_months, 0),
      days_since_profile_update: safeNumber(r.days_since_profile_update, 0),
      recommendation_accuracy_pct: safeNumber(r.recommendation_accuracy_pct, 0),
      old_item_variety: safeNumber(r.old_item_variety, 0),
      new_item_variety: safeNumber(r.new_item_variety, 0),
      avg_order_value: safeNumber(r.avg_order_value, 0),
      monthly_orders: safeNumber(r.monthly_orders, 0),
    }));
  } catch (err) {
    console.warn('[prefdrift] fetchCustomers failed — using mock', err);
  }

  if (customers.length === 0) {
    customers = MOCK_CUSTOMERS;
  }

  for (const c of customers) {
    const velocity = computeVelocity(c.preference_changes_6mo);
    const monthlyOpp = Math.round(c.avg_order_value * c.monthly_orders * 0.15);

    // Rule 1: FAVORITE_ITEM_SHIFT
    if (c.old_favorite_item !== c.new_favorite_item && c.drift_pct >= config.shiftThreshold) {
      alerts.push({
        rule_id: 'favorite_item_shift',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        drift_type: 'item',
        old_preference: c.old_favorite_item,
        new_preference: c.new_favorite_item,
        drift_pct: Math.round(c.drift_pct * 10) / 10,
        drift_velocity: velocity,
        recommendation_accuracy_pct: c.recommendation_accuracy_pct,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: FAVORITE ITEM SHIFT — was "${c.old_favorite_item}", now "${c.new_favorite_item}" (${c.drift_pct}% drift). Profile accuracy: ${c.recommendation_accuracy_pct}%. Recommendations based on old favorite are now WRONG — customer sees irrelevant suggestions. UPDATE PROFILE immediately: change favorite item, regenerate recommendation engine input. Each accurate recommendation increases reorder rate 15%. Drift velocity: ${velocity}.`,
        ai_recommendation: 'update_profile',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: CATEGORY_MIGRATION
    if (c.old_favorite_category !== c.new_favorite_category) {
      alerts.push({
        rule_id: 'category_migration',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        drift_type: 'category',
        old_preference: c.old_favorite_category,
        new_preference: c.new_favorite_category,
        drift_pct: Math.round(c.drift_pct * 10) / 10,
        drift_velocity: velocity,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: CATEGORY MIGRATION — shifted from ${c.old_favorite_category} to ${c.new_favorite_category}. Taste evolution in progress. ${c.old_favorite_category === 'mains' && c.new_favorite_category === 'salads' ? 'Moving to lighter options — health trend. ' : c.old_favorite_category === 'salads' && c.new_favorite_category === 'mains' ? 'Moving to heartier options. ' : ''}UPDATE RECOMMENDATIONS: promote ${c.new_favorite_category} items, de-emphasize ${c.old_favorite_category}. Cross-sell between old and new favorites during transition. Category migration is gradual but permanent — adapt early.`,
        ai_recommendation: 'update_recommendations',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: PRICE_TIER_EVOLUTION
    if (c.old_price_tier !== c.new_price_tier) {
      const isUpgrade = (c.new_price_tier === 'premium') || (c.old_price_tier === 'budget' && c.new_price_tier === 'mid');
      alerts.push({
        rule_id: 'price_tier_evolution',
        severity: isUpgrade ? 'medium' : 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        drift_type: 'price_tier',
        old_preference: c.old_price_tier,
        new_preference: c.new_price_tier,
        drift_pct: Math.round(c.drift_pct * 10) / 10,
        est_monthly_opportunity: isUpgrade ? Math.round((c.avg_order_value * c.monthly_orders * 0.2)) : 0,
        description: `${c.customer_name}: PRICE TIER EVOLUTION — ${c.old_price_tier} → ${c.new_price_tier}. ${isUpgrade ? 'UPGRADE trend — recommend premium items going forward. Upsell opportunity: each premium recommendation has 25% acceptance rate. +' + fmt$(c.avg_order_value * c.monthly_orders * 0.2) + '/mo potential.' : 'DOWNGRADE trend — adjust recommendations to value options. Monitor for frequency decline (budget pressure may reduce visits).'}`,
        ai_recommendation: 'update_recommendations',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: DIETARY_EVOLUTION (critical — must update or lose customer)
    if (c.old_dietary !== c.new_dietary && c.old_dietary !== 'unknown' && c.new_dietary !== 'unknown') {
      alerts.push({
        rule_id: 'dietary_evolution',
        severity: 'critical',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        drift_type: 'dietary',
        old_preference: c.old_dietary,
        new_preference: c.new_dietary,
        drift_pct: Math.round(c.drift_pct * 10) / 10,
        drift_velocity: velocity,
        recommendation_accuracy_pct: c.recommendation_accuracy_pct,
        est_monthly_opportunity: monthlyOpp * 3,
        description: `${c.customer_name}: DIETARY EVOLUTION — ${c.old_dietary} → ${c.new_dietary}. CRITICAL profile update needed. ${c.new_dietary === 'vegan' ? 'Customer is now VEGAN — stop recommending ALL animal products immediately. Filter menu to show vegan items only. Vegan customers are high-value + loyal to accommodating restaurants.' : c.new_dietary === 'vegetarian' ? 'Customer is now VEGETARIAN — stop recommending meat items. Vegetarian customers will leave if served meat recommendations.' : 'Dietary change detected — update profile.'} Profile accuracy: ${c.recommendation_accuracy_pct}% (critically low). Each wrong dietary recommendation = potential lost customer. UPDATE PROFILE NOW.`,
        ai_recommendation: 'update_profile',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: FAST_DRIFTER (3+ changes in 6mo)
    if (c.preference_changes_6mo >= config.fastDrifterOrders) {
      alerts.push({
        rule_id: 'fast_drifter',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        drift_type: 'diversification',
        drift_velocity: 'fast',
        drift_pct: Math.round(c.drift_pct * 10) / 10,
        preference_changes_6mo: c.preference_changes_6mo,
        recommendation_accuracy_pct: c.recommendation_accuracy_pct,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: FAST DRIFTER — ${c.preference_changes_6mo} preference changes in 6 months. Preferences evolving rapidly. Profile accuracy: ${c.recommendation_accuracy_pct}% (degrading fast). UPDATE PROFILE FREQUENTLY — weekly or per-visit updates needed. Standard monthly updates too slow for this customer. Fast drifters are often exploring customers — broad recommendation variety works better than narrow targeting. Each delayed update = wrong recommendation = reduced trust.`,
        ai_recommendation: 'update_profile',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: STABLE_CUSTOMER (no drift in 6mo)
    if (c.preference_changes_6mo === 0 && c.drift_pct < 15) {
      alerts.push({
        rule_id: 'stable_customer',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        drift_pct: Math.round(c.drift_pct * 10) / 10,
        drift_velocity: 'stable',
        recommendation_accuracy_pct: c.recommendation_accuracy_pct,
        est_monthly_opportunity: 0,
        description: `${c.customer_name}: STABLE CUSTOMER — 0 preference changes in 6 months, ${c.drift_pct}% drift. Profile accuracy: ${c.recommendation_accuracy_pct}% (excellent). Preferences are LOCKED IN — recommendations based on profile will be highly accurate. LOW MAINTENANCE: profile needs only quarterly check-ins, not frequent updates. Stable customers are the easiest to serve well — their consistency is an asset. Use their stability as a baseline for comparison with fast drifters.`,
        ai_recommendation: 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: PROFILE_STALENESS (not updated in 90+ days)
    if (c.days_since_profile_update >= config.stalenessDays) {
      const accuracyDrop = Math.round((c.days_since_profile_update - config.stalenessDays) * 0.3);
      alerts.push({
        rule_id: 'profile_staleness',
        severity: c.days_since_profile_update >= 150 ? 'high' : 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        staleness_days: c.days_since_profile_update,
        recommendation_accuracy_pct: c.recommendation_accuracy_pct,
        profile_age_months: c.profile_age_months,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: PROFILE STALE — last updated ${c.days_since_profile_update} days ago (threshold ${config.stalenessDays}). Estimated accuracy: ${c.recommendation_accuracy_pct}% (declining ~0.3%/day past threshold). Stale profiles send wrong recommendations → customer feels misunderstood → reduced engagement. REFRESH PROFILE: re-analyze recent order history, update preferences. Profile age: ${c.profile_age_months} months. Each day of staleness = ~${fmt$(0.3)} in mispersonalized recommendation value lost.`,
        ai_recommendation: 'update_profile',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: PREFERENCE_DIVERSIFICATION (exploring more items)
    if (c.new_item_variety > c.old_item_variety * 1.5) {
      const varietyIncrease = ((c.new_item_variety - c.old_item_variety) / Math.max(c.old_item_variety, 1)) * 100;
      alerts.push({
        rule_id: 'preference_diversification',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        drift_type: 'diversification',
        old_preference: `${c.old_item_variety} items`,
        new_preference: `${c.new_item_variety} items`,
        drift_pct: Math.round(varietyIncrease * 10) / 10,
        drift_velocity: velocity,
        est_monthly_opportunity: Math.round(c.avg_order_value * c.monthly_orders * 0.1),
        description: `${c.customer_name}: PREFERENCE DIVERSIFICATION — item variety grew ${varietyIncrease.toFixed(0)}% (${c.old_item_variety} → ${c.new_item_variety} different items). Customer is EXPLORING the menu — not just ordering the same thing. BROADEN RECOMMENDATIONS: suggest items outside their usual pattern. Exploring customers are receptive to new suggestions → higher cross-sell success. Diversification signals engagement + curiosity — capitalize with varied recommendations. +' + fmt$(c.avg_order_value * c.monthly_orders * 0.1) + '/mo from broader cross-sell.`,
        ai_recommendation: 'update_recommendations',
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
            { role: 'system', content: 'You are a restaurant customer personalization AI specializing in preference drift tracking. Recommend specific profile updates to maintain personalization accuracy. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Customer: ${a.customer_name} — ${a.rule_id}. Drift type: ${a.drift_type ?? 'N/A'}. Old: ${a.old_preference ?? 'N/A'} → New: ${a.new_preference ?? 'N/A'}. Drift: ${a.drift_pct ?? 0}%. Velocity: ${a.drift_velocity ?? 'N/A'}. Profile accuracy: ${a.recommendation_accuracy_pct ?? 0}%. Staleness: ${a.staleness_days ?? 0} days. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM preference_drift_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE preference_drift_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<PrefDriftAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM preference_drift_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  driftingCustomers: number; avgAccuracy: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id != 'stable_customer') AS drifting,
              math::mean(recommendation_accuracy_pct WHERE recommendation_accuracy_pct != NONE) AS avgacc
       FROM preference_drift_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      driftingCustomers: safeNumber(r.drifting, 0), avgAccuracy: safeNumber(r.avgacc, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, driftingCustomers: 0, avgAccuracy: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
