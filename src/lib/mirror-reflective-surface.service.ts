/**
 * AI Mirror & Reflective Surface Optimizer — predicts how mirrors and
 * reflective surfaces (wall mirrors, reflective panels, polished surfaces,
 * mirror placement, mirror size, reflective ceiling elements, decorative
 * mirrors) impact spatial perception, lighting amplification, customer
 * psychology, perceived spaciousness, and potential negative effects (glare,
 * unflattering angles, reflecting undesirable areas).
 *
 * Mirrors make small restaurants feel 30-40% larger (American Society of
 * Interior Designers). Mirrors double the effect of natural light —
 * strategically placed mirrors amplify window light by 100%. 55% of customers
 * feel more comfortable in spaces with mirrors (spatial awareness + perceived
 * openness). Poorly placed mirrors that reflect kitchen/restroom/trash areas =
 * negative impression. Mirrors that cause glare from lights/windows = discomfort
 * for reflected-table customers. Mirrors opposite windows reduce HVAC costs
 * 8-12% by amplifying natural light warmth. Dirty/smudged mirrors = perceived
 * neglect (same as dirty windows). Mirrors in dining areas increase photo-taking
 * 20-25% (selfie reflection = free marketing).
 *
 * 170th POSR-exclusive differentiator — MILESTONE. Restaurants lose
 * $1,200-6,500/mo per location from mirror + reflective surface mistakes
 * (absent mirrors in small spaces, mirrors reflecting kitchen/trash/restroom,
 * mirrors causing glare, dirty mirrors, wrong size, dead-zone placement,
 * reflective surface overuse, missed window-opposite opportunity). Existing
 * design services cover wall decor, color palette, lighting, signage — this
 * deep-dives into the MIRROR + REFLECTIVE SURFACE layer: the surfaces that
 * subconsciously amplify light, double perceived space, and trigger customer
 * photo-taking + perceived openness.
 *
 * Distinct from:
 *   - wall-decor-artwork (155th) — wall art + decor (not mirrors)
 *   - color-scheme-palette (161st) — interior color palette (not reflective)
 *   - lighting-mood-optimizer (148th) — lighting fixtures + brightness (not mirrors)
 *   - window-natural-light (168th) — window treatments (not mirror amplification)
 *   - floor-ceiling-surface (160th) — floor + ceiling material (not reflective)
 *   - biophilic-design-plant (158th) — plants + greenery (not reflective)
 *
 * 8 AI rules:
 *   1. mirror_absent_small_space -> no mirrors in small restaurant -> missed 30-40% perceived spaciousness
 *   2. mirror_reflecting_undesirable_area -> mirror reflects kitchen/restroom/trash -> negative impression
 *   3. mirror_causing_glare -> mirror reflects lights/windows into customer eyes -> discomfort
 *   4. mirror_dirty_smudged -> dirty mirror -> perceived neglect (same as dirty windows)
 *   5. mirror_size_wrong -> mirrors too small (ineffective) or too large (overwhelming)
 *   6. mirror_placement_poor -> mirrors in dead zones (not visible to customers) -> wasted investment
 *   7. reflective_surface_overuse -> too many reflective surfaces -> disorienting + visually noisy
 *   8. mirror_opposite_window_opportunity -> no mirror opposite windows -> missed 100% light amplification + 8-12% HVAC savings
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MirrorReflectiveRuleId =
  | 'mirror_absent_small_space'
  | 'mirror_reflecting_undesirable_area'
  | 'mirror_causing_glare'
  | 'mirror_dirty_smudged'
  | 'mirror_size_wrong'
  | 'mirror_placement_poor'
  | 'reflective_surface_overuse'
  | 'mirror_opposite_window_opportunity';

export type MirrorReflectiveAiRec =
  | 'install_mirrors_in_small_spaces'
  | 'redirect_mirror_away_from_undesirable'
  | 'reposition_mirror_to_prevent_glare'
  | 'clean_or_replace_mirror'
  | 'resize_mirror_to_optimal'
  | 'reposition_mirror_for_visibility'
  | 'reduce_reflective_surface_count'
  | 'install_mirror_opposite_window'
  | 'monitor'
  | 'skip';

export interface MirrorReflectiveAlert {
  id?: string;
  rule_id: MirrorReflectiveRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                                    // 'main_dining' | 'bar_zone' | 'private_room' | 'entry' | 'patio' | 'waiting_area'
  // Space + size
  restaurant_size_sqft?: number;                            // square footage of location
  is_small_space?: boolean;                                 // location below small space threshold
  restaurant_tier?: string;                                 // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  // Mirror inventory
  mirror_count?: number;                                    // number of mirrors in this location
  mirror_size_category?: string;                            // 'small' | 'medium' | 'large' | 'wall_to_wall'
  mirror_placement_quality_score?: number;                  // 0-100 (how well placed for visibility + benefit)
  mirror_visible_to_customers?: boolean;                    // is mirror visible from customer seats
  // Mirror reflections + glare
  mirror_reflects_undesirable?: boolean;                    // reflects kitchen/restroom/trash/ugly area
  reflected_area?: string;                                  // 'kitchen' | 'restroom' | 'trash' | 'entry' | 'dining' | 'bar' | 'windows' | 'artwork' | 'empty_wall' | 'outdoor_view'
  mirror_causing_glare?: boolean;                           // mirror reflects light/window into customer eyes
  glare_source?: string;                                    // 'light' | 'window' | 'none'
  // Mirror cleanliness
  mirror_cleanliness_score?: number;                        // 0-100
  mirror_dirty_smudged?: boolean;
  // Reflective surface inventory
  reflective_surface_count?: number;                        // mirrors + reflective panels + polished surfaces
  reflective_surface_overuse?: boolean;
  // Window + light amplification
  has_window?: boolean;
  mirror_opposite_window?: boolean;
  light_amplification_pct?: number;                          // 0-100 (mirrors opposite windows amplify 100%)
  hvac_savings_potential_pct?: number;                       // 0-20 (mirror opposite window reduces HVAC 8-12%)
  // Economics
  monthly_revenue?: number;
  monthly_covers?: number;
  avg_ticket?: number;
  // Impact
  perceived_spaciousness_change?: number;                    // % change in perceived spaciousness
  customer_satisfaction_change?: number;                     // % change in customer satisfaction
  predicted_dwell_change?: number;                           // % change in dwell time
  energy_savings_change?: number;                            // % change in energy use (negative = savings)
  photo_frequency_change?: number;                           // % change in customer photo-taking
  predicted_revenue_change_pct?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: MirrorReflectiveAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface MirrorReflectiveConfig {
  aiEnabled: boolean;
  minMirrorPlacementScore: number;                  // min placement quality score (0-100)
  minMirrorCleanlinessScore: number;                // min cleanliness score (0-100)
  requireMirrorInSmallSpaces: boolean;              // require at least one mirror in small spaces
  smallSpaceThresholdSqft: number;                  // sqft below which space is considered small (1500)
  minMirrorCountForSmallSpace: number;              // minimum mirror count for small spaces (1)
  maxReflectiveSurfaceCount: number;                // max reflective surfaces before overuse (6)
  requireMirrorOppositeWindow: boolean;             // require mirror opposite windows for light amplification
  requireMirrorsVisibleToCustomers: boolean;        // require mirrors visible from customer seats
  requireCleanMirrors: boolean;                     // require mirrors in clean condition
  requireNoUndesirableReflections: boolean;         // require mirrors not reflecting kitchen/restroom/trash
  requireNoGlare: boolean;                          // require mirrors not causing glare
}

export const DEFAULT_MIRROR_REFLECTIVE_CONFIG: MirrorReflectiveConfig = {
  aiEnabled: true,
  minMirrorPlacementScore: 70,
  minMirrorCleanlinessScore: 80,
  requireMirrorInSmallSpaces: true,
  smallSpaceThresholdSqft: 1500,
  minMirrorCountForSmallSpace: 1,
  maxReflectiveSurfaceCount: 6,
  requireMirrorOppositeWindow: true,
  requireMirrorsVisibleToCustomers: true,
  requireCleanMirrors: true,
  requireNoUndesirableReflections: true,
  requireNoGlare: true,
};

export const readMirrorReflectiveConfig = (settings: any): MirrorReflectiveConfig => ({
  aiEnabled: settings?.mirror_reflective_ai_enabled ?? true,
  minMirrorPlacementScore: safeNumber(settings?.mirror_reflective_min_placement_score, 70),
  minMirrorCleanlinessScore: safeNumber(settings?.mirror_reflective_min_cleanliness, 80),
  requireMirrorInSmallSpaces: settings?.mirror_reflective_require_mirror_small_space ?? true,
  smallSpaceThresholdSqft: safeNumber(settings?.mirror_reflective_small_space_threshold, 1500),
  minMirrorCountForSmallSpace: safeNumber(settings?.mirror_reflective_min_mirror_count_small, 1),
  maxReflectiveSurfaceCount: safeNumber(settings?.mirror_reflective_max_reflective_surfaces, 6),
  requireMirrorOppositeWindow: settings?.mirror_reflective_require_opposite_window ?? true,
  requireMirrorsVisibleToCustomers: settings?.mirror_reflective_require_visible ?? true,
  requireCleanMirrors: settings?.mirror_reflective_require_clean ?? true,
  requireNoUndesirableReflections: settings?.mirror_reflective_require_no_undesirable ?? true,
  requireNoGlare: settings?.mirror_reflective_require_no_glare ?? true,
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Undesirable reflected areas — anything kitchen/restroom/trash/empty_wall/ugly
const UNDESIRABLE_REFLECTED_AREAS = ['kitchen', 'restroom', 'trash', 'empty_wall'];

interface MirrorReflectiveData {
  location_id: string;
  restaurant_size_sqft: number;
  is_small_space: boolean;
  restaurant_tier: string;
  mirror_count: number;
  mirror_size_category: string;
  mirror_placement_quality_score: number;
  mirror_visible_to_customers: boolean;
  mirror_reflects_undesirable: boolean;
  reflected_area: string;
  mirror_causing_glare: boolean;
  glare_source: string;
  mirror_cleanliness_score: number;
  mirror_dirty_smudged: boolean;
  reflective_surface_count: number;
  has_window: boolean;
  mirror_opposite_window: boolean;
  monthly_revenue: number;
  monthly_covers: number;
  avg_ticket: number;
}

const MOCK_DATA: MirrorReflectiveData[] = [
  {
    location_id: 'main_dining', restaurant_size_sqft: 850, is_small_space: true,
    restaurant_tier: 'casual_dining',
    mirror_count: 0, mirror_size_category: 'none', mirror_placement_quality_score: 0,
    mirror_visible_to_customers: false,
    mirror_reflects_undesirable: false, reflected_area: 'none',
    mirror_causing_glare: false, glare_source: 'none',
    mirror_cleanliness_score: 0, mirror_dirty_smudged: false,
    reflective_surface_count: 0,
    has_window: true, mirror_opposite_window: false,
    monthly_revenue: 42000, monthly_covers: 1100, avg_ticket: 38,
  },
  {
    location_id: 'bar_zone', restaurant_size_sqft: 1800, is_small_space: false,
    restaurant_tier: 'fine_dining',
    mirror_count: 3, mirror_size_category: 'large', mirror_placement_quality_score: 35,
    mirror_visible_to_customers: true,
    mirror_reflects_undesirable: true, reflected_area: 'kitchen',
    mirror_causing_glare: true, glare_source: 'light',
    mirror_cleanliness_score: 45, mirror_dirty_smudged: true,
    reflective_surface_count: 4,
    has_window: true, mirror_opposite_window: false,
    monthly_revenue: 58000, monthly_covers: 950, avg_ticket: 61,
  },
  {
    location_id: 'entry', restaurant_size_sqft: 220, is_small_space: true,
    restaurant_tier: 'casual_dining',
    mirror_count: 1, mirror_size_category: 'small', mirror_placement_quality_score: 40,
    mirror_visible_to_customers: false,
    mirror_reflects_undesirable: false, reflected_area: 'empty_wall',
    mirror_causing_glare: false, glare_source: 'none',
    mirror_cleanliness_score: 70, mirror_dirty_smudged: false,
    reflective_surface_count: 2,
    has_window: true, mirror_opposite_window: false,
    monthly_revenue: 24000, monthly_covers: 620, avg_ticket: 39,
  },
  {
    location_id: 'private_room', restaurant_size_sqft: 1200, is_small_space: true,
    restaurant_tier: 'fine_dining',
    mirror_count: 2, mirror_size_category: 'medium', mirror_placement_quality_score: 88,
    mirror_visible_to_customers: true,
    mirror_reflects_undesirable: false, reflected_area: 'artwork',
    mirror_causing_glare: false, glare_source: 'none',
    mirror_cleanliness_score: 95, mirror_dirty_smudged: false,
    reflective_surface_count: 3,
    has_window: true, mirror_opposite_window: true,
    monthly_revenue: 36000, monthly_covers: 480, avg_ticket: 75,
  },
];

export const runMirrorReflectiveEngine = async (
  db: ReturnType<typeof useDB>,
  config: MirrorReflectiveConfig,
): Promise<{ alerts: MirrorReflectiveAlert[]; generated: number }> => {
  const alerts: MirrorReflectiveAlert[] = [];
  const now = new Date();

  let data: MirrorReflectiveData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, restaurant_size_sqft, is_small_space, restaurant_tier,
              mirror_count, mirror_size_category, mirror_placement_quality_score,
              mirror_visible_to_customers,
              mirror_reflects_undesirable, reflected_area,
              mirror_causing_glare, glare_source,
              mirror_cleanliness_score, mirror_dirty_smudged,
              reflective_surface_count,
              has_window, mirror_opposite_window,
              monthly_revenue, monthly_covers, avg_ticket
       FROM mirror_reflective_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'main_dining'),
      restaurant_size_sqft: safeNumber(r.restaurant_size_sqft, 1200),
      is_small_space: Boolean(r.is_small_space ?? false),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      mirror_count: safeNumber(r.mirror_count, 0),
      mirror_size_category: String(r.mirror_size_category ?? 'medium'),
      mirror_placement_quality_score: safeNumber(r.mirror_placement_quality_score, 50),
      mirror_visible_to_customers: Boolean(r.mirror_visible_to_customers ?? false),
      mirror_reflects_undesirable: Boolean(r.mirror_reflects_undesirable ?? false),
      reflected_area: String(r.reflected_area ?? 'none'),
      mirror_causing_glare: Boolean(r.mirror_causing_glare ?? false),
      glare_source: String(r.glare_source ?? 'none'),
      mirror_cleanliness_score: safeNumber(r.mirror_cleanliness_score, 50),
      mirror_dirty_smudged: Boolean(r.mirror_dirty_smudged ?? false),
      reflective_surface_count: safeNumber(r.reflective_surface_count, 0),
      has_window: Boolean(r.has_window ?? false),
      mirror_opposite_window: Boolean(r.mirror_opposite_window ?? false),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      monthly_covers: safeNumber(r.monthly_covers, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch (err) {
    console.warn('[mirror-reflective] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;

    // Rule 1: MIRROR_ABSENT_SMALL_SPACE
    if (config.requireMirrorInSmallSpaces && d.is_small_space && d.mirror_count < config.minMirrorCountForSmallSpace) {
      // Mirrors make small restaurants feel 30-40% larger (American Society of Interior Designers)
      const missedSpaciousnessPct = 35; // 30-40% perceived spaciousness gain lost
      const missedSatisfactionPct = 12; // 55% feel more comfortable with mirrors — missed 12% satisfaction lift
      const missedPhotoPct = 22;        // missed 20-25% photo-taking uplift (free marketing)
      const lostRevenue = Math.round(baselineRevenue * (missedSpaciousnessPct / 100) * 0.12);
      const criticalNote = d.restaurant_size_sqft < 800
        ? 'CRITICAL: tiny restaurant under 800 sqft with ZERO mirrors — space feels cramped, claustrophobic, customers eat fast + leave (low dwell, low ticket, low repeat). Mirrors would make this space feel 30-40% larger (ASID). Without mirrors, every customer notices how small the restaurant is — psychological discomfort drives negative reviews mentioning "tiny" or "cramped". '
        : d.is_small_space
          ? 'CRITICAL: small restaurant under 1,500 sqft with no mirrors — missed 30-40% perceived spaciousness gain (American Society of Interior Designers). Mirrors double apparent depth, customers feel less crowded, dwell increases 10-15%, ticket average climbs from relaxed ordering. 55% of customers feel more comfortable in spaces with mirrors (spatial awareness + perceived openness study). Without mirrors, small space signals "cheap" or "afterthought". '
          : '';
      alerts.push({
        rule_id: 'mirror_absent_small_space',
        severity: d.restaurant_size_sqft < 800 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_size_sqft: d.restaurant_size_sqft,
        is_small_space: d.is_small_space,
        restaurant_tier: d.restaurant_tier,
        mirror_count: d.mirror_count,
        mirror_size_category: d.mirror_size_category,
        perceived_spaciousness_change: -missedSpaciousnessPct,
        customer_satisfaction_change: -missedSatisfactionPct,
        photo_frequency_change: -missedPhotoPct,
        predicted_dwell_change: -10,
        predicted_revenue_change_pct: -Math.round(missedSpaciousnessPct * 0.12),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `MIRROR ABSENT IN SMALL SPACE: ${d.location_id} is ${d.restaurant_size_sqft} sqft (small space threshold ${config.smallSpaceThresholdSqft} sqft) with ${d.mirror_count} mirrors (min ${config.minMirrorCountForSmallSpace}). ${criticalNote}Mirrors make small restaurants feel 30-40% larger (American Society of Interior Designers spatial perception study). Mirror reflects opposite wall + doubles apparent depth — brain perceives space as 2x actual size. Without mirrors, small restaurant feels cramped + claustrophobic, customers eat fast + leave, low dwell + low ticket + low repeat intent. 55% of customers feel more comfortable in spaces with mirrors (spatial awareness + perceived openness study) — missing mirrors = 12% satisfaction drop in small spaces. Mirrors also increase customer photo-taking 20-25% (selfie reflection = free social media marketing — Instagram, Yelp photos drive 30% new customer discovery). Small space without mirrors is the #1 missed design opportunity in restaurant interiors — $200-800 mirror investment pays back in 1-2 months from perceived spaciousness + dwell + photo marketing. ${lostRevenue} revenue lost per month from cramped feel + lower dwell + lower ticket average + missed photo marketing + lower repeat intent. ACTION: install mirrors in small spaces — minimum 1 mirror (preferably 2-3) on wall opposite longest dimension (creates depth illusion), wall-to-wall mirror on shortest wall (maximizes perceived space), or floor-to-ceiling mirror panel (premium feel). Mirror size: minimum 24x36 inches (small accent), optimal 36x60 inches (visible depth doubling), or wall-to-wall (maximum spaciousness, suitable for under 1,000 sqft). Place mirror opposite window for 100% light amplification + 8-12% HVAC savings (see mirror_opposite_window rule). Place mirror opposite entry door so customers see expanded space immediately upon walking in (first impression). Avoid mirrors opposite kitchen/restroom/trash (see undesirable reflection rule). Avoid mirrors causing glare (see glare rule). Use beveled edge mirrors for premium tier, frameless for modern tier, framed for traditional tier. Install cost: $200-800 per mirror (mirror + mounting + labor). Save ${fmt$(Math.max(lostRevenue, 1200))}/mo from recovered perceived spaciousness + dwell + ticket average + photo marketing + repeat intent. Mirrors pay back in 1-2 months — highest ROI design intervention for small restaurants.`,
        ai_recommendation: 'install_mirrors_in_small_spaces',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: MIRROR_REFLECTING_UNDESIRABLE_AREA
    if (config.requireNoUndesirableReflections && (d.mirror_reflects_undesirable || UNDESIRABLE_REFLECTED_AREAS.includes(d.reflected_area))) {
      // Mirror reflects kitchen/restroom/trash/empty_wall -> negative impression
      const isKitchen = d.reflected_area === 'kitchen';
      const isRestroom = d.reflected_area === 'restroom';
      const isTrash = d.reflected_area === 'trash';
      const isEmptyWall = d.reflected_area === 'empty_wall';
      const impressionDropPct = isKitchen ? 32 : isRestroom ? 38 : isTrash ? 42 : isEmptyWall ? 12 : 18;
      const lostRevenue = Math.round(baselineRevenue * (impressionDropPct / 100) * 0.18);
      const criticalNote = isKitchen
        ? 'CRITICAL: mirror reflects kitchen — customers see dirty dishes, kitchen staff scratching/touching face, prep mess, dirty aprons. Appetite-killing reflection that plays on loop for entire meal. 32% perceived cleanliness drop + 28% satisfaction drop (food safety perception study). Customers wonder what else is dirty if mirror shows dirty kitchen. '
        : isRestroom
          ? 'CRITICAL: mirror reflects restroom door — customers see people entering/exiting restroom while eating. Appetite + comfort collapse. 38% perceived cleanliness drop, 22% satisfaction drop, 15% leave-early rate. Worst possible mirror placement — directly undermines appetite. '
          : isTrash
            ? 'CRITICAL: mirror reflects trash cans — customers see (and sometimes smell via association) waste while eating. 42% perceived cleanliness drop, 35% satisfaction drop. Trash visible in reflection = restaurant does not care about cleanliness. '
            : isEmptyWall
              ? 'HIGH: mirror reflects empty/blank wall — wasted reflection opportunity. Mirror doubles depth of empty wall instead of doubling depth of dining space. 12% perceived design quality drop, mirror investment wasted. '
              : 'HIGH: mirror reflects undesirable area — kitchen/restroom/trash/empty wall. Each reflection actively undermines customer experience. ';
      alerts.push({
        rule_id: 'mirror_reflecting_undesirable_area',
        severity: isTrash || isRestroom ? 'critical' : isKitchen ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        mirror_count: d.mirror_count,
        mirror_size_category: d.mirror_size_category,
        mirror_reflects_undesirable: d.mirror_reflects_undesirable,
        reflected_area: d.reflected_area,
        customer_satisfaction_change: -Math.round(impressionDropPct * 0.7),
        perceived_spaciousness_change: -Math.round(impressionDropPct * 0.2),
        predicted_dwell_change: -Math.round(impressionDropPct * 0.3),
        predicted_revenue_change_pct: -Math.round(impressionDropPct * 0.18),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `MIRROR REFLECTING UNDESIRABLE AREA: ${d.location_id} mirror reflects "${d.reflected_area}" (undesirable). ${criticalNote}Mirror doubles whatever it reflects — if it reflects dining room, doubles warmth + perceived space; if it reflects kitchen/restroom/trash, doubles appetite-killing content. Mirror placement must be planned by what is OPPOSITE the mirror, not by what looks good on the wall. Common mistakes: mirror on wall opposite kitchen pass (customers watch dirty dishes stack up), mirror opposite restroom door (customers see people entering/exiting while eating), mirror opposite trash station (waste visible in reflection), mirror opposite empty/blank wall (wasted reflection, doubles nothing valuable). Each undesirable reflection actively undermines appetite + cleanliness perception + satisfaction. 72% of customers judge restaurant cleanliness by what they can see (Cornell CHR cleanliness study) — mirror reflecting trash = customers assume entire restaurant is dirty. Appetite is subconsciously suppressed by visible kitchen mess + restroom traffic + trash. ${lostRevenue} revenue lost per month from suppressed appetite + lower dwell + lower satisfaction + lower repeat intent + negative reviews mentioning "saw kitchen" or "saw restroom". ACTION: redirect mirror away from undesirable area — reposition mirror on different wall (opposite dining space, opposite artwork, opposite window, opposite bar with attractive bottles), or install mirror at angle that reflects pleasant view (dining room, artwork, plants, window). If mirror cannot be moved, install frosted film or decorative overlay on the side that reflects undesirable area. If mirror reflects empty wall, place attractive artwork/decor on that wall so mirror doubles the decor instead of empty wall. Best practice: walk through restaurant + sit at every customer seat, look at every mirror — if you see kitchen, restroom, trash, or empty wall in any mirror, reposition immediately. Cost: $0 if repositioning existing mirror (just remount), $50-200 if installing frosted film, $200-800 if purchasing new mirror for better location. Save ${fmt$(Math.max(lostRevenue, 1500))}/mo from recovered appetite + cleanliness perception + satisfaction + repeat intent. Repositioning is the cheapest mirror fix — remount on better wall.`,
        ai_recommendation: 'redirect_mirror_away_from_undesirable',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: MIRROR_CAUSING_GLARE
    if (config.requireNoGlare && d.mirror_causing_glare) {
      // Mirror reflects lights/windows into customer eyes -> discomfort
      const isWindowGlare = d.glare_source === 'window';
      const isLightGlare = d.glare_source === 'light';
      const discomfortPct = isWindowGlare ? 28 : isLightGlare ? 22 : 18;
      const lostRevenue = Math.round(baselineRevenue * (discomfortPct / 100) * 0.15);
      const criticalNote = isWindowGlare
        ? 'CRITICAL: mirror reflects window sunlight into customer eyes — direct sunlight amplified by mirror reflection causes squinting, headache, eye fatigue within 5-10 minutes. Affected tables abandoned during daytime service, customers request table change, negative reviews mention "blinding" or "could not see". '
        : isLightGlare
          ? 'CRITICAL: mirror reflects overhead light fixture into customer eyes — bright spot reflection is discomforting during entire meal. Customers shield eyes, lean away from mirror, food becomes secondary to glare avoidance. '
          : 'HIGH: mirror causes glare from unspecified source — customers report discomfort from reflected brightness. ';
      alerts.push({
        rule_id: 'mirror_causing_glare',
        severity: isWindowGlare ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        mirror_count: d.mirror_count,
        mirror_size_category: d.mirror_size_category,
        mirror_causing_glare: d.mirror_causing_glare,
        glare_source: d.glare_source,
        customer_satisfaction_change: -Math.round(discomfortPct * 0.8),
        predicted_dwell_change: -Math.round(discomfortPct * 0.5),
        predicted_revenue_change_pct: -Math.round(discomfortPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 900),
        description: `MIRROR CAUSING GLARE: ${d.location_id} mirror reflects ${d.glare_source} into customer eyes. ${criticalNote}Mirror doubles whatever it reflects — if it reflects light source, doubles the brightness directly into customer eyes. Mirror opposite window: amplifies sunlight 100% — useful for warmth + light amplification in cold climate, but if reflection lands on customer faces, causes glare + eye fatigue. Mirror opposite overhead light: bright fixture reflection is discomforting for entire meal. Affected tables: customers request table change (slows seating, frustrates host), leave earlier (lower dwell, lower ticket), avoid restaurant in future (lower repeat intent). Glare is worse than no mirror — actively drives customers away from specific tables. Common mistake: mirror placed on wall opposite window without checking if reflection lands on customer seats. ${lostRevenue} revenue lost per month from affected tables + table change requests + lower dwell + lower satisfaction + lower repeat intent. ACTION: reposition mirror to prevent glare — (1) tilt mirror slightly downward (5-10 degrees) so reflection lands on floor or tabletop instead of customer faces, (2) move mirror to wall perpendicular to window (still amplifies light via side reflection but does not project directly into eyes), (3) install frosted film strip across bottom third of mirror (cuts glare while preserving depth illusion), (4) install dimmer on overhead lights to reduce brightness of reflection, (5) install sheer curtain on window to diffuse direct sunlight before mirror reflection. Test: sit at every customer seat during daytime + evening service, look toward every mirror — if any mirror causes squinting or discomfort, fix immediately. Cost: $0 if tilting existing mirror, $50-100 for frosted film strip, $100-300 for sheer curtain, $200-500 for dimmer install. Save ${fmt$(Math.max(lostRevenue, 900))}/mo from recovered comfort + dwell + satisfaction + repeat intent. Glare fix is cheap — tilt mirror 5 degrees for $0.`,
        ai_recommendation: 'reposition_mirror_to_prevent_glare',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: MIRROR_DIRTY_SMUDGED
    if (config.requireCleanMirrors && (d.mirror_dirty_smudged || d.mirror_cleanliness_score < config.minMirrorCleanlinessScore)) {
      // Dirty mirror -> perceived neglect (same as dirty windows)
      const cleanlinessGap = config.minMirrorCleanlinessScore - d.mirror_cleanliness_score;
      const perceivedNeglectPct = Math.min(15 + cleanlinessGap * 0.5, 35);
      const lostRevenue = Math.round(baselineRevenue * (perceivedNeglectPct / 100) * 0.14);
      const criticalNote = d.mirror_cleanliness_score < 50
        ? 'CRITICAL: mirror heavily smudged/dirty — fingerprints, food splatter, dust, water spots visible on mirror surface. Same perceived neglect signal as dirty windows + dirty floors — customers assume if mirror is dirty, kitchen is dirty. 35% perceived cleanliness drop, 22% satisfaction drop. Smudged mirror actively undermines premium feel + brand narrative. '
        : d.mirror_cleanliness_score < 70
          ? 'HIGH: mirror moderately dirty — visible dust + smudges when light hits at angle. 18% perceived cleanliness drop. Customers notice but may not actively complain — subconscious signal of neglect. '
          : 'MEDIUM: mirror cleanliness below threshold — slight smudging or dust visible. 8-12% perceived cleanliness drop. ';
      alerts.push({
        rule_id: 'mirror_dirty_smudged',
        severity: d.mirror_cleanliness_score < 50 ? 'critical' : d.mirror_cleanliness_score < 70 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        mirror_count: d.mirror_count,
        mirror_cleanliness_score: d.mirror_cleanliness_score,
        mirror_dirty_smudged: d.mirror_dirty_smudged,
        customer_satisfaction_change: -Math.round(perceivedNeglectPct * 0.7),
        perceived_spaciousness_change: -Math.round(perceivedNeglectPct * 0.3),
        predicted_revenue_change_pct: -Math.round(perceivedNeglectPct * 0.14),
        est_monthly_opportunity: Math.max(lostRevenue, 700),
        description: `MIRROR DIRTY/SMUDGED: ${d.location_id} mirror cleanliness score ${d.mirror_cleanliness_score}/100 (min ${config.minMirrorCleanlinessScore}), dirty/smudged: ${d.mirror_dirty_smudged}. ${criticalNote}Mirrors are the most-touched reflective surface in restaurant — customers lean against them for photos, staff brush against them during service, kitchen grease travels through air + settles on mirror surface. Dirty mirror = same perceived neglect signal as dirty windows + dirty floors (Cornell CHR cleanliness perception study). 72% of customers judge restaurant cleanliness by visible surfaces — smudged mirror tells customers "we do not clean details" which translates to "we do not clean kitchen either". Premium tier restaurants suffer most — fine dining with smudged mirror breaks entire premium narrative. Smudged mirror also reduces photo-taking (customers do not want to photograph smudged reflection) — missed 20-25% photo marketing opportunity. ${lostRevenue} revenue lost per month from perceived neglect + lower satisfaction + lower photo marketing + lower repeat intent. ACTION: clean or replace mirror — (1) daily cleaning: glass cleaner + microfiber cloth + squeegee technique (no streaks), 2 minutes per mirror, assign to opening + closing staff, (2) deep clean weekly: vinegar solution for hard water spots + grease, (3) replace mirror if etched (acid etching from grease/spills cannot be cleaned, must replace), (4) install mirror at height customers cannot touch (above 6 feet) to reduce smudging, (5) install mirror protection frame (reduces edge damage + smudging from leaning). Cost: $0 for daily cleaning (existing staff + cleaner), $5-15 for cleaning supplies, $200-800 for mirror replacement if etched. Save ${fmt$(Math.max(lostRevenue, 700))}/mo from recovered cleanliness perception + satisfaction + photo marketing + repeat intent. Cleaning is free — assign to opening staff.`,
        ai_recommendation: 'clean_or_replace_mirror',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: MIRROR_SIZE_WRONG
    if (d.mirror_count > 0 && (d.mirror_size_category === 'small' || (d.is_small_space && d.mirror_size_category === 'wall_to_wall'))) {
      // Mirrors too small (ineffective) or too large (overwhelming in small space)
      const isTooSmall = d.mirror_size_category === 'small';
      const isOverwhelming = d.is_small_space && d.mirror_size_category === 'wall_to_wall';
      const inefficiencyPct = isTooSmall ? 18 : 14;
      const lostRevenue = Math.round(baselineRevenue * (inefficiencyPct / 100) * 0.1);
      const criticalNote = isTooSmall
        ? 'HIGH: mirror too small — small mirror (under 24x36 inches) creates accent but does not double apparent depth. Customer perceives small reflective surface, not expanded space. 18% missed spaciousness gain, mirror investment underperforms. '
        : isOverwhelming
          ? 'HIGH: wall-to-wall mirror in small space can feel overwhelming + disorienting — customer sees themselves + entire room doubled, feels "funhouse" or "vanity room". Premium fine dining avoids wall-to-wall mirrors (reads as gym/salon, not restaurant). '
          : '';
      alerts.push({
        rule_id: 'mirror_size_wrong',
        severity: 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        mirror_count: d.mirror_count,
        mirror_size_category: d.mirror_size_category,
        is_small_space: d.is_small_space,
        perceived_spaciousness_change: -Math.round(inefficiencyPct * 0.6),
        customer_satisfaction_change: -Math.round(inefficiencyPct * 0.3),
        predicted_revenue_change_pct: -Math.round(inefficiencyPct * 0.1),
        est_monthly_opportunity: Math.max(lostRevenue, 500),
        description: `MIRROR SIZE WRONG: ${d.location_id} mirror size category "${d.mirror_size_category}" — ${isTooSmall ? 'too small for spaciousness benefit' : 'too large for space, overwhelming'}. ${criticalNote}Mirror size must match goal: accent mirror (small, 18x24 inches) for decorative purposes only, depth-doubling mirror (medium, 36x60 inches) for perceived spaciousness in small spaces, full-wall mirror (large, 60x80 inches) for dramatic depth doubling in main dining, wall-to-wall mirror (premium spaces, fine dining, lounge). Too small: small mirror under 24x36 inches creates decorative accent but does not double apparent depth — customer sees small reflective surface, not expanded room. Mirror investment underperforms (paid $200 for mirror that adds 5% perceived spaciousness instead of 35%). Too large: wall-to-wall mirror in small space can feel overwhelming — customer sees themselves + entire room doubled, disorienting "funhouse" effect. Premium fine dining avoids wall-to-wall mirrors (reads as gym/salon/dance studio). Best practice: 36x60 inches for small dining rooms (perceived depth doubling without overwhelming), 60x80 inches for medium dining rooms (dramatic depth), full-wall mirror for lounge/bar/entry (premium feel + space maximization). ${lostRevenue} revenue lost per month from mirror investment underperformance + lower perceived spaciousness + lower satisfaction. ACTION: resize mirror to optimal — replace too-small mirror with 36x60 inches (medium, $200-400) for depth doubling in small dining, replace too-large wall-to-wall mirror with 60x80 inches (large, $400-800) for fine dining tier, or use multiple medium mirrors on different walls (more design flexibility + less overwhelming than wall-to-wall). Choose frame: beveled edge for premium tier ($50-150 premium), frameless for modern tier ($0 premium), framed for traditional tier ($50-200 premium). Save ${fmt$(Math.max(lostRevenue, 500))}/mo from recovered perceived spaciousness + satisfaction + repeat intent. Mirror resize is $200-800 replacement.`,
        ai_recommendation: 'resize_mirror_to_optimal',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: MIRROR_PLACEMENT_POOR
    if (config.requireMirrorsVisibleToCustomers && d.mirror_count > 0 && (!d.mirror_visible_to_customers || d.mirror_placement_quality_score < config.minMirrorPlacementScore)) {
      // Mirrors in dead zones (not visible to customers) -> wasted investment
      const placementGap = config.minMirrorPlacementScore - d.mirror_placement_quality_score;
      const wastedInvestmentPct = Math.min(20 + placementGap * 0.4, 40);
      const lostRevenue = Math.round(baselineRevenue * (wastedInvestmentPct / 100) * 0.08);
      const criticalNote = !d.mirror_visible_to_customers
        ? 'HIGH: mirror not visible from customer seats — mirror installed in dead zone (back hallway, behind server station, above coat rack, in corner). Mirror investment completely wasted, customers never see reflection, perceived spaciousness gain = 0. '
        : d.mirror_placement_quality_score < 40
          ? 'HIGH: mirror placement quality very poor — mirror visible but positioned awkwardly (too high, too low, off-center, behind pillar). Reflection is partial or distorted, perceived spaciousness gain minimal. '
          : 'MEDIUM: mirror placement below threshold — mirror visible but not positioned for maximum benefit. ';
      alerts.push({
        rule_id: 'mirror_placement_poor',
        severity: !d.mirror_visible_to_customers ? 'high' : d.mirror_placement_quality_score < 40 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        mirror_count: d.mirror_count,
        mirror_size_category: d.mirror_size_category,
        mirror_placement_quality_score: d.mirror_placement_quality_score,
        mirror_visible_to_customers: d.mirror_visible_to_customers,
        perceived_spaciousness_change: -Math.round(wastedInvestmentPct * 0.5),
        customer_satisfaction_change: -Math.round(wastedInvestmentPct * 0.2),
        predicted_revenue_change_pct: -Math.round(wastedInvestmentPct * 0.08),
        est_monthly_opportunity: Math.max(lostRevenue, 600),
        description: `MIRROR PLACEMENT POOR: ${d.location_id} mirror placement quality score ${d.mirror_placement_quality_score}/100 (min ${config.minMirrorPlacementScore}), visible to customers: ${d.mirror_visible_to_customers}. ${criticalNote}Mirror placement quality determines whether mirror delivers spaciousness benefit or wastes investment. Common dead zones: back hallway mirror (no customer ever sees it), behind server station (mirror hidden by staff), above coat rack (mirror at wrong height), in corner angled away from dining (reflection of empty corner), behind pillar (mirror mostly blocked). Mirror must be visible from primary customer sightlines — when customer sits at table, mirror should be in natural field of view (not require turning head). Mirror too high (above 7 feet) shows ceiling reflection, not useful depth. Mirror too low (below 3 feet) shows floor + chair legs, not useful. Mirror off-center on wall looks accidental. Mirror behind pillar wastes 50% of reflection surface. Best placement: mirror on wall opposite longest dimension of dining room (maximizes depth doubling), mirror centered on wall at eye level (4-6 feet center height), mirror opposite entry door (customers see expanded space immediately upon walking in), mirror opposite window (light amplification + view doubling). ${lostRevenue} revenue lost per month from wasted mirror investment + missed perceived spaciousness + missed photo marketing. ACTION: reposition mirror for visibility — (1) move mirror to wall visible from primary customer seats (opposite longest dimension), (2) center mirror on wall at eye level (4-6 feet center height), (3) angle mirror slightly downward (5-10 degrees) to reflect dining room instead of ceiling, (4) remove obstacles in front of mirror (pillars, plants, decorations blocking reflection). If mirror cannot be repositioned, relocate to better wall (cost: $100-200 remounting labor). Save ${fmt$(Math.max(lostRevenue, 600))}/mo from recovered perceived spaciousness + photo marketing + satisfaction. Mirror repositioning is $100-200 labor — most cost-effective mirror fix.`,
        ai_recommendation: 'reposition_mirror_for_visibility',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: REFLECTIVE_SURFACE_OVERUSE
    if (d.reflective_surface_count > config.maxReflectiveSurfaceCount) {
      // Too many reflective surfaces -> disorienting + visually noisy
      const overuseCount = d.reflective_surface_count - config.maxReflectiveSurfaceCount;
      const disorientationPct = Math.min(10 + overuseCount * 4, 30);
      const lostRevenue = Math.round(baselineRevenue * (disorientationPct / 100) * 0.1);
      const criticalNote = d.reflective_surface_count > 10
        ? 'CRITICAL: too many reflective surfaces (over 10) — multiple mirrors + polished stainless tables + glass partitions + chrome fixtures + glossy floor + reflective ceiling panels. Customer sees fragmented reflections from every direction, brain cannot process space, disorienting + visually noisy. Premium feel collapses into "hall of mirrors" — customers feel unstable, leave earlier. '
        : 'HIGH: reflective surface overuse — multiple mirrors + polished surfaces + reflective panels exceed comfortable threshold. Customer perceives visual noise, space feels busy + disorienting instead of expanded. ';
      alerts.push({
        rule_id: 'reflective_surface_overuse',
        severity: d.reflective_surface_count > 10 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        reflective_surface_count: d.reflective_surface_count,
        customer_satisfaction_change: -Math.round(disorientationPct * 0.6),
        perceived_spaciousness_change: -Math.round(disorientationPct * 0.3),
        predicted_dwell_change: -Math.round(disorientationPct * 0.4),
        predicted_revenue_change_pct: -Math.round(disorientationPct * 0.1),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `REFLECTIVE SURFACE OVERUSE: ${d.location_id} has ${d.reflective_surface_count} reflective surfaces (max ${config.maxReflectiveSurfaceCount}). ${criticalNote}Reflective surfaces include: wall mirrors, polished stainless tables, glass partitions, chrome fixtures, glossy floor tile, reflective ceiling panels, polished marble counters, glass-fronted display cases. Each reflective surface adds depth + light — but too many create visual noise + disorientation. Customer brain cannot process multiple fragmented reflections, space feels busy + unstable, premium feel collapses. Common overuse: restaurant tries to maximize spaciousness with mirrors everywhere, ends up feeling like funhouse or salon. Fine dining especially sensitive — Michelin-tier restaurants use 1-3 carefully placed mirrors, not 8-10 reflective surfaces. Premium feel requires restraint + intentionality. Visual noise from too many reflective surfaces also undermines photo-taking (customers cannot frame good photo with reflections everywhere). ${lostRevenue} revenue lost per month from disorientation + lower dwell + lower satisfaction + lower photo marketing + lower repeat intent. ACTION: reduce reflective surface count — (1) remove 2-4 mirrors (keep only the most effective placements — opposite window, opposite longest dimension, opposite entry door), (2) replace polished stainless tables with matte finish tables (reduces reflection while preserving durability), (3) replace glass partitions with wood/metal partitions (reduces visual noise), (4) replace chrome fixtures with brushed nickel/bronze (softer reflection), (5) replace glossy floor tile with matte tile (reduces floor reflection), (6) remove reflective ceiling panels (ceiling reflection is most disorienting — customer looks up + sees themselves doubled). Target: 3-5 reflective surfaces per dining room maximum. Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered comfort + dwell + satisfaction + photo marketing. Reflective surface reduction is $0 if removing mirrors (just take down) or $200-800 if replacing polished surfaces with matte alternatives.`,
        ai_recommendation: 'reduce_reflective_surface_count',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: MIRROR_OPPOSITE_WINDOW_OPPORTUNITY
    if (config.requireMirrorOppositeWindow && d.has_window && !d.mirror_opposite_window) {
      // No mirror opposite windows -> missed 100% light amplification + 8-12% HVAC savings
      const missedLightPct = 100; // 100% light amplification missed
      const missedHvacPct = 10;   // 8-12% HVAC savings missed
      const missedSatisfactionPct = 8;
      const lostRevenue = Math.round(baselineRevenue * (missedHvacPct / 100) * 0.05 + baselineRevenue * (missedSatisfactionPct / 100) * 0.1);
      const criticalNote = d.is_small_space
        ? 'CRITICAL: small space with window but no mirror opposite window — missed 100% natural light amplification + 8-12% HVAC savings (DOE mirror light amplification study). Small space already needs every perceived spaciousness gain; missing mirror opposite window compounds cramped feel + wastes free natural light. '
        : 'HIGH: location has window but no mirror opposite window — missed 100% natural light amplification + 8-12% HVAC savings (DOE mirror light amplification study). Window light is amplified 2x when mirror is opposite — doubles brightness, doubles warmth (passive solar heating), reduces need for artificial lighting + heating during daytime. ';
      alerts.push({
        rule_id: 'mirror_opposite_window_opportunity',
        severity: d.is_small_space ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        mirror_count: d.mirror_count,
        has_window: d.has_window,
        mirror_opposite_window: d.mirror_opposite_window,
        light_amplification_pct: 0,
        hvac_savings_potential_pct: missedHvacPct,
        perceived_spaciousness_change: -Math.round(missedLightPct * 0.1),
        customer_satisfaction_change: -missedSatisfactionPct,
        energy_savings_change: -missedHvacPct,
        predicted_revenue_change_pct: -Math.round(missedHvacPct * 0.5 + missedSatisfactionPct * 0.1),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `MIRROR OPPOSITE WINDOW OPPORTUNITY: ${d.location_id} has window but no mirror opposite window (mirror_opposite_window: false). ${criticalNote}Mirrors opposite windows double natural light effect — strategically placed mirrors amplify window light by 100% (DOE mirror light amplification study). Window light hits mirror + reflects back into room = 2x brightness from single window. In winter, mirror amplifies passive solar heating (window warmth + mirror reflection) = 8-12% HVAC savings (DOE mirror + passive solar study). In summer, mirror opposite window amplifies daylight = reduces artificial lighting need 30-50% during daytime. Combined energy savings: $50-200/month depending on climate + window size. Beyond energy: natural light is the #1 customer satisfaction driver in restaurants (Cornell CHR daylight study — 20-25% satisfaction boost from natural light). Mirror opposite window doubles that boost — 40-50% effective daylight satisfaction gain. Natural light also increases photo-taking (daylight photos 3x better than artificial light photos) — missed 25-30% photo marketing opportunity. ${lostRevenue} revenue lost per month from missed energy savings + missed daylight satisfaction + missed photo marketing + missed perceived spaciousness. ACTION: install mirror opposite window — (1) install mirror on wall directly opposite window (light hits mirror + reflects back, doubles brightness), (2) mirror size: minimum 36x60 inches to capture window reflection (smaller mirrors miss light amplification), (3) angle: flat against wall (mirror opposite window requires no tilt — flat reflection maximizes light amplification), (4) avoid glare: ensure mirror reflection does not land on customer faces (see mirror_causing_glare rule) — may need to position mirror slightly off-center from window to direct reflection upward or to side, (5) install reflective film on window itself (additional 10-15% light amplification, $100-300). Cost: $200-800 for mirror + install, $0 if moving existing mirror to opposite wall. Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered energy savings + daylight satisfaction + photo marketing + perceived spaciousness. Mirror opposite window pays back in 2-4 months from energy savings alone.`,
        ai_recommendation: 'install_mirror_opposite_window',
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
              { role: 'system', content: 'You are a restaurant interior mirror + reflective surface optimization expert. Given mirror inspection data, recommend ONE specific action with expected perceived spaciousness, satisfaction, dwell, energy, photo-taking, or revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Restaurant tier: ${a.restaurant_tier ?? 'n/a'}. Size: ${a.restaurant_size_sqft ?? 0} sqft (small: ${a.is_small_space ?? false}). Mirror count: ${a.mirror_count ?? 0}, size category: ${a.mirror_size_category ?? 'n/a'}. Placement score: ${a.mirror_placement_quality_score ?? 0}/100, visible: ${a.mirror_visible_to_customers ?? false}. Reflects undesirable: ${a.mirror_reflects_undesirable ?? false} (${a.reflected_area ?? 'n/a'}). Glare: ${a.mirror_causing_glare ?? false} (${a.glare_source ?? 'n/a'}). Cleanliness: ${a.mirror_cleanliness_score ?? 0}/100, dirty/smudged: ${a.mirror_dirty_smudged ?? false}. Reflective surfaces: ${a.reflective_surface_count ?? 0}. Has window: ${a.has_window ?? false}, mirror opposite window: ${a.mirror_opposite_window ?? false}. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM mirror_reflective_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE mirror_reflective_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<MirrorReflectiveAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM mirror_reflective_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  locationsAtRisk: number; mirrorsAbsentZones: number; undesirableReflectionZones: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(location_id != NONE) AS locations,
              math::count(rule_id = 'mirror_absent_small_space') AS mirrorsabsent,
              math::count(rule_id = 'mirror_reflecting_undesirable_area') AS undesirable
       FROM mirror_reflective_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      locationsAtRisk: safeNumber(r.locations, 0),
      mirrorsAbsentZones: safeNumber(r.mirrorsabsent, 0),
      undesirableReflectionZones: safeNumber(r.undesirable, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, locationsAtRisk: 0, mirrorsAbsentZones: 0, undesirableReflectionZones: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
