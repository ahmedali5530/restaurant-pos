import {listWriteToolDefinitions, listWriteToolNames} from "@/lib/ai/tools/write-tool-registry.ts";

/**
 * Write tools for the AI assistant. Unlike AI_REPORT_TOOLS (read-only, executed
 * immediately by executeAiReportTool), calling one of these NEVER writes to the
 * database. It only builds a validated proposal for the user to review and
 * explicitly confirm — see write-tools.ts / write-executor.ts / assistant-agent.ts.
 */
export const AI_WRITE_TOOLS = listWriteToolDefinitions();

export const AI_WRITE_TOOL_NAMES = listWriteToolNames();
