-- Migration: 2026_08_28_abandoned_cart.surql
--
-- AI Abandoned Cart Recovery — 26th POSR-exclusive differentiator.
--
-- Research finding: $50B/year lost to abandoned orders in food service
-- (orders started but never completed). Toast and Square have NO abandoned
-- cart detection — they only show active orders. POSR detects stale open
-- orders, predicts which are recoverable, and recommends recovery actions.
--
-- Distinct from:
--   - churn.service (predicts customer departure, not abandoned orders)
--   - winback.service (targets customers who left, not in-progress carts)
--   - satisfaction-prediction (predicts satisfaction per completed order)
--   - kitchen-bottleneck (detects kitchen delays, not cart abandonment)
--
-- This service detects ABANDONED CARTS (open orders that went stale) and
-- predicts recovery probability + AI action recommendation.
--
-- Detection rules:
--   1. STALE_OPEN_ORDER — order in 'Open' status > 30 min with no activity
--   2. PARTIAL_ORDER — order has items but no payment attempt
--   3. SUSPENDED_ITEMS — order has suspended (voided) items but still open
--   4. DRAFT_ABANDONED — draft order > 2h old, never submitted
--
-- Recovery factors:
--   1. ORDER_VALUE — higher value = worth recovering
--   2. CUSTOMER_HISTORY — repeat customers more likely to return
--   3. TIME_STALE — less stale = higher recovery probability
--   4. ITEM_COUNT — more items = more invested = more likely to return
--   5. PEAK_HOUR — abandoned during peak = customer found alternative
--
-- AI recommendation: call_customer | send_reminder | hold_order |
--   cancel_and_apologize | offer_discount | no_action

DEFINE TABLE IF NOT EXISTS abandoned_cart_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON abandoned_cart_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS order_id        ON abandoned_cart_alert TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS order_number   ON abandoned_cart_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer        ON abandoned_cart_alert TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON abandoned_cart_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_phone  ON abandoned_cart_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS server_name     ON abandoned_cart_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS order_total     ON abandoned_cart_alert TYPE float;
DEFINE FIELD IF NOT EXISTS item_count      ON abandoned_cart_alert TYPE int;
DEFINE FIELD IF NOT EXISTS created_at      ON abandoned_cart_alert TYPE datetime;
  -- when order was created
DEFINE FIELD IF NOT EXISTS minutes_stale    ON abandoned_cart_alert TYPE int;
  -- minutes since last activity
DEFINE FIELD IF NOT EXISTS trigger_reason  ON abandoned_cart_alert TYPE string;
  -- 'stale_open' | 'partial_order' | 'suspended_items' | 'draft_abandoned'
DEFINE FIELD IF NOT EXISTS recovery_score   ON abandoned_cart_alert TYPE float;
  -- 0-100 (100 = highly recoverable)
DEFINE FIELD IF NOT EXISTS recovery_level   ON abandoned_cart_alert TYPE string;
  -- 'low' | 'medium' | 'high'
DEFINE FIELD IF NOT EXISTS recovery_factors  ON abandoned_cart_alert TYPE option<object>;
  -- { factor_id: { weight, detail } }
DEFINE FIELD IF NOT EXISTS est_recovered_revenue ON abandoned_cart_alert TYPE float DEFAULT 0;
  -- $ recovered if cart completed
DEFINE FIELD IF NOT EXISTS ai_insight      ON abandoned_cart_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON abandoned_cart_alert TYPE option<string>;
  -- 'call_customer' | 'send_reminder' | 'hold_order' | 'cancel_and_apologize' |
  -- 'offer_discount' | 'no_action'
DEFINE FIELD IF NOT EXISTS action_taken    ON abandoned_cart_alert TYPE string DEFAULT 'none';
  -- 'none' | 'called' | 'reminded' | 'held' | 'cancelled' | 'discounted' | 'recovered'
DEFINE FIELD IF NOT EXISTS detected_at     ON abandoned_cart_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON abandoned_cart_alert TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_aca_order    ON abandoned_cart_alert FIELDS order_id;
DEFINE INDEX IF NOT EXISTS idx_aca_level    ON abandoned_cart_alert FIELDS recovery_level;
DEFINE INDEX IF NOT EXISTS idx_aca_action   ON abandoned_cart_alert FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_aca_detected ON abandoned_cart_alert FIELDS detected_at;

-- Settings
DEFINE FIELD IF NOT EXISTS abandoned_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS abandoned_stale_threshold_min ON settings TYPE option<int>   DEFAULT 30;
  -- open order > 30 min with no activity = stale
DEFINE FIELD IF NOT EXISTS abandoned_draft_threshold_min ON settings TYPE option<int>  DEFAULT 120;
  -- draft order > 120 min = abandoned
DEFINE FIELD IF NOT EXISTS abandoned_high_recovery_threshold ON settings TYPE option<float> DEFAULT 65;
  -- recovery_score >= 65 = 'high'
DEFINE FIELD IF NOT EXISTS abandoned_max_alerts        ON settings TYPE option<int>   DEFAULT 30;
  -- max alerts per scan
