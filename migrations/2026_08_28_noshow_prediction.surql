-- Migration: 2026_08_28_noshow_prediction.surql
--
-- AI Reservation No-Show Prediction — 5th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $4-6k/year average to no-shows (up to 20%
-- industry-wide no-show rate). OpenTable has basic no-show scoring but
-- Toast and Square have NO no-show prediction at all. POSR offers it free.
--
-- Uses 10 risk factors computed from historical reservation + customer data:
--   1. CUSTOMER_HISTORY  — prior no-shows by this customer
--   2. NEW_CUSTOMER      — first-time reservation (no history)
--   3. LARGE_PARTY       — party size >= 6 (higher no-show rate)
--   4. PEAK_SLOT         — Fri/Sat 18:00-21:00 (highest no-show window)
--   5. SOURCE_RISK       — online/third-party vs phone (less commitment)
--   6. UNCONFIRMED       — pending status, no confirmation
--   7. LONG_LEAD_TIME    — booked > 14 days ahead (plans change)
--   8. LATE_SLOT         — reservation after 21:00 (drop-off)
--   9. DOW_BIAS         — historical no-show rate for that weekday
--  10. COMMITMENT_BONUS  — special_requests present LOWER risk (more committed)
--
-- Each reservation gets a 0-100 risk score + AI insight + recommendation:
--   confirm_now | require_deposit | call_reminder | overbook_slot | accept_risk | block_customer

DEFINE TABLE IF NOT EXISTS noshow_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON noshow_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS reservation     ON noshow_prediction TYPE option<record<reservation>>;
DEFINE FIELD IF NOT EXISTS customer        ON noshow_prediction TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON noshow_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS customer_phone  ON noshow_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS party_size      ON noshow_prediction TYPE int;
DEFINE FIELD IF NOT EXISTS reservation_date ON noshow_prediction TYPE datetime;
DEFINE FIELD IF NOT EXISTS source          ON noshow_prediction TYPE string;
  -- 'phone' | 'walk_in' | 'online' | 'third_party'
DEFINE FIELD IF NOT EXISTS risk_score      ON noshow_prediction TYPE float;
  -- 0-100 (100 = near-certain no-show)
DEFINE FIELD IF NOT EXISTS risk_level      ON noshow_prediction TYPE string;
  -- 'low' | 'medium' | 'high' | 'critical'
DEFINE FIELD IF NOT EXISTS risk_factors    ON noshow_prediction TYPE option<object>;
  -- { factor_id: { weight, value, detail } }
DEFINE FIELD IF NOT EXISTS est_revenue_at_risk ON noshow_prediction TYPE float DEFAULT 0;
  -- estimated revenue lost if no-show (party_size * avg_check)
DEFINE FIELD IF NOT EXISTS ai_insight      ON noshow_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON noshow_prediction TYPE option<string>;
  -- 'confirm_now' | 'require_deposit' | 'call_reminder' | 'overbook_slot' | 'accept_risk' | 'block_customer'
DEFINE FIELD IF NOT EXISTS action_taken    ON noshow_prediction TYPE string DEFAULT 'none';
  -- 'none' | 'confirmed' | 'deposit_requested' | 'reminder_sent' | 'overbooked' | 'blocked' | 'no_show_confirmed' | 'arrived'
DEFINE FIELD IF NOT EXISTS branch_id      ON noshow_prediction TYPE option<record<inventory_store>>;
DEFINE FIELD IF NOT EXISTS predicted_at    ON noshow_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at      ON noshow_prediction TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_np_reservation ON noshow_prediction FIELDS reservation;
DEFINE INDEX IF NOT EXISTS idx_np_customer    ON noshow_prediction FIELDS customer;
DEFINE INDEX IF NOT EXISTS idx_np_risk_level  ON noshow_prediction FIELDS risk_level;
DEFINE INDEX IF NOT EXISTS idx_np_date        ON noshow_prediction FIELDS reservation_date;
DEFINE INDEX IF NOT EXISTS idx_np_branch      ON noshow_prediction FIELDS branch_id;

-- Settings
DEFINE FIELD IF NOT EXISTS noshow_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS noshow_lookback_days     ON settings TYPE option<int>   DEFAULT 365;
  -- how far back to look for customer no-show history
DEFINE FIELD IF NOT EXISTS noshow_large_party_size  ON settings TYPE option<int>   DEFAULT 6;
  -- party size threshold for LARGE_PARTY factor
DEFINE FIELD IF NOT EXISTS noshow_peak_start_hour   ON settings TYPE option<int>   DEFAULT 18;
  -- peak slot start (Fri/Sat evening)
DEFINE FIELD IF NOT EXISTS noshow_peak_end_hour      ON settings TYPE option<int>   DEFAULT 21;
  -- peak slot end
DEFINE FIELD IF NOT EXISTS noshow_long_lead_days    ON settings TYPE option<int>   DEFAULT 14;
  -- bookings made > N days ahead get LONG_LEAD_TIME boost
DEFINE FIELD IF NOT EXISTS noshow_high_risk_threshold ON settings TYPE option<float> DEFAULT 65;
  -- risk_score >= this => 'high' level
DEFINE FIELD IF NOT EXISTS noshow_critical_risk_threshold ON settings TYPE option<float> DEFAULT 85;
  -- risk_score >= this => 'critical' level
DEFINE FIELD IF NOT EXISTS noshow_deposit_threshold ON settings TYPE option<float> DEFAULT 75;
  -- risk_score >= this => AI recommends require_deposit
