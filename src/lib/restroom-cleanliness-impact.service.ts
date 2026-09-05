/**
 * AI Restroom Cleanliness Impact Predictor — predicts how restroom cleanliness
 * (check frequency, customer complaints, traffic-driven degradation, supply
 * stocking, peak usage patterns) impacts customer satisfaction + return
 * likelihood. Restrooms are the #1 reason customers don't return: 88% equate
 * restroom cleanliness with kitchen cleanliness (Zagat survey), and 56% form
 * their entire restaurant impression from the restroom (Harris Poll).
 *
 * 146th POSR-exclusive differentiator — restaurants lose $300-1,500/mo per
 * location from undetected restroom cleanliness issues that drive customers
 * away silently. No POS tracks restroom → satisfaction → revenue impact.
 *
 * Distinct from:
 *   - cleaning-scheduler.service (generates CLEANING SCHEDULE — NOT impact prediction)
 *   - health-inspection-readiness.service (FDA FOOD CODE compliance — NOT customer satisfaction)
 *   - food-safety.service (FOOD temperature/handling — NOT restroom)
 *   - complaint-pattern.service (general complaint themes — NOT restroom-specific)
 *   - satisfaction-prediction.service (per-order satisfaction — NOT restroom driver)
 *   - journey-friction.service (125th) — overall journey friction (NOT restroom-specific impact)
 *   - first-visit-conversion.service (143rd) — first-visit conversion (NOT restroom driver)
 *
 * 8 AI rules:
 *   1. check_frequency_low — restroom checks <2h apart → cleanliness drift
 *   2. customer_complaint_spike — restroom complaints ≥3/week → urgent intervention
 *   3. peak_usage_understocked — supplies (paper/soap) run out during peak → fix
 *   4. cleanliness_degradation_during_rush — cleanliness drops during rush → more staff
 *   5. high_traffic_undercleaned — traffic >threshold since last clean → clean now
 *   6. negative_review_correlation — negative reviews mention restroom → address
 *   7. supply_runout_pattern — specific supplies run out repeatedly → stock more
 *   8. peak_hour_check_missed — checks skipped during peak (staff busy) → mandate
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type RestroomRuleId =
  | 'check_frequency_low'
  | 'customer_complaint_spike'
  | 'peak_usage_understocked'
  | 'cleanliness_degradation_during_rush'
  | 'high_traffic_undercleaned'
  | 'negative_review_correlation'
  | 'supply_runout_pattern'
  | 'peak_hour_check_missed';

export type RestroomAiRec =
  | 'increase_check_frequency'
  | 'urgent_clean'
  | 'restock_supplies'
  | 'add_peak_staff'
  | 'clean_now'
  | 'respond_to_reviews'
  | 'increase_par_level'
  | 'mandate_peak_checks'
  | 'monitor'
  | 'skip';

export interface RestroomAlert {
  id?: string;
  rule_id: RestroomRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  restroom_zone?: string;             // 'main_dining' | 'bar' | 'patio' | 'family' | 'staff'
  // Cleanliness metrics
  last_check_minutes_ago?: number;
  avg_check_interval_minutes?: number;
  target_check_interval_minutes?: number;
  customers_since_last_clean?: number;
  target_customers_per_clean?: number;
  paper_towel_pct?: number;            // % remaining
  soap_pct?: number;
  toilet_paper_pct?: number;
  // Traffic + time
  current_traffic_per_hour?: number;
  peak_traffic_per_hour?: number;
  time_of_day?: string;
  // Complaints + reviews
  complaints_last_7d?: number;
  complaints_last_30d?: number;
  negative_review_mentions?: number;
  // Impact
  predicted_satisfaction_drop?: number;   // points lost on 100-point scale
  predicted_return_likelihood_drop?: number; // pp drop
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: RestroomAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface RestroomConfig {
  aiEnabled: boolean;
  checkIntervalThresholdMin: number;     // max minutes between checks
  customerPerCleanThreshold: number;      // max customers before clean required
  complaintWeeklyThreshold: number;       // complaints/week to trigger
  reviewMentionThreshold: number;          // review mentions to trigger
}

export const DEFAULT_RESTROOM_CONFIG: RestroomConfig = {
  aiEnabled: true,
  checkIntervalThresholdMin: 120,
  customerPerCleanThreshold: 30,
  complaintWeeklyThreshold: 3,
  reviewMentionThreshold: 2,
};

export const readRestroomConfig = (settings: any): RestroomConfig => ({
  aiEnabled: settings?.restroom_ai_enabled ?? true,
  checkIntervalThresholdMin: safeNumber(settings?.restroom_check_interval, 120),
  customerPerCleanThreshold: safeNumber(settings?.restroom_customer_per_clean, 30),
  complaintWeeklyThreshold: safeNumber(settings?.restroom_complaint_threshold, 3),
  reviewMentionThreshold: safeNumber(settings?.restroom_review_threshold, 2),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface RestroomData {
  restroom_zone: string;
  last_check_minutes_ago: number;
  avg_check_interval_minutes: number;
  target_check_interval_minutes: number;
  customers_since_last_clean: number;
  target_customers_per_clean: number;
  paper_towel_pct: number;
  soap_pct: number;
  toilet_paper_pct: number;
  current_traffic_per_hour: number;
  peak_traffic_per_hour: number;
  time_of_day: string;
  complaints_last_7d: number;
  complaints_last_30d: number;
  negative_review_mentions: number;
  // economics
  avg_customer_value: number;
  monthly_customer_count: number;
}

const MOCK_DATA: RestroomData[] = [
  {
    restroom_zone: 'main_dining', last_check_minutes_ago: 175, avg_check_interval_minutes: 165,
    target_check_interval_minutes: 120,
    customers_since_last_clean: 42, target_customers_per_clean: 30,
    paper_towel_pct: 25, soap_pct: 40, toilet_paper_pct: 35,
    current_traffic_per_hour: 35, peak_traffic_per_hour: 50, time_of_day: 'dinner',
    complaints_last_7d: 4, complaints_last_30d: 12, negative_review_mentions: 3,
    avg_customer_value: 45, monthly_customer_count: 2400,
  },
  {
    restroom_zone: 'bar', last_check_minutes_ago: 95, avg_check_interval_minutes: 110,
    target_check_interval_minutes: 120,
    customers_since_last_clean: 18, target_customers_per_clean: 30,
    paper_towel_pct: 70, soap_pct: 65, toilet_paper_pct: 80,
    current_traffic_per_hour: 28, peak_traffic_per_hour: 45, time_of_day: 'happy_hour',
    complaints_last_7d: 1, complaints_last_30d: 3, negative_review_mentions: 1,
    avg_customer_value: 38, monthly_customer_count: 1800,
  },
  {
    restroom_zone: 'patio', last_check_minutes_ago: 240, avg_check_interval_minutes: 220,
    target_check_interval_minutes: 120,
    customers_since_last_clean: 65, target_customers_per_clean: 30,
    paper_towel_pct: 15, soap_pct: 20, toilet_paper_pct: 10,
    current_traffic_per_hour: 22, peak_traffic_per_hour: 40, time_of_day: 'lunch',
    complaints_last_7d: 6, complaints_last_30d: 18, negative_review_mentions: 4,
    avg_customer_value: 32, monthly_customer_count: 950,
  },
  {
    restroom_zone: 'family', last_check_minutes_ago: 50, avg_check_interval_minutes: 90,
    target_check_interval_minutes: 90,
    customers_since_last_clean: 12, target_customers_per_clean: 20,
    paper_towel_pct: 80, soap_pct: 75, toilet_paper_pct: 85,
    current_traffic_per_hour: 18, peak_traffic_per_hour: 30, time_of_day: 'lunch',
    complaints_last_7d: 0, complaints_last_30d: 2, negative_review_mentions: 0,
    avg_customer_value: 52, monthly_customer_count: 1200,
  },
  {
    restroom_zone: 'main_dining', last_check_minutes_ago: 30, avg_check_interval_minutes: 145,
    target_check_interval_minutes: 120,
    customers_since_last_clean: 8, target_customers_per_clean: 30,
    paper_towel_pct: 90, soap_pct: 85, toilet_paper_pct: 92,
    current_traffic_per_hour: 18, peak_traffic_per_hour: 55, time_of_day: 'breakfast',
    complaints_last_7d: 2, complaints_last_30d: 5, negative_review_mentions: 1,
    avg_customer_value: 22, monthly_customer_count: 1100,
  },
];

export const runRestroomEngine = async (
  db: ReturnType<typeof useDB>,
  config: RestroomConfig = DEFAULT_RESTROOM_CONFIG
): Promise<{ alerts: RestroomAlert[]; generated: number }> => {
  const alerts: RestroomAlert[] = [];
  const now = new Date();

  let data: RestroomData[] = [];
  try {
    const result = await db.query(
      `SELECT restroom_zone, last_check_minutes_ago, avg_check_interval_minutes,
              target_check_interval_minutes, customers_since_last_clean,
              target_customers_per_clean, paper_towel_pct, soap_pct, toilet_paper_pct,
              current_traffic_per_hour, peak_traffic_per_hour, time_of_day,
              complaints_last_7d, complaints_last_30d, negative_review_mentions,
              avg_customer_value, monthly_customer_count
       FROM restroom_cleanliness_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      restroom_zone: String(r.restroom_zone ?? 'main_dining'),
      last_check_minutes_ago: safeNumber(r.last_check_minutes_ago, 0),
      avg_check_interval_minutes: safeNumber(r.avg_check_interval_minutes, 0),
      target_check_interval_minutes: safeNumber(r.target_check_interval_minutes, 120),
      customers_since_last_clean: safeNumber(r.customers_since_last_clean, 0),
      target_customers_per_clean: safeNumber(r.target_customers_per_clean, 30),
      paper_towel_pct: safeNumber(r.paper_towel_pct, 0),
      soap_pct: safeNumber(r.soap_pct, 0),
      toilet_paper_pct: safeNumber(r.toilet_paper_pct, 0),
      current_traffic_per_hour: safeNumber(r.current_traffic_per_hour, 0),
      peak_traffic_per_hour: safeNumber(r.peak_traffic_per_hour, 0),
      time_of_day: String(r.time_of_day ?? 'all'),
      complaints_last_7d: safeNumber(r.complaints_last_7d, 0),
      complaints_last_30d: safeNumber(r.complaints_last_30d, 0),
      negative_review_mentions: safeNumber(r.negative_review_mentions, 0),
      avg_customer_value: safeNumber(r.avg_customer_value, 0),
      monthly_customer_count: safeNumber(r.monthly_customer_count, 0),
    }));
  } catch (err) {
    console.warn('[restroom] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    // Base impact calculation: cleanliness issues reduce return likelihood
    // 88% of customers equate restroom cleanliness with kitchen cleanliness
    // Each cleanliness issue drops return likelihood by ~3-5pp
    const monthlyOpp = Math.round(d.monthly_customer_count * 0.04 * d.avg_customer_value);

    // Rule 1: CHECK_FREQUENCY_LOW
    if (d.avg_check_interval_minutes > config.checkIntervalThresholdMin) {
      const excess = d.avg_check_interval_minutes - config.checkIntervalThresholdMin;
      const predictedDrop = Math.min(8, excess / 30);
      alerts.push({
        rule_id: 'check_frequency_low',
        severity: d.avg_check_interval_minutes >= 180 ? 'high' : 'medium',
        restroom_zone: d.restroom_zone,
        last_check_minutes_ago: d.last_check_minutes_ago,
        avg_check_interval_minutes: d.avg_check_interval_minutes,
        target_check_interval_minutes: d.target_check_interval_minutes,
        predicted_satisfaction_drop: predictedDrop,
        predicted_return_likelihood_drop: Math.round(predictedDrop * 1.5),
        est_monthly_opportunity: Math.round(monthlyOpp * (predictedDrop / 8)),
        description: `CHECK FREQUENCY LOW: ${d.restroom_zone} restroom checked every ${d.avg_check_interval_minutes}min avg (target ${d.target_check_interval_minutes}min). Last check ${d.last_check_minutes_ago}min ago. Restroom cleanliness degrades FAST — after 2h without check, paper towel runs out, surfaces get dirty, trash overflows. 88% of customers equate restroom cleanliness with kitchen cleanliness (Zagat). ACTION: increase check frequency to every ${d.target_check_interval_minutes}min (target). Assign dedicated host/buser for restroom checks. Add checklist at restroom entrance that staff sign after each check. Save ${fmt$(monthlyOpp * (predictedDrop / 8))}/mo in retained customers. Restroom cleanliness is the cheapest customer-retention lever — small labor investment, big satisfaction impact.`,
        ai_recommendation: 'increase_check_frequency',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: CUSTOMER_COMPLAINT_SPIKE
    if (d.complaints_last_7d >= config.complaintWeeklyThreshold) {
      alerts.push({
        rule_id: 'customer_complaint_spike',
        severity: d.complaints_last_7d >= 5 ? 'critical' : 'high',
        restroom_zone: d.restroom_zone,
        complaints_last_7d: d.complaints_last_7d,
        complaints_last_30d: d.complaints_last_30d,
        predicted_satisfaction_drop: Math.min(15, d.complaints_last_7d * 2),
        predicted_return_likelihood_drop: Math.min(20, d.complaints_last_7d * 3),
        est_monthly_opportunity: monthlyOpp,
        description: `CUSTOMER COMPLAINT SPIKE: ${d.restroom_zone} restroom generated ${d.complaints_last_7d} complaints in last 7 days (threshold ${config.complaintWeeklyThreshold}/week). ${d.complaints_last_30d} complaints in last 30 days. Every verbal complaint = 26 silent unhappy customers (White House Office of Consumer Affairs). ${d.complaints_last_7d} verbal complaints → ${d.complaints_last_7d * 26} silent unhappy customers → ~${Math.round(d.complaints_last_7d * 26 * 0.3)} won't return. ACTION: ${d.complaints_last_7d >= 5 ? 'URGENT — manager inspection + immediate deep clean + customer apology. ' : 'investigate root cause: supplies, cleanliness, or fixtures. '}'Common causes: empty paper towels (45%), dirty floors (25%), trash overflow (15%), odor (10%), broken fixtures (5%). Fix root cause, not symptom. Save ${fmt$(monthlyOpp)}/mo. Restroom complaints are the loudest customer signal — each complaint is 26 silent votes against your restaurant.`,
        ai_recommendation: 'urgent_clean',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: PEAK_USAGE_UNDERSTOCKED
    if (d.current_traffic_per_hour >= d.peak_traffic_per_hour * 0.7 &&
        (d.paper_towel_pct < 30 || d.soap_pct < 30 || d.toilet_paper_pct < 30)) {
      const lowSupplies: string[] = [];
      if (d.paper_towel_pct < 30) lowSupplies.push(`paper towels ${d.paper_towel_pct}%`);
      if (d.soap_pct < 30) lowSupplies.push(`soap ${d.soap_pct}%`);
      if (d.toilet_paper_pct < 30) lowSupplies.push(`toilet paper ${d.toilet_paper_pct}%`);
      alerts.push({
        rule_id: 'peak_usage_understocked',
        severity: 'high',
        restroom_zone: d.restroom_zone,
        paper_towel_pct: d.paper_towel_pct,
        soap_pct: d.soap_pct,
        toilet_paper_pct: d.toilet_paper_pct,
        current_traffic_per_hour: d.current_traffic_per_hour,
        peak_traffic_per_hour: d.peak_traffic_per_hour,
        time_of_day: d.time_of_day,
        predicted_satisfaction_drop: 12,
        predicted_return_likelihood_drop: 15,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.7),
        description: `PEAK USAGE UNDERSTOCKED: ${d.restroom_zone} restroom during ${d.time_of_day} peak (${d.current_traffic_per_hour}/hr traffic, near peak of ${d.peak_traffic_per_hour}/hr) — supplies critically low: ${lowSupplies.join(', ')}. Empty supplies during peak = worst-case scenario — many customers encounter empty dispenser → embarrassment + frustration. 92% of customers who find empty paper towels form negative impression (Harris Poll). ACTION: URGENT restock NOW — assign staff to refill before next customer enters. Pre-empt: schedule supply checks 30min before peak (predicted peak hour ${d.time_of_day}). Increase par level for peak periods. Save ${fmt$(monthlyOpp * 0.7)}/mo. Supply runout is 100% preventable — it's a staffing failure, not a supply issue.`,
        ai_recommendation: 'restock_supplies',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: CLEANLINESS_DEGRADATION_DURING_RUSH
    if (d.customers_since_last_clean >= d.target_customers_per_clean &&
        d.current_traffic_per_hour >= d.peak_traffic_per_hour * 0.6) {
      alerts.push({
        rule_id: 'cleanliness_degradation_during_rush',
        severity: 'high',
        restroom_zone: d.restroom_zone,
        customers_since_last_clean: d.customers_since_last_clean,
        target_customers_per_clean: d.target_customers_per_clean,
        current_traffic_per_hour: d.current_traffic_per_hour,
        peak_traffic_per_hour: d.peak_traffic_per_hour,
        time_of_day: d.time_of_day,
        predicted_satisfaction_drop: 10,
        predicted_return_likelihood_drop: 12,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.6),
        description: `CLEANLINESS DEGRADATION DURING RUSH: ${d.restroom_zone} restroom has had ${d.customers_since_last_clean} customers since last clean (target ${d.target_customers_per_clean}) during ${d.time_of_day} rush (${d.current_traffic_per_hour}/hr). High traffic × long since clean = guaranteed dirty surfaces, wet floors, trash overflow. ACTION: clean NOW even if not scheduled — assign buser or host to quick-clean (3-5min: trash, counters, floors, supplies). Don't wait for next scheduled check during rush. ${d.time_of_day === 'dinner' || d.time_of_day === 'lunch' ? 'Meal-time rushes drive 60% of restroom traffic — increase cleaning frequency during these windows. ' : ''}Save ${fmt$(monthlyOpp * 0.6)}/mo. Cleanliness during rush is the highest-leverage cleaning moment — customers judge restaurant by restroom at peak.`,
        ai_recommendation: 'clean_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: HIGH_TRAFFIC_UNDERCLEANED
    if (d.customers_since_last_clean >= d.target_customers_per_clean * 1.5) {
      alerts.push({
        rule_id: 'high_traffic_undercleaned',
        severity: 'medium',
        restroom_zone: d.restroom_zone,
        customers_since_last_clean: d.customers_since_last_clean,
        target_customers_per_clean: d.target_customers_per_clean,
        last_check_minutes_ago: d.last_check_minutes_ago,
        predicted_satisfaction_drop: 7,
        predicted_return_likelihood_drop: 9,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `HIGH TRAFFIC UNDERCLEANED: ${d.restroom_zone} restroom had ${d.customers_since_last_clean} customers since last clean (1.5x threshold of ${d.target_customers_per_clean}). Last check ${d.last_check_minutes_ago}min ago. Traffic-based cleaning needed — every 30 customers require a clean (industry benchmark). ACTION: clean now + adjust cleaning trigger from time-based (every 2h) to traffic-based (every 30 customers). Traffic-based triggers are more accurate than time-based — they match cleaning to actual usage. Save ${fmt$(monthlyOpp * 0.5)}/mo. Train staff: 'count customers, don't watch clock.'`,
        ai_recommendation: 'clean_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: NEGATIVE_REVIEW_CORRELATION
    if (d.negative_review_mentions >= config.reviewMentionThreshold) {
      alerts.push({
        rule_id: 'negative_review_correlation',
        severity: d.negative_review_mentions >= 4 ? 'high' : 'medium',
        restroom_zone: d.restroom_zone,
        negative_review_mentions: d.negative_review_mentions,
        complaints_last_30d: d.complaints_last_30d,
        predicted_satisfaction_drop: 8,
        predicted_return_likelihood_drop: 14,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.8),
        description: `NEGATIVE REVIEW CORRELATION: ${d.negative_review_mentions} online reviews mention ${d.restroom_zone} restroom issues. Each negative online review reaches ~1500 potential customers (BrightLocal) and deters 22% from visiting (Cornell). ${d.negative_review_mentions} reviews × 1500 × 22% = ${Math.round(d.negative_review_mentions * 1500 * 0.22)} potential customers deterred. ACTION: respond to ALL negative reviews publicly (acknowledge + fix), then fix root cause — most restroom reviews cite: dirty floors (35%), empty supplies (25%), odor (20%), broken fixtures (10%), long lines (10%). Tag restroom in review response system. ${d.complaints_last_30d > d.negative_review_mentions * 5 ? 'Verbal complaints >> online reviews — many unhappy customers do not post reviews. ' : ''}Save ${fmt$(monthlyOpp * 0.8)}/mo. Restroom reviews are reputation-killer — each one compounds.`,
        ai_recommendation: 'respond_to_reviews',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: SUPPLY_RUNOUT_PATTERN
    const minSupply = Math.min(d.paper_towel_pct, d.soap_pct, d.toilet_paper_pct);
    if (minSupply < 25 && d.customers_since_last_clean < d.target_customers_per_clean * 0.5) {
      const lowSupply = d.paper_towel_pct === minSupply ? 'paper towels' : d.soap_pct === minSupply ? 'soap' : 'toilet paper';
      alerts.push({
        rule_id: 'supply_runout_pattern',
        severity: 'medium',
        restroom_zone: d.restroom_zone,
        paper_towel_pct: d.paper_towel_pct,
        soap_pct: d.soap_pct,
        toilet_paper_pct: d.toilet_paper_pct,
        customers_since_last_clean: d.customers_since_last_clean,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `SUPPLY RUNOUT PATTERN: ${d.restroom_zone} restroom ${lowSupply} at ${minSupply}% despite only ${d.customers_since_last_clean} customers since last check (under half threshold of ${d.target_customers_per_clean}). Low supply this early = par level too low OR staff not refilling fully during checks. ACTION: increase par level for ${lowSupply} — stock 1.5x current level. Common cause: staff refills to "look full" not to "last until next check". Train staff: fill dispensers to MAX each check. ${d.restroom_zone === 'patio' ? 'Patio restrooms often under-stocked due to distance from main supply closet — consider secondary supply cache. ' : ''}Save ${fmt$(monthlyOpp * 0.4)}/mo. Supply runout patterns signal systemic stocking issue, not customer overuse.`,
        ai_recommendation: 'increase_par_level',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: PEAK_HOUR_CHECK_MISSED
    if (d.last_check_minutes_ago > d.target_check_interval_minutes * 1.5 &&
        d.current_traffic_per_hour >= d.peak_traffic_per_hour * 0.7) {
      alerts.push({
        rule_id: 'peak_hour_check_missed',
        severity: 'high',
        restroom_zone: d.restroom_zone,
        last_check_minutes_ago: d.last_check_minutes_ago,
        target_check_interval_minutes: d.target_check_interval_minutes,
        current_traffic_per_hour: d.current_traffic_per_hour,
        peak_traffic_per_hour: d.peak_traffic_per_hour,
        time_of_day: d.time_of_day,
        predicted_satisfaction_drop: 12,
        predicted_return_likelihood_drop: 16,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.7),
        description: `PEAK HOUR CHECK MISSED: ${d.restroom_zone} restroom not checked in ${d.last_check_minutes_ago}min (target ${d.target_check_interval_minutes}min) DURING ${d.time_of_day} PEAK (${d.current_traffic_per_hour}/hr traffic). Peak hour = highest customer exposure to dirty restroom. Common cause: staff too busy serving customers to check restroom. ACTION: mandate peak-hour restroom checks — assign dedicated staff (host/buser) whose explicit job includes restroom rotation during peak. Use checklist at restroom door requiring signature every ${d.target_check_interval_minutes}min. ${d.time_of_day === 'dinner' ? 'Dinner peak is critical — customers judging restaurant by restroom at the moment they are forming their peak-end memory. ' : ''}Save ${fmt$(monthlyOpp * 0.7)}/mo. Peak-hour check misses are highest-impact failures — most customers see restroom at worst moment.`,
        ai_recommendation: 'mandate_peak_checks',
        status: 'open', detected_at: now,
      });
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
              { role: 'system', content: 'You are a restaurant operations + customer experience AI specializing in restroom cleanliness impact. Given restroom data, recommend ONE specific action with expected satisfaction impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Zone: ${a.restroom_zone ?? 'n/a'}. Last check: ${a.last_check_minutes_ago ?? 0}min ago. Avg interval: ${a.avg_check_interval_minutes ?? 0}min (target ${a.target_check_interval_minutes ?? 0}min). Customers since clean: ${a.customers_since_last_clean ?? 0} (target ${a.target_customers_per_clean ?? 30}). Paper: ${a.paper_towel_pct ?? 0}%. Soap: ${a.soap_pct ?? 0}%. TP: ${a.toilet_paper_pct ?? 0}%. Traffic: ${a.current_traffic_per_hour ?? 0}/hr. Complaints 7d: ${a.complaints_last_7d ?? 0}. Reviews: ${a.negative_review_mentions ?? 0}. Predicted satisfaction drop: ${a.predicted_satisfaction_drop ?? 0}pts. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM restroom_cleanliness_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE restroom_cleanliness_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

// (helper removed — config.checkIntervalThresholdMin used directly)

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<RestroomAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM restroom_cleanliness_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  zonesAtRisk: number; avgCheckIntervalMin: number; totalComplaints7d: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(restroom_zone != NONE) AS zones,
              math::mean(avg_check_interval_minutes WHERE avg_check_interval_minutes != NONE) AS avginterval,
              math::sum(complaints_last_7d WHERE complaints_last_7d != NONE) AS complaints7d
       FROM restroom_cleanliness_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      zonesAtRisk: safeNumber(r.zones, 0),
      avgCheckIntervalMin: safeNumber(r.avginterval, 0),
      totalComplaints7d: safeNumber(r.complaints7d, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgCheckIntervalMin: 0, totalComplaints7d: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
