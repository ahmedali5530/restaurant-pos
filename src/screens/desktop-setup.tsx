/**
 * First-run / update screen for the Tauri offline shell.
 * Operator picks one or more .surql files (schema, demo, or patches) to import.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/input/button.tsx';
import { DocumentTitle } from '@/components/common/document-title.tsx';
import { LOGIN } from '@/routes/posr.ts';
import {
  getDesktopStatus,
  importSurqlFiles,
  isTauriDesktop,
  markDesktopSetupComplete,
  openMigrationsFolder,
  pickSurqlFiles,
  type DesktopStatus,
} from '@/lib/desktop.ts';
import { toast } from 'sonner';

export const DesktopSetup = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!isTauriDesktop()) {
      navigate(LOGIN, { replace: true });
      return;
    }
    try {
      const s = await getDesktopStatus();
      setStatus(s);
    } catch (err: any) {
      toast.error(err?.message || t('desktopSetup.statusFailed'));
    }
  }, [navigate, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onPick = async () => {
    try {
      const files = await pickSurqlFiles();
      if (files?.length) {
        setSelected((prev) => Array.from(new Set([...prev, ...files])));
      }
    } catch (err: any) {
      toast.error(err?.message || t('desktopSetup.pickFailed'));
    }
  };

  const onClear = () => setSelected([]);

  const onImport = async () => {
    if (!selected.length) {
      toast.error(t('desktopSetup.noFiles'));
      return;
    }
    setBusy(true);
    try {
      const result = await importSurqlFiles(selected);
      if (!result.ok) {
        setLog((prev) => [...prev, result.error || t('desktopSetup.importFailed')]);
        toast.error(result.error || t('desktopSetup.importFailed'));
        return;
      }
      setLog((prev) => [
        ...prev,
        ...result.imported.map((p) => t('desktopSetup.importedOne', { file: p })),
      ]);
      toast.success(t('desktopSetup.importOk', { count: result.imported.length }));
      setSelected([]);
    } catch (err: any) {
      toast.error(err?.message || t('desktopSetup.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onContinue = async () => {
    setBusy(true);
    try {
      await markDesktopSetupComplete();
      toast.success(t('desktopSetup.setupDone'));
      navigate(LOGIN, { replace: true });
    } catch (err: any) {
      toast.error(err?.message || t('desktopSetup.setupFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onShowSamples = async () => {
    try {
      const path = await openMigrationsFolder();
      toast.message(t('desktopSetup.samplesPath'), { description: path });
      setLog((prev) => [...prev, path]);
    } catch (err: any) {
      toast.error(err?.message || t('desktopSetup.samplesFailed'));
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex items-center justify-center p-6">
      <DocumentTitle parts={[t('desktopSetup.title')]} />
      <div className="w-full max-w-2xl space-y-6 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">{t('desktopSetup.title')}</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {t('desktopSetup.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded border border-neutral-200 dark:border-neutral-700 p-3">
            <div className="text-neutral-500">{t('desktopSetup.surreal')}</div>
            <div className="font-medium">
              {status?.surrealReady ? t('desktopSetup.ready') : t('desktopSetup.waiting')}
            </div>
          </div>
          <div className="rounded border border-neutral-200 dark:border-neutral-700 p-3">
            <div className="text-neutral-500">{t('desktopSetup.gateway')}</div>
            <div className="font-medium">
              {status?.gatewayReady ? t('desktopSetup.ready') : t('desktopSetup.waiting')}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">{t('desktopSetup.selected')}</div>
          {selected.length === 0 ? (
            <p className="text-sm text-neutral-500">{t('desktopSetup.noneSelected')}</p>
          ) : (
            <ul className="max-h-40 overflow-auto rounded border border-neutral-200 dark:border-neutral-700 p-2 text-xs font-mono space-y-1">
              {selected.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div>
            <Button type="button" onClick={onPick} disabled={busy} variant="primary">
              {t('desktopSetup.pickFiles')}
            </Button>
          </div>
          <div>
            <Button type="button" onClick={onClear} disabled={busy || !selected.length} flat>
              {t('desktopSetup.clear')}
            </Button>
          </div>
          <div>
            <Button type="button" onClick={onImport} disabled={busy || !selected.length} variant="primary">
              {t('desktopSetup.import')}
            </Button>
          </div>
          <div>
            <Button type="button" onClick={onShowSamples} disabled={busy} flat>
              {t('desktopSetup.showSamples')}
            </Button>
          </div>
        </div>

        {log.length > 0 && (
          <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-3 max-h-40 overflow-auto text-xs font-mono whitespace-pre-wrap">
            {log.join('\n')}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-200 dark:border-neutral-700 pt-4">
          <div>
            <Button type="button" onClick={() => navigate(LOGIN)} flat disabled={busy}>
              {t('desktopSetup.skipToLogin')}
            </Button>
          </div>
          <div>
            <Button type="button" onClick={onContinue} variant="primary" disabled={busy}>
              {t('desktopSetup.continue')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
