import type { IntegrationManager } from '@/integrations/core/integration-manager.ts';

let integrationEventManager: IntegrationManager | null = null;

/** Set from IntegrationProvider so deep services can publish without React context. */
export const setIntegrationEventManager = (manager: IntegrationManager | null) => {
  integrationEventManager = manager;
};

export const getIntegrationEventManager = (): IntegrationManager | null =>
  integrationEventManager;
