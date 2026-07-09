import { IntegrationQueueJob } from '@/integrations/queue/types.ts';
import { useTranslation } from 'react-i18next';

interface QueuePanelProps {
  rows: IntegrationQueueJob[];
}

export const QueuePanel = ({ rows }: QueuePanelProps) => {
  const { t } = useTranslation('integrations');

  return (
    <div className="p-5 space-y-3">
      {rows.length === 0 && <p className="text-sm text-neutral-500">{t('noPendingJobs')}</p>}
      {rows.map((row) => (
        <div key={row.id} className="border border-neutral-200 rounded-md p-4 text-sm">
          <p className="font-medium">{row.providerId}</p>
          <p>{t('fields.action')}: {row.action}</p>
          <p>{t('fields.status')}: {row.status}</p>
          <p>{t('fields.attempts')}: {row.attempts}</p>
        </div>
      ))}
    </div>
  );
};
