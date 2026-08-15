import {apiUrl} from "@/lib/api.service.ts";
import {authHeaders} from "@/lib/session.ts";

// Chat completions are proxied through the backend `api` service so profile
// keys, URLs, and models never ship in the client bundle. See `api/src/modules/ai`.
const CHAT_COMPLETIONS_PATH = "/ai/chat/completions";
const AI_USAGE_PATH = "/ai/usage";

/** Stable app tasks that map to AI profiles via AI_TASK_* env on the API. */
export type AiTask = "reporting" | "analysis" | "forecast" | "ocr" | (string & {});

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type OpenAIContentPart =
  | {type: "text"; text: string}
  | {type: "image_url"; image_url: {url: string; detail?: "auto" | "low" | "high"}};

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | OpenAIContentPart[] | null;
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

export type AiProfilePublic = {
  model: string | null;
  compact: boolean;
  auth: string;
  configured: boolean;
};

export type AiUsageStatus = {
  enabled: boolean;
  daily: AiQuotaBucket;
  monthly: AiQuotaBucket;
  defaultProfile?: string;
  tasks?: Record<string, string>;
  profiles?: Record<string, AiProfilePublic>;
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

/** Last successful /ai/usage payload (non-secret routing). */
let cachedAiConfig: AiUsageStatus | null = null;

export const getCachedAiConfig = (): AiUsageStatus | null => cachedAiConfig;

export const clearCachedAiConfig = (): void => {
  cachedAiConfig = null;
};

/**
 * Whether the profile mapped to `task` prefers compact prompts/tools.
 * Returns undefined when config has not been fetched yet.
 */
export const isProfileCompactForTask = (task: AiTask = "reporting"): boolean | undefined => {
  const config = cachedAiConfig;
  if (!config?.profiles || !config.tasks) {
    return undefined;
  }
  const profileName = config.tasks[String(task)] || config.defaultProfile;
  if (!profileName) {
    return undefined;
  }
  return Boolean(config.profiles[profileName]?.compact);
};

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
    const data = (await response.json()) as AiUsageStatus;
    cachedAiConfig = data;
    return data;
  } catch {
    return null;
  }
};

export const callOpenAIChat = async ({
  messages,
  tools,
  task,
}: {
  messages: OpenAIChatMessage[];
  tools?: OpenAIToolDefinition[];
  task?: AiTask;
}): Promise<OpenAIChatResponse> => {
  const response = await fetch(apiUrl(CHAT_COMPLETIONS_PATH), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messages,
      tools,
      ...(task ? {task} : {}),
    }),
  });

  if (!response.ok) {
    await throwFromFailedResponse(response);
  }

  return response.json() as Promise<OpenAIChatResponse>;
};

export const runOpenAIPrompt = async (
  prompt: string,
  task: AiTask = "reporting",
): Promise<string> => {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt cannot be empty.");
  }

  const response = await callOpenAIChat({
    messages: [{role: "user", content: trimmedPrompt}],
    task,
  });

  const content = response.choices[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("AI returned an empty response.");
  }

  return text;
};
