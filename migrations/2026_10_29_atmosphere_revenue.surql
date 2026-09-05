-- Migration: 2026_10_29_atmosphere_revenue.surql
--
-- AI Restaurant Atmosphere Revenue Optimizer — 138th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $400-1,500/mo per location from suboptimal
-- atmosphere settings (Cornell Atmosphere Study, NRA Environment Research):
--   - Atmosphere (music + lighting + temperature + scent + noise) affects spending 15-25%
--   - Lighting too bright at dinner → 12% lower spend (feels like cafeteria)
--   - Temperature too warm → 18% faster eating, less dessert/coffee orders
--   - No POS correlates atmosphere settings with revenue outcomes
--   - Music optimized but lighting/temperature/scent ignored
--   - Same atmosphere all day despite different customer needs (lunch vs dinner)
--   - No A/B testing of atmosphere configurations
--   - Atmosphere changes not tracked → can't learn what works
--   - Seasonal atmosphere needs ignored (warm lighting in winter, bright in summer)
--   - No correlation between atmosphere and specific menu item sales
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO atmosphere-revenue
-- correlation. vibe-optimizer (49th) optimizes MUSIC only. energy-optimization
-- optimizes energy USAGE. floor-plan-optimizer optimizes physical LAYOUT.
-- None correlate the FULL ATMOSPHERE (music + light + temp + scent + noise)
-- with revenue outcomes and recommend adjustments.
--
-- This new service OPTIMIZES ATMOSPHERE FOR REVENUE:
--   - Tracks all ambient factors (music tempo/volume, lighting level, temperature, noise, scent)
--   - Correlates each factor with avg spend, dwell time, satisfaction
--   - Identifies optimal atmosphere configuration per time-of-day
--   - Detects suboptimal settings (lighting too bright at dinner, etc.)
--   - Recommends specific adjustments with predicted revenue impact
--   - Tracks post-adjustment revenue change (validates recommendations)
--   - Correlates atmosphere with specific menu category sales (dessert + coffee need low light)
--   - Recommends seasonal atmosphere adjustments

DEFINE TABLE IF NOT EXISTS atmosphere_revenue_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON atmosphere_revenue_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON atmosphere_revenue_alert TYPE string;
  -- 'lighting_mismatch' | 'temperature_suboptimal' | 'music_tempo_mismatch' |
--   'noise_level_high' | 'atmosphere_spend_correlation' | 'time_of_day_mismatch' |
--   'atmosphere_adjustment_validated' | 'seasonal_atmosphere_shift'
DEFINE FIELD IF NOT EXISTS severity        ON atmosphere_revenue_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS ambient_factor  ON atmosphere_revenue_alert TYPE option<string>;
  -- 'lighting' | 'temperature' | 'music_tempo' | 'music_volume' | 'noise_level' | 'scent'
DEFINE FIELD IF NOT EXISTS current_setting ON atmosphere_revenue_alert TYPE option<string>;
  -- e.g., 'bright', 'dim', 'warm', 'cool', 'fast', 'slow', 'loud', 'quiet'
DEFINE FIELD IF NOT EXISTS recommended_setting ON atmosphere_revenue_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS time_of_day     ON atmosphere_revenue_alert TYPE option<string>;
  -- 'breakfast' | 'lunch' | 'happy_hour' | 'dinner' | 'late_night'
DEFINE FIELD IF NOT EXISTS current_avg_spend ON atmosphere_revenue_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS predicted_avg_spend ON atmosphere_revenue_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS spend_uplift_pct ON atmosphere_revenue_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS current_dwell_time ON atmosphere_revenue_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS recommended_dwell_time ON atmosphere_revenue_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS current_satisfaction ON atmosphere_revenue_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON atmosphere_revenue_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON atmosphere_revenue_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON atmosphere_revenue_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON atmosphere_revenue_alert TYPE option<string>;
  -- 'adjust_lighting' | 'adjust_temperature' | 'change_music' | 'reduce_noise' | 'add_scent' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON atmosphere_revenue_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON atmosphere_revenue_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON atmosphere_revenue_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_atmosrev_rule      ON atmosphere_revenue_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_atmosrev_status    ON atmosphere_revenue_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_atmosrev_severity  ON atmosphere_revenue_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_atmosrev_factor    ON atmosphere_revenue_alert FIELDS ambient_factor;

DEFINE FIELD IF NOT EXISTS atmosrev_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS atmosrev_spend_threshold ON settings TYPE option<float> DEFAULT 10.0;
  -- % spend uplift potential to flag (default 10%)
DEFINE FIELD IF NOT EXISTS atmosrev_dwell_threshold ON settings TYPE option<float> DEFAULT 15.0;
  -- % dwell time gap to flag (default 15%)
