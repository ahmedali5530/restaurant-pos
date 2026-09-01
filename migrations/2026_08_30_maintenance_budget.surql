-- Migration: 2026_08_30_maintenance_budget.surql
--
-- AI Predictive Maintenance Budget Planner — 75th POSR-exclusive differentiator.
--
-- Research finding: Restaurants spend 2-4% of revenue on equipment maintenance
-- (NRA). Reactive repairs cost 3-5x more than scheduled maintenance (Food
-- Service Equipment Reports). Yet 80% of restaurants have no maintenance
-- budget — they react when equipment breaks, causing cash flow shocks and
-- service disruptions. A planned maintenance budget saves 25-40% annually
-- (Cornell facilities management study).
--
-- Toast, Square, Lightspeed have NO maintenance budget planning.
-- POSR's equipment-maintenance.service predicts INDIVIDUAL equipment failures
-- — but doesn't build an annual BUDGET PLAN. cash-stress-test simulates
-- DISRUPTION SCENARIOS — doesn't plan maintenance spending.
--
-- Distinct from:
--   - equipment-maintenance.service (predicts individual failures — NOT budget)
--   - cash-stress-test.service (simulates scenarios — NOT maintenance planning)
--   - energy-vampire.service (standby power — NOT maintenance budget)
--   - energy-optimization.service (energy waste — NOT maintenance spending)
--   - procurement.service (ingredient prices — NOT equipment maintenance)

DEFINE TABLE IF NOT EXISTS maintenance_budget TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON maintenance_budget TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON maintenance_budget TYPE string;
  -- 'preventive_schedule' | 'replacement_fund' | 'emergency_reserve' | 'seasonal_prep' | 'cost_optimization'
DEFINE FIELD IF NOT EXISTS severity       ON maintenance_budget TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS equipment_name ON maintenance_budget TYPE option<string>;
DEFINE FIELD IF NOT EXISTS equipment_type ON maintenance_budget TYPE option<string>;
DEFINE FIELD IF NOT EXISTS action_type    ON maintenance_budget TYPE option<string>;
  -- 'preventive_service' | 'replacement' | 'emergency_repair' | 'inspection' | 'upgrade'
DEFINE FIELD IF NOT EXISTS scheduled_month ON maintenance_budget TYPE option<string>;
  -- target month for action
DEFINE FIELD IF NOT EXISTS est_cost       ON maintenance_budget TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_cost_without_plan ON maintenance_budget TYPE float DEFAULT 0;
  -- estimated cost if reactive (3-5x higher)
DEFINE FIELD IF NOT EXISTS est_savings    ON maintenance_budget TYPE float DEFAULT 0;
  -- savings from planned vs reactive
DEFINE FIELD IF NOT EXISTS priority_score ON maintenance_budget TYPE float DEFAULT 0;
  -- 0-100, higher = more urgent
DEFINE FIELD IF NOT EXISTS funding_source ON maintenance_budget TYPE option<string>;
  -- 'operating_budget' | 'reserve_fund' | 'lease' | 'insurance'
DEFINE FIELD IF NOT EXISTS description     ON maintenance_budget TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON maintenance_budget TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON maintenance_budget TYPE option<string>;
  -- 'budget_now' | 'schedule_service' | 'start_replacement_fund' | 'monitor' | 'defer'
DEFINE FIELD IF NOT EXISTS status          ON maintenance_budget TYPE string DEFAULT 'open';
  -- 'open' | 'budgeted' | 'scheduled' | 'completed' | 'deferred'
DEFINE FIELD IF NOT EXISTS detected_at     ON maintenance_budget TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON maintenance_budget TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_mb_rule_id   ON maintenance_budget FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_mb_severity  ON maintenance_budget FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_mb_status    ON maintenance_budget FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_mb_month     ON maintenance_budget FIELDS scheduled_month;

-- Settings
DEFINE FIELD IF NOT EXISTS maint_budget_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS maint_budget_revenue_pct      ON settings TYPE option<float> DEFAULT 0.03;
  -- target 3% of revenue for maintenance
DEFINE FIELD IF NOT EXISTS maint_budget_emergency_pct    ON settings TYPE option<float> DEFAULT 0.20;
  -- 20% of maintenance budget as emergency reserve
DEFINE FIELD IF NOT EXISTS maint_budget_reactive_multiplier ON settings TYPE option<float> DEFAULT 4.0;
  -- reactive repairs cost 4x planned
