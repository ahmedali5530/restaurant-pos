-- Migration: 2026_08_28_promo_analytics.surql
--
-- AI Promo Effectiveness Analytics — measure promotion ROI + impact.
--
-- Research finding: Toast Promo Analytics + Square Campaign Reporting
-- bundle promo performance measurement in higher tiers (~$40/mo). POSR
-- offers it free — analyzes each promotion/coupon's redemption rate,
-- revenue impact, ROI, customer acquisition, + AI recommendations.
--
-- Why it matters:
--   - Without measurement, promotions are a guess — operators don't know
--     which discounts actually drive incremental revenue vs just cannibalize
--   - Identifies top-performing promos (double down on what works)
--   - Shows underperformers (remove or rework — wasted margin)
--   - Quantifies ROI (revenue generated vs discount cost)
--   - Tracks new vs returning customer acquisition per promo
--
-- Metrics per promotion:
--   - Redemption rate: used_count / (used_count + expired_unused) × 100
--   - Total discount given: sum of discount amounts
--   - Revenue generated: sum of order totals with this promo
--   - ROI: (revenue × margin% - discount) / discount × 100
--   - New customers: % of redeemers who were first-time
--   - Avg order lift: avg order value with promo vs without
--   - Repeat rate: % redeemers who returned within 30 days
--
-- Tables:
--   1. promo_effectiveness — cached per-promo metrics (24h TTL)

-- ---------------------------------------------------------------------------
-- promo_effectiveness — cached per-promo metrics
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS promo_effectiveness TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON promo_effectiveness TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS promo_id         ON promo_effectiveness TYPE string;
  -- Links to coupon.id or discount.id
DEFINE FIELD IF NOT EXISTS promo_name      ON promo_effectiveness TYPE string;
DEFINE FIELD IF NOT EXISTS promo_code      ON promo_effectiveness TYPE option<string>;
  -- Coupon code if applicable
DEFINE FIELD IF NOT EXISTS promo_type      ON promo_effectiveness TYPE string;
  -- 'coupon' | 'discount' | 'dynamic_pricing'
DEFINE FIELD IF NOT EXISTS discount_type    ON promo_effectiveness TYPE option<string>;
  -- 'percent' | 'fixed_amount' | 'fixed_price'
DEFINE FIELD IF NOT EXISTS discount_value   ON promo_effectiveness TYPE option<float>;
  -- % or $ amount
DEFINE FIELD IF NOT EXISTS period_start    ON promo_effectiveness TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON promo_effectiveness TYPE datetime;
DEFINE FIELD IF NOT EXISTS times_redeemed  ON promo_effectiveness TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS unique_customers ON promo_effectiveness TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS new_customers   ON promo_effectiveness TYPE int DEFAULT 0;
  -- First-time buyers who used this promo
DEFINE FIELD IF NOT EXISTS total_discount_given ON promo_effectiveness TYPE float DEFAULT 0;
  -- Sum of discount amounts applied
DEFINE FIELD IF NOT EXISTS revenue_generated ON promo_effectiveness TYPE float DEFAULT 0;
  -- Sum of order totals with this promo
DEFINE FIELD IF NOT EXISTS avg_order_value  ON promo_effectiveness TYPE float DEFAULT 0;
  -- Avg order value when promo was used
DEFINE FIELD IF NOT EXISTS baseline_avg_order ON promo_effectiveness TYPE float DEFAULT 0;
  -- Avg order value without promo (for comparison)
DEFINE FIELD IF NOT EXISTS order_lift_pct  ON promo_effectiveness TYPE float DEFAULT 0;
  -- (avg_order - baseline) / baseline × 100
DEFINE FIELD IF NOT EXISTS roi             ON promo_effectiveness TYPE float DEFAULT 0;
  -- Return on investment: (revenue × 0.3 - discount) / discount × 100
  -- (uses 30% assumed margin for ROI calc)
DEFINE FIELD IF NOT EXISTS new_customer_pct ON promo_effectiveness TYPE float DEFAULT 0;
  -- new_customers / unique_customers × 100
DEFINE FIELD IF NOT EXISTS repeat_rate     ON promo_effectiveness TYPE float DEFAULT 0;
  -- % redeemers who returned within 30 days
DEFINE FIELD IF NOT EXISTS grade           ON promo_effectiveness TYPE string DEFAULT 'C';
  -- A (ROI > 200%) / B (100-200%) / C (0-100%) / D (negative but > -50%) / F (< -50%)
DEFINE FIELD IF NOT EXISTS ai_insight      ON promo_effectiveness TYPE option<string>;
  -- AI analysis (max 300 chars)
DEFINE FIELD IF NOT EXISTS ai_action       ON promo_effectiveness TYPE option<string>;
  -- 'scale' | 'keep' | 'rework' | 'kill'
DEFINE FIELD IF NOT EXISTS is_overall      ON promo_effectiveness TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS generated_at    ON promo_effectiveness TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON promo_effectiveness TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_pe_promo_id   ON promo_effectiveness FIELDS promo_id;
DEFINE INDEX IF NOT EXISTS idx_pe_grade      ON promo_effectiveness FIELDS grade;
DEFINE INDEX IF NOT EXISTS idx_pe_is_overall ON promo_effectiveness FIELDS is_overall;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS promo_analytics_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS promo_lookback_days  ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS promo_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS promo_min_redemptions ON settings TYPE option<int> DEFAULT 3;
  -- Min redemptions to evaluate a promo (default: 3+ for significance)
DEFINE FIELD IF NOT EXISTS promo_assumed_margin_pct ON settings TYPE option<float> DEFAULT 30;
  -- Assumed profit margin for ROI calculation (default: 30%)
