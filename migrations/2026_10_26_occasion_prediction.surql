-- Migration: 2026_10_26_occasion_prediction.surql
--
-- AI Customer Occasion Prediction Engine — 135th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $300-1,200/mo per location from not
-- recognizing customer visit occasions (Cornell Service Personalization):
--   - 80% of visits have a specific occasion (business, date, family, solo, etc.)
--   - Each occasion requires different service style, pacing, upsell approach
--   - Business lunch: fast, efficient, quiet table, quick payment
--   - Date night: intimate, unhurried, wine upsell, dessert recommendation
--   - Family dinner: high chair, kids menu, patient service, large table
--   - Solo dining: bar seating, engaging conversation, quick service
--   - Celebration: champagne, special plating, group photo, manager greeting
--   - Casual catch-up: comfortable seating, no rush, shareable items
--   - No POS predicts occasion from order patterns + party + timing
--   - Generic service for all occasions → missed personalization revenue
--   - Occasion-appropriate upselling increases revenue 20-30%
--   - Wrong service style (rushing a date night) damages experience
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO occasion prediction.
-- wait-experience-personalizer personalizes wait by profile. server-table-
-- assignment matches servers. table-preference learns table types. customer-
-- segmentation groups by behavior. None predict the OCCASION for each visit.
--
-- This new service PREDICTS CUSTOMER OCCASION:
--   - Analyzes party size, time of day, day of week, order composition
--   - Predicts occasion type (business, date, family, solo, celebration, casual)
--   - Recommends occasion-appropriate service style + upsell approach
--   - Tracks occasion patterns per customer (always business lunch on weekdays)
--   - Detects occasion shifts (casual → celebration = birthday/anniversary)
--   - Correlates occasion with spend (celebration = 2x spend)
--   - Enables occasion-specific menu recommendations
--   - Calculates revenue impact of occasion-appropriate service

DEFINE TABLE IF NOT EXISTS occasion_prediction_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON occasion_prediction_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON occasion_prediction_alert TYPE string;
  -- 'occasion_predicted' | 'celebration_detected' | 'business_lunch_pattern' |
--   'date_night_indicators' | 'family_dining_detected' | 'occasion_spend_uplift' |
--   'occasion_shift' | 'occasion_upsell_opportunity'
DEFINE FIELD IF NOT EXISTS severity        ON occasion_prediction_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id     ON occasion_prediction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON occasion_prediction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS predicted_occasion ON occasion_prediction_alert TYPE option<string>;
  -- 'business_lunch' | 'date_night' | 'family_dinner' | 'solo' | 'celebration' | 'casual_catchup' | 'business_dinner'
DEFINE FIELD IF NOT EXISTS confidence_pct  ON occasion_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS party_size      ON occasion_prediction_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS time_of_day     ON occasion_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS day_of_week     ON occasion_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS occasion_signals ON occasion_prediction_alert TYPE option<string>;
  -- comma-separated signals detected
DEFINE FIELD IF NOT EXISTS recommended_service_style ON occasion_prediction_alert TYPE option<string>;
  -- 'fast_efficient' | 'unhurried_intimate' | 'patient_family' | 'engaging_solo' | 'celebratory'
DEFINE FIELD IF NOT EXISTS recommended_upsell ON occasion_prediction_alert TYPE option<string>;
  -- comma-separated recommended upsell items
DEFINE FIELD IF NOT EXISTS avg_occasion_spend ON occasion_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS avg_non_occasion_spend ON occasion_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON occasion_prediction_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON occasion_prediction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON occasion_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON occasion_prediction_alert TYPE option<string>;
  -- 'apply_service_style' | 'offer_upsell' | 'acknowledge_occasion' | 'update_profile' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON occasion_prediction_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON occasion_prediction_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON occasion_prediction_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_occasion_rule      ON occasion_prediction_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_occasion_status    ON occasion_prediction_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_occasion_severity  ON occasion_prediction_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_occasion_customer  ON occasion_prediction_alert FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_occasion_type      ON occasion_prediction_alert FIELDS predicted_occasion;

DEFINE FIELD IF NOT EXISTS occasion_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS occasion_confidence_threshold ON settings TYPE option<float> DEFAULT 70.0;
  -- min confidence to act on prediction (default 70%)
DEFINE FIELD IF NOT EXISTS occasion_spend_uplift_threshold ON settings TYPE option<float> DEFAULT 30.0;
  -- % spend difference to flag as uplift (default 30%)
