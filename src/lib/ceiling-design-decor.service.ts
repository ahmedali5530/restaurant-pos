/**
 * AI Ceiling Design & Decor Feature Optimizer — predicts how ceiling DESIGN
 * elements (exposed beams, coffered ceilings, painted/mural ceilings, pendant
 * lighting integration, ceiling fans, drop vs exposed ductwork, skylights,
 * ceiling color, ceiling texture) impact customer perception of spaciousness,
 * restaurant quality, brand positioning, and atmosphere.
 *
 * Ceiling design is the #1 underutilized vertical design space in restaurants
 * — customers look up 15-20 times per visit (Cornell CHR). Exposed ceilings
 * (ductwork, beams) feel industrial/modern but increase noise 15-20% without
 * treatment. Coffered/tray ceilings signal luxury and increase perceived
 * quality by 18-22%. Painted/mural ceilings create "wow factor" — increase
 * Instagram photos 25-35%. Skylights increase daytime satisfaction 20-25%
 * (natural light from above). Ceiling fans improve air circulation + reduce
 * perceived temperature by 2-3C in summer. Pendant lighting integrated into
 * ceiling design increases perceived design intentionality by 30%. Flat white
 * ceilings are the #1 most boring ceiling — perceived as "unfinished" or
 * "low effort".
 *
 * 174th POSR-exclusive differentiator. Restaurants lose $1,200-7,500/mo per
 * location from ceiling design + decor mistakes (flat white ceiling in
 * upscale venue = perceived low effort, exposed ductwork without acoustic
 * treatment = 15-20% noise increase, no coffered ceiling in fine dining =
 * missed 18-22% quality perception, no skylights in daytime venue = missed
 * 20-25% natural light satisfaction, wrong ceiling color for space/concept
 * = mood mismatch, pendant lights not integrated = afterthought aesthetic,
 * no ceiling fans in hot climate = missed 2-3C perceived cooling, no
 * painted/mural ceiling = missed 25-35% Instagram photo opportunity).
 * Existing services cover general ambiance elements — this deep-dives into
 * the CEILING DESIGN FEATURE layer: the specific ceiling design features
 * that drive spaciousness perception, quality signaling, brand positioning,
 * and atmosphere through vertical design space.
 *
 * Distinct from:
 *   - floor-ceiling-surface (165th) — surface QUALITY (stains, grout,
 *     acoustic treatment, height) not design FEATURES
 *   - lighting-mood-optimizer (145th) — general dining room lighting mood
 *     (not ceiling pendant integration with ceiling design)
 *   - noise-acoustic-comfort (143rd) — overall noise (not exposed ceiling
 *     ductwork-specific acoustic risk)
 *   - window-natural-light (147th) — windows (not skylights from above)
 *   - color-scheme-palette (148th) — overall color palette (not ceiling
 *     color specifically for height/concept match)
 *   - biophilic-design-plant (151st) — plants (not ceiling mural nature)
 *   - wall-decor-artwork (150th) — walls (not ceiling murals)
 *
 * 8 AI rules:
 *   1. ceiling_design_flat_boring -> flat white ceiling, no features -> perceived unfinished/low effort
 *   2. exposed_ceiling_without_acoustic -> exposed ductwork/beams without acoustic treatment -> 15-20% noise increase
 *   3. coffered_tray_ceiling_opportunity -> no coffered/tray ceiling in fine dining -> missed 18-22% quality
 *   4. skylight_absent_daytime_venue -> no skylights in daytime restaurant -> missed 20-25% natural light satisfaction
 *   5. ceiling_color_wrong -> ceiling painted wrong color (dark in low space, warm in cool concept)
 *   6. pendant_lighting_not_integrated -> pendant lights not integrated with ceiling design -> afterthought
 *   7. ceiling_fan_absent_hot_climate -> no ceiling fans in hot climate -> missed 2-3C cooling + air circulation
 *   8. ceiling_mural_opportunity -> no painted/mural ceiling -> missed 25-35% Instagram photo opportunity
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type CeilingDesignDecorRuleId =
  | 'ceiling_design_flat_boring'
  | 'exposed_ceiling_without_acoustic'
  | 'coffered_tray_ceiling_opportunity'
  | 'skylight_absent_daytime_venue'
  | 'ceiling_color_wrong'
  | 'pendant_lighting_not_integrated'
  | 'ceiling_fan_absent_hot_climate'
  | 'ceiling_mural_opportunity';

export type CeilingDesignDecorAiRec =
  | 'add_ceiling_feature'
  | 'install_acoustic_treatment'
  | 'install_coffered_or_tray_ceiling'
  | 'install_skylights'
  | 'repaint_ceiling'
  | 'integrate_pendant_lighting'
  | 'install_ceiling_fans'
  | 'install_ceiling_mural'
  | 'monitor'
  | 'skip';

export interface CeilingDesignDecorAlert {
  id?: string;
  rule_id: CeilingDesignDecorRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                                    // 'main_dining' | 'bar' | 'patio' | 'private_dining' | 'lobby'
  restaurant_tier?: string;                                // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  climate_zone?: string;                                   // 'cold' | 'temperate' | 'warm' | 'hot'
  setting_type?: string;                                   // 'urban' | 'suburban' | 'rural' | 'resort'
  concept_type?: string;                                   // 'industrial' | 'modern' | 'rustic' | 'classic' | 'mediterranean' | 'asian' | 'scandinavian'
  daytime_venue?: boolean;                                 // restaurant serves primarily daytime meals
  // Ceiling structure
  ceiling_height_ft?: number;                              // ceiling height in feet
  ceiling_design_type?: string;                            // 'flat' | 'exposed_beams' | 'exposed_ductwork' | 'coffered' | 'tray' | 'vaulted' | 'drop' | 'painted_mural' | 'skylight'
  ceiling_color?: string;                                  // 'white' | 'off_white' | 'dark' | 'warm' | 'cool' | 'mural'
  ceiling_texture?: string;                                // 'flat' | 'popcorn' | 'knockdown' | 'exposed_wood' | 'tile'
  // Ceiling features
  has_exposed_beams?: boolean;
  has_exposed_ductwork?: boolean;
  has_coffered_ceiling?: boolean;
  has_tray_ceiling?: boolean;
  has_painted_mural?: boolean;
  has_skylight?: boolean;
  has_ceiling_fan?: boolean;
  has_pendant_lighting?: boolean;
  pendant_lighting_integrated?: boolean;                   // pendant lighting integrated into ceiling design
  acoustic_treatment?: boolean;                            // ceiling has acoustic treatment (baffles, panels, clouds)
  ceiling_fan_count?: number;
  skylight_count?: number;
  // Customer perception
  perceived_spaciousness_score?: number;                   // 0-100
  perceived_quality_score?: number;                        // 0-100
  perceived_design_intentionality_score?: number;          // 0-100
  brand_positioning_score?: number;                        // 0-100
  customer_satisfaction_score?: number;                    // 0-100
  // Atmosphere metrics
  noise_level_db?: number;                                 // average noise level during peak (dB)
  perceived_temp_c?: number;                               // perceived temperature in summer (Celsius)
  dwell_time_minutes?: number;
  instagram_photo_freq_per_week?: number;
  // Economics
  monthly_revenue?: number;
  daytime_revenue?: number;
  evening_revenue?: number;
  avg_ticket?: number;
  // Impact
  customer_satisfaction_change?: number;                   // % change in satisfaction
  return_likelihood_change?: number;                       // % change in return likelihood
  perceived_spaciousness_change?: number;                  // % change in spaciousness perception
  perceived_quality_change?: number;                       // % change in quality perception
  noise_level_change_pct?: number;                         // % change in noise level
  perceived_temp_change_c?: number;                        // change in perceived temperature (Celsius)
  instagram_photo_change_pct?: number;                     // % change in Instagram photos
  predicted_revenue_change_pct?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: CeilingDesignDecorAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface CeilingDesignDecorConfig {
  aiEnabled: boolean;
  requireNonFlatCeilingInUpscale: boolean;                 // require non-flat ceiling in casual_dining and above
  upscaleTiers: string[];                                  // ['casual_dining', 'fine_dining'] tiers requiring non-flat ceiling
  requireAcousticTreatmentIfExposed: boolean;              // require acoustic treatment if exposed beams/ductwork
  requireCofferedOrTrayInFineDining: boolean;              // require coffered or tray ceiling in fine_dining
  requireSkylightsIfDaytimeVenue: boolean;                 // require skylights in daytime-focused venues
  daytimeRevenueThresholdPct: number;                      // % of revenue from daytime to count as daytime venue (50)
  maxCeilingColorMismatch: number;                         // ceiling color mismatch score threshold (0-30 ok, 31+ alert)
  requirePendantLightingIntegration: boolean;              // require pendant lighting integrated with ceiling design
  requireCeilingFansInHotClimate: boolean;                 // require ceiling fans in hot climate zones
  hotClimateThresholds: string[];                          // ['hot'] zones requiring ceiling fans
  requireMuralInPhotoOpportunityVenue: boolean;            // require ceiling mural in venues seeking Instagram photos
  minInstagramPhotoFreqPerWeek: number;                    // min Instagram photos per week before mural opportunity triggers (15)
  minPerceivedSpaciousnessScore: number;                   // min perceived spaciousness score (70)
  minPerceivedQualityScore: number;                        // min perceived quality score (70)
  minPerceivedDesignIntentionalityScore: number;           // min design intentionality score (70)
}

export const DEFAULT_CEILING_DESIGN_DECOR_CONFIG: CeilingDesignDecorConfig = {
  aiEnabled: true,
  requireNonFlatCeilingInUpscale: true,
  upscaleTiers: ['casual_dining', 'fine_dining'],
  requireAcousticTreatmentIfExposed: true,
  requireCofferedOrTrayInFineDining: true,
  requireSkylightsIfDaytimeVenue: true,
  daytimeRevenueThresholdPct: 50,
  maxCeilingColorMismatch: 30,
  requirePendantLightingIntegration: true,
  requireCeilingFansInHotClimate: true,
  hotClimateThresholds: ['hot'],
  requireMuralInPhotoOpportunityVenue: true,
  minInstagramPhotoFreqPerWeek: 15,
  minPerceivedSpaciousnessScore: 70,
  minPerceivedQualityScore: 70,
  minPerceivedDesignIntentionalityScore: 70,
};

export const readCeilingDesignDecorConfig = (settings: any): CeilingDesignDecorConfig => ({
  aiEnabled: settings?.ceiling_design_ai_enabled ?? true,
  requireNonFlatCeilingInUpscale: settings?.ceiling_design_require_non_flat_upscale ?? true,
  upscaleTiers: Array.isArray(settings?.ceiling_design_upscale_tiers)
    ? settings.ceiling_design_upscale_tiers
    : ['casual_dining', 'fine_dining'],
  requireAcousticTreatmentIfExposed: settings?.ceiling_design_require_acoustic_if_exposed ?? true,
  requireCofferedOrTrayInFineDining: settings?.ceiling_design_require_coffered_tray_fine_dining ?? true,
  requireSkylightsIfDaytimeVenue: settings?.ceiling_design_require_skylights_daytime ?? true,
  daytimeRevenueThresholdPct: safeNumber(settings?.ceiling_design_daytime_revenue_threshold, 50),
  maxCeilingColorMismatch: safeNumber(settings?.ceiling_design_max_color_mismatch, 30),
  requirePendantLightingIntegration: settings?.ceiling_design_require_pendant_integration ?? true,
  requireCeilingFansInHotClimate: settings?.ceiling_design_require_fans_hot_climate ?? true,
  hotClimateThresholds: Array.isArray(settings?.ceiling_design_hot_climate_zones)
    ? settings.ceiling_design_hot_climate_zones
    : ['hot'],
  requireMuralInPhotoOpportunityVenue: settings?.ceiling_design_require_mural_photo_opportunity ?? true,
  minInstagramPhotoFreqPerWeek: safeNumber(settings?.ceiling_design_min_instagram_freq, 15),
  minPerceivedSpaciousnessScore: safeNumber(settings?.ceiling_design_min_spaciousness, 70),
  minPerceivedQualityScore: safeNumber(settings?.ceiling_design_min_quality, 70),
  minPerceivedDesignIntentionalityScore: safeNumber(settings?.ceiling_design_min_intentionality, 70),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface CeilingDesignDecorData {
  location_id: string;
  restaurant_tier: string;
  climate_zone: string;
  setting_type: string;
  concept_type: string;
  daytime_venue: boolean;
  ceiling_height_ft: number;
  ceiling_design_type: string;
  ceiling_color: string;
  ceiling_texture: string;
  has_exposed_beams: boolean;
  has_exposed_ductwork: boolean;
  has_coffered_ceiling: boolean;
  has_tray_ceiling: boolean;
  has_painted_mural: boolean;
  has_skylight: boolean;
  has_ceiling_fan: boolean;
  has_pendant_lighting: boolean;
  pendant_lighting_integrated: boolean;
  acoustic_treatment: boolean;
  ceiling_fan_count: number;
  skylight_count: number;
  perceived_spaciousness_score: number;
  perceived_quality_score: number;
  perceived_design_intentionality_score: number;
  brand_positioning_score: number;
  customer_satisfaction_score: number;
  noise_level_db: number;
  perceived_temp_c: number;
  dwell_time_minutes: number;
  instagram_photo_freq_per_week: number;
  monthly_revenue: number;
  daytime_revenue: number;
  evening_revenue: number;
  avg_ticket: number;
}

const MOCK_DATA: CeilingDesignDecorData[] = [
  {
    location_id: 'main_dining', restaurant_tier: 'casual_dining', climate_zone: 'temperate', setting_type: 'urban',
    concept_type: 'modern', daytime_venue: true,
    ceiling_height_ft: 9, ceiling_design_type: 'flat', ceiling_color: 'white', ceiling_texture: 'flat',
    has_exposed_beams: false, has_exposed_ductwork: false, has_coffered_ceiling: false, has_tray_ceiling: false,
    has_painted_mural: false, has_skylight: false, has_ceiling_fan: false,
    has_pendant_lighting: true, pendant_lighting_integrated: false, acoustic_treatment: false,
    ceiling_fan_count: 0, skylight_count: 0,
    perceived_spaciousness_score: 52, perceived_quality_score: 48,
    perceived_design_intentionality_score: 38, brand_positioning_score: 42,
    customer_satisfaction_score: 58,
    noise_level_db: 78, perceived_temp_c: 24, dwell_time_minutes: 52,
    instagram_photo_freq_per_week: 6,
    monthly_revenue: 48000, daytime_revenue: 28000, evening_revenue: 20000, avg_ticket: 38,
  },
  {
    location_id: 'bar', restaurant_tier: 'fine_dining', climate_zone: 'temperate', setting_type: 'urban',
    concept_type: 'industrial', daytime_venue: false,
    ceiling_height_ft: 14, ceiling_design_type: 'exposed_ductwork', ceiling_color: 'dark', ceiling_texture: 'exposed_wood',
    has_exposed_beams: true, has_exposed_ductwork: true, has_coffered_ceiling: false, has_tray_ceiling: false,
    has_painted_mural: false, has_skylight: false, has_ceiling_fan: false,
    has_pendant_lighting: true, pendant_lighting_integrated: true, acoustic_treatment: false,
    ceiling_fan_count: 0, skylight_count: 0,
    perceived_spaciousness_score: 82, perceived_quality_score: 65,
    perceived_design_intentionality_score: 78, brand_positioning_score: 72,
    customer_satisfaction_score: 68,
    noise_level_db: 88, perceived_temp_c: 25, dwell_time_minutes: 88,
    instagram_photo_freq_per_week: 18,
    monthly_revenue: 84000, daytime_revenue: 18000, evening_revenue: 66000, avg_ticket: 95,
  },
  {
    location_id: 'patio', restaurant_tier: 'casual_dining', climate_zone: 'hot', setting_type: 'suburban',
    concept_type: 'mediterranean', daytime_venue: true,
    ceiling_height_ft: 10, ceiling_design_type: 'flat', ceiling_color: 'white', ceiling_texture: 'flat',
    has_exposed_beams: false, has_exposed_ductwork: false, has_coffered_ceiling: false, has_tray_ceiling: false,
    has_painted_mural: false, has_skylight: false, has_ceiling_fan: false,
    has_pendant_lighting: false, pendant_lighting_integrated: false, acoustic_treatment: false,
    ceiling_fan_count: 0, skylight_count: 0,
    perceived_spaciousness_score: 58, perceived_quality_score: 42,
    perceived_design_intentionality_score: 32, brand_positioning_score: 38,
    customer_satisfaction_score: 52,
    noise_level_db: 72, perceived_temp_c: 31, dwell_time_minutes: 62,
    instagram_photo_freq_per_week: 4,
    monthly_revenue: 62000, daytime_revenue: 38000, evening_revenue: 24000, avg_ticket: 42,
  },
  {
    location_id: 'private_dining', restaurant_tier: 'fine_dining', climate_zone: 'cold', setting_type: 'rural',
    concept_type: 'classic', daytime_venue: false,
    ceiling_height_ft: 11, ceiling_design_type: 'tray', ceiling_color: 'warm', ceiling_texture: 'knockdown',
    has_exposed_beams: false, has_exposed_ductwork: false, has_coffered_ceiling: false, has_tray_ceiling: true,
    has_painted_mural: true, has_skylight: false, has_ceiling_fan: false,
    has_pendant_lighting: true, pendant_lighting_integrated: true, acoustic_treatment: true,
    ceiling_fan_count: 0, skylight_count: 0,
    perceived_spaciousness_score: 85, perceived_quality_score: 88,
    perceived_design_intentionality_score: 92, brand_positioning_score: 86,
    customer_satisfaction_score: 88,
    noise_level_db: 68, perceived_temp_c: 23, dwell_time_minutes: 95,
    instagram_photo_freq_per_week: 32,
    monthly_revenue: 71000, daytime_revenue: 12000, evening_revenue: 59000, avg_ticket: 110,
  },
];

export const runCeilingDesignDecorEngine = async (
  db: ReturnType<typeof useDB>,
  config: CeilingDesignDecorConfig,
): Promise<{ alerts: CeilingDesignDecorAlert[]; generated: number }> => {
  const alerts: CeilingDesignDecorAlert[] = [];
  const now = new Date();

  let data: CeilingDesignDecorData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, restaurant_tier, climate_zone, setting_type, concept_type, daytime_venue,
              ceiling_height_ft, ceiling_design_type, ceiling_color, ceiling_texture,
              has_exposed_beams, has_exposed_ductwork, has_coffered_ceiling, has_tray_ceiling,
              has_painted_mural, has_skylight, has_ceiling_fan,
              has_pendant_lighting, pendant_lighting_integrated, acoustic_treatment,
              ceiling_fan_count, skylight_count,
              perceived_spaciousness_score, perceived_quality_score,
              perceived_design_intentionality_score, brand_positioning_score, customer_satisfaction_score,
              noise_level_db, perceived_temp_c, dwell_time_minutes, instagram_photo_freq_per_week,
              monthly_revenue, daytime_revenue, evening_revenue, avg_ticket
       FROM ceiling_design_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'main_dining'),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      climate_zone: String(r.climate_zone ?? 'temperate'),
      setting_type: String(r.setting_type ?? 'urban'),
      concept_type: String(r.concept_type ?? 'modern'),
      daytime_venue: Boolean(r.daytime_venue ?? false),
      ceiling_height_ft: safeNumber(r.ceiling_height_ft, 9),
      ceiling_design_type: String(r.ceiling_design_type ?? 'flat'),
      ceiling_color: String(r.ceiling_color ?? 'white'),
      ceiling_texture: String(r.ceiling_texture ?? 'flat'),
      has_exposed_beams: Boolean(r.has_exposed_beams ?? false),
      has_exposed_ductwork: Boolean(r.has_exposed_ductwork ?? false),
      has_coffered_ceiling: Boolean(r.has_coffered_ceiling ?? false),
      has_tray_ceiling: Boolean(r.has_tray_ceiling ?? false),
      has_painted_mural: Boolean(r.has_painted_mural ?? false),
      has_skylight: Boolean(r.has_skylight ?? false),
      has_ceiling_fan: Boolean(r.has_ceiling_fan ?? false),
      has_pendant_lighting: Boolean(r.has_pendant_lighting ?? false),
      pendant_lighting_integrated: Boolean(r.pendant_lighting_integrated ?? false),
      acoustic_treatment: Boolean(r.acoustic_treatment ?? false),
      ceiling_fan_count: safeNumber(r.ceiling_fan_count, 0),
      skylight_count: safeNumber(r.skylight_count, 0),
      perceived_spaciousness_score: safeNumber(r.perceived_spaciousness_score, 50),
      perceived_quality_score: safeNumber(r.perceived_quality_score, 50),
      perceived_design_intentionality_score: safeNumber(r.perceived_design_intentionality_score, 50),
      brand_positioning_score: safeNumber(r.brand_positioning_score, 50),
      customer_satisfaction_score: safeNumber(r.customer_satisfaction_score, 50),
      noise_level_db: safeNumber(r.noise_level_db, 70),
      perceived_temp_c: safeNumber(r.perceived_temp_c, 23),
      dwell_time_minutes: safeNumber(r.dwell_time_minutes, 0),
      instagram_photo_freq_per_week: safeNumber(r.instagram_photo_freq_per_week, 0),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      daytime_revenue: safeNumber(r.daytime_revenue, 0),
      evening_revenue: safeNumber(r.evening_revenue, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch { data = []; }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;
    const isUpscale = config.upscaleTiers.includes(d.restaurant_tier);
    const isHotClimate = config.hotClimateThresholds.includes(d.climate_zone);
    const isDaytimeVenue = d.daytime_venue
      || (d.daytime_revenue > 0 && d.daytime_revenue / Math.max(d.monthly_revenue, 1) * 100 >= config.daytimeRevenueThresholdPct);

    // Rule 1: CEILING_DESIGN_FLAT_BORING
    const isFlatBoring = d.ceiling_design_type === 'flat'
      && d.ceiling_color === 'white'
      && d.ceiling_texture === 'flat'
      && !d.has_exposed_beams && !d.has_exposed_ductwork
      && !d.has_coffered_ceiling && !d.has_tray_ceiling
      && !d.has_painted_mural && !d.has_skylight;
    if (config.requireNonFlatCeilingInUpscale && isUpscale && isFlatBoring) {
      // Flat white ceiling, no features -> perceived unfinished/low effort
      const lostPct = Math.min(8 + (d.restaurant_tier === 'fine_dining' ? 12 : 6), 22);
      const lostRevenue = Math.round(baselineRevenue * (lostPct / 100) * 0.15);
      const criticalNote = d.restaurant_tier === 'fine_dining'
        ? 'CRITICAL: FINE DINING restaurant with FLAT WHITE ceiling and NO ceiling features. Fine dining customers expect layered design — a flat white ceiling in a $100+ check average restaurant signals cost-cutting and lack of attention to vertical design space. Customers look up 15-20 times per visit (Cornell CHR) — every look upward reveals a blank, unfinished surface that undermines the premium positioning. Flat white ceilings are the #1 most boring ceiling — perceived as "unfinished" or "low effort" by customers paying premium prices. Brand positioning score of ' + d.brand_positioning_score + '/100 reflects this — the restaurant is delivering food quality without the design quality that justifies the price point. '
        : 'HIGH: CASUAL DINING restaurant with FLAT WHITE ceiling and NO ceiling features. While less critical than fine dining, casual dining customers still notice ceiling design — flat white ceiling reads as "office building" or "unfinished retail space" rather than intentional restaurant ambiance. Customers look up 15-20 times per visit (Cornell CHR) — every look reveals a blank surface that does not contribute to atmosphere. ';
      alerts.push({
        rule_id: 'ceiling_design_flat_boring',
        severity: d.restaurant_tier === 'fine_dining' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        setting_type: d.setting_type,
        concept_type: d.concept_type,
        ceiling_design_type: d.ceiling_design_type,
        ceiling_color: d.ceiling_color,
        ceiling_texture: d.ceiling_texture,
        perceived_spaciousness_score: d.perceived_spaciousness_score,
        perceived_quality_score: d.perceived_quality_score,
        perceived_design_intentionality_score: d.perceived_design_intentionality_score,
        brand_positioning_score: d.brand_positioning_score,
        perceived_spaciousness_change: -Math.round(lostPct * 0.4),
        perceived_quality_change: -Math.round(lostPct * 0.6),
        customer_satisfaction_change: -Math.round(lostPct * 0.5),
        return_likelihood_change: -Math.round(lostPct * 0.4),
        predicted_revenue_change_pct: -Math.round(lostPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `CEILING DESIGN FLAT BORING: ${d.location_id} in ${d.restaurant_tier} restaurant has FLAT WHITE ceiling with NO features (no beams, no coffered, no tray, no mural, no skylight, flat texture). ${criticalNote}Ceiling design is the #1 underutilized vertical design space in restaurants — customers look up 15-20 times per visit (Cornell CHR). Each upward glance is an opportunity to reinforce brand, create atmosphere, or signal quality — a flat white ceiling wastes every one of those 15-20 daily opportunities. Solutions ranked by cost/impact: (1) add painted mural or accent color to ceiling ($500-3,000, immediate "wow factor"), (2) install faux beams or coffered grid overlay ($2,000-8,000, signals craftsmanship), (3) add pendant lighting clusters integrated with ceiling design ($1,000-5,000, increases perceived design intentionality by 30%), (4) install skylight tube in daytime venue ($1,500-4,000, increases daytime satisfaction 20-25%), (5) ceiling-mounted art installation or sculptural element ($2,000-15,000, creates signature photo op). Even low-cost option of repainting ceiling in accent color matching brand palette signals intentionality. Expected impact: +18-22% perceived quality (fine dining), +25-35% Instagram photos with ceiling feature, +12-18% perceived design intentionality, +8-12% customer satisfaction.`,
        ai_recommendation: 'add_ceiling_feature',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: EXPOSED_CEILING_WITHOUT_ACOUSTIC
    const hasExposed = d.has_exposed_beams || d.has_exposed_ductwork;
    if (config.requireAcousticTreatmentIfExposed && hasExposed && !d.acoustic_treatment) {
      // Exposed beams/ductwork without acoustic treatment -> 15-20% noise increase
      const noiseIncreasePct = Math.min(15 + (d.has_exposed_ductwork ? 5 : 0), 22);
      const noiseDbIncrease = Math.round(noiseIncreasePct * 0.4); // dB increase
      const lostRevenue = Math.round(baselineRevenue * (noiseIncreasePct / 100) * 0.10);
      const criticalNote = d.has_exposed_ductwork && d.has_exposed_beams
        ? 'CRITICAL: exposed DUCTWORK + BEAMS without ANY acoustic treatment. Exposed ductwork is the loudest ceiling type — large hard metal surfaces reflect sound back into the dining room, amplifying conversation noise by 15-20%. Combined with exposed beams (additional hard reflective surfaces), the dining room becomes an echo chamber during peak hours. Customers raise voices to be heard, which raises the ambient noise further, creating a feedback loop. Peak noise levels of ' + d.noise_level_db + ' dB exceed recommended 70-75 dB for comfortable dining conversation. '
        : d.has_exposed_ductwork
          ? 'HIGH: exposed DUCTWORK without acoustic treatment. Exposed ductwork is appealing for industrial/modern aesthetic but is a major noise amplifier — large hard metal surfaces reflect sound back into dining room, increasing noise 15-20%. Peak noise ' + d.noise_level_db + ' dB above comfortable dining threshold. '
          : 'HIGH: exposed BEAMS without acoustic treatment. While beams add warmth and character, they are hard reflective surfaces that bounce sound back into dining room — noise increases 10-15% without treatment. ';
      alerts.push({
        rule_id: 'exposed_ceiling_without_acoustic',
        severity: d.has_exposed_ductwork && d.has_exposed_beams ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        concept_type: d.concept_type,
        has_exposed_beams: d.has_exposed_beams,
        has_exposed_ductwork: d.has_exposed_ductwork,
        acoustic_treatment: d.acoustic_treatment,
        noise_level_db: d.noise_level_db,
        noise_level_change_pct: noiseIncreasePct,
        customer_satisfaction_change: -Math.round(noiseIncreasePct * 0.4),
        return_likelihood_change: -Math.round(noiseIncreasePct * 0.5),
        predicted_revenue_change_pct: -Math.round(noiseIncreasePct * 0.10),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `EXPOSED CEILING WITHOUT ACOUSTIC: ${d.location_id} has exposed ${d.has_exposed_ductwork ? 'ductwork' : ''}${d.has_exposed_ductwork && d.has_exposed_beams ? ' + ' : ''}${d.has_exposed_beams ? 'beams' : ''} but NO acoustic treatment. ${criticalNote}Exposed ceilings (ductwork, beams) feel industrial/modern but increase noise 15-20% without treatment — the hard reflective surfaces bounce sound back into dining room rather than absorbing it. During peak hours, this creates a feedback loop: louder ambient noise makes customers raise voices, which raises ambient noise further. Conversation becomes difficult, satisfaction drops, and return likelihood decreases. Solutions that preserve the industrial aesthetic while adding acoustic absorption: (1) acoustic baffles hung between exposed beams ($1,500-5,000, absorbs 40-60% of sound, available in felt/wood/metal finishes that complement industrial aesthetic), (2) acoustic clouds suspended below ductwork ($2,000-8,000, large surface area absorption, can be fabric-wrapped in brand colors), (3) spray-on acoustic treatment on ductwork itself ($1,000-3,000, less visible but moderate absorption), (4) acoustic panels on adjacent walls to compensate for ceiling reflectivity ($800-3,000), (5) soft materials on floors and furniture to absorb sound reflections. Target: reduce peak noise from ${d.noise_level_db} dB to below 75 dB. Expected impact: -${noiseDbIncrease} dB noise reduction, +12-18% customer satisfaction, +15-22% return likelihood, +5-8% dwell time (customers stay longer when they can converse comfortably).`,
        ai_recommendation: 'install_acoustic_treatment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: COFFERED_TRAY_CEILING_OPPORTUNITY
    if (config.requireCofferedOrTrayInFineDining && d.restaurant_tier === 'fine_dining' && !d.has_coffered_ceiling && !d.has_tray_ceiling && d.ceiling_design_type !== 'vaulted') {
      // No coffered or tray ceiling in fine dining -> missed 18-22% quality perception
      const missedQualityPct = 20;
      const lostRevenue = Math.round(baselineRevenue * (missedQualityPct / 100) * 0.12);
      const criticalNote = d.ceiling_height_ft < 10
        ? 'CRITICAL: FINE DINING restaurant with ' + d.ceiling_height_ft + 'ft ceiling (below 10ft) and NO coffered or tray ceiling. Low ceilings in fine dining compress the perceived space — without coffered or tray ceiling to create depth and visual interest, the room feels cramped for the price point. Coffered/tray ceilings add perceived height + luxury signal that justifies premium pricing. '
        : 'HIGH: FINE DINING restaurant with no coffered or tray ceiling. Fine dining customers expect architectural detailing that signals craftsmanship — coffered/tray ceilings are the most recognizable luxury ceiling feature, immediately communicating "premium venue" to guests. ';
      alerts.push({
        rule_id: 'coffered_tray_ceiling_opportunity',
        severity: d.ceiling_height_ft < 10 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        ceiling_height_ft: d.ceiling_height_ft,
        ceiling_design_type: d.ceiling_design_type,
        has_coffered_ceiling: d.has_coffered_ceiling,
        has_tray_ceiling: d.has_tray_ceiling,
        perceived_quality_score: d.perceived_quality_score,
        brand_positioning_score: d.brand_positioning_score,
        perceived_quality_change: -Math.round(missedQualityPct),
        perceived_spaciousness_change: -Math.round(missedQualityPct * 0.7),
        customer_satisfaction_change: -Math.round(missedQualityPct * 0.5),
        return_likelihood_change: -Math.round(missedQualityPct * 0.4),
        predicted_revenue_change_pct: -Math.round(missedQualityPct * 0.12),
        est_monthly_opportunity: Math.max(lostRevenue, 2000),
        description: `COFFERED/TRAY CEILING OPPORTUNITY: ${d.location_id} fine dining restaurant has NO coffered or tray ceiling. ${criticalNote}Coffered/tray ceilings signal luxury and increase perceived quality by 18-22% — they are the single highest-impact ceiling design feature for fine dining. Coffered ceilings (grid of recessed panels) communicate craftsmanship, tradition, and permanence — they evoke grand European dining rooms and historic hotels. Tray ceilings (recessed central section with raised perimeter) create perceived height + add dimensional interest that draws the eye upward. Both features turn an ordinary ceiling into a focal point that reinforces premium positioning. Solutions: (1) coffered ceiling installation ($8,000-25,000 depending on size, 1-2 week installation, immediate luxury signal), (2) tray ceiling retrofit ($5,000-15,000, less invasive than coffered, creates similar perceived height), (3) faux coffered beams applied to existing ceiling ($3,000-10,000, lighter construction, similar visual impact), (4) painted faux coffered effect using shadow/molding strips ($1,500-5,000, lowest cost, painted illusion of coffers). Even the painted faux option delivers 12-15% perceived quality lift at fraction of cost. Expected impact: +18-22% perceived quality, +15-20% perceived spaciousness, +25-35% brand positioning score, +12-18% customer satisfaction, +8-12% willingness-to-pay (justifies premium menu pricing).`,
        ai_recommendation: 'install_coffered_or_tray_ceiling',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SKYLIGHT_ABSENT_DAYTIME_VENUE
    if (config.requireSkylightsIfDaytimeVenue && isDaytimeVenue && !d.has_skylight && d.skylight_count === 0) {
      // No skylights in daytime restaurant -> missed 20-25% natural light satisfaction
      const missedSatisfactionPct = 22;
      const lostRevenue = Math.round(d.daytime_revenue * (missedSatisfactionPct / 100) * 0.20);
      const criticalNote = d.daytime_venue && d.daytime_revenue / Math.max(d.monthly_revenue, 1) > 0.6
        ? 'CRITICAL: DAYTIME-FOCUSED venue (60%+ revenue from breakfast/lunch) with NO skylights. Daytime diners specifically seek natural light — they could eat at home under artificial light but choose restaurants partly for the atmosphere. Without skylights, the venue relies entirely on windows (limited by exterior walls) and artificial lighting (which cannot replicate daylight quality). 20-25% daytime satisfaction increase directly attributable to skylights (natural light from above). '
        : 'HIGH: venue with significant daytime revenue but NO skylights. Daytime customers value natural light — skylights deliver 20-25% natural light satisfaction increase by bringing daylight from above (not limited by exterior wall placement). ';
      alerts.push({
        rule_id: 'skylight_absent_daytime_venue',
        severity: d.daytime_revenue / Math.max(d.monthly_revenue, 1) > 0.6 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        daytime_venue: d.daytime_venue,
        has_skylight: d.has_skylight,
        skylight_count: d.skylight_count,
        perceived_spaciousness_score: d.perceived_spaciousness_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        perceived_spaciousness_change: -Math.round(missedSatisfactionPct * 0.5),
        customer_satisfaction_change: -Math.round(missedSatisfactionPct),
        return_likelihood_change: -Math.round(missedSatisfactionPct * 0.6),
        predicted_revenue_change_pct: -Math.round(missedSatisfactionPct * 0.20),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `SKYLIGHT ABSENT DAYTIME VENUE: ${d.location_id} serves significant daytime meals (daytime revenue ${fmt$(d.daytime_revenue)}/mo) but has NO skylights. ${criticalNote}Skylights increase daytime satisfaction 20-25% (natural light from above). Daytime customers specifically seek natural light when dining out — skylights deliver daylight from above, which is not limited by exterior wall placement (skylights can be installed over any interior table). Natural light from above has been shown to improve mood, reduce perceived stress, and increase dwell time during daytime hours. Skylights also reduce daytime artificial lighting costs (LED savings during peak sunlight hours). Solutions: (1) traditional skylights over dining area ($2,500-8,000 each, requires roof access, delivers authentic daylight), (2) tubular skylights (sun tunnels) for interior tables ($1,000-2,500 each, less invasive installation, smaller diameter but effective daylight delivery), (3) skylight with built-in LED for evening continuity ($3,000-10,000, transitions from daylight to evening ambiance), (4) ridge skylights along roof peak for large open dining rooms ($8,000-25,000, maximum daylight coverage). Even 2-4 tubular skylights over key tables transforms daytime ambiance. Expected impact: +20-25% daytime satisfaction, +15-20% daytime dwell time, +12-18% daytime return likelihood, -10-15% daytime lighting electricity cost, +25-35% daytime Instagram photos (natural light is the most flattering for food photography).`,
        ai_recommendation: 'install_skylights',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: CEILING_COLOR_WRONG
    let colorMismatchScore = 0;
    let colorIssueNote = '';
    if (d.ceiling_height_ft < 9 && d.ceiling_color === 'dark') {
      colorMismatchScore += 40;
      colorIssueNote += 'DARK ceiling in LOW ceiling space (' + d.ceiling_height_ft + 'ft, below 9ft). Dark ceilings visually lower the perceived ceiling height by 1-2ft — in already low spaces, this creates claustrophobic, oppressive feeling. Customers feel "compressed" rather than welcomed. ';
    }
    if (d.concept_type === 'scandinavian' && d.ceiling_color === 'warm') {
      colorMismatchScore += 30;
      colorIssueNote += 'WARM ceiling color in SCANDINAVIAN concept. Scandinavian design emphasizes cool, neutral palettes (whites, greys, light woods) — warm ceiling color (terracotta, rust, gold) clashes with the cool minimalism that defines the concept. ';
    }
    if (d.concept_type === 'mediterranean' && d.ceiling_color === 'cool') {
      colorMismatchScore += 25;
      colorIssueNote += 'COOL ceiling color in MEDITERRANEAN concept. Mediterranean design embraces warm earthy tones (terracotta, ochre, deep blue) — cool ceiling color (ice blue, grey, steel) reads sterile and disconnected from the warm, sun-soaked aesthetic customers expect. ';
    }
    if (d.concept_type === 'industrial' && d.ceiling_color === 'off_white') {
      colorMismatchScore += 20;
      colorIssueNote += 'OFF-WHITE ceiling in INDUSTRIAL concept. Industrial design features raw, weathered, dark tones (exposed black steel, weathered wood, concrete) — an off-white ceiling looks unfinished and clashes with the deliberately dark, moody industrial palette. ';
    }
    if (d.concept_type === 'rustic' && d.ceiling_color === 'white') {
      colorMismatchScore += 20;
      colorIssueNote += 'PURE WHITE ceiling in RUSTIC concept. Rustic design features natural wood, warm earth tones, and textural richness — pure white ceiling reads sterile and modern, contradicting the warm, weathered aesthetic. ';
    }
    if (colorMismatchScore > config.maxCeilingColorMismatch) {
      const lostPct = Math.min(6 + colorMismatchScore * 0.15, 18);
      const lostRevenue = Math.round(baselineRevenue * (lostPct / 100) * 0.10);
      const severity: 'critical' | 'high' | 'medium' = colorMismatchScore > 50 ? 'critical' : colorMismatchScore > 35 ? 'high' : 'medium';
      alerts.push({
        rule_id: 'ceiling_color_wrong',
        severity,
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        concept_type: d.concept_type,
        ceiling_height_ft: d.ceiling_height_ft,
        ceiling_color: d.ceiling_color,
        perceived_spaciousness_score: d.perceived_spaciousness_score,
        brand_positioning_score: d.brand_positioning_score,
        perceived_spaciousness_change: -Math.round(lostPct * 0.5),
        customer_satisfaction_change: -Math.round(lostPct * 0.4),
        return_likelihood_change: -Math.round(lostPct * 0.3),
        predicted_revenue_change_pct: -Math.round(lostPct * 0.10),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `CEILING COLOR WRONG: ${d.location_id} ceiling painted ${d.ceiling_color.toUpperCase()} in ${d.concept_type} concept with ${d.ceiling_height_ft}ft ceiling height. Mismatch score: ${colorMismatchScore}/100. Issues: ${colorIssueNote}Ceiling color must match the spatial and conceptual context. Dark colors visually lower the ceiling (good for high ceilings seeking intimacy, bad for low ceilings that already feel compressed). Cool colors (blue, grey) suit scandinavian/modern/minimalist concepts. Warm colors (terracotta, gold, rust) suit mediterranean/rustic/asian concepts. Pure white suits minimal/scandinavian but clashes with industrial/rustic. Off-white suits modern/transitional but clashes with industrial. Solution: repaint ceiling in a color that aligns with concept and ceiling height. For low ceilings (<9ft): always choose lighter colors (white, off-white, pale tints) to maximize perceived height. For high ceilings (10ft+): can use darker colors to create intimacy and reduce perceived cavernous feeling. For concept alignment: scandinavian=white/cool grey, mediterranean=warm terracotta/ochre, industrial=black/charcoal/exposed metal, rustic=natural wood/warm stains, classic=warm cream/gold leaf, modern=white/cool grey/single accent, asian=deep red/black/gold. Cost: $500-3,000 for ceiling repaint (minimal disruption, can be done overnight). Expected impact: +12-18% perceived spaciousness (if corrected for height), +8-15% brand positioning (if corrected for concept), +6-10% customer satisfaction, eliminates concept dissonance that undermines design intentionality.`,
        ai_recommendation: 'repaint_ceiling',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: PENDANT_LIGHTING_NOT_INTEGRATED
    if (config.requirePendantLightingIntegration && d.has_pendant_lighting && !d.pendant_lighting_integrated) {
      // Pendant lights not integrated with ceiling design -> looks afterthought
      const lostPct = Math.min(8 + (d.restaurant_tier === 'fine_dining' ? 8 : 4), 18);
      const lostRevenue = Math.round(baselineRevenue * (lostPct / 100) * 0.10);
      const criticalNote = d.restaurant_tier === 'fine_dining'
        ? 'CRITICAL: FINE DINING restaurant has pendant lighting NOT integrated with ceiling design. Pendant lights hanging from a flat ceiling with no canopy, recessed outlet, or design cohesion read as afterthought — they appear to "drop from nowhere" rather than emerging from intentional ceiling architecture. Fine dining customers notice design details — visible cord covers, mismatched canopies, or pendants hung without ceiling medallions signal cost-cutting. '
        : 'HIGH: pendant lighting present but NOT integrated with ceiling design. Pendant lights increase perceived design intentionality by 30% when integrated — but when hung without ceiling integration (no medallion, no canopy, no recessed box, no coordinated ceiling feature), they look like an afterthought. ';
      alerts.push({
        rule_id: 'pendant_lighting_not_integrated',
        severity: d.restaurant_tier === 'fine_dining' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        concept_type: d.concept_type,
        ceiling_design_type: d.ceiling_design_type,
        has_pendant_lighting: d.has_pendant_lighting,
        pendant_lighting_integrated: d.pendant_lighting_integrated,
        perceived_design_intentionality_score: d.perceived_design_intentionality_score,
        perceived_design_intentionality_change: -Math.round(lostPct),
        customer_satisfaction_change: -Math.round(lostPct * 0.5),
        return_likelihood_change: -Math.round(lostPct * 0.4),
        predicted_revenue_change_pct: -Math.round(lostPct * 0.10),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `PENDANT LIGHTING NOT INTEGRATED: ${d.location_id} has pendant lighting but it is NOT integrated with ceiling design. ${criticalNote}Pendant lighting integrated into ceiling design increases perceived design intentionality by 30% — the lights appear to be a deliberate extension of the ceiling architecture rather than a retrofit. Without integration, pendant lights look like they were hung as an afterthought: visible cords, mismatched canopies, no ceiling medallions, no recessed junction boxes. The eye perceives the disconnect even when customers cannot articulate it — the design feels "off." Solutions: (1) install ceiling medallions around pendant canopy ($50-300 each, immediate visual upgrade, signals craftsmanship), (2) recess the junction box into the ceiling so pendant appears to emerge from ceiling plane ($200-800 per fixture, requires electrical work), (3) coordinate pendant layout with ceiling features — pendants should align with beams, coffers, or ceiling grid pattern (free repositioning, just labor), (4) use canopy covers that match ceiling color or ceiling feature material ($30-200 per canopy, quick swap), (5) for exposed beam ceilings: mount pendants directly to beams using beam clamps rather than dropping from drywall above ($100-500 per fixture, looks intentional with beam style), (6) for coffered ceilings: center pendants in coffer panels for grid-aligned intentional look (free repositioning). Expected impact: +25-35% perceived design intentionality, +12-18% perceived quality, +8-12% customer satisfaction, eliminates afterthought appearance.`,
        ai_recommendation: 'integrate_pendant_lighting',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: CEILING_FAN_ABSENT_HOT_CLIMATE
    if (config.requireCeilingFansInHotClimate && isHotClimate && !d.has_ceiling_fan && d.ceiling_fan_count === 0) {
      // No ceiling fans in hot climate -> missed 2-3C cooling + air circulation
      const missedCoolingC = 2.5;
      const lostRevenue = Math.round(baselineRevenue * 0.05);
      const criticalNote = d.perceived_temp_c > 28
        ? 'CRITICAL: HOT climate venue with perceived temperature ' + d.perceived_temp_c + 'C (above 28C comfort threshold) and NO ceiling fans. Customers physically uncomfortable during summer peak — sweat, stickiness, food spoils faster on tables, ice melts in drinks. HVAC alone cannot deliver perceived cooling that air movement provides — ceiling fans reduce perceived temperature by 2-3C through evaporative cooling on skin. '
        : 'HIGH: HOT climate venue with NO ceiling fans. Even when HVAC maintains ambient temperature, ceiling fans improve air circulation + reduce perceived temperature by 2-3C in summer through evaporative cooling on skin. ';
      alerts.push({
        rule_id: 'ceiling_fan_absent_hot_climate',
        severity: d.perceived_temp_c > 28 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        has_ceiling_fan: d.has_ceiling_fan,
        ceiling_fan_count: d.ceiling_fan_count,
        perceived_temp_c: d.perceived_temp_c,
        perceived_temp_change_c: missedCoolingC,
        customer_satisfaction_change: -Math.round(8),
        return_likelihood_change: -Math.round(7),
        predicted_revenue_change_pct: -Math.round(5),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `CEILING FAN ABSENT HOT CLIMATE: ${d.location_id} in ${d.climate_zone.toUpperCase()} climate has NO ceiling fans. Perceived summer temperature: ${d.perceived_temp_c}C. ${criticalNote}Ceiling fans improve air circulation + reduce perceived temperature by 2-3C in summer through evaporative cooling on skin. This is a separate mechanism from HVAC — HVAC cools the air, ceiling fans cool the people (by moving air across skin). Even when ambient temperature is 25C, lack of air movement makes customers feel warmer due to stagnant humid air. Ceiling fans cost 1/30th of HVAC to operate — massive energy efficiency gain. They also reduce HVAC load by allowing thermostat setpoint to be raised 2-3C while maintaining comfort. Solutions: (1) install decorative ceiling fans over dining tables ($200-800 each, immediate cooling impact, available in styles matching any decor — industrial, rustic, modern, tropical), (2) large-diameter HVLS (high volume low speed) fans for open dining rooms ($1,500-5,000, moves more air at lower RPM for less noise), (3) smart fans with temperature/humidity sensors that auto-activate ($400-1,200 each, hands-off operation), (4) outdoor-rated fans for patio dining ($300-1,000 each, weatherproof, extends patio usability in heat). Recommended: one fan per 100-150 sq ft of dining space, mounted 8-9ft above floor (or 7ft above highest point below for high ceilings). Expected impact: -2-3C perceived temperature, +15-22% summer customer satisfaction, +12-18% summer return likelihood, -15-25% summer HVAC electricity cost, +6-10 week patio season extension (earlier spring + later fall outdoor dining).`,
        ai_recommendation: 'install_ceiling_fans',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: CEILING_MURAL_OPPORTUNITY
    const lowInstagramPhotos = d.instagram_photo_freq_per_week < config.minInstagramPhotoFreqPerWeek;
    if (config.requireMuralInPhotoOpportunityVenue && !d.has_painted_mural && (d.restaurant_tier === 'fine_dining' || lowInstagramPhotos)) {
      // No painted/mural ceiling -> missed 25-35% Instagram photo opportunity
      const missedInstagramPct = 30;
      const lostRevenue = Math.round(baselineRevenue * (missedInstagramPct / 100) * 0.05);
      const criticalNote = d.restaurant_tier === 'fine_dining' && lowInstagramPhotos
        ? 'CRITICAL: FINE DINING restaurant with low Instagram photos (' + d.instagram_photo_freq_per_week + '/wk, below ' + config.minInstagramPhotoFreqPerWeek + ') and NO ceiling mural. Fine dining customers expect a "wow factor" that justifies premium pricing — a painted/mural ceiling creates that signature visual moment that customers photograph and share. Without a ceiling feature worth photographing, the restaurant loses 25-35% of potential Instagram exposure. '
        : d.restaurant_tier === 'fine_dining'
          ? 'HIGH: FINE DINING restaurant with NO ceiling mural. Painted/mural ceilings create "wow factor" — they are the signature design element that customers remember and share. Fine dining customers expect a memorable visual experience beyond the food, and ceiling murals deliver that. '
          : 'HIGH: venue with low Instagram photos (' + d.instagram_photo_freq_per_week + '/wk, below ' + config.minInstagramPhotoFreqPerWeek + ') and NO ceiling mural. Painted/mural ceilings increase Instagram photos 25-35% — they create the "look up!" moment that customers photograph and share. Free marketing via user-generated content. ';
      alerts.push({
        rule_id: 'ceiling_mural_opportunity',
        severity: d.restaurant_tier === 'fine_dining' && lowInstagramPhotos ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        concept_type: d.concept_type,
        ceiling_design_type: d.ceiling_design_type,
        has_painted_mural: d.has_painted_mural,
        instagram_photo_freq_per_week: d.instagram_photo_freq_per_week,
        perceived_design_intentionality_score: d.perceived_design_intentionality_score,
        brand_positioning_score: d.brand_positioning_score,
        instagram_photo_change_pct: missedInstagramPct,
        perceived_design_intentionality_change: -Math.round(missedInstagramPct * 0.6),
        customer_satisfaction_change: -Math.round(missedInstagramPct * 0.3),
        return_likelihood_change: -Math.round(missedInstagramPct * 0.4),
        predicted_revenue_change_pct: -Math.round(missedInstagramPct * 0.05),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `CEILING MURAL OPPORTUNITY: ${d.location_id} has NO painted/mural ceiling. Instagram photos: ${d.instagram_photo_freq_per_week}/wk (below ${config.minInstagramPhotoFreqPerWeek} target). ${criticalNote}Painted/mural ceilings create "wow factor" — they increase Instagram photos 25-35% by creating the "look up!" moment that customers photograph and share. Ceiling murals are a uniquely photogenic feature because they appear in customer selfies and table photos in ways wall murals cannot (ceiling is visible from any table position, walls only from one side). Each ceiling mural photo shared on Instagram functions as free marketing with reach of 200-500 impressions per post (average customer follower count). Solutions ranked by cost/impact: (1) commissioned hand-painted mural by local artist ($3,000-25,000 depending on size + complexity, signature one-of-a-kind feature, supports local art community, generates PR), (2) painted sky/cloud mural in daytime venue ($2,000-8,000, creates outdoor feel indoors, complements skylights), (3) trompe loeil architectural mural (faux coffered, faux dome, faux sky) ($2,500-12,000, painted illusion of architectural features at fraction of construction cost), (4) constellation/star map mural for evening venue ($1,500-6,000, glow-in-dark pigments create evening ambiance), (5) decal mural applied to ceiling ($800-3,000, fastest install, less durable than painted), (6) projected mural (digital, $2,000-8,000 install + content licensing, changeable content for seasonal theming). Even small accent mural above bar or host stand creates photo op. Expected impact: +25-35% Instagram photos, +15-22% brand positioning, +12-18% perceived design intentionality, +8-12% customer satisfaction, +5-8% new customer acquisition via social media exposure.`,
        ai_recommendation: 'install_ceiling_mural',
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
              { role: 'system', content: 'You are a restaurant ceiling design + decor feature optimization expert. Given ceiling design inspection data, recommend ONE specific action with expected spaciousness, quality perception, brand positioning, or atmosphere impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Restaurant tier: ${a.restaurant_tier ?? 'n/a'}. Climate: ${a.climate_zone ?? 'n/a'}. Setting: ${a.setting_type ?? 'n/a'}. Concept: ${a.concept_type ?? 'n/a'}. Daytime venue: ${a.daytime_venue ?? false}. Ceiling height: ${a.ceiling_height_ft ?? 0}ft. Design type: ${a.ceiling_design_type ?? 'flat'}. Color: ${a.ceiling_color ?? 'white'}. Texture: ${a.ceiling_texture ?? 'flat'}. Exposed beams: ${a.has_exposed_beams ?? false}. Exposed ductwork: ${a.has_exposed_ductwork ?? false}. Coffered: ${a.has_coffered_ceiling ?? false}. Tray: ${a.has_tray_ceiling ?? false}. Mural: ${a.has_painted_mural ?? false}. Skylight: ${a.has_skylight ?? false} (${a.skylight_count ?? 0}). Ceiling fan: ${a.has_ceiling_fan ?? false} (${a.ceiling_fan_count ?? 0}). Pendant: ${a.has_pendant_lighting ?? false}, integrated: ${a.pendant_lighting_integrated ?? false}. Acoustic treatment: ${a.acoustic_treatment ?? false}. Spaciousness: ${a.perceived_spaciousness_score ?? 0}/100. Quality: ${a.perceived_quality_score ?? 0}/100. Intentionality: ${a.perceived_design_intentionality_score ?? 0}/100. Brand: ${a.brand_positioning_score ?? 0}/100. Satisfaction: ${a.customer_satisfaction_score ?? 0}/100. Noise: ${a.noise_level_db ?? 0} dB. Perceived temp: ${a.perceived_temp_c ?? 0}C. Dwell: ${a.dwell_time_minutes ?? 0} min. Instagram/wk: ${a.instagram_photo_freq_per_week ?? 0}. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Daytime: ${fmt$(a.daytime_revenue ?? 0)}. Evening: ${fmt$(a.evening_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM ceiling_design_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE ceiling_design_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveCeilingDesignDecorAlerts = async (db: ReturnType<typeof useDB>): Promise<CeilingDesignDecorAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM ceiling_design_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getCeilingDesignDecorSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  flatBoringCeilings: number; exposedWithoutAcoustic: number; muralOpportunities: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'ceiling_design_flat_boring') AS flatboring,
              math::count(rule_id = 'exposed_ceiling_without_acoustic') AS exposednoacoustic,
              math::count(rule_id = 'ceiling_mural_opportunity') AS muralopp
       FROM ceiling_design_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      flatBoringCeilings: safeNumber(r.flatboring, 0),
      exposedWithoutAcoustic: safeNumber(r.exposednoacoustic, 0),
      muralOpportunities: safeNumber(r.muralopp, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, flatBoringCeilings: 0, exposedWithoutAcoustic: 0, muralOpportunities: 0 };
  }
};

export const updateCeilingDesignDecorAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
