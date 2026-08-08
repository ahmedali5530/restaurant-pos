import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export type PaymentCompletedPayload = {
  paymentId: string;
  orderId: string;
  amount: number;
  paymentTypeId?: string;
  paymentTypeName?: string;
  tipAmount?: number;
  currency?: string;
  completedAt?: string;
};

export type InvoiceCreatedPayload = {
  orderId: string;
  invoiceNumber?: number | string;
  total?: number;
  totalCollected?: number;
  taxAmount?: number;
  customerId?: string;
  completedAt?: string;
};

export const paymentCompletedEventId = (paymentId: string) =>
  `PaymentCompleted:${paymentId}`;
export const invoiceCreatedEventId = (orderId: string) => `InvoiceCreated:${orderId}`;

export const publishPaymentCompleted = async (
  manager: ManagerLike,
  payload: PaymentCompletedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'PaymentCompleted',
          payload,
          'pos-core',
          paymentCompletedEventId(payload.paymentId)
        )
      );
    },
    'PaymentCompleted'
  );
};

export const publishInvoiceCreated = async (
  manager: ManagerLike,
  payload: InvoiceCreatedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'InvoiceCreated',
          payload,
          'pos-core',
          invoiceCreatedEventId(payload.orderId)
        )
      );
    },
    'InvoiceCreated'
  );
};
