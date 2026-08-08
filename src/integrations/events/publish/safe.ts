import type { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import { getIntegrationEventManager } from '@/integrations/events/runtime.ts';

export type ManagerLike = IntegrationManager | null | undefined;

export const resolveIntegrationManager = (
  manager?: ManagerLike
): IntegrationManager | null => manager ?? getIntegrationEventManager();

/**
 * Never throw into domain save/checkout paths.
 */
export const safePublish = async (
  manager: ManagerLike,
  publishFn: (manager: IntegrationManager) => Promise<void>,
  label = 'integration event'
): Promise<void> => {
  const resolved = resolveIntegrationManager(manager);
  if (!resolved) {
    return;
  }
  try {
    await publishFn(resolved);
  } catch (error) {
    console.warn(`Failed publishing ${label}`, error);
  }
};
