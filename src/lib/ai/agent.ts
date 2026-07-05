import type {DbClient} from "@/api/reports/shared/types.ts";
import {getOrders} from "@/api/reports/operations/orders.ts";
import type {AiChartSpec} from "@/lib/ai/charts.ts";
import {dedupeCharts} from "@/lib/ai/charts.ts";
import {buildAutoChartsFromToolResults} from "@/lib/ai/auto-charts.ts";
import type {AiReportFormat} from "@/lib/ai.report.storage.ts";
import {isLocalAiReportCompactMode} from "@/lib/ai/config.ts";
import {isOrderListByStatusPrompt, resolveOrderListQueryFromPrompt} from "@/lib/ai/order-query.ts";
import {isUnsoldProductsPrompt, resolveUnsoldProductsDateRange} from "@/lib/ai/product-query.ts";
import {isCurrentSessionSalesPrompt} from "@/lib/ai/session-query.ts";
import {isTipsPrompt, resolveTipsDateRange, wantsTipDistribution} from "@/lib/ai/tip-query.ts";
import {getCurrentSessionServerSales} from "@/api/reports/operations/sessions.ts";
import {getTips} from "@/api/reports/sales/tips.ts";
import {getUnsoldProducts} from "@/api/reports/sales/products.ts";
import {getAiReportSystemPrompt} from "@/lib/ai/schema.ts";
import {executeAiReportTool} from "@/lib/ai/tools/executor.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";
import {callOpenAIChat, type OpenAIChatMessage} from "@/lib/openai.service.ts";

const MAX_ITERATIONS = 10;
const COMPACT_HISTORY_TURNS = 2;

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
  const compact = isLocalAiReportCompactMode();
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
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("OpenAI returned an empty response.");
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
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("OpenAI returned an empty response.");
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
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("OpenAI returned an empty response.");
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
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error("OpenAI returned an empty response.");
    }

    return finish(answer);
  }

  messages.push({role: "user", content: trimmedPrompt});

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await callOpenAIChat({messages, tools});
    const choice = response.choices[0]?.message;

    if (!choice) {
      throw new Error("OpenAI returned an empty response.");
    }

    if (!choice.tool_calls?.length) {
      const answer = choice.content?.trim();
      if (!answer) {
        throw new Error("OpenAI returned an empty response.");
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
