-- Migration: 2026_08_28_anomaly_detection.surql
--
-- AI Anomaly Detection & Real-time Alerts — operational monitoring.
--
-- Research finding: Toast Smart Alerts $40+/mo (higher tier), Square
-- Anomaly Detection in Plus. POSR offers it free — monitors all business
-- metrics in real-time and alerts managers when something unusual happens
-- (sudden sales drop, waste spike, cash flow warning, stockout risk, etc.)
--
-- Complements the AI Command Center (which shows current state) by adding
-- PROACTIVE monitoring — the system watches for you and surfaces problems
-- before they become costly.
--
-- Tables:
--   1. operational_alert — detected anomalies (separate from security_alerts)
--
-- Detection rules (9):
--   1. SALES_DROP — hourly revenue < 50% of same-hour 30-day average
--   2. WASTE_SPIKE — today's waste cost > 3x daily average
--   3. CASH_FLOW_WARNING — projected min balance < reserve threshold
--   4. INVENTORY_STOCKOUT — item stock below par level
--   5. SENTIMENT_DROP — NPS dropped > 20 points week-over-week
--   6. NO_SHOW_SPIKE — reservation no-show rate > 30%
--   7. VENDOR_DELAY — PO fulfillment > 14 days past due
--   8. STAFFING_GAP — scheduled shifts < required staff for peak hours
--   9. FORECAST_ERROR_SPIKE — MAPE > 40% (AI unreliable)
--
-- Each alert includes:
--   - Rule that triggered it + severity (info/warning/critical)
--   - Current value vs expected value + deviation %
--   - AI-generated insight (why it happened + what to do)
--   - Lifecycle: open → acknowledged → resolved / false_positive

-- ---------------------------------------------------------------------------
-- operational_alert — detected anomalies
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS operational_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON operational_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON operational_alert TYPE string;
  -- 'sales_drop' | 'waste_spike' | 'cash_flow_warning' | 'inventory_stockout' |
  -- 'sentiment_drop' | 'no_show_spike' | 'vendor_delay' | 'staffing_gap' | 'forecast_error_spike'
DEFINE FIELD IF NOT EXISTS rule_name      ON operational_alert TYPE string;
  -- Human-readable rule name
DEFINE FIELD IF NOT EXISTS severity       ON operational_alert TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS category       ON operational_alert TYPE string;
  -- 'revenue' | 'waste' | 'finance' | 'inventory' | 'customer' | 'reservation' | 'procurement' | 'labor' | 'forecast'
DEFINE FIELD IF NOT EXISTS metric_value    ON operational_alert TYPE float;
  -- Current observed value
DEFINE FIELD IF NOT EXISTS expected_value  ON operational_alert TYPE float;
  -- Expected/normal value (baseline)
DEFINE FIELD IF NOT EXISTS threshold      ON operational_alert TYPE float;
  -- Threshold that was breached
DEFINE FIELD IF NOT EXISTS deviation_pct   ON operational_alert TYPE float;
  -- (metric - expected) / expected × 100 (signed)
DEFINE FIELD IF NOT EXISTS description    ON operational_alert TYPE string;
  -- Human-readable description (max 300 chars)
DEFINE FIELD IF NOT EXISTS context        ON operational_alert TYPE option<object>;
  -- Additional context (item_id, hour, day, etc.)
DEFINE FIELD IF NOT EXISTS ai_insight     ON operational_alert TYPE option<string>;
  -- AI-generated explanation + recommendation (max 300 chars)
DEFINE FIELD IF NOT EXISTS ai_action      ON operational_alert TYPE option<string>;
  -- AI-suggested concrete action (max 200 chars)
DEFINE FIELD IF NOT EXISTS status         ON operational_alert TYPE string DEFAULT 'open';
  -- 'open' | 'acknowledged' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS acknowledged_by ON operational_alert TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS acknowledged_at ON operational_alert TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS resolved_at     ON operational_alert TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS resolved_by     ON operational_alert TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS resolution_notes ON operational_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS detected_at     ON operational_alert TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_oa_rule_id    ON operational_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_oa_severity   ON operational_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_oa_status      ON operational_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_oa_detected_at ON operational_alert FIELDS detected_at;
DEFINE INDEX IF NOT EXISTS idx_oa_category   ON operational_alert FIELDS category;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS anomaly_detection_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS anomaly_ai_enabled        ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS anomaly_sales_drop_pct    ON settings TYPE option<float> DEFAULT 50;
  -- Alert when hourly revenue < X% of average (default 50%)
DEFINE FIELD IF NOT EXISTS anomaly_waste_spike_multiplier ON settings TYPE option<float> DEFAULT 3;
  -- Alert when waste > X× daily average (default 3x)
DEFINE FIELD IF NOT EXISTS anomaly_cashflow_reserve_pct ON settings TYPE option<float> DEFAULT 100;
  -- Alert when projected min balance < X% of reserve (default 100%)
DEFINE FIELD IF NOT EXISTS anomaly_no_show_threshold ON settings TYPE option<float> DEFAULT 30;
  -- Alert when no-show rate > X% (default 30%)
DEFINE FIELD IF NOT EXISTS anomaly_vendor_delay_days ON settings TYPE option<int> DEFAULT 14;
  -- Alert when PO unfulfilled > X days past due (default 14)
DEFINE FIELD IF NOT EXISTS anomaly_forecast_mape_threshold ON settings TYPE option<float> DEFAULT 40;
  -- Alert when MAPE > X% (default 40%)
DEFINE FIELD IF NOT EXISTS anomaly_dedup_window_hours ON settings TYPE option<int> DEFAULT 6;
  -- Don't re-alert same rule within X hours (default 6h)
