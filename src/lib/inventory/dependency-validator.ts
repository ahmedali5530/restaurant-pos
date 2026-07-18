import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toRecordId } from "@/lib/utils.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";

type DatabaseClient = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

export type InventoryDocType = "purchase" | "issue";

export type InventoryDependency = {
  type: "purchase_return" | "issue_return" | "waste";
  id: string;
  label: string;
};

export class InventoryDependencyError extends Error {
  constructor(
    public readonly documentType: InventoryDocType,
    public readonly documentId: string,
    public readonly dependencies: InventoryDependency[]
  ) {
    super(formatDependencyMessage(documentType, dependencies));
    this.name = "InventoryDependencyError";
  }
}

const rows = <T = any>(result: unknown): T[] => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? (first as T[]) : [];
};

const toId = (value: unknown): string | null => {
  if (value == null) return null;
  return recordIdToString(value as any) || String(value);
};

const invoiceLabel = (prefix: string, row: { id?: unknown; invoice_number?: unknown }) => {
  if (row.invoice_number != null) {
    return `${prefix} #${row.invoice_number}`;
  }
  const id = toId(row.id);
  return id ? `${prefix} (${id})` : prefix;
};

/**
 * Collect downstream documents that reference a purchase or issue.
 * Used to block edit/void of posted documents that would corrupt stock history.
 */
export const getDependencies = async (
  db: DatabaseClient | ReturnType<typeof useDB>,
  documentType: InventoryDocType,
  documentId: string
): Promise<InventoryDependency[]> => {
  const docRef = toRecordId(documentId);
  const deps: InventoryDependency[] = [];

  if (documentType === "purchase") {
    const [returns, wastes] = await Promise.all([
      db.query(
        `SELECT id, invoice_number FROM ${Tables.inventory_purchase_returns} WHERE purchase = $id`,
        { id: docRef }
      ),
      db.query(
        `SELECT id, invoice_number FROM ${Tables.inventory_wastes} WHERE purchase = $id`,
        { id: docRef }
      ),
    ]);

    for (const row of rows<{ id: unknown; invoice_number?: number }>(returns)) {
      const id = toId(row.id);
      if (!id) continue;
      deps.push({
        type: "purchase_return",
        id,
        label: invoiceLabel("Purchase return", row),
      });
    }
    for (const row of rows<{ id: unknown; invoice_number?: number }>(wastes)) {
      const id = toId(row.id);
      if (!id) continue;
      deps.push({
        type: "waste",
        id,
        label: invoiceLabel("Waste", row),
      });
    }
  }

  if (documentType === "issue") {
    const [returns, wastes] = await Promise.all([
      db.query(
        `SELECT id, invoice_number FROM ${Tables.inventory_issue_returns} WHERE issuance = $id`,
        { id: docRef }
      ),
      db.query(
        `SELECT id, invoice_number FROM ${Tables.inventory_wastes} WHERE issue = $id`,
        { id: docRef }
      ),
    ]);

    for (const row of rows<{ id: unknown; invoice_number?: number }>(returns)) {
      const id = toId(row.id);
      if (!id) continue;
      deps.push({
        type: "issue_return",
        id,
        label: invoiceLabel("Issue return", row),
      });
    }
    for (const row of rows<{ id: unknown; invoice_number?: number }>(wastes)) {
      const id = toId(row.id);
      if (!id) continue;
      deps.push({
        type: "waste",
        id,
        label: invoiceLabel("Waste", row),
      });
    }
  }

  return deps;
};

export const formatDependencyMessage = (
  documentType: InventoryDocType,
  dependencies: InventoryDependency[]
): string => {
  if (!dependencies.length) {
    return `No downstream dependencies for this ${documentType}.`;
  }
  const lines = dependencies.map((d) => `• ${d.label}`);
  return (
    `Cannot modify or void this ${documentType} because it is referenced by:\n` +
    lines.join("\n") +
    `\nRemove or void those documents first.`
  );
};

export const assertNoDependencies = async (
  db: DatabaseClient | ReturnType<typeof useDB>,
  documentType: InventoryDocType,
  documentId: string
): Promise<void> => {
  const dependencies = await getDependencies(db, documentType, documentId);
  if (dependencies.length > 0) {
    throw new InventoryDependencyError(documentType, documentId, dependencies);
  }
};

export const hasDependencies = async (
  db: DatabaseClient | ReturnType<typeof useDB>,
  documentType: InventoryDocType,
  documentId: string
): Promise<boolean> => {
  const dependencies = await getDependencies(db, documentType, documentId);
  return dependencies.length > 0;
};

/** Block void when downstream docs exist (Phase 6 will reverse ledger after this passes). */
export const assertCanVoid = async (
  db: DatabaseClient | ReturnType<typeof useDB>,
  documentType: InventoryDocType,
  documentId: string
): Promise<void> => {
  await assertNoDependencies(db, documentType, documentId);
};
