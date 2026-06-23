import type {DbClient} from "@/api/reports/shared/types.ts";
import type {AiChartSpec} from "@/lib/ai/charts.ts";
import {dedupeCharts} from "@/lib/ai/charts.ts";
import {buildAutoChartsFromToolResults} from "@/lib/ai/auto-charts.ts";
import type {AiReportFormat} from "@/lib/ai.report.storage.ts";
import {getAiReportSystemPrompt} from "@/lib/ai/schema.ts";
import {executeAiReportTool} from "@/lib/ai/tools/executor.ts";
import {AI_REPORT_TOOLS} from "@/lib/ai/tools/definitions.ts";
import {filterToolsByPermissions} from "@/lib/ai/tools/permissions.ts";
import {callOpenAIChat, type OpenAIChatMessage} from "@/lib/openai.service.ts";

const MAX_ITERATIONS = 10;

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
  const tools = options.allowedModules?.length
    ? filterToolsByPermissions(AI_REPORT_TOOLS, options.allowedModules)
    : AI_REPORT_TOOLS;

  const messages: OpenAIChatMessage[] = [
    {role: "system", content: getAiReportSystemPrompt(format)},
    ...(options.conversationHistory ?? []).flatMap(entry => [
      {role: entry.role, content: entry.content} as OpenAIChatMessage,
    ]),
    {role: "user", content: trimmedPrompt},
  ];

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
