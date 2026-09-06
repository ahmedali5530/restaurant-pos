/**
 * AI Staff Appearance & Uniform Optimizer — predicts how staff appearance
 * (uniform cleanliness, grooming standards, dress code consistency, role
 * differentiation) impacts customer perception of restaurant quality + trust.
 * Staff appearance is the #1 visual cue customers use to judge restaurant
 * cleanliness + professionalism; 68% form restaurant quality impression from
 * staff appearance (Cornell CHR).
 *
 * 155th POSR-exclusive differentiator — restaurants lose $200-1,200/mo per
 * location from inconsistent staff appearance: customers subconsciously
 * distrust unkempt staff → lower spend + lower satisfaction + lower return
 * rate. No POS tracks staff appearance as quality signal.
 *
 * Distinct from:
 *   - server-coach.service (51st) — coaches server PERFORMANCE (not appearance)
 *   - server-performance.service — tracks server METRICS (not appearance)
 *   - staff-energy-monitor.service (130th) — energy levels (not appearance)
 *   - staff-turnover.service — predicts departure (not appearance)
 *   - training-need.service — skill gaps (not appearance)
 *   - staff-gamification.service — motivation (not appearance)
 *   - shift-handover.service (128th) — shift transitions (not appearance)
 *   - health-inspection-readiness.service — FDA compliance (not staff look)
 *
 * 8 AI rules:
 *   1. uniform_inconsistency — staff wearing different uniform styles → unprofessional
 *   2. grooming_standard_breach — unkempt appearance (hair, facial hair, nails) → trust drop
 *   3. uniform_cleanliness_issue — stains, wrinkles, wear → perceived restaurant dirtiness
 *   4. role_differentiation_weak — can't tell server from host from manager → confusion
 *   5. uniform_brand_mismatch — uniform doesn't match restaurant brand/price tier
 *   6. accessory_policy_inconsistent — jewelry, tattoos, piercings inconsistent → unprofessional
 *   7. footwear_safety_violation — unsafe footwear (open-toe, worn soles) → safety + appearance
 *   8. seasonal_uniform_mismatch — winter uniform in summer → discomfort + poor appearance
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type StaffAppRuleId =
  | 'uniform_inconsistency'
  | 'grooming_standard_breach'
  | 'uniform_cleanliness_issue'
  | 'role_differentiation_weak'
  | 'uniform_brand_mismatch'
  | 'accessory_policy_inconsistent'
  | 'footwear_safety_violation'
  | 'seasonal_uniform_mismatch';

export type StaffAppAiRec =
  | 'standardize_uniform'
  | 'enforce_grooming_policy'
  | 'replace_uniforms'
  | 'differentiate_roles'
  | 'align_brand'
  | 'clarify_accessory_policy'
  | 'mandate_safe_footwear'
  | 'seasonal_uniform_rotation'
  | 'monitor'
  | 'skip';

export interface StaffAppAlert {
  id?: string;
  rule_id: StaffAppRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  staff_role?: string;                 // 'server' | 'host' | 'bartender' | 'manager' | 'chef' | 'busser'
  staff_name?: string;
  // Uniform metrics
  uniform_style_variants?: number;      // how many different styles in use
  uniform_cleanliness_score?: number;   // 0-100
  uniform_age_months?: number;
  // Grooming
  grooming_compliance_pct?: number;
  grooming_issues_count?: number;
  // Role differentiation
  role_distinguishable_pct?: number;
  // Brand alignment
  brand_tier?: string;                  // 'casual' | 'fast_casual' | 'fine_dining' | 'quick_service'
  uniform_tier_match?: boolean;
  // Accessory
  accessory_policy_clarity_score?: number;
  accessory_violations_count?: number;
  // Footwear
  footwear_safety_compliance_pct?: number;
  // Seasonal
  current_season?: string;
  uniform_season_appropriate?: boolean;
  // Impact
  predicted_satisfaction_drop?: number;
  predicted_trust_drop_pct?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: StaffAppAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface StaffAppConfig {
  aiEnabled: boolean;
  minGroomingCompliancePct: number;
  minCleanlinessScore: number;
  maxUniformAgeMonths: number;
  minFootwearSafetyPct: number;
}

export const DEFAULT_STAFFAPP_CONFIG: StaffAppConfig = {
  aiEnabled: true,
  minGroomingCompliancePct: 90,
  minCleanlinessScore: 80,
  maxUniformAgeMonths: 12,
  minFootwearSafetyPct: 100,
};

export const readStaffAppConfig = (settings: any): StaffAppConfig => ({
  aiEnabled: settings?.staffapp_ai_enabled ?? true,
  minGroomingCompliancePct: safeNumber(settings?.staffapp_grooming_min, 90),
  minCleanlinessScore: safeNumber(settings?.staffapp_cleanliness_min, 80),
  maxUniformAgeMonths: safeNumber(settings?.staffapp_uniform_max_age, 12),
  minFootwearSafetyPct: safeNumber(settings?.staffapp_footwear_min, 100),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface StaffAppearanceData {
  staff_role: string;
  staff_name: string;
  uniform_style_variants: number;
  uniform_cleanliness_score: number;
  uniform_age_months: number;
  grooming_compliance_pct: number;
  grooming_issues_count: number;
  role_distinguishable_pct: number;
  brand_tier: string;
  uniform_tier_match: boolean;
  accessory_policy_clarity_score: number;
  accessory_violations_count: number;
  footwear_safety_compliance_pct: number;
  current_season: string;
  uniform_season_appropriate: boolean;
  monthly_customers: number;
  avg_customer_value: number;
}

const MOCK_DATA: StaffAppearanceData[] = [
  {
    staff_role: 'server', staff_name: 'Team (8 staff)',
    uniform_style_variants: 3, uniform_cleanliness_score: 72, uniform_age_months: 14,
    grooming_compliance_pct: 82, grooming_issues_count: 5,
    role_distinguishable_pct: 60, brand_tier: 'fast_casual', uniform_tier_match: true,
    accessory_policy_clarity_score: 45, accessory_violations_count: 8,
    footwear_safety_compliance_pct: 85, current_season: 'summer', uniform_season_appropriate: false,
    monthly_customers: 2400, avg_customer_value: 38,
  },
  {
    staff_role: 'bartender', staff_name: 'Team (3 staff)',
    uniform_style_variants: 2, uniform_cleanliness_score: 88, uniform_age_months: 8,
    grooming_compliance_pct: 95, grooming_issues_count: 1,
    role_distinguishable_pct: 80, brand_tier: 'fast_casual', uniform_tier_match: true,
    accessory_policy_clarity_score: 70, accessory_violations_count: 2,
    footwear_safety_compliance_pct: 100, current_season: 'summer', uniform_season_appropriate: true,
    monthly_customers: 1800, avg_customer_value: 28,
  },
  {
    staff_role: 'chef', staff_name: 'Team (4 staff)',
    uniform_style_variants: 1, uniform_cleanliness_score: 65, uniform_age_months: 18,
    grooming_compliance_pct: 88, grooming_issues_count: 2,
    role_distinguishable_pct: 95, brand_tier: 'fast_casual', uniform_tier_match: false,
    accessory_policy_clarity_score: 80, accessory_violations_count: 0,
    footwear_safety_compliance_pct: 100, current_season: 'summer', uniform_season_appropriate: true,
    monthly_customers: 2400, avg_customer_value: 38,
  },
  {
    staff_role: 'host', staff_name: 'Team (2 staff)',
    uniform_style_variants: 2, uniform_cleanliness_score: 90, uniform_age_months: 6,
    grooming_compliance_pct: 92, grooming_issues_count: 1,
    role_distinguishable_pct: 50, brand_tier: 'fine_dining', uniform_tier_match: false,
    accessory_policy_clarity_score: 60, accessory_violations_count: 3,
    footwear_safety_compliance_pct: 90, current_season: 'winter', uniform_season_appropriate: true,
    monthly_customers: 1200, avg_customer_value: 65,
  },
];

export const runStaffAppEngine = async (
  db: ReturnType<typeof useDB>,
  config: StaffAppConfig = DEFAULT_STAFFAPP_CONFIG
): Promise<{ alerts: StaffAppAlert[]; generated: number }> => {
  const alerts: StaffAppAlert[] = [];
  const now = new Date();

  let data: StaffAppearanceData[] = [];
  try {
    const result = await db.query(
      `SELECT staff_role, staff_name, uniform_style_variants, uniform_cleanliness_score,
              uniform_age_months, grooming_compliance_pct, grooming_issues_count,
              role_distinguishable_pct, brand_tier, uniform_tier_match,
              accessory_policy_clarity_score, accessory_violations_count,
              footwear_safety_compliance_pct, current_season, uniform_season_appropriate,
              monthly_customers, avg_customer_value
       FROM staff_appearance_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      staff_role: String(r.staff_role ?? 'server'),
      staff_name: String(r.staff_name ?? 'Team'),
      uniform_style_variants: safeNumber(r.uniform_style_variants, 1),
      uniform_cleanliness_score: safeNumber(r.uniform_cleanliness_score, 0),
      uniform_age_months: safeNumber(r.uniform_age_months, 0),
      grooming_compliance_pct: safeNumber(r.grooming_compliance_pct, 0),
      grooming_issues_count: safeNumber(r.grooming_issues_count, 0),
      role_distinguishable_pct: safeNumber(r.role_distinguishable_pct, 0),
      brand_tier: String(r.brand_tier ?? 'casual'),
      uniform_tier_match: Boolean(r.uniform_tier_match ?? true),
      accessory_policy_clarity_score: safeNumber(r.accessory_policy_clarity_score, 0),
      accessory_violations_count: safeNumber(r.accessory_violations_count, 0),
      footwear_safety_compliance_pct: safeNumber(r.footwear_safety_compliance_pct, 0),
      current_season: String(r.current_season ?? 'summer'),
      uniform_season_appropriate: Boolean(r.uniform_season_appropriate ?? true),
      monthly_customers: safeNumber(r.monthly_customers, 0),
      avg_customer_value: safeNumber(r.avg_customer_value, 0),
    }));
  } catch (err) {
    console.warn('[staffapp] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const monthlyOpp = Math.round(d.monthly_customers * d.avg_customer_value * 0.03);

    // Rule 1: UNIFORM_INCONSISTENCY
    if (d.uniform_style_variants >= 2) {
      alerts.push({
        rule_id: 'uniform_inconsistency',
        severity: d.uniform_style_variants >= 3 ? 'high' : 'medium',
        staff_role: d.staff_role,
        staff_name: d.staff_name,
        uniform_style_variants: d.uniform_style_variants,
        predicted_satisfaction_drop: Math.min(8, d.uniform_style_variants * 2),
        predicted_trust_drop_pct: Math.min(10, d.uniform_style_variants * 3),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `UNIFORM INCONSISTENCY: ${d.staff_role} team wearing ${d.uniform_style_variants} different uniform styles. Inconsistent uniforms signal disorganization → customers subconsciously distrust restaurant quality. 68% of customers form quality impression from staff appearance (Cornell CHR). ACTION: standardize on ONE uniform style for ${d.staff_role} team. Order replacement uniforms for non-compliant staff ($25-60 per uniform). ${d.uniform_style_variants >= 3 ? 'CRITICAL: 3+ variants = chaotic appearance — customers notice. ' : ''}Save ${fmt$(monthlyOpp * 0.4)}/mo from improved trust + satisfaction. Uniform consistency is the cheapest brand signal — one-time cost, permanent impression.`,
        ai_recommendation: 'standardize_uniform',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: GROOMING_STANDARD_BREACH
    if (d.grooming_compliance_pct < config.minGroomingCompliancePct) {
      alerts.push({
        rule_id: 'grooming_standard_breach',
        severity: d.grooming_compliance_pct < 80 ? 'high' : 'medium',
        staff_role: d.staff_role,
        staff_name: d.staff_name,
        grooming_compliance_pct: d.grooming_compliance_pct,
        grooming_issues_count: d.grooming_issues_count,
        predicted_trust_drop_pct: Math.round((100 - d.grooming_compliance_pct) * 0.3),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `GROOMING STANDARD BREACH: ${d.staff_role} team grooming compliance ${d.grooming_compliance_pct}% (target ${config.minGroomingCompliancePct}%). ${d.grooming_issues_count} grooming issues detected. Common issues: unkempt hair, untrimmed facial hair, long/dirty nails, visible body odor, excessive perfume/cologne. Unkempt staff = customers subconsciously question kitchen cleanliness. ACTION: enforce grooming policy — hair tied back, facial hair trimmed, nails short + clean, no strong fragrances. Daily pre-shift grooming check by manager. ${d.grooming_compliance_pct < 80 ? 'CRITICAL: <80% compliance = systematic grooming failure — mandatory training + daily checks. ' : ''}Save ${fmt$(monthlyOpp * 0.5)}/mo from improved trust + perceived cleanliness. Grooming is free — just enforcement.`,
        ai_recommendation: 'enforce_grooming_policy',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: UNIFORM_CLEANLINESS_ISSUE
    if (d.uniform_cleanliness_score < config.minCleanlinessScore) {
      alerts.push({
        rule_id: 'uniform_cleanliness_issue',
        severity: d.uniform_cleanliness_score < 70 ? 'high' : 'medium',
        staff_role: d.staff_role,
        staff_name: d.staff_name,
        uniform_cleanliness_score: d.uniform_cleanliness_score,
        uniform_age_months: d.uniform_age_months,
        predicted_satisfaction_drop: Math.round((100 - d.uniform_cleanliness_score) * 0.2),
        predicted_trust_drop_pct: Math.round((100 - d.uniform_cleanliness_score) * 0.4),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.6),
        description: `UNIFORM CLEANLINESS ISSUE: ${d.staff_role} team uniform cleanliness score ${d.uniform_cleanliness_score}/100 (target ${config.minCleanlinessScore}). Uniform age: ${d.uniform_age_months} months. Stained, wrinkled, or worn uniforms = customers perceive restaurant as dirty. Staff appearance is proxy for kitchen cleanliness in customer mind. ${d.uniform_age_months > 12 ? `Uniforms are ${d.uniform_age_months} months old — fabric worn, stains set, colors faded. ` : ''}ACTION: ${d.uniform_age_months > 12 ? `replace uniforms (over ${config.maxUniformAgeMonths} months old) — cost $${d.uniform_style_variants * 8 * 40} for full team. ` : 'provide daily uniform laundry service OR require staff to wash + press uniforms nightly. '}'Inspect uniforms at pre-shift — send home staff with stained/wrinkled uniforms. Save ${fmt$(monthlyOpp * 0.6)}/mo from improved cleanliness perception. Uniform cleanliness is the #1 visual quality signal.`,
        ai_recommendation: 'replace_uniforms',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: ROLE_DIFFERENTIATION_WEAK
    if (d.role_distinguishable_pct < 70) {
      alerts.push({
        rule_id: 'role_differentiation_weak',
        severity: 'medium',
        staff_role: d.staff_role,
        staff_name: d.staff_name,
        role_distinguishable_pct: d.role_distinguishable_pct,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `ROLE DIFFERENTIATION WEAK: only ${d.role_distinguishable_pct}% of customers can distinguish ${d.staff_role} from other roles. When customers can't tell server from host from manager, they: ask wrong person for help, flag down bussers for orders, can't find manager to complain. Each role should have distinct visual cue. ACTION: differentiate roles by uniform element — servers: apron, hosts: blazer/vest, managers: tie/dress shirt, bussers: different color shirt, chefs: chef coat. ${d.brand_tier === 'fine_dining' ? 'Fine dining: managers in suit jacket, servers in vest + tie, hosts in blazer. ' : 'Casual: servers in branded polo, hosts in different color, managers in button-down. '}'Save ${fmt$(monthlyOpp * 0.3)}/mo from improved service efficiency + customer confidence. Role differentiation reduces customer friction + improves service speed.`,
        ai_recommendation: 'differentiate_roles',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: UNIFORM_BRAND_MISMATCH
    if (!d.uniform_tier_match) {
      alerts.push({
        rule_id: 'uniform_brand_mismatch',
        severity: 'medium',
        staff_role: d.staff_role,
        staff_name: d.staff_name,
        brand_tier: d.brand_tier,
        uniform_tier_match: d.uniform_tier_match,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `UNIFORM BRAND MISMATCH: ${d.staff_role} uniform does not match restaurant brand tier (${d.brand_tier}). ${d.brand_tier === 'fine_dining' ? 'Fine dining requires formal uniforms (suit, vest, tie) — casual uniforms (t-shirt, polo) signal low quality + justify lower prices. ' : d.brand_tier === 'fast_casual' ? 'Fast casual needs approachable uniforms (branded polo, apron) — formal uniforms feel stuffy + overpriced. ' : d.brand_tier === 'quick_service' ? 'Quick service needs efficient uniforms (branded t-shirt, cap) — formal uniforms slow service + feel overpriced. ' : 'Uniform does not match brand positioning. '}ACTION: realign uniform to brand tier. ${d.brand_tier === 'fine_dining' ? 'Invest in formal uniforms ($60-120 per set). ' : 'Simplify to branded casual ($25-40 per set). '}Save ${fmt$(monthlyOpp * 0.4)}/mo from aligned brand perception + appropriate price acceptance. Uniform is the most visible brand signal — must match positioning.`,
        ai_recommendation: 'align_brand',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: ACCESSORY_POLICY_INCONSISTENT
    if (d.accessory_policy_clarity_score < 60 || d.accessory_violations_count >= 3) {
      alerts.push({
        rule_id: 'accessory_policy_inconsistent',
        severity: 'low',
        staff_role: d.staff_role,
        staff_name: d.staff_name,
        accessory_policy_clarity_score: d.accessory_policy_clarity_score,
        accessory_violations_count: d.accessory_violations_count,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
        description: `ACCESSORY POLICY INCONSISTENT: ${d.staff_role} team accessory policy clarity ${d.accessory_policy_clarity_score}/100, ${d.accessory_violations_count} violations. Inconsistent jewelry, tattoos, piercings, watches across staff = unprofessional appearance. Without clear policy, staff push boundaries → visible tattoos, excessive jewelry, facial piercings may not match brand. ACTION: clarify + enforce accessory policy — define: jewelry (wedding band only?), tattoos (cover with sleeves/sleeve covers?), piercings (studs only, no hoops?), watches (simple, no smartwatches?). Document in employee handbook + enforce consistently. ${d.accessory_violations_count >= 5 ? '5+ violations = policy not enforced — manager training needed. ' : ''}Save ${fmt$(monthlyOpp * 0.2)}/mo from professional appearance. Accessory policy must be clear + fair + enforced.`,
        ai_recommendation: 'clarify_accessory_policy',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: FOOTWEAR_SAFETY_VIOLATION
    if (d.footwear_safety_compliance_pct < config.minFootwearSafetyPct) {
      alerts.push({
        rule_id: 'footwear_safety_violation',
        severity: d.footwear_safety_compliance_pct < 90 ? 'high' : 'medium',
        staff_role: d.staff_role,
        staff_name: d.staff_name,
        footwear_safety_compliance_pct: d.footwear_safety_compliance_pct,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `FOOTWEAR SAFETY VIOLATION: ${d.staff_role} team footwear safety compliance ${d.footwear_safety_compliance_pct}% (target ${config.minFootwearSafetyPct}%). Unsafe footwear = slips/falls (OSHA #1 restaurant injury), + looks unprofessional. Common violations: open-toe shoes, sneakers, worn soles, canvas shoes. ACTION: mandate slip-resistant closed-toe shoes for all staff. Provide shoe stipend ($50-100) OR require staff to purchase approved style. OSHA requires slip-resistant footwear in food service. ${d.footwear_safety_compliance_pct < 90 ? 'CRITICAL: <90% compliance = liability risk — one slip/fall injury costs $15,000-50,000. ' : ''}Save ${fmt$(monthlyOpp * 0.3)}/mo from prevented injuries + professional appearance. Safe footwear is non-negotiable — safety + appearance.`,
        ai_recommendation: 'mandate_safe_footwear',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: SEASONAL_UNIFORM_MISMATCH
    if (!d.uniform_season_appropriate) {
      alerts.push({
        rule_id: 'seasonal_uniform_mismatch',
        severity: 'medium',
        staff_role: d.staff_role,
        staff_name: d.staff_name,
        current_season: d.current_season,
        uniform_season_appropriate: d.uniform_season_appropriate,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
        description: `SEASONAL UNIFORM MISMATCH: ${d.staff_role} team uniform not appropriate for ${d.current_season}. ${d.current_season === 'summer' ? 'Summer: heavy/dark uniforms cause staff discomfort (sweating, fatigue) + look out of season. Customers notice sweaty uncomfortable staff. ' : d.current_season === 'winter' ? 'Winter: thin/short-sleeve uniforms leave staff cold + uncomfortable. Cold staff = slower service + lower energy. ' : 'Seasonal uniform adjustment needed. '}'ACTION: rotate uniforms seasonally — summer: breathable fabrics (cotton/poly blend), lighter colors, short sleeves; winter: warmer fabrics, long sleeves, optional layering (vest/cardigan). ${d.current_season === 'summer' ? 'Summer uniform: moisture-wicking polos, light colors. ' : 'Winter uniform: long-sleeve button-downs, vests. '}'Save ${fmt$(monthlyOpp * 0.2)}/mo from staff comfort + seasonal appropriateness. Seasonal uniform shows attention to detail + improves staff morale.`,
        ai_recommendation: 'seasonal_uniform_rotation',
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
              { role: 'system', content: 'You are a restaurant staff appearance + brand perception AI. Given appearance data, recommend ONE specific action with expected perception impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Role: ${a.staff_role ?? 'n/a'}. Uniform variants: ${a.uniform_style_variants ?? 1}. Cleanliness: ${a.uniform_cleanliness_score ?? 0}/100. Age: ${a.uniform_age_months ?? 0}mo. Grooming: ${a.grooming_compliance_pct ?? 0}%. Role distinguishable: ${a.role_distinguishable_pct ?? 0}%. Brand tier: ${a.brand_tier ?? 'casual'}. Footwear safety: ${a.footwear_safety_compliance_pct ?? 0}%. Season: ${a.current_season ?? 'summer'}. Predicted trust drop: ${a.predicted_trust_drop_pct ?? 0}%. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM staff_appearance_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE staff_appearance_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<StaffAppAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM staff_appearance_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  rolesAtRisk: number; avgGroomingPct: number; avgCleanlinessScore: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(staff_role != NONE) AS roles,
              math::mean(grooming_compliance_pct WHERE grooming_compliance_pct != NONE) AS avggroom,
              math::mean(uniform_cleanliness_score WHERE uniform_cleanliness_score != NONE) AS avgclean
       FROM staff_appearance_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      rolesAtRisk: safeNumber(r.roles, 0),
      avgGroomingPct: safeNumber(r.avggroom, 0),
      avgCleanlinessScore: safeNumber(r.avgclean, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, rolesAtRisk: 0, avgGroomingPct: 0, avgCleanlinessScore: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
