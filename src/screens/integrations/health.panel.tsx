import { IntegrationHealthSnapshot } from '@/integrations/core/types.ts';
import { useTranslation } from 'react-i18next';

interface HealthPanelProps {
  rows: IntegrationHealthSnapshot[];
}

export const HealthPanel = ({ rows }: HealthPanelProps) => {
  const { t } = useTranslation('integrations');

  return (
    <div className="p-5 space-y-3">
      {rows.map((row) => (
        <div key={row.providerId} className="border border-neutral-200 rounded-md p-4 text-sm">
          <p className="font-medium">{row.providerId}</p>
          <p>{t('fields.status')}: {row.status}</p>
          <p>{t('fields.auth')}: {row.authenticationStatus}</p>
          <p>{t('fields.failedJobs')}: {row.failedJobs ?? 0}</p>
        </div>
      ))}
    </div>
  );
};
