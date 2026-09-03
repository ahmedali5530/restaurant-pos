-- Migration: 2026_08_28_scheduling_optimization.surql
--
-- AI Staff Scheduling Optimization — demand-driven shift generation.
--
-- Research finding: Lightspeed Team Schedule add-on $60/mo, Toast Team
-- Schedule is part of higher tier. POSR offers it free — combines demand
-- forecast (already implemented) + staff pay rates + availability constraints
-- to generate optimal schedules with minimum payroll cost while covering demand.
--
-- Tables:
--   1. schedule_optimization — cached optimization runs (7-day generated schedules)
--   2. generated_shift — AI-generated shift proposals (before being committed to scheduled_shift)
--
-- Algorithm:
--   1. Demand forecast: 7-day hourly predicted orders (from demand-forecast.service)
--   2. Staff pool: active employees with pay profiles (base_rate, max_hours, availability)
--   3. Coverage requirement: per hour, predicted_orders / orders_per_staff_hour (default 12)
--      → minimum staff needed per hour
--   4. Cost optimization:
--      - Greedy fill: assign cheapest available staff to each hour slot
--      - Constraint check: max_hours/day, max_hours/week, min rest between shifts
--      - Overtime avoidance: prefer spreading hours across staff vs. concentrating
--      - Position matching: prefer staff whose position matches the role needed
--   5. AI refinement (optional):
--      - OpenAI reviews the generated schedule + suggests improvements
--      - Considers historical performance, team dynamics, skill mix
--   6. Output: per-day generated shifts + total cost + coverage gaps + savings vs. naive
--
-- Settings:
--   - schedule_orders_per_staff_hour — staff capacity per hour (default 12)
--   - schedule_min_staff_per_hour — minimum staff regardless of demand (default 2)
--   - schedule_max_staff_per_hour — maximum staff per hour (default 8)
--   - schedule_min_shift_hours — minimum shift length (default 4)
--   - schedule_max_shift_hours — maximum shift length (default 8)
--   - schedule_min_rest_hours — minimum rest between shifts (default 10)
--   - schedule_ai_enabled — enable AI refinement (default true)
--   - schedule_overtime_threshold_hours — weekly hours before overtime (default 40)

-- ---------------------------------------------------------------------------
-- schedule_optimization — cached optimization runs
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS schedule_optimization TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON schedule_optimization TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS week_start       ON schedule_optimization TYPE datetime;
  -- Start of the week being scheduled (Monday 00:00)
DEFINE FIELD IF NOT EXISTS week_end         ON schedule_optimization TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_shifts     ON schedule_optimization TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_hours      ON schedule_optimization TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_cost       ON schedule_optimization TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS overtime_hours    ON schedule_optimization TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS coverage_gaps     ON schedule_optimization TYPE int DEFAULT 0;
  -- Number of hours where staff < required
DEFINE FIELD IF NOT EXISTS overstaffed_hours ON schedule_optimization TYPE int DEFAULT 0;
  -- Number of hours where staff > 1.5x required
DEFINE FIELD IF NOT EXISTS employees_used    ON schedule_optimization TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_utilization   ON schedule_optimization TYPE float DEFAULT 0;
  -- 0-1 (actual hours / scheduled hours)
DEFINE FIELD IF NOT EXISTS projected_savings ON schedule_optimization TYPE float DEFAULT 0;
  -- Savings vs. naive uniform staffing
DEFINE FIELD IF NOT EXISTS ai_insights      ON schedule_optimization TYPE option<string>;
  -- AI-generated summary insights (max 500 chars)
DEFINE FIELD IF NOT EXISTS status           ON schedule_optimization TYPE string DEFAULT 'draft';
  -- 'draft' | 'approved' | 'committed' | 'rejected'
DEFINE FIELD IF NOT EXISTS generated_at     ON schedule_optimization TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS approved_at      ON schedule_optimization TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS approved_by      ON schedule_optimization TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS committed_at     ON schedule_optimization TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_so_week_start ON schedule_optimization FIELDS week_start;
DEFINE INDEX IF NOT EXISTS idx_so_status      ON schedule_optimization FIELDS status;

-- ---------------------------------------------------------------------------
-- generated_shift — AI-generated shift proposals
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS generated_shift TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON generated_shift TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS optimization    ON generated_shift TYPE option<record<schedule_optimization>>;
DEFINE FIELD IF NOT EXISTS optimization_id ON generated_shift TYPE string;
DEFINE FIELD IF NOT EXISTS employee         ON generated_shift TYPE option<record<employee>>;
DEFINE FIELD IF NOT EXISTS employee_id     ON generated_shift TYPE string;
DEFINE FIELD IF NOT EXISTS employee_name   ON generated_shift TYPE string;
DEFINE FIELD IF NOT EXISTS position        ON generated_shift TYPE option<string>;
DEFINE FIELD IF NOT EXISTS department      ON generated_shift TYPE option<string>;
DEFINE FIELD IF NOT EXISTS day_of_week     ON generated_shift TYPE int;
  -- 0=Sunday ... 6=Saturday
DEFINE FIELD IF NOT EXISTS start_at         ON generated_shift TYPE datetime;
DEFINE FIELD IF NOT EXISTS end_at          ON generated_shift TYPE datetime;
DEFINE FIELD IF NOT EXISTS duration_hours  ON generated_shift TYPE float;
DEFINE FIELD IF NOT EXISTS base_rate        ON generated_shift TYPE float;
  -- Employee's base hourly rate
DEFINE FIELD IF NOT EXISTS pay_type        ON generated_shift TYPE string;
  -- 'hourly' | 'salary'
DEFINE FIELD IF NOT EXISTS shift_cost       ON generated_shift TYPE float;
  -- Total cost for this shift (including overtime/night/weekend premiums if applicable)
DEFINE FIELD IF NOT EXISTS is_overtime     ON generated_shift TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS is_weekend      ON generated_shift TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS is_holiday       ON generated_shift TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS expected_orders  ON generated_shift TYPE int;
  -- Predicted orders during this shift
DEFINE FIELD IF NOT EXISTS expected_utilization ON generated_shift TYPE float DEFAULT 0;
  -- 0-1 (expected_orders / (duration_hours * orders_per_staff_hour))
DEFINE FIELD IF NOT EXISTS ai_recommendation ON generated_shift TYPE option<string>;
  -- Per-shift AI note (max 200 chars)
DEFINE FIELD IF NOT EXISTS status          ON generated_shift TYPE string DEFAULT 'proposed';
  -- 'proposed' | 'accepted' | 'rejected' | 'committed'
DEFINE FIELD IF NOT EXISTS conflict_reason ON generated_shift TYPE option<string>;
  -- If rejected, why (max_hours exceeded, unavailable, etc.)

DEFINE INDEX IF NOT EXISTS idx_gs_optimization_id ON generated_shift FIELDS optimization_id;
DEFINE INDEX IF NOT EXISTS idx_gs_employee_id      ON generated_shift FIELDS employee_id;
DEFINE INDEX IF NOT EXISTS idx_gs_start_at          ON generated_shift FIELDS start_at;
DEFINE INDEX IF NOT EXISTS idx_gs_status           ON generated_shift FIELDS status;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS schedule_orders_per_staff_hour    ON settings TYPE option<int> DEFAULT 12;
DEFINE FIELD IF NOT EXISTS schedule_min_staff_per_hour         ON settings TYPE option<int> DEFAULT 2;
DEFINE FIELD IF NOT EXISTS schedule_max_staff_per_hour         ON settings TYPE option<int> DEFAULT 8;
DEFINE FIELD IF NOT EXISTS schedule_min_shift_hours            ON settings TYPE option<int> DEFAULT 4;
DEFINE FIELD IF NOT EXISTS schedule_max_shift_hours            ON settings TYPE option<int> DEFAULT 8;
DEFINE FIELD IF NOT EXISTS schedule_min_rest_hours              ON settings TYPE option<int> DEFAULT 10;
DEFINE FIELD IF NOT EXISTS schedule_ai_enabled                 ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS schedule_overtime_threshold_hours   ON settings TYPE option<int> DEFAULT 40;
