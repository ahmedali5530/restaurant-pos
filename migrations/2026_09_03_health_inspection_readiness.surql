-- Migration: 2026_09_03_health_inspection_readiness.surql
--
-- AI Health Inspection Readiness Predictor — 63rd POSR-exclusive differentiator.
--
-- Research finding: Restaurants face surprise health inspections that cost
-- $500-5,000 per violation + letter grade drops (NYC data: A→B = 15-30%
-- revenue loss per grade drop) + temporary closures ($10k-50k/week lost
-- revenue) + reputation damage (public grade postings on Yelp/Google).
-- (FDA Food Code, National Restaurant Association Food Safety Report)
--
-- Common inspection failure points (FDA Food Code priority violations):
--   1. Temperature control: hot food <135°F or cold food >41°F (bacterial growth)
--   2. Food contact surfaces not sanitized (chlorine 50-100ppm, quat 200ppm)
--   3. Pest infestation: rodent/roach/flies (sightings + droppings)
--   4. Chemical storage: cleaners stored near food (cross-contamination risk)
--   5. Hand washing: sinks blocked, no soap, no paper towels
--   6. Cross-contamination: raw meat above ready-to-eat food in walk-in
--   7. Expired/misdated food: past use-by date, no date marking (7-day rule)
--   8. Employee training: no food handler certification, sick employee working
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO health inspection
-- readiness features. Third-party solutions (Sustainability/Datassential,
-- Jolt, Crunchtime) cost $100-300/mo for digital checklists but DON'T predict
-- inspection readiness score or AI-prioritize violations.
--
-- POSR's existing services cover DIFFERENT safety aspects:
--   - compliance-tracking.service = EMPLOYEE certifications (food handler,
--     alcohol server permits) — NOT kitchen sanitation/inspection readiness
--   - food-safety.service = FOOD temperature/handling rules (specific dish
--     temps) — NOT overall inspection readiness scoring
--   - complaint-pattern.service = CUSTOMER complaint patterns — NOT health
--     dept inspection violations
--   - allergen-risk.service = ALLERGEN cross-contamination risk — NOT general
--     health inspection
--   - shrinkage-detection.service = INVENTORY theft/shrinkage — NOT safety
--
-- This new service predicts HEALTH INSPECTION READINESS:
--   - Scores 0-100 readiness across 8 FDA Food Code priority areas
--   - Tracks daily/weekly compliance checklists (auto-reminders for missed)
--   - Predicts letter grade (A/B/C) based on current violations
--   - Flags critical violations needing immediate correction
--   - Estimates revenue risk ($ loss if grade drops)
--   - AI-prioritizes fixes by impact + ease

DEFINE TABLE IF NOT EXISTS health_readiness_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON health_readiness_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON health_readiness_alert TYPE string;
  -- 'temperature_control' | 'surface_sanitation' | 'pest_control' |
  -- 'chemical_storage' | 'hand_hygiene' | 'cross_contamination' |
  -- 'expired_food' | 'training_certification'
DEFINE FIELD IF NOT EXISTS severity        ON health_readiness_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS zone            ON health_readiness_alert TYPE string;
  -- 'kitchen' | 'prep_area' | 'walk_in_cooler' | 'walk_in_freezer' |
  -- 'dish_station' | 'front_of_house' | 'storage' | 'restrooms'
DEFINE FIELD IF NOT EXISTS violation_type  ON health_readiness_alert TYPE string;
  -- 'priority' | 'core' | 'foundation' (FDA Food Code categories)
DEFINE FIELD IF NOT EXISTS current_score   ON health_readiness_alert TYPE float DEFAULT 0;
  -- zone score 0-100 for this rule area
DEFINE FIELD IF NOT EXISTS target_score    ON health_readiness_alert TYPE float DEFAULT 95;
  -- target readiness score
DEFINE FIELD IF NOT EXISTS last_check_date ON health_readiness_alert TYPE option<datetime>;
  -- when was this area last checked
DEFINE FIELD IF NOT EXISTS days_overdue     ON health_readiness_alert TYPE option<int>;
  -- days since last check (if overdue)
DEFINE FIELD IF NOT EXISTS est_fine         ON health_readiness_alert TYPE float DEFAULT 0;
  -- estimated $ fine if violation found during inspection
DEFINE FIELD IF NOT EXISTS est_revenue_risk ON health_readiness_alert TYPE float DEFAULT 0;
  -- $ revenue at risk if grade drops due to this violation
DEFINE FIELD IF NOT EXISTS checklist_item  ON health_readiness_alert TYPE string;
  -- specific checklist item that triggered the alert
DEFINE FIELD IF NOT EXISTS correction_action ON health_readiness_alert TYPE string;
  -- what needs to be done to fix
DEFINE FIELD IF NOT EXISTS est_fix_time_min ON health_readiness_alert TYPE option<int>;
  -- estimated minutes to fix
DEFINE FIELD IF NOT EXISTS description     ON health_readiness_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON health_readiness_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON health_readiness_alert TYPE option<string>;
  -- 'fix_now' | 'schedule_fix' | 'retrain_staff' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON health_readiness_alert TYPE string DEFAULT 'open';
  -- 'open' | 'fixed' | 'scheduled' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON health_readiness_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON health_readiness_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_health_rule     ON health_readiness_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_health_status   ON health_readiness_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_health_severity ON health_readiness_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_health_zone     ON health_readiness_alert FIELDS zone;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS health_ai_enabled          ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS health_target_grade        ON settings TYPE option<string> DEFAULT 'A';
  -- target letter grade: 'A' | 'B' | 'C'
DEFINE FIELD IF NOT EXISTS health_checklist_frequency ON settings TYPE option<int> DEFAULT 1;
  -- checklist completion frequency per day
DEFINE FIELD IF NOT EXISTS health_grade_a_threshold  ON settings TYPE option<float> DEFAULT 90.0;
  -- readiness score >= 90 = A grade
DEFINE FIELD IF NOT EXISTS health_grade_b_threshold  ON settings TYPE option<float> DEFAULT 80.0;
  -- readiness score >= 80 = B grade
