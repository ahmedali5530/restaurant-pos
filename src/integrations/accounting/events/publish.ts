import { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { Order } from '@/api/model/order.ts';
import { buildSaleCompletedPayload } from '@/integrations/accounting/events/payloads.ts';

export const saleCompletedEventId = (orderId: string) => `SaleCompleted:${orderId}`;

/**
 * Publishes a SaleCompleted business event. POS must not create journals —
 * only publish through the integration manager.
 */
export const publishSaleCompleted = async (
  manager: IntegrationManager,
  order: Order
): Promise<void> => {
  const orderId = String(order.id);
  const payload = buildSaleCompletedPayload(order);
  const event = createPosEvent(
    'SaleCompleted',
    payload,
    'pos-core',
    saleCompletedEventId(orderId)
  );
  await manager.publish(event);
};
