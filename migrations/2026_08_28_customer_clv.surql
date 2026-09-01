-- Migration: 2026_08_28_customer_clv.surql
--
-- AI Customer Lifetime Value (CLV) Prediction — per-customer value scoring.
--
-- Research finding: Toast Customer 360 + Square Customer Insights bundle
-- CLV prediction in higher tiers (~$45/mo). POSR offers it free —
-- analyzes each customer's purchase history + loyalty engagement +
-- visit frequency to compute historical CLV + predict future CLV.
--
-- Why it matters:
--   - Identifies VIP customers (top 10% by CLV) for special treatment
--   - Spots at-risk customers (high CLV, declining frequency)
--   - Segments customers for targeted marketing (champions/loyal/at-risk/new)
--   - Justifies loyalty program investment (CLV of members vs non-members)
--   - Guides acquisition spend (CAC < CLV for healthy unit economics)
--
-- RFM Analysis (Recency, Frequency, Monetary):
--   - Recency: days since last order (lower = better)
--   - Frequency: total orders in period (higher = better)
--   - Monetary: total spend in period (higher = better)
--   Each scored 1-5, combined into RFM score (111-555)
--
-- Customer segments (RFM-based):
--   CHAMPIONS   — R=5, F=5 (best customers — recently active + frequent)
--   LOYAL       — F=4-5 (frequent buyers, any recency)
--   POTENTIAL   — R=4-5, F=2-3 (recent but infrequent — could become loyal)
--   NEW         — R=5, F=1 (first-time or rare recent buyers)
--   AT_RISK     — R=2-3, F=4-5 (were loyal, slipping)
--   CANT_LOSE   — R=1, F=5 (top customers who haven't visited recently)
--   HIBERNATING — R=1, F=1-2 (inactive + infrequent)
--
-- CLV calculation:
--   - Historical CLV: sum of all order totals (lifetime spend)
--   - Predictive CLV: avg_monthly_value × predicted_remaining_months
--     - avg_monthly_value = total_spend / customer_age_months
--     - predicted_remaining_months based on churn rate (frequency trend)
--   - AI refinement: OpenAI adjusts based on engagement signals (loyalty
--     tier, reservation history, sentiment, recent visit pattern)

-- ---------------------------------------------------------------------------
-- customer_clv — cached per-customer CLV (24h TTL)
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS customer_clv TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON customer_clv TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer         ON customer_clv TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_id      ON customer_clv TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON customer_clv TYPE string;
DEFINE FIELD IF NOT EXISTS email           ON customer_clv TYPE option<string>;
DEFINE FIELD IF NOT EXISTS phone           ON customer_clv TYPE option<string>;
DEFINE FIELD IF NOT EXISTS tags           ON customer_clv TYPE option<array<string>>;
-- RFM scores (1-5 each)
DEFINE FIELD IF NOT EXISTS recency_score   ON customer_clv TYPE int;
DEFINE FIELD IF NOT EXISTS frequency_score ON customer_clv TYPE int;
DEFINE FIELD IF NOT EXISTS monetary_score  ON customer_clv TYPE int;
DEFINE FIELD IF NOT EXISTS rfm_score       ON customer_clv TYPE string;
  -- e.g. "555" = best customer
-- Raw metrics
DEFINE FIELD IF NOT EXISTS days_since_last_order ON customer_clv TYPE int;
DEFINE FIELD IF NOT EXISTS total_orders      ON customer_clv TYPE int;
DEFINE FIELD IF NOT EXISTS total_spend       ON customer_clv TYPE float;
DEFINE FIELD IF NOT EXISTS avg_order_value   ON customer_clv TYPE float;
DEFINE FIELD IF NOT EXISTS first_order_date  ON customer_clv TYPE datetime;
DEFINE FIELD IF NOT EXISTS last_order_date   ON customer_clv TYPE datetime;
DEFINE FIELD IF NOT EXISTS customer_age_months ON customer_clv TYPE int;
DEFINE FIELD IF NOT EXISTS avg_monthly_value  ON customer_clv TYPE float;
-- CLV
DEFINE FIELD IF NOT EXISTS historical_clv    ON customer_clv TYPE float;
  -- Sum of all orders
DEFINE FIELD IF NOT EXISTS predictive_clv    ON customer_clv TYPE float;
  -- Projected future value
DEFINE FIELD IF NOT EXISTS total_clv         ON customer_clv TYPE float;
  -- historical + predictive
DEFINE FIELD IF NOT EXISTS churn_risk        ON customer_clv TYPE float DEFAULT 0;
  -- 0-1 (probability of churning in next 90 days)
DEFINE FIELD IF NOT EXISTS predicted_remaining_months ON customer_clv TYPE int;
-- Segment + loyalty
DEFINE FIELD IF NOT EXISTS segment           ON customer_clv TYPE string;
  -- 'champion' | 'loyal' | 'potential' | 'new' | 'at_risk' | 'cant_lose' | 'hibernating'
DEFINE FIELD IF NOT EXISTS loyalty_tier      ON customer_clv TYPE option<string>;
  -- 'bronze' | 'silver' | 'gold' | 'platinum' (if loyalty member)
DEFINE FIELD IF NOT EXISTS loyalty_points   ON customer_clv TYPE option<int>;
DEFINE FIELD IF NOT EXISTS is_loyalty_member ON customer_clv TYPE bool DEFAULT false;
-- AI
DEFINE FIELD IF NOT EXISTS ai_insight       ON customer_clv TYPE option<string>;
  -- AI-generated note (max 300 chars)
DEFINE FIELD IF NOT EXISTS ai_recommendation ON customer_clv TYPE option<string>;
  -- AI action: 'vip_treatment' | 'retention' | 'reactivate' | 'upsell' | 'monitor'
DEFINE FIELD IF NOT EXISTS generated_at      ON customer_clv TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at        ON customer_clv TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_clv_customer_id ON customer_clv FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_clv_segment      ON customer_clv FIELDS segment;
DEFINE INDEX IF NOT EXISTS idx_clv_total_clv    ON customer_clv FIELDS total_clv;
DEFINE INDEX IF NOT EXISTS idx_clv_churn_risk   ON customer_clv FIELDS churn_risk;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS clv_lookback_days   ON settings TYPE option<int> DEFAULT 365;
  -- Period for RFM analysis (default: 365 days = 1 year)
DEFINE FIELD IF NOT EXISTS clv_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS clv_min_orders      ON settings TYPE option<int> DEFAULT 2;
  -- Min orders to evaluate a customer (default: 2+ to filter one-timers)
DEFINE FIELD IF NOT EXISTS clv_churn_threshold_days ON settings TYPE option<int> DEFAULT 90;
  -- Days without order to consider "churned" (default: 90 days)
DEFINE FIELD IF NOT EXISTS clv_prediction_months ON settings TYPE option<int> DEFAULT 12;
  -- How many months ahead to predict (default: 12 months)
