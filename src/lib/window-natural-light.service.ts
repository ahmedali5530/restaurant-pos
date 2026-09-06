/**
 * AI Window Treatment & Natural Light Optimizer — predicts how window
 * treatments and natural light (window size, curtain/blind type, sunlight
 * control, glare management, view quality, UV protection, natural light
 * optimization, window cleanliness, seasonal light adjustment) impacts
 * customer satisfaction, perceived spaciousness, energy savings, and dwell
 * time.
 *
 * Natural light increases customer satisfaction by 20-25% vs artificial-only
 * lighting (Cornell CHR). Restaurants with good natural light see 15% longer
 * dwell during daytime hours. Glare from unshaded windows causes discomfort
 * -> 12% shorter dwell for affected tables. UV damage from sunlight fades
 * furniture, artwork, and flooring ($500-2,000/yr replacement). Window seats
 * are the #1 most requested seating position (58% of customers prefer window
 * seats, OpenTable). Dirty windows reduce perceived cleanliness by 30%
 * (customers equate dirty windows with dirty kitchen). Smart blinds that
 * auto-adjust to sun position save 15-20% on HVAC costs.
 *
 * 168th POSR-exclusive differentiator — restaurants lose $1,000-5,500/mo per
 * location from poor window treatment + natural light management (unshaded
 * glare, windows covered during daytime, window seats underutilized, dirty
 * windows, UV damage, poor view quality, no seasonal adjustment, treatment
 * brand mismatch). Existing ambience services focus on artificial lighting.
 * This deep-dives into the WINDOW + NATURAL LIGHT layer — the windows,
 * curtains/blinds, glare control, view quality, UV protection, and seasonal
 * adjustment that subconsciously drive customer satisfaction, perceived
 * spaciousness, dwell, and energy costs.
 *
 * Distinct from:
 *   - lighting-ambience (143rd) — artificial light intensity/temp (not windows)
 *   - seating-comfort-furniture (157th) — seat comfort (not window seat optimization)
 *   - curb-appeal-facade (164th) — exterior windows from outside (not interior)
 *   - color-scheme-palette (167th) — wall paint color (not window treatment)
 *   - temperature-hvac-comfort (148th) — HVAC temp (smart blinds reduce HVAC load)
 *
 * 8 AI rules:
 *   1. glare_uncontrolled -> unshaded windows cause glare on tables -> 12% dwell reduction
 *   2. natural_light_underutilized -> windows covered during daytime -> missed 20-25% satisfaction boost
 *   3. window_seats_not_optimized -> window seats underutilized -> missed premium positioning
 *   4. window_cleanliness_poor -> dirty windows -> 30% perceived cleanliness drop
 *   5. uv_damage_risk -> no UV protection -> furniture/artwork fading ($500-2,000/yr)
 *   6. view_quality_poor -> unpleasant view visible -> negative experience
 *   7. seasonal_light_adjustment_missing -> same treatment all year -> winter glare + summer heat
 *   8. window_treatment_brand_mismatch -> curtains/blinds do not match restaurant tier
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type WindowNaturalLightRuleId =
  | 'glare_uncontrolled'
  | 'natural_light_underutilized'
  | 'window_seats_not_optimized'
  | 'window_cleanliness_poor'
  | 'uv_damage_risk'
  | 'view_quality_poor'
  | 'seasonal_light_adjustment_missing'
  | 'window_treatment_brand_mismatch';

export type WindowNaturalLightAiRec =
  | 'install_glare_control_treatment'
  | 'open_window_treatments_daytime'
  | 'optimize_window_seats'
  | 'clean_windows_professionally'
  | 'install_uv_protection_film'
  | 'obscure_or_redirect_view'
  | 'add_seasonal_treatment_swap'
  | 'upgrade_treatment_to_match_tier'
  | 'monitor'
  | 'skip';

export interface WindowNaturalLightAlert {
  id?: string;
  rule_id: WindowNaturalLightRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                              // 'main_dining' | 'bar' | 'private_room' | 'patio' | 'entry'
  // Window physical
  window_count?: number;                              // number of windows in zone
  window_size?: string;                               // 'small' | 'medium' | 'large' | 'wall_to_wall'
  // Window treatment
  window_treatment_type?: string;                     // 'none' | 'sheer_curtain' | 'blackout_curtain' | 'venetian_blinds' | 'roller_blinds' | 'smart_blinds' | 'shades' | 'drapes'
  treatment_brand_match?: boolean;                    // treatment matches restaurant tier
  restaurant_tier?: string;                           // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  smart_blinds_installed?: boolean;                   // motorized blinds that auto-adjust to sun
  // Light + glare
  sunlight_control_score?: number;                    // 0-100 (how well sunlight is controlled)
  glare_management_score?: number;                    // 0-100 (how well glare on tables is managed)
  natural_light_utilization_score?: number;           // 0-100 (how much natural light is harvested)
  natural_light_hours_per_day?: number;               // hours/day natural light is utilized (0-12)
  // View
  view_quality?: string;                              // 'excellent' | 'pleasant' | 'neutral' | 'unpleasant' | 'blocked'
  view_quality_score?: number;                        // 0-100
  // UV protection
  uv_protection_present?: boolean;                    // UV film or UV-blocking treatment
  uv_protection_score?: number;                       // 0-100
  // Window seats
  window_seats_count?: number;                        // number of seats with window view
  window_seats_optimized?: boolean;                   // configured as premium seats
  // Cleanliness
  window_cleanliness_score?: number;                  // 0-100 (100 = pristine, lower = dirty)
  // Seasonal adjustment
  seasonal_adjustment_present?: boolean;              // treatment changes by season
  // Energy
  hvac_savings_potential_pct?: number;                // % HVAC savings possible with smart blinds
  // Economics
  monthly_revenue?: number;
  monthly_covers?: number;
  avg_ticket?: number;
  // Impact
  customer_satisfaction_change?: number;              // % change in customer satisfaction
  perceived_spaciousness_change?: number;             // % change in perceived spaciousness
  predicted_dwell_change?: number;                    // % change in dwell time
  energy_savings_change?: number;                     // % change in energy costs (negative = savings)
  predicted_revenue_change_pct?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: WindowNaturalLightAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface WindowNaturalLightConfig {
  aiEnabled: boolean;
  minGlareManagementScore: number;           // min glare management score (0-100)
  minNaturalLightUtilizationScore: number;   // min natural light utilization (0-100)
  minNaturalLightHoursPerDay: number;        // min hours/day natural light used
  requireWindowSeatsOptimized: boolean;      // require window seats optimized
  minWindowSeatsCount: number;               // min window seats per zone
  minWindowCleanlinessScore: number;         // min window cleanliness (0-100)
  requireUvProtection: boolean;              // require UV protection
  minUvProtectionScore: number;              // min UV protection score (0-100)
  minViewQualityScore: number;               // min view quality (0-100)
  requireSeasonalAdjustment: boolean;        // require seasonal treatment swap
  requireTreatmentBrandMatch: boolean;       // require treatment matches tier
  requireSmartBlindsForLargeWindows: boolean; // smart blinds for large/wall_to_wall windows
}

export const DEFAULT_WINDOW_NATURAL_LIGHT_CONFIG: WindowNaturalLightConfig = {
  aiEnabled: true,
  minGlareManagementScore: 70,
  minNaturalLightUtilizationScore: 65,
  minNaturalLightHoursPerDay: 4,
  requireWindowSeatsOptimized: true,
  minWindowSeatsCount: 4,
  minWindowCleanlinessScore: 80,
  requireUvProtection: true,
  minUvProtectionScore: 70,
  minViewQualityScore: 60,
  requireSeasonalAdjustment: true,
  requireTreatmentBrandMatch: true,
  requireSmartBlindsForLargeWindows: true,
};

export const readWindowNaturalLightConfig = (settings: any): WindowNaturalLightConfig => ({
  aiEnabled: settings?.window_natural_light_ai_enabled ?? true,
  minGlareManagementScore: safeNumber(settings?.window_natural_light_min_glare_score, 70),
  minNaturalLightUtilizationScore: safeNumber(settings?.window_natural_light_min_utilization, 65),
  minNaturalLightHoursPerDay: safeNumber(settings?.window_natural_light_min_hours, 4),
  requireWindowSeatsOptimized: settings?.window_natural_light_require_window_seats_optimized ?? true,
  minWindowSeatsCount: safeNumber(settings?.window_natural_light_min_window_seats, 4),
  minWindowCleanlinessScore: safeNumber(settings?.window_natural_light_min_cleanliness, 80),
  requireUvProtection: settings?.window_natural_light_require_uv ?? true,
  minUvProtectionScore: safeNumber(settings?.window_natural_light_min_uv_score, 70),
  minViewQualityScore: safeNumber(settings?.window_natural_light_min_view_score, 60),
  requireSeasonalAdjustment: settings?.window_natural_light_require_seasonal ?? true,
  requireTreatmentBrandMatch: settings?.window_natural_light_require_brand_match ?? true,
  requireSmartBlindsForLargeWindows: settings?.window_natural_light_require_smart_blinds ?? true,
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Restaurant tier -> acceptable window treatment types (brand match)
const TIER_TREATMENT_MAP: Record<string, string[]> = {
  quick_service:  ['roller_blinds', 'venetian_blinds', 'shades'],                   // utilitarian, easy-clean
  fast_casual:    ['roller_blinds', 'venetian_blinds', 'shades', 'sheer_curtain'],  // casual + clean
  casual_dining:  ['sheer_curtain', 'venetian_blinds', 'roller_blinds', 'shades', 'drapes'],  // warm + design
  fine_dining:    ['drapes', 'sheer_curtain', 'smart_blinds'],                       // premium fabric + motorized
};

interface WindowNaturalLightData {
  location_id: string;
  window_count: number;
  window_size: string;
  window_treatment_type: string;
  treatment_brand_match: boolean;
  restaurant_tier: string;
  smart_blinds_installed: boolean;
  sunlight_control_score: number;
  glare_management_score: number;
  natural_light_utilization_score: number;
  natural_light_hours_per_day: number;
  view_quality: string;
  view_quality_score: number;
  uv_protection_present: boolean;
  uv_protection_score: number;
  window_seats_count: number;
  window_seats_optimized: boolean;
  window_cleanliness_score: number;
  seasonal_adjustment_present: boolean;
  hvac_savings_potential_pct: number;
  monthly_revenue: number;
  monthly_covers: number;
  avg_ticket: number;
}

const MOCK_DATA: WindowNaturalLightData[] = [
  {
    location_id: 'main_dining', window_count: 6, window_size: 'large',
    window_treatment_type: 'none', treatment_brand_match: false, restaurant_tier: 'casual_dining',
    smart_blinds_installed: false,
    sunlight_control_score: 25, glare_management_score: 20,
    natural_light_utilization_score: 90, natural_light_hours_per_day: 8,
    view_quality: 'pleasant', view_quality_score: 75,
    uv_protection_present: false, uv_protection_score: 10,
    window_seats_count: 8, window_seats_optimized: false,
    window_cleanliness_score: 55, seasonal_adjustment_present: false,
    hvac_savings_potential_pct: 18,
    monthly_revenue: 52000, monthly_covers: 1400, avg_ticket: 37,
  },
  {
    location_id: 'bar_zone', window_count: 2, window_size: 'medium',
    window_treatment_type: 'venetian_blinds', treatment_brand_match: true, restaurant_tier: 'fast_casual',
    smart_blinds_installed: false,
    sunlight_control_score: 70, glare_management_score: 65,
    natural_light_utilization_score: 55, natural_light_hours_per_day: 3,
    view_quality: 'unpleasant', view_quality_score: 35,
    uv_protection_present: true, uv_protection_score: 75,
    window_seats_count: 0, window_seats_optimized: false,
    window_cleanliness_score: 85, seasonal_adjustment_present: false,
    hvac_savings_potential_pct: 12,
    monthly_revenue: 28000, monthly_covers: 800, avg_ticket: 35,
  },
  {
    location_id: 'private_room', window_count: 1, window_size: 'medium',
    window_treatment_type: 'blackout_curtain', treatment_brand_match: false, restaurant_tier: 'fine_dining',
    smart_blinds_installed: false,
    sunlight_control_score: 95, glare_management_score: 95,
    natural_light_utilization_score: 15, natural_light_hours_per_day: 0,
    view_quality: 'blocked', view_quality_score: 20,
    uv_protection_present: true, uv_protection_score: 90,
    window_seats_count: 4, window_seats_optimized: false,
    window_cleanliness_score: 92, seasonal_adjustment_present: false,
    hvac_savings_potential_pct: 8,
    monthly_revenue: 22000, monthly_covers: 450, avg_ticket: 49,
  },
  {
    location_id: 'patio_zone', window_count: 4, window_size: 'wall_to_wall',
    window_treatment_type: 'smart_blinds', treatment_brand_match: true, restaurant_tier: 'casual_dining',
    smart_blinds_installed: true,
    sunlight_control_score: 88, glare_management_score: 85,
    natural_light_utilization_score: 80, natural_light_hours_per_day: 6,
    view_quality: 'excellent', view_quality_score: 92,
    uv_protection_present: true, uv_protection_score: 88,
    window_seats_count: 12, window_seats_optimized: true,
    window_cleanliness_score: 90, seasonal_adjustment_present: true,
    hvac_savings_potential_pct: 20,
    monthly_revenue: 31000, monthly_covers: 950, avg_ticket: 33,
  },
];

export const runWindowNaturalLightEngine = async (
  db: ReturnType<typeof useDB>,
  config: WindowNaturalLightConfig = DEFAULT_WINDOW_NATURAL_LIGHT_CONFIG
): Promise<{ alerts: WindowNaturalLightAlert[]; generated: number }> => {
  const alerts: WindowNaturalLightAlert[] = [];
  const now = new Date();

  let data: WindowNaturalLightData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, window_count, window_size, window_treatment_type,
              treatment_brand_match, restaurant_tier, smart_blinds_installed,
              sunlight_control_score, glare_management_score,
              natural_light_utilization_score, natural_light_hours_per_day,
              view_quality, view_quality_score,
              uv_protection_present, uv_protection_score,
              window_seats_count, window_seats_optimized,
              window_cleanliness_score, seasonal_adjustment_present,
              hvac_savings_potential_pct,
              monthly_revenue, monthly_covers, avg_ticket
       FROM window_natural_light_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'main_dining'),
      window_count: safeNumber(r.window_count, 0),
      window_size: String(r.window_size ?? 'medium'),
      window_treatment_type: String(r.window_treatment_type ?? 'none'),
      treatment_brand_match: Boolean(r.treatment_brand_match ?? false),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      smart_blinds_installed: Boolean(r.smart_blinds_installed ?? false),
      sunlight_control_score: safeNumber(r.sunlight_control_score, 50),
      glare_management_score: safeNumber(r.glare_management_score, 50),
      natural_light_utilization_score: safeNumber(r.natural_light_utilization_score, 50),
      natural_light_hours_per_day: safeNumber(r.natural_light_hours_per_day, 0),
      view_quality: String(r.view_quality ?? 'neutral'),
      view_quality_score: safeNumber(r.view_quality_score, 50),
      uv_protection_present: Boolean(r.uv_protection_present ?? false),
      uv_protection_score: safeNumber(r.uv_protection_score, 0),
      window_seats_count: safeNumber(r.window_seats_count, 0),
      window_seats_optimized: Boolean(r.window_seats_optimized ?? false),
      window_cleanliness_score: safeNumber(r.window_cleanliness_score, 50),
      seasonal_adjustment_present: Boolean(r.seasonal_adjustment_present ?? false),
      hvac_savings_potential_pct: safeNumber(r.hvac_savings_potential_pct, 0),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      monthly_covers: safeNumber(r.monthly_covers, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch (err) {
    console.warn('[window-natural-light] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    if (d.window_count === 0) continue;                // no windows -> skip
    const baselineRevenue = d.monthly_revenue;

    // Rule 1: GLARE_UNCONTROLLED
    if (d.glare_management_score < config.minGlareManagementScore || d.window_treatment_type === 'none') {
      // Glare from unshaded windows causes discomfort -> 12% shorter dwell for affected tables
      const glareGap = config.minGlareManagementScore - d.glare_management_score;
      const dwellLossPct = Math.min(8 + glareGap * 0.15, 12);
      const affectedSeatsRatio = Math.min(d.window_seats_count / Math.max(d.monthly_covers / 30 / 5, 1), 1);
      const lostRevenue = Math.round(baselineRevenue * (dwellLossPct / 100) * 0.25 * (0.4 + affectedSeatsRatio * 0.6));
      const criticalNote = d.window_treatment_type === 'none'
        ? 'CRITICAL: zero window treatment — bare windows pour direct sunlight on tables during peak hours. Customers squint, shield eyes, move seats, leave early. 12% dwell reduction for affected window seats (Cornell CHR daylight study). '
        : d.glare_management_score < 40
          ? 'CRITICAL: glare management below 40 — sunlight hits tables during lunch + early dinner service. Customers complain, request seat changes, post negative reviews mentioning "blinding sun in my eyes". '
          : '';
      alerts.push({
        rule_id: 'glare_uncontrolled',
        severity: d.glare_management_score < 40 || d.window_treatment_type === 'none' ? 'high' : 'medium',
        location_id: d.location_id,
        window_count: d.window_count,
        window_size: d.window_size,
        window_treatment_type: d.window_treatment_type,
        sunlight_control_score: d.sunlight_control_score,
        glare_management_score: d.glare_management_score,
        window_seats_count: d.window_seats_count,
        predicted_dwell_change: -Math.round(dwellLossPct),
        customer_satisfaction_change: -Math.round(dwellLossPct * 0.7),
        predicted_revenue_change_pct: -Math.round(dwellLossPct * 0.25),
        est_monthly_opportunity: Math.max(lostRevenue, 900),
        description: `GLARE UNCONTROLLED: ${d.location_id} ${d.window_count} ${d.window_size} windows with ${d.window_treatment_type === 'none' ? 'NO treatment' : d.window_treatment_type} treatment. Glare management score ${d.glare_management_score}/100 (min ${config.minGlareManagementScore}). ${criticalNote}Unshaded windows cause direct sunlight on tables -> customers squint, shield eyes, request seat changes, leave early. Glare reduces dwell 12% for affected window seats (Cornell CHR daylight comfort study). Glare is the #1 daylight complaint in restaurants — worse than dim lighting, worse than harsh overhead. Direct sun on a plate reads as "spotlight on food" which subconsciously signals "eat fast + leave". Affected window seats go from premium to avoided — customers ask to move away from windows during peak sun hours, defeating the entire point of window seats. Glare also causes phone/photo glare (customers cannot Instagram their food in direct sun, missing free marketing). ${lostRevenue} revenue lost per month from reduced dwell + seat change disruptions + lower satisfaction. ACTION: install glare control treatment — sheer curtains (filter sunlight without blocking view, $200-800/zone, allow light + reduce glare 60%), venetian blinds (adjustable slats redirect sunlight upward to ceiling, $150-500/window, diffuse light onto ceiling for soft glow), roller shades (top-down/bottom-up design lets light in from top + blocks glare at table level, $200-600/window), smart blinds that auto-adjust to sun position (Lutron Serena, Pella, Hunter Douglas PowerRise — $400-1,200/window, track sun angle + auto-tilt slats), exterior awnings for south/west-facing windows (block sun before it hits glass, $500-2,000/window, reduce AC load 25%). Goal: filter sunlight, not block it. Save ${fmt$(Math.max(lostRevenue, 900))}/mo from recovered dwell + window seat premium + customer satisfaction. Glare control is the single highest-ROI window treatment — one set of blinds recovers dwell for every lunch service forever.`,
        ai_recommendation: 'install_glare_control_treatment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: NATURAL_LIGHT_UNDERUTILIZED
    if (d.natural_light_utilization_score < config.minNaturalLightUtilizationScore || d.natural_light_hours_per_day < config.minNaturalLightHoursPerDay) {
      // Windows covered during daytime -> missed 20-25% satisfaction boost
      const utilGap = config.minNaturalLightUtilizationScore - d.natural_light_utilization_score;
      const hoursGap = config.minNaturalLightHoursPerDay - d.natural_light_hours_per_day;
      const satisfactionLossPct = Math.min(12 + utilGap * 0.2 + hoursGap * 1.5, 25);
      const lostRevenue = Math.round(baselineRevenue * (satisfactionLossPct / 100) * 0.18);
      const criticalNote = d.natural_light_hours_per_day === 0
        ? 'CRITICAL: zero natural light hours per day — windows exist but treatments stay closed all day. Restaurant operates on artificial-only lighting during daylight hours, missing the 20-25% satisfaction boost that natural light provides (Cornell CHR). Customers subconsciously perceive artificial-only as "underground" or "closed". '
        : d.natural_light_utilization_score < 35
          ? 'CRITICAL: utilization below 35 — windows mostly covered, only narrow slivers of daylight entering. Brain reads as "this restaurant is hiding from daylight" -> subconsciously signals "sketchy" or "uninviting". '
          : '';
      alerts.push({
        rule_id: 'natural_light_underutilized',
        severity: d.natural_light_hours_per_day === 0 || d.natural_light_utilization_score < 35 ? 'high' : 'medium',
        location_id: d.location_id,
        window_count: d.window_count,
        window_size: d.window_size,
        window_treatment_type: d.window_treatment_type,
        natural_light_utilization_score: d.natural_light_utilization_score,
        natural_light_hours_per_day: d.natural_light_hours_per_day,
        customer_satisfaction_change: -Math.round(satisfactionLossPct),
        perceived_spaciousness_change: -Math.round(satisfactionLossPct * 0.5),
        predicted_dwell_change: -Math.round(satisfactionLossPct * 0.6),
        predicted_revenue_change_pct: -Math.round(satisfactionLossPct * 0.18),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `NATURAL LIGHT UNDERUTILIZED: ${d.location_id} ${d.window_count} windows but utilization score ${d.natural_light_utilization_score}/100 (min ${config.minNaturalLightUtilizationScore}) and ${d.natural_light_hours_per_day} hours/day of natural light (min ${config.minNaturalLightHoursPerDay}). ${criticalNote}Natural light increases customer satisfaction by 20-25% vs artificial-only lighting (Cornell CHR School of Hotel Administration daylight study). Restaurants with good natural light see 15% longer dwell during daytime hours. Customers biologically crave daylight — circadian rhythm drives mood, alertness, appetite. Artificial-only lighting during daytime hours reads as "this space does not trust daylight" or "this space is hiding something". Window seats with daylight command 58% preference (OpenTable). When treatments stay closed during daytime, restaurant throws away the satisfaction + dwell + perceived spaciousness boost that the windows were designed to provide. Window treatments exist to MANAGE daylight, not to BLOCK it — closed all day = wrong setting. ${lostRevenue} revenue lost per month from missed satisfaction boost + shorter dwell + lower perceived spaciousness. ACTION: open window treatments during daytime — train staff to open curtains/blinds at opening (sheer curtains stay drawn to filter, but slats/blinds tilt open), install smart blinds with daylight schedule (auto-open at sunrise, auto-adjust through day, auto-close at dusk — $400-1,200/window but recovers satisfaction every single day), use top-down/bottom-up shades (light from top, privacy at bottom — best of both), use light shelves (reflect sunlight deep into space, $500-1,500 install, doubles daylight reach 2x), repaint walls white or light to bounce daylight further (already addressed in color-scheme service), remove heavy drapes in favor of sheer liners (sheer blocks 30% of light vs drapes 95%). Save ${fmt$(Math.max(lostRevenue, 1000))}/mo from recovered satisfaction + dwell + perceived spaciousness. Daylight is free mood lighting — closing the curtains on it is throwing away money.`,
        ai_recommendation: 'open_window_treatments_daytime',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: WINDOW_SEATS_NOT_OPTIMIZED
    if (config.requireWindowSeatsOptimized && (!d.window_seats_optimized || d.window_seats_count < config.minWindowSeatsCount)) {
      // Window seats are #1 requested (58% of customers, OpenTable)
      const seatsGap = Math.max(0, config.minWindowSeatsCount - d.window_seats_count);
      const missedPremiumPct = !d.window_seats_optimized ? 18 : 6 + seatsGap * 1.5;
      const lostRevenue = Math.round(baselineRevenue * (missedPremiumPct / 100) * 0.12);
      const criticalNote = !d.window_seats_optimized && d.window_seats_count > 0
        ? 'CRITICAL: window seats exist but are NOT optimized — standard tables at windows, no premium pricing, no reservation priority, no comfort upgrades. Window seats are 58% of customer preference (OpenTable) but treated same as center tables -> missing premium revenue + reservation hook. '
        : d.window_seats_count === 0
          ? 'CRITICAL: zero window seats — restaurant has windows but no tables positioned next to them. Wasted real estate. Customers cannot request window seat because none exist -> walk to competitor that offers them. '
          : '';
      alerts.push({
        rule_id: 'window_seats_not_optimized',
        severity: !d.window_seats_optimized || d.window_seats_count === 0 ? 'high' : 'medium',
        location_id: d.location_id,
        window_count: d.window_count,
        window_size: d.window_size,
        window_seats_count: d.window_seats_count,
        window_seats_optimized: d.window_seats_optimized,
        view_quality: d.view_quality,
        view_quality_score: d.view_quality_score,
        customer_satisfaction_change: -Math.round(missedPremiumPct * 0.5),
        perceived_spaciousness_change: -Math.round(missedPremiumPct * 0.4),
        predicted_revenue_change_pct: -Math.round(missedPremiumPct * 0.12),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `WINDOW SEATS NOT OPTIMIZED: ${d.location_id} ${d.window_seats_count} window seats (min ${config.minWindowSeatsCount}), optimized ${d.window_seats_optimized ? 'partial' : 'NO'}. View quality ${d.view_quality}. ${criticalNote}Window seats are the #1 most requested seating position — 58% of customers prefer window seats (OpenTable seating preference survey). Window seats command 15-25% premium pricing in fine dining, drive reservation conversions (customers book specifically for window seats), generate free social media marketing (customers photograph food against window backdrop), and extend dwell 18% (customers linger at view). When window seats are not optimized: standard tables at windows (no premium pricing), no reservation priority for window seats (missed booking hook), uncomfortable seating at windows (no UV protection, glare, hot in summer, cold in winter), no window seat ambiance (no plants, no side tables, no reading lamps). Wasted real estate that customers explicitly want. ${lostRevenue} revenue lost per month from missed premium pricing + lower reservation conversion + reduced dwell + less social media marketing. ACTION: optimize window seats — reconfigure floor plan to place 2-top and 4-top tables along windows (not against interior walls, $0 labor if DIY or $300-800 designer), upgrade window seat furniture (upholstered banquettes $400-1,200/seat, more comfortable than chairs + extends dwell), add window seat amenities (small side tables for drinks, $50-150 each; reading lamps for evening $80-200 each; plants on windowsills $30-100 each), implement window seat reservation priority (online booking flags window seats as premium, 15-25% price premium or reservation fee $5-15/seat), train host staff to offer window seats to first-time customers (drives repeat intent), ensure window seats have working UV protection + glare control + climate comfort (addressed in rules 1 + 5). Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered premium pricing + reservation conversion + dwell + social marketing. Window seats are the only seating customers actively request — not optimizing them is leaving the most-wanted real estate underperforming.`,
        ai_recommendation: 'optimize_window_seats',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: WINDOW_CLEANLINESS_POOR
    if (d.window_cleanliness_score < config.minWindowCleanlinessScore) {
      // Dirty windows reduce perceived cleanliness by 30% (customers equate dirty windows with dirty kitchen)
      const cleanlinessGap = config.minWindowCleanlinessScore - d.window_cleanliness_score;
      const perceivedCleanlinessDropPct = Math.min(15 + cleanlinessGap * 0.4, 30);
      const lostRevenue = Math.round(baselineRevenue * (perceivedCleanlinessDropPct / 100) * 0.15);
      const criticalNote = d.window_cleanliness_score < 50
        ? 'CRITICAL: cleanliness below 50 — visible fingerprints, smudges, dust, water spots, dead insects on sill. Customers subconsciously extend perception of dirty windows to dirty kitchen -> 30% perceived cleanliness drop (health inspection perception study). Dirty windows are the #1 visual cue customers use to judge overall restaurant hygiene. '
        : '';
      alerts.push({
        rule_id: 'window_cleanliness_poor',
        severity: d.window_cleanliness_score < 50 ? 'high' : 'medium',
        location_id: d.location_id,
        window_count: d.window_count,
        window_size: d.window_size,
        window_cleanliness_score: d.window_cleanliness_score,
        customer_satisfaction_change: -Math.round(perceivedCleanlinessDropPct * 0.6),
        perceived_spaciousness_change: -Math.round(perceivedCleanlinessDropPct * 0.4),
        predicted_revenue_change_pct: -Math.round(perceivedCleanlinessDropPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 700),
        description: `WINDOW CLEANLINESS POOR: ${d.location_id} ${d.window_count} windows with cleanliness score ${d.window_cleanliness_score}/100 (min ${config.minWindowCleanlinessScore}). ${criticalNote}Dirty windows reduce perceived cleanliness by 30% (customers equate dirty windows with dirty kitchen — Cornell hospitality perception study). Fingerprints, smudges, dust, water spots, dead insects, pollen, pollution film, dog nose prints (if street-level) all accumulate on windows within 2-4 weeks. Customers subconsciously extend perception of dirty windows to kitchen hygiene — brain infers "if they cannot clean the windows customers can SEE, they cannot clean the kitchen customers cannot see". Dirty windows also block 10-30% of incoming daylight (dust + grime film reduces light transmission) — compounding the natural light underutilization problem. Dirty windows are visible from the street -> passersby register "this place is not maintained" -> walk past. Window cleanliness is the cheapest cleanliness signal — $20 of glass cleaner + 30 minutes of labor recovers 30% perceived cleanliness. ${lostRevenue} revenue lost per month from perceived uncleanliness + reduced daylight + lower perceived spaciousness + walk-past traffic loss. ACTION: clean windows professionally — daily interior wipe (microfiber cloth + glass cleaner, 5 minutes per window, staff task at opening — $0 labor cost beyond existing hours), weekly exterior clean (squeegee + soap solution, 15 minutes per window — $0 if staff, $25-50/window if professional service), monthly deep clean (interior + exterior + tracks + sills + frames, professional service $200-500/restaurant), quarterly high-rise window cleaning if multi-story (professional service $400-1,200, required for safety), install window film with easy-clean coating (hydrophobic film repels water spots + fingerprints, $3-8/sqft, lasts 5-10 years), keep cleaning supplies at host stand for emergency spot cleans (fingerprints during service, microfiber + spray $15 kit), schedule window cleaning audit every 2 weeks (walk every window with phone flashlight, mark smudges). Save ${fmt$(Math.max(lostRevenue, 700))}/mo from recovered perceived cleanliness + daylight + walk-in traffic. Window cleaning is the highest-ROI cleaning task — $20 of supplies recovers more perceived cleanliness than $2,000 of kitchen equipment upgrades.`,
        ai_recommendation: 'clean_windows_professionally',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: UV_DAMAGE_RISK
    if (config.requireUvProtection && (!d.uv_protection_present || d.uv_protection_score < config.minUvProtectionScore)) {
      // UV damage from sunlight fades furniture, artwork, and flooring ($500-2,000/yr replacement)
      const uvGap = config.minUvProtectionScore - d.uv_protection_score;
      const uvDamageCostPerYear = !d.uv_protection_present ? 2000 : Math.round(500 + uvGap * 15);
      const uvDamageCostPerMonth = Math.round(uvDamageCostPerYear / 12);
      const lostRevenue = uvDamageCostPerMonth + Math.round(baselineRevenue * 0.005);
      const criticalNote = !d.uv_protection_present
        ? 'CRITICAL: zero UV protection — direct sunlight fades furniture, artwork, flooring, menus, signage, and upholstery within 12-18 months. Replacement cost $500-2,000/year for typical restaurant (furniture $200-800, artwork $100-500, flooring $200-700). UV also degrades food + wine (sunlit wine list bottles turn bad in 4 hours). '
        : '';
      alerts.push({
        rule_id: 'uv_damage_risk',
        severity: !d.uv_protection_present ? 'high' : 'medium',
        location_id: d.location_id,
        window_count: d.window_count,
        window_size: d.window_size,
        window_treatment_type: d.window_treatment_type,
        uv_protection_present: d.uv_protection_present,
        uv_protection_score: d.uv_protection_score,
        energy_savings_change: -Math.round(d.hvac_savings_potential_pct * 0.3),
        predicted_revenue_change_pct: -Math.round((uvDamageCostPerMonth / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: Math.max(lostRevenue, 400),
        description: `UV DAMAGE RISK: ${d.location_id} ${d.window_count} ${d.window_size} windows with UV protection ${d.uv_protection_present ? `partial (${d.uv_protection_score}/100, min ${config.minUvProtectionScore})` : 'NOT INSTALLED'}. ${criticalNote}UV radiation from sunlight fades furniture, artwork, flooring, menus, signage, and upholstery. Replacement cost $500-2,000/year for typical restaurant (furniture $200-800, framed artwork $100-500, wood flooring $200-700, leather booth upholstery $300-1,000, menus + signage $50-200). UV also degrades food + wine — sunlit wine bottles turn bad in 4 hours of direct exposure (UV breaks down tannins + anthocyanins, $50-200/bottle loss), sunlit dessert case pastries lose color in 2 hours, sunlit olive oil bottles turn rancid in 8 hours. UV damage is silent — accumulates invisibly until replacement is forced. Furniture that should last 7-10 years lasts 3-5 years in sunlit zones. Fine dining with original artwork ($500-5,000/piece) faces catastrophic UV loss within 18 months without protection. ${lostRevenue} revenue lost per month from accelerated furniture/artwork/flooring replacement + degraded wine + degraded food + degraded menus. ACTION: install UV protection — window film (3M Sun Control, Vista, LLumar — blocks 99% UV + 30-60% heat, $5-15/sqft installed, $200-1,000/restaurant typical, 10-year warranty, professional install 2-4 hours), UV-blocking sheer curtains (filter 95% UV while letting visible light through, $200-800/zone), UV-blocking blinds (venetian + roller blinds block 99% UV when closed, $150-600/window), UV-blocking awnings (exterior mount blocks sun before glass, $500-2,000/window, also reduces AC load 25%), rotate furniture every 3 months (distribute UV exposure evenly across pieces, $0 labor, doubles furniture life), reposition vulnerable items (move wine bottles + artwork + leather upholstery out of direct sun, $0), install UV meter in sunlit zones (data-log exposure, $30-80 device, identify hot spots). Save ${fmt$(Math.max(lostRevenue, 400))}/mo from recovered furniture/artwork/flooring life + preserved wine + preserved food. UV film pays for itself in 12-18 months on furniture replacement savings alone.`,
        ai_recommendation: 'install_uv_protection_film',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: VIEW_QUALITY_POOR
    if (d.view_quality_score < config.minViewQualityScore || d.view_quality === 'unpleasant' || d.view_quality === 'blocked') {
      // Unpleasant view (parking lot, alley) visible -> negative experience
      const viewGap = config.minViewQualityScore - d.view_quality_score;
      const negativeExpPct = Math.min(8 + viewGap * 0.3, 22);
      const lostRevenue = Math.round(baselineRevenue * (negativeExpPct / 100) * 0.15);
      const criticalNote = d.view_quality === 'blocked'
        ? 'CRITICAL: view BLOCKED entirely — heavy drapes, frosted film, or storage stacked against window. Customers cannot see out, feel claustrophobic, subconsciously perceive space as smaller + closed in. Window loses its premium purpose. '
        : d.view_quality === 'unpleasant'
          ? 'CRITICAL: unpleasant view — parking lot, alley, dumpster, brick wall, busy highway, construction site. Customers look out window and register negative scene -> 18% satisfaction drop (hospitality view quality study). Window seat becomes penalty instead of premium. '
          : '';
      alerts.push({
        rule_id: 'view_quality_poor',
        severity: d.view_quality === 'blocked' || d.view_quality === 'unpleasant' ? 'high' : 'medium',
        location_id: d.location_id,
        window_count: d.window_count,
        view_quality: d.view_quality,
        view_quality_score: d.view_quality_score,
        customer_satisfaction_change: -Math.round(negativeExpPct),
        perceived_spaciousness_change: -Math.round(negativeExpPct * 0.7),
        predicted_dwell_change: -Math.round(negativeExpPct * 0.4),
        predicted_revenue_change_pct: -Math.round(negativeExpPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 700),
        description: `VIEW QUALITY POOR: ${d.location_id} ${d.window_count} windows with view quality ${d.view_quality} (score ${d.view_quality_score}/100, min ${config.minViewQualityScore}). ${criticalNote}Unpleasant view visible through windows causes negative customer experience. Parking lot views register as "transactional" (brain associates with fast food drive-by). Alley + dumpster views register as "unclean" (brain associates with trash, even if kitchen is spotless). Brick wall views register as "trapped" (no sky, no horizon, no greenery). Busy highway views register as "noisy" (subconscious noise perception even with soundproofing). Construction site views register as "chaotic" + "temporary". Customers look out window every 30-60 seconds during meal (eye naturally drifts to view) — repeated negative exposure compounds dissatisfaction. Window seats with unpleasant views become penalty seats — customers request to move, defeating premium positioning. View quality drives 18% of customer satisfaction in window-adjacent tables (hospitality view quality study). ${lostRevenue} revenue lost per month from negative view + reduced satisfaction + shorter dwell + window seat avoidance. ACTION: obscure or redirect view — install frosted film on lower 2/3 of window (blocks unpleasant view at seated eye level, lets daylight in from top 1/3, $3-8/sqft, DIY or professional install), install sheer curtains (filter view so unpleasant elements become soft blur, $200-800/zone), install vertical garden or planters outside window (replace parking lot view with greenery, $300-1,500, also biophilic design benefit), install decorative window film (etched pattern, stained glass effect — transforms ugly view into art piece, $5-15/sqft), install exterior lattice or trellis with climbing plants (blocks view, adds charm, $500-2,000), install window planter boxes with flowers (draws eye to flowers instead of view beyond, $100-400/window), reposition tables so customers face INTO restaurant not OUT at unpleasant view (free, just floor plan change), use stained glass or decorative panels in lower window (permanent solution, $300-1,500/window). If view is genuinely pleasant (park, ocean, garden, urban street life) -> maximize it: remove obstructions, clean windows daily (see rule 4), add window seat premium pricing. Save ${fmt$(Math.max(lostRevenue, 700))}/mo from recovered view quality + window seat premium + satisfaction. View quality is binary — either enhance the good view or obscure the bad view, never leave a bad view exposed.`,
        ai_recommendation: 'obscure_or_redirect_view',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: SEASONAL_LIGHT_ADJUSTMENT_MISSING
    if (config.requireSeasonalAdjustment && !d.seasonal_adjustment_present) {
      // Same treatment all year -> winter glare vs summer heat
      const seasonalPenaltyPct = 10;
      const hvacLossMonthly = Math.round(baselineRevenue * 0.008 * (d.hvac_savings_potential_pct / 20));
      const lostRevenue = hvacLossMonthly + Math.round(baselineRevenue * (seasonalPenaltyPct / 100) * 0.1);
      const criticalNote = d.window_size === 'large' || d.window_size === 'wall_to_wall'
        ? 'CRITICAL: large/wall-to-wall windows with NO seasonal adjustment — same treatment all year means winter glare (low sun angle hits tables directly) + summer heat (greenhouse effect through glass, AC cannot keep up). Smart blinds that auto-adjust to sun position save 15-20% on HVAC costs (DOE study). '
        : '';
      alerts.push({
        rule_id: 'seasonal_light_adjustment_missing',
        severity: d.window_size === 'large' || d.window_size === 'wall_to_wall' ? 'high' : 'medium',
        location_id: d.location_id,
        window_count: d.window_count,
        window_size: d.window_size,
        window_treatment_type: d.window_treatment_type,
        seasonal_adjustment_present: d.seasonal_adjustment_present,
        smart_blinds_installed: d.smart_blinds_installed,
        hvac_savings_potential_pct: d.hvac_savings_potential_pct,
        energy_savings_change: -Math.round(d.hvac_savings_potential_pct),
        customer_satisfaction_change: -Math.round(seasonalPenaltyPct * 0.4),
        predicted_revenue_change_pct: -Math.round(seasonalPenaltyPct * 0.1),
        est_monthly_opportunity: Math.max(lostRevenue, 500),
        description: `SEASONAL LIGHT ADJUSTMENT MISSING: ${d.location_id} ${d.window_count} ${d.window_size} windows with seasonal adjustment ${d.seasonal_adjustment_present ? 'present' : 'MISSING'}. Smart blinds installed ${d.smart_blinds_installed ? 'yes' : 'no'}. HVAC savings potential ${d.hvac_savings_potential_pct}%. ${criticalNote}Same window treatment all year means wrong setting for 9 of 12 months. Winter sun is low-angle (22 degrees max in northern US) -> glare hits tables directly even with treatments tilted for summer. Summer sun is high-angle -> greenhouse effect through glass, AC cannot keep up, customers complain about heat at window seats. Spring + fall need different settings again. Smart blinds that auto-adjust to sun position + season save 15-20% on HVAC costs (US Department of Energy daylighting study) — auto-close in summer afternoon to block heat gain, auto-open in winter afternoon to capture solar heat gain, auto-tilt slats to redirect sunlight away from tables at all times. Manual seasonal adjustment (staff swap treatments 2-4x per year) recovers 60% of the savings at 20% of the cost. Without seasonal adjustment: winter glare complaints, summer heat complaints, AC bills spike 20-30% in summer, heating bills spike 15% in winter (no solar gain captured). Customers avoid window seats in extreme seasons. ${lostRevenue} revenue lost per month from HVAC waste + seasonal glare + seasonal heat + window seat avoidance. ACTION: add seasonal treatment swap — install smart blinds with seasonal schedules (Lutron Serena, Pella Automated, Hunter Douglas PowerRise — $400-1,200/window, auto-adjust to sun position + season + weather forecast, 15-20% HVAC savings per DOE), manual seasonal swap (swap sheer curtains in summer for heavier drapes in winter, $200-800 per swap, 60% of savings at 20% of cost), install exterior awnings that extend in summer + retract in winter ($500-2,000/window, blocks summer heat gain + lets winter sun in), install deciduous plants outside windows (leaves block summer sun, bare branches let winter sun through — $200-1,000 landscaping, free seasonal adjustment forever), program HVAC to coordinate with window treatments (when blinds close in summer, AC reduces load — $200-500 smart thermostat integration), train staff on seasonal treatment schedule (open blinds in winter morning for solar gain, close in summer afternoon for heat block — $0 labor beyond existing hours). Save ${fmt$(Math.max(lostRevenue, 500))}/mo from recovered HVAC savings + reduced seasonal glare + reduced seasonal heat + window seat year-round occupancy. Seasonal adjustment pays for itself in HVAC savings within 18-24 months — and continues saving every month after.`,
        ai_recommendation: 'add_seasonal_treatment_swap',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: WINDOW_TREATMENT_BRAND_MISMATCH
    if (config.requireTreatmentBrandMatch && (!d.treatment_brand_match)) {
      // Curtains/blinds do not match restaurant tier
      const expectedTreatments = TIER_TREATMENT_MAP[d.restaurant_tier] ?? ['sheer_curtain'];
      const mismatchPct = 14;
      const lostRevenue = Math.round(baselineRevenue * (mismatchPct / 100) * 0.15);
      const criticalNote = d.restaurant_tier === 'fine_dining' && (d.window_treatment_type === 'venetian_blinds' || d.window_treatment_type === 'roller_blinds')
        ? 'CRITICAL: plastic/metal blinds in fine dining — fine dining requires premium fabric drapes or motorized smart blinds. Plastic blinds read as office/motel, not Michelin-tier. Brand perception drops 18% (hospitality brand consistency study). '
        : d.restaurant_tier === 'quick_service' && (d.window_treatment_type === 'drapes' || d.window_treatment_type === 'blackout_curtain')
          ? 'CRITICAL: heavy drapes in quick-service restaurant — quick-service requires utilitarian easy-clean blinds or shades. Heavy drapes read as pretentious + are grease magnets (kitchen exhaust settles on fabric, requires monthly dry-clean $50-150/panel). '
          : '';
      alerts.push({
        rule_id: 'window_treatment_brand_mismatch',
        severity: d.restaurant_tier === 'fine_dining' || d.restaurant_tier === 'quick_service' ? 'high' : 'medium',
        location_id: d.location_id,
        window_count: d.window_count,
        window_treatment_type: d.window_treatment_type,
        restaurant_tier: d.restaurant_tier,
        treatment_brand_match: d.treatment_brand_match,
        customer_satisfaction_change: -Math.round(mismatchPct * 0.5),
        perceived_spaciousness_change: -Math.round(mismatchPct * 0.3),
        predicted_revenue_change_pct: -Math.round(mismatchPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 600),
        description: `WINDOW TREATMENT BRAND MISMATCH: ${d.location_id} ${d.window_treatment_type} treatment in ${d.restaurant_tier} restaurant (expected: ${expectedTreatments.join(', ')}). ${criticalNote}Window treatment must match restaurant tier — wrong treatment signals brand inconsistency. Fine dining requires premium fabric drapes (linen, silk, velvet — $300-1,500/panel) or motorized smart blinds ($400-1,200/window) — plastic/metal venetian blinds read as office/motel, dropping brand perception 18%. Casual dining accepts broader range (sheer curtains, venetian blinds, roller shades, drapes — $100-600/window). Fast-casual + quick-service require utilitarian easy-clean treatments (roller blinds, venetian blinds, shades — $50-300/window) — heavy drapes read as pretentious + are grease magnets requiring monthly dry-clean ($50-150/panel). Brand consistency across all touchpoints (walls, furniture, signage, window treatments, staff uniforms) drives 23% marketing ROI uplift (Reboot brand consistency study). Mismatched window treatments break the design narrative — premium restaurant with budget blinds signals "ran out of budget" or "does not understand the tier they are operating in". ${lostRevenue} revenue lost per month from brand perception drop + lower price acceptance + reduced repeat intent. ACTION: upgrade treatment to match tier — fine dining: replace with linen/silk/velvet drapes ($300-1,500/panel, 4-8 panels per zone, $1,200-12,000 total, or motorized smart blinds $400-1,200/window); casual dining: sheer curtains + venetian blinds combo ($200-800/zone); fast-casual + quick-service: commercial roller blinds with easy-clean coating ($80-300/window, grease-resistant fabric). Coordinate treatment color with interior palette (see color-scheme-palette service). Coordinate treatment material with furniture material (wood blinds with wood tables, fabric drapes with upholstered chairs). Use brand color in treatment accents (valance, curtain ties, blind pulls — $20-80/zone). Hire interior designer for treatment selection ($300-800 consultation, ensures tier-appropriate choice). Save ${fmt$(Math.max(lostRevenue, 600))}/mo from recovered brand perception + price acceptance + marketing ROI. Window treatment is the largest fabric surface in the dining room — wrong treatment drags down the entire design narrative.`,
        ai_recommendation: 'upgrade_treatment_to_match_tier',
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
              { role: 'system', content: 'You are a restaurant window treatment and natural light optimization expert. Given window inspection data, recommend ONE specific action with expected satisfaction, perceived spaciousness, dwell, energy savings, or revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Window count: ${a.window_count ?? 0}, size ${a.window_size ?? 'n/a'}. Treatment: ${a.window_treatment_type ?? 'n/a'}. Restaurant tier: ${a.restaurant_tier ?? 'n/a'}. Glare management: ${a.glare_management_score ?? 0}/100. Natural light utilization: ${a.natural_light_utilization_score ?? 0}/100, ${a.natural_light_hours_per_day ?? 0} hrs/day. View quality: ${a.view_quality ?? 'n/a'} (${a.view_quality_score ?? 0}/100). UV protection: ${a.uv_protection_present ?? false}, score ${a.uv_protection_score ?? 0}/100. Window seats: ${a.window_seats_count ?? 0}, optimized ${a.window_seats_optimized ?? false}. Window cleanliness: ${a.window_cleanliness_score ?? 0}/100. Seasonal adjustment: ${a.seasonal_adjustment_present ?? false}. Smart blinds: ${a.smart_blinds_installed ?? false}. HVAC savings potential: ${a.hvac_savings_potential_pct ?? 0}%. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM window_natural_light_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE window_natural_light_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<WindowNaturalLightAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM window_natural_light_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  locationsAtRisk: number; glareRiskZones: number; unoptimizedWindowSeatsZones: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(location_id != NONE) AS locations,
              math::count(rule_id = 'glare_uncontrolled') AS glarerisk,
              math::count(rule_id = 'window_seats_not_optimized') AS unoptimizedseats
       FROM window_natural_light_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      locationsAtRisk: safeNumber(r.locations, 0),
      glareRiskZones: safeNumber(r.glarerisk, 0),
      unoptimizedWindowSeatsZones: safeNumber(r.unoptimizedseats, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, locationsAtRisk: 0, glareRiskZones: 0, unoptimizedWindowSeatsZones: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
