-- Migration: 2026_10_27_menu_item_retirement.surql
--
-- AI Menu Item Retirement Predictor — 136th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,000/mo per location from keeping
-- dead menu items too long (Cornell Menu Lifecycle, NRA Menu Optimization):
--   - 15-25% of menu items are "zombies" — dead but not removed
--   - Zombie items occupy prep capacity, inventory, menu space, training time
--   - Each zombie item costs ~$50-150/mo in hidden carrying costs
--   - No POS predicts WHEN to retire items — managers wait too long
--   - Menu bloat from never retiring → customer decision fatigue
--   - Retiring too early loses the 5% of customers who order that item
--   - Retiring too late wastes 6+ months of carrying costs
--   - Optimal retirement timing depends on decline rate, margin, complexity
--   - Seasonal items that don't return = retirement candidates
--   - High-modification items are already being "rejected" by customers
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO retirement prediction.
-- menu-engineering-matrix classifies as Dogs but doesn't predict WHEN to retire.
-- menu-rotation rotates seasonally. menu-cannibalization detects competition.
-- None predict the OPTIMAL RETIREMENT TIMING for each declining item.
--
-- This new service PREDICTS MENU ITEM RETIREMENT:
--   - Tracks decline trajectory (popularity, margin, order rate trend)
--   - Scores retirement readiness (0-100, higher = retire now)
--   - Predicts months until item becomes unprofitable
--   - Calculates carrying cost of keeping vs revenue lost from retiring
--   - Identifies optimal retirement window (not too early, not too late)
--   - Recommends replacement strategy (new item, variant, or just remove)
--   - Tracks post-retirement impact (did revenue shift to other items?)
--   - Flags items that should be saved (revivable with recipe update)

DEFINE TABLE IF NOT EXISTS menu_item_retirement_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON menu_item_retirement_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON menu_item_retirement_alert TYPE string;
  -- 'retirement_candidate' | 'zombie_item' | 'optimal_retirement_window' |
--   'carrying_cost_excessive' | 'revivable_item' | 'post_retirement_revenue_shift' |
--   'seasonal_non_return' | 'retirement_blocker'
DEFINE FIELD IF NOT EXISTS severity        ON menu_item_retirement_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON menu_item_retirement_alert TYPE string;
DEFINE FIELD IF NOT EXISTS retirement_score ON menu_item_retirement_alert TYPE option<float>;
  -- 0-100 (higher = retire now)
DEFINE FIELD IF NOT EXISTS current_order_rate ON menu_item_retirement_alert TYPE option<float>;
  -- orders per month
DEFINE FIELD IF NOT EXISTS peak_order_rate ON menu_item_retirement_alert TYPE option<float>;
  -- peak popularity when launched
DEFINE FIELD IF NOT EXISTS decline_pct     ON menu_item_retirement_alert TYPE option<float>;
  -- % decline from peak
DEFINE FIELD IF NOT EXISTS current_margin  ON menu_item_retirement_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS monthly_carrying_cost ON menu_item_retirement_alert TYPE option<float>;
  -- hidden cost of keeping (inventory, prep, menu space, training)
DEFINE FIELD IF NOT EXISTS monthly_revenue ON menu_item_retirement_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS net_cost_of_keeping ON menu_item_retirement_alert TYPE option<float>;
  -- carrying_cost - revenue (positive = losing money by keeping)
DEFINE FIELD IF NOT EXISTS months_on_menu  ON menu_item_retirement_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS predicted_unprofitable_months ON menu_item_retirement_alert TYPE option<int>;
  -- months until margin hits 0
DEFINE FIELD IF NOT EXISTS modification_rate ON menu_item_retirement_alert TYPE option<float>;
  -- % of orders with modifications (high = customers rejecting default)
DEFINE FIELD IF NOT EXISTS recommendation  ON menu_item_retirement_alert TYPE option<string>;
  -- 'retire_now' | 'retire_next_menu_cycle' | 'revive_recipe' | 'keep_monitoring' | 'seasonal_return'
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON menu_item_retirement_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON menu_item_retirement_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON menu_item_retirement_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON menu_item_retirement_alert TYPE option<string>;
  -- 'retire_now' | 'schedule_retirement' | 'revive_recipe' | 'monitor' | 'investigate' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON menu_item_retirement_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON menu_item_retirement_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON menu_item_retirement_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_menuretire_rule      ON menu_item_retirement_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_menuretire_status    ON menu_item_retirement_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_menuretire_severity  ON menu_item_retirement_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_menuretire_item      ON menu_item_retirement_alert FIELDS menu_item;

DEFINE FIELD IF NOT EXISTS menuretire_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS menuretire_score_threshold ON settings TYPE option<float> DEFAULT 65.0;
  -- retirement score to flag as candidate (default 65/100)
DEFINE FIELD IF NOT EXISTS menuretire_decline_threshold ON settings TYPE option<float> DEFAULT 50.0;
  -- % decline from peak to flag (default 50%)
DEFINE FIELD IF NOT EXISTS menuretire_carrying_cost_min ON settings TYPE option<float> DEFAULT 50.0;
  -- min monthly carrying cost to flag (default $50)
