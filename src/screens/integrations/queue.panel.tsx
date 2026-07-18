import { IntegrationQueueJob, IntegrationQueueStatus } from '@/integrations/queue/types.ts';
import { toLuxonDateTime } from '@/lib/datetime.ts';
import { useTranslation } from 'react-i18next';

interface QueuePanelProps {
  rows: IntegrationQueueJob[];
}

const STATUS_STYLES: Record<IntegrationQueueStatus, string> = {
  Pending: 'bg-warning-50 text-warning-700 border-warning-200',
  Running: 'bg-info-50 text-info-700 border-info-200',
  Waiting: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  Completed: 'bg-success-50 text-success-700 border-success-200',
  Failed: 'bg-danger-50 text-danger-700 border-danger-200',
  Cancelled: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  DeadLetter: 'bg-danger-50 text-danger-700 border-danger-200',
};

const formatQueueDate = (value?: string) => {
  const dt = toLuxonDateTime(value);
  if (!dt.isValid) return '—';
  const dateFormat = import.meta.env.VITE_DATE_FORMAT || 'yyyy-MM-dd';
  const timeFormat = import.meta.env.VITE_TIME_FORMAT || 'HH:mm';
  return dt.toFormat(`${dateFormat} ${timeFormat}`);
};

const humanizeProvider = (providerId: string) => {
  const raw = providerId.replace(/^provider:/i, '');
  return raw
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(' ');
};

const humanizeAction = (action: string) => {
  const spaced = action
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const getOrderSummary = (payload: Record<string, unknown>) => {
  const order = payload?.order as Record<string, unknown> | undefined;
  if (!order || typeof order !== 'object') return null;

  const invoiceNumber = order.invoice_number;
  const split = order.split;
  if (invoiceNumber == null) return null;

  return split != null && split !== ''
    ? `#${invoiceNumber}/${split}`
    : `#${invoiceNumber}`;
};

export const QueuePanel = ({ rows }: QueuePanelProps) => {
  const { t } = useTranslation('integrations');

  return (
    <div className="p-5 space-y-3">
      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center">
          <p className="text-sm text-neutral-500">{t('noPendingJobs')}</p>
        </div>
      )}

      {rows.map((row) => {
        const orderLabel = getOrderSummary(row.payload);
        const statusClass = STATUS_STYLES[row.status] ?? STATUS_STYLES.Waiting;
        const statusLabel = t(`status.${row.status}`, { defaultValue: row.status });

        return (
          <div
            key={row.id}
            className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-neutral-900">
                    {humanizeProvider(row.providerId)}
                  </p>
                  {orderLabel ? (
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {t('fields.order')} {orderLabel}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-neutral-600">{humanizeAction(row.action)}</p>
              </div>

              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}
              >
                {statusLabel}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
              <span>
                {t('fields.created')}:{' '}
                <span className="font-medium text-neutral-700">{formatQueueDate(row.createdAt)}</span>
              </span>
              <span>
                {t('fields.updated')}:{' '}
                <span className="font-medium text-neutral-700">{formatQueueDate(row.updatedAt)}</span>
              </span>
              <span>
                {t('fields.attempts')}:{' '}
                <span className="font-medium text-neutral-700">
                  {row.attempts}/{row.maxRetries}
                </span>
              </span>
              {row.nextRunAt ? (
                <span>
                  {t('fields.nextRun')}:{' '}
                  <span className="font-medium text-neutral-700">{formatQueueDate(row.nextRunAt)}</span>
                </span>
              ) : null}
            </div>

            {row.lastError ? (
              <div className="mt-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2">
                <p className="text-xs font-medium text-danger-700">{t('fields.error')}</p>
                <p className="mt-0.5 break-words text-sm text-danger-700">{row.lastError}</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
