-- Migration: 2026_08_28_overtime_prediction.surql
--
-- AI Overtime Prediction & Prevention — 41st POSR-exclusive differentiator.
--
-- Research finding: Overtime costs restaurants 8-15% of total labor budget
-- ($15k-40k/year). Toast, Square track overtime AFTER it happens but DON'T
-- predict it BEFORE. POSR forecasts which employees will hit overtime
-- thresholds based on scheduled hours + projected demand + AI recommendations.
--
-- Distinct from:
--   - labor-optimization.service (analyzes labor cost %, not overtime prediction)
--   - scheduling.service (generates schedules, doesn't predict overtime)
--   - staff-turnover.service (predicts departure, not overtime)

DEFINE TABLE IF NOT EXISTS overtime_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON overtime_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS employee       ON overtime_prediction TYPE option<record<employee>>;
DEFINE FIELD IF NOT EXISTS employee_name   ON overtime_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS position        ON overtime_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS scheduled_hours  ON overtime_prediction TYPE float;
  -- hours already scheduled this week
DEFINE FIELD IF NOT EXISTS max_hours       ON overtime_prediction TYPE float;
  -- max regular hours before overtime (typically 40)
DEFINE FIELD IF NOT EXISTS projected_hours ON overtime_prediction TYPE float;
  -- projected total hours including remaining shifts
DEFINE FIELD IF NOT EXISTS overtime_hours  ON overtime_prediction TYPE float DEFAULT 0;
  -- projected overtime hours
DEFINE FIELD IF NOT EXISTS overtime_cost    ON overtime_prediction TYPE float DEFAULT 0;
  -- $ overtime cost
DEFINE FIELD IF NOT EXISTS risk_level      ON overtime_prediction TYPE string;
  -- 'low' | 'medium' | 'high' | 'critical'
DEFINE FIELD IF NOT EXISTS days_until_overtime ON overtime_prediction TYPE int DEFAULT 999;
  -- days until employee hits overtime threshold
DEFINE FIELD IF NOT EXISTS ai_insight      ON overtime_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON overtime_prediction TYPE option<string>;
  -- 'reduce_hours' | 'swap_shift' | 'add_staff' | 'approve_overtime' | 'redistribute'
DEFINE FIELD IF NOT EXISTS action_taken    ON overtime_prediction TYPE string DEFAULT 'none';
  -- 'none' | 'hours_reduced' | 'shift_swapped' | 'staff_added' | 'approved' | 'redistributed'
DEFINE FIELD IF NOT EXISTS predicted_at    ON overtime_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON overtime_prediction TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_op_employee   ON overtime_prediction FIELDS employee;
DEFINE INDEX IF NOT EXISTS idx_op_risk_level ON overtime_prediction FIELDS risk_level;
DEFINE INDEX IF NOT EXISTS idx_op_action     ON overtime_prediction FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_op_predicted  ON overtime_prediction FIELDS predicted_at;

-- Settings
DEFINE FIELD IF NOT EXISTS overtime_pred_ai_enabled  ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS overtime_pred_max_hours    ON settings TYPE option<float> DEFAULT 40;
  -- max regular hours per week
DEFINE FIELD IF NOT EXISTS overtime_pred_ot_rate      ON settings TYPE option<float> DEFAULT 1.5;
  -- overtime multiplier (1.5x)
DEFINE FIELD IF NOT EXISTS overtime_pred_avg_rate    ON settings TYPE option<float> DEFAULT 18;
  -- avg hourly rate for cost estimation
