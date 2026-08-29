-- Migration: 2026_08_28_delivery_analytics.surql
--
-- AI Delivery Performance Analytics — per-platform delivery metrics.
--
-- Research finding: Toast Delivery Analytics $30+/mo (higher tier), Square
-- Delivery Reporting in Plus. POSR offers it free — analyzes DoorDash/
-- UberEats/Grubhub performance (acceptance rate, fulfillment time,
-- cancellation rate, revenue share) + AI recommendations.

DEFINE TABLE IF NOT EXISTS delivery_performance TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON delivery_performance TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS platform        ON delivery_performance TYPE string;
  -- 'doordash' | 'ubereats' | 'grubhub' | 'internal' | 'other'
DEFINE FIELD IF NOT EXISTS period_start    ON delivery_performance TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON delivery_performance TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_orders    ON delivery_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_revenue    ON delivery_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_order_value  ON delivery_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS accepted_orders ON delivery_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS acceptance_rate  ON delivery_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS cancelled_orders ON delivery_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS cancellation_rate ON delivery_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_fulfillment_minutes ON delivery_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_prep_minutes ON delivery_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_delivery_minutes ON delivery_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS revenue_share_pct ON delivery_performance TYPE float DEFAULT 0;
  -- % of total delivery revenue from this platform
DEFINE FIELD IF NOT EXISTS commission_paid  ON delivery_performance TYPE float DEFAULT 0;
  -- Estimated commission (15-30% per platform)
DEFINE FIELD IF NOT EXISTS net_revenue      ON delivery_performance TYPE float DEFAULT 0;
  -- revenue - commission
DEFINE FIELD IF NOT EXISTS customer_rating  ON delivery_performance TYPE option<float>;
  -- Avg rating from delivery platform reviews
DEFINE FIELD IF NOT EXISTS grade           ON delivery_performance TYPE string DEFAULT 'C';
  -- A (acceptance >95%, cancel <5%) / B / C / D / F
DEFINE FIELD IF NOT EXISTS ai_insight      ON delivery_performance TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON delivery_performance TYPE option<string>;
  -- 'promote' | 'maintain' | 'renegotiate' | 'pause' | 'expand'
DEFINE FIELD IF NOT EXISTS generated_at    ON delivery_performance TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at        ON delivery_performance TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_dp_platform ON delivery_performance FIELDS platform;
DEFINE INDEX IF NOT EXISTS idx_dp_grade     ON delivery_performance FIELDS grade;

DEFINE FIELD IF NOT EXISTS delivery_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS delivery_lookback_days ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS delivery_commission_doordash ON settings TYPE option<float> DEFAULT 20;
DEFINE FIELD IF NOT EXISTS delivery_commission_ubereats ON settings TYPE option<float> DEFAULT 25;
DEFINE FIELD IF NOT EXISTS delivery_commission_grubhub ON settings TYPE option<float> DEFAULT 20;
