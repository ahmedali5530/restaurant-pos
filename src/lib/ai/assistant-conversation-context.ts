import type {OpenAIChatMessage} from "@/lib/openai.service.ts";
import type {AssistantDisplayEntry} from "@/lib/ai/assistant-conversation.storage.ts";

/** Max prior user/assistant pairs (not counting the latest user message). */
export const ASSISTANT_CONTEXT_MAX_PAIRS = 4;
/** Soft cap on total characters of prior context. */
export const ASSISTANT_CONTEXT_MAX_CHARS = 8000;

export type ProseHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

const truncate = (text: string, max: number): string => {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
};

/**
 * Build capped prose history for the model from display entries.
 * Excludes system/cleanse-download chrome noise; keeps user + assistant text only.
 * Does not include the latest user message (caller adds that separately).
 */
export const buildAssistantContextHistory = (
  entries: AssistantDisplayEntry[],
  options: {
    maxPairs?: number;
    maxChars?: number;
    /** When true, drop the trailing user entry (current prompt already sent separately). */
    omitLastUser?: boolean;
  } = {},
): ProseHistoryTurn[] => {
  const maxPairs = options.maxPairs ?? ASSISTANT_CONTEXT_MAX_PAIRS;
  const maxChars = options.maxChars ?? ASSISTANT_CONTEXT_MAX_CHARS;

  let source = entries.filter(
    (entry): entry is AssistantDisplayEntry & {role: "user" | "assistant"} =>
      entry.role === "user" || entry.role === "assistant",
  );

  if (options.omitLastUser !== false) {
    for (let i = source.length - 1; i >= 0; i--) {
      if (source[i].role === "user") {
        source = source.slice(0, i);
        break;
      }
    }
  }

  const turns: ProseHistoryTurn[] = source.map(entry => ({
    role: entry.role,
    content: truncate(entry.content, 2000),
  }));

  // Keep last N pairs (≈ 2N messages).
  const maxMessages = maxPairs * 2;
  let sliced = turns.length > maxMessages ? turns.slice(-maxMessages) : turns;

  let total = sliced.reduce((sum, turn) => sum + turn.content.length, 0);
  while (sliced.length > 2 && total > maxChars) {
    sliced = sliced.slice(2);
    total = sliced.reduce((sum, turn) => sum + turn.content.length, 0);
  }

  return sliced;
};

/** Convert prose turns to OpenAI chat messages. */
export const proseHistoryToMessages = (turns: ProseHistoryTurn[]): OpenAIChatMessage[] =>
  turns.map(turn => ({role: turn.role, content: turn.content}));
