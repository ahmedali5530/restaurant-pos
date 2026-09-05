-- Migration: 2026_10_20_menu_description_impact.surql
--
-- AI Menu Description Impact Analyzer — 129th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-800/mo per location from poor menu
-- descriptions (Cornell Menu Psychology, NRA Menu Design):
--   - Menu descriptions affect ordering rate by 20-30%
--   - Sensory words (crispy, tender, aromatic) increase orders 15-25%
--   - Origin words (Italian, house-made, local) increase perceived value 10-20%
--   - Too long descriptions confuse customers → lower orders
--   - Too short descriptions lack appeal → lower orders
--   - Price anchoring in descriptions (compared to $X) affects willingness to pay
--   - No POS tracks how description wording affects ordering rates
--   - Descriptions written once at launch, never optimized
--   - A/B testing descriptions is manual and rare
--   - Geographic/cultural word preferences undetected
--   - Description-language mismatch (technical culinary terms vs customer language)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO description impact
-- analysis. menu-optimization does BCG matrix. price-psychology uses behavioral
-- economics for pricing. dish-popularity tracks volume. None analyze how the
-- DESCRIPTION TEXT itself drives or suppresses orders.
--
-- This new service ANALYZES MENU DESCRIPTION IMPACT:
--   - Tracks word count, sensory words, origin words, emotional language
--   - Measures ordering rate per description style
--   - Detects underperforming descriptions (good item, bad description)
--   - Recommends description rewrites with predicted uplift
--   - A/B tests description variations
--   - Tracks description fatigue (same description losing appeal over time)
--   - Identifies high-impact words that boost orders
--   - Calculates revenue uplift from description optimization

DEFINE TABLE IF NOT EXISTS menu_description_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON menu_description_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON menu_description_alert TYPE string;
  -- 'underperforming_description' | 'sensory_word_gap' | 'description_too_long' |
--   'description_too_short' | 'high_impact_word_opportunity' | 'description_fatigue' |
--   'price_anchor_missing' | 'description_ab_test_winner'
DEFINE FIELD IF NOT EXISTS severity        ON menu_description_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON menu_description_alert TYPE string;
DEFINE FIELD IF NOT EXISTS current_description ON menu_description_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS word_count      ON menu_description_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS sensory_word_count ON menu_description_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS origin_word_count ON menu_description_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS emotional_word_count ON menu_description_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS order_rate_pct  ON menu_description_alert TYPE option<float>;
  -- % of customers who order this item
DEFINE FIELD IF NOT EXISTS peer_avg_order_rate ON menu_description_alert TYPE option<float>;
  -- avg order rate for similar items
DEFINE FIELD IF NOT EXISTS order_rate_gap  ON menu_description_alert TYPE option<float>;
  -- peer_avg - current (positive = underperforming)
DEFINE FIELD IF NOT EXISTS predicted_uplift_pct ON menu_description_alert TYPE option<float>;
  -- predicted % increase from description rewrite
DEFINE FIELD IF NOT EXISTS recommended_words ON menu_description_alert TYPE option<string>;
  -- comma-separated words to add
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON menu_description_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON menu_description_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON menu_description_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON menu_description_alert TYPE option<string>;
  -- 'rewrite_description' | 'add_sensory_words' | 'shorten' | 'lengthen' | 'add_origin' |
--   'add_price_anchor' | 'test_variation' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON menu_description_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON menu_description_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON menu_description_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_menudesc_rule      ON menu_description_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_menudesc_status    ON menu_description_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_menudesc_severity  ON menu_description_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_menudesc_item      ON menu_description_alert FIELDS menu_item;

DEFINE FIELD IF NOT EXISTS menudesc_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS menudesc_gap_threshold ON settings TYPE option<float> DEFAULT 15.0;
  -- % order rate gap to flag as underperforming (default 15%)
DEFINE FIELD IF NOT EXISTS menudesc_max_words     ON settings TYPE option<int> DEFAULT 30;
  -- max recommended word count (default 30)
DEFINE FIELD IF NOT EXISTS menudesc_min_words     ON settings TYPE option<int> DEFAULT 5;
  -- min recommended word count (default 5)
