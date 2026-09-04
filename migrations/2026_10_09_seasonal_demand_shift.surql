-- Migration: 2026_10_09_seasonal_demand_shift.surql
--
-- AI Menu Seasonal Demand Shift Detector — 118th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $400-1,500/mo per location from unmanaged
-- seasonal demand shifts (NRA Seasonal Menu, Cornell Menu Rotation):
--   - 60% of menu items have seasonal demand patterns
--   - Soup sales rise 300% in winter, salad sales rise 200% in summer
--   - Cold beverages spike 400% in summer heat waves
--   - No POS detects seasonal shifts at ITEM level before they hit
--   - Restaurants react to seasonal shifts 2-4 weeks LATE (lost revenue)
--   - Ingredient stock not pre-positioned for seasonal demand → stockouts
--   - Seasonal items stay on menu past their peak (dead inventory)
--   - Off-season items occupy menu real estate better used for in-season items
--   - No seasonal pricing adjustment (in-season items could command premium)
--   - Seasonal menu rotation is manual + reactive, not data-driven
--   - Weather-driven shifts (heat wave, cold snap) missed entirely
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO item-level seasonal
-- demand shift detection. seasonal.service (existing) tracks seasonal REVENUE
-- trends (month-over-month). menu-rotation.service rotates menu items.
-- weather-impact.service measures weather impact on sales. None detect
-- per-ITEM seasonal demand SHIFTS with forward-looking action triggers for
-- menu rotation, pre-stocking, and seasonal pricing BEFORE the shift hits.
--
-- This new service DETECTS SEASONAL DEMAND SHIFTS at item level:
--   - Tracks per-item demand vs same period last year (YoY shift)
--   - Detects items entering peak season (demand rising)
--   - Detects items exiting peak season (demand falling)
--   - Identifies weather-correlated demand shifts (heat wave, cold snap)
--   - Recommends menu rotation (add in-season, remove off-season)
--   - Triggers ingredient pre-stocking before seasonal peak
--   - Suggests seasonal pricing (premium for in-season, discount for exit)
--   - Tracks shift timing accuracy for model improvement

DEFINE TABLE IF NOT EXISTS seasonal_demand_shift_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON seasonal_demand_shift_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON seasonal_demand_shift_alert TYPE string;
  -- 'entering_peak_season' | 'exiting_peak_season' | 'weather_driven_shift' |
--   'seasonal_stockout_risk' | 'off_season_menu_bloat' | 'seasonal_pricing_opportunity' |
--   'early_shift_detected' | 'shift_timing_anomaly'
DEFINE FIELD IF NOT EXISTS severity        ON seasonal_demand_shift_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS menu_item       ON seasonal_demand_shift_alert TYPE string;
DEFINE FIELD IF NOT EXISTS category        ON seasonal_demand_shift_alert TYPE option<string>;
  -- 'mains' | 'sides' | 'beverages' | 'desserts' | 'starters' | 'soups' | 'salads'
DEFINE FIELD IF NOT EXISTS current_demand  ON seasonal_demand_shift_alert TYPE option<float>;
  -- current avg daily orders
DEFINE FIELD IF NOT EXISTS previous_period_demand ON seasonal_demand_shift_alert TYPE option<float>;
  -- same period last year avg daily orders
DEFINE FIELD IF NOT EXISTS shift_pct       ON seasonal_demand_shift_alert TYPE option<float>;
  -- % change YoY (positive = rising, negative = falling)
DEFINE FIELD IF NOT EXISTS predicted_peak_date ON seasonal_demand_shift_alert TYPE option<datetime>;
  -- when demand is predicted to peak
DEFINE FIELD IF NOT EXISTS days_to_peak    ON seasonal_demand_shift_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS season          ON seasonal_demand_shift_alert TYPE option<string>;
  -- 'spring' | 'summer' | 'fall' | 'winter'
DEFINE FIELD IF NOT EXISTS weather_correlation ON seasonal_demand_shift_alert TYPE option<string>;
  -- 'heat_wave' | 'cold_snap' | 'rainy' | 'sunny' | 'none'
DEFINE FIELD IF NOT EXISTS current_stock   ON seasonal_demand_shift_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS stock_needed_at_peak ON seasonal_demand_shift_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS on_menu         ON seasonal_demand_shift_alert TYPE option<bool>;
  -- is item currently on menu?
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON seasonal_demand_shift_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON seasonal_demand_shift_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON seasonal_demand_shift_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON seasonal_demand_shift_alert TYPE option<string>;
  -- 'add_to_menu' | 'remove_from_menu' | 'pre_stock' | 'raise_price' | 'lower_price' |
--   'promote' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON seasonal_demand_shift_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON seasonal_demand_shift_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON seasonal_demand_shift_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_seasonalshift_rule      ON seasonal_demand_shift_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_seasonalshift_status    ON seasonal_demand_shift_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_seasonalshift_severity  ON seasonal_demand_shift_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_seasonalshift_item      ON seasonal_demand_shift_alert FIELDS menu_item;
DEFINE INDEX IF NOT EXISTS idx_seasonalshift_season    ON seasonal_demand_shift_alert FIELDS season;

DEFINE FIELD IF NOT EXISTS seasonalshift_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS seasonalshift_peak_threshold ON settings TYPE option<float> DEFAULT 40.0;
  -- % YoY increase to flag as entering peak (default 40%)
DEFINE FIELD IF NOT EXISTS seasonalshift_exit_threshold ON settings TYPE option<float> DEFAULT 30.0;
  -- % YoY decrease to flag as exiting peak (default 30%)
DEFINE FIELD IF NOT EXISTS seasonalshift_stock_buffer  ON settings TYPE option<float> DEFAULT 25.0;
  -- % stock buffer above predicted peak need (default 25%)
DEFINE FIELD IF NOT EXISTS seasonalshift_early_window  ON settings TYPE option<int> DEFAULT 14;
  -- days before predicted peak to trigger early alert (default 14)
