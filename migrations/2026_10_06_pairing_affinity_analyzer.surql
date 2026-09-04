-- Migration: 2026_10_06_pairing_affinity_analyzer.surql
--
-- AI Menu Item Pairing Affinity Analyzer — 115th POSR-exclusive differentiator.
--
-- Research finding: Restaurants leave $300-1,200/mo per location from unmonetized
-- menu item pairing affinities (Cornell Menu Pairing, NRA Combo Study):
--   - 60% of revenue comes from item combinations, not individual items
--   - Customers naturally pair items (burger+fries, pasta+wine) but restaurants
--     don't measure which pairings are STRONGEST
--   - "Invisible pairings" — high-affinity combos not promoted as bundles
--   - Existing combos underperform vs natural pairings (wrong items bundled)
--   - Pairing decay: once-popular pairings fading (trend shift undetected)
--   - Cross-category pairings missed (dessert+coffee affinity, side+main)
--   - No pairing revenue attribution — can't quantify pairing ROI
--   - Pairing affinity not used for menu layout (items that go together
--     should be positioned together on menu)
--   - Seasonal pairing shifts undetected (soup+sandwich in winter, salad+drink summer)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO pairing affinity
-- analysis. menu-pairing.service (16th) GENERATES pairing suggestions via market
-- basket analysis. wine-pairing.service pairs WINE with food. cross-sell.service
-- measures cross-sell EFFECTIVENESS. None MEASURE pairing affinity STRENGTH,
-- detect invisible pairings, quantify pairing revenue, or recommend combo
-- creation from high-affinity natural pairs.
--
-- This new service ANALYZES PAIRING AFFINITY:
--   - Measures affinity strength (lift, confidence, support) for all item pairs
--   - Detects "invisible pairings" (high affinity, not promoted as combo)
--   - Quantifies pairing revenue (revenue attributable to item combinations)
--   - Identifies underperforming combos (bundle exists but affinity low)
--   - Tracks pairing decay (once-popular pairings fading)
--   - Detects cross-category pairing opportunities
--   - Recommends combo creation from high-affinity natural pairs
--   - Tracks seasonal pairing shifts

DEFINE TABLE IF NOT EXISTS pairing_affinity_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON pairing_affinity_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON pairing_affinity_alert TYPE string;
  -- 'invisible_pairing' | 'combo_underperforming' | 'pairing_decay' |
--   'cross_category_opportunity' | 'high_affinity_combo' | 'pairing_revenue_leak' |
--   'seasonal_pairing_shift' | 'menu_layout_recommendation'
DEFINE FIELD IF NOT EXISTS severity        ON pairing_affinity_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS item_a          ON pairing_affinity_alert TYPE string;
DEFINE FIELD IF NOT EXISTS item_b          ON pairing_affinity_alert TYPE string;
DEFINE FIELD IF NOT EXISTS category_a      ON pairing_affinity_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS category_b      ON pairing_affinity_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS co_occurrence_count ON pairing_affinity_alert TYPE option<int>;
  -- how many orders contain both items
DEFINE FIELD IF NOT EXISTS support_pct     ON pairing_affinity_alert TYPE option<float>;
  -- % of all orders containing both items
DEFINE FIELD IF NOT EXISTS confidence_pct  ON pairing_affinity_alert TYPE option<float>;
  -- P(B | A) — % of A orders that also contain B
DEFINE FIELD IF NOT EXISTS lift            ON pairing_affinity_alert TYPE option<float>;
  -- confidence / P(B) — affinity strength (>1 = positive affinity)
DEFINE FIELD IF NOT EXISTS affinity_score  ON pairing_affinity_alert TYPE option<float>;
  -- 0-100 composite affinity score
DEFINE FIELD IF NOT EXISTS pairing_revenue ON pairing_affinity_alert TYPE option<float>;
  -- revenue from orders containing both items
DEFINE FIELD IF NOT EXISTS is_promoted_combo ON pairing_affinity_alert TYPE option<bool>;
  -- is this pair already a promoted combo?
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON pairing_affinity_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON pairing_affinity_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON pairing_affinity_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON pairing_affinity_alert TYPE option<string>;
  -- 'create_combo' | 'redesign_combo' | 'promote_pairing' | 'menu_reposition' |
--   'remove_combo' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON pairing_affinity_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON pairing_affinity_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON pairing_affinity_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_pairaff_rule      ON pairing_affinity_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_pairaff_status    ON pairing_affinity_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_pairaff_severity  ON pairing_affinity_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_pairaff_item_a    ON pairing_affinity_alert FIELDS item_a;
DEFINE INDEX IF NOT EXISTS idx_pairaff_item_b    ON pairing_affinity_alert FIELDS item_b;

DEFINE FIELD IF NOT EXISTS pairaff_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS pairaff_lift_threshold ON settings TYPE option<float> DEFAULT 2.0;
  -- minimum lift to flag as high affinity (default 2.0 = 2x more likely than random)
DEFINE FIELD IF NOT EXISTS pairaff_support_min   ON settings TYPE option<float> DEFAULT 5.0;
  -- minimum support % to consider pairing significant (default 5% of orders)
DEFINE FIELD IF NOT EXISTS pairaff_revenue_threshold ON settings TYPE option<float> DEFAULT 500.0;
  -- minimum pairing revenue to flag as significant (default $500/mo)
DEFINE FIELD IF NOT EXISTS pairaff_decay_drop    ON settings TYPE option<float> DEFAULT 30.0;
  -- % drop in co-occurrence to flag pairing decay (default 30%)
