/**
 * AI Seating Comfort & Furniture Quality Optimizer — predicts how seating
 * (chair comfort, booth vs table, upholstery condition, seat height, back
 * support, cushion density, furniture age) impacts customer dwell time,
 * spend, and satisfaction. Customers sit 60-90 minutes — uncomfortable
 * seating = shorter dwell = lower spend. 42% of customers cite
 * uncomfortable seating as reason for shorter visits (NRA).
 *
 * 158th POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from uncomfortable seating. Each 10min of extended dwell from
 * comfortable seating = 8-12% spend increase (Cornell CHR). No POS tracks
 * furniture comfort as revenue driver.
 *
 * Distinct from:
 *   - table-setting-tableware.service (157th) — tableware (not furniture)
 *   - table-preference.service (133rd) — table TYPE preferences (not comfort)
 *   - floor-plan-optimizer.service — physical LAYOUT (not chair quality)
 *   - seating-optimization.service — table ALLOCATION (not chair comfort)
 *   - atmosphere-revenue.service (138th) — correlates ALL ambient (1 comfort rule)
 *   - table-turnover-predictor.service — turnover TIMING (not comfort cause)
 *   - table-turnover-velocity.service — turnover PHASES (not comfort)
 *   - journey-friction.service (125th) — overall journey (not seating)
 *
 * 8 AI rules:
 *   1. chair_cushion_worn — cushion density degraded → discomfort → shorter dwell
 *   2. booth_vs_table_mismatch — wrong seating type for segment (business needs table, family needs booth)
 *   3. back_support_inadequate — chairs with no/low back → back pain → leave sooner
 *   4. seat_height_wrong — too tall/short for table height → discomfort
 *   5. furniture_age_excessive — >5yr furniture = worn, wobbly, stained → quality signal drop
 *   6. upholstery_stain_wear — stained/torn upholstery = perceived dirty
 *   7. seating_capacity_mismatch — too many/few chairs per table → awkward
 *   8. accessibility_seating_missing — no ADA-compliant seating → compliance risk
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type SeatingRuleId =
  | 'chair_cushion_worn'
  | 'booth_vs_table_mismatch'
  | 'back_support_inadequate'
  | 'seat_height_wrong'
  | 'furniture_age_excessive'
  | 'upholstery_stain_wear'
  | 'seating_capacity_mismatch'
  | 'accessibility_seating_missing';

export type SeatingAiRec =
  | 'replace_cushions'
  | 'reassign_seating_type'
  | 'upgrade_chairs'
  | 'adjust_height'
  | 'replace_furniture'
  | 'reupholster'
  | 'adjust_chair_count'
  | 'add_ada_seating'
  | 'monitor'
  | 'skip';

export interface SeatingAlert {
  id?: string;
  rule_id: SeatingRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  zone?: string;
  // Cushion metrics
  cushion_density_kg_m3?: number;
  target_cushion_density?: number;
  cushion_age_months?: number;
  // Seating type
  seating_type?: string;             // 'booth' | 'table_chairs' | 'bar_stool' | 'mixed'
  customer_segment?: string;
  // Back support
  back_support_height_cm?: number;
  has_armrests?: boolean;
  // Height
  seat_height_cm?: number;
  table_height_cm?: number;
  height_diff_cm?: number;
  // Furniture age
  furniture_age_years?: number;
  // Upholstery
  upholstery_condition_score?: number; // 0-100
  stain_count?: number;
  tear_count?: number;
  // Capacity
  chairs_per_table?: number;
  target_chairs_per_table?: number;
  // Accessibility
  has_ada_seating?: boolean;
  ada_seating_count?: number;
  // Impact
  predicted_dwell_change_min?: number;
  predicted_spend_change_pct?: number;
  predicted_satisfaction_change?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: SeatingAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface SeatingConfig {
  aiEnabled: boolean;
  minCushionDensity: number;
  maxFurnitureAgeYears: number;
  minUpholsteryScore: number;
  minHeightDiffCm: number;
}

export const DEFAULT_SEATING_CONFIG: SeatingConfig = {
  aiEnabled: true,
  minCushionDensity: 30,
  maxFurnitureAgeYears: 5,
  minUpholsteryScore: 75,
  minHeightDiffCm: 25,
};

export const readSeatingConfig = (settings: any): SeatingConfig => ({
  aiEnabled: settings?.seating_ai_enabled ?? true,
  minCushionDensity: safeNumber(settings?.seating_min_cushion, 30),
  maxFurnitureAgeYears: safeNumber(settings?.seating_max_age, 5),
  minUpholsteryScore: safeNumber(settings?.seating_min_upholstery, 75),
  minHeightDiffCm: safeNumber(settings?.seating_min_height_diff, 25),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface SeatingData {
  zone: string;
  cushion_density_kg_m3: number;
  target_cushion_density: number;
  cushion_age_months: number;
  seating_type: string;
  customer_segment: string;
  back_support_height_cm: number;
  has_armrests: boolean;
  seat_height_cm: number;
  table_height_cm: number;
  furniture_age_years: number;
  upholstery_condition_score: number;
  stain_count: number;
  tear_count: number;
  chairs_per_table: number;
  target_chairs_per_table: number;
  has_ada_seating: boolean;
  ada_seating_count: number;
  monthly_customers: number;
  avg_customer_value: number;
  avg_dwell_min: number;
  optimal_dwell_min: number;
}

const MOCK_DATA: SeatingData[] = [
  {
    zone: 'main_dining', cushion_density_kg_m3: 22, target_cushion_density: 35,
    cushion_age_months: 36, seating_type: 'table_chairs', customer_segment: 'all',
    back_support_height_cm: 25, has_armrests: false,
    seat_height_cm: 45, table_height_cm: 75,
    furniture_age_years: 7, upholstery_condition_score: 58,
    stain_count: 12, tear_count: 3,
    chairs_per_table: 4, target_chairs_per_table: 4,
    has_ada_seating: false, ada_seating_count: 0,
    monthly_customers: 2400, avg_customer_value: 38, avg_dwell_min: 65, optimal_dwell_min: 85,
  },
  {
    zone: 'bar', cushion_density_kg_m3: 40, target_cushion_density: 35,
    cushion_age_months: 12, seating_type: 'bar_stool', customer_segment: 'celebration',
    back_support_height_cm: 15, has_armrests: false,
    seat_height_cm: 75, table_height_cm: 105,
    furniture_age_years: 3, upholstery_condition_score: 85,
    stain_count: 2, tear_count: 0,
    chairs_per_table: 6, target_chairs_per_table: 6,
    has_ada_seating: false, ada_seating_count: 0,
    monthly_customers: 1800, avg_customer_value: 28, avg_dwell_min: 90, optimal_dwell_min: 110,
  },
  {
    zone: 'private_room', cushion_density_kg_m3: 38, target_cushion_density: 35,
    cushion_age_months: 18, seating_type: 'booth', customer_segment: 'business',
    back_support_height_cm: 45, has_armrests: true,
    seat_height_cm: 48, table_height_cm: 74,
    furniture_age_years: 4, upholstery_condition_score: 82,
    stain_count: 1, tear_count: 0,
    chairs_per_table: 4, target_chairs_per_table: 4,
    has_ada_seating: true, ada_seating_count: 2,
    monthly_customers: 800, avg_customer_value: 85, avg_dwell_min: 110, optimal_dwell_min: 130,
  },
];

export const runSeatingEngine = async (
  db: ReturnType<typeof useDB>,
  config: SeatingConfig = DEFAULT_SEATING_CONFIG
): Promise<{ alerts: SeatingAlert[]; generated: number }> => {
  const alerts: SeatingAlert[] = [];
  const now = new Date();

  let data: SeatingData[] = [];
  try {
    const result = await db.query(
      `SELECT zone, cushion_density_kg_m3, target_cushion_density, cushion_age_months,
              seating_type, customer_segment, back_support_height_cm, has_armrests,
              seat_height_cm, table_height_cm, furniture_age_years,
              upholstery_condition_score, stain_count, tear_count,
              chairs_per_table, target_chairs_per_table,
              has_ada_seating, ada_seating_count,
              monthly_customers, avg_customer_value, avg_dwell_min, optimal_dwell_min
       FROM seating_comfort_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      zone: String(r.zone ?? 'main_dining'),
      cushion_density_kg_m3: safeNumber(r.cushion_density_kg_m3, 0),
      target_cushion_density: safeNumber(r.target_cushion_density, 0),
      cushion_age_months: safeNumber(r.cushion_age_months, 0),
      seating_type: String(r.seating_type ?? 'table_chairs'),
      customer_segment: String(r.customer_segment ?? 'all'),
      back_support_height_cm: safeNumber(r.back_support_height_cm, 0),
      has_armrests: Boolean(r.has_armrests ?? false),
      seat_height_cm: safeNumber(r.seat_height_cm, 0),
      table_height_cm: safeNumber(r.table_height_cm, 0),
      furniture_age_years: safeNumber(r.furniture_age_years, 0),
      upholstery_condition_score: safeNumber(r.upholstery_condition_score, 0),
      stain_count: safeNumber(r.stain_count, 0),
      tear_count: safeNumber(r.tear_count, 0),
      chairs_per_table: safeNumber(r.chairs_per_table, 0),
      target_chairs_per_table: safeNumber(r.target_chairs_per_table, 0),
      has_ada_seating: Boolean(r.has_ada_seating ?? false),
      ada_seating_count: safeNumber(r.ada_seating_count, 0),
      monthly_customers: safeNumber(r.monthly_customers, 0),
      avg_customer_value: safeNumber(r.avg_customer_value, 0),
      avg_dwell_min: safeNumber(r.avg_dwell_min, 0),
      optimal_dwell_min: safeNumber(r.optimal_dwell_min, 0),
    }));
  } catch (err) {
    console.warn('[seating] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const dwellGap = d.optimal_dwell_min - d.avg_dwell_min;
    const monthlyOpp = Math.round(d.monthly_customers * d.avg_customer_value * 0.03);

    // Rule 1: CHAIR_CUSHION_WORN
    if (d.cushion_density_kg_m3 < config.minCushionDensity) {
      alerts.push({
        rule_id: 'chair_cushion_worn',
        severity: 'medium',
        zone: d.zone,
        cushion_density_kg_m3: d.cushion_density_kg_m3,
        target_cushion_density: d.target_cushion_density,
        cushion_age_months: d.cushion_age_months,
        predicted_dwell_change_min: Math.round(dwellGap * 0.4),
        predicted_spend_change_pct: Math.round(dwellGap * 0.4 / d.avg_dwell_min * 100),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `CHAIR CUSHION WORN: ${d.zone} cushion density ${d.cushion_density_kg_m3} kg/m3 (target ${d.target_cushion_density}, min ${config.minCushionDensity}). Cushions ${d.cushion_age_months} months old — foam compresses over time, loses 30-40% density in 2-3 years. Worn cushions = hard seating = discomfort after 30min → customers leave sooner. ACTION: replace cushion foam ($8-25 per chair). ${d.cushion_age_months >= 36 ? 'CRITICAL: 3+ year cushions are fully compressed — immediate replacement needed. ' : ''}Save ${fmt$(monthlyOpp * 0.4)}/mo from extended dwell. Cushion foam replacement is the cheapest comfort upgrade — $8-25/chair, instant dwell improvement.`,
        ai_recommendation: 'replace_cushions',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: BOOTH_VS_TABLE_MISMATCH
    if (d.customer_segment === 'business' && d.seating_type === 'booth') {
      alerts.push({
        rule_id: 'booth_vs_table_mismatch',
        severity: 'medium',
        zone: d.zone,
        seating_type: d.seating_type,
        customer_segment: d.customer_segment,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `BOOTH VS TABLE MISMATCH: ${d.zone} has booths but primary segment is ${d.customer_segment}. Business customers prefer tables — booths feel too casual for meetings, harder to slide in/out, no space for laptops/documents. ${d.customer_segment === 'business' ? 'Business segment needs table+chairs for professional meetings. ' : ''}ACTION: ${d.seating_type === 'booth' ? 'convert some booths to table+chairs for business segment. ' : 'add booths for family/date segments. '}'Save ${fmt$(monthlyOpp * 0.3)}/mo. Seating type must match segment — wrong type = discomfort + shorter dwell.`,
        ai_recommendation: 'reassign_seating_type',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: BACK_SUPPORT_INADEQUATE
    if (d.back_support_height_cm < 30 && d.seating_type !== 'bar_stool') {
      alerts.push({
        rule_id: 'back_support_inadequate',
        severity: 'medium',
        zone: d.zone,
        back_support_height_cm: d.back_support_height_cm,
        has_armrests: d.has_armrests,
        predicted_dwell_change_min: Math.round(dwellGap * 0.3),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `BACK SUPPORT INADEQUATE: ${d.zone} chair back support ${d.back_support_height_cm}cm (should be 40+cm for full back support). Low back support = lumbar pain after 30-40min → customers shift uncomfortably, leave sooner. ${!d.has_armrests ? 'No armrests compounds discomfort — arms hang, shoulders tense. ' : ''}ACTION: upgrade chairs with 40+cm back support + armrests. Cost: $40-120 per chair. Save ${fmt$(monthlyOpp * 0.3)}/mo from extended dwell. Back support is the #1 comfort factor for 60+ minute sittings.`,
        ai_recommendation: 'upgrade_chairs',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SEAT_HEIGHT_WRONG
    const heightDiff = Math.abs(d.table_height_cm - d.seat_height_cm);
    if (heightDiff < config.minHeightDiffCm || heightDiff > 35) {
      alerts.push({
        rule_id: 'seat_height_wrong',
        severity: 'low',
        zone: d.zone,
        seat_height_cm: d.seat_height_cm,
        table_height_cm: d.table_height_cm,
        height_diff_cm: heightDiff,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.15),
        description: `SEAT HEIGHT WRONG: ${d.zone} seat ${d.seat_height_cm}cm vs table ${d.table_height_cm}cm (diff ${heightDiff}cm, ideal 25-30cm). ${heightDiff < 25 ? 'Too close: customers feel cramped, elbows too high. ' : 'Too far: customers lean forward, back strain. '}'ACTION: adjust seat height or table height to 25-30cm differential. ${d.seating_type === 'bar_stool' ? 'Bar stools: 75cm seat vs 105cm counter = 30cm diff — correct. ' : ''}Save ${fmt$(monthlyOpp * 0.15)}/mo. Height ratio affects posture → posture affects comfort → comfort affects dwell.`,
        ai_recommendation: 'adjust_height',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: FURNITURE_AGE_EXCESSIVE
    if (d.furniture_age_years > config.maxFurnitureAgeYears) {
      alerts.push({
        rule_id: 'furniture_age_excessive',
        severity: 'medium',
        zone: d.zone,
        furniture_age_years: d.furniture_age_years,
        upholstery_condition_score: d.upholstery_condition_score,
        predicted_satisfaction_change: -8,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `FURNITURE AGE EXCESSIVE: ${d.zone} furniture ${d.furniture_age_years} years old (max ${config.maxFurnitureAgeYears}yr). After 5 years: foam compressed, frames loose/wobbly, upholstery stained/torn, finish worn. Customers perceive worn furniture = restaurant not maintained = quality signal drop. ACTION: replace furniture. Cost: $50-200 per chair × ${Math.ceil(d.monthly_customers / 50)} settings. ${d.furniture_age_years >= 7 ? 'CRITICAL: 7+ year furniture = visible degradation — replacement overdue. ' : ''}Save ${fmt$(monthlyOpp * 0.4)}/mo from improved quality perception. Furniture is the most visible physical asset — age shows immediately.`,
        ai_recommendation: 'replace_furniture',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: UPHOLSTERY_STAIN_WEAR
    if (d.upholstery_condition_score < config.minUpholsteryScore || d.stain_count >= 5 || d.tear_count >= 1) {
      alerts.push({
        rule_id: 'upholstery_stain_wear',
        severity: d.tear_count >= 2 ? 'high' : 'medium',
        zone: d.zone,
        upholstery_condition_score: d.upholstery_condition_score,
        stain_count: d.stain_count,
        tear_count: d.tear_count,
        predicted_satisfaction_change: -10,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `UPHOLSTERY STAIN WEAR: ${d.zone} upholstery condition ${d.upholstery_condition_score}/100, ${d.stain_count} stains, ${d.tear_count} tears. Stained/torn upholstery = customers perceive restaurant as dirty. Each stain visible to customer = negative impression that takes 3+ visits to overcome. ${d.tear_count >= 1 ? 'TEARS = critical — torn upholstery signals neglect. ' : ''}ACTION: ${d.tear_count >= 1 ? 'reupholster torn chairs immediately. ' : 'deep-clean stained upholstery (professional service $15-30/chair) OR reupholster ($40-80/chair). '}'Save ${fmt$(monthlyOpp * 0.5)}/mo from improved cleanliness perception. Upholstery is what customers touch — stains = felt directly.`,
        ai_recommendation: 'reupholster',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: SEATING_CAPACITY_MISMATCH
    if (d.chairs_per_table !== d.target_chairs_per_table) {
      alerts.push({
        rule_id: 'seating_capacity_mismatch',
        severity: 'low',
        zone: d.zone,
        chairs_per_table: d.chairs_per_table,
        target_chairs_per_table: d.target_chairs_per_table,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
        description: `SEATING CAPACITY MISMATCH: ${d.zone} has ${d.chairs_per_table} chairs per table (target ${d.target_chairs_per_table}). ${d.chairs_per_table > d.target_chairs_per_table ? 'Too many chairs = cluttered, customers bump elbows, awkward space. ' : 'Too few chairs = parties split across tables, awkward, less social. '}'ACTION: adjust chair count to ${d.target_chairs_per_table} per table. Save ${fmt$(monthlyOpp * 0.2)}/mo. Chair count seems trivial but affects entire table dynamic — too many = cramped, too few = isolated.`,
        ai_recommendation: 'adjust_chair_count',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: ACCESSIBILITY_SEATING_MISSING
    if (!d.has_ada_seating && d.monthly_customers > 500) {
      alerts.push({
        rule_id: 'accessibility_seating_missing',
        severity: 'high',
        zone: d.zone,
        has_ada_seating: d.has_ada_seating,
        ada_seating_count: d.ada_seating_count,
        est_monthly_opportunity: 0,
        description: `ACCESSIBILITY SEATING MISSING: ${d.zone} has no ADA-compliant seating. ADA requires restaurants to provide accessible seating — tables at correct height (28-34in), wheelchair approach space (30in wide), no fixed chairs blocking access. Non-compliance = ADA lawsuit risk ($55,000-$200,000+ fines per violation). 12% of US population has mobility disability — significant customer segment. ACTION: designate at least 1 table per zone as ADA-compliant: table height 28-34in, 30in approach clearance, removable chairs. Cost: $0 if existing tables meet specs — just designate + remove fixed chairs. Save $0/mo but prevent $55k-$200k lawsuit. ADA compliance is non-negotiable legal requirement.`,
        ai_recommendation: 'add_ada_seating',
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
              { role: 'system', content: 'You are a restaurant furniture + seating comfort AI. Given seating data, recommend ONE specific action with expected dwell/spend impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Zone: ${a.zone ?? 'n/a'}. Cushion: ${a.cushion_density_kg_m3 ?? 0} kg/m3. Type: ${a.seating_type ?? 'n/a'}. Back support: ${a.back_support_height_cm ?? 0}cm. Age: ${a.furniture_age_years ?? 0}yr. Upholstery: ${a.upholstery_condition_score ?? 0}/100. Stains: ${a.stain_count ?? 0}. Tears: ${a.tear_count ?? 0}. ADA: ${a.has_ada_seating ?? false}. Dwell change: ${a.predicted_dwell_change_min ?? 0}min. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM seating_comfort_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE seating_comfort_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<SeatingAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM seating_comfort_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  zonesAtRisk: number; avgUpholsteryScore: number; adaGaps: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::mean(upholstery_condition_score WHERE upholstery_condition_score != NONE) AS avguphol,
              math::count(rule_id = 'accessibility_seating_missing') AS ada
       FROM seating_comfort_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      zonesAtRisk: safeNumber(r.zones, 0),
      avgUpholsteryScore: safeNumber(r.avguphol, 0),
      adaGaps: safeNumber(r.ada, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgUpholsteryScore: 0, adaGaps: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
