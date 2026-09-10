import {useState} from "react";
import {useSetAtom} from "jotai";
import {toast} from "sonner";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {appSettings} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {useTranslation} from 'react-i18next';
import {del, set} from 'idb-keyval';
import {useDatabase} from "@/hooks/useDatabase.ts";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";
import {terminalSyncService} from "@/infrastructure/sync/sync-service.ts";
import {refreshCatalogIntoSettings} from "@/providers/pos-store.provider.tsx";

export const CacheSettings = () => {
  const db = useDB();
  const setSettings = useSetAtom(appSettings);
  const [isReloading, setIsReloading] = useState(false);
  const { t } = useTranslation('settings');
  const { isEffectivelyConnected } = useDatabase();

  const canReload = isEffectivelyConnected && !isReloading;

  const reloadCache = async () => {
    if (!isEffectivelyConnected) {
      toast.error(t('cache.offline'));
      return;
    }

    try {
      const pending = await posStore.getPendingOutbox();
      const pendingCount = pending.length;
      const confirmed = window.confirm(
        pendingCount > 0
          ? t('cache.confirmWithPending', { count: pendingCount })
          : t('cache.confirm'),
      );
      if (!confirmed) return;

      setIsReloading(true);
      await terminalSyncService.rehydrateFromServer();
      await refreshCatalogIntoSettings(setSettings);

      // Documents live outside PosStore (idb-keyval); best-effort refresh.
      try {
        const documentsResult = await db.query(`SELECT id, content from ${Tables.documents}`);
        await del(Tables.documents);
        await set(Tables.documents, (documentsResult?.[0] ?? []).map((item: { id: { toString: () => string } }) => ({
          ...item,
          id: item.id.toString(),
        })));
      } catch (docError) {
        console.warn('Documents cache refresh skipped', docError);
      }

      toast.success(t('cache.reloaded'));
    } catch (error) {
      console.error("Failed to reload cache:", error);
      const code = (error as Error & { code?: string })?.code
        ?? ((error as Error)?.message === 'OFFLINE' ? 'OFFLINE' : undefined);
      toast.error(code === 'OFFLINE' ? t('cache.offline') : t('cache.reloadFailed'));
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <div className="shadow p-5 rounded-xl bg-white" data-testid="settings-card-cache">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('cache.title')}</h2>
          <p className="text-sm text-neutral-500">{t('cache.description')}</p>
          {!isEffectivelyConnected && (
            <p className="text-sm text-warning-700 mt-2" data-testid="cache-offline-hint">
              {t('cache.offlineHint')}
            </p>
          )}
        </div>
        <Button
          variant="danger"
          size="lg"
          filled
          onClick={reloadCache}
          isLoading={isReloading}
          disabled={!canReload}
        >
          {t('cache.reload')}
        </Button>
      </div>
    </div>
  );
};
