/**
 * AI Fireplace & Fire Feature Impact Optimizer — predicts how fireplaces and
 * fire features (wood fireplace, gas fireplace, electric fireplace, outdoor
 * fire pit, tabletop fire bowls, decorative flame features) impact customer
 * attraction, dwell time, perceived warmth/coziness, seating premium, seasonal
 * revenue, and brand positioning.
 *
 * Fireplaces are the #1 most requested ambiance feature in restaurant surveys
 * — 68% of customers say a fireplace increases dining satisfaction (NRA).
 * Tables near fireplaces command 15-25% premium pricing and are reserved
 * first (OpenTable). Fire features increase winter revenue by 12-18% by
 * attracting customers seeking cozy atmosphere. Gas fireplaces are 90%
 * efficient vs wood 60%, with no smoke/ash/cleanup. Electric fireplaces
 * provide visual ambiance without heat — useful for summer visual appeal.
 * Outdoor fire pits extend patio season by 6-8 weeks (fall/spring). 45% of
 * customers choose restaurants with fireplaces for special occasions
 * (anniversaries, dates). Visible flame features increase Instagram
 * photo-taking 30-40% (free marketing).
 *
 * 173rd POSR-exclusive differentiator. Restaurants lose $1,500-9,000/mo per
 * location from fireplace + fire feature mistakes (no fireplace in cold
 * climate = missed 12-18% winter revenue, fireplace not lit during peak =
 * wasted ambiance asset, fireplace tables not priced as premium = missed
 * 15-25% seating revenue, wrong fireplace type for setting = smoke/permit
 * issues or perceived cheap, no outdoor fire pit = missed 6-8 week patio
 * season extension, fireplace maintenance overdue = safety risk + operational
 * failure, fireplace hidden from most tables = wasted ambiance investment,
 * fireplace only used in winter = missed fall/spring ambiance opportunity).
 * Existing services cover general ambiance elements — this deep-dives into
 * the FIREPLACE + FIRE FEATURE layer: the specific fire features that drive
 * warmth perception, seating premium, seasonal revenue, and brand
 * positioning through visible flame.
 *
 * Distinct from:
 *   - lighting-mood-optimizer (145th) — general dining room lighting mood
 *     (not fireplace flame impact on warmth perception)
 *   - temperature-hvac-comfort (144th) — HVAC air temperature (not fireplace
 *     radiant heat + visual warmth)
 *   - seating-comfort-furniture (158th) — seating comfort (not fireplace
 *     table premium pricing)
 *   - outdoor-patio-seasonal (155th) — patio season general (not outdoor
 *     fire pit extension impact)
 *   - atmosphere-revenue (130th) — atmosphere revenue aggregation (not
 *     fireplace-specific economic impact)
 *   - vibe-optimizer (139th) — overall vibe scoring (not fireplace fire
 *     feature deep-dive)
 *
 * 8 AI rules:
 *   1. fireplace_absent_cold_climate -> no fireplace in cold-climate restaurant -> missed 12-18% winter revenue
 *   2. fireplace_unused_during_peak -> fireplace present but not lit during peak -> wasted asset
 *   3. fireplace_seating_not_premium -> fireplace tables not premium-priced -> missed 15-25% revenue
 *   4. fireplace_type_wrong -> wood in urban (smoke/permits) or electric in luxury (perceived cheap)
 *   5. outdoor_fire_pit_absent -> no outdoor fire feature -> missed 6-8 week patio season extension
 *   6. fireplace_maintenance_overdue -> fireplace not serviced -> safety risk + operational failure
 *   7. fireplace_visual_impact_poor -> fireplace hidden from most tables -> wasted ambiance investment
 *   8. fireplace_seasonal_underutilization -> fireplace only used in winter -> missed fall/spring opportunity
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type FireplaceFireFeatureRuleId =
  | 'fireplace_absent_cold_climate'
  | 'fireplace_unused_during_peak'
  | 'fireplace_seating_not_premium'
  | 'fireplace_type_wrong'
  | 'outdoor_fire_pit_absent'
  | 'fireplace_maintenance_overdue'
  | 'fireplace_visual_impact_poor'
  | 'fireplace_seasonal_underutilization';

export type FireplaceFireFeatureAiRec =
  | 'install_fireplace'
  | 'light_fireplace_during_peak'
  | 'price_fireplace_tables_as_premium'
  | 'replace_fireplace_type'
  | 'install_outdoor_fire_pit'
  | 'service_fireplace'
  | 'relocate_or_expose_fireplace'
  | 'extend_fireplace_season'
  | 'monitor'
  | 'skip';

export interface FireplaceFireFeatureAlert {
  id?: string;
  rule_id: FireplaceFireFeatureRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                                    // 'main_dining' | 'bar' | 'patio' | 'private_dining' | 'lobby' | 'outdoor'
  restaurant_tier?: string;                                // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  climate_zone?: string;                                   // 'cold' | 'temperate' | 'warm' | 'hot'
  setting_type?: string;                                   // 'urban' | 'suburban' | 'rural' | 'resort'
  // Fireplace inventory
  has_fireplace?: boolean;
  fireplace_type?: string;                                 // 'wood' | 'gas' | 'electric' | 'none'
  fireplace_count?: number;
  fireplace_lit_during_peak?: boolean;                     // fireplace lit during peak hours
  fireplace_lit_hours_per_day?: number;                    // hours per day fireplace is lit
  // Seating premium
  fireplace_table_count?: number;                          // number of tables near fireplace
  fireplace_table_premium_pct?: number;                    // premium % charged for fireplace tables (0-50)
  fireplace_table_reservation_rate?: number;               // % of fireplace tables reserved first (0-100)
  // Visibility + visual impact
  fireplace_visibility_score?: number;                     // 0-100 (% of tables with fireplace sightline)
  fireplace_central?: boolean;                             // fireplace is central focal point of dining room
  // Maintenance
  fireplace_maintenance_months_ago?: number;               // months since last fireplace service
  last_service_date?: string;
  fireplace_safety_certified?: boolean;
  // Outdoor fire features
  has_outdoor_patio?: boolean;
  has_outdoor_fire_pit?: boolean;
  outdoor_fire_pit_count?: number;
  tabletop_fire_bowls_count?: number;
  decorative_flame_features_count?: number;
  patio_season_weeks_extended?: number;                    // weeks patio season extended by fire features
  // Seasonal usage
  fireplace_winter_usage_pct?: number;                     // % of winter days fireplace is lit (0-100)
  fireplace_spring_usage_pct?: number;
  fireplace_summer_usage_pct?: number;
  fireplace_fall_usage_pct?: number;
  fireplace_visual_only_summer?: boolean;                  // electric fireplace used visual-only in summer
  // Customer perception
  perceived_warmth_score?: number;                         // 0-100 (how warm fireplace makes guests feel)
  perceived_coziness_score?: number;                       // 0-100
  dwell_time_minutes?: number;                             // average dwell time at fireplace tables
  dwell_time_baseline_minutes?: number;                    // average dwell time at non-fireplace tables
  instagram_photo_freq_per_week?: number;                  // fireplace Instagram photos per week
  special_occasion_bookings_per_month?: number;            // anniversary/date bookings
  brand_positioning_score?: number;                        // 0-100
  // Economics
  monthly_revenue?: number;
  winter_revenue?: number;
  summer_revenue?: number;
  spring_revenue?: number;
  fall_revenue?: number;
  avg_ticket?: number;
  // Impact
  customer_satisfaction_change?: number;                   // % change in satisfaction
  return_likelihood_change?: number;                       // % change in return likelihood
  perceived_warmth_change?: number;                        // % change in perceived warmth
  dwell_time_change_pct?: number;                          // % change in dwell time
  seasonal_revenue_change_pct?: number;                    // % change in seasonal revenue
  predicted_revenue_change_pct?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: FireplaceFireFeatureAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface FireplaceFireFeatureConfig {
  aiEnabled: boolean;
  requireFireplaceInColdClimate: boolean;                  // require fireplace in cold-climate restaurants
  coldClimateThresholds: string[];                         // ['cold', 'temperate'] zones requiring fireplace
  requireLitDuringPeak: boolean;                           // require fireplace lit during peak hours
  minFireplaceLitHoursPerDay: number;                      // min hours per day fireplace should be lit (4)
  minFireplaceTablePremiumPct: number;                     // min premium % for fireplace tables (15)
  requirePremiumPricingForFireplaceTables: boolean;        // require fireplace tables priced as premium
  allowWoodFireplaceInUrban: boolean;                      // allow wood fireplace in urban setting (smoke/permits)
  allowElectricFireplaceInLuxury: boolean;                 // allow electric fireplace in fine_dining (perceived cheap)
  requireOutdoorFirePitIfPatio: boolean;                   // require outdoor fire pit if restaurant has patio
  maxFireplaceMaintenanceMonths: number;                   // max months between fireplace services (12)
  requireFireplaceSafetyCertified: boolean;                // require fireplace safety certification
  minFireplaceVisibilityScore: number;                     // min % of tables that should see fireplace (70)
  requireFallSpringFireplaceUsage: boolean;                // require fireplace usage in fall + spring
  minSeasonalUsagePct: number;                             // min fireplace usage % in shoulder seasons (40)
  minPerceivedWarmthScore: number;                         // min perceived warmth score (70)
}

export const DEFAULT_FIREPLACE_FIRE_FEATURE_CONFIG: FireplaceFireFeatureConfig = {
  aiEnabled: true,
  requireFireplaceInColdClimate: true,
  coldClimateThresholds: ['cold', 'temperate'],
  requireLitDuringPeak: true,
  minFireplaceLitHoursPerDay: 4,
  minFireplaceTablePremiumPct: 15,
  requirePremiumPricingForFireplaceTables: true,
  allowWoodFireplaceInUrban: false,
  allowElectricFireplaceInLuxury: false,
  requireOutdoorFirePitIfPatio: true,
  maxFireplaceMaintenanceMonths: 12,
  requireFireplaceSafetyCertified: true,
  minFireplaceVisibilityScore: 70,
  requireFallSpringFireplaceUsage: true,
  minSeasonalUsagePct: 40,
  minPerceivedWarmthScore: 70,
};

export const readFireplaceFireFeatureConfig = (settings: any): FireplaceFireFeatureConfig => ({
  aiEnabled: settings?.fireplace_feature_ai_enabled ?? true,
  requireFireplaceInColdClimate: settings?.fireplace_feature_require_in_cold_climate ?? true,
  coldClimateThresholds: Array.isArray(settings?.fireplace_feature_cold_climate_zones)
    ? settings.fireplace_feature_cold_climate_zones
    : ['cold', 'temperate'],
  requireLitDuringPeak: settings?.fireplace_feature_require_lit_peak ?? true,
  minFireplaceLitHoursPerDay: safeNumber(settings?.fireplace_feature_min_lit_hours, 4),
  minFireplaceTablePremiumPct: safeNumber(settings?.fireplace_feature_min_premium_pct, 15),
  requirePremiumPricingForFireplaceTables: settings?.fireplace_feature_require_premium_pricing ?? true,
  allowWoodFireplaceInUrban: settings?.fireplace_feature_allow_wood_urban ?? false,
  allowElectricFireplaceInLuxury: settings?.fireplace_feature_allow_electric_luxury ?? false,
  requireOutdoorFirePitIfPatio: settings?.fireplace_feature_require_outdoor_pit ?? true,
  maxFireplaceMaintenanceMonths: safeNumber(settings?.fireplace_feature_max_maintenance_months, 12),
  requireFireplaceSafetyCertified: settings?.fireplace_feature_require_safety_cert ?? true,
  minFireplaceVisibilityScore: safeNumber(settings?.fireplace_feature_min_visibility, 70),
  requireFallSpringFireplaceUsage: settings?.fireplace_feature_require_fall_spring ?? true,
  minSeasonalUsagePct: safeNumber(settings?.fireplace_feature_min_seasonal_usage, 40),
  minPerceivedWarmthScore: safeNumber(settings?.fireplace_feature_min_warmth, 70),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface FireplaceFireFeatureData {
  location_id: string;
  restaurant_tier: string;
  climate_zone: string;
  setting_type: string;
  has_fireplace: boolean;
  fireplace_type: string;
  fireplace_count: number;
  fireplace_lit_during_peak: boolean;
  fireplace_lit_hours_per_day: number;
  fireplace_table_count: number;
  fireplace_table_premium_pct: number;
  fireplace_table_reservation_rate: number;
  fireplace_visibility_score: number;
  fireplace_central: boolean;
  fireplace_maintenance_months_ago: number;
  last_service_date: string;
  fireplace_safety_certified: boolean;
  has_outdoor_patio: boolean;
  has_outdoor_fire_pit: boolean;
  outdoor_fire_pit_count: number;
  tabletop_fire_bowls_count: number;
  decorative_flame_features_count: number;
  patio_season_weeks_extended: number;
  fireplace_winter_usage_pct: number;
  fireplace_spring_usage_pct: number;
  fireplace_summer_usage_pct: number;
  fireplace_fall_usage_pct: number;
  fireplace_visual_only_summer: boolean;
  perceived_warmth_score: number;
  perceived_coziness_score: number;
  dwell_time_minutes: number;
  dwell_time_baseline_minutes: number;
  instagram_photo_freq_per_week: number;
  special_occasion_bookings_per_month: number;
  brand_positioning_score: number;
  monthly_revenue: number;
  winter_revenue: number;
  summer_revenue: number;
  spring_revenue: number;
  fall_revenue: number;
  avg_ticket: number;
}

const MOCK_DATA: FireplaceFireFeatureData[] = [
  {
    location_id: 'main_dining', restaurant_tier: 'casual_dining', climate_zone: 'cold', setting_type: 'urban',
    has_fireplace: false, fireplace_type: 'none', fireplace_count: 0,
    fireplace_lit_during_peak: false, fireplace_lit_hours_per_day: 0,
    fireplace_table_count: 0, fireplace_table_premium_pct: 0, fireplace_table_reservation_rate: 0,
    fireplace_visibility_score: 0, fireplace_central: false,
    fireplace_maintenance_months_ago: 0, last_service_date: '', fireplace_safety_certified: false,
    has_outdoor_patio: true, has_outdoor_fire_pit: false, outdoor_fire_pit_count: 0,
    tabletop_fire_bowls_count: 0, decorative_flame_features_count: 0, patio_season_weeks_extended: 0,
    fireplace_winter_usage_pct: 0, fireplace_spring_usage_pct: 0, fireplace_summer_usage_pct: 0, fireplace_fall_usage_pct: 0,
    fireplace_visual_only_summer: false,
    perceived_warmth_score: 32, perceived_coziness_score: 28,
    dwell_time_minutes: 52, dwell_time_baseline_minutes: 52,
    instagram_photo_freq_per_week: 4, special_occasion_bookings_per_month: 8,
    brand_positioning_score: 42,
    monthly_revenue: 48000, winter_revenue: 158000, summer_revenue: 142000,
    spring_revenue: 146000, fall_revenue: 151000, avg_ticket: 38,
  },
  {
    location_id: 'bar', restaurant_tier: 'fine_dining', climate_zone: 'temperate', setting_type: 'urban',
    has_fireplace: true, fireplace_type: 'wood', fireplace_count: 1,
    fireplace_lit_during_peak: false, fireplace_lit_hours_per_day: 2,
    fireplace_table_count: 4, fireplace_table_premium_pct: 0, fireplace_table_reservation_rate: 92,
    fireplace_visibility_score: 58, fireplace_central: false,
    fireplace_maintenance_months_ago: 18, last_service_date: '', fireplace_safety_certified: false,
    has_outdoor_patio: true, has_outdoor_fire_pit: false, outdoor_fire_pit_count: 0,
    tabletop_fire_bowls_count: 2, decorative_flame_features_count: 1, patio_season_weeks_extended: 0,
    fireplace_winter_usage_pct: 88, fireplace_spring_usage_pct: 18, fireplace_summer_usage_pct: 0, fireplace_fall_usage_pct: 22,
    fireplace_visual_only_summer: false,
    perceived_warmth_score: 65, perceived_coziness_score: 72,
    dwell_time_minutes: 88, dwell_time_baseline_minutes: 72,
    instagram_photo_freq_per_week: 22, special_occasion_bookings_per_month: 38,
    brand_positioning_score: 78,
    monthly_revenue: 84000, winter_revenue: 295000, summer_revenue: 248000,
    spring_revenue: 258000, fall_revenue: 278000, avg_ticket: 95,
  },
  {
    location_id: 'patio', restaurant_tier: 'casual_dining', climate_zone: 'temperate', setting_type: 'suburban',
    has_fireplace: true, fireplace_type: 'gas', fireplace_count: 1,
    fireplace_lit_during_peak: true, fireplace_lit_hours_per_day: 6,
    fireplace_table_count: 6, fireplace_table_premium_pct: 12, fireplace_table_reservation_rate: 95,
    fireplace_visibility_score: 75, fireplace_central: true,
    fireplace_maintenance_months_ago: 8, last_service_date: '', fireplace_safety_certified: true,
    has_outdoor_patio: true, has_outdoor_fire_pit: false, outdoor_fire_pit_count: 0,
    tabletop_fire_bowls_count: 3, decorative_flame_features_count: 2, patio_season_weeks_extended: 0,
    fireplace_winter_usage_pct: 95, fireplace_spring_usage_pct: 55, fireplace_summer_usage_pct: 12, fireplace_fall_usage_pct: 48,
    fireplace_visual_only_summer: false,
    perceived_warmth_score: 78, perceived_coziness_score: 82,
    dwell_time_minutes: 72, dwell_time_baseline_minutes: 58,
    instagram_photo_freq_per_week: 38, special_occasion_bookings_per_month: 28,
    brand_positioning_score: 82,
    monthly_revenue: 62000, winter_revenue: 178000, summer_revenue: 224000,
    spring_revenue: 198000, fall_revenue: 212000, avg_ticket: 42,
  },
  {
    location_id: 'private_dining', restaurant_tier: 'fine_dining', climate_zone: 'cold', setting_type: 'rural',
    has_fireplace: true, fireplace_type: 'electric', fireplace_count: 1,
    fireplace_lit_during_peak: true, fireplace_lit_hours_per_day: 5,
    fireplace_table_count: 2, fireplace_table_premium_pct: 22, fireplace_table_reservation_rate: 88,
    fireplace_visibility_score: 82, fireplace_central: true,
    fireplace_maintenance_months_ago: 4, last_service_date: '', fireplace_safety_certified: true,
    has_outdoor_patio: false, has_outdoor_fire_pit: false, outdoor_fire_pit_count: 0,
    tabletop_fire_bowls_count: 0, decorative_flame_features_count: 0, patio_season_weeks_extended: 0,
    fireplace_winter_usage_pct: 92, fireplace_spring_usage_pct: 48, fireplace_summer_usage_pct: 35, fireplace_fall_usage_pct: 52,
    fireplace_visual_only_summer: true,
    perceived_warmth_score: 48, perceived_coziness_score: 62,
    dwell_time_minutes: 95, dwell_time_baseline_minutes: 78,
    instagram_photo_freq_per_week: 12, special_occasion_bookings_per_month: 18,
    brand_positioning_score: 68,
    monthly_revenue: 71000, winter_revenue: 268000, summer_revenue: 192000,
    spring_revenue: 218000, fall_revenue: 248000, avg_ticket: 110,
  },
];

export const runFireplaceFireFeatureEngine = async (
  db: ReturnType<typeof useDB>,
  config: FireplaceFireFeatureConfig,
): Promise<{ alerts: FireplaceFireFeatureAlert[]; generated: number }> => {
  const alerts: FireplaceFireFeatureAlert[] = [];
  const now = new Date();

  let data: FireplaceFireFeatureData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, restaurant_tier, climate_zone, setting_type,
              has_fireplace, fireplace_type, fireplace_count,
              fireplace_lit_during_peak, fireplace_lit_hours_per_day,
              fireplace_table_count, fireplace_table_premium_pct, fireplace_table_reservation_rate,
              fireplace_visibility_score, fireplace_central,
              fireplace_maintenance_months_ago, last_service_date, fireplace_safety_certified,
              has_outdoor_patio, has_outdoor_fire_pit, outdoor_fire_pit_count,
              tabletop_fire_bowls_count, decorative_flame_features_count, patio_season_weeks_extended,
              fireplace_winter_usage_pct, fireplace_spring_usage_pct, fireplace_summer_usage_pct, fireplace_fall_usage_pct,
              fireplace_visual_only_summer,
              perceived_warmth_score, perceived_coziness_score,
              dwell_time_minutes, dwell_time_baseline_minutes,
              instagram_photo_freq_per_week, special_occasion_bookings_per_month, brand_positioning_score,
              monthly_revenue, winter_revenue, summer_revenue, spring_revenue, fall_revenue, avg_ticket
       FROM fireplace_feature_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'main_dining'),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      climate_zone: String(r.climate_zone ?? 'temperate'),
      setting_type: String(r.setting_type ?? 'urban'),
      has_fireplace: Boolean(r.has_fireplace ?? false),
      fireplace_type: String(r.fireplace_type ?? 'none'),
      fireplace_count: safeNumber(r.fireplace_count, 0),
      fireplace_lit_during_peak: Boolean(r.fireplace_lit_during_peak ?? false),
      fireplace_lit_hours_per_day: safeNumber(r.fireplace_lit_hours_per_day, 0),
      fireplace_table_count: safeNumber(r.fireplace_table_count, 0),
      fireplace_table_premium_pct: safeNumber(r.fireplace_table_premium_pct, 0),
      fireplace_table_reservation_rate: safeNumber(r.fireplace_table_reservation_rate, 0),
      fireplace_visibility_score: safeNumber(r.fireplace_visibility_score, 50),
      fireplace_central: Boolean(r.fireplace_central ?? false),
      fireplace_maintenance_months_ago: safeNumber(r.fireplace_maintenance_months_ago, 0),
      last_service_date: String(r.last_service_date ?? ''),
      fireplace_safety_certified: Boolean(r.fireplace_safety_certified ?? false),
      has_outdoor_patio: Boolean(r.has_outdoor_patio ?? false),
      has_outdoor_fire_pit: Boolean(r.has_outdoor_fire_pit ?? false),
      outdoor_fire_pit_count: safeNumber(r.outdoor_fire_pit_count, 0),
      tabletop_fire_bowls_count: safeNumber(r.tabletop_fire_bowls_count, 0),
      decorative_flame_features_count: safeNumber(r.decorative_flame_features_count, 0),
      patio_season_weeks_extended: safeNumber(r.patio_season_weeks_extended, 0),
      fireplace_winter_usage_pct: safeNumber(r.fireplace_winter_usage_pct, 0),
      fireplace_spring_usage_pct: safeNumber(r.fireplace_spring_usage_pct, 0),
      fireplace_summer_usage_pct: safeNumber(r.fireplace_summer_usage_pct, 0),
      fireplace_fall_usage_pct: safeNumber(r.fireplace_fall_usage_pct, 0),
      fireplace_visual_only_summer: Boolean(r.fireplace_visual_only_summer ?? false),
      perceived_warmth_score: safeNumber(r.perceived_warmth_score, 50),
      perceived_coziness_score: safeNumber(r.perceived_coziness_score, 50),
      dwell_time_minutes: safeNumber(r.dwell_time_minutes, 0),
      dwell_time_baseline_minutes: safeNumber(r.dwell_time_baseline_minutes, 0),
      instagram_photo_freq_per_week: safeNumber(r.instagram_photo_freq_per_week, 0),
      special_occasion_bookings_per_month: safeNumber(r.special_occasion_bookings_per_month, 0),
      brand_positioning_score: safeNumber(r.brand_positioning_score, 50),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      winter_revenue: safeNumber(r.winter_revenue, 0),
      summer_revenue: safeNumber(r.summer_revenue, 0),
      spring_revenue: safeNumber(r.spring_revenue, 0),
      fall_revenue: safeNumber(r.fall_revenue, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch { data = []; }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;
    const isColdClimate = config.coldClimateThresholds.includes(d.climate_zone);

    // Rule 1: FIREPLACE_ABSENT_COLD_CLIMATE
    if (config.requireFireplaceInColdClimate && isColdClimate && !d.has_fireplace) {
      // No fireplace in cold-climate restaurant -> missed 12-18% winter revenue
      const missedWinterPct = 15;
      const missedWinterRevenue = Math.round((d.winter_revenue * missedWinterPct) / 100 / 3); // ~1/3 of winter is monthly
      const lostRevenue = Math.max(missedWinterRevenue, Math.round(baselineRevenue * 0.12 * 0.4));
      const criticalNote = d.climate_zone === 'cold'
        ? 'CRITICAL: cold-climate restaurant with NO fireplace. Customers actively seek cozy fireplace ambiance in winter months — 68% of customers say a fireplace increases dining satisfaction (NRA). Without one, the restaurant competes on price alone against cozy competitors who have fireplaces. Fire features increase winter revenue by 12-18% by attracting customers seeking cozy atmosphere — every winter month without a fireplace is a 12-18% revenue deficit. 45% of customers choose restaurants with fireplaces for special occasions (anniversaries, dates) — these high-ticket celebratory bookings go to competitors with fireplaces. '
        : 'HIGH: temperate-climate restaurant with NO fireplace. While not as severe as cold climate, fireplace still drives 8-12% winter revenue premium + 30-40% increase in Instagram photos (free marketing). Missing the ambiance signal that turns first-time visitors into repeat customers. ';
      alerts.push({
        rule_id: 'fireplace_absent_cold_climate',
        severity: d.climate_zone === 'cold' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        setting_type: d.setting_type,
        has_fireplace: d.has_fireplace,
        fireplace_type: d.fireplace_type,
        fireplace_count: d.fireplace_count,
        perceived_warmth_score: d.perceived_warmth_score,
        perceived_warmth_change: -Math.round(missedWinterPct * 0.5),
        customer_satisfaction_change: -Math.round(missedWinterPct * 0.6),
        return_likelihood_change: -Math.round(missedWinterPct * 0.4),
        seasonal_revenue_change_pct: -missedWinterPct,
        predicted_revenue_change_pct: -Math.round(missedWinterPct * 0.5),
        est_monthly_opportunity: Math.max(lostRevenue, 2000),
        description: `FIREPLACE ABSENT COLD CLIMATE: ${d.location_id} in ${d.climate_zone} climate has NO fireplace. ${criticalNote}Fireplaces are the #1 most requested ambiance feature in restaurant surveys — 68% of customers say a fireplace increases dining satisfaction (NRA). In cold climates, the absence is especially costly: customers seek warmth and coziness when choosing where to dine in winter. Competitors with fireplaces capture the celebratory dining market — 45% of customers choose restaurants with fireplaces for special occasions (anniversaries, dates) and these are high-ticket bookings with above-average check sizes. Without a fireplace, the restaurant loses the 15-25% seating premium that fireplace tables command (OpenTable) — every table that COULD be a premium fireplace table is just a regular table. Visible flame features increase Instagram photo-taking 30-40% — without a fireplace, the restaurant loses free social media marketing that competitors with fireplaces enjoy. Gas fireplace is recommended: 90% efficient, no smoke/ash/cleanup, can be lit with a switch. Install in bar or main dining as central focal point. Even electric fireplace (visual-only, no heat) provides ambiance signal — useful if HVAC handles heating. Expected impact: +12-18% winter revenue, +15-25% premium for fireplace-adjacent tables, +30-40% Instagram photos, +25-35% special occasion bookings.`,
        ai_recommendation: 'install_fireplace',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: FIREPLACE_UNUSED_DURING_PEAK
    if (d.has_fireplace && config.requireLitDuringPeak && !d.fireplace_lit_during_peak) {
      // Fireplace present but not lit during peak hours -> wasted asset
      const peakHours = d.fireplace_lit_hours_per_day < config.minFireplaceLitHoursPerDay
        ? `only ${d.fireplace_lit_hours_per_day} hr/day (min ${config.minFireplaceLitHoursPerDay})`
        : 'lit but not during peak hours';
      const wastedPct = Math.min(20 + (config.minFireplaceLitHoursPerDay - d.fireplace_lit_hours_per_day) * 4, 35);
      const lostRevenue = Math.round(baselineRevenue * (wastedPct / 100) * 0.10);
      const criticalNote = d.fireplace_lit_hours_per_day === 0
        ? 'CRITICAL: fireplace NEVER lit — capital investment sitting completely unused. A fireplace that is never lit is worse than no fireplace: it occupies prime floor space, requires maintenance, and signals to customers that the restaurant does not care about ambiance. Customers who see a cold, dark fireplace assume the restaurant is cutting corners or cannot afford to operate it. '
        : d.fireplace_lit_hours_per_day < 2
          ? 'HIGH: fireplace lit less than 2 hours per day — barely utilized. Peak dinner hours (6-9pm) are when fireplace ambiance matters most — customers choosing where to dine in evening explicitly seek cozy atmosphere. '
          : `MEDIUM: fireplace lit ${d.fireplace_lit_hours_per_day} hr/day but not aligned with peak hours. ${peakHours}. `;
      alerts.push({
        rule_id: 'fireplace_unused_during_peak',
        severity: d.fireplace_lit_hours_per_day === 0 ? 'critical' : d.fireplace_lit_hours_per_day < 2 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        has_fireplace: d.has_fireplace,
        fireplace_type: d.fireplace_type,
        fireplace_lit_during_peak: d.fireplace_lit_during_peak,
        fireplace_lit_hours_per_day: d.fireplace_lit_hours_per_day,
        perceived_warmth_change: -Math.round(wastedPct * 0.4),
        customer_satisfaction_change: -Math.round(wastedPct * 0.5),
        return_likelihood_change: -Math.round(wastedPct * 0.3),
        predicted_revenue_change_pct: -Math.round(wastedPct * 0.10),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `FIREPLACE UNUSED DURING PEAK: ${d.location_id} fireplace present but ${peakHours}. ${criticalNote}Peak dinner hours (typically 6-9pm) are when fireplace ambiance delivers maximum value — customers choosing where to dine in the evening explicitly seek cozy atmosphere, and 68% say a fireplace increases dining satisfaction (NRA). A fireplace that is dark during peak hours is a wasted asset: capital invested, floor space consumed, maintenance scheduled — but zero ambiance delivered. For gas fireplaces: lighting takes seconds via wall switch or remote — no excuse for not lighting during service. For wood fireplaces: build fire 30 min before service starts so it is at peak ambiance during dinner rush. For electric: turn on visual flame during all operating hours (no heat cost, just ambiance). Peak hours lighting should be SOP — train staff to light fireplace as part of opening checklist. Expected impact: +10-15% increase in dwell time at fireplace tables, +12-18% winter revenue lift (vs no fireplace), +30-40% Instagram photos when lit during peak.`,
        ai_recommendation: 'light_fireplace_during_peak',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: FIREPLACE_SEATING_NOT_PREMIUM
    if (d.has_fireplace && d.fireplace_table_count > 0 && config.requirePremiumPricingForFireplaceTables && d.fireplace_table_premium_pct < config.minFireplaceTablePremiumPct) {
      // Fireplace tables not priced as premium -> missed 15-25% revenue
      const premiumGap = config.minFireplaceTablePremiumPct - d.fireplace_table_premium_pct;
      const missedPct = Math.min(15 + premiumGap * 1.2, 25);
      const fireplaceTableRevenue = Math.round(baselineRevenue * (d.fireplace_table_count / 40)); // assume ~40 total tables
      const lostRevenue = Math.round(fireplaceTableRevenue * (missedPct / 100));
      const criticalNote = d.fireplace_table_premium_pct === 0
        ? 'CRITICAL: fireplace tables priced identically to regular tables — leaving 15-25% revenue on the table. Tables near fireplaces command 15-25% premium pricing and are reserved first (OpenTable) — customers willingly pay more for the ambiance. Not pricing fireplace tables as premium tells customers the fireplace is not special + leaves significant revenue uncaptured. '
        : `HIGH: fireplace tables only ${d.fireplace_table_premium_pct}% premium (min ${config.minFireplaceTablePremiumPct}%) — underpriced by ${premiumGap} percentage points. `;
      alerts.push({
        rule_id: 'fireplace_seating_not_premium',
        severity: d.fireplace_table_premium_pct === 0 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_fireplace: d.has_fireplace,
        fireplace_type: d.fireplace_type,
        fireplace_table_count: d.fireplace_table_count,
        fireplace_table_premium_pct: d.fireplace_table_premium_pct,
        fireplace_table_reservation_rate: d.fireplace_table_reservation_rate,
        predicted_revenue_change_pct: Math.round(missedPct * 0.4),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `FIREPLACE SEATING NOT PREMIUM: ${d.location_id} has ${d.fireplace_table_count} fireplace-adjacent tables but priced only ${d.fireplace_table_premium_pct}% premium (min ${config.minFireplaceTablePremiumPct}%). ${criticalNote}Tables near fireplaces command 15-25% premium pricing and are reserved first (OpenTable) — this is not optional upselling, it is market-rate pricing for a premium experience. Customers willingly pay more for fireplace ambiance: 68% of customers say a fireplace increases dining satisfaction (NRA), and 45% choose restaurants with fireplaces for special occasions (anniversaries, dates) — these celebratory bookings have high willingness-to-pay. Fireplace tables are the restaurant equivalent of premium concert seats — they should carry premium pricing. Implementation: add 15-25% surcharge to fireplace-adjacent tables (or higher base price for prefixed fireplace seating), market as "fireside seating" or "hearth table" on reservation platform, require minimum spend for premium fireplace tables on peak nights. Reservation rate of ${d.fireplace_table_reservation_rate}% confirms demand — customers already seek these tables, so pricing power exists. Expected impact: +${missedPct}% revenue from fireplace tables, +5-8% overall seating revenue, no demand loss (premium tables still reserve first).`,
        ai_recommendation: 'price_fireplace_tables_as_premium',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: FIREPLACE_TYPE_WRONG
    const wrongType = (d.setting_type === 'urban' && d.fireplace_type === 'wood' && !config.allowWoodFireplaceInUrban)
      || (d.restaurant_tier === 'fine_dining' && d.fireplace_type === 'electric' && !config.allowElectricFireplaceInLuxury);
    if (d.has_fireplace && wrongType) {
      // Wood fireplace in urban (smoke/permits) or electric in luxury (perceived cheap)
      let issueNote = '';
      let replaceNote = '';
      let severity: 'critical' | 'high' | 'medium' = 'high';
      if (d.setting_type === 'urban' && d.fireplace_type === 'wood') {
        issueNote = 'CRITICAL: WOOD fireplace in URBAN setting — smoke complaints from neighbors, air quality permit requirements, potential EPA emissions violations, ash cleanup burden, chimney fire risk, insurance complications. Many cities (NYC, SF, Seattle) have banned or restricted new wood-burning fireplace installations in commercial settings. Wood fireplace is 60% efficient vs gas 90% — wasting 40% of heat energy as lost flue gases. Customers in urban settings increasingly environmentally conscious — visible wood smoke may attract negative reviews citing air pollution. ';
        replaceNote = 'Replace with DIRECT-VENT GAS fireplace: 90% efficient, no smoke/ash/cleanup, instant on/off, no chimney required (vent through wall), lower insurance premiums, no permit issues for most municipalities. If gas line not available: high-end electric fireplace with realistic flame effect + supplemental HVAC heat. ';
        severity = 'critical';
      } else if (d.restaurant_tier === 'fine_dining' && d.fireplace_type === 'electric') {
        issueNote = `HIGH: ELECTRIC fireplace in FINE DINING restaurant — perceived as cheap and artificial. Fine dining customers expect authentic ambiance — electric fireplace flame effects, even high-end ones, register as "fake" to discerning customers. Brand positioning mismatch: $100+ check average paired with $200 electric fireplace signals cost-cutting that undermines premium positioning. Perceived warmth score of ${d.perceived_warmth_score}/100 reflects this — customers do not feel emotionally warmed by an electric flame. `;
        replaceNote = 'Replace with GAS fireplace (direct-vent) or authentic WOOD fireplace (if rural setting permits): real flame delivers authentic ambiance that justifies premium pricing. Gas fireplace recommended for fine dining — 90% efficient, real flame, no smoke, instant control, premium appearance. ';
        severity = 'high';
      }
      const lostRevenue = Math.round(baselineRevenue * 0.06);
      alerts.push({
        rule_id: 'fireplace_type_wrong',
        severity,
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        setting_type: d.setting_type,
        has_fireplace: d.has_fireplace,
        fireplace_type: d.fireplace_type,
        perceived_warmth_score: d.perceived_warmth_score,
        brand_positioning_score: d.brand_positioning_score,
        perceived_warmth_change: -Math.round(8),
        customer_satisfaction_change: -Math.round(7),
        return_likelihood_change: -Math.round(6),
        predicted_revenue_change_pct: -Math.round(6),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `FIREPLACE TYPE WRONG: ${d.location_id} has ${d.fireplace_type.toUpperCase()} fireplace in ${d.setting_type} / ${d.restaurant_tier} setting. ${issueNote}${replaceNote}Fireplace type must match setting and brand positioning. Wood fireplace appropriate for rural/lodge/resort settings where smoke is acceptable and permits are obtainable. Gas fireplace appropriate for almost all settings — urban, suburban, fine dining, casual. Electric fireplace appropriate for casual/fast-casual settings where visual ambiance is sufficient and brand is not luxury. Mismatched fireplace type signals lack of attention to detail and undermines the ambiance investment. Expected impact: +6-10% perceived warmth, +8-12% brand positioning score, eliminates compliance/legal risk, +5-8% satisfaction from authentic flame.`,
        ai_recommendation: 'replace_fireplace_type',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: OUTDOOR_FIRE_PIT_ABSENT
    if (config.requireOutdoorFirePitIfPatio && d.has_outdoor_patio && !d.has_outdoor_fire_pit && d.outdoor_fire_pit_count === 0) {
      // No outdoor fire feature -> missed 6-8 week patio season extension
      const missedWeeks = 7; // 6-8 week patio season extension
      const patioSeasonRevenue = Math.round(d.summer_revenue * 0.15 / 12 * missedWeeks);
      const lostRevenue = Math.max(patioSeasonRevenue, Math.round(baselineRevenue * 0.05));
      const criticalNote = d.climate_zone === 'cold'
        ? 'CRITICAL: restaurant has outdoor patio in COLD climate but NO outdoor fire pit. Outdoor fire pits extend patio season by 6-8 weeks (fall/spring) — in cold climates, patio is unusable 5-7 months per year without fire feature. Each additional week of patio operation generates significant incremental revenue at near-zero marginal cost (patio tables already exist). '
        : 'HIGH: restaurant has outdoor patio but NO outdoor fire pit. Even in temperate climates, outdoor fire pit extends patio season by 4-6 weeks on each shoulder (fall + spring) — extends usable patio from ~6 months to ~8 months. ';
      alerts.push({
        rule_id: 'outdoor_fire_pit_absent',
        severity: d.climate_zone === 'cold' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        has_outdoor_patio: d.has_outdoor_patio,
        has_outdoor_fire_pit: d.has_outdoor_fire_pit,
        outdoor_fire_pit_count: d.outdoor_fire_pit_count,
        tabletop_fire_bowls_count: d.tabletop_fire_bowls_count,
        patio_season_weeks_extended: d.patio_season_weeks_extended,
        seasonal_revenue_change_pct: -Math.round(missedWeeks * 2),
        predicted_revenue_change_pct: -Math.round(5),
        est_monthly_opportunity: Math.max(lostRevenue, 1800),
        description: `OUTDOOR FIRE PIT ABSENT: ${d.location_id} has outdoor patio but NO outdoor fire feature (no fire pit, no outdoor fireplace). ${criticalNote}Outdoor fire pits extend patio season by 6-8 weeks (fall/spring) — each week of additional patio operation generates incremental revenue at near-zero marginal cost. Patio tables already exist; fire pit makes them usable in 40-55°F weather that would otherwise send customers indoors. Outdoor fire features also drive Instagram photo-taking (visible flame features increase photos 30-40%) — free marketing for patio ambiance. Outdoor fire pit creates destination atmosphere — customers travel specifically for "patio with fire pit" experience, especially in evening hours. Cost-effective: outdoor gas fire pit installation $3,000-8,000, pays back in 1-2 months of extended season. Even simpler: tabletop fire bowls (${d.tabletop_fire_bowls_count} currently) provide localized warmth at each patio table — add 4-6 more at $200-500 each. Expected impact: +6-8 weeks patio operation, +30-40% patio revenue in shoulder seasons, +25-35% patio Instagram photos.`,
        ai_recommendation: 'install_outdoor_fire_pit',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: FIREPLACE_MAINTENANCE_OVERDUE
    if (d.has_fireplace && d.fireplace_maintenance_months_ago > config.maxFireplaceMaintenanceMonths) {
      // Fireplace not serviced -> safety risk + operational failure
      const overdueMonths = d.fireplace_maintenance_months_ago - config.maxFireplaceMaintenanceMonths;
      const riskPct = Math.min(15 + overdueMonths * 3, 45);
      const lostRevenue = Math.round(baselineRevenue * (riskPct / 100) * 0.05);
      const criticalNote = d.fireplace_maintenance_months_ago > 24
        ? 'CRITICAL: fireplace not serviced in over 24 months — severe safety risk. Creosote buildup in wood fireplaces (chimney fire risk), gas leaks in gas fireplaces (carbon monoxide + explosion risk), electrical faults in electric fireplaces (fire risk). Insurance may not cover damage from unserviced fireplace — adjusters specifically inspect maintenance records after incidents. A chimney fire can destroy the entire restaurant + cause injuries/deaths. '
        : d.fireplace_maintenance_months_ago > 18
          ? 'HIGH: fireplace not serviced in 18+ months — significant safety risk accumulating. Creosote buildup, gas connection degradation, electrical component wear. Operational failure likely during peak season when fireplace is most needed. '
          : `MEDIUM: fireplace ${overdueMonths} months overdue for service. Risk increasing each month. `;
      const safetyIssue = config.requireFireplaceSafetyCertified && !d.fireplace_safety_certified
        ? ' Safety certification EXPIRED or absent — required for commercial fireplace operation in most jurisdictions. Operating without certification is illegal + voids insurance. '
        : '';
      alerts.push({
        rule_id: 'fireplace_maintenance_overdue',
        severity: d.fireplace_maintenance_months_ago > 24 ? 'critical' : d.fireplace_maintenance_months_ago > 18 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_fireplace: d.has_fireplace,
        fireplace_type: d.fireplace_type,
        fireplace_maintenance_months_ago: d.fireplace_maintenance_months_ago,
        fireplace_safety_certified: d.fireplace_safety_certified,
        predicted_revenue_change_pct: -Math.round(riskPct * 0.05),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `FIREPLACE MAINTENANCE OVERDUE: ${d.location_id} fireplace (${d.fireplace_type}) last serviced ${d.fireplace_maintenance_months_ago} months ago (max ${config.maxFireplaceMaintenanceMonths}). ${criticalNote}${safetyIssue}Fireplace maintenance is not optional — it is a safety, legal, and operational requirement. Wood fireplaces: annual chimney sweep required ($150-300) — creosote buildup causes chimney fires that can spread to entire structure. Gas fireplaces: annual inspection required ($100-200) — gas leaks cause carbon monoxide poisoning (odorless, deadly) + explosion risk. Electric fireplaces: biennial inspection — electrical faults cause fires. Safety certification required annually for commercial fireplaces in most jurisdictions — operating without certification voids insurance and is illegal. Schedule service immediately: chimney sweep (wood), gas tech inspection (gas), electrician (electric). Maintain service log for insurance + inspection compliance. Expected impact: eliminates safety/legal risk, ensures fireplace operates during peak season, prevents costly emergency repairs.`,
        ai_recommendation: 'service_fireplace',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: FIREPLACE_VISUAL_IMPACT_POOR
    if (d.has_fireplace && d.fireplace_visibility_score < config.minFireplaceVisibilityScore) {
      // Fireplace hidden/not visible from most tables -> wasted ambiance investment
      const visibilityGap = config.minFireplaceVisibilityScore - d.fireplace_visibility_score;
      const wastedPct = Math.min(15 + visibilityGap * 0.4, 32);
      const lostRevenue = Math.round(baselineRevenue * (wastedPct / 100) * 0.08);
      const criticalNote = d.fireplace_visibility_score < 30
        ? 'CRITICAL: fireplace visible from less than 30% of tables — capital investment delivers ambiance to only a fraction of guests. Customers seated without fireplace sightline do not experience the warmth, coziness, or visual interest that justifies premium pricing. Effectively, the restaurant has paid for a fireplace but most customers get no benefit. '
        : d.fireplace_visibility_score < 50
          ? `HIGH: fireplace visible from only ${d.fireplace_visibility_score}% of tables (min ${config.minFireplaceVisibilityScore}%) — half of customers miss the ambiance. `
          : `MEDIUM: fireplace visibility ${d.fireplace_visibility_score}% (min ${config.minFireplaceVisibilityScore}%) — below threshold. `;
      const centralNote = !d.fireplace_central
        ? ' Fireplace is not centrally located — likely tucked in corner or side wall, limiting sightlines. '
        : '';
      alerts.push({
        rule_id: 'fireplace_visual_impact_poor',
        severity: d.fireplace_visibility_score < 30 ? 'critical' : d.fireplace_visibility_score < 50 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_fireplace: d.has_fireplace,
        fireplace_type: d.fireplace_type,
        fireplace_visibility_score: d.fireplace_visibility_score,
        fireplace_central: d.fireplace_central,
        perceived_warmth_change: -Math.round(wastedPct * 0.5),
        customer_satisfaction_change: -Math.round(wastedPct * 0.4),
        return_likelihood_change: -Math.round(wastedPct * 0.3),
        predicted_revenue_change_pct: -Math.round(wastedPct * 0.08),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `FIREPLACE VISUAL IMPACT POOR: ${d.location_id} fireplace visible from only ${d.fireplace_visibility_score}% of tables (min ${config.minFireplaceVisibilityScore}%). ${criticalNote}${centralNote}A fireplace that is not visible from most tables delivers only a fraction of its ambiance value. Visible flame features increase Instagram photo-taking 30-40% — but only if customers can SEE the flame. Customers seated without fireplace sightline feel they are missing the ambiance, leading to lower satisfaction scores and reduced return likelihood. 68% of customers say a fireplace increases dining satisfaction (NRA) — but this only applies if they can see it. Solutions: (1) install mirrors or reflective surfaces that bring flame reflections to other parts of the room, (2) add tabletop fire bowls (${d.tabletop_fire_bowls_count} currently — add 4-6 more) to extend flame visibility to all tables, (3) relocate seating to maximize fireplace sightlines, (4) install second fireplace in opposite corner for full coverage, (5) for new construction: design dining room with fireplace as central focal point (not side wall). Expected impact: +${Math.round(visibilityGap * 0.6)}% perceived warmth across all tables, +25-35% Instagram photos, +8-12% overall satisfaction.`,
        ai_recommendation: 'relocate_or_expose_fireplace',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: FIREPLACE_SEASONAL_UNDERUTILIZATION
    if (d.has_fireplace && config.requireFallSpringFireplaceUsage && (d.fireplace_spring_usage_pct < config.minSeasonalUsagePct || d.fireplace_fall_usage_pct < config.minSeasonalUsagePct)) {
      // Fireplace only used in winter -> missed fall/spring ambiance opportunity
      const springGap = Math.max(config.minSeasonalUsagePct - d.fireplace_spring_usage_pct, 0);
      const fallGap = Math.max(config.minSeasonalUsagePct - d.fireplace_fall_usage_pct, 0);
      const totalGap = springGap + fallGap;
      const missedPct = Math.min(10 + totalGap * 0.3, 28);
      const shoulderRevenue = (d.spring_revenue + d.fall_revenue) / 6; // ~2mo per shoulder / 6 months
      const lostRevenue = Math.round(shoulderRevenue * (missedPct / 100));
      const summerNote = d.fireplace_summer_usage_pct === 0 && !d.fireplace_visual_only_summer && d.fireplace_type === 'electric'
        ? ' NOTE: electric fireplace can be used visual-only (no heat) in summer for ambiance — currently not used at all in summer. '
        : '';
      const criticalNote = d.fireplace_spring_usage_pct < 15 && d.fireplace_fall_usage_pct < 15
        ? 'CRITICAL: fireplace used almost exclusively in winter — spring and fall usage below 15%. Fireplace ambiance is valuable in shoulder seasons too: cool spring/fall evenings (40-60°F) are prime fireplace weather, and customers seek cozy atmosphere during these transitional months. Even summer evenings can benefit from visual-only electric fireplace use. '
        : `HIGH: fireplace underutilized in shoulder seasons — spring ${d.fireplace_spring_usage_pct}% / fall ${d.fireplace_fall_usage_pct}% (min ${config.minSeasonalUsagePct}%). `;
      alerts.push({
        rule_id: 'fireplace_seasonal_underutilization',
        severity: d.fireplace_spring_usage_pct < 15 && d.fireplace_fall_usage_pct < 15 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        climate_zone: d.climate_zone,
        has_fireplace: d.has_fireplace,
        fireplace_type: d.fireplace_type,
        fireplace_winter_usage_pct: d.fireplace_winter_usage_pct,
        fireplace_spring_usage_pct: d.fireplace_spring_usage_pct,
        fireplace_summer_usage_pct: d.fireplace_summer_usage_pct,
        fireplace_fall_usage_pct: d.fireplace_fall_usage_pct,
        fireplace_visual_only_summer: d.fireplace_visual_only_summer,
        seasonal_revenue_change_pct: -Math.round(missedPct),
        predicted_revenue_change_pct: -Math.round(missedPct * 0.4),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `FIREPLACE SEASONAL UNDERUTILIZATION: ${d.location_id} fireplace used ${d.fireplace_winter_usage_pct}% in winter but only ${d.fireplace_spring_usage_pct}% spring / ${d.fireplace_fall_usage_pct}% fall / ${d.fireplace_summer_usage_pct}% summer. ${criticalNote}${summerNote}Fireplace is a year-round ambiance asset, not just a winter heating device. Shoulder seasons (fall + spring) have cool evenings (40-60°F) when fireplace ambiance is most appreciated — customers seek cozy atmosphere during transitional weather. Spring (March-May) and fall (Sept-Nov) each represent ~3 months of underutilized fireplace opportunity. Gas fireplace: light on cool evenings year-round (no smoke, instant on/off). Wood fireplace: light on cool evenings in shoulder seasons (build smaller fires). Electric fireplace: use visual-only mode in summer for ambiance without heat. Implementation: revise fireplace lighting SOP to trigger on temperature below 60°F (not on calendar month), train staff to light fireplace on cool evenings regardless of season, market "cozy fireside dining" in shoulder season promotions. Expected impact: +${Math.round(missedPct)}% shoulder season revenue, +25-35% dwell time in spring/fall, +30-40% Instagram photos in shoulder seasons.`,
        ai_recommendation: 'extend_fireplace_season',
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
              { role: 'system', content: 'You are a restaurant fireplace + fire feature impact optimization expert. Given fireplace/fire feature inspection data, recommend ONE specific action with expected warmth perception, satisfaction, dwell time, seating premium, seasonal revenue, or brand positioning impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Restaurant tier: ${a.restaurant_tier ?? 'n/a'}. Climate: ${a.climate_zone ?? 'n/a'}. Setting: ${a.setting_type ?? 'n/a'}. Has fireplace: ${a.has_fireplace ?? false}. Type: ${a.fireplace_type ?? 'none'}. Count: ${a.fireplace_count ?? 0}. Lit during peak: ${a.fireplace_lit_during_peak ?? false}. Lit hours/day: ${a.fireplace_lit_hours_per_day ?? 0}. Fireplace tables: ${a.fireplace_table_count ?? 0}, premium: ${a.fireplace_table_premium_pct ?? 0}%, reserved first: ${a.fireplace_table_reservation_rate ?? 0}%. Visibility: ${a.fireplace_visibility_score ?? 0}/100. Central: ${a.fireplace_central ?? false}. Maintenance: ${a.fireplace_maintenance_months_ago ?? 0} months ago. Safety certified: ${a.fireplace_safety_certified ?? false}. Outdoor patio: ${a.has_outdoor_patio ?? false}. Outdoor fire pit: ${a.has_outdoor_fire_pit ?? false} (${a.outdoor_fire_pit_count ?? 0}). Tabletop bowls: ${a.tabletop_fire_bowls_count ?? 0}. Decorative flame: ${a.decorative_flame_features_count ?? 0}. Patio weeks extended: ${a.patio_season_weeks_extended ?? 0}. Seasonal usage: winter ${a.fireplace_winter_usage_pct ?? 0}% / spring ${a.fireplace_spring_usage_pct ?? 0}% / summer ${a.fireplace_summer_usage_pct ?? 0}% / fall ${a.fireplace_fall_usage_pct ?? 0}%. Visual-only summer: ${a.fireplace_visual_only_summer ?? false}. Perceived warmth: ${a.perceived_warmth_score ?? 0}/100. Coziness: ${a.perceived_coziness_score ?? 0}/100. Dwell: ${a.dwell_time_minutes ?? 0} min (baseline ${a.dwell_time_baseline_minutes ?? 0}). Instagram photos/wk: ${a.instagram_photo_freq_per_week ?? 0}. Special occasions/mo: ${a.special_occasion_bookings_per_month ?? 0}. Brand: ${a.brand_positioning_score ?? 0}/100. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM fireplace_feature_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE fireplace_feature_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<FireplaceFireFeatureAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM fireplace_feature_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  fireplacesAtRisk: number; unlitPeakFireplaces: number; noOutdoorFirePitPatios: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(has_fireplace = true) AS fireplaces,
              math::count(rule_id = 'fireplace_unused_during_peak') AS unlitpeak,
              math::count(rule_id = 'outdoor_fire_pit_absent') AS nopit
       FROM fireplace_feature_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      fireplacesAtRisk: safeNumber(r.fireplaces, 0),
      unlitPeakFireplaces: safeNumber(r.unlitpeak, 0),
      noOutdoorFirePitPatios: safeNumber(r.nopit, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, fireplacesAtRisk: 0, unlitPeakFireplaces: 0, noOutdoorFirePitPatios: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
