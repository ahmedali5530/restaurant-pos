import {ASSISTANT_PERSONAS} from "@/lib/ai/assistant-personas.ts";

/** Display name for the in-app AI assistant (toolbar, working state, persona). */
export const AI_ASSISTANT_NAME =
  (import.meta.env.VITE_AI_ASSISTANT_NAME as string | undefined)?.trim() || "Kashif";

/** Default system persona string (Analyst). */
export const AI_ASSISTANT_PERSONA = ASSISTANT_PERSONAS.analyst.prompt;

export const ASSISTANT_EXAMPLE_PROMPT_IDS = [
  "salesToday",
  "tablesFloor",
  "bogoDiscount",
  "addDish",
  "listUsers",
  "inventoryStock",
  "howToPurchase",
  "cleanseCsv",
  "analyzeCsv",
] as const;

export type AssistantExamplePromptId = (typeof ASSISTANT_EXAMPLE_PROMPT_IDS)[number];
