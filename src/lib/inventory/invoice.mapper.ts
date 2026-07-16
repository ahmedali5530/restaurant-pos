import {DateTime as LuxonDateTime} from "luxon";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {InventoryIssueReturn} from "@/api/model/inventory_issue_return.ts";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {InventoryPurchaseReturn} from "@/api/model/inventory_purchase_return.ts";
import {InventoryPurchaseOrder} from "@/api/model/inventory_purchase_order.ts";
import {InventoryWaste} from "@/api/model/inventory_waste.ts";
import {StockTransfer} from "@/api/model/stock_transfer.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {inferTransferType} from "@/lib/inventory/stock_transfer.service.ts";
import {
  lineAmount,
  resolveCatalogUnitCost,
  resolveInventoryLineUnitCost,
} from "@/lib/inventory/line.cost.ts";
import {computePurchaseTotals} from "@/lib/inventory/purchase.totals.ts";
import {safeNumber, withCurrency} from "@/lib/utils.ts";

export type InventoryInvoiceMeta = {
  label: string;
  value: string;
};

export type InventoryInvoiceLine = {
  name: string;
  sku?: string;
  qty: number;
  unit?: string;
  unitCost?: number;
  total?: number;
  store?: string;
  note?: string;
};

export type InventoryInvoiceTotal = {
  label: string;
  value: string;
};

export type InventoryInvoiceDoc = {
  docType: string;
  invoiceNumber: string;
  date: string;
  restaurantName?: string;
  restaurantAddress?: string;
  meta: InventoryInvoiceMeta[];
  lines: InventoryInvoiceLine[];
  notes?: string;
  totals?: InventoryInvoiceTotal[];
  showCostColumns?: boolean;
  fileBaseName?: string;
};

const personName = (user?: {first_name?: string; last_name?: string} | null) => {
  if (!user) return "—";
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || "—";
};

const formatDate = (value?: unknown) => {
  if (!value) return "—";
  try {
    return LuxonDateTime.fromJSDate(toJsDate(value as any)).toFormat(
      import.meta.env.VITE_DATE_TIME_FORMAT || "dd/MM/yyyy HH:mm",
    );
  } catch {
    return "—";
  }
};

const restaurantDefaults = () => ({
  restaurantName: import.meta.env.VITE_RESTAURANT_NAME as string | undefined,
  restaurantAddress: import.meta.env.VITE_RESTAURANT_ADDRESS as string | undefined,
});

const moneyTotal = (lines: InventoryInvoiceLine[]) =>
  lines.reduce((sum, line) => sum + safeNumber(line.total), 0);

const withMoneyTotals = (
  doc: Omit<InventoryInvoiceDoc, "totals"> & {totals?: InventoryInvoiceTotal[]},
  totalLabel = "Total",
): InventoryInvoiceDoc => {
  if (!doc.showCostColumns) return doc;
  const amount = moneyTotal(doc.lines);
  return {
    ...doc,
    totals: doc.totals ?? [{label: totalLabel, value: withCurrency(amount)}],
  };
};

export const mapIssueToInvoice = (issue: InventoryIssue): InventoryInvoiceDoc => {
  const lines: InventoryInvoiceLine[] = (issue.items ?? []).map((item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      item: item.item,
    });
    return {
      name: item.item?.name ?? "Item",
      sku: item.item?.code || item.code,
      qty,
      unit: item.item?.uom,
      unitCost,
      total: lineAmount(unitCost, qty),
      store: item.store?.name,
      note: item.comments,
    };
  });

  return withMoneyTotals({
    ...restaurantDefaults(),
    docType: "Stock Issue",
    invoiceNumber: String(issue.invoice_number ?? "—"),
    date: formatDate(issue.created_at),
    showCostColumns: true,
    fileBaseName: `issue-${issue.invoice_number ?? "receipt"}`,
    meta: [
      {label: "Created by", value: personName(issue.created_by)},
      {label: "Issued to", value: personName(issue.issued_to)},
      {label: "Kitchen", value: issue.kitchen?.name ?? "—"},
      {label: "Store", value: issue.store?.name ?? "—"},
    ],
    lines,
  });
};

export const mapIssueReturnToInvoice = (doc: InventoryIssueReturn): InventoryInvoiceDoc => {
  const lines: InventoryInvoiceLine[] = (doc.items ?? []).map((item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: (item as any).price,
      issuedItem: item.issued_item,
      item: item.item,
    });
    return {
      name: item.item?.name ?? "Item",
      sku: item.item?.code,
      qty,
      unit: item.item?.uom,
      unitCost,
      total: lineAmount(unitCost, qty),
      store: item.store?.name,
      note: item.comments,
    };
  });

  return withMoneyTotals({
    ...restaurantDefaults(),
    docType: "Issue Return",
    invoiceNumber: String(doc.invoice_number ?? "—"),
    date: formatDate(doc.created_at),
    showCostColumns: true,
    fileBaseName: `issue-return-${doc.invoice_number ?? "receipt"}`,
    meta: [
      {
        label: "Issuance",
        value: doc.issuance?.invoice_number != null
          ? `Issue #${doc.issuance.invoice_number}`
          : "—",
      },
      {label: "Issued to", value: personName(doc.issued_to)},
      {label: "Kitchen", value: doc.kitchen?.name ?? "—"},
      {label: "Created by", value: personName(doc.created_by)},
    ],
    lines,
  });
};

export const mapPurchaseToInvoice = (purchase: InventoryPurchase): InventoryInvoiceDoc => {
  const lines: InventoryInvoiceLine[] = (purchase.items ?? []).map((item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      item: item.item,
    });
    return {
      name: item.item?.name ?? "Item",
      sku: item.item?.code || item.code,
      qty,
      unit: item.item?.uom,
      unitCost,
      total: lineAmount(unitCost, qty),
      store: item.store?.name,
      note: [
        item.taxable ? "Taxable" : null,
        item.comments,
      ].filter(Boolean).join(" · ") || undefined,
    };
  });

  const totalsCalc = computePurchaseTotals(
    purchase.items,
    purchase.tax_rate,
    purchase.extras,
  );
  const tax = purchase.tax_amount ?? totalsCalc.taxAmount;
  const totals: InventoryInvoiceTotal[] = [
    {label: "Subtotal", value: withCurrency(totalsCalc.subtotal)},
  ];
  for (const extra of purchase.extras ?? []) {
    if (!extra?.name) continue;
    totals.push({
      label: extra.name,
      value: withCurrency(safeNumber(extra.amount)),
    });
  }
  if (safeNumber(purchase.tax_rate) > 0 || tax > 0) {
    totals.push({
      label: safeNumber(purchase.tax_rate) > 0
        ? `Tax (${safeNumber(purchase.tax_rate)}%)`
        : "Tax",
      value: withCurrency(tax),
    });
  }
  totals.push({
    label: "Grand total",
    value: withCurrency(totalsCalc.subtotal + tax + totalsCalc.extrasTotal),
  });

  return withMoneyTotals({
    ...restaurantDefaults(),
    docType: "Purchase Invoice",
    invoiceNumber: String(purchase.invoice_number ?? "—"),
    date: formatDate(purchase.created_at),
    showCostColumns: true,
    fileBaseName: `purchase-${purchase.invoice_number ?? "receipt"}`,
    notes: purchase.comments,
    meta: [
      {label: "Supplier", value: purchase.supplier?.name ?? "—"},
      {
        label: "Purchase order",
        value: purchase.purchase_order?.po_number != null
          ? `PO #${purchase.purchase_order.po_number}`
          : "—",
      },
      {label: "Created by", value: personName(purchase.created_by)},
      {label: "Method", value: purchase.method ?? "Manual"},
      {label: "Payment", value: purchase.payment_method ?? "—"},
      {label: "Store", value: purchase.store?.name ?? "—"},
    ],
    lines,
    totals,
  });
};

export const mapPurchaseReturnToInvoice = (
  doc: InventoryPurchaseReturn,
): InventoryInvoiceDoc => {
  const lines: InventoryInvoiceLine[] = (doc.items ?? []).map((item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      purchaseItem: item.purchase_item,
      item: item.item,
    });
    return {
      name: item.item?.name ?? "Item",
      sku: item.item?.code,
      qty,
      unit: item.item?.uom,
      unitCost,
      total: lineAmount(unitCost, qty),
      store: item.store?.name,
      note: item.comments,
    };
  });

  return withMoneyTotals({
    ...restaurantDefaults(),
    docType: "Purchase Return",
    invoiceNumber: String(doc.invoice_number ?? "—"),
    date: formatDate(doc.created_at),
    showCostColumns: true,
    fileBaseName: `purchase-return-${doc.invoice_number ?? "receipt"}`,
    meta: [
      {
        label: "Purchase invoice",
        value: doc.purchase?.invoice_number != null
          ? `Invoice #${doc.purchase.invoice_number}`
          : "—",
      },
      {label: "Supplier", value: doc.purchase?.supplier?.name ?? "—"},
      {label: "Created by", value: personName(doc.created_by)},
      {label: "Store", value: doc.store?.name ?? "—"},
    ],
    lines,
  });
};

export const mapPurchaseOrderToInvoice = (
  order: InventoryPurchaseOrder,
): InventoryInvoiceDoc => {
  const lines: InventoryInvoiceLine[] = (order.items ?? []).map((item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      item: item.item,
    });
    return {
      name: item.item?.name ?? "Item",
      sku: item.item?.code,
      qty,
      unit: item.item?.uom,
      unitCost,
      total: lineAmount(unitCost, qty),
      store: item.store?.name,
    };
  });

  return withMoneyTotals({
    ...restaurantDefaults(),
    docType: "Purchase Order",
    invoiceNumber: String(order.po_number ?? "—"),
    date: formatDate(order.created_at),
    showCostColumns: true,
    fileBaseName: `purchase-order-${order.po_number ?? "receipt"}`,
    meta: [
      {label: "Supplier", value: order.supplier?.name ?? "—"},
      {label: "Status", value: order.status ?? "—"},
    ],
    lines,
  });
};

export const mapWasteToInvoice = (waste: InventoryWaste): InventoryInvoiceDoc => {
  const lines: InventoryInvoiceLine[] = (waste.items ?? []).map((item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: (item as any).price,
      purchaseItem: item.purchase_item,
      issueItem: item.issue_item,
      item: item.item,
    });
    return {
      name: item.item?.name ?? "Item",
      sku: item.item?.code,
      qty,
      unit: item.item?.uom,
      unitCost,
      total: lineAmount(unitCost, qty),
      store: item.store?.name,
      note: item.comments,
    };
  });

  return withMoneyTotals({
    ...restaurantDefaults(),
    docType: "Waste",
    invoiceNumber: String(waste.invoice_number ?? "—"),
    date: formatDate(waste.created_at),
    showCostColumns: true,
    fileBaseName: `waste-${waste.invoice_number ?? "receipt"}`,
    meta: [
      {
        label: "Source",
        value: waste.purchase
          ? `Purchase #${waste.purchase.invoice_number}`
          : waste.issue
            ? `Issue #${waste.issue.invoice_number ?? waste.issue.id}`
            : "—",
      },
      {label: "Created by", value: personName(waste.created_by)},
    ],
    lines,
  });
};

export const mapStockTransferToInvoice = (
  transfer: StockTransfer,
): InventoryInvoiceDoc => {
  const type = inferTransferType(transfer);
  const lines: InventoryInvoiceLine[] = (transfer.items ?? []).map((item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveCatalogUnitCost(item.item);
    return {
      name: item.item?.name ?? "Item",
      sku: item.item?.code,
      qty,
      unit: item.item?.uom,
      unitCost,
      total: lineAmount(unitCost, qty),
    };
  });

  const idStr = typeof transfer.id === "string"
    ? transfer.id
    : String(transfer.id ?? "");
  const shortId = idStr.includes(":") ? idStr.split(":").pop() : idStr.slice(-8);

  return withMoneyTotals({
    ...restaurantDefaults(),
    docType: "Stock Transfer",
    invoiceNumber: shortId || "—",
    date: formatDate(transfer.created_at),
    showCostColumns: true,
    fileBaseName: `stock-transfer-${shortId || "receipt"}`,
    notes: transfer.notes,
    meta: [
      {
        label: "Type",
        value: type === "kitchen" ? "Kitchen transfer" : "Store transfer",
      },
      {
        label: type === "kitchen" ? "From kitchen" : "From store",
        value: type === "kitchen"
          ? transfer.from_kitchen?.name ?? "—"
          : transfer.from_store?.name ?? "—",
      },
      {
        label: type === "kitchen" ? "To kitchen" : "To store",
        value: type === "kitchen"
          ? transfer.to_kitchen?.name ?? "—"
          : transfer.to_store?.name ?? "—",
      },
      {label: "Created by", value: personName(transfer.created_by)},
    ],
    lines,
  });
};
