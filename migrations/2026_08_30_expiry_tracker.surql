-- Migration: 2026_08_30_expiry_tracker.surql
--
-- AI Inventory Expiry Tracker — 67th POSR-exclusive differentiator.
--
-- Research finding: Restaurants waste 4-10% of food inventory to expiry
-- (NRRA). 40% of food waste happens because items expire before use (ReFED
-- restaurant food waste report). Existing systems find items ALREADY expired
-- (food-safety EXPIRED_STOCK — reactive) or PREDICT spoilage based on
-- consumption rate (spoilage-prediction). Neither recommends COMMERCIAL
-- ACTIONS to use expiring items before they're wasted.
--
-- This new service:
--   1. Tracks items approaching expiry (3-day, 7-day, 14-day windows)
--   2. Recommends specific commercial actions (price markdown, daily special,
--      prep prioritization, transfer to busy location)
--   3. Calculates financial impact (cost at risk if item expires)
--   4. Tracks batch/lot numbers for recall management
--   5. Provides expiry timeline view for kitchen planning
--
-- Distinct from:
--   - spoilage-prediction.service (PREDICTS spoilage from consumption rate —
--     NOT commercial actions to use expiring items)
--   - food-safety.service (finds ALREADY expired items — reactive, not
--     proactive action recommendations)
--   - waste-tracking.service (analyzes waste AFTER it happens)
--   - inventory-transfer.service (transfers between branches — not expiry action)
--   - reorder.service (suggests reorder timing — not expiry management)

DEFINE TABLE IF NOT EXISTS expiry_tracker TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON expiry_tracker TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON expiry_tracker TYPE string;
  -- 'critical_3d' | 'urgent_7d' | 'warning_14d' | 'expired' | 'batch_recall'
DEFINE FIELD IF NOT EXISTS severity       ON expiry_tracker TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS item_id        ON expiry_tracker TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_name      ON expiry_tracker TYPE option<string>;
DEFINE FIELD IF NOT EXISTS batch_number   ON expiry_tracker TYPE option<string>;
  -- lot/batch for recall tracking
DEFINE FIELD IF NOT EXISTS quantity       ON expiry_tracker TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS unit           ON expiry_tracker TYPE option<string>;
DEFINE FIELD IF NOT EXISTS unit_cost      ON expiry_tracker TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS expiry_date    ON expiry_tracker TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS days_until_expiry ON expiry_tracker TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS cost_at_risk   ON expiry_tracker TYPE float DEFAULT 0;
  -- quantity × unit_cost (financial impact if wasted)
DEFINE FIELD IF NOT EXISTS suggested_action ON expiry_tracker TYPE option<string>;
  -- 'markdown_30pct' | 'daily_special' | 'prep_priority' | 'transfer_busy' | 'donate' | 'discard'
DEFINE FIELD IF NOT EXISTS est_savings    ON expiry_tracker TYPE float DEFAULT 0;
  -- $ saved if action taken (e.g. markdown recovers 70% of cost)
DEFINE FIELD IF NOT EXISTS consumption_rate ON expiry_tracker TYPE float DEFAULT 0;
  -- units consumed per day (avg)
DEFINE FIELD IF NOT EXISTS will_expire_before_used ON expiry_tracker TYPE option<bool>;
  -- true if consumption_rate × days_until_expiry < quantity
DEFINE FIELD IF NOT EXISTS description     ON expiry_tracker TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON expiry_tracker TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON expiry_tracker TYPE option<string>;
  -- 'act_now' | 'schedule_markdown' | 'monitor' | 'recall_check' | 'discard'
DEFINE FIELD IF NOT EXISTS status          ON expiry_tracker TYPE string DEFAULT 'open';
  -- 'open' | 'actioned' | 'used' | 'expired' | 'recalled'
DEFINE FIELD IF NOT EXISTS detected_at     ON expiry_tracker TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON expiry_tracker TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_et_rule_id   ON expiry_tracker FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_et_severity  ON expiry_tracker FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_et_status    ON expiry_tracker FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_et_item      ON expiry_tracker FIELDS item_id;
DEFINE INDEX IF NOT EXISTS idx_et_expiry    ON expiry_tracker FIELDS expiry_date;

-- Settings
DEFINE FIELD IF NOT EXISTS expiry_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS expiry_critical_days    ON settings TYPE option<int>   DEFAULT 3;
  -- 3 days = critical
DEFINE FIELD IF NOT EXISTS expiry_urgent_days      ON settings TYPE option<int>   DEFAULT 7;
  -- 7 days = urgent
DEFINE FIELD IF NOT EXISTS expiry_warning_days     ON settings TYPE option<int>   DEFAULT 14;
  -- 14 days = warning
DEFINE FIELD IF NOT EXISTS expiry_markdown_pct     ON settings TYPE option<float> DEFAULT 0.30;
  -- suggested markdown 30%
