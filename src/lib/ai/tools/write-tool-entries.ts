import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import type {AiReportToolDomain} from "@/lib/ai/tools/categories.ts";
import type {ImportConfiguration, ImportDbLike} from "@/lib/data-import/types.ts";
import {Tables} from "@/api/db/tables.ts";
import {createDishImportConfig} from "@/components/settings/dishes/dish.import.config.ts";
import {createCategoryImportConfig} from "@/components/settings/categories/category.import.config.ts";
import {createTableImportConfig} from "@/components/settings/tables/table.import.config.ts";
import {createDishModifiersImportConfig} from "@/components/settings/dishes/dish-modifiers.import.config.ts";
import {createDishIngredientsImportConfig} from "@/components/settings/dishes/dish-ingredients.import.config.ts";
import {createInventoryItemImportConfig} from "@/components/inventory/items/item.import.config.ts";
import {createScheduledShiftImportConfig} from "@/components/hr/scheduling/scheduled-shift.import.config.ts";
import {createFloorImportConfig} from "@/components/settings/floors/floor.import.config.ts";
import {createTaxImportConfig} from "@/components/settings/taxes/tax.import.config.ts";
import {createOrderTypeImportConfig} from "@/components/settings/order_types/order-type.import.config.ts";
import {createPaymentTypeImportConfig} from "@/components/settings/payment_types/payment-type.import.config.ts";
import {createDiscountImportConfig} from "@/components/settings/discounts/discount.import.config.ts";
import {createModifierGroupImportConfig} from "@/components/settings/modifier_groups/modifier-group.import.config.ts";
import {createKitchenImportConfig} from "@/components/settings/kitchens/kitchen.import.config.ts";
import {createExtraImportConfig} from "@/components/settings/extras/extra.import.config.ts";
import {createSmartMenuImportConfig} from "@/components/settings/dishes/smart-menu.import.config.ts";
import {createCouponImportConfig} from "@/components/settings/coupons/coupon.import.config.ts";
import {createMenuImportConfig} from "@/components/settings/menu/menu.import.config.ts";
import {createWorkflowImportConfig} from "@/components/settings/workflows/workflow.import.config.ts";
import {createPrinterImportConfig} from "@/components/settings/printers/printer.import.config.ts";
import {createPrintSettingsImportConfig} from "@/components/settings/prints/print-settings.import.config.ts";
import {createUserImportConfig} from "@/components/settings/users/user.import.config.ts";
import {createRoleImportConfig} from "@/components/settings/users/roles/role.import.config.ts";
import {createShiftImportConfig} from "@/components/settings/users/shifts/shift.import.config.ts";
import {createTipDistributionImportConfig} from "@/components/settings/prints/print-settings.import.config.ts";
import {createEmployeeImportConfig} from "@/components/hr/employees/employee.import.config.ts";
import {createDepartmentImportConfig} from "@/components/hr/departments/department.import.config.ts";
import type {TFunc} from "@/lib/ai/tools/write-tools.ts";
import {
  buildWriteToolDefinitionsFromFields,
  createMergeUpdatePatchesByFetcher,
  createMergeUpdatePatchesByMatchFields,
  type WriteFieldSpec,
} from "@/lib/ai/tools/write-tool-helpers.ts";
import {
  fetchExistingDishIngredientRaw,
  fetchExistingDishModifierRaw,
  fetchExistingDishRaw,
  fetchExistingInventoryItemRaw,
  fetchExistingModifierGroupOptionRaw,
  fetchExistingScheduledShiftRaw,
  fetchExistingTableRaw,
} from "@/lib/ai/tools/write-tool-fetchers.ts";
import {
  CATEGORY_WRITE_KEYWORDS,
  DISCOUNT_WRITE_KEYWORDS,
  DISH_WRITE_KEYWORDS,
  TABLE_WRITE_KEYWORDS,
} from "@/lib/ai/tools/write-intent-i18n.ts";

export type WriteToolRegistryEntry = {
  configId: string;
  recordsArgKey: string;
  createToolName: string;
  updateToolName?: string;
  permissionModules: {create: string; update: string};
  keywords: RegExp;
  /** Report domains used to route write tools when the prompt has write intent but weak entity keywords. */
  domains?: AiReportToolDomain[];
  /** When set, prompt must also match this (reduces false positives e.g. inventory reports). */
  actionKeywords?: RegExp;
  createConfig: (opts: {db: ImportDbLike; t: TFunc}) => ImportConfiguration;
  mergeUpdatePatches?: (
    db: ImportDbLike,
    patches: Array<Record<string, unknown>>,
  ) => Promise<Array<Record<string, unknown>>>;
  buildToolDefinitions: () => OpenAIToolDefinition[];
};

const mergeDishUpdatePatches = createMergeUpdatePatchesByFetcher(
  async (db, patch) => fetchExistingDishRaw(db, String(patch.number ?? "").trim()),
);
const mergeTableUpdatePatches = createMergeUpdatePatchesByFetcher(
  async (db, patch) => fetchExistingTableRaw(db, String(patch.number ?? "").trim()),
);
const mergeCategoryUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.categories, ["name"], {
  softDelete: true,
});
const mergeFloorUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.floors, ["name"], {
  softDelete: true,
});
const mergeTaxUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.taxes, ["name"], {
  softDelete: true,
});
const mergeOrderTypeUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.order_types, ["name"], {
  softDelete: true,
});
const mergePaymentTypeUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.payment_types, ["name"], {
  softDelete: true,
});
const mergeDiscountUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.discounts, ["name"], {
  softDelete: true,
});
const mergeDishModifierUpdatePatches = createMergeUpdatePatchesByFetcher(fetchExistingDishModifierRaw);
const mergeDishIngredientUpdatePatches = createMergeUpdatePatchesByFetcher(fetchExistingDishIngredientRaw);
const mergeInventoryItemUpdatePatches = createMergeUpdatePatchesByFetcher(
  async (db, patch) => fetchExistingInventoryItemRaw(db, String(patch.code ?? "").trim()),
);
const mergeScheduledShiftUpdatePatches = createMergeUpdatePatchesByFetcher(fetchExistingScheduledShiftRaw);
const mergeEmployeeUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.employees, ["employee_number"], {
  softDelete: false,
});
const mergeDepartmentUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.departments, ["name"], {
  softDelete: false,
});
const mergeModifierGroupUpdatePatches = createMergeUpdatePatchesByFetcher(fetchExistingModifierGroupOptionRaw);
const mergeKitchenUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.kitchens, ["name"], {
  softDelete: true,
});
const mergeExtraUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.extras, ["name"], {
  softDelete: true,
});
const mergeCouponUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.coupons, ["code"], {
  softDelete: true,
});
const mergeMenuUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.menus, ["name"], {
  softDelete: true,
});
const mergeWorkflowUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.workflows, ["name"], {
  softDelete: true,
});
const mergePrinterUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.printers, ["name"], {
  softDelete: true,
});
const mergeUserUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.users, ["login"], {
  softDelete: true,
});
const mergeRoleUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.user_roles, ["name"], {
  softDelete: true,
});
const mergeShiftUpdatePatches = createMergeUpdatePatchesByMatchFields(Tables.shifts, ["name"], {
  softDelete: true,
});

const DISH_CREATE_TOOL: OpenAIToolDefinition = {
  type: "function",
  function: {
    name: "propose_create_dishes",
    description:
      "Propose creating one or more new dishes/menu items. This does NOT save anything — " +
      "it only prepares a preview for the user to review and confirm.",
    parameters: {
      type: "object",
      properties: {
        dishes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {type: "string"},
              number: {type: "string"},
              priority: {type: "number", default: 0},
              price: {type: "number"},
              cost: {type: "number", default: 0},
              categories: {type: "array", items: {type: "string"}},
              tax: {type: "string"},
            },
            required: ["name", "price", "categories"],
          },
        },
      },
      required: ["dishes"],
    },
  },
};

const DISH_UPDATE_TOOL: OpenAIToolDefinition = {
  type: "function",
  function: {
    name: "propose_update_dishes",
    description:
      "Propose updating existing dishes matched by item number. Only include fields that should change.",
    parameters: {
      type: "object",
      properties: {
        dishes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              number: {type: "string"},
              name: {type: "string"},
              priority: {type: "number"},
              price: {type: "number"},
              cost: {type: "number"},
              categories: {type: "array", items: {type: "string"}},
              tax: {type: "string"},
            },
            required: ["number"],
          },
        },
      },
      required: ["dishes"],
    },
  },
};

const categoryFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true, description: "Category name"},
  {name: "show_in_menu", type: "boolean", description: "Show on menu (default true)"},
  {name: "priority", type: "number", description: "Display sort priority"},
];

const tableFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "number", type: "string", requiredOnCreate: true, description: "Table number (match key for updates)"},
  {name: "floor", type: "string", requiredOnCreate: true, description: "Floor name"},
  {name: "ask_for_covers", type: "boolean"},
  {name: "background", type: "string"},
  {name: "color", type: "string"},
  {name: "priority", type: "number"},
  {name: "categories", type: "string[]", description: "Menu category names"},
  {name: "order_types", type: "string[]", description: "Order type names"},
  {name: "payment_types", type: "string[]", description: "Payment type names"},
];

const dishModifierFields: WriteFieldSpec[] = [
  {name: "dish_number", type: "string", requiredOnCreate: true},
  {name: "modifier_group", type: "string", requiredOnCreate: true, description: "Modifier group name"},
  {name: "priority", type: "number", requiredOnCreate: true},
  {name: "has_required_modifiers", type: "boolean"},
  {name: "required_modifiers", type: "number"},
  {name: "should_auto_open", type: "boolean"},
  {name: "should_auto_select", type: "boolean"},
];

const dishIngredientFields: WriteFieldSpec[] = [
  {name: "dish_number", type: "string", requiredOnCreate: true},
  {name: "ingredient", type: "string", requiredOnCreate: true, description: "Inventory item name or code"},
  {name: "uom", type: "string"},
  {name: "quantity", type: "number", requiredOnCreate: true},
  {name: "cost", type: "number"},
  {name: "is_price_locked", type: "boolean"},
];

const inventoryItemFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "code", type: "string", requiredOnCreate: true, description: "SKU / item code"},
  {name: "category", type: "string", requiredOnCreate: true, description: "Inventory category name"},
  {name: "uom", type: "string", requiredOnCreate: true},
  {name: "base_quantity", type: "number"},
  {name: "price", type: "number"},
  {name: "average_price", type: "number"},
  {name: "locations", type: "string[]", requiredOnCreate: true, description: "Location names"},
  {name: "suppliers", type: "string[]", requiredOnCreate: true, description: "Supplier names"},
  {name: "item_types", type: "string", description: "raw, semi_finished, finished (comma-separated)"},
  {name: "reorder_levels", type: "string", description: "location:level pairs, comma-separated"},
];

const scheduledShiftFields: WriteFieldSpec[] = [
  {name: "employee", type: "string", requiredOnCreate: true, description: "Employee number or name"},
  {name: "schedule", type: "string", requiredOnCreate: true, description: "Work schedule name"},
  {name: "start_at", type: "string", requiredOnCreate: true, description: "Start datetime (ISO or locale string)"},
  {name: "end_at", type: "string", requiredOnCreate: true, description: "End datetime"},
  {name: "shift_template", type: "string"},
  {name: "department", type: "string"},
  {name: "position", type: "string"},
  {name: "notes", type: "string"},
];

const floorFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "priority", type: "number"},
  {name: "background", type: "string"},
  {name: "color", type: "string"},
];

const taxFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "rate", type: "number", requiredOnCreate: true, description: "Rate percent"},
  {name: "priority", type: "number"},
];

const orderTypeFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "priority", type: "number"},
  {name: "allow_service_charges", type: "boolean"},
];

const paymentTypeFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "type", type: "string", requiredOnCreate: true, description: "Cash, Card, Points, or Remote"},
  {name: "priority", type: "number"},
  {name: "tax", type: "string", description: "Tax name"},
];

const discountFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "type", type: "string", requiredOnCreate: true, description: "Percent or Fixed"},
  {name: "min_rate", type: "number", requiredOnCreate: true},
  {name: "max_rate", type: "number", requiredOnCreate: true},
  {name: "priority", type: "number"},
  {name: "scope", type: "string", description: "item, category, cart, customer, or floor"},
  {name: "application_mode", type: "string", description: "manual, automatic, or both"},
  {name: "category", type: "string", description: "manual, buy_x_get_y, happy_hour, scheduled, etc."},
  {name: "is_active", type: "boolean"},
  {name: "max_cap", type: "number"},
  {name: "min_order_amount", type: "number"},
  {name: "stacking_mode", type: "string", description: "allow, prevent, highest_wins, priority"},
  {name: "tax_treatment", type: "string"},
  {name: "stackable", type: "boolean"},
  {name: "exclusive", type: "boolean"},
  {name: "requires_reason", type: "boolean"},
  {name: "requires_approval", type: "boolean"},
  {name: "category_names", type: "string[]", description: "Target menu category names"},
  {name: "item_names", type: "string[]", description: "Target dish names or numbers"},
  {name: "floor_names", type: "string[]"},
  {name: "customer_tags", type: "string[]"},
  {name: "payment_type_names", type: "string[]"},
  {name: "buy_quantity", type: "number"},
  {name: "get_quantity", type: "number"},
  {name: "buy_category_names", type: "string[]"},
  {name: "buy_item_names", type: "string[]"},
  {name: "get_category_names", type: "string[]"},
  {name: "get_item_names", type: "string[]"},
  {name: "get_value_type", type: "string", description: "free, percent, fixed_amount"},
  {name: "get_value", type: "number"},
  {name: "schedules", type: "string", description: "JSON array of schedule objects"},
];

const employeeFields: WriteFieldSpec[] = [
  {name: "employee_number", type: "string", requiredOnCreate: true},
  {name: "first_name", type: "string", requiredOnCreate: true},
  {name: "last_name", type: "string"},
  {name: "department", type: "string", description: "Department name"},
  {name: "position", type: "string", description: "Position name"},
  {name: "employment_status", type: "string"},
  {name: "employment_type", type: "string"},
  {name: "hire_date", type: "string"},
  {name: "notes", type: "string"},
];

const departmentFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "code", type: "string"},
];

const modifierGroupFields: WriteFieldSpec[] = [
  {name: "group", type: "string", requiredOnCreate: true, description: "Modifier group name (e.g. Select pizza size)"},
  {
    name: "modifier",
    type: "string",
    requiredOnCreate: true,
    description: "Modifier option name within the group (e.g. Small) — not the base menu item",
  },
  {
    name: "price",
    type: "number",
    requiredOnCreate: true,
    description: "Modifier option price within the group — not the base dish price",
  },
  {name: "priority", type: "number"},
];

const kitchenFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "priority", type: "number"},
  {name: "items", type: "string[]", description: "Dish names or numbers"},
  {name: "printers", type: "string[]", description: "Printer names"},
];

const extraFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "value", type: "number", requiredOnCreate: true},
  {name: "apply_to_all", type: "boolean"},
  {name: "delivery", type: "boolean"},
  {name: "tables", type: "string[]", description: "Table numbers when not apply_to_all"},
  {name: "payment_types", type: "string[]"},
  {name: "order_types", type: "string[]"},
];

const couponFields: WriteFieldSpec[] = [
  {name: "code", type: "string", requiredOnCreate: true},
  {name: "description", type: "string"},
  {name: "coupon_type", type: "string", requiredOnCreate: true},
  {name: "discount_type", type: "string", requiredOnCreate: true},
  {name: "discount_value", type: "number", requiredOnCreate: true},
  {name: "min_order_amount", type: "number"},
  {name: "max_discount_amount", type: "number"},
  {name: "usage_limit", type: "number"},
  {name: "usage_limit_per_user", type: "number"},
  {name: "priority", type: "number"},
  {name: "valid_days", type: "string[]"},
  {name: "stackable", type: "boolean"},
  {name: "first_order_only", type: "boolean"},
  {name: "is_active", type: "boolean"},
  {name: "category_names", type: "string[]"},
  {name: "item_names", type: "string[]"},
];

const menuFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "priority", type: "number"},
];

const workflowFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "stages", type: "string", requiredOnCreate: true, description: "JSON array of {name, kitchen_name}"},
];

const printerFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "priority", type: "number"},
  {name: "type", type: "string"},
  {name: "ip_address", type: "string"},
  {name: "port", type: "number"},
  {name: "vid", type: "string"},
  {name: "pid", type: "string"},
  {name: "path", type: "string"},
];

const printSettingsFields: WriteFieldSpec[] = [
  {name: "key", type: "string", requiredOnCreate: true, description: "Temp Print, Final Print, Kitchen Print, Summary Print, or Delivery Print"},
  {name: "top_margin", type: "number"},
  {name: "bottom_margin", type: "number"},
  {name: "left_margin", type: "number"},
  {name: "right_margin", type: "number"},
  {name: "show_logo", type: "boolean"},
  {name: "show_vat_number", type: "boolean"},
  {name: "vat_name", type: "string"},
  {name: "vat_number", type: "string"},
];

const userFields: WriteFieldSpec[] = [
  {name: "first_name", type: "string", requiredOnCreate: true},
  {name: "last_name", type: "string", requiredOnCreate: true},
  {name: "login", type: "string", requiredOnCreate: true},
  {name: "login_method", type: "string", description: "pin or form"},
  {name: "set_password", type: "string", description: "Password/PIN — hashed on commit, never echoed back"},
  {name: "role_name", type: "string", requiredOnCreate: true},
  {name: "shift_name", type: "string"},
];

const roleFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "modules", type: "string[]", requiredOnCreate: true, description: "Permission module keys"},
];

const shiftFields: WriteFieldSpec[] = [
  {name: "name", type: "string", requiredOnCreate: true},
  {name: "start_time", type: "string", requiredOnCreate: true},
  {name: "end_time", type: "string", requiredOnCreate: true},
  {name: "ends_next_day", type: "boolean"},
];

const tipDistributionFields: WriteFieldSpec[] = [
  {name: "distribution", type: "string", requiredOnCreate: true, description: "JSON {roles:[{role_name,weight}],users:[{user_login,weight}]}"},
];

const smartMenuFields: WriteFieldSpec[] = [
  {name: "record_type", type: "string", requiredOnCreate: true},
  {name: "name", type: "string"},
  {name: "group_name", type: "string"},
  {name: "category", type: "string"},
  {name: "price", type: "number"},
  {name: "number", type: "string"},
];

export const WRITE_TOOL_REGISTRY: WriteToolRegistryEntry[] = [
  {
    configId: "dishes",
    recordsArgKey: "dishes",
    createToolName: "propose_create_dishes",
    updateToolName: "propose_update_dishes",
    permissionModules: {create: "admin.dishes.create", update: "admin.dishes.update"},
    keywords: DISH_WRITE_KEYWORDS,
    domains: ["sales", "lookup"],
    createConfig: createDishImportConfig,
    mergeUpdatePatches: mergeDishUpdatePatches,
    buildToolDefinitions: () => [DISH_CREATE_TOOL, DISH_UPDATE_TOOL],
  },
  {
    configId: "categories",
    recordsArgKey: "categories",
    createToolName: "propose_create_categories",
    updateToolName: "propose_update_categories",
    permissionModules: {create: "admin.categories.create", update: "admin.categories.update"},
    keywords: CATEGORY_WRITE_KEYWORDS,
    domains: ["sales", "lookup"],
    createConfig: createCategoryImportConfig,
    mergeUpdatePatches: mergeCategoryUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Category",
      recordsArgKey: "categories",
      createToolName: "propose_create_categories",
      updateToolName: "propose_update_categories",
      matchFields: ["name"],
      fields: categoryFields,
    }),
  },
  {
    configId: "tables",
    recordsArgKey: "tables",
    createToolName: "propose_create_tables",
    updateToolName: "propose_update_tables",
    permissionModules: {create: "admin.tables.create", update: "admin.tables.update"},
    keywords: TABLE_WRITE_KEYWORDS,
    domains: ["manage", "operations"],
    createConfig: createTableImportConfig,
    mergeUpdatePatches: mergeTableUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Table",
      recordsArgKey: "tables",
      createToolName: "propose_create_tables",
      updateToolName: "propose_update_tables",
      matchFields: ["number"],
      fields: tableFields,
      createDescription:
        "Propose creating restaurant tables. Use floor name and category/order/payment type names as strings.",
      updateDescription:
        "Propose updating tables matched by table number. Only include fields that should change.",
    }),
  },
  {
    configId: "dish_modifier_groups",
    recordsArgKey: "dish_modifiers",
    createToolName: "propose_create_dish_modifiers",
    updateToolName: "propose_update_dish_modifiers",
    permissionModules: {create: "admin.dishes.create", update: "admin.dishes.update"},
    keywords: /\b(dish modifier|dish modifiers|modifier group|attach modifier)\b/i,
    domains: ["sales"],
    createConfig: createDishModifiersImportConfig,
    mergeUpdatePatches: mergeDishModifierUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Dish modifier group link",
      recordsArgKey: "dish_modifiers",
      createToolName: "propose_create_dish_modifiers",
      updateToolName: "propose_update_dish_modifiers",
      matchFields: ["dish_number", "modifier_group"],
      fields: dishModifierFields,
    }),
  },
  {
    configId: "dish_ingredients",
    recordsArgKey: "dish_ingredients",
    createToolName: "propose_create_dish_ingredients",
    updateToolName: "propose_update_dish_ingredients",
    permissionModules: {create: "admin.dishes.create", update: "admin.dishes.update"},
    keywords: /\b((dish|recipe)\s+ingredient|ingredient\s+(to|for)\s+dish|add\s+ingredient)\b/i,
    domains: ["sales", "inventory"],
    createConfig: createDishIngredientsImportConfig,
    mergeUpdatePatches: mergeDishIngredientUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Dish ingredient",
      recordsArgKey: "dish_ingredients",
      createToolName: "propose_create_dish_ingredients",
      updateToolName: "propose_update_dish_ingredients",
      matchFields: ["dish_number", "ingredient"],
      fields: dishIngredientFields,
    }),
  },
  {
    configId: "inventory_items",
    recordsArgKey: "inventory_items",
    createToolName: "propose_create_inventory_items",
    updateToolName: "propose_update_inventory_items",
    permissionModules: {create: "inventory.items", update: "inventory.items"},
    keywords: /\b(inventory item|inventory items|stock item|stock items|sku)\b/i,
    domains: ["inventory"],
    actionKeywords: /\b(add|create|update|change|set|new|import)\b/i,
    createConfig: createInventoryItemImportConfig,
    mergeUpdatePatches: mergeInventoryItemUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Inventory item",
      recordsArgKey: "inventory_items",
      createToolName: "propose_create_inventory_items",
      updateToolName: "propose_update_inventory_items",
      matchFields: ["code"],
      fields: inventoryItemFields,
    }),
  },
  {
    configId: "scheduled_shifts",
    recordsArgKey: "scheduled_shifts",
    createToolName: "propose_create_scheduled_shifts",
    updateToolName: "propose_update_scheduled_shifts",
    permissionModules: {create: "hr.scheduling", update: "hr.scheduling"},
    keywords: /\b(scheduled shift|scheduled shifts|shift schedule|roster|add shift)\b/i,
    domains: ["labor"],
    createConfig: createScheduledShiftImportConfig,
    mergeUpdatePatches: mergeScheduledShiftUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Scheduled shift",
      recordsArgKey: "scheduled_shifts",
      createToolName: "propose_create_scheduled_shifts",
      updateToolName: "propose_update_scheduled_shifts",
      matchFields: ["employee", "start_at"],
      fields: scheduledShiftFields,
    }),
  },
  {
    configId: "floors",
    recordsArgKey: "floors",
    createToolName: "propose_create_floors",
    updateToolName: "propose_update_floors",
    permissionModules: {create: "admin.floors.create", update: "admin.floors.update"},
    keywords: /\b(floor|floors)\b/i,
    domains: ["manage", "operations"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createFloorImportConfig,
    mergeUpdatePatches: mergeFloorUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Floor",
      recordsArgKey: "floors",
      createToolName: "propose_create_floors",
      updateToolName: "propose_update_floors",
      matchFields: ["name"],
      fields: floorFields,
    }),
  },
  {
    configId: "taxes",
    recordsArgKey: "taxes",
    createToolName: "propose_create_taxes",
    updateToolName: "propose_update_taxes",
    permissionModules: {create: "admin.taxes.create", update: "admin.taxes.update"},
    keywords: /\b(tax|taxes)\b/i,
    domains: ["sales"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createTaxImportConfig,
    mergeUpdatePatches: mergeTaxUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Tax",
      recordsArgKey: "taxes",
      createToolName: "propose_create_taxes",
      updateToolName: "propose_update_taxes",
      matchFields: ["name"],
      fields: taxFields,
    }),
  },
  {
    configId: "order_types",
    recordsArgKey: "order_types",
    createToolName: "propose_create_order_types",
    updateToolName: "propose_update_order_types",
    permissionModules: {create: "admin.order_types.create", update: "admin.order_types.update"},
    keywords: /\b(order type|order types)\b/i,
    domains: ["operations", "sales"],
    createConfig: createOrderTypeImportConfig,
    mergeUpdatePatches: mergeOrderTypeUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Order type",
      recordsArgKey: "order_types",
      createToolName: "propose_create_order_types",
      updateToolName: "propose_update_order_types",
      matchFields: ["name"],
      fields: orderTypeFields,
    }),
  },
  {
    configId: "payment_types",
    recordsArgKey: "payment_types",
    createToolName: "propose_create_payment_types",
    updateToolName: "propose_update_payment_types",
    permissionModules: {create: "admin.payment_types.create", update: "admin.payment_types.update"},
    keywords: /\b(payment type|payment types)\b/i,
    domains: ["operations", "sales"],
    createConfig: createPaymentTypeImportConfig,
    mergeUpdatePatches: mergePaymentTypeUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Payment type",
      recordsArgKey: "payment_types",
      createToolName: "propose_create_payment_types",
      updateToolName: "propose_update_payment_types",
      matchFields: ["name"],
      fields: paymentTypeFields,
    }),
  },
  {
    configId: "discounts",
    recordsArgKey: "discounts",
    createToolName: "propose_create_discounts",
    updateToolName: "propose_update_discounts",
    permissionModules: {create: "admin.discounts.create", update: "admin.discounts.update"},
    keywords: DISCOUNT_WRITE_KEYWORDS,
    domains: ["manage", "sales"],
    actionKeywords: /\b(add|create|update|change|set|new|buy \d+ get \d+|free on)\b/i,
    createConfig: createDiscountImportConfig,
    mergeUpdatePatches: mergeDiscountUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Discount",
      recordsArgKey: "discounts",
      createToolName: "propose_create_discounts",
      updateToolName: "propose_update_discounts",
      matchFields: ["name"],
      fields: discountFields,
      createDescription:
        "Propose creating discounts including BXGY, targets, schedules, and stacking/tax fields. Call list_categories/list_menu_items/list_floors first when scoping.",
    }),
  },
  {
    configId: "employees",
    recordsArgKey: "employees",
    createToolName: "propose_create_employees",
    updateToolName: "propose_update_employees",
    permissionModules: {create: "hr.employees", update: "hr.employees"},
    keywords: /\b(employee|employees|staff member|hire employee)\b/i,
    domains: ["labor", "lookup"],
    actionKeywords: /\b(add|create|update|change|set|new|hire)\b/i,
    createConfig: createEmployeeImportConfig,
    mergeUpdatePatches: mergeEmployeeUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Employee",
      recordsArgKey: "employees",
      createToolName: "propose_create_employees",
      updateToolName: "propose_update_employees",
      matchFields: ["employee_number"],
      fields: employeeFields,
    }),
  },
  {
    configId: "departments",
    recordsArgKey: "departments",
    createToolName: "propose_create_departments",
    updateToolName: "propose_update_departments",
    permissionModules: {create: "hr.departments", update: "hr.departments"},
    keywords: /\b(department|departments)\b/i,
    domains: ["labor"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createDepartmentImportConfig,
    mergeUpdatePatches: mergeDepartmentUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Department",
      recordsArgKey: "departments",
      createToolName: "propose_create_departments",
      updateToolName: "propose_update_departments",
      matchFields: ["name"],
      fields: departmentFields,
    }),
  },
  {
    configId: "modifier_groups",
    recordsArgKey: "modifier_groups",
    createToolName: "propose_create_modifier_groups",
    updateToolName: "propose_update_modifier_groups",
    permissionModules: {create: "admin.modifier_groups.create", update: "admin.modifier_groups.update"},
    keywords: /\b(modifier groups?|modifier option|size option|topping option)\b/i,
    domains: ["manage", "sales"],
    actionKeywords: /\b(add|create|update|change|set|new|increase|decrease|raise|lower|price)\b/i,
    createConfig: createModifierGroupImportConfig,
    mergeUpdatePatches: mergeModifierGroupUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Modifier group option",
      recordsArgKey: "modifier_groups",
      createToolName: "propose_create_modifier_groups",
      updateToolName: "propose_update_modifier_groups",
      matchFields: ["group", "modifier"],
      fields: modifierGroupFields,
      createDescription:
        "Propose adding a modifier option to a modifier group with its option price. "
        + "Use for sizes/toppings/add-ons — not base dish price.",
      updateDescription:
        "Propose updating a modifier option price within a modifier group (group + modifier name). "
        + "Do NOT use propose_update_dishes — that changes the base menu item price, not the modifier option price.",
    }),
  },
  {
    configId: "kitchens",
    recordsArgKey: "kitchens",
    createToolName: "propose_create_kitchens",
    updateToolName: "propose_update_kitchens",
    permissionModules: {create: "admin.kitchens.create", update: "admin.kitchens.update"},
    keywords: /\b(kitchen|kitchens)\b/i,
    domains: ["manage"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createKitchenImportConfig,
    mergeUpdatePatches: mergeKitchenUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Kitchen",
      recordsArgKey: "kitchens",
      createToolName: "propose_create_kitchens",
      updateToolName: "propose_update_kitchens",
      matchFields: ["name"],
      fields: kitchenFields,
    }),
  },
  {
    configId: "extras",
    recordsArgKey: "extras",
    createToolName: "propose_create_extras",
    updateToolName: "propose_update_extras",
    permissionModules: {create: "admin.extras.create", update: "admin.extras.update"},
    keywords: /\b(extra|extras)\b/i,
    domains: ["manage"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createExtraImportConfig,
    mergeUpdatePatches: mergeExtraUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Extra",
      recordsArgKey: "extras",
      createToolName: "propose_create_extras",
      updateToolName: "propose_update_extras",
      matchFields: ["name"],
      fields: extraFields,
    }),
  },
  {
    configId: "smart_menu",
    recordsArgKey: "menu_records",
    createToolName: "propose_import_smart_menu",
    permissionModules: {create: "admin.dishes.import", update: "admin.dishes.import"},
    keywords: /\b(smart menu|menu structure|import menu)\b/i,
    domains: ["manage", "sales"],
    actionKeywords: /\b(import|create|add)\b/i,
    createConfig: createSmartMenuImportConfig,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Smart menu structure",
      recordsArgKey: "menu_records",
      createToolName: "propose_import_smart_menu",
      matchFields: ["record_type", "name", "group_name"],
      fields: smartMenuFields,
      createDescription: "Propose importing structured menu records (dishes, size groups, addons). Use only for full menu structure imports.",
    }),
  },
  {
    configId: "coupons",
    recordsArgKey: "coupons",
    createToolName: "propose_create_coupons",
    updateToolName: "propose_update_coupons",
    permissionModules: {create: "admin.coupons.create", update: "admin.coupons.update"},
    keywords: /\b(coupon|coupons|promo code)\b/i,
    domains: ["manage", "sales"],
    createConfig: createCouponImportConfig,
    mergeUpdatePatches: mergeCouponUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Coupon",
      recordsArgKey: "coupons",
      createToolName: "propose_create_coupons",
      updateToolName: "propose_update_coupons",
      matchFields: ["code"],
      fields: couponFields,
    }),
  },
  {
    configId: "menus",
    recordsArgKey: "menus",
    createToolName: "propose_create_menus",
    updateToolName: "propose_update_menus",
    permissionModules: {create: "admin.menus.create", update: "admin.menus.update"},
    keywords: /\b(menu header|menus)\b/i,
    domains: ["manage"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createMenuImportConfig,
    mergeUpdatePatches: mergeMenuUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Menu",
      recordsArgKey: "menus",
      createToolName: "propose_create_menus",
      updateToolName: "propose_update_menus",
      matchFields: ["name"],
      fields: menuFields,
    }),
  },
  {
    configId: "workflows",
    recordsArgKey: "workflows",
    createToolName: "propose_create_workflows",
    updateToolName: "propose_update_workflows",
    permissionModules: {create: "admin.workflows.create", update: "admin.workflows.update"},
    keywords: /\b(workflow|workflows)\b/i,
    domains: ["manage"],
    createConfig: createWorkflowImportConfig,
    mergeUpdatePatches: mergeWorkflowUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Workflow",
      recordsArgKey: "workflows",
      createToolName: "propose_create_workflows",
      updateToolName: "propose_update_workflows",
      matchFields: ["name"],
      fields: workflowFields,
    }),
  },
  {
    configId: "printers",
    recordsArgKey: "printers",
    createToolName: "propose_create_printers",
    updateToolName: "propose_update_printers",
    permissionModules: {create: "admin.printers.create", update: "admin.printers.update"},
    keywords: /\b(printer|printers)\b/i,
    domains: ["manage"],
    createConfig: createPrinterImportConfig,
    mergeUpdatePatches: mergePrinterUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Printer",
      recordsArgKey: "printers",
      createToolName: "propose_create_printers",
      updateToolName: "propose_update_printers",
      matchFields: ["name"],
      fields: printerFields,
    }),
  },
  {
    configId: "print_settings",
    recordsArgKey: "print_settings",
    createToolName: "propose_update_print_settings",
    permissionModules: {create: "admin.print_settings.update", update: "admin.print_settings.update"},
    keywords: /\b(print settings?|receipt settings?)\b/i,
    domains: ["manage"],
    actionKeywords: /\b(update|change|set|configure)\b/i,
    createConfig: createPrintSettingsImportConfig,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Print setting",
      recordsArgKey: "print_settings",
      createToolName: "propose_update_print_settings",
      matchFields: ["key"],
      fields: printSettingsFields,
      createDescription: "Propose updating receipt print settings for a fixed print type key.",
    }),
  },
  {
    configId: "users",
    recordsArgKey: "users",
    createToolName: "propose_create_users",
    updateToolName: "propose_update_users",
    permissionModules: {create: "admin.users.create", update: "admin.users.update"},
    keywords: /\b(user|users|pos user)\b/i,
    domains: ["manage", "lookup"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createUserImportConfig,
    mergeUpdatePatches: mergeUserUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "User",
      recordsArgKey: "users",
      createToolName: "propose_create_users",
      updateToolName: "propose_update_users",
      matchFields: ["login"],
      fields: userFields,
      createDescription: "Propose creating/updating POS users. set_password is hashed on commit only.",
    }),
  },
  {
    configId: "roles",
    recordsArgKey: "roles",
    createToolName: "propose_create_roles",
    updateToolName: "propose_update_roles",
    permissionModules: {create: "admin.roles.create", update: "admin.roles.update"},
    keywords: /\b(role|roles|permission)\b/i,
    domains: ["manage"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createRoleImportConfig,
    mergeUpdatePatches: mergeRoleUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Role",
      recordsArgKey: "roles",
      createToolName: "propose_create_roles",
      updateToolName: "propose_update_roles",
      matchFields: ["name"],
      fields: roleFields,
    }),
  },
  {
    configId: "shifts",
    recordsArgKey: "shifts",
    createToolName: "propose_create_shifts",
    updateToolName: "propose_update_shifts",
    permissionModules: {create: "admin.shifts.create", update: "admin.shifts.update"},
    keywords: /\b(work shift|shifts)\b/i,
    domains: ["manage", "labor"],
    actionKeywords: /\b(add|create|update|change|set|new)\b/i,
    createConfig: createShiftImportConfig,
    mergeUpdatePatches: mergeShiftUpdatePatches,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Shift",
      recordsArgKey: "shifts",
      createToolName: "propose_create_shifts",
      updateToolName: "propose_update_shifts",
      matchFields: ["name"],
      fields: shiftFields,
    }),
  },
  {
    configId: "tip_distribution",
    recordsArgKey: "tip_distributions",
    createToolName: "propose_update_tip_distribution",
    permissionModules: {create: "admin.tips_definition.update", update: "admin.tips_definition.update"},
    keywords: /\b(tip distribution|tips definition|tip weights?)\b/i,
    domains: ["manage", "sales"],
    actionKeywords: /\b(update|change|set|configure)\b/i,
    createConfig: createTipDistributionImportConfig,
    buildToolDefinitions: () => buildWriteToolDefinitionsFromFields({
      entityLabel: "Tip distribution",
      recordsArgKey: "tip_distributions",
      createToolName: "propose_update_tip_distribution",
      matchFields: ["distribution"],
      fields: tipDistributionFields,
      createDescription: "Propose updating tip distribution weights by role name and user login.",
    }),
  },
];

export const buildWriteToolPermissionMap = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const entry of WRITE_TOOL_REGISTRY) {
    map[entry.createToolName] = entry.permissionModules.create;
    if (entry.updateToolName) {
      map[entry.updateToolName] = entry.permissionModules.update;
    }
  }
  return map;
};
