-- Migration: 2026_08_29_menu_rotation.surql
--
-- AI Menu Rotation Suggester — 44th POSR-exclusive differentiator.
--
-- Research finding: Menu fatigue causes 15-20% sales decline per item after
-- 4-6 weeks on menu (Cornell hospitality research, NRA menu psychology).
-- Customers crave novelty — without rotation, even Stars become stale. Toast
-- Menu Intelligence ($100+/mo) shows popularity but DOESN'T detect fatigue or
-- recommend WHEN to rotate. Square Menu Insights gates analytics to Plus/Pro
-- and lacks rotation timing. Lightspeed Menu Engineering is an add-on.
--
-- Distinct from:
--   - menu-optimization.service (BCG matrix classification — not fatigue/timing)
--   - menu-pairing.service (which items pair together — not when to rotate)
--   - menu (operational menu management — not predictive)
--   - seasonal.service (seasonal patterns — not per-item fatigue)
--   - recipe-optimization.service (recipe cost reduction — not menu rotation)
--
-- This service detects ITEM FATIGUE (declining sales trend) + recommends WHEN
-- to rotate items, suggests replacements from same category, and projects
-- revenue impact of refreshing the menu.

DEFINE TABLE IF NOT EXISTS menu_rotation_suggestion TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON menu_rotation_suggestion TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON menu_rotation_suggestion TYPE string;
  -- 'fatigue_detected' | 'rising_star' | 'rotation_candidate' | 'comeback_candidate' | 'permanent_keep'
DEFINE FIELD IF NOT EXISTS severity       ON menu_rotation_suggestion TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS item_id        ON menu_rotation_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_name      ON menu_rotation_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS category        ON menu_rotation_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS weeks_on_menu  ON menu_rotation_suggestion TYPE option<int>;
  -- weeks since item was first sold
DEFINE FIELD IF NOT EXISTS recent_sales    ON menu_rotation_suggestion TYPE float DEFAULT 0;
  -- units sold in last 7 days
DEFINE FIELD IF NOT EXISTS baseline_sales ON menu_rotation_suggestion TYPE float DEFAULT 0;
  -- avg weekly sales during peak (first 4 weeks)
DEFINE FIELD IF NOT EXISTS fatigue_score   ON menu_rotation_suggestion TYPE float DEFAULT 0;
  -- 0-100 (100 = severe fatigue)
DEFINE FIELD IF NOT EXISTS sales_trend_pct ON menu_rotation_suggestion TYPE float DEFAULT 0;
  -- recent vs baseline (% change, negative = declining)
DEFINE FIELD IF NOT EXISTS suggested_action ON menu_rotation_suggestion TYPE option<string>;
  -- 'rotate_out' | 'rotate_out_30d' | 'feature' | 'keep' | 'rename' | 'reposition'
DEFINE FIELD IF NOT EXISTS suggested_replacement ON menu_rotation_suggestion TYPE option<string>;
  -- name of suggested replacement item (from same category)
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON menu_rotation_suggestion TYPE float DEFAULT 0;
  -- projected $ impact of rotating (-ve = loss, +ve = gain from refresh)
DEFINE FIELD IF NOT EXISTS description     ON menu_rotation_suggestion TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON menu_rotation_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON menu_rotation_suggestion TYPE option<string>;
  -- 'rotate_now' | 'feature_prominently' | 'rename_reposition' | 'keep_permanent' | 'monitor_2w'
DEFINE FIELD IF NOT EXISTS status          ON menu_rotation_suggestion TYPE string DEFAULT 'open';
  -- 'open' | 'rotated' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON menu_rotation_suggestion TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON menu_rotation_suggestion TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_mrs_rule_id    ON menu_rotation_suggestion FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_mrs_severity  ON menu_rotation_suggestion FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_mrs_status    ON menu_rotation_suggestion FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_mrs_item      ON menu_rotation_suggestion FIELDS item_id;

-- Settings
DEFINE FIELD IF NOT EXISTS menu_rotation_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS menu_rotation_lookback_weeks   ON settings TYPE option<int>   DEFAULT 12;
  -- historical window for trend analysis
DEFINE FIELD IF NOT EXISTS menu_rotation_fatigue_threshold ON settings TYPE option<float> DEFAULT -0.25;
  -- sales drop >25% from baseline = fatigue
DEFINE FIELD IF NOT EXISTS menu_rotation_min_weeks_on_menu ON settings TYPE option<int>   DEFAULT 4;
  -- need at least 4 weeks of sales to assess fatigue
DEFINE FIELD IF NOT EXISTS menu_rotation_comback_weeks    ON settings TYPE option<int>   DEFAULT 8;
  -- rotate out for 8 weeks before comeback candidate
