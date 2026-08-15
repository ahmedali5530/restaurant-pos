import {parseDateRangeWithPhrase} from "@/api/reports/shared/filters.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {getOrders} from "@/api/reports/operations/orders.ts";
import {getPurchaseOrders} from "@/api/reports/inventory/index.ts";
import type {AiChartSpec} from "@/lib/ai/charts.ts";
import {dedupeCharts} from "@/lib/ai/charts.ts";
import {buildAutoChartsFromToolResults} from "@/lib/ai/auto-charts.ts";
import type {AiReportFormat} from "@/lib/ai.report.storage.ts";
import {isLocalAiReportCompactMode} from "@/lib/ai/config.ts";
import {isOrderListByStatusPrompt, resolveOrderListQueryFromPrompt} from "@/lib/ai/order-query.ts";
import {
  isPurchaseOrderPrompt,
  resolvePurchaseOrderQueryFromPrompt,
} from "@/lib/ai/purchase-order-query.ts";
import {isUnsoldProductsPrompt, resolveUnsoldProductsDateRange} from "@/lib/ai/product-query.ts";
import {isCurrentSessionSalesPrompt} from "@/lib/ai/session-query.ts";
import {isTipsPrompt, resolveTipsDateRange, wantsTipDistribution} from "@/lib/ai/tip-query.ts";
import {getCurrentSessionServerSales} from "@/api/reports/operations/sessions.ts";
import {getTips} from "@/api/reports/sales/tips.ts";
import {getUnsoldProducts} from "@/api/reports/sales/products.ts";
import {getAiReportSystemPrompt} from "@/lib/ai/schema.ts";
import {executeAiReportTool} from "@/lib/ai/tools/executor.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";
import {tryAnalyticsFastPath} from "@/lib/ai/analytics-fast-path.ts";
import {tryAccountsFastPath} from "@/lib/ai/accounts-fast-path.ts";
import {isFraudSuspiciousPrompt} from "@/lib/ai/fraud-query.ts";
import {
  isInventoryConsumptionForecastPrompt,
  resolveConsumptionHistoryRange,
  resolveForecastDaysFromPrompt,
} from "@/lib/ai/forecast-query.ts";
import {forecastFromPoints} from "@/lib/ai/forecast.ts";
import {getTimeSeries} from "@/api/reports/time-series.ts";
import {getConsumptionSummary} from "@/api/reports/inventory/index.ts";
import {
  callOpenAIChat,
  type AiTask,
  type OpenAIChatMessage,
} from "@/lib/openai.service.ts";

const MAX_ITERATIONS = 10;
const COMPACT_HISTORY_TURNS = 2;

const messageText = (content: OpenAIChatMessage["content"]): string => {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((part): part is {type: "text"; text: string} => part.type === "text")
    .map(part => part.text)
    .join("\n")
    .trim();
};

/** Map report format / code path to an AI task for profile routing. */
const resolveAiTask = (format: AiReportFormat, kind: "default" | "forecast" = "default"): AiTask => {
  if (kind === "forecast") {
    return "forecast";
  }
  return format === "analysis" ? "analysis" : "reporting";
};

export interface AiReportAgentResult {
  answer: string;
  toolsUsed: {name: string; args: Record<string, unknown>}[];
  charts: AiChartSpec[];
}

export interface AiReportAgentOptions {
  format?: AiReportFormat;
  allowedModules?: string[];
  conversationHistory?: {role: "user" | "assistant"; content: string}[];
  onToolStart?: (toolName: string) => void;
}

const buildAgentMessages = (
  format: AiReportFormat,
  compact: boolean,
  domains: ReturnType<typeof selectToolsForPrompt>["domains"],
  conversationHistory: AiReportAgentOptions["conversationHistory"],
): OpenAIChatMessage[] => {
  const history = compact
    ? (conversationHistory ?? []).slice(-COMPACT_HISTORY_TURNS)
    : (conversationHistory ?? []);

  return [
    {role: "system", content: getAiReportSystemPrompt(format, domains, compact)},
    ...history.flatMap(entry => [
      {role: entry.role, content: entry.content} as OpenAIChatMessage,
    ]),
  ];
};

export const runAiReportAgent = async (
  db: DbClient,
  prompt: string,
  options: AiReportAgentOptions = {},
): Promise<AiReportAgentResult> => {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt cannot be empty.");
  }

  const format = options.format ?? "table";
  const task = resolveAiTask(format);
  const compact = isLocalAiReportCompactMode(task);
  const {tools, domains} = selectToolsForPrompt(
    trimmedPrompt,
    format,
    options.allowedModules ?? [],
    compact,
  );

  const messages = buildAgentMessages(format, compact, domains, options.conversationHistory);

  const toolsUsed: AiReportAgentResult["toolsUsed"] = [];
  const charts: AiChartSpec[] = [];
  const context = {charts};
  const toolResults: Array<{name: string; result: unknown}> = [];

  const finish = (answer: string): AiReportAgentResult => {
    if (format === "chart" && charts.length === 0) {
      charts.push(...buildAutoChartsFromToolResults(toolResults));
    }
    return {answer, toolsUsed, charts: dedupeCharts(charts)};
  };

  if (isPurchaseOrderPrompt(trimmedPrompt)) {
    options.onToolStart?.("get_purchase_orders");
    const query = resolvePurchaseOrderQueryFromPrompt(trimmedPrompt);
    const dateRange = parseDateRangeWithPhrase({phrase: query.phrase});
    const args = {
      ...dateRange,
      statuses: query.statuses,
      limit: 50,
    };
    const data = await getPurchaseOrders(db, args);
    toolsUsed.push({name: "get_purchase_orders", args});
    toolResults.push({name: "get_purchase_orders", result: data});

    const response = await callOpenAIChat({
      messages: [
        ...messages,
        {
          role: "user",
          content: `${trimmedPrompt}\n\nget_purchase_orders returned ${data.count} purchase order(s), totalAmount=${data.totalAmount}:\n${JSON.stringify(data)}\n\nSummarize PO number, status, supplier, totals, and line items. These are inventory purchase orders, not POS customer orders. If the user asks what is pending to procurement, highlight Draft / Pending Approval / Approved (not Fulfilled).`,
        },
      ],
      tools: [],
      task,
    });

    const answer = messageText(response.choices[0]?.message?.content);
    if (!answer) {
      throw new Error("AI returned an empty response.");
    }

    return finish(answer);
  }

  if (isOrderListByStatusPrompt(trimmedPrompt)) {
    options.onToolStart?.("get_orders");
    const {statuses, deliveryOnly} = resolveOrderListQueryFromPrompt(trimmedPrompt);
    const data = await getOrders(db, {statuses, deliveryOnly});
    toolsUsed.push({name: "get_orders", args: {statuses, deliveryOnly}});
    toolResults.push({name: "get_orders", result: data});

    const response = await callOpenAIChat({
      messages: [
        ...messages,
        {
          role: "user",
          content: `${trimmedPrompt}\n\nget_orders returned ${data.totalCount} order(s), overallGrandTotal=${data.overallGrandTotal}:\n${JSON.stringify(data)}\n\nInclude invoice numbers, per-order grandTotal, and overallGrandTotal in your answer.`,
        },
      ],
      tools: [],
      task,
    });

    const answer = messageText(response.choices[0]?.message?.content);
    if (!answer) {
      throw new Error("AI returned an empty response.");
    }

    return finish(answer);
  }

  if (isUnsoldProductsPrompt(trimmedPrompt)) {
    options.onToolStart?.("get_unsold_products");
    const dateRange = resolveUnsoldProductsDateRange(trimmedPrompt);
    const data = await getUnsoldProducts(db, dateRange);
    toolsUsed.push({name: "get_unsold_products", args: {...dateRange}});
    toolResults.push({name: "get_unsold_products", result: data});

    const response = await callOpenAIChat({
      messages: [
        ...messages,
        {
          role: "user",
          content: `${trimmedPrompt}\n\nget_unsold_products (${data.soldProductCount} products sold in period, ${data.unsoldCount} unsold):\n${JSON.stringify(data)}\n\nList unsold products. Mention soldProductCount and unsoldCount.`,
        },
      ],
      tools: [],
      task,
    });

    const answer = messageText(response.choices[0]?.message?.content);
    if (!answer) {
      throw new Error("AI returned an empty response.");
    }

    return finish(answer);
  }

  if (isTipsPrompt(trimmedPrompt)) {
    options.onToolStart?.("get_tips");
    const dateRange = resolveTipsDateRange(trimmedPrompt);
    const data = await getTips(db, {
      ...dateRange,
      includeProjectedDistribution: true,
    });
    toolsUsed.push({name: "get_tips", args: {...dateRange, includeProjectedDistribution: true}});
    toolResults.push({name: "get_tips", result: data});

    const distributionHint = wantsTipDistribution(trimmedPrompt) || data.projectedShares.length > 0
      ? "Include projectedShares (each person's weighted share if tips were distributed). Mention savedDistributions only if non-empty."
      : "Mention tipsCollected and tipsByCashier.";

    const response = await callOpenAIChat({
      messages: [
        ...messages,
        {
          role: "user",
          content: `${trimmedPrompt}\n\nget_tips (tipsCollected=${data.tipsCollected}, orders with tips=${data.orderCountWithTips}):\n${JSON.stringify(data)}\n\n${distributionHint} tipsCollected matches Advanced Sales (sum of order tip_amount on paid orders).`,
        },
      ],
      tools: [],
      task,
    });

    const answer = messageText(response.choices[0]?.message?.content);
    if (!answer) {
      throw new Error("AI returned an empty response.");
    }

    return finish(answer);
  }

  if (isCurrentSessionSalesPrompt(trimmedPrompt)) {
    options.onToolStart?.("get_current_session_sales");
    const data = await getCurrentSessionServerSales(db);
    toolsUsed.push({name: "get_current_session_sales", args: {}});
    toolResults.push({name: "get_current_session_sales", result: data});

    const response = await callOpenAIChat({
      messages: [
        ...messages,
        {
          role: "user",
          content: `${trimmedPrompt}\n\nget_current_session_sales (${data.activeSessionCount} active session(s)):\n${JSON.stringify(data)}\n\nReport per order taker: session duration, net sales, checks, guests, avg check, avg guest sale. Include totals.`,
        },
      ],
      tools: [],
      task,
    });

    const answer = messageText(response.choices[0]?.message?.content);
    if (!answer) {
      throw new Error("AI returned an empty response.");
    }

    return finish(answer);
  }

  if (isInventoryConsumptionForecastPrompt(trimmedPrompt)) {
    const historyRange = resolveConsumptionHistoryRange(trimmedPrompt);
    const forecastDays = resolveForecastDaysFromPrompt(trimmedPrompt, 14);

    options.onToolStart?.("get_time_series");
    const series = await getTimeSeries(db, {
      ...historyRange,
      metric: "consumption_qty",
      granularity: "daily",
    });
    toolsUsed.push({
      name: "get_time_series",
      args: {...historyRange, metric: "consumption_qty", granularity: "daily"},
    });
    toolResults.push({name: "get_time_series", result: series});

    options.onToolStart?.("forecast_sales");
    const forecast = forecastFromPoints(series.points, forecastDays, "linear_regression");
    toolsUsed.push({
      name: "forecast_sales",
      args: {points: series.points, forecastDays, method: "linear_regression"},
    });
    toolResults.push({name: "forecast_sales", result: forecast});

    options.onToolStart?.("get_consumption");
    const topConsumed = await getConsumptionSummary(db, {...historyRange, limit: 10});
    toolsUsed.push({name: "get_consumption", args: {...historyRange, limit: 10}});
    toolResults.push({name: "get_consumption", result: topConsumed});

    const response = await callOpenAIChat({
      messages: [
        ...messages,
        {
          role: "user",
          content:
            `${trimmedPrompt}\n\n`
            + `Historical daily recipe×sold consumption (last 30 days):\n${JSON.stringify(series)}\n\n`
            + `${forecastDays}-day forecast (linear regression on total daily consumption qty):\n${JSON.stringify(forecast)}\n\n`
            + `Top consumed items in the history window (recipe×sold, not issuance):\n${JSON.stringify(topConsumed)}\n\n`
            + `Summarize projected daily consumption, total over the forecast window, trend/confidence, and top items. `
            + `Do not treat this as per-item stock depletion unless current stock was provided.`,
        },
      ],
      tools: [],
      task: resolveAiTask(format, "forecast"),
    });

    const answer = messageText(response.choices[0]?.message?.content);
    if (!answer) {
      throw new Error("AI returned an empty response.");
    }
    return finish(answer);
  }

  const analyticsFastPath = await tryAnalyticsFastPath(db, trimmedPrompt);
  if (analyticsFastPath) {
    options.onToolStart?.(analyticsFastPath.toolName);
    toolsUsed.push({name: analyticsFastPath.toolName, args: analyticsFastPath.args});
    toolResults.push({name: analyticsFastPath.toolName, result: analyticsFastPath.data});

    const response = await callOpenAIChat({
      messages: [
        ...messages,
        {
          role: "user",
          content: `${trimmedPrompt}\n\n${analyticsFastPath.toolName}:\n${JSON.stringify(analyticsFastPath.data)}\n\n${analyticsFastPath.hint}`,
        },
      ],
      tools: [],
      task,
    });

    const answer = messageText(response.choices[0]?.message?.content);
    if (!answer) {
      throw new Error("AI returned an empty response.");
    }
    return finish(answer);
  }

  const accountsFastPath = await tryAccountsFastPath(db, trimmedPrompt);
  if (accountsFastPath) {
    options.onToolStart?.(accountsFastPath.toolName);
    toolsUsed.push({name: accountsFastPath.toolName, args: accountsFastPath.args});
    toolResults.push({name: accountsFastPath.toolName, result: accountsFastPath.data});

    const response = await callOpenAIChat({
      messages: [
        ...messages,
        {
          role: "user",
          content: `${trimmedPrompt}\n\n${accountsFastPath.toolName}:\n${JSON.stringify(accountsFastPath.data)}\n\n${accountsFastPath.hint}`,
        },
      ],
      tools: [],
      task,
    });

    const answer = messageText(response.choices[0]?.message?.content);
    if (!answer) {
      throw new Error("AI returned an empty response.");
    }
    return finish(answer);
  }

  const fraudWorkflowHint = isFraudSuspiciousPrompt(trimmedPrompt)
    ? "\n\nWorkflow: Start with get_voids, get_staff_accountability_metrics, and get_cash_settlement_audit. "
      + "Call get_activity_log only if findings warrant tracking detail — use a narrow date range and limit."
    : "";

  messages.push({role: "user", content: trimmedPrompt + fraudWorkflowHint});

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await callOpenAIChat({messages, tools, task});
    const choice = response.choices[0]?.message;

    if (!choice) {
      throw new Error("AI returned an empty response.");
    }

    if (!choice.tool_calls?.length) {
      const answer = messageText(choice.content);
      if (!answer) {
        throw new Error("AI returned an empty response.");
      }

      return finish(answer);
    }

    messages.push(choice);

    for (const toolCall of choice.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
      toolsUsed.push({name: toolCall.function.name, args});
      options.onToolStart?.(toolCall.function.name);

      try {
        const result = await executeAiReportTool(db, toolCall.function.name, args, context);
        if (toolCall.function.name !== "render_chart") {
          toolResults.push({name: toolCall.function.name, result});
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: err instanceof Error ? err.message : "Tool execution failed",
          }),
        });
      }
    }
  }

  throw new Error("AI report exceeded maximum tool iterations. Try a simpler question.");
};
