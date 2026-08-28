import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import {normalizeModules} from "@/lib/access.rules.ts";
import {buildWriteToolPermissionMap} from "@/lib/ai/tools/write-tool-entries.ts";

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

/** Parent tab module for granular create/update leaves (e.g. admin.dishes.create → admin.dishes). */
export const getWritePermissionParentTab = (module: string): string | null => {
  if (!module.includes(".")) return null;
  const parts = module.split(".");
  if (parts.length < 3) return null;
  if (module.endsWith(".import") || module.endsWith(".delete")) return null;
  return parts.slice(0, -1).join(".");
};

/** True when the exact leaf or its parent tab (legacy roles) is granted. */
export const hasWritePermissionModule = (module: string, allowedModules: string[]): boolean => {
  const normalized = normalizeModules(allowedModules);
  if (normalized.includes(module)) return true;
  const parent = getWritePermissionParentTab(module);
  return parent != null && normalized.includes(parent);
};

/** True only if allowedModules grants the module this tool needs. */
export const canUseWriteTool = (toolName: string, allowedModules: string[]): boolean => {
  const module = WRITE_TOOL_PERMISSION_MODULES[toolName];
  if (!module) return false;
  return hasWritePermissionModule(module, allowedModules);
};

export const filterWriteToolsByPermissions = (
  tools: OpenAIToolDefinition[],
  allowedModules: string[],
): OpenAIToolDefinition[] => tools.filter(tool => canUseWriteTool(tool.function.name, allowedModules));
