import {createStore, del, get, set} from "idb-keyval";
import type {OpenAIChatMessage} from "@/lib/openai.service.ts";

const assistantConversationStore = createStore("posr-react-ai-assistant", "keyval");

export type AssistantDisplayEntry = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AssistantConversationSnapshot = {
  entries: AssistantDisplayEntry[];
  history: OpenAIChatMessage[];
  updatedAt: string;
};

const storageKey = (userId: string) => `conversation:${userId}`;

/** Cap local history so IndexedDB stays lightweight until server persistence lands. */
export const MAX_ASSISTANT_CONVERSATION_ENTRIES = 200;

export const trimConversationSnapshot = (
  snapshot: Pick<AssistantConversationSnapshot, "entries" | "history">,
): Pick<AssistantConversationSnapshot, "entries" | "history"> => ({
  entries: snapshot.entries.slice(-MAX_ASSISTANT_CONVERSATION_ENTRIES),
  history: snapshot.history.slice(-MAX_ASSISTANT_CONVERSATION_ENTRIES),
});

const isValidSnapshot = (value: unknown): value is AssistantConversationSnapshot => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as AssistantConversationSnapshot;
  return Array.isArray(candidate.entries) && Array.isArray(candidate.history);
};

export const loadAssistantConversation = async (
  userId: string,
): Promise<AssistantConversationSnapshot | null> => {
  if (!userId) return null;

  try {
    const raw = await get<string>(storageKey(userId), assistantConversationStore);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSnapshot(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveAssistantConversation = async (
  userId: string,
  snapshot: Pick<AssistantConversationSnapshot, "entries" | "history">,
): Promise<void> => {
  if (!userId) return;

  const trimmed = trimConversationSnapshot(snapshot);
  const payload: AssistantConversationSnapshot = {
    ...trimmed,
    updatedAt: new Date().toISOString(),
  };
  await set(storageKey(userId), JSON.stringify(payload), assistantConversationStore);
};

export const clearAssistantConversation = async (userId: string): Promise<void> => {
  if (!userId) return;
  await del(storageKey(userId), assistantConversationStore);
};
