import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Order } from '@/api/model/order.ts';
import { getInvoiceNumber } from '@/lib/order.ts';
import {
  cancelOrderReadySpeech,
  speakOrderReady,
} from '@/lib/order-ready-announcement.ts';

interface CelebrationItem {
  id: string;
  orderNumber: string;
}

export const useOrderReadyAnnouncements = (readyOrders: Order[]) => {
  const { t, i18n } = useTranslation('order-display');
  const knownReadyIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationItem[]>([]);
  const [activeCelebration, setActiveCelebration] = useState<CelebrationItem | null>(null);
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(readyOrders.map((order) => order.id.toString()));

    if (!initializedRef.current) {
      initializedRef.current = true;
      knownReadyIdsRef.current = currentIds;
      return;
    }

    const newlyReady = readyOrders.filter(
      (order) => !knownReadyIdsRef.current.has(order.id.toString())
    );
    knownReadyIdsRef.current = currentIds;

    if (newlyReady.length === 0) {
      return;
    }

    const celebrations = newlyReady.map((order) => {
      const orderNumber = getInvoiceNumber(order);
      speakOrderReady(
        t('orderReadyAnnouncement', { number: orderNumber }),
        i18n.language
      );

      return {
        id: order.id.toString(),
        orderNumber,
      };
    });

    setCelebrationQueue((prev) => [...prev, ...celebrations]);
    setHighlightedOrderIds((prev) => {
      const next = new Set(prev);
      celebrations.forEach((item) => next.add(item.id));
      return next;
    });
  }, [readyOrders, t, i18n.language]);

  useEffect(() => {
    if (activeCelebration || celebrationQueue.length === 0) {
      return;
    }

    const [next, ...rest] = celebrationQueue;
    setActiveCelebration(next);
    setCelebrationQueue(rest);
  }, [activeCelebration, celebrationQueue]);

  useEffect(() => () => cancelOrderReadySpeech(), []);

  const completeCelebration = () => {
    if (!activeCelebration) {
      return;
    }

    const completedId = activeCelebration.id;
    setActiveCelebration(null);

    window.setTimeout(() => {
      setHighlightedOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(completedId);
        return next;
      });
    }, 1200);
  };

  return {
    activeCelebration,
    completeCelebration,
    highlightedOrderIds,
  };
};
