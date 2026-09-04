-- Migration: 2026_09_30_promo_halo_effect.surql
--
-- AI Promotional Halo Effect Analyzer — 109th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-800/mo per location from unmeasured
-- promotional halo effects (Cornell Promo Analytics, NRA Halo Study):
--   - A burger promo boosts fries + drink sales (complements) — 30-50% of true
--     promo impact is INDIRECT and goes unmeasured
--   - A steak promo cannibalizes chicken sales (substitutes) — promos that look
--     profitable may actually LOSE money when cannibalization is counted
--   - Promos evaluated only on promoted-item revenue (direct lift)
--   - No POS tracks cross-item promotional lift (halo) or negative halo (cannibalization)
--   - Cross-category effects ignored (dessert promo boosts coffee sales)
--   - Halo decay over promo duration not tracked (effect fatigue)
--   - Repeat halo: customers who tried promo item don't return for full-price item
--   - Optimal promo+complement bundles never identified
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO halo effect tracking.
-- promo-analytics measures promoted-item performance. promo-forecast predicts
-- promo demand. promo-abuse detects fraud. None measure INDIRECT cross-item
-- sales lift caused by a promotion (the "halo") or negative cannibalization.
--
-- This new service MEASURES PROMOTIONAL HALO EFFECTS:
--   - Tracks sales of non-promoted items DURING vs BEFORE a promotion
--   - Separates complements (positive halo) from substitutes (cannibalization)
--   - Calculates true promo ROI including indirect revenue
--   - Detects halo decay over promo duration
--   - Tracks repeat-purchase halo (promo → full-price return)
--   - Identifies optimal promo+complement bundles
--   - Flags promos that lose money after cannibalization

DEFINE TABLE IF NOT EXISTS promo_halo_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON promo_halo_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON promo_halo_alert TYPE string;
  -- 'halo_uplift' | 'cannibalization' | 'halo_underestimated' |
--   'halo_negative' | 'cross_category_lift' | 'halo_decay' |
--   'repeat_halo' | 'optimal_promo_combo'
DEFINE FIELD IF NOT EXISTS severity        ON promo_halo_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS promotion_name  ON promo_halo_alert TYPE string;
DEFINE FIELD IF NOT EXISTS promoted_item   ON promo_halo_alert TYPE string;
DEFINE FIELD IF NOT EXISTS affected_item   ON promo_halo_alert TYPE string;
DEFINE FIELD IF NOT EXISTS relationship    ON promo_halo_alert TYPE option<string>;
  -- 'complement' | 'substitute' | 'cross_category' | 'repeat_purchase'
DEFINE FIELD IF NOT EXISTS before_sales    ON promo_halo_alert TYPE option<float>;
  -- avg daily sales of affected_item before promo
DEFINE FIELD IF NOT EXISTS during_sales    ON promo_halo_alert TYPE option<float>;
  -- avg daily sales of affected_item during promo
DEFINE FIELD IF NOT EXISTS halo_lift_pct   ON promo_halo_alert TYPE option<float>;
  -- % change in affected_item sales during promo (positive=halo, negative=cannibalization)
DEFINE FIELD IF NOT EXISTS direct_revenue  ON promo_halo_alert TYPE option<float>;
  -- promoted item revenue during promo
DEFINE FIELD IF NOT EXISTS halo_revenue    ON promo_halo_alert TYPE option<float>;
  -- indirect revenue from halo (affected item uplift)
DEFINE FIELD IF NOT EXISTS cannibalization_revenue ON promo_halo_alert TYPE option<float>;
  -- revenue LOST to cannibalization (negative halo)
DEFINE FIELD IF NOT EXISTS true_roi_pct    ON promo_halo_alert TYPE option<float>;
  -- true ROI including halo + cannibalization
DEFINE FIELD IF NOT EXISTS promo_days_elapsed ON promo_halo_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON promo_halo_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON promo_halo_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON promo_halo_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON promo_halo_alert TYPE option<string>;
  -- 'count_halo' | 'stop_promo' | 'extend_promo' | 'bundle_promo' |
--   'investigate' | 'adjust_targeting' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON promo_halo_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON promo_halo_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON promo_halo_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_promohalo_rule      ON promo_halo_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_promohalo_status    ON promo_halo_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_promohalo_severity  ON promo_halo_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_promohalo_promo     ON promo_halo_alert FIELDS promotion_name;
DEFINE INDEX IF NOT EXISTS idx_promohalo_item      ON promo_halo_alert FIELDS affected_item;

DEFINE FIELD IF NOT EXISTS promohalo_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS promohalo_halo_threshold ON settings TYPE option<float> DEFAULT 10.0;
  -- % uplift on affected item to count as significant halo (default 10%)
DEFINE FIELD IF NOT EXISTS promohalo_cannibal_threshold ON settings TYPE option<float> DEFAULT 15.0;
  -- % drop on affected item to count as cannibalization (default 15%)
DEFINE FIELD IF NOT EXISTS promohalo_decay_drop ON settings TYPE option<float> DEFAULT 30.0;
  -- % drop in halo effect over promo duration to flag decay (default 30%)
DEFINE FIELD IF NOT EXISTS promohalo_repeat_threshold ON settings TYPE option<float> DEFAULT 20.0;
  -- % of promo buyers returning for full-price item to count as repeat halo (default 20%)
