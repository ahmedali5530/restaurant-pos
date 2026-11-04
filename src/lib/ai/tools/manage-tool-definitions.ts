import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

const ID_NOTE =
  " Each row includes id — use it for propose_update_* / propose_delete_* (prefer id over name/number/code).";

const searchLimitProps = {
  search: {type: "string"},
  limit: {type: "number", default: 50},
};

const detailIdNameProps = {
  id: {type: "string", description: "Record id when known"},
  name: {type: "string", description: "Partial name match"},
  search: {type: "string"},
  limit: {type: "number", default: 5},
};

export const AI_MANAGE_READ_TOOLS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_floors",
      description: "List restaurant floors for layout and table scoping."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "List tables (id, name, number, floor). Use get_table_detail for categories/order/payment scoping."
        + ID_NOTE,
      parameters: {
        type: "object",
        properties: {
          floor_name: {type: "string", description: "Floor name filter, case-insensitive partial match"},
          ...searchLimitProps,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_table_detail",
      description:
        "Get table layout detail including floor, categories, order types, payment types, and covers flag. "
        + "Use before propose_update_tables.",
      parameters: {
        type: "object",
        properties: {
          ...detailIdNameProps,
          number: {type: "string", description: "Table number digits"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_modifier_groups",
      description: "List modifier groups with each option id, name, number, and price (not base dish price)."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_kitchens",
      description: "List kitchen stations (id, name, priority). Use get_kitchen_detail for dish assignments."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_kitchen_detail",
      description:
        "Get kitchen station details including assigned dishes (names/numbers) and printers. "
        + "Use before propose_update_kitchens when adding or removing dishes.",
      parameters: {
        type: "object",
        properties: {
          name: {type: "string", description: "Kitchen name (partial match)"},
          search: {type: "string", description: "Search kitchen or dish name"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dish_detail",
      description:
        "Get dish Manage detail: categories, tax, workflow, stage_overrides, and attached modifier groups with edge flags. "
        + "Not a recipe — use get_dish_recipe for ingredients. Use before propose_update_dishes / dish modifier proposes.",
      parameters: {
        type: "object",
        properties: {
          ...detailIdNameProps,
          number: {type: "string", description: "Dish number"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dish_modifiers",
      description:
        "List dish↔modifier-group edges (required/auto flags, priority). Filter by dish_id, dish_number, or dish_name. "
        + "Use before propose_create_dish_modifiers / propose_update_dish_modifiers.",
      parameters: {
        type: "object",
        properties: {
          dish_id: {type: "string"},
          dish_number: {type: "string"},
          dish_name: {type: "string"},
          ...searchLimitProps,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_taxes",
      description: "List tax definitions."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_discounts",
      description:
        "List discount rules (taxonomy + rates/caps/stacking flags). Use get_discount_detail for targets, BXGY, and schedules."
        + ID_NOTE,
      parameters: {
        type: "object",
        properties: {
          ...searchLimitProps,
          active_only: {type: "boolean", default: false},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_discount_detail",
      description:
        "Get discount detail including targets, BXGY conditions, schedules, stacking and tax treatment. "
        + "Use before propose_update_discounts.",
      parameters: {type: "object", properties: detailIdNameProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_order_types",
      description: "List order types with priority and allow_service_charges."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_payment_types",
      description: "List payment types with linked tax name (no gateway secrets)."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_extras",
      description: "List order extras with value and apply flags. Use get_extra_detail for table/payment/order-type scoping."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_extra_detail",
      description:
        "Get extra detail including tables, payment types, and order types. Use before propose_update_extras.",
      parameters: {type: "object", properties: detailIdNameProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_coupons",
      description:
        "List coupon codes with discount type/value and limits. Use get_coupon_detail for targets and valid days/times."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_coupon_detail",
      description:
        "Get coupon detail including category/item targets, valid days, and time window. Use before propose_update_coupons.",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string"},
          code: {type: "string"},
          search: {type: "string"},
          limit: {type: "number", default: 5},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_menus",
      description: "List menu headers with priority."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_items",
      description: "List dishes on a menu by menu_name, or all dishes when menu_name is omitted."
        + ID_NOTE,
      parameters: {
        type: "object",
        properties: {
          menu_name: {type: "string"},
          search: {type: "string"},
          limit: {type: "number", default: 100},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_workflows",
      description: "List kitchen workflows with stages (id, kitchen_id, kitchen_name)."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_printers",
      description: "List printers with connection basics. Use get_printer_detail for full non-secret fields."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_printer_detail",
      description:
        "Get printer connection/layout detail (IP/port/VID/PID/path/print_mode/paper width). No secrets.",
      parameters: {type: "object", properties: detailIdNameProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_print_settings",
      description:
        "Read Manage print settings (Temp/Final/Kitchen/Summary/Delivery/Refund Print). "
        + "Use before propose_update_print_settings. Omits embedded logo/image blobs.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Optional print key filter (e.g. Final Print)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tip_distribution",
      description:
        "Read current tip distribution weights by role and user (Manage config). "
        + "Not sales tip totals — use get_tips for collected tips. Use before propose_update_tip_distribution.",
      parameters: {type: "object", properties: {}},
    },
  },
  {
    type: "function",
    function: {
      name: "list_users",
      description: "List POS users with role and shift names (no passwords)."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_roles",
      description: "List user roles (id, name). Use get_role_detail for permission modules."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_role_detail",
      description:
        "Get role permission modules. Use before propose_update_roles.",
      parameters: {type: "object", properties: detailIdNameProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_shifts",
      description: "List work shifts with ends_next_day."
        + ID_NOTE,
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
];

export const getManageToolByName = (name: string): OpenAIToolDefinition | undefined =>
  AI_MANAGE_READ_TOOLS.find(tool => tool.function.name === name);
