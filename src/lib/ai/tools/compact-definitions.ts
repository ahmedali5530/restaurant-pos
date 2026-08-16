import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

const dateParams = {
  phrase: {type: "string"},
  startDate: {type: "string"},
  endDate: {type: "string"},
  limit: {type: "number"},
};

const dateOnly = {
  type: "object",
  properties: dateParams,
};

export const AI_REPORT_COMPACT_TOOLS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "resolve_date_range",
      description: "Convert date phrase to startDate/endDate.",
      parameters: {
        type: "object",
        properties: {phrase: {type: "string"}},
        required: ["phrase"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_selling_dishes",
      description: "Top dishes by revenue or quantity.",
      parameters: {
        type: "object",
        properties: {...dateParams, sortBy: {type: "string", enum: ["revenue", "quantity"]}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Sales KPIs: net sales, payments, taxes, discounts, voids, day parts.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_unsold_products",
      description: "Menu items with zero paid sales in period.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_mix",
      description: "Product mix by category with profit.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_voids",
      description: "Void entries with reasons and amounts.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_tips",
      description: "Tips collected and distribution shares.",
      parameters: {
        type: "object",
        properties: {
          ...dateParams,
          shiftId: {type: "string"},
          includeProjectedDistribution: {type: "boolean"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_session_sales",
      description: "Per order taker sales during active clock-in session.",
      parameters: {type: "object", properties: {}},
    },
  },
  {
    type: "function",
    function: {
      name: "list_active_sessions",
      description: "Users currently clocked in.",
      parameters: {type: "object", properties: {}},
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_sales",
      description: "Per-server net sales for a date range.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_tax_summary",
      description: "Tax collected from paid orders.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_discount_summary",
      description: "Discount usage summary.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_coupon_summary",
      description: "Coupon usage and amounts.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_weekly_sales",
      description: "Day-by-day sales trend.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_hourly_product_sales",
      description: "Product sales by hour.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_inventory",
      description: "Ledger stock levels and items below reorder.",
      parameters: {type: "object", properties: {limit: {type: "number"}}},
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory_movements",
      description: "Ledger movements by type (purchase, issue, waste, adjustment, transfer, production, buffet).",
      parameters: {
        type: "object",
        properties: {
          ...dateParams,
          type: {
            type: "string",
            enum: [
              "purchase",
              "purchase_return",
              "issue",
              "issue_return",
              "waste",
              "adjustment",
              "transfer_in",
              "transfer_out",
              "production_input",
              "production_output",
              "buffet_consumption",
            ],
          },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_consumption",
      description: "Recipe×sold consumption (not issuance).",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_issuance",
      description: "Ledger issuance (issues + buffet).",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_waste_summary",
      description: "Waste summary from ledger by item.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_sale_vs_consumption",
      description: "Sales vs recipe consumption vs issuance vs purchases.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_kitchen_reconciliation",
      description: "Kitchen reconciliation records.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_purchase_orders",
      description: "Purchase order documents by status/date (not ledger purchases).",
      parameters: {
        type: "object",
        properties: {
          ...dateParams,
          status: {
            type: "string",
            enum: ["Draft", "Pending Approval", "Approved", "Fulfilled"],
          },
          limit: {type: "number", default: 50},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expenses",
      description: "Expenses from day closings.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_activity_log",
      description: "Tracking log with payload. Defer on fraud prompts until lighter audit tools run.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_cash_closing",
      description: "Cash closing summary for a date.",
      parameters: {type: "object", properties: {date: {type: "string"}}},
    },
  },
  {
    type: "function",
    function: {
      name: "get_orders",
      description: "List orders by status and/or delivery channel.",
      parameters: {
        type: "object",
        properties: {
          ...dateParams,
          deliveryOnly: {type: "boolean"},
          statuses: {type: "array", items: {type: "string"}},
          status: {type: "string"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_detail",
      description: "Full order dossier by id: dishes, voids, discounts, taxes, payments, fiscals, prints, tracking.",
      parameters: {
        type: "object",
        properties: {
          orderId: {type: "string"},
          autoId: {type: "number"},
          invoiceNumber: {type: "number"},
          trackingLimit: {type: "number"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_lifecycle",
      description: "Merge/split order statistics.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_time_series",
      description: "Time-bucketed data for charts/forecasting.",
      parameters: {
        type: "object",
        properties: {
          ...dateParams,
          metric: {
            type: "string",
            enum: ["net_sales", "order_count", "void_amount", "consumption_qty", "waste_qty", "purchase_qty"],
          },
          granularity: {type: "string", enum: ["daily", "weekly", "hourly"]},
        },
        required: ["metric"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forecast_sales",
      description: "Forecast sales from time series points.",
      parameters: {
        type: "object",
        properties: {
          points: {
            type: "array",
            items: {
              type: "object",
              properties: {period: {type: "string"}, value: {type: "number"}},
            },
          },
          forecastDays: {type: "number"},
          method: {type: "string", enum: ["linear_regression", "moving_average", "exponential_smoothing"]},
        },
        required: ["points"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forecast_inventory",
      description: "Per-item stock depletion (needs currentStock + daily points). Overall consumption: get_time_series + forecast_sales.",
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
          forecastDays: {type: "number"},
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
      description: "Business health overview with KPIs.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "render_chart",
      description: "Render a chart from prior tool data.",
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
      description: "List staff for name lookup.",
      parameters: {type: "object", properties: {search: {type: "string"}, limit: {type: "number"}}},
    },
  },
  {
    type: "function",
    function: {
      name: "list_categories",
      description: "List menu categories.",
      parameters: {type: "object", properties: {limit: {type: "number"}}},
    },
  },
  {
    type: "function",
    function: {
      name: "list_menu_items",
      description: "List active menu products.",
      parameters: {type: "object", properties: {search: {type: "string"}, limit: {type: "number"}}},
    },
  },
  {
    type: "function",
    function: {
      name: "list_inventory_items",
      description: "List inventory items for lookup.",
      parameters: {type: "object", properties: {search: {type: "string"}, limit: {type: "number"}}},
    },
  },
  {
    type: "function",
    function: {
      name: "get_labor_dashboard_snapshot",
      description: "Real-time labor KPIs.",
      parameters: {type: "object", properties: {}},
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_labor_cost",
      description: "Day-by-day labor cost.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_labor_percent",
      description: "Labor cost as % of net sales.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_overtime_report",
      description: "Overtime hours and pay by employee.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_attendance_report",
      description: "Attendance: scheduled vs worked, late, absent.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_payroll_summary",
      description: "Payroll summary from snapshots.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_scheduled_vs_actual",
      description: "Scheduled vs actual labor hours/cost.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_labor_trend",
      description: "Labor cost trend over time.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_labor_datasets",
      description: "Bundled labor metrics for analysis.",
      parameters: {
        type: "object",
        properties: {...dateParams, topLimit: {type: "number"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_ticket_times",
      description: "Server ticket time rankings (created to completed).",
      parameters: {
        type: "object",
        properties: {...dateParams, limit: {type: "number"}, dineInOnly: {type: "boolean"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_staff_accountability_metrics",
      description: "Void/discount/deleted-item rates vs team average.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_engineering_matrix",
      description: "Menu engineering quadrants: Stars, Plowhorses, Puzzles, Dogs.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_sales_trends",
      description: "MoM dish volume trends for high-profit items.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_price_change_impact",
      description: "Profit impact of price change on top-volume items.",
      parameters: {
        type: "object",
        properties: {...dateParams, priceChangePercent: {type: "number"}, topN: {type: "number"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_void_and_cancel_summary",
      description: "Void, cancel, and comp reasons summary.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_hourly_labor_vs_sales",
      description: "Hourly labor % vs sales; over-staffing windows.",
      parameters: {
        type: "object",
        properties: {...dateParams, hourPhrase: {type: "string"}, laborPercentThreshold: {type: "number"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_prep_times_by_order_type",
      description: "Ticket time by order type (delivery vs dine-in).",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_kitchen_station_delays",
      description: "Kitchen/category delays during peak hours.",
      parameters: {
        type: "object",
        properties: {...dateParams, hourPhrase: {type: "string"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cash_settlement_audit",
      description: "Cash orders modified before close.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_trial_balance",
      description: "Trial balance as-of date; debit/credit totals.",
      parameters: {
        type: "object",
        properties: {...dateParams, asOf: {type: "string"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_balance_sheet",
      description: "Balance sheet: assets, liabilities, equity.",
      parameters: {
        type: "object",
        properties: {...dateParams, asOf: {type: "string"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_profit_loss",
      description: "P&L income, expenses, net profit.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_cash_flow",
      description: "Cash flow by source module and bucket.",
      parameters: dateOnly,
    },
  },
  {
    type: "function",
    function: {
      name: "get_general_ledger",
      description: "GL summary with opening/closing balances.",
      parameters: {
        type: "object",
        properties: {...dateParams, accountCode: {type: "string"}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_journal_entries",
      description: "Journal entries list by date/status/source.",
      parameters: {
        type: "object",
        properties: {
          ...dateParams,
          status: {type: "string"},
          sourceModule: {type: "string"},
          limit: {type: "number"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_statement",
      description: "Customer or supplier statement with running balance.",
      parameters: {
        type: "object",
        properties: {
          ...dateParams,
          accountCode: {type: "string"},
          statementType: {type: "string"},
        },
        required: ["accountCode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_accounts",
      description: "Chart of accounts lookup.",
      parameters: {
        type: "object",
        properties: {
          headType: {type: "string"},
          search: {type: "string"},
          customerOnly: {type: "boolean"},
          supplierOnly: {type: "boolean"},
        },
      },
    },
  },
];

const COMPACT_TOOL_BY_NAME = new Map(
  AI_REPORT_COMPACT_TOOLS.map(tool => [tool.function.name, tool]),
);

export const getCompactToolByName = (name: string): OpenAIToolDefinition | undefined =>
  COMPACT_TOOL_BY_NAME.get(name);
