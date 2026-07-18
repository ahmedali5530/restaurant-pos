import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

/** Maps tool names to report permission modules. */
export const TOOL_PERMISSION_MODULES: Record<string, string | string[]> = {
  get_top_selling_dishes: "Product Mix Summary",
  get_sales_summary: "Sales Summary",
  get_product_mix: "Product Mix Summary",
  get_unsold_products: "Product Mix Summary",
  get_voids: "Voids",
  get_tips: "Tips",
  get_server_sales: "Server Sales",
  get_current_session_sales: "Server Sales",
  list_active_sessions: "Sales Hourly Labour",
  get_tax_summary: "Tax",
  get_discount_summary: "Discount",
  get_coupon_summary: "Coupon",
  get_weekly_sales: "Sales Weekly",
  get_hourly_product_sales: "Products Hourly",
  get_current_inventory: "Current Inventory",
  get_inventory_movements: ["Purchase", "Issue", "Waste", "Adjustments", "Current Inventory"],
  get_consumption: "Consumption",
  get_waste_summary: "Waste",
  get_sale_vs_consumption: "Sale vs Inventory",
  get_kitchen_reconciliation: "Kitchen Reconciliation",
  get_expenses: "Expense",
  get_activity_log: "Activity",
  get_cash_closing: "Cash closing",
  get_order_lifecycle: "Order Life Cycle",
  get_orders: "Order Life Cycle",
  get_time_series: "Sales Summary",
  forecast_sales: "Sales Summary",
  forecast_inventory: "Current Inventory",
  compare_periods: "Sales Summary",
  get_dashboard_snapshot: "Sales dashboard",
  render_chart: "AI Report",
  resolve_date_range: "AI Report",
  list_staff: "AI Report",
  list_categories: "AI Report",
  list_menu_items: "Product Mix Summary",
  list_inventory_items: "Current Inventory",
  get_labor_dashboard_snapshot: "Labor Dashboard",
  get_daily_labor_cost: "Daily Labor Cost",
  get_labor_percent: "Labor Percent",
  get_overtime_report: "Overtime Report",
  get_attendance_report: "Attendance Report",
  get_payroll_summary: "Payroll Summary",
  get_scheduled_vs_actual: "Scheduled vs Actual",
  get_labor_trend: "Labor Trend",
  get_ai_labor_datasets: "Labor Dashboard",
  get_hourly_labor_vs_sales: "Sales Hourly Labour",
  get_server_ticket_times: "Server Sales",
  get_staff_accountability_metrics: "Server Sales",
  get_menu_engineering_matrix: "Product Mix Summary",
  get_menu_sales_trends: "Product Mix Summary",
  estimate_price_change_impact: "Product Mix Summary",
  get_void_and_cancel_summary: "Voids",
  get_prep_times_by_order_type: "Order Life Cycle",
  get_kitchen_station_delays: "Order Life Cycle",
  get_cash_settlement_audit: "Activity",
  get_trial_balance: "Trial Balance",
  get_balance_sheet: "Balance Sheet",
  get_profit_loss: "Profit & Loss",
  get_cash_flow: "Cash Flow",
  get_general_ledger: "General Ledger",
  get_journal_entries: "Journal Entries",
  get_account_statement: ["Customer Statement", "Supplier Statement"],
  list_accounts: "Chart of Accounts",
};

export const filterToolsByPermissions = (
  tools: OpenAIToolDefinition[],
  allowedModules: string[],
): OpenAIToolDefinition[] => {
  if (!allowedModules.length) {
    return tools;
  }

  return tools.filter(tool => {
    const module = TOOL_PERMISSION_MODULES[tool.function.name];
    if (!module) {
      return true;
    }
    const modules = Array.isArray(module) ? module : [module];
    return modules.some(name => allowedModules.includes(name))
      || allowedModules.includes("AI Report");
  });
};
