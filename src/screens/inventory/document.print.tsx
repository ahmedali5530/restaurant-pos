import {useEffect, useRef, useState} from "react";
import {useParams} from "react-router";
import {useTranslation} from "react-i18next";
import {faFile, faImage, faPrint} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {Button} from "@/components/common/input/button.tsx";
import {DocumentTitle} from "@/components/common/document-title.tsx";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryInvoiceDoc} from "@/lib/inventory/invoice.mapper.ts";
import {loadInventoryPrintDoc} from "@/lib/inventory/document.print.loader.ts";
import {
  exportElementAsImage,
  exportElementAsPdf,
  printDocument,
} from "@/lib/export.document.ts";

export const InventoryDocumentPrintPage = () => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const {type = "", id = ""} = useParams<{type: string; id: string}>();
  const documentRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<InventoryInvoiceDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setDoc(null);
      try {
        const next = await loadInventoryPrintDoc(db, type, id);
        if (cancelled) return;
        if (!next) {
          setError(t("print.notFound"));
          return;
        }
        setDoc(next);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("print.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [db, id, t, type]);

  const baseName = doc?.fileBaseName || `inventory-${doc?.invoiceNumber || "receipt"}`;

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await exportElementAsPdf(documentRef.current, `${baseName}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportImage = async () => {
    setExporting(true);
    try {
      await exportElementAsImage(documentRef.current, `${baseName}.png`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <DocumentTitle
        parts={[doc ? `${doc.docType} #${doc.invoiceNumber}` : t("print.previewTitle", {docType: type, number: id})]}
      />
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden !important; }
          [data-print-document],
          [data-print-document] * {
            visibility: visible !important;
          }
          [data-print-document] {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-4xl flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 print:hidden sticky top-0 z-10 bg-neutral-100 py-2">
          <Button
            variant="primary"
            size="sm"
            icon={faPrint}
            onClick={() => printDocument()}
            disabled={exporting || !doc}
          >
            {t("print.print")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={faFile}
            onClick={handleExportPdf}
            disabled={exporting || !doc}
          >
            {t("print.exportPdf")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={faImage}
            onClick={handleExportImage}
            disabled={exporting || !doc}
          >
            {t("print.exportImage")}
          </Button>
        </div>

        {loading && (
          <div className="py-12 text-center text-neutral-500 print:hidden">
            {t("common:actions.loading", "Loading...")}
          </div>
        )}

        {error && (
          <div className="py-12 text-center text-danger-600 print:hidden">{error}</div>
        )}

        {doc && (
          <div className="overflow-auto bg-neutral-200/60 p-4 print:bg-transparent print:p-0 print:overflow-visible">
            <div ref={documentRef}>
              <InventoryInvoice doc={doc} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
