import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export const publishApplicationStarted = async (
  manager: ManagerLike
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'ApplicationStarted',
          { at: new Date().toISOString() },
          'integration-framework',
          `ApplicationStarted:${Date.now()}`
        )
      );
    },
    'ApplicationStarted'
  );
};

export const publishApplicationShutdown = async (
  manager: ManagerLike
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'ApplicationShutdown',
          { at: new Date().toISOString() },
          'integration-framework',
          `ApplicationShutdown:${Date.now()}`
        )
      );
    },
    'ApplicationShutdown'
  );
};
