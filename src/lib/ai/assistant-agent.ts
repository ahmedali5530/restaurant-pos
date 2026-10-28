import type {DbClient} from "@/api/reports/shared/types.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";
import {
  callOpenAIChat,
  type AiTask,
  type OpenAIChatMessage,
  type OpenAIToolDefinition,
} from "@/lib/openai.service.ts";
import {isLocalAiReportCompactMode} from "@/lib/ai/config.ts";
import {getAiAssistantSystemPrompt} from "@/lib/ai/schema.ts";
import {executeAiReportTool, type ExecuteToolContext} from "@/lib/ai/tools/executor.ts";
import {canUseWriteTool} from "@/lib/ai/tools/write-permissions.ts";
import {listWriteToolNames} from "@/lib/ai/tools/write-tool-registry.ts";
import {buildWriteProposal, type TFunc, type WriteProposal, type WriteToolContext} from "@/lib/ai/tools/write-tools.ts";
import {selectAssistantToolsForPrompt} from "@/lib/ai/tools/select-assistant-tools.ts";
import type {AiReportToolDomain} from "@/lib/ai/tools/categories.ts";
import {type AiChartSpec, dedupeCharts} from "@/lib/ai/charts.ts";
import {tryInventoryOperationFastPath} from "@/lib/ai/inventory-operation-fast-path.ts";
import {tryEmployeeDetailFastPath} from "@/lib/ai/employee-fast-path.ts";
import {tryDishRecipeFastPath} from "@/lib/ai/dish-recipe-fast-path.ts";
import {sanitizeAssistantAnswer} from "@/lib/ai/answer-sanitize.ts";
import {formatDishRecipeAsAnswer} from "@/api/reports/sales/dish-recipe.ts";
import {LOOKUP_USER_GUIDE_TOOL_NAME} from "@/lib/ai/tools/user-guide-tool-definition.ts";
import {
  isUserGuideHowToPrompt,
  lookupUserGuide,
  suggestUserGuideChapterForPath,
} from "@/lib/ai/user-guide.ts";
import {
  appendDeferredToolResults,
  ensureToolCallResultsComplete,
} from "@/lib/ai/assistant-tool-messages.ts";

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
  writeContext?: WriteToolContext;
  /** App UI language (i18n) for user-guide locale folder. */
  language?: string;
  /** Current route for suggested guide chapter. */
  pathname?: string;
  /**
   * Prior user/assistant prose only (no tool traces). Context for follow-ups;
   * the model must act on the latest prompt alone.
   */
  conversationHistory?: {role: "user" | "assistant"; content: string}[];
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

type ResolvedToolset = {
  tools: OpenAIToolDefinition[];
  domains: AiReportToolDomain[];
  compact: boolean;
};

const resolveToolset = (prompt: string, allowedModules: string[]): ResolvedToolset => {
  const compact = isLocalAiReportCompactMode("reporting");
  const {tools, domains} = selectAssistantToolsForPrompt(prompt, allowedModules, {compact});
  return {tools, domains, compact};
};

const extractLastUserPrompt = (messages: OpenAIChatMessage[]): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      return messageText(msg.content);
    }
  }
  return "";
};

async function runLoop(
  db: AssistantDbClient,
  t: TFunc,
  messages: OpenAIChatMessage[],
  options: AssistantAgentOptions & {tools: OpenAIToolDefinition[]},
): Promise<AssistantAgentResult> {
  const {tools} = options;
  const context: ExecuteToolContext = {charts: []};

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const safeMessages = ensureToolCallResultsComplete(messages);
    if (safeMessages !== messages) {
      messages.length = 0;
      messages.push(...safeMessages);
    }

    const response = await callOpenAIChat({messages, tools, task: options.task ?? "reporting"});
    const choice = response.choices[0]?.message;

    if (!choice) {
      throw new Error("AI returned an empty response.");
    }

    if (!choice.tool_calls?.length) {
      const raw = messageText(choice.content);
      const answer = sanitizeAssistantAnswer(raw);
      if (!answer) {
        if (raw) {
          messages.push(choice);
          messages.push({
            role: "user",
            content:
              "Your previous reply was invalid tool-call markup. "
              + "Use the function-calling interface (tool_calls), or answer in plain language. Do not print DSML/XML.",
          });
          continue;
        }
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
        // Sibling tool_calls in this same assistant message still need results
        // or confirm/resume fails with insufficient tool messages.
        const proposal = await buildWriteProposal(name, args, {db, t, context: options.writeContext});
        appendDeferredToolResults(messages, choice.tool_calls, toolCall.id);
        return {type: "write_proposal", proposal, toolCallId: toolCall.id, charts: dedupeCharts(context.charts), messages};
      }

      if (name === LOOKUP_USER_GUIDE_TOOL_NAME) {
        try {
          const chapter = typeof args.chapter === "string" ? args.chapter : "";
          const query = typeof args.query === "string" ? args.query : undefined;
          const result = await lookupUserGuide({
            chapter,
            language: options.language ?? "en",
            query,
          });
          messages.push({role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result)});
        } catch (err) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({error: err instanceof Error ? err.message : "Guide lookup failed"}),
          });
        }
        continue;
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

/** Start a new turn from a user prompt; optional capped prose history as context only. */
export async function runAiAssistantAgent(
  db: AssistantDbClient,
  t: TFunc,
  prompt: string,
  options: AssistantAgentOptions,
): Promise<AssistantAgentResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Prompt is empty.");
  }

  const {tools, domains, compact} = resolveToolset(trimmed, options.allowedModules);
  const writeToolNames = tools
    .map(tool => tool.function.name)
    .filter(name => WRITE_TOOL_NAME_SET.has(name));
  const suggestedChapter = options.pathname
    ? suggestUserGuideChapterForPath(options.pathname)
    : null;
  const systemContent = getAiAssistantSystemPrompt(domains, compact, writeToolNames, {
    language: options.language,
    pathname: options.pathname,
    suggestedChapter,
  });

  const priorContext: OpenAIChatMessage[] = (options.conversationHistory ?? [])
    .filter(entry => entry.content?.trim())
    .map(entry => ({role: entry.role, content: entry.content.trim()}));

  const turnMessages = (extra?: OpenAIChatMessage[]): OpenAIChatMessage[] => [
    {role: "system", content: systemContent},
    ...priorContext,
    {role: "user", content: trimmed},
    ...(extra ?? []),
  ];

  const fastPathMessages = (instruction: string): OpenAIChatMessage[] =>
    turnMessages([{role: "user", content: instruction}]);

  const finishAnswer = (answer: string, extra?: OpenAIChatMessage[]): AssistantAgentResult => ({
    type: "answer",
    answer,
    charts: [],
    messages: turnMessages([...(extra ?? []), {role: "assistant", content: answer}]),
  });

  const skipDataFastPaths = isUserGuideHowToPrompt(trimmed);

  if (!skipDataFastPaths) {
    const inventoryFastPath = await tryInventoryOperationFastPath(db, trimmed, {
      onToolStart: options.onToolStart,
    });
    if (inventoryFastPath) {
      const response = await callOpenAIChat({
        messages: fastPathMessages(inventoryFastPath.instruction),
        tools: [],
        task: options.task ?? "reporting",
      });
      const answer = messageText(response.choices[0]?.message?.content);
      if (!answer) {
        throw new Error("AI returned an empty response.");
      }
      return finishAnswer(answer);
    }

    const employeeFastPath = await tryEmployeeDetailFastPath(db, trimmed, {
      onToolStart: options.onToolStart,
    });
    if (employeeFastPath) {
      const response = await callOpenAIChat({
        messages: fastPathMessages(employeeFastPath.instruction),
        tools: [],
        task: options.task ?? "reporting",
      });
      const answer = messageText(response.choices[0]?.message?.content);
      if (!answer) {
        throw new Error("AI returned an empty response.");
      }
      return finishAnswer(answer);
    }

    const dishRecipeFastPath = await tryDishRecipeFastPath(db, trimmed, {
      onToolStart: options.onToolStart,
    });
    if (dishRecipeFastPath) {
      if (dishRecipeFastPath.directAnswer?.trim()) {
        return finishAnswer(dishRecipeFastPath.directAnswer.trim());
      }
      const response = await callOpenAIChat({
        messages: fastPathMessages(dishRecipeFastPath.instruction),
        tools: [],
        task: options.task ?? "reporting",
      });
      const answer = sanitizeAssistantAnswer(messageText(response.choices[0]?.message?.content));
      if (!answer) {
        // Never show a blank bubble — fall back to the structured tool payload.
        const fallback = formatDishRecipeAsAnswer(dishRecipeFastPath.result as any);
        if (fallback.trim()) {
          return finishAnswer(fallback.trim());
        }
        throw new Error("AI returned an empty response.");
      }
      return finishAnswer(answer);
    }
  }

  return runLoop(db, t, turnMessages(), {...options, prompt: trimmed, tools});
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
  const prompt = options.prompt?.trim() || extractLastUserPrompt(messages);
  const {tools} = resolveToolset(prompt, options.allowedModules);

  const content = outcome.confirmed
    ? JSON.stringify({applied: true, summary: outcome.summary ?? null})
    : JSON.stringify({applied: false, reason: outcome.error ?? "User cancelled this change."});

  const alreadyAnswered = messages.some(
    (message) => message.role === "tool" && message.tool_call_id === pendingToolCallId,
  );
  const next: OpenAIChatMessage[] = alreadyAnswered
    ? [...messages]
    : [...messages, {role: "tool", tool_call_id: pendingToolCallId, content}];

  // Sibling tool_calls may still be missing if history came from an older buggy pause.
  const repaired = ensureToolCallResultsComplete(next);

  return runLoop(db, t, repaired, {...options, prompt, tools});
}
