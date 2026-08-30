-- Migration: 2026_08_28_branch_comparison.surql
--
-- AI Branch Performance Comparison — 27th POSR-exclusive differentiator.
--
-- Research finding: Multi-location restaurants can't easily compare branch
-- performance to find underperformers and identify best practices. Toast
-- Multi-Location $150+/mo, Square Multi-Store in Plus. POSR offers it free
-- — compares all branches across revenue, growth, efficiency, customer
-- satisfaction, labor cost + AI identifies top performer, underperformer,
-- and actionable insights.
--
-- Distinct from:
--   - anomaly-detection.service (detects anomalies, doesn't compare branches)
--   - revpash.service (analyzes seat efficiency, single location)
--   - revenue-forecast.service (forecasts revenue, doesn't compare branches)
--
-- This service COMPARES branches against each other — finds best/worst,
-- identifies what top performers do differently + AI recommendations.
--
-- Metrics per branch:
--   1. total_revenue — sum of paid orders
--   2. revenue_growth_pct — vs previous period
--   3. avg_order_value — revenue / orders
--   4. order_count — total paid orders
--   5. customer_count — unique customers
--   6. avg_customer_rating — from reviews
--   7. labor_cost_pct — labor / revenue
--   8. food_cost_pct — COGS / revenue
--   9. waste_pct — waste cost / revenue
--  10. turnover_rate — table turns per day
--
-- Overall score (0-100) = weighted: revenue (25%) + growth (20%) + AOV (15%) +
--   satisfaction (15%) + efficiency (15%) + cost control (10%)
--
-- AI: identifies top_performer, underperformer, best_practice, area_for_improvement

DEFINE TABLE IF NOT EXISTS branch_comparison TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON branch_comparison TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS branch_id       ON branch_comparison TYPE option<record<inventory_store>>;
DEFINE FIELD IF NOT EXISTS branch_name    ON branch_comparison TYPE string;
DEFINE FIELD IF NOT EXISTS total_revenue   ON branch_comparison TYPE float;
DEFINE FIELD IF NOT EXISTS revenue_growth_pct ON branch_comparison TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_order_value ON branch_comparison TYPE float;
DEFINE FIELD IF NOT EXISTS order_count     ON branch_comparison TYPE int;
DEFINE FIELD IF NOT EXISTS customer_count   ON branch_comparison TYPE int;
DEFINE FIELD IF NOT EXISTS avg_customer_rating ON branch_comparison TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS labor_cost_pct  ON branch_comparison TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS food_cost_pct   ON branch_comparison TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS waste_pct       ON branch_comparison TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS turnover_rate    ON branch_comparison TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS overall_score    ON branch_comparison TYPE float;
  -- 0-100
DEFINE FIELD IF NOT EXISTS rank            ON branch_comparison TYPE int;
  -- 1 = best, N = worst
DEFINE FIELD IF NOT EXISTS total_branches  ON branch_comparison TYPE int;
DEFINE FIELD IF NOT EXISTS percentile      ON branch_comparison TYPE float;
  -- 0-1 (1 = top branch)
DEFINE FIELD IF NOT EXISTS ai_insight      ON branch_comparison TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON branch_comparison TYPE option<string>;
  -- 'replicate_practices' | 'investigate_decline' | 'share_best_practice' |
  -- 'resource_reallocation' | 'maintain_position' | 'urgent_intervention'
DEFINE FIELD IF NOT EXISTS analyzed_at     ON branch_comparison TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_bc_branch   ON branch_comparison FIELDS branch_id;
DEFINE INDEX IF NOT EXISTS idx_bc_rank     ON branch_comparison FIELDS rank;
DEFINE INDEX IF NOT EXISTS idx_bc_analyzed ON branch_comparison FIELDS analyzed_at;

-- Settings
DEFINE FIELD IF NOT EXISTS branch_comp_ai_enabled    ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS branch_comp_lookback_days ON settings TYPE option<int>   DEFAULT 30;
  -- compare last 30 days
DEFINE FIELD IF NOT EXISTS branch_comp_prev_days     ON settings TYPE option<int>   DEFAULT 30;
  -- previous period for growth (previous 30 days)
