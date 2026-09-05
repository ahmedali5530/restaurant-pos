-- Migration: 2026_10_25_price_elasticity_drift.surql
--
-- AI Menu Item Price Elasticity Drift Tracker — 134th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $400-1,500/mo per location from stale
-- price elasticity assumptions (Cornell Pricing, NRA Revenue Management):
--   - Price elasticity is NOT static — it shifts over time
--   - Economic conditions change sensitivity (recession → more elastic)
--   - Competitor pricing shifts elasticity (competitor cheaper → more elastic)
--   - Brand loyalty growth → less elastic (loyal customers pay more)
--   - Menu item maturity → less elastic (established item = habitual purchase)
--   - Seasonal elasticity shifts (holiday = less elastic, summer = more)
--   - No POS re-measures elasticity after initial calculation
--   - Prices set based on old elasticity → suboptimal pricing
--   - "Set and forget" pricing assumes elasticity never changes
--   - Elasticity drift compounds: 5% shift per quarter = 20% per year
--   - Menu items becoming MORE elastic need price freezes/decreases
--   - Menu items becoming LESS elastic can absorb price increases
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO elasticity drift
-- tracking. price-elasticity.service (14th) computes STATIC elasticity.
-- dynamic-pricing adjusts prices by demand. price-ab-testing tests specific
-- prices. price-psychology uses behavioral economics. None track how
-- elasticity ITSELF changes over time.
--
-- This new service TRACKS ELASTICITY DRIFT:
--   - Re-measures elasticity coefficient quarterly
--   - Tracks elasticity trajectory (increasing, stable, decreasing sensitivity)
--   - Detects items becoming more elastic (price-sensitive) → freeze/decrease
--   - Detects items becoming less elastic (price-insensitive) → increase
--   - Correlates drift with external factors (economy, competition, season)
--   - Recommends adaptive pricing strategies based on current elasticity
--   - Calculates revenue impact of pricing at wrong elasticity assumption
--   - Flags items where pricing strategy hasn't adapted to new elasticity

DEFINE TABLE IF NOT EXISTS price_elasticity_drift_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON price_elasticity_drift_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON price_elasticity_drift_alert TYPE string;
  -- 'elasticity_increasing' | 'elasticity_decreasing' | 'elasticity_stale' |
--   'pricing_strategy_mismatch' | 'elasticity_volatility' | 'seasonal_elasticity_shift' |
--   'competitor_pressure_elasticity' | 'optimal_reprice_window'
DEFINE FIELD IF NOT EXISTS severity        ON price_elasticity_drift_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON price_elasticity_drift_alert TYPE string;
DEFINE FIELD IF NOT EXISTS current_elasticity ON price_elasticity_drift_alert TYPE option<float>;
  -- current elasticity coefficient (negative = normal demand curve)
DEFINE FIELD IF NOT EXISTS previous_elasticity ON price_elasticity_drift_alert TYPE option<float>;
  -- elasticity from last measurement period
DEFINE FIELD IF NOT EXISTS elasticity_change_pct ON price_elasticity_drift_alert TYPE option<float>;
  -- % change in elasticity coefficient
DEFINE FIELD IF NOT EXISTS elasticity_trend ON price_elasticity_drift_alert TYPE option<string>;
  -- 'more_elastic' | 'less_elastic' | 'stable'
DEFINE FIELD IF NOT EXISTS current_price   ON price_elasticity_drift_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS recommended_price ON price_elasticity_drift_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS last_elasticity_measurement ON price_elasticity_drift_alert TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS months_since_measurement ON price_elasticity_drift_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS external_factors ON price_elasticity_drift_alert TYPE option<string>;
  -- 'recession' | 'competitor_price_drop' | 'seasonal_shift' | 'brand_growth' | 'none'
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON price_elasticity_drift_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON price_elasticity_drift_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON price_elasticity_drift_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON price_elasticity_drift_alert TYPE option<string>;
  -- 'raise_price' | 'lower_price' | 'hold_price' | 'remeasure' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON price_elasticity_drift_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON price_elasticity_drift_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON price_elasticity_drift_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_elasdrift_rule      ON price_elasticity_drift_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_elasdrift_status    ON price_elasticity_drift_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_elasdrift_severity  ON price_elasticity_drift_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_elasdrift_item      ON price_elasticity_drift_alert FIELDS menu_item;

DEFINE FIELD IF NOT EXISTS elasdrift_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS elasdrift_drift_threshold ON settings TYPE option<float> DEFAULT 15.0;
  -- % change in elasticity to flag as significant (default 15%)
DEFINE FIELD IF NOT EXISTS elasdrift_stale_months  ON settings TYPE option<int> DEFAULT 6;
  -- months without re-measurement to flag stale (default 6)
DEFINE FIELD IF NOT EXISTS elasdrift_volatility_threshold ON settings TYPE option<float> DEFAULT 30.0;
  -- % volatility in elasticity to flag (default 30%)
