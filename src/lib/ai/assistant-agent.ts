import type {DbClient} from "@/api/reports/shared/types.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";
import {
  callOpenAIChat,
  type AiTask,
  type OpenAIChatMessage,
} from "@/lib/openai.service.ts";
import {executeAiReportTool, type ExecuteToolContext} from "@/lib/ai/tools/executor.ts";
import {filterWriteToolsByPermissions, canUseWriteTool} from "@/lib/ai/tools/write-permissions.ts";
import {listWriteToolNames} from "@/lib/ai/tools/write-tool-registry.ts";
import {buildWriteProposal, type TFunc, type WriteProposal} from "@/lib/ai/tools/write-tools.ts";
import {selectAssistantToolsForPrompt} from "@/lib/ai/tools/select-assistant-tools.ts";
import {type AiChartSpec, dedupeCharts} from "@/lib/ai/charts.ts";

const MAX_ITERATIONS = 10;
const WRITE_TOOL_NAME_SET = new Set(listWriteToolNames());

/**
 * Combined db handle the widget passes in: read tools only ever use `query`
 * (same as the existing Reports > AI agent's DbClient); write tools need the
 * fuller useDB() object (query + insert/create/merge) that ImportDbLike
 * requires. useDB()'s actual return shape already satisfies both — see
 * api/db/db.ts's `return {query, insert, create: insert, merge, ...}`.
 */
export type AssistantDbClient = DbClient & ImportDbLike;

const messageText = (content: OpenAIChatMessage["content"]): string => {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part): part is {type: "text"; text: string} => part.type === "text")
      .map(part => part.text)
      .join("\n")
      .trim();
  }
  return "";
};

export type AssistantAgentOptions = {
  allowedModules: string[];
  task?: AiTask;
  onToolStart?: (name: string) => void;
  signal?: AbortSignal;
  /** User prompt for tool routing; derived from history on resume when omitted. */
  prompt?: string;
};

export type AssistantAgentResult =
  | {type: "answer"; answer: string; charts: AiChartSpec[]; messages: OpenAIChatMessage[]}
  | {
      type: "write_proposal";
      proposal: WriteProposal;
      toolCallId: string;
      charts: AiChartSpec[];
      messages: OpenAIChatMessage[];
    };

const SYSTEM_PROMPT = [
  "You are the restaurant's in-app assistant. You can answer questions using the read-only report tools,",
  "and you can propose create/update changes using the propose_* tools.",
  "The propose_* tools NEVER save anything by themselves — they only prepare a change for the user to review.",
  "After calling a propose_* tool, stop and wait; do not call it again or assume it was applied.",
  "For bulk changes, always call propose_* with every affected row included — the user will review each row",
  "individually before confirming, so do not summarize or skip rows.",
  "Structure answers with markdown tables for structured data (orders, sales, lists).",
].join(" ");

const extractLastUserPrompt = (messages: OpenAIChatMessage[]): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      return messageText(msg.content);
    }
  }
  return "";
};

const buildToolset = (prompt: string, allowedModules: string[]) => {
  const {tools} = selectAssistantToolsForPrompt(prompt, allowedModules);
  return tools;
};

async function runLoop(
  db: AssistantDbClient,
  t: TFunc,
  messages: OpenAIChatMessage[],
  options: AssistantAgentOptions,
): Promise<AssistantAgentResult> {
  const prompt = options.prompt?.trim() || extractLastUserPrompt(messages);
  const tools = buildToolset(prompt, options.allowedModules);
  const context: ExecuteToolContext = {charts: []};

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await callOpenAIChat({messages, tools, task: options.task ?? "reporting"});
    const choice = response.choices[0]?.message;

    if (!choice) {
      throw new Error("AI returned an empty response.");
    }

    if (!choice.tool_calls?.length) {
      const answer = messageText(choice.content);
      if (!answer) {
        throw new Error("AI returned an empty response.");
      }
      messages.push(choice);
      return {type: "answer", answer, charts: dedupeCharts(context.charts), messages};
    }

    messages.push(choice);

    for (const toolCall of choice.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
      const name = toolCall.function.name;
      options.onToolStart?.(name);

      if (WRITE_TOOL_NAME_SET.has(name)) {
        // Deny-by-default even if the model somehow calls a write tool that
        // wasn't in the filtered toolset it was given (defense in depth —
        // never trust "the model was only offered allowed tools").
        if (!canUseWriteTool(name, options.allowedModules)) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({error: "Not permitted: missing permission for this write action."}),
          });
          continue;
        }

        // Build the proposal, then STOP — do not resolve this tool_call and
        // do not continue the loop. The caller must show the preview and
        // call resumeAiAssistantAgent() once the user confirms or cancels.
        const proposal = await buildWriteProposal(name, args, {db, t});
        return {type: "write_proposal", proposal, toolCallId: toolCall.id, charts: dedupeCharts(context.charts), messages};
      }

      try {
        const result = await executeAiReportTool(db, name, args, context);
        messages.push({role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result)});
      } catch (err) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({error: err instanceof Error ? err.message : "Tool execution failed"}),
        });
      }
    }
  }

  throw new Error("Assistant exceeded maximum tool iterations. Try a simpler request.");
}

/** Start a new turn from a user prompt. */
export async function runAiAssistantAgent(
  db: AssistantDbClient,
  t: TFunc,
  prompt: string,
  options: AssistantAgentOptions,
  history: OpenAIChatMessage[] = [],
): Promise<AssistantAgentResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Prompt is empty.");
  }

  const messages: OpenAIChatMessage[] = [
    {role: "system", content: SYSTEM_PROMPT},
    ...history,
    {role: "user", content: trimmed},
  ];

  return runLoop(db, t, messages, {...options, prompt: trimmed});
}

/**
 * Resume a turn after a write_proposal result was shown to the user.
 * `outcome` becomes the tool result for the pending proposal's tool_call_id,
 * so the model can react ("Applied — 3 dishes created." / "Cancelled, as you asked.")
 * without ever having been given the ability to trigger the write itself.
 */
export async function resumeAiAssistantAgent(
  db: AssistantDbClient,
  t: TFunc,
  messages: OpenAIChatMessage[],
  pendingToolCallId: string,
  outcome: {confirmed: boolean; summary?: unknown; error?: string},
  options: AssistantAgentOptions,
): Promise<AssistantAgentResult> {
  const content = outcome.confirmed
    ? JSON.stringify({applied: true, summary: outcome.summary ?? null})
    : JSON.stringify({applied: false, reason: outcome.error ?? "User cancelled this change."});

  const next: OpenAIChatMessage[] = [
    ...messages,
    {role: "tool", tool_call_id: pendingToolCallId, content},
  ];

  return runLoop(db, t, next, options);
}
