-- Migration: 2026_08_30_cross_sell.surql
--
-- AI Real-Time Cross-Sell Engine — 77th POSR-exclusive differentiator.
--
-- Research finding: Cross-selling increases avg ticket 15-30% (McKinsey
-- restaurant revenue management). "Would you like fries with that?" adds
-- $15k+/yr per location (QSR magazine). Yet most restaurants rely on server
-- memory, not data-driven suggestions. 68% of customers say they'd add items
-- if suggested at the right time (Nation's Restaurant News).
--
-- Toast, Square, Lightspeed have modifier groups but NO AI cross-sell engine.
-- POSR's menu-pairing.service finds CO-PURCHASE patterns from historical data
-- — it doesn't generate REAL-TIME suggestions during ordering.
-- upsell-analytics.service MEASURES effectiveness — doesn't generate suggestions.
--
-- Distinct from:
--   - menu-pairing.service (finds CO-PURCHASE patterns — NOT real-time suggestions)
--   - upsell-analytics.service (MEASURES upsell effectiveness — doesn't generate)
--   - menu-optimization.service (BCG matrix — NOT cross-sell)
--   - wine-pairing.service (WINE pairing specifically — NOT general cross-sell)
--   - dynamic-pricing.service (price adjustments — NOT suggestions)

DEFINE TABLE IF NOT EXISTS cross_sell_suggestion TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON cross_sell_suggestion TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON cross_sell_suggestion TYPE string;
  -- 'complement_item' | 'category_gap' | 'high_margin_add' | 'popular_pairing' | 'dessert_prompt'
DEFINE FIELD IF NOT EXISTS severity       ON cross_sell_suggestion TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS trigger_item   ON cross_sell_suggestion TYPE option<string>;
  -- item already in cart that triggers suggestion
DEFINE FIELD IF NOT EXISTS trigger_category ON cross_sell_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS suggested_item ON cross_sell_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS suggested_category ON cross_sell_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS suggestion_text ON cross_sell_suggestion TYPE option<string>;
  -- server script / POS prompt text
DEFINE FIELD IF NOT EXISTS confidence     ON cross_sell_suggestion TYPE float DEFAULT 0;
  -- 0-1, based on historical co-purchase rate
DEFINE FIELD IF NOT EXISTS est_conversion_rate ON cross_sell_suggestion TYPE float DEFAULT 0;
  -- 0-1, predicted acceptance rate
DEFINE FIELD IF NOT EXISTS est_revenue_per_order ON cross_sell_suggestion TYPE float DEFAULT 0;
  -- $ added per successful cross-sell
DEFINE FIELD IF NOT EXISTS est_annual_revenue ON cross_sell_suggestion TYPE float DEFAULT 0;
  -- projected annual revenue from this cross-sell
DEFINE FIELD IF NOT EXISTS times_suggested ON cross_sell_suggestion TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS times_accepted  ON cross_sell_suggestion TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS actual_conversion ON cross_sell_suggestion TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON cross_sell_suggestion TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON cross_sell_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON cross_sell_suggestion TYPE option<string>;
  -- 'activate_now' | 'train_staff' | 'add_to_pos' | 'monitor' | 'adjust_text'
DEFINE FIELD IF NOT EXISTS status          ON cross_sell_suggestion TYPE string DEFAULT 'open';
  -- 'open' | 'active' | 'paused' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON cross_sell_suggestion TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_cs_rule_id   ON cross_sell_suggestion FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_cs_severity  ON cross_sell_suggestion FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_cs_status    ON cross_sell_suggestion FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_cs_trigger   ON cross_sell_suggestion FIELDS trigger_item;

-- Settings
DEFINE FIELD IF NOT EXISTS cross_sell_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS cross_sell_min_confidence   ON settings TYPE option<float> DEFAULT 0.15;
  -- min 15% co-purchase rate to suggest
DEFINE FIELD IF NOT EXISTS cross_sell_avg_daily_orders ON settings TYPE option<int>   DEFAULT 80;
  -- avg daily orders for annual revenue projection
DEFINE FIELD IF NOT EXISTS cross_sell_prompt_delay_sec ON settings TYPE option<int>   DEFAULT 5;
  -- delay before showing prompt (after item added)
