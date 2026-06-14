import type {DbClient} from "@/api/reports/shared/types.ts";
import type {AiReportFormat} from "@/lib/ai.report.storage.ts";
import {getAiReportSystemPrompt} from "@/lib/ai/schema.ts";
import {executeAiReportTool} from "@/lib/ai/tools/executor.ts";
import {AI_REPORT_TOOLS} from "@/lib/ai/tools/definitions.ts";
import {callOpenAIChat, type OpenAIChatMessage} from "@/lib/openai.service.ts";

const MAX_ITERATIONS = 5;

export interface AiReportAgentResult {
  answer: string;
  toolsUsed: {name: string; args: Record<string, unknown>}[];
}

export interface AiReportAgentOptions {
  format?: AiReportFormat;
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

  const messages: OpenAIChatMessage[] = [
    {role: "system", content: getAiReportSystemPrompt(format)},
    {role: "user", content: trimmedPrompt},
  ];

  const toolsUsed: AiReportAgentResult["toolsUsed"] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await callOpenAIChat({messages, tools: AI_REPORT_TOOLS});
    const choice = response.choices[0]?.message;

    if (!choice) {
      throw new Error("OpenAI returned an empty response.");
    }

    if (!choice.tool_calls?.length) {
      const answer = choice.content?.trim();
      if (!answer) {
        throw new Error("OpenAI returned an empty response.");
      }

      return {answer, toolsUsed};
    }

    messages.push(choice);

    for (const toolCall of choice.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
      toolsUsed.push({name: toolCall.function.name, args});

      try {
        const result = await executeAiReportTool(db, toolCall.function.name, args);
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
