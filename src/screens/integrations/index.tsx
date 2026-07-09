import { useEffect, useMemo, useState } from 'react';
import { TabList, Tabs } from 'react-aria-components';
import { Tab, TabPanel } from '@/components/common/react-aria/tabs.tsx';
import { Layout } from '@/screens/partials/layout.tsx';
import { useIntegrationManager } from '@/providers/integration.provider.tsx';
import { ProviderManifest } from '@/integrations/core/types.ts';
import { IntegrationHealthSnapshot } from '@/integrations/core/types.ts';
import { IntegrationQueueJob } from '@/integrations/queue/types.ts';
import { ProvidersPanel } from '@/screens/integrations/providers.panel.tsx';
import { ConfigurationPanel } from '@/screens/integrations/configuration.panel.tsx';
import { HealthPanel } from '@/screens/integrations/health.panel.tsx';
import { QueuePanel } from '@/screens/integrations/queue.panel.tsx';
import { useSecurity } from '@/hooks/useSecurity.ts';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AvailableProviderEntry } from '@/integrations/core/integration-manager.ts';

const INTEGRATION_TAB_MODULES: Record<string, string> = {
  providers: 'Integration providers',
  configuration: 'Integration configuration',
  health: 'Integration health',
  queue: 'Integration queue',
};

export const IntegrationsScreen = () => {
  const { t } = useTranslation('integrations');
  const { manager, initialized, providers: availableProviders, setProviderEnabled } = useIntegrationManager();
  const { protectAction } = useSecurity();

  const [selected, setSelected] = useState('providers');
  const [providers, setProviders] = useState<ProviderManifest[]>([]);
  const [providerEntries, setProviderEntries] = useState<AvailableProviderEntry[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [healthRows, setHealthRows] = useState<IntegrationHealthSnapshot[]>([]);
  const [queueRows, setQueueRows] = useState<IntegrationQueueJob[]>([]);

  const pages = useMemo(() => ({
    providers: { title: t('tabs.providers') },
    configuration: { title: t('tabs.configuration') },
    health: { title: t('tabs.health') },
    queue: { title: t('tabs.queue') },
  }), [t]);

  useEffect(() => {
    if (!initialized) return;
    setProviderEntries(availableProviders);
    const manifests = availableProviders.map((entry) => entry.manifest);
    setProviders(manifests);
    if (manifests[0] && !selectedProviderId) {
      setSelectedProviderId(manifests[0].id);
    }
  }, [availableProviders, initialized, selectedProviderId]);

  useEffect(() => {
    if (!initialized) return;
    const loadStatus = async () => {
      const health = await manager.refreshHealth();
      const queue = await manager.getQueueSnapshot();
      setHealthRows(health);
      setQueueRows(queue);
    };
    void loadStatus();
  }, [initialized, manager]);

  const handleConfigure = (providerId: string) => {
    setSelectedProviderId(providerId);
    setSelected('configuration');
  };

  const handleToggleProvider = async (providerId: string, enabled: boolean) => {
    try {
      await setProviderEnabled(providerId, enabled);
      toast.success(enabled ? t('providerEnabled') : t('providerDisabled'));
      const health = await manager.refreshHealth();
      const queue = await manager.getQueueSnapshot();
      setHealthRows(health);
      setQueueRows(queue);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('enableFailed');
      toast.error(message || t('enableFailed'));
      console.error(error);
    }
  };

  return (
    <Layout>
      <Tabs
        className="w-full flex flex-col rounded-xl"
        selectedKey={selected}
        onSelectionChange={(key: string) => {
          protectAction(() => setSelected(key), {
            module: INTEGRATION_TAB_MODULES[key],
            description: t('security.accessTab', { module: pages[key as keyof typeof pages].title }),
          });
        }}
      >
        <TabList aria-label="Integrations tabs" className="flex flex-row gap-3 px-1 py-3 flex-nowrap">
          {Object.keys(pages).map((key) => (
            <Tab id={key} key={key}>{pages[key as keyof typeof pages].title}</Tab>
          ))}
        </TabList>

        <TabPanel id="providers" className="bg-white shadow flex-grow flex-shrink-0">
          <ProvidersPanel
            providers={providerEntries}
            onConfigure={handleConfigure}
            onToggleProvider={handleToggleProvider}
          />
        </TabPanel>

        <TabPanel id="configuration" className="bg-white shadow flex-grow flex-shrink-0">
          <ConfigurationPanel
            providers={providers}
            selectedProviderId={selectedProviderId}
            onProviderChange={setSelectedProviderId}
          />
        </TabPanel>

        <TabPanel id="health" className="bg-white shadow flex-grow flex-shrink-0">
          <HealthPanel rows={healthRows} />
        </TabPanel>

        <TabPanel id="queue" className="bg-white shadow flex-grow flex-shrink-0">
          <QueuePanel rows={queueRows} />
        </TabPanel>
      </Tabs>
    </Layout>
  );
};
