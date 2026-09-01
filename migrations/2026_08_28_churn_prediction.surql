-- Migration: 2026_08_28_churn_prediction.surql
--
-- AI Churn Prediction Dashboard — identify at-risk customers + retention.
--
-- Research finding: Toast Customer 360 + Square Customer Retention bundle
-- churn prediction in higher tiers (~$50/mo). POSR offers it free —
-- identifies customers likely to churn in next 30 days + generates
-- personalized retention recommendations + tracks churn trend over time.
--
-- Complements CLV (which computes churn_risk per customer) by adding:
--   1. Churn snapshot history — periodic snapshots of overall churn rate
--      for trend analysis (is churn improving or worsening?)
--   2. Retention action tracking — record when a retention action was
--      taken + outcome (saved/churned/unknown)
--   3. Churn drivers analysis — identify common patterns among churned
--      customers (e.g. "70% of churned customers had < 3 visits in 90d")
--
-- Tables:
--   1. churn_snapshot — periodic rollups of churn metrics (auto-generated)
--   2. retention_action — logged retention attempts + outcomes

-- ---------------------------------------------------------------------------
-- churn_snapshot — periodic rollups for trend tracking
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS churn_snapshot TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON churn_snapshot TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS snapshot_date   ON churn_snapshot TYPE datetime;
  -- Date the snapshot was taken
DEFINE FIELD IF NOT EXISTS period_type      ON churn_snapshot TYPE string DEFAULT 'weekly';
  -- 'daily' | 'weekly' | 'monthly'
DEFINE FIELD IF NOT EXISTS total_customers  ON churn_snapshot TYPE int DEFAULT 0;
  -- Active customers in period
DEFINE FIELD IF NOT EXISTS at_risk_count    ON churn_snapshot TYPE int DEFAULT 0;
  -- Customers with churn_risk >= 0.5
DEFINE FIELD IF NOT EXISTS critical_count   ON churn_snapshot TYPE int DEFAULT 0;
  -- Customers with churn_risk >= 0.7
DEFINE FIELD IF NOT EXISTS avg_churn_risk   ON churn_snapshot TYPE float DEFAULT 0;
  -- Average churn_risk across all customers
DEFINE FIELD IF NOT EXISTS churn_rate       ON churn_snapshot TYPE float DEFAULT 0;
  -- % of customers who haven't ordered in churn_threshold_days
DEFINE FIELD IF NOT EXISTS revenue_at_risk  ON churn_snapshot TYPE float DEFAULT 0;
  -- Sum of predictive_clv for at-risk customers
DEFINE FIELD IF NOT EXISTS by_segment      ON churn_snapshot TYPE option<object>;
  -- Count per segment: { champion: N, loyal: N, at_risk: N, ... }
DEFINE FIELD IF NOT EXISTS top_churn_drivers ON churn_snapshot TYPE option<array<string>>;
  -- Common patterns among high-risk customers
DEFINE FIELD IF NOT EXISTS ai_summary      ON churn_snapshot TYPE option<string>;
  -- AI-generated summary (max 300 chars)
DEFINE FIELD IF NOT EXISTS generated_at    ON churn_snapshot TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_cs_snapshot_date ON churn_snapshot FIELDS snapshot_date;
DEFINE INDEX IF NOT EXISTS idx_cs_period_type   ON churn_snapshot FIELDS period_type;

-- ---------------------------------------------------------------------------
-- retention_action — logged retention attempts + outcomes
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS retention_action TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON retention_action TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer_id     ON retention_action TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON retention_action TYPE string;
DEFINE FIELD IF NOT EXISTS action_type     ON retention_action TYPE string;
  -- 'email' | 'sms' | 'phone_call' | 'discount' | 'loyalty_bonus' | 'personal_visit' | 'other'
DEFINE FIELD IF NOT EXISTS description     ON retention_action TYPE option<string>;
  -- What was done (max 200 chars)
DEFINE FIELD IF NOT EXISTS churn_risk_at_action ON retention_action TYPE float;
  -- Churn risk when action was taken (for before/after comparison)
DEFINE FIELD IF NOT EXISTS clv_at_action    ON retention_action TYPE float;
  -- CLV when action was taken
DEFINE FIELD IF NOT EXISTS initiated_by     ON retention_action TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS initiated_at    ON retention_action TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS outcome         ON retention_action TYPE string DEFAULT 'pending';
  -- 'pending' | 'saved' | 'churned' | 'no_response'
DEFINE FIELD IF NOT EXISTS outcome_date     ON retention_action TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS notes           ON retention_action TYPE option<string>;

DEFINE INDEX IF NOT EXISTS idx_ra_customer_id ON retention_action FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_ra_outcome     ON retention_action FIELDS outcome;
DEFINE INDEX IF NOT EXISTS idx_ra_initiated_at ON retention_action FIELDS initiated_at;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS churn_at_risk_threshold ON settings TYPE option<float> DEFAULT 0.5;
  -- Churn risk above which customer is "at risk" (default 0.5 = 50%)
DEFINE FIELD IF NOT EXISTS churn_critical_threshold ON settings TYPE option<float> DEFAULT 0.7;
  -- Churn risk above which customer is "critical" (default 0.7 = 70%)
DEFINE FIELD IF NOT EXISTS churn_prediction_window_days ON settings TYPE option<int> DEFAULT 30;
  -- Prediction window for "likely to churn" (default 30 days)
DEFINE FIELD IF NOT EXISTS churn_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS churn_min_clv_for_retention ON settings TYPE option<float> DEFAULT 100;
  -- Min CLV to warrant active retention effort (below this = let churn)
