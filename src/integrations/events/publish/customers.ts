import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export type CustomerCreatedPayload = {
  customerId: string;
  name?: string;
  phone?: string;
  email?: string;
};

export const customerCreatedEventId = (customerId: string) =>
  `CustomerCreated:${customerId}`;

export const publishCustomerCreated = async (
  manager: ManagerLike,
  payload: CustomerCreatedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'CustomerCreated',
          payload,
          'pos-core',
          customerCreatedEventId(payload.customerId)
        )
      );
    },
    'CustomerCreated'
  );
};
