-- Migration: 2026_08_30_supplier_negotiation.surql
--
-- AI Supplier Negotiation Coach — 74th POSR-exclusive differentiator.
--
-- Research finding: Restaurants overpay 8-15% on supplies due to lack of
-- negotiation strategy (Restaurant Supply Chain research). 70% never renegotiate
-- contracts after initial pricing (Food Service Director survey). Bulk buying
-- cooperatives save 12-20% but most independents don't participate.
--
-- Toast, Square, Lightspeed have NO supplier negotiation features.
-- POSR's procurement.service predicts PRICE MOVEMENTS — doesn't negotiate.
-- vendor-performance.service scores vendor QUALITY — doesn't negotiate prices.
-- Neither analyzes purchase volume leverage, identifies negotiation opportunities,
-- or generates specific negotiation scripts with target prices.
--
-- Distinct from:
--   - procurement.service (predicts price trends — NOT negotiation strategy)
--   - vendor-performance.service (scores vendor quality — NOT price negotiation)
--   - food-cost-trend.service (tracks cost changes — NOT negotiation)
--   - inventory-transfer.service (transfers between branches — NOT supplier deals)
--   - reorder.service (suggests reorder timing — NOT negotiation)
--
-- This service analyzes supplier purchase data, identifies negotiation leverage
-- points (volume, loyalty, competitor pricing, payment terms), and generates
-- specific negotiation strategies with estimated savings.

DEFINE TABLE IF NOT EXISTS supplier_negotiation TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON supplier_negotiation TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON supplier_negotiation TYPE string;
  -- 'volume_discount' | 'price_match' | 'payment_terms' | 'loyalty_bonus' | 'consolidation'
DEFINE FIELD IF NOT EXISTS severity       ON supplier_negotiation TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS supplier_id    ON supplier_negotiation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS supplier_name  ON supplier_negotiation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS total_spend_90d ON supplier_negotiation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS item_count     ON supplier_negotiation TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_price      ON supplier_negotiation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS market_price   ON supplier_negotiation TYPE option<float>;
DEFINE FIELD IF NOT EXISTS price_gap_pct  ON supplier_negotiation TYPE float DEFAULT 0;
  -- % difference between current and market price
DEFINE FIELD IF NOT EXISTS negotiation_leverage ON supplier_negotiation TYPE option<string>;
  -- explanation of leverage point
DEFINE FIELD IF NOT EXISTS target_price   ON supplier_negotiation TYPE option<float>;
  -- target negotiated price
DEFINE FIELD IF NOT EXISTS negotiation_script ON supplier_negotiation TYPE option<string>;
  -- suggested conversation script
DEFINE FIELD IF NOT EXISTS est_savings_monthly ON supplier_negotiation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_savings_annual ON supplier_negotiation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS confidence     ON supplier_negotiation TYPE float DEFAULT 0;
  -- 0-1, confidence in achieving target
DEFINE FIELD IF NOT EXISTS description     ON supplier_negotiation TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON supplier_negotiation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON supplier_negotiation TYPE option<string>;
  -- 'negotiate_now' | 'schedule_meeting' | 'get_competitor_quote' | 'monitor' | 'switch_supplier'
DEFINE FIELD IF NOT EXISTS status          ON supplier_negotiation TYPE string DEFAULT 'open';
  -- 'open' | 'negotiating' | 'secured' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON supplier_negotiation TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON supplier_negotiation TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_sn_rule_id   ON supplier_negotiation FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_sn_severity  ON supplier_negotiation FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_sn_status    ON supplier_negotiation FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_sn_supplier  ON supplier_negotiation FIELDS supplier_id;

-- Settings
DEFINE FIELD IF NOT EXISTS negotiation_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS negotiation_min_spend        ON settings TYPE option<float> DEFAULT 500;
  -- min 90-day spend to trigger negotiation analysis
DEFINE FIELD IF NOT EXISTS negotiation_target_discount  ON settings TYPE option<float> DEFAULT 0.08;
  -- target 8% discount from current price
DEFINE FIELD IF NOT EXISTS negotiation_lookback_days    ON settings TYPE option<int>   DEFAULT 90;
