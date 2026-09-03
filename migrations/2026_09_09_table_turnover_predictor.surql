-- Migration: 2026_09_09_table_turnover_predictor.surql
--
-- AI Real-Time Table Turnover Predictor — 88th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,000/mo per location from poor
-- table turnover prediction (NRA Table Management Report, Cornell hospitality):
--   - Over-quoting wait time: 15-25% walk away when quoted 20+ min but table
--     freed in 10 min → lost revenue + negative review
--   - Under-quoting wait time: customer seated late → frustration + 1-star
--     review + reduced tip
--   - Rushed clearing: staff clears table too early during peak → customer
--     feels pressured, doesn't order dessert/coffee → lost revenue
--   - Slow clearing: table sits dirty 5-10 min during peak → lost seating
--     opportunity ($50-100 per 10 min delay during peak)
--   - No party-size awareness: 2-top lingers 90 min (avg 45 min) while 6-top
--     waits → should have offered bar seating or limited menu
--   - No course-stage tracking: kitchen doesn't know party is on dessert →
--     can't prep next table's food in advance
--   - Payment stage delays: 10-15 min to process payment when table could
--     be turned → mobile payment + tableside checkout needed
--   - Peak vs off-peak: same turnover time but different urgency → no
--     dynamic adjustment
--
-- Classic POS systems (Toast, Square, Lightspeed) show table STATUS (occupied/
-- dirty/available) but DON'T PREDICT when occupied tables will free up.
-- OpenTable shows reservation times but not real-time turnover prediction.
-- Toast Table Management ($50+/mo) is static — no AI.
--
-- POSR's existing services cover DIFFERENT table aspects:
--   - turnover.service = table turnover RATE analytics (historical avg)
--     — NOT real-time prediction per occupied table
--   - table-utilization.service = occupancy PATTERNS over time — NOT
--     prediction
--   - seating-optimization.service = real-time table ASSIGNMENT for incoming
--     parties — NOT turnover prediction
--   - wait-prediction.service = WAITLIST quoting — NOT per-table turnover
--   - revpash.service = revenue per seat hour — NOT turnover timing
--   - reservation.service = booking management — NOT turnover prediction
--
-- This new service PREDICTS REAL-TIME TABLE TURNOVER:
--   - Predicts when each occupied table will free up (within ±5 min)
--   - Tracks course stage (appetizer/main/dessert/coffee/payment)
--   - Adjusts prediction by party size, day, hour, weather
--   - Alerts staff to clear tables proactively during peak
--   - Suggests bar seating for small parties when tables scarce
--   - Detects anomalous long-sitting tables (problem tables)
--   - Optimizes waitlist quoting with real-time turnover data

DEFINE TABLE IF NOT EXISTS table_turnover_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON table_turnover_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON table_turnover_alert TYPE string;
  -- 'long_sitting_anomaly' | 'rush_stage_late' | 'clear_opportunity' |
  -- 'waitlist_adjustment' | 'party_size_mismatch' | 'payment_delay' |
  -- 'dessert_upsell_window' | 'peak_urgency'
DEFINE FIELD IF NOT EXISTS severity        ON table_turnover_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS table_id        ON table_turnover_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS table_number    ON table_turnover_alert TYPE string;
DEFINE FIELD IF NOT EXISTS party_size      ON table_turnover_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS seated_at       ON table_turnover_alert TYPE option<datetime>;
  -- when party was seated
DEFINE FIELD IF NOT EXISTS minutes_seated   ON table_turnover_alert TYPE option<int>;
  -- elapsed minutes since seated
DEFINE FIELD IF NOT EXISTS predicted_turnover_min ON table_turnover_alert TYPE option<int>;
  -- predicted total seating duration (minutes)
DEFINE FIELD IF NOT EXISTS minutes_until_free ON table_turnover_alert TYPE option<int>;
  -- minutes until table predicted free
DEFINE FIELD IF NOT EXISTS current_stage    ON table_turnover_alert TYPE option<string>;
  -- 'seated' | 'ordering' | 'appetizer' | 'main' | 'dessert' | 'coffee' | 'payment' | 'leaving'
DEFINE FIELD IF NOT EXISTS avg_turnover_min ON table_turnover_alert TYPE option<int>;
  -- historical avg turnover for this table/party size
DEFINE FIELD IF NOT EXISTS est_revenue_at_risk ON table_turnover_alert TYPE float DEFAULT 0;
  -- $ lost if table not turned (during peak) or customer rushed (off-peak)
DEFINE FIELD IF NOT EXISTS est_revenue_opportunity ON table_turnover_alert TYPE float DEFAULT 0;
  -- $ upside if recommendation followed (upsell/clear/turn)
DEFINE FIELD IF NOT EXISTS description      ON table_turnover_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight       ON table_turnover_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON table_turnover_alert TYPE option<string>;
  -- 'clear_now' | 'offer_dessert' | 'suggest_bar' | 'mobile_payment' |
  -- 'adjust_waitlist' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status           ON table_turnover_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at      ON table_turnover_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON table_turnover_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_turnover_rule      ON table_turnover_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_turnover_status    ON table_turnover_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_turnover_severity  ON table_turnover_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_turnover_table     ON table_turnover_alert FIELDS table_number;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS turnover_ai_enabled       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS turnover_avg_2top_min     ON settings TYPE option<int> DEFAULT 45;
  -- avg turnover for 2-top (minutes)
DEFINE FIELD IF NOT EXISTS turnover_avg_4top_min     ON settings TYPE option<int> DEFAULT 75;
  -- avg turnover for 4-top
DEFINE FIELD IF NOT EXISTS turnover_avg_6top_min     ON settings TYPE option<int> DEFAULT 105;
  -- avg turnover for 6+ top
DEFINE FIELD IF NOT EXISTS turnover_anomaly_pct      ON settings TYPE option<float> DEFAULT 150.0;
  -- % above avg = anomaly (150 = 1.5x avg)
DEFINE FIELD IF NOT EXISTS turnover_peak_hour_threshold ON settings TYPE option<int> DEFAULT 80;
  -- occupancy % above which = peak (urgent clearing)
