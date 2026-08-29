import {parseDateRangeWithPhrase} from "@/api/reports/shared/filters.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {getInventoryDocuments} from "@/api/reports/inventory/documents.ts";
import {resolveInventoryDocumentQueryFromPrompt} from "@/lib/ai/inventory-operation-query.ts";

export type InventoryFastPathResult = {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  instruction: string;
};

const documentInstruction = (prompt: string, payload: unknown) =>
  `${prompt}\n\nget_inventory_documents returned:\n${JSON.stringify(payload)}\n\n`
  + "Summarize each document (number, date, status, supplier/location, line count, totals). "
  + "These are posted inventory documents (purchases, issues, returns, etc.) — NOT purchase orders and NOT POS order voids (removed dishes).";

export const tryInventoryOperationFastPath = async (
  db: DbClient,
  prompt: string,
  options: {onToolStart?: (name: string) => void} = {},
): Promise<InventoryFastPathResult | null> => {
  const docQuery = resolveInventoryDocumentQueryFromPrompt(prompt);
  if (!docQuery) {
    return null;
  }

  options.onToolStart?.("get_inventory_documents");
  const dateRange = parseDateRangeWithPhrase({phrase: docQuery.phrase});
  const args = {
    ...dateRange,
    documentType: docQuery.documentType,
    ...(docQuery.documentStatus ? {documentStatus: docQuery.documentStatus} : {}),
    limit: 50,
  };
  const result = await getInventoryDocuments(db, args);
  const statusNote = docQuery.documentStatus
    ? ` Filtered to status=${docQuery.documentStatus}.`
    : "";
  return {
    toolName: "get_inventory_documents",
    args,
    result,
    instruction: documentInstruction(prompt, result) + statusNote,
  };
};
