'use strict';

/**
 * Remap user_role.roles / user.roles from legacy English permission strings
 * to hierarchical section.resource[.action] IDs.
 *
 * Usage:
 *   NODE_PATH=./payments/node_modules \
 *   SURREAL_URL=ws://YOUR_SURREAL_HOST:8000/rpc \
 *   SURREAL_NS=posr SURREAL_DB=posr SURREAL_USER=root SURREAL_PASS=root \
 *   node migrations/scripts/backfill-access-modules.cjs
 *
 * Env:
 *   DRY_RUN=1 — count only, do not write
 */

const WS = require('ws');
const { Surreal, StringRecordId } = require('surrealdb');
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER || 'root';
const DB_PASS = process.env.SURREAL_PASS || 'root';
const DRY_RUN = process.env.DRY_RUN === '1';

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

const toId = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const asString = value.toString();
    if (asString && asString !== '[object Object]' && asString.includes(':')) {
      return asString;
    }
  }
  if (typeof value === 'object' && value.tb != null && value.id != null) {
    return `${value.tb}:${value.id}`;
  }
  return String(value);
};

/** Keep in sync with src/lib/access.rules.ts LEGACY_MODULE_MAP */
const LEGACY_MODULE_MAP = {
  Menu: 'menu',
  Orders: 'orders',
  Summary: 'summary',
  Reports: 'reports',
  Closing: 'closing',
  Kitchen: 'kitchen',
  'Order Display': 'order_display',
  Delivery: 'delivery',
  Admin: 'admin',
  Riders: 'riders',
  Tips: ['tips', 'reports.tips'],
  Inventory: 'inventory',
  HR: 'hr',
  Settings: 'settings',
  Accounts: 'accounts',
  Integrations: 'integrations',
  'Change table': 'menu.change_table',
  'Cancel order': 'orders.cancel',
  'Split by seats': 'orders.split_by_seats',
  'Split order by seats': 'orders.split_by_seats',
  'Split by items': 'orders.split_by_items',
  'Split order by items': 'orders.split_by_items',
  'Split by amount': 'orders.split_by_amount',
  'Split order by amount': 'orders.split_by_amount',
  'Merge orders': 'orders.merge',
  'Refund order': 'orders.refund',
  'Print final copy': 'orders.print_final',
  'Print temp bill': 'orders.print_temp',
  'Override print limit': 'orders.override_print_limit',
  'Open cash drawer': 'orders.open_cash_drawer',
  'Apply tax': 'orders.apply_tax',
  'Apply discount': 'orders.apply_discount',
  'Apply coupon': 'orders.apply_coupon',
  'Apply service charges': 'orders.apply_service_charges',
  'Apply tips': 'orders.apply_tips',
  'Change extras': 'orders.change_extras',
  'Complete order': 'orders.complete',
  'Complete order payment': 'orders.complete_payment',
  'Update order payment details': 'orders.update_payment',
  'Move order table': 'orders.move_table',
  'Create remote payment intent': 'orders.remote_payment_create',
  'Verify remote payment': 'orders.remote_payment_verify',
  'Print summary': 'summary.print',
  'Product mix report': 'summary.product_mix',
  'Server sales': 'summary.server_sales',
  'Delivery Density': 'reports.delivery_density',
  'Cash closing': 'reports.cash_closing',
  'Sales dashboard': 'reports.sales_dashboard',
  'Inventory dashboard': 'reports.inventory_dashboard',
  'Sales Hourly Labour': 'reports.sales_hourly_labour',
  'Sales Hourly Labour Weekly': 'reports.sales_hourly_labour_weekly',
  'Server Sales': 'reports.server_sales',
  'Sales Summary': 'reports.sales_summary',
  'Sales Summary 2': 'reports.sales_summary_2',
  'Sales Weekly': 'reports.sales_weekly',
  'Advanced Sales': 'reports.advanced_sales',
  Discount: 'reports.discount',
  Tax: 'reports.tax',
  Coupon: 'reports.coupon',
  Voids: 'reports.voids',
  'Merge Orders': 'reports.merge_orders',
  'Split Orders': 'reports.split_orders',
  'Order Life Cycle': 'reports.order_life_cycle',
  Expense: 'reports.expense',
  Activity: 'reports.activity',
  'Product Mix Weekly': 'reports.product_mix_weekly',
  'Product Mix Summary': 'reports.product_mix_summary',
  'Products Hourly': 'reports.products_hourly',
  'Current Inventory': ['inventory.current_inventory', 'reports.current_inventory'],
  'Detailed Inventory': 'reports.detailed_inventory',
  Purchase: 'reports.purchase',
  'Purchase Order': 'reports.purchase_order',
  'Purchase Return': 'reports.purchase_return',
  Issue: 'reports.issue',
  'Issue Return': 'reports.issue_return',
  Waste: 'reports.waste',
  Consumption: 'reports.consumption',
  'Sale vs Inventory': 'reports.sale_vs_inventory',
  'Kitchen Reconciliation': ['inventory.kitchen_reconciliation', 'reports.kitchen_reconciliation'],
  'Production Report': 'reports.production',
  'Buffet Report': 'reports.buffet',
  'AI Report': 'reports.ai',
  'Labor Dashboard': 'reports.labor_dashboard',
  'Daily Labor Cost': 'reports.daily_labor_cost',
  'Weekly Labor Cost': 'reports.weekly_labor_cost',
  'Monthly Labor Cost': 'reports.monthly_labor_cost',
  'Employee Labor Cost': 'reports.employee_labor_cost',
  'Department Labor Cost': 'reports.department_labor_cost',
  'Cost Center Labor Cost': 'reports.cost_center_labor_cost',
  'Average Hourly Cost': 'reports.average_hourly_cost',
  'Labor Percent': 'reports.labor_percent',
  'Sales Per Labor Hour': 'reports.sales_per_labor_hour',
  'Revenue Per Employee': 'reports.revenue_per_employee',
  'Overtime Report': 'reports.overtime',
  'Attendance Report': 'reports.attendance',
  'Late Arrival Report': 'reports.late_arrival',
  'Absence Report': 'reports.absence',
  'Leave Report': 'reports.leave',
  'Holiday Cost Report': 'reports.holiday_cost',
  'Scheduled vs Actual': 'reports.scheduled_vs_actual',
  'Manager Approval Report': 'reports.manager_approval',
  'Top Labor Cost Employees': 'reports.top_labor_cost_employees',
  'Top Overtime Employees': 'reports.top_overtime_employees',
  'Payroll Summary': 'reports.payroll_summary',
  'Payroll Details': 'reports.payroll_details',
  'Labor Trend': 'reports.labor_trend',
  'Labor Forecast Dataset': 'reports.labor_forecast_dataset',
  'Edit Closing': 'closing.edit',
  'Delivery orders': 'delivery.orders',
  'Delivery areas': 'delivery.areas',
  'Delivery settings': 'delivery.settings',
  Dishes: 'admin.dishes',
  Menus: ['admin.menus', 'settings.menus'],
  Categories: 'admin.categories',
  'Modifier Groups': 'admin.modifier_groups',
  Tables: 'admin.tables',
  Floors: 'admin.floors',
  Discounts: 'admin.discounts',
  Coupons: 'admin.coupons',
  Kitchens: 'admin.kitchens',
  Workflows: 'admin.workflows',
  Printers: ['admin.printers', 'settings.printers'],
  'Print settings': 'admin.print_settings',
  'Order Types': 'admin.order_types',
  'Payment Types': 'admin.payment_types',
  Extras: 'admin.extras',
  Taxes: 'admin.taxes',
  Users: 'admin.users',
  Roles: 'admin.roles',
  Shifts: 'admin.shifts',
  'Tips definition': 'admin.tips_definition',
  'Tip Calculation': 'tips.calculation',
  'Payout Management': 'tips.payout',
  Items: 'inventory.items',
  Suppliers: 'inventory.suppliers',
  'Item Categories': 'inventory.item_categories',
  'Item Groups': 'inventory.item_groups',
  Locations: 'inventory.locations',
  Stores: 'inventory.locations',
  'Purchase Orders': 'inventory.purchase_orders',
  'Edit Purchase Orders': 'inventory.purchase_orders.update',
  'Delete Purchase Orders': 'inventory.purchase_orders.delete',
  'Approve Purchase Orders': 'inventory.purchase_orders.approve',
  Purchases: 'inventory.purchases',
  'Edit Purchases': 'inventory.purchases.update',
  'Delete Purchases': 'inventory.purchases.delete',
  'Purchase Returns': 'inventory.purchase_returns',
  'Edit Purchase Returns': 'inventory.purchase_returns.update',
  'Delete Purchase Returns': 'inventory.purchase_returns.delete',
  Issues: 'inventory.issues',
  'Edit Issues': 'inventory.issues.update',
  'Delete Issues': 'inventory.issues.delete',
  'Issue Returns': 'inventory.issue_returns',
  'Edit Issue Returns': 'inventory.issue_returns.update',
  'Delete Issue Returns': 'inventory.issue_returns.delete',
  Wastes: 'inventory.wastes',
  'Edit Wastes': 'inventory.wastes.update',
  'Delete Wastes': 'inventory.wastes.delete',
  Adjustments: ['inventory.adjustments', 'hr.adjustments'],
  'Edit Adjustments': 'inventory.adjustments.update',
  'Delete Adjustments': 'inventory.adjustments.delete',
  'Stock Transfers': 'inventory.stock_transfers',
  'Edit Stock Transfers': 'inventory.stock_transfers.update',
  'Production Recipes': 'inventory.production_recipes',
  Production: 'inventory.production',
  'Production History': 'inventory.production_history',
  'Buffet Menus': 'inventory.buffet_menus',
  'Buffet Sessions': 'inventory.buffet_sessions',
  'HR Dashboard': 'hr.dashboard',
  Employees: 'hr.employees',
  Departments: 'hr.departments',
  Positions: 'hr.positions',
  'Cost Centers': 'hr.cost_centers',
  'Pay Profiles': 'hr.pay_profiles',
  'Pay Rules': 'hr.pay_rules',
  Scheduling: 'hr.scheduling',
  Attendance: 'hr.attendance',
  Leave: 'hr.leave',
  Holidays: 'hr.holidays',
  'Payroll Periods': 'hr.payroll_periods',
  'Payroll Runs': 'hr.payroll_runs',
  Documents: 'hr.documents',
  Performance: 'hr.performance',
  'Print options': 'settings.print_options',
  'Service charges': 'settings.service_charges',
  'Auto check close': 'settings.auto_check_close',
  'Closing cycle': 'settings.closing_cycle',
  'Session security': 'settings.session_security',
  'Auto clock-out': 'settings.auto_clock_out',
  'Show inclusive prices': 'settings.show_inclusive_prices',
  'Access control': 'settings.access_control',
  'Inventory Settings': 'settings.inventory',
  'Translate receipts': 'settings.translate_receipts',
  'Chart of Accounts': 'accounts.chart_of_accounts',
  'Account Groups': 'accounts.account_groups',
  'Journal Entries': 'accounts.journal_entries',
  'General Ledger': 'accounts.general_ledger',
  'Trial Balance': 'accounts.trial_balance',
  'Balance Sheet': 'accounts.balance_sheet',
  'Profit & Loss': 'accounts.profit_loss',
  'Cash Flow': 'accounts.cash_flow',
  'Customer Statement': 'accounts.customer_statement',
  'Supplier Statement': 'accounts.supplier_statement',
  'Integration providers': 'integrations.providers',
  'Integration configuration': 'integrations.configuration',
  'Integration health': 'integrations.health',
  'Integration queue': 'integrations.queue',
};

const expand = (id) => {
  if (!id) return [];
  const mapped = LEGACY_MODULE_MAP[id];
  if (mapped == null) return [id];
  return Array.isArray(mapped) ? mapped : [mapped];
};

const normalizeModules = (modules) => {
  if (!Array.isArray(modules) || modules.length === 0) return [];
  const next = new Set();
  for (const mod of modules) {
    for (const expanded of expand(String(mod))) {
      next.add(expanded);
    }
  }
  return [...next];
};

const sameSet = (a, b) => {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
};

async function remapTable(db, table, stats) {
  const records = rows(await db.query(`SELECT id, roles FROM ${table}`));
  for (const row of records) {
    const before = Array.isArray(row.roles) ? row.roles.map(String) : [];
    if (!before.length) {
      stats.skipped += 1;
      continue;
    }
    const after = normalizeModules(before);
    if (sameSet(before, after)) {
      stats.unchanged += 1;
      continue;
    }
    stats.updated += 1;
    const unknown = after.filter((id) => !id.includes('.') && !LEGACY_MODULE_MAP[id] && !['menu','orders','summary','reports','closing','kitchen','order_display','delivery','admin','riders','tips','inventory','hr','settings','accounts','integrations'].includes(id));
    if (unknown.length) {
      stats.unknown.push({ id: toId(row.id), unknown });
    }
    if (!DRY_RUN) {
      await db.query('UPDATE $id SET roles = $roles', {
        id: new StringRecordId(toId(row.id)),
        roles: after,
      });
    }
  }
}

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  console.log(`Connected ${DB_URL} ${DB_NS}/${DB_NAME} DRY_RUN=${DRY_RUN}`);

  const stats = { updated: 0, unchanged: 0, skipped: 0, unknown: [] };

  await remapTable(db, 'user_role', stats);
  await remapTable(db, 'user', stats);

  console.log(JSON.stringify(stats, null, 2));
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
