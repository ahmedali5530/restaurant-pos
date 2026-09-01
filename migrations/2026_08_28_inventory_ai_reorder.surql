-- Migration: 2026_08_28_inventory_ai_reorder.surql
--
-- Inventory AI Reorder — predictive purchase suggestions.
--
-- Research finding: Lightspeed Pro charges $50+/mo for "Smart Reordering".
-- Toast Inventory Pro has demand-based reorder suggestions. POSR offers it
-- free — combines demand forecast (already implemented) + consumption rate
-- + lead time + par-level to generate purchase suggestions.
--
-- Tables:
--   1. reorder_suggestion — AI-generated purchase suggestions (cached 24h)
--   2. inventory_lead_time — per-supplier lead time stats (auto-learned)
--
-- Settings fields:
--   - reorder_safety_stock_days   — buffer days above forecasted need (default 3)
--   - reorder_min_order_value      — minimum PO value to suggest (default $50)
--   - reorder_max_suggestion_age_hours — how long a suggestion is valid (default 24)
--   - reorder_auto_approve_below   — auto-approve POs below this value (default 0 = disabled)
--   - reorder_consume_lookback_days — days of history for consumption rate (default 30)

-- ---------------------------------------------------------------------------
-- reorder_suggestion — AI-generated purchase suggestions
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS reorder_suggestion TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON reorder_suggestion TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS inventory_item  ON reorder_suggestion TYPE option<record<inventory_item>>;
DEFINE FIELD IF NOT EXISTS item_id         ON reorder_suggestion TYPE string;
  -- Denormalized for fast lookup
DEFINE FIELD IF NOT EXISTS item_name      ON reorder_suggestion TYPE string;
DEFINE FIELD IF NOT EXISTS item_code       ON reorder_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS uom             ON reorder_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_stock   ON reorder_suggestion TYPE float;
  -- Current on-hand quantity
DEFINE FIELD IF NOT EXISTS par_level      ON reorder_suggestion TYPE float;
  -- Reorder point (when stock drops below this)
DEFINE FIELD IF NOT EXISTS suggested_qty   ON reorder_suggestion TYPE float;
  -- How many units to order
DEFINE FIELD IF NOT EXISTS avg_daily_usage ON reorder_suggestion TYPE float;
  -- Consumption rate (units/day, 30-day average)
DEFINE FIELD IF NOT EXISTS forecasted_usage_7d ON reorder_suggestion TYPE float;
  -- Demand forecast for next 7 days
DEFINE FIELD IF NOT EXISTS days_until_out  ON reorder_suggestion TYPE float;
  -- Days until stock reaches 0 at current rate
DEFINE FIELD IF NOT EXISTS urgency         ON reorder_suggestion TYPE string;
  -- 'critical' (< 2 days) | 'high' (< 5 days) | 'medium' (< 10 days) | 'low' (> 10 days but below par)
DEFINE FIELD IF NOT EXISTS supplier        ON reorder_suggestion TYPE option<record<inventory_supplier>>;
DEFINE FIELD IF NOT EXISTS supplier_name   ON reorder_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS unit_cost        ON reorder_suggestion TYPE option<float>;
DEFINE FIELD IF NOT EXISTS total_cost      ON reorder_suggestion TYPE option<float>;
DEFINE FIELD IF NOT EXISTS reason_codes    ON reorder_suggestion TYPE array<string> DEFAULT [];
  -- Human-readable reasons: 'below_par', 'forecast_spike', 'supplier_lead_time', 'safety_stock'
DEFINE FIELD IF NOT EXISTS ai_confidence    ON reorder_suggestion TYPE float DEFAULT 0.7;
  -- 0-1 confidence in the suggestion
DEFINE FIELD IF NOT EXISTS status          ON reorder_suggestion TYPE string DEFAULT 'pending';
  -- 'pending' | 'accepted' | 'rejected' | 'converted_to_po' | 'expired'
DEFINE FIELD IF NOT EXISTS generated_at     ON reorder_suggestion TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON reorder_suggestion TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS accepted_at      ON reorder_suggestion TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS accepted_by      ON reorder_suggestion TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS converted_po     ON reorder_suggestion TYPE option<record<inventory_purchase_order>>;
DEFINE FIELD IF NOT EXISTS location         ON reorder_suggestion TYPE option<record<inventory_location>>;

DEFINE INDEX IF NOT EXISTS idx_rs_item_id     ON reorder_suggestion FIELDS item_id;
DEFINE INDEX IF NOT EXISTS idx_rs_status       ON reorder_suggestion FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_rs_urgency      ON reorder_suggestion FIELDS urgency;
DEFINE INDEX IF NOT EXISTS idx_rs_generated_at ON reorder_suggestion FIELDS generated_at;

-- ---------------------------------------------------------------------------
-- inventory_lead_time — auto-learned per-supplier lead times
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS inventory_lead_time TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON inventory_lead_time TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS supplier       ON inventory_lead_time TYPE option<record<inventory_supplier>>;
DEFINE FIELD IF NOT EXISTS item           ON inventory_lead_time TYPE option<record<inventory_item>>;
DEFINE FIELD IF NOT EXISTS avg_lead_days  ON inventory_lead_time TYPE float DEFAULT 7;
  -- Average days from PO submission to fulfillment
DEFINE FIELD IF NOT EXISTS min_lead_days   ON inventory_lead_time TYPE float DEFAULT 3;
DEFINE FIELD IF NOT EXISTS max_lead_days   ON inventory_lead_time TYPE float DEFAULT 14;
DEFINE FIELD IF NOT EXISTS sample_count    ON inventory_lead_time TYPE int DEFAULT 0;
  -- How many POs were used to compute the average
DEFINE FIELD IF NOT EXISTS last_updated     ON inventory_lead_time TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_lt_supplier ON inventory_lead_time FIELDS supplier;
DEFINE INDEX IF NOT EXISTS idx_lt_item     ON inventory_lead_time FIELDS item;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS reorder_safety_stock_days        ON settings TYPE option<int> DEFAULT 3;
DEFINE FIELD IF NOT EXISTS reorder_min_order_value           ON settings TYPE option<float> DEFAULT 50;
DEFINE FIELD IF NOT EXISTS reorder_max_suggestion_age_hours  ON settings TYPE option<int> DEFAULT 24;
DEFINE FIELD IF NOT EXISTS reorder_auto_approve_below        ON settings TYPE option<float> DEFAULT 0;
DEFINE FIELD IF NOT EXISTS reorder_consume_lookback_days     ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS reorder_ai_enabled                ON settings TYPE option<bool> DEFAULT true;
  -- When true, AI enhances suggestions with forecast + insights;
  -- when false, falls back to pure statistical par-level reordering
