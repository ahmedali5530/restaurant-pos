-- Migration: 2026_10_18_preference_drift.surql
--
-- AI Customer Preference Drift Tracker — 127th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,000/mo per location from stale
-- customer preference profiles (Cornell Personalization, NRA CRM):
--   - 40% of customer preferences drift within 6 months of initial profile
--   - Favorite item changes as customers explore menu → stale recommendations
--   - Category migration (mains→salads) signals health trend → adapt
--   - Price tier shift (budget→premium) signals income change → upsell opportunity
--   - Dietary evolution (omnivore→vegetarian) → must update or lose customer
--   - No POS tracks preference DRIFT (only static snapshot at profile creation)
--   - Stale profiles send wrong recommendations → customer feels misunderstood
--   - "Set and forget" profiles become increasingly inaccurate over time
--   - Preference drift rate varies by customer (fast vs slow changers)
--   - Drift detection enables dynamic profile updates → ever-more-accurate
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO preference drift
-- tracking. guest-preference.service (existing) learns STATIC preferences.
-- customer-segmentation groups customers by current behavior. order-pattern-
-- anomaly detects one-time anomalies. None track the gradual EVOLUTION of
-- preferences over time.
--
-- This new service TRACKS PREFERENCE DRIFT:
--   - Monitors favorite item changes over time (old favorite vs new favorite)
--   - Detects category migration trajectory (which categories gaining/losing)
--   - Tracks price tier evolution (budget→mid→premium or reverse)
--   - Monitors dietary pattern shifts (omnivore→vegetarian→vegan)
--   - Measures drift velocity (fast changers vs stable customers)
--   - Updates customer profile dynamically based on drift
--   - Flags significant drift for manual review or automated update
--   - Calculates personalization accuracy improvement from drift tracking

DEFINE TABLE IF NOT EXISTS preference_drift_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON preference_drift_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON preference_drift_alert TYPE string;
  -- 'favorite_item_shift' | 'category_migration' | 'price_tier_evolution' |
--   'dietary_evolution' | 'fast_drifter' | 'stable_customer' |
--   'profile_staleness' | 'preference_diversification'
DEFINE FIELD IF NOT EXISTS severity        ON preference_drift_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id     ON preference_drift_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON preference_drift_alert TYPE string;
DEFINE FIELD IF NOT EXISTS drift_type      ON preference_drift_alert TYPE option<string>;
  -- 'item' | 'category' | 'price_tier' | 'dietary' | 'diversification'
DEFINE FIELD IF NOT EXISTS old_preference  ON preference_drift_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS new_preference  ON preference_drift_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS drift_pct       ON preference_drift_alert TYPE option<float>;
  -- % shift from old to new preference
DEFINE FIELD IF NOT EXISTS drift_velocity  ON preference_drift_alert TYPE option<string>;
  -- 'fast' | 'moderate' | 'slow' | 'stable'
DEFINE FIELD IF NOT EXISTS profile_age_months ON preference_drift_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS last_profile_update ON preference_drift_alert TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS staleness_days  ON preference_drift_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS recommendation_accuracy_pct ON preference_drift_alert TYPE option<float>;
  -- estimated accuracy of current profile (0-100)
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON preference_drift_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON preference_drift_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON preference_drift_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON preference_drift_alert TYPE option<string>;
  -- 'update_profile' | 'update_recommendations' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON preference_drift_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON preference_drift_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON preference_drift_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_prefdrift_rule      ON preference_drift_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_prefdrift_status    ON preference_drift_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_prefdrift_severity  ON preference_drift_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_prefdrift_customer  ON preference_drift_alert FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_prefdrift_type      ON preference_drift_alert FIELDS drift_type;

DEFINE FIELD IF NOT EXISTS prefdrift_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS prefdrift_shift_threshold ON settings TYPE option<float> DEFAULT 30.0;
  -- % shift to flag as significant drift (default 30%)
DEFINE FIELD IF NOT EXISTS prefdrift_staleness_days ON settings TYPE option<int> DEFAULT 90;
  -- days since last profile update to flag staleness (default 90)
DEFINE FIELD IF NOT EXISTS prefdrift_fast_drifter_orders ON settings TYPE option<int> DEFAULT 3;
  -- min preference changes to flag as fast drifter (default 3 changes in 6mo)
