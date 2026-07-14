import {useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {faFile, faImage, faPrint} from "@fortawesome/free-solid-svg-icons";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryInvoiceDoc} from "@/lib/inventory/invoice.mapper.ts";
import {
  exportElementAsImage,
  exportElementAsPdf,
  printDocument,
} from "@/lib/export.document.ts";

interface Props {
  open: boolean;
  doc: InventoryInvoiceDoc | null;
  onClose: () => void;
}

export const InventoryDocumentPrintModal = ({open, doc, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const documentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  if (!open || !doc) {
    return null;
  }

  const baseName = doc.fileBaseName || `inventory-${doc.invoiceNumber}`;

  const handlePrint = () => {
    printDocument();
  };

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
    <Modal
      title={t("print.previewTitle", {
        docType: doc.docType,
        number: doc.invoiceNumber,
      })}
      open={open}
      onClose={onClose}
      size="xl"
    >
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

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 print:hidden sticky top-0 z-10 bg-neutral-100 py-2">
          <Button
            variant="primary"
            size="sm"
            icon={faPrint}
            onClick={handlePrint}
            disabled={exporting}
          >
            {t("print.print")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={faFile}
            onClick={handleExportPdf}
            disabled={exporting}
          >
            {t("print.exportPdf")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={faImage}
            onClick={handleExportImage}
            disabled={exporting}
          >
            {t("print.exportImage")}
          </Button>
        </div>

        <div className="overflow-auto max-h-[70vh] print:max-h-none print:overflow-visible bg-neutral-200/60 p-4 print:bg-transparent print:p-0">
          <div ref={documentRef}>
            <InventoryInvoice doc={doc} />
          </div>
        </div>
      </div>
    </Modal>
  );
};
