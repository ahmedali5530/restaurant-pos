import {Tables} from "@/api/db/tables.ts";
import {getBusinessDateContext} from "@/api/reports/shared/filters.ts";
import type {AiReportFormat} from "@/lib/ai.report.storage.ts";
import {getAppTimezone} from "@/lib/datetime.ts";
import type {AiReportToolDomain} from "@/lib/ai/tools/categories.ts";
import {AI_ASSISTANT_PERSONA} from "@/lib/ai/assistant-config.ts";

export {AI_ASSISTANT_PERSONA};

const QUERY_DATE_FORMAT = import.meta.env.VITE_DATE_TIME_FORMAT as string;
const APP_CURRENCY = (import.meta.env.VITE_CURRENCY as string) || "PKR";
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  PKR: "Rs",
  EUR: "€",
  GBP: "£",
};
const CURRENCY_SYMBOL = CURRENCY_SYMBOLS[APP_CURRENCY] ?? APP_CURRENCY;

const FORMAT_INSTRUCTIONS: Record<AiReportFormat, string> = {
  table: `Output format: TABLE
- Structure the final report using markdown tables for all structured data (dishes, metrics, comparisons, rankings).
- Use headings for sections and markdown tables with clear column headers for rows of data.
- Prefer tables over bullet lists when presenting multiple items with columns.
- Add an **Insights** section with 2–4 actionable observations grounded only in tool results.`,
  list: `Output format: LIST
- Structure the final report using markdown bullet lists and numbered lists.
- Use headings for sections and lists for items, metrics, and comparisons.
- Do not use markdown tables in the final answer.`,
  chart: `Output format: CHART
- You MUST call render_chart at least once with data from prior tool results before giving the final answer.
- Provide only a short markdown summary (2–4 sentences) of key findings — no bullet lists, no tables, no ranked lists in prose.
- Reference each chart by title in the summary (e.g. "See chart: Daily Net Sales").
- Use line charts for trends/time series, bar charts for rankings/comparisons, pie charts for proportions.
- If you fetched time-series or weekly sales data, always render it as a line chart.`,
  analysis: `Output format: ANALYSIS
- Structure the response with these sections:
  ## Key Findings
  ## Trends
  ## Recommendations
- Add an **Insights** section with 2–4 actionable observations grounded only in tool results.
- Never invent trends not supported by the data.`,
};

export const DOMAIN_PROMPT_SNIPPETS: Record<AiReportToolDomain, string> = {
  sales: `- Paid orders have status = 'Paid'. Use get_sales_summary for KPIs.
- Unsold products: use get_unsold_products (not get_top_selling_dishes alone).
- Tips: use get_tips with phrase. Current session sales: get_current_session_sales (not get_server_sales).
- Server speed: get_server_ticket_times (ticket time = created to completed). Accountability: get_staff_accountability_metrics.
- Menu engineering: get_menu_engineering_matrix. MoM trends: get_menu_sales_trends. Price impact: estimate_price_change_impact.
- Menu catalog: ${Tables.dishes}. Voids: ${Tables.order_voids}.`,
  inventory: `- Inventory: ${Tables.inventory_items}, locations: ${Tables.inventory_locations} (stock source of truth for on-hand). Legacy stores table: ${Tables.inventory_stores}.
- On-hand stock source of truth: ${Tables.inventory_ledger} keyed by inventory_location (SUM quantity_change by item+location). Documents post only when status = 'posted'.
- inventory_item.reorder_levels: map of inventory_location id to minimum quantity before reorder (per location).
- Admin kitchens (${Tables.kitchens}) are POS-only (routing/stations), not inventory stock locations.
- Document types: purchases, purchase returns, issues, issue returns, wastes, adjustments, stock transfers, production, buffet consumption — all reflected in ledger reference_type.
- Purchase Orders (${Tables.inventory_purchase_orders}) are approval documents (Draft / Pending Approval / Approved / Fulfilled) — use get_purchase_orders. Do NOT use get_inventory_movements type "purchase" for PO questions; that is posted purchase ledger movements.
- Reorder levels: get_current_inventory compares ledger stock to reorder_levels. Movements: get_inventory_movements (includes adjustment). Waste: get_waste_summary. Consumption (recipe×sold Paid dishes): get_consumption. Issuance (ledger issues): get_issuance. Sale vs consumption report: get_sale_vs_consumption.
- Inventory needed for this Friday / next N days / what to buy: forecast_inventory_need only. Report items[] (prior Friday actual, on-hand, adjusted need, suggestedPurchaseQty) and purchaseList. Pass localEvents from the prompt; never invent events.`,
  operations: `- Orders: ${Tables.orders}. Statuses: In Progress, Paid, Cancelled, Pending, etc.
- List orders by status: get_orders with statuses. Delivery only when user says "delivery" (deliveryOnly=true). When listing orders, make invoice numbers markdown links to /reports/order-receipt?id={orderId} so they open the printable receipt.
- Specific order id / "everything about this order": get_order_detail (items[].dishName are the dishes — never infer dishes from tracking alone; include fiscals + prints). Include a markdown link to /reports/order-receipt?id={order.id}.
- Void/cancel/comp reasons: get_void_and_cancel_summary. Prep delays: get_prep_times_by_order_type, get_kitchen_station_delays.
- Cash audit: get_cash_settlement_audit. Expenses: ${Tables.closings}. Activity/tracking: ${Tables.tracking} via get_activity_log.
- Fraud/suspicious prompts: start with get_voids, get_staff_accountability_metrics, get_cash_settlement_audit. Call get_activity_log only when needed (large payloads — use narrow dates and limit).`,
  labor: `- Staff sessions: ${Tables.time_entries} (active = clock_out is NONE).
- Hourly labor % vs sales: get_hourly_labor_vs_sales (use phrase last Friday or peak hours).
- Labor reports: get_labor_dashboard_snapshot, get_daily_labor_cost, get_overtime_report, etc.
- Staff needed for this Friday / next N days: forecast_staff_need only (hours + headcount vs last same weekday and published schedule). Pass localEvents from the prompt; never invent.
- Session sales per order taker: get_current_session_sales. Date-range server sales: get_server_sales.`,
  accounts: `- GL tables: ${Tables.accounts}, ${Tables.account_groups}, ${Tables.account_journal_entries}, ${Tables.account_journal_lines}.
- Financial statements use posted journal lines only (entry.status = 'posted'). Read-only — no create/reverse entries.
- Trial balance: get_trial_balance. Balance sheet: get_balance_sheet. P&L: get_profit_loss. Cash flow: get_cash_flow.
- General ledger: get_general_ledger (optional accountCode). Journal list: get_journal_entries.
- Customer/supplier statements: get_account_statement with accountCode. Chart of accounts: list_accounts.
- Customer/supplier detection uses code/name heuristics (same as Accounts UI). POS sales do not auto-post to GL.`,
  analysis: `- Forecasts: call get_time_series first, then forecast_sales or forecast_inventory.
- Inventory consumption forecast (overall qty): get_time_series metric=consumption_qty then forecast_sales. Do not loop issuance tools.
- Inventory qty needed / this Friday / what to buy: forecast_inventory_need (not forecast_inventory). Include last same-weekday actual, on-hand, suggestedPurchaseQty, and context.drivers.
- Staff needed / how many people: forecast_staff_need. Include last same-weekday actual vs recommended vs schedule.
- Pass localEvents extracted from the user prompt only — never invent concerts, matches, or lifts.
- Per-item stock depletion: only use forecast_inventory when you already have that item's currentStock and daily consumptionPoints.
- Comparisons: use compare_periods with two explicit date ranges. State method and that projections are estimates.`,
  chart: `- Call render_chart with data from prior tool results before the final answer.`,
  lookup: `- Use list_staff, list_categories, list_menu_items, or list_inventory_items for name-to-ID resolution.`,
  manage: `- Manage configuration (not sales totals): use list_* tools for floors, tables, discounts, taxes, users, roles, menus, kitchens, coupons, workflows, printers, shifts, etc.
- For "tables on X floor": call list_tables with floor_name. For BXGY or scoped discounts: list_discounts, list_categories, list_menu_items first, then propose_create_discounts.
- For changes: use propose_* tools — never claim tools are missing when list_* or propose_* appear in your tool list.`,
};

const FULL_DATABASE_CONTEXT = `Database context:
- Orders table: ${Tables.orders} (fields include created_at, status, items, payments, discount, tax, user, order_type)
- Order statuses: In Progress (aliases: "in progress", "progress"), Paid, Cancelled, Spilt, Merged, Refunded, Pending
- Delivery orders: only when the user says "delivery" — use get_orders with deliveryOnly=true. Otherwise list ALL orders for the requested statuses (dine-in, takeaway, delivery, etc.).
- "Pending or progress" means statuses Pending AND In Progress — never restrict to delivery unless asked.
- Use get_orders to list/filter orders by status (e.g. open In Progress orders). Use get_sales_summary only for completed/paid sales KPIs.
- Order items link to dishes (menu_item / ${Tables.dishes})
- Menu catalog: ${Tables.dishes} (active items have deleted_at = NONE). Use list_menu_items for the full catalog.
- For "products that haven't sold" / unsold menu items: use get_unsold_products (compares full menu vs paid sales). Do NOT use get_top_selling_dishes alone — it only returns items that sold.
- Order voids: ${Tables.order_voids}
- Inventory items: ${Tables.inventory_items} (reorder_levels: per-location minimum quantity map), locations: ${Tables.inventory_locations} (stock SoT), legacy stores: ${Tables.inventory_stores}
- Admin kitchens (${Tables.kitchens}) are POS-only — not stock locations.
- Stock on-hand: ${Tables.inventory_ledger} keyed by inventory_location (posted documents only). Adjustments: ${Tables.inventory_adjustments}. Purchases/issues/waste remain document history.
- Purchase Orders (${Tables.inventory_purchase_orders}): approval workflow documents with statuses Draft, Pending Approval, Approved, Fulfilled. Use get_purchase_orders for PO / purchase-order questions. Do NOT use get_orders (POS customer orders) or get_inventory_movements type "purchase" (posted purchase ledger) for PO questions.
- Day closings: ${Tables.closings}, Activity tracking: ${Tables.tracking}
- Tip amounts on paid orders: order.tip_amount (use get_tips — matches Advanced Sales tips column)
- Saved tip distribution records: ${Tables.tip_distributions} (finalized after Tip Distribution screen — may be empty until saved)
- Staff clock-in sessions: ${Tables.time_entries} (active session = clock_out is NONE). Use list_active_sessions for who is clocked in. Use get_current_session_sales for per-order-taker sales during their current session.
- Paid orders have status = 'Paid'`;

const FULL_WORKFLOW = `Workflow:
1. Call the appropriate data tool for the question domain (sales, inventory, operations).
2. Date range is optional. If the user does not mention a time period, omit startDate and endDate to query all available data.
3. For relative time periods ("today", "this month", "last week", etc.): call resolve_date_range with the phrase, OR pass phrase directly to data tools — never invent startDate/endDate yourself.
4. Anchor all relative dates to the current business date provided above (e.g. "this month" means the current calendar month, not a past year).
5. For sales/consumption trend forecasts: always call get_time_series first, then forecast_sales or forecast_inventory. Never project from memory.
5a. For inventory needed / this Friday / what should I buy / restock: call forecast_inventory_need only. Report last same-weekday actual, on-hand, adjusted need, suggestedPurchaseQty, and context (holidays, weather, prompt events). Do not create a purchase order. Pass localEvents from the prompt; never invent. If weather is missing, say so from warnings.
5b. For how many staff / headcount needed: call forecast_staff_need only. Report last same-weekday hours/headcount vs recommended vs scheduled. Pass localEvents from the prompt; never invent.
6. For discounts: prefer get_discount_summary (includes order_discounts engine records). For "today" prompts always pass phrase or resolved dates.
7. For order lists by status (In Progress, Paid, etc.): use get_orders with statuses — never use get_sales_summary or get_order_lifecycle for this. Make each invoice number a markdown link to /reports/order-receipt?id={orderId}.
7a. For a concrete order id (order:…) or "everything / full history / detail for this order": use get_order_detail. Report items[].dishName as dishes; include voids, discounts, taxes, payments, fiscals, prints, tracking, and timeline. Do not reconstruct dishes only from tracking. Include a markdown link to /reports/order-receipt?id={order.id}.
7b. For purchase orders / POs / pending approval: use get_purchase_orders — never get_orders and never get_inventory_movements type "purchase".
8. For unsold / no-sales products: use get_unsold_products with phrase like "last 60 days" — never infer unsold items from get_top_selling_dishes or get_product_mix alone.
9. For current clock-in session sales per order taker: use get_current_session_sales — not get_server_sales (which uses date ranges, not time_entry sessions).
10. For tips collected / tip distribution shares: use get_tips with phrase (e.g. today). tipsCollected sums order tip_amount on paid orders. projectedShares shows each staff member's weighted share from tip_distribution settings.
11. For server speed: get_server_ticket_times. For staff accountability (voids/discounts/deleted items): get_staff_accountability_metrics.
12. For menu engineering (Plowhorses/Puzzles): get_menu_engineering_matrix. MoM volume drops: get_menu_sales_trends. Price impact: estimate_price_change_impact.
13. For hourly labor % vs sales / over-staffing: get_hourly_labor_vs_sales with phrase (last Friday, peak hours).
14. For prep delays by channel: get_prep_times_by_order_type. Kitchen bottlenecks: get_kitchen_station_delays.
15. For cash orders modified before close: get_cash_settlement_audit. Void/cancel/comp reasons: get_void_and_cancel_summary.
16. For accounting/GL: get_trial_balance, get_balance_sheet, get_profit_loss, get_cash_flow, get_general_ledger, get_journal_entries, get_account_statement, list_accounts. Use posted journal data only.
17. For fraud/suspicious/unauthorized activity: start with get_voids, get_staff_accountability_metrics, and get_cash_settlement_audit. Call get_activity_log only when findings need tracking/payload detail (use a narrow date range and limit — do not fetch tracking first).
18. For charts: call render_chart with data from prior tool results in the same conversation.
19. For comparisons: use compare_periods with two explicit date ranges.
20. Answer in clear, concise language with specific numbers from tool results.
21. State forecast method, history range, and that projections are estimates.`;

const buildDateContextBlock = () =>
  `Current business date (${getAppTimezone()}): ${getBusinessDateContext()}.`;

export const getAiReportCorePrompt = (format: AiReportFormat = "table"): string =>
  `${AI_ASSISTANT_PERSONA} Use tools to fetch live data — never guess numbers.

${buildDateContextBlock()}
Date format for tool parameters: ${QUERY_DATE_FORMAT}. Currency: ${APP_CURRENCY} (${CURRENCY_SYMBOL}).

Rules:
- For relative dates, call resolve_date_range or pass phrase to tools — do not compute startDate/endDate from memory.
- Use tool results for all numbers. Explain tool errors plainly.
- Answer clearly with specific figures from tool output.

${FORMAT_INSTRUCTIONS[format]}`;

const buildCompactPrompt = (format: AiReportFormat, domains: AiReportToolDomain[]): string => {
  const snippets = domains
    .map(domain => DOMAIN_PROMPT_SNIPPETS[domain])
    .filter(Boolean)
    .join("\n");

  return `${getAiReportCorePrompt(format)}

Domain hints:
${snippets}`;
};



const buildFullPrompt = (format: AiReportFormat): string =>
  `${AI_ASSISTANT_PERSONA} You help managers understand sales, inventory, and operations using real data from their point-of-sale system.

${buildDateContextBlock()}
${FULL_DATABASE_CONTEXT}
- Date format for tool parameters: ${QUERY_DATE_FORMAT} (e.g. 2026-07-01 00:00)
- Business timezone: ${getAppTimezone()}
- Business currency: ${APP_CURRENCY} (${CURRENCY_SYMBOL}). Format all monetary amounts using ${APP_CURRENCY} or ${CURRENCY_SYMBOL}. Never use INR, USD, or other currencies.
- Get local or national events for ${getAppTimezone()} timezone.

You have tools to fetch live data. Always use tools when the user asks about sales, dishes, revenue, inventory, or time periods. Do not guess numbers.

${FULL_WORKFLOW}

${FORMAT_INSTRUCTIONS[format]}

If a tool returns an error, explain it plainly to the user.`;

export const getAiReportSystemPrompt = (
  format: AiReportFormat = "table",
  domains: AiReportToolDomain[] = [],
  compact = false,
): string => {
  if (compact && domains.length > 0) {
    return buildCompactPrompt(format, domains);
  }
  if (compact) {
    return getAiReportCorePrompt(format);
  }
  return buildFullPrompt(format);
};



/**
 * Write-tool rules appended to the report system prompt for the floating assistant.
 * Kept short so compact mode stays lightweight.
 */
export const AI_ASSISTANT_WRITE_RULES = [
  "You can also propose create/update changes using the propose_* tools.",
  "The propose_* tools NEVER save anything — they only prepare a change for the user to review.",
  "After calling a propose_* tool, stop and wait; do not call it again or assume it was applied.",
  "For bulk changes, call propose_* with every affected row — the user reviews each row before confirming.",
  "Do not summarize or skip rows in a write proposal.",
  "For list/show/configure questions about Manage data, use list_* read tools. For create/update, use propose_* tools.",
  "Never say you only have reporting tools when list_* or propose_* tools are available.",
].join(" ");

/**
 * System prompt for the floating assistant: reuses AI Report prompt building
 * (compact + domain hints when enabled, full workflow otherwise) plus write rules.
 * Compact mode avoids FULL_DATABASE_CONTEXT / FULL_WORKFLOW unless the profile opts out.
 */
export const getAiAssistantSystemPrompt = (
  domains: AiReportToolDomain[] = [],
  compact = false,
  writeToolNames: string[] = [],
): string => {
  const reportPrompt = getAiReportSystemPrompt("table", domains, compact);
  const writeToolsBlock = writeToolNames.length
    ? [
      "You are NOT read-only when write tools are listed below.",
      `Available write tools: ${writeToolNames.join(", ")}.`,
      "When the user asks to create or update master data, you MUST call the matching propose_* tool — never say you only have reporting tools.",
    ].join(" ")
    : null;
  const writeSection = [AI_ASSISTANT_WRITE_RULES, writeToolsBlock].filter(Boolean).join("\n");

  if (compact) {
    return [
      `${AI_ASSISTANT_PERSONA} You help managers using real data from their point-of-sale system.`,
      reportPrompt,
      writeSection,
    ].join("\n\n");
  }

  return `${reportPrompt}\n\n${writeSection}`;
};
