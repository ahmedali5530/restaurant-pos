-- Migration: 2026_09_18_multi_location_benchmark.surql
--
-- AI Multi-Location Performance Benchmarking — 97th POSR-exclusive differentiator.
--
-- Research finding: Multi-location restaurants lose $2,000-10,000/mo per
-- underperforming location (NRA Multi-Unit Operator Survey):
--   - Revenue gap: top vs bottom location varies 30-50% → $5,000-15,000/mo gap
--   - Cost overrun: worst location spends 20%+ more on labor/food → $2,000-5,000/mo
--   - Staff efficiency: top location 2x more covers/hour → lost throughput
--   - Customer satisfaction: 0.5 star gap → 15% fewer repeat visits
--   - Quality gap: food cost % varies 5-10% between locations → $1,000-3,000/mo
--   - Best practices: top location has innovations not shared → missed opportunity
--   - Underperformer drag: worst location drags entire brand reputation
--   - Cross-training gap: staff can't cover between locations → scheduling rigidity
--
-- Classic POS systems (Toast Multi-Location, Square Multi-Store, Lightspeed
-- Multi-Site) show basic per-location sales but DON'T BENCHMARK performance.
-- Toast Multi-Location Reporting ($100+/mo) is static data — no AI insights,
-- no best-practice identification, no cross-location optimization.
-- branch-comparison.service compares basic metrics but doesn't identify root
-- causes or transfer best practices.
--
-- POSR's existing services:
--   - branch-comparison.service = basic metric comparison (revenue, orders, AOV)
--     — NOT root cause analysis, best-practice transfer, or performance scoring
--   - inventory-transfer.service = stock movement between locations — NOT
--     performance benchmarking
--   - All other services operate per-location — NOT cross-location
--
-- This new service BENCHMARKS MULTI-LOCATION PERFORMANCE:
--   - Scores each location on 6 dimensions (revenue, cost, efficiency, quality,
--     satisfaction, growth)
--   - Identifies top performers + underperformers
--   - Analyzes root causes of performance gaps
--   - Transfers best practices from top to bottom
--   - Recommends cross-training between locations
--   - Tracks improvement after interventions

DEFINE TABLE IF NOT EXISTS location_benchmark_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON location_benchmark_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON location_benchmark_alert TYPE string;
  -- 'revenue_gap' | 'cost_overrun' | 'staff_efficiency_gap' | 'satisfaction_gap' |
--   'quality_gap' | 'best_practice_opportunity' | 'underperformer_drag' |
--   'cross_training_needed'
DEFINE FIELD IF NOT EXISTS severity        ON location_benchmark_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS location_id     ON location_benchmark_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS location_name   ON location_benchmark_alert TYPE string;
DEFINE FIELD IF NOT EXISTS performance_score ON location_benchmark_alert TYPE option<int>;
  -- 0-100 composite score
DEFINE FIELD IF NOT EXISTS benchmark_location ON location_benchmark_alert TYPE option<string>;
  -- top-performing location for comparison
DEFINE FIELD IF NOT EXISTS revenue_monthly ON location_benchmark_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS cost_pct        ON location_benchmark_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS covers_per_hour ON location_benchmark_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS satisfaction_score ON location_benchmark_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS food_cost_pct   ON location_benchmark_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_revenue_uplift ON location_benchmark_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_cost_savings ON location_benchmark_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON location_benchmark_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON location_benchmark_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON location_benchmark_alert TYPE option<string>;
  -- 'transfer_practice' | 'cost_audit' | 'staff_exchange' | 'quality_review' |
--   'intervene' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON location_benchmark_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON location_benchmark_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON location_benchmark_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_bench_rule      ON location_benchmark_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_bench_status    ON location_benchmark_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_bench_severity  ON location_benchmark_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_bench_location  ON location_benchmark_alert FIELDS location_name;

-- Settings
DEFINE FIELD IF NOT EXISTS bench_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS bench_min_locations   ON settings TYPE option<int> DEFAULT 2;
  -- minimum locations to benchmark (default 2)
DEFINE FIELD IF NOT EXISTS bench_performance_threshold ON settings TYPE option<int> DEFAULT 70;
  -- performance score below which location is flagged as underperformer (default 70)
