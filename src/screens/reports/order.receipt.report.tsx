import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {faFile, faImage, faPrint} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import type {Order} from "@/api/model/order.ts";
import type {GetOrderDetailOptions} from "@/api/reports/operations/order-detail.ts";
import {resolveOrderRecord} from "@/api/reports/operations/order-detail.ts";
import {Button} from "@/components/common/input/button.tsx";
import {DocumentTitle} from "@/components/common/document-title.tsx";
import {OrderReceiptView} from "@/components/reports/order-receipt/order.receipt.view.tsx";
import {getFiscalQrcodesForOrderPrint} from "@/integrations/providers/fiscal/settlement.ts";
import type {FiscalQrPrintItem} from "@/integrations/providers/fiscal/shared/runtime-config.ts";
import {getInvoiceNumber} from "@/lib/order.ts";
import {
  exportElementAsImage,
  exportElementAsPdf,
  printDocument,
} from "@/lib/export.document.ts";

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    id: (params.get("id") || "").trim(),
    orderId: (params.get("order_id") || "").trim(),
    invoice: (params.get("invoice") || "").trim(),
  };
};

const toLookupOptions = (filters: ReturnType<typeof parseFilters>): GetOrderDetailOptions => {
  const options: GetOrderDetailOptions = {};

  if (filters.id) {
    options.orderId = filters.id;
  }

  if (filters.orderId) {
    if (filters.orderId.includes(":")) {
      options.orderId = options.orderId ?? filters.orderId;
    } else {
      const n = Number(filters.orderId);
      if (Number.isFinite(n)) {
        options.autoId = n;
        if (options.invoiceNumber === undefined) {
          options.invoiceNumber = n;
        }
      } else {
        options.orderId = options.orderId ?? filters.orderId;
      }
    }
  }

  if (filters.invoice) {
    const n = Number(filters.invoice);
    if (Number.isFinite(n)) {
      options.invoiceNumber = n;
    }
  }

  return options;
};

const hasLookup = (options: GetOrderDetailOptions) =>
  Boolean(options.orderId)
  || (options.autoId !== undefined && Number.isFinite(options.autoId))
  || (options.invoiceNumber !== undefined && Number.isFinite(options.invoiceNumber));

export const OrderReceiptReport = () => {
  const {t} = useTranslation("reports");
  const {t: tNav} = useTranslation("navigation");
  const db = useDB();
  const queryRef = useRef(db.query);
  const documentRef = useRef<HTMLDivElement>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [qrcodes, setQrcodes] = useState<FiscalQrPrintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(parseFilters, []);
  const lookup = useMemo(() => toLookupOptions(filters), [filters]);
  const invoiceLabel = order ? getInvoiceNumber(order) : filters.orderId || filters.invoice || filters.id;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!hasLookup(lookup)) {
        setError(t("errors.orderIdRequired"));
        setOrder(null);
        setQrcodes([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setOrder(null);
      setQrcodes([]);

      try {
        const next = await resolveOrderRecord(
          {query: (sql, params) => queryRef.current(sql, params)},
          lookup,
        );
        if (cancelled) {
          return;
        }
        if (!next) {
          setError(t("errors.noOrderFound"));
          return;
        }
        setOrder(next);
        try {
          const codes = await getFiscalQrcodesForOrderPrint(db, next.id);
          if (!cancelled) {
            setQrcodes(codes);
          }
        } catch {
          if (!cancelled) {
            setQrcodes([]);
          }
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : t("errors.unableToLoad"));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [lookup, t]);

  const baseName = `order-receipt-${invoiceLabel || "order"}`;

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
        parts={[t("titles.orderReceipt"), invoiceLabel, tNav("sidebar.reports")].filter(Boolean) as string[]}
      />
      <style>{`
        @media print {
          @page { size: auto; margin: 8mm; }
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

      <div className="mx-auto max-w-xl flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 print:hidden sticky top-0 z-10 bg-neutral-100 py-2">
          <Button
            variant="primary"
            size="sm"
            icon={faPrint}
            onClick={() => printDocument()}
            disabled={exporting || !order}
          >
            {t("layout.print")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={faFile}
            onClick={() => void handleExportPdf()}
            disabled={exporting || !order}
          >
            {t("layout.downloadPdf")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={faImage}
            onClick={() => void handleExportImage()}
            disabled={exporting || !order}
          >
            {t("layout.downloadImage")}
          </Button>
        </div>

        {loading && (
          <div className="py-12 text-center text-neutral-500 print:hidden">
            {t("loading.orderReceipt")}
          </div>
        )}

        {error && (
          <div className="py-12 text-center text-danger-600 print:hidden">{error}</div>
        )}

        {order && (
          <div className="overflow-auto bg-neutral-200/60 p-4 print:bg-transparent print:p-0 print:overflow-visible">
            <div ref={documentRef}>
              <OrderReceiptView order={order} qrcodes={qrcodes} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
