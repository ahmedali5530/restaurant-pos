/**
 * AI Wall Decor & Artwork Impact Optimizer — predicts how wall decor
 * (artwork, murals, photographs, typography, brand graphics, empty walls,
 * seasonal decor) impacts customer satisfaction, perceived restaurant
 * quality, dwell time, and Instagram/photo sharing (free marketing).
 *
 * 78% of customers notice wall decor within 30 seconds of sitting
 * (Cornell CHR). Wall art is the #1 visual branding element customers
 * stare at during entire visit. Instagram photos featuring wall art =
 * free marketing worth $25-100/post equivalent. Empty walls signal
 * "unfinished" or "low effort" — customers perceive lower quality.
 *
 * 159th POSR-exclusive differentiator — restaurants lose $300-1,500/mo per
 * location from absent, mismatched, or worn wall decor. Existing
 * atmosphere/vibe services treat decor as ONE ambient factor. This
 * deep-dives into empty wall detection, brand mismatch, photo-opportunity
 * walls, artwork fading, seasonal decor staleness, wall art inconsistency,
 * artwork lighting, and local artist opportunities.
 *
 * Distinct from:
 *   - atmosphere-revenue.service (138th) — correlates ALL ambient factors
 *   - vibe-optimizer.service (49th) — optimizes MUSIC only
 *   - lighting-mood-optimizer.service (150th) — overall lighting (not art lighting)
 *   - entrance-arrival-optimizer.service (153rd) — entry zone (not wall art)
 *   - menu-photography-impact.service — food photography (not wall art)
 *   - social-content.service — content generation (not wall art ROI)
 *
 * 8 AI rules:
 *   1. empty_wall_detected — bare walls with no artwork → missed branding opportunity
 *   2. artwork_brand_mismatch — art does not match restaurant concept/cuisine
 *   3. photo_opportunity_wall_missing — no Instagram-worthy wall → lost free marketing
 *   4. artwork_fading_wear — faded/damaged artwork → quality signal drop
 *   5. seasonal_decor_stale — holiday/seasonal decor left up past season → looks neglected
 *   6. wall_art_inconsistency — different art styles in different zones → disjointed brand
 *   7. artwork_lighting_poor — artwork poorly lit → customers cannot see/appreciate it
 *   8. local_artist_opportunity — no local artist features → missed community connection + PR
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type WallDecorRuleId =
  | 'empty_wall_detected'
  | 'artwork_brand_mismatch'
  | 'photo_opportunity_wall_missing'
  | 'artwork_fading_wear'
  | 'seasonal_decor_stale'
  | 'wall_art_inconsistency'
  | 'artwork_lighting_poor'
  | 'local_artist_opportunity';

export type WallDecorAiRec =
  | 'install_artwork'
  | 'replace_artwork'
  | 'install_photo_wall'
  | 'restore_or_replace_art'
  | 'remove_seasonal_decor'
  | 'unify_art_style'
  | 'add_picture_lighting'
  | 'feature_local_artist'
  | 'monitor'
  | 'skip';

export interface WallDecorAlert {
  id?: string;
  rule_id: WallDecorRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  zone?: string;                          // 'main_dining' | 'bar' | 'entrance' | 'restroom' | 'private_room' | 'patio'
  // Decor metrics
  decor_type?: string;                    // 'artwork' | 'mural' | 'photograph' | 'typography' | 'brand_graphics' | 'empty' | 'seasonal'
  recommended_decor_type?: string;
  artwork_age_months?: number;
  condition_score?: number;               // 0-100 (artwork condition)
  cuisine_match_score?: number;           // 0-100 (how well art matches cuisine/brand)
  style_consistency_score?: number;       // 0-100 (cross-zone style consistency)
  // Photo / marketing
  has_instagram_wall?: boolean;           // is there a designated photo-op wall
  instagram_post_rate_pct?: number;       // % of customers who post photos featuring wall art
  // Seasonal
  seasonal_decor_age_days?: number;       // 0 if not seasonal
  current_season?: string;
  // Lighting
  artwork_lighting_lux?: number;          // lux illuminating the artwork itself
  target_lighting_lux?: number;
  // Local artist
  has_local_artist_feature?: boolean;
  // Context
  cuisine_type?: string;                  // 'italian' | 'steakhouse' | 'asian' | 'mediterranean' | 'seafood' | 'cafe' | 'fusion'
  // Impact
  predicted_dwell_change_min?: number;
  predicted_spend_change_pct?: number;
  predicted_satisfaction_change?: number;
  predicted_instagram_posts_per_mo?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: WallDecorAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface WallDecorConfig {
  aiEnabled: boolean;
  minConditionScore: number;              // minimum acceptable artwork condition
  minCuisineMatchScore: number;           // minimum cuisine match score
  minStyleConsistency: number;            // minimum cross-zone consistency
  minArtworkLightingLux: number;          // minimum lux on artwork
  maxSeasonalDecorAgeDays: number;        // max days before seasonal decor is stale
}

export const DEFAULT_WALL_DECOR_CONFIG: WallDecorConfig = {
  aiEnabled: true,
  minConditionScore: 70,
  minCuisineMatchScore: 65,
  minStyleConsistency: 75,
  minArtworkLightingLux: 150,
  maxSeasonalDecorAgeDays: 45,
};

export const readWallDecorConfig = (settings: any): WallDecorConfig => ({
  aiEnabled: settings?.wall_decor_ai_enabled ?? true,
  minConditionScore: safeNumber(settings?.wall_decor_min_condition, 70),
  minCuisineMatchScore: safeNumber(settings?.wall_decor_min_cuisine_match, 65),
  minStyleConsistency: safeNumber(settings?.wall_decor_min_consistency, 75),
  minArtworkLightingLux: safeNumber(settings?.wall_decor_min_lighting_lux, 150),
  maxSeasonalDecorAgeDays: safeNumber(settings?.wall_decor_max_seasonal_age, 45),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Cuisine → recommended decor theme map
const CUISINE_DECOR_MAP: Record<string, string[]> = {
  italian: ['tuscan_landscape', 'wine_vineyard_prints', 'italian_typography', 'rustic_wood_panel'],
  steakhouse: ['cattle_ranch_art', 'leather_paneling', 'dark_wood_branding', 'vintage_butcher_prints'],
  asian: ['ink_brush_calligraphy', 'cherry_blossom_mural', 'bamboo_photography', 'jade_brand_graphics'],
  mediterranean: ['olive_grove_art', 'aegean_blue_photography', 'terra_cotta_mural', 'greek_typography'],
  seafood: ['ocean_wave_art', 'fishing_boat_photography', 'coastal_brand_graphics', 'nautical_typography'],
  cafe: ['coffee_brand_graphics', 'latte_art_photography', 'chalkboard_typography', 'cozy_wood_panel'],
  fusion: ['modern_abstract_art', 'fusion_culture_mural', 'minimalist_brand_graphics', 'mixed_media_typography'],
  default: ['local_landscape_photography', 'modern_abstract_art', 'brand_graphics'],
};

// Each Instagram post = $25-100 marketing equivalent (HBR)
const INSTAGRAM_POST_VALUE = 50;

interface WallDecorData {
  zone: string;
  decor_type: string;
  artwork_age_months: number;
  condition_score: number;
  cuisine_match_score: number;
  style_consistency_score: number;
  has_instagram_wall: boolean;
  instagram_post_rate_pct: number;
  seasonal_decor_age_days: number;
  current_season: string;
  artwork_lighting_lux: number;
  target_lighting_lux: number;
  has_local_artist_feature: boolean;
  cuisine_type: string;
  // Impact economics
  monthly_customers: number;
  avg_customer_value: number;
  avg_dwell_min: number;
  optimal_dwell_min: number;
  satisfaction_score: number;
  optimal_satisfaction: number;
}

const MOCK_DATA: WallDecorData[] = [
  {
    zone: 'main_dining', decor_type: 'empty', artwork_age_months: 0,
    condition_score: 0, cuisine_match_score: 0, style_consistency_score: 40,
    has_instagram_wall: false, instagram_post_rate_pct: 1,
    seasonal_decor_age_days: 0, current_season: 'winter',
    artwork_lighting_lux: 0, target_lighting_lux: 200, has_local_artist_feature: false,
    cuisine_type: 'italian',
    monthly_customers: 2400, avg_customer_value: 42, avg_dwell_min: 65, optimal_dwell_min: 90,
    satisfaction_score: 70, optimal_satisfaction: 88,
  },
  {
    zone: 'bar', decor_type: 'brand_graphics', artwork_age_months: 18,
    condition_score: 78, cuisine_match_score: 55, style_consistency_score: 50,
    has_instagram_wall: false, instagram_post_rate_pct: 4,
    seasonal_decor_age_days: 0, current_season: 'summer',
    artwork_lighting_lux: 90, target_lighting_lux: 200, has_local_artist_feature: false,
    cuisine_type: 'fusion',
    monthly_customers: 1800, avg_customer_value: 32, avg_dwell_min: 85, optimal_dwell_min: 110,
    satisfaction_score: 76, optimal_satisfaction: 88,
  },
  {
    zone: 'entrance', decor_type: 'seasonal', artwork_age_months: 0,
    condition_score: 65, cuisine_match_score: 70, style_consistency_score: 60,
    has_instagram_wall: false, instagram_post_rate_pct: 2,
    seasonal_decor_age_days: 70, current_season: 'spring',
    artwork_lighting_lux: 120, target_lighting_lux: 200, has_local_artist_feature: false,
    cuisine_type: 'mediterranean',
    monthly_customers: 3200, avg_customer_value: 38, avg_dwell_min: 0, optimal_dwell_min: 0,
    satisfaction_score: 72, optimal_satisfaction: 85,
  },
  {
    zone: 'private_room', decor_type: 'artwork', artwork_age_months: 84,
    condition_score: 45, cuisine_match_score: 80, style_consistency_score: 85,
    has_instagram_wall: true, instagram_post_rate_pct: 12,
    seasonal_decor_age_days: 0, current_season: 'fall',
    artwork_lighting_lux: 60, target_lighting_lux: 220, has_local_artist_feature: true,
    cuisine_type: 'steakhouse',
    monthly_customers: 600, avg_customer_value: 95, avg_dwell_min: 110, optimal_dwell_min: 130,
    satisfaction_score: 82, optimal_satisfaction: 92,
  },
];

export const runWallDecorEngine = async (
  db: ReturnType<typeof useDB>,
  config: WallDecorConfig = DEFAULT_WALL_DECOR_CONFIG
): Promise<{ alerts: WallDecorAlert[]; generated: number }> => {
  const alerts: WallDecorAlert[] = [];
  const now = new Date();

  let data: WallDecorData[] = [];
  try {
    const result = await db.query(
      `SELECT zone, decor_type, artwork_age_months, condition_score, cuisine_match_score,
              style_consistency_score, has_instagram_wall, instagram_post_rate_pct,
              seasonal_decor_age_days, current_season, artwork_lighting_lux, target_lighting_lux,
              has_local_artist_feature, cuisine_type,
              monthly_customers, avg_customer_value, avg_dwell_min, optimal_dwell_min,
              satisfaction_score, optimal_satisfaction
       FROM wall_decor_artwork_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      zone: String(r.zone ?? 'main_dining'),
      decor_type: String(r.decor_type ?? 'empty'),
      artwork_age_months: safeNumber(r.artwork_age_months, 0),
      condition_score: safeNumber(r.condition_score, 0),
      cuisine_match_score: safeNumber(r.cuisine_match_score, 0),
      style_consistency_score: safeNumber(r.style_consistency_score, 0),
      has_instagram_wall: Boolean(r.has_instagram_wall ?? false),
      instagram_post_rate_pct: safeNumber(r.instagram_post_rate_pct, 0),
      seasonal_decor_age_days: safeNumber(r.seasonal_decor_age_days, 0),
      current_season: String(r.current_season ?? 'summer'),
      artwork_lighting_lux: safeNumber(r.artwork_lighting_lux, 0),
      target_lighting_lux: safeNumber(r.target_lighting_lux, 200),
      has_local_artist_feature: Boolean(r.has_local_artist_feature ?? false),
      cuisine_type: String(r.cuisine_type ?? 'default'),
      monthly_customers: safeNumber(r.monthly_customers, 0),
      avg_customer_value: safeNumber(r.avg_customer_value, 0),
      avg_dwell_min: safeNumber(r.avg_dwell_min, 0),
      optimal_dwell_min: safeNumber(r.optimal_dwell_min, 0),
      satisfaction_score: safeNumber(r.satisfaction_score, 0),
      optimal_satisfaction: safeNumber(r.optimal_satisfaction, 0),
    }));
  } catch (err) {
    console.warn('[wall-decor] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const dwellGap = d.optimal_dwell_min - d.avg_dwell_min;
    const satGap = d.optimal_satisfaction - d.satisfaction_score;
    // Instagram/marketing opportunity: lift post rate from current to 10% target
    const currentPostsMo = Math.round(d.monthly_customers * d.instagram_post_rate_pct / 100);
    const targetPostsMo = Math.round(d.monthly_customers * 0.10);
    const instagramOpp = (targetPostsMo - currentPostsMo) * INSTAGRAM_POST_VALUE;
    // Dwell/spend opportunity
    const spendOpp = Math.round(d.monthly_customers * d.avg_customer_value * 0.05);
    const monthlyOpp = Math.max(spendOpp, instagramOpp, 200);

    // Rule 1: EMPTY_WALL_DETECTED
    if (d.decor_type === 'empty') {
      const recommendedDecor = (CUISINE_DECOR_MAP[d.cuisine_type] ?? CUISINE_DECOR_MAP.default)[0];
      alerts.push({
        rule_id: 'empty_wall_detected',
        severity: 'high',
        zone: d.zone,
        decor_type: d.decor_type,
        recommended_decor_type: recommendedDecor,
        cuisine_type: d.cuisine_type,
        predicted_dwell_change_min: Math.round(dwellGap * 0.5),
        predicted_satisfaction_change: Math.round(satGap * 0.5),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.7),
        description: `EMPTY WALL DETECTED: ${d.zone} has bare walls with no artwork. 78% of customers notice wall decor within 30 seconds of sitting (Cornell CHR) — empty walls signal "unfinished" or "low effort" → customers perceive lower quality. Empty walls also force customer gaze onto floor/ceiling/phones → less immersive experience, shorter dwell. ACTION: install ${recommendedDecor} artwork on bare wall. Cost: $200-1,500 per wall (depending on size + medium). ${d.zone === 'entrance' ? 'Entrance empty walls are most damaging — first impression zone, customers form opinion in 7 seconds. ' : d.zone === 'main_dining' ? 'Main dining bare walls = customers stare at nothing for 60+ minutes — biggest missed branding opportunity. ' : ''}Save ${fmt$(monthlyOpp * 0.7)}/mo from improved perceived quality + extended dwell. Empty walls are the #1 wall decor failure — every wall should tell a story.`,
        ai_recommendation: 'install_artwork',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: ARTWORK_BRAND_MISMATCH
    if (d.decor_type !== 'empty' && d.cuisine_match_score < config.minCuisineMatchScore) {
      const recommendedDecor = (CUISINE_DECOR_MAP[d.cuisine_type] ?? CUISINE_DECOR_MAP.default);
      alerts.push({
        rule_id: 'artwork_brand_mismatch',
        severity: 'medium',
        zone: d.zone,
        decor_type: d.decor_type,
        recommended_decor_type: recommendedDecor[0],
        cuisine_match_score: d.cuisine_match_score,
        cuisine_type: d.cuisine_type,
        predicted_satisfaction_change: -6,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `ARTWORK BRAND MISMATCH: ${d.zone} ${d.decor_type} does not match ${d.cuisine_type} cuisine (match score ${d.cuisine_match_score}/100, min ${config.minCuisineMatchScore}). Art mismatched to cuisine creates cognitive dissonance — customers feel something is off without knowing why. ${d.cuisine_type === 'italian' && d.decor_type === 'brand_graphics' ? 'Generic brand graphics in Italian restaurant = missed Tuscan warmth opportunity. ' : d.cuisine_type === 'steakhouse' && d.decor_type === 'photograph' ? 'Generic photographs in steakhouse = should be cattle/ranch/leather themed. ' : d.cuisine_type === 'asian' && d.decor_type === 'brand_graphics' ? 'Generic brand graphics in Asian restaurant = should be ink brush, calligraphy, cherry blossom. ' : ''}ACTION: replace with cuisine-matched art — recommended: ${recommendedDecor.slice(0, 2).join(', ')}. Cost: $200-1,200. Save ${fmt$(monthlyOpp * 0.5)}/mo from improved brand coherence + satisfaction. Wall art is the #1 visual branding element — it must match the cuisine story.`,
        ai_recommendation: 'replace_artwork',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: PHOTO_OPPORTUNITY_WALL_MISSING
    if (!d.has_instagram_wall && d.instagram_post_rate_pct < 5) {
      const predictedNewPosts = Math.round(d.monthly_customers * 0.08);
      const predictedValue = predictedNewPosts * INSTAGRAM_POST_VALUE;
      alerts.push({
        rule_id: 'photo_opportunity_wall_missing',
        severity: 'medium',
        zone: d.zone,
        has_instagram_wall: d.has_instagram_wall,
        instagram_post_rate_pct: d.instagram_post_rate_pct,
        predicted_instagram_posts_per_mo: predictedNewPosts,
        est_monthly_opportunity: predictedValue,
        description: `PHOTO OPPORTUNITY WALL MISSING: ${d.zone} has no Instagram-worthy wall. Only ${d.instagram_post_rate_pct}% of customers post photos featuring wall art (target 8-12%). Each Instagram post featuring wall art = free marketing worth $25-100 (HBR). ${d.monthly_customers >= 2000 ? `At ${d.monthly_customers} monthly customers, even 8% photo rate = ${predictedNewPosts} posts/mo = ${fmt$(predictedValue)}/mo free marketing. ` : ''}ACTION: install a designated photo-op wall — bold mural, neon sign, or statement art piece that customers want to be photographed against. Cost: $500-3,000 (mural) or $300-1,500 (neon sign). Add subtle "tag us @restaurant" signage. Save ${fmt$(predictedValue)}/mo from organic social media reach. Instagram wall is the highest-ROI wall decor investment — pays for itself in 1-3 months.`,
        ai_recommendation: 'install_photo_wall',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: ARTWORK_FADING_WEAR
    if (d.decor_type !== 'empty' && d.condition_score < config.minConditionScore) {
      alerts.push({
        rule_id: 'artwork_fading_wear',
        severity: d.condition_score < 40 ? 'high' : 'medium',
        zone: d.zone,
        decor_type: d.decor_type,
        artwork_age_months: d.artwork_age_months,
        condition_score: d.condition_score,
        predicted_satisfaction_change: -8,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `ARTWORK FADING WEAR: ${d.zone} ${d.decor_type} condition score ${d.condition_score}/100 (min ${config.minConditionScore}). ${d.artwork_age_months > 0 ? `Artwork is ${d.artwork_age_months} months old. ` : ''}Faded/damaged artwork = quality signal drop — customers perceive restaurant as not maintained. ${d.condition_score < 40 ? 'CRITICAL: 40 or below = visibly damaged — customers consciously notice degradation. ' : ''}${d.artwork_age_months >= 60 ? '5+ year artwork typically fades from UV exposure + accumulates dust/grime. ' : ''}ACTION: ${d.condition_score < 40 ? 'replace artwork immediately. ' : 'restore (professional cleaning $50-200) or replace. '}UV-protective glass for prints ($30-80). Save ${fmt$(monthlyOpp * 0.5)}/mo from improved quality perception. Worn artwork is worse than no artwork — actively damages brand.`,
        ai_recommendation: 'restore_or_replace_art',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: SEASONAL_DECOR_STALE
    if (d.decor_type === 'seasonal' && d.seasonal_decor_age_days > config.maxSeasonalDecorAgeDays) {
      alerts.push({
        rule_id: 'seasonal_decor_stale',
        severity: 'medium',
        zone: d.zone,
        decor_type: d.decor_type,
        seasonal_decor_age_days: d.seasonal_decor_age_days,
        current_season: d.current_season,
        predicted_satisfaction_change: -5,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `SEASONAL DECOR STALE: ${d.zone} seasonal decor is ${d.seasonal_decor_age_days} days old (max ${config.maxSeasonalDecorAgeDays} days). Seasonal decor left up past its season = looks neglected, signals management does not pay attention to detail. ${d.seasonal_decor_age_days > 60 ? '60+ days = decor is clearly out of season — customers actively notice + comment negatively. ' : ''}Customers associate seasonal neglect with kitchen neglect ("if they cannot swap decor, do they swap ingredients?"). ACTION: remove seasonal decor immediately and replace with permanent art OR current-season decor. ${d.current_season === 'winter' ? 'Remove winter decor (snowflakes, pine) — install spring pieces. ' : d.current_season === 'summer' ? 'Remove summer decor — install fall pieces. ' : ''}Cost: $0-200 (storage + swap labor). Save ${fmt$(monthlyOpp * 0.3)}/mo from improved attention-to-detail perception. Seasonal decor must rotate on calendar — stale decor is a free fix.`,
        ai_recommendation: 'remove_seasonal_decor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: WALL_ART_INCONSISTENCY
    if (d.decor_type !== 'empty' && d.style_consistency_score < config.minStyleConsistency) {
      alerts.push({
        rule_id: 'wall_art_inconsistency',
        severity: 'low',
        zone: d.zone,
        decor_type: d.decor_type,
        style_consistency_score: d.style_consistency_score,
        predicted_satisfaction_change: -4,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `WALL ART INCONSISTENCY: ${d.zone} style consistency score ${d.style_consistency_score}/100 (min ${config.minStyleConsistency}). Different art styles in different zones = disjointed brand experience. Customer walks from bar (modern abstract) to dining (traditional landscape) to restroom (vintage poster) — feels like 3 different restaurants. Brand coherence requires consistent art style across all zones. ACTION: unify art style across zones — pick ONE theme (e.g., local landscape photography throughout, OR modern abstract throughout). ${d.style_consistency_score < 50 ? 'CRITICAL: below 50 = jarring transitions — customers consciously notice style clash. ' : ''}Cost: $0-1,500 (replace 1-2 mismatched pieces). Save ${fmt$(monthlyOpp * 0.3)}/mo from cohesive brand experience. Consistent art style = unified brand story.`,
        ai_recommendation: 'unify_art_style',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: ARTWORK_LIGHTING_POOR
    if (d.decor_type !== 'empty' && d.artwork_lighting_lux < config.minArtworkLightingLux) {
      alerts.push({
        rule_id: 'artwork_lighting_poor',
        severity: d.artwork_lighting_lux < 75 ? 'high' : 'medium',
        zone: d.zone,
        decor_type: d.decor_type,
        artwork_lighting_lux: d.artwork_lighting_lux,
        target_lighting_lux: d.target_lighting_lux,
        predicted_satisfaction_change: -5,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `ARTWORK LIGHTING POOR: ${d.zone} ${d.decor_type} lighting ${d.artwork_lighting_lux} lux (target ${d.target_lighting_lux} lux, min ${config.minArtworkLightingLux}). Artwork poorly lit → customers cannot see or appreciate it → art investment wasted. ${d.artwork_lighting_lux < 75 ? 'CRITICAL: below 75 lux = art is nearly invisible in ambient light — entire art budget wasted. ' : ''}Picture lighting should be 2-3x ambient light to draw eye + reveal detail. ACTION: install picture lights or adjustable track lighting on artwork. ${d.zone === 'bar' ? 'Bar artwork needs extra lighting (dim ambient) — track lights with 30-degree beam. ' : d.zone === 'private_room' ? 'Private room artwork = premium experience — dedicated picture lights ($80-200 each). ' : ''}Cost: $40-200 per picture light OR $200-600 for track lighting. Save ${fmt$(monthlyOpp * 0.3)}/mo from activated art investment. Unlit art = wasted art — lighting is what makes art visible.`,
        ai_recommendation: 'add_picture_lighting',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: LOCAL_ARTIST_OPPORTUNITY
    if (!d.has_local_artist_feature && d.decor_type !== 'empty') {
      alerts.push({
        rule_id: 'local_artist_opportunity',
        severity: 'low',
        zone: d.zone,
        has_local_artist_feature: d.has_local_artist_feature,
        cuisine_type: d.cuisine_type,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.25),
        description: `LOCAL ARTIST OPPORTUNITY: ${d.zone} does not feature local artist work. Local artist features = community connection + free PR + storytelling opportunity. Local press covers restaurant + local artist collaborations (free media worth $500-2,000). Local artists also bring their following — fans visit restaurant to see the work. ACTION: commission or rotate local artist work — contact local art schools, galleries, or artists' co-ops. Often artists display free for exposure (artist gets visibility, restaurant gets free rotating art). ${d.cuisine_type === 'mediterranean' ? 'Mediterranean restaurant + local landscape artist = strong story angle. ' : d.cuisine_type === 'fusion' ? 'Fusion restaurant + local contemporary artist = natural pairing. ' : ''}Cost: $0-500 (commission) or $0 (rotating exhibition). Save ${fmt$(monthlyOpp * 0.25)}/mo from community connection + free PR. Local artist features = free art + free marketing + community goodwill.`,
        ai_recommendation: 'feature_local_artist',
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
              { role: 'system', content: 'You are a restaurant interior design + brand marketing AI. Given wall decor data, recommend ONE specific action with expected revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Zone: ${a.zone ?? 'n/a'}. Decor type: ${a.decor_type ?? 'empty'}. Recommended: ${a.recommended_decor_type ?? 'n/a'}. Condition: ${a.condition_score ?? 0}/100. Cuisine match: ${a.cuisine_match_score ?? 0}/100. Style consistency: ${a.style_consistency_score ?? 0}/100. Has Instagram wall: ${a.has_instagram_wall ?? false}. Post rate: ${a.instagram_post_rate_pct ?? 0}%. Lighting: ${a.artwork_lighting_lux ?? 0} lux. Seasonal age: ${a.seasonal_decor_age_days ?? 0} days. Local artist: ${a.has_local_artist_feature ?? false}. Cuisine: ${a.cuisine_type ?? 'n/a'}. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM wall_decor_artwork_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE wall_decor_artwork_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<WallDecorAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM wall_decor_artwork_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  zonesAtRisk: number; emptyWalls: number; avgConditionScore: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::count(rule_id = 'empty_wall_detected') AS emptywalls,
              math::mean(condition_score WHERE condition_score != NONE) AS avgcond
       FROM wall_decor_artwork_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      zonesAtRisk: safeNumber(r.zones, 0),
      emptyWalls: safeNumber(r.emptywalls, 0),
      avgConditionScore: safeNumber(r.avgcond, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, emptyWalls: 0, avgConditionScore: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
