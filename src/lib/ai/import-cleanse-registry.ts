import type {ImportConfiguration, ImportDbLike} from "@/lib/data-import/types.ts";
import {hasWritePermissionModule} from "@/lib/ai/tools/write-permissions.ts";
import {createDishImportConfig} from "@/components/settings/dishes/dish.import.config.ts";
import {createDishIngredientsImportConfig} from "@/components/settings/dishes/dish-ingredients.import.config.ts";
import {createDishModifiersImportConfig} from "@/components/settings/dishes/dish-modifiers.import.config.ts";
import {createCategoryImportConfig} from "@/components/settings/categories/category.import.config.ts";
import {createTableImportConfig} from "@/components/settings/tables/table.import.config.ts";
import {createFloorImportConfig} from "@/components/settings/floors/floor.import.config.ts";
import {createTaxImportConfig} from "@/components/settings/taxes/tax.import.config.ts";
import {createOrderTypeImportConfig} from "@/components/settings/order_types/order-type.import.config.ts";
import {createPaymentTypeImportConfig} from "@/components/settings/payment_types/payment-type.import.config.ts";
import {createDiscountImportConfig} from "@/components/settings/discounts/discount.import.config.ts";
import {createModifierGroupImportConfig} from "@/components/settings/modifier_groups/modifier-group.import.config.ts";
import {createKitchenImportConfig} from "@/components/settings/kitchens/kitchen.import.config.ts";
import {createExtraImportConfig} from "@/components/settings/extras/extra.import.config.ts";
import {createCouponImportConfig} from "@/components/settings/coupons/coupon.import.config.ts";
import {createMenuImportConfig} from "@/components/settings/menu/menu.import.config.ts";
import {createWorkflowImportConfig} from "@/components/settings/workflows/workflow.import.config.ts";
import {createPrinterImportConfig} from "@/components/settings/printers/printer.import.config.ts";
import {createUserImportConfig} from "@/components/settings/users/user.import.config.ts";
import {createRoleImportConfig} from "@/components/settings/users/roles/role.import.config.ts";
import {createShiftImportConfig} from "@/components/settings/users/shifts/shift.import.config.ts";
import {createInventoryItemImportConfig} from "@/components/inventory/items/item.import.config.ts";
import {createInventoryCategoryImportConfig} from "@/components/inventory/categories/inventory-category.import.config.ts";
import {createSupplierImportConfig} from "@/components/inventory/suppliers/supplier.import.config.ts";
import {createLocationImportConfig} from "@/components/inventory/locations/location.import.config.ts";
import {createEmployeeImportConfig} from "@/components/hr/employees/employee.import.config.ts";
import {createDepartmentImportConfig} from "@/components/hr/departments/department.import.config.ts";
import {createScheduledShiftImportConfig} from "@/components/hr/scheduling/scheduled-shift.import.config.ts";
import {createAttendanceImportConfig} from "@/components/hr/attendance/attendance.import.config.ts";
import {createAccountImportConfig} from "@/components/accounts/account.import.config.ts";
import {ADMIN, HR, INVENTORY, ACCOUNTS} from "@/routes/posr.ts";

type TFunc = (key: string, options?: any) => string;

export type ImportCleanseDomain = {
  id: string;
  /** i18n key under common:aiAssistant.cleanseDomains.* or plain label fallback */
  labelKey: string;
  labelDefault: string;
  /** Permission leaves — any one grants access (create/update/import or parent tab). */
  permissionModules: string[];
  /** Pathname substrings that preselect this domain. */
  pathHints: string[];
  createConfig: (opts: {db: ImportDbLike; t: TFunc}) => ImportConfiguration;
};

const domain = (
  partial: Omit<ImportCleanseDomain, "labelKey"> & {labelKey?: string},
): ImportCleanseDomain => ({
  labelKey: partial.labelKey ?? `aiAssistant.cleanseDomains.${partial.id}`,
  ...partial,
});

/**
 * UI ImportConfiguration factories that match AI Import screen CSV shapes.
 * Graph/AI-document forks (smart_menu, ai_inventory_*) are excluded from v1.
 */
export const IMPORT_CLEANSE_DOMAINS: ImportCleanseDomain[] = [
  domain({
    id: "dishes",
    labelDefault: "Dishes",
    permissionModules: ["admin.dishes", "admin.dishes.create", "admin.dishes.update", "admin.dishes.import"],
    pathHints: ["dishes", "menu"],
    createConfig: ({db, t}) => createDishImportConfig({db, t}),
  }),
  domain({
    id: "dish_ingredients",
    labelDefault: "Dish ingredients",
    permissionModules: ["admin.dishes", "admin.dishes.create", "admin.dishes.update", "admin.dishes.import"],
    pathHints: ["dishes", "ingredients"],
    createConfig: ({db, t}) => createDishIngredientsImportConfig({db, t}),
  }),
  domain({
    id: "dish_modifier_groups",
    labelDefault: "Dish modifiers",
    permissionModules: ["admin.dishes", "admin.dishes.create", "admin.dishes.update"],
    pathHints: ["dishes", "modifier"],
    createConfig: ({db, t}) => createDishModifiersImportConfig({db, t}),
  }),
  domain({
    id: "categories",
    labelDefault: "Menu categories",
    permissionModules: ["admin.categories", "admin.categories.create", "admin.categories.update"],
    pathHints: ["categories"],
    createConfig: ({db, t}) => createCategoryImportConfig({db, t}),
  }),
  domain({
    id: "tables",
    labelDefault: "Tables",
    permissionModules: ["admin.tables", "admin.tables.create", "admin.tables.update"],
    pathHints: ["tables"],
    createConfig: ({db, t}) => createTableImportConfig({db, t}),
  }),
  domain({
    id: "floors",
    labelDefault: "Floors",
    permissionModules: ["admin.floors", "admin.floors.create", "admin.floors.update"],
    pathHints: ["floors"],
    createConfig: ({db, t}) => createFloorImportConfig({db, t}),
  }),
  domain({
    id: "taxes",
    labelDefault: "Taxes",
    permissionModules: ["admin.taxes", "admin.taxes.create", "admin.taxes.update"],
    pathHints: ["taxes"],
    createConfig: ({db, t}) => createTaxImportConfig({db, t}),
  }),
  domain({
    id: "order_types",
    labelDefault: "Order types",
    permissionModules: ["admin.order_types", "admin.order_types.create", "admin.order_types.update"],
    pathHints: ["order-types", "order_types"],
    createConfig: ({db, t}) => createOrderTypeImportConfig({db, t}),
  }),
  domain({
    id: "payment_types",
    labelDefault: "Payment types",
    permissionModules: ["admin.payment_types", "admin.payment_types.create", "admin.payment_types.update"],
    pathHints: ["payment"],
    createConfig: ({db, t}) => createPaymentTypeImportConfig({db, t}),
  }),
  domain({
    id: "discounts",
    labelDefault: "Discounts",
    permissionModules: ["admin.discounts", "admin.discounts.create", "admin.discounts.update"],
    pathHints: ["discount"],
    createConfig: ({db, t}) => createDiscountImportConfig({db, t}),
  }),
  domain({
    id: "modifier_groups",
    labelDefault: "Modifier groups",
    permissionModules: ["admin.modifier_groups", "admin.modifier_groups.create", "admin.modifier_groups.update"],
    pathHints: ["modifier"],
    createConfig: ({db, t}) => createModifierGroupImportConfig({db, t}),
  }),
  domain({
    id: "kitchens",
    labelDefault: "Kitchens",
    permissionModules: ["admin.kitchens", "admin.kitchens.create", "admin.kitchens.update"],
    pathHints: ["kitchen"],
    createConfig: ({db, t}) => createKitchenImportConfig({db, t}),
  }),
  domain({
    id: "extras",
    labelDefault: "Extras",
    permissionModules: ["admin.extras", "admin.extras.create", "admin.extras.update"],
    pathHints: ["extras"],
    createConfig: ({db, t}) => createExtraImportConfig({db, t}),
  }),
  domain({
    id: "coupons",
    labelDefault: "Coupons",
    permissionModules: ["admin.coupons", "admin.coupons.create", "admin.coupons.update"],
    pathHints: ["coupon"],
    createConfig: ({db, t}) => createCouponImportConfig({db, t}),
  }),
  domain({
    id: "menus",
    labelDefault: "Menus",
    permissionModules: ["admin.menus", "admin.menus.create", "admin.menus.update"],
    pathHints: ["menus"],
    createConfig: ({db, t}) => createMenuImportConfig({db, t}),
  }),
  domain({
    id: "workflows",
    labelDefault: "Workflows",
    permissionModules: ["admin.workflows", "admin.workflows.create", "admin.workflows.update"],
    pathHints: ["workflow"],
    createConfig: ({db, t}) => createWorkflowImportConfig({db, t}),
  }),
  domain({
    id: "printers",
    labelDefault: "Printers",
    permissionModules: ["admin.printers", "admin.printers.create", "admin.printers.update"],
    pathHints: ["printer"],
    createConfig: ({db, t}) => createPrinterImportConfig({db, t}),
  }),
  domain({
    id: "users",
    labelDefault: "Users",
    permissionModules: ["admin.users", "admin.users.create", "admin.users.update"],
    pathHints: ["users"],
    createConfig: ({db, t}) => createUserImportConfig({db, t}),
  }),
  domain({
    id: "roles",
    labelDefault: "Roles",
    permissionModules: ["admin.roles", "admin.roles.create", "admin.roles.update"],
    pathHints: ["roles"],
    createConfig: ({db, t}) => createRoleImportConfig({db, t}),
  }),
  domain({
    id: "shifts",
    labelDefault: "Shifts",
    permissionModules: ["admin.shifts", "admin.shifts.create", "admin.shifts.update"],
    pathHints: ["shifts"],
    createConfig: ({db, t}) => createShiftImportConfig({db, t}),
  }),
  domain({
    id: "inventory_items",
    labelDefault: "Inventory items",
    permissionModules: ["inventory.items", "inventory.items.create", "inventory.items.update", "inventory"],
    pathHints: ["inventory/items", "items"],
    createConfig: ({db, t}) => createInventoryItemImportConfig({db, t}),
  }),
  domain({
    id: "inventory_categories",
    labelDefault: "Inventory categories",
    permissionModules: ["inventory.categories", "inventory.categories.create", "inventory"],
    pathHints: ["inventory/categories"],
    createConfig: ({db, t}) => createInventoryCategoryImportConfig({db, t}),
  }),
  domain({
    id: "inventory_suppliers",
    labelDefault: "Suppliers",
    permissionModules: ["inventory.suppliers", "inventory.suppliers.create", "inventory"],
    pathHints: ["supplier"],
    createConfig: ({db, t}) => createSupplierImportConfig({db, t}),
  }),
  domain({
    id: "inventory_locations",
    labelDefault: "Locations",
    permissionModules: ["inventory.locations", "inventory.locations.create", "inventory"],
    pathHints: ["location"],
    createConfig: ({db, t}) => createLocationImportConfig({db, t}),
  }),
  domain({
    id: "employees",
    labelDefault: "Employees",
    permissionModules: ["hr.employees", "hr.employees.create", "hr.employees.update", "hr"],
    pathHints: ["employee", "/hr"],
    createConfig: ({db, t}) => createEmployeeImportConfig({db, t}),
  }),
  domain({
    id: "departments",
    labelDefault: "Departments",
    permissionModules: ["hr.departments", "hr.departments.create", "hr"],
    pathHints: ["department"],
    createConfig: ({db, t}) => createDepartmentImportConfig({db, t}),
  }),
  domain({
    id: "scheduled_shifts",
    labelDefault: "Scheduled shifts",
    permissionModules: ["hr.scheduling", "hr.scheduling.create", "hr"],
    pathHints: ["schedul"],
    createConfig: ({db, t}) => createScheduledShiftImportConfig({db, t}),
  }),
  domain({
    id: "time_entries",
    labelDefault: "Attendance",
    permissionModules: ["hr.attendance", "hr.attendance.create", "hr"],
    pathHints: ["attendance"],
    createConfig: ({db, t}) => createAttendanceImportConfig({db, t}),
  }),
  domain({
    id: "accounts",
    labelDefault: "Chart of accounts",
    permissionModules: ["accounts", "accounts.accounts", "accounts.accounts.create"],
    pathHints: ["accounts", "/accounts"],
    createConfig: ({db, t}) => createAccountImportConfig({db, t}),
  }),
];

export const getImportCleanseDomain = (id: string): ImportCleanseDomain | undefined =>
  IMPORT_CLEANSE_DOMAINS.find(entry => entry.id === id);

const moduleMatchesAllowed = (module: string, allowedModules: string[]): boolean => {
  if (hasWritePermissionModule(module, allowedModules)) {
    return true;
  }
  // Broad tab grants (e.g. "inventory", "hr", "admin") should unlock related cleanse domains.
  return allowedModules.some(allowed =>
    allowed === module
    || module.startsWith(`${allowed}.`)
    || allowed.startsWith(`${module}.`),
  );
};

export const listPermittedImportCleanseDomains = (
  allowedModules: string[],
): ImportCleanseDomain[] =>
  IMPORT_CLEANSE_DOMAINS.filter(entry =>
    entry.permissionModules.some(module => moduleMatchesAllowed(module, allowedModules)),
  );

/** Best domain id for the current route, if any. */
export const suggestImportCleanseDomainId = (
  pathname: string,
  domains: ImportCleanseDomain[],
): string | undefined => {
  const path = (pathname || "").toLowerCase();
  if (!path) {
    return undefined;
  }
  // Prefer longer / more specific hints.
  let best: {id: string; score: number} | undefined;
  for (const entry of domains) {
    for (const hint of entry.pathHints) {
      if (path.includes(hint.toLowerCase())) {
        const score = hint.length;
        if (!best || score > best.score) {
          best = {id: entry.id, score};
        }
      }
    }
  }
  // Route-level defaults when no hint matched.
  if (!best) {
    if (path.startsWith(INVENTORY) || path.includes("/inventory")) {
      return domains.find(d => d.id === "inventory_items")?.id;
    }
    if (path.startsWith(HR) || path.includes("/hr")) {
      return domains.find(d => d.id === "employees")?.id;
    }
    if (path.startsWith(ACCOUNTS) || path.includes("/accounts")) {
      return domains.find(d => d.id === "accounts")?.id;
    }
    if (path === ADMIN || path.includes("/admin")) {
      return domains.find(d => d.id === "dishes")?.id;
    }
  }
  return best?.id;
};
