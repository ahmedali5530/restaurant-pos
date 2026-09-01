-- Migration: 2026_08_29_loyalty_roi.surql
--
-- AI Loyalty ROI Predictor — 42nd POSR-exclusive differentiator.
--
-- Research finding: Loyalty programs lift revenue 20-30% per enrolled customer
-- (per Bain & Co, Cornell hospitality research), but restaurants struggle to:
--   1. Identify WHICH non-member customers to recruit (highest propensity)
--   2. Quantify the ROI of sign-up incentives (5% / 10% / 15% off first order)
--   3. Project 30/60/90-day revenue uplift from enrollment
--   4. Spot tier upgrade opportunities that retain members longer
--
-- Toast Loyalty ($185/mo) accrues points but DOESN'T predict ROI or
-- identify prospects. Square Loyalty is manual accrual only. Lightspeed
-- Loyalty has no predictive model.
--
-- Distinct from:
--   - loyalty.service.ts (operational: accrue/redeem/tiers — does NOT predict)
--   - clv.service.ts (per-customer lifetime value — doesn't model LOYALTY uplift)
--   - churn.service.ts (churn risk — doesn't model loyalty conversion)
--   - winback.service.ts (lost customer recovery — not loyalty-specific)
--   - segmentation.service.ts (RFM segments — not loyalty-projection)
--
-- This service predicts LOYALTY PROGRAM ROI + identifies high-propensity
-- prospects + recommends optimal sign-up incentives.

DEFINE TABLE IF NOT EXISTS loyalty_roi_prediction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id                ON loyalty_roi_prediction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id          ON loyalty_roi_prediction TYPE string;
  -- 'high_propensity_prospect' | 'tier_upgrade_opportunity' | 'incentive_roi' | 'churned_prospect'
DEFINE FIELD IF NOT EXISTS severity         ON loyalty_roi_prediction TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id       ON loyalty_roi_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name    ON loyalty_roi_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS prospect_score   ON loyalty_roi_prediction TYPE float DEFAULT 0;
  -- 0-100 (higher = more likely to convert)
DEFINE FIELD IF NOT EXISTS projected_ltv    ON loyalty_roi_prediction TYPE float DEFAULT 0;
  -- predicted LTV if enrolled
DEFINE FIELD IF NOT EXISTS ltv_uplift_pct    ON loyalty_roi_prediction TYPE float DEFAULT 0;
  -- projected % revenue lift if enrolled (typically 20-30%)
DEFINE FIELD IF NOT EXISTS suggested_incentive_pct ON loyalty_roi_prediction TYPE option<float>;
  -- recommended sign-up discount %
DEFINE FIELD IF NOT EXISTS est_conversion_pct ON loyalty_roi_prediction TYPE option<float>;
  -- predicted conversion rate at suggested incentive
DEFINE FIELD IF NOT EXISTS est_revenue_gain  ON loyalty_roi_prediction TYPE float DEFAULT 0;
  -- projected 90-day revenue gain
DEFINE FIELD IF NOT EXISTS description      ON loyalty_roi_prediction TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight       ON loyalty_roi_prediction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON loyalty_roi_prediction TYPE option<string>;
  -- 'enroll_now' | 'offer_incentive' | 'upgrade_tier' | 'monitor' | 'personal_outreach'
DEFINE FIELD IF NOT EXISTS status           ON loyalty_roi_prediction TYPE string DEFAULT 'open';
  -- 'open' | 'enrolled' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at      ON loyalty_roi_prediction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON loyalty_roi_prediction TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_lrp_rule_id   ON loyalty_roi_prediction FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_lrp_severity  ON loyalty_roi_prediction FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_lrp_status    ON loyalty_roi_prediction FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_lrp_customer  ON loyalty_roi_prediction FIELDS customer_id;

-- Settings
DEFINE FIELD IF NOT EXISTS loyalty_roi_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS loyalty_roi_lookback_days   ON settings TYPE option<int>   DEFAULT 90;
DEFINE FIELD IF NOT EXISTS loyalty_roi_min_prospect_score ON settings TYPE option<float> DEFAULT 50;
  -- minimum score 0-100 to flag as prospect
DEFINE FIELD IF NOT EXISTS loyalty_roi_baseline_uplift_pct ON settings TYPE option<float> DEFAULT 0.25;
  -- default LTV uplift assumption (25%, from Cornell research)
