import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import {normalizeModules} from "@/lib/access.rules.ts";
import {buildWriteToolPermissionMap} from "@/lib/ai/tools/write-tool-registry.ts";

/**
 * Maps write tool names to the exact admin permission leaf that gates the
 * equivalent manual action in Manage (e.g. dishes/index.tsx).
 * Reusing these leaves means an operator's existing dish permissions are
 * exactly what governs the AI assistant too — no separate grant to configure.
 *
 * Deliberately a SEPARATE map/filter from tools/permissions.ts, not reused:
 * filterToolsByPermissions() there treats `reports.ai` as a catch-all that
 * grants every tool it filters. Read tools are safe under that catch-all
 * (reports.ai is explicitly "full AI report access"). Writes are not — a
 * session that only ever granted reports.ai never consented to the assistant
 * creating/editing dishes. Write tools are therefore filtered strictly,
 * deny-by-default, with no catch-all bypass of any kind.
 */
export const WRITE_TOOL_PERMISSION_MODULES: Record<string, string> = buildWriteToolPermissionMap();

/** True only if allowedModules explicitly grants the module this tool needs. */
export const canUseWriteTool = (toolName: string, allowedModules: string[]): boolean => {
  const module = WRITE_TOOL_PERMISSION_MODULES[toolName];
  if (!module) return false;
  return normalizeModules(allowedModules).includes(module);
};

export const filterWriteToolsByPermissions = (
  tools: OpenAIToolDefinition[],
  allowedModules: string[],
): OpenAIToolDefinition[] => tools.filter(tool => canUseWriteTool(tool.function.name, allowedModules));
