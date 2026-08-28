import {describe, expect, it} from "vitest";
import {
  MAX_ASSISTANT_CONVERSATION_ENTRIES,
  trimConversationSnapshot,
} from "@/lib/ai/assistant-conversation.storage.ts";

describe("trimConversationSnapshot", () => {
  it("keeps the most recent entries and history", () => {
    const entries = Array.from({length: MAX_ASSISTANT_CONVERSATION_ENTRIES + 5}, (_, i) => ({
      role: "user" as const,
      content: `message-${i}`,
    }));
    const history = Array.from({length: MAX_ASSISTANT_CONVERSATION_ENTRIES + 3}, (_, i) => ({
      role: "user" as const,
      content: `history-${i}`,
    }));

    const trimmed = trimConversationSnapshot({entries, history});

    expect(trimmed.entries).toHaveLength(MAX_ASSISTANT_CONVERSATION_ENTRIES);
    expect(trimmed.entries[0]?.content).toBe("message-5");
    expect(trimmed.history).toHaveLength(MAX_ASSISTANT_CONVERSATION_ENTRIES);
    expect(trimmed.history[0]?.content).toBe("history-3");
  });
});
