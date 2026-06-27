import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

/** Maps tool names to report permission modules. */
export const TOOL_PERMISSION_MODULES: Record<string, string> = {
  get_top_selling_dishes: "Product Mix Summary",
  get_sales_summary: "Sales Summary",
  get_product_mix: "Product Mix Summary",
  get_unsold_products: "Product Mix Summary",
  get_voids: "Voids",
  get_tips: "Tips",
  get_server_sales: "Server Sales",
  get_tax_summary: "Tax",
  get_discount_summary: "Discount",
  get_coupon_summary: "Coupon",
  get_weekly_sales: "Sales Weekly",
  get_hourly_product_sales: "Products Hourly",
  get_current_inventory: "Current Inventory",
  get_inventory_movements: "Purchase",
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
    return allowedModules.includes(module) || allowedModules.includes("AI Report");
  });
};
