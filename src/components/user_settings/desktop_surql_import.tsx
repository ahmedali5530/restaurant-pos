import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/input/button.tsx';
import {
  importSurqlFiles,
  isTauriDesktop,
  openMigrationsFolder,
  pickSurqlFiles,
} from '@/lib/desktop.ts';
import { toast } from 'sonner';

/** Settings card: import additional .surql patches after go-live (Tauri only). */
export const DesktopSurqlImportCard = () => {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);

  if (!isTauriDesktop()) return null;

  const onImport = async () => {
    setBusy(true);
    try {
      const files = await pickSurqlFiles();
      if (!files?.length) return;
      const result = await importSurqlFiles(files);
      if (!result.ok) {
        toast.error(result.error || t('desktopSetup.importFailed'));
        return;
      }
      toast.success(t('desktopSetup.importOk', { count: result.imported.length }));
    } catch (err: any) {
      toast.error(err?.message || t('desktopSetup.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onSamples = async () => {
    try {
      const path = await openMigrationsFolder();
      toast.message(t('desktopSetup.samplesPath'), { description: path });
    } catch (err: any) {
      toast.error(err?.message || t('desktopSetup.samplesFailed'));
    }
  };

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t('desktopSetup.settingsTitle')}</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          {t('desktopSetup.settingsHelp')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <div>
          <Button type="button" variant="primary" disabled={busy} onClick={onImport}>
            {t('desktopSetup.import')}
          </Button>
        </div>
        <div>
          <Button type="button" flat disabled={busy} onClick={onSamples}>
            {t('desktopSetup.showSamples')}
          </Button>
        </div>
      </div>
    </div>
  );
};
