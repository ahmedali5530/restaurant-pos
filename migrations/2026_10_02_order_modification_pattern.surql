-- Migration: 2026_10_02_order_modification_pattern.surql
--
-- AI Order Modification Pattern Detector — 111th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-900/mo per location from undetected
-- order modification patterns (Cornell Menu Design, NRA Recipe Engineering):
--   - 25-40% of menu items are modified by customers (remove/add/substitute)
--   - 40% of burgers ordered "no pickles" → default recipe is WRONG
--   - Customers add extra sauce 30% of the time → should be default or upcharge
--   - Substitutions ( GF bun) signal unmet dietary demand → add as option
--   - Portion complaints: "half portion" requests = portion too large
--   - Spice level changes = default spice level mismatched to market
--   - Free modifications (extra cheese) leak revenue → should be paid add-ons
--   - Complex modifications slow kitchen → simplify default recipe
--   - No POS detects modification PATTERNS as "silent recipe feedback"
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO modification pattern
-- detection. order-customization-analyzer analyzes customization OPTIONS
-- available. complaint-pattern tracks explicit complaints. menu-optimization
-- does BCG matrix. dish-popularity tracks volume. None detect that 40% of
-- customers remove the same ingredient — silent feedback that the default
-- recipe needs redesign.
--
-- This new service DETECTS ORDER MODIFICATION PATTERNS:
--   - Tracks modification rate per menu item (what % of orders are modified)
--   - Identifies most-removed ingredients (recipe has unwanted defaults)
--   - Identifies most-added ingredients (recipe missing desired elements)
--   - Detects substitution patterns (ingredient A → B)
--   - Flags portion mismatch (too large/small requests)
--   - Detects spice level mismatch
--   - Identifies revenue leak (free mods that should be paid)
--   - Flags kitchen slowdown from complex modification patterns

DEFINE TABLE IF NOT EXISTS order_modification_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON order_modification_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON order_modification_alert TYPE string;
  -- 'high_modification_rate' | 'common_removal' | 'common_addition' |
--   'substitution_pattern' | 'portion_mismatch' | 'spice_level_mismatch' |
--   'revenue_leak' | 'kitchen_slowdown'
DEFINE FIELD IF NOT EXISTS severity        ON order_modification_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON order_modification_alert TYPE string;
DEFINE FIELD IF NOT EXISTS modification_type ON order_modification_alert TYPE option<string>;
  -- 'removal' | 'addition' | 'substitution' | 'portion_change' | 'spice_change'
DEFINE FIELD IF NOT EXISTS ingredient      ON order_modification_alert TYPE option<string>;
  -- the ingredient being removed/added/substituted
DEFINE FIELD IF NOT EXISTS substitute_ingredient ON order_modification_alert TYPE option<string>;
  -- for substitutions: what ingredient is used instead
DEFINE FIELD IF NOT EXISTS total_orders    ON order_modification_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS modified_orders ON order_modification_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS modification_rate ON order_modification_alert TYPE option<float>;
  -- % of orders with this modification
DEFINE FIELD IF NOT EXISTS revenue_leak_per_order ON order_modification_alert TYPE option<float>;
  -- revenue lost per order from free modification that should be paid
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON order_modification_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON order_modification_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON order_modification_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON order_modification_alert TYPE option<string>;
  -- 'redesign_recipe' | 'remove_ingredient' | 'add_to_default' | 'add_as_option' |
--   'adjust_portion' | 'adjust_spice' | 'add_upcharge' | 'simplify_recipe' |
--   'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON order_modification_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON order_modification_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON order_modification_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_modpattern_rule      ON order_modification_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_modpattern_status    ON order_modification_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_modpattern_severity  ON order_modification_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_modpattern_item      ON order_modification_alert FIELDS menu_item;
DEFINE INDEX IF NOT EXISTS idx_modpattern_type      ON order_modification_alert FIELDS modification_type;

DEFINE FIELD IF NOT EXISTS modpattern_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS modpattern_high_rate     ON settings TYPE option<float> DEFAULT 30.0;
  -- % of orders modified to flag as high modification rate (default 30%)
DEFINE FIELD IF NOT EXISTS modpattern_common_threshold ON settings TYPE option<float> DEFAULT 20.0;
  -- % of orders with specific modification to flag as common pattern (default 20%)
DEFINE FIELD IF NOT EXISTS modpattern_revenue_leak  ON settings TYPE option<float> DEFAULT 2.0;
  -- $ per order revenue leak to flag (default $2/order)
DEFINE FIELD IF NOT EXISTS modpattern_slowdown_threshold ON settings TYPE option<float> DEFAULT 15.0;
  -- extra seconds per order from modifications to flag kitchen slowdown (default 15s)
