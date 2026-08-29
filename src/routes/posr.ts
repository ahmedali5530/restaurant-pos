export const LOGIN = '/';
export const MENU = '/menu';
export const ORDERS = '/orders';
export const SUMMARY = '/summary';
export const KITCHEN = '/kitchen';
export const ORDER_DISPLAY = '/order-display';
export const DELIVERY = '/delivery';
export const CLOSING = '/closing';
export const ADMIN = '/admin';
export const SETTINGS = '/settings';
export const INTEGRATIONS = '/integrations';
export const CLOCK = '/clock';
export const TABLESIDE = '/tableside';
export const INVENTORY = '/inventory';
export const INVENTORY_PRINT = '/inventory/print/:type/:id';

export type InventoryPrintDocType =
  | 'purchase'
  | 'purchase-return'
  | 'purchase-order'
  | 'issue'
  | 'issue-return'
  | 'waste'
  | 'stock-transfer';

export const inventoryPrintUrl = (type: InventoryPrintDocType, id: string | {toString(): string}) => {
  const raw = typeof id === 'string' ? id : id.toString();
  const encodedId = encodeURIComponent(raw);
  return `/inventory/print/${type}/${encodedId}`;
};
export const HR = '/hr';
export const TIP_DISTRIBUTION = '/tip-distribution';
export const ACCOUNTS = '/accounts';

export const REPORTS = '/reports';
export const REPORTS_PRODUCT_MIX_WEEKLY = REPORTS + '/product-mix-weekly';
export const REPORTS_SALES_DASHBOARD = REPORTS + '/sales-dashboard';
export const REPORTS_INVENTORY_DASHBOARD = REPORTS + '/inventory-dashboard';
export const REPORTS_AUDIT = REPORTS + '/audit';
export const REPORTS_CASH_CLOSING = REPORTS + '/cash-closing';
export const REPORTS_DISCOUNTS = REPORTS + '/discounts';
export const REPORTS_TAX = REPORTS + '/tax';
export const REPORTS_COUPON = REPORTS + '/coupon';
export const REPORTS_MERGE_ORDERS = REPORTS + '/merge-orders';
export const REPORTS_SPLIT_ORDERS = REPORTS + '/split-orders';
export const REPORTS_ORDER_LIFECYCLE = REPORTS + '/order-lifecycle';
export const REPORTS_ORDER_RECEIPT = REPORTS + '/order-receipt';
export const REPORTS_ORDER_FISCAL = REPORTS + '/order-fiscal';

export type OrderReceiptUrlParams = {
  id?: string | {toString(): string};
  orderId?: string | number;
  invoice?: string | number;
};

export const orderReceiptUrl = (params: OrderReceiptUrlParams = {}) => {
  const search = new URLSearchParams();
  if (params.id != null && params.id !== '') {
    const raw = typeof params.id === 'string' ? params.id : params.id.toString();
    if (raw) {
      search.set('id', raw);
    }
  }
  if (params.orderId != null && params.orderId !== '') {
    search.set('order_id', String(params.orderId));
  }
  if (params.invoice != null && params.invoice !== '') {
    search.set('invoice', String(params.invoice));
  }
  const qs = search.toString();
  return qs ? `${REPORTS_ORDER_RECEIPT}?${qs}` : REPORTS_ORDER_RECEIPT;
};
export const REPORTS_EXPENSE = REPORTS + '/expense';
export const REPORTS_ACTIVITY = REPORTS + '/activity';
export const REPORTS_PRODUCT_HOURLY = REPORTS + '/product-hourly';
export const REPORTS_PRODUCT_LIST = REPORTS + '/product-list';
export const REPORTS_PRODUCT_MIX_SUMMARY = REPORTS + '/product-mix-summary';
export const REPORTS_SALES_ADVANCED = REPORTS + '/sales-advanced';
export const REPORTS_DELIVERY_DENSITY = REPORTS + '/delivery-density';
export const REPORTS_SALES_HOURLY_LABOUR = REPORTS + '/sales-hourly-labour';
export const REPORTS_SALES_HOURLY_LABOUR_WEEKLY = REPORTS + '/sales-hourly-labour-weekly';
export const REPORTS_SALES_SERVER = REPORTS + '/sales-server';
export const REPORTS_SALES_SUMMARY = REPORTS + '/sales-summary';
export const REPORTS_SALES_SUMMARY2 = REPORTS + '/sales-summary-2';
export const REPORTS_SALES_WEEKLY = REPORTS + '/sales-weekly';
export const REPORTS_TIPS = REPORTS + '/tips';
export const REPORTS_TABLES_SUMMARY = REPORTS + '/tables-summary';
export const REPORTS_VOIDS = REPORTS + '/voids';
export const REPORTS_CURRENT_INVENTORY = REPORTS + '/current-inventory';
export const REPORTS_DETAILED_INVENTORY = REPORTS + '/detailed-inventory';
export const REPORTS_PURCHASE = REPORTS + '/purchase';
export const REPORTS_PURCHASE_ORDER = REPORTS + '/purchase-order';
export const REPORTS_PURCHASE_RETURN = REPORTS + '/purchase-return';
export const REPORTS_ISSUE = REPORTS + '/issue';
export const REPORTS_ISSUE_RETURN = REPORTS + '/issue-return';
export const REPORTS_WASTE = REPORTS + '/waste';
export const REPORTS_CONSUMPTION = REPORTS + '/consumption';
export const REPORTS_SALE_VS_CONSUMPTION = REPORTS + '/sale-vs-consumption';
export const REPORTS_KITCHEN_RECONCILIATION = REPORTS + '/kitchen-reconciliation';
export const REPORTS_PRODUCTION = REPORTS + '/production';
export const REPORTS_BUFFET = REPORTS + '/buffet';
export const REPORTS_AI = REPORTS + '/ai';
export const REPORTS_FORECAST = REPORTS + '/forecast';
export const REPORTS_MENU_OPTIMIZATION = REPORTS + '/menu-optimization';
export const REPORTS_SENTIMENT = REPORTS + '/sentiment';
export const REPORTS_WASTE_INTELLIGENCE = REPORTS + '/waste-intelligence';
export const REPORTS_SCHEDULING_OPTIMIZATION = REPORTS + '/scheduling-optimization';
export const REPORTS_CASH_FLOW = REPORTS + '/cash-flow';
export const REPORTS_VENDOR_PERFORMANCE = REPORTS + '/vendor-performance';
export const REPORTS_TABLE_TURNOVER = REPORTS + '/table-turnover';
export const REPORTS_DYNAMIC_PRICING = REPORTS + '/dynamic-pricing';
export const REPORTS_FORECAST_ACCURACY = REPORTS + '/forecast-accuracy';
export const REPORTS_UPSELL_EFFECTIVENESS = REPORTS + '/upsell-effectiveness';
export const REPORTS_AI_COMMAND_CENTER = REPORTS + '/ai-command-center';
export const REPORTS_ANOMALY_ALERTS = REPORTS + '/anomaly-alerts';
export const REPORTS_CUSTOMER_CLV = REPORTS + '/customer-clv';

export const REPORTS_LABOR_DASHBOARD = REPORTS + '/labor-dashboard';
export const REPORTS_LABOR_DAILY_COST = REPORTS + '/labor-daily-cost';
export const REPORTS_LABOR_WEEKLY_COST = REPORTS + '/labor-weekly-cost';
export const REPORTS_LABOR_MONTHLY_COST = REPORTS + '/labor-monthly-cost';
export const REPORTS_LABOR_EMPLOYEE_COST = REPORTS + '/labor-employee-cost';
export const REPORTS_LABOR_DEPARTMENT_COST = REPORTS + '/labor-department-cost';
export const REPORTS_LABOR_COST_CENTER_COST = REPORTS + '/labor-cost-center-cost';
export const REPORTS_LABOR_OVERTIME = REPORTS + '/labor-overtime';
export const REPORTS_LABOR_ATTENDANCE = REPORTS + '/labor-attendance';
export const REPORTS_LABOR_LATE_ARRIVAL = REPORTS + '/labor-late-arrival';
export const REPORTS_LABOR_ABSENCE = REPORTS + '/labor-absence';
export const REPORTS_LABOR_LEAVE = REPORTS + '/labor-leave';
export const REPORTS_LABOR_HOLIDAY_COST = REPORTS + '/labor-holiday-cost';
export const REPORTS_LABOR_SCHEDULED_VS_ACTUAL = REPORTS + '/labor-scheduled-vs-actual';
export const REPORTS_LABOR_SCHEDULE_ROSTER = REPORTS + '/labor-schedule-roster';
export const REPORTS_LABOR_MANAGER_APPROVAL = REPORTS + '/labor-manager-approval';
export const REPORTS_LABOR_PAYROLL_SUMMARY = REPORTS + '/labor-payroll-summary';
export const REPORTS_LABOR_PAYROLL_DETAILS = REPORTS + '/labor-payroll-details';
export const REPORTS_LABOR_TREND = REPORTS + '/labor-trend';
export const REPORTS_LABOR_FORECAST = REPORTS + '/labor-forecast';