-- Migration: 2026_09_28_price_ab_testing.surql
--
-- AI Menu Price A/B Testing Optimizer — 107th POSR-exclusive differentiator.
--
-- Research finding: Restaurants leave $200-1,000/mo per location on the table
-- from suboptimal pricing (Cornell Menu Engineering, NRA Pricing Report):
--   - No price testing: 80% of restaurants set prices once and never test
--   - Underpriced items: selling at $12 when $14 would keep same volume
--   - Overpriced items: selling at $18 when $16 would double volume
--   - Cross-price effects: raising Item A price drops Item B sales (substitutes)
--   - No data-driven pricing: managers guess based on "gut feel"
--   - Margin erosion: ingredient costs rise but prices stay static
--   - Test duration unknown: tests run too short (inconclusive) or too long (lost revenue)
--   - Rollback delay: knowing a test failed but waiting weeks to revert
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO A/B price testing.
-- price-elasticity measures theoretical demand curves. dynamic-pricing adjusts
-- prices based on demand. price-psychology uses behavioral economics. None
-- actually RUN controlled A/B TESTS on menu item prices with statistical
-- significance tracking and revenue impact measurement.
--
-- This new service RUNS A/B PRICE TESTS:
--   - Tests different price points for menu items
--   - Randomly assigns customers to control (current price) vs test (new price)
--   - Tracks revenue, volume, margin per variant
--   - Calculates statistical significance
--   - Measures cross-price effects (substitutes + complements)
--   - Recommends optimal price based on revenue maximization
--   - Auto-rolls back failed tests
--   - Tracks test duration for statistical validity

DEFINE TABLE IF NOT EXISTS price_test_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON price_test_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON price_test_alert TYPE string;
  -- 'test_revenue_uplift' | 'test_volume_drop' | 'test_margin_improvement' |
--   'cross_price_effect' | 'test_significant' | 'test_inconclusive' |
--   'rollback_needed' | 'optimal_price_found'
DEFINE FIELD IF NOT EXISTS severity        ON price_test_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON price_test_alert TYPE string;
DEFINE FIELD IF NOT EXISTS control_price   ON price_test_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS test_price      ON price_test_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS control_revenue ON price_test_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS test_revenue    ON price_test_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS control_volume  ON price_test_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS test_volume     ON price_test_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS revenue_delta_pct ON price_test_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS volume_delta_pct ON price_test_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS significance_pct ON price_test_alert TYPE option<float>;
  -- statistical confidence % (0-100)
DEFINE FIELD IF NOT EXISTS test_days_elapsed ON price_test_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS est_monthly_uplift ON price_test_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS cross_affected_item ON price_test_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS description     ON price_test_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON price_test_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON price_test_alert TYPE option<string>;
  -- 'adopt_price' | 'rollback_now' | 'extend_test' | 'stop_test' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON price_test_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON price_test_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON price_test_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_pricetest_rule      ON price_test_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_pricetest_status    ON price_test_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_pricetest_severity  ON price_test_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_pricetest_item      ON price_test_alert FIELDS menu_item;

DEFINE FIELD IF NOT EXISTS pricetest_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS pricetest_min_significance ON settings TYPE option<float> DEFAULT 95.0;
  -- minimum statistical significance to declare winner (default 95%)
DEFINE FIELD IF NOT EXISTS pricetest_min_days      ON settings TYPE option<int> DEFAULT 7;
  -- minimum test duration in days (default 7)
DEFINE FIELD IF NOT EXISTS pricetest_max_days      ON settings TYPE option<int> DEFAULT 21;
  -- maximum test duration (auto-stop if inconclusive, default 21)
DEFINE FIELD IF NOT EXISTS pricetest_revenue_threshold ON settings TYPE option<float> DEFAULT 5.0;
  -- revenue delta % to flag as significant (default 5%)
