-- Migration: 2026_08_30_cleaning_scheduler.surql
--
-- AI Predictive Cleaning Schedule — 65th POSR-exclusive differentiator.
--
-- Research finding: Restaurants fail 30% of health inspections due to cleaning
-- lapses (FDA Food Code compliance study). Fixed cleaning schedules (e.g.
-- "clean bathrooms every 2 hours") are inefficient — they over-clean during
-- slow periods and under-clean during peaks. Predictive cleaning based on
-- actual traffic reduces cleaning labor 20-30% while improving compliance
-- (Restaurant Business magazine).
--
-- Toast, Square, Lightspeed have task management but NO predictive cleaning.
-- Swept ($50/mo) has basic cleaning checklists but no AI scheduling.
-- POSR's compliance-tracking.service tracks compliance status but doesn't
-- GENERATE cleaning schedules. food-safety.service monitors temperatures but
-- not cleaning tasks.
--
-- Distinct from:
--   - compliance-tracking.service (tracks compliance STATUS — doesn't generate
--     cleaning schedules)
--   - food-safety.service (monitors TEMPERATURES — not cleaning tasks)
--   - scheduling.service (STAFF scheduling — not cleaning task scheduling)
--   - kitchen-prep-scheduler.service (DISH prep — not cleaning)
--   - equipment-maintenance.service (EQUIPMENT maintenance — not surface cleaning)

DEFINE TABLE IF NOT EXISTS cleaning_schedule TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON cleaning_schedule TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON cleaning_schedule TYPE string;
  -- 'traffic_triggered' | 'time_based' | 'inspection_prep' | 'deep_clean_due' | 'compliance_overdue'
DEFINE FIELD IF NOT EXISTS severity       ON cleaning_schedule TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS task_name      ON cleaning_schedule TYPE option<string>;
  -- e.g. 'bathroom_clean', 'kitchen_surface_wipe', 'floor_mop', 'grease_trap', 'ice_machine_sanitize'
DEFINE FIELD IF NOT EXISTS zone            ON cleaning_schedule TYPE option<string>;
  -- 'dining' | 'kitchen' | 'bathroom' | 'bar' | 'storage' | 'exterior'
DEFINE FIELD IF NOT EXISTS last_cleaned   ON cleaning_schedule TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS hours_since_cleaned ON cleaning_schedule TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS traffic_since_cleaned ON cleaning_schedule TYPE int DEFAULT 0;
  -- customer count since last cleaning
DEFINE FIELD IF NOT EXISTS recommended_time ON cleaning_schedule TYPE option<datetime>;
  -- when to clean next
DEFINE FIELD IF NOT EXISTS urgency_score  ON cleaning_schedule TYPE float DEFAULT 0;
  -- 0-100, higher = more urgent
DEFINE FIELD IF NOT EXISTS est_labor_minutes ON cleaning_schedule TYPE int DEFAULT 0;
  -- estimated time to complete task
DEFINE FIELD IF NOT EXISTS assigned_staff ON cleaning_schedule TYPE option<string>;
DEFINE FIELD IF NOT EXISTS inspection_risk ON cleaning_schedule TYPE float DEFAULT 0;
  -- 0-1, risk of failing inspection if not cleaned
DEFINE FIELD IF NOT EXISTS description     ON cleaning_schedule TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON cleaning_schedule TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON cleaning_schedule TYPE option<string>;
  -- 'clean_now' | 'schedule_next_hour' | 'assign_staff' | 'monitor' | 'postpone'
DEFINE FIELD IF NOT EXISTS status          ON cleaning_schedule TYPE string DEFAULT 'open';
  -- 'open' | 'assigned' | 'completed' | 'overdue' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON cleaning_schedule TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON cleaning_schedule TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_cs_rule_id   ON cleaning_schedule FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_cs_severity  ON cleaning_schedule FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_cs_status    ON cleaning_schedule FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_cs_zone      ON cleaning_schedule FIELDS zone;

-- Settings
DEFINE FIELD IF NOT EXISTS cleaning_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS cleaning_traffic_threshold ON settings TYPE option<int>   DEFAULT 50;
  -- clean after 50 customers since last clean
DEFINE FIELD IF NOT EXISTS cleaning_time_threshold   ON settings TYPE option<int>   DEFAULT 4;
  -- clean after 4 hours since last clean
DEFINE FIELD IF NOT EXISTS cleaning_inspection_window ON settings TYPE option<int>  DEFAULT 7;
  -- inspection prep starts 7 days before scheduled inspection
