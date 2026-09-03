-- Migration: 2026_08_28_labor_optimization.surql
--
-- AI Labor Cost Optimization — labor cost vs revenue analysis.
--
-- Research finding: Toast Labor Cost Management $35+/mo (higher tier),
-- Square Labor Cost Reporting in Plus. POSR offers it free — analyzes
-- labor cost as % of revenue, hourly efficiency, overtime impact,
-- + AI recommendations for staffing optimization.

DEFINE TABLE IF NOT EXISTS labor_cost_analysis TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON labor_cost_analysis TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS analysis_date    ON labor_cost_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_start    ON labor_cost_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON labor_cost_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_revenue    ON labor_cost_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_labor_cost  ON labor_cost_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS labor_cost_pct   ON labor_cost_analysis TYPE float DEFAULT 0;
  -- labor_cost / revenue × 100 (industry benchmark: 25-35%)
DEFINE FIELD IF NOT EXISTS total_hours      ON labor_cost_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS regular_hours    ON labor_cost_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS overtime_hours   ON labor_cost_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS overtime_cost    ON labor_cost_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS overtime_pct     ON labor_cost_analysis TYPE float DEFAULT 0;
  -- overtime_cost / total_labor_cost × 100
DEFINE FIELD IF NOT EXISTS employee_count   ON labor_cost_analysis TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_hourly_cost   ON labor_cost_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS revenue_per_labor_hour ON labor_cost_analysis TYPE float DEFAULT 0;
  -- revenue / total_hours (productivity metric)
DEFINE FIELD IF NOT EXISTS labor_efficiency ON labor_cost_analysis TYPE float DEFAULT 0;
  -- revenue_per_labor_hour / avg_hourly_cost (1.0 = breakeven, >3 = good)
DEFINE FIELD IF NOT EXISTS health_status    ON labor_cost_analysis TYPE string DEFAULT 'healthy';
  -- 'healthy' (<30%) | 'watch' (30-35%) | 'warning' (35-40%) | 'critical' (>40%)
DEFINE FIELD IF NOT EXISTS daily_breakdown  ON labor_cost_analysis TYPE option<array<object>>;
  -- [{date, revenue, labor_cost, labor_pct, hours, employees}]
DEFINE FIELD IF NOT EXISTS top_cost_employees ON labor_cost_analysis TYPE option<array<object>>;
  -- [{name, hours, cost, overtime_hours}]
DEFINE FIELD IF NOT EXISTS ai_insight       ON labor_cost_analysis TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendations ON labor_cost_analysis TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS projected_savings ON labor_cost_analysis TYPE option<float>;
DEFINE FIELD IF NOT EXISTS generated_at     ON labor_cost_analysis TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at        ON labor_cost_analysis TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_lca_date ON labor_cost_analysis FIELDS analysis_date;
DEFINE INDEX IF NOT EXISTS idx_lca_health ON labor_cost_analysis FIELDS health_status;

DEFINE FIELD IF NOT EXISTS labor_opt_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS labor_opt_target_pct ON settings TYPE option<float> DEFAULT 30;
  -- Target labor cost % (default: 30%)
DEFINE FIELD IF NOT EXISTS labor_opt_critical_pct ON settings TYPE option<float> DEFAULT 40;
  -- Critical labor cost % (default: 40%)
DEFINE FIELD IF NOT EXISTS labor_opt_lookback_days ON settings TYPE option<int> DEFAULT 30;
