import {apiUrl} from "@/lib/api.service.ts";
import {authHeaders} from "@/lib/session.ts";

// Chat completions are proxied through the backend `api` service so the OpenAI
// key, URL, and model never ship in the client bundle. See `api/src/modules/ai`.
const CHAT_COMPLETIONS_PATH = "/ai/chat/completions";
const AI_USAGE_PATH = "/ai/usage";

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

export type AiQuotaBucket = {
  used: number;
  limit: number | null;
};

export type AiUsageStatus = {
  enabled: boolean;
  daily: AiQuotaBucket;
  monthly: AiQuotaBucket;
};

export type AiQuotaErrorCode = "AI_DISABLED" | "AI_DAILY_LIMIT" | "AI_MONTHLY_LIMIT";

export class AiQuotaError extends Error {
  readonly code: AiQuotaErrorCode;
  readonly status: number;
  readonly daily?: AiQuotaBucket;
  readonly monthly?: AiQuotaBucket;

  constructor(
    message: string,
    code: AiQuotaErrorCode,
    status: number,
    daily?: AiQuotaBucket,
    monthly?: AiQuotaBucket,
  ) {
    super(message);
    this.name = "AiQuotaError";
    this.code = code;
    this.status = status;
    this.daily = daily;
    this.monthly = monthly;
  }
}

const isAiQuotaCode = (value: unknown): value is AiQuotaErrorCode =>
  value === "AI_DISABLED" || value === "AI_DAILY_LIMIT" || value === "AI_MONTHLY_LIMIT";

const throwFromFailedResponse = async (response: Response): Promise<never> => {
  const errorText = await response.text();
  let message = errorText;
  let code: string | undefined;
  let daily: AiQuotaBucket | undefined;
  let monthly: AiQuotaBucket | undefined;

  try {
    const parsed = JSON.parse(errorText) as {
      error?: string;
      code?: string;
      daily?: AiQuotaBucket;
      monthly?: AiQuotaBucket;
    };
    if (parsed?.error) {
      message = parsed.error;
    }
    code = parsed?.code;
    daily = parsed?.daily;
    monthly = parsed?.monthly;
  } catch {
    // Non-JSON error body; use raw text.
  }

  if (isAiQuotaCode(code)) {
    throw new AiQuotaError(
      message || `AI request failed with status ${response.status}`,
      code,
      response.status,
      daily,
      monthly,
    );
  }

  throw new Error(message || `AI request failed with status ${response.status}`);
};

export const fetchAiUsage = async (): Promise<AiUsageStatus | null> => {
  try {
    const response = await fetch(apiUrl(AI_USAGE_PATH), {
      method: "GET",
      headers: authHeaders(),
    });
    if (!response.ok) {
      return null;
    }
    return response.json() as Promise<AiUsageStatus>;
  } catch {
    return null;
  }
};

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
    await throwFromFailedResponse(response);
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
