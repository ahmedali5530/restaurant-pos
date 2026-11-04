import { useCallback, useEffect, useRef, useState } from 'react';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import type { HydratedOrder } from '@/infrastructure/pos-store/catalog.ts';
import type { OrderRecord } from '@/infrastructure/pos-store/types.ts';
import { ensureTerminalIdentity } from '@/infrastructure/pos-store/identity.ts';

export type { HydratedOrder };

const OPEN_ORDERS_REFRESH_DEBOUNCE_MS = 150;

function orderFingerprint(list: HydratedOrder[]): string {
  let hash = 5381;
  for (const order of list) {
    const items = Array.isArray(order.items) ? order.items : [];
    const piece = [
      order.id,
      order.status,
      order.updated_at ?? '',
      items.length,
      order.payments?.length ?? 0,
      items.map((item: any) =>
        `${item?.id}:${item?.quantity}:${item?.price}:${item?.deleted_at ?? ''}`,
      ).join(','),
    ].join('|');
    for (let i = 0; i < piece.length; i += 1) {
      hash = ((hash << 5) + hash) ^ piece.charCodeAt(i);
    }
  }
  return `${list.length}:${hash >>> 0}`;
}

/**
 * Open orders from PosStore — same path online and offline. Orders are
 * hydrated into the FETCH shape the floor/order screens expect.
 */
export function usePosOpenOrders() {
  const [orders, setOrders] = useState<HydratedOrder[]>([]);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, identity] = await Promise.all([
        posStore.getOpenOrdersHydrated(),
        ensureTerminalIdentity(),
      ]);
      const nextKey = orderFingerprint(list);
      setOrders((prev) => (orderFingerprint(prev) === nextKey ? prev : list));
      setTerminalId((prev) => (prev === identity.terminalId ? prev : identity.terminalId));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onWrite = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void refresh();
      }, OPEN_ORDERS_REFRESH_DEBOUNCE_MS);
    };
    window.addEventListener('posr-posstore-write', onWrite);
    window.addEventListener('posr-operational-orders-updated', onWrite);
    const id = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.removeEventListener('posr-posstore-write', onWrite);
      window.removeEventListener('posr-operational-orders-updated', onWrite);
      window.clearInterval(id);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  return { orders, terminalId, loading, refresh };
}

export function isOrderOwnedByThisTerminal(
  order: Pick<OrderRecord, 'owner_terminal_id'>,
  terminalId: string | null,
): boolean {
  if (!terminalId) return false;
  return order.owner_terminal_id === terminalId;
}
