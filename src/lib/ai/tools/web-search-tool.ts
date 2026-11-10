import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import {apiUrl} from "@/lib/api.service.ts";
import {authHeaders} from "@/lib/session.ts";

export const WEB_SEARCH_TOOL_NAME = "web_search";

export const WEB_SEARCH_TOOL: OpenAIToolDefinition = {
  type: "function",
  function: {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      "Search the public web for external facts (regulations, industry norms, vendor docs). "
      + "Do NOT use for this restaurant's live POS sales/inventory — use report tools instead. "
      + "Available in deep research mode.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query in plain language",
        },
      },
      required: ["query"],
    },
  },
};

export type WebSearchResult = {
  ok: boolean;
  query: string;
  provider?: string;
  results?: Array<{title: string; url?: string; snippet: string}>;
  abstract?: string;
  error?: string;
};

export async function executeWebSearch(query: string): Promise<WebSearchResult> {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return {ok: false, query: "", error: "query is required"};
  }

  try {
    const response = await fetch(apiUrl("/ai/web-search"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({query: trimmed}),
    });
    const data = (await response.json()) as WebSearchResult;
    if (!response.ok) {
      return {
        ok: false,
        query: trimmed,
        error: data.error || `Web search failed (${response.status})`,
        provider: data.provider,
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      query: trimmed,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
