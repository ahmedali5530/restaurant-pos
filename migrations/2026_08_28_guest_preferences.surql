-- Migration: 2026_08_28_guest_preferences.surql
--
-- AI Guest Preference Learning — personalized guest profiles.
--
-- Unique to POSR — Toast and Square don't have individual guest preference
-- learning. POSR analyzes each customer's order history to learn:
--   - Favorite dishes + categories
--   - Preferred order time (lunch/dinner/late)
--   - Preferred table/floor
--   - Dietary restrictions (inferred from avoided items)
--   - Average party size
--   - Preferred payment method
--   - Special requests/notes frequency
--   - Liked add-ons/modifiers
-- + AI generates personalized recommendations for their next visit.

DEFINE TABLE IF NOT EXISTS guest_preference TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON guest_preference TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer_id     ON guest_preference TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON guest_preference TYPE string;
DEFINE FIELD IF NOT EXISTS email           ON guest_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS phone           ON guest_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS total_visits    ON guest_preference TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS favorite_dishes ON guest_preference TYPE option<array<object>>;
  -- [{name, times_ordered, last_ordered}]
DEFINE FIELD IF NOT EXISTS favorite_categories ON guest_preference TYPE option<array<string>>;
DEFINE FIELD IF NOT EXISTS preferred_order_time ON guest_preference TYPE option<string>;
  -- 'breakfast' | 'lunch' | 'dinner' | 'late_night'
DEFINE FIELD IF NOT EXISTS preferred_table ON guest_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS preferred_floor ON guest_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS avg_party_size  ON guest_preference TYPE float DEFAULT 2;
DEFINE FIELD IF NOT EXISTS preferred_payment_method ON guest_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS dietary_notes  ON guest_preference TYPE option<array<string>>;
  -- Inferred: 'vegetarian' | 'vegan' | 'gluten_free' | 'no_spicy' | etc.
DEFINE FIELD IF NOT EXISTS liked_addons   ON guest_preference TYPE option<array<string>>;
  -- Frequently ordered modifiers/add-ons
DEFINE FIELD IF NOT EXISTS special_requests ON guest_preference TYPE option<array<string>>;
  -- Frequently used notes/comments
DEFINE FIELD IF NOT EXISTS avg_spend      ON guest_preference TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS last_visit_date ON guest_preference TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS visit_frequency_days ON guest_preference TYPE option<float>;
  -- Avg days between visits
DEFINE FIELD IF NOT EXISTS ai_personalized_recs ON guest_preference TYPE option<array<string>>;
  -- AI-generated recommendations for next visit
DEFINE FIELD IF NOT EXISTS ai_insight      ON guest_preference TYPE option<string>;
DEFINE FIELD IF NOT EXISTS generated_at    ON guest_preference TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON guest_preference TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_gp_customer_id ON guest_preference FIELDS customer_id;

DEFINE FIELD IF NOT EXISTS guest_pref_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS guest_pref_min_visits ON settings TYPE option<int> DEFAULT 2;
DEFINE FIELD IF NOT EXISTS guest_pref_lookback_days ON settings TYPE option<int> DEFAULT 365;
