-- Migration: 2026_08_28_server_load_balancer.surql
--
-- AI Server Load Balancer — 33rd POSR-exclusive differentiator.
--
-- Research finding: Uneven server load causes 15-20% slower service and
-- lower tips. Toast, Square, Lightspeed show server status but DON'T
-- balance assignments in real-time. POSR assigns incoming parties to
-- servers based on current active tables, order complexity, and server
-- performance history.
--
-- Distinct from:
--   - server-performance.service (rates servers after the fact)
--   - seating-optimization.service (assigns TABLES, not SERVERS)
--   - scheduling.service (generates shift schedules, not real-time assignment)
--
-- This service BALANCES SERVER LOAD in real-time — which server for THIS party?

DEFINE TABLE IF NOT EXISTS server_assignment TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON server_assignment TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS assigned_server ON server_assignment TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS server_name     ON server_assignment TYPE string;
DEFINE FIELD IF NOT EXISTS party_id        ON server_assignment TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name   ON server_assignment TYPE option<string>;
DEFINE FIELD IF NOT EXISTS party_size      ON server_assignment TYPE int;
DEFINE FIELD IF NOT EXISTS current_tables   ON server_assignment TYPE int;
  -- active tables assigned to this server
DEFINE FIELD IF NOT EXISTS current_orders   ON server_assignment TYPE int;
  -- active orders this server is handling
DEFINE FIELD IF NOT EXISTS load_score       ON server_assignment TYPE float;
  -- 0-100 (100 = overloaded)
DEFINE FIELD IF NOT EXISTS performance_score ON server_assignment TYPE float DEFAULT 0;
  -- historical performance rating (0-100)
DEFINE FIELD IF NOT EXISTS recommendation_reason ON server_assignment TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_insight      ON server_assignment TYPE option<string>;
DEFINE FIELD IF NOT EXISTS status         ON server_assignment TYPE string DEFAULT 'pending';
  -- 'pending' | 'assigned' | 'rejected'
DEFINE FIELD IF NOT EXISTS assigned_at      ON server_assignment TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON server_assignment TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_sa_server   ON server_assignment FIELDS assigned_server;
DEFINE INDEX IF NOT EXISTS idx_sa_status   ON server_assignment FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_sa_assigned ON server_assignment FIELDS assigned_at;

-- Settings
DEFINE FIELD IF NOT EXISTS server_balancer_ai_enabled    ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS server_balancer_max_tables     ON settings TYPE option<int>   DEFAULT 6;
  -- max active tables per server before overload
DEFINE FIELD IF NOT EXISTS server_balancer_lookback_days ON settings TYPE option<int>   DEFAULT 30;
  -- lookback for performance scoring
