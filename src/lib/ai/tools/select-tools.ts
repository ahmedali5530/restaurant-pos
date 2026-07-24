import type {AiReportFormat} from "@/lib/ai.report.storage.ts";
import {isOrderListByStatusPrompt} from "@/lib/ai/order-query.ts";
import {isUnsoldProductsPrompt} from "@/lib/ai/product-query.ts";
import {isCurrentSessionSalesPrompt, isActiveSessionsPrompt} from "@/lib/ai/session-query.ts";
import {isTipsPrompt} from "@/lib/ai/tip-query.ts";
import {FRAUD_AUDIT_TOOL_NAMES, isFraudSuspiciousPrompt} from "@/lib/ai/fraud-query.ts";
import {isPurchaseOrderPrompt} from "@/lib/ai/purchase-order-query.ts";
import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import {AI_REPORT_TOOLS} from "@/lib/ai/tools/definitions.ts";
import {AI_REPORT_COMPACT_TOOLS, getCompactToolByName} from "@/lib/ai/tools/compact-definitions.ts";
import {
  AI_REPORT_TOOL_CATEGORIES,
  type AiReportToolDomain,
} from "@/lib/ai/tools/categories.ts";
import {filterToolsByPermissions} from "@/lib/ai/tools/permissions.ts";

const SALES_KEYWORDS = /\b(sales|revenue|dishes?|dish|product|menu|items|server|servers|tips?|tip|voids?|discount|coupon|tax|day[\s-]?part|product mix|top selling|unsold|haven't sold|hasn't sold|dashboard|health overview|kpi|ticket\s*time|fastest|slowest|plowhorses?|puzzles?|menu\s+engineering|accountability|turn[\s-]?around)\b/i;
const INVENTORY_KEYWORDS = /\b(inventory|stock|reorder|consumption|waste|purchase\s+orders?|pending\s+approval|awaiting\s+approval|purchase|issue|adjustment|ledger|location|transfer|kitchen reconciliation|sale vs consumption|below reorder)\b/i;
const OPERATIONS_KEYWORDS = /\b(orders?|delivery|expense|activity log|audit|cash closing|closing|clocked in|clock[\s-]?in|active session|prep|preparation|delay|kitchen|station|cancel|comp|modified|settled|fraud|fraudulent|suspicious|anomal\w*|tamper(?:ing)?|unauthorized|theft)\b/i;
const LABOR_KEYWORDS = /\b(labor|labour|payroll|overtime|attendance|scheduled|shift|employee|staff cost|labor cost|labor percent|labor %|workforce|hr|over[\s-]?staff|hourly)\b/i;
const ACCOUNTS_KEYWORDS = /\b(trial balance|balance sheet|profit(?:\s*(?:&|and)\s*loss)?|p\s*&\s*l|cash flow|general ledger|journal\s+entr(?:y|ies)|chart of accounts|gl\b|accounts receivable|accounts payable|customer statement|supplier statement|debit|credit|ledger|net profit|assets?|liabilit(?:y|ies)|equity)\b/i;
const ANALYSIS_KEYWORDS = /\b(forecast|predict|compare|comparison|vs\.?|versus|trend|time series|projection|estimate)\b/i;
const CHART_KEYWORDS = /\b(chart|graph|plot|visuali[sz]e|line chart|bar chart|pie chart)\b/i;
const LOOKUP_KEYWORDS = /\b(staff|server named|cashier|category|categories|menu item|inventory item|find item|lookup)\b/i;

export interface SelectToolsResult {
  tools: OpenAIToolDefinition[];
  domains: AiReportToolDomain[];
}

const detectDomainsFromPrompt = (prompt: string, format: AiReportFormat): Set<AiReportToolDomain> => {
  const domains = new Set<AiReportToolDomain>();

  if (isPurchaseOrderPrompt(prompt)) {
    domains.add("inventory");
  }

  if (isOrderListByStatusPrompt(prompt) || isActiveSessionsPrompt(prompt)) {
    domains.add("operations");
  }
  if (isUnsoldProductsPrompt(prompt) || isTipsPrompt(prompt) || isCurrentSessionSalesPrompt(prompt)) {
    domains.add("sales");
  }

  if (SALES_KEYWORDS.test(prompt)) {
    domains.add("sales");
  }
  if (INVENTORY_KEYWORDS.test(prompt)) {
    domains.add("inventory");
  }
  if (OPERATIONS_KEYWORDS.test(prompt) && !isPurchaseOrderPrompt(prompt)) {
    domains.add("operations");
  }
  if (LABOR_KEYWORDS.test(prompt)) {
    domains.add("labor");
  }
  if (ACCOUNTS_KEYWORDS.test(prompt)) {
    domains.add("accounts");
  }
  if (ANALYSIS_KEYWORDS.test(prompt)) {
    domains.add("analysis");
  }
  if (format === "chart" || CHART_KEYWORDS.test(prompt)) {
    domains.add("chart");
  }
  if (LOOKUP_KEYWORDS.test(prompt)) {
    domains.add("lookup");
  }

  if (isFraudSuspiciousPrompt(prompt)) {
    domains.add("operations");
    domains.add("sales");
  }

  if (domains.size === 0) {
    domains.add("sales");
  }

  if (domains.has("analysis") && !domains.has("sales") && !domains.has("inventory")) {
    domains.add("sales");
  }

  return domains;
};

const collectToolNames = (domains: Set<AiReportToolDomain>, prompt: string): string[] => {
  const names = new Set<string>(AI_REPORT_TOOL_CATEGORIES.core);

  for (const domain of domains) {
    for (const name of AI_REPORT_TOOL_CATEGORIES[domain]) {
      names.add(name);
    }
  }

  if (isFraudSuspiciousPrompt(prompt)) {
    for (const name of FRAUD_AUDIT_TOOL_NAMES) {
      names.add(name);
    }
  }

  return Array.from(names);
};

const resolveToolDefinitions = (toolNames: string[], compact: boolean): OpenAIToolDefinition[] => {
  if (!compact) {
    const nameSet = new Set(toolNames);
    return AI_REPORT_TOOLS.filter(tool => nameSet.has(tool.function.name));
  }

  return toolNames
    .map(name => getCompactToolByName(name))
    .filter((tool): tool is OpenAIToolDefinition => tool !== undefined);
};

export const detectDomainsForPrompt = (
  prompt: string,
  format: AiReportFormat = "table",
): AiReportToolDomain[] => Array.from(detectDomainsFromPrompt(prompt, format));

export const selectToolsForPrompt = (
  prompt: string,
  format: AiReportFormat = "table",
  allowedModules: string[] = [],
  compact = false,
): SelectToolsResult => {
  if (!compact) {
    const tools = allowedModules.length
      ? filterToolsByPermissions(AI_REPORT_TOOLS, allowedModules)
      : AI_REPORT_TOOLS;

    return {tools, domains: []};
  }

  const domains = detectDomainsFromPrompt(prompt, format);
  const toolNames = collectToolNames(domains, prompt);
  let tools = resolveToolDefinitions(toolNames, true);

  if (allowedModules.length) {
    tools = filterToolsByPermissions(tools, allowedModules);
  }

  return {tools, domains: Array.from(domains)};
};

export const getAllCompactTools = (): OpenAIToolDefinition[] => AI_REPORT_COMPACT_TOOLS;
