import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import {isLocalAiReportCompactMode} from "@/lib/ai/config.ts";
import {selectToolsForPrompt, applyPromptToolFilters, detectDomainsForPrompt} from "@/lib/ai/tools/select-tools.ts";
import type {AiReportToolDomain} from "@/lib/ai/tools/categories.ts";
import {AI_REPORT_TOOLS} from "@/lib/ai/tools/definitions.ts";
import {filterToolsByPermissions} from "@/lib/ai/tools/permissions.ts";
import {AI_MANAGE_READ_TOOLS} from "@/lib/ai/tools/manage-tool-definitions.ts";
import {detectWriteToolsForPrompt, listPermittedWriteTools, WRITE_INTENT_PATTERN} from "@/lib/ai/tools/write-tool-registry.ts";

const ASSISTANT_CORE_READ_TOOLS = ["resolve_date_range", "get_sales_summary", "get_orders"];

export type SelectAssistantToolsResult = {
  tools: OpenAIToolDefinition[];
  readTools: OpenAIToolDefinition[];
  writeTools: OpenAIToolDefinition[];
  domains: AiReportToolDomain[];
};

const resolveManageReadTools = (allowedModules: string[]): OpenAIToolDefinition[] =>
  allowedModules.length
    ? filterToolsByPermissions(AI_MANAGE_READ_TOOLS, allowedModules)
    : AI_MANAGE_READ_TOOLS;

const resolveReadTools = (
  prompt: string,
  allowedModules: string[],
  compact: boolean,
): {readTools: OpenAIToolDefinition[]; domains: AiReportToolDomain[]} => {
  const {tools, domains} = selectToolsForPrompt(prompt, "table", allowedModules, compact);

  if (compact) {
    if (domains.includes("manage")) {
      const manageTools = resolveManageReadTools(allowedModules);
      const names = new Set(tools.map(tool => tool.function.name));
      const merged = [...tools];
      for (const tool of manageTools) {
        if (!names.has(tool.function.name)) {
          merged.push(tool);
        }
      }
      return {readTools: merged, domains};
    }
    return {readTools: tools, domains};
  }

  const resolvedDomains = detectDomainsForPrompt(prompt);
  const nameSet = new Set(ASSISTANT_CORE_READ_TOOLS);
  const filteredNames = applyPromptToolFilters(
    AI_REPORT_TOOLS.map(tool => tool.function.name),
    prompt,
  );
  for (const name of filteredNames) {
    nameSet.add(name);
  }

  if (resolvedDomains.includes("manage")) {
    for (const tool of resolveManageReadTools(allowedModules)) {
      nameSet.add(tool.function.name);
    }
  }

  const order = new Map(filteredNames.map((name, index) => [name, index]));
  const readTools = AI_REPORT_TOOLS
    .filter(tool => nameSet.has(tool.function.name))
    .sort((a, b) => (order.get(a.function.name) ?? 999) - (order.get(b.function.name) ?? 999));
  const filtered = allowedModules.length
    ? filterToolsByPermissions(readTools, allowedModules)
    : readTools;

  return {readTools: filtered, domains: resolvedDomains};
};

export const selectAssistantToolsForPrompt = (
  prompt: string,
  allowedModules: string[] = [],
  options: {compact?: boolean; includeWrite?: boolean} = {},
): SelectAssistantToolsResult => {
  const compact = options.compact ?? isLocalAiReportCompactMode("reporting");
  const includeWrite = options.includeWrite ?? true;

  const {readTools, domains} = resolveReadTools(prompt, allowedModules, compact);

  let writeTools: OpenAIToolDefinition[] = [];
  if (includeWrite) {
    writeTools = WRITE_INTENT_PATTERN.test(prompt)
      ? listPermittedWriteTools(allowedModules)
      : detectWriteToolsForPrompt(prompt, allowedModules, {domains});
  }

  const readNames = new Set(readTools.map(t => t.function.name));
  const writeFiltered = writeTools.filter(t => !readNames.has(t.function.name));

  return {
    tools: [...readTools, ...writeFiltered],
    readTools,
    writeTools: writeFiltered,
    domains,
  };
};
