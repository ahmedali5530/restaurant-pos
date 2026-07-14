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
      className="mx-auto w-full max-w-[210mm] bg-white text-neutral-900 border border-neutral-300 shadow-sm print:shadow-none print:border-0"
    >
      <div className="px-8 py-8 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between border-b border-neutral-800 pb-6">
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-tight text-neutral-900">
              {doc.restaurantName || "Restaurant"}
            </div>
            {doc.restaurantAddress && (
              <div className="mt-1 text-sm text-neutral-600 whitespace-pre-line max-w-sm">
                {doc.restaurantAddress}
              </div>
            )}
          </div>
          <div className="sm:text-right shrink-0">
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
              {doc.docType}
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              #{doc.invoiceNumber}
            </div>
            <div className="mt-2 text-sm text-neutral-600">{doc.date}</div>
          </div>
        </div>

        {doc.meta.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {doc.meta.map((field) => (
              <div key={`${field.label}-${field.value}`}>
                <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                  {field.label}
                </div>
                <div className="mt-0.5 text-sm font-medium text-neutral-800">
                  {field.value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-800 text-left">
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
                  <th className="py-2 font-semibold">Store</th>
                )}
              </tr>
            </thead>
            <tbody>
              {doc.lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={showCost ? 6 : 5}
                    className="py-6 text-center text-neutral-500"
                  >
                    No items
                  </td>
                </tr>
              ) : (
                doc.lines.map((line, index) => (
                  <tr
                    key={`${line.name}-${index}`}
                    className="border-b border-neutral-200 align-top"
                  >
                    <td className="py-2.5 pr-2 text-neutral-500">{index + 1}</td>
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-neutral-900">{line.name}</div>
                      {line.sku && (
                        <div className="text-xs text-neutral-500">SKU: {line.sku}</div>
                      )}
                      {showCost && line.store && (
                        <div className="text-xs text-neutral-500">Store: {line.store}</div>
                      )}
                      {line.note && (
                        <div className="text-xs text-neutral-500 mt-0.5">{line.note}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">
                      {formatNumber(line.qty)}
                    </td>
                    <td className="py-2.5 pr-2 text-neutral-600">{line.unit || "—"}</td>
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
                      <td className="py-2.5 text-neutral-600">{line.store || "—"}</td>
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
                  className="flex items-center justify-between border-t border-neutral-800 pt-3"
                >
                  <span className="text-sm font-semibold uppercase tracking-wide">
                    {total.label}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{total.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {doc.notes && (
          <div className="mt-8 border-t border-neutral-200 pt-4">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Notes</div>
            <div className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap">{doc.notes}</div>
          </div>
        )}

        <div className="mt-10 pt-4 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-neutral-500">
          <div>Generated at {generatedAt}</div>
          <div>{doc.docType} #{doc.invoiceNumber}</div>
        </div>
      </div>
    </div>
  );
};
