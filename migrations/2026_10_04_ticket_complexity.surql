-- Migration: 2026_10_04_ticket_complexity.surql
--
-- AI Order Ticket Complexity Analyzer — 113th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $250-1,000/mo per location from unmanaged
-- ticket complexity (NRA Kitchen Operations, Cornell Order Flow Study):
--   - 30% of tickets are "complex" (4+ items, 3+ modifiers, split payments)
--   - Complex tickets take 2-3x longer to fulfill than simple ones
--   - No POS analyzes ticket complexity BEFORE routing to kitchen
--   - Station load imbalance: grill overloaded while saute underutilized
--   - Modifier-heavy tickets cause kitchen confusion + errors
--   - Split payment tickets slow front-of-house, not just kitchen
--   - Special request tickets (allergy, custom) need special handling
--   - No dynamic routing — all tickets go to same station queue
--   - Complex ticket patterns not analyzed for menu/process simplification
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO ticket complexity
-- analysis. kitchen-bottleneck detects bottlenecks AFTER they happen.
-- kitchen-demand-surge predicts demand surges. order-pacing paces incoming
-- orders. wait-prediction predicts customer wait times. None analyze the
-- COMPLEXITY of each ticket to predict fulfillment time, balance station
-- load, and route orders dynamically.
--
-- This new service ANALYZES ORDER TICKET COMPLEXITY:
--   - Scores each ticket's complexity (items, modifiers, splits, special requests)
--   - Predicts fulfillment time per ticket
--   - Detects station load imbalance from ticket composition
--   - Routes complex tickets to underutilized stations
--   - Flags modifier-heavy tickets for kitchen clarification
--   - Identifies split payment tickets needing expedited prep
--   - Detects special request tickets needing chef attention
--   - Analyzes complexity patterns for menu/process simplification

DEFINE TABLE IF NOT EXISTS ticket_complexity_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON ticket_complexity_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON ticket_complexity_alert TYPE string;
  -- 'high_complexity_ticket' | 'station_overload_risk' | 'modifier_heavy_ticket' |
--   'split_payment_delay' | 'special_request_flag' | 'predicted_long_fulfillment' |
--   'complexity_pattern' | 'routing_recommendation'
DEFINE FIELD IF NOT EXISTS severity        ON ticket_complexity_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS ticket_id       ON ticket_complexity_alert TYPE string;
DEFINE FIELD IF NOT EXISTS complexity_score ON ticket_complexity_alert TYPE option<float>;
  -- 0-100 complexity score
DEFINE FIELD IF NOT EXISTS item_count      ON ticket_complexity_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS modifier_count  ON ticket_complexity_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS split_payment_count ON ticket_complexity_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS special_request_count ON ticket_complexity_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS stations_involved ON ticket_complexity_alert TYPE option<string>;
  -- comma-separated stations (e.g. 'grill,fry,cold')
DEFINE FIELD IF NOT EXISTS predicted_fulfillment_minutes ON ticket_complexity_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS actual_fulfillment_minutes ON ticket_complexity_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS primary_station ON ticket_complexity_alert TYPE option<string>;
  -- station with highest load from this ticket
DEFINE FIELD IF NOT EXISTS station_load_pct ON ticket_complexity_alert TYPE option<float>;
  -- % of station capacity consumed by this ticket
DEFINE FIELD IF NOT EXISTS recommended_station ON ticket_complexity_alert TYPE option<string>;
  -- suggested alternative station for routing
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON ticket_complexity_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON ticket_complexity_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON ticket_complexity_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON ticket_complexity_alert TYPE option<string>;
  -- 'route_to_station' | 'split_ticket' | 'expedite_prep' | 'chef_attention' |
--   'simplify_menu' | 'add_staffing' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON ticket_complexity_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON ticket_complexity_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON ticket_complexity_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ticketcomp_rule      ON ticket_complexity_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ticketcomp_status    ON ticket_complexity_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ticketcomp_severity  ON ticket_complexity_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ticketcomp_ticket    ON ticket_complexity_alert FIELDS ticket_id;
DEFINE INDEX IF NOT EXISTS idx_ticketcomp_station   ON ticket_complexity_alert FIELDS primary_station;

DEFINE FIELD IF NOT EXISTS ticketcomp_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS ticketcomp_high_threshold ON settings TYPE option<float> DEFAULT 60.0;
  -- complexity score above which ticket is "high complexity" (default 60)
DEFINE FIELD IF NOT EXISTS ticketcomp_mod_threshold ON settings TYPE option<int> DEFAULT 5;
  -- modifier count to flag as modifier-heavy (default 5)
DEFINE FIELD IF NOT EXISTS ticketcomp_long_fulfill  ON settings TYPE option<float> DEFAULT 20.0;
  -- predicted fulfillment minutes to flag as long (default 20 min)
DEFINE FIELD IF NOT EXISTS ticketcomp_station_overload ON settings TYPE option<float> DEFAULT 80.0;
  -- station load % to flag as overload risk (default 80%)
