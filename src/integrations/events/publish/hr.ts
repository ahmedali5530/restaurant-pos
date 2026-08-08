import { PayrollPostedPayload } from '@/integrations/accounting/events/payloads.ts';
import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export const payrollPostedEventId = (runId: string) => `PayrollPosted:${runId}`;

export const publishPayrollPosted = async (
  manager: ManagerLike,
  payload: PayrollPostedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'PayrollPosted',
          payload,
          'hr-core',
          payrollPostedEventId(payload.payrollRunId)
        )
      );
    },
    'PayrollPosted'
  );
};
