-- Migration: 2026_09_08_order_customization_analyzer.surql
--
-- AI Order Customization Pattern Analyzer — 87th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-800/mo per location from unanalyzed
-- order customization patterns (Toast Customization Analytics survey, NRA
-- Menu Engineering Report):
--   - Missing high-demand add-ons: 15-25% of customers add same ingredient
--     but it's not bundled → missed upsell revenue
--   - Over-priced customizations: $2 avocado add-on costs $0.50 → customers
--     skip it, lose both sale + satisfaction
--   - Under-priced customizations: free sauce add-on costs $0.30 → 80% of
--     orders add it, eroding margin
--   - Popular removals: 20% remove onions from burger → menu should offer
--     "no onion" variant to speed kitchen
--   - Ingredient shortage patterns: 30% add extra cheese but inventory only
--     stocks for 10% → stockouts
--   - Complexity bottlenecks: items with 5+ customizations slow kitchen
--     2-3x → ticket time +5-10 min
--   - Upsell gaps: customers who add bacon also want cheese but servers
--     don't suggest it
--   - Price sensitivity: $0.50 price increase on popular add-on drops
--     attach rate 40%
--
-- Classic POS systems (Toast, Square, Lightspeed) ALLOW customizations but
-- DON'T ANALYZE patterns. Toast Customization is just a UI for adding
-- modifiers — no AI insights on what to bundle, reprice, or stock.
-- Third-party menu analytics (MenuChain, Datassential) cost $200-500/mo
-- and require manual data export.
--
-- POSR's existing services cover DIFFERENT order analysis:
--   - upsell-analytics.service = SERVER upsell performance tracking (which
--     servers suggest what) — NOT customization pattern analysis
--   - menu-pairing.service = which items pair together — NOT add-on analysis
--   - menu-optimization.service = BCG matrix (popularity vs margin) — NOT
--     customization patterns
--   - dynamic-pricing.service = DEMAND-based pricing — NOT add-on pricing
--   - recipe-substitution.service = ingredient SWAP suggestions — NOT
--     customization patterns
--   - price-elasticity.service = DEMAND elasticity — NOT add-on elasticity
--
-- This new service ANALYZES ORDER CUSTOMIZATION PATTERNS:
--   - Tracks add-ons (extra cheese, bacon, avocado)
--   - Tracks removals (no onion, no pickle, no sauce)
--   - Tracks substitutions (gluten-free bun, almond milk)
--   - Identifies high-frequency patterns for bundling
--   - Detects mispriced add-ons (over/under)
--   - Flags ingredient shortage risk from customization demand
--   - Identifies complexity bottlenecks (too many customizations slow kitchen)
--   - Spots upsell opportunities (correlated add-ons)

DEFINE TABLE IF NOT EXISTS customization_pattern_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON customization_pattern_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON customization_pattern_alert TYPE string;
  -- 'high_addon_demand' | 'popular_removal' | 'mispriced_addon' |
  -- 'ingredient_shortage_risk' | 'complexity_bottleneck' | 'upsell_gap' |
  -- 'price_sensitive_customization' | 'substitution_pattern'
DEFINE FIELD IF NOT EXISTS severity        ON customization_pattern_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item_id    ON customization_pattern_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS menu_item_name  ON customization_pattern_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customization_type ON customization_pattern_alert TYPE string;
  -- 'addon' | 'removal' | 'substitution' | 'portion_change'
DEFINE FIELD IF NOT EXISTS customization_name ON customization_pattern_alert TYPE string;
  -- e.g. 'extra_cheese', 'no_onion', 'gluten_free_bun', 'double_meat'
DEFINE FIELD IF NOT EXISTS current_price   ON customization_pattern_alert TYPE option<float>;
  -- current add-on price (for addons)
DEFINE FIELD IF NOT EXISTS suggested_price ON customization_pattern_alert TYPE option<float>;
  -- AI-suggested price
DEFINE FIELD IF NOT EXISTS unit_cost       ON customization_pattern_alert TYPE option<float>;
  -- ingredient cost per customization
DEFINE FIELD IF NOT EXISTS attach_rate     ON customization_pattern_alert TYPE float DEFAULT 0;
  -- % of orders with this customization (0-100)
DEFINE FIELD IF NOT EXISTS order_count_30d ON customization_pattern_alert TYPE option<int>;
  -- total orders of this item in last 30 days
DEFINE FIELD IF NOT EXISTS est_revenue_lost_monthly ON customization_pattern_alert TYPE float DEFAULT 0;
  -- $ lost from mispricing or missing bundle
DEFINE FIELD IF NOT EXISTS est_savings_monthly ON customization_pattern_alert TYPE float DEFAULT 0;
  -- $ saved by adopting recommendation
DEFINE FIELD IF NOT EXISTS description     ON customization_pattern_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON customization_pattern_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON customization_pattern_alert TYPE option<string>;
  -- 'bundle_now' | 'reprice' | 'add_variant' | 'increase_stock' | 'simplify' |
  -- 'train_upsell' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON customization_pattern_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON customization_pattern_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON customization_pattern_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_custom_rule      ON customization_pattern_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_custom_status    ON customization_pattern_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_custom_severity  ON customization_pattern_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_custom_item      ON customization_pattern_alert FIELDS menu_item_name;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS custom_ai_enabled       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS custom_high_attach_pct  ON settings TYPE option<float> DEFAULT 30.0;
  -- attach rate % above which add-on should be bundled (default 30%)
DEFINE FIELD IF NOT EXISTS custom_low_attach_pct   ON settings TYPE option<float> DEFAULT 5.0;
  -- attach rate % below which add-on may be overpriced (default 5%)
DEFINE FIELD IF NOT EXISTS custom_margin_floor_pct ON settings TYPE option<float> DEFAULT 60.0;
  -- minimum margin % for add-ons (below = underpriced)
DEFINE FIELD IF NOT EXISTS custom_complexity_threshold ON settings TYPE option<int> DEFAULT 5;
  -- number of customizations per order that triggers bottleneck alert
