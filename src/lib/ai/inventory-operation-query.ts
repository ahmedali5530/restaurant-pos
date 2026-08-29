import type {InventoryDocumentStatus} from "@/api/model/inventory_document.ts";
import type {InventoryMovementType} from "@/api/reports/inventory/index.ts";
import {isPurchaseOrderPrompt} from "@/lib/ai/purchase-order-query.ts";

export type InventoryDocumentType =
  | "purchase"
  | "purchase_return"
  | "issue"
  | "issue_return"
  | "waste"
  | "adjustment"
  | "transfer";

const hasInventoryContext = (text: string): boolean =>
  /\b(inventory|stock|supplier|warehouse|store|location|kitchen|ledger|posted|received|receipt)\b/i.test(text);

const INVENTORY_DOCUMENT_NOUN =
  /\b(?:inventory\s+)?(?:purchases?|issues?|returns?|wastes?|adjustments?|transfers?|documents?|receipts?|supplier)\b/i;

/** Posted supplier purchases (inventory_purchase), not purchase orders. */
export const isPurchaseLedgerPrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text || isPurchaseOrderPrompt(text)) {
    return false;
  }
  if (/\bpurchase\s+returns?\b/i.test(text)) {
    return false;
  }

  return (
    /\binventory\s+purchases?\b/i.test(text)
    || /\bpurchase\s+movements?\b/i.test(text)
    || /\bposted\s+purchases?\b/i.test(text)
    || /\bpurchases?\s+report\b/i.test(text)
    || /\breceived\s+purchases?\b/i.test(text)
    || (/\bpurchases?\b/i.test(text) && !/\bpurchase\s+orders?\b/i.test(text) && !/\bPOs?\b/.test(text))
  );
};

const DOCUMENT_TYPE_PATTERNS: Array<{type: InventoryDocumentType; pattern: RegExp}> = [
  {type: "purchase_return", pattern: /\bpurchase\s+returns?\b/i},
  {type: "issue_return", pattern: /\bissue\s+returns?\b/i},
  {
    type: "issue",
    pattern: /\b(?:inventory\s+)?issues?\b/i,
  },
  {type: "waste", pattern: /\b(?:inventory\s+)?wastes?\b/i},
  {type: "adjustment", pattern: /\b(?:stock\s+)?adjustments?\b/i},
  {type: "transfer", pattern: /\b(?:stock\s+)?transfers?\b/i},
];

const inferInventoryDocumentTypeCore = (text: string): InventoryDocumentType | null => {
  if (isPurchaseLedgerPrompt(text)) {
    return "purchase";
  }

  for (const {type, pattern} of DOCUMENT_TYPE_PATTERNS) {
    if (!pattern.test(text)) {
      continue;
    }
    if (type === "issue" && !hasInventoryContext(text) && /\bissues?\s+with\b/i.test(text)) {
      continue;
    }
    if ((type === "waste" || type === "adjustment" || type === "transfer") && !hasInventoryContext(text)) {
      const listIntent = /\b(?:show|list|get|display|how many)\b/i.test(text);
      if (!listIntent) {
        continue;
      }
    }
    return type;
  }

  return null;
};

const VOID_WORD = /\bvoid(?:ed|s)?\b/i;

/** POS order voids (dishes removed before pay) — not inventory document voids. */
export const isPosOrderVoidPrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text || !VOID_WORD.test(text)) {
    return false;
  }
  if (isPurchaseLedgerPrompt(text) || inferInventoryDocumentTypeCore(text)) {
    return false;
  }
  return (
    /\b(?:order|dish|dishes|menu|item|items|server|cashier|ticket)\b/i.test(text)
    || !INVENTORY_DOCUMENT_NOUN.test(text)
  );
};

export const inferInventoryDocumentStatusFilter = (
  prompt: string,
): InventoryDocumentStatus | undefined => {
  const text = prompt.trim();
  if (!text || isPosOrderVoidPrompt(text)) {
    return undefined;
  }

  if (/\bvoided\b/i.test(text) && (INVENTORY_DOCUMENT_NOUN.test(text) || hasInventoryContext(text))) {
    return "voided";
  }
  if (/\bcancelled\b/i.test(text) && (INVENTORY_DOCUMENT_NOUN.test(text) || hasInventoryContext(text))) {
    return "cancelled";
  }
  if (/\bdraft\b/i.test(text) && INVENTORY_DOCUMENT_NOUN.test(text)) {
    return "draft";
  }
  if (/\bapproved\b/i.test(text) && INVENTORY_DOCUMENT_NOUN.test(text) && !isPurchaseOrderPrompt(text)) {
    return "approved";
  }
  if (/\bposted\b/i.test(text) && (INVENTORY_DOCUMENT_NOUN.test(text) || hasInventoryContext(text))) {
    return "posted";
  }

  return undefined;
};

export const inferInventoryDocumentType = (prompt: string): InventoryDocumentType | null => {
  const text = prompt.trim();
  if (!text || isPurchaseOrderPrompt(text)) {
    return null;
  }
  return inferInventoryDocumentTypeCore(text);
};

export const inferInventoryMovementType = (prompt: string): InventoryMovementType | null => {
  const docType = inferInventoryDocumentType(prompt);
  if (!docType) {
    return null;
  }
  if (docType === "transfer") {
    return /\btransfer\s+out\b/i.test(prompt) ? "transfer_out" : "transfer_in";
  }
  return docType;
};

export const resolveInventoryDocumentQueryFromPrompt = (prompt: string): {
  documentType: InventoryDocumentType;
  documentStatus?: InventoryDocumentStatus;
  phrase?: string;
} | null => {
  const documentType = inferInventoryDocumentType(prompt);
  if (!documentType) {
    return null;
  }
  const phraseMatch = prompt.match(
    /\b(today|yesterday|this week|last week|this month|last month|last \d+ days)\b/i,
  );
  return {
    documentType,
    documentStatus: inferInventoryDocumentStatusFilter(prompt),
    phrase: phraseMatch?.[1],
  };
};

export const shouldExcludePurchaseOrderTool = (prompt: string): boolean =>
  isPurchaseLedgerPrompt(prompt) || inferInventoryDocumentType(prompt) !== null;

export const shouldPreferInventoryDocumentsTool = (prompt: string): boolean =>
  inferInventoryDocumentType(prompt) !== null;

/** Exclude POS void tools when the prompt is about inventory documents (e.g. voided purchases). */
export const shouldExcludePosVoidTools = (prompt: string): boolean =>
  shouldPreferInventoryDocumentsTool(prompt) || inferInventoryDocumentStatusFilter(prompt) !== undefined;
