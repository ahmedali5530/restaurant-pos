import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDB } from '@/api/db/db.ts';
import { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import { ProviderRegistry } from '@/integrations/registry/provider-registry.ts';
import { IntegrationEventBus } from '@/integrations/events/event-bus.ts';
import { IndexedDbQueueStore } from '@/integrations/storage/indexeddb-queue-store.ts';
import { IntegrationQueueEngine } from '@/integrations/queue/queue-engine.ts';
import { SchedulerEngine } from '@/integrations/scheduler/scheduler-engine.ts';
import { HealthMonitor } from '@/integrations/health/health-monitor.ts';
import { IntegrationAuditLogger } from '@/integrations/audit/audit-logger.ts';
import { BundledProviderDiscovery } from '@/integrations/registry/discovery.ts';
import { useIntegrationRepositories } from '@/integrations/storage/integration-repositories.ts';
import { AvailableProviderEntry } from '@/integrations/core/integration-manager.ts';
import { getIntegrationProviderConfig } from '@/integrations/configuration/configuration-store.ts';

interface IntegrationContextValue {
  manager: IntegrationManager;
  initialized: boolean;
  providers: AvailableProviderEntry[];
  refreshProviderStates: () => Promise<void>;
  setProviderEnabled: (providerId: string, enabled: boolean) => Promise<void>;
}

const FRAMEWORK_VERSION = '1.0.0';

const IntegrationContext = createContext<IntegrationContextValue | null>(null);

export const IntegrationProvider = ({ children }: PropsWithChildren) => {
  const [initialized, setInitialized] = useState(false);
  const [providers, setProviders] = useState<AvailableProviderEntry[]>([]);
  const repositories = useIntegrationRepositories();
  const db = useDB();
  const dbRef = useRef(db);
  dbRef.current = db;

  const manager = useMemo(() => {
    const registry = new ProviderRegistry(FRAMEWORK_VERSION);
    const eventBus = new IntegrationEventBus();
    const queueStore = new IndexedDbQueueStore();
    const queueEngine = new IntegrationQueueEngine(queueStore);
    const scheduler = new SchedulerEngine();
    const healthMonitor = new HealthMonitor();
    const auditLogger = new IntegrationAuditLogger();

    const next = new IntegrationManager(registry, eventBus, queueEngine, scheduler, healthMonitor, auditLogger);
    next.setConfigLoader((providerId) => getIntegrationProviderConfig(dbRef.current, providerId));
    next.setDbLoader(() => dbRef.current);
    return next;
  }, []);

  useEffect(() => {
    let mounted = true;

    const refreshProviderStates = async () => {
      let enabledIds: string[] = [];
      try {
        const states = await repositories.getProviderStates();
        enabledIds = states.filter((state) => state.enabled).map((state) => state.provider_id);
      } catch (error) {
        console.warn('Failed loading integration states; using catalog defaults.', error);
      }
      const availableProviders = manager.listAvailableProviders().map((entry) => ({
        ...entry,
        enabled: enabledIds.includes(entry.manifest.id),
      }));
      if (mounted) {
        setProviders(availableProviders);
      }
    };

    const bootstrap = async () => {
      const discovery = new BundledProviderDiscovery();
      const catalog = discovery.discoverCatalog();
      const catalogManifests = catalog.listCatalogManifests();
      if (mounted) {
        setProviders(catalogManifests.map((manifest) => ({ manifest, enabled: false })));
      }

      let enabledProviderIds: string[] = [];
      try {
        await repositories.syncCatalogToDatabase(catalogManifests);
        const states = await repositories.getProviderStates();
        enabledProviderIds = states.filter((state) => state.enabled).map((state) => state.provider_id);
      } catch (error) {
        console.warn('Failed syncing integration states; bootstrapping with all providers disabled.', error);
      }

      await manager.bootstrapFromCatalog(catalog, enabledProviderIds);
      await manager.refreshHealth();
      await refreshProviderStates();
      if (mounted) {
        setInitialized(true);
      }
    };
    void bootstrap().catch((error) => {
      console.error('Integration framework bootstrap failed', error);
      if (mounted) {
        setInitialized(true);
      }
    });

    const queueTimer = setInterval(() => {
      void manager.processQueue();
    }, 1200);

    return () => {
      mounted = false;
      clearInterval(queueTimer);
      void manager.shutdown();
    };
  }, [manager]);

  const refreshProviderStates = async () => {
    let enabledIds: string[] = [];
    try {
      const states = await repositories.getProviderStates();
      enabledIds = states.filter((state) => state.enabled).map((state) => state.provider_id);
    } catch (error) {
      console.warn('Failed loading integration states; using in-memory provider state.', error);
    }
    const availableProviders = manager.listAvailableProviders().map((entry) => ({
      ...entry,
      enabled: enabledIds.includes(entry.manifest.id),
    }));
    setProviders(availableProviders);
  };

  const setProviderEnabled = async (providerId: string, enabled: boolean) => {
    if (enabled) {
      await manager.setProviderEnabled(providerId, true);
      await repositories.setProviderEnabled(providerId, true);
    } else {
      await repositories.setProviderEnabled(providerId, false);
      await manager.setProviderEnabled(providerId, false);
    }
    await refreshProviderStates();
    await manager.refreshHealth();
  };

  return (
    <IntegrationContext.Provider
      value={{
        manager,
        initialized,
        providers,
        refreshProviderStates,
        setProviderEnabled,
      }}
    >
      {children}
    </IntegrationContext.Provider>
  );
};

export const useIntegrationManager = () => {
  const context = useContext(IntegrationContext);
  if (!context) {
    throw new Error('useIntegrationManager must be used within IntegrationProvider');
  }
  return context;
};
