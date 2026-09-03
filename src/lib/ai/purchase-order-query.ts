import {PurchaseOrderStatus} from "@/api/model/inventory_purchase_order.ts";

/**
 * Detect inventory purchase-order prompts (not POS customer orders).
 * Avoid matching the product acronym "POS".
 */
export const isPurchaseOrderPrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text) {
    return false;
  }

  return (
    /\bpurchase\s+orders?\b/i.test(text)
    || /\bPOs?\b/.test(text)
    || /\bpo\s*[#:]?\s*\d+\b/i.test(text)
    || /\b(?:pending|awaiting)\s+approval\b/i.test(text)
    || /\bpending\s+to\s+procurement\b/i.test(text)
    || /\bprocurement\b/i.test(text)
  );
};

const OPEN_PO_STATUSES = [
  PurchaseOrderStatus.draft,
  PurchaseOrderStatus.pendingApproval,
  PurchaseOrderStatus.approved,
];

const PO_STATUS_PATTERNS: Array<{pattern: RegExp; status: string}> = [
  {pattern: /\bdraft\b/i, status: PurchaseOrderStatus.draft},
  {
    // Require explicit approval wording — bare "pending" (e.g. "pending to procurement") must not filter.
    pattern: /\bpending\s+approval\b|\bawaiting\s+approval\b|\bsubmitted(?:\s+for\s+approval)?\b/i,
    status: PurchaseOrderStatus.pendingApproval,
  },
  {pattern: /\bapproved\b/i, status: PurchaseOrderStatus.approved},
  {pattern: /\bfulfilled\b|\breceived\b/i, status: PurchaseOrderStatus.fulfilled},
];

const wantsOpenPurchaseOrders = (prompt: string): boolean =>
  /\bpending\s+to\s+procurement\b/i.test(prompt)
  || /\bawaiting\s+procurement\b/i.test(prompt)
  || /\boutstanding\b/i.test(prompt)
  || /\bopen\s+(?:purchase\s+)?orders?\b/i.test(prompt)
  || /\bnot\s+(?:yet\s+)?fulfilled\b/i.test(prompt);

/** "Show/list purchase orders…" should return the full set; LLM can highlight what is still open. */
const isGeneralPurchaseOrderList = (prompt: string): boolean =>
  /\b(?:show|list|get|display|all)\b[\s\S]*\bpurchase\s+orders?\b/i.test(prompt)
  || /\b(?:show|list|get|display|all)\b[\s\S]*\bPOs?\b/.test(prompt);

export const inferPurchaseOrderStatusesFromPrompt = (prompt: string): string[] => {
  const statuses = new Set<string>();
  for (const {pattern, status} of PO_STATUS_PATTERNS) {
    if (pattern.test(prompt)) {
      statuses.add(status);
    }
  }

  // Explicit status wins (e.g. "purchase orders awaiting approval" → Pending Approval).
  if (statuses.size > 0) {
    return Array.from(statuses);
  }

  // Soft "open / pending to procurement" → everything not yet fulfilled,
  // unless the user asked for a general PO list (return all statuses).
  if (wantsOpenPurchaseOrders(prompt) && !isGeneralPurchaseOrderList(prompt)) {
    return [...OPEN_PO_STATUSES];
  }

  return [];
};

export const resolvePurchaseOrderQueryFromPrompt = (prompt: string): {
  statuses?: string[];
  phrase?: string;
} => {
  const statuses = inferPurchaseOrderStatusesFromPrompt(prompt);
  const phraseMatch = prompt.match(
    /\b(today|yesterday|this week|last week|this month|last month|last \d+ days)\b/i,
  );

  return {
    statuses: statuses.length ? statuses : undefined,
    phrase: phraseMatch?.[1],
  };
};
