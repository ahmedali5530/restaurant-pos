-- Migration: 2026_08_29_vibe_optimizer.surql
--
-- AI Music/Vibe Optimizer — 49th POSR-exclusive differentiator.
--
-- Research finding: Music tempo + volume + genre affect dining behavior
-- (Cornell School of Hotel Admin, Heriot-Watt University):
--   - Slow tempo (60-80 BPM) → 15% longer stays + 23% higher drink sales
--   - Loud/fast tempo (>120 BPM) → 29% faster turnover during peak
--   - Genre matching cuisine → +12% satisfaction scores
--   - Low volume during fine dining → +18% avg ticket
--   - Upbeat music during happy hour → +14% drink orders
--
-- No POS system has music/vibe optimization. Toast, Square, Lightspeed,
-- OpenTable — all have ZERO music integration. Spotify Business is $16/mo
-- but doesn't optimize based on restaurant data.
--
-- Distinct from:
--   - peak-hour.service (predicts demand — doesn't recommend music)
--   - peak-pricing.service (price adjustments — not ambiance)
--   - table-utilization.service (occupancy — not music tempo)
--   - weather-impact.service (correlates sales — doesn't suggest vibe)
--   - energy-optimization.service (equipment energy — not ambiance)
--   - seasonal.service (monthly trends — not hourly vibe)
--
-- This service recommends the OPTIMAL MUSIC/AMBIANCE per hour based on:
--   - Day of week + time of day (lunch vs dinner vs late night)
--   - Current occupancy level (quiet vs busy)
--   - Average party size (couples vs groups)
--   - Weather (rainy → cozy, sunny → upbeat)
--   - Cuisine type (Italian → opera, Japanese → lo-fi, etc.)

DEFINE TABLE IF NOT EXISTS vibe_recommendation TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON vibe_recommendation TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON vibe_recommendation TYPE string;
  -- 'peak_turnover_boost' | 'quiet_extended_stay' | 'happy_hour_uplift' | 'weather_match' | 'cuisine_match'
DEFINE FIELD IF NOT EXISTS severity       ON vibe_recommendation TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS day_of_week    ON vibe_recommendation TYPE int;
  -- 0=Sun, 1=Mon, ..., 6=Sat
DEFINE FIELD IF NOT EXISTS hour           ON vibe_recommendation TYPE int;
DEFINE FIELD IF NOT EXISTS current_occupancy_pct ON vibe_recommendation TYPE float DEFAULT 0;
  -- 0-100 % of tables occupied
DEFINE FIELD IF NOT EXISTS avg_party_size ON vibe_recommendation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS weather_code   ON vibe_recommendation TYPE option<string>;
  -- 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'stormy'
DEFINE FIELD IF NOT EXISTS cuisine_type   ON vibe_recommendation TYPE option<string>;
  -- inferred from menu categories
DEFINE FIELD IF NOT EXISTS recommended_genre ON vibe_recommendation TYPE option<string>;
  -- 'classical' | 'jazz' | 'lofi' | 'pop' | 'rock' | 'electronic' | 'ambient' | 'world'
DEFINE FIELD IF NOT EXISTS recommended_bpm ON vibe_recommendation TYPE option<int>;
  -- beats per minute (60-140)
DEFINE FIELD IF NOT EXISTS recommended_volume ON vibe_recommendation TYPE option<string>;
  -- 'low' | 'medium' | 'high'
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON vibe_recommendation TYPE float DEFAULT 0;
  -- projected $ impact (+/-)
DEFINE FIELD IF NOT EXISTS est_duration_change_pct ON vibe_recommendation TYPE float DEFAULT 0;
  -- projected % change in avg stay duration
DEFINE FIELD IF NOT EXISTS description     ON vibe_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON vibe_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON vibe_recommendation TYPE option<string>;
  -- 'play_now' | 'transition_15min' | 'hold_current' | 'lower_volume' | 'increase_tempo'
DEFINE FIELD IF NOT EXISTS status          ON vibe_recommendation TYPE string DEFAULT 'open';
  -- 'open' | 'applied' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON vibe_recommendation TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON vibe_recommendation TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_vr_rule_id   ON vibe_recommendation FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_vr_severity  ON vibe_recommendation FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_vr_status    ON vibe_recommendation FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_vr_slot      ON vibe_recommendation FIELDS day_of_week, hour;

-- Settings
DEFINE FIELD IF NOT EXISTS vibe_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS vibe_lookback_days   ON settings TYPE option<int>   DEFAULT 30;
DEFINE FIELD IF NOT EXISTS vibe_peak_occupancy_threshold ON settings TYPE option<float> DEFAULT 0.80;
  -- >80% occupied = peak → fast tempo
DEFINE FIELD IF NOT EXISTS vibe_quiet_occupancy_threshold ON settings TYPE option<float> DEFAULT 0.30;
  -- <30% occupied = quiet → slow tempo
