import {apiUrl} from "@/lib/api.service.ts";
import {authHeaders} from "@/lib/session.ts";

// Chat completions are proxied through the backend `api` service so the OpenAI
// key, URL, and model never ship in the client bundle. See `api/src/modules/ai`.
const CHAT_COMPLETIONS_PATH = "/ai/chat/completions";

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChatResponse {
  choices: {
    message: OpenAIChatMessage;
    finish_reason?: string;
  }[];
}

export const callOpenAIChat = async ({
  messages,
  tools,
}: {
  messages: OpenAIChatMessage[];
  tools?: OpenAIToolDefinition[];
}): Promise<OpenAIChatResponse> => {
  const response = await fetch(apiUrl(CHAT_COMPLETIONS_PATH), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({messages, tools}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText) as {error?: string};
      if (parsed?.error) {
        message = parsed.error;
      }
    } catch {
      // Non-JSON error body; use raw text.
    }
    throw new Error(message || `AI request failed with status ${response.status}`);
  }

  return response.json() as Promise<OpenAIChatResponse>;
};

export const runOpenAIPrompt = async (prompt: string): Promise<string> => {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt cannot be empty.");
  }

  const response = await callOpenAIChat({
    messages: [{role: "user", content: trimmedPrompt}],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  return content;
};
