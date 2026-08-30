import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

const searchLimitProps = {
  search: {type: "string"},
  limit: {type: "number", default: 50},
};

export const AI_MANAGE_READ_TOOLS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_floors",
      description: "List restaurant floors for layout and table scoping.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "List tables. Filter by floor_name (e.g. Delivery) and optional search.",
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
      name: "list_modifier_groups",
      description: "List modifier groups with each option name and modifier option price (not base dish price).",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_kitchens",
      description: "List kitchen stations (name and priority only). Use get_kitchen_detail for dish assignments.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_kitchen_detail",
      description:
        "Get kitchen station details including assigned dishes (names/numbers) and printers. " +
        "Use before propose_update_kitchens when adding or removing dishes.",
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
      name: "list_taxes",
      description: "List tax definitions.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_discounts",
      description: "List discount rules configured in Manage (not sales discount totals).",
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
      name: "list_order_types",
      description: "List order types (dine-in, delivery, etc.).",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_payment_types",
      description: "List payment types.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_extras",
      description: "List order extras.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_coupons",
      description: "List coupon codes configured in Manage.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_menus",
      description: "List menu headers.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_items",
      description: "List dishes on a menu by menu_name, or all dishes when menu_name is omitted.",
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
      description: "List kitchen workflows with stages and target kitchen per stage.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_printers",
      description: "List configured printers.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_users",
      description: "List POS users (no passwords).",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_roles",
      description: "List user roles and permission templates.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_shifts",
      description: "List work shifts.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
];

export const getManageToolByName = (name: string): OpenAIToolDefinition | undefined =>
  AI_MANAGE_READ_TOOLS.find(tool => tool.function.name === name);
