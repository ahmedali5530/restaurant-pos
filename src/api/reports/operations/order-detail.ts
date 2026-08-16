import {ORDER_FETCHES, parseOrderQueryResult, type Order} from "@/api/model/order.ts";
import type {OrderItem} from "@/api/model/order_item.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import type {OrderItemKitchen} from "@/api/model/order_item_kitchen.ts";
import type {OrderRefund} from "@/api/model/order_refund.ts";
import type {OrderDiscount} from "@/api/model/order_discount.ts";
import type {OrderFiscalSubmission} from "@/api/model/order_fiscal_submission.ts";
import type {OrderPrint} from "@/api/model/order_print.ts";
import {Tables} from "@/api/db/tables.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {recordIdToString, toQueryRecordId} from "@/api/reports/shared/records.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {getFiscalProviderLabel} from "@/integrations/storage/order-fiscal-repository.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {
  getActiveOrderDiscounts,
  getOrderSettlementFigures,
} from "@/lib/order.ts";
import {safeNumber} from "@/lib/utils.ts";

export interface GetOrderDetailOptions {
  orderId?: string;
  autoId?: number;
  invoiceNumber?: number;
  trackingLimit?: number;
}

export interface OrderDetailItem {
  id: string;
  dishId?: string;
  dishName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  seat?: string;
  isAddition?: boolean;
  isRefunded?: boolean;
  deletedAt?: unknown;
  createdAt?: unknown;
  createdBy?: string;
  comments?: string;
  modifiers: Array<{name: string; quantity?: number; price?: number}>;
  taxes: Array<{name: string; amount?: number}>;
}

export interface OrderDetailTimelineEvent {
  type: string;
  timestamp?: unknown;
  title: string;
  details?: string;
}

export interface OrderDetailResult {
  found: boolean;
  order?: {
    id: string;
    autoId?: number;
    invoiceNumber?: number;
    split?: number;
    status?: string;
    createdAt?: unknown;
    completedAt?: unknown;
    server?: string;
    cashier?: string;
    customer?: string;
    table?: string;
    floor?: string;
    orderType?: string;
    covers?: number;
    notes?: string;
    delivery?: unknown;
    tags?: unknown;
    figures: ReturnType<typeof getOrderSettlementFigures>;
  };
  items: OrderDetailItem[];
  voids: Array<{
    id: string;
    reason?: string;
    comments?: string;
    quantity: number;
    amount?: number;
    deletedBy?: string;
    createdAt?: unknown;
    itemNames: string[];
  }>;
  discounts: Array<{
    name: string;
    scope?: string;
    appliedAmount: number;
    applicationType?: string;
    reason?: string;
    appliedBy?: string;
    removedAt?: unknown;
  }>;
  taxes: Array<{taxName: string; rate?: number; amount: number}>;
  payments: Array<{
    type?: string;
    name?: string;
    amount: number;
    payable?: number;
    comments?: string;
  }>;
  coupon?: {code?: string; amount: number};
  kitchen: Array<{
    itemName: string;
    kitchen?: string;
    stage?: string;
    status?: string;
    activatedAt?: unknown;
    completedAt?: unknown;
  }>;
  refunds: Array<{
    id: string;
    reason?: string;
    manager?: string;
    createdAt?: unknown;
    itemNames: string[];
  }>;
  mergeSplit?: {
    merges: Array<{id: string; createdAt?: unknown; newOrderId?: string; oldOrderIds: string[]}>;
    splits: Array<{id: string; createdAt?: unknown; oldOrderId?: string; newOrderIds: string[]}>;
  };
  fiscals: Array<{
    id: string;
    providerId: string;
    providerLabel: string;
    status: string;
    fiscalInvoiceNumber?: string;
    qrcode?: string;
    code?: string | number;
    error?: string;
    selectedForPrint?: boolean;
    qrPriority?: number;
    submittedAt?: unknown;
    createdAt?: unknown;
    requestPayload?: unknown;
    responsePayload?: unknown;
  }>;
  prints: Array<{
    id: string;
    printType: string;
    printedBy?: string;
    printedAt?: unknown;
    isOverride?: boolean;
    isDuplicate?: boolean;
  }>;
  tracking: Array<{
    id?: string;
    module?: string;
    page?: string;
    userName?: string;
    authMethod?: string;
    createdAt?: unknown;
    payload?: Record<string, unknown>;
  }>;
  timeline: OrderDetailTimelineEvent[];
}

const personName = (user?: {first_name?: string; last_name?: string; name?: string} | string) => {
  if (!user) {
    return undefined;
  }
  if (typeof user === "string") {
    return user;
  }
  if (user.name) {
    return user.name;
  }
  const full = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return full || undefined;
};

const flattenModifiers = (item: OrderItem): Array<{name: string; quantity?: number; price?: number}> => {
  const result: Array<{name: string; quantity?: number; price?: number}> = [];
  for (const group of item.modifiers ?? []) {
    for (const selected of group.selectedModifiers ?? []) {
      result.push({
        name: String((selected as {dish?: {name?: string}; name?: string}).dish?.name
          ?? (selected as {name?: string}).name
          ?? "Modifier"),
        quantity: safeNumber((selected as {quantity?: number}).quantity) || 1,
        price: safeNumber((selected as {price?: number}).price),
      });
    }
  }
  return result;
};

const normalizeOrderLookup = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes(":")) {
    return trimmed;
  }
  return `order:${trimmed}`;
};

const resolveOrderRecord = async (
  db: DbClient,
  options: GetOrderDetailOptions,
): Promise<Order | null> => {
  const fetchClause = ORDER_FETCHES.join(", ");

  if (options.orderId) {
    const orderRef = toQueryRecordId(normalizeOrderLookup(options.orderId), Tables.orders);
    const onlyResult = await db.query(
      `SELECT * FROM ONLY $order FETCH ${fetchClause}`,
      {order: orderRef},
    );
    const fromOnly = parseOrderQueryResult(onlyResult);
    if (fromOnly) {
      return fromOnly;
    }

    const legacy = unwrapQueryResult<Order>(
      await db.query(
        `SELECT * FROM $order FETCH ${fetchClause}`,
        {order: orderRef},
      ),
    );
    if (legacy[0]) {
      return legacy[0];
    }
  }

  if (options.autoId !== undefined && Number.isFinite(options.autoId)) {
    const rows = unwrapQueryResult<Order>(
      await db.query(
        `
          SELECT * FROM ${Tables.orders}
          WHERE auto_id = $autoId
          LIMIT 1
          FETCH ${fetchClause}
        `,
        {autoId: options.autoId},
      ),
    );
    if (rows[0]) {
      return rows[0];
    }
  }

  if (options.invoiceNumber !== undefined && Number.isFinite(options.invoiceNumber)) {
    const rows = unwrapQueryResult<Order>(
      await db.query(
        `
          SELECT * FROM ${Tables.orders}
          WHERE invoice_number = $invoiceNumber
          ORDER BY created_at DESC
          LIMIT 1
          FETCH ${fetchClause}
        `,
        {invoiceNumber: options.invoiceNumber},
      ),
    );
    if (rows[0]) {
      return rows[0];
    }
  }

  return null;
};

const mapItem = (item: OrderItem): OrderDetailItem => {
  const quantity = safeNumber(item.quantity) || 1;
  const lineTotal = safeNumber(calculateOrderItemPrice(item));
  return {
    id: recordIdToString(item.id),
    dishId: recordIdToString(item.item?.id),
    dishName: item.item?.name || "Unknown item",
    quantity,
    unitPrice: quantity > 0 ? lineTotal / quantity : safeNumber(item.price),
    lineTotal,
    seat: item.seat,
    isAddition: item.is_addition,
    isRefunded: item.is_refunded,
    deletedAt: item.deleted_at,
    createdAt: item.created_at,
    createdBy: personName(item.created_by as any),
    comments: item.comments,
    modifiers: flattenModifiers(item),
    taxes: (item.taxes ?? []).map(tax => ({
      name: tax.name || "Tax",
      amount: safeNumber((tax as {amount?: number}).amount),
    })),
  };
};

const buildTimeline = (input: {
  order: Order;
  items: OrderDetailItem[];
  voids: OrderDetailResult["voids"];
  kitchen: OrderDetailResult["kitchen"];
  payments: OrderDetailResult["payments"];
  refunds: OrderDetailResult["refunds"];
  fiscals: OrderDetailResult["fiscals"];
  prints: OrderDetailResult["prints"];
  tracking: OrderDetailResult["tracking"];
}): OrderDetailTimelineEvent[] => {
  const events: OrderDetailTimelineEvent[] = [];
  const orderStart = input.order.created_at;

  events.push({
    type: "start",
    timestamp: orderStart,
    title: "Order started",
    details: input.order.invoice_number ? `Invoice #${input.order.invoice_number}` : undefined,
  });

  for (const item of input.items) {
    if (item.deletedAt) {
      events.push({
        type: "deletion",
        timestamp: item.deletedAt,
        title: "Item deleted",
        details: `${item.dishName} x${item.quantity}`,
      });
      continue;
    }
    if (item.isAddition) {
      events.push({
        type: "addition",
        timestamp: item.createdAt,
        title: "Item added",
        details: `${item.dishName} x${item.quantity}`,
      });
    }
  }

  for (const voidRow of input.voids) {
    events.push({
      type: "void",
      timestamp: voidRow.createdAt,
      title: `Void: ${voidRow.reason || "unspecified"}`,
      details: voidRow.itemNames.join(", ") || undefined,
    });
  }

  for (const kitchen of input.kitchen) {
    if (kitchen.completedAt) {
      events.push({
        type: "kitchen_complete",
        timestamp: kitchen.completedAt,
        title: "Kitchen completed",
        details: `${kitchen.itemName}${kitchen.kitchen ? ` @ ${kitchen.kitchen}` : ""}`,
      });
    }
  }

  if (input.order.completed_at && input.payments.length > 0) {
    events.push({
      type: "payment",
      timestamp: input.order.completed_at,
      title: "Order paid / completed",
      details: input.payments.map(p => `${p.name || p.type || "payment"}: ${p.amount}`).join(", "),
    });
  }

  for (const refund of input.refunds) {
    events.push({
      type: "refund",
      timestamp: refund.createdAt,
      title: "Refund",
      details: refund.reason || refund.itemNames.join(", ") || undefined,
    });
  }

  for (const fiscal of input.fiscals) {
    events.push({
      type: "fiscal",
      timestamp: fiscal.submittedAt || fiscal.createdAt,
      title: `Fiscal ${fiscal.status}: ${fiscal.providerLabel}`,
      details: [
        fiscal.fiscalInvoiceNumber ? `Invoice ${fiscal.fiscalInvoiceNumber}` : undefined,
        fiscal.error,
        fiscal.selectedForPrint ? "selected for print" : undefined,
      ].filter(Boolean).join(" · ") || undefined,
    });
  }

  for (const print of input.prints) {
    events.push({
      type: "print",
      timestamp: print.printedAt,
      title: `Bill print (${print.printType})`,
      details: [
        print.printedBy,
        print.isOverride ? "override" : undefined,
        print.isDuplicate ? "duplicate" : undefined,
      ].filter(Boolean).join(" · ") || undefined,
    });
  }

  for (const entry of input.tracking) {
    events.push({
      type: "tracking",
      timestamp: entry.createdAt,
      title: entry.module || "Tracking event",
      details: [entry.userName, entry.page].filter(Boolean).join(" · ") || undefined,
    });
  }

  return events.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp as string | Date).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp as string | Date).getTime() : 0;
    return ta - tb;
  });
};

export const getOrderDetail = async (
  db: DbClient,
  options: GetOrderDetailOptions = {},
): Promise<OrderDetailResult> => {
  const trackingLimit = Math.min(Math.max(options.trackingLimit ?? 100, 1), 500);
  const order = await resolveOrderRecord(db, options);

  if (!order) {
    return {
      found: false,
      items: [],
      voids: [],
      discounts: [],
      taxes: [],
      payments: [],
      kitchen: [],
      refunds: [],
      fiscals: [],
      prints: [],
      tracking: [],
      timeline: [],
    };
  }

  const orderId = recordIdToString(order.id);
  const orderRef = toQueryRecordId(orderId, Tables.orders);
  const autoId = Number(order.auto_id);

  const [
    itemRows,
    voidRows,
    kitchenRows,
    refundRows,
    mergeAsNew,
    mergeAsOld,
    splitAsOld,
    splitAsNew,
    fiscalRows,
    printRows,
    trackingRows,
  ] = await Promise.all([
    unwrapQueryResult<OrderItem>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_items}
          WHERE order = $order
          ORDER BY created_at ASC
          FETCH item, created_by, taxes, modifiers, modifiers.selectedModifiers, modifiers.selectedModifiers.dish
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<OrderVoid>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_voids}
          WHERE order = $order
          ORDER BY created_at ASC
          FETCH deleted_by, order_item, order_item.item, items, items.item
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<OrderItemKitchen>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_items_kitchen}
          WHERE order_item.order = $order
          ORDER BY activated_at ASC, completed_at ASC
          FETCH kitchen, order_item, order_item.item
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<OrderRefund>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_refunds}
          WHERE order = $order
          ORDER BY created_at ASC
          FETCH manager, items, items.item
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<{id?: unknown; created_at?: unknown; new_order?: unknown; old_orders?: unknown[]}>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_merge}
          WHERE new_order = $order
          FETCH new_order, old_orders, created_by
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<{id?: unknown; created_at?: unknown; new_order?: unknown; old_orders?: unknown[]}>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_merge}
          WHERE $order IN old_orders
          FETCH new_order, old_orders, created_by
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<{id?: unknown; created_at?: unknown; old_order?: unknown; new_orders?: unknown[]}>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_split}
          WHERE old_order = $order
          FETCH old_order, new_orders, created_by
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<{id?: unknown; created_at?: unknown; old_order?: unknown; new_orders?: unknown[]}>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_split}
          WHERE $order IN new_orders
          FETCH old_order, new_orders, created_by
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<OrderFiscalSubmission>(
      await db.query(
        `
          SELECT * FROM ${Tables.integration_order_fiscals}
          WHERE order = $order
          ORDER BY submitted_at DESC, created_at DESC
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<OrderPrint & {printed_by?: {first_name?: string; last_name?: string; name?: string} | string}>(
      await db.query(
        `
          SELECT * FROM ${Tables.order_prints}
          WHERE order = $order
          ORDER BY printed_at ASC
          FETCH printed_by
        `,
        {order: orderRef},
      ),
    ),
    unwrapQueryResult<{
      id?: unknown;
      module?: string;
      page?: string;
      user_name?: string;
      auth_method?: string;
      created_at?: unknown;
      payload?: Record<string, unknown>;
    }>(
      await db.query(
        `
          SELECT * FROM ${Tables.tracking}
          WHERE payload.order = $payloadOrder
             OR payload.orderId = $payloadOrder
             OR payload.order_id = $payloadOrder
          ORDER BY created_at ASC
          LIMIT $limit
        `,
        {payloadOrder: orderId, limit: trackingLimit},
      ),
    ),
  ]);

  // Fallback: if item table query empty, use embedded order.items
  const sourceItems = itemRows.length > 0 ? itemRows : (order.items ?? []);
  const items = sourceItems.map(mapItem);

  const voids = voidRows.map(row => {
    const relatedItems = [
      ...(row.items ?? []),
      ...(row.order_item ? [row.order_item] : []),
    ];
    const itemNames = relatedItems
      .map(item => item?.item?.name || "Item")
      .filter(Boolean);
    const amount = relatedItems.reduce(
      (sum, item) => sum + safeNumber(calculateOrderItemPrice(item as OrderItem)),
      0,
    );
    return {
      id: recordIdToString(row.id),
      reason: row.reason,
      comments: row.comments,
      quantity: safeNumber(row.quantity) || 1,
      amount,
      deletedBy: personName(row.deleted_by as any),
      createdAt: row.created_at,
      itemNames,
    };
  });

  const activeDiscounts = getActiveOrderDiscounts(order);
  const discounts = [
    ...activeDiscounts.map((line: OrderDiscount) => {
      const discountRef = line.discount;
      const discountName = typeof discountRef === "object" && discountRef
        ? discountRef.name
        : undefined;
      const reasonRef = line.reason;
      const reasonName = typeof reasonRef === "object" && reasonRef
        ? reasonRef.name
        : typeof reasonRef === "string"
          ? reasonRef
          : undefined;
      return {
        name: discountName || line.name || "Discount",
        scope: String(line.scope || line.application_type || ""),
        appliedAmount: safeNumber(line.applied_amount),
        applicationType: line.application_type,
        reason: line.reason_text || reasonName,
        appliedBy: personName(line.applied_by as any),
        removedAt: line.removed_at,
      };
    }),
    ...items
      .filter(item => {
        if (item.deletedAt) {
          return false;
        }
        const raw = sourceItems.find(s => recordIdToString(s.id) === item.id) as OrderItem | undefined;
        return safeNumber(raw?.discount) > 0;
      })
      .map(item => {
        const raw = sourceItems.find(s => recordIdToString(s.id) === item.id) as OrderItem | undefined;
        return {
          name: `Line discount: ${item.dishName}`,
          scope: "line",
          appliedAmount: safeNumber(raw?.discount),
          applicationType: "line" as const,
          reason: undefined,
          appliedBy: undefined,
          removedAt: undefined,
        };
      }),
  ];

  const taxes = (order.order_taxes ?? []).map(row => ({
    taxName: row.tax?.name || "Tax",
    rate: safeNumber(row.tax?.rate ?? (row as {rate?: number}).rate),
    amount: safeNumber(row.amount),
  }));

  if (taxes.length === 0 && safeNumber(order.tax_amount) > 0) {
    taxes.push({
      taxName: order.tax?.name || "Tax",
      rate: safeNumber(order.tax?.rate),
      amount: safeNumber(order.tax_amount),
    });
  }

  const payments = (order.payments ?? []).map(payment => ({
    type: payment.payment_type?.type,
    name: payment.payment_type?.name,
    amount: safeNumber(payment.amount),
    payable: safeNumber(payment.payable) || undefined,
    comments: payment.comments,
  }));

  const coupon = order.coupon
    ? {
        code: order.coupon.coupon?.code || (order.coupon as {code?: string}).code,
        amount: safeNumber(order.coupon.discount),
      }
    : undefined;

  const kitchen = kitchenRows.map(row => ({
    itemName: row.order_item?.item?.name || "Item",
    kitchen: (row.kitchen as {name?: string} | undefined)?.name,
    stage: row.stage_name || (row as {stage?: string}).stage,
    status: row.status,
    activatedAt: row.activated_at,
    completedAt: row.completed_at,
  }));

  const refunds = refundRows.map(row => ({
    id: recordIdToString(row.id),
    reason: row.reason,
    manager: personName(row.manager as any),
    createdAt: row.created_at,
    itemNames: (row.items ?? []).map(item => item?.item?.name || "Item"),
  }));

  const mergeMap = new Map<string, {
    id: string;
    createdAt?: unknown;
    newOrderId?: string;
    oldOrderIds: string[];
  }>();
  for (const row of [...mergeAsNew, ...mergeAsOld]) {
    const id = recordIdToString(row.id);
    if (!id || mergeMap.has(id)) {
      continue;
    }
    mergeMap.set(id, {
      id,
      createdAt: row.created_at,
      newOrderId: recordIdToString(row.new_order),
      oldOrderIds: (row.old_orders ?? []).map(recordIdToString).filter(Boolean),
    });
  }

  const splitMap = new Map<string, {
    id: string;
    createdAt?: unknown;
    oldOrderId?: string;
    newOrderIds: string[];
  }>();
  for (const row of [...splitAsOld, ...splitAsNew]) {
    const id = recordIdToString(row.id);
    if (!id || splitMap.has(id)) {
      continue;
    }
    splitMap.set(id, {
      id,
      createdAt: row.created_at,
      oldOrderId: recordIdToString(row.old_order),
      newOrderIds: (row.new_orders ?? []).map(recordIdToString).filter(Boolean),
    });
  }

  const fiscals = fiscalRows.map(row => {
    const providerId = String(row.provider_id || "");
    return {
      id: recordIdToString(row.id),
      providerId,
      providerLabel: getFiscalProviderLabel(providerId) || providerId,
      status: String(row.status || ""),
      fiscalInvoiceNumber: row.invoice_number ?? undefined,
      qrcode: row.qrcode ?? undefined,
      code: row.code ?? undefined,
      error: row.error ?? undefined,
      selectedForPrint: row.selected_for_print,
      qrPriority: row.qr_priority,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
      requestPayload: row.request_payload,
      responsePayload: row.response_payload,
    };
  });

  const prints = printRows.map(row => ({
    id: recordIdToString(row.id),
    printType: String(row.print_type || ""),
    printedBy: personName(row.printed_by as any),
    printedAt: row.printed_at,
    isOverride: row.is_override,
    isDuplicate: row.is_duplicate,
  }));

  const tracking = trackingRows
    .filter(row => {
      const payload = row.payload ?? {};
      const payloadOrder = recordIdToString(payload.order ?? payload.orderId ?? payload.order_id);
      return !payloadOrder || payloadOrder === orderId;
    })
    .map(row => ({
      id: recordIdToString(row.id),
      module: row.module,
      page: row.page,
      userName: row.user_name,
      authMethod: row.auth_method,
      createdAt: row.created_at,
      payload: row.payload,
    }));

  const figures = getOrderSettlementFigures(order);
  const table = order.table as {name?: string; number?: string | number} | undefined;
  const floor = (order as {floor?: {name?: string}}).floor;

  const result: OrderDetailResult = {
    found: true,
    order: {
      id: orderId,
      autoId: Number.isFinite(autoId) ? autoId : undefined,
      invoiceNumber: order.invoice_number,
      split: order.split,
      status: order.status,
      createdAt: order.created_at,
      completedAt: order.completed_at,
      server: personName(order.user as any),
      cashier: personName(order.cashier as any),
      customer: personName(order.customer as any) || (order.customer as {name?: string} | undefined)?.name,
      table: table?.name || (table?.number != null ? String(table.number) : undefined),
      floor: floor?.name,
      orderType: order.order_type?.name,
      covers: order.covers,
      notes: order.notes,
      delivery: order.delivery,
      tags: order.tags,
      figures,
    },
    items,
    voids,
    discounts,
    taxes,
    payments,
    coupon,
    kitchen,
    refunds,
    mergeSplit: {
      merges: Array.from(mergeMap.values()),
      splits: Array.from(splitMap.values()),
    },
    fiscals,
    prints,
    tracking,
    timeline: [],
  };

  result.timeline = buildTimeline({
    order,
    items,
    voids,
    kitchen,
    payments,
    refunds,
    fiscals,
    prints,
    tracking,
  });

  return result;
};
