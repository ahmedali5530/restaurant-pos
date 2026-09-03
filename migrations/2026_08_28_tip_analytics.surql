-- Migration: 2026_08_28_tip_analytics.surql
--
-- AI Tip Distribution Analytics — tip pool equity + fairness analysis.
--
-- Research finding: Toast Tip Pool Management $25+/mo (higher tier), Square
-- Tip Reporting in Plus. POSR offers it free — analyzes tip collection,
-- distribution fairness among staff, tip % by payment method, hourly tip
-- patterns, + AI recommendations for equitable distribution.

DEFINE TABLE IF NOT EXISTS tip_distribution_analysis TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON tip_distribution_analysis TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS analysis_date    ON tip_distribution_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_start    ON tip_distribution_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON tip_distribution_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_tips       ON tip_distribution_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_orders_with_tips ON tip_distribution_analysis TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_orders     ON tip_distribution_analysis TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS tip_frequency    ON tip_distribution_analysis TYPE float DEFAULT 0;
  -- % of orders that included a tip
DEFINE FIELD IF NOT EXISTS avg_tip_pct      ON tip_distribution_analysis TYPE float DEFAULT 0;
  -- avg tip / order_total × 100
DEFINE FIELD IF NOT EXISTS avg_tip_amount    ON tip_distribution_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS cash_tip_pct     ON tip_distribution_analysis TYPE float DEFAULT 0;
  -- % of tips from cash payments
DEFINE FIELD IF NOT EXISTS card_tip_pct     ON tip_distribution_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS peak_tip_hour    ON tip_distribution_analysis TYPE option<int>;
DEFINE FIELD IF NOT EXISTS per_employee     ON tip_distribution_analysis TYPE option<array<object>>;
  -- [{name, tips_collected, orders_served, avg_tip_per_order, tip_share_pct}]
DEFINE FIELD IF NOT EXISTS gini_coefficient ON tip_distribution_analysis TYPE float DEFAULT 0;
  -- 0 = perfectly equal distribution, 1 = completely unequal
DEFINE FIELD IF NOT EXISTS equity_score     ON tip_distribution_analysis TYPE float DEFAULT 0;
  -- 100 - (gini × 100), higher = more equitable
DEFINE FIELD IF NOT EXISTS ai_insight       ON tip_distribution_analysis TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendations ON tip_distribution_analysis TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS generated_at     ON tip_distribution_analysis TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at        ON tip_distribution_analysis TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_tda_date ON tip_distribution_analysis FIELDS analysis_date;

DEFINE FIELD IF NOT EXISTS tip_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS tip_lookback_days ON settings TYPE option<int> DEFAULT 30;
