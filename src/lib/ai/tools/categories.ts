export type AiReportToolDomain =
  | "sales"
  | "inventory"
  | "operations"
  | "analysis"
  | "labor"
  | "chart"
  | "lookup";

export const AI_REPORT_TOOL_CATEGORIES: Record<AiReportToolDomain | "core", readonly string[]> = {
  core: ["resolve_date_range"],
  sales: [
    "get_top_selling_dishes",
    "get_sales_summary",
    "get_product_mix",
    "get_unsold_products",
    "get_voids",
    "get_tips",
    "get_server_sales",
    "get_current_session_sales",
    "get_tax_summary",
    "get_discount_summary",
    "get_coupon_summary",
    "get_weekly_sales",
    "get_hourly_product_sales",
    "get_dashboard_snapshot",
  ],
  inventory: [
    "get_current_inventory",
    "get_inventory_movements",
    "get_consumption",
    "get_waste_summary",
    "get_sale_vs_consumption",
    "get_kitchen_reconciliation",
  ],
  operations: [
    "get_orders",
    "get_order_lifecycle",
    "get_expenses",
    "get_activity_log",
    "get_cash_closing",
    "list_active_sessions",
  ],
  analysis: [
    "get_time_series",
    "forecast_sales",
    "forecast_inventory",
    "compare_periods",
  ],
  labor: [
    "get_labor_dashboard_snapshot",
    "get_daily_labor_cost",
    "get_labor_percent",
    "get_overtime_report",
    "get_attendance_report",
    "get_payroll_summary",
    "get_scheduled_vs_actual",
    "get_labor_trend",
    "get_ai_labor_datasets",
  ],
  chart: ["render_chart"],
  lookup: [
    "list_staff",
    "list_categories",
    "list_menu_items",
    "list_inventory_items",
  ],
};

export const ALL_AI_REPORT_TOOL_NAMES = [
  ...AI_REPORT_TOOL_CATEGORIES.core,
  ...AI_REPORT_TOOL_CATEGORIES.sales,
  ...AI_REPORT_TOOL_CATEGORIES.inventory,
  ...AI_REPORT_TOOL_CATEGORIES.operations,
  ...AI_REPORT_TOOL_CATEGORIES.analysis,
  ...AI_REPORT_TOOL_CATEGORIES.labor,
  ...AI_REPORT_TOOL_CATEGORIES.chart,
  ...AI_REPORT_TOOL_CATEGORIES.lookup,
];
