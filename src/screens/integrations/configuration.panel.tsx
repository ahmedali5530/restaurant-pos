import { useEffect, useMemo, useState } from 'react';
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
}

export const ConfigurationPanel = ({
  providers,
  selectedProviderId,
  onProviderChange,
}: ConfigurationPanelProps) => {
  const { t } = useTranslation('integrations');
  const { getConfiguration, saveConfiguration } = useIntegrationConfigurationManager();
  const { protectFormSubmit } = useSecurity();
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

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

  useEffect(() => {
    if (!selectedProviderId) return;
    const load = async () => {
      const values = await getConfiguration(selectedProviderId);
      setFormValues(values);
    };
    void load();
  }, [ selectedProviderId]);

  const save = async () => {
    if (!selectedProviderId) return;
    await saveConfiguration(selectedProviderId, formValues);
    toast.success(t('configurationSaved'));
  };

  if (!selectedProvider) {
    return <div className="p-5 text-sm text-neutral-500">{t('description')}</div>;
  }

  return (
    <form
      className="p-5"
      onSubmit={protectFormSubmit(() => {
        void save();
      }, {
        module: 'Integration configuration',
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
  );
};
