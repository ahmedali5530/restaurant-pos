-- Migration: 2026_09_29_menu_engineering_matrix.surql
--
-- AI Menu Engineering Matrix Analyzer — 108th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,500/mo per location from a
-- poorly-engineered menu (Cornell Menu Engineering, NRA Menu Matrix):
--   - 20-30% of menu items are "Dogs" (low popularity + low profit) yet stay
--   - "Puzzles" (high profit, low popularity) are hidden/undermarketed
--   - "Stars" (high popularity + high profit) aren't featured prominently
--   - "Plowhorses" (popular but low margin) erode profit without cost action
--   - No BCG-style matrix classification in any POS (Toast/Square/Lightspeed)
--   - Menu items never re-evaluated after launch — "set and forget"
--   - Cost changes not reflected in classification (item drifts to Dog)
--   - No AI action recommendations per quadrant (promote/reprice/remove)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO menu engineering
-- matrix. menu-optimization does BCG classification at category level.
-- dish-profitability measures cost+margin per dish. price-elasticity measures
-- demand curves. None classify EACH menu item into Stars/Plowhorses/Puzzles/Dogs
-- with quadrant-specific AI actions and drift tracking over time.
--
-- This new service CLASSIFIES EVERY MENU ITEM into the 4-quadrant matrix:
--   - Stars: high popularity + high profitability → promote/feature
--   - Plowhorses: high popularity + low profitability → cost optimization
--   - Puzzles: low popularity + high profitability → reposition/rename
--   - Dogs: low popularity + low profitability → remove/replace
--   - Tracks quadrant drift (Stars fading, Dogs rising)
--   - Calculates reprice opportunities for Puzzles
--   - Flags rising ingredient costs for Plowhorses
--   - AI generates quadrant-specific action recommendations

DEFINE TABLE IF NOT EXISTS menu_engineering_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON menu_engineering_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON menu_engineering_alert TYPE string;
  -- 'star_item' | 'plowhorse_item' | 'puzzle_item' | 'dog_item' |
  --   'star_fading' | 'dog_rising' | 'reprice_opportunity' | 'cost_optimization'
DEFINE FIELD IF NOT EXISTS severity        ON menu_engineering_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON menu_engineering_alert TYPE string;
DEFINE FIELD IF NOT EXISTS quadrant        ON menu_engineering_alert TYPE string;
  -- 'star' | 'plowhorse' | 'puzzle' | 'dog'
DEFINE FIELD IF NOT EXISTS popularity_score ON menu_engineering_alert TYPE option<float>;
  -- 0-100 (relative rank by order volume)
DEFINE FIELD IF NOT EXISTS profitability_score ON menu_engineering_alert TYPE option<float>;
  -- 0-100 (relative rank by margin contribution)
DEFINE FIELD IF NOT EXISTS order_count     ON menu_engineering_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS revenue         ON menu_engineering_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS margin_pct      ON menu_engineering_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS margin_per_unit ON menu_engineering_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS ingredient_cost_trend ON menu_engineering_alert TYPE option<float>;
  -- % change in ingredient cost (30d)
DEFINE FIELD IF NOT EXISTS previous_quadrant ON menu_engineering_alert TYPE option<string>;
  -- for drift detection
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON menu_engineering_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON menu_engineering_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON menu_engineering_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON menu_engineering_alert TYPE option<string>;
  -- 'promote' | 'optimize_cost' | 'reposition' | 'remove' | 'reprice_down' |
  --   'investigate' | 'reconsider' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON menu_engineering_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON menu_engineering_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON menu_engineering_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_menueng_rule      ON menu_engineering_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_menueng_status    ON menu_engineering_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_menueng_severity  ON menu_engineering_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_menueng_item      ON menu_engineering_alert FIELDS menu_item;
DEFINE INDEX IF NOT EXISTS idx_menueng_quadrant  ON menu_engineering_alert FIELDS quadrant;

DEFINE FIELD IF NOT EXISTS menueng_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS menueng_popularity_threshold ON settings TYPE option<float> DEFAULT 50.0;
  -- popularity score above which item is "high popularity" (median split, default 50)
DEFINE FIELD IF NOT EXISTS menueng_profitability_threshold ON settings TYPE option<float> DEFAULT 50.0;
  -- profitability score above which item is "high profitability" (default 50)
DEFINE FIELD IF NOT EXISTS menueng_star_fade_drop ON settings TYPE option<float> DEFAULT 20.0;
  -- popularity drop % to flag a Star as fading (default 20%)
DEFINE FIELD IF NOT EXISTS menueng_dog_rise_gain ON settings TYPE option<float> DEFAULT 30.0;
  -- popularity gain % to flag a Dog as rising (default 30%)
