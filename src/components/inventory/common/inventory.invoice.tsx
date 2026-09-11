import {DateTime} from "luxon";
import {InventoryInvoiceDoc} from "@/lib/inventory/invoice.mapper.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";

interface Props {
  doc: InventoryInvoiceDoc;
}

export const InventoryInvoice = ({doc}: Props) => {
  const showCost = !!doc.showCostColumns;
  const generatedAt = DateTime.now().toFormat(
    import.meta.env.VITE_DATE_TIME_FORMAT || "dd/MM/yyyy HH:mm",
  );

  return (
    <div
      data-print-document
      className="mx-auto w-full max-w-[210mm] bg-surface-elevated text-foreground border border-border shadow-sm print:bg-white print:text-neutral-900 print:shadow-none print:border-0"
    >
      <div className="px-8 py-8 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-6">
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {doc.restaurantName || "Restaurant"}
            </div>
            {doc.restaurantAddress && (
              <div className="mt-1 text-sm text-muted whitespace-pre-line max-w-sm">
                {doc.restaurantAddress}
              </div>
            )}
          </div>
          <div className="sm:text-right shrink-0">
            <div className="text-xs uppercase tracking-[0.16em] text-muted">
              {doc.docType}
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              #{doc.invoiceNumber}
            </div>
            <div className="mt-2 text-sm text-muted">{doc.date}</div>
          </div>
        </div>

        {doc.meta.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {doc.meta.map((field) => (
              <div key={`${field.label}-${field.value}`}>
                <div className="text-[11px] uppercase tracking-wide text-muted">
                  {field.label}
                </div>
                <div className="mt-0.5 text-sm font-medium text-foreground">
                  {field.value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left">
                <th className="py-2 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">Item</th>
                <th className="py-2 pr-2 font-semibold text-right">Qty</th>
                <th className="py-2 pr-2 font-semibold">Unit</th>
                {showCost && (
                  <>
                    <th className="py-2 pr-2 font-semibold text-right">Unit cost</th>
                    <th className="py-2 font-semibold text-right">Amount</th>
                  </>
                )}
                {!showCost && (
                  <th className="py-2 font-semibold">Location</th>
                )}
              </tr>
            </thead>
            <tbody>
              {doc.lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={showCost ? 6 : 5}
                    className="py-6 text-center text-muted"
                  >
                    No items
                  </td>
                </tr>
              ) : (
                doc.lines.map((line, index) => (
                  <tr
                    key={`${line.name}-${index}`}
                    className="border-b border-border align-top"
                  >
                    <td className="py-2.5 pr-2 text-muted">{index + 1}</td>
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-foreground">{line.name}</div>
                      {line.sku && (
                        <div className="text-xs text-muted">SKU: {line.sku}</div>
                      )}
                      {showCost && line.location && (
                        <div className="text-xs text-muted">Location: {line.location}</div>
                      )}
                      {line.note && (
                        <div className="text-xs text-muted mt-0.5">{line.note}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">
                      {formatNumber(line.qty)}
                    </td>
                    <td className="py-2.5 pr-2 text-muted">{line.unit || "—"}</td>
                    {showCost ? (
                      <>
                        <td className="py-2.5 pr-2 text-right tabular-nums">
                          {line.unitCost != null ? withCurrency(line.unitCost) : "—"}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-medium">
                          {line.total != null ? withCurrency(line.total) : "—"}
                        </td>
                      </>
                    ) : (
                      <td className="py-2.5 text-muted">{line.location || "—"}</td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {doc.totals && doc.totals.length > 0 && (
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              {doc.totals.map((total) => (
                <div
                  key={total.label}
                  className={
                    total.label === "Grand total" || total.label === "Total"
                      ? "flex items-center justify-between border-t border-border pt-3"
                      : "flex items-center justify-between border-t border-border pt-2"
                  }
                >
                  <span
                    className={
                      total.label === "Grand total" || total.label === "Total"
                        ? "text-sm font-semibold uppercase tracking-wide"
                        : "text-sm text-muted"
                    }
                  >
                    {total.label}
                  </span>
                  <span
                    className={
                      total.label === "Grand total" || total.label === "Total"
                        ? "text-lg font-semibold tabular-nums"
                        : "text-sm font-medium tabular-nums"
                    }
                  >
                    {total.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {doc.notes && (
          <div className="mt-8 border-t border-border pt-4">
            <div className="text-[11px] uppercase tracking-wide text-muted">Notes</div>
            <div className="mt-1 text-sm text-foreground whitespace-pre-wrap">{doc.notes}</div>
          </div>
        )}

        <div className="mt-10 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted">
          <div>Generated at {generatedAt}</div>
          <div>{doc.docType} #{doc.invoiceNumber}</div>
        </div>
      </div>
    </div>
  );
};
