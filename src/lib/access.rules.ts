import { User } from "@/api/model/user.ts";

export const ACCESS_RULE_MODULES: Record<string, AccessRuleModule> = {
  "Menu": {
    label: "Menu",
    children: [
      'Change table'
    ] as string[]
  },
  "Orders": {
    label: "Orders", 
    children: ['Orders', 'Cancel order', 'Split by seats', 'Split by items', 'Split by amount', 'Merge orders', 'Refund order', 'Print final copy', 'Print temp bill', 'Open cash drawer', 'Apply tax', 'Apply discount', 'Apply coupon', 'Apply service charges', 'Apply tips', 'Change extras', 'Complete order'] as string[]
  },
  "Summary": {
    label: "Summary",
    children: ['Summary', 'Print summary', 'Product mix report', 'Server sales'] as string[]
  },
  "Reports": {
    label: "Reports",
    children: ['Reports', "Delivery Density", "Cash closing", "Sales dashboard", "Inventory dashboard", "Sales Hourly Labour", "Sales Hourly Labour Weekly", "Server Sales", "Sales Summary", 'Sales Summary 2', 'Sales Weekly', 'Tips', 'Advanced Sales', 'Discount', 'Tax', 'Coupon', 'Voids', 'Merge Orders', 'Split Orders', 'Order Life Cycle', 'Expense', 'Activity', 'Product Mix Weekly', 'Product Mix Summary', 'Products Hourly', 'Current Inventory', 'Detailed Inventory', 'Purchase', 'Purchase Return', 'Issue', 'Issue Return', 'Waste', 'Consumption', 'Sale vs Inventory', 'Kitchen Reconciliation', 'Production Report', 'Buffet Report', 'AI Report', 'Labor Dashboard', 'Daily Labor Cost', 'Weekly Labor Cost', 'Monthly Labor Cost', 'Employee Labor Cost', 'Department Labor Cost', 'Cost Center Labor Cost', 'Average Hourly Cost', 'Labor Percent', 'Sales Per Labor Hour', 'Revenue Per Employee', 'Overtime Report', 'Attendance Report', 'Late Arrival Report', 'Absence Report', 'Leave Report', 'Holiday Cost Report', 'Scheduled vs Actual', 'Manager Approval Report', 'Top Labor Cost Employees', 'Top Overtime Employees', 'Payroll Summary', 'Payroll Details', 'Labor Trend', 'Labor Forecast Dataset'] as string[]
  },
  "Closing": {
    label: "Closing",
    children: ["Closing", "Edit Closing"] as string[]
  },
  "Kitchen": {
    label: "Kitchen",
    children: ['Kitchen'] as string[]
  },
  "Order Display": {
    label: "Order Display",
    children: ['Order Display'] as string[]
  },
  "Delivery": {
    label: "Delivery",
    children: ['Delivery', "Delivery orders", "Delivery areas", "Delivery settings"] as string[]
  },
  "Admin": {
    label: "Administration",
    children: ['Admin', "Dishes", "Menus", "Categories", 'Modifier Groups', 'Tables', 'Floors', 'Discounts', 'Coupons', 'Kitchens', 'Workflows', 'Printers', 'Print settings', 'Order Types', 'Payment Types', 'Extras', 'Taxes', 'Users', 'Roles', 'Shifts', 'Tips definition'] as string[]
  },
  "Riders": {
    label: "Riders",
    children: [] as string[]
  },
  "Tips": {
    label: "Tip Distribution",
    children: ['Tips', "Tip Calculation", "Payout Management"] as string[]
  },
  'Inventory': {
    label: 'Inventory',
    children: [
      'Inventory', 'Current Inventory', 'Items', 'Suppliers', 'Item Categories', 'Item Groups', 'Locations',
      'Purchase Orders', 'Edit Purchase Orders', 'Delete Purchase Orders',
      'Purchases', 'Edit Purchases', 'Delete Purchases',
      'Purchase Returns', 'Edit Purchase Returns', 'Delete Purchase Returns',
      'Issues', 'Edit Issues', 'Delete Issues',
      'Issue Returns', 'Edit Issue Returns', 'Delete Issue Returns',
      'Wastes', 'Edit Wastes', 'Delete Wastes',
      'Adjustments', 'Edit Adjustments', 'Delete Adjustments',
      'Stock Transfers', 'Edit Stock Transfers',
      'Kitchen Reconciliation', 'Production Recipes', 'Production', 'Production History', 'Buffet Menus', 'Buffet Sessions',
    ] as string[]
  },
  'HR': {
    label: 'HR',
    children: [
      'HR',
      'HR Dashboard',
      'Employees',
      'Departments',
      'Positions',
      'Cost Centers',
      'Pay Profiles',
      'Pay Rules',
      'Scheduling',
      'Attendance',
      'Leave',
      'Holidays',
      'Payroll Periods',
      'Payroll Runs',
      'Adjustments',
      'Documents',
      'Performance',
    ] as string[]
  },
  'Settings': {
    label: 'Settings',
    children: ['Settings', 'Printers', 'Service charges', 'Auto check close', 'Closing cycle', 'Session security', 'Auto clock-out', 'Show inclusive prices', 'Access control', 'Inventory Settings']
  },
  'Accounts': {
    label: 'Accounts',
    children: [
      'Accounts',
      'Chart of Accounts',
      'Account Groups',
      'Journal Entries',
      'General Ledger',
      'Trial Balance',
      'Balance Sheet',
      'Profit & Loss',
      'Cash Flow',
      'Customer Statement',
      'Supplier Statement',
    ] as string[]
  },
  'Integrations': {
    label: 'Integrations',
    children: [
      'Integrations',
      'Integration providers',
      'Integration configuration',
      'Integration health',
      'Integration queue',
    ] as string[]
  }
};

export type AccessRuleModule = {
  label: string;
  children: string[];
};

export const getUserModules = (user?: User): string[] => {
  if (!user) return [];

  const modulesFromRoles = user.user_role?.roles || [];
  const modules = [...modulesFromRoles, ...(user.roles || [])];

  return [...new Set(modules)];
};
