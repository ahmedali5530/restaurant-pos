-- Migration: 2026_09_02_payment_fee_optimizer.surql
--
-- AI Payment Fee Optimizer — 62nd POSR-exclusive differentiator.
--
-- Research finding: Restaurants pay $500-2,000/mo per location in credit card
-- processing fees (2-4% per transaction, NRF/Restaurant Finance Report):
--   - Credit card fees: 2.5-3.5% + $0.10-0.30 per transaction
--   - Debit card fees: 0.5-1.0% (10x cheaper than credit, but often run as credit)
--   - Rewards/premium cards: +0.5-1.5% surcharge (downgrade fee)
--   - Corporate/international cards: +1.0-2.0% surcharge
--   - Manual entry (card-not-present): +0.5-1.0% surcharge
--   - Small ticket ($5-10): fixed $0.30 fee = 3-6% effective rate
--   - Batch settlement timing: same-day vs next-day = 0.05% difference
--   - ACH bank transfer: $0.25-0.50 flat (vs 3% for credit on large orders)
--
-- Classic POS systems (Toast, Square, Lightspeed) process payments but DON'T
-- OPTIMIZE fees. They route to whatever processor is configured. Toast Capital
-- offers cash advances but doesn't reduce processing fees. Square has flat
-- 2.6% + $0.10 — no optimization. Lightspeed Payments same flat rate.
--
-- POSR's existing services cover DIFFERENT payment aspects:
--   - payment.service = INTENT creation (talks to payment server) — NOT fee
--     optimization
--   - chargeback-risk.service = chargeback PROBABILITY scoring — NOT fee routing
--   - online-fraud-detector.service = FRAUD detection — NOT fee optimization
--   - tip-analytics.service = TIP distribution fairness — NOT payment fees
--   - cash-drawer-anomaly.service = CASH drawer theft detection — NOT fees
--
-- This new service optimizes PAYMENT PROCESSING FEES:
--   - Routes each transaction to cheapest processor (debit vs credit vs ACH)
--   - Detects downgrade transactions (rewards/corporate/international cards)
--   - Recommends cash discount / surcharge programs
--   - Recommends ACH for large B2B/catering orders
--   - Optimizes batch settlement timing
--   - Detects duplicate payment attempts (save refund fees)
--   - Recommends small-ticket cash processing (avoid $0.30 fixed fee)
--   - Identifies high-fee card types for customer nudging

DEFINE TABLE IF NOT EXISTS payment_fee_recommendation TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON payment_fee_recommendation TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON payment_fee_recommendation TYPE string;
  -- 'processor_routing' | 'downgrade_detection' | 'cash_discount_opportunity' |
  -- 'ach_recommendation' | 'surcharge_optimization' | 'batch_timing' |
  -- 'duplicate_detection' | 'small_ticket_cash'
DEFINE FIELD IF NOT EXISTS severity        ON payment_fee_recommendation TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS order_id        ON payment_fee_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_id     ON payment_fee_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name   ON payment_fee_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS transaction_amount ON payment_fee_recommendation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS current_processor ON payment_fee_recommendation TYPE string;
  -- 'stripe_credit' | 'stripe_debit' | 'paypal' | 'square' | 'cash' | 'ach' | 'manual'
DEFINE FIELD IF NOT EXISTS suggested_processor ON payment_fee_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS current_fee_rate ON payment_fee_recommendation TYPE float DEFAULT 0;
  -- % rate (e.g., 2.9 = 2.9%)
DEFINE FIELD IF NOT EXISTS suggested_fee_rate ON payment_fee_recommendation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS current_fee_amount ON payment_fee_recommendation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS suggested_fee_amount ON payment_fee_recommendation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS card_type       ON payment_fee_recommendation TYPE option<string>;
  -- 'visa_credit' | 'visa_debit' | 'mc_credit' | 'mc_debit' | 'amex' | 'discover' |
  -- 'visa_rewards' | 'mc_world' | 'corporate' | 'international' | 'unknown'
DEFINE FIELD IF NOT EXISTS transaction_count_30d ON payment_fee_recommendation TYPE option<int>;
  -- frequency of similar transactions for monthly savings calc
DEFINE FIELD IF NOT EXISTS est_savings_monthly ON payment_fee_recommendation TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_loss_monthly ON payment_fee_recommendation TYPE float DEFAULT 0;
  -- monthly cost of NOT adopting
DEFINE FIELD IF NOT EXISTS description     ON payment_fee_recommendation TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON payment_fee_recommendation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON payment_fee_recommendation TYPE option<string>;
  -- 'route_now' | 'enable_cash_discount' | 'switch_to_ach' | 'add_surcharge' |
  -- 'adjust_batch_time' | 'refund_duplicate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON payment_fee_recommendation TYPE string DEFAULT 'open';
  -- 'open' | 'adopted' | 'piloting' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON payment_fee_recommendation TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON payment_fee_recommendation TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_payfee_rule      ON payment_fee_recommendation FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_payfee_status    ON payment_fee_recommendation FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_payfee_severity  ON payment_fee_recommendation FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_payfee_processor ON payment_fee_recommendation FIELDS current_processor;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS payfee_ai_enabled         ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS payfee_small_ticket_threshold ON settings TYPE option<float> DEFAULT 10.0;
  -- transactions below this $ amount: cash is cheaper than card (avoids $0.30 fixed)
DEFINE FIELD IF NOT EXISTS payfee_ach_threshold      ON settings TYPE option<float> DEFAULT 500.0;
  -- transactions above this $ amount: ACH is cheaper than credit
DEFINE FIELD IF NOT EXISTS payfee_surcharge_pct      ON settings TYPE option<float> DEFAULT 3.0;
  -- surcharge % to add for credit card transactions (where legal)
DEFINE FIELD IF NOT EXISTS payfee_batch_cutoff_hour  ON settings TYPE option<int> DEFAULT 22;
  -- batch settlement cutoff hour (22 = 10 PM)
