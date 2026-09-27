import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/common/input/button.tsx';

type CatalogProgress = {
  running?: boolean;
  totalTables?: number;
  completedTables?: number;
  currentTable?: string | null;
  percent?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
};

type CatalogStats = {
  localVersion?: number;
  remoteVersion?: number;
  lastSynced?: {
    table?: string;
    recordId?: string;
    at?: string;
  } | null;
  lastError?: string | null;
  progress?: CatalogProgress | null;
  syncing?: {
    table?: string;
    recordId?: string;
    phase?: string;
  } | null;
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
  /** Only true after /stats has reported progress.running === true for this run. */
  const seenRunningRef = useRef(false);

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!baseUrl) return;
    if (!opts?.quiet) setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/stats`, { headers: syncSecretHeaders() });
      if (!res.ok) {
        setDownloadEnabled(false);
        setStatusError(t('catalogSync.unreachable'));
        setSyncing(false);
        seenRunningRef.current = false;
        return;
      }
      const data = (await res.json()) as SyncStatsResponse;
      const downloadOn = data.distributionMode === 'full'
        || data.downloadEnabled === true;
      setDownloadEnabled(downloadOn);
      setMode(data.distributionMode || '');
      setCatalog(data.catalog || null);

      const running = Boolean(data.catalog?.progress?.running);
      if (running) {
        seenRunningRef.current = true;
        setSyncing(true);
      } else if (seenRunningRef.current) {
        // Real transition: was running on server, now finished.
        seenRunningRef.current = false;
        setSyncing(false);
        if (data.catalog?.lastError) {
          toast.error(t('catalogSync.failed'));
        } else {
          toast.success(t('catalogSync.complete'));
        }
      }

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
      setSyncing(false);
      seenRunningRef.current = false;
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [baseUrl, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Idle: every 15s. While down-sync runs (or waiting to observe it): every 800ms.
  useEffect(() => {
    if (!baseUrl) return;
    const ms = syncing ? 800 : 15_000;
    const id = window.setInterval(() => { void refresh({ quiet: true }); }, ms);
    return () => window.clearInterval(id);
  }, [baseUrl, refresh, syncing]);

  const syncNow = async () => {
    if (!baseUrl || !downloadEnabled || syncing) return;
    // Optimistic UI only — do NOT mark seenRunning until /stats reports running.
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
        setSyncing(false);
        seenRunningRef.current = false;
        return;
      }
      // Progress bar + final toast come from /stats polling; no queued toast.
      await refresh({ quiet: true });
    } catch {
      toast.error(t('catalogSync.failed'));
      setSyncing(false);
      seenRunningRef.current = false;
    }
  };

  if (!baseUrl) return null;

  const localVersion = catalog?.localVersion ?? 0;
  const remoteVersion = catalog?.remoteVersion ?? 0;
  const updateAvailable = downloadEnabled && remoteVersion > localVersion;
  const progress = catalog?.progress;
  const percent = showProgressPercent(progress, syncing);
  const showProgress = syncing || Boolean(progress?.running);
  const currentTable = progress?.currentTable || catalog?.syncing?.table || '';
  const completed = progress?.completedTables ?? 0;
  const total = progress?.totalTables ?? 0;

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
        ) : updateAvailable && !showProgress ? (
          <p className="text-warning font-medium">{t('catalogSync.updateAvailable')}</p>
        ) : downloadEnabled && !showProgress ? (
          <p className="text-muted">{t('catalogSync.upToDate')}</p>
        ) : null}
        {catalog?.lastSynced?.recordId && !showProgress ? (
          <p className="text-muted text-xs">
            {t('catalogSync.lastSynced', {
              record: catalog.lastSynced.recordId,
              table: catalog.lastSynced.table || '',
            })}
          </p>
        ) : null}
      </div>

      {showProgress ? (
        <div className="mb-5 space-y-2" data-testid="catalog-sync-progress">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted">
              {currentTable
                ? t('catalogSync.progressTable', { table: currentTable })
                : t('catalogSync.syncing')}
            </span>
            <span className="font-medium tabular-nums">
              {t('catalogSync.progressCount', { completed, total, percent })}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded bg-neutral-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t('catalogSync.syncing')}
          >
            <div
              className="h-full rounded bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : null}

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
            disabled={loading || syncing}
            onClick={() => { void refresh(); }}
          >
            {t('catalogSync.refresh')}
          </Button>
        </div>
      </div>
    </div>
  );
};

function showProgressPercent(progress: CatalogProgress | null | undefined, syncing: boolean): number {
  if (progress?.running) {
    return Math.max(0, Math.min(100, Number(progress.percent) || 0));
  }
  // Waiting for first /stats after Sync now — show indeterminate-looking 0%.
  if (syncing) return 0;
  return Math.max(0, Math.min(100, Number(progress?.percent) || 0));
}
