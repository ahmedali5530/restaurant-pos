import {
  OWNER_HEARTBEAT_STALE_MS,
  PosStoreError,
  type OrderRecord,
} from './types.ts';
import { isPosStoreEffectivelyConnected } from './connectivity.ts';

export function isOwnerHeartbeatStale(
  order: Pick<OrderRecord, 'owner_heartbeat_at'>,
  now = Date.now(),
): boolean {
  const at = Date.parse(order.owner_heartbeat_at);
  if (!Number.isFinite(at)) return true;
  return now - at > OWNER_HEARTBEAT_STALE_MS;
}

/**
 * Offline-only hard lock. When effectively connected, cross-terminal mutations
 * are allowed (caller should auto-take ownership via ownerPatchFor).
 */
export function assertCashierOwner(
  order: OrderRecord,
  terminalId: string,
  options?: { allowStaleStealPrep?: boolean },
): void {
  if (isPosStoreEffectivelyConnected()) return;
  if (!order.owner_terminal_id || order.owner_terminal_id === terminalId) {
    return;
  }
  if (options?.allowStaleStealPrep && isOwnerHeartbeatStale(order)) {
    throw new PosStoreError(
      'OWNER_STALE',
      'Order ownership heartbeat expired — steal the check before editing',
    );
  }
  throw new PosStoreError(
    'NOT_OWNER',
    `Order is owned by terminal ${order.owner_terminal_id}`,
  );
}

export function canStealOrder(order: OrderRecord, terminalId: string): boolean {
  if (order.owner_terminal_id === terminalId) return false;
  return isOwnerHeartbeatStale(order);
}

/** Kitchen stage ops never require cashier ownership. */
export function isKitchenStageOperation(operationType: string): boolean {
  return operationType === 'COMPLETE_KITCHEN_STAGE';
}
