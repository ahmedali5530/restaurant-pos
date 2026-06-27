import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

const dateRangeProps = {
  startDate: {type: "string", description: "Optional start datetime in DB format"},
  endDate: {type: "string", description: "Optional end datetime in DB format"},
  phrase: {
    type: "string",
    description: 'Optional date phrase such as "today", "yesterday", "this week". Use when startDate/endDate are not set.',
  },
};

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
            description: 'Date phrase such as "yesterday", "today", "this week", "last week", "last 7 days", "last 30 days", "Q1 2026"',
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
      description: "Get the top selling dishes by revenue or quantity.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          limit: {type: "number", description: "Max number of dishes", default: 10},
          sortBy: {type: "string", enum: ["revenue", "quantity"], default: "revenue"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Get sales summary KPIs including net sales, payments, taxes, discounts, voids, and day parts.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_unsold_products",
      description: "Find menu products with zero paid sales in a date range. Compares the full active menu catalog against sold products — use this for 'products that haven't sold' questions, NOT get_top_selling_dishes alone.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          limit: {type: "number", description: "Max unsold products to return", default: 100},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_mix",
      description: "Get product mix by category with sales amounts, costs, and profit.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          limit: {type: "number", description: "Optional limit for top items across all categories"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_voids",
      description: "Get void entries with reasons, amounts, and staff.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 50}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tips",
      description: "Get tip distributions and per-user totals.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, shiftId: {type: "string"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_sales",
      description: "Get per-server net sales, checks, and guests.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 20}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tax_summary",
      description: "Get tax collected summary from paid orders.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_discount_summary",
      description: "Get discount usage summary from paid orders including order-level and line-level discounts. For 'today' or other periods, pass phrase or call resolve_date_range first.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_coupon_summary",
      description: "Get coupon usage and amounts from paid orders.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_weekly_sales",
      description: "Get day-by-day sales trend.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_hourly_product_sales",
      description: "Get product sales grouped by hour.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 20}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_inventory",
      description: "Get current inventory levels and items below reorder level.",
      parameters: {
        type: "object",
        properties: {limit: {type: "number", default: 100}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory_movements",
      description: "Get inventory movements by type: purchase, purchase_return, issue, issue_return, waste.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          type: {type: "string", enum: ["purchase", "purchase_return", "issue", "issue_return", "waste"]},
          limit: {type: "number", default: 50},
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_consumption",
      description: "Get inventory consumption (issues) summary by item.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 50}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_waste_summary",
      description: "Get waste summary by inventory item.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 50}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sale_vs_consumption",
      description: "Compare purchases vs issues (consumption) by item.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_kitchen_reconciliation",
      description: "Get kitchen reconciliation records.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 20}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expenses",
      description: "Get expenses from day closings by category.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_activity_log",
      description: "Get user activity/audit log entries.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 50}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cash_closing",
      description: "Get cash closing summary for a date.",
      parameters: {
        type: "object",
        properties: {date: {type: "string", description: "Date in YYYY-MM-DD format"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orders",
      description: "List orders filtered by status and/or delivery channel. For delivery orders use deliveryOnly=true. 'Pending delivery orders' means delivery orders awaiting fulfillment (status Pending or In Progress), NOT a date phrase.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          deliveryOnly: {
            type: "boolean",
            description: "When true, only orders with a delivery object (online/delivery channel)",
          },
          statuses: {
            type: "array",
            items: {type: "string"},
            description: 'Order statuses to include, e.g. ["In Progress"], ["Paid"]. Pass status here — "in progress" is a status, NOT a date phrase.',
          },
          status: {
            type: "string",
            description: 'Single order status, e.g. "In Progress"',
          },
          limit: {type: "number", description: "Max orders to return", default: 50},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_lifecycle",
      description: "Get merge and split order statistics only — NOT for listing orders by status. Use get_orders instead.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_time_series",
      description: "Get time-bucketed data for charts and forecasting.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          metric: {
            type: "string",
            enum: ["net_sales", "order_count", "void_amount", "consumption_qty", "waste_qty", "purchase_qty"],
          },
          granularity: {type: "string", enum: ["daily", "weekly", "hourly"], default: "daily"},
        },
        required: ["metric"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forecast_sales",
      description: "Forecast sales using historical time series. Always call get_time_series first.",
      parameters: {
        type: "object",
        properties: {
          points: {
            type: "array",
            items: {
              type: "object",
              properties: {period: {type: "string"}, value: {type: "number"}},
            },
            description: "Historical data points from get_time_series",
          },
          forecastDays: {type: "number", default: 7},
          method: {type: "string", enum: ["linear_regression", "moving_average", "exponential_smoothing"], default: "linear_regression"},
        },
        required: ["points"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forecast_inventory",
      description: "Forecast inventory stock levels based on consumption history.",
      parameters: {
        type: "object",
        properties: {
          itemId: {type: "string"},
          itemName: {type: "string"},
          currentStock: {type: "number"},
          consumptionPoints: {
            type: "array",
            items: {
              type: "object",
              properties: {period: {type: "string"}, value: {type: "number"}},
            },
          },
          forecastDays: {type: "number", default: 14},
          reorderLevel: {type: "number"},
        },
        required: ["currentStock", "consumptionPoints"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_periods",
      description: "Compare a metric between two date ranges.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["net_sales", "sales_summary", "voids", "top_dishes", "order_count", "void_amount"],
          },
          period1Start: {type: "string"},
          period1End: {type: "string"},
          period2Start: {type: "string"},
          period2End: {type: "string"},
        },
        required: ["metric", "period1Start", "period1End", "period2Start", "period2End"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_snapshot",
      description: "Quick business health overview with key KPIs and top dishes.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "render_chart",
      description: "Render a chart from data fetched by prior tools. Use for visual output.",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string"},
          type: {type: "string", enum: ["line", "bar", "pie"]},
          title: {type: "string"},
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                x: {type: "string"},
                y: {type: "number"},
                period: {type: "string"},
                value: {type: "number"},
                label: {type: "string"},
                id: {type: "string"},
              },
            },
          },
          xLabel: {type: "string"},
          yLabel: {type: "string"},
        },
        required: ["type", "title", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_staff",
      description: "List staff/users for name-to-ID resolution.",
      parameters: {
        type: "object",
        properties: {search: {type: "string"}, limit: {type: "number", default: 50}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_categories",
      description: "List menu categories.",
      parameters: {
        type: "object",
        properties: {limit: {type: "number", default: 50}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_menu_items",
      description: "List all active menu products/dishes in the catalog.",
      parameters: {
        type: "object",
        properties: {
          search: {type: "string", description: "Optional name search"},
          limit: {type: "number", default: 500},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_inventory_items",
      description: "List inventory items for name-to-ID resolution.",
      parameters: {
        type: "object",
        properties: {search: {type: "string"}, limit: {type: "number", default: 50}},
      },
    },
  },
];
