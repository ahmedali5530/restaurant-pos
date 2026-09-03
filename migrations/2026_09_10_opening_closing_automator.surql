-- Migration: 2026_09_10_opening_closing_automator.surql
--
-- AI Restaurant Opening & Closing Procedure Automator — 89th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-500/mo per location from inconsistent
-- opening/closing procedures (NRA Operations Report, Restaurant Business):
--   - Forgotten equipment startup: oven not preheated → 15-30 min delay = $50-150
--     lost revenue during breakfast/lunch rush
--   - Missed temperature checks: walk-in cooler not verified → food safety risk
--     ($500-5,000 fine if spoiled food served)
--   - Incomplete cleaning: missed sanitization → health inspection violation
--     ($500-1,500 fine + grade drop)
--   - Unsecured premises: door unlocked, safe open, alarm not set → theft
--     ($2,000-10,000 per incident + insurance premium increase)
--   - Staffing gaps: opener doesn't show → 30-60 min late opening = $200-500
--     lost revenue + customer walk-aways
--   - Inventory prep gaps: key ingredients not prepped → stockout during rush
--     ($50-200 per stockout item)
--   - System failures: POS not booted, payment terminal offline → can't take
--     orders/payments for 10-20 min = $100-300 lost
--   - Closing shortcuts: equipment left on overnight = $50-100/mo energy waste;
--     food not stored properly = $100-300 spoilage
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO opening/closing
-- procedure automation. Managers use paper checklists (lost, incomplete,
-- not verified) or whiteboards (not trackable). Third-party task managers
-- (Jolt, Crunchtime, Zenput) cost $100-300/mo for digital checklists but
-- DON'T predict risks or auto-prioritize.
--
-- POSR's existing services cover DIFFERENT operational aspects:
--   - health-inspection-readiness.service = FDA Food Code violation scoring
--     — NOT daily opening/closing procedures
--   - compliance-tracking.service = EMPLOYEE certifications — NOT daily checklists
--   - cleaning.service = PREDICTIVE cleaning schedule (traffic-based) — NOT
--     daily opening/closing cleaning
--   - equipment-maintenance.service = EQUIPMENT failure prediction — NOT
--     daily startup/shutdown procedures
--   - prep-sheet-optimizer.service = FOOD prep quantities — NOT equipment/
--     facility procedures
--   - energy-optimization.service = ENERGY waste detection — NOT procedure
--     automation
--
-- This new service AUTOMATES OPENING & CLOSING PROCEDURES:
--   - Generates daily opening checklist (equipment, temp checks, cleaning,
--     staffing, inventory, systems)
--   - Generates daily closing checklist (equipment shutdown, food storage,
--     security, cleaning, cash reconciliation)
--   - Tracks completion with timestamps + staff accountability
--   - Alerts on missed/overdue tasks
--   - Predicts risk based on historical completion patterns
--   - Auto-prioritizes critical tasks during time-constrained openings

DEFINE TABLE IF NOT EXISTS procedure_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON procedure_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON procedure_alert TYPE string;
  -- 'equipment_startup_missed' | 'temp_check_overdue' | 'cleaning_incomplete' |
  -- 'security_breach_risk' | 'staffing_gap_opening' | 'inventory_prep_missed' |
  -- 'system_failure_risk' | 'closing_equipment_left_on'
DEFINE FIELD IF NOT EXISTS severity        ON procedure_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS shift_type      ON procedure_alert TYPE string;
  -- 'opening' | 'closing'
DEFINE FIELD IF NOT EXISTS task_name       ON procedure_alert TYPE string;
  -- specific checklist task that triggered the alert
DEFINE FIELD IF NOT EXISTS zone            ON procedure_alert TYPE option<string>;
  -- 'kitchen' | 'front_of_house' | 'storage' | 'office' | 'exterior'
DEFINE FIELD IF NOT EXISTS assigned_to     ON procedure_alert TYPE option<string>;
  -- staff member assigned to the task
DEFINE FIELD IF NOT EXISTS due_time        ON procedure_alert TYPE option<string>;
  -- HH:MM when task should be completed
DEFINE FIELD IF NOT EXISTS minutes_overdue ON procedure_alert TYPE option<int>;
  -- minutes past due time
DEFINE FIELD IF NOT EXISTS completion_rate_pct ON procedure_alert TYPE option<float>;
  -- % of checklist completed (for aggregate alerts)
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON procedure_alert TYPE float DEFAULT 0;
  -- $ lost if task not completed (delayed opening, stockout, etc.)
DEFINE FIELD IF NOT EXISTS est_risk_cost   ON procedure_alert TYPE float DEFAULT 0;
  -- $ risk if task skipped (fine, theft, spoilage, energy waste)
DEFINE FIELD IF NOT EXISTS description     ON procedure_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON procedure_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON procedure_alert TYPE option<string>;
  -- 'complete_now' | 'reassign' | 'escalate' | 'verify' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON procedure_alert TYPE string DEFAULT 'open';
  -- 'open' | 'completed' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON procedure_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON procedure_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_procedure_rule      ON procedure_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_procedure_status    ON procedure_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_procedure_severity  ON procedure_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_procedure_shift     ON procedure_alert FIELDS shift_type;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS procedure_ai_enabled        ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS procedure_opening_time      ON settings TYPE option<string> DEFAULT '10:00';
  -- restaurant opening time (HH:MM)
DEFINE FIELD IF NOT EXISTS procedure_closing_time      ON settings TYPE option<string> DEFAULT '22:00';
  -- restaurant closing time (HH:MM)
DEFINE FIELD IF NOT EXISTS procedure_opening_prep_min  ON settings TYPE option<int> DEFAULT 60;
  -- minutes before opening to start prep (default 60 min)
DEFINE FIELD IF NOT EXISTS procedure_closing_check_min ON settings TYPE option<int> DEFAULT 30;
  -- minutes after closing to complete checklist (default 30 min)
DEFINE FIELD IF NOT EXISTS procedure_overdue_alert_min ON settings TYPE option<int> DEFAULT 10;
  -- minutes overdue before alert triggers (default 10)
