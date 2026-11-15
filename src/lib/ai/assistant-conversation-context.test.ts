import {describe, expect, it} from "vitest";
import {
  ASSISTANT_CONTEXT_MAX_PAIRS,
  buildAssistantContextHistory,
} from "@/lib/ai/assistant-conversation-context.ts";

describe("buildAssistantContextHistory", () => {
  it("omits the latest user message and keeps prior pairs", () => {
    const entries = [
      {role: "user" as const, content: "first question"},
      {role: "assistant" as const, content: "first answer"},
      {role: "user" as const, content: "second question"},
      {role: "assistant" as const, content: "second answer"},
      {role: "user" as const, content: "latest question"},
    ];
    const history = buildAssistantContextHistory(entries);
    expect(history.map(t => t.content)).toEqual([
      "first question",
      "first answer",
      "second question",
      "second answer",
    ]);
  });

  it("ignores system entries", () => {
    const entries = [
      {role: "user" as const, content: "q1"},
      {role: "system" as const, content: "Applied: 1"},
      {role: "assistant" as const, content: "a1"},
      {role: "user" as const, content: "latest"},
    ];
    const history = buildAssistantContextHistory(entries);
    expect(history).toEqual([
      {role: "user", content: "q1"},
      {role: "assistant", content: "a1"},
    ]);
  });

  it("caps to max pairs", () => {
    const entries: Array<{role: "user" | "assistant"; content: string}> = [];
    for (let i = 0; i < ASSISTANT_CONTEXT_MAX_PAIRS + 3; i++) {
      entries.push({role: "user", content: `u${i}`});
      entries.push({role: "assistant", content: `a${i}`});
    }
    entries.push({role: "user", content: "latest"});
    const history = buildAssistantContextHistory(entries);
    expect(history.length).toBeLessThanOrEqual(ASSISTANT_CONTEXT_MAX_PAIRS * 2);
    expect(history[history.length - 1]?.content).toMatch(/^a\d+$/);
  });
});
