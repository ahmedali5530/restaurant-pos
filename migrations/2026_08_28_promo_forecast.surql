-- Migration: 2026_08_28_promo_forecast.surql
--
-- AI Promo Campaign Effectiveness Predictor — 18th POSR-exclusive differentiator.
--
-- Research finding: Restaurants launch promos blind — 60% of campaigns
-- underperform expectations (no ROI prediction, no cannibalization analysis).
-- Toast and Square have basic coupon CRUD but NO predictive ROI modeling.
-- POSR forecasts campaign ROI + cannibalization risk + AI recommendation
-- BEFORE launch — managers see expected revenue impact before spending.
--
-- Distinct from promo-analytics.service (which MEASURES effectiveness AFTER
-- launch). This service FORECASTS effectiveness BEFORE launch.
--
-- Algorithm:
--   1. Historical similar campaigns: same discount_type, similar value
--   2. Redemption rate forecast: based on discount depth + audience size + duration
--   3. Revenue impact:
--      - Gross discount cost = est_redemptions × avg_discount_amount
--      - Incremental revenue = est_new_orders × avg_check (new customers attracted)
--      - Cannibalization = est_redemptions_from_existing × (full_price - discounted)
--   4. Net ROI = (incremental_revenue - cannibalization_cost - discount_cost) / discount_cost
--   5. Confidence: based on historical similar campaign count + variance
--   6. AI recommendation: launch | optimize | reject | a/b_test

DEFINE TABLE IF NOT EXISTS promo_forecast TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON promo_forecast TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS coupon         ON promo_forecast TYPE option<record<coupon>>;
DEFINE FIELD IF NOT EXISTS coupon_code    ON promo_forecast TYPE option<string>;
DEFINE FIELD IF NOT EXISTS description    ON promo_forecast TYPE string;
  -- human-readable summary of campaign being forecasted
DEFINE FIELD IF NOT EXISTS discount_type   ON promo_forecast TYPE string;
  -- 'percentage' | 'fixed' | 'bogo' | 'free_item'
DEFINE FIELD IF NOT EXISTS discount_value  ON promo_forecast TYPE float;
  -- 0.15 = 15% off, $5 = fixed, etc.
DEFINE FIELD IF NOT EXISTS min_order_amount ON promo_forecast TYPE option<float>;
DEFINE FIELD IF NOT EXISTS campaign_duration_days ON promo_forecast TYPE int;
DEFINE FIELD IF NOT EXISTS est_audience_size ON promo_forecast TYPE int;
  -- # customers in target segment
DEFINE FIELD IF NOT EXISTS est_redemption_rate ON promo_forecast TYPE float;
  -- 0-1, % of audience expected to redeem
DEFINE FIELD IF NOT EXISTS est_redemptions ON promo_forecast TYPE int;
  -- absolute count
DEFINE FIELD IF NOT EXISTS est_avg_discount_amount ON promo_forecast TYPE float;
  -- $ avg discount per redemption
DEFINE FIELD IF NOT EXISTS est_discount_cost ON promo_forecast TYPE float;
  -- total $ given away in discounts
DEFINE FIELD IF NOT EXISTS est_incremental_revenue ON promo_forecast TYPE float;
  -- $ revenue from new orders attracted by promo
DEFINE FIELD IF NOT EXISTS est_cannibalization_cost ON promo_forecast TYPE float;
  -- $ revenue lost from existing customers who'd have paid full price
DEFINE FIELD IF NOT EXISTS est_net_revenue_impact ON promo_forecast TYPE float;
  -- incremental - cannibalization - discount_cost
DEFINE FIELD IF NOT EXISTS est_roi         ON promo_forecast TYPE float;
  -- net_revenue_impact / discount_cost (1.0 = break-even, 2.0 = 2× return)
DEFINE FIELD IF NOT EXISTS confidence      ON promo_forecast TYPE float;
  -- 0-1
DEFINE FIELD IF NOT EXISTS ai_recommendation ON promo_forecast TYPE option<string>;
  -- 'launch' | 'optimize' | 'reject' | 'a_b_test'
DEFINE FIELD IF NOT EXISTS ai_insight      ON promo_forecast TYPE option<string>;
  -- max 200 chars — why this recommendation
DEFINE FIELD IF NOT EXISTS historical_similar_count ON promo_forecast TYPE int DEFAULT 0;
  -- # similar past campaigns used for forecast
DEFINE FIELD IF NOT EXISTS actual_redemptions ON promo_forecast TYPE option<int>;
  -- filled after campaign ends (for accuracy tracking)
DEFINE FIELD IF NOT EXISTS actual_net_revenue ON promo_forecast TYPE option<float>;
  -- filled after campaign ends
DEFINE FIELD IF NOT EXISTS forecasted_at    ON promo_forecast TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS campaign_end_at  ON promo_forecast TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS branch_id        ON promo_forecast TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_pf_coupon    ON promo_forecast FIELDS coupon;
DEFINE INDEX IF NOT EXISTS idx_pf_recommendation ON promo_forecast FIELDS ai_recommendation;
DEFINE INDEX IF NOT EXISTS idx_pf_forecasted ON promo_forecast FIELDS forecasted_at;
DEFINE INDEX IF NOT EXISTS idx_pf_branch    ON promo_forecast FIELDS branch_id;

-- Settings
DEFINE FIELD IF NOT EXISTS promoforecast_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS promoforecast_lookback_days     ON settings TYPE option<int>   DEFAULT 365;
  -- 1 year of historical campaigns
DEFINE FIELD IF NOT EXISTS promoforecast_min_similar       ON settings TYPE option<int>   DEFAULT 3;
  -- need 3+ similar campaigns for confident forecast
DEFINE FIELD IF NOT EXISTS promoforecast_default_audience   ON settings TYPE option<int>   DEFAULT 100;
  -- default audience size if segment unknown
DEFINE FIELD IF NOT EXISTS promoforecast_good_roi_threshold ON settings TYPE option<float> DEFAULT 1.5;
  -- ROI >= 1.5 → 'launch' recommendation
DEFINE FIELD IF NOT EXISTS promoforecast_reject_roi_threshold ON settings TYPE option<float> DEFAULT 0.8;
  -- ROI < 0.8 → 'reject' recommendation
