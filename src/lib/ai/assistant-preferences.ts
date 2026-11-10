import type {AssistantPersonaId} from "@/lib/ai/assistant-personas.ts";
import {DEFAULT_ASSISTANT_PERSONA, ASSISTANT_PERSONA_IDS} from "@/lib/ai/assistant-personas.ts";

export type AssistantPreferences = {
  personaId: AssistantPersonaId;
  deepResearch: boolean;
};

const DEFAULTS: AssistantPreferences = {
  personaId: DEFAULT_ASSISTANT_PERSONA,
  deepResearch: false,
};

const storageKey = (userId: string) => `posr.aiAssistant.prefs.${userId}`;

export function loadAssistantPreferences(userId: string | null | undefined): AssistantPreferences {
  if (!userId || typeof localStorage === "undefined") return {...DEFAULTS};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {...DEFAULTS};
    const parsed = JSON.parse(raw) as Partial<AssistantPreferences>;
    const personaId =
      parsed.personaId && (ASSISTANT_PERSONA_IDS as readonly string[]).includes(parsed.personaId)
        ? parsed.personaId
        : DEFAULT_ASSISTANT_PERSONA;
    return {
      personaId,
      deepResearch: Boolean(parsed.deepResearch),
    };
  } catch {
    return {...DEFAULTS};
  }
}

export function saveAssistantPreferences(
  userId: string | null | undefined,
  prefs: AssistantPreferences,
): void {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}
