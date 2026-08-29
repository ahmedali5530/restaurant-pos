import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import {normalizeModules} from "@/lib/access.rules.ts";
import {MANAGE_TOOL_PERMISSION_MODULES} from "@/lib/ai/tools/manage-permissions.ts";

/** Maps tool names to report permission modules. */
export const TOOL_PERMISSION_MODULES: Record<string, string | string[]> = {
  get_top_selling_dishes: "reports.product_mix_summary",
  get_sales_summary: "reports.sales_summary",
  get_product_mix: "reports.product_mix_summary",
  get_unsold_products: "reports.product_mix_summary",
  get_voids: "reports.voids",
  get_tips: "reports.tips",
  get_server_sales: "reports.server_sales",
  get_current_session_sales: "reports.server_sales",
  list_active_sessions: "reports.sales_hourly_labour",
  get_tax_summary: "reports.tax",
  get_discount_summary: "reports.discount",
  get_coupon_summary: "reports.coupon",
  get_weekly_sales: "reports.sales_weekly",
  get_hourly_product_sales: "reports.products_hourly",
  get_current_inventory: "reports.current_inventory",
  get_inventory_movements: ["reports.purchase", "reports.issue", "reports.waste", "inventory.adjustments", "reports.current_inventory"],
  get_inventory_documents: [
    "reports.purchase",
    "reports.purchase_return",
    "reports.issue",
    "reports.issue_return",
    "reports.waste",
    "inventory.adjustments",
    "reports.current_inventory",
  ],
  get_consumption: "reports.consumption",
  get_issuance: "reports.sale_vs_inventory",
  get_waste_summary: "reports.waste",
  get_sale_vs_consumption: "reports.sale_vs_inventory",
  get_kitchen_reconciliation: "reports.kitchen_reconciliation",
  get_purchase_orders: ["reports.purchase_order", "inventory.purchase_orders"],
  get_expenses: "reports.expense",
  get_activity_log: "reports.activity",
  get_cash_closing: "reports.cash_closing",
  get_order_lifecycle: "reports.order_life_cycle",
  get_orders: "reports.order_life_cycle",
  get_order_detail: "reports.order_life_cycle",
  get_time_series: "reports.sales_summary",
  forecast_sales: "reports.sales_summary",
  forecast_inventory: "reports.current_inventory",
  forecast_inventory_need: "reports.current_inventory",
  forecast_staff_need: "reports.labor_forecast_dataset",
  compare_periods: "reports.sales_summary",
  get_dashboard_snapshot: "reports.sales_dashboard",
  render_chart: "reports.ai",
  resolve_date_range: "reports.ai",
  list_staff: "reports.ai",
  list_categories: "reports.ai",
  list_menu_items: ["admin.dishes", "reports.product_mix_summary"],
  list_inventory_items: "reports.current_inventory",
  get_labor_dashboard_snapshot: "reports.labor_dashboard",
  get_daily_labor_cost: "reports.daily_labor_cost",
  get_labor_percent: "reports.labor_percent",
  get_overtime_report: "reports.overtime",
  get_attendance_report: "reports.attendance",
  get_payroll_summary: "reports.payroll_summary",
  get_scheduled_vs_actual: "reports.scheduled_vs_actual",
  get_labor_trend: "reports.labor_trend",
  get_ai_labor_datasets: "reports.labor_dashboard",
  get_hourly_labor_vs_sales: "reports.sales_hourly_labour",
  get_server_ticket_times: "reports.server_sales",
  get_staff_accountability_metrics: "reports.server_sales",
  get_menu_engineering_matrix: "reports.product_mix_summary",
  get_menu_sales_trends: "reports.product_mix_summary",
  estimate_price_change_impact: "reports.product_mix_summary",
  get_void_and_cancel_summary: "reports.voids",
  get_prep_times_by_order_type: "reports.order_life_cycle",
  get_kitchen_station_delays: "reports.order_life_cycle",
  get_cash_settlement_audit: "reports.activity",
  get_trial_balance: "accounts.trial_balance",
  get_balance_sheet: "accounts.balance_sheet",
  get_profit_loss: "accounts.profit_loss",
  get_cash_flow: "accounts.cash_flow",
  get_general_ledger: "accounts.general_ledger",
  get_journal_entries: "accounts.journal_entries",
  get_account_statement: ["accounts.customer_statement", "accounts.supplier_statement"],
  list_accounts: "accounts.chart_of_accounts",
  ...MANAGE_TOOL_PERMISSION_MODULES,
};

const hasReadModuleAccess = (module: string, normalizedAllowed: string[]): boolean => {
  if (normalizedAllowed.includes(module) || normalizedAllowed.includes("reports.ai")) {
    return true;
  }
  if (module.startsWith("admin.")) {
    return normalizedAllowed.some(allowed => allowed === module || allowed.startsWith(`${module}.`));
  }
  return false;
};

export const filterToolsByPermissions = (
  tools: OpenAIToolDefinition[],
  allowedModules: string[],
): OpenAIToolDefinition[] => {
  const normalizedAllowed = normalizeModules(allowedModules);
  if (!normalizedAllowed.length) {
    return tools;
  }

  return tools.filter(tool => {
    const module = TOOL_PERMISSION_MODULES[tool.function.name];
    if (!module) {
      return true;
    }
    const modules = Array.isArray(module) ? module : [module];
    return modules.some(name => hasReadModuleAccess(name, normalizedAllowed));
  });
};
