-- Migration: 2026_08_30_inventory_transfer.surql
--
-- AI Multi-Location Inventory Transfer Optimizer — 63rd POSR-exclusive differentiator.
--
-- Research finding: Multi-location restaurants waste 8-12% of inventory to
-- imbalanced stock distribution — one location overstocks while another stocks
-- out (NRA multi-unit operations study). Emergency supplier orders cost 15-25%
-- more than scheduled orders. Transferring between locations costs 60-80% less
-- than emergency procurement (Restaurant Business magazine).
--
-- Toast Multi-Location ($150+/mo) shows stock levels per location but DOESN'T
-- recommend transfers. Square Multi-Store has no transfer optimization.
-- Lightspeed Multi-Location has manual transfer forms only.
-- POSR's branch-comparison.service compares PERFORMANCE metrics — doesn't
-- optimize inventory transfers. procurement.service buys from suppliers —
-- doesn't transfer between branches.
--
-- Distinct from:
--   - branch-comparison.service (compares PERFORMANCE — NOT inventory transfer)
--   - procurement.service (buys from SUPPLIERS — NOT branch-to-branch transfer)
--   - reorder.service (suggests reorder quantities — NOT transfers)
--   - shrinkage-detection.service (detects theft/loss — NOT transfer optimization)
--   - inventory (operational inventory management — NOT AI transfer suggestions)

DEFINE TABLE IF NOT EXISTS inventory_transfer TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON inventory_transfer TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON inventory_transfer TYPE string;
  -- 'surplus_to_shortage' | 'expiring_relocation' | 'cost_avoidance' | 'capacity_rebalance' | 'emergency_fulfillment'
DEFINE FIELD IF NOT EXISTS severity       ON inventory_transfer TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS item_id        ON inventory_transfer TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_name      ON inventory_transfer TYPE option<string>;
DEFINE FIELD IF NOT EXISTS from_branch    ON inventory_transfer TYPE option<string>;
  -- source branch name
DEFINE FIELD IF NOT EXISTS to_branch      ON inventory_transfer TYPE option<string>;
  -- destination branch name
DEFINE FIELD IF NOT EXISTS from_branch_stock ON inventory_transfer TYPE float DEFAULT 0;
  -- current stock at source
DEFINE FIELD IF NOT EXISTS to_branch_stock ON inventory_transfer TYPE float DEFAULT 0;
  -- current stock at destination
DEFINE FIELD IF NOT EXISTS suggested_qty  ON inventory_transfer TYPE float DEFAULT 0;
  -- suggested transfer quantity
DEFINE FIELD IF NOT EXISTS unit           ON inventory_transfer TYPE option<string>;
DEFINE FIELD IF NOT EXISTS unit_cost      ON inventory_transfer TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_savings    ON inventory_transfer TYPE float DEFAULT 0;
  -- savings vs emergency procurement
DEFINE FIELD IF NOT EXISTS transfer_cost  ON inventory_transfer TYPE float DEFAULT 0;
  -- estimated transport cost
DEFINE FIELD IF NOT EXISTS net_savings    ON inventory_transfer TYPE float DEFAULT 0;
  -- est_savings - transfer_cost
DEFINE FIELD IF NOT EXISTS days_until_expiry ON inventory_transfer TYPE option<int>;
  -- if item is expiring (for expiring_relocation rule)
DEFINE FIELD IF NOT EXISTS est_waste_prevented ON inventory_transfer TYPE float DEFAULT 0;
  -- $ waste prevented by transferring expiring stock
DEFINE FIELD IF NOT EXISTS description     ON inventory_transfer TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON inventory_transfer TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON inventory_transfer TYPE option<string>;
  -- 'transfer_now' | 'schedule_transfer' | 'verify_stock' | 'monitor' | 'decline'
DEFINE FIELD IF NOT EXISTS status          ON inventory_transfer TYPE string DEFAULT 'open';
  -- 'open' | 'transferred' | 'scheduled' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON inventory_transfer TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON inventory_transfer TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_it_rule_id   ON inventory_transfer FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_it_severity  ON inventory_transfer FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_it_status    ON inventory_transfer FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_it_item      ON inventory_transfer FIELDS item_id;

-- Settings
DEFINE FIELD IF NOT EXISTS transfer_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS transfer_surplus_threshold ON settings TYPE option<float> DEFAULT 1.5;
  -- stock > 1.5× par level = surplus
DEFINE FIELD IF NOT EXISTS transfer_shortage_threshold ON settings TYPE option<float> DEFAULT 0.5;
  -- stock < 0.5× par level = shortage
DEFINE FIELD IF NOT EXISTS transfer_max_distance_km ON settings TYPE option<float> DEFAULT 50;
  -- max distance for cost-effective transfer
DEFINE FIELD IF NOT EXISTS transfer_cost_per_km     ON settings TYPE option<float> DEFAULT 0.50;
  -- $0.50/km transport cost estimate
