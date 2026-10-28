import type {OpenAIChatMessage} from "@/lib/openai.service.ts";

const DEFERRED_TOOL_RESULT = JSON.stringify({
  deferred: true,
  reason:
    "Paused for user confirmation of another write proposal. "
    + "Call this tool again after that proposal is applied or cancelled if still needed.",
});

/**
 * When pausing on a write proposal, every other tool_call in the same assistant
 * message must still get a tool result — OpenAI rejects resume otherwise.
 */
export function appendDeferredToolResults(
  messages: OpenAIChatMessage[],
  toolCalls: NonNullable<OpenAIChatMessage["tool_calls"]>,
  pendingToolCallId: string,
): void {
  for (const toolCall of toolCalls) {
    if (toolCall.id === pendingToolCallId) continue;
    const alreadyAnswered = messages.some(
      (message) => message.role === "tool" && message.tool_call_id === toolCall.id,
    );
    if (alreadyAnswered) continue;
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: DEFERRED_TOOL_RESULT,
    });
  }
}

/**
 * Repair history before calling the API: any assistant tool_calls without a
 * matching tool message get a stub result. Safe to run after resume has added
 * the pending write outcome.
 */
export function ensureToolCallResultsComplete(
  messages: OpenAIChatMessage[],
): OpenAIChatMessage[] {
  const out = [...messages];
  let changed = false;
  for (let i = 0; i < out.length; i++) {
    const msg = out[i];
    if (msg.role !== "assistant" || !msg.tool_calls?.length) continue;

    const answered = new Set<string>();
    for (let j = i + 1; j < out.length; j++) {
      const next = out[j];
      if (next.role === "assistant" || next.role === "user") break;
      if (next.role === "tool" && next.tool_call_id) {
        answered.add(next.tool_call_id);
      }
    }

    const missing = msg.tool_calls.filter((tc) => !answered.has(tc.id));
    if (!missing.length) continue;

    let insertAt = i + 1;
    while (insertAt < out.length && out[insertAt].role === "tool") {
      insertAt += 1;
    }
    const stubs = missing.map((tc) => ({
      role: "tool" as const,
      tool_call_id: tc.id,
      content: JSON.stringify({
        error: "Missing tool result; skipped to keep the conversation valid.",
      }),
    }));
    out.splice(insertAt, 0, ...stubs);
    changed = true;
  }
  return changed ? out : messages;
}
