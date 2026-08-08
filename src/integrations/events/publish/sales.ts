import { Order } from '@/api/model/order.ts';
import {
  buildOrderCancelledPayload,
  buildSaleCompletedPayload,
  buildSaleRefundedPayload,
  SaleRefundedPayload,
} from '@/integrations/accounting/events/payloads.ts';
import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export const saleCompletedEventId = (orderId: string) => `SaleCompleted:${orderId}`;
export const saleRefundedEventId = (refundId: string) => `SaleRefunded:${refundId}`;
export const orderCancelledEventId = (orderId: string, voidBatchKey: string) =>
  `OrderCancelled:${orderId}:${voidBatchKey}`;

export const publishSaleCompleted = async (
  manager: ManagerLike,
  order: Order
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      const orderId = String(order.id);
      const payload = buildSaleCompletedPayload(order);
      await m.publish(
        createPosEvent(
          'SaleCompleted',
          payload,
          'pos-core',
          saleCompletedEventId(orderId)
        )
      );
    },
    'SaleCompleted'
  );
};

export const publishSaleRefunded = async (
  manager: ManagerLike,
  params: {
    order: Order;
    refundId: string;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    tipAmount: number;
    total: number;
    itemIds?: string[];
  }
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      const payload: SaleRefundedPayload = buildSaleRefundedPayload(params);
      await m.publish(
        createPosEvent(
          'SaleRefunded',
          payload,
          'pos-core',
          saleRefundedEventId(params.refundId)
        )
      );
    },
    'SaleRefunded'
  );
};

export const publishOrderCancelled = async (
  manager: ManagerLike,
  order: Order,
  voidBatchKey: string
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      const payload = buildOrderCancelledPayload(order, voidBatchKey);
      await m.publish(
        createPosEvent(
          'OrderCancelled',
          payload,
          'pos-core',
          orderCancelledEventId(String(order.id), voidBatchKey)
        )
      );
    },
    'OrderCancelled'
  );
};
