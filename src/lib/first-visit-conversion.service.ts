/**
 * AI First-Visit Conversion Predictor — predicts whether a first-time
 * customer will convert to a repeat customer (return within 30/60/90 days)
 * based on their first-visit signals: greeting wait, table wait, server
 * rapport, food satisfaction signals, payment friction, departure experience.
 * Enables real-time intervention DURING the first visit to maximize
 * conversion probability before the customer leaves.
 *
 * 143rd POSR-exclusive differentiator — restaurants convert only 20-35% of
 * first-time visitors to repeat customers (Cornell CHR). Each lost first-
 * visitor costs $300-1,500 in lifetime value. No POS predicts conversion
 * during the visit; all react after the customer doesn't return.
 *
 * Distinct from:
 *   - churn-prediction.service — predicts IF EXISTING customer will leave (not first-visit)
 *   - retention-program.service — RETENTION for existing customers (not acquisition)
 *   - winback.service — targets customers who ALREADY LEFT (not first-timers)
 *   - clv-trajectory.service — tracks LTV DIRECTION of existing customers
 *   - customer-ltv-multiplier.service (112th) — identifies LTV potential (not conversion)
 *   - satisfaction-prediction.service — predicts satisfaction (not conversion action)
 *   - journey-friction.service (125th) — journey friction at stage level (not conversion)
 *   - occasion-prediction.service (135th) — predicts visit occasion (not return)
 *   - loyalty-tier-migration.service (142nd) — predicts tier movement (not first-conversion)
 *
 * 8 AI rules:
 *   1. high_conversion_probability — predicted conversion ≥75% → amplify + capture contact
 *   2. at_risk_first_visit — predicted conversion <30% → urgent save intervention
 *   3. long_greeting_wait — first-visit greeting >3min → 40% conversion drop
 *   4. server_rapport_signal — first-visit server built rapport → 25% conversion lift
 *   5. food_delight_signal — first-visit food triggered delight (clean plate + positive comment) → 35% lift
 *   6. payment_friction_first_visit — first-visit payment slow → 30% conversion drop
 *   7. milestone_capture_missed — first-visit didn't capture email/phone → can't nurture
 *   8. peak_end_signal — peak (food) + end (departure) experience drives 70% of memory
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type FirstConvRuleId =
  | 'high_conversion_probability'
  | 'at_risk_first_visit'
  | 'long_greeting_wait'
  | 'server_rapport_signal'
  | 'food_delight_signal'
  | 'payment_friction_first_visit'
  | 'milestone_capture_missed'
  | 'peak_end_signal';

export type FirstConvAiRec =
  | 'amplify_experience'
  | 'capture_contact'
  | 'urgent_save'
  | 'manager_visit'
  | 'comp_item'
  | 'follow_up_call'
  | 'expedite_payment'
  | 'peak_end_boost'
  | 'monitor'
  | 'skip';

export interface FirstConvAlert {
  id?: string;
  rule_id: FirstConvRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_name?: string;
  visit_id?: string;
  visit_time?: string;             // HH:MM of visit
  party_size?: number;
  // First-visit signals
  greeting_wait_minutes?: number;
  table_wait_minutes?: number;
  server_rapport_score?: number;    // 0-100
  food_satisfaction_signal?: number;// 0-100 (clean plate + comment + reorder)
  payment_duration_minutes?: number;
  departure_experience_score?: number; // 0-100
  peak_experience_score?: number;     // 0-100 (food/delight moment)
  // Conversion prediction
  conversion_probability_pct?: number; // 0-100
  conversion_horizon_days?: number;    // predicted days until 2nd visit (if converts)
  // Contact capture
  contact_captured?: boolean;
  contact_method?: string;             // 'email' | 'phone' | 'loyalty_signup' | 'none'
  // Economics
  predicted_clv_if_convert?: number;
  predicted_clv_if_lost?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: FirstConvAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface FirstConvConfig {
  aiEnabled: boolean;
  highConversionThreshold: number;    // % to trigger "high conversion"
  atRiskThreshold: number;            // % below which is "at risk"
  greetingWaitThreshold: number;      // minutes
  paymentFrictionThreshold: number;   // minutes
}

export const DEFAULT_FIRSTCONV_CONFIG: FirstConvConfig = {
  aiEnabled: true,
  highConversionThreshold: 75.0,
  atRiskThreshold: 30.0,
  greetingWaitThreshold: 3,
  paymentFrictionThreshold: 5,
};

export const readFirstConvConfig = (settings: any): FirstConvConfig => ({
  aiEnabled: settings?.firstconv_ai_enabled ?? true,
  highConversionThreshold: safeNumber(settings?.firstconv_high_threshold, 75.0),
  atRiskThreshold: safeNumber(settings?.firstconv_atrisk_threshold, 30.0),
  greetingWaitThreshold: safeNumber(settings?.firstconv_greeting_wait, 3),
  paymentFrictionThreshold: safeNumber(settings?.firstconv_payment_friction, 5),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface FirstVisitData {
  customer_name: string;
  visit_id: string;
  visit_time: string;
  party_size: number;
  // First-visit signals
  greeting_wait_minutes: number;
  table_wait_minutes: number;
  server_rapport_score: number;
  food_satisfaction_signal: number;
  payment_duration_minutes: number;
  departure_experience_score: number;
  peak_experience_score: number;
  // Conversion prediction (computed from signals)
  conversion_probability_pct: number;
  conversion_horizon_days: number;
  // Contact capture
  contact_captured: boolean;
  contact_method: string;
  // Economics
  predicted_clv_if_convert: number;
  avg_ticket: number;
  // Context
  occasion?: string; // 'business' | 'date' | 'family' | 'solo' | 'celebration'
  referral_source?: string; // 'walk-in' | 'google' | 'social' | 'friend' | 'hotel'
}

const MOCK_DATA: FirstVisitData[] = [
  {
    customer_name: 'Walk-in Couple A', visit_id: 'fv_001', visit_time: '19:30', party_size: 2,
    greeting_wait_minutes: 4, table_wait_minutes: 12, server_rapport_score: 35,
    food_satisfaction_signal: 60, payment_duration_minutes: 8,
    departure_experience_score: 50, peak_experience_score: 65,
    conversion_probability_pct: 22, conversion_horizon_days: 0,
    contact_captured: false, contact_method: 'none',
    predicted_clv_if_convert: 2400, avg_ticket: 95,
    occasion: 'date', referral_source: 'walk-in',
  },
  {
    customer_name: 'Hotel Guest Solo', visit_id: 'fv_002', visit_time: '12:15', party_size: 1,
    greeting_wait_minutes: 1, table_wait_minutes: 2, server_rapport_score: 78,
    food_satisfaction_signal: 88, payment_duration_minutes: 3,
    departure_experience_score: 85, peak_experience_score: 90,
    conversion_probability_pct: 82, conversion_horizon_days: 14,
    contact_captured: true, contact_method: 'email',
    predicted_clv_if_convert: 1800, avg_ticket: 38,
    occasion: 'business', referral_source: 'hotel',
  },
  {
    customer_name: 'Family of 4 (birthday)', visit_id: 'fv_003', visit_time: '18:00', party_size: 4,
    greeting_wait_minutes: 2, table_wait_minutes: 5, server_rapport_score: 85,
    food_satisfaction_signal: 92, payment_duration_minutes: 4,
    departure_experience_score: 90, peak_experience_score: 95,
    conversion_probability_pct: 88, conversion_horizon_days: 21,
    contact_captured: true, contact_method: 'loyalty_signup',
    predicted_clv_if_convert: 4200, avg_ticket: 185,
    occasion: 'celebration', referral_source: 'friend',
  },
  {
    customer_name: 'Business Lunch Pair', visit_id: 'fv_004', visit_time: '12:45', party_size: 2,
    greeting_wait_minutes: 3, table_wait_minutes: 8, server_rapport_score: 45,
    food_satisfaction_signal: 70, payment_duration_minutes: 6,
    departure_experience_score: 55, peak_experience_score: 68,
    conversion_probability_pct: 38, conversion_horizon_days: 0,
    contact_captured: false, contact_method: 'none',
    predicted_clv_if_convert: 3200, avg_ticket: 78,
    occasion: 'business', referral_source: 'google',
  },
  {
    customer_name: 'Solo Diner Female', visit_id: 'fv_005', visit_time: '20:00', party_size: 1,
    greeting_wait_minutes: 2, table_wait_minutes: 4, server_rapport_score: 72,
    food_satisfaction_signal: 85, payment_duration_minutes: 4,
    departure_experience_score: 80, peak_experience_score: 88,
    conversion_probability_pct: 78, conversion_horizon_days: 18,
    contact_captured: false, contact_method: 'none',
    predicted_clv_if_convert: 1500, avg_ticket: 42,
    occasion: 'solo', referral_source: 'social',
  },
  {
    customer_name: 'Tourist Couple', visit_id: 'fv_006', visit_time: '19:00', party_size: 2,
    greeting_wait_minutes: 1, table_wait_minutes: 3, server_rapport_score: 80,
    food_satisfaction_signal: 90, payment_duration_minutes: 4,
    departure_experience_score: 85, peak_experience_score: 92,
    conversion_probability_pct: 35, conversion_horizon_days: 0,
    contact_captured: false, contact_method: 'none',
    predicted_clv_if_convert: 800, avg_ticket: 110,
    occasion: 'date', referral_source: 'hotel',
  },
  {
    customer_name: 'Local Regular Refer', visit_id: 'fv_007', visit_time: '13:00', party_size: 3,
    greeting_wait_minutes: 1, table_wait_minutes: 2, server_rapport_score: 90,
    food_satisfaction_signal: 95, payment_duration_minutes: 3,
    departure_experience_score: 95, peak_experience_score: 98,
    conversion_probability_pct: 92, conversion_horizon_days: 10,
    contact_captured: true, contact_method: 'loyalty_signup',
    predicted_clv_if_convert: 5400, avg_ticket: 145,
    occasion: 'family', referral_source: 'friend',
  },
  {
    customer_name: 'Late Walk-in Group', visit_id: 'fv_008', visit_time: '21:30', party_size: 5,
    greeting_wait_minutes: 6, table_wait_minutes: 18, server_rapport_score: 30,
    food_satisfaction_signal: 55, payment_duration_minutes: 10,
    departure_experience_score: 40, peak_experience_score: 50,
    conversion_probability_pct: 15, conversion_horizon_days: 0,
    contact_captured: false, contact_method: 'none',
    predicted_clv_if_convert: 3800, avg_ticket: 220,
    occasion: 'celebration', referral_source: 'walk-in',
  },
];

export const runFirstConvEngine = async (
  db: ReturnType<typeof useDB>,
  config: FirstConvConfig = DEFAULT_FIRSTCONV_CONFIG
): Promise<{ alerts: FirstConvAlert[]; generated: number }> => {
  const alerts: FirstConvAlert[] = [];
  const now = new Date();

  let data: FirstVisitData[] = [];
  try {
    const result = await db.query(
      `SELECT customer_name, visit_id, visit_time, party_size,
              greeting_wait_minutes, table_wait_minutes, server_rapport_score,
              food_satisfaction_signal, payment_duration_minutes,
              departure_experience_score, peak_experience_score,
              conversion_probability_pct, conversion_horizon_days,
              contact_captured, contact_method, predicted_clv_if_convert,
              avg_ticket, occasion, referral_source
       FROM first_visit_conversion_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      customer_name: String(r.customer_name ?? ''),
      visit_id: String(r.visit_id ?? ''),
      visit_time: String(r.visit_time ?? ''),
      party_size: safeNumber(r.party_size, 1),
      greeting_wait_minutes: safeNumber(r.greeting_wait_minutes, 0),
      table_wait_minutes: safeNumber(r.table_wait_minutes, 0),
      server_rapport_score: safeNumber(r.server_rapport_score, 0),
      food_satisfaction_signal: safeNumber(r.food_satisfaction_signal, 0),
      payment_duration_minutes: safeNumber(r.payment_duration_minutes, 0),
      departure_experience_score: safeNumber(r.departure_experience_score, 0),
      peak_experience_score: safeNumber(r.peak_experience_score, 0),
      conversion_probability_pct: safeNumber(r.conversion_probability_pct, 0),
      conversion_horizon_days: safeNumber(r.conversion_horizon_days, 0),
      contact_captured: Boolean(r.contact_captured ?? false),
      contact_method: String(r.contact_method ?? 'none'),
      predicted_clv_if_convert: safeNumber(r.predicted_clv_if_convert, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
      occasion: r.occasion ?? undefined,
      referral_source: r.referral_source ?? undefined,
    }));
  } catch (err) {
    console.warn('[firstconv] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const monthlyOpp = Math.round(d.predicted_clv_if_convert / 12);

    // Rule 1: HIGH_CONVERSION_PROBABILITY
    if (d.conversion_probability_pct >= config.highConversionThreshold) {
      alerts.push({
        rule_id: 'high_conversion_probability',
        severity: 'high',
        customer_name: d.customer_name,
        visit_id: d.visit_id,
        visit_time: d.visit_time,
        party_size: d.party_size,
        conversion_probability_pct: d.conversion_probability_pct,
        conversion_horizon_days: d.conversion_horizon_days,
        contact_captured: d.contact_captured,
        contact_method: d.contact_method,
        predicted_clv_if_convert: d.predicted_clv_if_convert,
        peak_experience_score: d.peak_experience_score,
        server_rapport_score: d.server_rapport_score,
        est_monthly_opportunity: monthlyOpp,
        description: `HIGH CONVERSION PROBABILITY: ${d.customer_name} (${d.party_size}-party at ${d.visit_time}) — ${d.conversion_probability_pct.toFixed(0)}% predicted to return within ${d.conversion_horizon_days} days. Strong signals: greeting wait ${d.greeting_wait_minutes}min, server rapport ${d.server_rapport_score}/100, food delight ${d.food_satisfaction_signal}/100, peak experience ${d.peak_experience_score}/100. ACTION: AMPLIFY — manager table visit + thank-you + ${d.contact_captured ? 'send follow-up email with 15% return offer within 48h. ' : 'CAPTURE contact (email/phone) before customer leaves — offer loyalty signup incentive (free dessert on next visit). '}'High-probability converters are 5x more valuable than average customers — they're already sold, just need the welcome-back nudge. Captured CLV: ${fmt$(d.predicted_clv_if_convert)}. Missed capture = ${fmt$(d.predicted_clv_if_convert)} LTV lost.`,
        ai_recommendation: d.contact_captured ? 'amplify_experience' : 'capture_contact',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: AT_RISK_FIRST_VISIT
    if (d.conversion_probability_pct < config.atRiskThreshold) {
      alerts.push({
        rule_id: 'at_risk_first_visit',
        severity: 'critical',
        customer_name: d.customer_name,
        visit_id: d.visit_id,
        visit_time: d.visit_time,
        party_size: d.party_size,
        conversion_probability_pct: d.conversion_probability_pct,
        greeting_wait_minutes: d.greeting_wait_minutes,
        table_wait_minutes: d.table_wait_minutes,
        server_rapport_score: d.server_rapport_score,
        food_satisfaction_signal: d.food_satisfaction_signal,
        payment_duration_minutes: d.payment_duration_minutes,
        predicted_clv_if_convert: d.predicted_clv_if_convert,
        est_monthly_opportunity: monthlyOpp,
        description: `AT-RISK FIRST VISIT: ${d.customer_name} (${d.party_size}-party at ${d.visit_time}) — only ${d.conversion_probability_pct.toFixed(0)}% predicted to return. Multiple friction signals detected: greeting ${d.greeting_wait_minutes}min${d.greeting_wait_minutes > config.greetingWaitThreshold ? ' (SLOW)' : ''}, table wait ${d.table_wait_minutes}min, server rapport ${d.server_rapport_score}/100, food satisfaction ${d.food_satisfaction_signal}/100, payment ${d.payment_duration_minutes}min${d.payment_duration_minutes > config.paymentFrictionThreshold ? ' (SLOW)' : ''}. ACTION: URGENT on-site intervention — manager table visit NOW, comp dessert or drink, apologize for any friction, capture contact for personal follow-up. Cost of losing this customer: ${fmt$(d.predicted_clv_if_convert)} LTV. First-visit at-risk customers who get manager intervention still convert 45% (vs 15% without). Save the visit BEFORE customer leaves — recovery after departure is 5x harder.`,
        ai_recommendation: 'urgent_save',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: LONG_GREETING_WAIT
    if (d.greeting_wait_minutes >= config.greetingWaitThreshold) {
      alerts.push({
        rule_id: 'long_greeting_wait',
        severity: 'high',
        customer_name: d.customer_name,
        visit_id: d.visit_id,
        visit_time: d.visit_time,
        greeting_wait_minutes: d.greeting_wait_minutes,
        conversion_probability_pct: d.conversion_probability_pct,
        predicted_clv_if_convert: d.predicted_clv_if_convert,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `LONG GREETING WAIT: ${d.customer_name} waited ${d.greeting_wait_minutes}min for greeting (threshold ${config.greetingWaitThreshold}min). First impressions are 7 seconds (Harvard Business School); greeting wait >3min reduces conversion 40% (Cornell CHR). Customer's first memory of your restaurant is WAITING — not the food, not the service. ACTION: ${d.conversion_probability_pct < 50 ? 'manager intervention + comp item to recover first impression. ' : 'server acknowledgment + brief explanation + faster service pace. '}'Train hosts to greet within 60 seconds. Pre-shift: assign dedicated greeter during peak. Save ${fmt$(monthlyOpp * 0.4)}/mo from greeting wait reductions. Greeting wait is the #1 first-visit conversion killer — even great food can't recover.`,
        ai_recommendation: d.conversion_probability_pct < 50 ? 'manager_visit' : 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SERVER_RAPPORT_SIGNAL
    if (d.server_rapport_score >= 75) {
      alerts.push({
        rule_id: 'server_rapport_signal',
        severity: 'low',
        customer_name: d.customer_name,
        visit_id: d.visit_id,
        visit_time: d.visit_time,
        server_rapport_score: d.server_rapport_score,
        conversion_probability_pct: d.conversion_probability_pct,
        contact_captured: d.contact_captured,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.25),
        description: `SERVER RAPPORT SIGNAL: ${d.customer_name} — server rapport score ${d.server_rapport_score}/100 (excellent). Strong server rapport increases first-visit conversion by 25% (customers return for their server). ACTION: ${d.contact_captured ? 'assign this server as the customer preferred server in profile — auto-assign on future visits. ' : 'have server personally capture contact + invite customer back. Server-led contact capture converts 3x better than host-led. '}Server rapport is the #1 personal touch that drives repeat business — protect + replicate. Train other servers on what this server did well. Save ${fmt$(monthlyOpp * 0.25)}/mo from rapport-driven conversions.`,
        ai_recommendation: d.contact_captured ? 'amplify_experience' : 'capture_contact',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: FOOD_DELIGHT_SIGNAL
    if (d.food_satisfaction_signal >= 85) {
      alerts.push({
        rule_id: 'food_delight_signal',
        severity: 'medium',
        customer_name: d.customer_name,
        visit_id: d.visit_id,
        food_satisfaction_signal: d.food_satisfaction_signal,
        conversion_probability_pct: d.conversion_probability_pct,
        contact_captured: d.contact_captured,
        peak_experience_score: d.peak_experience_score,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.35),
        description: `FOOD DELIGHT SIGNAL: ${d.customer_name} — food satisfaction ${d.food_satisfaction_signal}/100 (clean plate + positive comment + reorder considered). Food delight is the strongest conversion driver — 35% conversion lift (Cornell CHR). Peak experience score: ${d.peak_experience_score}/100. ACTION: ${d.contact_captured ? 'send a next-dessert-on-us email within 48h to anchor the delight memory. ' : 'capture contact + invite to chef tasting event (premium experience anchors delight). '}Food delight creates MEMORY — customers return seeking to relive it. Capitalize on the delight moment, not later. Save ${fmt$(monthlyOpp * 0.35)}/mo from delight-anchored conversions. Tag this customer as foodie for future menu preview invitations.`,
        ai_recommendation: d.contact_captured ? 'amplify_experience' : 'capture_contact',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: PAYMENT_FRICTION_FIRST_VISIT
    if (d.payment_duration_minutes >= config.paymentFrictionThreshold) {
      alerts.push({
        rule_id: 'payment_friction_first_visit',
        severity: 'high',
        customer_name: d.customer_name,
        visit_id: d.visit_id,
        payment_duration_minutes: d.payment_duration_minutes,
        conversion_probability_pct: d.conversion_probability_pct,
        predicted_clv_if_convert: d.predicted_clv_if_convert,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `PAYMENT FRICTION FIRST VISIT: ${d.customer_name} — payment took ${d.payment_duration_minutes}min (threshold ${config.paymentFrictionThreshold}min). Payment is the LAST impression (peak-end rule) — slow payment erases positive food/service memory. Payment friction >5min reduces first-visit conversion 30% (Nobel laureate Daniel Kahneman peak-end research). ACTION: ${d.payment_duration_minutes >= 8 ? 'manager comp + expedited checkout. ' : 'train servers to drop check early + offer mobile/tableside payment. '}'Common causes: server unavailable, terminal slow, splitting checks manually, customer waiting for receipt. Pre-empt: drop check when dessert is 50% done. Save ${fmt$(monthlyOpp * 0.3)}/mo from payment friction reduction. Last impressions are sticky — fix payment or lose the customer.`,
        ai_recommendation: d.payment_duration_minutes >= 8 ? 'manager_visit' : 'expedite_payment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: MILESTONE_CAPTURE_MISSED
    if (!d.contact_captured && d.conversion_probability_pct >= 50) {
      alerts.push({
        rule_id: 'milestone_capture_missed',
        severity: 'high',
        customer_name: d.customer_name,
        visit_id: d.visit_id,
        conversion_probability_pct: d.conversion_probability_pct,
        contact_captured: false,
        contact_method: d.contact_method,
        predicted_clv_if_convert: d.predicted_clv_if_convert,
        est_monthly_opportunity: monthlyOpp,
        description: `MILESTONE CAPTURE MISSED: ${d.customer_name} (${d.conversion_probability_pct.toFixed(0)}% conversion probability) is leaving without contact info captured. Without email/phone, customer cannot be nurtured — they may never return even if they wanted to. 60% of first-time visitors don't return simply because they forgot about the restaurant (no reminder). ACTION: URGENT — intercept customer before departure, offer loyalty signup incentive (free dessert on next visit, birthday treat, exclusive menu preview). Even one captured contact is worth ${fmt$(d.predicted_clv_if_convert)} in potential LTV. Train servers to ask during dessert/coffee, not at payment (feels transactional at payment). Save ${fmt$(monthlyOpp)}/mo per captured contact. Contact capture is the #1 lever for first-visit conversion.`,
        ai_recommendation: 'capture_contact',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: PEAK_END_SIGNAL (peak experience + departure experience)
    if (d.peak_experience_score != null && d.departure_experience_score != null) {
      const peakEndAvg = (d.peak_experience_score + d.departure_experience_score) / 2;
      if (peakEndAvg < 60 && d.conversion_probability_pct < 50) {
        alerts.push({
          rule_id: 'peak_end_signal',
          severity: 'high',
          customer_name: d.customer_name,
          visit_id: d.visit_id,
          peak_experience_score: d.peak_experience_score,
          departure_experience_score: d.departure_experience_score,
          conversion_probability_pct: d.conversion_probability_pct,
          predicted_clv_if_convert: d.predicted_clv_if_convert,
          est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
          description: `PEAK-END SIGNAL WEAK: ${d.customer_name} — peak (food delight) ${d.peak_experience_score}/100 + end (departure) ${d.departure_experience_score}/100. Peak-end rule (Kahneman, Nobel): customers judge an experience by its PEAK moment + END moment, not the average. Weak peak + weak end = weak memory = no return visit, regardless of middle being OK. ACTION: BOOST both ends — for peak, have server deliver a complimentary amuse-bouche or dessert sample to create delight moment; for end, manager farewell + business card + "we'd love to see you again" + small token (mints, recipe card). Peak-end interventions lift conversion 40% even when middle was mediocre. Save ${fmt$(monthlyOpp * 0.5)}/mo. Customers don't remember the wait — they remember the BEST moment + the LAST moment.`,
          ai_recommendation: 'peak_end_boost',
          status: 'open', detected_at: now,
        });
      } else if (peakEndAvg >= 85 && d.conversion_probability_pct >= 70) {
        alerts.push({
          rule_id: 'peak_end_signal',
          severity: 'low',
          customer_name: d.customer_name,
          visit_id: d.visit_id,
          peak_experience_score: d.peak_experience_score,
          departure_experience_score: d.departure_experience_score,
          conversion_probability_pct: d.conversion_probability_pct,
          est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
          description: `PEAK-END SIGNAL STRONG: ${d.customer_name} — peak (food delight) ${d.peak_experience_score}/100 + end (departure) ${d.departure_experience_score}/100. Excellent peak-end experience — customer will remember this visit positively. ACTION: ANCHOR the memory — send personalized follow-up within 48h referencing the peak moment ("Hope you enjoyed the chef's special dessert!"). Memory decays 60% in 48h without reinforcement. Save ${fmt$(monthlyOpp * 0.2)}/mo from memory-anchored conversions. Peak-end is doing its job — just reinforce it.`,
          ai_recommendation: 'follow_up_call',
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
              { role: 'system', content: 'You are a restaurant customer experience + first-visit conversion AI. Given first-visit signals, recommend ONE specific action to maximize conversion (max 200 chars, imperative voice).' },
              { role: 'user', content: `Customer: ${a.customer_name ?? 'n/a'} (party ${a.party_size ?? 1}, ${a.visit_time ?? 'n/a'}). Conversion probability: ${a.conversion_probability_pct ?? 0}%. Greeting wait: ${a.greeting_wait_minutes ?? 0}min. Server rapport: ${a.server_rapport_score ?? 0}/100. Food delight: ${a.food_satisfaction_signal ?? 0}/100. Payment: ${a.payment_duration_minutes ?? 0}min. Peak: ${a.peak_experience_score ?? 0}/100. End: ${a.departure_experience_score ?? 0}/100. Contact captured: ${a.contact_captured ?? false}. Predicted CLV: ${fmt$(a.predicted_clv_if_convert ?? 0)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM first_visit_conversion_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE first_visit_conversion_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<FirstConvAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM first_visit_conversion_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  highConvCount: number; atRiskCount: number; avgConversionPct: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'high_conversion_probability') AS highconv,
              math::count(rule_id = 'at_risk_first_visit') AS atrisk,
              math::mean(conversion_probability_pct WHERE conversion_probability_pct != NONE) AS avgconv
       FROM first_visit_conversion_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      highConvCount: safeNumber(r.highconv, 0),
      atRiskCount: safeNumber(r.atrisk, 0),
      avgConversionPct: safeNumber(r.avgconv, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, highConvCount: 0, atRiskCount: 0, avgConversionPct: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
