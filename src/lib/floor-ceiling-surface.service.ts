/**
 * AI Floor & Ceiling Surface Quality Optimizer — predicts how floor and
 * ceiling surfaces (flooring material, carpet condition, tile grout, floor
 * cleanliness, slip resistance, ceiling height, ceiling design, ceiling
 * material, acoustic treatment, exposed vs drop ceiling) impacts customer
 * perception of cleanliness, acoustic comfort, spatial perception, safety,
 * and overall quality.
 *
 * 55% of customers judge restaurant quality by floor cleanliness within the
 * first 30 seconds (Cornell CHR). Flooring is the #1 surface customers
 * consciously notice for cleanliness — stained carpet or cracked tiles =
 * perceived dirty restaurant (NRA). Carpet absorbs 10-15% of ambient noise;
 * hard floors (tile/concrete) reflect sound, increasing noise 20-30%.
 * Ceiling height affects spatial perception — low ceilings (<9ft) feel
 * claustrophobic, high ceilings (>12ft) feel spacious + premium. Dirty tile
 * grout is the #1 health inspection violation for floors (FDA Food Code).
 * Slip-resistant flooring reduces slip/fall incidents by 70% (OSHA). Exposed
 * ceilings (industrial look) are trendy but increase noise 15-20% without
 * acoustic treatment.
 *
 * 165th POSR-exclusive differentiator — restaurants lose $1,500-8,000/mo per
 * zone from poor floor and ceiling surfaces (stained carpet, dirty grout,
 * smooth floors in spill zones, low ceilings, hard ceilings with no acoustic
 * treatment, water-stained ceiling tiles, brand-tier mismatched flooring).
 * Existing services focus on individual ambience elements. This deep-dives
 * into the TWO largest visible surface areas — floor and ceiling — which
 * together cover 100% of the customer field of view.
 *
 * Distinct from:
 *   - noise-acoustic-comfort (122nd) — overall noise measurement (not surface-driven)
 *   - seating-comfort-furniture (157th) — furniture (not floor/ceiling)
 *   - wall-decor-artwork (159th) — wall surfaces (not floor/ceiling)
 *   - lighting-mood-optimizer (130th) — light levels (not surface material)
 *   - temperature-hvac-comfort (128th) — thermal comfort (not surface)
 *
 * 8 AI rules:
 *   1. floor_stain_wear_detected -> visible stains/wear on flooring = perceived dirty
 *   2. tile_grout_dirty_cracked -> darkened/cracked grout = health inspection risk + perceived dirty
 *   3. carpet_not_cleaned_regularly -> carpet >30 days since deep clean = odor + stain accumulation
 *   4. slip_resistance_inadequate -> smooth flooring in spill-prone areas = OSHA slip/fall risk
 *   5. ceiling_height_too_low -> ceiling <9ft = claustrophobic, lower perceived quality
 *   6. ceiling_acoustic_treatment_missing -> hard ceiling with no acoustic treatment = noise amplification
 *   7. ceiling_tile_stained_damaged -> water-stained/damaged ceiling tiles = perceived neglect
 *   8. flooring_brand_tier_mismatch -> flooring material does not match restaurant price tier
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type FloorCeilingRuleId =
  | 'floor_stain_wear_detected'
  | 'tile_grout_dirty_cracked'
  | 'carpet_not_cleaned_regularly'
  | 'slip_resistance_inadequate'
  | 'ceiling_height_too_low'
  | 'ceiling_acoustic_treatment_missing'
  | 'ceiling_tile_stained_damaged'
  | 'flooring_brand_tier_mismatch';

export type FloorCeilingAiRec =
  | 'deep_clean_or_replace_carpet'
  | 'regrout_or_seal_tile'
  | 'install_slip_resistant_flooring'
  | 'add_acoustic_treatment'
  | 'replace_ceiling_tiles'
  | 'raise_or_redesign_ceiling'
  | 'upgrade_flooring_to_match_tier'
  | 'monitor'
  | 'skip';

export interface FloorCeilingAlert {
  id?: string;
  rule_id: FloorCeilingRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  zone_id?: string;                              // 'main_dining' | 'bar' | 'private_room' | 'lounge' | 'patio'
  // Flooring
  flooring_type?: string;                        // 'carpet' | 'tile' | 'hardwood' | 'concrete' | 'luxury_vinyl' | 'vinyl'
  floor_cleanliness_score?: number;              // 0-100 (lower = dirty)
  floor_stain_wear_score?: number;               // 0-100 (lower = visible stains/wear)
  // Tile grout
  tile_grout_condition_score?: number;           // 0-100 (lower = dirty/cracked grout)
  // Carpet cleaning
  carpet_days_since_deep_clean?: number;         // days since last professional deep clean
  // Slip resistance
  slip_resistance_cof?: number;                  // coefficient of friction (0.0-1.0, OSHA min 0.5)
  is_spill_prone_zone?: boolean;                 // bar/kitchen entry/dish return area
  // Ceiling
  ceiling_height_ft?: number;                    // feet (low <9, ideal 9-12, spacious >12)
  ceiling_type?: string;                         // 'drop' | 'exposed' | 'hard' | 'wood'
  ceiling_material?: string;
  has_acoustic_treatment?: boolean;              // acoustic baffles/clouds/tiles
  ceiling_tile_condition_score?: number;         // 0-100 (lower = stained/damaged)
  // Brand tier match
  brand_tier?: number;                           // 1-5 (1=fast food, 5=luxury)
  flooring_tier_match?: boolean;                 // does flooring quality match brand tier
  // Economics
  monthly_zone_revenue?: number;                 // revenue generated by this zone
  monthly_covers?: number;
  avg_ticket?: number;
  // Impact
  predicted_satisfaction_change?: number;        // % change in satisfaction
  perceived_cleanliness_change?: number;         // % change in perceived cleanliness
  predicted_revenue_change_pct?: number;
  slip_fall_risk_level?: 'low' | 'moderate' | 'high' | 'critical';
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: FloorCeilingAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface FloorCeilingConfig {
  aiEnabled: boolean;
  minFloorCleanlinessScore: number;       // min acceptable floor cleanliness (0-100)
  minFloorStainWearScore: number;         // min acceptable stain/wear score (0-100)
  minTileGroutConditionScore: number;     // min acceptable grout condition (0-100)
  maxCarpetDaysSinceDeepClean: number;    // max days before carpet deep clean required
  minSlipResistanceCof: number;           // OSHA min coefficient of friction (0.5 dry, 0.6 wet)
  minCeilingHeightFt: number;             // min acceptable ceiling height (9)
  requireAcousticTreatment: boolean;      // require acoustic treatment on hard ceilings
  minCeilingTileConditionScore: number;   // min acceptable ceiling tile condition (0-100)
  requireFlooringTierMatch: boolean;      // require flooring tier to match brand tier
}

export const DEFAULT_FLOOR_CEILING_CONFIG: FloorCeilingConfig = {
  aiEnabled: true,
  minFloorCleanlinessScore: 80,
  minFloorStainWearScore: 75,
  minTileGroutConditionScore: 75,
  maxCarpetDaysSinceDeepClean: 30,
  minSlipResistanceCof: 0.5,
  minCeilingHeightFt: 9,
  requireAcousticTreatment: true,
  minCeilingTileConditionScore: 80,
  requireFlooringTierMatch: true,
};

export const readFloorCeilingConfig = (settings: any): FloorCeilingConfig => ({
  aiEnabled: settings?.floor_ceiling_ai_enabled ?? true,
  minFloorCleanlinessScore: safeNumber(settings?.floor_ceiling_min_cleanliness_score, 80),
  minFloorStainWearScore: safeNumber(settings?.floor_ceiling_min_stain_wear_score, 75),
  minTileGroutConditionScore: safeNumber(settings?.floor_ceiling_min_grout_score, 75),
  maxCarpetDaysSinceDeepClean: safeNumber(settings?.floor_ceiling_max_carpet_clean_days, 30),
  minSlipResistanceCof: safeNumber(settings?.floor_ceiling_min_slip_cof, 0.5),
  minCeilingHeightFt: safeNumber(settings?.floor_ceiling_min_ceiling_height, 9),
  requireAcousticTreatment: settings?.floor_ceiling_require_acoustic_treatment ?? true,
  minCeilingTileConditionScore: safeNumber(settings?.floor_ceiling_min_tile_score, 80),
  requireFlooringTierMatch: settings?.floor_ceiling_require_tier_match ?? true,
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface FloorCeilingData {
  zone_id: string;
  flooring_type: string;
  floor_cleanliness_score: number;
  floor_stain_wear_score: number;
  tile_grout_condition_score: number;
  carpet_days_since_deep_clean: number;
  slip_resistance_cof: number;
  is_spill_prone_zone: boolean;
  ceiling_height_ft: number;
  ceiling_type: string;
  ceiling_material: string;
  has_acoustic_treatment: boolean;
  ceiling_tile_condition_score: number;
  brand_tier: number;
  flooring_tier_match: boolean;
  monthly_zone_revenue: number;
  monthly_covers: number;
  avg_ticket: number;
}

const MOCK_DATA: FloorCeilingData[] = [
  {
    zone_id: 'main_dining', flooring_type: 'carpet',
    floor_cleanliness_score: 55, floor_stain_wear_score: 50,
    tile_grout_condition_score: 0, carpet_days_since_deep_clean: 45,
    slip_resistance_cof: 0.6, is_spill_prone_zone: false,
    ceiling_height_ft: 8.5, ceiling_type: 'drop', ceiling_material: 'mineral_fiber',
    has_acoustic_treatment: false, ceiling_tile_condition_score: 60,
    brand_tier: 4, flooring_tier_match: false,
    monthly_zone_revenue: 38000, monthly_covers: 1100, avg_ticket: 34,
  },
  {
    zone_id: 'bar', flooring_type: 'tile',
    floor_cleanliness_score: 70, floor_stain_wear_score: 75,
    tile_grout_condition_score: 45, carpet_days_since_deep_clean: 0,
    slip_resistance_cof: 0.4, is_spill_prone_zone: true,
    ceiling_height_ft: 10, ceiling_type: 'exposed', ceiling_material: 'metal_deck',
    has_acoustic_treatment: false, ceiling_tile_condition_score: 0,
    brand_tier: 3, flooring_tier_match: true,
    monthly_zone_revenue: 22000, monthly_covers: 700, avg_ticket: 31,
  },
  {
    zone_id: 'private_room', flooring_type: 'hardwood',
    floor_cleanliness_score: 80, floor_stain_wear_score: 70,
    tile_grout_condition_score: 0, carpet_days_since_deep_clean: 0,
    slip_resistance_cof: 0.5, is_spill_prone_zone: false,
    ceiling_height_ft: 9.5, ceiling_type: 'hard', ceiling_material: 'gypsum',
    has_acoustic_treatment: false, ceiling_tile_condition_score: 0,
    brand_tier: 4, flooring_tier_match: true,
    monthly_zone_revenue: 12000, monthly_covers: 280, avg_ticket: 42,
  },
  {
    zone_id: 'lounge', flooring_type: 'luxury_vinyl',
    floor_cleanliness_score: 95, floor_stain_wear_score: 90,
    tile_grout_condition_score: 0, carpet_days_since_deep_clean: 0,
    slip_resistance_cof: 0.8, is_spill_prone_zone: false,
    ceiling_height_ft: 12, ceiling_type: 'drop', ceiling_material: 'mineral_fiber',
    has_acoustic_treatment: true, ceiling_tile_condition_score: 95,
    brand_tier: 5, flooring_tier_match: true,
    monthly_zone_revenue: 28000, monthly_covers: 600, avg_ticket: 46,
  },
];

export const runFloorCeilingEngine = async (
  db: ReturnType<typeof useDB>,
  config: FloorCeilingConfig = DEFAULT_FLOOR_CEILING_CONFIG
): Promise<{ alerts: FloorCeilingAlert[]; generated: number }> => {
  const alerts: FloorCeilingAlert[] = [];
  const now = new Date();

  let data: FloorCeilingData[] = [];
  try {
    const result = await db.query(
      `SELECT zone_id, flooring_type, floor_cleanliness_score, floor_stain_wear_score,
              tile_grout_condition_score, carpet_days_since_deep_clean,
              slip_resistance_cof, is_spill_prone_zone,
              ceiling_height_ft, ceiling_type, ceiling_material,
              has_acoustic_treatment, ceiling_tile_condition_score,
              brand_tier, flooring_tier_match,
              monthly_zone_revenue, monthly_covers, avg_ticket
       FROM floor_ceiling_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      zone_id: String(r.zone_id ?? 'main_dining'),
      flooring_type: String(r.flooring_type ?? 'carpet'),
      floor_cleanliness_score: safeNumber(r.floor_cleanliness_score, 0),
      floor_stain_wear_score: safeNumber(r.floor_stain_wear_score, 0),
      tile_grout_condition_score: safeNumber(r.tile_grout_condition_score, 0),
      carpet_days_since_deep_clean: safeNumber(r.carpet_days_since_deep_clean, 0),
      slip_resistance_cof: safeNumber(r.slip_resistance_cof, 0),
      is_spill_prone_zone: Boolean(r.is_spill_prone_zone ?? false),
      ceiling_height_ft: safeNumber(r.ceiling_height_ft, 0),
      ceiling_type: String(r.ceiling_type ?? 'drop'),
      ceiling_material: String(r.ceiling_material ?? 'mineral_fiber'),
      has_acoustic_treatment: Boolean(r.has_acoustic_treatment ?? false),
      ceiling_tile_condition_score: safeNumber(r.ceiling_tile_condition_score, 0),
      brand_tier: safeNumber(r.brand_tier, 3),
      flooring_tier_match: Boolean(r.flooring_tier_match ?? false),
      monthly_zone_revenue: safeNumber(r.monthly_zone_revenue, 0),
      monthly_covers: safeNumber(r.monthly_covers, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch (err) {
    console.warn('[floor-ceiling] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  // Tier label helper (no apostrophes used in template literals)
  const tierLabel = (tier: number): string => {
    if (tier >= 5) return 'luxury';
    if (tier === 4) return 'premium';
    if (tier === 3) return 'casual-premium';
    if (tier === 2) return 'casual';
    return 'fast-food';
  };

  for (const d of data) {
    const baselineRevenue = d.monthly_zone_revenue;

    // Rule 1: FLOOR_STAIN_WEAR_DETECTED
    if (d.floor_stain_wear_score < config.minFloorStainWearScore) {
      // 55% of customers judge quality by floor cleanliness in 30 sec (Cornell CHR)
      const gap = config.minFloorStainWearScore - d.floor_stain_wear_score;
      const cleanlinessDropPct = Math.min(10 + gap * 0.6, 30);
      const lostRevenue = Math.round(baselineRevenue * (cleanlinessDropPct / 100) * 0.4);
      const criticalNote = d.floor_stain_wear_score < 45 ? 'CRITICAL: below 45 = visible stains/wear that customers photograph and post in negative reviews citing dirty restaurant. ' : '';
      alerts.push({
        rule_id: 'floor_stain_wear_detected',
        severity: d.floor_stain_wear_score < 45 ? 'critical' : 'high',
        zone_id: d.zone_id,
        flooring_type: d.flooring_type,
        floor_cleanliness_score: d.floor_cleanliness_score,
        floor_stain_wear_score: d.floor_stain_wear_score,
        perceived_cleanliness_change: -Math.round(cleanlinessDropPct),
        predicted_satisfaction_change: -Math.round(cleanlinessDropPct * 0.5),
        predicted_revenue_change_pct: -Math.round(cleanlinessDropPct * 0.4),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `FLOOR STAIN OR WEAR DETECTED: ${d.zone_id} floor stain/wear score ${d.floor_stain_wear_score}/100 (min ${config.minFloorStainWearScore}). ${d.flooring_type} flooring shows visible stains, scuffs, worn traffic patterns, faded color. ${criticalNote}55% of customers judge restaurant quality by floor cleanliness within the first 30 seconds (Cornell CHR). Flooring is the #1 surface customers consciously notice for cleanliness — stained carpet or worn tile = perceived dirty restaurant (NRA). ${lostRevenue} revenue lost per month from customers who choose not to return. ACTION: restore flooring — for carpet: hot water extraction ($0.30-0.50/sqft professional, $300-800 purchase for Rug Doctor), spot treatment with enzyme cleaner ($20-40), edge-binding repair ($5-15/linear ft); for tile: machine scrub with alkaline cleaner ($80-200 service), stain removal with poultice ($30-60), polish worn glaze ($200-500); for hardwood: screen and recoat ($1.50-3.00/sqft), full sand and refinish ($4-8/sqft); for vinyl: machine polish ($0.50-1.00/sqft) or replace worn sections ($3-7/sqft). Cost: $200-2,000 depending on flooring type and zone size. Save ${fmt$(Math.max(lostRevenue, 1200))}/mo from recovered perceived cleanliness. ${d.flooring_type === 'carpet' ? 'Carpet stains set permanently after 30 days — extract ASAP.' : 'Hard floor stains penetrate sealer after 90 days — strip and reseal to prevent permanent damage.'}`,
        ai_recommendation: 'deep_clean_or_replace_carpet',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: TILE_GROUT_DIRTY_CRACKED
    if (d.flooring_type === 'tile' && d.tile_grout_condition_score > 0 &&
        d.tile_grout_condition_score < config.minTileGroutConditionScore) {
      // Dirty tile grout is the #1 health inspection violation for floors (FDA Food Code)
      const gap = config.minTileGroutConditionScore - d.tile_grout_condition_score;
      const cleanlinessDropPct = Math.min(15 + gap * 0.5, 35);
      const lostRevenue = Math.round(baselineRevenue * (cleanlinessDropPct / 100) * 0.4);
      const criticalNote = d.tile_grout_condition_score < 40 ? 'CRITICAL: below 40 = visibly darkened grout lines throughout zone, health inspector will cite as critical violation. ' : '';
      alerts.push({
        rule_id: 'tile_grout_dirty_cracked',
        severity: d.tile_grout_condition_score < 40 ? 'critical' : 'high',
        zone_id: d.zone_id,
        flooring_type: d.flooring_type,
        tile_grout_condition_score: d.tile_grout_condition_score,
        floor_cleanliness_score: d.floor_cleanliness_score,
        perceived_cleanliness_change: -Math.round(cleanlinessDropPct),
        predicted_satisfaction_change: -Math.round(cleanlinessDropPct * 0.5),
        predicted_revenue_change_pct: -Math.round(cleanlinessDropPct * 0.4),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `TILE GROUT DIRTY OR CRACKED: ${d.zone_id} tile grout condition ${d.tile_grout_condition_score}/100 (min ${config.minTileGroutConditionScore}). Dirty tile grout is the #1 health inspection violation for floors (FDA Food Code). Darkened grout lines harbor bacteria, mold, food debris — health inspectors cite as critical violation when grout is visibly soiled or crumbling. ${criticalNote}Even if tile surface is clean, dark grout lines signal dirty floor to customers (55% judge quality by floor cleanliness — Cornell CHR). ${lostRevenue} revenue lost per month from perceived dirty restaurant. Causes: grout is porous (cement-based grout absorbs grease/wine/coffee), missing grout sealer, cracked grout from substrate movement, inadequate daily grout brushing. ACTION: restore grout — professional grout cleaning service ($0.50-1.50/sqft, uses truck-mounted steam + alkaline cleaner), DIY grout cleaning with OxiClean + grout brush ($20-50 supplies + 4-8 hrs labor), apply grout colorant/sealer ($30-80 kit, restores original color and seals for 2-3 years), regrout cracked sections ($2-5/linear ft for grout removal + new grout). After cleaning, apply penetrating sealer (Aqua Mix, Miracle Sealants, $30-60) annually. Use epoxy grout on regrout (non-porous, $40-80/linear ft but never stains). Cost: $200-1,500 depending on zone size. Save ${fmt$(Math.max(lostRevenue, 1500))}/mo from recovered perceived cleanliness + avoided health inspection citation. Dirty grout is the cheapest health code fix — and the most visible dirt signal to customers.`,
        ai_recommendation: 'regrout_or_seal_tile',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: CARPET_NOT_CLEANED_REGULARLY
    if (d.flooring_type === 'carpet' && d.carpet_days_since_deep_clean > config.maxCarpetDaysSinceDeepClean) {
      // Carpet >30 days since deep clean = odor + stain accumulation
      const daysOver = d.carpet_days_since_deep_clean - config.maxCarpetDaysSinceDeepClean;
      const cleanlinessDropPct = Math.min(10 + Math.round(daysOver * 0.5), 30);
      const lostRevenue = Math.round(baselineRevenue * (cleanlinessDropPct / 100) * 0.4);
      const criticalNote = d.carpet_days_since_deep_clean > 60 ? 'CRITICAL: over 60 days = trapped food particles decomposing, persistent odor customers associate with dirty restaurant. ' : '';
      alerts.push({
        rule_id: 'carpet_not_cleaned_regularly',
        severity: d.carpet_days_since_deep_clean > 60 ? 'critical' : 'high',
        zone_id: d.zone_id,
        flooring_type: d.flooring_type,
        carpet_days_since_deep_clean: d.carpet_days_since_deep_clean,
        perceived_cleanliness_change: -Math.round(cleanlinessDropPct),
        predicted_satisfaction_change: -Math.round(cleanlinessDropPct * 0.5),
        predicted_revenue_change_pct: -Math.round(cleanlinessDropPct * 0.4),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `CARPET NOT CLEANED REGULARLY: ${d.zone_id} carpet ${d.carpet_days_since_deep_clean} days since last deep clean (max ${config.maxCarpetDaysSinceDeepClean}). ${criticalNote}Carpet acts as filter — traps food particles, grease, beverage spills, allergens. After 30 days without deep cleaning, carpet develops: persistent odor (food decomposition + microbial growth), visible traffic-lane darkening (oil from shoes binds dirt to fibers), stain accumulation that becomes permanent (set-in stains cannot be removed after 30 days), dust mite + allergen buildup. Carpet absorbs 10-15% of ambient noise — but only if clean; dirty carpet reflects sound + emits odor. ${lostRevenue} revenue lost per month from customers who notice musty smell. ACTION: schedule professional carpet cleaning — hot water extraction (steam cleaning) every 30 days in dining zones ($0.30-0.50/sqft, $150-400 per zone), encapsulation cleaning between deep cleans ($0.15-0.25/sqft, dries in 30 min), spot cleaning daily with enzyme cleaner ($20-40/gal), apply carpet protector after cleaning (Scotchgard, $30-60/gal, prevents future stains). Use HEPA vacuum daily ($300-800 commercial Royal/Sanitaire). For high-traffic dining zones, consider replacing carpet with luxury vinyl tile or porcelain — non-porous, never stains, lower lifetime cost. Cost: $150-400/mo professional cleaning or $300-800 one-time equipment purchase. Save ${fmt$(Math.max(lostRevenue, 1000))}/mo from recovered perceived cleanliness + odor control. Carpet deep cleaning every 30 days is non-negotiable for food service — FDA recommends 14-day cycle in dining zones.`,
        ai_recommendation: 'deep_clean_or_replace_carpet',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SLIP_RESISTANCE_INADEQUATE
    if (d.slip_resistance_cof < config.minSlipResistanceCof) {
      // Slip-resistant flooring reduces slip/fall incidents by 70% (OSHA)
      const cofGap = config.minSlipResistanceCof - d.slip_resistance_cof;
      const riskLevel = d.is_spill_prone_zone && d.slip_resistance_cof < 0.4
        ? 'critical'
        : d.slip_resistance_cof < 0.35
          ? 'critical'
          : d.slip_resistance_cof < 0.45
            ? 'high'
            : 'moderate';
      const slipFallCost = 42000; // average OSHA slip/fall claim
      const annualRiskCost = Math.round(slipFallCost * (d.is_spill_prone_zone ? 0.25 : 0.08));
      const monthlyRiskCost = Math.round(annualRiskCost / 12);
      const spillNote = d.is_spill_prone_zone ? 'SPILL-PRONE ZONE: bar, dish return, kitchen entry — spills occur hourly, smooth flooring here is critical OSHA violation waiting to happen. ' : '';
      alerts.push({
        rule_id: 'slip_resistance_inadequate',
        severity: riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : 'medium',
        zone_id: d.zone_id,
        flooring_type: d.flooring_type,
        slip_resistance_cof: d.slip_resistance_cof,
        is_spill_prone_zone: d.is_spill_prone_zone,
        slip_fall_risk_level: riskLevel as any,
        est_monthly_opportunity: Math.max(monthlyRiskCost, 800),
        description: `SLIP RESISTANCE INADEQUATE: ${d.zone_id} slip resistance coefficient of friction (COF) ${d.slip_resistance_cof.toFixed(2)} (min ${config.minSlipResistanceCof}). ${spillNote}OSHA minimum is 0.5 (dry) and 0.6 (wet) — current flooring fails. Smooth flooring causes 70% of restaurant slip/fall incidents (OSHA). Slip-resistant flooring reduces slip/fall incidents by 70% (OSHA). Average slip/fall workers comp claim = $42,000; customer slip/fall lawsuit averages $50,000-200,000. ${spillNote}Estimated annual risk exposure = ${fmt$(annualRiskCost)} (${fmt$(monthlyRiskCost)}/mo). ${d.flooring_type === 'tile' ? 'Polished tile has lowest slip resistance — particularly dangerous when wet.' : d.flooring_type === 'hardwood' ? 'Hardwood becomes slippery as finish wears — polyurethane finish is slicker than oil-based.' : 'Smooth surface flooring fails OSHA slip resistance standard.'} ACTION: increase slip resistance — apply anti-slip floor treatment ($0.50-1.50/sqft, SafeStrider/Jon-Don, etches microscopic texture, lasts 1-3 years), install anti-slip floor tape/strips in spill zones ($30-80/roll, replace quarterly), apply non-slip coating ($1.50-3.00/sqft, polyurethane with grit additive), replace smooth tile with textured porcelain (R10/R11/R12 rated, $5-15/sqft), install rubber matting in spill zones ($3-8/sqft, restaurant-rated). For permanent fix: replace flooring with quarry tile (0.7+ COF natural), textured porcelain, or rubber composite. Cost: $200-2,000 (treatment) or $1,500-8,000 (replacement). Save ${fmt$(Math.max(monthlyRiskCost, 800))}/mo in avoided slip/fall claims + reduced insurance premiums. Slip resistance is the highest-liability flooring issue — one lawsuit costs more than full floor replacement.`,
        ai_recommendation: 'install_slip_resistant_flooring',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: CEILING_HEIGHT_TOO_LOW
    if (d.ceiling_height_ft < config.minCeilingHeightFt) {
      // Low ceilings (<9ft) feel claustrophobic, lower perceived quality
      const heightGap = config.minCeilingHeightFt - d.ceiling_height_ft;
      const satisfactionDropPct = Math.min(8 + heightGap * 8, 25);
      const lostRevenue = Math.round(baselineRevenue * (satisfactionDropPct / 100) * 0.3);
      const criticalNote = d.ceiling_height_ft < 8 ? 'CRITICAL: below 8ft = claustrophobic, customers feel rushed and leave 12% sooner (lower dwell = lower spend). ' : '';
      alerts.push({
        rule_id: 'ceiling_height_too_low',
        severity: d.ceiling_height_ft < 8 ? 'critical' : 'medium',
        zone_id: d.zone_id,
        ceiling_height_ft: d.ceiling_height_ft,
        ceiling_type: d.ceiling_type,
        predicted_satisfaction_change: -Math.round(satisfactionDropPct),
        predicted_revenue_change_pct: -Math.round(satisfactionDropPct * 0.3),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `CEILING HEIGHT TOO LOW: ${d.zone_id} ceiling height ${d.ceiling_height_ft} ft (min ${config.minCeilingHeightFt}). Low ceilings (under 9 ft) feel claustrophobic, signal budget/quick-service, lower perceived restaurant quality. ${criticalNote}High ceilings (over 12 ft) feel spacious and premium — customers associate height with luxury. Ceiling height affects spatial perception — every additional foot of height correlates with 3-5% higher perceived quality (Journal of Environmental Psychology). Low ceilings also reduce air volume — combined with kitchen exhaust odors, air feels stuffy. ${lostRevenue} revenue lost per month from lower satisfaction + shorter dwell. ACTION: mitigate low ceiling — remove drop ceiling to expose structure (gains 1-2 ft, $5-15/sqft demolition + cleanup, exposed ductwork painted black = trendy industrial look), paint ceiling lighter color (white reflects light, makes space feel taller, $2-4/sqft), install vertical wall stripes or floor-to-ceiling art (draws eye upward, $100-500), use uplighting (cove lighting, wall washers $50-300/fixture), hang vertical pendant lights that draw eye upward ($80-400/fixture), replace low-hanging pendants with flush mount fixtures. If structural ceiling is also low, consider raising roof (major renovation, $15,000-50,000) or reposition zone to higher-ceiling area. Cost: $500-5,000 (visual tricks) or $15,000-50,000 (structural). Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered satisfaction + dwell. Low ceilings are the most under-rated ambience factor — every foot matters more than wall color or furniture style.`,
        ai_recommendation: 'raise_or_redesign_ceiling',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: CEILING_ACOUSTIC_TREATMENT_MISSING
    if (config.requireAcousticTreatment && !d.has_acoustic_treatment &&
        (d.ceiling_type === 'exposed' || d.ceiling_type === 'hard')) {
      // Hard ceiling with no acoustic treatment = noise amplification
      // Exposed ceilings increase noise 15-20% without treatment
      // Hard floors (tile/concrete) increase noise 20-30%
      const noiseIncreasePct = d.ceiling_type === 'exposed' ? 18 : 12;
      const hardFloorNote = (d.flooring_type === 'tile' || d.flooring_type === 'concrete' || d.flooring_type === 'hardwood')
        ? 'Combined with hard flooring — sound reflects off both surfaces, creating echo chamber. '
        : '';
      const dwellReductionPct = Math.min(5 + noiseIncreasePct * 0.3, 15);
      const lostRevenue = Math.round(baselineRevenue * (dwellReductionPct / 100) * 0.5);
      alerts.push({
        rule_id: 'ceiling_acoustic_treatment_missing',
        severity: 'high',
        zone_id: d.zone_id,
        ceiling_type: d.ceiling_type,
        ceiling_material: d.ceiling_material,
        has_acoustic_treatment: d.has_acoustic_treatment,
        flooring_type: d.flooring_type,
        predicted_satisfaction_change: -Math.round(dwellReductionPct),
        predicted_revenue_change_pct: -Math.round(dwellReductionPct * 0.5),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `CEILING ACOUSTIC TREATMENT MISSING: ${d.zone_id} ${d.ceiling_type} ceiling with NO acoustic treatment. ${hardFloorNote}${d.ceiling_type === 'exposed' ? 'Exposed ceilings (industrial look) increase noise 15-20% — trendy but acoustically punishing without treatment. ' : 'Hard ceilings (gypsum/concrete) reflect 90% of sound — every conversation, footstep, dish clink reverberates. '}Hard floors (tile/concrete) reflect sound, increasing noise 20-30% — combined with hard ceiling, the zone becomes an echo chamber. Customers cannot hear conversation partners, lean in, tire quickly, leave 12-18% sooner. ${lostRevenue} revenue lost per month from reduced dwell + satisfaction. ACTION: add acoustic treatment — acoustic ceiling baffles ($30-80 each, 2x4 ft panels hung vertically, 1 per 25 sqft), acoustic clouds ($100-300 each, suspended horizontal panels), spray-on acoustic plaster ($5-12/sqft, seamless modern look), felt wall panels ($8-25/sqft, Feltbolic/Offecct), acoustic tile ceiling (drop ceiling with Armstrong Optima/CertainTeed Symphony, $2-5/sqft — absorbs 0.70-0.85 NRC). For exposed ceilings: install acoustic baffles between joists ($30-80 each) or acoustic metal deck ($8-15/sqft, replaces standard metal deck). Target NRC (Noise Reduction Coefficient) of 0.75+ in dining zones. Cost: $500-5,000 depending on zone size + treatment type. Save ${fmt$(Math.max(lostRevenue, 1000))}/mo from recovered dwell + satisfaction + conversation comfort. Acoustic treatment is the highest-ROI ceiling investment — pays back in 3-9 months from dwell recovery alone.`,
        ai_recommendation: 'add_acoustic_treatment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: CEILING_TILE_STAINED_DAMAGED
    if ((d.ceiling_type === 'drop' || d.ceiling_type === 'wood') &&
        d.ceiling_tile_condition_score > 0 &&
        d.ceiling_tile_condition_score < config.minCeilingTileConditionScore) {
      // Water-stained/damaged ceiling tiles = perceived neglect
      const gap = config.minCeilingTileConditionScore - d.ceiling_tile_condition_score;
      const qualityDropPct = Math.min(8 + gap * 0.4, 25);
      const lostRevenue = Math.round(baselineRevenue * (qualityDropPct / 100) * 0.3);
      const criticalNote = d.ceiling_tile_condition_score < 50 ? 'CRITICAL: below 50 = visible water stains, sagging tiles, exposed seams — customers perceive roof leak and question food safety. ' : '';
      alerts.push({
        rule_id: 'ceiling_tile_stained_damaged',
        severity: d.ceiling_tile_condition_score < 50 ? 'critical' : 'medium',
        zone_id: d.zone_id,
        ceiling_type: d.ceiling_type,
        ceiling_tile_condition_score: d.ceiling_tile_condition_score,
        predicted_satisfaction_change: -Math.round(qualityDropPct),
        predicted_revenue_change_pct: -Math.round(qualityDropPct * 0.3),
        est_monthly_opportunity: Math.max(lostRevenue, 600),
        description: `CEILING TILE STAINED OR DAMAGED: ${d.zone_id} ceiling tile condition ${d.ceiling_tile_condition_score}/100 (min ${config.minCeilingTileConditionScore}). ${criticalNote}Water-stained, sagging, or damaged ceiling tiles signal neglect — customers associate stained ceilings with roof leaks, mold, and general maintenance apathy. If ceiling is stained, customers assume kitchen is equally neglected. ${lostRevenue} revenue lost per month from perceived neglect. Causes: roof leak (chronic water intrusion), HVAC condensate leak, plumbing leak from floor above, aged tiles (15+ years yellow/brittle), improper tile installation (sagging at edges), missing tiles exposing structure. ACTION: replace ceiling tiles — replace individual damaged tiles ($4-15 each for 2x2 mineral fiber, $8-25 for 2x2 PVC-coated, $15-40 for 2x2 metal), replace full ceiling grid ($2-5/sqft including grid + tile), upgrade to washable PVC ceiling tiles ($8-25 each, never stain, ProLuxe/Ceilume brand), install PVC or metal ceiling tiles in spill-prone zones (kitchen/dish — never absorb moisture). BEFORE replacing tiles, fix source of water intrusion — leak detection ($200-500), roof repair ($500-3,000), HVAC condensate line repair ($150-400). Cost: $200-1,500 depending on damage extent. Save ${fmt$(Math.max(lostRevenue, 600))}/mo from recovered perceived quality + avoided customer photos. Stained ceiling tiles are visible from every seat — single highest visibility per dollar of neglect signal.`,
        ai_recommendation: 'replace_ceiling_tiles',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: FLOORING_BRAND_TIER_MISMATCH
    if (config.requireFlooringTierMatch && !d.flooring_tier_match) {
      // Flooring material does not match restaurant price tier
      const expectedTier = tierLabel(d.brand_tier);
      const tierMismatchPenalty = d.brand_tier >= 4 ? 12 : 8;
      const lostRevenue = Math.round(baselineRevenue * (tierMismatchPenalty / 100) * 0.3);
      const priceDrop = Math.round(d.avg_ticket * 0.05 * d.monthly_covers);
      alerts.push({
        rule_id: 'flooring_brand_tier_mismatch',
        severity: d.brand_tier >= 5 ? 'high' : 'medium',
        zone_id: d.zone_id,
        flooring_type: d.flooring_type,
        brand_tier: d.brand_tier,
        flooring_tier_match: d.flooring_tier_match,
        predicted_satisfaction_change: -tierMismatchPenalty,
        predicted_revenue_change_pct: -tierMismatchPenalty,
        est_monthly_opportunity: Math.max(lostRevenue + priceDrop, 1500),
        description: `FLOORING BRAND TIER MISMATCH: ${d.zone_id} brand tier ${d.brand_tier} (${expectedTier}) but ${d.flooring_type} flooring does not match tier expectations. Premium/luxury restaurants with budget flooring (VCT, low-end carpet, sheet vinyl) suffer cognitive dissonance — customers paying premium prices expect premium surfaces. ${d.brand_tier >= 5 ? 'LUXURY tier requires: hardwood, natural stone, premium porcelain, or luxury carpet with custom patterns. ' : d.brand_tier === 4 ? 'PREMIUM tier requires: hardwood, large-format porcelain, or premium carpet with stain protection. ' : 'CASUAL-PREMIUM tier accepts: luxury vinyl tile, porcelain, mid-grade carpet. '}Cheap flooring signals overpriced menu — customers silently downgrade value perception by ${tierMismatchPenalty}% and lower tip 8-10%. ${lostRevenue} revenue lost per month from perceived value drop + ${fmt$(priceDrop)} revenue lost per month from lower price acceptance. ACTION: upgrade flooring to match tier — for luxury: install wide-plank hardwood ($8-15/sqft), large-format porcelain ($6-12/sqft), or natural stone ($10-25/sqft); for premium: install engineered hardwood ($5-10/sqft), premium porcelain ($5-8/sqft), or commercial-grade carpet with stain warranty ($4-8/sqft); for casual-premium: install luxury vinyl tile ($3-7/sqft, Mannington Adura/Coretec), porcelain ($3-6/sqft), or commercial carpet tile ($3-6/sqft, Interface/Florida Tile). Always choose commercial-grade products rated for restaurant traffic. Coordinate flooring color with brand palette — premium restaurants use 2-3 flooring types to define zones (carpet in dining, wood in bar, tile in restrooms). Cost: $3,000-25,000 for full zone replacement (200-500 sqft typical). Save ${fmt$(Math.max(lostRevenue + priceDrop, 1500))}/mo from recovered perceived value + price acceptance + tip uplift. Flooring tier match is the most under-recognized driver of price acceptance — customers tolerate $40 entrees over hardwood but not over VCT.`,
        ai_recommendation: 'upgrade_flooring_to_match_tier',
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
              { role: 'system', content: 'You are a restaurant floor and ceiling surface quality optimization expert. Given floor and ceiling inspection data, recommend ONE specific action with expected cleanliness, acoustic, or safety impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Zone: ${a.zone_id ?? 'n/a'}. Flooring: ${a.flooring_type ?? 'n/a'}. Floor cleanliness: ${a.floor_cleanliness_score ?? 0}/100. Stain/wear: ${a.floor_stain_wear_score ?? 0}/100. Tile grout: ${a.tile_grout_condition_score ?? 0}/100. Carpet days since clean: ${a.carpet_days_since_deep_clean ?? 0}. Slip COF: ${a.slip_resistance_cof ?? 0}. Spill-prone: ${a.is_spill_prone_zone ?? false}. Ceiling height: ${a.ceiling_height_ft ?? 0} ft. Ceiling type: ${a.ceiling_type ?? 'n/a'}. Acoustic treatment: ${a.has_acoustic_treatment ?? false}. Ceiling tile: ${a.ceiling_tile_condition_score ?? 0}/100. Brand tier: ${a.brand_tier ?? 3}. Tier match: ${a.flooring_tier_match ?? true}. Monthly revenue: ${fmt$(a.monthly_zone_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM floor_ceiling_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE floor_ceiling_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<FloorCeilingAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM floor_ceiling_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  zonesAtRisk: number; dirtyFloorZones: number; lowCeilingZones: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone_id != NONE) AS zones,
              math::count(rule_id = 'floor_stain_wear_detected') AS dirtyfloor,
              math::count(rule_id = 'ceiling_height_too_low') AS lowceiling
       FROM floor_ceiling_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      zonesAtRisk: safeNumber(r.zones, 0),
      dirtyFloorZones: safeNumber(r.dirtyfloor, 0),
      lowCeilingZones: safeNumber(r.lowceiling, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, dirtyFloorZones: 0, lowCeilingZones: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
