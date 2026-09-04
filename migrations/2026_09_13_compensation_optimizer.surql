-- Migration: 2026_09_13_compensation_optimizer.surql
--
-- AI Staff Performance-Based Compensation Optimizer — 92nd POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $500-2,000/mo per location from
-- suboptimal compensation decisions (NRA Workforce Report, SHRM):
--   - Overpaying underperformers: 15-20% of staff are overpaid relative to
--     performance → $300-800/mo wasted payroll
--   - Underpaying top performers: 10-15% of staff are underpaid → they leave
--     ($3,000-5,000 replacement cost per employee)
--   - No performance-based bonus structure: top performers not incentivized
--     → reduced motivation + productivity
--   - Subjective raises: manager favorites get raises, not data-driven
--     → favoritism lawsuits ($10,000-50,000 settlements)
--   - Hours misallocation: top performers get too few hours, underperformers
--     get too many → $200-500/mo lost revenue
--   - No peer comparison: staff don't know where they rank → no motivation
--     to improve
--   - Retention risk from pay: underpaid staff 3x more likely to leave
--   - Customer satisfaction-pay correlation: low-satisfaction staff get same
--     pay as high-satisfaction → no accountability
--
-- Classic POS systems (Toast, Square, Lightspeed) process payroll but DON'T
-- OPTIMIZE compensation. Toast Payroll ($50/mo) is just payroll processing.
-- Third-party compensation tools (Carta, Pave, Pave) are for tech companies,
-- not restaurants. No restaurant-specific compensation optimizer exists.
--
-- POSR's existing services cover DIFFERENT staff aspects:
--   - server-performance.service = SERVER metrics + ranking (sales, tips,
--     accuracy, satisfaction) — NOT compensation optimization
--   - staff-gamification.service = GAME mechanics (leaderboards, badges,
--     challenges) — NOT pay adjustments
--   - retention-program.service = RETENTION plans (personalized stay
--     strategies) — NOT compensation recommendations
--   - server-coach.service = COACHING recommendations (skill development)
--     — NOT pay optimization
--   - staff-turnover.service = TURNOVER prediction (who will leave) — NOT
--     compensation optimization
--   - overtime-prediction.service = OVERTIME forecasting — NOT compensation
--   - training-need.service = TRAINING gap analysis — NOT compensation
--   - tip-analytics.service = TIP distribution fairness — NOT base pay
--
-- This new service OPTIMIZES COMPENSATION:
--   - Analyzes per-staff performance vs pay ratio
--   - Identifies underpaid top performers (retention risk)
--   - Identifies overpaid underperformers (cost waste)
--   - Recommends performance-based bonuses
--   - Suggests raise timing + amount
--   - Recommends hours reallocation (more hours to top performers)
--   - Generates peer comparison percentiles
--   - Tracks satisfaction-pay correlation
--   - Calculates ROI of compensation changes

DEFINE TABLE IF NOT EXISTS compensation_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON compensation_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON compensation_alert TYPE string;
  -- 'underpaid_top_performer' | 'overpaid_underperformer' | 'bonus_eligible' |
--   'raise_due' | 'hours_reallocation' | 'peer_comparison_gap' |
--   'retention_pay_risk' | 'satisfaction_pay_mismatch'
DEFINE FIELD IF NOT EXISTS severity        ON compensation_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS employee_id     ON compensation_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS employee_name   ON compensation_alert TYPE string;
DEFINE FIELD IF NOT EXISTS role            ON compensation_alert TYPE option<string>;
  -- 'server' | 'cook' | 'bartender' | 'host' | 'manager' | 'dishwasher'
DEFINE FIELD IF NOT EXISTS current_hourly_rate ON compensation_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS suggested_rate  ON compensation_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS performance_score ON compensation_alert TYPE option<int>;
  -- 0-100 composite score
DEFINE FIELD IF NOT EXISTS peer_percentile ON compensation_alert TYPE option<int>;
  -- percentile rank among peers (0-100)
DEFINE FIELD IF NOT EXISTS monthly_hours   ON compensation_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS suggested_hours ON compensation_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS monthly_revenue_generated ON compensation_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS monthly_tips    ON compensation_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS customer_satisfaction ON compensation_alert TYPE option<float>;
  -- 0-5 star avg
DEFINE FIELD IF NOT EXISTS est_turnover_cost ON compensation_alert TYPE float DEFAULT 0;
  -- $ cost if employee leaves
DEFINE FIELD IF NOT EXISTS est_payroll_savings ON compensation_alert TYPE float DEFAULT 0;
  -- $ saved by adjusting pay/hours
DEFINE FIELD IF NOT EXISTS est_revenue_uplift ON compensation_alert TYPE float DEFAULT 0;
  -- $ revenue gain from better staffing
DEFINE FIELD IF NOT EXISTS description     ON compensation_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON compensation_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON compensation_alert TYPE option<string>;
  -- 'give_raise' | 'give_bonus' | 'reduce_hours' | 'increase_hours' |
--   'performance_review' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON compensation_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON compensation_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON compensation_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_comp_rule      ON compensation_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_comp_status    ON compensation_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_comp_severity  ON compensation_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_comp_employee  ON compensation_alert FIELDS employee_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS comp_ai_enabled        ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS comp_raise_threshold_pct ON settings TYPE option<float> DEFAULT 90.0;
  -- performance percentile above which raise recommended (default 90th)
DEFINE FIELD IF NOT EXISTS comp_underperformer_threshold_pct ON settings TYPE option<float> DEFAULT 30.0;
  -- performance percentile below which hours reduction considered (default 30th)
DEFINE FIELD IF NOT EXISTS comp_bonus_threshold_score ON settings TYPE option<int> DEFAULT 85;
  -- performance score above which bonus eligible (default 85)
DEFINE FIELD IF NOT EXISTS comp_turnover_cost_per_employee ON settings TYPE option<int> DEFAULT 3000;
  -- avg cost to replace an employee (default $3,000)
