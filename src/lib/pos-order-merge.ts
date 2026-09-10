/**
 * Merge PosStore (local-first) orders with remote Surreal FETCH rows.
 * Local is authoritative for items, ownership, status and — since the child
 * tables are mirrored in Dexie — for payments, taxes, discounts, extras, coupon
 * and customer too. Remote only fills a relation when the local copy is still a
 * bare id stub (order imported before its children synced) or empty.
 */

const REMOTE_ONLY_RELATIONS = [
  'customer',
  'order_taxes',
  'order_discounts',
  'extras',
  'payments',
  'coupon',
  'discount',
] as const;

/** True when a relation entry is only a record id (string or `{ id }` stub). */
const isRelationStubEntry = (entry: unknown): boolean => {
  if (entry == null) return true;
  if (typeof entry === 'string') return true;
  if (typeof entry === 'object') {
    const keys = Object.keys(entry as object);
    return keys.length === 0 || keys.every((key) => key === 'id');
  }
  return false;
};

/**
 * Remote-only relations in PosStore are often [] or bare id arrays from sync.
 * Those must lose to Surreal FETCH objects (payments, taxes, discounts, …).
 */
const isStubOrEmpty = (value: unknown) => {
  if (value == null) return true;
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isRelationStubEntry);
  }
  if (typeof value === 'object') {
    return Object.keys(value as object).every((key) => key === 'id');
  }
  return typeof value === 'string';
};

/** True when `items` are hydrated line objects (not bare record-id strings). */
export function hasHydratedOrderItems(order: { items?: unknown } | null | undefined): boolean {
  return (
    Array.isArray(order?.items)
    && order!.items!.some(
      (line) =>
        line != null
        && typeof line === 'object'
        && ('price' in (line as object) || 'item' in (line as object) || 'quantity' in (line as object)),
    )
  );
}

/**
 * Local PosStore order is authoritative; remote only fills relation stubs.
 * Closed statuses from Surreal win when local still looks open (cancel/pay
 * that hit Surreal before PosStore was updated).
 */
export function mergeRemoteRelations(local: any, remote: any) {
  const merged: any = { ...remote, ...local };
  for (const key of REMOTE_ONLY_RELATIONS) {
    if (isStubOrEmpty(local?.[key]) && !isStubOrEmpty(remote?.[key])) {
      merged[key] = remote[key];
    }
  }
  const remoteStatus = remote?.status != null ? String(remote.status) : '';
  const localStatus = local?.status != null ? String(local.status) : '';
  if (
    remoteStatus
    && remoteStatus !== localStatus
    && ['Cancelled', 'Paid', 'Merged', 'Refunded', 'Spilt'].includes(remoteStatus)
  ) {
    merged.status = remote.status;
    if (Array.isArray(remote.tags)) merged.tags = remote.tags;
  }
  if (hasHydratedOrderItems(local)) {
    merged.items = mergeOrderItems(local.items, remote?.items);
  }
  return merged;
}

/**
 * Prefer PosStore line state (deleted_at / qty) while keeping remote FETCH
 * enrichment for dish names when the local row is thinner.
 */
export function mergeOrderItems(localItems: any[], remoteItems: any[]): any[] {
  if (!Array.isArray(localItems) || localItems.length === 0) {
    return Array.isArray(remoteItems) ? remoteItems : [];
  }
  if (!Array.isArray(remoteItems) || remoteItems.length === 0) {
    return localItems;
  }
  const remoteById = new Map(
    remoteItems
      .filter((row) => row != null && typeof row === 'object')
      .map((row) => [String(row.id), row]),
  );
  return localItems.map((local) => {
    if (local == null || typeof local !== 'object') return local;
    const remote = remoteById.get(String(local.id));
    if (!remote) return local;
    return {
      ...remote,
      ...local,
      // Keep FETCH-shaped dish when local only has a string/stub id.
      item:
        local.item && typeof local.item === 'object' && local.item.name != null
          ? local.item
          : remote.item ?? local.item,
      taxes: Array.isArray(local.taxes) && local.taxes.length > 0 ? local.taxes : remote.taxes,
      deleted_at: local.deleted_at ?? remote.deleted_at,
      quantity: local.quantity ?? remote.quantity,
    };
  });
}

/**
 * After Surreal card FETCH: keep local hydrated items when present so stale
 * remote rows cannot overwrite the terminal's PosStore state.
 */
export function mergeOrderCardSnapshot(snapshot: any, remoteCard: any) {
  if (!remoteCard) return snapshot;
  if (!hasHydratedOrderItems(snapshot)) return remoteCard;
  const merged = mergeRemoteRelations(snapshot, remoteCard);
  merged.items = mergeOrderItems(snapshot.items, remoteCard.items);
  return merged;
}
