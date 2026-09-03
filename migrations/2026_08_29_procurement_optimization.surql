-- Migration: 2026_08_29_procurement_optimization.surql
--
-- AI Procurement Optimization Engine — 43rd POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose 8-12% of food cost to poor procurement
-- timing — buying ingredients at peak prices instead of anticipating price
-- drops, missing bulk discount opportunities, and not switching vendors when
-- better prices exist (per National Restaurant Association supply research).
--
-- Toast Inventory tracks stock levels but DOESN'T predict price movements.
-- Square Inventory has no procurement optimization. Lightspeed Inventory
-- has min/max reorder only — no predictive buying. MarketMan ($99/mo) tracks
-- vendor prices but doesn't forecast.
--
-- Distinct from:
--   - vendor-performance.service (tracks vendor quality/delivery, NOT price)
--   - reorder.service (uses min/max thresholds, NOT predictive timing)
--   - food-cost-trend.service (analyzes PAST trends, doesn't predict future)
--   - yield-variance.service (production yield, NOT procurement timing)
--   - recipe-optimization.service (recipe ingredients, NOT when to buy)
--
-- This service predicts INGREDIENT PRICE MOVEMENTS and recommends WHEN to
-- buy, SWITCH vendors, or TAKE bulk discounts — pre-emptive procurement.

DEFINE TABLE IF NOT EXISTS procurement_recommendation TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON procurement_recommendation TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON procurement_recommendation TYPE string;
  -- 'buy_now' | 'wait_for_drop' | 'switch_vendor' | 'bulk_discount' | 'normal'
DEFINE FIELD IF NOT EXISTS severity       ON procurement_recommendation TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS item_id        ON procurement_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_name      ON procurement_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_vendor ON procurement_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_price  ON procurement_recommendation TYPE float DEFAULT 0;
  -- last paid unit cost
DEFINE FIELD IF NOT EXISTS avg_price_30d  ON procurement_recommendation TYPE float DEFAULT 0;
  -- 30-day rolling average
DEFINE FIELD IF NOT EXISTS predicted_price_14d ON procurement_recommendation TYPE float DEFAULT 0;
  -- forecast next 14 days
DEFINE FIELD IF NOT EXISTS price_trend_pct ON procurement_recommendation TYPE float DEFAULT 0;
  -- predicted % change (positive = rising, negative = falling)
DEFINE FIELD IF NOT EXISTS confidence_score ON procurement_recommendation TYPE float DEFAULT 0;
  -- 0-100 (model confidence in prediction)
DEFINE FIELD IF NOT EXISTS alt_vendor      ON procurement_recommendation TYPE option<string>;
  -- alternative supplier name (for switch_vendor rule)
DEFINE FIELD IF NOT EXISTS alt_vendor_price ON procurement_recommendation TYPE option<float>;
  -- alternative vendor's last unit price
DEFINE FIELD IF NOT EXISTS suggested_qty   ON procurement_recommendation TYPE option<float>;
  -- suggested purchase quantity
DEFINE FIELD IF NOT EXISTS est_savings     ON procurement_recommendation TYPE float DEFAULT 0;
  -- projected $ savings if recommendation followed
DEFINE FIELD IF NOT EXISTS description     ON procurement_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON procurement_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON procurement_recommendation TYPE option<string>;
  -- 'place_order' | 'wait_7d' | 'wait_14d' | 'renegotiate' | 'monitor' | 'switch_now'
DEFINE FIELD IF NOT EXISTS status          ON procurement_recommendation TYPE string DEFAULT 'open';
  -- 'open' | 'ordered' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON procurement_recommendation TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON procurement_recommendation TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_pr_rule_id    ON procurement_recommendation FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_pr_severity  ON procurement_recommendation FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_pr_status    ON procurement_recommendation FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_pr_item      ON procurement_recommendation FIELDS item_id;

-- Settings
DEFINE FIELD IF NOT EXISTS procurement_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS procurement_lookback_days   ON settings TYPE option<int>   DEFAULT 90;
  -- historical window for trend analysis
DEFINE FIELD IF NOT EXISTS procurement_rising_threshold ON settings TYPE option<float> DEFAULT 0.05;
  -- price trend > +5% → BUY_NOW
DEFINE FIELD IF NOT EXISTS procurement_falling_threshold ON settings TYPE option<float> DEFAULT -0.05;
  -- price trend < -5% → WAIT
DEFINE FIELD IF NOT EXISTS procurement_vendor_switch_threshold ON settings TYPE option<float> DEFAULT 0.10;
  -- alternative vendor ≥10% cheaper → SWITCH
