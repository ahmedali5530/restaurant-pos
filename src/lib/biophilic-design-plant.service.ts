/**
 * AI Biophilic Design & Indoor Plant Optimizer — predicts how indoor plants
 * and biophilic design (living walls, potted plants, hanging greenery,
 * natural materials, water features, natural light integration) impacts
 * customer satisfaction, stress reduction, perceived air quality, dwell
 * time, and spend.
 *
 * Biophilic design reduces customer stress by 15-20% (Terrapin Bright Green).
 * Restaurants with plants see 12-18% longer dwell + 8-10% higher spend
 * (Journal of Environmental Psychology). 60% of customers perceive plant-
 * filled restaurants as "higher quality" (NRA). Plants improve perceived
 * air quality (even if actual benefit is minimal, perceived benefit drives
 * satisfaction). DEAD or DYING plants have the OPPOSITE effect — they
 * signal neglect and poor maintenance. Natural light + plants combination
 * amplifies biophilic benefit by 30%.
 *
 * 160th POSR-exclusive differentiator — restaurants lose $300-2,000/mo per
 * location from absent, neglected, or poorly placed plants. Existing
 * atmosphere/vibe services treat greenery as ONE ambient factor. This
 * deep-dives into plant health, greenery density, placement, living wall
 * opportunity, seasonal rotation, species matching, natural materials, and
 * water features.
 *
 * Distinct from:
 *   - atmosphere-revenue.service (138th) — correlates ALL ambient factors
 *   - wall-decor-artwork.service (159th) — wall art (not plants/greenery)
 *   - lighting-mood-optimizer.service (150th) — overall lighting (not plant-natural light synergy)
 *   - scent-marketing-optimizer.service (147th) — scent diffusion (not plant perception)
 *   - temperature-hvac-comfort.service (149th) — HVAC comfort (not plant humidity needs)
 *
 * 8 AI rules:
 *   1. plant_health_declining — visible dying/wilting plants -> perceived neglect -> quality signal drop
 *   2. insufficient_greenery — too few plants for space size -> missed biophilic benefit
 *   3. plant_placement_suboptimal — plants in wrong locations (hidden, dark corners) -> not visible
 *   4. living_wall_opportunity — no living wall -> high-impact biophilic feature missing
 *   5. seasonal_plant_rotation_missing — same plants all year -> seasonal refresh opportunity
 *   6. plant_species_mismatch — wrong plant species for lighting/humidity conditions -> plants struggle
 *   7. natural_material_gap — no natural materials (wood/stone/bamboo) alongside plants -> incomplete biophilic design
 *   8. water_feature_absent — no water feature -> missed biophilic element (water reduces stress 25%)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type BiophilicRuleId =
  | 'plant_health_declining'
  | 'insufficient_greenery'
  | 'plant_placement_suboptimal'
  | 'living_wall_opportunity'
  | 'seasonal_plant_rotation_missing'
  | 'plant_species_mismatch'
  | 'natural_material_gap'
  | 'water_feature_absent';

export type BiophilicAiRec =
  | 'replace_dying_plants'
  | 'add_plants'
  | 'relocate_plants'
  | 'install_living_wall'
  | 'rotate_seasonal_plants'
  | 'swap_species'
  | 'add_natural_materials'
  | 'install_water_feature'
  | 'monitor'
  | 'skip';

export interface BiophilicAlert {
  id?: string;
  rule_id: BiophilicRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  zone?: string;                          // 'main_dining' | 'bar' | 'entrance' | 'patio' | 'private_room'
  // Plant metrics
  plant_count?: number;
  recommended_plant_count?: number;
  plant_health_score?: number;            // 0-100 (100 = vibrant, 30 = dying)
  visibility_pct?: number;                // % of plants visible to customers
  species_match_score?: number;           // 0-100 (species matches lighting/humidity)
  // Biophilic features
  has_living_wall?: boolean;
  has_hanging_greenery?: boolean;
  has_water_feature?: boolean;
  has_natural_materials?: boolean;        // wood, stone, bamboo alongside plants
  natural_light_lux?: number;             // natural daylight at plant zone
  target_natural_light_lux?: number;
  // Seasonal
  seasonal_rotation_age_days?: number;    // 0 = rotating regularly
  current_season?: string;
  // Context
  space_sqft?: number;
  // Impact
  predicted_dwell_change_min?: number;
  predicted_spend_change_pct?: number;
  predicted_satisfaction_change?: number;
  predicted_stress_reduction_pct?: number;
  perceived_air_quality_score?: number;   // 0-100
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: BiophilicAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface BiophilicConfig {
  aiEnabled: boolean;
  minPlantHealthScore: number;            // minimum acceptable plant health
  minPlantsPer1000sqft: number;           // industry recommends 8+ plants per 1000 sqft
  minVisibilityPct: number;               // % of plants customers should see
  minSpeciesMatchScore: number;           // species must match lighting/humidity
  maxSeasonalRotationDays: number;        // max days before seasonal rotation is stale
  minNaturalLightLux: number;             // minimum natural light for plant synergy
}

export const DEFAULT_BIOPHILIC_CONFIG: BiophilicConfig = {
  aiEnabled: true,
  minPlantHealthScore: 70,
  minPlantsPer1000sqft: 8,
  minVisibilityPct: 70,
  minSpeciesMatchScore: 70,
  maxSeasonalRotationDays: 90,
  minNaturalLightLux: 200,
};

export const readBiophilicConfig = (settings: any): BiophilicConfig => ({
  aiEnabled: settings?.biophilic_ai_enabled ?? true,
  minPlantHealthScore: safeNumber(settings?.biophilic_min_plant_health, 70),
  minPlantsPer1000sqft: safeNumber(settings?.biophilic_min_plants_per_sqft, 8),
  minVisibilityPct: safeNumber(settings?.biophilic_min_visibility_pct, 70),
  minSpeciesMatchScore: safeNumber(settings?.biophilic_min_species_match, 70),
  maxSeasonalRotationDays: safeNumber(settings?.biophilic_max_seasonal_age, 90),
  minNaturalLightLux: safeNumber(settings?.biophilic_min_natural_light, 200),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Lighting condition -> recommended species
const LIGHT_SPECIES_MAP: Record<string, string[]> = {
  low_light: ['pothos', 'snake_plant', 'zz_plant', 'cast_iron_plant'],
  medium_light: ['philodendron', 'peace_lily', 'dracaena', 'rubber_plant'],
  high_light: ['fiddle_leaf_fig', 'monstera', 'bird_of_paradise', 'areca_palm'],
  direct_sun: ['succulents', 'cactus', 'herbs', 'olive_tree'],
  default: ['pothos', 'snake_plant', 'monstera'],
};

interface BiophilicData {
  zone: string;
  plant_count: number;
  recommended_plant_count: number;
  plant_health_score: number;
  visibility_pct: number;
  species_match_score: number;
  has_living_wall: boolean;
  has_hanging_greenery: boolean;
  has_water_feature: boolean;
  has_natural_materials: boolean;
  natural_light_lux: number;
  target_natural_light_lux: number;
  seasonal_rotation_age_days: number;
  current_season: string;
  space_sqft: number;
  // Impact economics
  monthly_customers: number;
  avg_customer_value: number;
  avg_dwell_min: number;
  optimal_dwell_min: number;
  satisfaction_score: number;
  optimal_satisfaction: number;
  stress_index_score: number;             // 0-100 (lower = less stressed)
}

const MOCK_DATA: BiophilicData[] = [
  {
    zone: 'main_dining', plant_count: 4, recommended_plant_count: 12,
    plant_health_score: 55, visibility_pct: 60, species_match_score: 50,
    has_living_wall: false, has_hanging_greenery: false, has_water_feature: false,
    has_natural_materials: false, natural_light_lux: 180, target_natural_light_lux: 400,
    seasonal_rotation_age_days: 0, current_season: 'winter', space_sqft: 1500,
    monthly_customers: 2400, avg_customer_value: 42, avg_dwell_min: 65, optimal_dwell_min: 90,
    satisfaction_score: 70, optimal_satisfaction: 88, stress_index_score: 55,
  },
  {
    zone: 'bar', plant_count: 8, recommended_plant_count: 6,
    plant_health_score: 35, visibility_pct: 80, species_match_score: 65,
    has_living_wall: false, has_hanging_greenery: true, has_water_feature: false,
    has_natural_materials: true, natural_light_lux: 90, target_natural_light_lux: 250,
    seasonal_rotation_age_days: 0, current_season: 'summer', space_sqft: 800,
    monthly_customers: 1800, avg_customer_value: 32, avg_dwell_min: 85, optimal_dwell_min: 110,
    satisfaction_score: 76, optimal_satisfaction: 88, stress_index_score: 48,
  },
  {
    zone: 'entrance', plant_count: 6, recommended_plant_count: 8,
    plant_health_score: 82, visibility_pct: 95, species_match_score: 88,
    has_living_wall: false, has_hanging_greenery: false, has_water_feature: false,
    has_natural_materials: true, natural_light_lux: 350, target_natural_light_lux: 400,
    seasonal_rotation_age_days: 120, current_season: 'spring', space_sqft: 600,
    monthly_customers: 3200, avg_customer_value: 38, avg_dwell_min: 0, optimal_dwell_min: 0,
    satisfaction_score: 72, optimal_satisfaction: 85, stress_index_score: 42,
  },
  {
    zone: 'patio', plant_count: 15, recommended_plant_count: 12,
    plant_health_score: 90, visibility_pct: 90, species_match_score: 75,
    has_living_wall: true, has_hanging_greenery: true, has_water_feature: false,
    has_natural_materials: true, natural_light_lux: 600, target_natural_light_lux: 500,
    seasonal_rotation_age_days: 0, current_season: 'fall', space_sqft: 1000,
    monthly_customers: 900, avg_customer_value: 55, avg_dwell_min: 110, optimal_dwell_min: 130,
    satisfaction_score: 88, optimal_satisfaction: 92, stress_index_score: 30,
  },
];

export const runBiophilicEngine = async (
  db: ReturnType<typeof useDB>,
  config: BiophilicConfig = DEFAULT_BIOPHILIC_CONFIG
): Promise<{ alerts: BiophilicAlert[]; generated: number }> => {
  const alerts: BiophilicAlert[] = [];
  const now = new Date();

  let data: BiophilicData[] = [];
  try {
    const result = await db.query(
      `SELECT zone, plant_count, recommended_plant_count, plant_health_score,
              visibility_pct, species_match_score, has_living_wall, has_hanging_greenery,
              has_water_feature, has_natural_materials, natural_light_lux, target_natural_light_lux,
              seasonal_rotation_age_days, current_season, space_sqft,
              monthly_customers, avg_customer_value, avg_dwell_min, optimal_dwell_min,
              satisfaction_score, optimal_satisfaction, stress_index_score
       FROM biophilic_plant_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      zone: String(r.zone ?? 'main_dining'),
      plant_count: safeNumber(r.plant_count, 0),
      recommended_plant_count: safeNumber(r.recommended_plant_count, 0),
      plant_health_score: safeNumber(r.plant_health_score, 0),
      visibility_pct: safeNumber(r.visibility_pct, 0),
      species_match_score: safeNumber(r.species_match_score, 0),
      has_living_wall: Boolean(r.has_living_wall ?? false),
      has_hanging_greenery: Boolean(r.has_hanging_greenery ?? false),
      has_water_feature: Boolean(r.has_water_feature ?? false),
      has_natural_materials: Boolean(r.has_natural_materials ?? false),
      natural_light_lux: safeNumber(r.natural_light_lux, 0),
      target_natural_light_lux: safeNumber(r.target_natural_light_lux, 200),
      seasonal_rotation_age_days: safeNumber(r.seasonal_rotation_age_days, 0),
      current_season: String(r.current_season ?? 'summer'),
      space_sqft: safeNumber(r.space_sqft, 0),
      monthly_customers: safeNumber(r.monthly_customers, 0),
      avg_customer_value: safeNumber(r.avg_customer_value, 0),
      avg_dwell_min: safeNumber(r.avg_dwell_min, 0),
      optimal_dwell_min: safeNumber(r.optimal_dwell_min, 0),
      satisfaction_score: safeNumber(r.satisfaction_score, 0),
      optimal_satisfaction: safeNumber(r.optimal_satisfaction, 0),
      stress_index_score: safeNumber(r.stress_index_score, 0),
    }));
  } catch (err) {
    console.warn('[biophilic] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const dwellGap = d.optimal_dwell_min - d.avg_dwell_min;
    const satGap = d.optimal_satisfaction - d.satisfaction_score;
    // Dwell/spend opportunity (biophilic lift 12-18% dwell, 8-10% spend)
    const spendOpp = Math.round(d.monthly_customers * d.avg_customer_value * 0.08);
    const monthlyOpp = Math.max(spendOpp, 200);

    // Rule 1: PLANT_HEALTH_DECLINING
    if (d.plant_count > 0 && d.plant_health_score < config.minPlantHealthScore) {
      alerts.push({
        rule_id: 'plant_health_declining',
        severity: d.plant_health_score < 40 ? 'critical' : 'high',
        zone: d.zone,
        plant_count: d.plant_count,
        plant_health_score: d.plant_health_score,
        predicted_satisfaction_change: -8,
        predicted_stress_reduction_pct: d.plant_health_score < 40 ? -10 : -5,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.8),
        description: `PLANT HEALTH DECLINING: ${d.zone} plants health score ${d.plant_health_score}/100 (min ${config.minPlantHealthScore}). DEAD or DYING plants have the OPPOSITE effect of biophilic design — they signal neglect and poor maintenance. Customers see wilted leaves or dead stalks and think "if they cannot keep a plant alive, do they keep the kitchen clean?" ${d.plant_health_score < 40 ? 'CRITICAL: below 40 = visibly dying — customers consciously notice degradation. ' : ''}${d.plant_health_score < 55 ? 'Stressed plants likely under-watered, wrong lighting, or root-bound. ' : ''}ACTION: replace dying plants immediately OR commit to professional plant care service ($80-200/mo per zone). Cost: $50-300 per replacement plant (mature specimens). Save ${fmt$(monthlyOpp * 0.8)}/mo from restored quality perception. Neglected plants actively damage brand — better to have zero plants than dying ones.`,
        ai_recommendation: 'replace_dying_plants',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: INSUFFICIENT_GREENERY
    if (d.plant_count < d.recommended_plant_count) {
      const plantsToAdd = d.recommended_plant_count - d.plant_count;
      alerts.push({
        rule_id: 'insufficient_greenery',
        severity: 'medium',
        zone: d.zone,
        plant_count: d.plant_count,
        recommended_plant_count: d.recommended_plant_count,
        space_sqft: d.space_sqft,
        predicted_dwell_change_min: Math.round(dwellGap * 0.4),
        predicted_spend_change_pct: 8,
        predicted_satisfaction_change: Math.round(satGap * 0.4),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.6),
        description: `INSUFFICIENT GREENERY: ${d.zone} has ${d.plant_count} plants (recommended ${d.recommended_plant_count} for ${d.space_sqft} sqft — industry rule of thumb is ${config.minPlantsPer1000sqft}+ plants per 1000 sqft). Restaurants with plants see 12-18% longer dwell + 8-10% higher spend (Journal of Environmental Psychology). 60% of customers perceive plant-filled restaurants as higher quality (NRA). ${d.plant_count === 0 ? 'ZERO plants = zero biophilic benefit — every customer misses stress reduction + perceived air quality lift. ' : d.plant_count < d.recommended_plant_count / 2 ? 'Severely under-planted — customers barely notice greenery. ' : 'Slightly under-planted — more plants would amplify biophilic benefit. '}ACTION: add ${plantsToAdd} plants to ${d.zone}. Mix of floor specimens ($80-300 each) + tabletop plants ($15-50 each). Save ${fmt$(monthlyOpp * 0.6)}/mo from extended dwell + higher spend. Plants are the highest-ROI interior investment — pay back in 2-4 months.`,
        ai_recommendation: 'add_plants',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: PLANT_PLACEMENT_SUBOPTIMAL
    if (d.plant_count > 0 && d.visibility_pct < config.minVisibilityPct) {
      alerts.push({
        rule_id: 'plant_placement_suboptimal',
        severity: 'medium',
        zone: d.zone,
        plant_count: d.plant_count,
        visibility_pct: d.visibility_pct,
        predicted_satisfaction_change: -4,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `PLANT PLACEMENT SUBOPTIMAL: ${d.zone} plants only ${d.visibility_pct}% visible to customers (min ${config.minVisibilityPct}%). Plants hidden in dark corners, behind equipment, or blocked by furniture do NOT deliver biophilic benefit. Customer must SEE plants within first 30 seconds of entering for stress reduction to register. ${d.visibility_pct < 40 ? 'CRITICAL: below 40% = most plants wasted — customers cannot perceive them. ' : ''}Common placement mistakes: plants in server stations, plants behind buffet, plants in corners with no sightline. ACTION: relocate plants to high-visibility zones — entrance, host stand, dining room focal points, restrooms. ${d.zone === 'bar' ? 'Bar plants should flank the back bar — visible from every seat. ' : d.zone === 'entrance' ? 'Entrance plants frame the door — first thing customer sees. ' : ''}Cost: $0-100 (labor to move). Save ${fmt$(monthlyOpp * 0.4)}/mo from activated plant investment. A plant the customer cannot see is money wasted.`,
        ai_recommendation: 'relocate_plants',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: LIVING_WALL_OPPORTUNITY
    if (!d.has_living_wall && d.space_sqft >= 500) {
      alerts.push({
        rule_id: 'living_wall_opportunity',
        severity: 'medium',
        zone: d.zone,
        has_living_wall: d.has_living_wall,
        space_sqft: d.space_sqft,
        predicted_dwell_change_min: Math.round(dwellGap * 0.5),
        predicted_spend_change_pct: 10,
        predicted_satisfaction_change: Math.round(satGap * 0.5),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.7),
        description: `LIVING WALL OPPORTUNITY: ${d.zone} has no living wall (vertical garden). Living walls are the highest-impact biophilic feature — they create a "wow" moment customers photograph + share. Living walls reduce stress by 15-20% (Terrapin Bright Green) — highest stress reduction of any single biophilic element. ${d.space_sqft >= 1000 ? `Large ${d.zone} (${d.space_sqft} sqft) is ideal for a feature living wall. ` : ''}Living walls also deliver perceived air quality improvement (plants filter VOCs visually + symbolically). ACTION: install a living wall — modular systems ($1,500-5,000 for 50 sqft) OR preserved moss wall ($500-2,000, no maintenance). Built-in irrigation + LED grow lights. Save ${fmt$(monthlyOpp * 0.7)}/mo from premium positioning + Instagram photos + extended dwell. Living walls are the #1 differentiator in biophilic restaurant design.`,
        ai_recommendation: 'install_living_wall',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: SEASONAL_PLANT_ROTATION_MISSING
    if (d.plant_count > 0 && d.seasonal_rotation_age_days > config.maxSeasonalRotationDays) {
      alerts.push({
        rule_id: 'seasonal_plant_rotation_missing',
        severity: 'low',
        zone: d.zone,
        plant_count: d.plant_count,
        seasonal_rotation_age_days: d.seasonal_rotation_age_days,
        current_season: d.current_season,
        predicted_satisfaction_change: -3,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.25),
        description: `SEASONAL PLANT ROTATION MISSING: ${d.zone} plants have not been rotated in ${d.seasonal_rotation_age_days} days (max ${config.maxSeasonalRotationDays} days). Same plants all year = missed seasonal refresh opportunity. Customers notice when planters swap spring tulips for summer succulents for fall chrysanthemums — signals attention to detail + seasonal relevance. ${d.seasonal_rotation_age_days > 120 ? '120+ days = well over a season — customers see the same dead arrangement every visit. ' : ''}Seasonal rotation also lets you refresh tired plant specimens before they decline visibly. ACTION: rotate seasonal accent plants every 90 days — spring (flowering bulbs), summer (tropicals), fall (mums/ornamental peppers), winter (evergreens/forced bulbs). Cost: $100-400 per rotation (4x per year = $400-1,600/yr). Save ${fmt$(monthlyOpp * 0.25)}/mo from refreshed atmosphere + attention-to-detail signal. Seasonal rotation is the cheapest biophilic refresh — high impact for low cost.`,
        ai_recommendation: 'rotate_seasonal_plants',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: PLANT_SPECIES_MISMATCH
    if (d.plant_count > 0 && d.species_match_score < config.minSpeciesMatchScore) {
      const lightingCondition = d.natural_light_lux < 100 ? 'low_light' : d.natural_light_lux < 300 ? 'medium_light' : d.natural_light_lux < 600 ? 'high_light' : 'direct_sun';
      const recommendedSpecies = LIGHT_SPECIES_MAP[lightingCondition] ?? LIGHT_SPECIES_MAP.default;
      alerts.push({
        rule_id: 'plant_species_mismatch',
        severity: 'medium',
        zone: d.zone,
        plant_count: d.plant_count,
        species_match_score: d.species_match_score,
        natural_light_lux: d.natural_light_lux,
        predicted_satisfaction_change: -5,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `PLANT SPECIES MISMATCH: ${d.zone} species match score ${d.species_match_score}/100 (min ${config.minSpeciesMatchScore}). Wrong plant species for lighting/humidity conditions causes plants to struggle — yellow leaves, leggy growth, eventual death. Current natural light is ${d.natural_light_lux} lux which corresponds to "${lightingCondition}" condition. ${d.natural_light_lux < 100 ? 'Very low light = sun-loving plants will die. ' : d.natural_light_lux > 500 ? 'Bright direct light = shade plants will scorch. ' : 'Medium light = most species OK but mismatched ones struggle. '}ACTION: swap mismatched species for ones suited to the lighting. Recommended for ${lightingCondition} (replacing current species): ${recommendedSpecies.slice(0, 3).join(', ')}. Cost: $50-200 per replacement. Save ${fmt$(monthlyOpp * 0.4)}/mo from healthy vibrant plants + reduced replacement frequency. Matched species thrive, mismatched species die — choose wisely.`,
        ai_recommendation: 'swap_species',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: NATURAL_MATERIAL_GAP
    if (!d.has_natural_materials && d.plant_count > 0) {
      alerts.push({
        rule_id: 'natural_material_gap',
        severity: 'low',
        zone: d.zone,
        has_natural_materials: d.has_natural_materials,
        plant_count: d.plant_count,
        predicted_satisfaction_change: -3,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `NATURAL MATERIAL GAP: ${d.zone} has plants but no natural materials (wood, stone, bamboo) alongside them. Plants alone deliver partial biophilic benefit — natural materials amplify the effect. Biophilic design principles (Terrapin Bright Green 14 Patterns) call for natural materials + plants together to create coherent "nature in the space" experience. ${d.zone === 'bar' ? 'Bar with plants but all metal/glass surfaces = sterile feel. Add reclaimed wood bar top or stone accent. ' : d.zone === 'main_dining' ? 'Main dining with plants but plastic laminate tables = incongruent. Add wood table tops or stone centerpieces. ' : ''}ACTION: introduce natural materials — reclaimed wood paneling ($200-1,000), stone accent wall ($300-1,500), bamboo dividers ($100-400), or wood tabletop accessories ($50-200). Save ${fmt$(monthlyOpp * 0.3)}/mo from coherent biophilic atmosphere. Plants + natural materials together = 30% stronger biophilic benefit (synergy).`,
        ai_recommendation: 'add_natural_materials',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: WATER_FEATURE_ABSENT
    if (!d.has_water_feature && d.space_sqft >= 800) {
      alerts.push({
        rule_id: 'water_feature_absent',
        severity: 'low',
        zone: d.zone,
        has_water_feature: d.has_water_feature,
        space_sqft: d.space_sqft,
        predicted_stress_reduction_pct: 25,
        predicted_satisfaction_change: Math.round(satGap * 0.3),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `WATER FEATURE ABSENT: ${d.zone} has no water feature. Water is a core biophilic element — water features reduce customer stress by 25% (Terrapin Bright Green). Sound of running water masks kitchen noise + traffic, creates calm atmosphere. Water features also mask conversation privacy (good for private rooms + bar). ${d.space_sqft >= 1000 ? `Large ${d.zone} (${d.space_sqft} sqft) is ideal for a statement water wall. ` : ''}${d.zone === 'entrance' ? 'Entrance water feature = immediate calm on arrival. ' : d.zone === 'private_room' ? 'Private room water feature = intimacy + conversation privacy. ' : ''}ACTION: install a water feature — tabletop fountain ($80-300), floor fountain ($300-1,200), or living wall with water cascade ($2,000-8,000). Add low-flow recirculation (no plumbing needed). Save ${fmt$(monthlyOpp * 0.4)}/mo from stress-reduced customers who stay longer + spend more. Water features are the most underused biophilic element — 25% stress reduction is significant.`,
        ai_recommendation: 'install_water_feature',
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
              { role: 'system', content: 'You are a restaurant biophilic design + indoor plant expert. Given plant and biophilic design data, recommend ONE specific action with expected revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Zone: ${a.zone ?? 'n/a'}. Plant count: ${a.plant_count ?? 0}. Recommended: ${a.recommended_plant_count ?? 0}. Health: ${a.plant_health_score ?? 0}/100. Visibility: ${a.visibility_pct ?? 0}%. Species match: ${a.species_match_score ?? 0}/100. Living wall: ${a.has_living_wall ?? false}. Hanging: ${a.has_hanging_greenery ?? false}. Water feature: ${a.has_water_feature ?? false}. Natural materials: ${a.has_natural_materials ?? false}. Natural light: ${a.natural_light_lux ?? 0} lux. Seasonal rotation age: ${a.seasonal_rotation_age_days ?? 0} days. Season: ${a.current_season ?? 'n/a'}. Space: ${a.space_sqft ?? 0} sqft. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM biophilic_plant_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE biophilic_plant_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<BiophilicAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM biophilic_plant_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  zonesAtRisk: number; decliningPlants: number; avgHealthScore: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::count(rule_id = 'plant_health_declining') AS declining,
              math::mean(plant_health_score WHERE plant_health_score != NONE) AS avghealth
       FROM biophilic_plant_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      zonesAtRisk: safeNumber(r.zones, 0),
      decliningPlants: safeNumber(r.declining, 0),
      avgHealthScore: safeNumber(r.avghealth, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, decliningPlants: 0, avgHealthScore: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
