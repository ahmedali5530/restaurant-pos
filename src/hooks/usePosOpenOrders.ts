import { useCallback, useEffect, useRef, useState } from 'react';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import type { HydratedOrder } from '@/infrastructure/pos-store/catalog.ts';
import type { OrderRecord } from '@/infrastructure/pos-store/types.ts';
import { ensureTerminalIdentity } from '@/infrastructure/pos-store/identity.ts';

export type { HydratedOrder };

const OPEN_ORDERS_REFRESH_DEBOUNCE_MS = 150;

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
    setLoading(true);
    try {
      const [list, identity] = await Promise.all([
        posStore.getOpenOrdersHydrated(),
        ensureTerminalIdentity(),
      ]);
      setOrders(list);
      setTerminalId(identity.terminalId);
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
