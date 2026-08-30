/** Maps manage list_* tools to admin tab permission modules. */
export const MANAGE_TOOL_PERMISSION_MODULES: Record<string, string> = {
  list_floors: "admin.floors",
  list_tables: "admin.tables",
  list_modifier_groups: "admin.modifier_groups",
  list_kitchens: "admin.kitchens",
  get_kitchen_detail: "admin.kitchens",
  list_taxes: "admin.taxes",
  list_discounts: "admin.discounts",
  list_order_types: "admin.order_types",
  list_payment_types: "admin.payment_types",
  list_extras: "admin.extras",
  list_coupons: "admin.coupons",
  list_menus: "admin.menus",
  get_menu_items: "admin.menus",
  list_workflows: "admin.workflows",
  list_printers: "admin.printers",
  list_users: "admin.users",
  list_roles: "admin.roles",
  list_shifts: "admin.shifts",
};

export const ALL_MANAGE_READ_TOOL_NAMES = Object.keys(MANAGE_TOOL_PERMISSION_MODULES);
