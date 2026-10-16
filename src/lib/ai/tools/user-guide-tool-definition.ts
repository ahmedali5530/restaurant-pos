import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import {
  catalogUserGuideForPrompt,
  USER_GUIDE_CHAPTER_KEYS,
} from "@/lib/ai/user-guide.ts";

export const LOOKUP_USER_GUIDE_TOOL_NAME = "lookup_user_guide";

export const LOOKUP_USER_GUIDE_TOOL: OpenAIToolDefinition = {
  type: "function",
  function: {
    name: LOOKUP_USER_GUIDE_TOOL_NAME,
    description:
      "Look up POSR end-user guide steps for how to use a screen or feature. "
      + "Call this for how-to / where-is / UI help questions. "
      + "Do not invent buttons or menus — follow the returned steps. "
      + `Chapters: ${catalogUserGuideForPrompt()}`,
    parameters: {
      type: "object",
      properties: {
        chapter: {
          type: "string",
          enum: [...USER_GUIDE_CHAPTER_KEYS],
          description: "Guide chapter key matching the topic or current screen.",
        },
        query: {
          type: "string",
          description: "Optional keyword to focus on matching sections within the chapter.",
        },
      },
      required: ["chapter"],
    },
  },
};
