-- Migration: 2026_08_30_cash_stress_test.surql
--
-- AI Cash Flow Stress Test — 71st POSR-exclusive differentiator.
--
-- Research finding: 60% of restaurant closures are due to cash flow problems
-- that could have been predicted (Cornell CHR). Existing services project
-- NORMAL operations (cash-flow.service) or alert on 7-day shortfalls
-- (cash-early-warning.service). Neither simulates WORST-CASE SCENARIOS:
--   - Revenue drop 30% (pandemic, construction, competitor opens nearby)
--   - Key equipment failure ($5k-$20k repair + lost revenue)
--   - Staff shortage (flu season, mass resignation)
--   - Supplier disruption (price spike, delivery failure)
--   - Regulatory shutdown (health inspection failure, 2-7 days closed)
--
-- Banks require stress tests for loan approvals (BASEL III). Restaurants
-- should stress-test their own cash position. Toast, Square, Lightspeed have
-- NO stress testing. POSR's cash-flow.service projects NORMAL revenue;
-- cash-early-warning alerts on KNOWN obligations. This service simulates
-- DISRUPTION SCENARIOS and predicts survival timeline.
--
-- Distinct from:
--   - cash-flow.service (projects NORMAL 30-day operations — NOT stress)
--   - cash-early-warning.service (7-day known obligations — NOT scenario sim)
--   - revenue-forecast.service (predicts revenue — NOT downside risk)
--   - equipment-maintenance.service (predicts failures — NOT financial impact)
--   - overtime-prediction.service (predicts OT — NOT cash survival)

DEFINE TABLE IF NOT EXISTS cash_stress_test TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON cash_stress_test TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON cash_stress_test TYPE string;
  -- 'revenue_drop' | 'equipment_failure' | 'staff_shortage' | 'supplier_disruption' | 'regulatory_shutdown'
DEFINE FIELD IF NOT EXISTS severity       ON cash_stress_test TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS scenario_name  ON cash_stress_test TYPE string;
  -- human-readable scenario name
DEFINE FIELD IF NOT EXISTS scenario_description ON cash_stress_test TYPE string;
DEFINE FIELD IF NOT EXISTS revenue_impact_pct ON cash_stress_test TYPE float DEFAULT 0;
  -- % revenue reduction (e.g. -0.30 = 30% drop)
DEFINE FIELD IF NOT EXISTS one_time_cost  ON cash_stress_test TYPE float DEFAULT 0;
  -- one-time cost (e.g. $10k equipment repair)
DEFINE FIELD IF NOT EXISTS duration_days  ON cash_stress_test TYPE int DEFAULT 7;
  -- how long the scenario lasts
DEFINE FIELD IF NOT EXISTS current_balance ON cash_stress_test TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS projected_balance_end ON cash_stress_test TYPE float DEFAULT 0;
  -- projected balance at end of scenario
DEFINE FIELD IF NOT EXISTS days_until_insolvent ON cash_stress_test TYPE option<int>;
  -- days until cash runs out (null = survives full duration)
DEFINE FIELD IF NOT EXISTS survival_outcome ON cash_stress_test TYPE string;
  -- 'survives' | 'survives_with_difficulty' | 'insolvent_within_30d' | 'insolvent_within_7d'
DEFINE FIELD IF NOT EXISTS mitigation_actions ON cash_stress_test TYPE option<string>;
  -- JSON: array of recommended actions
DEFINE FIELD IF NOT EXISTS recommended_reserve ON cash_stress_test TYPE float DEFAULT 0;
  -- recommended cash reserve to survive this scenario
DEFINE FIELD IF NOT EXISTS reserve_gap     ON cash_stress_test TYPE float DEFAULT 0;
  -- current_balance - recommended_reserve (negative = under-reserved)
DEFINE FIELD IF NOT EXISTS description     ON cash_stress_test TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON cash_stress_test TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON cash_stress_test TYPE option<string>;
  -- 'build_reserve' | 'get_credit_line' | 'reduce_fixed_costs' | 'insurance_review' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON cash_stress_test TYPE string DEFAULT 'open';
  -- 'open' | 'reviewed' | 'mitigated' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON cash_stress_test TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON cash_stress_test TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_cst_rule_id   ON cash_stress_test FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_cst_severity  ON cash_stress_test FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_cst_status    ON cash_stress_test FIELDS status;

-- Settings
DEFINE FIELD IF NOT EXISTS stress_test_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS stress_test_reserve_target_days ON settings TYPE option<int>   DEFAULT 60;
  -- target cash reserve = 60 days of operating costs
DEFINE FIELD IF NOT EXISTS stress_test_avg_daily_revenue ON settings TYPE option<float> DEFAULT 3000;
  -- fallback avg daily revenue if data unavailable
DEFINE FIELD IF NOT EXISTS stress_test_avg_daily_cost   ON settings TYPE option<float> DEFAULT 2500;
  -- fallback avg daily cost
