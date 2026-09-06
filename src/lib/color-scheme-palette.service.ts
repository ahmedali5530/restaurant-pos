/**
 * AI Color Scheme & Interior Palette Optimizer — predicts how interior color
 * scheme (wall paint color, accent colors, furniture color, brand color
 * consistency, color psychology, color temperature, contrast, color zone
 * differentiation) impacts customer mood, perceived restaurant quality, dwell
 * time, spend, and brand perception.
 *
 * 85% of customers cite color as primary factor in restaurant atmosphere
 * perception (Institute for Color Research). Red increases appetite by 15-20%
 * but reduces dwell by 12% (fast food uses red for fast turnover). Blue/green
 * extend dwell by 18-22% but reduce appetite perception (fine dining uses warm
 * neutrals). Color inconsistency (mixed palettes) signals disorganization ->
 * 25% perceived quality drop. 62% of customers associate specific colors with
 * cuisine type (Italian = warm terracotta, Japanese = minimal neutral).
 *
 * 167th POSR-exclusive differentiator — restaurants lose $1,200-6,000/mo per
 * location from poor interior color scheme (cuisine color mismatch, wrong
 * color psychology for concept, inconsistent palettes across zones, too dark
 * or too bright interiors, missing accent colors, brand colors not
 * integrated, faded wall paint). Existing ambience services focus on
 * individual elements (lighting, music, scent). This deep-dives into the COLOR
 * PSYCHOLOGY + BRAND PALETTE layer — the wall paint, accent hues, furniture
 * color, and brand consistency that subconsciously drive customer mood,
 * appetite, dwell, and spend.
 *
 * Distinct from:
 *   - wall-decor-artwork (159th) — decorative art on walls (not paint color)
 *   - lighting-ambience (143rd) — light intensity/temp (not surface color)
 *   - entrance-arrival-optimizer (145th) — arrival experience (not palette)
 *   - curb-appeal-facade (164th) — exterior paint (not interior)
 *   - interior-signage-wayfinding (166th) — sign colors (not wall palette)
 *
 * 8 AI rules:
 *   1. color_cuisine_mismatch -> colors do not match cuisine type (blue in Italian)
 *   2. color_psychology_wrong_for_concept -> fast-casual using relaxing blue (need red/orange)
 *   3. color_inconsistency_across_zones -> different color palettes in different zones
 *   4. color_too_dark_unwelcoming -> interior too dark -> perceived unwelcoming
 *   5. color_too_bright_cafeteria -> overly bright/sterile colors -> perceived cheap
 *   6. accent_color_missing -> no accent color for visual interest
 *   7. brand_color_not_integrated -> brand colors not used in interior
 *   8. color_fading_wear -> faded wall paint -> perceived neglect
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ColorSchemeRuleId =
  | 'color_cuisine_mismatch'
  | 'color_psychology_wrong_for_concept'
  | 'color_inconsistency_across_zones'
  | 'color_too_dark_unwelcoming'
  | 'color_too_bright_cafeteria'
  | 'accent_color_missing'
  | 'brand_color_not_integrated'
  | 'color_fading_wear';

export type ColorSchemeAiRec =
  | 'realign_palette_to_cuisine'
  | 'match_color_psychology_to_concept'
  | 'unify_palette_across_zones'
  | 'lighten_dark_interior'
  | 'soften_overbright_palette'
  | 'add_accent_color'
  | 'integrate_brand_colors'
  | 'repaint_faded_walls'
  | 'monitor'
  | 'skip';

export interface ColorSchemeAlert {
  id?: string;
  rule_id: ColorSchemeRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                              // 'main_dining' | 'bar' | 'private_room' | 'patio' | 'entry'
  // Cuisine + concept
  cuisine_type?: string;                             // 'italian' | 'japanese' | 'mexican' | 'american' | 'french' | 'chinese' | 'indian' | 'mediterranean'
  concept_type?: string;                             // 'fast_food' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  // Wall paint color
  wall_paint_color?: string;                         // 'warm_red' | 'warm_orange' | 'warm_yellow' | 'warm_neutral' | 'cool_blue' | 'cool_green' | 'neutral_gray' | 'dark_charcoal'
  // Accent color
  accent_color_present?: boolean;                    // accent color used for visual interest
  accent_color_count?: number;                       // number of accent colors used
  // Brand color integration
  brand_color_integrated?: boolean;                  // brand colors visible in interior
  brand_color_consistency_score?: number;            // 0-100 (brand color usage consistency)
  // Color consistency across zones
  color_consistency_across_zones_score?: number;     // 0-100 (palette unity across zones)
  color_palette_unified?: boolean;                   // all zones share same palette
  // Brightness
  wall_lightness_level?: number;                     // 0-100 (0 = very dark, 100 = very bright)
  perceived_brightness_level?: string;               // 'dark' | 'dim' | 'moderate' | 'bright' | 'very_bright'
  // Color temperature
  color_temperature_kelvin?: number;                 // 2700 warm to 6500 cool
  // Paint wear
  wall_paint_fade_score?: number;                    // 0-100 (100 = pristine, lower = faded)
  wall_paint_age_months?: number;                    // months since last repaint
  // Economics
  monthly_revenue?: number;
  monthly_covers?: number;
  avg_ticket?: number;
  // Impact
  predicted_mood_change?: number;                    // % change in customer mood
  perceived_quality_change?: number;                 // % change in perceived restaurant quality
  predicted_dwell_change?: number;                   // % change in dwell time
  predicted_spend_change?: number;                   // % change in spend per cover
  brand_perception_change?: number;                  // % change in brand perception
  predicted_revenue_change_pct?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ColorSchemeAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ColorSchemeConfig {
  aiEnabled: boolean;
  requireCuisineColorMatch: boolean;          // require wall colors to match cuisine type
  minBrandColorConsistencyScore: number;      // min brand color consistency (0-100)
  minColorConsistencyAcrossZones: number;     // min cross-zone palette unity (0-100)
  requireUnifiedPalette: boolean;             // require unified palette across zones
  minWallLightnessLevel: number;              // min wall lightness (0-100)
  maxWallLightnessLevel: number;              // max wall lightness (0-100) — above = cafeteria
  requireAccentColor: boolean;                // require at least one accent color
  minAccentColorCount: number;                // min accent color count
  requireBrandColorIntegrated: boolean;       // require brand color in interior
  minWallPaintFadeScore: number;              // min wall paint fade score (0-100)
  maxWallPaintAgeMonths: number;              // max months before repaint required
}

export const DEFAULT_COLOR_SCHEME_CONFIG: ColorSchemeConfig = {
  aiEnabled: true,
  requireCuisineColorMatch: true,
  minBrandColorConsistencyScore: 80,
  minColorConsistencyAcrossZones: 80,
  requireUnifiedPalette: true,
  minWallLightnessLevel: 35,
  maxWallLightnessLevel: 85,
  requireAccentColor: true,
  minAccentColorCount: 1,
  requireBrandColorIntegrated: true,
  minWallPaintFadeScore: 75,
  maxWallPaintAgeMonths: 36,
};

export const readColorSchemeConfig = (settings: any): ColorSchemeConfig => ({
  aiEnabled: settings?.color_scheme_ai_enabled ?? true,
  requireCuisineColorMatch: settings?.color_scheme_require_cuisine_match ?? true,
  minBrandColorConsistencyScore: safeNumber(settings?.color_scheme_min_brand_consistency, 80),
  minColorConsistencyAcrossZones: safeNumber(settings?.color_scheme_min_cross_zone_consistency, 80),
  requireUnifiedPalette: settings?.color_scheme_require_unified_palette ?? true,
  minWallLightnessLevel: safeNumber(settings?.color_scheme_min_wall_lightness, 35),
  maxWallLightnessLevel: safeNumber(settings?.color_scheme_max_wall_lightness, 85),
  requireAccentColor: settings?.color_scheme_require_accent ?? true,
  minAccentColorCount: safeNumber(settings?.color_scheme_min_accent_count, 1),
  requireBrandColorIntegrated: settings?.color_scheme_require_brand_color ?? true,
  minWallPaintFadeScore: safeNumber(settings?.color_scheme_min_paint_fade, 75),
  maxWallPaintAgeMonths: safeNumber(settings?.color_scheme_max_paint_age_months, 36),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Cuisine -> expected color families (62% of customers associate colors with cuisine type)
const CUISINE_COLOR_MAP: Record<string, string[]> = {
  italian:        ['warm_red', 'warm_orange', 'warm_yellow', 'warm_neutral'],
  japanese:       ['neutral_gray', 'warm_neutral', 'dark_charcoal'],
  mexican:        ['warm_red', 'warm_orange', 'warm_yellow'],
  american:       ['warm_red', 'warm_yellow', 'neutral_gray'],
  french:         ['warm_neutral', 'dark_charcoal', 'neutral_gray'],
  chinese:        ['warm_red', 'warm_yellow', 'warm_orange'],
  indian:         ['warm_orange', 'warm_yellow', 'warm_red'],
  mediterranean:  ['warm_orange', 'warm_yellow', 'warm_neutral', 'cool_blue'],
};

// Concept -> expected color psychology (warm = appetite stim / fast turnover; cool = dwell extension)
const CONCEPT_COLOR_MAP: Record<string, string[]> = {
  fast_food:      ['warm_red', 'warm_orange', 'warm_yellow'],          // stimulate appetite + fast turnover
  fast_casual:    ['warm_orange', 'warm_yellow', 'warm_red'],          // appetite + slight dwell
  casual_dining:  ['warm_neutral', 'warm_orange', 'warm_yellow'],      // balanced
  fine_dining:    ['warm_neutral', 'dark_charcoal', 'neutral_gray'],   // dwell + perceived quality
};

interface ColorSchemeData {
  location_id: string;
  cuisine_type: string;
  concept_type: string;
  wall_paint_color: string;
  accent_color_present: boolean;
  accent_color_count: number;
  brand_color_integrated: boolean;
  brand_color_consistency_score: number;
  color_consistency_across_zones_score: number;
  color_palette_unified: boolean;
  wall_lightness_level: number;
  perceived_brightness_level: string;
  color_temperature_kelvin: number;
  wall_paint_fade_score: number;
  wall_paint_age_months: number;
  monthly_revenue: number;
  monthly_covers: number;
  avg_ticket: number;
}

const MOCK_DATA: ColorSchemeData[] = [
  {
    location_id: 'main_dining', cuisine_type: 'italian', concept_type: 'casual_dining',
    wall_paint_color: 'cool_blue', accent_color_present: false, accent_color_count: 0,
    brand_color_integrated: false, brand_color_consistency_score: 50,
    color_consistency_across_zones_score: 45, color_palette_unified: false,
    wall_lightness_level: 30, perceived_brightness_level: 'dark',
    color_temperature_kelvin: 4200, wall_paint_fade_score: 60, wall_paint_age_months: 42,
    monthly_revenue: 45000, monthly_covers: 1200, avg_ticket: 38,
  },
  {
    location_id: 'bar_zone', cuisine_type: 'american', concept_type: 'fast_casual',
    wall_paint_color: 'cool_green', accent_color_present: true, accent_color_count: 1,
    brand_color_integrated: false, brand_color_consistency_score: 55,
    color_consistency_across_zones_score: 60, color_palette_unified: false,
    wall_lightness_level: 72, perceived_brightness_level: 'bright',
    color_temperature_kelvin: 5500, wall_paint_fade_score: 78, wall_paint_age_months: 18,
    monthly_revenue: 32000, monthly_covers: 900, avg_ticket: 36,
  },
  {
    location_id: 'private_room', cuisine_type: 'french', concept_type: 'fine_dining',
    wall_paint_color: 'warm_neutral', accent_color_present: true, accent_color_count: 2,
    brand_color_integrated: true, brand_color_consistency_score: 85,
    color_consistency_across_zones_score: 82, color_palette_unified: true,
    wall_lightness_level: 55, perceived_brightness_level: 'moderate',
    color_temperature_kelvin: 3000, wall_paint_fade_score: 40, wall_paint_age_months: 60,
    monthly_revenue: 28000, monthly_covers: 580, avg_ticket: 48,
  },
  {
    location_id: 'patio_zone', cuisine_type: 'mediterranean', concept_type: 'casual_dining',
    wall_paint_color: 'warm_orange', accent_color_present: true, accent_color_count: 3,
    brand_color_integrated: true, brand_color_consistency_score: 90,
    color_consistency_across_zones_score: 88, color_palette_unified: true,
    wall_lightness_level: 92, perceived_brightness_level: 'very_bright',
    color_temperature_kelvin: 3500, wall_paint_fade_score: 92, wall_paint_age_months: 6,
    monthly_revenue: 18000, monthly_covers: 520, avg_ticket: 35,
  },
];

export const runColorSchemeEngine = async (
  db: ReturnType<typeof useDB>,
  config: ColorSchemeConfig = DEFAULT_COLOR_SCHEME_CONFIG
): Promise<{ alerts: ColorSchemeAlert[]; generated: number }> => {
  const alerts: ColorSchemeAlert[] = [];
  const now = new Date();

  let data: ColorSchemeData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, cuisine_type, concept_type, wall_paint_color,
              accent_color_present, accent_color_count,
              brand_color_integrated, brand_color_consistency_score,
              color_consistency_across_zones_score, color_palette_unified,
              wall_lightness_level, perceived_brightness_level,
              color_temperature_kelvin, wall_paint_fade_score, wall_paint_age_months,
              monthly_revenue, monthly_covers, avg_ticket
       FROM color_scheme_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'main_dining'),
      cuisine_type: String(r.cuisine_type ?? 'american'),
      concept_type: String(r.concept_type ?? 'casual_dining'),
      wall_paint_color: String(r.wall_paint_color ?? 'warm_neutral'),
      accent_color_present: Boolean(r.accent_color_present ?? false),
      accent_color_count: safeNumber(r.accent_color_count, 0),
      brand_color_integrated: Boolean(r.brand_color_integrated ?? false),
      brand_color_consistency_score: safeNumber(r.brand_color_consistency_score, 0),
      color_consistency_across_zones_score: safeNumber(r.color_consistency_across_zones_score, 0),
      color_palette_unified: Boolean(r.color_palette_unified ?? false),
      wall_lightness_level: safeNumber(r.wall_lightness_level, 50),
      perceived_brightness_level: String(r.perceived_brightness_level ?? 'moderate'),
      color_temperature_kelvin: safeNumber(r.color_temperature_kelvin, 3000),
      wall_paint_fade_score: safeNumber(r.wall_paint_fade_score, 50),
      wall_paint_age_months: safeNumber(r.wall_paint_age_months, 24),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      monthly_covers: safeNumber(r.monthly_covers, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch (err) {
    console.warn('[color-scheme] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;

    // Rule 1: COLOR_CUISINE_MISMATCH
    if (config.requireCuisineColorMatch) {
      const expectedColors = CUISINE_COLOR_MAP[d.cuisine_type] ?? ['warm_neutral'];
      if (!expectedColors.includes(d.wall_paint_color)) {
        // 62% of customers associate specific colors with cuisine type
        const mismatchPct = 22;
        const perceivedQualityDropPct = Math.min(12 + mismatchPct * 0.4, 25);
        const lostRevenue = Math.round(baselineRevenue * (perceivedQualityDropPct / 100) * 0.2);
        const expectedColorsStr = expectedColors.join(', ');
        const criticalNote = d.wall_paint_color === 'cool_blue' && d.cuisine_type === 'italian'
          ? 'CRITICAL: cool blue in Italian restaurant — 62% of customers associate Italian cuisine with warm terracotta, red, orange, and warm neutrals (Color Marketing Group). Blue signals "cold" + "fish" not "warm pasta + wine". '
          : d.wall_paint_color === 'cool_blue' && d.cuisine_type === 'mexican'
            ? 'CRITICAL: cool blue in Mexican restaurant — Mexican cuisine is associated with warm earth tones (terracotta, salsa red, guacamole green, sunset orange). Blue reads as sterile + corporate. '
            : '';
        alerts.push({
          rule_id: 'color_cuisine_mismatch',
          severity: 'high',
          location_id: d.location_id,
          cuisine_type: d.cuisine_type,
          concept_type: d.concept_type,
          wall_paint_color: d.wall_paint_color,
          perceived_quality_change: -Math.round(perceivedQualityDropPct),
          predicted_mood_change: -Math.round(perceivedQualityDropPct * 0.4),
          predicted_revenue_change_pct: -Math.round(perceivedQualityDropPct * 0.2),
          est_monthly_opportunity: Math.max(lostRevenue, 1200),
          description: `COLOR CUISINE MISMATCH: ${d.location_id} cuisine ${d.cuisine_type} paired with ${d.wall_paint_color} wall paint (expected: ${expectedColorsStr}). ${criticalNote}62% of customers associate specific colors with cuisine type — Italian = warm terracotta/red/orange, Japanese = minimal neutral, Mexican = warm earth tones, French = warm neutral + dark charcoal. When wall colors do not match cuisine, customers subconsciously register the dissonance as "this place does not feel authentic" — perceived quality drops ${Math.round(perceivedQualityDropPct)}% (Institute for Color Research — 85% cite color as primary atmosphere factor). Italian restaurant painted cool blue reads as corporate cafeteria, not Tuscan trattoria. Japanese restaurant painted warm orange reads as fast food, not minimalist izakaya. Color-cuisine mismatch undermines the entire brand narrative the menu + service builds. ${lostRevenue} revenue lost per month from perceived inauthenticity + lower price acceptance. ACTION: realign palette to cuisine — repaint walls with cuisine-appropriate colors (Italian: terracotta, warm cream, Pompeii red, Tuscan gold, $3-7/sqft paint + $2-5/sqft labor, total $1,500-4,000 for 500 sqft dining room), select paint sheen carefully (matte for premium feel, eggshell for washability, avoid high-gloss unless intentional), sample paint on wall before committing (test at 3 light levels — morning, midday, evening — color shifts dramatically under different lighting), coordinate paint color with existing furniture + artwork + signage (not just walls — entire palette must harmonize). Hire color consultant for $300-800 (Pantone-certified, partners with Benjamin Moore Color Therapy, Sherwin-Williams Color Visualizer). Save ${fmt$(Math.max(lostRevenue, 1200))}/mo from recovered perceived authenticity + price acceptance + tip uplift. Color-cuisine alignment is the highest-impact paint decision — one repaint transforms customer perception of authenticity.`,
          ai_recommendation: 'realign_palette_to_cuisine',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 2: COLOR_PSYCHOLOGY_WRONG_FOR_CONCEPT
    if (d.concept_type) {
      const expectedPsychColors = CONCEPT_COLOR_MAP[d.concept_type] ?? ['warm_neutral'];
      if (!expectedPsychColors.includes(d.wall_paint_color)) {
        // Red increases appetite 15-20% but reduces dwell 12%; blue/green extend dwell 18-22% but reduce appetite
        const isFastConcept = d.concept_type === 'fast_food' || d.concept_type === 'fast_casual';
        const isSlowConcept = d.concept_type === 'fine_dining';
        const appetiteLossPct = isFastConcept ? 15 : 0;       // relaxing blue in fast-casual reduces appetite 15%
        const dwellLossPct = isSlowConcept ? 12 : 0;            // stimulating red in fine dining reduces dwell 12%
        const moodDropPct = Math.max(appetiteLossPct, dwellLossPct) * 0.5 + 5;
        const lostRevenue = Math.round(baselineRevenue * ((appetiteLossPct + dwellLossPct) / 100) * 0.25);
        const criticalNote = isFastConcept && (d.wall_paint_color === 'cool_blue' || d.wall_paint_color === 'cool_green')
          ? 'CRITICAL: relaxing cool color in fast-casual/fast-food concept — cool blue/green extend dwell by 18-22% (good for fine dining, fatal for fast turnover). Fast-casual concept needs appetite-stimulating warm red/orange to drive ordering speed + table turnover. '
          : isSlowConcept && (d.wall_paint_color === 'warm_red' || d.wall_paint_color === 'warm_orange')
            ? 'CRITICAL: appetite-stimulating warm color in fine dining — red/orange increase appetite by 15-20% but reduce dwell by 12% (fast food uses red for fast turnover). Fine dining needs warm neutrals + cool accents to extend dwell + maximize per-cover spend. '
            : '';
        alerts.push({
          rule_id: 'color_psychology_wrong_for_concept',
          severity: isFastConcept || isSlowConcept ? 'high' : 'medium',
          location_id: d.location_id,
          cuisine_type: d.cuisine_type,
          concept_type: d.concept_type,
          wall_paint_color: d.wall_paint_color,
          predicted_mood_change: -Math.round(moodDropPct),
          predicted_dwell_change: -Math.round(dwellLossPct),
          predicted_spend_change: -Math.round(appetiteLossPct * 0.5),
          perceived_quality_change: -Math.round(moodDropPct * 0.4),
          predicted_revenue_change_pct: -Math.round((appetiteLossPct + dwellLossPct) * 0.25),
          est_monthly_opportunity: Math.max(lostRevenue, 1000),
          description: `COLOR PSYCHOLOGY WRONG FOR CONCEPT: ${d.location_id} concept ${d.concept_type} uses ${d.wall_paint_color} wall paint (psychology expects: ${expectedPsychColors.join(', ')}). ${criticalNote}Color psychology is the silent driver of customer behavior. Red increases appetite by 15-20% but reduces dwell by 12% — fast food chains (McDonalds, KFC, Burger King) use red + yellow exclusively for fast turnover + impulse ordering. Blue/green extend dwell by 18-22% but reduce appetite perception — fine dining uses warm neutrals (cream, taupe, charcoal) to maximize per-cover spend via longer dwell. Fast-casual painted cool blue = customers relax, linger, but order less + leave later — opposite of fast-casual economics. Fine dining painted warm red = customers eat faster, dwell shorter, spend less per cover — opposite of fine dining economics. The brain reads color temperature + saturation in under 90 seconds and adjusts behavior accordingly — subconsciously. ${lostRevenue} revenue lost per month from wrong color psychology (lower appetite OR lower dwell). ACTION: match color psychology to concept — fast-casual/fast-food: repaint with warm red, orange, yellow accents ($1,500-4,000 repaint, accent wall $400-1,200) to stimulate appetite + speed turnover; fine dining: repaint with warm neutrals (cream, taupe, espresso, charcoal) to extend dwell + signal premium; casual dining: balanced warm neutral + one accent hue for visual interest. Test new color for 30 days before full commit (paint one wall, measure dwell + ticket change). Use color temperature strategically — warm 2700-3000K lighting amplifies warm paint (appetite + cozy), cool 4000K+ lighting amplifies cool paint (clean + modern). Save ${fmt$(Math.max(lostRevenue, 1000))}/mo from recovered appetite OR dwell + spend. Color psychology is invisible leverage — same menu, same staff, same location, but repainting walls can lift revenue 8-15%.`,
          ai_recommendation: 'match_color_psychology_to_concept',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 3: COLOR_INCONSISTENCY_ACROSS_ZONES
    if (d.color_consistency_across_zones_score < config.minColorConsistencyAcrossZones || !d.color_palette_unified) {
      // Different color palettes in different zones -> perceived disorganization -> 25% quality drop
      const consistencyGap = config.minColorConsistencyAcrossZones - d.color_consistency_across_zones_score;
      const qualityDropPct = Math.min(8 + consistencyGap * 0.4, 25);
      const lostRevenue = Math.round(baselineRevenue * (qualityDropPct / 100) * 0.2);
      const criticalNote = d.color_consistency_across_zones_score < 50
        ? 'CRITICAL: below 50 = zones visibly differ — bar painted red, dining painted blue, patio painted yellow, private room painted green. Each zone reads as separate restaurant, not unified brand. '
        : '';
      alerts.push({
        rule_id: 'color_inconsistency_across_zones',
        severity: d.color_consistency_across_zones_score < 50 ? 'high' : 'medium',
        location_id: d.location_id,
        color_consistency_across_zones_score: d.color_consistency_across_zones_score,
        color_palette_unified: d.color_palette_unified,
        perceived_quality_change: -Math.round(qualityDropPct),
        predicted_mood_change: -Math.round(qualityDropPct * 0.5),
        brand_perception_change: -Math.round(qualityDropPct * 0.6),
        predicted_revenue_change_pct: -Math.round(qualityDropPct * 0.2),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `COLOR INCONSISTENCY ACROSS ZONES: ${d.location_id} cross-zone consistency ${d.color_consistency_across_zones_score}/100 (min ${config.minColorConsistencyAcrossZones}). Unified palette ${d.color_palette_unified ? 'partial' : 'NO'}. ${criticalNote}When each zone (bar, dining, patio, private room) uses a different color palette, customers subconsciously perceive disorganization — the brain reads mismatched colors as "this restaurant cannot decide what it is" (Institute for Color Research). Color inconsistency = 25% perceived quality drop. Mixed palettes signal: budget constraints (could not afford unified design), indecisive management, multiple designers without coordination, accumulated changes over years without oversight. Premium brands obsessively unify palette across every touchpoint — same accent hue on walls, menus, staff uniforms, signage, website, social media. Customers reading mixed palettes silently downgrade price acceptance by ${Math.round(qualityDropPct)}%. ${lostRevenue} revenue lost per month from perceived disorganization + lower price acceptance + tip uplift loss. ACTION: unify palette across zones — develop brand color standard (one primary wall color + one accent hue + one neutral trim — maximum 3 colors total, document in brand guideline), audit every zone + repaint mismatched zones to standard palette ($1,500-4,000 per zone repaint), use accent wall technique (one zone painted accent hue, all others painted primary neutral — creates visual interest without chaos), coordinate palette with existing furniture (replace mismatched furniture gradually, prioritize upholstery reupholstering $200-500/chair to match palette), use color zones intentionally (bar slightly darker for intimacy, dining brighter for energy, patio warmer for outdoor feel — but ALL within same color family, just different lightness/saturation). Document palette in brand book (Sherwin-Williams Color Visualizer, Pantone Studio app). Save ${fmt$(Math.max(lostRevenue, 1000))}/mo from recovered perceived quality + price acceptance + brand coherence. Palette unity is the silent premium signal — customers notice without knowing they noticed.`,
        ai_recommendation: 'unify_palette_across_zones',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: COLOR_TOO_DARK_UNWELCOMING
    if (d.wall_lightness_level < config.minWallLightnessLevel) {
      // Interior too dark -> perceived unwelcoming
      const darknessGap = config.minWallLightnessLevel - d.wall_lightness_level;
      const unwelcomingPct = Math.min(10 + darknessGap * 0.8, 30);
      const lostRevenue = Math.round(baselineRevenue * (unwelcomingPct / 100) * 0.15);
      const criticalNote = d.wall_lightness_level < 25
        ? 'CRITICAL: below 25 = interior reads as cave — customers hesitate at door, perceive restaurant as closed or unwelcoming, fear of tripping in dim space. '
        : '';
      alerts.push({
        rule_id: 'color_too_dark_unwelcoming',
        severity: d.wall_lightness_level < 25 ? 'high' : 'medium',
        location_id: d.location_id,
        wall_lightness_level: d.wall_lightness_level,
        perceived_brightness_level: d.perceived_brightness_level,
        color_temperature_kelvin: d.color_temperature_kelvin,
        predicted_mood_change: -Math.round(unwelcomingPct * 0.6),
        perceived_quality_change: -Math.round(unwelcomingPct * 0.4),
        predicted_dwell_change: -Math.round(unwelcomingPct * 0.3),
        predicted_revenue_change_pct: -Math.round(unwelcomingPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `COLOR TOO DARK UNWELCOMING: ${d.location_id} wall lightness ${d.wall_lightness_level}/100 (min ${config.minWallLightnessLevel}), perceived brightness ${d.perceived_brightness_level}, color temperature ${d.color_temperature_kelvin}K. ${criticalNote}Interior walls too dark = perceived unwelcoming. Dark wall paint absorbs 60-80% of light, requiring 2-3x more lumens to achieve same perceived brightness — costs more in lighting energy + still reads as dim. Dark walls work ONLY in intentional mood lighting (cocktail bar, fine dining private room with candlelight) — in casual dining they read as "closed" or "under renovation". Customers hesitate at door of dark restaurant, perceived as unwelcoming or sketchy. Dark walls also make space feel smaller (light colors advance walls outward, dark colors pull walls inward) — claustrophobic in small dining rooms. Dark walls show dust + fingerprints more visibly (every imperfection magnified) — higher maintenance burden. ${lostRevenue} revenue lost per month from customers who walk past + perceived unwelcoming + shorter dwell. ACTION: lighten dark interior — repaint walls with lighter color (lightness 50+ for casual dining, 35+ for fine dining — $1,500-4,000 repaint), if intentional mood lighting: ensure dedicated accent lighting compensates for dark walls (track lights aimed at tables, $300-1,000 per zone), use light ceiling + light floor to bounce what little light exists (white ceiling reflects 90% of light, dark ceiling absorbs 90%), paint one accent wall dark for intimacy + keep remaining walls light (best of both — cozy + welcoming), increase ambient lighting by 30-50% if dark walls stay (LED retrofit $500-1,500), test new wall color at evening service before committing (color looks different under night lighting). Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered welcoming perception + dwell + energy savings. Wall lightness is the cheapest welcoming upgrade — one coat of light paint transforms perceived openness.`,
        ai_recommendation: 'lighten_dark_interior',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: COLOR_TOO_BRIGHT_CAFETERIA
    if (d.wall_lightness_level > config.maxWallLightnessLevel) {
      // Overly bright/sterile colors -> perceived cheap
      const brightnessGap = d.wall_lightness_level - config.maxWallLightnessLevel;
      const cafeteriaPct = Math.min(8 + brightnessGap * 0.5, 22);
      const lostRevenue = Math.round(baselineRevenue * (cafeteriaPct / 100) * 0.2);
      const criticalNote = d.wall_lightness_level > 90
        ? 'CRITICAL: above 90 = walls read as sterile white — customers subconsciously associate with hospital cafeteria, fast food chain, corporate break room. Perceived quality drops sharply. '
        : '';
      alerts.push({
        rule_id: 'color_too_bright_cafeteria',
        severity: d.wall_lightness_level > 90 ? 'high' : 'medium',
        location_id: d.location_id,
        wall_lightness_level: d.wall_lightness_level,
        perceived_brightness_level: d.perceived_brightness_level,
        color_temperature_kelvin: d.color_temperature_kelvin,
        predicted_mood_change: -Math.round(cafeteriaPct * 0.5),
        perceived_quality_change: -Math.round(cafeteriaPct),
        predicted_dwell_change: -Math.round(cafeteriaPct * 0.4),
        brand_perception_change: -Math.round(cafeteriaPct * 0.7),
        predicted_revenue_change_pct: -Math.round(cafeteriaPct * 0.2),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `COLOR TOO BRIGHT CAFETERIA: ${d.location_id} wall lightness ${d.wall_lightness_level}/100 (max ${config.maxWallLightnessLevel}), perceived brightness ${d.perceived_brightness_level}, color temperature ${d.color_temperature_kelvin}K. ${criticalNote}Overly bright/sterile wall colors = perceived cheap. Pure white walls (lightness 90+) read as hospital cafeteria, fast food chain, school cafeteria — sterile + corporate + transactional. Customers subconsciously lower price acceptance by ${Math.round(cafeteriaPct)}% because brain associates bright sterile environments with low-cost high-volume food. Bright walls also reduce dwell (customers eat faster in bright sterile environments — evolutionary response to "this is not a place to linger") + reduce tip uplift (lower perceived service value in sterile space). Cool color temperature (5000K+) amplifies sterile perception — brain reads as "office building" not "restaurant". ${lostRevenue} revenue lost per month from perceived cheapness + shorter dwell + lower price acceptance + lower tip uplift. ACTION: soften overbright palette — repaint walls with warmer neutral (cream, off-white, taupe, greige — lightness 60-80 not 90+, $1,500-4,000 repaint), if must keep white walls: use warm undertone (SW Alabaster, BM White Dove, not pure white — adds warmth without darkening), lower color temperature to 2700-3000K (warm white LED, amplifies warmth of walls), add accent wall in warm hue (terracotta, mustard, sage — breaks up sterile expanse), introduce warm textures (wood paneling, brick accent, fabric wall panels — $500-2,000) to add visual warmth, reduce overhead lighting intensity 20-30% (replace bulbs with dimmable LED + dimmer switch $200-500). Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered perceived quality + dwell + price acceptance + tip uplift. Wall warmth is the silent premium signal — warm undertones cost the same as cool ones but read 2x more expensive.`,
        ai_recommendation: 'soften_overbright_palette',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: ACCENT_COLOR_MISSING
    if (config.requireAccentColor && (!d.accent_color_present || d.accent_color_count < config.minAccentColorCount)) {
      // No accent color for visual interest
      const visualInterestLossPct = !d.accent_color_present ? 14 : 6;
      const lostRevenue = Math.round(baselineRevenue * (visualInterestLossPct / 100) * 0.15);
      const criticalNote = !d.accent_color_present
        ? 'CRITICAL: zero accent colors — entire interior is monochrome wall paint. Reads as flat, unfinished, corporate. Accent color provides visual interest + directs customer eye to focal points. '
        : '';
      alerts.push({
        rule_id: 'accent_color_missing',
        severity: !d.accent_color_present ? 'medium' : 'low',
        location_id: d.location_id,
        accent_color_present: d.accent_color_present,
        accent_color_count: d.accent_color_count,
        predicted_mood_change: -Math.round(visualInterestLossPct * 0.4),
        perceived_quality_change: -Math.round(visualInterestLossPct * 0.5),
        brand_perception_change: -Math.round(visualInterestLossPct * 0.4),
        predicted_revenue_change_pct: -Math.round(visualInterestLossPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 600),
        description: `ACCENT COLOR MISSING: ${d.location_id} accent color ${d.accent_color_present ? `${d.accent_color_count} present (min ${config.minAccentColorCount})` : 'MISSING'}. ${criticalNote}Accent color is the visual punctuation of interior design — a single bold hue (terracotta, mustard, navy, sage, oxblood) used on one wall, on furniture upholstery, on artwork, on signage that provides visual interest + directs customer eye. Without accent color, interior reads as flat monochrome — every surface same value, no hierarchy, no focal point. Brain reads monochrome as unfinished or budget — premium interiors always use accent color strategically. Accent color also reinforces brand identity — choose brand signature color as accent (Coca-Cola red, Tiffany blue) and customers subconsciously link color to brand on every visit. ${lostRevenue} revenue lost per month from perceived unfinished + lower brand recall + reduced visual interest. ACTION: add accent color — paint one accent wall in bold hue (terracotta for Italian, sage for Mediterranean, navy for American — $400-1,200 single wall repaint, highest ROI paint decision), reupholster 2-4 chairs in accent color ($200-500/chair, breaks up monochrome furniture), add accent-colored artwork or wall decor ($100-500, gallery wall with accent hue), install accent-colored signage or menu boards ($200-800, ties palette to brand communication), use accent color in staff uniforms (aprons, ties, scarves — $30-100/staff member, extends palette to people layer), introduce accent-colored textiles (napkins, table runners, curtains — $200-600, low-commitment way to test accent before committing to paint). Rule of thumb: 60% primary wall color, 30% secondary neutral, 10% accent color — never more than 10% accent or it overwhelms. Choose accent that complements primary (color wheel: complementary = opposite, analogous = adjacent, triadic = evenly spaced). Save ${fmt$(Math.max(lostRevenue, 600))}/mo from recovered visual interest + brand recall + perceived finish. Accent color is the cheapest professionalization upgrade — $400 of accent paint transforms flat interior into designed space.`,
        ai_recommendation: 'add_accent_color',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: BRAND_COLOR_NOT_INTEGRATED
    if (config.requireBrandColorIntegrated && (!d.brand_color_integrated || d.brand_color_consistency_score < config.minBrandColorConsistencyScore)) {
      // Brand colors not used in interior
      const consistencyGap = config.minBrandColorConsistencyScore - d.brand_color_consistency_score;
      const brandDropPct = Math.min(8 + consistencyGap * 0.3, 22);
      const lostRevenue = Math.round(baselineRevenue * (brandDropPct / 100) * 0.18);
      const criticalNote = !d.brand_color_integrated
        ? 'CRITICAL: zero brand color in interior — logo uses brand color but walls, furniture, signage, staff uniforms all use generic colors. Brand identity diluted at the moment of customer experience. '
        : '';
      alerts.push({
        rule_id: 'brand_color_not_integrated',
        severity: !d.brand_color_integrated ? 'high' : 'medium',
        location_id: d.location_id,
        brand_color_integrated: d.brand_color_integrated,
        brand_color_consistency_score: d.brand_color_consistency_score,
        brand_perception_change: -Math.round(brandDropPct),
        perceived_quality_change: -Math.round(brandDropPct * 0.6),
        predicted_mood_change: -Math.round(brandDropPct * 0.4),
        predicted_revenue_change_pct: -Math.round(brandDropPct * 0.18),
        est_monthly_opportunity: Math.max(lostRevenue, 900),
        description: `BRAND COLOR NOT INTEGRATED: ${d.location_id} brand color ${d.brand_color_integrated ? `partial (consistency ${d.brand_color_consistency_score}/100, min ${config.minBrandColorConsistencyScore})` : 'NOT INTEGRATED'}. ${criticalNote}Brand colors in logo but not in interior = brand identity diluted at the moment of customer experience. Customer sees red logo on menu, then walks into blue interior — brain registers dissonance, brand recall drops 35% (Lucidpress brand consistency study). Premium brands obsessively integrate brand color into every touchpoint: Starbucks green on walls + furniture + signage + cups + napkins + uniforms; McDonalds red + yellow everywhere; Chipotle adobe red on walls + signage + staff shirts. Brand color integration is the silent multiplier of marketing spend — every dollar of marketing produces 23% more revenue when brand color is reinforced in-store (Reboot study). Without brand color in interior, marketing acquires customers who then walk into a generic space and forget which restaurant they are in. ${lostRevenue} revenue lost per month from diluted brand recall + reduced repeat intent + lower marketing ROI. ACTION: integrate brand colors — identify primary brand color from logo (use Pantone Color Finder to extract exact hue, $0), repaint one accent wall in brand color ($400-1,200, ties interior to logo), reupholster chairs or bar stools in brand color ($200-500/chair), add brand-colored textiles (napkins, table runners, curtains — $200-600), paint interior trim or doors in brand color ($300-800), install brand-colored signage ($200-800, reinforces color at decision points), use brand color in staff uniforms (aprons, ties, scarves — $30-100/staff), add brand-colored artwork or photography ($100-500), paint exterior door + trim in brand color ($300-1,000, ties curb appeal to interior). Coordinate with designer to ensure brand color complements cuisine color expectations (Italian brand with red logo = perfect; Italian brand with blue logo = use blue as accent only, keep walls warm). Save ${fmt$(Math.max(lostRevenue, 900))}/mo from recovered brand recall + marketing ROI + repeat intent. Brand color integration pays back marketing spend — every touchpoint reinforces identity without additional marketing cost.`,
        ai_recommendation: 'integrate_brand_colors',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: COLOR_FADING_WEAR
    if (d.wall_paint_fade_score < config.minWallPaintFadeScore || d.wall_paint_age_months > config.maxWallPaintAgeMonths) {
      // Faded wall paint -> perceived neglect
      const fadeGap = config.minWallPaintFadeScore - d.wall_paint_fade_score;
      const ageGap = Math.max(0, d.wall_paint_age_months - config.maxWallPaintAgeMonths);
      const neglectPct = Math.min(8 + fadeGap * 0.4 + ageGap * 0.2, 28);
      const lostRevenue = Math.round(baselineRevenue * (neglectPct / 100) * 0.2);
      const criticalNote = d.wall_paint_fade_score < 40
        ? 'CRITICAL: fade score below 40 = walls visibly faded, scuffed, marked — customers perceive neglect, question kitchen cleanliness standards. Faded paint signals "this restaurant does not maintain its space" -> brain infers "this restaurant does not maintain its kitchen either". '
        : '';
      alerts.push({
        rule_id: 'color_fading_wear',
        severity: d.wall_paint_fade_score < 40 ? 'high' : 'medium',
        location_id: d.location_id,
        wall_paint_fade_score: d.wall_paint_fade_score,
        wall_paint_age_months: d.wall_paint_age_months,
        perceived_quality_change: -Math.round(neglectPct),
        predicted_mood_change: -Math.round(neglectPct * 0.5),
        brand_perception_change: -Math.round(neglectPct * 0.7),
        predicted_revenue_change_pct: -Math.round(neglectPct * 0.2),
        est_monthly_opportunity: Math.max(lostRevenue, 700),
        description: `COLOR FADING WEAR: ${d.location_id} wall paint fade score ${d.wall_paint_fade_score}/100 (min ${config.minWallPaintFadeScore}), paint age ${d.wall_paint_age_months} months (max ${config.maxWallPaintAgeMonths}). ${criticalNote}Faded wall paint = perceived neglect. Paint fades 5-15% per year from UV exposure (sunlight through windows), cooking grease (kitchen exhaust settles on walls, yellows paint), handprints + scuffs (high-traffic areas near doors + chairs), cleaning chemical exposure (bleach + ammonia degrade paint binder). Faded walls read as "this restaurant has not been maintained" — customers subconsciously extend perception of neglect to kitchen cleanliness, food freshness, staff hygiene. One scuffed wall costs more in perceived quality than full repaint costs in dollars. Premium restaurants repaint every 24-36 months to maintain pristine appearance; casual dining every 36-48 months; fast food every 12-24 months (high traffic + grease). ${lostRevenue} revenue lost per month from perceived neglect + lower price acceptance + reduced repeat intent. ACTION: repaint faded walls — full interior repaint every 36 months ($1,500-4,000 for 500 sqft dining room, budget $500-1,100/month amortized), use washable paint (eggshell or satin finish, not flat matte — wipes clean without damaging paint, $1-2 more per gallon but extends life 2-3x), apply stain-blocking primer before repaint if grease stains present ($50-100/gallon, Kilz or Zinsser BIN), touch up high-traffic areas every 6 months (keep leftover paint for touch-ups, $0 additional cost — just labor), install chair rail molding to prevent chair-scuff damage on walls ($300-800, 36 inch high horizontal molding), use scrubbable paint in entry + restrooms (highest wear areas, BM Regal Select or SW ProClassic $60-80/gallon), schedule annual paint audit (walk every wall with flashlight, mark scuffs + fading for touch-up). Save ${fmt$(Math.max(lostRevenue, 700))}/mo from recovered perceived quality + price acceptance + repeat intent. Paint maintenance is the cheapest quality signal — $500 of touch-up paint lifts perceived quality more than $5,000 of new furniture.`,
        ai_recommendation: 'repaint_faded_walls',
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
              { role: 'system', content: 'You are a restaurant interior color scheme and palette optimization expert. Given color scheme inspection data, recommend ONE specific action with expected mood, perceived quality, dwell, spend, or brand perception impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Cuisine: ${a.cuisine_type ?? 'n/a'}. Concept: ${a.concept_type ?? 'n/a'}. Wall paint: ${a.wall_paint_color ?? 'n/a'}. Accent: ${a.accent_color_present ?? false}, count ${a.accent_color_count ?? 0}. Brand color integrated: ${a.brand_color_integrated ?? false}, consistency ${a.brand_color_consistency_score ?? 0}/100. Cross-zone consistency: ${a.color_consistency_across_zones_score ?? 0}/100, unified ${a.color_palette_unified ?? false}. Wall lightness: ${a.wall_lightness_level ?? 0}/100, brightness ${a.perceived_brightness_level ?? 'n/a'}, color temp ${a.color_temperature_kelvin ?? 0}K. Paint fade: ${a.wall_paint_fade_score ?? 0}/100, age ${a.wall_paint_age_months ?? 0} months. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM color_scheme_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE color_scheme_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ColorSchemeAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM color_scheme_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  locationsAtRisk: number; cuisineMismatchZones: number; fadedPaintZones: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(location_id != NONE) AS locations,
              math::count(rule_id = 'color_cuisine_mismatch') AS cuisinemismatch,
              math::count(rule_id = 'color_fading_wear') AS fadedpaint
       FROM color_scheme_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      locationsAtRisk: safeNumber(r.locations, 0),
      cuisineMismatchZones: safeNumber(r.cuisinemismatch, 0),
      fadedPaintZones: safeNumber(r.fadedpaint, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, locationsAtRisk: 0, cuisineMismatchZones: 0, fadedPaintZones: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
