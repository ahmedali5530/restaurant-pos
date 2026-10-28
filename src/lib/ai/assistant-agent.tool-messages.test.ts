import {describe, expect, it} from "vitest";
import type {OpenAIChatMessage} from "@/lib/openai.service.ts";
import {
  appendDeferredToolResults,
  ensureToolCallResultsComplete,
} from "@/lib/ai/assistant-tool-messages.ts";

const toolCall = (id: string, name: string) => ({
  id,
  type: "function" as const,
  function: {name, arguments: "{}"},
});

describe("appendDeferredToolResults", () => {
  it("adds deferred results for sibling tool_calls but not the pending write", () => {
    const messages: OpenAIChatMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          toolCall("call_write", "propose_create_categories"),
          toolCall("call_dishes", "propose_create_dishes"),
          toolCall("call_mods", "propose_create_modifier_groups"),
        ],
      },
    ];

    appendDeferredToolResults(messages, messages[0].tool_calls!, "call_write");

    const toolMsgs = messages.filter((m) => m.role === "tool");
    expect(toolMsgs.map((m) => m.tool_call_id).sort()).toEqual([
      "call_dishes",
      "call_mods",
    ]);
    expect(toolMsgs.every((m) => String(m.content).includes("deferred"))).toBe(true);
  });

  it("does not duplicate already-answered siblings", () => {
    const messages: OpenAIChatMessage[] = [
      {
        role: "assistant",
        tool_calls: [
          toolCall("call_read", "list_categories"),
          toolCall("call_write", "propose_create_categories"),
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_read",
        content: JSON.stringify({rows: []}),
      },
    ];

    appendDeferredToolResults(messages, messages[0].tool_calls!, "call_write");
    expect(messages.filter((m) => m.role === "tool")).toHaveLength(1);
  });
});

describe("ensureToolCallResultsComplete", () => {
  it("stubs missing tool results so resume history is valid", () => {
    const messages: OpenAIChatMessage[] = [
      {
        role: "assistant",
        tool_calls: [
          toolCall("a", "propose_create_categories"),
          toolCall("b", "propose_create_dishes"),
        ],
      },
      {role: "tool", tool_call_id: "a", content: '{"applied":true}'},
    ];

    const repaired = ensureToolCallResultsComplete(messages);
    const ids = repaired.filter((m) => m.role === "tool").map((m) => m.tool_call_id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("returns the same array when already complete", () => {
    const messages: OpenAIChatMessage[] = [
      {role: "assistant", tool_calls: [toolCall("a", "list_categories")]},
      {role: "tool", tool_call_id: "a", content: "{}"},
    ];
    expect(ensureToolCallResultsComplete(messages)).toBe(messages);
  });

  it("after pending write + deferred siblings, resume outcome completes the turn", () => {
    const messages: OpenAIChatMessage[] = [
      {
        role: "assistant",
        tool_calls: [
          toolCall("call_write", "propose_create_categories"),
          toolCall("call_dishes", "propose_create_dishes"),
        ],
      },
    ];
    appendDeferredToolResults(messages, messages[0].tool_calls!, "call_write");
    messages.push({
      role: "tool",
      tool_call_id: "call_write",
      content: JSON.stringify({applied: true}),
    });

    const repaired = ensureToolCallResultsComplete(messages);
    expect(repaired).toBe(messages);
    const answered = new Set(
      repaired.filter((m) => m.role === "tool").map((m) => m.tool_call_id),
    );
    expect(answered.has("call_write")).toBe(true);
    expect(answered.has("call_dishes")).toBe(true);
  });
});
