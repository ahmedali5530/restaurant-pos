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
      description: "Convert a natural language date phrase into startDate and endDate for database queries. Always use this (or pass phrase to data tools) for relative dates like today, this month, last week — never guess dates.",
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
      description: "Get tips collected from paid orders (matches Advanced Sales report tip column). Returns tipsCollected, tipsByCashier, projectedShares (weighted split using tip_distribution settings), and savedDistributions (finalized records if any). For 'today' pass phrase: today.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          phrase: {type: "string", description: "Natural date phrase e.g. today, yesterday, this week"},
          shiftId: {type: "string", description: "Optional shift id to filter cashiers and distribution pool"},
          includeProjectedDistribution: {type: "boolean", default: true},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_session_sales",
      description: "Sales summary for every order taker during their current active clock-in session (time_entry where clock_out is empty). Returns session duration, net sales, checks, guests, average check, and average guest sale per order taker.",
      parameters: {type: "object", properties: {}},
    },
  },
  {
    type: "function",
    function: {
      name: "list_active_sessions",
      description: "List users currently clocked in (active time_entry sessions with no clock_out).",
      parameters: {type: "object", properties: {}},
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_sales",
      description: "Get per-server net sales, checks, and guests for a date range. For current clock-in sessions use get_current_session_sales instead.",
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
      description: "Get discount usage summary with promotional detail and bill-percent flags. Use billPercentThreshold (default 20) to highlight discounts exceeding that share of the bill.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          billPercentThreshold: {type: "number", default: 20},
        },
      },
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
      description: "Get current inventory levels from the inventory ledger (source of truth) and items below reorder level.",
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
      description: "Get inventory ledger movements by reference type: purchase, purchase_return, issue, issue_return, waste, adjustment, transfer_in, transfer_out, production_input, production_output, buffet_consumption.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
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
      description: "Get inventory consumption summary by item from ledger (issues + buffet consumption).",
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
      description: "Get waste summary by inventory item from the inventory ledger.",
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
      description: "Compare purchases vs consumption (issues + buffet) by item using ledger movements.",
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
      description: "Get user activity/audit tracking log entries (module, user, payload). Large result sets — for fraud/suspicious prompts, call after lighter audit tools and use a narrow date range with limit.",
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
      name: "get_server_ticket_times",
      description: "Server speed rankings using ticket time (created_at to completed_at). Returns fastest/slowest servers, turnaround vs check size. Not rider delivery time.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          limit: {type: "number", default: 3},
          dineInOnly: {type: "boolean"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_staff_accountability_metrics",
      description: "Void, discount, and deleted-item rates per order taker vs team average. Flags staff exceeding threshold.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          thresholdMultiplier: {type: "number", default: 1.5},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_engineering_matrix",
      description: "Menu engineering matrix: classify items as Stars, Plowhorses, Puzzles, or Dogs by popularity and margin.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_sales_trends",
      description: "Month-over-month dish volume trends. Highlights high-profit items with declining sales.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          volumeDropPercent: {type: "number", default: 10},
          highProfitOnly: {type: "boolean", default: true},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_price_change_impact",
      description: "Estimate gross profit impact of a price change on top-volume items (assumes volume unchanged).",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          priceChangePercent: {type: "number", default: 5},
          topN: {type: "number", default: 3},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_void_and_cancel_summary",
      description: "Summarize void reasons, cancelled orders, and complimentary (100% discount) comps.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 50}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_hourly_labor_vs_sales",
      description: "Hourly labor cost % vs net sales. Flags over-staffing windows. Use phrase last Friday or peak hours for hour filter.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          startHour: {type: "number"},
          endHour: {type: "number"},
          hourPhrase: {type: "string"},
          laborPercentThreshold: {type: "number", default: 35},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_prep_times_by_order_type",
      description: "Average ticket time (created to completed) by order type — e.g. delivery vs dine-in.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_kitchen_station_delays",
      description: "Kitchen prep delays by station, stage, and category during peak hours (default 7-9 PM).",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          startHour: {type: "number"},
          endHour: {type: "number"},
          hourPhrase: {type: "string"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cash_settlement_audit",
      description: "Cash-settled orders modified or with items removed shortly before close.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          minutesBeforeClose: {type: "number", default: 30},
          limit: {type: "number", default: 50},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trial_balance",
      description: "Trial balance as-of date from posted journal lines. Returns debit/credit totals and isBalanced flag. Read-only.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          asOf: {type: "string", description: "As-of datetime; defaults to endDate or today"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_balance_sheet",
      description: "Balance sheet (assets, liabilities, equity) as-of date from posted journal lines. Read-only.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          asOf: {type: "string", description: "As-of datetime; defaults to endDate or today"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_profit_loss",
      description: "Profit & loss (income, expenses, net profit) for a date range from posted journal lines. Read-only.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_cash_flow",
      description: "Cash flow by source module and Operating/Investing/Financing buckets for cash/bank accounts. Read-only.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_general_ledger",
      description: "General ledger summary with opening balance, period debits/credits, and closing balance per account. Optional accountCode filter. Read-only.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          accountCode: {type: "string"},
          accountId: {type: "string"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_journal_entries",
      description: "List journal entries for a date range. Filter by status (posted/draft/reversed) or source_module. Read-only.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          status: {type: "string", enum: ["draft", "posted", "reversed"]},
          sourceModule: {type: "string"},
          limit: {type: "number", default: 50},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_statement",
      description: "Customer or supplier account statement with opening balance, line detail, and closing balance. Requires accountCode. Uses name/code heuristics for AR/AP. Read-only.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          accountCode: {type: "string"},
          accountId: {type: "string"},
          statementType: {type: "string", enum: ["customer", "supplier"], default: "customer"},
        },
        required: ["accountCode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_accounts",
      description: "List chart of accounts. Filter by headType, customerOnly, supplierOnly, or search. Read-only.",
      parameters: {
        type: "object",
        properties: {
          headType: {type: "string", enum: ["asset", "liability", "equity", "income", "expense"]},
          search: {type: "string"},
          customerOnly: {type: "boolean"},
          supplierOnly: {type: "boolean"},
          activeOnly: {type: "boolean", default: true},
        },
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
  {
    type: "function",
    function: {
      name: "get_labor_dashboard_snapshot",
      description: "Get real-time labor dashboard KPIs: clocked-in count, labor cost today, projected EOD cost, labor %, scheduled/missing/late/on-break counts.",
      parameters: {type: "object", properties: {}},
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_labor_cost",
      description: "Get day-by-day labor cost breakdown for a date range.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_labor_percent",
      description: "Get labor cost as a percentage of net sales for a date range.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_overtime_report",
      description: "Get overtime hours and pay by employee for a date range.",
      parameters: {
        type: "object",
        properties: {...dateRangeProps, limit: {type: "number", default: 20}},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attendance_report",
      description: "Get attendance summary: scheduled vs worked, late, absent, on-time counts by employee.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_payroll_summary",
      description: "Get payroll summary from payroll snapshots for a date range.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_scheduled_vs_actual",
      description: "Compare scheduled vs actual labor hours and cost by employee and day.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_labor_trend",
      description: "Get labor cost trend over time with optional labor percent.",
      parameters: {type: "object", properties: dateRangeProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_labor_datasets",
      description: "Bundle key labor metrics for AI analysis: dashboard, daily cost, labor %, overtime, attendance, payroll, schedule variance, trend, top cost employees.",
      parameters: {
        type: "object",
        properties: {
          ...dateRangeProps,
          topLimit: {type: "number", default: 10},
        },
      },
    },
  },
];
