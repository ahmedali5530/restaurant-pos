import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KitchenOrder } from '@/api/model/kitchen.ts';
import { getInvoiceNumber } from '@/lib/order.ts';
import {
  cancelOrderReadySpeech,
  speakOrderReady,
} from '@/lib/order-ready-announcement.ts';

const HIGHLIGHT_MS = 18_000;

type ItemSnapshot = {
  id: string
  deleted: boolean
  name: string
  orderNumber: string
  context: string
  batchKey: string
  isAddonBatch: boolean
};

type BatchSnapshot = {
  batchKey: string
  isAddon: boolean
  orderNumber: string
  context: string
};

const orderContext = (group: KitchenOrder) => {
  const orderNumber = group.order ? getInvoiceNumber(group.order) : '-';
  const table = group.order?.table;
  const tableLabel = table
    ? `${table.name ?? ''}${table.number ?? ''}`.trim()
    : '';
  const context = tableLabel || group.order?.order_type?.name || orderNumber;
  return { orderNumber, context };
};

const snapshotFromOrders = (orders: KitchenOrder[]) => {
  const batches = new Map<string, BatchSnapshot>();
  const items = new Map<string, ItemSnapshot>();

  for (const group of orders) {
    const { orderNumber, context } = orderContext(group);

    for (const batch of group.batches) {
      const isAddon = batch.items.some((item) => item.order_item?.is_addition);
      batches.set(batch.batchKey, {
        batchKey: batch.batchKey,
        isAddon,
        orderNumber,
        context,
      });

      for (const stage of batch.items) {
        const id = stage.id?.toString();
        if (!id) {
          continue;
        }
        const orderItem = stage.order_item;
        items.set(id, {
          id,
          deleted: Boolean(orderItem?.deleted_at),
          name: orderItem?.item?.name ?? '',
          orderNumber,
          context,
          batchKey: batch.batchKey,
          isAddonBatch: isAddon,
        });
      }
    }
  }

  return { batches, items };
};

export const useKitchenOrderAnnouncements = (
  orders: KitchenOrder[],
  kitchenId?: string,
  /** True after the first load for the current kitchen has finished. */
  hydrated = false
) => {
  const { t, i18n } = useTranslation('kitchen');
  const knownBatchesRef = useRef<Map<string, BatchSnapshot>>(new Map());
  const knownItemsRef = useRef<Map<string, ItemSnapshot>>(new Map());
  const initializedRef = useRef(false);
  const kitchenIdRef = useRef<string | undefined>(undefined);
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [highlightedBatchKeys, setHighlightedBatchKeys] = useState<Set<string>>(new Set());

  const speak = (text: string) => {
    speakOrderReady(text, i18n.language);
  };

  const highlightBatch = (batchKey: string) => {
    setHighlightedBatchKeys((prev) => {
      const next = new Set(prev);
      next.add(batchKey);
      return next;
    });

    const existingTimer = highlightTimersRef.current.get(batchKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      setHighlightedBatchKeys((prev) => {
        const next = new Set(prev);
        next.delete(batchKey);
        return next;
      });
      highlightTimersRef.current.delete(batchKey);
    }, HIGHLIGHT_MS);

    highlightTimersRef.current.set(batchKey, timer);
  };

  useEffect(() => {
    const currentKitchenId = kitchenId?.toString();
    if (kitchenIdRef.current !== currentKitchenId) {
      kitchenIdRef.current = currentKitchenId;
      initializedRef.current = false;
      knownBatchesRef.current = new Map();
      knownItemsRef.current = new Map();
      for (const timer of highlightTimersRef.current.values()) {
        clearTimeout(timer);
      }
      highlightTimersRef.current.clear();
      setHighlightedBatchKeys(new Set());
    }

    if (!currentKitchenId || !hydrated) {
      return;
    }

    const { batches, items } = snapshotFromOrders(orders);

    if (!initializedRef.current) {
      initializedRef.current = true;
      knownBatchesRef.current = batches;
      knownItemsRef.current = items;
      return;
    }

    const prevBatches = knownBatchesRef.current;
    const prevItems = knownItemsRef.current;

    // New batches (order / addon fires).
    for (const [batchKey, batch] of batches) {
      if (prevBatches.has(batchKey)) {
        continue;
      }

      speak(
        batch.isAddon
          ? t('announcements.addon', {
              context: batch.context,
              number: batch.orderNumber,
            })
          : t('announcements.newOrder', {
              context: batch.context,
              number: batch.orderNumber,
            })
      );
      highlightBatch(batchKey);
    }

    // Item voids / cancellations while the line is still on the board.
    for (const [itemId, item] of items) {
      const prev = prevItems.get(itemId);
      if (!prev) {
        // New line on an already-known batch (treat as addon path if batch also new: batch already spoken).
        if (prevBatches.has(item.batchKey) && !item.deleted) {
          speak(
            t('announcements.itemAdded', {
              item: item.name || t('announcements.itemFallback'),
              context: item.context,
              number: item.orderNumber,
            })
          );
          highlightBatch(item.batchKey);
        }
        continue;
      }

      if (!prev.deleted && item.deleted) {
        speak(
          t('announcements.itemRemoved', {
            item: item.name || t('announcements.itemFallback'),
            context: item.context,
            number: item.orderNumber,
          })
        );
        highlightBatch(item.batchKey);
      }
    }

    // Item fully removed from the board with deleted flag (rare path).
    for (const [itemId, prev] of prevItems) {
      if (items.has(itemId)) {
        continue;
      }
      // Completed stages drop off without void — do not announce as deletion
      // unless the last known state was deleted, or the dish name suggests void.
      // Only announce when the previous snapshot already had deleted_at.
      if (prev.deleted) {
        // Already announced when deleted_at flipped.
        continue;
      }
    }

    knownBatchesRef.current = batches;
    knownItemsRef.current = items;
  }, [orders, kitchenId, hydrated, t, i18n.language]);

  useEffect(() => {
    return () => {
      cancelOrderReadySpeech();
      for (const timer of highlightTimersRef.current.values()) {
        clearTimeout(timer);
      }
      highlightTimersRef.current.clear();
    };
  }, []);

  return {
    highlightedBatchKeys,
  };
};
