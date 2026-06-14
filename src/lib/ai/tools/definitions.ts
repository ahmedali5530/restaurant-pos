import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

export const AI_REPORT_TOOLS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "resolve_date_range",
      description: "Convert a natural language date phrase into startDate and endDate for database queries.",
      parameters: {
        type: "object",
        properties: {
          phrase: {
            type: "string",
            description: 'Date phrase such as "yesterday", "today", "this week", "last week", "this month", "last month"',
          },
        },
        required: ["phrase"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_selling_dishes",
      description: "Get the top selling dishes by revenue or quantity. Omit startDate and endDate to query all available data.",
      parameters: {
        type: "object",
        properties: {
          startDate: {type: "string", description: "Optional start datetime in DB format"},
          endDate: {type: "string", description: "Optional end datetime in DB format"},
          limit: {type: "number", description: "Max number of dishes to return", default: 10},
          sortBy: {type: "string", enum: ["revenue", "quantity"], default: "revenue"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Get sales summary KPIs including net sales, payments, taxes, discounts, and voids. Omit startDate and endDate to query all available data.",
      parameters: {
        type: "object",
        properties: {
          startDate: {type: "string", description: "Optional start datetime in DB format"},
          endDate: {type: "string", description: "Optional end datetime in DB format"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_mix",
      description: "Get product mix by category with sales amounts, costs, and profit. Omit startDate and endDate to query all available data.",
      parameters: {
        type: "object",
        properties: {
          startDate: {type: "string", description: "Optional start datetime in DB format"},
          endDate: {type: "string", description: "Optional end datetime in DB format"},
          limit: {type: "number", description: "Optional limit for top items across all categories"},
        },
      },
    },
  },
];
