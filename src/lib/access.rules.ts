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
    children: ['Orders', 'Cancel order', 'Split by seats', 'Split by items', 'Split by amount', 'Merge orders', 'Refund order', 'Print final copy', 'Print temp bill', 'Apply tax', 'Apply discount', 'Apply coupon', 'Apply service charges', 'Apply tips', 'Change extras', 'Complete order'] as string[]
  },
  "Summary": {
    label: "Summary",
    children: ['Summary', 'Print summary', 'Product mix report', 'Server sales'] as string[]
  },
  "Reports": {
    label: "Reports",
    children: ['Reports', "Delivery Density", "Cash closing", "Sales dashboard", "Inventory dashboard", "Sales Hourly Labour", "Sales Hourly Labour Weekly", "Server Sales", "Sales Summary", 'Sales Summary 2', 'Sales Weekly', 'Tips', 'Advanced Sales', 'Discount', 'Tax', 'Coupon', 'Voids', 'Merge Orders', 'Split Orders', 'Order Life Cycle', 'Expense', 'Activity', 'Product Mix Weekly', 'Product Mix Summary', 'Products Hourly', 'Current Inventory', 'Detailed Inventory', 'Purchase', 'Purchase Return', 'Issue', 'Issue Return', 'Waste', 'Consumption', 'Sale vs Inventory', 'AI Report'] as string[]
  },
  "Closing": {
    label: "Closing",
    children: ["Closing", "Edit Closing"] as string[]
  },
  "Kitchen": {
    label: "Kitchen",
    children: ['Kitchen'] as string[]
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
    children: ['Inventory', 'Current Inventory', 'Items', 'Suppliers', 'Item Categories', 'Stores', 'Item Groups', 'Purchase Orders', 'Purchases', 'Purchase Returns', 'Issues', 'Issue Returns', 'Wastes'] as string[]
  },
  'Settings': {
    label: 'Settings',
    children: ['Settings', 'Printers', 'Service charges', 'Auto check close', 'Closing cycle']
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
