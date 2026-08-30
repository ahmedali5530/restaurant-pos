import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import type {AiReportToolDomain} from "@/lib/ai/tools/categories.ts";
import {hasWritePermissionModule} from "@/lib/ai/tools/write-permissions.ts";
import {WRITE_INTENT_PATTERN} from "@/lib/ai/tools/write-intent-i18n.ts";
import {WRITE_TOOL_REGISTRY, type WriteToolRegistryEntry} from "@/lib/ai/tools/write-tool-entries.ts";

export type {WriteToolRegistryEntry} from "@/lib/ai/tools/write-tool-entries.ts";
export {buildWriteToolPermissionMap} from "@/lib/ai/tools/write-tool-entries.ts";
export {WRITE_INTENT_PATTERN} from "@/lib/ai/tools/write-intent-i18n.ts";

const toolNameIndex = new Map<string, WriteToolRegistryEntry>();
const configIdIndex = new Map<string, WriteToolRegistryEntry>();

for (const entry of WRITE_TOOL_REGISTRY) {
  toolNameIndex.set(entry.createToolName, entry);
  if (entry.updateToolName) {
    toolNameIndex.set(entry.updateToolName, entry);
  }
  if (entry.deleteToolName) {
    toolNameIndex.set(entry.deleteToolName, entry);
  }
  configIdIndex.set(entry.configId, entry);
}

export const getWriteRegistryEntry = (toolName: string): WriteToolRegistryEntry | undefined =>
  toolNameIndex.get(toolName);

export const getWriteRegistryEntryByConfigId = (configId: string): WriteToolRegistryEntry | undefined =>
  configIdIndex.get(configId);

export const listWriteToolDefinitions = (): OpenAIToolDefinition[] =>
  WRITE_TOOL_REGISTRY.flatMap(entry => entry.buildToolDefinitions())
    .filter(tool => Boolean(tool.function?.name));

export const listWriteToolNames = (): string[] =>
  listWriteToolDefinitions().map(tool => tool.function.name);

const isCreateTool = (toolName: string, entry: WriteToolRegistryEntry) =>
  toolName === entry.createToolName;

const isUpdateTool = (toolName: string, entry: WriteToolRegistryEntry) =>
  toolName === entry.updateToolName;

const entryMatchesDomains = (
  entry: WriteToolRegistryEntry,
  activeDomains: Set<AiReportToolDomain>,
): boolean => entry.domains?.some(domain => activeDomains.has(domain)) ?? false;

const entryMatchesPrompt = (
  entry: WriteToolRegistryEntry,
  prompt: string,
  options: {hasWriteIntent: boolean; activeDomains: Set<AiReportToolDomain>},
): boolean => {
  if (entry.keywords.test(prompt)) {
    if (entry.actionKeywords && !entry.actionKeywords.test(prompt)) return false;
    return true;
  }

  if (options.hasWriteIntent && entryMatchesDomains(entry, options.activeDomains)) {
    return true;
  }

  return false;
};

const isDishRelationPrompt = (prompt: string): boolean =>
  isModifierGroupOptionPrompt(prompt)
  || (/\bmodifier\b/i.test(prompt) && !/\b(?:menu\s+)?(?:dish|dishes)\b/i.test(prompt))
  || (/\bingredient\b/i.test(prompt) && /\bdish\b/i.test(prompt));

export const isModifierGroupOptionPrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text) return false;
  if (/\bmodifier\s+groups?\b/i.test(text)) return true;
  if (/\b(?:small|medium|large|family|party|size|topping|crust|addon|add-on)\b/i.test(text)
    && /\b(?:modifier|group|option)\b/i.test(text)) {
    return true;
  }
  return false;
};

export type DetectWriteToolsOptions = {
  domains?: AiReportToolDomain[];
};

export const detectWriteToolsForPrompt = (
  prompt: string,
  allowedModules: string[],
  options: DetectWriteToolsOptions = {},
): OpenAIToolDefinition[] => {
  const matched: OpenAIToolDefinition[] = [];
  const hasWriteIntent = WRITE_INTENT_PATTERN.test(prompt);
  const activeDomains = new Set(options.domains ?? []);

  for (const entry of WRITE_TOOL_REGISTRY) {
    if (entry.configId === "dishes" && isDishRelationPrompt(prompt)) continue;
    if (!entryMatchesPrompt(entry, prompt, {hasWriteIntent, activeDomains})) continue;

    appendPermittedToolsForEntry(entry, allowedModules, matched);
  }

  return matched;
};

const isDeleteTool = (toolName: string, entry: WriteToolRegistryEntry) =>
  toolName === entry.deleteToolName;

const appendPermittedToolsForEntry = (
  entry: WriteToolRegistryEntry,
  allowedModules: string[],
  matched: OpenAIToolDefinition[],
) => {
  const tools = entry.buildToolDefinitions();
  for (const tool of tools) {
    const name = tool.function.name;
    const module = isCreateTool(name, entry)
      ? entry.permissionModules.create
      : isUpdateTool(name, entry)
        ? entry.permissionModules.update
        : isDeleteTool(name, entry)
          ? entry.permissionModules.delete
          : null;
    if (!module || !hasWritePermissionModule(module, allowedModules)) continue;
    matched.push(tool);
  }
};

/** Every propose_* tool the user is allowed to call (no keyword filter). */
export const listPermittedWriteTools = (
  allowedModules: string[],
  prompt = "",
): OpenAIToolDefinition[] => {
  const matched: OpenAIToolDefinition[] = [];
  for (const entry of WRITE_TOOL_REGISTRY) {
    if (entry.configId === "dishes" && isDishRelationPrompt(prompt)) continue;
    appendPermittedToolsForEntry(entry, allowedModules, matched);
  }
  return matched;
};

export const getWriteModeForTool = (toolName: string): "create" | "update" | null => {
  const entry = getWriteRegistryEntry(toolName);
  if (!entry) return null;
  if (toolName === entry.createToolName) return "create";
  if (toolName === entry.updateToolName) return "update";
  if (toolName === entry.deleteToolName) return "update";
  return null;
};
