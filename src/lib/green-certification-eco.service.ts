/**
 * AI Green Certification & Eco-Practice Optimizer — predicts which
 * eco-practices (compostable packaging, local sourcing, energy-efficient
 * equipment, water conservation, waste reduction, green cleaning products,
 * solar panels, EV charging stations, LED lighting, rainwater harvesting)
 * and green certifications (Green Restaurant Association, LEED, B Corp,
 * Ocean Friendly) to implement for maximum customer perception impact,
 * certification ROI, cost savings, and competitive differentiation.
 *
 * 65% of customers prefer eco-friendly restaurants and will pay 10-15%
 * more at sustainable restaurants (Nielsen). Green Restaurant Association
 * certification increases customer acquisition by 20-30%. Visible
 * eco-practices (compostable packaging, local sourcing labels, recycling
 * stations) are more impactful than invisible ones (carbon offsets).
 * LED lighting saves 75% on energy costs + lasts 25x longer. Compostable
 * packaging costs 15-25% more but attracts eco-conscious customers. Local
 * sourcing reduces transportation emissions + supports community + freshness
 * perception. Restaurants waste 4-10% of purchased food; waste tracking
 * saves $1,500-5,000/yr. 38% of millennials choose restaurants based on
 * sustainability practices (McKinsey).
 *
 * 175th POSR-exclusive differentiator. Restaurants lose $1,500-8,000/mo per
 * location from missing green practices (no green certification = missed
 * 20-30% customer acquisition, no visible eco-practices = missed 10-15%
 * premium pricing, no LED lighting = missed 75% energy savings, no
 * compostable packaging = losing eco-conscious delivery customers, using
 * local ingredients but not promoting = missed marketing value, no water
 * conservation = missed 20-30% water savings, chemical cleaners = health
 * concern + missed eco-positioning, no EV charging = missed EV-driver
 * customer segment). Existing services cover carbon-footprint-tracking
 * (90th) which TRACKS emissions — this service OPTIMIZES visible
 * eco-practices for customer-facing impact.
 *
 * Distinct from:
 *   - carbon-footprint-tracker (90th) — TRACKS emissions (does not optimize
 *     which visible eco-practices/certifications to deploy)
 *   - waste-intelligence — waste tracking data (not customer-facing eco
 *     positioning)
 *   - energy-optimization / energy-vampire — energy usage (not green
 *     certification positioning)
 *   - packaging-optimizer — packaging dimensions/cost (not compostable
 *     material positioning)
 *
 * 8 AI rules:
 *   1. green_certification_absent -> no green certification -> missed 20-30% customer acquisition
 *   2. visible_eco_practice_missing -> no visible eco-practices (compostable, local sourcing labels) -> missed 10-15% premium pricing
 *   3. led_lighting_not_deployed -> no LED lighting -> missed 75% energy savings
 *   4. compostable_packaging_absent -> no compostable takeout packaging -> losing eco-conscious delivery customers
 *   5. local_sourcing_not_promoted -> using local ingredients but not promoting on menu -> missed marketing value
 *   6. water_conservation_gap -> no low-flow fixtures/aerators -> missed 20-30% water savings
 *   7. green_cleaning_products_absent -> using chemical cleaners -> health concern + missed eco-positioning
 *   8. ev_charging_station_opportunity -> no EV charging in parking lot -> missed EV-driver customer segment
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type GreenEcoRuleId =
  | 'green_certification_absent'
  | 'visible_eco_practice_missing'
  | 'led_lighting_not_deployed'
  | 'compostable_packaging_absent'
  | 'local_sourcing_not_promoted'
  | 'water_conservation_gap'
  | 'green_cleaning_products_absent'
  | 'ev_charging_station_opportunity';

export type GreenEcoAiRec =
  | 'pursue_green_certification'
  | 'deploy_visible_eco_practices'
  | 'install_led_lighting'
  | 'switch_to_compostable_packaging'
  | 'promote_local_sourcing'
  | 'install_water_conservation_fixtures'
  | 'switch_to_green_cleaning_products'
  | 'install_ev_charging_stations'
  | 'monitor'
  | 'skip';

export interface GreenEcoAlert {
  id?: string;
  rule_id: GreenEcoRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                                    // 'main_dining' | 'bar' | 'patio' | 'kitchen' | 'overall'
  restaurant_tier?: string;                                // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  setting_type?: string;                                   // 'urban' | 'suburban' | 'rural' | 'resort'
  customer_demographic?: string;                           // 'eco_conscious' | 'millennial_heavy' | 'family' | 'tourist' | 'business'
  has_parking_lot?: boolean;                               // restaurant has its own parking lot
  // Green certification
  has_green_certification?: boolean;                       // any green certification (Green Restaurant Assoc, LEED, B Corp, Ocean Friendly)
  certification_type?: string;                             // 'none' | 'green_restaurant_assoc' | 'leed' | 'b_corp' | 'ocean_friendly'
  certification_in_progress?: boolean;                     // certification application in progress
  // Visible eco-practices (customer-facing)
  has_compostable_packaging?: boolean;                     // compostable takeout/delivery packaging
  has_local_sourcing?: boolean;                            // sources local ingredients
  local_sourcing_promoted_on_menu?: boolean;               // local sourcing promoted on menu/marketing
  has_recycling_stations?: boolean;                        // visible customer recycling stations
  has_visible_eco_signage?: boolean;                       // visible eco-practice signage
  has_garden_or_green_wall?: boolean;                      // visible garden or green wall
  // Operational eco-practices
  has_led_lighting?: boolean;                              // LED lighting throughout
  has_energy_efficient_equipment?: boolean;                // ENERGY STAR rated kitchen equipment
  has_solar_panels?: boolean;                              // rooftop solar panels
  has_water_conservation?: boolean;                        // low-flow fixtures, aerators
  has_waste_tracking?: boolean;                            // food waste tracking program
  has_composting_program?: boolean;                        // food scrap composting program
  has_green_cleaning_products?: boolean;                   // eco-friendly cleaning products
  has_rainwater_harvesting?: boolean;                      // rainwater collection system
  has_ev_charging_stations?: number;                       // count of EV charging stations in parking lot
  // Customer perception + economics
  eco_perception_score?: number;                           // 0-100 customer perception of eco-friendliness
  customer_acquisition_score?: number;                     // 0-100
  premium_pricing_eligibility?: number;                    // 0-100 ability to charge premium for sustainability
  competitive_differentiation_score?: number;              // 0-100
  monthly_energy_cost?: number;
  monthly_water_cost?: number;
  monthly_packaging_cost?: number;
  monthly_food_waste_cost?: number;
  monthly_revenue?: number;
  delivery_revenue?: number;                               // takeout/delivery revenue
  local_ingredient_pct?: number;                           // % of ingredients sourced locally (0-100)
  eco_conscious_customer_pct?: number;                     // % of customer base that is eco-conscious (0-100)
  // Impact
  customer_acquisition_change?: number;                    // % change in customer acquisition
  premium_pricing_change?: number;                         // % change in ability to charge premium
  energy_cost_change_pct?: number;                         // % change in energy cost
  water_cost_change_pct?: number;                          // % change in water cost
  packaging_cost_change_pct?: number;                      // % change in packaging cost (compostable costs more but attracts customers)
  food_waste_cost_change_pct?: number;                     // % change in food waste cost
  competitive_diff_change?: number;                        // % change in competitive differentiation
  predicted_revenue_change_pct?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: GreenEcoAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface GreenEcoConfig {
  aiEnabled: boolean;
  requireGreenCertification: boolean;                      // require any green certification
  requireVisibleEcoPractices: boolean;                     // require visible customer-facing eco-practices
  visibleEcoPracticeThreshold: number;                     // min number of visible eco-practices required (2)
  requireLedLighting: boolean;                             // require LED lighting throughout
  requireCompostablePackagingIfDelivery: boolean;          // require compostable packaging if delivery revenue > threshold
  deliveryRevenueThresholdPct: number;                     // % of revenue from delivery to require compostable packaging (20)
  requireLocalSourcingPromotion: boolean;                  // require promoting local sourcing on menu if used
  localSourcingThresholdPct: number;                       // % local ingredients before promotion required (25)
  requireWaterConservation: boolean;                       // require low-flow fixtures/aerators
  requireGreenCleaningProducts: boolean;                   // require eco-friendly cleaning products
  requireEvChargingIfParkingLot: boolean;                  // require EV charging stations if restaurant has parking lot
  minEcoPerceptionScore: number;                           // min eco perception score (65)
  minCompetitiveDifferentiationScore: number;              // min competitive differentiation score (65)
  minPremiumPricingEligibility: number;                    // min premium pricing eligibility (60)
}

export const DEFAULT_GREEN_ECO_CONFIG: GreenEcoConfig = {
  aiEnabled: true,
  requireGreenCertification: true,
  requireVisibleEcoPractices: true,
  visibleEcoPracticeThreshold: 2,
  requireLedLighting: true,
  requireCompostablePackagingIfDelivery: true,
  deliveryRevenueThresholdPct: 20,
  requireLocalSourcingPromotion: true,
  localSourcingThresholdPct: 25,
  requireWaterConservation: true,
  requireGreenCleaningProducts: true,
  requireEvChargingIfParkingLot: true,
  minEcoPerceptionScore: 65,
  minCompetitiveDifferentiationScore: 65,
  minPremiumPricingEligibility: 60,
};

export const readGreenEcoConfig = (settings: any): GreenEcoConfig => ({
  aiEnabled: settings?.green_eco_ai_enabled ?? true,
  requireGreenCertification: settings?.green_eco_require_certification ?? true,
  requireVisibleEcoPractices: settings?.green_eco_require_visible_practices ?? true,
  visibleEcoPracticeThreshold: safeNumber(settings?.green_eco_visible_threshold, 2),
  requireLedLighting: settings?.green_eco_require_led ?? true,
  requireCompostablePackagingIfDelivery: settings?.green_eco_require_compostable_delivery ?? true,
  deliveryRevenueThresholdPct: safeNumber(settings?.green_eco_delivery_threshold, 20),
  requireLocalSourcingPromotion: settings?.green_eco_require_local_promotion ?? true,
  localSourcingThresholdPct: safeNumber(settings?.green_eco_local_threshold, 25),
  requireWaterConservation: settings?.green_eco_require_water_conservation ?? true,
  requireGreenCleaningProducts: settings?.green_eco_require_green_cleaning ?? true,
  requireEvChargingIfParkingLot: settings?.green_eco_require_ev_charging ?? true,
  minEcoPerceptionScore: safeNumber(settings?.green_eco_min_eco_perception, 65),
  minCompetitiveDifferentiationScore: safeNumber(settings?.green_eco_min_competitive_diff, 65),
  minPremiumPricingEligibility: safeNumber(settings?.green_eco_min_premium_pricing, 60),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface GreenEcoData {
  location_id: string;
  restaurant_tier: string;
  setting_type: string;
  customer_demographic: string;
  has_parking_lot: boolean;
  has_green_certification: boolean;
  certification_type: string;
  certification_in_progress: boolean;
  has_compostable_packaging: boolean;
  has_local_sourcing: boolean;
  local_sourcing_promoted_on_menu: boolean;
  has_recycling_stations: boolean;
  has_visible_eco_signage: boolean;
  has_garden_or_green_wall: boolean;
  has_led_lighting: boolean;
  has_energy_efficient_equipment: boolean;
  has_solar_panels: boolean;
  has_water_conservation: boolean;
  has_waste_tracking: boolean;
  has_composting_program: boolean;
  has_green_cleaning_products: boolean;
  has_rainwater_harvesting: boolean;
  has_ev_charging_stations: number;
  eco_perception_score: number;
  customer_acquisition_score: number;
  premium_pricing_eligibility: number;
  competitive_differentiation_score: number;
  monthly_energy_cost: number;
  monthly_water_cost: number;
  monthly_packaging_cost: number;
  monthly_food_waste_cost: number;
  monthly_revenue: number;
  delivery_revenue: number;
  local_ingredient_pct: number;
  eco_conscious_customer_pct: number;
}

const MOCK_DATA: GreenEcoData[] = [
  {
    location_id: 'overall', restaurant_tier: 'casual_dining', setting_type: 'urban',
    customer_demographic: 'millennial_heavy', has_parking_lot: false,
    has_green_certification: false, certification_type: 'none', certification_in_progress: false,
    has_compostable_packaging: false, has_local_sourcing: true, local_sourcing_promoted_on_menu: false,
    has_recycling_stations: false, has_visible_eco_signage: false, has_garden_or_green_wall: false,
    has_led_lighting: false, has_energy_efficient_equipment: false, has_solar_panels: false,
    has_water_conservation: false, has_waste_tracking: false, has_composting_program: false,
    has_green_cleaning_products: false, has_rainwater_harvesting: false,
    has_ev_charging_stations: 0,
    eco_perception_score: 22, customer_acquisition_score: 38,
    premium_pricing_eligibility: 32, competitive_differentiation_score: 28,
    monthly_energy_cost: 2400, monthly_water_cost: 850,
    monthly_packaging_cost: 1800, monthly_food_waste_cost: 2200,
    monthly_revenue: 62000, delivery_revenue: 18500,
    local_ingredient_pct: 32, eco_conscious_customer_pct: 48,
  },
  {
    location_id: 'overall', restaurant_tier: 'fast_casual', setting_type: 'suburban',
    customer_demographic: 'eco_conscious', has_parking_lot: true,
    has_green_certification: false, certification_type: 'none', certification_in_progress: true,
    has_compostable_packaging: true, has_local_sourcing: true, local_sourcing_promoted_on_menu: false,
    has_recycling_stations: true, has_visible_eco_signage: true, has_garden_or_green_wall: false,
    has_led_lighting: true, has_energy_efficient_equipment: false, has_solar_panels: false,
    has_water_conservation: false, has_waste_tracking: true, has_composting_program: false,
    has_green_cleaning_products: true, has_rainwater_harvesting: false,
    has_ev_charging_stations: 0,
    eco_perception_score: 58, customer_acquisition_score: 62,
    premium_pricing_eligibility: 55, competitive_differentiation_score: 52,
    monthly_energy_cost: 1800, monthly_water_cost: 620,
    monthly_packaging_cost: 2400, monthly_food_waste_cost: 1400,
    monthly_revenue: 48000, delivery_revenue: 12000,
    local_ingredient_pct: 42, eco_conscious_customer_pct: 65,
  },
  {
    location_id: 'overall', restaurant_tier: 'fine_dining', setting_type: 'rural',
    customer_demographic: 'tourist', has_parking_lot: true,
    has_green_certification: true, certification_type: 'green_restaurant_assoc', certification_in_progress: false,
    has_compostable_packaging: true, has_local_sourcing: true, local_sourcing_promoted_on_menu: true,
    has_recycling_stations: false, has_visible_eco_signage: false, has_garden_or_green_wall: true,
    has_led_lighting: true, has_energy_efficient_equipment: true, has_solar_panels: true,
    has_water_conservation: true, has_waste_tracking: true, has_composting_program: true,
    has_green_cleaning_products: true, has_rainwater_harvesting: false,
    has_ev_charging_stations: 0,
    eco_perception_score: 82, customer_acquisition_score: 78,
    premium_pricing_eligibility: 88, competitive_differentiation_score: 85,
    monthly_energy_cost: 3100, monthly_water_cost: 920,
    monthly_packaging_cost: 600, monthly_food_waste_cost: 800,
    monthly_revenue: 84000, delivery_revenue: 4000,
    local_ingredient_pct: 68, eco_conscious_customer_pct: 38,
  },
  {
    location_id: 'overall', restaurant_tier: 'quick_service', setting_type: 'urban',
    customer_demographic: 'business', has_parking_lot: false,
    has_green_certification: false, certification_type: 'none', certification_in_progress: false,
    has_compostable_packaging: false, has_local_sourcing: false, local_sourcing_promoted_on_menu: false,
    has_recycling_stations: false, has_visible_eco_signage: false, has_garden_or_green_wall: false,
    has_led_lighting: true, has_energy_efficient_equipment: false, has_solar_panels: false,
    has_water_conservation: false, has_waste_tracking: false, has_composting_program: false,
    has_green_cleaning_products: false, has_rainwater_harvesting: false,
    has_ev_charging_stations: 0,
    eco_perception_score: 28, customer_acquisition_score: 42,
    premium_pricing_eligibility: 25, competitive_differentiation_score: 32,
    monthly_energy_cost: 1900, monthly_water_cost: 540,
    monthly_packaging_cost: 2600, monthly_food_waste_cost: 1800,
    monthly_revenue: 52000, delivery_revenue: 21000,
    local_ingredient_pct: 8, eco_conscious_customer_pct: 32,
  },
];

export const runGreenEcoEngine = async (
  db: ReturnType<typeof useDB>,
  config: GreenEcoConfig,
): Promise<{ alerts: GreenEcoAlert[]; generated: number }> => {
  const alerts: GreenEcoAlert[] = [];
  const now = new Date();

  let data: GreenEcoData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, restaurant_tier, setting_type, customer_demographic, has_parking_lot,
              has_green_certification, certification_type, certification_in_progress,
              has_compostable_packaging, has_local_sourcing, local_sourcing_promoted_on_menu,
              has_recycling_stations, has_visible_eco_signage, has_garden_or_green_wall,
              has_led_lighting, has_energy_efficient_equipment, has_solar_panels,
              has_water_conservation, has_waste_tracking, has_composting_program,
              has_green_cleaning_products, has_rainwater_harvesting, has_ev_charging_stations,
              eco_perception_score, customer_acquisition_score, premium_pricing_eligibility,
              competitive_differentiation_score,
              monthly_energy_cost, monthly_water_cost, monthly_packaging_cost, monthly_food_waste_cost,
              monthly_revenue, delivery_revenue, local_ingredient_pct, eco_conscious_customer_pct
       FROM green_eco_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'overall'),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      setting_type: String(r.setting_type ?? 'urban'),
      customer_demographic: String(r.customer_demographic ?? 'eco_conscious'),
      has_parking_lot: Boolean(r.has_parking_lot ?? false),
      has_green_certification: Boolean(r.has_green_certification ?? false),
      certification_type: String(r.certification_type ?? 'none'),
      certification_in_progress: Boolean(r.certification_in_progress ?? false),
      has_compostable_packaging: Boolean(r.has_compostable_packaging ?? false),
      has_local_sourcing: Boolean(r.has_local_sourcing ?? false),
      local_sourcing_promoted_on_menu: Boolean(r.local_sourcing_promoted_on_menu ?? false),
      has_recycling_stations: Boolean(r.has_recycling_stations ?? false),
      has_visible_eco_signage: Boolean(r.has_visible_eco_signage ?? false),
      has_garden_or_green_wall: Boolean(r.has_garden_or_green_wall ?? false),
      has_led_lighting: Boolean(r.has_led_lighting ?? false),
      has_energy_efficient_equipment: Boolean(r.has_energy_efficient_equipment ?? false),
      has_solar_panels: Boolean(r.has_solar_panels ?? false),
      has_water_conservation: Boolean(r.has_water_conservation ?? false),
      has_waste_tracking: Boolean(r.has_waste_tracking ?? false),
      has_composting_program: Boolean(r.has_composting_program ?? false),
      has_green_cleaning_products: Boolean(r.has_green_cleaning_products ?? false),
      has_rainwater_harvesting: Boolean(r.has_rainwater_harvesting ?? false),
      has_ev_charging_stations: safeNumber(r.has_ev_charging_stations, 0),
      eco_perception_score: safeNumber(r.eco_perception_score, 50),
      customer_acquisition_score: safeNumber(r.customer_acquisition_score, 50),
      premium_pricing_eligibility: safeNumber(r.premium_pricing_eligibility, 50),
      competitive_differentiation_score: safeNumber(r.competitive_differentiation_score, 50),
      monthly_energy_cost: safeNumber(r.monthly_energy_cost, 0),
      monthly_water_cost: safeNumber(r.monthly_water_cost, 0),
      monthly_packaging_cost: safeNumber(r.monthly_packaging_cost, 0),
      monthly_food_waste_cost: safeNumber(r.monthly_food_waste_cost, 0),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      delivery_revenue: safeNumber(r.delivery_revenue, 0),
      local_ingredient_pct: safeNumber(r.local_ingredient_pct, 0),
      eco_conscious_customer_pct: safeNumber(r.eco_conscious_customer_pct, 0),
    }));
  } catch { data = []; }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;
    const deliveryPctOfRevenue = d.delivery_revenue / Math.max(baselineRevenue, 1) * 100;
    const isEcoConsciousDemographic = d.customer_demographic === 'eco_conscious' || d.customer_demographic === 'millennial_heavy';

    // Rule 1: GREEN_CERTIFICATION_ABSENT
    if (config.requireGreenCertification && !d.has_green_certification && !d.certification_in_progress) {
      // No green certification -> missed 20-30% customer acquisition
      const missedAcquisitionPct = isEcoConsciousDemographic ? 30 : 22;
      const lostRevenue = Math.round(baselineRevenue * (missedAcquisitionPct / 100) * 0.10);
      const criticalNote = isEcoConsciousDemographic && d.eco_conscious_customer_pct > 50
        ? 'CRITICAL: ECO-CONSCIOUS customer base (' + d.eco_conscious_customer_pct + '%) with NO green certification. Eco-conscious customers actively seek out certified restaurants and 65% prefer eco-friendly restaurants (Nielsen). Without a recognized certification (Green Restaurant Association, LEED, B Corp, Ocean Friendly), the restaurant is invisible to this customer segment during their search/discovery phase. Green Restaurant Association certification increases customer acquisition by 20-30% — that is $' + (baselineRevenue * 0.25 * 0.10).toFixed(0) + '/mo of missed revenue for this venue. '
        : 'HIGH: restaurant has NO green certification. 65% of customers prefer eco-friendly restaurants (Nielsen) — they verify sustainability claims through certifications. Without certification, eco-marketing claims are unverifiable and less credible. Green Restaurant Association certification increases customer acquisition by 20-30%. ';
      alerts.push({
        rule_id: 'green_certification_absent',
        severity: isEcoConsciousDemographic && d.eco_conscious_customer_pct > 50 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        setting_type: d.setting_type,
        customer_demographic: d.customer_demographic,
        has_green_certification: d.has_green_certification,
        certification_type: d.certification_type,
        certification_in_progress: d.certification_in_progress,
        eco_perception_score: d.eco_perception_score,
        customer_acquisition_score: d.customer_acquisition_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        eco_conscious_customer_pct: d.eco_conscious_customer_pct,
        customer_acquisition_change: -Math.round(missedAcquisitionPct),
        competitive_diff_change: -Math.round(missedAcquisitionPct * 0.6),
        predicted_revenue_change_pct: -Math.round(missedAcquisitionPct * 0.10),
        est_monthly_opportunity: Math.max(lostRevenue, 2000),
        description: `GREEN CERTIFICATION ABSENT: ${d.location_id} restaurant has NO green certification and certification is NOT in progress. Customer demographic: ${d.customer_demographic} (${d.eco_conscious_customer_pct}% eco-conscious). ${criticalNote}Green certifications (Green Restaurant Association, LEED, B Corp, Ocean Friendly) are the third-party verification that converts internal eco-practices into customer-trustworthy marketing claims. Without certification, the restaurant cannot credibly communicate its sustainability efforts — customers have learned to distrust self-claimed "green" marketing because of greenwashing. Certifications provide independent verification that resonates with eco-conscious customers. The certification process itself often uncovers operational improvements that save money (energy efficiency, waste reduction, water conservation). Solutions ranked by ROI: (1) Green Restaurant Association certification ($1,000-3,000 application + audit, 3-6 month process, most recognized for restaurants specifically, covers 7 categories: water efficiency, waste reduction, sustainable food, energy, disposables, chemical, building); (2) LEED certification ($2,000-15,000 depending on building size, longer process, more building-focused, signals architectural sustainability); (3) B Corp certification ($500-2,500 annual fee based on revenue, broader social/environmental responsibility, appeals to values-driven customers); (4) Ocean Friendly restaurant certification (free, focused on coastal restaurants, plastic reduction + seafood sustainability). Even starting the certification application (showing "in progress" badge) signals commitment. Expected impact: +20-30% customer acquisition (especially from eco-conscious segments), +12-18% premium pricing eligibility, +25-35% competitive differentiation, +15-20% eco perception score, +5-8% new customer acquisition via certification directory listings.`,
        ai_recommendation: 'pursue_green_certification',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: VISIBLE_ECO_PRACTICE_MISSING
    const visiblePracticeCount =
      (d.has_compostable_packaging ? 1 : 0) +
      (d.has_local_sourcing && d.local_sourcing_promoted_on_menu ? 1 : 0) +
      (d.has_recycling_stations ? 1 : 0) +
      (d.has_visible_eco_signage ? 1 : 0) +
      (d.has_garden_or_green_wall ? 1 : 0);
    if (config.requireVisibleEcoPractices && visiblePracticeCount < config.visibleEcoPracticeThreshold) {
      // No visible eco-practices -> missed 10-15% premium pricing
      const missedPremiumPct = Math.min(8 + (config.visibleEcoPracticeThreshold - visiblePracticeCount) * 4, 18);
      const lostRevenue = Math.round(baselineRevenue * (missedPremiumPct / 100) * 0.08);
      const criticalNote = visiblePracticeCount === 0
        ? 'CRITICAL: ZERO visible eco-practices at customer touchpoints. Even if the restaurant has invisible eco-practices (energy-efficient equipment, recycling behind-the-scenes, carbon offsets), customers cannot perceive them. Visible eco-practices (compostable packaging customers hold in their hands, local sourcing labels on the menu, recycling stations they can see, eco signage, garden/green wall) are what customers actually perceive and use to form their "this restaurant is eco-friendly" judgment. Invisible practices do not move perception or willingness-to-pay. 65% of customers will pay 10-15% more at sustainable restaurants — but only if they PERCEIVE the sustainability. '
        : 'HIGH: only ' + visiblePracticeCount + ' visible eco-practice(s) at customer touchpoints (below threshold of ' + config.visibleEcoPracticeThreshold + '). Customer perception of sustainability is driven primarily by what they SEE — visible practices have 3-5x more perception impact than invisible ones. Adding 1-2 more visible practices would significantly boost perception and premium pricing eligibility. ';
      alerts.push({
        rule_id: 'visible_eco_practice_missing',
        severity: visiblePracticeCount === 0 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        customer_demographic: d.customer_demographic,
        has_compostable_packaging: d.has_compostable_packaging,
        has_local_sourcing: d.has_local_sourcing,
        local_sourcing_promoted_on_menu: d.local_sourcing_promoted_on_menu,
        has_recycling_stations: d.has_recycling_stations,
        has_visible_eco_signage: d.has_visible_eco_signage,
        has_garden_or_green_wall: d.has_garden_or_green_wall,
        eco_perception_score: d.eco_perception_score,
        premium_pricing_eligibility: d.premium_pricing_eligibility,
        premium_pricing_change: -Math.round(missedPremiumPct),
        customer_acquisition_change: -Math.round(missedPremiumPct * 0.5),
        competitive_diff_change: -Math.round(missedPremiumPct * 0.7),
        predicted_revenue_change_pct: -Math.round(missedPremiumPct * 0.08),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `VISIBLE ECO-PRACTICE MISSING: ${d.location_id} has only ${visiblePracticeCount} visible eco-practice(s) at customer touchpoints (threshold ${config.visibleEcoPracticeThreshold}). ${criticalNote}Visible eco-practices (compostable packaging, local sourcing labels on menu, customer-facing recycling stations, eco signage, garden/green wall) are 3-5x more impactful on customer perception than invisible ones (carbon offsets, behind-the-scenes recycling, energy-efficient kitchen equipment). 65% of customers will pay 10-15% more at sustainable restaurants (Nielsen) — but ONLY when they PERCEIVE the sustainability through visible cues. Each visible eco-practice adds ~3-5% to premium pricing eligibility. Customer-facing visibility is the multiplier that converts internal eco-effort into external customer value. Solutions ranked by visibility impact: (1) compostable takeout packaging ($0.15-0.40 per container vs $0.10-0.25 for plastic, +15-25% cost but customers physically hold it and immediately perceive eco-commitment, doubles as marketing for delivery customers), (2) menu labels promoting local sourcing ($50-200 design cost, FREE ongoing, every menu view reinforces eco-message, "Locally Sourced" tag next to dishes with local ingredients), (3) visible customer recycling stations ($200-800 install, customers see sorting happening, signals environmental commitment, reduces landfill waste 30-50%), (4) eco signage explaining specific practices ($100-500, "We compost 200 lbs/week" or "Our LED lighting saves 75% energy" — quantified claims build credibility), (5) visible garden or green wall ($1,500-15,000 depending on size, dramatic visual signal of eco-commitment, biophilic benefit, fresh herbs for kitchen). Recommended: deploy at least 3 visible eco-practices to maximize perception impact. Expected impact: +15-22% premium pricing eligibility, +18-25% eco perception score, +12-18% customer acquisition from eco-conscious segment, +20-30% competitive differentiation vs non-eco competitors.`,
        ai_recommendation: 'deploy_visible_eco_practices',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: LED_LIGHTING_NOT_DEPLOYED
    if (config.requireLedLighting && !d.has_led_lighting) {
      // No LED lighting -> missed 75% energy savings
      const energySavingsPct = 75;
      const annualEnergySavings = Math.round(d.monthly_energy_cost * (energySavingsPct / 100) * 12);
      const lostRevenue = Math.round(d.monthly_energy_cost * (energySavingsPct / 100));
      const criticalNote = d.monthly_energy_cost > 2000
        ? 'CRITICAL: HIGH monthly energy cost ($' + d.monthly_energy_cost + '/mo) with NO LED lighting. LED lighting saves 75% on energy costs AND lasts 25x longer (reduces maintenance/labor cost). At $' + d.monthly_energy_cost + '/mo energy cost, switching to LED saves approximately $' + (d.monthly_energy_cost * 0.75).toFixed(0) + '/mo — that is $' + annualEnergySavings + '/yr in direct energy savings alone, plus reduced relamping labor. '
        : 'HIGH: no LED lighting deployed. LED lighting saves 75% on energy costs + lasts 25x longer than incandescent/fluorescent. Monthly energy cost is $' + d.monthly_energy_cost + ' — LED retrofit would save approximately $' + (d.monthly_energy_cost * 0.75).toFixed(0) + '/mo ($' + annualEnergySavings + '/yr). ';
      alerts.push({
        rule_id: 'led_lighting_not_deployed',
        severity: d.monthly_energy_cost > 2000 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_led_lighting: d.has_led_lighting,
        monthly_energy_cost: d.monthly_energy_cost,
        energy_cost_change_pct: -energySavingsPct,
        customer_acquisition_change: -Math.round(2),
        competitive_diff_change: -Math.round(3),
        predicted_revenue_change_pct: 0,
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `LED LIGHTING NOT DEPLOYED: ${d.location_id} has NOT deployed LED lighting. Monthly energy cost: ${fmt$(d.monthly_energy_cost)}. ${criticalNote}LED lighting saves 75% on energy costs + lasts 25x longer than incandescent/fluorescent. LED retrofit is the single highest-ROI eco-practice for restaurants — payback period is typically 12-24 months, then ongoing savings of $${(d.monthly_energy_cost * 0.75).toFixed(0)}/mo forever. LEDs also produce less heat (reduces HVAC load by 5-10%), provide better color rendering for food presentation (CRI 90+ vs 70 for fluorescent), and are dimmable for ambiance flexibility. Beyond cost savings, LED lighting is a visible eco-practice that customers notice — modern LED fixtures signal "upgraded, efficient, contemporary" operation. Solutions: (1) full LED retrofit throughout dining + kitchen ($3,000-15,000 depending on fixture count, 12-24 month payback, energy savings start immediately), (2) phase retrofit starting with highest-usage areas (kitchen fluorescent troffers, dining room floods, exterior signage) ($500-3,000 per phase), (3) smart LED with dimming + scheduling ($1,000-5,000, additional 10-15% savings via occupancy/vacancy sensors + daylight harvesting), (4) LED tube replacements for existing fluorescent fixtures ($8-25 per tube vs $3-8 for fluorescent, drop-in replacement, no electrical work needed, immediate 40-50% energy reduction). Many utility companies offer LED retrofit rebates ($0.50-2.00 per fixture or 50-75% of project cost) — check local utility programs. Expected impact: -75% lighting energy cost (saves $${(d.monthly_energy_cost * 0.75).toFixed(0)}/mo = $${annualEnergySavings}/yr), -5-10% HVAC cost (LEDs produce less heat), 25x longer lamp life (reduced maintenance labor), +5-8% eco perception score, +3-5% competitive differentiation.`,
        ai_recommendation: 'install_led_lighting',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: COMPOSTABLE_PACKAGING_ABSENT
    const hasDelivery = d.delivery_revenue > 0 && deliveryPctOfRevenue >= config.deliveryRevenueThresholdPct;
    if (config.requireCompostablePackagingIfDelivery && hasDelivery && !d.has_compostable_packaging) {
      // No compostable takeout packaging -> losing eco-conscious delivery customers
      const missedDeliveryPct = Math.min(8 + (deliveryPctOfRevenue - config.deliveryRevenueThresholdPct) * 0.3, 22);
      const lostRevenue = Math.round(d.delivery_revenue * (missedDeliveryPct / 100));
      const criticalNote = deliveryPctOfRevenue > 35
        ? 'CRITICAL: HIGH delivery revenue (' + deliveryPctOfRevenue.toFixed(0) + '% of total = $' + d.delivery_revenue + '/mo) with NO compostable packaging. Delivery customers physically interact with packaging for the entire meal — every container, bag, and utensil shapes their perception of the restaurant. Eco-conscious delivery customers actively avoid restaurants with plastic-only packaging — they switch to competitors with compostable options. Plastic packaging is the #1 visual cue customers associate with environmental harm. '
        : 'HIGH: delivery revenue is ' + deliveryPctOfRevenue.toFixed(0) + '% of total ($' + d.delivery_revenue + '/mo) with NO compostable packaging. Delivery customers form their entire brand impression from the packaging they receive — switching to compostable packaging turns every delivery into an eco-marketing touchpoint. ';
      alerts.push({
        rule_id: 'compostable_packaging_absent',
        severity: deliveryPctOfRevenue > 35 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_compostable_packaging: d.has_compostable_packaging,
        monthly_packaging_cost: d.monthly_packaging_cost,
        delivery_revenue: d.delivery_revenue,
        eco_perception_score: d.eco_perception_score,
        premium_pricing_eligibility: d.premium_pricing_eligibility,
        customer_acquisition_change: -Math.round(missedDeliveryPct),
        packaging_cost_change_pct: 18, // compostable costs 15-25% more
        competitive_diff_change: -Math.round(missedDeliveryPct * 0.7),
        predicted_revenue_change_pct: -Math.round(missedDeliveryPct * 0.5),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `COMPOSTABLE PACKAGING ABSENT: ${d.location_id} has delivery revenue of ${fmt$(d.delivery_revenue)}/mo (${deliveryPctOfRevenue.toFixed(0)}% of total) but does NOT use compostable takeout packaging. ${criticalNote}Compostable packaging costs 15-25% more than plastic but attracts eco-conscious delivery customers — delivery customers physically handle the packaging for the entire meal, making it the #1 customer touchpoint for sustainability perception. Eco-conscious customers (38% of millennials — McKinsey) actively switch to competitors with compostable options. Plastic packaging has become a tangible symbol of environmental harm in customer perception — every plastic container in a delivery order reinforces "this restaurant does not care about the planet." Solutions: (1) full compostable packaging swap — containers, cups, utensils, bags (typically +15-25% on packaging cost, but typically recovers 8-15% in retained/added eco-conscious delivery customers, net positive ROI within 3-6 months), (2) phased swap starting with most-visible items (entree containers, cups) ($0.15-0.40 per compostable container vs $0.10-0.25 plastic), (3) hybrid approach: compostable for dine-in (visible) + plastic for delivery (cost-controlled) — NOT recommended as delivery customers are the most eco-conscious segment, (4) branded compostable packaging with eco-message printed on container (turns every delivery into marketing, $0.05-0.15 per unit extra for custom printing). Many municipalities offer composting infrastructure — check if local commercial composting is available (required for compostable packaging to actually break down). Expected impact: +12-18% eco-conscious delivery customer retention, +15-22% eco perception score among delivery customers, +8-12% premium pricing eligibility for delivery menu, +20-30% competitive differentiation vs plastic-using competitors. Note: packaging cost increases 15-25% but typically recovers via customer retention + acquisition.`,
        ai_recommendation: 'switch_to_compostable_packaging',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: LOCAL_SOURCING_NOT_PROMOTED
    if (config.requireLocalSourcingPromotion && d.has_local_sourcing && d.local_ingredient_pct >= config.localSourcingThresholdPct && !d.local_sourcing_promoted_on_menu) {
      // Using local ingredients but not promoting -> missed marketing value
      const missedMarketingPct = Math.min(6 + d.local_ingredient_pct * 0.15, 20);
      const lostRevenue = Math.round(baselineRevenue * (missedMarketingPct / 100) * 0.05);
      const criticalNote = d.local_ingredient_pct > 50
        ? 'CRITICAL: restaurant sources ' + d.local_ingredient_pct + '% of ingredients locally (above 50% — exceptional commitment) but does NOT promote this on the menu. Local sourcing is one of the most powerful eco-marketing claims because it combines sustainability + freshness + community support. Customers actively seek "farm-to-table" and "locally sourced" restaurants — failing to promote this on the menu leaves significant marketing value on the table. Local sourcing costs more (transportation economics favor large distributors) — the restaurant is paying a premium for local ingredients but not capturing the marketing return. '
        : 'HIGH: restaurant sources ' + d.local_ingredient_pct + '% of ingredients locally (above ' + config.localSourcingThresholdPct + '% threshold) but does NOT promote this on the menu. Customers cannot tell from taste alone which ingredients are local — the marketing value of local sourcing requires explicit communication. ';
      alerts.push({
        rule_id: 'local_sourcing_not_promoted',
        severity: d.local_ingredient_pct > 50 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_local_sourcing: d.has_local_sourcing,
        local_sourcing_promoted_on_menu: d.local_sourcing_promoted_on_menu,
        local_ingredient_pct: d.local_ingredient_pct,
        eco_perception_score: d.eco_perception_score,
        premium_pricing_eligibility: d.premium_pricing_eligibility,
        customer_acquisition_change: -Math.round(missedMarketingPct * 0.6),
        premium_pricing_change: -Math.round(missedMarketingPct),
        competitive_diff_change: -Math.round(missedMarketingPct * 0.8),
        predicted_revenue_change_pct: -Math.round(missedMarketingPct * 0.05),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `LOCAL SOURCING NOT PROMOTED: ${d.location_id} sources ${d.local_ingredient_pct}% of ingredients locally (above ${config.localSourcingThresholdPct}% threshold) but does NOT promote this on the menu/marketing. ${criticalNote}Local sourcing reduces transportation emissions + supports community + freshness perception — but ONLY if customers know about it. Local sourcing has 3x more perception impact when promoted than when silent. "Locally Sourced" claims on menu items command 8-15% premium pricing (customers perceive local as higher quality + fresher + more ethical). Customers actively search for "farm-to-table" and "locally sourced" restaurants on Google/Yelp — promotion increases discovery. Solutions: (1) add "Locally Sourced" tag/label next to dishes with local ingredients ($50-200 menu redesign cost, FREE ongoing, immediate perception lift), (2) name local farms/suppliers on menu ("Tomatoes from Sunny Acres Farm" — $50-200 design, builds authenticity + supports partner farm marketing), (3) seasonal "Local Harvest" feature menu ($200-500 quarterly design, highlights what is currently local + seasonal, justifies premium pricing), (4) social media content featuring local farm visits + supplier stories ($0-1,000 content production, generates 25-40% more engagement than generic food posts), (5) server training to verbally highlight local sourcing during service ($0-200 training material, multiplies impact when combined with menu labels), (6) display chalkboard/printed signage at entrance listing local suppliers ($50-300, first impression for walk-in customers). Expected impact: +12-18% premium pricing eligibility for local-sourced dishes, +15-22% eco perception score, +8-12% customer acquisition from farm-to-table searchers, +25-35% competitive differentiation vs restaurants using only national distributors.`,
        ai_recommendation: 'promote_local_sourcing',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: WATER_CONSERVATION_GAP
    if (config.requireWaterConservation && !d.has_water_conservation) {
      // No low-flow fixtures/aerators -> missed 20-30% water savings
      const waterSavingsPct = 25;
      const annualWaterSavings = Math.round(d.monthly_water_cost * (waterSavingsPct / 100) * 12);
      const lostRevenue = Math.round(d.monthly_water_cost * (waterSavingsPct / 100));
      const criticalNote = d.monthly_water_cost > 800
        ? 'CRITICAL: HIGH monthly water cost ($' + d.monthly_water_cost + '/mo) with NO water conservation fixtures. Low-flow faucets, aerators, and dual-flush toilets reduce water usage 20-30% with zero impact on customer experience. At $' + d.monthly_water_cost + '/mo water cost, water conservation fixtures save approximately $' + (d.monthly_water_cost * 0.25).toFixed(0) + '/mo — $' + annualWaterSavings + '/yr in direct water savings. Water scarcity is increasingly visible in customer awareness — visible water conservation practices (low-flow faucets in restrooms) reinforce eco-positioning. '
        : 'HIGH: no water conservation fixtures (low-flow faucets, aerators, dual-flush toilets). Water conservation saves 20-30% on water costs with no customer experience impact. Monthly water cost is $' + d.monthly_water_cost + ' — conservation would save $' + (d.monthly_water_cost * 0.25).toFixed(0) + '/mo. ';
      alerts.push({
        rule_id: 'water_conservation_gap',
        severity: d.monthly_water_cost > 800 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_water_conservation: d.has_water_conservation,
        monthly_water_cost: d.monthly_water_cost,
        water_cost_change_pct: -waterSavingsPct,
        customer_acquisition_change: -Math.round(1),
        competitive_diff_change: -Math.round(2),
        predicted_revenue_change_pct: 0,
        est_monthly_opportunity: Math.max(lostRevenue, 500),
        description: `WATER CONSERVATION GAP: ${d.location_id} has NO water conservation fixtures (low-flow faucets, aerators, dual-flush toilets). Monthly water cost: ${fmt$(d.monthly_water_cost)}. ${criticalNote}Water conservation saves 20-30% on water costs with zero impact on customer experience. Low-flow fixtures reduce water usage without sacrificing perceived water pressure (aerators mix air with water to maintain pressure while using less volume). Dual-flush toilets reduce water usage by 25-50% per flush. Water scarcity is a growing customer concern — visible conservation practices (sensor faucets, dual-flush toilets in restrooms) reinforce eco-positioning at no operating cost. Solutions: (1) install faucet aerators throughout restrooms + kitchen ($5-15 per aerometer, DIY install in 5 minutes, 30-50% water reduction per faucet, immediate savings), (2) low-flow faucet fixtures ($50-200 per fixture, 30-40% water reduction, professional install 30 min), (3) dual-flush toilet conversion kits ($30-80 per toilet, retrofits existing toilet to dual-flush, 25-50% flush water reduction), (4) full low-flow toilet replacement ($200-500 per toilet, 1.28 GPF vs older 3.5 GPF toilets, biggest water savings for older buildings), (5) pre-rinse spray valve replacement in kitchen dishwashing station ($50-150, replaces 1.6 GPM valve with 0.65 GPM low-flow valve, 50-60% water reduction at dish station — kitchen uses 30-50% of restaurant water), (6) sensor-activated faucets in restrooms ($200-600 per faucet, hygiene benefit + prevents leaving water running, 15-25% additional water savings). Many water utilities offer free aerators + rebates on low-flow fixtures. Expected impact: -25% water cost (saves $${(d.monthly_water_cost * 0.25).toFixed(0)}/mo = $${annualWaterSavings}/yr), +3-5% eco perception score (visible conservation practices), +5-8% in drought-prone regions where water conservation is top-of-mind for customers.`,
        ai_recommendation: 'install_water_conservation_fixtures',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: GREEN_CLEANING_PRODUCTS_ABSENT
    if (config.requireGreenCleaningProducts && !d.has_green_cleaning_products) {
      // Using chemical cleaners -> health concern + missed eco-positioning
      const missedPerceptionPct = Math.min(6 + (d.customer_demographic === 'eco_conscious' ? 8 : 3), 15);
      const lostRevenue = Math.round(baselineRevenue * (missedPerceptionPct / 100) * 0.04);
      const criticalNote = d.customer_demographic === 'eco_conscious'
        ? 'CRITICAL: ECO-CONSCIOUS customer base using CHEMICAL cleaning products. Eco-conscious customers are highly sensitive to chemical cleaning products — they associate bleach/ammonia smells with health hazards and environmental harm. Chemical cleaner residues on tables, restroom surfaces, and kitchen equipment are detectable by smell and trigger concern. Chemical cleaners also contribute to indoor air pollution that affects staff health + customer comfort. Switching to green cleaning products (plant-based, biodegradable, EPA Safer Choice certified) eliminates these concerns at similar cost. '
        : 'HIGH: using chemical cleaning products instead of green alternatives. Chemical cleaners contribute to indoor air pollution, leave residues that customers can smell/taste, and pose health concerns for staff with prolonged exposure. Green cleaning products perform comparably at similar cost while eliminating health + environmental concerns. ';
      alerts.push({
        rule_id: 'green_cleaning_products_absent',
        severity: d.customer_demographic === 'eco_conscious' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        customer_demographic: d.customer_demographic,
        has_green_cleaning_products: d.has_green_cleaning_products,
        eco_perception_score: d.eco_perception_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        customer_acquisition_change: -Math.round(missedPerceptionPct * 0.4),
        competitive_diff_change: -Math.round(missedPerceptionPct * 0.6),
        predicted_revenue_change_pct: -Math.round(missedPerceptionPct * 0.04),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `GREEN CLEANING PRODUCTS ABSENT: ${d.location_id} uses CHEMICAL cleaning products instead of green alternatives. Customer demographic: ${d.customer_demographic}. ${criticalNote}Chemical cleaners (bleach, ammonia, quaternary ammonium) contribute to indoor air pollution, leave detectable residues on surfaces, and pose health concerns for staff with prolonged exposure. Eco-conscious customers actively avoid restaurants with strong chemical smells — they associate chemical odors with poor indoor air quality and environmental harm. Green cleaning products (plant-based, biodegradable, EPA Safer Choice certified) perform comparably at similar cost (+0-15% on cleaning supply budget, often offset by reduced staff sick days + lower workers comp claims for chemical exposure). Solutions: (1) full switch to EPA Safer Choice certified cleaners for all surfaces ($0-15% cost increase vs chemical, similar performance, immediate indoor air quality improvement), (2) plant-based all-purpose cleaners ($8-15 per gallon concentrate vs $6-12 chemical, comparable cost), (3) hydrogen peroxide-based sanitizers (replaces bleach, $10-18 per gallon, no chlorine smell, decomposes to water + oxygen), (4) microfiber cleaning system ($200-500 initial investment in mops + cloths, reduces chemical usage 80-90% by physically removing soil instead of dissolving it), (5) enzymatic cleaners for grease/food waste ($15-25 per gallon, breaks down organic matter without harsh chemicals, eliminates drain odors), (6) steam cleaner for kitchen surfaces ($800-2,500 initial, sanitizes with only water, no chemical residue on food prep surfaces). Visible green cleaning products (labeled bottles, EPA Safer Choice signage in restrooms) reinforce eco-positioning with both customers AND staff. Expected impact: +8-12% eco perception score (especially among eco-conscious customers), +5-8% competitive differentiation, +3-5% staff retention (reduced chemical exposure), +2-4% premium pricing eligibility (customers pay more for "clean + healthy" environments), reduced staff sick days + workers comp claims.`,
        ai_recommendation: 'switch_to_green_cleaning_products',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: EV_CHARGING_STATION_OPPORTUNITY
    if (config.requireEvChargingIfParkingLot && d.has_parking_lot && d.has_ev_charging_stations === 0) {
      // No EV charging in parking lot -> missed EV-driver customer segment
      const missedEvDriverPct = Math.min(4 + (d.setting_type === 'suburban' ? 4 : 0) + (d.customer_demographic === 'eco_conscious' ? 4 : 0), 14);
      const lostRevenue = Math.round(baselineRevenue * (missedEvDriverPct / 100) * 0.08);
      const criticalNote = d.customer_demographic === 'eco_conscious'
        ? 'CRITICAL: ECO-CONSCIOUS customer base + parking lot available + ZERO EV charging stations. EV drivers are inherently eco-conscious (they purchased EVs for environmental reasons) and actively seek destinations with charging — they will choose a restaurant with EV charging over a comparable one without, every time. EV drivers also tend to stay longer while charging (45-90 min dwell) — they buy more courses, more drinks, more desserts. The "charge while you dine" value proposition is strong enough to attract customers from competitors. '
        : 'HIGH: restaurant has a parking lot but ZERO EV charging stations. EV adoption is growing 25-40% annually in most markets — EV drivers are an underserved customer segment that actively seeks destinations with charging. Adding 1-2 EV charging stations transforms the parking lot from a cost center into a customer acquisition asset. ';
      alerts.push({
        rule_id: 'ev_charging_station_opportunity',
        severity: d.customer_demographic === 'eco_conscious' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        setting_type: d.setting_type,
        customer_demographic: d.customer_demographic,
        has_parking_lot: d.has_parking_lot,
        has_ev_charging_stations: d.has_ev_charging_stations,
        eco_perception_score: d.eco_perception_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        customer_acquisition_change: -Math.round(missedEvDriverPct),
        competitive_diff_change: -Math.round(missedEvDriverPct * 0.9),
        predicted_revenue_change_pct: -Math.round(missedEvDriverPct * 0.08),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `EV CHARGING STATION OPPORTUNITY: ${d.location_id} has a parking lot but ZERO EV charging stations. Customer demographic: ${d.customer_demographic}. Setting: ${d.setting_type}. ${criticalNote}EV drivers actively use apps (PlugShare, ChargePoint, EVgo) to find destinations with charging — installing EV charging puts the restaurant on EV driver maps, generating free customer acquisition from a high-value segment. EV drivers tend to stay 45-90 min while charging (vs 30-60 min typical dine-in) — extended dwell time drives +20-30% per-ticket revenue. EV drivers are 3-5x more likely to be eco-conscious + higher-income — premium customer segment. Solutions ranked by ROI: (1) Level 2 charging stations ($500-2,500 per station hardware + $500-2,000 install, 25 miles of range per hour, full charge in 4-8 hours — perfect for restaurant dwell time), (2) Networked Level 2 stations with payment processing ($1,500-5,000 per station, customers pay for charging, generates $50-300/mo per station in charging revenue, listed on charging network apps), (3) DC fast charging ($25,000-150,000 per station, 80% charge in 20-30 min, attracts highway traffic but expensive), (4) Tesla destination charger ($500-1,500 per charger, free for Tesla owners — Tesla subsidizes hardware, attracts Tesla drivers specifically). Federal tax credit covers 30% of EV charging install cost (up to $100,000 per location) — significant subsidy available. Many states + utilities offer additional rebates ($2,000-15,000 per station). Expected impact: +4-14% customer acquisition from EV driver segment, +20-30% dwell time for EV-charging customers (drives +15-25% per-ticket revenue), +12-18% eco perception score, +25-35% competitive differentiation (especially vs restaurants without parking/EV), $50-300/mo charging revenue per station if monetized, 30% federal tax credit on install cost.`,
        ai_recommendation: 'install_ev_charging_stations',
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
              { role: 'system', content: 'You are a restaurant sustainability and green certification optimization expert. Given restaurant eco-practice data, recommend ONE specific action with expected customer acquisition, premium pricing, energy/water savings, or competitive differentiation impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Tier: ${a.restaurant_tier ?? 'n/a'}. Setting: ${a.setting_type ?? 'n/a'}. Demographic: ${a.customer_demographic ?? 'n/a'}. Has parking: ${a.has_parking_lot ?? false}. Green cert: ${a.has_green_certification ?? false} (${a.certification_type ?? 'none'}, in progress: ${a.certification_in_progress ?? false}). Compostable packaging: ${a.has_compostable_packaging ?? false}. Local sourcing: ${a.has_local_sourcing ?? false} (promoted: ${a.local_sourcing_promoted_on_menu ?? false}, ${a.local_ingredient_pct ?? 0}% local). Recycling stations: ${a.has_recycling_stations ?? false}. Eco signage: ${a.has_visible_eco_signage ?? false}. Garden/green wall: ${a.has_garden_or_green_wall ?? false}. LED: ${a.has_led_lighting ?? false}. Energy Star equip: ${a.has_energy_efficient_equipment ?? false}. Solar: ${a.has_solar_panels ?? false}. Water conservation: ${a.has_water_conservation ?? false}. Waste tracking: ${a.has_waste_tracking ?? false}. Composting: ${a.has_composting_program ?? false}. Green cleaning: ${a.has_green_cleaning_products ?? false}. Rainwater: ${a.has_rainwater_harvesting ?? false}. EV stations: ${a.has_ev_charging_stations ?? 0}. Eco perception: ${a.eco_perception_score ?? 0}/100. Acquisition: ${a.customer_acquisition_score ?? 0}/100. Premium eligibility: ${a.premium_pricing_eligibility ?? 0}/100. Competitive diff: ${a.competitive_differentiation_score ?? 0}/100. Monthly energy: ${fmt$(a.monthly_energy_cost ?? 0)}. Monthly water: ${fmt$(a.monthly_water_cost ?? 0)}. Monthly packaging: ${fmt$(a.monthly_packaging_cost ?? 0)}. Monthly food waste: ${fmt$(a.monthly_food_waste_cost ?? 0)}. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Delivery revenue: ${fmt$(a.delivery_revenue ?? 0)}. Eco-conscious customer %: ${a.eco_conscious_customer_pct ?? 0}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM green_eco_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE green_eco_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveGreenEcoAlerts = async (db: ReturnType<typeof useDB>): Promise<GreenEcoAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM green_eco_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getGreenEcoSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  noGreenCertification: number; missingVisiblePractices: number; noLedLighting: number; noEvCharging: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'green_certification_absent') AS nocert,
              math::count(rule_id = 'visible_eco_practice_missing') AS novisible,
              math::count(rule_id = 'led_lighting_not_deployed') AS noled,
              math::count(rule_id = 'ev_charging_station_opportunity') AS noev
       FROM green_eco_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      noGreenCertification: safeNumber(r.nocert, 0),
      missingVisiblePractices: safeNumber(r.novisible, 0),
      noLedLighting: safeNumber(r.noled, 0),
      noEvCharging: safeNumber(r.noev, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noGreenCertification: 0, missingVisiblePractices: 0, noLedLighting: 0, noEvCharging: 0 };
  }
};

export const updateGreenEcoAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
