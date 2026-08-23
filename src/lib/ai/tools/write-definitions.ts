import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

/**
 * Write tools for the AI assistant. Unlike AI_REPORT_TOOLS (read-only, executed
 * immediately by executeAiReportTool), calling one of these NEVER writes to the
 * database. It only builds a validated proposal for the user to review and
 * explicitly confirm — see write-tools.ts / write-executor.ts / assistant-agent.ts.
 */
export const AI_WRITE_TOOLS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "propose_create_dishes",
      description:
        "Propose creating one or more new dishes/menu items. This does NOT save anything — " +
        "it only prepares a preview for the user to review and confirm. Use for requests " +
        "like 'add a dish called X at $9' or bulk additions from a list.",
      parameters: {
        type: "object",
        properties: {
          dishes: {
            type: "array",
            description: "One entry per dish to create.",
            items: {
              type: "object",
              properties: {
                name: {type: "string", description: "Dish/menu item name"},
                number: {type: "string", description: "Internal item number; omit to auto-assign"},
                priority: {type: "number", description: "Display sort priority", default: 0},
                price: {type: "number", description: "Sale price"},
                cost: {type: "number", description: "Cost price", default: 0},
                categories: {
                  type: "array",
                  items: {type: "string"},
                  description: "Menu category name(s). Unknown categories will be created — flagged in the preview.",
                },
                tax: {type: "string", description: "Tax name, if applicable"},
              },
              required: ["name", "price", "categories"],
            },
          },
        },
        required: ["dishes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_dishes",
      description:
        "Propose updating one or more existing dishes, matched by their item number. This does NOT " +
        "save anything — it only prepares a preview for the user to review and confirm. Use for " +
        "requests like 'raise the price of dish #12 to $10' or bulk price/category changes. " +
        "Only include fields that should change; omitted fields are left as-is.",
      parameters: {
        type: "object",
        properties: {
          dishes: {
            type: "array",
            description: "One entry per dish to update.",
            items: {
              type: "object",
              properties: {
                number: {type: "string", description: "Item number of the dish to update (required to match the row)"},
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
  },
];

export const AI_WRITE_TOOL_NAMES = AI_WRITE_TOOLS.map(tool => tool.function.name);
