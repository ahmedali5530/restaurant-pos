-- Migration: 2026_08_28_staff_turnover.surql
--
-- AI Staff Turnover Prediction — 9th POSR-exclusive differentiator.
--
-- Research finding: Restaurant industry has 75% annual turnover rate (highest
-- of any industry), costing $5,864 per lost employee (Cornell CHR).
-- Toast, Square, Lightspeed have NO turnover prediction — they only do
-- attendance logging. POSR predicts which employees are likely to leave
-- using 9 risk factors + AI retention recommendations.
--
-- Risk factors (9):
--   1. TENURE_SHORT       — < 6 months tenure (highest-risk window)
--   2. HIGH_OVERTIME      — > 25% of hours are overtime (burnout)
--   3. LOW_UTILIZATION    — < 60% of scheduled shifts actually worked (disengaged)
--   4. SCHEDULE_INSTABILITY — shift changes/cancellations > 2x per week
--   5. NO_PROMOTION       — no position change in 18+ months (stagnation)
--   6. PAY_BELOW_MARKET   — base_rate < department median × 0.9
--   7. RECENT_PERFORMANCE_NOTES — negative performance notes in last 90 days
--   8. SCHEDULE_GAP       — not scheduled in last 14 days (already disengaged)
--   9. PEER_TURNOVER     — 2+ coworkers in same department left in last 90 days
--
-- Each prediction: risk score 0-100 + AI retention recommendation:
--   schedule_check_in | review_compensation | offer_development | reduce_overtime |
--   recognize_publicly | transfer_department | exit_interview | accept_departure

DEFINE TABLE IF NOT EXISTS turnover_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON turnover_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS employee       ON turnover_prediction TYPE option<record<employee>>;
DEFINE FIELD IF NOT EXISTS employee_name  ON turnover_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS position        ON turnover_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS department     ON turnover_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS tenure_days    ON turnover_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS risk_score      ON turnover_prediction TYPE float;
  -- 0-100 (100 = near-certain departure)
DEFINE FIELD IF NOT EXISTS risk_level     ON turnover_prediction TYPE string;
  -- 'low' | 'medium' | 'high' | 'critical'
DEFINE FIELD IF NOT EXISTS risk_factors    ON turnover_prediction TYPE option<object>;
  -- { factor_id: { weight, value, detail } }
DEFINE FIELD IF NOT EXISTS est_replacement_cost ON turnover_prediction TYPE float DEFAULT 0;
  -- estimated cost if employee leaves ($5,864 avg per Cornell)
DEFINE FIELD IF NOT EXISTS ai_insight     ON turnover_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON turnover_prediction TYPE option<string>;
  -- 'schedule_check_in' | 'review_compensation' | 'offer_development' |
  -- 'reduce_overtime' | 'recognize_publicly' | 'transfer_department' |
  -- 'exit_interview' | 'accept_departure'
DEFINE FIELD IF NOT EXISTS action_taken   ON turnover_prediction TYPE string DEFAULT 'none';
  -- 'none' | 'checked_in' | 'comp_reviewed' | 'development_offered' | 'overtime_reduced' |
  -- 'recognized' | 'transferred' | 'exit_interviewed' | 'departed' | 'retained'
DEFINE FIELD IF NOT EXISTS predicted_at    ON turnover_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at      ON turnover_prediction TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS branch_id      ON turnover_prediction TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_tp_employee   ON turnover_prediction FIELDS employee;
DEFINE INDEX IF NOT EXISTS idx_tp_level      ON turnover_prediction FIELDS risk_level;
DEFINE INDEX IF NOT EXISTS idx_tp_predicted   ON turnover_prediction FIELDS predicted_at;
DEFINE INDEX IF NOT EXISTS idx_tp_branch      ON turnover_prediction FIELDS branch_id;

-- Settings
DEFINE FIELD IF NOT EXISTS turnover_ai_enabled          ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS turnover_lookback_days      ON settings TYPE option<int>   DEFAULT 365;
DEFINE FIELD IF NOT EXISTS turnover_tenure_threshold_days ON settings TYPE option<int> DEFAULT 180;
  -- < 6 months tenure triggers TENURE_SHORT
DEFINE FIELD IF NOT EXISTS turnover_overtime_pct        ON settings TYPE option<float> DEFAULT 0.25;
  -- > 25% overtime triggers HIGH_OVERTIME
DEFINE FIELD IF NOT EXISTS turnover_utilization_min     ON settings TYPE option<float> DEFAULT 0.60;
  -- < 60% worked/scheduled triggers LOW_UTILIZATION
DEFINE FIELD IF NOT EXISTS turnover_high_risk_threshold ON settings TYPE option<float> DEFAULT 65;
  -- risk_score >= 65 => 'high' level
DEFINE FIELD IF NOT EXISTS turnover_critical_risk_threshold ON settings TYPE option<float> DEFAULT 85;
  -- risk_score >= 85 => 'critical' level
DEFINE FIELD IF NOT EXISTS turnover_replacement_cost    ON settings TYPE option<float> DEFAULT 5864;
  -- average replacement cost per Cornell CHR
