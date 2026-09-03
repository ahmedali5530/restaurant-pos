-- Migration: 2026_08_28_compliance_tracking.surql
--
-- AI Employee Compliance Document Tracking — 28th POSR-exclusive differentiator.
--
-- Research finding: Restaurants face $500-5k fines for employees with expired
-- compliance documents (food handler certs, alcohol server permits, health
-- cards). Toast, Square, Lightspeed have NO document expiry tracking. POSR
-- predicts which documents will expire soon, notifies managers before expiry,
-- and tracks compliance rates per branch.
--
-- Distinct from:
--   - food-safety.service (HACCP temperature monitoring, not document compliance)
--   - training-need.service (predicts training needs from performance, not doc expiry)
--   - staff-turnover.service (predicts departure, not compliance status)
--
-- This service tracks DOCUMENT EXPIRY compliance — food handler certs, alcohol
-- permits, health cards, food safety certifications.
--
-- Detection:
--   1. EXPIRED — document already expired (critical, employee can't legally work)
--   2. EXPIRING_CRITICAL — expires within 7 days (urgent renewal needed)
--   3. EXPIRING_SOON — expires within 30 days (renewal window)
--   4. EXPIRING_WARNING — expires within 60 days (planning window)
--   5. NO_DOCUMENT — employee missing required document entirely
--
-- AI: per-employee insight + recommendation
--   renew_now | schedule_renewal | suspend_employee | notify_employee | no_action

DEFINE TABLE IF NOT EXISTS compliance_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON compliance_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS employee        ON compliance_alert TYPE option<record<employee>>;
DEFINE FIELD IF NOT EXISTS employee_name   ON compliance_alert TYPE string;
DEFINE FIELD IF NOT EXISTS position        ON compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS department      ON compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS document_id     ON compliance_alert TYPE option<record<employee_document>>;
DEFINE FIELD IF NOT EXISTS document_title  ON compliance_alert TYPE string;
DEFINE FIELD IF NOT EXISTS document_category ON compliance_alert TYPE option<string>;
  -- 'food_handler_cert' | 'alcohol_permit' | 'health_card' | 'food_safety_cert' | 'other'
DEFINE FIELD IF NOT EXISTS status          ON compliance_alert TYPE string;
  -- 'expired' | 'expiring_critical' | 'expiring_soon' | 'expiring_warning' | 'no_document'
DEFINE FIELD IF NOT EXISTS expiry_date      ON compliance_alert TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS days_until_expiry ON compliance_alert TYPE int;
DEFINE FIELD IF NOT EXISTS est_fine_risk    ON compliance_alert TYPE float DEFAULT 0;
  -- estimated $ fine if employee works with expired/missing doc
DEFINE FIELD IF NOT EXISTS ai_insight      ON compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON compliance_alert TYPE option<string>;
  -- 'renew_now' | 'schedule_renewal' | 'suspend_employee' | 'notify_employee' | 'no_action'
DEFINE FIELD IF NOT EXISTS action_taken    ON compliance_alert TYPE string DEFAULT 'none';
  -- 'none' | 'renewed' | 'scheduled' | 'suspended' | 'notified' | 'dismissed'
DEFINE FIELD IF NOT EXISTS detected_at     ON compliance_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON compliance_alert TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_ca_employee   ON compliance_alert FIELDS employee;
DEFINE INDEX IF NOT EXISTS idx_ca_status     ON compliance_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ca_action    ON compliance_alert FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_ca_detected   ON compliance_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS compliance_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS compliance_critical_days     ON settings TYPE option<int>   DEFAULT 7;
  -- expires within 7 days = critical
DEFINE FIELD IF NOT EXISTS compliance_soon_days        ON settings TYPE option<int>   DEFAULT 30;
  -- expires within 30 days = soon
DEFINE FIELD IF NOT EXISTS compliance_warning_days     ON settings TYPE option<int>   DEFAULT 60;
  -- expires within 60 days = warning
DEFINE FIELD IF NOT EXISTS compliance_avg_fine          ON settings TYPE option<float> DEFAULT 1500;
  -- average fine per violation ($1,500 per NRA)
