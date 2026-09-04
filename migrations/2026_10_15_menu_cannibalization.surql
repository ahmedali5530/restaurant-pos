-- Migration: 2026_10_15_menu_cannibalization.surql
--
-- AI Menu Item Cannibalization Detector — 124th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $400-1,500/mo per location from menu items
-- cannibalizing each other (Cornell Menu Architecture, NRA Menu Optimization):
--   - 30% of menu items are near-substitutes competing for same demand
--   - Two burger variants split demand → neither reaches profitable volume
--   - Chicken sandwich vs chicken salad → customers choose one, not both
--   - Similar price points create either/or decision → revenue split
--   - No POS detects cannibalization (items stealing demand from each other)
--   - Adding new items cannibalizes existing item sales (net zero revenue)
--   - Menu bloat: too many similar items confuse customers + slow ordering
--   - Category overlap: 3 pasta dishes split pasta demand 3 ways
--   - Price tier overlap: two items at same price point compete directly
--   - New item launches reduce existing item sales by 20-40% (undetected)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO cannibalization
-- detection. menu-engineering-matrix classifies items as Stars/Dogs. menu-
-- optimization does BCG matrix at category level. pairing-affinity detects
-- POSITIVE pairings (items ordered together). None detect NEGATIVE pairings
-- (items that compete/cannibalize each other's demand).
--
-- This new service DETECTS MENU CANNIBALIZATION:
--   - Identifies substitute items (same category, similar price, either/or choice)
--   - Measures demand split when both items are on menu
--   - Detects new item cannibalizing existing item (sales drop after launch)
--   - Identifies price tier overlap (direct competition)
--   - Detects category saturation (too many similar items)
--   - Recommends consolidation, repositioning, or removal
--   - Calculates revenue recovered from resolving cannibalization
--   - Tracks cannibalization impact over time

DEFINE TABLE IF NOT EXISTS menu_cannibalization_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON menu_cannibalization_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON menu_cannibalization_alert TYPE string;
  -- 'substitute_cannibalization' | 'new_item_cannibalization' | 'price_tier_overlap' |
--   'category_saturation' | 'demand_split' | 'feature_item_dominance' |
--   'cannibalization_recovery' | 'menu_simplification'
DEFINE FIELD IF NOT EXISTS severity        ON menu_cannibalization_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS item_a          ON menu_cannibalization_alert TYPE string;
DEFINE FIELD IF NOT EXISTS item_b          ON menu_cannibalization_alert TYPE string;
DEFINE FIELD IF NOT EXISTS category        ON menu_cannibalization_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_a_price    ON menu_cannibalization_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS item_b_price    ON menu_cannibalization_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS price_gap_pct   ON menu_cannibalization_alert TYPE option<float>;
  -- % price difference (small = direct competition)
DEFINE FIELD IF NOT EXISTS item_a_orders   ON menu_cannibalization_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS item_b_orders   ON menu_cannibalization_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS combined_orders ON menu_cannibalization_alert TYPE option<int>;
  -- total demand for this item type
DEFINE FIELD IF NOT EXISTS item_a_pre_launch_orders ON menu_cannibalization_alert TYPE option<int>;
  -- item_a sales before item_b launched (for new_item_cannibalization)
DEFINE FIELD IF NOT EXISTS cannibalization_pct ON menu_cannibalization_alert TYPE option<float>;
  -- % of item_a demand captured by item_b
DEFINE FIELD IF NOT EXISTS est_revenue_recovered ON menu_cannibalization_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON menu_cannibalization_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON menu_cannibalization_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON menu_cannibalization_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON menu_cannibalization_alert TYPE option<string>;
  -- 'consolidate' | 'reposition' | 'remove_item' | 'differentiate_price' | 'differentiate_recipe' |
--   'promote_dominant' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON menu_cannibalization_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON menu_cannibalization_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON menu_cannibalization_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_menucannib_rule      ON menu_cannibalization_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_menucannib_status    ON menu_cannibalization_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_menucannib_severity  ON menu_cannibalization_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_menucannib_item_a    ON menu_cannibalization_alert FIELDS item_a;
DEFINE INDEX IF NOT EXISTS idx_menucannib_item_b    ON menu_cannibalization_alert FIELDS item_b;
DEFINE INDEX IF NOT EXISTS idx_menucannib_category  ON menu_cannibalization_alert FIELDS category;

DEFINE FIELD IF NOT EXISTS menucannib_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS menucannib_price_gap_max ON settings TYPE option<float> DEFAULT 15.0;
  -- max % price gap to consider direct competition (default 15%)
DEFINE FIELD IF NOT EXISTS menucannib_cannibal_threshold ON settings TYPE option<float> DEFAULT 20.0;
  -- % demand captured by competitor to flag cannibalization (default 20%)
DEFINE FIELD IF NOT EXISTS menucannib_saturation_count ON settings TYPE option<int> DEFAULT 4;
  -- min items in same category to flag saturation (default 4)
