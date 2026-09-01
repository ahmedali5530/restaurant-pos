import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export type DayClosedPayload = {
  closingId: string;
  businessDate?: string;
  closedBy?: string;
  totals?: Record<string, number>;
};

export type StockCountCompletedPayload = {
  countId: string;
  locationId?: string;
  kitchenId?: string;
  lineCount?: number;
  completedBy?: string;
};

export const dayClosedEventId = (closingId: string) => `DayClosed:${closingId}`;
export const stockCountCompletedEventId = (countId: string) =>
  `StockCountCompleted:${countId}`;

export const publishDayClosed = async (
  manager: ManagerLike,
  payload: DayClosedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'DayClosed',
          payload,
          'ops-core',
          dayClosedEventId(payload.closingId)
        )
      );
    },
    'DayClosed'
  );
};

export const publishStockCountCompleted = async (
  manager: ManagerLike,
  payload: StockCountCompletedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'StockCountCompleted',
          payload,
          'inventory-core',
          stockCountCompletedEventId(payload.countId)
        )
      );
    },
    'StockCountCompleted'
  );
};
