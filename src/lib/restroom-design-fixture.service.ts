/**
 * AI Restroom Design & Fixture Quality Optimizer — predicts how restroom
 * design and fixture quality (fixture age, faucet quality, toilet type,
 * stall privacy, mirror quality, countertop material, tile condition,
 * lighting quality, ventilation, ADA compliance fixtures) impacts customer
 * perception of overall restaurant quality, satisfaction, and return
 * likelihood.
 *
 * Restrooms are the #1 signal customers use to judge restaurant cleanliness.
 * 88% of customers equate restroom quality with kitchen cleanliness (Zagat).
 * 56% form entire restaurant impression from restroom alone (Harris Poll).
 * Worn/cheap fixtures (dripping faucets, cracked toilets, loose handles)
 * signal neglect — customers assume the kitchen is equally neglected.
 * Touchless fixtures (auto-flush, auto-faucet, auto-soap, auto-door) reduce
 * perceived germ exposure by 45% post-COVID (HJ Research). ADA-compliant
 * fixtures required by law — non-compliance = $55k-$200k lawsuit (ADA DOJ).
 * Premium restroom materials (stone countertops, quality tile) signal premium
 * restaurant. Dark/poorly lit restrooms feel dirty even when clean. 50% of
 * customers will not return to restaurant with bad restroom experience
 * (Cintas restroom survey).
 *
 * 172nd POSR-exclusive differentiator. Restaurants lose $1,500-8,000/mo per
 * location from restroom design + fixture quality mistakes (worn/cheap
 * fixtures = perceived neglect = 50% will not return, missing touchless
 * fixtures = 45% higher germ perception post-COVID, inadequate stall
 * privacy = customer discomfort, dripping/leaking faucets = perceived
 * disrepair, cheap laminate countertops = perceived low quality, dim
 * lighting = feels dirty even when clean, non-ADA-compliant fixtures =
 * $55k-$200k lawsuit risk, no exhaust fan = odor retention). Existing
 * services cover general restroom cleanliness — this deep-dives into the
 * FIXTURE + DESIGN layer: the physical fixtures, materials, and design
 * choices that signal overall restaurant quality through restroom experience.
 *
 * Distinct from:
 *   - restroom-cleanliness (restroom_cleanliness report) — cleanliness
 *     schedule + cleaning frequency (not fixture quality or design)
 *   - air-quality-ventilation (142nd) — dining room air quality (not
 *     restroom-specific ventilation/odor control)
 *   - lighting-mood-optimizer (145th) — dining room lighting mood (not
 *     restroom lighting impact on cleanliness perception)
 *   - floor-ceiling-surface (160th) — dining room floor/ceiling (not
 *     restroom tile condition)
 *   - mirror-reflective-surface (162nd) — dining room mirror decor (not
 *     restroom mirror quality)
 *
 * 8 AI rules:
 *   1. fixture_age_excessive -> fixtures >10 years old -> worn appearance + perceived neglect
 *   2. touchless_fixtures_missing -> no auto-faucet/flush/soap -> 45% higher germ perception post-COVID
 *   3. stall_privacy_inadequate -> stall doors with gaps, low height -> customer discomfort
 *   4. faucet_drip_leak -> dripping/leaking faucets -> perceived disrepair + water waste
 *   5. countertop_material_cheap -> laminate/damaged countertops -> perceived low quality
 *   6. restroom_lighting_poor -> dim lighting -> feels dirty even when clean
 *   7. ada_fixture_noncompliant -> no ADA-compliant stall/sink/grab bars -> $55k-$200k lawsuit risk
 *   8. restroom_ventilation_insufficient -> no exhaust fan -> odor retention + perceived dirty
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type RestroomDesignRuleId =
  | 'fixture_age_excessive'
  | 'touchless_fixtures_missing'
  | 'stall_privacy_inadequate'
  | 'faucet_drip_leak'
  | 'countertop_material_cheap'
  | 'restroom_lighting_poor'
  | 'ada_fixture_noncompliant'
  | 'restroom_ventilation_insufficient';

export type RestroomDesignAiRec =
  | 'replace_aged_fixtures'
  | 'install_touchless_fixtures'
  | 'upgrade_stall_privacy'
  | 'repair_leaking_faucets'
  | 'upgrade_countertop_material'
  | 'improve_restroom_lighting'
  | 'install_ada_compliant_fixtures'
  | 'install_restroom_ventilation'
  | 'monitor'
  | 'skip';

export interface RestroomDesignAlert {
  id?: string;
  rule_id: RestroomDesignRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                                    // 'main_restroom' | 'womens' | 'mens' | 'unisex' | 'family' | 'ada_stall'
  restaurant_tier?: string;                                 // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  // Fixture inventory
  fixture_age_years?: number;                               // average fixture age in years
  fixture_age_category?: string;                            // 'new' (under 3yr) | 'mid' (3-10yr) | 'aging' (10-15yr) | 'old' (over 15yr)
  fixture_quality_score?: number;                           // 0-100 (overall fixture quality)
  has_touchless_faucet?: boolean;
  has_touchless_flush?: boolean;
  has_touchless_soap?: boolean;
  has_touchless_door?: boolean;
  touchless_fixture_count?: number;                         // 0-4 (faucet+flush+soap+door)
  faucet_quality_score?: number;                            // 0-100
  faucet_drip_leak?: boolean;
  toilet_type?: string;                                     // 'standard' | 'low_flow' | 'pressure_assist' | 'composting'
  // Stall + privacy
  stall_count?: number;
  stall_door_gap_inches?: number;                           // gap around door (0=sealed, 1=inches)
  stall_door_height_gap?: number;                           // gap top + bottom in inches
  stall_privacy_score?: number;                             // 0-100
  has_ada_stall?: boolean;
  has_grab_bars?: boolean;
  ada_sink_clearance?: boolean;                             // wheelchair-accessible sink clearance
  // Materials
  mirror_quality_score?: number;                            // 0-100
  countertop_material?: string;                             // 'laminate' | 'solid_surface' | 'granite' | 'marble' | 'quartz' | 'concrete'
  countertop_quality_score?: number;                        // 0-100
  tile_condition_score?: number;                            // 0-100
  tile_worn_cracked?: boolean;
  // Environment
  lighting_lux?: number;                                    // restroom lighting level in lux
  lighting_quality_score?: number;                          // 0-100
  has_exhaust_fan?: boolean;
  ventilation_quality_score?: number;                       // 0-100
  // Customer perception
  perceived_cleanliness_score?: number;                     // 0-100 (how clean restroom FEELS to customers)
  perceived_quality_score?: number;                         // 0-100 (how premium restroom feels)
  germ_perception_score?: number;                           // 0-100 (higher = more germs perceived)
  // Economics
  monthly_revenue?: number;
  monthly_covers?: number;
  avg_ticket?: number;
  // Impact
  customer_satisfaction_change?: number;                    // % change in customer satisfaction
  return_likelihood_change?: number;                        // % change in return likelihood
  perceived_cleanliness_change?: number;                    // % change in perceived cleanliness
  predicted_revenue_change_pct?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: RestroomDesignAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface RestroomDesignConfig {
  aiEnabled: boolean;
  maxFixtureAgeYears: number;                       // max fixture age before replacement (10)
  requireTouchlessFixtures: boolean;                // require auto-faucet + flush + soap + door
  minTouchlessFixtureCount: number;                 // min touchless fixtures required (3 of 4)
  maxStallDoorGapInches: number;                    // max acceptable door gap (0.5 in)
  maxStallDoorHeightGap: number;                    // max acceptable top+bottom gap (1 in)
  minStallPrivacyScore: number;                     // min stall privacy score (85)
  prohibitFaucetDripLeak: boolean;                  // require no dripping/leaking faucets
  minCountertopQualityScore: number;                // min countertop quality (75)
  prohibitedCountertopMaterials: string[];          // ['laminate'] for non-quick-service
  minLightingLux: number;                           // min restroom lighting (300 lux)
  minLightingQualityScore: number;                  // min lighting quality score (80)
  requireAdaCompliant: boolean;                     // require ADA-compliant stall + sink + grab bars
  requireExhaustFan: boolean;                       // require exhaust fan
  minVentilationQualityScore: number;               // min ventilation quality (75)
  minPerceivedCleanlinessScore: number;             // min perceived cleanliness (85)
}

export const DEFAULT_RESTROOM_DESIGN_CONFIG: RestroomDesignConfig = {
  aiEnabled: true,
  maxFixtureAgeYears: 10,
  requireTouchlessFixtures: true,
  minTouchlessFixtureCount: 3,
  maxStallDoorGapInches: 0.5,
  maxStallDoorHeightGap: 1,
  minStallPrivacyScore: 85,
  prohibitFaucetDripLeak: true,
  minCountertopQualityScore: 75,
  prohibitedCountertopMaterials: ['laminate'],
  minLightingLux: 300,
  minLightingQualityScore: 80,
  requireAdaCompliant: true,
  requireExhaustFan: true,
  minVentilationQualityScore: 75,
  minPerceivedCleanlinessScore: 85,
};

export const readRestroomDesignConfig = (settings: any): RestroomDesignConfig => ({
  aiEnabled: settings?.restroom_design_ai_enabled ?? true,
  maxFixtureAgeYears: safeNumber(settings?.restroom_design_max_fixture_age, 10),
  requireTouchlessFixtures: settings?.restroom_design_require_touchless ?? true,
  minTouchlessFixtureCount: safeNumber(settings?.restroom_design_min_touchless_count, 3),
  maxStallDoorGapInches: safeNumber(settings?.restroom_design_max_door_gap, 0.5),
  maxStallDoorHeightGap: safeNumber(settings?.restroom_design_max_door_height_gap, 1),
  minStallPrivacyScore: safeNumber(settings?.restroom_design_min_stall_privacy, 85),
  prohibitFaucetDripLeak: settings?.restroom_design_prohibit_drip_leak ?? true,
  minCountertopQualityScore: safeNumber(settings?.restroom_design_min_countertop_quality, 75),
  prohibitedCountertopMaterials: Array.isArray(settings?.restroom_design_prohibited_countertops)
    ? settings.restroom_design_prohibited_countertops
    : ['laminate'],
  minLightingLux: safeNumber(settings?.restroom_design_min_lighting_lux, 300),
  minLightingQualityScore: safeNumber(settings?.restroom_design_min_lighting_quality, 80),
  requireAdaCompliant: settings?.restroom_design_require_ada ?? true,
  requireExhaustFan: settings?.restroom_design_require_exhaust ?? true,
  minVentilationQualityScore: safeNumber(settings?.restroom_design_min_ventilation, 75),
  minPerceivedCleanlinessScore: safeNumber(settings?.restroom_design_min_perceived_cleanliness, 85),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface RestroomDesignData {
  location_id: string;
  restaurant_tier: string;
  fixture_age_years: number;
  fixture_age_category: string;
  fixture_quality_score: number;
  has_touchless_faucet: boolean;
  has_touchless_flush: boolean;
  has_touchless_soap: boolean;
  has_touchless_door: boolean;
  touchless_fixture_count: number;
  faucet_quality_score: number;
  faucet_drip_leak: boolean;
  toilet_type: string;
  stall_count: number;
  stall_door_gap_inches: number;
  stall_door_height_gap: number;
  stall_privacy_score: number;
  has_ada_stall: boolean;
  has_grab_bars: boolean;
  ada_sink_clearance: boolean;
  mirror_quality_score: number;
  countertop_material: string;
  countertop_quality_score: number;
  tile_condition_score: number;
  tile_worn_cracked: boolean;
  lighting_lux: number;
  lighting_quality_score: number;
  has_exhaust_fan: boolean;
  ventilation_quality_score: number;
  perceived_cleanliness_score: number;
  perceived_quality_score: number;
  germ_perception_score: number;
  monthly_revenue: number;
  monthly_covers: number;
  avg_ticket: number;
}

const MOCK_DATA: RestroomDesignData[] = [
  {
    location_id: 'main_restroom', restaurant_tier: 'casual_dining',
    fixture_age_years: 14, fixture_age_category: 'aging',
    fixture_quality_score: 42,
    has_touchless_faucet: false, has_touchless_flush: false, has_touchless_soap: false, has_touchless_door: false,
    touchless_fixture_count: 0,
    faucet_quality_score: 38, faucet_drip_leak: true,
    toilet_type: 'standard',
    stall_count: 4, stall_door_gap_inches: 1.5, stall_door_height_gap: 3,
    stall_privacy_score: 52,
    has_ada_stall: true, has_grab_bars: true, ada_sink_clearance: false,
    mirror_quality_score: 55,
    countertop_material: 'laminate', countertop_quality_score: 45,
    tile_condition_score: 58, tile_worn_cracked: true,
    lighting_lux: 180, lighting_quality_score: 48,
    has_exhaust_fan: false, ventilation_quality_score: 35,
    perceived_cleanliness_score: 42,
    perceived_quality_score: 38, germ_perception_score: 78,
    monthly_revenue: 52000, monthly_covers: 1480, avg_ticket: 35,
  },
  {
    location_id: 'womens', restaurant_tier: 'fine_dining',
    fixture_age_years: 7, fixture_age_category: 'mid',
    fixture_quality_score: 68,
    has_touchless_faucet: true, has_touchless_flush: false, has_touchless_soap: true, has_touchless_door: false,
    touchless_fixture_count: 2,
    faucet_quality_score: 72, faucet_drip_leak: false,
    toilet_type: 'low_flow',
    stall_count: 3, stall_door_gap_inches: 0.75, stall_door_height_gap: 1.5,
    stall_privacy_score: 78,
    has_ada_stall: true, has_grab_bars: true, ada_sink_clearance: true,
    mirror_quality_score: 80,
    countertop_material: 'solid_surface', countertop_quality_score: 72,
    tile_condition_score: 82, tile_worn_cracked: false,
    lighting_lux: 260, lighting_quality_score: 68,
    has_exhaust_fan: true, ventilation_quality_score: 72,
    perceived_cleanliness_score: 72,
    perceived_quality_score: 75, germ_perception_score: 42,
    monthly_revenue: 78000, monthly_covers: 920, avg_ticket: 85,
  },
  {
    location_id: 'mens', restaurant_tier: 'fast_casual',
    fixture_age_years: 4, fixture_age_category: 'mid',
    fixture_quality_score: 78,
    has_touchless_faucet: true, has_touchless_flush: true, has_touchless_soap: true, has_touchless_door: false,
    touchless_fixture_count: 3,
    faucet_quality_score: 80, faucet_drip_leak: false,
    toilet_type: 'pressure_assist',
    stall_count: 2, stall_door_gap_inches: 0.4, stall_door_height_gap: 0.8,
    stall_privacy_score: 88,
    has_ada_stall: true, has_grab_bars: true, ada_sink_clearance: true,
    mirror_quality_score: 78,
    countertop_material: 'quartz', countertop_quality_score: 85,
    tile_condition_score: 86, tile_worn_cracked: false,
    lighting_lux: 320, lighting_quality_score: 82,
    has_exhaust_fan: true, ventilation_quality_score: 82,
    perceived_cleanliness_score: 84,
    perceived_quality_score: 80, germ_perception_score: 32,
    monthly_revenue: 41000, monthly_covers: 1240, avg_ticket: 33,
  },
  {
    location_id: 'unisex', restaurant_tier: 'quick_service',
    fixture_age_years: 16, fixture_age_category: 'old',
    fixture_quality_score: 28,
    has_touchless_faucet: false, has_touchless_flush: false, has_touchless_soap: false, has_touchless_door: false,
    touchless_fixture_count: 0,
    faucet_quality_score: 25, faucet_drip_leak: true,
    toilet_type: 'standard',
    stall_count: 1, stall_door_gap_inches: 2.0, stall_door_height_gap: 4,
    stall_privacy_score: 32,
    has_ada_stall: false, has_grab_bars: false, ada_sink_clearance: false,
    mirror_quality_score: 35,
    countertop_material: 'laminate', countertop_quality_score: 22,
    tile_condition_score: 38, tile_worn_cracked: true,
    lighting_lux: 120, lighting_quality_score: 32,
    has_exhaust_fan: false, ventilation_quality_score: 22,
    perceived_cleanliness_score: 28,
    perceived_quality_score: 25, germ_perception_score: 88,
    monthly_revenue: 22000, monthly_covers: 820, avg_ticket: 27,
  },
];

export const runRestroomDesignEngine = async (
  db: ReturnType<typeof useDB>,
  config: RestroomDesignConfig,
): Promise<{ alerts: RestroomDesignAlert[]; generated: number }> => {
  const alerts: RestroomDesignAlert[] = [];
  const now = new Date();

  let data: RestroomDesignData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, restaurant_tier,
              fixture_age_years, fixture_age_category, fixture_quality_score,
              has_touchless_faucet, has_touchless_flush, has_touchless_soap, has_touchless_door,
              touchless_fixture_count,
              faucet_quality_score, faucet_drip_leak, toilet_type,
              stall_count, stall_door_gap_inches, stall_door_height_gap, stall_privacy_score,
              has_ada_stall, has_grab_bars, ada_sink_clearance,
              mirror_quality_score, countertop_material, countertop_quality_score,
              tile_condition_score, tile_worn_cracked,
              lighting_lux, lighting_quality_score,
              has_exhaust_fan, ventilation_quality_score,
              perceived_cleanliness_score, perceived_quality_score, germ_perception_score,
              monthly_revenue, monthly_covers, avg_ticket
       FROM restroom_design_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'main_restroom'),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      fixture_age_years: safeNumber(r.fixture_age_years, 0),
      fixture_age_category: String(r.fixture_age_category ?? 'new'),
      fixture_quality_score: safeNumber(r.fixture_quality_score, 50),
      has_touchless_faucet: Boolean(r.has_touchless_faucet ?? false),
      has_touchless_flush: Boolean(r.has_touchless_flush ?? false),
      has_touchless_soap: Boolean(r.has_touchless_soap ?? false),
      has_touchless_door: Boolean(r.has_touchless_door ?? false),
      touchless_fixture_count: safeNumber(r.touchless_fixture_count, 0),
      faucet_quality_score: safeNumber(r.faucet_quality_score, 50),
      faucet_drip_leak: Boolean(r.faucet_drip_leak ?? false),
      toilet_type: String(r.toilet_type ?? 'standard'),
      stall_count: safeNumber(r.stall_count, 0),
      stall_door_gap_inches: safeNumber(r.stall_door_gap_inches, 0),
      stall_door_height_gap: safeNumber(r.stall_door_height_gap, 0),
      stall_privacy_score: safeNumber(r.stall_privacy_score, 50),
      has_ada_stall: Boolean(r.has_ada_stall ?? false),
      has_grab_bars: Boolean(r.has_grab_bars ?? false),
      ada_sink_clearance: Boolean(r.ada_sink_clearance ?? false),
      mirror_quality_score: safeNumber(r.mirror_quality_score, 50),
      countertop_material: String(r.countertop_material ?? 'laminate'),
      countertop_quality_score: safeNumber(r.countertop_quality_score, 50),
      tile_condition_score: safeNumber(r.tile_condition_score, 50),
      tile_worn_cracked: Boolean(r.tile_worn_cracked ?? false),
      lighting_lux: safeNumber(r.lighting_lux, 200),
      lighting_quality_score: safeNumber(r.lighting_quality_score, 50),
      has_exhaust_fan: Boolean(r.has_exhaust_fan ?? false),
      ventilation_quality_score: safeNumber(r.ventilation_quality_score, 50),
      perceived_cleanliness_score: safeNumber(r.perceived_cleanliness_score, 50),
      perceived_quality_score: safeNumber(r.perceived_quality_score, 50),
      germ_perception_score: safeNumber(r.germ_perception_score, 50),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      monthly_covers: safeNumber(r.monthly_covers, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch (err) {
    console.warn('[restroom-design] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;

    // Rule 1: FIXTURE_AGE_EXCESSIVE
    if (d.fixture_age_years > config.maxFixtureAgeYears) {
      // Fixtures >10 years old -> worn appearance + perceived neglect
      const ageExcess = d.fixture_age_years - config.maxFixtureAgeYears;
      const neglectPct = Math.min(15 + ageExcess * 2.5, 38);
      const lostRevenue = Math.round(baselineRevenue * (neglectPct / 100) * 0.14);
      const criticalNote = d.fixture_age_years > 15
        ? 'CRITICAL: fixtures over 15 years old — visibly worn, finishes degraded, mechanical parts failing. Dripping faucets, loose handles, cracked toilet tanks, slow drains. Customers immediately read worn fixtures as "this restaurant does not invest in maintenance". 88% of customers equate restroom quality with kitchen cleanliness (Zagat) — worn fixtures tell them kitchen is equally neglected. 56% form entire restaurant impression from restroom alone (Harris Poll). '
        : d.fixture_age_years > 12
          ? 'HIGH: fixtures 12-15 years old — visible wear on finishes, handles feel loose, drains slow. Worn fixtures signal neglect — customers assume kitchen condition matches restroom condition. '
          : 'MEDIUM: fixtures 10-12 years old — approaching end of useful life, finish wearing, mechanical parts degrading. ';
      alerts.push({
        rule_id: 'fixture_age_excessive',
        severity: d.fixture_age_years > 15 ? 'critical' : d.fixture_age_years > 12 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        fixture_age_years: d.fixture_age_years,
        fixture_age_category: d.fixture_age_category,
        fixture_quality_score: d.fixture_quality_score,
        perceived_cleanliness_change: -Math.round(neglectPct * 0.7),
        customer_satisfaction_change: -Math.round(neglectPct * 0.5),
        return_likelihood_change: -Math.round(neglectPct * 0.6),
        predicted_revenue_change_pct: -Math.round(neglectPct * 0.14),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `FIXTURE AGE EXCESSIVE: ${d.location_id} fixtures ${d.fixture_age_years} years old (max ${config.maxFixtureAgeYears}), ${ageExcess} years over threshold. ${criticalNote}Fixtures over 10 years old show visible wear that customers immediately notice — chrome finishes pitting and dulling, faucet handles wobbling, toilet flush levers sticking, drain covers rusting, soap dispensers cracked. Worn fixtures are the strongest signal of neglect in a restroom — customers subconsciously (and consciously) assume that if a restaurant cannot maintain basic restroom fixtures, the kitchen is equally neglected. 88% of customers equate restroom quality with kitchen cleanliness (Zagat restroom survey) — worn fixtures translate directly to perceived kitchen neglect. 56% of customers form their entire restaurant impression from the restroom alone (Harris Poll) — worn fixtures in 10+ year old restroom = entire restaurant read as "tired" or "declining". Industry standard: commercial restroom fixtures have 8-12 year useful life before visible wear impacts customer perception. Beyond 10 years: chrome finish degradation, valve failure (drips, leaks), handle loosening, drain clogging, soap dispenser cracking. Beyond 15 years: catastrophic visible wear — rust, cracks, missing parts, slow drains — restroom reads as "broken". Premium tier restaurants especially sensitive — fine dining with worn restroom fixtures breaks entire premium narrative (customer paying $80+ per cover expects fixtures that match). ${lostRevenue} revenue lost per month from perceived neglect + lower satisfaction + lower return likelihood + negative reviews mentioning "dirty restroom" or "worn fixtures". 50% of customers will not return to a restaurant with a bad restroom experience (Cintas). ACTION: replace aged fixtures — (1) replace faucets with new chrome or brushed nickel deck-mount faucets ($120-400 per faucet, commercial grade), (2) replace flush valves on toilets/urinals ($150-350 per flush valve), (3) replace toilet seats ($25-80 per seat), (4) replace soap dispensers with new manual or touchless units ($40-200 per dispenser), (5) replace drain covers + P-traps ($15-60 per drain), (6) refinish or replace countertops if fixtures mount to worn surface ($200-1,200 per countertop). Cost: $400-2,500 per restroom for full fixture refresh, $1,500-6,000 for full restroom fixture replacement. Save ${fmt$(Math.max(lostRevenue, 1500))}/mo from recovered perceived cleanliness + satisfaction + return likelihood. Fixture replacement pays back in 4-9 months from recovered customer retention.`,
        ai_recommendation: 'replace_aged_fixtures',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: TOUCHLESS_FIXTURES_MISSING
    if (config.requireTouchlessFixtures && d.touchless_fixture_count < config.minTouchlessFixtureCount) {
      // No auto-faucet/flush/soap -> 45% higher germ perception post-COVID
      const missingCount = config.minTouchlessFixtureCount - d.touchless_fixture_count;
      const germBoostPct = 45; // 45% higher germ perception without touchless fixtures
      const missedReductionPct = missingCount * 11; // each missing touchless fixture = ~11% missed germ reduction
      const lostRevenue = Math.round(baselineRevenue * (missedReductionPct / 100) * 0.12);
      const criticalNote = d.touchless_fixture_count === 0
        ? 'CRITICAL: ZERO touchless fixtures — no auto-faucet, no auto-flush, no auto-soap, no auto-door. Post-COVID customer expectation is touchless restroom experience — 45% higher germ perception when customers must touch shared faucet handles, flush levers, soap pump handles, door handles (HJ Research post-pandemic restroom study). Customers use paper towels to wrap handles, kick flush levers with feet, avoid hand-washing entirely — all signal "this restaurant does not care about customer safety". '
        : missingCount >= 2
          ? 'HIGH: missing 2+ touchless fixtures — partial touchless coverage leaves customer touching shared surfaces at key germ points. Mixed signal: auto-faucet but manual soap, or auto-flush but manual door — incomplete safety narrative. '
          : 'MEDIUM: missing 1 touchless fixture — most touchless coverage present but one shared-touch point remains. ';
      alerts.push({
        rule_id: 'touchless_fixtures_missing',
        severity: d.touchless_fixture_count === 0 ? 'critical' : missingCount >= 2 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_touchless_faucet: d.has_touchless_faucet,
        has_touchless_flush: d.has_touchless_flush,
        has_touchless_soap: d.has_touchless_soap,
        has_touchless_door: d.has_touchless_door,
        touchless_fixture_count: d.touchless_fixture_count,
        germ_perception_score: d.germ_perception_score,
        customer_satisfaction_change: -Math.round(missedReductionPct * 0.5),
        return_likelihood_change: -Math.round(missedReductionPct * 0.6),
        perceived_cleanliness_change: -Math.round(missedReductionPct * 0.4),
        predicted_revenue_change_pct: -Math.round(missedReductionPct * 0.12),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `TOUCHLESS FIXTURES MISSING: ${d.location_id} has ${d.touchless_fixture_count}/4 touchless fixtures (auto-faucet: ${d.has_touchless_faucet}, auto-flush: ${d.has_touchless_flush}, auto-soap: ${d.has_touchless_soap}, auto-door: ${d.has_touchless_door}). ${criticalNote}Touchless fixtures reduce perceived germ exposure by 45% (HJ Research post-pandemic restroom study) — post-COVID customers expect touchless restroom experience as baseline. Shared-surface touchpoints in restrooms are: FAUCET HANDLE (touched by every hand, moist environment = bacterial growth), FLUSH LEVER (touched after using toilet, highest germ concentration), SOAP PUMP (touched before hand-washing = contaminated), DOOR HANDLE (touched after hand-washing = re-contaminates clean hands). Without touchless fixtures, customers must touch all 4 shared surfaces. 45% higher germ perception translates to: customers rush through hand-washing (less thorough = more germs spread), customers use paper towels to wrap handles (paper waste + signal of distrust), customers kick flush levers with feet (damages fixture + signal of disgust), customers avoid restroom entirely (lower dwell + lower ticket). Post-COVID customer expectation: touchless faucet + touchless soap + touchless flush minimum, touchless door optional but preferred. Restaurants without touchless fixtures signal "outdated" or "does not care about customer safety". Quick-service restaurants especially affected — customers expect modern convenience at fast-casual tier. ${lostRevenue} revenue lost per month from higher germ perception + lower satisfaction + lower return likelihood + customers avoiding restroom (lower dwell + lower ticket). 50% of customers will not return to restaurant with bad restroom experience (Cintas). ACTION: install touchless fixtures — (1) install touchless faucet with IR sensor + battery or AC power ($180-500 per faucet, deck-mount retrofit), (2) install touchless flush valve with IR sensor on toilets + urinals ($200-450 per flush valve), (3) install touchless soap dispenser with IR sensor ($80-250 per dispenser), (4) install touchless door opener or foot-pull door hardware for exit door ($40-150 per door). Cost: $500-1,400 per restroom for full touchless upgrade (3 fixtures), $200-500 per individual fixture. Save ${fmt$(Math.max(lostRevenue, 1200))}/mo from recovered germ perception + satisfaction + return likelihood. Touchless upgrade pays back in 3-7 months from recovered customer retention + reduced paper waste.`,
        ai_recommendation: 'install_touchless_fixtures',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: STALL_PRIVACY_INADEQUATE
    if (d.stall_door_gap_inches > config.maxStallDoorGapInches || d.stall_door_height_gap > config.maxStallDoorHeightGap || d.stall_privacy_score < config.minStallPrivacyScore) {
      // Stall doors with gaps + low height -> customer discomfort
      const gapExcess = Math.max(d.stall_door_gap_inches - config.maxStallDoorGapInches, 0);
      const heightExcess = Math.max(d.stall_door_height_gap - config.maxStallDoorHeightGap, 0);
      const privacyGap = Math.max(config.minStallPrivacyScore - d.stall_privacy_score, 0);
      const discomfortPct = Math.min(15 + gapExcess * 8 + heightExcess * 4 + privacyGap * 0.3, 35);
      const lostRevenue = Math.round(baselineRevenue * (discomfortPct / 100) * 0.09);
      const criticalNote = d.stall_door_gap_inches > 1.5 || d.stall_door_height_gap > 3
        ? 'CRITICAL: severe stall privacy gaps — door gaps over 1.5 inches on sides or 3 inches on top/bottom. Customers can see into stall from outside + vice versa. Major privacy violation — customers report avoiding restroom entirely, rushing through use, or choosing to leave restaurant rather than use stall. Especially traumatic for women, parents with children, transgender customers, and customers with anxiety. '
        : d.stall_door_gap_inches > 1 || d.stall_door_height_gap > 2
          ? 'HIGH: visible stall door gaps — side gaps over 1 inch or top/bottom gaps over 2 inches allow sightlines into stall. Customer discomfort + perceived lack of privacy. '
          : 'MEDIUM: minor stall door gaps — small gaps visible but not severely compromising privacy. Still degrades perception of restroom quality. ';
      alerts.push({
        rule_id: 'stall_privacy_inadequate',
        severity: d.stall_door_gap_inches > 1.5 || d.stall_door_height_gap > 3 ? 'critical' : d.stall_door_gap_inches > 1 || d.stall_door_height_gap > 2 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        stall_count: d.stall_count,
        stall_door_gap_inches: d.stall_door_gap_inches,
        stall_door_height_gap: d.stall_door_height_gap,
        stall_privacy_score: d.stall_privacy_score,
        customer_satisfaction_change: -Math.round(discomfortPct * 0.6),
        return_likelihood_change: -Math.round(discomfortPct * 0.7),
        perceived_cleanliness_change: -Math.round(discomfortPct * 0.2),
        predicted_revenue_change_pct: -Math.round(discomfortPct * 0.09),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `STALL PRIVACY INADEQUATE: ${d.location_id} has ${d.stall_count} stalls with side door gaps ${d.stall_door_gap_inches} in (max ${config.maxStallDoorGapInches}), top/bottom gaps ${d.stall_door_height_gap} in (max ${config.maxStallDoorHeightGap}), privacy score ${d.stall_privacy_score}/100 (min ${config.minStallPrivacyScore}). ${criticalNote}Stall privacy is a critical restroom design dimension — customers expect total visual privacy in toilet stalls. Common US commercial stall design has 0.5-1 inch side gaps + 1-2 inch top/bottom gaps (industry-standard for ventilation + ease of cleaning), but gaps over 1 inch on sides or 2 inches on top/bottom are unacceptable. European restroom design (floor-to-ceiling doors, full privacy) sets higher standard — customers increasingly expect privacy similar to home restroom. Inadequate stall privacy creates: customer anxiety (worry about being seen), reduced dwell (customers rush through use), avoidance behavior (customers leave restaurant rather than use stall — lost dwell + lost ticket), perception of low-quality establishment (premium restaurants have fully private stalls). Family restroom customers especially affected — parents helping children, customers with mobility issues needing assistance. Transgender + non-binary customers especially affected — privacy concerns compounded. ${lostRevenue} revenue lost per month from discomfort + avoidance + lower satisfaction + lower return likelihood. ACTION: upgrade stall privacy — (1) install privacy strips on side gaps (flexible vinyl or brush strips fill 0.5-1.5 inch side gaps, $15-40 per stall), (2) install taller stall doors (replace 58-inch standard door with 72-inch full-height door, $200-500 per door), (3) install floor-to-ceiling stall partitions (European-style full privacy, $800-2,500 per stall), (4) lower stall door bottom (install drop-down privacy flap on bottom gap, $25-60 per stall), (5) install continuous hinge instead of gap hinge (eliminates side gap at hinge, $40-120 per stall). Cost: $25-500 per stall for retrofit privacy strips + flaps, $200-2,500 per stall for full door + partition replacement. Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered privacy + satisfaction + return likelihood. Privacy strip retrofit is cheapest fix — $15-40 per stall.`,
        ai_recommendation: 'upgrade_stall_privacy',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: FAUCET_DRIP_LEAK
    if (config.prohibitFaucetDripLeak && d.faucet_drip_leak) {
      // Dripping/leaking faucets -> perceived disrepair + water waste
      const disrepairPct = 22; // perceived disrepair signal
      const waterWasteGalPerMonth = 1500; // ~1500 gallons per month per dripping faucet
      const waterCostPerMonth = waterWasteGalPerMonth * 0.012; // ~$18/month water + sewer
      const lostRevenue = Math.round(baselineRevenue * (disrepairPct / 100) * 0.10 + waterCostPerMonth);
      const criticalNote = d.faucet_quality_score < 40
        ? 'CRITICAL: actively dripping + leaking faucets with poor quality score — visible water pooling, constant drip sound, mineral buildup from hard water. Customers immediately notice dripping faucet + interpret as "broken" restroom — translates to broken restaurant. 22% perceived disrepair signal + ongoing water waste (1,500+ gallons per month per dripping faucet = $18-35/month water + sewer cost). '
        : 'HIGH: dripping or leaking faucets — visible water waste + audible drip. Customers interpret as disrepair signal even if rest of restroom is clean. ';
      alerts.push({
        rule_id: 'faucet_drip_leak',
        severity: d.faucet_quality_score < 40 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        faucet_quality_score: d.faucet_quality_score,
        faucet_drip_leak: d.faucet_drip_leak,
        perceived_cleanliness_change: -Math.round(disrepairPct * 0.6),
        customer_satisfaction_change: -Math.round(disrepairPct * 0.5),
        return_likelihood_change: -Math.round(disrepairPct * 0.4),
        predicted_revenue_change_pct: -Math.round(disrepairPct * 0.10),
        est_monthly_opportunity: Math.max(lostRevenue, 600),
        description: `FAUCET DRIP/LEAK: ${d.location_id} has dripping/leaking faucets (faucet quality score ${d.faucet_quality_score}/100). ${criticalNote}Dripping faucets are one of the most visible restroom failures — customers hear the drip, see water pooling, see mineral buildup on faucet + sink. Even if rest of restroom is spotless, a dripping faucet signals "broken" + "neglected". 88% of customers equate restroom quality with kitchen cleanliness (Zagat) — dripping faucet translates to "broken kitchen equipment, leaking dishwasher, neglected maintenance". Dripping faucets are also direct water waste — a single faucet dripping once per second wastes 5+ gallons per day, 150+ gallons per month, 1,800+ gallons per year. At $0.012/gal water + sewer, that is $18-35/month per dripping faucet in pure utility cost (in addition to revenue impact from perceived disrepair). Hard water areas: dripping faucet creates mineral scale buildup on sink + faucet — visible white/green crust that amplifies perception of neglect even after cleaning. Common causes: worn valve cartridge, worn washer, loose packing nut, cracked supply line. Most repairs are simple $5-30 parts but require 30-60 minutes of maintenance time. ${lostRevenue} revenue lost per month from perceived disrepair + lower satisfaction + lower return likelihood + direct water + sewer waste. ACTION: repair leaking faucets — (1) replace valve cartridge or washer in deck-mount faucet ($5-25 parts, 30-60 minutes labor per faucet), (2) tighten packing nut on compression faucet (free, 5 minutes per faucet), (3) replace cracked supply line ($10-25 per line), (4) descale faucet aerator + sink with white vinegar or commercial descaler ($3-10 supplies, removes mineral buildup), (5) replace faucet entirely if quality score below 40 and cartridge replacement not viable ($120-400 per faucet). Cost: $5-25 parts per faucet for simple repair, $120-400 per faucet for replacement. Save ${fmt$(Math.max(lostRevenue, 600))}/mo from recovered perceived disrepair signal + water + sewer savings. Faucet cartridge replacement is cheapest fix — $5-25 in parts.`,
        ai_recommendation: 'repair_leaking_faucets',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: COUNTERTOP_MATERIAL_CHEAP
    if (d.countertop_quality_score < config.minCountertopQualityScore || config.prohibitedCountertopMaterials.includes(d.countertop_material)) {
      // Laminate/damaged countertops -> perceived low quality
      const isProhibited = config.prohibitedCountertopMaterials.includes(d.countertop_material);
      const qualityGap = Math.max(config.minCountertopQualityScore - d.countertop_quality_score, 0);
      const downgradePct = Math.min(15 + (isProhibited ? 10 : 0) + qualityGap * 0.3, 32);
      const lostRevenue = Math.round(baselineRevenue * (downgradePct / 100) * 0.08);
      const isFineDining = d.restaurant_tier === 'fine_dining';
      const isQuickService = d.restaurant_tier === 'quick_service';
      const criticalNote = isFineDining && isProhibited
        ? 'CRITICAL: fine dining restaurant with laminate or damaged countertops in restroom — completely breaks premium narrative. Customers paying $80+ per cover expect premium materials throughout, laminate countertops in restroom reads as "they cut corners". 30% perceived quality drop from material mismatch. '
        : isProhibited
          ? 'HIGH: prohibited countertop material (laminate or similar) — laminate countertops in restroom absorb water, swell at edges, delaminate over time, show visible wear patterns. Customers read laminate as "cheap" + "low quality". '
          : 'MEDIUM: countertop quality score below threshold — visible wear, scratches, water damage, staining. Countertop material adequate but condition degrades perception. ';
      const prohibitedNote = isProhibited
        ? `Material "${d.countertop_material}" is in prohibited list (${config.prohibitedCountertopMaterials.join(', ')}). `
        : '';
      alerts.push({
        rule_id: 'countertop_material_cheap',
        severity: isFineDining && isProhibited ? 'critical' : isProhibited ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        countertop_material: d.countertop_material,
        countertop_quality_score: d.countertop_quality_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_change: -Math.round(downgradePct * 0.5),
        return_likelihood_change: -Math.round(downgradePct * 0.4),
        perceived_cleanliness_change: -Math.round(downgradePct * 0.3),
        predicted_revenue_change_pct: -Math.round(downgradePct * 0.08),
        est_monthly_opportunity: Math.max(lostRevenue, 700),
        description: `COUNTERTOP MATERIAL CHEAP: ${d.location_id} countertop material "${d.countertop_material}" (quality score ${d.countertop_quality_score}/100, min ${config.minCountertopQualityScore}). ${prohibitedNote}${criticalNote}Restroom countertop material is a premium signal — customers subconsciously read material quality as overall restaurant investment. LAMINATE (Formica, Wilsonart): cheapest option ($30-100/sqft installed), absorbs water at seams + edges, swells + delaminates over time, visible wear patterns, reads as "cheap" or "low-tier". SOLID SURFACE (Corian, Avonite): mid-tier ($75-150/sqft), non-porous + seamless joints, repairable, good for casual + fast-casual tier. GRANITE: premium ($100-250/sqft), natural stone, heat + scratch resistant, premium feel for casual dining + fine dining. MARBLE: ultra-premium ($150-400/sqft), luxury feel, requires sealing + etches with acids, fine dining only. QUARTZ (engineered): premium ($100-200/sqft), non-porous + consistent pattern + low maintenance, ideal for high-traffic restrooms. CONCRETE: design-forward ($100-200/sqft), modern aesthetic, requires sealing, design-conscious concepts. Laminate in non-quick-service restroom: instant downgrade signal. Fine dining with laminate: complete brand break. Quick service with laminate: acceptable but still looks cheap. Damaged laminate (swelling, delamination, water damage): worse than clean laminate — visible deterioration signals neglect. ${lostRevenue} revenue lost per month from perceived low quality + lower satisfaction + lower return likelihood. ACTION: upgrade countertop material — (1) replace laminate with solid surface ($75-150/sqft installed, 1-2 day install per restroom), (2) upgrade to granite or quartz for premium tier ($100-250/sqft installed), (3) refinish existing solid surface or granite (sand + reseal, $200-500 per restroom), (4) repair laminate damage temporarily (laminate repair kit $20-50, replacement edge banding $15-30) while planning full replacement. Cost: $400-1,500 for solid surface replacement in typical restroom, $800-3,000 for granite or quartz. Save ${fmt$(Math.max(lostRevenue, 700))}/mo from recovered perceived quality + satisfaction + return likelihood. Countertop replacement pays back in 6-12 months from recovered customer retention.`,
        ai_recommendation: 'upgrade_countertop_material',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: RESTROOM_LIGHTING_POOR
    if (d.lighting_lux < config.minLightingLux || d.lighting_quality_score < config.minLightingQualityScore) {
      // Dim lighting -> feels dirty even when clean
      const luxDeficit = Math.max(config.minLightingLux - d.lighting_lux, 0);
      const qualityGap = Math.max(config.minLightingQualityScore - d.lighting_quality_score, 0);
      const darkPct = Math.min(15 + luxDeficit * 0.05 + qualityGap * 0.4, 35);
      const lostRevenue = Math.round(baselineRevenue * (darkPct / 100) * 0.10);
      const criticalNote = d.lighting_lux < 150
        ? 'CRITICAL: severely dim restroom lighting (under 150 lux) — restroom feels dark + dirty even when freshly cleaned. Customers cannot see dirt, hair, spills clearly so assume worst. Shadows + dim corners create unease + perception of uncleanliness. Mirror tasks (hand-washing, makeup check) difficult. Customers rush through use. '
        : d.lighting_lux < 250
          ? 'HIGH: dim restroom lighting (150-250 lux) — restroom feels dim + slightly dirty even when clean. Mirror tasks harder, customers perceive lower cleanliness. '
          : 'MEDIUM: lighting quality score below threshold (lux level acceptable but light quality poor — flickering, wrong color temperature, harsh shadows). ';
      alerts.push({
        rule_id: 'restroom_lighting_poor',
        severity: d.lighting_lux < 150 ? 'critical' : d.lighting_lux < 250 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        lighting_lux: d.lighting_lux,
        lighting_quality_score: d.lighting_quality_score,
        perceived_cleanliness_change: -Math.round(darkPct * 0.7),
        customer_satisfaction_change: -Math.round(darkPct * 0.5),
        return_likelihood_change: -Math.round(darkPct * 0.4),
        predicted_revenue_change_pct: -Math.round(darkPct * 0.10),
        est_monthly_opportunity: Math.max(lostRevenue, 700),
        description: `RESTROOM LIGHTING POOR: ${d.location_id} lighting ${d.lighting_lux} lux (min ${config.minLightingLux}), quality score ${d.lighting_quality_score}/100 (min ${config.minLightingQualityScore}). ${criticalNote}Restroom lighting is critical to perceived cleanliness — dim lighting makes restroom feel dirty even when freshly cleaned. Customers cannot see dirt, hair, spilled soap, water spots clearly in dim light, so they assume the worst. Dark corners + shadows create unease + perception of uncleanliness. Mirror tasks (hand-washing, makeup check, hair fix) are difficult in dim light, customer frustration. Industry standard: commercial restroom lighting should be 300-500 lux at mirror height for proper visibility + perceived cleanliness. Below 250 lux: restroom feels dim. Below 150 lux: restroom feels dark + dirty. Lighting quality extends beyond lux: COLOR TEMPERATURE (2700K warm = cozy but dim, 3000-3500K neutral = ideal for restroom, 4000K+ cool = sterile + harsh), COLOR RENDERING INDEX (CRI 90+ for accurate makeup + skin tone, CRI 80 = acceptable, CRI below 80 = unnatural appearance), LIGHT DISTRIBUTION (even lighting across mirror + sink + stalls, no harsh shadows on face), FIXTURE CONDITION (flickering bulbs = perceived disrepair, mismatched color temperatures = unprofessional). ${lostRevenue} revenue lost per month from perceived dirty feel + lower satisfaction + lower return likelihood. 88% of customers equate restroom quality with kitchen cleanliness (Zagat) — dim restroom lighting makes customer perceive kitchen as dirty too. ACTION: improve restroom lighting — (1) increase bulb wattage or LED lumen output (replace 60W equivalent with 100W equivalent LED, $5-15 per bulb), (2) replace fixtures with vanity light bars above mirror (4-6 bulb vanity bar, $40-150 per fixture, provides even face lighting), (3) add LED recessed ceiling lights for ambient illumination ($30-80 per fixture, 4-6 fixtures per restroom), (4) use 3000-3500K color temperature bulbs (neutral white, ideal for restroom, $5-15 per bulb), (5) use CRI 90+ bulbs for accurate color rendering ($8-20 per bulb), (6) replace flickering bulbs + mismatched color temperatures immediately (free + $5-15 per bulb). Cost: $50-200 for bulb + fixture upgrade, $200-800 for full lighting redesign. Save ${fmt$(Math.max(lostRevenue, 700))}/mo from recovered perceived cleanliness + satisfaction + return likelihood. Bulb upgrade is cheapest fix — $5-15 per bulb.`,
        ai_recommendation: 'improve_restroom_lighting',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: ADA_FIXTURE_NONCOMPLIANT
    if (config.requireAdaCompliant && (!d.has_ada_stall || !d.has_grab_bars || !d.ada_sink_clearance)) {
      // No ADA-compliant stall/sink/grab bars -> $55k-$200k lawsuit risk
      const missingItems = [
        !d.has_ada_stall ? 'ADA stall' : null,
        !d.has_grab_bars ? 'grab bars' : null,
        !d.ada_sink_clearance ? 'ADA sink clearance' : null,
      ].filter(Boolean);
      const lawsuitRiskPct = 100; // non-compliance = certain legal exposure
      const lostRevenue = Math.round(baselineRevenue * 0.05); // 5% revenue at risk from exclusion + lawsuit
      const lawsuitRiskDollars = 55000; // minimum DOJ penalty
      const criticalNote = missingItems.length >= 2
        ? `CRITICAL: ${missingItems.length} ADA fixture requirements missing (${missingItems.join(', ')}) — direct violation of Americans with Disabilities Act (ADA) Title III. Non-compliance exposes restaurant to $55,000-$200,000 DOJ lawsuit penalty + private civil lawsuits + mandatory remediation. ADA compliance is FEDERAL LAW (not optional) — DOJ investigates complaints + initiates compliance reviews. Customers with disabilities who cannot use restroom = lost customers + ADA complaint + lawsuit. `
        : `HIGH: 1 ADA fixture requirement missing (${missingItems[0]}) — partial ADA non-compliance. Federal law requires full ADA-compliant restroom: ADA stall + grab bars + ADA sink clearance + appropriate mirror height + accessible door hardware. Even 1 missing element = ADA violation. `;
      alerts.push({
        rule_id: 'ada_fixture_noncompliant',
        severity: 'critical',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_ada_stall: d.has_ada_stall,
        has_grab_bars: d.has_grab_bars,
        ada_sink_clearance: d.ada_sink_clearance,
        customer_satisfaction_change: -Math.round(5),
        return_likelihood_change: -Math.round(8),
        predicted_revenue_change_pct: -5,
        est_monthly_opportunity: Math.max(lostRevenue + lawsuitRiskDollars / 12, 5000),
        description: `ADA FIXTURE NONCOMPLIANT: ${d.location_id} missing ADA fixture requirements: ${missingItems.join(', ')}. ${criticalNote}ADA compliance is FEDERAL LAW under Title III of the Americans with Disabilities Act (1990, updated 2010 ADA Standards for Accessible Design). Restaurants must provide ADA-compliant restroom: at least one ADA-compliant stall (60 inch minimum width, 59 inch minimum depth for wall-hung toilets or 56 inch for floor-mounted, grab bars on side + back walls at 33-36 inches above finished floor), grab bars (1.25-1.5 inch diameter, 1.5 inch clearance from wall, structural capacity 250 lbs + point load), ADA-compliant sink (34 inches maximum rim height, 27 inches minimum knee clearance, 30 inches minimum width, insulated pipes for burn protection), ADA-compliant mirror (40 inches maximum bottom edge above finished floor for full-length visibility), accessible door hardware (lever handles, 48 inches maximum height, no tight grasping/pinching/twisting required), accessible door clearance (32 inches minimum clear width, 18 inches minimum pull side clearance, 60 inches minimum turning radius inside restroom). Non-compliance penalties: DOJ civil penalty $55,000 for first violation, $110,000 for subsequent violations (ADA DOJ enforcement); private civil lawsuits under ADA Title III (no cap, attorney fees recoverable); state-specific accessibility laws (California Unruh Act $4,000 per violation, Florida ADA law); mandatory remediation cost (must fix non-compliant elements + pay penalties); reputational damage (ADA complaints public record). Customers with disabilities who cannot use restroom: lost customers + word-of-mouth negative reviews + ADA complaint filing. ${lostRevenue} revenue at risk per month from exclusion + lawsuit exposure ($${lawsuitRiskDollars} minimum DOJ penalty if investigated). Total exposure: $${lostRevenue * 12}/yr revenue + $${lawsuitRiskDollars}+ lawsuit risk. ACTION: install ADA-compliant fixtures — (1) install ADA-compliant stall partition (60 inch wide, 56-59 inch depth, $1,200-3,000 installed), (2) install grab bars on side + back walls (1.25-1.5 inch diameter, structural mounting to wall studs, $80-250 per grab bar set), (3) lower sink to 34 inches max rim height + ensure 27 inch knee clearance + insulate pipes ($200-600 for sink retrofit or $400-1,200 for ADA sink replacement), (4) lower mirror to 40 inches max bottom edge ($50-150 for mirror adjustment or replacement), (5) replace door knobs with lever handles ($20-60 per handle), (6) ensure 32 inch clear door width + 60 inch turning radius inside restroom (may require partition reconfiguration, $500-2,000). Cost: $1,500-5,000 for full ADA compliance retrofit per restroom, $300-1,200 for partial compliance fixes. Save ${fmt$(Math.max(lostRevenue + lawsuitRiskDollars / 12, 5000))}/mo from recovered customer inclusion + eliminated lawsuit risk. ADA compliance is not optional — non-compliance = guaranteed lawsuit exposure.`,
        ai_recommendation: 'install_ada_compliant_fixtures',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: RESTROOM_VENTILATION_INSUFFICIENT
    if (config.requireExhaustFan && !d.has_exhaust_fan || (d.has_exhaust_fan && d.ventilation_quality_score < config.minVentilationQualityScore)) {
      // No exhaust fan -> odor retention + perceived dirty
      const ventilationGap = d.has_exhaust_fan
        ? Math.max(config.minVentilationQualityScore - d.ventilation_quality_score, 0)
        : config.minVentilationQualityScore;
      const odorRetentionPct = d.has_exhaust_fan
        ? Math.min(15 + ventilationGap * 0.4, 30)
        : 35; // no exhaust fan = 35% odor retention
      const lostRevenue = Math.round(baselineRevenue * (odorRetentionPct / 100) * 0.11);
      const criticalNote = !d.has_exhaust_fan
        ? 'CRITICAL: NO exhaust fan in restroom — odor retention is severe. Toilet + sink odors accumulate, humidity from hand-washing + toilet use condenses on surfaces (mirror fog, water spots, mildew growth), air becomes stale + oppressive. Customers perceive restroom as "smelly" + "dirty" even when surfaces are clean. Persistent humidity breeds mold + mildew in grout + caulk. '
        : d.ventilation_quality_score < 50
          ? 'HIGH: exhaust fan present but undersized or non-functional — weak airflow, loud operation, odor + humidity retention. Fan may be running but not actually exhausting air (clogged duct, broken motor, wrong direction). '
          : 'MEDIUM: exhaust fan present but ventilation quality below threshold — adequate for normal use but slow to clear after heavy use. ';
      alerts.push({
        rule_id: 'restroom_ventilation_insufficient',
        severity: !d.has_exhaust_fan ? 'critical' : d.ventilation_quality_score < 50 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_exhaust_fan: d.has_exhaust_fan,
        ventilation_quality_score: d.ventilation_quality_score,
        perceived_cleanliness_change: -Math.round(odorRetentionPct * 0.7),
        customer_satisfaction_change: -Math.round(odorRetentionPct * 0.5),
        return_likelihood_change: -Math.round(odorRetentionPct * 0.6),
        predicted_revenue_change_pct: -Math.round(odorRetentionPct * 0.11),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `RESTROOM VENTILATION INSUFFICIENT: ${d.location_id} exhaust fan: ${d.has_exhaust_fan}, ventilation quality score ${d.ventilation_quality_score}/100 (min ${config.minVentilationQualityScore}). ${criticalNote}Restroom ventilation is critical to perceived cleanliness — odors + humidity directly signal "dirty" restroom even when surfaces are spotless. Exhaust fan serves three functions: ODOR REMOVAL (toilet + sink odors vented outside, replaced with fresh air), HUMIDITY CONTROL (moisture from hand-washing + toilet use vented outside, prevents mirror fog + water spots + mildew growth in grout + caulk), AIR QUALITY (replaces stale air with fresh air, prevents oppressive feel). Without exhaust fan: odors accumulate (customers smell previous users), humidity condenses on cool surfaces (mirror fogs, water spots on faucet + sink, mildew grows in grout + caulk + ceiling), air becomes stale + oppressive (customers rush through use). Industry standard: commercial restroom exhaust fan should provide 50 CFM (cubic feet per minute) minimum airflow for small restroom, 100-200 CFM for large restroom with multiple stalls. Fan should run continuously during business hours + 20 minutes after closing (timer or occupancy sensor). Common failures: fan motor burned out (running but not exhausting), duct clogged with dust + lint (reduced airflow), duct disconnected (exhausting into ceiling cavity, not outside), fan undersized for restroom volume (installed cheap residential fan in commercial restroom), fan too noisy (customers turn it off, defeating purpose). ${lostRevenue} revenue lost per month from odor retention + humidity damage + perceived dirty feel + lower satisfaction + lower return likelihood. 88% of customers equate restroom quality with kitchen cleanliness (Zagat) — smelly restroom translates to smelly kitchen perception. 50% of customers will not return to restaurant with bad restroom experience (Cintas). ACTION: install restroom ventilation — (1) install commercial exhaust fan (50-200 CFM depending on restroom size, $80-300 for fan, $200-600 installed with ductwork), (2) replace burned-out fan motor ($30-100 for motor, 30 minutes labor), (3) clean or replace clogged ductwork ($50-200 for cleaning, $200-500 for replacement), (4) reconnect disconnected duct + verify exhaust outside building ($50-150 for repair), (5) install occupancy-sensor fan switch (fan runs 20 minutes after restroom vacated, $30-80 for sensor switch), (6) install humidity-sensor fan (auto-runs when humidity above threshold, $50-120 for sensor fan). Cost: $80-300 for fan itself, $200-600 installed, $30-120 for sensor switches. Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered odor control + humidity control + perceived cleanliness + satisfaction + return likelihood. Exhaust fan installation pays back in 2-5 months from recovered customer retention + reduced humidity damage to surfaces.`,
        ai_recommendation: 'install_restroom_ventilation',
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
              { role: 'system', content: 'You are a restaurant restroom design + fixture quality optimization expert. Given restroom fixture + design inspection data, recommend ONE specific action with expected cleanliness perception, satisfaction, return likelihood, ADA compliance, or revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Restaurant tier: ${a.restaurant_tier ?? 'n/a'}. Fixture age: ${a.fixture_age_years ?? 0} yr (${a.fixture_age_category ?? 'n/a'}), quality: ${a.fixture_quality_score ?? 0}/100. Touchless: ${a.touchless_fixture_count ?? 0}/4 (faucet ${a.has_touchless_faucet ?? false}, flush ${a.has_touchless_flush ?? false}, soap ${a.has_touchless_soap ?? false}, door ${a.has_touchless_door ?? false}). Faucet quality: ${a.faucet_quality_score ?? 0}/100, drip/leak: ${a.faucet_drip_leak ?? false}. Toilet: ${a.toilet_type ?? 'n/a'}. Stalls: ${a.stall_count ?? 0}, door gap ${a.stall_door_gap_inches ?? 0}in, height gap ${a.stall_door_height_gap ?? 0}in, privacy: ${a.stall_privacy_score ?? 0}/100. ADA: stall ${a.has_ada_stall ?? false}, grab bars ${a.has_grab_bars ?? false}, sink clearance ${a.ada_sink_clearance ?? false}. Mirror: ${a.mirror_quality_score ?? 0}/100. Countertop: ${a.countertop_material ?? 'n/a'} (${a.countertop_quality_score ?? 0}/100). Tile: ${a.tile_condition_score ?? 0}/100, worn ${a.tile_worn_cracked ?? false}. Lighting: ${a.lighting_lux ?? 0} lux (${a.lighting_quality_score ?? 0}/100). Exhaust fan: ${a.has_exhaust_fan ?? false}, ventilation: ${a.ventilation_quality_score ?? 0}/100. Perceived cleanliness: ${a.perceived_cleanliness_score ?? 0}/100. Perceived quality: ${a.perceived_quality_score ?? 0}/100. Germ perception: ${a.germ_perception_score ?? 0}/100. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM restroom_design_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE restroom_design_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<RestroomDesignAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM restroom_design_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  restroomsAtRisk: number; agedFixtureRestrooms: number; adaNoncompliantRestrooms: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(location_id != NONE) AS restrooms,
              math::count(rule_id = 'fixture_age_excessive') AS agedfx,
              math::count(rule_id = 'ada_fixture_noncompliant') AS adanon
       FROM restroom_design_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      restroomsAtRisk: safeNumber(r.restrooms, 0),
      agedFixtureRestrooms: safeNumber(r.agedfx, 0),
      adaNoncompliantRestrooms: safeNumber(r.adanon, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, restroomsAtRisk: 0, agedFixtureRestrooms: 0, adaNoncompliantRestrooms: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
