import type {MenuItem} from "@/api/model/cart_item.ts";
import type {Order} from "@/api/model/order.ts";
import type {OrderItem, OrderItemModifier} from "@/api/model/order_item.ts";
import type {Tax} from "@/api/model/tax.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  calculateOrderExtrasTotal,
  calculateOrderGrandTotal,
  calculateOrderTotalsPreview,
  getCartItemTaxableUnitBase,
  getOrderItemTaxableUnitBase,
} from "@/lib/cart.ts";
import {
  calculateCartItemsBaseTotal,
  calculateCartTotalsWithTaxes,
} from "@/lib/tax-calculator.ts";
import {
  getActiveOrderDiscounts,
  getOrderCartDiscountAmount,
  getOrderFilteredItems,
} from "@/lib/order.ts";
import {safeNumber, toRecordId} from "@/lib/utils.ts";

export const CUSTOMER_DISPLAY_CHANNEL = "posr-customer-display";
export const CUSTOMER_DISPLAY_STORAGE_KEY = "posr-customer-display-snapshot";
const CUSTOMER_DISPLAY_PAIR_PREFIX = "posr-customer-display-pair:";

export type CustomerDisplayModifier = {
  name: string;
  quantity: number;
  unitPrice: number;
  depth: number;
};

export type CustomerDisplayLine = {
  id: string;
  name: string;
  quantity: number;
  /** Unit base including modifiers — same base CartTotals uses for the line. */
  unitPrice: number;
  /** Net/base line total (qty × unitPrice). */
  lineTotal: number;
  modifiers: CustomerDisplayModifier[];
};

export type CustomerDisplayTaxTotal = {
  name: string;
  rate: number;
  taxAmount: number;
  /** itemsBase + taxAmount — same figure CartTotals shows per system tax. */
  total: number;
};

export type CustomerDisplayAdjustmentKind =
  | "tax"
  | "discount"
  | "coupon"
  | "service"
  | "extra"
  | "tip";

/** Order-level rows under items (tax, discount, coupon, service, extras, tip). */
export type CustomerDisplayAdjustment = {
  kind: CustomerDisplayAdjustmentKind;
  label: string;
  amount: number;
  rate?: number;
  unit?: string;
};

export type CustomerDisplaySnapshot = {
  updatedAt: number;
  lines: CustomerDisplayLine[];
  /** Cart / order items base before adjustments. */
  itemsBase: number;
  /** Legacy CartTotals multi-tax preview (cart-only). Prefer `adjustments` in UI. */
  taxTotals: CustomerDisplayTaxTotal[];
  /** Order-attached charges/credits shown between items and grand total. */
  adjustments: CustomerDisplayAdjustment[];
  /**
   * Amount highlighted as the order total for the customer.
   * Cart-only: first tax-inclusive preview or itemsBase.
   * With order / payment: calculateOrderGrandTotal (incl. coupon).
   */
  total: number;
  /** True briefly after cart clears following a paid settle. */
  thankYou?: boolean;
};

/** Live payment-modal amounts (OrderPayment) — preferred over saved order fields. */
export type CustomerDisplayPaymentLive = {
  itemsTotal: number;
  taxAmount: number;
  taxName?: string;
  taxRate?: number;
  discountTotal: number;
  discountLines?: {name: string; appliedAmount: number; appliedRate?: number; valueType?: string}[];
  couponAmount: number;
  couponLabel?: string;
  serviceChargeAmount: number;
  serviceCharge?: number;
  serviceChargeType?: string;
  tipAmount: number;
  tip?: number;
  tipType?: string;
  extras: {name: string; value: number}[];
  total: number;
};

const roundLine = (value: number): number =>
  Math.round((Number(value) || 0) * 100) / 100;

/** Flatten selectedModifiers like CartItemName, with depth for indent. */
const collectModifiers = (
  item: MenuItem,
  depth: number,
): CustomerDisplayModifier[] => {
  const out: CustomerDisplayModifier[] = [];
  for (const group of item.selectedGroups ?? []) {
    for (const modifier of group.selectedModifiers ?? []) {
      out.push({
        name: modifier.dish?.name ?? "",
        quantity: Number(modifier.quantity) || 0,
        unitPrice: roundLine(
          safeNumber(modifier.price ?? modifier.dish?.price ?? 0),
        ),
        depth,
      });
      out.push(...collectModifiers(modifier, depth + 1));
    }
  }
  return out;
};

const buildLines = (cart: MenuItem[]): CustomerDisplayLine[] =>
  cart.map((line) => {
    const unitPrice = roundLine(getCartItemTaxableUnitBase(line));
    const quantity = Number(line.quantity) || 0;
    return {
      id: String(line.id),
      name: line.dish?.name ?? "",
      quantity,
      unitPrice,
      lineTotal: roundLine(unitPrice * safeNumber(line.quantity || 1)),
      modifiers: collectModifiers(line, 0),
    };
  });

/** Order-item modifier groups (Orders → Pay Now has no live menu cart). */
const collectOrderModifiers = (
  groups: OrderItemModifier[] | undefined,
  depth: number,
): CustomerDisplayModifier[] => {
  const out: CustomerDisplayModifier[] = [];
  for (const group of groups ?? []) {
    for (const modifier of group.selectedModifiers ?? []) {
      if (!modifier) {
        continue;
      }
      out.push({
        name: modifier.dish?.name ?? "",
        quantity: Number(modifier.quantity) || 0,
        unitPrice: roundLine(
          safeNumber(modifier.price ?? modifier.dish?.price ?? 0),
        ),
        depth,
      });
      out.push(...collectOrderModifiers(modifier.selectedGroups, depth + 1));
    }
  }
  return out;
};

const buildLinesFromOrder = (order: Order): CustomerDisplayLine[] =>
  getOrderFilteredItems(order).map((item: OrderItem) => {
    const unitPrice = roundLine(getOrderItemTaxableUnitBase(item));
    const quantity = Number(item.quantity) || 0;
    return {
      id: String(item.id),
      name: item.item?.name ?? "",
      quantity,
      unitPrice,
      lineTotal: roundLine(unitPrice * safeNumber(item.quantity || 1)),
      modifiers: collectOrderModifiers(item.modifiers, 0),
    };
  });

/**
 * Prefer live cart lines.
 * Fall back to order items only while paymentLive is active (Orders → Pay Now has no cart).
 * Empty cart without paymentLive must stay empty so settle/close clears the display.
 */
const resolveLines = (
  cart: MenuItem[],
  order?: Order | null,
  allowOrderFallback = false,
): CustomerDisplayLine[] => {
  if (cart.length > 0) {
    return buildLines(cart);
  }
  if (allowOrderFallback && order) {
    return buildLinesFromOrder(order);
  }
  return [];
};

const formatDiscountLabel = (
  name: string | undefined | null,
  valueType?: string | null,
  rate?: number | null,
): string => {
  const base = (name || "").trim();
  const n = Number(rate ?? 0);
  const isPercent = valueType === "percent" || (!valueType && n > 0);
  if (valueType === "fixed_amount" && n > 0) {
    return base ? `${n} ${base}` : `${n}`;
  }
  if (isPercent && n > 0) {
    return base ? `${n}% ${base}` : `${n}%`;
  }
  return base || "Discount";
};

const buildOrderAdjustments = (
  order: Order,
  preview: ReturnType<typeof calculateOrderTotalsPreview>,
): {adjustments: CustomerDisplayAdjustment[]; total: number; itemsBase: number} => {
  const adjustments: CustomerDisplayAdjustment[] = [];
  const extrasTotal = calculateOrderExtrasTotal(order);
  const activeDiscounts = getActiveOrderDiscounts(order);
  const discountAmount =
    activeDiscounts.length > 0
      ? getOrderCartDiscountAmount(order)
      : roundLine(preview.discountAmount);
  const couponAmount = roundLine(safeNumber(order.coupon?.discount));

  if (preview.taxAmount > 0) {
    const taxName = order.tax?.name ? String(order.tax.name) : "";
    const taxRate = safeNumber(order.tax?.rate);
    adjustments.push({
      kind: "tax",
      label: taxName || "Tax",
      amount: roundLine(preview.taxAmount),
      rate: taxRate || undefined,
    });
  }

  if (activeDiscounts.length === 1) {
    const line = activeDiscounts[0];
    adjustments.push({
      kind: "discount",
      label: formatDiscountLabel(line.name, line.value_type, line.applied_rate),
      amount: roundLine(safeNumber(line.applied_amount)),
      rate: safeNumber(line.applied_rate) || undefined,
      unit: line.value_type === "percent" ? "%" : undefined,
    });
  } else if (activeDiscounts.length > 1) {
    for (const line of activeDiscounts) {
      adjustments.push({
        kind: "discount",
        label: formatDiscountLabel(line.name, line.value_type, line.applied_rate),
        amount: roundLine(safeNumber(line.applied_amount)),
        rate: safeNumber(line.applied_rate) || undefined,
        unit: line.value_type === "percent" ? "%" : undefined,
      });
    }
  } else if (discountAmount > 0 || order.discount) {
    adjustments.push({
      kind: "discount",
      label: formatDiscountLabel(
        order.discount?.name,
        order.discount?.value_type ?? order.discount?.type,
        order.discount_rate,
      ),
      amount: discountAmount,
      rate: safeNumber(order.discount_rate) || undefined,
    });
  }

  if (couponAmount > 0) {
    const couponObj = order.coupon?.coupon as any;
    const couponName =
      couponObj && typeof couponObj === "object"
        ? String(couponObj.name ?? couponObj.code ?? "")
        : "";
    adjustments.push({
      kind: "coupon",
      label: couponName || "Coupon",
      amount: couponAmount,
    });
  }

  if (order.service_charge && order.service_charge > 0) {
    const isPercent = order.service_charge_type === DiscountType.Percent;
    adjustments.push({
      kind: "service",
      label: "Service charges",
      amount: roundLine(preview.serviceChargeAmount),
      rate: safeNumber(order.service_charge) || undefined,
      unit: isPercent ? "%" : undefined,
    });
  }

  for (const extra of order.extras?.filter((item) => item != null) ?? []) {
    const value = roundLine(safeNumber(extra.value));
    if (value === 0) {
      continue;
    }
    adjustments.push({
      kind: "extra",
      label: String(extra.name ?? "Extra"),
      amount: value,
    });
  }

  if (preview.tipAmount > 0) {
    const isPercent = order.tip_type === DiscountType.Percent;
    adjustments.push({
      kind: "tip",
      label: isPercent ? "Tip %" : "Tip",
      amount: roundLine(preview.tipAmount),
      rate: isPercent ? safeNumber(order.tip) || undefined : undefined,
      unit: isPercent ? "%" : undefined,
    });
  }

  const total = roundLine(
    calculateOrderGrandTotal({
      itemsTotal: preview.itemsTotal,
      extrasTotal,
      taxAmount: preview.taxAmount,
      discountAmount,
      serviceChargeAmount: preview.serviceChargeAmount,
      couponAmount,
      tipAmount: preview.tipAmount,
    }),
  );

  return {adjustments, total, itemsBase: roundLine(preview.itemsTotal)};
};

const buildPaymentAdjustments = (
  live: CustomerDisplayPaymentLive,
): CustomerDisplayAdjustment[] => {
  const adjustments: CustomerDisplayAdjustment[] = [];

  if (live.taxAmount > 0) {
    adjustments.push({
      kind: "tax",
      label: live.taxName || "Tax",
      amount: roundLine(live.taxAmount),
      rate: live.taxRate,
    });
  }

  const discountLines = live.discountLines?.filter((l) => l.appliedAmount > 0) ?? [];
  if (discountLines.length > 0) {
    for (const line of discountLines) {
      adjustments.push({
        kind: "discount",
        label: formatDiscountLabel(line.name, line.valueType, line.appliedRate),
        amount: roundLine(line.appliedAmount),
        rate: line.appliedRate,
        unit: line.valueType === "percent" ? "%" : undefined,
      });
    }
  } else if (live.discountTotal > 0) {
    adjustments.push({
      kind: "discount",
      label: "Discount",
      amount: roundLine(live.discountTotal),
    });
  }

  if (live.couponAmount > 0) {
    adjustments.push({
      kind: "coupon",
      label: live.couponLabel || "Coupon",
      amount: roundLine(live.couponAmount),
    });
  }

  if (live.serviceChargeAmount > 0) {
    const isPercent = live.serviceChargeType === DiscountType.Percent;
    adjustments.push({
      kind: "service",
      label: "Service charges",
      amount: roundLine(live.serviceChargeAmount),
      rate: live.serviceCharge,
      unit: isPercent ? "%" : undefined,
    });
  }

  for (const extra of live.extras) {
    const value = roundLine(safeNumber(extra.value));
    if (value === 0) {
      continue;
    }
    adjustments.push({
      kind: "extra",
      label: extra.name,
      amount: value,
    });
  }

  if (live.tipAmount > 0) {
    const isPercent = live.tipType === DiscountType.Percent;
    adjustments.push({
      kind: "tip",
      label: isPercent ? "Tip %" : "Tip",
      amount: roundLine(live.tipAmount),
      rate: isPercent ? live.tip : undefined,
      unit: isPercent ? "%" : undefined,
    });
  }

  return adjustments;
};

export const buildCustomerDisplaySnapshot = (
  cart: MenuItem[] | null | undefined,
  options?: {
    thankYou?: boolean;
    taxes?: Tax[] | null;
    order?: Order | null;
    paymentLive?: CustomerDisplayPaymentLive | null;
  },
): CustomerDisplaySnapshot => {
  const live = (cart ?? []).filter((line) => !line.deleted_at);
  const lines = resolveLines(live, options?.order, !!options?.paymentLive);

  if (options?.paymentLive) {
    const livePay = options.paymentLive;
    return {
      updatedAt: Date.now(),
      lines,
      itemsBase: roundLine(livePay.itemsTotal),
      taxTotals: [],
      adjustments: buildPaymentAdjustments(livePay),
      total: roundLine(livePay.total),
      thankYou: options?.thankYou === true,
    };
  }

  // Open check with live cart: show order-attached adjustments.
  // Empty cart: never keep order lines (settle/close must clear).
  if (options?.order && live.length > 0) {
    const preview = calculateOrderTotalsPreview(options.order, live);
    const {adjustments, total, itemsBase} = buildOrderAdjustments(options.order, preview);
    return {
      updatedAt: Date.now(),
      lines,
      itemsBase,
      taxTotals: [],
      adjustments,
      total,
      thankYou: options?.thankYou === true,
    };
  }

  const itemsBase = calculateCartItemsBaseTotal(live);
  const taxPreview = calculateCartTotalsWithTaxes(live, options?.taxes ?? []);
  const taxTotals: CustomerDisplayTaxTotal[] = taxPreview.map(({tax, taxAmount, total}) => ({
    name: String(tax.name ?? ""),
    rate: safeNumber(tax.rate),
    taxAmount,
    total,
  }));
  const adjustments: CustomerDisplayAdjustment[] = taxPreview.map(({tax, taxAmount}) => ({
    kind: "tax" as const,
    label: String(tax.name ?? "Tax"),
    amount: roundLine(taxAmount),
    rate: safeNumber(tax.rate) || undefined,
  }));

  return {
    updatedAt: Date.now(),
    lines,
    itemsBase,
    taxTotals,
    adjustments,
    total: taxTotals.length > 0 ? taxTotals[0].total : itemsBase,
    thankYou: options?.thankYou === true,
  };
};

export const publishCustomerDisplaySnapshot = (
  snapshot: CustomerDisplaySnapshot,
): void => {
  try {
    localStorage.setItem(CUSTOMER_DISPLAY_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // private mode / quota — channel alone may still work
  }
  try {
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channel.postMessage(snapshot);
    channel.close();
  } catch {
    // BroadcastChannel unsupported
  }
};

/** While OrderPayment is open, cart publisher must not overwrite live totals. */
let paymentLiveLocks = 0;
const paymentLockListeners = new Set<() => void>();

export const subscribeCustomerDisplayPaymentLock = (
  listener: () => void,
): (() => void) => {
  paymentLockListeners.add(listener);
  return () => {
    paymentLockListeners.delete(listener);
  };
};

const notifyPaymentLockReleased = () => {
  if (paymentLiveLocks > 0) {
    return;
  }
  for (const listener of paymentLockListeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
};

export const acquireCustomerDisplayPaymentLock = (): (() => void) => {
  paymentLiveLocks += 1;
  return () => {
    paymentLiveLocks = Math.max(0, paymentLiveLocks - 1);
    notifyPaymentLockReleased();
  };
};

export const isCustomerDisplayPaymentLocked = (): boolean => paymentLiveLocks > 0;

/** Empty snapshot for idle / thank-you after payment close or settle. */
export const buildCustomerDisplayIdleSnapshot = (
  options?: {thankYou?: boolean},
): CustomerDisplaySnapshot => ({
  updatedAt: Date.now(),
  lines: [],
  itemsBase: 0,
  taxTotals: [],
  adjustments: [],
  total: 0,
  thankYou: options?.thankYou === true,
});

export const publishCustomerDisplayIdle = (options?: {thankYou?: boolean}): CustomerDisplaySnapshot => {
  const snapshot = buildCustomerDisplayIdleSnapshot(options);
  publishCustomerDisplaySnapshot(snapshot);
  return snapshot;
};

export const customerDisplayRecordId = (terminalId: string) =>
  toRecordId(`${Tables.customer_display}:${terminalId}`);

/** Stable pairing secret for public gateway polling (per terminal, localStorage). */
export const getOrCreateCustomerDisplayPairToken = (terminalId: string): string => {
  if (!terminalId || typeof localStorage === "undefined") {
    return "";
  }
  const key = `${CUSTOMER_DISPLAY_PAIR_PREFIX}${terminalId}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[A-Za-z0-9_-]+$/.test(existing)) {
      return existing;
    }
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(key, token);
    return token;
  } catch {
    return "";
  }
};

export const customerDisplayPublicPath = (terminalId: string, pairToken: string): string => {
  const q = new URLSearchParams();
  q.set("terminal", terminalId);
  if (pairToken) {
    q.set("pair", pairToken);
  }
  return `/customer-display?${q.toString()}`;
};

type UpsertClient = {
  upsert: (thing: any, data: any) => Promise<unknown>;
};

/** Fire-and-forget Surreal UPSERT for Tauri ↔ browser pairing. */
export const upsertCustomerDisplayToSurreal = async (
  db: UpsertClient,
  snapshot: CustomerDisplaySnapshot,
  terminalId: string,
  pairToken?: string,
): Promise<void> => {
  if (!terminalId) {
    return;
  }
  const pair = pairToken || getOrCreateCustomerDisplayPairToken(terminalId);
  try {
    await db.upsert(customerDisplayRecordId(terminalId), {
      ...snapshot,
      terminal_id: terminalId,
      pair_token: pair || undefined,
      updated_at: snapshot.updatedAt,
    });
  } catch {
    // offline / not ready — local channel still works same-browser
  }
};

const normalizeAdjustments = (raw: unknown): CustomerDisplayAdjustment[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((row) => row && typeof row === "object")
    .map((row: any) => ({
      kind: (row.kind ?? "extra") as CustomerDisplayAdjustmentKind,
      label: String(row.label ?? ""),
      amount: Number(row.amount) || 0,
      rate: typeof row.rate === "number" ? row.rate : undefined,
      unit: typeof row.unit === "string" ? row.unit : undefined,
    }));
};

/** Normalize a Surreal customer_display row into a snapshot. */
export const snapshotFromCustomerDisplayRecord = (
  record: any,
): CustomerDisplaySnapshot | null => {
  if (!record || typeof record !== "object" || !Array.isArray(record.lines)) {
    return null;
  }
  const lines: CustomerDisplayLine[] = record.lines.map((line: any) => ({
    id: String(line?.id ?? ""),
    name: String(line?.name ?? ""),
    quantity: Number(line?.quantity) || 0,
    unitPrice: Number(line?.unitPrice) || 0,
    lineTotal: Number(line?.lineTotal) || 0,
    modifiers: Array.isArray(line?.modifiers)
      ? line.modifiers.map((mod: any) => ({
          name: String(mod?.name ?? ""),
          quantity: Number(mod?.quantity) || 0,
          unitPrice: Number(mod?.unitPrice) || 0,
          depth: Number(mod?.depth) || 0,
        }))
      : [],
  }));
  const taxTotals = Array.isArray(record.taxTotals) ? record.taxTotals : [];
  let adjustments = normalizeAdjustments(record.adjustments);
  // Back-compat: older records only had taxTotals
  if (adjustments.length === 0 && taxTotals.length > 0) {
    adjustments = taxTotals.map((entry: any) => ({
      kind: "tax" as const,
      label: String(entry?.name ?? "Tax"),
      amount: Number(entry?.taxAmount) || 0,
      rate: Number(entry?.rate) || undefined,
    }));
  }
  return {
    updatedAt: Number(record.updatedAt ?? record.updated_at) || 0,
    lines,
    itemsBase:
      typeof record.itemsBase === "number"
        ? record.itemsBase
        : Number(record.total) || 0,
    taxTotals,
    adjustments,
    total: Number(record.total) || 0,
    thankYou: record.thankYou === true,
  };
};

export const readCustomerDisplaySnapshot = (): CustomerDisplaySnapshot | null => {
  try {
    const raw = localStorage.getItem(CUSTOMER_DISPLAY_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CustomerDisplaySnapshot;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.lines)) {
      return null;
    }
    if (!Array.isArray(parsed.taxTotals)) {
      parsed.taxTotals = [];
    }
    if (typeof parsed.itemsBase !== "number") {
      parsed.itemsBase = Number(parsed.total) || 0;
    }
    parsed.lines = parsed.lines.map((line) => ({
      ...line,
      unitPrice: typeof line.unitPrice === "number" ? line.unitPrice : 0,
      modifiers: Array.isArray(line.modifiers) ? line.modifiers : [],
    }));
    parsed.adjustments = normalizeAdjustments(parsed.adjustments);
    if (parsed.adjustments.length === 0 && parsed.taxTotals.length > 0) {
      parsed.adjustments = parsed.taxTotals.map((entry) => ({
        kind: "tax" as const,
        label: entry.name || "Tax",
        amount: Number(entry.taxAmount) || 0,
        rate: entry.rate,
      }));
    }
    return parsed;
  } catch {
    return null;
  }
};

/** Poll gateway public snapshot (no Surreal session required). */
export const fetchCustomerDisplayPublicSnapshot = async (
  _gatewayBaseUrl: string,
  terminalId: string,
  pairToken: string,
): Promise<CustomerDisplaySnapshot | null> => {
  if (!terminalId || !pairToken) {
    return null;
  }
  // Same-origin (vite/nginx proxies /customer-display-api → gateway).
  const url =
    `/customer-display-api/public/${encodeURIComponent(terminalId)}` +
    `?pair=${encodeURIComponent(pairToken)}`;
  const res = await fetch(url, {headers: {Accept: "application/json"}});
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`customer-display public fetch failed: ${res.status}`);
  }
  const json = (await res.json()) as {ok?: boolean; snapshot?: any};
  if (!json?.ok || !json.snapshot) {
    return null;
  }
  return snapshotFromCustomerDisplayRecord(json.snapshot);
};

export type CustomerDisplayPublicMediaSettings = {
  enabled: boolean;
  rotationIntervalSec: number;
  items: Array<{
    id: string;
    name: string;
    mimeType: string;
    documentId: string;
    sort: number;
  }>;
};

/** Idle ad playlist via gateway (pair-gated; no Surreal session). */
export const fetchCustomerDisplayPublicMediaSettings = async (
  terminalId: string,
  pairToken: string,
): Promise<CustomerDisplayPublicMediaSettings | null> => {
  if (!terminalId || !pairToken) {
    return null;
  }
  const url =
    `/customer-display-api/public/${encodeURIComponent(terminalId)}/media` +
    `?pair=${encodeURIComponent(pairToken)}`;
  const res = await fetch(url, {headers: {Accept: "application/json"}});
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`customer-display public media failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    ok?: boolean;
    settings?: CustomerDisplayPublicMediaSettings;
  };
  if (!json?.ok || !json.settings) {
    return null;
  }
  return json.settings;
};

/** Absolute URL for one idle-ad document (pair-gated). */
export const customerDisplayPublicMediaFileUrl = (
  terminalId: string,
  pairToken: string,
  documentId: string,
): string =>
  `/customer-display-api/public/${encodeURIComponent(terminalId)}/media/file` +
  `?pair=${encodeURIComponent(pairToken)}` +
  `&id=${encodeURIComponent(documentId)}`;
