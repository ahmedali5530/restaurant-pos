-- Migration: 2026_08_28_cash_flow_forecast.surql
--
-- AI Cash Flow Forecasting — 30-day cash position projection.
--
-- Research finding: Lightspeed Financial Insights, Square Cash Flow,
-- Toast Capital all charge for cash flow forecasting (~$50/mo). POSR
-- offers it free — combines historical revenue + payroll obligations +
-- purchase orders + outstanding invoices + AI insights.
--
-- Cash flow = inflows (revenue, payments received) - outflows (payroll,
-- purchases, expenses, supplier invoices). Projected forward 30 days
-- using historical patterns + known upcoming obligations.
--
-- Tables:
--   1. cash_flow_forecast — cached 30-day projection (24h TTL)
--   2. cash_flow_entry — per-day line items (revenue/payroll/purchase/expense)
--
-- Key metrics:
--   - Projected closing balance per day
--   - Runway: days until cash runs out (if negative trajectory)
--   - Cash burn rate: avg daily net outflow
--   - Receivables aging: outstanding invoices by due date
--   - Payables aging: upcoming bills by due date
--
-- Settings:
--   - cashflow_forecast_days — projection horizon (default 30)
--   - cashflow_min_reserve — minimum cash reserve threshold (default 5000)
--   - cashflow_ai_enabled — enable AI insights (default true)
--   - cashflow_lookback_days — historical data window (default 90)

-- ---------------------------------------------------------------------------
-- cash_flow_forecast — cached 30-day projection
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS cash_flow_forecast TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON cash_flow_forecast TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS forecast_start   ON cash_flow_forecast TYPE datetime;
  -- Date the forecast starts from (today)
DEFINE FIELD IF NOT EXISTS forecast_end     ON cash_flow_forecast TYPE datetime;
  -- forecast_start + forecast_days
DEFINE FIELD IF NOT EXISTS forecast_days    ON cash_flow_forecast TYPE int DEFAULT 30;
DEFINE FIELD IF NOT EXISTS opening_balance  ON cash_flow_forecast TYPE float;
  -- Current cash position at forecast_start
DEFINE FIELD IF NOT EXISTS projected_closing_balance ON cash_flow_forecast TYPE float;
  -- Projected balance at forecast_end
DEFINE FIELD IF NOT EXISTS min_projected_balance ON cash_flow_forecast TYPE float;
  -- Lowest point in the 30-day window
DEFINE FIELD IF NOT EXISTS min_balance_date ON cash_flow_forecast TYPE option<datetime>;
  -- When the lowest point occurs
DEFINE FIELD IF NOT EXISTS total_inflow      ON cash_flow_forecast TYPE float;
DEFINE FIELD IF NOT EXISTS total_outflow     ON cash_flow_forecast TYPE float;
DEFINE FIELD IF NOT EXISTS net_flow          ON cash_flow_forecast TYPE float;
  -- total_inflow - total_outflow
DEFINE FIELD IF NOT EXISTS avg_daily_revenue ON cash_flow_forecast TYPE float;
DEFINE FIELD IF NOT EXISTS avg_daily_expense ON cash_flow_forecast TYPE float;
DEFINE FIELD IF NOT EXISTS burn_rate         ON cash_flow_forecast TYPE float;
  -- Average daily net outflow (negative = burning cash)
DEFINE FIELD IF NOT EXISTS runway_days      ON cash_flow_forecast TYPE option<int>;
  -- Days until cash runs out (null = infinite, positive trajectory)
DEFINE FIELD IF NOT EXISTS health_status    ON cash_flow_forecast TYPE string DEFAULT 'healthy';
  -- 'healthy' | 'watch' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS receivables_total ON cash_flow_forecast TYPE float DEFAULT 0;
  -- Outstanding invoices owed TO the restaurant
DEFINE FIELD IF NOT EXISTS payables_total   ON cash_flow_forecast TYPE float DEFAULT 0;
  -- Outstanding bills the restaurant owes
DEFINE FIELD IF NOT EXISTS upcoming_payroll ON cash_flow_forecast TYPE float DEFAULT 0;
  -- Next payroll cycle total
DEFINE FIELD IF NOT EXISTS ai_insights      ON cash_flow_forecast TYPE option<string>;
  -- AI-generated summary (max 500 chars)
DEFINE FIELD IF NOT EXISTS ai_recommendations ON cash_flow_forecast TYPE array<string> DEFAULT [];
  -- AI-generated action items
DEFINE FIELD IF NOT EXISTS generated_at     ON cash_flow_forecast TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON cash_flow_forecast TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_cff_generated_at ON cash_flow_forecast FIELDS generated_at;
DEFINE INDEX IF NOT EXISTS idx_cff_health      ON cash_flow_forecast FIELDS health_status;

-- ---------------------------------------------------------------------------
-- cash_flow_entry — per-day line items
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS cash_flow_entry TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON cash_flow_entry TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS forecast        ON cash_flow_entry TYPE option<record<cash_flow_forecast>>;
DEFINE FIELD IF NOT EXISTS forecast_id     ON cash_flow_entry TYPE string;
DEFINE FIELD IF NOT EXISTS date            ON cash_flow_entry TYPE datetime;
  -- The day this entry applies to
DEFINE FIELD IF NOT EXISTS entry_type      ON cash_flow_entry TYPE string;
  -- 'revenue' | 'payroll' | 'purchase' | 'expense' | 'tax' | 'rent' | 'utilities' | 'other_inflow' | 'other_outflow'
DEFINE FIELD IF NOT EXISTS direction       ON cash_flow_entry TYPE string;
  -- 'inflow' | 'outflow'
DEFINE FIELD IF NOT EXISTS amount          ON cash_flow_entry TYPE float;
DEFINE FIELD IF NOT EXISTS description     ON cash_flow_entry TYPE option<string>;
DEFINE FIELD IF NOT EXISTS reference_id    ON cash_flow_entry TYPE option<string>;
  -- Links to source record (order, PO, payroll, etc.)
DEFINE FIELD IF NOT EXISTS is_confirmed   ON cash_flow_entry TYPE bool DEFAULT false;
  -- true = known obligation (e.g. signed PO), false = projected (e.g. revenue)
DEFINE FIELD IF NOT EXISTS due_date        ON cash_flow_entry TYPE option<datetime>;
  -- For payables/receivables
DEFINE FIELD IF NOT EXISTS confidence      ON cash_flow_entry TYPE float DEFAULT 0.7;
  -- 0-1 (how confident we are in this projection)

DEFINE INDEX IF NOT EXISTS idx_cfe_forecast_id ON cash_flow_entry FIELDS forecast_id;
DEFINE INDEX IF NOT EXISTS idx_cfe_date         ON cash_flow_entry FIELDS date;
DEFINE INDEX IF NOT EXISTS idx_cfe_entry_type    ON cash_flow_entry FIELDS entry_type;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS cashflow_forecast_days    ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS cashflow_min_reserve      ON settings TYPE option<float> DEFAULT 5000;
DEFINE FIELD IF NOT EXISTS cashflow_ai_enabled        ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS cashflow_lookback_days     ON settings TYPE option<int> DEFAULT 90;
DEFINE FIELD IF NOT EXISTS cashflow_payroll_cycle_days ON settings TYPE option<int> DEFAULT 14;
  -- Payroll cycle (default: bi-weekly = 14 days)
DEFINE FIELD IF NOT EXISTS cashflow_avg_ticket_size  ON settings TYPE option<float> DEFAULT 0;
  -- Optional override for avg ticket size (0 = compute from data)
