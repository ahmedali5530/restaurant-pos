-- Migration: 2026_08_28_competitor_monitoring.surql
--
-- AI Competitor Price Monitoring — track competitor prices + AI recommendations.
--
-- Research finding: Toast Competitor Insights $45+/mo (higher tier), Square
-- Menu Benchmarking in Plus. POSR offers it free — operators manually enter
-- competitor menu prices (or import via AI from web photos/menus) + the system
-- compares them against POSR's prices + AI generates pricing recommendations
-- (match/undercut/premium positioning based on brand strategy).

DEFINE TABLE IF NOT EXISTS competitor_price TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON competitor_price TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS dish            ON competitor_price TYPE option<record<dish>>;
DEFINE FIELD IF NOT EXISTS dish_id         ON competitor_price TYPE string;
DEFINE FIELD IF NOT EXISTS dish_name       ON competitor_price TYPE string;
DEFINE FIELD IF NOT EXISTS our_price       ON competitor_price TYPE float;
DEFINE FIELD IF NOT EXISTS competitor_name ON competitor_price TYPE string;
DEFINE FIELD IF NOT EXISTS competitor_price_value ON competitor_price TYPE float;
DEFINE FIELD IF NOT EXISTS price_diff      ON competitor_price TYPE float;
  -- our_price - competitor_price (positive = we're more expensive)
DEFINE FIELD IF NOT EXISTS price_diff_pct  ON competitor_price TYPE float;
  -- (our - competitor) / competitor × 100
DEFINE FIELD IF NOT EXISTS position        ON competitor_price TYPE string;
  -- 'premium' (we're >10% higher) | 'matching' (within ±10%) | 'discount' (we're >10% lower)
DEFINE FIELD IF NOT EXISTS location_distance_km ON competitor_price TYPE option<float>;
DEFINE FIELD IF NOT EXISTS source          ON competitor_price TYPE string DEFAULT 'manual';
  -- 'manual' | 'web_scrape' | 'photo_scan' | 'delivery_app'
DEFINE FIELD IF NOT EXISTS ai_recommendation ON competitor_price TYPE option<string>;
  -- 'match' | 'undercut' | 'premium' | 'keep' | 'review'
DEFINE FIELD IF NOT EXISTS ai_insight      ON competitor_price TYPE option<string>;
DEFINE FIELD IF NOT EXISTS collected_at     ON competitor_price TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON competitor_price TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_cp_dish_id    ON competitor_price FIELDS dish_id;
DEFINE INDEX IF NOT EXISTS idx_cp_competitor ON competitor_price FIELDS competitor_name;
DEFINE INDEX IF NOT EXISTS idx_cp_position   ON competitor_price FIELDS position;

DEFINE FIELD IF NOT EXISTS competitor_monitor_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS competitor_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS competitor_lookback_days ON settings TYPE option<int> DEFAULT 90;
