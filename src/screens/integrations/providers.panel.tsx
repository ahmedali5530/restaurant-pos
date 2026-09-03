import { AvailableProviderEntry } from '@/integrations/core/integration-manager.ts';
import { Button } from '@/components/common/input/button.tsx';
import { Switch } from '@/components/common/input/switch.tsx';
import { useTranslation } from 'react-i18next';

interface ProvidersPanelProps {
  providers: AvailableProviderEntry[];
  onConfigure: (providerId: string) => void;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
}

export const ProvidersPanel = ({ providers, onConfigure, onToggleProvider }: ProvidersPanelProps) => {
  const { t } = useTranslation('integrations');

  return (
    <div className="p-5 space-y-3">
      {providers.map((provider) => (
        <div key={provider.manifest.id} className="border border-neutral-200 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{provider.manifest.displayName}</p>
              <p className="text-xs text-neutral-500">
                {provider.manifest.category} - v{provider.manifest.providerVersion}
              </p>
              <p className="text-xs mt-1 text-neutral-600">
                {provider.enabled ? t('enabled') : t('disabled')}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Switch
                checked={provider.enabled}
                onChange={(event) => onToggleProvider(provider.manifest.id, event.target.checked)}
              >
                {provider.enabled ? t('disableProvider') : t('enableProvider')}
              </Switch>
              <Button variant="primary" onClick={() => onConfigure(provider.manifest.id)}>
                {t('configure')}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
