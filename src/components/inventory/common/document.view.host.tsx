import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryDocumentAttachments} from "@/components/inventory/common/document.attachments.tsx";
import {
  InventoryInvoiceDoc,
} from "@/lib/inventory/invoice.mapper.ts";
import {
  isInventoryPrintDocType,
  loadInventoryPrintDoc,
} from "@/lib/inventory/document.print.loader.ts";
import type {InventoryPrintDocType} from "@/routes/posr.ts";
import {toRecordId} from "@/lib/utils.ts";
import {Tables} from "@/api/db/tables.ts";

/** Map ledger reference_type → print/view doc type. */
export const ledgerReferenceToDocType = (
  referenceType: string | null | undefined
): InventoryPrintDocType | null => {
  switch (String(referenceType ?? "")) {
    case "purchase":
      return "purchase";
    case "purchase_return":
      return "purchase-return";
    case "issue":
      return "issue";
    case "issue_return":
      return "issue-return";
    case "waste":
      return "waste";
    case "transfer_in":
    case "transfer_out":
      return "stock-transfer";
    default:
      return null;
  }
};

const DOC_TABLE: Partial<Record<InventoryPrintDocType, string>> = {
  purchase: Tables.inventory_purchases,
  "purchase-return": Tables.inventory_purchase_returns,
  "purchase-order": Tables.inventory_purchase_orders,
  issue: Tables.inventory_issues,
  "issue-return": Tables.inventory_issue_returns,
  waste: Tables.inventory_wastes,
  "stock-transfer": Tables.stock_transfers,
};

interface Props {
  open: boolean;
  docType: InventoryPrintDocType | string | null;
  docId: string | null;
  onClose: () => void;
  /** Optional extra content below the invoice (e.g. cost allocation). */
  children?: React.ReactNode;
}

export const InventoryDocumentViewHost = ({
  open,
  docType,
  docId,
  onClose,
  children,
}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [doc, setDoc] = useState<InventoryInvoiceDoc | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!open || !docType || !docId || !isInventoryPrintDocType(String(docType))) {
        setDoc(null);
        setDocuments([]);
        return;
      }
      setLoading(true);
      try {
        const mapped = await loadInventoryPrintDoc(db, String(docType), String(docId));
        if (cancelled) return;
        setDoc(mapped);

        const table = DOC_TABLE[docType as InventoryPrintDocType];
        if (table) {
          try {
            const [row] = await db.query(
              `SELECT documents FROM ONLY $id FETCH documents`,
              {id: toRecordId(String(docId).includes(":") ? String(docId) : `${table}:${docId}`)}
            );
            if (!cancelled) {
              setDocuments((row as any)?.documents ?? []);
            }
          } catch {
            if (!cancelled) setDocuments([]);
          }
        } else if (!cancelled) {
          setDocuments([]);
        }
      } catch (e) {
        console.error("Failed to load inventory document", e);
        if (!cancelled) {
          setDoc(null);
          setDocuments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [open, docType, docId]);

  if (!open) return null;

  const title = doc
    ? `${doc.docType} #${doc.invoiceNumber}`
    : t("print.previewTitle", {docType: docType ?? "", number: ""});

  return (
    <Modal title={title} open={open} onClose={onClose} size="xl">
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-border border-t-primary" />
        </div>
      )}
      {!loading && doc && (
        <div className="space-y-6">
          <InventoryInvoice doc={doc} />
          {children}
          <InventoryDocumentAttachments
            documents={documents}
            downloadPrefix={`${doc.fileBaseName ?? "document"}`}
          />
        </div>
      )}
      {!loading && !doc && (
        <div className="py-8 text-center text-muted text-sm">
          {t("common:messages.notFound", {defaultValue: "Document not found."})}
        </div>
      )}
    </Modal>
  );
};
