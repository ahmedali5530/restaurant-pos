-- Migration: 2026_10_10_table_turnover_velocity.surql
--
-- AI Table Turnover Velocity Optimizer — 119th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $400-1,500/mo per location from slow table
-- turnover caused by unidentified phase bottlenecks (Cornell Table Management,
-- NRA Turnover Study):
--   - Table turnover has 5 phases: seat→order→eat→pay→clear
--   - 1 slow phase blocks entire turnover (bottleneck multiplier)
--   - 40% of slow turnovers caused by PAYMENT phase (waiting for check/terminal)
--   - 25% caused by ORDERING phase (menu indecision, no server available)
--   - 20% caused by CLEARING phase (busser not available)
--   - 10% caused by EATING phase (portion too large, lingering)
--   - 5% caused by SEATING phase (host stand delay)
--   - No POS decomposes turnover into phases to find the bottleneck
--   - Overall turnover metrics hide WHICH phase is slow
--   - Phase-specific interventions unknown (can't fix what you can't see)
--   - Peak-hour revenue lost when tables sit empty during slow phases
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO phase-level turnover
-- analysis. turnover.service (existing) measures overall turnover RATE.
-- table-turnover-predictor.service (88th) predicts WHEN tables free up.
-- table-utilization.service tracks occupancy PATTERNS. seating-optimization
-- optimizes TABLE allocation. None decompose turnover into PHASES to identify
-- which specific phase is the bottleneck.
--
-- This new service DECOMPOSES TABLE TURNOVER into phases:
--   - Tracks duration of each phase (seat, order, eat, pay, clear)
--   - Identifies slowest phase per table (the bottleneck)
--   - Benchmarks phases against optimal durations
--   - Detects phase-specific patterns (payment always slow on weekends)
--   - Recommends phase-targeted interventions (mobile pay, menu simplification)
--   - Tracks phase velocity trends (improving/declining)
--   - Calculates revenue recovered from phase optimization

DEFINE TABLE IF NOT EXISTS table_turnover_velocity_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON table_turnover_velocity_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON table_turnover_velocity_alert TYPE string;
  -- 'bottleneck_phase' | 'payment_phase_slow' | 'ordering_phase_slow' |
--   'clearing_phase_slow' | 'eating_phase_slow' | 'seating_phase_slow' |
--   'phase_velocity_decline' | 'peak_hour_phase_blockage'
DEFINE FIELD IF NOT EXISTS severity        ON table_turnover_velocity_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS table_id        ON table_turnover_velocity_alert TYPE string;
DEFINE FIELD IF NOT EXISTS bottleneck_phase ON table_turnover_velocity_alert TYPE option<string>;
  -- 'seating' | 'ordering' | 'eating' | 'payment' | 'clearing'
DEFINE FIELD IF NOT EXISTS phase_duration_minutes ON table_turnover_velocity_alert TYPE option<float>;
  -- actual duration of bottleneck phase
DEFINE FIELD IF NOT EXISTS optimal_phase_minutes ON table_turnover_velocity_alert TYPE option<float>;
  -- optimal duration for this phase
DEFINE FIELD IF NOT EXISTS phase_overhead_minutes ON table_turnover_velocity_alert TYPE option<float>;
  -- excess time beyond optimal
DEFINE FIELD IF NOT EXISTS total_turnover_minutes ON table_turnover_velocity_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS optimal_turnover_minutes ON table_turnover_velocity_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS party_size      ON table_turnover_velocity_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS time_of_day     ON table_turnover_velocity_alert TYPE option<string>;
  -- 'breakfast' | 'lunch' | 'dinner' | 'late_night'
DEFINE FIELD IF NOT EXISTS day_of_week     ON table_turnover_velocity_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS is_peak_hour    ON table_turnover_velocity_alert TYPE option<bool>;
DEFINE FIELD IF NOT EXISTS est_revenue_recovered ON table_turnover_velocity_alert TYPE option<float>;
  -- revenue recoverable from fixing this phase
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON table_turnover_velocity_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON table_turnover_velocity_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON table_turnover_velocity_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON table_turnover_velocity_alert TYPE option<string>;
  -- 'mobile_payment' | 'menu_simplification' | 'add_busser' | 'server_checkin' |
--   'pre_clear_plates' | 'expedite_seating' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON table_turnover_velocity_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON table_turnover_velocity_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON table_turnover_velocity_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_turnovervel_rule      ON table_turnover_velocity_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_turnovervel_status    ON table_turnover_velocity_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_turnovervel_severity  ON table_turnover_velocity_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_turnovervel_phase     ON table_turnover_velocity_alert FIELDS bottleneck_phase;
DEFINE INDEX IF NOT EXISTS idx_turnovervel_table     ON table_turnover_velocity_alert FIELDS table_id;

DEFINE FIELD IF NOT EXISTS turnovervel_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS turnovervel_overhead_threshold ON settings TYPE option<float> DEFAULT 5.0;
  -- minutes beyond optimal to flag as bottleneck (default 5 min)
DEFINE FIELD IF NOT EXISTS turnovervel_peak_multiplier ON settings TYPE option<float> DEFAULT 2.0;
  -- revenue multiplier during peak hours (default 2x)
DEFINE FIELD IF NOT EXISTS turnovervel_optimal_seating ON settings TYPE option<float> DEFAULT 2.0;
DEFINE FIELD IF NOT EXISTS turnovervel_optimal_ordering ON settings TYPE option<float> DEFAULT 8.0;
DEFINE FIELD IF NOT EXISTS turnovervel_optimal_eating ON settings TYPE option<float> DEFAULT 35.0;
DEFINE FIELD IF NOT EXISTS turnovervel_optimal_payment ON settings TYPE option<float> DEFAULT 5.0;
DEFINE FIELD IF NOT EXISTS turnovervel_optimal_clearing ON settings TYPE option<float> DEFAULT 4.0;
