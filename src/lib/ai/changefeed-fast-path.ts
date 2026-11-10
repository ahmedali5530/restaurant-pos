import type {DbClient} from "@/api/reports/shared/types.ts";
import {
  formatChangefeedAsAnswer,
  getTableChangefeed,
} from "@/api/reports/operations/changefeed.ts";
import {
  CHANGEFEED_TOOL_NAME,
  isChangefeedPrompt,
  resolveChangefeedTableFromPrompt,
} from "@/lib/ai/changefeed-query.ts";
import {canUseReadTool} from "@/lib/ai/tools/permissions.ts";

export type ChangefeedFastPathResult = {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  instruction: string;
  directAnswer?: string;
};

const DENIED_ANSWER =
  "You don't have permission to pull table changefeeds. "
  + "Ask an admin to enable **Reports → Table Changefeed** (`reports.changefeed`) on your role "
  + "(or the parent Reports group / AI Report).";

/**
 * Changefeed asks should not enter the multi-tool agent loop: full dish
 * after-images + large toolsets blow past max iterations. Run SHOW CHANGES
 * once and return a deterministic summary — only after RBAC allows the tool.
 */
export const tryChangefeedFastPath = async (
  db: DbClient,
  prompt: string,
  options: {
    onToolStart?: (name: string) => void;
    allowedModules?: string[];
  } = {},
): Promise<ChangefeedFastPathResult | null> => {
  if (!isChangefeedPrompt(prompt)) {
    return null;
  }

  const allowedModules = options.allowedModules ?? [];
  if (!canUseReadTool(CHANGEFEED_TOOL_NAME, allowedModules)) {
    return {
      toolName: CHANGEFEED_TOOL_NAME,
      args: {},
      result: {ok: false, error: "permission_denied", module: "reports.changefeed"},
      instruction: "",
      directAnswer: DENIED_ANSWER,
    };
  }

  const table = resolveChangefeedTableFromPrompt(prompt);
  if (!table) {
    return {
      toolName: CHANGEFEED_TOOL_NAME,
      args: {},
      result: null,
      instruction: "",
      directAnswer:
        "Which table changefeed should I pull? Examples: `menu_item`, `order`, `order_void`, `category`.",
    };
  }

  const args = {table, since: 0 as string | number, limit: 50, compact: false};
  options.onToolStart?.(CHANGEFEED_TOOL_NAME);
  const result = await getTableChangefeed(db, args);
  const directAnswer = formatChangefeedAsAnswer(result);

  const safeJson = (value: unknown) =>
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));

  return {
    toolName: CHANGEFEED_TOOL_NAME,
    args,
    result,
    instruction:
      "Summarize the changefeed result below for the user. "
      + "Do not call tools. Keep SCHEMA vs data counts clear. "
      + "Data:\n"
      + safeJson(result),
    directAnswer,
  };
};
