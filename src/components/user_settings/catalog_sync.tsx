import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/common/input/button.tsx';

type CatalogStats = {
  localVersion?: number;
  remoteVersion?: number;
  lastSynced?: {
    table?: string;
    recordId?: string;
    at?: string;
  } | null;
  lastError?: string | null;
};

type SyncStatsResponse = {
  enabled?: boolean;
  distributionMode?: string;
  downloadEnabled?: boolean;
  lastError?: string | null;
  catalog?: CatalogStats | null;
};

function syncServiceBaseUrl(): string {
  const raw = (import.meta.env.VITE_SYNC_SERVICE_URL as string | undefined)?.trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

function syncSecretHeaders(): HeadersInit {
  const secret = (import.meta.env.VITE_SYNC_STATS_SECRET as string | undefined)?.trim();
  return secret ? { 'X-Sync-Stats-Secret': secret } : {};
}

/**
 * Shown whenever VITE_SYNC_SERVICE_URL is set. Sync now is enabled only when
 * the sync service reports distribution mode `full`.
 */
export const CatalogSyncSettingsCard = () => {
  const { t } = useTranslation('settings');
  const baseUrl = syncServiceBaseUrl();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogStats | null>(null);
  const [mode, setMode] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!baseUrl) return;
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/stats`, { headers: syncSecretHeaders() });
      if (!res.ok) {
        setDownloadEnabled(false);
        setStatusError(t('catalogSync.unreachable'));
        return;
      }
      const data = (await res.json()) as SyncStatsResponse;
      const downloadOn = data.distributionMode === 'full'
        || data.downloadEnabled === true;
      setDownloadEnabled(downloadOn);
      setMode(data.distributionMode || '');
      setCatalog(data.catalog || null);
      if (!downloadOn) {
        setStatusError(t('catalogSync.modeRequired'));
      } else if (data.catalog?.lastError || data.lastError) {
        setStatusError(data.catalog?.lastError || data.lastError || null);
      } else {
        setStatusError(null);
      }
    } catch {
      setDownloadEnabled(false);
      setStatusError(t('catalogSync.unreachable'));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, t]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const syncNow = async () => {
    if (!baseUrl || !downloadEnabled) return;
    setSyncing(true);
    try {
      const res = await fetch(`${baseUrl}/catalog/sync-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...syncSecretHeaders(),
        },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('catalogSync.failed'));
        return;
      }
      toast.success(t('catalogSync.queued'));
      await refresh();
    } catch {
      toast.error(t('catalogSync.failed'));
    } finally {
      setSyncing(false);
    }
  };

  if (!baseUrl) return null;

  const localVersion = catalog?.localVersion ?? 0;
  const remoteVersion = catalog?.remoteVersion ?? 0;
  const updateAvailable = downloadEnabled && remoteVersion > localVersion;

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-catalog-sync">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('catalogSync.title')}</h2>
          <p className="text-sm text-muted">{t('catalogSync.description')}</p>
        </div>
      </div>

      <div className="space-y-2 text-sm mb-5">
        <div className="flex justify-between gap-3">
          <span className="text-muted">{t('catalogSync.mode')}</span>
          <span className="font-medium">{mode || (loading ? '…' : '—')}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">{t('catalogSync.localVersion')}</span>
          <span className="font-medium">{localVersion}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">{t('catalogSync.remoteVersion')}</span>
          <span className="font-medium">{remoteVersion}</span>
        </div>
        {statusError ? (
          <p className="text-danger text-xs">{statusError}</p>
        ) : updateAvailable ? (
          <p className="text-warning font-medium">{t('catalogSync.updateAvailable')}</p>
        ) : downloadEnabled ? (
          <p className="text-muted">{t('catalogSync.upToDate')}</p>
        ) : null}
        {catalog?.lastSynced?.recordId ? (
          <p className="text-muted text-xs">
            {t('catalogSync.lastSynced', {
              record: catalog.lastSynced.recordId,
              table: catalog.lastSynced.table || '',
            })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <div>
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={syncing || loading || !downloadEnabled}
            onClick={() => { void syncNow(); }}
          >
            {syncing ? t('catalogSync.syncing') : t('catalogSync.syncNow')}
          </Button>
        </div>
        <div>
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={loading}
            onClick={() => { void refresh(); }}
          >
            {t('catalogSync.refresh')}
          </Button>
        </div>
      </div>
    </div>
  );
};
