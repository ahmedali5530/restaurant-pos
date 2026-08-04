import { useEffect, useMemo, useRef, useState } from 'react';
import { ProviderManifest } from '@/integrations/core/types.ts';
import { useIntegrationConfigurationManager } from '@/integrations/configuration/configuration-manager.ts';
import { DynamicField } from '@/components/integrations/dynamic-field.tsx';
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx';
import { Button } from '@/components/common/input/button.tsx';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useSecurity } from '@/hooks/useSecurity.ts';

type SelectOption = { label: string; value: string };

interface ConfigurationPanelProps {
  providers: ProviderManifest[];
  selectedProviderId: string;
  onProviderChange: (providerId: string) => void;
  onConnect?: (providerId: string) => Promise<void>;
  onDisconnect?: (providerId: string) => Promise<void>;
  onInitialSync?: (providerId: string) => Promise<void>;
}

export const ConfigurationPanel = ({
  providers,
  selectedProviderId,
  onProviderChange,
  onConnect,
  onDisconnect,
  onInitialSync,
}: ConfigurationPanelProps) => {
  const { t } = useTranslation('integrations');
  const { getConfiguration, saveConfiguration } = useIntegrationConfigurationManager();
  const { protectFormSubmit } = useSecurity();
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const oauthAppliedRef = useRef(false);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId]
  );

  const providerOptions = useMemo<SelectOption[]>(
    () => providers.map((provider) => ({ label: provider.displayName, value: provider.id })),
    [providers]
  );

  const selectedProviderOption = providerOptions.find((option) => option.value === selectedProviderId) ?? null;

  const fields = (selectedProvider?.configurationSchema.sections ?? []).flatMap((section) => section.fields);

  const isOAuth = selectedProvider?.authenticationType === 'oauth';
  const isConnected = Boolean(formValues.tenantId || formValues.realmId);

  useEffect(() => {
    if (!selectedProviderId) return;
    const load = async () => {
      const values = await getConfiguration(selectedProviderId);
      setFormValues(values);
    };
    void load();
  }, [ selectedProviderId]);

  // Auto-save tenantId from OAuth callback redirect URL params
  useEffect(() => {
    if (!selectedProviderId || !isOAuth || oauthAppliedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const tenantId = params.get('tenantId');
    const companyName = params.get('companyName');
    if (!tenantId) return;

    const applyOAuthResult = async () => {
      const current = await getConfiguration(selectedProviderId);
      // Only save if not already connected (avoid overwriting)
      if (current.tenantId === tenantId) return;
      const updated = { ...current, tenantId };
      if (companyName) updated.companyName = companyName;
      await saveConfiguration(selectedProviderId, updated);
      setFormValues(updated);
      // Clean URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('tenantId');
      url.searchParams.delete('companyName');
      window.history.replaceState(null, '', url.toString());
      toast.success(t('oauth.connected'));
    };

    oauthAppliedRef.current = true;
    void applyOAuthResult();
  }, [selectedProviderId, isOAuth, getConfiguration, saveConfiguration, t]);

  const save = async () => {
    if (!selectedProviderId) return;
    await saveConfiguration(selectedProviderId, formValues);
    toast.success(t('configurationSaved'));
  };

  const handleConnect = async () => {
    if (!onConnect || !selectedProviderId) return;
    setConnecting(true);
    try {
      await onConnect(selectedProviderId);
    } catch (err: any) {
      toast.error(err?.message || t('syncFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!onDisconnect || !selectedProviderId) return;
    setDisconnecting(true);
    try {
      await onDisconnect(selectedProviderId);
      setFormValues((prev) => ({ ...prev, tenantId: '', realmId: '' }));
      toast.success(t('oauth.disconnected'));
    } catch (err: any) {
      toast.error(err?.message || 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleInitialSync = async () => {
    if (!onInitialSync || !selectedProviderId) return;
    setSyncing(true);
    try {
      await onInitialSync(selectedProviderId);
      toast.success(t('syncComplete', { count: 0 }));
      // Reload config to pick up any new values
      const values = await getConfiguration(selectedProviderId);
      setFormValues(values);
    } catch (err: any) {
      toast.error(err?.message || t('syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  if (!selectedProvider) {
    return <div className="p-5 text-sm text-neutral-500">{t('description')}</div>;
  }

  return (
    <div className="p-5">
      {isOAuth && (
        <div className="mb-6 p-4 border border-neutral-200 rounded-lg bg-neutral-50">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {isConnected ? t('connectedTo', { company: String(formValues.companyName || formValues.tenantId || formValues.realmId || '') }) : t('notConnected')}
              </p>
              {isConnected && <p className="text-xs text-neutral-500 mt-0.5">{t('connectionRequired')}</p>}
            </div>
            <div className="flex items-center gap-2">
              {!isConnected ? (
                <Button variant="primary" onClick={handleConnect} disabled={connecting}>
                  {connecting ? t('connecting') : t('connect')}
                </Button>
              ) : (
                <>
                  <Button variant="primary" onClick={handleInitialSync} disabled={syncing}>
                    {syncing ? t('syncing') : t('initialSync')}
                  </Button>
                  <Button variant="primary" onClick={handleDisconnect} disabled={disconnecting}>
                    {disconnecting ? t('disconnecting') : t('disconnect')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={protectFormSubmit(() => {
          void save();
        }, {
          module: 'integrations.configuration',
          description: t('security.saveConfiguration'),
        })}
      >
        <div className="mb-5 max-w-xl">
          <label className="block text-sm font-medium mb-1">{t('provider')}</label>
          <ReactSelect<SelectOption, false>
            options={providerOptions}
            value={selectedProviderOption}
            onChange={(option) => onProviderChange(option?.value ?? '')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {fields.map((field) => (
            <div key={field.key}>
              {field.type !== 'switch' && field.type !== 'checkbox' && (
                <label className="block text-sm font-medium mb-1">{field.label}</label>
              )}
              <DynamicField
                field={field}
                value={formValues[field.key]}
                providerId={selectedProviderId}
                onChange={(next) => {
                  setFormValues((previous) => ({ ...previous, [field.key]: next }));
                }}
              />
              {field.helpText && <p className="text-xs text-neutral-500 mt-1">{field.helpText}</p>}
            </div>
          ))}
        </div>

        <Button type="submit" variant="primary">
          {t('saveConfiguration')}
        </Button>
      </form>
    </div>
  );
};
