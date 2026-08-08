import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export type OrderCreatedPayload = {
  orderId: string;
  invoiceNumber?: number | string;
  orderTypeId?: string;
  tableId?: string;
  customerId?: string;
  itemCount?: number;
  total?: number;
  createdBy?: string;
};

export const orderCreatedEventId = (orderId: string) => `OrderCreated:${orderId}`;

export const publishOrderCreated = async (
  manager: ManagerLike,
  payload: OrderCreatedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'OrderCreated',
          payload,
          'pos-core',
          orderCreatedEventId(payload.orderId)
        )
      );
    },
    'OrderCreated'
  );
};
