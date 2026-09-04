-- Migration: 2026_10_05_kitchen_station_efficiency.surql
--
-- AI Kitchen Station Efficiency Benchmark — 114th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,200/mo per location from kitchen
-- station efficiency gaps that go unmeasured (NRA Kitchen Benchmark, Cornell
-- Restaurant Operations):
--   - 40% efficiency gap between best and worst stations in same kitchen
--   - No POS benchmarks stations against each other (only tracks individual perf)
--   - Slowest station sets the pace for entire kitchen (bottleneck multiplier)
--   - Equipment bottlenecks undetected — staff blamed for slow equipment
--   - Best practices from top stations never replicated to underperformers
--   - Idle time at one station while another overflows — no rebalancing
--   - Error/remake rates not tracked per station — quality issues misattributed
--   - Staffing levels never optimized against actual station throughput data
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO station efficiency
-- benchmarking. kitchen-bottleneck detects bottlenecks AFTER they happen.
-- kitchen-demand-surge predicts demand surges. ticket-complexity analyzes
-- per-ticket complexity. kitchen-prep-scheduler schedules daily prep tasks.
-- None benchmark STATIONS against each other in real-time for efficiency,
-- error rate, idle time, and throughput — the core metric for kitchen
-- improvement.
--
-- This new service BENCHMARKS KITCHEN STATIONS against each other:
--   - Tracks prep time per item per station (efficiency)
--   - Tracks idle time per station (utilization)
--   - Tracks error/remake rate per station (quality)
--   - Tracks throughput (items/hour) per station (volume)
--   - Benchmarks stations against own historical performance (trend)
--   - Benchmarks stations against each other (peer comparison)
--   - Identifies slowest station (sets kitchen pace)
--   - Recommends process improvement, training, or equipment upgrades

DEFINE TABLE IF NOT EXISTS station_efficiency_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON station_efficiency_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON station_efficiency_alert TYPE string;
  -- 'slowest_station' | 'efficiency_decline' | 'high_error_station' |
--   'idle_time_excessive' | 'best_performer' | 'equipment_bottleneck' |
--   'staffing_mismatch' | 'cross_station_gap'
DEFINE FIELD IF NOT EXISTS severity        ON station_efficiency_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS station         ON station_efficiency_alert TYPE string;
  -- 'grill' | 'saute' | 'fry' | 'cold' | 'pastry' | 'bar' | 'expediter'
DEFINE FIELD IF NOT EXISTS avg_prep_time   ON station_efficiency_alert TYPE option<float>;
  -- avg minutes per item at this station
DEFINE FIELD IF NOT EXISTS peer_avg_prep_time ON station_efficiency_alert TYPE option<float>;
  -- avg minutes per item across all stations
DEFINE FIELD IF NOT EXISTS idle_time_pct   ON station_efficiency_alert TYPE option<float>;
  -- % of time station is idle
DEFINE FIELD IF NOT EXISTS error_rate_pct  ON station_efficiency_alert TYPE option<float>;
  -- % of items needing remake/correction
DEFINE FIELD IF NOT EXISTS throughput_per_hour ON station_efficiency_alert TYPE option<int>;
  -- items completed per hour
DEFINE FIELD IF NOT EXISTS efficiency_score ON station_efficiency_alert TYPE option<float>;
  -- 0-100 composite efficiency score
DEFINE FIELD IF NOT EXISTS peer_avg_efficiency ON station_efficiency_alert TYPE option<float>;
  -- avg efficiency score across all stations
DEFINE FIELD IF NOT EXISTS efficiency_trend ON station_efficiency_alert TYPE option<string>;
  -- 'improving' | 'stable' | 'declining'
DEFINE FIELD IF NOT EXISTS previous_efficiency ON station_efficiency_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS staff_count     ON station_efficiency_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS optimal_staff_count ON station_efficiency_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS items_today     ON station_efficiency_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON station_efficiency_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON station_efficiency_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON station_efficiency_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON station_efficiency_alert TYPE option<string>;
  -- 'investigate_process' | 'train_staff' | 'upgrade_equipment' | 'rebalance_staff' |
--   'replicate_best_practices' | 'standardize_procedures' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON station_efficiency_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON station_efficiency_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON station_efficiency_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_stationeff_rule      ON station_efficiency_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_stationeff_status    ON station_efficiency_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_stationeff_severity  ON station_efficiency_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_stationeff_station   ON station_efficiency_alert FIELDS station;

DEFINE FIELD IF NOT EXISTS stationeff_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS stationeff_slow_threshold ON settings TYPE option<float> DEFAULT 30.0;
  -- % slower than peer avg to flag as slowest station (default 30%)
DEFINE FIELD IF NOT EXISTS stationeff_error_threshold ON settings TYPE option<float> DEFAULT 8.0;
  -- error rate % to flag as high-error station (default 8%)
DEFINE FIELD IF NOT EXISTS stationeff_idle_threshold ON settings TYPE option<float> DEFAULT 40.0;
  -- idle time % to flag as excessive (default 40%)
DEFINE FIELD IF NOT EXISTS stationeff_decline_drop ON settings TYPE option<float> DEFAULT 15.0;
  -- efficiency score drop % to flag as declining (default 15%)
