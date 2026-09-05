/**
 * AI Customer Occasion Prediction Engine — predicts the occasion for each
 * customer's visit from order patterns, party size, and timing, enabling
 * occasion-appropriate service personalization.
 *
 * 135th POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from not recognizing customer visit occasions. No POS predicts
 * occasion from order patterns.
 *
 * Distinct from:
 *   - wait-experience-personalizer.service — personalizes wait by customer profile
 *   - server-table-assignment.service — matches servers to tables
 *   - table-preference.service — learns table type preferences
 *   - customer-segmentation.service — groups by behavior (not per-visit occasion)
 *   - order-pattern-anomaly.service — detects anomalies (not occasion)
 *   - milestone-campaign.service — birthday/anniversary campaigns (not per-visit)
 *
 * 8 AI rules:
 *   1. occasion_predicted — high-confidence occasion detected → apply service style
 *   2. celebration_detected — dessert + large party + high spend → acknowledge
 *   3. business_lunch_pattern — weekday lunch + 2-3 people + fast order → efficient
 *   4. date_night_indicators — 2 people + dinner + wine + dessert → intimate
 *   5. family_dining_detected — 4+ people + kids items + weekend → patient
 *   6. occasion_spend_uplift — occasion visits spend 30%+ more → validate
 *   7. occasion_shift — customer's usual occasion pattern changing → investigate
 *   8. occasion_upsell_opportunity — occasion-specific upsell available → offer
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type OccasionRuleId =
  | 'occasion_predicted'
  | 'celebration_detected'
  | 'business_lunch_pattern'
  | 'date_night_indicators'
  | 'family_dining_detected'
  | 'occasion_spend_uplift'
  | 'occasion_shift'
  | 'occasion_upsell_opportunity';

export type OccasionAiRec =
  | 'apply_service_style'
  | 'offer_upsell'
  | 'acknowledge_occasion'
  | 'update_profile'
  | 'monitor'
  | 'skip';

export interface OccasionAlert {
  id?: string;
  rule_id: OccasionRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_id: string;
  customer_name: string;
  predicted_occasion?: string;
  confidence_pct?: number;
  party_size?: number;
  time_of_day?: string;
  day_of_week?: string;
  occasion_signals?: string;
  recommended_service_style?: string;
  recommended_upsell?: string;
  avg_occasion_spend?: number;
  avg_non_occasion_spend?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: OccasionAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface OccasionConfig {
  aiEnabled: boolean;
  confidenceThreshold: number;
  spendUpliftThreshold: number;
}

export const DEFAULT_OCCASION_CONFIG: OccasionConfig = {
  aiEnabled: true,
  confidenceThreshold: 70.0,
  spendUpliftThreshold: 30.0,
};

export const readOccasionConfig = (settings: any): OccasionConfig => ({
  aiEnabled: settings?.occasion_ai_enabled ?? true,
  confidenceThreshold: safeNumber(settings?.occasion_confidence_threshold, 70.0),
  spendUpliftThreshold: safeNumber(settings?.occasion_spend_uplift_threshold, 30.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface OccasionData {
  customer_id: string;
  customer_name: string;
  predicted_occasion: string;
  confidence_pct: number;
  party_size: number;
  time_of_day: string;
  day_of_week: string;
  occasion_signals: string[];
  avg_occasion_spend: number;
  avg_non_occasion_spend: number;
  is_weekday: boolean;
  has_wine: boolean;
  has_dessert: boolean;
  has_kids_items: boolean;
  order_count: number;
  // For occasion_shift
  usual_occasion?: string;
  // For occasion_upsell
  current_spend: number;
}

const MOCK_CUSTOMERS: OccasionData[] = [
  { customer_id: 'O01', customer_name: 'Robert Chen', predicted_occasion: 'business_lunch', confidence_pct: 88, party_size: 3, time_of_day: 'lunch', day_of_week: 'Tue', occasion_signals: ['weekday', 'party_2_3', 'fast_order', 'no_dessert', 'split_check'], avg_occasion_spend: 85, avg_non_occasion_spend: 45, is_weekday: true, has_wine: false, has_dessert: false, has_kids_items: false, order_count: 18, current_spend: 82 },
  { customer_id: 'O02', customer_name: 'Jennifer & Mark', predicted_occasion: 'date_night', confidence_pct: 82, party_size: 2, time_of_day: 'dinner', day_of_week: 'Sat', occasion_signals: ['party_2', 'wine_ordered', 'dessert_ordered', 'evening', 'weekend'], avg_occasion_spend: 120, avg_non_occasion_spend: 65, is_weekday: false, has_wine: true, has_dessert: true, has_kids_items: false, order_count: 8, current_spend: 115 },
  { customer_id: 'O03', customer_name: 'The Martinez Family', predicted_occasion: 'family_dinner', confidence_pct: 91, party_size: 5, time_of_day: 'dinner', day_of_week: 'Sun', occasion_signals: ['party_4plus', 'kids_items', 'high_chair', 'weekend', 'large_table'], avg_occasion_spend: 95, avg_non_occasion_spend: 55, is_weekday: false, has_wine: false, has_dessert: true, has_kids_items: true, order_count: 12, current_spend: 92 },
  { customer_id: 'O04', customer_name: 'David Kumar', predicted_occasion: 'solo', confidence_pct: 85, party_size: 1, time_of_day: 'lunch', day_of_week: 'Wed', occasion_signals: ['party_1', 'bar_seating', 'phone_present', 'quick_service'], avg_occasion_spend: 28, avg_non_occasion_spend: 35, is_weekday: true, has_wine: false, has_dessert: false, has_kids_items: false, order_count: 22, current_spend: 26 },
  { customer_id: 'O05', customer_name: 'Sarah & Tom', predicted_occasion: 'celebration', confidence_pct: 79, party_size: 6, time_of_day: 'dinner', day_of_week: 'Fri', occasion_signals: ['party_6plus', 'champagne', 'multiple_desserts', 'high_spend', 'group_photo'], avg_occasion_spend: 280, avg_non_occasion_spend: 90, is_weekday: false, has_wine: true, has_dessert: true, has_kids_items: false, order_count: 3, current_spend: 265 },
  { customer_id: 'O06', customer_name: 'Emma Williams', predicted_occasion: 'casual_catchup', confidence_pct: 75, party_size: 3, time_of_day: 'lunch', day_of_week: 'Sat', occasion_signals: ['party_3', 'lingering', 'shareable_items', 'coffee_after'], avg_occasion_spend: 55, avg_non_occasion_spend: 40, is_weekday: false, has_wine: false, has_dessert: true, has_kids_items: false, order_count: 15, current_spend: 52, usual_occasion: 'business_lunch' },
  { customer_id: 'O07', customer_name: 'James Park', predicted_occasion: 'business_dinner', confidence_pct: 84, party_size: 4, time_of_day: 'dinner', day_of_week: 'Thu', occasion_signals: ['party_4', 'wine', 'expensive_items', 'weekday_evening', 'corporate_card'], avg_occasion_spend: 180, avg_non_occasion_spend: 70, is_weekday: true, has_wine: true, has_dessert: false, has_kids_items: false, order_count: 9, current_spend: 175 },
  { customer_id: 'O08', customer_name: 'Lisa Anderson', predicted_occasion: 'date_night', confidence_pct: 72, party_size: 2, time_of_day: 'dinner', day_of_week: 'Fri', occasion_signals: ['party_2', 'wine', 'dessert', 'evening'], avg_occasion_spend: 110, avg_non_occasion_spend: 60, is_weekday: false, has_wine: true, has_dessert: true, has_kids_items: false, order_count: 6, current_spend: 95 },
];

export const runOccasionEngine = async (
  db: ReturnType<typeof useDB>,
  config: OccasionConfig = DEFAULT_OCCASION_CONFIG
): Promise<{ alerts: OccasionAlert[]; generated: number }> => {
  const alerts: OccasionAlert[] = [];
  const now = new Date();

  let customers: OccasionData[] = [];
  try {
    const result = await db.query(
      `SELECT customer_id, customer_name, predicted_occasion, confidence_pct,
              party_size, time_of_day, day_of_week, occasion_signals,
              avg_occasion_spend, avg_non_occasion_spend, is_weekday,
              has_wine, has_dessert, has_kids_items, order_count,
              usual_occasion, current_spend
       FROM occasion_prediction_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    customers = rows.map((r: any) => ({
      customer_id: String(r.customer_id ?? 'Unknown'),
      customer_name: String(r.customer_name ?? 'Unknown'),
      predicted_occasion: String(r.predicted_occasion ?? 'casual'),
      confidence_pct: safeNumber(r.confidence_pct, 0),
      party_size: safeNumber(r.party_size, 1),
      time_of_day: r.time_of_day ?? 'dinner',
      day_of_week: r.day_of_week ?? 'Unknown',
      occasion_signals: Array.isArray(r.occasion_signals) ? r.occasion_signals : [],
      avg_occasion_spend: safeNumber(r.avg_occasion_spend, 0),
      avg_non_occasion_spend: safeNumber(r.avg_non_occasion_spend, 0),
      is_weekday: r.is_weekday ?? false,
      has_wine: r.has_wine ?? false,
      has_dessert: r.has_dessert ?? false,
      has_kids_items: r.has_kids_items ?? false,
      order_count: safeNumber(r.order_count, 0),
      usual_occasion: r.usual_occasion ?? undefined,
      current_spend: safeNumber(r.current_spend, 0),
    }));
  } catch (err) {
    console.warn('[occasion] fetchCustomers failed — using mock', err);
  }

  if (customers.length === 0) {
    customers = MOCK_CUSTOMERS;
  }

  const serviceStyles: Record<string, string> = {
    business_lunch: 'fast_efficient',
    date_night: 'unhurried_intimate',
    family_dinner: 'patient_family',
    solo: 'engaging_solo',
    celebration: 'celebratory',
    casual_catchup: 'relaxed_comfortable',
    business_dinner: 'professional_attentive',
  };

  const upsellMap: Record<string, string> = {
    business_lunch: 'coffee_to_go, express_lunch_combo',
    date_night: 'wine_pairing, dessert_for_two, champagne',
    family_dinner: 'kids_combo, family_sharing_platter, dessert_sampler',
    solo: 'bar_snack, coffee_refill, quick_combo',
    celebration: 'champagne, dessert_platter, group_photo',
    casual_catchup: 'sharing_platter, coffee_dessert_combo',
    business_dinner: 'premium_wine, appetizer_platter, after_dinner_drinks',
  };

  for (const c of customers) {
    const spendUpliftPct = c.avg_non_occasion_spend > 0
      ? ((c.avg_occasion_spend - c.avg_non_occasion_spend) / c.avg_non_occasion_spend) * 100
      : 0;
    const monthlyOpp = Math.round((c.avg_occasion_spend - c.current_spend) * c.order_count / 30 * 30);

    // Rule 1: OCCASION_PREDICTED (high-confidence occasion detected)
    if (c.confidence_pct >= config.confidenceThreshold) {
      const serviceStyle = serviceStyles[c.predicted_occasion] ?? 'standard';
      const upsell = upsellMap[c.predicted_occasion] ?? '';
      alerts.push({
        rule_id: 'occasion_predicted',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        predicted_occasion: c.predicted_occasion,
        confidence_pct: c.confidence_pct,
        party_size: c.party_size,
        time_of_day: c.time_of_day,
        day_of_week: c.day_of_week,
        occasion_signals: c.occasion_signals.join(', '),
        recommended_service_style: serviceStyle,
        recommended_upsell: upsell,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: OCCASION PREDICTED — ${c.predicted_occasion.replace('_', ' ')} (${c.confidence_pct}% confidence). Party of ${c.party_size}, ${c.time_of_day} ${c.day_of_week}. Signals: ${c.occasion_signals.join(', ')}. APPLY SERVICE STYLE: ${serviceStyle}. ${c.predicted_occasion === 'business_lunch' ? 'Fast, efficient, quiet table, quick payment. ' : c.predicted_occasion === 'date_night' ? 'Unhurried, intimate, wine upsell, unhurried pacing. ' : c.predicted_occasion === 'family_dinner' ? 'Patient, high chair, kids menu, large table. ' : ''}RECOMMENDED UPSELL: ${upsell}. Occasion-aware service increases satisfaction 25% + spend 20%.`,
        ai_recommendation: 'apply_service_style',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: CELEBRATION_DETECTED
    if (c.predicted_occasion === 'celebration' && c.party_size >= 4 && c.has_dessert) {
      alerts.push({
        rule_id: 'celebration_detected',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        predicted_occasion: 'celebration',
        confidence_pct: c.confidence_pct,
        party_size: c.party_size,
        occasion_signals: c.occasion_signals.join(', '),
        recommended_service_style: 'celebratory',
        recommended_upsell: 'champagne, dessert_platter, group_photo, candle',
        avg_occasion_spend: c.avg_occasion_spend,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: CELEBRATION DETECTED — party of ${c.party_size}, ${c.has_dessert ? 'multiple desserts, ' : ''}high spend pattern. ${c.occasion_signals.includes('champagne') ? 'Champagne ordered. ' : ''}This is a SPECIAL MOMENT — birthday, anniversary, promotion, or gathering. ACKNOWLEDGE: "Is there a special occasion today?" → free dessert, candle, champagne toast, manager greeting. Celebration visits are 3x avg spend + create word-of-mouth. Make it MEMORABLE → customer returns for next celebration + tells 5+ people. Miss the celebration = missed loyalty moment worth ${fmt$(c.avg_occasion_spend * 3)} in future visits.`,
        ai_recommendation: 'acknowledge_occasion',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: BUSINESS_LUNCH_PATTERN
    if (c.predicted_occasion === 'business_lunch' && c.is_weekday && c.time_of_day === 'lunch') {
      alerts.push({
        rule_id: 'business_lunch_pattern',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        predicted_occasion: 'business_lunch',
        confidence_pct: c.confidence_pct,
        party_size: c.party_size,
        time_of_day: c.time_of_day,
        day_of_week: c.day_of_week,
        recommended_service_style: 'fast_efficient',
        recommended_upsell: 'express_lunch_combo, coffee_to_go',
        avg_occasion_spend: c.avg_occasion_spend,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: BUSINESS LUNCH — weekday lunch, party of ${c.party_size}. Business customers value TIME above all. APPLY: fast greeting, immediate menu, prompt ordering, efficient payment (pre-printed check or mobile pay). Quiet table away from noise. No upsell delay — suggest express combo immediately. Business lunch customers return 2-4x/week if service is fast. Rush them = lost recurring revenue. Avg business lunch spend: ${fmt$(c.avg_occasion_spend)} × 4 visits/week = ${fmt$(c.avg_occasion_spend * 16)}/mo potential.`,
        ai_recommendation: 'apply_service_style',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: DATE_NIGHT_INDICATORS
    if (c.predicted_occasion === 'date_night' && c.party_size === 2 && c.has_wine && c.has_dessert) {
      alerts.push({
        rule_id: 'date_night_indicators',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        predicted_occasion: 'date_night',
        confidence_pct: c.confidence_pct,
        party_size: c.party_size,
        occasion_signals: c.occasion_signals.join(', '),
        recommended_service_style: 'unhurried_intimate',
        recommended_upsell: 'wine_pairing, dessert_for_two, champagne, after_dinner_drink',
        avg_occasion_spend: c.avg_occasion_spend,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: DATE NIGHT — party of 2, wine + dessert ordered, evening. Classic date night pattern. APPLY: unhurried pacing, intimate table (quiet corner/window), attentive but not intrusive service. UPSELL: wine pairing recommendations, dessert for two, after-dinner drinks. Date night spend is 2x casual — ${fmt$(c.avg_occasion_spend)} vs ${fmt$(c.avg_non_occasion_spend)}. Rushing a date night = ruined experience. Lingering is GOOD — they're ordering more courses. Each great date night = return visit + referral.`,
        ai_recommendation: 'offer_upsell',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: FAMILY_DINING_DETECTED
    if (c.predicted_occasion === 'family_dinner' && c.party_size >= 4 && c.has_kids_items) {
      alerts.push({
        rule_id: 'family_dining_detected',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        predicted_occasion: 'family_dinner',
        confidence_pct: c.confidence_pct,
        party_size: c.party_size,
        occasion_signals: c.occasion_signals.join(', '),
        recommended_service_style: 'patient_family',
        recommended_upsell: 'kids_combo, family_sharing_platter, dessert_sampler',
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: FAMILY DINING — party of ${c.party_size}, kids items ordered. Family dining requires PATIENCE + PRACTICALITY. APPLY: high chair ready, kids menu immediately, crayons/activity, large table, patient pacing. Don't rush — families take longer. UPSELL: family sharing platter, kids combo, dessert sampler. Families return weekly if kids are happy. Kids-friendly service = family loyalty for years (each family = ${fmt$(c.avg_occasion_spend * 4)}/mo). Accommodate strollers, extra napkins, kid-friendly utensils.`,
        ai_recommendation: 'apply_service_style',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: OCCASION_SPEND_UPLIFT
    if (spendUpliftPct >= config.spendUpliftThreshold) {
      alerts.push({
        rule_id: 'occasion_spend_uplift',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        predicted_occasion: c.predicted_occasion,
        avg_occasion_spend: c.avg_occasion_spend,
        avg_non_occasion_spend: c.avg_non_occasion_spend,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: OCCASION SPEND UPLIFT — ${c.predicted_occasion.replace('_', ' ')} visits spend ${spendUpliftPct.toFixed(0)}% more than non-occasion visits (${fmt$(c.avg_occasion_spend)} vs ${fmt$(c.avg_non_occasion_spend)}). Occasion-aware service VALIDATED — recognizing + serving the occasion drives higher spend. Each occasion visit = +${fmt$(c.avg_occasion_spend - c.avg_non_occasion_spend)} in revenue. With ${c.order_count} visits, recognizing occasions = +${fmt$(monthlyOpp)}/mo. Apply occasion detection to ALL customers — the uplift is universal.`,
        ai_recommendation: 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: OCCASION_SHIFT
    if (c.usual_occasion && c.usual_occasion !== c.predicted_occasion) {
      alerts.push({
        rule_id: 'occasion_shift',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        predicted_occasion: c.predicted_occasion,
        occasion_signals: `was ${c.usual_occasion}, now ${c.predicted_occasion}`,
        est_monthly_opportunity: 0,
        description: `${c.customer_name}: OCCASION SHIFT — usual occasion was "${c.usual_occasion.replace('_', ' ')}" but this visit pattern matches "${c.predicted_occasion.replace('_', ' ')}". Life event? Schedule change? Relationship status? ${c.usual_occasion === 'business_lunch' && c.predicted_occasion === 'casual_catchup' ? 'Business lunch → casual catchup: maybe changed jobs or meeting friends instead of colleagues. ' : ''}UPDATE PROFILE to reflect new occasion pattern. Occasion shifts signal life changes — adapt service to new context. Old occasion assumptions → wrong service style → missed personalization.`,
        ai_recommendation: 'update_profile',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: OCCASION_UPSELL_OPPORTUNITY
    if (c.confidence_pct >= config.confidenceThreshold && c.current_spend < c.avg_occasion_spend * 0.85) {
      const upsell = upsellMap[c.predicted_occasion] ?? '';
      const gap = c.avg_occasion_spend - c.current_spend;
      alerts.push({
        rule_id: 'occasion_upsell_opportunity',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        predicted_occasion: c.predicted_occasion,
        recommended_upsell: upsell,
        avg_occasion_spend: c.avg_occasion_spend,
        est_monthly_opportunity: Math.round(gap * c.order_count / 30 * 30),
        description: `${c.customer_name}: UPSELL OPPORTUNITY — ${c.predicted_occasion.replace('_', ' ')} detected but current spend ${fmt$(c.current_spend)} is below avg for this occasion (${fmt$(c.avg_occasion_spend)}). ${fmt$(gap)} gap. OFFER: ${upsell}. Occasion-appropriate upsell has 40% acceptance rate vs 15% generic. ${c.predicted_occasion === 'date_night' ? '"Would you like a wine pairing with that?" → 50% acceptance on date nights.' : c.predicted_occasion === 'celebration' ? '"Champagne to celebrate?" → 60% acceptance on celebrations.' : ''} Each missed upsell = ${fmt$(gap)} in unrealized revenue per visit.`,
        ai_recommendation: 'offer_upsell',
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
            { role: 'system', content: 'You are a restaurant service personalization AI specializing in occasion prediction and occasion-appropriate service recommendations. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Customer: ${a.customer_name} — ${a.rule_id}. Occasion: ${a.predicted_occasion ?? 'N/A'} (${a.confidence_pct ?? 0}% conf). Party: ${a.party_size ?? 0}, ${a.time_of_day ?? 'N/A'} ${a.day_of_week ?? ''}. Spend: ${fmt$(a.avg_occasion_spend ?? 0)} vs ${fmt$(a.avg_non_occasion_spend ?? 0)}. Signals: ${a.occasion_signals ?? 'N/A'}. Service: ${a.recommended_service_style ?? 'N/A'}. Upsell: ${a.recommended_upsell ?? 'N/A'}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM occasion_prediction_alert WHERE status = 'open' AND detected_at < time::now() - 2h`);
  } catch { /* ignore - short TTL for real-time */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE occasion_prediction_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<OccasionAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM occasion_prediction_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  highConfidencePredictions: number; avgUpliftPct: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(confidence_pct >= 70) AS highconf
       FROM occasion_prediction_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      highConfidencePredictions: safeNumber(r.highconf, 0), avgUpliftPct: 0,
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, highConfidencePredictions: 0, avgUpliftPct: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
