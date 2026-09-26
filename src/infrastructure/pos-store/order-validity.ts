import type { OrderRecord } from './types.ts';

/** Statuses shown on floor / orders as live operational checks. */
export const OPEN_OPERATIONAL_STATUSES = new Set(['In Progress', 'Pending']);

function hasFiniteInvoice(value: unknown): boolean {
  return value != null && Number.isFinite(Number(value));
}

function looksLikeRealCheck(order: Partial<OrderRecord>): boolean {
  if (hasFiniteInvoice(order.invoice_number)) return true;
  if (order.owner_terminal_id) return true;
  if (Array.isArray(order.items) && order.items.length > 0) return true;
  return false;
}

/**
 * Open checks without any header (invoice, type, owner, items) are sync/import
 * shells. Local creates may wait for a gateway-assigned invoice and are not ghosts.
 */
export function isGhostOperationalOrder(
  order: Pick<OrderRecord, 'status' | 'invoice_number'> & Partial<OrderRecord>,
): boolean {
  const status = String(order.status ?? '');
  if (!OPEN_OPERATIONAL_STATUSES.has(status)) {
    return false;
  }
  return !looksLikeRealCheck(order);
}

/** Whether a brand-new Dexie row may be created from this patch (no existing row). */
export function shouldMaterializeNewOrder(
  patch: Partial<OrderRecord>,
): boolean {
  const status = String(patch.status ?? 'In Progress');
  if (!OPEN_OPERATIONAL_STATUSES.has(status)) {
    return true;
  }
  return looksLikeRealCheck(patch);
}

const CLOSED_STATUSES = new Set([
  'Paid',
  'Cancelled',
  'Merged',
  'Spilt',
  'Refunded',
]);

/** Merge sparse remote patches must not wipe authoritative header fields. */
export function preserveOrderHeaderOnMerge(
  existing: OrderRecord | undefined,
  patch: Partial<OrderRecord>,
): Partial<OrderRecord> {
  if (!existing) {
    return patch;
  }
  const next = { ...patch };
  if (existing.invoice_number != null && next.invoice_number == null) {
    next.invoice_number = existing.invoice_number;
  }
  if (existing.invoice_display && !next.invoice_display) {
    next.invoice_display = existing.invoice_display;
  }
  if (existing.invoice_prefix && !next.invoice_prefix) {
    next.invoice_prefix = existing.invoice_prefix;
  }
  if (existing.local_invoice_code && !next.local_invoice_code) {
    next.local_invoice_code = existing.local_invoice_code;
  }
  if (existing.auto_id != null && next.auto_id == null) {
    next.auto_id = existing.auto_id;
  }
  if (existing.user && !next.user) {
    next.user = existing.user;
  }
  if (existing.order_type && !next.order_type) {
    next.order_type = existing.order_type;
  }
  if (existing.cashier && !next.cashier) {
    next.cashier = existing.cashier;
  }
  const existingStatus = String(existing.status ?? '');
  const patchStatus = next.status != null ? String(next.status) : null;
  if (
    CLOSED_STATUSES.has(existingStatus)
    && (!patchStatus || OPEN_OPERATIONAL_STATUSES.has(patchStatus))
  ) {
    next.status = existing.status;
  }
  return next;
}
