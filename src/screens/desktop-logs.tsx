import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/common/input/button.tsx';
import { LOGIN } from '@/routes/posr.ts';
import {
  clearDesktopLogs,
  getLogTail,
  getServiceStatus,
  isTauriDesktop,
  openLogsDir,
  type ServiceStatus,
} from '@/lib/desktop';

const SOURCES = ['all', 'shell', 'surreal', 'gateway', 'print', 'payment', 'tracking', 'api', 'sync'] as const;

export const DesktopLogs = () => {
  const { t } = useTranslation('common');
  const navigation = useNavigate();
  const [source, setSource] = useState<(typeof SOURCES)[number]>('all');
  const [lines, setLines] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isTauriDesktop()) return;
    setLoading(true);
    try {
      const [logLines, st] = await Promise.all([
        getLogTail(source === 'all' ? undefined : source, 800),
        getServiceStatus(),
      ]);
      setLines(logLines);
      setStatuses(st);
    } catch (err) {
      console.error(err);
      toast.error(t('desktopLogs.refreshFailed', { defaultValue: 'Could not refresh logs' }));
    } finally {
      setLoading(false);
    }
  }, [source, t]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!isTauriDesktop()) {
    return (
      <div className="p-6 text-neutral-600">
        {t('desktopLogs.desktopOnly', { defaultValue: 'Desktop logs are only available in the POSR Desktop app.' })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full min-h-[70vh]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-neutral-900">
          {t('desktopLogs.title', { defaultValue: 'Desktop logs' })}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
              if (idx > 0) {
                navigation(-1);
              } else {
                navigation(LOGIN);
              }
            }}
          >
            {t('actions.back')}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {t('desktopLogs.refresh', { defaultValue: 'Refresh' })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await openLogsDir();
              } catch {
                toast.error(t('desktopLogs.openFailed', { defaultValue: 'Could not open logs folder' }));
              }
            }}
          >
            {t('desktopLogs.openFolder', { defaultValue: 'Open folder' })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={async () => {
              const ok = window.confirm(
                t('desktopLogs.clearBody', {
                  defaultValue: 'Clear the in-memory log view? Files on disk are kept.',
                }),
              );
              if (!ok) return;
              await clearDesktopLogs();
              await refresh();
            }}
          >
            {t('desktopLogs.clear', { defaultValue: 'Clear' })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(lines.join('\n'));
              toast.success(t('desktopLogs.copied', { defaultValue: 'Copied to clipboard' }));
            }}
          >
            {t('desktopLogs.copy', { defaultValue: 'Copy' })}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {statuses.map((s) => (
          <span
            key={s.name}
            className="rounded border border-neutral-300 bg-neutral-50 px-2 py-1 text-neutral-800"
          >
            {s.name}: <strong>{s.status}</strong>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={`rounded px-3 py-1 text-sm border ${
              source === s
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-neutral-700 border-neutral-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <pre className="flex-1 overflow-auto rounded border border-neutral-300 bg-neutral-950 p-3 text-xs text-neutral-100 font-mono whitespace-pre-wrap">
        {lines.length ? lines.join('\n') : t('desktopLogs.empty', { defaultValue: 'No log lines yet.' })}
      </pre>
    </div>
  );
};

export default DesktopLogs;
