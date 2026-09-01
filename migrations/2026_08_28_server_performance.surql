-- Migration: 2026_08_28_server_performance.surql
--
-- AI Server Performance Analytics — per-server metrics + ranking.
--
-- Research finding: Toast Server Performance reports in higher tiers (~$35/mo),
-- Square Team Performance in Plus. POSR offers it free — tracks each server's
-- order count, revenue, avg ticket, upsell conversion, accuracy, customer
-- satisfaction + AI-generated coaching recommendations.
--
-- Metrics per server:
--   - Total orders + total revenue
--   - Avg ticket size (revenue / orders)
--   - Items per order (upsell indicator)
--   - Order accuracy (1 - voids/refunds rate)
--   - Customer satisfaction (from sentiment reviews linked to server)
--   - Table turnover rate (tables served per shift)
--   - Peak hour performance
--   - Payment method mix (cash vs card — affects tip distribution)
--
-- Overall score (0-100, weighted):
--   revenue (30%) + avg_ticket (20%) + accuracy (25%) + satisfaction (25%)
--
-- Grade: A (>=85) / B (70-84) / C (55-69) / D (40-54) / F (<40)
--
-- AI coaching:
--   - Top performers → recognition + mentor role
--   - Underperformers → targeted coaching (specific areas to improve)
--   - Improvement trend → positive/negative

DEFINE TABLE IF NOT EXISTS server_performance TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON server_performance TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS user_id         ON server_performance TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS server_id        ON server_performance TYPE string;
DEFINE FIELD IF NOT EXISTS server_name     ON server_performance TYPE string;
DEFINE FIELD IF NOT EXISTS period_start    ON server_performance TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON server_performance TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_orders    ON server_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_revenue    ON server_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_ticket_size  ON server_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_items_per_order ON server_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS void_count      ON server_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS refund_count     ON server_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS accuracy_rate   ON server_performance TYPE float DEFAULT 0;
  -- 1 - (voids + refunds) / total_orders
DEFINE FIELD IF NOT EXISTS tables_served    ON server_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_table_turnover ON server_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS peak_hour         ON server_performance TYPE option<int>;
DEFINE FIELD IF NOT EXISTS peak_hour_orders  ON server_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS customer_rating   ON server_performance TYPE option<float>;
  -- Avg rating from sentiment reviews linked to this server (1-5)
DEFINE FIELD IF NOT EXISTS cash_payments   ON server_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS card_payments   ON server_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_tips      ON server_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_tip_pct      ON server_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS overall_score   ON server_performance TYPE float DEFAULT 0;
  -- 0-100 weighted
DEFINE FIELD IF NOT EXISTS grade           ON server_performance TYPE string DEFAULT 'C';
DEFINE FIELD IF NOT EXISTS rank            ON server_performance TYPE option<int>;
  -- 1 = best server
DEFINE FIELD IF NOT EXISTS trend_direction  ON server_performance TYPE string DEFAULT 'stable';
  -- 'improving' | 'declining' | 'stable' | 'new'
DEFINE FIELD IF NOT EXISTS ai_insight      ON server_performance TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_coaching     ON server_performance TYPE option<string>;
  -- 'recognize' | 'mentor' | 'coach_accuracy' | 'coach_upsell' | 'coach_speed' | 'monitor'
DEFINE FIELD IF NOT EXISTS ai_action       ON server_performance TYPE option<string>;
  -- Concrete next step (max 200 chars)
DEFINE FIELD IF NOT EXISTS generated_at    ON server_performance TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON server_performance TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_sp_server_id ON server_performance FIELDS server_id;
DEFINE INDEX IF NOT EXISTS idx_sp_grade      ON server_performance FIELDS grade;
DEFINE INDEX IF NOT EXISTS idx_sp_score      ON server_performance FIELDS overall_score;

DEFINE FIELD IF NOT EXISTS server_perf_lookback_days ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS server_perf_ai_enabled  ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS server_perf_min_orders  ON settings TYPE option<int> DEFAULT 5;
