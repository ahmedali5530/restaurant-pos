import * as XLSX from "xlsx";
import type {Order} from "@/api/model/order.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import type {OrderItem} from "@/api/model/order_item.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {
  getOrderAmountDueFromPayments,
  getOrderFilteredItems,
  getOrderPaymentTotals,
  getOrderRounding,
  getOrderSettlementFigures,
  type OrderPaymentTotals,
} from "@/lib/order.ts";
import {getOrderItemDisplayLineTotal} from "@/lib/order-item-display.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {safeNumber} from "@/lib/utils.ts";
import {orderReceiptUrl} from "@/routes/posr.ts";

export type AdvancedSalesExportFilters = {
  showMenuItems?: boolean;
  showDetails?: boolean;
};

const getOrderPaymentBreakdown = (paymentTotals: OrderPaymentTotals): string => {
  const paymentMap = new Map<string, number>(Object.entries(paymentTotals.nonCashBreakdown));
  paymentMap.set("Cash", (paymentMap.get("Cash") ?? 0) + paymentTotals.cashAmount);
  if (paymentMap.size === 0) return "-";
  return Array.from(paymentMap.entries())
    .map(([name, amount]) => `${name}: ${amount}`)
    .join(", ");
};

const calculateVoidEntryAmount = (voidEntry: OrderVoid): number => {
  const quantity = safeNumber(voidEntry?.quantity || 1);
  const voidItems = (voidEntry?.items ?? []).filter(Boolean);
  return voidItems.reduce((sum, item) => {
    const lineAmount = calculateOrderItemPrice({
      ...(item ?? {}),
      quantity,
    } as any);
    return sum + safeNumber(lineAmount);
  }, 0);
};

export const calculateAdvancedSalesOrderTotals = (order: Order) => {
  const figures = getOrderSettlementFigures(order);
  const filteredItems = getOrderFilteredItems(order);
  const itemsCount = safeNumber(
    filteredItems.reduce((sum, item) => sum + safeNumber(item?.quantity), 0),
  );
  const covers = safeNumber(order.covers);
  const paymentTotals = getOrderPaymentTotals(order);
  const amountCollected = paymentTotals.amountCollected;
  const amountDue = getOrderAmountDueFromPayments(order);
  const changeDue = paymentTotals.change;
  const paymentBreakdown = getOrderPaymentBreakdown(paymentTotals);
  const net = safeNumber(amountCollected - figures.serviceCharges - figures.tax);
  const rounding = getOrderRounding(order);

  return {
    itemsCount,
    covers,
    salePriceWithoutTax: figures.itemsTotal,
    taxes: figures.tax,
    tips: figures.tips,
    amountDue,
    serviceCharges: figures.serviceCharges,
    discounts: safeNumber(figures.lineDiscounts + figures.cartDiscount),
    coupons: figures.couponDiscount,
    net,
    rounding,
    amountCollected,
    amountCollectedForDetail: paymentTotals.totalReceivedWithChange,
    changeDue,
    paymentBreakdown,
  };
};

export const formatAdvancedSalesItemName = (item: OrderItem): string => {
  const base = item?.item?.name || "Unknown";
  const comment = (item.comments ?? "").trim();
  const modifiers = (item.modifiers ?? [])
    .flatMap((group) => (group.selectedModifiers ?? []).map((m) => m.dish?.name).filter(Boolean))
    .join(", ");
  const parts = [base];
  if (comment) parts.push(`(${comment})`);
  if (modifiers) parts.push(`[${modifiers}]`);
  return parts.join(" ");
};

const personName = (user?: {first_name?: string; last_name?: string; login?: string} | null) => {
  if (!user) return "Unknown";
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.login || "Unknown";
};

const absoluteReceiptUrl = (order: Order): string => {
  const path = orderReceiptUrl({
    id: order.id,
    orderId: order.auto_id,
    invoice: order.invoice_number,
  });
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
};

const applyHyperlink = (ws: XLSX.WorkSheet, address: string, url: string, label: string | number) => {
  ws[address] = {
    t: "s",
    v: String(label),
    l: {Target: url, Tooltip: String(label)},
  };
};

/** Builds Orders sheet rows: each order, then its line items immediately below when requested. */
export const buildAdvancedSalesOrdersSheet = (options: {
  orders: Order[];
  filters: AdvancedSalesExportFilters;
  showInclusive: boolean;
}): {rows: any[][]; linkMeta: Array<{row: number; order: Order}>} => {
  const {orders, filters, showInclusive} = options;
  const includeItems = Boolean(filters.showMenuItems);
  const headers = [
    "Row",
    "Date",
    "Time",
    "Order #",
    "Invoice #",
    "Order Taker",
    "Cashier",
    "Table",
    "Floor",
    "Order Type",
    "Status",
  ];
  if (filters.showDetails) {
    headers.push(
      "Items",
      "Covers",
      "Sale w/o Tax",
      "Taxes",
      "Tip",
      "Service Charges",
      "Discounts",
      "Coupons",
      "Amount Due",
      "Amount Collected",
      "Change Due",
      "Payment Breakdown",
      "Net",
      "Notes",
    );
  } else {
    headers.push("Net");
  }
  if (includeItems) {
    headers.push(
      "Item",
      "Item Qty",
      "Item Price",
      "Item Discount",
      "Item Total",
      "Item Deleted",
    );
  }

  const emptyItemCols = includeItems ? ["", "", "", "", "", ""] : [];
  const rows: any[][] = [headers];
  const linkMeta: Array<{row: number; order: Order}> = [];
  const blankOrderMoneyCols = (count: number) => Array.from({length: count}, () => "");

  orders.forEach((order) => {
    const orderTotals = calculateAdvancedSalesOrderTotals(order);
    const orderDate = toLuxonDateTime(order.created_at);
    const dateStr = orderDate.toFormat(import.meta.env.VITE_DATE_FORMAT);
    const timeStr = orderDate.toFormat(import.meta.env.VITE_TIME_FORMAT);
    const tableName = order.table?.name
      ? `${order.table.name}${order.table.number ?? ""}`
      : `Table ${order.table?.number ?? ""}`;
    const orderCore = [
      dateStr,
      timeStr,
      order.auto_id ?? "",
      order.invoice_number ?? "",
      personName(order.user),
      order.cashier ? personName(order.cashier) : "N/A",
      tableName,
      order.floor?.name || "Unknown",
      order.order_type?.name || "Unknown",
      order.status,
    ];

    const orderDetailCols = filters.showDetails
      ? [
          orderTotals.itemsCount,
          orderTotals.covers,
          orderTotals.salePriceWithoutTax,
          orderTotals.taxes,
          orderTotals.tips,
          orderTotals.serviceCharges,
          -orderTotals.discounts,
          -orderTotals.coupons,
          orderTotals.amountDue,
          orderTotals.amountCollectedForDetail,
          orderTotals.changeDue,
          orderTotals.paymentBreakdown,
          orderTotals.net,
          (order.notes ?? "").trim() || "—",
        ]
      : [orderTotals.net];

    rows.push(["Order", ...orderCore, ...orderDetailCols, ...emptyItemCols]);
    linkMeta.push({row: rows.length - 1, order});

    if (!includeItems) return;

    (order.items ?? []).forEach((item) => {
      const itemPrice = getOrderItemDisplayLineTotal(item, showInclusive);
      const itemDiscount = safeNumber(item.discount);
      const itemTotal = safeNumber(itemPrice) - itemDiscount;
      // Keep order identity on item rows; leave order money blank so totals don't double-count.
      rows.push([
        "Item",
        dateStr,
        timeStr,
        order.auto_id ?? "",
        order.invoice_number ?? "",
        personName(order.user),
        order.cashier ? personName(order.cashier) : "N/A",
        tableName,
        order.floor?.name || "Unknown",
        order.order_type?.name || "Unknown",
        order.status,
        ...blankOrderMoneyCols(orderDetailCols.length),
        formatAdvancedSalesItemName(item),
        safeNumber(item.quantity),
        itemPrice,
        -itemDiscount,
        itemTotal,
        item.deleted_at ? "Yes" : "",
      ]);
      linkMeta.push({row: rows.length - 1, order});
    });
  });

  return {rows, linkMeta};
};

export const exportAdvancedSalesExcel = (options: {
  orders: Order[];
  orderVoids: OrderVoid[];
  filters: AdvancedSalesExportFilters;
  showInclusive: boolean;
  fileName?: string;
}) => {
  const {orders, orderVoids, filters, showInclusive, fileName = "advanced-sales.xlsx"} = options;
  const wb = XLSX.utils.book_new();

  const summaryTotals = orders.reduce(
    (acc, order) => {
      const orderTotals = calculateAdvancedSalesOrderTotals(order);
      acc.salePriceWithoutTax += orderTotals.salePriceWithoutTax;
      acc.taxes += orderTotals.taxes;
      acc.tips += orderTotals.tips;
      acc.amountDue += orderTotals.amountDue;
      acc.serviceCharges += orderTotals.serviceCharges;
      acc.discounts += orderTotals.discounts;
      acc.coupons += orderTotals.coupons;
      acc.net += orderTotals.net;
      acc.rounding += orderTotals.rounding;
      acc.amountCollected += orderTotals.amountCollected;
      acc.ordersCount += 1;
      return acc;
    },
    {
      salePriceWithoutTax: 0,
      taxes: 0,
      tips: 0,
      amountDue: 0,
      serviceCharges: 0,
      discounts: 0,
      coupons: 0,
      net: 0,
      rounding: 0,
      amountCollected: 0,
      ordersCount: 0,
    },
  );
  const totalVoids = orderVoids.reduce((sum, voidEntry) => sum + calculateVoidEntryAmount(voidEntry), 0);

  const summaryRows: Array<[string, string | number]> = [
    ["Metric", "Value"],
    ["Total Orders", summaryTotals.ordersCount],
    ["Sale Price w/o Tax", summaryTotals.salePriceWithoutTax],
    ["Taxes", summaryTotals.taxes],
    ["Service Charges", summaryTotals.serviceCharges],
    ["Discounts", -summaryTotals.discounts],
    ["Coupons", -summaryTotals.coupons],
    ["Voids", -totalVoids],
    ["Tips", summaryTotals.tips],
    ["Amount Due", summaryTotals.amountDue],
    ["Amount Collected", summaryTotals.amountCollected],
    ["Rounding", summaryTotals.rounding],
    ["Net", summaryTotals.net],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

  const {rows: orderRows, linkMeta: orderLinkMeta} = buildAdvancedSalesOrdersSheet({
    orders,
    filters,
    showInclusive,
  });
  const ordersWs = XLSX.utils.aoa_to_sheet(orderRows);
  orderLinkMeta.forEach(({row, order}) => {
    const url = absoluteReceiptUrl(order);
    const orderLabel = order.auto_id ?? recordIdToString(order.id);
    const invoiceLabel = order.invoice_number ?? orderLabel;
    // Order # / Invoice # are columns 3 and 4 after Row type.
    applyHyperlink(ordersWs, XLSX.utils.encode_cell({r: row, c: 3}), url, orderLabel);
    applyHyperlink(ordersWs, XLSX.utils.encode_cell({r: row, c: 4}), url, invoiceLabel);
  });
  XLSX.utils.book_append_sheet(wb, ordersWs, "Orders");

  XLSX.writeFile(wb, fileName);
};
