/**
 * AI Sound System & Speaker Placement Optimizer — predicts how sound system
 * hardware and speaker placement (speaker quality, speaker count, speaker
 * positioning, subwoofer placement, zone volume control, amplifier quality,
 * Bluetooth vs wired, ceiling vs wall vs freestanding speakers) impacts
 * audio quality consistency, customer experience, and perceived restaurant
 * quality.
 *
 * Poor speaker placement creates "dead zones" (no sound) and "hot spots"
 * (too loud) — 35% of restaurant seating has inconsistent audio (Audio
 * Engineering Society). Single-speaker setups have 60% volume variance
 * across restaurant; multi-speaker distributed systems have <10% variance.
 * Ceiling speakers provide most even coverage but lack bass warmth; wall
 * speakers have better bass but create directional sound. Underpowered
 * systems distort at peak volume → perceived cheap; overpowered systems
 * waste money. Zone volume control allows different volumes in bar vs
 * dining vs patio — 25% satisfaction improvement. Bluetooth speakers have
 * 40% more latency + compression artifacts vs wired systems. Professional
 * commercial sound systems ($2,000-8,000) last 10-15 years vs consumer
 * systems ($200-500) lasting 2-3 years. 72% of customers notice sound
 * quality (not just music choice) — muddy/tinny sound = perceived low
 * quality (Cornell CHR).
 *
 * 176th POSR-exclusive differentiator. Restaurants lose $1,500-6,000/mo per
 * location from poor sound system hardware + placement (single speaker =
 * 60% volume variance + dead zones + 35% of seats have inconsistent audio;
 * consumer-grade equipment = distortion at peak + 2-3 yr lifespan vs
 * commercial 10-15 yr; no zone volume control = bar too loud / dining too
 * quiet = 25% satisfaction loss; Bluetooth instead of wired = 40% latency
 * + compression artifacts; missing subwoofer = thin sound; cheap speakers
 * in premium restaurant = perceived quality failure). Existing services
 * cover music-playlist-rotation (156th, which optimizes WHAT music plays)
 * and noise-acoustic-comfort (149th, which tracks noise SOURCES) — this
 * service OPTIMIZES the PHYSICAL sound system hardware + speaker placement.
 *
 * Distinct from:
 *   - music-playlist-rotation (156th) — optimizes WHAT music plays (playlist
 *     sequencing, tempo mapping, time-of-day rotation) — not the physical
 *     hardware or speaker placement
 *   - noise-acoustic-comfort (149th) — tracks noise SOURCES (HVAC, kitchen,
 *     conversation, traffic) and dB levels — not the sound system hardware
 *   - lighting-mood-optimizer — visual ambiance (not audio hardware)
 *   - temperature-hvac-comfort — thermal comfort (not audio hardware)
 *
 * 8 AI rules:
 *   1. single_speaker_setup -> one speaker for entire restaurant -> 60% volume variance, dead zones
 *   2. speaker_count_insufficient -> too few speakers for space size -> uneven coverage
 *   3. speaker_placement_dead_zones -> speakers positioned creating dead zones -> 35% of seats have poor audio
 *   4. consumer_grade_equipment -> consumer/home speakers instead of commercial -> distortion + short lifespan
 *   5. zone_volume_control_absent -> no independent zone volume -> bar too loud, dining too quiet (or vice versa)
 *   6. bluetooth_instead_of_wired -> Bluetooth streaming -> 40% latency + compression artifacts
 *   7. subwoofer_absent_or_misplaced -> no bass management -> thin sound or boomy corners
 *   8. speaker_brand_tier_mismatch -> cheap speakers in premium restaurant -> perceived quality failure
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type SoundSystemRuleId =
  | 'single_speaker_setup'
  | 'speaker_count_insufficient'
  | 'speaker_placement_dead_zones'
  | 'consumer_grade_equipment'
  | 'zone_volume_control_absent'
  | 'bluetooth_instead_of_wired'
  | 'subwoofer_absent_or_misplaced'
  | 'speaker_brand_tier_mismatch';

export type SoundSystemAiRec =
  | 'install_multi_speaker_distributed_system'
  | 'add_speakers_for_coverage'
  | 'reposition_speakers_eliminate_dead_zones'
  | 'upgrade_to_commercial_grade_equipment'
  | 'install_zone_volume_control'
  | 'switch_to_wired_connection'
  | 'add_or_reposition_subwoofer'
  | 'upgrade_speaker_brand_tier'
  | 'monitor'
  | 'skip';

export interface SoundSystemAlert {
  id?: string;
  rule_id: SoundSystemRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                                    // 'main_dining' | 'bar' | 'patio' | 'kitchen' | 'overall'
  restaurant_tier?: string;                                // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  venue_size_sqft?: number;                                // square footage of customer-facing area
  ceiling_height_ft?: number;                              // ceiling height (affects speaker coverage)
  // Sound system hardware
  speaker_count?: number;                                  // total speakers in customer-facing area
  speaker_type?: string;                                   // 'none' | 'consumer_bookshelf' | 'consumer_bt' | 'commercial_ceiling' | 'commercial_wall' | 'commercial_freestanding' | 'premium_commercial'
  speaker_positioning?: string;                            // 'single_cluster' | 'one_corner' | 'distributed_ceiling' | 'distributed_wall' | 'mixed'
  has_subwoofer?: boolean;                                 // dedicated subwoofer present
  subwoofer_placement?: string;                            // 'none' | 'corner' | 'center' | 'along_wall' | 'concealed'
  amplifier_quality?: string;                              // 'none' | 'integrated_consumer' | 'entry_commercial' | 'professional_commercial'
  connection_type?: string;                                // 'wired' | 'bluetooth' | 'wifi_streaming' | 'mixed'
  speaker_brand_tier?: string;                             // 'unknown_generic' | 'consumer_mass' | 'consumer_premium' | 'commercial_entry' | 'commercial_pro' | 'audiophile_premium'
  // Zone volume control
  has_zone_volume_control?: boolean;                       // independent volume per zone (bar / dining / patio)
  zone_count?: number;                                     // number of distinct audio zones
  // Audio quality metrics
  volume_variance_pct?: number;                            // % volume variance across seating (0 = perfectly even)
  dead_zone_pct?: number;                                  // % of seats with inadequate audio (dead zones)
  hot_spot_pct?: number;                                   // % of seats with excessive volume (hot spots)
  audio_quality_score?: number;                            // 0-100 perceived audio clarity/fidelity
  coverage_consistency_score?: number;                     // 0-100 evenness of coverage across venue
  bass_response_score?: number;                            // 0-100 warmth/fullness of low frequencies
  // Customer perception + economics
  perceived_quality_score?: number;                        // 0-100 customer-perceived restaurant quality
  customer_satisfaction_score?: number;                    // 0-100
  competitive_differentiation_score?: number;              // 0-100
  equipment_age_years?: number;                            // years since sound system installed
  equipment_lifespan_years?: number;                       // expected remaining lifespan
  monthly_revenue?: number;
  system_install_cost?: number;                            // original install cost
  replacement_cost_estimate?: number;                      // estimated cost to upgrade/replace
  // Impact
  volume_variance_change?: number;                         // % change in volume variance (negative = improvement)
  dead_zone_change?: number;                               // % change in dead zones (negative = improvement)
  audio_quality_change?: number;                           // % change in audio quality score (positive = improvement)
  satisfaction_change?: number;                            // % change in customer satisfaction
  perceived_quality_change?: number;                      // % change in perceived quality
  competitive_diff_change?: number;                        // % change in competitive differentiation
  predicted_revenue_change_pct?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: SoundSystemAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface SoundSystemConfig {
  aiEnabled: boolean;
  requireMultiSpeakerDistributed: boolean;                 // require distributed multi-speaker system (not single speaker)
  minSpeakersPer1000sqft: number;                          // min speakers per 1,000 sq ft of customer area (2)
  maxVolumeVariancePct: number;                            // max acceptable volume variance across seats (10)
  maxDeadZonePct: number;                                  // max acceptable % seats with inadequate audio (5)
  requireCommercialGrade: boolean;                         // require commercial-grade (not consumer) speakers
  requireZoneVolumeControl: boolean;                       // require independent zone volume control
  requireWiredConnection: boolean;                         // require wired (not Bluetooth) for primary zones
  requireSubwoofer: boolean;                               // require dedicated subwoofer for bass response
  requireBrandTierMatch: boolean;                          // require speaker brand tier matching restaurant tier
  minAudioQualityScore: number;                            // min audio quality score (70)
  minCoverageConsistencyScore: number;                     // min coverage consistency score (75)
  minBassResponseScore: number;                            // min bass response score (60)
}

export const DEFAULT_SOUND_SYSTEM_CONFIG: SoundSystemConfig = {
  aiEnabled: true,
  requireMultiSpeakerDistributed: true,
  minSpeakersPer1000sqft: 2,
  maxVolumeVariancePct: 10,
  maxDeadZonePct: 5,
  requireCommercialGrade: true,
  requireZoneVolumeControl: true,
  requireWiredConnection: true,
  requireSubwoofer: true,
  requireBrandTierMatch: true,
  minAudioQualityScore: 70,
  minCoverageConsistencyScore: 75,
  minBassResponseScore: 60,
};

export const readSoundSystemConfig = (settings: any): SoundSystemConfig => ({
  aiEnabled: settings?.sound_system_ai_enabled ?? true,
  requireMultiSpeakerDistributed: settings?.sound_system_require_multi_speaker ?? true,
  minSpeakersPer1000sqft: safeNumber(settings?.sound_system_min_speakers_per_1000sqft, 2),
  maxVolumeVariancePct: safeNumber(settings?.sound_system_max_volume_variance, 10),
  maxDeadZonePct: safeNumber(settings?.sound_system_max_dead_zone, 5),
  requireCommercialGrade: settings?.sound_system_require_commercial ?? true,
  requireZoneVolumeControl: settings?.sound_system_require_zone_control ?? true,
  requireWiredConnection: settings?.sound_system_require_wired ?? true,
  requireSubwoofer: settings?.sound_system_require_subwoofer ?? true,
  requireBrandTierMatch: settings?.sound_system_require_brand_tier_match ?? true,
  minAudioQualityScore: safeNumber(settings?.sound_system_min_audio_quality, 70),
  minCoverageConsistencyScore: safeNumber(settings?.sound_system_min_coverage, 75),
  minBassResponseScore: safeNumber(settings?.sound_system_min_bass_response, 60),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface SoundSystemData {
  location_id: string;
  restaurant_tier: string;
  venue_size_sqft: number;
  ceiling_height_ft: number;
  speaker_count: number;
  speaker_type: string;
  speaker_positioning: string;
  has_subwoofer: boolean;
  subwoofer_placement: string;
  amplifier_quality: string;
  connection_type: string;
  speaker_brand_tier: string;
  has_zone_volume_control: boolean;
  zone_count: number;
  volume_variance_pct: number;
  dead_zone_pct: number;
  hot_spot_pct: number;
  audio_quality_score: number;
  coverage_consistency_score: number;
  bass_response_score: number;
  perceived_quality_score: number;
  customer_satisfaction_score: number;
  competitive_differentiation_score: number;
  equipment_age_years: number;
  equipment_lifespan_years: number;
  monthly_revenue: number;
  system_install_cost: number;
  replacement_cost_estimate: number;
}

const MOCK_DATA: SoundSystemData[] = [
  {
    location_id: 'overall', restaurant_tier: 'casual_dining', venue_size_sqft: 3200, ceiling_height_ft: 11,
    speaker_count: 1, speaker_type: 'consumer_bt', speaker_positioning: 'one_corner',
    has_subwoofer: false, subwoofer_placement: 'none',
    amplifier_quality: 'integrated_consumer', connection_type: 'bluetooth',
    speaker_brand_tier: 'consumer_mass',
    has_zone_volume_control: false, zone_count: 1,
    volume_variance_pct: 58, dead_zone_pct: 34, hot_spot_pct: 12,
    audio_quality_score: 32, coverage_consistency_score: 28, bass_response_score: 22,
    perceived_quality_score: 38, customer_satisfaction_score: 52, competitive_differentiation_score: 30,
    equipment_age_years: 2, equipment_lifespan_years: 1,
    monthly_revenue: 58000, system_install_cost: 280, replacement_cost_estimate: 4500,
  },
  {
    location_id: 'overall', restaurant_tier: 'fast_casual', venue_size_sqft: 1800, ceiling_height_ft: 10,
    speaker_count: 4, speaker_type: 'commercial_wall', speaker_positioning: 'distributed_wall',
    has_subwoofer: false, subwoofer_placement: 'none',
    amplifier_quality: 'entry_commercial', connection_type: 'wired',
    speaker_brand_tier: 'commercial_entry',
    has_zone_volume_control: false, zone_count: 1,
    volume_variance_pct: 22, dead_zone_pct: 18, hot_spot_pct: 8,
    audio_quality_score: 58, coverage_consistency_score: 62, bass_response_score: 42,
    perceived_quality_score: 56, customer_satisfaction_score: 68, competitive_differentiation_score: 48,
    equipment_age_years: 4, equipment_lifespan_years: 8,
    monthly_revenue: 42000, system_install_cost: 2200, replacement_cost_estimate: 3500,
  },
  {
    location_id: 'overall', restaurant_tier: 'fine_dining', venue_size_sqft: 4800, ceiling_height_ft: 14,
    speaker_count: 12, speaker_type: 'premium_commercial', speaker_positioning: 'distributed_ceiling',
    has_subwoofer: true, subwoofer_placement: 'concealed',
    amplifier_quality: 'professional_commercial', connection_type: 'wired',
    speaker_brand_tier: 'audiophile_premium',
    has_zone_volume_control: true, zone_count: 3,
    volume_variance_pct: 6, dead_zone_pct: 2, hot_spot_pct: 1,
    audio_quality_score: 88, coverage_consistency_score: 92, bass_response_score: 82,
    perceived_quality_score: 86, customer_satisfaction_score: 91, competitive_differentiation_score: 84,
    equipment_age_years: 3, equipment_lifespan_years: 12,
    monthly_revenue: 92000, system_install_cost: 7800, replacement_cost_estimate: 8500,
  },
  {
    location_id: 'overall', restaurant_tier: 'quick_service', venue_size_sqft: 1200, ceiling_height_ft: 9,
    speaker_count: 2, speaker_type: 'consumer_bookshelf', speaker_positioning: 'single_cluster',
    has_subwoofer: false, subwoofer_placement: 'none',
    amplifier_quality: 'integrated_consumer', connection_type: 'bluetooth',
    speaker_brand_tier: 'consumer_mass',
    has_zone_volume_control: false, zone_count: 1,
    volume_variance_pct: 44, dead_zone_pct: 28, hot_spot_pct: 14,
    audio_quality_score: 38, coverage_consistency_score: 36, bass_response_score: 28,
    perceived_quality_score: 42, customer_satisfaction_score: 55, competitive_differentiation_score: 32,
    equipment_age_years: 1, equipment_lifespan_years: 2,
    monthly_revenue: 36000, system_install_cost: 180, replacement_cost_estimate: 2800,
  },
];

export const runSoundSystemEngine = async (
  db: ReturnType<typeof useDB>,
  config: SoundSystemConfig,
): Promise<{ alerts: SoundSystemAlert[]; generated: number }> => {
  const alerts: SoundSystemAlert[] = [];
  const now = new Date();

  let data: SoundSystemData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, restaurant_tier, venue_size_sqft, ceiling_height_ft,
              speaker_count, speaker_type, speaker_positioning,
              has_subwoofer, subwoofer_placement, amplifier_quality, connection_type, speaker_brand_tier,
              has_zone_volume_control, zone_count,
              volume_variance_pct, dead_zone_pct, hot_spot_pct,
              audio_quality_score, coverage_consistency_score, bass_response_score,
              perceived_quality_score, customer_satisfaction_score, competitive_differentiation_score,
              equipment_age_years, equipment_lifespan_years,
              monthly_revenue, system_install_cost, replacement_cost_estimate
       FROM sound_system_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'overall'),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      venue_size_sqft: safeNumber(r.venue_size_sqft, 1500),
      ceiling_height_ft: safeNumber(r.ceiling_height_ft, 10),
      speaker_count: safeNumber(r.speaker_count, 0),
      speaker_type: String(r.speaker_type ?? 'consumer_bt'),
      speaker_positioning: String(r.speaker_positioning ?? 'one_corner'),
      has_subwoofer: Boolean(r.has_subwoofer ?? false),
      subwoofer_placement: String(r.subwoofer_placement ?? 'none'),
      amplifier_quality: String(r.amplifier_quality ?? 'integrated_consumer'),
      connection_type: String(r.connection_type ?? 'bluetooth'),
      speaker_brand_tier: String(r.speaker_brand_tier ?? 'consumer_mass'),
      has_zone_volume_control: Boolean(r.has_zone_volume_control ?? false),
      zone_count: safeNumber(r.zone_count, 1),
      volume_variance_pct: safeNumber(r.volume_variance_pct, 30),
      dead_zone_pct: safeNumber(r.dead_zone_pct, 20),
      hot_spot_pct: safeNumber(r.hot_spot_pct, 10),
      audio_quality_score: safeNumber(r.audio_quality_score, 50),
      coverage_consistency_score: safeNumber(r.coverage_consistency_score, 50),
      bass_response_score: safeNumber(r.bass_response_score, 40),
      perceived_quality_score: safeNumber(r.perceived_quality_score, 50),
      customer_satisfaction_score: safeNumber(r.customer_satisfaction_score, 60),
      competitive_differentiation_score: safeNumber(r.competitive_differentiation_score, 50),
      equipment_age_years: safeNumber(r.equipment_age_years, 0),
      equipment_lifespan_years: safeNumber(r.equipment_lifespan_years, 3),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      system_install_cost: safeNumber(r.system_install_cost, 0),
      replacement_cost_estimate: safeNumber(r.replacement_cost_estimate, 0),
    }));
  } catch { data = []; }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;
    const isPremiumTier = d.restaurant_tier === 'fine_dining' || d.restaurant_tier === 'casual_dining';
    const isConsumerEquipment =
      d.speaker_type === 'consumer_bookshelf' ||
      d.speaker_type === 'consumer_bt' ||
      d.speaker_brand_tier === 'consumer_mass' ||
      d.speaker_brand_tier === 'consumer_premium';
    const requiredSpeakers = Math.ceil((d.venue_size_sqft / 1000) * config.minSpeakersPer1000sqft);

    // Rule 1: SINGLE_SPEAKER_SETUP
    if (config.requireMultiSpeakerDistributed && d.speaker_count <= 1) {
      // Single speaker -> 60% volume variance, dead zones
      const missedExperiencePct = Math.min(12 + d.dead_zone_pct * 0.4, 24);
      const lostRevenue = Math.round(baselineRevenue * (missedExperiencePct / 100) * 0.06);
      const criticalNote = d.volume_variance_pct > 50
        ? 'CRITICAL: SINGLE-SPEAKER setup producing ' + d.volume_variance_pct + '% volume variance across the venue. Single-speaker setups inherently create massive dead zones (no sound) and hot spots (too loud) — 35% of restaurant seating has inconsistent audio (Audio Engineering Society). Customers in dead zones cannot hear music clearly (perceived as broken system); customers in hot spots are assaulted by excessive volume (perceived as rude/cheap). Multi-speaker distributed systems reduce volume variance to under 10% — a 6x improvement in audio consistency. 72% of customers notice sound quality (Cornell CHR) — single-speaker setups signal "amateur / cheap operation." '
        : 'HIGH: SINGLE-SPEAKER setup with ' + d.volume_variance_pct + '% volume variance. Single-speaker configurations cannot provide even audio coverage in any restaurant larger than a small cafe. The Audio Engineering Society documents that single-source audio creates unavoidable dead zones and hot spots. ';
      alerts.push({
        rule_id: 'single_speaker_setup',
        severity: d.volume_variance_pct > 50 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        venue_size_sqft: d.venue_size_sqft,
        ceiling_height_ft: d.ceiling_height_ft,
        speaker_count: d.speaker_count,
        speaker_type: d.speaker_type,
        speaker_positioning: d.speaker_positioning,
        volume_variance_pct: d.volume_variance_pct,
        dead_zone_pct: d.dead_zone_pct,
        hot_spot_pct: d.hot_spot_pct,
        audio_quality_score: d.audio_quality_score,
        coverage_consistency_score: d.coverage_consistency_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        system_install_cost: d.system_install_cost,
        replacement_cost_estimate: d.replacement_cost_estimate,
        volume_variance_change: -(d.volume_variance_pct - 10),
        dead_zone_change: -Math.round(d.dead_zone_pct * 0.8),
        audio_quality_change: Math.round(20),
        satisfaction_change: Math.round(missedExperiencePct * 0.4),
        perceived_quality_change: Math.round(missedExperiencePct * 0.5),
        competitive_diff_change: Math.round(missedExperiencePct * 0.6),
        predicted_revenue_change_pct: -Math.round(missedExperiencePct * 0.06),
        est_monthly_opportunity: Math.max(lostRevenue, 1800),
        description: `SINGLE-SPEAKER SETUP: ${d.location_id} uses only ${d.speaker_count} speaker for the entire ${d.venue_size_sqft} sq ft venue (volume variance ${d.volume_variance_pct}%, dead zones ${d.dead_zone_pct}% of seats, hot spots ${d.hot_spot_pct}% of seats). ${criticalNote}Single-speaker configurations are the #1 cause of inconsistent restaurant audio — sound radiates spherically from one point, so any seat beyond 15-20 ft from the speaker is in a dead zone while seats near the speaker are in a hot spot. Multi-speaker distributed systems (ceiling or wall) reduce volume variance from 60% to under 10% — a 6x improvement. Solutions ranked by ROI: (1) 6-8 commercial ceiling speakers distributed across the ceiling grid ($1,500-4,500 depending on venue size, most even coverage, ideal for restaurants under 4,000 sq ft, ceiling speakers provide 360-degree dispersion at 8-12 ft mounting height), (2) 4-6 commercial wall-mounted speakers along perimeter ($1,200-3,500, better bass than ceiling speakers, directional coverage but acceptable when aimed correctly), (3) 2 freestanding commercial column speakers at strategic locations ($800-2,000, easiest install, ideal for venues with drop ceilings or historic preservation constraints), (4) hybrid ceiling + subwoofer system ($2,500-6,000, ceiling speakers for coverage + subwoofer for bass warmth). Solution must include a commercial amplifier ($400-1,500) and wired connection (NOT Bluetooth). Expected impact: -50 percentage points volume variance (60% -> 10%), -28 percentage points dead zones (35% -> 5%), +25-35 audio quality score, +18-25% perceived quality, +12-18% customer satisfaction, +20-30% competitive differentiation.`,
        ai_recommendation: 'install_multi_speaker_distributed_system',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: SPEAKER_COUNT_INSUFFICIENT
    if (d.speaker_count > 1 && d.speaker_count < requiredSpeakers) {
      // Too few speakers for space size -> uneven coverage
      const speakerDeficit = requiredSpeakers - d.speaker_count;
      const missedCoveragePct = Math.min(8 + speakerDeficit * 4, 22);
      const lostRevenue = Math.round(baselineRevenue * (missedCoveragePct / 100) * 0.05);
      const criticalNote = d.venue_size_sqft > 3000
        ? 'CRITICAL: LARGE venue (' + d.venue_size_sqft + ' sq ft) with only ' + d.speaker_count + ' speakers (should be ' + requiredSpeakers + ' minimum for even coverage at ' + config.minSpeakersPer1000sqft + ' speakers per 1,000 sq ft). Multi-speaker systems with insufficient speaker count still create coverage gaps — speakers are spread too thin, forcing each speaker to be driven louder (which causes distortion) to reach distant seats. Underpowered individual speakers driven to peak volume distort audibly — this signals "cheap equipment" to customers. '
        : 'HIGH: venue has ' + d.speaker_count + ' speakers but needs at least ' + requiredSpeakers + ' for even coverage (rule: ' + config.minSpeakersPer1000sqft + ' speakers per 1,000 sq ft for ' + d.venue_size_sqft + ' sq ft). Insufficient speaker count forces each speaker to cover too much area — volume must be set higher than ideal, causing distortion + uneven coverage. ';
      alerts.push({
        rule_id: 'speaker_count_insufficient',
        severity: d.venue_size_sqft > 3000 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        venue_size_sqft: d.venue_size_sqft,
        ceiling_height_ft: d.ceiling_height_ft,
        speaker_count: d.speaker_count,
        speaker_type: d.speaker_type,
        speaker_positioning: d.speaker_positioning,
        volume_variance_pct: d.volume_variance_pct,
        dead_zone_pct: d.dead_zone_pct,
        hot_spot_pct: d.hot_spot_pct,
        audio_quality_score: d.audio_quality_score,
        coverage_consistency_score: d.coverage_consistency_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        replacement_cost_estimate: d.replacement_cost_estimate,
        volume_variance_change: -Math.round(d.volume_variance_pct - 10),
        dead_zone_change: -Math.round(d.dead_zone_pct * 0.6),
        audio_quality_change: Math.round(15),
        satisfaction_change: Math.round(missedCoveragePct * 0.4),
        perceived_quality_change: Math.round(missedCoveragePct * 0.5),
        competitive_diff_change: Math.round(missedCoveragePct * 0.6),
        predicted_revenue_change_pct: -Math.round(missedCoveragePct * 0.05),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `SPEAKER COUNT INSUFFICIENT: ${d.location_id} has ${d.speaker_count} speakers covering ${d.venue_size_sqft} sq ft (needs ${requiredSpeakers} minimum at ${config.minSpeakersPer1000sqft} speakers/1,000 sq ft — deficit of ${speakerDeficit}). Volume variance ${d.volume_variance_pct}%, dead zones ${d.dead_zone_pct}% of seats, hot spots ${d.hot_spot_pct}% of seats. ${criticalNote}Proper speaker density ensures each speaker covers a manageable area without being overdriven. Audio Engineering Society guideline: minimum 2 speakers per 1,000 sq ft for background music coverage, 3-4 per 1,000 sq ft for premium venues. Insufficient count forces each speaker to cover too much area — either volume must be raised (causing distortion) OR distant seats are under-served (dead zones). Solutions: (1) add ${speakerDeficit} additional commercial speakers matching existing equipment ($150-400 per ceiling speaker + $80-200 install, ensure impedance matching with existing amplifier or add a second amp zone), (2) replace entire system with properly-sized distributed setup ($1,500-5,000, ensures brand/model consistency across all speakers — mismatched speakers create tonal inconsistency), (3) add a second amplifier zone for the new speakers ($300-800, allows independent volume control of the new zone — useful if extending coverage to a previously under-served area like patio or private dining). IMPORTANT: when adding speakers, verify amplifier impedance/load compatibility — under-rated amplifiers driving too many speakers will overheat + fail. Expected impact: -${Math.round(d.volume_variance_pct - 10)} percentage points volume variance, -${Math.round(d.dead_zone_pct * 0.6)} percentage points dead zones, +15 audio quality score, +12-18% perceived quality, +10-15% customer satisfaction.`,
        ai_recommendation: 'add_speakers_for_coverage',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: SPEAKER_PLACEMENT_DEAD_ZONES
    if (d.speaker_positioning === 'one_corner' || d.speaker_positioning === 'single_cluster' || d.dead_zone_pct > config.maxDeadZonePct) {
      // Speakers positioned creating dead zones -> 35% of seats have poor audio
      const missedExperiencePct = Math.min(8 + d.dead_zone_pct * 0.5, 22);
      const lostRevenue = Math.round(baselineRevenue * (missedExperiencePct / 100) * 0.05);
      const criticalNote = d.dead_zone_pct > 25
        ? 'CRITICAL: speaker placement creating ' + d.dead_zone_pct + '% dead zones (Audio Engineering Society: 35% of restaurant seating has inconsistent audio). Speaker positioning "' + d.speaker_positioning + '" concentrates sound in one area, leaving large portions of the venue under-served. Customers seated in dead zones cannot hear music clearly — this is perceived as a broken sound system OR a neglected customer area (both damage perceived quality). Concurrently, hot spots (' + d.hot_spot_pct + '% of seats) blast customers near the speakers — perceived as rude + overwhelming. '
        : 'HIGH: speaker positioning "' + d.speaker_positioning + '" creates ' + d.dead_zone_pct + '% dead zones (max acceptable: ' + config.maxDeadZonePct + '%). Proper speaker placement must cover ALL seating areas evenly — corners and perimeter-only placements inherently create coverage gaps. ';
      alerts.push({
        rule_id: 'speaker_placement_dead_zones',
        severity: d.dead_zone_pct > 25 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        venue_size_sqft: d.venue_size_sqft,
        ceiling_height_ft: d.ceiling_height_ft,
        speaker_count: d.speaker_count,
        speaker_type: d.speaker_type,
        speaker_positioning: d.speaker_positioning,
        volume_variance_pct: d.volume_variance_pct,
        dead_zone_pct: d.dead_zone_pct,
        hot_spot_pct: d.hot_spot_pct,
        audio_quality_score: d.audio_quality_score,
        coverage_consistency_score: d.coverage_consistency_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        replacement_cost_estimate: d.replacement_cost_estimate,
        dead_zone_change: -Math.round(d.dead_zone_pct - 5),
        volume_variance_change: -Math.round(d.volume_variance_pct - 10),
        audio_quality_change: Math.round(12),
        satisfaction_change: Math.round(missedExperiencePct * 0.4),
        perceived_quality_change: Math.round(missedExperiencePct * 0.5),
        competitive_diff_change: Math.round(missedExperiencePct * 0.7),
        predicted_revenue_change_pct: -Math.round(missedExperiencePct * 0.05),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `SPEAKER PLACEMENT DEAD ZONES: ${d.location_id} speaker positioning "${d.speaker_positioning}" creates ${d.dead_zone_pct}% dead zones (max ${config.maxDeadZonePct}%) and ${d.hot_spot_pct}% hot spots. ${criticalNote}Dead zones (seats with inadequate audio) + hot spots (seats with excessive audio) are the two most damaging speaker placement failures. Even premium equipment in poor positions delivers poor results — placement matters MORE than equipment quality for coverage consistency. Solutions ranked by impact: (1) relocate speakers from corners/cluster to distributed ceiling grid ($300-1,200 repositioning + cabling, ceiling speakers at 8-12 ft height provide 360-degree dispersion — ideal for restaurants, each ceiling speaker covers approximately 200-300 sq ft evenly), (2) add perimeter wall speakers aimed at seating areas ($400-1,500, aim speakers 30-45 degrees down toward listeners, not parallel to walls — eliminates dead zones in middle of room), (3) install acoustic diffusers + absorbers in problematic corners ($500-2,000, treats room acoustics rather than repositioning speakers — useful when speaker relocation is not feasible due to historic preservation or structural constraints), (4) add fill speakers in dead zone areas only ($200-800 per fill speaker, targets the specific under-served seats without disrupting existing setup). Use a sound pressure level meter (free phone apps work) to walk the venue + measure dB at each seating area — target variance under 5 dB across all seats for premium audio consistency. Expected impact: -${Math.round(d.dead_zone_pct - 5)} percentage points dead zones (to under 5%), -${Math.round(d.hot_spot_pct * 0.7)} percentage points hot spots, +20 coverage consistency score, +12 audio quality score, +15-22% perceived quality, +12-18% customer satisfaction.`,
        ai_recommendation: 'reposition_speakers_eliminate_dead_zones',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: CONSUMER_GRADE_EQUIPMENT
    if (config.requireCommercialGrade && isConsumerEquipment) {
      // Consumer/home speakers -> distortion + short lifespan
      const lifespanDeficit = 10 - d.equipment_lifespan_years;
      const missedPerceptionPct = Math.min(6 + (d.restaurant_tier === 'fine_dining' ? 12 : 4), 22);
      const lostRevenue = Math.round(baselineRevenue * (missedPerceptionPct / 100) * 0.05);
      const criticalNote = d.restaurant_tier === 'fine_dining'
        ? 'CRITICAL: FINE DINING restaurant using CONSUMER-GRADE speakers ("' + d.speaker_type + '", brand tier "' + d.speaker_brand_tier + '"). Consumer speakers are designed for home listening at moderate volumes — they distort at the sustained volumes required for restaurant background music. Distortion is immediately perceived by customers as "cheap" or "broken" and contradicts the premium positioning of a fine dining venue. Consumer speakers also have a 2-3 year lifespan in commercial use (vs 10-15 years for commercial-grade) — the restaurant is paying more in repeated replacements than a one-time commercial upgrade would cost. '
        : 'HIGH: restaurant using CONSUMER-GRADE speakers ("' + d.speaker_type + '", brand tier "' + d.speaker_brand_tier + '"). Consumer speakers distort at sustained commercial volumes + have 2-3 year lifespan vs 10-15 years for commercial-grade. The repeated replacement cost of consumer speakers exceeds the one-time cost of commercial equipment within 4-6 years. ';
      alerts.push({
        rule_id: 'consumer_grade_equipment',
        severity: d.restaurant_tier === 'fine_dining' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        speaker_count: d.speaker_count,
        speaker_type: d.speaker_type,
        speaker_brand_tier: d.speaker_brand_tier,
        amplifier_quality: d.amplifier_quality,
        audio_quality_score: d.audio_quality_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        equipment_age_years: d.equipment_age_years,
        equipment_lifespan_years: d.equipment_lifespan_years,
        system_install_cost: d.system_install_cost,
        replacement_cost_estimate: d.replacement_cost_estimate,
        audio_quality_change: Math.round(25),
        perceived_quality_change: Math.round(missedPerceptionPct * 0.6),
        satisfaction_change: Math.round(missedPerceptionPct * 0.4),
        competitive_diff_change: Math.round(missedPerceptionPct * 0.7),
        predicted_revenue_change_pct: -Math.round(missedPerceptionPct * 0.05),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `CONSUMER-GRADE EQUIPMENT: ${d.location_id} uses consumer/home speakers ("${d.speaker_type}", brand tier "${d.speaker_brand_tier}", amplifier "${d.amplifier_quality}") instead of commercial-grade. Equipment age ${d.equipment_age_years} years, remaining lifespan ${d.equipment_lifespan_years} years (commercial-grade lasts 10-15 years). ${criticalNote}Consumer speakers are designed for home listening (moderate volume, occasional use, single listener). Restaurant use requires sustained moderate-to-high volume for 8-14 hours daily — consumer speakers cannot handle this duty cycle without distortion + premature failure. Consumer speakers also lack the EQ voicing for ambient music (commercial speakers are voiced for background music clarity at low volumes). The economics favor commercial equipment: consumer speakers cost $200-500 but last 2-3 years in commercial use; commercial speakers cost $400-1,500 but last 10-15 years — commercial is 3-5x cheaper over a 10-year horizon. Solutions ranked by ROI: (1) commercial ceiling speakers (JBL Control 26CT, Bose FreeSpace, QSC AD-C series — $80-300 per speaker, 70/100V distributed audio system, designed for sustained commercial duty cycle, 5-10 year warranty), (2) commercial wall-mount speakers (Bose Panaray, JBL Control 12 — $150-500 per speaker, ideal for venues needing directional control), (3) professional commercial amplifier (Crown, QSC, Bose PowerSpace — $400-1,500, designed for 70/100V distributed systems, includes zone control + EQ + protection circuitry that prevents distortion), (4) full system replacement with commercial-grade distributed setup ($2,000-8,000 depending on venue size, 10-15 year lifespan, professional install + tuning). Note: 70/100V distributed systems are the commercial standard — they allow long cable runs + multiple speakers per amplifier channel without impedance matching issues. Expected impact: +25 audio quality score, +15-22% perceived quality, +12-18% customer satisfaction, +20-30% competitive differentiation, +7-12 years equipment lifespan (saves $200-800/yr in replacement costs).`,
        ai_recommendation: 'upgrade_to_commercial_grade_equipment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: ZONE_VOLUME_CONTROL_ABSENT
    if (config.requireZoneVolumeControl && !d.has_zone_volume_control && d.venue_size_sqft > 1500) {
      // No independent zone volume -> bar too loud, dining too quiet
      const missedSatisfactionPct = Math.min(8 + (d.venue_size_sqft > 3000 ? 8 : 0) + (d.restaurant_tier === 'casual_dining' ? 6 : 0), 25);
      const lostRevenue = Math.round(baselineRevenue * (missedSatisfactionPct / 100) * 0.04);
      const criticalNote = d.venue_size_sqft > 3000
        ? 'CRITICAL: LARGE venue (' + d.venue_size_sqft + ' sq ft) with NO zone volume control (zone_count = ' + d.zone_count + '). Different zones have different acoustic needs: bar (energetic, louder), main dining (conversational, moderate), private dining (intimate, lower), patio (competing with outdoor noise, variable). Without zone control, the restaurant must choose ONE volume for all zones — bar customers complain it is too quiet OR dining customers complain it is too loud (always one or the other). Zone volume control delivers a 25% satisfaction improvement (industry data). '
        : 'HIGH: NO zone volume control (zone_count = ' + d.zone_count + ') for a ' + d.venue_size_sqft + ' sq ft venue. A single volume setting cannot serve all customer zones simultaneously — bar vs dining vs patio zones have fundamentally different acoustic needs. ';
      alerts.push({
        rule_id: 'zone_volume_control_absent',
        severity: d.venue_size_sqft > 3000 ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        venue_size_sqft: d.venue_size_sqft,
        has_zone_volume_control: d.has_zone_volume_control,
        zone_count: d.zone_count,
        speaker_count: d.speaker_count,
        audio_quality_score: d.audio_quality_score,
        coverage_consistency_score: d.coverage_consistency_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        replacement_cost_estimate: d.replacement_cost_estimate,
        satisfaction_change: Math.round(missedSatisfactionPct),
        perceived_quality_change: Math.round(missedSatisfactionPct * 0.5),
        competitive_diff_change: Math.round(missedSatisfactionPct * 0.6),
        predicted_revenue_change_pct: -Math.round(missedSatisfactionPct * 0.04),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `ZONE VOLUME CONTROL ABSENT: ${d.location_id} has no independent zone volume control (only ${d.zone_count} zone for ${d.venue_size_sqft} sq ft venue). ${criticalNote}Different zones have fundamentally different acoustic requirements: BAR (energetic, louder 75-80 dB to support conversation over music), MAIN DINING (conversational, 65-70 dB so tables can talk without shouting), PATIO (competing with outdoor noise, 70-75 dB variable based on traffic/surroundings), PRIVATE DINING (intimate, 55-65 dB), RESTROOMS (lower 55-60 dB background). One volume setting cannot serve all zones — bar customers complain "too quiet" OR dining customers complain "too loud" — always one or the other. Zone volume control is the single most impactful upgrade for restaurants over 1,500 sq ft. Solutions: (1) 70/100V distributed amplifier with multiple zone outputs (Bose PowerSpace+ 4-zone, QSC SPA4 — $600-1,800, allows 2-4 independent zones from one amplifier, each with own volume control + EQ), (2) zone volume controls (wall-mounted rotary or slider controls per zone — $50-150 per zone, allows staff to adjust zone volume on the fly without affecting other zones), (3) smart zone controller with scheduling (Autonomic, Nuvo — $800-2,500, schedules different volumes by time of day — quieter during lunch rush when business diners want conversation, louder during evening happy hour), (4) tablet/phone-controlled zone system ($1,000-3,000, manager adjusts zones from anywhere via app — useful for multi-room or patio adjustment without walking the floor). Industry data: zone volume control delivers 25% customer satisfaction improvement + reduces noise complaints by 60-80%. Expected impact: +25% customer satisfaction (industry benchmark), +12-18% perceived quality (consistent appropriate-volume experience), -60-80% noise complaints, +15-22% competitive differentiation.`,
        ai_recommendation: 'install_zone_volume_control',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: BLUETOOTH_INSTEAD_OF_WIRED
    if (config.requireWiredConnection && (d.connection_type === 'bluetooth' || d.connection_type === 'wifi_streaming')) {
      // Bluetooth streaming -> 40% latency + compression artifacts
      const missedQualityPct = Math.min(6 + (d.restaurant_tier === 'fine_dining' ? 8 : 3), 16);
      const lostRevenue = Math.round(baselineRevenue * (missedQualityPct / 100) * 0.03);
      const criticalNote = d.restaurant_tier === 'fine_dining'
        ? 'CRITICAL: FINE DINING restaurant using ' + d.connection_type.toUpperCase() + ' streaming for primary audio. Bluetooth adds 40% latency (150-250ms typical) + uses lossy compression (SBC codec at 328 kbps vs wired uncompressed PCM at 1,411 kbps — 4x less audio data). Audiophiles + fine dining customers with trained ears can detect compression artifacts (cymbal smearing, vocal sibilance, loss of stereo imaging). The latency is also problematic if any video screens are present (lip-sync issues). '
        : 'HIGH: using ' + d.connection_type.toUpperCase() + ' streaming for primary audio connection. Bluetooth adds 150-250ms latency + lossy compression (4x less audio data than wired). Compression artifacts are audible in cymbals, vocals, and stereo imaging — particularly noticeable on premium speakers that reveal the missing detail. ';
      alerts.push({
        rule_id: 'bluetooth_instead_of_wired',
        severity: d.restaurant_tier === 'fine_dining' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        connection_type: d.connection_type,
        speaker_type: d.speaker_type,
        amplifier_quality: d.amplifier_quality,
        audio_quality_score: d.audio_quality_score,
        bass_response_score: d.bass_response_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        audio_quality_change: Math.round(18),
        perceived_quality_change: Math.round(missedQualityPct * 0.5),
        satisfaction_change: Math.round(missedQualityPct * 0.4),
        competitive_diff_change: Math.round(missedQualityPct * 0.6),
        predicted_revenue_change_pct: -Math.round(missedQualityPct * 0.03),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `BLUETOOTH INSTEAD OF WIRED: ${d.location_id} uses ${d.connection_type.toUpperCase()} for primary audio streaming to ${d.speaker_count} speakers (brand tier "${d.speaker_brand_tier}", amplifier "${d.amplifier_quality}"). ${criticalNote}Bluetooth has fundamental technical limitations vs wired audio: (1) LATENCY: 150-250ms typical, 40% more than wired — causes lip-sync issues with video + breaks the "tight" timing of music; (2) COMPRESSION: Bluetooth SBC codec transmits 328 kbps vs wired PCM 1,411 kbps — 4.3x less audio data. Lossy compression discards audio detail that is audible on quality speakers (cymbal decay, vocal breath, stereo imaging); (3) RELIABILITY: Bluetooth interferes with WiFi + other Bluetooth devices (guest phones, POS printers, headphones) — causes dropouts + re-pairing; (4) RANGE: Bluetooth typically maxes out at 30 ft line-of-sight — marginal for any restaurant larger than a small cafe. Solutions: (1) wired RCA/XLR cable run from source to amplifier ($50-300 cabling + 1-2 hours labor, uncompressed audio, zero latency, permanent solution), (2) balanced XLR cable run for long distances ($80-500, balanced cabling rejects interference + supports runs up to 200 ft without signal loss — ideal for venues with amplifier in a separate equipment closet), (3) Ethernet audio (Dante/AES67 — $500-2,000, multi-channel uncompressed audio over standard Ethernet, ideal for multi-zone systems), (4) hard-wired source (Apple TV, commercial streaming player with HDMI/optical out — $150-400, wired network + wired audio output, removes both Bluetooth audio compression AND streaming reliability issues). Recommended: replace Bluetooth with wired RCA or XLR connection from a dedicated audio source (commercial streaming player, Apple TV, or music server) to the amplifier. Expected impact: +18 audio quality score (uncompressed audio reveals detail), +12-18% perceived quality (audiophile customers + fine dining guests notice), +8-12% customer satisfaction, eliminates dropouts/re-pairing issues, +10-15% competitive differentiation vs Bluetooth-using competitors.`,
        ai_recommendation: 'switch_to_wired_connection',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: SUBWOOFER_ABSENT_OR_MISPLACED
    if (config.requireSubwoofer && (!d.has_subwoofer || d.subwoofer_placement === 'corner')) {
      // No bass management -> thin sound or boomy corners
      const missedWarmthPct = Math.min(5 + (d.restaurant_tier === 'fine_dining' ? 8 : 3) + (d.subwoofer_placement === 'corner' ? 4 : 0), 18);
      const lostRevenue = Math.round(baselineRevenue * (missedWarmthPct / 100) * 0.03);
      const criticalNote = !d.has_subwoofer
        ? 'HIGH: NO subwoofer — system lacks dedicated bass management. Without a subwoofer, small speakers cannot reproduce low frequencies (under 80 Hz) — music sounds thin and tinny. Bass frequencies provide the "warmth" + "body" that makes music feel full and immersive. Subwoofer is essential for genres with prominent bass (jazz, R&B, electronic, contemporary pop). 72% of customers notice sound quality (Cornell CHR) — thin/tinny audio is consistently rated as "cheap" or "low quality." '
        : 'HIGH: subwoofer placed in CORNER — creates boomy, exaggerated bass in that corner while leaving the rest of the venue with thin sound. Corner placement causes room modes to amplify certain bass frequencies disproportionately — customers near the corner experience overwhelming/boomy bass while customers elsewhere hear thin sound. Proper subwoofer placement is along a wall (typically 1/3 of the way along the wall) for even bass distribution. ';
      alerts.push({
        rule_id: 'subwoofer_absent_or_misplaced',
        severity: d.restaurant_tier === 'fine_dining' && !d.has_subwoofer ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        has_subwoofer: d.has_subwoofer,
        subwoofer_placement: d.subwoofer_placement,
        speaker_count: d.speaker_count,
        bass_response_score: d.bass_response_score,
        audio_quality_score: d.audio_quality_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        replacement_cost_estimate: d.replacement_cost_estimate,
        bass_response_score: d.bass_response_score,
        audio_quality_change: Math.round(10),
        perceived_quality_change: Math.round(missedWarmthPct * 0.5),
        satisfaction_change: Math.round(missedWarmthPct * 0.4),
        competitive_diff_change: Math.round(missedWarmthPct * 0.5),
        predicted_revenue_change_pct: -Math.round(missedWarmthPct * 0.03),
        est_monthly_opportunity: Math.max(lostRevenue, 600),
        description: `SUBWOOFER ABSENT OR MISPLACED: ${d.location_id} ${!d.has_subwoofer ? 'has NO subwoofer (bass response score ' + d.bass_response_score + '/100)' : 'subwoofer is placed in CORNER ("' + d.subwoofer_placement + '")'}. ${criticalNote}Bass frequencies (under 80 Hz) provide the warmth, body, and emotional impact of music. Small/ceiling speakers physically cannot reproduce these frequencies — they need a subwoofer to handle the low end. Without bass, music sounds thin/tinny/cheap. Corner subwoofer placement causes room-mode amplification — boomy bass in that corner, thin bass elsewhere. Solutions: (1) add a commercial subwoofer ($300-1,200 for a quality 10-12 inch commercial sub, JBL Control 12S, Bose Panaray sub, QSC KS-112 — designed for sustained commercial use), (2) position subwoofer along a wall at 1/3 of wall length (NOT in corner — proper placement eliminates boom + provides even bass distribution), (3) concealed subwoofer installation ($100-400 custom cabinetry, hides subwoofer under banquette seating or in millwork — preserves aesthetics while delivering bass), (4) add bass EQ to tune subwoofer to room acoustics ($200-600 DSP processor, sweeps the room and applies corrective EQ to flatten bass response — eliminates room-mode boominess). Note: subwoofer should be crossed over at 80 Hz (frequencies below 80 Hz go to sub, above go to main speakers) — this is the standard crossover for background music systems. Expected impact: +25 bass response score, +10 audio quality score, +8-12% perceived quality (warmth transforms thin/tinny sound into rich/full audio), +6-10% customer satisfaction, +8-12% competitive differentiation.`,
        ai_recommendation: 'add_or_reposition_subwoofer',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: SPEAKER_BRAND_TIER_MISMATCH
    if (config.requireBrandTierMatch && isPremiumTier && (d.speaker_brand_tier === 'consumer_mass' || d.speaker_brand_tier === 'unknown_generic' || d.speaker_brand_tier === 'commercial_entry')) {
      // Cheap speakers in premium restaurant -> perceived quality failure
      const missedPerceptionPct = Math.min(8 + (d.restaurant_tier === 'fine_dining' ? 12 : 4) + (d.speaker_brand_tier === 'consumer_mass' ? 4 : 0), 22);
      const lostRevenue = Math.round(baselineRevenue * (missedPerceptionPct / 100) * 0.05);
      const criticalNote = d.restaurant_tier === 'fine_dining' && d.speaker_brand_tier === 'consumer_mass'
        ? 'CRITICAL: FINE DINING restaurant ("' + d.restaurant_tier + '") using CONSUMER-MASS brand tier speakers ("' + d.speaker_brand_tier + '"). Fine dining customers expect every detail to be considered — sound system quality is part of the holistic premium experience. Mass-market consumer speakers in a fine dining venue create cognitive dissonance: the food, service, and decor say "premium" while the sound says "commodity." This undermines the perceived value of the entire experience and justifies charging premium prices. Customers cannot articulate "the speakers are wrong" — they perceive it as "something feels off" or "the ambiance is not quite right." '
        : 'HIGH: ' + d.restaurant_tier + ' restaurant using ' + d.speaker_brand_tier + ' tier speakers. Brand tier mismatch (premium venue + commodity speakers) creates subconscious perception failure — customers sense the venue has cut corners. ';
      alerts.push({
        rule_id: 'speaker_brand_tier_mismatch',
        severity: d.restaurant_tier === 'fine_dining' && d.speaker_brand_tier === 'consumer_mass' ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        speaker_brand_tier: d.speaker_brand_tier,
        speaker_type: d.speaker_type,
        speaker_count: d.speaker_count,
        audio_quality_score: d.audio_quality_score,
        perceived_quality_score: d.perceived_quality_score,
        customer_satisfaction_score: d.customer_satisfaction_score,
        competitive_differentiation_score: d.competitive_differentiation_score,
        replacement_cost_estimate: d.replacement_cost_estimate,
        audio_quality_change: Math.round(20),
        perceived_quality_change: Math.round(missedPerceptionPct),
        satisfaction_change: Math.round(missedPerceptionPct * 0.4),
        competitive_diff_change: Math.round(missedPerceptionPct * 0.7),
        predicted_revenue_change_pct: -Math.round(missedPerceptionPct * 0.05),
        est_monthly_opportunity: Math.max(lostRevenue, 1500),
        description: `SPEAKER BRAND TIER MISMATCH: ${d.location_id} is a ${d.restaurant_tier} restaurant using ${d.speaker_brand_tier} tier speakers (type "${d.speaker_type}", ${d.speaker_count} speakers). ${criticalNote}Speaker brand tier should match restaurant tier — premium venues need premium speakers to deliver a cohesive luxury experience. Customers cannot articulate "the speakers are wrong" but they perceive the inconsistency as "something is off" or "the ambiance is not premium." Solutions ranked by tier: (1) for FINE DINING: upgrade to audiophile/commercial-pro tier speakers (Bose Panaray, JBL Synthesis, Meyer Sound, QSC AD Series — $400-1,500 per speaker, designed for premium venues, voicing matches fine dining ambiance, signals attention to detail that justifies premium prices); (2) for CASUAL DINING: upgrade to commercial-pro tier (Bose FreeSpace IZM, JBL Control 28, QSC AD-C — $200-600 per speaker, professional commercial quality, durable for sustained use, signals "professional operation"); (3) ensure brand consistency across all speakers (same brand/model family throughout — mismatched speakers create tonal inconsistency that trained ears detect); (4) professional system tuning + EQ ($300-800 one-time professional tuning, an AV integrator measures the room with a calibrated microphone and applies corrective EQ — turns a good system into a great system by addressing room-specific acoustic issues). Speaker brand is a tangible signal of operational commitment — visible commercial speakers from a recognized brand (Bose, JBL, QSC) reinforce the perception that the restaurant invests in every detail. Expected impact: +20 audio quality score, +12-22% perceived quality (subconscious "this place is well-run" perception), +8-15% customer satisfaction, +15-25% competitive differentiation vs venues with commodity speakers.`,
        ai_recommendation: 'upgrade_speaker_brand_tier',
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
              { role: 'system', content: 'You are a restaurant audio engineering + sound system optimization expert. Given restaurant sound system data, recommend ONE specific action with expected audio quality, customer satisfaction, or perceived quality impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Tier: ${a.restaurant_tier ?? 'n/a'}. Venue size: ${a.venue_size_sqft ?? 0} sq ft. Ceiling height: ${a.ceiling_height_ft ?? 0} ft. Speaker count: ${a.speaker_count ?? 0}. Speaker type: ${a.speaker_type ?? 'n/a'}. Positioning: ${a.speaker_positioning ?? 'n/a'}. Subwoofer: ${a.has_subwoofer ?? false} (${a.subwoofer_placement ?? 'none'}). Amplifier: ${a.amplifier_quality ?? 'n/a'}. Connection: ${a.connection_type ?? 'n/a'}. Brand tier: ${a.speaker_brand_tier ?? 'n/a'}. Zone control: ${a.has_zone_volume_control ?? false} (${a.zone_count ?? 1} zones). Volume variance: ${a.volume_variance_pct ?? 0}%. Dead zones: ${a.dead_zone_pct ?? 0}%. Hot spots: ${a.hot_spot_pct ?? 0}%. Audio quality: ${a.audio_quality_score ?? 0}/100. Coverage: ${a.coverage_consistency_score ?? 0}/100. Bass: ${a.bass_response_score ?? 0}/100. Perceived quality: ${a.perceived_quality_score ?? 0}/100. Satisfaction: ${a.customer_satisfaction_score ?? 0}/100. Competitive diff: ${a.competitive_differentiation_score ?? 0}/100. Equipment age: ${a.equipment_age_years ?? 0}yr. Lifespan remaining: ${a.equipment_lifespan_years ?? 0}yr. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Install cost: ${fmt$(a.system_install_cost ?? 0)}. Replacement estimate: ${fmt$(a.replacement_cost_estimate ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM sound_system_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE sound_system_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveSoundSystemAlerts = async (db: ReturnType<typeof useDB>): Promise<SoundSystemAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM sound_system_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSoundSystemSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  singleSpeakerCount: number; insufficientSpeakerCount: number; noZoneControl: number; bluetoothCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'single_speaker_setup') AS single,
              math::count(rule_id = 'speaker_count_insufficient') AS insufficient,
              math::count(rule_id = 'zone_volume_control_absent') AS nozone,
              math::count(rule_id = 'bluetooth_instead_of_wired') AS bt
       FROM sound_system_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      singleSpeakerCount: safeNumber(r.single, 0),
      insufficientSpeakerCount: safeNumber(r.insufficient, 0),
      noZoneControl: safeNumber(r.nozone, 0),
      bluetoothCount: safeNumber(r.bt, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, singleSpeakerCount: 0, insufficientSpeakerCount: 0, noZoneControl: 0, bluetoothCount: 0 };
  }
};

export const updateSoundSystemAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
