const apiUrl = import.meta.env.VITE_OPENAI_API_URL as string | undefined;
const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || "gpt-4o-mini";

const isAzureUrl = (url: string) => url.includes("openai.azure.com");

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

const getHeaders = () => {
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured. Set VITE_OPENAI_API_KEY in your environment.");
  }

  return {
    "Content-Type": "application/json",
    ...(isAzureUrl(apiUrl!)
      ? {"api-key": apiKey}
      : {Authorization: `Bearer ${apiKey}`}),
  };
};

export const callOpenAIChat = async ({
  messages,
  tools,
}: {
  messages: OpenAIChatMessage[];
  tools?: OpenAIToolDefinition[];
}): Promise<OpenAIChatResponse> => {
  if (!apiUrl) {
    throw new Error("OpenAI API URL is not configured. Set VITE_OPENAI_API_URL in your environment.");
  }

  const body: Record<string, unknown> = {model, messages};
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `OpenAI request failed with status ${response.status}`);
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
