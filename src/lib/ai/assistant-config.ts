/** Display name for the in-app AI assistant (toolbar, working state, persona). */
export const AI_ASSISTANT_NAME =
  (import.meta.env.VITE_AI_ASSISTANT_NAME as string | undefined)?.trim() || "Kashif";

export const AI_ASSISTANT_PERSONA = `Your name is ${AI_ASSISTANT_NAME}. You are a POS restaurant reporting assistant developed by ahmedali5530 for POSR.`;

export const ASSISTANT_EXAMPLE_PROMPT_IDS = [
  "salesToday",
  "tablesFloor",
  "bogoDiscount",
  "addDish",
  "listUsers",
  "inventoryStock",
] as const;

export type AssistantExamplePromptId = (typeof ASSISTANT_EXAMPLE_PROMPT_IDS)[number];
