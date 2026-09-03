-- Migration: 2026_09_06_alcohol_compliance_monitor.surql
--
-- AI Alcohol Service Compliance Monitor — 66th POSR-exclusive differentiator.
--
-- Research finding: Liquor license violations cost restaurants $10k-50k+ per
-- occurrence (ATF, state liquor control boards). Violations include:
--   - Serving minors: $10k-25k fine + license suspension (most common violation)
--   - Over-service (serving visibly intoxicated): dram shop liability $50k-500k
--     if customer causes accident/injury after leaving
--   - Happy hour restrictions: 12+ states ban or restrict happy hour timing
--     (MA, AK, OK, RI, NC, UT, VT — specific time windows prohibited)
--   - Service hours violation: serving past license hours (varies by state,
--     typically 2 AM cutoff, some states 1 AM or midnight)
--   - Uncertified server: 20+ states require TIPS/RAMP certification
--     (alcohol server training) — fines $500-2,500 per violation
--   - Free drink/promotion violations: many states prohibit "2-for-1" or
--     unlimited drinks (deter over-consumption)
--   - Minor decoy stings: state liquor control sends underage decoys —
--     failure = automatic fine + license mark
--   - Dram shop liability: if customer causes injury/death after over-service,
--     restaurant liable for $100k-1M+ lawsuits
--
-- Classic POS systems (Toast, Square, Lightspeed) process alcohol sales but
-- DON'T monitor compliance. They don't:
--   - Verify ID was scanned before alcohol order
--   - Track drinks-per-customer to detect over-service
--   - Alert when service hours approaching cutoff
--   - Verify server's alcohol certification is current
--   - Flag happy hour timing violations
--   - Track comp drinks for free-drink limit compliance
--
-- POSR's existing services cover DIFFERENT compliance aspects:
--   - compliance-tracking.service = EMPLOYEE certifications tracking (food
--     handler + alcohol server permits) — NOT real-time service compliance
--   - order-fraud-detection.service = INTERNAL employee theft/collusion — NOT
--     alcohol service compliance
--   - health-inspection-readiness.service = KITCHEN sanitation — NOT alcohol
--   - chargeback-risk.service = PAYMENT chargeback probability — NOT dram shop
--
-- This new service monitors REAL-TIME ALCOHOL SERVICE COMPLIANCE:
--   - ID verification tracking (was ID scanned for alcohol orders?)
--   - Over-service detection (drinks per customer per hour)
--   - Service hours monitoring (approaching license cutoff)
--   - Happy hour timing compliance (state-specific restrictions)
--   - Server certification verification (TIPS/RAMP current?)
--   - Free drink / promotion limit tracking
--   - Minor decoy sting preparedness
--   - Dram shop risk scoring (over-service pattern → liability exposure)

DEFINE TABLE IF NOT EXISTS alcohol_compliance_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON alcohol_compliance_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON alcohol_compliance_alert TYPE string;
  -- 'id_verification_missing' | 'over_service_risk' | 'service_hours_violation' |
  -- 'happy_hour_violation' | 'server_certification_expired' |
  -- 'free_drink_limit_exceeded' | 'minor_decoy_risk' | 'dram_shop_exposure'
DEFINE FIELD IF NOT EXISTS severity        ON alcohol_compliance_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS compliance_type ON alcohol_compliance_alert TYPE string;
  -- 'state_liquor_law' | 'federal' | 'dram_shop' | 'license_condition'
DEFINE FIELD IF NOT EXISTS order_id        ON alcohol_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_id     ON alcohol_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name   ON alcohol_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS server_id       ON alcohol_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS server_name     ON alcohol_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS drinks_served   ON alcohol_compliance_alert TYPE option<int>;
  -- number of drinks served to this customer
DEFINE FIELD IF NOT EXISTS drinks_per_hour  ON alcohol_compliance_alert TYPE option<float>;
  -- drinks per hour rate
DEFINE FIELD IF NOT EXISTS time_until_cutoff ON alcohol_compliance_alert TYPE option<float>;
  -- hours until service hours cutoff
DEFINE FIELD IF NOT EXISTS est_fine         ON alcohol_compliance_alert TYPE float DEFAULT 0;
  -- estimated $ fine if violation occurs
DEFINE FIELD IF NOT EXISTS est_liability    ON alcohol_compliance_alert TYPE float DEFAULT 0;
  -- estimated dram shop liability exposure
DEFINE FIELD IF NOT EXISTS description      ON alcohol_compliance_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight       ON alcohol_compliance_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON alcohol_compliance_alert TYPE option<string>;
  -- 'stop_service' | 'verify_id' | 'check_certification' | 'warn_server' |
  -- 'log_incident' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status           ON alcohol_compliance_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at      ON alcohol_compliance_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON alcohol_compliance_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_alcohol_rule      ON alcohol_compliance_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_alcohol_status    ON alcohol_compliance_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_alcohol_severity  ON alcohol_compliance_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_alcohol_server    ON alcohol_compliance_alert FIELDS server_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS alcohol_ai_enabled          ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS alcohol_max_drinks_per_hour ON settings TYPE option<float> DEFAULT 3.0;
  -- max drinks per customer per hour before over-service alert
DEFINE FIELD IF NOT EXISTS alcohol_max_drinks_total   ON settings TYPE option<int> DEFAULT 6;
  -- max total drinks per customer before cutoff
DEFINE FIELD IF NOT EXISTS alcohol_service_cutoff_hour ON settings TYPE option<int> DEFAULT 2;
  -- service cutoff hour (2 = 2 AM, varies by state)
DEFINE FIELD IF NOT EXISTS alcohol_require_id_age     ON settings TYPE option<int> DEFAULT 21;
  -- legal drinking age (21 US, 18-19 in some countries)
DEFINE FIELD IF NOT EXISTS alcohol_happy_hour_banned  ON settings TYPE option<bool> DEFAULT false;
  -- state bans happy hour (MA, AK, OK, RI, NC, UT, VT)
DEFINE FIELD IF NOT EXISTS alcohol_free_drink_max     ON settings TYPE option<int> DEFAULT 2;
  -- max comp drinks per customer per day
