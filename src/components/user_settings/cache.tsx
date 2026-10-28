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
  const [busy, setBusy] = useState<'catalog' | 'full' | null>(null);
  const { t } = useTranslation('settings');
  const { isEffectivelyConnected } = useDatabase();

  const canAct = isEffectivelyConnected && busy === null;

  const refreshCatalog = async () => {
    if (!isEffectivelyConnected) {
      toast.error(t('cache.offline'));
      return;
    }

    try {
      const confirmed = window.confirm(t('cache.confirmCatalog'));
      if (!confirmed) return;

      setBusy('catalog');
      await terminalSyncService.rehydrateCatalogFromServer();
      await refreshCatalogIntoSettings(setSettings);
      toast.success(t('cache.catalogReloaded'));
    } catch (error) {
      console.error("Failed to refresh catalog:", error);
      const code = (error as Error & { code?: string })?.code
        ?? ((error as Error)?.message === 'OFFLINE' ? 'OFFLINE' : undefined);
      toast.error(code === 'OFFLINE' ? t('cache.offline') : t('cache.catalogReloadFailed'));
    } finally {
      setBusy(null);
    }
  };

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

      setBusy('full');
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
      setBusy(null);
    }
  };

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-cache">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('cache.title')}</h2>
          <p className="text-sm text-muted">{t('cache.description')}</p>
          <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row mt-5">
            <Button
              variant="primary"
              size="lg"
              filled
              onClick={refreshCatalog}
              isLoading={busy === 'catalog'}
              disabled={!canAct}
              data-testid="cache-refresh-catalog"
            >
              {t('cache.refreshCatalog')}
            </Button>
            <Button
              variant="danger"
              size="lg"
              filled
              onClick={reloadCache}
              isLoading={busy === 'full'}
              disabled={!canAct}
              data-testid="cache-reload-full"
            >
              {t('cache.reload')}
            </Button>
          </div>
          {!isEffectivelyConnected && (
            <p className="text-sm text-warning-700 mt-2" data-testid="cache-offline-hint">
              {t('cache.offlineHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
