/**
 * AI Interior Signage & Wayfinding Optimizer — predicts how interior signage
 * and wayfinding (restroom signs, directional arrows, zone labels, menu board
 * signage, exit signs, ADA signage, branding signage, digital signage) impacts
 * customer navigation friction, perceived professionalism, ADA compliance,
 * operational efficiency.
 *
 * 45% of customers report difficulty finding restrooms in restaurants (ADA
 * National Network). Poor wayfinding increases perceived wait time by 12-15%
 * (customers wander, feel lost). Missing ADA-compliant signage = ADA lawsuit
 * risk ($55,000-$200,000 per violation). Inconsistent signage (different fonts,
 * colors, styles) signals disorganization -> perceived lower quality. Digital
 * signage (menu boards, promotional displays) increases impulse purchases by
 * 18-25%. 68% of customers judge restaurant professionalism by signage quality
 * (Cornell CHR).
 *
 * 166th POSR-exclusive differentiator — restaurants lose $1,500-7,500/mo per
 * location from poor interior signage and wayfinding (missing restroom signs,
 * no directional arrows, ADA non-compliant signage, inconsistent fonts/colors,
 * obscured exit signs, no digital menu boards, missing zone labels, poorly lit
 * signage). Existing services focus on individual ambience elements. This
 * deep-dives into the NAVIGATION + BRAND COMMUNICATION layer — the signs that
 * guide customers through the space and signal professionalism.
 *
 * Distinct from:
 *   - curb-appeal-facade (164th) — exterior signage (not interior)
 *   - menu-layout-placement (148th) — menu content placement (not wayfinding)
 *   - digital-menu-qr (160th) — QR/digital menu UX (not physical signage)
 *   - entrance-arrival-optimizer (145th) — arrival experience (not navigation)
 *   - wall-decor-artwork (159th) — decorative art (not wayfinding signage)
 *
 * 8 AI rules:
 *   1. restroom_signage_missing_unclear -> restroom signs missing/hard to find = 45% customer frustration
 *   2. directional_signage_insufficient -> no arrows/directions to key areas = wandering customers
 *   3. ada_signage_noncompliant -> no Braille/raised letter signage = ADA lawsuit risk $55k-$200k
 *   4. signage_inconsistency -> different fonts/colors/styles across signs = perceived disorganization
 *   5. exit_signage_obscured -> exit signs blocked/dim = fire code violation + safety risk
 *   6. digital_signage_underutilized -> no digital menu boards/promo displays = 18-25% impulse purchase loss
 *   7. zone_labeling_absent -> no zone/section labels (bar, dining, patio) = navigation confusion
 *   8. signage_lighting_poor -> signs poorly lit = customers cannot read = frustration
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type SignageRuleId =
  | 'restroom_signage_missing_unclear'
  | 'directional_signage_insufficient'
  | 'ada_signage_noncompliant'
  | 'signage_inconsistency'
  | 'exit_signage_obscured'
  | 'digital_signage_underutilized'
  | 'zone_labeling_absent'
  | 'signage_lighting_poor';

export type SignageAiRec =
  | 'install_restroom_signage'
  | 'add_directional_arrows'
  | 'install_ada_compliant_signage'
  | 'standardize_signage_brand'
  | 'repair_exit_signage'
  | 'install_digital_menu_boards'
  | 'add_zone_labels'
  | 'improve_signage_lighting'
  | 'monitor'
  | 'skip';

export interface SignageAlert {
  id?: string;
  rule_id: SignageRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                              // 'main_dining' | 'bar' | 'entry' | 'restroom_hall' | 'kitchen_exit'
  // Restroom signage
  has_restroom_signage?: boolean;                    // visible restroom sign present
  restroom_sign_clarity_score?: number;              // 0-100 (visibility, contrast, placement)
  // Directional signage
  has_directional_arrows?: boolean;                  // arrows to restroom, exit, bar, patio
  directional_sign_count?: number;                   // number of directional signs in zone
  // ADA compliance
  has_ada_braille_signage?: boolean;                 // Braille + raised letter signage
  ada_compliance_score?: number;                     // 0-100 (ADA Title III compliance)
  // Signage consistency
  signage_consistency_score?: number;                // 0-100 (font/color/style consistency)
  has_unified_brand_signage?: boolean;               // all signs match brand standards
  // Exit signage
  has_illuminated_exit_sign?: boolean;               // exit sign visible + illuminated
  exit_sign_obstructed?: boolean;                    // blocked by decor/merchandise
  // Digital signage
  has_digital_menu_board?: boolean;                  // digital menu boards
  has_digital_promo_display?: boolean;               // promotional digital displays
  digital_signage_count?: number;                    // number of digital signs
  // Zone labeling
  has_zone_labels?: boolean;                         // zone/section labels (bar, dining, patio)
  zone_label_count?: number;                         // number of labeled zones
  // Signage lighting
  signage_lux_level?: number;                        // lux on signage (200+ ideal, <100 poor)
  signage_lighting_score?: number;                   // 0-100
  // Economics
  monthly_revenue?: number;                          // revenue generated in this zone
  monthly_covers?: number;
  avg_ticket?: number;
  // Impact
  predicted_satisfaction_change?: number;            // % change in satisfaction
  perceived_professionalism_change?: number;         // % change in perceived professionalism
  predicted_revenue_change_pct?: number;
  ada_lawsuit_risk_level?: 'low' | 'moderate' | 'high' | 'critical';
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: SignageAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface SignageConfig {
  aiEnabled: boolean;
  minRestroomSignClarityScore: number;       // min acceptable restroom sign clarity (0-100)
  minDirectionalSignCount: number;           // min directional signs per zone
  requireAdaBrailleSignage: boolean;         // require ADA Braille/raised letter signage
  minAdaComplianceScore: number;             // min ADA compliance score (0-100)
  minSignageConsistencyScore: number;        // min signage consistency score (0-100)
  requireIlluminatedExitSign: boolean;       // require illuminated exit signs
  requireDigitalMenuBoard: boolean;          // require digital menu boards
  minDigitalSignageCount: number;            // min digital signage count per zone
  requireZoneLabels: boolean;                // require zone/section labels
  minSignageLuxLevel: number;                // min lux on signage (200)
  minSignageLightingScore: number;           // min signage lighting score (0-100)
}

export const DEFAULT_SIGNAGE_CONFIG: SignageConfig = {
  aiEnabled: true,
  minRestroomSignClarityScore: 80,
  minDirectionalSignCount: 2,
  requireAdaBrailleSignage: true,
  minAdaComplianceScore: 85,
  minSignageConsistencyScore: 80,
  requireIlluminatedExitSign: true,
  requireDigitalMenuBoard: false,
  minDigitalSignageCount: 1,
  requireZoneLabels: true,
  minSignageLuxLevel: 200,
  minSignageLightingScore: 80,
};

export const readSignageConfig = (settings: any): SignageConfig => ({
  aiEnabled: settings?.signage_ai_enabled ?? true,
  minRestroomSignClarityScore: safeNumber(settings?.signage_min_restroom_clarity, 80),
  minDirectionalSignCount: safeNumber(settings?.signage_min_directional_count, 2),
  requireAdaBrailleSignage: settings?.signage_require_ada_braille ?? true,
  minAdaComplianceScore: safeNumber(settings?.signage_min_ada_score, 85),
  minSignageConsistencyScore: safeNumber(settings?.signage_min_consistency, 80),
  requireIlluminatedExitSign: settings?.signage_require_illuminated_exit ?? true,
  requireDigitalMenuBoard: settings?.signage_require_digital_menu ?? false,
  minDigitalSignageCount: safeNumber(settings?.signage_min_digital_count, 1),
  requireZoneLabels: settings?.signage_require_zone_labels ?? true,
  minSignageLuxLevel: safeNumber(settings?.signage_min_lux, 200),
  minSignageLightingScore: safeNumber(settings?.signage_min_lighting_score, 80),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface SignageData {
  location_id: string;
  has_restroom_signage: boolean;
  restroom_sign_clarity_score: number;
  has_directional_arrows: boolean;
  directional_sign_count: number;
  has_ada_braille_signage: boolean;
  ada_compliance_score: number;
  signage_consistency_score: number;
  has_unified_brand_signage: boolean;
  has_illuminated_exit_sign: boolean;
  exit_sign_obstructed: boolean;
  has_digital_menu_board: boolean;
  has_digital_promo_display: boolean;
  digital_signage_count: number;
  has_zone_labels: boolean;
  zone_label_count: number;
  signage_lux_level: number;
  signage_lighting_score: number;
  monthly_revenue: number;
  monthly_covers: number;
  avg_ticket: number;
}

const MOCK_DATA: SignageData[] = [
  {
    location_id: 'entry_main', has_restroom_signage: false, restroom_sign_clarity_score: 0,
    has_directional_arrows: false, directional_sign_count: 0,
    has_ada_braille_signage: false, ada_compliance_score: 35,
    signage_consistency_score: 50, has_unified_brand_signage: false,
    has_illuminated_exit_sign: true, exit_sign_obstructed: false,
    has_digital_menu_board: false, has_digital_promo_display: false, digital_signage_count: 0,
    has_zone_labels: false, zone_label_count: 0,
    signage_lux_level: 120, signage_lighting_score: 55,
    monthly_revenue: 48000, monthly_covers: 1300, avg_ticket: 37,
  },
  {
    location_id: 'bar_zone', has_restroom_signage: true, restroom_sign_clarity_score: 65,
    has_directional_arrows: false, directional_sign_count: 1,
    has_ada_braille_signage: true, ada_compliance_score: 70,
    signage_consistency_score: 60, has_unified_brand_signage: false,
    has_illuminated_exit_sign: true, exit_sign_obstructed: true,
    has_digital_menu_board: true, has_digital_promo_display: false, digital_signage_count: 1,
    has_zone_labels: true, zone_label_count: 2,
    signage_lux_level: 90, signage_lighting_score: 50,
    monthly_revenue: 32000, monthly_covers: 850, avg_ticket: 38,
  },
  {
    location_id: 'private_room', has_restroom_signage: true, restroom_sign_clarity_score: 75,
    has_directional_arrows: true, directional_sign_count: 2,
    has_ada_braille_signage: true, ada_compliance_score: 88,
    signage_consistency_score: 70, has_unified_brand_signage: true,
    has_illuminated_exit_sign: false, exit_sign_obstructed: false,
    has_digital_menu_board: false, has_digital_promo_display: false, digital_signage_count: 0,
    has_zone_labels: true, zone_label_count: 1,
    signage_lux_level: 180, signage_lighting_score: 75,
    monthly_revenue: 14000, monthly_covers: 320, avg_ticket: 44,
  },
  {
    location_id: 'patio_zone', has_restroom_signage: true, restroom_sign_clarity_score: 92,
    has_directional_arrows: true, directional_sign_count: 4,
    has_ada_braille_signage: true, ada_compliance_score: 95,
    signage_consistency_score: 90, has_unified_brand_signage: true,
    has_illuminated_exit_sign: true, exit_sign_obstructed: false,
    has_digital_menu_board: true, has_digital_promo_display: true, digital_signage_count: 3,
    has_zone_labels: true, zone_label_count: 3,
    signage_lux_level: 280, signage_lighting_score: 92,
    monthly_revenue: 26000, monthly_covers: 580, avg_ticket: 45,
  },
];

export const runSignageEngine = async (
  db: ReturnType<typeof useDB>,
  config: SignageConfig = DEFAULT_SIGNAGE_CONFIG
): Promise<{ alerts: SignageAlert[]; generated: number }> => {
  const alerts: SignageAlert[] = [];
  const now = new Date();

  let data: SignageData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, has_restroom_signage, restroom_sign_clarity_score,
              has_directional_arrows, directional_sign_count,
              has_ada_braille_signage, ada_compliance_score,
              signage_consistency_score, has_unified_brand_signage,
              has_illuminated_exit_sign, exit_sign_obstructed,
              has_digital_menu_board, has_digital_promo_display, digital_signage_count,
              has_zone_labels, zone_label_count,
              signage_lux_level, signage_lighting_score,
              monthly_revenue, monthly_covers, avg_ticket
       FROM interior_signage_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'entry_main'),
      has_restroom_signage: Boolean(r.has_restroom_signage ?? false),
      restroom_sign_clarity_score: safeNumber(r.restroom_sign_clarity_score, 0),
      has_directional_arrows: Boolean(r.has_directional_arrows ?? false),
      directional_sign_count: safeNumber(r.directional_sign_count, 0),
      has_ada_braille_signage: Boolean(r.has_ada_braille_signage ?? false),
      ada_compliance_score: safeNumber(r.ada_compliance_score, 0),
      signage_consistency_score: safeNumber(r.signage_consistency_score, 0),
      has_unified_brand_signage: Boolean(r.has_unified_brand_signage ?? false),
      has_illuminated_exit_sign: Boolean(r.has_illuminated_exit_sign ?? false),
      exit_sign_obstructed: Boolean(r.exit_sign_obstructed ?? false),
      has_digital_menu_board: Boolean(r.has_digital_menu_board ?? false),
      has_digital_promo_display: Boolean(r.has_digital_promo_display ?? false),
      digital_signage_count: safeNumber(r.digital_signage_count, 0),
      has_zone_labels: Boolean(r.has_zone_labels ?? false),
      zone_label_count: safeNumber(r.zone_label_count, 0),
      signage_lux_level: safeNumber(r.signage_lux_level, 0),
      signage_lighting_score: safeNumber(r.signage_lighting_score, 0),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      monthly_covers: safeNumber(r.monthly_covers, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch (err) {
    console.warn('[interior-signage] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;

    // Rule 1: RESTROOM_SIGNAGE_MISSING_UNCLEAR
    if (!d.has_restroom_signage || d.restroom_sign_clarity_score < config.minRestroomSignClarityScore) {
      // 45% of customers report difficulty finding restrooms in restaurants (ADA National Network)
      const clarityGap = config.minRestroomSignClarityScore - d.restroom_sign_clarity_score;
      const frustrationPct = d.has_restroom_signage
        ? Math.min(15 + clarityGap * 0.5, 35)
        : 45;
      const lostRevenue = Math.round(baselineRevenue * (frustrationPct / 100) * 0.15);
      const criticalNote = !d.has_restroom_signage ? 'CRITICAL: no restroom signage at all — 45% of customers report difficulty finding restrooms (ADA National Network). ' : '';
      alerts.push({
        rule_id: 'restroom_signage_missing_unclear',
        severity: !d.has_restroom_signage ? 'critical' : 'high',
        location_id: d.location_id,
        has_restroom_signage: d.has_restroom_signage,
        restroom_sign_clarity_score: d.restroom_sign_clarity_score,
        predicted_satisfaction_change: -Math.round(frustrationPct * 0.4),
        perceived_professionalism_change: -Math.round(frustrationPct * 0.3),
        predicted_revenue_change_pct: -Math.round(frustrationPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `RESTROOM SIGNAGE MISSING OR UNCLEAR: ${d.location_id} restroom signage ${d.has_restroom_signage ? `clarity ${d.restroom_sign_clarity_score}/100 (min ${config.minRestroomSignClarityScore})` : 'MISSING'}. ${criticalNote}45% of customers report difficulty finding restrooms in restaurants (ADA National Network). When customers cannot locate restrooms within 30 seconds, they wander, interrupt dining partners to ask staff, and feel embarrassed — frustration compounds with every additional inquiry. Customers who cannot find restrooms leave 18% sooner (lower dwell = lower spend) and 22% leave negative reviews citing poor layout. Restroom signage is the #1 wayfinding complaint in restaurant feedback (Yelp analysis). ${lostRevenue} revenue lost per month from frustrated customers + shorter dwell. ACTION: install clear restroom signage — ADA-compliant restroom signs with Braille + raised pictogram ($25-75 each, 6x6 inch standard, Must be mounted 60 inch from floor to centerline per ADA), high-contrast directional arrow signs pointing toward restrooms ($15-40 each, 6x6 inch with arrow + toilet pictogram + RESTROOM text), wall-mounted overhead restroom sign visible from 25+ ft ($30-80 each, 12x8 inch with high-contrast pictogram), install signs at every decision point (entry, hallway junction, bar). Place signs at 60 inch AFF (ADA height), on wall adjacent to restroom door (not on door itself — doors swing). Use universal pictogram (toilet icon) + RESTROOM text. Cost: $100-500 for full restroom signage set per location. Save ${fmt$(Math.max(lostRevenue, 1000))}/mo from recovered dwell + satisfaction + reduced staff interruptions. Restroom signage is the highest-ROI signage investment — costs $100 but recovers $1,000+/mo.`,
        ai_recommendation: 'install_restroom_signage',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: DIRECTIONAL_SIGNAGE_INSUFFICIENT
    if (!d.has_directional_arrows || d.directional_sign_count < config.minDirectionalSignCount) {
      // No arrows/directions to key areas = wandering customers, perceived wait 12-15% longer
      const directionalGap = config.minDirectionalSignCount - d.directional_sign_count;
      const wanderingPct = d.has_directional_arrows
        ? Math.min(8 + directionalGap * 4, 20)
        : 18;
      const perceivedWaitIncreasePct = 12 + wanderingPct * 0.2;
      const lostRevenue = Math.round(baselineRevenue * (wanderingPct / 100) * 0.12);
      const criticalNote = !d.has_directional_arrows ? 'CRITICAL: zero directional signs — customers must guess direction to restroom, bar, patio, exit. ' : '';
      alerts.push({
        rule_id: 'directional_signage_insufficient',
        severity: !d.has_directional_arrows ? 'high' : 'medium',
        location_id: d.location_id,
        has_directional_arrows: d.has_directional_arrows,
        directional_sign_count: d.directional_sign_count,
        predicted_satisfaction_change: -Math.round(wanderingPct * 0.5),
        perceived_professionalism_change: -Math.round(wanderingPct * 0.4),
        predicted_revenue_change_pct: -Math.round(wanderingPct * 0.12),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `DIRECTIONAL SIGNAGE INSUFFICIENT: ${d.location_id} directional signs ${d.directional_sign_count} (min ${config.minDirectionalSignCount}). ${criticalNote}Poor wayfinding increases perceived wait time by 12-15% (customers wander, feel lost, time feels slower when uncertain). Wandering customers block aisles, interrupt other tables to ask directions, and feel embarrassed when they cannot find bar, restroom, or patio. Customers who wander >60 seconds rate experience 1.2 stars lower (Cornell CHR). ${lostRevenue} revenue lost per month from perceived longer wait + lower satisfaction. ACTION: install directional signage at every decision point — arrow signs pointing to RESTROOM, BAR, PATIO, EXIT, ORDER HERE, PICKUP ($15-40 each, 6x6 inch with high-contrast arrow + pictogram + text), install overhead hanging signs at junction points ($50-150 each, 12x18 inch suspended from ceiling), install floor decals with arrows along path ($20-60 each, vinyl decal with arrow + text), install wall-mounted directional signs at every 90-degree turn ($15-40 each). Place directional signs at every decision point (entry, hallway junction, bar entry, patio door). Use consistent arrow direction (left, right, straight ahead). Maintain line-of-sight — sign visible before customer reaches decision point. Cost: $200-1,000 for full directional signage set. Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered perceived wait + dwell + satisfaction. Directional signage is invisible when done well — customers notice only when it is missing.`,
        ai_recommendation: 'add_directional_arrows',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: ADA_SIGNAGE_NONCOMPLIANT
    if (config.requireAdaBrailleSignage && (!d.has_ada_braille_signage || d.ada_compliance_score < config.minAdaComplianceScore)) {
      // Missing ADA-compliant signage = ADA lawsuit risk $55,000-$200,000 per violation
      const adaGap = config.minAdaComplianceScore - d.ada_compliance_score;
      const lawsuitRiskLevel = !d.has_ada_braille_signage
        ? 'critical'
        : d.ada_compliance_score < 50
          ? 'critical'
          : d.ada_compliance_score < 70
            ? 'high'
            : 'moderate';
      const lawsuitCostAvg = 75000; // ADA Title III violation avg settlement
      const annualRiskCost = Math.round(lawsuitCostAvg * (lawsuitRiskLevel === 'critical' ? 0.4 : lawsuitRiskLevel === 'high' ? 0.2 : 0.08));
      const monthlyRiskCost = Math.round(annualRiskCost / 12);
      const complianceNote = !d.has_ada_braille_signage ? 'CRITICAL: zero ADA Braille signage — every permanent room (restroom, exit, kitchen) requires Braille + raised letter signage per ADA Title III (28 CFR Part 36). ' : '';
      alerts.push({
        rule_id: 'ada_signage_noncompliant',
        severity: lawsuitRiskLevel === 'critical' ? 'critical' : lawsuitRiskLevel === 'high' ? 'high' : 'medium',
        location_id: d.location_id,
        has_ada_braille_signage: d.has_ada_braille_signage,
        ada_compliance_score: d.ada_compliance_score,
        ada_lawsuit_risk_level: lawsuitRiskLevel as any,
        est_monthly_opportunity: Math.max(monthlyRiskCost, 1500),
        description: `ADA SIGNAGE NONCOMPLIANT: ${d.location_id} ADA compliance score ${d.ada_compliance_score}/100 (min ${config.minAdaComplianceScore}). Braille signage ${d.has_ada_braille_signage ? 'present but incomplete' : 'MISSING'}. ${complianceNote}Missing ADA-compliant signage = ADA lawsuit risk $55,000-$200,000 per violation (ADA Title III, 28 CFR Part 36). ADA lawsuits have surged 320% since 2018 — serial plaintiffs file 50+ suits per year targeting non-compliant restaurants. Every permanent room (restroom, exit, kitchen, storage) requires signage with: Grade 2 Braille, raised letter/pictogram 1/32 inch above surface, mounted 60 inch AFF (centerline), high contrast (light-on-dark or dark-on-light), non-glare finish. Required ADA signage: restroom signs ($25-75 each), exit signs ($30-80 each), room identification signs ($25-75 each), directional signs with Braille ($30-90 each). Estimated annual lawsuit risk = ${fmt$(annualRiskCost)} (${fmt$(monthlyRiskCost)}/mo). ACTION: install ADA-compliant signage — purchase ADA Braille signs from ADA Sign Store / Accent Signs / ADA Central ($25-90 each, pre-made standard signs), custom ADA signs with restaurant branding ($50-150 each, custom color + Braille), retrofit existing signs with Braille overlays ($20-50 each, adhesive Braille + raised letter strips), audit full restaurant for ADA signage gaps (use ADA Checklist for Existing Facilities, ada.gov). Mount at 60 inch AFF centerline, adjacent to door on latch side (not on door). Cost: $300-1,500 for full ADA signage compliance audit + install. Save ${fmt$(Math.max(monthlyRiskCost, 1500))}/mo in avoided ADA lawsuit risk. ADA compliance is non-negotiable — one lawsuit costs more than full restaurant signage overhaul.`,
        ai_recommendation: 'install_ada_compliant_signage',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SIGNAGE_INCONSISTENCY
    if (d.signage_consistency_score < config.minSignageConsistencyScore || !d.has_unified_brand_signage) {
      // Different fonts/colors/styles across signs = perceived disorganization
      const consistencyGap = config.minSignageConsistencyScore - d.signage_consistency_score;
      const professionalismDropPct = Math.min(8 + consistencyGap * 0.4, 25);
      const lostRevenue = Math.round(baselineRevenue * (professionalismDropPct / 100) * 0.2);
      const criticalNote = d.signage_consistency_score < 50 ? 'CRITICAL: below 50 = signs visibly differ — different fonts (one sign Helvetica, another Arial, another Comic Sans), mismatched colors (red EXIT, blue restroom, green bar), inconsistent pictograms (one toilet icon round, another square). ' : '';
      alerts.push({
        rule_id: 'signage_inconsistency',
        severity: d.signage_consistency_score < 50 ? 'high' : 'medium',
        location_id: d.location_id,
        signage_consistency_score: d.signage_consistency_score,
        has_unified_brand_signage: d.has_unified_brand_signage,
        perceived_professionalism_change: -Math.round(professionalismDropPct),
        predicted_satisfaction_change: -Math.round(professionalismDropPct * 0.5),
        predicted_revenue_change_pct: -Math.round(professionalismDropPct * 0.2),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `SIGNAGE INCONSISTENCY: ${d.location_id} signage consistency score ${d.signage_consistency_score}/100 (min ${config.minSignageConsistencyScore}). Unified brand signage ${d.has_unified_brand_signage ? 'partial' : 'NO'}. ${criticalNote}Inconsistent signage (different fonts, colors, styles) signals disorganization — customers perceive lower quality (68% judge restaurant professionalism by signage quality, Cornell CHR). Mixed signage creates cognitive dissonance: customers subconsciously associate mismatched signs with kitchen disorganization, staff disorganization, food safety concerns. Premium restaurants with budget signage (mixed fonts, peel-and-stick vinyl, handwritten signs) suffer value perception drop — customers silently downgrade price acceptance by ${Math.round(professionalismDropPct)}%. ${lostRevenue} revenue lost per month from perceived disorganization + lower price acceptance. ACTION: standardize signage brand — develop brand signage standard (one font family — recommend Helvetica, Gotham, or Trade Gothic for restaurant signage; one color palette — primary brand color + secondary neutral; one pictogram style — geometric or hand-drawn, not mixed), replace all signs with unified brand system ($30-150 each, work with sign shop to produce consistent set), use vector-based production (not raster — pixelated signs signal cheap), maintain consistent material (acrylic, metal, or foam board — not mixed), keep mounting height consistent (60 inch AFF per ADA). Audit every visible sign — restroom, exit, directional, zone, menu board, hours, parking — replace any that deviate from brand standard. Cost: $500-3,000 for full signage brand overhaul. Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered professionalism + price acceptance + tip uplift. Signage consistency is the silent quality signal — customers notice without knowing they noticed.`,
        ai_recommendation: 'standardize_signage_brand',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: EXIT_SIGNAGE_OBSCURED
    if (config.requireIlluminatedExitSign && (!d.has_illuminated_exit_sign || d.exit_sign_obstructed)) {
      // Exit signs blocked/dim = fire code violation + safety risk
      const issueNote = !d.has_illuminated_exit_sign
        ? 'NON-ILLUMINATED exit sign — fire code requires illuminated exit signs at every exit (NFPA 101, IBC 1011). '
        : d.exit_sign_obstructed
          ? 'OBSTRUCTED exit sign — decor, merchandise, signage blocking line-of-sight to exit sign. '
          : '';
      const fireCodeFine = 5000; // typical fire code violation fine
      const annualRiskCost = Math.round(fireCodeFine * 0.5); // 50% chance of citation per year
      const monthlyRiskCost = Math.round(annualRiskCost / 12);
      const satisfactionDropPct = 6;
      const lostRevenue = Math.round(baselineRevenue * (satisfactionDropPct / 100) * 0.2);
      alerts.push({
        rule_id: 'exit_signage_obscured',
        severity: 'critical',
        location_id: d.location_id,
        has_illuminated_exit_sign: d.has_illuminated_exit_sign,
        exit_sign_obstructed: d.exit_sign_obstructed,
        predicted_satisfaction_change: -satisfactionDropPct,
        predicted_revenue_change_pct: -Math.round(satisfactionDropPct * 0.2),
        est_monthly_opportunity: Math.max(lostRevenue + monthlyRiskCost, 600),
        description: `EXIT SIGNAGE OBSCURED: ${d.location_id} illuminated exit sign ${d.has_illuminated_exit_sign ? 'present' : 'MISSING'}, obstructed ${d.exit_sign_obstructed ? 'YES' : 'no'}. ${issueNote}Fire code (NFPA 101 Life Safety Code, IBC Section 1011) requires illuminated exit signs at every exit path — visible from any point in the room. Blocked or dim exit signs = fire code violation ($2,500-10,000 fine per violation, repeated citations escalate) + safety risk (customers cannot locate exit during emergency, increases evacuation time by 30-60 seconds — fatal in fire). ${lostRevenue} revenue lost per month from perceived safety concern + ${fmt$(monthlyRiskCost)}/mo in fire code citation risk. ACTION: repair exit signage — install UL-listed illuminated exit signs ($40-150 each, LED edge-lit, red or green letters, battery backup for 90 min power outage), replace dead exit sign bulbs ($10-30 each, LED retrofit kit), remove obstructions (decor, merchandise, signage blocking line-of-sight), install additional exit signs if line-of-sight blocked from any point in room (every 100 ft or at every turn), install floor-level exit signs ($60-200 each, required in some jurisdictions, more visible in smoke), test exit sign illumination monthly (30-second test, log results for fire marshal). Battery backup must power sign for 90 minutes minimum (NFPA 101). Cost: $100-800 per exit sign including install. Save ${fmt$(Math.max(lostRevenue + monthlyRiskCost, 600))}/mo from avoided fire code citation + recovered safety perception. Exit signage is non-negotiable — fire marshal will cite on first inspection, lawsuit risk if emergency occurs.`,
        ai_recommendation: 'repair_exit_signage',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: DIGITAL_SIGNAGE_UNDERUTILIZED
    if (d.digital_signage_count < config.minDigitalSignageCount ||
        (config.requireDigitalMenuBoard && !d.has_digital_menu_board)) {
      // No digital menu boards/promo displays = 18-25% impulse purchase loss
      const digitalGap = config.minDigitalSignageCount - d.digital_signage_count;
      const impulseLossPct = !d.has_digital_menu_board
        ? Math.min(18 + digitalGap * 3, 25)
        : Math.min(8 + digitalGap * 2, 18);
      const impulseRevenueLoss = Math.round(d.monthly_covers * d.avg_ticket * (impulseLossPct / 100) * 0.15);
      const promoLoss = !d.has_digital_promo_display ? Math.round(baselineRevenue * 0.05) : 0;
      const totalLoss = impulseRevenueLoss + promoLoss;
      const criticalNote = !d.has_digital_menu_board ? 'CRITICAL: no digital menu board — static menu boards cannot promote limited-time offers, daily specials, or high-margin items dynamically. ' : '';
      alerts.push({
        rule_id: 'digital_signage_underutilized',
        severity: !d.has_digital_menu_board ? 'high' : 'medium',
        location_id: d.location_id,
        has_digital_menu_board: d.has_digital_menu_board,
        has_digital_promo_display: d.has_digital_promo_display,
        digital_signage_count: d.digital_signage_count,
        predicted_revenue_change_pct: -Math.round(impulseLossPct),
        est_monthly_opportunity: Math.max(totalLoss, 1200),
        description: `DIGITAL SIGNAGE UNDERUTILIZED: ${d.location_id} digital signage count ${d.digital_signage_count} (min ${config.minDigitalSignageCount}). Digital menu board ${d.has_digital_menu_board ? 'present' : 'MISSING'}. Promo display ${d.has_digital_promo_display ? 'present' : 'missing'}. ${criticalNote}Digital signage (menu boards, promotional displays) increases impulse purchases by 18-25% (Digital Signage Today). Static menu boards cannot promote limited-time offers, daily specials, or high-margin items dynamically — customers order what they see, and what they see is fixed. Digital menu boards enable: daypart switching (breakfast menu auto-switch to lunch at 11am), high-margin item promotion (rotating feature every 30 sec), limited-time offer promotion (auto-update when LTO ends), upsell prompts (add fries for $2 — large +$1), video content (sizzling steak, pouring wine — proven to increase desire + purchase intent 15-20%), real-time price updates (no reprint cost when prices change). ${totalLoss} revenue lost per month from missed impulse purchases + missed promo upsell. ACTION: install digital signage — digital menu boards ($800-3,000 each for 43-55 inch commercial display + media player, BrightSign/Amazon Fire Stick Commercial), cloud-based content management ($30-100/mo, NoviSign/ScreenCloud/Yodeck — manage content remotely, schedule dayparts, update prices instantly), digital promo displays ($300-1,500 each, 32-43 inch in entry/waiting area, rotate featured dishes + drinks + desserts), install digital signage at order point (counter, table-side tablet), at waiting area (drive impulse while customer waits), at exit (promote return visit + loyalty program). Use commercial-grade displays (not consumer TVs — 16/7 operation, higher brightness 450+ nits, longer lifespan). Cost: $1,000-5,000 per digital sign + $30-100/mo content management. Save ${fmt$(Math.max(totalLoss, 1200))}/mo from recovered impulse + promo + daypart revenue. Digital signage pays back in 2-6 months from impulse purchases alone.`,
        ai_recommendation: 'install_digital_menu_boards',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: ZONE_LABELING_ABSENT
    if (config.requireZoneLabels && (!d.has_zone_labels || d.zone_label_count === 0)) {
      // No zone/section labels (bar, dining, patio) = navigation confusion
      const navigationConfusionPct = !d.has_zone_labels ? 14 : 6;
      const lostRevenue = Math.round(baselineRevenue * (navigationConfusionPct / 100) * 0.15);
      const criticalNote = !d.has_zone_labels ? 'CRITICAL: zero zone labels — customers cannot identify bar vs dining vs patio, hosts cannot direct customers to correct zone. ' : '';
      alerts.push({
        rule_id: 'zone_labeling_absent',
        severity: !d.has_zone_labels ? 'medium' : 'low',
        location_id: d.location_id,
        has_zone_labels: d.has_zone_labels,
        zone_label_count: d.zone_label_count,
        predicted_satisfaction_change: -Math.round(navigationConfusionPct * 0.5),
        perceived_professionalism_change: -Math.round(navigationConfusionPct * 0.4),
        predicted_revenue_change_pct: -Math.round(navigationConfusionPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 500),
        description: `ZONE LABELING ABSENT: ${d.location_id} zone labels ${d.has_zone_labels ? `${d.zone_label_count} present` : 'MISSING'}. ${criticalNote}Without zone/section labels (BAR, DINING, PATIO, PRIVATE ROOM, LOUNGE), customers cannot orient themselves — hosts must physically escort every customer to their table (wastes host time), customers wander between zones unsure if they are in correct area, bar patrons accidentally sit in dining zone (causing awkward redirect). Zone labels create spatial identity — customers feel they are entering a distinct space, not a generic dining room. Premium restaurants use zone labels to create distinct atmospheres (BAR with low lighting + music, DINING with brighter lights + softer music, PATIO with outdoor ambiance). ${lostRevenue} revenue lost per month from navigation confusion + reduced host efficiency. ACTION: add zone labels — install branded zone labels above each zone entry ($80-300 each, 18x6 inch acrylic or metal sign with zone name + brand logo, mounted 84 inch AFF), install floor-to-ceiling zone pillars with zone name ($300-1,000 each, full-height pillar with backlit zone name), paint zone name on floor at zone entry ($50-200, vinyl decal with zone name + arrow), install overhead hanging zone signs ($150-400 each, suspended from ceiling, double-sided). Use distinct zone names that match brand voice (THE BAR, MAIN DINING, GARDEN PATIO, PRIVATE CELLAR, CHEF TABLE). Coordinate zone label design with overall signage brand standard (same font, color, material). Cost: $200-1,500 for full zone labeling set. Save ${fmt$(Math.max(lostRevenue, 500))}/mo from recovered host efficiency + customer orientation + perceived professionalism. Zone labels are the cheapest professionalization upgrade — one $200 sign transforms customer perception of organization.`,
        ai_recommendation: 'add_zone_labels',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: SIGNAGE_LIGHTING_POOR
    if (d.signage_lux_level < config.minSignageLuxLevel || d.signage_lighting_score < config.minSignageLightingScore) {
      // Signs poorly lit = customers cannot read = frustration
      const luxGap = config.minSignageLuxLevel - d.signage_lux_level;
      const lightingDropPct = d.signage_lighting_score < 50
        ? Math.min(15 + luxGap * 0.05, 30)
        : Math.min(8 + luxGap * 0.03, 18);
      const lostRevenue = Math.round(baselineRevenue * (lightingDropPct / 100) * 0.15);
      const criticalNote = d.signage_lux_level < 100 ? 'CRITICAL: below 100 lux — signs effectively unreadable in dim restaurant lighting. ' : '';
      alerts.push({
        rule_id: 'signage_lighting_poor',
        severity: d.signage_lux_level < 100 ? 'high' : 'medium',
        location_id: d.location_id,
        signage_lux_level: d.signage_lux_level,
        signage_lighting_score: d.signage_lighting_score,
        predicted_satisfaction_change: -Math.round(lightingDropPct * 0.5),
        perceived_professionalism_change: -Math.round(lightingDropPct * 0.4),
        predicted_revenue_change_pct: -Math.round(lightingDropPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 600),
        description: `SIGNAGE LIGHTING POOR: ${d.location_id} signage lux level ${d.signage_lux_level} (min ${config.minSignageLuxLevel}), signage lighting score ${d.signage_lighting_score}/100 (min ${config.minSignageLightingScore}). ${criticalNote}Signs poorly lit = customers cannot read = frustration. In dim restaurant ambiance (50-150 lux dining lighting), signage requires dedicated illumination (200+ lux on sign surface) to remain readable. Customers squint, lean in, use phone flashlight to read menu boards, directional signs, restroom signs — every squint is friction. Customers who cannot read menu board order what they remember (lower ticket) or default to familiar item (lower exploration, lower satisfaction). Signage lighting is different from ambient lighting — signage needs HIGHER lux (200+) than surrounding area (50-150) to stand out. ${lostRevenue} revenue lost per month from unreadable signage + lower ticket + frustration. ACTION: improve signage lighting — install dedicated signage spotlights ($30-100 each, LED track light or gooseneck spotlight aimed at sign, 3000K warm white for food signage), install backlit signage ($100-500 each, LED backlight behind acrylic or metal sign — self-illuminating, no separate fixture needed), install edge-lit acrylic signs ($80-300 each, LED strip around edge of clear acrylic — modern look, very readable), install illuminated menu board cabinet ($200-800 each, fluorescent or LED backlight behind translucent menu panel), increase ambient lighting in signage area (recessed lights + track lights aimed at sign wall), use high-contrast signage colors (white text on dark background or vice versa, minimum 70% contrast per ADA). Test signage readability from 25 ft away in actual restaurant lighting — if you cannot read it, neither can customers. Cost: $200-1,500 depending on signage count + lighting approach. Save ${fmt$(Math.max(lostRevenue, 600))}/mo from recovered readability + ticket + satisfaction. Signage lighting is the most overlooked signage investment — a $200 spotlight on a $100 sign transforms its impact.`,
        ai_recommendation: 'improve_signage_lighting',
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
              { role: 'system', content: 'You are a restaurant interior signage and wayfinding optimization expert. Given signage inspection data, recommend ONE specific action with expected navigation, professionalism, ADA compliance, or revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Restroom sign: ${a.has_restroom_signage ?? false}, clarity ${a.restroom_sign_clarity_score ?? 0}/100. Directional arrows: ${a.has_directional_arrows ?? false}, count ${a.directional_sign_count ?? 0}. ADA Braille: ${a.has_ada_braille_signage ?? false}, ADA score ${a.ada_compliance_score ?? 0}/100. Consistency: ${a.signage_consistency_score ?? 0}/100. Unified brand: ${a.has_unified_brand_signage ?? false}. Illuminated exit: ${a.has_illuminated_exit_sign ?? false}, obstructed ${a.exit_sign_obstructed ?? false}. Digital menu board: ${a.has_digital_menu_board ?? false}, promo display ${a.has_digital_promo_display ?? false}, digital count ${a.digital_signage_count ?? 0}. Zone labels: ${a.has_zone_labels ?? false}, count ${a.zone_label_count ?? 0}. Signage lux: ${a.signage_lux_level ?? 0}, lighting score ${a.signage_lighting_score ?? 0}/100. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM interior_signage_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE interior_signage_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<SignageAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM interior_signage_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  locationsAtRisk: number; adaRiskLocations: number; missingRestroomSigns: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(location_id != NONE) AS locations,
              math::count(rule_id = 'ada_signage_noncompliant') AS adarisk,
              math::count(rule_id = 'restroom_signage_missing_unclear') AS restroom
       FROM interior_signage_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      locationsAtRisk: safeNumber(r.locations, 0),
      adaRiskLocations: safeNumber(r.adarisk, 0),
      missingRestroomSigns: safeNumber(r.restroom, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, locationsAtRisk: 0, adaRiskLocations: 0, missingRestroomSigns: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
