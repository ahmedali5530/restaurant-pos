-- Migration: 2026_09_05_break_even_tracker.surql
--
-- AI Break-Even & Daily Profit Target Tracker — 65th POSR-exclusive differentiator.
--
-- Research finding: 60% of restaurants don't know their daily break-even point
-- (Cornell Hospitality Research, NRA Financial Literacy Survey). Operating
-- without knowing break-even leads to:
--   - Cash flow surprises (discover loss too late, can't adjust)
--   - Misaligned staffing (overstaff on slow days, understaff on busy)
--   - No profit target accountability (staff don't know daily goal)
--   - Inability to evaluate promotions (was the discount profitable?)
--   - Slow reaction to trend changes (2-3 week delay vs daily tracking)
--
-- Classic POS systems (Toast, Square, Lightspeed) show REVENUE but NOT
-- break-even. Toast Financial Insights ($50+/mo) shows monthly P&L but NOT
-- real-time daily break-even tracking. Restaurant365 ($300+/mo) has break-even
-- but requires manual accounting import — not real-time POS integration.
--
-- POSR's existing services cover DIFFERENT financial aspects:
--   - cash-flow.service = 30-day CASH POSITION projection (inflows - outflows)
--     — NOT break-even calculation or daily profit target tracking
--   - revenue-forecast.service = 90-day REVENUE projection — NOT cost analysis
--     or break-even
--   - demand-forecast.service = DEMAND prediction (orders/covers) — NOT
--     financial break-even
--   - labor-optimization.service = LABOR COST optimization — NOT overall
--     break-even across all cost categories
--   - dish-profitability.service = PER-DISH profitability — NOT restaurant-
--     level break-even
--   - branch-comparison.service = MULTI-LOCATION comparison — NOT break-even
--
-- This new service calculates + tracks DAILY BREAK-EVEN:
--   - Fixed costs: rent, insurance, salaries, equipment leases (monthly ÷ 30)
--   - Variable costs: food cost %, hourly labor, utilities, payment fees
--   - Break-even revenue = fixed costs ÷ (1 - variable_cost_pct)
--   - Real-time tracking: today's revenue vs break-even + profit target
--   - Pace projection: will today hit break-even by close?
--   - Alerts when behind pace, loss risk, surplus opportunities

DEFINE TABLE IF NOT EXISTS break_even_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON break_even_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON break_even_alert TYPE string;
  -- 'behind_pace' | 'loss_risk' | 'surplus_opportunity' | 'staffing_mismatch' |
  -- 'promotion_evaluation' | 'cost_overrun' | 'seasonal_adjustment' |
  -- 'profit_target_gap'
DEFINE FIELD IF NOT EXISTS severity        ON break_even_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS alert_date      ON break_even_alert TYPE string;
  -- YYYY-MM-DD
DEFINE FIELD IF NOT EXISTS current_revenue ON break_even_alert TYPE float DEFAULT 0;
  -- revenue so far today
DEFINE FIELD IF NOT EXISTS break_even_point ON break_even_alert TYPE float DEFAULT 0;
  -- daily break-even revenue
DEFINE FIELD IF NOT EXISTS profit_target   ON break_even_alert TYPE float DEFAULT 0;
  -- daily profit target revenue
DEFINE FIELD IF NOT EXISTS revenue_gap     ON break_even_alert TYPE float DEFAULT 0;
  -- gap to break-even (negative = below break-even)
DEFINE FIELD IF NOT EXISTS hours_elapsed   ON break_even_alert TYPE float DEFAULT 0;
  -- hours since open today
DEFINE FIELD IF NOT EXISTS hours_remaining  ON break_even_alert TYPE float DEFAULT 0;
  -- hours until close
DEFINE FIELD IF NOT EXISTS projected_close_revenue ON break_even_alert TYPE float DEFAULT 0;
  -- projected revenue at close based on current pace
DEFINE FIELD IF NOT EXISTS fixed_costs_daily ON break_even_alert TYPE float DEFAULT 0;
  -- daily fixed costs
DEFINE FIELD IF NOT EXISTS variable_cost_pct ON break_even_alert TYPE float DEFAULT 0;
  -- variable cost % (food + labor + utilities + fees)
DEFINE FIELD IF NOT EXISTS est_loss_today   ON break_even_alert TYPE float DEFAULT 0;
  -- $ loss projected for today if pace continues
DEFINE FIELD IF NOT EXISTS est_surplus_today ON break_even_alert TYPE float DEFAULT 0;
  -- $ surplus projected for today if pace continues
DEFINE FIELD IF NOT EXISTS description      ON break_even_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight       ON break_even_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON break_even_alert TYPE option<string>;
  -- 'increase_promotion' | 'reduce_staffing' | 'add_staffing' | 'push_upsell' |
  -- 'extend_hours' | 'monitor' | 'invest_surplus' | 'skip'
DEFINE FIELD IF NOT EXISTS status           ON break_even_alert TYPE string DEFAULT 'open';
  -- 'open' | 'acknowledged' | 'actioned' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at      ON break_even_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON break_even_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_breakeven_rule     ON break_even_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_breakeven_status   ON break_even_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_breakeven_severity ON break_even_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_breakeven_date     ON break_even_alert FIELDS alert_date;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS breakeven_ai_enabled       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS breakeven_monthly_fixed    ON settings TYPE option<float> DEFAULT 12000.0;
  -- monthly fixed costs (rent + insurance + salaries + leases)
DEFINE FIELD IF NOT EXISTS breakeven_food_cost_pct    ON settings TYPE option<float> DEFAULT 30.0;
  -- food cost as % of revenue
DEFINE FIELD IF NOT EXISTS breakeven_labor_pct        ON settings TYPE option<float> DEFAULT 28.0;
  -- variable labor as % of revenue
DEFINE FIELD IF NOT EXISTS breakeven_utility_pct      ON settings TYPE option<float> DEFAULT 5.0;
  -- utilities as % of revenue
DEFINE FIELD IF NOT EXISTS breakeven_fee_pct          ON settings TYPE option<float> DEFAULT 3.0;
  -- payment processing fees as % of revenue
DEFINE FIELD IF NOT EXISTS breakeven_target_margin    ON settings TYPE option<float> DEFAULT 15.0;
  -- target profit margin % (15% = healthy restaurant)
DEFINE FIELD IF NOT EXISTS breakeven_pace_alert_pct   ON settings TYPE option<float> DEFAULT 80.0;
  -- alert if pace < 80% of target
